import { defineConfig } from '@playwright/test';

const localBaseURL = 'http://127.0.0.1:4174';
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

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
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI
        ? [['list'], ['html', { open: 'never' }]]
        : 'list',
    use: {
        baseURL: externalBaseURL || localBaseURL,
        trace: 'on-first-retry',
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
