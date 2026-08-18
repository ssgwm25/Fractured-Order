import { describe, expect, it } from 'vitest';

import {
    createTrainingProgressEventKey,
    getTrainingProgressRoleLabel,
    getTrainingStageLabel,
    normalizeTrainingAttemptSnapshot,
    reconcileTrainingProgress,
    resolveTrainingResumeIndex
} from './TrainingProgress.js';

const module = Object.freeze({
    title: 'Scribe',
    steps: Object.freeze([
        Object.freeze({ id: 'training.v1.scribe.blue.orient' }),
        Object.freeze({ id: 'training.v1.scribe.blue.show' }),
        Object.freeze({ id: 'training.v1.scribe.blue.guide' })
    ])
});

describe('TrainingProgress', () => {
    it('derives a stable role label from curriculum semanticRole metadata', () => {
        expect(getTrainingProgressRoleLabel({ semanticRole: 'scribe' })).toBe('Scribe');
        expect(getTrainingProgressRoleLabel({})).toBe('Training');
    });

    it('turns internal stage keys into learner-facing pathway labels', () => {
        expect(getTrainingStageLabel('show')).toBe('See it');
        expect(getTrainingStageLabel('guide')).toBe('Follow along');
        expect(getTrainingStageLabel('retrieve')).toBe('Check understanding');
        expect(getTrainingStageLabel('unknown')).toBe('Learning activity');
    });

    it('resumes at the first incomplete meaningful step instead of trusting current_step_id', () => {
        const snapshot = normalizeTrainingAttemptSnapshot({
            attempt_id: 'attempt-1',
            attempt_revision: 4,
            current_step_id: 'training.v1.scribe.blue.guide',
            completed_step_ids: module.steps.map((step) => step.id),
            mastered_step_ids: [module.steps[0].id]
        });

        expect(resolveTrainingResumeIndex(module, snapshot)).toBe(1);
    });

    it('rejects a server response older than the optimistic local revision', () => {
        expect(() => reconcileTrainingProgress(
            { attempt_id: 'attempt-1', attempt_revision: 5 },
            { attempt_id: 'attempt-1', attempt_revision: 4 }
        )).toThrow('TRAINING_STALE_SERVER_REVISION');
    });

    it('rejects reconciliation across attempt identities', () => {
        expect(() => reconcileTrainingProgress(
            { attempt_id: 'attempt-1', attempt_revision: 1 },
            { attempt_id: 'attempt-2', attempt_revision: 2 }
        )).toThrow('TRAINING_ATTEMPT_MISMATCH');
    });

    it('builds bounded content-free idempotency keys', () => {
        const key = createTrainingProgressEventKey(
            'mastery_passed',
            'training.v1.scribe.blue.retrieve',
            'passed'
        );
        expect(key).toBe('mastery_passed.training.v1.scribe.blue.retrieve.passed');
        expect(key.length).toBeLessThanOrEqual(160);
        expect(key).not.toContain('learner answer');
    });
});
