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
import { expectBrowserConsoleError } from './browserDiagnostics.js';
import {
    classifyWorkflowToastEntries,
    WORKFLOW_TOAST_CAPTURE_KEY
} from './workflowToastCapture.js';

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
const ACTOR_ACTION_TIMEOUT_MS = 30000;
const DURABLE_WORKFLOW_WRITE_TIMEOUT_MS = 60000;

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

async function activateReconciledControl(control) {
    await expect(control).toBeVisible();
    await expect(control).toBeEnabled();
    await control.dispatchEvent('click');
}

async function activateAndCaptureWorkflowToast(page, control, expectedMessage, {
    timeout = DURABLE_WORKFLOW_WRITE_TIMEOUT_MS
} = {}) {
    await page.evaluate((captureKey) => {
        globalThis[captureKey]?.observer?.disconnect?.();

        const entries = [];
        const captureToast = (toast) => {
            if (!(toast instanceof HTMLElement) || !toast.matches('.toast')) return;

            const typeClass = Array.from(toast.classList)
                .find((className) => className.startsWith('toast-')
                    && !['toast-visible', 'toast-hiding', 'toast-durable'].includes(className));
            entries.push({
                type: typeClass?.slice('toast-'.length) || 'info',
                text: toast.textContent?.trim() || ''
            });
        };
        const observer = new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    captureToast(node);
                    node.querySelectorAll?.('.toast').forEach(captureToast);
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        globalThis[captureKey] = { entries, observer };
    }, WORKFLOW_TOAST_CAPTURE_KEY);

    try {
        await activateReconciledControl(control);
        const outcomeHandle = await page.waitForFunction(({ captureKey, expected }) => {
            const capturedEntries = globalThis[captureKey]?.entries || [];
            const success = capturedEntries.find((entry) => entry.text.includes(expected));
            if (success) return success;

            return capturedEntries.find((entry) => entry.type === 'error') || null;
        }, {
            captureKey: WORKFLOW_TOAST_CAPTURE_KEY,
            expected: expectedMessage
        }, { timeout });
        const capturedEntries = await page.evaluate(
            (captureKey) => globalThis[captureKey]?.entries || [],
            WORKFLOW_TOAST_CAPTURE_KEY
        );
        const outcome = classifyWorkflowToastEntries(capturedEntries, expectedMessage);
        await outcomeHandle.dispose();

        if (outcome.status === 'error') {
            throw new Error(`Workflow reported an error: ${outcome.entry.text}`);
        }
        if (outcome.status !== 'success') {
            throw new Error(`Workflow did not report the expected notification: ${expectedMessage}`);
        }
    } catch (error) {
        const capturedEntries = await page.evaluate(
            (captureKey) => globalThis[captureKey]?.entries || [],
            WORKFLOW_TOAST_CAPTURE_KEY
        ).catch(() => []);
        const capturedSummary = capturedEntries
            .map((entry) => `${entry.type}: ${entry.text}`)
            .join(' | ');
        if (capturedSummary && !String(error?.message || '').includes(capturedSummary)) {
            throw new Error(
                `${error.message} Captured workflow notifications: ${capturedSummary}`,
                { cause: error }
            );
        }
        throw error;
    } finally {
        await page.evaluate((captureKey) => {
            globalThis[captureKey]?.observer?.disconnect?.();
            delete globalThis[captureKey];
        }, WORKFLOW_TOAST_CAPTURE_KEY).catch(() => {});
    }
}

async function openModalFromReconciledControl(control, modal) {
    await expect.poll(async () => {
        if (await modal.count() > 0) return true;

        const isAvailable = await control.isVisible().catch(() => false)
            && await control.isEnabled().catch(() => false);
        if (!isAvailable) return false;

        await control.evaluate((element) => {
            if (!element.isConnected) return;
            element.click();
        }).catch(() => {});
        return await modal.count() > 0;
    }, {
        timeout: ACTOR_ACTION_TIMEOUT_MS,
        intervals: [100, 250, 500, 1000],
        message: 'Expected the live review control to open its modal.'
    }).toBe(true);

    await expect(modal).toBeVisible({ timeout: ACTOR_ACTION_TIMEOUT_MS });
}

