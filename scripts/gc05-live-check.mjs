// Human-run hosted Auth/RPC verification. No server, build, migration or deployment.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { promptToken } from './gc03-race-runner.mjs';
import { publicKey } from './gc03-hosted-check.mjs';
import { setupSql, cleanupSql, redact, uuid } from './gc04-live-contract.mjs';
import { STAGE, makeManifest, validate, guarded, seedSql, verifyRace, cleanupFixtures, MANAGEMENT_PROBE, assertManagementReady,
    requireCheck as check, expectDenial, assertDirectProgressionDenied, rejoinExpiredSeat } from './gc05-live-contract.mjs';
import { serializeStrategicOrientationDetails } from '../src/features/actions/strategicOrientationDetails.js';

const ROOT = 'test-results/gc05-live';
const sha = value => createHash('sha256').update(value).digest('hex');
const regions = ['asian_pacific', 'europe'];
const roles = ['whitecell_lead', 'green_asian_pacific_scribe', 'green_europe_scribe', 'green_shared_facilitator'];
const files = ['scripts/gc05-live-check.mjs', 'scripts/gc05-live-contract.mjs', 'scripts/gc04-live-contract.mjs',
    'scripts/gc03-race-runner.mjs', 'scripts/gc03-hosted-check.mjs', 'data/2026-09-25_gc05_regional_orientations.sql',
    'data/2026-09-24_gc04a_shared_facilitator.sql', 'docs/architecture/green-regional-contract.json',
    'src/services/database.js', 'src/services/supabaseMock.js', 'src/features/scribe/sharedGreenContext.js',
    'src/features/actions/strategicOrientationDetails.js', 'src/roles/facilitator.js', 'src/roles/scribe.js',
    'src/roles/whitecell.js', 'src/stores/gameState.js', 'src/features/gameControls/PhaseControl.js',
    'src/features/gameControls/MoveControl.js', 'tests/sql/gc05-regional-orientations-editor.sql',
    'tests/unit/gc05-live-check.test.js'];

