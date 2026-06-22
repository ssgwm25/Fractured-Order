import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockDatabase,
    mockSessionStore,
    mockSyncService,
    mockGameStateStore,
    mockActionsStore,
    mockRequestsStore,
    mockTimelineStore,
    mockParticipantsStore,
    mockShowToast,
    mockShowLoader,
    mockHideLoader,
    mockShowInlineLoader,
    mockShowModal,
    mockConfirmModal,
    mockCloseModal
} = vi.hoisted(() => ({
    mockDatabase: {
        requireOperatorGrant: vi.fn(() => Promise.resolve({
            surface: 'gamemaster',
            role: 'white'
        })),
        getActiveSessions: vi.fn(() => Promise.resolve([
            {
                id: 'session-gm-1',
                name: 'Alpha Session',
                status: 'active',
                metadata: { session_code: 'ALPHA2026' },
                created_at: '2026-04-07T10:00:00.000Z',
                updated_at: '2026-04-07T10:00:00.000Z'
            }
        ])),
        fetchSessionBundle: vi.fn((sessionId) => Promise.resolve({
            session: {
                id: sessionId,
                name: 'Alpha Session',
                status: 'active',
                metadata: { session_code: 'ALPHA2026' },
                created_at: '2026-04-07T10:00:00.000Z',
                updated_at: '2026-04-07T10:00:00.000Z'
            },
            gameState: { move: 1, phase: 1 },
            participants: [],
            actions: [],
            requests: [],
            timeline: []
        })),
        removeSessionParticipant: vi.fn(() => Promise.resolve({
            id: 'participant-gm-1',
            session_id: 'session-gm-1',
            role: 'blue_facilitator',
            is_active: false
        })),
        getResearchCaptureMode: vi.fn(() => Promise.resolve('research')),
        getResearchBuildHash: vi.fn(() => Promise.resolve('mock-build-hash'))
    },
    mockSessionStore: {
        getRole: vi.fn(() => 'white'),
        getSessionData: vi.fn(() => ({ role: 'white' })),
        hasOperatorAccess: vi.fn(() => true),
        setOperatorAuth: vi.fn(),
        clearOperatorAuth: vi.fn()
    },
    mockSyncService: {
        initialize: vi.fn(() => Promise.resolve()),
        reset: vi.fn(() => Promise.resolve())
    },
    mockGameStateStore: {
        subscribe: vi.fn(() => vi.fn()),
        getState: vi.fn(() => ({ move: 2, phase: 3 }))
    },
    mockActionsStore: {
        subscribe: vi.fn(() => vi.fn()),
        getAll: vi.fn(() => [{ id: 'action-gm-1' }])
    },
    mockRequestsStore: {
        subscribe: vi.fn(() => vi.fn()),
        getAll: vi.fn(() => [{ id: 'request-gm-1', status: 'pending' }])
    },
    mockTimelineStore: {
        subscribe: vi.fn(() => vi.fn()),
        getAll: vi.fn(() => [{ id: 'timeline-gm-1', created_at: '2026-04-07T11:00:00.000Z', content: 'Live update' }])
    },
    mockParticipantsStore: {
        subscribe: vi.fn(() => vi.fn()),
        getAll: vi.fn(() => [{ id: 'participant-gm-1', display_name: 'Morgan', role: 'blue_facilitator' }])
    },
    mockShowToast: vi.fn(),
    mockShowLoader: vi.fn(() => ({})),
    mockHideLoader: vi.fn(),
    mockShowInlineLoader: vi.fn(() => ({
        hide: vi.fn()
    })),
    mockShowModal: vi.fn(),
    mockConfirmModal: vi.fn(),
    mockCloseModal: vi.fn()
}));

vi.mock('../services/database.js', () => ({
    database: mockDatabase
}));

vi.mock('../stores/session.js', () => ({
    sessionStore: mockSessionStore
}));

vi.mock('../services/sync.js', () => ({
    syncService: mockSyncService
}));

vi.mock('../stores/gameState.js', () => ({
    gameStateStore: mockGameStateStore
}));

vi.mock('../stores/actions.js', () => ({
    actionsStore: mockActionsStore
}));

vi.mock('../stores/requests.js', () => ({
    requestsStore: mockRequestsStore
}));

vi.mock('../stores/timeline.js', () => ({
    timelineStore: mockTimelineStore
}));

vi.mock('../stores/participants.js', () => ({
    participantsStore: mockParticipantsStore
}));

