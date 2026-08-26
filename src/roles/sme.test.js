import { afterEach, describe, expect, it, vi } from 'vitest';
import { SME_ROLES } from '../core/teamContext.js';

async function loadSmeControllerWithMocks({
    role = 'sme_econ',
    factories = {}
} = {}) {
    globalThis.__ESG_DISABLE_AUTO_INIT__ = true;

    const createPliMacroReview = factories.createPliMacroReview
        || vi.fn(() => ({ refresh: vi.fn(), destroy: vi.fn() }));
    const createNiEscalationReview = factories.createNiEscalationReview
        || vi.fn(() => ({ refresh: vi.fn(), destroy: vi.fn() }));
    const createDiplomacyInfoReview = factories.createDiplomacyInfoReview
        || vi.fn(() => ({ refresh: vi.fn(), destroy: vi.fn() }));
    const createSmeHandoffQueue = factories.createSmeHandoffQueue
        || vi.fn(() => ({ refresh: vi.fn(), destroy: vi.fn() }));
    const mountFollowAlong = vi.fn(() => ({ destroy: vi.fn() }));

    vi.doMock('../stores/session.js', () => ({
        sessionStore: {
            getSessionId: () => 'session-1',
            getSessionData: () => ({ id: 'session-1', role }),
            getRole: () => role,
            getOperatorAuth: () => ({ role }),
            setOperatorAuth: vi.fn(),
            clearOperatorAuth: vi.fn(),
            getUserName: () => 'SME Tester'
        }
    }));
    vi.doMock('../services/database.js', () => ({
        database: {
            requireOperatorGrant: vi.fn().mockResolvedValue({
                role,
                sessionId: 'session-1'
            }),
            fetchPliAdjudications: vi.fn().mockResolvedValue([]),
            fetchSmeHandoffs: vi.fn().mockResolvedValue([])
        }
    }));
    vi.doMock('../services/sync.js', () => ({
        syncService: {
            isInitialized: () => true,
            initialize: vi.fn()
        }
    }));
    vi.doMock('../components/ui/Toast.js', () => ({
        showToast: vi.fn()
    }));
    vi.doMock('../core/navigation.js', () => ({
        navigateToApp: vi.fn()
    }));
    vi.doMock('../features/pli/PliMacroReview.js', () => ({ createPliMacroReview }));
    vi.doMock('../features/pli/NiEscalationReview.js', () => ({ createNiEscalationReview }));
    vi.doMock('../features/pli/DiplomacyInfoReview.js', () => ({ createDiplomacyInfoReview }));
    vi.doMock('../features/pli/SmeHandoffQueue.js', () => ({ createSmeHandoffQueue }));
    vi.doMock('../features/onboarding/followAlong.js', () => ({ mountFollowAlong }));

    const host = { innerHTML: '' };
    const nodes = new Map([
        ['smeQueuePanel', host],
        ['headerTitle', { textContent: '' }],
        ['headerSubtitle', { textContent: '' }],
        ['smeQueueNavLabel', { textContent: '' }],
        ['smeQueueSectionTitle', { textContent: '' }],
        ['smeQueueSectionDescription', { textContent: '' }],
        ['headerSessionMeta', { textContent: '' }],
        ['smeQueueBadge', { textContent: '', hidden: true }]
    ]);
    globalThis.document = {
        readyState: 'complete',
        addEventListener: vi.fn(),
        getElementById: (id) => nodes.get(id) || null
    };

    const mod = await import('./sme.js');
    return {
        ...mod,
        host,
        createPliMacroReview,
        createNiEscalationReview,
        createDiplomacyInfoReview,
        createSmeHandoffQueue,
        mountFollowAlong
    };
}

