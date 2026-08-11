/**
 * Strategic Orientation Details
 *
 * Pre-Move 1 submissions use the same actions table as normal move records, but
 * are explicitly marked as Strategic Orientation artifacts. Each team records
 * its team-specific orientation, forecast, and narrative fields. Version 1
 * selection-only and forecast-only envelopes remain readable.
 */

export const STRATEGIC_ORIENTATION_DETAILS_PREFIX = 'Strategic Orientation Details';
export const STRATEGIC_ORIENTATION_ACTION_MECHANISM = 'Strategic Orientation';
export const STRATEGIC_ORIENTATION_PERIOD = 'pre_move_1';
export const STRATEGIC_ORIENTATION_CONTRACT_VERSION = 2;
export const STRATEGIC_ORIENTATION_REQUIRED_TEAMS = Object.freeze(['blue', 'green', 'red', 'industry']);
export const STRATEGIC_ORIENTATION_MULTI_TARGET_FORECAST_TEAM_IDS = Object.freeze(['red']);
export const STRATEGIC_ORIENTATION_FORECAST_TARGETS = Object.freeze([
    Object.freeze({ key: 'red', label: 'Red' }),
    Object.freeze({ key: 'blue', label: 'Blue' }),
    Object.freeze({ key: 'green_asian_pacific', label: 'Green (Asian Pacific)' }),
    Object.freeze({ key: 'green_europe', label: 'Green (Europe)' })
]);

export const STRATEGIC_ORIENTATION_ARTIFACT_TYPES = Object.freeze({
    SELECTION: 'selection',
    FORECAST: 'forecast',
    ORIENTATION_AND_FORECAST: 'orientation_and_forecast'
});

const ownOrientationSection = (legend, helpText) => Object.freeze({
    key: 'ownOrientation',
    kind: 'catalogue',
    targetKey: 'own',
    legend,
    helpText,
    required: true
});
const forecastSection = (targetKey, legend, helpText) => Object.freeze({
    key: `forecast:${targetKey}`,
    kind: 'catalogue',
    targetKey,
    legend,
    helpText,
    required: true
});
const narrativeSection = (key, label, helpText) => Object.freeze({
    key,
    kind: 'narrative',
    label,
    helpText,
    required: true
});

