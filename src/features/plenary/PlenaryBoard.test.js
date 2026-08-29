import { describe, expect, it } from 'vitest';
import { createPlenaryBoard } from './PlenaryBoard.js';
import {
    diplomacyTrajectorySvg,
    glaslStepChartSvg,
    indicatorLineChartSvg,
    orientationSparklineSvg
} from './plenaryCharts.js';

describe('PlenaryBoard', () => {
    it('renders the connect state with a landing-page link', () => {
        const container = { innerHTML: '' };
        const board = createPlenaryBoard(container);
        board.render({ mode: 'connect' });
        expect(container.innerHTML).toContain('Connect a session to this browser');
        expect(container.innerHTML).toContain('href="./index.html"');
    });

    it('renders macro charts, NI, Glasl, and teams from a model', () => {
        const container = { innerHTML: '' };
        const board = createPlenaryBoard(container);
        board.render({
            mode: 'ready',
            model: {
                macroTrend: {
                    quarters: ['2027Q1', '2027Q2'],
                    action_count: 1,
                    indicators: {
                        real_gdp_growth: {
                            label: 'Real GDP growth',
                            verdict: 'favorable',
                            favorable_direction: 1,
                            baseline: [2, 2],
                            post_action: [2.1, 2.2]
                        }
                    }
                },
                ni: {
                    title: 'National Interest',
                    hasData: true,
                    domains: [
                        { key: 'NI-1', label: 'Homeland', delta: 1, primary: true, count: 1 }
                    ],
                    orientationByMove: [{ move: 1, net: 1 }]
                },
                glasl: {
                    currentStage: 5,
                    startStage: 4,
                    currentLabel: 'Loss of face',
                    hasData: true,
                    points: [{ move: 1, team: 'blue', stageAfter: 5 }]
                },
                teams: [
                    { id: 'blue', label: 'Blue', count: 1, share: 1 },
                    { id: 'red', label: 'Red', count: 0, share: 0 },
                    { id: 'green', label: 'Green', count: 0, share: 0 },
                    { id: 'industry', label: 'Industry', count: 0, share: 0 }
                ],
                diplomacyBands: [{ band: 'Pressure', count: 1 }],
                diplomacy: {
                    hasData: true,
                    bands: [
                        { key: 'Pressure', label: 'Pressure', count: 2, share: 1 },
                        { key: 'Positioning', label: 'Positioning', count: 0, share: 0 },
                        { key: 'Relationship-Building', label: 'Relationships', count: 1, share: 0.5 }
                    ],
                    points: [
                        { band: 'Pressure', team: 'blue', move: 1 },
                        { band: 'Relationship-Building', team: 'green', move: 2 }
                    ]
                }
            }
        });
        expect(container.innerHTML).toContain('Real GDP growth');
        expect(container.innerHTML).toContain('National Interest');
        expect(container.innerHTML).toContain('Escalation (Glasl)');
        expect(container.innerHTML).toContain('Diplomacy Index');
        expect(container.innerHTML).not.toContain('plenary-ticker');
        expect(container.innerHTML).toContain('data-team="industry"');
        expect(container.innerHTML).toContain('>A1</text>');
        expect(container.innerHTML).toContain('data-band="Pressure"');
        expect(container.innerHTML).toContain('Pressure → Relationships');
    });
});

describe('plenaryCharts', () => {
    it('labels action-sequence charts A1, A2 rather than by move', () => {
        const spark = orientationSparklineSvg([
            { move: 1, net: 1, team: 'blue' },
            { move: 1, net: -1, team: 'red' },
            { move: 2, net: 2, team: 'green' }
        ]);
        expect(spark).toContain('>A1</text>');
        expect(spark).toContain('>A2</text>');
        expect(spark).toContain('>A3</text>');
        expect(spark).not.toContain('>M1</text>');
        expect(spark).toContain('var(--color-team-blue)');
        expect(spark).toContain('var(--color-team-red)');
        expect(spark).toContain('var(--color-team-green)');

        const glasl = glaslStepChartSvg([
            { move: 1, team: 'blue', stageAfter: 5 },
            { move: 2, team: 'red', stageAfter: 6 }
        ]);
        expect(glasl).toContain('>A1</text>');
        expect(glasl).toContain('>A2</text>');
        expect(glasl).not.toContain('>M1</text>');

        const diplomacy = diplomacyTrajectorySvg([
            { band: 'Pressure', team: 'blue' },
            { band: 'Positioning', team: 'red' },
            { band: 'Relationship-Building', team: 'green' }
        ]);
        expect(diplomacy).toContain('>A1</text>');
        expect(diplomacy).toContain('>A3</text>');
        expect(diplomacy).toContain('Pressure');
        expect(diplomacy).toContain('Relate');
    });

    it('emits an accessible SVG for a baseline vs post-action series', () => {
        const svg = indicatorLineChartSvg(['2027Q1', '2027Q2'], {
            label: 'Real GDP growth',
            baseline: [2, 2],
            post_action: [2.2, 2.3],
            favorable_direction: 1
        });
        expect(svg).toContain('role="img"');
        expect(svg).toContain('Real GDP growth');
        expect(svg).toContain('var(--color-navy)');
        expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
        expect(svg).toContain('plenary-axis-y');
        expect(svg).toContain('27 Q1');
        expect(svg).not.toContain('preserveAspectRatio="none"');
    });
});
