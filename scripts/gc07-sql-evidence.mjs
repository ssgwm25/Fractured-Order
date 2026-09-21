// Human-run capture only. No migration application or historical receipt reconstruction.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promptToken } from './gc03-race-runner.mjs';
import { redact } from './gc04-live-contract.mjs';
import { check, one } from './gc07-live-contract.mjs';
import { sha, sourceSnapshot, assertSource, databaseSql, assertDatabase } from './gc07-live-provenance.mjs';

export function sqlEvidenceQuery(source) {
    const normalized = source.replaceAll('\r\n', '\n');
    const match = normalized.match(/\bBEGIN;\n([\s\S]*?)(DO \$gc07_suite\$[\s\S]*?END \$gc07_suite\$;)/);
    check(match && /ROLLBACK;\s*$/.test(normalized) && !/\bCOMMIT\b/.test(normalized)
        && !normalized.includes('$gc07_original$'), 'unexpected GC07 rollback suite shape');
    return `DO $gc07_capture$
DECLARE report JSONB; ids UUID[]; rosters TEXT[]; actors UUID[];
started TIMESTAMPTZ:=clock_timestamp(); rolled_back BOOLEAN:=false; remaining JSONB;
BEGIN
    BEGIN
        EXECUTE $gc07_original$${match[1]}${match[2]}$gc07_original$;
        report:=NULLIF(current_setting('gc07.rehearsal_result',true),'')::JSONB;
        SELECT array_agg(id),array_agg(roster) INTO ids,rosters FROM pg_temp.gc07_sessions;
        SELECT array_agg(auth_id) INTO actors FROM pg_temp.gc07_actors;
        IF report IS NULL OR cardinality(ids)<>3 THEN RAISE EXCEPTION 'GC07 capture missing'; END IF;
        RAISE EXCEPTION USING ERRCODE='Z0707',MESSAGE='GC07 deliberate fixture rollback';
    EXCEPTION WHEN SQLSTATE 'Z0707' THEN
        IF report IS NULL OR ids IS NULL THEN RAISE; END IF;
        rolled_back:=true;
    END;
    SELECT jsonb_build_object(
        'sessions',(SELECT count(*) FROM public.sessions WHERE id=ANY(ids)),
        'rosters',(SELECT count(*) FROM public.green_roster_approvals WHERE version=ANY(rosters)),
        'participants',(SELECT count(*) FROM public.participants WHERE auth_user_id=ANY(actors)),
        'grants',(SELECT count(*) FROM public.operator_grants WHERE auth_user_id=ANY(actors)),
        'seats',(SELECT count(*) FROM public.session_participants WHERE session_id=ANY(ids)),
        'requests',(SELECT count(*) FROM public.requests WHERE session_id=ANY(ids)),
        'communications',(SELECT count(*) FROM public.communications WHERE session_id=ANY(ids)),
        'reviews',(SELECT count(*) FROM public.artifact_workflow_reviews WHERE session_id=ANY(ids)),
        'timeline',(SELECT count(*) FROM public.timeline WHERE session_id=ANY(ids))) INTO remaining;
    IF NOT rolled_back OR EXISTS(SELECT 1 FROM jsonb_each_text(remaining) r WHERE r.value::integer<>0)
        OR to_regclass('pg_temp.gc07_sessions') IS NOT NULL THEN RAISE EXCEPTION 'GC07 rollback postcondition failed'; END IF;
    report:=report||jsonb_build_object('suite','GC07','suiteSha256','${sha(source)}',
        'rollbackVerified',true,'rollbackScope','fixture subtransaction','remaining',remaining,'sessionIds',ids,
        'serverStartedAt',started,'serverFinishedAt',clock_timestamp(),'database',current_database(),
        'databaseRole',current_user,'rowSecurity',current_setting('row_security'),'serverVersion',version());
    PERFORM set_config('gc07.evidence_receipt',report::TEXT,false);
END $gc07_capture$;
WITH receipt AS MATERIALIZED (SELECT current_setting('gc07.evidence_receipt')::JSONB AS evidence)
SELECT evidence,set_config('gc07.evidence_receipt','',false) AS cleared FROM receipt;`;
}
export function assertSqlReceipt(response, suiteHash) {
    const r = response?.data?.[0]?.evidence;
    check(response?.status >= 200 && response.status < 300 && response.data?.length === 1 && response.data[0].cleared === ''
        && r?.suite === 'GC07' && r.result === 'PASS' && r.suiteSha256 === suiteHash && /^[a-f0-9]{64}$/.test(suiteHash)
        && r.assertions === 104 && r.checks?.length === 104 && new Set(r.checks).size === 104
        && r.checks.every(c => typeof c === 'string' && c.trim())
        && r.rollbackVerified === true && r.rollbackScope === 'fixture subtransaction'
        && r.sessionIds?.length === 3 && new Set(r.sessionIds).size === 3
        && ['sessions','rosters','participants','grants','seats','requests','communications','reviews','timeline'].every(k => r.remaining?.[k] === 0)
        && r.rowSecurity === 'on' && ['database','databaseRole','serverVersion'].every(k => typeof r[k] === 'string' && r[k])
        && Number.isFinite(Date.parse(r.serverStartedAt)) && Number.isFinite(Date.parse(r.serverFinishedAt))
        && Date.parse(r.serverFinishedAt) >= Date.parse(r.serverStartedAt), 'missing distinct passes, source, server metadata or rollback evidence');
    return r;
}
export async function sqlEvidence() {
    let env = '';
    try { env = await readFile('.env.local', 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const url = process.env.VITE_SUPABASE_URL || env.match(/^\s*VITE_SUPABASE_URL\s*=\s*['"]?([^\s'"]+)/m)?.[1];
    const projectRef = url?.match(/^https:\/\/([a-z]{20})\.supabase\.co\/?$/)?.[1];
    check(projectRef && process.env.GC07_EVIDENCE_OPERATOR?.trim(), 'set rehearsal VITE_SUPABASE_URL and GC07_EVIDENCE_OPERATOR');
    const run = randomUUID(), directory = resolve('output/release-evidence/gc07', run), secrets = [];
    await mkdir(directory, { recursive: true });
    const report = { run, projectRef, operator: process.env.GC07_EVIDENCE_OPERATOR.trim(), mode: 'sql',
        startedAt: new Date().toISOString(), requests: [], passed: false, historicalMigrationReceipt: 'not supplied' };
    const save = () => writeFile(resolve(directory, 'results.json'), JSON.stringify(redact(report, secrets), null, 2));
    console.log(`GC07 SQL target ${projectRef}; evidence ${directory}. Harness only; no migration installation.`);
    try {
        report.source = await sourceSnapshot();
        const token = await promptToken(); secrets.push(token);
        check(/^sbp_[A-Za-z0-9_-]+$/.test(token), 'expected a personal access token');
        const send = async (label, query, readOnly) => {
            const entry = { label, querySha256: sha(query), readOnly, startedAt: new Date().toISOString() };
            report.requests.push(entry);
            await writeFile(resolve(directory, `${label}.sql`), query, { flag: 'wx' }); await save();
            try {
                const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
                    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90000),
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, read_only: readOnly })
                });
                entry.status = response.status; entry.requestId = response.headers.get('sb-request-id');
                entry.data = await response.json(); return entry;
            } finally { entry.finishedAt = new Date().toISOString(); await save(); }
        };
        const suite = await readFile('tests/sql/gc07-regional-messaging-editor.sql', 'utf8');
        const migration = await readFile('data/2026-09-28_gc07_regional_messaging.sql');
        report.suiteSha256 = sha(suite); report.migrationSourceSha256 = sha(migration);
        await writeFile(resolve(directory, 'original-suite.sql'), suite, { flag: 'wx' });
        await writeFile(resolve(directory, 'migration-source.sql'), migration, { flag: 'wx' });
        if (process.env.GC07_MIGRATION_RECEIPT) {
            const bytes = await readFile(process.env.GC07_MIGRATION_RECEIPT);
            check(bytes.length > 0, 'empty historical migration receipt');
            await writeFile(resolve(directory, 'original-application-receipt.txt'), bytes, { flag: 'wx' });
            report.historicalMigrationReceipt = { sha256: sha(bytes), status: 'retained verbatim; requires operator provenance review' };
        }
        report.databaseBefore = one(await send('installed-schema-before', databaseSql, true));
        assertDatabase(report.databaseBefore);
        report.sql = assertSqlReceipt(await send('assertions-and-rollback', sqlEvidenceQuery(suite), false), report.suiteSha256);
        report.databaseAfter = one(await send('installed-schema-after', databaseSql, true));
        check(JSON.stringify(report.databaseBefore) === JSON.stringify(report.databaseAfter), 'schema/ACL/trigger drift');
        assertSource(report.source, await sourceSnapshot());
        report.passed = true;
    } catch (e) { report.error = e.message; process.exitCode = 1; }
    finally { report.finishedAt = new Date().toISOString(); await save(); }
    console.log(`GC07 SQL ${report.passed ? 'PASS' : 'FAIL'}: ${resolve(directory, 'results.json')}`);
}
