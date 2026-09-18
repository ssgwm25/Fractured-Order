import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditedDerivedAuthorization } from '../../supabase/functions/_shared/authorizeDerivedOperation.js';

afterEach(() => vi.unstubAllGlobals());

describe('actual Edge handlers reject before external dispatch (no network)', () => {
    it.each(['trigger-pli-adjudication', 'pli-report-narrative'])('%s emits a correlated denial and never calls GitHub/Cursor', async name => {
        const source = await readFile(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
        // Strip the two environment imports only; execute the actual handler body.
        const compiled = await transformWithEsbuild(source.replace(/^import .*;\r?$/gm, ''), 'index.ts', { loader: 'ts', format: 'iife' });
        let handler;
        const log = vi.fn();
        const fetchImpl = vi.fn(async url => {
            if (!String(url).endsWith('/rest/v1/rpc/green_authorize_derived_operation')) throw new Error('External dispatch attempted');
            return { ok: true, json: async () => false };
        });
        vi.stubGlobal('fetch', fetchImpl);
        const environment = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'public-fixture',
            GITHUB_PAT: 'secret-fixture', CURSOR_API_KEY: 'secret-fixture', DENO_DEPLOYMENT_ID: 'fixture_version_3' };
        new Function('Deno', 'auditedDerivedAuthorization', compiled.code)(
            { serve: fn => { handler = fn; }, env: { get: key => environment[key] } },
            options => auditedDerivedAuthorization(options, { log, requestId: () => 'server-id' })
        );
        const response = await handler(new Request('https://fixture.invalid/function', {
            method: 'POST', headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json', 'x-gc03-request-id': 'spoofed' },
            body: JSON.stringify({ sessionId: '00000000-0000-4000-8000-000000000001', scope: 'simulation', factPack: { synthetic: true } })
        }));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Session operation is not authorized' });
        expect(response.headers.get('x-gc03-request-id')).toBe('server-id');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ authorized: false, external_dispatch_started: false,
            request_id: 'server-id', deployment_id: 'fixture_version_3' });
    });
});
