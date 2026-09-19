// Human-run evidence collection. Never deploys or installs a migration.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { promptToken } from './gc03-race-runner.mjs';
import { promptGitHubToken, lookupGitHubWorkflow, assertGitHubLookup } from './gc05-github.mjs';
import { redact } from './gc04-live-contract.mjs';
import { MANAGEMENT_PROBE, assertManagementReady } from './gc05-live-contract.mjs';
import { evidencePaths, deployedURL, deploymentRun, assertDeploymentRun, assertBrowserReport, assertAssetReceipt,
    sqlEvidenceQuery, assertSqlReceipt, requireEvidence as check, sha256 } from './gc05-evidence-contract.mjs';

const execute = promisify(execFile);
const suitePath = 'tests/sql/gc05-regional-orientations-editor.sql';
const migrationPath = 'data/2026-09-25_gc05_regional_orientations.sql';
async function ask(label) {
    check(process.stdin.isTTY, 'Use an interactive terminal, or set the documented GC05 environment variables.');
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try { return (await input.question(label)).trim(); } finally { input.close(); }
}
const schemaQuery = `SELECT
    (SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::TEXT,'definition',pg_get_functiondef(p.oid)))
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
     AND (p.proname LIKE 'gc05_%' OR p.proname IN ('handoff_regional_orientation','submit_regional_orientation','get_orientation_completion',
         'operator_review_artifact','operator_update_game_state','guard_green_owned_record','guard_green_authority','green_can_read_record'))) AS functions,
    (SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public'
     AND tablename IN ('actions','game_state','artifact_workflow_reviews','action_logs')) AS policies,
    (SELECT jsonb_agg(pg_get_triggerdef(t.oid)) FROM pg_trigger t WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.actions'::regclass,'public.game_state'::regclass)) AS triggers,
    clock_timestamp() AS captured_at;`;

