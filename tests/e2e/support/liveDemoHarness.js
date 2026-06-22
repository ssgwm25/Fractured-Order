import { expect } from '@playwright/test';

import { dumpE2EMockBackend, E2E_MOCK_OPERATOR_ACCESS_CODE } from './mockBackend.js';
import {
    buildAppUrl,
    classifyOperatorAuthorizationProgress,
    getHostedOperatorAccessCode,
    resolveOperatorAccessCode
} from './rehearsalRuntime.js';

const SHARED_LOCAL_STORAGE_KEYS = Object.freeze([
    'esg_e2e_backend_state',
    '__esg_e2e_backend_reset__'
]);

const BACKEND_RESET_KEY = '__esg_e2e_backend_reset__';
const E2E_MOCK_ENABLEMENT_KEY = '__esg_e2e_mock_enabled';
const E2E_MOCK_CONFIG_KEY = '__esg_e2e_mock_config';
const OPERATOR_AUTH_TIMEOUT_MS = 20000;
const HOSTED_OPERATOR_ACCESS_CODE = getHostedOperatorAccessCode();

export { buildAppUrl } from './rehearsalRuntime.js';

export const OPERATOR_ACCESS_CODE = resolveOperatorAccessCode(E2E_MOCK_OPERATOR_ACCESS_CODE);
export const LANDING_URL_PATTERN = /(?:\/|\/index\.html)(?:#.*)?$/;

export const DEFAULT_ACTION_PAYLOAD = Object.freeze({
    instrumentOfPower: 'Economic',
    lever: 'Export Controls',
    sector: 'Biotechnology',
    supplyChainFocus: 'Advanced Manufacturing',
    implementation: 'Executive Order',
    legislativeOptions: [],
    focusCountries: ['PRC', 'Japan'],
    enforcementTimeline: '6 months',
    expectedOutcomes: 'Reduce allied dependence and build leverage before the next move begins.',
    coordinated: ['Executive'],
    informed: ['Allied']
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
    await page.goto(buildAppUrl());
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
    await page.locator('.sidebar-link[data-section="sessions"]').click();
    await page.locator('#createSessionBtn').click();

    const modal = page.locator('.modal-overlay');
    await modal.locator('#sessionName').fill(sessionName);
    await modal.locator('#sessionCode').fill(sessionCode);
    await modal.locator('#sessionDescription').fill(description);
    await modal.getByRole('button', { name: 'Create Session' }).click();

    await expect(page.locator('#sessionsList')).toContainText(sessionName);
    await expect(page.locator('#sessionsList')).toContainText(sessionCode);

    const backendState = await dumpE2EMockBackend(page);
    return backendState.tables.sessions.find((session) => normalizeSessionCode(session) === sessionCode) || null;
}

export async function joinPublicParticipant(page, {
    sessionCode,
    displayName,
    team = 'blue',
    roleSurface = 'facilitator'
} = {}) {
    await page.goto(buildAppUrl());
    await prepareLandingPage(page);
    await page.locator('#sessionCode').fill(sessionCode);
    await page.locator('#displayName').fill(displayName);
    await page.locator(`.chip[data-team="${team}"]`).click();
    await page.locator(`.chip[data-role-surface="${roleSurface}"]`).click();
    await page.getByRole('button', { name: 'Join Session' }).click();
    await page.waitForURL(resolveExpectedUrlPattern(roleSurface));
}

export async function expectJoinFailure(page, joinOptions, expectedMessage) {
    await page.goto(buildAppUrl());
    await prepareLandingPage(page);
    await page.locator('#sessionCode').fill(joinOptions.sessionCode);
    await page.locator('#displayName').fill(joinOptions.displayName);
    await page.locator(`.chip[data-team="${joinOptions.team || 'blue'}"]`).click();
    await page.locator(`.chip[data-role-surface="${joinOptions.roleSurface || 'facilitator'}"]`).click();
    await page.getByRole('button', { name: 'Join Session' }).click();

    await expect(page.locator('#joinForm')).toBeVisible();
    await expect(page.locator('#toast-container')).toContainText(expectedMessage);
}

export async function authorizeWhiteCell(page, {
    sessionCode,
    displayName,
    operatorRole = 'lead',
    operatorAccessCode = OPERATOR_ACCESS_CODE
} = {}) {
    requireHostedOperatorAccessCode();
    await page.goto(buildAppUrl());
    await prepareLandingPage(page);
    await page.locator('#sessionCode').fill(sessionCode);
    await page.locator('#displayName').fill(displayName);
    await openOperatorAccessSection(page);
    await page.locator('#operatorAccessCode').fill(operatorAccessCode);

    const accessButtonId = operatorRole === 'support'
        ? '#operatorWhiteCellSupportBtn'
        : '#operatorWhiteCellLeadBtn';

    await page.locator(accessButtonId).click();
    await waitForOperatorAuthorizationRoute(page, /whitecell\.html/, `White Cell ${operatorRole}`);
}

export async function openSidebarSection(page, section) {
    await page.locator(`.sidebar-link[data-section="${section}"]`).click();
}

export async function createDraftAction(page, {
    goal,
    objective = goal,
    instrumentOfPower = DEFAULT_ACTION_PAYLOAD.instrumentOfPower,
    lever = DEFAULT_ACTION_PAYLOAD.lever,
    sector = DEFAULT_ACTION_PAYLOAD.sector,
    supplyChainFocus = DEFAULT_ACTION_PAYLOAD.supplyChainFocus,
    implementation = DEFAULT_ACTION_PAYLOAD.implementation,
    legislativeOptions = DEFAULT_ACTION_PAYLOAD.legislativeOptions,
    focusCountries = DEFAULT_ACTION_PAYLOAD.focusCountries,
    enforcementTimeline = DEFAULT_ACTION_PAYLOAD.enforcementTimeline,
    expectedOutcomes = DEFAULT_ACTION_PAYLOAD.expectedOutcomes,
    coordinated = DEFAULT_ACTION_PAYLOAD.coordinated,
    informed = DEFAULT_ACTION_PAYLOAD.informed
} = {}) {
    const builtInTimelines = new Set(['3 months', '6 months', '12 months', 'Other']);
    const levers = Array.isArray(lever) ? lever : [lever];
    const sectors = Array.isArray(sector) ? sector : [sector];

    await page.locator('#newActionBtn').click();

    const modal = page.locator('.modal-overlay');
    await modal.locator('#actionTitle').fill(goal);
    await modal.locator('#actionObjective').fill(objective);
    await modal.locator('#actionInstrument').selectOption(instrumentOfPower);
    for (const leverValue of levers) {
        await modal.locator(`[data-blue-action-checkbox="lever"][value="${leverValue}"]`).check();
    }
    await modal.getByRole('button', { name: 'Next' }).click();

    for (const sectorValue of sectors) {
        await modal.locator(`[data-blue-action-checkbox="sector"][value="${sectorValue}"]`).check();
    }
    await modal.locator('#actionSupplyChainFocus').selectOption(supplyChainFocus);
    await modal.locator('#actionImplementation').selectOption(implementation);
    if (implementation === 'Legislative') {
        for (const legislativeOption of legislativeOptions) {
            await modal.locator(`[data-blue-action-checkbox="legislative"][value="${legislativeOption}"]`).check();
        }
    }
    for (const focusCountry of focusCountries) {
        await modal.locator(`[data-blue-action-checkbox="country"][value="${focusCountry}"]`).check();
    }
    if (builtInTimelines.has(enforcementTimeline)) {
        await modal.locator('#actionEnforcementTimeline').selectOption(enforcementTimeline);
    } else {
        await modal.locator('#actionEnforcementTimeline').selectOption('Other');
        await modal.locator('#actionEnforcementTimelineOther').fill(enforcementTimeline);
    }
    await modal.locator('#actionExpectedOutcomes').fill(expectedOutcomes);
    await modal.getByRole('button', { name: 'Next' }).click();

    for (const coordinatedValue of coordinated) {
        await modal.locator(`[data-blue-action-checkbox="coordinated"][value="${coordinatedValue}"]`).check();
    }

    for (const informedValue of informed) {
        await modal.locator(`[data-blue-action-checkbox="informed"][value="${informedValue}"]`).check();
    }

    await modal.getByRole('button', { name: 'Save Draft' }).click();

    await expect(page.locator('#actionsList')).toContainText(goal);
}

export async function submitAction(page, goal) {
    const actionCard = page.locator('#actionsList > *').filter({ hasText: goal }).first();
    await actionCard.getByRole('button', { name: 'Submit to White Cell' }).click();
    await page.locator('.modal-overlay').getByRole('button', { name: 'Submit' }).click();
    await expect(actionCard).toContainText('Submitted to White Cell');
}

export async function adjudicateAction(page, {
    goal,
    outcome = 'SUCCESS',
    notes = 'Validated through the live-demo topology suite.'
} = {}) {
    await openSidebarSection(page, 'actions');

    const actionsCard = page.locator('#actionsList > *').filter({ hasText: goal }).first();
    const adjudicationCard = await actionsCard.count() > 0
        ? actionsCard
        : page.locator('#adjudicationQueue > *').filter({ hasText: goal }).first();
    await expect(adjudicationCard).toContainText(goal);
    await adjudicationCard.locator('.adjudicate-btn').click();

    const modal = page.locator('.modal-overlay');
    await modal.locator('#outcomeSelect').selectOption(outcome);
    await modal.locator('#adjudicationNotes').fill(notes);
    await modal.getByRole('button', { name: /^(Record Deliberation|Submit Adjudication)$/ }).click();
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
