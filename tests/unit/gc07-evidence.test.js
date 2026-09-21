import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { makeManifest, roles, validate, setupSql, cleanupSql, assertCleanup, writeArgs, denied } from '../../scripts/gc07-live-contract.mjs';
import { cleanup, runnerOptions, runOutcome } from '../../scripts/gc07-live-check.mjs';
import { raceSql, assertRace, runRace } from '../../scripts/gc07-live-race.mjs';
import { sqlEvidenceQuery, assertSqlReceipt } from '../../scripts/gc07-sql-evidence.mjs';
import { template, assertManual, manualManifest, evidenceFile } from '../../scripts/gc07-manual-evidence.mjs';
import { sha, assertDatabase } from '../../scripts/gc07-live-provenance.mjs';
import { workflow, notificationWorkflow } from '../../scripts/gc07-live-workflow.mjs';

const make = () => {
    const m = makeManifest('abcdefghijklmnopqrst', 'https://example.test/Fractured-Order/');
    for (const s of m.sessions) s.actors = roles(s.model).map(role => {
        const userId = randomUUID(); return { role, userId, sessionId: s.id, clientId: `gc07-${userId}` };
    });
    return m;
};
const ok = data => ({ status: 201, data });
const history = () => ({ count: 2, digest: 'unchanged' });
const state = (m, archived = false) => m.sessions.map(s => ({ id: s.id, status: archived ? 'archived' : 'active',
    active_seats: archived ? 0 : s.actors.length, grants: archived ? 0 : 3, closure_events: archived ? 1 : 0,
    ...Object.fromEntries(['actions','requests','communications','timeline','artifact_workflow_reviews','action_logs','research_history'].map(k => [k, history()])) }));
const rfi = (m, region = 'asian_pacific') => ({ id: randomUUID(), session_id: m.sessions[0].id, delegation_id: region,
    revision_number: 1, status: 'pending', workflow_state: 'submitted_to_white_cell', gc07_client_key: `gc07:${region}:test` });
const race = (side, mode, artifact, patch = {}) => ok([{ cleared: '', receipt: { result: side === 'a' ? 'PASS: A observed B blocked' : `PASS: ${mode}`,
    connection_a: 100, connection_b: 101, waited_ms: 1100, artifact,
    ...(side === 'b' && mode === 'stale' ? { rejection: { sqlstate: 'PT409', message: 'Stale artifact revision. Expected 1, current 2.' } } : {}),
    ...patch } }]);

