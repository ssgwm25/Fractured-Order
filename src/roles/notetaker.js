/**
 * Notetaker Role Controller
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Handles Notetaker specific functionality:
 * - Quick capture (notes, moments, quotes)
 * - Team dynamics tracking
 * - Alliance tracking
 * - Timeline view
 * - Read-only action viewing
 */

import { sessionStore } from '../stores/session.js';
import { gameStateStore } from '../stores/gameState.js';
import { actionsStore } from '../stores/actions.js';
import { timelineStore } from '../stores/timeline.js';
import { communicationsStore } from '../stores/communications.js';
import { database } from '../services/database.js';
import { syncService } from '../services/sync.js';
import { createLogger } from '../utils/logger.js';
import { mountFollowAlong } from '../features/onboarding/followAlong.js';
import { adaptGreenGuide } from '../features/onboarding/greenGuidance.js';
import { showToast } from '../components/ui/Toast.js';
import { createArtifactLifecycleBadge, createBadge, createPriorityBadge } from '../components/ui/Badge.js';
import { formatDateTime, formatRelativeTime } from '../utils/formatting.js';
import { debounce } from '../utils/debounce.js';
import { navigateToApp } from '../core/navigation.js';
import { ROLE_SURFACES, buildTeamRole, resolveTeamContext } from '../core/teamContext.js';
import { ensureSeatStartup } from '../services/seatBootstrap.js';
import { seatStorageKey, bindControllerSeatCleanup } from '../core/seatContext.js';
import {
    buildNotetakerParticipantContext,
    filterObservationTimelineByTeam,
    readParticipantScopedNotetakerSection
} from '../features/notetaker/storage.js';
import {
    buildNotetakerTimelineDetailItems,
    getNotetakerSaveTimelineDetailItems,
    getNotetakerTimelineScopeLabel,
    isNotetakerSaveTimelineEvent,
    NOTETAKER_TIMELINE_EVENT_SOURCE
} from '../features/notetaker/timelineDetails.js';
import {
    WHITE_CELL_UPDATE_KINDS,
    getWhiteCellCommunicationUpdateKind,
    isNotetakerScopedWhiteCellCommunication,
    isWhiteCellTimelineEventVisibleToNotetaker
} from '../features/communications/targeting.js';

const logger = createLogger('Notetaker');

export const DEFAULT_DYNAMICS_DATA = {
    emergingLeaders: '',
    decisionStyle: '',
    frictionLevel: '5',
    frictionSources: '',
    consensusLevel: '5',
    dynamicsSummary: ''
};

export const DEFAULT_ALLIANCE_DATA = {
    allianceNotes: '',
    externalPressures: ''
};

const CAPTURE_EVENT_TYPES = ['NOTE', 'MOMENT', 'QUOTE'];
export const NOTETAKER_TIMELINE_RENDER_LIMIT = 80;
export const NOTETAKER_INBOX_RENDER_LIMIT = 60;

export { NOTETAKER_TIMELINE_EVENT_SOURCE };

const NOTETAKER_SAVE_TIMELINE_CONTENT = {
    dynamics: 'Team dynamics notes saved',
    alliance: 'Alliance tracking notes saved'
};

export function getNotetakerRecordForMove(records = [], move = 1) {
    return (records || []).find((record) => record.move === move) || null;
}

export function getVisibleNotetakerTimelineEvents(events = [], limit = NOTETAKER_TIMELINE_RENDER_LIMIT) {
    const allEvents = Array.isArray(events) ? events : [];
    const visibleEvents = allEvents.slice(0, limit);

    return {
        visibleEvents,
        hiddenCount: Math.max(0, allEvents.length - visibleEvents.length)
    };
}

export function getVisibleNotetakerInboxCommunications(
    communications = [],
    limit = NOTETAKER_INBOX_RENDER_LIMIT
) {
    const allCommunications = Array.isArray(communications) ? communications : [];
    const visibleCommunications = allCommunications.slice(0, limit);

    return {
        visibleCommunications,
        hiddenCount: Math.max(0, allCommunications.length - visibleCommunications.length)
    };
}

export function buildNotetakerViewState(record = null, {
    teamId = null,
    participantKey = null
} = {}) {
    return {
        dynamicsData: readParticipantScopedNotetakerSection(record?.dynamics_analysis, DEFAULT_DYNAMICS_DATA, {
            teamId,
            participantKey,
            fallbackTeamId: record?.team
        }),
        allianceData: readParticipantScopedNotetakerSection(record?.external_factors, DEFAULT_ALLIANCE_DATA, {
            teamId,
            participantKey,
            fallbackTeamId: record?.team
        }),
        observationTimeline: filterObservationTimelineByTeam(record?.observation_timeline, {
            teamId,
            fallbackTeamId: record?.team
        })
    };
}

export function createObservationTimelineEntry({
    id = null,
    type,
    content,
    phase = 1,
    createdAt = new Date().toISOString(),
    factionTag = null,
    teamId = null,
    participantKey = null,
    participantId = null,
    participantLabel = null,
    clientId = null
} = {}) {
    return {
        id,
        type,
        timestamp: createdAt,
        phase,
        content,
        ...(teamId ? { team: teamId } : {}),
        ...(participantKey ? { participant_key: participantKey } : {}),
        ...(participantId ? { participant_id: participantId } : {}),
        ...(participantLabel ? { participant_label: participantLabel } : {}),
        ...(clientId ? { client_id: clientId } : {}),
        ...(factionTag ? { faction_tag: factionTag } : {})
    };
}

export function isObservationCaptureEvent(event = {}) {
    const eventType = event?.type ?? event?.event_type ?? null;
    return CAPTURE_EVENT_TYPES.includes(eventType) &&
        event?.metadata?.source !== NOTETAKER_TIMELINE_EVENT_SOURCE;
}

