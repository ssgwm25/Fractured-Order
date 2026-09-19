import { expect, it, vi } from 'vitest';
import { isAbsolute, relative, resolve, sep } from 'node:path';

// Inspect our real configuration without loading Playwright's runner. This
// single-object defineConfig call needs no Playwright merge/default behavior.
vi.mock('@playwright/test', () => ({ defineConfig: config => config }));

it('keeps disposable Playwright output away from retained GC05 and foundation evidence', async () => {
    const previousURL = process.env.PLAYWRIGHT_BASE_URL;
    vi.stubEnv('VITE_PUBLIC_BASE_PATH', '/');
    vi.stubEnv('GC05_EVIDENCE_RUN', '');
    vi.stubEnv('GC05_DEPLOYED_URL', '');
    try {
        // Evaluate the real paths and environment branches with only the
        // third-party configuration wrapper stubbed; all assertions stay real.
        const { default: config } = await import('../../playwright.gc05.config.js');
        expect(typeof config.outputDir).toBe('string');
        const disposable = resolve(config.outputDir);
        const inside = (parent, child) => {
            const path = relative(resolve(parent), resolve(child));
            return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
        };
        expect(inside('test-results/gc05-browser', disposable)).toBe(true);
        const jsonReport = config.reporter.find(([type]) => type === 'json')[1].outputFile;
        for (const retained of [jsonReport, 'test-results/gc05-browser/results-root.json',
            'test-results/gc05-browser/results-project.json', 'test-results/gc04-live', 'test-results/gc05-live']) {
            expect(inside(disposable, retained), `Playwright must not clean ${retained}`).toBe(false);
        }
    } finally {
        vi.unstubAllEnvs();
        if (previousURL === undefined) delete process.env.PLAYWRIGHT_BASE_URL;
        else process.env.PLAYWRIGHT_BASE_URL = previousURL;
    }
});
