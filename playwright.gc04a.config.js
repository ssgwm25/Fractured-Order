import { defineConfig } from '@playwright/test';

// Local synthetic browser coverage only. Never contacts a hosted project and
// never runs the hosted operator preflight. Build dist for the selected base first.
const basePath = process.env.VITE_PUBLIC_BASE_PATH || '/';
if (!['/', '/Fractured-Order/'].includes(basePath)) throw new Error('GC04A local check supports / or /Fractured-Order/.');
const baseURL = `http://127.0.0.1:4174${basePath}`;
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
    testDir: './tests/e2e', testMatch: 'gc04-regional-context.e2e.js',
    timeout: 90000, expect: { timeout: 15000 }, workers: 1, retries: 0,
    reporter: [['list'], ['json', { outputFile: 'test-results/gc04a-browser/results.json' }]],
    use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    webServer: {
        command: 'node --preserve-symlinks --preserve-symlinks-main tests/e2e/support/staticServer.mjs dist 4174',
        url: baseURL, reuseExistingServer: false, timeout: 30000
    }
});
