import { database } from '../services/database.js';
import { sessionStore } from '../stores/session.js';
import { gameStateStore } from '../stores/gameState.js';
import { actionsStore } from '../stores/actions.js';
import { requestsStore } from '../stores/requests.js';
import { timelineStore } from '../stores/timeline.js';
import { participantsStore } from '../stores/participants.js';
import { syncService } from '../services/sync.js';
import { getRuntimeConfigStatus } from '../services/supabase.js';
import { createLogger } from '../utils/logger.js';
import { mountFollowAlong } from '../features/onboarding/followAlong.js';
import { showToast } from '../components/ui/Toast.js';
import { showLoader, hideLoader, showInlineLoader } from '../components/ui/Loader.js';
import { showModal, confirmModal, closeModal } from '../components/ui/Modal.js';
import { createBadge } from '../components/ui/Badge.js';
import { formatRelativeTime } from '../utils/formatting.js';
import { validateSessionCode } from '../utils/validation.js';
import {
    buildJsonExportPayload,
    downloadJsonData,
    downloadCsv,
    buildResearchExportBundle,
    buildCrossSessionResearchExportBundle,
    downloadResearchExportArchive,
    exportSessionActionsCsv,
    exportSessionRequestsCsv,
    exportSessionTimelineCsv,
    exportSessionParticipantsCsv,
    openResearchPrintWindow
} from '../features/export/index.js';
import { navigateToApp } from '../core/navigation.js';
import { OPERATOR_SURFACES } from '../core/teamContext.js';
import { getPhaseLabel } from '../core/enums.js';
import { getUserMessage } from '../core/errors.js';

const logger = createLogger('GameMaster');

function getTimestamp(value) {
    return value ? new Date(value).getTime() : 0;
}

function sanitizeFilenamePart(value = 'session') {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'session';
}

function buildFallbackBundle(session) {
    return {
        session,
        gameState: null,
        participants: [],
        actions: [],
        requests: [],
        timeline: []
    };
}

function isConnectedParticipant(participant = {}) {
    if (typeof participant?.is_active === 'boolean') {
        return participant.is_active;
    }

    return true;
}

function getConnectedParticipants(participants = []) {
    return participants.filter((participant) => isConnectedParticipant(participant));
}

function buildParticipantSummary(participants = []) {
    const total = participants.length;
    const connected = getConnectedParticipants(participants).length;

    return {
        total,
        connected
    };
}

export function getCreateSessionFormHtml() {
    return `
            <form id="createSessionForm">
                <div class="form-group">
                    <label class="form-label" for="newSessionName">Session Name *</label>
                    <input type="text" id="newSessionName" class="form-input" placeholder="e.g., Training Exercise Alpha" required>
                </div>
                <div class="form-group">
                    <label class="form-label" for="newSessionCode">Session Code *</label>
                    <input type="text" id="newSessionCode" class="form-input" placeholder="e.g., ALPHA2024" maxlength="20" required>
                    <p class="form-hint">Alphanumeric, 4-20 characters. Participants use this to join.</p>
                </div>
                <div class="form-group">
                    <label class="form-label" for="newSessionDescription">Description</label>
                    <textarea id="newSessionDescription" class="form-input form-textarea" rows="3" placeholder="Optional description..."></textarea>
                </div>
            </form>
        `;
}

function formatParticipantSummaryLabel(participants = []) {
    const { total, connected } = buildParticipantSummary(participants);

    if (total === 0) {
        return 'No participants have joined this session.';
    }

    if (connected === total) {
        return `${connected} connected participant${connected === 1 ? '' : 's'}`;
    }

    return `${connected} connected / ${total} total participants`;
}

function preferLiveCollection(liveItems = [], fallbackItems = []) {
    if (Array.isArray(liveItems) && liveItems.length > 0) {
        return liveItems;
    }

    if (Array.isArray(fallbackItems) && fallbackItems.length > 0) {
        return fallbackItems;
    }

    return Array.isArray(liveItems)
        ? liveItems
        : (Array.isArray(fallbackItems) ? fallbackItems : []);
}

export function getGameMasterAccessState(sessionStoreRef = sessionStore) {
    const role = sessionStoreRef.getRole?.() || sessionStoreRef.getSessionData?.()?.role || null;
    const cachedOperatorAccess = role === 'white' && sessionStoreRef.hasOperatorAccess?.(
        OPERATOR_SURFACES.GAME_MASTER,
        { role: 'white' }
    );

    return {
        allowed: role === 'white',
        role,
        cachedOperatorAccess
    };
}

export function getGameMasterSessionCode(session = {}) {
    const code = session?.session_code || session?.sessionCode || session?.code || session?.metadata?.session_code || '';
    return String(code || '').trim() || 'N/A';
}

export function getGameMasterSessionLabel(session = null) {
    if (!session) {
        return '';
    }

    const name = String(session.name || 'Selected session').trim() || 'Selected session';
    const code = getGameMasterSessionCode(session);
    return code && code !== 'N/A' ? `${name} (${code})` : name;
}

export function getParticipantSessionLabel(participant = {}, session = null) {
    const participantSession = participant.sessionName || participant.session_name || null;
    const participantCode = participant.sessionCode || participant.session_code || participant.code || null;

    if (participantSession) {
        return participantCode ? `${participantSession} (${participantCode})` : participantSession;
    }

    return getGameMasterSessionLabel(session) || 'Selected session';
}

