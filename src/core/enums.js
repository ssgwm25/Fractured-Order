import {
    TEAM_OPTIONS,
    WHITE_CELL_OPERATOR_ROLES,
    buildTeamRole,
    buildWhiteCellOperatorRole,
    ROLE_SURFACES
} from './teamContext.js';

const TEAM_ROLES = Object.freeze(
    Object.fromEntries(
        TEAM_OPTIONS.flatMap((team) => ([
            [`${team.id.toUpperCase()}_FACILITATOR`, buildTeamRole(team.id, ROLE_SURFACES.FACILITATOR)],
            [`${team.id.toUpperCase()}_SCRIBE`, buildTeamRole(team.id, ROLE_SURFACES.SCRIBE)],
            [`${team.id.toUpperCase()}_WHITECELL`, buildTeamRole(team.id, ROLE_SURFACES.WHITECELL)],
            [
                `${team.id.toUpperCase()}_WHITECELL_LEAD`,
                buildWhiteCellOperatorRole(team.id, WHITE_CELL_OPERATOR_ROLES.LEAD)
            ],
            [
                `${team.id.toUpperCase()}_WHITECELL_SUPPORT`,
                buildWhiteCellOperatorRole(team.id, WHITE_CELL_OPERATOR_ROLES.SUPPORT)
            ],
            [`${team.id.toUpperCase()}_NOTETAKER`, buildTeamRole(team.id, ROLE_SURFACES.NOTETAKER)]
        ]))
    )
);

/**
 * Application Enumerations
 * All constant values used throughout the ESG Simulation Platform
 */

export const ENUMS = {
    // Economic mechanisms available for actions
    MECHANISMS: [
        'sanctions',
        'export',
        'investment',
        'trade',
        'financial',
        'economic',
        'industrial',
        'infrastructure'
    ],

    // Economic sectors that can be targeted
    SECTORS: [
        'biotechnology',
        'agriculture',
        'telecommunications',
        'semiconductors',
        'energy',
        'finance',
        'defense',
        'manufacturing',
        'technology',
        'healthcare'
    ],

    // Types of exposure/vulnerability
    EXPOSURE_TYPES: [
        'Supply Chain',
        'Cyber',
        'Financial',
        'Industrial',
        'Trade',
        'Technology',
        'Resource'
    ],

    // Target countries/entities
    TARGETS: [
        'PRC',      // People's Republic of China
        'RUS',      // Russia
        'EU-GER',   // Germany
        'EU-FRA',   // France
        'EU-NLD',   // Netherlands
        'JPN',      // Japan
        'KOR',      // South Korea
        'TWN',      // Taiwan
        'AUS',      // Australia
        'GBR',      // United Kingdom
        'CAN',      // Canada
        'IND',      // India
        'BRA',      // Brazil
        'MEX',      // Mexico
        'SGP',      // Singapore
        'ISR'       // Israel
    ],

    // Priority levels
    PRIORITY: ['NORMAL', 'HIGH', 'URGENT'],

    // Observation types for timeline capture
    OBSERVATION_TYPES: ['NOTE', 'MOMENT', 'QUOTE'],

    // Action lifecycle statuses
    ACTION_STATUS: {
        DRAFT: 'draft',
        SUBMITTED: 'submitted',
        ADJUDICATED: 'adjudicated'
    },

    // RFI (Request for Information) statuses
    REQUEST_STATUS: ['pending', 'answered', 'withdrawn'],

    // Adjudication outcome types
    OUTCOMES: ['SUCCESS', 'PARTIAL_SUCCESS', 'FAIL', 'BACKFIRE'],

    // Game phases with descriptions
    PHASES: {
        1: 'Internal Deliberation',
        2: 'Alliance Consultation',
        3: 'Finalization',
        4: 'Adjudication',
        5: 'Results Brief'
    },

    // Game moves (epochs) with time periods
    MOVES: {
        1: 'Epoch 1 (2027-2030)',
        2: 'Epoch 2 (2030-2032)',
        3: 'Epoch 3 (2032-2034)'
    },

    // User roles
    ROLES: {
        WHITE: 'white',
        ...TEAM_ROLES,
        VIEWER: 'viewer'
    },

    // Session statuses
    SESSION_STATUS: ['active', 'paused', 'completed', 'archived'],

    // Communication types
    COMMUNICATION_TYPES: ['rfi_response', 'broadcast', 'direct', 'system'],

    // Timeline event types
    TIMELINE_TYPES: [
        'action_created',
        'action_submitted',
        'action_adjudicated',
        'rfi_created',
        'rfi_answered',
        'phase_change',
        'move_change',
        'observation',
        'communication'
    ],

    // Team identifiers
    TEAMS: [...TEAM_OPTIONS.map((team) => team.id), 'white_cell'],

    // RFI categories
    RFI_CATEGORIES: [
        'Economic Impact',
        'Political Feasibility',
        'Alliance Response',
        'Implementation Timeline',
        'Resource Requirements',
        'Legal Considerations',
        'Historical Precedent',
        'Other'
    ]
};

