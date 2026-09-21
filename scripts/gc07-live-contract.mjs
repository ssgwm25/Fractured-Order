// Human-run rehearsal contracts. Importing this module performs no I/O.
import { randomUUID } from 'node:crypto';
import { uuid, appUrl } from './gc04-live-contract.mjs';

export const check = (ok, message) => { if (!ok) throw new Error(`GC07: ${message}`); };
export const literal = value => `'${String(value).replaceAll("'", "''")}'`;
export const regions = ['asian_pacific', 'europe'];
export const roles = model => [...(model === 'unified' ? ['green_facilitator', 'green_scribe'] : [
    'green_asian_pacific_scribe', 'green_europe_scribe', ...(model === 'shared' ? ['green_shared_facilitator'] :
        ['green_asian_pacific_facilitator', 'green_europe_facilitator'])]), 'whitecell_lead', 'blue_scribe', 'red_scribe'];
export function makeManifest(projectRef, baseURL, local = false) {
    const run = randomUUID();
    return { version: 1, stage: 'GC-07-messaging', run, projectRef, local,
        baseURL: appUrl(baseURL, { local, shared: true }),
        roster: `green-roster-v${BigInt(`0x${run.replaceAll('-', '')}`)}`,
        sessions: ['shared', 'pairs', 'unified'].map(model => ({ model, id: randomUUID(),
            name: `GC07 SYNTHETIC REHEARSAL ${run} ${model}`, code: `GC07-${run}-${model}`, actors: [] })) };
}
export function validate(m, complete = true) {
    check(m?.version === 1 && m.stage === 'GC-07-messaging' && /^[a-z]{20}$/.test(m.projectRef), 'manifest format');
    uuid(m.run); appUrl(m.baseURL, { local: m.local, shared: true });
    check(m.roster === `green-roster-v${BigInt(`0x${m.run.replaceAll('-', '')}`)}`, 'roster provenance');
    check(m.sessions?.map(s => s.model).join(',') === 'shared,pairs,unified', 'exact fixture model set');
    const ids = [m.run];
    for (const s of m.sessions) {
        ids.push(uuid(s.id));
        check(s.name === `GC07 SYNTHETIC REHEARSAL ${m.run} ${s.model}` && s.code === `GC07-${m.run}-${s.model}`, 'session provenance');
        check(Array.isArray(s.actors) && s.actors.every(a => roles(s.model).includes(a.role)), 'actor roles');
        check(new Set(s.actors.map(a => a.role)).size === s.actors.length, 'duplicate actor role');
        if (complete) check(s.actors.length === roles(s.model).length, 'missing authenticated actors');
        for (const a of s.actors) {
            ids.push(uuid(a.userId));
            check(a.clientId === `gc07-${a.userId}` && a.sessionId === s.id, 'client/session identity');
        }
    }
    check(new Set(ids).size === ids.length, 'all users and fixture IDs must be distinct');
}
export const identity = id => `SELECT set_config('request.jwt.claim.sub','${uuid(id)}',true);
SELECT set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;`;
export const reset = "RESET ROLE; SET LOCAL request.jwt.claim.sub=''; SET LOCAL request.jwt.claims='{}';";
export const begin = `BEGIN; SET LOCAL statement_timeout='35s'; SET LOCAL lock_timeout='25s';
SET LOCAL idle_in_transaction_session_timeout='45s'; ${reset}`;
export const idsSql = m => m.sessions.map(s => literal(uuid(s.id))).join(',');
export const setupLock = m => `SELECT pg_advisory_xact_lock(174017,${parseInt(uuid(m.run).replaceAll('-', '').slice(0, 7), 16)});`;
const wc = s => s.actors.find(a => a.role === 'whitecell_lead').userId;
const rosterSnapshot = m => ({ asian_pacific: ['ROK', 'Japan', 'ASEAN'], europe: ['UK', 'France', 'EU'],
    aliases: { 'South Korea': 'ROK' }, source_references: [`GC07 SYNTHETIC REHEARSAL ${m.run}; not exercise approval`] });
