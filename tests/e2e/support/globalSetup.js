import { chromium } from '@playwright/test';

import {
    buildAppUrl,
    classifyOperatorAuthorizationProgress,
    getHostedOperatorAccessCode,
    isHostedRehearsal
} from './rehearsalRuntime.js';

const HOSTED_PREFLIGHT_TIMEOUT_MS = 15000;

async function prepareLandingPage(page) {
    // The login page opens directly (no boot loader); make sure the landing is
    // revealed in case its entrance hasn't been triggered yet, then wait for the
    // join form.
    await page.evaluate(() => {
        document.querySelector('.landing')?.classList.add('landing--visible');
    });

    await page.locator('#joinForm').waitFor({ state: 'visible' });
}

async function openOperatorAccessSection(page) {
    const operatorAccessSection = page.locator('#operatorAccessSection');
    await operatorAccessSection.waitFor({ state: 'visible' });

    const isOpen = await operatorAccessSection.evaluate((element) => element.hasAttribute('open'));
    if (!isOpen) {
        await operatorAccessSection.evaluate((element) => {
            element.setAttribute('open', '');
        });
    }

    await page.locator('#operatorAccessCode').waitFor({ state: 'visible' });
}

async function waitForHostedOperatorGrant(page, baseUrl) {
    const deadline = Date.now() + HOSTED_PREFLIGHT_TIMEOUT_MS;
    const successPattern = /master\.html(?:\?.*)?$/;

    while (Date.now() < deadline) {
        if (page.isClosed()) {
            throw new Error(`Hosted rehearsal preflight page closed before authorization completed for ${baseUrl}.`);
        }

        const currentUrl = page.url();
        const toastText = await page.evaluate(() => (
            document.querySelector('#toast-container')?.textContent?.trim() || ''
        )).catch(() => '');
        const progress = classifyOperatorAuthorizationProgress({
            currentUrl,
            urlPattern: successPattern,
            toastText
        });

        if (progress.status === 'success') {
            return;
        }

        if (progress.status === 'failure') {
            throw new Error(
                `Hosted rehearsal preflight failed for ${baseUrl}: ${progress.toastText} ` +
                'Verify PLAYWRIGHT_OPERATOR_ACCESS_CODE against the deployed Supabase operator hash.'
            );
        }

        await page.waitForTimeout(250).catch(() => {
            throw new Error(`Hosted rehearsal preflight page closed before authorization completed for ${baseUrl}.`);
        });
    }

    throw new Error(
        `Hosted rehearsal preflight timed out after ${HOSTED_PREFLIGHT_TIMEOUT_MS}ms for ${baseUrl}. ` +
        `Current URL: ${page.url()}`
    );
}

export default async function globalSetup(config) {
    if (!isHostedRehearsal(process.env.PLAYWRIGHT_BASE_URL)) {
        return;
    }

    const operatorAccessCode = getHostedOperatorAccessCode();
    if (!operatorAccessCode) {
        throw new Error(
            'Hosted rehearsal requires PLAYWRIGHT_OPERATOR_ACCESS_CODE before Playwright starts. ' +
            'The deployed build does not accept the local mock operator code.'
        );
    }

    const baseUrl = config.projects?.[0]?.use?.baseURL || process.env.PLAYWRIGHT_BASE_URL;
    const browser = await chromium.launch();

    try {
        const page = await browser.newPage();
        await page.goto(buildAppUrl('', baseUrl));
        await prepareLandingPage(page);
        await page.locator('#displayName').fill('Hosted Rehearsal Preflight');
        await openOperatorAccessSection(page);
        await page.locator('#operatorAccessCode').fill(operatorAccessCode);
        await page.locator('#operatorGameMasterBtn').click();
        await waitForHostedOperatorGrant(page, baseUrl);
    } finally {
        await browser.close();
    }
}
