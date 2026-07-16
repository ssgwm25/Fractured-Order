import { describe, expect, it } from 'vitest';

import { isProposalNegotiationRequest } from './proposalRecipientState.js';

describe('proposal recipient response categorisation', () => {
    it('recognises negotiations on both the forwarded proposal and response communication shapes', () => {
        expect(isProposalNegotiationRequest({
            metadata: {
                proposal_recipient_state: {
                    status: 'responded',
                    facilitator_decision: 'negotiate'
                }
            }
        })).toBe(true);

        expect(isProposalNegotiationRequest({
            type: 'PROPOSAL_RESPONSE',
            metadata: {
                facilitator_decision: 'negotiate'
            }
        })).toBe(true);
    });

    it('does not recategorise other proposal responses as negotiations', () => {
        expect(isProposalNegotiationRequest({
            metadata: {
                proposal_recipient_state: {
                    status: 'responded',
                    facilitator_decision: 'accept'
                }
            }
        })).toBe(false);
    });
});
