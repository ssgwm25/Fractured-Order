// Human-run GC04A foundation contention check. No execution on import.
import { check, fixtureGuard, validateManifest } from './gc04-live-contract.mjs';
import { managedRaceSql, concurrentPair, assertRaceEvidence } from './gc03-race-runner.mjs';

export function raceSql(m) {
    validateManifest(m);
    check(m.version === 2, 'shared race requires a shared manifest');
    const markerA = Number.parseInt(m.run.replaceAll('-', '').slice(0, 7), 16);
    const markerB = markerA + 1;
    const header = `BEGIN;
SET LOCAL statement_timeout='35s'; SET LOCAL lock_timeout='25s';
RESET ROLE; SET LOCAL request.jwt.claim.sub=''; SET LOCAL request.jwt.claims='{}';
${fixtureGuard(m)}
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.session_participants WHERE session_id='${m.raceSessionId}')
THEN RAISE EXCEPTION 'GC04A race fixture already used'; END IF; END $$;
`;
    const identity = user => `SELECT set_config('request.jwt.claim.sub','${user}',true);
SELECT set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;`;
    const claim = index => `public.claim_session_role_seat('${m.raceSessionId}'::uuid,
'green_shared_facilitator','GC04A synthetic contention','gc04a-race-${m.run}-${index}',90)`;
    const peer = marker => `SELECT pid FROM pg_locks WHERE locktype='advisory'
AND classid=174004::oid AND objid=${marker}::oid AND objsubid=2 AND granted
AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND pid<>pg_backend_pid()`;
    const a = header + `${identity(m.raceUsers[0])}
SELECT ${claim(0)};
RESET ROLE;
SELECT pg_advisory_xact_lock(174004,${markerA});
DO $$ DECLARE peer integer; deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN
LOOP
SELECT pid INTO peer FROM (${peer(markerB)}) AS marker;
IF peer IS NOT NULL AND pg_backend_pid()=ANY(pg_blocking_pids(peer)) THEN
PERFORM set_config('gc03.peer_pid',peer::text,true); EXIT; END IF;
IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'GC04A no contending B connection observed'; END IF;
PERFORM pg_sleep(0.1);
END LOOP;
PERFORM pg_sleep(1);
END $$;
SELECT 'PASS: A observed B blocked on its transaction' AS result, pg_backend_pid() AS connection_a,
current_setting('gc03.peer_pid')::integer AS connection_b, clock_timestamp() AS observed_at;
COMMIT;
`;
    const b = header + `SELECT pg_advisory_xact_lock(174004,${markerB});
DO $$ DECLARE peer integer; deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN
LOOP
SELECT pid INTO peer FROM (${peer(markerA)}) AS marker;
EXIT WHEN peer IS NOT NULL;
IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'GC04A no independent A connection observed'; END IF;
PERFORM pg_sleep(0.1);
END LOOP;
PERFORM set_config('gc03.peer_pid',peer::text,true);
END $$;
${identity(m.raceUsers[1])}
DO $$ DECLARE started timestamptz:=clock_timestamp(); denied boolean:=false; elapsed_ms numeric; BEGIN
BEGIN
PERFORM ${claim(1)};
EXCEPTION WHEN SQLSTATE 'P0001' THEN
IF SQLERRM <> 'The requested role is full. Please choose another seat.' THEN RAISE; END IF;
denied:=true;
END;
IF NOT denied THEN RAISE EXCEPTION 'GC04A second shared claim was not denied'; END IF;
elapsed_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
IF elapsed_ms<500 THEN RAISE EXCEPTION 'GC04A no meaningful contention wait'; END IF;
PERFORM set_config('gc03.wait_ms',elapsed_ms::text,true);
END $$;
SELECT 'PASS: same seat has one winner' AS result,
current_setting('gc03.peer_pid')::integer AS connection_a, pg_backend_pid() AS connection_b,
current_setting('gc03.wait_ms')::numeric AS waited_ms, clock_timestamp() AS observed_at;
COMMIT;
`;
    const verify = `BEGIN;
SET LOCAL statement_timeout='15s'; RESET ROLE;
SET LOCAL request.jwt.claim.sub=''; SET LOCAL request.jwt.claims='{}';
${fixtureGuard(m)}
DO $$ BEGIN
IF (SELECT count(*) FROM public.session_participants WHERE session_id='${m.raceSessionId}')<>1
OR NOT EXISTS(SELECT 1 FROM public.session_participants sp JOIN public.participants p ON p.id=sp.participant_id
WHERE sp.session_id='${m.raceSessionId}' AND sp.role='green_shared_facilitator' AND sp.delegation_id IS NULL
AND sp.is_active AND sp.revoked_at IS NULL AND p.auth_user_id='${m.raceUsers[0]}')
THEN RAISE EXCEPTION 'GC04A committed shared winner mismatch'; END IF;
END $$;
COMMIT;
SELECT 'GC04A committed shared seat count is one' AS result;`;
    return { a: managedRaceSql(a), b: managedRaceSql(b), verify };
}

export async function verifySharedRace(m, send, report) {
    const sql = raceSql(m);
    report.race = { stage: m.stage, identityMode: 'simulated JWT; actual PostgreSQL connections', passed: false };
    const outcomes = await concurrentPair((side, query) => send(`race-${side}`, query), sql.a, sql.b);
    // Both requests settle before archival, including timeouts/failures.
    report.race.outcomes = Object.fromEntries(Object.entries(outcomes).map(([side, outcome]) => [side,
        outcome.status === 'fulfilled' ? { status: outcome.status, response: outcome.value }
            : { status: outcome.status, error: String(outcome.reason?.message || outcome.reason) }]));
    check(outcomes.a.status === 'fulfilled' && outcomes.b.status === 'fulfilled', 'both race requests must complete; inspect receipts');
    assertRaceEvidence('same', outcomes.a.value, outcomes.b.value);
    const verified = await send('race-committed-count', sql.verify);
    check(verified.status >= 200 && verified.status < 300 && verified.data?.length === 1
        && verified.data[0].result === 'GC04A committed shared seat count is one', 'committed shared seat postcondition');
    report.race.committed = verified;
    report.race.passed = true;
}
