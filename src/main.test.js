import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockSessionStore,
    mockSyncService,
    mockParticipantsStore,
    mockActionsStore,
    mockNavigateToApp
} = vi.hoisted(() => ({
    mockSessionStore: {
        getSnapshot: vi.fn(() => ({
            sessionId: null,
            role: null,
            sessionData: null
        })),
        clear: vi.fn()
    },
    mockSyncService: {
        reset: vi.fn(),
        getStatus: vi.fn(() => 'idle'),
        onStatusChange: vi.fn(() => vi.fn()),
        resync: vi.fn()
    },
    mockParticipantsStore: {
        leave: vi.fn()
    },
    mockActionsStore: {
        getAll: vi.fn(() => []),
        subscribe: vi.fn(() => vi.fn())
    },
    mockNavigateToApp: vi.fn()
}));

vi.mock('./stores/session.js', () => ({
    sessionStore: mockSessionStore
}));

vi.mock('./stores/gameState.js', () => ({
    gameStateStore: {}
}));

vi.mock('./stores/actions.js', () => ({
    actionsStore: mockActionsStore
}));

vi.mock('./stores/participants.js', () => ({
    participantsStore: mockParticipantsStore
}));

vi.mock('./services/supabase.js', () => ({
    getRuntimeConfigStatus: () => ({ ready: true }),
    renderMissingBackendNotice: vi.fn()
}));

vi.mock('./components/ui/Toast.js', () => ({
    showToast: vi.fn()
}));

vi.mock('./components/ui/Loader.js', () => ({
    hideLoader: vi.fn()
}));

vi.mock('./components/ui/Modal.js', () => ({
    confirm: vi.fn()
}));

vi.mock('./utils/logger.js', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

vi.mock('./core/navigation.js', () => ({
    isLandingPage: vi.fn(() => false),
    navigateToApp: mockNavigateToApp
}));

vi.mock('./services/sync.js', () => ({
    SYNC_STATUS: {
        IDLE: 'idle',
        SYNCING: 'syncing',
        SYNCED: 'synced',
        ERROR: 'error',
        OFFLINE: 'offline'
    },
    syncService: mockSyncService
}));

describe('main reload reauthentication guard', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockParticipantsStore.leave.mockResolvedValue();
        mockSyncService.reset.mockResolvedValue();
        global.document = {
            readyState: 'loading',
            addEventListener: vi.fn(),
            getElementById: vi.fn(() => null),
            querySelectorAll: vi.fn(() => [])
        };
    });

    afterEach(() => {
        vi.resetModules();
        delete global.document;
    });

    it('allows public participant roles to survive a browser reload', async () => {
        const { shouldRequireFreshParticipantLoginOnReload } = await import('./main.js');

        expect(shouldRequireFreshParticipantLoginOnReload({
            snapshot: {
                sessionId: 'session-1',
                role: 'viewer',
                sessionData: {
                    role: 'viewer',
                    roleSurface: 'viewer'
                }
            },
            navigationType: 'reload',
            landingPage: false
        })).toBe(false);
    });

    it('does not force operator roles back through login on reload', async () => {
        const { shouldRequireFreshParticipantLoginOnReload } = await import('./main.js');

        expect(shouldRequireFreshParticipantLoginOnReload({
            snapshot: {
                sessionId: 'session-1',
                role: 'whitecell_lead',
                sessionData: {
                    role: 'whitecell_lead',
                    roleSurface: 'whitecell'
                }
            },
            navigationType: 'reload',
            landingPage: false
        })).toBe(false);
    });

    it('does not clear or redirect an existing public participant session after reload', async () => {
        const { enforceReloadReauthentication } = await import('./main.js');
        const locationRef = {
            replace: vi.fn(),
            assign: vi.fn()
        };

        const enforced = await enforceReloadReauthentication({
            snapshot: {
                sessionId: 'session-1',
                role: 'blue_facilitator',
                sessionData: {
                    role: 'blue_facilitator',
                    roleSurface: 'facilitator',
                    participantSessionId: 'seat-1'
                }
            },
            locationRef,
            navigationType: 'reload',
            landingPage: false
        });

        expect(enforced).toBe(false);
        expect(mockParticipantsStore.leave).not.toHaveBeenCalled();
        expect(mockSyncService.reset).not.toHaveBeenCalled();
        expect(mockSessionStore.clear).not.toHaveBeenCalled();
        expect(mockNavigateToApp).not.toHaveBeenCalled();
    });
});

