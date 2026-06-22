import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockDatabase,
    mockSessionStore
} = vi.hoisted(() => ({
    mockDatabase: {
        getSessionParticipants: vi.fn(),
        updateHeartbeat: vi.fn(),
        disconnectParticipantKeepalive: vi.fn(),
        disconnectParticipant: vi.fn()
    },
    mockSessionStore: {
        getSessionParticipantId: vi.fn(() => 'seat-participant-1')
    }
}));

vi.mock('../services/database.js', () => ({
    database: mockDatabase
}));

vi.mock('./session.js', () => ({
    sessionStore: mockSessionStore
}));

vi.mock('../core/config.js', () => ({
    CONFIG: {
        HEARTBEAT_INTERVAL_MS: 5000,
        PRESENCE_CLEANUP_INTERVAL_MS: 60000,
        ROLE_LIMITS: {}
    },
    getRoleLimit: vi.fn(() => 1),
    isHeartbeatFresh: vi.fn(() => true)
}));

vi.mock('../utils/logger.js', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

async function loadParticipantsModule() {
    vi.resetModules();
    return import('./participants.js');
}

describe('ParticipantsStore resilience', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        global.window = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        };
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.resetModules();
        delete global.window;
    });

    it('starts heartbeats even when the participant roster snapshot fails to load', async () => {
        mockDatabase.getSessionParticipants.mockRejectedValue(new Error('participant roster unavailable'));
        mockDatabase.updateHeartbeat.mockResolvedValue({
            id: 'seat-participant-1',
            heartbeat_at: '2026-04-08T15:00:00.000Z',
            last_seen: '2026-04-08T15:00:00.000Z',
            is_active: true
        });

        const { participantsStore } = await loadParticipantsModule();

        await expect(
            participantsStore.initialize('session-1', 'seat-participant-1')
        ).resolves.toEqual([]);

        await Promise.resolve();
        await Promise.resolve();

        expect(mockDatabase.getSessionParticipants).toHaveBeenCalledWith('session-1');
        expect(mockDatabase.updateHeartbeat).toHaveBeenCalledWith('session-1', 'seat-participant-1');
        expect(participantsStore.initialized).toBe(true);
        expect(participantsStore.currentParticipantId).toBe('seat-participant-1');
        expect(global.window.addEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));

        participantsStore.reset();
    });

    it('preserves participant names when realtime updates omit joined participant data', async () => {
        mockDatabase.getSessionParticipants.mockResolvedValue([{
            id: 'seat-participant-1',
            session_id: 'session-1',
            participant_id: 'participant-1',
            role: 'blue_facilitator',
            display_name: 'Morgan',
            client_id: 'client-1',
            is_active: true,
            heartbeat_at: '2026-04-08T15:00:00.000Z'
        }]);

        const { participantsStore } = await loadParticipantsModule();
        await participantsStore.initialize('session-1');

        participantsStore.updateFromServer('UPDATE', {
            id: 'seat-participant-1',
            session_id: 'session-1',
            participant_id: 'participant-1',
            role: 'blue_facilitator',
            is_active: true,
            heartbeat_at: '2026-04-08T15:01:00.000Z'
        });

        expect(participantsStore.getAll()).toEqual([
            expect.objectContaining({
                id: 'seat-participant-1',
                display_name: 'Morgan',
                heartbeat_at: '2026-04-08T15:01:00.000Z'
            })
        ]);

        participantsStore.reset();
    });

    it('keeps inactive participant seats in the loaded roster history', async () => {
        mockDatabase.getSessionParticipants.mockResolvedValue([
            {
                id: 'seat-participant-1',
                session_id: 'session-1',
                participant_id: 'participant-1',
                role: 'blue_facilitator',
                display_name: 'Morgan',
                client_id: 'client-1',
                is_active: true,
                heartbeat_at: '2026-04-08T15:00:00.000Z'
            },
            {
                id: 'seat-participant-2',
                session_id: 'session-1',
                participant_id: 'participant-2',
                role: 'viewer',
                display_name: 'Taylor',
                client_id: 'client-2',
                is_active: false,
                heartbeat_at: '2026-04-08T14:55:00.000Z'
            }
        ]);

        const { participantsStore } = await loadParticipantsModule();
        await participantsStore.initialize('session-1');

        expect(participantsStore.getAll()).toEqual([
            expect.objectContaining({ id: 'seat-participant-1', is_active: true }),
            expect.objectContaining({ id: 'seat-participant-2', is_active: false })
        ]);
        expect(participantsStore.getActive()).toEqual([
            expect.objectContaining({ id: 'seat-participant-1', is_active: true })
        ]);

        participantsStore.reset();
    });

    it('refreshes the roster when a realtime participant insert arrives without a display name', async () => {
        mockDatabase.getSessionParticipants
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{
                id: 'seat-participant-2',
                session_id: 'session-1',
                participant_id: 'participant-2',
                role: 'viewer',
                display_name: 'Taylor',
                client_id: 'client-2',
                is_active: true,
                heartbeat_at: '2026-04-08T15:02:00.000Z'
            }]);

        const { participantsStore } = await loadParticipantsModule();
        await participantsStore.initialize('session-1');

        participantsStore.updateFromServer('INSERT', {
            id: 'seat-participant-2',
            session_id: 'session-1',
            participant_id: 'participant-2',
            role: 'viewer',
            is_active: true,
            heartbeat_at: '2026-04-08T15:02:00.000Z'
        });

        await participantsStore.pendingRosterRefresh;

        expect(mockDatabase.getSessionParticipants).toHaveBeenCalledTimes(2);
        expect(participantsStore.getAll()).toEqual([
            expect.objectContaining({
                id: 'seat-participant-2',
                display_name: 'Taylor'
            })
        ]);

        participantsStore.reset();
    });
});
