import { expect, test } from '@playwright/test';
import { buildAppUrl } from './support/rehearsalRuntime.js';
import { readOnlyRequestAllowed } from '../../scripts/gc05-evidence-contract.mjs';

// Production deliberately cannot enable the localhost-only mock backend.
// Verify real hosted rendering/routing without creating identities or sessions.
test.skip(!process.env.GC05_DEPLOYED_URL, 'Requires the explicit deployed evidence runner.');
const observations = new WeakMap();
test.beforeEach(async ({ context, page }) => {
    const observed = { denied: [], errors: [] };
    observations.set(context, observed);
    page.on('pageerror', error => observed.errors.push(error.message));
    await context.route('**/*', route => {
        const request = route.request();
        if (readOnlyRequestAllowed(request.url(), request.method())) return route.continue();
        observed.denied.push({ origin: new URL(request.url()).origin, method: request.method() });
        return route.abort('blockedbyclient');
    });
});
test.afterEach(async ({ context }) => {
    expect(observations.get(context)).toEqual({ denied: [], errors: [] });
});

test('deployed landing loads real scripts and keeps the browser mock disabled', async ({ page }) => {
    expect((await page.goto(buildAppUrl())).status()).toBe(200);
    await expect(page.locator('#joinForm')).toBeVisible();
    await expect(page.locator('#sessionCode')).toBeVisible();
    await expect(page.locator('#displayName')).toBeVisible();
    await expect(page.locator('#checkSessionBtn')).toBeVisible();
    for (const region of ['asian_pacific', 'europe']) {
        await expect(page.locator(`[data-delegation="${region}"]`)).toHaveCount(1);
    }
    await page.locator('#displayName').focus();
    await expect(page.locator('#displayName')).toBeFocused();
    await page.reload();
    await expect(page.locator('#joinForm')).toBeVisible();
    expect(await page.evaluate(() => Boolean(globalThis.__ESG_E2E_BACKEND__))).toBe(false);
});

test('direct deployed Green workspace routes retain the unauthenticated seat gate', async ({ page }) => {
    for (const surface of ['facilitator', 'scribe']) {
        expect((await page.goto(buildAppUrl(`teams/green/${surface}.html`))).status()).toBe(200);
        await expect(page.locator('#seatContextStatus')).toBeVisible();
        await expect(page.locator('#seatContextStatus')).toContainText('Join a session');
        const shells = page.locator('.app-layout, .scribe-shell');
        expect(await shells.count()).toBeGreaterThan(0);
        for (const shell of await shells.all()) await expect(shell).toBeHidden();
        await page.getByRole('button', { name: 'Return to join', exact: true }).click();
        await expect(page.locator('#joinForm')).toBeVisible();
    }
});
