/**
 * Main Application Entry Point
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * This module initializes core application functionality shared across all roles.
 */

import { sessionStore } from './stores/session.js';
import { gameStateStore } from './stores/gameState.js';
import { actionsStore } from './stores/actions.js';
import { participantsStore } from './stores/participants.js';
import { syncService, SYNC_STATUS } from './services/sync.js';
import { getRuntimeConfigStatus, renderMissingBackendNotice } from './services/supabase.js';
import { createLogger } from './utils/logger.js';
import { showToast } from './components/ui/Toast.js';
import { hideLoader } from './components/ui/Loader.js';
import { confirm as confirmModal } from './components/ui/Modal.js';
import { ConfigurationError, getUserMessage } from './core/errors.js';
import { isLandingPage, navigateToApp } from './core/navigation.js';
import { isPublicRoleSurface, parseTeamRole } from './core/teamContext.js';
import {
    applyHeaderGameStateDisplay,
    getHeaderGameStateDisplay
} from './utils/gameStateDisplay.js';

const logger = createLogger('Main');
const runtimeConfigStatus = getRuntimeConfigStatus();

export function getNavigationType({
    performanceRef = typeof window !== 'undefined' ? window.performance : globalThis.performance
} = {}) {
    const navigationEntry = performanceRef?.getEntriesByType?.('navigation')?.[0];
    if (typeof navigationEntry?.type === 'string' && navigationEntry.type) {
        return navigationEntry.type;
    }

    if (performanceRef?.navigation) {
        return performanceRef.navigation.type === 1 ? 'reload' : 'navigate';
    }

    return null;
}

export function getSessionRoleSurface(snapshot = sessionStore.getSnapshot()) {
    const cachedSurface = snapshot?.sessionData?.roleSurface;
    if (cachedSurface) {
        return cachedSurface;
    }

    const resolvedRole = snapshot?.role || snapshot?.sessionData?.role || null;
    return parseTeamRole(resolvedRole).surface || null;
}

export function shouldRequireFreshParticipantLoginOnReload({
    snapshot = sessionStore.getSnapshot(),
    navigationType = getNavigationType(),
    landingPage = isLandingPage()
} = {}) {
    return false;
}

export async function enforceReloadReauthentication({
    snapshot = sessionStore.getSnapshot(),
    locationRef = typeof window !== 'undefined' ? window.location : null,
    navigationType = getNavigationType(),
    landingPage = isLandingPage()
} = {}) {
    if (!shouldRequireFreshParticipantLoginOnReload({
        snapshot,
        navigationType,
        landingPage
    })) {
        return false;
    }

    return false;
}

/**
 * Initialize the application
 */
async function initApp() {
    logger.info('Initializing ESG Simulation Platform v2.0');

    if (!runtimeConfigStatus.ready) {
        logger.error('Backend configuration is missing:', runtimeConfigStatus.issues);
        renderMissingBackendNotice();
        hideLoader();
        return;
    }

    if (await enforceReloadReauthentication()) {
        hideLoader();
        return;
    }

    // Setup global error handling
    setupErrorHandling();

    // Setup connection indicator
    setupConnectionIndicator();
    setupSyncStatusBanner();

    // Setup logout handler
    setupLogoutHandler();

    // Setup sidebar navigation
    setupSidebarNavigation();

    // Setup mobile menu toggle
    setupMobileMenu();

    // Initialize session from storage
    initializeSession();
    setupSyncLifecycle();

    // Hide any loading overlay
    hideLoader();

    logger.info('Application initialized');
}

/**
 * Setup global error handling
 */
