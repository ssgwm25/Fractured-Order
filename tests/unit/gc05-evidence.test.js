import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { evidencePaths, deployedURL, deploymentRun, assertDeploymentRun, assertBrowserReport, assertAssetReceipt,
    sqlEvidenceQuery, assertSqlReceipt, sha256, readOnlyRequestAllowed } from '../../scripts/gc05-evidence-contract.mjs';

const suite = readFileSync(new URL('../sql/gc05-regional-orientations-editor.sql', import.meta.url), 'utf8');
const run = '389235d8-2a4e-4257-ae04-f3d808596c3d';
const receipt = () => ({ status: 201, data: [{ cleared: '', evidence: {
    suite: 'GC05', suiteSha256: sha256(suite), assertions: 102,
    results: Array.from({ length: 102 }, (_, i) => ({ label: `assertion ${i}`, result: 'PASS' })),
    rollbackVerified: true, rollbackScope: 'fixture subtransaction',
    sessionIds: ['session-a', 'session-b', 'session-c'],
    sessionsRemaining: 0, rostersRemaining: 0, grantsRemaining: 0, seatsRemaining: 0,
    rowSecurity: 'on', database: 'postgres', databaseRole: 'postgres', serverVersion: 'PostgreSQL synthetic test',
    serverStartedAt: '2026-09-19T00:00:00Z', serverFinishedAt: '2026-09-19T00:00:01Z'
} }] });

describe('GC05 supplemental evidence contracts (no commands, network or SQL)', () => {
    it('keeps each new report outside disposable browser output and old evidence directories', () => {
        const paths = evidencePaths(run);
        expect(paths.directory).toBe(`output/release-evidence/gc05/${run}`);
        expect(relative(resolve(paths.artifacts), resolve(paths.browser))).toBe(`..${sep}browser.json`);
        expect(evidencePaths('13316abd-a82b-431f-b1d2-cd0e1add6f98').directory).not.toBe(paths.directory);
    });
    it.each(['', '../test-results', `${run}/..`])('rejects output path injection: %s', value => {
        expect(() => evidencePaths(value)).toThrow('Invalid evidence run ID');
    });
    it('executes the existing SQL assertion block unchanged inside a deliberate rollback boundary', () => {
        const query = sqlEvidenceQuery(suite);
        const originalBlock = suite.replaceAll('\r\n', '\n').match(/DO \$gc05_suite\$[\s\S]*?END \$gc05_suite\$;/)[0];
        expect(query).toContain(originalBlock);
        expect(query).toContain("EXCEPTION WHEN SQLSTATE 'Z0505'");
        expect(query.indexOf('SELECT count(*) INTO sessions_remaining')).toBeGreaterThan(query.indexOf('rolled_back := true;'));
        expect(query).toContain("to_regclass('pg_temp.gc05_sessions') IS NOT NULL");
        expect(query).toContain("set_config('gc05.evidence_receipt','',false)");
        expect(query).toContain(sha256(suite));
        expect(query).not.toMatch(/\bCOMMIT\b|DISABLE\s+ROW\s+LEVEL/i);
    });
    it('refuses a suite that has lost its rollback contract', () => {
        expect(() => sqlEvidenceQuery(suite.replace(/ROLLBACK;\s*$/, 'COMMIT;'))).toThrow();
    });
    it('requires every SQL assertion and a post-rollback receipt from the exact source', () => {
        expect(assertSqlReceipt(receipt(), sha256(suite)).assertions).toBe(102);
    });
    it.each([
        { assertions: 101 }, { results: [] }, { rollbackVerified: false }, { sessionsRemaining: 1 },
        { rostersRemaining: 1 }, { grantsRemaining: 1 }, { seatsRemaining: 1 },
        { suiteSha256: 'other-source' }, { sessionIds: ['a', 'a', 'a'] }, { serverFinishedAt: 'invalid' }, { rowSecurity: 'off' }
    ])('rejects incomplete or unverifiable SQL evidence: %j', patch => {
        const response = receipt(); Object.assign(response.data[0].evidence, patch);
        expect(() => assertSqlReceipt(response, sha256(suite))).toThrow();
    });
    it('does not treat an HTTP failure or a duplicate assertion as proof', () => {
        expect(() => assertSqlReceipt({ status: 500, data: null }, sha256(suite))).toThrow();
        const response = receipt(); response.data[0].evidence.results[1] = response.data[0].evidence.results[0];
        expect(() => assertSqlReceipt(response, sha256(suite))).toThrow();
    });
    it('accepts supported HTTPS directory bases', () => {
        expect(deployedURL('https://example.com/Fractured-Order/')).toBe('https://example.com/Fractured-Order/');
        expect(deployedURL('https://example.com/')).toBe('https://example.com/');
    });
    it.each(['http://example.com/', 'https://user:secret@example.com/', 'https://example.com/?token=x',
        'https://example.com/#route', 'https://localhost/', 'https://example.com/other/'])('rejects unsafe or unsupported target: %s', url => {
        expect(() => deployedURL(url)).toThrow();
    });
    it('binds deployment evidence to a successful Pages run and clean matching source', () => {
        const workflow = deploymentRun('https://github.com/example/Fractured-Order/actions/runs/123');
        expect(workflow.api).toBe('https://api.github.com/repos/example/Fractured-Order/actions/runs/123');
        const source = { revision: 'a'.repeat(40), status: '' };
        const data = { html_url: workflow.url, head_sha: source.revision, status: 'completed',
            conclusion: 'success', path: '.github/workflows/deploy-pages.yml' };
        expect(() => assertDeploymentRun(data, source, workflow.url)).not.toThrow();
        for (const patch of [{ head_sha: 'b'.repeat(40) }, { conclusion: 'failure' }, { path: 'another.yml' }, { html_url: 'other' }]) {
            expect(() => assertDeploymentRun({ ...data, ...patch }, source, workflow.url)).toThrow();
        }
        expect(() => assertDeploymentRun(data, { ...source, status: ' M src/main.js' }, workflow.url)).toThrow();
        expect(() => deploymentRun('https://example.com/actions/runs/123')).toThrow();
    });
    it('requires both browser cases with no skips, failures, flakiness or runner errors', () => {
        const report = { stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 0 }, errors: [] };
        expect(() => assertBrowserReport(report)).not.toThrow();
        for (const patch of [{ expected: 1 }, { skipped: 1 }, { unexpected: 1 }, { flaky: 1 }]) {
            expect(() => assertBrowserReport({ ...report, stats: { ...report.stats, ...patch } })).toThrow();
        }
        expect(() => assertBrowserReport({ ...report, errors: [{ message: 'failed' }] })).toThrow();
    });
    it('requires HTTP 200 and exact fresh-build bytes for each deployed route and asset', () => {
        const hash = sha256('fresh build');
        expect(() => assertAssetReceipt({ status: 200, sha256: hash }, hash, 'index.html')).not.toThrow();
        for (const actual of [{ status: 404, sha256: hash }, { status: 200, sha256: sha256('stale') }, {}]) {
            expect(() => assertAssetReceipt(actual, hash, 'index.html')).toThrow();
        }
    });
    it('blocks hosted backend access and all writes during deployed route checks', () => {
        expect(readOnlyRequestAllowed('https://example.com/assets/main.js', 'GET')).toBe(true);
        expect(readOnlyRequestAllowed('https://example.com/web/api', 'POST')).toBe(false);
        expect(readOnlyRequestAllowed('https://project.supabase.co/rest/v1/actions', 'GET')).toBe(false);
        expect(readOnlyRequestAllowed('https://project.supabase.co/auth/v1/signup', 'POST')).toBe(false);
    });
});