async function checkReconciledCheckbox(checkbox) {
    await expect.poll(async () => {
        const state = await checkbox.evaluateAll((elements) => {
            const input = elements.find((element) => {
                if (!(element instanceof HTMLInputElement) || element.disabled) return false;
                const style = window.getComputedStyle(element);
                return style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && element.getClientRects().length > 0;
            });
            if (!input) return { available: false, checked: false };

            if (!input.checked) {
                input.checked = true;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return { available: true, checked: input.checked };
        }).catch(() => ({ available: false, checked: false }));
        return state.available && state.checked;
    }, {
        timeout: ACTOR_ACTION_TIMEOUT_MS,
        intervals: [100, 250, 500, 1000],
        message: 'Expected the live recipient approval checkbox to remain selected.'
    }).toBe(true);
}

async function selectReviewQueueTab(page, containerSelector, tab = 'pending') {
    const tabControl = page.locator(`${containerSelector} .tab-button[data-review-tab="${tab}"]`);
    await expect(tabControl).toBeVisible();
    if (await tabControl.getAttribute('aria-selected') !== 'true') {
        await activateReconciledControl(tabControl);
    }
    await expect(tabControl).toHaveAttribute('aria-selected', 'true');
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
    page.setDefaultTimeout(ACTOR_ACTION_TIMEOUT_MS);

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

/**
 * Install a deterministic in-page microphone/MediaRecorder implementation.
 * Operational rehearsals use the real plugin controls and delivery/storage
 * paths without depending on CI audio hardware or an interactive permission
 * prompt.
 */
export async function installDeterministicAudioCapture(page) {
    await page.evaluate(() => {
        const tracks = [];

        class DeterministicMediaRecorder extends EventTarget {
            static isTypeSupported(mimeType) {
                return String(mimeType || '').startsWith('audio/');
            }

            constructor(stream, options = {}) {
                super();
                this.stream = stream;
                this.mimeType = options.mimeType || 'audio/webm';
                this.audioBitsPerSecond = options.audioBitsPerSecond || 128000;
                this.state = 'inactive';
            }

            start() {
                this.state = 'recording';
            }

            pause() {
                if (this.state !== 'recording') {
                    throw new Error('Recorder is not recording.');
                }
                this.state = 'paused';
            }

            resume() {
                if (this.state !== 'paused') {
                    throw new Error('Recorder is not paused.');
                }
                this.state = 'recording';
            }

            stop() {
                if (this.state === 'inactive') return;
                this.state = 'inactive';
                const dataEvent = new Event('dataavailable');
                Object.defineProperty(dataEvent, 'data', {
                    value: new Blob(['deterministic-operational-audio'], { type: this.mimeType })
                });
                this.dispatchEvent(dataEvent);
                this.dispatchEvent(new Event('stop'));
            }
        }

        const mediaDevices = {
            getSupportedConstraints: () => ({
                autoGainControl: true,
                channelCount: true,
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: true
            }),
            getUserMedia: async () => {
                const track = {
                    kind: 'audio',
                    readyState: 'live',
                    stop() {
                        this.readyState = 'ended';
                    }
                };
                tracks.push(track);
                return {
                    active: true,
                    getAudioTracks: () => [track],
                    getTracks: () => [track]
                };
            }
        };

        Object.defineProperty(globalThis.navigator, 'mediaDevices', {
            configurable: true,
            value: mediaDevices
        });
        Object.defineProperty(globalThis, 'MediaRecorder', {
            configurable: true,
            value: DeterministicMediaRecorder
        });
        globalThis.__ESG_E2E_AUDIO_TRACKS__ = tracks;
    });
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

/**
 * Rehearsal flows exercise the native role workspace after entry. First-use
 * Start Here guidance intentionally opens above that workspace, so settle it
 * through the same accessible minimize control a participant uses before the
 * helper returns. Onboarding-specific tests can opt out at the entry helper.
 */
export async function minimizeStartHereGuide(page) {
    const guide = page.locator('.follow-along').first();
    await expect(guide).toBeAttached({ timeout: 20000 });

    if (await guide.getAttribute('data-minimized') !== 'true') {
        const minimizeButton = guide.getByRole('button', {
            name: 'Minimize to sidebar',
            exact: true
        });
        await expect(minimizeButton).toBeVisible();
        await minimizeButton.click();
    }

    await expect(guide).toHaveAttribute('data-minimized', 'true');
    await expect(page.locator('.follow-along-popup-host:not([hidden])')).toHaveCount(0);
}

export async function authorizeGameMaster(page, {
    displayName = 'Game Master Operator',
    operatorAccessCode = OPERATOR_ACCESS_CODE,
    minimizeOnboarding = true
} = {}) {
    requireHostedOperatorAccessCode();
    await page.goto(buildAppUrl(), APP_NAVIGATION_OPTIONS);
    await page.locator('#displayName').fill(displayName);
    await openOperatorAccessSection(page);
    await page.locator('#operatorAccessCode').fill(operatorAccessCode);
    await page.locator('#operatorGameMasterBtn').click();
    await waitForOperatorAuthorizationRoute(page, /master\.html/, 'Game Master');
    if (minimizeOnboarding) {
        await minimizeStartHereGuide(page);
    }
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
    roleSurface = 'facilitator',
    minimizeOnboarding = true
} = {}) {
    await page.goto(buildAppUrl(), APP_NAVIGATION_OPTIONS);
    await prepareLandingPage(page);
    await page.locator('#sessionCode').fill(sessionCode);
    await page.locator('#displayName').fill(displayName);
    await page.locator(`.chip[data-team="${team}"]`).click();
    await page.locator(`.chip[data-role-surface="${roleSurface}"]`).click();
    await page.getByRole('button', { name: 'Join Session' }).click();
    await page.waitForURL(resolveExpectedUrlPattern(roleSurface));
    if (minimizeOnboarding) {
        await minimizeStartHereGuide(page);
    }
}

export async function expectJoinFailure(page, joinOptions, expectedMessage) {
    await page.goto(buildAppUrl(), APP_NAVIGATION_OPTIONS);
    await prepareLandingPage(page);
    await page.locator('#sessionCode').fill(joinOptions.sessionCode);
    await page.locator('#displayName').fill(joinOptions.displayName);
    await page.locator(`.chip[data-team="${joinOptions.team || 'blue'}"]`).click();
    await page.locator(`.chip[data-role-surface="${joinOptions.roleSurface || 'facilitator'}"]`).click();
    const escapedExpectedMessage = String(expectedMessage)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expectBrowserConsoleError(
        page,
        new RegExp(`\\[Database\\].*Seat claim RPC failed:.*${escapedExpectedMessage}`)
    );
    expectBrowserConsoleError(
        page,
        new RegExp(`\\[Landing\\].*Failed to join session:.*${escapedExpectedMessage}`)
    );
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
    operatorAccessCode = OPERATOR_ACCESS_CODE,
    minimizeOnboarding = true
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
    if (minimizeOnboarding) {
        await minimizeStartHereGuide(page);
    }
}

const SME_ACCESS_BUTTONS = Object.freeze({
    econ: '#smeEconBtn',
    ni_escalation: '#smeNiEscalationBtn',
    diplomacy_information: '#smeDiplomacyInfoBtn',
    tsj: '#smeTsjBtn',
    verba: '#smeVerbaBtn'
});

export async function authorizeSme(page, {
    sessionCode,
    smeRole,
    operatorAccessCode = OPERATOR_ACCESS_CODE,
    minimizeOnboarding = true
} = {}) {
    const accessButton = SME_ACCESS_BUTTONS[smeRole];
    if (!accessButton) {
        throw new Error(`authorizeSme received unsupported SME role "${smeRole || ''}".`);
    }

    requireHostedOperatorAccessCode();
    await page.goto(buildAppUrl(), APP_NAVIGATION_OPTIONS);
    await prepareLandingPage(page);

    const smeAccessSection = page.locator('#smeAccessSection');
    if (!(await smeAccessSection.evaluate((element) => element.hasAttribute('open')))) {
        await smeAccessSection.evaluate((element) => element.setAttribute('open', ''));
    }

    await page.locator('#smeSessionCode').fill(sessionCode);
    await page.locator('#smeAccessCode').fill(operatorAccessCode);
    await page.locator(accessButton).click();
    await waitForOperatorAuthorizationRoute(page, /sme\.html/, `SME ${smeRole}`);
    if (minimizeOnboarding) {
        await minimizeStartHereGuide(page);
    }
}

export async function openSidebarSection(page, section) {
    await page.bringToFront();
    const link = page.locator(`.sidebar-link[data-section="${section}"]`);
    await expect(link).toBeVisible({ timeout: 20000 });
    if (await link.getAttribute('aria-current') !== 'page') {
        await link.dispatchEvent('click');
    }
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(page.locator(`#${section}Section`)).toBeVisible();
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

    await openSidebarSection(page, 'actions');
    await expect(page.locator('#newActionBtn')).toBeVisible();
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
    const actionCard = page.locator('#actionsList [data-action-mark-panel] .entity-card')
        .filter({ hasText: goal })
        .first();
    await expect(actionCard).toHaveCount(1, { timeout: 20000 });

    if (!await actionCard.isVisible()) {
        const markKey = await actionCard.evaluate((card) => (
            card.closest('[data-action-mark-panel]')?.dataset.actionMarkPanel || ''
        ));
        expect(markKey).not.toBe('');

        const markTab = page.locator(`#actionsList [data-action-mark-tab="${markKey}"]`);
        await expect(markTab).toBeVisible({ timeout: 20000 });
        await markTab.click();
    }

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
    ownOrientation = 'pressure',
    orientation,
    forecasts = null,
    orientationRationale = '',
    forecastActionDescription = '',
    strategyDescription = '',
    rationale = 'Topology rehearsal orientation recorded before the normal move gate.'
} = {}) {
    await page.bringToFront();
    const normalizedTeam = String(team).toLowerCase();
    const resolvedOwnOrientation = orientation || ownOrientation;
    const defaultForecasts = {
        blue: { red: 'stabilization' },
        red: { blue: 'pressure', green_asian_pacific: 'reframe', green_europe: 'stabilization' },
        green: { blue: 'pressure' },
        industry: { blue: 'pressure' }
    }[normalizedTeam] || {};
    const resolvedForecasts = forecasts || defaultForecasts;
    const resolvedNarratives = {
        orientationRationale: orientationRationale || (normalizedTeam === 'red' ? rationale : ''),
        forecastActionDescription: forecastActionDescription || (normalizedTeam === 'blue' ? rationale : ''),
        strategyDescription: strategyDescription || (['green', 'industry'].includes(normalizedTeam) ? rationale : '')
    };
    await page.locator('#strategicOrientationBtn').click();

    const modal = page.locator('.modal-overlay').filter({
        has: page.locator('[data-strategic-orientation-modal]')
    });
    await expect(modal).toBeVisible();

    const confirmButton = modal.locator('[data-orientation-nav="confirm"]');
    await expect(confirmButton).toBeDisabled();

    const ownOption = modal.locator(`[data-orientation-target="own"][data-orientation="${resolvedOwnOrientation}"]`);
    await ownOption.click();
    await expect(ownOption).toHaveAttribute('aria-checked', 'true');
    for (const [target, forecastOrientation] of Object.entries(resolvedForecasts)) {
        const forecastOption = modal.locator(`[data-orientation-target="${target}"][data-orientation="${forecastOrientation}"]`);
        await forecastOption.click();
        await expect(forecastOption).toHaveAttribute('aria-checked', 'true');
    }
    for (const [field, value] of Object.entries(resolvedNarratives)) {
        const textarea = modal.locator(`#${field}`);
        if (await textarea.count()) await textarea.fill(value);
    }

    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(page.locator('#toast-container')).toContainText('Strategic Orientation forwarded to Facilitator');

    const orientationCard = page.locator('#actionsList .entity-card').filter({ hasText: 'Strategic Orientation' }).first();
    await expect(orientationCard).toBeVisible();
    const goal = (await orientationCard.locator('.entity-card__title').innerText()).trim();

    return goal;
}

async function selectFacilitatorWorkspace(page, viewButtonId) {
    await page.bringToFront();
    const viewButton = page.locator(`#${viewButtonId}`);
    if (!await viewButton.count()) {
        return;
    }

    await expect(viewButton).toBeVisible({ timeout: 20000 });
    if (await viewButton.getAttribute('aria-selected') !== 'true') {
        await viewButton.dispatchEvent('click');
    }
    await expect(viewButton).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
}

export async function openFacilitatorActionSlide(page, goal) {
    await expect(page.locator('body')).toHaveAttribute('data-scribe-deck-state', 'ready', {
        timeout: 20000
    });
    await selectFacilitatorWorkspace(page, 'teamActionReviewViewBtn');

    const actionSlideLink = page.locator('#scribeSectionList button[data-slide-key^="action-"]')
        .filter({ hasText: goal })
        .first();
    const actionMarkRail = page.locator('#scribeSectionList [data-scribe-action-mark-navigation]').first();

    if (await actionMarkRail.count()) {
        await expect(actionSlideLink).toHaveCount(1, { timeout: 20000 });
        if (!await actionSlideLink.isVisible()) {
            const markKey = await actionSlideLink.evaluate((button) => (
                button.closest('[data-scribe-action-mark-panel]')?.dataset.scribeActionMarkPanel || ''
            ));
            expect(markKey).not.toBe('');
            const markTab = actionMarkRail.locator(`[data-scribe-action-mark-tab="${markKey}"]`);
            await expect(markTab).toBeVisible({ timeout: 20000 });
            await markTab.click();
            await expect(markTab).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
        }
    } else {
        const actionsSectionTrigger = page.locator('#scribeSectionList .scribe-section-trigger[data-section-label="Actions"]').first();
        if (await actionsSectionTrigger.count()) {
            await expect(actionsSectionTrigger).toBeVisible({ timeout: 20000 });
            if (await actionsSectionTrigger.getAttribute('aria-expanded') !== 'true') {
                await actionsSectionTrigger.click();
            }
        } else {
            await expect(page.locator('#scribeSectionList .scribe-section-region--actions')).toBeVisible({
                timeout: 20000
            });
        }
    }

    await expect(actionSlideLink).toBeVisible({ timeout: 20000 });
    await actionSlideLink.dispatchEvent('click');
    await expect(actionSlideLink).toHaveAttribute('aria-current', 'true', { timeout: 20000 });
    return actionSlideLink;
}

export async function submitActionFromScribe(page, goal, {
    coordinated = ['Executive'],
    informed = ['Allies'],
    expectedContent = ''
} = {}) {
    const actionSlideLink = await openFacilitatorActionSlide(page, goal);

    const actionFrame = page.locator('#deckActionFrame');
    if (expectedContent) {
        await expect(actionFrame).toContainText(expectedContent, { timeout: 20000 });
    }
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
        const checkbox = panel.locator(`[data-scribe-action-checkbox="coordinated"][value="${coordinatedValue}"]`);
        await expect(checkbox).toBeEnabled();
        await checkbox.check();
    }

    await panel.locator('[data-scribe-action-radio="informed-engaged"][value="yes"]').check();
    for (const informedValue of informed) {
        const checkbox = panel.locator(`[data-scribe-action-checkbox="informed-engaged"][value="${informedValue}"]`);
        await expect(checkbox).toBeEnabled();
        await checkbox.check();
    }

    const submitButton = panel.getByRole('button', { name: /^(?:Submit|Resubmit) to White Cell$/ });
    const isResubmission = (await submitButton.innerText()).trim().startsWith('Resubmit');
    await expect(submitButton).toBeVisible();
    await submitButton.click();
    await page.locator('.modal-overlay').getByRole('button', {
        name: isResubmission ? 'Resubmit' : 'Submit',
        exact: true
    }).click();
    await expect(panel).toHaveCount(0);
    const expectedState = isResubmission ? 'Resubmitted' : 'Submitted to White Cell';
    await expect(actionSlideLink).toContainText(expectedState);
    await expect(actionFrame.locator('.scribe-presentation-toolbar-status')).toHaveText(`${expectedState}.`);
}

