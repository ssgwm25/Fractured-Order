import { defineConfig } from '@playwright/test';

const localBaseURL = 'http://127.0.0.1:4174';
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const protectedBranch = process.env.PLAYWRIGHT_PROTECTED_BRANCH === 'true';
const gateReporter = ['./tests/e2e/support/playwrightGateReporter.js', {
    outputFile: 'test-results/playwright-gate-summary.json'
}];

export default defineConfig({
    timeout: 90000,
    globalSetup: './tests/e2e/support/globalSetup.js',
    expect: {
        timeout: 10000
    },
    testDir: './tests/e2e',
    testMatch: '**/*.e2e.js',
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI && protectedBranch ? 1 : 0,
    reporter: process.env.CI
        ? [
            gateReporter,
            ['list'],
            ['html', { open: 'never', outputFolder: 'playwright-report' }]
        ]
        : [gateReporter, ['list']],
    use: {
        baseURL: externalBaseURL || localBaseURL,
        trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },
    webServer: externalBaseURL
        ? undefined
        : {
            command: 'npm run serve:test',
            url: localBaseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120000
        }
});
