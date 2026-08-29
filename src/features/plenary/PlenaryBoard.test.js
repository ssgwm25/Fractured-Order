import { describe, expect, it } from 'vitest';
import { createPlenaryBoard } from './PlenaryBoard.js';
import { indicatorLineChartSvg } from './plenaryCharts.js';

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
                diplomacyBands: [{ band: 'Pressure', count: 1 }]
            }
        });
        expect(container.innerHTML).toContain('Real GDP growth');
        expect(container.innerHTML).toContain('National Interest');
        expect(container.innerHTML).toContain('Escalation (Glasl)');
        expect(container.innerHTML).toContain('Diplomacy Index');
        expect(container.innerHTML).not.toContain('plenary-ticker');
        expect(container.innerHTML).toContain('data-team="industry"');
    });
});

describe('plenaryCharts', () => {
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
    });
});
