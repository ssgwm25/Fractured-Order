import { defineConfig } from '@playwright/test';
import { evidencePaths, deployedURL } from './scripts/gc05-evidence-contract.mjs';

const basePath = process.env.VITE_PUBLIC_BASE_PATH || '/';
if (!['/', '/Fractured-Order/'].includes(basePath)) throw new Error('GC05 supports root and project bases.');
const hosted = Boolean(process.env.GC05_DEPLOYED_URL);
const paths = process.env.GC05_EVIDENCE_RUN ? evidencePaths(process.env.GC05_EVIDENCE_RUN) : null;
if (hosted && !paths) throw new Error('Use the GC05 evidence runner for deployed checks.');
const baseURL = hosted ? deployedURL(process.env.GC05_DEPLOYED_URL) : `http://127.0.0.1:4174${basePath}`;
process.env.PLAYWRIGHT_BASE_URL = baseURL;
export default defineConfig({
    testDir: './tests/e2e', testMatch: hosted ? 'gc05-deployed.e2e.js' : 'gc05-orientations.e2e.js',
    // Playwright cleans outputDir before each run; keep saved reports outside it.
    outputDir: paths?.artifacts || 'test-results/gc05-browser/artifacts',
    timeout: 90000, expect: { timeout: 15000 }, workers: 1, retries: 0,
    reporter: [['list'], ['json', { outputFile: paths?.browser || 'test-results/gc05-browser/results.json' }]],
    use: { baseURL, serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    webServer: hosted ? undefined : {
        command: 'node --preserve-symlinks --preserve-symlinks-main tests/e2e/support/staticServer.mjs dist 4174',
        url: baseURL, reuseExistingServer: false, timeout: 30000
    }
});