export async function submitStrategicOrientationFromScribe(page, goal) {
    const actionSlideLink = await openFacilitatorActionSlide(page, goal);

    const actionFrame = page.locator('#deckActionFrame');
    const orientationSlide = actionFrame.locator('.scribe-orientation-slide');
    const panel = page.locator('[data-scribe-action-submit-panel]').filter({ hasText: 'Facilitator-to-White Cell handoff' }).first();
    await expect(orientationSlide).toBeVisible();
    await expect(orientationSlide.locator('.scribe-action-slide-title')).toContainText('Strategic Orientation');
    await expect(panel).toBeVisible();
    const submitButton = panel.getByRole('button', { name: /^(?:Submit|Resubmit) to White Cell$/ });
    const isResubmission = (await submitButton.innerText()).trim().startsWith('Resubmit');
    await submitButton.click();
    await page.locator('.modal-overlay').getByRole('button', {
        name: isResubmission ? 'Resubmit' : 'Submit',
        exact: true
    }).click();
    await expect(panel).toHaveCount(0);
    const expectedState = isResubmission ? 'Resubmitted' : 'Submitted to White Cell';
    await expect(actionSlideLink).toContainText(expectedState);
    await expect(actionFrame.locator('.scribe-presentation-toolbar-status')).toHaveText(`${expectedState}.`);
}

