import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const WHITECELL_HTML_PATH = new URL('../../whitecell.html', import.meta.url);
const showToast = vi.fn();
const showModal = vi.fn();
const confirmModal = vi.fn();
const showLoader = vi.fn(() => ({ hide: vi.fn() }));
const hideLoader = vi.fn();
const {
    mockBuildJsonExportPayload,
    mockBuildResearchExportBundle,
    mockDownloadJsonData,
    mockDownloadCsv,
    mockDownloadResearchExportArchive,
    mockExportSessionActionsCsv,
    mockExportSessionRequestsCsv,
    mockExportSessionTimelineCsv,
    mockExportSessionParticipantsCsv,
    mockOpenResearchPrintWindow
} = vi.hoisted(() => ({
    mockBuildJsonExportPayload: vi.fn((bundle) => ({ exported: true, ...bundle })),
    mockBuildResearchExportBundle: vi.fn(async () => ({
        rootFolderName: 'research-bundle',
        reportHtml: '<html><body>Research report</body></html>'
    })),
    mockDownloadJsonData: vi.fn(),
    mockDownloadCsv: vi.fn(),
    mockDownloadResearchExportArchive: vi.fn(),
    mockExportSessionActionsCsv: vi.fn(() => 'actions-csv'),
    mockExportSessionRequestsCsv: vi.fn(() => 'requests-csv'),
    mockExportSessionTimelineCsv: vi.fn(() => 'timeline-csv'),
    mockExportSessionParticipantsCsv: vi.fn(() => 'participants-csv'),
    mockOpenResearchPrintWindow: vi.fn()
}));

vi.mock('../components/ui/Toast.js', () => ({
    showToast
}));

vi.mock('../components/ui/Modal.js', () => ({
    showModal,
    confirmModal
}));

vi.mock('../components/ui/Loader.js', () => ({
    showLoader,
    hideLoader,
    showInlineLoader: vi.fn(() => ({ hide: vi.fn() }))
}));

vi.mock('../features/export/index.js', async () => {
    const actual = await vi.importActual('../features/export/index.js');

    return {
        ...actual,
        buildJsonExportPayload: mockBuildJsonExportPayload,
        buildResearchExportBundle: mockBuildResearchExportBundle,
        downloadJsonData: mockDownloadJsonData,
        downloadCsv: mockDownloadCsv,
        downloadResearchExportArchive: mockDownloadResearchExportArchive,
        exportSessionActionsCsv: mockExportSessionActionsCsv,
        exportSessionRequestsCsv: mockExportSessionRequestsCsv,
        exportSessionTimelineCsv: mockExportSessionTimelineCsv,
        exportSessionParticipantsCsv: mockExportSessionParticipantsCsv,
        openResearchPrintWindow: mockOpenResearchPrintWindow
    };
});

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function extractIdsFromHtml(html) {
    return new Set(
        [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1])
    );
}

function createFakeElement(id = null, tagName = 'div') {
    let textContent = '';
    let explicitInnerHtml = null;

    return {
        id,
        tagName: tagName.toUpperCase(),
        value: '',
        checked: false,
        hidden: false,
        listeners: {},
        classList: {
            add() {},
            remove() {},
            toggle() {}
        },
        querySelectorAll() {
            return [];
        },
        addEventListener(type, callback) {
            this.listeners[type] = callback;
        },
        get textContent() {
            return textContent;
        },
        set textContent(value) {
            textContent = value == null ? '' : String(value);
            explicitInnerHtml = null;
        },
        get innerHTML() {
            return explicitInnerHtml ?? escapeHtml(textContent);
        },
        set innerHTML(value) {
            explicitInnerHtml = value == null ? '' : String(value);
        },
        get outerHTML() {
            const attributes = [];
            if (this.id) {
                attributes.push(`id="${escapeHtml(this.id)}"`);
            }
            if (this.className) {
                attributes.push(`class="${escapeHtml(this.className)}"`);
            }

            return `<${tagName}${attributes.length ? ` ${attributes.join(' ')}` : ''}>${this.innerHTML}</${tagName}>`;
        },
        appendChild(child) {
            explicitInnerHtml = `${explicitInnerHtml ?? ''}${child?.outerHTML ?? ''}`;
        }
    };
}

function createFakeDocument(ids = []) {
    const elements = Object.fromEntries(ids.map((id) => [id, createFakeElement(id)]));

    return {
        elements,
        createElement(tagName) {
            return createFakeElement(null, tagName);
        },
        getElementById(id) {
            return elements[id] || null;
        }
    };
}

async function loadWhiteCellModule() {
    globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
    vi.resetModules();
    return import('./whitecell.js');
}

