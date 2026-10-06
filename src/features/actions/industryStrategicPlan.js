export const INDUSTRY_STRATEGIC_PLAN_VERSION = 2;
export const INDUSTRY_STRATEGIC_PLAN_LEGACY_VERSION = 1;

export const INDUSTRY_SECTORS = Object.freeze([
    Object.freeze({ value: 'Agriculture', label: 'Agriculture' }),
    Object.freeze({ value: 'Telecommunications', label: 'Telecommunications' }),
    Object.freeze({ value: 'Biotechnology', label: 'Biotechnology' })
]);

export const INDUSTRY_RISK_TYPES = Object.freeze([
    Object.freeze({ value: 'retaliation', label: 'Retaliation' }),
    Object.freeze({ value: 'secondary_sanctions_exposure', label: 'Secondary-sanctions exposure' }),
    Object.freeze({ value: 'supply_disruption', label: 'Supply disruption' }),
    Object.freeze({ value: 'ip_theft_forced_tech_transfer', label: 'IP theft / forced tech transfer' }),
    Object.freeze({ value: 'regulatory_legal', label: 'Regulatory / legal' }),
    Object.freeze({ value: 'reputational', label: 'Reputational' }),
    Object.freeze({ value: 'stranded_assets', label: 'Stranded assets' }),
    Object.freeze({ value: 'lost_market_access', label: 'Lost market access' }),
    Object.freeze({ value: 'other', label: 'Other' })
]);

export const INDUSTRY_RISK_LEVELS = Object.freeze([
    Object.freeze({ value: 'low', label: 'Low' }),
    Object.freeze({ value: 'medium', label: 'Medium' }),
    Object.freeze({ value: 'high', label: 'High' })
]);

export const INDUSTRY_EXPOSURE_CELLS = Object.freeze([
    Object.freeze({ value: 'blue', label: 'Blue' }),
    Object.freeze({ value: 'red', label: 'Red' }),
    Object.freeze({ value: 'green', label: 'Green' })
]);

const SECTOR_ALIASES = Object.freeze({
    agriculture: 'Agriculture',
    telecom: 'Telecommunications',
    telecommunications: 'Telecommunications',
    biotech: 'Biotechnology',
    biotechnology: 'Biotechnology'
});

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeSector(value) {
    const text = normalizeText(value);
    return SECTOR_ALIASES[text.toLowerCase()] || text;
}

function stableSectorId(sector, kind, index) {
    const sectorSlug = normalizeSector(sector || 'industry').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `${sectorSlug}-${kind}-${index + 1}`;
}

function blankRisk(sector = '', index = 0) {
    return { id: stableSectorId(sector, 'baseline-risk', index), type: '', otherText: '', likelihood: '', impact: '', tiedCell: '' };
}

function blankPartner() {
    return { partner: '', whyTheyMatter: '', likelyWant: '' };
}

function blankPriority(sector = '', index = 0) {
    return { id: stableSectorId(sector, 'priority', index), priority: '', successLooksLike: '' };
}

export function createBlankIndustrySectorPlan(sector = '') {
    return {
        businessOverview: '',
        risks: [0, 1, 2].map((index) => blankRisk(sector, index)),
        redPriorities: '',
        partners: [blankPartner(), blankPartner(), blankPartner()],
        firstAmbassadorTarget: { cell: '', reason: '' },
        strategicPriorities: [0, 1, 2].map((index) => blankPriority(sector, index)),
        strategicStance: null,
        redLine: ''
    };
}

export function createBlankIndustryStrategicPlan() {
    return {
        version: INDUSTRY_STRATEGIC_PLAN_VERSION,
        sectorPlans: Object.fromEntries(INDUSTRY_SECTORS.map(({ value }) => [
            value,
            createBlankIndustrySectorPlan(value)
        ]))
    };
}

