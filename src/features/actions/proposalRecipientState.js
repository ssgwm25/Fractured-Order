/**
 * Proposal recipient approvals and append-only negotiation threads.
 *
 * A forwarded proposal is round zero. Every response or follow-up is a new
 * communication row carrying the same thread ID and the next round number.
 * Legacy mutable recipient-state metadata remains readable for historical
 * sessions, but new lifecycle state is always derived from immutable rows.
 */

export const PROPOSAL_RECIPIENT_STATUSES = Object.freeze({
    PENDING_APPROVAL: 'pending_approval',
    APPROVED_FORWARDED: 'approved_forwarded',
    RESPONSE_RECEIVED: 'response_received',
    NEGOTIATION_UNDERWAY: 'negotiation_underway',
    CLOSED: 'closed',

    // Historical values retained for pre-thread records.
    UNREAD: 'unread',
    ACKNOWLEDGED: 'acknowledged',
    RESPONDED: 'responded',
    DECLINED: 'declined',
    IGNORED: 'ignored'
});

export const PROPOSAL_THREAD_MESSAGE_TYPES = Object.freeze({
    PROPOSAL_FORWARDED: 'proposal_forwarded',
    RECIPIENT_RESPONSE: 'recipient_response',
    NEGOTIATION_MESSAGE: 'negotiation_message',
    THREAD_CLOSED: 'thread_closed'
});

const LEGACY_FINAL_STATUSES = new Set([
    PROPOSAL_RECIPIENT_STATUSES.RESPONDED,
    PROPOSAL_RECIPIENT_STATUSES.DECLINED,
    PROPOSAL_RECIPIENT_STATUSES.IGNORED
]);