export async function adjudicateAction(page, {
    goal,
    section = 'actions',
    notes = 'Validated through the live-demo topology suite.',
    decision = 'complete',
    expectedDetails = {},
    notificationTeams = []
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
        const responseCard = page.locator(`${queueSelector} .tab-panel .entity-card`)
            .filter({ has: cardHeading })
            .first();
        await expect(responseCard).toHaveCount(1, { timeout: 20000 });
        if (!await responseCard.isVisible()) {
            const reviewTab = await responseCard.evaluate((card) => (
                card.closest('[data-review-panel]')?.dataset.reviewPanel || ''
            ));
            expect(reviewTab).not.toBe('');
            await page.locator(`${queueSelector} [data-review-tab="${reviewTab}"]`).click();
        }
        adjudicationCard = page.locator(
            `${queueSelector} .tab-panel:not([hidden]) .entity-card`
        ).filter({ has: cardHeading }).first();
    }
    await expect(adjudicationCard).toContainText(goal);
    await activateReconciledControl(adjudicationCard.locator('.adjudicate-btn'));

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();
    for (const [label, value] of Object.entries(expectedDetails)) {
        const detail = modal
            .locator('.detail-item, section[aria-label$="notification request"]')
            .filter({ hasText: label })
            .first();
        await expect(detail, `White Cell action detail is missing ${label}`).toBeVisible();
        await expect(detail).toContainText(String(value));
    }
    await expect(modal.locator('[name*="outcome" i]')).toHaveCount(0);
    for (const team of notificationTeams) {
        const checkbox = modal.getByRole('checkbox', {
            name: `Inform ${team} Team when this action is accepted`,
            exact: true
        });
        await expect(checkbox).toBeVisible();
        await expect(checkbox).toBeChecked();
    }
    await modal.locator('#artifactReviewNotes').fill(notes);
    const reviewButton = decision === 'return'
        ? modal.getByRole('button', { name: 'Send Back for Improvement' })
        : modal.getByRole('button', { name: 'Accept as Complete' });
    await reviewButton.click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#toast-container')).toContainText(
        decision === 'return' ? 'sent back for improvement' : 'accepted as complete'
    );
}

