import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    getTrainingActionRequirement,
    getTrainingCompletionSummary
} from './TrainingCoach.js';

describe('TrainingCoach contract', () => {
    it.each(['scribe', 'facilitator', 'notetaker'])(
        'summarizes %s capabilities without turning practice into live evidence or competitive scoring',
        (role) => {
            const summary = getTrainingCompletionSummary(role);
            const copy = Object.values(summary).join(' ');
            expect(copy).toContain('Scribe to Facilitator to White Cell');
            expect(copy).toContain('first live session');
            expect(copy).toContain('reopen training');
            expect(copy).toContain('not live-session evidence');
            expect(copy.toLowerCase()).not.toContain('certified');
            expect(copy).not.toMatch(/\b\d+\s*\/\s*\d+\b/);
        }
    );

    it('states a concrete action requirement for every curriculum interaction type', () => {
        [
            'read', 'observe', 'guided_action', 'practice_action',
            'simulated_response', 'retrieval_check', 'reflection'
        ].forEach((interactionType) => {
            expect(getTrainingActionRequirement({ interactionType })).toMatch(/\.$/);
        });
    });

    it('keeps Next mastery-gated and exposes confirmation, live-region, and native disclosure semantics', () => {
        const source = readFileSync(fileURLToPath(new URL('./TrainingCoach.js', import.meta.url)), 'utf8');
        expect(source).toContain('this.nextButton.disabled = !this.isMastered(step.id)');
        expect(source).toContain("setAttribute('aria-live', 'polite')");
        expect(source).toContain("createElement(documentRef, 'details'");
        expect(source).toContain("title: 'Reset current role?'");
        expect(source).toContain("title: 'Start another role?'");
        expect(source).toContain('Your progress was not cleared; try again.');
    });
});
