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

    it('round-trips multi-target forecasts for Red and Industry records', () => {
        const serialized = serializeStrategicOrientationDetails({
            artifactType: 'forecast',
            team: 'red',
            forecastTargets: [
                { key: 'blue', orientation: 'pressure' },
                { key: 'green_asian_pacific', orientation: 'reframe' },
                { key: 'green_europe', orientation: 'stabilization' }
            ],
            rationale: 'Red expects Blue to pressure, Green AP to reframe, and Green Europe to stabilize.',
            forecastSummary: 'Forecasts: Blue -> Pressure; Green (Asian Pacific) -> Reframe; Green (Europe) -> Stabilization.',
            scribeHandoff: 'Forwarded'
        });

        expect(parseStrategicOrientationDetails(serialized)).toMatchObject({
            artifactType: 'forecast',
            team: 'red',
            orientation: 'pressure',
            forecastTargets: [
                {
                    key: 'blue',
                    label: 'Blue',
                    orientation: 'pressure',
                    orientationLabel: 'Pressure',
                    orientationTag: STRATEGIC_ORIENTATION_OPTIONS.pressure.tag
                },
                {
                    key: 'green_asian_pacific',
                    label: 'Green (Asian Pacific)',
                    orientation: 'reframe',
                    orientationLabel: 'Reframe',
                    orientationTag: STRATEGIC_ORIENTATION_OPTIONS.reframe.tag
                },
                {
                    key: 'green_europe',
                    label: 'Green (Europe)',
                    orientation: 'stabilization',
                    orientationLabel: 'Stabilization',
                    orientationTag: STRATEGIC_ORIENTATION_OPTIONS.stabilization.tag
                }
            ],
            rationale: 'Red expects Blue to pressure, Green AP to reframe, and Green Europe to stabilize.',
            forecastSummary: 'Forecasts: Blue -> Pressure; Green (Asian Pacific) -> Reframe; Green (Europe) -> Stabilization.',
            scribeHandoff: 'Forwarded'
        });

        expect(getStrategicOrientationViewModel({
            team: 'red',
            ally_contingencies: serialized
        })).toMatchObject({
            isForecast: true,
            title: 'Red Forecasts',
            hasMultipleForecastTargets: true,
            forecastTargets: [
                { key: 'blue', orientationLabel: 'Pressure' },
                { key: 'green_asian_pacific', orientationLabel: 'Reframe' },
                { key: 'green_europe', orientationLabel: 'Stabilization' }
            ]
        });
    });

    it('supports streamlined Strategic Orientation records with only orientation and rationale', () => {
        const serialized = serializeStrategicOrientationDetails({
            artifactType: 'selection',
            team: 'blue',
            orientation: 'pressure',
            rationale: 'Blue wants to focus pressure on PRC GDP growth.',
            scribeHandoff: 'Forwarded'
        });

        expect(parseStrategicOrientationDetails(serialized)).toMatchObject({
            orientation: 'pressure',
            orientationLabel: 'Pressure',
            orientationTag: STRATEGIC_ORIENTATION_OPTIONS.pressure.tag,
            primaryLevers: [],
            acceptedCosts: [],
            posture: '',
            rationale: 'Blue wants to focus pressure on PRC GDP growth.',
            scribeHandoff: 'Forwarded'
        });
    });

    it('requires Blue, Green, Red, and Industry Strategic Orientation artifacts to be submitted before completion', () => {
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
            },
            {
                team: 'industry',
                status: 'draft',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: 'forecast',
                    team: 'industry',
                    orientation: 'stabilization'
                })
            }
        ];

        expect(getStrategicOrientationCompletion(actions)).toMatchObject({
            complete: false,
            submittedTeams: ['blue', 'green'],
            missingTeams: ['red', 'industry']
        });

        expect(getStrategicOrientationCompletion([
            ...actions.slice(0, 2),
            { ...actions[2], status: 'submitted' },
            { ...actions[3], status: 'submitted' }
        ])).toMatchObject({
            complete: true,
            missingTeams: []
        });
    });
});
