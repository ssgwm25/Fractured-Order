import { afterEach, describe, expect, it, vi } from 'vitest';
import { channel } from 'node:diagnostics_channel';
import { observedJsonRequest, seatClaimWaitSql } from '../../scripts/gc07-live-transport.mjs';

afterEach(() => vi.useRealTimers());
const headers = new Headers({ 'sb-request-id': 'synthetic-request', 'cf-ray': 'synthetic-ray' });
const stalled = signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
const publish = (name, message) => channel(`undici:${name}`).publish(message);
const response = () => ({ status: 200, headers, text: async () => '{}' });

describe('GC07 participant transport evidence (no network)', () => {
    it('records response identifiers without retaining headers or credentials and cancels the slow probe', async () => {
        vi.useFakeTimers();
        const entry = {}, onSlow = vi.fn();
        const send = vi.fn(async () => ({ status: 200, headers, text: async () => '{"id":"synthetic"}' }));
        expect(await observedJsonRequest('https://example.test', { headers: { Authorization: 'Bearer secret' } }, entry,
            { send, onSlow })).toEqual({ status: 200, data: { id: 'synthetic' }, requestId: 'synthetic-request' });
        await vi.advanceTimersByTimeAsync(31000);
        expect(onSlow).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalledTimes(1);
        expect(entry.transport.stage).toBe('complete');
        expect(entry.transport.cfRay).toBe('synthetic-ray');
        expect(entry.transport.connection.requestEventsObserved).toBe(false);
        expect(entry.transport.connection.events).toEqual([]);
        expect(JSON.stringify(entry)).not.toContain('secret');
    });
    it('observes a header stall before the unchanged deadline, never retries, and waits for diagnostic settlement', async () => {
        vi.useFakeTimers();
        const entry = {}; let finishDiagnostic, settled = false;
        const onSlow = vi.fn(() => new Promise(resolve => { finishDiagnostic = resolve; }));
        const send = vi.fn((_, { signal }) => stalled(signal));
        const task = observedJsonRequest('https://example.test', {}, entry, { send, onSlow })
            .catch(error => { settled = true; return error; });
        await vi.advanceTimersByTimeAsync(20000);
        expect(onSlow).toHaveBeenCalledTimes(1);
        expect(onSlow.mock.calls[0][0].stage).toBe('awaiting_headers');
        expect(send.mock.calls[0][1].signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(10000);
        expect(send.mock.calls[0][1].signal.aborted).toBe(true);
        expect(settled).toBe(false);
        finishDiagnostic();
        expect((await task).name).toBe('TimeoutError');
        expect(entry.transport.elapsedMs).toBe(30000);
        expect(send).toHaveBeenCalledTimes(1);
    });
    it('distinguishes a body stall and retains its request ID when diagnostic collection fails', async () => {
        vi.useFakeTimers();
        const entry = {}, send = vi.fn(async (_, { signal }) => ({ status: 200, headers, text: () => stalled(signal) }));
        const task = observedJsonRequest('https://example.test', {}, entry,
            { send, onSlow: async () => { throw Error('Synthetic diagnostic outage'); } }).catch(error => error);
        await vi.advanceTimersByTimeAsync(30000);
        expect((await task).name).toBe('TimeoutError');
        expect(entry.transport.stage).toBe('reading_body');
        expect(entry.transport.requestId).toBe('synthetic-request');
        expect(entry.transport.diagnosticError.message).toBe('Synthetic diagnostic outage');
        expect(send).toHaveBeenCalledTimes(1);
    });
    it('retains a transport cause without treating failure as an authorization denial', async () => {
        const entry = {}, failure = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
        await expect(observedJsonRequest('https://example.test', {}, entry,
            { send: async () => { throw failure; } })).rejects.toBe(failure);
        expect(entry.transport.error.causeCode).toBe('ECONNRESET');
    });
    it('limits the read-only snapshot to wait metadata without returning SQL text or cancelling backends', () => {
        expect(seatClaimWaitSql).toMatch(/^SELECT /);
        expect(seatClaimWaitSql).toContain("position('claim_session_role_seat' in a.query)>0");
        expect(seatClaimWaitSql).toContain('LIMIT 20');
        expect(seatClaimWaitSql).toContain('pg_blocking_pids(a.pid)');
        expect(seatClaimWaitSql).not.toMatch(/SELECT\s+a\.\*|SELECT\s+a\.query\b|pg_(cancel|terminate)_backend|\b(UPDATE|DELETE|INSERT|ALTER|COMMIT)\b/i);
    });
});

describe('GC07 connection diagnostics (synthetic channels; no network)', () => {
    it('changes only the Connection header in explicitly selected close mode without mutating caller options', async () => {
        const options = { method: 'POST', redirect: 'error', body: '{"synthetic":true}',
            headers: { Authorization: 'Bearer SYNTHETIC_TOKEN', apikey: 'SYNTHETIC_KEY', Prefer: 'return=representation' } };
        const original = structuredClone(options), send = vi.fn(async () => response());
        const normal = {}, diagnostic = {};
        await observedJsonRequest('https://example.test', options, normal, { send });
        await observedJsonRequest('https://example.test', options, diagnostic, { send, closeConnection: true });
        expect(send.mock.calls[0][1].headers).toBe(options.headers);
        const sent = send.mock.calls[1][1];
        expect(sent).toMatchObject({ method: options.method, redirect: options.redirect, body: options.body });
        expect(sent.headers.get('connection')).toBe('close');
        for (const [name, value] of Object.entries(options.headers)) expect(sent.headers.get(name)).toBe(value);
        expect(options).toEqual(original);
        expect(normal.transport.connectionPolicy).toBe('default');
        expect(diagnostic.transport.connectionPolicy).toBe('close-after-response');
        expect(JSON.stringify(diagnostic)).not.toMatch(/SYNTHETIC_TOKEN|SYNTHETIC_KEY/);
        expect(send).toHaveBeenCalledTimes(2);
    });

    it('proves socket creation by matching identity and distinguishes reuse from an unobserved socket', async () => {
        const socket = {}, unrelatedSocket = {}, first = {}, reused = {}, unknown = {};
        let finish;
        const request = {};
        const task = observedJsonRequest('https://example.test', {}, first, { send: () => {
            publish('request:create', { request });
            return new Promise(resolve => { finish = resolve; });
        } });
        // Connect happens outside the call's context. Exact socket matching is
        // still valid; a contextual connection event alone would not be.
        publish('client:connected', { socket: unrelatedSocket });
        publish('client:connected', { socket });
        publish('client:sendHeaders', { request, socket });
        finish(response()); await task;
        const selected = entry => entry.transport.connection.events.find(e => e.event === 'socket_selected');
        expect(selected(first)).toMatchObject({ connectionEstablishedDuringCall: true, previouslySelectedInProcess: false });
        for (const [entry, selectedSocket] of [[reused, socket], [unknown, {}]]) {
            await observedJsonRequest('https://example.test', {}, entry, { send: async () => {
                const next = {};
                publish('request:create', { request: next });
                publish('client:connected', { socket: unrelatedSocket });
                publish('client:sendHeaders', { request: next, socket: selectedSocket });
                return response();
            } });
        }
        expect(selected(reused)).toMatchObject({ connectionEstablishedDuringCall: false, previouslySelectedInProcess: true });
        expect(selected(unknown)).toMatchObject({ connectionEstablishedDuringCall: false, previouslySelectedInProcess: false });
    });

    it('does not retry or extend the deadline in connection-close mode', async () => {
        vi.useFakeTimers();
        const entry = {}, send = vi.fn((_, { signal }) => stalled(signal));
        const task = observedJsonRequest('https://example.test', {}, entry, { send, closeConnection: true }).catch(e => e);
        await vi.advanceTimersByTimeAsync(29999);
        expect(send.mock.calls[0][1].signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect((await task).name).toBe('TimeoutError');
        expect(entry.transport.elapsedMs).toBe(30000);
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('records the request lifecycle without copying credentials, payloads or socket addresses', async () => {
        const entry = {}, request = { headers: 'Bearer JWT_SECRET', path: '/?apikey=KEY_SECRET' };
        const socket = { remoteAddress: 'PRIVATE_ADDRESS', secret: 'SOCKET_SECRET' };
        const send = vi.fn(async () => {
            publish('request:create', { request });
            publish('client:beforeConnect', { connectParams: { host: 'PRIVATE_HOST' } });
            publish('client:connected', { socket });
            publish('client:sendHeaders', { request, socket, headers: 'apikey: KEY_SECRET' });
            publish('request:bodySent', { request, body: 'BODY_SECRET' });
            publish('request:headers', { request, response: { statusCode: 200, headers: [
                Buffer.from('sb-request-id'), Buffer.from('synthetic-edge-request'),
                'cf-ray', 'synthetic-ray', 'x-request-id', 'unsafe\nSECRET', 'set-cookie', 'COOKIE_SECRET'
            ] } });
            return { ...response(), text: async () => {
                publish('request:trailers', { request, trailers: ['PRIVATE_TRAILER'] });
                return '{}';
            } };
        });
        await observedJsonRequest('https://example.test', {}, entry, { send });
        const evidence = entry.transport.connection;
        expect(evidence.requestEventsObserved).toBe(true);
        expect(evidence.nodeVersion).toBe(process.version);
        expect(evidence.events.map(e => e.event)).toEqual(['request_created', 'connection_attempt',
            'connection_established', 'socket_selected', 'request_body_sent', 'response_headers', 'response_complete']);
        expect(evidence.events[1].correlation).toBe('connection_context_only');
        expect(evidence.events[3]).toMatchObject({ correlation: 'request_identity', requestNumber: 1 });
        expect(evidence.events[5].httpStatus).toBe(200);
        expect(evidence.events[5].requestId).toBe('synthetic-edge-request');
        expect(evidence.events[5].cfRay).toBe('synthetic-ray');
        expect(evidence.events.every(e => e.elapsedMs >= 0)).toBe(true);
        expect(JSON.stringify(entry)).not.toMatch(/SECRET|PRIVATE/);
        expect(send).toHaveBeenCalledTimes(1);
        const saved = JSON.stringify(entry);
        publish('request:error', { request, error: { code: 'ECONNRESET' } });
        expect(JSON.stringify(entry)).toBe(saved);
    });

    it('keeps simultaneous same-URL requests separate even when events arrive outside their async context', async () => {
        const a = {}, b = {}, requestA = {}, requestB = {}, releases = [];
        const send = request => () => {
            publish('request:create', { request });
            return new Promise(resolve => releases.push(resolve));
        };
        const taskA = observedJsonRequest('https://example.test/same', {}, a, { send: send(requestA) });
        const taskB = observedJsonRequest('https://example.test/same', {}, b, { send: send(requestB) });
        // This unrelated request and connection are not within either call.
        publish('request:create', { request: {} });
        publish('client:connected', { socket: {} });
        publish('request:headers', { request: requestB, response: { statusCode: 403 } });
        publish('client:sendHeaders', { request: requestA, socket: {} });
        releases[1](response()); releases[0](response());
        await Promise.all([taskA, taskB]);
        expect(a.transport.connection.events.map(e => e.event)).toEqual(['request_created', 'socket_selected']);
        expect(b.transport.connection.events.map(e => e.event)).toEqual(['request_created', 'response_headers']);
        expect(b.transport.connection.events[1].httpStatus).toBe(403);
        // No connection-established event does not imply a failure: the socket
        // may have been pooled or opened outside this call's async context.
        expect(a.transport.stage).toBe('complete');
    });

    it('records a connection error safely and preserves the original failure without retrying', async () => {
        const entry = {}, request = {}, failure = new TypeError('fetch failed');
        const diagnosticError = { code: 'ENOTFOUND', message: 'JWT_SECRET', stack: 'PRIVATE_STACK' };
        const send = vi.fn(async () => {
            publish('request:create', { request });
            publish('client:beforeConnect', { connectParams: {} });
            publish('client:connectError', { error: diagnosticError });
            publish('request:error', { request, error: diagnosticError });
            throw failure;
        });
        await expect(observedJsonRequest('https://example.test', {}, entry, { send })).rejects.toBe(failure);
        expect(entry.transport.connection.events.slice(-2)).toMatchObject([
            { event: 'connection_error', correlation: 'connection_context_only', code: 'ENOTFOUND' },
            { event: 'request_error', correlation: 'request_identity', code: 'ENOTFOUND' }
        ]);
        expect(JSON.stringify(entry)).not.toMatch(/SECRET|PRIVATE/);
        expect(send).toHaveBeenCalledTimes(1);
        const saved = JSON.stringify(entry);
        publish('request:headers', { request, response: { statusCode: 200 } });
        expect(JSON.stringify(entry)).toBe(saved);
    });

    it('freezes the slow snapshot, retains the 30-second abort, and removes subscriptions before diagnostic settlement', async () => {
        vi.useFakeTimers();
        const entry = {}, request = {}; let snapshot, finishDiagnostic;
        const watched = channel('undici:request:headers'), hadSubscribers = watched.hasSubscribers;
        const send = vi.fn((_, { signal }) => {
            publish('request:create', { request });
            publish('client:sendHeaders', { request, socket: {} });
            publish('request:bodySent', { request });
            return stalled(signal);
        });
        const task = observedJsonRequest('https://example.test', {}, entry, { send, onSlow: value => {
            snapshot = value;
            return new Promise(resolve => { finishDiagnostic = resolve; });
        } }).catch(error => error);
        await vi.advanceTimersByTimeAsync(20000);
        expect(snapshot.connection.events).toHaveLength(3);
        publish('request:headers', { request, response: { statusCode: 200 } });
        expect(entry.transport.connection.events).toHaveLength(4);
        expect(snapshot.connection.events).toHaveLength(3);
        await vi.advanceTimersByTimeAsync(10000);
        expect(watched.hasSubscribers).toBe(hadSubscribers);
        expect(entry.transport.elapsedMs).toBe(30000);
        const saved = JSON.stringify(entry);
        publish('request:error', { request, error: { code: 'ECONNRESET' } });
        expect(JSON.stringify(entry)).toBe(saved);
        finishDiagnostic();
        expect((await task).name).toBe('TimeoutError');
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('bounds event volume and discards free-form error codes', async () => {
        const entry = {}, request = {};
        await observedJsonRequest('https://example.test', {}, entry, { send: async () => {
            publish('request:create', { request });
            publish('request:error', { request, error: { code: 'Bearer SECRET' } });
            for (let i = 0; i < 50; i++) publish('request:bodySent', { request });
            return response();
        } });
        expect(entry.transport.connection.events).toHaveLength(32);
        expect(entry.transport.connection.droppedEvents).toBe(20);
        expect(entry.transport.connection.events[1].code).toBeNull();
        expect(JSON.stringify(entry)).not.toContain('SECRET');
    });

    it('contains observer errors and removes listeners when JSON parsing fails', async () => {
        const entry = {}, request = {}, watched = channel('undici:request:headers');
        const hadSubscribers = watched.hasSubscribers;
        await expect(observedJsonRequest('https://example.test', {}, entry, { send: async () => {
            publish('request:create', { request });
            publish('request:headers', { request, get response() { throw Error('PRIVATE_DIAGNOSTIC'); } });
            return { ...response(), text: async () => 'invalid json' };
        } })).rejects.toBeInstanceOf(SyntaxError);
        expect(entry.transport.connection.observerErrors).toBe(1);
        expect(watched.hasSubscribers).toBe(hadSubscribers);
        expect(JSON.stringify(entry)).not.toContain('PRIVATE_DIAGNOSTIC');
    });
});
