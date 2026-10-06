import { describe, expect, it } from 'vitest';

import {
    createBlankIndustryStrategicPlan,
    normalizeIndustryStrategicPlan,
    validateIndustryStrategicPlan
} from './industryStrategicPlan.js';

function validPlan(overrides = {}) {
    return {
        version: 1,
        sector: 'Telecommunications',
        businessOverview: 'Builds communications infrastructure and protects resilient capacity.',
        risks: [
            { type: 'supply_disruption', otherText: '', likelihood: 'high', impact: 'high', tiedCell: 'red' },
            { type: 'secondary_sanctions_exposure', otherText: '', likelihood: 'medium', impact: 'high', tiedCell: 'blue' },
            { type: 'reputational', otherText: '', likelihood: 'medium', impact: 'medium', tiedCell: 'green' }
        ],
        redPriorities: 'Red will prioritize market access and technology acquisition.',
        partners: [
            { partner: 'Allied supplier', whyTheyMatter: 'Provides critical inputs', likelyWant: 'Long-term purchasing commitments' },
            { partner: '', whyTheyMatter: '', likelyWant: '' },
            { partner: '', whyTheyMatter: '', likelyWant: '' }
        ],
        firstAmbassadorTarget: { cell: 'green', reason: 'Coordinate an allied supply response.' },
        strategicPriorities: [
            { priority: 'Protect capacity', successLooksLike: 'No critical production outage.' },
            { priority: 'Diversify suppliers', successLooksLike: 'A second qualified supplier is contracted.' },
            { priority: 'Preserve access', successLooksLike: 'Priority markets remain open.' }
        ],
        strategicStance: 3,
        redLine: 'Do not transfer protected technology.',
        ...overrides
    };
}

describe('Industry Strategic Plan domain contract', () => {
    it('normalizes a valid plan without mutating the input', () => {
        const input = validPlan();
        const snapshot = structuredClone(input);
        const normalized = normalizeIndustryStrategicPlan(input);

        expect(normalized).toMatchObject({ version: 1, sector: 'Telecommunications', strategicStance: 3 });
        expect(normalized.partners).toHaveLength(1);
        expect(validateIndustryStrategicPlan(normalized)).toEqual([]);
        expect(input).toEqual(snapshot);
    });

    it('uses the platform sector vocabulary and accepts historical aliases during normalization', () => {
        expect(normalizeIndustryStrategicPlan(validPlan({ sector: 'telecom' })).sector).toBe('Telecommunications');
        expect(validateIndustryStrategicPlan(validPlan({ sector: 'energy' }))).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'sector' })
        ]));
    });

    it('requires exactly three complete, valid, distinct ordinary risks', () => {
        expect(validateIndustryStrategicPlan(validPlan({ risks: validPlan().risks.slice(0, 2) }))).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'risks' })
        ]));
        expect(validateIndustryStrategicPlan(validPlan({ risks: [
            ...validPlan().risks.slice(0, 2),
            { type: 'supply_disruption', likelihood: 'urgent', impact: 'severe', tiedCell: 'industry' }
        ] }))).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'risks.2.type' }),
            expect.objectContaining({ field: 'risks.2.likelihood' }),
            expect.objectContaining({ field: 'risks.2.impact' }),
            expect.objectContaining({ field: 'risks.2.tiedCell' })
        ]));
    });

    it('requires other-risk text and preserves participant capitalization', () => {
        const risks = structuredClone(validPlan().risks);
        risks[0] = { type: 'other', otherText: ' supply risk ', likelihood: 'high', impact: 'high', tiedCell: 'red' };
        expect(normalizeIndustryStrategicPlan(validPlan({ risks })).risks[0].otherText).toBe('supply risk');

        risks[0].otherText = '   ';
        expect(validateIndustryStrategicPlan(validPlan({ risks }))).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'risks.0.otherText' })
        ]));

        const distinctCapitalization = structuredClone(validPlan().risks);
        distinctCapitalization[0] = { type: 'other', otherText: 'supply risk', likelihood: 'high', impact: 'high', tiedCell: 'red' };
        distinctCapitalization[1] = { type: 'other', otherText: 'Supply Risk', likelihood: 'medium', impact: 'high', tiedCell: 'blue' };
        expect(validateIndustryStrategicPlan(validPlan({ risks: distinctCapitalization }))).toEqual([]);

        distinctCapitalization[1].otherText = 'supply risk';
        expect(validateIndustryStrategicPlan(validPlan({ risks: distinctCapitalization }))).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'risks.1.otherText' })
        ]));
    });

    it('removes blank partner rows but rejects partial rows and requires one partner', () => {
        expect(normalizeIndustryStrategicPlan(validPlan()).partners).toHaveLength(1);
        expect(validateIndustryStrategicPlan(validPlan({ partners: [] }))).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'partners' })
        ]));
        expect(validateIndustryStrategicPlan(validPlan({ partners: [
            { partner: 'Supplier', whyTheyMatter: '', likelyWant: '' }
        ] }))).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'partners.0.whyTheyMatter' }),
            expect.objectContaining({ field: 'partners.0.likelyWant' })
        ]));
        expect(validateIndustryStrategicPlan(validPlan({ partners: [
            { partner: '', whyTheyMatter: '', likelyWant: '' },
            { partner: '', whyTheyMatter: '', likelyWant: '' },
            { partner: 'Supplier', whyTheyMatter: '', likelyWant: '' }
        ] }))).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'partners.2.whyTheyMatter' }),
            expect.objectContaining({ field: 'partners.2.likelyWant' })
        ]));
    });

    it('requires exactly three complete priorities and a stance from 1 through 5', () => {
        expect(validateIndustryStrategicPlan(validPlan({ strategicPriorities: [
            { priority: 'Only one', successLooksLike: '' }
        ], strategicStance: 0 }))).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'strategicPriorities' }),
            expect.objectContaining({ field: 'strategicPriorities.0.successLooksLike' }),
            expect.objectContaining({ field: 'strategicStance' })
        ]));
        expect(validateIndustryStrategicPlan(validPlan({ strategicStance: 6 }))).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'strategicStance' })
        ]));
    });

    it('requires overview, Red priorities, ambassador target, and red line', () => {
        const errors = validateIndustryStrategicPlan(validPlan({
            businessOverview: ' ',
            redPriorities: '',
            firstAmbassadorTarget: { cell: '', reason: '' },
            redLine: ''
        }));
        expect(errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'businessOverview' }),
            expect.objectContaining({ field: 'redPriorities' }),
            expect.objectContaining({ field: 'firstAmbassadorTarget.cell' }),
            expect.objectContaining({ field: 'firstAmbassadorTarget.reason' }),
            expect.objectContaining({ field: 'redLine' })
        ]));
    });

    it('provides the complete three-row blank reference state', () => {
        const blank = createBlankIndustryStrategicPlan();
        expect(blank.risks).toHaveLength(3);
        expect(blank.partners).toHaveLength(3);
        expect(blank.strategicPriorities).toHaveLength(3);
        expect(blank.strategicStance).toBeNull();
    });
});
