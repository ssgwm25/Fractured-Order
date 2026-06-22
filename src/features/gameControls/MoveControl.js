/**
 * Move Control Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Move display and advancement controls.
 */

import { gameStateStore } from '../../stores/index.js';
import { timelineStore, EVENT_TYPES } from '../../stores/index.js';
import { showToast } from '../../components/ui/Toast.js';
import { confirmModal } from '../../components/ui/Modal.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MoveControl');

/**
 * Move descriptions
 */
const MOVE_INFO = {
    1: { name: 'Move 1', description: 'Initial strategic moves and positioning' },
    2: { name: 'Move 2', description: 'Response to initial outcomes, escalation or de-escalation' },
    3: { name: 'Move 3', description: 'Final moves and resolution' }
};

/**
 * Create a move control component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {boolean} options.canControl - Can advance move
 * @param {boolean} options.showDescription - Show move description
 * @returns {Object} Component controller
 */
export function createMoveControl(options = {}) {
    const {
        container,
        canControl = false,
        showDescription = true
    } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let unsubscribe = null;

    // Create component structure
    const wrapper = document.createElement('div');
    wrapper.className = 'move-control';

    wrapper.innerHTML = `
        <div class="move-display">
            <div class="move-indicator">
                <div class="move-segments" id="moveSegments">
                    ${[1, 2, 3].map(m => `
                        <div class="move-segment" data-move="${m}">
                            <span class="move-segment-number">${m}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="move-info">
                <span class="move-label">Move</span>
                <span class="move-number" id="moveNumber">1</span>
            </div>
        </div>

        ${showDescription ? `
            <p class="move-description" id="moveDescription">Initial strategic moves and positioning</p>
        ` : ''}

        ${canControl ? `
            <div class="move-controls">
                <button class="btn btn-primary btn-sm" id="advanceMoveBtn">
                    Advance Move →
                </button>
            </div>
        ` : ''}
    `;

    container.appendChild(wrapper);

    const moveNumber = wrapper.querySelector('#moveNumber');
    const moveDescription = wrapper.querySelector('#moveDescription');
    const moveSegments = wrapper.querySelectorAll('.move-segment');
    const advanceBtn = wrapper.querySelector('#advanceMoveBtn');

    // Bind advance button
    if (advanceBtn) {
        advanceBtn.addEventListener('click', handleAdvanceMove);
    }

    /**
     * Handle advance move
     */
    async function handleAdvanceMove() {
        const currentMove = gameStateStore.getCurrentMove();
        const currentPhase = gameStateStore.getCurrentPhase();

        if (currentMove >= 3) {
            showToast({
                message: 'Already at final move (Move 3)',
                type: 'warning'
            });
            return;
        }

        const nextMove = currentMove + 1;
        const nextMoveInfo = MOVE_INFO[nextMove];

        const confirmed = await confirmModal({
            title: 'Advance Move',
            message: `Advance from Move ${currentMove} to Move ${nextMove}? This will reset the phase to 1.`,
            confirmText: 'Advance Move'
        });

        if (!confirmed) return;

        try {
            const success = await gameStateStore.advanceMove();

            if (success) {
                // Create timeline event
                await timelineStore.create({
                    type: EVENT_TYPES.MOVE_CHANGE,
                    content: `Move advanced from ${currentMove} to ${nextMove}`,
                    team: 'system',
                    move: nextMove
                });

                showToast({
                    message: `Advanced to Move ${nextMove}`,
                    type: 'success'
                });
            }
        } catch (err) {
            logger.error('Failed to advance move:', err);
            showToast({ message: 'Failed to advance move', type: 'error' });
        }
    }

    /**
     * Update the display
     * @param {number} move - Current move
     */
    function updateDisplay(move) {
        const info = MOVE_INFO[move] || MOVE_INFO[1];

        if (moveNumber) moveNumber.textContent = move;
        if (moveDescription) moveDescription.textContent = info.description;

        // Update segments
        moveSegments.forEach(segment => {
            const segmentMove = parseInt(segment.dataset.move);
            segment.classList.remove('move-segment-active', 'move-segment-completed');

            if (segmentMove === move) {
                segment.classList.add('move-segment-active');
            } else if (segmentMove < move) {
                segment.classList.add('move-segment-completed');
            }
        });

        // Update advance button state
        if (advanceBtn) {
            advanceBtn.disabled = move >= 3;
            if (move >= 3) {
                advanceBtn.textContent = 'Final Move';
            } else {
                advanceBtn.textContent = `Advance to Move ${move + 1} →`;
            }
        }
    }

    /**
     * Initialize component
     */
    function init() {
        // Subscribe to game state changes
        unsubscribe = gameStateStore.subscribe((event, state) => {
            const move = state?.move;
            if (move !== undefined) {
                updateDisplay(move);
            }
        });

        // Initial update
        updateDisplay(gameStateStore.getCurrentMove());
    }

    /**
     * Destroy component
     */
    function destroy() {
        if (unsubscribe) {
            unsubscribe();
        }
        wrapper.remove();
    }

    // Initialize
    init();

    return {
        destroy,
        advance: handleAdvanceMove
    };
}

/**
 * Create a simple move display
 * @param {Object} options
 * @returns {HTMLElement}
 */
export function createMoveDisplay(options = {}) {
    const display = document.createElement('div');
    display.className = 'move-display-simple';
    display.innerHTML = `
        <span class="move-display-label">Move</span>
        <span class="move-display-value" id="simpleMoveDisplay">1</span>
    `;

    const valueSpan = display.querySelector('#simpleMoveDisplay');

    const unsubscribe = gameStateStore.subscribe((event, state) => {
        const move = state?.move;
        if (move !== undefined) {
            valueSpan.textContent = move;
        }
    });

    valueSpan.textContent = gameStateStore.getCurrentMove();

    display.destroy = () => {
        unsubscribe();
        display.remove();
    };

    return display;
}

export default createMoveControl;
