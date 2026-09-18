// Human-run operator tool. No browser code, deployment or new database objects.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { buildSqlFiles } from './gc03-hosted-check.mjs';

// Preserve the final receipt across COMMIT, then clear the temporary session GUC.
// The Management API can return only the last statement's rows for a SQL batch.
export function managedRaceSql(sql) {
    const match = sql.match(/SELECT ('PASS:[\s\S]+);\s*COMMIT;\s*$/);
    if (!match) throw new Error('Unexpected race SQL shape; refusing to submit it.');
    const prefix = sql.slice(0, match.index);
    return `${prefix}SELECT set_config('gc03.runner_receipt', row_to_json(receipt)::text, false)
FROM (SELECT ${match[1]}) AS receipt;
COMMIT;
WITH receipt AS MATERIALIZED (
SELECT current_setting('gc03.runner_receipt')::jsonb AS receipt
)
SELECT receipt, set_config('gc03.runner_receipt','',false) AS cleared FROM receipt;
`;
}

export async function concurrentPair(send, sqlA, sqlB) {
    // Start both before awaiting either; always retain BOTH outcomes on failure.
    const pendingB = Promise.resolve().then(() => send('B', sqlB));
    const pendingA = Promise.resolve().then(() => send('A', sqlA));
    const [b, a] = await Promise.allSettled([pendingB, pendingA]);
    return { a, b };
}

export function assertRaceEvidence(mode, a, b) {
    const row = response => {
        if (!Number.isInteger(response?.status) || response.status < 200 || response.status >= 300 || !Array.isArray(response?.data)
            || response.data.length !== 1) throw new Error('Missing successful race response.');
        return response.data[0]?.receipt;
    };
    const ar = row(a), br = row(b);
    const expected = mode === 'same' ? 'PASS: same seat has one winner' : 'PASS: different regional seats both claimed';
    if (!['same', 'split'].includes(mode) || ar?.result !== 'PASS: A observed B blocked on its transaction'
        || br?.result !== expected || !Number.isInteger(ar.connection_a) || !Number.isInteger(ar.connection_b)
        || ar.connection_a <= 0 || ar.connection_b <= 0 || ar.connection_a === ar.connection_b
        || ar.connection_a !== br.connection_a || ar.connection_b !== br.connection_b
        || !Number.isFinite(Number(br.waited_ms)) || Number(br.waited_ms) < 500) {
        throw new Error('Race receipts do not prove distinct, matching, contending connections.');
    }
}

export function redact(value, token) {
    return JSON.parse(JSON.stringify(value).replaceAll(token, '[REDACTED]'));
}

export async function promptToken() {
    if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
    if (!process.stdin.isTTY) throw new Error('Run in an interactive terminal to enter the personal access token.');
    process.stdout.write('Paste Supabase PERSONAL ACCESS TOKEN (hidden; Enter to submit): ');
    const silent = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const input = createInterface({ input: process.stdin, output: silent, terminal: true });
    const abort = new AbortController();
    input.on('SIGINT', () => abort.abort());
    try { return (await input.question('', { signal: abort.signal })).trim(); }
    finally { input.close(); process.stdout.write('\n'); }
}

async function main() {
    const directory = resolve('test-results/gc03-hosted');
    const m = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
    const files = buildSqlFiles(m); // Validates fixture identifiers; does not execute setup.
    console.log(`GC03 races only. Existing project: ${m.projectRef}; fixture run: ${m.run}`);
    console.log('Stop running A/B in the dashboard. This command sends both requests automatically.');
    const token = await promptToken();
    if (!/^sbp_[A-Za-z0-9_-]+$/.test(token)) throw new Error('Expected a Supabase personal access token beginning sbp_. Do not use an anon/service-role key.');
    const reportFile = resolve(directory, `race-results-${Date.now()}.json`);
    const report = { run: m.run, projectRef: m.projectRef, startedAt: new Date().toISOString(),
        runnerSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
        requests: [], passed: false };
    const send = async (label, query) => {
        const record = { label, startedAt: new Date().toISOString(), sqlSha256: createHash('sha256').update(query).digest('hex') };
        report.requests.push(record);
        try {
            const response = await fetch(`https://api.supabase.com/v1/projects/${m.projectRef}/database/query`, {
                method: 'POST', redirect: 'error',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, read_only: false }), signal: AbortSignal.timeout(45000)
            });
            record.status = response.status;
            const text = await response.text();
            try { record.data = JSON.parse(text); } catch { record.data = { unparsedResponse: text }; }
            record.requestId = response.headers.get('sb-request-id') || response.headers.get('x-request-id');
            return record;
        } catch (error) {
            record.error = error.message;
            throw error;
        } finally { record.finishedAt = new Date().toISOString(); }
    };
    try {
        for (const [mode, prefix] of [['same', '02'], ['split', '03']]) {
            console.log(`Running ${mode === 'same' ? 'same-seat' : 'different-region'} race...`);
            const sqlA = managedRaceSql(files[`${prefix}-${mode}-A.sql`]);
            const sqlB = managedRaceSql(files[`${prefix}-${mode}-B.sql`]);
            // Save the exact submitted SQL, so source changes cannot rewrite run evidence.
            await writeFile(`${reportFile}.${mode}-A.sql`, sqlA, { flag: 'wx' });
            await writeFile(`${reportFile}.${mode}-B.sql`, sqlB, { flag: 'wx' });
            const outcomes = await concurrentPair((side, sql) => send(`${mode}-${side}`, sql), sqlA, sqlB);
            if (outcomes.a.status !== 'fulfilled' || outcomes.b.status !== 'fulfilled') {
                throw new Error('A race request failed or timed out. Both outcomes are in the report.');
            }
            assertRaceEvidence(mode, outcomes.a.value, outcomes.b.value);
            console.log(`PASS: ${mode} race; matching distinct backends and observed lock contention.`);
        }
        // Independent request verifies the rows actually committed, not only the receipts.
        const verifySql = files['04-verify-races.sql']
            + "\nSELECT 'PASS: committed race seat counts are 1 and 2' AS result;\n";
        await writeFile(`${reportFile}.verify.sql`, verifySql, { flag: 'wx' });
        const verified = await send('committed-counts', verifySql);
        if (verified.status < 200 || verified.status >= 300 || !Array.isArray(verified.data)
            || verified.data.length !== 1 || verified.data[0].result !== 'PASS: committed race seat counts are 1 and 2') {
            throw new Error('Committed seat-count verification failed.');
        }
        report.passed = true;
        console.log('PASS: both two-connection races and committed counts. API isolation remains a separate check.');
    } catch (error) {
        report.failure = error.message;
        throw new Error(String(error.message).replaceAll(token, '[REDACTED]'));
    } finally {
        report.finishedAt = new Date().toISOString();
        await writeFile(reportFile, JSON.stringify(redact(report, token), null, 2));
        console.log(`Evidence: ${reportFile}`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
