const BLUE_ACTION_DETAILS_PREFIX = 'Blue Team Action Details';

export const BLUE_ACTION_INSTRUMENTS = Object.freeze([
    'Diplomatic',
    'Informational',
    'Military',
    'Economic'
]);

export const BLUE_ACTION_LEVERS = Object.freeze([
    'Sanctions',
    'Export Controls',
    'Investment Screening',
    'Trade Measures',
    'Financial Restrictions',
    'Industrial Policy',
    'Infrastructure Access'
]);

export const BLUE_ACTION_SECTORS = Object.freeze([
    'Biotechnology',
    'Agriculture',
    'Telecommunications',
    'Other'
]);

export const BLUE_ACTION_SUPPLY_CHAIN_FOCUS = Object.freeze([
    'Extraction',
    'Refinement',
    'Distribution',
    'Advanced Manufacturing'
]);

export const BLUE_ACTION_IMPLEMENTATIONS = Object.freeze([
    'Legislative',
    'Executive Order',
    'Other'
]);

export const BLUE_ACTION_LEGISLATIVE_OPTIONS = Object.freeze([
    'Existing legislation/policy',
    'Proposing new legislation/policy'
]);

export const BLUE_ACTION_COUNTRIES = Object.freeze([
    'PRC',
    'Russia',
    'EU',
    'France',
    'UK',
    'BRICS+',
    'ROK',
    'ASEAN',
    'Japan'
]);

export const BLUE_ACTION_ENFORCEMENT_TIMELINES = Object.freeze([
    '3 months',
    '6 months',
    '12 months',
    'Other'
]);

export const BLUE_ACTION_COORDINATED_OPTIONS = Object.freeze([
    'Legislative',
    'Executive'
]);

export const BLUE_ACTION_INFORMED_OPTIONS = Object.freeze([
    'Corporate',
    'Allied'
]);

function normalizeString(value) {
    return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim()
        : '';
}

function normalizeStringList(values = []) {
    if (!Array.isArray(values)) {
        return [];
    }

    return values
        .map((value) => normalizeString(value))
        .filter(Boolean);
}

function serializeStringList(values = [], emptyLabel = 'None selected') {
    const normalizedValues = normalizeStringList(values);

    return normalizedValues.length
        ? JSON.stringify(normalizedValues)
        : emptyLabel;
}

function parseStringList(value = '', emptyLabel = 'None selected') {
    const normalizedValue = normalizeString(value);
    if (!normalizedValue || normalizedValue === emptyLabel) {
        return [];
    }

    try {
        const parsedValue = JSON.parse(normalizedValue);
        if (Array.isArray(parsedValue)) {
            return normalizeStringList(parsedValue);
        }
    } catch (_error) {
        // Fall through to the legacy comma-separated parser.
    }

    return normalizeStringList(normalizedValue.split(','));
}

function getActionTargets(action = {}) {
    return Array.isArray(action.targets)
        ? action.targets
        : (action.target ? [action.target] : []);
}

export function serializeBlueActionDetails(details = {}) {
    const levers = normalizeStringList(
        Array.isArray(details.levers)
            ? details.levers
            : (details.lever ? [details.lever] : [])
    );
    const sectors = normalizeStringList(
        Array.isArray(details.sectors)
            ? details.sectors
            : (details.sector ? [details.sector] : [])
    );
    const legislativeOptions = normalizeStringList(details.legislativeOptions);
    const coordinated = normalizeStringList(details.coordinated);
    const informed = normalizeStringList(details.informed);

    return [
        BLUE_ACTION_DETAILS_PREFIX,
        `Objective: ${normalizeString(details.objective)}`,
        `Levers: ${serializeStringList(levers)}`,
        `Sectors: ${serializeStringList(sectors)}`,
        `Implementation: ${normalizeString(details.implementation)}`,
        `Legislative Options: ${serializeStringList(legislativeOptions)}`,
        `Enforcement Timeline: ${normalizeString(details.enforcementTimeline)}`,
        `Coordinated: ${serializeStringList(coordinated)}`,
        `Informed: ${serializeStringList(informed)}`
    ].join('\n');
}

