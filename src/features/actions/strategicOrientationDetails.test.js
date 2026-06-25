import { describe, expect, it } from 'vitest';

import {
    STRATEGIC_ORIENTATION_OPTIONS,
    getStrategicOrientationCompletion,
    getStrategicOrientationViewModel,
    parseStrategicOrientationDetails,
    serializeStrategicOrientationDetails
} from './strategicOrientationDetails.js';

describe('strategic orientation details helpers', () => {
    it('round-trips the pre-Move 1 Strategic Orientation envelope', () => {
        const serialized = serializeStrategicOrientationDetails({
            artifactType: 'selection',
            team: 'blue',
            orientation: 'pressure',
            primaryLevers: ['Expanded financial sanctions', 'Technology export controls'],
            acceptedCosts: ['Sustained economic friction'],
            posture: 'Calibrated \u2014 escalate deliberately',
            rationale: 'Blue wants visible leverage before Move 1.',
            scribeHandoff: 'Forwarded'
        });

        expect(serialized).toContain('Strategic Orientation Details');
        expect(serialized).toContain('Period: pre_move_1');
        expect(serialized).toContain('Scribe Handoff: Forwarded');
        expect(parseStrategicOrientationDetails(serialized)).toMatchObject({
            period: 'pre_move_1',
            artifactType: 'selection',
            team: 'blue',
            orientation: 'pressure',
            orientationLabel: 'Pressure',
            orientationTag: STRATEGIC_ORIENTATION_OPTIONS.pressure.tag,
            primaryLevers: ['Expanded financial sanctions', 'Technology export controls'],
            acceptedCosts: ['Sustained economic friction'],
            posture: 'Calibrated \u2014 escalate deliberately',
            rationale: 'Blue wants visible leverage before Move 1.',
            scribeHandoff: 'Forwarded'
        });
    });

    it('hydrates a forecast view model from persisted action fields', () => {
        const action = {
            team: 'green',
            goal: 'Green Forecast: Blue Stabilization',
            status: 'draft',
            ally_contingencies: serializeStrategicOrientationDetails({
                artifactType: 'forecast',
                team: 'green',
                orientation: 'stabilization',
                primaryLevers: ['Diplomatic engagement channels'],
                acceptedCosts: ['Reduced coercive flexibility'],
                posture: 'Predictable \u2014 transparent signaling',
                rationale: 'Green expects Blue to lower volatility.',
                scribeHandoff: 'Forwarded'
            })
        };

        expect(getStrategicOrientationViewModel(action)).toMatchObject({
            hasStrategicOrientationDetails: true,
            isForecast: true,
            title: 'Green Forecast: Blue Stabilization',
            team: 'green',
            orientationLabel: 'Stabilization',
            primaryLevers: ['Diplomatic engagement channels'],
            acceptedCosts: ['Reduced coercive flexibility'],
            posture: 'Predictable \u2014 transparent signaling',
            rationale: 'Green expects Blue to lower volatility.',
            scribeHandoff: 'Forwarded',
            submittedToWhiteCell: false
        });
    });

    it('requires Blue, Green, and Red Strategic Orientation artifacts to be submitted before completion', () => {
        const actions = [
            {
                team: 'blue',
                status: 'submitted',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: 'selection',
                    team: 'blue',
                    orientation: 'pressure'
                })
            },
            {
                team: 'green',
                status: 'adjudicated',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: 'forecast',
                    team: 'green',
                    orientation: 'pressure'
                })
            },
            {
                team: 'red',
                status: 'draft',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: 'forecast',
                    team: 'red',
                    orientation: 'reframe'
                })
            }
        ];

        expect(getStrategicOrientationCompletion(actions)).toMatchObject({
            complete: false,
            submittedTeams: ['blue', 'green'],
            missingTeams: ['red']
        });

        expect(getStrategicOrientationCompletion([
            ...actions.slice(0, 2),
            { ...actions[2], status: 'submitted' }
        ])).toMatchObject({
            complete: true,
            missingTeams: []
        });
    });
});
