import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const basePath = process.env.VITE_PUBLIC_BASE_PATH || '/';
if (!['/', '/Fractured-Order/'].includes(basePath)) throw new Error('GC09 supports root and project bases.');
if (process.env.PLAYWRIGHT_BASE_URL) throw new Error('Unset PLAYWRIGHT_BASE_URL for local GC09 checks.');
const run = process.env.GC09_EVIDENCE_RUN || randomUUID();
if (!/^[a-zA-Z0-9_-]+$/.test(run)) throw new Error('GC09_EVIDENCE_RUN must be a simple run identifier.');
const label = basePath === '/' ? 'root' : 'project-base';
const output = `test-results/gc09-browser/${run}/${label}`;
const baseURL = `http://127.0.0.1:4174${basePath}`;

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: ['gc09-guidance.e2e.js', 'gc04-regional-context.e2e.js', 'gc05-orientations.e2e.js',
        'gc06-proposals.e2e.js', 'gc07-messaging.e2e.js', 'gc08-administration.e2e.js'],
    outputDir: `${output}/artifacts`, timeout: 180000, expect: { timeout: 20000 }, workers: 1, retries: 0,
    reporter: [['list'], ['json', { outputFile: `${output}/results.json` }]],
    use: { baseURL, serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    webServer: { command: 'node --preserve-symlinks --preserve-symlinks-main tests/e2e/support/staticServer.mjs dist 4174',
        url: baseURL, reuseExistingServer: false, timeout: 30000 }
});
