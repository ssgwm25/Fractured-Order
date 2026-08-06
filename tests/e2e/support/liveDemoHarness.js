import { expect } from '@playwright/test';

import { dumpE2EMockBackend, E2E_MOCK_OPERATOR_ACCESS_CODE } from './mockBackend.js';
import {
    APP_NAVIGATION_OPTIONS,
    attemptOpenGameMasterCreateSession,
    buildAppUrl,
    classifyOperatorAuthorizationProgress,
    getHostedOperatorAccessCode,
    OPERATOR_AUTH_TIMEOUT_MS,
    resolveOperatorAccessCode
} from './rehearsalRuntime.js';

const SHARED_LOCAL_STORAGE_KEYS = Object.freeze([
    'esg_e2e_backend_state',
    '__esg_e2e_backend_reset__'
]);

const BACKEND_RESET_KEY = '__esg_e2e_backend_reset__';
const E2E_MOCK_STATE_KEY = 'esg_e2e_backend_state';
const E2E_MOCK_ENABLEMENT_KEY = '__esg_e2e_mock_enabled';
const E2E_MOCK_CONFIG_KEY = '__esg_e2e_mock_config';
const HOSTED_OPERATOR_ACCESS_CODE = getHostedOperatorAccessCode();
const JOIN_FAILURE_FALLBACK_MESSAGE = 'We couldn\'t claim that seat. Check whether the role is still available, then try again.';

export { buildAppUrl } from './rehearsalRuntime.js';