describe('SME console access state', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        delete globalThis.__ESG_DISABLE_AUTO_INIT__;
        delete globalThis.document;
    });

    it('requires an authorized SME role and session', async () => {
        globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
        const { getSmeAccessState } = await import('./sme.js');

        expect(getSmeAccessState({
            getSessionId: () => null,
            getRole: () => 'sme_econ'
        }).allowed).toBe(false);

        expect(getSmeAccessState({
            getSessionId: () => 'session-1',
            getRole: () => 'whitecell_lead'
        }).allowed).toBe(false);

        const ok = getSmeAccessState({
            getSessionId: () => 'session-1',
            getRole: () => 'sme_ni_escalation'
        });
        expect(ok.allowed).toBe(true);
        expect(ok.smeRole).toBe('ni_escalation');
    });

    it('maps every SME_ROLES value to a queue kind', async () => {
        globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
        const { getSmeQueueKind, SME_QUEUE_KINDS } = await import('./sme.js');

        const roles = Object.values(SME_ROLES);
        expect(roles.length).toBeGreaterThanOrEqual(5);
        expect(Object.keys(SME_QUEUE_KINDS).sort()).toEqual([...roles].sort());
        for (const role of roles) {
            expect(getSmeQueueKind(role)).toBeTruthy();
        }
        expect(getSmeQueueKind('not_a_role')).toBeNull();
    });

    it('calls mountRoleQueue during init after grant verification', async () => {
        const { SmeController } = await loadSmeControllerWithMocks({ role: 'sme_econ' });
        const controller = new SmeController();
        const mountSpy = vi.spyOn(controller, 'mountRoleQueue').mockImplementation(() => {});
        const chromeSpy = vi.spyOn(controller, 'bindChrome').mockImplementation(() => {});
        const loopSpy = vi.spyOn(controller, 'startRefreshLoop').mockImplementation(() => {});

        await controller.init();

        expect(chromeSpy).toHaveBeenCalledTimes(1);
        expect(mountSpy).toHaveBeenCalledTimes(1);
        expect(loopSpy).toHaveBeenCalledTimes(1);
        expect(typeof controller.mountRolePanel).toBe('undefined');
        controller.destroy();
    });

    it.each([
        ['sme_econ', 'createPliMacroReview', null],
        ['sme_ni_escalation', 'createNiEscalationReview', null],
        ['sme_diplomacy_information', 'createDiplomacyInfoReview', null],
        ['sme_tsj', 'createSmeHandoffQueue', 'tsj'],
        ['sme_verba', 'createSmeHandoffQueue', 'verba']
    ])('mounts the %s workflow queue without throwing', async (role, factoryName, handoffSeat) => {
        const loaded = await loadSmeControllerWithMocks({ role });
        const controller = new loaded.SmeController();

        await expect(controller.init()).resolves.toBeUndefined();

        const expectedFactory = loaded[factoryName];
        expect(expectedFactory).toHaveBeenCalledTimes(1);
        expect(expectedFactory.mock.calls[0][0].container).toBe(loaded.host);

        if (handoffSeat) {
            expect(expectedFactory.mock.calls[0][0].seat).toBe(handoffSeat);
        }

        for (const name of [
            'createPliMacroReview',
            'createNiEscalationReview',
            'createDiplomacyInfoReview',
            'createSmeHandoffQueue'
        ]) {
            if (name !== factoryName) {
                expect(loaded[name]).not.toHaveBeenCalled();
            }
        }

        controller.destroy();
    });

    it.each([
        ['sme_econ', 'Macro PLI'],
        ['sme_ni_escalation', 'National Interest'],
        ['sme_diplomacy_information', 'Diplomacy'],
        ['sme_tsj', 'TSJ handoff'],
        ['sme_verba', 'Verba handoff']
    ])('mounts a detailed Start Here guide for %s', async (role, expectedNarrative) => {
        const loaded = await loadSmeControllerWithMocks({ role });
        const controller = new loaded.SmeController();

        await controller.init();

        expect(loaded.mountFollowAlong).toHaveBeenCalledTimes(1);
        const guide = loaded.mountFollowAlong.mock.calls[0][0];
        expect(guide.storageKey).toContain(role.replace('sme_', ''));
        expect(guide.steps).toHaveLength(5);
        expect(`${guide.summary} ${guide.steps.map((step) => `${step.body} ${step.narrative}`).join(' ')}`).toContain(expectedNarrative);
        expect(guide.steps.every((step) => step.narrative)).toBe(true);
        expect(guide.steps[1].action).toEqual({
            label: 'Open SME queue',
            selector: '.sidebar-link[data-section="smeQueue"]'
        });
        controller.destroy();
    });

    it('surfaces a controlled error when the queue host is missing', async () => {
        const loaded = await loadSmeControllerWithMocks({ role: 'sme_econ' });
        const { showToast } = await import('../components/ui/Toast.js');
        globalThis.document.getElementById = () => null;

        const controller = new loaded.SmeController();
        await controller.init();

        expect(showToast).toHaveBeenCalledWith(expect.objectContaining({
            type: 'error',
            message: expect.stringContaining('failed to start')
        }));
        controller.destroy();
    });
});
