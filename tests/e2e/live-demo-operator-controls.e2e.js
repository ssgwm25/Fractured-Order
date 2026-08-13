import { readFile } from 'node:fs/promises';

import { expect, recordRehearsalMetrics, test } from './support/rehearsalTest.js';

import { dumpE2EMockBackend } from './support/mockBackend.js';
import { expectBrowserConsoleError } from './support/browserDiagnostics.js';
import {
    authorizeGameMaster,
    authorizeWhiteCell,
    createIsolatedActorPage,
    createSessionFromMaster,
    expectJoinFailure,
    getSessionFromState,
    installDeterministicAudioCapture,
    joinPublicParticipant,
    openSidebarSection
} from './support/liveDemoHarness.js';

const SESSION_NAME = 'Non-PLI Operator Rehearsal';
const SESSION_CODE = 'OPS2601';
const COMPANION_NAME = 'Non-PLI Aggregate Companion';
const COMPANION_CODE = 'OPS2602';

async function confirmActiveModal(page, buttonName) {
    const modal = page.locator('.modal-overlay.modal-visible:not(.modal-hiding)').last();
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: buttonName, exact: true }).click();
}

async function selectSessionForOperatorView(page, { section, selectId, sessionName }) {
    await openSidebarSection(page, section);
    const select = page.locator(selectId);
    const option = select.locator('option').filter({ hasText: sessionName }).first();
    await expect(option).toBeAttached();
    const sessionId = await option.getAttribute('value');
    expect(sessionId).toBeTruthy();
    await select.selectOption(sessionId);
    return sessionId;
}

async function expectDownloadFrom(page, selector, filenamePattern) {
    const downloadPromise = page.waitForEvent('download');
    await page.locator(selector).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(filenamePattern);
    expect(await download.path()).toBeTruthy();
    return download;
}

function readStoredZipEntries(buffer) {
    const entries = new Map();
    let offset = 0;

    while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
        const compressionMethod = buffer.readUInt16LE(offset + 8);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const filenameLength = buffer.readUInt16LE(offset + 26);
        const extraLength = buffer.readUInt16LE(offset + 28);
        expect(compressionMethod).toBe(0);
        const filenameStart = offset + 30;
        const contentStart = filenameStart + filenameLength + extraLength;
        const filename = buffer.subarray(filenameStart, filenameStart + filenameLength).toString('utf8');
        const relativePath = filename.includes('/') ? filename.slice(filename.indexOf('/') + 1) : filename;
        entries.set(relativePath, buffer.subarray(contentStart, contentStart + compressedSize).toString('utf8'));
        offset = contentStart + compressedSize;
    }

    return entries;
}

