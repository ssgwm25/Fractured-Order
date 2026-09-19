// Human-run only. No Vite imports, server secrets in browsers, or mock backend.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { promptToken } from './gc03-race-runner.mjs';
import { publicKey } from './gc03-hosted-check.mjs';
import { ROLES, SHARED_ROLES, LOCAL_APP_BASE_URL, check, uuid, appUrl, manifest, setupSql, cleanupSql, archivedComplete,
    fixtureSessions, manualComplete, automatedComplete, redact } from './gc04-live-contract.mjs';
import { joinActor, verifyScope, verifyRecovery, verifyRoutes, verifyRemoval, verifySharedView } from './gc04-live-browser.mjs';
import { verifySharedRace } from './gc04a-live-race.mjs';
import { inspectDeployment, screenReaderAnswer } from './gc04-live-preflight.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const files = ['scripts/gc04-live-check.mjs', 'scripts/gc04-live-contract.mjs', 'scripts/gc04-live-browser.mjs', 'scripts/gc04-live-preflight.mjs', 'scripts/gc04-deck-probe.mjs',
    'data/2026-09-22_gc04_session_context.sql', 'src/services/seatBootstrap.js', 'src/core/seatContext.js',
    'src/core/teamContext.js', 'src/core/navigation.js', 'src/stores/session.js', 'src/main.js',
    'src/roles/landing.js', 'src/services/sync.js', 'src/stores/participants.js', 'vite.config.js',
    'index.html', 'teams/green/facilitator.html', 'teams/green/scribe.html'];
