// SQL-only rehearsal contracts. Importing this module performs no I/O.
import { randomUUID } from 'node:crypto';
import { managedRaceSql } from './gc03-race-runner.mjs';

export const modes = ['identical', 'conflicting', 'setup-first', 'join-first'];
export const parentRun = '81b8e539-11ed-44d1-b0d3-9d19445cd9c1';
export const roster = 'green-roster-v172430443271577141009078629179796019649';
export const project = 'gsromgrxgrwwfywaoyme';
export const check = (ok, why) => { if (!ok) throw new Error(`GC08 contention: ${why}`); };
export const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const uuid = value => { check(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value), 'UUID required'); return value; };
export function manifest() {
    const run = randomUUID();
    return { version: 1, parentRun, project, roster, run, cases: modes.map((mode, i) => ({ mode,
        name: `GC08 SYNTHETIC CONTENTION ${run} ${mode}`, code: `GC08C${run.replaceAll('-','')}${i}`.toUpperCase(),
        key: randomUUID(), sessionId: null })) };
}
export function validate(m) {
    uuid(m.run); uuid(m.gm); uuid(m.actor);
    check(m.gm !== m.actor && m.project === project && m.parentRun === parentRun && m.roster === roster, 'target/identity/provenance mismatch');
    check(m.cases?.length === 4 && m.cases.every((c,i) => c.mode === modes[i]
        && c.code === `GC08C${m.run.replaceAll('-','')}${i}`.toUpperCase() && c.name === `GC08 SYNTHETIC CONTENTION ${m.run} ${c.mode}`), 'fixture identity mismatch');
    check(new Set(m.cases.map(c => uuid(c.key))).size === 4, 'request keys must be distinct');
    for (const c of m.cases) if (c.sessionId) uuid(c.sessionId);
}
export const identity = id => `RESET ROLE;
SELECT set_config('request.jwt.claim.sub',${literal(uuid(id))},true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',${literal(id)},'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;`;
const begin = `BEGIN; SET LOCAL statement_timeout='40s'; SET LOCAL lock_timeout='30s';
SET LOCAL idle_in_transaction_session_timeout='45s'; RESET ROLE;
SET LOCAL request.jwt.claim.sub=''; SET LOCAL request.jwt.claims='{}';`;
export const description = m => `SYNTHETIC ONLY; continuation of GC08 ${parentRun}; contention ${m.run}; not exercise approval.`;
export function guard(m) {
    validate(m);
    return `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.green_roster_approvals WHERE version=${literal(m.roster)}
AND approved_by='User-authorized GC08 synthetic fixture; not exercise approval'
AND snapshot=${literal(JSON.stringify({asian_pacific:['ROK','Japan','ASEAN'],europe:['UK','France','EU'],aliases:{'South Korea':'ROK'},source_references:[`GC08 SYNTHETIC REHEARSAL ${parentRun}; only this run; not exercise approval`]}))}::jsonb)
THEN RAISE EXCEPTION 'GC08 fixture approval/provenance mismatch'; END IF; END $$;`;
}
export function setupSql(m, c) {
    validate(m); check(['setup-first','join-first'].includes(c.mode), 'legacy setup fixture only');
    return `${begin}\n${guard(m)}\n${identity(m.gm)}
SELECT set_config('gc08.fixture',to_jsonb(public.create_live_demo_session(${literal(c.name)},${literal(c.code)},${literal(description(m))}))::text,true);
RESET ROLE;
SELECT 'PASS: new evidence-free legacy fixture' AS result,current_setting('gc08.fixture')::jsonb AS session;
COMMIT;`;
}
const createCall = (m,c,conflict=false) => `to_jsonb(public.create_configured_live_session(${literal(c.name+(conflict?' changed-intent':''))},${literal(c.code)},${literal(description(m))},'shared_facilitator_v1',${literal(m.roster)},${literal(c.key)}::uuid))`;
const setupCall = (m,c) => `to_jsonb(public.configure_session_green_shared_facilitator(${literal(uuid(c.sessionId))}::uuid,${literal(m.roster)}))`;
const joinCall = (m,c) => `public.claim_session_role_seat(${literal(uuid(c.sessionId))}::uuid,'green_scribe',${literal('GC08 synthetic contention '+m.run)},${literal('gc08-contention-'+m.actor)},90)`;
export function raceSql(m, c) {
    validate(m); check(m.cases.includes(c), 'case must belong to manifest');
    const creating = ['identical','conflicting'].includes(c.mode);
    const marker = parseInt(m.run.replaceAll('-','').slice(0,7),16) + modes.indexOf(c.mode)*2;
    const peer = n => `SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=174008::oid AND objid=${n}::oid AND objsubid=2 AND granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND pid<>pg_backend_pid()`;
    const scoped = creating ? '' : `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.sessions WHERE id=${literal(c.sessionId)}::uuid AND name=${literal(c.name)} AND session_code=${literal(c.code)} AND status='active' AND NOT is_protected AND session_topology_version=1 AND green_roster_version IS NULL AND NOT public.green_session_has_evidence(id)) THEN RAISE EXCEPTION 'GC08 setup fixture not evidence-free'; END IF; END $$;`;
    const header = `${begin}\n${guard(m)}\n${scoped}`;
    const aCall = creating ? createCall(m,c) : c.mode === 'setup-first' ? setupCall(m,c) : joinCall(m,c);
    const bCall = creating ? createCall(m,c,c.mode==='conflicting') : c.mode === 'setup-first' ? joinCall(m,c) : setupCall(m,c);
    const expected = c.mode === 'conflicting' ? ['PT409','GC08_RETRY_CONFLICT'] : c.mode === 'setup-first' ? ['42501','GC03_TOPOLOGY_ROLE_MISMATCH'] : ['23514','GC04A_SEAT_MODEL_FROZEN'];
    const a = `${header}\n${identity(c.mode==='join-first'?m.actor:m.gm)}
SELECT set_config('gc08.value',(${aCall})::text,true);
RESET ROLE;
SELECT pg_advisory_xact_lock(174008,${marker});
DO $$ DECLARE peer integer; observation jsonb; deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN LOOP
SELECT pid INTO peer FROM (${peer(marker+1)}) p;
IF peer IS NOT NULL AND pg_backend_pid()=ANY(pg_blocking_pids(peer)) THEN
SELECT jsonb_build_object('at',clock_timestamp(),'wait_event_type',wait_event_type,'wait_event',wait_event,'blockers',pg_blocking_pids(peer)) INTO observation FROM pg_stat_activity WHERE pid=peer;
PERFORM set_config('gc08.peer',peer::text,true); PERFORM set_config('gc08.blocking',observation::text,true); EXIT; END IF;
IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'GC08 no observed competing backend block'; END IF;
PERFORM pg_sleep(0.05); END LOOP; PERFORM pg_sleep(1); END $$;
SELECT 'PASS: A observed B blocked' AS result,pg_backend_pid() AS connection_a,current_setting('gc08.peer')::integer AS connection_b,
current_setting('gc08.blocking')::jsonb AS blocking,current_setting('gc08.value')::jsonb AS value;
COMMIT;`;
    const b = `${header}
SELECT pg_advisory_xact_lock(174008,${marker+1});
DO $$ DECLARE peer integer; deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN LOOP
SELECT pid INTO peer FROM (${peer(marker)}) p; EXIT WHEN peer IS NOT NULL;
IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'GC08 no competing backend'; END IF;
PERFORM pg_sleep(0.05); END LOOP; PERFORM set_config('gc08.peer',peer::text,true); END $$;
${identity(c.mode==='setup-first'?m.actor:m.gm)}
DO $$ DECLARE looked jsonb; BEGIN
BEGIN looked:=public.lookup_joinable_session_by_code(${literal(c.code)});
PERFORM set_config('gc08.precommit',jsonb_build_object('lookup',looked)::text,true);
EXCEPTION WHEN SQLSTATE 'P0002' THEN PERFORM set_config('gc08.precommit',jsonb_build_object('sqlstate',SQLSTATE,'message',SQLERRM)::text,true); END;
${creating ? `IF current_setting('gc08.precommit')::jsonb->>'sqlstate' IS DISTINCT FROM 'P0002' THEN RAISE EXCEPTION 'GC08 uncommitted creation exposed by lookup'; END IF;` : ''}
END $$;
DO $$ DECLARE started timestamptz:=clock_timestamp(); item jsonb; rejected boolean:=false; BEGIN
${c.mode==='identical' ? `item:=${bCall};` : `BEGIN item:=${bCall};
EXCEPTION WHEN SQLSTATE '${expected[0]}' THEN
IF SQLERRM IS DISTINCT FROM '${expected[1]}' THEN RAISE; END IF;
rejected:=true; item:=jsonb_build_object('sqlstate',SQLSTATE,'message',SQLERRM); END;
IF NOT rejected THEN RAISE EXCEPTION 'GC08 competing operation unexpectedly succeeded'; END IF;`}
PERFORM set_config('gc08.value',item::text,true);
PERFORM set_config('gc08.wait_ms',(extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END $$;
RESET ROLE;
SELECT 'PASS: ${c.mode}' AS result,current_setting('gc08.peer')::integer AS connection_a,pg_backend_pid() AS connection_b,
current_setting('gc08.wait_ms')::numeric AS waited_ms,current_setting('gc08.precommit')::jsonb AS precommit,current_setting('gc08.value')::jsonb AS value;
COMMIT;`;
    return { a: managedRaceSql(a), b: managedRaceSql(b) };
}
export function assertRace(mode, a, b) {
    const receipt = x => { check(x?.status>=200 && x.status<300 && x.data?.length===1, 'successful one-row race response required'); return x.data[0].receipt; };
    const ar=receipt(a),br=receipt(b);
    check(modes.includes(mode) && ar?.result==='PASS: A observed B blocked' && br?.result===`PASS: ${mode}`, 'race labels');
    check(Number.isInteger(ar.connection_a) && ar.connection_a>0 && Number.isInteger(ar.connection_b) && ar.connection_b>0
        && ar.connection_a!==ar.connection_b && ar.connection_a===br.connection_a && ar.connection_b===br.connection_b, 'distinct matching backend IDs');
    check(ar.blocking?.wait_event_type==='Lock' && ar.blocking.blockers?.includes(ar.connection_a)
        && Number.isFinite(Number(br.waited_ms)) && Number(br.waited_ms)>=500, 'observed blocking and nontrivial wait required');
    if (['identical','conflicting'].includes(mode)) check(br.precommit?.sqlstate==='P0002', 'uncommitted creation must not be joinable');
    if (mode==='identical') check(ar.value?.id && ar.value.id===br.value?.id, 'identical retries must return same session');
    else { const expected={conflicting:['PT409','GC08_RETRY_CONFLICT'],'setup-first':['42501','GC03_TOPOLOGY_ROLE_MISMATCH'],'join-first':['23514','GC04A_SEAT_MODEL_FROZEN']}[mode];
        check(br.value?.sqlstate===expected[0] && br.value.message===expected[1], 'exact competing rejection required'); }
    return { mode, connectionA:ar.connection_a, connectionB:ar.connection_b, blocking:ar.blocking, waitedMs:Number(br.waited_ms), precommit:br.precommit, winner:ar.value, loser:br.value };
}
export function readbackSql(m,c) {
    validate(m);
    return `SELECT pg_backend_pid() AS observer_pid,clock_timestamp() AS observed_at,
(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.sessions s WHERE session_code=${literal(c.code)}) AS sessions,
(SELECT jsonb_agg(to_jsonb(g) ORDER BY g.id) FROM public.game_state g JOIN public.sessions s ON s.id=g.session_id WHERE s.session_code=${literal(c.code)}) AS clocks,
(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.request_key) FROM public.gc08_session_creations r WHERE operator_id=${literal(m.gm)}::uuid AND request_key=${literal(c.key)}::uuid) AS receipts,
(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.session_participants p JOIN public.sessions s ON s.id=p.session_id WHERE s.session_code=${literal(c.code)}) AS seats;`;
}
export function assertCommitted(m,c,row,race) {
    check(row?.sessions?.length===1 && row.clocks?.length===1, 'one committed session and clock');
    const s=row.sessions[0], receipts=row.receipts||[], seats=row.seats||[];
    check(s.id===c.sessionId && s.name===c.name && s.session_code===c.code && s.status==='active' && row.clocks[0].session_id===s.id, 'committed fixture identity');
    const creating=['identical','conflicting'].includes(c.mode);
    check(receipts.length===(creating?1:0), 'exact receipt count');
    if (creating) check(receipts[0].session_id===s.id && receipts[0].operator_id===m.gm && receipts[0].request_key===c.key && receipts[0].request.name===c.name, 'receipt binds original intent');
    check(seats.length===(c.mode==='join-first'?1:0), 'exact committed seat count');
    if(c.mode==='join-first') check(s.session_topology_version===1 && s.green_seat_model===null && s.green_roster_version===null && s.green_roster_snapshot===null && seats[0].id===race.winner.id && seats[0].role==='green_scribe' && seats[0].delegation_id===null, 'join winner must retain unified topology');
    else check(s.session_topology_version===2 && s.green_seat_model==='shared_facilitator_v1' && s.green_roster_version===m.roster && s.id===race.winner.id, 'setup winner must retain approved shared topology');
    return s;
}
