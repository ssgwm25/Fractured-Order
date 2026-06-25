/**
 * Strategic Orientation Details
 *
 * Pre-Move 1 submissions use the same actions table as normal move records, but
 * are explicitly marked as Strategic Orientation artifacts. Blue records its
 * selected orientation; Green, Red, and Industry record forecasts of Blue's
 * orientation.
 */

export const STRATEGIC_ORIENTATION_DETAILS_PREFIX = 'Strategic Orientation Details';
export const STRATEGIC_ORIENTATION_ACTION_MECHANISM = 'Strategic Orientation';
export const STRATEGIC_ORIENTATION_PERIOD = 'pre_move_1';
export const STRATEGIC_ORIENTATION_REQUIRED_TEAMS = Object.freeze(['blue', 'green', 'red', 'industry']);

export const STRATEGIC_ORIENTATION_ARTIFACT_TYPES = Object.freeze({
    SELECTION: 'selection',
    FORECAST: 'forecast'
});

export const STRATEGIC_ORIENTATION_SCRIBE_HANDOFF = Object.freeze({
    DRAFT: 'Draft',
    FORWARDED: 'Forwarded'
});

export const STRATEGIC_ORIENTATION_OPTIONS = Object.freeze({
    pressure: Object.freeze({
        id: 'pressure',
        number: '01',
        name: 'Pressure',
        tag: 'Focus on affecting PRC GDP growth',
        description: 'The United States prioritizes coercive leverage and cost imposition as the primary means of shaping Chinese behavior. Cooperative or stabilizing measures are explicitly subordinate to enforcement objectives. This approach accepts elevated escalation risk and sustained economic friction as necessary instruments of competition, signaling a willingness to impose and absorb near-term disruption to achieve strategic effect.',
        characteristics: Object.freeze([
            Object.freeze({ key: 'Primary lever', value: 'Coercive leverage & cost imposition' }),
            Object.freeze({ key: 'Objective', value: 'Affect PRC GDP growth' }),
            Object.freeze({ key: 'Escalation posture', value: 'Accepts elevated risk' }),
            Object.freeze({ key: 'Accepted cost', value: 'Sustained economic friction' })
        ]),
        levers: Object.freeze([
            'Expanded financial sanctions',
            'Technology export controls',
            'Tariffs & trade restrictions',
            'Secondary sanctions on third parties',
            'Entity-list designations',
            'Capital / investment restrictions'
        ]),
        costs: Object.freeze([
            'Sustained economic friction',
            'Elevated escalation risk',
            'Retaliation against U.S. firms',
            'Higher domestic prices',
            'Strain on allied coordination',
            'Market volatility'
        ]),
        posture: Object.freeze([
            'Assertive \u2014 accept elevated escalation',
            'Calibrated \u2014 escalate deliberately',
            'Maximum pressure \u2014 absorb disruption'
        ])
    }),
    stabilization: Object.freeze({
        id: 'stabilization',
        number: '02',
        name: 'Stabilization',
        tag: 'Achieve normalization with partners and existing relationships',
        description: 'Competition is deliberately constrained to mitigate escalation dynamics and systemic fragmentation. The expansion of sanctions, export controls, or punitive economic measures is intentionally limited to preserve predictability and reassure markets and allies. This approach prioritizes stability over leverage, accepting reduced coercive flexibility in exchange for lowered volatility and clearer guardrails.',
        characteristics: Object.freeze([
            Object.freeze({ key: 'Primary lever', value: 'Constraint & predictability' }),
            Object.freeze({ key: 'Objective', value: 'Normalize existing relationships' }),
            Object.freeze({ key: 'Escalation posture', value: 'Mitigate & de-escalate' }),
            Object.freeze({ key: 'Accepted cost', value: 'Reduced coercive flexibility' })
        ]),
        levers: Object.freeze([
            'Diplomatic engagement channels',
            'Crisis-communication guardrails',
            'Confidence-building measures',
            'Selective tariff pauses',
            'Restraint on new export controls',
            'Multilateral coordination'
        ]),
        costs: Object.freeze([
            'Reduced coercive flexibility',
            'Forgone near-term leverage',
            'Perception of accommodation',
            'Slower strategic effect',
            'Limited pressure on PRC GDP'
        ]),
        posture: Object.freeze([
            'De-escalatory \u2014 prioritize restraint',
            'Predictable \u2014 transparent signaling',
            'Guardrail-focused \u2014 manage risk'
        ])
    }),
    reframe: Object.freeze({
        id: 'reframe',
        number: '03',
        name: 'Reframe',
        tag: 'Develop new alliance and partnership structures',
        description: 'The United States systematically reallocates economic exposure away from China through deliberate industrial and supply-chain restructuring. This approach does not center on punitive escalation or crisis management, but on gradual reallocation of interdependence to build long-term strategic autonomy. Transitional inefficiencies and economic friction are accepted as the price of structural resilience rather than immediate leverage.',
        characteristics: Object.freeze([
            Object.freeze({ key: 'Primary lever', value: 'Supply-chain restructuring' }),
            Object.freeze({ key: 'Objective', value: 'New alliance/partnership structures' }),
            Object.freeze({ key: 'Escalation posture', value: 'Non-punitive, gradual' }),
            Object.freeze({ key: 'Accepted cost', value: 'Transitional inefficiencies' })
        ]),
        levers: Object.freeze([
            'Friend-shoring agreements',
            'Domestic industrial policy / reshoring',
            'Critical-input diversification',
            'New partnership frameworks',
            'Strategic stockpiling & capacity',
            'R&D / manufacturing investment'
        ]),
        costs: Object.freeze([
            'Transitional inefficiencies',
            'Near-term economic friction',
            'Higher transition-period costs',
            'Long lead times to resilience',
            'Capital-intensive investment',
            'Friction with existing partners'
        ]),
        posture: Object.freeze([
            'Gradual \u2014 long-horizon reallocation',
            'Non-punitive \u2014 restructure, not coerce',
            'Resilience-first \u2014 accept transition cost'
        ])
    })
});

