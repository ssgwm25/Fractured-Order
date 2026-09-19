import { buildAppPath, getCurrentAppRelativePath } from './navigation.js';

/**
 * Team and role surface helpers
 * Centralizes the shipped multi-team routing contract.
 */

export const ROLE_SURFACES = Object.freeze({
    FACILITATOR: 'facilitator',
    SCRIBE: 'scribe',
    NOTETAKER: 'notetaker',
    WHITECELL: 'whitecell',
    VIEWER: 'viewer'
});

export const WHITE_CELL_OPERATOR_ROLES = Object.freeze({
    LEAD: 'lead',
    SUPPORT: 'support'
});

export const PUBLIC_ROLE_SURFACES = Object.freeze([
    ROLE_SURFACES.FACILITATOR,
    ROLE_SURFACES.SCRIBE,
    ROLE_SURFACES.NOTETAKER,
]);

export const ROLE_SURFACE_DISPLAY_LABELS = Object.freeze({
    [ROLE_SURFACES.FACILITATOR]: 'Scribe',
    [ROLE_SURFACES.SCRIBE]: 'Facilitator',
    [ROLE_SURFACES.NOTETAKER]: 'Notetaker',
    [ROLE_SURFACES.WHITECELL]: 'White Cell',
    [ROLE_SURFACES.VIEWER]: 'Observer'
});

export const ROLE_SURFACE_SEMANTICS = Object.freeze({
    [ROLE_SURFACES.FACILITATOR]: ROLE_SURFACES.SCRIBE,
    [ROLE_SURFACES.SCRIBE]: ROLE_SURFACES.FACILITATOR,
    [ROLE_SURFACES.NOTETAKER]: ROLE_SURFACES.NOTETAKER,
    [ROLE_SURFACES.WHITECELL]: ROLE_SURFACES.WHITECELL,
    [ROLE_SURFACES.VIEWER]: ROLE_SURFACES.VIEWER
});

export const OPERATOR_SURFACES = Object.freeze({
    GAME_MASTER: 'gamemaster',
    WHITE_CELL: ROLE_SURFACES.WHITECELL,
    SME: 'sme'
});

export const SME_ROLES = Object.freeze({
    ECON: 'econ',
    NI_ESCALATION: 'ni_escalation',
    DIPLOMACY_INFORMATION: 'diplomacy_information',
    TSJ: 'tsj',
    VERBA: 'verba'
});

export const SME_ROLE_DISPLAY_LABELS = Object.freeze({
    [SME_ROLES.ECON]: 'Econ SME',
    [SME_ROLES.NI_ESCALATION]: 'NI/Escalation SME',
    [SME_ROLES.DIPLOMACY_INFORMATION]: 'Diplomacy & Information SME',
    [SME_ROLES.TSJ]: 'TSJ (Tribe Street Journal)',
    [SME_ROLES.VERBA]: 'Verba AI SME'
});

const SME_ROLE_VALUES = Object.freeze(Object.values(SME_ROLES));
const SME_OPERATOR_ROLE_REGEX = new RegExp(
    `^sme_(${SME_ROLE_VALUES.join('|')})$`
);

export const TEAM_OPTIONS = Object.freeze([
    { id: 'blue', label: 'Blue Team', shortLabel: 'Blue' },
    { id: 'red', label: 'Red Team', shortLabel: 'Red' },
    { id: 'green', label: 'Green Team', shortLabel: 'Green' },
    { id: 'industry', label: 'Industry Team', shortLabel: 'Industry' }
]);

const WHITE_CELL_CANONICAL_ROUTE = 'whitecell.html';
const SME_CANONICAL_ROUTE = 'sme.html';

const WHITE_CELL_TEAM_CONFIG = Object.freeze({
    id: 'white_cell',
    label: 'White Cell',
    shortLabel: 'White Cell'
});

const SME_TEAM_CONFIG = Object.freeze({
    id: 'sme',
    label: 'SME',
    shortLabel: 'SME'
});

const TEAM_MAP = Object.freeze(
    Object.fromEntries(TEAM_OPTIONS.map((team) => [team.id, team]))
);
const PUBLIC_TEAM_PATTERN = TEAM_OPTIONS.map((team) => team.id).join('|');
const PUBLIC_TEAM_ROLE_REGEX = new RegExp(`^(${PUBLIC_TEAM_PATTERN})_(facilitator|scribe|notetaker)$`);
export const GREEN_DELEGATIONS = Object.freeze({
    asian_pacific: 'Green - Asia-Pacific',
    europe: 'Green - Europe'
});
export const SHARED_GREEN_FACILITATOR = 'green_shared_facilitator';
export const SHARED_GREEN_MODEL = 'shared_facilitator_v1';

