import { describe, expect, it } from 'vitest';

import {
    buildIndustryTurnSheetDisplayModel,
    createBlankIndustryTurnSheet,
    deriveIndustryProposalContext,
    getIndustryMoveCoverage,
    normalizeIndustryTurnSheet,
    validateIndustryTurnSheet
} from './industryTurnSheet.js';

function proposalAction({
    id,
    industry,
    move = 1,
    ordinal = 1,
    workflowState = 'draft',
    isDeleted = false
}) {
    return {
        id,
        team: 'industry',
        move,
        workflow_state: workflowState,
        is_deleted: isDeleted,
        artifact_payload: {
            proposal: {
                industryTurnSheet: normalizeIndustryTurnSheet({
                    ...createBlankIndustryTurnSheet({ move, strategicPlanId: 'plan-1' }),
                    proposalId: id,
                    sessionId: 'session-1',
                    industry,
                    proposalOrdinalForIndustryMove: ordinal,
                    isFirstProposalForIndustryMove: ordinal === 1,
                    recipientTeams: ['blue']
                })
            }
        }
    };
}

describe('Industry proposal domain contract', () => {
    it('requires Blue, Red, or both as intended recipients', () => {
        const blank = createBlankIndustryTurnSheet({ move: 1, strategicPlanId: 'plan-1' });
        const withoutRecipients = validateIndustryTurnSheet({ ...blank, industry: 'agriculture' });
        const withRecipients = validateIndustryTurnSheet({
            ...blank,
            industry: 'agriculture',
            recipientTeams: ['blue', 'red', 'green', 'blue']
        });

        expect(withoutRecipients).toContainEqual(expect.objectContaining({
            field: 'recipientTeams',
            page: 2
        }));
        expect(withRecipients).not.toContainEqual(expect.objectContaining({ field: 'recipientTeams' }));
        expect(normalizeIndustryTurnSheet({ recipientTeams: ['blue', 'red', 'green', 'blue'] }).recipientTeams)
            .toEqual(['blue', 'red']);
    });

    it('normalizes explicit no-engagement, no-spillover, unknown effects, and new risks', () => {
        const normalized = normalizeIndustryTurnSheet({
            engagement: {
                outbound: { engaged: false, linkedRecordId: 'message-1', outcome: 'stale text' },
                inbound: { engaged: false, linkedRecordId: 'thread-1', outcome: 'stale text' }
            },
            otherSectorSpillover: {
                hasMaterialSpillover: false,
                entries: [{ affectedSector: 'Energy', direction: 'negative', explanation: 'Stale' }]
            },
            expectedEffects: {
                firmRevenue: { direction: 'unknown', magnitude: 'large', timing: 'this_quarter', pattern: 'ongoing' }
            },
            risks: [{ id: 'risk-1', priorRiskId: null, movementStatus: 'increased' }]
        });

        expect(normalized.engagement.outbound).toMatchObject({
            engaged: false,
            linkedRecordId: null,
            outcome: null
        });
        expect(normalized.otherSectorSpillover).toEqual({
            hasMaterialSpillover: false,
            entries: []
        });
        expect(normalized.expectedEffects.firmRevenue).toEqual({
            direction: 'unknown',
            magnitude: 'unknown',
            timing: 'unknown',
            pattern: 'unknown'
        });
        expect(normalized.risks[0]).toMatchObject({ priorRiskId: null, movementStatus: 'new' });
    });

    it('uses one complete display model for author, Facilitator, and White Cell views', () => {
        const model = buildIndustryTurnSheetDisplayModel({
            ...createBlankIndustryTurnSheet({ move: 2, strategicPlanId: 'plan-1' }),
            industry: 'telecommunications',
            recipientTeams: ['blue', 'red']
        });

        expect(model.sections.map(({ title }) => title)).toEqual([
            'Proposal context',
            'Environment read',
            'Supply chain exposure',
            'Decision',
            'Expected effects',
            'Engagement and risk',
            'Security and spillover',
            'Escalation and next move',
            'Facilitator note'
        ]);
        expect(model.sections.flatMap(({ rows }) => rows)).toContainEqual([
            'Intended recipients',
            'Blue, Red'
        ]);
    });

    it('blocks Proposal 2 until the first active proposal is completed', () => {
        const draft = proposalAction({ id: 'proposal-1', industry: 'agriculture' });
        const completed = { ...draft, workflow_state: 'completed' };

        expect(deriveIndustryProposalContext([draft], { industry: 'agriculture', move: 1 }))
            .toMatchObject({ proposalOrdinalForIndustryMove: 2, canCreateProposal: false });
        expect(deriveIndustryProposalContext([completed], { industry: 'agriculture', move: 1 }))
            .toMatchObject({ proposalOrdinalForIndustryMove: 2, canCreateProposal: true });
    });

    it('requires one completed proposal from every Industry sector before move advance', () => {
        const actions = [
            proposalAction({ id: 'ag-1', industry: 'agriculture', workflowState: 'completed' }),
            proposalAction({ id: 'bio-1', industry: 'biotechnology', workflowState: 'completed' })
        ];

        expect(getIndustryMoveCoverage(actions, 1)).toMatchObject({
            complete: false,
            missing: [expect.objectContaining({ value: 'telecommunications' })]
        });

        actions.push(proposalAction({ id: 'tel-1', industry: 'telecommunications', workflowState: 'completed' }));
        expect(getIndustryMoveCoverage(actions, 1)).toMatchObject({ complete: true, missing: [] });
    });

    it('does not use a deleted proposal as the active baseline', () => {
        const deleted = proposalAction({
            id: 'proposal-1',
            industry: 'agriculture',
            workflowState: 'completed',
            isDeleted: true
        });

        expect(deriveIndustryProposalContext([deleted], { industry: 'agriculture', move: 1 }))
            .toMatchObject({
                proposalOrdinalForIndustryMove: 2,
                isFirstProposalForIndustryMove: true,
                canCreateProposal: true
            });
    });
});
