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

describe('facilitator deck front-slide dates', () => {
    it.each(FACILITATOR_DECKS)('dates the front slide July 24, 2026 in %s', (relativePath) => {
        const html = readFileSync(new URL(relativePath, ROOT_URL), 'utf8');
        const imageDeckMatch = html.match(/^  const SLIDES = (\[.*\]);$/m);

        if (imageDeckMatch) {
            const [frontSlide] = JSON.parse(imageDeckMatch[1]);
            const encodedSvg = frontSlide.src.replace('data:image/svg+xml;base64,', '');
            const frontSlideSvg = Buffer.from(encodedSvg, 'base64').toString('utf8');

            expect(frontSlide.title).toContain('July 24, 2026');
            expect(frontSlide.src).toMatch(/^data:image\/svg\+xml;base64,/);
            expect(frontSlideSvg).toContain('July 24, 2026');
            expect(frontSlideSvg).toContain('7/24/2026');
            return;
        }

        const frontSlide = html.match(/<section class="slide title"[\s\S]*?<\/section>/)?.[0];

        expect(frontSlide).toContain(
            '<time class="deck-date" datetime="2026-07-24">July 24, 2026</time>'
        );
    });
});
