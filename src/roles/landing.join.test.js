import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockDatabase,
    mockSessionStore,
    mockEnsureBrowserIdentity,
    mockSyncService,
    mockShowToast,
    mockShowLoader,
    mockHideLoader
} = vi.hoisted(() => ({
    mockDatabase: {
        lookupJoinableSessionByCode: vi.fn(),
        authorizeOperatorAccess: vi.fn(),
        claimParticipantSeat: vi.fn(),
        getGameState: vi.fn(),
        disconnectParticipant: vi.fn(),
        getActiveSessions: vi.fn(),
        getActiveParticipants: vi.fn()
    },
    mockSessionStore: {
        getClientId: vi.fn(() => 'client-landing-test'),
        clear: vi.fn(),
        clearOperatorAuth: vi.fn(),
        setSessionId: vi.fn(),
        setRole: vi.fn(),
        setUserName: vi.fn(),
        setSessionData: vi.fn(),
        setGameState: vi.fn(),
        setOperatorAuth: vi.fn()
    },
    mockEnsureBrowserIdentity: vi.fn(),
    mockSyncService: {
        initialize: vi.fn()
    },
    mockShowToast: vi.fn(),
    mockShowLoader: vi.fn(() => ({ id: 'loader-1' })),
    mockHideLoader: vi.fn()
}));

vi.mock('../services/database.js', () => ({
    database: mockDatabase
}));

vi.mock('../stores/session.js', () => ({
    sessionStore: mockSessionStore
}));

vi.mock('../services/supabase.js', () => ({
    getRuntimeConfigStatus: () => ({ ready: true }),
    ensureBrowserIdentity: mockEnsureBrowserIdentity
}));

vi.mock('../services/sync.js', () => ({
    syncService: mockSyncService
}));

vi.mock('../components/ui/Toast.js', () => ({
    showToast: mockShowToast
}));

vi.mock('../components/ui/Loader.js', () => ({
    showLoader: mockShowLoader,
    hideLoader: mockHideLoader
}));

