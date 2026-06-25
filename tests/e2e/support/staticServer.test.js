import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    normalizeBasePath,
    resolveFilePath,
    stripBasePathFromRequestPath
} from './staticServer.mjs';

describe('static E2E server base-path routing', () => {
    it('normalizes hosted public base paths', () => {
        expect(normalizeBasePath('Fractured-Order')).toBe('/Fractured-Order/');
        expect(normalizeBasePath('/Fractured-Order')).toBe('/Fractured-Order/');
        expect(normalizeBasePath('/Fractured-Order/')).toBe('/Fractured-Order/');
        expect(normalizeBasePath('https://ssgwm25.github.io/Fractured-Order/')).toBe('/Fractured-Order/');
    });

    it('strips the configured public base prefix before resolving dist files', () => {
        expect(stripBasePathFromRequestPath('/Fractured-Order/assets/main.js', '/Fractured-Order/'))
            .toBe('/assets/main.js');
        expect(stripBasePathFromRequestPath('/Fractured-Order/whitecell.html', '/Fractured-Order/'))
            .toBe('/whitecell.html');
        expect(stripBasePathFromRequestPath('/whitecell.html', '/Fractured-Order/'))
            .toBe('/whitecell.html');
    });

    it('maps prefixed asset requests to the local dist root', () => {
        const rootDirectory = resolve('dist');

        expect(resolveFilePath('/Fractured-Order/assets/main.js', {
            basePath: '/Fractured-Order/',
            rootDirectory
        })).toBe(resolve(rootDirectory, 'assets/main.js'));
    });
});
