import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockSessionStore, mockParticipantsStore } = vi.hoisted(() => ({
    mockSessionStore: {
        hasTrainingContext: vi.fn(() => true),
        getSessionData: vi.fn(() => ({ participantId: 'forged-live-seat' }))
    },
    mockParticipantsStore: {
        sendHeartbeat: vi.fn(),
        getAll: vi.fn(() => [])
    }
}));

vi.mock('../../stores/session.js', () => ({ sessionStore: mockSessionStore }));
vi.mock('../../stores/participants.js', () => ({ participantsStore: mockParticipantsStore }));
vi.mock('../../utils/logger.js', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

describe('training live service shutdown', () => {
    afterEach(() => {
        vi.resetModules();
        vi.unstubAllGlobals();
    });

    it('does not start heartbeat when a training context is present', async () => {
        vi.stubGlobal('window', {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        });
        vi.stubGlobal('navigator', { onLine: true });

        const { heartbeatService } = await import('../../services/heartbeat.js');
        heartbeatService.initialize();

        expect(globalThis.window.addEventListener).not.toHaveBeenCalled();
        expect(mockParticipantsStore.sendHeartbeat).not.toHaveBeenCalled();
        expect(heartbeatService.getStatus().isRunning).toBe(false);
    });
});