describe('logout confirmation flow', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockParticipantsStore.leave.mockResolvedValue();
        mockSyncService.reset.mockResolvedValue();
        global.document = {
            readyState: 'loading',
            addEventListener: vi.fn(),
            getElementById: vi.fn(() => null),
            querySelectorAll: vi.fn(() => [])
        };
    });

    afterEach(() => {
        vi.resetModules();
        delete global.document;
    });

    it('builds a logout confirmation that reassures users their saved data remains', async () => {
        const { getLogoutConfirmationOptions } = await import('./main.js');

        expect(getLogoutConfirmationOptions({ actionLabel: 'Logout' })).toEqual({
            title: 'Log out of this session?',
            message: 'You will not lose saved session data. Logging out only releases this seat. Save any unsaved edits in the current form before you continue.',
            confirmLabel: 'Logout',
            cancelLabel: 'Stay Here',
            variant: 'warning'
        });
    });

    it('does not clear the session when the user cancels logout', async () => {
        const confirmDialog = vi.fn().mockResolvedValue(false);
        const performLogoutRef = vi.fn();
        const { requestLogout } = await import('./main.js');

        const loggedOut = await requestLogout({
            actionLabel: 'Logout',
            confirmDialog,
            performLogoutRef
        });

        expect(loggedOut).toBe(false);
        expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Log out of this session?',
            confirmLabel: 'Logout'
        }));
        expect(performLogoutRef).not.toHaveBeenCalled();
    });

    it('clears the seat and redirects after the user confirms logout', async () => {
        const { requestLogout, performLogout } = await import('./main.js');
        const confirmDialog = vi.fn().mockResolvedValue(true);

        const loggedOut = await requestLogout({
            actionLabel: 'Disconnect',
            confirmDialog,
            performLogoutRef: () => performLogout()
        });

        expect(loggedOut).toBe(true);
        expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Disconnect from this session?',
            confirmLabel: 'Disconnect'
        }));
        expect(mockParticipantsStore.leave).toHaveBeenCalledTimes(1);
        expect(mockSyncService.reset).toHaveBeenCalledTimes(1);
        expect(mockSessionStore.clear).toHaveBeenCalledTimes(1);
        expect(mockNavigateToApp).toHaveBeenCalledWith('');
    });

    it('still clears the session if participant disconnect cleanup fails', async () => {
        mockParticipantsStore.leave.mockRejectedValueOnce(new Error('disconnect failed'));
        const { performLogout } = await import('./main.js');

        await performLogout();

        expect(mockParticipantsStore.leave).toHaveBeenCalledTimes(1);
        expect(mockSyncService.reset).toHaveBeenCalledTimes(1);
        expect(mockSessionStore.clear).toHaveBeenCalledTimes(1);
        expect(mockNavigateToApp).toHaveBeenCalledWith('');
    });
});

describe('sidebar toggle state resolution', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        global.document = {
            readyState: 'loading',
            addEventListener: vi.fn(),
            getElementById: vi.fn(() => null),
            querySelectorAll: vi.fn(() => [])
        };
    });

    afterEach(() => {
        vi.resetModules();
        delete global.document;
    });

    it('collapses the desktop sidebar without treating it as a mobile drawer', async () => {
        const { resolveSidebarState } = await import('./main.js');

        expect(resolveSidebarState({
            trigger: 'sidebar',
            isCompact: false,
            isOpen: false,
            isCollapsed: false
        })).toEqual({
            isOpen: false,
            isCollapsed: true
        });
    });

    it('uses the sidebar toggle as a close action on compact viewports', async () => {
        const { resolveSidebarState } = await import('./main.js');

        expect(resolveSidebarState({
            trigger: 'sidebar',
            isCompact: true,
            isOpen: true,
            isCollapsed: true
        })).toEqual({
            isOpen: false,
            isCollapsed: true
        });
    });

    it('detects compact sidebar viewports at and below the mobile breakpoint', async () => {
        const { isCompactSidebarViewport } = await import('./main.js');

        expect(isCompactSidebarViewport({ windowWidth: 768 })).toBe(true);
        expect(isCompactSidebarViewport({ windowWidth: 769 })).toBe(false);
    });
});

