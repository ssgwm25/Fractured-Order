/**
 * White Cell Role Controller
 * ESG Economic Statecraft Simulation Platform v2.0
 */

import { sessionStore } from '../stores/session.js';
import { gameStateStore } from '../stores/gameState.js';
import { actionsStore } from '../stores/actions.js';
import { requestsStore } from '../stores/requests.js';
import { timelineStore } from '../stores/timeline.js';
import { participantsStore } from '../stores/participants.js';
import { communicationsStore } from '../stores/communications.js';
import { database } from '../services/database.js';
import { syncService } from '../services/sync.js';
import { createLogger } from '../utils/logger.js';
import { mountFollowAlong } from '../features/onboarding/followAlong.js';
import { showToast } from '../components/ui/Toast.js';
import { showLoader, hideLoader } from '../components/ui/Loader.js';
import { showModal, confirmModal } from '../components/ui/Modal.js';
import { createBadge, createRoleBadge, createStatusBadge, createPriorityBadge } from '../components/ui/Badge.js';
import {
    formatActionSequenceLabel,
    formatBlueActionSelection,
    getActionSequenceNumber,
    getBlueActionViewModel
} from '../features/actions/blueActionDetails.js';
import {
    formatStrategicOrientationSelection,
    getStrategicOrientationCompletion,
    getStrategicOrientationViewModel,
    isStrategicOrientationAction
} from '../features/actions/strategicOrientationDetails.js';
import {
    parseProposalDetails,
    getProposalViewModel,
    formatProposalSelection
} from '../features/actions/proposalDetails.js';
import {
    PROPOSAL_RECIPIENT_STATUSES,
    formatProposalRecipientStatus,
    getProposalRecipientEntry,
    getProposalRecipientStatus,
    getProposalResponseEntry
} from '../features/actions/proposalRecipientState.js';
import {
    buildJsonExportPayload,
    buildResearchExportBundle,
    downloadJsonData,
    downloadCsv,
    downloadResearchExportArchive,
    exportSessionActionsCsv,
    exportSessionRequestsCsv,
    exportSessionTimelineCsv,
    exportSessionParticipantsCsv,
    openResearchPrintWindow
} from '../features/export/index.js';
import { formatDateTime, formatRelativeTime } from '../utils/formatting.js';
import {
    applyHeaderGameStateDisplay,
    getHeaderGameStateDisplay
} from '../utils/gameStateDisplay.js';
import {
    TIMER_ALLOCATION_MARKS,
    buildDefaultTimerAllocations,
    getTimerAllocationSeconds,
    minutesToAllocationSeconds,
    normalizeTimerAllocations,
    resolveGameStateTimerMark,
    secondsToWholeMinutes
} from '../utils/timerAllocations.js';
import { CONFIG } from '../core/config.js';
import { ENUMS, canAdjudicateAction, getPhaseLabel, isAdjudicatedAction, isDraftAction } from '../core/enums.js';
import { getUserMessage, ValidationError } from '../core/errors.js';
import { buildAppPath, navigateToApp } from '../core/navigation.js';
import {
    OPERATOR_SURFACES,
    ROLE_SURFACES,
    TEAM_OPTIONS,
    WHITE_CELL_OPERATOR_ROLES,
    buildTeamRole,
    getRoleDisplayName,
    parseTeamRole,
    resolveTeamContext
} from '../core/teamContext.js';
import {
    WHITE_CELL_UPDATE_KINDS,
    buildWhiteCellRecipientMetadata,
    getWhiteCellCommunicationUpdateKind,
    isTeamCaptureTimelineEvent
} from '../features/communications/targeting.js';
import {
    buildDefaultScribeDeckPath,
    DEFAULT_SCRIBE_DECK_LABEL,
    DEFAULT_SCRIBE_DECK_PATH,
    SCRIBE_DECK_ASSIGNMENT_CONTENT_KIND,
    getScribeDeckAssignmentDetails,
    normalizeUploadedScribeDeckFileName,
    normalizeUploadedScribeDeckLabel,
    normalizeScribeDeckLabel,
    normalizeScribeDeckPath,
    parseScribeDeckHtml,
    SCRIBE_DECK_SOURCE_REPO,
    SCRIBE_DECK_SOURCE_UPLOAD
} from '../features/scribe/deckConfig.js';
import {
    buildUploadedScribeDeckStorageKey,
    saveUploadedScribeDeck
} from '../features/scribe/deckStorage.js';
import {
    buildDefaultPluginState,
    getRegisteredPlugins,
    isSessionRecorderNoticeActive,
    isPluginVisible,
    normalizePluginState,
    setPluginEnabledInState
} from '../features/plugins/registry.js';
import {
    TRIBE_STREET_JOURNAL_EMBED_URL,
    createTribeStreetJournalEmbedMarkup
} from '../features/tribeStreetJournalEmbed.js';
import {
    getNotetakerSaveTimelineDetailItems,
    getNotetakerTimelineScopeLabel,
    isNotetakerSaveTimelineEvent
} from '../features/notetaker/timelineDetails.js';
import { SESSION_CODE_MAX_LENGTH } from '../utils/validation.js';

const logger = createLogger('WhiteCell');
const WHITE_CELL_ALL_TEAMS_RECIPIENT = 'all';
const WHITE_CELL_RED_TEAM_RECIPIENT = 'red';
const WHITE_CELL_SCRIBE_DECK_ASSIGNMENT_SOURCE = 'scribe_deck_assignment';
const WHITE_CELL_NOTIFICATIONS_MUTED_STORAGE_KEY = 'whitecell:notifications-muted';
export const WHITE_CELL_SCRIBE_DECK_FETCH_TIMEOUT_MS = 10000;
const WHITE_CELL_REVIEW_GROUP_RENDER_LIMIT = 40;
const WHITE_CELL_ADJUDICATION_RENDER_LIMIT = 50;
export const WHITE_CELL_RFI_RENDER_LIMIT = 50;
const WHITE_CELL_TRIBE_STREET_JOURNAL_RENDER_LIMIT = 60;
const WHITE_CELL_VERBA_AI_RENDER_LIMIT = 60;
const WHITE_CELL_COMMUNICATION_RENDER_LIMIT = 60;
const WHITE_CELL_TIMELINE_RENDER_LIMIT = 50;
const TEAM_LABELS = Object.freeze(
    Object.fromEntries(TEAM_OPTIONS.map((team) => [team.id, team.label]))
);
const PROPOSAL_TEAM_IDS = new Set(['green', 'industry']);
const WHITE_CELL_FILTER_TEAM_ORDER = Object.freeze([
    ...TEAM_OPTIONS.map((team) => team.id),
    'white_cell',
    'observer',
    'system'
]);
const WHITE_CELL_FILTER_ROLE_ORDER = Object.freeze([
    ROLE_SURFACES.FACILITATOR,
    ROLE_SURFACES.SCRIBE,
    ROLE_SURFACES.NOTETAKER,
    ROLE_SURFACES.WHITECELL,
    ROLE_SURFACES.VIEWER,
    'system'
]);
const WHITE_CELL_TIMELINE_ACTIVITY_TYPE_ORDER = Object.freeze([
    'PHASE_CHANGE',
    'MOVE_CHANGE',
    'TIMER_START',
    'TIMER_PAUSE',
    'TIMER_RESET',
    'ACTION_CREATED',
    'ACTION_SUBMITTED',
    'ACTION_ADJUDICATED',
    'STRATEGIC_ORIENTATION_FORWARDED_TO_SCRIBE',
    'STRATEGIC_ORIENTATION_SUBMITTED',
    'PROPOSAL_SUBMITTED',
    'PROPOSAL_FORWARDED',
    'PROPOSAL_RESPONSE',
    'PROPOSAL_RESPONDED',
    'RFI_CREATED',
    'RFI_ANSWERED',
    'INJECT',
    'ANNOUNCEMENT',
    'GUIDANCE',
    'NOTE',
    'MOMENT',
    'QUOTE',
    'PARTICIPANT_JOINED',
    'PARTICIPANT_LEFT'
]);
const WHITE_CELL_TIMELINE_FACILITATOR_TYPES = Object.freeze([
    'ACTION_CREATED',
    'ACTION_SUBMITTED',
    'STRATEGIC_ORIENTATION_FORWARDED_TO_SCRIBE',
    'STRATEGIC_ORIENTATION_SUBMITTED',
    'PROPOSAL_SUBMITTED',
    'RFI_CREATED'
]);
const WHITE_CELL_TIMELINE_NOTETAKER_TYPES = Object.freeze([
    'NOTE',
    'MOMENT',
    'QUOTE'
]);
const PROPOSAL_REVIEW_DECISIONS = Object.freeze({
    FORWARD_TO_RECIPIENT: 'forward_to_recipient',
    REQUEST_CHANGES: 'request_changes',
    REJECT: 'reject'
});

function isProposalTeamId(teamId) {
    return PROPOSAL_TEAM_IDS.has(teamId);
}

function readWhiteCellNotificationsMutedPreference() {
    try {
        return globalThis.window?.localStorage?.getItem(WHITE_CELL_NOTIFICATIONS_MUTED_STORAGE_KEY) === 'true';
    } catch (_error) {
        return false;
    }
}

function writeWhiteCellNotificationsMutedPreference(isMuted = false) {
    try {
        globalThis.window?.localStorage?.setItem(WHITE_CELL_NOTIFICATIONS_MUTED_STORAGE_KEY, isMuted ? 'true' : 'false');
    } catch (_error) {
        // Notification muting is a UI preference; storage failures must not block the operator console.
    }
}

function createScribeDeckValidationTimeoutError() {
    return new ValidationError(
        'Facilitator deck validation timed out. Check the deck path and try again.',
        'deckPath'
    );
}

async function fetchScribeDeckHtmlWithTimeout(deckPath, {
    timeoutMs = WHITE_CELL_SCRIBE_DECK_FETCH_TIMEOUT_MS
} = {}) {
    const controller = typeof globalThis.AbortController === 'function'
        ? new globalThis.AbortController()
        : null;
    const fetchOptions = { credentials: 'same-origin' };
    if (controller) {
        fetchOptions.signal = controller.signal;
    }

    let timeoutId = null;
    let didTimeout = false;
    const timeoutError = createScribeDeckValidationTimeoutError();
    const timeoutPromise = new Promise((_resolve, reject) => {
        timeoutId = setTimeout(() => {
            didTimeout = true;
            try {
                controller?.abort?.();
            } catch (_error) {
                // Ignore abort errors; the timeout error below is the operator-facing failure.
            }
            reject(timeoutError);
        }, timeoutMs);
    });

    const fetchPromise = (async () => {
        const response = await fetch(buildAppPath(deckPath), fetchOptions);
        if (!response.ok) {
            throw new Error(`Deck fetch failed with status ${response.status}.`);
        }

        return response.text();
    })();

    try {
        return await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
        if (didTimeout || error?.name === 'AbortError') {
            throw timeoutError;
        }
        throw error;
    } finally {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
    }
}

export const WHITE_CELL_DOM_IDS = [
    'whiteCellNotificationsMuteBtn',
    'startTimerBtn',
    'pauseTimerBtn',
    'resetTimerBtn',
    'prevPhaseBtn',
    'nextPhaseBtn',
    'prevMoveBtn',
    'nextMoveBtn',
    'currentMove',
    'currentPhase',
    'moveLabel',
    'phaseLabel',
    'headerMove',
    'headerPhase',
    'controlTimerDisplay',
    'timerDisplay',
    'timerStatusLabel',
    'timerStatus',
    'timerAllocationForm',
    'timerAllocationFields',
    'timerAllocationStrategicOrientation',
    'timerAllocationMove1',
    'timerAllocationMove2',
    'timerAllocationMove3',
    'timerAllocationCurrentMark',
    'timerAllocationSaveBtn',
    'timerAllocationResetCurrentBtn',
    'pluginSettingsList',
    'whiteCellPluginMounts',
    'strategicOrientationBadge',
    'actionsBadge',
    'proposalsBadge',
    'responsesBadge',
    'participantsSummary',
    'participantsSessionFilter',
    'participantsTeamFilter',
    'participantsRoleFilter',
    'participantsList',
    'scribeDeckSettingsSummary',
    'scribeDeckSettingsList',
    'strategicOrientationList',
    'actionsList',
    'responsesList',
    'proposalsList',
    'tribeStreetJournalEmbed',
    'adjudicationQueue',
    'rfiBadge',
    'rfiQueue',
    'commForm',
    'commRecipient',
    'commType',
    'commContent',
    'commHistory',
    'tribeStreetJournalList',
    'newVerbaAiUpdateBtn',
    'verbaAiList',
    'timelineTeamFilter',
    'timelineRoleFilter',
    'timelineMoveFilter',
    'timelineActivityTypeFilter',
    'timelineList'
];

export function getWhiteCellDomContract(documentRef = document) {
    const elements = Object.fromEntries(
        WHITE_CELL_DOM_IDS.map((id) => [id, documentRef?.getElementById?.(id) ?? null])
    );

    return {
        elements,
        missing: WHITE_CELL_DOM_IDS.filter((id) => !elements[id])
    };
}

export function getWhiteCellAdminExportButtonConfig() {
    return [
        {
            action: 'actions-csv',
            availability: 'legacy',
            className: 'btn btn-secondary btn-sm',
            label: 'Export Actions (CSV)',
            successMessage: 'Export downloaded.'
        },
        {
            action: 'rfis-csv',
            availability: 'legacy',
            className: 'btn btn-secondary btn-sm',
            label: 'Export RFIs (CSV)',
            successMessage: 'Export downloaded.'
        },
        {
            action: 'timeline-csv',
            availability: 'legacy',
            className: 'btn btn-secondary btn-sm',
            label: 'Export Timeline (CSV)',
            successMessage: 'Export downloaded.'
        },
        {
            action: 'participants-csv',
            availability: 'legacy',
            className: 'btn btn-secondary btn-sm',
            label: 'Export Participants (CSV)',
            successMessage: 'Export downloaded.'
        },
        {
            action: 'session-json',
            availability: 'legacy',
            className: 'btn btn-primary btn-sm',
            label: 'Export Full Session (JSON)',
            successMessage: 'Export downloaded.'
        },
        {
            action: 'research-archive',
            availability: 'research',
            className: 'btn btn-primary btn-sm',
            label: 'Download Research ZIP',
            successMessage: 'Research archive is ready.'
        },
        {
            action: 'research-print',
            availability: 'research',
            className: 'btn btn-secondary btn-sm',
            label: 'Print Report',
            successMessage: 'Research report is ready.'
        }
    ];
}

export function buildWhiteCellExportSelectionState({
    sessionId = null,
    sessionName = null,
    captureMode = 'research'
} = {}) {
    const sessionLabel = sessionName || 'the active session';

    if (!sessionId) {
        return {
            disabled: true,
            researchDisabled: true,
            captureMode,
            message: 'Join a session before exporting JSON, CSV, or research archive data.'
        };
    }

    if (String(captureMode || '').trim().toLowerCase() === 'standard') {
        return {
            disabled: false,
            researchDisabled: true,
            captureMode: 'standard',
            message: `JSON and CSV exports are ready for ${sessionLabel}. Research archive controls stay locked until research capture mode is enabled.`
        };
    }

    return {
        disabled: false,
        researchDisabled: false,
        captureMode: 'research',
        message: `JSON, CSV, and research exports are ready for ${sessionLabel}.`
    };
}

export function getWhiteCellAccessState(teamContext, sessionStoreRef = sessionStore) {
    const sessionId = sessionStoreRef.getSessionId?.() || sessionStoreRef.getSessionData?.()?.id || null;
    const role = sessionStoreRef.getRole?.() || sessionStoreRef.getSessionData?.()?.role || null;
    const parsedRole = parseTeamRole(role);
    const allowedRole = role === teamContext.whitecellLeadRole || role === teamContext.whitecellSupportRole;
    const cachedOperatorAccess = Boolean(
        sessionId &&
        allowedRole &&
        sessionStoreRef.hasOperatorAccess?.(OPERATOR_SURFACES.WHITE_CELL, {
            sessionId,
            role
        })
    );

    return {
        allowed: Boolean(sessionId && allowedRole),
        cachedOperatorAccess,
        sessionId,
        role,
        operatorRole: parsedRole.operatorRole || WHITE_CELL_OPERATOR_ROLES.LEAD
    };
}

export function getWhiteCellSessionCode(session = {}) {
    const code = session?.session_code || session?.sessionCode || session?.code || session?.metadata?.session_code || '';
    return String(code || '').trim() || 'N/A';
}

export function getWhiteCellSessionLabel(session = null) {
    if (!session) {
        return '';
    }

    const name = String(session.name || 'Active session').trim() || 'Active session';
    const code = getWhiteCellSessionCode(session);
    return code && code !== 'N/A' ? `${name} (${code})` : name;
}

export function getWhiteCellParticipantSessionLabel(participant = {}, session = null) {
    const participantSession = participant.sessionName || participant.session_name || null;
    const participantCode = participant.sessionCode || participant.session_code || participant.code || null;

    if (participantSession) {
        return participantCode ? `${participantSession} (${participantCode})` : participantSession;
    }

    return getWhiteCellSessionLabel(session);
}

export function getWhiteCellParticipantSessionFilterValue(participant = {}, session = null) {
    const explicitId = String(participant.session_id || participant.sessionId || participant.session?.id || '').trim();
    if (explicitId) {
        return `id:${explicitId}`;
    }

    const participantCode = String(participant.sessionCode || participant.session_code || participant.code || '').trim();
    if (participantCode) {
        return `code:${participantCode}`;
    }

    const participantSession = String(participant.sessionName || participant.session_name || '').trim();
    if (participantSession) {
        return `name:${participantSession}`;
    }

    const fallbackId = String(session?.id || '').trim();
    if (fallbackId) {
        return `id:${fallbackId}`;
    }

    const fallbackCode = String(session?.session_code || session?.sessionCode || session?.code || session?.metadata?.session_code || '').trim();
    if (fallbackCode) {
        return `code:${fallbackCode}`;
    }

    const fallbackName = String(session?.name || '').trim();
    if (fallbackName) {
        return `name:${fallbackName}`;
    }

    return null;
}

function getWhiteCellParticipantSessionFilterFallbackLabel(sessionValue = '') {
    const [kind, ...rawParts] = String(sessionValue || '').split(':');
    const rawValue = rawParts.join(':').trim();
    if (!rawValue) {
        return '';
    }

    if (kind === 'id') {
        return `Session ${rawValue.slice(0, 8)}`;
    }

    if (kind === 'code') {
        return `Code ${rawValue}`;
    }

    return rawValue;
}

