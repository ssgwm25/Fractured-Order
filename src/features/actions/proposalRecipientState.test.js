import { describe, expect, it } from 'vitest';

import {
    PROPOSAL_RECIPIENT_STATUSES,
    getProposalThreadForRecipient,
    getProposalThreadMetadata,
    getProposalThreadStatus,
    isProposalNegotiationRequest
} from './proposalRecipientState.js';

function message({ id, threadId, recipientTeam, round, parentId = null, senderTeam, messageType, content }) {
    return {
        id,
        type: round === 0 ? 'PROPOSAL_FORWARDED' : 'PROPOSAL_RESPONSE',
        content,
        created_at: `2026-08-06T12:0${round}:00.000Z`,
        metadata: {
            thread_id: threadId,
            recipient_team: recipientTeam,
            round_number: round,
            parent_message_id: parentId,
            source_proposal_id: 'proposal-1',
            source_revision: 2,
            source_team: 'green',
            sender_team: senderTeam,
            sender_role: `${senderTeam}_scribe`,
            sent_at: `2026-08-06T12:0${round}:00.000Z`,
            message_type: messageType
        }
    };
}

describe('proposal recipient threads', () => {
    it('keeps recipient threads isolated and orders immutable rounds', () => {
        const blueRoot = message({ id: 'blue-0', threadId: 'blue-thread', recipientTeam: 'blue', round: 0, senderTeam: 'white_cell', messageType: 'proposal_forwarded', content: 'Forwarded to Blue' });
        const blueReply = message({ id: 'blue-1', threadId: 'blue-thread', recipientTeam: 'blue', round: 1, parentId: 'blue-0', senderTeam: 'blue', messageType: 'negotiation_message', content: 'Blue terms' });
        const greenReply = message({ id: 'blue-2', threadId: 'blue-thread', recipientTeam: 'blue', round: 2, parentId: 'blue-1', senderTeam: 'green', messageType: 'negotiation_message', content: 'Green answer' });
        const redRoot = message({ id: 'red-0', threadId: 'red-thread', recipientTeam: 'red', round: 0, senderTeam: 'white_cell', messageType: 'proposal_forwarded', content: 'Forwarded to Red' });

        const communications = [greenReply, redRoot, blueReply, blueRoot];
        expect(getProposalThreadForRecipient(communications, 'proposal-1', 'blue').map((entry) => entry.id))
            .toEqual(['blue-0', 'blue-1', 'blue-2']);
        expect(getProposalThreadForRecipient(communications, 'proposal-1', 'red').map((entry) => entry.id))
            .toEqual(['red-0']);
        expect(getProposalThreadStatus(getProposalThreadForRecipient(communications, 'proposal-1', 'blue')))
            .toBe(PROPOSAL_RECIPIENT_STATUSES.NEGOTIATION_UNDERWAY);
        expect(getProposalThreadStatus(getProposalThreadForRecipient(communications, 'proposal-1', 'red')))
            .toBe(PROPOSAL_RECIPIENT_STATUSES.APPROVED_FORWARDED);
    });

    it('requires every stable thread metadata field', () => {
        const complete = message({ id: 'blue-0', threadId: 'blue-thread', recipientTeam: 'blue', round: 0, senderTeam: 'white_cell', messageType: 'proposal_forwarded', content: 'Forwarded' });
        expect(getProposalThreadMetadata(complete)).toMatchObject({
            threadId: 'blue-thread',
            recipientTeam: 'blue',
            roundNumber: 0,
            parentMessageId: null,
            sourceProposalId: 'proposal-1',
            sourceRevision: 2,
            senderTeam: 'white_cell',
            senderRole: 'white_cell_scribe',
            messageType: 'proposal_forwarded'
        });
        delete complete.metadata.source_revision;
        expect(getProposalThreadMetadata(complete)).toBeNull();
    });

    it('derives closed state without overwriting earlier responses', () => {
        const root = message({ id: 'round-0', threadId: 'thread-1', recipientTeam: 'blue', round: 0, senderTeam: 'white_cell', messageType: 'proposal_forwarded', content: 'Forwarded' });
        const response = message({ id: 'round-1', threadId: 'thread-1', recipientTeam: 'blue', round: 1, parentId: 'round-0', senderTeam: 'blue', messageType: 'recipient_response', content: 'Accepted' });
        const closed = message({ id: 'round-2', threadId: 'thread-1', recipientTeam: 'blue', round: 2, parentId: 'round-1', senderTeam: 'green', messageType: 'thread_closed', content: 'Closed by agreement' });
        const thread = getProposalThreadForRecipient([closed, response, root], 'proposal-1', 'blue');

        expect(getProposalThreadStatus(thread)).toBe(PROPOSAL_RECIPIENT_STATUSES.CLOSED);
        expect(thread.map((entry) => entry.content)).toEqual(['Forwarded', 'Accepted', 'Closed by agreement']);
    });

    it('recognises current and historical negotiation shapes', () => {
        expect(isProposalNegotiationRequest(message({ id: 'round-1', threadId: 'thread-1', recipientTeam: 'blue', round: 1, parentId: 'round-0', senderTeam: 'blue', messageType: 'negotiation_message', content: 'Terms' }))).toBe(true);
        expect(isProposalNegotiationRequest({ metadata: { proposal_recipient_state: { status: 'responded', facilitator_decision: 'negotiate' } } })).toBe(true);
    });
});
