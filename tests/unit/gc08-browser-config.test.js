import { afterEach, expect, it, vi } from 'vitest';
import {
    buildAppUrl, getHostedOperatorAccessCode, isHostedRehearsal, resolveOperatorAccessCode
} from '../e2e/support/rehearsalRuntime.js';

// Evaluate our actual config without launching Playwright or a web server.
vi.mock('@playwright/test', () => ({ defineConfig: config => config }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it.each(['/', '/Fractured-Order/'])('keeps GC08 mock navigation and operator setup local at %s', async (basePath) => {
    vi.stubEnv('VITE_PUBLIC_BASE_PATH', basePath);
    vi.stubEnv('PLAYWRIGHT_BASE_URL', '');
    vi.stubEnv('PLAYWRIGHT_OPERATOR_ACCESS_CODE', 'synthetic-hosted-placeholder');
    const { default: config } = await import('../../playwright.gc08.config.js');
    const expected = `http://127.0.0.1:4174${basePath}`;
    expect(config.use.baseURL).toBe(expected);
    expect(config.webServer.url).toBe(expected);
    expect(buildAppUrl()).toBe(expected);
    expect(buildAppUrl('master.html')).toBe(`${expected}master.html`);
    expect(process.env.PLAYWRIGHT_BASE_URL).toBe('');
    expect(isHostedRehearsal(process.env.PLAYWRIGHT_BASE_URL)).toBe(false);
    expect(getHostedOperatorAccessCode()).toBe('');
    expect(resolveOperatorAccessCode('synthetic-local-code')).toBe('synthetic-local-code');
});

it.each(['https://example.invalid/Fractured-Order/', 'http://127.0.0.1:4174/'])('preserves explicit hosted-run semantics for %s', async (baseUrl) => {
    vi.stubEnv('VITE_PUBLIC_BASE_PATH', '/Fractured-Order/');
    vi.stubEnv('PLAYWRIGHT_BASE_URL', baseUrl);
    vi.stubEnv('PLAYWRIGHT_OPERATOR_ACCESS_CODE', '');
    await expect(import('../../playwright.gc08.config.js')).rejects.toThrow('PLAYWRIGHT_BASE_URL to be unset');
    expect(isHostedRehearsal(baseUrl)).toBe(true);
    expect(buildAppUrl('master.html')).toBe(`${baseUrl}master.html`);
    expect(getHostedOperatorAccessCode()).toBe('');
    vi.stubEnv('PLAYWRIGHT_OPERATOR_ACCESS_CODE', 'synthetic-hosted-code');
    expect(getHostedOperatorAccessCode()).toBe('synthetic-hosted-code');
});
