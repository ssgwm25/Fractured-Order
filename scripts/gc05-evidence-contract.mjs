import { createHash } from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function requireEvidence(condition, message) {
    if (!condition) throw new Error(message);
}
export function evidencePaths(run) {
    requireEvidence(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(run || ''), 'Invalid evidence run ID.');
    const directory = `output/release-evidence/gc05/${run}`;
    return { directory, artifacts: `${directory}/artifacts`, browser: `${directory}/browser.json` };
}
export function deployedURL(value) {
    const url = new URL(value);
    requireEvidence(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
        && !url.port && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        && ['/', '/Fractured-Order/'].includes(url.pathname),
    'Use the HTTPS deployment directory URL, ending / or /Fractured-Order/, without credentials or query parameters.');
    return url.href;
}
export function deploymentRun(value) {
    const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/actions\/runs\/([1-9][0-9]*)$/.exec(value || '');
    requireEvidence(match, 'Set GC05_DEPLOYMENT_RUN_URL to the successful Deploy GitHub Pages Actions run URL.');
    return { url: value, api: `https://api.github.com/repos/${match[1]}/${match[2]}/actions/runs/${match[3]}` };
}
export function assertDeploymentRun(data, source, url) {
    requireEvidence(source.status === '' && data?.html_url === url && data?.head_sha === source.revision
        && data?.status === 'completed' && data?.conclusion === 'success'
        && data?.path === '.github/workflows/deploy-pages.yml',
    'Deployment requires a clean matching source commit and a successful Deploy GitHub Pages run.');
}
export function assertBrowserReport(report) {
    requireEvidence(report?.stats?.expected === 2 && report.stats.unexpected === 0
        && report.stats.skipped === 0 && report.stats.flaky === 0 && Array.isArray(report.errors)
        && report.errors.length === 0, 'Expected exactly two passing browser tests, no skips, retries or runner errors.');
}
export function assertAssetReceipt(receipt, expected, file) {
    requireEvidence(receipt?.status === 200 && typeof expected === 'string' && /^[a-f0-9]{64}$/.test(expected)
        && receipt.sha256 === expected, `Deployed route/asset mismatch: ${file}`);
}
export function readOnlyRequestAllowed(url, method) {
    return ['GET', 'HEAD'].includes(method) && !/(?:^|\.)supabase\.co$/.test(new URL(url).hostname);
}

// Reuse the exact assertion block. Roll back its entire subtransaction before
// returning a receipt; no fixture or production object is committed. Variables
// survive a PL/pgSQL exception, allowing report/IDs to be checked after rollback.
export function sqlEvidenceQuery(source) {
    const normalized = source.replaceAll('\r\n', '\n');
    const match = normalized.match(/\bBEGIN;\n([\s\S]*?)(DO \$gc05_suite\$[\s\S]*?END \$gc05_suite\$;)/);
    requireEvidence(match && /ROLLBACK;\s*$/.test(normalized)
        && !/\bCOMMIT\b/.test(normalized) && !normalized.includes('$gc05_original$'), 'Unexpected GC05 SQL suite shape.');
    return `DO $gc05_capture$
DECLARE
    report JSONB; ids UUID[]; rosters TEXT[]; actor_ids UUID[];
    started TIMESTAMPTZ := clock_timestamp(); rolled_back BOOLEAN := false;
    sessions_remaining INTEGER; rosters_remaining INTEGER; grants_remaining INTEGER; seats_remaining INTEGER;
BEGIN
    BEGIN
        EXECUTE $gc05_original$${match[1]}${match[2]}$gc05_original$;
        report := NULLIF(current_setting('gc05.rehearsal_result',true),'')::JSONB;
        SELECT array_agg(id),array_agg(roster) INTO ids,rosters FROM pg_temp.gc05_sessions;
        SELECT array_agg(auth_id) INTO actor_ids FROM pg_temp.gc05_actors;
        IF report IS NULL OR cardinality(ids)<>3 THEN RAISE EXCEPTION 'Missing GC05 capture'; END IF;
        RAISE EXCEPTION USING ERRCODE='Z0505',MESSAGE='GC05 deliberate fixture rollback';
    EXCEPTION WHEN SQLSTATE 'Z0505' THEN
        IF report IS NULL OR ids IS NULL THEN RAISE; END IF;
        rolled_back := true;
    END;
    SELECT count(*) INTO sessions_remaining FROM public.sessions WHERE id=ANY(ids);
    SELECT count(*) INTO rosters_remaining FROM public.green_roster_approvals WHERE version=ANY(rosters);
    SELECT count(*) INTO grants_remaining FROM public.operator_grants WHERE auth_user_id=ANY(actor_ids);
    SELECT count(*) INTO seats_remaining FROM public.session_participants WHERE session_id=ANY(ids);
    IF NOT rolled_back OR sessions_remaining<>0 OR rosters_remaining<>0 OR grants_remaining<>0 OR seats_remaining<>0
        OR to_regclass('pg_temp.gc05_sessions') IS NOT NULL THEN
        RAISE EXCEPTION 'GC05 rollback postcondition failed';
    END IF;
    report := report || jsonb_build_object('rollbackVerified',true,'rollbackScope','fixture subtransaction',
        'sessionIds',ids,'rosterVersions',rosters,'sessionsRemaining',sessions_remaining,
        'rostersRemaining',rosters_remaining,'grantsRemaining',grants_remaining,'seatsRemaining',seats_remaining,
        'serverStartedAt',started,'serverFinishedAt',clock_timestamp(),'database',current_database(),
        'databaseRole',current_user,'rowSecurity',current_setting('row_security'),'serverVersion',version(),
        'suiteSha256','${sha256(source)}');
    PERFORM set_config('gc05.evidence_receipt',report::TEXT,false);
END $gc05_capture$;
WITH receipt AS MATERIALIZED (SELECT current_setting('gc05.evidence_receipt')::JSONB AS evidence)
SELECT evidence,set_config('gc05.evidence_receipt','',false) AS cleared FROM receipt;
`;
}
export function assertSqlReceipt(response, suiteHash) {
    const r = response?.data?.[0]?.evidence;
    requireEvidence(response?.status >= 200 && response.status < 300 && Array.isArray(response.data) && response.data.length === 1
        && response.data[0].cleared === '' && r?.suite === 'GC05' && r.suiteSha256 === suiteHash
        && r.assertions === 102 && Array.isArray(r.results) && r.results.length === 102
        && r.results.every(item => item.result === 'PASS' && typeof item.label === 'string' && item.label.length > 0)
        && new Set(r.results.map(item => item.label)).size === 102
        && r.rollbackVerified === true && r.rollbackScope === 'fixture subtransaction'
        && Array.isArray(r.sessionIds) && r.sessionIds.length === 3 && new Set(r.sessionIds).size === 3
        && [r.sessionsRemaining, r.rostersRemaining, r.grantsRemaining, r.seatsRemaining].every(n => n === 0)
        && r.rowSecurity === 'on' && ['database', 'databaseRole', 'serverVersion'].every(key => typeof r[key] === 'string' && r[key].length > 0)
        && Number.isFinite(Date.parse(r.serverStartedAt)) && Number.isFinite(Date.parse(r.serverFinishedAt))
        && Date.parse(r.serverFinishedAt) >= Date.parse(r.serverStartedAt),
    'SQL receipt must prove 102 distinct passes, source identity, server times and fixture rollback.');
    return r;
}