// Only confirmed server responses supply this discriminator. Missing fields on
// old responses retain the old model; they never enable a shared seat.
export function getGreenSeatModel(session) {
    const topology = session?.session_topology_version;
    const model = session?.green_seat_model
        ?? (topology === 2 ? 'regional_pairs_v1' : 'unified_v1');
    if (![1, 2].includes(topology)
        || (topology === 1 && model !== 'unified_v1')
        || (topology === 2 && !['regional_pairs_v1', SHARED_GREEN_MODEL].includes(model))) {
        throw new Error('Session seat model unavailable. Ask the operator to verify GC-04A setup.');
    }
    return model;
}

export function buildGreenJoinRole(session, delegationId, surface) {
    const model = getGreenSeatModel(session);
    if (model === 'unified_v1') return buildTeamRole('green', surface);
    if (model === SHARED_GREEN_MODEL && surface === ROLE_SURFACES.SCRIBE) return SHARED_GREEN_FACILITATOR;
    return buildRegionalRole(delegationId, surface);
}
const REGIONAL_ROLE_REGEX = /^green_(asian_pacific|europe)_(scribe|facilitator|notetaker)$/;

export function buildRegionalRole(delegationId, surface) {
    if (!GREEN_DELEGATIONS[delegationId] || !isPublicRoleSurface(surface)) return null;
    return `green_${delegationId}_${getSemanticRoleSurface(surface)}`;
}
const TEAM_ROUTE_REGEX = new RegExp(`^teams\\/(${PUBLIC_TEAM_PATTERN})\\/`);
const WHITE_CELL_OPERATOR_ROLE_REGEX = new RegExp(
    `^(?:(${PUBLIC_TEAM_PATTERN})_)?whitecell(?:_(lead|support))?$`
);

export function getTeamConfig(teamId = 'blue') {
    if (teamId === 'white_cell') {
        return WHITE_CELL_TEAM_CONFIG;
    }
    if (teamId === 'sme') {
        return SME_TEAM_CONFIG;
    }
    return TEAM_MAP[teamId] || TEAM_MAP.blue;
}

export function normalizeSmeOperatorRole(smeRole = '') {
    const normalized = String(smeRole || '').trim().toLowerCase().replace(/[^a-z_]+/g, '');
    return SME_ROLE_VALUES.includes(normalized) ? normalized : null;
}

export function buildSmeOperatorRole(smeRole = SME_ROLES.ECON) {
    const normalized = normalizeSmeOperatorRole(smeRole) || SME_ROLES.ECON;
    return `sme_${normalized}`;
}

export function isSmeOperatorRole(role = '') {
    return SME_OPERATOR_ROLE_REGEX.test(String(role || '').trim().toLowerCase());
}

export function getSmeRoleDisplayLabel(smeRole = '') {
    const normalized = normalizeSmeOperatorRole(smeRole);
    return (normalized && SME_ROLE_DISPLAY_LABELS[normalized]) || smeRole || '';
}

export function isSupportedTeam(teamId) {
    return Boolean(TEAM_MAP[teamId]);
}

export function isPublicRoleSurface(surface = '') {
    return PUBLIC_ROLE_SURFACES.includes(surface);
}

export function isOperatorSurface(surface = '') {
    return Object.values(OPERATOR_SURFACES).includes(surface);
}

export function getRoleSurfaceDisplayLabel(surface = '') {
    return ROLE_SURFACE_DISPLAY_LABELS[surface] || surface || '';
}

export function getSemanticRoleSurface(surface = '') {
    return ROLE_SURFACE_SEMANTICS[surface] || surface || null;
}

export function buildTeamRole(teamId, surface) {
    if (surface === ROLE_SURFACES.VIEWER) {
        return 'viewer';
    }

    if (surface === ROLE_SURFACES.WHITECELL) {
        return buildWhiteCellOperatorRole(WHITE_CELL_OPERATOR_ROLES.LEAD);
    }

    const team = getTeamConfig(teamId);
    return `${team.id}_${surface}`;
}

