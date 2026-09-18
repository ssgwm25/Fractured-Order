import { buildSqlFiles } from './gc03-hosted-check.mjs';
import { BOUNDARY_TABLES, sqlId, uuid, check } from './gc03-completion-contract.mjs';

export const ACTORS = ['apS', 'apF', 'apN', 'euS', 'euF', 'euN', 'blue', 'red', 'wc', 'wcLife', 'outsider'];
export const transaction = sql => `BEGIN;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='10s';
SET LOCAL idle_in_transaction_session_timeout='60s';
RESET ROLE; SET LOCAL request.jwt.claim.sub=''; SET LOCAL request.jwt.claims='{}';
${sql}
COMMIT;`;

export function fixtureGuard(m) {
    buildSqlFiles(m); uuid(m.legacy);
    const expected = Object.entries(m.sessions).map(([key, id]) => `(${sqlId(id)}::uuid,'GC03 SECURITY TEST ${m.run} ${key}',2)`);
    expected.push(`(${sqlId(m.legacy)}::uuid,'GC03 SECURITY TEST ${m.run} legacy',1)`);
    return `DO $$ BEGIN IF EXISTS (SELECT 1 FROM (VALUES ${expected.join(',')}) e(id,name,topology)
LEFT JOIN public.sessions s ON s.id=e.id WHERE s.id IS NULL OR s.name<>e.name
OR s.session_topology_version<>e.topology OR s.session_code IS NOT NULL
OR s.is_protected OR s.session_classification<>'live_exercise'
OR (e.topology=2 AND s.green_roster_version IS DISTINCT FROM '${m.roster}'))
THEN RAISE EXCEPTION 'GC03 fixture identity mismatch'; END IF; END $$;`;
}

export function buildCompletionSql(m, users) {
    const base = buildSqlFiles(m);
    uuid(m.legacy);
    for (const actor of ACTORS) uuid(users[actor]?.id);
    check(new Set(ACTORS.map(a => users[a].id)).size === ACTORS.length, 'independent Auth identities');
    const grant = (actor, sid) => `INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id)
VALUES(${sqlId(users[actor].id)},'whitecell','whitecell_lead',${sqlId(sid)});`;
    const setupExtra = `INSERT INTO public.sessions(id,name,status,session_topology_version,session_code)
VALUES(${sqlId(m.legacy)},'GC03 SECURITY TEST ${m.run} legacy','active',1,NULL);
INSERT INTO public.game_state(session_id,move,phase) VALUES(${sqlId(m.legacy)},1,1);
${grant('wc', m.sessions.api)}
${grant('wcLife', m.sessions.same)}`;
    // One transaction for all fixtures and grants, preserving the existing generator.
    const setup = base['01-setup.sql'].replace('COMMIT;', `${setupExtra}\nCOMMIT;`);
    const cleanupBody = fixtureGuard(m) + '\n'
        + [['wc', m.sessions.api], ['wcLife', m.sessions.same]].map(([actor, sid]) =>
            `DELETE FROM public.operator_grants WHERE auth_user_id=${sqlId(users[actor].id)} AND surface='whitecell' AND session_id=${sqlId(sid)};`).join('\n')
        + '\n' + [...Object.values(m.sessions), m.legacy].map(sid => `
INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id)
VALUES(${sqlId(m.archiveUser)},'whitecell','whitecell_lead',${sqlId(sid)});
SELECT set_config('request.jwt.claim.sub',${sqlId(m.archiveUser)},true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',${sqlId(m.archiveUser)},'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
SELECT public.archive_live_demo_session(${sqlId(sid)}::uuid);
RESET ROLE; SET LOCAL request.jwt.claim.sub=''; SET LOCAL request.jwt.claims='{}';
DELETE FROM public.operator_grants WHERE auth_user_id=${sqlId(m.archiveUser)} AND surface='whitecell' AND session_id=${sqlId(sid)};`).join('\n');
    const ids = [...Object.values(m.sessions), m.legacy].map(sqlId).join(',');
    return { setup, cleanup: transaction(cleanupBody) + `\nSELECT id,name,status FROM public.sessions WHERE id IN (${ids}) ORDER BY name;` };
}

export function inventorySql() {
    const tables = [...BOUNDARY_TABLES, 'scoped_notetaker_data', 'research_note_revision'];
    const names = tables.map(t => `'${t}'`).join(',');
    return `SELECT jsonb_build_object(
'indexes',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'unique',i.indisunique,'valid',i.indisvalid,
'ready',i.indisready,'keys',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid,k,true) ORDER BY k)
FROM generate_series(1,i.indnkeyatts) k),'predicate',pg_get_expr(i.indpred,i.indrelid),'definition',pg_get_indexdef(i.indexrelid)))
FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.communications'::regclass),
'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
'authority_trigger',EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid=c.oid AND t.tgenabled IN ('O','A') AND p.proname='guard_green_authority')))
FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN (${names})),
'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public' AND tablename IN (${names})),
'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'signature',p.oid::regprocedure::text,
'definition',pg_get_functiondef(p.oid),'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')))
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'gc03_%' OR p.proname LIKE 'gc02_unified_%'
OR p.proname LIKE 'green_%' OR p.proname LIKE 'guard_green_%' OR p.proname IN (
'claim_session_role_seat','heartbeat_session_role_seat','disconnect_session_role_seat','operator_remove_session_participant',
'live_demo_participant_role','live_demo_participant_surface','live_demo_has_operator_grant','save_scoped_notetaker_data',
'operator_review_artifact','operator_review_proposal','operator_forward_proposal_response','append_proposal_thread_message','archive_live_demo_session')))
) AS inventory;`;
}

export function expireSeatSql(m, seatId, userId) {
    return transaction(fixtureGuard(m) + `
DO $$ BEGIN UPDATE public.session_participants sp SET heartbeat_at=now()-interval '91 seconds',last_seen=now()-interval '91 seconds'
FROM public.participants p WHERE sp.id=${sqlId(seatId)} AND sp.session_id=${sqlId(m.sessions.same)}
AND p.id=sp.participant_id AND p.auth_user_id=${sqlId(userId)} AND sp.revoked_at IS NULL;
IF NOT FOUND THEN RAISE EXCEPTION 'Expected exact lifecycle seat'; END IF; END $$;`);
}
