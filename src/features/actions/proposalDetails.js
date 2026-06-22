/**
 * Proposal Details
 *
 * Shared option lists + serialization for the New Proposal modal used by Green
 * (and eventually Blue) teams. Fields are packed into an action's
 * `ally_contingencies` text blob behind a recognizable prefix so existing
 * card / review code paths can opt into proposal-shaped display via
 * `getProposalViewModel`.
 */

export const PROPOSAL_DETAILS_PREFIX = 'Proposal Details';
export const PROPOSAL_ACTION_MECHANISM = 'Proposal';

export const PROPOSAL_ORIGINATORS = Object.freeze([
    'EU',
    'France',
    'UK',
    'ROK',
    'ASEAN',
    'Japan'
]);

export const PROPOSAL_CATEGORIES = Object.freeze([
    'Partnership',
    'Conditions',
    'Alignment',
    'Refusal',
    'Other'
]);

export const PROPOSAL_SECTORS = Object.freeze([
    'Biotechnology',
    'Agriculture',
    'Telecommunications',
    'Other'
]);

export const PROPOSAL_DELIVERIES = Object.freeze([
    'Diplomatic Engagement',
    'Joint Statement',
    'Backchannel Negotiation',
    'Multilateral Forum',
    'Other'
]);

function normalizeString(value) {
    return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim()
        : '';
}

function normalizeStringList(values = []) {
    if (!Array.isArray(values)) return [];
    return values.map((value) => normalizeString(value)).filter(Boolean);
}

export function serializeProposalDetails(details = {}) {
    const originators = normalizeStringList(details.originators);
    return [
        PROPOSAL_DETAILS_PREFIX,
        `Originators: ${originators.length ? originators.join(', ') : 'None selected'}`,
        `Objective: ${normalizeString(details.objective)}`,
        `Category: ${normalizeString(details.category)}`,
        `Intended Partners: ${normalizeString(details.intendedPartners)}`,
        `Delivery: ${normalizeString(details.delivery)}`,
        `Timing And Conditions: ${normalizeString(details.timingAndConditions)}`,
        `Recipient Team: ${normalizeString(details.recipientTeam)}`
    ].join('\n');
}

export function parseProposalDetails(value = '') {
    if (typeof value !== 'string' || !value.startsWith(PROPOSAL_DETAILS_PREFIX)) {
        return null;
    }

    try {
        const lines = value
            .slice(PROPOSAL_DETAILS_PREFIX.length)
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

        const originatorsValue = parsed.Originators === 'None selected' ? '' : parsed.Originators;

        return {
            originators: normalizeStringList(originatorsValue ? originatorsValue.split(',') : []),
            objective: normalizeString(parsed.Objective),
            category: normalizeString(parsed.Category),
            intendedPartners: normalizeString(parsed['Intended Partners']),
            delivery: normalizeString(parsed.Delivery),
            timingAndConditions: normalizeString(parsed['Timing And Conditions']),
            recipientTeam: normalizeString(parsed['Recipient Team'])
        };
    } catch (_error) {
        return null;
    }
}

export function getProposalViewModel(action = {}) {
    const details = parseProposalDetails(action.ally_contingencies);

    return {
        hasProposalDetails: Boolean(details),
        title: action.goal || action.title || 'Untitled proposal',
        originators: details?.originators || [],
        objective: details?.objective || '',
        category: details?.category || '',
        intendedPartners: details?.intendedPartners || '',
        focusSector: action.sector || '',
        delivery: details?.delivery || '',
        timingAndConditions: details?.timingAndConditions || '',
        expectedOutcomes: action.expected_outcomes || '',
        recipientTeam: details?.recipientTeam || ''
    };
}

export function formatProposalSelection(values = [], fallback = 'Not specified') {
    return Array.isArray(values) && values.length ? values.join(', ') : fallback;
}
