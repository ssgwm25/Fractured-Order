import { getArtifactLifecycleViewModel } from './artifactLifecycle.js';

export const INDUSTRY_TURN_SHEET_VERSION = 1;

export const INDUSTRY_TURN_SHEET_SECTORS = Object.freeze([
    Object.freeze({ value: 'agriculture', label: 'Agriculture', strategicPlanKey: 'Agriculture' }),
    Object.freeze({ value: 'biotechnology', label: 'Biotechnology', strategicPlanKey: 'Biotechnology' }),
    Object.freeze({ value: 'telecommunications', label: 'Telecommunications', strategicPlanKey: 'Telecommunications' })
]);

export const INDUSTRY_ENVIRONMENT_ACTORS = Object.freeze([
    Object.freeze({ value: 'blue', label: 'Blue (U.S.)' }),
    Object.freeze({ value: 'red_china', label: 'Red — China' }),
    Object.freeze({ value: 'green_asia_pacific', label: 'Green — Asia Pacific' }),
    Object.freeze({ value: 'green_europe', label: 'Green — Europe' })
]);

export const INDUSTRY_ACTION_CODES = Object.freeze([
    ['A', 'Sanctions / secondary sanctions'],
    ['B', 'Export controls'],
    ['C', 'Tariffs'],
    ['D', 'Subsidies or incentives'],
    ['E', 'Investment screening'],
    ['F', 'Procurement / “buy national” rules'],
    ['G', 'Trade deal or purchase pledge'],
    ['H', 'Diplomatic signal or summit'],
    ['I', 'Retaliation'],
    ['J', 'Critical-mineral or input restriction'],
    ['K', 'Security or military escalation'],
    ['L', 'IP enforcement or tech-transfer restriction'],
    ['M', 'No significant action'],
    ['N', 'Other']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_SUPPLY_CHAIN_STAGES = Object.freeze([
    ['raw_inputs', 'Inputs / raw materials'],
    ['refinement_processing', 'Refinement / processing'],
    ['manufacturing_production', 'Manufacturing / production'],
    ['distribution_logistics', 'Distribution / logistics'],
    ['end_market_customers', 'End market / customers']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_LOCATION_OPTIONS = Object.freeze([
    ['blue', 'Blue'], ['red', 'Red'], ['green_asia_pacific', 'Green — Asia Pacific'],
    ['green_europe', 'Green — Europe'], ['other', 'Other']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_PLANNED_ACTIONS = Object.freeze([
    'hold', 'diversify', 'reshore', 'stockpile', 'partner', 'exit'
]);

export const INDUSTRY_DECISION_STATUSES = Object.freeze([
    ['new', 'New'], ['continuing', 'Continuing'], ['modified', 'Modified'], ['abandoned', 'Abandoned']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_PRIMARY_MOVES = Object.freeze([
    ['diversify_friendshore_suppliers', 'Diversify / friend-shore suppliers'],
    ['reshore_production_us', 'Reshore production to the U.S.'],
    ['stockpile', 'Stockpile'],
    ['acquire_invest_us_green', 'Acquire / invest in U.S. or Green'],
    ['divest_exit_red_exposed', 'Divest / exit Red-exposed assets'],
    ['partner_green_nation_firm', 'Partner with Green nation / firm'],
    ['lobby_blue', 'Lobby Blue'],
    ['seek_license_waiver_carveout', 'Seek license / waiver / carve-out'],
    ['overcomply_derisk', 'Over-comply / de-risk'],
    ['protect_enforce_ip', 'Protect / enforce IP'],
    ['shift_rd_product', 'Shift R&D / product'],
    ['engage_red_trade_licensing_jv', 'Engage Red through trade / licensing / joint venture'],
    ['coordinate_other_industry', 'Coordinate with another industry'],
    ['hold_wait', 'Hold / wait'],
    ['other', 'Other']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_COUNTERPARTIES = Object.freeze([
    ['blue_agency', 'Blue agency'], ['green_nation_firm', 'Green nation / firm'],
    ['red_nation_firm', 'Red nation / firm'], ['other_industry_sector', 'Other Industry sector'],
    ['other', 'Other']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_VISIBILITY = Object.freeze([
    ['public', 'Public'], ['private', 'Private'], ['confidential_blue', 'Confidential — Blue']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_ASK_OPTIONS = Object.freeze([
    ['subsidy', 'Subsidy'], ['waiver', 'Waiver'], ['protection', 'Protection'],
    ['intelligence', 'Intelligence'], ['market_access', 'Market access'], ['other', 'Other']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_OFFER_OPTIONS = Object.freeze([
    ['investment', 'Investment'], ['jobs', 'Jobs'], ['compliance', 'Compliance'],
    ['capacity', 'Capacity'], ['information', 'Information'], ['other', 'Other']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_EFFECT_DIMENSIONS = Object.freeze([
    ['firmRevenue', 'Firm revenue'], ['operatingCost', 'Operating cost'],
    ['usJobs', 'U.S. jobs'], ['capacitySupplySecurity', 'Capacity / supply security']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_EFFECT_DIRECTIONS = Object.freeze([
    ['down', 'Down'], ['unchanged', 'No change'], ['up', 'Up'],
    ['unknown', 'Unknown'], ['not_applicable', 'Not applicable']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_EFFECT_MAGNITUDES = Object.freeze(['small', 'medium', 'large', 'unknown', 'not_applicable']);
export const INDUSTRY_EFFECT_TIMINGS = Object.freeze(['this_quarter', 'q_plus_1', 'q_plus_2', 'q_plus_3', 'q_plus_4_or_later', 'unknown', 'not_applicable']);
export const INDUSTRY_EFFECT_PATTERNS = Object.freeze(['one_time', 'ongoing', 'phased', 'unknown', 'not_applicable']);
export const INDUSTRY_ESCALATION_MARKERS = Object.freeze([
    ['red_loss_of_face', 'Loss of face for Red'], ['strain_green', 'Strain with Green'],
    ['strain_blue', 'Strain with Blue'], ['likely_red_retaliation', 'Likely Red retaliation'], ['none', 'None']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_RISK_TYPES = Object.freeze([
    ['retaliation', 'Retaliation'], ['secondary_sanctions_exposure', 'Secondary-sanctions exposure'],
    ['supply_disruption', 'Supply disruption'], ['ip_theft_forced_tech_transfer', 'IP theft / forced tech transfer'],
    ['regulatory_legal', 'Regulatory / legal'], ['reputational', 'Reputational'],
    ['stranded_assets', 'Stranded assets'], ['lost_market_access', 'Lost market access'], ['other', 'Other']
].map(([value, label]) => Object.freeze({ value, label })));

export const INDUSTRY_RISK_MOVEMENTS = Object.freeze(['reduced', 'unchanged', 'increased', 'materialized', 'new']);
export const INDUSTRY_STANCE_OPTIONS = Object.freeze([
    [1, 'Profit first'], [2, 'Business leaning'], [3, 'Balanced'],
    [4, 'National-interest leaning'], [5, 'National interest first']
].map(([value, label]) => Object.freeze({ value, label })));

const LEVELS = new Set(['low', 'medium', 'high']);
const NET_VALUES = new Set(['positive', 'neutral', 'negative']);
const IP_EFFECTS = new Set(['reduces', 'no_change', 'raises']);
const SPILLOVER_DIRECTIONS = new Set(['positive', 'neutral', 'negative', 'mixed']);

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function strings(values = []) {
    return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function boolOrNull(value) {
    return typeof value === 'boolean' ? value : null;
}

function integerOrNull(value) {
    if (value === '' || value == null) return null;
    const number = Number(value);
    return Number.isInteger(number) ? number : null;
}

function optionValues(options) {
    return new Set(options.map((option) => typeof option === 'string' ? option : option.value));
}

function allowed(value, options) {
    const normalized = text(value);
    return optionValues(options).has(normalized) ? normalized : '';
}

function id(prefix = 'id') {
    const uuid = globalThis.crypto?.randomUUID?.();
    return uuid || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function blankActor(actor) {
    return { actor, actionCodes: [], otherActionDescription: '', actionNarrative: '', interestImpact: null, confidence: '', matchedForecast: '' };
}

function blankStage(stage) {
    return { stage, whereWho: [], otherLocationDescription: '', redDependency: '', plannedActions: [], notes: '' };
}

function blankEffect() {
    return { direction: '', magnitude: '', timing: '', pattern: '' };
}

function blankEngagement() {
    return { engaged: null, linkedRecordId: null, source: null, destination: null, contact: null, outcome: null };
}

export function createBlankIndustryTurnSheet({ move = 1, strategicPlanId = null } = {}) {
    return {
        version: INDUSTRY_TURN_SHEET_VERSION,
        proposalId: null,
        sessionId: null,
        industry: '',
        move: Number(move) || 1,
        proposalOrdinalForIndustryMove: null,
        isFirstProposalForIndustryMove: false,
        strategicPlanId,
        linkedStrategicPriorityIds: [],
        recipientTeams: [],
        previousMoveProposalId: null,
        environmentBaselineProposalId: null,
        supplyChainBaselineProposalId: null,
        environment: {
            actors: INDUSTRY_ENVIRONMENT_ACTORS.map(({ value }) => blankActor(value)),
            biggestSurprise: ''
        },
        supplyChain: {
            stages: INDUSTRY_SUPPLY_CHAIN_STAGES.map(({ value }) => blankStage(value)),
            weakestLink: '',
            changeSinceLastMove: ''
        },
        decision: {
            coordinatedWithOtherSector: null,
            coordinatedSectors: [],
            status: '',
            priorDecisionId: null,
            primaryMove: '',
            otherPrimaryMove: '',
            counterparty: { type: '', names: [] },
            capitalCommitment: '',
            visibility: '',
            ask: [],
            askOtherDescription: '',
            offer: [],
            offerOtherDescription: '',
            stakeholderValue: {
                blue: { name: 'Blue', gain: '', giveUpOrRisk: '', net: '' },
                counterparty: { name: 'Counterparty', gain: '', giveUpOrRisk: '', net: '' },
                other: { name: '', gain: '', giveUpOrRisk: '', net: '' }
            },
            intendedEffect: '',
            rationale: '',
            implementation: ''
        },
        expectedEffects: Object.fromEntries(INDUSTRY_EFFECT_DIMENSIONS.map(({ value }) => [value, blankEffect()])),
        escalationMarkers: [],
        escalationRationale: '',
        engagement: {
            outbound: blankEngagement(),
            inbound: blankEngagement(),
            partnerCheckComplete: null
        },
        risks: [{ id: id('risk'), priorRiskId: null, type: '', otherDescription: '', likelihood: '', impact: '', mitigation: '', movementStatus: 'new' }],
        ipSecurityEffect: '',
        otherSectorSpillover: { hasMaterialSpillover: null, entries: [] },
        stance: null,
        blueMadeBothHarder: null,
        blueTradeoffExplanation: '',
        nextMoveForecasts: Object.fromEntries(INDUSTRY_ENVIRONMENT_ACTORS.map(({ value }) => [value, { actionCodes: [], otherActionDescription: '', explanation: '' }])),
        positionChangeTrigger: '',
        facilitatorNote: ''
    };
}

function normalizeCodes(values) {
    const order = INDUSTRY_ACTION_CODES.map(({ value }) => value);
    const selected = new Set(strings(values).filter((value) => order.includes(value)));
    if (selected.has('M')) return ['M'];
    return order.filter((value) => selected.has(value));
}

function normalizeActor(source = {}, actor) {
    const actionCodes = normalizeCodes(source.actionCodes);
    const impact = integerOrNull(source.interestImpact);
    return {
        actor,
        actionCodes,
        otherActionDescription: actionCodes.includes('N') ? text(source.otherActionDescription) : '',
        actionNarrative: text(source.actionNarrative),
        interestImpact: impact != null && impact >= -2 && impact <= 2 ? impact : null,
        confidence: LEVELS.has(text(source.confidence)) ? text(source.confidence) : '',
        matchedForecast: ['yes', 'partly', 'no'].includes(text(source.matchedForecast)) ? text(source.matchedForecast) : ''
    };
}

function normalizeStage(source = {}, stage) {
    const whereWho = strings(source.whereWho).filter((value) => optionValues(INDUSTRY_LOCATION_OPTIONS).has(value));
    return {
        stage,
        whereWho,
        otherLocationDescription: whereWho.includes('other') ? text(source.otherLocationDescription) : '',
        redDependency: LEVELS.has(text(source.redDependency)) ? text(source.redDependency) : '',
        plannedActions: strings(source.plannedActions).filter((value) => INDUSTRY_PLANNED_ACTIONS.includes(value)),
        notes: text(source.notes)
    };
}

function normalizeEffect(source = {}) {
    const direction = allowed(source.direction, INDUSTRY_EFFECT_DIRECTIONS);
    if (['unknown', 'not_applicable'].includes(direction)) {
        return { direction, magnitude: direction, timing: direction, pattern: direction };
    }
    return {
        direction,
        magnitude: allowed(source.magnitude, INDUSTRY_EFFECT_MAGNITUDES),
        timing: allowed(source.timing, INDUSTRY_EFFECT_TIMINGS),
        pattern: allowed(source.pattern, INDUSTRY_EFFECT_PATTERNS)
    };
}

function normalizeEngagement(source = {}, direction = 'outbound') {
    const engaged = boolOrNull(source.engaged);
    return {
        engaged,
        linkedRecordId: engaged ? text(source.linkedRecordId) || null : null,
        source: direction === 'inbound' && engaged ? text(source.source) || null : null,
        destination: direction === 'outbound' && engaged ? text(source.destination) || null : null,
        contact: engaged ? text(source.contact) || null : null,
        outcome: engaged ? text(source.outcome) || null : null
    };
}

function normalizeRisk(source = {}, index = 0, proposalId = '') {
    const priorRiskId = text(source.priorRiskId) || null;
    const movementStatus = priorRiskId
        ? allowed(source.movementStatus, INDUSTRY_RISK_MOVEMENTS.filter((value) => value !== 'new'))
        : 'new';
    const type = allowed(source.type, INDUSTRY_RISK_TYPES);
    return {
        id: text(source.id) || `${proposalId || 'industry-proposal'}-risk-${index + 1}`,
        priorRiskId,
        type,
        otherDescription: type === 'other' ? text(source.otherDescription) : '',
        likelihood: LEVELS.has(text(source.likelihood)) ? text(source.likelihood) : '',
        impact: LEVELS.has(text(source.impact)) ? text(source.impact) : '',
        mitigation: text(source.mitigation),
        movementStatus
    };
}

export function normalizeIndustryTurnSheet(input = {}, context = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const blank = createBlankIndustryTurnSheet({ move: source.move || context.move, strategicPlanId: source.strategicPlanId || context.strategicPlanId });
    const proposalId = text(source.proposalId || context.proposalId) || null;
    const actorByKey = new Map((Array.isArray(source.environment?.actors) ? source.environment.actors : []).map((actor) => [actor?.actor, actor]));
    const stageByKey = new Map((Array.isArray(source.supplyChain?.stages) ? source.supplyChain.stages : []).map((stage) => [stage?.stage, stage]));
    const industry = allowed(source.industry, INDUSTRY_TURN_SHEET_SECTORS);
    const ownSector = industry;
    const status = allowed(source.decision?.status, INDUSTRY_DECISION_STATUSES);
    const primaryMove = allowed(source.decision?.primaryMove, INDUSTRY_PRIMARY_MOVES);
    const counterpartyType = allowed(source.decision?.counterparty?.type, INDUSTRY_COUNTERPARTIES);
    const visibility = allowed(source.decision?.visibility, INDUSTRY_VISIBILITY);
    const ask = strings(source.decision?.ask).filter((value) => optionValues(INDUSTRY_ASK_OPTIONS).has(value));
    const offer = strings(source.decision?.offer).filter((value) => optionValues(INDUSTRY_OFFER_OPTIONS).has(value));
    const spillover = source.otherSectorSpillover && typeof source.otherSectorSpillover === 'object'
        ? source.otherSectorSpillover : blank.otherSectorSpillover;
    const hasSpillover = boolOrNull(spillover.hasMaterialSpillover);
    const risks = (Array.isArray(source.risks) ? source.risks : blank.risks).slice(0, 3)
        .map((risk, index) => normalizeRisk(risk, index, proposalId || 'industry-proposal'));

    return {
        ...blank,
        version: INDUSTRY_TURN_SHEET_VERSION,
        proposalId,
        sessionId: text(source.sessionId || context.sessionId) || null,
        industry,
        move: Number(source.move || context.move || 1),
        proposalOrdinalForIndustryMove: integerOrNull(source.proposalOrdinalForIndustryMove),
        isFirstProposalForIndustryMove: Boolean(source.isFirstProposalForIndustryMove),
        strategicPlanId: text(source.strategicPlanId || context.strategicPlanId) || null,
        linkedStrategicPriorityIds: strings(source.linkedStrategicPriorityIds),
        recipientTeams: strings(source.recipientTeams).map((value) => value.toLowerCase()).filter((value) => ['blue', 'red'].includes(value)),
        previousMoveProposalId: text(source.previousMoveProposalId) || null,
        environmentBaselineProposalId: text(source.environmentBaselineProposalId) || null,
        supplyChainBaselineProposalId: text(source.supplyChainBaselineProposalId) || null,
        environment: {
            actors: INDUSTRY_ENVIRONMENT_ACTORS.map(({ value }) => normalizeActor(actorByKey.get(value), value)),
            biggestSurprise: text(source.environment?.biggestSurprise)
        },
        supplyChain: {
            stages: INDUSTRY_SUPPLY_CHAIN_STAGES.map(({ value }) => normalizeStage(stageByKey.get(value), value)),
            weakestLink: text(source.supplyChain?.weakestLink),
            changeSinceLastMove: ['better', 'same', 'worse'].includes(text(source.supplyChain?.changeSinceLastMove))
                ? text(source.supplyChain.changeSinceLastMove) : ''
        },
        decision: {
            coordinatedWithOtherSector: boolOrNull(source.decision?.coordinatedWithOtherSector),
            coordinatedSectors: strings(source.decision?.coordinatedSectors).filter((value) => optionValues(INDUSTRY_TURN_SHEET_SECTORS).has(value) && value !== ownSector),
            status,
            priorDecisionId: status && status !== 'new' ? text(source.decision?.priorDecisionId) || null : null,
            primaryMove,
            otherPrimaryMove: primaryMove === 'other' ? text(source.decision?.otherPrimaryMove) : '',
            counterparty: { type: counterpartyType, names: strings(source.decision?.counterparty?.names) },
            capitalCommitment: LEVELS.has(text(source.decision?.capitalCommitment)) ? text(source.decision.capitalCommitment) : '',
            visibility,
            ask,
            askOtherDescription: ask.includes('other') ? text(source.decision?.askOtherDescription) : '',
            offer,
            offerOtherDescription: offer.includes('other') ? text(source.decision?.offerOtherDescription) : '',
            stakeholderValue: Object.fromEntries(['blue', 'counterparty', 'other'].map((key) => {
                const stakeholder = source.decision?.stakeholderValue?.[key] || blank.decision.stakeholderValue[key];
                return [key, {
                    name: key === 'other' ? text(stakeholder.name) : blank.decision.stakeholderValue[key].name,
                    gain: text(stakeholder.gain),
                    giveUpOrRisk: text(stakeholder.giveUpOrRisk),
                    net: NET_VALUES.has(text(stakeholder.net)) ? text(stakeholder.net) : ''
                }];
            })),
            intendedEffect: text(source.decision?.intendedEffect),
            rationale: text(source.decision?.rationale),
            implementation: text(source.decision?.implementation)
        },
        expectedEffects: Object.fromEntries(INDUSTRY_EFFECT_DIMENSIONS.map(({ value }) => [value, normalizeEffect(source.expectedEffects?.[value])])),
        escalationMarkers: (() => {
            const values = strings(source.escalationMarkers).filter((value) => optionValues(INDUSTRY_ESCALATION_MARKERS).has(value));
            return values.includes('none') ? ['none'] : values;
        })(),
        escalationRationale: text(source.escalationRationale),
        engagement: {
            outbound: normalizeEngagement(source.engagement?.outbound, 'outbound'),
            inbound: normalizeEngagement(source.engagement?.inbound, 'inbound'),
            partnerCheckComplete: boolOrNull(source.engagement?.partnerCheckComplete)
        },
        risks: risks.length ? risks : blank.risks,
        ipSecurityEffect: IP_EFFECTS.has(text(source.ipSecurityEffect)) ? text(source.ipSecurityEffect) : '',
        otherSectorSpillover: {
            hasMaterialSpillover: hasSpillover,
            entries: hasSpillover ? (Array.isArray(spillover.entries) ? spillover.entries : []).slice(0, 3).map((entry = {}) => ({
                affectedSector: text(entry.affectedSector),
                direction: SPILLOVER_DIRECTIONS.has(text(entry.direction)) ? text(entry.direction) : '',
                explanation: text(entry.explanation)
            })) : []
        },
        stance: (() => {
            const stance = integerOrNull(source.stance);
            return stance >= 1 && stance <= 5 ? stance : null;
        })(),
        blueMadeBothHarder: boolOrNull(source.blueMadeBothHarder),
        blueTradeoffExplanation: text(source.blueTradeoffExplanation),
        nextMoveForecasts: Object.fromEntries(INDUSTRY_ENVIRONMENT_ACTORS.map(({ value }) => {
            const forecast = source.nextMoveForecasts?.[value] || {};
            const actionCodes = normalizeCodes(forecast.actionCodes);
            return [value, {
                actionCodes,
                otherActionDescription: actionCodes.includes('N') ? text(forecast.otherActionDescription) : '',
                explanation: text(forecast.explanation)
            }];
        })),
        positionChangeTrigger: text(source.positionChangeTrigger),
        facilitatorNote: text(source.facilitatorNote)
    };
}

function error(errors, field, message, page) {
    errors.push({ field, message, page });
}

function validateCodes(errors, codes, other, field, page) {
    if (!codes.length) error(errors, field, 'Select at least one action code.', page);
    if (codes.includes('M') && codes.length > 1) error(errors, field, 'No significant action cannot be combined with another code.', page);
    if (codes.includes('N') && !other) error(errors, `${field}.otherActionDescription`, 'Describe the other action.', page);
}

export function validateIndustryTurnSheet(input = {}, { full = true } = {}) {
    const sheet = normalizeIndustryTurnSheet(input);
    const errors = [];
    if (!sheet.industry) error(errors, 'industry', 'Select an industry.', 1);
    if (!sheet.strategicPlanId) error(errors, 'strategicPlanId', 'A completed Industry Strategic Plan is required.', 1);
    if (!full) return errors;

    if (sheet.isFirstProposalForIndustryMove) {
        sheet.environment.actors.forEach((actor) => {
            const prefix = `environment.actors.${actor.actor}`;
            validateCodes(errors, actor.actionCodes, actor.otherActionDescription, `${prefix}.actionCodes`, 1);
            if (!actor.actionNarrative) error(errors, `${prefix}.actionNarrative`, 'Explain what this actor did or will do.', 1);
            if (actor.interestImpact == null) error(errors, `${prefix}.interestImpact`, 'Select the impact on firm interests.', 1);
            if (!actor.confidence) error(errors, `${prefix}.confidence`, 'Select confidence.', 1);
            if (!actor.matchedForecast) error(errors, `${prefix}.matchedForecast`, 'Select whether the action matched the forecast.', 1);
        });
        if (!sheet.environment.biggestSurprise) error(errors, 'environment.biggestSurprise', 'Enter the biggest surprise this move.', 1);
        sheet.supplyChain.stages.forEach((stage) => {
            const prefix = `supplyChain.stages.${stage.stage}`;
            if (!stage.whereWho.length) error(errors, `${prefix}.whereWho`, 'Select at least one location or actor.', 1);
            if (stage.whereWho.includes('other') && !stage.otherLocationDescription) error(errors, `${prefix}.otherLocationDescription`, 'Describe the other location or actor.', 1);
            if (!stage.redDependency) error(errors, `${prefix}.redDependency`, 'Select the Red dependency.', 1);
            if (!stage.plannedActions.length) error(errors, `${prefix}.plannedActions`, 'Select at least one planned action.', 1);
            if (!stage.notes) error(errors, `${prefix}.notes`, 'Enter stage notes.', 1);
        });
        if (!sheet.supplyChain.weakestLink) error(errors, 'supplyChain.weakestLink', 'Enter the weakest link.', 1);
        if (!sheet.supplyChain.changeSinceLastMove) error(errors, 'supplyChain.changeSinceLastMove', 'Select the change since last move.', 1);
    } else if (!sheet.environmentBaselineProposalId || !sheet.supplyChainBaselineProposalId) {
        error(errors, 'environmentBaselineProposalId', 'The current move baseline proposal is required.', 1);
    }

    const decision = sheet.decision;
    if (!sheet.recipientTeams.length) error(errors, 'recipientTeams', 'Select Blue, Red, or both as intended recipients.', 2);
    if (decision.coordinatedWithOtherSector == null) error(errors, 'decision.coordinatedWithOtherSector', 'Select whether this was coordinated with another sector.', 2);
    if (decision.coordinatedWithOtherSector && !decision.coordinatedSectors.length) error(errors, 'decision.coordinatedSectors', 'Select at least one other sector.', 2);
    if (!decision.status) error(errors, 'decision.status', 'Select the decision status.', 2);
    if (decision.status && decision.status !== 'new' && !decision.priorDecisionId) error(errors, 'decision.priorDecisionId', 'Select the prior completed decision.', 2);
    if (!decision.primaryMove) error(errors, 'decision.primaryMove', 'Select the primary move.', 2);
    if (decision.primaryMove === 'other' && !decision.otherPrimaryMove) error(errors, 'decision.otherPrimaryMove', 'Describe the other primary move.', 2);
    if (!decision.counterparty.type) error(errors, 'decision.counterparty.type', 'Select a counterparty category.', 2);
    if (!decision.counterparty.names.length) error(errors, 'decision.counterparty.names', 'Enter at least one counterparty name.', 2);
    if (!decision.capitalCommitment) error(errors, 'decision.capitalCommitment', 'Select the capital commitment.', 2);
    if (!decision.visibility) error(errors, 'decision.visibility', 'Select visibility.', 2);
    if (!decision.ask.length) error(errors, 'decision.ask', 'Select at least one ask.', 2);
    if (decision.ask.includes('other') && !decision.askOtherDescription) error(errors, 'decision.askOtherDescription', 'Describe the other ask.', 2);
    if (!decision.offer.length) error(errors, 'decision.offer', 'Select at least one offer.', 2);
    if (decision.offer.includes('other') && !decision.offerOtherDescription) error(errors, 'decision.offerOtherDescription', 'Describe the other offer.', 2);
    ['blue', 'counterparty', 'other'].forEach((key) => {
        const stakeholder = decision.stakeholderValue[key];
        const prefix = `decision.stakeholderValue.${key}`;
        if (key === 'other' && !stakeholder.name) error(errors, `${prefix}.name`, 'Name the other stakeholder.', 2);
        if (!stakeholder.gain) error(errors, `${prefix}.gain`, 'Describe what this stakeholder gains.', 2);
        if (!stakeholder.giveUpOrRisk) error(errors, `${prefix}.giveUpOrRisk`, 'Describe what this stakeholder gives up or risks.', 2);
        if (!stakeholder.net) error(errors, `${prefix}.net`, 'Select the net value.', 2);
    });
    if (!decision.intendedEffect) error(errors, 'decision.intendedEffect', 'Enter the intended effect.', 2);
    if (!decision.rationale) error(errors, 'decision.rationale', 'Enter the rationale.', 2);
    if (!decision.implementation) error(errors, 'decision.implementation', 'Enter the implementation approach.', 2);
    if (!sheet.linkedStrategicPriorityIds.length) error(errors, 'linkedStrategicPriorityIds', 'Link at least one Strategic Plan priority.', 2);

    Object.entries(sheet.expectedEffects).forEach(([key, effect]) => {
        ['direction', 'magnitude', 'timing', 'pattern'].forEach((field) => {
            if (!effect[field]) error(errors, `expectedEffects.${key}.${field}`, `Select ${field}.`, 2);
        });
    });
    if (!sheet.escalationMarkers.length) error(errors, 'escalationMarkers', 'Select at least one escalation marker.', 2);
    if (!sheet.escalationRationale) error(errors, 'escalationRationale', 'Enter the escalation rationale.', 2);

    ['outbound', 'inbound'].forEach((direction) => {
        const engagement = sheet.engagement[direction];
        if (engagement.engaged == null) error(errors, `engagement.${direction}.engaged`, `Choose an explicit ${direction} engagement state.`, 3);
        if (engagement.engaged && !engagement.linkedRecordId) error(errors, `engagement.${direction}.linkedRecordId`, `Select an ${direction} engagement.`, 3);
        if (engagement.engaged && !engagement.outcome) error(errors, `engagement.${direction}.outcome`, `Enter the ${direction} engagement outcome.`, 3);
    });
    if (sheet.engagement.partnerCheckComplete == null) error(errors, 'engagement.partnerCheckComplete', 'Select whether the counterparty was consulted.', 3);
    if (!sheet.risks.length || sheet.risks.length > 3) error(errors, 'risks', 'Complete one to three risks.', 3);
    sheet.risks.forEach((risk, index) => {
        const prefix = `risks.${index}`;
        if (!risk.type) error(errors, `${prefix}.type`, 'Select a risk type.', 3);
        if (risk.type === 'other' && !risk.otherDescription) error(errors, `${prefix}.otherDescription`, 'Describe the other risk.', 3);
        if (!risk.likelihood) error(errors, `${prefix}.likelihood`, 'Select likelihood.', 3);
        if (!risk.impact) error(errors, `${prefix}.impact`, 'Select impact.', 3);
        if (!risk.mitigation) error(errors, `${prefix}.mitigation`, 'Enter a mitigation.', 3);
        if (!risk.movementStatus) error(errors, `${prefix}.movementStatus`, 'Select movement status.', 3);
    });
    if (!sheet.ipSecurityEffect) error(errors, 'ipSecurityEffect', 'Select the IP / security effect.', 3);
    if (sheet.otherSectorSpillover.hasMaterialSpillover == null) error(errors, 'otherSectorSpillover.hasMaterialSpillover', 'Choose whether there is external-sector spillover.', 3);
    if (sheet.otherSectorSpillover.hasMaterialSpillover) {
        if (!sheet.otherSectorSpillover.entries.length) error(errors, 'otherSectorSpillover.entries', 'Complete at least one spillover.', 3);
        sheet.otherSectorSpillover.entries.forEach((entry, index) => {
            if (!entry.affectedSector) error(errors, `otherSectorSpillover.entries.${index}.affectedSector`, 'Enter the affected sector.', 3);
            if (!entry.direction) error(errors, `otherSectorSpillover.entries.${index}.direction`, 'Select spillover direction.', 3);
            if (!entry.explanation) error(errors, `otherSectorSpillover.entries.${index}.explanation`, 'Explain the spillover.', 3);
        });
    }
    if (sheet.stance == null) error(errors, 'stance', 'Select the strategic stance.', 3);
    if (sheet.blueMadeBothHarder == null) error(errors, 'blueMadeBothHarder', 'Select whether Blue made serving both harder.', 3);
    if (!sheet.blueTradeoffExplanation) error(errors, 'blueTradeoffExplanation', 'Explain the Blue tradeoff.', 3);
    Object.entries(sheet.nextMoveForecasts).forEach(([actor, forecast]) => {
        validateCodes(errors, forecast.actionCodes, forecast.otherActionDescription, `nextMoveForecasts.${actor}.actionCodes`, 3);
        if (!forecast.explanation) error(errors, `nextMoveForecasts.${actor}.explanation`, 'Explain the forecast.', 3);
    });
    if (!sheet.positionChangeTrigger) error(errors, 'positionChangeTrigger', 'Enter what would trigger a position change.', 3);
    return errors;
}

export function getIndustrySectorConfig(industry = '') {
    return INDUSTRY_TURN_SHEET_SECTORS.find(({ value }) => value === industry) || null;
}

export function getIndustryTurnSheetTitle(input = {}) {
    const sheet = normalizeIndustryTurnSheet(input);
    const industry = getIndustrySectorConfig(sheet.industry)?.label || 'Industry';
    const move = INDUSTRY_PRIMARY_MOVES.find(({ value }) => value === sheet.decision.primaryMove)?.label
        || sheet.decision.otherPrimaryMove || 'Draft';
    return `${industry} Proposal — ${move}`;
}

export function getIndustryExpectedEffectsSummary(input = {}) {
    const sheet = normalizeIndustryTurnSheet(input);
    const populated = INDUSTRY_EFFECT_DIMENSIONS.filter(({ value }) => sheet.expectedEffects[value].direction);
    if (!populated.length) return 'Expected effects not yet complete.';
    return populated.map(({ value, label }) => `${label}: ${sheet.expectedEffects[value].direction.replace(/_/g, ' ')}`).join('; ');
}

export function isIndustryTurnSheetAction(action = {}) {
    return Boolean(action?.artifact_payload?.proposal?.industryTurnSheet)
        || Boolean(action?.artifact_payload?.proposal?.industry_turn_sheet);
}

export function getIndustryTurnSheetFromAction(action = {}) {
    const embedded = action?.artifact_payload?.proposal?.industryTurnSheet
        || action?.artifact_payload?.proposal?.industry_turn_sheet
        || null;
    return embedded ? normalizeIndustryTurnSheet(embedded, {
        proposalId: action.id,
        sessionId: action.session_id,
        move: action.move
    }) : null;
}

export function deriveIndustryProposalContext(actions = [], { industry, move, excludeId = null } = {}) {
    const currentMove = Number(move || 1);
    const allRows = (Array.isArray(actions) ? actions : [])
        .filter((action) => action?.id !== excludeId)
        .map((action) => ({ action, sheet: getIndustryTurnSheetFromAction(action) }))
        .filter(({ sheet }) => sheet?.industry === industry)
        .sort((left, right) => (
            Number(left.sheet.proposalOrdinalForIndustryMove || 0) - Number(right.sheet.proposalOrdinalForIndustryMove || 0)
            || new Date(left.action.created_at || 0) - new Date(right.action.created_at || 0)
            || String(left.action.id).localeCompare(String(right.action.id))
        ));
    const rows = allRows.filter(({ action }) => !action?.is_deleted);
    const current = rows.filter(({ sheet }) => Number(sheet.move) === currentMove);
    const baseline = current[0] || null;
    const previousCompleted = rows
        .filter(({ sheet, action }) => Number(sheet.move) === currentMove - 1 && getArtifactLifecycleViewModel(action).isCompleted)
        .sort((left, right) => (
            Number(right.sheet.proposalOrdinalForIndustryMove || 0) - Number(left.sheet.proposalOrdinalForIndustryMove || 0)
            || Number(right.action.revision_number || 1) - Number(left.action.revision_number || 1)
        ));
    const previousBaseline = [...previousCompleted].sort((left, right) => (
        Number(left.sheet.proposalOrdinalForIndustryMove || 0) - Number(right.sheet.proposalOrdinalForIndustryMove || 0)
    ))[0] || null;
    const latestPrevious = previousCompleted[0] || null;
    const maxOrdinal = allRows
        .filter(({ sheet }) => Number(sheet.move) === currentMove)
        .reduce((max, { sheet }) => Math.max(max, Number(sheet.proposalOrdinalForIndustryMove || 0)), 0);
    return {
        industry,
        move: currentMove,
        proposalOrdinalForIndustryMove: maxOrdinal + 1,
        isFirstProposalForIndustryMove: !baseline,
        baselineProposalId: baseline?.action?.id || null,
        baselineTurnSheet: baseline?.sheet || null,
        baselineIsCompleted: baseline ? getArtifactLifecycleViewModel(baseline.action).isCompleted : true,
        canCreateProposal: !baseline || getArtifactLifecycleViewModel(baseline.action).isCompleted,
        previousMoveProposalId: latestPrevious?.action?.id || null,
        previousMoveTurnSheet: latestPrevious?.sheet || null,
        previousMoveBaselineProposalId: previousBaseline?.action?.id || null,
        previousMoveBaselineTurnSheet: previousBaseline?.sheet || null,
        eligiblePriorDecisions: previousCompleted.map(({ action, sheet }) => ({
            id: action.id,
            title: action.goal || getIndustryTurnSheetTitle(sheet),
            move: sheet.move,
            ordinal: sheet.proposalOrdinalForIndustryMove,
            revision: action.revision_number || 1
        })),
        history: rows.filter(({ action }) => getArtifactLifecycleViewModel(action).isCompleted)
            .map(({ action, sheet }) => ({ actionId: action.id, move: sheet.move, ordinal: sheet.proposalOrdinalForIndustryMove, title: action.goal || getIndustryTurnSheetTitle(sheet), sheet }))
    };
}

export function getIndustryMoveCoverage(actions = [], move = 1) {
    const completed = new Set((Array.isArray(actions) ? actions : [])
        .filter((action) => !action?.is_deleted && getArtifactLifecycleViewModel(action).isCompleted)
        .map(getIndustryTurnSheetFromAction)
        .filter((sheet) => sheet && Number(sheet.move) === Number(move))
        .map((sheet) => sheet.industry));
    const missing = INDUSTRY_TURN_SHEET_SECTORS.filter(({ value }) => !completed.has(value));
    return { complete: missing.length === 0, completed: [...completed], missing };
}

export function getIndustryEngagementOptions(communications = [], { move = 1 } = {}) {
    return (Array.isArray(communications) ? communications : [])
        .filter((record) => !record?.is_deleted && Number(record?.move || record?.metadata?.move || move) === Number(move))
        .map((record) => {
            const metadata = record.metadata || {};
            const senderTeam = text(metadata.sender_team || metadata.source_team || record.from_team || record.team).toLowerCase();
            const recipientTeam = text(metadata.recipient_team || record.to_team).toLowerCase();
            const direction = senderTeam === 'industry' ? 'outbound' : recipientTeam === 'industry' ? 'inbound' : null;
            if (!direction) return null;
            return {
                id: String(record.id || ''),
                direction,
                label: text(record.subject || metadata.proposal_title || record.content).slice(0, 100) || 'PLENUM engagement',
                source: senderTeam || null,
                destination: recipientTeam || null,
                contact: text(metadata.sender_role || metadata.recipient_role) || null,
                recordType: text(metadata.proposal_thread_kind) ? 'proposal_thread' : 'message'
            };
        })
        .filter((record) => record?.id);
}

export function buildIndustryTurnSheetDisplayModel(input = {}, strategicPriorities = []) {
    const sheet = normalizeIndustryTurnSheet(input);
    const label = (options, value) => options.find((option) => option.value === value)?.label || text(value).replace(/_/g, ' ') || 'Not specified';
    const linked = (Array.isArray(strategicPriorities) ? strategicPriorities : [])
        .filter((priority) => sheet.linkedStrategicPriorityIds.includes(priority.id));
    const actorRows = sheet.environment.actors.flatMap((actor) => {
        const actorLabel = label(INDUSTRY_ENVIRONMENT_ACTORS, actor.actor);
        return [
            [`${actorLabel} actions`, `${actor.actionCodes.map((code) => label(INDUSTRY_ACTION_CODES, code)).join(', ') || 'Not specified'}${actor.otherActionDescription ? ` (${actor.otherActionDescription})` : ''}`],
            [`${actorLabel} narrative`, actor.actionNarrative || 'Not specified'],
            [`${actorLabel} assessment`, `Interest impact ${actor.interestImpact ?? 'not specified'}; confidence ${actor.confidence || 'not specified'}; forecast match ${actor.matchedForecast || 'not specified'}`]
        ];
    });
    const supplyRows = sheet.supplyChain.stages.flatMap((stage) => {
        const stageLabel = label(INDUSTRY_SUPPLY_CHAIN_STAGES, stage.stage);
        return [
            [`${stageLabel} exposure`, `${stage.whereWho.map((value) => label(INDUSTRY_LOCATION_OPTIONS, value)).join(', ') || 'Not specified'}${stage.otherLocationDescription ? ` (${stage.otherLocationDescription})` : ''}; Red dependency ${stage.redDependency || 'not specified'}`],
            [`${stageLabel} response`, `${stage.plannedActions.map((value) => text(value).replace(/_/g, ' ')).join(', ') || 'Not specified'}; ${stage.notes || 'No notes'}`]
        ];
    });
    const riskRows = sheet.risks.map((risk, index) => [
        `Risk ${index + 1}`,
        `${risk.type === 'other' ? risk.otherDescription || 'Other' : label(INDUSTRY_RISK_TYPES, risk.type)}; likelihood ${risk.likelihood || 'not specified'}; impact ${risk.impact || 'not specified'}; ${risk.movementStatus || 'not specified'}; mitigation: ${risk.mitigation || 'not specified'}${risk.priorRiskId ? `; prior risk ${risk.priorRiskId}` : ''}`
    ]);
    const spilloverRows = sheet.otherSectorSpillover.hasMaterialSpillover
        ? sheet.otherSectorSpillover.entries.map((entry, index) => [
            `Spillover ${index + 1}`,
            `${entry.affectedSector || 'Not specified'}; ${entry.direction || 'not specified'}; ${entry.explanation || 'not specified'}`
        ])
        : [['External-sector spillover', sheet.otherSectorSpillover.hasMaterialSpillover === false ? 'No material external-sector spillover' : 'Not specified']];
    const forecastRows = Object.entries(sheet.nextMoveForecasts).map(([actor, forecast]) => [
        label(INDUSTRY_ENVIRONMENT_ACTORS, actor),
        `${forecast.actionCodes.map((code) => label(INDUSTRY_ACTION_CODES, code)).join(', ') || 'Not specified'}${forecast.otherActionDescription ? ` (${forecast.otherActionDescription})` : ''}; ${forecast.explanation || 'No explanation'}`
    ]);
    return {
        title: getIndustryTurnSheetTitle(sheet),
        eyebrow: `Industry — ${getIndustrySectorConfig(sheet.industry)?.label || 'Not specified'} — Move ${sheet.move}`,
        visibility: label(INDUSTRY_VISIBILITY, sheet.decision.visibility),
        sections: [
            {
                title: 'Proposal context', rows: [
                    ['Industry', getIndustrySectorConfig(sheet.industry)?.label || 'Not specified'],
                    ['Move', String(sheet.move)],
                    ['Proposal number', sheet.proposalOrdinalForIndustryMove == null ? 'Not assigned' : String(sheet.proposalOrdinalForIndustryMove)],
                    ['Strategic Plan', sheet.strategicPlanId || 'Not specified'],
                    ['Strategic priorities', linked.map((priority) => priority.priority).join('; ') || sheet.linkedStrategicPriorityIds.join(', ') || 'Not specified']
                ]
            },
            {
                title: 'Environment read', rows: [
                    ...actorRows,
                    ['Biggest surprise', sheet.environment.biggestSurprise || 'Not specified']
                ]
            },
            {
                title: 'Supply chain exposure', rows: [
                    ...supplyRows,
                    ['Weakest link', sheet.supplyChain.weakestLink || 'Not specified'],
                    ['Change since last move', sheet.supplyChain.changeSinceLastMove || 'Not specified']
                ]
            },
            {
                title: 'Decision', rows: [
                    ['Status', label(INDUSTRY_DECISION_STATUSES, sheet.decision.status)],
                    ['Intended recipients', sheet.recipientTeams.map((team) => `${team[0]?.toUpperCase() || ''}${team.slice(1)}`).join(', ') || 'Not specified'],
                    ['Coordinated with another sector', sheet.decision.coordinatedWithOtherSector == null ? 'Not specified' : sheet.decision.coordinatedWithOtherSector ? `Yes: ${sheet.decision.coordinatedSectors.map((value) => getIndustrySectorConfig(value)?.label || value).join(', ')}` : 'No'],
                    ['Primary move', label(INDUSTRY_PRIMARY_MOVES, sheet.decision.primaryMove)],
                    ['Counterparty', `${label(INDUSTRY_COUNTERPARTIES, sheet.decision.counterparty.type)}: ${sheet.decision.counterparty.names.join(', ') || 'Not specified'}`],
                    ['Capital commitment', sheet.decision.capitalCommitment || 'Not specified'],
                    ['Visibility', label(INDUSTRY_VISIBILITY, sheet.decision.visibility)],
                    ['Ask', sheet.decision.ask.map((value) => label(INDUSTRY_ASK_OPTIONS, value)).join(', ') || 'Not specified'],
                    ['Offer', sheet.decision.offer.map((value) => label(INDUSTRY_OFFER_OPTIONS, value)).join(', ') || 'Not specified'],
                    ...Object.entries(sheet.decision.stakeholderValue).map(([key, stakeholder]) => [
                        `${key === 'other' ? stakeholder.name || 'Other' : stakeholder.name} stakeholder value`,
                        `Gain: ${stakeholder.gain || 'not specified'}; give up or risk: ${stakeholder.giveUpOrRisk || 'not specified'}; net ${stakeholder.net || 'not specified'}`
                    ]),
                    ['Intended effect', sheet.decision.intendedEffect || 'Not specified'],
                    ['Rationale', sheet.decision.rationale || 'Not specified'],
                    ['Implementation', sheet.decision.implementation || 'Not specified']
                ]
            },
            { title: 'Expected effects', rows: INDUSTRY_EFFECT_DIMENSIONS.map(({ value, label: effectLabel }) => [effectLabel, Object.values(sheet.expectedEffects[value]).filter(Boolean).join(' / ') || 'Not specified']) },
            {
                title: 'Engagement and risk', rows: [
                    ['Outbound engagement', sheet.engagement.outbound.engaged === false ? 'No outbound engagement' : sheet.engagement.outbound.engaged ? `${sheet.engagement.outbound.outcome || 'No outcome'}; record ${sheet.engagement.outbound.linkedRecordId || 'not specified'}; destination ${sheet.engagement.outbound.destination || 'not specified'}` : 'Not specified'],
                    ['Inbound engagement', sheet.engagement.inbound.engaged === false ? 'No inbound engagement' : sheet.engagement.inbound.engaged ? `${sheet.engagement.inbound.outcome || 'No outcome'}; record ${sheet.engagement.inbound.linkedRecordId || 'not specified'}; source ${sheet.engagement.inbound.source || 'not specified'}` : 'Not specified'],
                    ['Counterparty consulted', sheet.engagement.partnerCheckComplete == null ? 'Not specified' : sheet.engagement.partnerCheckComplete ? 'Yes' : 'No'],
                    ...riskRows
                ]
            },
            {
                title: 'Security and spillover', rows: [
                    ['IP / security effect', sheet.ipSecurityEffect || 'Not specified'],
                    ...spilloverRows,
                    ['Stance', sheet.stance ? `${sheet.stance} — ${INDUSTRY_STANCE_OPTIONS.find((option) => option.value === sheet.stance)?.label}` : 'Not specified'],
                    ['Blue made both interests harder', sheet.blueMadeBothHarder == null ? 'Not specified' : sheet.blueMadeBothHarder ? 'Yes' : 'No'],
                    ['Blue tradeoff explanation', sheet.blueTradeoffExplanation || 'Not specified']
                ]
            },
            {
                title: 'Escalation and next move', rows: [
                    ['Escalation', sheet.escalationMarkers.map((value) => label(INDUSTRY_ESCALATION_MARKERS, value)).join(', ') || 'Not specified'],
                    ['Escalation rationale', sheet.escalationRationale || 'Not specified'],
                    ['Position-change trigger', sheet.positionChangeTrigger || 'Not specified'],
                    ...forecastRows
                ]
            },
            { title: 'Facilitator note', rows: [['Note', sheet.facilitatorNote || 'None']] }
        ]
    };
}
