// Synthetic rehearsal only. Importing this module performs no I/O or SQL.
import { randomUUID } from 'node:crypto';
import { manifest, validateManifest, fixtureGuard, LOCAL_APP_BASE_URL, uuid,
    fixtureSessions, cleanupSql, archivedComplete } from './gc04-live-contract.mjs';
import { managedRaceSql, concurrentPair } from './gc03-race-runner.mjs';

export const STAGE = 'GC-05-orientations';
export function requireCheck(ok, label) {
    if (!ok) throw new Error(`GC05: ${label}`);
}
export function makeManifest(projectRef, operatorId) {
    return { version: 1, stage: STAGE, target: 'hosted-auth-rpc',
        fixture: manifest(projectRef, LOCAL_APP_BASE_URL, operatorId, { local: true, shared: true }),
        rfiId: randomUUID(), parentId: randomUUID() };
}
export function validate(m) {
    requireCheck(m?.version === 1 && m.stage === STAGE && m.target === 'hosted-auth-rpc', 'unexpected rehearsal manifest');
    validateManifest(m.fixture);
    requireCheck(m.fixture.version === 2, 'shared fixture required');
    const f = m.fixture;
    const ids = [f.run, f.sessionId, f.operatorId, f.raceSessionId, ...f.raceUsers,
        ...Object.values(f.actions), ...Object.values(f.forwarded), uuid(m.rfiId), uuid(m.parentId)];
    requireCheck(new Set(ids).size === ids.length, 'fixture identifiers must be distinct');
}
const header = `BEGIN;
SET LOCAL statement_timeout='35s'; SET LOCAL lock_timeout='25s';
RESET ROLE; SET LOCAL request.jwt.claim.sub=''; SET LOCAL request.jwt.claims='{}';`;
export function guarded(m, body) {
    validate(m);
    return `${header}\n${fixtureGuard(m.fixture)}\n${body}\nCOMMIT;`;
}
export function seedSql(m) {
    validate(m);
    return guarded(m, `DO $$ BEGIN
IF to_regprocedure('public.submit_regional_orientation(uuid,text,uuid,bigint,bigint)') IS NULL THEN
RAISE EXCEPTION 'Install GC05 before the rehearsal'; END IF; END $$;
-- Other-team transport records are synthetic; no participant decision is asserted.
INSERT INTO public.actions(session_id,team,move,phase,mechanism,sector,goal,ally_contingencies,status)
SELECT '${m.fixture.sessionId}',t.team,1,1,'Strategic Orientation','','GC05 synthetic qualification fixture',
'Strategic Orientation Details'||chr(10)||'Team: '||t.team,'submitted'
FROM (VALUES ('blue'),('red'),('industry')) t(team);
INSERT INTO public.requests(id,session_id,team,delegation_id,move,phase,query)
VALUES('${m.rfiId}','${m.fixture.sessionId}','green','europe',1,1,'GC05 synthetic private RFI');
INSERT INTO public.communications(id,session_id,move,from_role,to_role,type,content)
VALUES('${m.parentId}','${m.fixture.sessionId}',1,'white_cell','all','ANNOUNCEMENT','GC05 synthetic thread denial parent');`)
        + `\nSELECT '${m.fixture.run}' AS run_id;`;
}
export function expectDenial(response, code, label) {
    requireCheck(response.status >= 400 && response.status < 500 && response.data?.code === code,
        `${label}: expected ${code}, got HTTP ${response.status}/${response.data?.code || 'no code'}`);
}
export async function rejoinExpiredSeat(actor, sessionId, rpc) {
    uuid(sessionId);
    const prior = actor.seat;
    requireCheck(prior?.session_id === sessionId && prior.role === actor.role
        && prior.id && prior.participant_id && actor.clientId, 'expired fixture seat identity required');
    const result = await rpc(actor, 'claim_session_role_seat', {
        requested_session_id: sessionId, requested_role: actor.role, requested_name: 'GC05 synthetic rehearsal',
        requested_client_id: actor.clientId, requested_timeout_seconds: 90
    });
    const seat = result?.data;
    requireCheck(result?.status === 200 && seat?.id === prior.id && seat.participant_id === prior.participant_id
        && seat.session_id === sessionId && seat.role === prior.role && seat.client_id === actor.clientId
        && seat.delegation_id === prior.delegation_id && seat.green_seat_model === prior.green_seat_model
        && seat.is_active === true && seat.revoked_at === null && seat.claim_status === 'rejoined',
    `expired seat must rejoin with the same identity and scope (HTTP ${result?.status}/${seat?.code || 'unexpected receipt'})`);
    return seat;
}
export function assertDirectProgressionDenied(response, before, after, sessionId) {
    uuid(sessionId);
    const state = result => {
        requireCheck(result?.status === 200 && Array.isArray(result.data) && result.data.length === 1,
            'direct progression needs one readable persisted state before and after');
        const row = result.data[0];
        requireCheck(row?.session_id === sessionId && row.id && row.move === 1 && row.phase === 1,
            'direct progression changed state or targeted the wrong session');
        return row;
    };
    const prior = state(before), current = state(after);
    requireCheck(prior.id === current.id, 'direct progression replaced the state row');
    const zeroRows = response?.status === 200 && Array.isArray(response.data) && response.data.length === 0;
    const constraint = response?.status === 400 && response.data?.code === '23514';
    const permission = response?.status === 403 && response.data?.code === '42501';
    requireCheck(zeroRows || constraint || permission,
        'direct progression must reject or affect zero rows, with unchanged persisted state');
    return { outcome: zeroRows ? 'rls-zero-rows' : constraint ? 'constraint-denial' : 'permission-denial',
        status: response.status, code: response.data?.code, affectedRows: zeroRows ? 0 : undefined,
        before: prior, after: current };
}
export const MANAGEMENT_PROBE = 'SELECT 1 AS gc05_management_ready;';
export function assertManagementReady(response) {
    requireCheck(response?.status >= 200 && response.status < 300 && response.data?.length === 1
        && response.data[0].gc05_management_ready === 1,
    `management preflight HTTP ${response?.status}: ${response?.data?.message || 'missing readiness receipt'}. No fixture setup was attempted.`);
}
export async function cleanupFixtures(m, send) {
    validate(m);
    const sessions = fixtureSessions(m.fixture), ids = sessions.map(s => `'${s.id}'`).join(',');
    const presence = await send('cleanup-presence', `SELECT id FROM public.sessions WHERE id IN (${ids});`);
    requireCheck(presence?.status >= 200 && presence.status < 300 && Array.isArray(presence.data), 'fixture presence could not be verified');
    const found = presence.data.map(row => row.id);
    requireCheck(new Set(found).size === found.length && found.every(id => sessions.some(s => s.id === id)), 'unexpected fixture presence receipt');
    if (found.length === 0) return { outcome: 'absent', presence };
    requireCheck(found.length === sessions.length, 'partial fixture set; retain evidence for inspection');
    const archived = await send('archive', cleanupSql(m.fixture));
    requireCheck(archived?.status >= 200 && archived.status < 300 && archivedComplete(archived.data, m.fixture), 'both fixtures must be archived');
    return { outcome: 'archived', presence, archived };
}
export function assertRaceEvidence(a, b) {
    const receipt = response => {
        requireCheck(response?.status >= 200 && response.status < 300 && response.data?.length === 1,
            'missing successful concurrency receipt');
        return response.data[0].receipt;
    };
    const ar = receipt(a), br = receipt(b);
    requireCheck(ar?.result === 'PASS: return observed progression blocked'
        && br?.result === 'PASS: progression denied after committed return'
        && Number.isInteger(ar.connection_a) && Number.isInteger(ar.connection_b)
        && ar.connection_a > 0 && ar.connection_b > 0 && ar.connection_a !== ar.connection_b
        && ar.connection_a === br.connection_a && ar.connection_b === br.connection_b
        && Number.isFinite(Number(br.waited_ms)) && Number(br.waited_ms) >= 500,
    'receipts must prove matching distinct backends, observed blocking and a denied progression');
}
export function raceSql(m, action) {
    validate(m);
    uuid(action.id);
    requireCheck(action.session_id === m.fixture.sessionId && action.delegation_id === 'europe'
        && action.status === 'submitted' && Number.isInteger(action.revision_number) && action.revision_number > 0,
    'race requires the submitted Europe orientation in this fixture');
    const f = m.fixture, revision = action.revision_number;
    const marker = Number.parseInt(f.run.replaceAll('-', '').slice(0, 7), 16);
    const peer = n => `SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=174005::oid
AND objid=${n}::oid AND objsubid=2 AND granted
AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND pid<>pg_backend_pid()`;
    const identity = `SELECT set_config('request.jwt.claim.sub','${f.operatorId}',true);
SELECT set_config('request.jwt.claims','{"sub":"${f.operatorId}","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;`;
    const start = `${header}\n${fixtureGuard(f)}\n`;
    const a = start + `DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.actions WHERE id='${action.id}' AND session_id='${f.sessionId}'
AND team='green' AND delegation_id='europe' AND status='submitted' AND NOT is_deleted
AND public.gc05_orientation(to_jsonb(actions)) AND revision_number=${revision}) THEN
RAISE EXCEPTION 'GC05 race artifact mismatch'; END IF; END $$;
${identity}
SELECT public.operator_review_artifact('strategic_orientation','${action.id}','return_to_team','green',${revision},'GC05 synthetic race correction');
RESET ROLE;
SELECT pg_advisory_xact_lock(174005,${marker});
DO $$ DECLARE peer integer; deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN
LOOP
SELECT pid INTO peer FROM (${peer(marker + 1)}) p;
IF peer IS NOT NULL AND pg_backend_pid()=ANY(pg_blocking_pids(peer)) THEN
PERFORM set_config('gc05.peer',peer::text,true); EXIT; END IF;
IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'GC05 no blocked progression observed'; END IF;
PERFORM pg_sleep(0.1); END LOOP;
PERFORM pg_sleep(1); END $$;
SELECT 'PASS: return observed progression blocked' AS result, pg_backend_pid() AS connection_a,
current_setting('gc05.peer')::integer AS connection_b;
COMMIT;`;
    const b = start + `SELECT pg_advisory_xact_lock(174005,${marker + 1});
DO $$ DECLARE peer integer; deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN
LOOP
SELECT pid INTO peer FROM (${peer(marker)}) p;
EXIT WHEN peer IS NOT NULL;
IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'GC05 no return connection observed'; END IF;
PERFORM pg_sleep(0.1); END LOOP;
PERFORM set_config('gc05.peer',peer::text,true); END $$;
${identity}
DO $$ DECLARE started timestamptz:=clock_timestamp(); denied boolean:=false; BEGIN
BEGIN PERFORM public.operator_update_game_state('${f.sessionId}',2,1);
EXCEPTION WHEN check_violation THEN
IF position('green:europe' IN SQLERRM)=0 THEN RAISE; END IF;
denied:=true; END;
IF NOT denied THEN RAISE EXCEPTION 'GC05 progression bypassed return'; END IF;
PERFORM set_config('gc05.wait_ms',(extract(epoch FROM clock_timestamp()-started)*1000)::text,true);
END $$;
SELECT 'PASS: progression denied after committed return' AS result,
current_setting('gc05.peer')::integer AS connection_a, pg_backend_pid() AS connection_b,
current_setting('gc05.wait_ms')::numeric AS waited_ms;
COMMIT;`;
    const verify = guarded(m, `DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.game_state WHERE session_id='${f.sessionId}' AND move=1 AND phase=1)
OR NOT EXISTS(SELECT 1 FROM public.actions WHERE id='${action.id}' AND session_id='${f.sessionId}'
AND delegation_id='europe' AND status='draft' AND workflow_state='returned_to_team'
AND revision_number=${revision + 1} AND orientation_handoff_revision IS NULL)
OR public.gc05_orientation_completion('${f.sessionId}')->'missingTeams'<>'["green:europe"]'::jsonb
THEN RAISE EXCEPTION 'GC05 committed concurrency postcondition failed'; END IF; END $$;`)
        + "\nSELECT 'GC05 committed return and blocked progression' AS result;";
    return { a: managedRaceSql(a), b: managedRaceSql(b), verify };
}

export async function verifyRace(m, action, send, report) {
    const queries = raceSql(m, action);
    report.race = { passed: false, identityMode: 'simulated JWT; actual PostgreSQL connections' };
    const outcomes = await concurrentPair((side, query) => send(`race-${side}`, query), queries.a, queries.b);
    report.race.outcomes = Object.fromEntries(Object.entries(outcomes).map(([side, result]) => [side,
        result.status === 'fulfilled' ? result : { status: result.status, error: String(result.reason?.message || result.reason) }]));
    requireCheck(outcomes.a.status === 'fulfilled' && outcomes.b.status === 'fulfilled', 'both race requests must settle successfully');
    assertRaceEvidence(outcomes.a.value, outcomes.b.value);
    const verified = await send('race-committed', queries.verify);
    requireCheck(verified.status >= 200 && verified.status < 300 && verified.data?.length === 1
        && verified.data[0].result === 'GC05 committed return and blocked progression', 'committed race result');
    report.race.committed = verified;
    report.race.passed = true;
}
