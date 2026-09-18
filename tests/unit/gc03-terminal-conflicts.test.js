import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recordedRequest } from '../../scripts/gc03-recorded-request.mjs';

describe('GC03 terminal conflicts and request evidence (offline)', () => {
    it.each(['before headers', 'during body'])('retains the failed request %s without retrying or recording credentials', async stage => {
        const requests = [], snapshots = [];
        let sends = 0;
        const timeout = () => { throw new DOMException('synthetic timeout', 'TimeoutError'); };
        const send = async () => {
            sends++;
            expect(snapshots[0][0]).toMatchObject({ completed: false, method: 'POST' });
            if (stage === 'before headers') timeout();
            return { status: 409, headers: new Headers({ 'sb-request-id': 'server-request' }), text: timeout };
        };
        await expect(recordedRequest({ requests, save: async () => snapshots.push(structuredClone(requests)), send,
            who: 'apN', method: 'POST', path: '/rest/v1/rpc/save_scoped_notetaker_data' }))
            .rejects.toThrow('apN POST /rest/v1/rpc/save_scoped_notetaker_data: synthetic timeout');
        expect(sends).toBe(1);
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({ completed: false, error: { name: 'TimeoutError' } });
        expect(requests[0].at).toBeTruthy();
        expect(requests[0]).not.toHaveProperty('headers');
        expect(requests[0]).not.toHaveProperty('body');
        if (stage === 'during body') expect(requests[0].requestId).toBe('server-request');
        expect(snapshots.at(-1)).toEqual(requests);
    });
    it('retains terminal conflicts as completed responses for the matrix to assert', async () => {
        const requests = [];
        const result = await recordedRequest({ requests, save: async () => {}, who: 'apN', method: 'POST', path: '/rpc/note',
            send: async () => new Response(JSON.stringify({ code: 'PT409', message: 'GC02_NOTE_REVISION_CONFLICT' }), { status: 409 }) });
        expect(result).toMatchObject({ completed: true, status: 409, data: { code: 'PT409' } });
        expect(requests).toEqual([result]);
    });
    it('limits the forward repair to the five active implementations and preserves their metadata', () => {
        const sql = readFileSync(new URL('../../data/2026-09-20_gc03_terminal_revision_conflicts.sql', import.meta.url), 'utf8');
        // SQL identifiers such as gc02_unified_* contain digits after the first character.
        const targets = [...sql.matchAll(/\('public\.([a-z_][a-z0-9_]*)\(([^']*)\)', (\d)\)/g)];
        expect(targets.map(m => [m[1], Number(m[3])])).toEqual([
            ['save_scoped_notetaker_data', 1], ['operator_review_artifact', 2], ['operator_review_proposal', 1],
            ['gc02_unified_append_proposal_thread_message', 1], ['operator_forward_proposal_response', 1]
        ]);
        expect(sql).toContain("replace(before_definition, 'ERRCODE = ''40001''', 'ERRCODE = ''PT409''')");
        for (const field of ['proowner', 'proacl', 'proconfig', 'prosecdef']) expect(sql).toContain(`original.${field}`);
        expect(sql).toContain('GC03_TERMINAL_CONFLICT_SITE_DRIFT');
        expect(sql).toContain('GC03_TERMINAL_CONFLICT_PRIVATE_RPC_EXPOSED');
        expect(sql).not.toMatch(/DROP FUNCTION|ALTER TABLE|CREATE POLICY|UPDATE public\.|DELETE FROM|WHEN serialization_failure/i);
        expect(sql.indexOf('COMMIT;')).toBeGreaterThan(sql.indexOf('END;'));
    });
});
