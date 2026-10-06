import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const APP_HTML_FILES = [
    'index.html',
    'master.html',
    'sme.html',
    'whitecell.html',
    ...['blue', 'green', 'industry', 'red'].flatMap((team) => [
        `teams/${team}/facilitator.html`,
        `teams/${team}/notetaker.html`,
        `teams/${team}/scribe.html`
    ])
];

const FONT_STYLESHEET_PREFIX = 'https://fonts.googleapis.com/css2?family=';

function readRepoFile(filePath) {
    return readFileSync(resolve(process.cwd(), filePath), 'utf8');
}

describe('shared font loading', () => {
    it('keeps external font loading out of bundled component CSS', () => {
        expect(readRepoFile('styles/base/variables.css')).not.toContain('@import');
    });

    it.each(APP_HTML_FILES)('loads fonts explicitly before shared CSS in %s', (filePath) => {
        const html = readRepoFile(filePath);
        const fontStylesheetIndex = html.indexOf(FONT_STYLESHEET_PREFIX);
        const sharedVariablesIndex = html.indexOf('styles/base/variables.css');

        expect(fontStylesheetIndex).toBeGreaterThan(-1);
        expect(sharedVariablesIndex).toBeGreaterThan(-1);
        expect(fontStylesheetIndex).toBeLessThan(sharedVariablesIndex);
    });
});
