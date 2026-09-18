// Human-run verification only. `prepare` writes files; `api` calls the chosen project.
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

const DIRECTORY = 'test-results/gc03-hosted';
const REGION = { ap: 'asian_pacific', eu: 'europe' };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const identitySql = id => `SELECT set_config('request.jwt.claim.sub', ${literal(id)}, true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', ${literal(id)}, 'role', 'authenticated')::text, true);`;

export function makeManifest(projectRef) {
    if (!/^[a-z]{20}$/.test(projectRef)) throw new Error('Use only the 20-letter project reference.');
    return {
        format: 1, projectRef, run: randomUUID(), preparedAt: new Date().toISOString(),
        roster: `green-roster-v${Date.now()}`,
        sessions: Object.fromEntries(['same', 'split', 'api', 'foreign'].map(key => [key, randomUUID()])),
        raceUsers: [randomUUID(), randomUUID()], archiveUser: randomUUID(),
        actions: { ap: randomUUID(), eu: randomUUID() },
        roots: { ap: randomUUID(), eu: randomUUID() }
    };
}

function validateManifest(m) {
    if (m.format !== 1 || !/^[a-z]{20}$/.test(m.projectRef) || !/^green-roster-v[1-9][0-9]*$/.test(m.roster)) {
        throw new Error('Invalid fixture manifest.');
    }
    for (const id of [m.run, ...Object.values(m.sessions), ...m.raceUsers, m.archiveUser,
        ...Object.values(m.actions), ...Object.values(m.roots)]) {
        if (!uuidPattern.test(id)) throw new Error('Invalid fixture UUID.');
    }
}

