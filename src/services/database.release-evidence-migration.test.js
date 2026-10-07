import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
    REQUIRED_MIGRATION_COUNT,
    REQUIRED_MIGRATION_LEDGER_SHA256,
    REQUIRED_MIGRATION_STATE
} from '../core/releaseEvidence.js';

function read(relativePath) {
    return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

const MIGRATION = read('data/2026-10-07_hosted_release_evidence.sql');
const SETUP = read('docs/supabase-setup.md');

describe('hosted release evidence migration', () => {
    it('binds the declared fingerprint to the complete ordered migration ledger', () => {
        const migrationNames = [...SETUP.matchAll(/^\d+\. `data\/([^`]+\.sql)`$/gm)]
            .map((match) => match[1]);
        const fingerprint = createHash('sha256')
            .update(`${migrationNames.join('\n')}\n`)
            .digest('hex');

        expect(migrationNames).toHaveLength(REQUIRED_MIGRATION_COUNT);
        expect(migrationNames.at(-1)).toBe(`${REQUIRED_MIGRATION_STATE}.sql`);
        expect(fingerprint).toBe(REQUIRED_MIGRATION_LEDGER_SHA256);
        expect(MIGRATION).toContain(`'migration_count', '${REQUIRED_MIGRATION_COUNT}'`);
        expect(MIGRATION).toContain(REQUIRED_MIGRATION_LEDGER_SHA256);
    });

    it('fails closed on critical RLS, policy, trigger, and RPC prerequisites', () => {
        [
            'sessions',
            'session_participants',
            'game_state',
            'actions',
            'requests',
            'communications',
            'timeline',
            'notetaker_data',
            'artifact_workflow_reviews',
            'live_demo_runtime_config'
        ].forEach((relation) => expect(MIGRATION).toContain(`'${relation}'`));
        [
            'FWC08_RLS_PREREQUISITE_MISSING',
            'FWC08_BROAD_RLS_POLICY_PRESENT',
            'FWC08_REQUIRED_RPC_SIGNATURE_MISSING',
            'FWC08_INDUSTRY_TRIGGER_PREREQUISITE_MISSING',
            'FWC08_REQUIRED_RLS_POLICY_MISSING'
        ].forEach((failureCode) => expect(MIGRATION).toContain(failureCode));
        expect(MIGRATION).toContain('industry_proposal_move_gate');
        expect(MIGRATION).toContain('industry_proposal_prepare');
        expect(MIGRATION).toContain('operator_review_artifact(text,uuid,text,text,bigint,text)');
        expect(MIGRATION).toContain('append_proposal_thread_message(uuid,text,text,text,text)');
    });

    it('exposes only authenticated, non-secret, commit-shaped release identity', () => {
        expect(MIGRATION).toContain('CREATE OR REPLACE FUNCTION public.live_demo_release_evidence()');
        expect(MIGRATION).toContain('SECURITY DEFINER');
        expect(MIGRATION).toContain("~ '^[0-9A-Fa-f]{40}$'");
        expect(MIGRATION).toContain('REVOKE ALL ON FUNCTION public.live_demo_release_evidence() FROM anon');
        expect(MIGRATION).toContain('GRANT EXECUTE ON FUNCTION public.live_demo_release_evidence() TO authenticated');
        expect(MIGRATION).not.toContain('operator_code_sha256');
    });
});