vi.mock('../services/supabase.js', () => ({
    getRuntimeConfigStatus: () => ({ ready: true })
}));

vi.mock('../components/ui/Toast.js', () => ({
    showToast: mockShowToast
}));

vi.mock('../components/ui/Badge.js', () => ({
    createBadge: vi.fn(() => ({
        outerHTML: '<span class="badge"></span>'
    }))
}));

vi.mock('../components/ui/Loader.js', () => ({
    showLoader: mockShowLoader,
    hideLoader: mockHideLoader,
    showInlineLoader: mockShowInlineLoader
}));

vi.mock('../components/ui/Modal.js', () => ({
    showModal: mockShowModal,
    confirmModal: mockConfirmModal,
    closeModal: mockCloseModal
}));

vi.mock('../utils/logger.js', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

function createElement() {
    const listeners = new Map();

    return {
        innerHTML: '',
        textContent: '',
        value: '',
        style: {},
        disabled: false,
        checked: false,
        dataset: {},
        classList: {
            add: vi.fn(),
            remove: vi.fn(),
            toggle: vi.fn()
        },
        addEventListener: vi.fn((eventName, listener) => {
            listeners.set(eventName, listener);
        }),
        click() {
            listeners.get('click')?.({
                target: this,
                currentTarget: this,
                preventDefault: vi.fn()
            });
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
    };
}

async function loadGameMasterModule() {
    globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
    vi.resetModules();
    return import('./gamemaster.js');
}

describe('GameMaster live session monitoring', () => {
    let elements;

    beforeEach(() => {
        vi.clearAllMocks();
        elements = Object.fromEntries([
            'createSessionBtn',
            'refreshDashboardBtn',
            'participantsSessionSelect',
            'exportSessionSelect',
            'exportJsonBtn',
            'exportActionsCsvBtn',
            'exportRequestsCsvBtn',
            'exportTimelineCsvBtn',
            'exportParticipantsCsvBtn',
            'exportResearchArchiveBtn',
            'printResearchReportBtn',
            'exportResearchIncludeNotes',
            'sessionsList',
            'statsGrid',
            'recentActivity',
            'activeParticipants',
            'sessionName',
            'headerMove',
            'headerPhase',
            'participantsSelectionState',
            'participantsList',
            'exportSelectionState',
            'sessionDetailSection'
        ].map((id) => [id, createElement()]));

        elements.sessionDetailSection.style.display = 'none';

        global.document = {
            getElementById(id) {
                return elements[id] || null;
            },
            createElement() {
                return createElement();
            },
            querySelector() {
                return null;
            },
            querySelectorAll() {
                return [];
            }
        };
    });

    afterEach(() => {
        vi.resetModules();
        delete global.document;
        delete globalThis.__ESG_DISABLE_AUTO_INIT__;
    });

    it('subscribes to shared stores and initializes sync for the selected session', async () => {
        const { GameMasterController } = await loadGameMasterModule();
        const controller = new GameMasterController();

        await controller.init();
        await controller.handleSessionSelectionChange('session-gm-1');

        expect(mockGameStateStore.subscribe).toHaveBeenCalledTimes(1);
        expect(mockActionsStore.subscribe).toHaveBeenCalledTimes(1);
        expect(mockRequestsStore.subscribe).toHaveBeenCalledTimes(1);
        expect(mockTimelineStore.subscribe).toHaveBeenCalledTimes(1);
        expect(mockParticipantsStore.subscribe).toHaveBeenCalledTimes(1);
        expect(mockSyncService.initialize).toHaveBeenCalledWith('session-gm-1');
    });

    it('wires each live export button to the matching legacy or research action', async () => {
        const { GameMasterController } = await loadGameMasterModule();
        const controller = new GameMasterController();
        const exportSpy = vi.fn();

        controller.exportData = exportSpy;
        controller.bindEventListeners();

        elements.exportJsonBtn.click();
        elements.exportActionsCsvBtn.click();
        elements.exportRequestsCsvBtn.click();
        elements.exportTimelineCsvBtn.click();
        elements.exportParticipantsCsvBtn.click();
        elements.exportResearchArchiveBtn.click();
        elements.printResearchReportBtn.click();

        expect(exportSpy.mock.calls).toEqual([
            ['json'],
            ['csv-actions'],
            ['csv-requests'],
            ['csv-timeline'],
            ['csv-participants'],
            ['research-archive'],
            ['research-print']
        ]);
    });

    it('renders remove controls in the participant roster table', async () => {
        const { GameMasterController } = await loadGameMasterModule();
        const controller = new GameMasterController();

        const tableHtml = controller.renderParticipantsTable([
            {
                id: 'participant-gm-1',
                display_name: 'Morgan',
                role: 'blue_facilitator',
                is_active: true,
                heartbeat_at: '2026-04-07T11:00:00.000Z'
            }
        ], {
            includeActions: true,
            sessionName: 'Alpha Session'
        });

        expect(tableHtml).toContain('<th>Actions</th>');
        expect(tableHtml).toContain('data-remove-session-participant-id="participant-gm-1"');
        expect(tableHtml).toContain('Remove');
    });

    it('removes a participant through the protected Game Master flow', async () => {
        mockConfirmModal.mockResolvedValue(true);

        const { GameMasterController } = await loadGameMasterModule();
        const controller = new GameMasterController();
        controller.loadSessions = vi.fn(() => Promise.resolve());

        await controller.removeParticipantFromSession(
            { id: 'session-gm-1', name: 'Alpha Session' },
            { id: 'participant-gm-1', display_name: 'Morgan', role: 'blue_facilitator' }
        );

        expect(mockConfirmModal).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Remove Participant',
            confirmLabel: 'Remove Participant',
            variant: 'danger'
        }));
        expect(mockDatabase.removeSessionParticipant).toHaveBeenCalledWith('session-gm-1', 'participant-gm-1');
        expect(controller.loadSessions).toHaveBeenCalledTimes(1);
        expect(mockShowLoader).toHaveBeenCalledWith({ message: 'Removing Morgan...' });
        expect(mockShowToast).toHaveBeenCalledWith('Morgan was removed from Alpha Session.', { type: 'success' });
        expect(mockHideLoader).toHaveBeenCalled();
    });

    it('disables all exports until a session is selected regardless of the default research mode', async () => {
        const { GameMasterController } = await loadGameMasterModule();
        const controller = new GameMasterController();

        controller.updateExportAvailability(null);

        expect(elements.exportSelectionState.textContent).toBe('Select a session before exporting JSON, CSV, or research archive data.');
        expect(elements.exportJsonBtn.disabled).toBe(true);
        expect(elements.exportActionsCsvBtn.disabled).toBe(true);
        expect(elements.exportRequestsCsvBtn.disabled).toBe(true);
        expect(elements.exportTimelineCsvBtn.disabled).toBe(true);
        expect(elements.exportParticipantsCsvBtn.disabled).toBe(true);
        expect(elements.exportResearchArchiveBtn.disabled).toBe(true);
        expect(elements.printResearchReportBtn.disabled).toBe(true);
    });

    it('enables research exports by default and still locks them when standard mode is explicit', async () => {
        const { GameMasterController } = await loadGameMasterModule();
        const controller = new GameMasterController();

        controller.updateExportAvailability({
            session: { id: 'session-gm-1', name: 'Alpha Session' }
        });

        expect(elements.exportJsonBtn.disabled).toBe(false);
        expect(elements.exportParticipantsCsvBtn.disabled).toBe(false);
        expect(elements.exportResearchArchiveBtn.disabled).toBe(false);
        expect(elements.printResearchReportBtn.disabled).toBe(false);

        controller.researchCaptureMode = 'standard';
        controller.updateExportAvailability({
            session: { id: 'session-gm-1', name: 'Alpha Session' }
        });

        expect(elements.exportResearchArchiveBtn.disabled).toBe(true);
        expect(elements.printResearchReportBtn.disabled).toBe(true);
    });

    it('preserves fetched participants when the live participants store is still empty', async () => {
        mockParticipantsStore.getAll.mockReturnValueOnce([]);

        const { GameMasterController } = await loadGameMasterModule();
        const controller = new GameMasterController();
        controller.currentSessionId = 'session-gm-1';

        const liveBundle = controller.buildSelectedLiveBundle({
            session: {
                id: 'session-gm-1',
                name: 'Alpha Session'
            },
            gameState: { move: 1, phase: 1 },
            participants: [{ id: 'participant-fallback-1', display_name: 'Taylor', role: 'viewer' }],
            actions: [],
            requests: [],
            timeline: []
        });

        expect(liveBundle.participants).toEqual([
            { id: 'participant-fallback-1', display_name: 'Taylor', role: 'viewer' }
        ]);
    });
});
