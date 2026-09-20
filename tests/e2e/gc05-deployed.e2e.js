import { expect, test } from '@playwright/test';
import { buildAppUrl } from './support/rehearsalRuntime.js';
import { loadEnv } from 'vite';
import { createDeployedRequestGuard } from './support/gc05DeployedRequests.js';

// Production deliberately cannot enable the localhost-only mock backend.
// Verify real hosted rendering/routing without creating identities or sessions.
test.skip(!process.env.GC05_DEPLOYED_URL, 'Requires the explicit deployed evidence runner.');
const observations = new WeakMap();
test.beforeEach(async ({ context, page }) => {
    // Match Vite's production build configuration, including process overrides.
    const env = loadEnv('production', process.cwd(), 'VITE_SUPABASE_URL');
    const observed = { guard: createDeployedRequestGuard(env.VITE_SUPABASE_URL), errors: [] };
    observations.set(context, observed);
    page.on('pageerror', error => observed.errors.push(error.message));
    await context.route('**/*', observed.guard.handle);
});
test.afterEach(async ({ context }, testInfo) => {
    const observed = observations.get(context);
    if (!observed) return; // Preserve the original setup failure.
    try {
        await observed.guard.settled();
    } finally {
        await testInfo.attach('blocked-backend-requests', {
            body: Buffer.from(JSON.stringify(observed.guard.blocked, null, 2)), contentType: 'application/json'
        });
    }
    observed.guard.assertContained();
    expect(observed.errors).toEqual([]);
});

async function expectBlockedBootstrap(context, count) {
    await expect.poll(() => observations.get(context).guard.blocked
        .filter(item => item.expectedBootstrap && item.aborted).length).toBe(count);
}

test('deployed landing loads real scripts and keeps the browser mock disabled', async ({ page, context }) => {
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
    await expectBlockedBootstrap(context, 1);
    await page.reload();
    await expect(page.locator('#joinForm')).toBeVisible();
    await expectBlockedBootstrap(context, 2);
    expect(await page.evaluate(() => Boolean(globalThis.__ESG_E2E_BACKEND__))).toBe(false);
});

test('direct deployed Green workspace routes retain the unauthenticated seat gate', async ({ page, context }) => {
    let bootstrapCount = 0;
    for (const surface of ['facilitator', 'scribe']) {
        expect((await page.goto(buildAppUrl(`teams/green/${surface}.html`))).status()).toBe(200);
        await expect(page.locator('#seatContextStatus')).toBeVisible();
        await expect(page.locator('#seatContextStatus')).toContainText('Join a session');
        const shells = page.locator('.app-layout, .scribe-shell');
        expect(await shells.count()).toBeGreaterThan(0);
        for (const shell of await shells.all()) await expect(shell).toBeHidden();
        await page.getByRole('button', { name: 'Return to join', exact: true }).click();
        await expect(page.locator('#joinForm')).toBeVisible();
        await expectBlockedBootstrap(context, ++bootstrapCount);
    }
});
