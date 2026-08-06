import { sessionStore } from '../stores/session.js';
import { gameStateStore } from '../stores/gameState.js';
import { actionsStore } from '../stores/actions.js';
import { requestsStore } from '../stores/requests.js';
import { timelineStore } from '../stores/timeline.js';
import { communicationsStore } from '../stores/communications.js';
import { database } from '../services/database.js';
import { createLogger } from '../utils/logger.js';
import { formatRelativeTime } from '../utils/formatting.js';
import { showToast } from '../components/ui/Toast.js';
import { showLoader, hideLoader } from '../components/ui/Loader.js';
import { confirmModal, showModal } from '../components/ui/Modal.js';
import { buildAppPath, navigateToApp } from '../core/navigation.js';
import { getRoleRoute, resolveTeamContext } from '../core/teamContext.js';
import {
    isAdjudicatedAction,
    isDraftAction,
    isSubmittedAction
} from '../core/enums.js';
import { isWhiteCellCommunicationVisibleToScribe } from '../features/communications/targeting.js';
import { getArtifactLifecycleViewModel } from '../features/actions/artifactLifecycle.js';
import { createArtifactLifecycleBadge, createBadge } from '../components/ui/Badge.js';
import { groupActionRecordsByMark } from '../features/actions/actionMarkRail.js';
import {
    BLUE_ACTION_COORDINATED_OPTIONS,
    BLUE_ACTION_INFORMED_OPTIONS,
    BLUE_ACTION_SCRIBE_HANDOFF,
    formatActionSequenceLabel,
    formatBlueActionSelection,
    getActionSequenceNumber,
    getBlueActionViewModel,
    isBlueActionForwardedToScribe,
    serializeBlueActionDetails
} from '../features/actions/blueActionDetails.js';
import {
    STRATEGIC_ORIENTATION_PERIOD,
    getStrategicOrientationViewModel,
    isStrategicOrientationAction,
    isStrategicOrientationForwardedToScribe
} from '../features/actions/strategicOrientationDetails.js';
import {
    PROPOSAL_RECIPIENT_STATUSES,
    formatProposalRecipientStatus,
    getProposalRecipientEntry,
    getProposalRecipientStatus,
    isProposalNegotiationRequest,
    isProposalRecipientFinal
} from '../features/actions/proposalRecipientState.js';
import {
    formatProposalRecipientTeams,
    getProposalViewModel,
    isProposalAction,
    isProposalForwardedToScribe
} from '../features/actions/proposalDetails.js';
import {
    buildDefaultScribeDeckPath,
    DEFAULT_SCRIBE_DECK_LABEL,
    DEFAULT_SCRIBE_DECK_PATH,
    expandScribeDeckSections,
    flattenScribeDeckSlides,
    getScribeDeckAssignmentDetails,
    getSectionIndexForSlideKey,
    parseScribeDeckHtml,
    SCRIBE_DECK_SOURCE_REPO,
    SCRIBE_DECK_SOURCE_UPLOAD
} from '../features/scribe/deckConfig.js';
import { getUploadedScribeDeck } from '../features/scribe/deckStorage.js';
import { mountFollowAlong } from '../features/onboarding/followAlong.js';
import { createRfiForm } from '../features/requests/RfiForm.js';
import { getUserMessage } from '../core/errors.js';

const logger = createLogger('Scribe');
const ACTIONS_SECTION_ID = 'actions';
const PROPOSALS_SECTION_ID = 'proposals';
const RFIS_SECTION_ID = 'rfis';
const COMMUNICATIONS_SECTION_ID = 'direct-communications';
const LIVE_SECTION_IDS = Object.freeze([
    ACTIONS_SECTION_ID,
    PROPOSALS_SECTION_ID,
    RFIS_SECTION_ID,
    COMMUNICATIONS_SECTION_ID
]);

