import { test, expect } from '@playwright/test';

import {
    authorizeGameMaster,
    authorizeWhiteCell,
    createIsolatedActorPage,
    createSessionFromMaster,
    getWhiteCellStrategicOrientationTitle,
    joinPublicParticipant,
    openSidebarSection,
    openWhiteCellSettingsTab,
    recordStrategicOrientationFromScribe,
    sendWhiteCellCommunication,
    submitStrategicOrientationFromScribe,
    submitRfi
} from './support/liveDemoHarness.js';

const REALTIME_SLO_MS = Number(process.env.PLAYWRIGHT_REALTIME_SLO_MS || 15000);

function buildSessionCodes(retry = 0) {
    const configuredRunId = String(process.env.PLAYWRIGHT_REHEARSAL_RUN_ID || '').trim();
    const runId = (configuredRunId || Date.now().toString(36))
        .replace(/[^a-z0-9]/gi, '')
        .slice(-7)
        .toUpperCase();
    const suffix = retry ? String(retry) : '';
    return {
        primary: `RT${runId}A${suffix}`,
        isolation: `RT${runId}B${suffix}`
    };
}

async function createActorPool(browser) {
    const hosted = Boolean(process.env.PLAYWRIGHT_BASE_URL);
    const contexts = [];
    const sharedContext = hosted
        ? null
        : await browser.newContext({ viewport: { width: 1440, height: 900 } });

    if (sharedContext) {
        contexts.push(sharedContext);
    }

    return {
        hosted,
        async create(name, options = {}) {
            const context = hosted
                ? await browser.newContext({ viewport: { width: 1440, height: 900 } })
                : sharedContext;
            if (hosted) {
                contexts.push(context);
            }
            return {
                context,
                page: await createIsolatedActorPage(context, name, options)
            };
        },
        async close() {
            await Promise.all(contexts.map(async (context) => {
                if (context.browser()?.isConnected()) {
                    await context.close().catch(() => undefined);
                }
            }));
        }
    };
}

async function runOperations(operations, concurrent) {
    if (concurrent) {
        await Promise.all(operations.map((operation) => operation()));
        return;
    }

    for (const operation of operations) {
        await operation();
    }
}

function recordLatency(samples, name, startedAt) {
    const elapsedMs = Date.now() - startedAt;
    samples.push({ name, elapsedMs });
    expect(elapsedMs, `${name} exceeded the ${REALTIME_SLO_MS}ms Realtime SLO`).toBeLessThanOrEqual(REALTIME_SLO_MS);
}

async function setActorConnectivity(actor, { online, hosted }) {
    if (hosted) {
        await actor.context.setOffline(!online);
    }

    // Chromium's network emulation does not guarantee that the corresponding
    // DOM connectivity event reaches the page before the next assertion. Emit
    // the browser signal explicitly after the real network toggle so the app's
    // sync-state handler and reconciliation path are exercised deterministically.
    await actor.page.evaluate((eventName) => {
        window.dispatchEvent(new Event(eventName));
    }, online ? 'online' : 'offline');
}

