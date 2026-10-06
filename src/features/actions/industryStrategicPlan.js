export const INDUSTRY_STRATEGIC_PLAN_VERSION = 1;

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

function blankRisk() {
    return { type: '', otherText: '', likelihood: '', impact: '', tiedCell: '' };
}

function blankPartner() {
    return { partner: '', whyTheyMatter: '', likelyWant: '' };
}

function blankPriority() {
    return { priority: '', successLooksLike: '' };
}

export function createBlankIndustryStrategicPlan() {
    return {
        version: INDUSTRY_STRATEGIC_PLAN_VERSION,
        sector: '',
        businessOverview: '',
        risks: [blankRisk(), blankRisk(), blankRisk()],
        redPriorities: '',
        partners: [blankPartner(), blankPartner(), blankPartner()],
        firstAmbassadorTarget: { cell: '', reason: '' },
        strategicPriorities: [blankPriority(), blankPriority(), blankPriority()],
        strategicStance: null,
        redLine: ''
    };
}

export function normalizeIndustryStrategicPlan(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const inputRisks = Array.isArray(source.risks) ? source.risks : createBlankIndustryStrategicPlan().risks;
    const inputPartners = Array.isArray(source.partners) ? source.partners : [];
    const inputPriorities = Array.isArray(source.strategicPriorities)
        ? source.strategicPriorities
        : createBlankIndustryStrategicPlan().strategicPriorities;
    const stance = source.strategicStance === '' || source.strategicStance == null
        ? null
        : Number(source.strategicStance);

    return {
        version: INDUSTRY_STRATEGIC_PLAN_VERSION,
        sector: normalizeSector(source.sector),
        businessOverview: normalizeText(source.businessOverview),
        risks: inputRisks.map((risk = {}) => {
            const type = normalizeText(risk.type);
            return {
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
        strategicPriorities: inputPriorities.map((priority = {}) => ({
            priority: normalizeText(priority.priority),
            successLooksLike: normalizeText(priority.successLooksLike)
        })),
        strategicStance: Number.isInteger(stance) ? stance : null,
        redLine: normalizeText(source.redLine)
    };
}

export function validateIndustryStrategicPlan(input = {}) {
    const plan = normalizeIndustryStrategicPlan(input);
    const errors = [];
    const sectorValues = new Set(INDUSTRY_SECTORS.map(({ value }) => value));
    const riskTypes = new Set(INDUSTRY_RISK_TYPES.map(({ value }) => value));
    const riskLevels = new Set(INDUSTRY_RISK_LEVELS.map(({ value }) => value));
    const cells = new Set(INDUSTRY_EXPOSURE_CELLS.map(({ value }) => value));

    if (!sectorValues.has(plan.sector)) errors.push({ field: 'sector', message: 'Select one sector.' });
    if (!plan.businessOverview) errors.push({ field: 'businessOverview', message: 'Business Overview is required.' });

    if (plan.risks.length !== 3) {
        errors.push({ field: 'risks', message: 'Exactly three complete risk factors are required.' });
    }
    const seenRiskTypes = new Set();
    const seenOtherDescriptions = new Set();
    plan.risks.forEach((risk, index) => {
        const prefix = `risks.${index}`;
        if (!riskTypes.has(risk.type)) errors.push({ field: `${prefix}.type`, message: `Risk ${index + 1}: select a risk type.` });
        if (risk.type === 'other' && !risk.otherText) errors.push({ field: `${prefix}.otherText`, message: `Risk ${index + 1}: describe the other risk.` });
        if (!riskLevels.has(risk.likelihood)) errors.push({ field: `${prefix}.likelihood`, message: `Risk ${index + 1}: select likelihood.` });
        if (!riskLevels.has(risk.impact)) errors.push({ field: `${prefix}.impact`, message: `Risk ${index + 1}: select impact.` });
        if (!cells.has(risk.tiedCell)) errors.push({ field: `${prefix}.tiedCell`, message: `Risk ${index + 1}: select the tied cell.` });

        if (riskTypes.has(risk.type) && risk.type !== 'other') {
            if (seenRiskTypes.has(risk.type)) errors.push({ field: `${prefix}.type`, message: `Risk ${index + 1}: choose a different risk type.` });
            seenRiskTypes.add(risk.type);
        }
        if (risk.type === 'other' && risk.otherText) {
            if (seenOtherDescriptions.has(risk.otherText)) errors.push({ field: `${prefix}.otherText`, message: `Risk ${index + 1}: use a different other-risk description.` });
            seenOtherDescriptions.add(risk.otherText);
        }
    });

    if (!plan.redPriorities) errors.push({ field: 'redPriorities', message: 'Expected Red priorities are required.' });
    const partnerRows = (Array.isArray(input?.partners) ? input.partners : [])
        .map((partner, index) => ({
            index,
            partner: {
                partner: normalizeText(partner?.partner),
                whyTheyMatter: normalizeText(partner?.whyTheyMatter),
                likelyWant: normalizeText(partner?.likelyWant)
            }
        }))
        .filter(({ partner }) => Object.values(partner).some(Boolean));
    if (!partnerRows.length) errors.push({ field: 'partners', message: 'At least one complete partner is required.' });
    partnerRows.forEach(({ partner, index }) => {
        const prefix = `partners.${index}`;
        if (!partner.partner) errors.push({ field: `${prefix}.partner`, message: `Partner ${index + 1}: enter a Green nation or allied firm.` });
        if (!partner.whyTheyMatter) errors.push({ field: `${prefix}.whyTheyMatter`, message: `Partner ${index + 1}: explain why they matter.` });
        if (!partner.likelyWant) errors.push({ field: `${prefix}.likelyWant`, message: `Partner ${index + 1}: explain what they likely want.` });
    });

    if (!cells.has(plan.firstAmbassadorTarget.cell)) errors.push({ field: 'firstAmbassadorTarget.cell', message: 'Select the first ambassador target cell.' });
    if (!plan.firstAmbassadorTarget.reason) errors.push({ field: 'firstAmbassadorTarget.reason', message: 'Enter the reason for the first ambassador target.' });

    if (plan.strategicPriorities.length !== 3) {
        errors.push({ field: 'strategicPriorities', message: 'Exactly three complete strategic priorities are required.' });
    }
    plan.strategicPriorities.forEach((priority, index) => {
        const prefix = `strategicPriorities.${index}`;
        if (!priority.priority) errors.push({ field: `${prefix}.priority`, message: `Priority ${index + 1}: enter the priority.` });
        if (!priority.successLooksLike) errors.push({ field: `${prefix}.successLooksLike`, message: `Priority ${index + 1}: describe what success looks like.` });
    });

    if (!Number.isInteger(plan.strategicStance) || plan.strategicStance < 1 || plan.strategicStance > 5) {
        errors.push({ field: 'strategicStance', message: 'Select a Strategic Stance from 1 through 5.' });
    }
    if (!plan.redLine) errors.push({ field: 'redLine', message: 'Your Red Line is required.' });

    return errors;
}

function labelFor(options, value) {
    return options.find((option) => option.value === value)?.label || value || 'Not specified';
}

export function getIndustryStrategicPlanDisplayModel(input = {}, { blueForecast = null } = {}) {
    const plan = normalizeIndustryStrategicPlan(input);
    return {
        overviewFields: [
            { label: 'Sector', value: plan.sector || 'Not specified' },
            { label: 'A. Business Overview', value: plan.businessOverview || 'Not specified', wide: true }
        ],
        risks: plan.risks.map((risk) => ({
            risk: risk.type === 'other' ? risk.otherText : labelFor(INDUSTRY_RISK_TYPES, risk.type),
            likelihood: labelFor(INDUSTRY_RISK_LEVELS, risk.likelihood),
            impact: labelFor(INDUSTRY_RISK_LEVELS, risk.impact),
            cell: labelFor(INDUSTRY_EXPOSURE_CELLS, risk.tiedCell)
        })),
        environment: {
            blueForecast,
            redPriorities: plan.redPriorities || 'Not specified'
        },
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
