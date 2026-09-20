import { begin, guard, identity, literal, check, validate, writeArgs } from './gc06-live-contract.mjs';
import { managedRaceSql, concurrentPair } from './gc03-race-runner.mjs';

function call(args) {
    return `public.write_regional_proposal(${literal(args.requested_session_id)}::uuid,${literal(args.requested_delegation_id)},
${args.requested_action_id ? `${literal(args.requested_action_id)}::uuid` : 'NULL'},${args.requested_expected_revision ?? 'NULL'},
${args.requested_expected_row_version ?? 'NULL'},${literal(args.requested_operation)},${literal(JSON.stringify(args.requested_payload))}::jsonb,${literal(args.requested_client_key)})`;
}
export function raceSql(m, mode, action) {
    validate(m); check(['regions', 'retry', 'stale'].includes(mode), 'unknown race');
    const s = m.sessions[0], find = role => s.actors.find(a => a.role === role);
    const aActor = find(mode === 'stale' ? 'green_shared_facilitator' : 'green_asian_pacific_scribe');
    const bActor = mode === 'regions' ? find('green_europe_scribe') : aActor;
    if (mode === 'stale') check(action?.session_id === s.id && action.delegation_id === 'asian_pacific'
        && action.workflow_state === 'forwarded_to_facilitator' && Number.isSafeInteger(action.row_version)
        && Number.isSafeInteger(action.revision_number), 'stale race needs a forwarded fixture proposal');
    const aArgs = writeArgs(s, 'asian_pacific', mode === 'stale' ? 'submit' : 'save', action, `race-${mode}`);
    const bArgs = { ...aArgs, ...(mode === 'regions' ? writeArgs(s, 'europe', 'save', null, `race-${mode}`) : {}) };
    const marker = parseInt(m.run.replaceAll('-', '').slice(0, 7), 16) + ['regions', 'retry', 'stale'].indexOf(mode) * 2;
    const peer = n => `SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=174006::oid AND objid=${n}::oid
AND objsubid=2 AND granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND pid<>pg_backend_pid()`;
    const start = `${begin}\n${guard(m)}\n`;
    const a = `${start}${identity(aActor.userId)}
SELECT set_config('gc06.race_artifact',to_jsonb(p)::text,true) FROM ${call(aArgs)} p;
RESET ROLE;
SELECT pg_advisory_xact_lock(174006,${marker});
DO $$ DECLARE peer integer; deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN LOOP
SELECT pid INTO peer FROM (${peer(marker + 1)}) p;
IF peer IS NOT NULL AND pg_backend_pid()=ANY(pg_blocking_pids(peer)) THEN
PERFORM set_config('gc06.peer',peer::text,true); EXIT; END IF;
IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'GC06 did not observe competing connection blocked'; END IF;
PERFORM pg_sleep(0.1); END LOOP; PERFORM pg_sleep(1); END $$;
SELECT 'PASS: A observed B blocked' AS result,pg_backend_pid() AS connection_a,
current_setting('gc06.peer')::integer AS connection_b,current_setting('gc06.race_artifact')::jsonb AS artifact;
COMMIT;`;
    const b = `${start}SELECT pg_advisory_xact_lock(174006,${marker + 1});
DO $$ DECLARE peer integer; deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN LOOP
SELECT pid INTO peer FROM (${peer(marker)}) p; EXIT WHEN peer IS NOT NULL;
IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'GC06 no competing connection'; END IF;
PERFORM pg_sleep(0.1); END LOOP; PERFORM set_config('gc06.peer',peer::text,true); END $$;
${identity(bActor.userId)}
DO $$ DECLARE started timestamptz:=clock_timestamp(); rejected boolean:=false; item jsonb; BEGIN
${mode === 'stale' ? `BEGIN SELECT to_jsonb(p) INTO item FROM ${call(bArgs)} p;
EXCEPTION WHEN SQLSTATE 'PT409' THEN rejected:=true; END;
IF NOT rejected THEN RAISE EXCEPTION 'GC06 stale competing submission was accepted'; END IF;
PERFORM set_config('gc06.race_artifact','null',true);` : `SELECT to_jsonb(p) INTO item FROM ${call(bArgs)} p;
PERFORM set_config('gc06.race_artifact',item::text,true);`}
PERFORM set_config('gc06.wait_ms',(extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END $$;
SELECT 'PASS: ${mode}' AS result,current_setting('gc06.peer')::integer AS connection_a,pg_backend_pid() AS connection_b,
current_setting('gc06.wait_ms')::numeric AS waited_ms,current_setting('gc06.race_artifact')::jsonb AS artifact;
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
    check(x?.id && x.delegation_id === 'asian_pacific', 'race A persisted owner');
    if (mode === 'regions') check(y?.id !== x.id && y?.delegation_id === 'europe' && y.session_id === x.session_id, 'regional proposals collided');
    if (mode === 'retry') check(y?.id === x.id && y.row_version === x.row_version, 'retry duplicated a mutation');
    if (mode === 'stale') check(y === null && x.id === before?.id && x.revision_number === before.revision_number
        && x.row_version === before.row_version + 1 && x.workflow_state === 'submitted_to_white_cell', 'single submission mutation');
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
    const verified = await send(`race-${mode}-committed`, `SELECT * FROM public.actions WHERE session_id=${literal(m.sessions[0].id)}
AND idempotency_key IN (${expected.map(row => literal(row.idempotency_key)).join(',')});`);
    check(verified.status >= 200 && verified.status < 300 && verified.data?.length === expected.length, 'independent committed race read');
    for (const row of expected) {
        const persisted = verified.data.find(r => r.id === row.id);
        check(persisted && row.idempotency_key && ['session_id', 'delegation_id', 'revision_number', 'row_version', 'workflow_state', 'idempotency_key']
            .every(k => persisted[k] === row[k]), 'committed state differs from concurrency receipt');
    }
    await record(`race ${mode} committed PASS`, { artifacts: verified.data });
    return verified.data;
}