export function getWhiteCellDeleteSessionConfirmationOptions(session = {}) {
    const label = session?.name || 'this session';

    return {
        title: 'Delete session',
        message: `Delete ${label}? All actions, RFIs, participant seats, timeline events, and exports tied to it will be removed. This cannot be undone.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Keep Session',
        variant: 'danger'
    };
}

function getParticipantTimestamp(participant = {}) {
    return new Date(
        participant.heartbeat_at
        || participant.last_seen
        || participant.joined_at
        || 0
    ).getTime();
}

export function isConnectedParticipant(participant = {}) {
    if (typeof participant?.is_active === 'boolean') {
        return participant.is_active;
    }

    return true;
}

export function isWhiteCellVisibleParticipant(participant = {}, teamId = null) {
    if (!participant || typeof participant !== 'object') {
        return false;
    }

    if (participant.role === 'white') {
        return false;
    }

    const parsedRole = parseTeamRole(participant.role);
    const participantTeam = participant.team
        || participant.team_id
        || (parsedRole.surface === ROLE_SURFACES.WHITECELL ? 'white_cell' : parsedRole.teamId)
        || null;

    if (!teamId) {
        return participant.role === 'viewer' || Boolean(parsedRole.surface);
    }

    if (participant.role === 'viewer') {
        return true;
    }

    return participantTeam === teamId;
}

export function buildWhiteCellParticipantRoster(participants = [], teamId = null) {
    return [...participants]
        .filter((participant) => isWhiteCellVisibleParticipant(participant, teamId))
        .sort((left, right) => {
            const activeDelta = Number(isConnectedParticipant(right)) - Number(isConnectedParticipant(left));
            if (activeDelta !== 0) {
                return activeDelta;
            }

            return getParticipantTimestamp(right) - getParticipantTimestamp(left);
        });
}

export function formatWhiteCellParticipantSummary(participants = []) {
    const total = participants.length;
    const connected = participants.filter((participant) => isConnectedParticipant(participant)).length;

    if (total === 0) {
        return 'No participants have joined this session yet.';
    }

    if (connected === total) {
        return `${connected} connected participant${connected === 1 ? '' : 's'}`;
    }

    return `${connected} connected / ${total} total participants`;
}

function sortWhiteCellFilterValues(values = [], orderedValues = []) {
    return [...values].sort((left, right) => {
        const leftIndex = orderedValues.indexOf(left);
        const rightIndex = orderedValues.indexOf(right);

        if (leftIndex !== -1 || rightIndex !== -1) {
            if (leftIndex === -1) return 1;
            if (rightIndex === -1) return -1;
            if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        }

        return String(left).localeCompare(String(right));
    });
}

export function buildWhiteCellCommunicationRecipientOptions() {
    return [
        {
            value: WHITE_CELL_ALL_TEAMS_RECIPIENT,
            label: 'All Teams'
        },
        ...TEAM_OPTIONS.flatMap((team) => {
            const facilitatorRole = buildTeamRole(team.id, ROLE_SURFACES.FACILITATOR);
            const scribeRole = buildTeamRole(team.id, ROLE_SURFACES.SCRIBE);
            const notetakerRole = buildTeamRole(team.id, ROLE_SURFACES.NOTETAKER);

            return [
                {
                    value: team.id,
                    label: team.label
                },
                {
                    value: facilitatorRole,
                    label: getRoleDisplayName(facilitatorRole)
                },
                {
                    value: scribeRole,
                    label: getRoleDisplayName(scribeRole)
                },
                {
                    value: notetakerRole,
                    label: getRoleDisplayName(notetakerRole)
                }
            ];
        })
    ];
}

export function getWhiteCellTeamLabel(team = null) {
    if (team === 'white_cell') {
        return 'White Cell';
    }

    return TEAM_LABELS[team] || team || 'Unknown team';
}

export function getWhiteCellFilterTeamLabel(team = null) {
    if (team === 'observer') {
        return 'Observers';
    }

    if (team === 'system') {
        return 'System';
    }

    return getWhiteCellTeamLabel(team);
}

export function getWhiteCellRoleFilterValue(role = null) {
    if (role === 'viewer') {
        return ROLE_SURFACES.VIEWER;
    }

    const parsedRole = parseTeamRole(role);
    return parsedRole.surface || null;
}

export function getWhiteCellFilterRoleLabel(role = null) {
    const labels = {
        [ROLE_SURFACES.FACILITATOR]: 'Scribes',
        [ROLE_SURFACES.SCRIBE]: 'Facilitators',
        [ROLE_SURFACES.NOTETAKER]: 'Notetakers',
        [ROLE_SURFACES.WHITECELL]: 'White Cell',
        [ROLE_SURFACES.VIEWER]: 'Observers',
        system: 'System'
    };

    return labels[role] || role || 'Unknown role';
}

function getWhiteCellTimelineEventType(event = {}) {
    return event.type || event.event_type || null;
}

export function getWhiteCellTimelineMoveFilterValue(event = {}) {
    const moveValue = Number(event.move);

    if (!Number.isFinite(moveValue) || moveValue <= 0) {
        return null;
    }

    return String(moveValue);
}

export function getWhiteCellTimelineActivityTypeFilterValue(event = {}) {
    return getWhiteCellTimelineEventType(event);
}

function formatWhiteCellTimelineFallbackLabel(value = null) {
    return String(value || '')
        .split('_')
        .filter(Boolean)
        .map((segment) => {
            if (segment === segment.toUpperCase() && segment.length <= 3) {
                return segment;
            }

            return `${segment.charAt(0)}${segment.slice(1).toLowerCase()}`;
        })
        .join(' ')
        || 'Unknown activity type';
}

export function getWhiteCellTimelineActivityTypeLabel(activityType = null) {
    const labels = {
        PHASE_CHANGE: 'Phase Change',
        MOVE_CHANGE: 'Move Change',
        TIMER_START: 'Timer Start',
        TIMER_PAUSE: 'Timer Pause',
        TIMER_RESET: 'Timer Reset',
        ACTION_CREATED: 'Action Created',
        ACTION_SUBMITTED: 'Action Submitted',
        ACTION_ADJUDICATED: 'Deliberation Update',
        STRATEGIC_ORIENTATION_FORWARDED_TO_SCRIBE: 'Strategic Orientation Forwarded',
        STRATEGIC_ORIENTATION_SUBMITTED: 'Strategic Orientation Submitted',
        PROPOSAL_SUBMITTED: 'Proposal Submitted',
        PROPOSAL_FORWARDED: 'Proposal Forwarded',
        PROPOSAL_RESPONSE: 'Proposal Response',
        PROPOSAL_RESPONDED: 'Proposal Responded',
        RFI_CREATED: 'RFI Created',
        RFI_ANSWERED: 'RFI Answered',
        INJECT: 'Inject',
        ANNOUNCEMENT: 'Announcement',
        GUIDANCE: 'Guidance',
        NOTE: 'Note',
        MOMENT: 'Moment',
        QUOTE: 'Quote',
        PARTICIPANT_JOINED: 'Participant Joined',
        PARTICIPANT_LEFT: 'Participant Left'
    };

    return labels[activityType] || formatWhiteCellTimelineFallbackLabel(activityType);
}

export function canShareActionToRedTeam(action = {}) {
    return action?.team === 'blue' && !isStrategicOrientationAction(action);
}

export function buildSharedActionCommunicationContent(action = {}) {
    const blueAction = getBlueActionViewModel(action);
    const targetLabel = formatBlueActionSelection(blueAction.focusCountries);
    const leverLabel = formatBlueActionSelection(blueAction.levers, blueAction.lever || 'Not specified');
    const sectorLabel = formatBlueActionSelection(blueAction.sectors, blueAction.sector || 'Not specified');
    const legislativeOptionsLabel = formatBlueActionSelection(blueAction.legislativeOptions, 'None selected');
    const expectedOutcomes = blueAction.expectedOutcomes || 'No expected outcomes recorded.';
    const contentParts = [
        'Blue Team action shared by White Cell',
        `Title: ${blueAction.title}`,
        `Mechanism: ${blueAction.instrumentOfPower || 'No mechanism'}`,
        `Move: ${action.move || 1}`,
        `Phase: ${action.phase || 1}`,
        `${blueAction.hasBlueActionDetails ? 'Focus Countries' : 'Targets'}: ${targetLabel}`,
        `${blueAction.hasBlueActionDetails ? 'Sectors' : 'Sector'}: ${sectorLabel}`,
        `${blueAction.hasBlueActionDetails ? 'Supply Chain Focus' : 'Exposure'}: ${blueAction.supplyChainFocus || 'Not specified'}`,
        `Expected Outcomes: ${expectedOutcomes}`
    ];

    if (blueAction.hasBlueActionDetails) {
        if (blueAction.objective) {
            contentParts.push(`Objective: ${blueAction.objective}`);
        }
        if (blueAction.levers.length) {
            contentParts.push(`Levers: ${leverLabel}`);
        }
        if (blueAction.implementation) {
            contentParts.push(`Implementation: ${blueAction.implementation}`);
        }
        if (blueAction.implementation === 'Legislative') {
            contentParts.push(`Legislative Route: ${legislativeOptionsLabel}`);
        }
        if (blueAction.enforcementTimeline) {
            contentParts.push(`Enforcement Timeline: ${blueAction.enforcementTimeline}`);
        }
        if (blueAction.coordinated.length) {
            contentParts.push(`Coordinated: ${blueAction.coordinated.join(', ')}`);
        }
        if (blueAction.informed.length) {
            contentParts.push(`Informed/Engaged: ${blueAction.informed.join(', ')}`);
        }
    } else if (action.ally_contingencies) {
        contentParts.push(`Ally Contingencies: ${action.ally_contingencies}`);
    }

    return contentParts.join(' | ');
}

export function getWhiteCellParticipantTeamFilterValue(participant = {}) {
    if (participant.role === 'viewer') {
        return 'observer';
    }

    const parsedRole = parseTeamRole(participant.role);
    if (parsedRole.surface === ROLE_SURFACES.WHITECELL) {
        return 'white_cell';
    }

    return participant.team || participant.team_id || parsedRole.teamId || null;
}

export function buildWhiteCellParticipantFilterOptions(participants = [], {
    activeSession = null
} = {}) {
    const sessionValues = new Map();
    const teamValues = new Set();
    const roleValues = new Set();

    participants.forEach((participant) => {
        const sessionValue = getWhiteCellParticipantSessionFilterValue(participant, activeSession);
        const sessionLabel = getWhiteCellParticipantSessionLabel(participant, activeSession)
            || getWhiteCellParticipantSessionFilterFallbackLabel(sessionValue);
        const teamValue = getWhiteCellParticipantTeamFilterValue(participant);
        const roleValue = getWhiteCellRoleFilterValue(participant.role);

        if (sessionValue && sessionLabel && !sessionValues.has(sessionValue)) {
            sessionValues.set(sessionValue, sessionLabel);
        }

        if (teamValue && teamValue !== 'white_cell') {
            teamValues.add(teamValue);
        }

        if (roleValue && roleValue !== ROLE_SURFACES.WHITECELL) {
            roleValues.add(roleValue);
        }
    });

    return {
        sessionOptions: [
            { value: '', label: 'All Sessions' },
            ...[...sessionValues.entries()]
                .sort((left, right) => left[1].localeCompare(right[1]))
                .map(([value, label]) => ({ value, label }))
        ],
        teamOptions: [
            { value: '', label: 'All Teams' },
            ...sortWhiteCellFilterValues(teamValues, WHITE_CELL_FILTER_TEAM_ORDER).map((value) => ({
                value,
                label: getWhiteCellFilterTeamLabel(value)
            }))
        ],
        roleOptions: [
            { value: '', label: 'All Roles' },
            ...sortWhiteCellFilterValues(roleValues, WHITE_CELL_FILTER_ROLE_ORDER).map((value) => ({
                value,
                label: getWhiteCellFilterRoleLabel(value)
            }))
        ]
    };
}

export function filterWhiteCellParticipants(participants = [], {
    session = null,
    team = null,
    role = null,
    activeSession = null
} = {}) {
    return participants.filter((participant) => {
        const participantSession = getWhiteCellParticipantSessionFilterValue(participant, activeSession);
        const participantTeam = getWhiteCellParticipantTeamFilterValue(participant);
        const participantRole = getWhiteCellRoleFilterValue(participant.role);

        if (session && participantSession !== session) {
            return false;
        }

        if (team && participantTeam !== team) {
            return false;
        }

        if (role && participantRole !== role) {
            return false;
        }

        return true;
    });
}

function resolveWhiteCellTimelineMetadataRole(event = {}) {
    const metadata = event?.metadata && typeof event.metadata === 'object'
        ? event.metadata
        : {};

    return (
        metadata.role
        || metadata.operator_role
        || metadata.answered_by_role
        || metadata.adjudicated_by_role
        || metadata.participant_role
        || event.role
        || null
    );
}

export function getWhiteCellTimelineRoleFilterValue(event = {}) {
    const explicitRole = getWhiteCellRoleFilterValue(resolveWhiteCellTimelineMetadataRole(event));
    if (explicitRole) {
        return explicitRole;
    }

    const eventType = getWhiteCellTimelineEventType(event);
    const actor = String(event?.metadata?.actor || '').toLowerCase();

    if (event.team === 'white_cell') {
        return ROLE_SURFACES.WHITECELL;
    }

    if (WHITE_CELL_TIMELINE_FACILITATOR_TYPES.includes(eventType)) {
        return ROLE_SURFACES.FACILITATOR;
    }

    if (WHITE_CELL_TIMELINE_NOTETAKER_TYPES.includes(eventType)) {
        if (actor.includes('scribe')) {
            return ROLE_SURFACES.SCRIBE;
        }

        if (actor.includes('facilitator')) {
            return ROLE_SURFACES.FACILITATOR;
        }

        if (
            actor.includes('notetaker')
            || event?.metadata?.source === 'notetaker_save'
            || event?.metadata?.note_scope
        ) {
            return ROLE_SURFACES.NOTETAKER;
        }
    }

    return null;
}

export function buildWhiteCellTimelineFilterOptions(events = []) {
    const teamValues = new Set();
    const roleValues = new Set();
    const moveValues = new Set();
    const activityTypeValues = new Set();

    events.forEach((event) => {
        const teamValue = event.team || null;
        const roleValue = getWhiteCellTimelineRoleFilterValue(event);
        const moveValue = getWhiteCellTimelineMoveFilterValue(event);
        const activityTypeValue = getWhiteCellTimelineActivityTypeFilterValue(event);

        if (teamValue) {
            teamValues.add(teamValue);
        }

        if (roleValue) {
            roleValues.add(roleValue);
        }

        if (moveValue) {
            moveValues.add(moveValue);
        }

        if (activityTypeValue) {
            activityTypeValues.add(activityTypeValue);
        }
    });

    return {
        teamOptions: [
            { value: '', label: 'All Teams' },
            ...sortWhiteCellFilterValues(teamValues, WHITE_CELL_FILTER_TEAM_ORDER).map((value) => ({
                value,
                label: getWhiteCellFilterTeamLabel(value)
            }))
        ],
        roleOptions: [
            { value: '', label: 'All Roles' },
            ...sortWhiteCellFilterValues(roleValues, WHITE_CELL_FILTER_ROLE_ORDER).map((value) => ({
                value,
                label: getWhiteCellFilterRoleLabel(value)
            }))
        ],
        moveOptions: [
            { value: '', label: 'All Moves' },
            ...Array.from(moveValues)
                .sort((left, right) => Number(left) - Number(right))
                .map((value) => ({
                    value,
                    label: `Move ${value}`
                }))
        ],
        activityTypeOptions: [
            { value: '', label: 'All Activity Types' },
            ...sortWhiteCellFilterValues(activityTypeValues, WHITE_CELL_TIMELINE_ACTIVITY_TYPE_ORDER).map((value) => ({
                value,
                label: getWhiteCellTimelineActivityTypeLabel(value)
            }))
        ]
    };
}

export function filterWhiteCellTimelineEvents(events = [], {
    team = null,
    role = null,
    move = null,
    activityType = null
} = {}) {
    return events.filter((event) => {
        const timelineRole = getWhiteCellTimelineRoleFilterValue(event);
        const timelineMove = getWhiteCellTimelineMoveFilterValue(event);
        const timelineActivityType = getWhiteCellTimelineActivityTypeFilterValue(event);

        if (team && event.team !== team) {
            return false;
        }

        if (role && timelineRole !== role) {
            return false;
        }

        if (move && timelineMove !== String(move)) {
            return false;
        }

        if (activityType && timelineActivityType !== activityType) {
            return false;
        }

        return true;
    });
}

function buildDefaultScribeDeckAssignment(team = {}) {
    return {
        teamId: team.id,
        teamLabel: team.label,
        deckSource: SCRIBE_DECK_SOURCE_REPO,
        deckStorageKey: null,
        deckFileName: null,
        deckPath: buildDefaultScribeDeckPath(team.id),
        deckLabel: DEFAULT_SCRIBE_DECK_LABEL,
        assignedAt: null,
        communicationId: null
    };
}

export function buildWhiteCellScribeDeckAssignments(communications = []) {
    const assignmentsByTeam = Object.fromEntries(
        TEAM_OPTIONS.map((team) => [team.id, buildDefaultScribeDeckAssignment(team)])
    );

    communications.forEach((communication) => {
        const assignment = getScribeDeckAssignmentDetails(communication);
        if (!assignment || !assignmentsByTeam[assignment.recipientTeam]) {
            return;
        }

        if (assignmentsByTeam[assignment.recipientTeam].communicationId) {
            return;
        }

        assignmentsByTeam[assignment.recipientTeam] = {
            ...assignmentsByTeam[assignment.recipientTeam],
            deckSource: assignment.deckSource || SCRIBE_DECK_SOURCE_REPO,
            deckStorageKey: assignment.deckStorageKey || null,
            deckFileName: assignment.deckFileName || null,
            deckPath: assignment.deckPath,
            deckLabel: assignment.deckLabel,
            assignedAt: assignment.assignedAt,
            communicationId: assignment.communicationId
        };
    });

    return assignmentsByTeam;
}

function buildScribeDeckAssignmentCommunicationContent({
    teamLabel = 'Team',
    deckLabel = DEFAULT_SCRIBE_DECK_LABEL,
    deckPath = DEFAULT_SCRIBE_DECK_PATH,
    deckSource = SCRIBE_DECK_SOURCE_REPO,
    deckFileName = ''
} = {}) {
    if (deckSource === SCRIBE_DECK_SOURCE_UPLOAD) {
        return `White Cell uploaded "${deckLabel}" to ${teamLabel} Facilitator (${deckFileName || 'browser upload'}).`;
    }

    return `White Cell loaded "${deckLabel}" into ${teamLabel} Facilitator (${deckPath}).`;
}

export class WhiteCellController {
    constructor() {
        this.actions = [];
        this.blueTeamActions = [];
        this.strategicOrientationArtifacts = [];
        this.greenTeamProposals = [];
        this.proposalTeamProposals = this.greenTeamProposals;
        this.redTeamResponses = [];
        this.reviewActiveTabs = {
            strategicOrientation: 'pending',
            actions: 'pending',
            responses: 'pending',
            proposals: 'pending'
        };
        this.rfis = [];
        this.communications = [];
        this.tribeStreetJournalEntries = [];
        this.verbaAiUpdates = [];
        this.scribeDeckAssignments = buildWhiteCellScribeDeckAssignments();
        this.participants = [];
        this.timelineEvents = [];
        this.adminSessions = [];
        this.storeUnsubscribers = [];
        this.currentTimerSeconds = CONFIG.DEFAULT_TIMER_SECONDS;
        this.timerAllocations = buildDefaultTimerAllocations();
        this.pluginState = buildDefaultPluginState();
        this.mountedPlugins = new Map();
        this.timerRunning = false;
        this.participantFilters = {
            session: null,
            team: null,
            role: null
        };
        this.timelineFilters = {
            team: null,
            role: null,
            move: null,
            activityType: null
        };
        this.teamContext = resolveTeamContext();
        this.teamId = null;
        this.operatorRole = WHITE_CELL_OPERATOR_ROLES.LEAD;
        this.researchCaptureMode = 'research';
        this.researchBuildHash = null;
        this.notificationsMuted = readWhiteCellNotificationsMutedPreference();
        this.seenBlueActionIds = new Set();
        this.newBlueActionIds = new Set();
        this.seenStrategicOrientationIds = new Set();
        this.newStrategicOrientationIds = new Set();
        this.seenGreenProposalIds = new Set();
        this.newGreenProposalIds = new Set();
        this.seenRedResponseIds = new Set();
        this.newRedResponseIds = new Set();
        this.pendingQueueArrivalSummary = {
            strategicOrientation: new Set(),
            actions: new Set(),
            proposals: new Set(),
            responses: new Set()
        };
        this.hasHydratedStrategicOrientationQueue = false;
        this.hasHydratedBlueActionQueue = false;
        this.hasHydratedGreenProposalQueue = false;
        this.hasHydratedRedResponseQueue = false;
    }

    async init() {
        logger.info('Initializing White Cell interface');

        const accessState = getWhiteCellAccessState(this.teamContext, sessionStore);
        if (!accessState.allowed) {
            showToast({
                message: `${this.teamContext.whitecellLabel} requires operator authorization from the landing page.`,
                type: 'error'
            });
            navigateToApp('index.html#operatorAccessSection', { replace: true });
            return;
        }

        try {
            const grant = await database.requireOperatorGrant(OPERATOR_SURFACES.WHITE_CELL, {
                sessionId: accessState.sessionId,
                role: accessState.role
            });
            sessionStore.setOperatorAuth({
                ...grant,
                sessionId: grant?.sessionId || accessState.sessionId,
                teamId: grant?.teamId || null,
                role: grant?.role || accessState.role
            });
        } catch (error) {
            logger.warn('Blocked White Cell access after failed server verification', error);
            sessionStore.clearOperatorAuth();
            showToast({
                message: `${this.teamContext.whitecellLabel} requires a valid server-side operator grant.`,
                type: 'error'
            });
            navigateToApp('index.html#operatorAccessSection', { replace: true });
            return;
        }

        this.operatorRole = accessState.operatorRole || WHITE_CELL_OPERATOR_ROLES.LEAD;
        const sessionId = accessState.sessionId;

        this.renderScribeDeckSettings();
        this.renderPluginSettings();

        await syncService.initialize(sessionId, {
            participantId: sessionStore.getSessionParticipantId?.() || null
        });
        this.configureTeamLabels();
        await this.loadResearchExportRuntime();
        this.renderNotificationsMuteControl();
        this.bindEventListeners();
        this.subscribeToLiveData();
        this.syncGameStateFromStore(gameStateStore.getState() || sessionStore.getSessionData()?.gameState || null);
        this.syncActionsFromStore();
        this.syncRfisFromStore();
        this.syncCommunicationsFromStore();
        this.syncTimelineFromStore();
        this.syncParticipantsFromStore();
        this.updateTimerDisplay();
        this.updateTimerStatusDisplay();
        this.loadSessionsAdmin().catch((err) => {
            logger.error('Failed to load sessions for admin panel:', err);
        });

        this.mountFollowAlongOnboarding();

        logger.info('White Cell interface initialized');
    }

    mountFollowAlongOnboarding() {
        const navTarget = (section) => `.sidebar-link[data-section="${section}"]`;
        const operatorLabel = this.isLeadOperator()
            ? 'White Cell Lead'
            : 'White Cell Support';
        this.onboarding = mountFollowAlong({
            storageKey: 'followalong:whitecell',
            title: `${operatorLabel} guide`,
            steps: [
                {
                    title: operatorLabel,
                    body: 'Use this console to run the exercise, adjudicate submissions, answer RFIs, publish White Cell updates, manage seats and decks, and export the record.'
                },
                {
                    title: 'Watch the live tracker',
                    body: 'The header mirrors the current state every team sees: Strategic Orientation before Move 1, then move, phase, countdown timer, and paused or running state.',
                    highlight: '.header-center'
                },
                {
                    title: 'Run game controls',
                    body: 'Use Simulation Settings to advance or reverse moves and phases, start or pause the timer, and reset the clock.',
                    highlight: navTarget('controls')
                },
                {
                    title: 'Manage session operations',
                    body: 'The Simulation Settings tabs also cover live sessions, participant rosters, facilitator deck assignments, plugins, and export controls.',
                    highlight: '#settingsTabs .tab-list'
                },
                {
                    title: 'Review Strategic Orientation',
                    body: 'Strategic Orientation collects the Blue selection plus Green, Red, and Industry forecasts after each Facilitator submits them to White Cell.',
                    highlight: navTarget('strategicOrientation')
                },
                {
                    title: 'Review Blue actions',
                    body: 'Actions is the Blue Team queue. Review submitted actions, record White Cell rulings, and share approved actions forward when needed.',
                    highlight: navTarget('actions')
                },
                {
                    title: 'Review proposals',
                    body: 'Proposals is the Green and Industry queue. Forward proposals to recipients, request changes, or reject proposals with White Cell notes.',
                    highlight: navTarget('proposals')
                },
                {
                    title: 'Review Red responses',
                    body: 'Move Responses is the Red Team queue. Review responses before they affect the shared exercise record.',
                    highlight: navTarget('responses')
                },
                {
                    title: 'Read field intelligence',
                    body: 'Tribe Street Journal surfaces Scribe, Facilitator, and Notetaker captures so White Cell can turn selected moments into updates.',
                    highlight: navTarget('tribeStreetJournal')
                },
                {
                    title: 'Publish sentiment updates',
                    body: 'Verba AI Population Sentiments is where White Cell composes and reviews Blue, Green, Red, and Industry sentiment updates.',
                    highlight: navTarget('verbaAi')
                },
                {
                    title: 'Answer RFIs',
                    body: 'RFI collects questions from every team. Answer them here so the response is logged and routed back to the requester.',
                    highlight: navTarget('requests')
                },
                {
                    title: 'Broadcast communications',
                    body: 'Communications sends injects, announcements, and guidance to all teams, one team, or specific team roles.',
                    highlight: navTarget('communications')
                },
                {
                    title: 'Audit the timeline',
                    body: 'Session Timeline gives White Cell a filterable record of actions, RFIs, communications, captures, seat changes, and game-state events.',
                    highlight: navTarget('timeline')
                },
                {
                    title: 'Control arrival noise',
                    body: 'Mute notifications suppresses queue-arrival toasts only. Badges and NEW labels remain visible until the queue items are opened.',
                    highlight: '#whiteCellNotificationsMuteBtn'
                },
                {
                    title: 'Revisit this guide',
                    body: 'This guide stays above the session label. Collapse it when you need space, then reopen it here later.',
                    highlight: '.sidebar-session'
                }
            ]
        });
    }

    configureTeamLabels() {
        const headerTitle = document.querySelector('.header-title');
        const recipientSelect = document.getElementById('commRecipient');
        if (headerTitle) {
            headerTitle.textContent = this.isLeadOperator()
                ? 'White Cell Lead'
                : 'White Cell Support';
        }
        if (recipientSelect) {
            this.configureCommunicationRecipients(recipientSelect);
        }
    }

    renderNotificationsMuteControl() {
        const button = document.getElementById('whiteCellNotificationsMuteBtn');
        if (!button) {
            return;
        }

        const isMuted = this.notificationsMuted === true;
        button.textContent = isMuted ? 'Notifications muted' : 'Mute notifications';
        button.title = isMuted
            ? 'Queue arrival toasts are muted. Click to unmute.'
            : 'Mute White Cell queue arrival toasts.';
        button.setAttribute?.('aria-pressed', String(isMuted));
        button.setAttribute?.(
            'aria-label',
            isMuted
                ? 'Unmute White Cell queue notifications'
                : 'Mute White Cell queue notifications'
        );
    }

    setNotificationsMuted(isMuted = false, {
        persist = true
    } = {}) {
        this.notificationsMuted = isMuted === true;
        if (persist) {
            writeWhiteCellNotificationsMutedPreference(this.notificationsMuted);
        }
        this.renderNotificationsMuteControl();
    }

    toggleNotificationsMuted() {
        this.setNotificationsMuted(!this.notificationsMuted);
    }

    configureCommunicationRecipients(recipientSelect) {
        const currentValue = recipientSelect.value || WHITE_CELL_ALL_TEAMS_RECIPIENT;
        const options = buildWhiteCellCommunicationRecipientOptions();

        recipientSelect.innerHTML = options.map((option) => (
            `<option value="${option.value}">${this.escapeHtml(option.label)}</option>`
        )).join('');

        const resolvedValue = options.some((option) => option.value === currentValue)
            ? currentValue
            : WHITE_CELL_ALL_TEAMS_RECIPIENT;

        recipientSelect.value = resolvedValue;
    }

    isLeadOperator() {
        return this.operatorRole !== WHITE_CELL_OPERATOR_ROLES.SUPPORT;
    }

    getTimelineActorRole() {
        return (
            sessionStore.getRole()
            || sessionStore.getSessionData()?.role
            || (this.isLeadOperator()
                ? this.teamContext.whitecellLeadRole
                : this.teamContext.whitecellSupportRole)
        );
    }

    bindEventListeners() {
        const startTimerBtn = document.getElementById('startTimerBtn');
        const pauseTimerBtn = document.getElementById('pauseTimerBtn');
        const resetTimerBtn = document.getElementById('resetTimerBtn');
        const timerAllocationForm = document.getElementById('timerAllocationForm');
        const timerAllocationResetCurrentBtn = document.getElementById('timerAllocationResetCurrentBtn');
        const prevPhaseBtn = document.getElementById('prevPhaseBtn');
        const nextPhaseBtn = document.getElementById('nextPhaseBtn');
        const prevMoveBtn = document.getElementById('prevMoveBtn');
        const nextMoveBtn = document.getElementById('nextMoveBtn');
        const commForm = document.getElementById('commForm');
        const participantsSessionFilter = document.getElementById('participantsSessionFilter');
        const participantsTeamFilter = document.getElementById('participantsTeamFilter');
        const participantsRoleFilter = document.getElementById('participantsRoleFilter');
        const scribeDeckSettingsList = document.getElementById('scribeDeckSettingsList');
        const pluginSettingsList = document.getElementById('pluginSettingsList');
        const notificationsMuteBtn = document.getElementById('whiteCellNotificationsMuteBtn');
        const timelineTeamFilter = document.getElementById('timelineTeamFilter');
        const timelineRoleFilter = document.getElementById('timelineRoleFilter');
        const timelineMoveFilter = document.getElementById('timelineMoveFilter');
        const timelineActivityTypeFilter = document.getElementById('timelineActivityTypeFilter');
        const tribeStreetJournalList = document.getElementById('tribeStreetJournalList');
        const verbaAiComposeButton = document.getElementById('newVerbaAiUpdateBtn');

        if (this.isLeadOperator()) {
            startTimerBtn?.addEventListener('click', () => this.startTimer());
            pauseTimerBtn?.addEventListener('click', () => this.pauseTimer());
            resetTimerBtn?.addEventListener('click', () => this.resetTimer());
            timerAllocationForm?.addEventListener('submit', (event) => this.handleTimerAllocationSubmit(event));
            timerAllocationResetCurrentBtn?.addEventListener('click', () => this.resetTimerToCurrentAllocation());
            prevPhaseBtn?.addEventListener('click', () => this.regressPhase());
            nextPhaseBtn?.addEventListener('click', () => this.advancePhase());
            prevMoveBtn?.addEventListener('click', () => this.regressMove());
            nextMoveBtn?.addEventListener('click', () => this.advanceMove());
        } else {
            [
                startTimerBtn,
                pauseTimerBtn,
                resetTimerBtn,
                document.getElementById('timerAllocationSaveBtn'),
                timerAllocationResetCurrentBtn,
                prevPhaseBtn,
                nextPhaseBtn,
                prevMoveBtn,
                nextMoveBtn
            ].forEach((button) => {
                if (!button) return;
                button.disabled = true;
                button.setAttribute?.('aria-disabled', 'true');
                button.title = 'White Cell support is read-only for game controls.';
            });
        }

        commForm?.addEventListener('submit', (event) => this.handleCommunicationSubmit(event));
        notificationsMuteBtn?.addEventListener('click', () => this.toggleNotificationsMuted());
        pluginSettingsList?.addEventListener('change', (event) => {
            const toggle = event.target.closest('input[data-plugin-toggle]');
            if (!toggle || !pluginSettingsList.contains(toggle)) return;
            this.handlePluginToggle(toggle).catch((err) => {
                logger.error('Failed to handle plugin toggle:', err);
            });
        });
        participantsSessionFilter?.addEventListener('change', (event) => {
            this.participantFilters.session = event.currentTarget.value || null;
            this.renderParticipants();
        });
        participantsTeamFilter?.addEventListener('change', (event) => {
            this.participantFilters.team = event.currentTarget.value || null;
            this.renderParticipants();
        });
        participantsRoleFilter?.addEventListener('change', (event) => {
            this.participantFilters.role = event.currentTarget.value || null;
            this.renderParticipants();
        });
        timelineTeamFilter?.addEventListener('change', (event) => {
            this.timelineFilters.team = event.currentTarget.value || null;
            this.renderTimeline();
        });
        timelineRoleFilter?.addEventListener('change', (event) => {
            this.timelineFilters.role = event.currentTarget.value || null;
            this.renderTimeline();
        });
        timelineMoveFilter?.addEventListener('change', (event) => {
            this.timelineFilters.move = event.currentTarget.value || null;
            this.renderTimeline();
        });
        timelineActivityTypeFilter?.addEventListener('change', (event) => {
            this.timelineFilters.activityType = event.currentTarget.value || null;
            this.renderTimeline();
        });

        const settingsTabs = document.getElementById('settingsTabs');
        if (settingsTabs) {
            settingsTabs.addEventListener('click', (event) => {
                const button = event.target.closest('.tab-button[data-settings-tab]');
                if (!button || !settingsTabs.contains(button)) return;

                const targetTab = button.dataset.settingsTab;
                settingsTabs.querySelectorAll('.tab-button[data-settings-tab]').forEach((tabButton) => {
                    const isActive = tabButton.dataset.settingsTab === targetTab;
                    tabButton.classList.toggle('tab-button-active', isActive);
                    tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
                });
                settingsTabs.querySelectorAll('.tab-panel[data-settings-panel]').forEach((panel) => {
                    panel.hidden = panel.dataset.settingsPanel !== targetTab;
                });
            });
        }

        [
            ['strategicOrientationList', 'strategicOrientation'],
            ['actionsList', 'actions'],
            ['responsesList', 'responses'],
            ['proposalsList', 'proposals']
        ].forEach(([elementId, section]) => {
            const queueEl = document.getElementById(elementId);
            queueEl?.addEventListener('click', (event) => {
                const tabButton = event.target.closest('.tab-button[data-review-tab]');
                if (!tabButton || !queueEl.contains(tabButton)) return;
                this.setReviewActiveTab(section, tabButton.dataset.reviewTab, queueEl);
            });
        });

        const participantsList = document.getElementById('participantsList');
        participantsList?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-participant-action="remove"]');
            if (!button) return;
            const seatId = button.dataset.participantSeatId;
            if (!seatId) return;
            this.handleRemoveParticipantSeat(seatId).catch((err) => {
                logger.error('Failed to handle participant removal:', err);
            });
        });

        const sessionsList = document.getElementById('sessionsList');
        sessionsList?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-session-action]');
            if (!button) return;
            const action = button.dataset.sessionAction;
            const sessionId = button.dataset.sessionId;
            if (action === 'create') {
                this.showCreateSessionAdminModal();
            } else if (action === 'delete' && sessionId) {
                this.handleDeleteSessionAdmin(sessionId).catch((err) => {
                    logger.error('Failed to delete session:', err);
                });
            } else if (action === 'refresh') {
                this.loadSessionsAdmin().catch((err) => {
                    logger.error('Failed to refresh sessions:', err);
                });
            }
        });

        const exportDataList = document.getElementById('exportDataList');
        exportDataList?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-export-type]');
            if (!button) return;
            const exportType = button.dataset.exportType;
            this.handleExportAdmin(exportType).catch((err) => {
                logger.error('Failed to export:', err);
            });
        });

        scribeDeckSettingsList?.addEventListener('click', (event) => {
            // Segmented source toggle: reveal that method's input, no submit.
            const methodButton = event.target.closest('button[data-scribe-deck-method]');
            if (methodButton) {
                const card = methodButton.closest('.scribe-deck-card');
                if (card) {
                    const method = methodButton.dataset.scribeDeckMethod;
                    card.dataset.deckMethod = method;
                    card.querySelectorAll('button[data-scribe-deck-method]').forEach((btn) => {
                        btn.setAttribute('aria-pressed', String(btn.dataset.scribeDeckMethod === method));
                    });
                }
                return;
            }

            const button = event.target.closest('button[data-scribe-deck-action][data-scribe-deck-team]');
            if (!button) return;

            const teamId = button.dataset.scribeDeckTeam;
            const action = button.dataset.scribeDeckAction;
            if (!teamId) return;

            this.handleScribeDeckAssignmentSubmit(teamId, {
                useDefault: action === 'reset',
                useUpload: action === 'upload'
            }).catch((err) => {
                logger.error('Failed to assign facilitator deck:', err);
            });
        });

        tribeStreetJournalList?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-journal-action="send-update"]');
            if (!button) return;
            const eventId = button.dataset.sourceEventId;
            const sourceEvent = this.tribeStreetJournalEntries.find((entry) => entry.id === eventId);
            if (!sourceEvent) return;
            this.showSectionUpdateComposer({
                title: 'Send Tribe Street Journal Update',
                contentKind: WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL,
                initialContent: sourceEvent.content || sourceEvent.description || '',
                sourceMetadata: {
                    source_event_id: sourceEvent.id,
                    source_team: sourceEvent.team,
                    source_event_type: sourceEvent.type || sourceEvent.event_type || 'NOTE'
                }
            });
        });

        verbaAiComposeButton?.addEventListener('click', () => {
            this.showSectionUpdateComposer({
                title: 'Send Verba AI Population Sentiment',
                contentKind: WHITE_CELL_UPDATE_KINDS.VERBA_AI_POPULATION_SENTIMENT,
                initialContent: '',
                sourceMetadata: {}
            });
        });

        document.querySelectorAll?.('.sidebar-link[data-section]')?.forEach((link) => {
            link.addEventListener('click', () => {
                if (link.dataset.section === 'strategicOrientation') {
                    this.clearQueueArrivalHighlights('strategicOrientation');
                }

                if (link.dataset.section === 'actions') {
                    this.clearQueueArrivalHighlights('actions');
                }

                if (link.dataset.section === 'proposals') {
                    this.clearQueueArrivalHighlights('proposals');
                }

                if (link.dataset.section === 'responses') {
                    this.clearQueueArrivalHighlights('responses');
                }
            });
        });
    }

    subscribeToLiveData() {
        this.storeUnsubscribers.push(
            gameStateStore.subscribe((_event, state) => {
                this.syncGameStateFromStore(state);
            })
        );

        this.storeUnsubscribers.push(
            actionsStore.subscribe((event) => {
                this.syncActionsFromStore({
                    announce: event === 'created' || event === 'updated'
                });
                this.flushQueueArrivalAnnouncement();
            })
        );

        this.storeUnsubscribers.push(
            requestsStore.subscribe(() => {
                this.syncRfisFromStore();
            })
        );

        this.storeUnsubscribers.push(
            communicationsStore.subscribe(() => {
                this.syncActionsFromStore();
                this.syncCommunicationsFromStore();
            })
        );

        this.storeUnsubscribers.push(
            participantsStore.subscribe(() => {
                this.syncParticipantsFromStore();
            })
        );

        this.storeUnsubscribers.push(
            timelineStore.subscribe(() => {
                this.syncTimelineFromStore();
            })
        );
    }

    getCurrentGameState() {
        return gameStateStore.getState() || sessionStore.getSessionData()?.gameState || {
            move: 1,
            phase: 1,
            timer_seconds: this.currentTimerSeconds,
            timer_running: this.timerRunning
        };
    }

    syncGameStateFromStore(gameState) {
        const safeGameState = gameState || {};
        this.currentTimerSeconds = gameState?.timer_seconds ?? CONFIG.DEFAULT_TIMER_SECONDS;
        this.timerAllocations = normalizeTimerAllocations(gameState?.timer_allocations);
        this.pluginState = normalizePluginState(gameState?.plugin_state);
        this.timerRunning = Boolean(gameState?.timer_running && this.currentTimerSeconds > 0);
        this.updateGameStateDisplay({
            ...safeGameState,
            timer_allocations: this.timerAllocations,
            plugin_state: this.pluginState,
            timer_seconds: this.currentTimerSeconds,
            timer_running: this.timerRunning
        });
        this.updateTimerDisplay();
        this.updateTimerStatusDisplay();
        this.updateTimerAllocationControls();
        this.updateTimerControlButtons();
        this.renderPluginSettings();
        this.reconcilePluginMounts();
    }

    getCurrentTimerMark() {
        return resolveGameStateTimerMark(this.getCurrentGameState(), actionsStore.getAll());
    }

    getCurrentTimerAllocationSeconds() {
        return getTimerAllocationSeconds(this.timerAllocations, this.getCurrentTimerMark().key);
    }

    updateTimerAllocationControls() {
        const canControl = this.isLeadOperator();
        const currentMark = this.getCurrentTimerMark();
        const currentMinutes = secondsToWholeMinutes(
            getTimerAllocationSeconds(this.timerAllocations, currentMark.key)
        );
        const currentMarkEl = document.getElementById('timerAllocationCurrentMark');
        const resetTimerBtn = document.getElementById('resetTimerBtn');
        const saveBtn = document.getElementById('timerAllocationSaveBtn');
        const resetCurrentBtn = document.getElementById('timerAllocationResetCurrentBtn');
        const fields = Array.from(
            document.querySelectorAll?.('[data-timer-allocation-mark]') || []
        );

        fields.forEach((field) => {
            const markKey = field.dataset?.timerAllocationMark;
            if (!markKey) return;

            field.value = String(secondsToWholeMinutes(
                getTimerAllocationSeconds(this.timerAllocations, markKey)
            ));
            field.disabled = !canControl;
            field.setAttribute?.('aria-disabled', field.disabled ? 'true' : 'false');
        });

        if (currentMarkEl) {
            currentMarkEl.textContent = `Current reset target: ${currentMark.label} - ${currentMinutes} minute${currentMinutes === 1 ? '' : 's'}`;
        }

        if (resetTimerBtn) {
            resetTimerBtn.textContent = `Reset to ${currentMinutes} min`;
        }

        [resetTimerBtn, saveBtn, resetCurrentBtn].forEach((button) => {
            if (!button) return;
            button.disabled = !canControl;
            button.setAttribute?.('aria-disabled', button.disabled ? 'true' : 'false');
            button.title = canControl
                ? ''
                : 'White Cell support is read-only for game controls.';
        });
    }

    applyPluginState(pluginState = {}) {
        this.pluginState = normalizePluginState(pluginState);
        this.renderPluginSettings();
        this.reconcilePluginMounts();
    }

    async handlePluginToggle(toggle) {
        const pluginId = toggle?.dataset?.pluginId;
        const plugin = getRegisteredPlugins().find((entry) => entry.id === pluginId);
        if (!plugin) {
            showToast({ message: 'Unknown plugin selection.', type: 'error' });
            return;
        }

        const previousState = normalizePluginState(this.pluginState);
        const enabled = Boolean(toggle.checked);
        const mountedPlugin = this.mountedPlugins.get(pluginId);
        const sharedRecordingActive = pluginId === 'session-recorder' && isSessionRecorderNoticeActive(previousState);
        if (!enabled && (mountedPlugin?.mountResult?.isRecordingActive?.() || sharedRecordingActive)) {
            const confirmed = await confirmModal({
                title: 'Stop active recording?',
                message: `Disabling ${plugin.label} will stop the active recording and release the microphone.`,
                confirmLabel: 'Stop And Disable',
                cancelLabel: 'Keep Recording',
                variant: 'warning'
            });

            if (!confirmed) {
                toggle.checked = true;
                return;
            }
        }

        const nextState = setPluginEnabledInState(previousState, pluginId, enabled);
        this.applyPluginState(nextState);

        try {
            const updatedState = await gameStateStore.setPluginEnabled(pluginId, enabled);
            if (!updatedState) {
                throw new Error('Game state is not available for plugin persistence.');
            }

            this.applyPluginState(updatedState.plugin_state || nextState);
            showToast({
                message: `${plugin.label} ${enabled ? 'enabled' : 'disabled'}.`,
                type: 'success'
            });
        } catch (err) {
            logger.error('Failed to save plugin state:', err);
            this.applyPluginState(previousState);
            showToast({
                message: getUserMessage(err, {
                    fallback: `Failed to ${enabled ? 'enable' : 'disable'} ${plugin.label}. Check the session state and try again.`
                }),
                type: 'error'
            });
        }
    }

    renderPluginSettings() {
        const container = document.getElementById('pluginSettingsList');
        if (!container) return;

        const plugins = getRegisteredPlugins();
        if (plugins.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No plugins are registered for this build.</p>';
            return;
        }

        const state = normalizePluginState(this.pluginState);
        container.innerHTML = plugins.map((plugin) => {
            const enabled = Boolean(state[plugin.id]?.enabled);
            const statusText = enabled ? 'Enabled' : 'Disabled';
            const statusVariant = enabled ? 'success' : 'default';
            const descriptionId = `pluginDescription-${plugin.id}`;
            const statusId = `pluginStatus-${plugin.id}`;
            const toggleId = `pluginToggle-${plugin.id}`;
            const tags = (plugin.capabilityTags || []).map((tag) => (
                createBadge({
                    text: tag,
                    variant: 'info',
                    size: 'sm',
                    rounded: true
                }).outerHTML
            )).join('');

            return `
                <div class="plugin-card card card-bordered" data-plugin-id="${this.escapeHtml(plugin.id)}" data-plugin-enabled="${enabled ? 'true' : 'false'}">
                    <div class="plugin-card-main">
                        <div class="plugin-card-head">
                            <div>
                                <h4 class="text-base font-semibold" style="margin: 0 0 var(--space-1);">${this.escapeHtml(plugin.label)}</h4>
                                <p class="text-sm text-gray-500" id="${this.escapeHtml(descriptionId)}" style="margin: 0;">${this.escapeHtml(plugin.description)}</p>
                            </div>
                            <div class="plugin-status" id="${this.escapeHtml(statusId)}">
                                <span class="plugin-status-icon ${enabled ? 'plugin-status-icon-enabled' : 'plugin-status-icon-disabled'}" aria-hidden="true">
                                    <svg viewBox="0 0 12 12" focusable="false">
                                        <circle cx="6" cy="6" r="4"></circle>
                                    </svg>
                                </span>
                                ${createBadge({ text: statusText, variant: statusVariant, size: 'sm', rounded: true }).outerHTML}
                            </div>
                        </div>
                        ${tags ? `<div class="badge-group plugin-tags" aria-label="${this.escapeHtml(plugin.label)} capability tags">${tags}</div>` : ''}
                    </div>
                    <label class="switch-field plugin-toggle-field" for="${this.escapeHtml(toggleId)}">
                        <span class="switch-field-label">Enable plugin</span>
                        <span class="switch">
                            <input
                                type="checkbox"
                                id="${this.escapeHtml(toggleId)}"
                                data-plugin-toggle
                                data-plugin-id="${this.escapeHtml(plugin.id)}"
                                aria-label="${this.escapeHtml(`${enabled ? 'Disable' : 'Enable'} ${plugin.label}`)}"
                                aria-describedby="${this.escapeHtml(`${descriptionId} ${statusId}`)}"
                                ${enabled ? 'checked' : ''}
                            >
                            <span class="switch-track"></span>
                        </span>
                    </label>
                </div>
            `;
        }).join('');
    }

    getPluginMountHost(pluginId) {
        const container = document.getElementById('whiteCellPluginMounts');
        if (!container) return null;

        container.hidden = false;
        const existingHost = Array.from(container.children || [])
            .find((child) => child?.dataset?.pluginMount === pluginId);
        if (existingHost) {
            return existingHost;
        }

        const host = document.createElement('div');
        host.className = 'plugin-mount';
        host.dataset.pluginMount = pluginId;
        container.appendChild(host);
        return host;
    }

    reconcilePluginMounts() {
        const state = normalizePluginState(this.pluginState);
        const documentRef = typeof document !== 'undefined' ? document : null;
        if (!documentRef) return;

        const context = {
            controller: this,
            document: documentRef,
            gameState: this.getCurrentGameState(),
            gameStateStore,
            sessionStore
        };

        getRegisteredPlugins().forEach((plugin) => {
            const shouldMount = isPluginVisible(plugin, state, context);
            const mountedPlugin = this.mountedPlugins.get(plugin.id);

            if (shouldMount && !mountedPlugin) {
                const host = this.getPluginMountHost(plugin.id);
                const mountResult = plugin.mount?.({
                    ...context,
                    host,
                    plugin,
                    pluginState: state[plugin.id]
                }) ?? null;
                this.mountedPlugins.set(plugin.id, {
                    host,
                    mountResult,
                    plugin
                });
                return;
            }

            if (!shouldMount && mountedPlugin) {
                mountedPlugin.plugin.unmount?.(mountedPlugin.mountResult, {
                    ...context,
                    host: mountedPlugin.host,
                    plugin,
                    pluginState: state[plugin.id]
                });
                if (mountedPlugin.host) {
                    mountedPlugin.host.innerHTML = '';
                    mountedPlugin.host.remove?.();
                }
                this.mountedPlugins.delete(plugin.id);
            }
        });

        const mountContainer = document.getElementById('whiteCellPluginMounts');
        if (mountContainer && this.mountedPlugins.size === 0) {
            mountContainer.hidden = true;
        }
    }

    readTimerAllocationFormValues() {
        const nextAllocations = { ...this.timerAllocations };
        const fields = Array.from(
            document.querySelectorAll?.('[data-timer-allocation-mark]') || []
        );
        const errors = [];

        fields.forEach((field) => {
            const markKey = field.dataset?.timerAllocationMark;
            const mark = TIMER_ALLOCATION_MARKS.find((entry) => entry.key === markKey);
            if (!mark) return;

            const minutes = Number(field.value);
            if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600) {
                errors.push(`${mark.label} must be between 1 and 600 minutes.`);
                return;
            }

            nextAllocations[mark.key] = minutesToAllocationSeconds(minutes);
        });

        return {
            allocations: normalizeTimerAllocations(nextAllocations),
            errors
        };
    }

    async handleTimerAllocationSubmit(event) {
        event?.preventDefault?.();

        if (!this.isLeadOperator()) {
            showToast({ message: 'White Cell support is read-only for game controls.', type: 'warning' });
            return;
        }

        const { allocations, errors } = this.readTimerAllocationFormValues();
        if (errors.length > 0) {
            showToast({ message: errors[0], type: 'error' });
            return;
        }

        try {
            const updatedState = await gameStateStore.setTimerAllocations(allocations);
            this.timerAllocations = normalizeTimerAllocations(updatedState?.timer_allocations || allocations);
            this.updateTimerAllocationControls();
            showToast({ message: 'Timer allocations saved', type: 'success' });
        } catch (err) {
            logger.error('Failed to save timer allocations:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to save timer allocations. Apply the timer allocation database patch and try again.'
                }),
                type: 'error'
            });
        }
    }

    async resetTimerToCurrentAllocation() {
        if (!this.isLeadOperator()) {
            showToast({ message: 'White Cell support is read-only for game controls.', type: 'warning' });
            return;
        }

        const currentMark = this.getCurrentTimerMark();
        const seconds = getTimerAllocationSeconds(this.timerAllocations, currentMark.key);
        const minutes = secondsToWholeMinutes(seconds);
        const confirmed = await confirmModal({
            title: 'Reset Timer',
            message: `Reset the timer to ${minutes} minute${minutes === 1 ? '' : 's'} for ${currentMark.label}?`,
            confirmLabel: 'Reset',
            variant: 'primary'
        });

        if (!confirmed) return;

        await gameStateStore.resetTimer(seconds);
        showToast({ message: `${currentMark.label} timer reset`, type: 'success' });
    }

    updateTimerDisplay() {
        const controlDisplay = document.getElementById('controlTimerDisplay');
        const headerDisplay = document.getElementById('timerDisplay');
        const minutes = Math.floor(this.currentTimerSeconds / 60);
        const seconds = this.currentTimerSeconds % 60;
        const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        if (controlDisplay) controlDisplay.textContent = formatted;
        if (headerDisplay) headerDisplay.textContent = formatted;
    }

    updateTimerStatusDisplay() {
        const statusText = this.timerRunning ? 'Running' : 'Paused';
        const statusEls = [
            document.getElementById('timerStatusLabel'),
            document.getElementById('timerStatus')
        ];

        statusEls.forEach((element) => {
            if (!element) return;
            element.textContent = statusText;
            element.classList.toggle('timer-running', this.timerRunning);
        });
    }

    updateTimerControlButtons() {
        const startTimerBtn = document.getElementById('startTimerBtn');
        const pauseTimerBtn = document.getElementById('pauseTimerBtn');

        if (!startTimerBtn && !pauseTimerBtn) {
            return;
        }

        const canControl = this.isLeadOperator();
        const hasRemainingTime = this.currentTimerSeconds > 0;
        const currentAllocationSeconds = this.getCurrentTimerAllocationSeconds();
        const shouldShowResume = !this.timerRunning
            && hasRemainingTime
            && this.currentTimerSeconds < currentAllocationSeconds;

        if (startTimerBtn) {
            startTimerBtn.textContent = shouldShowResume ? 'Resume' : 'Start';
            startTimerBtn.disabled = !canControl || this.timerRunning || !hasRemainingTime;
            startTimerBtn.setAttribute?.('aria-disabled', startTimerBtn.disabled ? 'true' : 'false');
            startTimerBtn.title = !canControl
                ? 'White Cell support is read-only for game controls.'
                : (!hasRemainingTime
                    ? 'Reset the timer before starting again.'
                    : (this.timerRunning ? 'Timer is already running.' : 'Start the timer.'));
        }

        if (pauseTimerBtn) {
            pauseTimerBtn.disabled = !canControl || !this.timerRunning;
            pauseTimerBtn.setAttribute?.('aria-disabled', pauseTimerBtn.disabled ? 'true' : 'false');
            pauseTimerBtn.title = !canControl
                ? 'White Cell support is read-only for game controls.'
                : (this.timerRunning ? 'Pause the timer.' : 'Timer is already paused.');
        }
    }

    updateGameStateDisplay(gameState = {}) {
        const move = gameState.move ?? 1;
        const phase = gameState.phase ?? 1;
        const moveLabel = ENUMS.MOVES[move] || `Move ${move}`;
        const phaseLabel = ENUMS.PHASES[phase] || `Phase ${phase}`;

        const currentMove = document.getElementById('currentMove');
        const currentPhase = document.getElementById('currentPhase');
        const currentMoveLabel = document.getElementById('moveLabel');
        const currentPhaseLabel = document.getElementById('phaseLabel');
        const headerDisplay = getHeaderGameStateDisplay(gameState, actionsStore.getAll());

        if (currentMove) currentMove.textContent = move;
        if (currentPhase) currentPhase.textContent = phase;
        if (currentMoveLabel) currentMoveLabel.textContent = moveLabel;
        if (currentPhaseLabel) currentPhaseLabel.textContent = phaseLabel;
        applyHeaderGameStateDisplay(headerDisplay);

        this.updateGameControlAvailability(move, phase);
    }

    getStrategicOrientationGateState() {
        return getStrategicOrientationCompletion(actionsStore.getAll());
    }

    isStrategicOrientationPeriodComplete() {
        return this.getStrategicOrientationGateState().complete;
    }

    shouldGateStrategicOrientation({
        move = null,
        phase = null,
        phaseOneOnly = true
    } = {}) {
        const gameState = this.getCurrentGameState();
        const resolvedMove = move ?? gameState.move ?? 1;
        const resolvedPhase = phase ?? gameState.phase ?? 1;

        return resolvedMove === 1
            && (!phaseOneOnly || resolvedPhase === 1)
            && !this.isStrategicOrientationPeriodComplete();
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

        return `Strategic Orientation must be completed before Move 1 begins. Missing: ${missingLabels || 'none'}.`;
    }

    updateGameControlAvailability(move, phase) {
        const prevMoveBtn = document.getElementById('prevMoveBtn');
        const nextMoveBtn = document.getElementById('nextMoveBtn');
        const prevPhaseBtn = document.getElementById('prevPhaseBtn');
        const nextPhaseBtn = document.getElementById('nextPhaseBtn');
        const orientationGateActive = this.shouldGateStrategicOrientation({ move, phase });

        if (!this.isLeadOperator()) {
            if (prevMoveBtn) prevMoveBtn.disabled = true;
            if (nextMoveBtn) nextMoveBtn.disabled = true;
            if (prevPhaseBtn) prevPhaseBtn.disabled = true;
            if (nextPhaseBtn) nextPhaseBtn.disabled = true;
            return;
        }

        if (prevMoveBtn) prevMoveBtn.disabled = move <= 1;
        if (nextMoveBtn) nextMoveBtn.disabled = move >= 3 || orientationGateActive;
        if (prevPhaseBtn) prevPhaseBtn.disabled = phase <= 1;
        if (nextPhaseBtn) nextPhaseBtn.disabled = phase >= 5 || orientationGateActive;
    }

    async startTimer() {
        if (this.timerRunning) return;

        await gameStateStore.startTimer();

        showToast({ message: 'Timer started', type: 'success' });
        logger.info('Timer started');
    }

    async pauseTimer({ silent = false } = {}) {
        await gameStateStore.pauseTimer();

        if (!silent) {
            showToast({ message: 'Timer paused', type: 'info' });
        }

        logger.info('Timer paused');
    }

    async resetTimer() {
        await this.resetTimerToCurrentAllocation();
    }

    async advancePhase() {
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        const currentState = this.getCurrentGameState();
        const currentPhase = currentState.phase ?? 1;
        const currentMove = currentState.move ?? 1;

        if (this.shouldGateStrategicOrientation({ move: currentMove, phase: currentPhase })) {
            showToast({ message: this.getStrategicOrientationGateMessage(), type: 'warning' });
            return;
        }

        if (currentPhase >= 5) {
            showToast({ message: 'Already at the final phase for this move.', type: 'warning' });
            return;
        }

        const confirmed = await confirmModal({
            title: 'Advance Phase',
            message: `Advance from Phase ${currentPhase} to Phase ${currentPhase + 1}?`,
            confirmLabel: 'Advance',
            variant: 'primary'
        });

        if (!confirmed) return;

        const loader = showLoader({ message: 'Advancing phase...' });

        try {
            const updatedState = await gameStateStore.advancePhase();
            if (!updatedState) {
                throw new Error('Phase advance failed');
            }

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'PHASE_CHANGE',
                content: `Phase advanced from ${currentPhase} to ${updatedState.phase}`,
                metadata: { role: this.getTimelineActorRole() },
                team: 'white_cell',
                move: currentMove,
                phase: updatedState.phase
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: `Advanced to Phase ${updatedState.phase}`, type: 'success' });
            logger.info(`Phase advanced to ${updatedState.phase}`);
        } catch (err) {
            logger.error('Failed to advance phase:', err);
            showToast({ message: 'Failed to advance phase', type: 'error' });
        } finally {
            hideLoader();
        }
    }

    async regressPhase() {
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        const currentState = this.getCurrentGameState();
        const currentPhase = currentState.phase ?? 1;
        const currentMove = currentState.move ?? 1;

        if (currentPhase <= 1) {
            showToast({ message: 'Already at the first phase.', type: 'warning' });
            return;
        }

        const confirmed = await confirmModal({
            title: 'Return to Previous Phase',
            message: `Move back from Phase ${currentPhase} to Phase ${currentPhase - 1}?`,
            confirmLabel: 'Return',
            variant: 'primary'
        });

        if (!confirmed) return;

        const loader = showLoader({ message: 'Returning to previous phase...' });

        try {
            const updatedState = await gameStateStore.regressPhase();
            if (!updatedState) {
                throw new Error('Phase regression failed');
            }

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'PHASE_CHANGE',
                content: `Phase moved back from ${currentPhase} to ${updatedState.phase}`,
                metadata: { role: this.getTimelineActorRole() },
                team: 'white_cell',
                move: currentMove,
                phase: updatedState.phase
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: `Returned to Phase ${updatedState.phase}`, type: 'success' });
            logger.info(`Phase regressed to ${updatedState.phase}`);
        } catch (err) {
            logger.error('Failed to regress phase:', err);
            showToast({ message: 'Failed to return to previous phase', type: 'error' });
        } finally {
            hideLoader();
        }
    }

    async advanceMove() {
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        const currentState = this.getCurrentGameState();
        const currentMove = currentState.move ?? 1;

        if (this.shouldGateStrategicOrientation({
            move: currentMove,
            phase: currentState.phase ?? 1,
            phaseOneOnly: false
        })) {
            showToast({ message: this.getStrategicOrientationGateMessage(), type: 'warning' });
            return;
        }

        if (currentMove >= 3) {
            showToast({ message: 'Already at the final move (Move 3).', type: 'warning' });
            return;
        }

        const confirmed = await confirmModal({
            title: 'Advance Move',
            message: `Advance from Move ${currentMove} to Move ${currentMove + 1}? This resets the phase to 1.`,
            confirmLabel: 'Advance',
            variant: 'primary'
        });

        if (!confirmed) return;

        const loader = showLoader({ message: 'Advancing move...' });

        try {
            const updatedState = await gameStateStore.advanceMove();
            if (!updatedState) {
                throw new Error('Move advance failed');
            }

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'MOVE_CHANGE',
                content: `Move advanced from ${currentMove} to ${updatedState.move}`,
                metadata: { role: this.getTimelineActorRole() },
                team: 'white_cell',
                move: updatedState.move,
                phase: updatedState.phase
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: `Advanced to Move ${updatedState.move}`, type: 'success' });
            logger.info(`Move advanced to ${updatedState.move}`);
        } catch (err) {
            logger.error('Failed to advance move:', err);
            showToast({ message: 'Failed to advance move', type: 'error' });
        } finally {
            hideLoader();
        }
    }

    async regressMove() {
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        const currentState = this.getCurrentGameState();
        const currentMove = currentState.move ?? 1;

        if (currentMove <= 1) {
            showToast({ message: 'Already at the first move.', type: 'warning' });
            return;
        }

        const confirmed = await confirmModal({
            title: 'Return to Previous Move',
            message: `Move back from Move ${currentMove} to Move ${currentMove - 1}? This resets the phase to 1.`,
            confirmLabel: 'Return',
            variant: 'primary'
        });

        if (!confirmed) return;

        const loader = showLoader({ message: 'Returning to previous move...' });

        try {
            const updatedState = await gameStateStore.regressMove();
            if (!updatedState) {
                throw new Error('Move regression failed');
            }

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'MOVE_CHANGE',
                content: `Move returned from ${currentMove} to ${updatedState.move}`,
                metadata: { role: this.getTimelineActorRole() },
                team: 'white_cell',
                move: updatedState.move,
                phase: updatedState.phase
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: `Returned to Move ${updatedState.move}`, type: 'success' });
            logger.info(`Move regressed to ${updatedState.move}`);
        } catch (err) {
            logger.error('Failed to regress move:', err);
            showToast({ message: 'Failed to return to previous move', type: 'error' });
        } finally {
            hideLoader();
        }
    }

    syncActionsFromStore({
        announce = false
    } = {}) {
        const allActions = actionsStore.getAll();
        this.actions = actionsStore.getPending();
        this.strategicOrientationArtifacts = allActions.filter((action) => (
            isStrategicOrientationAction(action) && !isDraftAction(action)
        ));
        // Keep both awaiting-review and already-deliberated items so each review
        // section can split them across "Awaiting Review" / "Deliberated" tabs.
        this.blueTeamActions = allActions.filter((action) => (
            action?.team === 'blue'
            && !isDraftAction(action)
            && !isStrategicOrientationAction(action)
        ));
        this.proposalTeamProposals = allActions.filter((action) => (
            isProposalTeamId(action?.team)
            && !isDraftAction(action)
            && !isStrategicOrientationAction(action)
            && this.isProposalAction(action)
        ));
        this.greenTeamProposals = this.proposalTeamProposals;
        this.redTeamResponses = allActions.filter((action) => (
            action?.team === 'red'
            && !isDraftAction(action)
            && !isStrategicOrientationAction(action)
        ));
        const pendingStrategicOrientationArtifacts = this.strategicOrientationArtifacts.filter((action) => canAdjudicateAction(action));
        const pendingBlueTeamActions = this.blueTeamActions.filter((action) => canAdjudicateAction(action));
        const pendingProposalTeamProposals = this.proposalTeamProposals.filter((action) => canAdjudicateAction(action));
        const pendingRedTeamResponses = this.redTeamResponses.filter((action) => canAdjudicateAction(action));
        this.captureQueueArrivals({
            strategicOrientationArtifacts: this.strategicOrientationArtifacts,
            blueTeamActions: this.blueTeamActions,
            proposalTeamProposals: this.proposalTeamProposals,
            greenTeamProposals: this.greenTeamProposals,
            redTeamResponses: this.redTeamResponses
        }, {
            announce
        });

        this.renderStrategicOrientationReview();
        this.renderActionReview();
        this.renderMoveResponses();
        this.renderProposals();
        this.renderAdjudicationQueue();
        const gameState = this.getCurrentGameState();
        this.updateGameStateDisplay(gameState);
        this.updateTimerAllocationControls();
        this.updateTimerControlButtons();

        this.updateSidebarBadge('strategicOrientationBadge', pendingStrategicOrientationArtifacts.length);
        this.updateSidebarBadge('actionsBadge', pendingBlueTeamActions.length);
        this.updateSidebarBadge('proposalsBadge', pendingProposalTeamProposals.length);
        this.updateSidebarBadge('responsesBadge', pendingRedTeamResponses.length);
    }

    getPendingActions() {
        return this.actions.filter((action) => canAdjudicateAction(action));
    }

    updateSidebarBadge(badgeId, count) {
        const badge = document.getElementById(badgeId);
        if (!badge) return;

        badge.textContent = String(count);
        badge.hidden = count <= 0;
    }

    captureQueueArrivals({
        strategicOrientationArtifacts = [],
        blueTeamActions = [],
        proposalTeamProposals = null,
        greenTeamProposals = [],
        redTeamResponses = []
    } = {}, {
        announce = false
    } = {}) {
        this.captureQueueArrivalSet({
            queueName: 'strategicOrientation',
            nextItems: strategicOrientationArtifacts,
            seenSet: this.seenStrategicOrientationIds,
            newSet: this.newStrategicOrientationIds,
            hydratedFlag: 'hasHydratedStrategicOrientationQueue',
            announce
        });

        this.captureQueueArrivalSet({
            queueName: 'actions',
            nextItems: blueTeamActions,
            seenSet: this.seenBlueActionIds,
            newSet: this.newBlueActionIds,
            hydratedFlag: 'hasHydratedBlueActionQueue',
            announce
        });

        this.captureQueueArrivalSet({
            queueName: 'proposals',
            nextItems: proposalTeamProposals || greenTeamProposals,
            seenSet: this.seenGreenProposalIds,
            newSet: this.newGreenProposalIds,
            hydratedFlag: 'hasHydratedGreenProposalQueue',
            announce
        });

        this.captureQueueArrivalSet({
            queueName: 'responses',
            nextItems: redTeamResponses,
            seenSet: this.seenRedResponseIds,
            newSet: this.newRedResponseIds,
            hydratedFlag: 'hasHydratedRedResponseQueue',
            announce
        });
    }

    captureQueueArrivalSet({
        queueName,
        nextItems = [],
        seenSet,
        newSet,
        hydratedFlag,
        announce = false
    } = {}) {
        const nextIds = new Set(
            nextItems
                .map((item) => item?.id)
                .filter(Boolean)
        );

        if (!this[hydratedFlag]) {
            seenSet.clear();
            nextIds.forEach((itemId) => seenSet.add(itemId));
            newSet.clear();
            this[hydratedFlag] = true;
            return;
        }

        nextItems.forEach((item) => {
            if (!item?.id || seenSet.has(item.id)) {
                return;
            }

            seenSet.add(item.id);
            newSet.add(item.id);
            if (announce) {
                this.pendingQueueArrivalSummary[queueName].add(item.id);
            }
        });

        newSet.forEach((itemId) => {
            if (!nextIds.has(itemId)) {
                newSet.delete(itemId);
            }
        });
    }

    clearQueueArrivalHighlights(queueName = '') {
        const queueMap = {
            strategicOrientation: {
                newSet: this.newStrategicOrientationIds,
                rerender: () => {
                    this.renderStrategicOrientationReview();
                    this.renderAdjudicationQueue();
                }
            },
            actions: {
                newSet: this.newBlueActionIds,
                rerender: () => {
                    this.renderActionReview();
                    this.renderAdjudicationQueue();
                }
            },
            proposals: {
                newSet: this.newGreenProposalIds,
                rerender: () => {
                    this.renderProposals();
                    this.renderAdjudicationQueue();
                }
            },
            responses: {
                newSet: this.newRedResponseIds,
                rerender: () => {
                    this.renderMoveResponses();
                    this.renderAdjudicationQueue();
                }
            }
        };
        const queueState = queueMap[queueName];
        if (!queueState || queueState.newSet.size === 0) {
            return;
        }

        queueState.newSet.clear();
        queueState.rerender();
    }

    flushQueueArrivalAnnouncement() {
        const strategicOrientationCount = this.pendingQueueArrivalSummary.strategicOrientation.size;
        const actionCount = this.pendingQueueArrivalSummary.actions.size;
        const proposalCount = this.pendingQueueArrivalSummary.proposals.size;
        const responseCount = this.pendingQueueArrivalSummary.responses.size;

        if (strategicOrientationCount === 0 && actionCount === 0 && proposalCount === 0 && responseCount === 0) {
            return;
        }

        const summaryParts = [];
        if (strategicOrientationCount > 0) {
            summaryParts.push(`${strategicOrientationCount} Strategic Orientation artifact${strategicOrientationCount === 1 ? '' : 's'}`);
        }
        if (actionCount > 0) {
            summaryParts.push(`${actionCount} Blue action${actionCount === 1 ? '' : 's'}`);
        }
        if (proposalCount > 0) {
            summaryParts.push(`${proposalCount} proposal${proposalCount === 1 ? '' : 's'}`);
        }
        if (responseCount > 0) {
            summaryParts.push(`${responseCount} Red move response${responseCount === 1 ? '' : 's'}`);
        }

        if (!this.notificationsMuted) {
            showToast({
                message: `New team submissions arrived: ${summaryParts.join(', ')}.`,
                type: 'warning',
                duration: 10000
            });
        }

        this.pendingQueueArrivalSummary.strategicOrientation.clear();
        this.pendingQueueArrivalSummary.actions.clear();
        this.pendingQueueArrivalSummary.proposals.clear();
        this.pendingQueueArrivalSummary.responses.clear();
    }

    isProposalAction(action = {}) {
        return getProposalViewModel(action).hasProposalDetails;
    }

    renderDefinitionList(rows = []) {
        const filteredRows = rows.filter((row) => {
            const value = row?.value;
            return value != null && String(value).trim();
        });

        if (!filteredRows.length) {
            return '<p class="text-sm text-gray-500" style="margin: 0;">No details recorded.</p>';
        }

        return `
            <dl style="margin: 0; display: grid; gap: var(--space-2);">
                ${filteredRows.map((row) => `
                    <div>
                        <dt class="text-xs text-gray-500" style="font-weight: 600;">${this.escapeHtml(row.label)}</dt>
                        <dd class="text-sm" style="margin: var(--space-1) 0 0;">${this.escapeHtml(row.value)}</dd>
                    </div>
                `).join('')}
            </dl>
        `;
    }

    renderSummaryCard(title, rows = []) {
        return `
            <div class="card card-bordered" style="padding: var(--space-3);">
                <h4 class="font-semibold" style="margin: 0 0 var(--space-3);">${this.escapeHtml(title)}</h4>
                ${this.renderDefinitionList(rows)}
            </div>
        `;
    }

    renderProposalDetails(action = {}) {
        const proposalViewModel = getProposalViewModel(action);
        const recipientLabel = proposalViewModel.recipientTeam
            ? this.formatCommunicationRecipient(proposalViewModel.recipientTeam)
            : 'Not specified';

        return `
            <div class="section-grid section-grid-2" style="gap: var(--space-3); margin-top: var(--space-3);">
                ${this.renderSummaryCard('Proposal Overview', [
                    { label: 'Objective', value: proposalViewModel.objective || 'Not specified' },
                    { label: 'Category', value: proposalViewModel.category || 'Not specified' },
                    { label: 'Focus Sector', value: proposalViewModel.focusSector || 'Not specified' },
                    { label: 'Expected Outcomes', value: proposalViewModel.expectedOutcomes || 'Not specified' }
                ])}
                ${this.renderSummaryCard('Routing & Delivery', [
                    { label: 'Originators', value: formatProposalSelection(proposalViewModel.originators, 'Not specified') },
                    { label: 'Intended Partners', value: proposalViewModel.intendedPartners || 'Not specified' },
                    { label: 'Recipient Team', value: recipientLabel },
                    { label: 'Delivery', value: proposalViewModel.delivery || 'Not specified' },
                    { label: 'Timing & Conditions', value: proposalViewModel.timingAndConditions || 'Not specified' }
                ])}
            </div>
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
            [PROPOSAL_RECIPIENT_STATUSES.UNREAD]: `Awaiting recipient confirmation from ${recipientLabel}.`,
            [PROPOSAL_RECIPIENT_STATUSES.ACKNOWLEDGED]: `${recipientLabel} opened this proposal and is reviewing it.`,
            [PROPOSAL_RECIPIENT_STATUSES.RESPONDED]: `Response received from ${responseAudienceLabel}.`,
            [PROPOSAL_RECIPIENT_STATUSES.DECLINED]: `${recipientLabel} declined this proposal.`,
            [PROPOSAL_RECIPIENT_STATUSES.IGNORED]: `${recipientLabel} marked this proposal as ignored.`
        }[status] || `Awaiting recipient confirmation from ${recipientLabel}.`;
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

    getProposalReviewOptions(action = {}) {
        const proposalViewModel = getProposalViewModel(action);
        const recipientTeam = ['blue', 'red'].includes(proposalViewModel.recipientTeam)
            ? proposalViewModel.recipientTeam
            : null;
        const recipientLabel = recipientTeam
            ? this.formatCommunicationRecipient(recipientTeam)
            : 'the intended partner';

        return {
            proposalViewModel,
            recipientTeam,
            recipientLabel,
            decisions: [
                {
                    value: PROPOSAL_REVIEW_DECISIONS.FORWARD_TO_RECIPIENT,
                    label: recipientTeam ? `Forward to ${recipientLabel}` : 'Forward to Intended Partner',
                    outcome: 'SUCCESS',
                    loaderMessage: recipientTeam
                        ? `Forwarding proposal to ${recipientLabel}...`
                        : 'Forwarding proposal...',
                    timelineLabel: recipientTeam
                        ? `Forwarded to ${recipientLabel}`
                        : 'Forwarded to intended partner',
                    successToast: recipientTeam
                        ? `Proposal forwarded to ${recipientLabel}`
                        : 'Proposal forwarded'
                },
                {
                    value: PROPOSAL_REVIEW_DECISIONS.REQUEST_CHANGES,
                    label: 'Request Changes',
                    outcome: 'PARTIAL_SUCCESS',
                    loaderMessage: 'Saving proposal review...',
                    timelineLabel: 'Changes requested',
                    successToast: 'Proposal review saved: changes requested'
                },
                {
                    value: PROPOSAL_REVIEW_DECISIONS.REJECT,
                    label: 'Reject Proposal',
                    outcome: 'FAIL',
                    loaderMessage: 'Saving proposal review...',
                    timelineLabel: 'Rejected',
                    successToast: 'Proposal rejected'
                }
            ]
        };
    }

    getBlueTeamActionSequenceLabel(action = {}) {
        const actionNumber = isStrategicOrientationAction(action)
            ? null
            : getActionSequenceNumber(
                actionsStore.getAll().filter((candidate) => !isStrategicOrientationAction(candidate)),
                action
            );
        return formatActionSequenceLabel({
            teamLabel: this.formatTeamLabel(action.team),
            move: action.move || 1,
            actionNumber
        });
    }

    renderStrategicOrientationReview() {
        this.renderReviewQueue(document.getElementById('strategicOrientationList'), this.strategicOrientationArtifacts, {
            section: 'strategicOrientation',
            newIds: this.newStrategicOrientationIds,
            ariaLabel: 'Strategic Orientation review',
            emptyMessage: 'No Strategic Orientation artifacts have reached White Cell yet.'
        });
    }

    renderActionReview() {
        this.renderReviewQueue(document.getElementById('actionsList'), this.blueTeamActions, {
            section: 'actions',
            newIds: this.newBlueActionIds,
            ariaLabel: 'Blue Team action review',
            emptyMessage: 'No Blue Team actions are awaiting White Cell review.'
        });
    }

    renderMoveResponses() {
        this.renderReviewQueue(document.getElementById('responsesList'), this.redTeamResponses, {
            section: 'responses',
            newIds: this.newRedResponseIds,
            ariaLabel: 'Red Team move response review',
            emptyMessage: 'No Red Team move responses are awaiting White Cell review.'
        });
    }

    renderProposals() {
        this.renderReviewQueue(document.getElementById('proposalsList'), this.proposalTeamProposals, {
            section: 'proposals',
            newIds: this.newGreenProposalIds,
            ariaLabel: 'Green and Industry proposal review',
            emptyMessage: 'No Green or Industry proposals have been submitted yet.'
        });
    }

    renderReviewQueue(container, items = [], { section, newIds, ariaLabel, emptyMessage } = {}) {
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = `<p class="text-sm text-gray-500">${this.escapeHtml(emptyMessage)}</p>`;
            return;
        }

        const groups = [
            {
                key: 'pending',
                label: 'Awaiting Review',
                emptyHint: 'Nothing is awaiting review right now.',
                items: items.filter((action) => canAdjudicateAction(action))
            },
            {
                key: 'deliberated',
                label: 'Deliberated',
                emptyHint: 'No items have been deliberated yet.',
                items: items.filter((action) => isAdjudicatedAction(action))
            }
        ];

        // Default to the stored tab when it has content, otherwise the first
        // non-empty group, so operators always land on something actionable.
        let activeKey = this.reviewActiveTabs[section];
        if (!groups.some((group) => group.key === activeKey && group.items.length)) {
            activeKey = (groups.find((group) => group.items.length) || groups[0]).key;
        }
        this.reviewActiveTabs[section] = activeKey;

        const tabList = groups.map((group) => {
            const isActive = group.key === activeKey;
            return `
                <button
                    type="button"
                    class="tab-button${isActive ? ' tab-button-active' : ''}"
                    data-review-tab="${group.key}"
                    role="tab"
                    aria-selected="${isActive ? 'true' : 'false'}"
                    aria-controls="reviewPanel-${section}-${group.key}"
                >${group.label}${group.items.length ? `<span class="tab-badge">${group.items.length}</span>` : ''}</button>
            `;
        }).join('');

        const panels = groups.map((group) => {
            const isActive = group.key === activeKey;
            const visibleItems = group.items.slice(0, WHITE_CELL_REVIEW_GROUP_RENDER_LIMIT);
            const hiddenCount = Math.max(0, group.items.length - visibleItems.length);
            const body = group.items.length
                ? visibleItems.map((action) => this.renderActionCard(action, {
                    showAdjudicateAction: this.isLeadOperator() && canAdjudicateAction(action),
                    includeOutcome: true,
                    isNew: newIds?.has(action.id)
                })).join('')
                : `<p class="text-sm text-gray-500" style="margin: 0;">${group.emptyHint}</p>`;
            const overflowNote = hiddenCount
                ? `<p class="text-xs text-gray-500" style="margin: var(--space-2) 0 0;">Showing the first ${WHITE_CELL_REVIEW_GROUP_RENDER_LIMIT} of ${group.items.length} records in this queue.</p>`
                : '';
            return `
                <div
                    class="tab-panel"
                    id="reviewPanel-${section}-${group.key}"
                    data-review-panel="${group.key}"
                    role="tabpanel"
                    ${isActive ? '' : 'hidden'}
                >${body}${overflowNote}</div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="tabbed-section" data-review-tabs="${section}">
                <div class="tab-list" role="tablist" aria-label="${this.escapeHtml(ariaLabel || 'Review queue')}">
                    ${tabList}
                </div>
                ${panels}
            </div>
        `;

        this.bindActionCardButtons(container);
    }

    setReviewActiveTab(section, tab, container) {
        if (!tab || this.reviewActiveTabs[section] === tab) return;
        this.reviewActiveTabs[section] = tab;
        if (!container || typeof container.querySelectorAll !== 'function') return;
        container.querySelectorAll('.tab-button[data-review-tab]').forEach((button) => {
            const isActive = button.dataset.reviewTab === tab;
            button.classList.toggle('tab-button-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        container.querySelectorAll('.tab-panel[data-review-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.reviewPanel !== tab;
        });
    }

    renderAdjudicationQueue() {
        const container = document.getElementById('adjudicationQueue');
        if (!container) return;

        const pendingActions = this.getPendingActions();

        if (pendingActions.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No actions are waiting for White Cell deliberation.</p>';
            return;
        }

        const visiblePendingActions = pendingActions.slice(0, WHITE_CELL_ADJUDICATION_RENDER_LIMIT);
        const hiddenCount = Math.max(0, pendingActions.length - visiblePendingActions.length);

        container.innerHTML = `
            ${hiddenCount ? `<p class="text-xs text-gray-500" style="margin: 0 0 var(--space-3);">Showing the first ${WHITE_CELL_ADJUDICATION_RENDER_LIMIT} of ${pendingActions.length} pending records.</p>` : ''}
            ${visiblePendingActions.map((action) =>
            this.renderActionCard(action, {
                showAdjudicateAction: this.isLeadOperator(),
                includeOutcome: false,
                isNew: this.newBlueActionIds.has(action.id)
                    || this.newStrategicOrientationIds.has(action.id)
                    || this.newGreenProposalIds.has(action.id)
                    || this.newRedResponseIds.has(action.id)
            })
        ).join('')}
        `;

        this.bindActionCardButtons(container);
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

    renderActionCard(action, {
        showAdjudicateAction = false,
        includeOutcome = false,
        isNew = false
    } = {}) {
        const status = action.status || ENUMS.ACTION_STATUS.DRAFT;
        const strategicOrientation = getStrategicOrientationViewModel(action);
        const isStrategicOrientationFlow = strategicOrientation.hasStrategicOrientationDetails;
        const blueAction = getBlueActionViewModel(action);
        const proposalViewModel = getProposalViewModel(action);
        const expectedOutcomes = isStrategicOrientationFlow
            ? (strategicOrientation.isForecast
                ? (strategicOrientation.forecastSummary || `Forecast: Blue will choose ${strategicOrientation.orientationLabel}.`)
                : (strategicOrientation.orientationTag || 'Strategic Orientation selected.'))
            : (blueAction.expectedOutcomes || '');
        const targetLabel = formatBlueActionSelection(blueAction.focusCountries);
        const leverLabel = formatBlueActionSelection(blueAction.levers, blueAction.lever || 'Not specified');
        const sectorLabel = formatBlueActionSelection(blueAction.sectors, blueAction.sector || 'Not specified');
        const legislativeOptionsLabel = formatBlueActionSelection(blueAction.legislativeOptions, 'None selected');
        const sequenceLabel = isStrategicOrientationFlow
            ? 'Pre-Move 1 | Strategic Orientation'
            : this.getBlueTeamActionSequenceLabel(action);
        const submittedMarkup = action.submitted_at
            ? `<p class="entity-card__note"><strong>Submitted:</strong> ${this.escapeHtml(formatDateTime(action.submitted_at))}</p>`
            : '';
        const outcomeMarkup = includeOutcome && action.outcome
            ? `<p class="entity-card__note"><strong>Outcome:</strong> ${this.escapeHtml(action.outcome)}</p>`
            : '';
        const notesMarkup = includeOutcome && action.adjudication_notes
            ? `<p class="entity-card__note"><strong>Notes:</strong> ${this.escapeHtml(action.adjudication_notes)}</p>`
            : '';
        const secondaryBadge = isStrategicOrientationFlow
            ? createBadge({
                text: strategicOrientation.isForecast ? 'Forecast' : 'Selection',
                variant: 'info',
                size: 'sm',
                rounded: true
            }).outerHTML
            : blueAction.hasBlueActionDetails && blueAction.enforcementTimeline
            ? createBadge({ text: blueAction.enforcementTimeline, variant: 'info', size: 'sm', rounded: true }).outerHTML
            : createPriorityBadge(action.priority || 'NORMAL').outerHTML;
        const statusAccent = isAdjudicatedAction(action)
            ? 'deliberated'
            : (canAdjudicateAction(action) ? 'submitted' : '');
        const detailsMarkup = isStrategicOrientationFlow
            ? this.renderDetailGrid([
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
            ])
            : proposalViewModel.hasProposalDetails
            ? this.renderProposalDetails(action)
            : this.renderDetailGrid(
                blueAction.hasBlueActionDetails
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
                    ]
            );
        const proposalRecipientStateMarkup = proposalViewModel.hasProposalDetails && !isStrategicOrientationFlow
            ? this.renderProposalRecipientState(action)
            : '';
        const arrivalBadgeMarkup = isNew
            ? createBadge({ text: 'NEW', variant: 'warning', size: 'sm', rounded: true }).outerHTML
            : '';
        const actionButtons = [];

        if (canShareActionToRedTeam(action)) {
            actionButtons.push(`<button class="btn btn-secondary btn-sm share-action-to-red-btn" data-action-id="${action.id}">Send to Red Team</button>`);
        }

        if (showAdjudicateAction) {
            actionButtons.push(`<button class="btn btn-primary btn-sm adjudicate-btn" data-action-id="${action.id}">${isStrategicOrientationFlow ? 'Review Orientation' : (proposalViewModel.hasProposalDetails ? 'Review Proposal' : 'Record Deliberation')}</button>`);
        }

        return `
            <div class="entity-card${statusAccent ? ` entity-card--${statusAccent}` : ''}" data-action-id="${action.id}"${isNew ? ' style="background: var(--color-surface-alt);"' : ''}>
                <div class="entity-card__head">
                    <div>
                        <p class="entity-card__eyebrow">${this.escapeHtml(isStrategicOrientationFlow ? 'Strategic Orientation' : (blueAction.instrumentOfPower || 'No mechanism'))} &middot; ${this.escapeHtml(sequenceLabel)} &middot; Phase ${action.phase || 1}</p>
                        <h3 class="entity-card__title">${this.escapeHtml(isStrategicOrientationFlow ? strategicOrientation.title : blueAction.title)}</h3>
                    </div>
                    <div class="entity-card__badges">
                        ${arrivalBadgeMarkup}
                        ${createStatusBadge(status).outerHTML}
                        ${secondaryBadge}
                    </div>
                </div>
                ${proposalViewModel.hasProposalDetails && !isStrategicOrientationFlow ? '' : `<p class="card-summary">${this.escapeHtml(expectedOutcomes || 'No expected outcomes recorded.')}</p>`}
                ${detailsMarkup}
                ${proposalRecipientStateMarkup}
                ${submittedMarkup}
                ${outcomeMarkup}
                ${notesMarkup}
                ${actionButtons.length ? `
                    <div class="card-actions" style="display: flex; gap: var(--space-2); margin-top: var(--space-3);">
                        ${actionButtons.join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    bindActionCardButtons(container) {
        container.querySelectorAll('.share-action-to-red-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const actionId = button.dataset.actionId;
                const action = this.actions.find((candidate) => candidate.id === actionId);
                if (action) {
                    this.shareActionWithRedTeam(action).catch((err) => {
                        logger.error('Failed to share action with Red Team:', err);
                    });
                }
            });
        });

        if (!this.isLeadOperator()) {
            return;
        }

        container.querySelectorAll('.adjudicate-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const actionId = button.dataset.actionId;
                const action = this.actions.find((candidate) => candidate.id === actionId);
                if (action) {
                    this.showAdjudicateModal(action);
                }
            });
        });
    }

    async shareActionWithRedTeam(action) {
        if (!canShareActionToRedTeam(action)) {
            showToast({ message: 'Only Blue Team actions can be sent to Red Team from White Cell.', type: 'warning' });
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        const actionTitle = action.goal || action.title || 'Untitled action';
        const confirmed = await confirmModal({
            title: 'Share with Red Team',
            message: `Send \"${actionTitle}\" to Red Team as a White Cell communication?`,
            confirmLabel: 'Send to Red Team',
            variant: 'primary'
        });

        if (!confirmed) return;

        const loader = showLoader({ message: 'Sharing action with Red Team...' });

        try {
            const gameState = this.getCurrentGameState();
            const recipientMetadata = buildWhiteCellRecipientMetadata(WHITE_CELL_RED_TEAM_RECIPIENT, {
                shared_action_id: action.id,
                source_team: action.team,
                actor_role: this.getTimelineActorRole()
            });
            const communication = await database.createCommunication({
                session_id: sessionId,
                from_role: 'white_cell',
                to_role: WHITE_CELL_RED_TEAM_RECIPIENT,
                type: 'GUIDANCE',
                content: buildSharedActionCommunicationContent(action),
                metadata: recipientMetadata
            });
            communicationsStore.updateFromServer('INSERT', communication);

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'GUIDANCE',
                content: `White Cell shared Blue Team action with Red Team: ${actionTitle}`,
                metadata: {
                    role: this.getTimelineActorRole(),
                    ...buildWhiteCellRecipientMetadata(WHITE_CELL_RED_TEAM_RECIPIENT, {
                        shared_action_id: action.id,
                        source_team: action.team
                    })
                },
                team: 'white_cell',
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: 'Action shared with Red Team', type: 'success' });
        } catch (err) {
            logger.error('Failed to share action with Red Team:', err);
            showToast({ message: 'Failed to share action with Red Team', type: 'error' });
        } finally {
            loader?.hide?.();
            hideLoader();
        }
    }

    showAdjudicateModal(action) {
        if (!this.isLeadOperator()) {
            showToast({ message: 'White Cell support cannot record deliberation.', type: 'warning' });
            return;
        }

        if (this.isProposalAction(action)) {
            this.showProposalReviewModal(action);
            return;
        }

        if (isStrategicOrientationAction(action)) {
            this.showStrategicOrientationReviewModal(action);
            return;
        }

        const outcomeOptions = ENUMS.OUTCOMES
            .map((value) => `<option value="${value}">${value}</option>`)
            .join('');

        const content = document.createElement('div');
        const blueAction = getBlueActionViewModel(action);
        const leverLabel = formatBlueActionSelection(blueAction.levers, blueAction.lever || 'Not specified');
        const sectorLabel = formatBlueActionSelection(blueAction.sectors, blueAction.sector || 'Not specified');
        const legislativeOptionsLabel = formatBlueActionSelection(blueAction.legislativeOptions, 'None selected');
        const sequenceLabel = this.getBlueTeamActionSequenceLabel(action);
        content.innerHTML = `
            <div class="mb-4">
                <h4 class="font-semibold">${this.escapeHtml(blueAction.title)}</h4>
                <p class="text-sm text-gray-500">${this.escapeHtml(blueAction.instrumentOfPower || 'No mechanism')} | ${this.escapeHtml(sequenceLabel)} | Phase ${action.phase || 1}</p>
                <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                    <strong>${blueAction.hasBlueActionDetails ? 'Focus Countries' : 'Targets'}:</strong> ${this.escapeHtml(formatBlueActionSelection(blueAction.focusCountries))} |
                    <strong>${blueAction.hasBlueActionDetails ? 'Sectors' : 'Sector'}:</strong> ${this.escapeHtml(sectorLabel)} |
                    <strong>${blueAction.hasBlueActionDetails ? 'Supply Chain Focus' : 'Exposure'}:</strong> ${this.escapeHtml(blueAction.supplyChainFocus || 'Not specified')}
                </p>
                ${action.submitted_at ? `
                    <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                        <strong>Submitted:</strong> ${this.escapeHtml(formatDateTime(action.submitted_at))}
                    </p>
                ` : ''}
                ${blueAction.hasBlueActionDetails ? `
                    ${blueAction.objective ? `
                        <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                            <strong>Objective:</strong> ${this.escapeHtml(blueAction.objective)}
                        </p>
                    ` : ''}
                    <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                        <strong>Levers:</strong> ${this.escapeHtml(leverLabel)} |
                        <strong>Implementation:</strong> ${this.escapeHtml(blueAction.implementation || 'Not specified')} |
                        <strong>Timeline:</strong> ${this.escapeHtml(blueAction.enforcementTimeline || 'Not specified')}
                    </p>
                    ${blueAction.implementation === 'Legislative' ? `
                        <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                            <strong>Legislative Route:</strong> ${this.escapeHtml(legislativeOptionsLabel)}
                        </p>
                    ` : ''}
                    <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                        <strong>Coordinated:</strong> ${this.escapeHtml(formatBlueActionSelection(blueAction.coordinated, 'None selected'))} |
                        <strong>Informed/Engaged:</strong> ${this.escapeHtml(formatBlueActionSelection(blueAction.informed, 'None selected'))}
                    </p>
                ` : action.ally_contingencies ? `
                    <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                        <strong>Ally Contingencies:</strong> ${this.escapeHtml(action.ally_contingencies)}
                    </p>
                ` : ''}
                <p class="text-sm mt-2">${this.escapeHtml(blueAction.expectedOutcomes || '')}</p>
            </div>

            <form id="adjudicateForm">
                <div class="form-group">
                    <label class="form-label" for="outcomeSelect">Outcome *</label>
                    <select id="outcomeSelect" class="form-select" required>
                        <option value="">Select outcome</option>
                        ${outcomeOptions}
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label" for="adjudicationNotes">Notes</label>
                    <textarea id="adjudicationNotes" class="form-input form-textarea" rows="4" placeholder="Explain the outcome..."></textarea>
                </div>
            </form>
        `;

        const modalRef = { current: null };
        modalRef.current = showModal({
            title: 'Record Deliberation',
            content,
            size: 'md',
            buttons: [
                {
                    label: 'Cancel',
                    variant: 'secondary',
                    onClick: () => {}
                },
                {
                    label: 'Record Deliberation',
                    variant: 'primary',
                    onClick: () => {
                        this.handleAdjudicate(modalRef.current, action.id).catch((err) => {
                            logger.error('Failed to submit adjudication:', err);
                        });
                        return false;
                    }
                }
            ]
        });
    }

    showStrategicOrientationReviewModal(action) {
        const outcomeOptions = ENUMS.OUTCOMES
            .map((value) => `<option value="${value}">${value}</option>`)
            .join('');
        const viewModel = getStrategicOrientationViewModel(action);
        const content = document.createElement('div');

        content.innerHTML = `
            <div class="mb-4">
                <h4 class="font-semibold">${this.escapeHtml(viewModel.title)}</h4>
                <p class="text-sm text-gray-500">Strategic Orientation | Pre-Move 1 | ${this.escapeHtml(viewModel.isForecast ? 'Forecast' : 'Selection')}</p>
                ${action.submitted_at ? `
                    <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                        <strong>Submitted:</strong> ${this.escapeHtml(formatDateTime(action.submitted_at))}
                    </p>
                ` : ''}
                ${this.renderDetailGrid([
        {
            label: viewModel.isForecast ? 'Forecasted Blue Orientation' : 'Selected Orientation',
            value: `${viewModel.orientationLabel}: ${viewModel.orientationTag}`,
            wide: true
        },
        { label: 'Primary Levers', value: formatStrategicOrientationSelection(viewModel.primaryLevers) },
        { label: 'Accepted Costs', value: formatStrategicOrientationSelection(viewModel.acceptedCosts) },
        { label: 'Posture', value: viewModel.posture || 'Not specified' },
        ...(viewModel.rationale
            ? [{ label: 'Team Rationale', value: viewModel.rationale, wide: true }]
            : [])
    ])}
            </div>

            <form id="adjudicateForm">
                <div class="form-group">
                    <label class="form-label" for="outcomeSelect">Outcome *</label>
                    <select id="outcomeSelect" class="form-select" required>
                        <option value="">Select outcome</option>
                        ${outcomeOptions}
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label" for="adjudicationNotes">Notes</label>
                    <textarea id="adjudicationNotes" class="form-input form-textarea" rows="4" placeholder="Record White Cell notes on the pre-Move-1 artifact..."></textarea>
                </div>
            </form>
        `;

        const modalRef = { current: null };
        modalRef.current = showModal({
            title: 'Review Strategic Orientation',
            content,
            size: 'md',
            buttons: [
                {
                    label: 'Cancel',
                    variant: 'secondary',
                    onClick: () => {}
                },
                {
                    label: 'Record Review',
                    variant: 'primary',
                    onClick: () => {
                        this.handleAdjudicate(modalRef.current, action.id).catch((err) => {
                            logger.error('Failed to submit Strategic Orientation review:', err);
                        });
                        return false;
                    }
                }
            ]
        });
    }

    showProposalReviewModal(action) {
        const { proposalViewModel, recipientLabel, decisions } = this.getProposalReviewOptions(action);
        const content = document.createElement('div');
        const sequenceLabel = this.getBlueTeamActionSequenceLabel(action);
        const decisionMarkup = decisions.map((decision) => {
            const inputId = `proposalReview${decision.value.replace(/[^a-z0-9]+/gi, '')}`;
            return `
                <label class="form-check form-check-card" for="${inputId}">
                    <input
                        id="${inputId}"
                        class="form-radio"
                        type="radio"
                        name="proposalReviewDecision"
                        value="${decision.value}"
                    >
                    <span class="form-check-label">${this.escapeHtml(decision.label)}</span>
                </label>
            `;
        }).join('');

        content.innerHTML = `
            <div class="mb-4">
                <h4 class="font-semibold">${this.escapeHtml(proposalViewModel.title)}</h4>
                <p class="text-sm text-gray-500">${this.escapeHtml(action.mechanism || 'Proposal')} | ${this.escapeHtml(sequenceLabel)} | Phase ${action.phase || 1}</p>
                ${action.submitted_at ? `
                    <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                        <strong>Submitted:</strong> ${this.escapeHtml(formatDateTime(action.submitted_at))}
                    </p>
                ` : ''}
                ${this.renderProposalDetails(action)}
            </div>

            <form id="proposalReviewForm">
                <fieldset class="form-group" aria-describedby="proposalReviewDecisionHint">
                    <legend class="form-label">Decision *</legend>
                    <div class="form-check-grid" role="radiogroup" aria-label="Proposal review decision">
                        ${decisionMarkup}
                    </div>
                    <p class="form-hint" id="proposalReviewDecisionHint">
                        Forward sends the proposal to ${this.escapeHtml(recipientLabel)}. Request Changes records White Cell feedback without forwarding; the submitting team must submit a new proposal if they want to continue this line.
                    </p>
                </fieldset>

                <div class="form-group">
                    <label class="form-label" for="adjudicationNotes">White Cell Notes</label>
                    <textarea id="adjudicationNotes" class="form-input form-textarea" rows="4" placeholder="Explain the review decision or the requested changes..."></textarea>
                </div>
            </form>
        `;

        const modalRef = { current: null };
        modalRef.current = showModal({
            title: 'Review Proposal',
            content,
            size: 'lg',
            buttons: [
                {
                    label: 'Cancel',
                    variant: 'secondary',
                    onClick: () => {}
                },
                {
                    label: 'Submit Proposal Review',
                    variant: 'primary',
                    onClick: () => {
                        this.handleProposalReview(modalRef.current, action).catch((err) => {
                            logger.error('Failed to submit proposal review:', err);
                        });
                        return false;
                    }
                }
            ]
        });
    }

    async handleAdjudicate(modal, actionId) {
        const outcome = document.getElementById('outcomeSelect')?.value;
        const notes = document.getElementById('adjudicationNotes')?.value?.trim();

        if (!outcome) {
            showToast({ message: 'Please select an outcome', type: 'error' });
            return;
        }

        const loader = showLoader({ message: 'Recording deliberation...' });

        try {
            const updatedAction = await database.adjudicateAction(actionId, {
                outcome,
                adjudication_notes: notes || null,
                adjudicated_at: new Date().toISOString()
            });
            actionsStore.updateFromServer('UPDATE', updatedAction);

            const gameState = this.getCurrentGameState();
            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionStore.getSessionId(),
                type: 'ACTION_ADJUDICATED',
                content: `White Cell deliberation recorded: ${outcome}`,
                metadata: {
                    related_id: actionId,
                    role: this.getTimelineActorRole()
                },
                team: 'white_cell',
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: 'Deliberation recorded', type: 'success' });
            modal?.close();
        } catch (err) {
            logger.error('Failed to adjudicate action:', err);
            showToast({ message: 'Failed to record deliberation', type: 'error' });
        } finally {
            hideLoader();
        }
    }

    /**
     * After White Cell explicitly chooses to forward a proposal, send it to the
     * intended recipient team. Surfaced as:
     *   - a communication from White Cell to the recipient team (team-wide, so
     *     both facilitator and scribe see it), and
     *   - a PROPOSAL_FORWARDED timeline event tagged with the source proposal
     *     id so the post-sim review can reconstruct the lineage.
     */
    async forwardProposalToRecipient(action, {
        outcome = 'SUCCESS',
        reviewDecision = PROPOSAL_REVIEW_DECISIONS.FORWARD_TO_RECIPIENT,
        recipientTeam: explicitRecipientTeam = null,
        sourceAction = null
    } = {}) {
        const resolvedAction = action || sourceAction;
        if (!resolvedAction) return;

        const actionWithProposalDetails = parseProposalDetails(action?.ally_contingencies)
            ? action
            : sourceAction;
        const proposalDetails = parseProposalDetails(actionWithProposalDetails?.ally_contingencies);
        const recipientTeam = ['blue', 'red'].includes(explicitRecipientTeam)
            ? explicitRecipientTeam
            : proposalDetails?.recipientTeam;
        if (!recipientTeam || !['blue', 'red'].includes(recipientTeam)) {
            logger.warn('Proposal review requested forwarding, but recipient_team is missing or invalid:', recipientTeam);
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        const alreadyForwarded = communicationsStore.getAll().some((comm) => (
            comm?.type === 'PROPOSAL_FORWARDED'
            && comm?.metadata?.source_proposal_id === resolvedAction.id
        ));
        if (alreadyForwarded) {
            logger.info('Proposal already forwarded; skipping duplicate forward.', {
                proposalId: resolvedAction.id
            });
            return;
        }

        const viewModel = getProposalViewModel(actionWithProposalDetails || resolvedAction);
        const recipientLabel = this.formatProposalRecipientTeamLabel(recipientTeam);
        const sourceTeam = resolvedAction.team || 'green';
        const sourceLabel = this.formatProposalRecipientTeamLabel(sourceTeam);
        const proposalTitle = viewModel.title || 'Untitled proposal';
        const originators = formatProposalSelection(viewModel.originators, 'Not specified');
        const gameState = this.getCurrentGameState();

        const proposalSnapshot = {
            title: proposalTitle,
            originators: viewModel.originators,
            objective: viewModel.objective,
            category: viewModel.category,
            intendedPartners: viewModel.intendedPartners,
            focusSector: viewModel.focusSector,
            delivery: viewModel.delivery,
            timingAndConditions: viewModel.timingAndConditions,
            expectedOutcomes: viewModel.expectedOutcomes
        };

        const commContent = [
            `Forwarded ${sourceLabel} proposal (sent by White Cell after review).`,
            `Title: ${proposalTitle}`,
            `Category: ${viewModel.category || 'Not specified'}`,
            `Originators: ${originators}`,
            `Intended Partners: ${viewModel.intendedPartners || 'Not specified'}`,
            `Focus Sector: ${viewModel.focusSector || 'Not specified'}`,
            `Delivery: ${viewModel.delivery || 'Not specified'}`,
            `Objective: ${viewModel.objective || 'Not specified'}`,
            `Timing & Conditions: ${viewModel.timingAndConditions || 'Not specified'}`,
            `Expected Outcomes: ${viewModel.expectedOutcomes || 'Not specified'}`,
            `White Cell decision: Forwarded to ${recipientLabel}`,
            `Recorded outcome: ${outcome}`
        ].join('\n');

        try {
            const recipientMetadata = buildWhiteCellRecipientMetadata(recipientTeam, {
                source_proposal_id: resolvedAction.id,
                source_team: sourceTeam,
                outcome,
                review_decision: reviewDecision,
                review_stage: 'forwarded_to_recipient',
                proposal: proposalSnapshot
            });
            const communication = await database.createCommunication({
                session_id: sessionId,
                from_role: 'white_cell',
                to_role: recipientTeam,
                type: 'PROPOSAL_FORWARDED',
                content: commContent,
                metadata: recipientMetadata
            });
            communicationsStore.updateFromServer('INSERT', communication);

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'PROPOSAL_FORWARDED',
                content: `${sourceLabel} proposal forwarded to ${recipientLabel} after White Cell approval: ${proposalTitle}`,
                metadata: {
                    related_id: resolvedAction.id,
                    role: this.getTimelineActorRole(),
                    ...buildWhiteCellRecipientMetadata(recipientTeam, {
                        source_team: sourceTeam,
                        outcome,
                        review_decision: reviewDecision,
                        review_stage: 'forwarded_to_recipient',
                        proposal: true
                    })
                },
                team: 'white_cell',
                move: resolvedAction.move ?? gameState.move ?? 1,
                phase: resolvedAction.phase ?? gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);
        } catch (err) {
            logger.error('Failed to forward reviewed proposal:', err);
            showToast({
                message: `Proposal review saved, but forwarding to ${recipientLabel} failed. Retry from the proposal record.`,
                type: 'warning'
            });
        }
    }

    async handleProposalReview(modal, action) {
        const selectedDecision = document.querySelector('input[name="proposalReviewDecision"]:checked')?.value;
        const notes = document.getElementById('adjudicationNotes')?.value?.trim();

        if (!selectedDecision) {
            showToast({ message: 'Please choose a proposal review decision', type: 'error' });
            return;
        }

        const reviewOptions = this.getProposalReviewOptions(action);
        const decision = reviewOptions.decisions.find((option) => option.value === selectedDecision);

        if (!decision) {
            showToast({ message: 'Unsupported proposal review decision', type: 'error' });
            return;
        }

        if (
            selectedDecision === PROPOSAL_REVIEW_DECISIONS.FORWARD_TO_RECIPIENT
            && !reviewOptions.recipientTeam
        ) {
            showToast({ message: 'This proposal is missing a valid intended recipient team', type: 'error' });
            return;
        }

        const loader = showLoader({ message: decision.loaderMessage });

        try {
            const updatedAction = await database.adjudicateAction(action.id, {
                outcome: decision.outcome,
                adjudication_notes: notes || null,
                adjudicated_at: new Date().toISOString()
            });
            actionsStore.updateFromServer('UPDATE', updatedAction);

            const gameState = this.getCurrentGameState();
            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionStore.getSessionId(),
                type: 'ACTION_ADJUDICATED',
                content: `Proposal review recorded: ${decision.timelineLabel}`,
                metadata: {
                    related_id: action.id,
                    role: this.getTimelineActorRole(),
                    proposal_review_decision: selectedDecision,
                    proposal_recipient_team: reviewOptions.recipientTeam || null,
                    proposal: true
                },
                team: 'white_cell',
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            if (selectedDecision === PROPOSAL_REVIEW_DECISIONS.FORWARD_TO_RECIPIENT) {
                await this.forwardProposalToRecipient(updatedAction, {
                    outcome: decision.outcome,
                    reviewDecision: selectedDecision,
                    recipientTeam: reviewOptions.recipientTeam,
                    sourceAction: action
                });
            }

            showToast({ message: decision.successToast, type: 'success' });
            modal?.close();
        } catch (err) {
            logger.error('Failed to submit proposal review:', err);
            showToast({ message: 'Failed to submit proposal review', type: 'error' });
        } finally {
            hideLoader();
        }
    }

    syncRfisFromStore() {
        this.rfis = requestsStore.getPending();

        this.renderRfiQueue();

        this.updateSidebarBadge('rfiBadge', this.rfis.length);
    }

    renderRfiQueue() {
        const container = document.getElementById('rfiQueue');
        if (!container) return;

        if (this.rfis.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No pending RFIs.</p>';
            return;
        }

        const visibleRfis = this.rfis.slice(0, WHITE_CELL_RFI_RENDER_LIMIT);
        const hiddenCount = Math.max(0, this.rfis.length - visibleRfis.length);

        container.innerHTML = `
            ${hiddenCount ? `<p class="text-xs text-gray-500" style="margin: 0 0 var(--space-3);">Showing the first ${WHITE_CELL_RFI_RENDER_LIMIT} of ${this.rfis.length} pending RFIs.</p>` : ''}
            ${visibleRfis.map((rfi) => {
            const queryText = rfi.query || rfi.question || '';
            return `
                <div class="card card-bordered" data-rfi-id="${rfi.id}" style="padding: var(--space-4); margin-bottom: var(--space-3);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-2); gap: var(--space-2);">
                        <span class="text-xs text-gray-500">${this.escapeHtml(this.formatTeamLabel(rfi.team))} | ${formatRelativeTime(rfi.created_at)}</span>
                        <div style="display: flex; gap: var(--space-2);">
                            ${createStatusBadge('pending').outerHTML}
                            ${createPriorityBadge(rfi.priority || 'NORMAL').outerHTML}
                        </div>
                    </div>
                    <p class="text-sm font-medium mb-2">${this.escapeHtml(queryText)}</p>
                    ${Array.isArray(rfi.categories) && rfi.categories.length ? `
                        <p class="text-xs text-gray-500"><strong>Categories:</strong> ${this.escapeHtml(rfi.categories.join(', '))}</p>
                    ` : ''}
                    <div class="card-actions" style="margin-top: var(--space-3);">
                        <button class="btn btn-primary btn-sm respond-rfi-btn" data-rfi-id="${rfi.id}">Respond</button>
                    </div>
                </div>
            `;
        }).join('')}
        `;

        container.querySelectorAll('.respond-rfi-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const rfiId = button.dataset.rfiId;
                const rfi = this.rfis.find((candidate) => candidate.id === rfiId);
                if (rfi) {
                    this.showRespondRfiModal(rfi);
                }
            });
        });
    }

    showRespondRfiModal(rfi) {
        const content = document.createElement('div');
        const queryText = rfi.query || rfi.question || '';

        content.innerHTML = `
            <div class="mb-4 p-3 bg-gray-50 rounded">
                <p class="text-sm font-medium">Question</p>
                <p class="text-sm">${this.escapeHtml(queryText)}</p>
            </div>

            <form id="rfiResponseForm">
                <div class="form-group">
                    <label class="form-label" for="rfiResponse">Response *</label>
                    <textarea id="rfiResponse" class="form-input form-textarea" rows="4" placeholder="Enter your response..." required></textarea>
                </div>
            </form>
        `;

        const modalRef = { current: null };
        modalRef.current = showModal({
            title: 'Respond to RFI',
            content,
            size: 'md',
            buttons: [
                {
                    label: 'Cancel',
                    variant: 'secondary',
                    onClick: () => {}
                },
                {
                    label: 'Send Response',
                    variant: 'primary',
                    onClick: () => {
                        this.handleRfiResponse(modalRef.current, rfi.id).catch((err) => {
                            logger.error('Failed to send RFI response:', err);
                        });
                        return false;
                    }
                }
            ]
        });
    }

    async handleRfiResponse(modal, rfiId) {
        const response = document.getElementById('rfiResponse')?.value?.trim();
        if (!response) {
            showToast({ message: 'Please enter a response', type: 'error' });
            return;
        }

        const loader = showLoader({ message: 'Sending response...' });

        try {
            const updatedRequest = await database.updateRequest(rfiId, {
                response,
                status: 'answered',
                responded_at: new Date().toISOString()
            });
            requestsStore.updateFromServer('UPDATE', updatedRequest);

            const gameState = this.getCurrentGameState();
            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionStore.getSessionId(),
                type: 'RFI_ANSWERED',
                content: 'White Cell responded to an RFI.',
                metadata: {
                    related_id: rfiId,
                    role: this.getTimelineActorRole(),
                    ...buildWhiteCellRecipientMetadata(updatedRequest.team)
                },
                team: 'white_cell',
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: 'Response sent', type: 'success' });
            modal?.close();
        } catch (err) {
            logger.error('Failed to respond to RFI:', err);
            showToast({ message: 'Failed to send response', type: 'error' });
        } finally {
            hideLoader();
        }
    }

    async handleCommunicationSubmit(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const recipient = document.getElementById('commRecipient')?.value;
        const type = document.getElementById('commType')?.value || 'INJECT';
        const content = document.getElementById('commContent')?.value?.trim();

        if (!recipient || !content) {
            showToast({ message: 'Please fill in all required fields', type: 'error' });
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        const loader = showLoader({ message: 'Sending communication...' });

        try {
            const gameState = this.getCurrentGameState();
            const recipientMetadata = buildWhiteCellRecipientMetadata(recipient);
            const communication = await database.createCommunication({
                session_id: sessionId,
                from_role: 'white_cell',
                to_role: recipient,
                type,
                content,
                metadata: recipientMetadata
            });
            communicationsStore.updateFromServer('INSERT', communication);

            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type,
                content: `White Cell ${type.toLowerCase()} sent to ${this.formatCommunicationRecipient(recipient)}`,
                metadata: {
                    role: this.getTimelineActorRole(),
                    ...recipientMetadata
                },
                team: 'white_cell',
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            form.reset();
            document.getElementById('commRecipient').value = WHITE_CELL_ALL_TEAMS_RECIPIENT;
            document.getElementById('commType').value = 'INJECT';

            showToast({ message: 'Communication sent', type: 'success' });
        } catch (err) {
            logger.error('Failed to send communication:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to send communication. Check the message and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    showSectionUpdateComposer({
        title,
        contentKind,
        initialContent = '',
        sourceMetadata = {}
    }) {
        const content = document.createElement('div');
        const recipientOptions = buildWhiteCellCommunicationRecipientOptions()
            .map((option) => `<option value="${this.escapeHtml(option.value)}">${this.escapeHtml(option.label)}</option>`)
            .join('');

        content.innerHTML = `
            <form id="whiteCellSectionUpdateForm" novalidate>
                <div class="form-group">
                    <label class="form-label" for="whiteCellSectionUpdateRecipient">Recipient</label>
                    <select id="whiteCellSectionUpdateRecipient" class="form-input form-select">
                        ${recipientOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" for="whiteCellSectionUpdateContent">Update</label>
                    <textarea
                        id="whiteCellSectionUpdateContent"
                        class="form-input form-textarea"
                        rows="6"
                        placeholder="Enter the update to send..."
                    >${this.escapeHtml(initialContent)}</textarea>
                </div>
            </form>
        `;

        const modalRef = { current: null };
        modalRef.current = showModal({
            title,
            content,
            size: 'md',
            buttons: [
                { label: 'Cancel', variant: 'secondary', onClick: () => {} },
                {
                    label: 'Send Update',
                    variant: 'primary',
                    onClick: () => {
                        const recipient = content.querySelector('#whiteCellSectionUpdateRecipient')?.value || WHITE_CELL_ALL_TEAMS_RECIPIENT;
                        const message = content.querySelector('#whiteCellSectionUpdateContent')?.value?.trim();
                        if (!message) {
                            showToast({ message: 'Update text is required.', type: 'error' });
                            return false;
                        }

                        this.submitSectionUpdate(modalRef.current, {
                            recipient,
                            contentKind,
                            content: message,
                            sourceMetadata
                        }).catch((err) => {
                            logger.error('Failed to send section update:', err);
                        });
                        return false;
                    }
                }
            ]
        });
    }

    async submitSectionUpdate(modal, {
        recipient,
        contentKind,
        content,
        sourceMetadata = {}
    }) {
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No session selected.', type: 'error' });
            return;
        }

        const loader = showLoader({ message: 'Sending update...' });
        try {
            const gameState = this.getCurrentGameState();
            const recipientMetadata = buildWhiteCellRecipientMetadata(recipient, {
                content_kind: contentKind,
                ...sourceMetadata
            });
            const communication = await database.createCommunication({
                session_id: sessionId,
                from_role: 'white_cell',
                to_role: recipient,
                type: 'GUIDANCE',
                content,
                metadata: recipientMetadata
            });
            communicationsStore.updateFromServer('INSERT', communication);

            const sectionLabel = contentKind === WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL
                ? 'Tribe Street Journal update'
                : 'Verba AI population sentiment';
            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'GUIDANCE',
                content: `White Cell sent a ${sectionLabel} to ${this.formatCommunicationRecipient(recipient)}`,
                metadata: {
                    role: this.getTimelineActorRole(),
                    ...recipientMetadata
                },
                team: 'white_cell',
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', timelineEvent);

            showToast({ message: 'Update sent', type: 'success' });
            modal?.close();
        } catch (err) {
            logger.error('Failed to send section update:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to send update. Check the session state and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    syncCommunicationsFromStore() {
        this.communications = communicationsStore.getAll();
        this.scribeDeckAssignments = buildWhiteCellScribeDeckAssignments(this.communications);
        this.verbaAiUpdates = this.communications
            .filter((communication) => (
                communication?.from_role === 'white_cell'
                && getWhiteCellCommunicationUpdateKind(communication) === WHITE_CELL_UPDATE_KINDS.VERBA_AI_POPULATION_SENTIMENT
            ))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        this.renderCommunicationHistory();
        this.renderScribeDeckSettings();
        this.renderVerbaAiList();
    }

    syncParticipantsFromStore() {
        this.participants = buildWhiteCellParticipantRoster(participantsStore.getAll());
        this.configureParticipantFilters();
        this.renderParticipants();
    }

    configureParticipantFilters() {
        const sessionSelect = document.getElementById('participantsSessionFilter');
        const teamSelect = document.getElementById('participantsTeamFilter');
        const roleSelect = document.getElementById('participantsRoleFilter');
        if (!sessionSelect || !teamSelect || !roleSelect) return;

        const activeSession = sessionStore.getSessionData?.() || null;
        const { sessionOptions, teamOptions, roleOptions } = buildWhiteCellParticipantFilterOptions(this.participants, {
            activeSession
        });
        this.populateFilterSelect(sessionSelect, sessionOptions, this.participantFilters.session);
        this.populateFilterSelect(teamSelect, teamOptions, this.participantFilters.team);
        this.populateFilterSelect(roleSelect, roleOptions, this.participantFilters.role);
        this.participantFilters.session = sessionSelect.value || null;
        this.participantFilters.team = teamSelect.value || null;
        this.participantFilters.role = roleSelect.value || null;
    }

    renderParticipants() {
        const summary = document.getElementById('participantsSummary');
        const container = document.getElementById('participantsList');
        if (!summary || !container) return;

        const activeSession = sessionStore.getSessionData?.() || null;
        const filteredParticipants = filterWhiteCellParticipants(this.participants, {
            ...this.participantFilters,
            activeSession
        });
        const hasActiveFilters = Boolean(
            this.participantFilters.session
            || this.participantFilters.team
            || this.participantFilters.role
        );
        const filteredSummary = filteredParticipants.length === 0 && this.participants.length > 0 && hasActiveFilters
            ? 'No participants match the current filters.'
            : formatWhiteCellParticipantSummary(filteredParticipants);
        const activeSessionLabel = getWhiteCellSessionLabel(activeSession);
        const summaryText = filteredSummary.endsWith('.') ? filteredSummary : `${filteredSummary}.`;

        summary.textContent = activeSessionLabel
            ? `${summaryText} Active session: ${activeSessionLabel}.`
            : filteredSummary;

        if (filteredParticipants.length === 0) {
            container.innerHTML = hasActiveFilters
                ? '<p class="text-sm text-gray-500">No participants match the selected filters.</p>'
                : '<p class="text-sm text-gray-500">No Scribe, Facilitator, Notetaker, or White Cell seats are connected in this session yet.</p>';
            return;
        }

        container.innerHTML = filteredParticipants.map((participant) => {
            const connectionBadge = createBadge({
                text: isConnectedParticipant(participant) ? 'Connected' : 'Inactive',
                variant: isConnectedParticipant(participant) ? 'success' : 'default',
                size: 'sm',
                rounded: true
            }).outerHTML;
            const roleBadge = createRoleBadge(participant.role || 'unknown').outerHTML;
            const roleLabel = getRoleDisplayName(participant.role) || participant.role || 'Unknown role';
            const lastActiveAt = participant.heartbeat_at || participant.last_seen || participant.joined_at;
            const participantSessionLabel = getWhiteCellParticipantSessionLabel(participant, activeSession)
                || getWhiteCellParticipantSessionFilterFallbackLabel(
                    getWhiteCellParticipantSessionFilterValue(participant, activeSession)
                );

            return `
                <div class="card card-bordered" style="padding: var(--space-3); margin-bottom: var(--space-3);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-2); margin-bottom: var(--space-2);">
                        <div>
                            <p class="text-sm font-semibold">${this.escapeHtml(participant.display_name || 'Unknown')}</p>
                            <p class="text-xs text-gray-500">${this.escapeHtml(roleLabel)}</p>
                            ${participantSessionLabel ? `<p class="text-xs text-gray-500" style="margin-top: 2px;">Session: ${this.escapeHtml(participantSessionLabel)}</p>` : ''}
                        </div>
                        <div style="display: flex; gap: var(--space-2); flex-wrap: wrap; justify-content: flex-end;">
                            ${connectionBadge}
                            ${roleBadge}
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-2);">
                        <p class="text-xs text-gray-500" style="margin: 0;">
                            ${lastActiveAt ? `Last active ${formatRelativeTime(lastActiveAt)}` : 'Joined this session recently'}
                        </p>
                        <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            data-participant-action="remove"
                            data-participant-seat-id="${this.escapeHtml(participant.id || '')}"
                            style="color: var(--color-alert);"
                        >Remove seat</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderScribeDeckSettings() {
        const summary = document.getElementById('scribeDeckSettingsSummary');
        const container = document.getElementById('scribeDeckSettingsList');
        if (!summary || !container) {
            return;
        }

        summary.textContent = "Set the slide deck each team's facilitator presents.";

        container.innerHTML = TEAM_OPTIONS.map((team) => {
            const assignment = this.scribeDeckAssignments[team.id] || buildDefaultScribeDeckAssignment(team);
            const defaultDeckPath = buildDefaultScribeDeckPath(team.id);
            const pathInputId = `scribeDeckPath-${team.id}`;
            const labelInputId = `scribeDeckLabel-${team.id}`;
            const uploadInputId = `scribeDeckUpload-${team.id}`;
            const isUpload = assignment.deckSource === SCRIBE_DECK_SOURCE_UPLOAD;
            const method = isUpload ? 'upload' : 'repo';
            const sourceBadge = createBadge({
                text: isUpload ? 'Browser upload' : 'Repo deck',
                variant: isUpload ? 'warning' : 'info',
                size: 'sm',
                rounded: true
            }).outerHTML;
            const metaText = assignment.assignedAt
                ? `Updated ${formatRelativeTime(assignment.assignedAt)}`
                : 'Default deck';
            const currentDeckLabel = isUpload && assignment.deckFileName
                ? `${assignment.deckLabel} (${assignment.deckFileName})`
                : assignment.deckLabel;
            const pathValue = assignment.deckSource === SCRIBE_DECK_SOURCE_REPO
                ? assignment.deckPath
                : '';
            const teamId = this.escapeHtml(team.id);

            return `
                <section class="card card-bordered scribe-deck-card" data-deck-method="${method}">
                    <div class="scribe-deck-card-head">
                        <div>
                            <p class="scribe-deck-team">${this.escapeHtml(team.label)} Facilitator</p>
                            <p class="scribe-deck-deck">${this.escapeHtml(currentDeckLabel)}</p>
                            <p class="scribe-deck-meta">${this.escapeHtml(metaText)}</p>
                        </div>
                        ${sourceBadge}
                    </div>

                    <div class="scribe-deck-toggle" role="group" aria-label="Deck source for ${this.escapeHtml(team.label)} Facilitator">
                        <button type="button" data-scribe-deck-method="repo" data-scribe-deck-team="${teamId}" aria-pressed="${method === 'repo'}">Repo deck</button>
                        <button type="button" data-scribe-deck-method="upload" data-scribe-deck-team="${teamId}" aria-pressed="${method === 'upload'}">Upload file</button>
                    </div>

                    <div class="form-group" style="margin: 0;">
                        <label class="form-label" for="${labelInputId}">Display name</label>
                        <input
                            id="${labelInputId}"
                            class="form-input"
                            type="text"
                            value="${this.escapeHtml(assignment.deckLabel)}"
                            placeholder="${this.escapeHtml(DEFAULT_SCRIBE_DECK_LABEL)}"
                            maxlength="120"
                        >
                    </div>

                    <div class="scribe-deck-panel" data-method-panel="repo">
                        <div class="form-group" style="margin: 0;">
                            <label class="form-label" for="${pathInputId}">Deck path</label>
                            <input
                                id="${pathInputId}"
                                class="form-input"
                                type="text"
                                value="${this.escapeHtml(pathValue)}"
                                placeholder="${this.escapeHtml(defaultDeckPath)}"
                                spellcheck="false"
                                autocomplete="off"
                            >
                            <p class="form-help">Bare filenames resolve in <code>decks/${teamId}/</code>. Works across devices.</p>
                        </div>
                        <div class="card-actions" style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
                            <button type="button" class="btn btn-primary btn-sm" data-scribe-deck-action="load" data-scribe-deck-team="${teamId}">Load deck</button>
                            <button type="button" class="btn btn-secondary btn-sm" data-scribe-deck-action="reset" data-scribe-deck-team="${teamId}">Use default</button>
                        </div>
                    </div>

                    <div class="scribe-deck-panel" data-method-panel="upload">
                        <div class="form-group" style="margin: 0;">
                            <label class="form-label" for="${uploadInputId}">Deck HTML file</label>
                            <input
                                id="${uploadInputId}"
                                class="form-input"
                                type="file"
                                accept=".html,text/html"
                            >
                            <p class="form-help">Cached in this browser — same-device facilitator tabs only.</p>
                        </div>
                        <div class="card-actions" style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
                            <button type="button" class="btn btn-primary btn-sm" data-scribe-deck-action="upload" data-scribe-deck-team="${teamId}">Upload deck</button>
                        </div>
                    </div>
                </section>
            `;
        }).join('');
    }

    async validateScribeDeckPath(deckPath) {
        parseScribeDeckHtml(await fetchScribeDeckHtmlWithTimeout(deckPath));
    }

    async handleScribeDeckAssignmentSubmit(teamId, {
        useDefault = false,
        useUpload = false
    } = {}) {
        const team = TEAM_OPTIONS.find((entry) => entry.id === teamId);
        if (!team) {
            showToast({ message: 'Unknown team selected for the facilitator deck.', type: 'error' });
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No session selected', type: 'error' });
            return;
        }

        const pathInput = document.getElementById(`scribeDeckPath-${teamId}`);
        const labelInput = document.getElementById(`scribeDeckLabel-${teamId}`);
        const uploadInput = document.getElementById(`scribeDeckUpload-${teamId}`);
        const rawDeckPath = useDefault
            ? buildDefaultScribeDeckPath(team.id)
            : pathInput?.value || '';
        const uploadedFile = useUpload
            ? uploadInput?.files?.[0] || null
            : null;

        if (useUpload && !uploadedFile) {
            showToast({ message: 'Choose a deck HTML file to upload.', type: 'error' });
            return;
        }

        if (!useUpload && !useDefault && !String(rawDeckPath).trim()) {
            showToast({ message: 'Deck path is required.', type: 'error' });
            return;
        }

        let deckSource = SCRIBE_DECK_SOURCE_REPO;
        let deckPath = null;
        let deckStorageKey = null;
        let deckFileName = null;
        let deckLabel = DEFAULT_SCRIBE_DECK_LABEL;

        if (useUpload) {
            deckSource = SCRIBE_DECK_SOURCE_UPLOAD;
            deckFileName = normalizeUploadedScribeDeckFileName(uploadedFile?.name || '');
            deckStorageKey = buildUploadedScribeDeckStorageKey(sessionId, team.id);
            deckLabel = normalizeUploadedScribeDeckLabel(labelInput?.value || '', deckFileName);
        } else {
            try {
                deckPath = normalizeScribeDeckPath(rawDeckPath || '', {
                    teamId: team.id
                });
            } catch (error) {
                showToast({
                    message: getUserMessage(error, {
                        fallback: 'Deck path is invalid. Use an HTML deck path inside this app.'
                    }),
                    type: 'error'
                });
                return;
            }

            deckLabel = useDefault
                ? DEFAULT_SCRIBE_DECK_LABEL
                : normalizeScribeDeckLabel(labelInput?.value || '', deckPath, {
                    teamId: team.id
                });
        }

        const loader = showLoader({
            message: useUpload
                ? `Uploading ${team.label} facilitator slides...`
                : useDefault
                ? `Restoring ${team.label} facilitator deck...`
                : `Loading ${team.label} facilitator deck...`
        });

        try {
            if (deckSource === SCRIBE_DECK_SOURCE_UPLOAD) {
                const slides = parseScribeDeckHtml(await uploadedFile.text());
                await saveUploadedScribeDeck({
                    storageKey: deckStorageKey,
                    sessionId,
                    teamId: team.id,
                    deckLabel,
                    fileName: deckFileName,
                    slides
                });
            } else {
                await this.validateScribeDeckPath(deckPath);
            }

            const recipientRole = buildTeamRole(team.id, ROLE_SURFACES.SCRIBE);
            const recipientMetadata = buildWhiteCellRecipientMetadata(recipientRole, {
                content_kind: SCRIBE_DECK_ASSIGNMENT_CONTENT_KIND,
                deck_label: deckLabel,
                deck_source: deckSource,
                ...(deckSource === SCRIBE_DECK_SOURCE_UPLOAD
                    ? {
                        deck_storage_key: deckStorageKey,
                        deck_file_name: deckFileName
                    }
                    : {
                        deck_path: deckPath
                    }),
                source: WHITE_CELL_SCRIBE_DECK_ASSIGNMENT_SOURCE,
                actor_role: this.getTimelineActorRole()
            });
            const content = buildScribeDeckAssignmentCommunicationContent({
                teamLabel: team.label,
                deckLabel,
                deckPath,
                deckSource,
                deckFileName
            });
            const communication = await database.createCommunication({
                session_id: sessionId,
                from_role: 'white_cell',
                to_role: recipientRole,
                type: 'GUIDANCE',
                content,
                metadata: recipientMetadata
            });
            communicationsStore.updateFromServer('INSERT', {
                ...communication,
                session_id: sessionId,
                from_role: 'white_cell',
                to_role: recipientRole,
                type: 'GUIDANCE',
                content,
                metadata: recipientMetadata,
                created_at: communication?.created_at || new Date().toISOString()
            });

            const gameState = this.getCurrentGameState();
            const timelineEvent = await database.createTimelineEvent({
                session_id: sessionId,
                type: 'GUIDANCE',
                content: deckSource === SCRIBE_DECK_SOURCE_UPLOAD
                    ? `White Cell uploaded ${deckLabel} to ${team.label} Facilitator`
                    : `White Cell loaded ${deckLabel} into ${team.label} Facilitator`,
                metadata: {
                    role: this.getTimelineActorRole(),
                    ...recipientMetadata
                },
                team: 'white_cell',
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1
            });
            timelineStore.updateFromServer('INSERT', {
                ...timelineEvent,
                session_id: sessionId,
                type: 'GUIDANCE',
                content: deckSource === SCRIBE_DECK_SOURCE_UPLOAD
                    ? `White Cell uploaded ${deckLabel} to ${team.label} Facilitator`
                    : `White Cell loaded ${deckLabel} into ${team.label} Facilitator`,
                metadata: {
                    role: this.getTimelineActorRole(),
                    ...recipientMetadata
                },
                team: 'white_cell',
                move: gameState.move ?? 1,
                phase: gameState.phase ?? 1,
                created_at: timelineEvent?.created_at || new Date().toISOString()
            });

            showToast({
                message: useUpload
                    ? `${team.label} facilitator slides uploaded.`
                    : useDefault
                    ? `${team.label} facilitator deck reset to default.`
                    : `${team.label} facilitator deck updated.`,
                type: 'success'
            });
        } catch (err) {
            logger.error('Failed to assign facilitator deck:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to load the facilitator deck. Check the deck source and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    async handleRemoveParticipantSeat(seatId) {
        if (!seatId) return;
        const participant = this.participants.find((entry) => entry.id === seatId);
        const displayName = participant?.display_name || 'this participant';

        const confirmed = await confirmModal({
            title: 'Remove seat',
            message: `Remove ${displayName} from the session? Their seat will become available for another participant to claim.`,
            confirmLabel: 'Remove',
            variant: 'danger'
        });
        if (!confirmed) return;

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No session selected', type: 'error' });
            return;
        }

        const loader = showLoader({ message: 'Removing seat...' });
        try {
            await database.removeSessionParticipant(sessionId, seatId);
            participantsStore.updateFromServer('DELETE', { id: seatId });
            showToast({ message: 'Seat removed', type: 'success' });
        } catch (err) {
            logger.error('Failed to remove seat:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to remove seat. Refresh the roster and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    async loadSessionsAdmin() {
        await this.loadResearchExportRuntime();
        const container = document.getElementById('sessionsList');
        const summary = document.getElementById('sessionsSummary');
        if (!container) return;

        container.innerHTML = '<p class="text-sm text-gray-500">Loading sessions...</p>';

        try {
            const sessions = await database.getActiveSessions();
            this.adminSessions = Array.isArray(sessions) ? sessions : [];
            if (summary) {
                summary.textContent = this.adminSessions.length === 0
                    ? 'No sessions found.'
                    : `${this.adminSessions.length} session${this.adminSessions.length === 1 ? '' : 's'} on record.`;
            }
            this.renderSessionsAdmin();
        } catch (err) {
            logger.error('Failed to load sessions:', err);
            container.innerHTML = '<p class="text-sm" style="color: var(--color-alert);">Failed to load sessions.</p>';
        }
    }

    renderSessionsAdmin() {
        const container = document.getElementById('sessionsList');
        if (!container) return;

        const activeSessionId = sessionStore.getSessionId();
        const header = `
            <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-3); flex-wrap: wrap;">
                <button type="button" class="btn btn-primary btn-sm" data-session-action="create">Create Session</button>
                <button type="button" class="btn btn-secondary btn-sm" data-session-action="refresh">Refresh</button>
            </div>
        `;

        if (!this.adminSessions || this.adminSessions.length === 0) {
            container.innerHTML = `${header}<p class="text-sm text-gray-500">No sessions yet. Click "Create Session" to get started.</p>`;
            return;
        }

        const rows = this.adminSessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const resolvedCode = getWhiteCellSessionCode(session);
            const code = resolvedCode === 'N/A' ? '-' : resolvedCode;
            const status = session.status || 'unknown';
            return `
                <div class="card card-bordered" style="padding: var(--space-3); margin-bottom: var(--space-2); ${isActive ? 'border-left: 3px solid var(--color-primary-500);' : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3);">
                        <div>
                            <p class="text-sm font-semibold" style="margin: 0;">${this.escapeHtml(session.name || 'Unnamed session')}${isActive ? ' <span class="text-xs" style="color: var(--color-primary-600); text-transform: uppercase; letter-spacing: 0.05em; margin-left: var(--space-2);">Active</span>' : ''}</p>
                            <p class="text-xs text-gray-500" style="margin: 2px 0 0;">Code: ${this.escapeHtml(code)} | Status: ${this.escapeHtml(status)}</p>
                        </div>
                        <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            data-session-action="delete"
                            data-session-id="${this.escapeHtml(session.id)}"
                            style="color: var(--color-alert);"
                        >Delete</button>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `${header}${rows}`;
    }

    showCreateSessionAdminModal() {
        const content = document.createElement('div');
        content.innerHTML = `
            <form id="createSessionAdminForm" novalidate>
                <div class="form-group">
                    <label class="form-label" for="newSessionName">Session Name *</label>
                    <input id="newSessionName" class="form-input" type="text" placeholder="e.g. Spring 2026 Exercise" maxlength="120">
                </div>
                <div class="form-group">
                    <label class="form-label" for="newSessionCode">Join Code (optional)</label>
                    <input id="newSessionCode" class="form-input" type="text" placeholder="Leave blank to auto-generate" maxlength="${SESSION_CODE_MAX_LENGTH}">
                    <p class="form-hint">Participants enter this to join from the landing page.</p>
                </div>
            </form>
        `;

        const modalRef = { current: null };
        modalRef.current = showModal({
            title: 'Create Session',
            content,
            size: 'md',
            buttons: [
                { label: 'Cancel', variant: 'secondary', onClick: () => {} },
                {
                    label: 'Create',
                    variant: 'primary',
                    onClick: () => {
                        const name = content.querySelector('#newSessionName')?.value?.trim();
                        const code = content.querySelector('#newSessionCode')?.value?.trim();
                        if (!name) {
                            showToast({ message: 'Session name is required.', type: 'error' });
                            return false;
                        }
                        this.submitCreateSessionAdmin(modalRef.current, { name, code }).catch((err) => {
                            logger.error('Failed to create session:', err);
                        });
                        return false;
                    }
                }
            ]
        });
    }

    async submitCreateSessionAdmin(modal, { name, code }) {
        const loader = showLoader({ message: 'Creating session...' });
        try {
            const payload = { name, status: 'active' };
            if (code) payload.session_code = code;
            const session = await database.createSession(payload);
            showToast({ message: `Session "${session.name || name}" created.`, type: 'success' });
            modal?.close();
            await this.loadSessionsAdmin();
        } catch (err) {
            logger.error('Failed to create session:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to create session. Check the session name and join code, then try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    async handleDeleteSessionAdmin(sessionId) {
        const session = (this.adminSessions || []).find((entry) => entry.id === sessionId);
        const confirmed = await confirmModal(getWhiteCellDeleteSessionConfirmationOptions(session));
        if (!confirmed) return;

        const loader = showLoader({ message: 'Deleting session...' });
        try {
            await database.deleteSession(sessionId);
            showToast({ message: 'Session deleted.', type: 'success' });
            await this.loadSessionsAdmin();
        } catch (err) {
            logger.error('Failed to delete session:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to delete session. Refresh the session list and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    async loadResearchExportRuntime() {
        try {
            const captureModePromise = typeof database.getResearchCaptureMode === 'function'
                ? database.getResearchCaptureMode().catch(() => 'research')
                : Promise.resolve('research');
            const buildHashPromise = typeof database.getResearchBuildHash === 'function'
                ? database.getResearchBuildHash().catch(() => null)
                : Promise.resolve(null);
            const [captureMode, softwareBuildHash] = await Promise.all([
                captureModePromise,
                buildHashPromise
            ]);

            this.researchCaptureMode = captureMode === 'standard' ? 'standard' : 'research';
            this.researchBuildHash = softwareBuildHash || null;
        } catch (error) {
            logger.warn('Failed to load research export runtime config; using research mode.', error);
            this.researchCaptureMode = 'research';
            this.researchBuildHash = null;
        }

        this.renderExportDataAdmin();
    }

    getResearchNotesAppendixEnabled() {
        return document.getElementById('whiteCellExportResearchIncludeNotes')?.checked === true;
    }

    getResearchExportVersion(sessionId) {
        if (!sessionId || typeof window === 'undefined') {
            return 1;
        }

        try {
            const rawValue = window.localStorage?.getItem('esg_research_export_versions');
            const versionMap = rawValue ? JSON.parse(rawValue) : {};
            const nextVersion = Number(versionMap?.[sessionId] || 0) + 1;

            window.localStorage?.setItem('esg_research_export_versions', JSON.stringify({
                ...versionMap,
                [sessionId]: nextVersion
            }));

            return nextVersion;
        } catch (error) {
            logger.warn('Failed to persist research export version; defaulting to 1.', error);
            return 1;
        }
    }

    resolveResearchExporterPseudonym() {
        const operatorAuth = sessionStore.getOperatorAuth?.();
        const roleLabel = this.isLeadOperator() ? 'lead' : 'support';

        if (operatorAuth?.grantId) {
            return `white_cell_${roleLabel}-${String(operatorAuth.grantId).slice(0, 8)}`;
        }

        return `white_cell_${roleLabel}_operator`;
    }

    renderExportDataAdmin() {
        const container = document.getElementById('exportDataList');
        if (!container) return;

        const includeNotesAppendix = this.getResearchNotesAppendixEnabled();
        const sessionData = sessionStore.getSessionData?.() || null;
        const selectionState = buildWhiteCellExportSelectionState({
            sessionId: sessionStore.getSessionId(),
            sessionName: sessionData?.name || null,
            captureMode: this.researchCaptureMode
        });
        const legacyButtons = getWhiteCellAdminExportButtonConfig()
            .filter(({ availability }) => availability === 'legacy')
            .map(({ action, className, label }) => (
                `<button type="button" class="${className}" data-export-type="${action}" ${selectionState.disabled ? 'disabled' : ''}>${label}</button>`
            ))
            .join('');
        const researchButtons = getWhiteCellAdminExportButtonConfig()
            .filter(({ availability }) => availability === 'research')
            .map(({ action, className, label }) => (
                `<button type="button" class="${className}" data-export-type="${action}" ${selectionState.researchDisabled ? 'disabled' : ''}>${label}</button>`
            ))
            .join('');

        container.innerHTML = `
            <div style="display: grid; gap: var(--space-3);">
                <p class="text-xs text-gray-500" id="whiteCellExportSelectionState">${this.escapeHtml(selectionState.message)}</p>
                <div class="card card-bordered" style="padding: var(--space-3);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-3);">
                        <div>
                            <h4 class="text-sm font-semibold" style="margin: 0 0 var(--space-1);">Legacy Session Bundle</h4>
                            <p class="text-xs text-gray-500" style="margin: 0;">Exports are scoped to the currently active session.</p>
                        </div>
                    </div>
                    <div style="display: grid; gap: var(--space-2);">
                        ${legacyButtons}
                    </div>
                </div>
                <div class="card card-bordered" style="padding: var(--space-3);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-3);">
                        <div>
                            <h4 class="text-sm font-semibold" style="margin: 0 0 var(--space-1);">Research Bundle</h4>
                            <p class="text-xs text-gray-500" style="margin: 0;">White Cell can export the same research ZIP and printable report as Game Master when backend research capture mode is enabled.</p>
                        </div>
                        <span class="text-xs text-gray-500" aria-live="polite">${selectionState.captureMode === 'research' ? 'Research mode' : 'Standard mode'}</span>
                    </div>
                    <label for="whiteCellExportResearchIncludeNotes" class="switch-field" style="margin-bottom: var(--space-3);">
                        <span class="switch-field-label">Include notes appendix in <code>report.html</code></span>
                        <span class="switch">
                            <input type="checkbox" id="whiteCellExportResearchIncludeNotes" ${selectionState.researchDisabled ? 'disabled' : ''}>
                            <span class="switch-track"></span>
                        </span>
                    </label>
                    <div style="display: grid; gap: var(--space-2);">
                        ${researchButtons}
                    </div>
                </div>
            </div>
        `;

        const notesToggle = document.getElementById('whiteCellExportResearchIncludeNotes');
        if (notesToggle && includeNotesAppendix && !selectionState.researchDisabled) {
            notesToggle.checked = true;
        }
    }

    async handleExportAdmin(exportType) {
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No active session selected.', type: 'error' });
            return;
        }

        const exportConfig = getWhiteCellAdminExportButtonConfig().find((config) => config.action === exportType);
        if (!exportConfig) {
            showToast({ message: `Unknown export type: ${exportType}`, type: 'error' });
            return;
        }

        if (exportConfig.availability === 'research' && this.researchCaptureMode !== 'research') {
            showToast({
                message: 'Research archive export requires research capture mode on the backend.',
                type: 'warning'
            });
            return;
        }

        const loader = showLoader({ message: 'Preparing export...' });
        try {
            if (exportConfig.availability === 'research') {
                const researchBundle = await database.fetchResearchExportBundle(sessionId);
                const researchExport = await buildResearchExportBundle(researchBundle, {
                    captureMode: this.researchCaptureMode,
                    generatedByPseudonym: this.resolveResearchExporterPseudonym(),
                    exportVersion: this.getResearchExportVersion(sessionId),
                    includeNotesAppendix: this.getResearchNotesAppendixEnabled(),
                    softwareBuildHash: this.researchBuildHash || researchBundle.softwareBuildHash || null
                });

                if (exportType === 'research-archive') {
                    await downloadResearchExportArchive(researchExport, `${researchExport.rootFolderName}.zip`);
                } else {
                    await openResearchPrintWindow(researchExport.reportHtml, {
                        title: `${researchBundle.session?.name || 'Research report'}`
                    });
                }
            } else {
                const bundle = await database.fetchSessionBundle(sessionId);

                if (exportType === 'actions-csv') {
                    downloadCsv(
                        exportSessionActionsCsv(bundle.actions),
                        `session-${sessionId.slice(0, 8)}-actions.csv`
                    );
                } else if (exportType === 'rfis-csv') {
                    downloadCsv(
                        exportSessionRequestsCsv(bundle.requests),
                        `session-${sessionId.slice(0, 8)}-rfis.csv`
                    );
                } else if (exportType === 'timeline-csv') {
                    downloadCsv(
                        exportSessionTimelineCsv(bundle.timeline),
                        `session-${sessionId.slice(0, 8)}-timeline.csv`
                    );
                } else if (exportType === 'participants-csv') {
                    downloadCsv(
                        exportSessionParticipantsCsv(bundle.participants),
                        `session-${sessionId.slice(0, 8)}-participants.csv`
                    );
                } else if (exportType === 'session-json') {
                    const payload = buildJsonExportPayload(bundle);
                    downloadJsonData(payload, `session-${sessionId.slice(0, 8)}.json`);
                }
            }
            showToast({ message: exportConfig.successMessage, type: 'success' });
        } catch (err) {
            logger.error('Failed to export data:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to export data. Refresh the selected session and try again.'
                }),
                type: 'error'
            });
        } finally {
            hideLoader();
        }
    }

    renderTribeStreetJournalList() {
        const container = document.getElementById('tribeStreetJournalList');
        if (!container) return;
        this.renderTribeStreetJournalEmbed();

        if (this.tribeStreetJournalEntries.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No team captures are available for review yet.</p>';
            return;
        }

        const visibleEntries = this.tribeStreetJournalEntries.slice(0, WHITE_CELL_TRIBE_STREET_JOURNAL_RENDER_LIMIT);
        const hiddenCount = Math.max(0, this.tribeStreetJournalEntries.length - visibleEntries.length);

        container.innerHTML = `
            ${hiddenCount ? `<p class="text-xs text-gray-500" style="margin: 0 0 var(--space-3);">Showing the first ${WHITE_CELL_TRIBE_STREET_JOURNAL_RENDER_LIMIT} of ${this.tribeStreetJournalEntries.length} team captures.</p>` : ''}
            ${visibleEntries.map((entry) => {
            const eventType = entry.type || entry.event_type || 'NOTE';
            const badgeVariant = {
                NOTE: 'default',
                MOMENT: 'warning',
                QUOTE: 'info'
            }[eventType] || 'default';
            const actorLabel = entry.metadata?.actor || getRoleDisplayName(entry.metadata?.role) || 'Team capture';
            const noteScope = entry?.metadata?.note_scope || null;
            const noteScopeLabel = getNotetakerTimelineScopeLabel(noteScope);
            const noteDetails = getNotetakerSaveTimelineDetailItems(entry);
            const noteDetailsMarkup = isNotetakerSaveTimelineEvent(entry) && noteDetails.length > 0
                ? `
                    <div class="card card-bordered" style="margin-top: var(--space-3); padding: var(--space-3);">
                        <p class="text-xs text-gray-500" style="margin: 0 0 var(--space-2);">${this.escapeHtml(noteScopeLabel)} snapshot</p>
                        <dl style="display: grid; gap: var(--space-2); margin: 0;">
                            ${noteDetails.map((detail) => `
                                <div>
                                    <dt class="text-xs text-gray-500" style="margin: 0;">${this.escapeHtml(detail.label)}</dt>
                                    <dd class="text-sm" style="margin: 0;">${this.escapeHtml(detail.value)}</dd>
                                </div>
                            `).join('')}
                        </dl>
                    </div>
                `
                : '';
            const scopeBadgeMarkup = isNotetakerSaveTimelineEvent(entry)
                ? createBadge({
                    text: `${noteScopeLabel.toUpperCase()} SNAPSHOT`,
                    variant: 'info',
                    size: 'sm',
                    rounded: true
                }).outerHTML
                : '';

            return `
                <div class="card card-bordered" style="padding: var(--space-3); margin-bottom: var(--space-3);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-2);">
                        <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
                            ${createBadge({ text: eventType, variant: badgeVariant, size: 'sm', rounded: true }).outerHTML}
                            ${scopeBadgeMarkup}
                            ${createBadge({ text: this.formatTeamLabel(entry.team), variant: 'primary', size: 'sm', rounded: true }).outerHTML}
                            <span class="text-xs text-gray-500">${this.escapeHtml(actorLabel)}</span>
                        </div>
                        <span class="text-xs text-gray-400">${formatDateTime(entry.created_at)}</span>
                    </div>
                    <p class="text-sm">${this.escapeHtml(entry.content || entry.description || '')}</p>
                    ${noteDetailsMarkup}
                    <div class="card-actions" style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); margin-top: var(--space-3);">
                        <span class="text-xs text-gray-500">Move ${this.escapeHtml(String(entry.move || 1))} | Phase ${this.escapeHtml(String(entry.phase || 1))}</span>
                        <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            data-journal-action="send-update"
                            data-source-event-id="${this.escapeHtml(entry.id || '')}"
                        >Send Update</button>
                    </div>
                </div>
            `;
        }).join('')}
        `;
    }

    renderTribeStreetJournalEmbed() {
        const container = document.getElementById('tribeStreetJournalEmbed');
        if (!container || container.innerHTML?.includes(TRIBE_STREET_JOURNAL_EMBED_URL)) return;

        container.innerHTML = createTribeStreetJournalEmbedMarkup({
            title: 'White Cell Tribe Street Journal live site'
        });
    }

    renderVerbaAiList() {
        const container = document.getElementById('verbaAiList');
        if (!container) return;

        if (this.verbaAiUpdates.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No Verba AI population sentiment updates have been sent yet.</p>';
            return;
        }

        const visibleUpdates = this.verbaAiUpdates.slice(0, WHITE_CELL_VERBA_AI_RENDER_LIMIT);
        const hiddenCount = Math.max(0, this.verbaAiUpdates.length - visibleUpdates.length);

        container.innerHTML = `
            ${hiddenCount ? `<p class="text-xs text-gray-500" style="margin: 0 0 var(--space-3);">Showing the first ${WHITE_CELL_VERBA_AI_RENDER_LIMIT} of ${this.verbaAiUpdates.length} Verba AI updates.</p>` : ''}
            ${visibleUpdates.map((communication) => `
            <div class="card card-bordered" style="padding: var(--space-3); margin-bottom: var(--space-3); border-left: 3px solid var(--color-success);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-2);">
                    <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
                        ${createBadge({ text: 'VERBA AI', variant: 'success', size: 'sm', rounded: true }).outerHTML}
                        <span class="text-xs text-gray-500">${this.escapeHtml(this.formatCommunicationRecipient(communication.to_role))}</span>
                    </div>
                    <span class="text-xs text-gray-400">${formatDateTime(communication.created_at)}</span>
                </div>
                <p class="text-sm">${this.escapeHtml(communication.content || '')}</p>
            </div>
        `).join('')}
        `;
    }

    renderCommunicationHistory() {
        const container = document.getElementById('commHistory');
        if (!container) return;

        if (this.communications.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No communications have been exchanged yet.</p>';
            return;
        }

        const visibleCommunications = this.communications.slice(0, WHITE_CELL_COMMUNICATION_RENDER_LIMIT);
        const hiddenCount = Math.max(0, this.communications.length - visibleCommunications.length);

        container.innerHTML = `
            ${hiddenCount ? `<p class="text-xs text-gray-500" style="margin: 0 0 var(--space-3);">Showing the first ${WHITE_CELL_COMMUNICATION_RENDER_LIMIT} of ${this.communications.length} communications.</p>` : ''}
            ${visibleCommunications.map((communication) => {
            const isOutbound = communication.from_role === 'white_cell';
            const counterpartLabel = isOutbound
                ? `To ${this.formatCommunicationRecipient(communication.to_role)}`
                : `From ${this.formatCommunicationRecipient(communication.from_role)}`;

            return `
                <div class="card card-bordered" style="padding: var(--space-4); margin-bottom: var(--space-3);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-2); margin-bottom: var(--space-2);">
                        <div>
                            <p class="text-sm font-semibold">${this.escapeHtml(counterpartLabel)}</p>
                            <p class="text-xs text-gray-500">${formatRelativeTime(communication.created_at)}</p>
                        </div>
                        ${createBadge({ text: communication.type || 'MESSAGE', size: 'sm' }).outerHTML}
                    </div>
                    <p class="text-sm">${this.escapeHtml(communication.content || '')}</p>
                </div>
            `;
        }).join('')}
        `;
    }

    formatCommunicationRecipient(recipient) {
        if (recipient === WHITE_CELL_ALL_TEAMS_RECIPIENT) {
            return 'All Teams';
        }

        if (recipient === 'white_cell') {
            return 'White Cell';
        }

        if (TEAM_LABELS[recipient]) {
            return getWhiteCellTeamLabel(recipient);
        }

        return getRoleDisplayName(recipient) || recipient || 'Unknown recipient';
    }

    syncTimelineFromStore() {
        this.timelineEvents = timelineStore.getAll();
        this.tribeStreetJournalEntries = this.timelineEvents
            .filter((event) => isTeamCaptureTimelineEvent(event) || isNotetakerSaveTimelineEvent(event))
            .sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0));
        this.configureTimelineFilters();
        this.renderTimeline();
        this.renderTribeStreetJournalList();
    }

    configureTimelineFilters() {
        const teamSelect = document.getElementById('timelineTeamFilter');
        const roleSelect = document.getElementById('timelineRoleFilter');
        const moveSelect = document.getElementById('timelineMoveFilter');
        const activityTypeSelect = document.getElementById('timelineActivityTypeFilter');
        if (!teamSelect || !roleSelect || !moveSelect || !activityTypeSelect) return;

        const {
            teamOptions,
            roleOptions,
            moveOptions,
            activityTypeOptions
        } = buildWhiteCellTimelineFilterOptions(this.timelineEvents);
        this.populateFilterSelect(teamSelect, teamOptions, this.timelineFilters.team);
        this.populateFilterSelect(roleSelect, roleOptions, this.timelineFilters.role);
        this.populateFilterSelect(moveSelect, moveOptions, this.timelineFilters.move);
        this.populateFilterSelect(activityTypeSelect, activityTypeOptions, this.timelineFilters.activityType);
        this.timelineFilters.team = teamSelect.value || null;
        this.timelineFilters.role = roleSelect.value || null;
        this.timelineFilters.move = moveSelect.value || null;
        this.timelineFilters.activityType = activityTypeSelect.value || null;
    }

    populateFilterSelect(selectElement, options, currentValue) {
        if (!selectElement) {
            return;
        }

        const normalizedValue = currentValue || '';
        selectElement.innerHTML = options.map((option) => (
            `<option value="${this.escapeHtml(option.value)}">${this.escapeHtml(option.label)}</option>`
        )).join('');

        selectElement.value = options.some((option) => option.value === normalizedValue)
            ? normalizedValue
            : '';
    }

    renderTimeline() {
        const container = document.getElementById('timelineList');
        if (!container) return;

        const filteredEvents = filterWhiteCellTimelineEvents(this.timelineEvents, this.timelineFilters);
        const hasActiveFilters = Boolean(
            this.timelineFilters.team
            || this.timelineFilters.role
            || this.timelineFilters.move
            || this.timelineFilters.activityType
        );

        if (filteredEvents.length === 0) {
            container.innerHTML = hasActiveFilters
                ? '<p class="text-sm text-gray-500">No timeline events match the selected filters.</p>'
                : '<p class="text-sm text-gray-500">No events yet.</p>';
            return;
        }

        const visibleEvents = filteredEvents.slice(0, WHITE_CELL_TIMELINE_RENDER_LIMIT);
        const hiddenCount = Math.max(0, filteredEvents.length - visibleEvents.length);
        const overflowNote = hiddenCount
            ? `<p class="text-xs text-gray-500" style="margin: 0 0 var(--space-3);">Showing the first ${WHITE_CELL_TIMELINE_RENDER_LIMIT} of ${filteredEvents.length} timeline events for the current filters.</p>`
            : '';

        container.innerHTML = `
            ${overflowNote}
            ${visibleEvents.map((event) => {
            const eventType = getWhiteCellTimelineEventType(event) || 'EVENT';
            const eventContent = event.content || event.description || '';
            const teamLabel = this.formatTeamLabel(event.team);
            const rawRole = resolveWhiteCellTimelineMetadataRole(event);
            const inferredRole = getWhiteCellTimelineRoleFilterValue(event);
            const teamRoleLabel = rawRole
                ? (getRoleDisplayName(rawRole) || rawRole)
                : (inferredRole ? getWhiteCellFilterRoleLabel(inferredRole) : 'Unknown role');
            const move = event.move ?? 1;
            const phase = event.phase ?? 1;
            const phaseLabel = `Phase ${phase} - ${getPhaseLabel(phase)}`;
            const timestamp = formatDateTime(event.created_at);
            const noteScope = event?.metadata?.note_scope || null;
            const noteScopeLabel = getNotetakerTimelineScopeLabel(noteScope);
            const noteDetails = getNotetakerSaveTimelineDetailItems(event);
            const noteDetailsMarkup = isNotetakerSaveTimelineEvent(event) && noteDetails.length > 0
                ? `
                    <div class="card card-bordered" style="margin-top: var(--space-2); padding: var(--space-3);">
                        <p class="text-xs text-gray-500" style="margin: 0 0 var(--space-2);">${this.escapeHtml(noteScopeLabel)} snapshot</p>
                        <dl style="display: grid; gap: var(--space-2); margin: 0;">
                            ${noteDetails.map((detail) => `
                                <div>
                                    <dt class="text-xs text-gray-500" style="margin: 0;">${this.escapeHtml(detail.label)}</dt>
                                    <dd class="text-sm" style="margin: 0;">${this.escapeHtml(detail.value)}</dd>
                                </div>
                            `).join('')}
                        </dl>
                    </div>
                `
                : '';

            return `
                <div class="timeline-event" style="display: flex; gap: var(--space-3); padding: var(--space-3); border-bottom: 1px solid var(--color-gray-200);">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary-500); margin-top: 6px; flex-shrink: 0;"></div>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; gap: var(--space-2); align-items: center;">
                            ${createBadge({ text: eventType, size: 'sm' }).outerHTML}
                            <span class="text-xs text-gray-400">${this.escapeHtml(timestamp)}</span>
                        </div>
                        <p class="text-sm mt-1">${this.escapeHtml(eventContent)}</p>
                        ${noteDetailsMarkup}
                        <p class="timeline-event-meta" style="margin-top: var(--space-2); font-size: var(--text-xs); color: var(--color-text-secondary);">${this.escapeHtml(teamLabel)} | ${this.escapeHtml(teamRoleLabel)} | Move ${this.escapeHtml(String(move))} | ${this.escapeHtml(phaseLabel)}</p>
                    </div>
                </div>
            `;
        }).join('')}
        `;
    }

    formatTeamLabel(team) {
        return getWhiteCellTeamLabel(team);
    }

    escapeHtml(value) {
        if (typeof value !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = value;
        return div.innerHTML;
    }

    destroy() {
        const documentRef = typeof document !== 'undefined' ? document : null;
        this.mountedPlugins.forEach((mountedPlugin) => {
            mountedPlugin.plugin.unmount?.(mountedPlugin.mountResult, {
                controller: this,
                document: documentRef,
                gameState: this.getCurrentGameState(),
                gameStateStore,
                host: mountedPlugin.host,
                plugin: mountedPlugin.plugin,
                pluginState: this.pluginState[mountedPlugin.plugin.id],
                sessionStore
            });
            if (mountedPlugin.host) {
                mountedPlugin.host.innerHTML = '';
                mountedPlugin.host.remove?.();
            }
        });
        this.mountedPlugins.clear();
        this.storeUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
        this.storeUnsubscribers = [];
    }
}

const whiteCellController = new WhiteCellController();

const shouldAutoInitWhiteCell = typeof document !== 'undefined' &&
    typeof window !== 'undefined' &&
    !globalThis.__ESG_DISABLE_AUTO_INIT__;

if (shouldAutoInitWhiteCell) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => whiteCellController.init());
    } else {
        whiteCellController.init();
    }

    window.addEventListener('beforeunload', () => whiteCellController.destroy());
}

export default whiteCellController;