function setupErrorHandling() {
    window.addEventListener('error', (event) => {
        logger.error('Uncaught error:', event.error);
        if (event.error instanceof ConfigurationError) {
            return;
        }
        showToast({
            message: 'An unexpected error occurred',
            type: 'error'
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        logger.error('Unhandled promise rejection:', event.reason);
        if (event.reason instanceof ConfigurationError) {
            return;
        }
        showToast({
            message: 'An operation failed unexpectedly',
            type: 'error'
        });
    });
}

/**
 * Setup connection status indicator
 */
function setupConnectionIndicator() {
    const indicator = document.getElementById('connectionIndicator');
    if (!indicator) return;

    function updateConnectionStatus() {
        if (navigator.onLine) {
            indicator.classList.remove('disconnected');
            indicator.classList.add('connected');
            indicator.title = 'Connected';
        } else {
            indicator.classList.remove('connected');
            indicator.classList.add('disconnected');
            indicator.title = 'Disconnected';
            showToast({
                message: 'Connection lost. Some features may be unavailable.',
                type: 'warning'
            });
        }
    }

    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    updateConnectionStatus();
}

export function getSyncStatusUiState(status, {
    online = typeof navigator !== 'undefined' ? navigator.onLine : true
} = {}) {
    if (!online || status === SYNC_STATUS.OFFLINE) {
        return {
            variant: 'warning',
            role: 'alert',
            retryable: false,
            title: 'Live updates paused',
            message: 'This browser is offline. Reconnect to resume automatic session updates.'
        };
    }

    if (status === SYNC_STATUS.ERROR) {
        return {
            variant: 'error',
            role: 'alert',
            retryable: true,
            title: 'Live updates degraded',
            message: 'Realtime sync is not current. Retry sync or refresh before making time-sensitive changes.'
        };
    }

    if (status === SYNC_STATUS.SYNCING) {
        return {
            variant: 'info',
            role: 'status',
            retryable: false,
            title: 'Live updates reconnecting',
            message: 'The session is pulling the latest state.'
        };
    }

    return null;
}

function createSyncStatusBanner(documentRef = document) {
    const banner = documentRef.createElement('div');
    banner.id = 'syncStatusBanner';
    banner.className = 'sync-status-banner';
    banner.hidden = true;
    banner.setAttribute('aria-live', 'polite');

    const content = documentRef.createElement('div');
    content.className = 'sync-status-banner-content';

    const copy = documentRef.createElement('div');
    copy.className = 'sync-status-banner-copy';

    const title = documentRef.createElement('p');
    title.className = 'sync-status-banner-title';

    const message = documentRef.createElement('p');
    message.className = 'sync-status-banner-message';

    const retryButton = documentRef.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'btn btn-secondary btn-sm sync-status-banner-action';
    retryButton.textContent = 'Retry Sync';

    copy.append(title, message);
    content.append(copy, retryButton);
    banner.appendChild(content);

    return banner;
}

export function setupSyncStatusBanner({
    documentRef = typeof document !== 'undefined' ? document : null,
    windowRef = typeof window !== 'undefined' ? window : null,
    navigatorRef = typeof navigator !== 'undefined' ? navigator : null,
    syncServiceRef = syncService
} = {}) {
    if (!documentRef?.body || !syncServiceRef?.onStatusChange) {
        return null;
    }

    const banner = documentRef.getElementById('syncStatusBanner')
        || createSyncStatusBanner(documentRef);

    if (!banner.parentNode) {
        documentRef.body.appendChild(banner);
    }

    const title = banner.querySelector('.sync-status-banner-title');
    const message = banner.querySelector('.sync-status-banner-message');
    const retryButton = banner.querySelector('.sync-status-banner-action');

    const updateBanner = (status = syncServiceRef.getStatus?.() || SYNC_STATUS.IDLE) => {
        const state = getSyncStatusUiState(status, {
            online: navigatorRef?.onLine !== false
        });

        documentRef.body.classList.toggle('sync-status-banner-visible', Boolean(state));

        if (!state) {
            banner.hidden = true;
            banner.removeAttribute('data-variant');
            return;
        }

        banner.hidden = false;
        banner.dataset.variant = state.variant;
        banner.setAttribute('role', state.role);
        if (title) title.textContent = state.title;
        if (message) message.textContent = state.message;
        if (retryButton) {
            retryButton.hidden = !state.retryable;
            retryButton.disabled = false;
        }
    };

    retryButton?.addEventListener('click', () => {
        retryButton.disabled = true;
        updateBanner(SYNC_STATUS.SYNCING);
        Promise.resolve(syncServiceRef.resync?.())
            .catch((error) => {
                logger.error('Manual sync retry failed:', error);
                updateBanner(SYNC_STATUS.ERROR);
                showToast({
                    message: getUserMessage(error, {
                        fallback: 'Live session sync retry failed. Refresh and try again.'
                    }),
                    type: 'error'
                });
            })
            .finally(() => {
                retryButton.disabled = false;
            });
    });

    const unsubscribe = syncServiceRef.onStatusChange(updateBanner);
    const updateFromCurrentStatus = () => updateBanner(syncServiceRef.getStatus?.() || SYNC_STATUS.IDLE);
    windowRef?.addEventListener?.('online', updateFromCurrentStatus);
    windowRef?.addEventListener?.('offline', updateFromCurrentStatus);
    updateFromCurrentStatus();

    return () => {
        unsubscribe?.();
        windowRef?.removeEventListener?.('online', updateFromCurrentStatus);
        windowRef?.removeEventListener?.('offline', updateFromCurrentStatus);
    };
}

/**
 * Setup logout button handler
 */
function setupLogoutHandler() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;

    logoutBtn.addEventListener('click', async () => {
        await requestLogout({
            actionLabel: logoutBtn.textContent
        });
    });
}

function normalizeLogoutActionLabel(actionLabel = 'Log Out') {
    const normalized = String(actionLabel || '').trim();
    return normalized || 'Log Out';
}

export function getLogoutConfirmationOptions({
    actionLabel = 'Log Out'
} = {}) {
    const normalizedActionLabel = normalizeLogoutActionLabel(actionLabel);
    const isDisconnectAction = normalizedActionLabel.toLowerCase() === 'disconnect';

    return {
        title: isDisconnectAction ? 'Disconnect from this session?' : 'Log out of this session?',
        message: 'You will not lose saved session data. Logging out only releases this seat. Save any unsaved edits in the current form before you continue.',
        confirmLabel: normalizedActionLabel,
        cancelLabel: 'Stay Here',
        variant: 'warning'
    };
}

export async function performLogout({
    participantsStoreRef = participantsStore,
    syncServiceRef = syncService,
    sessionStoreRef = sessionStore,
    navigateToAppRef = navigateToApp,
    loggerRef = logger
} = {}) {
    try {
        await participantsStoreRef.leave();
    } catch (err) {
        loggerRef.error('Failed to disconnect participant:', err);
    }

    await syncServiceRef.reset();

    sessionStoreRef.clear();
    navigateToAppRef('');
}

export async function requestLogout({
    actionLabel = 'Log Out',
    confirmDialog = confirmModal,
    performLogoutRef = performLogout
} = {}) {
    const confirmed = await confirmDialog(getLogoutConfirmationOptions({ actionLabel }));
    if (!confirmed) {
        return false;
    }

    await performLogoutRef();
    return true;
}

/**
 * Sidebar "unread" badges.
 *
 * A badge fills with the accent colour only when new content has arrived for a
 * section the user hasn't opened yet. Each badge's count is baselined; once the
 * initial data load has settled (armed after sync init, so first-load hydration
 * is never mistaken for an update), a badge is flagged unread when its count
 * grows while its section is inactive. Opening the section clears the fill.
 */
function readBadgeCount(badge) {
    if (!badge || badge.hidden) return 0;
    const value = parseInt((badge.textContent || '').trim(), 10);
    return Number.isFinite(value) ? value : 0;
}

const sidebarUnreadBadges = {
    armed: false,
    entries: [],

    register(link) {
        const badge = link.querySelector('.sidebar-badge');
        if (!badge || typeof MutationObserver === 'undefined') return;

        const entry = { link, badge, lastCount: readBadgeCount(badge) };
        sidebarUnreadBadges.entries.push(entry);

        const observer = new MutationObserver(() => {
            const count = readBadgeCount(badge);
            if (sidebarUnreadBadges.armed
                && count > entry.lastCount
                && !link.classList.contains('sidebar-link-active')) {
                badge.classList.add('sidebar-badge-unread');
            }
            if (count === 0) {
                badge.classList.remove('sidebar-badge-unread');
            }
            entry.lastCount = count;
        });
        observer.observe(badge, { childList: true, characterData: true, subtree: true });
    },

    clear(link) {
        const entry = sidebarUnreadBadges.entries.find((item) => item.link === link);
        if (!entry) return;
        entry.badge.classList.remove('sidebar-badge-unread');
        entry.lastCount = readBadgeCount(entry.badge);
    },

    // Called once the initial data load has settled so existing content isn't
    // treated as a brand-new update.
    arm() {
        sidebarUnreadBadges.entries.forEach((entry) => {
            entry.lastCount = readBadgeCount(entry.badge);
        });
        sidebarUnreadBadges.armed = true;
    }
};

/**
 * Setup sidebar navigation
 */
function toArray(value) {
    return Array.from(value || []);
}

function getSidebarSectionIdFromLink(link) {
    return link?.dataset?.section || link?.getAttribute?.('data-section') || null;
}

export function getSidebarSectionElementId(sectionId) {
    return sectionId ? `${sectionId}Section` : null;
}

function getSidebarSectionIdFromHash(locationRef = typeof window !== 'undefined' ? window.location : null) {
    const hash = locationRef?.hash || '';
    if (!hash.startsWith('#') || hash.length <= 1) {
        return null;
    }

    try {
        return decodeURIComponent(hash.slice(1));
    } catch {
        return hash.slice(1);
    }
}

export function focusActiveSection(section) {
    if (!section) {
        return false;
    }

    const focusTarget = section.querySelector?.('[data-section-focus], h1, h2, h3') || section;
    if (!focusTarget || typeof focusTarget.focus !== 'function') {
        return false;
    }

    if (typeof focusTarget.hasAttribute !== 'function' || !focusTarget.hasAttribute('tabindex')) {
        focusTarget.setAttribute?.('tabindex', '-1');
    }

    focusTarget.focus({ preventScroll: false });
    return true;
}

export function applySidebarNavigationState(sectionId, {
    sidebarLinks = [],
    sections = [],
    selectedLink = null,
    focusSection = false,
    updateHash = false,
    historyRef = typeof window !== 'undefined' ? window.history : null,
    locationRef = typeof window !== 'undefined' ? window.location : null
} = {}) {
    const links = toArray(sidebarLinks);
    const sectionNodes = toArray(sections);
    const targetSectionElementId = getSidebarSectionElementId(sectionId);
    const activeSection = sectionNodes.find((section) => section.id === targetSectionElementId);

    if (!sectionId || !activeSection) {
        return null;
    }

    const activeLink = selectedLink
        || links.find((link) => getSidebarSectionIdFromLink(link) === sectionId)
        || null;

    links.forEach((link) => {
        const isActive = link === activeLink || getSidebarSectionIdFromLink(link) === sectionId;
        link.classList?.toggle?.('sidebar-link-active', isActive);

        if (isActive) {
            link.setAttribute?.('aria-current', 'page');
        } else {
            link.removeAttribute?.('aria-current');
        }
    });

    sectionNodes.forEach((section) => {
        const isActive = section === activeSection;
        if (section.style) {
            section.style.display = isActive ? 'block' : 'none';
        }

        if (isActive) {
            section.removeAttribute?.('aria-hidden');
        } else {
            section.setAttribute?.('aria-hidden', 'true');
        }
    });

    if (updateHash && historyRef?.pushState && locationRef) {
        const nextHash = `#${encodeURIComponent(sectionId)}`;
        if (locationRef.hash !== nextHash) {
            historyRef.pushState(null, '', nextHash);
        }
    }

    if (focusSection) {
        focusActiveSection(activeSection);
    }

    return activeSection;
}

function setupSidebarNavigation() {
    const sidebarLinks = document.querySelectorAll('.sidebar-link[data-section]');
    const sections = document.querySelectorAll('.content-section');

    if (!sidebarLinks.length || !sections.length) return;

    const getLinkForSection = (sectionId) => toArray(sidebarLinks)
        .find((link) => getSidebarSectionIdFromLink(link) === sectionId);

    const closeCompactSidebar = () => {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar && overlay) {
            sidebar.classList.remove('sidebar-open');
            overlay.classList.remove('sidebar-overlay-visible');
        }
    };

    const activateSection = (sectionId, {
        link = getLinkForSection(sectionId),
        focusSection = false,
        updateHash = false
    } = {}) => {
        const activeSection = applySidebarNavigationState(sectionId, {
            sidebarLinks,
            sections,
            selectedLink: link,
            focusSection,
            updateHash
        });

        if (!activeSection) return null;

        if (link) {
            sidebarUnreadBadges.clear(link);
        }

        closeCompactSidebar();
        return activeSection;
    };

    sidebarLinks.forEach(link => {
        const sectionId = getSidebarSectionIdFromLink(link);
        const sectionElementId = getSidebarSectionElementId(sectionId);
        if (sectionElementId) {
            link.setAttribute('aria-controls', sectionElementId);
        }

        sidebarUnreadBadges.register(link);

        link.addEventListener('click', (e) => {
            e.preventDefault();
            activateSection(getSidebarSectionIdFromLink(link), {
                link,
                focusSection: true,
                updateHash: true
            });
        });
    });

    const activeLink = document.querySelector('.sidebar-link-active[data-section]');
    const hashSectionId = getSidebarSectionIdFromHash();
    const initialSectionId = getLinkForSection(hashSectionId)
        ? hashSectionId
        : getSidebarSectionIdFromLink(activeLink)
        || getSidebarSectionIdFromLink(sidebarLinks[0]);
    activateSection(initialSectionId, {
        focusSection: false,
        updateHash: false
    });

    const handleHistorySectionChange = () => {
        const sectionId = getSidebarSectionIdFromHash();
        if (!sectionId) return;
        activateSection(sectionId, {
            focusSection: false,
            updateHash: false
        });
    };

    window.addEventListener('popstate', handleHistorySectionChange);
    window.addEventListener('hashchange', handleHistorySectionChange);
}

