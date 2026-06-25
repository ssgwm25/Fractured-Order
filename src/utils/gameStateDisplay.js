import { getPhaseLabel } from '../core/enums.js';
import { getStrategicOrientationCompletion } from '../features/actions/strategicOrientationDetails.js';

export function isStrategicOrientationHeaderState(gameState = null, actions = []) {
    if (!gameState) {
        return false;
    }

    const move = gameState.move ?? 1;
    const phase = gameState.phase ?? 1;

    return move === 1
        && phase === 1
        && !getStrategicOrientationCompletion(actions).complete;
}

export function getHeaderGameStateDisplay(gameState = null, actions = [], {
    fallbackToMoveOne = true
} = {}) {
    if (!gameState && !fallbackToMoveOne) {
        return {
            isStrategicOrientation: false,
            moveLabel: 'Move',
            moveValue: '-',
            phaseLabel: 'Phase',
            phaseValue: '-',
            ariaLabel: 'No live exercise state selected.'
        };
    }

    const resolvedState = gameState || { move: 1, phase: 1 };
    const move = resolvedState.move ?? 1;
    const phase = resolvedState.phase ?? 1;

    if (isStrategicOrientationHeaderState(resolvedState, actions)) {
        return {
            isStrategicOrientation: true,
            moveLabel: 'State',
            moveValue: 'Strategic Orientation',
            phaseLabel: 'Period',
            phaseValue: 'Pre-Move 1',
            ariaLabel: 'Current exercise state: Strategic Orientation, Pre-Move 1.'
        };
    }

    const phaseValue = getPhaseLabel(phase);

    return {
        isStrategicOrientation: false,
        moveLabel: 'Move',
        moveValue: String(move),
        phaseLabel: 'Phase',
        phaseValue,
        ariaLabel: `Current exercise state: Move ${move}, ${phaseValue}.`
    };
}

function setGameStateItemLabel(valueElement, label) {
    const item = valueElement?.closest?.('.game-state-item');
    const labelElement = item?.querySelector?.('.game-state-label');

    if (labelElement) {
        labelElement.textContent = label;
    }
}

export function applyHeaderGameStateDisplay(display, documentRef = globalThis.document) {
    const headerMove = documentRef?.getElementById?.('headerMove')
        || documentRef?.getElementById?.('header-move');
    const headerPhase = documentRef?.getElementById?.('headerPhase')
        || documentRef?.getElementById?.('header-phase');
    const container = headerMove?.closest?.('.header-game-state')
        || headerPhase?.closest?.('.header-game-state')
        || documentRef?.querySelector?.('.header-game-state');

    if (headerMove) {
        headerMove.textContent = display.moveValue;
        setGameStateItemLabel(headerMove, display.moveLabel);
    }

    if (headerPhase) {
        headerPhase.textContent = display.phaseValue;
        setGameStateItemLabel(headerPhase, display.phaseLabel);
    }

    if (container) {
        container.classList?.toggle?.('is-strategic-orientation', Boolean(display.isStrategicOrientation));
        container.setAttribute?.('aria-label', display.ariaLabel);
    }
}