function normalizeString(value = '') {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeTeam(value = '') {
    return normalizeString(value).toLowerCase();
}

function normalizeRound(value) {
    const round = Number(value);
    return Number.isInteger(round) && round >= 0 ? round : null;
}

function getCommunicationMetadata(communication = null) {
    return communication?.metadata && typeof communication.metadata === 'object'
        ? communication.metadata
        : {};
}

export function getProposalThreadMetadata(communication = null) {
    if (normalizeString(communication?.type).toUpperCase() === 'PROPOSAL_RESPONSE_REVIEW') {
        return null;
    }
    const metadata = getCommunicationMetadata(communication);
    const threadId = normalizeString(metadata.thread_id);
    const recipientTeam = normalizeTeam(metadata.recipient_team);
    const sourceProposalId = normalizeString(metadata.source_proposal_id);
    const sourceRevision = Number(metadata.source_revision);
    const roundNumber = normalizeRound(metadata.round_number);
    const senderTeam = normalizeTeam(metadata.sender_team);
    const senderRole = normalizeString(metadata.sender_role);
    const sentAt = normalizeString(metadata.sent_at || communication?.created_at);
    const messageType = normalizeString(metadata.message_type).toLowerCase();

    if (
        !threadId
        || !recipientTeam
        || !sourceProposalId
        || !Number.isInteger(sourceRevision)
        || sourceRevision < 1
        || roundNumber === null
        || !senderTeam
        || !senderRole
        || !sentAt
        || !Object.values(PROPOSAL_THREAD_MESSAGE_TYPES).includes(messageType)
    ) {
        return null;
    }

    return {
        threadId,
        recipientTeam,
        roundNumber,
        parentMessageId: normalizeString(metadata.parent_message_id) || null,
        sourceProposalId,
        sourceRevision,
        sourceTeam: normalizeTeam(metadata.source_team),
        senderTeam,
        senderRole,
        sentAt,
        messageType,
        facilitatorDecision: normalizeString(metadata.facilitator_decision).toLowerCase() || null,
        clientMessageId: normalizeString(metadata.client_message_id) || null,
        reviewRequestId: normalizeString(metadata.review_request_id) || null
    };
}

export function getProposalResponseReviewMetadata(communication = null) {
    if (normalizeString(communication?.type).toUpperCase() !== 'PROPOSAL_RESPONSE_REVIEW') return null;

    const metadata = getCommunicationMetadata(communication);
    const review = {
        threadId: normalizeString(metadata.thread_id),
        recipientTeam: normalizeTeam(metadata.recipient_team),
        sourceProposalId: normalizeString(metadata.source_proposal_id),
        sourceRevision: Number(metadata.source_revision),
        sourceTeam: normalizeTeam(metadata.source_team),
        parentMessageId: normalizeString(metadata.parent_message_id),
        proposedRoundNumber: normalizeRound(metadata.proposed_round_number),
        senderTeam: normalizeTeam(metadata.sender_team),
        senderRole: normalizeString(metadata.sender_role),
        proposedMessageType: normalizeString(metadata.proposed_message_type).toLowerCase(),
        facilitatorDecision: normalizeString(metadata.facilitator_decision).toLowerCase() || null,
        clientMessageId: normalizeString(metadata.client_message_id) || null,
        submittedAt: normalizeString(metadata.submitted_at || communication.created_at)
    };

    if (
        !communication?.id
        || !review.threadId
        || !review.recipientTeam
        || !review.sourceProposalId
        || !Number.isInteger(review.sourceRevision)
        || review.sourceRevision < 1
        || !review.parentMessageId
        || review.proposedRoundNumber === null
        || !review.senderTeam
        || !review.senderRole
        || !Object.values(PROPOSAL_THREAD_MESSAGE_TYPES).includes(review.proposedMessageType)
    ) return null;

    return review;
}

export function getPendingProposalResponseReviews(communications = [], sourceProposalId = '') {
    const normalizedProposalId = normalizeString(sourceProposalId);
    if (!normalizedProposalId || !Array.isArray(communications)) return [];

    const forwardedReviewIds = new Set(communications
        .map((communication) => getProposalThreadMetadata(communication)?.reviewRequestId)
        .filter(Boolean));

    return communications
        .filter((communication) => {
            const review = getProposalResponseReviewMetadata(communication);
            return review
                && review.sourceProposalId === normalizedProposalId
                && !forwardedReviewIds.has(String(communication.id));
        })
        .sort((left, right) => (
            new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime()
            || String(left.id).localeCompare(String(right.id))
        ));
}

export function isProposalThreadMessage(communication = null) {
    return Boolean(getProposalThreadMetadata(communication));
}

export function getProposalThreadMessageKey(communication = null) {
    const thread = getProposalThreadMetadata(communication);
    return thread
        ? `${thread.threadId}:${thread.recipientTeam}:${thread.roundNumber}`
        : null;
}

export function getProposalThreadMessages(communications = [], threadId = '') {
    const normalizedThreadId = normalizeString(threadId);
    if (!normalizedThreadId || !Array.isArray(communications)) return [];

    const byRound = new Map();
    communications.forEach((communication) => {
        const thread = getProposalThreadMetadata(communication);
        if (!thread || thread.threadId !== normalizedThreadId) return;

        const existing = byRound.get(thread.roundNumber);
        if (!existing || String(communication.id || '').localeCompare(String(existing.id || '')) < 0) {
            byRound.set(thread.roundNumber, communication);
        }
    });

    return Array.from(byRound.values()).sort((left, right) => {
        const leftThread = getProposalThreadMetadata(left);
        const rightThread = getProposalThreadMetadata(right);
        return leftThread.roundNumber - rightThread.roundNumber
            || String(left.id || '').localeCompare(String(right.id || ''));
    });
}

export function getProposalThreadForRecipient(
    communications = [],
    sourceProposalId = '',
    recipientTeam = ''
) {
    const normalizedProposalId = normalizeString(sourceProposalId);
    const normalizedRecipient = normalizeTeam(recipientTeam);
    if (!normalizedProposalId || !normalizedRecipient) return [];

    const root = (communications || []).find((communication) => {
        const thread = getProposalThreadMetadata(communication);
        return thread
            && thread.sourceProposalId === normalizedProposalId
            && thread.recipientTeam === normalizedRecipient
            && thread.roundNumber === 0;
    });

    const threadId = getProposalThreadMetadata(root)?.threadId;
    return threadId ? getProposalThreadMessages(communications, threadId) : [];
}

export function getProposalThreadsForProposal(communications = [], sourceProposalId = '') {
    const normalizedProposalId = normalizeString(sourceProposalId);
    if (!normalizedProposalId) return [];

    return (communications || [])
        .filter((communication) => {
            const thread = getProposalThreadMetadata(communication);
            return thread?.sourceProposalId === normalizedProposalId && thread.roundNumber === 0;
        })
        .map((root) => getProposalThreadMessages(
            communications,
            getProposalThreadMetadata(root).threadId
        ))
        .filter((thread) => thread.length)
        .sort((left, right) => (
            getProposalThreadMetadata(left[0]).recipientTeam
                .localeCompare(getProposalThreadMetadata(right[0]).recipientTeam)
        ));
}

export function getProposalThreadStatus(messages = []) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return PROPOSAL_RECIPIENT_STATUSES.PENDING_APPROVAL;
    }

    const ordered = getProposalThreadMessages(
        messages,
        getProposalThreadMetadata(messages[0])?.threadId || ''
    );
    const latestMetadata = getProposalThreadMetadata(ordered.at(-1));
    if (!latestMetadata) return PROPOSAL_RECIPIENT_STATUSES.PENDING_APPROVAL;

    if (latestMetadata.messageType === PROPOSAL_THREAD_MESSAGE_TYPES.THREAD_CLOSED) {
        return PROPOSAL_RECIPIENT_STATUSES.CLOSED;
    }
    if (ordered.some((message) => (
        getProposalThreadMetadata(message)?.messageType
            === PROPOSAL_THREAD_MESSAGE_TYPES.NEGOTIATION_MESSAGE
    ))) {
        return PROPOSAL_RECIPIENT_STATUSES.NEGOTIATION_UNDERWAY;
    }
    if (latestMetadata.roundNumber > 0) {
        return PROPOSAL_RECIPIENT_STATUSES.RESPONSE_RECEIVED;
    }
    return PROPOSAL_RECIPIENT_STATUSES.APPROVED_FORWARDED;
}

