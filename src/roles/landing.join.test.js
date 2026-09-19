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
        confirmSeat: vi.fn(),
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

function createDomElement() {
    const attributes = {};
    return {
        attributes,
        children: [],
        className: '',
        hidden: false,
        style: { setProperty: vi.fn() },
        textContent: '',
        classList: createClassList(),
        setAttribute(name, value) {
            attributes[name] = value;
        },
        append(...children) {
            this.children.push(...children);
        },
        appendChild(child) {
            this.children.push(child);
        },
        remove: vi.fn()
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
        delete global.requestAnimationFrame;
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
            status: 'active', session_topology_version: 1
        });
        mockDatabase.claimParticipantSeat.mockResolvedValue({
            id: 'session-participant-1',
            session_id: 'session-1', role: 'blue_facilitator', is_active: true,
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
        const confirmation = {
            confirm: vi.fn().mockResolvedValue(),
            dismiss: vi.fn(),
            setSessionName: vi.fn()
        };
        controller.showJoinConfirmation = vi.fn(() => confirmation);

        await controller.handleJoinSession({
            preventDefault() {}
        });

        expect(mockEnsureBrowserIdentity).toHaveBeenCalledWith({
            clientId: 'client-landing-test'
        });
        expect(mockDatabase.lookupJoinableSessionByCode).toHaveBeenCalledWith('ALPHA2026');
        expect(confirmation.setSessionName).toHaveBeenCalledWith('Alpha Session');
        expect(confirmation.setSessionName.mock.invocationCallOrder[0])
            .toBeLessThan(mockDatabase.claimParticipantSeat.mock.invocationCallOrder[0]);
        expect(mockDatabase.getActiveSessions).not.toHaveBeenCalled();
        expect(mockDatabase.getActiveParticipants).not.toHaveBeenCalled();
        expect(mockDatabase.claimParticipantSeat).toHaveBeenCalledWith('session-1', 'blue_facilitator', 'Morgan');
        expect(mockSyncService.initialize).not.toHaveBeenCalled();
        expect(mockSessionStore.confirmSeat).toHaveBeenCalledWith(expect.objectContaining({
            sessionId: 'session-1', role: 'blue_facilitator', topology: 1
        }));
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

    it.each(['asian_pacific', 'europe'].flatMap((delegation) => ['facilitator', 'scribe'].map((surface) => [delegation, surface])))
    ('claims %s / %s with the complete semantic identity visible first', async (delegation, surface) => {
        const elements = { sessionCode: createElement('regional'), displayName: createElement('Synthetic participant'),
            seatSelectionSummary: createErrorElement() };
        global.document = { getElementById: (id) => elements[id] || null };
        const semantic = surface === 'facilitator' ? 'scribe' : 'facilitator';
        const role = `green_${delegation}_${semantic}`;
        mockDatabase.lookupJoinableSessionByCode.mockResolvedValue({ id: 'regional', name: 'Synthetic session',
            status: 'active', session_topology_version: 2 });
        mockDatabase.claimParticipantSeat.mockImplementation(async () => {
            expect(elements.seatSelectionSummary.textContent).toContain(delegation === 'europe' ? 'Europe' : 'Asia-Pacific');
            expect(elements.seatSelectionSummary.textContent).toContain(semantic === 'scribe' ? 'Scribe' : 'Facilitator');
            return { id: 'regional-seat', session_id: 'regional', role, delegation_id: delegation, is_active: true };
        });
        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'green'; controller.selectedDelegation = delegation;
        controller.selectedRoleSurface = surface; controller.redirectToRole = vi.fn();
        await controller.handleJoinSession({ preventDefault() {} });
        expect(mockDatabase.claimParticipantSeat).toHaveBeenCalledWith('regional', role, 'Synthetic participant');
        expect(mockSessionStore.confirmSeat).toHaveBeenCalledWith(expect.objectContaining({ role, delegationId: delegation }));
        expect(controller.redirectToRole).toHaveBeenCalledWith(role);
    });

    it.each([
        ['asian_pacific', 'facilitator', 'green_asian_pacific_scribe'],
        ['europe', 'facilitator', 'green_europe_scribe'],
        [null, 'scribe', 'green_shared_facilitator']
    ])('GC04A joins %s / %s with the full confirmed model', async (delegation, surface, role) => {
        const elements = { sessionCode: createElement('shared2026'), displayName: createElement('Synthetic participant'),
            seatSelectionSummary: createElement(), joinStatus: createElement() };
        global.document = { getElementById: (id) => elements[id] || null };
        mockDatabase.lookupJoinableSessionByCode.mockResolvedValue({ id: 'shared', status: 'active',
            session_topology_version: 2, green_seat_model: 'shared_facilitator_v1' });
        mockDatabase.claimParticipantSeat.mockImplementation(async () => {
            expect(elements.seatSelectionSummary.textContent).toContain(delegation === 'europe' ? 'Europe' : 'Asia-Pacific');
            if (!delegation) expect(elements.seatSelectionSummary.textContent).toContain('Shared Facilitator');
            return { id: 'shared-seat', session_id: 'shared', role, delegation_id: delegation, is_active: true,
                green_seat_model: 'shared_facilitator_v1' };
        });
        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'green'; controller.selectedDelegation = delegation; controller.selectedRoleSurface = surface;
        controller.redirectToRole = vi.fn();
        controller.showJoinConfirmation = vi.fn(() => ({ confirm: async () => {}, dismiss() {}, setSessionName() {} }));
        await controller.handleJoinSession({ preventDefault() {} });
        expect(mockDatabase.claimParticipantSeat).toHaveBeenCalledWith('shared', role, 'Synthetic participant');
        expect(mockSessionStore.confirmSeat).toHaveBeenCalledWith(expect.objectContaining({ role, delegationId: delegation,
            greenSeatModel: 'shared_facilitator_v1' }));
        expect(controller.redirectToRole).toHaveBeenCalledWith(role);
    });

    it('GC04A requires reselection if the server model changes between checking and joining', async () => {
        const elements = { sessionCode: createElement('shared2026'), displayName: createElement('Synthetic participant'), joinStatus: createElement() };
        global.document = { getElementById: (id) => elements[id] || null };
        const session = { id: 'shared', status: 'active', session_topology_version: 2 };
        mockDatabase.lookupJoinableSessionByCode.mockResolvedValueOnce({ ...session, green_seat_model: 'shared_facilitator_v1' })
            .mockResolvedValueOnce({ ...session, green_seat_model: 'regional_pairs_v1' });
        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'green'; controller.selectedRoleSurface = 'scribe';
        controller.showJoinConfirmation = vi.fn(() => ({ confirm: async () => {}, dismiss() {}, setSessionName() {} }));
        await controller.handleJoinSession({ preventDefault() {} });
        expect(mockDatabase.claimParticipantSeat).not.toHaveBeenCalled();
        expect(mockSessionStore.confirmSeat).not.toHaveBeenCalled();
        expect(elements.joinStatus.textContent).toContain('Session topology changed');
    });

    it('GC04A rejects a different model returned by the atomic claim before opening a workspace', async () => {
        const elements = { sessionCode: createElement('shared2026'), displayName: createElement('Synthetic participant'), joinStatus: createElement() };
        global.document = { getElementById: (id) => elements[id] || null };
        mockDatabase.lookupJoinableSessionByCode.mockResolvedValue({ id: 'shared', status: 'active',
            session_topology_version: 2, green_seat_model: 'regional_pairs_v1' });
        mockDatabase.claimParticipantSeat.mockResolvedValue({ id: 'shared-seat', session_id: 'shared',
            role: 'green_europe_scribe', delegation_id: 'europe', is_active: true,
            green_seat_model: 'shared_facilitator_v1' });
        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'green'; controller.selectedDelegation = 'europe'; controller.selectedRoleSurface = 'facilitator';
        controller.redirectToRole = vi.fn();
        controller.showJoinConfirmation = vi.fn(() => ({ confirm: async () => {}, dismiss() {}, setSessionName() {} }));
        await controller.handleJoinSession({ preventDefault() {} });
        expect(mockDatabase.claimParticipantSeat).toHaveBeenCalledWith('shared', 'green_europe_scribe', 'Synthetic participant');
        expect(mockSessionStore.confirmSeat).not.toHaveBeenCalled();
        expect(controller.redirectToRole).not.toHaveBeenCalled();
        expect(elements.joinStatus.textContent).toContain('Session seat model changed during claim');
    });

    it('does not claim a unified Green seat when session discovery reveals regional topology', async () => {
        const elements = { sessionCode: createElement('regional'), displayName: createElement('Synthetic participant'), joinStatus: createElement() };
        global.document = { getElementById: (id) => elements[id] || null };
        mockDatabase.lookupJoinableSessionByCode.mockResolvedValue({ id: 'regional', status: 'active', session_topology_version: 2 });
        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'green'; controller.selectedRoleSurface = 'facilitator';
        await controller.handleJoinSession({ preventDefault() {} });
        expect(mockDatabase.claimParticipantSeat).not.toHaveBeenCalled();
        expect(elements.joinStatus.textContent).toContain('Choose Asia-Pacific or Europe');
    });

    it('joins unified Green when PLENUM2026 lookup supplies server-resolved version 1', async () => {
        const elements = { sessionCode: createElement('plenum2026'), displayName: createElement('Synthetic participant') };
        global.document = { getElementById: (id) => elements[id] || null };
        mockDatabase.lookupJoinableSessionByCode.mockResolvedValue({ id: 'legacy-session', name: 'Synthetic legacy fixture',
            status: 'active', session_topology_version: 1 });
        mockDatabase.claimParticipantSeat.mockResolvedValue({ id: 'legacy-seat', session_id: 'legacy-session',
            role: 'green_facilitator', is_active: true });
        mockDatabase.getGameState.mockResolvedValue({ move: 1, phase: 1 });
        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'green'; controller.selectedRoleSurface = 'facilitator';
        controller.redirectToRole = vi.fn();
        await controller.handleJoinSession({ preventDefault() {} });
        expect(mockDatabase.claimParticipantSeat).toHaveBeenCalledWith('legacy-session', 'green_facilitator', 'Synthetic participant');
        expect(mockSessionStore.confirmSeat).toHaveBeenCalledWith(expect.objectContaining({
            topology: 1, role: 'green_facilitator', delegationId: null
        }));
        expect(controller.redirectToRole).toHaveBeenCalledWith('green_facilitator');
    });

    it.each([undefined, null, 0, 3, '1'])('rejects unavailable or unsupported topology %s without a browser fallback', async (topology) => {
        const elements = { sessionCode: createElement('plenum2026'), displayName: createElement('Synthetic participant'),
            joinStatus: createElement() };
        global.document = { getElementById: (id) => elements[id] || null };
        mockDatabase.lookupJoinableSessionByCode.mockResolvedValue({ id: 'legacy-session', status: 'active',
            session_topology_version: topology });
        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'green'; controller.selectedRoleSurface = 'facilitator';
        await controller.handleJoinSession({ preventDefault() {} });
        expect(controller.resolvedSession).toBeNull();
        expect(elements.joinStatus.textContent).toContain('Session topology unavailable');
        expect(mockDatabase.claimParticipantSeat).not.toHaveBeenCalled();
        expect(mockSessionStore.confirmSeat).not.toHaveBeenCalled();
        expect(mockDatabase.getActiveSessions).not.toHaveBeenCalled();
    });

    it('sends TRAINING2026 through the ordinary live-session join path', async () => {
        const elements = {
            sessionCode: createElement('training2026'),
            displayName: createElement('Morgan')
        };
        global.document = {
            getElementById(id) {
                return elements[id] || null;
            }
        };
        mockDatabase.lookupJoinableSessionByCode.mockResolvedValue({
            id: 'session-live-regression',
            name: 'Live regression',
            session_code: 'TRAINING2026',
            status: 'active', session_topology_version: 1
        });
        mockDatabase.claimParticipantSeat.mockResolvedValue({
            id: 'seat-live-regression',
            session_id: 'session-live-regression', role: 'blue_facilitator', is_active: true,
            claim_status: 'claimed'
        });
        mockDatabase.getGameState.mockResolvedValue({ move: 1, phase: 1 });

        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.selectedTeam = 'blue';
        controller.selectedRoleSurface = 'facilitator';
        controller.selectedRole = 'blue_facilitator';
        controller.redirectToRole = vi.fn();
        controller.showJoinConfirmation = vi.fn(() => ({
            confirm: vi.fn().mockResolvedValue(),
            dismiss: vi.fn(),
            setSessionName: vi.fn()
        }));

        await controller.handleJoinSession({ preventDefault() {} });

        expect(mockDatabase.lookupJoinableSessionByCode).toHaveBeenCalledWith('TRAINING2026');
        expect(mockDatabase.claimParticipantSeat).toHaveBeenCalledWith(
            'session-live-regression',
            'blue_facilitator',
            'Morgan'
        );
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

    it('renders the brand mark and resolved session name in the accessible join loading screen', async () => {
        const body = createDomElement();
        global.document = {
            body,
            createElement: vi.fn(() => createDomElement())
        };
        global.requestAnimationFrame = (callback) => callback();

        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        const confirmation = controller.showJoinConfirmation({
            displayName: 'Morgan',
            metaLabel: 'Blue | Facilitator'
        });
        const overlay = body.children[0];
        const brandMark = overlay.children.find((child) => child.className.includes('jc-brand-mark'));
        const card = overlay.children.find((child) => child.className === 'jc-card');
        const sessionName = card.children.find((child) => child.className === 'jc-session');

        expect(overlay.attributes.role).toBe('status');
        expect(overlay.attributes['aria-live']).toBe('polite');
        expect(overlay.attributes['aria-atomic']).toBe('true');
        expect(brandMark.attributes.src).toMatch(/Gold(?:%20| )No(?:%20| )Background\.png$/);
        expect(brandMark.attributes.src).not.toBe('./src/img/Gold No Background.png');
        expect(brandMark.attributes.alt).toBe('');
        expect(brandMark.attributes['aria-hidden']).toBe('true');
        expect(sessionName.hidden).toBe(true);

        confirmation.setSessionName('Alpha Session');

        expect(sessionName.textContent).toBe('Alpha Session');
        expect(sessionName.hidden).toBe(false);
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
        expect(elements.roleSelectionError.textContent).toBe('Choose Scribe, Facilitator, or Notetaker to join as a participant.');
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
            message: 'This exercise isn\'t ready yet. Ask your exercise facilitator to check the session setup, then try again.',
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
            status: 'active', session_topology_version: 1
        });
        mockDatabase.claimParticipantSeat.mockResolvedValue({
            id: 'session-participant-2',
            session_id: 'session-2', role: 'industry_scribe', is_active: true,
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

    it('authorizes White Cell with session code + access code', async () => {
        const elements = {
            operatorSessionCode: createElement('alpha2026'),
            operatorAccessCode: createElement('admin2025')
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
            operatorName: 'White Cell Lead'
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
        controller.redirectToRole = vi.fn();

        await controller.authorizeWhiteCell('lead', 'admin2025');

        expect(mockDatabase.lookupJoinableSessionByCode).toHaveBeenCalledWith('ALPHA2026');
        expect(mockDatabase.authorizeOperatorAccess).toHaveBeenCalledWith({
            surface: 'whitecell',
            accessCode: 'admin2025',
            sessionId: 'session-1',
            role: 'whitecell_lead',
            operatorName: 'White Cell Lead'
        });
        expect(mockDatabase.claimParticipantSeat).toHaveBeenCalledWith(
            'session-1',
            'whitecell_lead',
            'White Cell Lead'
        );
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
            operatorName: 'White Cell Lead'
        }));
        expect(controller.redirectToRole).toHaveBeenCalledWith('whitecell_lead');
    });

    it('authorizes SME with session code + access code (role from button)', async () => {
        const elements = {
            smeSessionCode: createElement('alpha2026'),
            smeAccessCode: createElement('admin2025'),
            displayName: createElement(''),
            selectedRole: createElement(''),
            roleSelectionError: createErrorElement()
        };
        const confirmation = {
            confirm: vi.fn(async () => {}),
            dismiss: vi.fn(),
            setSessionName: vi.fn()
        };

        global.document = {
            getElementById(id) {
                return elements[id] || null;
            },
            querySelector: vi.fn(() => null)
        };

        mockDatabase.lookupJoinableSessionByCode.mockResolvedValue({
            id: 'session-1',
            name: 'Alpha Session',
            session_code: 'ALPHA2026',
            status: 'active'
        });
        mockDatabase.authorizeOperatorAccess.mockResolvedValue({
            id: 'grant-sme-1',
            surface: 'sme',
            sessionId: 'session-1',
            teamId: null,
            role: 'sme_econ',
            operatorName: 'Econ SME'
        });
        mockDatabase.claimParticipantSeat.mockResolvedValue({
            id: 'session-participant-sme-1',
            claim_status: 'claimed'
        });
        mockDatabase.getGameState.mockResolvedValue({
            move: 1,
            phase: 1
        });

        const { LandingController } = await loadLandingModule();
        const controller = new LandingController();
        controller.redirectToRole = vi.fn();
        controller.showJoinConfirmation = vi.fn(() => confirmation);

        await controller.handleOperatorAccess('sme', { smeRole: 'econ' });

        expect(controller.showJoinConfirmation).toHaveBeenCalledWith({
            displayName: 'Econ SME',
            metaLabel: 'SME | Econ SME'
        });
        expect(mockDatabase.lookupJoinableSessionByCode).toHaveBeenCalledWith('ALPHA2026');
        expect(mockDatabase.authorizeOperatorAccess).toHaveBeenCalledWith({
            surface: 'sme',
            accessCode: 'admin2025',
            sessionId: 'session-1',
            role: 'sme_econ',
            operatorName: 'Econ SME'
        });
        expect(confirmation.setSessionName).toHaveBeenCalledWith('Alpha Session');
        expect(mockDatabase.claimParticipantSeat).toHaveBeenCalledWith(
            'session-1',
            'sme_econ',
            'Econ SME'
        );
        expect(controller.redirectToRole).toHaveBeenCalledWith('sme_econ');
    });
});
