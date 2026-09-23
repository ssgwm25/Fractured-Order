import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    channelHandlers,
    mockRealtimeService,
    mockGameStateStore,
    mockActionsStore,
    mockRequestsStore,
    mockTimelineStore,
    mockParticipantsStore,
    mockCommunicationsStore,
    mockSessionStore
} = vi.hoisted(() => {
    const handlers = new Map();

    return {
        channelHandlers: handlers,
        mockRealtimeService: {
            initialize: vi.fn(),
            on: vi.fn((channelType, handler) => {
                handlers.set(channelType, handler);
                return vi.fn();
            }),
            onAll: vi.fn((handler) => {
                handlers.set('all', handler);
                return vi.fn();
            }),
            getStatus: vi.fn(() => ({ connected: true })),
            reset: vi.fn()
        },
        mockGameStateStore: {
            initialize: vi.fn(),
            updateFromServer: vi.fn(),
            reset: vi.fn()
        },
        mockActionsStore: {
            initialize: vi.fn(),
            loadActions: vi.fn(),
            reconcileActions: vi.fn(),
            updateFromServer: vi.fn(),
            reset: vi.fn()
        },
        mockRequestsStore: {
            initialize: vi.fn(),
            loadRequests: vi.fn(),
            reconcileRequests: vi.fn(),
            updateFromServer: vi.fn(),
            reset: vi.fn()
        },
        mockTimelineStore: {
            initialize: vi.fn(),
            loadEvents: vi.fn(),
            updateFromServer: vi.fn(),
            reset: vi.fn()
        },
        mockParticipantsStore: {
            initialize: vi.fn(),
            loadParticipants: vi.fn(),
            updateFromServer: vi.fn(),
            reset: vi.fn()
        },
        mockCommunicationsStore: {
            initialize: vi.fn(),
            loadCommunications: vi.fn(),
            reconcileCommunications: vi.fn(),
            updateFromServer: vi.fn(),
            reset: vi.fn()
        },
        mockSessionStore: {
            getSessionParticipantId: vi.fn(() => 'seat-session-store'),
            getSessionData: vi.fn(() => ({ participantId: 'seat-legacy' }))
        }
    };
});