export function parseBlueActionDetails(value = '') {
    if (typeof value !== 'string' || !value.startsWith(BLUE_ACTION_DETAILS_PREFIX)) {
        return null;
    }

    try {
        const lines = value
            .slice(BLUE_ACTION_DETAILS_PREFIX.length)
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        const parsed = Object.fromEntries(
            lines
                .map((line) => {
                    const separatorIndex = line.indexOf(':');
                    if (separatorIndex === -1) {
                        return null;
                    }

                    return [
                        line.slice(0, separatorIndex).trim(),
                        line.slice(separatorIndex + 1).trim()
                    ];
                })
                .filter(Boolean)
        );
        const levers = parseStringList(parsed.Levers || parsed.Lever);
        const sectors = parseStringList(parsed.Sectors || parsed.Sector);
        const legislativeOptions = parseStringList(parsed['Legislative Options']);
        const coordinated = parseStringList(parsed.Coordinated);
        const informed = parseStringList(parsed.Informed);

        return {
            objective: normalizeString(parsed.Objective),
            lever: levers[0] || '',
            levers,
            sector: sectors[0] || '',
            sectors,
            implementation: normalizeString(parsed.Implementation),
            legislativeOptions,
            enforcementTimeline: normalizeString(parsed['Enforcement Timeline']),
            coordinated,
            informed
        };
    } catch (_error) {
        return null;
    }
}

export function getBlueActionViewModel(action = {}) {
    const details = parseBlueActionDetails(action.ally_contingencies);
    const levers = details?.levers?.length
        ? details.levers
        : normalizeStringList(details?.lever ? [details.lever] : []);
    const sector = normalizeString(action.sector) || details?.sector || '';
    const sectors = details?.sectors?.length
        ? details.sectors
        : normalizeStringList(sector ? [sector] : []);

    return {
        hasBlueActionDetails: Boolean(details),
        title: action.goal || action.title || 'Untitled action',
        objective: details?.objective || normalizeString(action.description),
        instrumentOfPower: action.mechanism || '',
        lever: levers[0] || '',
        levers,
        sector,
        sectors,
        supplyChainFocus: action.exposure_type || '',
        implementation: details?.implementation || '',
        legislativeOptions: details?.legislativeOptions || [],
        focusCountries: getActionTargets(action),
        enforcementTimeline: details?.enforcementTimeline || '',
        expectedOutcomes: action.expected_outcomes || action.description || '',
        coordinated: details?.coordinated || [],
        informed: details?.informed || [],
        legacyNotes: details ? '' : normalizeString(action.ally_contingencies)
    };
}

export function formatBlueActionSelection(values = [], fallback = 'Not specified') {
    return Array.isArray(values) && values.length
        ? values.join(', ')
        : fallback;
}

function getSortableTimestamp(action = {}) {
    const timestamp = action.submitted_at || action.updated_at || action.created_at || '';
    const parsed = new Date(timestamp).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

export function getActionSequenceNumber(actions = [], action = {}) {
    if (!action?.team || !action?.move) {
        return null;
    }

    const orderedActions = [...(actions || [])]
        .filter((candidate) => candidate?.team === action.team && candidate?.move === action.move)
        .sort((left, right) => {
            const timestampDelta = getSortableTimestamp(left) - getSortableTimestamp(right);
            if (timestampDelta !== 0) {
                return timestampDelta;
            }

            return String(left?.id || '').localeCompare(String(right?.id || ''));
        });
    const actionIndex = orderedActions.findIndex((candidate) => candidate?.id === action.id);

    return actionIndex === -1 ? null : actionIndex + 1;
}

export function getNextActionSequenceNumber(actions = [], team = '', move = null) {
    if (!team || !move) {
        return null;
    }

    return actions.filter((action) => action?.team === team && action?.move === move).length + 1;
}

export function formatActionSequenceLabel({
    teamLabel = 'Team',
    move = null,
    actionNumber = null
} = {}) {
    const moveLabel = move ? `Move ${move}` : 'Move';
    const actionLabel = actionNumber ? `Action ${actionNumber}` : 'Action';
    return `${teamLabel} | ${moveLabel} | ${actionLabel}`;
}

export { BLUE_ACTION_DETAILS_PREFIX };
