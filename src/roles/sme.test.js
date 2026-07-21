import { afterEach, describe, expect, it, vi } from 'vitest';

describe('SME console access state', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        delete globalThis.__ESG_DISABLE_AUTO_INIT__;
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

    it('calls mountRoleQueue during init after grant verification', async () => {
        globalThis.__ESG_DISABLE_AUTO_INIT__ = true;

        vi.doMock('../stores/session.js', () => ({
            sessionStore: {
                getSessionId: () => 'session-1',
                getSessionData: () => ({ id: 'session-1', role: 'sme_econ' }),
                getRole: () => 'sme_econ',
                getOperatorAuth: () => ({ role: 'sme_econ' }),
                setOperatorAuth: vi.fn(),
                clearOperatorAuth: vi.fn(),
                getUserName: () => 'Econ SME'
            }
        }));
        vi.doMock('../services/database.js', () => ({
            database: {
                requireOperatorGrant: vi.fn().mockResolvedValue({
                    role: 'sme_econ',
                    sessionId: 'session-1'
                })
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

        const { SmeController } = await import('./sme.js');
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
});