function normalizeWhiteCellOperatorRoleName(operatorRole = WHITE_CELL_OPERATOR_ROLES.LEAD) {
    return operatorRole === WHITE_CELL_OPERATOR_ROLES.SUPPORT
        ? WHITE_CELL_OPERATOR_ROLES.SUPPORT
        : WHITE_CELL_OPERATOR_ROLES.LEAD;
}

export function buildWhiteCellOperatorRole(teamIdOrOperatorRole = WHITE_CELL_OPERATOR_ROLES.LEAD, operatorRole = null) {
    const normalizedOperatorRole = normalizeWhiteCellOperatorRoleName(
        operatorRole === null ? teamIdOrOperatorRole : operatorRole
    );

    return `${ROLE_SURFACES.WHITECELL}_${normalizedOperatorRole}`;
}

export function isWhiteCellOperatorRole(role = '') {
    return WHITE_CELL_OPERATOR_ROLE_REGEX.test(role);
}

export function normalizeWhiteCellOperatorRole(role = '') {
    if (typeof role !== 'string') {
        return role ?? null;
    }

    const normalizedRole = role.trim();
    const match = normalizedRole.match(WHITE_CELL_OPERATOR_ROLE_REGEX);
    if (!match) {
        return role;
    }

    return buildWhiteCellOperatorRole(match[2] || WHITE_CELL_OPERATOR_ROLES.LEAD);
}

export function parseTeamRole(role = '') {
    if (typeof role !== 'string') {
        return {
            teamId: null,
            surface: null,
            operatorRole: null,
            smeRole: null
        };
    }

    const normalizedRole = normalizeWhiteCellOperatorRole(role);
    if (normalizedRole === SHARED_GREEN_FACILITATOR) {
        return { teamId: 'green', delegationId: null, semanticRole: 'facilitator',
            surface: ROLE_SURFACES.SCRIBE, operatorRole: null, smeRole: null, sharedFacilitator: true };
    }
    const regional = normalizedRole.match(REGIONAL_ROLE_REGEX);
    if (regional) {
        return {
            teamId: 'green', delegationId: regional[1], semanticRole: regional[2],
            surface: getSemanticRoleSurface(regional[2]), operatorRole: null, smeRole: null
        };
    }

    if (normalizedRole === 'viewer') {
        return {
            teamId: null,
            surface: ROLE_SURFACES.VIEWER,
            operatorRole: null,
            smeRole: null
        };
    }

    if (
        normalizedRole === buildWhiteCellOperatorRole(WHITE_CELL_OPERATOR_ROLES.LEAD)
        || normalizedRole === buildWhiteCellOperatorRole(WHITE_CELL_OPERATOR_ROLES.SUPPORT)
    ) {
        return {
            teamId: null,
            surface: ROLE_SURFACES.WHITECELL,
            operatorRole: normalizedRole === buildWhiteCellOperatorRole(WHITE_CELL_OPERATOR_ROLES.SUPPORT)
                ? WHITE_CELL_OPERATOR_ROLES.SUPPORT
                : WHITE_CELL_OPERATOR_ROLES.LEAD,
            smeRole: null
        };
    }

    const smeMatch = String(normalizedRole || '').trim().toLowerCase().match(SME_OPERATOR_ROLE_REGEX);
    if (smeMatch) {
        return {
            teamId: 'sme',
            surface: OPERATOR_SURFACES.SME,
            operatorRole: null,
            smeRole: smeMatch[1]
        };
    }

    const match = normalizedRole.match(PUBLIC_TEAM_ROLE_REGEX);
    if (!match) {
        return {
            teamId: null,
            surface: null,
            operatorRole: null,
            smeRole: null
        };
    }

    return {
        teamId: match[1],
        surface: match[2],
        operatorRole: null,
        smeRole: null
    };
}

export function getTeamRoleLabels(teamId) {
    const team = getTeamConfig(teamId);

    return {
        team: team.label,
        facilitator: `${team.label} ${getRoleSurfaceDisplayLabel(ROLE_SURFACES.FACILITATOR)}`,
        scribe: `${team.label} ${getRoleSurfaceDisplayLabel(ROLE_SURFACES.SCRIBE)}`,
        notetaker: `${team.label} ${getRoleSurfaceDisplayLabel(ROLE_SURFACES.NOTETAKER)}`,
        whitecell: `${team.label} White Cell`,
        whitecellLead: `${team.label} White Cell Lead`,
        whitecellSupport: `${team.label} White Cell Support`,
        observer: `${team.label} Observer`
    };
}

