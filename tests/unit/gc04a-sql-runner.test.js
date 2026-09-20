import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../sql/gc04a-shared-facilitator-editor.sql', import.meta.url), 'utf8');
const executable = source.replace(/--[^\n]*/g, '');
const block = executable.match(/DO \$gc04a_suite\$([\s\S]*?)\$gc04a_suite\$;/);

// Source structure only; real RPC/RLS evidence requires the human SQL run.
describe('GC04A SQL Editor fixture containment and diagnostics', () => {
    it('creates and consumes fixtures and their composite types inside one server-side block', () => {
        expect(block).not.toBeNull();
        const outside = executable.replace(block[0], '');
        for (const name of ['gc04a_run', 'gc04a_actors', 'gc04a_results', 'gc04a_artifacts']) {
            expect(block[1]).toContain(`CREATE TEMP TABLE ${name}`);
            expect(block[1]).toContain(`pg_temp.${name}`);
            expect(outside).not.toContain(name);
            expect(block[1].replace(`CREATE TEMP TABLE ${name}`, '')).not.toMatch(new RegExp(`(?<![\\w.])${name}\\b`));
        }
        expect(block[1]).toContain('actor pg_temp.gc04a_actors');
        expect(block[1]).toContain('run pg_temp.gc04a_run');
        expect(block[1]).toContain('SET LOCAL ROLE authenticated;');
        for (const rpc of ['write_regional_proposal', 'claim_session_role_seat',
            'restore_session_seat_context', 'configure_session_green_shared_facilitator']) {
            expect(block[1]).toContain(`public.${rpc}(`);
        }
        expect(block[1]).toContain('expected 27 actor assertions');
    });

    it('preserves rollback and installed controls and rethrows errors with their stage', () => {
        expect(executable.trim()).toMatch(/^BEGIN;/);
        expect(executable.trim()).toMatch(/ROLLBACK;$/);
        expect(executable).not.toMatch(/\bCOMMIT\b|\bDISABLE\b|session_replication_role|SECURITY\s+DEFINER/i);
        expect(executable).not.toMatch(/(?:ALTER|DROP)\s+(?:TABLE|POLICY|FUNCTION|TRIGGER)|CREATE\s+(?:OR REPLACE\s+)?FUNCTION\s+public\./i);
        expect(block[1]).toContain('GET STACKED DIAGNOSTICS');
        expect(block[1]).toContain('ERRCODE=gc04a_error_state');
        expect(block[1]).toContain('GC04A stage=%s SQLSTATE=%s: %s | context: %s');
    });

    it('renders grouped results without temporary tables and fails on an absent or empty report', () => {
        expect(executable).toContain("SET LOCAL gc04a.rehearsal_result='';");
        expect(block[1]).toContain("set_config('gc04a.rehearsal_result',gc04a_report::TEXT,true)");
        const outside = executable.replace(block[0], '');
        expect(outside).toContain("current_setting('gc04a.rehearsal_result',true)");
        expect(outside).toContain("(value->>'assertions')::BIGINT > 0");
        expect(outside).toContain('"status":"FAIL"');
        for (const column of ['role', 'status', 'assertions_passed', 'checks']) {
            expect(outside).toContain(`entry->>'${column}'`);
        }
        expect(outside).not.toMatch(/\bFROM\s+pg_temp\./i);
    });
});
