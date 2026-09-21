import { AsyncLocalStorage } from 'node:async_hooks';
import { channel } from 'node:diagnostics_channel';

const requestContext = new AsyncLocalStorage();
const selectedSockets = new WeakSet();
const diagnosticChannels = {
    'undici:request:create': 'request_created',
    'undici:client:beforeConnect': 'connection_attempt',
    'undici:client:connected': 'connection_established',
    'undici:client:connectError': 'connection_error',
    'undici:client:sendHeaders': 'socket_selected',
    'undici:request:bodySent': 'request_body_sent',
    'undici:request:headers': 'response_headers',
    'undici:request:trailers': 'response_complete',
    'undici:request:error': 'request_error'
};

function responseIdentifiers(headers) {
    const ids = {};
    if (!Array.isArray(headers)) return ids;
    const decode = value => Buffer.isBuffer(value) ? value.toString('utf8') : typeof value === 'string' ? value : '';
    for (let index = 0; index + 1 < Math.min(headers.length, 256); index += 2) {
        const name = decode(headers[index]).toLowerCase();
        if (!['sb-request-id', 'x-request-id', 'cf-ray'].includes(name)) continue;
        const value = decode(headers[index + 1]);
        if (/^[a-zA-Z0-9-]{1,128}$/.test(value)) ids[name] = value;
    }
    return { requestId: ids['sb-request-id'] || ids['x-request-id'] || null, cfRay: ids['cf-ray'] || null };
}

// Do not retain channel payloads: they can include JWTs, full headers and sockets.
function observeConnection(trace, started, scope) {
    const evidence = trace.connection = { source: 'node:diagnostics_channel',
        nodeVersion: process.version, undiciVersion: process.versions.undici ?? null,
        requestEventsObserved: false, events: [], droppedEvents: 0, observerErrors: 0 };
    const requests = new WeakMap(), establishedSockets = new WeakSet();
    let requestCount = 0;
    const subscriptions = Object.entries(diagnosticChannels).map(([name, event]) => {
        const diagnostic = channel(name);
        const listener = message => {
            // Subscribers execute inside the HTTP client; an observer must never
            // throw into it or replace the real request outcome.
            try {
                // A connection event has no request identity. Remember only its
                // socket identity within this observation window; bind it later
                // if sendHeaders selects that exact socket for our request.
                if (event === 'connection_established' && message.socket && typeof message.socket === 'object')
                    establishedSockets.add(message.socket);
                const contextual = ['connection_attempt', 'connection_established', 'connection_error'].includes(event);
                if (contextual) {
                    if (requestContext.getStore() !== scope) return;
                } else if (event === 'request_created') {
                    if (requestContext.getStore() !== scope) return;
                    requests.set(message.request, ++requestCount);
                } else if (!requests.has(message.request)) return;

                if (!contextual) evidence.requestEventsObserved = true;
                if (evidence.events.length >= 32) { evidence.droppedEvents++; return; }
                const item = { event, elapsedMs: Date.now() - started,
                    correlation: contextual ? 'connection_context_only' : 'request_identity' };
                if (!contextual) item.requestNumber = requests.get(message.request);
                if (event === 'socket_selected' && message.socket && typeof message.socket === 'object') {
                    item.connectionEstablishedDuringCall = establishedSockets.has(message.socket);
                    item.previouslySelectedInProcess = selectedSockets.has(message.socket);
                    selectedSockets.add(message.socket);
                }
                if (event === 'response_headers' && Number.isInteger(message.response?.statusCode)) {
                    item.httpStatus = message.response.statusCode;
                    Object.assign(item, responseIdentifiers(message.response.headers));
                }
                if (event === 'request_error' || event === 'connection_error') {
                    // Only bounded machine codes; never error messages/stacks,
                    // which may contain URLs, headers or credentials.
                    const code = message.error?.code;
                    item.code = typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : null;
                }
                evidence.events.push(item);
            } catch { evidence.observerErrors++; }
        };
        diagnostic.subscribe(listener);
        return [diagnostic, listener];
    });
    return () => subscriptions.forEach(([diagnostic, listener]) => diagnostic.unsubscribe(listener));
}

