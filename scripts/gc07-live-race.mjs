import { begin, guard, identity, literal, check, validate, writeArgs } from './gc07-live-contract.mjs';
import { managedRaceSql, concurrentPair } from './gc03-race-runner.mjs';

const returnedRfiMessage = 'Only submitted RFIs can be returned for clarification.';

function call(args) {
    return `to_jsonb(public.write_regional_rfi(${literal(args.requested_session_id)}::uuid,${literal(args.requested_delegation_id)},
NULL,NULL,${literal(args.requested_query)},ARRAY['Other'],${literal(args.requested_client_key)}))`;
}
export function raceSql(m, mode, action) {
    validate(m); check(['regions', 'retry', 'stale'].includes(mode), 'unknown race');
    const s = m.sessions[0];
    const who = s.actors.find(a => a.role === (mode === 'stale' ? 'whitecell_lead' : 'green_shared_facilitator'));
    if (mode === 'stale') check(action?.session_id === s.id && action.delegation_id === 'asian_pacific'
        && action.workflow_state === 'submitted_to_white_cell' && action.status === 'pending'
        && Number.isSafeInteger(action.revision_number), 'review race needs a submitted fixture RFI');
    const aArgs = writeArgs(s, 'asian_pacific', null, `race-${mode}`);
    const bArgs = writeArgs(s, mode === 'regions' ? 'europe' : 'asian_pacific', null, `race-${mode}`);
    const review = mode === 'stale' ? `(public.operator_review_artifact('rfi',${literal(action.id)}::uuid,
'return_for_clarification','green',${action.revision_number},'GC07 synthetic competing review')->'artifact')` : null;
    const aCall = review || call(aArgs), bCall = review || call(bArgs);
    const marker = parseInt(m.run.replaceAll('-', '').slice(0, 7), 16) + ['regions', 'retry', 'stale'].indexOf(mode) * 2;
    const peer = n => `SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=174007::oid AND objid=${n}::oid
AND objsubid=2 AND granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND pid<>pg_backend_pid()`;
    const start = `${begin}\n${guard(m)}\n`;
    const a = `${start}${identity(who.userId)}
SELECT set_config('gc07.race_artifact',(${aCall})::text,true);
RESET ROLE;
SELECT pg_advisory_xact_lock(174007,${marker});
DO $$ DECLARE peer integer; deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN LOOP
SELECT pid INTO peer FROM (${peer(marker + 1)}) p;
IF peer IS NOT NULL AND pg_backend_pid()=ANY(pg_blocking_pids(peer)) THEN
PERFORM set_config('gc07.peer',peer::text,true); EXIT; END IF;
IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'GC07 did not observe competing connection blocked'; END IF;
PERFORM pg_sleep(0.1); END LOOP; PERFORM pg_sleep(1); END $$;
SELECT 'PASS: A observed B blocked' AS result,pg_backend_pid() AS connection_a,
current_setting('gc07.peer')::integer AS connection_b,current_setting('gc07.race_artifact')::jsonb AS artifact;
COMMIT;`;
    const b = `${start}SELECT pg_advisory_xact_lock(174007,${marker + 1});
DO $$ DECLARE peer integer; deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN LOOP
SELECT pid INTO peer FROM (${peer(marker)}) p; EXIT WHEN peer IS NOT NULL;
IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'GC07 no competing connection'; END IF;
PERFORM pg_sleep(0.1); END LOOP; PERFORM set_config('gc07.peer',peer::text,true); END $$;
${identity(who.userId)}
DO $$ DECLARE started timestamptz:=clock_timestamp(); rejected boolean:=false; item jsonb;
rejection_code text; rejection_message text; BEGIN
${mode === 'stale' ? `BEGIN SELECT ${bCall} INTO item;
EXCEPTION WHEN SQLSTATE 'PT409' THEN
GET STACKED DIAGNOSTICS rejection_code=RETURNED_SQLSTATE,rejection_message=MESSAGE_TEXT;
rejected:=true;
WHEN SQLSTATE '23514' THEN
-- The existing review RPC checks submitted state before revision after locking.
-- Accept only its already-returned rejection, never unrelated check violations.
IF SQLERRM IS DISTINCT FROM ${literal(returnedRfiMessage)} THEN RAISE; END IF;
GET STACKED DIAGNOSTICS rejection_code=RETURNED_SQLSTATE,rejection_message=MESSAGE_TEXT;
rejected:=true; END;
IF NOT rejected THEN RAISE EXCEPTION 'GC07 stale competing review was accepted'; END IF;
PERFORM set_config('gc07.race_rejection',jsonb_build_object('sqlstate',rejection_code,'message',rejection_message)::text,true);
PERFORM set_config('gc07.race_artifact','null',true);` : `SELECT ${bCall} INTO item;
PERFORM set_config('gc07.race_artifact',item::text,true);`}
PERFORM set_config('gc07.wait_ms',(extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END $$;
SELECT 'PASS: ${mode}' AS result,current_setting('gc07.peer')::integer AS connection_a,pg_backend_pid() AS connection_b,
current_setting('gc07.wait_ms')::numeric AS waited_ms,current_setting('gc07.race_artifact')::jsonb AS artifact${mode === 'stale' ? ",current_setting('gc07.race_rejection')::jsonb AS rejection" : ''};
COMMIT;`;
    return { a: managedRaceSql(a), b: managedRaceSql(b) };
}
export function assertRace(mode, a, b, before) {
    check(['regions', 'retry', 'stale'].includes(mode), 'unknown race');
    const receipt = r => {
        check(r?.status >= 200 && r.status < 300 && r.data?.length === 1, 'race HTTP response');
        return r.data[0].receipt;
    };
    const ar = receipt(a), br = receipt(b);
    check(ar?.result === 'PASS: A observed B blocked' && br?.result === `PASS: ${mode}`
        && Number.isInteger(ar.connection_a) && ar.connection_a > 0 && Number.isInteger(ar.connection_b) && ar.connection_b > 0
        && ar.connection_a !== ar.connection_b && ar.connection_a === br.connection_a && ar.connection_b === br.connection_b
        && Number.isFinite(Number(br.waited_ms)) && Number(br.waited_ms) >= 500, 'distinct blocked backends and wait required');
    const x = ar.artifact, y = br.artifact;
    check(x?.id && x.session_id && x.gc07_client_key && x.delegation_id === 'asian_pacific', 'race A persisted owner');
    if (mode === 'regions') check(y?.id && y.id !== x.id && y.delegation_id === 'europe'
        && y.session_id === x.session_id && y.gc07_client_key !== x.gc07_client_key, 'regional RFIs collided');
    if (mode === 'retry') check(y?.id === x.id && ['session_id','delegation_id','gc07_client_key','revision_number','workflow_state']
        .every(k => y[k] === x[k]), 'retry duplicated or changed a mutation');
    if (mode === 'stale') {
        check(br.rejection?.sqlstate === 'PT409' || br.rejection?.sqlstate === '23514'
            && br.rejection.message === returnedRfiMessage, 'expected competing review rejection');
        check(y === null && x.id === before?.id && x.session_id === before.session_id
            && x.gc07_client_key === before.gc07_client_key && x.revision_number === before.revision_number + 1
            && x.workflow_state === 'returned_to_team', 'single review mutation');
    }
    return [...new Map([x, y].filter(Boolean).map(row => [row.id, row])).values()];
}
export async function runRace(m, mode, action, send, record) {
    const queries = raceSql(m, mode, action);
    const outcomes = await concurrentPair((side, query) => send(`race-${mode}-${side}`, query), queries.a, queries.b);
    // Always settle both connections before the caller's finally/cleanup can run.
    const summary = Object.fromEntries(Object.entries(outcomes).map(([side, r]) => [side,
        r.status === 'fulfilled' ? r : { status: r.status, error: String(r.reason?.message || r.reason) }]));
    await record(`race ${mode} responses`, { identityMode: 'simulated JWT using hosted user IDs; independent PostgreSQL connections', outcomes: summary });
    check(outcomes.a.status === 'fulfilled' && outcomes.b.status === 'fulfilled', 'both race transports must succeed');
    const expected = assertRace(mode, outcomes.a.value, outcomes.b.value, action);
    const verified = await send(`race-${mode}-committed`, `SELECT * FROM public.requests WHERE session_id=${literal(m.sessions[0].id)}
AND gc07_client_key IN (${expected.map(row => literal(row.gc07_client_key)).join(',')});`);
    check(verified.status >= 200 && verified.status < 300 && verified.data?.length === expected.length, 'independent committed race read');
    for (const row of expected) {
        const persisted = verified.data.find(r => r.id === row.id);
        check(persisted && row.gc07_client_key && ['session_id', 'delegation_id', 'revision_number', 'workflow_state', 'gc07_client_key']
            .every(k => persisted[k] === row[k]), 'committed state differs from concurrency receipt');
    }
    await record(`race ${mode} committed PASS`, { artifacts: verified.data });
    return verified.data;
}
