/**
 * Move Response Details
 *
 * Serialization helpers for the Red team's "Move Response" form. Red facilitator
 * and scribe submit these as reactions to Blue team moves. Stored in the existing
 * `actions` table: title → `goal`, expected effect → `expected_outcomes`, the
 * remaining fields are packed into `ally_contingencies` behind a recognizable
 * prefix so `getMoveResponseViewModel` can reconstruct them for display.
 */

export const MOVE_RESPONSE_DETAILS_PREFIX = 'Move Response Details';
export const MOVE_RESPONSE_ACTION_MECHANISM = 'Move Response';

function normalizeString(value) {
    return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim()
        : '';
}

export function serializeMoveResponseDetails(details = {}) {
    return [
        MOVE_RESPONSE_DETAILS_PREFIX,
        `Strategic Assessment: ${normalizeString(details.strategicAssessment)}`,
        `Response Strategy: ${normalizeString(details.responseStrategy)}`,
        `Key Actions: ${normalizeString(details.keyActions)}`,
        `Targets And Pressure Points: ${normalizeString(details.targetsAndPressurePoints)}`,
        `Delivery Channel: ${normalizeString(details.deliveryChannel)}`
    ].join('\n');
}

export function parseMoveResponseDetails(value = '') {
    if (typeof value !== 'string' || !value.startsWith(MOVE_RESPONSE_DETAILS_PREFIX)) {
        return null;
    }

    try {
        const lines = value
            .slice(MOVE_RESPONSE_DETAILS_PREFIX.length)
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        const parsed = Object.fromEntries(
            lines
                .map((line) => {
                    const separatorIndex = line.indexOf(':');
                    if (separatorIndex === -1) return null;
                    return [
                        line.slice(0, separatorIndex).trim(),
                        line.slice(separatorIndex + 1).trim()
                    ];
                })
                .filter(Boolean)
        );

        return {
            strategicAssessment: normalizeString(parsed['Strategic Assessment']),
            responseStrategy: normalizeString(parsed['Response Strategy']),
            keyActions: normalizeString(parsed['Key Actions']),
            targetsAndPressurePoints: normalizeString(parsed['Targets And Pressure Points']),
            deliveryChannel: normalizeString(parsed['Delivery Channel'])
        };
    } catch (_err) {
        return null;
    }
}

export function getMoveResponseViewModel(action = {}) {
    const details = parseMoveResponseDetails(action.ally_contingencies);

    return {
        hasMoveResponseDetails: Boolean(details),
        title: action.goal || action.title || 'Untitled response',
        strategicAssessment: details?.strategicAssessment || '',
        responseStrategy: details?.responseStrategy || '',
        keyActions: details?.keyActions || '',
        targetsAndPressurePoints: details?.targetsAndPressurePoints || '',
        deliveryChannel: details?.deliveryChannel || '',
        expectedEffect: action.expected_outcomes || ''
    };
}
