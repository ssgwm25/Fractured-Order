import { describe, expect, it, vi } from 'vitest';

import {
    applyHeaderGameStateDisplay,
    getHeaderGameStateDisplay,
    isStrategicOrientationHeaderState
} from './gameStateDisplay.js';
import { serializeStrategicOrientationDetails } from '../features/actions/strategicOrientationDetails.js';

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
            artifactType,
            team,
            orientation: 'pressure',
            primaryLevers: ['Expanded financial sanctions'],
            acceptedCosts: ['Sustained economic friction'],
            posture: 'Calibrated - escalate deliberately',
            scribeHandoff: 'Forwarded'
        })
    };
}

function createHeaderElement() {
    const label = { textContent: '' };
    const value = {
        textContent: '',
        closest: vi.fn(() => ({
            querySelector: vi.fn(() => label)
        }))
    };

    return { label, value };
}

describe('game state display helpers', () => {
    it('shows Strategic Orientation while the pre-Move-1 gate is incomplete', () => {
        const display = getHeaderGameStateDisplay({
            move: 1,
            phase: 1
        }, [
            buildStrategicOrientationAction('blue')
        ]);

        expect(display).toMatchObject({
            isStrategicOrientation: true,
            moveLabel: 'State',
            moveValue: 'Strategic Orientation',
            phaseLabel: 'Period',
            phaseValue: 'Pre-Move 1'
        });
        expect(isStrategicOrientationHeaderState({ move: 1, phase: 1 }, [
            buildStrategicOrientationAction('blue')
        ])).toBe(true);
    });

    it('returns normal move and phase labels after all Strategic Orientation artifacts reach White Cell', () => {
        const display = getHeaderGameStateDisplay({
            move: 1,
            phase: 1
        }, [
            buildStrategicOrientationAction('blue'),
            buildStrategicOrientationAction('green'),
            buildStrategicOrientationAction('red'),
            buildStrategicOrientationAction('industry')
        ]);

        expect(display).toMatchObject({
            isStrategicOrientation: false,
            moveLabel: 'Move',
            moveValue: '1',
            phaseLabel: 'Phase',
            phaseValue: 'Internal Deliberation'
        });
    });

    it('updates header labels, values, and region state together', () => {
        const move = createHeaderElement();
        const phase = createHeaderElement();
        const container = {
            classList: {
                toggle: vi.fn()
            },
            setAttribute: vi.fn()
        };

        move.value.closest.mockReturnValueOnce(container).mockReturnValue({
            querySelector: () => move.label
        });
        phase.value.closest.mockReturnValue({
            querySelector: () => phase.label
        });

        applyHeaderGameStateDisplay({
            isStrategicOrientation: true,
            moveLabel: 'State',
            moveValue: 'Strategic Orientation',
            phaseLabel: 'Period',
            phaseValue: 'Pre-Move 1',
            ariaLabel: 'Current exercise state: Strategic Orientation, Pre-Move 1.'
        }, {
            getElementById(id) {
                return {
                    headerMove: move.value,
                    headerPhase: phase.value
                }[id] || null;
            },
            querySelector: vi.fn(() => container)
        });

        expect(move.value.textContent).toBe('Strategic Orientation');
        expect(phase.value.textContent).toBe('Pre-Move 1');
        expect(move.label.textContent).toBe('State');
        expect(phase.label.textContent).toBe('Period');
        expect(container.classList.toggle).toHaveBeenCalledWith('is-strategic-orientation', true);
        expect(container.setAttribute).toHaveBeenCalledWith(
            'aria-label',
            'Current exercise state: Strategic Orientation, Pre-Move 1.'
        );
    });
});
