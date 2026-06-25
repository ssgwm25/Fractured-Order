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
    createOutcomeBadge,
    createPriorityBadge,
    createStatusBadge
} from '../components/ui/Badge.js';
import {
    BLUE_ACTION_COORDINATED_OPTIONS,
    BLUE_ACTION_COUNTRIES,
    BLUE_ACTION_ENFORCEMENT_TIMELINES,
    BLUE_ACTION_IMPLEMENTATIONS,
    BLUE_ACTION_INFORMED_OPTIONS,
    BLUE_ACTION_INSTRUMENTS,
    BLUE_ACTION_LEGISLATIVE_OPTIONS,
    BLUE_ACTION_LEVERS,
    BLUE_ACTION_SCRIBE_HANDOFF,
    BLUE_ACTION_SECTORS,
    BLUE_ACTION_SUPPLY_CHAIN_FOCUS,
    formatActionSequenceLabel,
    formatBlueActionSelection,
    getActionSequenceNumber,
    getBlueActionViewModel,
    getNextActionSequenceNumber,
    serializeBlueActionDetails
} from '../features/actions/blueActionDetails.js';
import {
    PROPOSAL_ACTION_MECHANISM,
    PROPOSAL_ORIGINATORS,
    PROPOSAL_CATEGORIES,
    PROPOSAL_SECTORS,
    PROPOSAL_DELIVERIES,
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
    formatStrategicOrientationSelection,
    getStrategicOrientationCompletion,
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
    isProposalRecipientFinal
} from '../features/actions/proposalRecipientState.js';
import {
    WHITE_CELL_UPDATE_KINDS,
    getWhiteCellCommunicationUpdateKind,
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
    isSubmittedAction
} from '../core/enums.js';
import { getRoleRoute, resolveTeamContext } from '../core/teamContext.js';
import { navigateToApp } from '../core/navigation.js';

