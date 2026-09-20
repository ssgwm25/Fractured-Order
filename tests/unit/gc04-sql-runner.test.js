import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = name => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8');
const editor = read('gc04-session-context-editor.sql');
const executable = editor.replace(/--[^\n]*/g, '');
const block = executable.match(/DO \$gc04_suite\$([\s\S]*?)\$gc04_suite\$;/);

describe('GC04 SQL runner usability and fixture containment', () => {
    it('can be pasted into SQL Editor without client commands or manual fixture values', () => {
        expect(executable).not.toMatch(/^\s*\\/m);
        expect(executable).not.toMatch(/:'[a-z_]+\b|REPLACE_[A-Z_]+|\$\{[^}]+\}/);
        expect(executable).toContain('gen_random_uuid()');
        expect(executable).toContain('SET LOCAL ROLE authenticated;');
    });

    it('keeps fixtures in one rolled-back transaction without altering installed controls', () => {
        expect(executable.trim()).toMatch(/^BEGIN;/);
        expect(executable.trim()).toMatch(/ROLLBACK;$/);
        expect(executable).not.toMatch(/\bCOMMIT\b|\bDISABLE\b|session_replication_role|CREATE\s+(?:OR REPLACE\s+)?FUNCTION\s+public\./i);
        expect(executable).not.toMatch(/(?:ALTER|DROP)\s+(?:TABLE|POLICY|FUNCTION|TRIGGER)/i);
        expect(executable).toContain('WHERE id = actor.seat_id AND session_id = run.session_id');
    });

    it('uses the same self-contained suite through psql without requiring variables', () => {
        const psql = read('gc04-session-context.sql');
        expect(psql).toContain('\\set ON_ERROR_STOP on');
        expect(psql).toContain('\\ir gc04-session-context-editor.sql');
        expect(psql).not.toMatch(/:'[a-z_]+\b|REPLACE_[A-Z_]+/);
    });

    it('contains temporary tables and composite types in one server-side block', () => {
        expect(block).not.toBeNull();
        const outside = executable.replace(block[0], '');
        for (const name of ['gc04_run', 'gc04_actors', 'gc04_results']) {
            expect(block[1]).toContain(`CREATE TEMP TABLE ${name}`);
            expect(block[1]).toContain(`pg_temp.${name}`);
            expect(outside).not.toContain(name);
            expect(block[1].replace(`CREATE TEMP TABLE ${name}`, '')).not.toMatch(new RegExp(`(?<![\\w.])${name}\\b`));
        }
        expect(block[1]).toContain('actor pg_temp.gc04_actors');
        expect(block[1]).toContain('run pg_temp.gc04_run');
        expect(block[1]).toContain('expected 36 assertions');
        expect(block[1]).toContain('SET LOCAL ROLE authenticated;');
        expect(block[1]).toContain('public.restore_session_seat_context(');
    });

    it('preserves SQLSTATE and exposes the failure stage and context', () => {
        expect(block).not.toBeNull();
        expect(block[1]).toContain('GET STACKED DIAGNOSTICS');
        expect(block[1]).toContain('ERRCODE=gc04_error_state');
        expect(block[1]).toContain('GC04 stage=%s SQLSTATE=%s: %s | context: %s');
        expect(executable).not.toMatch(/SECURITY\s+DEFINER/i);
    });

    it('renders grouped results without temporary tables and fails if no report exists', () => {
        expect(block).not.toBeNull();
        expect(executable).toContain("SET LOCAL gc04.rehearsal_result='';");
        expect(block[1]).toContain("set_config('gc04.rehearsal_result',gc04_report::TEXT,true)");
        const outside = executable.replace(block[0], '');
        expect(outside).toContain("current_setting('gc04.rehearsal_result',true)");
        expect(outside).toContain("(value->>'assertions')::BIGINT > 0");
        expect(outside).toContain('"status":"FAIL"');
        for (const column of ['role', 'status', 'assertions_passed', 'checks']) {
            expect(outside).toContain(`entry->>'${column}'`);
        }
        expect(outside).not.toMatch(/\bFROM\s+pg_temp\./i);
    });
});
