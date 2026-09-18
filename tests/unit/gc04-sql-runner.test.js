import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = name => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8');
const editor = read('gc04-session-context-editor.sql');
const executable = editor.replace(/--[^\n]*/g, '');

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
});
