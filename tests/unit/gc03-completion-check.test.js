import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeManifest } from '../../scripts/gc03-hosted-check.mjs';
import { ACTORS, buildCompletionSql, expireSeatSql } from '../../scripts/gc03-completion-sql.mjs';
import { assertInventory, assertEdgeLogs, logQuery, denied, conflict, hidden, one, BOUNDARY_TABLES, TERMINAL_CONFLICT_FUNCTIONS } from '../../scripts/gc03-completion-contract.mjs';
import { redactSecrets } from '../../scripts/gc03-completion-check.mjs';
import { proposalFixtureDetails, assertFixtureRecipients } from '../../scripts/gc03-completion-matrix.mjs';
import { parseProposalDetails } from '../../src/features/actions/proposalDetails.js';

const fixture = () => ({ m: { ...makeManifest('gsromgrxgrwwfywaoyme'), legacy: randomUUID() },
    users: Object.fromEntries(ACTORS.map(name => [name, { id: randomUUID() }])) });
const inventory = () => ({
    indexes: [
        { name: 'communications_proposal_recipient_root_unique', unique: true, valid: true, ready: true,
            keys: ["(metadata ->> 'source_proposal_id'::text)", "lower(metadata ->> 'recipient_team'::text)"],
            predicate: "((type = 'PROPOSAL_FORWARDED'::text) AND (NULLIF((metadata ->> 'source_proposal_id'::text), ''::text) IS NOT NULL))" },
        { name: 'idx_communications_one_forward_per_proposal', unique: true, valid: true, ready: true,
            keys: ["(metadata ->> 'source_proposal_id'::text)"],
            predicate: "((type = 'PROPOSAL_FORWARDED'::text) AND (NULLIF((metadata ->> 'source_proposal_id'::text), ''::text) IS NOT NULL) AND (NULLIF(btrim(metadata ->> 'thread_id'::text), ''::text) IS NULL))" }
    ],
    tables: [...BOUNDARY_TABLES, 'scoped_notetaker_data', 'research_note_revision'].map(name => ({ name, rls: true, authority_trigger: true })),
    policies: [...BOUNDARY_TABLES.map(tablename => ({ tablename, policyname: 'green_storage_boundary', permissive: 'RESTRICTIVE',
        cmd: 'ALL', roles: ['authenticated'], qual: `green_can_read_record('${tablename}'::text, to_jsonb(${tablename}.*))`,
        with_check: `green_can_read_record('${tablename}'::text, to_jsonb(${tablename}.*))` })),
    { tablename: 'research_note_revision', policyname: 'green_note_revision_boundary', permissive: 'RESTRICTIVE', cmd: 'ALL',
        qual: 'EXISTS (SELECT green_can_read_record())', with_check: 'EXISTS (SELECT green_can_read_record())' }],
    functions: ['gc03_legacy_claim', 'gc03_legacy_heartbeat', 'gc03_legacy_remove', 'gc03_legacy_disconnect', 'gc03_legacy_release',
        'gc02_unified_append_proposal_thread_message', ...Object.keys(TERMINAL_CONFLICT_FUNCTIONS)]
        .filter((name, index, names) => names.indexOf(name) === index)
        .map(name => ({ name, anon_execute: false, authenticated_execute: false,
            definition: "ERRCODE = 'PT409';\n".repeat(TERMINAL_CONFLICT_FUNCTIONS[name] || 0) }))
});