function createFakeClassList(initialClasses = []) {
    const classes = new Set(initialClasses);
    return {
        add(className) {
            classes.add(className);
        },
        remove(className) {
            classes.delete(className);
        },
        toggle(className, force) {
            if (force) {
                classes.add(className);
            } else {
                classes.delete(className);
            }
        },
        contains(className) {
            return classes.has(className);
        }
    };
}

function createFakeSidebarLink(sectionId, { active = false } = {}) {
    const attributes = {};
    return {
        dataset: { section: sectionId },
        attributes,
        classList: createFakeClassList(active ? ['sidebar-link-active'] : []),
        setAttribute(name, value) {
            attributes[name] = value;
        },
        removeAttribute(name) {
            delete attributes[name];
        }
    };
}

function createFakeContentSection(sectionId) {
    const attributes = {};
    const headingAttributes = {};
    const heading = {
        attributes: headingAttributes,
        focus: vi.fn(),
        hasAttribute(name) {
            return Object.hasOwn(headingAttributes, name);
        },
        setAttribute(name, value) {
            headingAttributes[name] = value;
        }
    };

    return {
        id: `${sectionId}Section`,
        style: {},
        attributes,
        heading,
        setAttribute(name, value) {
            attributes[name] = value;
        },
        removeAttribute(name) {
            delete attributes[name];
        },
        querySelector() {
            return heading;
        }
    };
}

describe('sidebar navigation semantics', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        global.document = {
            readyState: 'loading',
            addEventListener: vi.fn(),
            getElementById: vi.fn(() => null),
            querySelectorAll: vi.fn(() => [])
        };
    });

    afterEach(() => {
        vi.resetModules();
        delete global.document;
    });

    it('marks the active link, hides inactive sections, updates the hash, and focuses the active heading', async () => {
        const { applySidebarNavigationState } = await import('./main.js');
        const links = [
            createFakeSidebarLink('actions', { active: true }),
            createFakeSidebarLink('requests')
        ];
        const sections = [
            createFakeContentSection('actions'),
            createFakeContentSection('requests')
        ];
        const historyRef = { pushState: vi.fn() };
        const locationRef = { hash: '#actions' };

        const activeSection = applySidebarNavigationState('requests', {
            sidebarLinks: links,
            sections,
            focusSection: true,
            updateHash: true,
            historyRef,
            locationRef
        });

        expect(activeSection).toBe(sections[1]);
        expect(links[0].classList.contains('sidebar-link-active')).toBe(false);
        expect(links[0].attributes['aria-current']).toBeUndefined();
        expect(links[1].classList.contains('sidebar-link-active')).toBe(true);
        expect(links[1].attributes['aria-current']).toBe('page');
        expect(sections[0].style.display).toBe('none');
        expect(sections[0].attributes['aria-hidden']).toBe('true');
        expect(sections[1].style.display).toBe('block');
        expect(sections[1].attributes['aria-hidden']).toBeUndefined();
        expect(sections[1].heading.attributes.tabindex).toBe('-1');
        expect(sections[1].heading.focus).toHaveBeenCalledWith({ preventScroll: false });
        expect(historyRef.pushState).toHaveBeenCalledWith(null, '', '#requests');
    });
});

describe('sync status banner state', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        global.document = {
            readyState: 'loading',
            addEventListener: vi.fn(),
            getElementById: vi.fn(() => null),
            querySelectorAll: vi.fn(() => [])
        };
    });

    afterEach(() => {
        vi.resetModules();
        delete global.document;
    });

    it('shows a non-retryable offline warning when the browser is offline', async () => {
        const { getSyncStatusUiState } = await import('./main.js');

        expect(getSyncStatusUiState('synced', { online: false })).toEqual({
            variant: 'warning',
            role: 'alert',
            retryable: false,
            title: 'Live updates paused',
            message: 'This browser is offline. Reconnect to resume automatic session updates.'
        });
    });

    it('shows a retryable degraded state for sync errors', async () => {
        const { getSyncStatusUiState } = await import('./main.js');

        expect(getSyncStatusUiState('error', { online: true })).toEqual({
            variant: 'error',
            role: 'alert',
            retryable: true,
            title: 'Live updates degraded',
            message: 'Realtime sync is not current. Retry sync or refresh before making time-sensitive changes.'
        });
    });

    it('hides the banner when sync is current', async () => {
        const { getSyncStatusUiState } = await import('./main.js');

        expect(getSyncStatusUiState('synced', { online: true })).toBeNull();
    });
});
