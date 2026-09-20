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
    it('uses persisted regional approvals and ignores narrative approval claims', () => {
        const action = { delegation_id:'europe', revision_number:2, ally_contingencies:serializeProposalDetails({
            recipientTeams:['blue','red'], recipientApprovalStates:{blue:'approved_forwarded',red:'approved_forwarded'}
        }), artifact_payload:{proposal_recipient_reviews:{blue:{status:'approved_forwarded'}}} };
        expect(getProposalViewModel(action).recipientApprovalStates).toEqual({blue:'approved_forwarded',red:'pending_white_cell_approval'});
        expect(getProposalViewModel(action).delegationLabel).toBe('Green - Europe');
    });
    it('round-trips every multi-select, Industry, supply-chain, and revision field', () => {
        const serialized = serializeProposalDetails({
            originators: ['Industry', 'Japan'],
            objective: 'Coordinate a resilient industrial corridor.',
            instruments: ['Economic', 'Information'],
            category: 'Partnership',
            intendedPartners: 'Selected public and private partners',
            delivery: 'Joint Statement',
            timingAndConditions: 'Before Move 2',
            recipientTeams: ['blue', 'red'],
            focusSectors: ['Biotechnology', 'Telecommunications'],
            supplyChainFocusDecision: 'Yes',
            supplyChainActionAngles: ['Build resilience for Blue', 'Disrupt Red'],
            supplyChainAreas: ['Extraction', 'Advanced Manufacturing'],
            industryFocus: 'Advanced biomanufacturing',
            countryFocus: 'Japan and ROK',
            proposedActivity: 'Stand up a joint capacity facility.',
            revisionMetadata: {
                revisionNumber: 3,
                priorWorkflowState: 'returned_to_team',
                reviewedAt: '2026-08-05T14:00:00.000Z',
                reviewedByRole: 'whitecell_lead',
                reviewNotes: 'Clarify delivery ownership.',
                completedAt: ''
            },
            scribeHandoff: 'Forwarded'
        });

        expect(parseProposalDetails(serialized)).toEqual({
            originators: ['Industry', 'Japan'],
            objective: 'Coordinate a resilient industrial corridor.',
            instruments: ['Economic', 'Information'],
            category: 'Partnership',
            intendedPartners: 'Selected public and private partners',
            delivery: 'Joint Statement',
            timingAndConditions: 'Before Move 2',
            recipientTeam: 'blue',
            recipientTeams: ['blue', 'red'],
            recipientApprovalStates: {
                blue: 'pending_white_cell_approval',
                red: 'pending_white_cell_approval'
            },
            focusSector: 'Biotechnology',
            focusSectors: ['Biotechnology', 'Telecommunications'],
            supplyChainFocusDecision: 'Yes',
            supplyChainActionAngles: ['Build resilience for Blue', 'Disrupt Red'],
            supplyChainAreas: ['Extraction', 'Advanced Manufacturing'],
            industryFocus: 'Advanced biomanufacturing',
            countryFocus: 'Japan and ROK',
            proposedActivity: 'Stand up a joint capacity facility.',
            revisionMetadata: {
                revisionNumber: 3,
                revisionNumberOrigin: '',
                priorWorkflowState: 'returned_to_team',
                reviewedAt: '2026-08-05T14:00:00.000Z',
                reviewedByRole: 'whitecell_lead',
                reviewNotes: 'Clarify delivery ownership.',
                completedAt: ''
            },
            scribeHandoff: 'Forwarded'
        });

        const viewModel = getProposalViewModel({
            goal: 'Industrial corridor proposal',
            expected_outcomes: 'Shared capacity comes online.',
            ally_contingencies: serialized
        });
        expect(viewModel.recipientTeams).toEqual(['blue', 'red']);
        expect(viewModel.focusSectors).toEqual(['Biotechnology', 'Telecommunications']);
        expect(viewModel.artifactDetails).toEqual(expect.arrayContaining([
            { label: 'Intended Partners', value: 'Selected public and private partners' },
            {
                label: 'Proposed Recipient Approvals',
                value: 'Blue Team: Awaiting separate White Cell approval; Red Team: Awaiting separate White Cell approval'
            },
            { label: 'Focus Sectors', value: 'Biotechnology, Telecommunications' },
            { label: 'Supply Chain Decision', value: 'Yes' },
            { label: 'Action Angles', value: 'Build resilience for Blue, Disrupt Red' },
            { label: 'Supply Chain Areas', value: 'Extraction, Advanced Manufacturing' },
            { label: 'Industry Focus', value: 'Advanced biomanufacturing' },
            { label: 'Country Focus', value: 'Japan and ROK' },
            { label: 'Proposed Activity', value: 'Stand up a joint capacity facility.' },
            { label: 'Revision', value: '3' }
        ]));
    });

    it('overlays independently persisted recipient approvals without changing pending recipients', () => {
        const viewModel = getProposalViewModel({
            goal: 'Dual recipient proposal',
            ally_contingencies: serializeProposalDetails({
                objective: 'Coordinate two independent partner discussions.',
                recipientTeams: ['blue', 'red']
            }),
            artifact_payload: {
                proposal_recipient_reviews: {
                    blue: {
                        status: 'approved_forwarded',
                        thread_id: 'thread-blue-1'
                    }
                }
            }
        });

        expect(viewModel.recipientApprovalStates).toEqual({
            blue: 'approved_forwarded',
            red: 'pending_white_cell_approval'
        });
        expect(viewModel.artifactDetails).toContainEqual({
            label: 'Proposed Recipient Approvals',
            value: 'Blue Team: Approved and forwarded; Red Team: Awaiting separate White Cell approval'
        });
    });

    it('omits Category and Delivery from newly serialized proposal details', () => {
        const serialized = serializeProposalDetails({
            originators: ['EU'],
            objective: 'Coordinate resilient supply.',
            recipientTeams: ['blue', 'red'],
            focusSectors: ['Biotechnology', 'Custom industrial capacity'],
            supplyChainFocusDecision: 'No'
        });

        expect(serialized).not.toContain('\nCategory:');
        expect(serialized).not.toContain('\nDelivery:');
        expect(serialized).toContain('Recipient Teams: ["blue","red"]');
        expect(serialized).toContain(
            'Recipient Approval States: {"blue":"pending_white_cell_approval","red":"pending_white_cell_approval"}'
        );
    });

    it('parses historical Category, Delivery, single-recipient, and single-sector fields', () => {
        const historical = [
            'Proposal Details',
            'Originators: EU, Japan',
            'Objective: Preserve the historical proposal.',
            'Category: Alignment',
            'Delivery: Backchannel Negotiation',
            'Recipient Team: red',
            'Focus Sector: Agriculture'
        ].join('\n');

        expect(parseProposalDetails(historical)).toMatchObject({
            originators: ['EU', 'Japan'],
            category: 'Alignment',
            delivery: 'Backchannel Negotiation',
            recipientTeam: 'red',
            recipientTeams: ['red'],
            focusSector: 'Agriculture',
            focusSectors: ['Agriculture']
        });
    });

    it('round-trips Industry instruments of power without losing custom values', () => {
        const serialized = serializeProposalDetails({
            originators: ['EU'],
            objective: 'Coordinate industrial capacity',
            instruments: ['Economic', 'Information', 'Standards, finance, and insurance'],
            intendedPartners: 'Blue Team',
            delivery: 'Joint Statement',
            timingAndConditions: 'Before Move 2'
        });

        expect(serialized).toContain(
            'Instruments: ["Economic","Information","Standards, finance, and insurance"]'
        );
        expect(parseProposalDetails(serialized)?.instruments).toEqual([
            'Economic',
            'Information',
            'Standards, finance, and insurance'
        ]);
        expect(getProposalViewModel({
            mechanism: 'Proposal',
            ally_contingencies: serialized
        })).toEqual(expect.objectContaining({
            instrumentOfPower: 'Economic',
            instruments: ['Economic', 'Information', 'Standards, finance, and insurance']
        }));
    });

    it('presents a historical Industry category as its instrument without duplicating Category', () => {
        const viewModel = getProposalViewModel({
            team: 'industry',
            mechanism: 'Proposal',
            ally_contingencies: [
                'Proposal Details',
                'Objective: Coordinate industrial capacity',
                'Category: Partnership',
                'Delivery: Industry-led forum',
                'Recipient Team: blue',
                'Focus Sector: Critical minerals'
            ].join('\n')
        });

        expect(viewModel.artifactDetails).toEqual(expect.arrayContaining([
            { label: 'Instrument of Power', value: 'Partnership' },
            { label: 'Intended Partners', value: 'Blue Team' },
            { label: 'Focus Sectors', value: 'Critical minerals' }
        ]));
        expect(viewModel.artifactDetails).not.toContainEqual({
            label: 'Category',
            value: 'Partnership'
        });
    });

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