function normalizeSectorPlan(input = {}, sector = '') {
    const source = input && typeof input === 'object' ? input : {};
    const blank = createBlankIndustrySectorPlan(sector);
    const inputRisks = Array.isArray(source.risks) ? source.risks : blank.risks;
    const inputPartners = Array.isArray(source.partners) ? source.partners : [];
    const inputPriorities = Array.isArray(source.strategicPriorities)
        ? source.strategicPriorities
        : blank.strategicPriorities;
    const stance = source.strategicStance === '' || source.strategicStance == null
        ? null
        : Number(source.strategicStance);

    return {
        businessOverview: normalizeText(source.businessOverview),
        risks: inputRisks.map((risk = {}, index) => {
            const type = normalizeText(risk.type);
            return {
                id: normalizeText(risk.id) || stableSectorId(sector, 'baseline-risk', index),
                type,
                otherText: type === 'other' ? normalizeText(risk.otherText) : '',
                likelihood: normalizeText(risk.likelihood),
                impact: normalizeText(risk.impact),
                tiedCell: normalizeText(risk.tiedCell)
            };
        }),
        redPriorities: normalizeText(source.redPriorities),
        partners: inputPartners.map((partner = {}) => ({
            partner: normalizeText(partner.partner),
            whyTheyMatter: normalizeText(partner.whyTheyMatter),
            likelyWant: normalizeText(partner.likelyWant)
        })).filter((partner) => Object.values(partner).some(Boolean)),
        firstAmbassadorTarget: {
            cell: normalizeText(source.firstAmbassadorTarget?.cell),
            reason: normalizeText(source.firstAmbassadorTarget?.reason)
        },
        strategicPriorities: inputPriorities.map((priority = {}, index) => ({
            id: normalizeText(priority.id) || stableSectorId(sector, 'priority', index),
            priority: normalizeText(priority.priority),
            successLooksLike: normalizeText(priority.successLooksLike)
        })),
        strategicStance: Number.isInteger(stance) ? stance : null,
        redLine: normalizeText(source.redLine)
    };
}

function normalizeLegacyIndustryStrategicPlan(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    return {
        version: INDUSTRY_STRATEGIC_PLAN_LEGACY_VERSION,
        sector: normalizeSector(source.sector),
        ...normalizeSectorPlan(source, normalizeSector(source.sector))
    };
}

export function isLegacyIndustryStrategicPlan(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    return Number(source.version) === INDUSTRY_STRATEGIC_PLAN_LEGACY_VERSION
        || (!source.sectorPlans && Object.prototype.hasOwnProperty.call(source, 'sector'));
}

export function normalizeIndustryStrategicPlan(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    if (isLegacyIndustryStrategicPlan(source)) {
        return normalizeLegacyIndustryStrategicPlan(source);
    }

    const sourcePlans = source.sectorPlans && typeof source.sectorPlans === 'object'
        ? source.sectorPlans
        : {};
    return {
        version: INDUSTRY_STRATEGIC_PLAN_VERSION,
        sectorPlans: Object.fromEntries(INDUSTRY_SECTORS.map(({ value }) => [
            value,
            normalizeSectorPlan(sourcePlans[value], value)
        ]))
    };
}

