import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { database, sessionStore } = vi.hoisted(() => ({
    database: { restoreSessionSeatContext: vi.fn() },
    sessionStore: { getSessionId: vi.fn(() => 'session'), getSessionParticipantId: vi.fn(() => 'seat'), confirmSeat: vi.fn() }
}));
vi.mock('./database.js', () => ({ database }));
vi.mock('../stores/session.js', () => ({ sessionStore }));
let restoreConfirmedSeat;

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe.each(['/', '/Fractured-Order/'])('GC-04 startup and rejoin under %s', (basePath) => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Navigation captures Vite's base at import time. Test both deployment shapes
        // independently of the developer shell or GitHub Actions environment.
        vi.resetModules();
        vi.stubEnv('BASE_URL', basePath);
        ({ restoreConfirmedSeat } = await import('./seatBootstrap.js'));
        database.restoreSessionSeatContext.mockResolvedValue({
            session: { id: 'session', name: 'Fixture', status: 'active', session_topology_version: 2 },
            seat: { id: 'seat', session_id: 'session', role: 'green_europe_scribe', delegation_id: 'europe', is_active: true }
        });
    });
    it('restores identity from the server seat on reload with no URL region', async () => {
        const locationRef = new URL(`https://example.test${basePath}teams/green/facilitator.html`);
        await expect(restoreConfirmedSeat({ locationRef })).resolves.toMatchObject({ role: 'green_europe_scribe', delegationId: 'europe' });
        expect(database.restoreSessionSeatContext).toHaveBeenCalledWith('session', 'seat');
        expect(sessionStore.confirmSeat).toHaveBeenCalledOnce();
    });
    it('uses server identity on resume rather than a stale cached role', async () => {
        await restoreConfirmedSeat({ checkRoute: false, locationRef: new URL('https://example.test/') });
        expect(sessionStore.confirmSeat).toHaveBeenCalledWith(expect.objectContaining({ role: 'green_europe_scribe' }));
    });
    it('GC04A restores the shared model on reload and rejects a forged owning delegation', async () => {
        database.restoreSessionSeatContext.mockResolvedValue({
            session: { id: 'session', status: 'active', session_topology_version: 2, green_seat_model: 'shared_facilitator_v1' },
            seat: { id: 'seat', session_id: 'session', role: 'green_shared_facilitator', delegation_id: null, is_active: true }
        });
        const locationRef = new URL(`https://example.test${basePath}teams/green/scribe.html`);
        await expect(restoreConfirmedSeat({ locationRef })).resolves.toMatchObject({
            role: 'green_shared_facilitator', greenSeatModel: 'shared_facilitator_v1', delegationId: null
        });
        sessionStore.confirmSeat.mockClear();
        locationRef.search = '?delegation=europe';
        await expect(restoreConfirmedSeat({ locationRef })).rejects.toThrow('Permission error');
        expect(sessionStore.confirmSeat).not.toHaveBeenCalled();
    });
    it('rejects mismatched deep links before confirming or rendering a workspace', async () => {
        const locationRef = new URL(`https://example.test${basePath}teams/green/facilitator.html?delegation=asian_pacific`);
        await expect(restoreConfirmedSeat({ locationRef })).rejects.toThrow('Permission error');
        expect(sessionStore.confirmSeat).not.toHaveBeenCalled();
    });
    it('rejects a different base path even when role and delegation match', async () => {
        const wrongBase = basePath === '/' ? '/Fractured-Order/' : '/';
        const locationRef = new URL(`https://example.test${wrongBase}teams/green/facilitator.html?delegation=europe`);
        await expect(restoreConfirmedSeat({ locationRef })).rejects.toThrow('Permission error');
        expect(sessionStore.confirmSeat).not.toHaveBeenCalled();
    });
    it('propagates revoked-seat or network failure without a local fallback', async () => {
        database.restoreSessionSeatContext.mockRejectedValue(new Error('GC04_INVALID_SESSION_SEAT'));
        await expect(restoreConfirmedSeat({ checkRoute: false, locationRef: null })).rejects.toThrow('GC04_INVALID_SESSION_SEAT');
        expect(sessionStore.confirmSeat).not.toHaveBeenCalled();
    });
    it('discards an in-flight restore after logout', async () => {
        sessionStore.getSessionId.mockReturnValueOnce('session').mockReturnValueOnce(null);
        await expect(restoreConfirmedSeat({ checkRoute: false, locationRef: null })).rejects.toThrow('Session changed');
        expect(sessionStore.confirmSeat).not.toHaveBeenCalled();
    });
});