describe('GC07 evidence containment (no hosted execution)', () => {
    it('requires an explicit connection-close flag and rejects ambiguous or unknown runner options', () => {
        expect(runnerOptions([])).toEqual({ local: false, closeConnection: false });
        expect(runnerOptions(['--local'])).toEqual({ local: true, closeConnection: false });
        expect(runnerOptions(['--connection-close'])).toEqual({ local: false, closeConnection: true });
        for (const args of [['--local', '--connection-close'], ['--connection-close', '--local']])
            expect(runnerOptions(args)).toEqual({ local: true, closeConnection: true });
        for (const args of [['--local', '--local'], ['--connection-close', '--connection-close'],
            ['--fresh'], ['cleanup', '--connection-close'], ['--local', '--connection-close', 'extra']])
            expect(() => runnerOptions(args)).toThrow(/usage/);
    });

    it('keeps completed transport diagnostics separate from acceptance and manual evidence', () => {
        const report = { workflowPassed: true, racesPassed: true, cleanupPassed: true,
            authSignOut: Array.from({ length: 18 }, () => ({ passed: true })) };
        expect(runOutcome(report)).toEqual({ runCompleted: true, diagnosticCompleted: false, passed: true });
        for (const flag of [{ diagnosticOnly: true }, { connectionPolicy: 'close-after-response' }]) {
            expect(runOutcome({ ...report, ...flag })).toEqual({ runCompleted: true, diagnosticCompleted: true, passed: false });
            expect(() => template({ ...report, ...flag, passed: true }, 'unused')).toThrow(/cannot supply manual acceptance/);
        }
    });

    it('retains failures, incomplete cleanup and interruption as failed diagnostics', () => {
        const report = { diagnosticOnly: true, workflowPassed: true, racesPassed: true, cleanupPassed: true,
            authSignOut: Array.from({ length: 18 }, () => ({ passed: true })) };
        for (const patch of [{ error: 'Timeout' }, { cleanupPassed: false }, { workflowPassed: false },
            { racesPassed: false }, { authSignOut: [] }, { authSignOut: report.authSignOut.map((r, i) => ({ passed: i !== 0 })) }])
            expect(runOutcome({ ...report, ...patch })).toEqual({ runCompleted: false, diagnosticCompleted: false, passed: false });
        expect(runOutcome(report, true)).toEqual({ runCompleted: false, diagnosticCompleted: false, passed: false });
    });

    it('binds distinct users to exactly three new model fixtures and preserves the approved roster', () => {
        const m = make(); validate(m);
        const sql = setupSql(m);
        expect(new Set(m.sessions.flatMap(s => s.actors.map(a => a.userId))).size).toBe(18);
        expect(sql).toContain('model must be configured before joins');
        expect(sql.indexOf('configure_session_green_shared_facilitator')).toBeLessThan(sql.indexOf('INSERT INTO public.actions'));
        expect(sql).toContain('"aliases":{"South Korea":"ROK"}');
        expect(sql).not.toMatch(/ALTER TABLE|DISABLE|CREATE (TABLE|FUNCTION)/i);
        m.sessions[0].actors[0].sessionId = m.sessions[1].id;
        expect(() => cleanupSql(m)).toThrow(/identity/);
    });
    it('rejects reused Auth identities and recovery manifests with changed fixture names', () => {
        const m = make(), first = m.sessions[0].actors[0];
        m.sessions[1].actors[0] = { ...first, sessionId: m.sessions[1].id };
        expect(() => validate(m)).toThrow(/distinct/);
        const other = make(); other.sessions[0].name = 'existing exercise';
        expect(() => cleanupSql(other)).toThrow(/provenance/);
    });
    it('archives fixtures with independent readback and includes RFI/timeline history', async () => {
        const m = make(), before = state(m), after = state(m, true);
        const send = vi.fn().mockResolvedValueOnce(ok(m.sessions.map(s => ({ id: s.id }))))
            .mockResolvedValueOnce(ok(before)).mockResolvedValueOnce(ok(after)).mockResolvedValueOnce(ok(after));
        expect((await cleanup(m, send)).passed).toBe(true);
        expect(send.mock.calls[3][0]).toBe('cleanup-independent-confirmation');
        for (const key of ['requests','timeline','communications','artifact_workflow_reviews']) {
            const damaged = structuredClone(after); damaged[0][key].digest = 'changed';
            expect(() => assertCleanup(m, before, damaged)).toThrow(/history/);
        }
        expect(cleanupSql(m)).not.toMatch(/DELETE FROM public\.(sessions|requests|communications|timeline)/);
    });
    it('refuses partial fixture cleanup and absent fixtures with leftover authority', async () => {
        const m = make();
        await expect(cleanup(m, vi.fn(async () => ok([{ id: m.sessions[0].id }])))).rejects.toThrow(/partial/);
        await expect(cleanup(m, vi.fn().mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([{ rosters: 1, grants: 0 }])))).rejects.toThrow(/leftover/);
    });
    it('does not accept transport errors or missing RPCs as authorization evidence', () => {
        denied({ status: 403, data: { code: '42501' } });
        for (const response of [ok([]), { status: 404, data: { code: 'PGRST202' } }, { status: 500, data: { code: '42501' } }])
            expect(() => denied(response)).toThrow();
        expect(writeArgs(make().sessions[0], 'europe')).not.toHaveProperty('role');
    });
});

