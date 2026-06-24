import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const ROOT_URL = new URL('../../', import.meta.url);

function readText(relativePath) {
    return readFileSync(new URL(relativePath, ROOT_URL), 'utf8');
}

describe('site favicon', () => {
    it('uses the Fractured Order icon asset as the browser favicon', () => {
        const landingHtml = readText('index.html');

        expect(landingHtml).toContain('<link rel="icon" type="image/x-icon" href="./src/img/FO_icon.ico">');
        expect(existsSync(new URL('src/img/FO_icon.ico', ROOT_URL))).toBe(true);
    });
});