export function guard(m) {
    validate(m);
    return m.sessions.map(s => `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.sessions s
WHERE id='${s.id}' AND name=${literal(s.name)} AND session_code=${literal(s.code)}
AND session_classification='live_exercise' AND NOT is_protected
AND session_topology_version=${s.model === 'unified' ? 1 : 2}
AND green_seat_model IS NOT DISTINCT FROM ${s.model === 'shared' ? "'shared_facilitator_v1'" : 'NULL'}
AND ${s.model === 'unified' ? 'green_roster_version IS NULL AND green_roster_snapshot IS NULL' : `green_roster_version=${literal(m.roster)}
AND green_roster_snapshot=(SELECT snapshot||jsonb_build_object('approved_by',approved_by,'approved_at',approved_at)
FROM public.green_roster_approvals WHERE version=${literal(m.roster)} AND snapshot=${literal(JSON.stringify(rosterSnapshot(m)))}::jsonb
AND approved_by='GC07 synthetic fixture; not exercise approval')`})
THEN RAISE EXCEPTION 'GC07 fixture mismatch; refusing to touch an exercise'; END IF; END $$;`).join('\n');
}
export function setupSql(m) {
    validate(m);
    return `${begin}
${setupLock(m)}
INSERT INTO public.green_roster_approvals(version,snapshot,approved_by,approved_at)
VALUES(${literal(m.roster)},${literal(JSON.stringify(rosterSnapshot(m)))}::jsonb,'GC07 synthetic fixture; not exercise approval',now());
${m.sessions.map(s => `INSERT INTO public.sessions(id,name,session_code,status,session_topology_version)
VALUES('${s.id}',${literal(s.name)},${literal(s.code)},'active',1);
INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id) VALUES('${wc(s)}','gamemaster','white','${s.id}');
${identity(wc(s))}
${s.model === 'shared' ? `SELECT public.configure_session_green_shared_facilitator('${s.id}',${literal(m.roster)});` :
    `SELECT public.configure_session_green_topology('${s.id}',${s.model === 'unified' ? 1 : 2},${s.model === 'unified' ? 'NULL' : literal(m.roster)});`}
