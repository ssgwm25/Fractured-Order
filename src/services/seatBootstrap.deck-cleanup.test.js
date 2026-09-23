import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./database.js', () => ({ database: {} }));
vi.mock('../stores/session.js', () => ({ sessionStore: {} }));
// Only bootstrap is imported: the legacy facilitator controller does not read decks.
import './seatBootstrap.js';
import { clearSeatLocalState } from '../core/seatContext.js';

afterEach(() => vi.unstubAllGlobals());

function installDeckStore(initialKeys) {
    const stored = new Set(initialKeys);
    const remove = vi.fn((key) => {
        const request = {};
        queueMicrotask(() => {
            stored.delete(key);
            request.onsuccess?.();
        });
        return request;
    });
    vi.stubGlobal('indexedDB', { open: vi.fn(() => {
        const request = { result: {
            transaction: () => ({ objectStore: () => ({ delete: remove }) }), close() {}
        } };
        queueMicrotask(() => request.onsuccess?.());
        return request;
    }) });
    return { remove, stored };
}

describe('uploaded deck startup cleanup', () => {
    it('registers regional deck deletion even without importing the deck-reading controller', async () => {
        const { remove } = installDeckStore(['scribe-deck:fixture:green:europe']);
        clearSeatLocalState({ sessionId: 'fixture', topology: 2, teamId: 'green', delegationId: 'europe',
            role: 'green_europe_scribe', participantId: 'seat' });
        await vi.waitFor(() => expect(remove).toHaveBeenCalledWith('scribe-deck:fixture:green:europe'));
    });

    it('deletes only a removed unified Green Facilitator deck and retains unrelated uploaded decks', async () => {
        const ownedKey = 'scribe-deck:unified-session:green';
        const unrelatedKeys = [
            'scribe-deck:other-session:green',
            'scribe-deck:unified-session:green:europe',
            'scribe-deck:unified-session:blue'
        ];
        const { remove, stored } = installDeckStore([ownedKey, ...unrelatedKeys]);

        clearSeatLocalState({
            sessionId: 'unified-session', topology: 1, greenSeatModel: 'unified_v1',
            teamId: 'green', delegationId: null, role: 'green_scribe', participantId: 'unified-seat'
        });

        await vi.waitFor(() => {
            expect(remove).toHaveBeenCalledTimes(1);
            expect(stored.has(ownedKey)).toBe(false);
        });
        expect(remove).toHaveBeenCalledWith(ownedKey);
        expect(unrelatedKeys.every((key) => stored.has(key))).toBe(true);
    });

    it('does not delete the unified Facilitator deck when a different unified seat is removed', async () => {
        const ownedByFacilitator = 'scribe-deck:unified-session:green';
        const { remove, stored } = installDeckStore([ownedByFacilitator]);

        clearSeatLocalState({
            sessionId: 'unified-session', topology: 1, greenSeatModel: 'unified_v1',
            teamId: 'green', delegationId: null, role: 'green_facilitator', participantId: 'scribe-seat'
        });

        await Promise.resolve();
        expect(remove).not.toHaveBeenCalled();
        expect(stored.has(ownedByFacilitator)).toBe(true);
    });
});
