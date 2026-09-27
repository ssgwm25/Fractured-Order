import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/supabase.js', () => ({
    supabase: {
        channel: () => {
            throw new Error('default client must not be used in these tests');
        }
    }
}));

import {
    PLI_REALTIME_DEBOUNCE_MS,
    PLI_REALTIME_TABLES,
    pliRealtimeChannelName,
    subscribePliSmeChanges
} from './pliRealtime.js';

function createFakeClient() {
    const listeners = [];
    let subscribeCallback = null;
    const channel = {
        on: vi.fn((event, spec, handler) => {
            listeners.push({ event, spec, handler });
            return channel;
        }),
        subscribe: vi.fn((callback) => {
            subscribeCallback = callback;
            return channel;
        })
    };
    const client = {
        channel: vi.fn(() => channel),
        removeChannel: vi.fn(async () => 'ok')
    };
    return {
        client,
        channel,
        listeners,
        emit(table) {
            listeners
                .filter((listener) => listener.spec.table === table)
                .forEach((listener) => listener.handler({ eventType: 'INSERT', table }));
        },
        status(status, error) {
            subscribeCallback?.(status, error);
        }
    };
}

describe('subscribePliSmeChanges', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('opens one channel with a session-filtered listener per PLI table', () => {
        const fake = createFakeClient();
        const onChange = vi.fn();

        subscribePliSmeChanges({ sessionId: 'sess-1', onChange, client: fake.client });

        expect(fake.client.channel).toHaveBeenCalledTimes(1);
        expect(fake.client.channel).toHaveBeenCalledWith(pliRealtimeChannelName('sess-1'));
        expect(fake.client.channel.mock.calls[0][0]).toBe('pli_sme:sess-1');
        expect(fake.listeners.map((listener) => listener.spec.table)).toEqual([...PLI_REALTIME_TABLES]);
        expect(PLI_REALTIME_TABLES).toEqual(['pli_adjudications', 'sme_handoffs', 'sme_pli_packets']);
        for (const listener of fake.listeners) {
            expect(listener.event).toBe('postgres_changes');
            expect(listener.spec).toMatchObject({
                event: '*',
                schema: 'public',
                filter: 'session_id=eq.sess-1'
            });
        }
        expect(fake.channel.subscribe).toHaveBeenCalledTimes(1);
    });

    it('debounces a burst of row changes into one onChange call', () => {
        const fake = createFakeClient();
        const onChange = vi.fn();
        subscribePliSmeChanges({ sessionId: 'sess-1', onChange, client: fake.client });

        fake.emit('pli_adjudications');
        fake.emit('pli_adjudications');
        fake.emit('sme_handoffs');
        vi.advanceTimersByTime(PLI_REALTIME_DEBOUNCE_MS - 1);
        expect(onChange).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith({
            tables: ['pli_adjudications', 'sme_handoffs'],
            events: 3
        });

        fake.emit('sme_pli_packets');
        vi.advanceTimersByTime(PLI_REALTIME_DEBOUNCE_MS);
        expect(onChange).toHaveBeenCalledTimes(2);
        expect(onChange.mock.calls[1][0]).toEqual({ tables: ['sme_pli_packets'], events: 1 });
    });

    it('unsubscribe removes the channel and drops pending changes', () => {
        const fake = createFakeClient();
        const onChange = vi.fn();
        const unsubscribe = subscribePliSmeChanges({ sessionId: 'sess-1', onChange, client: fake.client });

        fake.emit('pli_adjudications');
        unsubscribe();
        vi.advanceTimersByTime(PLI_REALTIME_DEBOUNCE_MS * 2);

        expect(onChange).not.toHaveBeenCalled();
        expect(fake.client.removeChannel).toHaveBeenCalledTimes(1);
        expect(fake.client.removeChannel).toHaveBeenCalledWith(fake.channel);

        unsubscribe();
        expect(fake.client.removeChannel).toHaveBeenCalledTimes(1);
    });

    it('reports subscription status and falls back to a no-op when the client is unavailable', () => {
        const fake = createFakeClient();
        const onStatus = vi.fn();
        subscribePliSmeChanges({ sessionId: 'sess-1', onChange: vi.fn(), onStatus, client: fake.client });
        fake.status('SUBSCRIBED');
        fake.status('CHANNEL_ERROR', new Error('boom'));
        expect(onStatus).toHaveBeenNthCalledWith(1, 'SUBSCRIBED', undefined);
        expect(onStatus).toHaveBeenNthCalledWith(2, 'CHANNEL_ERROR', expect.any(Error));

        const unavailable = {
            channel: () => {
                throw new Error('Backend configuration required');
            }
        };
        const unsubscribe = subscribePliSmeChanges({ sessionId: 'sess-1', onChange: vi.fn(), client: unavailable });
        expect(typeof unsubscribe).toBe('function');
        expect(() => unsubscribe()).not.toThrow();

        expect(typeof subscribePliSmeChanges({ sessionId: '', onChange: vi.fn(), client: fake.client })).toBe('function');
        expect(fake.client.channel).toHaveBeenCalledTimes(1);
    });
});
