import { describe, expect, it } from 'vitest';
import {
    PROPOSAL_SCRIBE_HANDOFF,
    getProposalViewModel,
    isProposalAction,
    isProposalForwardedToScribe,
    parseProposalDetails,
    serializeProposalDetails
} from './proposalDetails.js';

describe('proposalDetails scribe handoff', () => {
    it('serializes and parses Scribe Handoff', () => {
        const serialized = serializeProposalDetails({
            originators: ['EU', 'UK'],
            objective: 'Align export controls',
            category: 'Alignment',
            intendedPartners: 'Selected partners',
            delivery: 'Joint Statement',
            timingAndConditions: 'This move',
            recipientTeam: 'blue',
            scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.FORWARDED
        });

        expect(serialized).toContain('Proposal Details');
        expect(serialized).toContain('Scribe Handoff: Forwarded');

        const parsed = parseProposalDetails(serialized);
        expect(parsed).toEqual(expect.objectContaining({
            recipientTeam: 'blue',
            scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.FORWARDED,
            originators: ['EU', 'UK']
        }));
    });

    it('defaults missing handoff to Draft on serialize', () => {
        const serialized = serializeProposalDetails({
            originators: ['Japan'],
            objective: 'Test',
            category: 'Partnership',
            intendedPartners: 'ASEAN',
            delivery: 'Diplomatic Engagement',
            timingAndConditions: 'Now',
            recipientTeam: 'red'
        });

        expect(serialized).toContain('Scribe Handoff: Draft');
        expect(isProposalForwardedToScribe({
            mechanism: 'Proposal',
            ally_contingencies: serialized
        })).toBe(false);
    });

    it('detects forwarded proposals for Facilitator visibility', () => {
        const action = {
            mechanism: 'Proposal',
            goal: 'Green proposal',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU'],
                objective: 'Coordinate',
                category: 'Partnership',
                intendedPartners: 'Partners',
                delivery: 'Joint Statement',
                timingAndConditions: 'Soon',
                recipientTeam: 'blue',
                scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.FORWARDED
            })
        };

        expect(isProposalAction(action)).toBe(true);
        expect(isProposalForwardedToScribe(action)).toBe(true);
        expect(getProposalViewModel(action).scribeHandoff).toBe(PROPOSAL_SCRIBE_HANDOFF.FORWARDED);
    });
});
