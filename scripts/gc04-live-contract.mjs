import { randomUUID } from 'node:crypto';

export const ROLES = Object.freeze([
    { role: 'green_asian_pacific_scribe', region: 'asian_pacific', semantic: 'Scribe', surface: 'facilitator', label: 'Asia-Pacific' },
    { role: 'green_asian_pacific_facilitator', region: 'asian_pacific', semantic: 'Facilitator', surface: 'scribe', label: 'Asia-Pacific' },
    { role: 'green_europe_scribe', region: 'europe', semantic: 'Scribe', surface: 'facilitator', label: 'Europe' },
    { role: 'green_europe_facilitator', region: 'europe', semantic: 'Facilitator', surface: 'scribe', label: 'Europe' }
]);
export const MANUAL_CHECKS = ['join', 'workspace', 'offline', 'reconnect', 'permission', 'removal'];
export const SHARED_MODEL = 'shared_facilitator_v1';
export const SHARED_ROLES = Object.freeze([ROLES[0], ROLES[2], {
    role: 'green_shared_facilitator', region: null, semantic: 'Facilitator', surface: 'scribe', label: 'Asia-Pacific and Europe'
}]);
export const SHARED_VIEW_CHECK = 'shared-regional-view-persistence-without-authority-change';
export function actorLabel(actor) {
    return actor.role === 'green_shared_facilitator' ? 'Green Shared Facilitator — Asia-Pacific and Europe'
        : `Green - ${actor.label} ${actor.semantic}`;
}
export const AUTOMATED_CHECKS = ['hosted-auth-keyboard-join-reload-resume', 'direct-rpc-and-rls-isolation',
    'offline-announcement-and-server-revalidated-reconnect', 'base-path-deep-links-tampering-and-stale-storage',
    'operator-removal-dom-storage-deck-and-authority-cleanup'];
