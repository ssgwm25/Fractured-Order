// Forward the caller's JWT to PostgREST. No service-role credential or decoded
// browser claim can substitute for the database's current session authority.
export async function authorizeDerivedOperation({ supabaseUrl, anonKey, authorization, sessionId, operation, fetchImpl = fetch }) {
    if (!supabaseUrl || !anonKey || !authorization?.startsWith('Bearer ') || !sessionId) return false;
    try {
        const response = await fetchImpl(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/green_authorize_derived_operation`, {
            method: 'POST',
            headers: { Authorization: authorization, apikey: anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requested_session_id: sessionId, requested_operation: operation }),
            signal: AbortSignal.timeout(5000)
        });
        return response.ok && (await response.json()) === true;
    } catch {
        return false;
    }
}

// Server-generated correlation only; never log credentials, payloads or caller claims.
// A false result is returned before either entrypoint can dispatch external work.
export async function auditedDerivedAuthorization(options, {
    log = message => console.info(message), requestId = () => crypto.randomUUID()
} = {}) {
    const id = requestId();
    const allowed = await authorizeDerivedOperation(options);
    log(JSON.stringify({ event: 'derived_authorization', request_id: id,
        operation: options.operation, deployment_id: options.deploymentId || null,
        authorized: allowed, external_dispatch_started: false }));
    return { allowed, requestId: id };
}