const logger = createLogger('Facilitator');
const PROPOSAL_TEAM_IDS = new Set(['green', 'industry']);
const TRIBE_STREET_JOURNAL_EVENT_TYPES = new Set(['NOTE', 'MOMENT', 'QUOTE']);
const TRIBE_STREET_JOURNAL_LIMIT = 20;
const ACTION_GROUP_RENDER_LIMIT = 40;
const RFI_RENDER_LIMIT = 50;
const RESPONSE_GROUP_RENDER_LIMIT = 30;
export const FACILITATOR_VERBA_AI_RENDER_LIMIT = 40;
export const FACILITATOR_TIMELINE_RENDER_LIMIT = 80;
const BLUE_ACTION_WIZARD_PAGE_TOTAL = 3;
const STRATEGIC_ORIENTATION_MODAL_STEP_TOTAL = 2;

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
        this.actionsActiveTab = 'draft';
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
        this.pendingWhiteCellArrivalSummary = {
            responses: new Set(),
            proposals: new Set()
        };
        this.hasHydratedResponses = false;
        this.hasHydratedReceivedProposals = false;
    }

    async init() {
        logger.info('Initializing Facilitator interface');

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
                    : `This page is only available to the ${this.teamLabel} Facilitator role.`,
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
        this.configureAccessMode();
        this.bindEventListeners();
        this.subscribeToLiveData();
        this.syncActionsFromStore();
        this.syncRfisFromStore();
        this.syncResponsesFromStores();
        this.syncReceivedProposalsFromStore();
        this.syncWhiteCellUpdateSectionsFromStore();
        this.syncTimelineFromStore();
        this.mountFollowAlongOnboarding();

        logger.info('Facilitator interface initialized');
    }

    mountFollowAlongOnboarding() {
        const navTarget = (section) => `.sidebar-link[data-section="${section}"]`;
        const actionNoun = this.isProposalTeam()
            ? 'proposals'
            : (this.teamId === 'red' ? 'move responses' : 'actions');
        const actionTitle = this.isProposalTeam()
            ? 'Build proposals'
            : (this.teamId === 'red' ? 'Prepare move responses' : 'Draft actions');
        const actionGuideBody = this.teamId === 'blue'
            ? `Create and revise your team's ${actionNoun} here. Forward completed actions to the Scribe; the Scribe projects and submits them to White Cell.`
            : `Create and revise your team's ${actionNoun} here. Once submitted, they become read-only while White Cell reviews them.`;
        this.onboarding = mountFollowAlong({
            storageKey: `followalong:facilitator:${this.teamId}`,
            title: `${this.teamContext.facilitatorLabel} guide`,
            steps: [
                {
                    title: this.teamContext.facilitatorLabel,
                    body: `Use this workspace to guide ${this.teamLabel}, prepare ${actionNoun}, ask White Cell for clarification, review incoming updates, capture observations, and track the session record.`
                },
                {
                    title: 'Read the live tracker',
                    body: 'The header shows the current move, phase, countdown timer, and whether the timer is running. White Cell controls these values; use them to pace deliberation and submissions.',
                    highlight: '#timerDisplay'
                },
                {
                    title: actionTitle,
                    body: actionGuideBody,
                    highlight: navTarget('actions')
                },
                {
                    title: 'Ask White Cell with RFIs',
                    body: 'Send RFIs when the team needs a ruling, clarification, or scenario detail. The RFI list uses category tabs so you can review one request type at a time.',
                    highlight: navTarget('requests')
                },
                {
                    title: 'Read White Cell responses',
                    body: 'Responses uses category tabs for explicit White Cell communications, update notices, forwarded proposals, and answers to your RFIs.',
                    highlight: navTarget('responses')
                },
                {
                    title: 'Review received proposals',
                    body: 'Received Proposals lists proposals that White Cell has approved and forwarded for your team to acknowledge, decline, ignore, or answer.',
                    highlight: navTarget('receivedProposals')
                },
                {
                    title: 'Read Tribe Street Journal',
                    body: 'Tribe Street Journal surfaces notes, moments, quotes, and White Cell updates relevant to your team.',
                    highlight: navTarget('tribeStreetJournal')
                },
                {
                    title: 'Review sentiment updates',
                    body: 'Verba AI Population Sentiments shows White Cell-published sentiment updates for your team to factor into deliberation.',
                    highlight: navTarget('verbaAi')
                },
                {
                    title: 'Audit the timeline',
                    body: 'Timeline gives you the chronological session record for actions, RFIs, responses, captures, and White Cell updates.',
                    highlight: navTarget('timeline')
                },
                {
                    title: 'Capture observations',
                    body: 'Quick Capture records notes, moments, and quotes during deliberation so the team record stays current.',
                    highlight: navTarget('capture')
                },
                {
                    title: 'Revisit this guide',
                    body: 'This guide stays above the session label. Collapse it when you need space, then reopen it here later.',
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
        return 'Facilitator';
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
            roleLabel.textContent = this.isReadOnly ? 'Observer' : this.getCurrentLeadSurfaceLabel();
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
            const isRedResponseFlow = this.teamId === 'red';
            if (this.isReadOnly) {
                if (isGreenProposalFlow) {
                    actionsDescription.textContent = 'Passive observer view of team proposals. Drafts are visible but cannot be created, edited, sent, or deleted.';
                } else if (isRedResponseFlow) {
                    actionsDescription.textContent = 'Passive observer view of move responses. Entries are visible but cannot be created, edited, submitted, or deleted.';
                } else {
                    actionsDescription.textContent = 'Passive observer view of facilitator actions. Drafts are visible but cannot be created, edited, submitted, or deleted.';
                }
            } else if (isGreenProposalFlow) {
                actionsDescription.textContent = 'Draft proposals and send them to the Blue or Red team.';
            } else if (isRedResponseFlow) {
                actionsDescription.textContent = 'Respond to Blue Team moves. White Cell reviews each response before it takes effect.';
            } else {
                actionsDescription.textContent = 'Draft actions, forward them to the Scribe, and track White Cell deliberation after scribe submission.';
            }
        }

        if (requestsDescription) {
            requestsDescription.textContent = this.isReadOnly
                ? 'Passive observer view of RFIs by category. Request submission is disabled in observer mode.'
                : 'Submit questions to White Cell and use category tabs to monitor response status.';
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
                        This page is passive for the observer role. You can review facilitator actions,
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
        const newRfiBtn = document.getElementById('newRfiBtn');
        const captureForm = document.getElementById('captureForm');

        const actionsListEl = document.getElementById('actionsList');
        actionsListEl?.addEventListener('click', (event) => {
            const tabButton = event.target.closest('.tab-button[data-actions-tab]');
            if (!tabButton || !actionsListEl.contains(tabButton)) return;
            this.setActionsActiveTab(tabButton.dataset.actionsTab);
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
            newRfiBtn?.setAttribute('aria-disabled', 'true');
            captureForm?.querySelectorAll?.('button, input, select, textarea').forEach((control) => {
                control.disabled = true;
                control.setAttribute('aria-disabled', 'true');
            });
            return;
        }

        newActionBtn?.addEventListener('click', () => this.showCreateActionModal());
        strategicOrientationBtn?.addEventListener('click', () => this.showStrategicOrientationModal());
        newRfiBtn?.addEventListener('click', () => this.showCreateRfiModal());
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
            });
        });
    }

    requireWriteAccess() {
        if (!this.isReadOnly) {
            return true;
        }

        showToast({
            message: 'Observer mode is read-only on the facilitator page.',
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

    getStrategicOrientationGateState() {
        return getStrategicOrientationCompletion(actionsStore.getAll());
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
            red: 'Red forecast'
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
                this.renderActionsList();
                this.syncResponsesFromStores({
                    announce: event === 'created'
                });
                this.syncReceivedProposalsFromStore({
                    announce: event === 'created'
                });
                this.syncWhiteCellUpdateSectionsFromStore();
                this.flushWhiteCellArrivalAnnouncement();
            })
        );

        this.storeUnsubscribers.push(
            timelineStore.subscribe(() => {
                this.syncTimelineFromStore();
            })
        );
    }

    syncActionsFromStore() {
        this.actions = actionsStore.getByTeam(this.teamId);
        this.renderActionsList();

        const badge = document.getElementById('actionsBadge');
        if (badge) {
            badge.textContent = this.actions.length.toString();
        }
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

    flushWhiteCellArrivalAnnouncement() {
        const responseCount = this.pendingWhiteCellArrivalSummary.responses.size;
        const proposalCount = this.pendingWhiteCellArrivalSummary.proposals.size;

        if (responseCount === 0 && proposalCount === 0) {
            return;
        }

        let message = '';
        let type = 'info';

        if (responseCount > 0 && proposalCount > 0) {
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
        const statusLabel = formatProposalRecipientStatus(status);
        const actionedAt = recipientEntry?.actioned_at || null;
        const responseEntry = getProposalResponseEntry(forwardedCommunication);
        const responseAudienceLabel = this.getProposalResponseAudienceLabel(responseEntry, recipientTeam);
        const responseSentAt = responseEntry?.responseSentAt || actionedAt || null;
        const timestampLabel = responseSentAt ? formatRelativeTime(responseSentAt) : '';
        const statusMessage = {
            [PROPOSAL_RECIPIENT_STATUSES.UNREAD]: `Awaiting response from ${recipientLabel}`,
            [PROPOSAL_RECIPIENT_STATUSES.ACKNOWLEDGED]: `${recipientLabel} opened this proposal and is reviewing it.`,
            [PROPOSAL_RECIPIENT_STATUSES.RESPONDED]: `Response received from ${responseAudienceLabel}`,
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
                    <strong>${this.escapeHtml(responseAudienceLabel)} Response</strong>
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
            const outcome = metadata.outcome || 'APPROVED';
            const receivedAt = communication.created_at;
            const status = getProposalRecipientStatus(communication);
            const statusLabel = formatProposalRecipientStatus(status);
            const isNewArrival = this.newReceivedProposalIds.has(communication.id);
            const cardId = escape(communication.id);
            const responseEntry = getProposalResponseEntry(communication);
            const showAcknowledge = status === PROPOSAL_RECIPIENT_STATUSES.UNREAD;
            const showRespond = !isProposalRecipientFinal(communication);
            const showDecline = !isProposalRecipientFinal(communication);
            const showIgnore = !isProposalRecipientFinal(communication);
            const actionSummaryMarkup = responseEntry?.responseContent ? `
                <div style="margin-top: var(--space-3); padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-surface-alt);">
                    <p class="text-xs text-gray-500" style="margin: 0 0 var(--space-1);">
                        <strong>Response sent to White Cell</strong>${responseEntry.responseSentAt ? ` | ${escape(formatRelativeTime(responseEntry.responseSentAt))}` : ''}
                    </p>
                    <p class="text-sm" style="margin: 0;">${escape(responseEntry.responseContent)}</p>
                </div>
            ` : '';
            const readOnlyStateMarkup = status === PROPOSAL_RECIPIENT_STATUSES.RESPONDED
                ? `
                    <p class="text-xs text-gray-500" style="margin: 0;">
                        This proposal response is locked and is now being shown back to ${escape(sourceLabel)}.
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
                            <p class="entity-card__eyebrow">Forwarded from ${escape(sourceLabel)} &middot; ${escape(outcome)}</p>
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
                        { label: 'Category', value: snapshot.category || 'Not specified' },
                        { label: 'Intended Partners', value: snapshot.intendedPartners || 'Not specified' },
                        { label: 'Focus Sector', value: snapshot.focusSector || 'Not specified' },
                        { label: 'Delivery', value: snapshot.delivery || 'Not specified' },
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

    setActionsActiveTab(tab) {
        if (!tab || tab === this.actionsActiveTab) return;
        this.actionsActiveTab = tab;
        const container = document.getElementById('actionsList');
        if (!container || typeof container.querySelectorAll !== 'function') return;
        container.querySelectorAll('.tab-button[data-actions-tab]').forEach((button) => {
            const isActive = button.dataset.actionsTab === tab;
            button.classList.toggle('tab-button-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        container.querySelectorAll('.tab-panel[data-actions-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.actionsPanel !== tab;
        });
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
        const isGreenProposalFlow = this.isProposalTeam();
        const isRedResponseFlow = this.teamId === 'red';
        const emptyStateTitle = isGreenProposalFlow
            ? 'No Proposals Yet'
            : (isRedResponseFlow ? 'No Responses Yet' : 'No Actions Yet');
        const emptyStateMessage = this.isReadOnly
            ? (isGreenProposalFlow
                ? 'No team proposals have been created yet.'
                : (isRedResponseFlow
                    ? 'No move responses have been created yet.'
                    : 'No facilitator actions have been created yet.'))
            : (isGreenProposalFlow
                ? 'Create your first proposal to start the White Cell review flow.'
                : (isRedResponseFlow
                    ? 'Create your first response to start the White Cell review flow.'
                    : 'Create your first strategic action to start the facilitator-to-scribe review flow.'));

        if (this.actions.length === 0) {
            actionsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
                            <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <h3 class="empty-state-title">${emptyStateTitle}</h3>
                    <p class="empty-state-message">${emptyStateMessage}</p>
                </div>
            `;
            return;
        }

        actionsList.innerHTML = this.renderGroupedActionList();

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

    getActionStatusGroupDefinitions() {
        if (this.isProposalTeam()) {
            return [
                {
                    key: 'draft',
                    tabLabel: 'Draft',
                    title: 'Draft Proposals',
                    description: 'Editable proposals that have not yet been sent to White Cell.'
                },
                {
                    key: 'submitted',
                    tabLabel: 'Submitted',
                    title: 'Sent to White Cell',
                    description: 'Read-only proposals currently awaiting White Cell review.'
                },
                {
                    key: 'reviewed',
                    tabLabel: 'Deliberated',
                    title: 'White Cell Reviewed',
                    description: 'Proposals White Cell has already reviewed.'
                },
                {
                    key: 'other',
                    tabLabel: 'Other',
                    title: 'Other Proposal Statuses',
                    description: 'Proposals outside the standard draft and review flow.'
                }
            ];
        }

        if (this.teamId === 'red') {
            return [
                {
                    key: 'draft',
                    tabLabel: 'Draft',
                    title: 'Draft Move Responses',
                    description: 'Editable move responses that have not yet been submitted to White Cell.'
                },
                {
                    key: 'submitted',
                    tabLabel: 'Submitted',
                    title: 'Submitted to White Cell',
                    description: 'Read-only move responses currently under White Cell deliberation.'
                },
                {
                    key: 'reviewed',
                    tabLabel: 'Deliberated',
                    title: 'White Cell Reviewed',
                    description: 'Move responses White Cell has already reviewed.'
                },
                {
                    key: 'other',
                    tabLabel: 'Other',
                    title: 'Other Response Statuses',
                    description: 'Move responses outside the standard draft and review flow.'
                }
            ];
        }

        return [
            {
                key: 'draft',
                tabLabel: 'Draft',
                title: 'Draft Strategic Actions',
                description: 'Editable actions that have not yet been forwarded to the Scribe.'
            },
            {
                key: 'submitted',
                tabLabel: 'Submitted',
                title: 'Submitted to White Cell',
                description: 'Read-only actions submitted to White Cell by the Scribe.'
            },
            {
                key: 'reviewed',
                tabLabel: 'Deliberated',
                title: 'White Cell Reviewed',
                description: 'Actions White Cell has already reviewed.'
            },
            {
                key: 'other',
                tabLabel: 'Other',
                title: 'Other Action Statuses',
                description: 'Actions outside the standard draft and review flow.'
            }
        ];
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

    getEmptyActionGroupMessage(key) {
        const noun = this.isProposalTeam()
            ? 'proposals'
            : (this.teamId === 'red' ? 'move responses' : 'actions');
        switch (key) {
            case 'draft': return `No draft ${noun} yet.`;
            case 'submitted': return `No ${noun} are awaiting White Cell review.`;
            case 'reviewed': return `No ${noun} have been deliberated yet.`;
            default: return `No ${noun} in this state.`;
        }
    }

    renderGroupedActionList() {
        const groupDefinitions = this.getActionStatusGroupDefinitions();
        const groupedActions = new Map(
            groupDefinitions.map((group) => [group.key, []])
        );

        this.actions.forEach((action) => {
            const groupKey = this.getActionStatusGroupKey(action);
            if (!groupedActions.has(groupKey)) {
                groupedActions.set(groupKey, []);
            }
            groupedActions.get(groupKey).push(action);
        });

        // Always surface the primary lifecycle tabs; only show "Other" when it holds items.
        const visibleGroups = groupDefinitions.filter((group) =>
            group.key !== 'other' || (groupedActions.get(group.key) || []).length > 0
        );

        const activeKey = visibleGroups.some((group) => group.key === this.actionsActiveTab)
            ? this.actionsActiveTab
            : visibleGroups[0]?.key;
        this.actionsActiveTab = activeKey;

        const tabList = visibleGroups.map((group) => {
            const count = (groupedActions.get(group.key) || []).length;
            const isActive = group.key === activeKey;
            return `
                <button
                    type="button"
                    class="tab-button${isActive ? ' tab-button-active' : ''}"
                    data-actions-tab="${group.key}"
                    role="tab"
                    aria-selected="${isActive ? 'true' : 'false'}"
                    aria-controls="actionsPanel-${group.key}"
                >${this.escapeHtml(group.tabLabel)}<span class="tab-badge">${count}</span></button>
            `;
        }).join('');

        const panels = visibleGroups.map((group) => {
            const groupActions = groupedActions.get(group.key) || [];
            const visibleGroupActions = groupActions.slice(0, ACTION_GROUP_RENDER_LIMIT);
            const hiddenCount = Math.max(0, groupActions.length - visibleGroupActions.length);
            const isActive = group.key === activeKey;
            const body = groupActions.length
                ? `<div class="card-list" aria-labelledby="actions-group-${group.key}">
                        ${visibleGroupActions.map((action) => this.renderActionCard(action)).join('')}
                   </div>`
                : `<p class="text-sm text-gray-500" style="margin: 0;">${this.escapeHtml(this.getEmptyActionGroupMessage(group.key))}</p>`;
            const overflowNote = hiddenCount
                ? `<p class="text-xs text-gray-500" style="margin: var(--space-2) 0 0;">Showing the first ${ACTION_GROUP_RENDER_LIMIT} of ${groupActions.length} records in this status group.</p>`
                : '';

            return `
                <div
                    class="tab-panel"
                    id="actionsPanel-${group.key}"
                    data-actions-panel="${group.key}"
                    role="tabpanel"
                    ${isActive ? '' : 'hidden'}
                >
                    <section
                        data-action-status-group="${group.key}"
                        aria-labelledby="actions-group-${group.key}"
                        style="display: grid; gap: var(--space-3);"
                    >
                        <div style="padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border-light);">
                            <h3
                                id="actions-group-${group.key}"
                                class="font-semibold text-sm"
                                style="margin: 0;"
                            >${this.escapeHtml(`${group.title} (${groupActions.length})`)}</h3>
                            <p class="text-xs text-gray-500" style="margin: var(--space-1) 0 0;">
                                ${this.escapeHtml(group.description)}
                            </p>
                        </div>
                        ${body}
                        ${overflowNote}
                    </section>
                </div>
            `;
        }).join('');

        return `
            <div class="tabbed-section" data-actions-tabs>
                <div class="tab-list" role="tablist" aria-label="Strategic action lifecycle">
                    ${tabList}
                </div>
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

    renderActionCard(action) {
        const strategicOrientation = getStrategicOrientationViewModel(action);
        const isStrategicOrientationFlow = strategicOrientation.hasStrategicOrientationDetails;
        const blueAction = getBlueActionViewModel(action);
        const isGreenProposalFlow = this.isProposalTeam() && !isStrategicOrientationFlow;
        const isRedResponseFlow = this.teamId === 'red' && !isStrategicOrientationFlow;
        const moveResponse = isRedResponseFlow ? getMoveResponseViewModel(action) : null;
        const title = isStrategicOrientationFlow
            ? strategicOrientation.title
            : (isRedResponseFlow ? moveResponse.title : blueAction.title);
        const expectedOutcomes = isStrategicOrientationFlow
            ? (strategicOrientation.isForecast
                ? (strategicOrientation.forecastSummary || `Forecast: Blue will choose ${strategicOrientation.orientationLabel}.`)
                : (strategicOrientation.orientationTag || 'Strategic Orientation selected.'))
            : isRedResponseFlow
            ? (moveResponse.expectedEffect || 'No expected effect recorded')
            : (blueAction.expectedOutcomes || 'No expected outcomes');
        const targetLabel = formatBlueActionSelection(blueAction.focusCountries);
        const leverLabel = formatBlueActionSelection(blueAction.levers, blueAction.lever || 'Not specified');
        const sectorLabel = formatBlueActionSelection(blueAction.sectors, blueAction.sector || 'Not specified');
        const legislativeOptionsLabel = formatBlueActionSelection(blueAction.legislativeOptions, 'None selected');
        const sequenceLabel = isStrategicOrientationFlow
            ? 'Pre-Move 1 | Strategic Orientation'
            : this.isBlueTeamActionWizardEnabled(action)
            ? this.getBlueActionSequenceContext(action).label
            : `Move ${action.move || 1} | Phase ${action.phase || 1}`;
        const status = action.status || ENUMS.ACTION_STATUS.DRAFT;
        const canManageDraft = !this.isReadOnly && canEditAction(action);
        const canSubmitDraft = !this.isReadOnly && canSubmitAction(action);
        const canRemoveDraft = !this.isReadOnly && canDeleteAction(action);
        const forwardedProposalCommunication = isGreenProposalFlow
            ? this.getForwardedProposalCommunication(action)
            : null;
        const shouldHideWhiteCellReviewDetails = Boolean(isGreenProposalFlow && forwardedProposalCommunication);
        const statusBadge = isStrategicOrientationFlow && isSubmittedAction(action)
            ? createBadge({
                text: 'With White Cell',
                variant: 'info',
                size: 'sm',
                rounded: true
            }).outerHTML
            : isRedResponseFlow && isSubmittedAction(action)
            ? createBadge({
                text: 'Deliberation Underway',
                variant: 'warning',
                size: 'sm',
                rounded: true
            }).outerHTML
            : (isRedResponseFlow && isAdjudicatedAction(action)
                ? createBadge({
                    text: 'Reviewed',
                    variant: 'success',
                    size: 'sm',
                    rounded: true
                }).outerHTML
                : createStatusBadge(status).outerHTML);
        const outcomeBadge = action.outcome
            ? createOutcomeBadge(action.outcome).outerHTML
            : '';
        const secondaryBadge = isStrategicOrientationFlow
            ? createBadge({
                text: strategicOrientation.isForecast ? 'Forecast' : 'Selection',
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
        const detailFields = isStrategicOrientationFlow
            ? [
                {
                    label: strategicOrientation.isForecast ? 'Forecasted Blue Orientation' : 'Selected Orientation',
                    value: `${strategicOrientation.orientationLabel}: ${strategicOrientation.orientationTag}`,
                    wide: true
                },
                { label: 'Primary Levers', value: formatStrategicOrientationSelection(strategicOrientation.primaryLevers) },
                { label: 'Accepted Costs', value: formatStrategicOrientationSelection(strategicOrientation.acceptedCosts) },
                { label: 'Posture', value: strategicOrientation.posture || 'Not specified' },
                ...(strategicOrientation.rationale
                    ? [{ label: 'Team Rationale', value: strategicOrientation.rationale, wide: true }]
                    : [])
            ]
            : isRedResponseFlow
            ? [
                { label: 'Strategic Assessment', value: moveResponse.strategicAssessment || 'Not specified', wide: true },
                { label: 'Response Strategy', value: moveResponse.responseStrategy || 'Not specified', wide: true },
                { label: 'Key Actions', value: moveResponse.keyActions || 'Not specified', wide: true },
                { label: 'Targets / Pressure Points', value: moveResponse.targetsAndPressurePoints || 'Not specified', wide: true },
                { label: 'Delivery Channel', value: moveResponse.deliveryChannel || 'Not specified' }
            ]
            : blueAction.hasBlueActionDetails
            ? [
                ...(blueAction.objective ? [{ label: 'Objective', value: blueAction.objective, wide: true }] : []),
                { label: 'Levers', value: leverLabel },
                { label: 'Implementation', value: blueAction.implementation || 'Not specified' },
                { label: 'Supply Chain Focus', value: blueAction.supplyChainFocus || 'Not specified' },
                { label: 'Focus Countries', value: targetLabel },
                { label: 'Sectors', value: sectorLabel },
                { label: 'Timeline', value: blueAction.enforcementTimeline || 'Not specified' },
                ...(blueAction.implementation === 'Legislative'
                    ? [{ label: 'Legislative Route', value: legislativeOptionsLabel, wide: true }]
                    : []),
                { label: 'Coordinated', value: formatBlueActionSelection(blueAction.coordinated, 'None selected') },
                { label: 'Informed/Engaged', value: formatBlueActionSelection(blueAction.informed, 'None selected') }
            ]
            : [
                ...(action.ally_contingencies ? [{ label: 'Ally Contingencies', value: action.ally_contingencies, wide: true }] : []),
                { label: 'Targets', value: targetLabel },
                { label: 'Sector', value: action.sector || 'Not specified' },
                { label: 'Exposure', value: action.exposure_type || 'Not specified' }
            ];
        const detailsMarkup = this.renderDetailGrid(detailFields);
        const statusGroupKey = this.getActionStatusGroupKey(action);
        const statusAccent = statusGroupKey === 'reviewed' ? 'deliberated' : statusGroupKey;

        let lifecycleMessage = `
            <p class="text-xs text-gray-500" style="margin-top: var(--space-3);">
                    ${isStrategicOrientationFlow
                        ? 'Draft Strategic Orientation artifacts are projected by the Scribe before White Cell submission.'
                        : isGreenProposalFlow
                    ? 'Draft proposals can be edited, sent to White Cell, or deleted by the active team-lead seat.'
                    : (isRedResponseFlow
                        ? 'Draft move responses can be edited, submitted, or deleted by the active team-lead seat.'
                        : 'Draft actions can be edited, forwarded to the Scribe, or deleted by the active team-lead seat.')}
            </p>
        `;

        if (isSubmittedAction(action)) {
            lifecycleMessage = `
                <p class="text-xs text-gray-500" style="margin-top: var(--space-3);">
                    ${isStrategicOrientationFlow
                        ? 'Submitted to White Cell'
                        : isGreenProposalFlow
                        ? 'Sent to White Cell'
                        : (isRedResponseFlow ? 'Submitted to White Cell' : 'Submitted to White Cell')} ${action.submitted_at ? formatRelativeTime(action.submitted_at) : ''}.
                    ${isStrategicOrientationFlow
                        ? 'This pre-Move-1 artifact is now read-only for facilitator and scribe seats.'
                        : isGreenProposalFlow
                        ? 'This proposal is now read-only for facilitator and scribe seats until White Cell review.'
                        : (isRedResponseFlow
                            ? 'White Cell deliberation is underway. This move response is now read-only for facilitator and scribe seats.'
                            : 'White Cell deliberation is underway. This action was submitted by the Scribe and is now read-only for facilitator and scribe seats.')}
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
                            : (isRedResponseFlow ? 'reviewed this move response' : 'reviewed this action')} ${action.adjudicated_at ? formatRelativeTime(action.adjudicated_at) : ''}.
                    </p>
                `;
        } else if (this.isReadOnly) {
            lifecycleMessage = `
                <p class="text-xs text-gray-500" style="margin-top: var(--space-3);">
                    ${isStrategicOrientationFlow
                        ? 'Observer mode is read-only. Strategic Orientation artifacts are visible but cannot be changed from this page.'
                        : isGreenProposalFlow
                        ? 'Observer mode is read-only. Draft proposals are visible but cannot be changed from this page.'
                        : (isRedResponseFlow
                            ? 'Observer mode is read-only. Move responses are visible but cannot be changed from this page.'
                            : 'Observer mode is read-only. Draft actions are visible but cannot be changed from this page.')}
                </p>
            `;
        }

        return `
            <div class="entity-card entity-card--${statusAccent}" data-action-id="${action.id}">
                <div class="entity-card__head">
                    <div>
                        <p class="entity-card__eyebrow">${this.escapeHtml(action.mechanism || 'No mechanism')} &middot; ${this.escapeHtml(sequenceLabel)}</p>
                        <h3 class="entity-card__title">${this.escapeHtml(title)}</h3>
                    </div>
                    <div class="entity-card__badges">
                        ${statusBadge}
                        ${secondaryBadge}
                        ${outcomeBadge}
                    </div>
                </div>

                <p class="card-summary">
                    ${isRedResponseFlow
                        ? `<strong>Expected Effect &amp; System Impact:</strong> ${this.escapeHtml(expectedOutcomes)}`
                        : this.escapeHtml(expectedOutcomes)}
                </p>
                ${detailsMarkup}
                ${isGreenProposalFlow ? this.renderProposalRecipientState(action) : ''}
                ${action.adjudication_notes && !shouldHideWhiteCellReviewDetails ? `
                    <p class="entity-card__note">
                        <strong>White Cell Notes:</strong> ${this.escapeHtml(action.adjudication_notes)}
                    </p>
                ` : ''}
                ${lifecycleMessage}

                ${(canManageDraft || (canSubmitDraft && !isStrategicOrientationFlow) || canRemoveDraft) ? `
                    <div class="card-actions" style="display: flex; gap: var(--space-2); margin-top: var(--space-3);">
                        ${canManageDraft ? `
                            <button class="btn btn-secondary btn-sm edit-action-btn" data-action-id="${action.id}">
                                Edit Draft
                            </button>
                        ` : ''}
                        ${canSubmitDraft && !isStrategicOrientationFlow ? `
                            <button class="btn btn-primary btn-sm forward-action-btn" data-action-id="${action.id}">
                                Forward to Scribe
                            </button>
                        ` : ''}
                        ${canRemoveDraft ? `
                            <button class="btn btn-ghost btn-sm text-error delete-action-btn" data-action-id="${action.id}">
                                Delete Draft
                            </button>
                        ` : ''}
                    </div>
                ` : ''}
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

        if (this.isBlueTeamActionWizardEnabled()) {
            this.showBlueActionWizard();
            return;
        }

        if (this.isGreenTeamProposalEnabled()) {
            this.showGreenProposalModal();
            return;
        }

        if (this.isRedTeamResponseEnabled()) {
            this.showRedResponseModal();
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

    showEditActionModal(action) {
        if (!this.requireWriteAccess()) return;
        if (!canEditAction(action)) {
            showToast({ message: 'Only draft actions can be edited.', type: 'error' });
            return;
        }

        if (isStrategicOrientationAction(action)) {
            this.showStrategicOrientationModal(action);
            return;
        }

        if (this.isBlueTeamActionWizardEnabled(action)) {
            this.showBlueActionWizard(action);
            return;
        }

        if (this.isGreenTeamProposalEnabled(action)) {
            this.showGreenProposalModal(action);
            return;
        }

        if (this.isRedTeamResponseEnabled(action)) {
            this.showRedResponseModal(action);
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
        return this.teamId === 'blue'
            ? STRATEGIC_ORIENTATION_ARTIFACT_TYPES.SELECTION
            : STRATEGIC_ORIENTATION_ARTIFACT_TYPES.FORECAST;
    }

    getStrategicOrientationActionForTeam() {
        return actionsStore.getAll().find((action) => (
            action?.team === this.teamId
            && isStrategicOrientationAction(action)
        )) || null;
    }

    getStrategicOrientationModalCopy() {
        const isBlue = this.teamId === 'blue';
        return {
            title: isBlue ? 'Strategic Orientation' : 'Forecast Blue Strategic Orientation',
            eyebrow: 'Pre-Move 1 \u00b7 Team Selection',
            stepOneTitle: isBlue ? 'Select one orientation' : 'Forecast Blue orientation',
            stepOneInstruction: isBlue
                ? 'Each orientation reflects a distinct posture toward strategic competition with the PRC. They are mutually exclusive. Review the doctrine and the trade-offs, then select one.'
                : 'Forecast the orientation Blue is most likely to choose before Move 1. Each option is mutually exclusive; choose one and configure the expected posture.',
            fieldLabel: isBlue ? 'Orientation' : 'Forecasted Blue orientation',
            configureButton: isBlue ? 'Next: Configure' : 'Next: Forecast',
            confirmButton: isBlue ? 'Confirm Orientation' : 'Confirm Forecast',
            statusReady: isBlue ? 'Ready to confirm orientation.' : 'Ready to confirm forecast.',
            rationalePlaceholder: isBlue
                ? 'Briefly state why your team chose this orientation and configuration. Recorded for the White Cell and the after-action review.'
                : 'Briefly state why your team forecasts Blue will choose this orientation and configuration. Recorded for the White Cell and the after-action review.'
        };
    }

    showStrategicOrientationModal(action = null) {
        if (!this.requireWriteAccess()) return;
        if (!['blue', 'green', 'red'].includes(this.teamId)) {
            showToast({
                message: 'Strategic Orientation is available only to Blue, Green, and Red.',
                type: 'warning'
            });
            return;
        }

        const existingAction = action || this.getStrategicOrientationActionForTeam();
        if (existingAction && !canEditAction(existingAction)) {
            showToast({
                message: 'This Strategic Orientation artifact has already been submitted to White Cell.',
                type: 'info'
            });
            return;
        }

        const content = this.createStrategicOrientationContent(existingAction || {});
        const modalRef = { current: null };
        const copy = this.getStrategicOrientationModalCopy();

        modalRef.current = showModal({
            title: copy.title,
            content,
            size: 'xl'
        });

        this.bindStrategicOrientationModal(content, modalRef.current, {
            actionId: existingAction?.id || null,
            isEdit: Boolean(existingAction?.id)
        });
    }

    createStrategicOrientationContent(action = {}) {
        const content = document.createElement('div');
        const copy = this.getStrategicOrientationModalCopy();
        const viewModel = getStrategicOrientationViewModel(action);
        const selectedOrientation = viewModel.hasStrategicOrientationDetails
            ? viewModel.orientation
            : '';
        const renderOrientationCard = (option) => {
            const isSelected = selectedOrientation === option.id;
            return `
                <button class="opt${isSelected ? ' selected' : ''}" type="button" data-orientation="${this.escapeHtml(option.id)}" aria-pressed="${isSelected ? 'true' : 'false'}">
                    <div class="opt-head">
                        <div>
                            <div class="opt-num">${this.escapeHtml(option.number)}</div>
                            <div class="opt-name">${this.escapeHtml(option.name)}</div>
                        </div>
                        <div class="opt-check" aria-hidden="true">&check;</div>
                    </div>
                    <div class="opt-tag">${this.escapeHtml(option.tag)}</div>
                    <p class="opt-desc">${this.escapeHtml(option.description)}</p>
                    <div class="opt-chars">
                        ${option.characteristics.map((item) => `
                            <div class="char">
                                <div class="k">${this.escapeHtml(item.key)}</div>
                                <div class="v">${this.escapeHtml(item.value)}</div>
                            </div>
                        `).join('')}
                    </div>
                </button>
            `;
        };

        content.innerHTML = `
            <section class="strategic-orientation-modal" data-strategic-orientation-modal>
                <div class="modal-head">
                    <div class="mh-top">
                        <div>
                            <div class="eyebrow">${this.escapeHtml(copy.eyebrow)}</div>
                            <h1>${this.escapeHtml(copy.title)}</h1>
                        </div>
                        <div class="step-pill" id="stepPill">Step 1 of ${STRATEGIC_ORIENTATION_MODAL_STEP_TOTAL}</div>
                    </div>
                    <p id="mhSub">Choose the posture that will frame the first move. The Scribe must present the completed submission before White Cell receives it.</p>
                </div>

                <div class="view show" id="step1" data-orientation-step="1">
                    <div class="content-pad">
                        <h2>${this.escapeHtml(copy.stepOneTitle)}</h2>
                        <p class="instruction">${this.escapeHtml(copy.stepOneInstruction)}</p>

                        <div class="field-label">${this.escapeHtml(copy.fieldLabel)} <span class="req">&middot; required</span></div>

                        <div class="options" id="options">
                            ${Object.values(STRATEGIC_ORIENTATION_OPTIONS).map(renderOrientationCard).join('')}
                        </div>
                    </div>

                    <div class="footer">
                        <div class="foot-status" id="footPick">${selectedOrientation ? this.escapeHtml(`Selected: ${viewModel.orientationLabel}`) : 'No orientation selected'}</div>
                        <div class="foot-actions">
                            <button class="btn btn-ghost" type="button" data-orientation-nav="cancel">Cancel</button>
                            <button class="btn btn-primary" id="nextBtn" type="button" data-orientation-nav="next" ${selectedOrientation ? '' : 'disabled'}>${this.escapeHtml(copy.configureButton)}</button>
                        </div>
                    </div>
                </div>

                <div class="view" id="step2" data-orientation-step="2">
                    <div class="content-pad">
                        <h2>Configure orientation</h2>
                        <div class="config-banner">
                            <div class="cb-title" id="configTitle">Selected orientation</div>
                            <div class="cb-sub" id="configSub">Select primary levers, accepted costs, and posture.</div>
                        </div>

                        <p class="instruction">Configuration choices make the orientation operational for the game record. Select at least one lever, one accepted cost, and one posture.</p>

                        <div class="field-label">Primary levers <span class="req">&middot; select at least one</span></div>
                        <div class="chips" id="leverChips"></div>

                        <div class="field-label">Accepted costs <span class="req">&middot; select at least one</span></div>
                        <div class="chips" id="costChips"></div>

                        <div class="field-label">Posture <span class="req">&middot; select one</span></div>
                        <div class="chips" id="postureChips"></div>

                        <div class="field-label">Team rationale <span class="opt-note">(recorded with your selection)</span></div>
                        <textarea id="rationale" placeholder="${this.escapeHtml(copy.rationalePlaceholder)}">${this.escapeHtml(viewModel.rationale)}</textarea>
                        <div class="help">Optional but recommended. Your rationale travels with the selection and gives the White Cell context for how to read your moves.</div>
                    </div>

                    <div class="footer">
                        <div class="foot-status" id="configStatus">Select required configuration choices.</div>
                        <div class="foot-actions">
                            <button class="btn btn-ghost" type="button" data-orientation-nav="back">Back</button>
                            <button class="btn btn-primary" id="confirmBtn" type="button" data-orientation-nav="confirm" disabled>${this.escapeHtml(copy.confirmButton)}</button>
                        </div>
                    </div>
                </div>

                <div class="view confirm-view" id="confirmView" data-orientation-step="confirm">
                    <div class="content-pad">
                        <div class="confirm-icon" aria-hidden="true">&check;</div>
                        <h2>Strategic Orientation recorded</h2>
                        <p class="instruction">This submission will be forwarded to the Scribe for team projection before it goes to White Cell.</p>

                        <div class="summary">
                            <div class="s-k">Orientation</div>
                            <div class="s-v" id="sumOrientation">-</div>
                            <div class="s-k">Primary levers</div>
                            <div class="s-v" id="sumLevers">-</div>
                            <div class="s-k">Accepted costs</div>
                            <div class="s-v" id="sumCosts">-</div>
                            <div class="s-k">Posture</div>
                            <div class="s-v" id="sumPosture">-</div>
                            <div class="s-k">Team rationale</div>
                            <div class="s-v" id="sumRationale">-</div>
                        </div>
                    </div>
                </div>
            </section>
        `;

        content.__strategicOrientationInitialState = {
            selected: selectedOrientation,
            levers: viewModel.primaryLevers || [],
            costs: viewModel.acceptedCosts || [],
            posture: viewModel.posture || '',
            rationale: viewModel.rationale || ''
        };

        return content;
    }

    bindStrategicOrientationModal(content, modal, { actionId = null, isEdit = false } = {}) {
        const state = {
            selected: content.__strategicOrientationInitialState?.selected || null,
            levers: [...(content.__strategicOrientationInitialState?.levers || [])],
            costs: [...(content.__strategicOrientationInitialState?.costs || [])],
            posture: content.__strategicOrientationInitialState?.posture || '',
            rationale: content.__strategicOrientationInitialState?.rationale || ''
        };
        const stepPill = content.querySelector('#stepPill');
        const step1 = content.querySelector('#step1');
        const step2 = content.querySelector('#step2');
        const confirmView = content.querySelector('#confirmView');
        const footPick = content.querySelector('#footPick');
        const nextBtn = content.querySelector('#nextBtn');
        const confirmBtn = content.querySelector('#confirmBtn');
        const configStatus = content.querySelector('#configStatus');
        const rationaleEl = content.querySelector('#rationale');
        const copy = this.getStrategicOrientationModalCopy();
        const makeChip = (group, value, selected) => {
            const safeValue = this.escapeHtml(value);
            return `
                <button class="chip" type="button" data-orientation-chip="${group}" data-chip-value="${safeValue}" aria-pressed="${selected ? 'true' : 'false'}">
                    <span class="dot" aria-hidden="true">&check;</span>
                    <span>${safeValue}</span>
                </button>
            `;
        };
        const setStep = (step) => {
            step1?.classList.toggle('show', step === 1);
            step2?.classList.toggle('show', step === 2);
            confirmView?.classList.toggle('show', step === 'confirm');

            if (stepPill) {
                stepPill.textContent = step === 2
                    ? `Step 2 of ${STRATEGIC_ORIENTATION_MODAL_STEP_TOTAL}`
                    : (step === 'confirm' ? 'Confirmed' : `Step 1 of ${STRATEGIC_ORIENTATION_MODAL_STEP_TOTAL}`);
            }
        };
        const renderConfig = () => {
            const option = STRATEGIC_ORIENTATION_OPTIONS[state.selected];
            if (!option) return;

            const configTitle = content.querySelector('#configTitle');
            const configSub = content.querySelector('#configSub');
            if (configTitle) configTitle.textContent = option.name;
            if (configSub) configSub.textContent = option.tag;

            const leverChips = content.querySelector('#leverChips');
            const costChips = content.querySelector('#costChips');
            const postureChips = content.querySelector('#postureChips');
            if (leverChips) {
                leverChips.innerHTML = option.levers
                    .map((value) => makeChip('lever', value, state.levers.includes(value)))
                    .join('');
            }
            if (costChips) {
                costChips.innerHTML = option.costs
                    .map((value) => makeChip('cost', value, state.costs.includes(value)))
                    .join('');
            }
            if (postureChips) {
                postureChips.innerHTML = option.posture
                    .map((value) => makeChip('posture', value, state.posture === value))
                    .join('');
            }
        };
        const updateConfirmState = () => {
            const isComplete = Boolean(state.levers.length && state.costs.length && state.posture);
            if (configStatus) {
                configStatus.textContent = isComplete ? copy.statusReady : 'Select required configuration choices.';
            }
            if (confirmBtn) {
                confirmBtn.disabled = !isComplete;
            }
        };
        const selectOrientation = (orientation) => {
            const option = STRATEGIC_ORIENTATION_OPTIONS[orientation];
            if (!option) return;

            state.selected = orientation;
            state.levers = state.levers.filter((value) => option.levers.includes(value));
            state.costs = state.costs.filter((value) => option.costs.includes(value));
            state.posture = option.posture.includes(state.posture) ? state.posture : '';

            content.querySelectorAll('[data-orientation]').forEach((button) => {
                const selected = button.dataset.orientation === orientation;
                button.classList.toggle('selected', selected);
                button.setAttribute('aria-pressed', selected ? 'true' : 'false');
            });

            if (footPick) footPick.textContent = `Selected: ${option.name}`;
            if (nextBtn) nextBtn.disabled = false;
            renderConfig();
            updateConfirmState();
        };
        const toggleChip = (button) => {
            const group = button?.dataset?.orientationChip;
            const value = button?.dataset?.chipValue;
            if (!group || !value) return;

            if (group === 'posture') {
                state.posture = value;
                content.querySelectorAll('[data-orientation-chip="posture"]').forEach((chip) => {
                    const selected = chip.dataset.chipValue === value;
                    chip.setAttribute('aria-pressed', selected ? 'true' : 'false');
                });
            } else {
                const key = group === 'lever' ? 'levers' : 'costs';
                const hasValue = state[key].includes(value);
                state[key] = hasValue
                    ? state[key].filter((item) => item !== value)
                    : [...state[key], value];
                button.setAttribute('aria-pressed', hasValue ? 'false' : 'true');
            }

            updateConfirmState();
        };
        const renderSummary = () => {
            const option = STRATEGIC_ORIENTATION_OPTIONS[state.selected];
            const setText = (selector, value) => {
                const element = content.querySelector(selector);
                if (element) element.textContent = value;
            };

            setText('#sumOrientation', option ? `${option.name} - ${option.tag}` : '-');
            setText('#sumLevers', formatStrategicOrientationSelection(state.levers, '-'));
            setText('#sumCosts', formatStrategicOrientationSelection(state.costs, '-'));
            setText('#sumPosture', state.posture || '-');
            setText('#sumRationale', state.rationale || 'No rationale provided.');
        };

        content.querySelectorAll('[data-orientation]').forEach((button) => {
            button.addEventListener('click', () => selectOrientation(button.dataset.orientation));
        });
        content.addEventListener('click', (event) => {
            const chip = event.target.closest('[data-orientation-chip]');
            if (chip && content.contains(chip)) {
                toggleChip(chip);
            }
        });
        rationaleEl?.addEventListener('input', () => {
            state.rationale = rationaleEl.value.trim();
        });
        content.querySelector('[data-orientation-nav="cancel"]')?.addEventListener('click', () => {
            modal?.close();
        });
        content.querySelector('[data-orientation-nav="back"]')?.addEventListener('click', () => {
            setStep(1);
        });
        content.querySelector('[data-orientation-nav="next"]')?.addEventListener('click', () => {
            if (!state.selected) {
                showToast({ message: 'Select one orientation before configuring it.', type: 'error' });
                return;
            }
            renderConfig();
            updateConfirmState();
            setStep(2);
        });
        content.querySelector('[data-orientation-nav="confirm"]')?.addEventListener('click', () => {
            state.rationale = rationaleEl?.value?.trim() || '';
            const error = this.validateStrategicOrientationData(state);
            if (error) {
                showToast({ message: error, type: 'error' });
                return;
            }
            renderSummary();
            setStep('confirm');
            this.submitStrategicOrientation(modal, state, { actionId, isEdit }).catch((err) => {
                logger.error('Failed to forward Strategic Orientation:', err);
            });
        });

        if (state.selected) {
            selectOrientation(state.selected);
        }
        renderConfig();
        updateConfirmState();
    }

    validateStrategicOrientationData(data = {}) {
        if (!data.selected || !STRATEGIC_ORIENTATION_OPTIONS[data.selected]) {
            return 'Select one orientation.';
        }
        if (!data.levers?.length) {
            return 'Select at least one primary lever.';
        }
        if (!data.costs?.length) {
            return 'Select at least one accepted cost.';
        }
        if (!data.posture) {
            return 'Select one posture.';
        }
        return null;
    }

    buildStrategicOrientationPayload(data = {}) {
        const option = STRATEGIC_ORIENTATION_OPTIONS[data.selected];
        const artifactType = this.getStrategicOrientationArtifactType();
        const isForecast = artifactType === STRATEGIC_ORIENTATION_ARTIFACT_TYPES.FORECAST;
        const forecastSummary = isForecast
            ? `Forecast: Blue will choose ${option.name} - ${option.tag}.`
            : '';

        return {
            goal: isForecast
                ? `${this.teamLabel} Forecast: Blue ${option.name}`
                : `Strategic Orientation: ${option.name}`,
            mechanism: STRATEGIC_ORIENTATION_ACTION_MECHANISM,
            sector: '',
            exposure_type: STRATEGIC_ORIENTATION_PERIOD,
            priority: 'HIGH',
            targets: [],
            expected_outcomes: isForecast ? forecastSummary : option.tag,
            ally_contingencies: serializeStrategicOrientationDetails({
                artifactType,
                team: this.teamId,
                orientation: option.id,
                primaryLevers: data.levers,
                acceptedCosts: data.costs,
                posture: data.posture,
                rationale: data.rationale,
                forecastSummary,
                scribeHandoff: STRATEGIC_ORIENTATION_SCRIBE_HANDOFF.FORWARDED
            })
        };
    }

    async submitStrategicOrientation(modal, data = {}, { actionId = null, isEdit = false } = {}) {
        if (!this.requireWriteAccess()) return;

        const error = this.validateStrategicOrientationData(data);
        if (error) {
            showToast({ message: error, type: 'error' });
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No session found', type: 'error' });
            return;
        }

        const option = STRATEGIC_ORIENTATION_OPTIONS[data.selected];
        const loader = showLoader({ message: 'Forwarding Strategic Orientation to Scribe...' });

        try {
            const payload = this.buildStrategicOrientationPayload(data);
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
                content: `Strategic Orientation forwarded to Scribe: ${action.goal || option.name}`,
                metadata: {
                    related_id: action.id,
                    role: this.role || this.getCurrentLeadRole(),
                    strategic_orientation: true,
                    artifact_type: this.getStrategicOrientationArtifactType(),
                    orientation: option.id,
                    next_step: 'scribe_project_then_submit_to_white_cell'
                },
                team: this.teamId,
                move: 1,
                phase: 1
            });
            timelineStore.updateFromServer('INSERT', forwardedTimelineEvent);

            showToast({ message: 'Strategic Orientation forwarded to Scribe', type: 'success' });
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

    createRedResponseContent(action = {}, { isEdit = false } = {}) {
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
                        ${isEdit ? 'Save Changes' : 'Submit for White Cell Review'}
                    </button>
                </div>
            </form>
        `;

        return content;
    }

    bindRedResponseModal(content, modal, { actionId = null, isEdit = false } = {}) {
        const form = content.querySelector('#redResponseForm');

        content.querySelector('[data-response-nav="cancel"]')?.addEventListener('click', () => {
            modal?.close();
        });

        content.querySelector('[data-response-nav="submit"]')?.addEventListener('click', () => {
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
        const content = this.createGreenProposalContent(action || {}, { isEdit });
        const modalRef = { current: null };

        modalRef.current = showModal({
            title: isEdit ? 'Edit Proposal' : 'New Proposal',
            content,
            size: 'xl'
        });

        this.bindGreenProposalModal(content, modalRef.current, {
            actionId: action?.id || null,
            isEdit
        });
    }

    createGreenProposalContent(action = {}, { isEdit = false } = {}) {
        const content = document.createElement('div');
        const viewModel = getProposalViewModel(action);

        const categoryIsCustom = Boolean(viewModel.category)
            && !PROPOSAL_CATEGORIES.includes(viewModel.category);
        const sectorIsCustom = Boolean(viewModel.focusSector)
            && !PROPOSAL_SECTORS.includes(viewModel.focusSector);
        const deliveryIsCustom = Boolean(viewModel.delivery)
            && !PROPOSAL_DELIVERIES.includes(viewModel.delivery);

        const categorySelectValue = categoryIsCustom ? 'Other' : (viewModel.category || '');
        const sectorSelectValue = sectorIsCustom ? 'Other' : (viewModel.focusSector || '');
        const deliverySelectValue = deliveryIsCustom ? 'Other' : (viewModel.delivery || '');

        const renderOptions = (values, selectedValue = '', placeholder = 'Select an option') => `
            <option value="">${placeholder}</option>
            ${values.map((value) => `
                <option value="${value}" ${selectedValue === value ? 'selected' : ''}>${value}</option>
            `).join('')}
        `;

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

                <div class="form-group">
                    <span class="form-label">Originator *</span>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-2);">
                        ${PROPOSAL_ORIGINATORS.map(renderOriginatorCheckbox).join('')}
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="proposalObjective">Objective *</label>
                    <textarea
                        id="proposalObjective"
                        class="form-input form-textarea"
                        rows="3"
                    >${this.escapeHtml(viewModel.objective)}</textarea>
                </div>

                <div class="section-grid section-grid-2">
                    <div class="form-group">
                        <label class="form-label" for="proposalCategory">Proposal Category *</label>
                        <select
                            id="proposalCategory"
                            class="form-select"
                            data-proposal-other-target="proposalCategoryOther"
                        >
                            ${renderOptions(PROPOSAL_CATEGORIES, categorySelectValue, 'Select category')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="proposalIntendedPartners">Intended Partner(s) *</label>
                        <input
                            id="proposalIntendedPartners"
                            class="form-input"
                            type="text"
                            placeholder="Country(s) or alliance(s)"
                            value="${this.escapeHtml(viewModel.intendedPartners)}"
                            maxlength="200"
                        >
                    </div>
                </div>

                <div
                    class="form-group"
                    id="proposalCategoryOtherGroup"
                    ${categorySelectValue === 'Other' ? '' : 'hidden'}
                >
                    <label class="form-label" for="proposalCategoryOther">Other Category *</label>
                    <input
                        id="proposalCategoryOther"
                        class="form-input"
                        type="text"
                        value="${this.escapeHtml(categoryIsCustom ? viewModel.category : '')}"
                        maxlength="120"
                    >
                </div>

                <div class="section-grid section-grid-2">
                    <div class="form-group">
                        <label class="form-label" for="proposalFocusSector">Focus Sector(s) *</label>
                        <select
                            id="proposalFocusSector"
                            class="form-select"
                            data-proposal-other-target="proposalFocusSectorOther"
                        >
                            ${renderOptions(PROPOSAL_SECTORS, sectorSelectValue, 'Select sector')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="proposalDelivery">Delivery *</label>
                        <select
                            id="proposalDelivery"
                            class="form-select"
                            data-proposal-other-target="proposalDeliveryOther"
                        >
                            ${renderOptions(PROPOSAL_DELIVERIES, deliverySelectValue, 'Select delivery')}
                        </select>
                    </div>
                </div>

                <div
                    class="form-group"
                    id="proposalFocusSectorOtherGroup"
                    ${sectorSelectValue === 'Other' ? '' : 'hidden'}
                >
                    <label class="form-label" for="proposalFocusSectorOther">Other Sector *</label>
                    <input
                        id="proposalFocusSectorOther"
                        class="form-input"
                        type="text"
                        value="${this.escapeHtml(sectorIsCustom ? viewModel.focusSector : '')}"
                        maxlength="120"
                    >
                </div>

                <div
                    class="form-group"
                    id="proposalDeliveryOtherGroup"
                    ${deliverySelectValue === 'Other' ? '' : 'hidden'}
                >
                    <label class="form-label" for="proposalDeliveryOther">Other Delivery *</label>
                    <input
                        id="proposalDeliveryOther"
                        class="form-input"
                        type="text"
                        value="${this.escapeHtml(deliveryIsCustom ? viewModel.delivery : '')}"
                        maxlength="120"
                    >
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
                        <button type="button" class="btn btn-primary" data-proposal-nav="sendBlue">Send to Blue Team</button>
                        <button type="button" class="btn btn-primary" data-proposal-nav="sendRed">Send to Red Team</button>
                    </div>
                </div>
            </form>
        `;

        return content;
    }

    bindGreenProposalModal(content, modal, { actionId = null, isEdit = false } = {}) {
        const form = content.querySelector(`#${this.teamId}ProposalForm`);

        const bindOtherToggle = (selectId, groupId, inputId) => {
            const select = form.querySelector(`#${selectId}`);
            const group = form.querySelector(`#${groupId}`);
            const input = form.querySelector(`#${inputId}`);
            if (!select || !group) return;

            select.addEventListener('change', () => {
                const showOther = select.value === 'Other';
                group.hidden = !showOther;
                if (!showOther && input) input.value = '';
            });
        };

        bindOtherToggle('proposalCategory', 'proposalCategoryOtherGroup', 'proposalCategoryOther');
        bindOtherToggle('proposalFocusSector', 'proposalFocusSectorOtherGroup', 'proposalFocusSectorOther');
        bindOtherToggle('proposalDelivery', 'proposalDeliveryOtherGroup', 'proposalDeliveryOther');

        content.querySelector('[data-proposal-nav="cancel"]')?.addEventListener('click', () => {
            modal?.close();
        });

        content.querySelector('[data-proposal-nav="sendBlue"]')?.addEventListener('click', () => {
            this.submitGreenProposal(modal, form, { recipientTeam: 'blue', actionId, isEdit }).catch((err) => {
                logger.error('Failed to send proposal to Blue Team:', err);
            });
        });

        content.querySelector('[data-proposal-nav="sendRed"]')?.addEventListener('click', () => {
            this.submitGreenProposal(modal, form, { recipientTeam: 'red', actionId, isEdit }).catch((err) => {
                logger.error('Failed to send proposal to Red Team:', err);
            });
        });

        form.querySelector('#proposalTitle')?.focus?.();
    }

    getGreenProposalData(form) {
        const originators = Array.from(
            form.querySelectorAll('[data-proposal-originator="true"]:checked')
        ).map((checkbox) => checkbox.value);

        const categorySelect = form.querySelector('#proposalCategory')?.value || '';
        const categoryOther = form.querySelector('#proposalCategoryOther')?.value?.trim() || '';
        const sectorSelect = form.querySelector('#proposalFocusSector')?.value || '';
        const sectorOther = form.querySelector('#proposalFocusSectorOther')?.value?.trim() || '';
        const deliverySelect = form.querySelector('#proposalDelivery')?.value || '';
        const deliveryOther = form.querySelector('#proposalDeliveryOther')?.value?.trim() || '';

        return {
            title: form.querySelector('#proposalTitle')?.value?.trim() || '',
            originators,
            objective: form.querySelector('#proposalObjective')?.value?.trim() || '',
            categorySelect,
            categoryOther,
            category: categorySelect === 'Other' ? categoryOther : categorySelect,
            intendedPartners: form.querySelector('#proposalIntendedPartners')?.value?.trim() || '',
            sectorSelect,
            sectorOther,
            focusSector: sectorSelect === 'Other' ? sectorOther : sectorSelect,
            deliverySelect,
            deliveryOther,
            delivery: deliverySelect === 'Other' ? deliveryOther : deliverySelect,
            timingAndConditions: form.querySelector('#proposalTimingConditions')?.value?.trim() || '',
            expectedOutcomes: form.querySelector('#proposalExpectedOutcomes')?.value?.trim() || ''
        };
    }

    validateGreenProposal(data) {
        if (!data.title) return 'Proposal Title is required.';
        if (!data.originators.length) return 'Select at least one Originator.';
        if (!data.objective) return 'Objective is required.';
        if (!data.categorySelect) return 'Proposal Category is required.';
        if (data.categorySelect === 'Other' && !data.categoryOther) return 'Please enter the custom category.';
        if (!data.intendedPartners) return 'Intended Partner(s) is required.';
        if (!data.sectorSelect) return 'Focus Sector is required.';
        if (data.sectorSelect === 'Other' && !data.sectorOther) return 'Please enter the custom sector.';
        if (!data.deliverySelect) return 'Delivery is required.';
        if (data.deliverySelect === 'Other' && !data.deliveryOther) return 'Please enter the custom delivery.';
        if (!data.timingAndConditions) return 'Timing & Conditions is required.';
        if (!data.expectedOutcomes) return 'Expected Outcome(s) is required.';
        return null;
    }

    buildGreenProposalPayload(data, { recipientTeam }) {
        return {
            goal: data.title,
            mechanism: PROPOSAL_ACTION_MECHANISM,
            sector: data.focusSector,
            exposure_type: null,
            priority: 'NORMAL',
            targets: [],
            expected_outcomes: data.expectedOutcomes,
            ally_contingencies: serializeProposalDetails({
                originators: data.originators,
                objective: data.objective,
                category: data.category,
                intendedPartners: data.intendedPartners,
                delivery: data.delivery,
                timingAndConditions: data.timingAndConditions,
                recipientTeam
            })
        };
    }

    async submitGreenProposal(modal, form, { recipientTeam, actionId = null, isEdit = false } = {}) {
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

        const recipientLabel = recipientTeam === 'blue' ? 'Blue Team' : 'Red Team';
        const loader = showLoader({ message: `Submitting proposal for White Cell review...` });

        try {
            const gameState = this.getCurrentGameState();
            const payload = this.buildGreenProposalPayload(data, { recipientTeam });

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
                type: 'PROPOSAL_SUBMITTED',
                content: `Proposal submitted for White Cell review (intended recipient: ${recipientLabel}): ${action.goal || 'Untitled proposal'}`,
                metadata: {
                    related_id: action.id,
                    role: this.role || this.getCurrentLeadRole(),
                    recipient_team: recipientTeam,
                    proposal: true,
                    review_stage: 'white_cell_review'
                },
                team: this.teamId,
                move: action.move ?? gameState.move ?? 1,
                phase: action.phase ?? gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({
                message: `Proposal submitted for White Cell review. It will be forwarded to ${recipientLabel} once approved.`,
                type: 'success'
            });
            modal?.close();
        } catch (err) {
            logger.error('Failed to send proposal:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to submit proposal. Check the form and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
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
            title: isEdit ? 'Edit Blue Team Action' : 'Take Action',
            content,
            size: 'xl'
        });

        this.bindBlueActionWizard(content, modalRef.current, {
            actionId: action?.id || null,
            sequenceContext
        });
    }

    createBlueActionWizardContent(action = {}, { isEdit = false, sequenceContext = null } = {}) {
        const content = document.createElement('div');
        const blueAction = getBlueActionViewModel(action);
        const actionTitle = action.goal || action.title || '';
        const selectedLeverValues = blueAction.levers.length
            ? blueAction.levers
            : (blueAction.lever ? [blueAction.lever] : []);
        const blueActionSectors = blueAction.sectors.length
            ? blueAction.sectors
            : (blueAction.sector ? [blueAction.sector] : []);
        const builtInSectorValues = BLUE_ACTION_SECTORS.filter((value) => value !== 'Other');
        const customSectorValue = blueActionSectors.find((value) => value && !builtInSectorValues.includes(value) && value !== 'Other') || '';
        const selectedSectorValues = [
            ...blueActionSectors.filter((value) => builtInSectorValues.includes(value)),
            ...(customSectorValue || blueActionSectors.includes('Other') ? ['Other'] : [])
        ];
        const implementationIsCustom = Boolean(blueAction.implementation)
            && !BLUE_ACTION_IMPLEMENTATIONS.includes(blueAction.implementation);
        const builtInTimelineValues = BLUE_ACTION_ENFORCEMENT_TIMELINES.filter((value) => value !== 'Other');
        const enforcementTimelineIsCustom = Boolean(blueAction.enforcementTimeline)
            && !builtInTimelineValues.includes(blueAction.enforcementTimeline);
        const implementationValue = implementationIsCustom
            ? 'Other'
            : (blueAction.implementation || '');
        const enforcementTimelineValue = enforcementTimelineIsCustom
            ? 'Other'
            : (blueAction.enforcementTimeline || '');
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

        content.innerHTML = `
            <form id="blueActionWizardForm" novalidate>
                <div style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4);">
                    <div>
                        <p class="text-xs text-gray-500" id="blueActionWizardStepLabel">Page 1 of ${BLUE_ACTION_WIZARD_PAGE_TOTAL}</p>
                        <h3 class="font-semibold" style="margin: 0;">Blue Team Action Builder</h3>
                        <p class="text-sm text-gray-500" id="blueActionWizardSequenceLabel" style="margin: var(--space-2) 0 0;">${this.escapeHtml(sequenceLabel)}</p>
                    </div>
                    <div aria-hidden="true" style="display: flex; gap: var(--space-2);">
                        ${Array.from({ length: BLUE_ACTION_WIZARD_PAGE_TOTAL }, (_, index) => `
                            <span
                                data-blue-action-step="${index}"
                                style="width: 28px; height: 4px; border-radius: 999px; background: ${index === 0 ? 'var(--color-primary-500)' : 'var(--color-gray-200)'};"
                            ></span>
                        `).join('')}
                    </div>
                </div>

                <section data-blue-action-page="0">
                    <div class="section-grid section-grid-2">
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
                            <label class="form-label" for="actionInstrument">Instrument of Power *</label>
                            <select id="actionInstrument" class="form-select">
                                ${renderOptions(BLUE_ACTION_INSTRUMENTS, action.mechanism || '', 'Select instrument')}
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="actionObjective">Objective *</label>
                        <textarea
                            id="actionObjective"
                            class="form-input form-textarea"
                            rows="4"
                            aria-describedby="actionObjectiveHint"
                        >${this.escapeHtml(blueAction.objective)}</textarea>
                        <p class="form-hint" id="actionObjectiveHint">What you intend this action to achieve.</p>
                    </div>

                    <div class="form-group">
                        <span class="form-label" id="actionLeversLabel">Levers *</span>
                        <div
                            class="form-check-grid"
                            role="group"
                            aria-labelledby="actionLeversLabel"
                            aria-describedby="actionLeversHint"
                        >
                            ${renderCheckboxOptions({
                                values: BLUE_ACTION_LEVERS,
                                selectedValues: selectedLeverValues,
                                dataAttribute: 'data-blue-action-checkbox',
                                group: 'lever',
                                idPrefix: 'actionLever'
                            })}
                        </div>
                        <p class="form-hint" id="actionLeversHint">Select one or more levers.</p>
                    </div>
                </section>

                <section data-blue-action-page="1" hidden>
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

                    <div class="section-grid section-grid-2">
                        <div class="form-group">
                            <label class="form-label" for="actionSupplyChainFocus">Supply Chain Focus *</label>
                            <select id="actionSupplyChainFocus" class="form-select">
                                ${renderOptions(BLUE_ACTION_SUPPLY_CHAIN_FOCUS, action.exposure_type || '', 'Select supply chain focus')}
                            </select>
                        </div>
                    </div>

                    <div
                        class="form-group"
                        id="actionBlueSectorOtherGroup"
                        ${selectedSectorValues.includes('Other') ? '' : 'hidden'}
                    >
                        <label class="form-label" for="actionBlueSectorOther">Other Sector *</label>
                        <input
                            id="actionBlueSectorOther"
                            class="form-input"
                            type="text"
                            value="${this.escapeHtml(customSectorValue)}"
                            maxlength="120"
                        >
                    </div>

                    <div class="section-grid section-grid-2">
                        <div class="form-group">
                            <label class="form-label" for="actionImplementation">Implementation *</label>
                            <select id="actionImplementation" class="form-select" data-blue-action-other-target="actionImplementationOther">
                                ${renderOptions(BLUE_ACTION_IMPLEMENTATIONS, implementationValue, 'Select implementation')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="actionEnforcementTimeline">Enforcement Timeline *</label>
                            <select
                                id="actionEnforcementTimeline"
                                class="form-select"
                                data-blue-action-other-target="actionEnforcementTimelineOther"
                            >
                                ${renderOptions(BLUE_ACTION_ENFORCEMENT_TIMELINES, enforcementTimelineValue, 'Select timeline')}
                            </select>
                        </div>
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

                    <div
                        class="form-group"
                        id="actionEnforcementTimelineOtherGroup"
                        ${enforcementTimelineValue === 'Other' ? '' : 'hidden'}
                    >
                        <label class="form-label" for="actionEnforcementTimelineOther">Other Enforcement Timeline *</label>
                        <input
                            id="actionEnforcementTimelineOther"
                            class="form-input"
                            type="text"
                            value="${this.escapeHtml(enforcementTimelineIsCustom ? blueAction.enforcementTimeline : '')}"
                            maxlength="120"
                        >
                    </div>

                    <div class="form-group">
                        <span class="form-label" id="actionFocusCountriesLabel">Focus Countries *</span>
                        <div
                            class="form-check-grid"
                            role="group"
                            aria-labelledby="actionFocusCountriesLabel"
                            aria-describedby="actionFocusCountriesHint"
                        >
                            ${renderCheckboxOptions({
                                values: BLUE_ACTION_COUNTRIES,
                                selectedValues: blueAction.focusCountries,
                                dataAttribute: 'data-blue-action-checkbox',
                                group: 'country',
                                idPrefix: 'actionFocusCountry'
                            })}
                        </div>
                        <p class="form-hint" id="actionFocusCountriesHint">Select one or more countries.</p>
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
                </section>

                <section data-blue-action-page="2" hidden>
                    <div class="card card-bordered" style="padding: var(--space-4); margin-bottom: var(--space-4);">
                        <h4 class="font-semibold" style="margin: 0 0 var(--space-2);">Review</h4>
                        <div id="blueActionSummary" class="text-sm text-gray-500"></div>
                    </div>

                    <div class="section-grid section-grid-2">
                        <div class="card card-bordered" style="padding: var(--space-4);">
                            <h4 class="font-semibold" style="margin: 0 0 var(--space-3);">Coordinated</h4>
                            <div style="display: grid; gap: var(--space-3);">
                                ${renderCheckboxOptions({
                                    values: BLUE_ACTION_COORDINATED_OPTIONS,
                                    selectedValues: blueAction.coordinated,
                                    dataAttribute: 'data-blue-action-checkbox',
                                    group: 'coordinated',
                                    idPrefix: 'coordinated'
                                })}
                            </div>
                        </div>
                        <div class="card card-bordered" style="padding: var(--space-4);">
                            <h4 class="font-semibold" style="margin: 0 0 var(--space-3);">Informed/Engaged</h4>
                            <div style="display: grid; gap: var(--space-3);">
                                ${renderCheckboxOptions({
                                    values: BLUE_ACTION_INFORMED_OPTIONS,
                                    selectedValues: blueAction.informed,
                                    dataAttribute: 'data-blue-action-checkbox',
                                    group: 'informed',
                                    idPrefix: 'informed'
                                })}
                            </div>
                        </div>
                    </div>
                </section>

                <div style="display: flex; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--color-border);">
                    <button type="button" class="btn btn-secondary" data-blue-action-nav="cancel">Cancel</button>
                    <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; justify-content: flex-end;">
                        <button type="button" class="btn btn-secondary" data-blue-action-nav="back">Back</button>
                        <button type="button" class="btn btn-secondary" data-blue-action-nav="next">Next</button>
                        ${isEdit
                ? '<button type="button" class="btn btn-primary" data-blue-action-nav="saveChanges">Save Changes</button>'
                : `
                                <button type="button" class="btn btn-secondary" data-blue-action-nav="saveDraft">Save Draft</button>
                                <button type="button" class="btn btn-primary" data-blue-action-nav="submit">Forward to Scribe</button>
                            `}
                    </div>
                </div>
            </form>
        `;

        return content;
    }

    bindBlueActionWizard(content, modal, { actionId = null, sequenceContext = null } = {}) {
        const form = content.querySelector('#blueActionWizardForm');
        const pages = Array.from(content.querySelectorAll('[data-blue-action-page]'));
        const stepLabel = content.querySelector('#blueActionWizardStepLabel');
        const sequenceLabel = content.querySelector('#blueActionWizardSequenceLabel');
        const progressSteps = Array.from(content.querySelectorAll('[data-blue-action-step]'));
        const backButton = content.querySelector('[data-blue-action-nav="back"]');
        const nextButton = content.querySelector('[data-blue-action-nav="next"]');
        const saveDraftButton = content.querySelector('[data-blue-action-nav="saveDraft"]');
        const submitButton = content.querySelector('[data-blue-action-nav="submit"]');
        const saveChangesButton = content.querySelector('[data-blue-action-nav="saveChanges"]');
        const summary = content.querySelector('#blueActionSummary');
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

        const updateSummary = () => {
            const wizardData = this.getBlueActionWizardData(form);
            summary.innerHTML = `
                <p><strong>Sequence:</strong> ${this.escapeHtml(sequenceContext?.label || '')}</p>
                <p><strong>Title:</strong> ${this.escapeHtml(wizardData.actionTitle || 'Not specified')}</p>
                <p><strong>Objective:</strong> ${this.escapeHtml(wizardData.objective || 'Not specified')}</p>
                <p><strong>Instrument:</strong> ${this.escapeHtml(wizardData.instrumentOfPower || 'Not specified')} | <strong>Levers:</strong> ${this.escapeHtml(formatBlueActionSelection(wizardData.levers, 'Not specified'))}</p>
                <p><strong>Sectors:</strong> ${this.escapeHtml(formatBlueActionSelection(wizardData.sectors, 'Not specified'))} | <strong>Supply Chain Focus:</strong> ${this.escapeHtml(wizardData.supplyChainFocus || 'Not specified')}</p>
                <p><strong>Implementation:</strong> ${this.escapeHtml(wizardData.implementation || 'Not specified')} | <strong>Timeline:</strong> ${this.escapeHtml(wizardData.enforcementTimeline || 'Not specified')}</p>
                ${wizardData.implementationSelectValue === 'Legislative' ? `
                    <p><strong>Legislative Route:</strong> ${this.escapeHtml(formatBlueActionSelection(wizardData.legislativeOptions, 'None selected'))}</p>
                ` : ''}
                <p><strong>Focus Countries:</strong> ${this.escapeHtml(formatBlueActionSelection(wizardData.focusCountries))}</p>
                <p><strong>Expected Outcomes:</strong> ${this.escapeHtml(wizardData.expectedOutcomes || 'Not specified')}</p>
            `;
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
                stepLabel.textContent = `Page ${currentPage + 1} of ${BLUE_ACTION_WIZARD_PAGE_TOTAL}`;
            }

            if (sequenceLabel && sequenceContext?.label) {
                sequenceLabel.textContent = sequenceContext.label;
            }

            if (backButton) {
                backButton.hidden = currentPage === 0;
            }

            if (nextButton) {
                nextButton.hidden = currentPage === BLUE_ACTION_WIZARD_PAGE_TOTAL - 1;
            }

            if (saveDraftButton) {
                saveDraftButton.hidden = false;
            }

            if (submitButton) {
                submitButton.hidden = currentPage !== BLUE_ACTION_WIZARD_PAGE_TOTAL - 1;
            }

            if (saveChangesButton) {
                saveChangesButton.hidden = false;
            }

            if (currentPage === BLUE_ACTION_WIZARD_PAGE_TOTAL - 1) {
                updateSummary();
            }

            focusCurrentPage();
        };

        const updateSectorOtherField = () => {
            const input = form.querySelector('#actionBlueSectorOther');
            const group = form.querySelector('#actionBlueSectorOtherGroup');
            const showOther = getCheckedValues(form, '[data-blue-action-checkbox="sector"]').includes('Other');

            if (group) {
                group.hidden = !showOther;
            }

            if (input && !showOther) {
                input.value = '';
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

        form.querySelectorAll('[data-blue-action-checkbox="sector"]').forEach((checkbox) => {
            checkbox.addEventListener('change', updateSectorOtherField);
        });
        form.querySelector('#actionImplementation')?.addEventListener('change', () => {
            updateImplementationDependentFields();
        });
        form.querySelector('#actionEnforcementTimeline')?.addEventListener('change', () => {
            updateOtherField('actionEnforcementTimeline', 'actionEnforcementTimelineOther', 'actionEnforcementTimelineOtherGroup');
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

            currentPage = Math.min(BLUE_ACTION_WIZARD_PAGE_TOTAL - 1, currentPage + 1);
            renderPage();
        });

        saveDraftButton?.addEventListener('click', () => {
            this.saveBlueActionDraft(modal, form, currentPage).catch((error) => {
                logger.error('Failed to save Blue team draft action:', error);
            });
        });

        submitButton?.addEventListener('click', () => {
            this.forwardBlueActionFromWizard(modal, form).catch((error) => {
                logger.error('Failed to forward Blue team action from wizard:', error);
            });
        });

        saveChangesButton?.addEventListener('click', () => {
            this.saveBlueActionChanges(modal, form, actionId, currentPage).catch((error) => {
                logger.error('Failed to update Blue team draft action:', error);
            });
        });

        renderPage();
    }

    getBlueActionWizardData(form) {
        const levers = getCheckedValues(form, '[data-blue-action-checkbox="lever"]');
        const selectedSectorValues = getCheckedValues(form, '[data-blue-action-checkbox="sector"]');
        const selectedLegislativeOptions = getCheckedValues(form, '[data-blue-action-checkbox="legislative"]');
        const focusCountries = getCheckedValues(form, '[data-blue-action-checkbox="country"]');
        const coordinated = getCheckedValues(form, '[data-blue-action-checkbox="coordinated"]');
        const informed = getCheckedValues(form, '[data-blue-action-checkbox="informed"]');

        const implementationSelectValue = form.querySelector('#actionImplementation')?.value || '';
        const enforcementTimelineSelectValue = form.querySelector('#actionEnforcementTimeline')?.value || '';
        const sectorOther = form.querySelector('#actionBlueSectorOther')?.value?.trim() || '';
        const implementationOther = form.querySelector('#actionImplementationOther')?.value?.trim() || '';
        const enforcementTimelineOther = form.querySelector('#actionEnforcementTimelineOther')?.value?.trim() || '';
        const sectors = [
            ...selectedSectorValues.filter((value) => value !== 'Other'),
            ...(selectedSectorValues.includes('Other') && sectorOther ? [sectorOther] : [])
        ];

        return {
            actionTitle: form.querySelector('#actionTitle')?.value?.trim() || '',
            objective: form.querySelector('#actionObjective')?.value?.trim() || '',
            instrumentOfPower: form.querySelector('#actionInstrument')?.value || '',
            lever: levers[0] || '',
            levers,
            sector: sectors[0] || '',
            sectors,
            selectedSectorValues,
            sectorOther,
            supplyChainFocus: form.querySelector('#actionSupplyChainFocus')?.value || '',
            implementation: implementationSelectValue === 'Other' ? implementationOther : implementationSelectValue,
            implementationSelectValue,
            implementationOther,
            legislativeOptions: implementationSelectValue === 'Legislative' ? selectedLegislativeOptions : [],
            focusCountries,
            enforcementTimeline: enforcementTimelineSelectValue === 'Other'
                ? enforcementTimelineOther
                : enforcementTimelineSelectValue,
            enforcementTimelineSelectValue,
            enforcementTimelineOther,
            expectedOutcomes: form.querySelector('#actionExpectedOutcomes')?.value?.trim() || '',
            coordinated,
            informed
        };
    }

    hasBlueActionDraftContent(wizardData) {
        return Boolean(
            wizardData.actionTitle
            || wizardData.objective
            || wizardData.instrumentOfPower
            || wizardData.levers.length
            || wizardData.sectors.length
            || wizardData.sectorOther
            || wizardData.supplyChainFocus
            || wizardData.implementation
            || wizardData.implementationOther
            || wizardData.legislativeOptions.length
            || wizardData.focusCountries.length
            || wizardData.enforcementTimeline
            || wizardData.enforcementTimelineOther
            || wizardData.expectedOutcomes
            || wizardData.coordinated.length
            || wizardData.informed.length
        );
    }

    getBlueActionDraftSaveValidationError(wizardData, currentPage = BLUE_ACTION_WIZARD_PAGE_TOTAL - 1) {
        if (!this.hasBlueActionDraftContent(wizardData)) {
            return 'Add at least one action detail before saving a draft.';
        }

        if (currentPage <= 0) {
            return null;
        }

        // Mid-wizard saves should only enforce pages the facilitator has already completed.
        const lastCompletedPage = Math.min(currentPage - 1, BLUE_ACTION_WIZARD_PAGE_TOTAL - 2);

        for (let pageIndex = 0; pageIndex <= lastCompletedPage; pageIndex += 1) {
            const error = this.validateBlueActionWizardPage(wizardData, pageIndex);
            if (error) {
                return error;
            }
        }

        return null;
    }

    validateBlueActionWizardPage(wizardData, pageIndex) {
        if (pageIndex === 0) {
            if (!wizardData.actionTitle) return 'Action Title is required.';
            if (!wizardData.objective) return 'Objective is required.';
            if (!wizardData.instrumentOfPower) return 'Instrument of Power is required.';
            if (!wizardData.levers.length) return 'Select at least one lever.';
        }

        if (pageIndex === 1) {
            if (!wizardData.selectedSectorValues.length) return 'Select at least one sector.';
            if (wizardData.selectedSectorValues.includes('Other') && !wizardData.sectorOther) {
                return 'Please enter the custom sector.';
            }
            if (!wizardData.supplyChainFocus) return 'Supply Chain Focus is required.';
            if (!wizardData.implementationSelectValue) return 'Implementation is required.';
            if (wizardData.implementationSelectValue === 'Other' && !wizardData.implementationOther) {
                return 'Please enter the custom implementation.';
            }
            if (!wizardData.focusCountries.length) return 'Select at least one focus country.';
            if (!wizardData.enforcementTimelineSelectValue) return 'Enforcement Timeline is required.';
            if (wizardData.enforcementTimelineSelectValue === 'Other' && !wizardData.enforcementTimelineOther) {
                return 'Please enter the custom enforcement timeline.';
            }
            if (!wizardData.expectedOutcomes) return 'Expected Outcomes is required.';
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
            exposure_type: wizardData.supplyChainFocus,
            priority: 'NORMAL',
            targets: wizardData.focusCountries,
            expected_outcomes: wizardData.expectedOutcomes,
            ally_contingencies: serializeBlueActionDetails({
                objective: wizardData.objective,
                levers: wizardData.levers,
                sectors: wizardData.sectors,
                implementation: wizardData.implementation,
                legislativeOptions: wizardData.legislativeOptions,
                enforcementTimeline: wizardData.enforcementTimeline,
                scribeHandoff,
                coordinated: wizardData.coordinated,
                informed: wizardData.informed
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
                levers: actionViewModel.levers,
                sectors: actionViewModel.sectors,
                implementation: actionViewModel.implementation,
                legislativeOptions: actionViewModel.legislativeOptions,
                enforcementTimeline: actionViewModel.enforcementTimeline,
                scribeHandoff: BLUE_ACTION_SCRIBE_HANDOFF.FORWARDED,
                coordinatedDecision: actionViewModel.coordinatedDecision,
                coordinated: actionViewModel.coordinated,
                informedEngagedDecision: actionViewModel.informedEngagedDecision,
                informed: actionViewModel.informed
            })
        };
    }

    async saveBlueActionDraft(modal, form, currentPage = BLUE_ACTION_WIZARD_PAGE_TOTAL - 1) {
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
            logger.error('Failed to create Blue team draft action:', err);
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

    async saveBlueActionChanges(modal, form, actionId, currentPage = BLUE_ACTION_WIZARD_PAGE_TOTAL - 1) {
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
            logger.error('Failed to update Blue team draft action:', err);
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
        const pageZeroError = this.validateBlueActionWizardPage(wizardData, 0);
        const pageOneError = this.validateBlueActionWizardPage(wizardData, 1);
        const sessionId = sessionStore.getSessionId();
        const sequenceContext = this.getBlueActionSequenceContext();

        if (pageZeroError || pageOneError) {
            showToast({ message: pageZeroError || pageOneError, type: 'error' });
            return;
        }

        if (!sessionId) {
            showToast({ message: 'No session found', type: 'error' });
            return;
        }

        const confirmed = await confirmModal({
            title: 'Confirm Action',
            message: `Forward ${sequenceContext.label} to the Scribe? The Scribe will project it and submit the completed action to White Cell.`,
            confirmLabel: 'Forward',
            variant: 'primary'
        });

        if (!confirmed) {
            return;
        }

        const loader = showLoader({ message: 'Forwarding action to Scribe...' });

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
                content: `Action forwarded to Scribe: ${draftAction.goal || 'Untitled action'}`,
                metadata: {
                    related_id: draftAction.id,
                    role: this.role || this.getCurrentLeadRole(),
                    next_step: 'scribe_submit_to_white_cell'
                },
                team: this.teamId,
                move: draftAction.move ?? 1,
                phase: draftAction.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', forwardedTimelineEvent);

            showToast({ message: 'Action forwarded to Scribe', type: 'success' });
            modal?.close();
        } catch (err) {
            logger.error('Failed to forward Blue team action:', err);
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
            showToast({ message: 'Only draft actions can be forwarded to the Scribe.', type: 'error' });
            return;
        }

        const sequenceLabel = this.isBlueTeamActionWizardEnabled(action)
            ? this.getBlueActionSequenceContext(action).label
            : 'this draft';

        const confirmed = await confirmModal({
            title: 'Forward Action to Scribe',
            message: `Forward ${sequenceLabel} to the Scribe? The Scribe will project it and submit the completed action to White Cell.`,
            confirmLabel: 'Forward',
            variant: 'primary'
        });

        if (!confirmed) return;
        await this.forwardActionToScribe(action.id);
    }

    async forwardActionToScribe(actionId) {
        if (!this.requireWriteAccess()) return;
        const loader = showLoader({ message: 'Forwarding action to Scribe...' });

        try {
            const existingAction = actionsStore.getById(actionId)
                || this.actions.find((candidate) => candidate?.id === actionId);
            const action = await database.updateDraftAction(
                actionId,
                existingAction ? this.buildForwardedBlueActionUpdate(existingAction) : {}
            );
            actionsStore.updateFromServer('UPDATE', action);

            const timelineEvent = await database.createTimelineEvent({
                session_id: action.session_id,
                type: 'ACTION_FORWARDED_TO_SCRIBE',
                content: `Action forwarded to Scribe: ${action.goal || 'Untitled action'}`,
                metadata: {
                    related_id: action.id,
                    role: this.role || this.getCurrentLeadRole(),
                    next_step: 'scribe_submit_to_white_cell'
                },
                team: this.teamId,
                move: action.move ?? 1,
                phase: action.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: 'Action forwarded to Scribe', type: 'success' });
        } catch (err) {
            logger.error('Failed to forward action:', err);
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

    async confirmDeleteAction(action) {
        if (!this.requireWriteAccess()) return;
        if (!canDeleteAction(action)) {
            showToast({ message: 'Only draft actions can be deleted.', type: 'error' });
            return;
        }

        const confirmed = await confirmModal({
            title: 'Delete Draft Action',
            message: 'Delete this draft action? This cannot be undone.',
            confirmLabel: 'Delete',
            variant: 'danger'
        });

        if (!confirmed) return;
        await this.deleteAction(action.id);
    }

    async deleteAction(actionId) {
        if (!this.requireWriteAccess()) return;
        const loader = showLoader({ message: 'Deleting draft...' });

        try {
            await database.deleteDraftAction(actionId);
            actionsStore.updateFromServer('DELETE', { id: actionId });
            showToast({ message: 'Draft action deleted', type: 'success' });
        } catch (err) {
            logger.error('Failed to delete action:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to delete draft action. Refresh the action list and try again.'
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
                        ${createStatusBadge(rfi.status || 'pending').outerHTML}
                        ${createPriorityBadge(rfi.priority || 'NORMAL').outerHTML}
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

    showCreateRfiModal() {
        if (!this.requireWriteAccess()) return;

        const content = document.createElement('div');
        const priorityOptions = ENUMS.PRIORITY
            .map((value) => `<option value="${value}">${value}</option>`)
            .join('');
        content.innerHTML = `
            <form id="rfiForm">
                <div class="form-group">
                    <label class="form-label" for="rfiQuestion">Question *</label>
                    <textarea id="rfiQuestion" class="form-input form-textarea" rows="4" required></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label" for="rfiPriority">Priority *</label>
                    <select id="rfiPriority" class="form-select" required>
                        <option value="">Select priority</option>
                        ${priorityOptions}
                    </select>
                </div>
                <div class="form-group">
                    <span class="form-label" id="rfiCategoriesLabel">Categories *</span>
                    <div
                        class="form-check-grid"
                        role="group"
                        aria-labelledby="rfiCategoriesLabel"
                        aria-describedby="rfiCategoriesHint"
                    >
                        ${renderCheckboxOptions({
                            values: ENUMS.RFI_CATEGORIES,
                            dataAttribute: 'data-rfi-checkbox',
                            group: 'category',
                            idPrefix: 'rfiCategory'
                        })}
                    </div>
                    <p class="form-hint" id="rfiCategoriesHint">Select all categories that apply.</p>
                </div>
                <div class="form-group">
                    <label class="form-label" for="rfiContext">Context</label>
                    <textarea id="rfiContext" class="form-input form-textarea" rows="3"></textarea>
                </div>
            </form>
        `;

        const modalRef = { current: null };
        modalRef.current = showModal({
            title: 'Submit Request for Information',
            content,
            size: 'md',
            buttons: [
                {
                    label: 'Cancel',
                    variant: 'secondary',
                    onClick: () => {}
                },
                {
                    label: 'Submit RFI',
                    variant: 'primary',
                    onClick: () => {
                        this.handleCreateRfi(modalRef.current).catch((err) => {
                            logger.error('Failed to submit RFI:', err);
                        });
                        return false;
                    }
                }
            ]
        });
    }

    async handleCreateRfi(modal) {
        if (!this.requireWriteAccess()) return;

        const question = document.getElementById('rfiQuestion')?.value?.trim();
        const context = document.getElementById('rfiContext')?.value?.trim();
        const priority = document.getElementById('rfiPriority')?.value;
        const categories = getCheckedValues(document, '[data-rfi-checkbox="category"]');

        if (!question) {
            showToast({ message: 'Question is required', type: 'error' });
            return;
        }

        if (!priority) {
            showToast({ message: 'Priority is required', type: 'error' });
            return;
        }

        if (!categories.length) {
            showToast({ message: 'Select at least one category', type: 'error' });
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        const loader = showLoader({ message: 'Submitting RFI...' });

        try {
            const gameState = this.getCurrentGameState();
            const query = context ? `${question}\n\nContext: ${context}` : question;
            const rfi = await database.createRequest({
                session_id: sessionId,
                team: this.teamId,
                client_id: sessionStore.getClientId(),
                query,
                priority,
                categories,
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            requestsStore.updateFromServer('INSERT', rfi);

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'RFI_CREATED',
                content: `${this.teamLabel} submitted an RFI to White Cell.`,
                metadata: {
                    related_id: rfi.id,
                    role: this.role || this.getCurrentLeadRole()
                },
                team: this.teamId,
                move: rfi.move ?? 1,
                phase: rfi.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: 'RFI submitted successfully', type: 'success' });
            modal?.close();
        } catch (err) {
            logger.error('Failed to submit RFI:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to submit RFI. Check the form and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
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
        this.storeUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
        this.storeUnsubscribers = [];
    }
}

const facilitatorController = new FacilitatorController();

const shouldAutoInitFacilitator = typeof document !== 'undefined' &&
    typeof window !== 'undefined' &&
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