export function buildTeamRoute(teamId, surface, { observer = false, basePath } = {}) {
    if (surface === ROLE_SURFACES.WHITECELL) {
        return buildAppPath(WHITE_CELL_CANONICAL_ROUTE, { basePath });
    }

    const team = getTeamConfig(teamId);
    const pageSurface = surface === ROLE_SURFACES.VIEWER
        ? ROLE_SURFACES.FACILITATOR
        : surface;

    const route = buildAppPath(`teams/${team.id}/${pageSurface}.html`, { basePath });
    return observer ? `${route}?mode=observer` : route;
}

export function getRoleRoute(role, { observerTeamId = 'blue', basePath } = {}) {
    if (role === 'viewer') {
        return buildTeamRoute(observerTeamId, ROLE_SURFACES.FACILITATOR, { observer: true, basePath });
    }

    const parsedRole = parseTeamRole(role);
    if (parsedRole.surface === ROLE_SURFACES.WHITECELL) {
        return buildAppPath(WHITE_CELL_CANONICAL_ROUTE, { basePath });
    }

    if (parsedRole.surface === OPERATOR_SURFACES.SME) {
        return buildAppPath(SME_CANONICAL_ROUTE, { basePath });
    }

    if (!parsedRole.teamId || !parsedRole.surface) {
        return null;
    }

    const route = buildTeamRoute(parsedRole.teamId, parsedRole.surface, { basePath });
    return parsedRole.delegationId ? `${route}?delegation=${parsedRole.delegationId}` : route;
}

export function getRoleDisplayName(role, { observerTeamId = null } = {}) {
    if (role === SHARED_GREEN_FACILITATOR) return 'Green Shared Facilitator — Asia-Pacific and Europe';
    const regional = parseTeamRole(role);
    if (regional.delegationId) {
        return `${GREEN_DELEGATIONS[regional.delegationId]} ${getRoleSurfaceDisplayLabel(regional.surface)}`;
    }
    if (role === 'white') {
        return 'Game Master';
    }

    if (role === 'viewer') {
        return observerTeamId ? `${getTeamConfig(observerTeamId).label} Observer` : 'Observer';
    }

    const parsedRole = parseTeamRole(role);
    if (parsedRole.surface === ROLE_SURFACES.WHITECELL) {
        return parsedRole.operatorRole === WHITE_CELL_OPERATOR_ROLES.SUPPORT
            ? 'White Cell Support'
            : 'White Cell Lead';
    }

    if (parsedRole.surface === OPERATOR_SURFACES.SME) {
        return getSmeRoleDisplayLabel(parsedRole.smeRole);
    }

    if (!parsedRole.teamId || !parsedRole.surface) {
        return role || '';
    }

    return getTeamRoleLabels(parsedRole.teamId)[parsedRole.surface] || role;
}

export function getTeamResponseTargets(teamId) {
    return new Set([
        'all',
        teamId,
        buildTeamRole(teamId, ROLE_SURFACES.FACILITATOR),
        buildTeamRole(teamId, ROLE_SURFACES.SCRIBE)
    ]);
}

