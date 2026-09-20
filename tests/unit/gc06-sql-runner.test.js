import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../sql/gc06-regional-proposals-editor.sql', import.meta.url), 'utf8');
const executable = source.replace(/--[^\n]*/g, '');
const block = executable.match(/DO \$gc06_suite\$([\s\S]*?)\$gc06_suite\$;/);

// These pin harness containment only; they do not execute SQL or establish RLS evidence.
describe('GC06 SQL Editor harness containment and diagnostics', () => {
    it('keeps fixture creation and all fixture reads in one server-side block', () => {
        expect(block).not.toBeNull();
        const outside = executable.replace(block[0], '');
        for (const name of ['gc06_sessions', 'gc06_actors', 'gc06_proposals', 'gc06_results']) {
            expect(block[1]).toContain(`CREATE TEMP TABLE ${name}`);
            expect(block[1]).toContain(`pg_temp.${name}`);
            expect(outside).not.toContain(name);
        }
        expect(block[1]).toContain('SET LOCAL ROLE authenticated;');
        for (const rpc of ['write_regional_proposal', 'append_proposal_thread_message',
            'operator_review_artifact', 'operator_forward_proposal_response', 'submit_regional_orientation']) {
            expect(block[1]).toContain(`public.${rpc}(`);
        }
    });

    it('preserves rollback and controls while reporting the original error and stage', () => {
        expect(executable.trim()).toMatch(/^BEGIN;/);
        expect(executable.trim()).toMatch(/ROLLBACK;$/);
        expect(executable).not.toMatch(/\bCOMMIT\b|\bDISABLE\b|session_replication_role|SECURITY\s+DEFINER/i);
        expect(executable).not.toMatch(/(?:ALTER|DROP)\s+(?:TABLE|POLICY|FUNCTION|TRIGGER)|CREATE\s+(?:OR REPLACE\s+)?FUNCTION\s+public\./i);
        expect(block[1]).toContain('GET STACKED DIAGNOSTICS');
        expect(block[1]).toContain('ERRCODE=gc06_error_state');
        expect(block[1]).toContain('GC06 stage=%s SQLSTATE=%s: %s | context: %s');
    });

    it('renders without temporary tables and fails when no assertions were reported', () => {
        expect(executable).toContain("SET LOCAL gc06.rehearsal_result='';");
        expect(block[1]).toContain("set_config('gc06.rehearsal_result',gc06_report::TEXT,true)");
        const outside = executable.replace(block[0], '');
        expect(outside).toContain("current_setting('gc06.rehearsal_result',true)");
        expect(outside).toContain("(value->>'assertions')::INTEGER > 0");
        expect(outside).toContain('"result":"FAIL"');
        expect(outside).not.toMatch(/\bFROM\s+pg_temp\./i);
    });
});
