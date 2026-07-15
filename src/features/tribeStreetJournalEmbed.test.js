import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { createTribeStreetJournalEmbedMarkup } from './tribeStreetJournalEmbed.js';

const APP_LAYOUT_CSS_PATH = new URL('../../styles/layouts/app-layout.css', import.meta.url);

describe('Tribe Street Journal embed', () => {
    it('fills the journal viewport without a padded card wrapper', () => {
        const markup = createTribeStreetJournalEmbedMarkup({
            title: 'Blue Team Tribe Street Journal live site'
        });

        expect(markup).toContain('class="tribe-street-journal-embed"');
        expect(markup).toContain('class="tribe-street-journal-embed-viewport"');
        expect(markup).toContain('class="tribe-street-journal-embed-frame"');
        expect(markup).toContain('title="Blue Team Tribe Street Journal live site"');
        expect(markup).toContain('Open in new tab');
        expect(markup).not.toContain('class="card card-bordered"');
        expect(markup).not.toContain('min-height: 640px');

        const layoutCss = readFileSync(APP_LAYOUT_CSS_PATH, 'utf8');
        const frameRule = layoutCss.match(/\.tribe-street-journal-embed-frame\s*\{(?<rule>[^}]+)\}/)?.groups?.rule || '';

        expect(frameRule).toContain('width: 100%');
        expect(frameRule).toContain('height: 100%');
        expect(frameRule).toContain('min-height: calc(100dvh');
    });
});
