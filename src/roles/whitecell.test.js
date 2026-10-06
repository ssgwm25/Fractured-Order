import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import { SESSION_CODE_MAX_LENGTH } from '../utils/validation.js';
import { serializeBlueActionDetails } from '../features/actions/blueActionDetails.js';
import { serializeStrategicOrientationDetails } from '../features/actions/strategicOrientationDetails.js';
import { buildAppPath } from '../core/navigation.js';

const WHITECELL_HTML_PATH = new URL('../../whitecell.html', import.meta.url);
const CARDS_CSS_PATH = new URL('../../styles/components/cards.css', import.meta.url);
const MODALS_CSS_PATH = new URL('../../styles/components/modals.css', import.meta.url);
const MODULE_LOAD_TEST_TIMEOUT_MS = 15000;
const INITIAL_MODULE_LOAD_TEST_TIMEOUT_MS = 30000;
const showToast = vi.fn();
const showDurableNotification = vi.fn();
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
    mockOpenResearchPrintWindow,
    mockMountFollowAlong
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
    mockOpenResearchPrintWindow: vi.fn(),
    mockMountFollowAlong: vi.fn(() => ({ destroy: vi.fn() }))
}));

vi.mock('../components/ui/Toast.js', () => ({
    showToast,
    showDurableNotification
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

vi.mock('../features/onboarding/followAlong.js', () => ({
    mountFollowAlong: mockMountFollowAlong
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

function flattenHighlights(steps) {
    return steps.flatMap((step) => (
        Array.isArray(step.highlight)
            ? step.highlight
            : (step.highlight ? [step.highlight] : [])
    ));
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
        disabled: false,
        dataset: {},
        attributes: {},
        listeners: {},
        classList: {
            add() {},
            remove() {},
            toggle() {}
        },
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        getAttribute(name) {
            return this.attributes[name];
        },
        querySelectorAll() {
            return [];
        },
        querySelector() {
            return null;
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
        },
        querySelectorAll(selector) {
            if (selector === '[data-timer-allocation-mark]') {
                return Object.values(elements).filter((element) => element.dataset?.timerAllocationMark);
            }

            return [];
        }
    };
}

function buildStrategicOrientationAction(team, {
    status = 'submitted',
    orientation = 'pressure'
} = {}) {
    const profileDetails = {
        blue: {
            forecastTargets: [{ key: 'red', orientation: 'stabilization' }],
            forecastActionDescription: 'Red will preserve market access.'
        },
        red: {
            forecastTargets: [
                { key: 'blue', orientation: 'pressure' },
                { key: 'green_asian_pacific', orientation: 'reframe' },
                { key: 'green_europe', orientation: 'stabilization' }
            ],
            orientationRationale: 'Red will reframe its partnerships.'
        },
        green: {
            forecastTargets: [{ key: 'blue', orientation: 'pressure' }],
            strategyDescription: 'Green will stabilize exposure given the Blue forecast.'
        },
        industry: {
            forecastTargets: [{ key: 'blue', orientation: 'pressure' }],
            industryStrategicPlan: (() => {
                const sectorPlan = {
                    businessOverview: 'Complete Industry overview.',
                    risks: [
                        { type: 'supply_disruption', likelihood: 'high', impact: 'high', tiedCell: 'red' },
                        { type: 'reputational', likelihood: 'medium', impact: 'medium', tiedCell: 'green' },
                        { type: 'regulatory_legal', likelihood: 'low', impact: 'medium', tiedCell: 'blue' }
                    ],
                    redPriorities: 'Preserve market access.',
                    partners: [{ partner: 'Kenya', whyTheyMatter: 'Supply', likelyWant: 'Investment' }],
                    firstAmbassadorTarget: { cell: 'green', reason: 'Coordinate supply.' },
                    strategicPriorities: [
                        { priority: 'One', successLooksLike: 'One complete.' },
                        { priority: 'Two', successLooksLike: 'Two complete.' },
                        { priority: 'Three', successLooksLike: 'Three complete.' }
                    ],
                    strategicStance: 3,
                    redLine: 'No protected transfer.'
                };
                return {
                    version: 2,
                    sectorPlans: Object.fromEntries(['Agriculture', 'Telecommunications', 'Biotechnology']
                        .map((sector) => [sector, structuredClone(sectorPlan)]))
                };
            })()
        }
    }[team];
    return {
        id: `strategic-orientation-${team}`,
        team,
        status,
        mechanism: 'Strategic Orientation',
        ally_contingencies: serializeStrategicOrientationDetails({
            team,
            ownOrientation: team === 'industry' ? null : orientation,
            ...profileDetails
        })
    };
}

async function loadWhiteCellModule() {
    globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
    vi.resetModules();
    return import('./whitecell.js');
}

describe('White Cell DOM contract', () => {
    afterEach(() => {
        vi.useRealTimers();
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
    }, INITIAL_MODULE_LOAD_TEST_TIMEOUT_MS);

    it('renders a fixed Blue action mark rail with zero counts and newest records first', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        global.document = createFakeDocument();
        const container = createFakeElement('actionsList');
        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';

        controller.renderBlueActionMarkQueue(container, [{
            id: 'move-1-old',
            team: 'blue',
            move: 1,
            status: 'submitted',
            workflow_state: 'submitted_to_white_cell',
            goal: 'Older Move 1 action',
            updated_at: '2026-08-05T10:00:00.000Z'
        }, {
            id: 'move-1-new',
            team: 'blue',
            move: 1,
            status: 'submitted',
            workflow_state: 'resubmitted',
            revision_number: 2,
            goal: 'Newer Move 1 action',
            ally_contingencies: serializeBlueActionDetails({
                notificationTeams: ['Green', 'Industry'],
                notificationNote: 'Inform both teams after White Cell completes review.'
            }),
            updated_at: '2026-08-05T11:00:00.000Z'
        }, {
            ...buildStrategicOrientationAction('blue'),
            workflow_state: 'submitted_to_white_cell',
            updated_at: '2026-08-05T09:00:00.000Z'
        }]);

        expect(container.innerHTML).toContain('role="tablist"');
        expect(container.innerHTML).toContain('aria-label="Strategic Orientation, 1 record"');
        expect(container.innerHTML).toContain('aria-label="Move 1, 2 records"');
        expect(container.innerHTML).toContain('aria-label="Move 2, 0 records"');
        expect(container.innerHTML).toContain('aria-label="Move 3, 0 records"');
        expect(container.innerHTML).toContain('No records for Move 2.');
        expect(container.innerHTML.indexOf('Newer Move 1 action')).toBeLessThan(
            container.innerHTML.indexOf('Older Move 1 action')
        );
        expect(container.innerHTML).toContain('Resubmitted');
        expect(container.innerHTML).toContain('Deliberation Underway');
        expect(container.innerHTML).toContain('Teams to Inform:</strong> Green, Industry');
        expect(container.innerHTML).toContain('Notification Note:</strong> Inform both teams after White Cell completes review.');
        expect(controller.blueActionMarkActiveKey).toBe('move-1');
    }, MODULE_LOAD_TEST_TIMEOUT_MS);

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
        controller.renderParticipants = vi.fn();
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
        fakeDocument.elements.participantsSessionFilter.value = 'id:session-alpha';
        fakeDocument.elements.participantsSessionFilter.listeners.change({
            currentTarget: fakeDocument.elements.participantsSessionFilter
        });
        fakeDocument.elements.participantsTeamFilter.value = 'blue';
        fakeDocument.elements.participantsTeamFilter.listeners.change({
            currentTarget: fakeDocument.elements.participantsTeamFilter
        });
        fakeDocument.elements.participantsRoleFilter.value = 'scribe';
        fakeDocument.elements.participantsRoleFilter.listeners.change({
            currentTarget: fakeDocument.elements.participantsRoleFilter
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
        expect(controller.participantFilters).toMatchObject({
            session: 'id:session-alpha',
            team: 'blue',
            role: 'scribe'
        });
        expect(controller.renderParticipants).toHaveBeenCalledTimes(3);
        expect(controller.timelineFilters).toMatchObject({
            team: 'blue',
            role: 'facilitator',
            move: '2',
            activityType: 'ACTION_CREATED'
        });
        expect(controller.renderTimeline).toHaveBeenCalledTimes(4);
    }, MODULE_LOAD_TEST_TIMEOUT_MS);

    it('updates White Cell timer controls to expose pause and resume states clearly', async () => {
        const { WHITE_CELL_DOM_IDS, WhiteCellController } = await loadWhiteCellModule();
        const { actionsStore } = await import('../stores/actions.js');
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([
            {
                team: 'blue',
                status: 'submitted',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: 'selection',
                    team: 'blue',
                    orientation: 'pressure'
                })
            },
            {
                team: 'green',
                status: 'submitted',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: 'forecast',
                    team: 'green',
                    orientation: 'pressure'
                })
            },
            {
                team: 'red',
                status: 'submitted',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: 'forecast',
                    team: 'red',
                    orientation: 'reframe'
                })
            },
            buildStrategicOrientationAction('industry', { orientation: 'stabilization' })
        ]);
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

    it('renders registered plugin controls disabled by default', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const fakeDocument = createFakeDocument(['pluginSettingsList', 'whiteCellPluginMounts']);
        global.document = fakeDocument;

        const controller = new WhiteCellController();
        controller.renderPluginSettings();

        expect(fakeDocument.elements.pluginSettingsList.innerHTML).toContain('Intercom');
        expect(fakeDocument.elements.pluginSettingsList.innerHTML).toContain('Session Recorder');
        expect(fakeDocument.elements.pluginSettingsList.innerHTML).toContain('data-plugin-id="intercom"');
        expect(fakeDocument.elements.pluginSettingsList.innerHTML).toContain('data-plugin-id="session-recorder"');
        expect(fakeDocument.elements.pluginSettingsList.innerHTML).toContain('Disabled');
        expect(fakeDocument.elements.pluginSettingsList.innerHTML).not.toContain('checked');
    });

    it('persists plugin toggles through game state and updates the panel immediately', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { gameStateStore } = await import('../stores/gameState.js');
        const fakeDocument = createFakeDocument(['pluginSettingsList', 'whiteCellPluginMounts']);
        global.document = fakeDocument;

        const setPluginEnabled = vi.spyOn(gameStateStore, 'setPluginEnabled').mockResolvedValue({
            plugin_state: {
                intercom: { enabled: true },
                'session-recorder': { enabled: false }
            }
        });

        const controller = new WhiteCellController();
        await controller.handlePluginToggle({
            checked: true,
            dataset: {
                pluginId: 'intercom'
            }
        });

        expect(setPluginEnabled).toHaveBeenCalledWith('intercom', true);
        expect(controller.pluginState.intercom.enabled).toBe(true);
        expect(controller.pluginState['session-recorder'].enabled).toBe(false);
        expect(fakeDocument.elements.pluginSettingsList.innerHTML).toContain('Enabled');
        expect(fakeDocument.elements.pluginSettingsList.innerHTML).toContain('checked');
        expect(showToast).toHaveBeenCalledWith({ message: 'Intercom enabled.', type: 'success' });
    });

    it('prompts before disabling Session Recorder when shared state reports active recording', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { gameStateStore } = await import('../stores/gameState.js');
        const fakeDocument = createFakeDocument(['pluginSettingsList', 'whiteCellPluginMounts']);
        global.document = fakeDocument;
        const setPluginEnabled = vi.spyOn(gameStateStore, 'setPluginEnabled').mockResolvedValue(null);
        confirmModal.mockResolvedValue(false);

        const controller = new WhiteCellController();
        controller.pluginState = {
            intercom: { enabled: false },
            'session-recorder': {
                enabled: true,
                recording_status: 'recording',
                recording_id: 'recording-1',
                recording_started_at_utc: '2026-06-03T10:04:00.000Z'
            }
        };
        const toggle = {
            checked: false,
            dataset: {
                pluginId: 'session-recorder'
            }
        };

        await controller.handlePluginToggle(toggle);

        expect(confirmModal).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Stop active recording?',
            confirmLabel: 'Stop And Disable',
            cancelLabel: 'Keep Recording'
        }));
        expect(toggle.checked).toBe(true);
        expect(setPluginEnabled).not.toHaveBeenCalled();
    });

    it('mounts only enabled plugins from registered game-state visibility', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const fakeDocument = createFakeDocument(['pluginSettingsList', 'whiteCellPluginMounts']);
        global.document = fakeDocument;

        const controller = new WhiteCellController();
        controller.syncGameStateFromStore({
            move: 1,
            phase: 1,
            timer_seconds: 5400,
            timer_running: false,
            plugin_state: {
                intercom: { enabled: true },
                'session-recorder': { enabled: false }
            }
        });

        expect(controller.mountedPlugins.has('intercom')).toBe(true);
        expect(controller.mountedPlugins.has('session-recorder')).toBe(false);

        controller.syncGameStateFromStore({
            move: 1,
            phase: 1,
            timer_seconds: 5400,
            timer_running: false,
            plugin_state: {
                intercom: { enabled: false },
                'session-recorder': { enabled: false }
            }
        });

        expect(controller.mountedPlugins.has('intercom')).toBe(false);
        expect(controller.mountedPlugins.has('session-recorder')).toBe(false);
    });

    it('saves White Cell timer allocations as seconds for each game-state mark', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { gameStateStore } = await import('../stores/gameState.js');
        const fakeDocument = createFakeDocument([
            'timerAllocationStrategicOrientation',
            'timerAllocationMove1',
            'timerAllocationMove2',
            'timerAllocationMove3',
            'timerAllocationCurrentMark',
            'timerAllocationSaveBtn',
            'timerAllocationResetCurrentBtn',
            'resetTimerBtn'
        ]);
        global.document = fakeDocument;

        fakeDocument.elements.timerAllocationStrategicOrientation.dataset.timerAllocationMark = 'strategic_orientation';
        fakeDocument.elements.timerAllocationStrategicOrientation.value = '30';
        fakeDocument.elements.timerAllocationMove1.dataset.timerAllocationMark = 'move_1';
        fakeDocument.elements.timerAllocationMove1.value = '45';
        fakeDocument.elements.timerAllocationMove2.dataset.timerAllocationMark = 'move_2';
        fakeDocument.elements.timerAllocationMove2.value = '60';
        fakeDocument.elements.timerAllocationMove3.dataset.timerAllocationMark = 'move_3';
        fakeDocument.elements.timerAllocationMove3.value = '75';

        const setTimerAllocations = vi.spyOn(gameStateStore, 'setTimerAllocations').mockResolvedValue({
            timer_allocations: {
                strategic_orientation: 1800,
                move_1: 2700,
                move_2: 3600,
                move_3: 4500
            }
        });

        const controller = new WhiteCellController();
        await controller.handleTimerAllocationSubmit({ preventDefault: vi.fn() });

        expect(setTimerAllocations).toHaveBeenCalledWith({
            strategic_orientation: 1800,
            move_1: 2700,
            move_2: 3600,
            move_3: 4500
        });
        expect(fakeDocument.elements.timerAllocationCurrentMark.textContent).toBe(
            'Current reset target: Strategic Orientation - 30 minutes'
        );
        expect(showToast).toHaveBeenCalledWith({ message: 'Timer allocations saved', type: 'success' });
    });

    it('preserves unsaved timer allocation input across background game-state reconciliation', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const fakeDocument = createFakeDocument([
            'timerAllocationStrategicOrientation',
            'timerAllocationMove1',
            'timerAllocationMove2',
            'timerAllocationMove3',
            'timerAllocationCurrentMark',
            'timerAllocationSaveBtn',
            'timerAllocationResetCurrentBtn',
            'resetTimerBtn'
        ]);
        global.document = fakeDocument;

        for (const [elementId, markKey, value] of [
            ['timerAllocationStrategicOrientation', 'strategic_orientation', '7'],
            ['timerAllocationMove1', 'move_1', '8'],
            ['timerAllocationMove2', 'move_2', '9'],
            ['timerAllocationMove3', 'move_3', '10']
        ]) {
            fakeDocument.elements[elementId].dataset.timerAllocationMark = markKey;
            fakeDocument.elements[elementId].value = value;
        }

        const controller = new WhiteCellController();
        controller.timerAllocationFormDirty = true;
        controller.syncGameStateFromStore({
            move: 1,
            phase: 1,
            timer_seconds: 5400,
            timer_running: false,
            timer_allocations: {
                strategic_orientation: 5400,
                move_1: 5400,
                move_2: 5400,
                move_3: 5400
            }
        });

        expect(fakeDocument.elements.timerAllocationStrategicOrientation.value).toBe('7');
        expect(fakeDocument.elements.timerAllocationMove1.value).toBe('8');
        expect(fakeDocument.elements.timerAllocationMove2.value).toBe('9');
        expect(fakeDocument.elements.timerAllocationMove3.value).toBe('10');
        expect(controller.timerAllocationFormDirty).toBe(true);
    });

    it('resets the timer to the active Strategic Orientation allocation before the Move 1 gate clears', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { actionsStore } = await import('../stores/actions.js');
        const { gameStateStore } = await import('../stores/gameState.js');

        vi.spyOn(actionsStore, 'getAll').mockReturnValue([
            {
                team: 'blue',
                status: 'submitted',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: 'selection',
                    team: 'blue',
                    orientation: 'pressure'
                })
            }
        ]);
        vi.spyOn(gameStateStore, 'getState').mockReturnValue({
            move: 1,
            phase: 1,
            timer_seconds: 5400,
            timer_running: false,
            timer_allocations: {
                strategic_orientation: 1800,
                move_1: 2700,
                move_2: 3600,
                move_3: 4500
            }
        });
        const resetTimer = vi.spyOn(gameStateStore, 'resetTimer').mockResolvedValue({});
        confirmModal.mockResolvedValue(true);

        const controller = new WhiteCellController();
        controller.timerAllocations = {
            strategic_orientation: 1800,
            move_1: 2700,
            move_2: 3600,
            move_3: 4500
        };

        await controller.resetTimerToCurrentAllocation();

        expect(confirmModal).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Reset Timer',
            message: 'Reset the timer to 30 minutes for Strategic Orientation?'
        }));
        expect(resetTimer).toHaveBeenCalledWith(1800);
        expect(showToast).toHaveBeenCalledWith({ message: 'Strategic Orientation timer reset', type: 'success' });
    });

    it('allows the Strategic Orientation timer to start while move controls remain gated', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { actionsStore } = await import('../stores/actions.js');
        const { gameStateStore } = await import('../stores/gameState.js');

        vi.spyOn(actionsStore, 'getAll').mockReturnValue([
            {
                team: 'blue',
                status: 'submitted',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: 'selection',
                    team: 'blue',
                    orientation: 'pressure'
                })
            }
        ]);
        vi.spyOn(gameStateStore, 'getState').mockReturnValue({
            move: 1,
            phase: 1,
            timer_seconds: 1800,
            timer_running: false
        });
        const startTimer = vi.spyOn(gameStateStore, 'startTimer').mockResolvedValue({});

        const controller = new WhiteCellController();
        controller.timerRunning = false;

        expect(controller.shouldGateStrategicOrientation()).toBe(true);

        await controller.startTimer();

        expect(startTimer).toHaveBeenCalledTimes(1);
        expect(showToast).toHaveBeenCalledWith({ message: 'Timer started', type: 'success' });
    });

    it('gates Move 1 controls until all Strategic Orientation artifacts reach White Cell', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { actionsStore } = await import('../stores/actions.js');
        const controller = new WhiteCellController();
        controller.getCurrentGameState = () => ({ move: 1, phase: 1 });
        const baseActions = [
            {
                team: 'blue',
                status: 'submitted',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: 'selection',
                    team: 'blue',
                    orientation: 'pressure'
                })
            },
            {
                team: 'green',
                status: 'submitted',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: 'forecast',
                    team: 'green',
                    orientation: 'pressure'
                })
            }
        ];
        const getAllSpy = vi.spyOn(actionsStore, 'getAll').mockReturnValue(baseActions);

        expect(controller.shouldGateStrategicOrientation()).toBe(true);
        expect(controller.getStrategicOrientationGateMessage()).toContain('Red forecast');
        expect(controller.getStrategicOrientationGateMessage()).toContain('Industry forecast');

        getAllSpy.mockReturnValue([
            ...baseActions,
            {
                team: 'red',
                status: 'submitted',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: 'forecast',
                    team: 'red',
                    orientation: 'reframe'
                })
            },
            buildStrategicOrientationAction('industry', { orientation: 'stabilization' })
        ]);

        expect(controller.shouldGateStrategicOrientation()).toBe(false);
    });

    it('shows Strategic Orientation as the active Move Control mark while the gate is incomplete', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { actionsStore } = await import('../stores/actions.js');
        const fakeDocument = createFakeDocument([
            'currentMove',
            'currentPhase',
            'moveLabel',
            'phaseLabel',
            'moveProgressStrategicOrientation',
            'moveProgressMove1',
            'moveProgressMove2',
            'moveProgressMove3',
            'prevMoveBtn',
            'nextMoveBtn',
            'prevPhaseBtn',
            'nextPhaseBtn'
        ]);
        global.document = fakeDocument;

        vi.spyOn(actionsStore, 'getAll').mockReturnValue([
            buildStrategicOrientationAction('blue')
        ]);

        const controller = new WhiteCellController();

        controller.updateGameStateDisplay({ move: 1, phase: 1 });

        expect(fakeDocument.elements.currentMove.textContent).toBe('SO');
        expect(fakeDocument.elements.currentMove.attributes['aria-label']).toBe('Strategic Orientation');
        expect(fakeDocument.elements.moveLabel.textContent).toBe('Strategic Orientation (Pre-Move 1)');
        expect(fakeDocument.elements.moveProgressStrategicOrientation.dataset.state).toBe('active');
        expect(fakeDocument.elements.moveProgressMove1.dataset.state).toBe('pending');
        expect(fakeDocument.elements.nextMoveBtn.disabled).toBe(true);
        expect(fakeDocument.elements.nextMoveBtn.textContent).toBe('Awaiting Orientation');
        expect(fakeDocument.elements.nextMoveBtn.title).toBe('Strategic Orientation is still open.');
    });

    it('returns Move 1 to the active Move Control mark after Strategic Orientation completes', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { actionsStore } = await import('../stores/actions.js');
        const fakeDocument = createFakeDocument([
            'currentMove',
            'currentPhase',
            'moveLabel',
            'phaseLabel',
            'moveProgressStrategicOrientation',
            'moveProgressMove1',
            'moveProgressMove2',
            'moveProgressMove3',
            'prevMoveBtn',
            'nextMoveBtn',
            'prevPhaseBtn',
            'nextPhaseBtn'
        ]);
        global.document = fakeDocument;

        vi.spyOn(actionsStore, 'getAll').mockReturnValue([
            buildStrategicOrientationAction('blue'),
            buildStrategicOrientationAction('green'),
            buildStrategicOrientationAction('red', { orientation: 'reframe' }),
            buildStrategicOrientationAction('industry', { orientation: 'stabilization' })
        ]);

        const controller = new WhiteCellController();

        controller.updateGameStateDisplay({ move: 1, phase: 1 });

        expect(fakeDocument.elements.currentMove.textContent).toBe('1');
        expect(fakeDocument.elements.moveLabel.textContent).toBe('Epoch 1 (2027-2030)');
        expect(fakeDocument.elements.moveProgressStrategicOrientation.dataset.state).toBe('complete');
        expect(fakeDocument.elements.moveProgressMove1.dataset.state).toBe('active');
        expect(fakeDocument.elements.nextMoveBtn.disabled).toBe(false);
        expect(fakeDocument.elements.nextMoveBtn.textContent).toBe('Advance to Move 2');
    });

    it('does not allow Blue Strategic Orientation selections to be shared to Red as normal actions', async () => {
        const { canShareActionToRedTeam } = await loadWhiteCellModule();

        expect(canShareActionToRedTeam({
            team: 'blue',
            mechanism: 'Strategic Orientation',
            ally_contingencies: serializeStrategicOrientationDetails({
                artifactType: 'selection',
                team: 'blue',
                orientation: 'pressure'
            })
        })).toBe(false);

        expect(canShareActionToRedTeam({
            team: 'blue',
            mechanism: 'Economic',
            ally_contingencies: ''
        })).toBe(true);
    });

    it('opens SME action handoffs for every completed team action except Strategic Orientation', async () => {
        const { canOpenSmeActionHandoffs } = await loadWhiteCellModule();

        expect(canOpenSmeActionHandoffs({
            team: 'green',
            mechanism: 'Proposal',
            artifact_type: 'proposal'
        })).toBe(true);
        expect(canOpenSmeActionHandoffs({
            team: 'red',
            mechanism: 'Economic'
        })).toBe(true);
        expect(canOpenSmeActionHandoffs({
            team: 'blue',
            mechanism: 'Strategic Orientation',
            ally_contingencies: serializeStrategicOrientationDetails({
                artifactType: 'selection',
                team: 'blue',
                orientation: 'pressure'
            })
        })).toBe(false);
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

    it('mounts a White Cell guide that covers every operator surface', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const controller = new WhiteCellController();

        mockMountFollowAlong.mockClear();
        controller.mountFollowAlongOnboarding();

        expect(mockMountFollowAlong).toHaveBeenCalledTimes(1);
        expect(mockMountFollowAlong).toHaveBeenCalledWith(expect.objectContaining({
            storageKey: 'followalong:whitecell:lead',
            title: 'White Cell Lead guide'
        }));

        const guide = mockMountFollowAlong.mock.calls[0][0];
        expect(guide.steps.map((step) => step.title)).toEqual([
            'Your role in the exercise',
            'Watch the live tracker',
            'Simulation Settings',
            'Manage session operations',
            'Strategic Orientation',
            'Blue Actions',
            'Green and Industry Proposals',
            'Red Actions',
            'Review History',
            'Macro PLI',
            'Diplomacy & Information PLI',
            'NI & Escalation PLI',
            'PLI Reports',
            'PLI SME Efficacy',
            'Tribe Street Journal',
            'Population Sentiments',
            'RFIs',
            'Communications',
            'Session Timeline',
            'Control arrival noise',
            'Complete the operator loop'
        ]);
        expect(flattenHighlights(guide.steps)).toEqual([
            '#header-game-state',
            '#header-timer',
            '.sidebar-link[data-section="controls"]',
            '#settingsTabs .tab-list',
            '.sidebar-link[data-section="strategicOrientation"]',
            '.sidebar-link[data-section="actions"]',
            '.sidebar-link[data-section="proposals"]',
            '.sidebar-link[data-section="responses"]',
            '.sidebar-link[data-section="reviewHistory"]',
            '.sidebar-link[data-section="pliAdjudication"]',
            '.sidebar-link[data-section="pliDiplomacyInfo"]',
            '.sidebar-link[data-section="pliNiEscalation"]',
            '.sidebar-link[data-section="pliReports"]',
            '.sidebar-link[data-section="pliSmeEfficacy"]',
            '.sidebar-link[data-section="tribeStreetJournal"]',
            '.sidebar-link[data-section="verbaAi"]',
            '.sidebar-link[data-section="requests"]',
            '.sidebar-link[data-section="communications"]',
            '.sidebar-link[data-section="timeline"]',
            '#whiteCellNotificationsMuteBtn',
            '.sidebar-session'
        ]);
        expect(guide.steps[1].body).toContain('Strategic Orientation before Move 1');
        expect(guide.steps[3].body).toContain('live sessions');
        expect(guide.steps[3].body).toContain('participant rosters');
        expect(guide.steps[3].body).toContain('facilitator deck assignments');
        expect(guide.steps[3].body).toContain('export controls');
    });

    it('isolates White Cell Support walkthrough progress from the Lead guide', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const controller = new WhiteCellController();
        controller.operatorRole = 'support';

        mockMountFollowAlong.mockClear();
        controller.mountFollowAlongOnboarding();

        expect(mockMountFollowAlong).toHaveBeenCalledWith(expect.objectContaining({
            storageKey: 'followalong:whitecell:support',
            title: 'White Cell Support guide',
            roleLabel: 'White Cell Support'
        }));
    });

    it('waits for seat validation before White Cell grant checks or sync', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const bootstrap = await import('../services/seatBootstrap.js');
        const { database } = await import('../services/database.js');
        const { syncService } = await import('../services/sync.js');
        let finishValidation;
        vi.spyOn(bootstrap, 'ensureSeatStartup').mockReturnValue(new Promise((resolve) => { finishValidation = resolve; }));
        const grant = vi.spyOn(database, 'requireOperatorGrant');
        const sync = vi.spyOn(syncService, 'initialize');
        const controller = new WhiteCellController();
        const render = vi.spyOn(controller, 'renderScribeDeckSettings');
        const startup = controller.init();
        expect(grant).not.toHaveBeenCalled();
        expect(sync).not.toHaveBeenCalled();
        finishValidation(false);
        await startup;
        expect(grant).not.toHaveBeenCalled();
        expect(sync).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
    });

    it('renders default facilitator deck controls before live communication sync finishes', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const bootstrap = await import('../services/seatBootstrap.js');
        const startup = vi.spyOn(bootstrap, 'ensureSeatStartup').mockResolvedValue(true);
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        const { syncService } = await import('../services/sync.js');
        const fakeDocument = createFakeDocument([
            'scribeDeckSettingsSummary',
            'scribeDeckSettingsList'
        ]);

        global.document = fakeDocument;

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-42');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        vi.spyOn(sessionStore, 'hasOperatorAccess').mockReturnValue(true);
        vi.spyOn(sessionStore, 'getSessionParticipantId').mockReturnValue(null);
        vi.spyOn(sessionStore, 'setOperatorAuth').mockImplementation(() => {});
        vi.spyOn(database, 'requireOperatorGrant').mockResolvedValue({
            sessionId: 'session-42',
            role: 'whitecell_lead'
        });
        vi.spyOn(database, 'fetchArtifactWorkflowReviews').mockResolvedValue([]);
        vi.spyOn(syncService, 'initialize').mockImplementation(async () => {
            expect(fakeDocument.elements.scribeDeckSettingsSummary.textContent).toContain(
                "Set the slide deck each team's facilitator presents."
            );
            expect(fakeDocument.elements.scribeDeckSettingsSummary.textContent).toContain('Confirm the assignment scope');
            expect(fakeDocument.elements.scribeDeckSettingsList.innerHTML).toContain('Blue Team Facilitator');
            expect(fakeDocument.elements.scribeDeckSettingsList.innerHTML).toContain('data-scribe-deck-action="load"');
        });

        const controller = new WhiteCellController();
        controller.configureTeamLabels = vi.fn();
        controller.loadResearchExportRuntime = vi.fn();
        controller.bindEventListeners = vi.fn();
        controller.subscribeToLiveData = vi.fn();
        controller.syncGameStateFromStore = vi.fn();
        controller.syncActionsFromStore = vi.fn();
        controller.syncRfisFromStore = vi.fn();
        controller.syncCommunicationsFromStore = vi.fn();
        controller.syncTimelineFromStore = vi.fn();
        controller.syncParticipantsFromStore = vi.fn();
        controller.updateTimerDisplay = vi.fn();
        controller.updateTimerStatusDisplay = vi.fn();
        controller.loadSessionsAdmin = vi.fn(() => Promise.resolve());
        controller.mountFollowAlongOnboarding = vi.fn();

        await controller.init();

        expect(startup.mock.invocationCallOrder[0]).toBeLessThan(database.requireOperatorGrant.mock.invocationCallOrder[0]);
        expect(syncService.initialize).toHaveBeenCalledWith('session-42', {
            participantId: null
        });
    });

    it('toggles and persists the White Cell notification mute preference', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const fakeDocument = createFakeDocument(['whiteCellNotificationsMuteBtn']);
        const localStorage = {
            getItem: vi.fn(() => 'true'),
            setItem: vi.fn()
        };

        global.document = fakeDocument;
        global.window = { localStorage };

        const controller = new WhiteCellController();
        controller.renderNotificationsMuteControl();

        expect(controller.notificationsMuted).toBe(true);
        expect(fakeDocument.elements.whiteCellNotificationsMuteBtn.textContent).toBe('Notifications muted');

        controller.toggleNotificationsMuted();

        expect(controller.notificationsMuted).toBe(false);
        expect(localStorage.setItem).toHaveBeenCalledWith('whitecell:notifications-muted', 'false');
        expect(fakeDocument.elements.whiteCellNotificationsMuteBtn.textContent).toBe('Mute notifications');
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

    it('labels the White Cell participant roster with the active session', async () => {
        const {
            getWhiteCellArchiveSessionConfirmationOptions,
            getWhiteCellParticipantSessionLabel,
            getWhiteCellSessionLabel
        } = await loadWhiteCellModule();

        const session = {
            name: 'Alpha Session',
            code: 'ALPHA'
        };

        expect(getWhiteCellSessionLabel(session)).toBe('Alpha Session (ALPHA)');
        expect(getWhiteCellParticipantSessionLabel({}, session)).toBe('Alpha Session (ALPHA)');
        expect(getWhiteCellParticipantSessionLabel({
            sessionName: 'Bravo Session',
            sessionCode: 'BRAVO'
        }, session)).toBe('Bravo Session (BRAVO)');
        expect(getWhiteCellArchiveSessionConfirmationOptions(session)).toMatchObject({
            title: 'Archive session',
            confirmLabel: 'Archive',
            cancelLabel: 'Keep Active',
            variant: 'warning'
        });
        expect(getWhiteCellArchiveSessionConfirmationOptions(session).message).toContain(
            'immutable audit records will be retained'
        );
    });

    it('renders active session context in the White Cell participant roster', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { sessionStore } = await import('../stores/session.js');
        const fakeDocument = createFakeDocument(['participantsSummary', 'participantsList']);

        global.document = fakeDocument;
        vi.spyOn(sessionStore, 'getSessionData').mockReturnValue({
            name: 'Alpha Session',
            code: 'ALPHA'
        });

        const controller = new WhiteCellController();
        controller.participants = [{
            id: 'blue-facilitator',
            role: 'blue_facilitator',
            display_name: 'Alex',
            is_active: true,
            heartbeat_at: '2026-04-08T10:05:00.000Z'
        }];

        controller.renderParticipants();

        expect(fakeDocument.elements.participantsSummary.textContent).toContain(
            'Active session: Alpha Session (ALPHA).'
        );
        expect(fakeDocument.elements.participantsList.innerHTML).toContain(
            'Session: Alpha Session (ALPHA)'
        );
        expect(fakeDocument.elements.participantsList.innerHTML).toContain(
            'data-participant-select-seat-id="blue-facilitator"'
        );
        expect(fakeDocument.elements.participantsList.innerHTML).toContain(
            'data-participant-action="remove-selected"'
        );
        expect(fakeDocument.elements.participantsList.innerHTML).toContain(
            'aria-label="Select Alex for removal"'
        );
    });

    it('removes multiple White Cell roster seats and updates the shared store immediately', async () => {
        confirmModal.mockResolvedValue(true);

        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        const { participantsStore } = await import('../stores/participants.js');
        const removeSessionParticipant = vi.spyOn(database, 'removeSessionParticipant').mockResolvedValue({});
        const updateFromServer = vi.spyOn(participantsStore, 'updateFromServer').mockImplementation(() => {});
        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-alpha');

        const controller = new WhiteCellController();
        controller.participants = [
            { id: 'seat-blue', display_name: 'Alex', role: 'blue_facilitator' },
            { id: 'seat-red', display_name: 'Priya', role: 'red_scribe' }
        ];
        controller.selectedParticipantSeatIds.add('seat-blue');
        controller.selectedParticipantSeatIds.add('seat-red');

        await controller.handleRemoveParticipantSeats(['seat-blue', 'seat-red']);

        expect(confirmModal).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Remove seats',
            confirmLabel: 'Remove 2 seats'
        }));
        expect(removeSessionParticipant.mock.calls).toEqual([
            ['session-alpha', 'seat-blue'],
            ['session-alpha', 'seat-red']
        ]);
        expect(updateFromServer.mock.calls).toEqual([
            ['DELETE', { id: 'seat-blue', session_id: 'session-alpha' }],
            ['DELETE', { id: 'seat-red', session_id: 'session-alpha' }]
        ]);
        expect(controller.selectedParticipantSeatIds.size).toBe(0);
        expect(showToast).toHaveBeenCalledWith({ message: '2 seats removed', type: 'success' });
    });

    it('builds cross-team White Cell communication recipients', async () => {
        const { buildWhiteCellCommunicationRecipientOptions } = await loadWhiteCellModule();
        const sharedOptions = buildWhiteCellCommunicationRecipientOptions({ sessionTopologyVersion: 2, greenSeatModel: 'shared_facilitator_v1' });
        expect(sharedOptions.map((option) => option.value)).toEqual(expect.arrayContaining([
            'green', 'green_europe', 'green_asian_pacific', 'green_europe_scribe', 'green_asian_pacific_scribe', 'green_shared_facilitator'
        ]));
        expect(sharedOptions.map((option) => option.value)).not.toContain('green_europe_facilitator');
        expect(sharedOptions.map((option) => option.value)).not.toContain('green_scribe');
        const pairedOptions = buildWhiteCellCommunicationRecipientOptions({ sessionTopologyVersion: 2 });
        expect(pairedOptions.map((option) => option.value)).toContain('green_europe_facilitator');
        expect(pairedOptions.map((option) => option.value)).not.toContain('green_shared_facilitator');

        expect(buildWhiteCellCommunicationRecipientOptions()).toEqual(expect.arrayContaining([
            { value: 'all', label: 'All Teams' },
            { value: 'blue', label: 'Blue Team' },
            { value: 'red', label: 'Red Team' },
            { value: 'green', label: 'Green Team' },
            { value: 'industry', label: 'Industry Team' },
            { value: 'blue_facilitator', label: 'Blue Team Scribe' },
            { value: 'blue_scribe', label: 'Blue Team Facilitator' },
            { value: 'red_notetaker', label: 'Red Team Notetaker' },
            { value: 'green_facilitator', label: 'Green Team Scribe' },
            { value: 'industry_facilitator', label: 'Industry Team Scribe' },
            { value: 'industry_scribe', label: 'Industry Team Facilitator' },
            { value: 'industry_notetaker', label: 'Industry Team Notetaker' }
        ]));
    });

    it('loads a validated deck into the requested team facilitator seat through shared communications', async () => {
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

        expect(global.fetch).toHaveBeenCalledWith(
            buildAppPath('decks/blue/custom-scribe-deck.html'),
            expect.objectContaining({ credentials: 'same-origin' })
        );
        expect(createCommunication).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-42',
            from_role: 'white_cell',
            to_role: 'blue_scribe',
            type: 'GUIDANCE',
            content: 'White Cell loaded "Blue Crisis Deck" into Blue Team Facilitator (decks/blue/custom-scribe-deck.html).',
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
            content: 'White Cell loaded Blue Crisis Deck into Blue Team Facilitator',
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
        expect(showToast).toHaveBeenCalledWith({ message: 'Blue Team facilitator deck updated.', type: 'success' });
    });

    it('fails closed and hides the loader when facilitator deck validation stalls', async () => {
        vi.useFakeTimers();

        const {
            WhiteCellController,
            WHITE_CELL_SCRIBE_DECK_FETCH_TIMEOUT_MS
        } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');

        global.document = createFakeDocument([
            'scribeDeckPath-blue',
            'scribeDeckLabel-blue'
        ]);
        global.document.elements['scribeDeckPath-blue'].value = 'stalled-deck.html';
        global.document.elements['scribeDeckLabel-blue'].value = 'Stalled Deck';
        global.fetch = vi.fn(() => new Promise(() => {}));

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-42');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        const createCommunication = vi.spyOn(database, 'createCommunication');

        const controller = new WhiteCellController();
        const assignmentPromise = controller.handleScribeDeckAssignmentSubmit('blue');

        expect(showLoader).toHaveBeenCalledWith({
            message: 'Loading Blue Team facilitator deck...'
        });

        await vi.advanceTimersByTimeAsync(WHITE_CELL_SCRIBE_DECK_FETCH_TIMEOUT_MS);
        await assignmentPromise;

        expect(createCommunication).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith({
            message: 'Facilitator deck validation timed out. Check the deck path and try again.',
            type: 'error'
        });
        expect(hideLoader).toHaveBeenCalledTimes(1);
    });

    it('uploads a browser-cached deck into the requested team facilitator seat through shared communications', async () => {
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
            content: 'White Cell uploaded "Uploaded Crisis Deck" to Blue Team Facilitator (blue-upload.html).',
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
            content: 'White Cell uploaded Uploaded Crisis Deck to Blue Team Facilitator',
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
        expect(showToast).toHaveBeenCalledWith({ message: 'Blue Team facilitator slides uploaded.', type: 'success' });
    });

    it('keeps the latest facilitator deck assignment for each team in White Cell settings', async () => {
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

    it('builds participant session, team, and role filters from the live roster', async () => {
        const { buildWhiteCellParticipantFilterOptions } = await loadWhiteCellModule();

        const { sessionOptions, teamOptions, roleOptions } = buildWhiteCellParticipantFilterOptions([
            {
                id: 'blue-facilitator',
                role: 'blue_facilitator',
                session_id: 'session-alpha',
                sessionName: 'Alpha Session',
                sessionCode: 'ALPHA'
            },
            { id: 'blue-scribe', role: 'blue_scribe', session_id: 'session-alpha' },
            {
                id: 'green-notetaker',
                role: 'green_notetaker',
                session_id: 'session-bravo',
                sessionName: 'Bravo Session',
                sessionCode: 'BRAVO'
            },
            { id: 'whitecell-seat', role: 'whitecell_support', session_id: 'session-alpha' }
        ], {
            activeSession: {
                id: 'session-alpha',
                name: 'Alpha Session',
                code: 'ALPHA'
            }
        });

        expect(sessionOptions).toEqual([
            { value: '', label: 'All Sessions' },
            { value: 'id:session-alpha', label: 'Alpha Session (ALPHA)' },
            { value: 'id:session-bravo', label: 'Bravo Session (BRAVO)' }
        ]);
        expect(teamOptions).toEqual(expect.arrayContaining([
            { value: '', label: 'All Teams' },
            { value: 'blue', label: 'Blue Team' },
            { value: 'green', label: 'Green Team' }
        ]));
        expect(teamOptions.map((option) => option.value)).not.toContain('white_cell');
        expect(roleOptions).toEqual(expect.arrayContaining([
            { value: '', label: 'All Roles' },
            { value: 'facilitator', label: 'Scribes' },
            { value: 'scribe', label: 'Facilitators' },
            { value: 'notetaker', label: 'Notetakers' }
        ]));
        expect(roleOptions.map((option) => option.value)).not.toContain('whitecell');
    });

    it('filters White Cell participants by session, team, and role plus timeline event filters', async () => {
        const {
            buildWhiteCellParticipantRoster,
            buildWhiteCellTimelineFilterOptions,
            filterWhiteCellParticipants,
            filterWhiteCellTimelineEvents
        } = await loadWhiteCellModule();

        const roster = buildWhiteCellParticipantRoster([
            { id: 'blue-facilitator', role: 'blue_facilitator', session_id: 'session-alpha', is_active: true },
            { id: 'blue-scribe', role: 'blue_scribe', session_id: 'session-alpha', is_active: true },
            { id: 'green-notetaker', role: 'green_notetaker', session_id: 'session-bravo', is_active: true },
            { id: 'red-whitecell', role: 'whitecell_support', session_id: 'session-alpha', is_active: true }
        ]);

        expect(filterWhiteCellParticipants(roster, {
            session: 'id:session-bravo'
        }).map((participant) => participant.id)).toEqual(['green-notetaker']);

        expect(filterWhiteCellParticipants(roster, {
            session: 'id:session-bravo',
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
            { value: 'facilitator', label: 'Scribes' },
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
                id: 'orientation-blue-1',
                team: 'blue',
                move: 1,
                phase: 1,
                goal: 'Blue Team Strategic Orientation: Pressure',
                mechanism: 'Strategic Orientation',
                status: 'submitted',
                created_at: '2026-04-08T08:45:00.000Z',
                submitted_at: '2026-04-08T08:55:00.000Z',
                ally_contingencies: serializeStrategicOrientationDetails({
                    team: 'blue',
                    ownOrientation: 'pressure',
                    forecastTargets: [{ key: 'red', orientation: 'stabilization' }],
                    forecastActionDescription: 'Red will preserve market access.',
                    primaryLevers: ['Expanded financial sanctions'],
                    acceptedCosts: ['Sustained economic friction'],
                    posture: 'Calibrated - escalate deliberately',
                    scribeHandoff: 'Forwarded'
                })
            },
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

        expect(fakeDocument.elements.strategicOrientationBadge.textContent).toBe('1');
        expect(fakeDocument.elements.actionsBadge.textContent).toBe('1');
        expect(fakeDocument.elements.proposalsBadge.textContent).toBe('1');
        expect(fakeDocument.elements.responsesBadge.textContent).toBe('1');
        expect(fakeDocument.elements.strategicOrientationBadge.hidden).toBe(false);
        expect(fakeDocument.elements.actionsBadge.hidden).toBe(false);
        expect(fakeDocument.elements.proposalsBadge.hidden).toBe(false);
        expect(fakeDocument.elements.responsesBadge.hidden).toBe(false);
        expect(fakeDocument.elements.strategicOrientationList.innerHTML).toContain(
            'Blue Team Strategic Orientation: Pressure'
        );
        expect(fakeDocument.elements.actionsBadge.textContent).not.toBe('3');
    });

    it('renders Red and Industry multi-target Strategic Orientation forecasts with Blue and Green forecast rows', async () => {
        const { WHITE_CELL_DOM_IDS, WhiteCellController } = await loadWhiteCellModule();
        const { actionsStore } = await import('../stores/actions.js');
        const fakeDocument = createFakeDocument(WHITE_CELL_DOM_IDS);
        global.document = fakeDocument;

        const pendingItems = [{
            id: 'orientation-multi-red-1',
            team: 'red',
            move: 1,
            phase: 1,
            goal: 'Red Team Strategic Orientation: Reframe',
            mechanism: 'Strategic Orientation',
            status: 'submitted',
            created_at: '2026-04-08T08:50:00.000Z',
            submitted_at: '2026-04-08T08:55:00.000Z',
            ally_contingencies: serializeStrategicOrientationDetails({
                team: 'red',
                ownOrientation: 'reframe',
                forecastTargets: [
                    { key: 'blue', orientation: 'pressure' },
                    { key: 'green_asian_pacific', orientation: 'reframe' },
                    { key: 'green_europe', orientation: 'stabilization' }
                ],
                orientationRationale: 'Red reframes its own posture while forecasting the other teams.',
                scribeHandoff: 'Forwarded'
            })
        }];

        vi.spyOn(actionsStore, 'getPending').mockReturnValue(pendingItems);
        vi.spyOn(actionsStore, 'getAll').mockReturnValue(pendingItems);

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';

        controller.syncActionsFromStore();

        expect(fakeDocument.elements.strategicOrientationList.innerHTML).toContain('Red Team Strategic Orientation: Reframe');
        expect(fakeDocument.elements.strategicOrientationList.innerHTML).toContain('Blue Forecast');
        expect(fakeDocument.elements.strategicOrientationList.innerHTML).toContain('Green (Asian Pacific) Forecast');
        expect(fakeDocument.elements.strategicOrientationList.innerHTML).toContain('Green (Europe) Forecast');
        expect(fakeDocument.elements.strategicOrientationList.innerHTML).toContain('Red reframes its own posture while forecasting the other teams.');
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
        controller.durableNotifications = { seed: vi.fn(), notify: vi.fn(() => ({})) };
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

        expect(controller.durableNotifications.notify).toHaveBeenCalledWith(expect.objectContaining({
            id: 'artifact-submission:action-arrival-1:submitted_to_white_cell:r1',
            source: 'Blue Team',
            requiredAction: 'Open and review the submission.'
        }), expect.any(Object));
        expect(fakeDocument.elements.actionsList.innerHTML).toContain('NEW');
        expect(fakeDocument.elements.actionsList.innerHTML).toContain('Stabilize port access');
    });

    it('raises a dedicated arrival cue when Strategic Orientation reaches White Cell', async () => {
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
        controller.durableNotifications = { seed: vi.fn(), notify: vi.fn(() => ({})) };
        controller.syncActionsFromStore();

        pendingItems = [{
            id: 'orientation-arrival-1',
            team: 'red',
            move: 1,
            phase: 1,
            goal: 'Red Forecast: Blue Reframe',
            mechanism: 'Strategic Orientation',
            status: 'submitted',
            created_at: '2026-04-08T08:50:00.000Z',
            submitted_at: '2026-04-08T08:55:00.000Z',
            ally_contingencies: serializeStrategicOrientationDetails({
                artifactType: 'forecast',
                team: 'red',
                orientation: 'reframe',
                primaryLevers: ['Friend-shoring agreements'],
                acceptedCosts: ['Transitional inefficiencies'],
                posture: 'Gradual - long-horizon reallocation',
                scribeHandoff: 'Forwarded'
            })
        }];
        allItems = pendingItems;

        controller.syncActionsFromStore({ announce: true });
        controller.flushQueueArrivalAnnouncement();

        expect(controller.durableNotifications.notify).toHaveBeenCalledWith(expect.objectContaining({
            family: 'artifact-submission',
            artifact: expect.stringContaining('Strategic Orientation')
        }), expect.any(Object));
        expect(fakeDocument.elements.strategicOrientationBadge.textContent).toBe('1');
        expect(fakeDocument.elements.strategicOrientationList.innerHTML).toContain('NEW');
        expect(fakeDocument.elements.strategicOrientationList.innerHTML).toContain('Red Forecast: Blue Reframe');
        expect(fakeDocument.elements.responsesBadge.hidden).toBe(true);
    });

    it('mutes White Cell durable arrival notices without hiding visible queue cues', async () => {
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
        controller.setNotificationsMuted(true, { persist: false });
        controller.syncActionsFromStore();

        pendingItems = [{
            id: 'action-arrival-muted-1',
            team: 'blue',
            move: 2,
            phase: 1,
            goal: 'Keep the queue visible while muted',
            mechanism: 'Diplomatic pressure',
            status: 'submitted',
            created_at: '2026-04-08T09:00:00.000Z',
            submitted_at: '2026-04-08T09:05:00.000Z',
            expected_outcomes: 'Show the operator a visible non-toast cue.'
        }];
        allItems = pendingItems;

        controller.syncActionsFromStore({ announce: true });
        controller.flushQueueArrivalAnnouncement();

        expect(showToast).not.toHaveBeenCalled();
        expect(fakeDocument.elements.actionsBadge.textContent).toBe('1');
        expect(fakeDocument.elements.actionsBadge.hidden).toBe(false);
        expect(fakeDocument.elements.actionsList.innerHTML).toContain('NEW');
        expect(fakeDocument.elements.actionsList.innerHTML).toContain('Keep the queue visible while muted');
    });

    it('keeps other NEW records unread when one White Cell destination is opened', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const controller = new WhiteCellController();
        controller.newBlueActionIds = new Set(['action-opened', 'action-unread']);
        controller.renderActionReview = vi.fn();
        controller.durableNotifications = { markDestinationRead: vi.fn() };

        controller.clearQueueArrivalHighlights('actions', 'action-opened');

        expect(controller.newBlueActionIds).toEqual(new Set(['action-unread']));
        expect(controller.durableNotifications.markDestinationRead).toHaveBeenCalledWith({ recordId: 'action-opened' });
        expect(controller.renderActionReview).toHaveBeenCalledTimes(1);
    });

    it('keeps reviewed proposal-team submissions visible in the White Cell proposals queue', async () => {
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
                recipientTeams: ['blue', 'red']
            })
        };
        const industryProposal = {
            ...greenProposal,
            id: 'action-104-industry',
            team: 'industry',
            goal: 'Coordinate industrial surge alignment',
            adjudication_notes: 'Forwarded to Red Team for review.',
            ally_contingencies: serializeProposalDetails({
                originators: ['Industry'],
                objective: 'Align production capacity before the next move.',
                category: 'Alignment',
                intendedPartners: 'Red Team',
                delivery: 'Joint Statement',
                timingAndConditions: 'Immediately after White Cell review.',
                recipientTeam: 'red'
            })
        };

        vi.spyOn(actionsStore, 'getPending').mockReturnValue([]);
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([greenProposal, industryProposal]);

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';

        controller.syncActionsFromStore();

        expect(controller.proposalTeamProposals.map((proposal) => proposal.team)).toEqual(['green', 'industry']);
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Coordinate biotech export alignment');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Coordinate industrial surge alignment');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Completed');
        expect(fakeDocument.elements.proposalsList.innerHTML).not.toContain('Adjudicated');
        expect(fakeDocument.elements.proposalsList.innerHTML).not.toMatch(/Outcome:<\/strong>|SUCCESS|PARTIAL_SUCCESS|BACKFIRE/);
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Notes:</strong> Forwarded to Blue Team for review.');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Notes:</strong> Forwarded to Red Team for review.');
        expect(fakeDocument.elements.proposalsBadge.hidden).toBe(true);
    });

    it('categorises negotiation requests in the White Cell proposals queue', async () => {
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
                    facilitator_decision: 'negotiate',
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
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Blue Team requested negotiation.');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Recipient Status:</strong> Negotiation requested');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Negotiation terms');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Blue Team can support this with customs coordination.');
        expect(fakeDocument.elements.proposalsList.innerHTML).not.toContain('Response received from Blue Team.');
        expect(fakeDocument.elements.proposalsList.innerHTML).not.toContain('Blue Team Response');
    });

    it('categorises proposal negotiation communications in White Cell history', async () => {
        const { WHITE_CELL_DOM_IDS, WhiteCellController } = await loadWhiteCellModule();
        const fakeDocument = createFakeDocument(WHITE_CELL_DOM_IDS);
        global.document = fakeDocument;

        const controller = new WhiteCellController();
        controller.communications = [{
            id: 'proposal-negotiation-response-1',
            from_role: 'blue_scribe',
            to_role: 'white_cell',
            type: 'PROPOSAL_RESPONSE',
            content: 'Add a six-month review clause.',
            created_at: '2026-04-08T09:25:00.000Z',
            metadata: {
                facilitator_decision: 'negotiate'
            }
        }];

        controller.renderCommunicationHistory();

        expect(fakeDocument.elements.commHistory.innerHTML).toContain('NEGOTIATION REQUESTED');
        expect(fakeDocument.elements.commHistory.innerHTML).toContain('Negotiation terms');
        expect(fakeDocument.elements.commHistory.innerHTML).toContain('Add a six-month review clause.');
        expect(fakeDocument.elements.commHistory.innerHTML).not.toContain('PROPOSAL_RESPONSE');
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

    it('notifies White Cell exactly once for each newly reconciled proposal round', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const controller = new WhiteCellController();
        const roundOne = {
            id: 'thread-round-1',
            type: 'PROPOSAL_RESPONSE',
            metadata: {
                thread_id: 'thread-blue-1',
                recipient_team: 'blue',
                round_number: 1,
                parent_message_id: 'thread-root-blue',
                source_proposal_id: 'proposal-1',
                source_revision: 1,
                source_team: 'green',
                sender_team: 'blue',
                sender_role: 'blue_scribe',
                sent_at: '2026-08-06T12:01:00.000Z',
                message_type: 'negotiation_message'
            }
        };
        const roundTwo = {
            id: 'thread-round-2',
            type: 'PROPOSAL_RESPONSE',
            metadata: {
                ...roundOne.metadata,
                round_number: 2,
                parent_message_id: roundOne.id,
                sender_team: 'green',
                sender_role: 'green_scribe',
                sent_at: '2026-08-06T12:02:00.000Z'
            }
        };

        controller.communications = [roundOne];
        controller.renderProposals = vi.fn();
        controller.durableNotifications = { seed: vi.fn(), notify: vi.fn(() => ({})) };
        controller.captureProposalThreadRoundNotifications([], { announce: false });
        expect(controller.durableNotifications.notify).not.toHaveBeenCalled();

        controller.communications = [roundOne, roundTwo];
        controller.captureProposalThreadRoundNotifications([roundTwo], { announce: true });
        controller.captureProposalThreadRoundNotifications([roundTwo], { announce: true });

        expect(controller.durableNotifications.notify).toHaveBeenCalledTimes(1);
        expect(controller.durableNotifications.notify).toHaveBeenCalledWith(expect.objectContaining({
            id: 'proposal-round:thread-round-2:round-2',
            source: 'Green Team',
            requiredAction: expect.stringContaining('Open the thread')
        }), expect.any(Object));
    });

    it('renders facilitator action details without a Red Team send control in White Cell adjudication', async () => {
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
            showAdjudicateAction: true
        });
        const greenMarkup = controller.renderActionCard({
            ...blueAction,
            id: 'action-78',
            team: 'green'
        }, {
            showAdjudicateAction: true
        });

        expect(markup).toContain('Blue Team | Move 2 | Action 2 &middot; Phase 3');
        expect(markup).toContain('<span class="badge-text">Blue Team</span>');
        expect(markup).toContain('Targets:</strong> Port Authority');
        expect(markup).toContain('Sector:</strong> Logistics');
        expect(markup).toContain('Exposure:</strong> Overt');
        expect(markup).toContain('Ally Contingencies:</strong> Coordinate with customs union partners.');
        expect(markup).toContain('Submitted:</strong>');
        expect(markup).not.toContain('Send to Red Team');
        expect(greenMarkup).not.toContain('Send to Red Team');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Blue Team action shared by White Cell');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Title: Stabilize port access');
    });

    it('keeps the submitting team visible on Strategic Orientation cards', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        global.document = createFakeDocument();
        const controller = new WhiteCellController();

        const markup = controller.renderActionCard(buildStrategicOrientationAction('green'));

        expect(markup).toContain('<span class="badge-text">Green Team</span>');
        expect(markup).toContain('badge-source-team--green');
        expect(markup).toContain('Strategic Orientation');
    });

    it.each([
        ['shared_facilitator_v1', 'shared', ['green_shared_facilitator']],
        [null, 'europe', ['green_europe_facilitator']],
        [null, 'asian_pacific', ['green_asian_pacific_facilitator']],
        [null, 'both', ['green_asian_pacific_facilitator', 'green_europe_facilitator']],
        [null, '', []],
        ['shared_facilitator_v1', 'europe', []]
    ])('GC09 sends %s deck scope %s only to its explicit recipients', async (model, scope, roles) => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { timelineStore } = await import('../stores/timeline.js');
        global.document = createFakeDocument(['scribeDeckPath-green', 'scribeDeckLabel-green', 'scribeDeckScope-green']);
        global.document.elements['scribeDeckPath-green'].value = 'fractured-order-facilitator-deck.html';
        global.document.elements['scribeDeckScope-green'].value = scope;
        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-42');
        vi.spyOn(sessionStore, 'getSessionData').mockReturnValue({ sessionTopologyVersion: 2, greenSeatModel: model });
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        const create = vi.spyOn(database, 'createCommunication').mockResolvedValue({ id: 'deck-notice' });
        vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({ id: 'timeline-deck' });
        vi.spyOn(communicationsStore, 'updateFromServer').mockImplementation(() => {});
        vi.spyOn(timelineStore, 'updateFromServer').mockImplementation(() => {});
        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        controller.validateScribeDeckPath = vi.fn().mockResolvedValue();
        controller.getCurrentGameState = () => ({ move: 1, phase: 1 });
        await controller.handleScribeDeckAssignmentSubmit('green');
        expect(create.mock.calls.map(([record]) => record.to_role)).toEqual(roles);
        for (const [record] of create.mock.calls) {
            expect(record.metadata.recipient_scope).toBe('role');
            expect(record.metadata.recipient_role).toBe(record.to_role);
        }
    });

    it('GC05 identifies the persisted regional owner in the review title', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        global.document = createFakeDocument();
        const controller = new WhiteCellController();
        for (const [delegation_id, label] of [['asian_pacific', 'Green - Asia-Pacific'], ['europe', 'Green - Europe']]) {
            const action = { ...buildStrategicOrientationAction('green'), delegation_id };
            expect(controller.getStrategicOrientationReviewTitle(action)).toContain(label);
        }
        expect(controller.getStrategicOrientationReviewTitle(buildStrategicOrientationAction('green'))).not.toContain('Europe');
    });

    it('GC09 keeps the selected regional deck audience on refresh only within the same session', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { sessionStore } = await import('../stores/session.js');
        const doc = createFakeDocument(['scribeDeckSettingsSummary', 'scribeDeckSettingsList', 'scribeDeckScope-green']);
        global.document = doc;
        doc.elements['scribeDeckScope-green'].dataset.sessionId = 'session-42';
        doc.elements['scribeDeckScope-green'].value = 'europe';
        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-42');
        vi.spyOn(sessionStore, 'getSessionData').mockReturnValue({ sessionTopologyVersion: 2, greenSeatModel: null });
        const controller = new WhiteCellController();
        controller.renderScribeDeckSettings();
        expect(doc.elements.scribeDeckSettingsList.innerHTML).toContain('value="europe" selected');
        expect(doc.elements.scribeDeckSettingsList.innerHTML).not.toContain('value="both" selected');
        expect(doc.elements.scribeDeckSettingsList.innerHTML).toContain('Choose regional deck recipients');
        doc.elements['scribeDeckScope-green'].dataset.sessionId = 'another-session';
        controller.renderScribeDeckSettings();
        expect(doc.elements.scribeDeckSettingsList.innerHTML).not.toContain('value="europe" selected');
    });

    it('labels new Blue Strategic Orientation records as orientation and forecast in the White Cell card and review dialog', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        global.document = createFakeDocument();
        const controller = new WhiteCellController();
        const action = {
            ...buildStrategicOrientationAction('blue'),
            goal: 'Blue Team Strategic Orientation: Pressure'
        };

        const markup = controller.renderActionCard(action);
        controller.showStrategicOrientationReviewModal(action);

        expect(markup).toContain(
            '<h3 class="entity-card__title">Blue Team Strategic Orientation: Pressure</h3>'
        );
        expect(markup).toContain('<span class="badge-text">Blue Team</span>');
        expect(markup).toContain('<span class="badge-text">Orientation &amp; Forecast</span>');
        expect(showModal.mock.calls.at(-1)?.[0]?.content?.innerHTML).toContain(
            '<h4 class="font-semibold">Blue Team Strategic Orientation: Pressure</h4>'
        );
        const modalConfig = showModal.mock.calls.at(-1)?.[0];
        expect(modalConfig?.buttons?.map((button) => button.label)).toEqual([
            'Cancel',
            'Send Back for Improvement',
            'Accept as Complete'
        ]);
        expect(modalConfig?.content?.innerHTML).not.toContain('outcomeSelect');
        expect(modalConfig?.content?.innerHTML).not.toMatch(/Outcome \*/);
    });

    it('reviews and preserves the complete Industry Strategic Plan through the existing orientation workflow', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        global.document = createFakeDocument();
        const controller = new WhiteCellController();
        const action = {
            id: 'industry-plan-white-cell',
            team: 'industry',
            status: 'submitted',
            workflow_state: 'submitted_to_white_cell',
            revision_number: 2,
            mechanism: 'Strategic Orientation',
            goal: 'Industry Strategic Plan',
            ally_contingencies: serializeStrategicOrientationDetails({
                team: 'industry',
                ownOrientation: null,
                forecastTargets: [{ key: 'blue', orientation: 'stabilization' }],
                industryStrategicPlan: (() => {
                    const sectorPlan = {
                    businessOverview: 'We operate secure networks and depend on advanced chips.',
                    risks: [
                        { type: 'supply_disruption', otherText: '', likelihood: 'high', impact: 'high', tiedCell: 'red' },
                        { type: 'secondary_sanctions_exposure', otherText: '', likelihood: 'medium', impact: 'high', tiedCell: 'blue' },
                        { type: 'other', otherText: 'Supply Risk', likelihood: 'medium', impact: 'medium', tiedCell: 'green' }
                    ],
                    redPriorities: 'Preserve market access and acquire strategic technology.',
                    partners: [
                        { partner: 'Kenya', whyTheyMatter: 'Regional connectivity', likelyWant: 'Long-term investment' }
                    ],
                    firstAmbassadorTarget: { cell: 'green', reason: 'Coordinate resilient network investment.' },
                    strategicPriorities: [
                        { priority: 'Secure chip supply', successLooksLike: 'Two qualified suppliers' },
                        { priority: 'Protect market access', successLooksLike: 'No forced exit' },
                        { priority: 'Build partner capacity', successLooksLike: 'A funded joint program' }
                    ],
                    strategicStance: 3,
                    redLine: 'We will not transfer protected customer data.'
                    };
                    return {
                        version: 2,
                        sectorPlans: Object.fromEntries(['Agriculture', 'Telecommunications', 'Biotechnology']
                            .map((sector) => [sector, structuredClone(sectorPlan)]))
                    };
                })(),
                scribeHandoff: 'Forwarded'
            })
        };

        const cardMarkup = controller.renderActionCard(action);
        controller.showStrategicOrientationReviewModal(action);
        const modalConfig = showModal.mock.calls.at(-1)?.[0];
        const modalMarkup = modalConfig?.content?.innerHTML || '';
        const historyMarkup = controller.renderReturnedRevisionHistoryCard({
            id: 'industry-plan-return-history',
            artifact_kind: 'strategic_orientation',
            artifact_id: action.id,
            team: 'industry',
            revision_number: 2,
            reviewer_role: 'whitecell_lead',
            reviewer_notes: 'Clarify partner sequencing.',
            prior_state: action
        });

        [cardMarkup, modalMarkup, historyMarkup].forEach((markup) => {
            expect(markup).toContain('Review Industry Strategic Plan');
            expect(markup).toContain('Agriculture — Business Overview');
            expect(markup).toContain('Telecommunications — Risk 1');
            expect(markup).toContain('Biotechnology — Strategic Priority 1');
            expect(markup).toContain('Stabilization');
            expect(markup).toContain('Supply Risk');
            expect(markup).toContain('Kenya');
            expect(markup).toContain('We will not transfer protected customer data.');
            expect(markup).not.toContain('Own Orientation');
        });
        expect(modalConfig?.title).toBe('Review Industry Strategic Plan');
        expect(modalConfig?.buttons?.map((button) => button.label)).toEqual([
            'Cancel',
            'Send Back for Improvement',
            'Accept as Complete'
        ]);
        expect(historyMarkup).toContain('Clarify partner sequencing.');
    });

    it('uses a distinct token-backed source badge for every submission team', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        global.document = createFakeDocument();
        const controller = new WhiteCellController();

        [
            { id: 'blue', label: 'Blue Team' },
            { id: 'red', label: 'Red Team' },
            { id: 'green', label: 'Green Team' },
            { id: 'industry', label: 'Industry Team' }
        ].forEach(({ id, label }) => {
            const markup = controller.renderActionCard({
                id: `action-${id}`,
                goal: `${label} submission`,
                mechanism: 'Policy action',
                team: id,
                move: 1,
                phase: 1,
                status: 'submitted'
            });

            expect(markup).toContain(`badge-source-team--${id}`);
            expect(markup).toContain(`<span class="badge-text">${label}</span>`);
        });

        const cardsCss = readFileSync(CARDS_CSS_PATH, 'utf8');
        expect(cardsCss).toContain('.badge.badge-source-team {');
        expect(cardsCss).toContain('background-color: color-mix(in srgb, var(--source-team-color) 6%, transparent);');
        expect(cardsCss).toContain('--source-team-color: var(--color-team-blue);');
        expect(cardsCss).toContain('--source-team-color: var(--color-team-red);');
        expect(cardsCss).toContain('--source-team-color: var(--color-team-green);');
        expect(cardsCss).toContain('--source-team-color: var(--color-team-industry);');
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
                instruments: ['Economic', 'Information', 'Military'],
                levers: ['Investment Screening', 'Industrial Policy'],
                sectors: ['Biotechnology', 'Agriculture'],
                supplyChainFocusDecision: 'Yes',
                supplyChainActionAngles: ['Build resilience for Blue', 'Disrupt Red'],
                supplyChainAreas: ['Refinement', 'Advanced Manufacturing'],
                implementation: 'Legislative',
                legislativeOptions: ['Existing legislation/policy', 'Proposing new legislation/policy'],
                enforcementTimeline: '12 months',
                coordinatedDecision: 'Yes',
                coordinated: ['Legislative'],
                informedEngagedDecision: 'Yes',
                informed: ['Allies'],
                notificationTeams: ['Green', 'Industry'],
                notificationNote: 'Notify both teams after White Cell accepts the action.'
            })
        };

        const markup = controller.renderActionCard(blueAction, {
            showAdjudicateAction: true
        });

        expect(markup).toContain('Objective:</strong> Constrain upstream dependency before the next move.');
        expect(markup).toContain('Instrument of Power:</strong> Economic, Information, Military');
        expect(markup).toContain('Levers:</strong> Investment Screening, Industrial Policy');
        expect(markup).toContain('Supply Chain Decision:</strong> Yes');
        expect(markup).toContain('Action Angles:</strong> Build resilience for Blue, Disrupt Red');
        expect(markup).toContain('Supply Chain Areas:</strong> Refinement, Advanced Manufacturing');
        expect(markup).toContain('Sectors:</strong> Biotechnology, Agriculture');
        expect(markup).toContain('Legislative Route:</strong> Existing legislation/policy, Proposing new legislation/policy');
        expect(markup).toContain('Focus Countries:</strong> PRC, Japan');
        expect(markup).toContain('Enforcement Timeline:</strong> 12 months');
        expect(markup).toContain('Coordination Decision:</strong> Yes');
        expect(markup).toContain('Coordination Selections:</strong> Legislative');
        expect(markup).toContain('Informed/Engaged Decision:</strong> Yes');
        expect(markup).toContain('Informed/Engaged Selections:</strong> Allies');
        expect(markup).toContain('aria-label="Blue Team notification request"');
        expect(markup).toContain('Teams to Inform:</strong> Green, Industry');
        expect(markup).toContain('Notification Note:</strong> Notify both teams after White Cell accepts the action.');
        expect(markup).toContain('Delivery Status:</strong> Awaiting White Cell review.');
        expect(markup).toContain('Blue Team | Move 2 | Action 2 &middot; Phase 2');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Objective: Constrain upstream dependency before the next move.');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Instrument of Power: Economic, Information, Military');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Levers: Investment Screening, Industrial Policy');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Action Angles: Build resilience for Blue, Disrupt Red');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Supply Chain Areas: Refinement, Advanced Manufacturing');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Legislative Route: Existing legislation/policy, Proposing new legislation/policy');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Enforcement Timeline: 12 months');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Informed/Engaged Selections: Allies');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Teams to Inform: Green, Industry');
        expect(buildSharedActionCommunicationContent(blueAction)).toContain('Notification Note: Notify both teams after White Cell accepts the action.');
    });

    it('opens Review Action without an outcome control and with the two review decisions', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { serializeBlueActionDetails } = await import('../features/actions/blueActionDetails.js');
        global.document = createFakeDocument();

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        vi.spyOn(controller, 'getBlueTeamActionSequenceLabel').mockReturnValue('Blue Team | Move 1 | Action 1');

        controller.showAdjudicateModal({
            id: 'action-white-cell-modal-1',
            goal: 'Coordinate export controls',
            mechanism: 'Economic',
            team: 'blue',
            move: 1,
            phase: 1,
            status: 'submitted',
            targets: ['PRC'],
            sector: 'Biotechnology',
            exposure_type: 'Advanced Manufacturing',
            expected_outcomes: 'Reduce allied dependence.',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Coordinate export controls.',
                sectors: ['Biotechnology'],
                supplyChainFocuses: ['Advanced Manufacturing'],
                implementation: 'Executive Order',
                enforcementTimeline: '6 months',
                coordinated: ['Executive'],
                informed: ['Allies'],
                notificationTeams: ['Green'],
                notificationNote: 'Notify Green after White Cell accepts the action.'
            })
        });

        const modalConfig = showModal.mock.calls.at(-1)?.[0];
        const modalButtonLabels = modalConfig?.buttons?.map((button) => button.label) || [];
        expect(modalConfig?.title).toBe('Review Action');
        expect(modalButtonLabels).toContain('Accept as Complete');
        expect(modalButtonLabels).toContain('Send Back for Improvement');
        expect(modalButtonLabels).not.toContain('Send to Red Team');
        expect(modalConfig?.content?.innerHTML).toContain('<strong>Supply Chain Areas:</strong> Advanced Manufacturing');
        expect(modalConfig?.content?.innerHTML).toContain('aria-label="Blue Team notification request"');
        expect(modalConfig?.content?.innerHTML).toContain('Teams to Inform:</strong> Green');
        expect(modalConfig?.content?.innerHTML).toContain('Notification Note:</strong> Notify Green after White Cell accepts the action.');
        expect(modalConfig?.content?.innerHTML).toContain('<legend class="form-label">Requested team notifications</legend>');
        expect(modalConfig?.content?.innerHTML).toContain('name="actionNotificationApproval"');
        expect(modalConfig?.content?.innerHTML).toContain('value="green"');
        expect(modalConfig?.content?.innerHTML).toContain('Inform Green Team when this action is accepted');
        expect(modalConfig?.content?.innerHTML).toContain('checked');
        expect(modalConfig?.content?.innerHTML).not.toContain('id="outcomeSelect"');
        expect(modalConfig?.content?.innerHTML).not.toMatch(/Outcome \*/);
        expect(modalConfig?.content?.innerHTML).toContain('id="artifactReviewNotes"');
        expect(modalConfig?.content?.innerHTML).toContain('Required when sending back for improvement; optional when accepting as complete.');
    });

    it('keeps the Review Action footer reachable while long modal content scrolls', () => {
        const modalCss = readFileSync(MODALS_CSS_PATH, 'utf8');

        expect(modalCss).toMatch(/\.modal-header\s*\{[^}]*flex:\s*0 0 auto;/s);
        expect(modalCss).toMatch(/\.modal-content\s*\{[^}]*overflow-y:\s*auto;[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/s);
        expect(modalCss).toMatch(/\.modal-footer\s*\{[^}]*flex:\s*0 0 auto;[^}]*flex-wrap:\s*wrap;/s);
        expect(modalCss).toContain('max-height: calc(100dvh - var(--space-8));');
    });

    it('returns a Red action to Red with team-aware review and timeline language', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { actionsStore } = await import('../stores/actions.js');
        const { timelineStore } = await import('../stores/timeline.js');
        const { sessionStore } = await import('../stores/session.js');
        const notes = 'Clarify which Red lever owns execution.';
        global.document = createFakeDocument(['artifactReviewNotes', 'returnedRevisionHistoryList']);
        global.document.elements.artifactReviewNotes.value = notes;

        const action = {
            id: 'red-action-return-1',
            artifact_type: 'action',
            team: 'red',
            status: 'submitted',
            workflow_state: 'submitted_to_white_cell',
            revision_number: 3,
            move: 2,
            phase: 1,
            goal: 'Disrupt refinery access'
        };
        const returned = {
            ...action,
            status: 'draft',
            workflow_state: 'returned_to_team',
            revision_number: 4,
            outcome: null
        };
        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-red-return');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        const returnArtifact = vi.spyOn(database, 'returnArtifactToTeam').mockResolvedValue({
            artifact: returned,
            review: {
                id: 'review-red-return-1',
                artifact_kind: 'action',
                artifact_id: action.id,
                team: 'red',
                decision: 'return_to_team',
                revision_number: 3,
                next_revision_number: 4,
                reviewer_role: 'whitecell_lead',
                reviewer_notes: notes,
                reviewed_at: '2026-08-05T18:00:00.000Z',
                prior_state: action
            }
        });
        vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({ id: 'timeline-red-return-1' });
        const actionUpdate = vi.spyOn(actionsStore, 'updateFromServer').mockImplementation(() => {});
        const timelineUpdate = vi.spyOn(timelineStore, 'updateFromServer').mockImplementation(() => {});
        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        const modal = { close: vi.fn() };

        await controller.handleArtifactReview(modal, action, 'return_to_team');

        expect(returnArtifact).toHaveBeenCalledWith('action', action.id, {
            team: 'red',
            expectedRevision: 3,
            notes
        });
        expect(actionUpdate).toHaveBeenCalledWith('UPDATE', returned);
        expect(database.createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'ARTIFACT_RETURNED_TO_TEAM',
            content: expect.stringContaining('Red Team action revision 3 sent back for improvement'),
            metadata: expect.objectContaining({ submitting_team: 'red', revision_number: 3 })
        }));
        expect(timelineUpdate).toHaveBeenCalledWith('INSERT', { id: 'timeline-red-return-1' });
        expect(showToast).toHaveBeenCalledWith({
            message: 'Red Team action sent back for improvement.',
            type: 'success'
        });
        expect(modal.close).toHaveBeenCalled();
    });

    it('returns Strategic Orientation to its submitting team and requires notes', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const action = {
            ...buildStrategicOrientationAction('industry'),
            revision_number: 2,
            workflow_state: 'submitted_to_white_cell'
        };
        global.document = createFakeDocument(['artifactReviewNotes', 'returnedRevisionHistoryList']);
        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        const returnArtifact = vi.spyOn(database, 'returnArtifactToTeam').mockResolvedValue(null);

        await controller.handleArtifactReview({ close: vi.fn() }, action, 'return_to_team');

        expect(returnArtifact).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith({
            message: 'Notes are required to send the Industry Team Strategic Orientation back for improvement.',
            type: 'error'
        });

        global.document.elements.artifactReviewNotes.value = 'Align the forecast rationale to the selected posture.';
        vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({ id: 'timeline-so-return-1' });
        returnArtifact.mockResolvedValue({
            artifact: {
                ...action,
                status: 'draft',
                workflow_state: 'returned_to_team',
                revision_number: 3,
                outcome: null
            },
            review: {
                id: 'review-so-return-1',
                artifact_kind: 'strategic_orientation',
                artifact_id: action.id,
                team: 'industry',
                decision: 'return_to_team',
                revision_number: 2,
                next_revision_number: 3,
                reviewer_role: 'whitecell_lead',
                reviewer_notes: global.document.elements.artifactReviewNotes.value,
                reviewed_at: '2026-08-05T18:05:00.000Z',
                prior_state: action
            }
        });

        await controller.handleArtifactReview({ close: vi.fn() }, action, 'return_to_team');

        expect(returnArtifact).toHaveBeenLastCalledWith('strategic_orientation', action.id, {
            team: 'industry',
            expectedRevision: 2,
            notes: 'Align the forecast rationale to the selected posture.'
        });
        expect(database.createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('Industry Team Strategic Orientation revision 2 sent back for improvement')
        }));
    });

    it('rejects a stale review revision without closing the modal or changing local state', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { actionsStore } = await import('../stores/actions.js');
        global.document = createFakeDocument(['artifactReviewNotes']);
        global.document.elements.artifactReviewNotes.value = 'Return revision two.';
        const action = {
            id: 'action-stale-review-1',
            artifact_type: 'action',
            team: 'blue',
            status: 'submitted',
            workflow_state: 'submitted_to_white_cell',
            revision_number: 2
        };
        vi.spyOn(database, 'returnArtifactToTeam').mockRejectedValue(
            new Error('Stale artifact revision. Expected 2, current 3.')
        );
        const actionUpdate = vi.spyOn(actionsStore, 'updateFromServer').mockImplementation(() => {});
        const modal = { close: vi.fn() };
        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';

        await controller.handleArtifactReview(modal, action, 'return_to_team');

        expect(database.returnArtifactToTeam).toHaveBeenCalledWith('action', action.id, expect.objectContaining({
            team: 'blue',
            expectedRevision: 2
        }));
        expect(actionUpdate).not.toHaveBeenCalled();
        expect(modal.close).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith({
            message: 'The Blue Team action changed while you were reviewing it. Refresh and review the latest revision.',
            type: 'error'
        });
    });

    it('accepts an action as complete without assigning an outcome', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        global.document = createFakeDocument(['artifactReviewNotes']);
        const action = {
            id: 'red-action-complete-1',
            artifact_type: 'action',
            team: 'red',
            status: 'submitted',
            workflow_state: 'resubmitted',
            revision_number: 5,
            move: 3,
            phase: 2
        };
        const completed = {
            ...action,
            status: 'adjudicated',
            workflow_state: 'completed',
            outcome: null
        };
        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue(null);
        const completeArtifact = vi.spyOn(database, 'completeArtifact').mockResolvedValue({
            artifact: completed,
            review: {
                id: 'review-complete-1',
                artifact_kind: 'action',
                decision: 'complete',
                revision_number: 5
            }
        });
        vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({ id: 'timeline-complete-1' });
        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';

        await controller.handleArtifactReview({ close: vi.fn() }, action, 'complete');

        expect(completeArtifact).toHaveBeenCalledWith('action', action.id, {
            team: 'red',
            expectedRevision: 5,
            notes: ''
        });
        expect(completeArtifact.mock.calls[0][2]).not.toHaveProperty('outcome');
        expect(database.createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'ARTIFACT_COMPLETED',
            content: 'Red Team action revision 5 accepted as complete by White Cell.'
        }));
        expect(showToast).toHaveBeenCalledWith({
            message: 'Red Team action accepted as complete.',
            type: 'success'
        });
    });

    it('atomically completes Blue action notification approvals and publishes each returned communication', async () => {
        const { WhiteCellController, buildActionNotificationCommunicationContent } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { actionsStore } = await import('../stores/actions.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { sessionStore } = await import('../stores/session.js');
        const fakeDocument = createFakeDocument(['artifactReviewNotes']);
        fakeDocument.querySelectorAll = (selector) => selector === 'input[name="actionNotificationApproval"]:checked'
            ? [{ value: 'green' }, { value: 'industry' }]
            : [];
        global.document = fakeDocument;

        const action = {
            id: 'blue-action-notify-1',
            artifact_type: 'action',
            team: 'blue',
            status: 'submitted',
            workflow_state: 'submitted_to_white_cell',
            revision_number: 2,
            move: 2,
            phase: 1,
            goal: 'Coordinate allied licensing controls',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Coordinate allied licensing controls.',
                notificationTeams: ['Green', 'Industry'],
                notificationNote: 'Share the completed action with both teams.'
            })
        };
        const completed = {
            ...action,
            status: 'adjudicated',
            workflow_state: 'completed',
            outcome: null
        };
        const communications = [{
            id: 'action-notification-green',
            to_role: 'green',
            type: 'ACTION_NOTIFICATION',
            metadata: {
                shared_action_id: action.id,
                recipient_team: 'green',
                notification_delivery: 'approved'
            }
        }, {
            id: 'action-notification-industry',
            to_role: 'industry',
            type: 'ACTION_NOTIFICATION',
            metadata: {
                shared_action_id: action.id,
                recipient_team: 'industry',
                notification_delivery: 'approved'
            }
        }];

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue(null);
        const completeWithNotifications = vi.spyOn(database, 'completeActionWithNotifications').mockResolvedValue({
            artifact: completed,
            review: { id: 'review-blue-notify-1', decision: 'complete', revision_number: 2 },
            communications,
            notification_teams: ['green', 'industry']
        });
        vi.spyOn(database, 'ensureSmeHandoffs').mockResolvedValue([]);
        vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({ id: 'timeline-blue-notify-1' });
        const actionUpdate = vi.spyOn(actionsStore, 'updateFromServer').mockImplementation(() => {});
        const communicationUpdate = vi.spyOn(communicationsStore, 'updateFromServer').mockImplementation(() => {});
        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';

        await controller.handleArtifactReview({ close: vi.fn() }, action, 'complete');

        expect(completeWithNotifications).toHaveBeenCalledWith(action.id, {
            team: 'blue',
            expectedRevision: 2,
            notes: '',
            notificationTeams: ['green', 'industry'],
            notificationContent: buildActionNotificationCommunicationContent(action)
        });
        expect(actionUpdate).toHaveBeenCalledWith('UPDATE', completed);
        expect(communicationUpdate).toHaveBeenNthCalledWith(1, 'INSERT', communications[0]);
        expect(communicationUpdate).toHaveBeenNthCalledWith(2, 'INSERT', communications[1]);
        expect(database.createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                requested_notification_teams: ['green', 'industry'],
                notified_teams: ['green', 'industry']
            })
        }));
        expect(showToast).toHaveBeenCalledWith({
            message: 'Blue Team action accepted as complete and Green Team and Industry Team informed.',
            type: 'success'
        });
        controller.communications = communications;
        expect(controller.renderActionNotificationRequest(completed)).toContain(
            'Delivery Status:</strong> Sent to Green Team, Industry Team.'
        );
    });

    it('retains returned revisions with proposal identity, reviewer notes, and complete artifact fields', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { serializeBlueActionDetails } = await import('../features/actions/blueActionDetails.js');
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const { actionsStore } = await import('../stores/actions.js');
        const fakeDocument = createFakeDocument(['returnedRevisionHistoryList']);
        global.document = fakeDocument;
        vi.spyOn(actionsStore, 'getPending').mockReturnValue([]);
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([{
            id: 'red-history-action-1',
            team: 'red',
            status: 'adjudicated',
            workflow_state: 'completed',
            revision_number: 3
        }, {
            ...buildStrategicOrientationAction('green', { status: 'adjudicated' }),
            workflow_state: 'completed',
            revision_number: 4
        }]);
        const returnedRevision = {
            id: 'red-history-action-1',
            artifact_type: 'action',
            team: 'red',
            status: 'submitted',
            workflow_state: 'submitted_to_white_cell',
            revision_number: 2,
            goal: 'Apply coordinated Red pressure',
            targets: ['U.S'],
            expected_outcomes: 'Delay Blue production recovery.',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Disrupt production recovery.',
                instruments: ['Economic', 'Information'],
                levers: ['Export Controls', 'Financial Restrictions'],
                supplyChainFocusDecision: 'Yes',
                supplyChainActionAngles: ['Disrupt Red'],
                supplyChainAreas: ['Extraction', 'Distribution']
            })
        };
        const controller = new WhiteCellController();
        controller.returnedRevisionHistory = [
            {
                id: 'history-review-1',
                artifact_kind: 'action',
                artifact_id: returnedRevision.id,
                team: 'red',
                decision: 'return_to_team',
                revision_number: 2,
                reviewer_role: 'whitecell_support',
                reviewer_notes: 'Identify the lead Red lever and tighten sequencing.',
                reviewed_at: '2026-08-05T18:10:00.000Z',
                prior_state: returnedRevision
            },
            {
                id: 'history-review-so-1',
                artifact_kind: 'strategic_orientation',
                artifact_id: 'strategic-orientation-green',
                team: 'green',
                decision: 'return_to_team',
                revision_number: 3,
                reviewer_role: 'whitecell_lead',
                reviewer_notes: 'Explain the forecast posture before resubmitting.',
                reviewed_at: '2026-08-05T18:12:00.000Z',
                prior_state: {
                    ...buildStrategicOrientationAction('green'),
                    revision_number: 3,
                    ally_contingencies: serializeStrategicOrientationDetails({
                        team: 'green',
                        ownOrientation: 'stabilization',
                        forecastTargets: [{ key: 'blue', orientation: 'pressure' }],
                        strategyDescription: 'Forecast rationale retained in history.'
                    })
                }
            },
            {
                id: 'history-review-proposal-1',
                artifact_kind: 'action',
                artifact_id: 'proposal-stable-history-1',
                team: 'green',
                decision: 'return_to_team',
                revision_number: 2,
                reviewer_role: 'whitecell_lead',
                reviewer_notes: 'Name the accountable partner before resubmitting.',
                reviewed_at: '2026-08-05T18:14:00.000Z',
                prior_state: {
                    id: 'proposal-stable-history-1',
                    artifact_type: 'proposal',
                    mechanism: 'Proposal',
                    team: 'green',
                    status: 'submitted',
                    revision_number: 2,
                    goal: 'Dual-recipient resilient supply proposal',
                    ally_contingencies: serializeProposalDetails({
                        objective: 'Coordinate resilient supply.',
                        recipientTeams: ['blue', 'red'],
                        focusSectors: ['Biotechnology'],
                        supplyChainFocusDecision: 'No'
                    })
                }
            }
        ];

        controller.syncActionsFromStore();

        const markup = fakeDocument.elements.returnedRevisionHistoryList.innerHTML;
        expect(controller.returnedRevisionHistory).toHaveLength(3);
        expect(markup).toContain('Red Team');
        expect(markup).toContain('Revision:</strong> 2');
        expect(markup).toContain('White Cell Support');
        expect(markup).toContain('Identify the lead Red lever and tighten sequencing.');
        expect(markup).toContain('Instrument of Power:</strong> Economic, Information');
        expect(markup).toContain('Levers:</strong> Export Controls, Financial Restrictions');
        expect(markup).toContain('Action Angles:</strong> Disrupt Red');
        expect(markup).toContain('Supply Chain Areas:</strong> Extraction, Distribution');
        expect(markup).toContain('Returned At:</strong>');
        expect(markup).toContain('Green Team');
        expect(markup).toContain('Strategic Orientation');
        expect(markup).toContain('Forecast rationale retained in history.');
        expect(markup).toContain('Explain the forecast posture before resubmitting.');
        expect(markup).toContain('Proposal &middot; Returned revision 2');
        expect(markup).toContain('Dual-recipient resilient supply proposal');
        expect(markup).toContain('Blue Team: Awaiting separate White Cell approval');
        expect(markup).toContain('Name the accountable partner before resubmitting.');
    });

    it('loads returned action, Strategic Orientation, and RFI revisions for the active session', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        global.document = createFakeDocument(['returnedRevisionHistoryList']);
        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-history-1');
        const fetchHistory = vi.spyOn(database, 'fetchArtifactWorkflowReviews').mockResolvedValue([{
            id: 'history-fetch-1',
            artifact_kind: 'action',
            artifact_id: 'action-history-fetch-1',
            team: 'blue',
            decision: 'return_to_team',
            revision_number: 1,
            reviewer_role: 'whitecell_lead',
            reviewer_notes: 'Add an implementation owner.',
            reviewed_at: '2026-08-05T19:00:00.000Z',
            prior_state: {
                id: 'action-history-fetch-1',
                artifact_type: 'action',
                team: 'blue',
                goal: 'History-loaded action'
            }
        }]);
        const controller = new WhiteCellController();

        await controller.loadReturnedRevisionHistory();

        expect(fetchHistory).toHaveBeenCalledWith('session-history-1', {
            artifactKinds: ['action', 'strategic_orientation', 'rfi'],
            decisions: ['return_to_team', 'return_for_clarification']
        });
        expect(global.document.elements.returnedRevisionHistoryList.innerHTML).toContain('History-loaded action');
        expect(global.document.elements.returnedRevisionHistoryList.innerHTML).toContain('Add an implementation owner.');
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
            showAdjudicateAction: true
        });

        expect(markup).toContain('Proposal Overview');
        expect(markup).toContain('Routing &amp; Review');
        expect(markup).toContain('Originators');
        expect(markup).toContain('Intended Partners');
        expect(markup).toContain('Proposed Recipient Approvals');
        expect(markup).toContain('Blue Team');
        expect(markup).toContain('Review Proposal');
        expect(markup).not.toContain('Proposal Details');
    });

    it('shows Industry instruments of power in White Cell proposal review', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        global.document = createFakeDocument();
        const controller = new WhiteCellController();

        const markup = controller.renderProposalDetails({
            team: 'industry',
            mechanism: 'Proposal',
            ally_contingencies: serializeProposalDetails({
                objective: 'Coordinate industrial capacity.',
                instruments: ['Economic', 'Information'],
                intendedPartners: 'Blue Team'
            })
        });

        expect(markup).toContain('Instrument of Power');
        expect(markup).toContain('Economic, Information');
        expect(markup).not.toContain('>Category<');
    });

    it('renders the structured Industry proposal and both intended recipients for review', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const { createBlankIndustryTurnSheet } = await import('../features/actions/industryTurnSheet.js');
        global.document = createFakeDocument();
        const controller = new WhiteCellController();
        const industryTurnSheet = {
            ...createBlankIndustryTurnSheet({ move: 1, strategicPlanId: 'plan-1' }),
            industry: 'agriculture',
            recipientTeams: ['blue', 'red'],
            decision: {
                ...createBlankIndustryTurnSheet().decision,
                status: 'new',
                primaryMove: 'stockpile',
                visibility: 'public'
            }
        };

        const markup = controller.renderProposalDetails({
            team: 'industry',
            move: 1,
            ally_contingencies: serializeProposalDetails({
                recipientTeams: ['blue', 'red'],
                industryTurnSheet
            })
        });

        expect(markup).toContain('Industry proposal details');
        expect(markup).toContain('Intended recipients');
        expect(markup).toContain('Blue, Red');
        expect(markup).toContain('Visibility:');
        expect(markup).not.toContain('Turn Sheet');
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
                recipientTeams: ['blue', 'red']
            })
        });

        const modalConfig = showModal.mock.calls.at(-1)?.[0];
        expect(modalConfig?.title).toBe('Review Proposal Recipients');
        expect(modalConfig?.buttons?.at(-1)?.label).toBe('Apply Recipient Approvals');
        expect(modalConfig?.content?.innerHTML).toContain('Approve and forward to Blue Team');
        expect(modalConfig?.content?.innerHTML).toContain('Approve and forward to Red Team');
        expect(modalConfig?.content?.innerHTML).toContain('Each checked recipient is approved independently');
        expect(modalConfig?.content?.innerHTML).not.toContain('Reject Proposal');
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
            querySelectorAll: vi.fn(() => [{ value: 'blue' }]),
            getElementById(id) {
                if (id === 'adjudicationNotes') {
                    return { value: 'Forward for Blue Team consideration.' };
                }

                return null;
            }
        };

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-11');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        const reviewProposal = vi.spyOn(database, 'reviewProposal').mockResolvedValue({
            action: {
                id: 'action-92',
                team: 'industry',
                move: 2,
                phase: 1,
                status: 'submitted',
                workflow_state: 'submitted_to_white_cell',
                outcome: null
            },
            communication: {
                id: 'comm-proposal-1',
                to_role: 'blue',
                type: 'PROPOSAL_FORWARDED'
            },
            timeline_events: [{ id: 'timeline-proposal-forward-1', type: 'PROPOSAL_FORWARDED' }]
        });
        const actionsUpdate = vi.spyOn(actionsStore, 'updateFromServer').mockImplementation(() => {});
        const communicationsUpdate = vi.spyOn(communicationsStore, 'updateFromServer').mockImplementation(() => {});
        const timelineUpdate = vi.spyOn(timelineStore, 'updateFromServer').mockImplementation(() => {});

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        controller.getCurrentGameState = vi.fn(() => ({ move: 4, phase: 2 }));

        const modal = { close: vi.fn() };
        const proposal = {
            id: 'action-92',
            team: 'industry',
            move: 2,
            phase: 1,
            status: 'submitted',
            workflow_state: 'submitted_to_white_cell',
            revision_number: 1,
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
                recipientTeams: ['blue', 'red']
            })
        };

        await controller.handleProposalReview(modal, proposal);

        expect(reviewProposal).toHaveBeenCalledWith('action-92', {
            decision: 'forward_to_recipient',
            recipient_team: 'blue',
            adjudication_notes: 'Forward for Blue Team consideration.',
            expected_revision: 1
        });
        expect(actionsUpdate).toHaveBeenCalledWith('UPDATE', expect.objectContaining({ id: 'action-92' }));
        expect(communicationsUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'comm-proposal-1' }));
        expect(timelineUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'timeline-proposal-forward-1' }));
        expect(showToast).toHaveBeenCalledWith({ message: 'Proposal approved and forwarded to Blue Team.', type: 'success' });
        expect(modal.close).toHaveBeenCalled();
    });

    it('uses a response-specific modal and forwards the reviewed negotiation round', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const { database } = await import('../services/database.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { timelineStore } = await import('../stores/timeline.js');
        global.document = createFakeDocument();

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        const proposal = {
            id: 'proposal-response-source-1',
            team: 'green',
            goal: 'Regional logistics compact',
            mechanism: 'Proposal',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU'],
                objective: 'Coordinate regional logistics.',
                recipientTeams: ['blue', 'red']
            })
        };
        const review = {
            id: 'proposal-response-review-1',
            type: 'PROPOSAL_RESPONSE_REVIEW',
            content: 'Add a six-month review checkpoint.',
            created_at: '2026-08-15T12:00:00.000Z',
            metadata: {
                thread_id: 'thread-blue-1',
                recipient_team: 'blue',
                parent_message_id: 'thread-blue-root',
                source_proposal_id: proposal.id,
                source_revision: 1,
                source_team: 'green',
                sender_team: 'blue',
                sender_role: 'blue_scribe',
                proposed_round_number: 1,
                proposed_message_type: 'negotiation_message',
                facilitator_decision: 'negotiate',
                submitted_at: '2026-08-15T12:00:00.000Z'
            }
        };

        controller.actions = [];
        controller.proposalTeamProposals = [proposal];
        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([review]);

        expect(controller.openProposalResponseReviewById(proposal.id, review.id)).toBe(true);
        const modalConfig = showModal.mock.calls.at(-1)?.[0];
        expect(modalConfig?.title).toBe('Review Proposal Response');
        expect(modalConfig?.content?.innerHTML).toContain('Negotiation terms');
        expect(modalConfig?.content?.innerHTML).toContain('Add a six-month review checkpoint.');
        expect(modalConfig?.buttons?.at(-1)?.label).toBe('Forward to Green Team');
        expect(modalConfig?.content?.innerHTML).not.toContain('Independent recipient approvals');

        const forwardProposalResponse = vi.spyOn(database, 'forwardProposalResponse').mockResolvedValue({
            communication: { id: 'proposal-round-1', type: 'PROPOSAL_RESPONSE' },
            timeline_event: { id: 'proposal-response-timeline-1', type: 'PROPOSAL_RESPONSE' }
        });
        const communicationsUpdate = vi.spyOn(communicationsStore, 'updateFromServer').mockImplementation(() => {});
        const timelineUpdate = vi.spyOn(timelineStore, 'updateFromServer').mockImplementation(() => {});
        const modal = { close: vi.fn() };

        await controller.handleProposalResponseForward(modal, review);

        expect(forwardProposalResponse).toHaveBeenCalledWith(review.id);
        expect(communicationsUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'proposal-round-1' }));
        expect(timelineUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'proposal-response-timeline-1' }));
        expect(modal.close).toHaveBeenCalled();
    });

    it('returns a completed proposal to Awaiting Review while a response needs forwarding', async () => {
        const { WHITE_CELL_DOM_IDS, WhiteCellController } = await loadWhiteCellModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const { actionsStore } = await import('../stores/actions.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const fakeDocument = createFakeDocument(WHITE_CELL_DOM_IDS);
        global.document = fakeDocument;

        const proposal = {
            id: 'proposal-awaiting-response-review-1',
            team: 'green',
            status: 'adjudicated',
            workflow_state: 'completed',
            goal: 'Regional logistics compact',
            mechanism: 'Proposal',
            move: 2,
            phase: 1,
            ally_contingencies: serializeProposalDetails({
                originators: ['EU'],
                objective: 'Coordinate regional logistics.',
                recipientTeams: ['blue']
            })
        };
        const pendingResponse = {
            id: 'proposal-response-review-queue-1',
            type: 'PROPOSAL_RESPONSE_REVIEW',
            content: 'Add a six-month checkpoint.',
            created_at: '2026-08-15T12:00:00.000Z',
            metadata: {
                thread_id: 'thread-blue-1', recipient_team: 'blue', parent_message_id: 'root-blue-1',
                source_proposal_id: proposal.id, source_revision: 1, source_team: 'green',
                sender_team: 'blue', sender_role: 'blue_scribe', proposed_round_number: 1,
                proposed_message_type: 'negotiation_message', facilitator_decision: 'negotiate',
                submitted_at: '2026-08-15T12:00:00.000Z'
            }
        };
        vi.spyOn(actionsStore, 'getPending').mockReturnValue([]);
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([proposal]);
        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([pendingResponse]);

        const controller = new WhiteCellController();
        controller.operatorRole = 'lead';
        controller.syncActionsFromStore();

        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Awaiting Review');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('Review Blue Team Response');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('class="tab-button tab-button-active"');
        expect(fakeDocument.elements.proposalsList.innerHTML).toContain('data-review-tab="pending"');
        expect(fakeDocument.elements.proposalsBadge.hidden).toBe(false);
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
            querySelectorAll: vi.fn(() => [{ value: 'blue' }]),
            getElementById(id) {
                if (id === 'adjudicationNotes') {
                    return { value: 'Forward using the approved recipient.' };
                }

                return null;
            }
        };

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-13');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        const reviewProposal = vi.spyOn(database, 'reviewProposal').mockResolvedValue({
            action: {
                id: 'action-94',
                team: 'green',
                status: 'adjudicated',
                workflow_state: 'completed',
                outcome: null
            },
            communication: {
                id: 'comm-proposal-3',
                to_role: 'blue',
                type: 'PROPOSAL_FORWARDED',
                metadata: { source_proposal_id: 'action-94' }
            },
            timeline_events: [{ id: 'timeline-proposal-3' }]
        });
        vi.spyOn(actionsStore, 'updateFromServer').mockImplementation(() => {});
        const communicationsUpdate = vi.spyOn(communicationsStore, 'updateFromServer').mockImplementation(() => {});
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

        expect(reviewProposal).toHaveBeenCalledWith('action-94', expect.objectContaining({
            decision: 'forward_to_recipient',
            recipient_team: 'blue'
        }));
        expect(communicationsUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'comm-proposal-3' }));
    });

    it('returns proposal change requests as the next revision of the same logical proposal', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const { database } = await import('../services/database.js');
        const { sessionStore } = await import('../stores/session.js');
        const { actionsStore } = await import('../stores/actions.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { timelineStore } = await import('../stores/timeline.js');

        global.document = {
            querySelectorAll: vi.fn(() => []),
            getElementById(id) {
                if (id === 'adjudicationNotes') {
                    return { value: 'Clarify the timing conditions before we forward this.' };
                }

                return null;
            }
        };

        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-12');
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        const returnArtifact = vi.spyOn(database, 'returnArtifactToTeam').mockResolvedValue({
            artifact: {
                id: 'action-93',
                team: 'green',
                status: 'draft',
                workflow_state: 'returned_to_team',
                revision_number: 2,
                outcome: null
            },
            review: {
                id: 'review-proposal-2',
                artifact_kind: 'action',
                artifact_id: 'action-93',
                decision: 'return_to_team',
                revision_number: 1,
                next_revision_number: 2
            }
        });
        const createCommunication = vi.spyOn(database, 'createCommunication').mockResolvedValue({
            id: 'comm-proposal-2'
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
            workflow_state: 'submitted_to_white_cell',
            revision_number: 1,
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
        }, { returnForChanges: true });

        expect(returnArtifact).toHaveBeenCalledWith('action', 'action-93', {
            team: 'green',
            expectedRevision: 1,
            notes: 'Clarify the timing conditions before we forward this.'
        });
        expect(createCommunication).not.toHaveBeenCalled();
        expect(communicationsUpdate).not.toHaveBeenCalled();
        expect(actionsUpdate).toHaveBeenCalledWith('UPDATE', expect.objectContaining({ id: 'action-93' }));
        expect(timelineUpdate).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith({ message: 'Proposal sent back for improvement', type: 'success' });
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
        expect(createCommunication.mock.calls[0][0].title).toBe('Blue Team Action Notification');
        expect(createCommunication.mock.calls[0][0].metadata.action_snapshot).toMatchObject({
            title: 'Stabilize port access',
            objective: 'Stabilize port access'
        });
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

    it('only exposes submitted and resubmitted pending RFIs for White Cell response', async () => {
        const { isRfiAwaitingWhiteCellResponse } = await loadWhiteCellModule();

        expect(isRfiAwaitingWhiteCellResponse({ status: 'pending' })).toBe(true);
        expect(isRfiAwaitingWhiteCellResponse({
            status: 'pending',
            workflow_state: 'resubmitted'
        })).toBe(true);
        expect(isRfiAwaitingWhiteCellResponse({
            status: 'pending',
            workflow_state: 'returned_to_team'
        })).toBe(false);
        expect(isRfiAwaitingWhiteCellResponse({
            status: 'pending',
            workflow_state: 'completed'
        })).toBe(false);
        expect(isRfiAwaitingWhiteCellResponse({
            status: 'answered',
            workflow_state: 'completed'
        })).toBe(false);
    });

    it('separates the actionable RFI queue from revision-aware history without priority UI', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const fakeDocument = createFakeDocument(['rfiQueue']);
        global.document = fakeDocument;
        const controller = new WhiteCellController();
        controller.rfis = [{
            id: 'rfi-pending',
            team: 'industry',
            query: 'Which implementation period applies?',
            status: 'pending',
            workflow_state: 'resubmitted',
            revision_number: 2
        }];
        controller.rfiHistory = [{
            id: 'rfi-returned',
            team: 'industry',
            query: 'What baseline applies?',
            status: 'pending',
            workflow_state: 'returned_to_team',
            revision_number: 3,
            review_notes: 'Name the requested reporting window.'
        }];
        controller.returnedRevisionHistory = [{
            id: 'rfi-review-history',
            artifact_kind: 'rfi',
            artifact_id: 'rfi-pending',
            team: 'industry',
            decision: 'return_for_clarification',
            revision_number: 1,
            reviewer_role: 'whitecell_lead',
            reviewer_notes: 'State the original implementation period.',
            reviewed_at: '2026-08-06T12:00:00.000Z',
            prior_state: {
                id: 'rfi-pending',
                team: 'industry',
                query: 'What implementation period applies?'
            }
        }];

        controller.renderRfiQueue();
        expect(fakeDocument.elements.rfiQueue.innerHTML).toContain('Pending');
        expect(fakeDocument.elements.rfiQueue.innerHTML).toContain('Answered / History');
        expect(fakeDocument.elements.rfiQueue.innerHTML).toContain('Return for Clarification');
        expect(fakeDocument.elements.rfiQueue.innerHTML).not.toContain('priority');

        controller.rfiActiveView = 'history';
        controller.renderRfiQueue();
        expect(fakeDocument.elements.rfiQueue.innerHTML).toContain('What baseline applies?');
        expect(fakeDocument.elements.rfiQueue.innerHTML).toContain('Name the requested reporting window.');
        expect(fakeDocument.elements.rfiQueue.innerHTML).toContain('What implementation period applies?');
        expect(fakeDocument.elements.rfiQueue.innerHTML).toContain('State the original implementation period.');
        expect(fakeDocument.elements.rfiQueue.innerHTML).not.toContain('Respond</button>');

        controller.returnedRevisionHistoryError = new Error('history unavailable');
        controller.renderRfiQueue();
        expect(fakeDocument.elements.rfiQueue.innerHTML).toContain('Immutable RFI revision history could not be loaded.');
        expect(fakeDocument.elements.rfiQueue.innerHTML).toContain('data-rfi-history-retry');
    });

    it('refreshes and removes a stale RFI when completion wins the response race', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { requestsStore } = await import('../stores/requests.js');
        const fakeDocument = createFakeDocument(['rfiResponse', 'rfiQueue', 'rfiBadge']);
        fakeDocument.elements.rfiResponse.value = 'White Cell response.';
        global.document = fakeDocument;

        const pendingRequest = {
            id: 'rfi-stale-1',
            status: 'pending',
            workflow_state: 'submitted_to_white_cell',
            team: 'blue'
        };
        vi.spyOn(requestsStore, 'loadRequests').mockResolvedValue();
        vi.spyOn(requestsStore, 'getById').mockReturnValue(pendingRequest);
        vi.spyOn(requestsStore, 'getPending')
            .mockReturnValueOnce([pendingRequest])
            .mockReturnValueOnce([]);
        const updateRequest = vi.spyOn(database, 'updateRequest').mockRejectedValue(
            new Error('Completed artifacts are immutable.')
        );
        const createTimelineEvent = vi.spyOn(database, 'createTimelineEvent');
        const modal = { close: vi.fn() };
        const controller = new WhiteCellController();

        await controller.handleRfiResponse(modal, pendingRequest.id);

        expect(updateRequest).toHaveBeenCalledWith(pendingRequest.id, expect.objectContaining({
            response: 'White Cell response.',
            status: 'answered'
        }));
        expect(requestsStore.loadRequests).toHaveBeenCalledTimes(2);
        expect(controller.rfis).toEqual([]);
        expect(fakeDocument.elements.rfiQueue.innerHTML).toContain('No pending RFIs.');
        expect(showToast).toHaveBeenCalledWith({
            message: 'This RFI was already completed. The queue has been refreshed.',
            type: 'warning'
        });
        expect(modal.close).toHaveBeenCalledTimes(1);
        expect(createTimelineEvent).not.toHaveBeenCalled();
    });

    it('does not call the answer RPC when the preflight refresh finds an answered RFI', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        const { database } = await import('../services/database.js');
        const { requestsStore } = await import('../stores/requests.js');
        const fakeDocument = createFakeDocument(['rfiResponse', 'rfiQueue', 'rfiBadge']);
        fakeDocument.elements.rfiResponse.value = 'Stale replacement response.';
        global.document = fakeDocument;

        const answeredRequest = {
            id: 'rfi-answered-1',
            status: 'answered',
            workflow_state: 'completed',
            team: 'blue',
            response: 'Authoritative White Cell response.'
        };
        vi.spyOn(requestsStore, 'loadRequests').mockResolvedValue();
        vi.spyOn(requestsStore, 'getById').mockReturnValue(answeredRequest);
        vi.spyOn(requestsStore, 'getPending').mockReturnValue([]);
        const updateRequest = vi.spyOn(database, 'updateRequest');
        const modal = { close: vi.fn() };
        const controller = new WhiteCellController();

        await controller.handleRfiResponse(modal, answeredRequest.id);

        expect(updateRequest).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith({
            message: 'This RFI was already answered. The queue has been refreshed.',
            type: 'warning'
        });
        expect(modal.close).toHaveBeenCalledTimes(1);
    });

    it('bounds the pending RFI queue for large exercise datasets', async () => {
        const { WHITE_CELL_RFI_RENDER_LIMIT, WhiteCellController } = await loadWhiteCellModule();
        const fakeDocument = createFakeDocument(['rfiQueue']);
        global.document = fakeDocument;

        const controller = new WhiteCellController();
        controller.rfis = Array.from({ length: WHITE_CELL_RFI_RENDER_LIMIT + 2 }, (_, index) => ({
            id: `rfi-${index + 1}`,
            team: 'blue',
            query: `RFI question ${index + 1}`,
            status: 'pending',
            workflow_state: 'submitted_to_white_cell',
            created_at: '2026-04-10T10:00:00.000Z'
        }));

        controller.renderRfiQueue();

        const markup = fakeDocument.elements.rfiQueue.innerHTML;
        expect(markup).toContain(
            `Showing the first ${WHITE_CELL_RFI_RENDER_LIMIT} of ${WHITE_CELL_RFI_RENDER_LIMIT + 2} pending RFIs.`
        );
        expect(markup).toContain(`RFI question ${WHITE_CELL_RFI_RENDER_LIMIT}`);
        expect(markup).not.toContain(`RFI question ${WHITE_CELL_RFI_RENDER_LIMIT + 1}`);
    });

    it('uses the shared session-code maximum in the White Cell create-session modal', async () => {
        const { WhiteCellController } = await loadWhiteCellModule();
        global.document = createFakeDocument();

        const controller = new WhiteCellController();
        controller.showCreateSessionAdminModal();

        const modalConfig = showModal.mock.calls.at(-1)?.[0];
        expect(modalConfig?.content?.innerHTML).toContain(`maxlength="${SESSION_CODE_MAX_LENGTH}"`);
    });
});
