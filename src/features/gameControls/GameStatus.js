/**
 * Game Status Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Combined display of current game state (move, phase, timer).
 */

import { gameStateStore } from '../../stores/index.js';
import { timerService, TIMER_EVENTS } from '../../services/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('GameStatus');

/**
 * Create a game status component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {string} options.layout - Layout style (horizontal, vertical, compact)
 * @param {boolean} options.showTimer - Show timer display
 * @returns {Object} Component controller
 */
export function createGameStatus(options = {}) {
    const {
        container,
        layout = 'horizontal',
        showTimer = true
    } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let storeUnsubscribe = null;
    let timerUnsubscribe = null;

    // Create component structure
    const wrapper = document.createElement('div');
    wrapper.className = `game-status game-status-${layout}`;

    wrapper.innerHTML = `
        <div class="game-status-item">
            <span class="game-status-label">Move</span>
            <span class="game-status-value" id="statusMove">1</span>
        </div>
        <div class="game-status-item">
            <span class="game-status-label">Phase</span>
            <span class="game-status-value" id="statusPhase">1</span>
        </div>
        ${showTimer ? `
            <div class="game-status-item game-status-timer">
                <span class="game-status-label">Timer</span>
                <span class="game-status-value" id="statusTimer">00:00</span>
                <span class="game-status-timer-status" id="statusTimerState">Paused</span>
            </div>
        ` : ''}
    `;

    container.appendChild(wrapper);

    const moveDisplay = wrapper.querySelector('#statusMove');
    const phaseDisplay = wrapper.querySelector('#statusPhase');
    const timerDisplay = wrapper.querySelector('#statusTimer');
    const timerStateDisplay = wrapper.querySelector('#statusTimerState');

    /**
     * Update game state display
     * @param {Object} state
     */
    function updateGameState(state) {
        const move = state?.move;
        const phase = state?.phase;

        if (moveDisplay && move !== undefined) {
            moveDisplay.textContent = move;
        }
        if (phaseDisplay && phase !== undefined) {
            phaseDisplay.textContent = phase;
        }
    }

    /**
     * Update timer display
     * @param {Object} data
     */
    function updateTimer(data) {
        if (timerDisplay) {
            timerDisplay.textContent = data.formatted;

            // Warning colors
            timerDisplay.classList.remove('timer-warning', 'timer-critical');
            if (data.seconds <= 60 && data.seconds > 0) {
                timerDisplay.classList.add('timer-critical');
            } else if (data.seconds <= 300 && data.seconds > 0) {
                timerDisplay.classList.add('timer-warning');
            }
        }
        if (timerStateDisplay) {
            timerStateDisplay.textContent = data.isRunning ? 'Running' : 'Paused';
            timerStateDisplay.classList.toggle('timer-running', data.isRunning);
        }
    }

    /**
     * Initialize component
     */
    function init() {
        // Subscribe to game state
        storeUnsubscribe = gameStateStore.subscribe((event, state) => {
            updateGameState(state);
        });

        // Subscribe to timer if showing
        if (showTimer) {
            timerUnsubscribe = timerService.subscribe((event, data) => {
                if (event === TIMER_EVENTS.TICK || event === TIMER_EVENTS.START ||
                    event === TIMER_EVENTS.PAUSE || event === TIMER_EVENTS.RESET) {
                    updateTimer(data);
                }
            });
            timerService.initialize();
        }

        // Initial update
        const state = gameStateStore.getState();
        if (state) {
            updateGameState(state);
        }
    }

    /**
     * Destroy component
     */
    function destroy() {
        if (storeUnsubscribe) storeUnsubscribe();
        if (timerUnsubscribe) timerUnsubscribe();
        wrapper.remove();
    }

    // Initialize
    init();

    return { destroy };
}

/**
 * Create a minimal game status badge
 * @param {Object} options
 * @returns {HTMLElement}
 */
export function createGameStatusBadge(options = {}) {
    const badge = document.createElement('div');
    badge.className = 'game-status-badge';
    badge.innerHTML = `
        <span class="game-status-badge-item">M<span id="badgeMove">1</span></span>
        <span class="game-status-badge-separator">|</span>
        <span class="game-status-badge-item">P<span id="badgePhase">1</span></span>
    `;

    const moveSpan = badge.querySelector('#badgeMove');
    const phaseSpan = badge.querySelector('#badgePhase');

    const unsubscribe = gameStateStore.subscribe((event, state) => {
        const move = state?.move;
        const phase = state?.phase;

        if (move !== undefined) {
            moveSpan.textContent = move;
        }
        if (phase !== undefined) {
            phaseSpan.textContent = phase;
        }
    });

    // Initial values
    moveSpan.textContent = gameStateStore.getCurrentMove();
    phaseSpan.textContent = gameStateStore.getCurrentPhase();

    badge.destroy = () => {
        unsubscribe();
        badge.remove();
    };

    return badge;
}

export default createGameStatus;
