/**
 * Facilitator Role Controller
 * ESG Economic Statecraft Simulation Platform v2.0
 */

import { sessionStore } from '../stores/session.js';
import { gameStateStore } from '../stores/gameState.js';
import { actionsStore } from '../stores/actions.js';
import { requestsStore } from '../stores/requests.js';
import { timelineStore } from '../stores/timeline.js';
import { communicationsStore } from '../stores/communications.js';
import { database } from '../services/database.js';
import { syncService } from '../services/sync.js';
import { createLogger } from '../utils/logger.js';
import { mountFollowAlong } from '../features/onboarding/followAlong.js';
import { showToast } from '../components/ui/Toast.js';
import { showLoader, hideLoader } from '../components/ui/Loader.js';
import { showModal, confirmModal } from '../components/ui/Modal.js';
import {
    createBadge,
    createArtifactLifecycleBadge,
    createPriorityBadge
} from '../components/ui/Badge.js';
import {
    BLUE_ACTION_COUNTRIES,
    BLUE_ACTION_IMPLEMENTATIONS,
    BLUE_ACTION_INSTRUMENTS,
    BLUE_ACTION_LEGISLATIVE_OPTIONS,
    BLUE_ACTION_NOTIFICATION_TEAMS,
    BLUE_ACTION_SCRIBE_HANDOFF,
    BLUE_ACTION_SECTORS,
    BLUE_ACTION_SUPPLY_CHAIN_ANGLES,
    BLUE_ACTION_SUPPLY_CHAIN_AREAS,
    BLUE_ACTION_SUPPLY_CHAIN_FOCUS,
    formatActionSequenceLabel,
    formatBlueActionSelection,
    getActionSequenceNumber,
    getBlueActionViewModel,
    getNextActionSequenceNumber,
    serializeBlueActionDetails
} from '../features/actions/blueActionDetails.js';
import {
    ACTION_MARKS,
    groupActionRecordsByMark
} from '../features/actions/actionMarkRail.js';
import { getArtifactLifecycleViewModel } from '../features/actions/artifactLifecycle.js';
import {
    PROPOSAL_ACTION_MECHANISM,
    PROPOSAL_ORIGINATORS,
    PROPOSAL_SECTORS,
    PROPOSAL_SCRIBE_HANDOFF,
    formatProposalRecipientTeams,
    serializeProposalDetails,
    getProposalViewModel
} from '../features/actions/proposalDetails.js';
import {
    MOVE_RESPONSE_ACTION_MECHANISM,
    serializeMoveResponseDetails,
    getMoveResponseViewModel
} from '../features/actions/moveResponseDetails.js';
import {
    STRATEGIC_ORIENTATION_ACTION_MECHANISM,
    STRATEGIC_ORIENTATION_ARTIFACT_TYPES,
    STRATEGIC_ORIENTATION_OPTIONS,
    STRATEGIC_ORIENTATION_PERIOD,
    STRATEGIC_ORIENTATION_SCRIBE_HANDOFF,
    buildStrategicOrientationForecastSummary,
    formatStrategicOrientationSelection,
    getStrategicOrientationArtifactLabel,
    getStrategicOrientationCompletion,
    getStrategicOrientationDisplayFields,
    getStrategicOrientationForecastTargetsForTeam,
    getStrategicOrientationTeamProfile,
    getStrategicOrientationViewModel,
    isStrategicOrientationAction,
    serializeStrategicOrientationDetails
} from '../features/actions/strategicOrientationDetails.js';
import {
    PROPOSAL_RECIPIENT_STATUSES,
    countUnreadProposals,
    getProposalRecipientEntry,
    getProposalResponseEntry,
    formatProposalRecipientStatus,
    getProposalRecipientStatus,
    isProposalNegotiationRequest,
    isProposalRecipientFinal,
    isProposalThreadMessage
} from '../features/actions/proposalRecipientState.js';
import {
    WHITE_CELL_UPDATE_KINDS,
    getWhiteCellCommunicationUpdateKind,
    isActionNotificationCommunication,
    isWhiteCellCommunicationVisibleToLead,
    isWhiteCellSectionUpdate,
    isWhiteCellTimelineEventVisibleToLead
} from '../features/communications/targeting.js';
import {
    TRIBE_STREET_JOURNAL_EMBED_URL,
    createTribeStreetJournalEmbedMarkup
} from '../features/tribeStreetJournalEmbed.js';
import { formatDateTime, formatRelativeTime } from '../utils/formatting.js';
import { getCheckedValues, renderCheckboxOptions } from '../utils/checkboxGroup.js';
import { validateAction } from '../utils/validation.js';
import { getUserMessage } from '../core/errors.js';
import {
    ENUMS,
    canDeleteAction,
    canEditAction,
    canSubmitAction,
    isAdjudicatedAction,
    isDraftAction,
    isSubmittedAction
} from '../core/enums.js';
import { getRoleRoute, resolveTeamContext } from '../core/teamContext.js';
import { ensureSeatStartup } from '../services/seatBootstrap.js';
import { seatStorageKey, bindControllerSeatCleanup } from '../core/seatContext.js';
import { navigateToApp } from '../core/navigation.js';
import { WHITE_CELL_PLUGIN_IDS } from '../features/plugins/registry.js';
import {
    mountScribeIntercomReceiver,
    unmountScribeIntercomReceiver
} from '../features/plugins/intercom.js';

const logger = createLogger('Facilitator');
const PROPOSAL_TEAM_IDS = new Set(['green', 'industry']);
const STRATEGIC_ORIENTATION_TEAM_IDS = new Set(['blue', 'green', 'red', 'industry']);
const TRIBE_STREET_JOURNAL_EVENT_TYPES = new Set(['NOTE', 'MOMENT', 'QUOTE']);
const TRIBE_STREET_JOURNAL_LIMIT = 20;
const ACTION_GROUP_RENDER_LIMIT = 40;
const RFI_RENDER_LIMIT = 50;
const RESPONSE_GROUP_RENDER_LIMIT = 30;
export const FACILITATOR_VERBA_AI_RENDER_LIMIT = 40;
export const FACILITATOR_TIMELINE_RENDER_LIMIT = 80;
const BLUE_ACTION_WIZARD_PAGE_TOTAL = 3;
const RED_ACTION_WIZARD_PAGE_TOTAL = 2;

function isProposalTeamId(teamId) {
    return PROPOSAL_TEAM_IDS.has(teamId);
}

const RESPONSE_TYPE_GROUPS = [
    {
        key: 'communication',
        kind: 'communication',
        title: 'Direct Communications',
        description: 'White Cell messages sent directly to this team or role.'
    },
    {
        key: 'rfi',
        kind: 'rfi',
        title: 'RFI Answers',
        description: 'Answered requests for information from White Cell.'
    },
    {
        key: 'white-cell-update',
        kind: 'white_cell_update',
        title: 'White Cell Updates',
        description: 'Scenario, journal, and Verba AI updates pushed by White Cell.'
    },
    {
        key: 'action-notification',
        kind: 'action_notification',
        title: 'Team Action Notifications',
        description: 'Informational updates about another team’s action, shared for awareness. No response needed.'
    },
    {
        key: 'proposal',
        kind: 'proposal',
        title: 'Forwarded Proposals',
        description: 'Reviewed proposals forwarded by White Cell for this team.'
    },
    {
        key: 'other',
        kind: 'other',
        title: 'Other Messages',
        description: 'Additional White Cell items that do not match a standard response type.'
    }
];
const RESPONSE_TYPE_GROUP_BY_KIND = new Map(
    RESPONSE_TYPE_GROUPS.map((group) => [group.kind, group])
);

function getRfiCategoryKey(category = '') {
    return String(category || 'uncategorized')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'uncategorized';
}

function getEventTimestamp(event = {}) {
    return event?.created_at || event?.updated_at || event?.timestamp || null;
}

function getSortableEventTime(event = {}) {
    const timestamp = getEventTimestamp(event);
    if (!timestamp) {
        return 0;
    }

    const parsedTime = new Date(timestamp).getTime();
    return Number.isFinite(parsedTime) ? parsedTime : 0;
}

export function isTribeStreetJournalEntry(event = {}, teamId = null) {
    const eventType = event?.type ?? event?.event_type ?? null;

    return Boolean(teamId)
        && event?.team === teamId
        && TRIBE_STREET_JOURNAL_EVENT_TYPES.has(eventType)
        && event?.metadata?.source !== 'notetaker_save';
}

export function buildTribeStreetJournalEntries(events = [], teamId = null) {
    return [...(events || [])]
        .filter((event) => isTribeStreetJournalEntry(event, teamId))
        .sort((a, b) => getSortableEventTime(b) - getSortableEventTime(a))
        .slice(0, TRIBE_STREET_JOURNAL_LIMIT);
}

export function getVisibleFacilitatorTimelineEvents(events = [], limit = FACILITATOR_TIMELINE_RENDER_LIMIT) {
    const allEvents = Array.isArray(events) ? events : [];
    const visibleEvents = allEvents.slice(0, limit);

    return {
        visibleEvents,
        hiddenCount: Math.max(0, allEvents.length - visibleEvents.length)
    };
}

export function getFacilitatorAccessState({
    role,
    teamContext,
    observerTeamId = null
}) {
    if (role === teamContext.facilitatorRole) {
        return {
            allowed: true,
            readOnly: false,
            reason: null,
            roleSurface: 'facilitator'
        };
    }

    if (role === ENUMS.ROLES.VIEWER && observerTeamId === teamContext.teamId) {
        return {
            allowed: true,
            readOnly: true,
            reason: null,
            roleSurface: 'viewer'
        };
    }

    if (role === ENUMS.ROLES.VIEWER) {
        return {
            allowed: false,
            readOnly: true,
            reason: 'observer-team-mismatch',
            observerTeamId
        };
    }

    return {
        allowed: false,
        readOnly: false,
        reason: 'role-mismatch'
    };
}

export class FacilitatorController {
    constructor() {
        this.actions = [];
        this.rfis = [];
        this.responses = [];
        this.receivedProposals = [];
        this.expandedActionCardIds = new Set();
        this.actionMarkActiveKey = '';
        this.rfiActiveTab = getRfiCategoryKey(ENUMS.RFI_CATEGORIES[0]);
        this.responsesActiveTab = 'communication';
        this.proposalsActiveTab = 'unread';
        this.journalEntries = [];
        this.journalUpdates = [];
        this.verbaAiUpdates = [];
        this.timelineEvents = [];
        this.storeUnsubscribers = [];
        this.role = sessionStore.getRole();
        this.roleSurface = null;
        this.isReadOnly = false;
        this.teamContext = resolveTeamContext();
        this.teamId = this.teamContext.teamId;
        this.teamLabel = this.teamContext.teamLabel;
        this.seenResponseIds = new Set();
        this.newResponseIds = new Set();
        this.seenReceivedProposalIds = new Set();
        this.newReceivedProposalIds = new Set();
        this.seenAuthoredProposalResponseIds = new Set();
        this.newProposalResponseActionIds = new Set();
        this.pendingProposalResponseArrivals = new Map();
        this.pendingWhiteCellArrivalSummary = {
            responses: new Set(),
            proposals: new Set()
        };
        this.hasHydratedResponses = false;
        this.hasHydratedReceivedProposals = false;
        this.hasHydratedAuthoredProposalResponses = false;
        this.strategicOrientationSubmissionInFlight = false;
        this.intercomReceiver = null;
    }

    async init() {
        if (!await ensureSeatStartup()) return;
        bindControllerSeatCleanup(this);
        this.teamContext = resolveTeamContext({ seat: sessionStore.getConfirmedSeat?.() });
        this.teamId = this.teamContext.teamId;
        this.teamLabel = this.teamContext.teamLabel;
        logger.info('Initializing Scribe workspace');

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
        const accessState = getFacilitatorAccessState({
            role: this.role,
            teamContext: this.teamContext,
            observerTeamId
        });

        if (!accessState.allowed) {
            const redirectPath = accessState.reason === 'observer-team-mismatch' && accessState.observerTeamId
                ? getRoleRoute(ENUMS.ROLES.VIEWER, { observerTeamId: accessState.observerTeamId })
                : '';
            showToast({
                message: accessState.reason === 'observer-team-mismatch'
                    ? 'Observer access is limited to the team selected when you joined the session.'
                    : `This page is only available to the ${this.teamContext.facilitatorLabel} role.`,
                type: 'error'
            });
            navigateToApp(redirectPath || '', { replace: true });
            return;
        }

        this.isReadOnly = accessState.readOnly;
        this.roleSurface = accessState.roleSurface || null;

        await syncService.initialize(sessionId, {
            participantId: sessionStore.getSessionParticipantId?.() || null
        });
        if (this.seatInvalidated) return;
        this.configureAccessMode();
        this.bindEventListeners();
        this.actions = actionsStore.getByTeam(this.teamId);
        this.captureAuthoredProposalResponseArrivals();
        this.subscribeToLiveData();
        this.syncActionsFromStore();
        this.syncRfisFromStore();
        this.syncResponsesFromStores();
        this.syncReceivedProposalsFromStore();
        this.syncWhiteCellUpdateSectionsFromStore();
        this.syncTimelineFromStore();
        this.reconcileIntercomReceiver();
        this.mountFollowAlongOnboarding();

        logger.info('Scribe workspace initialized');
    }

    mountFollowAlongOnboarding() {
        const navTarget = (section) => `.sidebar-link[data-section="${section}"]`;
        const liveTrackerHighlights = ['#header-game-state', '#header-timer'];
        const surfaceStep = (title, section, body, narrative) => ({
            title,
            body,
            narrative,
            targetLabel: title,
            highlight: navTarget(section),
            action: { label: `Open ${title}`, selector: navTarget(section) }
        });
        if (this.isReadOnly) {
            this.onboarding = mountFollowAlong({
                storageKey: seatStorageKey(`followalong:observer:${this.teamId}`),
                title: `${this.teamLabel} Observer guide`,
                roleLabel: `${this.teamLabel} Observer`,
                summary: 'Follow the team record and exercise state without creating, editing, forwarding, or submitting artifacts.',
                steps: [
                    {
                        title: 'Understand the observer boundary',
                        body: `This is a read-only view of ${this.teamLabel}'s Scribe workspace.`,
                        narrative: 'Use visibility to understand the exercise, not to assume the authority of an active participant seat.',
                        details: ['Write controls stay hidden or disabled.', 'Opening a record does not change its workflow state.']
                    },
                    {
                        title: 'Read the live exercise context',
                        body: 'White Cell controls the move, phase, countdown, and timer state shown to every role.',
                        narrative: 'Use the tracker to place each artifact and update in the correct exercise window.',
                        targetLabel: 'Live tracker',
                        highlight: liveTrackerHighlights
                    },
                    surfaceStep('Team artifacts', 'actions', 'Read Strategic Orientation, actions, or proposals and their current handoff state.', 'Compare the written record with the active exercise context; do not edit or submit it.'),
                    surfaceStep('RFIs', 'requests', 'Read the team’s questions to White Cell and their revision status.', 'A returned RFI remains the same record and shows what clarification is still required.'),
                    surfaceStep('Responses', 'responses', 'Follow White Cell answers, updates, and inbound operational messages.', 'Treat explicit White Cell responses as exercise input while preserving the observer boundary.'),
                    surfaceStep('Received Proposals', 'receivedProposals', 'Inspect proposals forwarded to this team and their recipient state.', 'Read the full recipient-specific thread before interpreting a proposal outcome.'),
                    surfaceStep('Tribe Street Journal', 'tribeStreetJournal', 'Review published scenario reporting and observations relevant to the team.', 'Use the journal as context; it does not silently change an artifact.'),
                    surfaceStep('Population Sentiments', 'verbaAi', 'Review White Cell-published sentiment updates.', 'Sentiment is contextual evidence for participants, not deterministic adjudication.'),
                    surfaceStep('Timeline', 'timeline', 'Reconstruct when artifacts, RFIs, messages, captures, and updates occurred.', 'Sequence explains how the session developed; the artifact surface remains the source for current workflow state.')
                ]
            });
            return;
        }
        const actionNoun = this.isProposalTeam()
            ? 'proposals'
            : 'actions';
        const actionTitle = this.isProposalTeam()
            ? 'Build proposals'
            : 'Draft actions';
        const actionGuideBody = this.isProposalTeam()
            ? `Use the Strategic Orientation and move tabs to see exactly what was noted for each part of the simulation. Create and revise your team's ${actionNoun} here. Once submitted, they become read-only while White Cell reviews them.`
            : this.teamId === 'red'
            ? `Create and revise your team's ${actionNoun} here. Once submitted, they become read-only while White Cell reviews them.`
            : this.isTeamActionWizardEnabled()
            ? `Create and revise your team's ${actionNoun} here. Forward completed actions to the Facilitator; the Facilitator projects and submits them to White Cell.`
            : `Create and revise your team's ${actionNoun} here. Once submitted, they become read-only while White Cell reviews them.`;
        this.onboarding = mountFollowAlong({
            storageKey: seatStorageKey(`followalong:facilitator:${this.teamId}`),
            title: `${this.teamContext.facilitatorLabel} guide`,
            roleLabel: this.teamContext.facilitatorLabel,
            summary: `Own ${this.teamLabel}'s written decision record, preserve its rationale, and hand complete work across the explicit review boundary.`,
            steps: [
                {
                    title: 'Your role in the exercise',
                    body: `As ${this.teamContext.facilitatorLabel}, you turn deliberation into the durable ${this.teamLabel} record.`,
                    narrative: `Listen for intent, assumptions, and trade-offs; make them legible in Strategic Orientation and ${actionNoun} before the handoff deadline.`,
                    details: ['Draft and revise team-owned artifacts.', 'Preserve rationale and required structured fields.', 'Use the explicit handoff control; visibility alone is not submission.']
                },
                {
                    title: 'Read the live tracker',
                    body: 'The header shows the current state, including Strategic Orientation before Move 1, the active move or phase, countdown timer, and whether the timer is running. White Cell controls these values; use them to pace deliberation and submissions.',
                    narrative: 'Confirm the active window before writing. A sound record attached to the wrong move or phase is still operationally wrong.',
                    targetLabel: 'Live tracker',
                    highlight: liveTrackerHighlights
                },
                {
                    title: actionTitle,
                    body: actionGuideBody,
                    narrative: `Translate the room’s choice into a complete ${actionNoun.slice(0, -1)} with enough evidence for the next reviewer to act.`,
                    details: ['Strategic Orientation establishes the opening position.', `Move tabs keep ${actionNoun} attached to the correct round.`, 'Submitted or forwarded records become read-only at the documented boundary.'],
                    targetLabel: actionTitle,
                    highlight: navTarget('actions'),
                    action: { label: `Open ${actionNoun}`, selector: navTarget('actions') }
                },
                surfaceStep('RFIs', 'requests', 'Send a focused request when the team needs a ruling, clarification, or scenario detail.', 'Include enough context to unblock one decision. If White Cell returns it, revise the same RFI rather than creating a duplicate.'),
                surfaceStep('Responses', 'responses', 'Read White Cell answers, update notices, forwarded proposals, and explicit communications.', 'Bring material new information back into deliberation before changing the team record.'),
                surfaceStep('Received Proposals', 'receivedProposals', 'Acknowledge, decline, ignore, or answer proposals White Cell forwarded to the team.', 'Read the proposal and its thread before recording the team’s position; negotiation remains attached to the recipient record.'),
                surfaceStep('Tribe Street Journal', 'tribeStreetJournal', 'Read scenario reporting, observations, moments, and selected quotes.', 'Use the journal as context and a prompt for discussion; it does not silently alter submitted work.'),
                surfaceStep('Population Sentiments', 'verbaAi', 'Read White Cell-published sentiment updates for the team.', 'Decide explicitly whether and how the published narrative changes the next action.'),
                surfaceStep('Timeline', 'timeline', 'Audit the chronological record of artifacts, RFIs, responses, captures, and updates.', 'Use sequence to reconstruct what changed; use the artifact surface for current workflow state.'),
                surfaceStep('Quick Capture', 'capture', 'Record a concise note, moment, or quote during deliberation.', 'Label the observation accurately and leave formal team decisions in the artifact workflow.'),
                {
                    title: 'Close the loop',
                    body: 'Confirm the active move, completeness, rationale, destination, and explicit handoff state before the deadline.',
                    narrative: 'The Scribe owns a trustworthy record, not the team’s strategic judgment and not White Cell’s adjudication.',
                    details: ['Verify the destination before handoff.', 'Use responses and timeline to resolve ambiguity.', 'Collapse Start Here when you need space and reopen it at any time.'],
                    targetLabel: 'Session reference',
                    highlight: '.sidebar-session'
                }
            ]
        });
    }

    isAllowedRole(role) {
        return (
            role === this.teamContext.facilitatorRole
            || role === ENUMS.ROLES.VIEWER
        );
    }

    isScribeSeat() {
        return false;
    }

    getCurrentLeadRole() {
        return this.teamContext.facilitatorRole;
    }

    getCurrentLeadLabel() {
        return this.teamContext.facilitatorLabel;
    }

    getCurrentLeadSurfaceLabel() {
        return 'Scribe';
    }

    configureAccessMode() {
        const roleLabel = document.getElementById('sessionRoleLabel');
        const notice = document.getElementById('facilitatorModeNotice');
        const writeControls = document.querySelectorAll('[data-write-control="true"]');
        const headerTitle = document.querySelector('.header-title');
        const captureNavItem = document.getElementById('captureNavItem');
        const captureSection = document.getElementById('captureSection');
        const actionsDescription = document.querySelector('#actionsSection .section-description');
        const requestsDescription = document.querySelector('#requestsSection .section-description');
        const responsesDescription = document.querySelector('#responsesSection .section-description');
        const journalDescription = document.querySelector('#tribeStreetJournalSection .section-description');
        const verbaAiDescription = document.querySelector('#verbaAiSection .section-description');
        const timelineDescription = document.querySelector('#timelineSection .section-description');

        document.body.dataset.facilitatorMode = this.isReadOnly
            ? 'observer'
            : 'facilitator';

        if (roleLabel) {
            roleLabel.textContent = this.isReadOnly ? 'Observer'
                : this.teamContext.delegationId ? this.teamContext.facilitatorLabel : this.getCurrentLeadSurfaceLabel();
        }

        if (headerTitle) {
            headerTitle.textContent = this.isReadOnly
                ? this.teamContext.observerLabel
                : this.getCurrentLeadLabel();
        }

        writeControls.forEach((element) => {
            element.hidden = this.isReadOnly;
            element.toggleAttribute('aria-hidden', this.isReadOnly);

            element.querySelectorAll?.('button, input, select, textarea').forEach((control) => {
                control.disabled = this.isReadOnly;
                control.toggleAttribute('aria-disabled', this.isReadOnly);
            });
        });

        if (captureNavItem) {
            captureNavItem.hidden = this.isReadOnly;
        }

        if (captureSection && this.isReadOnly) {
            captureSection.style.display = 'none';
        }

        if (actionsDescription) {
            const isGreenProposalFlow = this.isProposalTeam();
            const isTeamActionFlow = this.isTeamActionWizardEnabled();
            if (this.isReadOnly) {
                if (isGreenProposalFlow) {
                    actionsDescription.textContent = 'Use the Strategic Orientation and move tabs to review exactly what was noted for each part of the simulation. Observer mode cannot create, edit, send, or delete proposals.';
                } else if (this.teamId === 'red') {
                    actionsDescription.textContent = 'Passive observer view of team actions. Entries are visible but cannot be created, edited, submitted, or deleted.';
                } else if (isTeamActionFlow) {
                    actionsDescription.textContent = 'Passive observer view of team actions. Drafts are visible but cannot be created, edited, submitted, or deleted.';
                } else {
                    actionsDescription.textContent = 'Passive observer view of scribe actions. Drafts are visible but cannot be created, edited, submitted, or deleted.';
                }
            } else if (isGreenProposalFlow) {
                actionsDescription.textContent = this.teamId === 'industry'
                    ? 'Draft US Industry proposals with an industry, country, proposed activity, intended partners, and focus sectors, then send them to the Facilitator.'
                    : 'Draft Green proposals with independent Blue/Red intended partners, focus sectors, and conditional supply-chain details, then send them to the Facilitator.';
            } else if (this.teamId === 'red') {
                actionsDescription.textContent = 'Draft actions, submit them to White Cell, and track deliberation after facilitator review.';
            } else if (isTeamActionFlow) {
                actionsDescription.textContent = 'Draft actions, forward them to the Facilitator, and track White Cell deliberation after facilitator submission.';
            } else {
                actionsDescription.textContent = 'Draft actions, forward them to the Facilitator, and track White Cell deliberation after facilitator submission.';
            }
        }

        if (requestsDescription) {
            requestsDescription.textContent = this.isReadOnly
                ? 'Passive observer view of RFIs by category. Request submission is disabled in observer mode.'
                : 'Review team RFIs by category and monitor White Cell response status. The Facilitator owns submission and resubmission.';
        }

        if (responsesDescription) {
            responsesDescription.textContent = this.isReadOnly
                ? 'Passive tabbed feed of direct White Cell communications, update notices, forwarded proposals, and responses to this team.'
                : 'Use category tabs to review direct White Cell communications, update notices, forwarded proposals, and RFI answers.';
        }

        if (journalDescription) {
            journalDescription.textContent = this.isReadOnly
                ? 'Passive feed of White Cell journal updates plus the latest team notes, moments, and quotes captured during the exercise.'
                : 'Review White Cell journal updates plus the latest team notes, moments, and quotes captured during the exercise.';
        }

        if (verbaAiDescription) {
            verbaAiDescription.textContent = this.isReadOnly
                ? 'Passive feed of White Cell Verba AI population sentiment updates.'
                : 'Review White Cell Verba AI population sentiment updates.';
        }

        if (timelineDescription) {
            timelineDescription.textContent = this.isReadOnly
                ? 'Passive session activity feed for the selected team.'
                : 'Chronological view of all events';
        }

        if (notice) {
            if (this.isReadOnly) {
                notice.style.display = 'block';
                notice.innerHTML = `
                    <h2 class="font-semibold mb-2">Observer Mode</h2>
                    <p class="text-sm text-gray-600">
                        This page is passive for the observer role. You can review scribe actions,
                        White Cell responses, RFIs, and the timeline, but create, edit, submit, delete,
                        and capture paths are blocked in code and hidden in the interface.
                    </p>
                `;
            } else {
                notice.style.display = 'none';
                notice.innerHTML = '';
            }
        }
    }

    bindEventListeners() {
        const newActionBtn = document.getElementById('newActionBtn');
        const strategicOrientationBtn = document.getElementById('strategicOrientationBtn');
        const captureForm = document.getElementById('captureForm');

        const actionsListEl = document.getElementById('actionsList');
        actionsListEl?.addEventListener('click', (event) => {
            const tabButton = event.target.closest('[data-action-mark-tab]');
            if (!tabButton || !actionsListEl.contains(tabButton)) return;
            this.setActionMark(tabButton.dataset.actionMarkTab);
        });
        actionsListEl?.addEventListener('keydown', (event) => {
            this.handleActionMarkKeydown(event, actionsListEl);
        });

        const rfiListEl = document.getElementById('rfiList');
        rfiListEl?.addEventListener('click', (event) => {
            const tabButton = event.target.closest('.tab-button[data-rfi-tab]');
            if (!tabButton || !rfiListEl.contains(tabButton)) return;
            this.setRfiActiveTab(tabButton.dataset.rfiTab);
        });

        const responsesListEl = document.getElementById('responsesList');
        responsesListEl?.addEventListener('click', (event) => {
            const tabButton = event.target.closest('.tab-button[data-responses-tab]');
            if (!tabButton || !responsesListEl.contains(tabButton)) return;
            this.setResponsesActiveTab(tabButton.dataset.responsesTab);
        });

        if (this.isReadOnly) {
            newActionBtn?.setAttribute('aria-disabled', 'true');
            strategicOrientationBtn?.setAttribute('aria-disabled', 'true');
            captureForm?.querySelectorAll?.('button, input, select, textarea').forEach((control) => {
                control.disabled = true;
                control.setAttribute('aria-disabled', 'true');
            });
            return;
        }

        newActionBtn?.addEventListener('click', () => this.showCreateActionModal());
        strategicOrientationBtn?.addEventListener('click', () => this.showStrategicOrientationModal());
        captureForm?.addEventListener('submit', (event) => this.handleCaptureSubmit(event));

        const receivedProposalsList = document.getElementById('receivedProposalsList');
        receivedProposalsList?.addEventListener('click', (event) => {
            const tabButton = event.target.closest('.tab-button[data-proposals-tab]');
            if (tabButton && receivedProposalsList.contains(tabButton)) {
                this.setProposalsActiveTab(tabButton.dataset.proposalsTab);
                return;
            }

            const button = event.target.closest('button[data-proposal-action]');
            if (!button || button.disabled) return;
            const action = button.dataset.proposalAction;
            const commId = button.dataset.proposalCommId;
            if (!action || !commId) return;
            const communication = this.receivedProposals.find((comm) => comm.id === commId);
            if (!communication) return;
            const result = this.handleReceivedProposalAction(action, communication);
            if (result && typeof result.catch === 'function') {
                result.catch((err) => {
                    logger.error('Failed to handle received proposal action:', err);
                });
            }
        });

        document.querySelectorAll?.('.sidebar-link[data-section]')?.forEach((link) => {
            link.addEventListener('click', () => {
                if (link.dataset.section === 'responses') {
                    this.clearNewResponseArrivals();
                }

                if (link.dataset.section === 'receivedProposals') {
                    this.clearNewReceivedProposalArrivals();
                }

                if (link.dataset.section === 'actions') {
                    this.clearNewProposalResponseArrivals();
                }
            });
        });
    }

