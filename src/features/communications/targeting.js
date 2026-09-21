import { ROLE_SURFACES, GREEN_DELEGATIONS, getRoleDisplayName, getRoleSurfaceDisplayLabel, parseTeamRole } from '../../core/teamContext.js';

export function regionalRecipientOptions(session = {}) {
    session = session.sessionData || session;
    const regional = (session.sessionTopologyVersion ?? session.session_topology_version ?? session.topology) === 2;
    if (!regional) return [];
    const shared = (session.greenSeatModel ?? session.green_seat_model) === 'shared_facilitator_v1';
    return [
        { value: 'green', label: 'Both Green delegations' },
        ...Object.entries(GREEN_DELEGATIONS).flatMap(([region, label]) => [
            { value: `green_${region}`, label },
            ...['scribe', 'notetaker', ...(!shared ? ['facilitator'] : [])].map((role) => ({
                value: `green_${region}_${role}`, label: getRoleDisplayName(`green_${region}_${role}`)
            }))
        ]),
        ...(shared ? [{ value: 'green_shared_facilitator', label: 'Shared Green Facilitator' }] : [])
    ];
}

// Rendering only. RLS and RPCs independently enforce these audiences. Persisted
// columns take precedence; role/delegation metadata cannot fall back to team.
function scopedVisibility(record, context, role) {
    const metadata = record.metadata || {};
    const scope = record.recipient_scope || metadata.recipient_scope;
    const region = record.recipient_delegation_id || metadata.recipient_delegation_id;
    if (['PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE', 'PROPOSAL_RESPONSE_REVIEW'].includes(record.type)) return null;
    const addressed = record.to_role || metadata.recipient;
    const regionalRole = parseTeamRole(addressed).delegationId && parseTeamRole(addressed).surface || addressed === 'green_shared_facilitator';
    const targetRole = metadata.recipient_role || (scope === 'role' || regionalRole ? addressed : null);
    if (metadata.recipient_role && regionalRole && metadata.recipient_role !== addressed) return false;
    if (targetRole) {
        if (context.delegationId || context.sharedFacilitator || parseTeamRole(targetRole).delegationId || targetRole === 'green_shared_facilitator') return targetRole === role;
        return null; // Retain legacy lead/scribe visibility conventions.
    }
    if (scope === 'role') return false;
    if (region || scope === 'delegation') return Object.hasOwn(GREEN_DELEGATIONS, region)
        && context.teamId === 'green' && (context.sharedFacilitator || context.delegationId === region);
    if (scope === 'both_green_delegations') return context.teamId === 'green';
    if (scope === 'session') return true;
    if (scope && !['team', 'all'].includes(scope)) return false;
    return null;
}

export const WHITE_CELL_UPDATE_KINDS = Object.freeze({
    TRIBE_STREET_JOURNAL: 'TRIBE_STREET_JOURNAL',
    VERBA_AI_POPULATION_SENTIMENT: 'VERBA_AI_POPULATION_SENTIMENT'
});

function normalizeRecipientValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function isWhiteCellSenderRole(role = '') {
    const normalizedRole = normalizeRecipientValue(role).toLowerCase();
    if (!normalizedRole) {
        return false;
    }

    if (normalizedRole === 'white_cell' || normalizedRole === 'whitecell') {
        return true;
    }

    return parseTeamRole(normalizedRole).surface === ROLE_SURFACES.WHITECELL;
}

