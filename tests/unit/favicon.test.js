import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const ROOT_URL = new URL('../../', import.meta.url);
const TOP_LEVEL_FAVICON = '<link rel="icon" type="image/x-icon" href="./src/img/FO_icon.ico">';
const NESTED_FAVICON = '<link rel="icon" type="image/x-icon" href="../../src/img/FO_icon.ico">';
const PLATFORM_HTML_FAVICON_TARGETS = [
    ['index.html', TOP_LEVEL_FAVICON],
    ['master.html', TOP_LEVEL_FAVICON],
    ['whitecell.html', TOP_LEVEL_FAVICON],
    ['teams/blue/facilitator.html', NESTED_FAVICON],
    ['teams/blue/notetaker.html', NESTED_FAVICON],
    ['teams/blue/scribe.html', NESTED_FAVICON],
    ['teams/green/facilitator.html', NESTED_FAVICON],
    ['teams/green/notetaker.html', NESTED_FAVICON],
    ['teams/green/scribe.html', NESTED_FAVICON],
    ['teams/red/facilitator.html', NESTED_FAVICON],
    ['teams/red/notetaker.html', NESTED_FAVICON],
    ['teams/red/scribe.html', NESTED_FAVICON],
    ['decks/blue/fractured-order-facilitator-deck.html', NESTED_FAVICON],
    ['decks/green/fractured-order-facilitator-deck.html', NESTED_FAVICON],
    ['decks/green/fractured-order-green-facilitator-deck.html', NESTED_FAVICON],
    ['decks/red/fractured-order-facilitator-deck.html', NESTED_FAVICON],
    ['decks/red/fractured-order-red-facilitator-deck.html', NESTED_FAVICON]
];

function readText(relativePath) {
    return readFileSync(new URL(relativePath, ROOT_URL), 'utf8');
}

describe('site favicon', () => {
    it('uses the Fractured Order icon asset as the browser favicon across platform entry points', () => {
        expect(existsSync(new URL('src/img/FO_icon.ico', ROOT_URL))).toBe(true);

        for (const [relativePath, expectedFavicon] of PLATFORM_HTML_FAVICON_TARGETS) {
            expect(readText(relativePath)).toContain(expectedFavicon);
        }
    });
});
