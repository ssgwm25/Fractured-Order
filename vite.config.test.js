import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import viteConfig from './vite.config.js';

const EXPECTED_INPUTS = Object.freeze({
    main: 'index.html',
    master: 'master.html',
    whitecell: 'whitecell.html',
    blueFacilitatorDeck: 'decks/blue/fractured-order-facilitator-deck.html',
    blueFacilitator: 'teams/blue/facilitator.html',
    blueScribe: 'teams/blue/scribe.html',
    blueNotetaker: 'teams/blue/notetaker.html',
    redFacilitatorDeck: 'decks/red/fractured-order-facilitator-deck.html',
    redFacilitator: 'teams/red/facilitator.html',
    redScribe: 'teams/red/scribe.html',
    redNotetaker: 'teams/red/notetaker.html',
    greenFacilitatorDeck: 'decks/green/fractured-order-facilitator-deck.html',
    greenFacilitator: 'teams/green/facilitator.html',
    greenScribe: 'teams/green/scribe.html',
    greenNotetaker: 'teams/green/notetaker.html'
});

describe('vite multi-page entries', () => {
    it('includes every shipped Plenum role surface and deck in the build graph', async () => {
        const config = await viteConfig({ mode: 'test' });
        const inputs = config.build?.rollupOptions?.input || {};

        expect(Object.keys(inputs).sort()).toEqual(Object.keys(EXPECTED_INPUTS).sort());

        for (const [entryName, relativePath] of Object.entries(EXPECTED_INPUTS)) {
            expect(inputs[entryName].replace(/\\/g, '/')).toMatch(new RegExp(`/${relativePath.replace(/\//g, '\\/')}$`));
            expect(existsSync(inputs[entryName])).toBe(true);
        }
    });

    it('does not publish source maps in production Pages builds', async () => {
        const productionConfig = await viteConfig({ mode: 'production' });
        const testConfig = await viteConfig({ mode: 'test' });

        expect(productionConfig.build?.sourcemap).toBe(false);
        expect(testConfig.build?.sourcemap).toBe(true);
    });
});