/** Ordered, declarative modal and validation contract for each team. */
export const STRATEGIC_ORIENTATION_TEAM_PROFILES = Object.freeze({
    blue: Object.freeze({
        teamId: 'blue',
        title: 'Strategic Orientation',
        submitCopy: 'Record Strategic Orientation',
        forecastTargets: Object.freeze(['red']),
        requiredFields: Object.freeze(['ownOrientation', 'forecastTargets.red', 'forecastActionDescription']),
        sections: Object.freeze([
            ownOrientationSection("Choose Blue's orientation", 'Select the catalogue orientation Blue will pursue.'),
            forecastSection('red', "Forecast Red's orientation", 'Select the catalogue orientation you expect Red to pursue.'),
            narrativeSection('forecastActionDescription', 'Describe what you expect Red to do', 'Describe the actions you expect from Red under this forecast.')
        ])
    }),
    red: Object.freeze({
        teamId: 'red',
        title: 'Strategic Orientation',
        submitCopy: 'Record Strategic Orientation',
        forecastTargets: Object.freeze(['blue', 'green_asian_pacific', 'green_europe']),
        requiredFields: Object.freeze(['ownOrientation', 'orientationRationale', 'forecastTargets.blue', 'forecastTargets.green_asian_pacific', 'forecastTargets.green_europe']),
        sections: Object.freeze([
            ownOrientationSection("Choose Red's orientation", 'Select the catalogue orientation Red will pursue.'),
            narrativeSection('orientationRationale', "Describe and explain Red's strategic orientation", 'Explain why Red selected this orientation.'),
            forecastSection('blue', "Forecast Blue's orientation", 'Select the catalogue orientation you expect Blue to pursue.'),
            forecastSection('green_asian_pacific', 'Forecast Green (Asian Pacific)', 'Select the catalogue orientation you expect Green (Asian Pacific) to pursue.'),
            forecastSection('green_europe', 'Forecast Green (Europe)', 'Select the catalogue orientation you expect Green (Europe) to pursue.')
        ])
    }),
    green: Object.freeze({
        teamId: 'green',
        title: 'Strategic Orientation',
        submitCopy: 'Record Strategic Orientation',
        forecastTargets: Object.freeze(['blue']),
        requiredFields: Object.freeze(['forecastTargets.blue', 'ownOrientation', 'strategyDescription']),
        sections: Object.freeze([
            forecastSection('blue', "Forecast Blue's orientation", 'Select the catalogue orientation you expect Blue to pursue.'),
            ownOrientationSection("Choose Green's orientation", 'Select the catalogue orientation Green will pursue.'),
            narrativeSection('strategyDescription', 'Describe your strategy given this forecast', "Describe Green's strategy, in its own terms, given the Blue forecast.")
        ])
    }),
    industry: Object.freeze({
        teamId: 'industry',
        title: 'Strategic Orientation',
        submitCopy: 'Record Strategic Orientation',
        forecastTargets: Object.freeze(['blue']),
        requiredFields: Object.freeze(['forecastTargets.blue', 'ownOrientation', 'strategyDescription']),
        sections: Object.freeze([
            forecastSection('blue', "Forecast Blue's orientation", 'Select the catalogue orientation you expect Blue to pursue.'),
            ownOrientationSection("Choose Industry's orientation", 'Select the catalogue orientation Industry will pursue.'),
            narrativeSection('strategyDescription', 'Describe your strategy given this forecast', "Describe Industry's strategy, in its own terms, given the Blue forecast.")
        ])
    })
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
const STRATEGIC_ORIENTATION_FORECAST_TARGETS_BY_KEY = Object.freeze(
    Object.fromEntries(STRATEGIC_ORIENTATION_FORECAST_TARGETS.map((target) => [target.key, target]))
);
// Version 1 forecast-only envelopes always targeted Blue, even though the
// version 2 canonical target ordering begins with Red.
const STRATEGIC_ORIENTATION_DEFAULT_FORECAST_TARGET = STRATEGIC_ORIENTATION_FORECAST_TARGETS_BY_KEY.blue;

function normalizeString(value) {
    return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim()
        : '';
}

function normalizeForecastTargetKey(value = '') {
    const normalizedValue = normalizeString(value)
        .toLowerCase()
        .replace(/[^a-z]+/g, '_')
        .replace(/^_+|_+$/g, '');

    if (
        normalizedValue === 'green_ap'
        || normalizedValue === 'green_asia_pacific'
        || normalizedValue === 'green_asianpacific'
    ) {
        return 'green_asian_pacific';
    }

    if (normalizedValue === 'greeneurope') {
        return 'green_europe';
    }

    return normalizedValue;
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
    if (normalizedValue === STRATEGIC_ORIENTATION_ARTIFACT_TYPES.ORIENTATION_AND_FORECAST) {
        return STRATEGIC_ORIENTATION_ARTIFACT_TYPES.ORIENTATION_AND_FORECAST;
    }
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

export function getStrategicOrientationForecastTargetLabel(targetKey = '') {
    const normalizedTargetKey = normalizeForecastTargetKey(targetKey);
    return STRATEGIC_ORIENTATION_FORECAST_TARGETS_BY_KEY[normalizedTargetKey]?.label
        || normalizeString(targetKey)
        || 'Forecast';
}

export function getStrategicOrientationForecastTargetsForTeam(teamId = '') {
    const profile = getStrategicOrientationTeamProfile(teamId);
    const targetKeys = profile?.forecastTargets || [STRATEGIC_ORIENTATION_DEFAULT_FORECAST_TARGET.key];
    return targetKeys.map((key) => ({ ...STRATEGIC_ORIENTATION_FORECAST_TARGETS_BY_KEY[key] }));
}

export function getStrategicOrientationTeamProfile(teamId = '') {
    return STRATEGIC_ORIENTATION_TEAM_PROFILES[normalizeString(teamId).toLowerCase()] || null;
}

export function getStrategicOrientationOption(orientation = '') {
    return STRATEGIC_ORIENTATION_OPTIONS[normalizeString(orientation).toLowerCase()] || null;
}

function normalizeCatalogueSelection(value = '') {
    const option = getStrategicOrientationOption(value?.id || value?.orientation || value?.orientationKey || value);
    return option ? { id: option.id, label: option.name, tag: option.tag } : null;
}

function normalizeForecastTargets(targets = [], {
    artifactType = STRATEGIC_ORIENTATION_ARTIFACT_TYPES.SELECTION,
    orientation = '',
    orientationLabel = '',
    orientationTag = ''
} = {}) {
    const uniqueTargets = new Map();

    if (Array.isArray(targets)) {
        targets.forEach((target) => {
            const key = normalizeForecastTargetKey(target?.key || target?.target || target?.label);
            if (!STRATEGIC_ORIENTATION_FORECAST_TARGETS_BY_KEY[key]) {
                throw new TypeError(`Unknown Strategic Orientation forecast target: ${key || 'empty'}`);
            }
            if (uniqueTargets.has(key)) {
                throw new TypeError(`Duplicate Strategic Orientation forecast target: ${key}`);
            }

            const option = getStrategicOrientationOption(
                target?.selection?.id || target?.orientation || target?.orientationKey
            );
            if (!option) {
                throw new TypeError(`Unknown Strategic Orientation catalogue value for ${key}.`);
            }

            uniqueTargets.set(key, {
                key,
                label: getStrategicOrientationForecastTargetLabel(key),
                orientation: option.id,
                orientationLabel: option.name,
                orientationTag: option.tag,
                selection: { id: option.id, label: option.name, tag: option.tag }
            });
        });
    }

    if (!uniqueTargets.size && artifactType === STRATEGIC_ORIENTATION_ARTIFACT_TYPES.FORECAST) {
        const option = getStrategicOrientationOption(orientation);
        if (option) {
            uniqueTargets.set(STRATEGIC_ORIENTATION_DEFAULT_FORECAST_TARGET.key, {
                key: STRATEGIC_ORIENTATION_DEFAULT_FORECAST_TARGET.key,
                label: STRATEGIC_ORIENTATION_DEFAULT_FORECAST_TARGET.label,
                orientation: option.id,
                orientationLabel: option.name || normalizeString(orientationLabel),
                orientationTag: option.tag || normalizeString(orientationTag),
                selection: { id: option.id, label: option.name, tag: option.tag }
            });
        }
    }

    return STRATEGIC_ORIENTATION_FORECAST_TARGETS
        .map((target) => uniqueTargets.get(target.key))
        .filter(Boolean);
}

function serializeCatalogueSelection(selection = null) {
    const normalized = normalizeCatalogueSelection(selection);
    return normalized ? JSON.stringify(normalized) : STRATEGIC_ORIENTATION_EMPTY_LIST_LABEL;
}

function parseCatalogueSelection(value = '') {
    const normalizedValue = normalizeString(value);
    if (!normalizedValue || normalizedValue === STRATEGIC_ORIENTATION_EMPTY_LIST_LABEL) return null;
    try {
        return normalizeCatalogueSelection(JSON.parse(normalizedValue));
    } catch (_error) {
        return normalizeCatalogueSelection(normalizedValue);
    }
}

function serializeForecastTargets(targets = [], fallback = {}) {
    const normalizedTargets = normalizeForecastTargets(targets, fallback);
    return normalizedTargets.length
        ? JSON.stringify(normalizedTargets)
        : STRATEGIC_ORIENTATION_EMPTY_LIST_LABEL;
}

function parseForecastTargets(value = '', fallback = {}) {
    const normalizedValue = normalizeString(value);
    if (!normalizedValue || normalizedValue === STRATEGIC_ORIENTATION_EMPTY_LIST_LABEL) {
        return normalizeForecastTargets([], fallback);
    }

    try {
        const parsedValue = JSON.parse(normalizedValue);
        if (Array.isArray(parsedValue)) {
            return normalizeForecastTargets(parsedValue, fallback);
        }
    } catch (_error) {
        // Fall through to the compatibility parser.
    }

    return normalizeForecastTargets([], fallback);
}

export function buildStrategicOrientationForecastSummary(forecastTargets = [], fallback = {}) {
    const normalizedTargets = normalizeForecastTargets(forecastTargets, {
        artifactType: STRATEGIC_ORIENTATION_ARTIFACT_TYPES.FORECAST,
        ...fallback
    });

    if (!normalizedTargets.length) {
        return '';
    }

    if (normalizedTargets.length === 1) {
        const [target] = normalizedTargets;
        const tagSuffix = target.orientationTag ? ` - ${target.orientationTag}` : '';
        return `Forecast: ${target.label} will choose ${target.orientationLabel}${tagSuffix}.`;
    }

    return `Forecasts: ${normalizedTargets.map((target) => `${target.label} -> ${target.orientationLabel}`).join('; ')}.`;
}

export function serializeStrategicOrientationDetails(details = {}) {
    const team = normalizeString(details.team).toLowerCase();
    const profile = getStrategicOrientationTeamProfile(team);
    const ownOrientation = normalizeCatalogueSelection(details.ownOrientation || details.orientation || details.orientationKey);
    const artifactType = normalizeArtifactType(details.artifactType || (profile
        ? STRATEGIC_ORIENTATION_ARTIFACT_TYPES.ORIENTATION_AND_FORECAST
        : STRATEGIC_ORIENTATION_ARTIFACT_TYPES.SELECTION));
    const orientationKey = ownOrientation?.id || normalizeString(details.orientation || details.orientationKey).toLowerCase();
    const forecastTargets = normalizeForecastTargets(details.forecastTargets, {
        artifactType,
        orientation: orientationKey,
        orientationLabel: details.orientationLabel,
        orientationTag: details.orientationTag
    });
    const primaryForecast = forecastTargets[0] || null;
    const option = getStrategicOrientationOption(orientationKey || primaryForecast?.orientation);
    const scribeHandoff = normalizeScribeHandoff(details.scribeHandoff)
        || STRATEGIC_ORIENTATION_SCRIBE_HANDOFF.DRAFT;

    return [
        STRATEGIC_ORIENTATION_DETAILS_PREFIX,
        `Contract Version: ${STRATEGIC_ORIENTATION_CONTRACT_VERSION}`,
        `Period: ${STRATEGIC_ORIENTATION_PERIOD}`,
        `Artifact Type: ${artifactType}`,
        `Team: ${team}`,
        `Own Orientation: ${serializeCatalogueSelection(ownOrientation)}`,
        `Orientation: ${ownOrientation?.id || primaryForecast?.orientation || option?.id || orientationKey}`,
        `Orientation Label: ${ownOrientation?.label || primaryForecast?.orientationLabel || option?.name || normalizeString(details.orientationLabel)}`,
        `Orientation Tag: ${ownOrientation?.tag || primaryForecast?.orientationTag || option?.tag || normalizeString(details.orientationTag)}`,
        `Forecast Targets: ${serializeForecastTargets(forecastTargets, {
            artifactType,
            orientation: orientationKey,
            orientationLabel: details.orientationLabel,
            orientationTag: details.orientationTag
        })}`,
        `Primary Levers: ${serializeStringList(details.primaryLevers)}`,
        `Accepted Costs: ${serializeStringList(details.acceptedCosts)}`,
        `Posture: ${normalizeString(details.posture)}`,
        `Rationale: ${normalizeString(details.rationale)}`,
        `Orientation Rationale: ${normalizeString(details.orientationRationale)}`,
        `Forecast Action Description: ${normalizeString(details.forecastActionDescription)}`,
        `Strategy Description: ${normalizeString(details.strategyDescription)}`,
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
        const contractVersion = Number.parseInt(parsed['Contract Version'], 10) || 1;
        const orientation = normalizeString(parsed.Orientation).toLowerCase();
        const artifactType = normalizeArtifactType(parsed['Artifact Type']);
        const option = getStrategicOrientationOption(orientation);
        const ownOrientation = contractVersion >= STRATEGIC_ORIENTATION_CONTRACT_VERSION
            ? parseCatalogueSelection(parsed['Own Orientation'])
            : (artifactType === STRATEGIC_ORIENTATION_ARTIFACT_TYPES.SELECTION
                ? normalizeCatalogueSelection(orientation)
                : null);
        const parsedForecastTargets = parseForecastTargets(parsed['Forecast Targets'], {
            artifactType,
            orientation,
            orientationLabel: option?.name || normalizeString(parsed['Orientation Label']),
            orientationTag: option?.tag || normalizeString(parsed['Orientation Tag'])
        });
        const forecastTargets = contractVersion >= STRATEGIC_ORIENTATION_CONTRACT_VERSION
            ? parsedForecastTargets
            : parsedForecastTargets.map(({ selection: _selection, ...target }) => target);
        const primaryForecast = forecastTargets[0] || null;

        return {
            contractVersion,
            period: normalizeString(parsed.Period),
            artifactType,
            team: normalizeString(parsed.Team).toLowerCase(),
            ownOrientation,
            orientation: ownOrientation?.id || primaryForecast?.orientation || orientation,
            orientationLabel: ownOrientation?.label || primaryForecast?.orientationLabel || option?.name || normalizeString(parsed['Orientation Label']),
            orientationTag: ownOrientation?.tag || primaryForecast?.orientationTag || option?.tag || normalizeString(parsed['Orientation Tag']),
            forecastTargets,
            primaryLevers: parseStringList(parsed['Primary Levers']),
            acceptedCosts: parseStringList(parsed['Accepted Costs']),
            posture: normalizeString(parsed.Posture),
            rationale: normalizeString(parsed.Rationale),
            orientationRationale: normalizeString(parsed['Orientation Rationale']),
            forecastActionDescription: normalizeString(parsed['Forecast Action Description']),
            strategyDescription: normalizeString(parsed['Strategy Description']),
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

export function getStrategicOrientationArtifactLabel(viewModel = {}) {
    if (!viewModel.isLegacy) return 'Orientation & Forecast';
    return viewModel.isForecast ? 'Forecast' : 'Selection';
}

export function getStrategicOrientationDisplayFields(viewModel = {}) {
    return [
        ...(viewModel.hasOwnOrientation ? [{
            label: 'Own Orientation',
            value: `${viewModel.ownOrientation.label}: ${viewModel.ownOrientation.tag}`,
            wide: true
        }] : []),
        ...(viewModel.hasOrientationRationale ? [{
            label: 'Orientation Rationale',
            value: viewModel.orientationRationale,
            wide: true
        }] : []),
        ...(viewModel.forecastTargets || []).map((forecast) => ({
            label: `${forecast.label} Forecast`,
            value: `${forecast.orientationLabel}: ${forecast.orientationTag}`,
            wide: true
        })),
        ...(viewModel.hasForecastActionDescription ? [{
            label: 'Expected Target Actions',
            value: viewModel.forecastActionDescription,
            wide: true
        }] : []),
        ...(viewModel.hasStrategyDescription ? [{
            label: 'Strategy Description',
            value: viewModel.strategyDescription,
            wide: true
        }] : [])
    ];
}

export function getStrategicOrientationViewModel(action = {}) {
    const details = parseStrategicOrientationDetails(action.ally_contingencies);
    const option = getStrategicOrientationOption(details?.orientation);
    const teamId = details?.team || action.team || '';
    const teamLabel = getTeamLabel(teamId);
    const artifactType = details?.artifactType || STRATEGIC_ORIENTATION_ARTIFACT_TYPES.SELECTION;
    const isForecast = artifactType === STRATEGIC_ORIENTATION_ARTIFACT_TYPES.FORECAST;
    const forecastTargets = details?.forecastTargets || normalizeForecastTargets([], {
        artifactType,
        orientation: details?.orientation,
        orientationLabel: details?.orientationLabel,
        orientationTag: details?.orientationTag
    });
    const primaryForecast = forecastTargets[0] || null;
    const ownOrientation = details?.ownOrientation || (artifactType === STRATEGIC_ORIENTATION_ARTIFACT_TYPES.SELECTION
        ? normalizeCatalogueSelection(details?.orientation)
        : null);
    const orientationLabel = ownOrientation?.label || primaryForecast?.orientationLabel || details?.orientationLabel || option?.name || 'Strategic Orientation';
    const orientationTag = ownOrientation?.tag || primaryForecast?.orientationTag || details?.orientationTag || option?.tag || '';
    const hasMultipleForecastTargets = isForecast && forecastTargets.length > 1;
    const title = ownOrientation
        ? `${teamLabel} Strategic Orientation: ${ownOrientation.label}`
        : isForecast
        ? (hasMultipleForecastTargets
            ? `${teamLabel} Forecasts`
            : `${teamLabel} Forecast: Blue ${orientationLabel}`)
        : `Strategic Orientation: ${orientationLabel}`;

    return {
        hasStrategicOrientationDetails: Boolean(details),
        title: action.goal || title,
        artifactType,
        isForecast,
        isSelection: artifactType === STRATEGIC_ORIENTATION_ARTIFACT_TYPES.SELECTION,
        isLegacy: Boolean(details && (details.contractVersion || 1) < STRATEGIC_ORIENTATION_CONTRACT_VERSION),
        team: teamId,
        teamLabel,
        period: details?.period || STRATEGIC_ORIENTATION_PERIOD,
        ownOrientation,
        hasOwnOrientation: Boolean(ownOrientation),
        hasForecasts: forecastTargets.length > 0,
        hasOrientationRationale: Boolean(details?.orientationRationale),
        hasForecastActionDescription: Boolean(details?.forecastActionDescription),
        hasStrategyDescription: Boolean(details?.strategyDescription),
        orientation: ownOrientation?.id || details?.orientation || '',
        orientationLabel,
        orientationTag,
        description: option?.description || '',
        forecastTargets,
        primaryForecast,
        hasMultipleForecastTargets,
        characteristics: option?.characteristics || [],
        primaryLevers: details?.primaryLevers || [],
        acceptedCosts: details?.acceptedCosts || [],
        posture: details?.posture || '',
        rationale: details?.rationale || '',
        orientationRationale: details?.orientationRationale || '',
        forecastActionDescription: details?.forecastActionDescription || '',
        strategyDescription: details?.strategyDescription || '',
        forecastSummary: details?.forecastSummary || buildStrategicOrientationForecastSummary(forecastTargets, {
            orientation: details?.orientation,
            orientationLabel,
            orientationTag
        }),
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
