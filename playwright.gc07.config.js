import { defineConfig } from '@playwright/test';
const basePath = process.env.VITE_PUBLIC_BASE_PATH || '/';
if (!['/', '/Fractured-Order/'].includes(basePath)) throw new Error('GC07 supports root and project bases.');
const baseURL = 'http://127.0.0.1:4174' + basePath;
process.env.PLAYWRIGHT_BASE_URL = baseURL;
const label = basePath === '/' ? 'root' : 'project-base';
export default defineConfig({
    testDir: './tests/e2e', testMatch: ['gc07-messaging.e2e.js', 'gc06-proposals.e2e.js', 'gc05-orientations.e2e.js'],
    outputDir: 'test-results/gc07-browser/' + label + '/artifacts',
    timeout: 90000, expect: { timeout: 15000 }, workers: 1, retries: 0,
    reporter: [['list'], ['json', { outputFile: 'test-results/gc07-browser/' + label + '/results.json' }]],
    use: { baseURL, serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    webServer: { command: 'node --preserve-symlinks --preserve-symlinks-main tests/e2e/support/staticServer.mjs dist 4174',
        url: baseURL, reuseExistingServer: false, timeout: 30000 }
});
