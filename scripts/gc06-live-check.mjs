// Explicit human-run CLI. Never builds, migrates, deploys, or changes an existing exercise.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { promptToken } from './gc03-race-runner.mjs';
import { publicKey } from './gc03-hosted-check.mjs';
import { redact, uuid } from './gc04-live-contract.mjs';
import { makeManifest, validate, roles, check, setupSql, cleanupSql, stateSql, idsSql, setupLock, begin, assertCleanup, assertSeat, one, rows, writeArgs } from './gc06-live-contract.mjs';
import { workflow } from './gc06-live-workflow.mjs';
import { runRace } from './gc06-live-race.mjs';
import { prepare, seal, sha, sourceSnapshot, assertSource, verifyDeployment, databaseSql, assertDatabase } from './gc06-live-provenance.mjs';

const ROOT = 'test-results/gc06-live';
async function configuration() {
    let env = '';
    try { env = await readFile('.env.local', 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const url = process.env.VITE_SUPABASE_URL || env.match(/^\s*VITE_SUPABASE_URL\s*=\s*['"]?([^\s'"]+)/m)?.[1];
    const projectRef = url?.match(/^https:\/\/([a-z]{20})\.supabase\.co\/?$/)?.[1];
    check(projectRef, 'set the rehearsal VITE_SUPABASE_URL in .env.local');
    check(process.env.GC06_BASE_URL, 'set GC06_BASE_URL to the tested app directory URL, including its trailing slash');
    return { projectRef, key: await publicKey(projectRef) };
}
async function management(projectRef, token, query) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, read_only: false }), signal: AbortSignal.timeout(45000)
    });
    return { status: response.status, data: await response.json(), requestId: response.headers.get('sb-request-id') };
}
export async function cleanup(m, send) {
    validate(m);
    // Wait for a possibly timed-out setup request to commit/roll back before declaring fixtures absent.
    const presence = rows(await send('cleanup-presence', `${begin}\n${setupLock(m)}\nCOMMIT;
SELECT id FROM public.sessions WHERE id IN (${idsSql(m)});`));
    check(new Set(presence.map(r => r.id)).size === presence.length && presence.every(r => m.sessions.some(s => s.id === r.id)), 'unexpected fixture presence');
    if (presence.length === 0) {
        // Setup is atomic. Prove that even its authority/roster writes rolled back.
        const leftover = one(await send('cleanup-absent-confirmation', `SELECT
        (SELECT count(*)::integer FROM public.green_roster_approvals WHERE version='${m.roster}') AS rosters,
        (SELECT count(*)::integer FROM public.operator_grants WHERE auth_user_id IN (${m.sessions.flatMap(s => s.actors.map(a => `'${a.userId}'`)).join(',')})) AS grants;`));
        check(leftover.rosters === 0 && leftover.grants === 0, 'absent sessions have leftover authority/roster');
        return { outcome: 'absent', passed: true };
    }
    check(presence.length === 3, 'partial fixture set; refusing automatic cleanup');
    const before = rows(await send('cleanup-history-before', stateSql(m)));
    rows(await send('cleanup-archive', cleanupSql(m)));
    const after = rows(await send('cleanup-independent-confirmation', stateSql(m)));
    assertCleanup(m, before, after);
    return { outcome: 'archived-history-retained', passed: true, before, after };
}
function recorder(directory, report, secrets) {
    let pending = Promise.resolve();
    const save = () => {
        const snapshot = JSON.stringify(redact(report, secrets), null, 2);
        pending = pending.then(() => writeFile(resolve(directory, report.file || 'results.json'), snapshot));
        return pending;
    };
    const sql = (projectRef, token) => async (label, query) => {
        const filename = `${label}-${randomUUID()}.sql`, entry = { label, filename, sha256: sha(query), startedAt: new Date().toISOString() };
        report.requests.push(entry);
        await writeFile(resolve(directory, filename), query, { flag: 'wx' });
        await save(); // Intent and exact query are on disk before any write is dispatched.
        try { entry.response = await management(projectRef, token, query); return entry.response; }
        catch (error) { entry.error = error.message; throw error; }
        finally { entry.finishedAt = new Date().toISOString(); await save(); }
    };
    return { save, sql };
}
async function run(local) {
    const config = await configuration(), m = makeManifest(config.projectRef, process.env.GC06_BASE_URL, local);
    const directory = resolve(ROOT, m.run), secrets = [config.key], clients = new Map();
    await mkdir(directory, { recursive: true });
    const report = { stage: m.stage, run: m.run, projectRef: m.projectRef, baseURL: m.baseURL,
        target: local ? 'local-assets-hosted-auth-rpc' : 'hosted-assets-and-auth-rpc',
        startedAt: new Date().toISOString(), requests: [], checks: [], actors: [], workflowPassed: false, racesPassed: false,
        cleanupPassed: false, passed: false, limitations: ['No hosted browser interaction is automated.',
            'Workflow users are separate real Supabase anonymous Auth users, not named staff accounts.',
            'SQL races use simulated claims of those users on distinct PostgreSQL connections.',
            'Synthetic roster approval applies only to the recorded fixture sessions.'] };
    const { save, sql } = recorder(directory, report, secrets);
    const saveManifest = () => writeFile(resolve(directory, 'manifest.json'), JSON.stringify(m, null, 2));
    await saveManifest(); await save();
    console.log(`GC06 run ${m.run}; project ${m.projectRef}; tested URL ${m.baseURL}`);
    console.log(`Evidence: ${directory}`);
    let send, setupAttempted = false, interrupted = false;
    const signal = () => { interrupted = true; console.error('GC06 interruption requested. Settling current requests, then archiving fixtures. Do not close this terminal.'); };
    process.on('SIGINT', signal); process.on('SIGTERM', signal);
    const active = () => check(!interrupted, 'interrupted; preserve failed run and clean up');
    const record = async (label, detail = {}) => { report.checks.push({ label, at: new Date().toISOString(), detail }); await save(); };
    const request = async (actor, path, method = 'GET', body) => {
        active();
        const entry = { actor: actor.role, userId: actor.userId, sessionId: actor.sessionId, path, method, startedAt: new Date().toISOString() };
        report.requests.push(entry); await save();
        try {
            const response = await fetch(`https://${m.projectRef}.supabase.co${path}`, {
                method, redirect: 'error', signal: AbortSignal.timeout(30000),
                headers: { apikey: config.key, Authorization: `Bearer ${clients.get(actor.userId).token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
                ...(body === undefined ? {} : { body: JSON.stringify(body) })
            });
            const text = await response.text();
            const data = text ? JSON.parse(text) : null;
            entry.response = { status: response.status, data, requestId: response.headers.get('sb-request-id') };
            return entry.response;
        } catch (error) { entry.error = error.message; throw error; }
        finally { entry.finishedAt = new Date().toISOString(); await save(); }
    };
    const rpc = (actor, name, body) => request(actor, `/rest/v1/rpc/${name}`, 'POST', body);
    const fresh = async session => {
        for (const actor of session.actors) {
            const seat = one(await rpc(actor, 'claim_session_role_seat', { requested_session_id: session.id, requested_role: actor.role,
                requested_name: 'GC06 SYNTHETIC REHEARSAL', requested_client_id: actor.clientId, requested_timeout_seconds: 90 }));
            assertSeat(session, actor, seat);
            actor.seat = seat;
        }
        await saveManifest();
    };
    try {
        console.log('Checking source/build/deployed asset parity before creating Auth users.');
        report.deployment = await verifyDeployment(m.baseURL, m.projectRef); await save(); active();
        const token = await promptToken();
        check(/^sbp_[A-Za-z0-9_-]+$/.test(token), 'expected a Supabase personal access token');
        secrets.push(token); send = sql(m.projectRef, token);
        report.databaseBefore = one(await send('database-preflight', databaseSql));
        assertDatabase(report.databaseBefore); await save();
        for (const session of m.sessions) {
            for (const role of roles(session.model)) {
                active();
                const client = createClient(`https://${m.projectRef}.supabase.co`, config.key,
                    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
                const { data, error } = await client.auth.signInAnonymously({ options: { data: { gc06_synthetic_rehearsal: m.run } } });
                check(!error && data?.session && data.user?.id, `hosted Auth: ${error?.message || 'missing session'}`);
                secrets.push(data.session.access_token, data.session.refresh_token);
                clients.set(data.user.id, { client, token: data.session.access_token });
                const actor = { role, userId: data.user.id, clientId: `gc06-${data.user.id}`, sessionId: session.id };
                session.actors.push(actor); report.actors.push({ ...actor }); await saveManifest(); await save();
                check(one(await request(actor, '/auth/v1/user')).id === actor.userId, 'hosted user endpoint must confirm identity');
            }
        }
        validate(m);
        await writeFile(resolve(directory, 'cleanup.sql'), cleanupSql(m), { flag: 'wx' });
        setupAttempted = true; report.setupAttempted = true; await save();
        report.setup = rows(await send('setup-before-any-joins', setupSql(m)));
        check(report.setup.length === 3 && report.setup.every(s => s.topology_frozen_at === null), 'all configured fixtures must be fresh');
        for (const session of m.sessions) {
            active(); console.log(`Exercising ${session.model}: ${session.id}`);
            await fresh(session); await workflow(session, { rpc, request, record, fresh });
        }
        report.workflowPassed = true; await save();
        const shared = m.sessions[0];
        for (const mode of ['regions', 'retry', 'stale']) {
            active(); console.log(`Two-connection contention: ${mode}`); await fresh(shared);
            let action;
            if (mode === 'stale') action = one(await rpc(shared.actors.find(a => a.role === 'green_asian_pacific_scribe'),
                'write_regional_proposal', writeArgs(shared, 'asian_pacific', 'forward', null, 'race-forwarded')));
            await runRace(m, mode, action, send, record);
        }
        report.racesPassed = true;
        report.databaseAfter = one(await send('database-postflight', databaseSql));
        check(JSON.stringify(report.databaseBefore) === JSON.stringify(report.databaseAfter), 'database definitions/policies drifted during run');
        report.sourceAfter = await sourceSnapshot(); assertSource(report.deployment.build.source, report.sourceAfter);
        active(); await save();
    } catch (error) { report.error = error.message; }
    finally {
        if (setupAttempted) {
            try { report.cleanup = await cleanup(m, send); report.cleanupPassed = report.cleanup.passed; }
            catch (error) { report.cleanupError = error.message; }
        } else { report.cleanup = { outcome: 'no-fixture-setup-attempted', authenticatedUsersRetained: [...clients.keys()] }; }
        report.authSignOut = [];
        for (const [userId, { client }] of clients) {
            try {
                const { error } = await client.auth.signOut({ scope: 'global' });
                report.authSignOut.push({ userId, passed: !error, ...(error ? { error: error.message } : {}) });
            } catch (error) { report.authSignOut.push({ userId, passed: false, error: error.message }); }
        }
        // Access JWTs may live until expiry; closed seats and revoked grants remove fixture authority immediately.
        report.passed = !interrupted && !report.error && report.workflowPassed && report.racesPassed && report.cleanupPassed
            && report.authSignOut.every(r => r.passed);
        report.finishedAt = new Date().toISOString(); await save();
        process.off('SIGINT', signal); process.off('SIGTERM', signal);
    }
    console.log(`GC06 runner ${report.passed ? 'PASS' : 'FAIL'}: ${resolve(directory, 'results.json')}`);
    if (!report.passed) {
        console.error(redact(report.error || report.cleanupError || 'Missing completed evidence; inspect results.json.', secrets));
        if (setupAttempted && !report.cleanupPassed) console.error(`Recovery: node scripts/gc06-live-check.mjs cleanup ${m.run}`);
        process.exitCode = 1;
    }
}
async function recover(runId) {
    uuid(runId);
    const directory = resolve(ROOT, runId), m = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
    validate(m); check(m.run === runId, 'recovery directory mismatch');
    console.log(`Archive only recorded GC06 fixtures for ${m.projectRef}, run ${m.run}.`);
    const token = await promptToken(); check(/^sbp_[A-Za-z0-9_-]+$/.test(token), 'expected a Supabase personal access token');
    const report = { file: `cleanup-retry-${randomUUID()}.json`, run: m.run, projectRef: m.projectRef, requests: [], passed: false };
    const { save, sql } = recorder(directory, report, [token]);
    try { report.cleanup = await cleanup(m, sql(m.projectRef, token)); report.passed = true; }
    catch (error) { report.error = error.message; process.exitCode = 1; }
    finally { report.finishedAt = new Date().toISOString(); await save(); console.log(resolve(directory, report.file)); }
    // Never rewrite/upgrade the failed rehearsal's original results.json.
}
export async function main(args = process.argv.slice(2)) {
    if (args.length === 1 && args[0] === 'prepare') return prepare();
    if (args.length === 1 && args[0] === 'seal') return seal();
    if (args.length === 2 && args[0] === 'cleanup') return recover(args[1]);
    check(args.length === 0 || args.length === 1 && args[0] === '--local', 'usage: [prepare|seal|--local|cleanup RUN_UUID]');
    return run(args[0] === '--local');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
}