function validateSectorPlan(input, { prefix = '', sectorRequired = false, sector = '' } = {}) {
    const plan = normalizeSectorPlan(input, sector);
    const errors = [];
    const path = (field) => prefix ? `${prefix}.${field}` : field;
    const riskTypes = new Set(INDUSTRY_RISK_TYPES.map(({ value }) => value));
    const riskLevels = new Set(INDUSTRY_RISK_LEVELS.map(({ value }) => value));
    const cells = new Set(INDUSTRY_EXPOSURE_CELLS.map(({ value }) => value));
    const sectorValues = new Set(INDUSTRY_SECTORS.map(({ value }) => value));

    if (sectorRequired && !sectorValues.has(normalizeSector(sector))) errors.push({ field: path('sector'), message: 'Select one sector.' });
    if (!plan.businessOverview) errors.push({ field: path('businessOverview'), message: 'Business Overview is required.' });
    if (plan.risks.length !== 3) errors.push({ field: path('risks'), message: 'Exactly three complete risk factors are required.' });

    const seenRiskTypes = new Set();
    const seenOtherDescriptions = new Set();
    plan.risks.forEach((risk, index) => {
        const riskPrefix = path(`risks.${index}`);
        if (!riskTypes.has(risk.type)) errors.push({ field: `${riskPrefix}.type`, message: `Risk ${index + 1}: select a risk type.` });
        if (risk.type === 'other' && !risk.otherText) errors.push({ field: `${riskPrefix}.otherText`, message: `Risk ${index + 1}: describe the other risk.` });
        if (!riskLevels.has(risk.likelihood)) errors.push({ field: `${riskPrefix}.likelihood`, message: `Risk ${index + 1}: select likelihood.` });
        if (!riskLevels.has(risk.impact)) errors.push({ field: `${riskPrefix}.impact`, message: `Risk ${index + 1}: select impact.` });
        if (!cells.has(risk.tiedCell)) errors.push({ field: `${riskPrefix}.tiedCell`, message: `Risk ${index + 1}: select the tied cell.` });
        if (riskTypes.has(risk.type) && risk.type !== 'other') {
            if (seenRiskTypes.has(risk.type)) errors.push({ field: `${riskPrefix}.type`, message: `Risk ${index + 1}: choose a different risk type.` });
            seenRiskTypes.add(risk.type);
        }
        if (risk.type === 'other' && risk.otherText) {
            if (seenOtherDescriptions.has(risk.otherText)) errors.push({ field: `${riskPrefix}.otherText`, message: `Risk ${index + 1}: use a different other-risk description.` });
            seenOtherDescriptions.add(risk.otherText);
        }
    });

    if (!plan.redPriorities) errors.push({ field: path('redPriorities'), message: 'Expected Red priorities are required.' });
    const partnerRows = (Array.isArray(input?.partners) ? input.partners : [])
        .map((partner, index) => ({ index, partner: {
            partner: normalizeText(partner?.partner),
            whyTheyMatter: normalizeText(partner?.whyTheyMatter),
            likelyWant: normalizeText(partner?.likelyWant)
        } }))
        .filter(({ partner }) => Object.values(partner).some(Boolean));
    if (!partnerRows.length) errors.push({ field: path('partners'), message: 'At least one complete partner is required.' });
    partnerRows.forEach(({ partner, index }) => {
        const partnerPrefix = path(`partners.${index}`);
        if (!partner.partner) errors.push({ field: `${partnerPrefix}.partner`, message: `Partner ${index + 1}: enter a Green nation or allied firm.` });
        if (!partner.whyTheyMatter) errors.push({ field: `${partnerPrefix}.whyTheyMatter`, message: `Partner ${index + 1}: explain why they matter.` });
        if (!partner.likelyWant) errors.push({ field: `${partnerPrefix}.likelyWant`, message: `Partner ${index + 1}: explain what they likely want.` });
    });

    if (!cells.has(plan.firstAmbassadorTarget.cell)) errors.push({ field: path('firstAmbassadorTarget.cell'), message: 'Select the first ambassador target cell.' });
    if (!plan.firstAmbassadorTarget.reason) errors.push({ field: path('firstAmbassadorTarget.reason'), message: 'Enter the reason for the first ambassador target.' });
    if (plan.strategicPriorities.length !== 3) errors.push({ field: path('strategicPriorities'), message: 'Exactly three complete strategic priorities are required.' });
    plan.strategicPriorities.forEach((priority, index) => {
        const priorityPrefix = path(`strategicPriorities.${index}`);
        if (!priority.priority) errors.push({ field: `${priorityPrefix}.priority`, message: `Priority ${index + 1}: enter the priority.` });
        if (!priority.successLooksLike) errors.push({ field: `${priorityPrefix}.successLooksLike`, message: `Priority ${index + 1}: describe what success looks like.` });
    });
    if (!Number.isInteger(plan.strategicStance) || plan.strategicStance < 1 || plan.strategicStance > 5) errors.push({ field: path('strategicStance'), message: 'Select a Strategic Stance from 1 through 5.' });
    if (!plan.redLine) errors.push({ field: path('redLine'), message: 'Your Red Line is required.' });
    return errors;
}