describe('GC07 concurrency evidence', () => {
    it('requires matching distinct backend IDs and an observed wait', () => {
        const m = make(), a = rfi(m), b = rfi(m, 'europe');
        expect(assertRace('regions', race('a','regions',a), race('b','regions',b))).toHaveLength(2);
        for (const patch of [{ connection_b: 100 }, { connection_a: 999 }, { waited_ms: 0 }, { waited_ms: null }])
            expect(() => assertRace('regions', race('a','regions',a), race('b','regions',b,patch))).toThrow();
        const queries = raceSql(m, 'regions');
        expect(queries.a).toContain('pg_blocking_pids(peer)');
        expect(queries.b).toContain('SET LOCAL ROLE authenticated');
        expect(queries.b).toContain('public.write_regional_rfi');
    });
    it('distinguishes retry identity from one winning revision-bound White Cell return', () => {
        const m = make(), a = rfi(m);
        expect(assertRace('retry',race('a','retry',a),race('b','retry',a))).toEqual([a]);
        expect(() => assertRace('retry',race('a','retry',a),race('b','retry',{ ...a, delegation_id: 'europe' }))).toThrow();
        const returned = { ...a, revision_number: 2, workflow_state: 'returned_to_team' };
        expect(assertRace('stale',race('a','stale',returned),race('b','stale',null),a)).toEqual([returned]);
        expect(raceSql(m,'stale',a).b).toContain("EXCEPTION WHEN SQLSTATE 'PT409'");
        expect(() => raceSql(m,'stale',{ ...a, session_id: randomUUID() })).toThrow();
    });
    it('settles both requests before cleanup and rejects inconsistent committed state', async () => {
        const m = make(); let release, finished = false;
        const pending = new Promise(resolve => { release = resolve; });
        const send = vi.fn(label => label.endsWith('-A') ? Promise.reject(Error('lost')) : pending);
        const task = runRace(m,'regions',null,send,async () => {}).catch(e => { finished = true; return e; });
        await Promise.resolve(); await Promise.resolve(); expect(finished).toBe(false);
        release(ok([])); expect(await task).toBeInstanceOf(Error);
        const a = rfi(m), b = rfi(m,'europe');
        await expect(runRace(m,'regions',null,vi.fn(async label => label.endsWith('-A') ? race('a','regions',a)
            : label.endsWith('-B') ? race('b','regions',b) : ok([a,{ ...b, revision_number: 9 }])),async () => {})).rejects.toThrow(/committed state/);
    });
    it('accepts only the exact already-returned state rejection or terminal revision conflict', () => {
        const m = make(), before = rfi(m);
        const returned = { ...before, revision_number: 2, workflow_state: 'returned_to_team' };
        const rejection = { sqlstate: '23514', message: 'Only submitted RFIs can be returned for clarification.' };
        const a = race('a','stale',returned);
        expect(assertRace('stale',a,race('b','stale',null,{ rejection }),before)).toEqual([returned]);
        for (const invalid of [null, { ...rejection, message: 'Completed artifacts are immutable.' },
            { ...rejection, sqlstate: '42501' }, { ...rejection, sqlstate: '40001' }]) {
            expect(() => assertRace('stale',a,race('b','stale',null,{ rejection: invalid }),before)).toThrow(/rejection/);
        }
        const sql = raceSql(m,'stale',before).b;
        expect(sql).toContain("WHEN SQLSTATE '23514' THEN");
        expect(sql).toContain("IF SQLERRM IS DISTINCT FROM 'Only submitted RFIs can be returned for clarification.' THEN RAISE; END IF;");
        expect(sql).toContain('GET STACKED DIAGNOSTICS rejection_code=RETURNED_SQLSTATE,rejection_message=MESSAGE_TEXT;');
        expect(sql).not.toContain('WHEN OTHERS');
    });
    it('requires contention and independent committed state even for an already-returned rejection', async () => {
        const m = make(), before = rfi(m);
        const returned = { ...before, revision_number: 2, workflow_state: 'returned_to_team' };
        const rejection = { sqlstate: '23514', message: 'Only submitted RFIs can be returned for clarification.' };
        const a = race('a','stale',returned), b = race('b','stale',null,{ rejection });
        expect(() => assertRace('stale',a,race('b','stale',null,{ rejection, waited_ms: 0 }),before)).toThrow(/backends/);
        for (const persisted of [returned, { ...returned, revision_number: 3 }]) {
            const send = vi.fn(async label => label.endsWith('-A') ? a : label.endsWith('-B') ? b : ok([persisted]));
            const task = runRace(m,'stale',before,send,async () => {});
            if (persisted.revision_number === 2) await expect(task).resolves.toEqual([returned]);
            else await expect(task).rejects.toThrow(/committed state/);
            expect(send.mock.calls[2][0]).toBe('race-stale-committed');
        }
    });
});

