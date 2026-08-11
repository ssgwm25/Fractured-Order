import { describe, expect, it } from 'vitest';

import {
    buildDirectCommunicationNotification,
    buildFacilitatorArtifactReturnNotification,
    buildProposalRoundNotification,
    buildRfiWorkflowNotification,
    buildWhiteCellArtifactNotification
} from './workflowNotifications.js';

describe('workflow notification event families', () => {
    it('builds persisted artifact submission and return identities', () => {
        const submitted = buildWhiteCellArtifactNotification({
            id: 'action-1', team: 'blue', goal: 'Port access', workflow_state: 'submitted_to_white_cell', revision_number: 2
        });
        const returned = buildFacilitatorArtifactReturnNotification({
            id: 'action-1', goal: 'Port access', workflow_state: 'returned_to_team', revision_number: 3
        });

        expect(submitted).toMatchObject({
            id: 'artifact-submission:action-1:submitted_to_white_cell:r2',
            source: 'Blue Team',
            requiredAction: 'Open and review the submission.'
        });
        expect(returned).toMatchObject({
            id: 'artifact-return:action-1:returned_to_team:r3',
            source: 'White Cell',
            destination: { slideKey: 'action-action-1' }
        });
    });

    it('covers RFI submissions, returns, and answers', () => {
        const base = { id: 'rfi-1', team: 'industry', query: 'Confirm tariff basis', revision_number: 2 };
        expect(buildRfiWorkflowNotification({ ...base, workflow_state: 'resubmitted' }, { audience: 'whitecell' })).toMatchObject({
            family: 'rfi-submission',
            destination: { section: 'requests', recordId: 'rfi-1' }
        });
        expect(buildRfiWorkflowNotification({ ...base, workflow_state: 'returned_to_team' })).toMatchObject({ family: 'rfi-return' });
        expect(buildRfiWorkflowNotification({ ...base, status: 'answered', responded_at: '2026-08-10T13:00:00.000Z' })).toMatchObject({
            family: 'rfi-answer',
            requiredAction: 'Open and read the White Cell answer.'
        });
    });

    it('covers proposal responses and follow-up rounds with communication IDs', () => {
        const communication = {
            id: 'round-2',
            type: 'PROPOSAL_RESPONSE',
            metadata: {
                thread_id: 'thread-1', recipient_team: 'blue', round_number: 2,
                source_proposal_id: 'proposal-1', source_revision: 1, source_team: 'green', sender_team: 'green',
                sender_role: 'green_scribe', sent_at: '2026-08-10T13:00:00.000Z', message_type: 'negotiation_message'
            }
        };

        expect(buildProposalRoundNotification(communication, { audience: 'whitecell' })).toMatchObject({
            id: 'proposal-round:round-2:round-2',
            family: 'proposal-follow-up',
            source: 'Green Team',
            destination: { communicationId: 'round-2' }
        });
    });

    it('covers direct Facilitator and White Cell communications in both directions', () => {
        const toFacilitator = buildDirectCommunicationNotification({
            id: 'comm-1', from_role: 'white_cell', to_role: 'blue_scribe', title: 'Guidance'
        });
        const toWhiteCell = buildDirectCommunicationNotification({
            id: 'comm-2', from_role: 'industry_scribe', to_role: 'white_cell', team: 'industry',
            content: 'Industry Facilitator requests review.'
        }, { audience: 'whitecell' });

        expect(toFacilitator).toMatchObject({ id: 'direct-communication:comm-1', source: 'White Cell' });
        expect(toWhiteCell).toMatchObject({
            id: 'direct-communication:comm-2',
            source: 'Industry Team',
            artifact: 'Industry Facilitator requests review.'
        });
    });
});