export function getGameMasterDeleteSessionConfirmationOptions(session = {}) {
    const label = session?.name || 'this session';

    return {
        title: 'Delete Session',
        message: `Delete "${label}"? All actions, RFIs, participant seats, timeline events, and exports tied to this session will be removed. This cannot be undone.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Keep Session',
        variant: 'danger'
    };
}

export function buildDashboardModel(sessionBundles = []) {
    return {
        activeSessions: sessionBundles.length,
        totalParticipants: sessionBundles.reduce(
            (sum, bundle) => sum + buildParticipantSummary(bundle.participants || []).connected,
            0
        ),
        totalActions: sessionBundles.reduce((sum, bundle) => sum + (bundle.actions?.length || 0), 0),
        pendingRequests: sessionBundles.reduce(
            (sum, bundle) => sum + (bundle.requests?.filter((request) => request.status === 'pending').length || 0),
            0
        )
    };
}

export function buildRecentActivityModel(sessionBundles = [], limit = 8) {
    return sessionBundles
        .flatMap((bundle) => (bundle.timeline || []).map((event) => ({
            ...event,
            sessionId: bundle.session?.id || null,
            sessionName: bundle.session?.name || 'Unknown Session'
        })))
        .sort((left, right) => getTimestamp(right.created_at) - getTimestamp(left.created_at))
        .slice(0, limit);
}

export function buildConnectedParticipantsModel(sessionBundles = [], limit = 10) {
    return sessionBundles
        .flatMap((bundle) => getConnectedParticipants(bundle.participants || []).map((participant) => ({
            ...participant,
            sessionId: bundle.session?.id || null,
            sessionName: bundle.session?.name || 'Unknown Session',
            sessionCode: getGameMasterSessionCode(bundle.session)
        })))
        .sort((left, right) => {
            return getTimestamp(right.heartbeat_at || right.joined_at) - getTimestamp(left.heartbeat_at || left.joined_at);
        })
        .slice(0, limit);
}

export function getAdminExportButtonConfig() {
    return [
        { id: 'exportJsonBtn', action: 'json', successLabel: 'JSON', availability: 'legacy' },
        { id: 'exportActionsCsvBtn', action: 'csv-actions', successLabel: 'Actions CSV', availability: 'legacy' },
        { id: 'exportRequestsCsvBtn', action: 'csv-requests', successLabel: 'RFIs CSV', availability: 'legacy' },
        { id: 'exportTimelineCsvBtn', action: 'csv-timeline', successLabel: 'Timeline CSV', availability: 'legacy' },
        { id: 'exportParticipantsCsvBtn', action: 'csv-participants', successLabel: 'Participants CSV', availability: 'legacy' },
        { id: 'exportResearchArchiveBtn', action: 'research-archive', successLabel: 'Research archive', availability: 'research' },
        { id: 'printResearchReportBtn', action: 'research-print', successLabel: 'Research report', availability: 'research' },
        { id: 'exportCrossSessionResearchArchiveBtn', action: 'research-cross-session', successLabel: 'Cross-session research archive', availability: 'research-aggregate' }
    ];
}

export function buildExportSelectionState(sessionBundle = null, {
    captureMode = 'research'
} = {}) {
    if (!sessionBundle?.session) {
        return {
            disabled: true,
            researchDisabled: true,
            captureMode,
            message: 'Select a session before exporting JSON, CSV, or research archive data.'
        };
    }

    if (String(captureMode || '').trim().toLowerCase() === 'standard') {
        return {
            disabled: false,
            researchDisabled: true,
            captureMode: 'standard',
            message: `JSON and CSV exports are ready for ${sessionBundle.session.name}. Research archive controls stay locked until research capture mode is enabled.`
        };
    }

    return {
        disabled: false,
        researchDisabled: false,
        captureMode: 'research',
        message: `JSON, CSV, and research exports are ready for ${sessionBundle.session.name}.`
    };
}

export class GameMasterController {
    constructor() {
        this.sessions = [];
        this.currentSessionId = null;
        this.sessionBundles = new Map();
        this.storeUnsubscribers = [];
        this.researchCaptureMode = 'research';
        this.researchBuildHash = null;
    }

    async init() {
        logger.info('Initializing Game Master interface');
        const accessState = getGameMasterAccessState(sessionStore);
        if (!accessState.allowed) {
            logger.warn('Blocked direct Game Master access without operator auth');
            showToast('Game Master access requires operator authorization from the landing page.', { type: 'error' });
            navigateToApp('index.html#operatorAccessSection', { replace: true });
            return;
        }

        try {
            const grant = await database.requireOperatorGrant(OPERATOR_SURFACES.GAME_MASTER, {
                role: 'white'
            });
            sessionStore.setOperatorAuth(grant);
        } catch (error) {
            logger.warn('Blocked Game Master access after failed server verification', error);
            sessionStore.clearOperatorAuth();
            showToast('Game Master access requires a valid server-side operator grant.', { type: 'error' });
            navigateToApp('index.html#operatorAccessSection', { replace: true });
            return;
        }

        if (!getRuntimeConfigStatus().ready) {
            logger.error('Game Master page blocked: backend configuration is missing');
            return;
        }
        this.bindEventListeners();
        this.subscribeToLiveStores();
        await this.loadResearchExportRuntime();
        await this.loadSessions();
        this.mountFollowAlongOnboarding();
        logger.info('Game Master interface initialized');
    }

    mountFollowAlongOnboarding() {
        const navTarget = (section) => `.sidebar-link[data-section="${section}"]`;
        this.onboarding = mountFollowAlong({
            storageKey: 'followalong:gamemaster',
            title: 'Game Master guide',
            steps: [
                {
                    title: 'Game Master operator',
                    body: 'Use this console to create live sessions, verify connected seats, and export the session record.'
                },
                {
                    title: 'Check session state',
                    body: 'The header mirrors the selected session move and phase. Use the dashboard and White Cell console for timer-driven run control.',
                    highlight: '#headerMove'
                },
                {
                    title: 'Session overview',
                    body: 'The dashboard gives a quick read on active sessions, participant counts, pending RFIs, and recent activity.',
                    highlight: navTarget('dashboard')
                },
                {
                    title: 'Manage sessions',
                    body: 'Create the session, set the join code, and keep the session list available for operator handoff.',
                    highlight: navTarget('sessions')
                },
                {
                    title: 'Track participants',
                    body: 'Confirm each player has the expected team and role before the exercise starts and during reconnects.',
                    highlight: navTarget('participants')
                },
                {
                    title: 'Export and revisit',
                    body: 'Export JSON, CSV, or research archives when the run is complete. This guide stays here if you need it again.',
                    highlight: navTarget('export')
                }
            ]
        });
    }

    bindEventListeners() {
        const createSessionBtn = document.getElementById('createSessionBtn');
        if (createSessionBtn) {
            createSessionBtn.addEventListener('click', () => this.showCreateSessionModal());
        }

        const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
        if (refreshDashboardBtn) {
            refreshDashboardBtn.addEventListener('click', () => this.loadSessions());
        }

        const participantsSessionSelect = document.getElementById('participantsSessionSelect');
        if (participantsSessionSelect) {
            participantsSessionSelect.addEventListener('change', (event) => {
                void this.handleSessionSelectionChange(event.target.value);
            });
        }

        const exportSessionSelect = document.getElementById('exportSessionSelect');
        if (exportSessionSelect) {
            exportSessionSelect.addEventListener('change', (event) => {
                void this.handleSessionSelectionChange(event.target.value);
            });
        }

        getAdminExportButtonConfig().forEach(({ id, action }) => {
            const button = document.getElementById(id);
            if (!button) return;

            button.addEventListener('click', () => {
                void this.exportData(action);
            });
        });
    }

    async loadSessions() {
        const sessionsList = document.getElementById('sessionsList');
        const loader = sessionsList
            ? showInlineLoader(sessionsList, { message: 'Loading sessions...', replace: false })
            : null;

        try {
            await this.loadResearchExportRuntime();
            this.sessions = await database.getActiveSessions() || [];

            if (loader) loader.hide();

            if (this.currentSessionId && !this.sessions.some((session) => session.id === this.currentSessionId)) {
                this.currentSessionId = null;
                const sessionDetailSection = document.getElementById('sessionDetailSection');
                const sessionsSection = document.getElementById('sessionsSection');
                if (sessionDetailSection) sessionDetailSection.style.display = 'none';
                if (sessionsSection) sessionsSection.style.display = 'block';
            }

            this.renderSessionsList();
            this.renderSessionSelectors();
            await this.loadDashboardData();
            await this.refreshSelectedSessionViews();
            logger.info(`Loaded ${this.sessions.length} sessions`);
        } catch (err) {
            logger.error('Failed to load sessions:', err);
            showToast(getUserMessage(err, {
                fallback: 'Failed to load sessions. Refresh and try again.'
            }), { type: 'error' });
            if (loader) loader.hide();
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
    }

    async loadDashboardData() {
        if (this.sessions.length === 0) {
            this.sessionBundles = new Map();
            this.renderDashboardStats(buildDashboardModel([]));
            this.renderRecentActivity([]);
            this.renderActiveParticipants([]);
            return;
        }

        const bundles = await Promise.all(this.sessions.map(async (session) => {
            try {
                return await database.fetchSessionBundle(session.id);
            } catch (error) {
                logger.error('Failed to load session bundle for dashboard:', session.id, error);
                return buildFallbackBundle(session);
            }
        }));

        this.sessionBundles = new Map(bundles.map((bundle) => [bundle.session.id, bundle]));
        this.renderDashboardStats(buildDashboardModel(bundles));
        this.renderRecentActivity(buildRecentActivityModel(bundles));
        this.renderActiveParticipants(buildConnectedParticipantsModel(bundles));
    }

    async handleSessionSelectionChange(sessionId) {
        this.currentSessionId = sessionId || null;
        await this.refreshSelectedSessionViews();
        this.renderSessionsList();
    }

    async ensureSessionBundle(sessionId) {
        if (!sessionId) {
            return null;
        }

        const existingBundle = this.sessionBundles.get(sessionId);
        if (existingBundle) {
            return existingBundle;
        }

        const bundle = await database.fetchSessionBundle(sessionId);
        this.sessionBundles.set(sessionId, bundle);
        return bundle;
    }

    async refreshSelectedSessionViews() {
        this.renderSessionSelectors();

        if (!this.currentSessionId) {
            await syncService.reset();
            this.updateHeaderSessionState(null, null);
            this.renderParticipantsPanel(null);
            this.updateExportAvailability(null);
            return;
        }

        try {
            const bundle = await this.ensureSessionBundle(this.currentSessionId);
            this.applySelectedLiveBundle(bundle);
            await syncService.initialize(this.currentSessionId);
            this.applySelectedLiveBundle(bundle);
        } catch (error) {
            logger.error('Failed to refresh selected session views:', error);
            showToast(getUserMessage(error, {
                fallback: 'Failed to refresh selected session views. Refresh and try again.'
            }), { type: 'error' });
        }
    }

    subscribeToLiveStores() {
        const rerender = () => {
            this.applySelectedLiveBundle();
        };

        this.storeUnsubscribers.push(gameStateStore.subscribe(rerender));
        this.storeUnsubscribers.push(actionsStore.subscribe(rerender));
        this.storeUnsubscribers.push(requestsStore.subscribe(rerender));
        this.storeUnsubscribers.push(timelineStore.subscribe(rerender));
        this.storeUnsubscribers.push(participantsStore.subscribe(rerender));
    }

    buildSelectedLiveBundle(baseBundle = null) {
        if (!this.currentSessionId) {
            return null;
        }

        const cachedBundle = this.sessionBundles.get(this.currentSessionId) || null;
        const fallbackBundle = baseBundle || cachedBundle || null;
        const session = baseBundle?.session
            || cachedBundle?.session
            || this.sessions.find((entry) => entry.id === this.currentSessionId)
            || null;

        if (!session) {
            return null;
        }

        return {
            session,
            gameState: gameStateStore.getState() || fallbackBundle?.gameState || null,
            participants: preferLiveCollection(participantsStore.getAll(), fallbackBundle?.participants),
            actions: preferLiveCollection(actionsStore.getAll(), fallbackBundle?.actions),
            requests: preferLiveCollection(requestsStore.getAll(), fallbackBundle?.requests),
            timeline: preferLiveCollection(timelineStore.getAll(), fallbackBundle?.timeline)
        };
    }

    applySelectedLiveBundle(baseBundle = null) {
        if (!this.currentSessionId) {
            return;
        }

        const liveBundle = this.buildSelectedLiveBundle(baseBundle);
        if (!liveBundle) {
            return;
        }

        this.sessionBundles.set(this.currentSessionId, liveBundle);
        const bundles = [...this.sessionBundles.values()];
        this.renderDashboardStats(buildDashboardModel(bundles));
        this.renderRecentActivity(buildRecentActivityModel(bundles));
        this.renderActiveParticipants(buildConnectedParticipantsModel(bundles));
        this.updateHeaderSessionState(liveBundle.session, liveBundle.gameState);
        this.renderParticipantsPanel(liveBundle);
        this.updateExportAvailability(liveBundle);

        const sessionDetailSection = document.getElementById('sessionDetailSection');
        if (sessionDetailSection?.style.display !== 'none') {
            this.renderSessionDetails(
                liveBundle.session,
                liveBundle.participants,
                liveBundle.gameState,
                liveBundle.actions,
                liveBundle.requests
            );
        }
    }

    updateHeaderSessionState(session, gameState) {
        const sessionName = document.getElementById('sessionName');
        const headerMove = document.getElementById('headerMove');
        const headerPhase = document.getElementById('headerPhase');

        if (sessionName) {
            sessionName.textContent = session ? session.name : 'No Session Selected';
        }

        if (headerMove) {
            headerMove.textContent = gameState?.move ?? '-';
        }

        if (headerPhase) {
            headerPhase.textContent = gameState?.phase ? getPhaseLabel(gameState.phase) : '-';
        }
    }

    renderSessionSelectors() {
        ['participantsSessionSelect', 'exportSessionSelect'].forEach((selectId) => {
            const select = document.getElementById(selectId);
            if (!select) return;

            const previousValue = this.currentSessionId || '';
            select.innerHTML = `
                <option value="">Select session</option>
                ${this.sessions.map((session) => {
                    const sessionCode = getGameMasterSessionCode(session);
                    return `<option value="${session.id}">${this.escapeHtml(session.name)} (${this.escapeHtml(sessionCode)})</option>`;
                }).join('')}
            `;
            select.value = this.sessions.some((session) => session.id === previousValue) ? previousValue : '';
        });
    }

    renderDashboardStats(stats) {
        const statsGrid = document.getElementById('statsGrid');
        if (!statsGrid) return;

        statsGrid.innerHTML = `
            <div class="card stat-card">
                <span class="stat-label">Active Sessions</span>
                <span class="stat-value">${stats.activeSessions}</span>
            </div>
            <div class="card stat-card">
                <span class="stat-label">Connected Participants</span>
                <span class="stat-value">${stats.totalParticipants}</span>
            </div>
            <div class="card stat-card">
                <span class="stat-label">Actions Logged</span>
                <span class="stat-value">${stats.totalActions}</span>
            </div>
            <div class="card stat-card">
                <span class="stat-label">Pending RFIs</span>
                <span class="stat-value">${stats.pendingRequests}</span>
            </div>
        `;
    }

    renderRecentActivity(activities) {
        const container = document.getElementById('recentActivity');
        if (!container) return;

        if (!activities.length) {
            container.innerHTML = `
                <div style="padding: var(--space-4); text-align: center; color: var(--color-text-muted);">
                    No recent activity has been recorded for active sessions.
                </div>
            `;
            return;
        }

        container.innerHTML = activities.map((activity) => {
            const activityBadge = createBadge({
                text: activity.type || 'EVENT',
                variant: 'info',
                size: 'sm'
            });

            return `
                <div style="padding: var(--space-4); border-bottom: 1px solid var(--color-border-light);">
                    <div style="display: flex; justify-content: space-between; gap: var(--space-3); align-items: center; margin-bottom: var(--space-2);">
                        <div style="display: flex; gap: var(--space-2); align-items: center;">
                            ${activityBadge.outerHTML}
                            <span class="text-sm font-semibold">${this.escapeHtml(activity.sessionName)}</span>
                        </div>
                        <span class="text-xs text-gray-500">${formatRelativeTime(activity.created_at)}</span>
                    </div>
                    <p class="text-sm">${this.escapeHtml(activity.content || 'No content provided')}</p>
                </div>
            `;
        }).join('');
    }

    renderActiveParticipants(participants) {
        const container = document.getElementById('activeParticipants');
        if (!container) return;

        if (!participants.length) {
            container.innerHTML = `
                <div style="padding: var(--space-4); text-align: center; color: var(--color-text-muted);">
                    No participants are currently connected.
                </div>
            `;
            return;
        }

        container.innerHTML = participants.map((participant) => {
            const sessionLabel = getParticipantSessionLabel(participant);
            const roleBadge = createBadge({
                text: participant.role || 'unknown',
                variant: 'primary',
                size: 'sm'
            });

            return `
                <div style="padding: var(--space-4); border-bottom: 1px solid var(--color-border-light);">
                    <div style="display: flex; justify-content: space-between; gap: var(--space-3); align-items: center; margin-bottom: var(--space-2);">
                        <div>
                            <p class="text-sm font-semibold">${this.escapeHtml(participant.display_name || 'Unknown')}</p>
                            <p class="text-xs text-gray-500">${this.escapeHtml(sessionLabel)}</p>
                        </div>
                        ${roleBadge.outerHTML}
                    </div>
                    <p class="text-xs text-gray-500">Last active ${formatRelativeTime(participant.heartbeat_at || participant.joined_at)}</p>
                </div>
            `;
        }).join('');
    }

    renderSessionsList() {
        const sessionsList = document.getElementById('sessionsList');
        if (!sessionsList) return;

        if (this.sessions.length === 0) {
            sessionsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <h3 class="empty-state-title">No Sessions</h3>
                    <p class="empty-state-message">Create your first session to get started</p>
                </div>
            `;
            return;
        }

        sessionsList.innerHTML = this.sessions.map((session) => this.renderSessionCard(session)).join('');

        this.sessions.forEach((session) => {
            const card = sessionsList.querySelector(`[data-session-id="${session.id}"]`);
            if (!card) return;

            const viewBtn = card.querySelector('.view-session-btn');
            const selectBtn = card.querySelector('.select-session-btn');
            const deleteBtn = card.querySelector('.delete-session-btn');

            if (viewBtn) {
                viewBtn.addEventListener('click', () => {
                    void this.viewSession(session.id);
                });
            }

            if (selectBtn) {
                selectBtn.addEventListener('click', () => {
                    void this.handleSessionSelectionChange(session.id);
                });
            }

            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    void this.confirmDeleteSession(session.id);
                });
            }
        });
    }

    renderSessionCard(session) {
        const isSelected = this.currentSessionId === session.id;
        const statusBadge = createBadge({
            text: session.status || 'active',
            variant: session.status === 'active' ? 'success' : 'default',
            size: 'sm'
        });
        const selectedBadge = isSelected
            ? createBadge({ text: 'Selected', variant: 'primary', size: 'sm' }).outerHTML
            : '';
        const sessionCode = getGameMasterSessionCode(session);

        return `
            <div class="session-card card card-bordered card-hoverable" data-session-id="${session.id}">
                <div class="session-card-header">
                    <div class="session-card-title-group">
                        <div style="display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap;">
                            <h3 class="card-title">${this.escapeHtml(session.name)}</h3>
                            ${selectedBadge}
                        </div>
                        <p class="card-subtitle">Code: <strong>${this.escapeHtml(sessionCode)}</strong></p>
                    </div>
                    ${statusBadge.outerHTML}
                </div>
                <div class="session-card-body">
                    <div class="session-meta">
                        <div class="session-meta-item">
                            <span class="session-meta-label">Status</span>
                            <span class="session-meta-value">${this.escapeHtml(session.status || 'active')}</span>
                        </div>
                        <div class="session-meta-item">
                            <span class="session-meta-label">Created</span>
                            <span class="session-meta-value">${formatRelativeTime(session.created_at)}</span>
                        </div>
                        <div class="session-meta-item">
                            <span class="session-meta-label">Updated</span>
                            <span class="session-meta-value">${formatRelativeTime(session.updated_at)}</span>
                        </div>
                    </div>
                </div>
                <div class="session-card-actions">
                    <button class="btn btn-outline btn-sm select-session-btn">Select</button>
                    <button class="btn btn-primary btn-sm view-session-btn">View Details</button>
                    <button class="btn btn-danger btn-sm delete-session-btn">Delete</button>
                </div>
            </div>
        `;
    }

    showCreateSessionModal() {
        const content = document.createElement('div');
        content.innerHTML = getCreateSessionFormHtml();

        const modalRef = { current: null };

        modalRef.current = showModal({
            title: 'Create New Session',
            content,
            size: 'md',
            buttons: [
                {
                    label: 'Cancel',
                    variant: 'secondary',
                    onClick: () => {}
                },
                {
                    label: 'Create Session',
                    variant: 'primary',
                    onClick: () => {
                        void this.handleCreateSession(modalRef.current);
                        return false;
                    }
                }
            ]
        });
    }

    async handleCreateSession(modal) {
        const modalElement = modal?.element || document;
        const nameInput = modalElement.querySelector('#newSessionName');
        const codeInput = modalElement.querySelector('#newSessionCode');
        const descInput = modalElement.querySelector('#newSessionDescription');

        if (!nameInput?.value?.trim()) {
            showToast('Session name is required', { type: 'error' });
            nameInput?.focus();
            return;
        }

        const codeError = validateSessionCode(codeInput?.value || '');
        if (codeError) {
            showToast(codeError, { type: 'error' });
            codeInput?.focus();
            return;
        }

        showLoader({ message: 'Creating session...' });

        try {
            const sessionData = {
                name: nameInput.value.trim(),
                session_code: codeInput.value.trim().toUpperCase(),
                description: descInput?.value?.trim() || null,
                status: 'active',
                move: 1,
                phase: 1
            };

            const createdSession = await database.createSession(sessionData);
            showToast('Session created successfully', { type: 'success' });

            if (modal && typeof modal.close === 'function') {
                modal.close();
            } else {
                closeModal();
            }

            this.currentSessionId = createdSession.id;
            await this.loadSessions();
        } catch (err) {
            logger.error('Failed to create session:', err);
            showToast(getUserMessage(err, {
                fallback: 'Failed to create session. Check the session name and join code, then try again.'
            }), { type: 'error' });
        } finally {
            hideLoader();
        }
    }

    async viewSession(sessionId) {
        this.currentSessionId = sessionId;

        const sessionsSection = document.getElementById('sessionsSection');
        const sessionDetailSection = document.getElementById('sessionDetailSection');

        if (sessionsSection) sessionsSection.style.display = 'none';
        if (sessionDetailSection) sessionDetailSection.style.display = 'block';

        this.renderSessionsList();
        await this.refreshSelectedSessionViews();
    }

    renderSessionDetails(session, participants, gameState, actions = [], requests = []) {
        const detailContainer = document.getElementById('sessionDetailContent');
        if (!detailContainer) return;

        const sessionCode = getGameMasterSessionCode(session);
        const currentMove = gameState?.move ?? 1;
        const currentPhase = gameState?.phase ?? 1;
        const pendingRequests = requests.filter((request) => request.status === 'pending').length;
        const participantSummary = buildParticipantSummary(participants);

        detailContainer.innerHTML = `
            <div class="session-detail-header" style="margin-bottom: var(--space-6);">
                <button class="btn btn-ghost btn-sm" id="backToListBtn">
                    <svg viewBox="0 0 20 20" fill="currentColor" style="width: 1em; height: 1em;">
                        <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/>
                    </svg>
                    Back to Sessions
                </button>
                <h2 class="section-title" style="margin-top: var(--space-3);">${this.escapeHtml(session.name)}</h2>
                <p class="text-gray-500">Code: <strong>${this.escapeHtml(sessionCode)}</strong></p>
            </div>

            <div class="section-grid section-grid-4" style="margin-bottom: var(--space-6);">
                <div class="card card-bordered" style="padding: var(--space-4);">
                    <h4 class="text-sm font-semibold text-gray-500">Current Move</h4>
                    <p class="text-2xl font-bold">${currentMove}</p>
                </div>
                <div class="card card-bordered" style="padding: var(--space-4);">
                    <h4 class="text-sm font-semibold text-gray-500">Current Phase</h4>
                    <p class="text-2xl font-bold">${currentPhase}</p>
                </div>
                <div class="card card-bordered" style="padding: var(--space-4);">
                    <h4 class="text-sm font-semibold text-gray-500">Participants</h4>
                    <p class="text-2xl font-bold">${participantSummary.total}</p>
                    <p class="text-xs text-gray-500">${participantSummary.connected} currently connected</p>
                </div>
                <div class="card card-bordered" style="padding: var(--space-4);">
                    <h4 class="text-sm font-semibold text-gray-500">Pending RFIs</h4>
                    <p class="text-2xl font-bold">${pendingRequests}</p>
                </div>
            </div>

            <div class="card card-bordered" style="padding: var(--space-4);">
                <h3 class="text-base font-semibold mb-4">Participants</h3>
                <div id="participantsListDetail">
                    ${this.renderParticipantsTable(participants, {
                        includeActions: true,
                        session,
                        sessionName: session.name,
                        sessionCode
                    })}
                </div>
            </div>

            <div class="card card-bordered" style="padding: var(--space-4); margin-top: var(--space-4);">
                <h3 class="text-base font-semibold mb-4">Session Activity Summary</h3>
                <div class="section-grid section-grid-3">
                    <div>
                        <p class="text-sm text-gray-500">Actions</p>
                        <p class="text-xl font-semibold">${actions.length}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">RFIs</p>
                        <p class="text-xl font-semibold">${requests.length}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Last Updated</p>
                        <p class="text-sm">${formatRelativeTime(session.updated_at)}</p>
                    </div>
                </div>
            </div>
        `;

        const backBtn = detailContainer.querySelector('#backToListBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                const sessionsSection = document.getElementById('sessionsSection');
                const sessionDetailSection = document.getElementById('sessionDetailSection');
                if (sessionsSection) sessionsSection.style.display = 'block';
                if (sessionDetailSection) sessionDetailSection.style.display = 'none';
            });
        }

        this.bindParticipantRemovalControls(detailContainer, session, participants);
    }

    renderParticipantsTable(participants, {
        includeActions = false,
        session = null,
        sessionName = '',
        sessionCode = ''
    } = {}) {
        if (!participants.length) {
            return '<p class="text-muted">No participants have joined this session yet.</p>';
        }

        return `
            <table class="table" style="width: 100%;">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Session</th>
                        <th>Status</th>
                        <th>Last Active</th>
                        ${includeActions ? '<th>Actions</th>' : ''}
                    </tr>
                </thead>
                <tbody>
                    ${participants.map((participant) => {
                        const statusBadge = createBadge({
                            text: participant.is_active ? 'Active' : 'Inactive',
                            variant: participant.is_active ? 'success' : 'default',
                            size: 'sm'
                        });
                        const participantSessionLabel = getParticipantSessionLabel(
                            participant,
                            session || {
                                name: sessionName,
                                session_code: sessionCode
                            }
                        );

                        return `
                            <tr>
                                <td>${this.escapeHtml(participant.display_name || 'Unknown')}</td>
                                <td>${this.escapeHtml(participant.role || 'Unknown')}</td>
                                <td>${this.escapeHtml(participantSessionLabel)}</td>
                                <td>${statusBadge.outerHTML}</td>
                                <td>${participant.heartbeat_at ? formatRelativeTime(participant.heartbeat_at) : 'Never'}</td>
                                ${includeActions ? `
                                    <td>
                                        <button
                                            type="button"
                                            class="btn btn-danger btn-sm"
                                            data-remove-session-participant-id="${this.escapeHtml(participant.id || '')}"
                                            aria-label="Remove ${this.escapeHtml(participant.display_name || 'participant')} from ${this.escapeHtml(participantSessionLabel || sessionName || 'this session')}"
                                        >
                                            Remove
                                        </button>
                                    </td>
                                ` : ''}
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    renderParticipantsPanel(sessionBundle) {
        const stateLabel = document.getElementById('participantsSelectionState');
        const container = document.getElementById('participantsList');
        if (!stateLabel || !container) return;

        if (!sessionBundle?.session) {
            stateLabel.textContent = 'Select a session from Session Management to review live participant data.';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.minHeight = '200px';
            container.innerHTML = `
                <p class="text-gray-500">Select a session from Session Management to view participants.</p>
            `;
            return;
        }

        const sessionCode = getGameMasterSessionCode(sessionBundle.session);
        stateLabel.textContent = `Showing live participant data for ${getGameMasterSessionLabel(sessionBundle.session)}.`;
        container.style.display = 'block';
        container.style.minHeight = 'auto';
        container.innerHTML = `
            <div style="padding: var(--space-4);">
                <div style="display: flex; justify-content: space-between; gap: var(--space-3); align-items: center; margin-bottom: var(--space-4);">
                    <div>
                        <h3 class="text-base font-semibold">${this.escapeHtml(sessionBundle.session.name)}</h3>
                        <p class="text-sm text-gray-500">Code ${this.escapeHtml(sessionCode)}</p>
                    </div>
                    <span class="text-sm text-gray-500">${formatParticipantSummaryLabel(sessionBundle.participants)}</span>
                </div>
                <p class="text-xs text-gray-500" style="margin-bottom: var(--space-3);">
                    Remove clears a participant from the session immediately. They must join again to return.
                </p>
                ${this.renderParticipantsTable(sessionBundle.participants, {
                    includeActions: true,
                    session: sessionBundle.session,
                    sessionName: sessionBundle.session.name,
                    sessionCode
                })}
            </div>
        `;

        this.bindParticipantRemovalControls(container, sessionBundle.session, sessionBundle.participants);
    }

    updateExportAvailability(sessionBundle) {
        const selectionState = buildExportSelectionState(sessionBundle, {
            captureMode: this.researchCaptureMode
        });
        const exportSelectionState = document.getElementById('exportSelectionState');
        if (exportSelectionState) {
            exportSelectionState.textContent = selectionState.message;
        }

        const aggregateResearchDisabled = this.researchCaptureMode !== 'research'
            || [...this.sessionBundles.values()].filter((bundle) => bundle?.session?.id).length < 2;

        getAdminExportButtonConfig().forEach(({ id, availability }) => {
            const button = document.getElementById(id);
            if (button) {
                if (availability === 'research') {
                    button.disabled = selectionState.researchDisabled;
                } else if (availability === 'research-aggregate') {
                    button.disabled = aggregateResearchDisabled;
                } else {
                    button.disabled = selectionState.disabled;
                }
            }
        });
    }

    getResearchNotesAppendixEnabled() {
        const notesToggle = document.getElementById('exportResearchIncludeNotes');
        return notesToggle?.checked === true;
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
        } catch (_error) {
            return 1;
        }
    }

    resolveResearchExporterPseudonym() {
        const operatorAuth = sessionStore.getOperatorAuth?.();
        if (operatorAuth?.grantId) {
            return `gm-${String(operatorAuth.grantId).slice(0, 8)}`;
        }

        return 'game_master_operator';
    }

    async confirmDeleteSession(sessionId) {
        const session = this.sessions.find((entry) => entry.id === sessionId);
        if (!session) return;

        const confirmed = await confirmModal(getGameMasterDeleteSessionConfirmationOptions(session));

        if (confirmed) {
            await this.deleteSession(sessionId);
        }
    }

    bindParticipantRemovalControls(rootElement, session, participants = []) {
        if (!rootElement || !session?.id) {
            return;
        }

        const participantsById = new Map(
            (Array.isArray(participants) ? participants : [])
                .filter((participant) => participant?.id)
                .map((participant) => [String(participant.id), participant])
        );

        rootElement.querySelectorAll('[data-remove-session-participant-id]').forEach((button) => {
            button.addEventListener('click', () => {
                const participantId = button.dataset.removeSessionParticipantId;
                const participant = participantsById.get(String(participantId || ''));

                if (!participant) {
                    showToast('Participant seat data is no longer available. Refresh and try again.', { type: 'error' });
                    return;
                }

                void this.removeParticipantFromSession(session, participant);
            });
        });
    }

    async removeParticipantFromSession(session, participant) {
        if (!session?.id || !participant?.id) {
            showToast('Participant selection is invalid.', { type: 'error' });
            return;
        }

        const participantName = participant.display_name || 'This participant';
        const participantRole = String(participant.role || 'unknown role').replace(/_/g, ' ');
        const confirmed = await confirmModal({
            title: 'Remove Participant',
            message: `Remove ${participantName} (${participantRole}) from ${session.name}? This clears the session seat immediately and requires a fresh join before the participant can return.`,
            confirmLabel: 'Remove Participant',
            variant: 'danger'
        });

        if (!confirmed) {
            return;
        }

        showLoader({ message: `Removing ${participantName}...` });

        try {
            await database.removeSessionParticipant(session.id, participant.id);
            this.sessionBundles.delete(session.id);
            await this.loadSessions();
            showToast(`${participantName} was removed from ${session.name}.`, { type: 'success' });
        } catch (err) {
            logger.error('Failed to remove participant:', err);
            showToast(getUserMessage(err, {
                fallback: 'Failed to remove participant. Refresh the roster and try again.'
            }), { type: 'error' });
        } finally {
            hideLoader();
        }
    }

    async deleteSession(sessionId) {
        showLoader({ message: 'Deleting session...' });

        try {
            await database.deleteSession(sessionId);
            this.sessionBundles.delete(sessionId);

            if (this.currentSessionId === sessionId) {
                this.currentSessionId = null;
            }

            showToast('Session deleted successfully', { type: 'success' });
            await this.loadSessions();
        } catch (err) {
            logger.error('Failed to delete session:', err);
            showToast(getUserMessage(err, {
                fallback: 'Failed to delete session. Refresh the session list and try again.'
            }), { type: 'error' });
        } finally {
            hideLoader();
        }
    }

    async exportData(action) {
        const exportConfig = getAdminExportButtonConfig().find((config) => config.action === action);
        if (!exportConfig) {
            showToast('Unsupported export action.', { type: 'error' });
            return;
        }

        if (action !== 'research-cross-session' && !this.currentSessionId) {
            showToast('Select a session before exporting.', { type: 'warning' });
            return;
        }

        if (
            (exportConfig.availability === 'research' || exportConfig.availability === 'research-aggregate')
            && this.researchCaptureMode !== 'research'
        ) {
            showToast('Research archive export requires research capture mode on the backend.', { type: 'warning' });
            return;
        }

        if (action === 'research-cross-session' && [...this.sessionBundles.values()].filter((bundle) => bundle?.session?.id).length < 2) {
            showToast('Load at least two sessions before exporting a cross-session research archive.', { type: 'warning' });
            return;
        }

        showLoader({ message: 'Preparing export...' });

        try {
            if (action === 'research-cross-session') {
                const sessionIds = [...this.sessionBundles.values()]
                    .map((bundle) => bundle?.session?.id)
                    .filter(Boolean);
                const researchBundles = await Promise.all(
                    sessionIds.map((sessionId) => database.fetchResearchExportBundle(sessionId))
                );
                const crossSessionExport = await buildCrossSessionResearchExportBundle(researchBundles, {
                    generatedByPseudonym: this.resolveResearchExporterPseudonym(),
                    exportVersion: this.getResearchExportVersion(`cross-session:${sessionIds.sort().join('|')}`),
                    includeNotesAppendix: this.getResearchNotesAppendixEnabled(),
                    softwareBuildHash: this.researchBuildHash || null
                });

                await downloadResearchExportArchive(crossSessionExport, `${crossSessionExport.rootFolderName}.zip`);
                showToast(`${exportConfig.successLabel} export is ready.`, { type: 'success' });
                return;
            }

            const liveBundle = this.buildSelectedLiveBundle() || await database.fetchSessionBundle(this.currentSessionId);
            this.sessionBundles.set(this.currentSessionId, liveBundle);

            const sessionName = sanitizeFilenamePart(liveBundle.session?.name || this.currentSessionId);
            const rawSessionCode = getGameMasterSessionCode(liveBundle.session);
            const sessionCode = sanitizeFilenamePart(rawSessionCode === 'N/A' ? liveBundle.session?.id || 'session' : rawSessionCode);
            const baseFilename = `esg-${sessionName}-${sessionCode}`;

            switch (action) {
                case 'json':
                    downloadJsonData(buildJsonExportPayload(liveBundle), `${baseFilename}.json`);
                    break;
                case 'csv-actions':
                    downloadCsv(exportSessionActionsCsv(liveBundle.actions), `${baseFilename}-actions.csv`);
                    break;
                case 'csv-requests':
                    downloadCsv(exportSessionRequestsCsv(liveBundle.requests), `${baseFilename}-rfis.csv`);
                    break;
                case 'csv-timeline':
                    downloadCsv(exportSessionTimelineCsv(liveBundle.timeline), `${baseFilename}-timeline.csv`);
                    break;
                case 'csv-participants':
                    downloadCsv(exportSessionParticipantsCsv(liveBundle.participants), `${baseFilename}-participants.csv`);
                    break;
                case 'research-archive':
                case 'research-print': {
                    const researchBundle = await database.fetchResearchExportBundle(this.currentSessionId);
                    const researchExport = await buildResearchExportBundle(researchBundle, {
                        captureMode: this.researchCaptureMode,
                        generatedByPseudonym: this.resolveResearchExporterPseudonym(),
                        exportVersion: this.getResearchExportVersion(this.currentSessionId),
                        includeNotesAppendix: this.getResearchNotesAppendixEnabled(),
                        softwareBuildHash: this.researchBuildHash || researchBundle.softwareBuildHash || null
                    });

                    if (action === 'research-archive') {
                        await downloadResearchExportArchive(researchExport, `${researchExport.rootFolderName}.zip`);
                    } else {
                        await openResearchPrintWindow(researchExport.reportHtml, {
                            title: `${researchBundle.session?.name || 'Research report'}`
                        });
                    }
                    break;
                }
                default:
                    throw new Error(`Unhandled export action: ${action}`);
            }

            showToast(`${exportConfig.successLabel} export is ready.`, { type: 'success' });
        } catch (err) {
            logger.error('Export failed:', err);
            showToast(getUserMessage(err, {
                fallback: 'Export failed. Refresh the selected session and try again.'
            }), { type: 'error' });
        } finally {
            hideLoader();
        }
    }

    escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    destroy() {
        this.storeUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
        this.storeUnsubscribers = [];
    }
}

const gameMasterController = new GameMasterController();

const shouldAutoInitGameMaster = typeof document !== 'undefined' &&
    !globalThis.__ESG_DISABLE_AUTO_INIT__;

if (shouldAutoInitGameMaster) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            void gameMasterController.init();
        });
    } else {
        void gameMasterController.init();
    }
}

if (typeof window !== 'undefined' && shouldAutoInitGameMaster) {
    window.addEventListener('beforeunload', () => gameMasterController.destroy());
}

export default gameMasterController;
