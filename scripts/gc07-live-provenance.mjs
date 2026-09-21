import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, relative, join } from 'node:path';
import { check } from './gc07-live-contract.mjs';

const exec = promisify(execFile);
export const sha = value => createHash('sha256').update(value).digest('hex');
const root = 'test-results/gc07-live';
export async function sourceSnapshot() {
    const git = async args => (await exec('git', args, { maxBuffer: 32 * 1024 * 1024 })).stdout.trimEnd();
    const names = (await git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean).sort();
    const files = {};
    for (const name of new Set(names)) {
        // Environment files are never evidence payloads, even if accidentally tracked.
        if (/(^|\/)\.env(?:\.|$)/.test(name)) continue;
        try { files[name] = sha(await readFile(name)); } catch (error) { if (error.code !== 'ENOENT') throw error; files[name] = 'deleted'; }
    }
    return { head: await git(['rev-parse', 'HEAD']), status: await git(['status', '--porcelain']), files, digest: sha(JSON.stringify(files)) };
}
export async function distribution() {
    const files = {};
    async function visit(directory) {
        for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
            const path = join(directory, entry.name);
            check(!entry.isSymbolicLink(), 'dist must not contain symlinks');
            if (entry.isDirectory()) await visit(path);
            else if (/\.(html|js|css|json)$/.test(entry.name)) files[relative(resolve('dist'), resolve(path)).replaceAll('\\', '/')] = sha(await readFile(path));
        }
    }
    await visit('dist'); check(files['index.html'] && Object.keys(files).some(p => p.endsWith('.js')), 'build distribution missing');
    return files;
}
export async function prepare() {
    await mkdir(root, { recursive: true });
    const value = { preparedAt: new Date().toISOString(), source: await sourceSnapshot() };
    await writeFile(`${root}/build-intent.json`, JSON.stringify(value, null, 2));
    console.log('Build intent recorded. Run the documented build, then seal.');
}
export async function seal() {
    const intent = JSON.parse(await readFile(`${root}/build-intent.json`, 'utf8'));
    const source = await sourceSnapshot();
    check(source.digest === intent.source.digest && source.head === intent.source.head, 'source changed since prepare; prepare/build again');
    check((await stat('dist/index.html')).mtimeMs >= Date.parse(intent.preparedAt), 'build predates prepare');
    const receipt = { ...intent, sealedAt: new Date().toISOString(), distribution: await distribution() };
    await writeFile(`${root}/build-receipt.json`, JSON.stringify(receipt, null, 2));
    console.log('Build receipt sealed. Deploy this dist or serve it locally before the hosted-backend rehearsal.');
}
export function assertSource(expected, actual) {
    check(actual.head === expected.head && actual.digest === expected.digest, 'source revision/content drift; no pass');
}
export function assertAsset(path, expectedHash, status, bytes) {
    check(status === 200 && sha(bytes) === expectedHash, `deployed asset mismatch: ${path}`);
}
export async function verifyDeployment(baseURL, projectRef, send = fetch) {
    const receipt = JSON.parse(await readFile(`${root}/build-receipt.json`, 'utf8'));
    assertSource(receipt.source, await sourceSnapshot());
    check(JSON.stringify(await distribution()) === JSON.stringify(receipt.distribution), 'dist changed since seal');
    const assets = [];
    let projectFound = false;
    for (const [path, hash] of Object.entries(receipt.distribution)) {
        const url = new URL(path, baseURL);
        check(url.href.startsWith(baseURL), 'asset escaped app base');
        const response = await send(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
        const bytes = Buffer.from(await response.arrayBuffer());
        assertAsset(path, hash, response.status, bytes);
        if (path.endsWith('.js') && bytes.includes(Buffer.from(`${projectRef}.supabase.co`))) projectFound = true;
        assets.push({ path, url: url.href, sha256: hash, status: response.status,
            etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') });
    }
    check(projectFound, 'built application must identify the same hosted Supabase project');
    return { checkedAt: new Date().toISOString(), baseURL, build: receipt, assets,
        scope: 'byte parity for HTML, JS, CSS and JSON; does not automate browser interaction' };
}

export const databaseSql = `SELECT current_database() AS database_name,current_user AS database_role,version() AS postgres_version,
current_setting('row_security') AS row_security,
(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity) ORDER BY c.relname)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 AND c.relname IN ('sessions','session_participants','actions','communications','requests','timeline','scoped_notetaker_data','artifact_workflow_reviews')) AS tables,
(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
 'acl',p.proacl,'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE')) ORDER BY p.oid::regprocedure::text)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND
 (p.proname LIKE 'gc0%' OR p.proname LIKE 'green_%' OR p.proname LIKE 'guard_green_%' OR p.proname LIKE 'capture_green_%'
 OR p.proname LIKE 'live_demo_%' OR p.proname IN ('write_regional_proposal','append_proposal_thread_message','gc02_unified_append_proposal_thread_message',
 'handoff_regional_orientation','submit_regional_orientation','operator_review_artifact','operator_review_proposal','operator_forward_proposal_response',
 'configure_session_green_topology','configure_session_green_shared_facilitator','archive_live_demo_session',
 'write_regional_rfi','send_regional_direct_message','operator_answer_regional_rfi','operator_answer_request',
 'operator_send_communication','operator_complete_action_with_notifications'))) AS functions,
(SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) ORDER BY t.tgrelid,t.tgname)
 FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.requests'::regclass,'public.communications'::regclass)) AS triggers,
(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexname) FROM pg_indexes i WHERE i.schemaname='public' AND i.indexname IN ('gc07_request_retry','gc07_direct_retry')) AS retry_indexes,
(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname) FROM pg_policies p WHERE p.schemaname='public'
 AND p.tablename IN ('actions','communications','requests','scoped_notetaker_data','artifact_workflow_reviews')) AS policies;`;
export function assertDatabase(row) {
    const tables = ['sessions','session_participants','actions','communications','requests','timeline','scoped_notetaker_data','artifact_workflow_reviews'];
    check(row?.database_name && row.row_security === 'on' && row.tables?.length === tables.length
        && tables.every(name => row.tables.some(t => t.name === name && t.rls === true)), 'RLS must remain enabled on all checked tables');
    for (const name of ['write_regional_proposal', 'append_proposal_thread_message', 'configure_session_green_shared_facilitator',
        'operator_forward_proposal_response', 'handoff_regional_orientation', 'submit_regional_orientation', 'archive_live_demo_session',
        'write_regional_rfi', 'send_regional_direct_message', 'operator_answer_regional_rfi', 'operator_answer_request', 'operator_send_communication'])
        check(row.functions?.some(f => f.signature.startsWith(`${name}(`) || f.signature.startsWith(`public.${name}(`)), `missing database function: ${name}`);
    check(row.policies?.length > 0, 'database policy provenance missing');
    for (const name of ['gc07_request_rpc_only', 'gc07_direct_rpc_only'])
        check(row.policies.some(p => p.policyname === name && p.permissive === 'RESTRICTIVE'), 'missing restrictive GC07 policy');
    for (const name of ['gc07_facilitates','gc07_message_audience','gc07_legacy_answer_request'])
        check(row.functions?.some(f => (f.signature.startsWith(`${name}(`) || f.signature.startsWith(`public.${name}(`))
            && f.authenticated_execute === false && f.anon_execute === false), `private helper exposed/missing: ${name}`);
    for (const name of ['write_regional_rfi','send_regional_direct_message','operator_answer_regional_rfi'])
        check(row.functions?.some(f => (f.signature.startsWith(`${name}(`) || f.signature.startsWith(`public.${name}(`))
            && f.authenticated_execute === true && f.anon_execute === false), `RPC grants missing/unsafe: ${name}`);
    check(row.retry_indexes?.length === 2 && row.triggers?.some(t => t.definition.includes('gc07_message_audience')
        && ['O','A'].includes(t.enabled)), 'retry indexes or active audience trigger missing');
}
