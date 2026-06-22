/**
 * Main Application Entry Point
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * This module initializes core application functionality shared across all roles.
 */

import { sessionStore } from './stores/session.js';
import { gameStateStore } from './stores/gameState.js';
import { participantsStore } from './stores/participants.js';
import { syncService } from './services/sync.js';
import { getRuntimeConfigStatus, renderMissingBackendNotice } from './services/supabase.js';
import { createLogger } from './utils/logger.js';
import { showToast } from './components/ui/Toast.js';
import { hideLoader } from './components/ui/Loader.js';
import { confirm as confirmModal } from './components/ui/Modal.js';
import { ConfigurationError } from './core/errors.js';
import { isLandingPage, navigateToApp } from './core/navigation.js';
import { isPublicRoleSurface, parseTeamRole } from './core/teamContext.js';
import { getPhaseLabel } from './core/enums.js';

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
function setupSidebarNavigation() {
    const sidebarLinks = document.querySelectorAll('.sidebar-link[data-section]');
    const sections = document.querySelectorAll('.content-section');

    if (!sidebarLinks.length || !sections.length) return;

    sidebarLinks.forEach(link => {
        sidebarUnreadBadges.register(link);

        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = link.dataset.section;

            // Update active link
            sidebarLinks.forEach(l => l.classList.remove('sidebar-link-active'));
            link.classList.add('sidebar-link-active');

            // Opening a section clears its "new updates" badge fill.
            sidebarUnreadBadges.clear(link);

            // Show corresponding section
            sections.forEach(section => {
                if (section.id === `${sectionId}Section`) {
                    section.style.display = 'block';
                } else {
                    section.style.display = 'none';
                }
            });

            // Close mobile sidebar if open
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            if (sidebar && overlay) {
                sidebar.classList.remove('sidebar-open');
                overlay.classList.remove('sidebar-overlay-visible');
            }
        });
    });
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
            updateGameStateDisplay(sessionData?.gameState);
        }
    }

    sessionStore.subscribe((snapshot) => {
        syncSessionUi(snapshot);
    });

    gameStateStore.subscribe((_event, state) => {
        updateGameStateDisplay(state);
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
function updateGameStateDisplay(gameState) {
    const headerMove = document.getElementById('headerMove');
    const headerPhase = document.getElementById('headerPhase');
    const timerDisplay = document.getElementById('timerDisplay');
    const timerStatus = document.getElementById('timerStatus');

    if (headerMove) {
        headerMove.textContent = gameState?.move ?? 1;
    }

    if (headerPhase) {
        headerPhase.textContent = getPhaseLabel(gameState?.phase ?? 1);
    }

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