async function ask(label) {
    check(process.stdin.isTTY, 'use an interactive terminal for required configuration');
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try { return (await input.question(label)).trim(); } finally { input.close(); }
}
async function management(token, projectRef, query) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, read_only: false }), signal: AbortSignal.timeout(45000)
    });
    const data = await response.json();
    check(response.ok && Array.isArray(data), `management SQL failed (${response.status}): ${data.message || 'unexpected response'}`);
    return { data, status: response.status, requestId: response.headers.get('sb-request-id') || response.headers.get('x-request-id') };
}
async function configuration(localMode = false, shared = false) {
    let env = '';
    try { env = await readFile('.env.local', 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const candidate = process.env.VITE_SUPABASE_URL || env.match(/^\s*VITE_SUPABASE_URL\s*=\s*['"]?([^\s'"]+)/m)?.[1];
    const projectRef = candidate?.match(/^https:\/\/([a-z]{20})\.supabase\.co\/?$/)?.[1]
        || await ask('Supabase rehearsal project reference: ');
    check(/^[a-z]{20}$/.test(projectRef), 'expected a 20-letter project reference');
    // Ignore a previously configured hosted URL when explicitly checking the local candidate.
    const baseURL = appUrl(shared && process.env.GC04A_BASE_URL ? process.env.GC04A_BASE_URL : localMode ? LOCAL_APP_BASE_URL
        : process.env.PLAYWRIGHT_BASE_URL || await ask('Deployed app directory URL (including its base path): '), { local: localMode, shared });
    console.log(`GC04 target: ${baseURL}\nSupabase project: ${projectRef}`);
    if (localMode) console.log('Local frontend with real rehearsal Supabase. Synthetic fixtures will be created and archived. This does not verify deployment.');
    if (shared) console.log('GC04A foundation: three hosted identities, observed two-connection contention and two archived synthetic sessions. Screen-reader checks excluded.');
    return { projectRef, baseURL };
}
async function preflight(baseURL, localMode = false, shared = false) {
    const directory = resolve('test-results/gc04-live');
    await mkdir(directory, { recursive: true });
    const output = resolve(directory, `preflight-${randomUUID()}.json`);
    let result;
    try {
        result = await inspectDeployment(baseURL, fetch, { local: localMode, shared });
        check(result.passed, `GC04_DEPLOYMENT_MISMATCH: ${result.url} lacks ${result.missing.join(', ')}. `
            + (localMode ? 'Rebuild with VITE_PUBLIC_BASE_PATH=/Fractured-Order/ and serve dist on port 4174, then retry.'
                : 'Publish the GC04 frontend through Deploy GitHub Pages, then retry. npm run build only builds local files.'));
        console.log(`${localMode ? 'Local' : 'Deployment'} preflight: required GC04 landing controls are present.`);
        return result;
    } catch (error) {
        result = { url: baseURL, target: localMode ? 'local' : 'hosted', ...result, passed: false, error: error.message };
        throw error;
    } finally {
        await writeFile(output, JSON.stringify(result, null, 2));
        console.log(`Frontend preflight evidence: ${output}`);
    }
}
const manualInstructions = {
    join: 'Listen to Check session, region/role selection and the complete delegation summary before Join. Verify names and selected states are announced.',
    workspace: 'Inspect the role and region, landmarks and tab order. At desktop width verify 200% browser zoom, then restore zoom. At narrow width verify readable controls. Record screen-reader and keyboard observations.',
    offline: 'Listen for Live updates paused. Verify the offline message is available without moving focus unexpectedly.',
    reconnect: 'Verify the recovered workspace still announces the correct role and region and remains keyboard operable.',
    permission: 'Verify the permission error is announced, focus reaches the error, and Retry/Return to join are accessible without entering the hidden workspace.',
    removal: 'Verify access loss is announced, private content is absent from browse/tab navigation, and the retry/join controls are reachable.'
};

async function run(manualMode, localMode = false, shared = false) {
    check(!shared || !manualMode, '--shared excludes manual screen-reader checks');
    const config = await configuration(localMode, shared);
    const deployment = await preflight(config.baseURL, localMode, shared);
    let screenReader;
    if (manualMode) {
        while (true) {
            const answer = screenReaderAnswer(await ask('Screen reader/version, OS and tester initials (Chromium version is recorded automatically; type skip if none): '));
            if (answer.mode === 'automated') { manualMode = false; console.log('Continuing with automation only; screen-reader verification remains pending.'); break; }
            if (answer.mode === 'manual') { screenReader = answer.description; break; }
            console.log('Enter your actual screen-reader details, or type skip. Shell commands belong at the PowerShell prompt.');
        }
    }
    config.token = await promptToken();
    check(/^sbp_[A-Za-z0-9_-]+$/.test(config.token), 'use a Supabase personal access token');
    config.key = await publicKey(config.projectRef);
    const secrets = [config.token, config.key];
    // Operator credentials stay in this Node process. Participants sign in via UI.
    const operator = createClient(`https://${config.projectRef}.supabase.co`, config.key,
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const auth = await operator.auth.signInAnonymously({ options: { data: { gc04_operator_fixture: true } } });
    check(!auth.error && auth.data?.session, `operator test identity: ${auth.error?.message || 'missing session'}`);
    secrets.push(auth.data.session.access_token, auth.data.session.refresh_token);
    const m = manifest(config.projectRef, config.baseURL, auth.data.user.id, { local: localMode, shared });
    const directory = resolve('test-results/gc04-live', m.run);
    await mkdir(directory, { recursive: true });
    const report = { run: m.run, target: m.target, projectRef: m.projectRef, baseURL: m.baseURL, startedAt: new Date().toISOString(),
        requests: [], checkpoints: [], manual: [], assets: {}, browserErrors: [], sourceHashes: {},
        automatedPassed: false, manualPassed: false, cleanupPassed: false, passed: false, deploymentPreflight: deployment,
        ...(screenReader ? { screenReader } : {}) };
    if (shared) Object.assign(report, { stage: m.stage, greenSeatModel: m.greenSeatModel, manualStatus: 'excluded_by_user' });
    let pendingSave = Promise.resolve();
    const save = () => {
        const snapshot = JSON.stringify(redact(report, secrets), null, 2);
        pendingSave = pendingSave.then(() => writeFile(resolve(directory, 'results.json'), snapshot));
        return pendingSave;
    };
    await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(m, null, 2), { flag: 'wx' });
    await writeFile(resolve(directory, 'cleanup.sql'), cleanupSql(m), { flag: 'wx' });
    await save();
    console.log(`Fixture run: ${m.run}\nIf interrupted, archive with: node scripts/gc04-live-check.mjs cleanup ${m.run}`);
    const sql = async (label, query, receipt = false) => {
        const entry = { label, at: new Date().toISOString(), sqlSha256: sha(query), completed: false };
        report.requests.push(entry); await save();
        await writeFile(resolve(directory, `${label}-${randomUUID()}.sql`), query, { flag: 'wx' });
        const response = await management(config.token, m.projectRef, query);
        Object.assign(entry, { completed: true, status: response.status, requestId: response.requestId });
        await save(); return receipt ? response : response.data;
    };
    let browser, setupAttempted = false;
    const pending = new Set(), contexts = [];
    const runtime = { m, key: config.key, backend: `https://${m.projectRef}.supabase.co`, contexts, report, save,
        observe(actor) {
            actor.page.on('pageerror', error => report.browserErrors.push({ role: actor.role, type: error.name, at: new Date().toISOString() }));
            actor.page.on('response', response => {
                const url = new URL(response.url()), resource = response.request().resourceType();
                if (url.origin === new URL(m.baseURL).origin && ['script', 'document'].includes(resource)) {
                    const promise = (async () => {
                        check(url.pathname.startsWith(new URL(m.baseURL).pathname), 'hosted page/script escaped the configured base path');
                        check(response.status() === 200, `hosted ${resource} HTTP ${response.status()}`);
                        const digest = sha(await response.body());
                        // Ignore query variations in document routes, retain each JS URL exactly.
                        const identity = `${url.origin}${url.pathname}`;
                        const previous = report.assets[identity];
                        check(!previous || previous.sha256 === digest, 'hosted assets changed during verification');
                        report.assets[identity] = { sha256: digest, resource, status: response.status() };
                    })().catch(error => { report.assetFailure = error.message; });
                    pending.add(promise); promise.finally(() => pending.delete(promise));
                }
                if (url.origin === runtime.backend && /\/(?:auth|rest)\/v1\//.test(url.pathname)) {
                    report.requests.push({ actor: actor.role, path: url.pathname, method: response.request().method(),
                        status: response.status(), requestId: response.headers()['sb-request-id'] || response.headers()['x-request-id'],
                        at: new Date().toISOString(), source: 'browser-network' });
                }
            });
        },
        async ready(actor, step) {
            if (!manualMode) return;
            await actor.page.bringToFront();
            console.log(`\n${actor.role}: ${manualInstructions[step]}`);
            await ask('Press Enter when the screen reader is ready to observe the transition: ');
        },
        async manual(actor, step) {
            if (!manualMode) return;
            await actor.page.bringToFront();
            console.log(`\n${actor.role}: ${manualInstructions[step]}`);
            let status = '';
            while (!['pass', 'fail'].includes(status)) status = (await ask('Observed result (pass/fail): ')).toLowerCase();
            let observation = '';
            while (!observation) observation = await ask('Record what was announced/observed (required): ');
            report.manual.push({ role: actor.role, step, status, observation, at: new Date().toISOString() });
            await save(); check(status === 'pass', `manual ${step} failed for ${actor.role}`);
        },
        async checkpoint(actor, label) {
            await actor.page.screenshot({ path: resolve(directory, `${actor.role}-${label}.png`), fullPage: true });
            report.checkpoints.push({ role: actor.role, label, at: new Date().toISOString() });
            await save(); console.log(`PASS: ${actor.role} ${label}`);
        },
        async operatorRpc(name, body) {
            // Refresh before destructive test lifecycle operations after long manual pauses.
            const refreshed = await operator.auth.refreshSession();
            check(!refreshed.error && refreshed.data.session, 'operator identity refresh');
            secrets.push(refreshed.data.session.access_token, refreshed.data.session.refresh_token);
            const response = await fetch(`${runtime.backend}/rest/v1/rpc/${name}`, {
                method: 'POST', redirect: 'error', headers: { apikey: config.key,
                    Authorization: `Bearer ${refreshed.data.session.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
            });
            const data = await response.json();
            report.requests.push({ actor: 'operator', path: `/rest/v1/rpc/${name}`, status: response.status,
                requestId: response.headers.get('sb-request-id'), at: new Date().toISOString() });
            await save(); return { status: response.status, data };
        }
    };
    try {
        const git = promisify(execFile);
        report.sourceRevision = (await git('git', ['rev-parse', 'HEAD'])).stdout.trim();
        report.workingTree = (await git('git', ['status', '--porcelain'])).stdout;
        for (const file of files) report.sourceHashes[file] = sha(await readFile(file));
        if (shared) for (const file of ['scripts/gc04a-live-race.mjs', 'scripts/gc03-race-runner.mjs',
            'data/2026-09-24_gc04a_shared_facilitator.sql', 'data/2026-09-23_gc04_legacy_session_topology.sql',
            'src/features/scribe/sharedGreenContext.js', 'src/features/scribe/deckStorage.js', 'src/roles/scribe.js']) {
            report.sourceHashes[file] = sha(await readFile(file));
        }
        browser = await chromium.launch({ headless: !manualMode, args: manualMode ? ['--force-renderer-accessibility'] : [] });
        report.browserVersion = browser.version();
        setupAttempted = true; await save();
        check((await sql('setup', setupSql(m)))[0]?.run_id === m.run, 'fixture setup receipt');
        if (shared) {
            await verifySharedRace(m, (label, query) => sql(label, query, true), report);
            await save(); console.log('PASS: shared seat contention; distinct matching PostgreSQL connections and one committed winner.');
        }
        const actors = [];
        const roles = shared ? SHARED_ROLES : ROLES;
        for (const [index, role] of roles.entries()) actors.push(await joinActor(browser, role, runtime, index));
        check(new Set(actors.map(a => a.info.userId)).size === roles.length, 'independent hosted identities for every seat');
        if (shared) await verifySharedView(actors.find(actor => !actor.region), runtime);
        for (const actor of actors) {
            await verifyScope(actor, actors, runtime);
            await verifyRecovery(actor, runtime);
            await verifyRoutes(actor, runtime);
        }
        for (const actor of actors) await verifyRemoval(actor, runtime);
        await Promise.all([...pending]);
        check(!report.assetFailure && Object.values(report.assets).some(a => a.resource === 'script'), report.assetFailure || 'missing hosted asset evidence');
        check(report.browserErrors.length === 0, 'unhandled browser errors; inspect report');
        check(automatedComplete(report.checkpoints, { shared }) && (!shared || report.race?.passed), 'incomplete automated matrix');
        report.automatedPassed = true;
        report.manualPassed = manualMode && manualComplete(report.manual);
    } catch (error) {
        report.failure = error.message;
    } finally {
        await Promise.allSettled(contexts.map(context => context.close()));
        await browser?.close();
        await Promise.all([...pending]);
        if (report.assetFailure || report.browserErrors.length) report.automatedPassed = false;
        if (setupAttempted) {
            try {
                // A network timeout may follow a committed setup; inspect exact fixture ID.
                const ids = fixtureSessions(m).map(({ id }) => `'${id}'`).join(',');
                const found = await sql('cleanup-presence', `SELECT id FROM public.sessions WHERE id IN (${ids});`);
                if (found.length) {
                    const archived = await sql('archive', cleanupSql(m));
                    check(archivedComplete(archived, m), 'fixture archival');
                }
                report.cleanupPassed = true;
            } catch (error) { report.cleanupFailure = error.message; }
        }
        await operator.auth.signOut().catch(() => {});
        report.finishedAt = new Date().toISOString();
        report.passed = report.automatedPassed && (shared || report.manualPassed) && report.cleanupPassed;
        await save();
        console.log(`Evidence: ${resolve(directory, 'results.json')}`);
        if (report.failure) console.error(redact(report.failure, secrets));
        if (!report.cleanupPassed && setupAttempted) console.error(`Archive retry: node scripts/gc04-live-check.mjs cleanup ${m.run}`);
    }
    if (!report.automatedPassed || !report.cleanupPassed || (manualMode && !report.manualPassed)) process.exitCode = 1;
    else console.log(shared ? 'PASS: GC04A foundation automation, observed database contention and both fixture archives. Manual screen-reader checks excluded, not passed. Review fresh evidence before sign-off.'
        : manualMode ? 'PASS: automated matrix, recorded manual checks and fixture archival. Review evidence before GC04 sign-off.'
        : 'Automated matrix and archival passed. Screen-reader evidence remains pending; run with --manual.');
    if (localMode) console.log('Evidence target: local frontend. Deployed routing and deployment provenance remain unverified.');
}
async function cleanup(runId) {
    const directory = resolve('test-results/gc04-live', uuid(runId));
    const m = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
    check(m.run === runId, 'cleanup run mismatch');
    const query = cleanupSql(m), token = await promptToken();
    const result = await management(token, m.projectRef, query);
    check(archivedComplete(result.data, m), 'cleanup receipt');
    await writeFile(resolve(directory, `cleanup-retry-${randomUUID()}.json`), JSON.stringify({ ...result, at: new Date().toISOString() }, null, 2));
    console.log('Synthetic fixture archived; history retained. Original test results are unchanged.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const args = process.argv.slice(2);
    const localMode = args.includes('--local');
    const shared = args.includes('--shared');
    const task = args[0] === 'preflight' && args.slice(1).every(arg => ['--local', '--shared'].includes(arg))
        ? (async () => preflight(appUrl(shared && process.env.GC04A_BASE_URL ? process.env.GC04A_BASE_URL : localMode ? LOCAL_APP_BASE_URL
            : process.env.PLAYWRIGHT_BASE_URL || await ask('Deployed app directory URL (including /Fractured-Order/): '),
        { local: localMode, shared }), localMode, shared))()
        : args[0] === 'cleanup' && args.length === 2 ? cleanup(args[1])
        : args.every(arg => ['--manual', '--local', '--shared'].includes(arg)) ? run(args.includes('--manual'), localMode, shared)
            : Promise.reject(new Error('Usage: node scripts/gc04-live-check.mjs [--shared | --manual] [--local] | preflight [--shared] [--local] | cleanup RUN_ID'));
    task.catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
}
