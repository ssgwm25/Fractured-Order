import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { channelRecords, mockSupabase } = vi.hoisted(() => {
    const records = [];

    return {
        channelRecords: records,
        mockSupabase: {
            channel: vi.fn((name) => {
                const record = {
                    name,
                    binding: null,
                    changeHandler: null,
                    statusHandler: null,
                    state: 'joining',
                    on: vi.fn(function on(_kind, binding, handler) {
                        this.binding = binding;
                        this.changeHandler = handler;
                        return this;
                    }),
                    subscribe: vi.fn(function subscribe(handler) {
                        this.statusHandler = handler;
                        return this;
                    })
                };
                records.push(record);
                return record;
            }),
            removeChannel: vi.fn(async () => undefined)
        }
    };
});

vi.mock('./supabase.js', () => ({
    supabase: mockSupabase
}));

vi.mock('../utils/logger.js', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

import { CHANNELS, RealtimeService } from './realtime.js';

const EXPECTED_TABLES = Object.freeze({
    [CHANNELS.GAME_STATE]: 'game_state',
    [CHANNELS.ACTIONS]: 'actions',
    [CHANNELS.REQUESTS]: 'requests',
    [CHANNELS.TIMELINE]: 'timeline',
    [CHANNELS.PARTICIPANTS]: 'session_participants',
    [CHANNELS.COMMUNICATIONS]: 'communications'
});

function latestRecord(channelType) {
    return channelRecords.filter((record) => record.name.startsWith(`${channelType}:`)).at(-1);
}

describe('RealtimeService subscription readiness and recovery', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        channelRecords.length = 0;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('subscribes to all six session-filtered tables and waits for every channel to be ready', async () => {
        const service = new RealtimeService();

        await service.initialize('session-realtime-1');

        expect(channelRecords).toHaveLength(6);
        for (const [channelType, table] of Object.entries(EXPECTED_TABLES)) {
            const record = latestRecord(channelType);
            expect(record.name).toBe(`${channelType}:session-realtime-1`);
            expect(record.binding).toEqual({
                event: '*',
                schema: 'public',
                table,
                filter: 'session_id=eq.session-realtime-1'
            });
        }
        expect(service.isConnected()).toBe(false);

        channelRecords.slice(0, -1).forEach((record) => record.statusHandler('SUBSCRIBED'));
        expect(service.isConnected()).toBe(false);

        channelRecords.at(-1).statusHandler('SUBSCRIBED');
        expect(service.isConnected()).toBe(true);
        expect(service.getStatus().channels).toEqual(Object.fromEntries(
            Object.values(CHANNELS).map((channelType) => [channelType, 'SUBSCRIBED'])
        ));
    });

    it('retries failed channels independently and reports recovery only after SUBSCRIBED', async () => {
        const service = new RealtimeService();
        const actionEvents = [];
        const communicationEvents = [];

        await service.initialize('session-realtime-2');
        channelRecords.forEach((record) => record.statusHandler('SUBSCRIBED'));
        service.on(CHANNELS.ACTIONS, (eventType) => actionEvents.push(eventType));
        service.on(CHANNELS.COMMUNICATIONS, (eventType) => communicationEvents.push(eventType));

        latestRecord(CHANNELS.ACTIONS).statusHandler('CHANNEL_ERROR');
        latestRecord(CHANNELS.COMMUNICATIONS).statusHandler('TIMED_OUT');

        expect(service.isConnected()).toBe(false);
        expect(service.reconnectAttempts.get(CHANNELS.ACTIONS)).toBe(1);
        expect(service.reconnectAttempts.get(CHANNELS.COMMUNICATIONS)).toBe(1);
        expect(actionEvents).toEqual(['error', 'reconnecting']);
        expect(communicationEvents).toEqual(['error', 'reconnecting']);

        await vi.advanceTimersByTimeAsync(2000);

        expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(2);
        expect(channelRecords).toHaveLength(8);
        expect(actionEvents).not.toContain('reconnected');
        expect(communicationEvents).not.toContain('reconnected');

        latestRecord(CHANNELS.ACTIONS).statusHandler('SUBSCRIBED');
        expect(actionEvents.at(-1)).toBe('reconnected');
        expect(service.isConnected()).toBe(false);

        latestRecord(CHANNELS.COMMUNICATIONS).statusHandler('SUBSCRIBED');
        expect(communicationEvents.at(-1)).toBe('reconnected');
        expect(service.isConnected()).toBe(true);
    });

    it('cancels pending reconnect work when the session is reset', async () => {
        const service = new RealtimeService();

        await service.initialize('session-realtime-3');
        latestRecord(CHANNELS.REQUESTS).statusHandler('CHANNEL_ERROR');
        expect(service.reconnectTimers.size).toBe(1);

        await service.reset();
        await vi.advanceTimersByTimeAsync(30000);

        expect(service.reconnectTimers.size).toBe(0);
        expect(channelRecords).toHaveLength(6);
        expect(service.getStatus().sessionId).toBeNull();
        expect(service.isConnected()).toBe(false);
    });
});