/**
 * Setup mobile menu toggle
 */
function setupMobileMenu() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (!sidebar) return;

    function applySidebarState({
        isOpen = false,
        isCollapsed = false
    } = {}) {
        sidebar.classList.toggle('sidebar-open', isOpen);
        sidebar.classList.toggle('sidebar-collapsed', isCollapsed);

        if (overlay) {
            overlay.classList.toggle(
                'sidebar-overlay-visible',
                isOpen && isCompactSidebarViewport()
            );
        }

        syncSidebarControlState();
    }

    function syncSidebarControlState() {
        const isCompact = isCompactSidebarViewport();
        const isOpen = sidebar.classList.contains('sidebar-open');
        const isCollapsed = sidebar.classList.contains('sidebar-collapsed');

        if (menuToggle) {
            menuToggle.setAttribute('aria-controls', 'sidebar');
            menuToggle.setAttribute('aria-expanded', String(isCompact && isOpen));
        }

        if (sidebarToggle) {
            sidebarToggle.setAttribute('aria-controls', 'sidebar');
            sidebarToggle.setAttribute('aria-expanded', String(isCompact ? isOpen : !isCollapsed));
            sidebarToggle.setAttribute(
                'aria-label',
                isCompact
                    ? (isOpen ? 'Close sidebar' : 'Open sidebar')
                    : isCollapsed
                        ? 'Expand sidebar'
                        : 'Collapse sidebar'
            );
        }
    }

    function updateSidebar(trigger = 'close') {
        const nextState = resolveSidebarState({
            trigger,
            isCompact: isCompactSidebarViewport(),
            isOpen: sidebar.classList.contains('sidebar-open'),
            isCollapsed: sidebar.classList.contains('sidebar-collapsed')
        });

        applySidebarState(nextState);
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            updateSidebar('menu');
        });
    }

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            updateSidebar('sidebar');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            updateSidebar('close');
        });
    }

    window.addEventListener('resize', () => {
        if (isCompactSidebarViewport()) {
            syncSidebarControlState();
            return;
        }

        applySidebarState({
            isOpen: false,
            isCollapsed: sidebar.classList.contains('sidebar-collapsed')
        });
    });

    syncSidebarControlState();
}