export function check(value, message) { if (!value) throw new Error(`GC04: ${message}`); }
export function redact(value, secrets = []) {
    let text = JSON.stringify(value);
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) text = text.replaceAll(secret, '[REDACTED]');
    text = text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]');
    text = text.replace(/\b(?:sbp_|sb_secret_)[A-Za-z0-9_-]+/g, '[REDACTED_SECRET]');
    return JSON.parse(text);
}
export function uuid(value) {
    check(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value), 'invalid fixture UUID');
    return value;
}
export const LOCAL_APP_BASE_URL = 'http://127.0.0.1:4174/Fractured-Order/';
export function appUrl(value, { local = false, shared = false } = {}) {
    const url = new URL(value);
    const transportAllowed = local
        ? url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        : url.protocol === 'https:';
    check(transportAllowed && !url.username && !url.password && !url.search && !url.hash,
        local ? 'local mode requires a loopback HTTP app URL without credentials, query or fragment'
            : 'use the deployed HTTPS app directory URL without credentials, query or fragment');
    check((shared || url.pathname !== '/') && url.pathname.endsWith('/') && !/%|\/\//.test(url.pathname),
        'use the app base-path directory, for example /Fractured-Order/');
    return url.href;
}
export function manifest(projectRef, baseURL, operatorId, { local = false, shared = false } = {}) {
    check(/^[a-z]{20}$/.test(projectRef), 'invalid Supabase project reference');
    const run = randomUUID();
    return { version: shared ? 2 : 1, run, projectRef, target: local ? 'local' : 'hosted',
        baseURL: appUrl(baseURL, { local, shared }), operatorId: uuid(operatorId),
        sessionId: randomUUID(), code: `GC04-${run.toUpperCase()}`,
        name: `GC04 LIVE TEST ${run}`, roster: `green-roster-v${Date.now()}`,
        actions: { asian_pacific: randomUUID(), europe: randomUUID() },
        ...(shared ? { greenSeatModel: SHARED_MODEL, stage: 'GC-04A-foundation',
            forwarded: { asian_pacific: randomUUID(), europe: randomUUID() },
            raceSessionId: randomUUID(), raceUsers: [randomUUID(), randomUUID()] } : {}) };
}
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
export function validateManifest(m) {
    check([1, 2].includes(m.version) && /^[a-z]{20}$/.test(m.projectRef), 'invalid manifest');
    for (const id of [m.run, m.sessionId, m.operatorId, ...Object.values(m.actions)]) uuid(id);
    check(m.name === `GC04 LIVE TEST ${m.run}` && m.code === `GC04-${m.run.toUpperCase()}`
        && /^green-roster-v[1-9][0-9]*$/.test(m.roster), 'fixture provenance mismatch');
    check(Object.keys(m.actions).sort().join(',') === 'asian_pacific,europe', 'fixture region set');
    // Previously recorded hosted manifests have no target field; keep their cleanup usable.
    check(m.target === undefined || ['local', 'hosted'].includes(m.target), 'invalid manifest target');
    if (m.version === 2) {
        check(m.greenSeatModel === SHARED_MODEL && m.stage === 'GC-04A-foundation', 'unsupported shared evidence stage');
        check(Object.keys(m.forwarded || {}).sort().join(',') === 'asian_pacific,europe'
            && m.raceUsers?.length === 2, 'shared fixture shape');
        const ids = [m.run, m.sessionId, m.operatorId, ...Object.values(m.actions),
            ...Object.values(m.forwarded), m.raceSessionId, ...m.raceUsers];
        ids.forEach(uuid);
        check(new Set(ids).size === ids.length, 'shared fixture IDs must be distinct');
    } else check(!m.greenSeatModel && !m.raceSessionId && !m.forwarded && !m.stage, 'legacy fixture model mismatch');
    appUrl(m.baseURL, { local: m.target === 'local', shared: m.version === 2 });
}
const begin = `BEGIN;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='10s';
SET LOCAL idle_in_transaction_session_timeout='60s';
RESET ROLE; SET LOCAL request.jwt.claim.sub=''; SET LOCAL request.jwt.claims='{}';`;
export function fixtureGuard(m) {
    validateManifest(m);
    return fixtureSessions(m).map(({ id, name, code }) => `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id='${id}'
AND name=${literal(name)} AND session_code=${literal(code)} AND session_topology_version=2
${m.version === 2 ? `AND green_seat_model='${SHARED_MODEL}'` : ''}
AND green_roster_version=${literal(m.roster)} AND session_classification='live_exercise' AND NOT is_protected)
THEN RAISE EXCEPTION 'GC04 fixture mismatch: refusing to touch an exercise'; END IF; END $$;`).join('\n');
}
export function fixtureSessions(m) {
    return [{ id: m.sessionId, name: m.name, code: m.code }, ...(m.version === 2
        ? [{ id: m.raceSessionId, name: `${m.name} race`, code: `${m.code}-RACE` }] : [])];
}
export function setupSql(m) {
    validateManifest(m);
    return `${begin}
DO $$ BEGIN
IF to_regprocedure('public.restore_session_seat_context(uuid,uuid)') IS NULL THEN
RAISE EXCEPTION 'Install GC04 migration before running live checks'; END IF;
${m.version === 2 ? `IF to_regprocedure('public.configure_session_green_shared_facilitator(uuid,text)') IS NULL THEN
RAISE EXCEPTION 'Install GC04A migration before shared checks'; END IF;` : ''}
IF EXISTS(SELECT 1 FROM public.sessions WHERE id='${m.sessionId}') THEN
RAISE EXCEPTION 'GC04 fixture already exists'; END IF;
END $$;
INSERT INTO public.green_roster_approvals(version,snapshot,approved_by,approved_at)
VALUES(${literal(m.roster)},'{"asian_pacific":[],"europe":[],"aliases":{},"source_references":["GC04 synthetic transport test only; not exercise approval"]}',
'GC04 synthetic transport test only',now());
${fixtureSessions(m).map(({ id, name, code }) => `INSERT INTO public.sessions(id,name,status,session_topology_version,session_code)
VALUES('${id}',${literal(name)},'active',2,${literal(code)});
UPDATE public.sessions SET green_roster_version=a.version,
${m.version === 2 ? `green_seat_model='${SHARED_MODEL}',` : ''}
green_roster_snapshot=a.snapshot||jsonb_build_object('approved_by',a.approved_by,'approved_at',a.approved_at)
FROM public.green_roster_approvals a WHERE a.version=${literal(m.roster)} AND id='${id}';
INSERT INTO public.game_state(session_id,move,phase) VALUES('${id}',1,1);
INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id)
VALUES('${m.operatorId}','whitecell','whitecell_lead','${id}');`).join('\n')}
${Object.entries(m.actions).map(([region, id]) => `INSERT INTO public.actions(id,session_id,team,delegation_id,move,phase,mechanism,sector,artifact_type,proposal_recipient_team,goal)
VALUES('${id}','${m.sessionId}','green','${region}',1,1,'Proposal','','proposal','blue','GC04 synthetic ${region} transport marker');`).join('\n')}
${m.version === 2 ? Object.entries(m.forwarded).map(([region, id]) => `INSERT INTO public.actions(id,session_id,team,delegation_id,move,phase,mechanism,sector,artifact_type,proposal_recipient_team,goal)
VALUES('${id}','${m.sessionId}','green','${region}',1,1,'Proposal','','proposal','blue','GC04A synthetic forwarded transport marker');
UPDATE public.actions SET ally_contingencies='Proposal Details'||chr(10)||'Scribe Handoff: forwarded' WHERE id='${id}' AND session_id='${m.sessionId}';`).join('\n') : ''}
COMMIT;
SELECT '${m.run}' AS run_id;`;
}
export function cleanupSql(m) {
    validateManifest(m);
    return `${begin}
${fixtureGuard(m)}
${fixtureSessions(m).map(({ id }) => `
SELECT set_config('request.jwt.claim.sub','${m.operatorId}',true);
SELECT set_config('request.jwt.claims','{"sub":"${m.operatorId}","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.sessions WHERE id='${id}' AND status='active') THEN
PERFORM public.archive_live_demo_session('${id}'::uuid); END IF; END $$;
RESET ROLE; SET LOCAL request.jwt.claim.sub=''; SET LOCAL request.jwt.claims='{}';
DELETE FROM public.operator_grants WHERE auth_user_id='${m.operatorId}' AND surface='whitecell' AND session_id='${id}';`).join('\n')}
COMMIT;
SELECT id,status FROM public.sessions WHERE id IN (${fixtureSessions(m).map(({ id }) => `'${id}'`).join(',')});`;
}
export function archivedComplete(rows, m) {
    return Array.isArray(rows) && rows.length === fixtureSessions(m).length
        && fixtureSessions(m).every(({ id }) => rows.filter(row => row.id === id && row.status === 'archived').length === 1);
}
export function manualComplete(records) {
    return records.length === ROLES.length * MANUAL_CHECKS.length && ROLES.every(({ role }) => MANUAL_CHECKS.every(step => {
        const matches = records.filter(r => r.role === role && r.step === step);
        return matches.length === 1 && matches[0].status === 'pass'
            && Boolean(matches[0].observation?.trim()) && Boolean(matches[0].at);
    }));
}
export function automatedComplete(records, { shared = false } = {}) {
    const expected = (shared ? SHARED_ROLES : ROLES).flatMap(({ role }) => AUTOMATED_CHECKS.map(label => ({ role, label })));
    if (shared) expected.push({ role: 'green_shared_facilitator', label: SHARED_VIEW_CHECK });
    return records.length === expected.length && expected.every(({ role, label }) =>
        records.filter(r => r.role === role && r.label === label && r.at).length === 1);
}