export function validateIndustrySectorPlan(input = {}, sector = '') {
    const canonicalSector = normalizeSector(sector);
    return validateSectorPlan(input, { prefix: `sectorPlans.${canonicalSector}` });
}

export function validateIndustryStrategicPlan(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    if (isLegacyIndustryStrategicPlan(source)) return validateSectorPlan(source, { sectorRequired: true, sector: source.sector });
    const sourcePlans = source.sectorPlans && typeof source.sectorPlans === 'object' ? source.sectorPlans : {};
    return INDUSTRY_SECTORS.flatMap(({ value }) => Object.prototype.hasOwnProperty.call(sourcePlans, value)
        ? validateIndustrySectorPlan(sourcePlans[value], value)
        : [{ field: `sectorPlans.${value}`, message: `${value} plan is required.` }]);
}

function hasSectorPlanContent(input = {}, sector = '') {
    const plan = normalizeSectorPlan(input, sector);
    return Boolean(plan.businessOverview
        || plan.risks.some(({ id: _id, ...risk }) => Object.values(risk).some(Boolean))
        || plan.redPriorities || plan.partners.length
        || plan.firstAmbassadorTarget.cell || plan.firstAmbassadorTarget.reason
        || plan.strategicPriorities.some(({ id: _id, ...priority }) => Object.values(priority).some(Boolean))
        || plan.strategicStance || plan.redLine);
}

export function getIndustrySectorPlanStatus(input = {}, sector = '') {
    if (!hasSectorPlanContent(input, sector)) return 'not_started';
    return validateIndustrySectorPlan(input, sector).length ? 'incomplete' : 'complete';
}

function labelFor(options, value) {
    return options.find((option) => option.value === value)?.label || value || 'Not specified';
}

function getSectorDisplayModel(input, sector) {
    const plan = normalizeSectorPlan(input, sector);
    return {
        sector,
        businessOverview: plan.businessOverview || 'Not specified',
        risks: plan.risks.map((risk) => ({
            risk: risk.type === 'other' ? risk.otherText : labelFor(INDUSTRY_RISK_TYPES, risk.type),
            likelihood: labelFor(INDUSTRY_RISK_LEVELS, risk.likelihood),
            impact: labelFor(INDUSTRY_RISK_LEVELS, risk.impact),
            cell: labelFor(INDUSTRY_EXPOSURE_CELLS, risk.tiedCell)
        })),
        redPriorities: plan.redPriorities || 'Not specified',
        partners: plan.partners.map((partner) => ({ ...partner })),
        firstAmbassadorTarget: {
            cell: labelFor(INDUSTRY_EXPOSURE_CELLS, plan.firstAmbassadorTarget.cell),
            reason: plan.firstAmbassadorTarget.reason || 'Not specified'
        },
        priorities: plan.strategicPriorities.map((priority) => ({ ...priority })),
        stance: plan.strategicStance,
        redLine: plan.redLine || 'Not specified'
    };
}

export function getIndustryStrategicPlanDisplayModel(input = {}, { blueForecast = null } = {}) {
    const plan = normalizeIndustryStrategicPlan(input);
    if (isLegacyIndustryStrategicPlan(plan)) {
        return { version: 1, isLegacy: true, blueForecast, sectors: [getSectorDisplayModel(plan, plan.sector || 'Legacy sector')] };
    }
    return {
        version: INDUSTRY_STRATEGIC_PLAN_VERSION,
        isLegacy: false,
        blueForecast,
        sectors: INDUSTRY_SECTORS.map(({ value }) => getSectorDisplayModel(plan.sectorPlans[value], value))
    };
}