export function isCompactSidebarViewport({
    windowWidth = typeof window !== 'undefined' ? window.innerWidth : Number.POSITIVE_INFINITY,
    compactBreakpoint = 768
} = {}) {
    return Number(windowWidth) <= compactBreakpoint;
}

export function resolveSidebarState({
    trigger = 'close',
    isCompact = false,
    isOpen = false,
    isCollapsed = false
} = {}) {
    switch (trigger) {
    case 'menu':
        return {
            isOpen: isCompact ? !isOpen : isOpen,
            isCollapsed
        };
    case 'sidebar':
        return isCompact
            ? {
                isOpen: false,
                isCollapsed
            }
            : {
                isOpen: false,
                isCollapsed: !isCollapsed
            };
    case 'close':
    default:
        return {
            isOpen: false,
            isCollapsed
        };
    }
}

/**
 * Initialize session from storage
 */
function initializeSession() {
    const sessionNameEl = document.getElementById('sessionName');

    function syncSessionUi(snapshot = sessionStore.getSnapshot()) {
        const sessionId = snapshot.sessionId;
        const sessionData = snapshot.sessionData;

        if (sessionNameEl && sessionData?.name) {
            sessionNameEl.textContent = sessionData.name;
        } else if (sessionNameEl) {
            sessionNameEl.textContent = sessionId ? `Session: ${sessionId.slice(0, 8)}...` : 'No session';
        }

        if (!gameStateStore.getState()) {
            updateGameStateDisplay(sessionData?.gameState, {
                fallbackToMoveOne: Boolean(sessionId)
            });
        }
    }

    sessionStore.subscribe((snapshot) => {
        syncSessionUi(snapshot);
    });

    gameStateStore.subscribe((_event, state) => {
        updateGameStateDisplay(state);
    });

    actionsStore.subscribe(() => {
        const snapshot = sessionStore.getSnapshot();
        updateGameStateDisplay(gameStateStore.getState() || snapshot?.sessionData?.gameState, {
            fallbackToMoveOne: Boolean(snapshot?.sessionId)
        });
    });
}