async function configuration() {
    let env = '';
    try { env = await readFile('.env.local', 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const url = process.env.VITE_SUPABASE_URL || env.match(/^\s*VITE_SUPABASE_URL\s*=\s*['"]?([^\s'"]+)/m)?.[1];
    const projectRef = url?.match(/^https:\/\/([a-z]{20})\.supabase\.co\/?$/)?.[1];
    check(projectRef, 'set the existing rehearsal VITE_SUPABASE_URL in .env.local');
    console.log(`GC05 hosted Auth/RPC target: ${projectRef}. Creates and archives synthetic fixtures; no existing session is needed.`);
    const token = await promptToken();
    check(/^sbp_[A-Za-z0-9_-]+$/.test(token), 'expected a Supabase personal access token');
    return { projectRef, token, key: await publicKey(projectRef) };
}
async function management(config, query) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${config.projectRef}/database/query`, {
        method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, read_only: false }), signal: AbortSignal.timeout(45000)
    });
    return { status: response.status, data: await response.json(), requestId: response.headers.get('sb-request-id') };
}
function sqlOK(result) {
    check(result.status >= 200 && result.status < 300 && Array.isArray(result.data),
        `SQL HTTP ${result.status}: ${result.data?.message || 'unexpected response'}`);
    return result;
}
function one(result) {
    check(result.status >= 200 && result.status < 300, `RPC HTTP ${result.status}: ${result.data?.message || 'unexpected response'}`);
    const value = Array.isArray(result.data) ? result.data.length === 1 && result.data[0] : result.data;
    check(value && typeof value === 'object', 'one persisted result required');
    return value;
}

async function run() {
    const config = await configuration(), secrets = [config.token, config.key], actors = [];
    // Check management credentials before creating an Auth identity or SQL fixture.
    await mkdir(resolve(ROOT), { recursive: true });
    const preflightPath = resolve(ROOT, `preflight-${randomUUID()}.json`);
    const preflight = { projectRef: config.projectRef, at: new Date().toISOString(),
        query: MANAGEMENT_PROBE, fixtureSetupAttempted: false, passed: false };
    try {
        preflight.response = await management(config, MANAGEMENT_PROBE);
        assertManagementReady(preflight.response);
        preflight.passed = true;
    } catch (e) {
        preflight.error = e.message;
        throw new Error(redact(e.message, secrets));
    } finally {
        await writeFile(preflightPath, JSON.stringify(redact(preflight, secrets), null, 2), { flag: 'wx' });
        console.log(`Management preflight evidence: ${preflightPath}`);
    }
    const authActor = async role => {
        const client = createClient(`https://${config.projectRef}.supabase.co`, config.key,
            { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
        const result = await client.auth.signInAnonymously({ options: { data: { gc05_synthetic_rehearsal: true } } });
        check(!result.error && result.data?.session, `hosted Auth: ${result.error?.message || 'missing session'}`);
        secrets.push(result.data.session.access_token, result.data.session.refresh_token);
        const actor = { role, client, token: result.data.session.access_token, userId: result.data.user.id,
            clientId: `gc05-${randomUUID()}` };
        actors.push(actor);
        return actor;
    };
    const wc = await authActor(roles[0]);
    const m = makeManifest(config.projectRef, wc.userId), f = m.fixture;
    const directory = resolve(ROOT, f.run);
    await mkdir(directory, { recursive: true });
    const report = { stage: STAGE, target: m.target, run: f.run, projectRef: f.projectRef,
        startedAt: new Date().toISOString(), managementPreflight: preflight, requests: [], checks: [], sourceHashes: {},
        hostedAuthPassed: false, workflowPassed: false, race: { passed: false }, cleanupPassed: false, passed: false };
    let pendingSave = Promise.resolve();
    const save = () => {
        const snapshot = JSON.stringify(redact(report, secrets), null, 2);
        pendingSave = pendingSave.then(() => writeFile(resolve(directory, 'results.json'), snapshot));
        return pendingSave;
    };
    const pass = async (label, evidence = {}) => {
        check(!report.checks.some(c => c.label === label), `duplicate checkpoint ${label}`);
        report.checks.push({ label, at: new Date().toISOString(), ...evidence });
        await save(); console.log(`PASS: ${label}`);
    };
    const sql = async (label, query) => {
        const entry = { label, source: 'management-sql', at: new Date().toISOString(), sha256: sha(query) };
        report.requests.push(entry);
        await writeFile(resolve(directory, `${label}-${randomUUID()}.sql`), query, { flag: 'wx' });
        await save();
        try { const result = await management(config, query); Object.assign(entry, result); return sqlOK(result); }
        catch (e) { entry.error = e.message; throw e; }
        finally { await save(); }
    };
    const request = async (actor, path, method = 'GET', body) => {
        const entry = { actor: actor.role, path, method, at: new Date().toISOString(), source: 'hosted-auth-http' };
        report.requests.push(entry);
        try {
            const response = await fetch(`https://${f.projectRef}.supabase.co${path}`, {
                method, redirect: 'error', headers: { apikey: config.key, Authorization: `Bearer ${actor.token}`,
                    'Content-Type': 'application/json', Prefer: 'return=representation' },
                body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000)
            });
            const data = await response.json();
            Object.assign(entry, { status: response.status, code: data?.code,
                rowCount: Array.isArray(data) ? data.length : undefined, requestId: response.headers.get('sb-request-id') });
            return { status: response.status, data };
        } catch (e) { entry.error = e.message; throw e; }
        finally { await save(); }
    };
    const rpc = (actor, name, body) => request(actor, `/rest/v1/rpc/${name}`, 'POST', body);
    const heartbeat = async actor => one(await rpc(actor, 'heartbeat_session_role_seat', {
        requested_session_id: f.sessionId, requested_session_participant_id: actor.seat.id,
        requested_client_id: actor.clientId, requested_timeout_seconds: 90
    }));
    const fresh = async () => { for (const actor of actors) if (actor.seat) await heartbeat(actor); };
    const details = narrative => serializeStrategicOrientationDetails({ team: 'green', ownOrientation: 'pressure',
        forecastTargets: [{ key: 'blue', orientation: 'reframe' }], strategyDescription: narrative, scribeHandoff: 'Forwarded' });
    const body = (region, action) => ({ requested_session_id: f.sessionId, requested_delegation_id: region,
        requested_action_id: action?.id || null, requested_expected_revision: action?.revision_number ?? null,
        requested_expected_row_version: action?.row_version ?? null });
    const handoff = (actor, region, action, overrides = {}) => rpc(actor, 'handoff_regional_orientation', {
        ...body(region, action), requested_details: details('GC05 synthetic strategy; not an exercise decision'),
        requested_goal: 'GC05 synthetic orientation', ...overrides
    });
    const submit = (actor, region, action, overrides = {}) => rpc(actor, 'submit_regional_orientation', { ...body(region, action), ...overrides });
    const read = async (actor, id) => one(await request(actor, `/rest/v1/actions?id=eq.${uuid(id)}&session_id=eq.${f.sessionId}&select=*`));
    const missing = async (actor, expected) => {
        const value = one(await rpc(actor, 'get_orientation_completion', { requested_session_id: f.sessionId }));
        check(JSON.stringify(value.missingTeams) === JSON.stringify(expected) && value.complete === (expected.length === 0)
            && value.requiredTeams.length === 5, 'exact five-submission completion');
        return value;
    };
    const deny = async (promise, code, label) => { const result = await promise; expectDenial(result, code, label); await pass(label, { status: result.status, code }); };
    const control = (move, phase) => rpc(wc, 'operator_update_game_state', { requested_session_id: f.sessionId, requested_move: move, requested_phase: phase });
    const review = action => rpc(wc, 'operator_review_artifact', { requested_artifact_kind: 'strategic_orientation',
        requested_artifact_id: action.id, requested_review_decision: 'return_to_team', requested_team: 'green',
        requested_expected_revision: action.revision_number, requested_reviewer_notes: 'GC05 synthetic correction requested' });
    let setupAttempted = false;
    await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(m, null, 2), { flag: 'wx' });
    await writeFile(resolve(directory, 'cleanup.sql'), cleanupSql(f), { flag: 'wx' });
    console.log(`GC05 fixture run: ${f.run}\nIf interrupted: node scripts/gc05-live-check.mjs cleanup ${f.run}`);
    await save();
    try {
        const git = promisify(execFile);
        report.sourceRevision = (await git('git', ['rev-parse', 'HEAD'])).stdout.trim();
        report.workingTree = (await git('git', ['status', '--porcelain'])).stdout;
        for (const file of files) report.sourceHashes[file] = sha(await readFile(file));
        setupAttempted = true;
        check((await sql('setup', setupSql(f))).data[0]?.run_id === f.run, 'setup receipt');
        check((await sql('seed', seedSql(m))).data[0]?.run_id === f.run, 'orientation fixture receipt');
        for (const role of roles.slice(1)) await authActor(role);
        check(new Set(actors.map(a => a.userId)).size === 4, 'four distinct authenticated identities');
        for (const actor of actors) {
            const user = one(await request(actor, '/auth/v1/user'));
            check(user.id === actor.userId && user.is_anonymous === true, 'hosted identity verification');
            actor.seat = one(await rpc(actor, 'claim_session_role_seat', { requested_session_id: f.sessionId,
                requested_role: actor.role, requested_name: 'GC05 synthetic rehearsal',
                requested_client_id: actor.clientId, requested_timeout_seconds: 90 }));
            check(actor.seat.role === actor.role && actor.seat.session_id === f.sessionId && actor.seat.is_active, 'active claimed seat');
        }
        report.hostedAuthPassed = true;
        await pass('four hosted identities and active seats', { actors: actors.map(a => ({ role: a.role, userId: a.userId, seatId: a.seat.id })) });
        const shared = actors[3], scribes = { asian_pacific: actors[1], europe: actors[2] }, actions = {};
        for (const region of regions) {
            await fresh();
            const action = one(await handoff(scribes[region], region));
            check(action.session_id === f.sessionId && action.delegation_id === region && action.revision_number === 1
                && action.orientation_handoff_revision === 1 && action.workflow_state === 'forwarded_to_facilitator', 'owned Scribe handoff');
            actions[region] = action;
            await pass(`${region} Scribe handoff`, { id: action.id, revision: action.revision_number });
            await deny(handoff(scribes[region], region), '23505', `${region} duplicate handoff denied`);
            await deny(submit(shared, region, action, { requested_expected_revision: 999 }), 'PT409', `${region} stale revision denied`);
            await deny(submit(shared, region, action, { requested_expected_row_version: 999 }), 'PT409', `${region} stale row version denied`);
            const direct = await request(shared, `/rest/v1/actions?id=eq.${action.id}`, 'PATCH', { status: 'submitted' });
            check(direct.status === 403 && direct.data?.code === '42501'
                || direct.status === 200 && Array.isArray(direct.data) && direct.data.length === 0, 'direct submit denied');
            check((await read(shared, action.id)).status === 'draft', 'denied direct submit preserved draft');
            await pass(`${region} direct table submit denied`);
        }
        for (const region of regions) {
            await fresh();
            const action = one(await submit(shared, region, actions[region]));
            check(action.status === 'submitted' && action.submitted_by_auth_user_id === shared.userId, 'independent shared submission');
            actions[region] = action;
            await pass(`${region} independent shared submission`, { id: action.id, revision: action.revision_number });
            await deny(submit(shared, region, action), '23514', `${region} duplicate submit denied`);
            const expected = region === 'asian_pacific' ? ['green:europe'] : [];
            await missing(shared, expected);
            if (expected.length) {
                await deny(control(2, 1), '23514', 'missing Europe blocks control RPC');
                const statePath = `/rest/v1/game_state?session_id=eq.${f.sessionId}&select=id,session_id,move,phase`;
                const before = await request(wc, statePath);
                const result = await request(wc, `/rest/v1/game_state?session_id=eq.${f.sessionId}`, 'PATCH', { move: 3, phase: 5 });
                const after = await request(wc, statePath);
                const evidence = assertDirectProgressionDenied(result, before, after, f.sessionId);
                await missing(shared, ['green:europe']);
                await pass('missing Europe blocks direct progression', evidence);
            }
        }
        await pass('five submitted orientations qualify without approval');
        const correction = async (region, returned, label) => {
            const scribe = scribes[region], other = scribes[regions.find(r => r !== region)];
            await missing(shared, [`green:${region}`]);
            await deny(submit(shared, region, returned), '23514', `${label} requires a new Scribe handoff`);
            const foreign = await request(other, `/rest/v1/actions?id=eq.${returned.id}&select=id`);
            check(foreign.status === 200 && foreign.data?.length === 0, 'foreign Scribe orientation hidden');
            for (const actor of [scribe, shared]) {
                const reviews = await request(actor, `/rest/v1/artifact_workflow_reviews?artifact_id=eq.${returned.id}&select=*`);
                check(reviews.status === 200 && reviews.data.some(r => r.delegation_id === region && r.next_revision_number === returned.revision_number), 'relevant review readable');
                const logs = await request(actor, `/rest/v1/action_logs?action_id=eq.${returned.id}&select=id`);
                check(logs.status === 200 && logs.data.length > 0, 'revision history readable');
            }
            await deny(handoff(scribe, region, returned, { requested_expected_revision: returned.revision_number - 1 }), 'PT409', `${label} stale correction denied`);
            const corrected = one(await handoff(scribe, region, returned, { requested_details: details('GC05 synthetic corrected strategy') }));
            const submitted = one(await submit(shared, region, corrected));
            check(submitted.workflow_state === 'resubmitted' && submitted.revision_number === returned.revision_number
                && submitted.delegation_id === region && submitted.submitted_by_auth_user_id === shared.userId, 'corrected resubmission');
            await missing(shared, []);
            await pass(`${label} isolated correction and resubmission`, { id: submitted.id, revision: submitted.revision_number });
            return submitted;
        };
        for (const region of regions) {
            await fresh();
            const returned = one(await review(actions[region])).artifact;
            check(returned?.delegation_id === region && returned.revision_number === 2 && returned.orientation_handoff_revision === null, 'return owner and revision');
            await deny(control(2, 1), '23514', `${region} return closes progression`);
            actions[region] = await correction(region, returned, region);
        }
        await fresh();
        await deny(submit(shared, 'europe', actions.europe, { requested_session_id: f.raceSessionId }), '42501', 'wrong session denied');
        await deny(submit(shared, 'asian_pacific', actions.europe), '42501', 'wrong persisted region denied');
        await deny(handoff(scribes.europe, 'asian_pacific', actions.asian_pacific), '42501', 'cross-Scribe handoff denied');
        await deny(handoff(shared, 'europe'), '42501', 'shared cannot author');
        for (const [label, id] of [['proposal', f.forwarded.europe], ['RFI', m.rfiId]]) {
            const fake = { id, revision_number: 1, row_version: 1 };
            await deny(submit(shared, 'europe', fake), '42501', `${label} through submit denied`);
            await deny(handoff(scribes.europe, 'europe', fake), '42501', `${label} through handoff denied`);
        }
        const privateRows = await request(shared, `/rest/v1/actions?id=eq.${f.actions.europe}&select=id`);
        check(privateRows.status === 200 && privateRows.data?.length === 0, 'private proposal hidden');
        const privateRfi = await request(shared, `/rest/v1/requests?id=eq.${m.rfiId}&select=id`);
        check(privateRfi.status === 200 && privateRfi.data?.length === 0, 'private RFI hidden');
        await pass('unforwarded proposal and private RFI remain hidden');
        await deny(request(shared, '/rest/v1/requests', 'POST', { session_id: f.sessionId, team: 'green', delegation_id: 'europe', query: 'GC05 denied synthetic RFI' }), '42501', 'shared RFI creation denied');
        await deny(request(shared, '/rest/v1/actions', 'POST', { session_id: f.sessionId, team: 'green', delegation_id: 'europe', move: 1, phase: 1,
            mechanism: 'Proposal', sector: '', goal: 'GC05 denied proposal', artifact_type: 'proposal', proposal_recipient_team: 'blue' }), '42501', 'generic shared action write denied');
        const proposalWrite = await request(shared, `/rest/v1/actions?id=eq.${f.forwarded.europe}`, 'PATCH', { status: 'submitted' });
        check(proposalWrite.status === 403 && proposalWrite.data?.code === '42501'
            || proposalWrite.status === 200 && proposalWrite.data?.length === 0, 'shared proposal submit denied');
        check((await read(shared, f.forwarded.europe)).status === 'draft', 'proposal remains draft');
        await pass('shared proposal submission remains denied');
        await deny(rpc(shared, 'append_proposal_thread_message', { requested_parent_message_id: m.parentId,
            requested_content: 'GC05 denied synthetic reply', requested_message_type: 'PROPOSAL_RESPONSE_REVIEW',
            requested_facilitator_decision: null, requested_client_message_id: null }), '42501', 'shared thread write denied');
        const dm = await request(shared, '/rest/v1/communications', 'POST', { session_id: f.sessionId, move: 1,
            from_role: 'green_shared_facilitator', to_role: 'white_cell', type: 'direct', content: 'GC05 denied synthetic message' });
        check(['42501', '23514'].includes(dm.data?.code), 'direct message denied by installed authority or ownership guard');
        expectDenial(dm, dm.data.code, 'shared direct message denied');
        await pass('shared direct message write denied');
        // Actual concurrent SQL connections use this already-verified WC identity as
        // simulated claims, separately labelled from the hosted-token RPC receipts.
        await fresh();
        await verifyRace(m, actions.europe, sql, report);
        await pass('return blocks concurrent progression with committed-state verification');
        await fresh();
        actions.europe = await correction('europe', await read(shared, actions.europe.id), 'post-race Europe');
        one(await control(2, 1));
        one(await control(1, 1));
        await pass('corrected five-submission gate permits progression');
        for (const actor of [scribes.europe, shared, wc]) {
            await fresh();
            await sql(`expire-${actor.role}`, guarded(m, `UPDATE public.session_participants SET heartbeat_at=NOW()-interval '5 minutes',last_seen=NOW()-interval '5 minutes'
WHERE id='${uuid(actor.seat.id)}' AND session_id='${f.sessionId}';`));
            const attempt = () => actor === shared ? submit(actor, 'europe', actions.europe)
                : actor === wc ? review(actions.europe) : handoff(actor, 'europe', actions.europe);
            await deny(attempt(), '42501', `${actor.role} expired seat denied`);
            actor.seat = await rejoinExpiredSeat(actor, f.sessionId, rpc);
            await pass(`${actor.role} expired seat rejoined without scope change`, { seatId: actor.seat.id });
            // Revoke only this fixture seat; grant remains for the WC denial case.
            await sql(`revoke-${actor.role}`, guarded(m, `UPDATE public.session_participants SET revoked_at=clock_timestamp(),is_active=false
WHERE id='${uuid(actor.seat.id)}' AND session_id='${f.sessionId}';`));
            await deny(attempt(), '42501', `${actor.role} revoked seat denied`);
            actor.seat = null;
        }
        report.workflowPassed = true;
    } catch (e) { report.failure = e.message; }
    finally {
        if (setupAttempted) {
            try {
                report.cleanup = await cleanupFixtures(m, sql);
                report.cleanupPassed = true;
            } catch (e) { report.cleanupFailure = e.message; }
        }
        await Promise.allSettled(actors.map(a => a.client.auth.signOut()));
        report.finishedAt = new Date().toISOString();
        report.passed = report.hostedAuthPassed && report.workflowPassed && report.race.passed && report.cleanupPassed;
        await save();
        console.log(`Evidence: ${resolve(directory, 'results.json')}`);
        if (report.failure) console.error(redact(report.failure, secrets));
        if (!report.cleanupPassed) console.error(`Archive retry: node scripts/gc05-live-check.mjs cleanup ${f.run}`);
    }
    if (!report.passed) process.exitCode = 1;
    else console.log('PASS: GC05 hosted Auth/RPC cycle, return/progression contention and both fixture archives. No deployed browser result is claimed.');
}

async function cleanup(runId) {
    const directory = resolve(ROOT, uuid(runId));
    const m = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
    validate(m); check(m.fixture.run === runId, 'cleanup run mismatch');
    const token = await promptToken();
    check(/^sbp_[A-Za-z0-9_-]+$/.test(token), 'expected personal access token');
    const record = { run: runId, projectRef: m.fixture.projectRef, at: new Date().toISOString(), passed: false, requests: [] };
    try {
        record.cleanup = await cleanupFixtures(m, async (label, query) => {
            await writeFile(resolve(directory, `${label}-retry-${randomUUID()}.sql`), query, { flag: 'wx' });
            const response = await management({ projectRef: m.fixture.projectRef, token }, query);
            record.requests.push({ label, ...response });
            return sqlOK(response);
        });
        record.passed = true;
        console.log(record.cleanup.outcome === 'absent' ? 'Verified: no fixture sessions exist for this run.'
            : 'Both synthetic sessions archived; history retained.');
        console.log('Original failed rehearsal result remains unchanged.');
    } catch (e) { record.error = e.message; throw new Error(redact(e.message, [token])); }
    finally {
        const output = resolve(directory, `cleanup-retry-${randomUUID()}.json`);
        await writeFile(output, JSON.stringify(redact(record, [token]), null, 2), { flag: 'wx' });
        console.log(`Cleanup evidence: ${output}`);
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const args = process.argv.slice(2);
    const task = args.length === 0 ? run() : args[0] === 'cleanup' && args.length === 2 ? cleanup(args[1])
        : Promise.reject(new Error('Usage: node scripts/gc05-live-check.mjs [cleanup RUN_ID]'));
    task.catch(e => { console.error(redact(e.message)); process.exitCode = 1; });
}
