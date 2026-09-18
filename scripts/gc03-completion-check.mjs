// Human-run only. `run` creates fresh synthetic fixtures; `logs` is read-only.
import { readFile, writeFile, mkdir, open, unlink, access } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makeManifest, publicKey } from './gc03-hosted-check.mjs';
import { promptToken } from './gc03-race-runner.mjs';
import { ACTORS, buildCompletionSql, inventorySql } from './gc03-completion-sql.mjs';
import { completionMatrix } from './gc03-completion-matrix.mjs';
import { recordedRequest } from './gc03-recorded-request.mjs';
import { validateAuthResume, provisionActor } from './gc03-auth-resume.mjs';
import { check, ok, uuid, assertInventory, assertEdgeLogs, logQuery } from './gc03-completion-contract.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const FUNCTIONS = ['trigger-pli-adjudication', 'pli-report-narrative'];
const SOURCES = ['scripts/gc03-completion-check.mjs', 'scripts/gc03-completion-contract.mjs',
    'scripts/gc03-completion-sql.mjs', 'scripts/gc03-completion-matrix.mjs', 'scripts/gc03-hosted-check.mjs',
    'scripts/gc03-race-runner.mjs', 'scripts/gc03-recorded-request.mjs',
    'scripts/gc03-auth-resume.mjs',
    'src/features/actions/proposalDetails.js',
    'data/2026-09-19_green_regional_authorization.sql', 'data/2026-09-20_gc03_terminal_revision_conflicts.sql',
    'data/2026-09-21_gc03_recipient_forward_uniqueness.sql',
    'supabase/functions/_shared/authorizeDerivedOperation.js',
    ...FUNCTIONS.map(name => `supabase/functions/${name}/index.ts`)];

export function redactSecrets(value, secrets) {
    let text = JSON.stringify(value);
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) text = text.replaceAll(secret, '[REDACTED]');
    return JSON.parse(text);
}

async function management(token, ref, path, body) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000)
    });
    let data; const text = await response.text();
    try { data = JSON.parse(text); } catch { data = { unparsed: text.slice(0, 1000) }; }
    return { status: response.status, data, at: new Date().toISOString(),
        requestId: response.headers.get('sb-request-id') || response.headers.get('x-request-id') };
}

async function tokenInput() {
    const token = await promptToken();
    check(/^sbp_[A-Za-z0-9_-]+$/.test(token), 'personal access token beginning sbp_ required');
    return token;
}

async function captureLogs(ref, token, report) {
    check(report.edge?.length === 6, 'six recorded Edge checks required before log collection');
    const query = logQuery(report.edge);
    const start = new Date(Date.parse(report.edgeStartedAt) - 60000).toISOString();
    const end = new Date(Date.parse(report.edgeFinishedAt) + 60000).toISOString();
    const search = new URLSearchParams({ sql: query,
        iso_timestamp_start: start, iso_timestamp_end: end });
    const response = await management(token, ref, `/analytics/endpoints/logs?${search}`);
    report.logCapture = { query, start, end, ...response };
    assertEdgeLogs(report.edge, ok(response, 'log endpoint'));
    report.logsPassed = true;
}

