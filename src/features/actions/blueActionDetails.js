const BLUE_ACTION_DETAILS_PREFIX = 'Blue Team Action Details';

export const BLUE_ACTION_INSTRUMENTS = Object.freeze([
    'Economic',
    'Diplomacy',
    'Information',
    'Military',
    'Other'
]);

export const BLUE_ACTION_LEVERS = Object.freeze([
    'Sanctions',
    'Export Controls',
    'Investment Screening',
    'Reciprocal FDI Package',
    'Trade Measures',
    'Financial Restrictions',
    'Industrial Policy',
    'Infrastructure Access',
    'Strategic Reserve Sales',
    'Territory & Basing Access'
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
    'Diversification',
    'Advanced Manufacturing'
]);

export const BLUE_ACTION_SUPPLY_CHAIN_ANGLES = Object.freeze([
    'Build resilience for Blue',
    'Disrupt Red'
]);

export const BLUE_ACTION_SUPPLY_CHAIN_AREAS = Object.freeze([
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
    'U.S',
    'PRC',
    'Russia',
    'EU',
    'France',
    'UK',
    'BRICS+',
    'ROK',
    'ASEAN',
    'Japan',
    'Other'
]);

// Retained for compatibility with historical action records; no modal renders this field.
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
    'Industry',
    'Allies'
]);

const ScribeDecisionValues = Object.freeze({
    YES: 'Yes',
    NO: 'No',
    NOT_SELECTED: 'Not selected'
});

export const BLUE_ACTION_SCRIBE_HANDOFF = Object.freeze({
    DRAFT: 'Draft',
    FORWARDED: 'Forwarded'
});

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

function normalizeScribeDecision(value = '') {
    const normalizedValue = normalizeString(value).toLowerCase();

    if (normalizedValue === 'yes') {
        return ScribeDecisionValues.YES;
    }

    if (normalizedValue === 'no') {
        return ScribeDecisionValues.NO;
    }

    return '';
}

function normalizeScribeHandoff(value = '') {
    const normalizedValue = normalizeString(value).toLowerCase();

    if (normalizedValue === 'forwarded' || normalizedValue === 'forwarded to scribe') {
        return BLUE_ACTION_SCRIBE_HANDOFF.FORWARDED;
    }

    if (normalizedValue === 'draft') {
        return BLUE_ACTION_SCRIBE_HANDOFF.DRAFT;
    }

    return '';
}

function getActionTargets(action = {}) {
    return Array.isArray(action.targets)
        ? action.targets
        : (action.target ? [action.target] : []);
}

export function serializeBlueActionDetails(details = {}) {
    const instruments = normalizeStringList(
        Array.isArray(details.instruments)
            ? details.instruments
            : (details.instrumentOfPower ? [details.instrumentOfPower] : [])
    );
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
    const normalizedSupplyChainAreas = normalizeStringList(
        Array.isArray(details.supplyChainAreas)
            ? details.supplyChainAreas
            : (Array.isArray(details.supplyChainFocuses)
                ? details.supplyChainFocuses
                : (details.supplyChainFocus ? [details.supplyChainFocus] : []))
    );
    const normalizedSupplyChainActionAngles = normalizeStringList(details.supplyChainActionAngles);
    const supplyChainFocusDecision = normalizeScribeDecision(details.supplyChainFocusDecision)
        || (normalizedSupplyChainAreas.length || normalizedSupplyChainActionAngles.length ? ScribeDecisionValues.YES : '');
    const supplyChainAreas = supplyChainFocusDecision === ScribeDecisionValues.NO
        ? []
        : normalizedSupplyChainAreas;
    const supplyChainActionAngles = supplyChainFocusDecision === ScribeDecisionValues.NO
        ? []
        : normalizedSupplyChainActionAngles;
    const legislativeOptions = normalizeStringList(details.legislativeOptions);
    const coordinated = normalizeStringList(details.coordinated);
    const informed = normalizeStringList(details.informed);
    const coordinatedDecision = normalizeScribeDecision(details.coordinatedDecision);
    const informedEngagedDecision = normalizeScribeDecision(
        details.informedEngagedDecision || details.informedDecision
    );
    const scribeHandoff = normalizeScribeHandoff(details.scribeHandoff)
        || BLUE_ACTION_SCRIBE_HANDOFF.DRAFT;

    return [
        BLUE_ACTION_DETAILS_PREFIX,
        `Objective: ${normalizeString(details.objective)}`,
        `Instruments: ${serializeStringList(instruments)}`,
        `Levers: ${serializeStringList(levers)}`,
        `Sectors: ${serializeStringList(sectors)}`,
        `Supply Chain Focus Decision: ${supplyChainFocusDecision || ScribeDecisionValues.NOT_SELECTED}`,
        `Supply Chain Action Angles: ${serializeStringList(supplyChainActionAngles)}`,
        `Supply Chain Areas: ${serializeStringList(supplyChainAreas)}`,
        `Supply Chain Focuses: ${serializeStringList(supplyChainAreas)}`,
        `Implementation: ${normalizeString(details.implementation)}`,
        `Legislative Options: ${serializeStringList(legislativeOptions)}`,
        `Enforcement Timeline: ${normalizeString(details.enforcementTimeline)}`,
        `Scribe Handoff: ${scribeHandoff}`,
        `Coordinated Decision: ${coordinatedDecision || ScribeDecisionValues.NOT_SELECTED}`,
        `Coordinated: ${serializeStringList(coordinated)}`,
        `Informed/Engaged Decision: ${informedEngagedDecision || ScribeDecisionValues.NOT_SELECTED}`,
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
        const instruments = parseStringList(parsed.Instruments || parsed.Instrument);
        const levers = parseStringList(parsed.Levers || parsed.Lever);
        const sectors = parseStringList(parsed.Sectors || parsed.Sector);
        const parsedSupplyChainAreas = parseStringList(
            parsed['Supply Chain Areas']
            || parsed['Supply Chain Focuses']
            || parsed['Supply Chain Focus']
        );
        const parsedSupplyChainActionAngles = parseStringList(parsed['Supply Chain Action Angles']);
        const supplyChainFocusDecision = normalizeScribeDecision(parsed['Supply Chain Focus Decision'])
            || (parsedSupplyChainAreas.length || parsedSupplyChainActionAngles.length ? ScribeDecisionValues.YES : '');
        const supplyChainAreas = supplyChainFocusDecision === ScribeDecisionValues.NO
            ? []
            : parsedSupplyChainAreas;
        const supplyChainActionAngles = supplyChainFocusDecision === ScribeDecisionValues.NO
            ? []
            : parsedSupplyChainActionAngles;
        const legislativeOptions = parseStringList(parsed['Legislative Options']);
        const coordinated = parseStringList(parsed.Coordinated);
        const informed = parseStringList(parsed.Informed);
        const coordinatedDecision = normalizeScribeDecision(parsed['Coordinated Decision']);
        const informedEngagedDecision = normalizeScribeDecision(
            parsed['Informed/Engaged Decision'] || parsed['Informed Decision']
        );
        const scribeHandoff = normalizeScribeHandoff(parsed['Scribe Handoff']);

        return {
            objective: normalizeString(parsed.Objective),
            instrumentOfPower: instruments[0] || '',
            instruments,
            lever: levers[0] || '',
            levers,
            sector: sectors[0] || '',
            sectors,
            supplyChainFocusDecision,
            supplyChainActionAngles,
            supplyChainArea: supplyChainAreas[0] || '',
            supplyChainAreas,
            supplyChainFocus: normalizeString(parsed['Supply Chain Focus']) || supplyChainAreas[0] || '',
            supplyChainFocuses: supplyChainAreas,
            implementation: normalizeString(parsed.Implementation),
            legislativeOptions,
            enforcementTimeline: normalizeString(parsed['Enforcement Timeline']),
            scribeHandoff,
            coordinatedDecision,
            coordinated,
            informedEngagedDecision,
            informed
        };
    } catch (_error) {
        return null;
    }
}