const sqlReceipt = hash => ok([{ cleared: '', evidence: { suite: 'GC07', result: 'PASS', suiteSha256: hash,
    assertions: 104, checks: Array.from({ length: 104 }, (_, i) => `check ${i}`), rollbackVerified: true,
    rollbackScope: 'fixture subtransaction', sessionIds: [randomUUID(),randomUUID(),randomUUID()],
    remaining: Object.fromEntries(['sessions','rosters','participants','grants','seats','requests','communications','reviews','timeline'].map(k => [k,0])),
    database: 'postgres', databaseRole: 'postgres', rowSecurity: 'on', serverVersion: 'fixture',
    serverStartedAt: '2026-09-20T10:00:00Z', serverFinishedAt: '2026-09-20T10:01:00Z' } }]);
describe('GC07 SQL rollback receipts', () => {
    it('rejects exposed helpers, disabled RLS and missing restrictive policies', () => {
        const rpc = ['write_regional_proposal','append_proposal_thread_message','configure_session_green_shared_facilitator',
            'operator_forward_proposal_response','handoff_regional_orientation','submit_regional_orientation','archive_live_demo_session',
            'write_regional_rfi','send_regional_direct_message','operator_answer_regional_rfi','operator_answer_request','operator_send_communication'];
        const privateNames = ['gc07_facilitates','gc07_message_audience','gc07_legacy_answer_request'];
        const schema = { database_name: 'postgres', row_security: 'on',
            tables: ['sessions','session_participants','actions','communications','requests','timeline','scoped_notetaker_data','artifact_workflow_reviews'].map(name => ({ name,rls: true })),
            functions: [...rpc,...privateNames].map(name => ({ signature: `${name}(uuid)`,authenticated_execute: rpc.includes(name),anon_execute: false })),
            policies: ['gc07_request_rpc_only','gc07_direct_rpc_only'].map(policyname => ({ policyname,permissive: 'RESTRICTIVE' })),
            retry_indexes: [{},{}],triggers: [{ definition: 'gc07_message_audience',enabled: 'O' }] };
        assertDatabase(schema);
        for (const alter of [s => s.tables.pop(), s => s.tables[0].rls = false, s => s.policies.pop(),
            s => s.functions.find(f => f.signature.startsWith('gc07_facilitates')).authenticated_execute = true,
            s => s.functions.find(f => f.signature.startsWith('write_regional_rfi')).anon_execute = true,
            s => s.triggers[0].enabled = 'D']) {
            const damaged = structuredClone(schema); alter(damaged); expect(() => assertDatabase(damaged)).toThrow();
        }
    });
    it('wraps the unchanged suite with a verified subtransaction rollback', () => {
        const source = readFileSync(new URL('../sql/gc07-regional-messaging-editor.sql', import.meta.url),'utf8');
        const sql = sqlEvidenceQuery(source);
        expect(sql).toContain("ERRCODE='Z0707'");
        expect(sql).toContain(sha(source));
        expect(sql).toContain("'requests',(SELECT count(*)");
        expect(sql).not.toMatch(/\bCOMMIT\b|DISABLE ROW/i);
        expect(() => sqlEvidenceQuery(source.replace('ROLLBACK;','COMMIT;'))).toThrow();
    });
    it('rejects missing/duplicate assertions, stale hashes and leftover fixtures', () => {
        const hash = sha('fixture'); assertSqlReceipt(sqlReceipt(hash),hash);
        for (const alter of [r => r.checks[1] = r.checks[0], r => r.remaining.requests = 1,
            r => delete r.remaining.participants, r => r.rollbackVerified = false, r => r.rowSecurity = 'off',
            r => r.suiteSha256 = sha('old')]) {
            const response = sqlReceipt(hash); alter(response.data[0].evidence);
            expect(() => assertSqlReceipt(response,hash)).toThrow();
        }
    });
});

