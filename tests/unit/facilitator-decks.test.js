import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const ROOT_URL = new URL('../../', import.meta.url);
const FACILITATOR_DECKS = [
    'decks/blue/fractured-order-facilitator-deck.html',
    'decks/green/fractured-order-facilitator-deck.html',
    'decks/green/fractured-order-green-facilitator-deck.html',
    'decks/industry/fractured-order-facilitator-deck.html',
    'decks/industry/fractured-order-industry-facilitator-deck.html',
    'decks/red/fractured-order-facilitator-deck.html',
    'decks/red/fractured-order-red-facilitator-deck.html'
];

describe('facilitator deck schedules', () => {
    it.each(FACILITATOR_DECKS)('omits the Introductions slide from %s', (relativePath) => {
        const html = readFileSync(new URL(relativePath, ROOT_URL), 'utf8');

        expect(html).not.toContain('data-title="Introductions"');
        expect(html).not.toContain('"title": "Introductions"');
    });
});
