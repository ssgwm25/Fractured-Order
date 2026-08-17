import {
    ROLE_SURFACES,
    buildTeamRole,
    buildTeamRoute,
    getSemanticRoleSurface,
    isSupportedTeam
} from '../../core/teamContext.js';
import {
    TRAINING_EXPERIENCE_PLUGIN_ID,
    resolveSessionExperiencePlugin
} from './registry.js';

export const TRAINING_ACCESS_CODE = 'TRAINING2026';
export const TRAINING_SEMANTIC_ROLES = Object.freeze(['scribe', 'facilitator', 'notetaker']);

const SEMANTIC_TO_ROUTE_SURFACE = Object.freeze({
    scribe: ROLE_SURFACES.FACILITATOR,
    facilitator: ROLE_SURFACES.SCRIBE,
    notetaker: ROLE_SURFACES.NOTETAKER
});

const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
const CURRICULUM_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

export function normalizeTrainingEntryCode(value) {
    return normalizeString(value).toUpperCase();
}

export function isTrainingEntryCode(value) {
    return normalizeTrainingEntryCode(value) === TRAINING_ACCESS_CODE;
}

export function getSemanticRoleForPublicSurface(surface) {
    const semanticRole = getSemanticRoleSurface(surface);
    return TRAINING_SEMANTIC_ROLES.includes(semanticRole) ? semanticRole : null;
}

export function getTrainingRouteSurface(semanticRole) {
    return SEMANTIC_TO_ROUTE_SURFACE[semanticRole] || null;
}

export function getTrainingRole(team, semanticRole) {
    const surface = getTrainingRouteSurface(semanticRole);
    return surface && isSupportedTeam(team) ? buildTeamRole(team, surface) : null;
}

export function getTrainingRoleRoute(team, semanticRole, options = {}) {
    const surface = getTrainingRouteSurface(semanticRole);
    return surface && isSupportedTeam(team) ? buildTeamRoute(team, surface, options) : null;
}

export function normalizeStoredTrainingContext(rawContext = {}) {
    const attemptId = normalizeString(rawContext.attemptId ?? rawContext.attempt_id);
    const curriculumVersion = normalizeString(
        rawContext.curriculumVersion ?? rawContext.curriculum_version
    );
    const semanticRole = normalizeString(
        rawContext.semanticRole ?? rawContext.semantic_role
    ).toLowerCase();
    const team = normalizeString(rawContext.team).toLowerCase();
    const trainingMode = rawContext.trainingMode === true || rawContext.training_mode === true;

    if (
        !trainingMode
        || !ATTEMPT_ID_PATTERN.test(attemptId)
        || !CURRICULUM_VERSION_PATTERN.test(curriculumVersion)
        || !TRAINING_SEMANTIC_ROLES.includes(semanticRole)
        || !isSupportedTeam(team)
    ) {
        return null;
    }

    return Object.freeze({
        attemptId,
        curriculumVersion,
        semanticRole,
        team,
        trainingMode: true
    });
}

export function createTrainingContextFromBootstrap(bootstrap = {}) {
    const plugin = resolveSessionExperiencePlugin(bootstrap);
    if (
        !plugin
        || plugin.id !== TRAINING_EXPERIENCE_PLUGIN_ID
        || bootstrap.status !== 'in_progress'
    ) {
        return null;
    }

    const context = normalizeStoredTrainingContext({
        attemptId: bootstrap.attempt_id,
        curriculumVersion: bootstrap.curriculum_version,
        semanticRole: bootstrap.semantic_role,
        team: bootstrap.team,
        trainingMode: true
    });

    if (!context || bootstrap.profile_id !== `${context.team}.${context.semanticRole}`) {
        return null;
    }

    return context;
}

export function trainingContextsMatch(left, right) {
    const normalizedLeft = normalizeStoredTrainingContext(left);
    const normalizedRight = normalizeStoredTrainingContext(right);

    return Boolean(
        normalizedLeft
        && normalizedRight
        && normalizedLeft.attemptId === normalizedRight.attemptId
        && normalizedLeft.curriculumVersion === normalizedRight.curriculumVersion
        && normalizedLeft.semanticRole === normalizedRight.semanticRole
        && normalizedLeft.team === normalizedRight.team
    );
}

export function isAllowedTrainingRolePage(context, {
    team,
    semanticRole
} = {}) {
    const normalizedContext = normalizeStoredTrainingContext(context);
    return Boolean(
        normalizedContext
        && normalizedContext.team === normalizeString(team).toLowerCase()
        && normalizedContext.semanticRole === normalizeString(semanticRole).toLowerCase()
    );
}