${reset}
DELETE FROM public.operator_grants WHERE auth_user_id='${wc(s)}' AND surface='gamemaster' AND session_id='${s.id}' AND role='white';
INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id) VALUES('${wc(s)}','whitecell','whitecell_lead','${s.id}');
INSERT INTO public.game_state(session_id,move,phase) VALUES('${s.id}',1,1);
-- Submitted synthetic inputs only, never participant decisions or PLI results.
INSERT INTO public.actions(session_id,team,move,phase,mechanism,sector,goal,expected_outcomes,status,artifact_type,artifact_payload,ally_contingencies)
SELECT '${s.id}',t.team,1,1,'Other','Other','GC07 synthetic notification fixture '||t.team,
'Synthetic notification test only','submitted','action','{"action":{"notificationTeams":["Green"],"notificationNote":"GC07 synthetic request"}}'::jsonb,
'Notification Teams: ["Green"]'||chr(10)||'Notification Note: GC07 synthetic request'
FROM (VALUES('blue'),('red')) t(team);`).join('\n')}
${guard(m)}
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.session_participants WHERE session_id IN (${idsSql(m)})) THEN
RAISE EXCEPTION 'GC07 model must be configured before joins'; END IF; END $$;
COMMIT;
SELECT id,name,session_topology_version,green_seat_model,green_roster_version,topology_frozen_at FROM public.sessions WHERE id IN (${idsSql(m)});`;
}
export function cleanupSql(m) {
    validate(m);
    const users = m.sessions.flatMap(s => s.actors.map(a => literal(a.userId))).join(',');
    return `${begin}
${setupLock(m)}
${guard(m)}
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.operator_grants WHERE auth_user_id IN (${users})
AND (${m.sessions.map(s => `(auth_user_id='${wc(s)}' AND surface='whitecell' AND role='whitecell_lead'
AND session_id='${s.id}' AND team_id IS NULL)`).join(' OR ')}) IS NOT TRUE) THEN
RAISE EXCEPTION 'GC07 unexpected authority; refusing to replace unrelated grants'; END IF; END $$;
${m.sessions.map(s => `DELETE FROM public.operator_grants WHERE auth_user_id='${wc(s)}' AND surface='whitecell' AND session_id='${s.id}';
INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id) VALUES('${wc(s)}','whitecell','whitecell_lead','${s.id}');
${identity(wc(s))}
SELECT public.archive_live_demo_session('${s.id}');
${reset}
DELETE FROM public.operator_grants WHERE auth_user_id='${wc(s)}' AND surface='whitecell' AND session_id='${s.id}';`).join('\n')}
COMMIT;
${stateSql(m)}`;
}
export function stateSql(m) {
    validate(m);
    return `SELECT s.id,s.status,
(SELECT jsonb_agg(jsonb_build_object('id',p.id,'role',p.role,'authUserId',u.auth_user_id) ORDER BY p.id)
 FROM public.session_participants p JOIN public.participants u ON u.id=p.participant_id WHERE p.session_id=s.id) AS seat_identities,
(SELECT count(*)::integer FROM public.session_participants p WHERE p.session_id=s.id AND p.is_active) AS active_seats,
(SELECT count(*)::integer FROM public.operator_grants g WHERE g.auth_user_id IN (${m.sessions.flatMap(s => s.actors.map(a => literal(a.userId))).join(',')})) AS grants,
(SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg(to_jsonb(e)::text,',' ORDER BY e.event_id),'')))
 FROM public.research_audit_event_log e WHERE e.session_id=s.id AND e.event_type<>'SESSION_CLOSED') AS research_history,
(SELECT count(*)::integer FROM public.research_audit_event_log e WHERE e.session_id=s.id AND e.event_type='SESSION_CLOSED') AS closure_events,
${['actions', 'requests', 'communications', 'timeline', 'artifact_workflow_reviews', 'action_logs'].map(table => `(SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg(to_jsonb(h)::text,',' ORDER BY h.id),'')))
FROM public.${table} h WHERE ${table === 'action_logs' ? 'h.action_id IN (SELECT id FROM public.actions WHERE session_id=s.id)' : 'h.session_id=s.id'}) AS ${table}`).join(',\n')}
FROM public.sessions s WHERE s.id IN (${idsSql(m)}) ORDER BY s.id;`;
}
export function assertCleanup(m, before, after) {
    check(before?.length === 3 && after?.length === 3, 'cleanup requires all three fixtures');
    for (const s of m.sessions) {
        const b = before.find(r => r.id === s.id), a = after.find(r => r.id === s.id);
        check(b && a && a.status === 'archived' && a.active_seats === 0 && a.grants === 0, 'archive, seat closure and grant revocation');
        for (const table of ['actions', 'requests', 'communications', 'timeline', 'artifact_workflow_reviews', 'action_logs'])
            check(b[table]?.digest && JSON.stringify(b[table]) === JSON.stringify(a[table]), `${table} history changed during cleanup`);
        check(b.research_history?.digest && JSON.stringify(b.research_history) === JSON.stringify(a.research_history), 'research history changed during cleanup');
        check(a.closure_events === b.closure_events + (b.status === 'archived' ? 0 : 1), 'archive audit event missing or duplicated');
    }
}
export function writeArgs(session, region, rfi = null, key = 'same-key', query = 'GC07 synthetic regional question?') {
    return { requested_session_id: session.id, requested_delegation_id: region, requested_request_id: rfi?.id ?? null,
        requested_expected_revision: rfi?.revision_number ?? null, requested_query: query,
        requested_categories: ['Other'], requested_client_key: rfi ? null : key };
}
export function one(response) {
    check(response.status >= 200 && response.status < 300, `HTTP ${response.status}: ${response.data?.code || ''} ${response.data?.message || ''}`);
    const row = Array.isArray(response.data) ? response.data.length === 1 && response.data[0] : response.data;
    check(row && typeof row === 'object', 'expected one persisted result'); return row;
}
export function denied(response, codes = ['42501']) {
    check(response.status >= 400 && response.status < 500 && codes.includes(response.data?.code),
        `expected denial ${codes.join('/')}, received ${response.status}/${response.data?.code}`);
}
export function rows(response) {
    check(response.status >= 200 && response.status < 300 && Array.isArray(response.data), 'expected readable rows'); return response.data;
}
export function assertSeat(session, actor, seat) {
    const delegation = actor.role.includes('asian_pacific') ? 'asian_pacific' : actor.role.includes('europe') ? 'europe' : null;
    const model = session.model === 'shared' ? 'shared_facilitator_v1' : session.model === 'pairs' ? 'regional_pairs_v1' : 'unified_v1';
    // The historical claim RPC predates the Green model/delegation response fields.
    const modelMatches = seat?.green_seat_model === model || session.model === 'unified' && seat?.green_seat_model == null;
    check(seat?.session_id === session.id && seat.role === actor.role && seat.is_active === true && seat.revoked_at == null
        && seat.client_id === actor.clientId && (seat.delegation_id ?? null) === delegation && modelMatches
        && seat.id && seat.participant_id
        && (!actor.seat || seat.id === actor.seat.id && seat.participant_id === actor.seat.participant_id), 'active seat identity must persist on rejoin');
}
export function assertBlockedMutation(response, before, after) {
    const empty = response.status >= 200 && response.status < 300 && Array.isArray(response.data) && response.data.length === 0;
    if (!empty) denied(response, ['42501', '23514']);
    check(before?.id && before.id === after?.id && JSON.stringify(before) === JSON.stringify(after), 'denied direct mutation changed persisted artifact');
}