test('@realtime fanout, outage recovery, reconciliation, and isolation stay correct', async ({ browser }, testInfo) => {
    // Keep the end-to-end envelope separate from the 15-second fanout SLO.
    // Hosted operator grants and six independent browser bootstraps may be
    // sequentially slow without implying that live event delivery is slow.
    test.setTimeout(8 * 60 * 1000);

    const actorPool = await createActorPool(browser);
    const sessionCodes = buildSessionCodes(testInfo.retry);
    const latencySamples = [];
    const sessionName = `Realtime Gate ${sessionCodes.primary}`;
    const isolationSessionName = `Realtime Isolation ${sessionCodes.isolation}`;
    const orientationRationale = `Realtime orientation ${sessionCodes.primary}`;
    const rfiQuestion = `Realtime RFI ${sessionCodes.primary}`;
    const directMessage = `Realtime direct message ${sessionCodes.primary}`;
    const missedMessage = `Realtime recovered message ${sessionCodes.primary}`;

    try {
        const gameMaster = await actorPool.create('realtime-game-master', { resetBackend: true });
        await authorizeGameMaster(gameMaster.page, { displayName: 'Realtime Game Master' });
        await createSessionFromMaster(gameMaster.page, {
            sessionName,
            sessionCode: sessionCodes.primary,
            description: 'Automated Realtime fanout and recovery gate.'
        });
        await createSessionFromMaster(gameMaster.page, {
            sessionName: isolationSessionName,
            sessionCode: sessionCodes.isolation,
            description: 'Cross-session isolation control for the Realtime gate.'
        });

        const whiteCell = await actorPool.create('realtime-white-cell');
        await authorizeWhiteCell(whiteCell.page, {
            sessionCode: sessionCodes.primary,
            displayName: 'Realtime White Cell Lead',
            operatorRole: 'lead'
        });

        const blueScribe = await actorPool.create('realtime-blue-scribe');
        const blueFacilitator = await actorPool.create('realtime-blue-facilitator');
        const redFacilitator = await actorPool.create('realtime-red-facilitator');
        const isolationFacilitator = await actorPool.create('realtime-isolation-blue-facilitator');

        await runOperations([
            () => joinPublicParticipant(blueScribe.page, {
                sessionCode: sessionCodes.primary,
                displayName: 'Realtime Blue Scribe',
                team: 'blue',
                roleSurface: 'facilitator'
            }),
            () => joinPublicParticipant(blueFacilitator.page, {
                sessionCode: sessionCodes.primary,
                displayName: 'Realtime Blue Facilitator',
                team: 'blue',
                roleSurface: 'scribe'
            }),
            () => joinPublicParticipant(redFacilitator.page, {
                sessionCode: sessionCodes.primary,
                displayName: 'Realtime Red Facilitator',
                team: 'red',
                roleSurface: 'scribe'
            }),
            () => joinPublicParticipant(isolationFacilitator.page, {
                sessionCode: sessionCodes.isolation,
                displayName: 'Isolation Blue Facilitator',
                team: 'blue',
                roleSurface: 'scribe'
            })
        ], actorPool.hosted);

        await test.step('fan out participant, timer, action, request, timeline, and communication changes', async () => {
            if (!actorPool.hosted) {
                await whiteCell.page.reload();
            }
            await openWhiteCellSettingsTab(whiteCell.page, 'participants');
            await expect(whiteCell.page.locator('#participantsList')).toContainText('Realtime Blue Scribe');
            await expect(whiteCell.page.locator('#participantsList')).toContainText('Realtime Blue Facilitator');
            await expect(whiteCell.page.locator('#participantsList')).toContainText('Realtime Red Facilitator');
            await expect(whiteCell.page.locator('#participantsList')).not.toContainText('Isolation Blue Facilitator');

            await openWhiteCellSettingsTab(whiteCell.page, 'gameControls');
            const timerStartedAt = Date.now();
            await whiteCell.page.locator('#startTimerBtn').click({ timeout: 20000 });
            if (!actorPool.hosted) {
                await blueFacilitator.page.evaluate(() => window.dispatchEvent(new Event('online')));
                await redFacilitator.page.evaluate(() => window.dispatchEvent(new Event('online')));
            }
            await expect(blueFacilitator.page.locator('#timerDisplay')).not.toHaveText('90:00');
            await expect(redFacilitator.page.locator('#timerDisplay')).not.toHaveText('90:00');
            recordLatency(latencySamples, 'game_state timer fanout', timerStartedAt);
            await whiteCell.page.locator('#pauseTimerBtn').click({ timeout: 20000 });

            const orientationGoal = await recordStrategicOrientationFromScribe(blueScribe.page, {
                team: 'blue',
                orientation: 'pressure',
                rationale: orientationRationale
            });
            if (!actorPool.hosted) {
                await blueFacilitator.page.reload();
            }
            const actionStartedAt = Date.now();
            await submitStrategicOrientationFromScribe(blueFacilitator.page, orientationGoal);
            if (!actorPool.hosted) {
                await whiteCell.page.reload();
            }
            await openSidebarSection(whiteCell.page, 'strategicOrientation');
            await expect(whiteCell.page.locator('#strategicOrientationList')).toContainText(
                getWhiteCellStrategicOrientationTitle(orientationGoal, 'blue')
            );
            recordLatency(latencySamples, 'actions fanout', actionStartedAt);

            await openSidebarSection(whiteCell.page, 'requests');
            const requestStartedAt = Date.now();
            await submitRfi(blueScribe.page, { question: rfiQuestion });
            if (!actorPool.hosted) {
                await whiteCell.page.reload();
                await openSidebarSection(whiteCell.page, 'requests');
            }
            await expect(whiteCell.page.locator('#rfiQueue')).toContainText(rfiQuestion);
            recordLatency(latencySamples, 'requests fanout', requestStartedAt);

            const blueAlertsBadge = blueFacilitator.page.locator('#scribeAlertsBadge');
            if (await blueAlertsBadge.isVisible()) {
                await blueFacilitator.page.locator('#scribeAlertsBtn').click();
                await blueFacilitator.page.locator('#scribeAlertsClose').click();
                await expect(blueAlertsBadge).toBeHidden();
            }

            const communicationStartedAt = Date.now();
            await sendWhiteCellCommunication(whiteCell.page, {
                recipient: 'blue_scribe',
                content: directMessage
            });
            if (!actorPool.hosted) {
                await Promise.all([
                    blueFacilitator.page.evaluate(() => window.dispatchEvent(new Event('online'))),
                    redFacilitator.page.evaluate(() => window.dispatchEvent(new Event('online'))),
                    isolationFacilitator.page.evaluate(() => window.dispatchEvent(new Event('online')))
                ]);
            }
            await expect(blueAlertsBadge).toHaveText('1');
            recordLatency(latencySamples, 'communications fanout', communicationStartedAt);
            await blueFacilitator.page.locator('#scribeAlertsBtn').click();
            await expect(
                blueFacilitator.page.locator('#scribeAlertsList').getByText(directMessage, { exact: true })
            ).toHaveCount(1);
            await expect(redFacilitator.page.locator('#scribeAlertsList')).not.toContainText(directMessage);
            await expect(isolationFacilitator.page.locator('#scribeAlertsList')).not.toContainText(directMessage);
            await blueFacilitator.page.locator('#scribeAlertsClose').click();

            await openSidebarSection(whiteCell.page, 'timeline');
            await expect(whiteCell.page.locator('#timelineList')).toContainText(new RegExp(`${sessionCodes.primary}|action|RFI`, 'i'));
        });

        await test.step('surface an outage, reconcile the missed message, and avoid duplicate alerts', async () => {
            await setActorConnectivity(blueFacilitator, {
                online: false,
                hosted: actorPool.hosted
            });

            await expect(blueFacilitator.page.locator('#syncStatusBanner')).toBeVisible();
            await expect(blueFacilitator.page.locator('#syncStatusBanner')).toContainText('Live updates paused');

            await sendWhiteCellCommunication(whiteCell.page, {
                recipient: 'blue_scribe',
                content: missedMessage
            });

            await setActorConnectivity(blueFacilitator, {
                online: true,
                hosted: actorPool.hosted
            });

            await expect(blueFacilitator.page.locator('#syncStatusBanner')).toBeHidden({ timeout: 30000 });
            await expect(blueFacilitator.page.locator('#scribeAlertsBadge')).toHaveText('1', { timeout: 30000 });
            await blueFacilitator.page.locator('#scribeAlertsBtn').click();
            const recoveredAlert = blueFacilitator.page
                .locator('#scribeAlertsList')
                .getByText(missedMessage, { exact: true });
            await expect(recoveredAlert).toHaveCount(1);
            await blueFacilitator.page.waitForTimeout(1000);
            await expect(recoveredAlert).toHaveCount(1);
            await expect(redFacilitator.page.locator('#scribeAlertsList')).not.toContainText(missedMessage);
            await expect(isolationFacilitator.page.locator('#scribeAlertsList')).not.toContainText(missedMessage);
        });

        await testInfo.attach('realtime-diagnostics.json', {
            body: Buffer.from(JSON.stringify({
                backend: actorPool.hosted ? 'hosted-real-backend' : 'local-deterministic-mock',
                primarySession: sessionCodes.primary,
                isolationSession: sessionCodes.isolation,
                realtimeSloMs: REALTIME_SLO_MS,
                latencySamples
            }, null, 2)),
            contentType: 'application/json'
        });
    } finally {
        await actorPool.close();
    }
});
