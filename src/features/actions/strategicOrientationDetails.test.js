import { describe, expect, it } from 'vitest';

import {
    STRATEGIC_ORIENTATION_CONTRACT_VERSION,
    STRATEGIC_ORIENTATION_OPTIONS,
    STRATEGIC_ORIENTATION_TEAM_PROFILES,
    getStrategicOrientationArtifactLabel,
    getStrategicOrientationCompletion,
    getStrategicOrientationViewModel,
    parseStrategicOrientationDetails,
    serializeStrategicOrientationDetails
} from './strategicOrientationDetails.js';

const TEAM_FIXTURES = {
    blue: {
        ownOrientation: 'pressure',
        forecastTargets: [{ key: 'red', orientation: 'stabilization' }],
        forecastActionDescription: 'Red will preserve market access while limiting escalation.'
    },
    red: {
        ownOrientation: 'reframe',
        orientationRationale: 'Red will reorganize relationships for longer-term leverage.',
        forecastTargets: [
            { key: 'blue', orientation: 'pressure' },
            { key: 'green_asian_pacific', orientation: 'reframe' },
            { key: 'green_europe', orientation: 'stabilization' }
        ]
    },
    green: {
        ownOrientation: 'stabilization',
        forecastTargets: [{ key: 'blue', orientation: 'pressure' }],
        strategyDescription: 'Green will protect regional stability while diversifying exposure.'
    },
    industry: {
        ownOrientation: 'reframe',
        forecastTargets: [{ key: 'blue', orientation: 'stabilization' }],
        strategyDescription: 'Industry will shift capital toward resilient partner networks.'
    }
};

describe('strategic orientation details helpers', () => {
    it.each(Object.entries(TEAM_FIXTURES))('round-trips the %s team profile', (team, fixture) => {
        const parsed = parseStrategicOrientationDetails(serializeStrategicOrientationDetails({
            team,
            ...fixture,
            scribeHandoff: 'Forwarded'
        }));

        expect(parsed).toMatchObject({
            contractVersion: STRATEGIC_ORIENTATION_CONTRACT_VERSION,
            artifactType: 'orientation_and_forecast',
            team,
            ownOrientation: {
                id: fixture.ownOrientation,
                label: STRATEGIC_ORIENTATION_OPTIONS[fixture.ownOrientation].name,
                tag: STRATEGIC_ORIENTATION_OPTIONS[fixture.ownOrientation].tag
            },
            orientationRationale: fixture.orientationRationale || '',
            forecastActionDescription: fixture.forecastActionDescription || '',
            strategyDescription: fixture.strategyDescription || '',
            scribeHandoff: 'Forwarded'
        });
        expect(parsed.forecastTargets.map(({ key }) => key)).toEqual(fixture.forecastTargets.map(({ key }) => key));
        parsed.forecastTargets.forEach((target) => {
            expect(target.selection).toEqual({
                id: target.orientation,
                label: target.orientationLabel,
                tag: target.orientationTag
            });
        });
    });

    it('defines the exact ordered team workflow matrix', () => {
        expect(STRATEGIC_ORIENTATION_TEAM_PROFILES.blue.sections.map(({ key }) => key)).toEqual([
            'ownOrientation', 'forecast:red', 'forecastActionDescription'
        ]);
        expect(STRATEGIC_ORIENTATION_TEAM_PROFILES.red.sections.map(({ key }) => key)).toEqual([
            'ownOrientation', 'orientationRationale', 'forecast:blue', 'forecast:green_asian_pacific', 'forecast:green_europe'
        ]);
        expect(STRATEGIC_ORIENTATION_TEAM_PROFILES.green.sections.map(({ key }) => key)).toEqual([
            'forecast:blue', 'ownOrientation', 'strategyDescription'
        ]);
        expect(STRATEGIC_ORIENTATION_TEAM_PROFILES.industry.sections.map(({ key }) => key)).toEqual([
            'forecast:blue', 'ownOrientation', 'strategyDescription'
        ]);
    });

    it('exposes independent view-model capabilities for a combined record', () => {
        const viewModel = getStrategicOrientationViewModel({
            team: 'red',
            ally_contingencies: serializeStrategicOrientationDetails({ team: 'red', ...TEAM_FIXTURES.red })
        });

        expect(viewModel).toMatchObject({
            hasOwnOrientation: true,
            hasForecasts: true,
            hasOrientationRationale: true,
            hasStrategyDescription: false,
            orientationRationale: TEAM_FIXTURES.red.orientationRationale
        });
        expect(viewModel.forecastTargets.map(({ key }) => key)).toEqual([
            'blue', 'green_asian_pacific', 'green_europe'
        ]);
        expect(getStrategicOrientationArtifactLabel(viewModel)).toBe('Orientation & Forecast');
    });

    it('rejects unknown and duplicate forecast targets', () => {
        expect(() => serializeStrategicOrientationDetails({
            team: 'blue',
            ownOrientation: 'pressure',
            forecastTargets: [{ key: 'unknown', orientation: 'pressure' }]
        })).toThrow(/Unknown Strategic Orientation forecast target/);

        expect(() => serializeStrategicOrientationDetails({
            team: 'blue',
            ownOrientation: 'pressure',
            forecastTargets: [
                { key: 'red', orientation: 'pressure' },
                { key: 'red', orientation: 'stabilization' }
            ]
        })).toThrow(/Duplicate Strategic Orientation forecast target/);
    });

    it('preserves legacy selection-only and forecast-only artifacts without minting new fields', () => {
        const legacySelection = [
            'Strategic Orientation Details',
            'Period: pre_move_1',
            'Artifact Type: selection',
            'Team: blue',
            'Orientation: pressure',
            'Orientation Label: Pressure',
            `Orientation Tag: ${STRATEGIC_ORIENTATION_OPTIONS.pressure.tag}`,
            'Rationale: Legacy Blue rationale',
            'Scribe Handoff: Forwarded'
        ].join('\n');
        const legacyForecast = legacySelection
            .replace('Artifact Type: selection', 'Artifact Type: forecast')
            .replace('Team: blue', 'Team: green');

        expect(parseStrategicOrientationDetails(legacySelection)).toMatchObject({
            contractVersion: 1,
            ownOrientation: { id: 'pressure' },
            forecastTargets: [],
            orientationRationale: ''
        });
        expect(getStrategicOrientationArtifactLabel(getStrategicOrientationViewModel({ ally_contingencies: legacySelection }))).toBe('Selection');
        expect(parseStrategicOrientationDetails(legacyForecast)).toMatchObject({
            contractVersion: 1,
            ownOrientation: null,
            forecastTargets: [{ key: 'blue', orientation: 'pressure' }]
        });
        expect(getStrategicOrientationArtifactLabel(getStrategicOrientationViewModel({ ally_contingencies: legacyForecast }))).toBe('Forecast');
    });

    it('keeps the one-submitted-artifact-per-team completion gate unchanged', () => {
        const actions = Object.entries(TEAM_FIXTURES).map(([team, fixture]) => ({
            team,
            status: 'submitted',
            ally_contingencies: serializeStrategicOrientationDetails({ team, ...fixture })
        }));

        expect(getStrategicOrientationCompletion(actions)).toMatchObject({ complete: true, missingTeams: [] });
        expect(getStrategicOrientationCompletion(actions.slice(0, 3))).toMatchObject({
            complete: false,
            missingTeams: ['industry']
        });
    });
});
