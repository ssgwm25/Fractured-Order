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
            instruments: ['Economic', 'Diplomacy', 'Information', 'Military'],
            levers: ['Export Controls', 'Sanctions'],
            sectors: ['Biotechnology', 'Agriculture'],
            supplyChainFocusDecision: 'Yes',
            supplyChainActionAngles: ['Build resilience for Blue', 'Disrupt Red'],
            supplyChainAreas: ['Extraction', 'Advanced Manufacturing'],
            implementation: 'Legislative',
            legislativeOptions: ['Existing legislation/policy', 'Proposing new legislation/policy'],
            enforcementTimeline: '6 months',
            scribeHandoff: 'Forwarded',
            coordinatedDecision: 'Yes',
            coordinated: ['Executive'],
            informedEngagedDecision: 'Yes',
            informed: ['Industry', 'Allies']
        });

        expect(serialized).toContain('Blue Team Action Details');
        expect(serialized).toContain('Scribe Handoff: Forwarded');
        expect(serialized).toContain('Coordinated Decision: Yes');
        expect(serialized).toContain('Informed/Engaged Decision: Yes');
        expect(serialized).toContain('Supply Chain Focus Decision: Yes');
        expect(serialized).toContain('Supply Chain Action Angles: ["Build resilience for Blue","Disrupt Red"]');
        expect(serialized).toContain('Supply Chain Areas: ["Extraction","Advanced Manufacturing"]');
        expect(parseBlueActionDetails(serialized)).toEqual({
            objective: 'Pressure semiconductor inputs before the next move.',
            instrumentOfPower: 'Economic',
            instruments: ['Economic', 'Diplomacy', 'Information', 'Military'],
            lever: 'Export Controls',
            levers: ['Export Controls', 'Sanctions'],
            sector: 'Biotechnology',
            sectors: ['Biotechnology', 'Agriculture'],
            supplyChainFocusDecision: 'Yes',
            supplyChainActionAngles: ['Build resilience for Blue', 'Disrupt Red'],
            supplyChainArea: 'Extraction',
            supplyChainAreas: ['Extraction', 'Advanced Manufacturing'],
            supplyChainFocus: 'Extraction',
            supplyChainFocuses: ['Extraction', 'Advanced Manufacturing'],
            implementation: 'Legislative',
            legislativeOptions: ['Existing legislation/policy', 'Proposing new legislation/policy'],
            enforcementTimeline: '6 months',
            scribeHandoff: 'Forwarded',
            coordinatedDecision: 'Yes',
            coordinated: ['Executive'],
            informedEngagedDecision: 'Yes',
            informed: ['Industry', 'Allies']
        });
    });

    it('parses legacy single-value envelopes without losing replay compatibility', () => {
        const legacyEnvelope = [
            'Blue Team Action Details',
            'Objective: Pressure semiconductor inputs before the next move.',
            'Lever: Export Controls',
            'Supply Chain Focus: Refinement',
            'Implementation: Executive Order',
            'Enforcement Timeline: 6 months',
            'Coordinated: Executive',
            'Informed: Corporate, Allied'
        ].join('\n');

        expect(parseBlueActionDetails(legacyEnvelope)).toEqual({
            objective: 'Pressure semiconductor inputs before the next move.',
            instrumentOfPower: '',
            instruments: [],
            lever: 'Export Controls',
            levers: ['Export Controls'],
            sector: '',
            sectors: [],
            supplyChainFocusDecision: 'Yes',
            supplyChainActionAngles: [],
            supplyChainArea: 'Refinement',
            supplyChainAreas: ['Refinement'],
            supplyChainFocus: 'Refinement',
            supplyChainFocuses: ['Refinement'],
            implementation: 'Executive Order',
            legislativeOptions: [],
            enforcementTimeline: '6 months',
            scribeHandoff: '',
            coordinatedDecision: '',
            coordinated: ['Executive'],
            informedEngagedDecision: '',
            informed: ['Corporate', 'Allied']
        });
    });

    it('persists a No supply-chain decision without stale hidden selections', () => {
        const parsed = parseBlueActionDetails(serializeBlueActionDetails({
            supplyChainFocusDecision: 'No',
            supplyChainActionAngles: ['Disrupt Red'],
            supplyChainAreas: ['Distribution']
        }));

        expect(parsed).toMatchObject({
            supplyChainFocusDecision: 'No',
            supplyChainActionAngles: [],
            supplyChainArea: '',
            supplyChainAreas: [],
            supplyChainFocus: '',
            supplyChainFocuses: []
        });
        expect(getBlueActionViewModel({
            exposure_type: 'Distribution',
            ally_contingencies: serializeBlueActionDetails({ supplyChainFocusDecision: 'No' })
        })).toMatchObject({
            supplyChainFocusDecision: 'No',
            supplyChainActionAngles: [],
            supplyChainArea: '',
            supplyChainAreas: [],
            supplyChainFocus: '',
            supplyChainFocuses: []
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
                instruments: ['Economic', 'Information', 'Military'],
                levers: ['Investment Screening', 'Industrial Policy'],
                sectors: ['Biotechnology', 'Agriculture'],
                supplyChainFocusDecision: 'Yes',
                supplyChainActionAngles: ['Build resilience for Blue'],
                supplyChainAreas: ['Refinement', 'Advanced Manufacturing'],
                implementation: 'Legislative',
                legislativeOptions: ['Existing legislation/policy'],
                enforcementTimeline: '12 months',
                scribeHandoff: 'Forwarded',
                coordinatedDecision: 'Yes',
                coordinated: ['Legislative'],
                informedEngagedDecision: 'Yes',
                informed: ['Allies']
            })
        };

        expect(getBlueActionViewModel(action)).toMatchObject({
            hasBlueActionDetails: true,
            title: 'Stabilize biotech leverage',
            objective: 'Reduce dependency on upstream production.',
            instrumentOfPower: 'Economic',
            instruments: ['Economic', 'Information', 'Military'],
            lever: 'Investment Screening',
            levers: ['Investment Screening', 'Industrial Policy'],
            sector: 'Biotechnology',
            sectors: ['Biotechnology', 'Agriculture'],
            supplyChainFocusDecision: 'Yes',
            supplyChainActionAngles: ['Build resilience for Blue'],
            supplyChainArea: 'Refinement',
            supplyChainAreas: ['Refinement', 'Advanced Manufacturing'],
            supplyChainFocus: 'Refinement',
            supplyChainFocuses: ['Refinement', 'Advanced Manufacturing'],
            legislativeOptions: ['Existing legislation/policy'],
            enforcementTimeline: '12 months',
            focusCountries: ['PRC', 'Japan'],
            scribeHandoff: 'Forwarded',
            coordinatedDecision: 'Yes',
            coordinated: ['Legislative'],
            informedEngagedDecision: 'Yes',
            informed: ['Allies']
        });
    });
});
