import { resolveArtifactWorkflowState } from '../actions/artifactLifecycle.js';
import { GREEN_DELEGATIONS } from '../../core/teamContext.js';
import {
    getProposalResponseReviewMetadata,
    getProposalThreadMetadata
} from '../actions/proposalRecipientState.js';

function text(value = '') {
    return String(value || '').trim();
}

function teamLabel(team = '') {
    const normalized = text(team).toLowerCase();
    const labels = {
        blue: 'Blue Team',
        red: 'Red Team',
        green: 'Green Team',
        industry: 'Industry Team',
        white_cell: 'White Cell',
        whitecell: 'White Cell'
    };
    return labels[normalized] || text(team) || 'Unknown source';
}

function revision(record = {}) {
    return Math.max(1, Number(record.revision_number || record.revisionNumber) || 1);
}

function artifactTitle(record = {}, fallback = 'Untitled artifact') {
    return text(record.goal || record.title || record.query || record.question) || fallback;
}

function regionalLabel(record) {
    const region = record.delegation_id || record.recipient_delegation_id;
    return GREEN_DELEGATIONS[region] ? `${GREEN_DELEGATIONS[region]}: ` : '';
}

function communicationArtifact(communication = {}) {
    const explicitTitle = text(communication.title);
    if (explicitTitle) return explicitTitle;

    const content = text(communication.content);
    if (!content) return 'Direct Facilitator / White Cell communication';
    return content.length > 140 ? `${content.slice(0, 137)}...` : content;
}

export function buildWorkflowNotificationId(family, persistedId, discriminator = '') {
    const parts = [family, persistedId, discriminator].map(text).filter(Boolean);
    return parts.length >= 2 ? parts.join(':') : '';
}

export function buildWhiteCellArtifactNotification(record = {}, {
    section = 'actions',
    artifactType = 'Artifact'
} = {}) {
    const state = resolveArtifactWorkflowState(record);
    if (!record?.id || !['submitted_to_white_cell', 'resubmitted'].includes(state)) return null;

    return {
        id: buildWorkflowNotificationId('artifact-submission', record.id, `${state}:r${revision(record)}`),
        family: 'artifact-submission',
        source: teamLabel(record.team),
        artifact: `${artifactType}: ${artifactTitle(record)}`,
        requiredAction: state === 'resubmitted'
            ? 'Review the corrected revision.'
            : 'Open and review the submission.',
        destinationLabel: `Open ${artifactType.toLowerCase()}`,
        destination: { surface: 'whitecell', section, recordId: String(record.id) },
        createdAt: text(record.submitted_at || record.updated_at || record.created_at),
        type: 'warning'
    };
}

export function buildFacilitatorArtifactReturnNotification(record = {}, {
    artifactType = 'Artifact'
} = {}) {
    const state = resolveArtifactWorkflowState(record);
    if (!record?.id || !['returned_to_team', 'returned_to_blue'].includes(state)) return null;

    return {
        id: buildWorkflowNotificationId('artifact-return', record.id, `${state}:r${revision(record)}`),
        family: 'artifact-return',
        source: 'White Cell',
        artifact: `${artifactType}: ${artifactTitle(record)}`,
        requiredAction: 'Review the return notes, revise, and resubmit.',
        destinationLabel: `Open returned ${artifactType.toLowerCase()}`,
        destination: { surface: 'facilitator', slideKey: `action-${record.id}`, recordId: String(record.id) },
        createdAt: text(record.reviewed_at || record.updated_at || record.adjudicated_at),
        type: 'warning'
    };
}

export function buildRfiWorkflowNotification(record = {}, { audience = 'facilitator' } = {}) {
    if (!record?.id) return null;
    const state = resolveArtifactWorkflowState(record);
    const recordId = String(record.id);

    if (audience === 'whitecell') {
        if (!['submitted_to_white_cell', 'resubmitted'].includes(state)) return null;
        return {
            id: buildWorkflowNotificationId('rfi-submission', recordId, `${state}:r${revision(record)}`),
            family: 'rfi-submission',
            source: GREEN_DELEGATIONS[record.delegation_id] || teamLabel(record.team),
            artifact: `${regionalLabel(record)}RFI: ${artifactTitle(record, 'Request for information')}`,
            requiredAction: 'Review the request and return it or provide an answer.',
            destinationLabel: 'Open RFI',
            destination: { surface: 'whitecell', section: 'requests', recordId },
            createdAt: text(record.submitted_at || record.updated_at || record.created_at),
            type: 'warning'
        };
    }

    if (!['returned_to_team', 'returned_to_blue', 'completed'].includes(state)) return null;
    const isReturned = state === 'returned_to_team' || state === 'returned_to_blue';
    return {
        id: buildWorkflowNotificationId(
            isReturned ? 'rfi-return' : 'rfi-answer',
            recordId,
            `${state}:r${revision(record)}:${text(record.responded_at || record.updated_at)}`
        ),
        family: isReturned ? 'rfi-return' : 'rfi-answer',
        source: 'White Cell',
        artifact: `${regionalLabel(record)}RFI: ${artifactTitle(record, 'Request for information')}`,
        requiredAction: isReturned
            ? 'Review the clarification notes, revise, and resubmit.'
            : 'Open and read the White Cell answer.',
        destinationLabel: 'Open RFI',
        destination: { surface: 'facilitator', slideKey: `rfi-${recordId}`, recordId, ...(record.delegation_id ? { delegationId: record.delegation_id } : {}) },
        createdAt: text(record.responded_at || record.updated_at || record.created_at),
        type: isReturned ? 'warning' : 'info'
    };
}

