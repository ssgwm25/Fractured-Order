import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../data/2026-09-18_green_regional_storage.sql', import.meta.url), 'utf8');

describe('GC-02 reported PL/pgSQL parsing regression', () => {
    // These source checks pin the two reported parser hazards. They do not
    // compile SQL or replace applying the migration and running the SQL suite.
    it.each([
        ['communication ownership', /NEW\.delegation_id IS NOT NULL AND NEW\.delegation_id IS DISTINCT FROM\s+\(CASE WHEN source IS NOT NULL THEN source_delegation ELSE sender_delegation END\)\s+OR NEW\.owner_team/],
        ['thread audience', /IF is_thread AND NEW\.type = 'PROPOSAL_RESPONSE' AND recipient_team IS DISTINCT FROM\s+\(CASE WHEN sender_team = source_team THEN NEW\.metadata ->> 'recipient_team' ELSE source_team END\) THEN/]
    ])('keeps the %s CASE expression nested inside its IF condition', (_label, expression) => {
        expect(sql).toMatch(expression);
    });
});