// Evidence only: no automatic retries and no change to the participant deadline.
export async function observedJsonRequest(url, options, entry, {
    send = fetch, onSlow, timeoutMs = 30000, slowAfterMs = 20000, closeConnection = false
} = {}) {
    const started = Date.now(), controller = new AbortController();
    const trace = entry.transport = { stage: 'awaiting_headers', timeoutMs, slowAfterMs,
        dispatchedAt: new Date(started).toISOString(),
        connectionPolicy: closeConnection ? 'close-after-response' : 'default' };
    const scope = {}, stopObserving = observeConnection(trace, started, scope);
    let observation;
    const deadline = setTimeout(() => controller.abort(new DOMException(
        'The operation was aborted due to timeout', 'TimeoutError')), timeoutMs);
    const slow = onSlow && setTimeout(() => {
        trace.slowObservedAt = new Date().toISOString();
        const snapshot = { ...structuredClone(trace), elapsedMs: Date.now() - started };
        observation = Promise.resolve().then(() => onSlow(snapshot)).catch(error => {
            // A diagnostic failure must not replace the participant failure.
            trace.diagnosticError = { name: error.name, message: error.message };
        });
    }, slowAfterMs);
    try {
        const requestOptions = { ...options, signal: controller.signal };
        if (closeConnection) {
            requestOptions.headers = new Headers(options.headers);
            requestOptions.headers.set('Connection', 'close');
        }
        const response = await requestContext.run(scope, () => send(url, requestOptions));
        Object.assign(trace, { stage: 'reading_body', headersAt: new Date().toISOString(),
            httpStatus: response.status, requestId: response.headers.get('sb-request-id')
                || response.headers.get('x-request-id'), cfRay: response.headers.get('cf-ray') });
        const text = await response.text();
        trace.stage = 'parsing_body';
        const data = text ? JSON.parse(text) : null;
        trace.stage = 'complete';
        return { status: response.status, data, requestId: trace.requestId };
    } catch (error) {
        trace.error = { name: error.name, code: error.code ?? null,
            causeCode: error.cause?.code ?? null };
        throw error;
    } finally {
        clearTimeout(deadline);
        if (slow) clearTimeout(slow);
        trace.elapsedMs = Date.now() - started;
        stopObserving();
        // Any snapshot already dispatched must settle before fixture cleanup.
        await observation;
    }
}

// Candidate claims can belong to other requests in the same project. Return
// bounded wait metadata only, never their SQL text, JWTs, names or addresses.
// One SELECT keeps the Management API's final result readable; the caller sets
// read_only=true and bounds this diagnostic HTTP request to eight seconds.
export const seatClaimWaitSql = `SELECT clock_timestamp() AS observed_at,
    'RPC-name candidates; not an exact HTTP request correlation' AS scope,
    COALESCE((SELECT jsonb_agg(to_jsonb(candidate)) FROM (
        SELECT a.pid,a.state,a.wait_event_type,a.wait_event,
            extract(epoch FROM clock_timestamp()-a.query_start)*1000 AS query_age_ms,
            pg_blocking_pids(a.pid) AS blocking_pids,
            (SELECT jsonb_agg(jsonb_build_object('pid',b.pid,'state',b.state,
                'wait_event_type',b.wait_event_type,'wait_event',b.wait_event))
             FROM pg_stat_activity b WHERE b.pid=ANY(pg_blocking_pids(a.pid))) AS blockers
        FROM pg_stat_activity a
        WHERE a.datname=current_database() AND a.pid<>pg_backend_pid()
            AND a.state IN ('active','idle in transaction','idle in transaction (aborted)')
            AND position('claim_session_role_seat' in a.query)>0
        ORDER BY a.query_start,a.pid LIMIT 20
    ) candidate),'[]'::jsonb) AS candidate_claim_backends;`;
