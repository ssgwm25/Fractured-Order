import { describe, expect, it } from 'vitest';

import {
    getBlueActionViewModel,
    parseBlueActionDetails,
    serializeBlueActionDetails
} from './blueActionDetails.js';

describe('blue action details helpers', () => {
    it('round-trips the Blue Team detail envelope', () => {
        const serialized = serializeBlueActionDetails({
            objective: 'Pressure semiconductor inputs before the next move.',
            levers: ['Export Controls', 'Sanctions'],
            sectors: ['Biotechnology', 'Agriculture'],
            implementation: 'Legislative',
            legislativeOptions: ['Existing legislation/policy', 'Proposing new legislation/policy'],
            enforcementTimeline: '6 months',
            coordinated: ['Executive'],
            informed: ['Corporate', 'Allied']
        });

        expect(serialized).toContain('Blue Team Action Details');
        expect(parseBlueActionDetails(serialized)).toEqual({
            objective: 'Pressure semiconductor inputs before the next move.',
            lever: 'Export Controls',
            levers: ['Export Controls', 'Sanctions'],
            sector: 'Biotechnology',
            sectors: ['Biotechnology', 'Agriculture'],
            implementation: 'Legislative',
            legislativeOptions: ['Existing legislation/policy', 'Proposing new legislation/policy'],
            enforcementTimeline: '6 months',
            coordinated: ['Executive'],
            informed: ['Corporate', 'Allied']
        });
    });

    it('parses legacy single-value envelopes without losing replay compatibility', () => {
        const legacyEnvelope = [
            'Blue Team Action Details',
            'Objective: Pressure semiconductor inputs before the next move.',
            'Lever: Export Controls',
            'Implementation: Executive Order',
            'Enforcement Timeline: 6 months',
            'Coordinated: Executive',
            'Informed: Corporate, Allied'
        ].join('\n');

        expect(parseBlueActionDetails(legacyEnvelope)).toEqual({
            objective: 'Pressure semiconductor inputs before the next move.',
            lever: 'Export Controls',
            levers: ['Export Controls'],
            sector: '',
            sectors: [],
            implementation: 'Executive Order',
            legislativeOptions: [],
            enforcementTimeline: '6 months',
            coordinated: ['Executive'],
            informed: ['Corporate', 'Allied']
        });
    });

    it('hydrates a Blue Team action view model from persisted action fields', () => {
        const action = {
            team: 'blue',
            goal: 'Stabilize biotech leverage',
            mechanism: 'Economic',
            sector: 'Biotechnology',
            exposure_type: 'Advanced Manufacturing',
            targets: ['PRC', 'Japan'],
            expected_outcomes: 'Shift supply-chain leverage before the next move.',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Reduce dependency on upstream production.',
                levers: ['Investment Screening', 'Industrial Policy'],
                sectors: ['Biotechnology', 'Agriculture'],
                implementation: 'Legislative',
                legislativeOptions: ['Existing legislation/policy'],
                enforcementTimeline: '12 months',
                coordinated: ['Legislative'],
                informed: ['Allied']
            })
        };

        expect(getBlueActionViewModel(action)).toMatchObject({
            hasBlueActionDetails: true,
            title: 'Stabilize biotech leverage',
            objective: 'Reduce dependency on upstream production.',
            instrumentOfPower: 'Economic',
            lever: 'Investment Screening',
            levers: ['Investment Screening', 'Industrial Policy'],
            sector: 'Biotechnology',
            sectors: ['Biotechnology', 'Agriculture'],
            supplyChainFocus: 'Advanced Manufacturing',
            legislativeOptions: ['Existing legislation/policy'],
            enforcementTimeline: '12 months',
            focusCountries: ['PRC', 'Japan'],
            coordinated: ['Legislative'],
            informed: ['Allied']
        });
    });
});