describe('GC07 hosted workflow and manual evidence', () => {
    it('requires White Cell approval before either region receives a synthetic action notification', async () => {
        const session = make().sessions[0], actionIds = { blue: randomUUID(),red: randomUUID() }, approved = new Set();
        const messages = Object.fromEntries(['blue','red'].map(team => [team,{ id: randomUUID(),recipient_scope: 'both_green_delegations',
            metadata: { notification_delivery: 'approved',resolved_delivery_audience: ['asian_pacific','europe'] } }]));
        const rpc = vi.fn(async (who, name, args) => {
            if (who.role !== 'whitecell_lead' || args.requested_notification_teams[0] !== 'green') return { status: 403,data: { code: '42501' } };
            approved.add(args.requested_team);
            return ok({ artifact: { workflow_state: 'completed' },communications: [messages[args.requested_team]] });
        });
        const request = vi.fn(async (who,path) => {
            const team = path.includes('team=eq.blue') || path.includes(actionIds.blue) ? 'blue' : 'red';
            return path.startsWith('/rest/v1/actions?') ? ok([{ id: actionIds[team],goal: `GC07 synthetic notification fixture ${team}`,
                workflow_state: 'submitted_to_white_cell',revision_number: 1 }]) : ok(approved.has(team) ? [messages[team]] : []);
        });
        await notificationWorkflow(session,{ rpc,request,record: vi.fn(),fresh: vi.fn() });
        expect(rpc).toHaveBeenCalledTimes(6);
        expect(rpc.mock.calls.filter(([who,,args]) => who.role === 'whitecell_lead' && args.requested_notification_teams[0] === 'green')).toHaveLength(2);
        for (const role of ['green_asian_pacific_scribe','green_europe_scribe'])
            expect(request.mock.calls.filter(([who]) => who.role === role)).toHaveLength(2);
    });
    it('retains the legacy Facilitator role and old answer signature', async () => {
        const s = make().sessions[2], value = { id: randomUUID(), delegation_id: null, status: 'answered' };
        const request = vi.fn(async () => ok([value])), rpc = vi.fn(async () => ok(value));
        await workflow(s,{ request,rpc,record: vi.fn(),fresh: vi.fn() });
        expect(request.mock.calls[0][0].role).toBe('green_scribe');
        expect(rpc.mock.calls[0][1]).toBe('operator_answer_request');
    });
    it('never accepts a pending template or missing manual provenance as a pass', () => {
        const report = { run: randomUUID(), projectRef: 'abcdefghijklmnopqrst', baseURL: 'https://example.test/',
            passed: true, workflowPassed: true, racesPassed: true, cleanupPassed: true, actors: [],
            deployment: { build: { source: { digest: sha('source') } } } };
        const hash = sha('report'), form = template(report,hash);
        expect(form.checks).toHaveLength(21);
        expect(form.checks.every(c => c.status === 'pending')).toBe(true);
        expect(form.checks.find(c => c.model === 'unified' && c.id === 'audiences-and-approval').instruction).toContain('delivery to unified Green');
        expect(() => assertManual(form,report,hash)).toThrow();
        Object.assign(form,{ operator: 'Tester',browser: 'Chrome version',os: 'Windows version',screenReader: 'NVDA version' });
        form.sessions.forEach(s => { s.cleanupReceipt = 'cleanup.json';
            s.actors.forEach(a => { a.authUserId = randomUUID(); a.seatId = randomUUID(); }); });
        form.checks.forEach(c => Object.assign(c,{ status: 'pass',observedAt: new Date().toISOString(),
            observation: 'Synthetic test fixture observation only.',evidenceFiles: ['notes.txt'] }));
        assertManual(form,report,hash);
        form.checks[0].status = 'skipped'; expect(() => assertManual(form,report,hash)).toThrow();
        form.checks[0].status = 'pass'; expect(() => assertManual(form,report,sha('other'))).toThrow();
        const fixture = manualManifest(form,report);
        expect(setupSql(fixture)).toContain('model must be configured before joins');
        report.actors = [{ userId: form.sessions[0].actors[0].authUserId }];
        expect(() => manualManifest(form,report)).toThrow(/independent/);
    });
    it('rejects manual evidence paths outside the run directory before reading any file', async () => {
        for (const name of ['../other.json','C:\\secrets.txt','/tmp/other','subfolder/notes.txt',''])
            await expect(evidenceFile('unused',name)).rejects.toThrow(/directly/);
    });
});
