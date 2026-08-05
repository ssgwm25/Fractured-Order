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
            informed: ['Industry', 'Allies'],
            notificationTeams: ['Green', 'Industry'],
            notificationNote: 'Share the licensing timeline before the move closes.'
        });

        expect(serialized).toContain('Blue Team Action Details');
        expect(serialized).toContain('Scribe Handoff: Forwarded');
        expect(serialized).toContain('Coordinated Decision: Yes');
        expect(serialized).toContain('Informed/Engaged Decision: Yes');
        expect(serialized).toContain('Notification Teams: ["Green","Industry"]');
        expect(serialized).toContain('Notification Note: Share the licensing timeline before the move closes.');
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
            informed: ['Industry', 'Allies'],
            notificationTeams: ['Green', 'Industry'],
            notificationNote: 'Share the licensing timeline before the move closes.'
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
            informed: ['Corporate', 'Allied'],
            notificationTeams: [],
            notificationNote: ''
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
                informed: ['Allies'],
                notificationTeams: ['Green'],
                notificationNote: 'Green should prepare the diplomatic readout.'
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
            informed: ['Allies'],
            notificationTeams: ['Green'],
            notificationNote: 'Green should prepare the diplomatic readout.'
        });

        expect(getBlueActionViewModel(action).artifactDetails).toEqual([
            { label: 'Objective', value: 'Reduce dependency on upstream production.' },
            { label: 'Instrument of Power', value: 'Economic, Information, Military' },
            { label: 'Levers', value: 'Investment Screening, Industrial Policy' },
            { label: 'Supply Chain Decision', value: 'Yes' },
            { label: 'Action Angles', value: 'Build resilience for Blue' },
            { label: 'Supply Chain Areas', value: 'Refinement, Advanced Manufacturing' },
            { label: 'Implementation', value: 'Legislative' },
            { label: 'Legislative Route', value: 'Existing legislation/policy' },
            { label: 'Sectors', value: 'Biotechnology, Agriculture' },
            { label: 'Focus Countries', value: 'PRC, Japan' },
            { label: 'Coordination Decision', value: 'Yes' },
            { label: 'Coordination Selections', value: 'Legislative' },
            { label: 'Informed/Engaged Decision', value: 'Yes' },
            { label: 'Informed/Engaged Selections', value: 'Allies' },
            { label: 'Teams to Inform', value: 'Green' },
            { label: 'Notification Note', value: 'Green should prepare the diplomatic readout.' },
            { label: 'Enforcement Timeline', value: '12 months' },
            { label: 'Expected Outcomes', value: 'Shift supply-chain leverage before the next move.' }
        ]);
    });

    it('keeps action notifications distinct from Facilitator informed and engaged decisions', () => {
        const parsed = parseBlueActionDetails(serializeBlueActionDetails({
            informedEngagedDecision: 'No',
            informed: [],
            notificationTeams: ['Green', 'Industry', 'Allies'],
            notificationNote: 'Inform both teams after the action is approved.'
        }));

        expect(parsed).toMatchObject({
            informedEngagedDecision: 'No',
            informed: [],
            notificationTeams: ['Green', 'Industry'],
            notificationNote: 'Inform both teams after the action is approved.'
        });
    });
});