function serializeActionRenderState(value) {
    if (Array.isArray(value)) {
        return `[${value.map((entry) => serializeActionRenderState(entry)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${serializeActionRenderState(value[key])}`)
            .join(',')}}`;
    }

    return JSON.stringify(value);
}

function serializeTeamActionRenderState(actions = []) {
    return serializeActionRenderState([...actions].sort((left, right) => (
        String(left?.id || '').localeCompare(String(right?.id || ''))
    )));
}

export const FACILITATOR_PROPOSAL_DECISIONS = Object.freeze({
    ACCEPT: 'accept',
    NOT_INTERESTED: 'not_interested',
    NEGOTIATE: 'negotiate'
});

export function getFacilitatorProposalDecisionContract(decision = '', negotiationTerms = '') {
    return {
        [FACILITATOR_PROPOSAL_DECISIONS.ACCEPT]: {
            status: PROPOSAL_RECIPIENT_STATUSES.RESPONDED,
            label: 'Accepted',
            responseContent: 'Accepted',
            timelineType: 'PROPOSAL_RESPONDED'
        },
        [FACILITATOR_PROPOSAL_DECISIONS.NOT_INTERESTED]: {
            status: PROPOSAL_RECIPIENT_STATUSES.DECLINED,
            label: 'Not Interested',
            responseContent: 'Not Interested',
            timelineType: 'PROPOSAL_DECLINED'
        },
        [FACILITATOR_PROPOSAL_DECISIONS.NEGOTIATE]: {
            status: PROPOSAL_RECIPIENT_STATUSES.RESPONDED,
            label: 'Negotiation requested',
            responseContent: String(negotiationTerms || '').trim(),
            timelineType: 'PROPOSAL_RESPONDED'
        }
    }[decision] || null;
}
const DIALOG_FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

export function getFocusableDialogElements(container) {
    if (!container?.querySelectorAll) {
        return [];
    }

    return Array.from(container.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR))
        .filter((element) => !element.hidden && element.getAttribute?.('aria-hidden') !== 'true');
}

export function parseFacilitatorDeckHtml(html = '') {
    return parseScribeDeckHtml(html);
}

export function getScribeAccessState({
    role,
    teamContext,
    observerTeamId = null
}) {
    if (role === teamContext.scribeRole) {
        return {
            allowed: true,
            reason: null,
            redirectRoute: null
        };
    }

    if (role === 'viewer' && observerTeamId === teamContext.teamId) {
        return {
            allowed: false,
            reason: 'observer-route',
            redirectRoute: teamContext.observerRoute
        };
    }

    if (role === 'viewer') {
        return {
            allowed: false,
            reason: 'observer-team-mismatch',
            redirectRoute: observerTeamId
                ? getRoleRoute('viewer', { observerTeamId })
                : ''
        };
    }

    if (role === teamContext.facilitatorRole) {
        return {
            allowed: false,
            reason: 'facilitator-route',
            redirectRoute: teamContext.facilitatorRoute
        };
    }

    return {
        allowed: false,
        reason: 'role-mismatch',
        redirectRoute: getRoleRoute(role, { observerTeamId }) || ''
    };
}

async function fetchScribeDeckSlides(deckPath = DEFAULT_SCRIBE_DECK_PATH) {
    const response = await fetch(buildAppPath(deckPath), {
        credentials: 'same-origin'
    });

    if (!response.ok) {
        throw new Error(`Support deck fetch failed with status ${response.status}.`);
    }

    return parseFacilitatorDeckHtml(await response.text());
}

export function resolveAssignedScribeDeck(
    communications = [],
    teamContext = resolveTeamContext()
) {
    const defaultDeckPath = buildDefaultScribeDeckPath(teamContext.teamId);
    const defaultAssignment = {
        communicationId: null,
        deckSource: SCRIBE_DECK_SOURCE_REPO,
        deckStorageKey: null,
        deckFileName: null,
        deckPath: defaultDeckPath,
        deckLabel: DEFAULT_SCRIBE_DECK_LABEL,
        assignedAt: null
    };

    for (const communication of communications) {
        if (!isWhiteCellCommunicationVisibleToScribe(communication, teamContext)) {
            continue;
        }

        const assignment = getScribeDeckAssignmentDetails(communication);
        if (!assignment || assignment.recipientTeam !== teamContext.teamId) {
            continue;
        }

        return assignment;
    }

    return defaultAssignment;
}

function isEditableTarget(element) {
    const tagName = element?.tagName?.toUpperCase?.() || '';
    return tagName === 'INPUT'
        || tagName === 'TEXTAREA'
        || tagName === 'SELECT'
        || element?.isContentEditable === true;
}

function clampSlideIndex(slides = [], index = 0) {
    if (!slides.length) {
        return 0;
    }

    return Math.min(Math.max(index, 0), slides.length - 1);
}

function escapeHtml(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

function normalizeActionTimestamp(action = {}) {
    const timestamp = action.submitted_at
        || action.updated_at
        || action.created_at
        || '';
    const parsed = new Date(timestamp).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function sortTeamActions(actions = []) {
    return [...actions]
        .filter(Boolean)
        .sort((left, right) => {
            const moveDelta = (left?.move || 0) - (right?.move || 0);
            if (moveDelta !== 0) {
                return moveDelta;
            }

            const timestampDelta = normalizeActionTimestamp(left) - normalizeActionTimestamp(right);
            if (timestampDelta !== 0) {
                return timestampDelta;
            }

            return String(left?.id || '').localeCompare(String(right?.id || ''));
        });
}

function getSlideKey(slide = null) {
    if (!slide) {
        return '';
    }

    if (slide.slideKey) {
        return slide.slideKey;
    }

    if (Number.isFinite(slide.n)) {
        return `deck-${slide.n}`;
    }

    return '';
}

function buildActionPlaceholderSlide({
    teamLabel = 'Team'
} = {}) {
    return {
        slideKey: 'actions-placeholder',
        slideType: 'action-placeholder',
        title: `Awaiting ${teamLabel} scribe decisions`,
        sidebarOrdinal: '0',
        sidebarKicker: 'No live action slides yet',
        summary: 'Scribe-forwarded drafts, facilitator submissions, and White Cell updates will appear here as follow-along briefing slides for the team facilitator.'
    };
}

function getActionSlideLifecycleLabel(action = {}) {
    return getArtifactLifecycleViewModel(getActionSlideLifecycleArtifact(action)).label;
}

function getActionSlideLifecycleArtifact(action = {}) {
    return isDraftAction(action) && !action.workflow_state && !action.canonical_workflow_state
        ? { ...action, canonical_workflow_state: 'forwarded_to_facilitator' }
        : action;
}

function isScribeVisibleAction(action = {}) {
    return !isDraftAction(action)
        || isBlueActionForwardedToScribe(action)
        || isStrategicOrientationForwardedToScribe(action)
        || isProposalForwardedToScribe(action);
}

export function buildScribeActionSlides(actions = [], {
    teamLabel = 'Team'
} = {}) {
    const sortedActions = sortTeamActions(actions.filter(isScribeVisibleAction));
    const sequencedActions = sortedActions.filter((action) => (
        !isStrategicOrientationAction(action) && !isProposalAction(action)
    ));

    if (!sortedActions.length) {
        return {
            slideCount: 0,
            slides: [buildActionPlaceholderSlide({ teamLabel })]
        };
    }

    const slides = sortedActions.map((action, index) => {
        const strategicOrientation = getStrategicOrientationViewModel(action);
        const isStrategicOrientationSlide = strategicOrientation.hasStrategicOrientationDetails;
        const proposalViewModel = isStrategicOrientationSlide
            ? null
            : getProposalViewModel(action);
        const isOwnProposalSlide = Boolean(proposalViewModel?.hasProposalDetails);
        const actionViewModel = isStrategicOrientationSlide || isOwnProposalSlide
            ? null
            : getBlueActionViewModel(action);
        const actionNumber = isStrategicOrientationSlide || isOwnProposalSlide
            ? null
            : (getActionSequenceNumber(sequencedActions, action) || sequencedActions.indexOf(action) + 1 || index + 1);
        const sequenceLabel = formatActionSequenceLabel({
            teamLabel,
            move: action.move || 1,
            actionNumber
        });
        const recipientLabel = proposalViewModel?.recipientTeam === 'red'
            ? 'Red'
            : (proposalViewModel?.recipientTeam === 'blue' ? 'Blue' : 'Recipient');

        return {
            slideKey: `action-${action.id}`,
            slideType: isStrategicOrientationSlide
                ? 'strategic-orientation'
                : (isOwnProposalSlide ? 'own-proposal' : 'action'),
            action,
            actionViewModel,
            strategicOrientation,
            proposalViewModel: isOwnProposalSlide ? proposalViewModel : null,
            title: isStrategicOrientationSlide
                ? strategicOrientation.title
                : (isOwnProposalSlide ? proposalViewModel.title : actionViewModel.title),
            sidebarOrdinal: isStrategicOrientationSlide
                ? 'SO'
                : (isOwnProposalSlide ? 'P' : String(actionNumber)),
            sidebarKicker: isStrategicOrientationSlide
                ? `${getActionSlideLifecycleLabel(action)} | Pre-Move 1 | ${strategicOrientation.isForecast ? 'Forecast' : 'Selection'}`
                : (isOwnProposalSlide
                    ? `${getActionSlideLifecycleLabel(action)} | Proposal → ${recipientLabel}`
                    : `${getActionSlideLifecycleLabel(action)} | ${sequenceLabel}`)
        };
    });

    return {
        slideCount: slides.length,
        slides
    };
}

function buildActionSection(actions = [], {
    teamLabel = 'Team'
} = {}) {
    const actionSlides = buildScribeActionSlides(actions, { teamLabel });

    return {
        id: ACTIONS_SECTION_ID,
        label: 'Actions',
        description: 'Live scribe-forwarded drafts, facilitator submissions, and White Cell deliberation updates for the facilitator seat.',
        slideCount: actionSlides.slideCount,
        slides: actionSlides.slides
    };
}

function getProposalSnapshot(communication = {}) {
    const metadata = communication?.metadata && typeof communication.metadata === 'object'
        ? communication.metadata
        : {};
    const proposal = metadata.proposal && typeof metadata.proposal === 'object'
        ? metadata.proposal
        : {};

    return {
        metadata,
        proposal,
        title: proposal.title || communication.title || 'Untitled proposal',
        sourceTeam: metadata.source_team || 'unknown'
    };
}

function normalizeProposalTimestamp(communication = {}) {
    const timestamp = communication.created_at || '';
    const parsed = new Date(timestamp).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

export function buildFacilitatorProposalSlides(communications = [], {
    teamContext = resolveTeamContext()
} = {}) {
    const proposals = [...(communications || [])]
        .filter((communication) => (
            communication?.type === 'PROPOSAL_FORWARDED'
            && isWhiteCellCommunicationVisibleToScribe(communication, teamContext)
        ))
        .sort((left, right) => (
            normalizeProposalTimestamp(right) - normalizeProposalTimestamp(left)
            || String(left?.id || '').localeCompare(String(right?.id || ''))
        ));

    if (!proposals.length) {
        return {
            slideCount: 0,
            slides: [{
                slideKey: 'proposals-placeholder',
                slideType: 'proposal-placeholder',
                title: 'No proposals received yet',
                sidebarOrdinal: '0',
                sidebarKicker: 'Awaiting proposals',
                summary: 'Proposals forwarded by White Cell from other teams will remain available here for projection and response.'
            }]
        };
    }

    return {
        slideCount: proposals.length,
        slides: proposals.map((communication, index) => {
            const snapshot = getProposalSnapshot(communication);
            const status = getProposalRecipientStatus(communication);
            return {
                slideKey: `proposal-${communication.id}`,
                slideType: 'proposal',
                communication,
                title: snapshot.title,
                sidebarOrdinal: String(index + 1),
                sidebarKicker: `From ${formatTeamLabel(snapshot.sourceTeam)} | ${formatProposalRecipientStatus(status)}`
            };
        })
    };
}

function buildProposalSection(communications = [], {
    teamContext = resolveTeamContext()
} = {}) {
    const proposalSlides = buildFacilitatorProposalSlides(communications, { teamContext });

    return {
        id: PROPOSALS_SECTION_ID,
        label: 'Proposals',
        description: 'White Cell-reviewed proposals received from other teams for facilitator projection and response.',
        slideCount: proposalSlides.slideCount,
        slides: proposalSlides.slides
    };
}

function normalizeRecordTimestamp(record = {}) {
    const parsed = new Date(record.updated_at || record.responded_at || record.created_at || '').getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

export function buildFacilitatorRfiSlides(requests = [], { teamId = '' } = {}) {
    const rfis = [...(requests || [])]
        .filter((request) => request?.team === teamId)
        .sort((left, right) => (
            normalizeRecordTimestamp(right) - normalizeRecordTimestamp(left)
            || String(left?.id || '').localeCompare(String(right?.id || ''))
        ));

    if (!rfis.length) {
        return {
            slideCount: 0,
            slides: [{
                slideKey: 'rfis-placeholder',
                slideType: 'rfi-placeholder',
                title: 'No RFIs sent yet',
                sidebarOrdinal: '0',
                sidebarKicker: 'Ask White Cell',
                summary: 'Submit a request for information when the team needs a ruling, clarification, or scenario detail.'
            }]
        };
    }

    return {
        slideCount: rfis.length,
        slides: rfis.map((request, index) => ({
            slideKey: `rfi-${request.id}`,
            slideType: 'rfi',
            request,
            title: request.query || request.question || `RFI ${index + 1}`,
            sidebarOrdinal: String(index + 1),
            sidebarKicker: request.workflow_state === 'returned_to_team'
                ? 'Returned for clarification'
                : request.status === 'answered'
                    ? 'Answered'
                    : request.workflow_state === 'resubmitted'
                        ? 'Resubmitted'
                        : 'Pending White Cell'
        }))
    };
}

function buildRfiSection(requests = [], { teamId = '' } = {}) {
    const rfiSlides = buildFacilitatorRfiSlides(requests, { teamId });
    return {
        id: RFIS_SECTION_ID,
        label: 'RFIs',
        description: 'Facilitator-owned requests for information and their complete revision-aware history.',
        slideCount: rfiSlides.slideCount,
        slides: rfiSlides.slides
    };
}

function isWhiteCellRole(role = '') {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized === 'white_cell' || normalized === 'whitecell' || normalized.startsWith('whitecell_');
}

export function isFacilitatorDirectCommunication(communication = {}, teamContext = {}) {
    const type = String(communication?.type || '').trim().toUpperCase();
    if (type === 'PROPOSAL_FORWARDED' || type === 'PROPOSAL_RESPONSE') {
        return false;
    }

    const isOutbound = communication?.from_role === teamContext.scribeRole
        && String(communication?.to_role || '').trim().toLowerCase() === 'white_cell';
    const isInbound = isWhiteCellRole(communication?.from_role)
        && isWhiteCellCommunicationVisibleToScribe(communication, teamContext);

    return isOutbound || isInbound;
}

export function buildFacilitatorCommunicationSlides(communications = [], {
    teamContext = resolveTeamContext()
} = {}) {
    const messages = [...(communications || [])]
        .filter((communication) => isFacilitatorDirectCommunication(communication, teamContext))
        .sort((left, right) => (
            normalizeRecordTimestamp(right) - normalizeRecordTimestamp(left)
            || String(left?.id || '').localeCompare(String(right?.id || ''))
        ));

    if (!messages.length) {
        return {
            slideCount: 0,
            slides: [{
                slideKey: 'communications-placeholder',
                slideType: 'communication-placeholder',
                title: 'No direct communications yet',
                sidebarOrdinal: '0',
                sidebarKicker: 'Message White Cell',
                summary: 'Send a direct text message to White Cell and keep the full inbound and outbound thread here.'
            }]
        };
    }

    return {
        slideCount: messages.length,
        slides: messages.map((communication, index) => ({
            slideKey: `communication-${communication.id}`,
            slideType: 'communication',
            communication,
            title: communication.title || communication.content || `Communication ${index + 1}`,
            sidebarOrdinal: String(index + 1),
            sidebarKicker: communication.from_role === teamContext.scribeRole
                ? 'Sent to White Cell'
                : 'From White Cell'
        }))
    };
}

function buildCommunicationSection(communications = [], { teamContext = resolveTeamContext() } = {}) {
    const communicationSlides = buildFacilitatorCommunicationSlides(communications, { teamContext });
    return {
        id: COMMUNICATIONS_SECTION_ID,
        label: 'Communications',
        description: 'Session-scoped direct text history between this Facilitator and White Cell.',
        slideCount: communicationSlides.slideCount,
        slides: communicationSlides.slides
    };
}

function formatTeamLabel(team = '') {
    switch (String(team || '').trim().toLowerCase()) {
    case 'blue': return 'Blue Team';
    case 'red': return 'Red Team';
    case 'green': return 'Green Team';
    case 'industry': return 'Industry Team';
    default: return team || 'Another team';
    }
}

function getLiveSlideTypeClass(slide = {}) {
    if (slide.slideType === 'strategic-orientation') {
        return ' is-action is-orientation';
    }

    if (slide.slideType === 'proposal' || slide.slideType === 'proposal-placeholder') {
        return ' is-proposal';
    }

    if (slide.slideType === 'rfi' || slide.slideType === 'rfi-placeholder') {
        return ' is-rfi';
    }

    if (slide.slideType === 'communication' || slide.slideType === 'communication-placeholder') {
        return ' is-communication';
    }

    return slide.slideType !== 'image' ? ' is-action' : '';
}

function hasDistinctActionText(primary = '', secondary = '') {
    const normalizeText = (value) => String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const normalizedSecondary = normalizeText(secondary);

    return Boolean(normalizedSecondary) && normalizeText(primary) !== normalizedSecondary;
}

function renderActionSlideGlanceCard({
    label = '',
    value = '',
    support = ''
} = {}) {
    return `
        <article class="scribe-action-slide-glance-card">
            <p class="scribe-action-slide-glance-label">${escapeHtml(label)}</p>
            <p class="scribe-action-slide-glance-value">${escapeHtml(value)}</p>
            ${support ? `<p class="scribe-action-slide-glance-support">${escapeHtml(support)}</p>` : ''}
        </article>
    `;
}

function normalizeScribeDecision(value = '') {
    const normalizedValue = String(value || '').trim().toLowerCase();

    if (normalizedValue === 'yes') {
        return 'yes';
    }

    if (normalizedValue === 'no') {
        return 'no';
    }

    return '';
}

function formatScribeDecision(value = '') {
    return normalizeScribeDecision(value) === 'yes' ? 'Yes'
        : (normalizeScribeDecision(value) === 'no' ? 'No' : '');
}

function buildScribeControlId(actionId = '', group = '', suffix = '') {
    const safeActionId = String(actionId || 'action').replace(/[^a-z0-9]+/gi, '-');
    const safeSuffix = String(suffix || 'option').replace(/[^a-z0-9]+/gi, '-');
    return `scribe-${safeActionId}-${group}-${safeSuffix}`;
}

function isScribeOptionSelected(value = '', selectedValues = []) {
    if (selectedValues.includes(value)) {
        return true;
    }

    const aliases = {
        Industry: ['Corporate'],
        Allies: ['Allied']
    };

    return (aliases[value] || []).some((alias) => selectedValues.includes(alias));
}

function renderScribeDecisionRadio({
    actionId = '',
    group = '',
    value = '',
    label = '',
    checked = false
} = {}) {
    const optionId = buildScribeControlId(actionId, group, value);

    return `
        <label class="scribe-action-slide-radio" for="${escapeHtml(optionId)}">
            <input
                id="${escapeHtml(optionId)}"
                type="radio"
                name="scribe-${escapeHtml(String(actionId || 'action'))}-${escapeHtml(group)}"
                value="${escapeHtml(value)}"
                data-scribe-action-radio="${escapeHtml(group)}"
                ${checked ? 'checked' : ''}
            >
            <span>${escapeHtml(label)}</span>
        </label>
    `;
}

function renderScribeActionCheckboxes({
    actionId = '',
    group = '',
    values = [],
    selectedValues = [],
    disabled = false
} = {}) {
    return values.map((value) => {
        const optionId = buildScribeControlId(actionId, group, value);
        const isChecked = isScribeOptionSelected(value, selectedValues);

        return `
            <label class="scribe-action-slide-check" for="${escapeHtml(optionId)}">
                <input
                    id="${escapeHtml(optionId)}"
                    type="checkbox"
                    value="${escapeHtml(value)}"
                    data-scribe-action-checkbox="${escapeHtml(group)}"
                    ${isChecked ? 'checked' : ''}
                    ${disabled ? 'disabled' : ''}
                >
                <span>${escapeHtml(value)}</span>
            </label>
        `;
    }).join('');
}

function renderPresentationBinaryChoice({
    actionId = '',
    group = '',
    label = '',
    decision = '',
    disabled = false
} = {}) {
    const normalizedDecision = normalizeScribeDecision(decision);
    const groupLabelId = buildScribeControlId(actionId, `presentation-${group}`, 'label');

    return `
        <div class="scribe-presentation-toolbar-choice">
            <span id="${escapeHtml(groupLabelId)}" class="scribe-presentation-toolbar-choice-label">${escapeHtml(label)}</span>
            <div class="scribe-presentation-toolbar-binary" role="radiogroup" aria-labelledby="${escapeHtml(groupLabelId)}">
                ${['yes', 'no'].map((value) => {
        const optionId = buildScribeControlId(actionId, `presentation-${group}`, value);
        return `
                    <label for="${escapeHtml(optionId)}">
                        <input
                            id="${escapeHtml(optionId)}"
                            type="radio"
                            name="scribe-presentation-${escapeHtml(String(actionId || 'action'))}-${escapeHtml(group)}"
                            value="${value}"
                            data-scribe-presentation-radio="${escapeHtml(group)}"
                            ${normalizedDecision === value ? 'checked' : ''}
                            ${disabled ? 'disabled' : ''}
                        >
                        <span>${value === 'yes' ? 'Yes' : 'No'}</span>
                    </label>
                `;
    }).join('')}
            </div>
        </div>
    `;
}

function buildScribeSubmissionMetadata(selections = {}) {
    const coordinatedValues = selections.coordinatedValues || [];
    const informedValues = selections.informedValues || [];

    return {
        coordinated: {
            decision: formatScribeDecision(selections.coordinatedDecision),
            legislative: coordinatedValues.includes('Legislative'),
            executive: coordinatedValues.includes('Executive')
        },
        informed_engaged: {
            decision: formatScribeDecision(selections.informedEngagedDecision),
            industry: informedValues.includes('Industry'),
            allies: informedValues.includes('Allies')
        }
    };
}

function getActionSlideAnnouncementLabel(action = {}) {
    if (isStrategicOrientationAction(action)) {
        if (isDraftAction(action)) {
            return 'Forwarded Strategic Orientation artifact';
        }

        if (isAdjudicatedAction(action)) {
            return 'Reviewed Strategic Orientation artifact';
        }

        if (isSubmittedAction(action)) {
            return 'Submitted Strategic Orientation artifact';
        }

        return 'Strategic Orientation artifact';
    }

    if (isDraftAction(action)) {
        return 'Forwarded action';
    }

    if (isAdjudicatedAction(action)) {
        return 'Reviewed action';
    }

    if (isSubmittedAction(action)) {
        return 'Submitted action';
    }

    return 'Action';
}

export function setScribePresentationMode({
    isActive = false,
    body = document.body,
    presentButton = document.getElementById('presentBtn'),
    sidebar = document.getElementById('sidebar'),
    overlay = document.getElementById('sidebarOverlay')
} = {}) {
    if (!body) {
        return;
    }

    body.dataset.scribePresentation = isActive ? 'active' : 'standard';

    if (presentButton) {
        presentButton.textContent = isActive ? 'Exit Present' : 'Present';
        presentButton.setAttribute('aria-pressed', String(isActive));
    }

    if (isActive) {
        sidebar?.classList.remove('sidebar-open');
        overlay?.classList.remove('sidebar-overlay-visible');
    }
}

const SIDEBAR_COLLAPSED_KEY = 'scribe.sidebar.collapsed';
const MOBILE_SIDEBAR_QUERY = '(max-width: 768px)';

export class ScribeController {
    constructor() {
        this.role = sessionStore.getRole();
        this.teamContext = resolveTeamContext();
        this.teamId = this.teamContext.teamId;
        this.teamLabel = this.teamContext.teamLabel;
        this.facilitatorDeckSlides = [];
        this.teamActions = [];
        this.receivedProposals = [];
        this.teamRfis = [];
        this.directCommunications = [];
        this.sections = [];
        this.deckSlides = [];
        this.expandedSectionIds = new Set();
        this.sectionExpansionInitialized = false;
        this.activeDeckSource = SCRIBE_DECK_SOURCE_REPO;
        this.activeDeckStorageKey = null;
        this.activeDeckFileName = null;
        this.activeDeckPath = buildDefaultScribeDeckPath(this.teamId);
        this.activeDeckLabel = DEFAULT_SCRIBE_DECK_LABEL;
        this.activeDeckAssignmentId = null;
        this.currentSlideIndex = 0;
        this.activeSectionIndex = 0;
        this.lastDeckSlideKey = '';
        this.storeUnsubscribers = [];
        // Navbar activity feed (visible even in presentation mode)
        this.notifications = [];
        this.unreadNotifications = 0;
        this.notificationSeq = 0;
        this.alertsOpen = false;
        this.alertsReturnFocus = null;
        this.knownCommunicationIds = new Set();
        this.authoredProposalStateByCommunicationId = new Map();
        this.actionStatusById = new Map();
        this.actionVisibleById = new Map();
        this.communicationsSeeded = false;
        this.actionsSeeded = false;
        this.collapsedStrategicActionIds = new Set();
        this.presentationEditActionId = null;
        this.presentationEditHost = null;
    }

    async init() {
        logger.info('Initializing Facilitator support deck');

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({
                message: 'No session found. Please join a session first.',
                type: 'error'
            });
            setTimeout(() => {
                navigateToApp('');
            }, 2000);
            return;
        }

        this.role = sessionStore.getRole() || sessionStore.getSessionData()?.role;
        const observerTeamId = sessionStore.getSessionData()?.team || null;
        const accessState = getScribeAccessState({
            role: this.role,
            teamContext: this.teamContext,
            observerTeamId
        });

        if (!accessState.allowed) {
            const message = accessState.reason === 'observer-team-mismatch'
                ? 'Observer access is limited to the team selected when you joined the session.'
                : `This page is only available to the ${this.teamContext.scribeLabel} role.`;

            showToast({
                message,
                type: 'error'
            });

            navigateToApp(accessState.redirectRoute || '', { replace: true });
            return;
        }

        this.configureShell();
        this.bindEventListeners();
        this.subscribeToLiveData();
        this.primeNotifications();
        this.syncDeckAssignmentFromStore({ reload: false });
        this.syncProposalsFromStore();
        this.syncRfisFromStore();
        this.syncCommunicationsFromStore();
        await this.loadDeck();
        this.syncActionsFromStore();
        this.mountFollowAlongOnboarding();

        logger.info('Facilitator support deck initialized');
    }

    mountFollowAlongOnboarding() {
        const liveTrackerHighlights = ['#header-game-state', '#header-timer'];
        this.onboarding = mountFollowAlong({
            storageKey: `followalong:scribe:${this.teamId}`,
            title: `${this.teamContext.scribeLabel} guide`,
            steps: [
                {
                    title: this.teamContext.scribeLabel,
                    body: `Use this surface to follow ${this.teamLabel}'s support deck and keep the room aligned on live decisions.`
                },
                {
                    title: 'Follow move, phase, and timer',
                    body: 'The header shows Strategic Orientation before Move 1, then the live move, phase, countdown timer, and paused or running state so the projected deck stays in sync with the room.',
                    highlight: liveTrackerHighlights
                },
                {
                    title: 'Navigate the support deck',
                    body: 'Switch between Team Action Review and Deck. Actions appear first in the sidebar, followed by a persistent Proposals section for received proposals. Returning to Deck restores the support slide you last viewed.',
                    highlight: '.scribe-view-switch'
                },
                {
                    title: 'Project and answer proposals',
                    body: 'Open Proposals below Actions to project proposals forwarded from other teams. Record one response for each proposal: Accept, Not Interested, or Negotiate.',
                    highlight: '.scribe-section-region--proposals'
                },
                {
                    title: 'Ask White Cell with RFIs',
                    body: 'Open RFIs to send a new question. If White Cell returns one for clarification, edit and resubmit the same revision here.',
                    highlight: '.scribe-section-region--rfis'
                },
                {
                    title: 'Message White Cell',
                    body: 'Open Communications to send direct text to White Cell and review the isolated inbound and outbound history.',
                    highlight: '.scribe-section-region--communications'
                },
                {
                    title: 'Watch activity',
                    body: 'The activity bell surfaces newly submitted actions, deck changes, and White Cell communications.',
                    highlight: '#scribeAlertsBtn'
                },
                {
                    title: 'Present to the room',
                    body: 'Use Present when this screen is projected. It hides sidebar chrome, keeps the current slide centered, and adds the facilitator toolbar for editing, coordination, engagement, and White Cell forwarding.',
                    highlight: '#presentBtn'
                },
                {
                    title: 'Revisit this guide',
                    body: 'This guide stays above the session label. Collapse it when you need space, then reopen it here later.',
                    highlight: '.sidebar-session'
                }
            ]
        });
    }

    configureShell() {
        document.body.dataset.roleSurface = 'scribe';
        document.body.dataset.scribeDeckState = 'loading';
        setScribePresentationMode({ isActive: false });
        this.restoreSidebarState();

        const roleLabel = document.getElementById('sessionRoleLabel');
        const headerTitle = document.querySelector('.header-title');

        if (roleLabel) {
            roleLabel.textContent = 'Facilitator';
        }

        if (headerTitle) {
            headerTitle.textContent = `Statecraft Sim | ${this.teamLabel} Facilitator`;
        }
    }

    bindEventListeners() {
        document.getElementById('prevSlideBtn')?.addEventListener('click', () => {
            this.setSlideByIndex(this.currentSlideIndex - 1);
        });

        document.getElementById('nextSlideBtn')?.addEventListener('click', () => {
            this.setSlideByIndex(this.currentSlideIndex + 1);
        });

        document.getElementById('teamActionReviewViewBtn')?.addEventListener('click', () => {
            this.setFacilitatorView('actions');
        });

        document.getElementById('deckViewBtn')?.addEventListener('click', () => {
            this.setFacilitatorView('deck');
        });

        document.getElementById('presentBtn')?.addEventListener('click', () => {
            void this.togglePresentationMode();
        });

        document.getElementById('scribeAlertsBtn')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.setAlertsOpen(!this.alertsOpen, { trigger: event.currentTarget });
        });

        document.getElementById('scribeAlertsClear')?.addEventListener('click', () => {
            this.notifications = [];
            this.unreadNotifications = 0;
            this.renderAlerts();
        });

        document.getElementById('scribeAlertsClose')?.addEventListener('click', () => {
            this.setAlertsOpen(false);
        });

        document.getElementById('scribeAlertsList')?.addEventListener('click', (event) => {
            const item = event.target.closest('[data-slide-key]');
            if (!item) return;
            this.setSlideByKey(item.dataset.slideKey || '');
            this.setAlertsOpen(false);
        });

        document.addEventListener('click', (event) => {
            if (!this.alertsOpen) return;
            if (event.target.closest('#scribeAlerts')) return;
            this.setAlertsOpen(false);
        });

        document.addEventListener('keydown', (event) => this.handleAlertsKeydown(event));

        document.getElementById('deckRetryBtn')?.addEventListener('click', () => {
            void this.loadDeck();
        });

        const actionFrame = document.getElementById('deckActionFrame');
        actionFrame?.addEventListener('change', (event) => {
            if (event.target.closest('[data-scribe-presentation-radio]')) {
                const toolbar = event.target.closest('[data-scribe-presentation-toolbar]');
                this.updatePresentationActionToolbar(toolbar);
                return;
            }

            if (
                event.target.closest('[data-scribe-action-radio]')
                || event.target.closest('[data-scribe-action-checkbox]')
            ) {
                const panel = event.target.closest('[data-scribe-action-submit-panel]');
                this.updateScribeActionSubmitState(panel);
            }
        });
        actionFrame?.addEventListener('click', (event) => {
            const newRfiButton = event.target.closest('[data-facilitator-new-rfi]');
            if (newRfiButton) {
                this.showFacilitatorRfiModal();
                return;
            }

            const editRfiButton = event.target.closest('[data-facilitator-edit-rfi]');
            if (editRfiButton) {
                const request = this.teamRfis.find((rfi) => rfi.id === editRfiButton.dataset.rfiId);
                if (request) {
                    this.showFacilitatorRfiModal(request);
                }
                return;
            }

            const newCommunicationButton = event.target.closest('[data-facilitator-new-communication]');
            if (newCommunicationButton) {
                this.showFacilitatorCommunicationModal();
                return;
            }

            const proposalButton = event.target.closest('[data-facilitator-proposal-decision]');
            if (proposalButton) {
                this.handleFacilitatorProposalDecision(
                    proposalButton.dataset.proposalCommunicationId || '',
                    proposalButton.dataset.facilitatorProposalDecision || ''
                ).catch((error) => {
                    logger.error('Failed to record facilitator proposal decision:', error);
                });
                return;
            }

            const toggleButton = event.target.closest('[data-scribe-action-toggle]');
            if (toggleButton) {
                this.toggleStrategicActionCard(toggleButton.dataset.actionId || '');
                return;
            }

            const projectButton = event.target.closest('[data-scribe-action-project]');
            if (projectButton) {
                this.projectScribeAction(projectButton.dataset.actionId || '').catch((error) => {
                    logger.error('Failed to project facilitator action:', error);
                });
                return;
            }

            const editButton = event.target.closest('[data-scribe-action-edit]');
            if (editButton) {
                this.editProjectedAction(editButton.dataset.actionId || '').catch((error) => {
                    logger.error('Failed to open the projected action editor:', error);
                });
                return;
            }

            const submitButton = event.target.closest('[data-scribe-action-submit]');
            if (submitButton) {
                const panel = submitButton.closest('[data-scribe-action-submit-panel]');
                this.confirmSubmitScribeAction(submitButton.dataset.actionId || '', panel).catch((error) => {
                    logger.error('Failed to submit facilitator action:', error);
                });
            }
        });

        const sectionListEl = document.getElementById('scribeSectionList');
        sectionListEl?.addEventListener('click', (event) => {
            const slideButton = event.target.closest('[data-slide-key]');
            if (slideButton) {
                this.setSlideByKey(slideButton.dataset.slideKey || '');
                this.closeMobileSidebar();
                return;
            }

            const sectionButton = event.target.closest('[data-section-index]');
            if (sectionButton) {
                const sectionIndex = Number(sectionButton.dataset.sectionIndex);
                // Tapping a number in the collapsed rail expands the sidebar.
                if (this.isSidebarCollapsed() && !this.isMobileViewport()) {
                    this.setSidebarCollapsed(false);
                    this.expandSection(sectionIndex);
                    this.selectSection(sectionIndex);
                    return;
                }
                this.toggleSection(sectionIndex);
            }
        });
        // Section-rail tooltips (collapsed desktop only).
        sectionListEl?.addEventListener('pointerover', (event) => {
            const trigger = event.target.closest('.scribe-section-trigger');
            if (trigger) this.showRailTip(trigger);
        });
        sectionListEl?.addEventListener('pointerout', (event) => {
            if (event.target.closest('.scribe-section-trigger')) this.hideRailTip();
        });
        sectionListEl?.addEventListener('focusin', (event) => {
            const trigger = event.target.closest('.scribe-section-trigger');
            if (trigger) this.showRailTip(trigger);
        });
        sectionListEl?.addEventListener('focusout', () => this.hideRailTip());

        // Sidebar controls: desktop rail collapse + mobile drawer.
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            this.toggleSidebarCollapsed();
        });

        document.getElementById('menuToggle')?.addEventListener('click', () => {
            this.toggleMobileSidebar();
        });

        document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
            this.closeMobileSidebar();
        });

        window.addEventListener('resize', () => {
            this.hideRailTip();
            if (!this.isMobileViewport()) {
                this.closeMobileSidebar();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (isEditableTarget(event.target)) {
                return;
            }

            switch (event.key) {
            case 'ArrowLeft':
            case 'PageUp':
                event.preventDefault();
                this.setSlideByIndex(this.currentSlideIndex - 1);
                break;
            case 'ArrowRight':
            case 'PageDown':
                event.preventDefault();
                this.setSlideByIndex(this.currentSlideIndex + 1);
                break;
            case 'Home':
                event.preventDefault();
                this.setSlideByIndex(0);
                break;
            case 'End':
                event.preventDefault();
                this.setSlideByIndex(this.deckSlides.length - 1);
                break;
            case 'f':
            case 'F':
                event.preventDefault();
                document.getElementById('presentBtn')?.click();
                break;
            case 'Escape':
                this.closeMobileSidebar();
                break;
            default:
                break;
            }
        });

        document.addEventListener('fullscreenchange', () => {
            const isPresenting = this.isPresentationModeActive();
            const isFullscreenActive = Boolean(document.fullscreenElement);

            if (isFullscreenActive && !isPresenting) {
                setScribePresentationMode({ isActive: true });
            }

            if (!isFullscreenActive && isPresenting) {
                this.closePresentationEditPanel();
                setScribePresentationMode({ isActive: false });
            }
        });
    }

    subscribeToLiveData() {
        this.storeUnsubscribers.push(
            actionsStore.subscribe((event, data) => {
                this.syncActionsFromStore({ event, data });
            })
        );
        this.storeUnsubscribers.push(
            requestsStore.subscribe((event, data) => {
                this.syncRfisFromStore({ event, data });
            })
        );
        this.storeUnsubscribers.push(
            communicationsStore.subscribe((event, data) => {
                this.processCommunicationNotifications(event);
                this.syncDeckAssignmentFromStore({
                    reload: event === 'created'
                        || event === 'updated'
                        || event === 'initialized'
                        || event === 'loaded'
                        || event === 'reconciled'
                });
                this.syncProposalsFromStore({ event, data });
                this.syncCommunicationsFromStore({ event, data });
            })
        );
    }

    syncActionsFromStore({
        event = '',
        data = null
    } = {}) {
        const previousRenderState = serializeTeamActionRenderState(this.teamActions);
        const nextTeamActions = actionsStore.getByTeam(this.teamId);
        const teamActionsChanged = previousRenderState !== serializeTeamActionRenderState(nextTeamActions);

        this.teamActions = nextTeamActions;
        this.processActionNotification({ event, data });

        if (!this.facilitatorDeckSlides.length && !this.sections.length) {
            return;
        }

        // Live reconciliation can emit unchanged action snapshots when another
        // part of the session updates. Keep the active finalization form
        // mounted so transient radio and checkbox choices are not discarded.
        if (event && !teamActionsChanged) {
            return;
        }

        const shouldFocusDraftPreview = (
            (event === 'created' || event === 'updated')
            && data?.team === this.teamId
            && isDraftAction(data)
            && isScribeVisibleAction(data)
        );
        const preferredSlideKey = shouldFocusDraftPreview
            ? `action-${data.id}`
            : this.getCurrentSlideKey();
        const preferActionsSection = shouldFocusDraftPreview
            || this.sections[this.activeSectionIndex]?.id === ACTIONS_SECTION_ID;

        this.rebuildDeck({
            preferredSlideKey,
            preferActionsSection
        });

        if (this.deckSlides.length) {
            this.renderSlide();
        }
    }

    isPresentationModeActive() {
        return document.body?.dataset?.scribePresentation === 'active';
    }

    primeNotifications() {
        const communications = communicationsStore.getAll();
        this.knownCommunicationIds = new Set(
            communications.map((communication) => communication?.id).filter(Boolean)
        );
        this.seedAuthoredProposalStates(communications);
        // Role controllers can mount before live sync finishes its first store
        // load. Keep the feed unseeded in that case so the ensuing `loaded`
        // snapshot establishes history without replaying it as new activity.
        this.communicationsSeeded = communicationsStore.initialized;
        actionsStore.getByTeam(this.teamId).forEach((action) => {
            if (action?.id) {
                this.actionStatusById.set(action.id, action.status);
                this.actionVisibleById.set(action.id, isScribeVisibleAction(action));
            }
        });
        this.actionsSeeded = true;
        this.renderAlerts();
    }

    getTeamLabel(team = '') {
        switch (String(team).trim().toLowerCase()) {
        case 'blue': return 'Blue Team';
        case 'red': return 'Red Team';
        case 'green': return 'Green Team';
        case 'industry': return 'Industry Team';
        default: return team || 'Another team';
        }
    }

    isAuthoredProposalCommunication(communication = {}) {
        if (communication?.type !== 'PROPOSAL_FORWARDED') {
            return false;
        }

        const metadata = communication.metadata && typeof communication.metadata === 'object'
            ? communication.metadata
            : {};
        const sourceTeam = String(metadata.source_team || '').trim().toLowerCase();
        if (sourceTeam) {
            return sourceTeam === this.teamId;
        }

        return Boolean(
            metadata.source_proposal_id
            && this.teamActions.some((action) => action?.id === metadata.source_proposal_id)
        );
    }

    getAuthoredProposalStateFingerprint(communication = {}) {
        const recipientEntry = getProposalRecipientEntry(communication);
        return JSON.stringify({
            status: getProposalRecipientStatus(communication),
            decision: recipientEntry?.facilitator_decision || communication?.metadata?.facilitator_decision || '',
            response: recipientEntry?.response_content || '',
            actionedAt: recipientEntry?.responded_at
                || recipientEntry?.response_sent_at
                || recipientEntry?.actioned_at
                || ''
        });
    }

    seedAuthoredProposalStates(communications = []) {
        this.authoredProposalStateByCommunicationId.clear();
        communications
            .filter((communication) => this.isAuthoredProposalCommunication(communication))
            .forEach((communication) => {
                if (communication?.id) {
                    this.authoredProposalStateByCommunicationId.set(
                        communication.id,
                        this.getAuthoredProposalStateFingerprint(communication)
                    );
                }
            });
    }

    getAuthoredProposalCommunication(action = {}) {
        if (!action?.id) {
            return null;
        }

        return communicationsStore.getAll()
            .filter((communication) => (
                communication?.type === 'PROPOSAL_FORWARDED'
                && communication?.metadata?.source_proposal_id === action.id
            ))
            .sort((left, right) => {
                const leftAt = left?.updated_at || left?.created_at || '';
                const rightAt = right?.updated_at || right?.created_at || '';
                return new Date(rightAt) - new Date(leftAt);
            })[0] || null;
    }

    getAuthoredProposalResponseNotification(communication = {}) {
        if (!this.isAuthoredProposalCommunication(communication) || !isProposalRecipientFinal(communication)) {
            return null;
        }

        const metadata = communication.metadata && typeof communication.metadata === 'object'
            ? communication.metadata
            : {};
        const recipientEntry = getProposalRecipientEntry(communication);
        const status = getProposalRecipientStatus(communication);
        const decision = String(
            recipientEntry?.facilitator_decision || metadata.facilitator_decision || ''
        ).trim().toLowerCase();
        const recipientLabel = this.getTeamLabel(
            metadata.recipient_team || recipientEntry?.response_from_team || ''
        );
        const proposalTitle = metadata?.proposal?.title
            || this.teamActions.find((action) => action?.id === metadata.source_proposal_id)?.goal
            || 'Your proposal';
        const title = isProposalNegotiationRequest(communication)
            ? 'Negotiation requested'
            : (decision === FACILITATOR_PROPOSAL_DECISIONS.ACCEPT
                ? 'Proposal accepted'
                : (status === PROPOSAL_RECIPIENT_STATUSES.DECLINED
                    || decision === FACILITATOR_PROPOSAL_DECISIONS.NOT_INTERESTED
                    ? 'Proposal declined'
                    : 'Proposal response received'));
        const detail = isProposalNegotiationRequest(communication)
            ? `${recipientLabel} requested negotiation on "${proposalTitle}". Open the proposal to review the terms.`
            : (decision === FACILITATOR_PROPOSAL_DECISIONS.ACCEPT
                ? `${recipientLabel} accepted "${proposalTitle}". Open the proposal to review the decision.`
                : (status === PROPOSAL_RECIPIENT_STATUSES.DECLINED
                    || decision === FACILITATOR_PROPOSAL_DECISIONS.NOT_INTERESTED
                    ? `${recipientLabel} declined "${proposalTitle}". Open the proposal to review the decision.`
                    : `${recipientLabel} responded to "${proposalTitle}". Open the proposal to review the decision.`));

        return {
            kind: 'proposal',
            tone: 'proposal',
            title,
            detail,
            slideKey: metadata.source_proposal_id ? `action-${metadata.source_proposal_id}` : '',
            at: recipientEntry?.response_sent_at
                || recipientEntry?.responded_at
                || recipientEntry?.actioned_at
                || communication.updated_at
                || communication.created_at
                || null
        };
    }

    processAuthoredProposalStateNotifications(communications = []) {
        communications
            .filter((communication) => this.isAuthoredProposalCommunication(communication))
            .forEach((communication) => {
                if (!communication?.id) {
                    return;
                }

                const nextFingerprint = this.getAuthoredProposalStateFingerprint(communication);
                const previousFingerprint = this.authoredProposalStateByCommunicationId.get(communication.id);
                const isNewCommunication = !this.knownCommunicationIds.has(communication.id);
                this.authoredProposalStateByCommunicationId.set(communication.id, nextFingerprint);

                if (
                    (
                        (previousFingerprint !== undefined && previousFingerprint !== nextFingerprint)
                        || (previousFingerprint === undefined && isNewCommunication)
                    )
                ) {
                    const notification = this.getAuthoredProposalResponseNotification(communication);
                    if (notification) {
                        this.pushNotification(notification);
                    }
                }
            });
    }

    syncProposalsFromStore({
        event = '',
        data = null
    } = {}) {
        this.receivedProposals = communicationsStore.getAll()
            .filter((communication) => (
                communication?.type === 'PROPOSAL_FORWARDED'
                && isWhiteCellCommunicationVisibleToScribe(communication, this.teamContext)
            ));

        if (!this.facilitatorDeckSlides.length && !this.sections.length) {
            return;
        }

        const shouldFocusProposal = (
            event === 'created'
            && data?.type === 'PROPOSAL_FORWARDED'
            && isWhiteCellCommunicationVisibleToScribe(data, this.teamContext)
        );
        const preferredSlideKey = shouldFocusProposal
            ? `proposal-${data.id}`
            : this.getCurrentSlideKey();
        const activeSectionId = this.sections[this.activeSectionIndex]?.id;

        this.rebuildDeck({
            preferredSlideKey,
            preferLiveSection: shouldFocusProposal || activeSectionId === PROPOSALS_SECTION_ID
                ? PROPOSALS_SECTION_ID
                : ''
        });

        if (this.deckSlides.length) {
            this.renderSlide();
        }
    }

    syncRfisFromStore({ event = '', data = null } = {}) {
        this.teamRfis = requestsStore.getByTeam(this.teamId);

        if (!this.facilitatorDeckSlides.length && !this.sections.length) {
            return;
        }

        const shouldFocusRfi = ['created', 'updated', 'resubmitted', 'responded'].includes(event)
            && data?.team === this.teamId;
        this.rebuildDeck({
            preferredSlideKey: shouldFocusRfi ? `rfi-${data.id}` : this.getCurrentSlideKey(),
            preferLiveSection: shouldFocusRfi ? RFIS_SECTION_ID : ''
        });
        if (this.deckSlides.length) {
            this.renderSlide();
        }
    }

    syncCommunicationsFromStore({ event = '', data = null } = {}) {
        this.directCommunications = communicationsStore.getAll()
            .filter((communication) => isFacilitatorDirectCommunication(communication, this.teamContext));

        if (!this.facilitatorDeckSlides.length && !this.sections.length) {
            return;
        }

        const shouldFocusCommunication = ['created', 'updated'].includes(event)
            && isFacilitatorDirectCommunication(data, this.teamContext);
        this.rebuildDeck({
            preferredSlideKey: shouldFocusCommunication
                ? `communication-${data.id}`
                : this.getCurrentSlideKey(),
            preferLiveSection: shouldFocusCommunication ? COMMUNICATIONS_SECTION_ID : ''
        });
        if (this.deckSlides.length) {
            this.renderSlide();
        }
    }

    processActionNotification({ event = '', data = null } = {}) {
        const isLiveEvent = event === 'created' || event === 'updated';
        if (!this.actionsSeeded || !isLiveEvent) {
            this.teamActions.forEach((action) => {
                if (action?.id) {
                    this.actionStatusById.set(action.id, action.status);
                    this.actionVisibleById.set(action.id, isScribeVisibleAction(action));
                }
            });
            this.actionsSeeded = true;
            return;
        }

        if (!data || data.team !== this.teamId || !data.id) {
            return;
        }

        const previousStatus = this.actionStatusById.get(data.id);
        const wasVisible = this.actionVisibleById.get(data.id) === true;
        const nextStatus = data.status;
        const isVisible = isScribeVisibleAction(data);
        const isNewAction = event === 'created' || previousStatus === undefined || (!wasVisible && isVisible);
        const statusChanged = previousStatus !== nextStatus;
        this.actionStatusById.set(data.id, nextStatus);
        this.actionVisibleById.set(data.id, isVisible);

        if (!isVisible) {
            return;
        }

        // Skip silent edits (e.g. draft re-saves) that don't change lifecycle state.
        if (!isNewAction && !statusChanged) {
            return;
        }

        const note = this.buildActionNotification(data, { isNewAction });
        if (note) {
            this.pushNotification(note);
        }
    }

    buildActionNotification(action = {}, { isNewAction = false } = {}) {
        let detail;
        try {
            detail = getBlueActionViewModel(action).title || action.goal || 'Untitled';
        } catch (error) {
            detail = action.goal || 'Untitled';
        }

        let title;
        if (isAdjudicatedAction(action)) {
            title = 'White Cell reviewed an action';
        } else if (isSubmittedAction(action)) {
            title = 'Action submitted to White Cell';
        } else if (isDraftAction(action)) {
            title = isNewAction ? 'Action forwarded by Scribe' : 'Scribe action updated';
        } else {
            title = 'Action updated';
        }

        return {
            kind: 'action',
            tone: 'action',
            title,
            detail,
            slideKey: `action-${action.id}`,
            at: action.adjudicated_at || action.submitted_at || action.updated_at || action.created_at || null
        };
    }

    processCommunicationNotifications(event = '') {
        const all = communicationsStore.getAll();
        if (!this.communicationsSeeded || event === 'initialized') {
            this.knownCommunicationIds = new Set(all.map((communication) => communication?.id).filter(Boolean));
            this.seedAuthoredProposalStates(all);
            this.communicationsSeeded = true;
            return;
        }

        this.processAuthoredProposalStateNotifications(all);
        const fresh = all.filter((communication) => communication?.id && !this.knownCommunicationIds.has(communication.id));
        fresh.forEach((communication) => this.knownCommunicationIds.add(communication.id));
        fresh.forEach((communication) => {
            const note = this.buildCommunicationNotification(communication);
            if (note) {
                this.pushNotification(note);
            }
        });
    }

    buildCommunicationNotification(communication = {}) {
        const metadata = communication?.metadata && typeof communication.metadata === 'object'
            ? communication.metadata
            : {};

        // A Green/other-team proposal forwarded to this team by White Cell
        if (communication?.type === 'PROPOSAL_FORWARDED' && metadata.recipient_team === this.teamId) {
            const sourceLabel = this.getTeamLabel(metadata.source_team || 'green');
            const proposalTitle = metadata.proposal && typeof metadata.proposal === 'object'
                ? metadata.proposal.title
                : '';
            return {
                kind: 'proposal',
                tone: 'proposal',
                title: `Proposal received from ${sourceLabel}`,
                detail: proposalTitle || 'Forwarded by White Cell',
                slideKey: communication.id ? `proposal-${communication.id}` : '',
                at: communication.created_at || null
            };
        }

        // A White Cell communication addressed to this facilitator surface (deck assignments excluded)
        if (
            isWhiteCellCommunicationVisibleToScribe(communication, this.teamContext)
            && !getScribeDeckAssignmentDetails(communication)
        ) {
            const kindLabel = {
                TRIBE_STREET_JOURNAL: 'Tribe Street Journal update',
                VERBA_AI_POPULATION_SENTIMENT: 'Verba AI update'
            }[metadata.content_kind] || 'White Cell communication';
            const detail = typeof communication.content === 'string' && communication.content.trim()
                ? communication.content.trim().slice(0, 140)
                : 'New update from White Cell';
            return {
                kind: 'whitecell',
                tone: 'whitecell',
                title: kindLabel,
                detail,
                at: communication.created_at || null
            };
        }

        return null;
    }

    pushNotification(note = {}) {
        if (!note || !note.title) {
            return;
        }

        this.notificationSeq += 1;
        const entry = {
            id: `scribe-alert-${this.notificationSeq}`,
            kind: note.kind || 'info',
            tone: note.tone || 'info',
            title: note.title,
            detail: note.detail || '',
            slideKey: note.slideKey || '',
            at: note.at || null,
            read: this.alertsOpen
        };

        this.notifications.unshift(entry);
        if (this.notifications.length > 30) {
            this.notifications.length = 30;
        }

        if (!this.alertsOpen) {
            this.unreadNotifications += 1;
        }

        this.renderAlerts();

        showToast({
            message: entry.detail ? `${entry.title}: ${entry.detail}` : entry.title,
            type: 'info',
            duration: 5000
        });
    }

    focusAlertsDialog() {
        const panel = document.getElementById('scribeAlertsPanel');
        if (!panel) {
            return;
        }

        const [firstFocusable] = getFocusableDialogElements(panel);
        const target = firstFocusable || panel;
        target.focus?.({ preventScroll: true });
    }

    handleAlertsKeydown(event) {
        if (!this.alertsOpen) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault?.();
            this.setAlertsOpen(false);
            return;
        }

        if (event.key !== 'Tab') {
            return;
        }

        const panel = document.getElementById('scribeAlertsPanel');
        if (!panel) {
            return;
        }

        const focusableElements = getFocusableDialogElements(panel);
        if (!focusableElements.length) {
            event.preventDefault?.();
            panel.focus?.({ preventScroll: true });
            return;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        if (!panel.contains?.(activeElement)) {
            event.preventDefault?.();
            first.focus?.({ preventScroll: true });
            return;
        }

        if (event.shiftKey && activeElement === first) {
            event.preventDefault?.();
            last.focus?.({ preventScroll: true });
            return;
        }

        if (!event.shiftKey && activeElement === last) {
            event.preventDefault?.();
            first.focus?.({ preventScroll: true });
        }
    }

    setAlertsOpen(isOpen, { trigger = null, restoreFocus = true } = {}) {
        this.alertsOpen = Boolean(isOpen);
        const panel = document.getElementById('scribeAlertsPanel');
        const button = document.getElementById('scribeAlertsBtn');

        if (this.alertsOpen) {
            this.alertsReturnFocus = trigger || document.activeElement || button || null;
        }

        if (panel) {
            panel.hidden = !this.alertsOpen;
        }
        if (button) {
            button.setAttribute('aria-expanded', String(this.alertsOpen));
        }

        if (this.alertsOpen) {
            this.unreadNotifications = 0;
            this.notifications.forEach((entry) => { entry.read = true; });
            this.renderAlerts();
            this.focusAlertsDialog();
        } else {
            this.updateAlertsBadge();
            if (restoreFocus && this.alertsReturnFocus?.focus) {
                this.alertsReturnFocus.focus({ preventScroll: true });
            }
            this.alertsReturnFocus = null;
        }
    }

    updateAlertsBadge() {
        const badge = document.getElementById('scribeAlertsBadge');
        const button = document.getElementById('scribeAlertsBtn');

        if (badge) {
            if (this.unreadNotifications > 0) {
                badge.textContent = this.unreadNotifications > 9 ? '9+' : String(this.unreadNotifications);
                badge.hidden = false;
            } else {
                badge.hidden = true;
            }
        }

        if (button) {
            button.classList.toggle('has-unread', this.unreadNotifications > 0);
        }
    }

    renderAlerts() {
        this.updateAlertsBadge();

        const list = document.getElementById('scribeAlertsList');
        if (!list) {
            return;
        }

        if (!this.notifications.length) {
            list.innerHTML = '<p class="scribe-alerts-empty">No simulation activity yet.</p>';
            return;
        }

        list.innerHTML = this.notifications.map((entry) => {
            const timeLabel = entry.at ? escapeHtml(formatRelativeTime(entry.at)) : '';
            const detailMarkup = entry.detail
                ? `<span class="scribe-alert-detail">${escapeHtml(entry.detail)}</span>`
                : '';
            const slideAttr = entry.slideKey
                ? ` data-slide-key="${escapeHtml(entry.slideKey)}" role="button" tabindex="0"`
                : '';
            return `
                <div class="scribe-alert scribe-alert--${escapeHtml(entry.tone)}${entry.read ? '' : ' is-unread'}"${slideAttr}>
                    <span class="scribe-alert-dot" aria-hidden="true"></span>
                    <span class="scribe-alert-body">
                        <span class="scribe-alert-title">${escapeHtml(entry.title)}</span>
                        ${detailMarkup}
                    </span>
                    ${timeLabel ? `<span class="scribe-alert-time">${timeLabel}</span>` : ''}
                </div>
            `;
        }).join('');
    }

    syncDeckAssignmentFromStore({
        reload = true
    } = {}) {
        const nextAssignment = resolveAssignedScribeDeck(
            communicationsStore.getAll(),
            this.teamContext
        );
        const hasDeckChanged = nextAssignment.deckSource !== this.activeDeckSource
            || nextAssignment.deckStorageKey !== this.activeDeckStorageKey
            || nextAssignment.deckPath !== this.activeDeckPath
            || nextAssignment.communicationId !== this.activeDeckAssignmentId;

        this.activeDeckSource = nextAssignment.deckSource || SCRIBE_DECK_SOURCE_REPO;
        this.activeDeckStorageKey = nextAssignment.deckStorageKey || null;
        this.activeDeckFileName = nextAssignment.deckFileName || null;
        this.activeDeckPath = nextAssignment.deckPath;
        this.activeDeckLabel = nextAssignment.deckLabel;
        this.activeDeckAssignmentId = nextAssignment.communicationId;

        if (reload && hasDeckChanged) {
            void this.loadDeck({
                deckSource: this.activeDeckSource,
                deckStorageKey: this.activeDeckStorageKey,
                deckPath: this.activeDeckPath,
                deckLabel: this.activeDeckLabel
            });
        }
    }

    async togglePresentationMode() {
        const isPresenting = this.isPresentationModeActive();

        if (isPresenting) {
            this.closePresentationEditPanel();
            if (document.fullscreenElement) {
                try {
                    await document.exitFullscreen?.();
                } catch (error) {
                    logger.warn('Fullscreen toggle failed:', error);
                }
            }

            setScribePresentationMode({ isActive: false });
            return;
        }

        setScribePresentationMode({ isActive: true });

        try {
            await document.documentElement.requestFullscreen?.();
        } catch (error) {
            logger.warn('Fullscreen toggle failed:', error);
        }
    }

    async loadDeck({
        deckSource = this.activeDeckSource,
        deckStorageKey = this.activeDeckStorageKey,
        deckPath = this.activeDeckPath,
        deckLabel = this.activeDeckLabel
    } = {}) {
        const requestedDeckSource = deckSource || SCRIBE_DECK_SOURCE_REPO;
        this.setDeckState('loading');
        this.renderDeckState({
            title: `Loading ${deckLabel || 'support deck'}`,
            message: requestedDeckSource === SCRIBE_DECK_SOURCE_UPLOAD
                ? `Pulling ${deckLabel || 'the uploaded support deck'} from browser cache and live team decisions into the facilitator surface.`
                : `Pulling ${deckLabel || 'the assigned support deck'} and live team decisions into the facilitator surface.`
        });

        try {
            const defaultDeckPath = buildDefaultScribeDeckPath(this.teamId);
            if (requestedDeckSource === SCRIBE_DECK_SOURCE_UPLOAD) {
                try {
                    const uploadedDeck = await getUploadedScribeDeck(deckStorageKey);
                    if (!uploadedDeck?.slides?.length) {
                        throw new Error('Assigned uploaded deck is not cached in this browser.');
                    }

                    this.facilitatorDeckSlides = uploadedDeck.slides;
                } catch (error) {
                    logger.warn('Assigned uploaded facilitator deck unavailable in this browser, falling back to the team default deck.', {
                        deckStorageKey,
                        fallbackDeckPath: defaultDeckPath,
                        error
                    });
                    showToast({
                        message: 'Assigned uploaded deck is not cached in this browser. Loaded the default team deck instead.',
                        type: 'warning'
                    });
                    this.facilitatorDeckSlides = await fetchScribeDeckSlides(defaultDeckPath);
                }
            } else {
                const requestedDeckPath = deckPath || defaultDeckPath;

                try {
                    this.facilitatorDeckSlides = await fetchScribeDeckSlides(requestedDeckPath);
                } catch (error) {
                    if (requestedDeckPath === defaultDeckPath) {
                        throw error;
                    }

                    logger.warn('Assigned facilitator deck unavailable, falling back to the team default deck.', {
                        requestedDeckPath,
                        fallbackDeckPath: defaultDeckPath,
                        error
                    });
                    showToast({
                        message: 'Assigned facilitator deck unavailable. Loaded the default team deck instead.',
                        type: 'warning'
                    });
                    this.facilitatorDeckSlides = await fetchScribeDeckSlides(defaultDeckPath);
                }
            }

            this.rebuildDeck();

            this.renderSections();
            this.renderSlide();
        } catch (error) {
            logger.error('Failed to load facilitator deck:', error);
            this.facilitatorDeckSlides = [];
            const hasReceivedProposals = this.receivedProposals.length > 0;
            this.rebuildDeck({
                preferActionsSection: !hasReceivedProposals,
                preferLiveSection: hasReceivedProposals ? PROPOSALS_SECTION_ID : ''
            });
            const actionSection = this.sections.find((section) => section.id === ACTIONS_SECTION_ID);
            const proposalSection = this.sections.find((section) => section.id === PROPOSALS_SECTION_ID);
            if ((actionSection?.slideCount || 0) > 0 || (proposalSection?.slideCount || 0) > 0) {
                this.setDeckState('ready');
                this.renderSections();
                this.renderSlide();
                showToast({
                    message: 'The facilitator support deck could not be loaded. Showing live decision slides only.',
                    type: 'warning'
                });
                return;
            }

            this.setDeckState('error');
            this.renderSections();
            this.renderDeckState({
                title: 'Support deck unavailable',
                message: error.message || 'The assigned support deck could not be loaded for this seat.'
            });
            showToast({
                message: 'The facilitator support deck could not be loaded.',
                type: 'error'
            });
        }
    }

    getCurrentSlideKey() {
        return getSlideKey(this.deckSlides[this.currentSlideIndex]);
    }

    rebuildDeck({
        preferredSlideKey = '',
        preferActionsSection = false,
        preferLiveSection = ''
    } = {}) {
        const actionSection = buildActionSection(this.teamActions, {
            teamLabel: this.teamLabel
        });
        const proposalSection = buildProposalSection(this.receivedProposals, {
            teamContext: this.teamContext
        });
        const rfiSection = buildRfiSection(this.teamRfis, { teamId: this.teamId });
        const communicationSection = buildCommunicationSection(this.directCommunications, {
            teamContext: this.teamContext
        });
        const staticSections = expandScribeDeckSections(this.facilitatorDeckSlides)
            .filter((section) => !LIVE_SECTION_IDS.includes(section.id));
        const staticSlides = flattenScribeDeckSlides(staticSections);

        const liveSections = [actionSection, proposalSection, rfiSection, communicationSection];
        this.sections = [...liveSections, ...staticSections];
        this.deckSlides = [...staticSlides, ...liveSections.flatMap((section) => section.slides)];

        if (!this.deckSlides.length) {
            this.currentSlideIndex = 0;
            this.activeSectionIndex = 0;
            return;
        }

        const preferredIndex = this.deckSlides.findIndex((slide) => getSlideKey(slide) === preferredSlideKey);
        if (preferredIndex >= 0) {
            this.currentSlideIndex = preferredIndex;
        } else if ((preferLiveSection || preferActionsSection) && actionSection.slides.length) {
            const preferredSection = liveSections.find((section) => section.id === preferLiveSection)
                || actionSection;
            this.currentSlideIndex = this.deckSlides.findIndex(
                (slide) => getSlideKey(slide) === getSlideKey(preferredSection.slides[0])
            );
        } else {
            this.currentSlideIndex = Math.max(
                this.deckSlides.findIndex((slide) => slide.slideType === 'image'),
                0
            );
        }

        this.currentSlideIndex = clampSlideIndex(this.deckSlides, this.currentSlideIndex);
        this.activeSectionIndex = Math.max(
            getSectionIndexForSlideKey(this.sections, this.getCurrentSlideKey()),
            0
        );
        this.reconcileExpandedSections();
    }

    getSectionExpansionKey(section, sectionIndex = 0) {
        return section?.id || `${sectionIndex}:${section?.label || 'section'}`;
    }

    reconcileExpandedSections() {
        const validKeys = new Set(
            this.sections.map((section, sectionIndex) => this.getSectionExpansionKey(section, sectionIndex))
        );
        this.expandedSectionIds = new Set(
            [...this.expandedSectionIds].filter((key) => validKeys.has(key))
        );

        if (!this.sectionExpansionInitialized && this.sections.length) {
            this.expandSection(this.activeSectionIndex, { render: false });
            this.sectionExpansionInitialized = true;
        }
    }

    setDeckState(state = 'loading') {
        document.body.dataset.scribeDeckState = state;
    }

    renderDeckState({
        title = '',
        message = ''
    } = {}) {
        const statePanel = document.getElementById('deckStatePanel');
        const stateTitle = document.getElementById('deckStateTitle');
        const stateMessage = document.getElementById('deckStateMessage');
        const stateRetry = document.getElementById('deckRetryBtn');
        const imageFrame = document.getElementById('deckImageFrame');
        const actionFrame = document.getElementById('deckActionFrame');

        if (stateTitle) {
            stateTitle.textContent = title;
        }

        if (stateMessage) {
            stateMessage.textContent = message;
        }

        if (stateRetry) {
            stateRetry.hidden = document.body.dataset.scribeDeckState !== 'error';
        }

        if (statePanel) {
            statePanel.hidden = document.body.dataset.scribeDeckState === 'ready';
        }

        if (imageFrame) {
            imageFrame.hidden = document.body.dataset.scribeDeckState !== 'ready';
        }

        if (actionFrame) {
            actionFrame.hidden = document.body.dataset.scribeDeckState !== 'ready';
        }
    }

    renderSections() {
        const sectionList = document.getElementById('scribeSectionList');
        if (!sectionList) {
            return;
        }

        const currentSlideKey = this.getCurrentSlideKey();
        const resolvedSectionIndex = getSectionIndexForSlideKey(this.sections, currentSlideKey);
        if (resolvedSectionIndex >= 0) {
            this.activeSectionIndex = resolvedSectionIndex;
        }

        const sectionGroups = { actions: [], proposals: [], rfis: [], communications: [] };
        const liveSectionIds = new Set(LIVE_SECTION_IDS);

        this.sections.forEach((section, sectionIndex) => {
            // Keep the assigned support deck in the main viewer, but do not
            // duplicate its section and slide details in the sidebar.
            if (!liveSectionIds.has(section.id)) {
                return;
            }

            const sectionKind = section.id === COMMUNICATIONS_SECTION_ID
                ? 'communications'
                : section.id;
            if (sectionKind === 'actions') {
                sectionGroups.actions.push(
                    this.renderVerticalActionMarkSections(section, currentSlideKey)
                );
                return;
            }
            const sectionKey = this.getSectionExpansionKey(section, sectionIndex);
            const isExpanded = this.expandedSectionIds.has(sectionKey);
            const containsCurrentSlide = section.slides.some((slide) => getSlideKey(slide) === currentSlideKey);
            const visibleSlideCount = Number.isFinite(section.slideCount)
                ? section.slideCount
                : section.slides.length;
            const itemLabels = {
                proposals: ['proposal', 'proposals'],
                rfis: ['RFI', 'RFIs'],
                communications: ['message', 'messages']
            };
            const labels = itemLabels[sectionKind] || ['live decision', 'live decisions'];
            const visibleDecisionLabel = visibleSlideCount === 1 ? labels[0] : labels[1];
            const slideGroupId = `scribe-section-${sectionIndex}-slides`;

            const slideMarkup = section.slides.map((slide, slideIndex) => {
                const isActiveSlide = getSlideKey(slide) === currentSlideKey;
                const slideTypeClass = getLiveSlideTypeClass(slide);
                const slideOrdinal = slide.sidebarOrdinal || slide.n || slideIndex + 1;
                const slideKicker = slide.slideType === 'image'
                    ? `Slide ${slideIndex + 1} of ${section.slides.length}`
                    : slide.sidebarKicker || `Decision ${slideIndex + 1} of ${Math.max(visibleSlideCount, 1)}`;
                return `
                    <li>
                        <button
                            type="button"
                            class="scribe-slide-link${isActiveSlide ? ' is-active' : ''}${slideTypeClass}"
                            data-slide-key="${escapeHtml(getSlideKey(slide))}"
                            data-slide-type="${escapeHtml(slide.slideType || 'image')}"
                            ${isActiveSlide ? 'aria-current="true"' : ''}
                        >
                            <span class="scribe-slide-link-number">${escapeHtml(String(slideOrdinal))}</span>
                            <span class="scribe-slide-link-text">
                                <span class="scribe-slide-link-kicker">${escapeHtml(slideKicker)}</span>
                                <span class="scribe-slide-link-title">${escapeHtml(slide.title)}</span>
                            </span>
                        </button>
                    </li>
                `;
            }).join('');

            sectionGroups[sectionKind].push(`
                <section class="scribe-section-card scribe-section-card--${sectionKind}${containsCurrentSlide ? ' is-current' : ''}" data-section-kind="${sectionKind}">
                    <button
                        type="button"
                        class="scribe-section-trigger${isExpanded ? ' is-expanded' : ''}"
                        data-section-index="${sectionIndex}"
                        data-section-label="${escapeHtml(section.label)}"
                        aria-controls="${slideGroupId}"
                        aria-expanded="${isExpanded ? 'true' : 'false'}"
                        aria-label="${escapeHtml(section.label)}, ${visibleSlideCount} ${visibleDecisionLabel}"
                    >
                        <span class="scribe-section-index" aria-hidden="true">${sectionIndex + 1}</span>
                        <span class="scribe-section-trigger-text">
                            <span class="scribe-section-trigger-title">${escapeHtml(section.label)}</span>
                        </span>
                        <span class="scribe-section-trigger-meta">
                            <span class="scribe-section-count">${visibleSlideCount}</span>
                            <span class="scribe-section-chevron" aria-hidden="true">${isExpanded ? '-' : '+'}</span>
                        </span>
                    </button>
                    <div id="${slideGroupId}" class="scribe-slide-group"${isExpanded ? '' : ' hidden'}>
                        <ol class="scribe-slide-list">
                            ${slideMarkup}
                        </ol>
                    </div>
                </section>
            `);
        });

        const renderRegion = (kind, label, summary) => {
            const cards = sectionGroups[kind];
            if (!cards.length) {
                return '';
            }

            return `
                <div class="scribe-section-region scribe-section-region--${kind}" role="group" aria-label="${label}">
                    <div class="scribe-section-region-heading">
                        <h2 class="scribe-section-region-title">${label}</h2>
                        <span class="scribe-section-region-summary">${summary}</span>
                    </div>
                    <div class="scribe-section-region-list">
                        ${cards.join('')}
                    </div>
                </div>
            `;
        };

        sectionList.innerHTML = [
            renderRegion('actions', 'Actions', 'Live team decisions'),
            renderRegion('proposals', 'Proposals', 'Received from other teams'),
            renderRegion('rfis', 'RFIs', 'Questions and responses'),
            renderRegion('communications', 'Communications', 'Direct White Cell thread')
        ].join('');
    }

    renderVerticalActionMarkSections(section = {}, currentSlideKey = '') {
        const slidesByActionId = new Map(
            (section.slides || [])
                .filter((slide) => slide?.action?.id)
                .map((slide) => [slide.action.id, slide])
        );
        const groups = groupActionRecordsByMark(
            (section.slides || []).map((slide) => slide.action).filter(Boolean)
        ).map((mark) => ({
            ...mark,
            slides: mark.records.map((record) => slidesByActionId.get(record.id)).filter(Boolean)
        }));
        const sections = groups.map((mark) => {
            const records = mark.slides.map((slide, slideIndex) => {
                const isActiveSlide = getSlideKey(slide) === currentSlideKey;
                return `
                    <li>
                        <button
                            type="button"
                            class="scribe-slide-link${isActiveSlide ? ' is-active' : ''}${getLiveSlideTypeClass(slide)}"
                            data-slide-key="${escapeHtml(getSlideKey(slide))}"
                            data-slide-type="${escapeHtml(slide.slideType || 'action')}"
                            ${isActiveSlide ? 'aria-current="true"' : ''}
                        >
                            <span class="scribe-slide-link-number">${escapeHtml(String(slide.sidebarOrdinal || slideIndex + 1))}</span>
                            <span class="scribe-slide-link-text">
                                <span class="scribe-slide-link-kicker">${escapeHtml(slide.sidebarKicker || `Record ${slideIndex + 1}`)}</span>
                                <span class="scribe-slide-link-title">${escapeHtml(slide.title)}</span>
                            </span>
                        </button>
                    </li>
                `;
            }).join('');

            return `
                <section
                    class="scribe-action-mark-section"
                    data-scribe-action-mark="${mark.key}"
                    aria-labelledby="scribe-action-mark-heading-${mark.key}"
                >
                    <div class="scribe-action-mark-heading">
                        <h3 id="scribe-action-mark-heading-${mark.key}" class="scribe-action-mark-title">${escapeHtml(mark.label)}</h3>
                        <span class="action-mark-count" aria-label="${escapeHtml(`${mark.count} ${mark.count === 1 ? 'record' : 'records'}`)}">${mark.count}</span>
                    </div>
                    ${records
                        ? `<ol class="scribe-slide-list">${records}</ol>`
                        : `<p class="action-mark-empty">No records for ${escapeHtml(mark.label)}.</p>`}
                </section>
            `;
        }).join('');

        return `
            <div class="scribe-action-mark-stack" data-scribe-action-mark-stack role="group" aria-label="Team actions by simulation mark">
                ${sections}
            </div>
        `;
    }

    renderSlide() {
        const slide = this.deckSlides[this.currentSlideIndex];
        if (!slide) {
            this.renderDeckState({
                title: 'No support slides found',
                message: 'The facilitator section mapping did not resolve any slides from the support deck.'
            });
            this.setDeckState('error');
            return;
        }

        this.setDeckState('ready');
        this.renderDeckState();

        const activeSectionIndex = Math.max(
            getSectionIndexForSlideKey(this.sections, getSlideKey(slide)),
            0
        );
        const activeSection = this.sections[activeSectionIndex];
        const slideIndexWithinSection = activeSection.slides.findIndex(
            (entry) => getSlideKey(entry) === getSlideKey(slide)
        );

        this.activeSectionIndex = activeSectionIndex;

        const isLiveReviewSection = LIVE_SECTION_IDS.includes(activeSection?.id);
        const activeView = isLiveReviewSection ? 'actions' : 'deck';
        if (activeView === 'deck') {
            this.lastDeckSlideKey = getSlideKey(slide);
        }
        this.updateFacilitatorViewSwitch(activeView);

        const slideImage = document.getElementById('deckSlideImage');
        const imageFrame = document.getElementById('deckImageFrame');
        const actionFrame = document.getElementById('deckActionFrame');
        const announcement = document.getElementById('slideAnnouncement');

        if (slide.slideType === 'image' && slideImage) {
            slideImage.src = slide.src;
            slideImage.alt = `${slide.title} (slide ${slide.n})`;
        }

        if (imageFrame) {
            imageFrame.hidden = slide.slideType !== 'image';
        }

        if (actionFrame) {
            actionFrame.hidden = slide.slideType === 'image';
            if (slide.slideType !== 'image') {
                actionFrame.innerHTML = slide.slideType === 'proposal' || slide.slideType === 'proposal-placeholder'
                    ? this.renderProposalSlide(slide)
                    : slide.slideType === 'rfi' || slide.slideType === 'rfi-placeholder'
                        ? this.renderRfiSlide(slide)
                        : slide.slideType === 'communication' || slide.slideType === 'communication-placeholder'
                            ? this.renderCommunicationSlide(slide)
                            : this.renderActionSlide(slide);
            }
        }

        if (announcement) {
            announcement.textContent = slide.slideType === 'image'
                ? `${activeSection.label}. ${slide.title}. Slide ${this.currentSlideIndex + 1} of ${this.deckSlides.length}.`
                : slide.slideType === 'proposal' || slide.slideType === 'proposal-placeholder'
                    ? `${activeSection.label}. ${slide.title}. Proposal ${slideIndexWithinSection + 1} of ${Math.max(activeSection.slideCount || activeSection.slides.length, 1)}.`
                    : slide.slideType === 'rfi' || slide.slideType === 'rfi-placeholder'
                        ? `${activeSection.label}. ${slide.title}. RFI ${slideIndexWithinSection + 1} of ${Math.max(activeSection.slideCount || activeSection.slides.length, 1)}.`
                        : slide.slideType === 'communication' || slide.slideType === 'communication-placeholder'
                            ? `${activeSection.label}. ${slide.title}. Message ${slideIndexWithinSection + 1} of ${Math.max(activeSection.slideCount || activeSection.slides.length, 1)}.`
                    : `${activeSection.label}. ${slide.title}. ${getActionSlideAnnouncementLabel(slide.action)} ${slideIndexWithinSection + 1} of ${Math.max(activeSection.slideCount || activeSection.slides.length, 1)}.`;
        }

        const prevSlideBtn = document.getElementById('prevSlideBtn');
        const nextSlideBtn = document.getElementById('nextSlideBtn');

        prevSlideBtn && (prevSlideBtn.disabled = this.currentSlideIndex === 0);
        nextSlideBtn && (nextSlideBtn.disabled = this.currentSlideIndex >= this.deckSlides.length - 1);

        this.renderSections();
    }

    isStrategicActionCardExpanded(actionId = '') {
        return !this.collapsedStrategicActionIds.has(String(actionId || ''));
    }

    toggleStrategicActionCard(actionId = '') {
        const normalizedActionId = String(actionId || '');
        if (!normalizedActionId) {
            return;
        }

        if (this.collapsedStrategicActionIds.has(normalizedActionId)) {
            this.collapsedStrategicActionIds.delete(normalizedActionId);
        } else {
            this.collapsedStrategicActionIds.add(normalizedActionId);
        }

        this.renderSlide();
    }

    renderPresentationToolbar(action = {}, actionViewModel = getBlueActionViewModel(action)) {
        const actionId = String(action.id || '');
        const isOrientation = isStrategicOrientationAction(action);
        const isProposal = isProposalAction(action);
        const isEditableDraft = isDraftAction(action);
        const lifecycle = getArtifactLifecycleViewModel(getActionSlideLifecycleArtifact(action));
        const isReturned = lifecycle.isReturned;
        const actionControlsDisabled = isOrientation || isProposal || !isEditableDraft;
        const showsCollaborationGroups = this.teamId === 'blue';
        const coordinatedDecision = normalizeScribeDecision(actionViewModel.coordinatedDecision);
        const informedEngagedDecision = normalizeScribeDecision(actionViewModel.informedEngagedDecision);
        const coordinatedValues = actionViewModel.coordinated || [];
        const informedValues = actionViewModel.informed || [];
        const presentationSelections = {
            coordinatedDecision,
            coordinatedLegislativeDecision: coordinatedDecision === 'yes'
                ? (isScribeOptionSelected('Legislative', coordinatedValues) ? 'yes' : 'no')
                : (coordinatedDecision === 'no' ? 'no' : ''),
            coordinatedExecutiveDecision: coordinatedDecision === 'yes'
                ? (isScribeOptionSelected('Executive', coordinatedValues) ? 'yes' : 'no')
                : (coordinatedDecision === 'no' ? 'no' : ''),
            informedIndustryDecision: informedEngagedDecision
                ? (isScribeOptionSelected('Industry', informedValues) ? 'yes' : 'no')
                : '',
            informedAlliesDecision: informedEngagedDecision
                ? (isScribeOptionSelected('Allies', informedValues) ? 'yes' : 'no')
                : ''
        };
        const isComplete = !showsCollaborationGroups
            || isOrientation
            || isProposal
            || this.isPresentationActionSelectionsComplete(presentationSelections);
        const statusId = buildScribeControlId(actionId, 'presentation-toolbar', 'status');
        const toolbarStatus = !isEditableDraft
            ? `${lifecycle.label}.`
            : isReturned
            ? `Returned by White Cell. Correct revision ${action.revision_number || 1} and resubmit it once.`
            : (isProposal
                ? 'Review the proposal with the room, then forward to White Cell.'
                : (isOrientation
                    ? (showsCollaborationGroups
                        ? 'Coordination and engagement apply to action submissions only.'
                        : 'Review the Strategic Orientation with the room, then forward to White Cell.')
                    : (!showsCollaborationGroups
                        ? 'Ready to forward to White Cell.'
                        : (isComplete ? 'Ready to forward.' : 'Complete every Yes/No choice to forward.'))));

        return `
            <footer
                class="scribe-presentation-toolbar${showsCollaborationGroups ? '' : ' scribe-presentation-toolbar--handoff-only'}"
                data-scribe-presentation-toolbar
                data-scribe-action-submit-panel
                data-action-id="${escapeHtml(actionId)}"
                aria-label="Facilitator presentation controls"
            >
                <div class="scribe-presentation-toolbar-primary">
                    <button
                        type="button"
                        class="btn btn-secondary"
                        data-scribe-action-edit
                        data-action-id="${escapeHtml(actionId)}"
                        ${isEditableDraft ? '' : 'disabled'}
                    >Edit</button>
                </div>

                ${showsCollaborationGroups ? `
                    <fieldset class="scribe-presentation-toolbar-group" ${actionControlsDisabled ? 'disabled' : ''}>
                        <legend>Coordinated</legend>
                        <div class="scribe-presentation-toolbar-choices">
                        ${renderPresentationBinaryChoice({
                actionId,
                group: 'coordinated-legislative',
                label: 'Legislative',
                decision: presentationSelections.coordinatedLegislativeDecision,
                disabled: actionControlsDisabled
            })}
                        ${renderPresentationBinaryChoice({
                actionId,
                group: 'coordinated-executive',
                label: 'Executive',
                decision: presentationSelections.coordinatedExecutiveDecision,
                disabled: actionControlsDisabled
            })}
                        </div>
                    </fieldset>

                    <fieldset class="scribe-presentation-toolbar-group" ${actionControlsDisabled ? 'disabled' : ''}>
                        <legend>Informed/Engaged</legend>
                        <div class="scribe-presentation-toolbar-choices">
                        ${renderPresentationBinaryChoice({
                actionId,
                group: 'informed-industry',
                label: 'Industry',
                decision: presentationSelections.informedIndustryDecision,
                disabled: actionControlsDisabled
            })}
                        ${renderPresentationBinaryChoice({
                actionId,
                group: 'informed-allies',
                label: 'Allies',
                decision: presentationSelections.informedAlliesDecision,
                disabled: actionControlsDisabled
            })}
                        </div>
                    </fieldset>
                ` : ''}

                <div class="scribe-presentation-toolbar-submit">
                    <p id="${escapeHtml(statusId)}" class="scribe-presentation-toolbar-status" role="status" aria-live="polite">
                        ${toolbarStatus}
                    </p>
                    <button
                        type="button"
                        class="btn btn-primary"
                        data-scribe-action-submit
                        data-action-id="${escapeHtml(actionId)}"
                        aria-describedby="${escapeHtml(statusId)}"
                        ${isEditableDraft && isComplete ? '' : 'disabled'}
                    >${isReturned ? 'Resubmit to White Cell' : 'Forward to White Cell'}</button>
                </div>
            </footer>
        `;
    }

    getPresentationActionSelections(toolbar) {
        if (this.teamId !== 'blue') {
            return {
                coordinatedDecision: 'no',
                coordinatedLegislativeDecision: '',
                coordinatedExecutiveDecision: '',
                informedIndustryDecision: '',
                informedAlliesDecision: '',
                coordinatedValues: [],
                informedEngagedDecision: 'no',
                informedValues: []
            };
        }

        const getDecision = (group) => normalizeScribeDecision(
            toolbar?.querySelector?.(`[data-scribe-presentation-radio="${group}"]:checked`)?.value
        );
        const coordinatedLegislativeDecision = getDecision('coordinated-legislative');
        const coordinatedExecutiveDecision = getDecision('coordinated-executive');
        const informedIndustryDecision = getDecision('informed-industry');
        const informedAlliesDecision = getDecision('informed-allies');
        const coordinatedDecisionsComplete = Boolean(
            coordinatedLegislativeDecision && coordinatedExecutiveDecision
        );
        const informedDecisionsComplete = Boolean(informedIndustryDecision && informedAlliesDecision);

        return {
            coordinatedDecision: coordinatedDecisionsComplete
                ? (
                    coordinatedLegislativeDecision === 'yes'
                    || coordinatedExecutiveDecision === 'yes'
                        ? 'yes'
                        : 'no'
                )
                : '',
            coordinatedLegislativeDecision,
            coordinatedExecutiveDecision,
            informedIndustryDecision,
            informedAlliesDecision,
            coordinatedValues: coordinatedDecisionsComplete
                ? [
                    ...(coordinatedLegislativeDecision === 'yes' ? ['Legislative'] : []),
                    ...(coordinatedExecutiveDecision === 'yes' ? ['Executive'] : [])
                ]
                : [],
            informedEngagedDecision: informedDecisionsComplete
                ? (informedIndustryDecision === 'yes' || informedAlliesDecision === 'yes' ? 'yes' : 'no')
                : '',
            informedValues: informedDecisionsComplete
                ? [
                    ...(informedIndustryDecision === 'yes' ? ['Industry'] : []),
                    ...(informedAlliesDecision === 'yes' ? ['Allies'] : [])
                ]
                : []
        };
    }

    isPresentationActionSelectionsComplete(selections = {}) {
        if (this.teamId !== 'blue') {
            return true;
        }

        return Boolean(
            normalizeScribeDecision(selections.coordinatedLegislativeDecision)
            && normalizeScribeDecision(selections.coordinatedExecutiveDecision)
            && normalizeScribeDecision(selections.informedIndustryDecision)
            && normalizeScribeDecision(selections.informedAlliesDecision)
        );
    }

    updatePresentationActionToolbar(toolbar) {
        if (!toolbar) {
            return;
        }

        const selections = this.getPresentationActionSelections(toolbar);
        const isComplete = this.isPresentationActionSelectionsComplete(selections);
        const submitButton = toolbar.querySelector('[data-scribe-action-submit]');
        const status = toolbar.querySelector('.scribe-presentation-toolbar-status');

        if (submitButton) {
            submitButton.disabled = !isComplete;
        }
        if (status) {
            status.textContent = isComplete
                ? 'Ready to forward.'
                : 'Complete every Yes/No choice to forward.';
        }
    }

    async editProjectedAction(actionId = '') {
        const action = this.teamActions.find((candidate) => candidate?.id === actionId);
        if (!action || !isDraftAction(action)) {
            showToast({ message: 'Only forwarded draft actions can be edited.', type: 'error' });
            return;
        }

        if (!this.actionEditorController) {
            const { FacilitatorController } = await import('./facilitator.js');
            this.actionEditorController = new FacilitatorController();
        }

        this.actionEditorController.actions = this.teamActions;
        this.actionEditorController.role = this.role;
        this.actionEditorController.teamContext = this.teamContext;
        this.actionEditorController.teamId = this.teamId;
        this.actionEditorController.teamLabel = this.teamLabel;
        this.actionEditorController.isReadOnly = false;

        if (this.isPresentationModeActive()) {
            this.openPresentationEditPanel(action);
            return;
        }

        this.actionEditorController.showEditActionModal(action);
    }

    ensurePresentationEditHost() {
        let host = document.getElementById('scribePresentationEditPanel');
        if (host) {
            this.presentationEditHost = host;
            return host;
        }

        host = document.createElement('aside');
        host.id = 'scribePresentationEditPanel';
        host.className = 'scribe-presentation-edit-panel';
        host.hidden = true;
        host.setAttribute('aria-label', 'Live presentation editor');

        const main = document.querySelector('.scribe-main');
        if (main) {
            main.appendChild(host);
        } else {
            document.body.appendChild(host);
        }

        this.presentationEditHost = host;
        return host;
    }

    openPresentationEditPanel(action = {}) {
        const host = this.ensurePresentationEditHost();
        const artifactLabel = isStrategicOrientationAction(action)
            ? 'Strategic Orientation'
            : (isProposalAction(action) ? 'Proposal' : 'Action');

        this.presentationEditActionId = String(action.id || '');
        document.body.dataset.scribePresentationEdit = 'active';
        host.hidden = false;

        this.actionEditorController.mountEditActionInHost(action, {
            host,
            title: `Edit ${artifactLabel}`,
            onClose: () => this.closePresentationEditPanel()
        });
    }

    closePresentationEditPanel() {
        const host = this.presentationEditHost || document.getElementById('scribePresentationEditPanel');
        if (host) {
            host.hidden = true;
            host.replaceChildren();
        }
        this.presentationEditActionId = null;
        delete document.body.dataset.scribePresentationEdit;
    }

    renderScribeStrategicOrientationSubmissionControls(action = {}, viewModel = getStrategicOrientationViewModel(action)) {
        if (!isDraftAction(action)) {
            return '';
        }

        if (!isStrategicOrientationForwardedToScribe(action)) {
            return '';
        }

        const actionId = String(action.id || '');
        const lifecycle = getArtifactLifecycleViewModel(getActionSlideLifecycleArtifact(action));

        return `
            <section
                class="scribe-action-slide-submit-panel"
                data-scribe-action-submit-panel
                data-action-id="${escapeHtml(actionId)}"
                aria-label="Facilitator Strategic Orientation submission controls"
            >
                <div class="scribe-action-slide-submit-head">
                    <div>
                        <p class="scribe-action-slide-section-label">Facilitator-to-White Cell handoff</p>
                        <h3 class="scribe-action-slide-submit-title">${lifecycle.isReturned ? 'Correct and resubmit orientation' : 'Project orientation, then send to White Cell'}</h3>
                    </div>
                    <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        data-scribe-action-project
                        data-action-id="${escapeHtml(actionId)}"
                    >${viewModel.isForecast ? 'Project Forecast' : 'Project Orientation'}</button>
                </div>

                <p class="scribe-action-slide-lead-note">
                    Project this ${viewModel.isForecast ? 'forecast' : 'orientation selection'} for ${escapeHtml(this.teamLabel)}, verify the team sees their completed work, then submit it to White Cell.
                </p>

                <div class="scribe-action-slide-submit-actions">
                    <button
                        type="button"
                        class="btn btn-primary"
                        data-scribe-action-submit
                        data-action-id="${escapeHtml(actionId)}"
                    >${lifecycle.isReturned ? 'Resubmit to White Cell' : 'Submit to White Cell'}</button>
                </div>
            </section>
        `;
    }

    renderScribeActionSubmissionControls(action = {}, actionViewModel = getBlueActionViewModel(action)) {
        if (isStrategicOrientationAction(action)) {
            return this.renderScribeStrategicOrientationSubmissionControls(
                action,
                getStrategicOrientationViewModel(action)
            );
        }

        if (!isDraftAction(action)) {
            return '';
        }

        if (!isBlueActionForwardedToScribe(action)) {
            return '';
        }

        const actionId = String(action.id || '');
        const lifecycle = getArtifactLifecycleViewModel(getActionSlideLifecycleArtifact(action));
        const coordinatedDecision = normalizeScribeDecision(actionViewModel.coordinatedDecision);
        const informedEngagedDecision = normalizeScribeDecision(actionViewModel.informedEngagedDecision);
        const coordinatedValues = actionViewModel.coordinated || [];
        const informedValues = actionViewModel.informed || [];
        const selections = {
            coordinatedDecision,
            informedEngagedDecision,
            coordinatedValues: coordinatedDecision === 'yes' ? coordinatedValues : [],
            informedValues: informedEngagedDecision === 'yes' ? informedValues : []
        };
        const isComplete = this.isScribeActionSelectionsComplete(selections);

        return `
            <section
                class="scribe-action-slide-submit-panel"
                data-scribe-action-submit-panel
                data-action-id="${escapeHtml(actionId)}"
                aria-label="Facilitator action submission controls"
            >
                <div class="scribe-action-slide-submit-head">
                    <div>
                        <p class="scribe-action-slide-section-label">Facilitator finalization</p>
                        <h3 class="scribe-action-slide-submit-title">${lifecycle.isReturned ? 'Correct and resubmit' : 'Project, coordinate, and submit'}</h3>
                    </div>
                    <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        data-scribe-action-project
                        data-action-id="${escapeHtml(actionId)}"
                    >Project Action</button>
                </div>

                <div class="scribe-action-slide-submit-grid">
                    <fieldset class="scribe-action-slide-fieldset" data-scribe-action-group="coordinated">
                        <legend>Coordinated</legend>
                        <div class="scribe-action-slide-radio-row" role="radiogroup" aria-label="Coordinated decision">
                            ${renderScribeDecisionRadio({
            actionId,
            group: 'coordinated',
            value: 'yes',
            label: 'Yes',
            checked: coordinatedDecision === 'yes'
        })}
                            ${renderScribeDecisionRadio({
            actionId,
            group: 'coordinated',
            value: 'no',
            label: 'No',
            checked: coordinatedDecision === 'no'
        })}
                        </div>
                        <div class="scribe-action-slide-check-row" aria-label="Coordinated tick boxes">
                            ${renderScribeActionCheckboxes({
            actionId,
            group: 'coordinated',
            values: BLUE_ACTION_COORDINATED_OPTIONS,
            selectedValues: coordinatedValues,
            disabled: coordinatedDecision !== 'yes'
        })}
                        </div>
                    </fieldset>

                    <fieldset class="scribe-action-slide-fieldset" data-scribe-action-group="informed-engaged">
                        <legend>Informed/Engaged</legend>
                        <div class="scribe-action-slide-radio-row" role="radiogroup" aria-label="Informed or engaged decision">
                            ${renderScribeDecisionRadio({
            actionId,
            group: 'informed-engaged',
            value: 'yes',
            label: 'Yes',
            checked: informedEngagedDecision === 'yes'
        })}
                            ${renderScribeDecisionRadio({
            actionId,
            group: 'informed-engaged',
            value: 'no',
            label: 'No',
            checked: informedEngagedDecision === 'no'
        })}
                        </div>
                        <div class="scribe-action-slide-check-row" aria-label="Informed or engaged tick boxes">
                            ${renderScribeActionCheckboxes({
            actionId,
            group: 'informed-engaged',
            values: BLUE_ACTION_INFORMED_OPTIONS,
            selectedValues: informedValues,
            disabled: informedEngagedDecision !== 'yes'
        })}
                        </div>
                    </fieldset>
                </div>

                <div class="scribe-action-slide-submit-actions">
                    <button
                        type="button"
                        class="btn btn-primary"
                        data-scribe-action-submit
                        data-action-id="${escapeHtml(actionId)}"
                        ${isComplete ? '' : 'hidden disabled aria-hidden="true"'}
                    >${lifecycle.isReturned ? 'Resubmit to White Cell' : 'Submit to White Cell'}</button>
                </div>
            </section>
        `;
    }

    updateScribeActionSubmitState(panel) {
        if (!panel) {
            return;
        }

        ['coordinated', 'informed-engaged'].forEach((group) => {
            const decision = normalizeScribeDecision(
                panel.querySelector(`[data-scribe-action-radio="${group}"]:checked`)?.value
            );
            const checkboxes = Array.from(panel.querySelectorAll(`[data-scribe-action-checkbox="${group}"]`));
            const disableCheckboxes = decision !== 'yes';

            checkboxes.forEach((checkbox) => {
                checkbox.disabled = disableCheckboxes;
                if (decision === 'no') {
                    checkbox.checked = false;
                }
            });
        });

        const submitButton = panel.querySelector('[data-scribe-action-submit]');
        const isComplete = this.isScribeActionSelectionsComplete(this.getScribeActionSelections(panel));
        if (submitButton) {
            submitButton.hidden = !isComplete;
            submitButton.disabled = !isComplete;
            submitButton.toggleAttribute?.('aria-hidden', !isComplete);
        }
    }

    getScribeActionSelections(panel) {
        if (panel?.matches?.('[data-scribe-presentation-toolbar]')) {
            return this.getPresentationActionSelections(panel);
        }

        const coordinatedDecision = normalizeScribeDecision(
            panel?.querySelector?.('[data-scribe-action-radio="coordinated"]:checked')?.value
        );
        const informedEngagedDecision = normalizeScribeDecision(
            panel?.querySelector?.('[data-scribe-action-radio="informed-engaged"]:checked')?.value
        );
        const coordinatedValues = coordinatedDecision === 'yes'
            ? Array.from(panel?.querySelectorAll?.('[data-scribe-action-checkbox="coordinated"]:checked') || [])
                .map((checkbox) => checkbox.value)
            : [];
        const informedValues = informedEngagedDecision === 'yes'
            ? Array.from(panel?.querySelectorAll?.('[data-scribe-action-checkbox="informed-engaged"]:checked') || [])
                .map((checkbox) => checkbox.value)
            : [];

        return {
            coordinatedDecision,
            informedEngagedDecision,
            coordinatedValues,
            informedValues
        };
    }

    isScribeActionSelectionsComplete(selections = {}) {
        const coordinatedDecision = normalizeScribeDecision(selections.coordinatedDecision);
        const informedEngagedDecision = normalizeScribeDecision(selections.informedEngagedDecision);

        if (!coordinatedDecision || !informedEngagedDecision) {
            return false;
        }

        if (coordinatedDecision === 'yes' && !(selections.coordinatedValues || []).length) {
            return false;
        }

        if (informedEngagedDecision === 'yes' && !(selections.informedValues || []).length) {
            return false;
        }

        return true;
    }

    buildCompletedActionDetails(action = {}, selections = {}) {
        const actionViewModel = getBlueActionViewModel(action);

        return serializeBlueActionDetails({
            objective: actionViewModel.objective,
            instruments: actionViewModel.instruments,
            levers: actionViewModel.levers,
            sectors: actionViewModel.sectors,
            supplyChainFocusDecision: actionViewModel.supplyChainFocusDecision,
            supplyChainActionAngles: actionViewModel.supplyChainActionAngles,
            supplyChainAreas: actionViewModel.supplyChainAreas,
            supplyChainFocuses: actionViewModel.supplyChainFocuses,
            implementation: actionViewModel.implementation,
            legislativeOptions: actionViewModel.legislativeOptions,
            enforcementTimeline: actionViewModel.enforcementTimeline,
            scribeHandoff: BLUE_ACTION_SCRIBE_HANDOFF.FORWARDED,
            coordinatedDecision: formatScribeDecision(selections.coordinatedDecision),
            coordinated: selections.coordinatedValues || [],
            informedEngagedDecision: formatScribeDecision(selections.informedEngagedDecision),
            informed: selections.informedValues || [],
            notificationTeams: actionViewModel.notificationTeams,
            notificationNote: actionViewModel.notificationNote
        });
    }

    async projectScribeAction(actionId = '') {
        if (!actionId) {
            return;
        }

        this.setSlideByKey(`action-${actionId}`);

        if (!this.isPresentationModeActive()) {
            await this.togglePresentationMode();
        }
    }

    async confirmSubmitScribeAction(actionId = '', panel = null) {
        const action = this.teamActions.find((candidate) => candidate?.id === actionId);
        if (!action) {
            showToast({ message: 'Action not found. Refresh the facilitator view and try again.', type: 'error' });
            return;
        }

        if (!isDraftAction(action)) {
            showToast({ message: 'This revision has already been submitted and is read-only.', type: 'error' });
            return;
        }

        const isReturned = getArtifactLifecycleViewModel(action).isReturned;

        if (isStrategicOrientationAction(action)) {
            if (!isStrategicOrientationForwardedToScribe(action)) {
                showToast({ message: 'Only scribe-forwarded Strategic Orientation drafts can be submitted by the facilitator.', type: 'error' });
                return;
            }

            const viewModel = getStrategicOrientationViewModel(action);
            const confirmed = await confirmModal({
                title: 'Submit Strategic Orientation to White Cell',
                message: `${isReturned ? 'Resubmit' : 'Submit'} ${viewModel.title} to White Cell? The artifact will become read-only for Scribe and Facilitator seats.`,
                confirmLabel: isReturned ? 'Resubmit' : 'Submit',
                variant: 'primary'
            });

            if (!confirmed) {
                return;
            }

            await this.submitScribeAction(action);
            return;
        }

        if (isProposalAction(action)) {
            if (!isProposalForwardedToScribe(action)) {
                showToast({ message: 'Only scribe-forwarded proposal drafts can be submitted by the facilitator.', type: 'error' });
                return;
            }

            const viewModel = getProposalViewModel(action);
            const recipientLabel = viewModel.recipientTeam === 'red' ? 'Red Team' : 'Blue Team';
            const confirmed = await confirmModal({
                title: 'Submit Proposal to White Cell',
                message: `Submit ${viewModel.title} to White Cell for review (intended recipient: ${recipientLabel})? The proposal will become read-only for Scribe and Facilitator seats.`,
                confirmLabel: 'Submit',
                variant: 'primary'
            });

            if (!confirmed) {
                return;
            }

            await this.submitScribeAction(action);
            return;
        }

        if (!isBlueActionForwardedToScribe(action)) {
            showToast({ message: 'Only scribe-forwarded draft actions can be submitted by the facilitator.', type: 'error' });
            return;
        }

        const selections = this.getScribeActionSelections(panel);
        if (!this.isScribeActionSelectionsComplete(selections)) {
            showToast({ message: 'Select Coordinated and Informed/Engaged details before submitting.', type: 'error' });
            return;
        }

        const confirmed = await confirmModal({
            title: 'Submit Action to White Cell',
            message: `${isReturned ? 'Resubmit this corrected' : 'Submit this completed'} action to White Cell? The action will become read-only for Scribe and Facilitator seats.`,
            confirmLabel: isReturned ? 'Resubmit' : 'Submit',
            variant: 'primary'
        });

        if (!confirmed) {
            return;
        }

        await this.submitScribeAction(action, selections);
    }

    async submitScribeAction(action = {}, selections = {}) {
        const wasReturned = getArtifactLifecycleViewModel(action).isReturned;
        if (isStrategicOrientationAction(action)) {
            await this.submitScribeStrategicOrientation(action);
            return;
        }

        if (isProposalAction(action)) {
            await this.submitScribeProposal(action);
            return;
        }

        if (!isDraftAction(action) || !isBlueActionForwardedToScribe(action)) {
            showToast({ message: 'Only scribe-forwarded draft actions can be submitted by the facilitator.', type: 'error' });
            return;
        }

        const loader = showLoader({ message: 'Submitting action to White Cell...' });

        try {
            const completedDetails = this.buildCompletedActionDetails(action, selections);
            const updatedDraft = await database.updateDraftAction(action.id, {
                ally_contingencies: completedDetails
            });
            actionsStore.updateFromServer('UPDATE', updatedDraft);

            const submittedAction = await database.submitAction(action.id);
            actionsStore.updateFromServer('UPDATE', submittedAction);

            const timelineEvent = await database.createTimelineEvent({
                session_id: submittedAction.session_id || action.session_id,
                type: 'ACTION_SUBMITTED',
                content: `Action submitted to White Cell by Facilitator: ${submittedAction.goal || action.goal || 'Untitled action'}`,
                metadata: {
                    related_id: submittedAction.id || action.id,
                    role: this.role || this.teamContext.scribeRole,
                    submitted_by: 'facilitator',
                    legacy_submitted_by: 'scribe',
                    revision_number: submittedAction.revision_number || action.revision_number || 1,
                    workflow_state: submittedAction.workflow_state || null,
                    ...buildScribeSubmissionMetadata(selections)
                },
                team: this.teamId,
                move: submittedAction.move ?? action.move ?? 1,
                phase: submittedAction.phase ?? action.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({
                message: wasReturned ? 'Action resubmitted to White Cell' : 'Action submitted to White Cell',
                type: 'success'
            });
        } catch (error) {
            logger.error('Failed to submit facilitator action:', error);
            showToast({ message: 'Failed to submit action. Refresh the facilitator view and try again.', type: 'error' });
        } finally {
            hideLoader();
        }
    }

    async submitScribeProposal(action = {}) {
        if (!isDraftAction(action) || !isProposalForwardedToScribe(action)) {
            showToast({ message: 'Only scribe-forwarded proposal drafts can be submitted by the facilitator.', type: 'error' });
            return;
        }

        const viewModel = getProposalViewModel(action);
        const recipientLabel = formatProposalRecipientTeams(viewModel.recipientTeams);
        const wasReturned = getArtifactLifecycleViewModel(action).isReturned;
        const loader = showLoader({ message: 'Submitting proposal to White Cell...' });

        try {
            const submittedAction = await database.submitAction(action.id);
            actionsStore.updateFromServer('UPDATE', submittedAction);

            const timelineEvent = await database.createTimelineEvent({
                session_id: submittedAction.session_id || action.session_id,
                type: 'PROPOSAL_SUBMITTED',
                content: `Proposal submitted to White Cell by Facilitator (intended recipient: ${recipientLabel}): ${submittedAction.goal || action.goal || viewModel.title}`,
                metadata: {
                    related_id: submittedAction.id || action.id,
                    role: this.role || this.teamContext.scribeRole,
                    submitted_by: 'facilitator',
                    legacy_submitted_by: 'scribe',
                    proposal: true,
                    recipient_team: viewModel.recipientTeam || null,
                    recipient_teams: viewModel.recipientTeams,
                    revision_number: submittedAction.revision_number || action.revision_number || 1,
                    review_stage: 'white_cell_review'
                },
                team: this.teamId,
                move: submittedAction.move ?? action.move ?? 1,
                phase: submittedAction.phase ?? action.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            this.closePresentationEditPanel();
            showToast({
                message: wasReturned
                    ? `Proposal revision resubmitted to White Cell for ${recipientLabel}.`
                    : `Proposal submitted to White Cell. Each selected recipient (${recipientLabel}) awaits White Cell approval.`,
                type: 'success'
            });
        } catch (error) {
            logger.error('Failed to submit proposal:', error);
            showToast({ message: 'Failed to submit proposal. Refresh the facilitator view and try again.', type: 'error' });
        } finally {
            hideLoader();
        }
    }

    async submitScribeStrategicOrientation(action = {}) {
        if (!isDraftAction(action) || !isStrategicOrientationForwardedToScribe(action)) {
            showToast({ message: 'Only scribe-forwarded Strategic Orientation drafts can be submitted by the facilitator.', type: 'error' });
            return;
        }

        const viewModel = getStrategicOrientationViewModel(action);
        const wasReturned = getArtifactLifecycleViewModel(action).isReturned;
        const loader = showLoader({ message: 'Submitting Strategic Orientation to White Cell...' });

        try {
            const submittedAction = await database.submitAction(action.id);
            actionsStore.updateFromServer('UPDATE', submittedAction);

            const timelineEvent = await database.createTimelineEvent({
                session_id: submittedAction.session_id || action.session_id,
                type: 'STRATEGIC_ORIENTATION_SUBMITTED',
                content: `Strategic Orientation submitted to White Cell by Facilitator: ${submittedAction.goal || action.goal || viewModel.title}`,
                metadata: {
                    related_id: submittedAction.id || action.id,
                    role: this.role || this.teamContext.scribeRole,
                    submitted_by: 'facilitator',
                    legacy_submitted_by: 'scribe',
                    strategic_orientation: true,
                    period: STRATEGIC_ORIENTATION_PERIOD,
                    artifact_type: viewModel.artifactType,
                    orientation: viewModel.orientation,
                    revision_number: submittedAction.revision_number || action.revision_number || 1,
                    workflow_state: submittedAction.workflow_state || null
                },
                team: this.teamId,
                move: submittedAction.move ?? action.move ?? 1,
                phase: submittedAction.phase ?? action.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({
                message: wasReturned
                    ? 'Strategic Orientation resubmitted to White Cell'
                    : 'Strategic Orientation submitted to White Cell',
                type: 'success'
            });
        } catch (error) {
            logger.error('Failed to submit Strategic Orientation:', error);
            showToast({ message: 'Failed to submit Strategic Orientation. Refresh the facilitator view and try again.', type: 'error' });
        } finally {
            hideLoader();
        }
    }

    renderOwnProposalSlide(slide, viewModel = getProposalViewModel(slide.action || {})) {
        const action = slide.action || {};
        const isDraftPreview = isDraftAction(action);
        const lifecycle = getArtifactLifecycleViewModel(action);
        const recipientLabel = formatProposalRecipientTeams(viewModel.recipientTeams);
        const returnNotes = action.review_notes || action.adjudication_notes || '';

        return `
            <article class="scribe-action-slide scribe-own-proposal-slide" data-action-id="${escapeHtml(String(action.id || ''))}">
                <header class="scribe-action-slide-header">
                    <div>
                        <p class="scribe-action-slide-eyebrow">${escapeHtml(this.teamLabel)} Proposal</p>
                        <h2 class="scribe-action-slide-title">${escapeHtml(viewModel.title)}</h2>
                        <p class="scribe-action-slide-summary">Intended recipient: ${escapeHtml(recipientLabel)}</p>
                    </div>
                </header>

                <section class="scribe-action-slide-panel">
                    <section class="scribe-action-slide-lead" aria-label="Proposal objective">
                        <p class="scribe-action-slide-section-label">Objective</p>
                        <p class="scribe-action-slide-body">${escapeHtml(viewModel.objective || 'No objective provided.')}</p>
                    </section>

                    <section
                        class="scribe-action-slide-glance"
                        aria-label="${escapeHtml(`${this.teamLabel} proposal details for presentation and review`)}"
                    >
                        <div class="scribe-action-slide-section-header">
                            <h3 class="scribe-action-slide-section-title">Full proposal details</h3>
                        </div>
                        <div class="scribe-action-slide-glance-grid scribe-action-slide-glance-grid--components">
                            ${viewModel.artifactDetails.map((field) => renderActionSlideGlanceCard(field)).join('')}
                        </div>
                    </section>

                    <section
                        class="scribe-action-slide-lead scribe-action-slide-lead--outcome"
                        aria-label="Expected outcomes and duration assessment"
                    >
                        <p class="scribe-action-slide-section-label">Expected Outcome(s) &amp; Duration Assessment</p>
                        <p class="scribe-action-slide-body">${escapeHtml(viewModel.expectedOutcomes || 'Not specified')}</p>
                    </section>

                    ${this.renderOwnProposalProcess(action, viewModel)}

                    ${lifecycle.isReturned ? `
                        <section class="scribe-action-slide-return" aria-label="White Cell proposal return details">
                            <p><strong>Returned by White Cell.</strong> Edit this logical proposal and resubmit it after addressing the reviewer notes.</p>
                            <p><strong>Reviewer notes:</strong> ${escapeHtml(returnNotes || 'No return notes recorded.')}</p>
                            <p><strong>Revision:</strong> ${escapeHtml(String(action.revision_number || 1))}</p>
                            <p><strong>Proposal ID:</strong> ${escapeHtml(String(action.id || 'Not available'))}</p>
                        </section>
                    ` : ''}

                    ${isDraftPreview ? `
                        <section
                            class="scribe-action-slide-submit-panel"
                            data-scribe-action-submit-panel
                            data-action-id="${escapeHtml(String(action.id || ''))}"
                            aria-label="Facilitator proposal submission controls"
                        >
                            <div class="scribe-action-slide-submit-head">
                                <div>
                                    <p class="scribe-action-slide-section-label">Facilitator-to-White Cell handoff</p>
                                    <h3 class="scribe-action-slide-submit-title">Project the proposal, then send to White Cell</h3>
                                </div>
                                <div class="scribe-action-slide-submit-actions">
                                    <button
                                        type="button"
                                        class="btn btn-secondary"
                                        data-scribe-action-edit
                                        data-action-id="${escapeHtml(String(action.id || ''))}"
                                    >Edit</button>
                                    <button
                                        type="button"
                                        class="btn btn-primary"
                                        data-scribe-action-submit
                                        data-action-id="${escapeHtml(String(action.id || ''))}"
                                    >${lifecycle.isReturned ? 'Resubmit to White Cell' : 'Forward to White Cell'}</button>
                                </div>
                            </div>
                        </section>
                    ` : ''}
                </section>

                ${this.renderPresentationToolbar(action)}
            </article>
        `;
    }

    renderOwnProposalProcess(action = {}, viewModel = getProposalViewModel(action)) {
        const communication = this.getAuthoredProposalCommunication(action);
        const recipientLabel = this.getTeamLabel(
            communication?.metadata?.recipient_team || viewModel.recipientTeam || ''
        );
        const statusId = `own-proposal-process-${String(action.id || 'proposal').replace(/[^a-z0-9]+/gi, '-')}`;

        if (!communication) {
            const lifecycle = getArtifactLifecycleViewModel(action);
            const reviewed = isAdjudicatedAction(action);
            const submitted = isSubmittedAction(action);
            const stageLabel = lifecycle.isReturned
                ? 'Returned by White Cell'
                : reviewed
                ? 'White Cell review complete'
                : (submitted ? 'With White Cell' : 'Ready for White Cell');
            const detail = lifecycle.isReturned
                ? 'Address the reviewer notes, preserve this proposal ID, and resubmit the next revision.'
                : reviewed
                ? 'White Cell completed its review. No recipient handoff is recorded yet.'
                : (submitted
                    ? 'White Cell is reviewing this proposal before it is forwarded to the intended recipient.'
                    : 'Review this proposal with the room, then forward it to White Cell.');

            return `
                <section class="scribe-proposal-decision-panel scribe-own-proposal-process" aria-labelledby="${escapeHtml(statusId)}">
                    <div>
                        <p class="scribe-action-slide-section-label">Proposal process</p>
                        <p id="${escapeHtml(statusId)}" class="scribe-proposal-decision-status" role="status" aria-live="polite">
                            <strong>Current stage:</strong> ${escapeHtml(stageLabel)}
                        </p>
                        <p class="scribe-proposal-negotiation-terms">${escapeHtml(detail)}</p>
                    </div>
                </section>
            `;
        }

        const recipientEntry = getProposalRecipientEntry(communication);
        const status = getProposalRecipientStatus(communication);
        const decision = String(
            recipientEntry?.facilitator_decision || communication?.metadata?.facilitator_decision || ''
        ).trim().toLowerCase();
        const isNegotiation = isProposalNegotiationRequest(communication);
        const isAccepted = decision === FACILITATOR_PROPOSAL_DECISIONS.ACCEPT
            || String(recipientEntry?.response_content || '').trim().toLowerCase() === 'accepted';
        const stageLabel = isNegotiation
            ? 'Negotiation requested'
            : (isAccepted
                ? 'Accepted'
                : (status === PROPOSAL_RECIPIENT_STATUSES.DECLINED
                    || decision === FACILITATOR_PROPOSAL_DECISIONS.NOT_INTERESTED
                    ? 'Declined'
                    : ({
                        [PROPOSAL_RECIPIENT_STATUSES.ACKNOWLEDGED]: 'Under review',
                        [PROPOSAL_RECIPIENT_STATUSES.RESPONDED]: 'Response received',
                        [PROPOSAL_RECIPIENT_STATUSES.IGNORED]: 'Closed without response',
                        [PROPOSAL_RECIPIENT_STATUSES.UNREAD]: 'Awaiting recipient response'
                    }[status] || 'Awaiting recipient response')));
        const detail = isNegotiation
            ? `${recipientLabel} wants to negotiate this proposal.`
            : (isAccepted
                ? `${recipientLabel} accepted this proposal.`
                : (status === PROPOSAL_RECIPIENT_STATUSES.DECLINED
                    || decision === FACILITATOR_PROPOSAL_DECISIONS.NOT_INTERESTED
                    ? `${recipientLabel} recorded Not Interested and declined this proposal.`
                    : ({
                        [PROPOSAL_RECIPIENT_STATUSES.ACKNOWLEDGED]: `${recipientLabel} opened this proposal and is reviewing it.`,
                        [PROPOSAL_RECIPIENT_STATUSES.RESPONDED]: `${recipientLabel} sent a response.`,
                        [PROPOSAL_RECIPIENT_STATUSES.IGNORED]: `${recipientLabel} closed this proposal without a response.`,
                        [PROPOSAL_RECIPIENT_STATUSES.UNREAD]: `Waiting for ${recipientLabel} to review this proposal.`
                    }[status] || `Waiting for ${recipientLabel} to review this proposal.`)));
        const responseAt = recipientEntry?.response_sent_at
            || recipientEntry?.responded_at
            || recipientEntry?.actioned_at
            || null;
        const timestamp = responseAt ? formatRelativeTime(responseAt) : '';
        const responseContent = String(recipientEntry?.response_content || '').trim();
        const showResponseContent = responseContent
            && (!isAccepted || responseContent.toLowerCase() !== 'accepted')
            && !(status === PROPOSAL_RECIPIENT_STATUSES.DECLINED
                && responseContent.toLowerCase() === 'not interested');

        return `
            <section
                class="scribe-proposal-decision-panel scribe-own-proposal-process"
                data-proposal-process-status="${escapeHtml(stageLabel.toLowerCase().replace(/\s+/g, '-'))}"
                aria-labelledby="${escapeHtml(statusId)}"
            >
                <div>
                    <p class="scribe-action-slide-section-label">Proposal process</p>
                    <p id="${escapeHtml(statusId)}" class="scribe-proposal-decision-status" role="status" aria-live="polite">
                        <strong>Current stage:</strong> ${escapeHtml(stageLabel)}
                    </p>
                    <p class="scribe-proposal-negotiation-terms">
                        ${escapeHtml(detail)}${timestamp ? ` ${escapeHtml(timestamp)}.` : ''}
                    </p>
                    ${showResponseContent ? `
                        <p class="scribe-proposal-negotiation-terms">
                            <strong>${isNegotiation ? 'Negotiation terms' : 'Recipient response'}:</strong>
                            ${escapeHtml(responseContent)}
                        </p>
                    ` : ''}
                </div>
            </section>
        `;
    }

    renderStrategicOrientationSlide(slide, viewModel = getStrategicOrientationViewModel(slide.action || {})) {
        const action = slide.action || {};
        const isDraftPreview = isDraftAction(action);
        const lifecycleArtifact = getActionSlideLifecycleArtifact(action);
        const lifecycle = getArtifactLifecycleViewModel(lifecycleArtifact);
        const returnNotes = action.review_notes || action.adjudication_notes || '';
        const forecastRows = viewModel.isForecast
            ? (viewModel.forecastTargets.length
                ? viewModel.forecastTargets
                : [{
                    key: 'blue',
                    label: 'Blue',
                    orientationLabel: viewModel.orientationLabel,
                    orientationTag: viewModel.orientationTag
                }])
            : [];
        const scribeSubmissionControls = isDraftPreview
            ? this.renderScribeStrategicOrientationSubmissionControls(action, viewModel)
            : '';

        return `
            <article class="scribe-action-slide scribe-orientation-slide" data-action-id="${escapeHtml(String(action.id || ''))}">
                <header class="scribe-action-slide-header">
                    <div>
                        <p class="scribe-action-slide-eyebrow">${escapeHtml(viewModel.teamLabel)}</p>
                        <h2 class="scribe-action-slide-title">${viewModel.isForecast ? 'Strategic Orientation Forecast' : 'Strategic Orientation'}</h2>
                    </div>
                    <div class="scribe-action-slide-status">
                        ${createArtifactLifecycleBadge(lifecycleArtifact, { size: 'sm' }).outerHTML}
                        ${lifecycle.isAwaitingWhiteCell
                            ? createBadge({ text: 'Deliberation Underway', variant: 'warning', size: 'sm', rounded: true }).outerHTML
                            : ''}
                    </div>
                </header>

                <section class="scribe-action-slide-panel">
                    <section class="scribe-action-slide-glance" aria-label="Strategic Orientation">
                        <div class="scribe-action-slide-section-header">
                            <h3 class="scribe-action-slide-section-title">${viewModel.isForecast ? (forecastRows.length > 1 ? 'Forecasted team postures' : 'Forecasted Blue posture') : 'Selected strategic posture'}</h3>
                        </div>
                        <div class="scribe-action-slide-glance-grid scribe-action-slide-glance-grid--components">
                            ${viewModel.isForecast
                ? forecastRows.map((forecast) => renderActionSlideGlanceCard({
                    label: forecast.label,
                    value: forecast.orientationLabel,
                    support: forecast.orientationTag || 'Tag pending'
                })).join('')
                : renderActionSlideGlanceCard({
                    label: 'Orientation',
                    value: viewModel.orientationLabel,
                    support: viewModel.orientationTag || 'Tag pending'
                })}
                            ${!viewModel.isForecast && viewModel.primaryLevers.length
                ? renderActionSlideGlanceCard({
                    label: 'Primary levers',
                    value: formatBlueActionSelection(viewModel.primaryLevers)
                })
                : ''}
                            ${!viewModel.isForecast && viewModel.acceptedCosts.length
                ? renderActionSlideGlanceCard({
                    label: 'Accepted costs',
                    value: formatBlueActionSelection(viewModel.acceptedCosts)
                })
                : ''}
                            ${!viewModel.isForecast && viewModel.posture
                ? renderActionSlideGlanceCard({
                    label: 'Posture',
                    value: viewModel.posture
                })
                : ''}
                        </div>
                    </section>

                    <section class="scribe-action-slide-lead" aria-label="Team rationale">
                        <p class="scribe-action-slide-section-label">Team rationale</p>
                        <p class="scribe-action-slide-body">${escapeHtml(viewModel.rationale || 'No rationale provided.')}</p>
                    </section>

                    ${lifecycle.isReturned ? `
                        <section class="scribe-action-slide-return" aria-label="White Cell return details">
                            <p><strong>White Cell notes:</strong> ${escapeHtml(returnNotes || 'No return notes recorded.')}</p>
                            <p><strong>Revision:</strong> ${escapeHtml(String(action.revision_number || 1))}</p>
                        </section>
                    ` : ''}

                    ${scribeSubmissionControls}
                </section>

                ${this.renderPresentationToolbar(action)}
            </article>
        `;
    }

    renderProposalSlide(slide = {}) {
        if (slide.slideType === 'proposal-placeholder') {
            return `
                <article class="scribe-action-slide scribe-action-slide-placeholder scribe-proposal-slide">
                    <p class="scribe-action-slide-eyebrow">Received Proposals</p>
                    <h2 class="scribe-action-slide-title">${escapeHtml(slide.title)}</h2>
                    <p class="scribe-action-slide-summary">${escapeHtml(slide.summary || '')}</p>
                </article>
            `;
        }

        const communication = slide.communication || {};
        const { metadata, proposal, title, sourceTeam } = getProposalSnapshot(communication);
        const recipientEntry = getProposalRecipientEntry(communication);
        const status = getProposalRecipientStatus(communication);
        const isFinal = isProposalRecipientFinal(communication);
        const decision = recipientEntry?.facilitator_decision || '';
        const decisionLabel = {
            [FACILITATOR_PROPOSAL_DECISIONS.ACCEPT]: 'Accepted',
            [FACILITATOR_PROPOSAL_DECISIONS.NOT_INTERESTED]: 'Not Interested',
            [FACILITATOR_PROPOSAL_DECISIONS.NEGOTIATE]: 'Negotiation requested'
        }[decision] || formatProposalRecipientStatus(status);
        const decisionStatusId = `proposal-decision-status-${String(communication.id || 'proposal').replace(/[^a-z0-9]+/gi, '-')}`;
        const formatList = (value) => Array.isArray(value) && value.length
            ? value.join(', ')
            : (value || 'Not specified');

        return `
            <article class="scribe-action-slide scribe-proposal-slide" data-proposal-communication-id="${escapeHtml(String(communication.id || ''))}">
                <header class="scribe-action-slide-header">
                    <div>
                        <p class="scribe-action-slide-eyebrow">Proposal from ${escapeHtml(formatTeamLabel(sourceTeam))}</p>
                        <h2 class="scribe-action-slide-title">${escapeHtml(title)}</h2>
                        <p class="scribe-action-slide-summary">Forwarded by White Cell for ${escapeHtml(this.teamLabel)} consideration.</p>
                    </div>
                </header>

                <section class="scribe-action-slide-panel">
                    <section class="scribe-action-slide-lead" aria-label="Proposal objective">
                        <p class="scribe-action-slide-section-label">Objective</p>
                        <p class="scribe-action-slide-body">${escapeHtml(proposal.objective || 'No objective provided.')}</p>
                    </section>

                    <section class="scribe-action-slide-glance" aria-label="Proposal details">
                        <div class="scribe-action-slide-section-header">
                            <h3 class="scribe-action-slide-section-title">Proposal details</h3>
                        </div>
                        <div class="scribe-action-slide-glance-grid scribe-action-slide-glance-grid--components">
                            ${renderActionSlideGlanceCard({ label: 'Originators', value: formatList(proposal.originators) })}
                            ${(proposal.instruments?.length || proposal.category) ? renderActionSlideGlanceCard({
                                label: sourceTeam === 'industry' || proposal.instruments?.length
                                    ? 'Instrument of Power'
                                    : 'Category (historical)',
                                value: formatList(proposal.instruments?.length ? proposal.instruments : proposal.category)
                            }) : ''}
                            ${renderActionSlideGlanceCard({
                                label: 'Intended partners',
                                value: proposal.recipientTeams?.length
                                    ? formatProposalRecipientTeams(proposal.recipientTeams)
                                    : (proposal.intendedPartners || 'Not specified')
                            })}
                            ${renderActionSlideGlanceCard({
                                label: 'Focus sectors',
                                value: formatList(proposal.focusSectors?.length
                                    ? proposal.focusSectors
                                    : (proposal.focusSector ? [proposal.focusSector] : []))
                            })}
                            ${proposal.supplyChainFocusDecision ? renderActionSlideGlanceCard({ label: 'Supply chain focus', value: proposal.supplyChainFocusDecision }) : ''}
                            ${proposal.supplyChainActionAngles?.length ? renderActionSlideGlanceCard({ label: 'Action angles', value: formatList(proposal.supplyChainActionAngles) }) : ''}
                            ${proposal.supplyChainAreas?.length ? renderActionSlideGlanceCard({ label: 'Supply chain areas', value: formatList(proposal.supplyChainAreas) }) : ''}
                            ${proposal.industryFocus ? renderActionSlideGlanceCard({ label: 'Industry of focus', value: proposal.industryFocus }) : ''}
                            ${proposal.countryFocus ? renderActionSlideGlanceCard({ label: 'Country of focus', value: proposal.countryFocus }) : ''}
                            ${proposal.proposedActivity ? renderActionSlideGlanceCard({ label: 'Proposed activity', value: proposal.proposedActivity }) : ''}
                            ${proposal.delivery ? renderActionSlideGlanceCard({ label: 'Delivery (historical)', value: proposal.delivery }) : ''}
                            ${renderActionSlideGlanceCard({ label: 'Timing and conditions', value: proposal.timingAndConditions || 'Not specified' })}
                        </div>
                    </section>

                    ${proposal.expectedOutcomes ? `
                        <section class="scribe-action-slide-lead scribe-action-slide-lead--outcome" aria-label="Expected outcomes">
                            <p class="scribe-action-slide-section-label">Expected outcomes</p>
                            <p class="scribe-action-slide-body">${escapeHtml(proposal.expectedOutcomes)}</p>
                        </section>
                    ` : ''}

                    <section class="scribe-proposal-decision-panel" aria-labelledby="${escapeHtml(decisionStatusId)}">
                        <div>
                            <p class="scribe-action-slide-section-label">Facilitator response</p>
                            <p id="${escapeHtml(decisionStatusId)}" class="scribe-proposal-decision-status" role="status" aria-live="polite">
                                ${isFinal ? `Recorded response: ${escapeHtml(decisionLabel)}` : 'Choose one response. It will be shared with White Cell and the proposing team.'}
                            </p>
                            ${decision === FACILITATOR_PROPOSAL_DECISIONS.NEGOTIATE && recipientEntry?.response_content
                ? `<p class="scribe-proposal-negotiation-terms"><strong>Negotiation terms:</strong> ${escapeHtml(recipientEntry.response_content)}</p>`
                : ''}
                        </div>
                        <div class="scribe-proposal-decision-actions" role="group" aria-label="Proposal response options">
                            <button type="button" class="btn btn-primary" data-facilitator-proposal-decision="accept" data-proposal-communication-id="${escapeHtml(String(communication.id || ''))}" aria-describedby="${escapeHtml(decisionStatusId)}" ${isFinal ? 'disabled' : ''}>Accept</button>
                            <button type="button" class="btn btn-secondary" data-facilitator-proposal-decision="not_interested" data-proposal-communication-id="${escapeHtml(String(communication.id || ''))}" aria-describedby="${escapeHtml(decisionStatusId)}" ${isFinal ? 'disabled' : ''}>Not Interested</button>
                            <button type="button" class="btn btn-secondary" data-facilitator-proposal-decision="negotiate" data-proposal-communication-id="${escapeHtml(String(communication.id || ''))}" aria-describedby="${escapeHtml(decisionStatusId)}" ${isFinal ? 'disabled' : ''}>Negotiate</button>
                        </div>
                    </section>
                </section>
            </article>
        `;
    }

    async handleFacilitatorProposalDecision(communicationId = '', decision = '') {
        const communication = this.receivedProposals.find((entry) => entry?.id === communicationId);
        if (!communication) {
            showToast({ message: 'Proposal not found. Refresh the facilitator view and try again.', type: 'error' });
            return;
        }

        if (isProposalRecipientFinal(communication)) {
            showToast({ message: 'This proposal response is already recorded.', type: 'error' });
            return;
        }

        if (decision === FACILITATOR_PROPOSAL_DECISIONS.NEGOTIATE) {
            this.showProposalNegotiationModal(communication);
            return;
        }

        const decisionLabel = decision === FACILITATOR_PROPOSAL_DECISIONS.ACCEPT
            ? 'Accept'
            : decision === FACILITATOR_PROPOSAL_DECISIONS.NOT_INTERESTED
                ? 'Not Interested'
                : '';
        if (!decisionLabel) {
            showToast({ message: 'Choose a valid proposal response.', type: 'error' });
            return;
        }

        const confirmed = await confirmModal({
            title: `${decisionLabel} Proposal`,
            message: `Record "${decisionLabel}" for ${getProposalSnapshot(communication).title}? This response is final and will be shared with White Cell and the proposing team.`,
            confirmLabel: decisionLabel,
            variant: decision === FACILITATOR_PROPOSAL_DECISIONS.ACCEPT ? 'primary' : 'secondary'
        });

        if (confirmed) {
            await this.submitFacilitatorProposalDecision(communication, decision);
        }
    }

    showProposalNegotiationModal(communication = {}) {
        const proposalTitle = getProposalSnapshot(communication).title;
        const content = document.createElement('div');
        content.innerHTML = `
            <form id="facilitatorProposalNegotiationForm" novalidate>
                <p class="form-help">Describe the terms or changes ${this.teamLabel} wants to negotiate for <strong>${escapeHtml(proposalTitle)}</strong>.</p>
                <div class="form-group">
                    <label class="form-label" for="facilitatorProposalNegotiationTerms">Negotiation terms *</label>
                    <textarea id="facilitatorProposalNegotiationTerms" class="form-input form-textarea" rows="5" aria-describedby="facilitatorProposalNegotiationHelp" required></textarea>
                    <p class="form-help" id="facilitatorProposalNegotiationHelp">This response is final and will be shared with White Cell and the proposing team.</p>
                </div>
            </form>
        `;

        const modalRef = { current: null };
        modalRef.current = showModal({
            title: 'Negotiate Proposal',
            content,
            size: 'md',
            buttons: [
                { label: 'Cancel', variant: 'secondary', onClick: () => {} },
                {
                    label: 'Send Negotiation',
                    variant: 'primary',
                    onClick: () => {
                        const terms = content.querySelector('#facilitatorProposalNegotiationTerms')?.value?.trim() || '';
                        if (!terms) {
                            showToast({ message: 'Negotiation terms are required.', type: 'error' });
                            return false;
                        }
                        void this.submitFacilitatorProposalDecision(
                            communication,
                            FACILITATOR_PROPOSAL_DECISIONS.NEGOTIATE,
                            terms
                        ).then((saved) => {
                            if (saved) {
                                modalRef.current?.close();
                            }
                        });
                        return false;
                    }
                }
            ]
        });
        content.querySelector('#facilitatorProposalNegotiationTerms')?.focus?.();
    }

    async submitFacilitatorProposalDecision(communication = {}, decision = '', negotiationTerms = '') {
        const sessionId = sessionStore.getSessionId();
        const latestCommunication = communicationsStore.getAll()
            .find((entry) => entry?.id === communication?.id) || communication;
        if (!sessionId || !communication?.id) {
            showToast({ message: 'No active proposal session was found.', type: 'error' });
            return false;
        }
        if (isProposalRecipientFinal(latestCommunication)) {
            showToast({ message: 'This proposal response is already recorded.', type: 'error' });
            return false;
        }

        const decisionContract = getFacilitatorProposalDecisionContract(decision, negotiationTerms);

        if (!decisionContract || (decision === FACILITATOR_PROPOSAL_DECISIONS.NEGOTIATE && !decisionContract.responseContent)) {
            showToast({ message: 'A valid proposal response is required.', type: 'error' });
            return false;
        }

        const loader = showLoader({ message: 'Recording proposal response...' });
        try {
            const proposalSnapshot = getProposalSnapshot(latestCommunication);
            const responseSentAt = new Date().toISOString();
            const responseCommunication = await database.createCommunication({
                session_id: sessionId,
                from_role: this.role || this.teamContext.scribeRole,
                to_role: 'white_cell',
                type: 'PROPOSAL_RESPONSE',
                content: decisionContract.responseContent,
                metadata: {
                    source_proposal_id: proposalSnapshot.metadata.source_proposal_id || null,
                    source_communication_id: latestCommunication.id,
                    source_team: proposalSnapshot.sourceTeam,
                    responder_team: this.teamId,
                    facilitator_decision: decision
                }
            });
            communicationsStore.updateFromServer('INSERT', responseCommunication);

            const updatedProposal = await database.updateProposalRecipientStatus(
                latestCommunication.id,
                decisionContract.status,
                {
                    facilitator_decision: decision,
                    response_communication_id: responseCommunication.id,
                    responded_at: responseSentAt,
                    response_sent_at: responseSentAt,
                    response_content: decisionContract.responseContent,
                    response_from_role: this.role || this.teamContext.scribeRole,
                    response_from_team: this.teamId
                }
            );
            communicationsStore.updateFromServer('UPDATE', updatedProposal);

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: decisionContract.timelineType,
                content: `${decisionContract.label} proposal: ${proposalSnapshot.title}`,
                metadata: {
                    related_id: proposalSnapshot.metadata.source_proposal_id || null,
                    role: this.role || this.teamContext.scribeRole,
                    communication_id: latestCommunication.id,
                    response_communication_id: responseCommunication.id,
                    recipient_team: this.teamId,
                    status: decisionContract.status,
                    facilitator_decision: decision
                },
                team: this.teamId,
                move: latestCommunication.move ?? 1,
                phase: latestCommunication?.metadata?.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: `Proposal response recorded: ${decisionContract.label}`, type: 'success' });
            return true;
        } catch (error) {
            logger.error('Failed to save facilitator proposal decision:', error);
            showToast({ message: 'Failed to record the proposal response. Refresh proposals and try again.', type: 'error' });
            return false;
        } finally {
            hideLoader(loader);
        }
    }

    renderActionSlide(slide) {
        if (slide.slideType === 'action-placeholder') {
            return `
                <article class="scribe-action-slide scribe-action-slide-placeholder">
                    <p class="scribe-action-slide-eyebrow">Live Scribe Feed</p>
                    <h2 class="scribe-action-slide-title">${escapeHtml(slide.title)}</h2>
                    <p class="scribe-action-slide-summary">${escapeHtml(slide.summary || '')}</p>
                </article>
            `;
        }

        const action = slide.action || {};
        const strategicOrientation = slide.strategicOrientation || getStrategicOrientationViewModel(action);
        if (strategicOrientation.hasStrategicOrientationDetails) {
            return this.renderStrategicOrientationSlide(slide, strategicOrientation);
        }

        const proposalViewModel = slide.proposalViewModel || getProposalViewModel(action);
        if (proposalViewModel.hasProposalDetails || slide.slideType === 'own-proposal') {
            return this.renderOwnProposalSlide(slide, proposalViewModel);
        }

        const actionViewModel = slide.actionViewModel || getBlueActionViewModel(action);
        const isDraftPreview = isDraftAction(action);
        const lifecycleArtifact = getActionSlideLifecycleArtifact(action);
        const lifecycle = getArtifactLifecycleViewModel(lifecycleArtifact);
        const returnNotes = action.review_notes || action.adjudication_notes || '';
        const decisionBrief = actionViewModel.objective || 'No objective provided.';
        const expectedEffect = actionViewModel.expectedOutcomes || '';
        const showExpectedEffect = hasDistinctActionText(decisionBrief, expectedEffect);
        const legacyNotes = actionViewModel.legacyNotes
            ? `
                <section class="scribe-action-slide-note-card scribe-action-slide-note-card-secondary" aria-label="Supporting note">
                    <p class="scribe-action-slide-note-label">Supporting note</p>
                    <p class="scribe-action-slide-note-body">${escapeHtml(actionViewModel.legacyNotes)}</p>
                </section>
            `
            : '';
        const scribeSubmissionControls = isDraftPreview
            ? this.renderScribeActionSubmissionControls(action, actionViewModel)
            : '';
        const actionId = String(action.id || '');
        const detailsId = `scribe-action-details-${actionId.replace(/[^a-z0-9]+/gi, '-') || 'slide'}`;
        const isExpanded = this.isStrategicActionCardExpanded(actionId);
        const objectivePreview = actionViewModel.objective || 'Not specified';

        return `
            <article class="scribe-action-slide${isExpanded ? '' : ' is-collapsed'}" data-action-id="${escapeHtml(String(action.id || ''))}">
                <button
                    type="button"
                    class="scribe-action-card-toggle${isExpanded ? ' is-expanded' : ''}"
                    data-scribe-action-toggle
                    data-action-id="${escapeHtml(actionId)}"
                    aria-expanded="${isExpanded ? 'true' : 'false'}"
                    aria-controls="${escapeHtml(detailsId)}"
                >
                    <span class="scribe-action-card-toggle-copy">
                        <span class="scribe-action-card-toggle-label">Action details</span>
                        <span class="scribe-action-card-toggle-title">${escapeHtml(actionViewModel.title)}</span>
                        <span class="scribe-action-card-toggle-objective"><strong>Objective:</strong> ${escapeHtml(objectivePreview)}</span>
                    </span>
                    <span class="scribe-action-card-toggle-indicator" aria-hidden="true">${isExpanded ? 'Hide' : 'Show'}</span>
                </button>

                <div
                    id="${escapeHtml(detailsId)}"
                    class="scribe-action-slide-details"
                    ${isExpanded ? '' : 'hidden'}
                >
                    <header class="scribe-action-slide-header">
                        <div>
                            <p class="scribe-action-slide-eyebrow">${escapeHtml(this.teamLabel)} Action</p>
                            <h2 class="scribe-action-slide-title">${escapeHtml(actionViewModel.title)}</h2>
                        </div>
                        <div class="scribe-action-slide-status">
                            ${createArtifactLifecycleBadge(lifecycleArtifact, { size: 'sm' }).outerHTML}
                            ${lifecycle.isAwaitingWhiteCell
                                ? createBadge({ text: 'Deliberation Underway', variant: 'warning', size: 'sm', rounded: true }).outerHTML
                                : ''}
                        </div>
                    </header>

                    <section class="scribe-action-slide-panel">
                        <div class="scribe-action-slide-key-points${showExpectedEffect ? '' : ' scribe-action-slide-key-points--single'}">
                            <section class="scribe-action-slide-lead" aria-label="Objective">
                                <p class="scribe-action-slide-section-label">Objective</p>
                                <p class="scribe-action-slide-body">${escapeHtml(decisionBrief)}</p>
                            </section>
                            ${showExpectedEffect
                    ? `<section class="scribe-action-slide-lead scribe-action-slide-lead--outcome" aria-label="Expected outcome">
                            <p class="scribe-action-slide-section-label">Expected outcome</p>
                            <p class="scribe-action-slide-body">${escapeHtml(expectedEffect)}</p>
                        </section>`
                    : ''}
                        </div>

                        <section class="scribe-action-slide-glance" aria-label="Selected action components">
                            <div class="scribe-action-slide-section-header">
                                <h3 class="scribe-action-slide-section-title">Selected action components</h3>
                            </div>
                            <div class="scribe-action-slide-glance-grid scribe-action-slide-glance-grid--components scribe-action-slide-glance-grid--action-components">
                                ${actionViewModel.artifactDetails.map((field) => renderActionSlideGlanceCard(field)).join('')}
                            </div>
                        </section>

                        ${legacyNotes}
                        ${lifecycle.isReturned ? `
                            <section class="scribe-action-slide-return" aria-label="White Cell return details">
                                <p><strong>White Cell notes:</strong> ${escapeHtml(returnNotes || 'No return notes recorded.')}</p>
                                <p><strong>Revision:</strong> ${escapeHtml(String(action.revision_number || 1))}</p>
                            </section>
                        ` : ''}
                        ${scribeSubmissionControls}
                    </section>
                </div>

                ${this.renderPresentationToolbar(action, actionViewModel)}
            </article>
        `;
    }

    renderRfiSlide(slide = {}) {
        if (slide.slideType === 'rfi-placeholder') {
            return `
                <article class="scribe-action-slide scribe-action-slide-placeholder">
                    <p class="scribe-action-slide-eyebrow">Facilitator RFIs</p>
                    <h2 class="scribe-action-slide-title">${escapeHtml(slide.title)}</h2>
                    <p class="scribe-action-slide-summary">${escapeHtml(slide.summary || '')}</p>
                    <button type="button" class="btn btn-primary" data-facilitator-new-rfi>New RFI</button>
                </article>
            `;
        }

        const request = slide.request || {};
        const isReturned = request.workflow_state === 'returned_to_team';
        const categories = Array.isArray(request.categories) ? request.categories : [];
        return `
            <article class="scribe-action-slide facilitator-rfi-slide" data-rfi-id="${escapeHtml(String(request.id || ''))}">
                <header class="scribe-action-slide-header">
                    <div>
                        <p class="scribe-action-slide-eyebrow">${escapeHtml(this.teamLabel)} RFI</p>
                        <h2 class="scribe-action-slide-title">Request for Information</h2>
                    </div>
                    <div class="scribe-action-slide-status">
                        ${createArtifactLifecycleBadge(request, { size: 'sm' }).outerHTML}
                        ${createBadge({ text: `REV ${Number(request.revision_number) || 1}`, variant: 'info', size: 'sm', rounded: true }).outerHTML}
                    </div>
                </header>
                <section class="scribe-action-slide-panel">
                    <p class="scribe-action-slide-section-label">Question</p>
                    <p class="scribe-action-slide-body">${escapeHtml(request.query || request.question || '')}</p>
                    ${categories.length ? `<p class="scribe-action-slide-summary"><strong>Categories:</strong> ${escapeHtml(categories.join(', '))}</p>` : ''}
                    ${isReturned ? `
                        <section class="scribe-action-slide-return" role="status" aria-label="White Cell clarification request">
                            <p><strong>Returned for clarification:</strong> ${escapeHtml(request.review_notes || 'No notes recorded.')}</p>
                            <p>Edit and resubmit this same RFI revision.</p>
                        </section>
                    ` : ''}
                    ${request.response ? `
                        <section class="scribe-action-slide-note-card" aria-label="White Cell response">
                            <p class="scribe-action-slide-note-label">White Cell response</p>
                            <p class="scribe-action-slide-note-body">${escapeHtml(request.response)}</p>
                        </section>
                    ` : ''}
                    <div class="scribe-action-slide-submit-actions facilitator-workflow-actions">
                        <button type="button" class="btn btn-secondary" data-facilitator-new-rfi>New RFI</button>
                        ${isReturned ? `<button type="button" class="btn btn-primary" data-facilitator-edit-rfi data-rfi-id="${escapeHtml(String(request.id || ''))}">Edit and Resubmit</button>` : ''}
                    </div>
                </section>
            </article>
        `;
    }

    renderCommunicationSlide(slide = {}) {
        if (slide.slideType === 'communication-placeholder') {
            return `
                <article class="scribe-action-slide scribe-action-slide-placeholder">
                    <p class="scribe-action-slide-eyebrow">Direct Communications</p>
                    <h2 class="scribe-action-slide-title">${escapeHtml(slide.title)}</h2>
                    <p class="scribe-action-slide-summary">${escapeHtml(slide.summary || '')}</p>
                    <button type="button" class="btn btn-primary" data-facilitator-new-communication>Message White Cell</button>
                </article>
            `;
        }

        const communication = slide.communication || {};
        const isOutbound = communication.from_role === this.teamContext.scribeRole;
        return `
            <article class="scribe-action-slide facilitator-communication-slide">
                <header class="scribe-action-slide-header">
                    <div>
                        <p class="scribe-action-slide-eyebrow">${isOutbound ? 'Sent to White Cell' : 'From White Cell'}</p>
                        <h2 class="scribe-action-slide-title">Direct Communication</h2>
                    </div>
                    ${createBadge({ text: isOutbound ? 'OUTBOUND' : 'INBOUND', variant: isOutbound ? 'info' : 'warning', size: 'sm', rounded: true }).outerHTML}
                </header>
                <section class="scribe-action-slide-panel">
                    <p class="scribe-action-slide-body">${escapeHtml(communication.content || '')}</p>
                    <p class="scribe-action-slide-summary">${escapeHtml(formatRelativeTime(communication.created_at))}</p>
                    <div class="scribe-action-slide-submit-actions facilitator-workflow-actions">
                        <button type="button" class="btn btn-primary" data-facilitator-new-communication>Message White Cell</button>
                    </div>
                </section>
            </article>
        `;
    }

    showFacilitatorRfiModal(request = null) {
        if (request && request.workflow_state !== 'returned_to_team') {
            showToast({ message: 'Only an RFI returned for clarification can be edited.', type: 'error' });
            return;
        }

        const modalRef = { current: null };
        const form = createRfiForm({
            team: this.teamId,
            request,
            onCancel: () => modalRef.current?.close?.(),
            onSubmit: async (savedRequest) => {
                const gameState = gameStateStore.getState();
                const timelineEvent = await database.createTimelineEvent({
                    session_id: savedRequest.session_id || sessionStore.getSessionId(),
                    type: request ? 'RFI_RESUBMITTED' : 'RFI_CREATED',
                    content: `${this.teamLabel} ${request ? 'resubmitted' : 'submitted'} an RFI to White Cell.`,
                    metadata: {
                        related_id: savedRequest.id,
                        role: this.teamContext.scribeRole,
                        revision_number: savedRequest.revision_number || 1
                    },
                    team: this.teamId,
                    move: savedRequest.move ?? gameState?.move ?? 1,
                    phase: savedRequest.phase ?? gameState?.phase ?? 1
                });
                timelineStore.updateFromServer('INSERT', timelineEvent);
                modalRef.current?.close?.();
            }
        });

        modalRef.current = showModal({
            title: request ? 'Clarify and Resubmit RFI' : 'New Request for Information',
            content: form,
            size: 'md',
            buttons: []
        });
    }

    showFacilitatorCommunicationModal() {
        const content = document.createElement('div');
        content.innerHTML = `
            <form id="facilitatorCommunicationForm">
                <div class="form-group">
                    <label class="form-label" for="facilitatorCommunicationMessage">Message to White Cell *</label>
                    <textarea id="facilitatorCommunicationMessage" class="form-input form-textarea" rows="5" required maxlength="2000" aria-describedby="facilitatorCommunicationHint"></textarea>
                    <p class="form-hint" id="facilitatorCommunicationHint">This message is visible only within the current session to your Facilitator seat and White Cell.</p>
                </div>
            </form>
        `;
        const modalRef = { current: null };
        modalRef.current = showModal({
            title: 'Message White Cell',
            content,
            size: 'md',
            buttons: [
                { label: 'Cancel', variant: 'secondary', onClick: () => {} },
                {
                    label: 'Send Message',
                    variant: 'primary',
                    onClick: () => {
                        const message = content.querySelector('#facilitatorCommunicationMessage')?.value?.trim() || '';
                        if (!message) {
                            showToast({ message: 'Enter a message for White Cell.', type: 'error' });
                            content.querySelector('#facilitatorCommunicationMessage')?.focus?.();
                            return false;
                        }
                        this.sendFacilitatorCommunication(message, modalRef.current);
                        return false;
                    }
                }
            ]
        });
    }

    async sendFacilitatorCommunication(content, modal = null) {
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No active session.', type: 'error' });
            return;
        }

        const loader = showLoader({ message: 'Sending message to White Cell...' });
        try {
            const gameState = gameStateStore.getState();
            const communication = await database.createCommunication({
                session_id: sessionId,
                type: 'direct',
                from_role: this.teamContext.scribeRole,
                to_role: 'white_cell',
                content,
                metadata: {
                    source_team: this.teamId,
                    source_role: this.teamContext.scribeRole,
                    recipient: 'white_cell',
                    recipient_scope: 'whitecell'
                }
            });
            communicationsStore.updateFromServer('INSERT', communication);
            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'DIRECT_COMMUNICATION_SENT',
                content: `${this.teamLabel} Facilitator sent a direct message to White Cell.`,
                metadata: {
                    communication_id: communication.id,
                    recipient: 'white_cell',
                    recipient_scope: 'whitecell',
                    role: this.teamContext.scribeRole
                },
                team: this.teamId,
                move: gameState?.move ?? 1,
                phase: gameState?.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);
            showToast({ message: 'Message sent to White Cell', type: 'success' });
            modal?.close?.();
        } catch (error) {
            logger.error('Failed to send Facilitator communication:', error);
            showToast({
                message: getUserMessage(error, { fallback: 'Failed to send the message. Try again.' }),
                type: 'error'
            });
        } finally {
            hideLoader(loader);
        }
    }

    setSlideByIndex(index = 0) {
        if (!this.deckSlides.length) {
            return;
        }

        const nextIndex = clampSlideIndex(this.deckSlides, index);
        if (nextIndex === this.currentSlideIndex) {
            return;
        }

        this.currentSlideIndex = nextIndex;
        this.expandSectionForSlide(this.deckSlides[this.currentSlideIndex], { render: false });
        this.renderSlide();
    }

    setSlideByKey(slideKey = '') {
        const nextIndex = this.deckSlides.findIndex((slide) => getSlideKey(slide) === slideKey);
        if (nextIndex === -1) {
            return;
        }

        this.currentSlideIndex = nextIndex;
        this.expandSectionForSlide(this.deckSlides[this.currentSlideIndex], { render: false });
        this.renderSlide();
    }

    updateFacilitatorViewSwitch(activeView = 'deck') {
        const actionReviewButton = document.getElementById('teamActionReviewViewBtn');
        const deckButton = document.getElementById('deckViewBtn');

        [
            [actionReviewButton, activeView === 'actions'],
            [deckButton, activeView === 'deck']
        ].forEach(([button, isActive]) => {
            if (!button) {
                return;
            }

            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
    }

    setFacilitatorView(view = 'deck') {
        const normalizedView = view === 'actions' ? 'actions' : 'deck';
        const currentSlide = this.deckSlides[this.currentSlideIndex];
        const currentSectionIndex = getSectionIndexForSlideKey(
            this.sections,
            getSlideKey(currentSlide)
        );

        if (
            !LIVE_SECTION_IDS.includes(this.sections[currentSectionIndex]?.id)
            && currentSlide
        ) {
            this.lastDeckSlideKey = getSlideKey(currentSlide);
        }

        let targetSlide = null;
        if (normalizedView === 'actions') {
            targetSlide = this.sections.find((section) => section.id === ACTIONS_SECTION_ID)?.slides?.[0] || null;
        } else {
            targetSlide = this.deckSlides.find((slide) => (
                getSlideKey(slide) === this.lastDeckSlideKey
                && !LIVE_SECTION_IDS.includes(
                    this.sections[getSectionIndexForSlideKey(this.sections, getSlideKey(slide))]?.id
                )
            )) || this.deckSlides.find((slide) => (
                !LIVE_SECTION_IDS.includes(
                    this.sections[getSectionIndexForSlideKey(this.sections, getSlideKey(slide))]?.id
                )
            )) || null;
        }

        if (!targetSlide) {
            return;
        }

        this.setSlideByKey(getSlideKey(targetSlide));
        this.closeMobileSidebar();
    }

    expandSectionForSlide(slide, { render = false } = {}) {
        const sectionIndex = getSectionIndexForSlideKey(this.sections, getSlideKey(slide));
        if (sectionIndex >= 0) {
            this.expandSection(sectionIndex, { render });
        }
    }

    expandSection(sectionIndex = 0, { render = false } = {}) {
        const section = this.sections[sectionIndex];
        if (!section) {
            return;
        }

        this.expandedSectionIds.add(this.getSectionExpansionKey(section, sectionIndex));
        if (render) {
            this.renderSections();
        }
    }

    toggleSection(sectionIndex = 0) {
        const section = this.sections[sectionIndex];
        if (!section) {
            return;
        }

        const sectionKey = this.getSectionExpansionKey(section, sectionIndex);
        if (this.expandedSectionIds.has(sectionKey)) {
            this.expandedSectionIds.delete(sectionKey);
        } else {
            this.expandedSectionIds.add(sectionKey);
        }

        this.renderSections();
    }

    selectSection(sectionIndex = 0) {
        const section = this.sections[sectionIndex];
        if (!section?.slides?.length) {
            return;
        }

        this.activeSectionIndex = sectionIndex;
        this.expandSection(sectionIndex, { render: false });
        this.setSlideByKey(getSlideKey(section.slides[0]));
    }

    // --- Sidebar: desktop rail collapse + mobile drawer ------------------

    isMobileViewport() {
        return typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia(MOBILE_SIDEBAR_QUERY).matches;
    }

    isSidebarCollapsed() {
        return document.getElementById('sidebar')?.classList.contains('sidebar-collapsed') === true;
    }

    setSidebarCollapsed(collapsed) {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            return;
        }

        sidebar.classList.toggle('sidebar-collapsed', collapsed);

        const toggle = document.getElementById('sidebarToggle');
        if (toggle) {
            toggle.setAttribute('aria-expanded', String(!collapsed));
            toggle.setAttribute(
                'aria-label',
                collapsed ? 'Expand section navigation' : 'Collapse section navigation'
            );
        }

        try {
            window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? 'true' : 'false');
        } catch (error) {
            // Storage is best-effort; ignore failures.
        }

        this.hideRailTip();
    }

    toggleSidebarCollapsed() {
        this.setSidebarCollapsed(!this.isSidebarCollapsed());
    }

    restoreSidebarState() {
        let collapsed = false;
        try {
            collapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
        } catch (error) {
            collapsed = false;
        }
        this.setSidebarCollapsed(collapsed);
    }

    openMobileSidebar() {
        document.getElementById('sidebar')?.classList.add('sidebar-open');
        document.getElementById('sidebarOverlay')?.classList.add('sidebar-overlay-visible');
        document.getElementById('menuToggle')?.setAttribute('aria-expanded', 'true');
    }

    closeMobileSidebar() {
        document.getElementById('sidebar')?.classList.remove('sidebar-open');
        document.getElementById('sidebarOverlay')?.classList.remove('sidebar-overlay-visible');
        document.getElementById('menuToggle')?.setAttribute('aria-expanded', 'false');
    }

    toggleMobileSidebar() {
        const isOpen = document.getElementById('sidebar')?.classList.contains('sidebar-open');
        if (isOpen) {
            this.closeMobileSidebar();
        } else {
            this.openMobileSidebar();
        }
    }

    showRailTip(trigger) {
        // Tooltips are only meaningful for the collapsed desktop rail.
        if (!this.isSidebarCollapsed() || this.isMobileViewport()) {
            return;
        }

        const label = trigger.getAttribute('data-section-label');
        if (!label) {
            return;
        }

        if (!this.railTip) {
            const tip = document.createElement('div');
            tip.className = 'scribe-rail-tip';
            tip.setAttribute('role', 'tooltip');
            tip.hidden = true;
            document.body.appendChild(tip);
            this.railTip = tip;
        }

        const rect = trigger.getBoundingClientRect();
        this.railTip.textContent = label;
        this.railTip.style.top = `${rect.top + (rect.height / 2)}px`;
        this.railTip.style.left = `${rect.right + 12}px`;
        this.railTip.hidden = false;
    }

    hideRailTip() {
        if (this.railTip) {
            this.railTip.hidden = true;
        }
    }
}

const scribeController = new ScribeController();
const shouldAutoInit = typeof document !== 'undefined'
    && !globalThis.__ESG_DISABLE_AUTO_INIT__;

if (shouldAutoInit) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            void scribeController.init();
        });
    } else {
        void scribeController.init();
    }
}

export default scribeController;
