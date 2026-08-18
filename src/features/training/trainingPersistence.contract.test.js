import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL('../../../data/2026-08-18_training_mastery_progress.sql', import.meta.url));
const migration = readFileSync(migrationPath, 'utf8');
const researchExport = readFileSync(
    fileURLToPath(new URL('../export/researchExport.js', import.meta.url)),
    'utf8'
);

describe('training mastery persistence migration', () => {
    it('requires compare-and-swap revisions and idempotent event keys', () => {
        expect(migration).toContain('requested_expected_revision BIGINT');
        expect(migration).toContain('requested_expected_revision <> attempt_row.revision');
        expect(migration).toContain("USING ERRCODE = '40001'");
        expect(migration).toContain('idx_training_progress_events_attempt_event_key');
        expect(migration).toContain("'idempotent', true");
    });

    it('returns bounded mastery summaries without learner content fields', () => {
        expect(migration).toContain("'completed_step_ids', completed_steps");
        expect(migration).toContain("'mastered_step_ids', mastered_steps");
        expect(migration).not.toMatch(/answer_body|narration_text|artifact_body|transcript_body/);
    });

    it('resets only the caller-owned selected attempt and creates a pristine replacement', () => {
        const resetBody = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.reset_training_attempt'));
        expect(resetBody).toContain('ta.id = requested_attempt_id');
        expect(resetBody).toContain('ta.auth_user_id = current_user_id');
        expect(resetBody).toContain("SET status = 'reset'");
        expect(resetBody).toContain('INSERT INTO public.training_attempts');
        expect(resetBody).not.toContain('DELETE FROM public.training_attempts');
    });

    it('guards completion on all seven declarative mastery events', () => {
        expect(migration).toContain("tpe.event_type = 'mastery_passed'");
        expect(migration).toContain(') <> 7 THEN');
        expect(migration).toContain('Every curriculum step must be mastered before completion.');
    });

    it('keeps attempts and completion outside live research exports', () => {
        expect(researchExport).not.toContain('training_attempts');
        expect(researchExport).not.toContain('training_progress_events');
        expect(migration).not.toMatch(/INSERT INTO public\.research_|UPDATE public\.research_/);
    });
});
