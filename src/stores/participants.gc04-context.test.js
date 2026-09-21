import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { database, sessionStore, restoreConfirmedSeat } = vi.hoisted(() => ({
    database: { updateHeartbeat: vi.fn(), disconnectParticipantKeepalive: vi.fn() },
    sessionStore: { getConfirmedSeat: vi.fn(), invalidateSeat: vi.fn(), notify: vi.fn() },
    restoreConfirmedSeat: vi.fn()
}));
vi.mock('../services/database.js', () => ({ database }));
vi.mock('../services/seatBootstrap.js', () => ({ restoreConfirmedSeat }));
vi.mock('./session.js', () => ({ sessionStore }));
vi.mock('../utils/logger.js', () => ({ createLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }));
vi.mock('../core/config.js', () => ({ CONFIG: {}, getRoleLimit: () => 1, isHeartbeatFresh: () => true }));
import { participantsStore } from './participants.js';

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('navigator', { onLine: true });
    participantsStore.sessionId = 'session';
    participantsStore.currentParticipantId = 'seat';
});
afterEach(() => { participantsStore.reset(); vi.unstubAllGlobals(); });

it('retains the legacy unified White Cell pagehide disconnect', () => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    sessionStore.getConfirmedSeat.mockReturnValue({ participantId: 'seat', role: 'whitecell_lead', topology: 1 });
    participantsStore.bindPagehideKeepalive();
    participantsStore.pagehideHandler();
    expect(database.disconnectParticipantKeepalive).toHaveBeenCalledWith('session', 'seat');
});

describe.each([['green_europe_scribe', 'europe'], ['green_shared_facilitator', null],
    ['whitecell_lead', null], ['whitecell_support', null]])('GC04/04A/07 heartbeat: %s', (role, delegation) => {
    beforeEach(() => {
        sessionStore.getConfirmedSeat.mockReturnValue({ participantId: 'seat', role, delegationId: delegation, topology: 2 });
    });
    it('preserves the confirmed regional lease during page navigation', () => {
        vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
        participantsStore.bindPagehideKeepalive();
        participantsStore.pagehideHandler();
        expect(database.disconnectParticipantKeepalive).not.toHaveBeenCalled();
    });
    it('pauses offline heartbeats without discarding rejoin context or renewing the lease', async () => {
        navigator.onLine = false;
        await participantsStore.sendHeartbeat();
        expect(database.updateHeartbeat).not.toHaveBeenCalled();
        expect(sessionStore.invalidateSeat).not.toHaveBeenCalled();
    });
    it('retains rejoin context when an in-flight heartbeat fails as the browser goes offline', async () => {
        database.updateHeartbeat.mockImplementation(async () => {
            navigator.onLine = false;
            throw { originalError: { code: '', message: 'TypeError: Failed to fetch' } };
        });
        await participantsStore.sendHeartbeat();
        expect(database.updateHeartbeat).toHaveBeenCalledWith('session', 'seat');
        expect(sessionStore.invalidateSeat).not.toHaveBeenCalled();
    });
    it('honors a server permission denial even if connectivity changes before it arrives', async () => {
        database.updateHeartbeat.mockImplementation(async () => {
            navigator.onLine = false;
            throw { originalError: { code: '42501', message: 'GC03_SEAT_REJOIN_REQUIRED' } };
        });
        await participantsStore.sendHeartbeat();
        expect(sessionStore.invalidateSeat).toHaveBeenCalledOnce();
        expect(sessionStore.notify).toHaveBeenCalledOnce();
    });
    it('fails closed for online heartbeat errors', async () => {
        database.updateHeartbeat.mockRejectedValue(new Error('Server unavailable'));
        await participantsStore.sendHeartbeat();
        expect(sessionStore.invalidateSeat).toHaveBeenCalledOnce();
    });
    it('revalidates an expired lease on the server before retrying the heartbeat once', async () => {
        database.updateHeartbeat.mockRejectedValueOnce({ originalError: { code: '42501', message: 'GC03_SEAT_REJOIN_REQUIRED' } })
            .mockResolvedValueOnce({ id: 'seat', role, delegation_id: delegation });
        restoreConfirmedSeat.mockResolvedValue({ participantId: 'seat' });
        await participantsStore.sendHeartbeat();
        expect(restoreConfirmedSeat).toHaveBeenCalledWith({ checkRoute: false });
        expect(restoreConfirmedSeat.mock.invocationCallOrder[0]).toBeLessThan(database.updateHeartbeat.mock.invocationCallOrder[1]);
        expect(database.updateHeartbeat).toHaveBeenCalledTimes(2);
        expect(sessionStore.invalidateSeat).not.toHaveBeenCalled();
    });
    it('clears a replaced or revoked seat when server rejoin fails', async () => {
        database.updateHeartbeat.mockRejectedValue({ originalError: { code: '42501', message: 'GC03_SEAT_REJOIN_REQUIRED' } });
        restoreConfirmedSeat.mockRejectedValue(new Error('GC04_INVALID_SESSION_SEAT'));
        await participantsStore.sendHeartbeat();
        expect(database.updateHeartbeat).toHaveBeenCalledOnce();
        expect(sessionStore.invalidateSeat).toHaveBeenCalledOnce();
    });
});
