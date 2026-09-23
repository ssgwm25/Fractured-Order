import { defineConfig } from '@playwright/test';
const basePath = process.env.VITE_PUBLIC_BASE_PATH || '/';
if (!['/', '/Fractured-Order/'].includes(basePath)) throw new Error('GC08 supports root and project bases.');
if (process.env.PLAYWRIGHT_BASE_URL) throw new Error('GC08 mock browser checks require PLAYWRIGHT_BASE_URL to be unset. Use the hosted rehearsal runner for deployed verification.');
const baseURL = 'http://127.0.0.1:4174' + basePath;
const label = basePath === '/' ? 'root' : 'project-base';
export default defineConfig({
    testDir: './tests/e2e', testMatch: ['gc08-administration.e2e.js'],
    outputDir: 'test-results/gc08-browser/' + label + '/artifacts',
    timeout: 180000, expect: { timeout: 20000 }, workers: 1, retries: 0,
    reporter: [['list'], ['json', { outputFile: 'test-results/gc08-browser/' + label + '/results.json' }]],
    use: { baseURL, serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    webServer: { command: 'node --preserve-symlinks --preserve-symlinks-main tests/e2e/support/staticServer.mjs dist 4174',
        url: baseURL, reuseExistingServer: false, timeout: 30000 }
});