export async function reviewStrategicOrientation(page, {
    goal,
    team,
    notes = 'Validated Strategic Orientation through the live-demo topology suite.',
    decision = 'complete'
} = {}) {
    await openSidebarSection(page, 'strategicOrientation');
    await selectReviewQueueTab(page, '#strategicOrientationList');

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
    await activateReconciledControl(orientationCard.locator('.adjudicate-btn'));

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();
    await expect(modal.locator('[name*="outcome" i]')).toHaveCount(0);
    await modal.locator('#artifactReviewNotes').fill(notes);
    await modal.getByRole('button', {
        name: decision === 'return' ? 'Send Back for Improvement' : 'Accept as Complete'
    }).click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#toast-container')).toContainText(
        decision === 'return' ? 'sent back for improvement' : 'accepted as complete'
    );
}

export async function reviseReturnedAction(page, {
    goal,
    expectedOutcomes
} = {}) {
    if (!goal || !expectedOutcomes) {
        throw new Error('reviseReturnedAction requires goal and expectedOutcomes.');
    }

    await openSidebarSection(page, 'actions');
    const card = page.locator('#actionsList .entity-card').filter({ hasText: goal }).first();
    await expect(card).toHaveCount(1, { timeout: 20000 });
    if (!await card.isVisible()) {
        const markKey = await card.evaluate((element) => (
            element.closest('[data-action-mark-panel]')?.dataset.actionMarkPanel || ''
        ));
        expect(markKey).not.toBe('');
        await page.locator(`#actionsList [data-action-mark-tab="${markKey}"]`).click();
    }
    const detailsToggle = card.locator('.toggle-action-card-btn');
    if (await detailsToggle.count() && await detailsToggle.getAttribute('aria-expanded') !== 'true') {
        await activateReconciledControl(detailsToggle);
    }
    await expect(card).toContainText('Returned by White Cell');
    await expect(card).toContainText(/REV 2|Revision:\s*2/);
    await activateReconciledControl(card.locator('.edit-action-btn'));

    const modal = page.locator('.modal-overlay').filter({ has: page.locator('#blueActionWizardForm') });
    await expect(modal).toBeVisible();
    for (let pageIndex = 0; pageIndex < 3 && !await modal.locator('#actionExpectedOutcomes').isVisible(); pageIndex += 1) {
        await modal.locator('[data-blue-action-nav="next"]').click();
    }
    await expect(modal.locator('#actionExpectedOutcomes')).toBeVisible();
    await modal.locator('#actionExpectedOutcomes').fill(expectedOutcomes);
    await modal.locator('[data-blue-action-nav="saveChanges"]').click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#toast-container')).toContainText('Draft action updated');
    await expect(card).toContainText(expectedOutcomes);
}

export async function reviseReturnedStrategicOrientation(page, {
    goal,
    team = 'blue',
    ownOrientation = 'stabilization',
    orientation,
    forecasts = null,
    orientationRationale = '',
    forecastActionDescription = '',
    strategyDescription = '',
    rationale
} = {}) {
    if (!goal || !rationale) {
        throw new Error('reviseReturnedStrategicOrientation requires goal and rationale.');
    }

    await openSidebarSection(page, 'actions');
    const card = page.locator('#actionsList .entity-card').filter({ hasText: goal }).first();
    await expect(card).toHaveCount(1, { timeout: 20000 });
    if (!await card.isVisible()) {
        const markKey = await card.evaluate((element) => (
            element.closest('[data-action-mark-panel]')?.dataset.actionMarkPanel || ''
        ));
        expect(markKey).not.toBe('');
        await page.locator(`#actionsList [data-action-mark-tab="${markKey}"]`).click();
    }
    const detailsToggle = card.locator('.toggle-action-card-btn');
    if (await detailsToggle.count() && await detailsToggle.getAttribute('aria-expanded') !== 'true') {
        await activateReconciledControl(detailsToggle);
    }
    await expect(card).toContainText('Returned by White Cell');
    await expect(card).toContainText(/REV 2|Revision:\s*2/);
    await activateReconciledControl(card.locator('.edit-action-btn'));

    const modal = page.locator('.modal-overlay').filter({
        has: page.locator('[data-strategic-orientation-modal]')
    });
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-orientation-target]:not([data-orientation-target="own"])[aria-checked="true"]')).not.toHaveCount(0);
    await expect(modal.locator('[data-orientation-narrative]').first()).not.toHaveValue('');
    const normalizedTeam = String(team).toLowerCase();
    const resolvedOwnOrientation = orientation || ownOrientation;
    await modal.locator(`[data-orientation-target="own"][data-orientation="${resolvedOwnOrientation}"]`).click();
    if (forecasts) {
        for (const [target, forecastOrientation] of Object.entries(forecasts)) {
            await modal.locator(`[data-orientation-target="${target}"][data-orientation="${forecastOrientation}"]`).click();
        }
    }
    const narratives = {
        orientationRationale: orientationRationale || (normalizedTeam === 'red' ? rationale : ''),
        forecastActionDescription: forecastActionDescription || (normalizedTeam === 'blue' ? rationale : ''),
        strategyDescription: strategyDescription || (['green', 'industry'].includes(normalizedTeam) ? rationale : '')
    };
    for (const [field, value] of Object.entries(narratives)) {
        const textarea = modal.locator(`#${field}`);
        if (await textarea.count() && value) await textarea.fill(value);
    }
    await modal.locator('[data-orientation-nav="confirm"]').click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#toast-container')).toContainText('Strategic Orientation forwarded to Facilitator');

    return `${team.charAt(0).toUpperCase()}${team.slice(1)} Team Strategic Orientation: ${resolvedOwnOrientation.charAt(0).toUpperCase()}${resolvedOwnOrientation.slice(1)}`;
}