export function buildProposalRoundNotification(communication = {}, { audience = 'facilitator' } = {}) {
    const thread = getProposalThreadMetadata(communication);
    if (!communication?.id || !thread || thread.roundNumber <= 0) return null;

    const recipientLabel = teamLabel(thread.recipientTeam);
    const senderLabel = teamLabel(thread.senderTeam);
    const isFollowUp = thread.roundNumber > 1;
    const slideKey = thread.sourceTeam === thread.senderTeam
        ? `action-${thread.sourceProposalId}`
        : `proposal-${thread.threadId || communication.id}`;

    return {
        id: buildWorkflowNotificationId('proposal-round', communication.id, `round-${thread.roundNumber}`),
        family: isFollowUp ? 'proposal-follow-up' : 'proposal-response',
        source: senderLabel,
        artifact: `Proposal thread for ${recipientLabel}, round ${thread.roundNumber}`,
        requiredAction: audience === 'whitecell'
            ? 'Open the thread and monitor or facilitate the next round.'
            : 'Open the proposal thread and respond if action is required.',
        destinationLabel: 'Open proposal thread',
        destination: audience === 'whitecell'
            ? { surface: 'whitecell', section: 'proposals', recordId: String(thread.sourceProposalId), communicationId: String(communication.id) }
            : { surface: 'facilitator', slideKey, recordId: String(thread.sourceProposalId), communicationId: String(communication.id),
                ...(communication.delegation_id ? { delegationId: communication.delegation_id } : {}) },
        createdAt: text(thread.sentAt || communication.created_at),
        type: 'warning'
    };
}

export function buildProposalResponseReviewNotification(communication = {}) {
    const review = getProposalResponseReviewMetadata(communication);
    if (!review) return null;

    const sender = teamLabel(review.senderTeam);
    const responseType = review.facilitatorDecision === 'negotiate'
        ? 'Negotiation request'
        : 'Proposal response';
    return {
        id: buildWorkflowNotificationId('proposal-response-review', communication.id),
        family: 'proposal-response-review',
        source: sender,
        artifact: `${responseType}: ${artifactTitle(communication, 'Untitled proposal')}`,
        requiredAction: 'Review and forward the response to the proposing team.',
        destinationLabel: 'Review proposal response',
        destination: {
            surface: 'whitecell',
            section: 'proposals',
            recordId: String(review.sourceProposalId),
            communicationId: String(communication.id)
        },
        createdAt: review.submittedAt || communication.created_at,
        type: 'warning'
    };
}

export function buildDirectCommunicationNotification(communication = {}, { audience = 'facilitator' } = {}) {
    if (!communication?.id) return null;
    const fromWhiteCell = /^white_?cell/.test(text(communication.from_role).toLowerCase());
    if ((audience === 'facilitator' && !fromWhiteCell) || (audience === 'whitecell' && fromWhiteCell)) return null;

    return {
        id: buildWorkflowNotificationId('direct-communication', communication.id),
        family: 'direct-communication',
        source: fromWhiteCell ? 'White Cell' : teamLabel(communication.metadata?.source_team || communication.team || communication.from_role),
        artifact: regionalLabel(communication) + communicationArtifact(communication),
        requiredAction: 'Open and read the message; reply if action is required.',
        destinationLabel: 'Open communication',
        destination: audience === 'whitecell'
            ? { surface: 'whitecell', section: 'communications', recordId: String(communication.id) }
            : { surface: 'facilitator', slideKey: `communication-${communication.id}`, recordId: String(communication.id),
                ...((communication.delegation_id || communication.recipient_delegation_id) ? { delegationId: communication.delegation_id || communication.recipient_delegation_id } : {}) },
        createdAt: text(communication.created_at || communication.updated_at),
        type: 'info'
    };
}