export function buildSqlFiles(m) {
    validateManifest(m);
    const sessionIds = Object.values(m.sessions).map(literal).join(',');
    const sessionName = key => `GC03 SECURITY TEST ${m.run} ${key}`;
    const header = `-- Human-run as postgres in SQL Editor. Run the ENTIRE file.
-- Project: ${m.projectRef}; run: ${m.run}. Synthetic evidence only.
BEGIN;
SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claims = '{}';
`;
    const matchSessions = `SELECT count(*) FROM public.sessions WHERE id IN (${sessionIds})
AND name LIKE ${literal(`GC03 SECURITY TEST ${m.run} %`)} AND session_topology_version=2
AND green_roster_version=${literal(m.roster)} AND session_code IS NULL`;
    const verifyFixtures = `DO $$ BEGIN IF (${matchSessions}) <> 4 THEN
RAISE EXCEPTION 'Fixture identity mismatch. Stop; do not use an exercise session.'; END IF; END $$;
`;
    let setup = header + `DO $$ BEGIN
IF to_regprocedure('public.green_has_capability(uuid,text)') IS NULL THEN
RAISE EXCEPTION 'GC-03 must already be installed.'; END IF;
IF EXISTS (SELECT 1 FROM public.sessions WHERE id IN (${sessionIds})) THEN
RAISE EXCEPTION 'Fixture sessions already exist. Do not rerun setup.'; END IF;
END $$;
INSERT INTO public.green_roster_approvals(version,snapshot,approved_by,approved_at)
VALUES (${literal(m.roster)}, '{"asian_pacific":[],"europe":[],"aliases":{},"source_references":["GC03 synthetic security test; not exercise approval"]}',
'GC03 synthetic security test only', now());
`;
    for (const [key, id] of Object.entries(m.sessions)) {
        setup += `INSERT INTO public.sessions(id,name,status,session_topology_version,session_code)
VALUES (${literal(id)},${literal(sessionName(key))},'active',2,NULL);
UPDATE public.sessions SET green_roster_version=a.version,
green_roster_snapshot=a.snapshot||jsonb_build_object('approved_by',a.approved_by,'approved_at',a.approved_at)
FROM public.green_roster_approvals a WHERE a.version=${literal(m.roster)} AND id=${literal(id)};
INSERT INTO public.game_state(session_id,move,phase) VALUES (${literal(id)},1,1);
`;
    }
    for (const region of ['ap', 'eu']) {
        setup += `-- Transport fixture, not a participant submission or White Cell decision.
INSERT INTO public.actions(id,session_id,team,delegation_id,move,phase,mechanism,sector,artifact_type,proposal_recipient_team,goal)
VALUES (${literal(m.actions[region])},${literal(m.sessions.api)},'green',${literal(REGION[region])},1,1,'Proposal','','proposal','blue','GC03 synthetic private transport fixture');
INSERT INTO public.communications(id,session_id,move,from_role,to_role,type,content,metadata)
VALUES (${literal(m.roots[region])},${literal(m.sessions.api)},1,'white_cell','blue','PROPOSAL_FORWARDED','GC03 synthetic thread fixture',
jsonb_build_object('source_proposal_id',${literal(m.actions[region])},'source_team','green','recipient_team','blue',
'thread_id',gen_random_uuid(),'round_number',0,'source_revision',1));
`;
    }
    setup += `COMMIT;
SELECT 'GC03 fixture setup committed' AS result, ${literal(m.run)} AS run_id;
`;
    const files = { '01-setup.sql': setup };
    for (const [mode, number] of [['same', '02'], ['split', '03']]) {
        // Two-int advisory markers are separate from GC-03's bigint locks.
        // pg_locks is live even when dashboard activity labels are unavailable.
        const markerA = (createHash('sha256').update(`${m.run}:${mode}`).digest().readUInt32BE(0) & 0x3fffffff) * 2;
        const markerB = markerA + 1;
        const peerQuery = marker => `SELECT pid FROM pg_locks WHERE locktype='advisory'
AND classid=170309::oid AND objid=${marker}::oid AND objsubid=2 AND granted
AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND pid<>pg_backend_pid()`;
        const sid = literal(m.sessions[mode]);
        const claim = (index, role) => `public.claim_session_role_seat(${sid}::uuid,${literal(role)},
'GC03 synthetic race',${literal(`gc03-${m.run}-${mode}-${index}`)},90)`;
        files[`${number}-${mode}-A.sql`] = header + verifyFixtures + `-- Race harness v2: actual lock observation, no activity-name lookup.
${identitySql(m.raceUsers[0])}
SET LOCAL ROLE authenticated;
SELECT ${claim(0, 'green_asian_pacific_scribe')};
RESET ROLE;
SELECT pg_advisory_xact_lock(170309,${markerA});
-- Wait for a distinct B backend to actually block on this claim transaction.
DO $$ DECLARE peer integer; deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN
LOOP
SELECT pid INTO peer FROM (${peerQuery(markerB)}) AS marker;
IF peer IS NOT NULL AND pg_backend_pid()=ANY(pg_blocking_pids(peer)) THEN
PERFORM set_config('gc03.peer_pid',peer::text,true);
EXIT;
END IF;
IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'GC03_NO_BLOCKED_B: no concurrent B claim observed; do not count this run as a pass'; END IF;
PERFORM pg_sleep(0.1);
END LOOP;
-- Keep the observed real block long enough for B's elapsed-time assertion.
PERFORM pg_sleep(1);
END $$;
SELECT 'PASS: A observed B blocked on its transaction' AS result, pg_backend_pid() AS connection_a,
current_setting('gc03.peer_pid')::integer AS connection_b, clock_timestamp() AS observed_at;
COMMIT;
`;
        const bRole = mode === 'same' ? 'green_asian_pacific_scribe' : 'green_europe_scribe';
        const attempt = mode === 'same' ? `BEGIN
PERFORM ${claim(1, bRole)};
EXCEPTION WHEN SQLSTATE 'P0001' THEN
IF SQLERRM <> 'The requested role is full. Please choose another seat.' THEN RAISE; END IF;
denied := true;
END;
IF NOT denied THEN RAISE EXCEPTION 'FAIL: second claim was not denied'; END IF;`
            : `PERFORM ${claim(1, bRole)};`;
        files[`${number}-${mode}-B.sql`] = header + verifyFixtures + `-- Race harness v2. Start B, then A in the other browser tab.
-- Marker reads use the owner connection; the actual claim uses authenticated.
SELECT pg_advisory_xact_lock(170309,${markerB});
DO $$ DECLARE peer integer; deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN
LOOP
SELECT pid INTO peer FROM (${peerQuery(markerA)}) AS marker;
EXIT WHEN peer IS NOT NULL;
IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'GC03_NO_CONCURRENT_A: no independent A connection observed; stop and report both outputs'; END IF;
PERFORM pg_sleep(0.1);
END LOOP;
PERFORM set_config('gc03.peer_pid',peer::text,true);
END $$;
${identitySql(m.raceUsers[1])}
SET LOCAL ROLE authenticated;
DO $$ DECLARE started timestamptz:=clock_timestamp(); denied boolean:=false; elapsed_ms numeric; BEGIN
${attempt}
elapsed_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
IF elapsed_ms < 500 THEN RAISE EXCEPTION 'MISSED CONTENTION: retry A then B; no meaningful wait observed'; END IF;
PERFORM set_config('gc03.wait_ms',elapsed_ms::text,true);
END $$;
SELECT ${literal(mode === 'same' ? 'PASS: same seat has one winner' : 'PASS: different regional seats both claimed')} AS result,
current_setting('gc03.peer_pid')::integer AS connection_a, pg_backend_pid() AS connection_b,
current_setting('gc03.wait_ms')::numeric AS waited_ms, clock_timestamp() AS observed_at;
COMMIT;
`;
    }
    files['04-verify-races.sql'] = header + verifyFixtures + `DO $$ BEGIN
IF (SELECT count(*) FROM public.session_participants WHERE session_id=${literal(m.sessions.same)})<>1
OR NOT EXISTS (SELECT 1 FROM public.session_participants sp JOIN public.participants p ON p.id=sp.participant_id
WHERE sp.session_id=${literal(m.sessions.same)} AND sp.role='green_asian_pacific_scribe'
AND sp.is_active AND sp.revoked_at IS NULL AND p.auth_user_id=${literal(m.raceUsers[0])}) THEN
RAISE EXCEPTION 'FAIL: same-seat winner state'; END IF;
IF (SELECT count(*) FROM public.session_participants WHERE session_id=${literal(m.sessions.split)})<>2
OR (SELECT count(DISTINCT delegation_id) FROM public.session_participants WHERE session_id=${literal(m.sessions.split)}
AND role IN ('green_asian_pacific_scribe','green_europe_scribe') AND is_active AND revoked_at IS NULL)<>2 THEN
RAISE EXCEPTION 'FAIL: independent regional seat state'; END IF;
END $$;
SELECT 'PASS: committed race seat counts are 1 and 2' AS result,clock_timestamp() AS observed_at;
ROLLBACK;
`;
    files['06-archive.sql'] = header + verifyFixtures + `-- One session-scoped grant at a time; never a global operator grant.
` + Object.values(m.sessions).map(id => `INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id)
VALUES (${literal(m.archiveUser)},'whitecell','whitecell_lead',${literal(id)});
${identitySql(m.archiveUser)}
SET LOCAL ROLE authenticated;
SELECT public.archive_live_demo_session(${literal(id)}::uuid);
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claims = '{}';
DELETE FROM public.operator_grants WHERE auth_user_id=${literal(m.archiveUser)} AND surface='whitecell' AND session_id=${literal(id)};
`).join('\n') + `COMMIT;
SELECT id,name,status FROM public.sessions WHERE id IN (${sessionIds}) ORDER BY name;
`;
    return files;
}