    requireWriteAccess() {
        if (!this.isReadOnly) {
            return true;
        }

        showToast({
            message: 'Observer mode is read-only on the scribe page.',
            type: 'error'
        });
        return false;
    }

    getCurrentGameState() {
        return gameStateStore.getState() || sessionStore.getSessionData()?.gameState || {
            move: 1,
            phase: 1
        };
    }

    getActionStoreSnapshot() {
        if (typeof actionsStore.getAll === 'function') {
            return actionsStore.getAll();
        }

        if (typeof actionsStore.getByTeam === 'function') {
            return actionsStore.getByTeam(this.teamId);
        }

        return this.actions || [];
    }

    getStrategicOrientationGateState() {
        return getStrategicOrientationCompletion(this.getActionStoreSnapshot());
    }

    isStrategicOrientationGateActive() {
        const gameState = this.getCurrentGameState();
        const move = gameState.move ?? 1;
        const phase = gameState.phase ?? 1;

        return move === 1
            && phase === 1
            && !this.getStrategicOrientationGateState().complete;
    }

    getStrategicOrientationGateMessage() {
        const completion = this.getStrategicOrientationGateState();
        const labels = {
            blue: 'Blue selection',
            green: 'Green forecast',
            red: 'Red forecast',
            industry: 'Industry forecast'
        };
        const missingLabels = completion.missingTeams
            .map((teamId) => labels[teamId] || teamId)
            .join(', ');

        return `Strategic Orientation is required before Move 1 begins. Missing: ${missingLabels || 'none'}.`;
    }

    getBlueActionSequenceContext(action = null) {
        const gameState = this.getCurrentGameState();
        const move = action?.move || gameState.move || 1;
        const sequencedActions = this.actions.filter((candidate) => !isStrategicOrientationAction(candidate));
        const actionNumber = action?.id
            ? getActionSequenceNumber(sequencedActions, action)
            : getNextActionSequenceNumber(sequencedActions, this.teamId, move);

        return {
            move,
            actionNumber,
            label: formatActionSequenceLabel({
                teamLabel: this.teamLabel,
                move,
                actionNumber
            })
        };
    }

    subscribeToLiveData() {
        this.storeUnsubscribers.push(
            actionsStore.subscribe(() => {
                this.syncActionsFromStore();
            })
        );

        this.storeUnsubscribers.push(
            requestsStore.subscribe((event) => {
                this.syncRfisFromStore();
                this.syncResponsesFromStores({
                    announce: event === 'created' || event === 'updated'
                });
                this.flushWhiteCellArrivalAnnouncement();
            })
        );

        this.storeUnsubscribers.push(
            communicationsStore.subscribe((event) => {
                this.captureAuthoredProposalResponseArrivals({
                    announce: event === 'created' || event === 'updated'
                });
                this.renderActionsList();
                this.syncResponsesFromStores({
                    announce: event === 'created'
                });
                this.syncReceivedProposalsFromStore({
                    announce: event === 'created'
                });
                this.syncWhiteCellUpdateSectionsFromStore();
                this.flushWhiteCellArrivalAnnouncement();
                this.flushProposalResponseArrivalAnnouncement();
            })
        );

        this.storeUnsubscribers.push(
            timelineStore.subscribe(() => {
                this.syncTimelineFromStore();
            })
        );

        if (typeof gameStateStore.subscribe === 'function') {
            this.storeUnsubscribers.push(
                gameStateStore.subscribe(() => {
                    this.reconcileIntercomReceiver();
                })
            );
        }
    }

    shouldRunIntercomReceiver() {
        const intercomEnabled = typeof gameStateStore.isPluginEnabled === 'function'
            ? gameStateStore.isPluginEnabled(WHITE_CELL_PLUGIN_IDS.INTERCOM)
            : Boolean(gameStateStore.getState?.()?.plugin_state?.[WHITE_CELL_PLUGIN_IDS.INTERCOM]?.enabled);

        return Boolean(
            !this.isReadOnly
            && this.role === this.teamContext.facilitatorRole
            && intercomEnabled
        );
    }

    reconcileIntercomReceiver() {
        if (this.shouldRunIntercomReceiver()) {
            if (!this.intercomReceiver) {
                this.intercomReceiver = mountScribeIntercomReceiver({
                    sessionId: sessionStore.getSessionId(),
                    role: this.role,
                    teamLabel: this.teamLabel
                });
            }
            return;
        }

        if (this.intercomReceiver) {
            unmountScribeIntercomReceiver(this.intercomReceiver);
            this.intercomReceiver = null;
        }
    }

    syncActionsFromStore() {
        this.actions = actionsStore.getByTeam(this.teamId);
        this.updateStrategicOrientationControlAvailability();
        this.renderActionsList();

        const badge = document.getElementById('actionsBadge');
        if (badge) {
            badge.textContent = this.actions.length.toString();
        }
    }

    updateStrategicOrientationControlAvailability(documentRef = globalThis.document) {
        const button = documentRef?.getElementById?.('strategicOrientationBtn');
        const actionButton = documentRef?.getElementById?.('newActionBtn');
        if (!button && !actionButton) return;

        const supportsStrategicOrientation = STRATEGIC_ORIENTATION_TEAM_IDS.has(this.teamId);
        const existingAction = this.getStrategicOrientationActionForTeam();
        const hasStrategicOrientation = Boolean(existingAction);

        this.setActionControlVariant(button, hasStrategicOrientation ? 'secondary' : 'primary');
        this.setActionControlVariant(actionButton, hasStrategicOrientation ? 'primary' : 'secondary');

        if (actionButton) {
            actionButton.disabled = this.isReadOnly;
            actionButton.title = hasStrategicOrientation
                ? ''
                : 'Record Strategic Orientation before creating actions.';

            if (actionButton.disabled) {
                actionButton.setAttribute?.('aria-disabled', 'true');
            } else {
                actionButton.removeAttribute?.('aria-disabled');
            }
        }

        if (!button) return;

        button.hidden = !supportsStrategicOrientation;
        button.disabled = !supportsStrategicOrientation
            || hasStrategicOrientation
            || this.isReadOnly
            || this.strategicOrientationSubmissionInFlight;

        if (button.disabled) {
            button.setAttribute?.('aria-disabled', 'true');
        } else {
            button.removeAttribute?.('aria-disabled');
        }

        if (this.strategicOrientationSubmissionInFlight) {
            button.title = 'Strategic Orientation is being recorded for this team.';
        } else if (existingAction) {
            button.title = 'Strategic Orientation has already been recorded for this team.';
        } else if (!supportsStrategicOrientation) {
            button.title = 'Strategic Orientation is available only to Blue, Green, Red, and Industry.';
        } else {
            button.title = '';
        }
    }

    setActionControlVariant(button, variant = 'secondary') {
        if (!button) return;

        const nextClassName = variant === 'primary' ? 'btn-primary' : 'btn-secondary';
        const classNames = new Set(String(button.className || '').split(/\s+/).filter(Boolean));
        classNames.delete('btn-primary');
        classNames.delete('btn-secondary');
        classNames.add(nextClassName);
        button.className = Array.from(classNames).join(' ');
    }

    syncRfisFromStore() {
        this.rfis = requestsStore.getByTeam(this.teamId);
        this.renderRfiList();

        const badge = document.getElementById('rfiBadge');
        if (badge) {
            badge.textContent = this.rfis.filter((request) => request.status === 'pending').length.toString();
        }
    }

    syncResponsesFromStores({
        announce = false
    } = {}) {
        const answeredRfis = requestsStore.getByTeam(this.teamId)
            .filter((request) => request.status === 'answered' && request.response)
            .map((request) => ({
                id: request.id,
                kind: 'rfi',
                created_at: request.responded_at || request.updated_at || request.created_at,
                title: request.query || request.question || 'RFI response',
                subtitle: 'Answered by White Cell',
                content: request.response,
                badgeText: 'RFI ANSWERED',
                badgeVariant: 'success'
            }));

        const directResponses = communicationsStore.getAll()
            .filter((communication) =>
                isWhiteCellCommunicationVisibleToLead(communication, this.teamContext)
                && communication?.type !== 'PROPOSAL_FORWARDED'
            )
            .map((communication) => this.buildWhiteCellResponseEntry(communication));
        const forwardedProposals = communicationsStore.getAll()
            .filter((communication) =>
                communication?.type === 'PROPOSAL_FORWARDED'
                && isWhiteCellCommunicationVisibleToLead(communication, this.teamContext)
            )
            .map((communication) => ({
                id: `proposal-${communication.id}`,
                kind: 'proposal',
                created_at: communication.created_at,
                title: `Received Proposal: ${communication?.metadata?.proposal?.title || 'Untitled proposal'}`,
                subtitle: 'Forwarded by White Cell after review',
                content: communication.content,
                badgeText: 'FORWARDED PROPOSAL',
                badgeVariant: 'warning'
            }));

        const nextResponses = [...answeredRfis, ...directResponses, ...forwardedProposals].sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        this.captureWhiteCellResponseArrivals(nextResponses, { announce });
        this.responses = nextResponses;

        this.renderResponsesList();
    }

    syncReceivedProposalsFromStore({
        announce = false
    } = {}) {
        const nextReceivedProposals = communicationsStore.getAll()
            .filter((communication) => (
                communication?.type === 'PROPOSAL_FORWARDED'
                && isWhiteCellCommunicationVisibleToLead(communication, this.teamContext)
            ))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        this.captureReceivedProposalArrivals(nextReceivedProposals, { announce });
        this.receivedProposals = nextReceivedProposals;

        this.renderReceivedProposals();
    }

    syncWhiteCellUpdateSectionsFromStore() {
        const visibleWhiteCellCommunications = communicationsStore.getAll()
            .filter((communication) => isWhiteCellCommunicationVisibleToLead(communication, this.teamContext))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        this.journalUpdates = visibleWhiteCellCommunications.filter((communication) => (
            isWhiteCellSectionUpdate(communication, WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL)
        ));
        this.verbaAiUpdates = visibleWhiteCellCommunications.filter((communication) => (
            isWhiteCellSectionUpdate(communication, WHITE_CELL_UPDATE_KINDS.VERBA_AI_POPULATION_SENTIMENT)
        ));

        this.renderTribeStreetJournalList();
        this.renderVerbaAiList();
    }

    updateSidebarBadge(elementId, count) {
        const badge = document.getElementById(elementId);
        if (!badge) return;

        badge.textContent = String(count);
        badge.hidden = count === 0;
    }

    captureWhiteCellResponseArrivals(nextResponses = [], {
        announce = false
    } = {}) {
        const nextIds = new Set(
            nextResponses
                .map((response) => response?.id)
                .filter(Boolean)
        );

        if (!this.hasHydratedResponses) {
            this.seenResponseIds = nextIds;
            this.newResponseIds.clear();
            this.hasHydratedResponses = true;
            return;
        }

        nextResponses.forEach((response) => {
            if (!response?.id || this.seenResponseIds.has(response.id)) {
                return;
            }

            this.seenResponseIds.add(response.id);

            if (response.kind === 'proposal') {
                return;
            }

            this.newResponseIds.add(response.id);
            if (announce) {
                this.pendingWhiteCellArrivalSummary.responses.add(response.id);
            }
        });

        this.newResponseIds.forEach((responseId) => {
            if (!nextIds.has(responseId)) {
                this.newResponseIds.delete(responseId);
            }
        });
    }

    captureReceivedProposalArrivals(nextReceivedProposals = [], {
        announce = false
    } = {}) {
        const nextIds = new Set(
            nextReceivedProposals
                .map((communication) => communication?.id)
                .filter(Boolean)
        );

        if (!this.hasHydratedReceivedProposals) {
            this.seenReceivedProposalIds = nextIds;
            this.newReceivedProposalIds.clear();
            this.hasHydratedReceivedProposals = true;
            return;
        }

        nextReceivedProposals.forEach((communication) => {
            if (!communication?.id || this.seenReceivedProposalIds.has(communication.id)) {
                return;
            }

            this.seenReceivedProposalIds.add(communication.id);
            this.newReceivedProposalIds.add(communication.id);
            if (announce) {
                this.pendingWhiteCellArrivalSummary.proposals.add(communication.id);
            }
        });

        this.newReceivedProposalIds.forEach((communicationId) => {
            if (!nextIds.has(communicationId)) {
                this.newReceivedProposalIds.delete(communicationId);
            }
        });
    }

    getAuthoredProposalResponseCommunications() {
        const actionIds = new Set(
            this.actions
                .map((action) => action?.id)
                .filter(Boolean)
        );

        return communicationsStore.getAll().filter((communication) => {
            if (communication?.type !== 'PROPOSAL_FORWARDED' || !isProposalRecipientFinal(communication)) {
                return false;
            }

            const metadata = communication.metadata && typeof communication.metadata === 'object'
                ? communication.metadata
                : {};
            const sourceTeam = typeof metadata.source_team === 'string'
                ? metadata.source_team.trim().toLowerCase()
                : '';
            const sourceProposalId = metadata.source_proposal_id || null;

            return sourceTeam
                ? sourceTeam === this.teamId
                : Boolean(sourceProposalId && actionIds.has(sourceProposalId));
        });
    }

    captureAuthoredProposalResponseArrivals({
        announce = false
    } = {}) {
        const responses = this.getAuthoredProposalResponseCommunications();
        const nextResponseIds = new Set(
            responses
                .map((communication) => communication?.id)
                .filter(Boolean)
        );
        const nextActionIds = new Set(
            responses
                .map((communication) => communication?.metadata?.source_proposal_id)
                .filter(Boolean)
        );

        if (!this.hasHydratedAuthoredProposalResponses) {
            this.seenAuthoredProposalResponseIds = nextResponseIds;
            this.newProposalResponseActionIds.clear();
            this.pendingProposalResponseArrivals.clear();
            this.hasHydratedAuthoredProposalResponses = true;
            return;
        }

        responses.forEach((communication) => {
            if (!communication?.id || this.seenAuthoredProposalResponseIds.has(communication.id)) {
                return;
            }

            this.seenAuthoredProposalResponseIds.add(communication.id);
            const sourceProposalId = communication?.metadata?.source_proposal_id || null;
            if (sourceProposalId && !this.isReadOnly) {
                this.newProposalResponseActionIds.add(sourceProposalId);
            }
            if (announce && !this.isReadOnly) {
                this.pendingProposalResponseArrivals.set(communication.id, communication);
            }
        });

        this.newProposalResponseActionIds.forEach((actionId) => {
            if (!nextActionIds.has(actionId)) {
                this.newProposalResponseActionIds.delete(actionId);
            }
        });
    }

    clearNewResponseArrivals() {
        if (this.newResponseIds.size === 0) {
            return;
        }

        this.newResponseIds.clear();
        this.renderResponsesList();
    }

    clearNewReceivedProposalArrivals() {
        if (this.newReceivedProposalIds.size === 0) {
            return;
        }

        this.newReceivedProposalIds.clear();
        this.renderReceivedProposals();
    }

    clearNewProposalResponseArrivals() {
        if (this.newProposalResponseActionIds.size === 0) {
            return;
        }

        this.newProposalResponseActionIds.clear();
        this.renderActionsList();
    }

    buildProposalResponseArrivalMessage(communication = {}) {
        const metadata = communication.metadata && typeof communication.metadata === 'object'
            ? communication.metadata
            : {};
        const recipientEntry = getProposalRecipientEntry(communication);
        const decision = typeof recipientEntry?.facilitator_decision === 'string'
            ? recipientEntry.facilitator_decision.trim().toLowerCase()
            : '';
        const recipientTeam = metadata.recipient_team || recipientEntry?.response_from_team || '';
        const recipientLabel = this.formatProposalRecipientTeamLabel(recipientTeam);
        const sourceAction = this.actions.find((action) => action?.id === metadata.source_proposal_id);
        const proposalTitle = metadata?.proposal?.title || sourceAction?.goal || 'your proposal';
        const proposalReference = proposalTitle === 'your proposal'
            ? proposalTitle
            : `"${proposalTitle}"`;

        if (isProposalNegotiationRequest(communication)) {
            return `${recipientLabel} requested negotiation on ${proposalReference}. Open Proposals to review the terms.`;
        }

        if (decision === 'accept') {
            return `${recipientLabel} accepted ${proposalReference}. Open Proposals to review the response.`;
        }

        if (decision === 'not_interested' || getProposalRecipientStatus(communication) === PROPOSAL_RECIPIENT_STATUSES.DECLINED) {
            return `${recipientLabel} is not interested in ${proposalReference}. Open Proposals to review the response.`;
        }

        return `${recipientLabel} responded to ${proposalReference}. Open Proposals to review the response.`;
    }

    flushProposalResponseArrivalAnnouncement() {
        const arrivals = Array.from(this.pendingProposalResponseArrivals.values());
        if (arrivals.length === 0) {
            return;
        }

        showToast({
            message: arrivals.length === 1
                ? this.buildProposalResponseArrivalMessage(arrivals[0])
                : `${arrivals.length} proposals received responses. Open Proposals to review them.`,
            type: 'info',
            duration: 10000
        });

        this.pendingProposalResponseArrivals.clear();
    }

    flushWhiteCellArrivalAnnouncement() {
        const responseCount = this.pendingWhiteCellArrivalSummary.responses.size;
        const proposalCount = this.pendingWhiteCellArrivalSummary.proposals.size;
        const journalUpdateCount = this.responses.filter((response) => (
            this.pendingWhiteCellArrivalSummary.responses.has(response?.id)
            && response?.kind === 'white_cell_update'
            && response?.title === this.getWhiteCellUpdateResponseTitle(
                WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL
            )
        )).length;

        if (responseCount === 0 && proposalCount === 0) {
            return;
        }

        let message = '';
        let type = 'info';

        if (journalUpdateCount === responseCount && proposalCount === 0) {
            message = journalUpdateCount === 1
                ? 'Tribe Street Journal updated. Open Tribe Street Journal to view the latest page update.'
                : `${journalUpdateCount} Tribe Street Journal updates arrived. Open Tribe Street Journal to view the latest page updates.`;
        } else if (responseCount > 0 && proposalCount > 0) {
            message = `New White Cell items arrived: ${responseCount} response${responseCount === 1 ? '' : 's'} and ${proposalCount} forwarded proposal${proposalCount === 1 ? '' : 's'}.`;
            type = 'warning';
        } else if (proposalCount > 0) {
            message = proposalCount === 1
                ? 'A new forwarded proposal has arrived from White Cell. Open Received Proposals.'
                : `${proposalCount} forwarded proposals have arrived from White Cell. Open Received Proposals.`;
            type = 'warning';
        } else {
            message = responseCount === 1
                ? 'A new White Cell response has arrived. Open White Cell Responses.'
                : `${responseCount} new White Cell responses have arrived. Open White Cell Responses.`;
        }

        showToast({
            message,
            type,
            duration: 10000
        });

        this.pendingWhiteCellArrivalSummary.responses.clear();
        this.pendingWhiteCellArrivalSummary.proposals.clear();
    }

    getWhiteCellUpdateResponseTitle(updateKind = null) {
        if (updateKind === WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL) {
            return 'White Cell Update: Tribe Street Journal';
        }

        if (updateKind === WHITE_CELL_UPDATE_KINDS.VERBA_AI_POPULATION_SENTIMENT) {
            return 'White Cell Update: Verba AI Population Sentiment';
        }

        return 'White Cell Update';
    }

    buildWhiteCellResponseEntry(communication = {}) {
        const updateKind = getWhiteCellCommunicationUpdateKind(communication);
        const audienceLabel = this.getCommunicationAudienceLabel(communication);

        if (isActionNotificationCommunication(communication)) {
            return this.buildActionNotificationResponseEntry(communication);
        }

        if (updateKind === WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL) {
            return {
                id: communication.id,
                kind: 'white_cell_update',
                created_at: communication.created_at,
                title: this.getWhiteCellUpdateResponseTitle(updateKind),
                subtitle: audienceLabel,
                content: communication.content,
                badgeText: 'WHITE CELL UPDATE',
                badgeVariant: 'primary'
            };
        }

        if (updateKind === WHITE_CELL_UPDATE_KINDS.VERBA_AI_POPULATION_SENTIMENT) {
            return {
                id: communication.id,
                kind: 'white_cell_update',
                created_at: communication.created_at,
                title: this.getWhiteCellUpdateResponseTitle(updateKind),
                subtitle: audienceLabel,
                content: communication.content,
                badgeText: 'VERBA AI UPDATE',
                badgeVariant: 'success'
            };
        }

        return {
            id: communication.id,
            kind: 'communication',
            created_at: communication.created_at,
            title: 'White Cell Communication',
            subtitle: audienceLabel,
            content: communication.content,
            badgeText: communication.type || 'MESSAGE',
            badgeVariant: 'info'
        };
    }

    buildActionNotificationResponseEntry(communication = {}) {
        const metadata = communication?.metadata && typeof communication.metadata === 'object'
            ? communication.metadata
            : {};
        const snapshot = metadata.action_snapshot && typeof metadata.action_snapshot === 'object'
            ? metadata.action_snapshot
            : {};
        const sourceTeamLabel = this.formatProposalRecipientTeamLabel(metadata.source_team || '');
        const actionTitle = snapshot.title || communication.title || 'Untitled action';
        const actionViewModel = getBlueActionViewModel({ artifact_payload: { action: snapshot } });
        const summaryParts = [];
        if (actionViewModel.objective) {
            summaryParts.push(`Objective: ${actionViewModel.objective}`);
        }
        if (actionViewModel.instrumentOfPower) {
            summaryParts.push(`Instrument: ${actionViewModel.instrumentOfPower}`);
        }
        const summaryLine = summaryParts.join(' | ');
        const noteText = communication.content || '';
        const content = [summaryLine, noteText].filter(Boolean).join('\n\n');

        return {
            id: communication.id,
            kind: 'action_notification',
            created_at: communication.created_at,
            title: `${sourceTeamLabel} Action: ${actionTitle}`,
            subtitle: 'Informational — no response needed',
            content,
            badgeText: 'INFORMATIONAL',
            badgeVariant: 'default'
        };
    }

    getResponseTypeGroups(responses = []) {
        const groupedResponses = new Map(
            RESPONSE_TYPE_GROUPS.map((group) => [group.key, {
                ...group,
                items: []
            }])
        );

        responses.forEach((response) => {
            const groupConfig = RESPONSE_TYPE_GROUP_BY_KIND.get(response?.kind) || RESPONSE_TYPE_GROUP_BY_KIND.get('other');
            groupedResponses.get(groupConfig.key).items.push(response);
        });

        return RESPONSE_TYPE_GROUPS
            .map((group) => groupedResponses.get(group.key))
            .filter((group) => group.items.length > 0)
            .map((group) => ({
                ...group,
                items: [...group.items].sort((left, right) => getSortableEventTime(right) - getSortableEventTime(left))
            }));
    }

    renderResponseCard(response = {}) {
        const isNewArrival = this.newResponseIds.has(response.id);
        const responseBadge = createBadge({
            text: response.badgeText || 'MESSAGE',
            variant: response.badgeVariant || 'info',
            size: 'sm',
            rounded: true
        }).outerHTML;
        const arrivalBadge = isNewArrival
            ? createBadge({
                text: 'NEW',
                variant: 'warning',
                size: 'sm',
                rounded: true
            }).outerHTML
            : '';

        return `
            <article class="card card-bordered response-card${isNewArrival ? ' response-card--new' : ''}" role="listitem">
                <div class="response-card__head">
                    <div class="response-card__title-group">
                        <h4 class="response-card__title">${this.escapeHtml(response.title)}</h4>
                        ${response.subtitle ? `<p class="response-card__subtitle">${this.escapeHtml(response.subtitle)}</p>` : ''}
                        <p class="response-card__timestamp">${formatDateTime(response.created_at)}</p>
                    </div>
                    <div class="response-card__badges">
                        ${arrivalBadge}
                        ${responseBadge}
                    </div>
                </div>
                <p class="response-card__content">${this.escapeHtml(response.content || '')}</p>
            </article>
        `;
    }

    renderResponseTypeGroup(group = {}) {
        const headingId = `responses-${group.key}-heading`;
        const itemCount = group.items?.length || 0;
        const countLabel = `${itemCount} item${itemCount === 1 ? '' : 's'}`;
        const visibleItems = (group.items || []).slice(0, RESPONSE_GROUP_RENDER_LIMIT);
        const hiddenCount = Math.max(0, itemCount - visibleItems.length);
        const body = itemCount
            ? `<div class="response-type-group__items" role="list">
                    ${visibleItems.map((response) => this.renderResponseCard(response)).join('')}
               </div>`
            : `<p class="text-sm text-gray-500" style="margin: 0;">No ${this.escapeHtml(group.title.toLowerCase())} yet.</p>`;

        return `
            <section class="response-type-group" aria-labelledby="${headingId}">
                <div class="response-type-group__header">
                    <div>
                        <h3 class="response-type-group__title" id="${headingId}">${this.escapeHtml(group.title)}</h3>
                        <p class="response-type-group__description">${this.escapeHtml(group.description)}</p>
                    </div>
                    <span class="response-type-group__count" aria-label="${this.escapeHtml(`${group.title}: ${countLabel}`)}">${this.escapeHtml(countLabel)}</span>
                </div>
                ${body}
                ${hiddenCount ? `<p class="text-xs text-gray-500" style="margin: var(--space-2) 0 0;">Showing the first ${RESPONSE_GROUP_RENDER_LIMIT} of ${itemCount} ${this.escapeHtml(group.title.toLowerCase())}.</p>` : ''}
            </section>
        `;
    }

