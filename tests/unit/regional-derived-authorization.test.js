import { describe, expect, it, vi } from 'vitest';
import { authorizeDerivedOperation, auditedDerivedAuthorization } from '../../supabase/functions/_shared/authorizeDerivedOperation.js';

const request = { supabaseUrl: 'https://fixture.invalid', anonKey: 'public-fixture-key',
    authorization: 'Bearer fixture-user-jwt', sessionId: 'fixture-session', operation: 'adjudicate' };

describe('derived-operation server authorization', () => {
    it('forwards the user JWT and requires an explicit database authorization', async () => {
        const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => true }));
        expect(await authorizeDerivedOperation({ ...request, fetchImpl })).toBe(true);
        expect(fetchImpl).toHaveBeenCalledWith('https://fixture.invalid/rest/v1/rpc/green_authorize_derived_operation', expect.objectContaining({
            headers: { Authorization: request.authorization, apikey: request.anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requested_session_id: request.sessionId, requested_operation: 'adjudicate' })
        }));
    });
    it.each([false, null, {}, 'true'])('rejects a non-authorizing response %j', async (data) => {
        expect(await authorizeDerivedOperation({ ...request, fetchImpl: async () => ({ ok: true, json: async () => data }) })).toBe(false);
    });
    it('fails closed on an expired JWT, missing RPC or network failure', async () => {
        expect(await authorizeDerivedOperation({ ...request, fetchImpl: async () => ({ ok: false }) })).toBe(false);
        expect(await authorizeDerivedOperation({ ...request, fetchImpl: async () => { throw new Error('offline'); } })).toBe(false);
    });
    it('never calls the backend without a token and public project configuration', async () => {
        const fetchImpl = vi.fn();
        expect(await authorizeDerivedOperation({ ...request, anonKey: '', fetchImpl })).toBe(false);
        expect(await authorizeDerivedOperation({ ...request, authorization: '', fetchImpl })).toBe(false);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
    it('correlates a denied request without logging credentials or caller payloads', async () => {
        const log = vi.fn();
        const result = await auditedDerivedAuthorization({ ...request, deploymentId: 'fixture_version_3',
            fetchImpl: async () => ({ ok: true, json: async () => false }) }, { log, requestId: () => 'server-generated-id' });
        expect(result).toEqual({ allowed: false, requestId: 'server-generated-id' });
        expect(JSON.parse(log.mock.calls[0][0])).toEqual({ event: 'derived_authorization',
            request_id: 'server-generated-id', operation: 'adjudicate', deployment_id: 'fixture_version_3',
            authorized: false, external_dispatch_started: false });
        expect(log.mock.calls[0][0]).not.toContain(request.authorization);
        expect(log.mock.calls[0][0]).not.toContain(request.sessionId);
    });
});
