/**
 * Proposal Details
 *
 * Shared option lists + serialization for the New Proposal modal used by
 * proposal-capable teams. Fields are packed into an action's
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

export const PROPOSAL_SCRIBE_HANDOFF = Object.freeze({
    DRAFT: 'Draft',
    FORWARDED: 'Forwarded'
});

function normalizeString(value) {
    return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim()
        : '';
}

function normalizeStringList(values = []) {
    if (!Array.isArray(values)) return [];
    return values.map((value) => normalizeString(value)).filter(Boolean);
}

function serializeStringList(values = []) {
    const normalizedValues = normalizeStringList(values);
    return normalizedValues.length ? JSON.stringify(normalizedValues) : 'None selected';
}

function parseStringList(value = '') {
    const normalizedValue = normalizeString(value);
    if (!normalizedValue || normalizedValue === 'None selected') return [];

    try {
        const parsedValue = JSON.parse(normalizedValue);
        if (Array.isArray(parsedValue)) {
            return normalizeStringList(parsedValue);
        }
    } catch (_error) {
        // Fall through for legacy comma-separated values.
    }

    return normalizeStringList(normalizedValue.split(','));
}

function normalizeDecision(value = '') {
    const normalizedValue = normalizeString(value).toLowerCase();
    if (normalizedValue === 'yes') return 'Yes';
    if (normalizedValue === 'no') return 'No';
    return '';
}

function normalizeRevisionMetadata(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const revisionNumberValue = source.revisionNumber ?? source.revision_number;
    const revisionNumber = Number(revisionNumberValue);

    return {
        revisionNumber: Number.isInteger(revisionNumber) && revisionNumber >= 1 ? revisionNumber : null,
        revisionNumberOrigin: normalizeString(source.revisionNumberOrigin ?? source.revision_number_origin),
        priorWorkflowState: normalizeString(source.priorWorkflowState ?? source.prior_workflow_state),
        reviewedAt: normalizeString(source.reviewedAt ?? source.reviewed_at),
        reviewedByRole: normalizeString(source.reviewedByRole ?? source.reviewed_by_role),
        reviewNotes: normalizeString(source.reviewNotes ?? source.review_notes),
        completedAt: normalizeString(source.completedAt ?? source.completed_at)
    };
}

function parseRevisionMetadata(value = '') {
    if (!normalizeString(value)) return normalizeRevisionMetadata();

    try {
        return normalizeRevisionMetadata(JSON.parse(value));
    } catch (_error) {
        return normalizeRevisionMetadata();
    }
}

function mergeRevisionMetadata(action = {}, embedded = {}) {
    return normalizeRevisionMetadata({
        revisionNumber: action.revision_number ?? embedded.revisionNumber,
        revisionNumberOrigin: action.revision_number_origin ?? embedded.revisionNumberOrigin,
        priorWorkflowState: action.prior_workflow_state ?? embedded.priorWorkflowState,
        reviewedAt: action.reviewed_at ?? embedded.reviewedAt,
        reviewedByRole: action.reviewed_by_role ?? embedded.reviewedByRole,
        reviewNotes: action.review_notes ?? embedded.reviewNotes,
        completedAt: action.completed_at ?? embedded.completedAt
    });
}

function formatDetailSelection(values = [], fallback = '') {
    return Array.isArray(values) && values.length ? values.join(', ') : fallback;
}

function formatRecipientTeams(values = []) {
    return normalizeStringList(values).map((team) => {
        const normalizedTeam = team.toLowerCase();
        return ['blue', 'red', 'green'].includes(normalizedTeam)
            ? `${normalizedTeam[0].toUpperCase()}${normalizedTeam.slice(1)} Team`
            : (normalizedTeam === 'industry' ? 'Industry Team' : team);
    }).join(', ');
}

function buildProposalArtifactDetails(viewModel = {}) {
    const revision = viewModel.revisionMetadata || {};
    const isIndustryProposal = viewModel.team === 'industry';
    const instrumentOfPower = formatDetailSelection(
        viewModel.instruments,
        isIndustryProposal ? viewModel.category : ''
    );
    return [
        { label: 'Proposal Objective', value: viewModel.objective },
        { label: 'Originators', value: formatDetailSelection(viewModel.originators) },
        { label: 'Instrument of Power', value: instrumentOfPower },
        { label: 'Category', value: isIndustryProposal ? '' : viewModel.category },
        { label: 'Intended Partners', value: viewModel.intendedPartners },
        { label: 'Recipient Teams', value: formatRecipientTeams(viewModel.recipientTeams) },
        { label: 'Focus Sectors', value: formatDetailSelection(viewModel.focusSectors) },
        { label: 'Supply Chain Decision', value: viewModel.supplyChainFocusDecision },
        { label: 'Action Angles', value: formatDetailSelection(viewModel.supplyChainActionAngles) },
        { label: 'Supply Chain Areas', value: formatDetailSelection(viewModel.supplyChainAreas) },
        { label: 'Industry Focus', value: viewModel.industryFocus },
        { label: 'Country Focus', value: viewModel.countryFocus },
        { label: 'Proposed Activity', value: viewModel.proposedActivity },
        { label: 'Delivery', value: viewModel.delivery },
        { label: 'Timing & Conditions', value: viewModel.timingAndConditions },
        { label: 'Expected Outcomes', value: viewModel.expectedOutcomes },
        { label: 'Revision', value: revision.revisionNumber === null ? '' : String(revision.revisionNumber) },
        { label: 'Prior Workflow State', value: revision.priorWorkflowState },
        { label: 'Reviewed At', value: revision.reviewedAt },
        { label: 'Reviewed By', value: revision.reviewedByRole },
        { label: 'Review Notes', value: revision.reviewNotes },
        { label: 'Completed At', value: revision.completedAt }
    ].filter((field) => field.value !== '' && field.value !== null && field.value !== undefined);
}

function normalizeScribeHandoff(value = '') {
    const normalizedValue = normalizeString(value).toLowerCase();

    if (normalizedValue === 'forwarded' || normalizedValue === 'forwarded to scribe') {
        return PROPOSAL_SCRIBE_HANDOFF.FORWARDED;
    }

    if (normalizedValue === 'draft') {
        return PROPOSAL_SCRIBE_HANDOFF.DRAFT;
    }

    return '';
}

export function serializeProposalDetails(details = {}) {
    const originators = normalizeStringList(details.originators);
    const recipientTeams = normalizeStringList(
        Array.isArray(details.recipientTeams)
            ? details.recipientTeams
            : (details.recipientTeam ? [details.recipientTeam] : [])
    );
    const focusSectors = normalizeStringList(
        Array.isArray(details.focusSectors)
            ? details.focusSectors
            : (details.focusSector ? [details.focusSector] : [])
    );
    const supplyChainActionAngles = normalizeStringList(details.supplyChainActionAngles);
    const supplyChainAreas = normalizeStringList(details.supplyChainAreas);
    const supplyChainFocusDecision = normalizeDecision(details.supplyChainFocusDecision)
        || (supplyChainActionAngles.length || supplyChainAreas.length ? 'Yes' : '');
    const revisionMetadata = normalizeRevisionMetadata(details.revisionMetadata || details);
    const scribeHandoff = normalizeScribeHandoff(details.scribeHandoff)
        || PROPOSAL_SCRIBE_HANDOFF.DRAFT;
    return [
        PROPOSAL_DETAILS_PREFIX,
        `Originators: ${serializeStringList(originators)}`,
        `Objective: ${normalizeString(details.objective)}`,
        `Instruments: ${serializeStringList(details.instruments)}`,
        `Category: ${normalizeString(details.category)}`,
        `Intended Partners: ${normalizeString(details.intendedPartners)}`,
        `Delivery: ${normalizeString(details.delivery)}`,
        `Timing And Conditions: ${normalizeString(details.timingAndConditions)}`,
        `Recipient Teams: ${serializeStringList(recipientTeams)}`,
        `Focus Sectors: ${serializeStringList(focusSectors)}`,
        `Supply Chain Focus Decision: ${supplyChainFocusDecision || 'Not selected'}`,
        `Supply Chain Action Angles: ${serializeStringList(supplyChainFocusDecision === 'No' ? [] : supplyChainActionAngles)}`,
        `Supply Chain Areas: ${serializeStringList(supplyChainFocusDecision === 'No' ? [] : supplyChainAreas)}`,
        `Industry Focus: ${normalizeString(details.industryFocus)}`,
        `Country Focus: ${normalizeString(details.countryFocus)}`,
        `Proposed Activity: ${normalizeString(details.proposedActivity)}`,
        `Revision Metadata: ${JSON.stringify(revisionMetadata)}`,
        `Scribe Handoff: ${scribeHandoff}`
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

        const originators = parseStringList(parsed.Originators);
        const recipientTeams = parseStringList(parsed['Recipient Teams'] || parsed['Recipient Team']);
        const focusSectors = parseStringList(parsed['Focus Sectors'] || parsed['Focus Sector']);
        const parsedSupplyChainActionAngles = parseStringList(parsed['Supply Chain Action Angles']);
        const parsedSupplyChainAreas = parseStringList(parsed['Supply Chain Areas']);
        const supplyChainFocusDecision = normalizeDecision(parsed['Supply Chain Focus Decision'])
            || (parsedSupplyChainActionAngles.length || parsedSupplyChainAreas.length ? 'Yes' : '');
        const supplyChainActionAngles = supplyChainFocusDecision === 'No' ? [] : parsedSupplyChainActionAngles;
        const supplyChainAreas = supplyChainFocusDecision === 'No' ? [] : parsedSupplyChainAreas;

        return {
            originators,
            objective: normalizeString(parsed.Objective),
            instruments: parseStringList(parsed.Instruments),
            category: normalizeString(parsed.Category),
            intendedPartners: normalizeString(parsed['Intended Partners']),
            delivery: normalizeString(parsed.Delivery),
            timingAndConditions: normalizeString(parsed['Timing And Conditions']),
            recipientTeam: recipientTeams[0] || '',
            recipientTeams,
            focusSector: focusSectors[0] || '',
            focusSectors,
            supplyChainFocusDecision,
            supplyChainActionAngles,
            supplyChainAreas,
            industryFocus: normalizeString(parsed['Industry Focus']),
            countryFocus: normalizeString(parsed['Country Focus']),
            proposedActivity: normalizeString(parsed['Proposed Activity']),
            revisionMetadata: parseRevisionMetadata(parsed['Revision Metadata']),
            scribeHandoff: normalizeScribeHandoff(parsed['Scribe Handoff'])
        };
    } catch (_error) {
        return null;
    }
}

export function isProposalAction(action = {}) {
    return Boolean(parseProposalDetails(action?.ally_contingencies))
        || normalizeString(action?.mechanism) === PROPOSAL_ACTION_MECHANISM;
}

export function getProposalViewModel(action = {}) {
    const details = parseProposalDetails(action.ally_contingencies);
    const recipientTeams = details?.recipientTeams?.length
        ? details.recipientTeams
        : normalizeStringList(details?.recipientTeam ? [details.recipientTeam] : []);
    const focusSectors = details?.focusSectors?.length
        ? details.focusSectors
        : normalizeStringList(details?.focusSector
            ? [details.focusSector]
            : (action.sector ? [action.sector] : []));
    const revisionMetadata = mergeRevisionMetadata(action, details?.revisionMetadata);

    const viewModel = {
        hasProposalDetails: Boolean(details),
        team: normalizeString(action.team).toLowerCase(),
        title: action.goal || action.title || 'Untitled proposal',
        originators: details?.originators || [],
        objective: details?.objective || '',
        instrumentOfPower: details?.instruments?.[0] || '',
        instruments: details?.instruments || [],
        category: details?.category || '',
        intendedPartners: details?.intendedPartners || '',
        focusSector: focusSectors[0] || '',
        focusSectors,
        delivery: details?.delivery || '',
        timingAndConditions: details?.timingAndConditions || '',
        expectedOutcomes: action.expected_outcomes || '',
        recipientTeam: recipientTeams[0] || '',
        recipientTeams,
        supplyChainFocusDecision: details?.supplyChainFocusDecision || '',
        supplyChainActionAngles: details?.supplyChainActionAngles || [],
        supplyChainAreas: details?.supplyChainAreas || [],
        industryFocus: details?.industryFocus || '',
        countryFocus: details?.countryFocus || '',
        proposedActivity: details?.proposedActivity || '',
        revisionMetadata,
        scribeHandoff: details?.scribeHandoff || ''
    };

    return {
        ...viewModel,
        artifactDetails: buildProposalArtifactDetails(viewModel)
    };
}

export function isProposalForwardedToScribe(action = {}) {
    return getProposalViewModel(action).scribeHandoff === PROPOSAL_SCRIBE_HANDOFF.FORWARDED;
}

export function formatProposalSelection(values = [], fallback = 'Not specified') {
    return Array.isArray(values) && values.length ? values.join(', ') : fallback;
}