export function resolveTeamContext({
    documentRef = typeof document !== 'undefined' ? document : null,
    locationRef = typeof window !== 'undefined' ? window.location : null,
    fallbackTeamId = 'blue',
    seat = null,
    basePath
} = {}) {
    const datasetTeam = documentRef?.body?.dataset?.team;
    const relativePath = getCurrentAppRelativePath({ locationRef, basePath });
    const onWhiteCellRoute = relativePath.replace(/^\//, '') === WHITE_CELL_CANONICAL_ROUTE
        || relativePath.endsWith('/' + WHITE_CELL_CANONICAL_ROUTE);
    const onSmeRoute = relativePath.replace(/^\//, '') === SME_CANONICAL_ROUTE
        || relativePath.endsWith('/' + SME_CANONICAL_ROUTE);
    const routeTeam = relativePath.match(TEAM_ROUTE_REGEX)?.[1];
    const resolvedTeamId = datasetTeam === 'white_cell' || onWhiteCellRoute
        ? 'white_cell'
        : (datasetTeam === 'sme' || onSmeRoute
            ? 'sme'
            : (datasetTeam || routeTeam || fallbackTeamId));
    const team = getTeamConfig(resolvedTeamId);
    const labels = getTeamRoleLabels(team.id);
    const whitecellLeadRole = buildWhiteCellOperatorRole(WHITE_CELL_OPERATOR_ROLES.LEAD);
    const whitecellSupportRole = buildWhiteCellOperatorRole(WHITE_CELL_OPERATOR_ROLES.SUPPORT);

    if (seat?.role === SHARED_GREEN_FACILITATOR) {
        if (team.id !== 'green' || seat.greenSeatModel !== SHARED_GREEN_MODEL) {
            throw new Error('Route does not match the confirmed shared Facilitator seat.');
        }
        return {
            teamId: 'green', delegationId: null, sharedFacilitator: true,
            teamLabel: 'Green — Asia-Pacific and Europe', teamShortLabel: 'Green — both regions',
            facilitatorRole: null, facilitatorRoute: null, facilitatorLabel: 'Regional Scribes',
            scribeRole: SHARED_GREEN_FACILITATOR, scribeLabel: getRoleDisplayName(SHARED_GREEN_FACILITATOR),
            scribeRoute: getRoleRoute(SHARED_GREEN_FACILITATOR, { basePath }),
            notetakerRole: null, notetakerRoute: null, notetakerLabel: 'Regional Notetakers',
            whitecellRole: whitecellLeadRole, whitecellLeadRole, whitecellSupportRole,
            whitecellLabel: 'White Cell', whitecellLeadLabel: 'White Cell Lead', whitecellSupportLabel: 'White Cell Support',
            whitecellRoute: buildAppPath(WHITE_CELL_CANONICAL_ROUTE, { basePath })
        };
    }
    if (seat?.delegationId) {
        if (team.id !== 'green' || !GREEN_DELEGATIONS[seat.delegationId]) {
            throw new Error('Route does not match the confirmed delegation.');
        }
        const label = GREEN_DELEGATIONS[seat.delegationId];
        const roleFor = (surface) => surface === 'scribe' && seat.greenSeatModel === SHARED_GREEN_MODEL
            ? SHARED_GREEN_FACILITATOR : buildRegionalRole(seat.delegationId, surface);
        return {
            teamId: 'green', delegationId: seat.delegationId, teamLabel: label, teamShortLabel: label,
            facilitatorRole: roleFor('facilitator'), scribeRole: roleFor('scribe'), notetakerRole: roleFor('notetaker'),
            facilitatorLabel: `${label} Scribe`, scribeLabel: getRoleDisplayName(roleFor('scribe')), notetakerLabel: `${label} Notetaker`,
            facilitatorRoute: getRoleRoute(roleFor('facilitator'), { basePath }),
            scribeRoute: getRoleRoute(roleFor('scribe'), { basePath }),
            notetakerRoute: getRoleRoute(roleFor('notetaker'), { basePath }),
            whitecellRole: whitecellLeadRole, whitecellLeadRole, whitecellSupportRole,
            whitecellLabel: 'White Cell', whitecellLeadLabel: 'White Cell Lead', whitecellSupportLabel: 'White Cell Support',
            whitecellRoute: buildAppPath(WHITE_CELL_CANONICAL_ROUTE, { basePath })
        };
    }

    return {
        teamId: team.id,
        teamLabel: team.label,
        teamShortLabel: team.shortLabel,
        facilitatorRole: buildTeamRole(team.id, ROLE_SURFACES.FACILITATOR),
        scribeRole: buildTeamRole(team.id, ROLE_SURFACES.SCRIBE),
        notetakerRole: buildTeamRole(team.id, ROLE_SURFACES.NOTETAKER),
        whitecellRole: whitecellLeadRole,
        whitecellLeadRole,
        whitecellSupportRole,
        observerRole: 'viewer',
        facilitatorLabel: labels.facilitator,
        scribeLabel: labels.scribe,
        notetakerLabel: labels.notetaker,
        whitecellLabel: 'White Cell',
        whitecellLeadLabel: 'White Cell Lead',
        whitecellSupportLabel: 'White Cell Support',
        observerLabel: labels.observer,
        facilitatorRoute: buildTeamRoute(team.id, ROLE_SURFACES.FACILITATOR, { basePath }),
        scribeRoute: buildTeamRoute(team.id, ROLE_SURFACES.SCRIBE, { basePath }),
        notetakerRoute: buildTeamRoute(team.id, ROLE_SURFACES.NOTETAKER, { basePath }),
        whitecellRoute: buildAppPath(WHITE_CELL_CANONICAL_ROUTE, { basePath }),
        observerRoute: buildTeamRoute(team.id, ROLE_SURFACES.FACILITATOR, { observer: true, basePath })
    };
}