test('@operator-controls rehearses every shipped non-PLI administration, deck, plugin, export, and archival procedure', async ({ rehearsalBrowser: browser }, testInfo) => {
    test.setTimeout(15 * 60 * 1000);
    recordRehearsalMetrics(testInfo, { actorCount: 7, sessionCount: 2 });

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: ''
    }));
    const gameMaster = await createIsolatedActorPage(context, 'operator-controls-game-master', { resetBackend: true });
    const whiteCell = await createIsolatedActorPage(context, 'operator-controls-white-cell');
    const teamScribe = await createIsolatedActorPage(context, 'operator-controls-blue-scribe');
    const teamFacilitator = await createIsolatedActorPage(context, 'operator-controls-blue-facilitator');
    const notetakerOne = await createIsolatedActorPage(context, 'operator-controls-notetaker-one');
    const notetakerTwo = await createIsolatedActorPage(context, 'operator-controls-notetaker-two');

    await test.step('create two sessions and join the minimum real operator topology', async () => {
        await authorizeGameMaster(gameMaster, { displayName: 'Operational Game Master' });
        await createSessionFromMaster(gameMaster, {
            sessionName: SESSION_NAME,
            sessionCode: SESSION_CODE,
            description: 'Non-PLI operator control, media, export, and archival rehearsal.'
        });
        await createSessionFromMaster(gameMaster, {
            sessionName: COMPANION_NAME,
            sessionCode: COMPANION_CODE,
            description: 'Companion session for the cross-session research archive.'
        });

        await joinPublicParticipant(teamScribe, {
            sessionCode: SESSION_CODE,
            displayName: 'Blue Scribe Operator Rehearsal',
            team: 'blue',
            roleSurface: 'facilitator'
        });
        await joinPublicParticipant(teamFacilitator, {
            sessionCode: SESSION_CODE,
            displayName: 'Blue Facilitator Operator Rehearsal',
            team: 'blue',
            roleSurface: 'scribe'
        });
        await joinPublicParticipant(notetakerOne, {
            sessionCode: SESSION_CODE,
            displayName: 'Blue Notetaker Operator One',
            team: 'blue',
            roleSurface: 'notetaker'
        });
        await joinPublicParticipant(notetakerTwo, {
            sessionCode: SESSION_CODE,
            displayName: 'Blue Notetaker Operator Two',
            team: 'blue',
            roleSurface: 'notetaker'
        });
        await authorizeWhiteCell(whiteCell, {
            sessionCode: SESSION_CODE,
            displayName: 'Operational White Cell Lead'
        });
    });

    await test.step('load a real facilitator deck and persist both plugin enablements across reload', async () => {
        await openSidebarSection(whiteCell, 'controls');
        await whiteCell.locator('[data-settings-tab="scribeDecks"]').click();
        const blueDeckCard = whiteCell.locator('.scribe-deck-card:has(#scribeDeckLabel-blue)');
        await expect(blueDeckCard).toBeVisible();
        await blueDeckCard.locator('#scribeDeckLabel-blue').fill('Operational Blue Deck');
        await blueDeckCard.locator('[data-scribe-deck-action="load"]').click();
        await expect(blueDeckCard).toContainText('Operational Blue Deck', { timeout: 45000 });
        await expect(teamFacilitator.locator('#deckSlideImage')).toBeVisible({ timeout: 20000 });

        await whiteCell.locator('[data-settings-tab="plugins"]').click();
        await whiteCell.locator('label[for="pluginToggle-intercom"]').click();
        await expect(whiteCell.locator('#toast-container')).toContainText('Intercom enabled.');
        await whiteCell.locator('label[for="pluginToggle-session-recorder"]').click();
        await expect(whiteCell.locator('#toast-container')).toContainText('Session Recorder enabled.');
        await expect(whiteCell.locator('.plugin-card[data-plugin-id="intercom"]')).toHaveAttribute('data-plugin-enabled', 'true');
        await expect(whiteCell.locator('.plugin-card[data-plugin-id="session-recorder"]')).toHaveAttribute('data-plugin-enabled', 'true');

        await whiteCell.reload();
        await openSidebarSection(whiteCell, 'controls');
        await whiteCell.locator('[data-settings-tab="plugins"]').click();
        await expect(whiteCell.locator('#pluginToggle-intercom')).toBeChecked();
        await expect(whiteCell.locator('#pluginToggle-session-recorder')).toBeChecked();
    });

    await test.step('record and send Intercom audio, then run the recorder lifecycle with participant notices and file download', async () => {
        await installDeterministicAudioCapture(whiteCell);

        await whiteCell.locator('[data-intercom-record]').click();
        await expect(whiteCell.locator('.intercom-status')).toContainText('Recording announcement');
        await whiteCell.locator('[data-intercom-stop]').click();
        await expect(whiteCell.locator('[data-intercom-send]')).toBeEnabled();
        await whiteCell.locator('[data-intercom-send]').click();
        await expect(whiteCell.locator('.intercom-status')).toContainText('Announcement sent to all Scribe views');

        await whiteCell.locator('[data-session-recorder-start]').click();
        await expect(whiteCell.locator('.session-recorder-status')).toContainText('Recording in progress');
        await expect(teamScribe.locator('#sessionRecordingNotice')).toContainText('Session recording active', { timeout: 20000 });
        await whiteCell.locator('[data-session-recorder-pause]').click();
        await expect(whiteCell.locator('.session-recorder-status')).toContainText('Recording paused');
        await expect(teamScribe.locator('#sessionRecordingNotice')).toContainText('Session recording paused', { timeout: 20000 });
        await whiteCell.locator('[data-session-recorder-resume]').click();
        await expect(whiteCell.locator('.session-recorder-status')).toContainText('Recording in progress');
        await whiteCell.locator('[data-session-recorder-stop]').click();
        await expect(whiteCell.locator('[data-session-recorder-download]')).toBeEnabled();
        await expectDownloadFrom(whiteCell, '[data-session-recorder-download]', /^session-recording-.+\.webm$/);
    });

    await test.step('exercise every legacy export plus research archive, print, recording references, and cross-session archive', async () => {
        await openSidebarSection(whiteCell, 'controls');
        await whiteCell.locator('[data-settings-tab="exportData"]').click();
        for (const [exportType, filenamePattern] of [
            ['actions-csv', /-actions\.csv$/],
            ['rfis-csv', /-rfis\.csv$/],
            ['timeline-csv', /-timeline\.csv$/],
            ['participants-csv', /-participants\.csv$/],
            ['session-json', /\.json$/]
        ]) {
            await expectDownloadFrom(whiteCell, `[data-export-type="${exportType}"]`, filenamePattern);
        }

        const researchDownload = await expectDownloadFrom(
            whiteCell,
            '[data-export-type="research-archive"]',
            /^research_export_.+\.zip$/
        );
        const researchEntries = readStoredZipEntries(await readFile(await researchDownload.path()));
        expect(researchEntries.has('session_recording_artifacts.csv')).toBe(true);
        const recordingArtifacts = JSON.parse(researchEntries.get('session_recording_artifacts.json'));
        expect(recordingArtifacts).toHaveLength(1);
        expect(recordingArtifacts[0]).toMatchObject({
            plugin_id: 'session-recorder',
            generated_by_role: 'whitecell_lead'
        });

        const whiteCellPrintPromise = whiteCell.waitForEvent('popup');
        await whiteCell.locator('[data-export-type="research-print"]').click();
        const whiteCellPrintPage = await whiteCellPrintPromise;
        await whiteCellPrintPage.close();
        await whiteCell.locator('[data-settings-tab="plugins"]').click();
        await whiteCell.locator('[data-session-recorder-discard]').click();
        await expect(whiteCell.locator('[data-session-recorder-download]')).toBeDisabled();

        await selectSessionForOperatorView(gameMaster, {
            section: 'export',
            selectId: '#exportSessionSelect',
            sessionName: SESSION_NAME
        });
        for (const [selector, filenamePattern] of [
            ['#exportJsonBtn', /\.json$/],
            ['#exportActionsCsvBtn', /-actions\.csv$/],
            ['#exportRequestsCsvBtn', /-rfis\.csv$/],
            ['#exportTimelineCsvBtn', /-timeline\.csv$/],
            ['#exportParticipantsCsvBtn', /-participants\.csv$/]
        ]) {
            await expectDownloadFrom(gameMaster, selector, filenamePattern);
        }

        const gameMasterPrintPromise = gameMaster.waitForEvent('popup');
        await gameMaster.locator('#printResearchReportBtn').click();
        const gameMasterPrintPage = await gameMasterPrintPromise;
        await gameMasterPrintPage.close();
        await expect(gameMaster.locator('#exportCrossSessionResearchArchiveBtn')).toBeEnabled();
        await expectDownloadFrom(gameMaster, '#exportCrossSessionResearchArchiveBtn', /^research_cross_session_.+\.zip$/);

        await openSidebarSection(gameMaster, 'plugins');
        await expect(gameMaster.locator('#gameMasterPluginMounts [data-plugin-mount="intercom"]')).toBeVisible();
        await expect(gameMaster.locator('#gameMasterPluginMounts [data-plugin-mount="session-recorder"]')).toBeVisible();
    });

    await test.step('filter and bulk-remove seats, archive the session, reject rejoin, and retain closure audit evidence', async () => {
        await openSidebarSection(whiteCell, 'controls');
        await whiteCell.locator('[data-settings-tab="participants"]').click();
        await whiteCell.locator('#participantsTeamFilter').selectOption('blue');
        await whiteCell.locator('#participantsRoleFilter').selectOption({ label: 'Notetakers' });
        await expect(whiteCell.locator('#participantsList')).toContainText('Blue Notetaker Operator One');
        await expect(whiteCell.locator('#participantsList')).toContainText('Blue Notetaker Operator Two');
        await expect(whiteCell.locator('#participantsList')).not.toContainText('Blue Facilitator Operator Rehearsal');

        await selectSessionForOperatorView(gameMaster, {
            section: 'participants',
            selectId: '#participantsSessionSelect',
            sessionName: SESSION_NAME
        });
        const participantsPanel = gameMaster.locator('#participantsList');
        for (const participantName of ['Blue Notetaker Operator One', 'Blue Notetaker Operator Two']) {
            const row = participantsPanel.locator('tr').filter({ hasText: participantName });
            await expect(row).toBeVisible();
            await row.locator('[data-select-session-participant-id]').check();
        }
        expectBrowserConsoleError(notetakerOne, /Participant seat not found\. Please rejoin the session\./);
        expectBrowserConsoleError(notetakerTwo, /Participant seat not found\. Please rejoin the session\./);
        await participantsPanel.locator('[data-remove-selected-session-participants]').click();
        await confirmActiveModal(gameMaster, 'Remove 2 Participants');
        await expect(participantsPanel).not.toContainText('Blue Notetaker Operator One');
        await expect(participantsPanel).not.toContainText('Blue Notetaker Operator Two');

        await openSidebarSection(gameMaster, 'sessions');
        const sessionCard = gameMaster.locator('#sessionsList .session-card').filter({
            has: gameMaster.getByRole('heading', { name: SESSION_NAME, exact: true })
        });
        await sessionCard.locator('.archive-session-btn').click();
        await confirmActiveModal(gameMaster, 'Archive');
        await expect(gameMaster.locator('#sessionsList')).not.toContainText(SESSION_NAME);

        const postArchiveJoin = await createIsolatedActorPage(context, 'operator-controls-post-archive');
        expectBrowserConsoleError(postArchiveJoin, /Failed to join session:.*This session is not currently joinable\./);
        await expectJoinFailure(postArchiveJoin, {
            sessionCode: SESSION_CODE,
            displayName: 'Post Archive Join Attempt',
            team: 'blue',
            roleSurface: 'facilitator'
        }, 'Session not found. Please check the code and try again.');

        const backendState = await dumpE2EMockBackend(gameMaster);
        if (backendState) {
            const archivedSession = getSessionFromState(backendState, SESSION_CODE);
            expect(archivedSession?.status).toBe('archived');
            expect(backendState.tables.research_audit_event_log.filter((event) => (
                event.session_id === archivedSession.id && event.event_type === 'SESSION_CLOSED'
            ))).toHaveLength(1);
        }
    });

    await context.close();
});