export function getLatestProposalThreadMessage(messages = []) {
    if (!Array.isArray(messages) || messages.length === 0) return null;
    const threadId = getProposalThreadMetadata(messages[0])?.threadId || '';
    return getProposalThreadMessages(messages, threadId).at(-1) || null;
}

export function isProposalNegotiationRequest(communication = null) {
    const thread = getProposalThreadMetadata(communication);
    if (thread) {
        return thread.messageType === PROPOSAL_THREAD_MESSAGE_TYPES.NEGOTIATION_MESSAGE
            || thread.facilitatorDecision === 'negotiate';
    }

    const metadata = getCommunicationMetadata(communication);
    const recipientState = metadata.proposal_recipient_state
        && typeof metadata.proposal_recipient_state === 'object'
        ? metadata.proposal_recipient_state
        : {};
    const decision = metadata.facilitator_decision || recipientState.facilitator_decision || '';
    return normalizeString(decision).toLowerCase() === 'negotiate';
}

function normalizeProposalRecipientEntry(entry = null) {
    if (!entry || typeof entry !== 'object') return null;
    const status = normalizeString(entry.status).toLowerCase();
    if (!status || !Object.values(PROPOSAL_RECIPIENT_STATUSES).includes(status)) return null;
    return { ...entry, status };
}

// Historical mutable-row compatibility helpers.
export function getProposalRecipientEntry(communication = null) {
    return normalizeProposalRecipientEntry(getCommunicationMetadata(communication).proposal_recipient_state);
}

export function getProposalRecipientStatus(communication = null) {
    const thread = getProposalThreadMetadata(communication);
    if (thread?.roundNumber === 0) return PROPOSAL_RECIPIENT_STATUSES.APPROVED_FORWARDED;
    return getProposalRecipientEntry(communication)?.status || PROPOSAL_RECIPIENT_STATUSES.UNREAD;
}

export function countUnreadProposals(communications = []) {
    if (!Array.isArray(communications)) return 0;
    return communications.reduce((count, communication) => (
        getProposalRecipientStatus(communication) === PROPOSAL_RECIPIENT_STATUSES.UNREAD
            ? count + 1
            : count
    ), 0);
}

export function isProposalActioned(communication = null) {
    return getProposalRecipientStatus(communication) !== PROPOSAL_RECIPIENT_STATUSES.UNREAD;
}

export function isProposalRecipientFinal(communication = null) {
    const thread = getProposalThreadMetadata(communication);
    if (thread) return thread.messageType === PROPOSAL_THREAD_MESSAGE_TYPES.THREAD_CLOSED;
    return LEGACY_FINAL_STATUSES.has(getProposalRecipientStatus(communication));
}

export function getProposalResponseEntry(communication = null) {
    const thread = getProposalThreadMetadata(communication);
    if (thread && thread.roundNumber > 0) {
        return {
            responseContent: normalizeString(communication.content) || null,
            responseFromRole: thread.senderRole,
            responseFromTeam: thread.senderTeam,
            responseSentAt: thread.sentAt
        };
    }

    const entry = getProposalRecipientEntry(communication);
    if (!entry || entry.status !== PROPOSAL_RECIPIENT_STATUSES.RESPONDED) return null;
    return {
        responseContent: normalizeString(entry.response_content) || null,
        responseFromRole: normalizeString(entry.response_from_role) || null,
        responseFromTeam: normalizeTeam(entry.response_from_team) || null,
        responseSentAt: entry.response_sent_at || entry.responded_at || entry.actioned_at || null
    };
}

export function formatProposalRecipientStatus(status) {
    switch (status) {
        case PROPOSAL_RECIPIENT_STATUSES.PENDING_APPROVAL:       return 'Pending approval';
        case PROPOSAL_RECIPIENT_STATUSES.APPROVED_FORWARDED:    return 'Approved / forwarded';
        case PROPOSAL_RECIPIENT_STATUSES.RESPONSE_RECEIVED:     return 'Response received';
        case PROPOSAL_RECIPIENT_STATUSES.NEGOTIATION_UNDERWAY:  return 'Negotiation underway';
        case PROPOSAL_RECIPIENT_STATUSES.CLOSED:                return 'Closed';
        case PROPOSAL_RECIPIENT_STATUSES.ACKNOWLEDGED:          return 'Acknowledged';
        case PROPOSAL_RECIPIENT_STATUSES.RESPONDED:             return 'Responded';
        case PROPOSAL_RECIPIENT_STATUSES.DECLINED:              return 'Declined';
        case PROPOSAL_RECIPIENT_STATUSES.IGNORED:               return 'Ignored';
        case PROPOSAL_RECIPIENT_STATUSES.UNREAD:
        default:                                                return 'Unread';
    }
}