    getForwardedProposalCommunication(action = null) {
        if (!action?.id) {
            return null;
        }

        return communicationsStore.getAll()
            .filter((communication) => (
                communication?.type === 'PROPOSAL_FORWARDED'
                && communication?.metadata?.source_proposal_id === action.id
            ))
            .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))[0] || null;
    }

    formatProposalRecipientTeamLabel(team = '') {
        const normalizedTeam = typeof team === 'string' ? team.trim().toLowerCase() : '';
        switch (normalizedTeam) {
            case 'blue':
                return 'Blue Team';
            case 'red':
                return 'Red Team';
            case 'green':
                return 'Green Team';
            case 'industry':
                return 'Industry Team';
            default:
                return team || 'Recipient team';
        }
    }

    getProposalResponseAudienceLabel(responseEntry = null, fallbackTeam = '') {
        return this.formatProposalRecipientTeamLabel(
            responseEntry?.responseFromTeam || fallbackTeam || ''
        );
    }

    renderProposalRecipientState(action = null) {
        const forwardedCommunication = this.getForwardedProposalCommunication(action);
        if (!forwardedCommunication) {
            return '';
        }

        const proposalViewModel = getProposalViewModel(action);
        const recipientEntry = getProposalRecipientEntry(forwardedCommunication);
        const recipientTeam = forwardedCommunication?.metadata?.recipient_team
            || proposalViewModel.recipientTeam
            || '';
        const recipientLabel = this.formatProposalRecipientTeamLabel(recipientTeam);
        const status = getProposalRecipientStatus(forwardedCommunication);
        const isNegotiationRequest = isProposalNegotiationRequest(forwardedCommunication);
        const statusLabel = isNegotiationRequest
            ? 'Negotiation requested'
            : formatProposalRecipientStatus(status);
        const actionedAt = recipientEntry?.actioned_at || null;
        const responseEntry = getProposalResponseEntry(forwardedCommunication);
        const responseAudienceLabel = this.getProposalResponseAudienceLabel(responseEntry, recipientTeam);
        const responseSentAt = responseEntry?.responseSentAt || actionedAt || null;
        const timestampLabel = responseSentAt ? formatRelativeTime(responseSentAt) : '';
        const statusMessage = {
            [PROPOSAL_RECIPIENT_STATUSES.UNREAD]: `Awaiting response from ${recipientLabel}`,
            [PROPOSAL_RECIPIENT_STATUSES.ACKNOWLEDGED]: `${recipientLabel} opened this proposal and is reviewing it.`,
            [PROPOSAL_RECIPIENT_STATUSES.RESPONDED]: isNegotiationRequest
                ? `${responseAudienceLabel} requested negotiation.`
                : `Response received from ${responseAudienceLabel}`,
            [PROPOSAL_RECIPIENT_STATUSES.DECLINED]: `${recipientLabel} declined this proposal.`,
            [PROPOSAL_RECIPIENT_STATUSES.IGNORED]: `${recipientLabel} marked this proposal as ignored.`
        }[status] || `Awaiting response from ${recipientLabel}`;
        const accentColor = {
            [PROPOSAL_RECIPIENT_STATUSES.UNREAD]: 'var(--color-info-600)',
            [PROPOSAL_RECIPIENT_STATUSES.ACKNOWLEDGED]: 'var(--color-warning)',
            [PROPOSAL_RECIPIENT_STATUSES.RESPONDED]: 'var(--color-success)',
            [PROPOSAL_RECIPIENT_STATUSES.DECLINED]: 'var(--color-error)',
            [PROPOSAL_RECIPIENT_STATUSES.IGNORED]: 'var(--color-text-muted)'
        }[status] || 'var(--color-info-600)';
        const responseContentMarkup = responseEntry?.responseContent ? `
            <div
                style="margin-top: var(--space-3); padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-surface);"
            >
                <p class="text-xs text-gray-500" style="margin: 0 0 var(--space-1);">
                    <strong>${isNegotiationRequest ? 'Negotiation terms' : `${this.escapeHtml(responseAudienceLabel)} Response`}</strong>
                </p>
                <p class="text-sm" style="margin: 0;">${this.escapeHtml(responseEntry.responseContent)}</p>
            </div>
        ` : '';

        return `
            <div
                class="card card-bordered"
                style="margin-top: var(--space-3); padding: var(--space-3); background: var(--color-surface-alt); border-left: 4px solid ${accentColor};"
            >
                <p class="text-xs text-gray-500" style="margin: 0 0 var(--space-1);">
                    <strong>Recipient Team:</strong> ${this.escapeHtml(recipientLabel)}
                </p>
                <p class="text-sm font-semibold" style="margin: 0 0 var(--space-1);">
                    ${this.escapeHtml(statusMessage)}
                </p>
                <p class="text-xs text-gray-500" style="margin: 0;">
                    <strong>Recipient Status:</strong> ${this.escapeHtml(statusLabel)}${timestampLabel ? ` | ${this.escapeHtml(timestampLabel)}` : ''}
                </p>
                ${responseContentMarkup}
            </div>
        `;
    }

    renderReceivedProposals() {
        const container = document.getElementById('receivedProposalsList');
        const unreadCount = countUnreadProposals(this.receivedProposals);
        this.updateSidebarBadge('receivedProposalsBadge', unreadCount);

        if (!container) return;

        if (this.receivedProposals.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No proposals received yet.</p>';
            return;
        }

        const statusOrder = [
            PROPOSAL_RECIPIENT_STATUSES.APPROVED_FORWARDED,
            PROPOSAL_RECIPIENT_STATUSES.UNREAD,
            PROPOSAL_RECIPIENT_STATUSES.ACKNOWLEDGED,
            PROPOSAL_RECIPIENT_STATUSES.RESPONDED,
            PROPOSAL_RECIPIENT_STATUSES.DECLINED,
            PROPOSAL_RECIPIENT_STATUSES.IGNORED
        ];
        const groupedProposals = new Map(statusOrder.map((status) => [status, []]));
        this.receivedProposals.forEach((communication) => {
            const status = getProposalRecipientStatus(communication);
            if (!groupedProposals.has(status)) {
                groupedProposals.set(status, []);
            }
            groupedProposals.get(status).push(communication);
        });

        const activeStatus = statusOrder.includes(this.proposalsActiveTab)
            ? this.proposalsActiveTab
            : statusOrder[0];
        this.proposalsActiveTab = activeStatus;

        const tabList = statusOrder.map((status) => {
            const count = (groupedProposals.get(status) || []).length;
            const isActive = status === activeStatus;
            return `
                <button
                    type="button"
                    class="tab-button${isActive ? ' tab-button-active' : ''}"
                    data-proposals-tab="${status}"
                    role="tab"
                    aria-selected="${isActive ? 'true' : 'false'}"
                    aria-controls="proposalsPanel-${status}"
                >${this.escapeHtml(formatProposalRecipientStatus(status))}<span class="tab-badge">${count}</span></button>
            `;
        }).join('');

        const panels = statusOrder.map((status) => {
            const proposals = groupedProposals.get(status) || [];
            const isActive = status === activeStatus;
            const body = proposals.length
                ? proposals.map((communication) => this.renderReceivedProposalCard(communication)).join('')
                : `<p class="text-sm text-gray-500" style="margin: 0;">No ${this.escapeHtml(formatProposalRecipientStatus(status).toLowerCase())} proposals.</p>`;
            return `
                <div
                    class="tab-panel"
                    id="proposalsPanel-${status}"
                    data-proposals-panel="${status}"
                    role="tabpanel"
                    ${isActive ? '' : 'hidden'}
                >${body}</div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="tabbed-section" data-proposals-tabs>
                <div class="tab-list" role="tablist" aria-label="Received proposal status">
                    ${tabList}
                </div>
                ${panels}
            </div>
        `;
    }

    renderReceivedProposalCard(communication) {
        const escape = (value) => this.escapeHtml(value);
        const formatList = (values) => Array.isArray(values) && values.length
            ? values.join(', ')
            : 'Not specified';
        const statusChipColor = (status) => {
            switch (status) {
                case PROPOSAL_RECIPIENT_STATUSES.ACKNOWLEDGED: return 'var(--color-success)';
                case PROPOSAL_RECIPIENT_STATUSES.RESPONDED:    return 'var(--color-primary-500)';
                case PROPOSAL_RECIPIENT_STATUSES.DECLINED:     return 'var(--color-error)';
                case PROPOSAL_RECIPIENT_STATUSES.IGNORED:      return 'var(--color-text-muted)';
                case PROPOSAL_RECIPIENT_STATUSES.UNREAD:
                default:                                        return 'var(--color-info-600)';
            }
        };

        {
            const metadata = communication?.metadata && typeof communication.metadata === 'object'
                ? communication.metadata
                : {};
            const snapshot = metadata.proposal && typeof metadata.proposal === 'object'
                ? metadata.proposal
                : {};
            const title = snapshot.title || 'Untitled proposal';
            const sourceTeam = metadata.source_team || 'green';
            const sourceLabel = this.formatProposalRecipientTeamLabel(sourceTeam);
            const receivedAt = communication.created_at;
            const status = getProposalRecipientStatus(communication);
            const isThreadBacked = isProposalThreadMessage(communication);
            const isNegotiationRequest = isProposalNegotiationRequest(communication);
            const statusLabel = isNegotiationRequest
                ? 'Negotiation requested'
                : formatProposalRecipientStatus(status);
            const isNewArrival = this.newReceivedProposalIds.has(communication.id);
            const cardId = escape(communication.id);
            const responseEntry = getProposalResponseEntry(communication);
            const showAcknowledge = !isThreadBacked && status === PROPOSAL_RECIPIENT_STATUSES.UNREAD;
            const showRespond = !isThreadBacked && !isProposalRecipientFinal(communication);
            const showDecline = !isThreadBacked && !isProposalRecipientFinal(communication);
            const showIgnore = !isThreadBacked && !isProposalRecipientFinal(communication);
            const actionSummaryMarkup = responseEntry?.responseContent ? `
                <div style="margin-top: var(--space-3); padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-surface-alt);">
                    <p class="text-xs text-gray-500" style="margin: 0 0 var(--space-1);">
                        <strong>${isNegotiationRequest ? 'Negotiation requested' : 'Response sent to White Cell'}</strong>${responseEntry.responseSentAt ? ` | ${escape(formatRelativeTime(responseEntry.responseSentAt))}` : ''}
                    </p>
                    ${isNegotiationRequest ? '<p class="text-xs text-gray-500" style="margin: 0 0 var(--space-1);">Negotiation terms</p>' : ''}
                    <p class="text-sm" style="margin: 0;">${escape(responseEntry.responseContent)}</p>
                </div>
            ` : '';
            const readOnlyResponseMessage = isNegotiationRequest
                ? `This negotiation request is locked and is now being shown to ${escape(sourceLabel)}.`
                : `This proposal response is locked and is now being shown back to ${escape(sourceLabel)}.`;
            const readOnlyStateMarkup = isThreadBacked
                ? '<p class="text-xs text-gray-500" style="margin: 0;">Proposal thread responses are managed in the Facilitator workspace.</p>'
                : status === PROPOSAL_RECIPIENT_STATUSES.RESPONDED
                ? `
                    <p class="text-xs text-gray-500" style="margin: 0;">
                        ${readOnlyResponseMessage}
                    </p>
                `
                : status === PROPOSAL_RECIPIENT_STATUSES.DECLINED
                ? `
                    <p class="text-xs text-gray-500" style="margin: 0;">
                        This proposal has been declined and is now locked.
                    </p>
                `
                : status === PROPOSAL_RECIPIENT_STATUSES.IGNORED
                ? `
                    <p class="text-xs text-gray-500" style="margin: 0;">
                        This proposal has been marked ignored and is now locked.
                    </p>
                `
                : '';
            const arrivalBadgeMarkup = isNewArrival
                ? createBadge({
                    text: 'NEW',
                    variant: 'warning',
                    size: 'sm',
                    rounded: true
                }).outerHTML
                : '';

            return `
                <div class="entity-card entity-card--${status}"${isNewArrival ? ' style="background: var(--color-surface-alt);"' : ''}>
                    <div class="entity-card__head">
                        <div>
                            <p class="entity-card__eyebrow">Forwarded from ${escape(sourceLabel)}</p>
                            <h3 class="entity-card__title">${escape(title)}</h3>
                        </div>
                        <div class="entity-card__badges" style="flex-direction: column; align-items: flex-end; gap: 4px;">
                            ${arrivalBadgeMarkup}
                            <span style="font-size: var(--text-xs); font-weight: var(--font-semibold); text-transform: uppercase; letter-spacing: 0.05em; color: ${statusChipColor(status)};">${escape(statusLabel)}</span>
                            <span class="text-xs text-gray-400">${escape(formatRelativeTime(receivedAt))}</span>
                        </div>
                    </div>
                    ${snapshot.objective ? `<p class="card-summary">${escape(snapshot.objective)}</p>` : ''}
                    ${this.renderDetailGrid([
                        { label: 'Originators', value: formatList(snapshot.originators) },
                        ...(snapshot.instruments?.length ? [{ label: 'Instrument of Power', value: formatList(snapshot.instruments) }] : []),
                        ...(snapshot.category ? [{ label: 'Category (historical)', value: snapshot.category }] : []),
                        {
                            label: 'Focus Sectors',
                            value: formatList(snapshot.focusSectors?.length
                                ? snapshot.focusSectors
                                : (snapshot.focusSector ? [snapshot.focusSector] : []))
                        },
                        ...(snapshot.supplyChainFocusDecision ? [{ label: 'Supply Chain Decision', value: snapshot.supplyChainFocusDecision }] : []),
                        ...(snapshot.supplyChainActionAngles?.length ? [{ label: 'Action Angles', value: formatList(snapshot.supplyChainActionAngles) }] : []),
                        ...(snapshot.supplyChainAreas?.length ? [{ label: 'Supply Chain Areas', value: formatList(snapshot.supplyChainAreas) }] : []),
                        ...(snapshot.industryFocus ? [{ label: 'Industry of Focus', value: snapshot.industryFocus }] : []),
                        ...(snapshot.countryFocus ? [{ label: 'Country of Focus', value: snapshot.countryFocus }] : []),
                        ...(snapshot.proposedActivity ? [{ label: 'Proposed Activity', value: snapshot.proposedActivity, wide: true }] : []),
                        ...(snapshot.delivery ? [{ label: 'Delivery (historical)', value: snapshot.delivery }] : []),
                        ...(snapshot.timingAndConditions ? [{ label: 'Timing & Conditions', value: snapshot.timingAndConditions, wide: true }] : []),
                        ...(snapshot.expectedOutcomes ? [{ label: 'Expected Outcomes', value: snapshot.expectedOutcomes, wide: true }] : [])
                    ])}
                    ${actionSummaryMarkup}
                    <div class="card-actions" style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
                        ${showAcknowledge ? `<button type="button" class="btn btn-secondary btn-sm" data-proposal-action="acknowledge" data-proposal-comm-id="${cardId}">Acknowledge</button>` : ''}
                        ${showRespond ? `<button type="button" class="btn btn-primary btn-sm" data-proposal-action="respond" data-proposal-comm-id="${cardId}">Respond</button>` : ''}
                        ${showDecline ? `<button type="button" class="btn btn-secondary btn-sm" data-proposal-action="decline" data-proposal-comm-id="${cardId}">Decline</button>` : ''}
                        ${showIgnore ? `<button type="button" class="btn btn-secondary btn-sm" data-proposal-action="ignore" data-proposal-comm-id="${cardId}">Ignore</button>` : ''}
                        ${readOnlyStateMarkup}
                    </div>
                </div>
            `;
        }
    }

    async persistProposalRecipientStatus(communication, status, {
        timelineType,
        toastMessage,
        extraMetadata = {},
        successMessage = null
    } = {}) {
        if (!this.requireWriteAccess()) return false;
        if (!communication?.id) {
            showToast({ message: 'Proposal not found.', type: 'error' });
            return false;
        }

        const latestCommunication = communicationsStore.getAll()
            .find((entry) => entry.id === communication.id) || communication;
        if (isProposalRecipientFinal(latestCommunication)) {
            showToast({ message: 'This proposal is already locked.', type: 'error' });
            return false;
        }

        let updatedCommunication = null;
        try {
            updatedCommunication = await database.updateProposalRecipientStatus(
                communication.id,
                status,
                extraMetadata
            );
            communicationsStore.updateFromServer('UPDATE', updatedCommunication);
        } catch (err) {
            logger.error('Failed to persist proposal recipient status:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to update proposal status. Refresh proposals and try again.'
                }),
                type: 'error'
            });
            return false;
        }

        if (timelineType) {
            try {
                const sessionId = sessionStore.getSessionId();
                const gameState = this.getCurrentGameState();
                const proposalTitle = updatedCommunication?.metadata?.proposal?.title
                    || communication?.metadata?.proposal?.title
                    || 'Untitled proposal';
                const timelineEvent = await database.createTimelineEvent({
                    session_id: sessionId,
                    type: timelineType,
                    content: `${successMessage || toastMessage || 'Proposal status updated'}: ${proposalTitle}`,
                    metadata: {
                        related_id: updatedCommunication?.metadata?.source_proposal_id
                            || communication?.metadata?.source_proposal_id
                            || null,
                        role: this.role || this.getCurrentLeadRole(),
                        communication_id: updatedCommunication?.id || communication.id,
                        recipient_team: this.teamId,
                        status,
                        ...extraMetadata
                    },
                    team: this.teamId,
                    move: gameState.move ?? 1,
                    phase: gameState.phase ?? 1
                });
                timelineStore.updateFromServer('INSERT', timelineEvent);
            } catch (err) {
                logger.error(`Failed to log ${status} timeline event:`, err);
            }
        }

        if (toastMessage) {
            showToast({ message: toastMessage, type: 'success' });
        }

        return true;
    }

    handleReceivedProposalAction(action, communication) {
        switch (action) {
            case 'acknowledge':
                return this.persistProposalRecipientStatus(communication, PROPOSAL_RECIPIENT_STATUSES.ACKNOWLEDGED, {
                    timelineType: 'PROPOSAL_ACKNOWLEDGED',
                    toastMessage: 'Proposal acknowledged'
                });
            case 'decline':
                return this.persistProposalRecipientStatus(communication, PROPOSAL_RECIPIENT_STATUSES.DECLINED, {
                    timelineType: 'PROPOSAL_DECLINED',
                    toastMessage: 'Proposal declined'
                });
            case 'ignore':
                return this.persistProposalRecipientStatus(communication, PROPOSAL_RECIPIENT_STATUSES.IGNORED, {
                    timelineType: 'PROPOSAL_IGNORED',
                    toastMessage: 'Proposal ignored'
                });
            case 'respond':
                return this.showProposalResponseModal(communication);
            default:
                return Promise.resolve(false);
        }
    }

    showProposalResponseModal(communication) {
        if (!this.requireWriteAccess()) return Promise.resolve(false);

        const proposalTitle = communication?.metadata?.proposal?.title || 'Untitled proposal';
        const content = document.createElement('div');
        content.innerHTML = `
            <form id="proposalResponseForm" novalidate>
                <p class="text-sm text-gray-500" style="margin: 0 0 var(--space-3);">
                    Responding to: <strong>${this.escapeHtml(proposalTitle)}</strong><br>
                    Your response will be sent to White Cell for review.
                </p>
                <div class="form-group">
                    <label class="form-label" for="proposalResponseText">Response *</label>
                    <textarea
                        id="proposalResponseText"
                        class="form-input form-textarea"
                        rows="5"
                        placeholder="Your response..."
                    ></textarea>
                </div>
            </form>
        `;

        const modalRef = { current: null };
        modalRef.current = showModal({
            title: 'Respond to Proposal',
            content,
            size: 'md',
            buttons: [
                { label: 'Cancel', variant: 'secondary', onClick: () => {} },
                {
                    label: 'Send Response',
                    variant: 'primary',
                    onClick: () => {
                        const text = content.querySelector('#proposalResponseText')?.value?.trim();
                        if (!text) {
                            showToast({ message: 'Response text is required.', type: 'error' });
                            return false;
                        }
                        this.submitProposalResponse(communication, text, modalRef.current).catch((err) => {
                            logger.error('Failed to send proposal response:', err);
                        });
                        return false;
                    }
                }
            ]
        });

        return Promise.resolve(true);
    }

    async submitProposalResponse(communication, text, modal) {
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No session found', type: 'error' });
            return;
        }

        const latestCommunication = communicationsStore.getAll()
            .find((entry) => entry.id === communication.id) || communication;
        if (isProposalRecipientFinal(latestCommunication)) {
            showToast({ message: 'This proposal response is already locked.', type: 'error' });
            return;
        }

        const loader = showLoader({ message: 'Sending response...' });

        try {
            const gameState = this.getCurrentGameState();
            const proposalTitle = communication?.metadata?.proposal?.title || 'Untitled proposal';
            const responseSentAt = new Date().toISOString();
            const responseFromRole = this.role || this.getCurrentLeadRole();

            const responseComm = await database.createCommunication({
                session_id: sessionId,
                from_role: responseFromRole,
                to_role: 'white_cell',
                type: 'PROPOSAL_RESPONSE',
                content: text,
                metadata: {
                    source_proposal_id: communication?.metadata?.source_proposal_id || null,
                    source_communication_id: communication.id,
                    source_team: communication?.metadata?.source_team || null,
                    responder_team: this.teamId
                }
            });
            communicationsStore.updateFromServer('INSERT', responseComm);

            const updatedProposalCommunication = await database.updateProposalRecipientStatus(
                communication.id,
                PROPOSAL_RECIPIENT_STATUSES.RESPONDED,
                {
                    response_communication_id: responseComm.id,
                    responded_at: responseSentAt,
                    response_sent_at: responseSentAt,
                    response_content: text,
                    response_from_role: responseFromRole,
                    response_from_team: this.teamId
                }
            );
            communicationsStore.updateFromServer('UPDATE', updatedProposalCommunication);

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'PROPOSAL_RESPONDED',
                content: `Responded to proposal: ${proposalTitle}`,
                metadata: {
                    related_id: communication?.metadata?.source_proposal_id || null,
                    role: this.role || this.getCurrentLeadRole(),
                    communication_id: communication.id,
                    response_communication_id: responseComm.id,
                    recipient_team: this.teamId,
                    status: PROPOSAL_RECIPIENT_STATUSES.RESPONDED
                },
                team: this.teamId,
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: 'Response sent to White Cell', type: 'success' });
            modal?.close();
            this.renderReceivedProposals();
        } catch (err) {
            logger.error('Failed to send proposal response:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to send response. Refresh proposals and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    syncTimelineFromStore() {
        const relevantEvents = timelineStore.getAll()
            .filter((event) => isWhiteCellTimelineEventVisibleToLead(event, this.teamContext))
            .slice(0, 50);

        this.timelineEvents = relevantEvents;
        this.journalEntries = buildTribeStreetJournalEntries(relevantEvents, this.teamId);

        this.renderTimeline();
        this.renderTribeStreetJournalList();
    }

    setRfiActiveTab(tab) {
        if (!tab || tab === this.rfiActiveTab) return;
        this.rfiActiveTab = tab;
        const container = document.getElementById('rfiList');
        if (!container || typeof container.querySelectorAll !== 'function') return;
        container.querySelectorAll('.tab-button[data-rfi-tab]').forEach((button) => {
            const isActive = button.dataset.rfiTab === tab;
            button.classList.toggle('tab-button-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        container.querySelectorAll('.tab-panel[data-rfi-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.rfiPanel !== tab;
        });
    }

    setResponsesActiveTab(tab) {
        if (!tab || tab === this.responsesActiveTab) return;
        this.responsesActiveTab = tab;
        const container = document.getElementById('responsesList');
        if (!container || typeof container.querySelectorAll !== 'function') return;
        container.querySelectorAll('.tab-button[data-responses-tab]').forEach((button) => {
            const isActive = button.dataset.responsesTab === tab;
            button.classList.toggle('tab-button-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        container.querySelectorAll('.tab-panel[data-responses-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.responsesPanel !== tab;
        });
    }

    setProposalsActiveTab(tab) {
        if (!tab || tab === this.proposalsActiveTab) return;
        this.proposalsActiveTab = tab;
        const container = document.getElementById('receivedProposalsList');
        if (!container || typeof container.querySelectorAll !== 'function') return;
        container.querySelectorAll('.tab-button[data-proposals-tab]').forEach((button) => {
            const isActive = button.dataset.proposalsTab === tab;
            button.classList.toggle('tab-button-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        container.querySelectorAll('.tab-panel[data-proposals-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.proposalsPanel !== tab;
        });
    }

    renderActionsList() {
        const actionsList = document.getElementById('actionsList');
        if (!actionsList) return;
        actionsList.innerHTML = this.renderGroupedActionList();

        actionsList.querySelectorAll('.toggle-action-card-btn').forEach((button) => {
            button.addEventListener('click', () => {
                this.toggleActionCard(button.dataset.actionId || '');
            });
        });

        actionsList.querySelectorAll('.edit-action-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const action = this.actions.find((candidate) => candidate.id === button.dataset.actionId);
                if (action) {
                    this.showEditActionModal(action);
                }
            });
        });

        actionsList.querySelectorAll('.forward-action-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const action = this.actions.find((candidate) => candidate.id === button.dataset.actionId);
                if (action) {
                    this.confirmForwardAction(action);
                }
            });
        });

        actionsList.querySelectorAll('.delete-action-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const action = this.actions.find((candidate) => candidate.id === button.dataset.actionId);
                if (action) {
                    this.confirmDeleteAction(action);
                }
            });
        });
    }

    getActionStatusGroupKey(action = {}) {
        const status = action.status || ENUMS.ACTION_STATUS.DRAFT;

        if (isSubmittedAction(status)) {
            return 'submitted';
        }

        if (isAdjudicatedAction(status)) {
            return 'reviewed';
        }

        if (canEditAction(status)) {
            return 'draft';
        }

        return 'other';
    }

    setActionMark(markKey) {
        const normalizedMarkKey = String(markKey || '');
        if (!ACTION_MARKS.some((mark) => mark.key === normalizedMarkKey)) {
            return;
        }

        this.actionMarkActiveKey = normalizedMarkKey;
        const container = document.getElementById('actionsList');
        if (!container || typeof container.querySelectorAll !== 'function') return;

        container.querySelectorAll('[data-action-mark-tab]').forEach((button) => {
            const isActive = button.dataset.actionMarkTab === normalizedMarkKey;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
            button.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        container.querySelectorAll('[data-action-mark-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.actionMarkPanel !== normalizedMarkKey;
        });
    }

    handleActionMarkKeydown(event, container = document.getElementById('actionsList')) {
        const currentTab = event.target?.closest?.('[data-action-mark-tab]');
        if (!currentTab || !container?.contains?.(currentTab)) return;

        const tabs = [...container.querySelectorAll('[data-action-mark-tab]')];
        const currentIndex = tabs.indexOf(currentTab);
        if (currentIndex < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

        event.preventDefault();
        const nextIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
            ? tabs.length - 1
            : event.key === 'ArrowLeft'
            ? (currentIndex - 1 + tabs.length) % tabs.length
            : (currentIndex + 1) % tabs.length;
        const nextTab = tabs[nextIndex];
        this.setActionMark(nextTab?.dataset?.actionMarkTab);
        nextTab?.focus?.();
    }

    renderGroupedActionList() {
        const groups = groupActionRecordsByMark(this.actions);
        if (!ACTION_MARKS.some((mark) => mark.key === this.actionMarkActiveKey)) {
            this.actionMarkActiveKey = [...groups].reverse().find((mark) => mark.count > 0)?.key
                || ACTION_MARKS[0].key;
        }

        const visibleGroups = groups.map((mark) => {
            const visibleItems = mark.records.slice(0, ACTION_GROUP_RENDER_LIMIT);
            return { ...mark, visibleItems };
        });

        const tabs = visibleGroups.map((mark) => {
            const isActive = mark.key === this.actionMarkActiveKey;
            return `
                <button
                    type="button"
                    id="facilitator-action-mark-tab-${mark.key}"
                    class="action-mark-tab${isActive ? ' is-active' : ''}"
                    data-action-mark-tab="${mark.key}"
                    role="tab"
                    aria-selected="${isActive ? 'true' : 'false'}"
                    aria-controls="facilitator-action-mark-panel-${mark.key}"
                    aria-label="${this.escapeHtml(`${mark.label}, ${mark.count} ${mark.count === 1 ? 'record' : 'records'}`)}"
                    tabindex="${isActive ? '0' : '-1'}"
                >
                    <span>${this.escapeHtml(mark.label)}</span>
                    <span class="action-mark-count" aria-hidden="true">${mark.count}</span>
                </button>
            `;
        }).join('');

        const panels = visibleGroups.map((mark) => {
            const isActive = mark.key === this.actionMarkActiveKey;
            return `
                <section
                    id="facilitator-action-mark-panel-${mark.key}"
                    class="action-mark-panel"
                    data-action-mark-panel="${mark.key}"
                    role="tabpanel"
                    aria-labelledby="facilitator-action-mark-tab-${mark.key}"
                    ${isActive ? '' : 'hidden'}
                >
                    ${mark.visibleItems.length
                        ? `<div class="card-list">${mark.visibleItems.map((action) => this.renderActionCard(action)).join('')}</div>`
                        : `<p class="action-mark-empty">No records for ${this.escapeHtml(mark.label)}.</p>`}
                    ${mark.count > mark.visibleItems.length
                        ? `<p class="action-sequence-overflow">Showing the newest ${mark.visibleItems.length} of ${mark.count} records for this mark.</p>`
                        : ''}
                </section>
            `;
        }).join('');

        return `
            <div class="action-mark-navigation" data-action-mark-navigation>
                <div class="action-mark-rail" role="tablist" aria-label="${this.escapeHtml(`${this.teamLabel} records by simulation mark`)}">
                    ${tabs}
                </div>
                <p class="action-mark-help">Use Left and Right Arrow keys to move between marks. Records are newest first.</p>
                ${panels}
            </div>
        `;
    }

    renderDetailGrid(fields = []) {
        const items = fields
            .filter((field) => field && field.value != null && String(field.value).trim() !== '')
            .map((field) => `
                <div class="detail-item${field.wide ? ' detail-item--wide' : ''}">
                    <strong>${this.escapeHtml(field.label)}:</strong> ${this.escapeHtml(String(field.value))}
                </div>
            `).join('');
        return items ? `<div class="detail-grid">${items}</div>` : '';
    }

    isCollapsibleStrategicActionCard({
        isStrategicOrientationFlow = false,
        isGreenProposalFlow = false,
        isLegacyRedResponseFlow = false
    } = {}) {
        return !isStrategicOrientationFlow && !isGreenProposalFlow && !isLegacyRedResponseFlow;
    }

    isActionCardExpanded(actionId = '') {
        return this.expandedActionCardIds.has(String(actionId || ''));
    }

    toggleActionCard(actionId = '') {
        const normalizedActionId = String(actionId || '');
        if (!normalizedActionId) {
            return;
        }

        if (this.expandedActionCardIds.has(normalizedActionId)) {
            this.expandedActionCardIds.delete(normalizedActionId);
        } else {
            this.expandedActionCardIds.add(normalizedActionId);
        }

        this.renderActionsList();
    }

    renderActionCard(action) {
        const strategicOrientation = getStrategicOrientationViewModel(action);
        const isStrategicOrientationFlow = strategicOrientation.hasStrategicOrientationDetails;
        const blueAction = getBlueActionViewModel(action);
        const isGreenProposalFlow = this.isGreenTeamProposalEnabled(action) && !isStrategicOrientationFlow;
        const proposal = isGreenProposalFlow ? getProposalViewModel(action) : null;
        const moveResponse = this.teamId === 'red' && !isStrategicOrientationFlow
            ? getMoveResponseViewModel(action)
            : null;
        const isLegacyRedResponseFlow = this.teamId === 'red'
            && !isStrategicOrientationFlow
            && !isGreenProposalFlow
            && Boolean(moveResponse?.hasMoveResponseDetails)
            && !blueAction.hasBlueActionDetails;
        const isRedResponseFlow = isLegacyRedResponseFlow;
        const title = isStrategicOrientationFlow
            ? strategicOrientation.title
            : isGreenProposalFlow
            ? proposal.title
            : (isLegacyRedResponseFlow ? moveResponse.title : blueAction.title);
        const expectedOutcomes = isStrategicOrientationFlow
            ? (strategicOrientation.isForecast
                ? (strategicOrientation.forecastSummary || `Forecast: Blue will choose ${strategicOrientation.orientationLabel}.`)
                : (strategicOrientation.orientationTag || 'Strategic Orientation selected.'))
            : isLegacyRedResponseFlow
            ? (moveResponse.expectedEffect || 'No expected effect recorded')
            : isGreenProposalFlow
            ? (proposal.expectedOutcomes || 'No expected outcomes recorded.')
            : (blueAction.expectedOutcomes || 'No expected outcomes');
        const targetLabel = formatBlueActionSelection(blueAction.focusCountries);
        const sequenceLabel = isStrategicOrientationFlow
            ? 'Pre-Move 1 | Strategic Orientation'
            : isGreenProposalFlow
            ? `Move ${action.move || 1}`
            : this.isTeamActionWizardEnabled(action)
            ? this.getBlueActionSequenceContext(action).label
            : `Move ${action.move || 1} | Phase ${action.phase || 1}`;
        const rawLifecycle = getArtifactLifecycleViewModel(action);
        const isReturnedToBlue = rawLifecycle.isReturned;
        const isForwardedDraft = isDraftAction(action)
            && !isReturnedToBlue
            && (
                blueAction.scribeHandoff === BLUE_ACTION_SCRIBE_HANDOFF.FORWARDED
                || strategicOrientation.scribeHandoff === STRATEGIC_ORIENTATION_SCRIBE_HANDOFF.FORWARDED
                || proposal?.scribeHandoff === PROPOSAL_SCRIBE_HANDOFF.FORWARDED
            );
        const lifecycleArtifact = isForwardedDraft
            ? { ...action, canonical_workflow_state: 'forwarded_to_facilitator' }
            : action;
        const lifecycle = getArtifactLifecycleViewModel(lifecycleArtifact);
        const canManageDraft = !this.isReadOnly
            && canEditAction(action)
            && (!isStrategicOrientationFlow || isReturnedToBlue);
        const canSubmitDraft = !this.isReadOnly && canSubmitAction(action);
        const canRemoveDraft = !this.isReadOnly && !isStrategicOrientationFlow && canDeleteAction(action);
        const forwardedProposalCommunication = isGreenProposalFlow
            ? this.getForwardedProposalCommunication(action)
            : null;
        const shouldHideWhiteCellReviewDetails = Boolean(isGreenProposalFlow && forwardedProposalCommunication);
        const statusBadge = createArtifactLifecycleBadge(lifecycleArtifact, { size: 'sm' }).outerHTML;
        const deliberationBadge = lifecycle.isAwaitingWhiteCell
            ? createBadge({ text: 'Deliberation Underway', variant: 'warning', size: 'sm', rounded: true }).outerHTML
            : '';
        const proposalResponseArrivalBadge = isGreenProposalFlow
            && this.newProposalResponseActionIds.has(action.id)
            ? createBadge({
                text: 'NEW RESPONSE',
                variant: 'warning',
                size: 'sm',
                rounded: true
            }).outerHTML
            : '';
        const secondaryBadge = isStrategicOrientationFlow
            ? createBadge({
                text: getStrategicOrientationArtifactLabel(strategicOrientation),
                variant: 'info',
                size: 'sm',
                rounded: true
            }).outerHTML
            : isGreenProposalFlow
            ? createBadge({
                text: 'PROPOSAL',
                variant: 'info',
                size: 'sm',
                rounded: true
            }).outerHTML
            : blueAction.hasBlueActionDetails && blueAction.enforcementTimeline
            ? createBadge({
                text: blueAction.enforcementTimeline,
                variant: 'info',
                size: 'sm',
                rounded: true
            }).outerHTML
            : createPriorityBadge(action.priority || 'NORMAL').outerHTML;
        const strategicOrientationFields = isStrategicOrientationFlow
            ? [
                ...getStrategicOrientationDisplayFields(strategicOrientation),
                ...(strategicOrientation.primaryLevers.length
                    ? [{ label: 'Primary Levers', value: formatStrategicOrientationSelection(strategicOrientation.primaryLevers) }]
                    : []),
                ...(strategicOrientation.acceptedCosts.length
                    ? [{ label: 'Accepted Costs', value: formatStrategicOrientationSelection(strategicOrientation.acceptedCosts) }]
                    : []),
                ...(strategicOrientation.posture
                    ? [{ label: 'Posture', value: strategicOrientation.posture }]
                    : []),
                ...(strategicOrientation.rationale
                    ? [{ label: 'Team Rationale', value: strategicOrientation.rationale, wide: true }]
                    : [])
            ]
            : [];
        const detailFields = isStrategicOrientationFlow
            ? strategicOrientationFields
            : isGreenProposalFlow
            ? proposal.artifactDetails
            : isLegacyRedResponseFlow
            ? [
                { label: 'Strategic Assessment', value: moveResponse.strategicAssessment || 'Not specified', wide: true },
                { label: 'Response Strategy', value: moveResponse.responseStrategy || 'Not specified', wide: true },
                { label: 'Key Actions', value: moveResponse.keyActions || 'Not specified', wide: true },
                { label: 'Targets / Pressure Points', value: moveResponse.targetsAndPressurePoints || 'Not specified', wide: true },
                { label: 'Delivery Channel', value: moveResponse.deliveryChannel || 'Not specified' }
            ]
            : blueAction.hasBlueActionDetails
            ? blueAction.artifactDetails
            : [
                ...(action.ally_contingencies ? [{ label: 'Ally Contingencies', value: action.ally_contingencies, wide: true }] : []),
                { label: 'Targets', value: targetLabel },
                { label: 'Sector', value: action.sector || 'Not specified' },
                { label: 'Exposure', value: action.exposure_type || 'Not specified' }
            ];
        const detailsMarkup = this.renderDetailGrid(detailFields);
        const statusGroupKey = this.getActionStatusGroupKey(action);
        const statusAccent = statusGroupKey === 'reviewed' ? 'deliberated' : statusGroupKey;
        const isCollapsibleCard = this.isCollapsibleStrategicActionCard({
            isStrategicOrientationFlow,
            isGreenProposalFlow,
            isLegacyRedResponseFlow
        });
        const actionId = String(action.id || '');
        const detailsId = `facilitator-action-details-${actionId.replace(/[^a-z0-9]+/gi, '-') || 'card'}`;
        const isExpanded = !isCollapsibleCard || this.isActionCardExpanded(actionId);
        const objectivePreview = isGreenProposalFlow
            ? (proposal.objective || 'Not specified')
            : (blueAction.objective || 'Not specified');
        const revisionNumber = Number.isInteger(action.revision_number)
            ? action.revision_number
            : null;
        const reviewNotes = action.review_notes || action.adjudication_notes || '';

        let lifecycleMessage = `
            <p class="text-xs text-gray-500" style="margin-top: var(--space-3);">
                    ${isStrategicOrientationFlow
                        ? 'Draft Strategic Orientation artifacts are projected by the Facilitator before White Cell submission.'
                        : isGreenProposalFlow
                    ? (proposal.scribeHandoff === PROPOSAL_SCRIBE_HANDOFF.FORWARDED
                        ? 'Forwarded to the Facilitator for projection, live edit, and White Cell submission.'
                        : 'Draft proposals can be edited, forwarded to the Facilitator, or deleted by the active team-lead seat.')
                    : (isLegacyRedResponseFlow
                        ? 'Draft actions can be edited, submitted, or deleted by the active team-lead seat.'
                        : 'Draft actions can be edited, forwarded to the Facilitator, or deleted by the active team-lead seat.')}
            </p>
        `;

        if (isReturnedToBlue) {
            lifecycleMessage = `
                <p class="text-xs text-gray-500" style="margin-top: var(--space-3);">
                    Returned by White Cell${revisionNumber ? ` as revision ${revisionNumber}` : ''}. Correct the artifact and send it to the Facilitator for resubmission.
                </p>
            `;
        } else if (isSubmittedAction(action)) {
            lifecycleMessage = `
                <p class="text-xs text-gray-500" style="margin-top: var(--space-3);">
                    ${lifecycle.state === 'resubmitted'
                        ? 'Resubmitted to White Cell'
                        : isStrategicOrientationFlow
                        ? 'Submitted to White Cell'
                        : isGreenProposalFlow
                        ? 'Sent to White Cell'
                        : 'Submitted to White Cell'} ${action.submitted_at ? formatRelativeTime(action.submitted_at) : ''}.
                    ${isStrategicOrientationFlow
                        ? 'This pre-Move-1 artifact is now read-only for Scribe and Facilitator seats.'
                        : isGreenProposalFlow
                        ? 'This proposal is now read-only for Scribe and Facilitator seats until White Cell review.'
                        : (isLegacyRedResponseFlow
                            ? 'White Cell deliberation is underway. This action is now read-only for Scribe and Facilitator seats.'
                            : 'White Cell deliberation is underway. This action was submitted by the Facilitator and is now read-only for Scribe and Facilitator seats.')}
                </p>
            `;
        } else if (isAdjudicatedAction(action)) {
            lifecycleMessage = shouldHideWhiteCellReviewDetails
                ? ''
                : `
                    <p class="text-xs text-gray-500" style="margin-top: var(--space-3);">
                        White Cell ${isStrategicOrientationFlow
                            ? 'reviewed this Strategic Orientation artifact'
                            : isGreenProposalFlow
                            ? 'reviewed this proposal'
                            : 'reviewed this action'} ${action.adjudicated_at ? formatRelativeTime(action.adjudicated_at) : ''}.
                    </p>
                `;
        } else if (this.isReadOnly) {
            lifecycleMessage = `
                <p class="text-xs text-gray-500" style="margin-top: var(--space-3);">
                    ${isStrategicOrientationFlow
                        ? 'Observer mode is read-only. Strategic Orientation artifacts are visible but cannot be changed from this page.'
                        : isGreenProposalFlow
                        ? 'Observer mode is read-only. Draft proposals are visible but cannot be changed from this page.'
                        : (isLegacyRedResponseFlow
                            ? 'Observer mode is read-only. Move responses are visible but cannot be changed from this page.'
                            : 'Observer mode is read-only. Draft actions are visible but cannot be changed from this page.')}
                </p>
            `;
        }

        return `
            <div class="entity-card entity-card--${statusAccent}${isGreenProposalFlow ? ' entity-card--proposal' : ''}${isCollapsibleCard ? ' entity-card--collapsible' : ''}${isExpanded ? '' : ' is-collapsed'}" data-action-id="${action.id}"${isGreenProposalFlow ? ` data-artifact-type="proposal" role="article" aria-label="Proposal: ${this.escapeHtml(title)}"` : ''}>
                ${isCollapsibleCard ? `
                    <button
                        type="button"
                        class="entity-card__toggle toggle-action-card-btn${isExpanded ? ' is-expanded' : ''}"
                        data-action-id="${this.escapeHtml(actionId)}"
                        aria-expanded="${isExpanded ? 'true' : 'false'}"
                        aria-controls="${this.escapeHtml(detailsId)}"
                    >
                        <span class="entity-card__toggle-copy">
                            <span class="entity-card__toggle-label">Action details</span>
                            <span class="entity-card__toggle-title">${this.escapeHtml(title)}</span>
                            <span class="entity-card__toggle-objective"><strong>Objective:</strong> ${this.escapeHtml(objectivePreview)}</span>
                        </span>
                        <span class="entity-card__toggle-state">
                            ${statusBadge}
                            <span class="entity-card__toggle-indicator" aria-hidden="true">${isExpanded ? 'Hide' : 'Show'}</span>
                        </span>
                    </button>
                ` : ''}
                <div id="${this.escapeHtml(detailsId)}" class="entity-card__details${isCollapsibleCard ? '' : ' entity-card__details--plain'}"${isExpanded ? '' : ' hidden'}>
                    <div class="entity-card__head">
                        <div>
                            <p class="entity-card__eyebrow">${this.escapeHtml(isGreenProposalFlow ? 'Proposal' : (action.mechanism || 'No mechanism'))} &middot; ${this.escapeHtml(sequenceLabel)}</p>
                            <h3 class="entity-card__title">${this.escapeHtml(title)}</h3>
                        </div>
                        <div class="entity-card__badges">
                            ${proposalResponseArrivalBadge}
                            ${statusBadge}
                            ${deliberationBadge}
                            ${secondaryBadge}
                        </div>
                    </div>

                    <p class="card-summary">
                        ${isLegacyRedResponseFlow
                            ? `<strong>Expected Effect &amp; System Impact:</strong> ${this.escapeHtml(expectedOutcomes)}`
                            : isGreenProposalFlow
                            ? `<strong>Expected Outcomes:</strong> ${this.escapeHtml(expectedOutcomes)}`
                            : this.escapeHtml(expectedOutcomes)}
                    </p>
                    ${detailsMarkup}
                    ${isGreenProposalFlow ? this.renderProposalRecipientState(action) : ''}
                    ${reviewNotes && (!shouldHideWhiteCellReviewDetails || isReturnedToBlue) ? `
                        <p class="entity-card__note"${isReturnedToBlue ? ' style="border-left: 3px solid var(--color-warning, #b45309); padding-left: var(--space-2);"' : ''}>
                            <strong>${isReturnedToBlue ? 'Send-back notes from White Cell:' : 'White Cell Notes:'}</strong>
                            ${this.escapeHtml(reviewNotes)}
                        </p>
                    ` : ''}
                    ${isReturnedToBlue && revisionNumber ? `
                        <p class="entity-card__note"><strong>Revision:</strong> ${revisionNumber}</p>
                    ` : ''}
                    ${isReturnedToBlue && isDraftAction(action) && !reviewNotes ? `
                        <p class="entity-card__note" style="border-left: 3px solid var(--color-warning, #b45309); padding-left: var(--space-2);">
                            <strong>Returned by White Cell.</strong> Edit this draft and resubmit when complete.
                        </p>
                    ` : ''}
                    ${lifecycleMessage}

                    ${(canManageDraft || (canSubmitDraft && !isStrategicOrientationFlow && !isGreenProposalFlow) || canRemoveDraft) ? `
                        <div class="card-actions" style="display: flex; gap: var(--space-2); margin-top: var(--space-3);">
                            ${canManageDraft ? `
                                <button class="btn btn-secondary btn-sm edit-action-btn" data-action-id="${action.id}">
                                    ${isReturnedToBlue
                                        ? (isStrategicOrientationFlow
                                            ? 'Edit Returned Orientation'
                                            : (isGreenProposalFlow ? 'Edit Returned Proposal' : 'Edit Returned Action'))
                                        : (isGreenProposalFlow ? 'Edit Proposal' : 'Edit Draft')}
                                </button>
                            ` : ''}
                            ${canSubmitDraft && !isStrategicOrientationFlow && !isGreenProposalFlow ? `
                                <button class="btn btn-primary btn-sm forward-action-btn" data-action-id="${action.id}">
                                    Forward to Facilitator
                                </button>
                            ` : ''}
                            ${canRemoveDraft ? `
                                <button class="btn btn-ghost btn-sm text-error delete-action-btn" data-action-id="${action.id}">
                                    ${isGreenProposalFlow ? 'Delete Proposal' : 'Delete Draft'}
                                </button>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    showCreateActionModal() {
        if (!this.requireWriteAccess()) return;

        if (this.isStrategicOrientationGateActive()) {
            showToast({
                message: this.getStrategicOrientationGateMessage(),
                type: 'warning'
            });
            return;
        }

        if (this.isTeamActionWizardEnabled()) {
            this.showBlueActionWizard();
            return;
        }

        if (this.isGreenTeamProposalEnabled()) {
            this.showGreenProposalModal();
            return;
        }

        const content = this.createActionFormContent();
        const modalRef = { current: null };

        modalRef.current = showModal({
            title: 'Create New Action',
            content,
            size: 'lg',
            buttons: [
                {
                    label: 'Cancel',
                    variant: 'secondary',
                    onClick: () => {}
                },
                {
                    label: 'Save Draft',
                    variant: 'primary',
                    onClick: () => {
                        this.handleCreateAction(modalRef.current).catch((err) => {
                            logger.error('Failed to create action:', err);
                        });
                        return false;
                    }
                }
            ]
        });
    }

    showEditActionModal(action, options = {}) {
        if (!this.requireWriteAccess()) return;
        const isProposal = this.isGreenTeamProposalEnabled(action);
        if (!canEditAction(action)) {
            showToast({
                message: isProposal ? 'Only draft proposals can be edited.' : 'Only draft actions can be edited.',
                type: 'error'
            });
            return;
        }

        if (options.host) {
            this.mountEditActionInHost(action, options);
            return;
        }

        if (isStrategicOrientationAction(action)) {
            this.showStrategicOrientationModal(action);
            return;
        }

        if (this.isTeamActionWizardEnabled(action)) {
            this.showBlueActionWizard(action);
            return;
        }

        if (this.isGreenTeamProposalEnabled(action)) {
            this.showGreenProposalModal(action);
            return;
        }

        const content = this.createActionFormContent(action);
        const modalRef = { current: null };

        modalRef.current = showModal({
            title: 'Edit Draft Action',
            content,
            size: 'lg',
            buttons: [
                {
                    label: 'Cancel',
                    variant: 'secondary',
                    onClick: () => {}
                },
                {
                    label: 'Save Changes',
                    variant: 'primary',
                    onClick: () => {
                        this.handleUpdateAction(modalRef.current, action.id).catch((err) => {
                            logger.error('Failed to update action:', err);
                        });
                        return false;
                    }
                }
            ]
        });
    }

    /**
     * Mount an edit editor into a host element (presentation side panel) instead of a modal.
     * Reuses the same form builders/binders; `modal.close()` maps to onClose.
     */
    mountEditActionInHost(action, {
        host = null,
        onClose = null,
        title = 'Edit while presenting'
    } = {}) {
        if (!host || !action?.id) {
            return null;
        }

        const closeHost = () => {
            onClose?.();
        };
        const modalAdapter = {
            close: closeHost
        };

        host.replaceChildren();
        const shell = document.createElement('div');
        shell.className = 'scribe-presentation-edit-shell';
        shell.innerHTML = `
            <header class="scribe-presentation-edit-header">
                <div>
                    <p class="scribe-presentation-edit-eyebrow">Live edit</p>
                    <h3 class="scribe-presentation-edit-title">${this.escapeHtml(title)}</h3>
                </div>
                <button type="button" class="btn btn-ghost btn-sm" data-presentation-edit-close aria-label="Close edit panel">Close</button>
            </header>
            <div class="scribe-presentation-edit-body" data-presentation-edit-body></div>
        `;
        host.appendChild(shell);

        const body = shell.querySelector('[data-presentation-edit-body]');
        shell.querySelector('[data-presentation-edit-close]')?.addEventListener('click', closeHost);

        if (isStrategicOrientationAction(action)) {
            const content = this.createStrategicOrientationContent(action);
            body.appendChild(content);
            this.bindStrategicOrientationModal(content, modalAdapter, {
                actionId: action.id,
                isEdit: true
            });
            return modalAdapter;
        }

        if (this.isTeamActionWizardEnabled(action)) {
            const sequenceContext = this.getBlueActionSequenceContext(action);
            const content = this.createBlueActionWizardContent(action, {
                isEdit: true,
                sequenceContext
            });
            body.appendChild(content);
            this.bindBlueActionWizard(content, modalAdapter, {
                actionId: action.id,
                sequenceContext
            });
            return modalAdapter;
        }

        if (this.isGreenTeamProposalEnabled(action)) {
            const content = this.createGreenProposalContent(action, { isEdit: true });
            body.appendChild(content);
            this.bindGreenProposalModal(content, modalAdapter, {
                actionId: action.id,
                isEdit: true
            });
            return modalAdapter;
        }

        const content = this.createActionFormContent(action);
        body.appendChild(content);
        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'btn btn-primary';
        saveButton.textContent = 'Save Changes';
        saveButton.addEventListener('click', () => {
            this.handleUpdateAction(modalAdapter, action.id).catch((err) => {
                logger.error('Failed to update action:', err);
            });
        });
        const footer = document.createElement('div');
        footer.className = 'scribe-presentation-edit-footer';
        footer.appendChild(saveButton);
        body.appendChild(footer);
        return modalAdapter;
    }

    isTeamActionWizardEnabled(action = null) {
        return ['blue', 'red'].includes(this.teamId)
            && (!action || !action.team || action.team === this.teamId)
            && (!action || !isStrategicOrientationAction(action));
    }

    isBlueTeamActionWizardEnabled(action = null) {
        return this.teamId === 'blue'
            && (!action || !action.team || action.team === this.teamId)
            && (!action || !isStrategicOrientationAction(action));
    }

    isProposalTeam() {
        return isProposalTeamId(this.teamId);
    }

    isGreenTeamProposalEnabled(action = null) {
        return this.isProposalTeam()
            && (!action || !action.team || action.team === this.teamId)
            && (!action || !isStrategicOrientationAction(action));
    }

    isRedTeamResponseEnabled(action = null) {
        return this.teamId === 'red'
            && (!action || !action.team || action.team === this.teamId)
            && (!action || !isStrategicOrientationAction(action));
    }

    getStrategicOrientationArtifactType() {
        return STRATEGIC_ORIENTATION_ARTIFACT_TYPES.ORIENTATION_AND_FORECAST;
    }

    getStrategicOrientationActionForTeam() {
        return this.getActionStoreSnapshot().find((action) => (
            action?.team === this.teamId
            && isStrategicOrientationAction(action)
        )) || null;
    }

    getStrategicOrientationModalCopy() {
        const profile = getStrategicOrientationTeamProfile(this.teamId);
        return {
            title: profile?.title || 'Strategic Orientation',
            submitButton: profile?.submitCopy || 'Record Strategic Orientation'
        };
    }

    showStrategicOrientationModal(action = null) {
        if (!this.requireWriteAccess()) return;
        if (!STRATEGIC_ORIENTATION_TEAM_IDS.has(this.teamId)) {
            showToast({
                message: 'Strategic Orientation is available only to Blue, Green, Red, and Industry.',
                type: 'warning'
            });
            return;
        }

        const existingAction = this.getStrategicOrientationActionForTeam()
            || (action && isStrategicOrientationAction(action) ? action : null);
        const isEdit = Boolean(
            action?.id
            && existingAction?.id === action.id
            && canEditAction(existingAction)
        );
        if (existingAction && !isEdit) {
            this.updateStrategicOrientationControlAvailability();
            showToast({
                message: 'Strategic Orientation has already been recorded for this team.',
                type: 'info'
            });
            return;
        }

        const content = this.createStrategicOrientationContent(isEdit ? existingAction : {});
        const modalRef = { current: null };
        const copy = this.getStrategicOrientationModalCopy();

        modalRef.current = showModal({
            title: isEdit ? `Edit ${copy.title}` : copy.title,
            content,
            size: 'xl'
        });

        this.bindStrategicOrientationModal(content, modalRef.current, {
            actionId: isEdit ? existingAction.id : null,
            isEdit
        });
    }

    createStrategicOrientationContent(action = {}) {
        const content = document.createElement('div');
        const copy = this.getStrategicOrientationModalCopy();
        const profile = getStrategicOrientationTeamProfile(this.teamId);
        const viewModel = getStrategicOrientationViewModel(action);
        const forecastTargets = getStrategicOrientationForecastTargetsForTeam(this.teamId);
        const ownOrientation = viewModel.ownOrientation?.id || '';
        const forecasts = forecastTargets.reduce((accumulator, target) => {
            const matchedForecast = viewModel.forecastTargets.find((forecast) => forecast.key === target.key);
            accumulator[target.key] = matchedForecast?.orientation || '';
            return accumulator;
        }, {});
        const renderOrientationCard = (section, option) => {
            const targetKey = section.targetKey;
            const selectedValue = targetKey === 'own' ? ownOrientation : forecasts[targetKey];
            const isSelected = selectedValue === option.id;
            return `
                <button
                    class="opt${isSelected ? ' selected' : ''}"
                    type="button"
                    data-orientation="${this.escapeHtml(option.id)}"
                    data-orientation-target="${this.escapeHtml(targetKey)}"
                    role="radio"
                    aria-checked="${isSelected ? 'true' : 'false'}"
                    tabindex="${isSelected || (!selectedValue && option.number === '01') ? '0' : '-1'}"
                >
                    <div class="opt-name">${this.escapeHtml(option.name)}</div>
                    <div class="opt-tag">${this.escapeHtml(option.tag)}</div>
                </button>
            `;
        };
        const renderSection = (section, index) => {
            const sectionNumber = index + 1;
            const sectionId = `strategicOrientationSection-${sectionNumber}`;
            if (section.kind === 'catalogue') {
                const errorId = `${sectionId}-error`;
                return `
                    <section class="strategic-orientation-section" aria-labelledby="${sectionId}-heading">
                        <h3 id="${sectionId}-heading"><span aria-hidden="true">${sectionNumber}.</span> ${this.escapeHtml(section.legend)}</h3>
                        <p class="form-hint" id="${sectionId}-help">${this.escapeHtml(section.helpText)}</p>
                        <fieldset class="form-group strategic-orientation-fieldset" data-orientation-field="${this.escapeHtml(section.key)}" aria-describedby="${sectionId}-help ${errorId}">
                            <legend class="sr-only">${this.escapeHtml(section.legend)} (required)</legend>
                            <div class="options" role="radiogroup" aria-label="${this.escapeHtml(section.legend)}" aria-required="true">
                                ${Object.values(STRATEGIC_ORIENTATION_OPTIONS).map((option) => renderOrientationCard(section, option)).join('')}
                            </div>
                            <p class="form-error" id="${errorId}" data-orientation-error="${this.escapeHtml(section.key)}" hidden></p>
                        </fieldset>
                    </section>
                `;
            }

            const value = viewModel[section.key] || '';
            return `
                <section class="strategic-orientation-section" aria-labelledby="${sectionId}-heading">
                    <h3 id="${sectionId}-heading"><span aria-hidden="true">${sectionNumber}.</span> ${this.escapeHtml(section.label)}</h3>
                    <div class="form-group">
                        <label class="form-label" for="${this.escapeHtml(section.key)}">${this.escapeHtml(section.label)} <span class="required-indicator">*</span></label>
                        <textarea id="${this.escapeHtml(section.key)}" class="form-input form-textarea" data-orientation-narrative="${this.escapeHtml(section.key)}" aria-describedby="${sectionId}-help ${sectionId}-error" required>${this.escapeHtml(value)}</textarea>
                        <p class="form-hint" id="${sectionId}-help">${this.escapeHtml(section.helpText)}</p>
                        <p class="form-error" id="${sectionId}-error" data-orientation-error="${this.escapeHtml(section.key)}" hidden></p>
                    </div>
                </section>
            `;
        };
        const choicesComplete = profile?.sections
            .filter((section) => section.kind === 'catalogue')
            .every((section) => Boolean(section.targetKey === 'own' ? ownOrientation : forecasts[section.targetKey]));

        content.innerHTML = `
            <section class="strategic-orientation-modal" data-strategic-orientation-modal>
                <div class="content-pad">
                    <div class="form-error-summary" data-orientation-error-summary role="alert" tabindex="-1" hidden>
                        <h3>Complete the required Strategic Orientation fields</h3>
                        <ul></ul>
                    </div>
                    <div class="strategic-orientation-sections">
                        ${(profile?.sections || []).map(renderSection).join('')}
                    </div>
                    <div class="form-actions strategic-orientation-actions">
                        <button class="btn btn-ghost" type="button" data-orientation-nav="cancel">Cancel</button>
                        <button class="btn btn-primary" id="confirmBtn" type="button" data-orientation-nav="confirm" ${choicesComplete ? '' : 'disabled'}>${this.escapeHtml(copy.submitButton)}</button>
                    </div>
                </div>
            </section>
        `;

        content.__strategicOrientationInitialState = {
            ownOrientation,
            forecasts,
            orientationRationale: viewModel.orientationRationale || '',
            forecastActionDescription: viewModel.forecastActionDescription || '',
            strategyDescription: viewModel.strategyDescription || ''
        };

        return content;
    }

    bindStrategicOrientationModal(content, modal, { actionId = null, isEdit = false } = {}) {
        const profile = getStrategicOrientationTeamProfile(this.teamId);
        const initial = content.__strategicOrientationInitialState || {};
        const state = {
            ownOrientation: initial.ownOrientation || '',
            forecasts: { ...(initial.forecasts || {}) },
            orientationRationale: initial.orientationRationale || '',
            forecastActionDescription: initial.forecastActionDescription || '',
            strategyDescription: initial.strategyDescription || ''
        };
        const confirmBtn = content.querySelector('#confirmBtn');
        const orientationButtons = [...content.querySelectorAll('[data-orientation]')];
        const orientationButtonsByTarget = orientationButtons.reduce((accumulator, button) => {
            const targetKey = button.dataset.orientationTarget;
            accumulator.set(targetKey, [...(accumulator.get(targetKey) || []), button]);
            return accumulator;
        }, new Map());
        const updateConfirmState = () => {
            if (!confirmBtn) return;
            const catalogueSections = profile?.sections.filter((section) => section.kind === 'catalogue') || [];
            confirmBtn.disabled = !catalogueSections.every((section) => Boolean(
                section.targetKey === 'own' ? state.ownOrientation : state.forecasts[section.targetKey]
            ));
        };
        const selectOrientation = (orientation, { focus = false, targetKey } = {}) => {
            if (!STRATEGIC_ORIENTATION_OPTIONS[orientation] || !targetKey) return;
            if (targetKey === 'own') state.ownOrientation = orientation;
            else state.forecasts[targetKey] = orientation;

            (orientationButtonsByTarget.get(targetKey) || []).forEach((button) => {
                const selected = button.dataset.orientation === orientation;
                button.classList.toggle('selected', selected);
                button.setAttribute('aria-checked', selected ? 'true' : 'false');
                button.tabIndex = selected ? 0 : -1;
                if (focus && selected) button.focus();
            });
            this.clearStrategicOrientationFieldError(content, targetKey === 'own' ? 'ownOrientation' : `forecast:${targetKey}`);
            updateConfirmState();
        };

        orientationButtons.forEach((button) => {
            const targetKey = button.dataset.orientationTarget;
            const groupButtons = orientationButtonsByTarget.get(targetKey) || [];
            button.addEventListener('click', () => selectOrientation(button.dataset.orientation, { targetKey }));
            button.addEventListener('keydown', (event) => {
                if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return;
                event.preventDefault();
                const currentIndex = groupButtons.indexOf(event.currentTarget);
                const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
                const nextButton = groupButtons[(currentIndex + direction + groupButtons.length) % groupButtons.length];
                selectOrientation(nextButton.dataset.orientation, { focus: true, targetKey });
            });
        });

        content.querySelectorAll('[data-orientation-narrative]').forEach((textarea) => {
            textarea.addEventListener('input', () => {
                state[textarea.dataset.orientationNarrative] = textarea.value;
                this.clearStrategicOrientationFieldError(content, textarea.dataset.orientationNarrative);
            });
        });
        content.querySelector('[data-orientation-nav="cancel"]')?.addEventListener('click', () => modal?.close());
        content.querySelector('[data-orientation-nav="confirm"]')?.addEventListener('click', () => {
            content.querySelectorAll('[data-orientation-narrative]').forEach((textarea) => {
                state[textarea.dataset.orientationNarrative] = textarea.value;
            });
            const errors = this.validateStrategicOrientationData(state);
            if (errors.length) {
                this.renderStrategicOrientationErrors(content, errors);
                return;
            }
            this.submitStrategicOrientation(modal, state, { actionId, isEdit }).catch((err) => {
                logger.error('Failed to forward Strategic Orientation:', err);
            });
        });
        updateConfirmState();
    }

    clearStrategicOrientationFieldError(content, field) {
        const error = content.querySelector(`[data-orientation-error="${field}"]`);
        if (error) {
            error.hidden = true;
            error.textContent = '';
        }
        const textarea = content.querySelector(`[data-orientation-narrative="${field}"]`);
        textarea?.removeAttribute('aria-invalid');
        content.querySelector(`[data-orientation-field="${field}"]`)?.removeAttribute('aria-invalid');
    }

    renderStrategicOrientationErrors(content, errors = []) {
        content.querySelectorAll('[data-orientation-error]').forEach((node) => {
            node.hidden = true;
            node.textContent = '';
        });
        errors.forEach(({ field, message }) => {
            const fieldError = content.querySelector(`[data-orientation-error="${field}"]`);
            if (fieldError) {
                fieldError.textContent = message;
                fieldError.hidden = false;
            }
            content.querySelector(`[data-orientation-narrative="${field}"]`)?.setAttribute('aria-invalid', 'true');
            content.querySelector(`[data-orientation-field="${field}"]`)?.setAttribute('aria-invalid', 'true');
        });
        const summary = content.querySelector('[data-orientation-error-summary]');
        if (summary) {
            summary.querySelector('ul').innerHTML = errors.map(({ message }) => `<li>${this.escapeHtml(message)}</li>`).join('');
            summary.hidden = false;
            summary.focus();
        }
    }

    validateStrategicOrientationData(data = {}) {
        const profile = getStrategicOrientationTeamProfile(this.teamId);
        const errors = [];
        (profile?.sections || []).forEach((section) => {
            if (section.kind === 'catalogue') {
                const value = section.targetKey === 'own' ? data.ownOrientation : data?.forecasts?.[section.targetKey];
                if (!STRATEGIC_ORIENTATION_OPTIONS[value]) {
                    errors.push({ field: section.key, message: `${section.legend} is required.` });
                }
            } else if (!String(data?.[section.key] || '').trim()) {
                errors.push({ field: section.key, message: `${section.label} is required.` });
            }
        });
        return errors;
    }

    buildStrategicOrientationPayload(data = {}) {
        const profile = getStrategicOrientationTeamProfile(this.teamId);
        const ownOption = STRATEGIC_ORIENTATION_OPTIONS[data.ownOrientation];
        const forecastTargets = (profile?.forecastTargets || []).map((targetKey) => {
            const option = STRATEGIC_ORIENTATION_OPTIONS[data?.forecasts?.[targetKey]];
            const target = getStrategicOrientationForecastTargetsForTeam(this.teamId).find(({ key }) => key === targetKey);
            return {
                key: target.key,
                label: target.label,
                orientation: option.id,
                orientationLabel: option.name,
                orientationTag: option.tag
            };
        });
        const forecastSummary = buildStrategicOrientationForecastSummary(forecastTargets);

        return {
            goal: `${this.teamLabel} Strategic Orientation: ${ownOption.name}`,
            mechanism: STRATEGIC_ORIENTATION_ACTION_MECHANISM,
            sector: '',
            exposure_type: STRATEGIC_ORIENTATION_PERIOD,
            priority: 'HIGH',
            targets: [],
            expected_outcomes: ownOption.tag,
            ally_contingencies: serializeStrategicOrientationDetails({
                artifactType: this.getStrategicOrientationArtifactType(),
                team: this.teamId,
                ownOrientation: ownOption.id,
                forecastSummary,
                forecastTargets,
                orientationRationale: String(data.orientationRationale || '').trim(),
                forecastActionDescription: String(data.forecastActionDescription || '').trim(),
                strategyDescription: String(data.strategyDescription || '').trim(),
                scribeHandoff: STRATEGIC_ORIENTATION_SCRIBE_HANDOFF.FORWARDED
            })
        };
    }

    async submitStrategicOrientation(modal, data = {}, { actionId = null, isEdit = false } = {}) {
        if (!this.requireWriteAccess()) return;

        const errors = this.validateStrategicOrientationData(data);
        if (errors.length) {
            showToast({ message: errors[0].message, type: 'error' });
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No session found', type: 'error' });
            return;
        }

        if (this.strategicOrientationSubmissionInFlight) {
            showToast({
                message: 'Strategic Orientation is already being recorded for this team.',
                type: 'info'
            });
            return;
        }

        const existingAction = this.getStrategicOrientationActionForTeam();
        if (existingAction && (!isEdit || existingAction.id !== actionId)) {
            this.updateStrategicOrientationControlAvailability();
            showToast({
                message: 'Strategic Orientation has already been recorded for this team.',
                type: 'info'
            });
            return;
        }

        const loader = showLoader({ message: 'Forwarding Strategic Orientation to Facilitator...' });
        this.strategicOrientationSubmissionInFlight = true;
        this.updateStrategicOrientationControlAvailability();

        try {
            const payload = this.buildStrategicOrientationPayload(data);
            const payloadViewModel = getStrategicOrientationViewModel({
                ...payload,
                team: this.teamId
            });
            const option = STRATEGIC_ORIENTATION_OPTIONS[payloadViewModel.orientation];
            let action;

            if (isEdit && actionId) {
                action = await database.updateDraftAction(actionId, payload);
                actionsStore.updateFromServer('UPDATE', action);
            } else {
                action = await database.createAction({
                    ...payload,
                    session_id: sessionId,
                    client_id: sessionStore.getClientId(),
                    team: this.teamId,
                    status: ENUMS.ACTION_STATUS.DRAFT,
                    move: 1,
                    phase: 1
                });
                actionsStore.updateFromServer('INSERT', action);

                const createdTimelineEvent = await database.createTimelineEvent({
                    session_id: sessionId,
                    type: 'ACTION_CREATED',
                    content: `Strategic Orientation draft created: ${action.goal || option.name}`,
                    metadata: {
                        related_id: action.id,
                        role: this.role || this.getCurrentLeadRole(),
                        strategic_orientation: true,
                        period: STRATEGIC_ORIENTATION_PERIOD
                    },
                    team: this.teamId,
                    move: 1,
                    phase: 1
                });
                timelineStore.updateFromServer('INSERT', createdTimelineEvent);
            }

            const forwardedTimelineEvent = await database.createTimelineEvent({
                session_id: action.session_id || sessionId,
                type: 'STRATEGIC_ORIENTATION_FORWARDED_TO_SCRIBE',
                content: `Strategic Orientation forwarded to Facilitator: ${action.goal || option.name}`,
                metadata: {
                    related_id: action.id,
                    role: this.role || this.getCurrentLeadRole(),
                    strategic_orientation: true,
                    artifact_type: this.getStrategicOrientationArtifactType(),
                    orientation: option.id,
                    own_orientation: payloadViewModel.ownOrientation,
                    forecast_targets: payloadViewModel.forecastTargets,
                    orientation_rationale: payloadViewModel.orientationRationale,
                    forecast_action_description: payloadViewModel.forecastActionDescription,
                    strategy_description: payloadViewModel.strategyDescription,
                    next_step: 'scribe_project_then_submit_to_white_cell',
                    semantic_next_step: 'facilitator_project_then_submit_to_white_cell'
                },
                team: this.teamId,
                move: 1,
                phase: 1
            });
            timelineStore.updateFromServer('INSERT', forwardedTimelineEvent);

            this.updateStrategicOrientationControlAvailability();
            showToast({ message: 'Strategic Orientation forwarded to Facilitator', type: 'success' });
            modal?.close();
        } catch (err) {
            logger.error('Failed to forward Strategic Orientation:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to forward Strategic Orientation. Refresh the draft and try again.'
                }),
                type: 'error'
            });
        } finally {
            this.strategicOrientationSubmissionInFlight = false;
            this.updateStrategicOrientationControlAvailability();
            hideLoader();
        }
    }

    showRedResponseModal(action = null) {
        const isEdit = Boolean(action?.id);
        const content = this.createRedResponseContent(action || {}, { isEdit });
        const modalRef = { current: null };

        modalRef.current = showModal({
            title: isEdit ? 'Edit Move Response' : 'New Move Response',
            content,
            size: 'xl'
        });

        this.bindRedResponseModal(content, modalRef.current, {
            actionId: action?.id || null,
            isEdit
        });
    }

    createRedResponseContent(action = {}, { isEdit = false, submitLabel = null } = {}) {
        const content = document.createElement('div');
        const viewModel = getMoveResponseViewModel(action);
        const titleValue = viewModel.title === 'Untitled response' ? '' : viewModel.title;

        content.innerHTML = `
            <form id="redResponseForm" novalidate>
                <div class="form-group">
                    <label class="form-label" for="responseTitle">Response Title *</label>
                    <input
                        id="responseTitle"
                        class="form-input"
                        type="text"
                        placeholder="Enter a concise title for this response"
                        value="${this.escapeHtml(titleValue)}"
                        maxlength="200"
                    >
                </div>

                <div class="form-group">
                    <label class="form-label" for="responseStrategicAssessment">Strategic Assessment *</label>
                    <textarea
                        id="responseStrategicAssessment"
                        class="form-input form-textarea"
                        rows="4"
                        placeholder="What is Blue (and partners) trying to achieve this move? What patterns, priorities, or vulnerabilities do you assess?"
                    >${this.escapeHtml(viewModel.strategicAssessment)}</textarea>
                </div>

                <div class="form-group">
                    <label class="form-label" for="responseStrategy">Response Strategy *</label>
                    <textarea
                        id="responseStrategy"
                        class="form-input form-textarea"
                        rows="3"
                        placeholder="What is your overarching approach this move? (Deter, Disrupt, Shape, etc.)"
                    >${this.escapeHtml(viewModel.responseStrategy)}</textarea>
                </div>

                <div class="form-group">
                    <label class="form-label" for="responseKeyActions">Key Actions *</label>
                    <textarea
                        id="responseKeyActions"
                        class="form-input form-textarea"
                        rows="4"
                        placeholder="What specific actions are you taking in response?"
                    >${this.escapeHtml(viewModel.keyActions)}</textarea>
                </div>

                <div class="form-group">
                    <label class="form-label" for="responseTargets">Targets / Pressure Points *</label>
                    <textarea
                        id="responseTargets"
                        class="form-input form-textarea"
                        rows="3"
                        placeholder="Who or what are you trying to influence?"
                    >${this.escapeHtml(viewModel.targetsAndPressurePoints)}</textarea>
                </div>

                <div class="form-group">
                    <label class="form-label" for="responseDeliveryChannel">Delivery Channel *</label>
                    <textarea
                        id="responseDeliveryChannel"
                        class="form-input form-textarea"
                        rows="3"
                        placeholder="How are these actions executed? (state policy, informal pressure, misinformation)"
                    >${this.escapeHtml(viewModel.deliveryChannel)}</textarea>
                </div>

                <div class="form-group">
                    <label class="form-label" for="responseExpectedEffect">Expected Effect &amp; System Impact *</label>
                    <textarea
                        id="responseExpectedEffect"
                        class="form-input form-textarea"
                        rows="4"
                        placeholder="What outcomes do you expect, and how do they interact with BLUE / GREEN actors?"
                    >${this.escapeHtml(viewModel.expectedEffect)}</textarea>
                </div>

                <div style="display: flex; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--color-border);">
                    <button type="button" class="btn btn-secondary" data-response-nav="cancel">Cancel</button>
                    <button type="button" class="btn btn-primary" data-response-nav="submit">
                        ${this.escapeHtml(submitLabel || (isEdit ? 'Save Changes' : 'Submit for White Cell Review'))}
                    </button>
                </div>
            </form>
        `;

        return content;
    }

    bindRedResponseModal(content, modal, {
        actionId = null,
        isEdit = false
    } = {}) {
        const form = content.querySelector('#redResponseForm');
        const forwardButton = content.querySelector('[data-response-nav="submit"]');

        content.querySelector('[data-response-nav="cancel"]')?.addEventListener('click', () => {
            modal?.close();
        });

        forwardButton?.addEventListener('click', () => {
            this.submitRedResponse(modal, form, { actionId, isEdit }).catch((err) => {
                logger.error('Failed to submit Red Team move response:', err);
            });
        });

        form.querySelector('#responseTitle')?.focus?.();
    }

    getRedResponseData(form) {
        return {
            title: form.querySelector('#responseTitle')?.value?.trim() || '',
            strategicAssessment: form.querySelector('#responseStrategicAssessment')?.value?.trim() || '',
            responseStrategy: form.querySelector('#responseStrategy')?.value?.trim() || '',
            keyActions: form.querySelector('#responseKeyActions')?.value?.trim() || '',
            targetsAndPressurePoints: form.querySelector('#responseTargets')?.value?.trim() || '',
            deliveryChannel: form.querySelector('#responseDeliveryChannel')?.value?.trim() || '',
            expectedEffect: form.querySelector('#responseExpectedEffect')?.value?.trim() || ''
        };
    }

    validateRedResponse(data) {
        if (!data.title) return 'Response Title is required.';
        if (!data.strategicAssessment) return 'Strategic Assessment is required.';
        if (!data.responseStrategy) return 'Response Strategy is required.';
        if (!data.keyActions) return 'Key Actions is required.';
        if (!data.targetsAndPressurePoints) return 'Targets / Pressure Points is required.';
        if (!data.deliveryChannel) return 'Delivery Channel is required.';
        if (!data.expectedEffect) return 'Expected Effect & System Impact is required.';
        return null;
    }

    buildRedResponsePayload(data) {
        return {
            goal: data.title,
            mechanism: MOVE_RESPONSE_ACTION_MECHANISM,
            sector: '',
            exposure_type: null,
            priority: 'NORMAL',
            targets: [],
            expected_outcomes: data.expectedEffect,
            ally_contingencies: serializeMoveResponseDetails({
                strategicAssessment: data.strategicAssessment,
                responseStrategy: data.responseStrategy,
                keyActions: data.keyActions,
                targetsAndPressurePoints: data.targetsAndPressurePoints,
                deliveryChannel: data.deliveryChannel
            })
        };
    }

    async submitRedResponse(modal, form, { actionId = null, isEdit = false } = {}) {
        if (!this.requireWriteAccess()) return;

        const data = this.getRedResponseData(form);
        const error = this.validateRedResponse(data);
        if (error) {
            showToast({ message: error, type: 'error' });
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No session found', type: 'error' });
            return;
        }

        const loader = showLoader({ message: 'Submitting response for White Cell review...' });

        try {
            const gameState = this.getCurrentGameState();
            const payload = this.buildRedResponsePayload(data);

            let action;
            if (isEdit && actionId) {
                action = await database.updateDraftAction(actionId, payload);
                actionsStore.updateFromServer('UPDATE', action);
            } else {
                action = await database.createAction({
                    ...payload,
                    session_id: sessionId,
                    client_id: sessionStore.getClientId(),
                    team: this.teamId,
                    status: ENUMS.ACTION_STATUS.SUBMITTED,
                    move: gameState.move ?? 1,
                    phase: gameState.phase ?? 1
                });
                actionsStore.updateFromServer('INSERT', action);
            }

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'ACTION_SUBMITTED',
                content: `Move response submitted for White Cell review: ${action.goal || 'Untitled response'}`,
                metadata: {
                    related_id: action.id,
                    role: this.role || this.getCurrentLeadRole(),
                    move_response: true,
                    review_stage: 'white_cell_review'
                },
                team: this.teamId,
                move: action.move ?? gameState.move ?? 1,
                phase: action.phase ?? gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({
                message: isEdit
                    ? 'Move response updated.'
                    : 'Move response submitted for White Cell review.',
                type: 'success'
            });
            modal?.close();
        } catch (err) {
            logger.error('Failed to submit Red move response:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to submit response. Check the form and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    showGreenProposalModal(action = null) {
        const isEdit = Boolean(action?.id);
        const isIndustryProposal = this.teamId === 'industry';
        const content = isIndustryProposal
            ? this.createIndustryProposalContent(action || {}, { isEdit })
            : this.createGreenProposalContent(action || {}, { isEdit });
        const modalRef = { current: null };

        modalRef.current = showModal({
            title: isEdit
                ? `Edit ${isIndustryProposal ? 'US Industry ' : ''}Proposal`
                : `New ${isIndustryProposal ? 'US Industry ' : ''}Proposal`,
            content,
            size: 'xl'
        });

        this.bindGreenProposalModal(content, modalRef.current, {
            actionId: action?.id || null,
            isEdit
        });
    }

    createGreenProposalContent(action = {}, { isEdit = false } = {}) {
        return this.createProposalContent(action, { isEdit, proposalKind: 'green' });
    }

    createIndustryProposalContent(action = {}, { isEdit = false } = {}) {
        return this.createProposalContent(action, { isEdit, proposalKind: 'industry' });
    }

    getProposalRevisionHistory(action = {}) {
        if (!action?.id) return [];

        return timelineStore.getAll()
            .filter((event) => (
                event?.type === 'ARTIFACT_RETURNED_TO_TEAM'
                && (event?.metadata?.related_id === action.id || event?.metadata?.action_id === action.id)
            ))
            .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
    }

    renderProposalRevisionContext(action = {}) {
        const lifecycle = getArtifactLifecycleViewModel(action);
        const history = this.getProposalRevisionHistory(action);
        const reviewNotes = action.review_notes || action.adjudication_notes || '';
        if (!lifecycle.isReturned && !history.length && !reviewNotes) return '';

        return `
            <section class="card card-bordered" aria-labelledby="proposalRevisionContextTitle" style="margin-bottom: var(--space-4); padding: var(--space-4);">
                <h3 id="proposalRevisionContextTitle" class="font-semibold" style="margin: 0 0 var(--space-2);">White Cell return and revision history</h3>
                ${reviewNotes ? `<p class="text-sm"><strong>Reviewer notes:</strong> ${this.escapeHtml(reviewNotes)}</p>` : ''}
                <p class="text-sm"><strong>Current logical proposal:</strong> ${this.escapeHtml(String(action.id || 'Not available'))}</p>
                <p class="text-sm"><strong>Current revision:</strong> ${this.escapeHtml(String(action.revision_number || 1))}</p>
                ${history.length ? `
                    <ol class="text-sm" style="margin: var(--space-3) 0 0; padding-left: var(--space-5);">
                        ${history.map((event) => `
                            <li>
                                Revision ${this.escapeHtml(String(event.metadata?.revision_number || 1))}
                                returned ${this.escapeHtml(formatDateTime(event.created_at))}:
                                ${this.escapeHtml(event.metadata?.return_notes || event.content || 'No reviewer notes recorded.')}
                            </li>
                        `).join('')}
                    </ol>
                ` : ''}
            </section>
        `;
    }

    createProposalContent(action = {}, { isEdit = false, proposalKind = 'green' } = {}) {
        const content = document.createElement('div');
        const viewModel = getProposalViewModel(action);
        const isIndustryProposal = proposalKind === 'industry';
        const builtInSectorValues = PROPOSAL_SECTORS.filter((value) => value !== 'Other');
        const customSectorValue = viewModel.focusSectors.find(
            (value) => value && !builtInSectorValues.includes(value) && value !== 'Other'
        ) || '';
        const selectedSectorValues = [
            ...viewModel.focusSectors.filter((value) => builtInSectorValues.includes(value)),
            ...(customSectorValue || viewModel.focusSectors.includes('Other') ? ['Other'] : [])
        ];
        const selectedRecipientTeams = viewModel.recipientTeams;
        const supplyChainFocusDecision = viewModel.supplyChainFocusDecision;

        const renderOriginatorCheckbox = (value) => {
            const inputId = `proposalOriginator${value.replace(/[^a-z0-9]+/gi, '')}`;
            return `
                <label class="form-check" for="${inputId}">
                    <input
                        id="${inputId}"
                        class="form-checkbox"
                        type="checkbox"
                        data-proposal-originator="true"
                        value="${value}"
                        ${viewModel.originators.includes(value) ? 'checked' : ''}
                    >
                    <span class="form-check-label">${value}</span>
                </label>
            `;
        };

        const formId = `${this.teamId}ProposalForm`;

        content.innerHTML = `
            <form id="${this.escapeHtml(formId)}" novalidate>
                ${this.renderProposalRevisionContext(action)}
                <div class="form-group">
                    <label class="form-label" for="proposalTitle">Proposal Title *</label>
                    <input
                        id="proposalTitle"
                        class="form-input"
                        type="text"
                        value="${this.escapeHtml(viewModel.title === 'Untitled proposal' ? '' : viewModel.title)}"
                        maxlength="200"
                    >
                </div>

                ${isIndustryProposal ? `
                    <div class="section-grid section-grid-2">
                        <div class="form-group">
                            <label class="form-label" for="proposalIndustryFocus">Industry of Focus *</label>
                            <input id="proposalIndustryFocus" class="form-input" type="text" value="${this.escapeHtml(viewModel.industryFocus)}" maxlength="160">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="proposalCountryFocus">Country of Focus *</label>
                            <input id="proposalCountryFocus" class="form-input" type="text" value="${this.escapeHtml(viewModel.countryFocus)}" maxlength="160">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="proposalProposedActivity">Proposed Activity *</label>
                        <textarea id="proposalProposedActivity" class="form-input form-textarea" rows="4">${this.escapeHtml(viewModel.proposedActivity || viewModel.objective)}</textarea>
                    </div>
                ` : `
                    <fieldset class="form-group">
                        <legend class="form-label">Originator *</legend>
                        <div class="form-check-grid">
                            ${PROPOSAL_ORIGINATORS.map(renderOriginatorCheckbox).join('')}
                        </div>
                    </fieldset>
                    <div class="form-group">
                        <label class="form-label" for="proposalObjective">Objective *</label>
                        <textarea id="proposalObjective" class="form-input form-textarea" rows="3">${this.escapeHtml(viewModel.objective)}</textarea>
                    </div>
                `}

                <fieldset class="form-group" aria-describedby="proposalPartnersHint">
                    <legend class="form-label">Intended Partners *</legend>
                    <div class="form-check-grid">
                        <label class="form-check form-check-card" for="proposalPartnerBlue">
                            <input
                                id="proposalPartnerBlue" class="form-checkbox" type="checkbox"
                                data-proposal-partner="true" value="blue"
                                ${selectedRecipientTeams.includes('blue') ? 'checked' : ''}
                            >
                            <span class="form-check-label">Blue</span>
                        </label>
                        <label class="form-check form-check-card" for="proposalPartnerRed">
                            <input
                                id="proposalPartnerRed" class="form-checkbox" type="checkbox"
                                data-proposal-partner="true" value="red"
                                ${selectedRecipientTeams.includes('red') ? 'checked' : ''}
                            >
                            <span class="form-check-label">Red</span>
                        </label>
                    </div>
                    <p class="form-hint" id="proposalPartnersHint">Select one or both. Each recipient awaits a separate White Cell approval.</p>
                </fieldset>

                <fieldset class="form-group" aria-describedby="proposalFocusSectorsHint">
                    <legend class="form-label">Focus Sectors *</legend>
                    <div class="form-check-grid">
                        ${renderCheckboxOptions({
                            values: PROPOSAL_SECTORS,
                            selectedValues: selectedSectorValues,
                            dataAttribute: 'data-proposal-sector',
                            group: 'true',
                            idPrefix: 'proposalSectorOption'
                        })}
                    </div>
                    <p class="form-hint" id="proposalFocusSectorsHint">Select one or more focus sectors.</p>
                </fieldset>
                <div class="form-group" id="proposalFocusSectorOtherGroup" ${selectedSectorValues.includes('Other') ? '' : 'hidden'}>
                    <label class="form-label" for="proposalFocusSectorOther">Other Sector *</label>
                    <input id="proposalFocusSectorOther" class="form-input" type="text" value="${this.escapeHtml(customSectorValue)}" maxlength="120">
                </div>

                <fieldset class="form-group" aria-describedby="proposalSupplyChainHint">
                    <legend class="form-label">Does this proposal have a supply chain focus? *</legend>
                    <div class="form-check-grid">
                        <label class="form-check form-check-card" for="proposalSupplyChainYes">
                            <input id="proposalSupplyChainYes" class="form-radio" type="radio" name="proposalHasSupplyChainFocus" value="Yes" ${supplyChainFocusDecision === 'Yes' ? 'checked' : ''}>
                            <span class="form-check-label">Yes</span>
                        </label>
                        <label class="form-check form-check-card" for="proposalSupplyChainNo">
                            <input id="proposalSupplyChainNo" class="form-radio" type="radio" name="proposalHasSupplyChainFocus" value="No" ${supplyChainFocusDecision === 'No' ? 'checked' : ''}>
                            <span class="form-check-label">No</span>
                        </label>
                    </div>
                    <p class="form-hint" id="proposalSupplyChainHint">A Yes answer requires at least one supply-chain area.</p>
                </fieldset>

                <div id="proposalSupplyChainDetails" ${supplyChainFocusDecision === 'Yes' ? '' : 'hidden'}>
                    <fieldset class="form-group">
                        <legend class="form-label">Supply Chain Area *</legend>
                        <div class="form-check-grid">
                            ${renderCheckboxOptions({ values: BLUE_ACTION_SUPPLY_CHAIN_AREAS, selectedValues: viewModel.supplyChainAreas, dataAttribute: 'data-proposal-supply-chain-area', group: 'true', idPrefix: 'proposalSupplyChainArea' })}
                        </div>
                    </fieldset>
                </div>

                <div class="form-group">
                    <label class="form-label" for="proposalTimingConditions">Timing &amp; Conditions *</label>
                    <textarea
                        id="proposalTimingConditions"
                        class="form-input form-textarea"
                        rows="3"
                        placeholder="When does this take effect, and under what conditions?"
                    >${this.escapeHtml(viewModel.timingAndConditions)}</textarea>
                </div>

                <div class="form-group">
                    <label class="form-label" for="proposalExpectedOutcomes">Expected Outcome(s) &amp; Duration Assessment *</label>
                    <textarea
                        id="proposalExpectedOutcomes"
                        class="form-input form-textarea"
                        rows="4"
                        placeholder="Expected effect outcome(s) and short / long term duration assessment"
                    >${this.escapeHtml(viewModel.expectedOutcomes)}</textarea>
                </div>

                <div style="display: flex; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--color-border);">
                    <button type="button" class="btn btn-secondary" data-proposal-nav="cancel">Cancel</button>
                    <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; justify-content: flex-end;">
                        ${isEdit && viewModel.scribeHandoff === PROPOSAL_SCRIBE_HANDOFF.FORWARDED ? `
                            <button type="button" class="btn btn-primary" data-proposal-nav="saveChanges">Save Changes</button>
                        ` : `
                            <button type="button" class="btn btn-secondary" data-proposal-nav="saveDraft">Save Draft</button>
                            <button type="button" class="btn btn-primary" data-proposal-nav="forward">Forward to Facilitator</button>
                        `}
                    </div>
                </div>
            </form>
        `;

        return content;
    }

    bindGreenProposalModal(content, modal, {
        actionId = null,
        isEdit = false
    } = {}) {
        const form = content.querySelector(`#${this.teamId}ProposalForm`);
        if (!form) return;

        const updateSectorOtherField = () => {
            const group = form.querySelector('#proposalFocusSectorOtherGroup');
            const input = form.querySelector('#proposalFocusSectorOther');
            const showOther = Boolean(form.querySelector('#proposalSectorOptionOther')?.checked);
            if (group) group.hidden = !showOther;
            if (input && !showOther) input.value = '';
        };
        form.querySelectorAll('[data-proposal-sector="true"]').forEach((checkbox) => {
            checkbox.addEventListener('change', updateSectorOtherField);
        });

        const updateSupplyChainFields = () => {
            const decision = form.querySelector('[name="proposalHasSupplyChainFocus"]:checked')?.value || '';
            const details = form.querySelector('#proposalSupplyChainDetails');
            if (details) details.hidden = decision !== 'Yes';
            if (decision !== 'Yes') {
                form.querySelectorAll('[data-proposal-supply-chain-area="true"]').forEach((checkbox) => {
                    checkbox.checked = false;
                });
            }
        };
        form.querySelectorAll('[name="proposalHasSupplyChainFocus"]').forEach((radio) => {
            radio.addEventListener('change', updateSupplyChainFields);
        });

        content.querySelector('[data-proposal-nav="cancel"]')?.addEventListener('click', () => {
            modal?.close();
        });

        content.querySelector('[data-proposal-nav="saveDraft"]')?.addEventListener('click', () => {
            this.saveGreenProposalDraft(modal, form, {
                actionId,
                isEdit,
                scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.DRAFT
            }).catch((err) => {
                logger.error('Failed to save proposal draft:', err);
            });
        });

        content.querySelector('[data-proposal-nav="saveChanges"]')?.addEventListener('click', () => {
            this.saveGreenProposalDraft(modal, form, {
                actionId,
                isEdit: true,
                scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.FORWARDED
            }).catch((err) => {
                logger.error('Failed to update forwarded proposal:', err);
            });
        });

        content.querySelector('[data-proposal-nav="forward"]')?.addEventListener('click', () => {
            this.forwardGreenProposalToFacilitator(modal, form, {
                actionId,
                isEdit
            }).catch((err) => {
                logger.error('Failed to forward proposal to Facilitator:', err);
            });
        });

        form.querySelector('#proposalTitle')?.focus?.();
    }

    getGreenProposalData(form) {
        const originators = Array.from(
            form.querySelectorAll('[data-proposal-originator="true"]:checked')
        ).map((checkbox) => checkbox.value);
        const recipientTeams = getCheckedValues(form, '[data-proposal-partner="true"]');
        const selectedSectorValues = getCheckedValues(form, '[data-proposal-sector="true"]');
        const sectorOther = form.querySelector('#proposalFocusSectorOther')?.value?.trim() || '';
        const focusSectors = [
            ...selectedSectorValues.filter((value) => value !== 'Other'),
            ...(selectedSectorValues.includes('Other') && sectorOther ? [sectorOther] : [])
        ];
        const supplyChainFocusDecision = form.querySelector(
            '[name="proposalHasSupplyChainFocus"]:checked'
        )?.value || '';
        const industryFocus = form.querySelector('#proposalIndustryFocus')?.value?.trim() || '';
        const countryFocus = form.querySelector('#proposalCountryFocus')?.value?.trim() || '';
        const proposedActivity = form.querySelector('#proposalProposedActivity')?.value?.trim() || '';

        return {
            title: form.querySelector('#proposalTitle')?.value?.trim() || '',
            originators: this.teamId === 'industry' ? ['US Industry'] : originators,
            objective: form.querySelector('#proposalObjective')?.value?.trim() || proposedActivity,
            recipientTeams,
            intendedPartners: formatProposalRecipientTeams(recipientTeams, ''),
            selectedSectorValues,
            sectorOther,
            focusSector: focusSectors[0] || '',
            focusSectors,
            supplyChainFocusDecision,
            supplyChainAreas: supplyChainFocusDecision === 'Yes'
                ? getCheckedValues(form, '[data-proposal-supply-chain-area="true"]')
                : [],
            industryFocus,
            countryFocus,
            proposedActivity,
            timingAndConditions: form.querySelector('#proposalTimingConditions')?.value?.trim() || '',
            expectedOutcomes: form.querySelector('#proposalExpectedOutcomes')?.value?.trim() || ''
        };
    }

    validateGreenProposal(data) {
        if (!data.title) return 'Proposal Title is required.';
        if (this.teamId === 'industry') {
            if (!data.industryFocus) return 'Industry of Focus is required.';
            if (!data.countryFocus) return 'Country of Focus is required.';
            if (!data.proposedActivity) return 'Proposed Activity is required.';
        } else {
            if (!data.originators.length) return 'Select at least one Originator.';
            if (!data.objective) return 'Objective is required.';
        }
        if (!data.recipientTeams.length) return 'Select at least one intended partner.';
        if (!data.selectedSectorValues.length) return 'Select at least one focus sector.';
        if (data.selectedSectorValues.includes('Other') && !data.sectorOther) return 'Please enter the custom sector.';
        if (!data.supplyChainFocusDecision) return 'Select Yes or No for the supply chain focus question.';
        if (data.supplyChainFocusDecision === 'Yes' && !data.supplyChainAreas.length) {
            return 'Select at least one supply chain area.';
        }
        if (!data.timingAndConditions) return 'Timing & Conditions is required.';
        if (!data.expectedOutcomes) return 'Expected Outcome(s) is required.';
        return null;
    }

    buildGreenProposalPayload(data, { recipientTeam, scribeHandoff = PROPOSAL_SCRIBE_HANDOFF.DRAFT } = {}) {
        return {
            goal: data.title,
            mechanism: PROPOSAL_ACTION_MECHANISM,
            sector: data.focusSectors?.[0] || data.focusSector,
            exposure_type: null,
            priority: 'NORMAL',
            targets: [],
            expected_outcomes: data.expectedOutcomes,
            ally_contingencies: serializeProposalDetails({
                originators: data.originators,
                objective: data.objective,
                instruments: data.instruments,
                category: data.category,
                intendedPartners: data.intendedPartners,
                delivery: data.delivery,
                timingAndConditions: data.timingAndConditions,
                recipientTeams: data.recipientTeams?.length ? data.recipientTeams : [recipientTeam],
                recipientApprovalStates: data.recipientApprovalStates,
                focusSectors: data.focusSectors?.length ? data.focusSectors : [data.focusSector].filter(Boolean),
                supplyChainFocusDecision: data.supplyChainFocusDecision,
                supplyChainActionAngles: data.supplyChainActionAngles,
                supplyChainAreas: data.supplyChainAreas,
                industryFocus: data.industryFocus,
                countryFocus: data.countryFocus,
                proposedActivity: data.proposedActivity,
                revisionMetadata: data.revisionMetadata,
                scribeHandoff
            })
        };
    }

    buildForwardedProposalUpdate(action = {}) {
        const proposal = getProposalViewModel(action);
        if (!proposal.hasProposalDetails) {
            return {};
        }

        return {
            ally_contingencies: serializeProposalDetails({
                originators: proposal.originators,
                objective: proposal.objective,
                instruments: proposal.instruments,
                category: proposal.category,
                intendedPartners: proposal.intendedPartners,
                delivery: proposal.delivery,
                timingAndConditions: proposal.timingAndConditions,
                recipientTeams: proposal.recipientTeams,
                focusSectors: proposal.focusSectors,
                supplyChainFocusDecision: proposal.supplyChainFocusDecision,
                supplyChainActionAngles: proposal.supplyChainActionAngles,
                supplyChainAreas: proposal.supplyChainAreas,
                industryFocus: proposal.industryFocus,
                countryFocus: proposal.countryFocus,
                proposedActivity: proposal.proposedActivity,
                revisionMetadata: proposal.revisionMetadata,
                scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.FORWARDED
            })
        };
    }

    async saveGreenProposalDraft(modal, form, {
        recipientTeam = null,
        actionId = null,
        isEdit = false,
        scribeHandoff = PROPOSAL_SCRIBE_HANDOFF.DRAFT
    } = {}) {
        if (!this.requireWriteAccess()) return;

        const data = this.getGreenProposalData(form);
        const error = this.validateGreenProposal(data);
        if (error) {
            showToast({ message: error, type: 'error' });
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No session found', type: 'error' });
            return;
        }

        const existingAction = (isEdit && actionId)
            ? (actionsStore.getById(actionId) || this.actions.find((candidate) => candidate?.id === actionId) || null)
            : null;
        const existingHandoff = getProposalViewModel(existingAction || {}).scribeHandoff;
        const resolvedHandoff = existingHandoff === PROPOSAL_SCRIBE_HANDOFF.FORWARDED
            ? PROPOSAL_SCRIBE_HANDOFF.FORWARDED
            : scribeHandoff;
        const loader = showLoader({ message: isEdit ? 'Updating proposal draft...' : 'Saving proposal draft...' });

        try {
            const gameState = this.getCurrentGameState();
            const retainedData = existingAction
                ? { ...getProposalViewModel(existingAction), ...data }
                : data;
            const payload = this.buildGreenProposalPayload(retainedData, {
                recipientTeam,
                scribeHandoff: resolvedHandoff
            });

            let action;
            if (isEdit && actionId) {
                action = await database.updateDraftAction(actionId, payload);
                actionsStore.updateFromServer('UPDATE', action);
            } else {
                action = await database.createAction({
                    ...payload,
                    session_id: sessionId,
                    client_id: sessionStore.getClientId(),
                    team: this.teamId,
                    status: ENUMS.ACTION_STATUS.DRAFT,
                    move: gameState.move ?? 1,
                    phase: gameState.phase ?? 1
                });
                actionsStore.updateFromServer('INSERT', action);

                const timelineEvent = await database.createTimelineEvent({
                    session_id: sessionId,
                    type: 'ACTION_CREATED',
                    content: `Draft proposal created: ${action.goal || 'Untitled proposal'}`,
                    metadata: {
                        related_id: action.id,
                        role: this.role || this.getCurrentLeadRole(),
                        proposal: true,
                        recipient_team: data.recipientTeams[0] || null,
                        recipient_teams: data.recipientTeams
                    },
                    team: this.teamId,
                    move: action.move ?? gameState.move ?? 1,
                    phase: action.phase ?? gameState.phase ?? 1
                });
                timelineStore.updateFromServer('INSERT', timelineEvent);
            }

            showToast({
                message: isEdit ? 'Proposal draft updated' : 'Proposal draft saved',
                type: 'success'
            });
            modal?.close();
        } catch (err) {
            logger.error('Failed to save proposal draft:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to save proposal draft. Check the form and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    async forwardGreenProposalToFacilitator(modal, form, {
        recipientTeam = null,
        actionId = null,
        isEdit = false
    } = {}) {
        if (!this.requireWriteAccess()) return;

        const data = this.getGreenProposalData(form);
        const error = this.validateGreenProposal(data);
        if (error) {
            showToast({ message: error, type: 'error' });
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No session found', type: 'error' });
            return;
        }

        const recipientLabel = formatProposalRecipientTeams(data.recipientTeams);
        const existingAction = (isEdit && actionId)
            ? (actionsStore.getById(actionId) || this.actions.find((candidate) => candidate?.id === actionId) || null)
            : null;
        const loader = showLoader({ message: 'Forwarding proposal to Facilitator...' });

        try {
            const gameState = this.getCurrentGameState();
            const retainedData = existingAction
                ? { ...getProposalViewModel(existingAction), ...data }
                : data;
            const payload = this.buildGreenProposalPayload(retainedData, {
                recipientTeam,
                scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.FORWARDED
            });

            let action;
            if (isEdit && actionId) {
                action = await database.updateDraftAction(actionId, payload);
                actionsStore.updateFromServer('UPDATE', action);
            } else {
                action = await database.createAction({
                    ...payload,
                    session_id: sessionId,
                    client_id: sessionStore.getClientId(),
                    team: this.teamId,
                    status: ENUMS.ACTION_STATUS.DRAFT,
                    move: gameState.move ?? 1,
                    phase: gameState.phase ?? 1
                });
                actionsStore.updateFromServer('INSERT', action);

                const createdTimelineEvent = await database.createTimelineEvent({
                    session_id: sessionId,
                    type: 'ACTION_CREATED',
                    content: `Draft proposal created: ${action.goal || 'Untitled proposal'}`,
                    metadata: {
                        related_id: action.id,
                        role: this.role || this.getCurrentLeadRole(),
                        proposal: true,
                        recipient_team: data.recipientTeams[0] || null,
                        recipient_teams: data.recipientTeams
                    },
                    team: this.teamId,
                    move: action.move ?? gameState.move ?? 1,
                    phase: action.phase ?? gameState.phase ?? 1
                });
                timelineStore.updateFromServer('INSERT', createdTimelineEvent);
            }

            const forwardedTimelineEvent = await database.createTimelineEvent({
                session_id: action.session_id || sessionId,
                type: 'PROPOSAL_FORWARDED_TO_SCRIBE',
                content: `Proposal forwarded to Facilitator (intended recipient: ${recipientLabel}): ${action.goal || 'Untitled proposal'}`,
                metadata: {
                    related_id: action.id,
                    role: this.role || this.getCurrentLeadRole(),
                    proposal: true,
                    recipient_team: data.recipientTeams[0] || null,
                    recipient_teams: data.recipientTeams,
                    next_step: 'facilitator_submit_to_white_cell'
                },
                team: this.teamId,
                move: action.move ?? gameState.move ?? 1,
                phase: action.phase ?? gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', forwardedTimelineEvent);

            showToast({
                message: `Proposal forwarded to Facilitator. It will be projected, edited if needed, then sent to White Cell for ${recipientLabel}.`,
                type: 'success'
            });
            modal?.close();
        } catch (err) {
            logger.error('Failed to forward proposal:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to forward proposal. Check the form and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    /** @deprecated Prefer saveGreenProposalDraft / forwardGreenProposalToFacilitator */
    async submitGreenProposal(modal, form, { recipientTeam, actionId = null, isEdit = false } = {}) {
        await this.forwardGreenProposalToFacilitator(modal, form, { recipientTeam, actionId, isEdit });
    }

    showBlueActionWizard(action = null) {
        const isEdit = Boolean(action?.id);
        const sequenceContext = this.getBlueActionSequenceContext(action);
        const content = this.createBlueActionWizardContent(action || {}, {
            isEdit,
            sequenceContext
        });
        const modalRef = { current: null };

        modalRef.current = showModal({
            title: isEdit ? 'Edit Action' : 'Take Action',
            content,
            size: 'xl'
        });

        this.bindBlueActionWizard(content, modalRef.current, {
            actionId: action?.id || null,
            sequenceContext
        });
    }

    getBlueActionWizardPageTotal() {
        return this.teamId === 'red'
            ? RED_ACTION_WIZARD_PAGE_TOTAL
            : BLUE_ACTION_WIZARD_PAGE_TOTAL;
    }

    createBlueActionWizardContent(action = {}, { isEdit = false, sequenceContext = null } = {}) {
        const content = document.createElement('div');
        const blueAction = getBlueActionViewModel(action);
        const isRedTeamActionWizard = this.teamId === 'red';
        const wizardPageTotal = this.getBlueActionWizardPageTotal();
        const actionTitle = action.goal || action.title || '';
        const instrumentOptions = BLUE_ACTION_INSTRUMENTS;
        const builtInInstrumentValues = instrumentOptions.filter((value) => value !== 'Other');
        const actionInstruments = blueAction.instruments.length
            ? blueAction.instruments
            : (blueAction.instrumentOfPower ? [blueAction.instrumentOfPower] : []);
        const customInstrumentValue = actionInstruments.find(
            (value) => value && !builtInInstrumentValues.includes(value) && value !== 'Other'
        ) || '';
        const selectedInstrumentValues = [
            ...actionInstruments.filter((value) => builtInInstrumentValues.includes(value)),
            ...(customInstrumentValue || actionInstruments.includes('Other') ? ['Other'] : [])
        ];
        const selectedLeverValues = blueAction.levers.length
            ? blueAction.levers
            : (blueAction.lever ? [blueAction.lever] : []);
        const blueActionSectors = blueAction.sectors.length
            ? blueAction.sectors
            : (blueAction.sector ? [blueAction.sector] : []);
        const selectedSupplyChainFocusValues = blueAction.supplyChainFocuses.length
            ? blueAction.supplyChainFocuses
            : (blueAction.supplyChainFocus ? [blueAction.supplyChainFocus] : []);
        const selectedSupplyChainAreaValues = blueAction.supplyChainAreas.length
            ? blueAction.supplyChainAreas
            : selectedSupplyChainFocusValues.filter((value) => BLUE_ACTION_SUPPLY_CHAIN_AREAS.includes(value));
        const selectedSupplyChainActionAngleValues = blueAction.supplyChainActionAngles || [];
        const supplyChainFocusDecision = blueAction.supplyChainFocusDecision
            || (selectedSupplyChainFocusValues.length ? 'Yes' : '');
        const builtInSectorValues = BLUE_ACTION_SECTORS.filter((value) => value !== 'Other');
        const customSectorValue = blueActionSectors.find((value) => value && !builtInSectorValues.includes(value) && value !== 'Other') || '';
        const selectedSectorValues = [
            ...blueActionSectors.filter((value) => builtInSectorValues.includes(value)),
            ...(customSectorValue || blueActionSectors.includes('Other') ? ['Other'] : [])
        ];
        const focusCountryOptions = BLUE_ACTION_COUNTRIES;
        const builtInCountryValues = focusCountryOptions.filter((value) => value !== 'Other');
        const customCountryValue = blueAction.focusCountries.find((value) => value && !builtInCountryValues.includes(value) && value !== 'Other') || '';
        const selectedFocusCountryValues = [
            ...blueAction.focusCountries.filter((value) => builtInCountryValues.includes(value)),
            ...(customCountryValue || blueAction.focusCountries.includes('Other') ? ['Other'] : [])
        ];
        const selectedNotificationTeams = blueAction.notificationTeams || [];
        const implementationIsCustom = Boolean(blueAction.implementation)
            && !BLUE_ACTION_IMPLEMENTATIONS.includes(blueAction.implementation);
        const implementationValue = implementationIsCustom
            ? 'Other'
            : (blueAction.implementation || '');
        const sequenceLabel = sequenceContext?.label || formatActionSequenceLabel({
            teamLabel: this.teamLabel,
            move: action?.move || this.getCurrentGameState().move || 1,
            actionNumber: null
        });

        const renderOptions = (values, selectedValue = '', placeholder = 'Select an option') => `
            <option value="">${placeholder}</option>
            ${values.map((value) => `
                <option value="${value}" ${selectedValue === value ? 'selected' : ''}>${value}</option>
            `).join('')}
        `;
        const objectiveHintText = isRedTeamActionWizard
            ? 'What you intend this action to achieve in 6 months.'
            : 'What you intend this action to achieve.';
        const implementationFieldMarkup = isRedTeamActionWizard ? '' : `
                    <div class="form-group">
                        <label class="form-label" for="actionImplementation">Implementation *</label>
                        <select id="actionImplementation" class="form-select" data-blue-action-other-target="actionImplementationOther">
                            ${renderOptions(BLUE_ACTION_IMPLEMENTATIONS, implementationValue, 'Select implementation')}
                        </select>
                    </div>

                    <div
                        class="form-group"
                        id="actionImplementationOtherGroup"
                        ${implementationValue === 'Other' ? '' : 'hidden'}
                    >
                        <label class="form-label" for="actionImplementationOther">Other Implementation *</label>
                        <input
                            id="actionImplementationOther"
                            class="form-input"
                            type="text"
                            value="${this.escapeHtml(implementationIsCustom ? blueAction.implementation : '')}"
                            maxlength="120"
                        >
                    </div>

                    <div
                        class="form-group"
                        id="actionLegislativeOptionsGroup"
                        ${implementationValue === 'Legislative' ? '' : 'hidden'}
                    >
                        <span class="form-label" id="actionLegislativeOptionsLabel">Legislative Route</span>
                        <div
                            class="form-check-grid"
                            role="group"
                            aria-labelledby="actionLegislativeOptionsLabel"
                            aria-describedby="actionLegislativeOptionsHint"
                        >
                            ${renderCheckboxOptions({
                                values: BLUE_ACTION_LEGISLATIVE_OPTIONS,
                                selectedValues: blueAction.legislativeOptions,
                                dataAttribute: 'data-blue-action-checkbox',
                                group: 'legislative',
                                idPrefix: 'actionLegislativeOption'
                            })}
                        </div>
                        <p class="form-hint" id="actionLegislativeOptionsHint">Select all legislative routes that apply.</p>
                    </div>

        `;
        const focusCountriesAndOutcomesMarkup = `
                    <div class="form-group">
                        <span class="form-label" id="actionFocusCountriesLabel">Focus Countries *</span>
                        <div
                            class="form-check-grid"
                            role="group"
                            aria-labelledby="actionFocusCountriesLabel"
                            aria-describedby="actionFocusCountriesHint"
                        >
                            ${renderCheckboxOptions({
                                values: focusCountryOptions,
                                selectedValues: selectedFocusCountryValues,
                                dataAttribute: 'data-blue-action-checkbox',
                                group: 'country',
                                idPrefix: 'actionFocusCountry'
                            })}
                        </div>
                        <p class="form-hint" id="actionFocusCountriesHint">Select one or more countries.</p>
                    </div>

                    <div
                        class="form-group"
                        id="actionFocusCountryOtherGroup"
                        ${selectedFocusCountryValues.includes('Other') ? '' : 'hidden'}
                    >
                        <label class="form-label" for="actionFocusCountryOtherInput">Other Focus Country *</label>
                        <input
                            id="actionFocusCountryOtherInput"
                            class="form-input"
                            type="text"
                            value="${this.escapeHtml(customCountryValue)}"
                            maxlength="120"
                        >
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="actionExpectedOutcomes">Expected Outcomes *</label>
                        <textarea
                            id="actionExpectedOutcomes"
                            class="form-input form-textarea"
                            rows="5"
                            aria-describedby="actionExpectedOutcomesHint"
                        >${this.escapeHtml(action.expected_outcomes || '')}</textarea>
                        <p class="form-hint" id="actionExpectedOutcomesHint">What you anticipate will actually happen as a result, including effects you don't control.</p>
                    </div>

                    <fieldset class="form-group action-notification-fields">
                        <legend class="form-label">Teams to inform</legend>
                        <div
                            class="form-check-grid"
                            role="group"
                            aria-describedby="actionNotificationTeamsHint"
                        >
                            ${renderCheckboxOptions({
                                values: BLUE_ACTION_NOTIFICATION_TEAMS,
                                selectedValues: selectedNotificationTeams,
                                dataAttribute: 'data-blue-action-notification-team',
                                group: 'team',
                                idPrefix: 'actionNotificationTeam'
                            })}
                        </div>
                        <p class="form-hint" id="actionNotificationTeamsHint">Optionally notify Green, Industry, or both. This is separate from the Facilitator's Informed/Engaged decision.</p>

                        <label class="form-label" for="actionNotificationNote">Clarifying note</label>
                        <textarea
                            id="actionNotificationNote"
                            class="form-input form-textarea"
                            rows="3"
                            maxlength="1000"
                            aria-describedby="actionNotificationNoteHint"
                            ${selectedNotificationTeams.length ? 'required aria-required="true"' : 'aria-required="false"'}
                        >${this.escapeHtml(blueAction.notificationNote || '')}</textarea>
                        <p class="form-hint" id="actionNotificationNoteHint">Required when one or more teams are selected.</p>
                    </fieldset>
        `;

        content.innerHTML = `
            <form id="blueActionWizardForm" novalidate>
                <div style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4);">
                    <div>
                        <p class="text-xs text-gray-500" id="blueActionWizardStepLabel">Page 1 of ${wizardPageTotal}</p>
                        <h3 class="font-semibold" style="margin: 0;">${this.escapeHtml(this.teamLabel)} Action Builder</h3>
                        <p class="text-sm text-gray-500" id="blueActionWizardSequenceLabel" style="margin: var(--space-2) 0 0;">${this.escapeHtml(sequenceLabel)}</p>
                    </div>
                    <div aria-hidden="true" style="display: flex; gap: var(--space-2);">
                        ${Array.from({ length: wizardPageTotal }, (_, index) => `
                            <span
                                data-blue-action-step="${index}"
                                style="width: 28px; height: 4px; border-radius: 999px; background: ${index === 0 ? 'var(--color-primary-500)' : 'var(--color-gray-200)'};"
                            ></span>
                        `).join('')}
                    </div>
                </div>

                <section data-blue-action-page="0">
                    <div class="action-builder-field-stack">
                        <div class="form-group">
                            <label class="form-label" for="actionTitle">Action Title *</label>
                            <input
                                id="actionTitle"
                                class="form-input"
                                type="text"
                                value="${this.escapeHtml(actionTitle)}"
                                maxlength="200"
                            >
                        </div>
                        <div class="form-group">
                            <span class="form-label" id="actionInstrumentsLabel">Instrument of Power *</span>
                            <div
                                class="form-check-grid"
                                role="group"
                                aria-labelledby="actionInstrumentsLabel"
                                aria-describedby="actionInstrumentsHint"
                            >
                                ${renderCheckboxOptions({
                                    values: instrumentOptions,
                                    selectedValues: selectedInstrumentValues,
                                    dataAttribute: 'data-blue-action-checkbox',
                                    group: 'instrument',
                                    idPrefix: 'actionBlueInstrument'
                                })}
                            </div>
                            <p class="form-hint" id="actionInstrumentsHint">Select one or more instruments of power.</p>
                        </div>
                    </div>

                    <div
                        class="form-group"
                        id="actionInstrumentOtherGroup"
                        ${selectedInstrumentValues.includes('Other') ? '' : 'hidden'}
                    >
                        <label class="form-label" for="actionInstrumentOther">Other Instrument of Power *</label>
                        <input
                            id="actionInstrumentOther"
                            class="form-input"
                            type="text"
                            value="${this.escapeHtml(customInstrumentValue)}"
                            maxlength="120"
                        >
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="actionObjective">Objective *</label>
                        <textarea
                            id="actionObjective"
                            class="form-input form-textarea"
                            rows="4"
                            aria-describedby="actionObjectiveHint"
                        >${this.escapeHtml(blueAction.objective)}</textarea>
                        <p class="form-hint" id="actionObjectiveHint">${this.escapeHtml(objectiveHintText)}</p>
                    </div>
                </section>

                <section data-blue-action-page="1" hidden>
                    ${isRedTeamActionWizard ? `
                        <div class="form-group">
                            <span class="form-label" id="actionSupplyChainFocusLabel">Supply Chain Focus *</span>
                            <div
                                class="form-check-grid"
                                role="group"
                                aria-labelledby="actionSupplyChainFocusLabel"
                                aria-describedby="actionSupplyChainFocusHint"
                            >
                                ${renderCheckboxOptions({
                                    values: BLUE_ACTION_SUPPLY_CHAIN_FOCUS,
                                    selectedValues: selectedSupplyChainFocusValues,
                                    dataAttribute: 'data-blue-action-checkbox',
                                    group: 'supply-chain-focus',
                                    idPrefix: 'actionSupplyChainFocus'
                                })}
                            </div>
                            <p class="form-hint" id="actionSupplyChainFocusHint">Select one or more supply chain focus areas.</p>
                        </div>
                    ` : `
                        <div class="form-group">
                            <span class="form-label" id="actionHasSupplyChainFocusLabel">Does this action have a supply chain focus? *</span>
                            <div
                                class="form-check-grid"
                                role="radiogroup"
                                aria-labelledby="actionHasSupplyChainFocusLabel"
                                aria-describedby="actionHasSupplyChainFocusHint"
                                aria-required="true"
                            >
                                <label class="form-check form-check-card" for="actionHasSupplyChainFocusYes">
                                    <input
                                        id="actionHasSupplyChainFocusYes"
                                        class="form-radio"
                                        type="radio"
                                        name="actionHasSupplyChainFocus"
                                        value="Yes"
                                        aria-controls="actionSupplyChainFocusDetails"
                                        ${supplyChainFocusDecision === 'Yes' ? 'checked' : ''}
                                    >
                                    <span class="form-check-label">Yes</span>
                                </label>
                                <label class="form-check form-check-card" for="actionHasSupplyChainFocusNo">
                                    <input
                                        id="actionHasSupplyChainFocusNo"
                                        class="form-radio"
                                        type="radio"
                                        name="actionHasSupplyChainFocus"
                                        value="No"
                                        aria-controls="actionSupplyChainFocusDetails"
                                        ${supplyChainFocusDecision === 'No' ? 'checked' : ''}
                                    >
                                    <span class="form-check-label">No</span>
                                </label>
                            </div>
                            <p class="form-hint" id="actionHasSupplyChainFocusHint">Select Yes or No.</p>
                        </div>

                        <div
                            id="actionSupplyChainFocusDetails"
                            aria-live="polite"
                            ${supplyChainFocusDecision === 'Yes' ? '' : 'hidden'}
                        >
                            <div class="form-group">
                                <span class="form-label" id="actionSupplyChainAngleLabel">Action Angle *</span>
                                <div
                                    class="form-check-grid"
                                    role="group"
                                    aria-labelledby="actionSupplyChainAngleLabel"
                                    aria-describedby="actionSupplyChainAngleHint"
                                    aria-required="true"
                                >
                                    ${renderCheckboxOptions({
                                        values: BLUE_ACTION_SUPPLY_CHAIN_ANGLES,
                                        selectedValues: selectedSupplyChainActionAngleValues,
                                        dataAttribute: 'data-blue-action-checkbox',
                                        group: 'supply-chain-angle',
                                        idPrefix: 'actionSupplyChainAngle'
                                    })}
                                </div>
                                <p class="form-hint" id="actionSupplyChainAngleHint">Select one or more action angles.</p>
                            </div>

                            <div class="form-group">
                                <span class="form-label" id="actionSupplyChainAreaLabel">Supply Chain Area *</span>
                                <div
                                    class="form-check-grid"
                                    role="group"
                                    aria-labelledby="actionSupplyChainAreaLabel"
                                    aria-describedby="actionSupplyChainAreaHint"
                                    aria-required="true"
                                >
                                    ${renderCheckboxOptions({
                                        values: BLUE_ACTION_SUPPLY_CHAIN_AREAS,
                                        selectedValues: selectedSupplyChainAreaValues,
                                        dataAttribute: 'data-blue-action-checkbox',
                                        group: 'supply-chain-area',
                                        idPrefix: 'actionSupplyChainArea'
                                    })}
                                </div>
                                <p class="form-hint" id="actionSupplyChainAreaHint">Select one or more supply chain areas.</p>
                            </div>
                        </div>
                    `}

                    <div class="form-group">
                        <span class="form-label" id="actionSectorsLabel">Sectors *</span>
                        <div
                            class="form-check-grid"
                            role="group"
                            aria-labelledby="actionSectorsLabel"
                            aria-describedby="actionSectorsHint"
                        >
                            ${renderCheckboxOptions({
                                values: BLUE_ACTION_SECTORS,
                                selectedValues: selectedSectorValues,
                                dataAttribute: 'data-blue-action-checkbox',
                                group: 'sector',
                                idPrefix: 'actionBlueSector'
                            })}
                        </div>
                        <p class="form-hint" id="actionSectorsHint">Select one or more sectors.</p>
                    </div>

                    <div
                        class="form-group"
                        id="actionBlueSectorOtherGroup"
                        ${selectedSectorValues.includes('Other') ? '' : 'hidden'}
                    >
                        <label class="form-label" for="actionBlueSectorOtherInput">Other Sector *</label>
                        <input
                            id="actionBlueSectorOtherInput"
                            class="form-input"
                            type="text"
                            value="${this.escapeHtml(customSectorValue)}"
                            maxlength="120"
                        >
                    </div>

                    ${isRedTeamActionWizard ? focusCountriesAndOutcomesMarkup : ''}
                </section>

                ${isRedTeamActionWizard ? '' : `
                    <section data-blue-action-page="2" hidden>
                        ${implementationFieldMarkup}
                        ${focusCountriesAndOutcomesMarkup}
                    </section>
                `}

                <div style="display: flex; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--color-border);">
                    <button type="button" class="btn btn-secondary" data-blue-action-nav="cancel">Cancel</button>
                    <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; justify-content: flex-end;">
                        <button type="button" class="btn btn-secondary" data-blue-action-nav="back">Back</button>
                        <button type="button" class="btn btn-secondary" data-blue-action-nav="next">Next</button>
                        ${isEdit
                ? '<button type="button" class="btn btn-primary" data-blue-action-nav="saveChanges">Save Changes</button>'
                : `
                                <button type="button" class="btn btn-secondary" data-blue-action-nav="saveDraft">Save Draft</button>
                                <button type="button" class="btn btn-primary" data-blue-action-nav="submit">Forward to Facilitator</button>
                            `}
                    </div>
                </div>
            </form>
        `;

        const form = content.querySelector('#blueActionWizardForm');
        if (form) {
            form.dataset.blueActionLevers = JSON.stringify(selectedLeverValues);
            form.dataset.blueActionCoordinatedDecision = blueAction.coordinatedDecision || '';
            form.dataset.blueActionCoordinated = JSON.stringify(blueAction.coordinated || []);
            form.dataset.blueActionInformedEngagedDecision = blueAction.informedEngagedDecision || '';
            form.dataset.blueActionInformed = JSON.stringify(blueAction.informed || []);
            form.dataset.blueActionEnforcementTimeline = blueAction.enforcementTimeline || '';
        }

        return content;
    }

    bindBlueActionWizard(content, modal, { actionId = null, sequenceContext = null } = {}) {
        const form = content.querySelector('#blueActionWizardForm');
        const pages = Array.from(content.querySelectorAll('[data-blue-action-page]'));
        const wizardPageTotal = pages.length || this.getBlueActionWizardPageTotal();
        const stepLabel = content.querySelector('#blueActionWizardStepLabel');
        const sequenceLabel = content.querySelector('#blueActionWizardSequenceLabel');
        const progressSteps = Array.from(content.querySelectorAll('[data-blue-action-step]'));
        const backButton = content.querySelector('[data-blue-action-nav="back"]');
        const nextButton = content.querySelector('[data-blue-action-nav="next"]');
        const saveDraftButton = content.querySelector('[data-blue-action-nav="saveDraft"]');
        const submitButton = content.querySelector('[data-blue-action-nav="submit"]');
        const saveChangesButton = content.querySelector('[data-blue-action-nav="saveChanges"]');
        let currentPage = 0;

        const updateOtherField = (selectId, inputId, groupId) => {
            const select = form.querySelector(`#${selectId}`);
            const input = form.querySelector(`#${inputId}`);
            const group = form.querySelector(`#${groupId}`);
            const showOther = select?.value === 'Other';

            if (group) {
                group.hidden = !showOther;
            }

            if (input && !showOther) {
                input.value = '';
            }
        };

        const focusCurrentPage = () => {
            const firstField = pages[currentPage]?.querySelector('input, select, textarea, button');
            firstField?.focus?.();
        };

        const renderPage = () => {
            pages.forEach((page, index) => {
                page.hidden = index !== currentPage;
            });

            progressSteps.forEach((step, index) => {
                step.style.background = index <= currentPage
                    ? 'var(--color-primary-500)'
                    : 'var(--color-gray-200)';
            });

            if (stepLabel) {
                stepLabel.textContent = `Page ${currentPage + 1} of ${wizardPageTotal}`;
            }

            if (sequenceLabel && sequenceContext?.label) {
                sequenceLabel.textContent = sequenceContext.label;
            }

            if (backButton) {
                backButton.hidden = currentPage === 0;
            }

            if (nextButton) {
                nextButton.hidden = currentPage === wizardPageTotal - 1;
            }

            if (saveDraftButton) {
                saveDraftButton.hidden = false;
            }

            if (submitButton) {
                submitButton.hidden = currentPage !== wizardPageTotal - 1;
            }

            if (saveChangesButton) {
                saveChangesButton.hidden = false;
            }

            focusCurrentPage();
        };

        const updateSectorOtherField = () => {
            const input = form.querySelector('#actionBlueSectorOtherInput');
            const group = form.querySelector('#actionBlueSectorOtherGroup');
            const showOther = Boolean(form.querySelector('#actionBlueSectorOther')?.checked);

            if (group) {
                group.hidden = !showOther;
            }

            if (input && !showOther) {
                input.value = '';
            }
        };

        const updateFocusCountryOtherField = () => {
            const input = form.querySelector('#actionFocusCountryOtherInput');
            const group = form.querySelector('#actionFocusCountryOtherGroup');
            const showOther = Boolean(form.querySelector('#actionFocusCountryOther')?.checked);

            if (group) {
                group.hidden = !showOther;
            }

            if (input && !showOther) {
                input.value = '';
            }
        };

        const updateInstrumentOtherField = () => {
            const input = form.querySelector('#actionInstrumentOther');
            const group = form.querySelector('#actionInstrumentOtherGroup');
            const showOther = Boolean(form.querySelector('#actionBlueInstrumentOther')?.checked);

            if (group) {
                group.hidden = !showOther;
            }

            if (input && !showOther) {
                input.value = '';
            }
        };

        const updateSupplyChainFocusDetails = () => {
            const details = form.querySelector('#actionSupplyChainFocusDetails');
            const hasSupplyChainFocus = form.querySelector('#actionHasSupplyChainFocusYes')?.checked === true;

            if (details) {
                details.hidden = !hasSupplyChainFocus;
            }

            form.querySelectorAll('[name="actionHasSupplyChainFocus"]').forEach((radio) => {
                radio.setAttribute('aria-expanded', String(radio.value === 'Yes' && hasSupplyChainFocus));
            });

            if (!hasSupplyChainFocus) {
                form.querySelectorAll(
                    '[data-blue-action-checkbox="supply-chain-angle"], [data-blue-action-checkbox="supply-chain-area"]'
                ).forEach((checkbox) => {
                    checkbox.checked = false;
                });
            }
        };

        const updateImplementationDependentFields = () => {
            updateOtherField('actionImplementation', 'actionImplementationOther', 'actionImplementationOtherGroup');

            const legislativeGroup = form.querySelector('#actionLegislativeOptionsGroup');
            const showLegislativeOptions = form.querySelector('#actionImplementation')?.value === 'Legislative';

            if (legislativeGroup) {
                legislativeGroup.hidden = !showLegislativeOptions;
            }

            if (!showLegislativeOptions) {
                form.querySelectorAll('[data-blue-action-checkbox="legislative"]').forEach((checkbox) => {
                    checkbox.checked = false;
                });
            }
        };

        const updateActionNotificationRequirement = () => {
            const hasNotificationTeam = Boolean(
                form.querySelector('[data-blue-action-notification-team]:checked')
            );
            const note = form.querySelector('#actionNotificationNote');
            if (!note) return;

            note.required = hasNotificationTeam;
            note.setAttribute('aria-required', String(hasNotificationTeam));
        };

        form.querySelectorAll('[data-blue-action-checkbox="sector"]').forEach((checkbox) => {
            checkbox.addEventListener('change', updateSectorOtherField);
        });
        form.querySelectorAll('[data-blue-action-checkbox="country"]').forEach((checkbox) => {
            checkbox.addEventListener('change', updateFocusCountryOtherField);
        });
        form.querySelectorAll('[data-blue-action-checkbox="instrument"]').forEach((checkbox) => {
            checkbox.addEventListener('change', updateInstrumentOtherField);
        });
        form.querySelectorAll('[name="actionHasSupplyChainFocus"]').forEach((radio) => {
            radio.addEventListener('change', updateSupplyChainFocusDetails);
        });
        form.querySelector('#actionImplementation')?.addEventListener('change', () => {
            updateImplementationDependentFields();
        });
        form.querySelectorAll('[data-blue-action-notification-team]').forEach((checkbox) => {
            checkbox.addEventListener('change', updateActionNotificationRequirement);
        });
        content.querySelector('[data-blue-action-nav="cancel"]')?.addEventListener('click', () => {
            modal?.close();
        });

        backButton?.addEventListener('click', () => {
            currentPage = Math.max(0, currentPage - 1);
            renderPage();
        });

        nextButton?.addEventListener('click', () => {
            const wizardData = this.getBlueActionWizardData(form);
            const error = this.validateBlueActionWizardPage(wizardData, currentPage);
            if (error) {
                showToast({ message: error, type: 'error' });
                return;
            }

            currentPage = Math.min(wizardPageTotal - 1, currentPage + 1);
            renderPage();
        });

        saveDraftButton?.addEventListener('click', () => {
            this.saveBlueActionDraft(modal, form, currentPage).catch((error) => {
                logger.error('Failed to save team draft action:', error);
            });
        });

        submitButton?.addEventListener('click', () => {
            this.forwardBlueActionFromWizard(modal, form).catch((error) => {
                logger.error('Failed to forward team action from wizard:', error);
            });
        });

        saveChangesButton?.addEventListener('click', () => {
            this.saveBlueActionChanges(modal, form, actionId, currentPage).catch((error) => {
                logger.error('Failed to update team draft action:', error);
            });
        });

        updateSupplyChainFocusDetails();
        updateActionNotificationRequirement();
        renderPage();
    }

    getBlueActionWizardData(form) {
        const isRedTeamActionWizard = this.teamId === 'red';
        let storedLevers = [];
        let storedCoordinated = [];
        let storedInformed = [];
        try {
            const parsedLevers = JSON.parse(form?.dataset?.blueActionLevers || '[]');
            storedLevers = Array.isArray(parsedLevers) ? parsedLevers : [];
        } catch (_error) {
            storedLevers = [];
        }
        try {
            const parsedCoordinated = JSON.parse(form?.dataset?.blueActionCoordinated || '[]');
            storedCoordinated = Array.isArray(parsedCoordinated) ? parsedCoordinated : [];
        } catch (_error) {
            storedCoordinated = [];
        }
        try {
            const parsedInformed = JSON.parse(form?.dataset?.blueActionInformed || '[]');
            storedInformed = Array.isArray(parsedInformed) ? parsedInformed : [];
        } catch (_error) {
            storedInformed = [];
        }
        const selectedSectorValues = getCheckedValues(form, '[data-blue-action-checkbox="sector"]');
        let selectedInstrumentValues = getCheckedValues(form, '[data-blue-action-checkbox="instrument"]');
        const legacySupplyChainFocuses = getCheckedValues(form, '[data-blue-action-checkbox="supply-chain-focus"]');
        const selectedSupplyChainActionAngles = isRedTeamActionWizard
            ? []
            : getCheckedValues(form, '[data-blue-action-checkbox="supply-chain-angle"]');
        const selectedSupplyChainAreas = isRedTeamActionWizard
            ? legacySupplyChainFocuses
            : getCheckedValues(form, '[data-blue-action-checkbox="supply-chain-area"]');
        const selectedSupplyChainDecision = isRedTeamActionWizard
            ? (legacySupplyChainFocuses.length ? 'Yes' : '')
            : (
                form.querySelector('[name="actionHasSupplyChainFocus"]:checked')?.value
                || (selectedSupplyChainActionAngles.length || selectedSupplyChainAreas.length ? 'Yes' : '')
            );
        const supplyChainActionAngles = selectedSupplyChainDecision === 'Yes'
            ? selectedSupplyChainActionAngles
            : [];
        const supplyChainAreas = selectedSupplyChainDecision === 'Yes'
            ? selectedSupplyChainAreas
            : [];
        const supplyChainFocuses = isRedTeamActionWizard
            ? legacySupplyChainFocuses
            : supplyChainAreas;
        const selectedLegislativeOptions = getCheckedValues(form, '[data-blue-action-checkbox="legislative"]');
        const selectedFocusCountryValues = getCheckedValues(form, '[data-blue-action-checkbox="country"]');
        const notificationTeams = getCheckedValues(form, '[data-blue-action-notification-team]');
        const coordinatedControlsExist = Boolean(form?.querySelector?.('[data-blue-action-checkbox="coordinated"]'));
        const informedControlsExist = Boolean(form?.querySelector?.('[data-blue-action-checkbox="informed"]'));
        const coordinated = coordinatedControlsExist
            ? getCheckedValues(form, '[data-blue-action-checkbox="coordinated"]')
            : storedCoordinated;
        const informed = informedControlsExist
            ? getCheckedValues(form, '[data-blue-action-checkbox="informed"]')
            : storedInformed;
        const coordinatedDecision = form?.dataset?.blueActionCoordinatedDecision || '';
        const informedEngagedDecision = form?.dataset?.blueActionInformedEngagedDecision || '';

        const legacyInstrumentSelectValue = form.querySelector('#actionInstrument')?.value || '';
        if (!selectedInstrumentValues.length && legacyInstrumentSelectValue) {
            selectedInstrumentValues = [legacyInstrumentSelectValue];
        }
        const instrumentOther = form.querySelector('#actionInstrumentOther')?.value?.trim() || '';
        const implementationSelectValue = isRedTeamActionWizard
            ? ''
            : (form.querySelector('#actionImplementation')?.value || '');
        const sectorOther = form.querySelector('#actionBlueSectorOtherInput')?.value?.trim() || '';
        const focusCountryOther = form.querySelector('#actionFocusCountryOtherInput')?.value?.trim() || '';
        const implementationOther = isRedTeamActionWizard
            ? ''
            : (form.querySelector('#actionImplementationOther')?.value?.trim() || '');
        const sectors = [
            ...selectedSectorValues.filter((value) => value !== 'Other'),
            ...(selectedSectorValues.includes('Other') && sectorOther ? [sectorOther] : [])
        ];
        const focusCountries = [
            ...selectedFocusCountryValues.filter((value) => value !== 'Other'),
            ...(selectedFocusCountryValues.includes('Other') && focusCountryOther ? [focusCountryOther] : [])
        ];
        const instruments = [
            ...selectedInstrumentValues.filter((value) => value !== 'Other'),
            ...(selectedInstrumentValues.includes('Other') && instrumentOther ? [instrumentOther] : [])
        ];

        return {
            actionTitle: form.querySelector('#actionTitle')?.value?.trim() || '',
            objective: form.querySelector('#actionObjective')?.value?.trim() || '',
            instrumentOfPower: instruments[0] || '',
            instruments,
            selectedInstrumentValues,
            instrumentSelectValue: selectedInstrumentValues[0] || '',
            instrumentOther,
            lever: storedLevers[0] || '',
            levers: storedLevers,
            sector: sectors[0] || '',
            sectors,
            selectedSectorValues,
            sectorOther,
            selectedFocusCountryValues,
            focusCountryOther,
            supplyChainFocusDecision: selectedSupplyChainDecision,
            supplyChainActionAngles,
            supplyChainArea: supplyChainAreas[0] || '',
            supplyChainAreas,
            supplyChainFocus: supplyChainFocuses[0] || '',
            supplyChainFocuses,
            implementation: implementationSelectValue === 'Other' ? implementationOther : implementationSelectValue,
            implementationSelectValue,
            implementationOther,
            legislativeOptions: isRedTeamActionWizard
                ? []
                : (implementationSelectValue === 'Legislative' ? selectedLegislativeOptions : []),
            focusCountries,
            enforcementTimeline: form?.dataset?.blueActionEnforcementTimeline || '',
            expectedOutcomes: form.querySelector('#actionExpectedOutcomes')?.value?.trim() || '',
            notificationTeams,
            notificationNote: form.querySelector('#actionNotificationNote')?.value?.trim() || '',
            coordinatedDecision,
            coordinated,
            informedEngagedDecision,
            informed
        };
    }

    hasBlueActionDraftContent(wizardData) {
        return Boolean(
            wizardData.actionTitle
            || wizardData.objective
            || wizardData.instrumentOfPower
            || wizardData.instruments?.length
            || wizardData.selectedInstrumentValues?.length
            || wizardData.instrumentSelectValue
            || wizardData.instrumentOther
            || wizardData.sectors.length
            || wizardData.sectorOther
            || wizardData.focusCountryOther
            || wizardData.supplyChainFocusDecision
            || wizardData.supplyChainActionAngles?.length
            || wizardData.supplyChainAreas?.length
            || wizardData.supplyChainFocuses.length
            || wizardData.implementation
            || wizardData.implementationOther
            || wizardData.legislativeOptions.length
            || wizardData.focusCountries.length
            || wizardData.expectedOutcomes
            || wizardData.notificationTeams?.length
            || wizardData.notificationNote
        );
    }

    getBlueActionDraftSaveValidationError(wizardData, currentPage = this.getBlueActionWizardPageTotal() - 1) {
        if (!this.hasBlueActionDraftContent(wizardData)) {
            return 'Add at least one action detail before saving a draft.';
        }

        const normalizedCurrentPage = Math.max(
            0,
            Math.min(currentPage, this.getBlueActionWizardPageTotal() - 1)
        );

        if (normalizedCurrentPage <= 0) {
            return null;
        }

        // Mid-wizard saves should only enforce pages the facilitator has already completed.
        const lastCompletedPage = normalizedCurrentPage - 1;

        for (let pageIndex = 0; pageIndex <= lastCompletedPage; pageIndex += 1) {
            const error = this.validateBlueActionWizardPage(wizardData, pageIndex);
            if (error) {
                return error;
            }
        }

        return null;
    }

    validateBlueActionWizardPage(wizardData, pageIndex) {
        const isRedTeamActionWizard = this.teamId === 'red';
        if (pageIndex === 0) {
            if (!wizardData.actionTitle) return 'Action Title is required.';
            if (!wizardData.objective) return 'Objective is required.';
            const selectedInstrumentValues = wizardData.selectedInstrumentValues?.length
                ? wizardData.selectedInstrumentValues
                : (wizardData.instrumentSelectValue ? [wizardData.instrumentSelectValue] : []);
            if (!selectedInstrumentValues.length) return 'Select at least one instrument of power.';
            if (selectedInstrumentValues.includes('Other') && !wizardData.instrumentOther) {
                return 'Please enter the custom instrument of power.';
            }
        }

        if (pageIndex === 1) {
            if (isRedTeamActionWizard) {
                if (!wizardData.supplyChainFocuses.length) return 'Select at least one supply chain focus.';
            } else {
                if (!wizardData.supplyChainFocusDecision) {
                    return 'Select Yes or No for the supply chain focus question.';
                }
                if (wizardData.supplyChainFocusDecision === 'Yes') {
                    if (!wizardData.supplyChainActionAngles?.length) return 'Select at least one action angle.';
                    if (!wizardData.supplyChainAreas?.length) return 'Select at least one supply chain area.';
                }
            }
            if (!wizardData.selectedSectorValues.length) return 'Select at least one sector.';
            if (wizardData.selectedSectorValues.includes('Other') && !wizardData.sectorOther) {
                return 'Please enter the custom sector.';
            }
        }

        if ((isRedTeamActionWizard && pageIndex === 1) || (!isRedTeamActionWizard && pageIndex === 2)) {
            if (!wizardData.selectedFocusCountryValues.length) return 'Select at least one focus country.';
            if (wizardData.selectedFocusCountryValues.includes('Other') && !wizardData.focusCountryOther) {
                return 'Please enter the custom focus country.';
            }
            if (!isRedTeamActionWizard) {
                if (!wizardData.implementationSelectValue) return 'Implementation is required.';
                if (wizardData.implementationSelectValue === 'Other' && !wizardData.implementationOther) {
                    return 'Please enter the custom implementation.';
                }
            }
            if (!wizardData.expectedOutcomes) return 'Expected Outcomes is required.';
            if (wizardData.notificationTeams?.length && !wizardData.notificationNote) {
                return 'Add a clarifying note for the selected teams to inform.';
            }
        }

        return null;
    }

    buildBlueActionPayload(wizardData, {
        scribeHandoff = BLUE_ACTION_SCRIBE_HANDOFF.DRAFT
    } = {}) {
        return {
            goal: wizardData.actionTitle,
            mechanism: wizardData.instrumentOfPower,
            sector: wizardData.sector,
            exposure_type: wizardData.supplyChainArea || wizardData.supplyChainFocus || null,
            priority: 'NORMAL',
            targets: wizardData.focusCountries,
            expected_outcomes: wizardData.expectedOutcomes,
            ally_contingencies: serializeBlueActionDetails({
                objective: wizardData.objective,
                instruments: wizardData.instruments,
                levers: wizardData.levers,
                sectors: wizardData.sectors,
                supplyChainFocusDecision: wizardData.supplyChainFocusDecision,
                supplyChainActionAngles: wizardData.supplyChainActionAngles,
                supplyChainAreas: wizardData.supplyChainAreas,
                supplyChainFocuses: wizardData.supplyChainFocuses,
                implementation: wizardData.implementation,
                legislativeOptions: wizardData.legislativeOptions,
                enforcementTimeline: wizardData.enforcementTimeline,
                scribeHandoff,
                coordinatedDecision: wizardData.coordinatedDecision,
                coordinated: wizardData.coordinated,
                informedEngagedDecision: wizardData.informedEngagedDecision,
                informed: wizardData.informed,
                notificationTeams: wizardData.notificationTeams,
                notificationNote: wizardData.notificationNote
            })
        };
    }

    buildForwardedBlueActionUpdate(action = {}) {
        const actionViewModel = getBlueActionViewModel(action);
        if (!actionViewModel.hasBlueActionDetails) {
            return {};
        }

        return {
            ally_contingencies: serializeBlueActionDetails({
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
                coordinatedDecision: actionViewModel.coordinatedDecision,
                coordinated: actionViewModel.coordinated,
                informedEngagedDecision: actionViewModel.informedEngagedDecision,
                informed: actionViewModel.informed,
                notificationTeams: actionViewModel.notificationTeams,
                notificationNote: actionViewModel.notificationNote
            })
        };
    }

    async saveBlueActionDraft(modal, form, currentPage = this.getBlueActionWizardPageTotal() - 1) {
        if (!this.requireWriteAccess()) return;

        const wizardData = this.getBlueActionWizardData(form);
        const draftSaveError = this.getBlueActionDraftSaveValidationError(wizardData, currentPage);
        const sessionId = sessionStore.getSessionId();

        if (draftSaveError) {
            showToast({ message: draftSaveError, type: 'error' });
            return;
        }

        if (!sessionId) {
            showToast({ message: 'No session found', type: 'error' });
            return;
        }

        const loader = showLoader({ message: 'Saving draft...' });

        try {
            const gameState = this.getCurrentGameState();
            const action = await database.createAction({
                ...this.buildBlueActionPayload(wizardData),
                session_id: sessionId,
                client_id: sessionStore.getClientId(),
                team: this.teamId,
                status: ENUMS.ACTION_STATUS.DRAFT,
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            actionsStore.updateFromServer('INSERT', action);

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'ACTION_CREATED',
                content: `Draft action created: ${action.goal || 'Untitled action'}`,
                metadata: {
                    related_id: action.id,
                    role: this.role || this.getCurrentLeadRole()
                },
                team: this.teamId,
                move: action.move ?? 1,
                phase: action.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: 'Draft action saved', type: 'success' });
            modal?.close();
        } catch (err) {
            logger.error('Failed to create team draft action:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to save draft action. Check the form and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    async saveBlueActionChanges(modal, form, actionId, currentPage = this.getBlueActionWizardPageTotal() - 1) {
        if (!this.requireWriteAccess()) return;

        const wizardData = this.getBlueActionWizardData(form);
        const draftSaveError = this.getBlueActionDraftSaveValidationError(wizardData, currentPage);

        if (draftSaveError) {
            showToast({ message: draftSaveError, type: 'error' });
            return;
        }

        const loader = showLoader({ message: 'Updating draft...' });

        try {
            const existingAction = this.actions.find((candidate) => candidate?.id === actionId)
                || actionsStore.getById(actionId)
                || {};
            const existingActionViewModel = getBlueActionViewModel(existingAction);
            const updatedAction = await database.updateDraftAction(actionId, this.buildBlueActionPayload(wizardData, {
                scribeHandoff: existingActionViewModel.scribeHandoff === BLUE_ACTION_SCRIBE_HANDOFF.FORWARDED
                    ? BLUE_ACTION_SCRIBE_HANDOFF.FORWARDED
                    : BLUE_ACTION_SCRIBE_HANDOFF.DRAFT
            }));
            actionsStore.updateFromServer('UPDATE', updatedAction);
            showToast({ message: 'Draft action updated', type: 'success' });
            modal?.close();
        } catch (err) {
            logger.error('Failed to update team draft action:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to update draft action. Refresh the draft and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    async forwardBlueActionFromWizard(modal, form) {
        if (!this.requireWriteAccess()) return;

        const wizardData = this.getBlueActionWizardData(form);
        const validationError = Array.from(
            { length: this.getBlueActionWizardPageTotal() },
            (_, pageIndex) => this.validateBlueActionWizardPage(wizardData, pageIndex)
        ).find(Boolean);
        const sessionId = sessionStore.getSessionId();
        const sequenceContext = this.getBlueActionSequenceContext();

        if (validationError) {
            showToast({ message: validationError, type: 'error' });
            return;
        }

        if (!sessionId) {
            showToast({ message: 'No session found', type: 'error' });
            return;
        }

        const confirmed = await confirmModal({
            title: 'Confirm Action',
            message: `Forward ${sequenceContext.label} to the Facilitator? The Facilitator will project it and submit the completed action to White Cell.`,
            confirmLabel: 'Forward',
            variant: 'primary'
        });

        if (!confirmed) {
            return;
        }

        const loader = showLoader({ message: 'Forwarding action to Facilitator...' });

        try {
            const gameState = this.getCurrentGameState();
            const draftAction = await database.createAction({
                ...this.buildBlueActionPayload(wizardData, {
                    scribeHandoff: BLUE_ACTION_SCRIBE_HANDOFF.FORWARDED
                }),
                session_id: sessionId,
                client_id: sessionStore.getClientId(),
                team: this.teamId,
                status: ENUMS.ACTION_STATUS.DRAFT,
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            actionsStore.updateFromServer('INSERT', draftAction);

            const draftTimelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'ACTION_CREATED',
                content: `Draft action created: ${draftAction.goal || 'Untitled action'}`,
                metadata: {
                    related_id: draftAction.id,
                    role: this.role || this.getCurrentLeadRole()
                },
                team: this.teamId,
                move: draftAction.move ?? 1,
                phase: draftAction.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', draftTimelineEvent);

            const forwardedTimelineEvent = await database.createTimelineEvent({
                session_id: draftAction.session_id,
                type: 'ACTION_FORWARDED_TO_SCRIBE',
                content: `Action forwarded to Facilitator: ${draftAction.goal || 'Untitled action'}`,
                metadata: {
                    related_id: draftAction.id,
                    role: this.role || this.getCurrentLeadRole(),
                    next_step: 'scribe_submit_to_white_cell',
                    semantic_next_step: 'facilitator_submit_to_white_cell'
                },
                team: this.teamId,
                move: draftAction.move ?? 1,
                phase: draftAction.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', forwardedTimelineEvent);

            showToast({ message: 'Action forwarded to Facilitator', type: 'success' });
            modal?.close();
        } catch (err) {
            logger.error('Failed to forward team action:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to forward action. Refresh the draft and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    createActionFormContent(action = {}) {
        const content = document.createElement('div');
        const selectedTargets = Array.isArray(action.targets)
            ? action.targets
            : (action.target ? [action.target] : []);

        const mechanismOptions = ENUMS.MECHANISMS
            .map((value) => `<option value="${value}" ${action.mechanism === value ? 'selected' : ''}>${value}</option>`)
            .join('');

        const sectorOptions = ENUMS.SECTORS
            .map((value) => `<option value="${value}" ${action.sector === value ? 'selected' : ''}>${value}</option>`)
            .join('');

        const exposureOptions = ENUMS.EXPOSURE_TYPES
            .map((value) => `<option value="${value}" ${action.exposure_type === value ? 'selected' : ''}>${value}</option>`)
            .join('');

        const priorityOptions = ENUMS.PRIORITY
            .map((value) => `<option value="${value}" ${(action.priority || 'NORMAL') === value ? 'selected' : ''}>${value}</option>`)
            .join('');

        content.innerHTML = `
            <form id="actionForm">
                <div class="form-group">
                    <label class="form-label" for="actionGoal">Goal *</label>
                    <textarea id="actionGoal" class="form-input form-textarea" rows="3" required>${this.escapeHtml(action.goal || action.title || '')}</textarea>
                </div>

                <div class="section-grid section-grid-2">
                    <div class="form-group">
                        <label class="form-label" for="actionMechanism">Mechanism *</label>
                        <select id="actionMechanism" class="form-select" required>
                            <option value="">Select mechanism</option>
                            ${mechanismOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="actionSector">Sector *</label>
                        <select id="actionSector" class="form-select" required>
                            <option value="">Select sector</option>
                            ${sectorOptions}
                        </select>
                    </div>
                </div>

                <div class="section-grid section-grid-2">
                    <div class="form-group">
                        <label class="form-label" for="actionExposureType">Exposure Type</label>
                        <select id="actionExposureType" class="form-select">
                            <option value="">Select exposure type</option>
                            ${exposureOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="actionPriority">Priority</label>
                        <select id="actionPriority" class="form-select">
                            ${priorityOptions}
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <span class="form-label" id="actionTargetsLabel">Targets *</span>
                    <div
                        class="form-check-grid"
                        role="group"
                        aria-labelledby="actionTargetsLabel"
                        aria-describedby="actionTargetsHint"
                    >
                        ${renderCheckboxOptions({
                            values: ENUMS.TARGETS,
                            selectedValues: selectedTargets,
                            dataAttribute: 'data-action-checkbox',
                            group: 'target',
                            idPrefix: 'actionTarget'
                        })}
                    </div>
                    <p class="form-hint" id="actionTargetsHint">Select one or more targets.</p>
                </div>

                <div class="form-group">
                    <label class="form-label" for="actionExpectedOutcomes">Expected Outcomes *</label>
                    <textarea id="actionExpectedOutcomes" class="form-input form-textarea" rows="4" required>${this.escapeHtml(action.expected_outcomes || action.description || '')}</textarea>
                </div>

                <div class="form-group">
                    <label class="form-label" for="actionAllyContingencies">Ally Contingencies *</label>
                    <textarea id="actionAllyContingencies" class="form-input form-textarea" rows="3" required>${this.escapeHtml(action.ally_contingencies || '')}</textarea>
                </div>
            </form>
        `;

        return content;
    }

    getActionFormData() {
        const formData = {
            goal: document.getElementById('actionGoal')?.value?.trim(),
            mechanism: document.getElementById('actionMechanism')?.value,
            sector: document.getElementById('actionSector')?.value,
            exposure_type: document.getElementById('actionExposureType')?.value || null,
            priority: document.getElementById('actionPriority')?.value || 'NORMAL',
            targets: getCheckedValues(document, '[data-action-checkbox="target"]'),
            expected_outcomes: document.getElementById('actionExpectedOutcomes')?.value?.trim(),
            ally_contingencies: document.getElementById('actionAllyContingencies')?.value?.trim()
        };

        const result = validateAction(formData);
        if (!result.valid) {
            showToast({ message: result.errors[0] || 'Action validation failed', type: 'error' });
            return null;
        }

        return formData;
    }

    async handleCreateAction(modal) {
        if (!this.requireWriteAccess()) return;

        const formData = this.getActionFormData();
        if (!formData) return;

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No session found', type: 'error' });
            return;
        }

        const loader = showLoader({ message: 'Saving draft...' });

        try {
            const gameState = this.getCurrentGameState();
            const action = await database.createAction({
                ...formData,
                session_id: sessionId,
                client_id: sessionStore.getClientId(),
                team: this.teamId,
                status: ENUMS.ACTION_STATUS.DRAFT,
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            actionsStore.updateFromServer('INSERT', action);

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'ACTION_CREATED',
                content: `Draft action created: ${action.goal || 'Untitled action'}`,
                metadata: {
                    related_id: action.id,
                    role: this.role || this.getCurrentLeadRole()
                },
                team: this.teamId,
                move: action.move ?? 1,
                phase: action.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: 'Draft action saved', type: 'success' });
            modal?.close();
        } catch (err) {
            logger.error('Failed to create action:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to save draft action. Check the form and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    async handleUpdateAction(modal, actionId) {
        if (!this.requireWriteAccess()) return;

        const formData = this.getActionFormData();
        if (!formData) return;

        const loader = showLoader({ message: 'Updating draft...' });

        try {
            const updatedAction = await database.updateDraftAction(actionId, formData);
            actionsStore.updateFromServer('UPDATE', updatedAction);
            showToast({ message: 'Draft action updated', type: 'success' });
            modal?.close();
        } catch (err) {
            logger.error('Failed to update action:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to update draft action. Refresh the draft and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    async confirmForwardAction(action) {
        if (!this.requireWriteAccess()) return;
        if (!canSubmitAction(action)) {
            showToast({ message: 'Only draft actions can be forwarded to the Facilitator.', type: 'error' });
            return;
        }

        const isProposal = this.isGreenTeamProposalEnabled(action);
        const sequenceLabel = isProposal
            ? (getProposalViewModel(action).title || 'this proposal')
            : (this.isTeamActionWizardEnabled(action)
                ? this.getBlueActionSequenceContext(action).label
                : 'this draft');

        const confirmed = await confirmModal({
            title: isProposal ? 'Forward Proposal to Facilitator' : 'Forward Action to Facilitator',
            message: isProposal
                ? `Forward ${sequenceLabel} to the Facilitator? The Facilitator will project it, edit if needed, and submit it to White Cell.`
                : `Forward ${sequenceLabel} to the Facilitator? The Facilitator will project it and submit the completed action to White Cell.`,
            confirmLabel: 'Forward',
            variant: 'primary'
        });

        if (!confirmed) return;
        await this.forwardActionToScribe(action.id);
    }

    async forwardActionToScribe(actionId) {
        if (!this.requireWriteAccess()) return;
        const existingAction = actionsStore.getById(actionId)
            || this.actions.find((candidate) => candidate?.id === actionId);
        const isProposal = this.isGreenTeamProposalEnabled(existingAction);
        const loader = showLoader({
            message: isProposal
                ? 'Forwarding proposal to Facilitator...'
                : 'Forwarding action to Facilitator...'
        });

        try {
            const updatePayload = isProposal
                ? this.buildForwardedProposalUpdate(existingAction || {})
                : (existingAction ? this.buildForwardedBlueActionUpdate(existingAction) : {});
            const action = await database.updateDraftAction(actionId, updatePayload);
            actionsStore.updateFromServer('UPDATE', action);

            const timelineEvent = await database.createTimelineEvent({
                session_id: action.session_id,
                type: isProposal ? 'PROPOSAL_FORWARDED_TO_SCRIBE' : 'ACTION_FORWARDED_TO_SCRIBE',
                content: isProposal
                    ? `Proposal forwarded to Facilitator: ${action.goal || 'Untitled proposal'}`
                    : `Action forwarded to Facilitator: ${action.goal || 'Untitled action'}`,
                metadata: {
                    related_id: action.id,
                    role: this.role || this.getCurrentLeadRole(),
                    next_step: 'scribe_submit_to_white_cell',
                    semantic_next_step: 'facilitator_submit_to_white_cell',
                    ...(isProposal ? { proposal: true } : {})
                },
                team: this.teamId,
                move: action.move ?? 1,
                phase: action.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({
                message: isProposal ? 'Proposal forwarded to Facilitator' : 'Action forwarded to Facilitator',
                type: 'success'
            });
        } catch (err) {
            logger.error(isProposal ? 'Failed to forward proposal:' : 'Failed to forward action:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: isProposal
                        ? 'Failed to forward proposal. Refresh the draft and try again.'
                        : 'Failed to forward action. Refresh the draft and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    async confirmDeleteAction(action) {
        if (!this.requireWriteAccess()) return;
        const isProposal = this.isGreenTeamProposalEnabled(action);
        if (!canDeleteAction(action)) {
            showToast({
                message: isProposal ? 'Only draft proposals can be deleted.' : 'Only draft actions can be deleted.',
                type: 'error'
            });
            return;
        }

        const confirmed = await confirmModal({
            title: isProposal ? 'Delete Draft Proposal' : 'Delete Draft Action',
            message: isProposal
                ? 'Delete this draft proposal? This cannot be undone.'
                : 'Delete this draft action? This cannot be undone.',
            confirmLabel: 'Delete',
            variant: 'danger'
        });

        if (!confirmed) return;
        await this.deleteAction(action.id, { artifactLabel: isProposal ? 'proposal' : 'action' });
    }

    async deleteAction(actionId, { artifactLabel = 'action' } = {}) {
        if (!this.requireWriteAccess()) return;
        const loader = showLoader({ message: 'Deleting draft...' });
        const isProposal = artifactLabel === 'proposal';

        try {
            await database.deleteDraftAction(actionId);
            actionsStore.updateFromServer('DELETE', { id: actionId });
            showToast({ message: `Draft ${artifactLabel} deleted`, type: 'success' });
        } catch (err) {
            logger.error(`Failed to delete ${artifactLabel}:`, err);
            showToast({
                message: getUserMessage(err, {
                    fallback: isProposal
                        ? 'Failed to delete draft proposal. Refresh the proposal list and try again.'
                        : 'Failed to delete draft action. Refresh the action list and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    renderRfiList() {
        const rfiList = document.getElementById('rfiList');
        if (!rfiList) return;

        if (this.rfis.length === 0) {
            rfiList.innerHTML = `
                <div class="empty-state">
                    <h3 class="empty-state-title">No RFIs</h3>
                    <p class="empty-state-message">
                        ${this.isReadOnly
                            ? `No ${this.teamLabel} RFIs have been submitted yet.`
                            : 'Submit a request for information to White Cell when the team needs clarification.'}
                    </p>
                </div>
            `;
            return;
        }

        rfiList.innerHTML = this.renderTabbedRfiList();
    }

    getRfiCategoryGroups(rfis = []) {
        const baseGroups = ENUMS.RFI_CATEGORIES.map((category) => ({
            key: getRfiCategoryKey(category),
            title: category,
            description: `RFIs tagged ${category}.`,
            items: []
        }));
        const groupsByKey = new Map(baseGroups.map((group) => [group.key, group]));
        const customGroupsByKey = new Map();
        const uncategorizedItems = [];

        rfis.forEach((rfi) => {
            const rawCategories = Array.isArray(rfi.categories)
                ? rfi.categories
                : (rfi.category ? [rfi.category] : []);
            const categories = [...new Set(
                rawCategories
                    .map((category) => String(category || '').trim())
                    .filter(Boolean)
            )];

            if (categories.length === 0) {
                uncategorizedItems.push(rfi);
                return;
            }

            categories.forEach((category) => {
                const key = getRfiCategoryKey(category);
                const existingGroup = groupsByKey.get(key) || customGroupsByKey.get(key);
                if (existingGroup) {
                    existingGroup.items.push(rfi);
                    return;
                }

                customGroupsByKey.set(key, {
                    key,
                    title: category,
                    description: `RFIs tagged ${category}.`,
                    items: [rfi]
                });
            });
        });

        const customGroups = [...customGroupsByKey.values()]
            .sort((left, right) => left.title.localeCompare(right.title));
        const groups = [...baseGroups, ...customGroups];

        if (uncategorizedItems.length) {
            groups.push({
                key: 'uncategorized',
                title: 'Uncategorized',
                description: 'Legacy RFIs without category metadata.',
                items: uncategorizedItems
            });
        }

        return groups.map((group) => ({
            ...group,
            items: [...group.items].sort((left, right) => getSortableEventTime(right) - getSortableEventTime(left))
        }));
    }

    renderRfiCard(rfi = {}) {
        const queryText = rfi.query || rfi.question || '';
        const categories = Array.isArray(rfi.categories)
            ? rfi.categories
            : (rfi.category ? [rfi.category] : []);

        return `
            <article class="card card-bordered" role="listitem" style="padding: var(--space-4);">
                <div class="card-header" style="display: flex; justify-content: space-between; gap: var(--space-2);">
                    <span class="text-sm font-semibold">${this.escapeHtml(queryText)}</span>
                    <div style="display: flex; gap: var(--space-2);">
                        ${createArtifactLifecycleBadge(rfi, { size: 'sm' }).outerHTML}
                    </div>
                </div>
                ${categories.length ? `
                    <p class="text-xs text-gray-500 mt-2"><strong>Categories:</strong> ${this.escapeHtml(categories.join(', '))}</p>
                ` : ''}
                ${rfi.response ? `
                    <div class="mt-3 p-3 bg-gray-50 rounded">
                        <strong>Response:</strong> ${this.escapeHtml(rfi.response)}
                    </div>
                ` : ''}
                <p class="text-xs text-gray-400 mt-2">${formatRelativeTime(rfi.created_at)}</p>
            </article>
        `;
    }

    renderRfiCategoryGroup(group = {}) {
        const headingId = `rfi-category-${group.key}-heading`;
        const itemCount = group.items?.length || 0;
        const visibleRfis = (group.items || []).slice(0, RFI_RENDER_LIMIT);
        const hiddenCount = Math.max(0, itemCount - visibleRfis.length);
        const body = itemCount
            ? `<div class="card-list" role="list" aria-labelledby="${headingId}">
                    ${visibleRfis.map((rfi) => this.renderRfiCard(rfi)).join('')}
               </div>`
            : `<p class="text-sm text-gray-500" style="margin: 0;">No RFIs in this category.</p>`;

        return `
            <section
                data-rfi-category-group="${group.key}"
                aria-labelledby="${headingId}"
                style="display: grid; gap: var(--space-3);"
            >
                <div style="padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border-light);">
                    <h3
                        id="${headingId}"
                        class="font-semibold text-sm"
                        style="margin: 0;"
                    >${this.escapeHtml(`${group.title} (${itemCount})`)}</h3>
                    <p class="text-xs text-gray-500" style="margin: var(--space-1) 0 0;">
                        ${this.escapeHtml(group.description)}
                    </p>
                </div>
                ${body}
                ${hiddenCount ? `<p class="text-xs text-gray-500" style="margin: var(--space-2) 0 0;">Showing the first ${RFI_RENDER_LIMIT} of ${itemCount} RFIs in this category.</p>` : ''}
            </section>
        `;
    }

    renderTabbedRfiList() {
        const groups = this.getRfiCategoryGroups(this.rfis);
        const currentActiveGroup = groups.find((group) => group.key === this.rfiActiveTab);
        const fallbackGroup = groups.find((group) => group.items.length > 0) || groups[0];
        const activeKey = currentActiveGroup?.items?.length
            ? this.rfiActiveTab
            : fallbackGroup?.key;
        this.rfiActiveTab = activeKey;

        const tabList = groups.map((group) => {
            const count = group.items?.length || 0;
            const isActive = group.key === activeKey;
            return `
                <button
                    type="button"
                    class="tab-button${isActive ? ' tab-button-active' : ''}"
                    data-rfi-tab="${group.key}"
                    role="tab"
                    aria-selected="${isActive ? 'true' : 'false'}"
                    aria-controls="rfiPanel-${group.key}"
                >${this.escapeHtml(group.title)}<span class="tab-badge">${count}</span></button>
            `;
        }).join('');

        const panels = groups.map((group) => {
            const isActive = group.key === activeKey;
            return `
                <div
                    class="tab-panel"
                    id="rfiPanel-${group.key}"
                    data-rfi-panel="${group.key}"
                    role="tabpanel"
                    ${isActive ? '' : 'hidden'}
                >
                    ${this.renderRfiCategoryGroup(group)}
                </div>
            `;
        }).join('');

        return `
            <div class="tabbed-section rfi-tabs" data-rfi-tabs>
                <div class="tab-list" role="tablist" aria-label="RFI categories">
                    ${tabList}
                </div>
                ${panels}
            </div>
        `;
    }

    renderResponsesList() {
        const container = document.getElementById('responsesList');
        this.updateSidebarBadge('responsesBadge', this.responses.length);
        if (!container) return;

        if (this.responses.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3 class="empty-state-title">No Responses Yet</h3>
                    <p class="empty-state-message">Direct communications, RFI answers, White Cell updates, and forwarded proposals will appear here.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.renderTabbedResponseList();
    }

    renderTabbedResponseList() {
        const populatedGroups = this.getResponseTypeGroups(this.responses);
        const groupedResponses = new Map(
            populatedGroups.map((group) => [group.key, group])
        );
        const visibleGroups = RESPONSE_TYPE_GROUPS
            .filter((group) => group.key !== 'other' || groupedResponses.has(group.key))
            .map((group) => ({
                ...group,
                items: groupedResponses.get(group.key)?.items || []
            }));
        const currentActiveGroup = visibleGroups.find((group) => group.key === this.responsesActiveTab);
        const fallbackGroup = visibleGroups.find((group) => group.items.length > 0) || visibleGroups[0];
        const activeKey = currentActiveGroup?.items?.length
            ? this.responsesActiveTab
            : fallbackGroup?.key;
        this.responsesActiveTab = activeKey;

        const tabList = visibleGroups.map((group) => {
            const count = group.items?.length || 0;
            const isActive = group.key === activeKey;
            return `
                <button
                    type="button"
                    class="tab-button${isActive ? ' tab-button-active' : ''}"
                    data-responses-tab="${group.key}"
                    role="tab"
                    aria-selected="${isActive ? 'true' : 'false'}"
                    aria-controls="responsesPanel-${group.key}"
                >${this.escapeHtml(group.title)}<span class="tab-badge">${count}</span></button>
            `;
        }).join('');

        const panels = visibleGroups.map((group) => {
            const isActive = group.key === activeKey;
            return `
                <div
                    class="tab-panel"
                    id="responsesPanel-${group.key}"
                    data-responses-panel="${group.key}"
                    role="tabpanel"
                    ${isActive ? '' : 'hidden'}
                >
                    ${this.renderResponseTypeGroup(group)}
                </div>
            `;
        }).join('');

        return `
            <div class="tabbed-section response-tabs" data-responses-tabs>
                <div class="tab-list" role="tablist" aria-label="White Cell response categories">
                    ${tabList}
                </div>
                ${panels}
            </div>
        `;
    }

    renderTribeStreetJournalList() {
        const container = document.getElementById('tribeStreetJournalList');
        this.updateSidebarBadge('tribeStreetJournalBadge', this.journalUpdates.length);
        if (!container) return;
        this.renderTribeStreetJournalEmbed();

        const combinedEntries = [
            ...this.journalUpdates.map((communication) => ({
                kind: 'white_cell_update',
                created_at: communication.created_at,
                content: communication.content,
                type: communication.type || 'GUIDANCE',
                metadata: communication.metadata || {},
                to_role: communication.to_role
            })),
            ...this.journalEntries.map((entry) => ({
                ...entry,
                kind: 'team_capture'
            }))
        ].sort((a, b) => getSortableEventTime(b) - getSortableEventTime(a));

        if (combinedEntries.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3 class="empty-state-title">No Journal Entries Yet</h3>
                    <p class="empty-state-message">White Cell journal updates and team captures will appear here.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            ${combinedEntries.map((entry) => {
            if (entry.kind === 'white_cell_update') {
                const timestamp = getEventTimestamp(entry);
                return `
                    <div class="card card-bordered" style="padding: var(--space-3); margin-bottom: var(--space-3); border-left: 3px solid var(--color-primary-500);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-2);">
                            <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
                                ${createBadge({ text: 'WHITE CELL UPDATE', variant: 'primary', size: 'sm', rounded: true }).outerHTML}
                                <span class="text-xs text-gray-500">${this.escapeHtml(this.getCommunicationAudienceLabel(entry))}</span>
                            </div>
                            <span class="text-xs text-gray-400">${timestamp ? formatDateTime(timestamp) : 'Time unavailable'}</span>
                        </div>
                        <p class="text-sm">${this.escapeHtml(entry.content || '')}</p>
                    </div>
                `;
            }

            const eventType = entry.type || entry.event_type || 'NOTE';
            const badgeVariant = {
                NOTE: 'default',
                MOMENT: 'warning',
                QUOTE: 'info'
            }[eventType] || 'default';
            const actorLabel = entry.metadata?.actor || this.getCurrentLeadLabel();
            const timestamp = getEventTimestamp(entry);

            return `
                <div class="card card-bordered" style="padding: var(--space-3); margin-bottom: var(--space-3);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-2);">
                        <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
                            ${createBadge({ text: eventType, variant: badgeVariant, size: 'sm', rounded: true }).outerHTML}
                            <span class="text-xs text-gray-500">${this.escapeHtml(actorLabel)}</span>
                        </div>
                        <span class="text-xs text-gray-400">${timestamp ? formatDateTime(timestamp) : 'Time unavailable'}</span>
                    </div>
                    <p class="text-sm">${this.escapeHtml(entry.content || entry.description || '')}</p>
                    <p class="text-xs text-gray-400" style="margin-top: var(--space-2);">Move ${entry.move || 1} | Phase ${entry.phase || 1}</p>
                </div>
            `;
        }).join('')}
        `;
    }

    renderTribeStreetJournalEmbed() {
        const container = document.getElementById('tribeStreetJournalEmbed');
        if (!container || container.innerHTML?.includes(TRIBE_STREET_JOURNAL_EMBED_URL)) return;

        container.innerHTML = createTribeStreetJournalEmbedMarkup({
            title: `${this.teamContext?.teamLabel || this.teamLabel || 'Team'} Tribe Street Journal live site`
        });
    }

    renderVerbaAiList() {
        const container = document.getElementById('verbaAiList');
        this.updateSidebarBadge('verbaAiBadge', this.verbaAiUpdates.length);
        if (!container) return;

        if (this.verbaAiUpdates.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3 class="empty-state-title">No Verba AI Updates Yet</h3>
                    <p class="empty-state-message">White Cell Verba AI population sentiment updates will appear here.</p>
                </div>
            `;
            return;
        }

        const visibleUpdates = this.verbaAiUpdates.slice(0, FACILITATOR_VERBA_AI_RENDER_LIMIT);
        const hiddenCount = Math.max(0, this.verbaAiUpdates.length - visibleUpdates.length);

        container.innerHTML = `
            ${hiddenCount ? `<p class="text-xs text-gray-500" style="margin: 0 0 var(--space-3);">Showing the first ${FACILITATOR_VERBA_AI_RENDER_LIMIT} of ${this.verbaAiUpdates.length} Verba AI updates.</p>` : ''}
            ${visibleUpdates.map((communication) => `
            <div class="card card-bordered" style="padding: var(--space-3); margin-bottom: var(--space-3); border-left: 3px solid var(--color-success);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-2);">
                    <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
                        ${createBadge({ text: 'VERBA AI', variant: 'success', size: 'sm', rounded: true }).outerHTML}
                        <span class="text-xs text-gray-500">${this.escapeHtml(this.getCommunicationAudienceLabel(communication))}</span>
                    </div>
                    <span class="text-xs text-gray-400">${formatDateTime(communication.created_at)}</span>
                </div>
                <p class="text-sm">${this.escapeHtml(communication.content || '')}</p>
            </div>
        `).join('')}
        `;
    }

    renderTimeline() {
        const container = document.getElementById('timelineList');
        if (!container) return;

        if (this.timelineEvents.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3 class="empty-state-title">No Timeline Events</h3>
                    <p class="empty-state-message">Session activity will appear here as the exercise progresses.</p>
                </div>
            `;
            return;
        }

        const { visibleEvents, hiddenCount } = getVisibleFacilitatorTimelineEvents(this.timelineEvents);

        container.innerHTML = `
            ${hiddenCount ? `<p class="text-xs text-gray-500" style="margin: 0 0 var(--space-3);">Showing the first ${FACILITATOR_TIMELINE_RENDER_LIMIT} of ${this.timelineEvents.length} timeline events.</p>` : ''}
            ${visibleEvents.map((event) => `
            <div class="timeline-event" style="display: flex; gap: var(--space-3); padding: var(--space-3); border-bottom: 1px solid var(--color-gray-200);">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary-500); margin-top: 6px; flex-shrink: 0;"></div>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; gap: var(--space-2);">
                        ${createBadge({ text: event.type || 'EVENT', size: 'sm', rounded: true }).outerHTML}
                        <span class="text-xs text-gray-400">${formatDateTime(event.created_at)}</span>
                    </div>
                    <p class="text-sm mt-1">${this.escapeHtml(event.content || event.description || '')}</p>
                    <p class="text-xs text-gray-400 mt-1">${this.escapeHtml(this.formatTeamLabel(event.team))} | Move ${event.move || 1} | Phase ${event.phase || 1}</p>
                </div>
            </div>
        `).join('')}
        `;
    }

    async handleCaptureSubmit(event) {
        event.preventDefault();
        if (!this.requireWriteAccess()) return;

        const type = document.querySelector('input[name="captureType"]:checked')?.value;
        const contentInput = document.getElementById('captureContent');
        const content = contentInput?.value?.trim();

        if (!content) {
            showToast({ message: 'Please enter content', type: 'error' });
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        const loader = showLoader({ message: 'Saving observation...' });

        try {
            const gameState = this.getCurrentGameState();
            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type,
                content,
                metadata: { role: this.role || this.getCurrentLeadRole() },
                team: this.teamId,
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: 'Observation saved', type: 'success' });
            if (contentInput) {
                contentInput.value = '';
            }
        } catch (err) {
            logger.error('Failed to save capture:', err);
            showToast({ message: 'Failed to save observation', type: 'error' });
        } finally {
            hideLoader();
        }
    }

    formatCommunicationTarget(target) {
        const labels = {
            all: 'White Cell communication to all teams',
            [this.teamId]: `White Cell communication to ${this.teamLabel}`,
            [this.teamContext.facilitatorRole]: `White Cell communication to ${this.teamContext.facilitatorLabel}`,
            [this.teamContext.scribeRole]: `White Cell communication to ${this.teamContext.scribeLabel}`
        };

        return labels[target] || target || 'White Cell communication';
    }

    getCommunicationAudienceLabel(communication = {}) {
        const metadata = communication?.metadata && typeof communication.metadata === 'object'
            ? communication.metadata
            : {};
        const audienceTarget = metadata.recipient_role
            || metadata.recipient_team
            || metadata.recipient
            || communication?.to_role
            || '';

        return this.formatCommunicationTarget(audienceTarget);
    }

    formatTeamLabel(team) {
        if (team === this.teamId) {
            return this.teamLabel;
        }

        if (team === 'white_cell') {
            return 'White Cell';
        }

        return team || '';
    }

    escapeHtml(value) {
        if (typeof value !== 'string') return '';
        return value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll('\'', '&#39;');
    }

    destroy() {
        if (this.intercomReceiver) {
            unmountScribeIntercomReceiver(this.intercomReceiver);
            this.intercomReceiver = null;
        }
        this.storeUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
        this.storeUnsubscribers = [];
    }
}

const facilitatorController = new FacilitatorController();

const shouldAutoInitFacilitator = typeof document !== 'undefined' &&
    typeof window !== 'undefined' &&
    document.body?.dataset?.roleSurface !== 'scribe' &&
    !globalThis.__ESG_DISABLE_AUTO_INIT__;

if (shouldAutoInitFacilitator) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => facilitatorController.init());
    } else {
        facilitatorController.init();
    }

    window.addEventListener('beforeunload', () => facilitatorController.destroy());
}

export default facilitatorController;
