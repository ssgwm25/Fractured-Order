import { describe, expect, it } from 'vitest';

import { renderIndustryStrategicPlanPositionView } from './industryStrategicPlanPresentation.js';
import {
    getStrategicOrientationViewModel,
    serializeStrategicOrientationDetails
} from './strategicOrientationDetails.js';

function sectorPlan({ overview, priority, stance, redLine, target, reason }) {
    return {
        businessOverview: overview,
        risks: [
            { type: 'supply_disruption', otherText: '', likelihood: 'high', impact: 'high', tiedCell: 'red' },
            { type: 'secondary_sanctions_exposure', otherText: '', likelihood: 'medium', impact: 'high', tiedCell: 'blue' },
            { type: 'reputational', otherText: '', likelihood: 'low', impact: 'medium', tiedCell: 'green' }
        ],
        redPriorities: `Red assumptions for ${priority}.`,
        partners: [{ partner: `${target} partner`, whyTheyMatter: 'Delivery capacity', likelyWant: 'A durable agreement' }],
        firstAmbassadorTarget: { cell: target, reason },
        strategicPriorities: [
            { priority, successLooksLike: `${priority} succeeds.` },
            { priority: `${priority} resilience`, successLooksLike: 'A backup route is active.' },
            { priority: `${priority} access`, successLooksLike: 'Priority markets remain open.' }
        ],
        strategicStance: stance,
        redLine
    };
}

function industryViewModel() {
    return getStrategicOrientationViewModel({
        team: 'industry',
        goal: 'Industry Strategic Plan',
        ally_contingencies: serializeStrategicOrientationDetails({
            team: 'industry',
            forecastTargets: [{ key: 'blue', orientation: 'stabilization' }],
            industryStrategicPlan: {
                version: 2,
                sectorPlans: {
                    Agriculture: sectorPlan({
                        overview: 'Food systems depend on seasonal inputs.',
                        priority: 'Secure food inputs',
                        stance: 1,
                        redLine: 'No interruption to seed access.',
                        target: 'blue',
                        reason: 'Protect import corridors.'
                    }),
                    Telecommunications: sectorPlan({
                        overview: 'Networks depend on advanced chips.',
                        priority: 'Keep networks online',
                        stance: 3,
                        redLine: 'No transfer of protected customer data.',
                        target: 'green',
                        reason: 'Coordinate resilient network investment.'
                    }),
                    Biotechnology: sectorPlan({
                        overview: 'Research depends on trusted lab access.',
                        priority: '<Protect clinical research>',
                        stance: 5,
                        redLine: 'No compromise on trial integrity.',
                        target: 'red',
                        reason: 'Preserve regulated research access.'
                    })
                }
            }
        })
    });
}

describe('Industry Strategic Plan facilitator presentation', () => {
    it('compares the three sector positions before their supporting detail', () => {
        const html = renderIndustryStrategicPlanPositionView(industryViewModel(), {
            idPrefix: 'facilitator-plan'
        });

        expect(html).toContain('Sector position comparison');
        expect(html).toContain('Shared Blue forecast');
        expect(html).toContain('Stabilization');
        expect(html.match(/data-industry-position-sector=/g)).toHaveLength(3);
        expect(html).toContain('data-industry-position-sector="Agriculture"');
        expect(html).toContain('data-industry-position-sector="Telecommunications"');
        expect(html).toContain('data-industry-position-sector="Biotechnology"');
        expect(html).toContain('Profit first');
        expect(html).toContain('Balanced');
        expect(html).toContain('National interest first');
        expect(html).toContain('Secure food inputs');
        expect(html).toContain('Keep networks online');
        expect(html).toContain('&lt;Protect clinical research&gt;');
        expect(html).toContain('No transfer of protected customer data.');
        expect(html).toContain('Green — Coordinate resilient network investment.');
        expect(html).toContain('Supporting assumptions and risks');
        expect(html).toContain('Telecommunications — Risk 1');
        expect(html).toContain('Biotechnology — Strategic Priority 1');
        expect(html).toContain('id="facilitator-plan-agriculture"');
        expect(html).not.toMatch(/<details[^>]* open>/);
        expect(html).not.toContain('Own Orientation');
    });

    it('does not render a comparison for a non-Industry orientation', () => {
        const viewModel = getStrategicOrientationViewModel({
            team: 'blue',
            ally_contingencies: serializeStrategicOrientationDetails({
                team: 'blue',
                ownOrientation: 'pressure',
                forecastTargets: [{ key: 'red', orientation: 'stabilization' }],
                forecastActionDescription: 'Red will protect market access.'
            })
        });

        expect(renderIndustryStrategicPlanPositionView(viewModel)).toBe('');
    });
});
