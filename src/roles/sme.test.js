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
});