vi.mock('../utils/logger.js', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

function createClassList() {
    const classes = new Set();
    return {
        add(className) {
            classes.add(className);
        },
        remove(className) {
            classes.delete(className);
        },
        contains(className) {
            return classes.has(className);
        }
    };
}

function createElement(value = '') {
    const attributes = {};
    return {
        value,
        attributes,
        classList: createClassList(),
        focus: vi.fn(),
        setAttribute(name, nextValue) {
            attributes[name] = nextValue;
        },
        removeAttribute(name) {
            delete attributes[name];
        }
    };
}

function createErrorElement() {
    return {
        textContent: '',
        hidden: true
    };
}

async function loadLandingModule() {
    globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
    vi.resetModules();
    return import('./landing.js');
}

describe('landing secure join flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSessionStore.getClientId.mockReturnValue('client-landing-test');
        mockEnsureBrowserIdentity.mockResolvedValue({
            access_token: 'anon-token'
        });
    });

    afterEach(() => {
        vi.resetModules();
        delete global.document;
        delete global.window;
        delete globalThis.__ESG_DISABLE_AUTO_INIT__;
    });

    it('joins successfully by a valid code without listing public session inventory', async () => {
        const elements = {
            sessionCode: createElement('alpha2026'),
            displayName: createElement('Morgan')
        };

        global.document = {
            getElementById(id) {
                return elements[id] || null;
            }
        };

        mockDatabase.lookupJoinableSessionByCode.mockResolvedValue({
            id: 'session-1',
            name: 'Alpha Session',
            session_code: 'ALPHA2026',
            status: 'active'
        });
        mockDatabase.claimParticipantSeat.mockResolvedValue({
            id: 'session-participant-1',
            claim_status: 'claimed'
        });
        mockDatabase.getGameState.mockResolvedValue({
            move: 1,
            phase: 1
        });

        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'blue';
        controller.selectedRoleSurface = 'facilitator';
        controller.selectedRole = 'blue_facilitator';
        controller.redirectToRole = vi.fn();

        await controller.handleJoinSession({
            preventDefault() {}
        });

        expect(mockEnsureBrowserIdentity).toHaveBeenCalledWith({
            clientId: 'client-landing-test'
        });
        expect(mockDatabase.lookupJoinableSessionByCode).toHaveBeenCalledWith('ALPHA2026');
        expect(mockDatabase.getActiveSessions).not.toHaveBeenCalled();
        expect(mockDatabase.getActiveParticipants).not.toHaveBeenCalled();
        expect(mockDatabase.claimParticipantSeat).toHaveBeenCalledWith('session-1', 'blue_facilitator', 'Morgan');
        expect(mockSyncService.initialize).toHaveBeenCalledWith('session-1', {
            participantId: 'session-participant-1'
        });
        expect(mockSessionStore.setSessionId).toHaveBeenCalledWith('session-1');
        expect(mockSessionStore.setSessionData).toHaveBeenCalledWith(expect.objectContaining({
            id: 'session-1',
            name: 'Alpha Session',
            code: 'ALPHA2026',
            participantId: 'session-participant-1',
            participantSessionId: 'session-participant-1',
            role: 'blue_facilitator',
            displayName: 'Morgan',
            team: 'blue',
            roleSurface: 'facilitator',
            seatClaimStatus: 'claimed'
        }));
        expect(controller.redirectToRole).toHaveBeenCalledWith('blue_facilitator');
        // Success is confirmed by the join interstitial, not a toast.
        expect(mockShowToast).not.toHaveBeenCalled();
        expect(mockHideLoader).not.toHaveBeenCalled();
    });

    it('fails cleanly when the server-side lookup rejects an invalid code', async () => {
        const elements = {
            sessionCode: createElement('missing-code'),
            displayName: createElement('Morgan')
        };

        global.document = {
            getElementById(id) {
                return elements[id] || null;
            }
        };

        mockDatabase.lookupJoinableSessionByCode.mockRejectedValue(
            Object.assign(new Error('relation "sessions" does not exist'), {
                name: 'DatabaseError',
                operation: 'lookupJoinableSessionByCode'
            })
        );

        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'blue';
        controller.selectedRoleSurface = 'facilitator';
        controller.selectedRole = 'blue_facilitator';
        controller.redirectToRole = vi.fn();

        await controller.handleJoinSession({
            preventDefault() {}
        });

        expect(mockDatabase.lookupJoinableSessionByCode).toHaveBeenCalledWith('MISSING-CODE');
        expect(mockDatabase.claimParticipantSeat).not.toHaveBeenCalled();
        expect(mockDatabase.getActiveSessions).not.toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith({
            message: 'Session not found. Please check the code and try again.',
            type: 'error'
        });
        expect(controller.redirectToRole).not.toHaveBeenCalled();
        expect(mockHideLoader).not.toHaveBeenCalled();
    });

    it('persists invalid session-code feedback inline and links it to the field', async () => {
        const elements = {
            sessionCode: createElement('x'),
            displayName: createElement('Morgan'),
            sessionCodeError: createErrorElement(),
            displayNameError: createErrorElement(),
            roleSelectionError: createErrorElement()
        };

        global.document = {
            getElementById(id) {
                return elements[id] || null;
            },
            querySelector: vi.fn(() => null)
        };

        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'blue';
        controller.selectedRoleSurface = 'facilitator';
        controller.selectedRole = 'blue_facilitator';

        await controller.handleJoinSession({
            preventDefault() {}
        });

        expect(elements.sessionCode.attributes['aria-invalid']).toBe('true');
        expect(elements.sessionCode.classList.contains('is-invalid')).toBe(true);
        expect(elements.sessionCodeError.hidden).toBe(false);
        expect(elements.sessionCodeError.textContent).toBe('Session code must be at least 3 characters');
        expect(elements.sessionCode.focus).toHaveBeenCalled();
        expect(mockDatabase.lookupJoinableSessionByCode).not.toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith({
            message: 'Session code must be at least 3 characters',
            type: 'error'
        });
    });

    it('persists missing-role feedback on the role group and focuses the first role chip', async () => {
        const firstRoleButton = createElement();
        const elements = {
            sessionCode: createElement('alpha2026'),
            displayName: createElement('Morgan'),
            roleSelectionGroup: createElement(),
            sessionCodeError: createErrorElement(),
            displayNameError: createErrorElement(),
            roleSelectionError: createErrorElement()
        };

        global.document = {
            getElementById(id) {
                return elements[id] || null;
            },
            querySelector(selector) {
                return selector === '.chip[data-role-surface]' ? firstRoleButton : null;
            }
        };

        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'blue';

        await controller.handleJoinSession({
            preventDefault() {}
        });

        expect(elements.roleSelectionGroup.attributes['aria-invalid']).toBe('true');
        expect(elements.roleSelectionError.hidden).toBe(false);
        expect(elements.roleSelectionError.textContent).toBe('Choose Facilitator, Scribe, or Notetaker to join as a participant.');
        expect(firstRoleButton.focus).toHaveBeenCalled();
        expect(mockDatabase.lookupJoinableSessionByCode).not.toHaveBeenCalled();
    });

    it('persists missing operator access-code feedback inline', async () => {
        const elements = {
            sessionCode: createElement('alpha2026'),
            operatorAccessCode: createElement(''),
            sessionCodeError: createErrorElement(),
            operatorAccessCodeError: createErrorElement()
        };

        global.document = {
            getElementById(id) {
                return elements[id] || null;
            },
            querySelector: vi.fn(() => null)
        };

        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();

        await controller.handleOperatorAccess('gamemaster');

        expect(elements.operatorAccessCode.attributes['aria-invalid']).toBe('true');
        expect(elements.operatorAccessCodeError.hidden).toBe(false);
        expect(elements.operatorAccessCodeError.textContent).toBe('A valid operator access code is required.');
        expect(elements.operatorAccessCode.focus).toHaveBeenCalled();
        expect(mockDatabase.authorizeOperatorAccess).not.toHaveBeenCalled();
    });

    it('surfaces browser identity bootstrap failures without attempting session lookup', async () => {
        const elements = {
            sessionCode: createElement('alpha2026'),
            displayName: createElement('Morgan')
        };

        global.document = {
            getElementById(id) {
                return elements[id] || null;
            }
        };

        mockEnsureBrowserIdentity.mockRejectedValue(
            Object.assign(
                new Error('The configured Supabase backend could not be reached. Verify the project URL, DNS, and network access, then reload this page.'),
                { name: 'ConfigurationError' }
            )
        );

        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'blue';
        controller.selectedRoleSurface = 'facilitator';
        controller.selectedRole = 'blue_facilitator';
        controller.redirectToRole = vi.fn();

        await controller.handleJoinSession({
            preventDefault() {}
        });

        expect(mockEnsureBrowserIdentity).toHaveBeenCalledWith({
            clientId: 'client-landing-test'
        });
        expect(mockDatabase.lookupJoinableSessionByCode).not.toHaveBeenCalled();
        expect(mockDatabase.claimParticipantSeat).not.toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith({
            message: 'The configured Supabase backend could not be reached. Verify the project URL, DNS, and network access, then reload this page.',
            type: 'error'
        });
        expect(controller.redirectToRole).not.toHaveBeenCalled();
        expect(mockHideLoader).not.toHaveBeenCalled();
    });

    it('canonicalizes a bare scribe surface into a team-scoped seat before claiming', async () => {
        const elements = {
            sessionCode: createElement('alpha2026'),
            displayName: createElement('Taylor')
        };

        global.document = {
            getElementById(id) {
                return elements[id] || null;
            }
        };

        mockDatabase.lookupJoinableSessionByCode.mockResolvedValue({
            id: 'session-2',
            name: 'Bravo Session',
            session_code: 'ALPHA2026',
            status: 'active'
        });
        mockDatabase.claimParticipantSeat.mockResolvedValue({
            id: 'session-participant-2',
            claim_status: 'claimed'
        });
        mockDatabase.getGameState.mockResolvedValue({
            move: 2,
            phase: 1
        });

        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'industry';
        controller.selectedRoleSurface = 'scribe';
        controller.selectedRole = 'scribe';
        controller.redirectToRole = vi.fn();

        await controller.handleJoinSession({
            preventDefault() {}
        });

        expect(mockDatabase.claimParticipantSeat).toHaveBeenCalledWith('session-2', 'industry_scribe', 'Taylor');
        expect(mockSessionStore.setRole).toHaveBeenCalledWith('industry_scribe');
        expect(mockSessionStore.setSessionData).toHaveBeenCalledWith(expect.objectContaining({
            role: 'industry_scribe',
            team: 'industry',
            roleSurface: 'scribe'
        }));
        expect(controller.redirectToRole).toHaveBeenCalledWith('industry_scribe');
    });

    it('routes public code lookup through the server-side contract only', async () => {
        mockDatabase.lookupJoinableSessionByCode.mockResolvedValue({
            id: 'session-lookup',
            name: 'Lookup Session',
            session_code: 'LOOKUP2026',
            status: 'active'
        });

        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        const session = await controller.findSessionByCode('LOOKUP2026');

        expect(session).toEqual({
            id: 'session-lookup',
            name: 'Lookup Session',
            session_code: 'LOOKUP2026',
            status: 'active'
        });
        expect(mockDatabase.lookupJoinableSessionByCode).toHaveBeenCalledWith('LOOKUP2026');
        expect(mockDatabase.getActiveSessions).not.toHaveBeenCalled();
    });

    it('authorizes White Cell through the server-side operator grant before claiming a seat', async () => {
        const elements = {
            sessionCode: createElement('alpha2026'),
            displayName: createElement('Morgan')
        };

        global.document = {
            getElementById(id) {
                return elements[id] || null;
            }
        };

        mockDatabase.lookupJoinableSessionByCode.mockResolvedValue({
            id: 'session-1',
            name: 'Alpha Session',
            session_code: 'ALPHA2026',
            status: 'active'
        });
        mockDatabase.authorizeOperatorAccess.mockResolvedValue({
            id: 'grant-1',
            surface: 'whitecell',
            sessionId: 'session-1',
            teamId: null,
            role: 'whitecell_lead',
            operatorName: 'Morgan'
        });
        mockDatabase.claimParticipantSeat.mockResolvedValue({
            id: 'session-participant-1',
            claim_status: 'claimed'
        });
        mockDatabase.getGameState.mockResolvedValue({
            move: 1,
            phase: 1
        });

        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'blue';
        controller.redirectToRole = vi.fn();

        await controller.authorizeWhiteCell('lead', 'admin2025');

        expect(mockDatabase.authorizeOperatorAccess).toHaveBeenCalledWith({
            surface: 'whitecell',
            accessCode: 'admin2025',
            sessionId: 'session-1',
            role: 'whitecell_lead',
            operatorName: 'Morgan'
        });
        expect(mockDatabase.claimParticipantSeat).toHaveBeenCalledWith('session-1', 'whitecell_lead', 'Morgan');
        expect(mockSyncService.initialize).toHaveBeenCalledWith('session-1', {
            participantId: 'session-participant-1'
        });
        expect(mockSessionStore.setOperatorAuth).toHaveBeenCalledWith(expect.objectContaining({
            id: 'grant-1',
            surface: 'whitecell',
            sessionId: 'session-1',
            sessionCode: 'ALPHA2026',
            teamId: null,
            role: 'whitecell_lead',
            operatorName: 'Morgan'
        }));
        expect(controller.redirectToRole).toHaveBeenCalledWith('whitecell_lead');
    });
});
