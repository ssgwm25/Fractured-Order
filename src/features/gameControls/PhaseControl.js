/**
 * Phase Control Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Phase display and advancement controls.
 */

import { gameStateStore } from '../../stores/index.js';
import { timelineStore, EVENT_TYPES } from '../../stores/index.js';
import { showToast } from '../../components/ui/Toast.js';
import { confirmModal } from '../../components/ui/Modal.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PhaseControl');

/**
 * Phase descriptions
 */
const PHASE_INFO = {
    1: { name: 'Planning', description: 'Teams develop their strategy and plan actions' },
    2: { name: 'Action Submission', description: 'Teams submit their planned actions' },
    3: { name: 'Adjudication', description: 'White Cell reviews and adjudicates actions' },
    4: { name: 'Results', description: 'Action outcomes are revealed to teams' },
    5: { name: 'Debrief', description: 'Analysis and discussion of outcomes' }
};

/**
 * Create a phase control component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {boolean} options.canControl - Can advance phase
 * @param {boolean} options.showDescription - Show phase description
 * @returns {Object} Component controller
 */
export function createPhaseControl(options = {}) {
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
    wrapper.className = 'phase-control';

    wrapper.innerHTML = `
        <div class="phase-display">
            <div class="phase-indicator">
                <div class="phase-dots" id="phaseDots">
                    ${[1, 2, 3, 4, 5].map(p => `
                        <div class="phase-dot" data-phase="${p}">
                            <span class="phase-dot-number">${p}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="phase-info">
                <span class="phase-label">Phase</span>
                <span class="phase-number" id="phaseNumber">1</span>
                <span class="phase-name" id="phaseName">Planning</span>
            </div>
        </div>

        ${showDescription ? `
            <p class="phase-description" id="phaseDescription">Teams develop their strategy and plan actions</p>
        ` : ''}

        ${canControl ? `
            <div class="phase-controls">
                <button class="btn btn-primary btn-sm" id="advancePhaseBtn">
                    Advance Phase →
                </button>
            </div>
        ` : ''}
    `;

    container.appendChild(wrapper);

    const phaseNumber = wrapper.querySelector('#phaseNumber');
    const phaseName = wrapper.querySelector('#phaseName');
    const phaseDescription = wrapper.querySelector('#phaseDescription');
    const phaseDots = wrapper.querySelectorAll('.phase-dot');
    const advanceBtn = wrapper.querySelector('#advancePhaseBtn');

    // Bind advance button
    if (advanceBtn) {
        advanceBtn.addEventListener('click', handleAdvancePhase);
    }

    /**
     * Handle advance phase
     */
    async function handleAdvancePhase() {
        const currentPhase = gameStateStore.getCurrentPhase();
        const currentMove = gameStateStore.getCurrentMove();

        if (currentPhase >= 5) {
            showToast({
                message: 'Already at final phase. Advance to next move to continue.',
                type: 'warning'
            });
            return;
        }

        const nextPhase = currentPhase + 1;
        const nextPhaseInfo = PHASE_INFO[nextPhase];

        const confirmed = await confirmModal({
            title: 'Advance Phase',
            message: `Advance from Phase ${currentPhase} (${PHASE_INFO[currentPhase].name}) to Phase ${nextPhase} (${nextPhaseInfo.name})?`,
            confirmText: 'Advance'
        });

        if (!confirmed) return;

        try {
            const success = await gameStateStore.advancePhase();

            if (success) {
                // Create timeline event
                await timelineStore.create({
                    type: EVENT_TYPES.PHASE_CHANGE,
                    content: `Phase advanced from ${currentPhase} to ${nextPhase}`,
                    team: 'system',
                    move: currentMove
                });

                showToast({
                    message: `Advanced to Phase ${nextPhase}: ${nextPhaseInfo.name}`,
                    type: 'success'
                });
            }
        } catch (err) {
            logger.error('Failed to advance phase:', err);
            showToast({ message: 'Failed to advance phase', type: 'error' });
        }
    }

    /**
     * Update the display
     * @param {number} phase - Current phase
     */
    function updateDisplay(phase) {
        const info = PHASE_INFO[phase] || PHASE_INFO[1];

        if (phaseNumber) phaseNumber.textContent = phase;
        if (phaseName) phaseName.textContent = info.name;
        if (phaseDescription) phaseDescription.textContent = info.description;

        // Update dots
        phaseDots.forEach(dot => {
            const dotPhase = parseInt(dot.dataset.phase);
            dot.classList.remove('phase-dot-active', 'phase-dot-completed');

            if (dotPhase === phase) {
                dot.classList.add('phase-dot-active');
            } else if (dotPhase < phase) {
                dot.classList.add('phase-dot-completed');
            }
        });

        // Update advance button state
        if (advanceBtn) {
            advanceBtn.disabled = phase >= 5;
            if (phase >= 5) {
                advanceBtn.textContent = 'Final Phase';
            } else {
                advanceBtn.textContent = `Advance to Phase ${phase + 1} →`;
            }
        }
    }

    /**
     * Initialize component
     */
    function init() {
        // Subscribe to game state changes
        unsubscribe = gameStateStore.subscribe((event, state) => {
            const phase = state?.phase;
            if (phase !== undefined) {
                updateDisplay(phase);
            }
        });

        // Initial update
        updateDisplay(gameStateStore.getCurrentPhase());
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
        advance: handleAdvancePhase
    };
}

/**
 * Create a simple phase display
 * @param {Object} options
 * @returns {HTMLElement}
 */
export function createPhaseDisplay(options = {}) {
    const display = document.createElement('div');
    display.className = 'phase-display-simple';
    display.innerHTML = `
        <span class="phase-display-label">Phase</span>
        <span class="phase-display-value" id="simplePhaseDisplay">1</span>
    `;

    const valueSpan = display.querySelector('#simplePhaseDisplay');

    const unsubscribe = gameStateStore.subscribe((event, state) => {
        const phase = state?.phase;
        if (phase !== undefined) {
            valueSpan.textContent = phase;
        }
    });

    valueSpan.textContent = gameStateStore.getCurrentPhase();

    display.destroy = () => {
        unsubscribe();
        display.remove();
    };

    return display;
}

export default createPhaseControl;
