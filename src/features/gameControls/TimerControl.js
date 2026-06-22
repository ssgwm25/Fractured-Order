/**
 * Timer Control Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Timer display and controls for game management.
 */

import { timerService, TIMER_EVENTS } from '../../services/index.js';
import { showToast } from '../../components/ui/Toast.js';
import { confirmModal } from '../../components/ui/Modal.js';
import { CONFIG } from '../../core/config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('TimerControl');

/**
 * Create a timer control component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {boolean} options.canControl - Can control timer (start/stop/reset)
 * @param {boolean} options.showSetTime - Show set time control
 * @param {string} options.size - Display size (sm, md, lg)
 * @returns {Object} Component controller
 */
export function createTimerControl(options = {}) {
    const {
        container,
        canControl = false,
        showSetTime = false,
        size = 'md'
    } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let unsubscribe = null;

    // Create component structure
    const wrapper = document.createElement('div');
    wrapper.className = `timer-control timer-control-${size}`;

    wrapper.innerHTML = `
        <div class="timer-display-wrapper">
            <div class="timer-display" id="timerDisplay">00:00</div>
            <div class="timer-status" id="timerStatus">Paused</div>
        </div>

        ${canControl ? `
            <div class="timer-controls">
                <button class="btn btn-success btn-sm" id="startBtn" title="Start Timer">
                    <span class="timer-btn-icon">▶</span>
                    <span class="timer-btn-label">Start</span>
                </button>
                <button class="btn btn-warning btn-sm" id="pauseBtn" title="Pause Timer" style="display: none;">
                    <span class="timer-btn-icon">⏸</span>
                    <span class="timer-btn-label">Pause</span>
                </button>
                <button class="btn btn-secondary btn-sm" id="resetBtn" title="Reset Timer">
                    <span class="timer-btn-icon">↺</span>
                    <span class="timer-btn-label">Reset</span>
                </button>
            </div>
        ` : ''}

        ${showSetTime ? `
            <div class="timer-set-time">
                <label class="form-label form-label-sm">Set Time (minutes)</label>
                <div class="timer-set-input-group">
                    <input
                        type="number"
                        class="form-input form-input-sm"
                        id="timerMinutes"
                        value="90"
                        min="1"
                        max="999"
                    >
                    <button class="btn btn-secondary btn-sm" id="setTimeBtn">Set</button>
                </div>
            </div>
        ` : ''}
    `;

    container.appendChild(wrapper);

    const timerDisplay = wrapper.querySelector('#timerDisplay');
    const timerStatus = wrapper.querySelector('#timerStatus');
    const startBtn = wrapper.querySelector('#startBtn');
    const pauseBtn = wrapper.querySelector('#pauseBtn');
    const resetBtn = wrapper.querySelector('#resetBtn');
    const timerMinutesInput = wrapper.querySelector('#timerMinutes');
    const setTimeBtn = wrapper.querySelector('#setTimeBtn');

    // Bind controls
    if (canControl) {
        startBtn?.addEventListener('click', handleStart);
        pauseBtn?.addEventListener('click', handlePause);
        resetBtn?.addEventListener('click', handleReset);
    }

    if (showSetTime) {
        setTimeBtn?.addEventListener('click', handleSetTime);
    }

    /**
     * Handle start
     */
    async function handleStart() {
        try {
            await timerService.start();
            updateControlButtons(true);
        } catch (err) {
            logger.error('Failed to start timer:', err);
            showToast({ message: 'Failed to start timer', type: 'error' });
        }
    }

    /**
     * Handle pause
     */
    async function handlePause() {
        try {
            await timerService.pause();
            updateControlButtons(false);
        } catch (err) {
            logger.error('Failed to pause timer:', err);
            showToast({ message: 'Failed to pause timer', type: 'error' });
        }
    }

    /**
     * Handle reset
     */
    async function handleReset() {
        const confirmed = await confirmModal({
            title: 'Reset Timer',
            message: 'Are you sure you want to reset the timer?',
            confirmText: 'Reset'
        });

        if (!confirmed) return;

        try {
            await timerService.reset();
            updateControlButtons(false);
            showToast({ message: 'Timer reset', type: 'success' });
        } catch (err) {
            logger.error('Failed to reset timer:', err);
            showToast({ message: 'Failed to reset timer', type: 'error' });
        }
    }

    /**
     * Handle set time
     */
    async function handleSetTime() {
        const minutes = parseInt(timerMinutesInput?.value);

        if (!minutes || minutes < 1) {
            showToast({ message: 'Please enter a valid time', type: 'error' });
            return;
        }

        try {
            await timerService.reset(minutes * 60);
            showToast({ message: `Timer set to ${minutes} minutes`, type: 'success' });
        } catch (err) {
            logger.error('Failed to set timer:', err);
            showToast({ message: 'Failed to set timer', type: 'error' });
        }
    }

    /**
     * Update the timer display
     * @param {Object} data - Timer data
     */
    function updateDisplay(data) {
        if (timerDisplay) {
            timerDisplay.textContent = data.formatted;

            // Add warning class when low
            timerDisplay.classList.remove('timer-warning', 'timer-critical');
            if (data.seconds <= 60 && data.seconds > 0) {
                timerDisplay.classList.add('timer-critical');
            } else if (data.seconds <= 300 && data.seconds > 0) {
                timerDisplay.classList.add('timer-warning');
            }
        }

        if (timerStatus) {
            timerStatus.textContent = data.isRunning ? 'Running' : 'Paused';
            timerStatus.classList.toggle('timer-status-running', data.isRunning);
        }

        updateControlButtons(data.isRunning);
    }

    /**
     * Update control button visibility
     * @param {boolean} isRunning
     */
    function updateControlButtons(isRunning) {
        if (startBtn) startBtn.style.display = isRunning ? 'none' : '';
        if (pauseBtn) pauseBtn.style.display = isRunning ? '' : 'none';
    }

    /**
     * Handle timer events
     * @param {string} event
     * @param {Object} data
     */
    function handleTimerEvent(event, data) {
        switch (event) {
            case TIMER_EVENTS.TICK:
            case TIMER_EVENTS.START:
            case TIMER_EVENTS.PAUSE:
            case TIMER_EVENTS.RESET:
                updateDisplay(data);
                break;

            case TIMER_EVENTS.WARNING:
                showTimerWarning(data);
                break;

            case TIMER_EVENTS.FINISHED:
                showTimerFinished();
                break;
        }
    }

    /**
     * Show timer warning
     * @param {Object} data
     */
    function showTimerWarning(data) {
        const messages = {
            300: '5 minutes remaining',
            60: '1 minute remaining',
            30: '30 seconds remaining',
            10: '10 seconds remaining'
        };

        const message = messages[data.threshold];
        if (message) {
            showToast({ message, type: 'warning' });
        }
    }

    /**
     * Show timer finished
     */
    function showTimerFinished() {
        showToast({ message: 'Timer finished!', type: 'warning' });

        // Optional: Play sound or flash display
        timerDisplay?.classList.add('timer-finished');
        setTimeout(() => {
            timerDisplay?.classList.remove('timer-finished');
        }, 3000);
    }

    /**
     * Initialize component
     */
    function init() {
        // Subscribe to timer events
        unsubscribe = timerService.subscribe(handleTimerEvent);

        // Initialize timer service if not already
        timerService.initialize();
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
        start: handleStart,
        pause: handlePause,
        reset: handleReset
    };
}

/**
 * Create a simple timer display (no controls)
 * @param {Object} options
 * @returns {HTMLElement}
 */
export function createTimerDisplay(options = {}) {
    const { size = 'md' } = options;

    const display = document.createElement('div');
    display.className = `timer-display-simple timer-display-${size}`;
    display.innerHTML = '<span id="simpleTimerDisplay">00:00</span>';

    const timerSpan = display.querySelector('#simpleTimerDisplay');

    const unsubscribe = timerService.subscribe((event, data) => {
        if (event === TIMER_EVENTS.TICK || event === TIMER_EVENTS.RESET) {
            timerSpan.textContent = data.formatted;
        }
    });

    // Initialize
    timerService.initialize();

    display.destroy = () => {
        unsubscribe();
        display.remove();
    };

    return display;
}

export default createTimerControl;