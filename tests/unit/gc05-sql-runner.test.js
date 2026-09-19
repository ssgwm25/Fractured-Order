import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../sql/gc05-regional-orientations-editor.sql', import.meta.url), 'utf8');
const executable = source.replace(/--[^\n]*/g, '');
const block = executable.match(/DO \$gc05_suite\$([\s\S]*?)\$gc05_suite\$;/);

// Harness structure only. These do not execute SQL or establish RLS evidence.
describe('GC05 SQL Editor harness containment and diagnostics', () => {
    it('creates and consumes all temporary fixtures within one server-side block', () => {
        expect(block).not.toBeNull();
        for (const name of ['gc05_sessions', 'gc05_actors', 'gc05_records', 'gc05_results']) {
            expect(block[1]).toContain(`CREATE TEMP TABLE ${name}`);
            expect(block[1]).toContain(`pg_temp.${name}`);
            expect(executable.replace(block[0], '')).not.toContain(name);
        }
        expect(block[1]).toContain('SET LOCAL ROLE authenticated;');
        expect(block[1]).toContain('public.handoff_regional_orientation(');
        expect(block[1]).toContain('public.submit_regional_orientation(');
        expect(block[1]).toContain('public.operator_review_artifact(');
        expect(block[1].match(/\bDO \$\$/g)).toHaveLength(6);
        expect(block[1]).not.toMatch(/\bDO \$\s/);
    });

    it('preserves rollback and installed controls and reports the failing stage', () => {
        expect(executable.trim()).toMatch(/^BEGIN;/);
        expect(executable.trim()).toMatch(/ROLLBACK;$/);
        expect(executable).not.toMatch(/\bCOMMIT\b|\bDISABLE\b|session_replication_role|SECURITY\s+DEFINER/i);
        expect(executable).not.toMatch(/(?:ALTER|DROP)\s+(?:TABLE|POLICY|FUNCTION|TRIGGER)|CREATE\s+(?:OR REPLACE\s+)?FUNCTION\s+public\./i);
        expect(block[1]).toContain('GET STACKED DIAGNOSTICS');
        expect(block[1]).toContain('ERRCODE=gc05_error_state');
        expect(block[1]).toContain('GC05 stage=%s SQLSTATE=%s: %s | context: %s');
    });

    it('renders a transaction-local report with an explicit failure if no report was produced', () => {
        expect(executable).toContain("SET LOCAL gc05.rehearsal_result='';");
        expect(block[1]).toContain("set_config('gc05.rehearsal_result',gc05_report::TEXT,true)");
        const outside = executable.replace(block[0], '');
        expect(outside).toContain("current_setting('gc05.rehearsal_result',true)");
        expect(outside).toContain('"result":"FAIL"');
        expect(outside).not.toMatch(/\bFROM\s+pg_temp\./i);
    });
});