const STRATEGIC_ORIENTATION_EMPTY_LIST_LABEL = 'None selected';
const SUBMITTED_TO_WHITE_CELL_STATUSES = new Set(['submitted', 'adjudicated']);

function normalizeString(value) {
    return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim()
        : '';
}

function normalizeStringList(values = []) {
    if (!Array.isArray(values)) {
        return [];
    }

    return values.map((value) => normalizeString(value)).filter(Boolean);
}

function serializeStringList(values = []) {
    const normalizedValues = normalizeStringList(values);
    return normalizedValues.length
        ? JSON.stringify(normalizedValues)
        : STRATEGIC_ORIENTATION_EMPTY_LIST_LABEL;
}

function parseStringList(value = '') {
    const normalizedValue = normalizeString(value);
    if (!normalizedValue || normalizedValue === STRATEGIC_ORIENTATION_EMPTY_LIST_LABEL) {
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

function normalizeArtifactType(value = '') {
    const normalizedValue = normalizeString(value).toLowerCase();
    return normalizedValue === STRATEGIC_ORIENTATION_ARTIFACT_TYPES.FORECAST
        ? STRATEGIC_ORIENTATION_ARTIFACT_TYPES.FORECAST
        : STRATEGIC_ORIENTATION_ARTIFACT_TYPES.SELECTION;
}

function normalizeScribeHandoff(value = '') {
    const normalizedValue = normalizeString(value).toLowerCase();
    if (normalizedValue === 'forwarded' || normalizedValue === 'forwarded to scribe') {
        return STRATEGIC_ORIENTATION_SCRIBE_HANDOFF.FORWARDED;
    }

    if (normalizedValue === 'draft') {
        return STRATEGIC_ORIENTATION_SCRIBE_HANDOFF.DRAFT;
    }

    return '';
}

function getTeamLabel(teamId = '') {
    const labels = {
        blue: 'Blue',
        green: 'Green',
        red: 'Red',
        industry: 'Industry'
    };

    return labels[normalizeString(teamId).toLowerCase()] || normalizeString(teamId) || 'Team';
}

export function getStrategicOrientationOption(orientation = '') {
    return STRATEGIC_ORIENTATION_OPTIONS[normalizeString(orientation).toLowerCase()] || null;
}

export function serializeStrategicOrientationDetails(details = {}) {
    const artifactType = normalizeArtifactType(details.artifactType);
    const orientationKey = normalizeString(details.orientation || details.orientationKey).toLowerCase();
    const option = getStrategicOrientationOption(orientationKey);
    const scribeHandoff = normalizeScribeHandoff(details.scribeHandoff)
        || STRATEGIC_ORIENTATION_SCRIBE_HANDOFF.DRAFT;

    return [
        STRATEGIC_ORIENTATION_DETAILS_PREFIX,
        `Period: ${STRATEGIC_ORIENTATION_PERIOD}`,
        `Artifact Type: ${artifactType}`,
        `Team: ${normalizeString(details.team)}`,
        `Orientation: ${option?.id || orientationKey}`,
        `Orientation Label: ${option?.name || normalizeString(details.orientationLabel)}`,
        `Orientation Tag: ${option?.tag || normalizeString(details.orientationTag)}`,
        `Primary Levers: ${serializeStringList(details.primaryLevers)}`,
        `Accepted Costs: ${serializeStringList(details.acceptedCosts)}`,
        `Posture: ${normalizeString(details.posture)}`,
        `Rationale: ${normalizeString(details.rationale)}`,
        `Forecast Summary: ${normalizeString(details.forecastSummary)}`,
        `Scribe Handoff: ${scribeHandoff}`
    ].join('\n');
}

export function parseStrategicOrientationDetails(value = '') {
    if (typeof value !== 'string' || !value.startsWith(STRATEGIC_ORIENTATION_DETAILS_PREFIX)) {
        return null;
    }

    try {
        const lines = value
            .slice(STRATEGIC_ORIENTATION_DETAILS_PREFIX.length)
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
        const orientation = normalizeString(parsed.Orientation).toLowerCase();
        const option = getStrategicOrientationOption(orientation);

        return {
            period: normalizeString(parsed.Period),
            artifactType: normalizeArtifactType(parsed['Artifact Type']),
            team: normalizeString(parsed.Team).toLowerCase(),
            orientation,
            orientationLabel: option?.name || normalizeString(parsed['Orientation Label']),
            orientationTag: option?.tag || normalizeString(parsed['Orientation Tag']),
            primaryLevers: parseStringList(parsed['Primary Levers']),
            acceptedCosts: parseStringList(parsed['Accepted Costs']),
            posture: normalizeString(parsed.Posture),
            rationale: normalizeString(parsed.Rationale),
            forecastSummary: normalizeString(parsed['Forecast Summary']),
            scribeHandoff: normalizeScribeHandoff(parsed['Scribe Handoff'])
        };
    } catch (_error) {
        return null;
    }
}

export function formatStrategicOrientationSelection(values = [], fallback = 'Not specified') {
    return Array.isArray(values) && values.length ? values.join(', ') : fallback;
}

export function getStrategicOrientationViewModel(action = {}) {
    const details = parseStrategicOrientationDetails(action.ally_contingencies);
    const option = getStrategicOrientationOption(details?.orientation);
    const teamId = details?.team || action.team || '';
    const teamLabel = getTeamLabel(teamId);
    const artifactType = details?.artifactType || STRATEGIC_ORIENTATION_ARTIFACT_TYPES.SELECTION;
    const orientationLabel = details?.orientationLabel || option?.name || 'Strategic Orientation';
    const isForecast = artifactType === STRATEGIC_ORIENTATION_ARTIFACT_TYPES.FORECAST;
    const title = isForecast
        ? `${teamLabel} Forecast: Blue ${orientationLabel}`
        : `Strategic Orientation: ${orientationLabel}`;

    return {
        hasStrategicOrientationDetails: Boolean(details),
        title: action.goal || title,
        artifactType,
        isForecast,
        isSelection: artifactType === STRATEGIC_ORIENTATION_ARTIFACT_TYPES.SELECTION,
        team: teamId,
        teamLabel,
        period: details?.period || STRATEGIC_ORIENTATION_PERIOD,
        orientation: details?.orientation || '',
        orientationLabel,
        orientationTag: details?.orientationTag || option?.tag || '',
        description: option?.description || '',
        characteristics: option?.characteristics || [],
        primaryLevers: details?.primaryLevers || [],
        acceptedCosts: details?.acceptedCosts || [],
        posture: details?.posture || '',
        rationale: details?.rationale || '',
        forecastSummary: details?.forecastSummary || '',
        scribeHandoff: details?.scribeHandoff || '',
        submittedToWhiteCell: SUBMITTED_TO_WHITE_CELL_STATUSES.has(action?.status)
    };
}

export function isStrategicOrientationAction(action = {}) {
    return Boolean(parseStrategicOrientationDetails(action.ally_contingencies))
        || action?.mechanism === STRATEGIC_ORIENTATION_ACTION_MECHANISM;
}

export function isStrategicOrientationForwardedToScribe(action = {}) {
    const viewModel = getStrategicOrientationViewModel(action);
    return viewModel.hasStrategicOrientationDetails
        && viewModel.scribeHandoff === STRATEGIC_ORIENTATION_SCRIBE_HANDOFF.FORWARDED;
}

export function isStrategicOrientationSubmittedToWhiteCell(action = {}) {
    return getStrategicOrientationViewModel(action).hasStrategicOrientationDetails
        && SUBMITTED_TO_WHITE_CELL_STATUSES.has(action?.status);
}

export function getStrategicOrientationCompletion(actions = []) {
    const submittedTeams = new Set();

    (actions || []).forEach((action) => {
        if (!isStrategicOrientationSubmittedToWhiteCell(action)) {
            return;
        }

        const viewModel = getStrategicOrientationViewModel(action);
        const teamId = viewModel.team || action.team;
        if (STRATEGIC_ORIENTATION_REQUIRED_TEAMS.includes(teamId)) {
            submittedTeams.add(teamId);
        }
    });

    const missingTeams = STRATEGIC_ORIENTATION_REQUIRED_TEAMS.filter((teamId) => !submittedTeams.has(teamId));

    return {
        complete: missingTeams.length === 0,
        requiredTeams: [...STRATEGIC_ORIENTATION_REQUIRED_TEAMS],
        submittedTeams: [...submittedTeams],
        missingTeams
    };
}
