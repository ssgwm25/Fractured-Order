import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditedDerivedAuthorization } from '../../supabase/functions/_shared/authorizeDerivedOperation.js';

const rehearsalOrigin = 'http://127.0.0.1:4174';
const sessionId = '00000000-0000-4000-8000-000000000007';
let handler, fetchImpl;

beforeEach(async () => {
    const source = await readFile(new URL('../../supabase/functions/trigger-pli-adjudication/index.ts', import.meta.url), 'utf8');
    const compiled = await transformWithEsbuild(source.replace(/^import .*;\r?$/gm, ''), 'index.ts', { loader: 'ts', format: 'iife' });
    fetchImpl = vi.fn(() => { throw new Error('Unexpected network request'); });
    vi.stubGlobal('fetch', fetchImpl);
    const environment = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'public-fixture',
        GITHUB_PAT: 'secret-fixture', DENO_DEPLOYMENT_ID: 'fixture-version' };
    new Function('Deno', 'auditedDerivedAuthorization', compiled.code)(
        { serve: fn => { handler = fn; }, env: { get: key => environment[key] } },
        options => auditedDerivedAuthorization(options, { log: vi.fn(), requestId: () => 'server-id' })
    );
});

afterEach(() => vi.unstubAllGlobals());

function preflight(origin) {
    return new Request('https://fixture.invalid/function', { method: 'OPTIONS', headers: {
        Origin: origin, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,x-client-info,apikey,content-type'
    } });
}

function post(authorization) {
    return new Request('https://fixture.invalid/function', { method: 'POST', headers: {
        Origin: rehearsalOrigin, 'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {})
    }, body: JSON.stringify({ sessionId, dryRun: false }) });
}

describe('GC07 local rehearsal PLI trigger CORS (actual handler, no network)', () => {
    it.each([rehearsalOrigin, 'https://ssgwm25.github.io'])('permits the exact %s preflight without dispatch', async origin => {
        const response = await handler(preflight(origin));
        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        expect(response.headers.get('Vary')).toBe('Origin');
        expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
        const allowedHeaders = response.headers.get('Access-Control-Allow-Headers').split(',').map(value => value.trim());
        expect(allowedHeaders).toEqual(expect.arrayContaining(['authorization', 'x-client-info', 'apikey', 'content-type']));
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each(['http://127.0.0.1:41740', 'http://127.0.0.1.attacker.invalid:4174', 'null'])
    ('does not grant CORS access to %s', async origin => {
        const response = await handler(preflight(origin));
        expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe(origin);
        expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('keeps a missing JWT unauthorized while allowing the rehearsal browser to read the error', async () => {
        const response = await handler(post());
        expect(response.status).toBe(401);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(rehearsalOrigin);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('still denies the current session operation before external dispatch', async () => {
        fetchImpl.mockResolvedValueOnce({ ok: true, json: async () => false });
        const response = await handler(post('Bearer denied-fixture-token'));
        expect(response.status).toBe(403);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(rehearsalOrigin);
        expect(response.headers.get('x-gc03-request-id')).toBe('server-id');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledWith('https://fixture.invalid/rest/v1/rpc/green_authorize_derived_operation',
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer denied-fixture-token' }),
                body: JSON.stringify({ requested_session_id: sessionId, requested_operation: 'adjudicate' }) }));
    });

    it('returns a CORS-readable success only after server authorization and dispatch', async () => {
        fetchImpl.mockResolvedValueOnce({ ok: true, json: async () => true })
            .mockResolvedValueOnce({ status: 204 });
        const response = await handler(post('Bearer authorized-fixture-token'));
        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(rehearsalOrigin);
        expect(await response.json()).toMatchObject({ ok: true, dispatched: true, sessionId, dryRun: false });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(fetchImpl.mock.calls[0][0]).toBe('https://fixture.invalid/rest/v1/rpc/green_authorize_derived_operation');
        expect(fetchImpl.mock.calls[1][0]).toBe('https://api.github.com/repos/ssgwm25/Fractured-Order/actions/workflows/pli-adjudicate.yml/dispatches');
    });
});
