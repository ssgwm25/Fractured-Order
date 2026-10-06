import { describe, expect, it } from 'vitest';

import {
    TIMER_ALLOCATION_MAX_SECONDS,
    TIMER_ALLOCATION_MIN_SECONDS,
    buildDefaultTimerAllocations,
    getTimerAllocationSeconds,
    minutesToAllocationSeconds,
    normalizeTimerAllocations,
    resolveGameStateTimerMark,
    secondsToWholeMinutes
} from './timerAllocations.js';
import { INDUSTRY_SECTORS } from '../features/actions/industryStrategicPlan.js';
import { serializeStrategicOrientationDetails } from '../features/actions/strategicOrientationDetails.js';

function buildCompleteIndustryStrategicPlan() {
    const sectorPlan = {
        businessOverview: 'Builds critical capacity and protects resilient supply.',
        risks: [
            { type: 'supply_disruption', likelihood: 'high', impact: 'high', tiedCell: 'red' },
            { type: 'secondary_sanctions_exposure', likelihood: 'medium', impact: 'high', tiedCell: 'blue' },
            { type: 'reputational', likelihood: 'medium', impact: 'medium', tiedCell: 'green' }
        ],
        redPriorities: 'Preserve market access and acquire strategic technology.',
        partners: [{
            partner: 'Kenya',
            whyTheyMatter: 'Regional capacity and market access.',
            likelyWant: 'Long-term investment and technology access.'
        }],
        firstAmbassadorTarget: {
            cell: 'blue',
            reason: 'Coordinate resilient supply before escalation.'
        },
        strategicPriorities: [
            { priority: 'Protect supply', successLooksLike: 'Critical inputs remain available.' },
            { priority: 'Preserve access', successLooksLike: 'Priority markets remain open.' },
            { priority: 'Build capacity', successLooksLike: 'A funded partner program launches.' }
        ],
        strategicStance: 3,
        redLine: 'Do not transfer protected technology.'
    };

    return {
        version: 2,
        sectorPlans: Object.fromEntries(INDUSTRY_SECTORS.map(({ value }) => [
            value,
            structuredClone(sectorPlan)
        ]))
    };
}

function buildStrategicOrientationAction(team, {
    status = 'submitted',
    artifactType = team === 'blue' ? 'selection' : 'forecast'
} = {}) {
    return {
        id: `strategic-orientation-${team}`,
        team,
        status,
        mechanism: 'Strategic Orientation',
        ally_contingencies: serializeStrategicOrientationDetails({
            team,
            ...(team === 'industry'
                ? {
                    forecastTargets: [{ key: 'blue', orientation: 'pressure' }],
                    industryStrategicPlan: buildCompleteIndustryStrategicPlan()
                }
                : { artifactType, orientation: 'pressure' })
        })
    };
}

describe('timer allocation helpers', () => {
    it('builds a complete allocation map using the current timer default', () => {
        expect(buildDefaultTimerAllocations()).toEqual({
            strategic_orientation: 5400,
            move_1: 5400,
            move_2: 5400,
            move_3: 5400
        });
    });

    it('normalizes partial and invalid allocations without dropping required marks', () => {
        expect(normalizeTimerAllocations({
            strategic_orientation: 1800,
            move_1: '900',
            move_2: -20,
            move_3: 999999,
            unexpected_mark: 120
        })).toEqual({
            strategic_orientation: 1800,
            move_1: 900,
            move_2: TIMER_ALLOCATION_MIN_SECONDS,
            move_3: TIMER_ALLOCATION_MAX_SECONDS
        });
    });

    it('falls back to defaults for null or empty allocation values', () => {
        expect(normalizeTimerAllocations({
            strategic_orientation: null,
            move_1: '',
            move_2: false,
            move_3: 1200
        })).toEqual({
            strategic_orientation: 5400,
            move_1: 5400,
            move_2: 5400,
            move_3: 1200
        });
    });

    it('resolves Strategic Orientation before the Move 1 gate is complete', () => {
        expect(resolveGameStateTimerMark({ move: 1, phase: 1 }, [
            buildStrategicOrientationAction('blue')
        ])).toMatchObject({
            key: 'strategic_orientation',
            label: 'Strategic Orientation'
        });

        expect(resolveGameStateTimerMark({ move: 1, phase: 1 }, [
            buildStrategicOrientationAction('blue'),
            buildStrategicOrientationAction('green'),
            buildStrategicOrientationAction('red'),
            buildStrategicOrientationAction('industry')
        ])).toMatchObject({
            key: 'move_1',
            label: 'Move 1'
        });
    });

    it('converts between minutes and bounded allocation seconds', () => {
        expect(minutesToAllocationSeconds(45)).toBe(2700);
        expect(minutesToAllocationSeconds(0)).toBe(TIMER_ALLOCATION_MIN_SECONDS);
        expect(secondsToWholeMinutes(getTimerAllocationSeconds({ move_2: 2700 }, 'move_2'))).toBe(45);
    });
});
