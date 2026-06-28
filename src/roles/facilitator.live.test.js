import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockSessionStore,
    mockSyncService,
    mockActionsStore,
    mockRequestsStore,
    mockTimelineStore,
    mockCommunicationsStore,
    mockGameStateStore,
    mockDatabase
} = vi.hoisted(() => ({
    mockSessionStore: {
        getSessionId: vi.fn(() => 'session-fac-1'),
        getSessionParticipantId: vi.fn(() => 'seat-fac-1'),
        getRole: vi.fn(() => 'blue_facilitator'),
        getSessionData: vi.fn(() => ({
            role: 'blue_facilitator',
            team: 'blue'
        })),
        getClientId: vi.fn(() => 'client-fac-1')
    },
    mockSyncService: {
        initialize: vi.fn()
    },
    mockActionsStore: {
        subscribe: vi.fn(() => vi.fn()),
        getByTeam: vi.fn(() => [])
    },
    mockRequestsStore: {
        subscribe: vi.fn(() => vi.fn()),
        getByTeam: vi.fn(() => [])
    },
    mockTimelineStore: {
        subscribe: vi.fn(() => vi.fn()),
        getAll: vi.fn(() => [])
    },
    mockCommunicationsStore: {
        subscribe: vi.fn(() => vi.fn()),
        getAll: vi.fn(() => [])
    },
    mockGameStateStore: {
        getState: vi.fn(() => ({
            move: 1,
            phase: 1,
            timer_seconds: 5400,
            timer_running: false
        }))
    },
    mockDatabase: {
        fetchActions: vi.fn(),
        fetchRequests: vi.fn(),
        fetchCommunications: vi.fn(),
        fetchTimeline: vi.fn()
    }
}));

vi.mock('../stores/session.js', () => ({
    sessionStore: mockSessionStore
}));

vi.mock('../services/sync.js', () => ({
    syncService: mockSyncService
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

vi.mock('../stores/communications.js', () => ({
    communicationsStore: mockCommunicationsStore
}));

vi.mock('../stores/gameState.js', () => ({
    gameStateStore: mockGameStateStore
}));

vi.mock('../services/database.js', () => ({
    database: mockDatabase
}));

vi.mock('../components/ui/Toast.js', () => ({
    showToast: vi.fn()
}));

vi.mock('../components/ui/Loader.js', () => ({
    showLoader: vi.fn(() => ({})),
    hideLoader: vi.fn()
}));

vi.mock('../components/ui/Modal.js', () => ({
    showModal: vi.fn(),
    confirmModal: vi.fn()
}));

vi.mock('../utils/logger.js', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

vi.mock('../core/teamContext.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getRoleRoute: vi.fn(() => ''),
        getTeamResponseTargets: vi.fn(() => new Set(['all', 'blue', 'blue_facilitator', 'blue_scribe'])),
        resolveTeamContext: vi.fn(() => ({
            teamId: 'blue',
            teamLabel: 'Blue Team',
            facilitatorRole: 'blue_facilitator',
            scribeRole: 'blue_scribe',
            facilitatorLabel: 'Blue Team Scribe',
            scribeLabel: 'Blue Team Facilitator',
            observerLabel: 'Blue Observer'
        }))
    };
});

function createElement() {
    return {
        hidden: false,
        innerHTML: '',
        textContent: '',
        value: '',
        style: {},
        dataset: {},
        classList: {
            add: vi.fn(),
            remove: vi.fn(),
            toggle: vi.fn()
        },
        toggleAttribute: vi.fn(),
        addEventListener: vi.fn(),
        querySelectorAll: vi.fn(() => [])
    };
}

async function loadFacilitatorModule() {
    globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
    vi.resetModules();
    return import('./facilitator.js');
}

describe('Facilitator live store wiring', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const elements = Object.fromEntries([
            'sessionRoleLabel',
            'facilitatorModeNotice',
            'captureNavItem',
            'captureSection',
            'newActionBtn',
            'newRfiBtn',
            'captureForm',
            'actionsBadge',
            'actionsList',
            'rfiBadge',
            'rfiList',
            'responsesBadge',
            'responsesList',
            'receivedProposalsBadge',
            'tribeStreetJournalBadge',
            'tribeStreetJournalEmbed',
            'tribeStreetJournalList',
            'verbaAiBadge',
            'verbaAiList',
            'timelineList'
        ].map((id) => [id, createElement()]));

        const headerTitle = createElement();

        global.document = {
            body: { dataset: {} },
            getElementById(id) {
                return elements[id] || null;
            },
            querySelector(selector) {
                return selector === '.header-title' ? headerTitle : null;
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

    it('boots sync and subscribes to stores instead of loading page data directly', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        await controller.init();

        expect(mockSyncService.initialize).toHaveBeenCalledWith('session-fac-1', {
            participantId: 'seat-fac-1'
        });
        expect(mockActionsStore.subscribe).toHaveBeenCalledTimes(1);
        expect(mockRequestsStore.subscribe).toHaveBeenCalledTimes(1);
        expect(mockCommunicationsStore.subscribe).toHaveBeenCalledTimes(1);
        expect(mockTimelineStore.subscribe).toHaveBeenCalledTimes(1);
        expect(mockDatabase.fetchActions).not.toHaveBeenCalled();
        expect(mockDatabase.fetchRequests).not.toHaveBeenCalled();
        expect(mockDatabase.fetchCommunications).not.toHaveBeenCalled();
        expect(mockDatabase.fetchTimeline).not.toHaveBeenCalled();
        expect(controller.storeUnsubscribers).toHaveLength(4);
    });
});