export function isAuthorizationDenial(response) {
    if (![400, 403].includes(response.status)) return false;
    if (response.data?.code === '42501') return true;
    return ['23514', 'P0001'].includes(response.data?.code)
        && /GC0[23]_|authoriz|permission|row-level security|facilitator|scribe|workflow/i.test(response.data?.message || '');
}

export function requirePublicKey(key, projectRef) {
    if (key.startsWith('sb_publishable_')) return key;
    try {
        const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
        if (payload.role === 'anon' && payload.ref === projectRef) return key;
    } catch { /* Reject unknown credentials, never fall back to a privileged key. */ }
    throw new Error('Use this project’s public anon or publishable key, never a service-role/secret key.');
}

export async function publicKey(projectRef) {
    let value = process.env.VITE_SUPABASE_ANON_KEY || '';
    if (!value) {
        try {
            const env = await readFile('.env.local', 'utf8');
            value = env.match(/^\s*VITE_SUPABASE_ANON_KEY\s*=\s*(.+?)\s*$/m)?.[1] || '';
            value = value.replace(/^(['"])(.*)\1$/, '$2');
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!value) {
        const input = createInterface({ input: process.stdin, output: process.stdout });
        try { value = await input.question('Paste the existing project’s PUBLIC anon/publishable key: '); }
        finally { input.close(); }
    }
    return requirePublicKey(value.trim(), projectRef);
}

async function runApi(m, directory) {
    validateManifest(m);
    const key = await publicKey(m.projectRef);
    const base = `https://${m.projectRef}.supabase.co`;
    const statePath = resolve(directory, 'private-auth.json');
    let state = { run: m.run, users: {} };
    try { state = JSON.parse(await readFile(statePath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (state.run !== m.run) throw new Error('Auth state belongs to a different fixture run.');
    const sourceFiles = ['scripts/gc03-hosted-check.mjs', 'data/2026-09-19_green_regional_authorization.sql',
        'supabase/functions/trigger-pli-adjudication/index.ts', 'supabase/functions/pli-report-narrative/index.ts',
        'supabase/functions/_shared/authorizeDerivedOperation.js'];
    const sourceHashes = {};
    for (const file of sourceFiles) sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
    const report = { run: m.run, projectRef: m.projectRef, sourceHashes,
        startedAt: new Date().toISOString(), checks: [], passed: false };
    const reportFile = resolve(directory, `api-results-${Date.now()}.json`);
    const saveState = () => writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
    const request = async (who, path, method = 'GET', body) => {
        const res = await fetch(`${base}${path}`, {
            method, headers: { apikey: key, Authorization: `Bearer ${state.users[who].access_token}`,
                'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)
        });
        const text = await res.text();
        let data; try { data = JSON.parse(text); } catch { data = null; }
        // Evidence contains only targeted synthetic responses, no auth headers or tokens.
        report.checks.push({ who, path, method, status: res.status, data, at: new Date().toISOString(),
            requestId: res.headers.get('sb-request-id') || res.headers.get('x-request-id') });
        return { status: res.status, data };
    };
    const assert = (value, label) => { if (!value) throw new Error(`FAIL: ${label}; see ${reportFile}`); };
    const success = (r, label) => assert(r.status >= 200 && r.status < 300, label);
    const empty = (r, label) => { success(r, label); assert(Array.isArray(r.data) && r.data.length === 0, label); };
    const denied = (r, label) => assert(isAuthorizationDenial(r), label);
    const unchanged = (r, label) => { if (isAuthorizationDenial(r)) return; empty(r, label); };
    const rpc = (who, name, body) => request(who, `/rest/v1/rpc/${name}`, 'POST', body);
    const sid = m.sessions.api;
    const claim = (who, sessionId, role) => rpc(who, 'claim_session_role_seat', {
        requested_session_id: sessionId, requested_role: role, requested_name: `GC03 TEST ${who}`,
        requested_client_id: `gc03-${m.run}-${who}`, requested_timeout_seconds: 90
    });
    const roles = { apS: 'green_asian_pacific_scribe', apF: 'green_asian_pacific_facilitator',
        euS: 'green_europe_scribe', euF: 'green_europe_facilitator', outsider: 'green_asian_pacific_scribe' };
    try {
        // Existing project dependency; no new packages, backend credentials or auth bypass.
        const { createClient } = await import('@supabase/supabase-js');
        for (const who of Object.keys(roles)) {
            const client = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
            const saved = state.users[who];
            const result = saved ? await client.auth.refreshSession({ refresh_token: saved.refresh_token })
                : await client.auth.signInAnonymously({ options: { data: { gc03_test_run: m.run } } });
            if (result.error || !result.data?.session) {
                throw new Error(`Auth failed for ${who}: ${result.error?.message || 'no session'}. Stop; do not disable CAPTCHA or rate limits.`);
            }
            state.users[who] = { access_token: result.data.session.access_token,
                refresh_token: result.data.session.refresh_token, id: result.data.user.id };
            await saveState();
        }
        assert(new Set(Object.values(state.users).map(u => u.id)).size === 5, 'five distinct authenticated identities');
        const seats = {};
        for (const [who, role] of Object.entries(roles)) {
            const r = await claim(who, who === 'outsider' ? m.sessions.foreign : sid, role);
            success(r, `claim ${who}`); seats[who] = r.data;
        }
        const sessions = await request('apS', `/rest/v1/sessions?id=eq.${sid}&select=id,name,status,green_roster_version`);
        success(sessions, 'fixture identity read');
        assert(sessions.data?.length === 1 && sessions.data[0].name === `GC03 SECURITY TEST ${m.run} api`
            && sessions.data[0].green_roster_version === m.roster && sessions.data[0].status === 'active', 'fixture identity');
        for (const region of ['ap', 'eu']) {
            const scribe = `${region}S`, facilitator = `${region}F`, other = region === 'ap' ? 'eu' : 'ap';
            // Renew all API leases before each matrix half; failures are not silently rejoined.
            for (const who of Object.keys(roles)) {
                success(await rpc(who, 'heartbeat_session_role_seat', {
                    requested_session_id: who === 'outsider' ? m.sessions.foreign : sid,
                    requested_session_participant_id: seats[who].id
                }), `heartbeat ${who}`);
            }
            const actionId = m.actions[region], otherId = m.actions[other];
            for (const who of [scribe, facilitator]) {
                const own = await request(who, `/rest/v1/actions?id=eq.${actionId}&select=id,goal,delegation_id`);
                success(own, 'own action read'); assert(own.data?.length === 1, `${who} sees own action`);
                for (const [table, id] of [['actions', otherId], ['communications', m.roots[other]]]) {
                    const path = `/rest/v1/${table}?id=eq.${id}`;
                    empty(await request(who, `${path}&select=id`), `${who} cross-region ${table} read`);
                    unchanged(await request(who, path, 'PATCH', table === 'actions' ? { goal: 'GC03 forbidden edit' } : { content: 'GC03 forbidden edit' }), `${who} cross-region ${table} update`);
                    unchanged(await request(who, path, 'DELETE'), `${who} cross-region ${table} delete`);
                }
                empty(await request(who, `/rest/v1/action_logs?action_id=eq.${otherId}&select=id`), `${who} cross-region derived action log`);
                denied(await rpc(who, 'operator_review_artifact', { requested_artifact_kind: 'action', requested_artifact_id: actionId,
                    requested_review_decision: 'complete', requested_team: 'green', requested_expected_revision: 1 }), `${who} unauthorized review`);
            }
            empty(await request('outsider', `/rest/v1/actions?id=eq.${actionId}&select=id`), 'cross-session action read');
            const action = { session_id: sid, team: 'green', delegation_id: REGION[region], move: 1, phase: 1,
                mechanism: 'Proposal', sector: '', artifact_type: 'proposal', proposal_recipient_team: 'blue', goal: 'GC03 synthetic authored draft' };
            const created = await request(scribe, '/rest/v1/actions', 'POST', action);
            success(created, 'authorized draft creation'); assert(created.data?.length === 1, 'created draft representation');
            const createdId = created.data[0].id;
            denied(await request(scribe, '/rest/v1/actions', 'POST', { ...action, delegation_id: REGION[other] }), 'spoofed delegation');
            denied(await request(scribe, '/rest/v1/actions', 'POST', { ...action, session_id: m.sessions.foreign }), 'cross-session write');
            unchanged(await request(scribe, `/rest/v1/actions?id=eq.${createdId}`, 'PATCH', { status: 'submitted' }), 'unauthorized scribe submission');
            const retained = await request(scribe, `/rest/v1/actions?id=eq.${createdId}&select=status`);
            success(retained, 'submission postcondition'); assert(retained.data?.[0]?.status === 'draft', 'unauthorized submission left draft intact');
            const edit = await request(scribe, `/rest/v1/actions?id=eq.${createdId}`, 'PATCH', { goal: 'GC03 authorized edit' });
            success(edit, 'own edit'); assert(edit.data?.[0]?.goal === 'GC03 authorized edit', 'own edit applied');
            const rfi = await request(facilitator, '/rest/v1/requests', 'POST', { session_id: sid, team: 'green',
                delegation_id: REGION[region], move: 1, phase: 1, query: 'GC03 synthetic private RFI' });
            success(rfi, 'own RFI creation'); assert(rfi.data?.length === 1, 'RFI representation');
            for (const who of [`${other}S`, `${other}F`, 'outsider']) {
                const path = `/rest/v1/requests?id=eq.${rfi.data[0].id}`;
                empty(await request(who, `${path}&select=id`), 'RFI cross-scope read');
                unchanged(await request(who, path, 'PATCH', { query: 'GC03 forbidden edit' }), 'RFI cross-scope update');
                unchanged(await request(who, path, 'DELETE'), 'RFI cross-scope delete');
            }
            const message = { session_id: sid, move: 1, from_role: roles[facilitator], to_role: 'white_cell',
                type: 'direct', content: 'GC03 synthetic private message', metadata: { source_team: 'green' } };
            const sent = await request(facilitator, '/rest/v1/communications', 'POST', message);
            success(sent, 'own direct message'); assert(sent.data?.length === 1, 'message representation');
            for (const who of [`${other}S`, `${other}F`, 'outsider']) {
                empty(await request(who, `/rest/v1/communications?id=eq.${sent.data[0].id}&select=id`), 'private direct message isolation');
            }
            denied(await request(facilitator, '/rest/v1/communications', 'POST', { ...message, from_role: roles[`${other}F`] }), 'forged sender');
            denied(await rpc(facilitator, 'append_proposal_thread_message', { requested_parent_message_id: m.roots[other],
                requested_content: 'GC03 forbidden thread write', requested_message_type: 'negotiation_message',
                requested_client_message_id: `gc03-${m.run}-${region}-spoof` }), 'cross-region thread RPC');
            // Confirm the target still exists, so empty attacker reads cannot pass on nonexistent rows.
            const ownRoot = await request(facilitator, `/rest/v1/communications?id=eq.${m.roots[region]}&select=id`);
            success(ownRoot, 'own thread read'); assert(ownRoot.data?.length === 1, 'own thread exists');
        }
        for (const who of ['apF', 'euF', 'outsider']) {
            for (const [name, body] of [
                ['trigger-pli-adjudication', { sessionId: sid, dryRun: true }],
                ['pli-report-narrative', { sessionId: sid, scope: 'simulation', factPack: { gc03Synthetic: true } }]
            ]) {
                success(await rpc(who, 'heartbeat_session_role_seat', {
                    requested_session_id: who === 'outsider' ? m.sessions.foreign : sid,
                    requested_session_participant_id: seats[who].id
                }), `${who} has a current seat before Edge check`);
                const r = await request(who, `/functions/v1/${name}`, 'POST', body);
                assert(r.status === 403 && r.data?.error === 'Session operation is not authorized', `${name} regional/cross-session denial`);
            }
        }
        report.passed = true;
        console.log('PASS: hosted API matrix and Edge denial responses. This is not the overall GC-03 gate.');
    } catch (error) {
        report.failure = error.message;
        throw error;
    } finally {
        report.finishedAt = new Date().toISOString();
        await writeFile(reportFile, JSON.stringify(report, null, 2));
        console.log(`Evidence: ${reportFile}`);
    }
}

async function main() {
    const [command, projectRef] = process.argv.slice(2);
    const directory = resolve(DIRECTORY);
    if (command === 'prepare') {
        const m = makeManifest(projectRef);
        try { await access(resolve(directory, 'manifest.json')); throw new Error('A prepared run already exists. Preserve its evidence; do not overwrite it.'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        await mkdir(directory, { recursive: true });
        for (const [name, content] of Object.entries(buildSqlFiles(m))) await writeFile(resolve(directory, name), content, { flag: 'wx' });
        await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(m, null, 2), { flag: 'wx' });
        console.log(`Prepared local files only: ${directory}\nNext: run 01-setup.sql in your existing project's SQL Editor.`);
    } else if (command === 'refresh-races') {
        const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
        const files = buildSqlFiles(manifest);
        const backup = resolve(directory, `race-backup-${Date.now()}`);
        await mkdir(backup);
        for (const [name, content] of Object.entries(files)) {
            if (!/^(02|03)-/.test(name)) continue;
            const target = resolve(directory, name);
            await writeFile(resolve(backup, name), await readFile(target), { flag: 'wx' });
            await writeFile(target, content);
        }
        console.log(`Refreshed four local race files; old copies: ${backup}\nNo database calls. Keep the existing manifest and fixture setup. Re-paste BOTH A and B.`);
    } else if (command === 'api') {
        await runApi(JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8')), directory);
    } else throw new Error('Usage: node scripts/gc03-hosted-check.mjs prepare PROJECT_REF | refresh-races | api');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
