/**
 * Proposal Recipient State
 *
 * Shared backend-backed record of what a recipient has done with each
 * forwarded proposal communication. The canonical state is stored in the
 * communication metadata so every seat sees the same chip state.
 */

export const PROPOSAL_RECIPIENT_STATUSES = Object.freeze({
    UNREAD: 'unread',
    ACKNOWLEDGED: 'acknowledged',
    RESPONDED: 'responded',
    DECLINED: 'declined',
    IGNORED: 'ignored'
});

const ACTIONED_STATUSES = new Set([
    PROPOSAL_RECIPIENT_STATUSES.ACKNOWLEDGED,
    PROPOSAL_RECIPIENT_STATUSES.RESPONDED,
    PROPOSAL_RECIPIENT_STATUSES.DECLINED,
    PROPOSAL_RECIPIENT_STATUSES.IGNORED
]);

const FINAL_STATUSES = new Set([
    PROPOSAL_RECIPIENT_STATUSES.RESPONDED,
    PROPOSAL_RECIPIENT_STATUSES.DECLINED,
    PROPOSAL_RECIPIENT_STATUSES.IGNORED
]);

function getCommunicationMetadata(communication = null) {
    return communication?.metadata && typeof communication.metadata === 'object'
        ? communication.metadata
        : {};
}

function normalizeProposalRecipientEntry(entry = null) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const status = typeof entry.status === 'string'
        ? entry.status.trim().toLowerCase()
        : '';
    if (!status || !Object.values(PROPOSAL_RECIPIENT_STATUSES).includes(status)) {
        return null;
    }

    return {
        ...entry,
        status
    };
}

export function getProposalRecipientEntry(communication = null) {
    return normalizeProposalRecipientEntry(getCommunicationMetadata(communication).proposal_recipient_state);
}

export function getProposalRecipientStatus(communication = null) {
    return getProposalRecipientEntry(communication)?.status
        || PROPOSAL_RECIPIENT_STATUSES.UNREAD;
}

export function countUnreadProposals(communications = []) {
    if (!Array.isArray(communications) || communications.length === 0) return 0;
    return communications.reduce((count, communication) => {
        const status = getProposalRecipientStatus(communication);
        return status === PROPOSAL_RECIPIENT_STATUSES.UNREAD ? count + 1 : count;
    }, 0);
}

export function isProposalActioned(communication = null) {
    const status = getProposalRecipientStatus(communication);
    return ACTIONED_STATUSES.has(status);
}

export function isProposalRecipientFinal(communication = null) {
    const status = getProposalRecipientStatus(communication);
    return FINAL_STATUSES.has(status);
}

export function getProposalResponseEntry(communication = null) {
    const entry = getProposalRecipientEntry(communication);
    if (!entry || entry.status !== PROPOSAL_RECIPIENT_STATUSES.RESPONDED) {
        return null;
    }

    const responseContent = typeof entry.response_content === 'string'
        ? entry.response_content.trim()
        : '';
    const responseFromRole = typeof entry.response_from_role === 'string'
        ? entry.response_from_role.trim()
        : '';
    const responseFromTeam = typeof entry.response_from_team === 'string'
        ? entry.response_from_team.trim().toLowerCase()
        : '';
    const responseSentAt = entry.response_sent_at || entry.responded_at || entry.actioned_at || null;

    return {
        responseContent: responseContent || null,
        responseFromRole: responseFromRole || null,
        responseFromTeam: responseFromTeam || null,
        responseSentAt
    };
}

export function formatProposalRecipientStatus(status) {
    switch (status) {
        case PROPOSAL_RECIPIENT_STATUSES.ACKNOWLEDGED: return 'Acknowledged';
        case PROPOSAL_RECIPIENT_STATUSES.RESPONDED:    return 'Responded';
        case PROPOSAL_RECIPIENT_STATUSES.DECLINED:     return 'Declined';
        case PROPOSAL_RECIPIENT_STATUSES.IGNORED:      return 'Ignored';
        case PROPOSAL_RECIPIENT_STATUSES.UNREAD:
        default:                                        return 'Unread';
    }
}
