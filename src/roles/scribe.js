import { sessionStore } from '../stores/session.js';
import { actionsStore } from '../stores/actions.js';
import { communicationsStore } from '../stores/communications.js';
import { createLogger } from '../utils/logger.js';
import { formatDateTime, formatRelativeTime, formatStatus } from '../utils/formatting.js';
import { showToast } from '../components/ui/Toast.js';
import { buildAppPath, navigateToApp } from '../core/navigation.js';
import { getRoleRoute, resolveTeamContext } from '../core/teamContext.js';
import { createOutcomeBadge, createPriorityBadge, createStatusBadge } from '../components/ui/Badge.js';
import {
    ENUMS,
    getPhaseLabel,
    isAdjudicatedAction,
    isDraftAction,
    isSubmittedAction
} from '../core/enums.js';
import { isWhiteCellCommunicationVisibleToScribe } from '../features/communications/targeting.js';
import {
    formatActionSequenceLabel,
    formatBlueActionSelection,
    getActionSequenceNumber,
    getBlueActionViewModel
} from '../features/actions/blueActionDetails.js';
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

const logger = createLogger('Scribe');
const ACTIONS_SECTION_ID = 'actions';

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
        title: `Awaiting ${teamLabel} facilitator decisions`,
        sidebarOrdinal: '0',
        sidebarKicker: 'No live action slides yet',
        summary: 'Saved drafts, submitted actions, and White Cell updates will appear here as follow-along briefing slides for the team scribe.'
    };
}

function getActionSlideLifecycleLabel(action = {}) {
    if (isDraftAction(action)) {
        return 'Draft Preview';
    }

    if (isAdjudicatedAction(action)) {
        return 'White Cell Reviewed';
    }

    if (isSubmittedAction(action)) {
        return 'Submitted to White Cell';
    }

    return 'Action';
}