vi.mock('./realtime.js', () => ({
    CHANNELS: {
        GAME_STATE: 'game_state',
        ACTIONS: 'actions',
        REQUESTS: 'requests',
        TIMELINE: 'timeline',
        PARTICIPANTS: 'session_participants',
        COMMUNICATIONS: 'communications'
    },
    realtimeService: mockRealtimeService
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

vi.mock('../stores/communications.js', () => ({
    communicationsStore: mockCommunicationsStore
}));

vi.mock('../stores/session.js', () => ({
    sessionStore: mockSessionStore
}));

vi.mock('../utils/logger.js', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

async function loadSyncModule() {
    vi.resetModules();
    return import('./sync.js');
}

describe('syncService live bootstrap', () => {
    it.each(['unified_v1', 'regional_pairs_v1', 'shared_facilitator_v1'])('GC08 clears protected stores when a %s seat is invalidated', async (greenSeatModel) => {
        const { syncService } = await loadSyncModule();
        const { setConfirmedSeat, clearSeatLocalState } = await import('../core/seatContext.js');
        const seat = { sessionId: 'removed-session', participantId: 'seat',
            role: greenSeatModel === 'unified_v1' ? 'green_facilitator' : greenSeatModel === 'shared_facilitator_v1' ? 'green_shared_facilitator' : 'green_europe_scribe',
            topology: greenSeatModel === 'unified_v1' ? 1 : 2, greenSeatModel, teamId: 'green',
            delegationId: greenSeatModel === 'regional_pairs_v1' ? 'europe' : null };
        setConfirmedSeat(seat);
        await syncService.initialize(seat.sessionId);
        clearSeatLocalState(seat);
        expect(mockActionsStore.reset).toHaveBeenCalled();
        expect(mockRequestsStore.reset).toHaveBeenCalled();
        expect(mockCommunicationsStore.reset).toHaveBeenCalled();
        expect(mockTimelineStore.reset).toHaveBeenCalled();
        expect(syncService.sessionId).toBeNull();
        setConfirmedSeat(null);
    });

    it('GC08 cannot finish initialization after teardown while participant restoration is pending', async () => {
        let finish;
        mockParticipantsStore.initialize.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
        const { syncService } = await loadSyncModule();
        const pending = syncService.initialize('old-session');
        await syncService.reset();
        finish([]);
        await pending;
        expect(mockActionsStore.initialize).not.toHaveBeenCalled();
        expect(syncService.initialized).toBe(false);
    });
    beforeEach(() => {
        vi.clearAllMocks();
        channelHandlers.clear();
        mockGameStateStore.initialize.mockResolvedValue();
        mockActionsStore.initialize.mockResolvedValue();
        mockRequestsStore.initialize.mockResolvedValue();
        mockTimelineStore.initialize.mockResolvedValue();
        mockParticipantsStore.initialize.mockResolvedValue([]);
        mockCommunicationsStore.initialize.mockResolvedValue();
        mockActionsStore.reconcileActions.mockResolvedValue([]);
        mockRequestsStore.reconcileRequests.mockResolvedValue([]);
        mockCommunicationsStore.reconcileCommunications.mockResolvedValue([]);
        global.window = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetModules();
        delete global.window;
    });

    it('initializes all live stores once the session and participant seat are known', async () => {
        const { syncService } = await loadSyncModule();

        await syncService.initialize('session-live-1', {
            participantId: 'seat-explicit-1'
        });

        expect(mockGameStateStore.initialize).toHaveBeenCalledWith('session-live-1');
        expect(mockActionsStore.initialize).toHaveBeenCalledWith('session-live-1');
        expect(mockRequestsStore.initialize).toHaveBeenCalledWith('session-live-1');
        expect(mockTimelineStore.initialize).toHaveBeenCalledWith('session-live-1');
        expect(mockParticipantsStore.initialize).toHaveBeenCalledWith('session-live-1', 'seat-explicit-1');
        expect(mockCommunicationsStore.initialize).toHaveBeenCalledWith('session-live-1');
        expect(mockRealtimeService.initialize).toHaveBeenCalledWith('session-live-1');
        expect(mockCommunicationsStore.reconcileCommunications).toHaveBeenCalledTimes(1);
        expect(mockActionsStore.reconcileActions).toHaveBeenCalledTimes(1);
        expect(mockRequestsStore.reconcileRequests).toHaveBeenCalledTimes(1);
        expect(
            mockRealtimeService.on.mock.invocationCallOrder.at(-1)
        ).toBeLessThan(
            mockCommunicationsStore.reconcileCommunications.mock.invocationCallOrder[0]
        );
    });

    it('restores participant access before loading the remaining session stores', async () => {
        let resolveParticipants;

        mockParticipantsStore.initialize.mockImplementation(
            () => new Promise((resolve) => {
                resolveParticipants = resolve;
            })
        );

        const { syncService } = await loadSyncModule();
        const initializationPromise = syncService.initialize('session-live-3', {
            participantId: 'seat-reload-1'
        });

        await Promise.resolve();

        expect(mockParticipantsStore.initialize).toHaveBeenCalledWith('session-live-3', 'seat-reload-1');
        expect(mockGameStateStore.initialize).not.toHaveBeenCalled();
        expect(mockActionsStore.initialize).not.toHaveBeenCalled();
        expect(mockRequestsStore.initialize).not.toHaveBeenCalled();
        expect(mockTimelineStore.initialize).not.toHaveBeenCalled();
        expect(mockCommunicationsStore.initialize).not.toHaveBeenCalled();

        resolveParticipants([]);
        await initializationPromise;

        expect(mockGameStateStore.initialize).toHaveBeenCalledWith('session-live-3');
        expect(mockActionsStore.initialize).toHaveBeenCalledWith('session-live-3');
        expect(mockRequestsStore.initialize).toHaveBeenCalledWith('session-live-3');
        expect(mockTimelineStore.initialize).toHaveBeenCalledWith('session-live-3');
        expect(mockCommunicationsStore.initialize).toHaveBeenCalledWith('session-live-3');
    });

    it('does not report synced until all realtime subscriptions are ready', async () => {
        mockRealtimeService.getStatus.mockReturnValue({ connected: false });
        const { syncService, SYNC_STATUS } = await loadSyncModule();

        await syncService.initialize('session-awaiting-realtime');

        expect(syncService.getStatus()).toBe(SYNC_STATUS.SYNCING);
        mockRealtimeService.getStatus.mockReturnValue({ connected: true });
        channelHandlers.get('all')('subscribed', {
            channelType: 'communications',
            reconnected: false
        });
        expect(syncService.getStatus()).toBe(SYNC_STATUS.SYNCED);
    });

    it('forwards realtime payloads into the corresponding stores', async () => {
        const { syncService } = await loadSyncModule();

        await syncService.initialize('session-live-2');

        channelHandlers.get('game_state')('UPDATE', {
            new: { move: 2, phase: 3 }
        });
        channelHandlers.get('actions')('INSERT', {
            new: { id: 'action-1' }
        });
        channelHandlers.get('requests')('UPDATE', {
            new: { id: 'request-1' }
        });
        channelHandlers.get('timeline')('INSERT', {
            new: { id: 'timeline-1' }
        });
        channelHandlers.get('session_participants')('UPDATE', {
            new: { id: 'participant-1' }
        });
        channelHandlers.get('communications')('INSERT', {
            new: { id: 'communication-1' }
        });

        expect(mockGameStateStore.updateFromServer).toHaveBeenCalledWith({ move: 2, phase: 3 });
        expect(mockActionsStore.updateFromServer).toHaveBeenCalledWith('INSERT', { id: 'action-1' });
        expect(mockRequestsStore.updateFromServer).toHaveBeenCalledWith('UPDATE', { id: 'request-1' });
        expect(mockTimelineStore.updateFromServer).toHaveBeenCalledWith('INSERT', { id: 'timeline-1' });
        expect(mockParticipantsStore.updateFromServer).toHaveBeenCalledWith('UPDATE', { id: 'participant-1' });
        expect(mockCommunicationsStore.updateFromServer).toHaveBeenCalledWith('INSERT', { id: 'communication-1' });
    });

    it('reconciles every durable store after a realtime channel reconnects', async () => {
        vi.useFakeTimers();
        mockGameStateStore.initialize.mockResolvedValue();
        mockActionsStore.reconcileActions.mockResolvedValue([]);
        mockRequestsStore.reconcileRequests.mockResolvedValue([]);
        mockTimelineStore.loadEvents.mockResolvedValue([]);
        mockParticipantsStore.loadParticipants.mockResolvedValue([]);
        mockCommunicationsStore.reconcileCommunications.mockResolvedValue([]);

        const { syncService, SYNC_STATUS } = await loadSyncModule();
        await syncService.initialize('session-live-reconnect');

        channelHandlers.get('all')('reconnected', {
            channelType: 'communications'
        });

        expect(syncService.getStatus()).toBe(SYNC_STATUS.SYNCING);
        await vi.advanceTimersByTimeAsync(500);

        expect(mockGameStateStore.initialize).toHaveBeenLastCalledWith('session-live-reconnect');
        expect(mockActionsStore.reconcileActions).toHaveBeenCalledTimes(2);
        expect(mockRequestsStore.reconcileRequests).toHaveBeenCalledTimes(2);
        expect(mockTimelineStore.loadEvents).toHaveBeenCalledTimes(1);
        expect(mockParticipantsStore.loadParticipants).toHaveBeenCalledWith({ tolerateError: false });
        expect(mockCommunicationsStore.reconcileCommunications).toHaveBeenCalledTimes(2);
        expect(syncService.getStatus()).toBe(SYNC_STATUS.SYNCED);
    });
});
