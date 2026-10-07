import { describe, expect, it } from 'vitest';

import { createBlankIndustryTurnSheet } from './industryTurnSheet.js';
import { renderIndustryBaselineReference } from './industryTurnSheetForm.js';

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

describe('Industry proposal baseline reference', () => {
    it('renders the complete persisted baseline as read-only context', () => {
        const baseline = createBlankIndustryTurnSheet({ move: 1, strategicPlanId: 'plan-1' });
        baseline.proposalId = 'proposal-baseline-1';
        baseline.industry = 'agriculture';
        baseline.proposalOrdinalForIndustryMove = 1;
        baseline.isFirstProposalForIndustryMove = true;
        baseline.environment.biggestSurprise = 'Demand held steady.';
        baseline.environment.actors = baseline.environment.actors.map((actor) => ({
            ...actor,
            actionCodes: ['M'],
            actionNarrative: `${actor.actor} held its position.`,
            interestImpact: 1,
            confidence: 'medium',
            matchedForecast: 'yes'
        }));
        baseline.supplyChain.weakestLink = 'Port capacity';
        baseline.supplyChain.changeSinceLastMove = 'same';
        baseline.supplyChain.stages = baseline.supplyChain.stages.map((stage) => ({
            ...stage,
            whereWho: ['blue'],
            redDependency: 'low',
            plannedActions: ['diversify'],
            notes: `${stage.stage} remains monitored.`
        }));

        const html = renderIndustryBaselineReference(baseline, {
            industryLabel: 'Agriculture',
            move: 1,
            escapeHtml
        });

        expect(html).toContain('data-ts-baseline-proposal-id="proposal-baseline-1"');
        expect(html).toContain('Read-only:');
        expect(html).toContain('View complete baseline details');
        for (const label of ['Blue (U.S.)', 'Red', 'Green', 'Inputs / raw materials',
            'Refinement / processing', 'Manufacturing / production',
            'Distribution / logistics', 'End market / customers']) {
            expect(html).toContain(label);
        }
        expect(html).toContain('Demand held steady.');
        expect(html).toContain('Port capacity');
        expect(html).not.toMatch(/<(input|select|textarea)\b/);
    });
});