export function resolveCommunicationRecipientContext(recipient = '') {
    const normalizedRecipient = normalizeRecipientValue(recipient);
    if (!normalizedRecipient) {
        return {
            recipient: '',
            recipientScope: null,
            recipientTeam: null,
            recipientRole: null
        };
    }

    if (normalizedRecipient === 'all') {
        return {
            recipient: normalizedRecipient,
            recipientScope: 'all',
            recipientTeam: null,
            recipientRole: null
        };
    }

    const region = normalizedRecipient.replace(/^green_/, '');
    if (Object.hasOwn(GREEN_DELEGATIONS, region)) return {
        recipient: normalizedRecipient, recipientScope: 'delegation', recipientTeam: 'green',
        recipientRole: null, recipientDelegation: region
    };

    const parsedRole = parseTeamRole(normalizedRecipient);
    if (parsedRole.teamId && parsedRole.surface) {
        return {
            recipient: normalizedRecipient,
            recipientScope: 'role',
            recipientTeam: parsedRole.teamId,
            recipientRole: normalizedRecipient
        };
    }

    return {
        recipient: normalizedRecipient,
        recipientScope: 'team',
        recipientTeam: normalizedRecipient,
        recipientRole: null
    };
}

export function buildWhiteCellRecipientMetadata(recipient = '', extraMetadata = {}) {
    const recipientContext = resolveCommunicationRecipientContext(recipient);
    return {
        ...extraMetadata,
        recipient: recipientContext.recipient || null,
        recipient_scope: recipientContext.recipientScope || null,
        recipient_team: recipientContext.recipientTeam || null,
        recipient_role: recipientContext.recipientRole || null,
        ...(recipientContext.recipientDelegation ? { recipient_delegation_id: recipientContext.recipientDelegation } : {})
    };
}

export function getWhiteCellCommunicationUpdateKind(communication = {}) {
    const metadata = communication?.metadata && typeof communication.metadata === 'object'
        ? communication.metadata
        : {};

    return metadata.content_kind || null;
}

export function isActionNotificationCommunication(communication = {}) {
    const type = String(communication?.type || '').trim().toUpperCase();
    const metadata = communication?.metadata && typeof communication.metadata === 'object'
        ? communication.metadata
        : {};

    if (type === 'ACTION_NOTIFICATION') {
        return true;
    }

    return type === 'GUIDANCE' && Boolean(metadata.shared_action_id);
}

export function isWhiteCellSectionUpdate(communication = {}, kind = null) {
    return isWhiteCellSenderRole(communication?.from_role)
        && Boolean(kind)
        && getWhiteCellCommunicationUpdateKind(communication) === kind;
}

function buildLeadRecipientSet(teamContext = {}) {
    return new Set([
        'all',
        teamContext.teamId,
        teamContext.facilitatorRole,
        teamContext.scribeRole
    ].filter(Boolean));
}

function buildScribeRecipientSet(teamContext = {}) {
    return new Set([
        'all',
        teamContext.teamId,
        teamContext.scribeRole
    ].filter(Boolean));
}

function buildNotetakerRecipientSet(teamContext = {}) {
    return new Set([
        'all',
        teamContext.teamId,
        teamContext.notetakerRole
    ].filter(Boolean));
}

export function isWhiteCellCommunicationVisibleToLead(communication = {}, teamContext = {}) {
    const scoped = scopedVisibility(communication, teamContext, teamContext.facilitatorRole);
    if (isWhiteCellSenderRole(communication.from_role) && scoped !== null) return scoped;
    return isVisibleWhiteCellCommunication(
        communication,
        buildLeadRecipientSet(teamContext),
        teamContext.teamId
    );
}

export function isWhiteCellCommunicationVisibleToScribe(communication = {}, teamContext = {}) {
    const scoped = scopedVisibility(communication, teamContext, teamContext.scribeRole);
    if (isWhiteCellSenderRole(communication.from_role) && scoped !== null) return scoped;
    return isVisibleWhiteCellCommunication(
        communication,
        buildScribeRecipientSet(teamContext),
        teamContext.teamId
    );
}

export function isWhiteCellCommunicationVisibleToNotetaker(communication = {}, teamContext = {}) {
    const scoped = scopedVisibility(communication, teamContext, teamContext.notetakerRole);
    if (isWhiteCellSenderRole(communication.from_role) && scoped !== null) return scoped;
    return isVisibleWhiteCellCommunication(
        communication,
        buildNotetakerRecipientSet(teamContext),
        teamContext.teamId
    );
}

