import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';

function readLocalOperatorAccessCode() {
    let contents = '';
    try {
        contents = readFileSync('.env.local', 'utf8');
    } catch (_error) {
        return '';
    }
    for (const name of [
        'GC09_REHEARSAL_OPERATOR_ACCESS_CODE',
        'GC08_OPERATOR_ACCESS_CODE',
        'OPERATOR_CODE'
    ]) {
        const value = contents.match(new RegExp(`^\\s*${name}\\s*=\\s*['"]?([^\\s'"]+)`, 'm'))?.[1];
        if (value) return value;
    }
    return '';
}

const operatorAccessCode = String(
    process.env.GC09_REHEARSAL_OPERATOR_ACCESS_CODE || readLocalOperatorAccessCode()
).trim();
if (!operatorAccessCode) {
    throw new Error(
        'Set GC09_REHEARSAL_OPERATOR_ACCESS_CODE or keep the existing operator code in .env.local.'
    );
}
// The test worker inherits this process environment. The value is never written
// to Playwright reports or attachments.
process.env.GC09_REHEARSAL_OPERATOR_ACCESS_CODE = operatorAccessCode;

const basePath = process.env.VITE_PUBLIC_BASE_PATH || '/Fractured-Order/';
if (basePath !== '/Fractured-Order/') {
    throw new Error('The hosted GC09 cleanup check requires VITE_PUBLIC_BASE_PATH=/Fractured-Order/.');
}
const run = String(process.env.GC09_UNIFIED_CLEANUP_RUN || '').trim();
if (!/^[a-zA-Z0-9_-]+$/.test(run)) {
    throw new Error('GC09_UNIFIED_CLEANUP_RUN must be a new simple run identifier.');
}
const output = `test-results/gc09-unified-cleanup/${run}`;

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: ['gc09-unified-deck-cleanup.hosted.js'],
    outputDir: `${output}/artifacts`,
    timeout: 180000,
    expect: { timeout: 30000 },
    workers: 1,
    retries: 0,
    reporter: [
        ['list'],
        ['json', { outputFile: `${output}/results.json` }],
        ['html', { outputFolder: `${output}/html`, open: 'never' }]
    ],
    use: {
        baseURL: `http://127.0.0.1:4174${basePath}`,
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    webServer: {
        command: 'node --preserve-symlinks --preserve-symlinks-main tests/e2e/support/staticServer.mjs dist 4174',
        url: `http://127.0.0.1:4174${basePath}`,
        reuseExistingServer: false,
        timeout: 30000
    }
});