export function getWhiteCellStrategicOrientationTitle(goal, team = '') {
    void team;
    return String(goal || '').trim();
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

    await openSidebarSection(page, 'actions');
    await expect(page.locator('#newActionBtn')).toBeVisible();
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

    await activateAndCaptureWorkflowToast(
        page,
        modal.locator('[data-proposal-nav="forward"]'),
        'Proposal forwarded to Facilitator'
    );
    await expect(modal).toBeHidden({ timeout: DURABLE_WORKFLOW_WRITE_TIMEOUT_MS });
    await expect(page.locator('#actionsList')).toContainText(title);
}

export async function submitForwardedProposalFromFacilitator(page, { title } = {}) {
    if (!title) {
        throw new Error('submitForwardedProposalFromFacilitator requires a title.');
    }

    await expect(page.locator('body')).toHaveAttribute('data-scribe-deck-state', 'ready', {
        timeout: 20000
    });

    await openFacilitatorActionSlide(page, title);

    const actionFrame = page.locator('#deckActionFrame');
    await expect(actionFrame).toContainText(title);
    await actionFrame.locator('[data-scribe-action-submit]').first().click();

    const confirmModal = page.locator('.modal-overlay.modal-visible:not(.modal-hiding)')
        .filter({ hasText: 'Submit Proposal to White Cell' });
    await expect(confirmModal).toBeVisible();
    await confirmModal.getByRole('button', { name: 'Submit' }).click();
    await expect(confirmModal).toBeHidden();
    const submittedSlideLink = await openFacilitatorActionSlide(page, title);
    await expect(submittedSlideLink).toContainText('Submitted to White Cell', { timeout: 20000 });
    await expect(page.locator('#toast-container')).toContainText('Proposal submitted to White Cell');
}

export async function reviewProposal(page, {
    title,
    decision = 'forward_to_recipient',
    recipientTeams = [],
    notes = 'Reviewed during the automated professional playthrough rehearsal.'
} = {}) {
    if (!title) {
        throw new Error('reviewProposal requires a title.');
    }

    await openSidebarSection(page, 'proposals');
    await selectReviewQueueTab(page, '#proposalsList');
    const proposalCard = getVisibleReviewCard(page, '#proposalsList', title).first();
    await expect(proposalCard).toBeVisible();
    await activateReconciledControl(proposalCard.locator('.adjudicate-btn'));

    const modal = page.locator('.modal-overlay').filter({ has: page.locator('#proposalReviewForm') });
    await expect(modal).toBeVisible();
    await modal.locator('#adjudicationNotes').fill(notes);
    if (decision === 'request_changes') {
        await activateAndCaptureWorkflowToast(
            page,
            modal.getByRole('button', { name: 'Send Back for Improvement' }),
            'Proposal sent back for improvement'
        );
    } else {
        const approvals = recipientTeams.length ? recipientTeams : ['blue'];
        for (const team of approvals) {
            await checkReconciledCheckbox(
                modal.locator(`input[name="proposalRecipientApproval"][value="${team}"]`)
            );
        }
        await activateAndCaptureWorkflowToast(
            page,
            modal.getByRole('button', { name: 'Apply Recipient Approvals' }),
            'Proposal approved and forwarded to'
        );
    }

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
    await selectFacilitatorWorkspace(page, 'teamActionReviewViewBtn');
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
        const modal = page.locator('.modal-overlay.modal-visible:not(.modal-hiding)').filter({
            has: page.locator('#facilitatorProposalNegotiationForm')
        });
        await expect(modal).toBeVisible();
        await modal.locator('#facilitatorProposalNegotiationTerms').fill(negotiationTerms);
        await modal.getByRole('button', { name: 'Send Negotiation' }).click();
        await expect(modal).toBeHidden();
    } else {
        const decisionLabel = decision === 'not_interested' ? 'Not Interested' : 'Accept';
        const modal = page.locator('.modal-overlay.modal-visible:not(.modal-hiding)');
        await expect(modal).toBeVisible();
        await modal.getByRole('button', { name: decisionLabel, exact: true }).click();
        await expect(modal).toBeHidden();
    }

    const expectedLabel = decision === 'negotiate'
        ? 'Negotiation requested'
        : (decision === 'not_interested' ? 'Not Interested' : 'Accepted');
    await expect(page.locator('#toast-container')).toContainText(`${expectedLabel} sent to White Cell for forwarding.`);
}

