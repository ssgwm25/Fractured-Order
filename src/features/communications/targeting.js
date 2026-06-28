import { ROLE_SURFACES, getRoleDisplayName, getRoleSurfaceDisplayLabel, parseTeamRole } from '../../core/teamContext.js';

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
        recipient_role: recipientContext.recipientRole || null
    };
}

export function getWhiteCellCommunicationUpdateKind(communication = {}) {
    const metadata = communication?.metadata && typeof communication.metadata === 'object'
        ? communication.metadata
        : {};

    return metadata.content_kind || null;
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
    return isVisibleWhiteCellCommunication(
        communication,
        buildLeadRecipientSet(teamContext),
        teamContext.teamId
    );
}

export function isWhiteCellCommunicationVisibleToScribe(communication = {}, teamContext = {}) {
    return isVisibleWhiteCellCommunication(
        communication,
        buildScribeRecipientSet(teamContext),
        teamContext.teamId
    );
}

export function isWhiteCellCommunicationVisibleToNotetaker(communication = {}, teamContext = {}) {
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
    return isVisibleWhiteCellTeamEvent(
        event,
        buildLeadRecipientSet(teamContext),
        teamContext.teamId
    );
}

export function isWhiteCellTimelineEventVisibleToNotetaker(event = {}, teamContext = {}) {
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