describe('GC03 completion verification safeguards (no network or SQL execution)', () => {
    it('blocks fixture creation when the old proposal-wide index still covers threads or the recipient guard is absent', () => {
        for (const corrupt of [
            i => { i.indexes[1].predicate = i.indexes[0].predicate; },
            i => { i.indexes.shift(); }, i => { i.indexes[0].valid = false; },
            i => { i.indexes[0].unique = false; }, i => { i.indexes[0].ready = false; },
            i => { i.indexes[0].keys.pop(); }
        ]) { const data = inventory(); corrupt(data); expect(() => assertInventory(data)).toThrow('recipient forward index'); }
    });
    it('repairs index scope atomically and tests installed expressions without rewriting evidence', () => {
        const sql = readFileSync(new URL('../../data/2026-09-21_gc03_recipient_forward_uniqueness.sql', import.meta.url), 'utf8');
        expect(sql).toContain("(LOWER(metadata ->> 'recipient_team'))");
        expect(sql).toContain("AND NULLIF(BTRIM(metadata ->> 'thread_id'), '') IS NULL");
        expect(sql.indexOf('CREATE UNIQUE INDEX communications_proposal_recipient_root_unique')).toBeLessThan(sql.indexOf('DROP INDEX public.idx_communications_one_forward_per_proposal'));
        expect(sql).toContain('GC03_FORWARD_INDEX_DRIFT');
        expect(sql).not.toMatch(/DELETE FROM|UPDATE public\.|DROP POLICY|DROP FUNCTION|DISABLE TRIGGER/i);
        const probe = readFileSync(new URL('../sql/gc03-recipient-forward-uniqueness.sql', import.meta.url), 'utf8');
        expect(probe).toContain('pg_get_indexdef');
        expect(probe).toContain("caught <> 'communications_proposal_recipient_root_unique'");
        expect(probe).toContain("caught <> 'idx_communications_one_forward_per_proposal'");
        expect(probe).toContain('ROLLBACK;');
        expect(probe).not.toMatch(/INSERT INTO public\.|UPDATE public\.|DELETE FROM public\./);
    });
    it('preserves both synthetic recipients in legacy details when draft content is rebuilt at handoff', () => {
        for (const stage of ['Draft', 'Forwarded']) {
            const details = proposalFixtureDetails(stage);
            const parsed = parseProposalDetails(details);
            expect(parsed.recipientTeams).toEqual(['blue', 'red']);
            expect(parsed.scribeHandoff).toBe(stage);
            // Database payload rebuilding uses the serialized Recipient Teams line.
            const storedRecipients = JSON.parse(details.match(/^Recipient Teams: (.+)$/m)[1]);
            expect(() => assertFixtureRecipients({ artifact_payload: { proposal: { recipientTeams: storedRecipients } } }, stage)).not.toThrow();
        }
    });
    it('stops before recipient approval if a persisted proposal has lost either intended partner', () => {
        for (const recipientTeams of [undefined, [], ['blue'], ['red'], ['blue', 'blue']]) {
            expect(() => assertFixtureRecipients({ artifact_payload: { proposal: { recipientTeams } } }, 'handoff'))
                .toThrow('handoff: both fixture recipients retained');
        }
    });
    it('creates fresh fixtures atomically and never reopens the archived run', () => {
        const { m, users } = fixture(), files = buildCompletionSql(m, users);
        expect(files.setup.match(/^COMMIT;/gm)).toHaveLength(1);
        expect(files.setup.indexOf(m.legacy)).toBeLessThan(files.setup.indexOf('COMMIT;'));
        expect(files.setup).not.toContain('362dc3b3-1579-4ed1-b1ae-a79b73584d97');
        expect(files.setup).not.toContain("'gamemaster'");
        expect(files.setup).not.toMatch(/DISABLE TRIGGER|CREATE (?:OR REPLACE )?FUNCTION/);
    });
    it('limits cleanup to five exact named sessions and removes only fixture grants', () => {
        const { m, users } = fixture(), sql = buildCompletionSql(m, users).cleanup;
        expect(sql).toContain('GC03 fixture identity mismatch');
        expect(sql.match(/public.archive_live_demo_session\(/g)).toHaveLength(5);
        expect(sql.match(/INSERT INTO public.operator_grants/g)).toHaveLength(5);
        expect(sql.match(/DELETE FROM public.operator_grants/g)).toHaveLength(7);
        expect(sql).not.toMatch(/DELETE FROM public\.(sessions|participants|actions|research_|scoped_)/);
        for (const id of [...Object.values(m.sessions), m.legacy]) expect(sql).toContain(id);
        expect(sql.indexOf('COMMIT;')).toBeLessThan(sql.indexOf('SELECT id,name,status'));
    });
    it('refuses malformed identifiers and duplicate authenticated identities', () => {
        const { m, users } = fixture();
        expect(() => buildCompletionSql({ ...m, legacy: "';DELETE FROM sessions;--" }, users)).toThrow();
        users.euS.id = users.apS.id;
        expect(() => buildCompletionSql(m, users)).toThrow('independent Auth');
    });
    it('ages only the exact nonrevoked synthetic lifecycle seat', () => {
        const { m, users } = fixture(), seatId = randomUUID();
        const sql = expireSeatSql(m, seatId, users.apS.id);
        expect(sql).toContain(`sp.id='${seatId}' AND sp.session_id='${m.sessions.same}'`);
        expect(sql).toContain(`p.auth_user_id='${users.apS.id}' AND sp.revoked_at IS NULL`);
        expect(sql).toContain('IF NOT FOUND THEN RAISE EXCEPTION');
        expect(sql).toContain('GC03 fixture identity mismatch');
    });
    it('fails for disabled RLS, missing triggers, permissive/bypassed policies and public compatibility RPCs', () => {
        expect(() => assertInventory(inventory())).not.toThrow();
        for (const corrupt of [
            i => { i.tables[0].rls = false; }, i => { i.tables[0].authority_trigger = false; },
            i => { i.policies[0].permissive = 'PERMISSIVE'; }, i => { i.policies.shift(); },
            i => { i.policies[0].qual += ' OR true'; }, i => { i.functions[0].anon_execute = true; },
            i => { i.functions[0].authenticated_execute = true; }
        ]) { const data = inventory(); corrupt(data); expect(() => assertInventory(data)).toThrow(); }
    });
    it('never counts missing rows or authentication/route/server errors as an authorization pass', () => {
        expect(() => denied({ status: 403, data: { code: '42501' } }, 'expected')).not.toThrow();
        for (const status of [200, 401, 404, 500]) expect(() => denied({ status, data: { code: '42501' } }, 'bad')).toThrow();
        expect(() => one({ status: 200, data: [] }, 'positive control')).toThrow();
        expect(() => hidden({ status: 404, data: [] }, 'route missing')).toThrow();
        expect(() => denied({ status: 400, data: { code: '22023' } }, 'malformed')).toThrow();
    });
    it('stops before fixture setup when an installed RPC still requests serialization retries', () => {
        for (const name of Object.keys(TERMINAL_CONFLICT_FUNCTIONS)) {
            const data = inventory();
            data.functions.find(f => f.name === name).definition = "ERRCODE = '40001'";
            expect(() => assertInventory(data)).toThrow('terminal conflicts');
        }
        const missing = inventory();
        missing.functions = missing.functions.filter(f => f.name !== 'save_scoped_notetaker_data');
        expect(() => assertInventory(missing)).toThrow('terminal conflicts');
    });
    it('requires a terminal HTTP 409 and the expected application conflict code', () => {
        expect(() => conflict({ status: 409, data: { code: 'PT409', message: 'stale' } }, 'conflict', 'stale')).not.toThrow();
        for (const response of [{ status: 409, data: { code: '40001' } }, { status: 400, data: { code: 'PT409' } },
            { status: 403, data: { code: '42501' } }, { status: 409, data: { code: 'PT409', message: 'other' } }]) {
            expect(() => conflict(response, 'conflict', 'stale')).toThrow();
        }
    });
    it('requires six matching server-generated IDs, denial events and deployed versions', () => {
        const expected = Array.from({ length: 6 }, () => ({ correlationId: randomUUID(), operation: 'narrative', deploymentId: 'project_function_7' }));
        const data = { result: expected.map(e => ({ event_message: JSON.stringify({ event: 'derived_authorization', request_id: e.correlationId,
            operation: e.operation, deployment_id: e.deploymentId, authorized: false, external_dispatch_started: false }) })) };
        expect(() => assertEdgeLogs(expected, data)).not.toThrow();
        expect(logQuery(expected)).toContain("source = 'function_logs'");
        expect(logQuery(expected)).not.toContain('SELECT *');
        expect(() => assertEdgeLogs(expected, { result: [] })).toThrow();
        expect(() => assertEdgeLogs(expected, { ...data, error: 'query failed' })).toThrow();
        for (const patch of [{ authorized: true }, { external_dispatch_started: true }, { deployment_id: 'project_function_6' }, { request_id: randomUUID() }]) {
            const modified = structuredClone(data);
            modified.result[0].event_message = JSON.stringify({ ...JSON.parse(modified.result[0].event_message), ...patch });
            expect(() => assertEdgeLogs(expected, modified)).toThrow();
        }
    });
    it('redacts all operator and participant secrets, including nested error text', () => {
        expect(redactSecrets({ error: 'sbp_secret refresh-secret', nested: ['access-secret'] },
            ['sbp_secret', 'access-secret', 'refresh-secret'])).toEqual({ error: '[REDACTED] [REDACTED]', nested: ['[REDACTED]'] });
    });
});
