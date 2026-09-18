import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { appUrl, LOCAL_APP_BASE_URL, manifest, setupSql, cleanupSql, fixtureGuard, ROLES, MANUAL_CHECKS,
    AUTOMATED_CHECKS, manualComplete, automatedComplete, redact } from '../../scripts/gc04-live-contract.mjs';

const make = () => manifest('abcdefghijklmnopqrst', 'https://example.test/Fractured-Order/', randomUUID());
const at = '2026-09-18T12:00:00Z'; // Synthetic test data, not evidence of a live run.

describe('GC04 live verification boundaries', () => {
    it('redacts known credentials and unexpected token echoes from nested evidence', () => {
        const result = redact({ failure: 'sbp_synthetic-token eyJfake.payload.signature',
            nested: { refresh: 'synthetic-refresh', status: 403 } }, ['synthetic-refresh']);
        expect(result).toEqual({ failure: '[REDACTED_SECRET] [REDACTED_JWT]',
            nested: { refresh: '[REDACTED]', status: 403 } });
    });
    it('requires an explicit hosted base path and rejects credentials or URL overrides', () => {
        expect(appUrl('https://example.test/Fractured-Order/')).toBe('https://example.test/Fractured-Order/');
        for (const url of ['http://example.test/Fractured-Order/', 'https://example.test/',
            'https://user:secret@example.test/Fractured-Order/', 'https://example.test/Fractured-Order/?mode=observer',
            'https://example.test/Fractured-Order/#foo', 'https://example.test/%2e%2e/']) {
            expect(() => appUrl(url)).toThrow();
        }
    });
    it('generates fresh fixture IDs without adding represented countries or exercise decisions', () => {
        const first = make(), second = make(), sql = setupSql(first);
        expect(first.sessionId).not.toBe(second.sessionId);
        expect(first.actions.asian_pacific).not.toBe(first.actions.europe);
        expect(sql).toContain('"asian_pacific":[],"europe":[]');
        expect(sql).toContain('not exercise approval');
        expect(sql).toContain("'whitecell','whitecell_lead'");
        expect(sql).not.toMatch(/INSERT INTO public\.(?:session_participants|communications)|UPDATE public\.actions|pli_|review_artifact/i);
    });
    it('allows local HTTP only with explicit loopback mode and a base path', () => {
        expect(() => appUrl(LOCAL_APP_BASE_URL)).toThrow();
        expect(appUrl(LOCAL_APP_BASE_URL, { local: true })).toBe(LOCAL_APP_BASE_URL);
        for (const host of ['localhost', '[::1]']) {
            const url = `http://${host}:4174/Fractured-Order/`;
            expect(appUrl(url, { local: true })).toBe(url);
        }
        for (const url of ['http://example.test/Fractured-Order/',
            'http://127.0.0.1.evil.test/Fractured-Order/', 'https://example.test/Fractured-Order/',
            'http://127.0.0.1:4174/', 'http://user:secret@127.0.0.1:4174/Fractured-Order/',
            `${LOCAL_APP_BASE_URL}?delegation=europe`, `${LOCAL_APP_BASE_URL}#override`]) {
            expect(() => appUrl(url, { local: true })).toThrow();
        }
    });
    it('labels local fixtures while preserving guarded cleanup for historical hosted manifests', () => {
        const local = manifest('abcdefghijklmnopqrst', LOCAL_APP_BASE_URL, randomUUID(), { local: true });
        expect(local.target).toBe('local');
        expect(setupSql(local)).toContain(local.sessionId);
        expect(cleanupSql(local)).toContain(fixtureGuard(local));
        expect(() => cleanupSql({ ...local, target: 'hosted' })).toThrow();
        expect(() => cleanupSql({ ...local, target: 'unknown' })).toThrow();
        const hosted = make();
        expect(hosted.target).toBe('hosted');
        delete hosted.target;
        expect(cleanupSql(hosted)).toContain(fixtureGuard(hosted));
    });
    it('contains archival to the exact fixture and preserves its evidence', () => {
        const m = make(), sql = cleanupSql(m);
        expect(sql).toContain(fixtureGuard(m));
        expect(sql.indexOf('GC04 fixture mismatch')).toBeLessThan(sql.indexOf('archive_live_demo_session'));
        expect(sql).toContain(`session_id='${m.sessionId}'`);
        expect(sql).not.toMatch(/DELETE FROM public\.(?:sessions|actions|session_participants|participants|green_roster_approvals)/);
        expect(() => cleanupSql({ ...m, name: 'Existing exercise' })).toThrow();
        expect(() => setupSql({ ...m, operatorId: "';drop table sessions;--" })).toThrow();
    });
    it('never substitutes automation for recorded screen-reader observations', () => {
        const rows = ROLES.flatMap(({ role }) => MANUAL_CHECKS.map(step => ({ role, step, status: 'pass', observation: 'Synthetic observation', at })));
        expect(manualComplete(rows)).toBe(true);
        expect(manualComplete([])).toBe(false);
        expect(manualComplete(rows.slice(1))).toBe(false);
        expect(manualComplete([...rows, rows[0]])).toBe(false);
        expect(manualComplete(rows.map((r, i) => i ? r : { ...r, observation: '' }))).toBe(false);
        expect(manualComplete(rows.map((r, i) => i ? r : { ...r, status: 'fail' }))).toBe(false);
    });
    it('requires every automated check for each of the four roles, without duplicates', () => {
        const rows = ROLES.flatMap(({ role }) => AUTOMATED_CHECKS.map(label => ({ role, label, at })));
        expect(automatedComplete(rows)).toBe(true);
        expect(automatedComplete(rows.slice(1))).toBe(false);
        expect(automatedComplete([rows[1], ...rows.slice(1)])).toBe(false);
        expect(automatedComplete(rows.map((r, i) => i ? r : { ...r, role: 'green_notetaker' }))).toBe(false);
    });
});