export const OPERATOR_ACCESS_CODE = resolveOperatorAccessCode(E2E_MOCK_OPERATOR_ACCESS_CODE);
export const LANDING_URL_PATTERN = /(?:\/|\/index\.html)(?:#.*)?$/;

export const DEFAULT_ACTION_PAYLOAD = Object.freeze({
    instrumentOfPower: 'Economic',
    lever: 'Export Controls',
    sector: 'Biotechnology',
    supplyChainActionAngle: 'Build resilience for Blue',
    supplyChainFocus: 'Advanced Manufacturing',
    implementation: 'Executive Order',
    legislativeOptions: [],
    focusCountries: ['PRC', 'Japan'],
    expectedOutcomes: 'Reduce allied dependence and build leverage before the next move begins.',
    coordinated: ['Executive'],
    informed: ['Allies']
});

function resolveExpectedUrlPattern(roleSurface) {
    if (roleSurface === 'notetaker') {
        return /notetaker\.html/;
    }

    if (roleSurface === 'scribe') {
        return /scribe\.html/;
    }

    if (roleSurface === 'viewer') {
        return /facilitator\.html\?mode=observer/;
    }

    return /facilitator\.html/;
}

function normalizeSessionCode(session = {}) {
    return String(session.session_code || session.metadata?.session_code || '')
        .trim()
        .toUpperCase();
}

function getVisibleReviewCard(page, containerSelector, title) {
    return page.locator(`${containerSelector} .tab-panel:not([hidden]) .entity-card`).filter({
        has: page.getByRole('heading', { name: title, exact: true })
    });
}

function requireHostedOperatorAccessCode() {
    if (process.env.PLAYWRIGHT_BASE_URL && !HOSTED_OPERATOR_ACCESS_CODE) {
        throw new Error(
            'Hosted operator rehearsal requires PLAYWRIGHT_OPERATOR_ACCESS_CODE. ' +
            'The local mock code is not valid on deployed builds.'
        );
    }
}

async function waitForOperatorAuthorizationRoute(page, urlPattern, operatorLabel) {
    const deadline = Date.now() + OPERATOR_AUTH_TIMEOUT_MS;

    while (Date.now() < deadline) {
        if (page.isClosed()) {
            throw new Error(`${operatorLabel} authorization page closed before completion.`);
        }

        const currentUrl = page.url();
        const toastText = await page.evaluate(() => (
            document.querySelector('#toast-container')?.textContent?.trim() || ''
        )).catch(() => '');
        const progress = classifyOperatorAuthorizationProgress({
            currentUrl,
            urlPattern,
            toastText
        });

        if (progress.status === 'success') {
            return;
        }

        if (progress.status === 'failure') {
            throw new Error(`${operatorLabel} authorization failed: ${progress.toastText}`);
        }

        await page.waitForTimeout(250).catch(() => {
            throw new Error(`${operatorLabel} authorization page closed before completion.`);
        });
    }

    throw new Error(
        `${operatorLabel} authorization did not reach ${urlPattern} within ${OPERATOR_AUTH_TIMEOUT_MS}ms. ` +
        `Current URL: ${page.url()}`
    );
}

export async function createIsolatedActorPage(context, actorName, { resetBackend = false } = {}) {
    const page = await context.newPage();

    await page.addInitScript(({
        actorName: isolatedActorName,
        resetBackend: shouldResetBackend,
        sharedKeys,
        backendResetKey,
        mockEnablementKey,
        mockConfigKey,
        mockConfig
    }) => {
        const localStorageRef = globalThis.localStorage;
        const sharedKeySet = new Set(sharedKeys);
        const namespacePrefix = `actor:${isolatedActorName}::`;
        const storageProto = Storage.prototype;
        const originalGetItem = storageProto.getItem;
        const originalSetItem = storageProto.setItem;
        const originalRemoveItem = storageProto.removeItem;
        const originalClear = storageProto.clear;
        const originalKey = storageProto.key;

        const mapKey = (key) => {
            const normalizedKey = String(key);
            return sharedKeySet.has(normalizedKey)
                ? normalizedKey
                : `${namespacePrefix}${normalizedKey}`;
        };

        const collectNamespacedKeys = () => {
            const namespacedKeys = [];
            for (let index = 0; index < localStorageRef.length; index += 1) {
                const storedKey = originalKey.call(localStorageRef, index);
                if (storedKey?.startsWith(namespacePrefix)) {
                    namespacedKeys.push(storedKey);
                }
            }
            return namespacedKeys;
        };

        globalThis.__ESG_E2E_ACTOR__ = isolatedActorName;
        globalThis.sessionStorage.setItem(mockEnablementKey, 'enabled');
        globalThis.sessionStorage.setItem(mockConfigKey, JSON.stringify(mockConfig));
        originalRemoveItem.call(localStorageRef, 'esg_e2e_mock');

        if (shouldResetBackend && !originalGetItem.call(localStorageRef, backendResetKey)) {
            originalRemoveItem.call(localStorageRef, 'esg_e2e_backend_state');
            originalSetItem.call(localStorageRef, backendResetKey, 'true');
        }

        storageProto.getItem = function getItem(key) {
            if (this === localStorageRef) {
                return originalGetItem.call(this, mapKey(key));
            }

            return originalGetItem.call(this, key);
        };

        storageProto.setItem = function setItem(key, value) {
            if (this === localStorageRef) {
                return originalSetItem.call(this, mapKey(key), value);
            }

            return originalSetItem.call(this, key, value);
        };

        storageProto.removeItem = function removeItem(key) {
            if (this === localStorageRef) {
                return originalRemoveItem.call(this, mapKey(key));
            }

            return originalRemoveItem.call(this, key);
        };

        storageProto.clear = function clear() {
            if (this === localStorageRef) {
                collectNamespacedKeys().forEach((storedKey) => {
                    originalRemoveItem.call(this, storedKey);
                });
                return;
            }

            return originalClear.call(this);
        };
    }, {
        actorName,
        resetBackend,
        sharedKeys: SHARED_LOCAL_STORAGE_KEYS,
        backendResetKey: BACKEND_RESET_KEY,
        mockEnablementKey: E2E_MOCK_ENABLEMENT_KEY,
        mockConfigKey: E2E_MOCK_CONFIG_KEY,
        mockConfig: {
            operatorAccessCode: OPERATOR_ACCESS_CODE
        }
    });

    return page;
}

export async function openOperatorAccessSection(page) {
    await prepareLandingPage(page);

    const operatorAccessSection = page.locator('#operatorAccessSection');
    await expect(operatorAccessSection).toBeVisible();

    if (!(await operatorAccessSection.evaluate((element) => element.hasAttribute('open')))) {
        await operatorAccessSection.evaluate((element) => {
            element.setAttribute('open', '');
        });
    }

    await expect(page.locator('#operatorAccessCode')).toBeVisible();
}

export async function prepareLandingPage(page) {
    // The login page opens directly (no boot loader); make sure the landing is
    // revealed in case its entrance hasn't been triggered yet, then wait for the
    // join form.
    await page.evaluate(() => {
        document.querySelector('.landing')?.classList.add('landing--visible');
    });

    await expect(page.locator('#joinForm')).toBeVisible();
}

export async function authorizeGameMaster(page, {
    displayName = 'Game Master Operator',
    operatorAccessCode = OPERATOR_ACCESS_CODE
} = {}) {
    requireHostedOperatorAccessCode();
    await page.goto(buildAppUrl(), APP_NAVIGATION_OPTIONS);
    await page.locator('#displayName').fill(displayName);
    await openOperatorAccessSection(page);
    await page.locator('#operatorAccessCode').fill(operatorAccessCode);
    await page.locator('#operatorGameMasterBtn').click();
    await waitForOperatorAuthorizationRoute(page, /master\.html/, 'Game Master');
}

export async function createSessionFromMaster(page, {
    sessionName,
    sessionCode,
    description = 'Automated live-demo rehearsal session.'
} = {}) {
    const sessionsLink = page.locator('.sidebar-link[data-section="sessions"]');
    const sessionsSection = page.locator('#sessionsSection');
    const createButton = page.locator('#createSessionBtn');
    const createForm = page.locator('#createSessionForm');
    const createModalOverlays = page.locator('.modal-overlay').filter({ has: createForm });
    const activeCreateModal = page
        .locator('.modal-overlay.modal-visible:not(.modal-hiding)')
        .filter({ has: createForm });

    // The operator route can become visible before the shared sidebar and
    // GameMasterController bind their event listeners. A submitted modal also
    // remains in the DOM during its exit transition, so only an active modal is
    // ready for reuse. Retry both interactions so neither an early navigation
    // click nor an early modal click is lost.
    await expect.poll(() => attemptOpenGameMasterCreateSession({
        isCreateFormReady: () => activeCreateModal.isVisible().catch(() => false),
        isSessionsSectionVisible: () => sessionsSection.isVisible().catch(() => false),
        clickSessions: () => sessionsLink.click({ timeout: 2000 }),
        clickCreate: () => createButton.click({ timeout: 2000 })
    }), {
        timeout: OPERATOR_AUTH_TIMEOUT_MS,
        intervals: [250, 500, 1000, 2000],
        message: 'Game Master Sessions section and Create Session form did not become interactive after operator authorization.'
    }).toBe(true);

    const modal = activeCreateModal.last();
    await expect(modal).toBeVisible();
    await modal.locator('#newSessionName').fill(sessionName);
    await modal.locator('#newSessionCode').fill(sessionCode);
    await modal.locator('#newSessionDescription').fill(description);
    await modal.getByRole('button', { name: 'Create Session' }).click();

    await expect(page.locator('#sessionsList')).toContainText(sessionName);
    await expect(page.locator('#sessionsList')).toContainText(sessionCode);
    await expect(createModalOverlays).toHaveCount(0, { timeout: OPERATOR_AUTH_TIMEOUT_MS });

    const backendState = await dumpE2EMockBackend(page);
    return backendState?.tables?.sessions?.find(
        (session) => normalizeSessionCode(session) === sessionCode
    ) || null;
}

export async function joinPublicParticipant(page, {
    sessionCode,
    displayName,
    team = 'blue',
    roleSurface = 'facilitator'
} = {}) {
    await page.goto(buildAppUrl(), APP_NAVIGATION_OPTIONS);
    await prepareLandingPage(page);
    await page.locator('#sessionCode').fill(sessionCode);
    await page.locator('#displayName').fill(displayName);
    await page.locator(`.chip[data-team="${team}"]`).click();
    await page.locator(`.chip[data-role-surface="${roleSurface}"]`).click();
    await page.getByRole('button', { name: 'Join Session' }).click();
    await page.waitForURL(resolveExpectedUrlPattern(roleSurface));
}

export async function expectJoinFailure(page, joinOptions, expectedMessage) {
    await page.goto(buildAppUrl(), APP_NAVIGATION_OPTIONS);
    await prepareLandingPage(page);
    await page.locator('#sessionCode').fill(joinOptions.sessionCode);
    await page.locator('#displayName').fill(joinOptions.displayName);
    await page.locator(`.chip[data-team="${joinOptions.team || 'blue'}"]`).click();
    await page.locator(`.chip[data-role-surface="${joinOptions.roleSurface || 'facilitator'}"]`).click();
    await page.getByRole('button', { name: 'Join Session' }).click();

    await expect(page.locator('#joinForm')).toBeVisible();
    const acceptableMessages = [expectedMessage, JOIN_FAILURE_FALLBACK_MESSAGE]
        .filter(Boolean)
        .map((message) => String(message).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    await expect(page.locator('#toast-container')).toContainText(new RegExp(acceptableMessages.join('|')));
}

export async function authorizeWhiteCell(page, {
    sessionCode,
    displayName,
    operatorRole = 'lead',
    operatorAccessCode = OPERATOR_ACCESS_CODE
} = {}) {
    if (operatorRole !== 'lead') {
        throw new Error(
            `authorizeWhiteCell only supports the shipped White Cell Lead entry; received "${operatorRole}".`
        );
    }

    requireHostedOperatorAccessCode();
    await page.goto(buildAppUrl(), APP_NAVIGATION_OPTIONS);
    await prepareLandingPage(page);
    await page.locator('#sessionCode').fill(sessionCode);
    await page.locator('#displayName').fill(displayName);
    await openOperatorAccessSection(page);
    await page.locator('#operatorAccessCode').fill(operatorAccessCode);
    await page.locator('#operatorWhiteCellLeadBtn').click();
    await waitForOperatorAuthorizationRoute(page, /whitecell\.html/, `White Cell ${operatorRole}`);
}

export async function openSidebarSection(page, section) {
    await page.locator(`.sidebar-link[data-section="${section}"]`).click({ timeout: 20000 });
}

export async function openWhiteCellSettingsTab(page, tab) {
    await openSidebarSection(page, 'controls');
    const tabButton = page.locator(`#settingsTabs .tab-button[data-settings-tab="${tab}"]`);
    const tabPanel = page.locator(`#settingsTabs .tab-panel[data-settings-panel="${tab}"]`);

    await tabButton.click({ timeout: 20000 });
    await expect(tabButton).toHaveAttribute('aria-selected', 'true');
    await expect(tabPanel).toBeVisible();
}

export async function createDraftAction(page, {
    goal,
    objective = goal,
    instrumentOfPower = DEFAULT_ACTION_PAYLOAD.instrumentOfPower,
    sector = DEFAULT_ACTION_PAYLOAD.sector,
    supplyChainActionAngle = DEFAULT_ACTION_PAYLOAD.supplyChainActionAngle,
    supplyChainFocus = DEFAULT_ACTION_PAYLOAD.supplyChainFocus,
    implementation = DEFAULT_ACTION_PAYLOAD.implementation,
    legislativeOptions = DEFAULT_ACTION_PAYLOAD.legislativeOptions,
    focusCountries = DEFAULT_ACTION_PAYLOAD.focusCountries,
    expectedOutcomes = DEFAULT_ACTION_PAYLOAD.expectedOutcomes,
    notificationTeams = [],
    notificationNote = ''
} = {}) {
    const builtInInstruments = new Set(['Economic', 'Diplomacy', 'Information', 'Military', 'Other']);
    const builtInFocusCountries = new Set(['U.S', 'PRC', 'Russia', 'EU', 'France', 'UK', 'BRICS+', 'ROK', 'ASEAN', 'Japan', 'Other']);
    const instruments = Array.isArray(instrumentOfPower) ? instrumentOfPower : [instrumentOfPower];
    const sectors = Array.isArray(sector) ? sector : [sector];
    const supplyChainActionAngles = Array.isArray(supplyChainActionAngle)
        ? supplyChainActionAngle
        : [supplyChainActionAngle];
    const supplyChainFocuses = Array.isArray(supplyChainFocus) ? supplyChainFocus : [supplyChainFocus];

    await page.locator('#newActionBtn').click();

    const modal = page
        .locator('.modal-overlay.modal-visible:not(.modal-hiding)')
        .filter({ has: page.locator('#actionTitle') });
    await expect(modal).toBeVisible({ timeout: 20000 });
    await modal.locator('#actionTitle').fill(goal);
    await modal.locator('#actionObjective').fill(objective);
    const instrumentCheckboxes = modal.locator('[data-blue-action-checkbox="instrument"]');
    if (await instrumentCheckboxes.count()) {
        for (const instrument of instruments) {
            if (builtInInstruments.has(instrument)) {
                await modal.locator(`[data-blue-action-checkbox="instrument"][value="${instrument}"]`).check();
            } else {
                await modal.locator('[data-blue-action-checkbox="instrument"][value="Other"]').check();
                await modal.locator('#actionInstrumentOther').fill(instrument);
            }
        }
    } else if (builtInInstruments.has(instrumentOfPower)) {
        await modal.locator('#actionInstrument').selectOption(instrumentOfPower);
    } else {
        await modal.locator('#actionInstrument').selectOption('Other');
        await modal.locator('#actionInstrumentOther').fill(instrumentOfPower);
    }
    await modal.getByRole('button', { name: 'Next' }).click();

    const supplyChainDecision = modal.locator('#actionHasSupplyChainFocusYes');
    if (await supplyChainDecision.count()) {
        await supplyChainDecision.check();
        for (const angleValue of supplyChainActionAngles) {
            await modal.locator(`[data-blue-action-checkbox="supply-chain-angle"][value="${angleValue}"]`).check();
        }
        for (const focusValue of supplyChainFocuses) {
            await modal.locator(`[data-blue-action-checkbox="supply-chain-area"][value="${focusValue}"]`).check();
        }
    } else {
        for (const focusValue of supplyChainFocuses) {
            await modal.locator(`[data-blue-action-checkbox="supply-chain-focus"][value="${focusValue}"]`).check();
        }
    }
    for (const sectorValue of sectors) {
        await modal.locator(`[data-blue-action-checkbox="sector"][value="${sectorValue}"]`).check();
    }
    const nextPageButton = modal.getByRole('button', { name: 'Next' });
    if (await nextPageButton.isVisible()) {
        await nextPageButton.click();
    }
    const implementationSelect = modal.locator('#actionImplementation');
    if (await implementationSelect.count()) {
        await implementationSelect.selectOption(implementation);
    }
    if (implementation === 'Legislative' && await modal.locator('[data-blue-action-checkbox="legislative"]').count()) {
        for (const legislativeOption of legislativeOptions) {
            await modal.locator(`[data-blue-action-checkbox="legislative"][value="${legislativeOption}"]`).check();
        }
    }
    for (const focusCountry of focusCountries) {
        if (builtInFocusCountries.has(focusCountry)) {
            await modal.locator(`[data-blue-action-checkbox="country"][value="${focusCountry}"]`).check();
        } else {
            await modal.locator('[data-blue-action-checkbox="country"][value="Other"]').check();
            await modal.locator('#actionFocusCountryOtherInput').fill(focusCountry);
        }
    }
    await modal.locator('#actionExpectedOutcomes').fill(expectedOutcomes);
    for (const notificationTeam of notificationTeams) {
        await modal.locator(`[data-blue-action-notification-team][value="${notificationTeam}"]`).check();
    }
    if (notificationTeams.length) {
        await modal.locator('#actionNotificationNote').fill(notificationNote);
    }
    await modal.getByRole('button', { name: 'Save Draft' }).click();

    await expect(page.locator('#actionsList')).toContainText(goal);
}

export async function forwardActionToScribe(page, goal) {
    const actionCard = page.locator('#actionsList .entity-card').filter({ hasText: goal }).first();
    await expect(actionCard).toBeVisible();

    const detailsToggle = actionCard.locator('.toggle-action-card-btn');
    if (await detailsToggle.getAttribute('aria-expanded') !== 'true') {
        await detailsToggle.click();
    }

    const forwardButton = actionCard.getByRole('button', { name: 'Forward to Facilitator' });
    await expect(forwardButton).toBeVisible();
    await forwardButton.click();
    await page.locator('.modal-overlay').getByRole('button', { name: 'Forward' }).click();
    await expect(page.locator('#toast-container')).toContainText('Action forwarded to Facilitator');
}

export async function recordStrategicOrientationFromScribe(page, {
    team = 'blue',
    orientation = 'pressure',
    rationale = 'Topology rehearsal orientation recorded before the normal move gate.'
} = {}) {
    await page.locator('#strategicOrientationBtn').click();

    const modal = page.locator('.modal-overlay').filter({
        has: page.locator('[data-strategic-orientation-modal]')
    });
    await expect(modal).toBeVisible();

    const orientationOptions = modal.locator(`[data-orientation="${orientation}"]`);
    const orientationOptionCount = await orientationOptions.count();
    expect(orientationOptionCount).toBeGreaterThan(0);
    for (let index = 0; index < orientationOptionCount; index += 1) {
        const orientationOption = orientationOptions.nth(index);
        await orientationOption.click();
        await expect(orientationOption).toHaveAttribute('aria-checked', 'true');
    }
    await modal.locator('#rationale').fill(rationale);

    const confirmButton = modal.locator('[data-orientation-nav="confirm"]');
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(page.locator('#toast-container')).toContainText('Strategic Orientation forwarded to Facilitator');

    const artifactLabel = team === 'blue' ? 'Strategic Orientation:' : 'Forecast';
    const orientationCard = page.locator('#actionsList .entity-card').filter({ hasText: artifactLabel }).first();
    await expect(orientationCard).toBeVisible();
    const goal = (await orientationCard.locator('.entity-card__title').innerText()).trim();

    return goal;
}

export async function openFacilitatorActionSlide(page, goal) {
    await expect(page.locator('body')).toHaveAttribute('data-scribe-deck-state', 'ready', {
        timeout: 20000
    });

    const actionSlideLink = page.locator('#scribeSectionList button[data-slide-key^="action-"]')
        .filter({ hasText: goal })
        .first();
    const actionMarkRail = page.locator('#scribeSectionList [data-action-mark-navigation]').first();

    if (await actionMarkRail.count()) {
        await expect(actionSlideLink).toHaveCount(1, { timeout: 20000 });
        if (!await actionSlideLink.isVisible()) {
            const markKey = await actionSlideLink.evaluate((button) => (
                button.closest('[data-action-mark-panel]')?.dataset.actionMarkPanel || ''
            ));
            expect(markKey).not.toBe('');
            const markTab = actionMarkRail.locator(`[data-action-mark-tab="${markKey}"]`);
            await expect(markTab).toBeVisible({ timeout: 20000 });
            await markTab.click();
        }
    } else {
        const actionsSectionTrigger = page.locator('#scribeSectionList .scribe-section-trigger[data-section-label="Actions"]').first();
        await expect(actionsSectionTrigger).toBeVisible({ timeout: 20000 });
        if (await actionsSectionTrigger.getAttribute('aria-expanded') !== 'true') {
            await actionsSectionTrigger.click();
        }
    }

    await expect(actionSlideLink).toBeVisible({ timeout: 20000 });
    await actionSlideLink.click();
    return actionSlideLink;
}

export async function submitActionFromScribe(page, goal, {
    coordinated = ['Executive'],
    informed = ['Allies']
} = {}) {
    const actionSlideLink = await openFacilitatorActionSlide(page, goal);

    const actionFrame = page.locator('#deckActionFrame');
    const detailsToggle = actionFrame.locator('[data-scribe-action-toggle]');
    await expect(detailsToggle).toBeVisible();
    if (await detailsToggle.getAttribute('aria-expanded') !== 'true') {
        await detailsToggle.click();
    }

    const panel = page.locator('[data-scribe-action-submit-panel]').filter({ hasText: 'Facilitator finalization' }).first();
    await expect(page.locator('#main-content')).toContainText(goal);
    await expect(panel).toBeVisible();
    await panel.locator('[data-scribe-action-radio="coordinated"][value="yes"]').check();
    for (const coordinatedValue of coordinated) {
        await panel.locator(`[data-scribe-action-checkbox="coordinated"][value="${coordinatedValue}"]`).check();
    }

    await panel.locator('[data-scribe-action-radio="informed-engaged"][value="yes"]').check();
    for (const informedValue of informed) {
        await panel.locator(`[data-scribe-action-checkbox="informed-engaged"][value="${informedValue}"]`).check();
    }

    const submitButton = panel.getByRole('button', { name: 'Submit to White Cell' });
    await expect(submitButton).toBeVisible();
    await submitButton.click();
    await page.locator('.modal-overlay').getByRole('button', { name: 'Submit' }).click();
    await expect(panel).toHaveCount(0);
    await expect(actionSlideLink).toContainText('Submitted to White Cell');
    await expect(actionFrame.locator('.scribe-presentation-toolbar-status')).toHaveText('Submitted to White Cell.');
}

export async function submitStrategicOrientationFromScribe(page, goal) {
    const actionSlideLink = await openFacilitatorActionSlide(page, goal);

    const actionFrame = page.locator('#deckActionFrame');
    const orientationSlide = actionFrame.locator('.scribe-orientation-slide');
    const panel = page.locator('[data-scribe-action-submit-panel]').filter({ hasText: 'Facilitator-to-White Cell handoff' }).first();
    await expect(orientationSlide).toBeVisible();
    await expect(orientationSlide.locator('.scribe-action-slide-title')).toContainText('Strategic Orientation');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Submit to White Cell' }).click();
    await page.locator('.modal-overlay').getByRole('button', { name: 'Submit' }).click();
    await expect(panel).toHaveCount(0);
    await expect(actionSlideLink).toContainText('Submitted to White Cell');
    await expect(actionFrame.locator('.scribe-presentation-toolbar-status')).toHaveText('Submitted to White Cell.');
}

export async function adjudicateAction(page, {
    goal,
    section = 'actions',
    notes = 'Validated through the live-demo topology suite.'
} = {}) {
    const queueSelector = {
        actions: '#actionsList',
        responses: '#responsesList'
    }[section];
    if (!queueSelector) {
        throw new Error(`adjudicateAction received an unsupported White Cell section: ${section}`);
    }

    await openSidebarSection(page, section);

    const cardHeading = page.getByRole('heading', {
        name: goal,
        exact: true,
        includeHidden: true
    });
    let adjudicationCard;
    if (section === 'actions') {
        const actionCard = page.locator(`${queueSelector} [data-action-mark-panel] .entity-card`).filter({
            has: cardHeading
        }).first();
        await expect(actionCard).toHaveCount(1, { timeout: 20000 });

        if (!await actionCard.isVisible()) {
            const markKey = await actionCard.evaluate((card) => (
                card.closest('[data-action-mark-panel]')?.dataset.actionMarkPanel || ''
            ));
            expect(markKey).not.toBe('');
            const markTab = page.locator(`${queueSelector} [data-action-mark-tab="${markKey}"]`);
            await expect(markTab).toBeVisible({ timeout: 20000 });
            await markTab.click();
        }

        adjudicationCard = page.locator(
            `${queueSelector} [data-action-mark-panel]:not([hidden]) .entity-card`
        ).filter({ has: cardHeading }).first();
    } else {
        adjudicationCard = page.locator(
            `${queueSelector} .tab-panel:not([hidden]) .entity-card`
        ).filter({ has: cardHeading }).first();
    }
    await expect(adjudicationCard).toContainText(goal);
    await adjudicationCard.locator('.adjudicate-btn').click();

    const modal = page.locator('.modal-overlay');
    await modal.locator('#artifactReviewNotes').fill(notes);
    await modal.getByRole('button', { name: 'Accept as Complete' }).click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#toast-container')).toContainText('accepted as complete');
}

export async function reviewStrategicOrientation(page, {
    goal,
    team,
    notes = 'Validated Strategic Orientation through the live-demo topology suite.'
} = {}) {
    await openSidebarSection(page, 'strategicOrientation');

    const normalizedTeam = String(team || '').trim().toLowerCase();
    if (normalizedTeam && !/^(blue|red|green|industry)$/.test(normalizedTeam)) {
        throw new Error(`reviewStrategicOrientation received an unsupported team: ${team}`);
    }

    const reviewTitle = getWhiteCellStrategicOrientationTitle(goal, normalizedTeam);
    let orientationCards = getVisibleReviewCard(page, '#strategicOrientationList', reviewTitle);
    if (normalizedTeam) {
        orientationCards = orientationCards.filter({
            has: page.locator(`.badge-source-team--${normalizedTeam}`)
        });
    }
    const orientationCard = orientationCards.first();
    await expect(orientationCard).toContainText(reviewTitle);
    await orientationCard.locator('.adjudicate-btn').click();

    const modal = page.locator('.modal-overlay');
    await modal.locator('#artifactReviewNotes').fill(notes);
    await modal.getByRole('button', { name: 'Accept as Complete' }).click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#toast-container')).toContainText('accepted as complete');
}

export function getWhiteCellStrategicOrientationTitle(goal, team = '') {
    const normalizedGoal = String(goal || '').trim();
    const normalizedTeam = String(team || '').trim().toLowerCase();

    if (
        (normalizedTeam === 'blue' || (!normalizedTeam && normalizedGoal.startsWith('Strategic Orientation:')))
        && normalizedGoal.startsWith('Strategic Orientation:')
    ) {
        return `Blue Team Strategic Orientation Selection:${normalizedGoal.slice('Strategic Orientation:'.length)}`;
    }

    return normalizedGoal;
}

export async function createProposal(page, {
    title,
    recipientTeam = 'blue',
    recipientTeams = null,
    objective = 'Coordinate a shared economic initiative with measurable delivery milestones.',
    focusSectors = ['Biotechnology'],
    customFocusSector = null,
    supplyChainFocusDecision = 'No',
    supplyChainAreas = [],
    industryFocus = 'Advanced manufacturing',
    countryFocus = 'United States and selected partners',
    proposedActivity = 'Coordinate a shared industrial initiative with measurable delivery milestones.',
    timingAndConditions = 'Begin during the current move, subject to White Cell approval.',
    expectedOutcomes = 'Produce a durable joint position and a documented recipient response.'
} = {}) {
    if (!title) {
        throw new Error('createProposal requires a title.');
    }

    await page.locator('#newActionBtn').click();

    const modal = page.locator('.modal-overlay').filter({ has: page.locator('#proposalTitle') });
    await expect(modal).toBeVisible();
    await modal.locator('#proposalTitle').fill(title);

    const industryField = modal.locator('#proposalIndustryFocus');
    if (await industryField.count()) {
        await industryField.fill(industryFocus);
        await modal.locator('#proposalCountryFocus').fill(countryFocus);
        await modal.locator('#proposalProposedActivity').fill(proposedActivity);
    } else {
        await modal.locator('[data-proposal-originator="true"]').first().check();
        await modal.locator('#proposalObjective').fill(objective);
    }

    const resolvedRecipientTeams = recipientTeams || [recipientTeam];
    for (const team of resolvedRecipientTeams) {
        await modal.locator(`[data-proposal-partner="true"][value="${team}"]`).check();
    }
    for (const sector of focusSectors) {
        await modal.locator(`[data-proposal-sector="true"][value="${sector}"]`).check();
    }
    if (customFocusSector) {
        await modal.locator('[data-proposal-sector="true"][value="Other"]').check();
        await modal.locator('#proposalFocusSectorOther').fill(customFocusSector);
    }
    await modal.locator(`input[name="proposalHasSupplyChainFocus"][value="${supplyChainFocusDecision}"]`).check();
    if (supplyChainFocusDecision === 'Yes') {
        for (const area of supplyChainAreas) {
            await modal.locator(`[data-proposal-supply-chain-area="true"][value="${area}"]`).check();
        }
    }
    await modal.locator('#proposalTimingConditions').fill(timingAndConditions);
    await modal.locator('#proposalExpectedOutcomes').fill(expectedOutcomes);

    await modal.locator('[data-proposal-nav="forward"]').click();
    await expect(page.locator('#toast-container')).toContainText('Proposal forwarded to Facilitator');
    await expect(modal).toBeHidden();
    await expect(page.locator('#actionsList')).toContainText(title);
}

export async function submitForwardedProposalFromFacilitator(page, { title } = {}) {
    if (!title) {
        throw new Error('submitForwardedProposalFromFacilitator requires a title.');
    }

    await expect(page.locator('body')).toHaveAttribute('data-scribe-deck-state', 'ready', {
        timeout: 20000
    });

    const actionSlideLink = page.locator('#scribeSectionList button[data-slide-key^="action-"]').filter({
        hasText: title
    }).first();
    await expect(actionSlideLink).toBeVisible({ timeout: 20000 });
    await actionSlideLink.click();

    const actionFrame = page.locator('#deckActionFrame');
    await expect(actionFrame).toContainText(title);
    await actionFrame.locator('[data-scribe-action-submit]').first().click();

    const confirmModal = page.locator('.modal-overlay').filter({ hasText: 'Submit Proposal to White Cell' });
    await expect(confirmModal).toBeVisible();
    await confirmModal.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('#toast-container')).toContainText('Proposal submitted to White Cell');
}

export async function reviewProposal(page, {
    title,
    decision = 'forward_to_recipient',
    notes = 'Reviewed during the automated professional playthrough rehearsal.'
} = {}) {
    if (!title) {
        throw new Error('reviewProposal requires a title.');
    }

    await openSidebarSection(page, 'proposals');
    const proposalCard = getVisibleReviewCard(page, '#proposalsList', title).first();
    await expect(proposalCard).toBeVisible();
    await proposalCard.locator('.adjudicate-btn').click();

    const modal = page.locator('.modal-overlay').filter({ has: page.locator('#proposalReviewForm') });
    await expect(modal).toBeVisible();
    await modal.locator(`input[name="proposalReviewDecision"][value="${decision}"]`).check();
    await modal.locator('#adjudicationNotes').fill(notes);
    await modal.getByRole('button', { name: 'Submit Proposal Review' }).click();

    const expectedToast = {
        forward_to_recipient: /Proposal forwarded to/,
        request_changes: 'Proposal review saved: changes requested',
        reject: 'Proposal rejected'
    }[decision];
    await expect(page.locator('#toast-container')).toContainText(expectedToast);
    await expect(modal).toBeHidden();
}

export async function respondToForwardedProposal(page, {
    title,
    decision = 'accept',
    negotiationTerms = 'Add a six-month review clause and a shared implementation checkpoint.'
} = {}) {
    if (!title) {
        throw new Error('respondToForwardedProposal requires a title.');
    }

    await expect(page.locator('body')).toHaveAttribute('data-scribe-deck-state', 'ready', {
        timeout: 20000
    });
    const proposalsSectionTrigger = page.locator(
        '#scribeSectionList .scribe-section-trigger[data-section-label="Proposals"]'
    ).first();
    await expect(proposalsSectionTrigger).toBeVisible({ timeout: 20000 });
    if (await proposalsSectionTrigger.getAttribute('aria-expanded') !== 'true') {
        await proposalsSectionTrigger.click();
    }

    const proposalSlideLink = page.locator(
        '#scribeSectionList button[data-slide-key^="proposal-"]'
    ).filter({ hasText: title }).first();
    await expect(proposalSlideLink).toBeVisible({ timeout: 20000 });
    await proposalSlideLink.click();

    const proposalFrame = page.locator('#deckActionFrame');
    await expect(proposalFrame).toContainText(title);
    await proposalFrame.locator(`[data-facilitator-proposal-decision="${decision}"]`).click();

    if (decision === 'negotiate') {
        const modal = page.locator('.modal-overlay').filter({
            has: page.locator('#facilitatorProposalNegotiationForm')
        });
        await expect(modal).toBeVisible();
        await modal.locator('#facilitatorProposalNegotiationTerms').fill(negotiationTerms);
        await modal.getByRole('button', { name: 'Send Negotiation' }).click();
    } else {
        const decisionLabel = decision === 'not_interested' ? 'Not Interested' : 'Accept';
        const modal = page.locator('.modal-overlay');
        await expect(modal).toBeVisible();
        await modal.getByRole('button', { name: decisionLabel, exact: true }).click();
    }

    const expectedLabel = decision === 'negotiate'
        ? 'Negotiation requested'
        : (decision === 'not_interested' ? 'Not Interested' : 'Accepted');
    await expect(page.locator('#toast-container')).toContainText(`Proposal response recorded: ${expectedLabel}`);
    await expect(proposalFrame).toContainText(`Recorded response: ${expectedLabel}`);
}

export async function submitRfi(page, {
    question,
    context = 'Submitted during the automated professional playthrough rehearsal.',
    priority = 'NORMAL'
} = {}) {
    if (!question) {
        throw new Error('submitRfi requires a question.');
    }

    await openSidebarSection(page, 'requests');
    await page.locator('#newRfiBtn').click();

    const modal = page.locator('.modal-overlay').filter({ has: page.locator('#rfiForm') });
    await expect(modal).toBeVisible();
    await modal.locator('#rfiQuestion').fill(question);
    await modal.locator('#rfiPriority').selectOption(priority);
    await modal.locator('[data-rfi-checkbox="category"]').first().check();
    await modal.locator('#rfiContext').fill(context);
    await modal.getByRole('button', { name: 'Submit RFI' }).click();
    await expect(page.locator('#toast-container')).toContainText('RFI submitted');
    await expect(modal).toBeHidden();
    await expect(page.locator('#rfiList')).toContainText(question);
}

export async function answerRfi(page, {
    question,
    response
} = {}) {
    if (!question || !response) {
        throw new Error('answerRfi requires both question and response.');
    }

    await openSidebarSection(page, 'requests');
    const rfiCard = page.locator('#rfiQueue [data-rfi-id]').filter({ hasText: question }).first();
    await expect(rfiCard).toBeVisible();
    await rfiCard.getByRole('button', { name: 'Respond' }).click();

    const modal = page.locator('.modal-overlay').filter({ has: page.locator('#rfiResponseForm') });
    await expect(modal).toBeVisible();
    await modal.locator('#rfiResponse').fill(response);
    await modal.getByRole('button', { name: 'Send Response' }).click();
    await expect(page.locator('#toast-container')).toContainText('Response sent');
    await expect(modal).toBeHidden();
}

export async function sendWhiteCellCommunication(page, {
    recipient,
    content,
    type = 'GUIDANCE'
} = {}) {
    if (!recipient || !content) {
        throw new Error('sendWhiteCellCommunication requires recipient and content.');
    }

    await openSidebarSection(page, 'communications');
    await page.locator('#commRecipient').selectOption(recipient);
    await page.locator('#commType').selectOption(type);
    await page.locator('#commContent').fill(content);
    await page.locator('#commForm').getByRole('button', { name: 'Send Communication' }).click();
    await expect(page.locator('#commContent')).toHaveValue('');
    await expect(page.locator('#toast-container')).toContainText('Communication sent');
    await expect(page.locator('#commHistory')).toContainText(content);
}

export async function appendNotetakerObservation(page, content) {
    await openSidebarSection(page, 'capture');
    await page.locator('#captureContent').fill(content);
    await page.locator('#captureForm').getByRole('button', { name: 'Save Observation' }).click();
    await waitForToast(page, 'Observation saved');
    await expect(page.locator('#recentCaptures')).toContainText(content);
}

export async function waitForToast(page, message) {
    await expect(page.locator('#toast-container')).toContainText(message);
}

export async function logoutCurrentUser(page) {
    const logoutButton = page.locator('#logoutBtn');
    const actionLabel = (await logoutButton.innerText()).trim() || 'Logout';

    await logoutButton.click();

    const modal = page.locator('.modal-overlay');
    await expect(modal).toContainText('You will not lose saved session data.');
    await expect(modal).toContainText('Logging out only releases this seat.');
    await modal.getByRole('button', { name: actionLabel }).click();
}

export function getSessionFromState(backendState, sessionCode) {
    return backendState.tables.sessions.find((session) => normalizeSessionCode(session) === sessionCode) || null;
}

export function getActiveSeatCounts(backendState, sessionId) {
    return backendState.tables.session_participants
        .filter((seat) => seat.session_id === sessionId && seat.is_active === true)
        .reduce((counts, seat) => {
            counts[seat.role] = (counts[seat.role] || 0) + 1;
            return counts;
        }, {});
}

export async function seedLargeExerciseData(page, {
    sessionCode,
    actionCount = 90,
    requestCount = 36,
    communicationCount = 48,
    timelineCount = 180,
    participantCount = 60
} = {}) {
    if (!sessionCode) {
        throw new Error('seedLargeExerciseData requires a sessionCode.');
    }

    return page.evaluate(({
        stateKey,
        requestedSessionCode,
        counts
    }) => {
        const clone = (value) => JSON.parse(JSON.stringify(value));
        const readState = () => {
            const raw = globalThis.localStorage.getItem(stateKey);
            if (!raw) {
                throw new Error('Mock backend state is not initialized.');
            }
            return JSON.parse(raw);
        };
        const writeState = (state) => {
            globalThis.localStorage.setItem(stateKey, JSON.stringify(state));
        };
        const normalizeCode = (session = {}) => String(session.session_code || session.metadata?.session_code || '')
            .trim()
            .toUpperCase();
        const timestamp = (index) => new Date(Date.UTC(2026, 0, 15, 14, 0, 0) - (index * 60000)).toISOString();
        const staleTimestamp = (index) => new Date(Date.UTC(2026, 0, 14, 14, 0, 0) - (index * 60000)).toISOString();
        const ensureTable = (state, tableName) => {
            state.tables[tableName] = Array.isArray(state.tables[tableName])
                ? state.tables[tableName]
                : [];
            state.counters[tableName] = Number(state.counters[tableName] || 0);
        };
        const stripScaleRows = (state, tableName) => {
            ensureTable(state, tableName);
            state.tables[tableName] = state.tables[tableName].filter((row) => (
                !String(row?.id || '').startsWith('scale_')
            ));
        };
        const setCounterFloor = (state, tableName, value) => {
            state.counters[tableName] = Math.max(Number(state.counters[tableName] || 0), value);
        };
        const blueDetails = (index) => [
            'Blue Team Action Details',
            `Objective: Preserve coalition leverage through sequenced economic measures ${index}.`,
            'Levers: ["Export Controls","Investment Screening"]',
            'Sectors: ["Biotechnology","Telecommunications"]',
            'Implementation: Executive Order',
            'Legislative Options: None selected',
            index % 2 === 0 ? 'Enforcement Timeline: 6 months' : 'Enforcement Timeline: 12 months',
            'Coordinated: ["Executive"]',
            'Informed: ["Allies"]'
        ].join('\n');
        const proposalDetails = (index) => [
            'Proposal Details',
            index % 2 === 0 ? 'Originators: EU, Japan' : 'Originators: ASEAN, ROK',
            `Objective: Negotiate conditional alignment package ${index}.`,
            index % 3 === 0 ? 'Category: Conditions' : 'Category: Partnership',
            'Intended Partners: Blue and Red principals',
            index % 2 === 0 ? 'Delivery: Joint Statement' : 'Delivery: Backchannel Negotiation',
            'Timing And Conditions: Before the next move adjudication window.',
            index % 2 === 0 ? 'Recipient Team: blue' : 'Recipient Team: red'
        ].join('\n');
        const responseDetails = (index) => [
            'Move Response Details',
            `Strategic Assessment: Contest the coalition theory of pressure ${index}.`,
            'Response Strategy: Redirect attention to partner economic exposure.',
            'Key Actions: Signal countermeasures, apply diplomatic pressure, and test Green alignment.',
            'Targets And Pressure Points: Semiconductor access, investment approvals, and port access.',
            'Delivery Channel: Public statement and private envoy'
        ].join('\n');
        const buildAction = (index) => {
            const teams = ['blue', 'green', 'red', 'industry'];
            const team = teams[(index - 1) % teams.length];
            const move = ((index - 1) % 3) + 1;
            const teamOrdinal = Math.floor((index - 1) / teams.length);
            const status = teamOrdinal % 3 === 0
                ? 'submitted'
                : (teamOrdinal % 3 === 1 ? 'adjudicated' : 'draft');
            const base = {
                id: `scale_action_${String(index).padStart(3, '0')}`,
                session_id: session.id,
                client_id: `scale_client_${team}`,
                team,
                move,
                phase: ((index - 1) % 5) + 1,
                priority: index % 5 === 0 ? 'HIGH' : 'NORMAL',
                status,
                is_deleted: false,
                created_at: timestamp(index),
                updated_at: timestamp(index),
                submitted_at: status === 'draft' ? null : timestamp(index - 1),
                adjudicated_at: status === 'adjudicated' ? timestamp(index - 2) : null,
                outcome: status === 'adjudicated' ? (index % 4 === 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS') : null,
                adjudication_notes: status === 'adjudicated'
                    ? `White Cell deliberation note for seeded record ${index}.`
                    : null
            };

            if (team === 'green' || team === 'industry') {
                const teamLabel = team === 'industry' ? 'Industry' : 'Green';
                return {
                    ...base,
                    mechanism: 'Proposal',
                    sector: index % 2 === 0 ? 'Biotechnology' : 'Telecommunications',
                    exposure_type: 'Alliance',
                    targets: ['EU', 'Japan'],
                    goal: `${teamLabel} Proposal ${String(index).padStart(3, '0')}`,
                    expected_outcomes: `Shape partner alignment options without closing off future hedging ${index}.`,
                    ally_contingencies: proposalDetails(index)
                };
            }

            if (team === 'red') {
                return {
                    ...base,
                    mechanism: 'Move Response',
                    sector: 'Technology',
                    exposure_type: 'Political',
                    targets: ['PRC', 'BRICS+'],
                    goal: `Red Move Response ${String(index).padStart(3, '0')}`,
                    expected_outcomes: `Complicate Blue sequencing and test Green resistance ${index}.`,
                    ally_contingencies: responseDetails(index)
                };
            }

            return {
                ...base,
                mechanism: 'Economic',
                sector: index % 2 === 0 ? 'Biotechnology' : 'Telecommunications',
                exposure_type: 'Advanced Manufacturing',
                targets: ['PRC', 'Japan'],
                goal: `Blue Decision ${String(index).padStart(3, '0')}`,
                expected_outcomes: `Increase allied coordination while preserving implementation flexibility ${index}.`,
                ally_contingencies: blueDetails(index)
            };
        };
        const buildRequest = (index) => {
            const teams = ['blue', 'green', 'red', 'industry'];
            const team = teams[(index - 1) % teams.length];
            const answered = index % 2 === 0;
            return {
                id: `scale_request_${String(index).padStart(3, '0')}`,
                session_id: session.id,
                client_id: `scale_client_${team}`,
                team,
                move: ((index - 1) % 3) + 1,
                phase: ((index - 1) % 5) + 1,
                priority: index % 6 === 0 ? 'URGENT' : (index % 3 === 0 ? 'HIGH' : 'NORMAL'),
                categories: index % 2 === 0 ? ['Alliance Response'] : ['Economic Impact'],
                query: `${team.charAt(0).toUpperCase()}${team.slice(1)} RFI ${String(index).padStart(3, '0')}: clarify expected partner reaction and implementation timing.`,
                status: answered ? 'answered' : 'pending',
                response: answered ? `White Cell answer for seeded RFI ${index}.` : null,
                responded_by: answered ? 'white_cell' : null,
                responded_at: answered ? timestamp(index - 1) : null,
                created_at: timestamp(200 + index),
                updated_at: timestamp(200 + index)
            };
        };
        const buildCommunication = (index) => {
            const recipients = ['blue', 'green', 'red', 'industry', 'all'];
            const recipient = recipients[(index - 1) % recipients.length];
            const updateKind = index % 10 === 0
                ? 'verba_ai_population_sentiment'
                : (index % 7 === 0 ? 'tribe_street_journal' : null);
            return {
                id: `scale_communication_${String(index).padStart(3, '0')}`,
                session_id: session.id,
                linked_request_id: null,
                type: updateKind ? 'WHITE_CELL_UPDATE' : (index % 4 === 0 ? 'INJECT' : 'GUIDANCE'),
                from_role: 'white_cell',
                to_role: recipient,
                content: `Seeded White Cell ${updateKind || 'communication'} ${String(index).padStart(3, '0')} for larger-exercise rehearsal.`,
                metadata: updateKind ? { update_kind: updateKind } : { source: 'scale_rehearsal' },
                created_at: timestamp(300 + index),
                updated_at: timestamp(300 + index)
            };
        };
        const buildTimeline = (index) => {
            const teams = ['blue', 'green', 'red', 'industry', 'white_cell', 'system'];
            const types = ['ACTION_SUBMITTED', 'RFI_CREATED', 'GUIDANCE', 'NOTE', 'MOMENT', 'PHASE_CHANGE'];
            const actorTeam = teams[(index - 1) % 4];
            return {
                id: `scale_timeline_${String(index).padStart(3, '0')}`,
                session_id: session.id,
                type: types[(index - 1) % types.length],
                content: `Timeline Event ${String(index).padStart(3, '0')}: seeded exercise activity for scale rehearsal.`,
                team: teams[(index - 1) % teams.length],
                metadata: {
                    actor: index % 5 === 0 ? 'White Cell' : 'Scribe',
                    role: index % 5 === 0 ? 'whitecell_lead' : `${actorTeam}_facilitator`
                },
                move: ((index - 1) % 3) + 1,
                phase: ((index - 1) % 5) + 1,
                client_id: `scale_timeline_client_${index}`,
                created_at: timestamp(400 + index),
                updated_at: timestamp(400 + index)
            };
        };
        const buildParticipantRows = (index) => {
            const roles = [
                'blue_facilitator',
                'blue_scribe',
                'blue_notetaker',
                'red_facilitator',
                'red_scribe',
                'red_notetaker',
                'green_facilitator',
                'green_scribe',
                'green_notetaker',
                'industry_facilitator',
                'industry_scribe',
                'industry_notetaker',
                'whitecell_lead',
                'whitecell_support'
            ];
            const role = roles[(index - 1) % roles.length];
            const participantId = `scale_participant_${String(index).padStart(3, '0')}`;
            const seatId = `scale_seat_${String(index).padStart(3, '0')}`;
            const time = staleTimestamp(index);
            return {
                participant: {
                    id: participantId,
                    auth_user_id: `scale_auth_${String(index).padStart(3, '0')}`,
                    client_id: `scale_participant_client_${String(index).padStart(3, '0')}`,
                    name: `Historical Participant ${String(index).padStart(2, '0')}`,
                    role,
                    created_at: time,
                    updated_at: time
                },
                seat: {
                    id: seatId,
                    session_id: session.id,
                    participant_id: participantId,
                    role,
                    is_active: false,
                    heartbeat_at: time,
                    joined_at: time,
                    last_seen: time,
                    disconnected_at: time,
                    left_at: time,
                    created_at: time,
                    updated_at: time
                }
            };
        };

        const state = readState();
        const session = (state.tables.sessions || []).find((entry) => (
            normalizeCode(entry) === String(requestedSessionCode || '').trim().toUpperCase()
        ));

        if (!session) {
            throw new Error(`Session ${requestedSessionCode} not found in mock backend.`);
        }

        [
            'actions',
            'requests',
            'communications',
            'timeline',
            'participants',
            'session_participants',
            'notetaker_data'
        ].forEach((tableName) => stripScaleRows(state, tableName));

        const participantRows = Array.from({ length: counts.participantCount }, (_, index) => buildParticipantRows(index + 1));

        state.tables.actions.push(...Array.from({ length: counts.actionCount }, (_, index) => buildAction(index + 1)));
        state.tables.requests.push(...Array.from({ length: counts.requestCount }, (_, index) => buildRequest(index + 1)));
        state.tables.communications.push(...Array.from({ length: counts.communicationCount }, (_, index) => buildCommunication(index + 1)));
        state.tables.timeline.push(...Array.from({ length: counts.timelineCount }, (_, index) => buildTimeline(index + 1)));
        state.tables.participants.push(...participantRows.map((row) => row.participant));
        state.tables.session_participants.push(...participantRows.map((row) => row.seat));

        [
            ['actions', counts.actionCount + 1000],
            ['requests', counts.requestCount + 1000],
            ['communications', counts.communicationCount + 1000],
            ['timeline', counts.timelineCount + 1000],
            ['participants', counts.participantCount + 1000],
            ['session_participants', counts.participantCount + 1000]
        ].forEach(([tableName, value]) => setCounterFloor(state, tableName, value));

        writeState(state);

        return {
            sessionId: session.id,
            actionCount: counts.actionCount,
            requestCount: counts.requestCount,
            communicationCount: counts.communicationCount,
            timelineCount: counts.timelineCount,
            participantCount: counts.participantCount,
            state: clone(state)
        };
    }, {
        stateKey: E2E_MOCK_STATE_KEY,
        requestedSessionCode: sessionCode,
        counts: {
            actionCount,
            requestCount,
            communicationCount,
            timelineCount,
            participantCount
        }
    });
}