describe('White Cell DOM contract', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        vi.resetModules();
        delete global.document;
        delete global.fetch;
        delete global.window;
        delete globalThis.__ESG_DISABLE_AUTO_INIT__;
    });

    it('matches the rendered White Cell HTML ids', async () => {
        const html = readFileSync(WHITECELL_HTML_PATH, 'utf8');
        const htmlIds = extractIdsFromHtml(html);
        const { WHITE_CELL_DOM_IDS } = await loadWhiteCellModule();

        expect(WHITE_CELL_DOM_IDS.filter((id) => !htmlIds.has(id))).toEqual([]);
    });

    it('binds the shipped White Cell controls to controller handlers', async () => {
        const { WHITE_CELL_DOM_IDS, WhiteCellController, getWhiteCellDomContract } = await loadWhiteCellModule();
        const fakeDocument = createFakeDocument(WHITE_CELL_DOM_IDS);
        global.document = fakeDocument;

        const controller = new WhiteCellController();
        controller.startTimer = vi.fn();
        controller.pauseTimer = vi.fn();
        controller.resetTimer = vi.fn();
        controller.regressPhase = vi.fn();
        controller.advancePhase = vi.fn();
        controller.regressMove = vi.fn();
        controller.advanceMove = vi.fn();
        controller.handleCommunicationSubmit = vi.fn();
        controller.renderTimeline = vi.fn();

        controller.bindEventListeners();

        expect(getWhiteCellDomContract(fakeDocument).missing).toEqual([]);

        fakeDocument.elements.startTimerBtn.listeners.click();
        fakeDocument.elements.pauseTimerBtn.listeners.click();
        fakeDocument.elements.resetTimerBtn.listeners.click();
        fakeDocument.elements.prevPhaseBtn.listeners.click();
        fakeDocument.elements.nextPhaseBtn.listeners.click();
        fakeDocument.elements.prevMoveBtn.listeners.click();
        fakeDocument.elements.nextMoveBtn.listeners.click();
        fakeDocument.elements.commForm.listeners.submit({
            preventDefault() {},
            currentTarget: fakeDocument.elements.commForm
        });
        fakeDocument.elements.timelineTeamFilter.value = 'blue';
        fakeDocument.elements.timelineTeamFilter.listeners.change({
            currentTarget: fakeDocument.elements.timelineTeamFilter
        });
        fakeDocument.elements.timelineRoleFilter.value = 'facilitator';
        fakeDocument.elements.timelineRoleFilter.listeners.change({
            currentTarget: fakeDocument.elements.timelineRoleFilter
        });
        fakeDocument.elements.timelineMoveFilter.value = '2';
        fakeDocument.elements.timelineMoveFilter.listeners.change({
            currentTarget: fakeDocument.elements.timelineMoveFilter
        });
        fakeDocument.elements.timelineActivityTypeFilter.value = 'ACTION_CREATED';
        fakeDocument.elements.timelineActivityTypeFilter.listeners.change({
            currentTarget: fakeDocument.elements.timelineActivityTypeFilter
        });

        expect(controller.startTimer).toHaveBeenCalledTimes(1);
        expect(controller.pauseTimer).toHaveBeenCalledTimes(1);
        expect(controller.resetTimer).toHaveBeenCalledTimes(1);
        expect(controller.regressPhase).toHaveBeenCalledTimes(1);
        expect(controller.advancePhase).toHaveBeenCalledTimes(1);
        expect(controller.regressMove).toHaveBeenCalledTimes(1);
        expect(controller.advanceMove).toHaveBeenCalledTimes(1);
        expect(controller.handleCommunicationSubmit).toHaveBeenCalledTimes(1);
        expect(controller.timelineFilters).toMatchObject({
            team: 'blue',
            role: 'facilitator',
            move: '2',
            activityType: 'ACTION_CREATED'
        });
        expect(controller.renderTimeline).toHaveBeenCalledTimes(4);
    });

    it('updates White Cell timer controls to expose pause and resume states clearly', async () => {
        const { WHITE_CELL_DOM_IDS, WhiteCellController } = await loadWhiteCellModule();
        const fakeDocument = createFakeDocument(WHITE_CELL_DOM_IDS);
        global.document = fakeDocument;

        const controller = new WhiteCellController();

        controller.syncGameStateFromStore({
            move: 1,
            phase: 1,
            timer_seconds: 5400,
            timer_running: false
        });

        expect(fakeDocument.elements.startTimerBtn.textContent).toBe('Start');
        expect(fakeDocument.elements.startTimerBtn.disabled).toBe(false);
        expect(fakeDocument.elements.pauseTimerBtn.disabled).toBe(true);
        expect(fakeDocument.elements.timerStatus.textContent).toBe('Paused');

        controller.syncGameStateFromStore({
            move: 1,
            phase: 1,
            timer_seconds: 5395,
            timer_running: true
        });

        expect(fakeDocument.elements.startTimerBtn.disabled).toBe(true);
        expect(fakeDocument.elements.pauseTimerBtn.disabled).toBe(false);
        expect(fakeDocument.elements.timerStatus.textContent).toBe('Running');
        expect(fakeDocument.elements.controlTimerDisplay.textContent).toBe('89:55');

        controller.syncGameStateFromStore({
            move: 1,
            phase: 1,
            timer_seconds: 5395,
            timer_running: false
        });

        expect(fakeDocument.elements.startTimerBtn.textContent).toBe('Resume');
        expect(fakeDocument.elements.startTimerBtn.disabled).toBe(false);
        expect(fakeDocument.elements.pauseTimerBtn.disabled).toBe(true);
        expect(fakeDocument.elements.timerStatus.textContent).toBe('Paused');
    });

    it('blocks access without a matching operator grant and enforces team/session scope', async () => {
        const { getWhiteCellAccessState } = await loadWhiteCellModule();
        const teamContext = {
            teamId: 'blue',
            whitecellLeadRole: 'whitecell_lead',
            whitecellSupportRole: 'whitecell_support'
        };

        expect(getWhiteCellAccessState(teamContext, {
            getSessionId: () => 'session-1',
            getSessionData: () => ({ role: 'whitecell_lead' }),
            getRole: () => 'whitecell_lead',
            hasOperatorAccess: () => false
        })).toMatchObject({
            allowed: true,
            cachedOperatorAccess: false,
            sessionId: 'session-1',
            role: 'whitecell_lead',
            operatorRole: 'lead'
        });

        const hasOperatorAccess = vi.fn(() => true);

        expect(getWhiteCellAccessState(teamContext, {
            getSessionId: () => 'session-1',
            getSessionData: () => ({ role: 'whitecell_support' }),
            getRole: () => 'whitecell_support',
            hasOperatorAccess
        })).toMatchObject({
            allowed: true,
            cachedOperatorAccess: true,
            sessionId: 'session-1',
            role: 'whitecell_support',
            operatorRole: 'support'
        });

        expect(hasOperatorAccess).toHaveBeenCalledWith('whitecell', {
            sessionId: 'session-1',
            role: 'whitecell_support'
        });
    });

    it('includes all team seats in the White Cell participant roster while excluding Game Master', async () => {
        const { buildWhiteCellParticipantRoster, formatWhiteCellParticipantSummary } = await loadWhiteCellModule();

        const roster = buildWhiteCellParticipantRoster([
            {
                id: 'blue-facilitator',
                role: 'blue_facilitator',
                display_name: 'Alex',
                is_active: true,
                heartbeat_at: '2026-04-08T10:05:00.000Z'
            },
            {
                id: 'red-facilitator',
                role: 'red_facilitator',
                display_name: 'Priya',
                is_active: true,
                heartbeat_at: '2026-04-08T10:06:00.000Z'
            },
            {
                id: 'green-notetaker',
                role: 'green_notetaker',
                display_name: 'Chris',
                is_active: true,
                heartbeat_at: '2026-04-08T10:03:00.000Z'
            },
            {
                id: 'blue-scribe',
                role: 'blue_scribe',
                display_name: 'Jordan',
                is_active: true,
                heartbeat_at: '2026-04-08T10:04:30.000Z'
            },
            {
                id: 'blue-whitecell',
                role: 'whitecell_support',
                display_name: 'Morgan',
                is_active: true,
                heartbeat_at: '2026-04-08T10:04:00.000Z'
            },
            {
                id: 'gamemaster',
                role: 'white',
                display_name: 'Game Master',
                is_active: true,
                heartbeat_at: '2026-04-08T10:07:00.000Z'
            }
        ]);

        expect(roster.map((participant) => participant.id)).toEqual([
            'red-facilitator',
            'blue-facilitator',
            'blue-scribe',
            'blue-whitecell',
            'green-notetaker'
        ]);
        expect(formatWhiteCellParticipantSummary(roster)).toBe('5 connected participants');
    });

    it('builds cross-team White Cell communication recipients', async () => {
        const { buildWhiteCellCommunicationRecipientOptions } = await loadWhiteCellModule();

        expect(buildWhiteCellCommunicationRecipientOptions()).toEqual(expect.arrayContaining([
            { value: 'all', label: 'All Teams' },
            { value: 'blue', label: 'Blue Team' },
            { value: 'red', label: 'Red Team' },
            { value: 'green', label: 'Green Team' },
            { value: 'blue_facilitator', label: 'Blue Team Facilitator' },
            { value: 'blue_scribe', label: 'Blue Team Scribe' },
            { value: 'red_notetaker', label: 'Red Team Notetaker' },
            { value: 'green_facilitator', label: 'Green Team Facilitator' }
        ]));
    });

    it('loads a validated deck into the requested team scribe seat through shared communications', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { timelineStore } = await import('../stores/timeline.js');

        global.document = createFakeDocument([
            'scribeDeckPath-blue',
            'scribeDeckLabel-blue'
        ]);
        global.document.elements['scribeDeckPath-blue'].value = 'custom-scribe-deck.html';
        global.document.elements['scribeDeckLabel-blue'].value = 'Blue Crisis Deck';
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(`
                <script>
                    const SLIDES = [{"n":1,"title":"Briefing","src":"data:image/png;base64,AAA="}];
                    const SECTIONS = [];
                </script>
            `)
        });

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-42');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        const createCommunication = vi.spyOn(database, 'createCommunication').mockResolvedValue({
            id: 'comm-scribe-1'
        });
        const createTimelineEvent = vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({
            id: 'timeline-scribe-1'
        });
        const communicationsUpdate = vi.spyOn(communicationsStore, 'updateFromServer').mockImplementation(() => {});
        const timelineUpdate = vi.spyOn(timelineStore, 'updateFromServer').mockImplementation(() => {});

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        controller.getCurrentGameState = vi.fn(() => ({ move: 2, phase: 1 }));

        await controller.handleScribeDeckAssignmentSubmit('blue');

        expect(global.fetch).toHaveBeenCalledWith('/decks/blue/custom-scribe-deck.html', {
            credentials: 'same-origin'
        });
        expect(createCommunication).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-42',
            from_role: 'white_cell',
            to_role: 'blue_scribe',
            type: 'GUIDANCE',
            content: 'White Cell loaded "Blue Crisis Deck" into Blue Team Scribe (decks/blue/custom-scribe-deck.html).',
            metadata: expect.objectContaining({
                content_kind: 'SCRIBE_DECK_ASSIGNMENT',
                deck_path: 'decks/blue/custom-scribe-deck.html',
                deck_label: 'Blue Crisis Deck',
                recipient: 'blue_scribe',
                recipient_scope: 'role',
                recipient_team: 'blue',
                recipient_role: 'blue_scribe',
                source: 'scribe_deck_assignment',
                actor_role: 'whitecell_lead'
            })
        }));
        expect(communicationsUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'comm-scribe-1' }));
        expect(createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-42',
            type: 'GUIDANCE',
            content: 'White Cell loaded Blue Crisis Deck into Blue Team Scribe',
            team: 'white_cell',
            move: 2,
            phase: 1,
            metadata: expect.objectContaining({
                role: 'whitecell_lead',
                content_kind: 'SCRIBE_DECK_ASSIGNMENT',
                deck_path: 'decks/blue/custom-scribe-deck.html',
                deck_label: 'Blue Crisis Deck',
                recipient_role: 'blue_scribe'
            })
        }));
        expect(timelineUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'timeline-scribe-1' }));
        expect(showToast).toHaveBeenCalledWith({ message: 'Blue Team scribe deck updated.', type: 'success' });
    });

    it('uploads a browser-cached deck into the requested team scribe seat through shared communications', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { timelineStore } = await import('../stores/timeline.js');
        const deckStorage = await import('../features/scribe/deckStorage.js');

        global.document = createFakeDocument([
            'scribeDeckLabel-blue',
            'scribeDeckUpload-blue'
        ]);
        global.document.elements['scribeDeckLabel-blue'].value = 'Uploaded Crisis Deck';
        global.document.elements['scribeDeckUpload-blue'].files = [{
            name: 'blue-upload.html',
            text: () => Promise.resolve(`
                <script>
                    const SLIDES = [{"n":1,"title":"Uploaded Briefing","src":"data:image/png;base64,BBB="}];
                    const SECTIONS = [];
                </script>
            `)
        }];

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-42');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        const saveUploadedScribeDeck = vi.spyOn(deckStorage, 'saveUploadedScribeDeck').mockResolvedValue({
            storageKey: 'scribe-deck:session-42:blue'
        });
        const createCommunication = vi.spyOn(database, 'createCommunication').mockResolvedValue({
            id: 'comm-scribe-upload-1'
        });
        const createTimelineEvent = vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({
            id: 'timeline-scribe-upload-1'
        });
        const communicationsUpdate = vi.spyOn(communicationsStore, 'updateFromServer').mockImplementation(() => {});
        const timelineUpdate = vi.spyOn(timelineStore, 'updateFromServer').mockImplementation(() => {});

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        controller.getCurrentGameState = vi.fn(() => ({ move: 3, phase: 2 }));

        await controller.handleScribeDeckAssignmentSubmit('blue', {
            useUpload: true
        });

        expect(saveUploadedScribeDeck).toHaveBeenCalledWith(expect.objectContaining({
            storageKey: 'scribe-deck:session-42:blue',
            sessionId: 'session-42',
            teamId: 'blue',
            deckLabel: 'Uploaded Crisis Deck',
            fileName: 'blue-upload.html'
        }));
        expect(createCommunication).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-42',
            from_role: 'white_cell',
            to_role: 'blue_scribe',
            type: 'GUIDANCE',
            content: 'White Cell uploaded "Uploaded Crisis Deck" to Blue Team Scribe (blue-upload.html).',
            metadata: expect.objectContaining({
                content_kind: 'SCRIBE_DECK_ASSIGNMENT',
                deck_source: 'browser_upload',
                deck_storage_key: 'scribe-deck:session-42:blue',
                deck_file_name: 'blue-upload.html',
                deck_label: 'Uploaded Crisis Deck',
                recipient: 'blue_scribe',
                recipient_scope: 'role',
                recipient_team: 'blue',
                recipient_role: 'blue_scribe',
                source: 'scribe_deck_assignment',
                actor_role: 'whitecell_lead'
            })
        }));
        expect(communicationsUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'comm-scribe-upload-1' }));
        expect(createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-42',
            type: 'GUIDANCE',
            content: 'White Cell uploaded Uploaded Crisis Deck to Blue Team Scribe',
            team: 'white_cell',
            move: 3,
            phase: 2,
            metadata: expect.objectContaining({
                role: 'whitecell_lead',
                content_kind: 'SCRIBE_DECK_ASSIGNMENT',
                deck_source: 'browser_upload',
                deck_storage_key: 'scribe-deck:session-42:blue',
                recipient_role: 'blue_scribe'
            })
        }));
        expect(timelineUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'timeline-scribe-upload-1' }));
        expect(showToast).toHaveBeenCalledWith({ message: 'Blue Team scribe slides uploaded.', type: 'success' });
    });

    it('keeps the latest scribe deck assignment for each team in White Cell settings', async () => {
        const { buildWhiteCellScribeDeckAssignments } = await loadWhiteCellModule();

        const assignments = buildWhiteCellScribeDeckAssignments([
            {
                id: 'comm-blue-new',
                created_at: '2026-06-15T11:05:00.000Z',
                metadata: {
                    content_kind: 'SCRIBE_DECK_ASSIGNMENT',
                    recipient_team: 'blue',
                    deck_path: 'blue-new-deck.html',
                    deck_label: 'Blue New Deck'
                }
            },
            {
                id: 'comm-blue-old',
                created_at: '2026-06-15T11:00:00.000Z',
                metadata: {
                    content_kind: 'SCRIBE_DECK_ASSIGNMENT',
                    recipient_team: 'blue',
                    deck_path: 'blue-old-deck.html',
                    deck_label: 'Blue Old Deck'
                }
            },
            {
                id: 'comm-red-new',
                created_at: '2026-06-15T11:10:00.000Z',
                metadata: {
                    content_kind: 'SCRIBE_DECK_ASSIGNMENT',
                    recipient_team: 'red',
                    deck_path: 'red-deck.html',
                    deck_label: 'Red Deck'
                }
            }
        ]);

        expect(assignments.blue).toMatchObject({
            communicationId: 'comm-blue-new',
            deckPath: 'decks/blue/blue-new-deck.html',
            deckLabel: 'Blue New Deck'
        });
        expect(assignments.red).toMatchObject({
            communicationId: 'comm-red-new',
            deckPath: 'decks/red/red-deck.html',
            deckLabel: 'Red Deck'
        });
        expect(assignments.green).toMatchObject({
            communicationId: null
        });
    });

    it('keeps uploaded deck assignments visible in White Cell settings metadata', async () => {
        const { buildWhiteCellScribeDeckAssignments } = await loadWhiteCellModule();

        const assignments = buildWhiteCellScribeDeckAssignments([
            {
                id: 'comm-green-upload',
                created_at: '2026-06-15T11:15:00.000Z',
                metadata: {
                    content_kind: 'SCRIBE_DECK_ASSIGNMENT',
                    recipient_team: 'green',
                    deck_source: 'browser_upload',
                    deck_storage_key: 'scribe-deck:session-42:green',
                    deck_file_name: 'green-upload.html',
                    deck_label: 'Green Upload'
                }
            }
        ]);

        expect(assignments.green).toMatchObject({
            communicationId: 'comm-green-upload',
            deckSource: 'browser_upload',
            deckStorageKey: 'scribe-deck:session-42:green',
            deckFileName: 'green-upload.html',
            deckPath: null,
            deckLabel: 'Green Upload'
        });
    });

    it('builds participant team and role filters from the live roster', async () => {
        const { buildWhiteCellParticipantFilterOptions } = await loadWhiteCellModule();

        const { teamOptions, roleOptions } = buildWhiteCellParticipantFilterOptions([
            { id: 'blue-facilitator', role: 'blue_facilitator' },
            { id: 'blue-scribe', role: 'blue_scribe' },
            { id: 'green-notetaker', role: 'green_notetaker' },
            { id: 'whitecell-seat', role: 'whitecell_support' }
        ]);

        expect(teamOptions).toEqual(expect.arrayContaining([
            { value: '', label: 'All Teams' },
            { value: 'blue', label: 'Blue Team' },
            { value: 'green', label: 'Green Team' }
        ]));
        expect(teamOptions.map((option) => option.value)).not.toContain('white_cell');
        expect(roleOptions).toEqual(expect.arrayContaining([
            { value: '', label: 'All Roles' },
            { value: 'facilitator', label: 'Facilitators' },
            { value: 'scribe', label: 'Scribes' },
            { value: 'notetaker', label: 'Notetakers' }
        ]));
        expect(roleOptions.map((option) => option.value)).not.toContain('whitecell');
    });

    it('filters White Cell timeline events by team, role, move, and activity type', async () => {
        const {
            buildWhiteCellParticipantRoster,
            buildWhiteCellTimelineFilterOptions,
            filterWhiteCellParticipants,
            filterWhiteCellTimelineEvents
        } = await loadWhiteCellModule();

        const roster = buildWhiteCellParticipantRoster([
            { id: 'blue-facilitator', role: 'blue_facilitator', is_active: true },
            { id: 'blue-scribe', role: 'blue_scribe', is_active: true },
            { id: 'green-notetaker', role: 'green_notetaker', is_active: true },
            { id: 'red-whitecell', role: 'whitecell_support', is_active: true }
        ]);

        expect(filterWhiteCellParticipants(roster, {
            team: 'green',
            role: 'notetaker'
        }).map((participant) => participant.id)).toEqual(['green-notetaker']);

        expect(filterWhiteCellParticipants(roster, {
            team: 'blue',
            role: 'scribe'
        }).map((participant) => participant.id)).toEqual(['blue-scribe']);

        const timelineEvents = [
            {
                id: 'timeline-facilitator-action',
                team: 'blue',
                type: 'ACTION_CREATED',
                move: 2,
                metadata: { role: 'blue_facilitator' }
            },
            {
                id: 'timeline-facilitator-capture',
                team: 'blue',
                type: 'NOTE',
                move: 2,
                metadata: { role: 'blue_facilitator', actor: 'facilitator' }
            },
            {
                id: 'timeline-notetaker',
                team: 'green',
                type: 'QUOTE',
                move: 3,
                metadata: { role: 'green_notetaker', actor: 'notetaker' }
            },
            {
                id: 'timeline-whitecell',
                team: 'white_cell',
                type: 'GUIDANCE',
                move: 1,
                metadata: { role: 'whitecell_support' }
            }
        ];

        expect(filterWhiteCellTimelineEvents(timelineEvents, {
            team: 'blue',
            role: 'facilitator'
        }).map((event) => event.id)).toEqual([
            'timeline-facilitator-action',
            'timeline-facilitator-capture'
        ]);

        expect(filterWhiteCellTimelineEvents(timelineEvents, {
            move: '2',
            activityType: 'ACTION_CREATED'
        }).map((event) => event.id)).toEqual(['timeline-facilitator-action']);

        const {
            teamOptions,
            roleOptions,
            moveOptions,
            activityTypeOptions
        } = buildWhiteCellTimelineFilterOptions(timelineEvents);
        expect(teamOptions).toEqual(expect.arrayContaining([
            { value: '', label: 'All Teams' },
            { value: 'blue', label: 'Blue Team' },
            { value: 'green', label: 'Green Team' },
            { value: 'white_cell', label: 'White Cell' }
        ]));
        expect(roleOptions).toEqual(expect.arrayContaining([
            { value: '', label: 'All Roles' },
            { value: 'facilitator', label: 'Facilitators' },
            { value: 'notetaker', label: 'Notetakers' },
            { value: 'whitecell', label: 'White Cell' }
        ]));
        expect(moveOptions).toEqual([
            { value: '', label: 'All Moves' },
            { value: '1', label: 'Move 1' },
            { value: '2', label: 'Move 2' },
            { value: '3', label: 'Move 3' }
        ]);
        expect(activityTypeOptions).toEqual(expect.arrayContaining([
            { value: '', label: 'All Activity Types' },
            { value: 'ACTION_CREATED', label: 'Action Created' },
            { value: 'GUIDANCE', label: 'Guidance' },
            { value: 'NOTE', label: 'Note' },
            { value: 'QUOTE', label: 'Quote' }
        ]));
    });

    it('renders session metadata and timeline phase labels with ASCII separators', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { getPhaseLabel } = await import('../core/enums.js');
        const { sessionStore } = await import('../stores/session.js');
        const fakeDocument = createFakeDocument(['sessionsList', 'timelineList']);
        const emDash = String.fromCharCode(0x2014);
        const middleDot = String.fromCharCode(0x00B7);
        global.document = fakeDocument;

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue(null);

        const controller = new WhiteCellController();
        controller.adminSessions = [
            {
                id: 'session-encoding-1',
                name: 'Encoding Check',
                status: 'active',
                metadata: {}
            }
        ];
        controller.renderSessionsAdmin();

        expect(fakeDocument.elements.sessionsList.innerHTML).toContain('Code: - | Status: active');
        expect(fakeDocument.elements.sessionsList.innerHTML).not.toContain(`Code: ${emDash}`);
        expect(fakeDocument.elements.sessionsList.innerHTML).not.toContain(` ${middleDot} `);

        controller.timelineEvents = [
            {
                id: 'timeline-encoding-1',
                team: 'blue',
                type: 'GUIDANCE',
                content: 'White Cell update shared.',
                move: 3,
                phase: 2,
                created_at: '2026-04-08T10:06:00.000Z',
                metadata: { role: 'blue_facilitator' }
            }
        ];
        controller.timelineFilters = {
            team: null,
            role: null,
            move: null,
            activityType: null
        };
        controller.renderTimeline();

        expect(fakeDocument.elements.timelineList.innerHTML).toContain(
            `Move 3 | Phase 2 - ${getPhaseLabel(2)}`
        );
        expect(fakeDocument.elements.timelineList.innerHTML).not.toContain(` ${middleDot} `);
    });

    it('positions White Cell sidebar badges on the matching review queues', async () => {
        const { WHITE_CELL_DOM_IDS, WhiteCellController } = await loadWhiteCellModule();
        const { actionsStore } = await import('../stores/actions.js');
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const fakeDocument = createFakeDocument(WHITE_CELL_DOM_IDS);
        global.document = fakeDocument;

        const pendingItems = [
            {
                id: 'action-101',
                team: 'blue',
                move: 2,
                phase: 1,
                goal: 'Stabilize port access',
                mechanism: 'Diplomatic pressure',
                status: 'submitted',
                created_at: '2026-04-08T09:00:00.000Z',
                submitted_at: '2026-04-08T09:05:00.000Z'
            },
            {
                id: 'action-102',
                team: 'green',
                move: 2,
                phase: 1,
                goal: 'Coordinate biotech export alignment',
                mechanism: 'Proposal',
                status: 'submitted',
                created_at: '2026-04-08T09:10:00.000Z',
                submitted_at: '2026-04-08T09:15:00.000Z',
                ally_contingencies: serializeProposalDetails({
                    originators: ['EU', 'Japan'],
                    objective: 'Align licensing posture before the next move.',
                    category: 'Alignment',
                    intendedPartners: 'Blue Team',
                    delivery: 'Joint Statement',
                    timingAndConditions: 'Immediately after White Cell review.',
                    recipientTeam: 'blue'
                })
            },
            {
                id: 'action-103',
                team: 'red',
                move: 2,
                phase: 1,
                goal: 'Shape narrative response',
                mechanism: 'Public messaging',
                status: 'submitted',
                created_at: '2026-04-08T09:20:00.000Z',
                submitted_at: '2026-04-08T09:25:00.000Z'
            }
        ];

        vi.spyOn(actionsStore, 'getPending').mockReturnValue(pendingItems);
        vi.spyOn(actionsStore, 'getAll').mockReturnValue(pendingItems);

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';

        controller.syncActionsFromStore();

        expect(fakeDocument.elements.actionsBadge.textContent).toBe('1');
        expect(fakeDocument.elements.proposalsBadge.textContent).toBe('1');
        expect(fakeDocument.elements.responsesBadge.textContent).toBe('1');
        expect(fakeDocument.elements.actionsBadge.hidden).toBe(false);
        expect(fakeDocument.elements.proposalsBadge.hidden).toBe(false);
        expect(fakeDocument.elements.responsesBadge.hidden).toBe(false);
        expect(fakeDocument.elements.actionsBadge.textContent).not.toBe('3');
    });

    it('raises a visible arrival cue when a new Blue action reaches the White Cell queue', async () => {
        const { WHITE_CELL_DOM_IDS, WhiteCellController } = await loadWhiteCellModule();
        const { actionsStore } = await import('../stores/actions.js');
        const fakeDocument = createFakeDocument(WHITE_CELL_DOM_IDS);
        global.document = fakeDocument;

        let pendingItems = [];
        let allItems = [];
        vi.spyOn(actionsStore, 'getPending').mockImplementation(() => pendingItems);
        vi.spyOn(actionsStore, 'getAll').mockImplementation(() => allItems);

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        controller.syncActionsFromStore();

        pendingItems = [{
            id: 'action-arrival-1',
            team: 'blue',
            move: 2,
            phase: 1,
            goal: 'Stabilize port access',
            mechanism: 'Diplomatic pressure',
            status: 'submitted',
            created_at: '2026-04-08T09:00:00.000Z',
            submitted_at: '2026-04-08T09:05:00.000Z',
            expected_outcomes: 'Keep the corridor open for the next move.'
        }];
        allItems = pendingItems;

        controller.syncActionsFromStore({ announce: true });
        controller.flushQueueArrivalAnnouncement();

        expect(showToast).toHaveBeenCalledWith({
            message: 'New team submissions arrived: 1 Blue action.',
            type: 'warning',
            duration: 10000
        });
        expect(fakeDocument.elements.actionsList.innerHTML).toContain('NEW');
        expect(fakeDocument.elements.actionsList.innerHTML).toContain('Stabilize port access');
    });

    it('keeps reviewed Green proposals visible in the White Cell proposals queue', async () => {
        const { WHITE_CELL_DOM_IDS, WhiteCellController } = await loadWhiteCellModule();
        const { actionsStore } = await import('../stores/actions.js');
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const fakeDocument = createFakeDocument(WHITE_CELL_DOM_IDS);
        global.document = fakeDocument;

        const greenProposal = {
            id: 'action-104',
            team: 'green',
            move: 2,
            phase: 1,
            goal: 'Coordinate biotech export alignment',
            mechanism: 'Proposal',
            status: 'adjudicated',
            outcome: 'SUCCESS',
            adjudication_notes: 'Forwarded to Blue Team for review.',
            created_at: '2026-04-08T09:10:00.000Z',
            submitted_at: '2026-04-08T09:15:00.000Z',
            adjudicated_at: '2026-04-08T09:20:00.000Z',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce arbitrage across allied export controls.',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU', 'Japan'],
                objective: 'Align licensing posture before the next move.',
                category: 'Alignment',
                intendedPartners: 'Blue Team',
                delivery: 'Joint Statement',
                timingAndConditions: 'Immediately after White Cell review.',
                recipientTeam: 'blue'
            })
        };

        vi.spyOn(actionsStore, 'getPending').mockReturnValue([]);
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([greenProposal]);

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';

        controller.syncActionsFromStore();

        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Coordinate biotech export alignment');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Deliberation Underway');
        expect(fakeDocument.elements.proposalsList.innerHTML).not.toContain('Adjudicated');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Outcome:</strong> SUCCESS');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Notes:</strong> Forwarded to Blue Team for review.');
        expect(fakeDocument.elements.proposalsBadge.hidden).toBe(true);
    });

    it('shows recipient-state updates for forwarded proposals in the White Cell proposals queue', async () => {
        const { WHITE_CELL_DOM_IDS, WhiteCellController } = await loadWhiteCellModule();
        const { actionsStore } = await import('../stores/actions.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const fakeDocument = createFakeDocument(WHITE_CELL_DOM_IDS);
        global.document = fakeDocument;

        vi.spyOn(actionsStore, 'getPending').mockReturnValue([]);
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([{
            id: 'action-105',
            team: 'green',
            move: 2,
            phase: 1,
            goal: 'Coordinate biotech export alignment',
            mechanism: 'Proposal',
            status: 'adjudicated',
            outcome: 'SUCCESS',
            adjudication_notes: 'Forwarded to Blue Team for review.',
            created_at: '2026-04-08T09:10:00.000Z',
            submitted_at: '2026-04-08T09:15:00.000Z',
            adjudicated_at: '2026-04-08T09:20:00.000Z',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce arbitrage across allied export controls.',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU', 'Japan'],
                objective: 'Align licensing posture before the next move.',
                category: 'Alignment',
                intendedPartners: 'Blue Team',
                delivery: 'Joint Statement',
                timingAndConditions: 'Immediately after White Cell review.',
                recipientTeam: 'blue'
            })
        }]);
        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([{
            id: 'comm-forwarded-queue-1',
            type: 'PROPOSAL_FORWARDED',
            created_at: '2026-04-08T09:21:00.000Z',
            metadata: {
                source_proposal_id: 'action-105',
                recipient_team: 'blue',
                proposal_recipient_state: {
                    status: 'responded',
                    response_content: 'Blue Team can support this with customs coordination.',
                    response_from_team: 'blue',
                    response_sent_at: '2026-04-08T09:25:00.000Z'
                }
            }
        }]);

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        controller.syncActionsFromStore();

        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Recipient Team:</strong> Blue Team');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Recipient Status:</strong> Responded');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Blue Team Response');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Blue Team can support this with customs coordination.');
    });

    it('rerenders White Cell queues when proposal communications change', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { communicationsStore } = await import('../stores/communications.js');

        const controller = new WhiteCellController();
        const syncActionsFromStore = vi.spyOn(controller, 'syncActionsFromStore').mockImplementation(() => {});
        vi.spyOn(controller, 'syncCommunicationsFromStore').mockImplementation(() => {});

        controller.subscribeToLiveData();
        communicationsStore.notify('updated', {
            id: 'comm-forwarded-queue-2',
            type: 'PROPOSAL_FORWARDED'
        });

        expect(syncActionsFromStore).toHaveBeenCalled();

        controller.destroy();
    });

    it('renders facilitator action details needed for White Cell adjudication', async () => {
        const { WhiteCellController, buildSharedActionCommunicationContent } = await loadWhiteCellModule();
        const { actionsStore } = await import('../stores/actions.js');
        global.document = createFakeDocument();
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([
            {
                id: 'action-76',
                team: 'blue',
                move: 2,
                created_at: '2026-04-08T09:00:00.000Z'
            },
            {
                id: 'action-77',
                team: 'blue',
                move: 2,
                created_at: '2026-04-08T10:00:00.000Z'
            }
        ]);

        const controller = new WhiteCellController();
        const blueAction = {
            id: 'action-77',
            goal: 'Stabilize port access',
            mechanism: 'Diplomatic pressure',
            team: 'blue',
            move: 2,
            phase: 3,
            status: 'submitted',
            priority: 'HIGH',
            targets: ['Port Authority'],
            sector: 'Logistics',
            exposure_type: 'Overt',
            expected_outcomes: 'Secure a 72-hour shipping corridor.',
            ally_contingencies: 'Coordinate with customs union partners.',
            submitted_at: '2026-04-08T10:00:00.000Z'
        };
        const markup = controller.renderActionCard(blueAction, {
            showAdjudicateAction: true,
            includeOutcome: false
        });
        const greenMarkup = controller.renderActionCard({
            ...blueAction,
            id: 'action-78',
            team: 'green'
        }, {
            showAdjudicateAction: true,
            includeOutcome: false
        });

        expect(markup).toContain('Blue Team | Move 2 | Action 2 &middot; Phase 3');
        expect(markup).toContain('Targets:</strong> Port Authority');
        expect(markup).toContain('Sector:</strong> Logistics');
        expect(markup).toContain('Exposure:</strong> Overt');
        expect(markup).toContain('Ally Contingencies:</strong> Coordinate with customs union partners.');
        expect(markup).toContain('Submitted:</strong>');
        expect(markup).toContain('Send to Red Team');
        expect(greenMarkup).not.toContain('Send to Red Team');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Blue Team action shared by White Cell');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Title: Stabilize port access');
    });

    it('renders Blue Team action wizard details for White Cell review', async () => {
        const { WhiteCellController, buildSharedActionCommunicationContent } = await loadWhiteCellModule();
        const { serializeBlueActionDetails } = await import('../features/actions/blueActionDetails.js');
        const { actionsStore } = await import('../stores/actions.js');
        global.document = createFakeDocument();
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([
            {
                id: 'action-87',
                team: 'blue',
                move: 2,
                created_at: '2026-04-08T09:00:00.000Z'
            },
            {
                id: 'action-88',
                team: 'blue',
                move: 2,
                created_at: '2026-04-08T10:00:00.000Z'
            }
        ]);

        const controller = new WhiteCellController();
        const blueAction = {
            id: 'action-88',
            goal: 'Harden allied biotech posture',
            mechanism: 'Economic',
            team: 'blue',
            move: 2,
            phase: 2,
            status: 'submitted',
            targets: ['PRC', 'Japan'],
            sector: 'Biotechnology',
            exposure_type: 'Advanced Manufacturing',
            expected_outcomes: 'Reduce leverage over critical production nodes.',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Constrain upstream dependency before the next move.',
                levers: ['Investment Screening', 'Industrial Policy'],
                sectors: ['Biotechnology', 'Agriculture'],
                implementation: 'Legislative',
                legislativeOptions: ['Existing legislation/policy', 'Proposing new legislation/policy'],
                enforcementTimeline: '12 months',
                coordinated: ['Legislative'],
                informed: ['Allied']
            })
        };

        const markup = controller.renderActionCard(blueAction, {
            showAdjudicateAction: true,
            includeOutcome: false
        });

        expect(markup).toContain('Objective:</strong> Constrain upstream dependency before the next move.');
        expect(markup).toContain('Levers:</strong> Investment Screening, Industrial Policy');
        expect(markup).toContain('Sectors:</strong> Biotechnology, Agriculture');
        expect(markup).toContain('Legislative Route:</strong> Existing legislation/policy, Proposing new legislation/policy');
        expect(markup).toContain('Focus Countries:</strong> PRC, Japan');
        expect(markup).toContain('Timeline:</strong> 12 months');
        expect(markup).toContain('Coordinated:</strong> Legislative');
        expect(markup).toContain('Blue Team | Move 2 | Action 2 &middot; Phase 2');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Objective: Constrain upstream dependency before the next move.');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Levers: Investment Screening, Industrial Policy');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Legislative Route: Existing legislation/policy, Proposing new legislation/policy');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Enforcement Timeline: 12 months');
    });

    it('renders structured Green proposal details for White Cell review', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const { actionsStore } = await import('../stores/actions.js');
        global.document = createFakeDocument();
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([
            {
                id: 'action-89',
                team: 'green',
                move: 2,
                created_at: '2026-04-08T09:00:00.000Z'
            },
            {
                id: 'action-90',
                team: 'green',
                move: 2,
                created_at: '2026-04-08T10:00:00.000Z'
            }
        ]);

        const controller = new WhiteCellController();
        const proposal = {
            id: 'action-90',
            goal: 'Coordinate biotech export alignment',
            mechanism: 'Proposal',
            team: 'green',
            move: 2,
            phase: 1,
            status: 'submitted',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce arbitrage across allied export controls.',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU', 'Japan'],
                objective: 'Align licensing posture before the next move.',
                category: 'Alignment',
                intendedPartners: 'Blue Team',
                delivery: 'Joint Statement',
                timingAndConditions: 'Immediately after White Cell review.',
                recipientTeam: 'blue'
            })
        };

        const markup = controller.renderActionCard(proposal, {
            showAdjudicateAction: true,
            includeOutcome: false
        });

        expect(markup).toContain('Proposal Overview');
        expect(markup).toContain('Routing &amp; Delivery');
        expect(markup).toContain('Originators');
        expect(markup).toContain('Recipient Team');
        expect(markup).toContain('Blue Team');
        expect(markup).toContain('Review Proposal');
        expect(markup).not.toContain('Proposal Details');
    });

    it('shows proposal-specific review options in the White Cell modal', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const { actionsStore } = await import('../stores/actions.js');
        global.document = createFakeDocument();
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([
            {
                id: 'action-91',
                team: 'green',
                move: 2,
                created_at: '2026-04-08T09:00:00.000Z'
            }
        ]);

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';

        controller.showAdjudicateModal({
            id: 'action-91',
            goal: 'Coordinate biotech export alignment',
            mechanism: 'Proposal',
            team: 'green',
            move: 2,
            phase: 1,
            status: 'submitted',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce arbitrage across allied export controls.',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU', 'Japan'],
                objective: 'Align licensing posture before the next move.',
                category: 'Alignment',
                intendedPartners: 'Blue Team',
                delivery: 'Joint Statement',
                timingAndConditions: 'Immediately after White Cell review.',
                recipientTeam: 'blue'
            })
        });

        const modalConfig = showModal.mock.calls.at(-1)?.[0];
        expect(modalConfig?.title).toBe('Review Proposal');
        expect(modalConfig?.buttons?.[1]?.label).toBe('Submit Proposal Review');
        expect(modalConfig?.content?.innerHTML).toContain('Forward to Blue Team');
        expect(modalConfig?.content?.innerHTML).toContain('Request Changes');
        expect(modalConfig?.content?.innerHTML).toContain('Reject Proposal');
        expect(modalConfig?.content?.innerHTML).toContain('Green Team must submit a new proposal');
        expect(modalConfig?.content?.innerHTML).toContain('Proposal Overview');
    });

    it('forwards a proposal to its intended partner when White Cell selects forward', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        const { actionsStore } = await import('../stores/actions.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { timelineStore } = await import('../stores/timeline.js');

        global.document = {
            querySelector(selector) {
                if (selector === 'input[name="proposalReviewDecision"]:checked') {
                    return { value: 'forward_to_recipient' };
                }

                return null;
            },
            getElementById(id) {
                if (id === 'adjudicationNotes') {
                    return { value: 'Forward for Blue Team consideration.' };
                }

                return null;
            }
        };

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-11');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        const adjudicateAction = vi.spyOn(database, 'adjudicateAction').mockResolvedValue({
            id: 'action-92',
            team: 'green',
            move: 2,
            phase: 1,
            status: 'adjudicated',
            outcome: 'SUCCESS',
            goal: 'Coordinate biotech export alignment',
            mechanism: 'Proposal',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce arbitrage across allied export controls.',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU', 'Japan'],
                objective: 'Align licensing posture before the next move.',
                category: 'Alignment',
                intendedPartners: 'Blue Team',
                delivery: 'Joint Statement',
                timingAndConditions: 'Immediately after White Cell review.',
                recipientTeam: 'blue'
            })
        });
        const createCommunication = vi.spyOn(database, 'createCommunication').mockResolvedValue({
            id: 'comm-proposal-1',
            to_role: 'blue',
            type: 'PROPOSAL_FORWARDED',
            content: 'forwarded proposal'
        });
        const createTimelineEvent = vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({
            id: 'timeline-proposal-1'
        });
        const actionsUpdate = vi.spyOn(actionsStore, 'updateFromServer').mockImplementation(() => {});
        const communicationsGetAll = vi.spyOn(communicationsStore, 'getAll').mockReturnValue([]);
        const communicationsUpdate = vi.spyOn(communicationsStore, 'updateFromServer').mockImplementation(() => {});
        const timelineUpdate = vi.spyOn(timelineStore, 'updateFromServer').mockImplementation(() => {});

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        controller.getCurrentGameState = vi.fn(() => ({ move: 4, phase: 2 }));

        const modal = { close: vi.fn() };
        const proposal = {
            id: 'action-92',
            team: 'green',
            move: 2,
            phase: 1,
            status: 'submitted',
            goal: 'Coordinate biotech export alignment',
            mechanism: 'Proposal',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce arbitrage across allied export controls.',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU', 'Japan'],
                objective: 'Align licensing posture before the next move.',
                category: 'Alignment',
                intendedPartners: 'Blue Team',
                delivery: 'Joint Statement',
                timingAndConditions: 'Immediately after White Cell review.',
                recipientTeam: 'blue'
            })
        };

        await controller.handleProposalReview(modal, proposal);

        expect(adjudicateAction).toHaveBeenCalledWith('action-92', expect.objectContaining({
            outcome: 'SUCCESS',
            adjudication_notes: 'Forward for Blue Team consideration.'
        }));
        expect(createCommunication).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-11',
            from_role: 'white_cell',
            to_role: 'blue',
            type: 'PROPOSAL_FORWARDED',
            metadata: expect.objectContaining({
                source_proposal_id: 'action-92',
                source_team: 'green',
                outcome: 'SUCCESS',
                review_decision: 'forward_to_recipient'
            })
        }));
        expect(createCommunication.mock.calls[0][0].content).toContain('White Cell decision: Forwarded to Blue Team');
        expect(createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-11',
            type: 'ACTION_ADJUDICATED',
            content: 'Proposal review recorded: Forwarded to Blue Team',
            metadata: expect.objectContaining({
                role: 'whitecell_lead',
                proposal_review_decision: 'forward_to_recipient',
                proposal_recipient_team: 'blue',
                proposal: true
            })
        }));
        expect(actionsUpdate).toHaveBeenCalledWith('UPDATE', expect.objectContaining({ id: 'action-92' }));
        expect(communicationsGetAll).toHaveBeenCalled();
        expect(communicationsUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'comm-proposal-1' }));
        expect(timelineUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'timeline-proposal-1' }));
        expect(showToast).toHaveBeenCalledWith({ message: 'Proposal forwarded to Blue Team', type: 'success' });
        expect(modal.close).toHaveBeenCalled();
    });

    it('forwards a proposal even when the adjudication response omits proposal details', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        const { actionsStore } = await import('../stores/actions.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { timelineStore } = await import('../stores/timeline.js');

        global.document = {
            querySelector(selector) {
                if (selector === 'input[name="proposalReviewDecision"]:checked') {
                    return { value: 'forward_to_recipient' };
                }

                return null;
            },
            getElementById(id) {
                if (id === 'adjudicationNotes') {
                    return { value: 'Forward using the approved recipient.' };
                }

                return null;
            }
        };

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-13');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        vi.spyOn(database, 'adjudicateAction').mockResolvedValue({
            id: 'action-94',
            team: 'green',
            move: 2,
            phase: 1,
            status: 'adjudicated',
            outcome: 'SUCCESS',
            goal: 'Coordinate biotech export alignment',
            mechanism: 'Proposal',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce arbitrage across allied export controls.'
        });
        const createCommunication = vi.spyOn(database, 'createCommunication').mockResolvedValue({
            id: 'comm-proposal-3',
            to_role: 'blue',
            type: 'PROPOSAL_FORWARDED',
            content: 'forwarded proposal'
        });
        vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({
            id: 'timeline-proposal-3'
        });
        vi.spyOn(actionsStore, 'updateFromServer').mockImplementation(() => {});
        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([]);
        vi.spyOn(communicationsStore, 'updateFromServer').mockImplementation(() => {});
        vi.spyOn(timelineStore, 'updateFromServer').mockImplementation(() => {});

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        controller.getCurrentGameState = vi.fn(() => ({ move: 6, phase: 1 }));

        await controller.handleProposalReview({ close: vi.fn() }, {
            id: 'action-94',
            team: 'green',
            move: 2,
            phase: 1,
            status: 'submitted',
            goal: 'Coordinate biotech export alignment',
            mechanism: 'Proposal',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce arbitrage across allied export controls.',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU', 'Japan'],
                objective: 'Align licensing posture before the next move.',
                category: 'Alignment',
                intendedPartners: 'Blue Team',
                delivery: 'Joint Statement',
                timingAndConditions: 'Immediately after White Cell review.',
                recipientTeam: 'blue'
            })
        });

        expect(createCommunication).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-13',
            to_role: 'blue',
            type: 'PROPOSAL_FORWARDED',
            metadata: expect.objectContaining({
                source_proposal_id: 'action-94',
                source_team: 'green',
                recipient_team: 'blue'
            })
        }));
        expect(createCommunication.mock.calls[0][0].content).toContain('Title: Coordinate biotech export alignment');
        expect(createCommunication.mock.calls[0][0].content).toContain('Objective: Align licensing posture before the next move.');
    });

    it('records proposal change requests without forwarding them to another team', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        const { actionsStore } = await import('../stores/actions.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { timelineStore } = await import('../stores/timeline.js');

        global.document = {
            querySelector(selector) {
                if (selector === 'input[name="proposalReviewDecision"]:checked') {
                    return { value: 'request_changes' };
                }

                return null;
            },
            getElementById(id) {
                if (id === 'adjudicationNotes') {
                    return { value: 'Clarify the timing conditions before we forward this.' };
                }

                return null;
            }
        };

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-12');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        const adjudicateAction = vi.spyOn(database, 'adjudicateAction').mockResolvedValue({
            id: 'action-93',
            team: 'green',
            move: 2,
            phase: 1,
            status: 'adjudicated',
            outcome: 'PARTIAL_SUCCESS',
            goal: 'Coordinate biotech export alignment',
            mechanism: 'Proposal',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce arbitrage across allied export controls.',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU', 'Japan'],
                objective: 'Align licensing posture before the next move.',
                category: 'Alignment',
                intendedPartners: 'Blue Team',
                delivery: 'Joint Statement',
                timingAndConditions: 'Immediately after White Cell review.',
                recipientTeam: 'blue'
            })
        });
        const createCommunication = vi.spyOn(database, 'createCommunication').mockResolvedValue({
            id: 'comm-proposal-2'
        });
        const createTimelineEvent = vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({
            id: 'timeline-proposal-2'
        });
        const actionsUpdate = vi.spyOn(actionsStore, 'updateFromServer').mockImplementation(() => {});
        const communicationsUpdate = vi.spyOn(communicationsStore, 'updateFromServer').mockImplementation(() => {});
        const timelineUpdate = vi.spyOn(timelineStore, 'updateFromServer').mockImplementation(() => {});

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        controller.getCurrentGameState = vi.fn(() => ({ move: 5, phase: 1 }));

        await controller.handleProposalReview({ close: vi.fn() }, {
            id: 'action-93',
            team: 'green',
            move: 2,
            phase: 1,
            status: 'submitted',
            goal: 'Coordinate biotech export alignment',
            mechanism: 'Proposal',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce arbitrage across allied export controls.',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU', 'Japan'],
                objective: 'Align licensing posture before the next move.',
                category: 'Alignment',
                intendedPartners: 'Blue Team',
                delivery: 'Joint Statement',
                timingAndConditions: 'Immediately after White Cell review.',
                recipientTeam: 'blue'
            })
        });

        expect(adjudicateAction).toHaveBeenCalledWith('action-93', expect.objectContaining({
            outcome: 'PARTIAL_SUCCESS',
            adjudication_notes: 'Clarify the timing conditions before we forward this.'
        }));
        expect(createCommunication).not.toHaveBeenCalled();
        expect(communicationsUpdate).not.toHaveBeenCalled();
        expect(createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-12',
            type: 'ACTION_ADJUDICATED',
            content: 'Proposal review recorded: Changes requested',
            metadata: expect.objectContaining({
                proposal_review_decision: 'request_changes',
                proposal_recipient_team: 'blue',
                proposal: true
            })
        }));
        expect(actionsUpdate).toHaveBeenCalledWith('UPDATE', expect.objectContaining({ id: 'action-93' }));
        expect(timelineUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'timeline-proposal-2' }));
        expect(showToast).toHaveBeenCalledWith({ message: 'Proposal review saved: changes requested', type: 'success' });
    });

    it('sends Blue team actions to the Red team as White Cell communications', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { timelineStore } = await import('../stores/timeline.js');

        global.document = createFakeDocument();
        confirmModal.mockResolvedValue(true);

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-9');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        const createCommunication = vi.spyOn(database, 'createCommunication').mockResolvedValue({
            id: 'comm-1',
            to_role: 'red',
            type: 'GUIDANCE',
            content: 'shared action'
        });
        const createTimelineEvent = vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({
            id: 'timeline-1'
        });
        const communicationsUpdate = vi.spyOn(communicationsStore, 'updateFromServer').mockImplementation(() => {});
        const timelineUpdate = vi.spyOn(timelineStore, 'updateFromServer').mockImplementation(() => {});

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        controller.getCurrentGameState = vi.fn(() => ({ move: 3, phase: 2 }));

        await controller.shareActionWithRedTeam({
            id: 'action-77',
            team: 'blue',
            goal: 'Stabilize port access',
            mechanism: 'Diplomatic pressure',
            move: 2,
            phase: 3,
            targets: ['Port Authority'],
            sector: 'Logistics',
            exposure_type: 'Overt',
            expected_outcomes: 'Secure a 72-hour shipping corridor.',
            ally_contingencies: 'Coordinate with customs union partners.'
        });

        expect(confirmModal).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Share with Red Team',
            confirmLabel: 'Send to Red Team'
        }));
        expect(createCommunication).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-9',
            from_role: 'white_cell',
            to_role: 'red',
            type: 'GUIDANCE',
            metadata: expect.objectContaining({
                shared_action_id: 'action-77',
                source_team: 'blue',
                actor_role: 'whitecell_lead'
            })
        }));
        expect(createCommunication.mock.calls[0][0].content).toContain('Blue Team action shared by White Cell');
        expect(createCommunication.mock.calls[0][0].content).toContain('Title: Stabilize port access');
        expect(communicationsUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'comm-1' }));
        expect(createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-9',
            type: 'GUIDANCE',
            content: 'White Cell shared Blue Team action with Red Team: Stabilize port access',
            team: 'white_cell',
            move: 3,
            phase: 2,
            metadata: expect.objectContaining({
                role: 'whitecell_lead',
                shared_action_id: 'action-77',
                recipient: 'red',
                source_team: 'blue'
            })
        }));
        expect(timelineUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'timeline-1' }));
        expect(showToast).toHaveBeenCalledWith({ message: 'Action shared with Red Team', type: 'success' });
    });

    it('sends Tribe Street Journal updates with explicit recipient metadata', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { WHITE_CELL_UPDATE_KINDS } = await import('../features/communications/targeting.js');
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { timelineStore } = await import('../stores/timeline.js');

        global.document = createFakeDocument();

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-10');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_support');
        const createCommunication = vi.spyOn(database, 'createCommunication').mockResolvedValue({
            id: 'comm-2',
            to_role: 'green_notetaker',
            type: 'GUIDANCE',
            content: 'Population sentiment is turning more skeptical.'
        });
        const createTimelineEvent = vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({
            id: 'timeline-2'
        });
        const communicationsUpdate = vi.spyOn(communicationsStore, 'updateFromServer').mockImplementation(() => {});
        const timelineUpdate = vi.spyOn(timelineStore, 'updateFromServer').mockImplementation(() => {});

        const controller = new WhiteCellController();
        controller.operatorRole = 'support';
        controller.getCurrentGameState = vi.fn(() => ({ move: 4, phase: 1 }));

        await controller.submitSectionUpdate(null, {
            recipient: 'green_notetaker',
            contentKind: WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL,
            content: 'Population sentiment is turning more skeptical.',
            sourceMetadata: {
                source_event_id: 'event-7',
                source_team: 'blue'
            }
        });

        expect(createCommunication).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-10',
            from_role: 'white_cell',
            to_role: 'green_notetaker',
            type: 'GUIDANCE',
            content: 'Population sentiment is turning more skeptical.',
            metadata: expect.objectContaining({
                content_kind: WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL,
                source_event_id: 'event-7',
                source_team: 'blue',
                recipient: 'green_notetaker',
                recipient_scope: 'role',
                recipient_team: 'green',
                recipient_role: 'green_notetaker'
            })
        }));
        expect(createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-10',
            type: 'GUIDANCE',
            content: expect.stringContaining('Tribe Street Journal update'),
            team: 'white_cell',
            move: 4,
            phase: 1,
            metadata: expect.objectContaining({
                role: 'whitecell_support',
                content_kind: WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL,
                source_event_id: 'event-7',
                source_team: 'blue',
                recipient: 'green_notetaker',
                recipient_scope: 'role',
                recipient_team: 'green',
                recipient_role: 'green_notetaker'
            })
        }));
        expect(communicationsUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'comm-2' }));
        expect(timelineUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'timeline-2' }));
        expect(showToast).toHaveBeenCalledWith({ message: 'Update sent', type: 'success' });
    });

    it('renders the Tribe Street Journal embed panel above White Cell journal captures', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const fakeDocument = createFakeDocument(['tribeStreetJournalEmbed', 'tribeStreetJournalList']);

        global.document = fakeDocument;

        const controller = new WhiteCellController();
        controller.tribeStreetJournalEntries = [{
            id: 'capture-1',
            team: 'blue',
            type: 'NOTE',
            content: 'Dockworkers reported new inspection slowdowns.',
            move: 3,
            phase: 2,
            created_at: '2026-04-10T14:00:00.000Z',
            metadata: {
                actor: 'Blue Notetaker'
            }
        }];

        controller.renderTribeStreetJournalList();

        expect(fakeDocument.elements.tribeStreetJournalEmbed.innerHTML).toContain('https://tribestreetjournal.com/');
        expect(fakeDocument.elements.tribeStreetJournalEmbed.innerHTML).toContain('Open in new tab');
        expect(fakeDocument.elements.tribeStreetJournalList.innerHTML).toContain('Dockworkers reported new inspection slowdowns.');
    });

    it('surfaces structured notetaker dynamics and alliance snapshots in White Cell review feeds', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { timelineStore } = await import('../stores/timeline.js');
        const fakeDocument = createFakeDocument([
            'tribeStreetJournalEmbed',
            'tribeStreetJournalList',
            'timelineTeamFilter',
            'timelineRoleFilter',
            'timelineMoveFilter',
            'timelineActivityTypeFilter',
            'timelineList'
        ]);

        global.document = fakeDocument;

        vi.spyOn(timelineStore, 'getAll').mockReturnValue([{
            id: 'capture-dynamics-1',
            team: 'blue',
            type: 'NOTE',
            content: 'Team dynamics notes saved',
            move: 3,
            phase: 2,
            created_at: '2026-04-10T14:00:00.000Z',
            metadata: {
                actor: 'Blue Notetaker',
                role: 'blue_notetaker',
                source: 'notetaker_save',
                note_scope: 'dynamics',
                note_details: [
                    { label: 'Emerging Leaders', value: 'Trade minister and finance deputy' },
                    { label: 'Friction Sources', value: 'Tariff sequencing dispute' },
                    { label: 'Summary Notes', value: 'The room is aligned on leverage but split on timing.' }
                ]
            }
        }]);

        const controller = new WhiteCellController();
        controller.syncTimelineFromStore();

        expect(fakeDocument.elements.tribeStreetJournalList.innerHTML).toContain('TEAM DYNAMICS SNAPSHOT');
        expect(fakeDocument.elements.tribeStreetJournalList.innerHTML).toContain('Tariff sequencing dispute');
        expect(fakeDocument.elements.timelineList.innerHTML).toContain('Team Dynamics snapshot');
        expect(fakeDocument.elements.timelineList.innerHTML).toContain('Trade minister and finance deputy');
    });

    it('exports CSV data from the fetched session bundle for the active session', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');

        global.document = createFakeDocument();

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('12345678-session');
        const fetchSessionBundle = vi.spyOn(database, 'fetchSessionBundle').mockResolvedValue({
            session: { id: '12345678-session', name: 'Alpha Session' },
            gameState: { move: 2, phase: 1 },
            participants: [{ id: 'participant-1' }],
            actions: [{ id: 'action-1' }],
            requests: [{ id: 'request-1' }],
            timeline: [{ id: 'timeline-1' }]
        });

        const controller = new WhiteCellController();
        await controller.handleExportAdmin('actions-csv');

        expect(fetchSessionBundle).toHaveBeenCalledWith('12345678-session');
        expect(mockExportSessionActionsCsv).toHaveBeenCalledWith([{ id: 'action-1' }]);
        expect(mockDownloadCsv).toHaveBeenCalledWith('actions-csv', 'session-12345678-actions.csv');
        expect(showToast).toHaveBeenCalledWith({ message: 'Export downloaded.', type: 'success' });
    });

    it('renders White Cell research export controls by default and still locks them in standard mode', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { sessionStore } = await import('../stores/session.js');
        const fakeDocument = createFakeDocument(['exportDataList']);

        global.document = fakeDocument;

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('12345678-session');
        vi.spyOn(sessionStore, 'getSessionData').mockReturnValue({
            id: '12345678-session',
            name: 'Alpha Session'
        });

        const controller = new WhiteCellController();
        controller.renderExportDataAdmin();

        expect(fakeDocument.elements.exportDataList.innerHTML).toContain('Download Research ZIP');
        expect(fakeDocument.elements.exportDataList.innerHTML).toContain('Print Report');
        expect(fakeDocument.elements.exportDataList.innerHTML).toContain('whiteCellExportResearchIncludeNotes');
        expect(fakeDocument.elements.exportDataList.innerHTML).toContain(
            'JSON, CSV, and research exports are ready for Alpha Session.'
        );

        controller.researchCaptureMode = 'standard';
        controller.renderExportDataAdmin();

        expect(fakeDocument.elements.exportDataList.innerHTML).toContain(
            'Research archive controls stay locked until research capture mode is enabled.'
        );
    });

    it('exports the research archive from the fetched research bundle for the active session', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');

        global.document = createFakeDocument();

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('12345678-session');
        vi.spyOn(sessionStore, 'getOperatorAuth').mockReturnValue({
            grantId: 'grant-12345678'
        });
        const fetchResearchExportBundle = vi.spyOn(database, 'fetchResearchExportBundle').mockResolvedValue({
            session: { id: '12345678-session', name: 'Alpha Session' },
            softwareBuildHash: 'bundle-build-hash'
        });

        const controller = new WhiteCellController();
        controller.researchCaptureMode = 'research';
        controller.researchBuildHash = 'runtime-build-hash';
        await controller.handleExportAdmin('research-archive');

        expect(fetchResearchExportBundle).toHaveBeenCalledWith('12345678-session');
        expect(mockBuildResearchExportBundle).toHaveBeenCalledWith(
            expect.objectContaining({
                session: { id: '12345678-session', name: 'Alpha Session' },
                softwareBuildHash: 'bundle-build-hash'
            }),
            expect.objectContaining({
                captureMode: 'research',
                includeNotesAppendix: false,
                softwareBuildHash: 'runtime-build-hash',
                generatedByPseudonym: expect.any(String)
            })
        );
        expect(mockDownloadResearchExportArchive).toHaveBeenCalledWith(
            expect.objectContaining({ rootFolderName: 'research-bundle' }),
            'research-bundle.zip'
        );
        expect(showToast).toHaveBeenCalledWith({ message: 'Research archive is ready.', type: 'success' });
    });
});
