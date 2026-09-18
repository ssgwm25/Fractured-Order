import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./database.js', () => ({ database: {} }));
vi.mock('../stores/session.js', () => ({ sessionStore: {} }));
// Only bootstrap is imported: the legacy facilitator controller does not read decks.
import './seatBootstrap.js';
import { clearSeatLocalState } from '../core/seatContext.js';

afterEach(() => vi.unstubAllGlobals());
describe('GC04 shared startup deck cleanup', () => {
    it('registers regional deck deletion even without importing the deck-reading controller', async () => {
        const remove = vi.fn(() => {
            const request = {};
            queueMicrotask(() => request.onsuccess?.());
            return request;
        });
        vi.stubGlobal('indexedDB', { open: vi.fn(() => {
            const request = { result: {
                transaction: () => ({ objectStore: () => ({ delete: remove }) }), close() {}
            } };
            queueMicrotask(() => request.onsuccess?.());
            return request;
        }) });
        clearSeatLocalState({ sessionId: 'fixture', topology: 2, teamId: 'green', delegationId: 'europe',
            role: 'green_europe_scribe', participantId: 'seat' });
        await vi.waitFor(() => expect(remove).toHaveBeenCalledWith('scribe-deck:fixture:green:europe'));
    });
});
