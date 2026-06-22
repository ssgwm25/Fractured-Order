import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    SCRIBE_DECK_STORAGE_TIMEOUT_MS,
    buildUploadedScribeDeckStorageKey,
    getUploadedScribeDeck
} from './deckStorage.js';

const originalIndexedDb = globalThis.indexedDB;

describe('scribe deck storage', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        if (originalIndexedDb) {
            globalThis.indexedDB = originalIndexedDb;
        } else {
            delete globalThis.indexedDB;
        }
    });

    it('builds stable per-session team keys for uploaded decks', () => {
        expect(buildUploadedScribeDeckStorageKey('session-42', 'Blue')).toBe('scribe-deck:session-42:blue');
    });

    it('rejects missing identifiers', () => {
        expect(() => buildUploadedScribeDeckStorageKey('', 'blue')).toThrow(
            'Uploaded scribe decks require both a session ID and team ID.'
        );
        expect(() => buildUploadedScribeDeckStorageKey('session-42', '')).toThrow(
            'Uploaded scribe decks require both a session ID and team ID.'
        );
    });

    it('rejects when uploaded deck storage never opens', async () => {
        vi.useFakeTimers();

        globalThis.indexedDB = {
            open: vi.fn(() => ({}))
        };

        const lookupPromise = getUploadedScribeDeck('scribe-deck:session-42:blue');
        const rejectionAssertion = expect(lookupPromise).rejects.toThrow(
            'Uploaded scribe deck browser storage timed out while opening storage.'
        );

        await vi.advanceTimersByTimeAsync(SCRIBE_DECK_STORAGE_TIMEOUT_MS);

        await rejectionAssertion;
    });

    it('rejects and closes the database when an uploaded deck request never settles', async () => {
        vi.useFakeTimers();

        const openRequest = {};
        const storageRequest = {};
        const abort = vi.fn();
        const close = vi.fn();
        const get = vi.fn(() => storageRequest);
        const transaction = {
            abort,
            objectStore: vi.fn(() => ({ get }))
        };
        const database = {
            close,
            transaction: vi.fn(() => transaction)
        };

        globalThis.indexedDB = {
            open: vi.fn(() => openRequest)
        };

        const lookupPromise = getUploadedScribeDeck('scribe-deck:session-42:blue');
        openRequest.result = database;
        openRequest.onsuccess();
        await Promise.resolve();
        const rejectionAssertion = expect(lookupPromise).rejects.toThrow(
            'Uploaded scribe deck browser storage timed out while reading or writing storage.'
        );

        await vi.advanceTimersByTimeAsync(SCRIBE_DECK_STORAGE_TIMEOUT_MS);

        await rejectionAssertion;
        expect(get).toHaveBeenCalledWith('scribe-deck:session-42:blue');
        expect(abort).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(1);
    });
});
