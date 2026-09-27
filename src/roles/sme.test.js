import { readFileSync } from 'node:fs';
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
    const createSmePliPacketQueue = factories.createSmePliPacketQueue
        || vi.fn(() => ({ refresh: vi.fn(), destroy: vi.fn() }));

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
            fetchSmeHandoffs: vi.fn().mockResolvedValue([]),
            fetchSmePliPackets: vi.fn().mockResolvedValue([])
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
    const mountFollowAlong = vi.fn(() => ({ destroy: vi.fn() }));
    vi.doMock('../features/onboarding/followAlong.js', () => ({ mountFollowAlong }));
    vi.doMock('../features/pli/PliMacroReview.js', () => ({ createPliMacroReview }));
    vi.doMock('../features/pli/NiEscalationReview.js', () => ({ createNiEscalationReview }));
    vi.doMock('../features/pli/DiplomacyInfoReview.js', () => ({ createDiplomacyInfoReview }));
    vi.doMock('../features/pli/SmeHandoffQueue.js', () => ({ createSmeHandoffQueue }));
    vi.doMock('../features/pli/SmePliPacketQueue.js', () => ({ createSmePliPacketQueue }));
    const unsubscribePliSmeChanges = vi.fn();
    const subscribePliSmeChanges = factories.subscribePliSmeChanges
        || vi.fn(() => unsubscribePliSmeChanges);
    vi.doMock('../features/pli/pliRealtime.js', () => ({ subscribePliSmeChanges }));

    const host = { innerHTML: '' };
    const packetHost = { innerHTML: '' };
    const nodes = new Map([
        ['smeQueuePanel', host],
        ['smePliPacketsPanel', packetHost],
        ['smePliPacketsNavItem', { hidden: true }],
        ['smePliPacketsSectionTitle', { textContent: '' }],
        ['smePliPacketsSectionDescription', { textContent: '' }],
        ['smePliPacketsBadge', { textContent: '', hidden: true }],
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
        createSmePliPacketQueue,
        packetHost,
        mountFollowAlong,
        subscribePliSmeChanges,
        unsubscribePliSmeChanges
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

    it.each([
        [SME_ROLES.ECON, 'Macro'],
        [SME_ROLES.NI_ESCALATION, 'six domains'],
        [SME_ROLES.DIPLOMACY_INFORMATION, 'paired outputs'],
        [SME_ROLES.TSJ, 'Tribe Street Journal'],
        [SME_ROLES.VERBA, 'Verba']
    ])('provides role-scoped Start Here content for %s', async (role, expectedCopy) => {
        globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
        const { getSmeOnboardingContent } = await import('./sme.js');

        const content = getSmeOnboardingContent(role);

        expect(content.roleLabel).toBeTruthy();
        expect([content.summary, content.queueBody, content.queueNarrative].join(' ')).toContain(expectedCopy);
        expect(content.controlsBody).toBeTruthy();
        expect(content.controlsNarrative).toBeTruthy();
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
        expect(controller.onboarding).toBeTruthy();
        expect(loopSpy).toHaveBeenCalledTimes(1);
        expect(typeof controller.mountRolePanel).toBe('undefined');
        controller.destroy();
    });

    it('subscribes to PLI realtime for the session, refreshes on change, and unsubscribes on destroy', async () => {
        const loaded = await loadSmeControllerWithMocks({ role: 'sme_econ' });
        const controller = new loaded.SmeController();
        vi.spyOn(controller, 'startRefreshLoop').mockImplementation(() => {});

        await controller.init();

        expect(loaded.subscribePliSmeChanges).toHaveBeenCalledTimes(1);
        const options = loaded.subscribePliSmeChanges.mock.calls[0][0];
        expect(options.sessionId).toBe('session-1');
        expect(typeof options.onChange).toBe('function');

        const refreshSpy = vi.spyOn(controller, 'refreshQueue').mockImplementation(() => {});
        options.onChange({ tables: ['pli_adjudications'], events: 3 });
        expect(refreshSpy).toHaveBeenCalledTimes(1);

        controller.destroy();
        expect(loaded.unsubscribePliSmeChanges).toHaveBeenCalledTimes(1);
        controller.destroy();
        expect(loaded.unsubscribePliSmeChanges).toHaveBeenCalledTimes(1);
    });

    it('polls the queue every 20 seconds as the realtime fallback', async () => {
        vi.useFakeTimers();
        try {
            const loaded = await loadSmeControllerWithMocks({ role: 'sme_econ' });
            expect(loaded.SME_QUEUE_POLL_MS).toBe(20000);
            const controller = new loaded.SmeController();
            const refreshSpy = vi.spyOn(controller, 'refreshQueue').mockImplementation(() => {});

            controller.startRefreshLoop();
            vi.advanceTimersByTime(19999);
            expect(refreshSpy).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1);
            expect(refreshSpy).toHaveBeenCalledTimes(1);

            controller.destroy();
            vi.advanceTimersByTime(60000);
            expect(refreshSpy).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
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
        expect(loaded.mountFollowAlong).toHaveBeenCalledWith(expect.objectContaining({
            storageKey: expect.stringContaining('followalong:sme:'),
            roleLabel: expect.any(String),
            summary: expect.any(String),
            steps: expect.any(Array)
        }));

        if (handoffSeat) {
            expect(expectedFactory.mock.calls[0][0].seat).toBe(handoffSeat);
            expect(loaded.createSmePliPacketQueue).toHaveBeenCalledTimes(1);
            expect(loaded.createSmePliPacketQueue.mock.calls[0][0].seat).toBe(handoffSeat);
            expect(loaded.createSmePliPacketQueue.mock.calls[0][0].container).toBe(loaded.packetHost);
        } else {
            expect(loaded.createSmePliPacketQueue).not.toHaveBeenCalled();
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

    it('ships Action handoffs and Approved PLI hosts in sme.html', () => {
        const html = readFileSync(new URL('../../sme.html', import.meta.url), 'utf8');
        expect(html).toContain('id="smeQueuePanel"');
        expect(html).toContain('id="smePliPacketsPanel"');
        expect(html).toContain('id="smePliPacketsNavItem"');
        expect(html).toContain('Approved PLI');
    });

    it('surfaces a controlled error when the Approved PLI host is missing for TSJ', async () => {
        const loaded = await loadSmeControllerWithMocks({ role: 'sme_tsj' });
        const { showToast } = await import('../components/ui/Toast.js');
        const originalGet = globalThis.document.getElementById;
        globalThis.document.getElementById = (id) => (
            id === 'smePliPacketsPanel' ? null : originalGet(id)
        );

        const controller = new loaded.SmeController();
        await controller.init();

        expect(showToast).toHaveBeenCalledWith(expect.objectContaining({
            type: 'error',
            message: expect.stringContaining('failed to start')
        }));
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
