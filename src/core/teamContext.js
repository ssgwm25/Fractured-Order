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
    WHITE_CELL: ROLE_SURFACES.WHITECELL
});

export const TEAM_OPTIONS = Object.freeze([
    { id: 'blue', label: 'Blue Team', shortLabel: 'Blue' },
    { id: 'red', label: 'Red Team', shortLabel: 'Red' },
    { id: 'green', label: 'Green Team', shortLabel: 'Green' },
    { id: 'industry', label: 'Industry Team', shortLabel: 'Industry' }
]);

const WHITE_CELL_CANONICAL_ROUTE = 'whitecell.html';

const WHITE_CELL_TEAM_CONFIG = Object.freeze({
    id: 'white_cell',
    label: 'White Cell',
    shortLabel: 'White Cell'
});

const TEAM_MAP = Object.freeze(
    Object.fromEntries(TEAM_OPTIONS.map((team) => [team.id, team]))
);
const PUBLIC_TEAM_PATTERN = TEAM_OPTIONS.map((team) => team.id).join('|');
const PUBLIC_TEAM_ROLE_REGEX = new RegExp(`^(${PUBLIC_TEAM_PATTERN})_(facilitator|scribe|notetaker)$`);
const TEAM_ROUTE_REGEX = new RegExp(`^teams\\/(${PUBLIC_TEAM_PATTERN})\\/`);
const WHITE_CELL_OPERATOR_ROLE_REGEX = new RegExp(
    `^(?:(${PUBLIC_TEAM_PATTERN})_)?whitecell(?:_(lead|support))?$`
);

export function getTeamConfig(teamId = 'blue') {
    if (teamId === 'white_cell') {
        return WHITE_CELL_TEAM_CONFIG;
    }
    return TEAM_MAP[teamId] || TEAM_MAP.blue;
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
            operatorRole: null
        };
    }

    const normalizedRole = normalizeWhiteCellOperatorRole(role);

    if (normalizedRole === 'viewer') {
        return {
            teamId: null,
            surface: ROLE_SURFACES.VIEWER,
            operatorRole: null
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
                : WHITE_CELL_OPERATOR_ROLES.LEAD
        };
    }

    const match = normalizedRole.match(PUBLIC_TEAM_ROLE_REGEX);
    if (!match) {
        return {
            teamId: null,
            surface: null,
            operatorRole: null
        };
    }

    return {
        teamId: match[1],
        surface: match[2],
        operatorRole: null
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

    if (!parsedRole.teamId || !parsedRole.surface) {
        return null;
    }

    return buildTeamRoute(parsedRole.teamId, parsedRole.surface, { basePath });
}

export function getRoleDisplayName(role, { observerTeamId = null } = {}) {
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
    basePath
} = {}) {
    const datasetTeam = documentRef?.body?.dataset?.team;
    const relativePath = getCurrentAppRelativePath({ locationRef, basePath });
    const onWhiteCellRoute = relativePath.replace(/^\//, '') === WHITE_CELL_CANONICAL_ROUTE
        || relativePath.endsWith('/' + WHITE_CELL_CANONICAL_ROUTE);
    const routeTeam = relativePath.match(TEAM_ROUTE_REGEX)?.[1];
    const resolvedTeamId = datasetTeam === 'white_cell' || onWhiteCellRoute
        ? 'white_cell'
        : (datasetTeam || routeTeam || fallbackTeamId);
    const team = getTeamConfig(resolvedTeamId);
    const labels = getTeamRoleLabels(team.id);
    const whitecellLeadRole = buildWhiteCellOperatorRole(WHITE_CELL_OPERATOR_ROLES.LEAD);
    const whitecellSupportRole = buildWhiteCellOperatorRole(WHITE_CELL_OPERATOR_ROLES.SUPPORT);

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