/**
 * Initialize live sync once a joined session is available
 */
function setupSyncLifecycle() {
    let currentSyncSessionId = null;

    sessionStore.subscribe((snapshot) => {
        const participantId = snapshot.sessionData?.participantSessionId
            || snapshot.sessionData?.participantId
            || null;
        const shouldInitialize = Boolean(
            snapshot.sessionId
            && !isLandingPage()
            && (participantId || snapshot.role === 'white')
        );

        if (!shouldInitialize) {
            if (currentSyncSessionId) {
                currentSyncSessionId = null;
                void syncService.reset();
            }
            return;
        }

        if (currentSyncSessionId === snapshot.sessionId && syncService.isSynced()) {
            return;
        }

        currentSyncSessionId = snapshot.sessionId;
        syncService.initialize(snapshot.sessionId, { participantId })
            .then(() => {
                // Initial data is loaded; from here on, count growth means a
                // genuine new update worth flagging on the sidebar badges.
                sidebarUnreadBadges.arm();
            })
            .catch((error) => {
                logger.error('Failed to initialize live sync:', error);
                showToast({
                    message: 'Live session sync failed to start.',
                    type: 'error'
                });
            });
    });
}

/**
 * Update the game state display in the header
 * @param {Object} gameState - Current game state
 */
function updateGameStateDisplay(gameState, {
    fallbackToMoveOne = true
} = {}) {
    const timerDisplay = document.getElementById('timerDisplay');
    const timerStatus = document.getElementById('timerStatus');
    const headerDisplay = getHeaderGameStateDisplay(gameState, actionsStore.getAll(), {
        fallbackToMoveOne
    });
    applyHeaderGameStateDisplay(headerDisplay);

    if (timerDisplay && gameState?.timer_seconds !== undefined) {
        timerDisplay.textContent = formatTime(gameState.timer_seconds);
    }

    if (timerStatus) {
        if (gameState?.timer_running) {
            timerStatus.textContent = 'Running';
            timerStatus.classList.add('timer-running');
        } else {
            timerStatus.textContent = 'Paused';
            timerStatus.classList.remove('timer-running');
        }
    }
}

/**
 * Format seconds to MM:SS display
 * @param {number} seconds - Seconds to format
 * @returns {string} Formatted time string
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Export for use by role-specific modules
export {
    updateGameStateDisplay,
    formatTime
};
