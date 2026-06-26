import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockDatabase
} = vi.hoisted(() => ({
    mockDatabase: {
        getGameState: vi.fn(),
        createGameState: vi.fn(),
        updateGameState: vi.fn()
    }
}));

vi.mock('../services/database.js', () => ({
    database: mockDatabase
}));

vi.mock('../core/config.js', () => ({
    CONFIG: {
        DEFAULT_TIMER_SECONDS: 5400
    }
}));

vi.mock('../core/enums.js', () => ({
    ENUMS: {},
    getPhaseLabel: vi.fn((phase) => `Phase ${phase}`)
}));

vi.mock('../utils/logger.js', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

async function loadGameStateModule() {
    vi.resetModules();
    return import('./gameState.js');
}

function buildGameState(overrides = {}) {
    return {
        id: 'game-state-1',
        session_id: 'session-live-1',
        move: 1,
        phase: 1,
        timer_seconds: 5400,
        timer_allocations: {
            strategic_orientation: 5400,
            move_1: 5400,
            move_2: 5400,
            move_3: 5400
        },
        timer_running: false,
        timer_last_update: null,
        status: 'active',
        updated_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        ...overrides
    };
}

describe('GameStateStore resilience', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-08T16:30:00.000Z'));
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetModules();
    });

    it('uses local defaults when the backend session is missing a game_state row', async () => {
        mockDatabase.getGameState.mockRejectedValue({
            name: 'NotFoundError',
            code: 'NOT_FOUND',
            entity: 'GameState',
            entityId: 'session-live-1',
            message: 'GameState not found: session-live-1'
        });

        const { gameStateStore } = await loadGameStateModule();

        await expect(gameStateStore.initialize('session-live-1')).resolves.toEqual(
            expect.objectContaining({
                id: null,
                session_id: 'session-live-1',
                move: 1,
                phase: 1,
                timer_seconds: 5400,
                timer_allocations: {
                    strategic_orientation: 5400,
                    move_1: 5400,
                    move_2: 5400,
                    move_3: 5400
                },
                timer_running: false,
                status: 'active'
            })
        );

        expect(mockDatabase.getGameState).toHaveBeenCalledWith('session-live-1');
        expect(mockDatabase.createGameState).not.toHaveBeenCalled();
        expect(gameStateStore.initialized).toBe(true);
        expect(gameStateStore.getCurrentMove()).toBe(1);
        expect(gameStateStore.getCurrentPhase()).toBe(1);

        gameStateStore.reset();
    });

    it('persists normalized timer allocations for each game-state mark', async () => {
        let persistedState = buildGameState({
            session_id: 'session-live-allocations'
        });

        mockDatabase.getGameState.mockResolvedValue(persistedState);
        mockDatabase.updateGameState.mockImplementation(async (_sessionId, updates) => {
            persistedState = buildGameState({
                ...persistedState,
                ...updates,
                updated_at: new Date().toISOString(),
                last_updated: new Date().toISOString()
            });
            return persistedState;
        });

        const { gameStateStore } = await loadGameStateModule();

        await gameStateStore.initialize('session-live-allocations');
        await gameStateStore.setTimerAllocations({
            strategic_orientation: 1800,
            move_1: 2700,
            move_2: 3600,
            move_3: 4500,
            ignored: 999
        });

        expect(mockDatabase.updateGameState).toHaveBeenLastCalledWith('session-live-allocations', {
            timer_allocations: {
                strategic_orientation: 1800,
                move_1: 2700,
                move_2: 3600,
                move_3: 4500
            }
        });
        expect(gameStateStore.getTimerAllocations()).toEqual({
            strategic_orientation: 1800,
            move_1: 2700,
            move_2: 3600,
            move_3: 4500
        });

        gameStateStore.reset();
    });

    it('resets the timer to the target move allocation when advancing moves', async () => {
        let persistedState = buildGameState({
            session_id: 'session-live-move-allocation',
            timer_seconds: 120,
            timer_allocations: {
                strategic_orientation: 1800,
                move_1: 2700,
                move_2: 3600,
                move_3: 4500
            }
        });

        mockDatabase.getGameState.mockResolvedValue(persistedState);
        mockDatabase.updateGameState.mockImplementation(async (_sessionId, updates) => {
            persistedState = buildGameState({
                ...persistedState,
                ...updates,
                updated_at: new Date().toISOString(),
                last_updated: new Date().toISOString()
            });
            return persistedState;
        });

        const { gameStateStore } = await loadGameStateModule();

        await gameStateStore.initialize('session-live-move-allocation');
        await gameStateStore.advanceMove();

        expect(mockDatabase.updateGameState).toHaveBeenLastCalledWith('session-live-move-allocation', {
            move: 2,
            phase: 1,
            timer_seconds: 3600,
            timer_running: false,
            timer_last_update: '2026-04-08T16:30:00.000Z'
        });

        expect(gameStateStore.getCurrentMove()).toBe(2);
        expect(gameStateStore.getTimerSeconds()).toBe(3600);
        expect(gameStateStore.isTimerRunning()).toBe(false);

        gameStateStore.reset();
    });

    it('still surfaces unexpected initialization failures', async () => {
        mockDatabase.getGameState.mockRejectedValue(new Error('backend unavailable'));

        const { gameStateStore } = await loadGameStateModule();

        await expect(gameStateStore.initialize('session-live-2')).rejects.toThrow('backend unavailable');
        expect(gameStateStore.initialized).toBe(false);
    });

    it('preserves a finished timer at zero seconds instead of reverting to the default duration', async () => {
        mockDatabase.getGameState.mockResolvedValue(buildGameState({
            session_id: 'session-live-zero',
            timer_seconds: 0,
            timer_running: false
        }));

        const { gameStateStore } = await loadGameStateModule();

        await gameStateStore.initialize('session-live-zero');

        expect(gameStateStore.getTimerSeconds()).toBe(0);
        expect(gameStateStore.isTimerRunning()).toBe(false);

        gameStateStore.reset();
    });

    it('persists the current countdown when pausing a running timer', async () => {
        let persistedState = buildGameState({
            session_id: 'session-live-3'
        });

        mockDatabase.getGameState.mockResolvedValue(persistedState);
        mockDatabase.updateGameState.mockImplementation(async (_sessionId, updates) => {
            persistedState = buildGameState({
                ...persistedState,
                ...updates,
                updated_at: new Date().toISOString(),
                last_updated: new Date().toISOString()
            });
            return persistedState;
        });

        const { gameStateStore } = await loadGameStateModule();

        await gameStateStore.initialize('session-live-3');
        await gameStateStore.startTimer();
        vi.advanceTimersByTime(5000);

        expect(gameStateStore.getTimerSeconds()).toBe(5395);

        await gameStateStore.pauseTimer();

        expect(mockDatabase.updateGameState).toHaveBeenLastCalledWith('session-live-3', {
            timer_seconds: 5395,
            timer_running: false,
            timer_last_update: '2026-04-08T16:30:05.000Z'
        });
        expect(gameStateStore.getTimerSeconds()).toBe(5395);
        expect(gameStateStore.isTimerRunning()).toBe(false);

        gameStateStore.reset();
    });

    it('syncs a running timer without double-counting elapsed time', async () => {
        let persistedState = buildGameState({
            session_id: 'session-live-4'
        });

        mockDatabase.getGameState.mockResolvedValue(persistedState);
        mockDatabase.updateGameState.mockImplementation(async (_sessionId, updates) => {
            persistedState = buildGameState({
                ...persistedState,
                ...updates,
                updated_at: new Date().toISOString(),
                last_updated: new Date().toISOString()
            });
            return persistedState;
        });

        const { gameStateStore } = await loadGameStateModule();

        await gameStateStore.initialize('session-live-4');
        await gameStateStore.startTimer();
        vi.advanceTimersByTime(5000);

        await gameStateStore.syncToServer();

        expect(mockDatabase.updateGameState).toHaveBeenLastCalledWith('session-live-4', {
            move: 1,
            phase: 1,
            timer_seconds: 5395,
            timer_running: true,
            timer_last_update: '2026-04-08T16:30:05.000Z',
            status: 'active'
        });
        expect(gameStateStore.getTimerSeconds()).toBe(5395);
        expect(gameStateStore.isTimerRunning()).toBe(true);

        gameStateStore.reset();
    });
});
