import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import viteConfig from './vite.config.js';

describe('vite multi-page entries', () => {
    it('includes the Plenum suite mockup in the build graph', async () => {
        const config = await viteConfig({ mode: 'test' });
        const plenumEntry = config.build?.rollupOptions?.input?.plenum;

        expect(typeof plenumEntry).toBe('string');
        expect(plenumEntry.replace(/\\/g, '/')).toMatch(/\/Plenum\/index\.html$/);
        expect(existsSync(plenumEntry)).toBe(true);
    });
});
