import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const actionIndexSource = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const retiredActionReviewSource = readFileSync(new URL('./ActionReview.js', import.meta.url), 'utf8');
const sharedActionCardSource = readFileSync(new URL('./ActionCard.js', import.meta.url), 'utf8');

describe('shared action review retirement contract', () => {
    it('does not expose the retired review component through the actions barrel', () => {
        expect(actionIndexSource).not.toMatch(/ActionReview|createActionReview/);
    });

    it('cannot restore legacy adjudication writes, controls, or workflow outcomes', () => {
        expect(retiredActionReviewSource).not.toMatch(/Record Deliberation/i);
        expect(retiredActionReviewSource).not.toMatch(
            /actionsStore\s*(?:\.\s*adjudicate|\[\s*['"]adjudicate['"]\s*\])\s*\(/
        );
        expect(retiredActionReviewSource).not.toMatch(/ENUMS\s*\.\s*OUTCOMES|outcomeSelect/i);
        expect(retiredActionReviewSource).not.toMatch(/\b(?:SUCCESS|PARTIAL_SUCCESS|FAIL|BACKFIRE)\b/);
        expect(retiredActionReviewSource).not.toMatch(/\bexport\s+(?:default|async\s+function|function|class|const|let|var|\{)/);
    });

    it('does not expose the legacy adjudication hook from the shared action card', () => {
        expect(sharedActionCardSource).not.toMatch(/Record Deliberation|canAdjudicate|onAdjudicate|adjudicate-btn/i);
    });
});