function getCommunicationRecipientMetadata(communication = {}) {
    const metadata = communication?.metadata && typeof communication.metadata === 'object'
        ? communication.metadata
        : {};
    const explicitRecipientMetadata = {
        recipient: normalizeRecipientValue(metadata.recipient || metadata.to_role || ''),
        recipientScope: normalizeRecipientValue(metadata.recipient_scope || ''),
        recipientTeam: normalizeRecipientValue(metadata.recipient_team || ''),
        recipientRole: normalizeRecipientValue(metadata.recipient_role || '')
    };

    if (
        explicitRecipientMetadata.recipient
        || explicitRecipientMetadata.recipientScope
        || explicitRecipientMetadata.recipientTeam
        || explicitRecipientMetadata.recipientRole
    ) {
        return explicitRecipientMetadata;
    }

    const fallbackRecipientContext = resolveCommunicationRecipientContext(communication?.to_role || '');
    return {
        recipient: fallbackRecipientContext.recipient || '',
        recipientScope: fallbackRecipientContext.recipientScope || '',
        recipientTeam: fallbackRecipientContext.recipientTeam || '',
        recipientRole: fallbackRecipientContext.recipientRole || ''
    };
}

function isVisibleWhiteCellCommunication(communication = {}, recipientSet = new Set(), expectedTeamId = null) {
    if (!isWhiteCellSenderRole(communication?.from_role)) {
        return false;
    }

    const recipientMetadata = getCommunicationRecipientMetadata(communication);
    if (
        !recipientMetadata.recipient
        && !recipientMetadata.recipientScope
        && !recipientMetadata.recipientTeam
        && !recipientMetadata.recipientRole
    ) {
        return false;
    }

    if (recipientMetadata.recipientScope === 'all') {
        return recipientSet.has('all');
    }

    if (recipientMetadata.recipientScope === 'role') {
        return (
            (recipientMetadata.recipientRole && recipientSet.has(recipientMetadata.recipientRole))
            || (recipientMetadata.recipient && recipientSet.has(recipientMetadata.recipient))
        );
    }

    if (recipientMetadata.recipientScope === 'team') {
        return (
            (recipientMetadata.recipientTeam && recipientMetadata.recipientTeam === expectedTeamId)
            || (recipientMetadata.recipient && recipientSet.has(recipientMetadata.recipient))
        );
    }

    if (recipientMetadata.recipientRole) {
        return (
            recipientSet.has(recipientMetadata.recipientRole)
            || (recipientMetadata.recipient && recipientSet.has(recipientMetadata.recipient))
        );
    }

    if (recipientMetadata.recipientTeam && recipientMetadata.recipientTeam === expectedTeamId) {
        return true;
    }

    if (recipientMetadata.recipient && recipientSet.has(recipientMetadata.recipient)) {
        return true;
    }

    return false;
}

function getTimelineRecipientMetadata(event = {}) {
    const metadata = event?.metadata && typeof event.metadata === 'object'
        ? event.metadata
        : {};

    return {
        recipient: normalizeRecipientValue(metadata.recipient || metadata.to_role || ''),
        recipientScope: normalizeRecipientValue(metadata.recipient_scope || ''),
        recipientTeam: normalizeRecipientValue(metadata.recipient_team || ''),
        recipientRole: normalizeRecipientValue(metadata.recipient_role || '')
    };
}