export function getBlueActionViewModel(action = {}) {
    const details = parseBlueActionDetails(action.ally_contingencies);
    const instruments = details?.instruments?.length
        ? details.instruments
        : normalizeStringList(action.mechanism ? [action.mechanism] : []);
    const levers = details?.levers?.length
        ? details.levers
        : normalizeStringList(details?.lever ? [details.lever] : []);
    const sector = normalizeString(action.sector) || details?.sector || '';
    const sectors = details?.sectors?.length
        ? details.sectors
        : normalizeStringList(sector ? [sector] : []);
    const supplyChainAreas = details?.supplyChainFocusDecision === ScribeDecisionValues.NO
        ? []
        : (details?.supplyChainAreas?.length
            ? details.supplyChainAreas
            : normalizeStringList(
                details?.supplyChainFocus
                    ? [details.supplyChainFocus]
                    : (action.exposure_type ? [action.exposure_type] : [])
            ));
    const supplyChainActionAngles = details?.supplyChainActionAngles || [];
    const supplyChainFocusDecision = details?.supplyChainFocusDecision
        || (supplyChainAreas.length || supplyChainActionAngles.length ? ScribeDecisionValues.YES : '');
    const supplyChainFallback = supplyChainFocusDecision === ScribeDecisionValues.NO
        ? ''
        : (action.exposure_type || '');

    return {
        hasBlueActionDetails: Boolean(details),
        title: action.goal || action.title || 'Untitled action',
        objective: details?.objective || normalizeString(action.description),
        instrumentOfPower: instruments[0] || '',
        instruments,
        lever: levers[0] || '',
        levers,
        sector,
        sectors,
        supplyChainFocusDecision,
        supplyChainActionAngles,
        supplyChainArea: supplyChainAreas[0] || supplyChainFallback,
        supplyChainAreas,
        supplyChainFocus: supplyChainAreas[0] || supplyChainFallback,
        supplyChainFocuses: supplyChainAreas,
        implementation: details?.implementation || '',
        legislativeOptions: details?.legislativeOptions || [],
        focusCountries: getActionTargets(action),
        enforcementTimeline: details?.enforcementTimeline || '',
        expectedOutcomes: action.expected_outcomes || action.description || '',
        scribeHandoff: details?.scribeHandoff || '',
        coordinatedDecision: details?.coordinatedDecision || '',
        coordinated: details?.coordinated || [],
        informedEngagedDecision: details?.informedEngagedDecision || '',
        informed: details?.informed || [],
        legacyNotes: details ? '' : normalizeString(action.ally_contingencies)
    };
}

export function isBlueActionForwardedToScribe(action = {}) {
    return getBlueActionViewModel(action).scribeHandoff === BLUE_ACTION_SCRIBE_HANDOFF.FORWARDED;
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