export function buildScribeActionSlides(actions = [], {
    teamLabel = 'Team'
} = {}) {
    const sortedActions = sortTeamActions(actions);

    if (!sortedActions.length) {
        return {
            slideCount: 0,
            slides: [buildActionPlaceholderSlide({ teamLabel })]
        };
    }

    const slides = sortedActions.map((action, index) => {
        const actionViewModel = getBlueActionViewModel(action);
        const actionNumber = getActionSequenceNumber(sortedActions, action) || index + 1;
        const sequenceLabel = formatActionSequenceLabel({
            teamLabel,
            move: action.move || 1,
            actionNumber
        });

        return {
            slideKey: `action-${action.id}`,
            slideType: 'action',
            action,
            actionViewModel,
            title: actionViewModel.title,
            sidebarOrdinal: String(actionNumber),
            sidebarKicker: `${getActionSlideLifecycleLabel(action)} | ${sequenceLabel}`
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
        description: 'Live facilitator drafts, submitted actions, and White Cell deliberation updates for the scribe seat.',
        slideCount: actionSlides.slideCount,
        slides: actionSlides.slides
    };
}

function normalizeComparableText(value = '') {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function hasDistinctActionText(primary = '', secondary = '') {
    const normalizedPrimary = normalizeComparableText(primary);
    const normalizedSecondary = normalizeComparableText(secondary);

    return Boolean(normalizedSecondary) && normalizedPrimary !== normalizedSecondary;
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

function renderActionSlideDataRow({
    label = '',
    value = ''
} = {}) {
    return `
        <div class="scribe-action-slide-data-row">
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value)}</dd>
        </div>
    `;
}

function getActionSlideAnnouncementLabel(action = {}) {
    if (isDraftAction(action)) {
        return 'Draft preview';
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
        this.sections = [];
        this.deckSlides = [];
        this.activeDeckSource = SCRIBE_DECK_SOURCE_REPO;
        this.activeDeckStorageKey = null;
        this.activeDeckFileName = null;
        this.activeDeckPath = buildDefaultScribeDeckPath(this.teamId);
        this.activeDeckLabel = DEFAULT_SCRIBE_DECK_LABEL;
        this.activeDeckAssignmentId = null;
        this.currentSlideIndex = 0;
        this.activeSectionIndex = 0;
        this.storeUnsubscribers = [];
        // Navbar activity feed (visible even in presentation mode)
        this.notifications = [];
        this.unreadNotifications = 0;
        this.notificationSeq = 0;
        this.alertsOpen = false;
        this.knownCommunicationIds = new Set();
        this.actionStatusById = new Map();
        this.communicationsSeeded = false;
        this.actionsSeeded = false;
    }

    async init() {
        logger.info('Initializing scribe interface');

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
                : `This page is only available to the ${this.teamLabel} Scribe role.`;

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
        await this.loadDeck();
        this.syncActionsFromStore();

        logger.info('Scribe interface initialized');
    }

    configureShell() {
        document.body.dataset.roleSurface = 'scribe';
        document.body.dataset.scribeDeckState = 'loading';
        setScribePresentationMode({ isActive: false });
        this.restoreSidebarState();

        const roleLabel = document.getElementById('sessionRoleLabel');
        const headerTitle = document.querySelector('.header-title');

        if (roleLabel) {
            roleLabel.textContent = 'Scribe';
        }

        if (headerTitle) {
            headerTitle.textContent = `Statecraft Sim | ${this.teamLabel} Scribe`;
        }
    }

    bindEventListeners() {
        document.getElementById('prevSlideBtn')?.addEventListener('click', () => {
            this.setSlideByIndex(this.currentSlideIndex - 1);
        });

        document.getElementById('nextSlideBtn')?.addEventListener('click', () => {
            this.setSlideByIndex(this.currentSlideIndex + 1);
        });

        document.getElementById('presentBtn')?.addEventListener('click', () => {
            void this.togglePresentationMode();
        });

        document.getElementById('scribeAlertsBtn')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.setAlertsOpen(!this.alertsOpen);
        });

        document.getElementById('scribeAlertsClear')?.addEventListener('click', () => {
            this.notifications = [];
            this.unreadNotifications = 0;
            this.renderAlerts();
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

        document.getElementById('deckRetryBtn')?.addEventListener('click', () => {
            void this.loadDeck();
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
                // Tapping a number in the collapsed rail expands the sidebar.
                if (this.isSidebarCollapsed() && !this.isMobileViewport()) {
                    this.setSidebarCollapsed(false);
                }
                this.selectSection(Number(sectionButton.dataset.sectionIndex));
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
            communicationsStore.subscribe((event) => {
                this.processCommunicationNotifications(event);
                this.syncDeckAssignmentFromStore({
                    reload: event === 'created' || event === 'updated' || event === 'initialized' || event === 'loaded'
                });
            })
        );
    }

    syncActionsFromStore({
        event = '',
        data = null
    } = {}) {
        this.teamActions = actionsStore.getByTeam(this.teamId);
        this.processActionNotification({ event, data });

        if (!this.facilitatorDeckSlides.length) {
            return;
        }

        const shouldFocusDraftPreview = (
            (event === 'created' || event === 'updated')
            && data?.team === this.teamId
            && isDraftAction(data)
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
        this.knownCommunicationIds = new Set(
            communicationsStore.getAll().map((communication) => communication?.id).filter(Boolean)
        );
        this.communicationsSeeded = true;
        actionsStore.getByTeam(this.teamId).forEach((action) => {
            if (action?.id) {
                this.actionStatusById.set(action.id, action.status);
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
        default: return team || 'Another team';
        }
    }

    processActionNotification({ event = '', data = null } = {}) {
        const isLiveEvent = event === 'created' || event === 'updated';
        if (!this.actionsSeeded || !isLiveEvent) {
            this.teamActions.forEach((action) => {
                if (action?.id) {
                    this.actionStatusById.set(action.id, action.status);
                }
            });
            this.actionsSeeded = true;
            return;
        }

        if (!data || data.team !== this.teamId || !data.id) {
            return;
        }

        const previousStatus = this.actionStatusById.get(data.id);
        const nextStatus = data.status;
        const isNewAction = event === 'created' || previousStatus === undefined;
        const statusChanged = previousStatus !== nextStatus;
        this.actionStatusById.set(data.id, nextStatus);

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
            title = isNewAction ? 'New action drafted' : 'Draft action updated';
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
        if (!this.communicationsSeeded || event === 'initialized' || event === 'loaded') {
            this.knownCommunicationIds = new Set(all.map((communication) => communication?.id).filter(Boolean));
            this.communicationsSeeded = true;
            return;
        }

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
                at: communication.created_at || null
            };
        }

        // A White Cell communication addressed to this scribe (deck assignments excluded)
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

    setAlertsOpen(isOpen) {
        this.alertsOpen = Boolean(isOpen);
        const panel = document.getElementById('scribeAlertsPanel');
        const button = document.getElementById('scribeAlertsBtn');

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
        } else {
            this.updateAlertsBadge();
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
                ? `Pulling ${deckLabel || 'the uploaded support deck'} from browser cache and live team decisions into the scribe surface.`
                : `Pulling ${deckLabel || 'the assigned support deck'} and live team decisions into the scribe surface.`
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
                    logger.warn('Assigned uploaded scribe deck unavailable in this browser, falling back to the team default deck.', {
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

                    logger.warn('Assigned scribe deck unavailable, falling back to the team default deck.', {
                        requestedDeckPath,
                        fallbackDeckPath: defaultDeckPath,
                        error
                    });
                    showToast({
                        message: 'Assigned scribe deck unavailable. Loaded the default team deck instead.',
                        type: 'warning'
                    });
                    this.facilitatorDeckSlides = await fetchScribeDeckSlides(defaultDeckPath);
                }
            }

            this.rebuildDeck();

            this.renderSections();
            this.renderSlide();
        } catch (error) {
            logger.error('Failed to load scribe deck:', error);
            this.setDeckState('error');
            this.renderDeckState({
                title: 'Support deck unavailable',
                message: error.message || 'The assigned support deck could not be loaded for this seat.'
            });
            showToast({
                message: 'The scribe support deck could not be loaded.',
                type: 'error'
            });
        }
    }

    getCurrentSlideKey() {
        return getSlideKey(this.deckSlides[this.currentSlideIndex]);
    }

    rebuildDeck({
        preferredSlideKey = '',
        preferActionsSection = false
    } = {}) {
        const actionSection = buildActionSection(this.teamActions, {
            teamLabel: this.teamLabel
        });
        const staticSections = expandScribeDeckSections(this.facilitatorDeckSlides)
            .filter((section) => section.id !== ACTIONS_SECTION_ID);
        const staticSlides = flattenScribeDeckSlides(staticSections);

        this.sections = [actionSection, ...staticSections];
        this.deckSlides = [...staticSlides, ...actionSection.slides];

        if (!this.deckSlides.length) {
            this.currentSlideIndex = 0;
            this.activeSectionIndex = 0;
            return;
        }

        const preferredIndex = this.deckSlides.findIndex((slide) => getSlideKey(slide) === preferredSlideKey);
        if (preferredIndex >= 0) {
            this.currentSlideIndex = preferredIndex;
        } else if (preferActionsSection && actionSection.slides.length) {
            this.currentSlideIndex = this.deckSlides.findIndex(
                (slide) => getSlideKey(slide) === getSlideKey(actionSection.slides[0])
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

        sectionList.innerHTML = this.sections.map((section, sectionIndex) => {
            const isExpanded = sectionIndex === this.activeSectionIndex;
            const containsCurrentSlide = section.slides.some((slide) => getSlideKey(slide) === currentSlideKey);
            const visibleSlideCount = Number.isFinite(section.slideCount)
                ? section.slideCount
                : section.slides.length;

            const slideMarkup = section.slides.map((slide, slideIndex) => {
                const isActiveSlide = getSlideKey(slide) === currentSlideKey;
                const isActionSlide = slide.slideType !== 'image';
                const slideOrdinal = slide.sidebarOrdinal || slide.n || slideIndex + 1;
                const slideKicker = slide.slideType === 'image'
                    ? `Slide ${slideIndex + 1} of ${section.slides.length}`
                    : slide.sidebarKicker || `Decision ${slideIndex + 1} of ${Math.max(visibleSlideCount, 1)}`;
                return `
                    <li>
                        <button
                            type="button"
                            class="scribe-slide-link${isActiveSlide ? ' is-active' : ''}${isActionSlide ? ' is-action' : ''}"
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

            return `
                <section class="scribe-section-card${containsCurrentSlide ? ' is-current' : ''}">
                    <button
                        type="button"
                        class="scribe-section-trigger${isExpanded ? ' is-expanded' : ''}"
                        data-section-index="${sectionIndex}"
                        data-section-label="${escapeHtml(section.label)}"
                        aria-expanded="${isExpanded ? 'true' : 'false'}"
                        aria-label="${escapeHtml(section.label)}, ${visibleSlideCount} slides"
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
                    <div class="scribe-slide-group"${isExpanded ? '' : ' hidden'}>
                        <ol class="scribe-slide-list">
                            ${slideMarkup}
                        </ol>
                    </div>
                </section>
            `;
        }).join('');
    }

    renderSlide() {
        const slide = this.deckSlides[this.currentSlideIndex];
        if (!slide) {
            this.renderDeckState({
                title: 'No support slides found',
                message: 'The scribe section mapping did not resolve any slides from the facilitator deck.'
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
                actionFrame.innerHTML = this.renderActionSlide(slide);
            }
        }

        if (announcement) {
            announcement.textContent = slide.slideType === 'image'
                ? `${activeSection.label}. ${slide.title}. Slide ${this.currentSlideIndex + 1} of ${this.deckSlides.length}.`
                : `${activeSection.label}. ${slide.title}. ${getActionSlideAnnouncementLabel(slide.action)} ${slideIndexWithinSection + 1} of ${Math.max(activeSection.slideCount || activeSection.slides.length, 1)}.`;
        }

        const prevSlideBtn = document.getElementById('prevSlideBtn');
        const nextSlideBtn = document.getElementById('nextSlideBtn');

        prevSlideBtn && (prevSlideBtn.disabled = this.currentSlideIndex === 0);
        nextSlideBtn && (nextSlideBtn.disabled = this.currentSlideIndex >= this.deckSlides.length - 1);

        this.renderSections();
    }

    renderActionSlide(slide) {
        if (slide.slideType === 'action-placeholder') {
            return `
                <article class="scribe-action-slide scribe-action-slide-placeholder">
                    <p class="scribe-action-slide-eyebrow">Live Facilitator Feed</p>
                    <h2 class="scribe-action-slide-title">${escapeHtml(slide.title)}</h2>
                    <p class="scribe-action-slide-summary">${escapeHtml(slide.summary || '')}</p>
                </article>
            `;
        }

        const action = slide.action || {};
        const actionViewModel = slide.actionViewModel || getBlueActionViewModel(action);
        const badges = [
            createStatusBadge(action.status || ENUMS.ACTION_STATUS.DRAFT).outerHTML,
            createPriorityBadge(action.priority || 'NORMAL').outerHTML,
            action.outcome ? createOutcomeBadge(action.outcome).outerHTML : ''
        ].filter(Boolean).join('');
        const targets = formatBlueActionSelection(actionViewModel.focusCountries);
        const levers = formatBlueActionSelection(actionViewModel.levers, actionViewModel.lever || 'Not specified');
        const sectors = formatBlueActionSelection(actionViewModel.sectors, actionViewModel.sector || action.sector || 'Not specified');
        const legislativeOptions = formatBlueActionSelection(actionViewModel.legislativeOptions, 'None selected');
        const coordinated = formatBlueActionSelection(actionViewModel.coordinated, 'None selected');
        const informed = formatBlueActionSelection(actionViewModel.informed, 'None selected');
        const sequenceLabel = slide.sidebarKicker || formatActionSequenceLabel({
            teamLabel: this.teamLabel,
            move: action.move || 1,
            actionNumber: Number(slide.sidebarOrdinal) || 1
        });
        const timingLabel = [
            `Move ${action.move || 1}`,
            getPhaseLabel(action.phase || 1)
        ].join(' | ');
        const timelineLabel = actionViewModel.enforcementTimeline || 'Timeline pending';
        const submittedLabel = action.submitted_at
            ? formatDateTime(action.submitted_at)
            : '';
        const adjudicatedLabel = action.adjudicated_at
            ? formatDateTime(action.adjudicated_at)
            : '';
        const draftSavedLabel = action.updated_at
            ? formatDateTime(action.updated_at)
            : (action.created_at ? formatDateTime(action.created_at) : '');
        const isDraftPreview = isDraftAction(action);
        const decisionBrief = actionViewModel.objective
            || actionViewModel.expectedOutcomes
            || 'Awaiting facilitator detail.';
        const expectedEffect = actionViewModel.expectedOutcomes || '';
        const showExpectedEffect = hasDistinctActionText(decisionBrief, expectedEffect);
        const supplyChainFocus = actionViewModel.supplyChainFocus || action.exposure_type || 'Not specified';
        const implementationLabel = actionViewModel.implementation || 'Not specified';
        const deliverySupport = [
            actionViewModel.implementation === 'Legislative'
                ? `Legislative route: ${legislativeOptions}`
                : '',
            supplyChainFocus !== 'Not specified'
                ? `Supply chain: ${supplyChainFocus}`
                : ''
        ].filter(Boolean).join(' | ');
        const focusSupport = sectors !== 'Not specified'
            ? `Sectors: ${sectors}`
            : 'Sector detail pending';
        const coordinationSupport = `Informed: ${informed}`;
        const whiteCellNoteMarkup = action.adjudication_notes
            ? `
                <section class="scribe-action-slide-note-card" aria-label="White Cell note">
                    <p class="scribe-action-slide-note-label">White Cell note</p>
                    <p class="scribe-action-slide-note-body">${escapeHtml(action.adjudication_notes)}</p>
                </section>
            `
            : '';
        const slideEyebrow = isDraftPreview
            ? 'Facilitator Draft Preview'
            : 'Facilitator Decision';
        const sectionLabel = isDraftPreview
            ? `What ${this.teamLabel} is preparing`
            : `What ${this.teamLabel} is doing`;
        const glanceCopy = isDraftPreview
            ? 'The working draft the team can review in the room before sending it to White Cell.'
            : 'The core move, where it lands, and how it will be carried out.';
        const statusBlockTitle = isDraftPreview
            ? 'Draft status'
            : 'Status and White Cell';
        const statusRows = isDraftPreview
            ? [
                {
                    label: 'Priority',
                    value: formatStatus(action.priority || 'NORMAL')
                },
                {
                    label: 'Draft saved',
                    value: draftSavedLabel || 'Saved in the facilitator workspace'
                },
                {
                    label: 'Submission',
                    value: 'Ready for facilitator submission'
                },
                {
                    label: 'White Cell status',
                    value: 'Not yet submitted to White Cell'
                }
            ]
            : [
                {
                    label: 'Priority',
                    value: formatStatus(action.priority || 'NORMAL')
                },
                {
                    label: 'Outcome',
                    value: action.outcome ? formatStatus(action.outcome) : 'Awaiting White Cell outcome'
                },
                {
                    label: 'Submitted',
                    value: submittedLabel || 'Awaiting submission'
                },
                {
                    label: 'White Cell update',
                    value: adjudicatedLabel || 'No White Cell update yet'
                }
            ];
        const legacyNotes = actionViewModel.legacyNotes
            ? `
                <section class="scribe-action-slide-note-card scribe-action-slide-note-card-secondary" aria-label="Supporting note">
                    <p class="scribe-action-slide-note-label">Supporting note</p>
                    <p class="scribe-action-slide-note-body">${escapeHtml(actionViewModel.legacyNotes)}</p>
                </section>
            `
            : '';

        return `
            <article class="scribe-action-slide" data-action-id="${escapeHtml(String(action.id || ''))}">
                <header class="scribe-action-slide-header">
                    <div>
                        <p class="scribe-action-slide-eyebrow">${escapeHtml(slideEyebrow)}</p>
                        <h2 class="scribe-action-slide-title">${escapeHtml(actionViewModel.title)}</h2>
                        <p class="scribe-action-slide-summary">${escapeHtml(sequenceLabel)}</p>
                    </div>
                    <div class="scribe-action-slide-badges">${badges}</div>
                </header>

                <section class="scribe-action-slide-panel">
                    <div class="scribe-action-slide-meta">
                        <span>${escapeHtml(timingLabel)}</span>
                        <span>${escapeHtml(formatStatus(action.status || ENUMS.ACTION_STATUS.DRAFT))}</span>
                        <span>${escapeHtml(timelineLabel)}</span>
                    </div>
                    <section class="scribe-action-slide-lead" aria-label="Decision brief">
                        <p class="scribe-action-slide-section-label">${escapeHtml(sectionLabel)}</p>
                        <p class="scribe-action-slide-body">${escapeHtml(decisionBrief)}</p>
                        ${showExpectedEffect
                ? `<p class="scribe-action-slide-lead-note"><strong>Expected effect:</strong> ${escapeHtml(expectedEffect)}</p>`
                : ''}
                    </section>

                    <section class="scribe-action-slide-glance" aria-label="Action at a glance">
                        <div class="scribe-action-slide-section-header">
                            <h3 class="scribe-action-slide-section-title">Action at a glance</h3>
                            <p class="scribe-action-slide-section-copy">${escapeHtml(glanceCopy)}</p>
                        </div>
                        <div class="scribe-action-slide-glance-grid">
                            ${renderActionSlideGlanceCard({
                label: 'Primary move',
                value: actionViewModel.instrumentOfPower || action.mechanism || 'Not specified',
                support: levers !== 'Not specified' ? levers : 'Lever detail pending'
            })}
                            ${renderActionSlideGlanceCard({
                label: 'Focus countries',
                value: targets,
                support: focusSupport
            })}
                            ${renderActionSlideGlanceCard({
                label: 'Delivery path',
                value: implementationLabel,
                support: deliverySupport || 'Execution detail pending'
            })}
                            ${renderActionSlideGlanceCard({
                label: 'Coordination',
                value: coordinated,
                support: coordinationSupport
            })}
                        </div>
                    </section>

                    <div class="scribe-action-slide-columns">
                        <section class="scribe-action-slide-block" aria-label="Execution snapshot">
                            <h3 class="scribe-action-slide-block-title">Execution snapshot</h3>
                            <dl class="scribe-action-slide-data-list">
                                ${renderActionSlideDataRow({
                label: 'Timeline',
                value: timelineLabel
            })}
                                ${renderActionSlideDataRow({
                label: 'Supply chain focus',
                value: supplyChainFocus
            })}
                                ${actionViewModel.implementation === 'Legislative'
                ? renderActionSlideDataRow({
                    label: 'Legislative route',
                    value: legislativeOptions
                })
                : ''}
                                ${renderActionSlideDataRow({
                label: 'Sequence',
                value: sequenceLabel
            })}
                            </dl>
                        </section>

                        <section class="scribe-action-slide-block" aria-label="${escapeHtml(statusBlockTitle)}">
                            <h3 class="scribe-action-slide-block-title">${escapeHtml(statusBlockTitle)}</h3>
                            <dl class="scribe-action-slide-data-list">
                                ${statusRows.map((row) => renderActionSlideDataRow(row)).join('')}
                            </dl>
                            ${whiteCellNoteMarkup}
                        </section>
                    </div>

                    ${legacyNotes}
                </section>
            </article>
        `;
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
        this.renderSlide();
    }

    setSlideByKey(slideKey = '') {
        const nextIndex = this.deckSlides.findIndex((slide) => getSlideKey(slide) === slideKey);
        if (nextIndex === -1) {
            return;
        }

        this.currentSlideIndex = nextIndex;
        this.renderSlide();
    }

    selectSection(sectionIndex = 0) {
        const section = this.sections[sectionIndex];
        if (!section?.slides?.length) {
            return;
        }

        this.activeSectionIndex = sectionIndex;
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
