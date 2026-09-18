import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { makeManifest } from '../../scripts/gc03-hosted-check.mjs';
import { ACTORS } from '../../scripts/gc03-completion-sql.mjs';
import { validateAuthResume, provisionActor } from '../../scripts/gc03-auth-resume.mjs';

const savedUser = () => ({ id: randomUUID(), access_token: 'saved-access', refresh_token: 'saved-refresh' });
const serverResult = (id, runId) => ({ data: {
    user: { id, is_anonymous: true, user_metadata: { gc03_test_run: runId } },
    session: { access_token: 'new-access', refresh_token: 'rotated-refresh' }
}, error: null });
const fixture = () => {
    const m = { ...makeManifest('gsromgrxgrwwfywaoyme'), legacy: randomUUID() };
    return { m, state: { run: m.run, users: { apS: savedUser() } }, report: {
        run: m.run, projectRef: m.projectRef, failure: 'FAIL: anonymous Auth outsider: Request rate limit reached',
        requests: [{ label: 'deployed-authorization-inventory' }], matrixPassed: false, cleanupPassed: false
    } };
};

describe('GC03 interrupted Auth provisioning recovery (offline)', () => {
    it('accepts only matching Auth-only failures and distinct saved identities', () => {
        const { m, state, report } = fixture();
        expect(() => validateAuthResume(report, m, state)).not.toThrow();
        for (const patch of [{ setupAttempted: true }, { matrixPassed: true }, { cleanupPassed: true },
            { failure: 'FAIL: recipient approval' }, { run: randomUUID() }, { projectRef: 'a'.repeat(20) },
            { requests: [{ label: 'setup' }] }, { requests: [{ path: '/rest/v1/actions' }] }]) {
            expect(() => validateAuthResume({ ...report, ...patch }, m, state)).toThrow();
        }
        expect(() => validateAuthResume(report, m, { ...state, users: { apS: state.users.apS, euS: state.users.apS } })).toThrow('distinct');
    });
    it('refreshes ten existing identities and signs up only the missing actor, checkpointing each token', async () => {
        const runId = randomUUID(), users = Object.fromEntries(ACTORS.slice(0, -1).map(who => [who, savedUser()]));
        const original = structuredClone(users), refreshes = [], signups = [], snapshots = [];
        for (const who of ACTORS) {
            const id = users[who]?.id || randomUUID();
            const action = await provisionActor({ who, runId, users, protect: () => {},
                persist: async () => snapshots.push(structuredClone(users)), auth: {
                    refreshSession: async args => { refreshes.push(args); return serverResult(id, runId); },
                    signInAnonymously: async args => { signups.push(args); return serverResult(id, runId); }
                } });
            expect(action).toBe(who === 'outsider' ? 'created' : 'refreshed');
        }
        expect(refreshes).toHaveLength(10); expect(signups).toHaveLength(1);
        expect(signups[0].options.data.gc03_test_run).toBe(runId);
        expect(snapshots).toHaveLength(11);
        expect(snapshots[0].apS.refresh_token).toBe('rotated-refresh');
        for (const who of Object.keys(original)) expect(users[who].id).toBe(original[who].id);
        expect(new Set(Object.values(users).map(u => u.id)).size).toBe(11);
    });
    it('does not replace an existing identity when its refresh fails', async () => {
        const users = { apS: savedUser() }, before = structuredClone(users), signup = vi.fn(), persist = vi.fn();
        await expect(provisionActor({ who: 'apS', runId: randomUUID(), users, persist, protect: () => {},
            auth: { refreshSession: async () => ({ data: {}, error: { message: 'Refresh expired', status: 401 } }), signInAnonymously: signup }
        })).rejects.toThrow('anonymous Auth apS: Refresh expired');
        expect(signup).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled(); expect(users).toEqual(before);
    });
    it('stops on a rate limit without retrying or discarding saved actors', async () => {
        const users = { apS: savedUser() }, before = structuredClone(users), persist = vi.fn();
        const signup = vi.fn(async () => ({ data: {}, error: { status: 429, message: 'Request rate limit reached' } }));
        await expect(provisionActor({ who: 'outsider', runId: randomUUID(), users, persist, protect: () => {},
            auth: { signInAnonymously: signup } })).rejects.toThrow('anonymous Auth outsider: Request rate limit reached');
        expect(signup).toHaveBeenCalledTimes(1); expect(persist).not.toHaveBeenCalled(); expect(users).toEqual(before);
    });
    it('rejects a refreshed identity with mismatched user ID or run provenance', async () => {
        for (const mismatch of ['id', 'run', 'anonymous']) {
            const users = { apS: savedUser() }, runId = randomUUID(), persist = vi.fn();
            const response = serverResult(users.apS.id, runId);
            if (mismatch === 'id') response.data.user.id = randomUUID();
            if (mismatch === 'run') response.data.user.user_metadata.gc03_test_run = randomUUID();
            if (mismatch === 'anonymous') response.data.user.is_anonymous = false;
            await expect(provisionActor({ who: 'apS', runId, users, persist, protect: () => {},
                auth: { refreshSession: async () => response } })).rejects.toThrow('server identity/provenance mismatch');
            expect(persist).not.toHaveBeenCalled();
        }
    });
});