export async function reviewProposalResponse(page, { title, senderTeam } = {}) {
    if (!title) throw new Error('reviewProposalResponse requires a title.');
    if (!senderTeam) throw new Error('reviewProposalResponse requires a senderTeam.');

    const senderLabel = {
        blue: 'Blue Team',
        green: 'Green Team',
        red: 'Red Team',
        industry: 'Industry Team'
    }[String(senderTeam).trim().toLowerCase()];
    if (!senderLabel) throw new Error(`Unsupported proposal response sender: ${senderTeam}`);

    await openSidebarSection(page, 'proposals');
    await selectReviewQueueTab(page, '#proposalsList');
    const proposalCard = getVisibleReviewCard(page, '#proposalsList', title).first();
    await expect(proposalCard).toBeVisible();
    const modal = page.locator('.modal-overlay:not(.modal-hiding)')
        .filter({ hasText: 'Review Proposal Response' });
    await openModalFromReconciledControl(
        proposalCard.getByRole('button', { name: `Review ${senderLabel} Response` }).first(),
        modal
    );
    await activateAndCaptureWorkflowToast(
        page,
        modal.getByRole('button', { name: /^Forward to / }),
        'Proposal response forwarded to'
    );
    await expect(modal).toBeHidden({ timeout: DURABLE_WORKFLOW_WRITE_TIMEOUT_MS });
}

export async function openReceivedProposalSlide(page, title) {
    if (!title) {
        throw new Error('openReceivedProposalSlide requires a title.');
    }

    await expect(page.locator('body')).toHaveAttribute('data-scribe-deck-state', 'ready', {
        timeout: 20000
    });
    await selectFacilitatorWorkspace(page, 'teamActionReviewViewBtn');
    const proposalsSectionTrigger = page.locator(
        '#scribeSectionList .scribe-section-trigger[data-section-label="Proposals"]'
    ).first();
    await expect(proposalsSectionTrigger).toBeVisible({ timeout: 20000 });
    if (await proposalsSectionTrigger.getAttribute('aria-expanded') !== 'true') {
        await proposalsSectionTrigger.click();
    }

    const proposalSlideLink = page.locator('#scribeSectionList button[data-slide-key^="proposal-"]')
        .filter({ hasText: title })
        .first();
    await expect(proposalSlideLink).toBeVisible({ timeout: 20000 });
    await proposalSlideLink.click();
    await expect(proposalSlideLink).toHaveAttribute('aria-current', 'true', { timeout: 20000 });
    await expect(page.locator('#deckActionFrame')).toContainText(title);
    return proposalSlideLink;
}

export async function replyToProposalThread(page, {
    title,
    recipientTeam,
    message = 'The proposing team accepts the checkpoint and proposes a joint review after the next move.'
} = {}) {
    if (!title) throw new Error('replyToProposalThread requires a title.');
    if (!recipientTeam) throw new Error('replyToProposalThread requires a recipientTeam.');

    const recipientLabel = {
        blue: 'Blue Team',
        green: 'Green Team',
        red: 'Red Team',
        industry: 'Industry'
    }[String(recipientTeam).trim().toLowerCase()];
    if (!recipientLabel) {
        throw new Error(`replyToProposalThread received an unsupported recipientTeam: ${recipientTeam}`);
    }

    await openFacilitatorActionSlide(page, title);
    const frame = page.locator('#deckActionFrame');
    const threadActions = frame.getByRole('group', {
        name: `${recipientLabel} thread actions`,
        exact: true
    });
    await expect(threadActions).toHaveCount(1);
    const replyButton = threadActions.getByRole('button', {
        name: 'Reply with next round',
        exact: true
    });
    await expect(replyButton).toBeEnabled();
    await replyButton.dispatchEvent('click');
    const modal = page.locator('.modal-overlay.modal-visible:not(.modal-hiding)').filter({
        has: page.locator('#facilitatorProposalNegotiationForm')
    });
    await expect(modal).toBeVisible();
    await modal.locator('#facilitatorProposalNegotiationTerms').fill(message);
    await activateAndCaptureWorkflowToast(
        page,
        modal.getByRole('button', { name: 'Send Follow-up' }),
        'Follow-up sent to White Cell for forwarding.'
    );
    await expect(modal).toBeHidden({ timeout: DURABLE_WORKFLOW_WRITE_TIMEOUT_MS });
}

export async function submitRfi(page, {
    question
} = {}) {
    if (!question) {
        throw new Error('submitRfi requires a question.');
    }

    await expect(page.locator('body')).toHaveAttribute('data-scribe-deck-state', 'ready', {
        timeout: 20000
    });
    await selectFacilitatorWorkspace(page, 'rfiViewBtn');
    const rfiSectionTrigger = page.locator(
        '#scribeSectionList .scribe-section-trigger[data-section-label="RFIs"]'
    ).first();
    await expect(rfiSectionTrigger).toBeVisible({ timeout: 20000 });
    if (await rfiSectionTrigger.getAttribute('aria-expanded') !== 'true') {
        await rfiSectionTrigger.click();
    }
    await page.locator('#scribeSectionList button[data-slide-type^="rfi"]').first().click();
    await page.locator('#deckActionFrame [data-facilitator-new-rfi]').click();

    const modal = page.locator('.modal-overlay').filter({ has: page.locator('#rfiForm') });
    await expect(modal).toBeVisible();
    await modal.locator('#rfiQuestion').fill(question);
    await modal.locator('[data-rfi-checkbox="category"]').first().check();
    await modal.getByRole('button', { name: 'Submit RFI' }).click();
    await expect(page.locator('#toast-container')).toContainText('RFI submitted');
    await expect(modal).toBeHidden();
    await expect(page.locator('#deckActionFrame')).toContainText(question);
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
    await activateReconciledControl(rfiCard.getByRole('button', { name: 'Respond' }));

    const modal = page.locator('.modal-overlay').filter({ has: page.locator('#rfiResponseForm') });
    await expect(modal).toBeVisible();
    await modal.locator('#rfiResponse').fill(response);
    await modal.getByRole('button', { name: 'Send Response' }).click();
    await expect(page.locator('#toast-container')).toContainText('Response sent');
    await expect(modal).toBeHidden();
}