async function run(ref, resume) {
    const m = resume?.manifest || { ...makeManifest(ref), legacy: randomUUID() };
    const token = await tokenInput(), key = await publicKey(ref), secrets = [token, key];
    const directory = resolve('test-results/gc03-completion', m.run);
    await mkdir(directory, { recursive: true });
    const reportPath = resolve(directory, 'completion-results.json');
    const report = { run: m.run, projectRef: ref, startedAt: new Date().toISOString(),
        sourceHashes: {}, checkpoints: [], requests: [], edge: [], auth: [], setupAttempted: false,
        matrixPassed: false, cleanupPassed: false, logsPassed: false,
        ...(resume ? { resumedFrom: resume.previousReport } : {}) };
    const save = () => writeFile(reportPath, JSON.stringify(redactSecrets(report, secrets), null, 2));
    const users = resume?.state.users || {}, state = { run: m.run, users };
    for (const user of Object.values(users)) secrets.push(user.access_token, user.refresh_token);
    const attemptPrefix = resume ? `resume-${randomUUID()}-` : '';
    const sql = async (label, query) => {
        const file = `${attemptPrefix}${label}-${report.requests.length}.sql`;
        await writeFile(resolve(directory, file), query, { flag: 'wx' });
        const result = await management(token, ref, '/database/query', { query, read_only: false });
        report.requests.push({ label, sqlFile: file, sqlSha256: sha(query), ...result }); await save();
        const data = ok(result, label); check(Array.isArray(data), `${label}: database rows expected`); return data;
    };
    const request = async (who, path, method = 'GET', body) => {
        check(users[who]?.access_token, `authenticated identity ${who}`);
        return recordedRequest({ requests: report.requests, save, who, path, method,
            send: () => fetch(`https://${ref}.supabase.co${path}`, {
            method, redirect: 'error', headers: { apikey: key, Authorization: `Bearer ${users[who].access_token}`,
                'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)
        }) });
    };
    const checkpoint = label => { report.checkpoints.push({ label, at: new Date().toISOString() }); console.log(`PASS: ${label}`); };
    let sqlFiles, context, setupAttempted = false;
    try {
        const git = promisify(execFile);
        report.sourceRevision = (await git('git', ['rev-parse', 'HEAD'])).stdout.trim();
        report.workingTree = (await git('git', ['status', '--porcelain'])).stdout;
        for (const file of SOURCES) report.sourceHashes[file] = sha(await readFile(file));
        if (!resume) await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(m, null, 2), { flag: 'wx' });
        const catalog = await sql('deployed-authorization-inventory', inventorySql());
        assertInventory(catalog[0]?.inventory); checkpoint('deployed restrictive policies, triggers and private RPC grants');
        if (resume) {
            const ids = [...Object.values(m.sessions), m.legacy].map(id => `'${uuid(id)}'`).join(',');
            const found = await sql('auth-resume-presence', `SELECT id FROM public.sessions WHERE id IN (${ids});`);
            check(found.length === 0, 'Auth resume refuses existing sessions; inspect the retained report');
        }
        report.deploymentsBefore = {};
        for (const name of FUNCTIONS) {
            const r = await management(token, ref, `/functions/${name}`);
            const f = ok(r, `function metadata ${name}`);
            check(f.id && Number.isInteger(f.version) && f.status === 'ACTIVE', `active version ${name}`);
            report.deploymentsBefore[name] = { ...r, data: { id: f.id, version: f.version, slug: f.slug, status: f.status, updated_at: f.updated_at } };
        }
        const { createClient } = await import('@supabase/supabase-js');
        for (const who of ACTORS) {
            const client = createClient(`https://${ref}.supabase.co`, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
            const action = await provisionActor({ who, runId: m.run, users, auth: client.auth,
                protect: (...values) => secrets.push(...values),
                persist: () => writeFile(resolve(directory, 'private-auth.json'), JSON.stringify(state, null, 2), { mode: 0o600 }) });
            report.auth.push({ who, action }); await save();
        }
        sqlFiles = buildCompletionSql(m, users);
        await writeFile(resolve(directory, 'cleanup.sql'), sqlFiles.cleanup, { flag: 'wx' });
        setupAttempted = true;
        report.setupAttempted = true; await save();
        const setup = await sql('setup', sqlFiles.setup);
        check(setup[0]?.run_id === m.run, 'fixture setup committed');
        console.log(`Fresh fixture run: ${m.run}. Synthetic checks only; automatic archival follows.`);
        context = await completionMatrix({ m, users, request, sql, checkpoint });
        await context.renew();
        report.edgeStartedAt = new Date().toISOString();
        for (const who of ['apF', 'euF', 'outsider']) {
            for (const name of FUNCTIONS) {
                const operation = name === FUNCTIONS[0] ? 'adjudicate' : 'narrative';
                const result = await request(who, `/functions/v1/${name}`, 'POST', operation === 'adjudicate'
                    ? { sessionId: m.sessions.api, dryRun: true }
                    : { sessionId: m.sessions.api, scope: 'simulation', factPack: { gc03Synthetic: true } });
                check(result.status === 403 && result.data?.error === 'Session operation is not authorized', `${name} denial`);
                uuid(result.correlationId);
                const deployed = report.deploymentsBefore[name].data;
                report.edge.push({ who, name, operation, correlationId: result.correlationId,
                    deploymentId: `${ref}_${deployed.id}_${deployed.version}` });
            }
        }
        report.edgeFinishedAt = new Date().toISOString();
        report.deploymentsAfter = {};
        for (const name of FUNCTIONS) {
            const result = await management(token, ref, `/functions/${name}`);
            const f = ok(result, `function metadata after ${name}`);
            check(f.id === report.deploymentsBefore[name].data.id && f.version === report.deploymentsBefore[name].data.version
                && f.status === 'ACTIVE', 'no deployment changed during checks');
            report.deploymentsAfter[name] = { id: f.id, version: f.version, slug: f.slug, status: f.status };
        }
        report.matrixPassed = true;
        checkpoint('Edge denials with server correlation and deployment versions');
    } catch (error) {
        report.failure = error.message;
        console.error(redactSecrets(error.message, secrets));
    } finally {
        if (setupAttempted) {
            try {
                // A setup network timeout does not imply rollback. Inspect exact IDs first.
                const ids = [...Object.values(m.sessions), m.legacy].map(id => `'${uuid(id)}'`).join(',');
                const found = await sql('cleanup-presence', `SELECT id FROM public.sessions WHERE id IN (${ids});`);
                if (found.length === 0) report.cleanupPassed = true;
                else {
                    check(found.length === 5, 'all-or-none setup; manual inspection required');
                    const result = await sql('archive', sqlFiles.cleanup);
                    check(result.length === 5 && result.every(r => r.status === 'archived'), 'five fixtures archived');
                    report.cleanupPassed = true; checkpoint('five fresh fixtures archived; history retained');
                }
                if (report.matrixPassed) {
                    for (const who of ['apS', 'apF', 'euF']) {
                        const r = await request(who, '/rest/v1/rpc/claim_session_role_seat', 'POST', {
                            requested_session_id: m.sessions.api, requested_role: who === 'apS' ? 'green_asian_pacific_scribe'
                                : who === 'apF' ? 'green_asian_pacific_facilitator' : 'green_europe_facilitator',
                            requested_client_id: `gc03-completion-${m.run}-${who}` });
                        check(r.status === 403 && r.data?.code === '42501', 'archived session rejects claim');
                        const beat = await context.heartbeat(who);
                        check(beat.status === 403 && beat.data?.code === '42501', 'archived session rejects heartbeat');
                        const capability = await request(who, '/rest/v1/rpc/green_has_capability', 'POST', {
                            requested_session_id: m.sessions.api, requested_capability: 'draft' });
                        check(ok(capability, 'archived capability') === false, 'archived authority closed');
                    }
                    checkpoint('archived-session authority closed');
                }
            } catch (error) { report.cleanupPassed = false; report.cleanupFailure = error.message; }
        }
        report.finishedAt = new Date().toISOString(); await save();
    }
    if (report.matrixPassed && report.cleanupPassed) {
        try { await captureLogs(ref, token, report); }
        catch (error) { report.logFailure = error.message; }
        await save();
    }
    console.log(`Evidence: ${reportPath}`);
    if (!report.matrixPassed || !report.cleanupPassed) {
        process.exitCode = 1;
        if (!setupAttempted && /^FAIL: anonymous Auth /.test(report.failure || '')) {
            console.error(`STOP: Auth provisioning incomplete; no fixture setup attempted. Retain private-auth.json locally.\nAfter resolving the Auth error or waiting for the rate limit to reset, use:\nnode scripts/gc03-completion-check.mjs resume-auth ${m.run}`);
        } else console.error('STOP: retain the report. Do not repeat run or change policies to force a pass.');
    } else if (!report.logsPassed) {
        process.exitCode = 1;
        console.log(`API checks and archival passed; server log evidence is pending. After logs arrive, run:\nnode scripts/gc03-completion-check.mjs logs ${m.run}`);
    } else console.log('PASS: completion API matrix, archival and correlated deployment logs. Retain for GC-03 evidence review.');
}

async function resumeAuth(runId) {
    uuid(runId);
    const directory = resolve('test-results/gc03-completion', runId);
    const lockPath = resolve(directory, 'auth-resume.lock');
    const lock = await open(lockPath, 'wx');
    try {
        const originalText = await readFile(resolve(directory, 'completion-results.json'), 'utf8');
        const original = JSON.parse(originalText);
        const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
        const state = JSON.parse(await readFile(resolve(directory, 'private-auth.json'), 'utf8'));
        check(runId === manifest.run, 'requested resume run');
        validateAuthResume(original, manifest, state);
        // This sidecar is written before setup dispatch, including timeout cases.
        let cleanupExists = true;
        try { await access(resolve(directory, 'cleanup.sql')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; cleanupExists = false; }
        check(!cleanupExists, 'Auth resume refuses any prepared fixture setup');
        const previousReport = `completion-before-resume-${randomUUID()}.json`;
        await writeFile(resolve(directory, previousReport), originalText, { flag: 'wx' });
        console.log(`Resume Auth only: ${Object.keys(state.users).length} saved identities; ${ACTORS.length - Object.keys(state.users).length} missing. Previous report retained as ${previousReport}.`);
        await run(manifest.projectRef, { manifest, state, previousReport });
    } finally {
        await lock.close(); await unlink(lockPath);
    }
}

async function logs(runId) {
    uuid(runId);
    const directory = resolve('test-results/gc03-completion', runId);
    const original = JSON.parse(await readFile(resolve(directory, 'completion-results.json'), 'utf8'));
    check(original.run === runId && original.matrixPassed && original.cleanupPassed, 'successful original run and archival');
    check(/^[a-z]{20}$/.test(original.projectRef), 'project reference');
    const token = await tokenInput();
    const report = { ...original, logsPassed: false, logRetryAt: new Date().toISOString() };
    try { await captureLogs(report.projectRef, token, report); delete report.logFailure; }
    catch (error) { report.logFailure = error.message; process.exitCode = 1; }
    const path = resolve(directory, `logs-results-${Date.now()}.json`);
    await writeFile(path, JSON.stringify(redactSecrets(report, [token]), null, 2), { flag: 'wx' });
    console.log(`${report.logsPassed ? 'PASS: matching server authorization logs and deployment versions.' : 'PENDING: log evidence incomplete; retain report.'}\nEvidence: ${path}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const [command, argument] = process.argv.slice(2);
    (command === 'run' ? run(argument) : command === 'logs' ? logs(argument) : command === 'resume-auth' ? resumeAuth(argument)
        : Promise.reject(new Error('Usage: node scripts/gc03-completion-check.mjs run PROJECT_REF | logs RUN_UUID | resume-auth RUN_UUID')))
        .catch(error => { console.error(error.message); process.exitCode = 1; });
}
