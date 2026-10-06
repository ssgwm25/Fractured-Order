import { describe, expect, it } from 'vitest';

import {
    INDUSTRY_SECTORS,
    createBlankIndustryStrategicPlan,
    getIndustrySectorPlanStatus,
    getIndustryStrategicPlanDisplayModel,
    normalizeIndustryStrategicPlan,
    validateIndustryStrategicPlan
} from './industryStrategicPlan.js';

function validSectorPlan(overrides = {}) {
    return {
        businessOverview: 'Builds critical capacity and protects resilient supply.',
        risks: [
            { type: 'supply_disruption', otherText: '', likelihood: 'high', impact: 'high', tiedCell: 'red' },
            { type: 'secondary_sanctions_exposure', otherText: '', likelihood: 'medium', impact: 'high', tiedCell: 'blue' },
            { type: 'reputational', otherText: '', likelihood: 'medium', impact: 'medium', tiedCell: 'green' }
        ],
        redPriorities: 'Red will prioritize market access and technology acquisition.',
        partners: [
            { partner: 'Allied supplier', whyTheyMatter: 'Provides critical inputs', likelyWant: 'Long-term commitments' },
            { partner: '', whyTheyMatter: '', likelyWant: '' },
            { partner: '', whyTheyMatter: '', likelyWant: '' }
        ],
        firstAmbassadorTarget: { cell: 'green', reason: 'Coordinate an allied supply response.' },
        strategicPriorities: [
            { priority: 'Protect capacity', successLooksLike: 'No critical production outage.' },
            { priority: 'Diversify suppliers', successLooksLike: 'A second supplier is contracted.' },
            { priority: 'Preserve access', successLooksLike: 'Priority markets remain open.' }
        ],
        strategicStance: 3,
        redLine: 'Do not transfer protected technology.',
        ...overrides
    };
}

function validPlan(overrides = {}) {
    return {
        version: 2,
        sectorPlans: Object.fromEntries(INDUSTRY_SECTORS.map(({ value }) => [value, validSectorPlan()])),
        ...overrides
    };
}

describe('Industry Strategic Plan domain contract', () => {
    it('normalizes one version 2 package with all three canonical sector plans', () => {
        const input = validPlan();
        const snapshot = structuredClone(input);
        const normalized = normalizeIndustryStrategicPlan(input);

        expect(normalized.version).toBe(2);
        expect(Object.keys(normalized.sectorPlans)).toEqual(['Agriculture', 'Telecommunications', 'Biotechnology']);
        expect(normalized.sectorPlans.Agriculture.partners).toHaveLength(1);
        expect(validateIndustryStrategicPlan(normalized)).toEqual([]);
        expect(input).toEqual(snapshot);
    });

    it('requires every canonical sector and prefixes errors with its sector path', () => {
        const plan = validPlan();
        delete plan.sectorPlans.Biotechnology;
        plan.sectorPlans.Telecommunications.businessOverview = '';

        expect(validateIndustryStrategicPlan(plan)).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'sectorPlans.Telecommunications.businessOverview' }),
            expect.objectContaining({ field: 'sectorPlans.Biotechnology' })
        ]));
    });

    it('requires exactly three complete, valid, distinct risks within each sector', () => {
        const plan = validPlan();
        plan.sectorPlans.Agriculture.risks = plan.sectorPlans.Agriculture.risks.slice(0, 2);
        plan.sectorPlans.Telecommunications.risks[2] = {
            type: 'supply_disruption', likelihood: 'urgent', impact: 'severe', tiedCell: 'industry'
        };

        expect(validateIndustryStrategicPlan(plan)).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'sectorPlans.Agriculture.risks' }),
            expect.objectContaining({ field: 'sectorPlans.Telecommunications.risks.2.type' }),
            expect.objectContaining({ field: 'sectorPlans.Telecommunications.risks.2.likelihood' }),
            expect.objectContaining({ field: 'sectorPlans.Telecommunications.risks.2.impact' }),
            expect.objectContaining({ field: 'sectorPlans.Telecommunications.risks.2.tiedCell' })
        ]));
    });

    it('preserves participant capitalization for other-risk text', () => {
        const plan = validPlan();
        plan.sectorPlans.Agriculture.risks[0] = {
            type: 'other', otherText: ' supply risk ', likelihood: 'high', impact: 'high', tiedCell: 'red'
        };
        plan.sectorPlans.Agriculture.risks[1] = {
            type: 'other', otherText: 'Supply Risk', likelihood: 'medium', impact: 'high', tiedCell: 'blue'
        };

        const normalized = normalizeIndustryStrategicPlan(plan);
        expect(normalized.sectorPlans.Agriculture.risks[0].otherText).toBe('supply risk');
        expect(validateIndustryStrategicPlan(plan)).toEqual([]);
    });

    it('reports Not started, Incomplete, and Complete sector status', () => {
        const blank = createBlankIndustryStrategicPlan();
        expect(getIndustrySectorPlanStatus(blank.sectorPlans.Agriculture, 'Agriculture')).toBe('not_started');
        blank.sectorPlans.Agriculture.businessOverview = 'Started';
        expect(getIndustrySectorPlanStatus(blank.sectorPlans.Agriculture, 'Agriculture')).toBe('incomplete');
        expect(getIndustrySectorPlanStatus(validSectorPlan(), 'Agriculture')).toBe('complete');
    });

    it('keeps a version 1 plan readable without converting it into version 2', () => {
        const legacy = normalizeIndustryStrategicPlan({
            version: 1,
            sector: 'telecom',
            ...validSectorPlan()
        });
        const display = getIndustryStrategicPlanDisplayModel(legacy, { blueForecast: 'Stabilization' });

        expect(legacy).toMatchObject({ version: 1, sector: 'Telecommunications' });
        expect(legacy).not.toHaveProperty('sectorPlans');
        expect(display).toMatchObject({ isLegacy: true, blueForecast: 'Stabilization' });
        expect(display.sectors).toHaveLength(1);
    });

    it('provides three independent blank sector plans', () => {
        const blank = createBlankIndustryStrategicPlan();
        expect(blank.version).toBe(2);
        expect(Object.keys(blank.sectorPlans)).toHaveLength(3);
        expect(blank.sectorPlans.Agriculture.risks).toHaveLength(3);
        expect(blank.sectorPlans.Telecommunications.strategicPriorities).toHaveLength(3);
        expect(blank.sectorPlans.Biotechnology.strategicStance).toBeNull();
    });
});