async function sourceSnapshot() {
    const git = async args => (await execute('git', args, { maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
    const revision = await git(['rev-parse', 'HEAD']);
    const status = await git(['status', '--porcelain']);
    const files = (await git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
    const hashes = {};
    for (const file of [...new Set(files)].sort()) {
        try { hashes[file] = sha256(await readFile(file)); }
        catch (e) { if (e.code !== 'ENOENT') throw e; hashes[file] = null; }
    }
    return { revision, status, hashes };
}
async function assets(directory = 'dist', prefix = '') {
    const result = {};
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = `${prefix}${entry.name}`, disk = resolve(directory, entry.name);
        if (entry.isDirectory()) Object.assign(result, await assets(disk, `${path}/`));
        else if (/\.(?:html|js|css)$/.test(path)) result[path] = sha256(await readFile(disk));
    }
    return result;
}
async function runChild(args, env, output) {
    // Node executable + argument array; no shell interpolation, npm installation or deployment.
    try {
        const result = await execute(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', ...args],
            { env: { ...process.env, ...env }, maxBuffer: 24 * 1024 * 1024 });
        await writeFile(output, `${result.stdout}\n${result.stderr}`, { flag: 'wx' });
    } catch (error) {
        await writeFile(output, `${error.stdout || ''}\n${error.stderr || ''}`, { flag: 'wx' });
        throw new Error(`Child command failed; retain ${output}`);
    }
}
async function fetchBytes(url) {
    const response = await fetch(url, { redirect: 'error', cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, sha256: sha256(bytes), checkedAt: new Date().toISOString() };
}
async function sqlRun(report, directory, secrets) {
    let env = '';
    try { env = await readFile('.env.local', 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const url = process.env.VITE_SUPABASE_URL || env.match(/^\s*VITE_SUPABASE_URL\s*=\s*['"]?([^\s'"]+)/m)?.[1];
    const projectRef = url?.match(/^https:\/\/([a-z]{20})\.supabase\.co\/?$/)?.[1];
    check(projectRef, 'Set the existing rehearsal VITE_SUPABASE_URL.');
    report.projectRef = projectRef;
    console.log(`GC05 SQL target: ${projectRef}. Synthetic fixtures roll back. No migration will run.`);
    const token = await promptToken();
    secrets.push(token);
    check(/^sbp_[A-Za-z0-9_-]+$/.test(token), 'Expected a Supabase personal access token.');
    const send = async (label, query, readOnly) => {
        const record = { label, startedAt: new Date().toISOString(), querySha256: sha256(query), readOnly };
        report.requests.push(record);
        await writeFile(resolve(directory, `${label}.sql`), query, { flag: 'wx' });
        try {
            const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
                method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, read_only: readOnly }), signal: AbortSignal.timeout(90000)
            });
            record.status = response.status;
            record.requestId = response.headers.get('sb-request-id') || response.headers.get('x-request-id');
            record.data = await response.json();
            check(response.ok && Array.isArray(record.data), `SQL request ${label} failed: HTTP ${response.status}`);
            return record;
        } finally { record.finishedAt = new Date().toISOString(); }
    };
    assertManagementReady(await send('preflight', MANAGEMENT_PROBE, true));
    const suite = await readFile(suitePath, 'utf8');
    report.suiteSha256 = sha256(suite);
    report.migrationSourceSha256 = sha256(await readFile(migrationPath));
    // These are source/current-schema receipts, not historical installation timestamps.
    await writeFile(resolve(directory, 'original-suite.sql'), suite, { flag: 'wx' });
    await writeFile(resolve(directory, 'migration-source.sql'), await readFile(migrationPath), { flag: 'wx' });
    await send('installed-schema', schemaQuery, true);
    report.sql = assertSqlReceipt(await send('assertions-and-rollback', sqlEvidenceQuery(suite), false), report.suiteSha256);
    report.sqlPassed = true;
}
async function browserRun(mode, report, paths, secrets) {
    const hosted = mode === 'deployed';
    const target = hosted ? deployedURL(process.env.GC05_DEPLOYED_URL
        || await ask('Deployed website directory URL: ')) : 'http://127.0.0.1:4174/';
    report.baseURL = target;
    report.browserBackend = hosted ? 'no session; backend requests blocked; production mock disabled' : 'synthetic mock; not hosted Auth/RPC';
    if (hosted) {
        const workflow = deploymentRun(process.env.GC05_DEPLOYMENT_RUN_URL
            || await ask('Successful Deploy GitHub Pages Actions run URL: '));
        report.workflow = { ...workflow };
        const token = await promptGitHubToken();
        if (token) secrets.push(token);
        report.workflow = await lookupGitHubWorkflow(workflow.url, token);
        assertGitHubLookup(report.workflow);
        assertDeploymentRun(report.workflow.receipt, report.source, workflow.url);
    }
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    const basePath = new URL(target).pathname;
    const env = { VITE_PUBLIC_BASE_PATH: basePath, GC05_EVIDENCE_RUN: report.run,
        GC05_DEPLOYED_URL: hosted ? target : '', npm_package_version: pkg.version };
    console.log(`Building a fresh ${basePath} candidate; this replaces local dist only.`);
    await runChild(['node_modules/vite/bin/vite.js', 'build'], env, resolve(paths.directory, 'build.log'));
    report.assetHashes = await assets();
    for (const file of ['index.html', 'teams/green/facilitator.html', 'teams/green/scribe.html', 'whitecell.html']) {
        check(report.assetHashes[file], `Build missing ${file}`);
    }
    if (hosted) {
        report.deploymentAssets = {};
        for (const [file, expected] of Object.entries(report.assetHashes)) {
            const receipt = await fetchBytes(new URL(file, target));
            report.deploymentAssets[file] = receipt;
            assertAssetReceipt(receipt, expected, file);
        }
        // Check the directory URL itself as well as the explicit index route.
        report.landing = await fetchBytes(target);
        assertAssetReceipt(report.landing, report.assetHashes['index.html'], 'landing directory');
        report.deployedAssetsPassed = true;
    }
    await runChild(['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.gc05.config.js'],
        env, resolve(paths.directory, 'browser.log'));
    const browser = JSON.parse(await readFile(paths.browser, 'utf8'));
    assertBrowserReport(browser);
    report.browserStats = browser.stats;
    report.browserReportSha256 = sha256(await readFile(paths.browser));
    report.browserPassed = true;
}
export async function main(mode) {
    check(['sql', 'browser-root', 'deployed'].includes(mode), 'Usage: node scripts/gc05-evidence.mjs sql|browser-root|deployed');
    const run = randomUUID(), paths = evidencePaths(run), secrets = [];
    await mkdir(paths.directory, { recursive: true });
    const report = { run, mode, startedAt: new Date().toISOString(), requests: [], passed: false };
    console.log(`Evidence: ${resolve(paths.directory, 'results.json')}`);
    try {
        report.source = await sourceSnapshot();
        report.operator = process.env.GC05_EVIDENCE_OPERATOR || await ask('Evidence operator name or initials: ');
        check(report.operator.length > 0, 'An operator label is required.');
        if (mode === 'sql') await sqlRun(report, paths.directory, secrets);
        else await browserRun(mode, report, paths, secrets);
        const finalSource = await sourceSnapshot();
        check(JSON.stringify(finalSource) === JSON.stringify(report.source), 'Source changed during verification; retain this failed run and retry.');
        report.passed = true;
    } catch (error) {
        report.error = redact(error.message, secrets);
        throw new Error(report.error);
    } finally {
        report.finishedAt = new Date().toISOString();
        await writeFile(resolve(paths.directory, 'results.json'), JSON.stringify(redact(report, secrets), null, 2), { flag: 'wx' });
    }
    console.log(`PASS: GC05 ${mode}. Retain the entire unique evidence directory.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