export function buildNotetakerSaveTimelineEvent(noteScope, {
    sessionId = null,
    teamId = null,
    teamLabel = null,
    participantKey = null,
    participantId = null,
    participantLabel = null,
    clientId = null,
    move = 1,
    phase = 1
} = {}, noteData = {}) {
    const content = NOTETAKER_SAVE_TIMELINE_CONTENT[noteScope];
    if (!content) {
        throw new Error(`Unsupported notetaker timeline scope: ${noteScope}`);
    }

    const actor = participantLabel ||
        (teamLabel ? `${teamLabel} Notetaker` : (teamId ? `${teamId} notetaker` : 'Notetaker'));
    const noteDetails = buildNotetakerTimelineDetailItems(noteScope, noteData);

    return {
        session_id: sessionId,
        type: 'NOTE',
        content,
        team: teamId,
        client_id: clientId,
        move,
        phase,
        metadata: {
            actor,
            role: teamId ? buildTeamRole(teamId, ROLE_SURFACES.NOTETAKER) : null,
            source: NOTETAKER_TIMELINE_EVENT_SOURCE,
            note_scope: noteScope,
            note_scope_label: getNotetakerTimelineScopeLabel(noteScope),
            note_details: noteDetails,
            ...(participantKey ? { participant_key: participantKey } : {}),
            ...(participantId ? { participant_id: participantId } : {}),
            ...(participantLabel ? { participant_label: participantLabel } : {})
        }
    };
}

const AUTO_SAVE_TEXT = {
    idle: 'No unsaved changes',
    saving: 'Saving...',
    saved: 'Saved to your notes',
    error: 'Save failed',
    reload: 'Save not confirmed. Keep your text, then reload saved notes before retrying.'
};

const AUTO_SAVE_ELEMENT_IDS = {
    dynamics: 'dynamicsAutoSave',
    alliance: 'allianceAutoSave'
};

/**
 * Notetaker Controller Class
 */
export class NotetakerController {
    constructor() {
        this.captures = [];
        this.actions = [];
        this.inboxCommunications = [];
        this.dynamicsData = { ...DEFAULT_DYNAMICS_DATA };
        this.allianceData = { ...DEFAULT_ALLIANCE_DATA };
        this.observationTimeline = [];
        this.dynamicsAutoSaveDebounce = null;
        this.allianceAutoSaveDebounce = null;
        this.storeUnsubscribers = [];
        this.currentMove = 1;
        this.currentPhase = 1;
        this.initialLoadComplete = false;
        this.teamContext = resolveTeamContext();
        this.teamId = this.teamContext.teamId;
        this.teamLabel = this.teamContext.teamLabel;
        this.participantContext = {
            participantKey: null,
            participantId: null,
            clientId: null,
            participantLabel: null
        };
        this.seenInboxCommunicationIds = new Set();
        this.newInboxCommunicationIds = new Set();
        this.pendingInboxArrivalIds = new Set();
        this.hasHydratedInbox = false;
        this.scopedNotes = null;
        this.destroyed = false;
    }

    /**
     * Initialize the Notetaker interface
     */
    async init() {
        if (!await ensureSeatStartup()) return;
        bindControllerSeatCleanup(this);
        this.storeUnsubscribers.push(() => {
            // The existing seat-cleanup binding invokes these disposers on revocation.
            if (this.scopedNotes) this.scopedNotes.ready = false;
            this.scopedNotes = null;
            this.dynamicsData = { ...DEFAULT_DYNAMICS_DATA };
            this.allianceData = { ...DEFAULT_ALLIANCE_DATA };
            this.observationTimeline = [];
        });
        this.teamContext = resolveTeamContext({ seat: sessionStore.getConfirmedSeat?.() });
        this.teamId = this.teamContext.teamId;
        this.teamLabel = this.teamContext.teamLabel;
        logger.info('Initializing Notetaker interface');

        // Check for valid session
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast('No session found. Please join a session first.', { type: 'error' });
            setTimeout(() => {
                navigateToApp('');
            }, 2000);
            return;
        }

        const role = sessionStore.getRole() || sessionStore.getSessionData()?.role;
        if (role !== this.teamContext.notetakerRole) {
            showToast(`This page is only available to the ${this.teamContext.notetakerLabel} role.`, { type: 'error' });
            setTimeout(() => {
                navigateToApp('');
            }, 2000);
            return;
        }

        this.refreshParticipantContext();
        this.configureTeamLabels();
        await syncService.initialize(sessionId, {
            participantId: sessionStore.getSessionParticipantId?.() || null
        });
        if (this.seatInvalidated) return;
        this.bindEventListeners();
        this.setupAutoSave();
        this.subscribeToLiveData();
        this.syncActionsFromStore();
        this.syncInboxFromStore();
        this.syncTimelineFromStore();
        this.initialLoadComplete = true;
        await this.loadCurrentMoveData();
        if (this.seatInvalidated || this.destroyed) return;
        this.mountFollowAlongOnboarding();