/**
 * Get display label for a phase number
 * @param {number} phase - Phase number (1-5)
 * @returns {string} Phase label
 */
export function getPhaseLabel(phase) {
    return ENUMS.PHASES[phase] || `Phase ${phase}`;
}

/**
 * Get display label for a move number
 * @param {number} move - Move number (1-3)
 * @returns {string} Move label
 */
export function getMoveLabel(move) {
    return ENUMS.MOVES[move] || `Move ${move}`;
}

/**
 * Get full country name from code
 * @param {string} code - Country code (e.g., 'PRC')
 * @returns {string} Full country name
 */
export function getTargetFullName(code) {
    const names = {
        'PRC': 'People\'s Republic of China',
        'RUS': 'Russia',
        'EU-GER': 'Germany (EU)',
        'EU-FRA': 'France (EU)',
        'EU-NLD': 'Netherlands (EU)',
        'JPN': 'Japan',
        'KOR': 'South Korea',
        'TWN': 'Taiwan',
        'AUS': 'Australia',
        'GBR': 'United Kingdom',
        'CAN': 'Canada',
        'IND': 'India',
        'BRA': 'Brazil',
        'MEX': 'Mexico',
        'SGP': 'Singapore',
        'ISR': 'Israel'
    };
    return names[code] || code;
}

export const ACTION_LIFECYCLE = [
    ENUMS.ACTION_STATUS.DRAFT,
    ENUMS.ACTION_STATUS.SUBMITTED,
    ENUMS.ACTION_STATUS.ADJUDICATED
];

export function isValidActionStatus(status) {
    return ACTION_LIFECYCLE.includes(status);
}

export function isDraftAction(actionOrStatus) {
    const status = typeof actionOrStatus === 'string'
        ? actionOrStatus
        : actionOrStatus?.status;
    return status === ENUMS.ACTION_STATUS.DRAFT;
}

export function isSubmittedAction(actionOrStatus) {
    const status = typeof actionOrStatus === 'string'
        ? actionOrStatus
        : actionOrStatus?.status;
    return status === ENUMS.ACTION_STATUS.SUBMITTED;
}

export function isAdjudicatedAction(actionOrStatus) {
    const status = typeof actionOrStatus === 'string'
        ? actionOrStatus
        : actionOrStatus?.status;
    return status === ENUMS.ACTION_STATUS.ADJUDICATED;
}

export function canEditAction(actionOrStatus) {
    return isDraftAction(actionOrStatus);
}

export function canDeleteAction(actionOrStatus) {
    return isDraftAction(actionOrStatus);
}

export function canSubmitAction(actionOrStatus) {
    return isDraftAction(actionOrStatus);
}

export function canAdjudicateAction(actionOrStatus) {
    return isSubmittedAction(actionOrStatus);
}

export default ENUMS;