export async function returnRfi(page, {
    question,
    notes
} = {}) {
    if (!question || !notes) {
        throw new Error('returnRfi requires both question and notes.');
    }

    await openSidebarSection(page, 'requests');
    const rfiCard = page.locator('#rfiQueue [data-rfi-id]').filter({ hasText: question }).first();
    await expect(rfiCard).toBeVisible();
    await activateReconciledControl(rfiCard.getByRole('button', { name: 'Return for Clarification' }));

    const modal = page.locator('.modal-overlay').filter({ has: page.locator('#rfiReturnForm') });
    await expect(modal).toBeVisible();
    await modal.locator('#rfiReturnNotes').fill(notes);
    await modal.getByRole('button', { name: 'Return for Clarification' }).click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#toast-container')).toContainText('RFI returned for clarification');
}

export async function reviseAndResubmitRfi(page, {
    originalQuestion,
    revisedQuestion,
    returnNotes
} = {}) {
    if (!originalQuestion || !revisedQuestion || !returnNotes) {
        throw new Error('reviseAndResubmitRfi requires originalQuestion, revisedQuestion, and returnNotes.');
    }

    await selectFacilitatorWorkspace(page, 'rfiViewBtn');
    const rfiSlideLink = page.locator('#scribeSectionList button[data-slide-type="rfi"]')
        .filter({ hasText: originalQuestion })
        .first();
    await expect(rfiSlideLink).toBeVisible({ timeout: 20000 });
    await rfiSlideLink.click();

    const frame = page.locator('#deckActionFrame');
    await expect(frame).toContainText('Returned for clarification');
    await expect(frame).toContainText(returnNotes);
    await expect(frame).toContainText('REV 2');
    await frame.getByRole('button', { name: 'Edit and Resubmit' }).click();

    const modal = page.locator('.modal-overlay').filter({ has: page.locator('#rfiForm') });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(returnNotes);
    await expect(modal).toContainText('editing revision 2');
    await modal.locator('#rfiQuestion').fill(revisedQuestion);
    await modal.getByRole('button', { name: 'Resubmit RFI' }).click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#toast-container')).toContainText('RFI resubmitted successfully');
    await expect(frame).toContainText(revisedQuestion);
    await expect(frame).toContainText('Resubmitted');
    return revisedQuestion;
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

export async function sendFacilitatorCommunication(page, { content } = {}) {
    if (!content) {
        throw new Error('sendFacilitatorCommunication requires content.');
    }

    await expect(page.locator('body')).toHaveAttribute('data-scribe-deck-state', 'ready', {
        timeout: 20000
    });
    await selectFacilitatorWorkspace(page, 'communicationsViewBtn');
    const communicationFrame = page.locator('#deckActionFrame');
    await expect(communicationFrame.getByRole('heading', {
        name: 'Communications',
        exact: true
    })).toBeVisible({ timeout: 20000 });
    const messageButton = communicationFrame.getByRole('button', {
        name: 'Message White Cell',
        exact: true
    });
    await expect(messageButton).toBeEnabled({ timeout: 20000 });
    await messageButton.dispatchEvent('click');

    const modal = page.locator('.modal-overlay').filter({
        has: page.locator('#facilitatorCommunicationForm')
    });
    await expect(modal).toBeVisible();
    await modal.locator('#facilitatorCommunicationMessage').fill(content);
    await modal.getByRole('button', { name: 'Send Message' }).click({ timeout: 20000 });
    await expect(page.locator('#toast-container')).toContainText('Message sent to White Cell');
    await expect(modal).toBeHidden();
    await expect(communicationFrame).toContainText(content);
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

export async function waitForDurableNotification(page, {
    source,
    artifact,
    requiredAction
} = {}) {
    const notice = page.locator('#toast-container .toast-durable[data-notification-id]').filter({
        hasText: artifact
    });
    await expect(notice).toBeVisible({ timeout: 30000 });
    await expect(notice).toContainText(`Source${source}`);
    await expect(notice).toContainText(`Artifact${artifact}`);
    await expect(notice).toContainText(`Required action${requiredAction}`);
    await expect(notice.getByRole('button', { name: /Open|Review/ })).toBeVisible();
    await expect(notice.getByRole('button', { name: 'Dismiss notification' })).toBeVisible();
    return notice;
}

export async function getDurableNotificationSnapshot(page) {
    return page.evaluate(() => {
        const actorPrefix = globalThis.__ESG_E2E_ACTOR__
            ? `actor:${globalThis.__ESG_E2E_ACTOR__}::`
            : '';
        const records = [];

        for (let index = 0; index < globalThis.localStorage.length; index += 1) {
            const physicalKey = globalThis.localStorage.key(index) || '';
            if (!physicalKey.includes('statecraft:durable-notifications:')) continue;
            if (actorPrefix && !physicalKey.startsWith(actorPrefix)) continue;

            const logicalKey = actorPrefix ? physicalKey.slice(actorPrefix.length) : physicalKey;
            try {
                const state = JSON.parse(globalThis.localStorage.getItem(logicalKey) || 'null');
                Object.entries(state?.records || {}).forEach(([id, record]) => {
                    records.push({
                        id,
                        family: record?.notification?.family || '',
                        read: record?.read === true,
                        dismissed: record?.dismissed === true,
                        source: record?.notification?.source || '',
                        artifact: record?.notification?.artifact || ''
                    });
                });
            } catch (_error) {
                // Malformed optional browser state is ignored by the runtime as well.
            }
        }

        return records.sort((left, right) => left.id.localeCompare(right.id));
    });
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
                categories: index % 2 === 0 ? ['Alliance Response'] : ['Economic Impact'],
                query: `${team.charAt(0).toUpperCase()}${team.slice(1)} RFI ${String(index).padStart(3, '0')}: clarify expected partner reaction and implementation timing.`,
                status: answered ? 'answered' : 'pending',
                workflow_state: answered ? 'completed' : 'submitted_to_white_cell',
                revision_number: 1,
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