        logger.info('Notetaker interface initialized');
    }

    mountFollowAlongOnboarding() {
        const scoped = this.usesScopedNotes();
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
        this.onboarding = mountFollowAlong(adaptGreenGuide({
            storageKey: seatStorageKey(`followalong:notetaker:${this.teamId}`),
            title: `${this.teamContext.notetakerLabel} guide`,
            roleLabel: this.teamContext.notetakerLabel,
            summary: `Preserve how ${this.teamLabel} reached its decisions: the dynamics, alliances, turning points, observations, and sequence behind the formal record.`,
            steps: [
                {
                    title: 'Your role in the exercise',
                    body: `As ${this.teamContext.notetakerLabel}, you preserve the decision process without interrupting ${this.teamLabel}'s flow.`,
                    narrative: 'Capture evidence that explains how the room changed: who influenced the choice, where friction emerged, what assumptions shifted, and which moment became decisive.',
                    details: scoped
                        ? ['Captures, dynamics and alliances stay in your private move notes.', 'Manual saves do not publish notes to the shared timeline.', 'Keep unsaved text before reloading after a conflict or uncertain save.']
                        : ['Quick captures append to the shared team record.', 'Dynamics and alliance notes remain scoped to your notetaker seat.', 'Manual saves publish structured snapshots to the timeline.']
                },
                {
                    title: 'Follow move, phase, and timer',
                    body: 'The header shows Strategic Orientation before Move 1, then the active move, phase, countdown timer, and running or paused state. Use it to timestamp notes against the current exercise window.',
                    narrative: 'Confirm the current window before recording a turning point so later review can reconstruct cause and sequence.',
                    targetLabel: 'Live tracker',
                    highlight: liveTrackerHighlights
                },
                surfaceStep('Quick Capture', 'capture', scoped ? 'Append observations, key moments, and quotes to your private move notes.' : 'Append observations, key moments, and quotes as separate shared entries.', 'Write one observable point per capture. Distinguish a direct quote from your interpretation and leave formal decisions in the Scribe artifact.'),
                surfaceStep('Team Dynamics', 'dynamics', 'Record leadership, decision style, friction, consensus, and a concise move summary.', 'Save when the pattern changes or the move closes. Your seat-scoped notes do not overwrite another Notetaker’s perspective.'),
                surfaceStep('Alliance Tracking', 'alliance', 'Record coalition signals, external relationships, commitments, and changes in alignment.', 'Separate an expressed intention from a confirmed agreement, and identify the move in which the relationship changed.'),
                surfaceStep('Team Actions', 'actions', 'Read the team’s Strategic Orientation, actions, or proposals alongside your process notes.', 'Use the formal artifact to anchor what the team decided; use your notes to explain how and why it reached that outcome.'),
                surfaceStep('Inbox', 'inbox', 'Read White Cell updates addressed to the Notetaker seat; the badge marks unopened messages.', 'Bring relevant new context into your observation record without treating the inbox itself as a team decision.'),
                surfaceStep('Timeline', 'timeline', scoped ? 'Review authorized session events alongside your private captures for the current move. Manual saves remain in your notes.' : 'Review the chronological session record and the structured snapshots published by manual saves.', 'Use the timeline to check sequence, identify gaps, and avoid duplicating an observation already captured.'),
                {
                    title: 'Complete the observation loop',
                    body: 'Before the move closes, verify that decisive moments, dynamics, alliances, and the formal artifact tell a coherent story.',
                    narrative: 'The Notetaker explains the process; the Scribe owns the team artifact, the Facilitator owns final handoff, and White Cell owns adjudication.',
                    details: ['Prefer specific observations over judgments.', 'Preserve separate seat perspectives.', 'Start Here remains available above the session label.'],
                    targetLabel: 'Session reference',
                    highlight: '.sidebar-session'
                }
            ]
        }, this.teamContext, 'notetaker'));
    }

    configureTeamLabels() {
        const headerTitle = document.querySelector('.header-title');
        const captureDescription = document.querySelector('#captureSection .section-description');
        const dynamicsDescription = document.querySelector('#dynamicsSection .section-description');
        const allianceDescription = document.querySelector('#allianceSection .section-description');
        const scopeNotice = document.getElementById('notetakerScopeNotice');
        const captureScopeHint = document.getElementById('captureScopeHint');
        const dynamicsScopeHint = document.getElementById('dynamicsScopeHint');
        const allianceScopeHint = document.getElementById('allianceScopeHint');

        if (headerTitle) {
            headerTitle.textContent = this.teamContext.notetakerLabel;
        }

        if (captureDescription) {
            captureDescription.textContent = 'Append observations, moments, and quotes as separate shared entries.';
        }

        if (dynamicsDescription) {
            dynamicsDescription.textContent = 'Your move notes are saved per notetaker seat. Manual saves also publish a structured snapshot to the shared timeline for White Cell review.';
        }

        if (allianceDescription) {
            allianceDescription.textContent = 'Alliance notes are stored per notetaker seat. Manual saves also publish a structured snapshot to the shared timeline for White Cell review.';
        }

        if (scopeNotice) {
            scopeNotice.textContent = this.teamContext.delegationId
                ? `Existing ${this.teamLabel} Notetaker seat: move notes stay seat-scoped; captures belong to your assigned region. The other region retains its own Notetaker and notes.`
                : 'Move notes are saved per notetaker seat. Quick captures append shared entries for the whole team.';
        }

        if (captureScopeHint) {
            captureScopeHint.textContent = 'Each capture is appended with your notetaker seat and never replaces another observation.';
        }

        if (dynamicsScopeHint) {
            dynamicsScopeHint.textContent = 'These fields save to your own move notes. Use Save Dynamics to publish a structured snapshot without overwriting another notetaker.';
        }

        if (allianceScopeHint) {
            allianceScopeHint.textContent = 'Use this space for your seat-specific alliance summary. Save Alliance publishes a structured snapshot without replacing another notetaker\'s notes.';
        }
        if (this.usesScopedNotes()) {
            if (captureDescription) captureDescription.textContent = 'Append observations, moments and quotes to your private move notes.';
            for (const element of [dynamicsDescription, allianceDescription, dynamicsScopeHint, allianceScopeHint]) {
                if (element) element.textContent = 'Saved privately to your authenticated Notetaker seat and move. Manual saves do not publish to the shared timeline. If a save is not confirmed, keep your text and reload saved notes before retrying.';
            }
        }
    }

    refreshParticipantContext() {
        this.participantContext = buildNotetakerParticipantContext({
            participant_key: sessionStore.getSessionParticipantId?.(),
            participant_id: sessionStore.getSessionParticipantId?.(),
            client_id: sessionStore.getClientId(),
            participant_label: sessionStore.getSessionData()?.displayName || sessionStore.getUserName?.() || null
        }, {
            fallbackClientId: sessionStore.getClientId(),
            fallbackParticipantLabel: sessionStore.getSessionData()?.displayName || null
        });
    }

    /**
     * Bind event listeners
     */
    bindEventListeners() {
        // Capture form
        const captureForm = document.getElementById('captureForm');
        if (captureForm) {
            captureForm.addEventListener('submit', (e) => this.handleCaptureSubmit(e));
        }

        // Dynamics form inputs
        const dynamicsForm = document.getElementById('dynamicsForm');
        if (dynamicsForm) {
            dynamicsForm.addEventListener('input', () => this.handleDynamicsChange());
            dynamicsForm.addEventListener('submit', (e) => {
                void this.handleDynamicsSubmit(e);
            });
        }

        // Range sliders display
        const frictionLevel = document.getElementById('frictionLevel');
        const frictionValue = document.getElementById('frictionValue');
        if (frictionLevel && frictionValue) {
            frictionLevel.addEventListener('input', () => {
                frictionValue.textContent = frictionLevel.value;
            });
        }

        const consensusLevel = document.getElementById('consensusLevel');
        const consensusValue = document.getElementById('consensusValue');
        if (consensusLevel && consensusValue) {
            consensusLevel.addEventListener('input', () => {
                consensusValue.textContent = consensusLevel.value;
            });
        }

        // Alliance form inputs
        const allianceForm = document.getElementById('allianceForm');
        if (allianceForm) {
            allianceForm.addEventListener('input', () => this.handleAllianceChange());
            allianceForm.addEventListener('submit', (e) => {
                void this.handleAllianceSubmit(e);
            });
        }

        document.querySelectorAll?.('.sidebar-link[data-section]')?.forEach((link) => {
            link.addEventListener('click', () => {
                if (link.dataset.section === 'inbox') {
                    this.clearInboxArrivals();
                }
            });
        });
    }

    /**
     * Setup auto-save functionality
     */
    setupAutoSave() {
        this.dynamicsAutoSaveDebounce = debounce(() => {
            void this.saveDynamicsData();
        }, 2000);

        this.allianceAutoSaveDebounce = debounce(() => {
            void this.saveAllianceData();
        }, 2000);
    }

    /**
     * Subscribe to shared live stores
     */
    subscribeToLiveData() {
        this.storeUnsubscribers.push(
            gameStateStore.subscribe((_event, state) => {
                this.syncGameState(state);
            })
        );

        this.storeUnsubscribers.push(
            actionsStore.subscribe(() => {
                this.syncActionsFromStore();
            })
        );

        this.storeUnsubscribers.push(
            timelineStore.subscribe(() => {
                this.syncTimelineFromStore();
            })
        );

        this.storeUnsubscribers.push(
            communicationsStore.subscribe((event) => {
                this.syncInboxFromStore({
                    announce: event === 'created'
                });
                this.flushInboxArrivalAnnouncement();
            })
        );

        this.syncGameState(gameStateStore.getState() || sessionStore.getSessionData()?.gameState || null);
    }

    /**
     * Handle move changes by clearing pending saves and reloading move-scoped data
     */
    async handleMoveChange() {
        this.dynamicsAutoSaveDebounce?.cancel?.();
        this.allianceAutoSaveDebounce?.cancel?.();
        this.setAutoSaveStatus('dynamics', 'idle');
        this.setAutoSaveStatus('alliance', 'idle');

        await this.loadCurrentMoveData();
    }

    /**
     * Load captures from timeline
     */
    syncGameState(state) {
        const nextMove = state?.move ?? 1;
        const nextPhase = state?.phase ?? 1;
        const hasMoveChanged = nextMove !== this.currentMove;

        this.currentMove = nextMove;
        this.currentPhase = nextPhase;

        if (this.initialLoadComplete && hasMoveChanged) {
            void this.handleMoveChange();
        }
    }

    syncTimelineFromStore() {
        const relevantEvents = timelineStore.getAll()
            .filter((event) => isWhiteCellTimelineEventVisibleToNotetaker(event, this.teamContext));

        if (this.usesScopedNotes()) {
            // Scoped observations are private notes, not writes to the shared timeline.
            relevantEvents.push(...this.observationTimeline.map((entry) => ({
                ...entry, move: this.currentMove, created_at: entry.timestamp
            })));
            relevantEvents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        this.captures = relevantEvents
            .filter((event) => isObservationCaptureEvent(event))
            .slice(0, 20);

        this.renderCaptures();
        this.renderTimeline(relevantEvents);
    }

    syncInboxFromStore({
        announce = false
    } = {}) {
        const nextInboxCommunications = communicationsStore.getAll()
            .filter((communication) => isNotetakerScopedWhiteCellCommunication(communication, this.teamContext))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        this.captureInboxArrivals(nextInboxCommunications, { announce });
        this.inboxCommunications = nextInboxCommunications;

        this.renderInbox();
    }

    captureInboxArrivals(nextInboxCommunications = [], {
        announce = false
    } = {}) {
        const nextIds = new Set(
            nextInboxCommunications
                .map((communication) => communication?.id)
                .filter(Boolean)
        );

        if (!this.hasHydratedInbox) {
            this.seenInboxCommunicationIds = nextIds;
            this.newInboxCommunicationIds.clear();
            this.hasHydratedInbox = true;
            return;
        }

        nextInboxCommunications.forEach((communication) => {
            if (!communication?.id || this.seenInboxCommunicationIds.has(communication.id)) {
                return;
            }

            this.seenInboxCommunicationIds.add(communication.id);
            this.newInboxCommunicationIds.add(communication.id);
            if (announce) {
                this.pendingInboxArrivalIds.add(communication.id);
            }
        });

        this.newInboxCommunicationIds.forEach((communicationId) => {
            if (!nextIds.has(communicationId)) {
                this.newInboxCommunicationIds.delete(communicationId);
            }
        });
    }

    clearInboxArrivals() {
        if (this.newInboxCommunicationIds.size === 0) {
            return;
        }

        this.newInboxCommunicationIds.clear();
        this.renderInbox();
    }

    flushInboxArrivalAnnouncement() {
        const arrivalCount = this.pendingInboxArrivalIds.size;
        if (arrivalCount === 0) {
            return;
        }

        showToast(
            arrivalCount === 1
                ? 'A new White Cell inbox item has arrived.'
                : `${arrivalCount} new White Cell inbox items have arrived.`,
            {
                type: 'info',
                duration: 10000
            }
        );

        this.pendingInboxArrivalIds.clear();
    }

    /**
     * Render captures list
     */
    renderCaptures() {
        const container = document.getElementById('recentCaptures');
        if (!container) return;

        if (this.captures.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No captures yet. Start recording observations above.</p>';
            return;
        }

        container.innerHTML = this.captures.map(capture => {
            const typeColors = {
                'NOTE': 'default',
                'MOMENT': 'warning',
                'QUOTE': 'info'
            };
            const captureType = capture.type || capture.event_type || 'NOTE';
            const captureContent = capture.content || capture.description || '';

            return `
                <div class="card card-bordered" style="padding: var(--space-3); margin-bottom: var(--space-2);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
                        ${createBadge({ text: captureType, type: typeColors[captureType] || 'default', size: 'sm' }).outerHTML}
                        <span class="text-xs text-gray-400">Move ${capture.move || 1} • ${formatRelativeTime(capture.created_at)}</span>
                    </div>
                    <p class="text-sm">${this.escapeHtml(captureContent)}</p>
                </div>
            `;
        }).join('');
    }

    /**
     * Handle capture form submit
     * @param {Event} e - Submit event
     */
    async handleCaptureSubmit(e) {
        e.preventDefault();
        if (this.seatInvalidated || this.destroyed) return;

        const typeInput = document.querySelector('input[name="captureType"]:checked');
        const contentInput = document.getElementById('captureContent');

        const type = typeInput?.value;
        const content = contentInput?.value?.trim();

        if (!content) {
            showToast('Please enter content', { type: 'error' });
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        if (this.usesScopedNotes()) {
            const state = this.scopedNotes;
            try {
                const entry = createObservationTimelineEntry({
                    id: crypto.randomUUID(), type, content, phase: this.currentPhase
                });
                await this.writeScopedNotes({ observation: entry });
                if (!this.isCurrentNotesState(state)) return;
                this.syncTimelineFromStore();
                if (contentInput.value.trim() === content) contentInput.value = '';
                showToast('Observation saved to your private move notes', { type: 'success' });
            } catch (error) {
                if (this.seatInvalidated || this.destroyed || (state && !this.isCurrentNotesState(state))) return;
                showToast('Observation not confirmed. Keep your text and reload saved notes before retrying.', { type: 'error' });
            }
            return;
        }

        try {
            const gameState = this.getCurrentGameState();
            const captureData = {
                session_id: sessionId,
                type,
                content,
                team: this.teamId,
                metadata: {
                    actor: 'notetaker',
                    role: this.teamContext.notetakerRole
                },
                move: gameState?.move ?? 1,
                phase: gameState?.phase ?? 1
            };

            const createdEvent = await database.createTimelineEvent(captureData);
            timelineStore.updateFromServer('INSERT', createdEvent);
            const observationEntry = createObservationTimelineEntry({
                id: createdEvent?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null),
                type,
                content,
                phase: captureData.phase,
                createdAt: createdEvent?.created_at || new Date().toISOString(),
                teamId: this.teamId,
                participantKey: this.participantContext.participantKey,
                participantId: this.participantContext.participantId,
                participantLabel: this.participantContext.participantLabel,
                clientId: this.participantContext.clientId
            });

            try {
                await database.saveNotetakerData({
                    ...this.buildNotetakerPayloadBase(),
                    observation_timeline_append: [observationEntry]
                });
                this.observationTimeline = [...this.observationTimeline, observationEntry];
                showToast('Observation saved', { type: 'success' });
            } catch (appendError) {
                logger.error('Failed to append capture to move-scoped notetaker data:', appendError);
                showToast('Observation saved, but move notes did not fully sync.', { type: 'warning' });
            }

            contentInput.value = '';
        } catch (err) {
            logger.error('Failed to save capture:', err);
            showToast('Failed to save observation', { type: 'error' });
        }
    }

    /**
     * Sync actions from the live store
     */
    syncActionsFromStore() {
        this.actions = actionsStore.getByTeam(this.teamId);
        this.renderActionsView();
    }

    /**
     * Render actions (read-only)
     */
    renderActionsView() {
        const container = document.getElementById('actionsListView');
        if (!container) return;

        if (this.actions.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No actions submitted yet.</p>';
            return;
        }

        container.innerHTML = this.actions.map(action => `
            <div class="card card-bordered" style="padding: var(--space-4); margin-bottom: var(--space-3);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-2);">
                    <div>
                        <h4 class="font-semibold">${this.escapeHtml(action.goal || action.title || 'Untitled action')}</h4>
                        <p class="text-xs text-gray-500">${this.escapeHtml(action.mechanism || 'No mechanism')} • Move ${action.move || 1} • Phase ${action.phase || 1}</p>
                    </div>
                    <div style="display: flex; gap: var(--space-2);">
                        ${createArtifactLifecycleBadge(action).outerHTML}
                        ${createPriorityBadge(action.priority || 'NORMAL').outerHTML}
                    </div>
                </div>
                <p class="text-sm">${this.escapeHtml(action.expected_outcomes || action.description || 'No expected outcomes')}</p>
                ${action.ally_contingencies ? `
                    <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                        <strong>Ally Contingencies:</strong> ${this.escapeHtml(action.ally_contingencies)}
                    </p>
                ` : ''}
                <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                    <strong>Targets:</strong> ${this.escapeHtml((Array.isArray(action.targets) ? action.targets : (action.target ? [action.target] : [])).join(', ') || 'Not specified')} |
                    <strong>Sector:</strong> ${this.escapeHtml(action.sector || 'Not specified')} |
                    <strong>Exposure:</strong> ${this.escapeHtml(action.exposure_type || 'Not specified')}
                </p>
                ${action.submitted_at ? `
                    <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                        <strong>Submitted:</strong> ${this.escapeHtml(formatDateTime(action.submitted_at))}
                    </p>
                ` : ''}
                ${action.adjudication_notes ? `
                    <p class="text-xs text-gray-500" style="margin-top: var(--space-2);">
                        <strong>White Cell Notes:</strong> ${this.escapeHtml(action.adjudication_notes)}
                    </p>
                ` : ''}
            </div>
        `).join('');
    }

    /**
     * Load notetaker data for the active move
     */
    async loadCurrentMoveData() {
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        if (this.usesScopedNotes()) {
            await this.loadScopedNotes();
            return;
        }

        try {
            const record = await database.getNotetakerData(sessionId, this.currentMove);
            const viewState = buildNotetakerViewState(record, {
                teamId: this.teamId,
                participantKey: this.participantContext.participantKey
            });

            this.dynamicsData = viewState.dynamicsData;
            this.allianceData = viewState.allianceData;
            this.observationTimeline = viewState.observationTimeline;

            this.populateDynamicsForm();
            this.populateAllianceForm();
            this.setAutoSaveStatus('dynamics', 'idle');
            this.setAutoSaveStatus('alliance', 'idle');

            logger.info(`Loaded move-scoped notetaker data for move ${this.currentMove}`);
        } catch (err) {
            logger.error('Failed to load move-scoped notetaker data:', err);
        }
    }

    /**
     * Populate dynamics form with saved data
     */
    populateDynamicsForm() {
        const fields = ['emergingLeaders', 'decisionStyle', 'frictionLevel', 'frictionSources', 'consensusLevel', 'dynamicsSummary'];

        fields.forEach(field => {
            const element = document.getElementById(field);
            if (element) {
                element.value = this.dynamicsData[field] ?? DEFAULT_DYNAMICS_DATA[field];

                // Update range display
                if (field === 'frictionLevel') {
                    const display = document.getElementById('frictionValue');
                    if (display) display.textContent = element.value;
                }
                if (field === 'consensusLevel') {
                    const display = document.getElementById('consensusValue');
                    if (display) display.textContent = element.value;
                }
            }
        });
    }

    /**
     * Handle dynamics form changes
     */
    handleDynamicsChange() {
        this.dynamicsData = this.collectDynamicsFormData();
        this.setAutoSaveStatus('dynamics', 'saving');
        this.dynamicsAutoSaveDebounce?.();
    }

    /**
     * Handle manual dynamics save submit
     * @param {Event} e - Submit event
     */
    async handleDynamicsSubmit(e) {
        e.preventDefault();
        this.dynamicsAutoSaveDebounce?.cancel?.();
        this.dynamicsData = this.collectDynamicsFormData();
        this.setAutoSaveStatus('dynamics', 'saving');
        await this.saveDynamicsData({
            showSuccessToast: true,
            showErrorToast: true,
            emitTimelineEvent: true
        });
    }

    /**
     * Save dynamics data to database
     */
    async saveDynamicsData({
        showSuccessToast = false,
        showErrorToast = false,
        emitTimelineEvent = false
    } = {}) {
        if (this.seatInvalidated || this.destroyed) return;
        if (this.usesScopedNotes()) {
            return this.saveScopedSection('dynamics', { ...this.dynamicsData }, { showSuccessToast, showErrorToast });
        }
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        try {
            const payloadBase = this.buildNotetakerPayloadBase();
            await database.saveNotetakerData({
                ...payloadBase,
                dynamics_analysis: this.dynamicsData
            });
            const timelineUpdated = emitTimelineEvent
                ? await this.createSharedNotesTimelineEvent('dynamics', payloadBase)
                : true;
            this.setAutoSaveStatus('dynamics', 'saved');
            if (showSuccessToast) {
                showToast(
                    timelineUpdated
                        ? 'Team dynamics saved'
                        : 'Team dynamics saved, but the shared timeline did not update.',
                    { type: timelineUpdated ? 'success' : 'warning' }
                );
            }
            logger.debug('Dynamics data saved');
        } catch (err) {
            logger.error('Failed to save dynamics data:', err);
            this.setAutoSaveStatus('dynamics', 'error');
            if (showErrorToast) {
                showToast('Failed to save team dynamics', { type: 'error' });
            }
        }
    }

    /**
     * Populate alliance form with saved data
     */
    populateAllianceForm() {
        const allianceNotes = document.getElementById('allianceNotes');
        const externalPressures = document.getElementById('externalPressures');

        if (allianceNotes) {
            allianceNotes.value = this.allianceData.allianceNotes ?? DEFAULT_ALLIANCE_DATA.allianceNotes;
        }
        if (externalPressures) {
            externalPressures.value = this.allianceData.externalPressures ?? DEFAULT_ALLIANCE_DATA.externalPressures;
        }
    }

    /**
     * Handle alliance form changes
     */
    handleAllianceChange() {
        this.allianceData = this.collectAllianceFormData();
        this.setAutoSaveStatus('alliance', 'saving');
        this.allianceAutoSaveDebounce?.();
    }

    /**
     * Handle manual alliance save submit
     * @param {Event} e - Submit event
     */
    async handleAllianceSubmit(e) {
        e.preventDefault();
        this.allianceAutoSaveDebounce?.cancel?.();
        this.allianceData = this.collectAllianceFormData();
        this.setAutoSaveStatus('alliance', 'saving');
        await this.saveAllianceData({
            showSuccessToast: true,
            showErrorToast: true,
            emitTimelineEvent: true
        });
    }

    /**
     * Save alliance data to database
     */
    async saveAllianceData({
        showSuccessToast = false,
        showErrorToast = false,
        emitTimelineEvent = false
    } = {}) {
        if (this.seatInvalidated || this.destroyed) return;
        if (this.usesScopedNotes()) {
            return this.saveScopedSection('alliance', { ...this.allianceData }, { showSuccessToast, showErrorToast });
        }
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        try {
            const payloadBase = this.buildNotetakerPayloadBase();
            await database.saveNotetakerData({
                ...payloadBase,
                external_factors: this.allianceData
            });
            const timelineUpdated = emitTimelineEvent
                ? await this.createSharedNotesTimelineEvent('alliance', payloadBase)
                : true;
            this.setAutoSaveStatus('alliance', 'saved');
            if (showSuccessToast) {
                showToast(
                    timelineUpdated
                        ? 'Alliance tracking saved'
                        : 'Alliance tracking saved, but the shared timeline did not update.',
                    { type: timelineUpdated ? 'success' : 'warning' }
                );
            }
            logger.debug('Alliance data saved');
        } catch (err) {
            logger.error('Failed to save alliance data:', err);
            this.setAutoSaveStatus('alliance', 'error');
            if (showErrorToast) {
                showToast('Failed to save alliance tracking', { type: 'error' });
            }
        }
    }

    usesScopedNotes() {
        return Boolean(this.scopedNotes || this.teamContext.delegationId
            || sessionStore.getConfirmedSeat?.()?.topology === 2);
    }

    isCurrentNotesState(state) {
        const seat = sessionStore.getConfirmedSeat?.();
        return Boolean(state && state === this.scopedNotes && !this.seatInvalidated && !this.destroyed
            && state.move === this.currentMove && seat?.topology === 2
            && seatStorageKey('', seat) === seatStorageKey('', state.seat)
            && sessionStore.getSessionId() === state.seat.sessionId);
    }

    async loadScopedNotes() {
        const seat = sessionStore.getConfirmedSeat?.();
        const state = { seat, move: this.currentMove, ready: false, queue: Promise.resolve(), record: null };
        this.scopedNotes = state;
        this.dynamicsData = { ...DEFAULT_DYNAMICS_DATA };
        this.allianceData = { ...DEFAULT_ALLIANCE_DATA };
        this.observationTimeline = [];
        this.populateDynamicsForm();
        this.populateAllianceForm();
        this.syncTimelineFromStore();
        const controls = [...(document.querySelectorAll?.('#dynamicsForm input, #dynamicsForm textarea, #dynamicsForm select, #dynamicsForm button, #allianceForm input, #allianceForm textarea, #allianceForm button, #captureForm input, #captureForm textarea, #captureForm button') || [])];
        controls.forEach((control) => { control.disabled = true; });
        try {
            if (!this.isCurrentNotesState(state) || seat.surface !== ROLE_SURFACES.NOTETAKER) {
                throw new Error('A confirmed Notetaker seat is required.');
            }
            const records = await database.fetchScopedNotetakerData(seat.sessionId, state.move);
            if (!this.isCurrentNotesState(state)) return;
            // RLS is the authority; reject unexpected envelopes instead of displaying them.
            if (records.length > 1 || records.some((row) => row.session_id !== seat.sessionId
                || row.session_participant_id !== seat.participantId || row.move !== state.move
                || row.team !== seat.teamId || (row.delegation_id ?? null) !== seat.delegationId)) {
                throw new Error('Saved notes do not match the confirmed seat.');
            }
            state.record = records[0] || { revision: 0, dynamics_analysis: {}, external_factors: {}, observation_timeline: [] };
            if (!Number.isSafeInteger(state.record.revision) || state.record.revision < 0
                || !Array.isArray(state.record.observation_timeline)) throw new Error('Invalid saved notes revision.');
            state.ready = true;
            this.dynamicsData = { ...DEFAULT_DYNAMICS_DATA, ...state.record.dynamics_analysis };
            this.allianceData = { ...DEFAULT_ALLIANCE_DATA, ...state.record.external_factors };
            this.observationTimeline = [...state.record.observation_timeline];
            this.populateDynamicsForm();
            this.populateAllianceForm();
            this.syncTimelineFromStore();
            this.setAutoSaveStatus('dynamics', 'idle');
            this.setAutoSaveStatus('alliance', 'idle');
            controls.forEach((control) => { control.disabled = false; });
        } catch (error) {
            state.ready = false;
            if (!this.isCurrentNotesState(state)) return;
            this.setAutoSaveStatus('dynamics', 'reload');
            this.setAutoSaveStatus('alliance', 'reload');
            showToast('Notes could not be loaded. Reload before editing; contact the operator if access is denied.', { type: 'error' });
        }
    }

    writeScopedNotes(change) {
        const state = this.scopedNotes;
        const phase = this.currentPhase;
        if (!this.isCurrentNotesState(state) || !state.ready) {
            return Promise.reject(new Error('Reload saved notes before retrying.'));
        }
        const pending = state.queue.then(async () => {
            if (!this.isCurrentNotesState(state) || !state.ready) throw new Error('Notes context changed.');
            const previous = state.record;
            const payload = {
                session_id: state.seat.sessionId, move: state.move, phase,
                expected_revision: previous.revision,
                dynamics_analysis: change.dynamics ?? previous.dynamics_analysis,
                external_factors: change.alliance ?? previous.external_factors,
                observation_timeline: change.observation
                    ? [...previous.observation_timeline, change.observation] : previous.observation_timeline
            };
            try {
                const saved = await database.saveScopedNotetakerData(payload);
                if (!this.isCurrentNotesState(state)) return;
                if (!saved || saved.session_id !== state.seat.sessionId
                    || saved.session_participant_id !== state.seat.participantId || saved.move !== state.move
                    || saved.team !== state.seat.teamId || (saved.delegation_id ?? null) !== state.seat.delegationId
                    || Number(saved.revision) !== Number(previous.revision) + 1) {
                    throw new Error('Save acknowledgement does not match the notes revision.');
                }
                state.record = saved;
                this.observationTimeline = [...saved.observation_timeline];
            } catch (error) {
                // Unknown commit, denial or stale revision: never blindly replay a full-row replacement.
                state.ready = false;
                throw error;
            }
        });
        state.queue = pending.catch(() => {});
        return pending;
    }

    async saveScopedSection(section, data, { showSuccessToast, showErrorToast }) {
        const state = this.scopedNotes;
        try {
            await this.writeScopedNotes({ [section]: data });
            if (!this.isCurrentNotesState(state)) return;
            this.setAutoSaveStatus(section, 'saved');
            if (showSuccessToast) showToast('Saved to your private move notes', { type: 'success' });
        } catch (error) {
            if (this.seatInvalidated || this.destroyed || (state && !this.isCurrentNotesState(state))) return;
            this.setAutoSaveStatus(section, 'reload');
            if (showErrorToast) showToast('Save not confirmed. Keep your text and reload saved notes before retrying.', { type: 'error' });
        }
    }

    /**
     * Collect current dynamics form values
     * @returns {Object} Normalized dynamics payload
     */
    collectDynamicsFormData() {
        return {
            emergingLeaders: document.getElementById('emergingLeaders')?.value || '',
            decisionStyle: document.getElementById('decisionStyle')?.value || '',
            frictionLevel: document.getElementById('frictionLevel')?.value || DEFAULT_DYNAMICS_DATA.frictionLevel,
            frictionSources: document.getElementById('frictionSources')?.value || '',
            consensusLevel: document.getElementById('consensusLevel')?.value || DEFAULT_DYNAMICS_DATA.consensusLevel,
            dynamicsSummary: document.getElementById('dynamicsSummary')?.value || ''
        };
    }

    /**
     * Collect current alliance form values
     * @returns {Object} Normalized alliance payload
     */
    collectAllianceFormData() {
        return {
            allianceNotes: document.getElementById('allianceNotes')?.value || '',
            externalPressures: document.getElementById('externalPressures')?.value || ''
        };
    }

    /**
     * Resolve current shared game state
     * @returns {Object} Current game state
     */
    getCurrentGameState() {
        return gameStateStore.getState() || sessionStore.getSessionData()?.gameState || {
            move: this.currentMove,
            phase: this.currentPhase
        };
    }

    /**
     * Build base payload for move-scoped notetaker writes
     * @returns {Object} Shared notetaker payload fields
     */
    buildNotetakerPayloadBase() {
        const sessionId = sessionStore.getSessionId();
        const gameState = this.getCurrentGameState();
        this.refreshParticipantContext();

        return {
            session_id: sessionId,
            move: gameState?.move ?? this.currentMove ?? 1,
            phase: gameState?.phase ?? this.currentPhase ?? 1,
            team: this.teamId,
            client_id: this.participantContext.clientId,
            participant_key: this.participantContext.participantKey,
            session_participant_id: this.participantContext.participantId,
            participant_id: this.participantContext.participantId,
            participant_label: this.participantContext.participantLabel
        };
    }

    async createSharedNotesTimelineEvent(noteScope, payloadBase = this.buildNotetakerPayloadBase()) {
        try {
            const noteData = noteScope === 'dynamics'
                ? this.dynamicsData
                : this.allianceData;
            const createdEvent = await database.createTimelineEvent(
                buildNotetakerSaveTimelineEvent(noteScope, {
                    sessionId: payloadBase.session_id,
                    teamId: payloadBase.team,
                    teamLabel: this.teamLabel,
                    participantKey: payloadBase.participant_key,
                    participantId: payloadBase.participant_id,
                    participantLabel: payloadBase.participant_label,
                    clientId: payloadBase.client_id,
                    move: payloadBase.move,
                    phase: payloadBase.phase
                }, noteData)
            );

            timelineStore.updateFromServer('INSERT', createdEvent);
            return true;
        } catch (err) {
            logger.error(`Failed to create ${noteScope} timeline event:`, err);
            return false;
        }
    }

    /**
     * Update autosave indicator for a specific section
     * @param {'dynamics'|'alliance'} section - Form section
     * @param {'idle'|'saving'|'saved'|'error'} status - Save status
     */
    setAutoSaveStatus(section, status) {
        const indicatorId = AUTO_SAVE_ELEMENT_IDS[section];
        const indicator = indicatorId ? document.getElementById(indicatorId) : null;
        if (!indicator) return;

        indicator.textContent = AUTO_SAVE_TEXT[status] || AUTO_SAVE_TEXT.idle;
        indicator.dataset.status = status;
    }

    /**
     * Render timeline
     * @param {Array} events - Timeline events
     */
    renderTimeline(events) {
        const container = document.getElementById('timelineList');
        if (!container) return;

        if (events.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No events yet.</p>';
            return;
        }

        const { visibleEvents, hiddenCount } = getVisibleNotetakerTimelineEvents(events);

        // Group by move
        const groupedEvents = visibleEvents.reduce((acc, event) => {
            const move = event.move || 1;
            if (!acc[move]) acc[move] = [];
            acc[move].push(event);
            return acc;
        }, {});

        const overflowNote = hiddenCount
            ? `<p class="text-xs text-gray-500" style="margin: 0 0 var(--space-3);">Showing the first ${NOTETAKER_TIMELINE_RENDER_LIMIT} of ${events.length} timeline events.</p>`
            : '';

        container.innerHTML = `
            ${overflowNote}
            ${Object.entries(groupedEvents)
            .sort(([a], [b]) => b - a)
            .map(([move, moveEvents]) => `
                <div class="timeline-group" style="margin-bottom: var(--space-6);">
                    <h4 class="text-sm font-semibold text-gray-500 mb-3">Move ${move}</h4>
                    <div class="timeline-events">
                        ${moveEvents.map(event => {
                            const eventType = event.type || event.event_type || 'EVENT';
                            const eventContent = event.content || event.description || '';
                            const eventActor = event.actor || event.metadata?.actor || '';
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
                            <div class="timeline-event" style="display: flex; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--color-gray-200);">
                                <div class="timeline-marker" style="width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary-500); margin-top: 6px; flex-shrink: 0;"></div>
                                <div class="timeline-content" style="flex: 1;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        ${createBadge({ text: eventType, size: 'sm' }).outerHTML}
                                        <span class="text-xs text-gray-400">${formatDateTime(event.created_at)}</span>
                                    </div>
                                    <p class="text-sm mt-1">${this.escapeHtml(eventContent)}</p>
                                    ${noteDetailsMarkup}
                                    ${eventActor ? `<p class="text-xs text-gray-400 mt-1">By: ${this.escapeHtml(eventActor)}</p>` : ''}
                                </div>
                            </div>
                        `;
                        }).join('')}
                    </div>
                </div>
            `).join('')}
        `;
    }

    renderInbox() {
        const container = document.getElementById('inboxList');
        const inboxBadge = document.getElementById('inboxBadge');
        if (inboxBadge) {
            inboxBadge.textContent = String(this.inboxCommunications.length);
            inboxBadge.hidden = this.inboxCommunications.length === 0;
        }
        if (!container) return;

        if (this.inboxCommunications.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No White Cell communications received yet.</p>';
            return;
        }

        const updateLabelForCommunication = (communication) => {
            const updateKind = getWhiteCellCommunicationUpdateKind(communication);
            if (updateKind === WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL) {
                return 'Tribe Street Journal Update';
            }
            if (updateKind === WHITE_CELL_UPDATE_KINDS.VERBA_AI_POPULATION_SENTIMENT) {
                return 'Verba AI Population Sentiment';
            }
            return communication.type || 'White Cell Communication';
        };

        const { visibleCommunications, hiddenCount } = getVisibleNotetakerInboxCommunications(this.inboxCommunications);

        container.innerHTML = `
            ${hiddenCount ? `<p class="text-xs text-gray-500" style="margin: 0 0 var(--space-3);">Showing the first ${NOTETAKER_INBOX_RENDER_LIMIT} of ${this.inboxCommunications.length} White Cell communications.</p>` : ''}
            ${visibleCommunications.map((communication) => `
            <div class="card card-bordered" style="padding: var(--space-3); margin-bottom: var(--space-3); ${this.newInboxCommunicationIds.has(communication.id) ? 'border-left: 4px solid var(--color-primary-500); background: var(--color-surface-alt);' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-2);">
                    <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
                        ${this.newInboxCommunicationIds.has(communication.id)
        ? createBadge({ text: 'NEW', variant: 'warning', size: 'sm', rounded: true }).outerHTML
        : ''}
                        ${createBadge({ text: updateLabelForCommunication(communication), size: 'sm', rounded: true }).outerHTML}
                        <span class="text-xs text-gray-500">White Cell</span>
                    </div>
                    <span class="text-xs text-gray-400">${formatDateTime(communication.created_at)}</span>
                </div>
                <p class="text-sm">${this.escapeHtml(communication.content || '')}</p>
            </div>
        `).join('')}
        `;
    }

    /**
     * Escape HTML
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeHtml(str) {
        if (typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.usesScopedNotes()) {
            this.destroyed = true;
            this.dynamicsAutoSaveDebounce?.cancel?.();
            this.allianceAutoSaveDebounce?.cancel?.();
        } else {
            this.dynamicsAutoSaveDebounce?.flush?.();
            this.allianceAutoSaveDebounce?.flush?.();
        }
        this.storeUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
        this.storeUnsubscribers = [];
    }
}

const notetakerController = new NotetakerController();

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => notetakerController.init());
    } else {
        notetakerController.init();
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => notetakerController.destroy());
}

export default notetakerController;