function isVisibleWhiteCellTeamEvent(event = {}, recipientSet = new Set(), expectedTeamId = null) {
    if (event?.team !== 'white_cell') {
        return event?.team === expectedTeamId;
    }

    const recipientMetadata = getTimelineRecipientMetadata(event);
    if (
        !recipientMetadata.recipient
        && !recipientMetadata.recipientScope
        && !recipientMetadata.recipientTeam
        && !recipientMetadata.recipientRole
    ) {
        return false;
    }

    if (recipientMetadata.recipientScope === 'all') {
        return recipientSet.has('all');
    }

    if (recipientMetadata.recipientScope === 'role') {
        return (
            (recipientMetadata.recipientRole && recipientSet.has(recipientMetadata.recipientRole))
            || (recipientMetadata.recipient && recipientSet.has(recipientMetadata.recipient))
        );
    }

    if (recipientMetadata.recipientScope === 'team') {
        return (
            (recipientMetadata.recipientTeam && recipientMetadata.recipientTeam === expectedTeamId)
            || (recipientMetadata.recipient && recipientSet.has(recipientMetadata.recipient))
        );
    }

    // Legacy fallback for pre-scope events: prefer explicit role targeting over
    // broad team matching so seat-scoped events do not leak to other surfaces.
    if (recipientMetadata.recipientRole) {
        return (
            recipientSet.has(recipientMetadata.recipientRole)
            || (recipientMetadata.recipient && recipientSet.has(recipientMetadata.recipient))
        );
    }

    if (recipientMetadata.recipientTeam && recipientMetadata.recipientTeam === expectedTeamId) {
        return true;
    }

    if (recipientMetadata.recipient && recipientSet.has(recipientMetadata.recipient)) {
        return true;
    }

    return false;
}

export function isWhiteCellTimelineEventVisibleToLead(event = {}, teamContext = {}) {
    const scoped = scopedVisibility(event, teamContext, teamContext.facilitatorRole);
    if (event.team === 'white_cell' && scoped !== null) return scoped;
    return isVisibleWhiteCellTeamEvent(
        event,
        buildLeadRecipientSet(teamContext),
        teamContext.teamId
    );
}

export function isWhiteCellTimelineEventVisibleToNotetaker(event = {}, teamContext = {}) {
    const scoped = scopedVisibility(event, teamContext, teamContext.notetakerRole);
    if (event.team === 'white_cell' && scoped !== null) return scoped;
    return isVisibleWhiteCellTeamEvent(
        event,
        buildNotetakerRecipientSet(teamContext),
        teamContext.teamId
    );
}

export function getWhiteCellUpdateAudienceLabel(recipient = '', {
    teamLabel = null
} = {}) {
    const recipientContext = resolveCommunicationRecipientContext(recipient);
    if (recipientContext.recipientDelegation) return GREEN_DELEGATIONS[recipientContext.recipientDelegation];
    if (recipientContext.recipient === 'all') {
        return 'All Teams';
    }

    if (recipientContext.recipientRole) {
        const displayName = getRoleDisplayName(recipientContext.recipientRole);
        if (displayName && displayName !== recipientContext.recipientRole) {
            return displayName;
        }
    }

    return teamLabel || recipientContext.recipientTeam || recipientContext.recipient || 'Unknown audience';
}

export function isTeamCaptureTimelineEvent(event = {}) {
    const eventType = event?.type ?? event?.event_type ?? null;
    const metadata = event?.metadata && typeof event.metadata === 'object'
        ? event.metadata
        : {};

    return ['NOTE', 'MOMENT', 'QUOTE'].includes(eventType)
        && event?.team !== 'white_cell'
        && metadata.source !== 'notetaker_save';
}

export function isNotetakerScopedWhiteCellCommunication(communication = {}, teamContext = {}) {
    return isWhiteCellCommunicationVisibleToNotetaker(communication, teamContext);
}

export function getLiveRoleSurfaceLabel(role = '') {
    const parsedRole = parseTeamRole(role);
    switch (parsedRole.surface) {
        case ROLE_SURFACES.FACILITATOR:
        case ROLE_SURFACES.SCRIBE:
            return getRoleSurfaceDisplayLabel(parsedRole.surface);
        case ROLE_SURFACES.NOTETAKER:
            return getRoleSurfaceDisplayLabel(parsedRole.surface);
        default:
            return null;
    }
}
