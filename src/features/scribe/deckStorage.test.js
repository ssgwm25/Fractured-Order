import { describe, expect, it } from 'vitest';

import { buildUploadedScribeDeckStorageKey } from './deckStorage.js';

describe('scribe deck storage', () => {
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
});
