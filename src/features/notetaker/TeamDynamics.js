/**
 * Team Dynamics Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Form for tracking team dynamics during the simulation.
 */

import { database } from '../../services/database.js';
import { sessionStore } from '../../stores/index.js';
import { gameStateStore } from '../../stores/index.js';
import { showToast } from '../../components/ui/Toast.js';
import { debounce } from '../../utils/debounce.js';
import { createLogger } from '../../utils/logger.js';
import {
    buildNotetakerParticipantContext,
    readParticipantScopedNotetakerSection
} from './storage.js';

const logger = createLogger('TeamDynamics');
const DEFAULT_DYNAMICS_DATA = {
    emergingLeaders: '',
    decisionStyle: '',
    frictionLevel: '5',
    frictionSources: '',
    consensusLevel: '5',
    dynamicsSummary: ''
};

/**
 * Create a team dynamics tracking component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {Function} options.onSave - Save callback
 * @returns {Object} Component controller
 */
export function createTeamDynamics(options = {}) {
    const { container, onSave, teamId = document.body?.dataset?.team || sessionStore.getSessionData()?.team || null } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let currentData = { ...DEFAULT_DYNAMICS_DATA };
    let autoSaveDebounce = null;

    // Create component structure
    const wrapper = document.createElement('div');
    wrapper.className = 'team-dynamics';

    wrapper.innerHTML = `
        <div class="team-dynamics-header">
            <h3 class="team-dynamics-title">Team Dynamics</h3>
            <span class="team-dynamics-autosave" id="autoSaveStatus">Saved to your notes</span>
        </div>

        <form class="team-dynamics-form" id="dynamicsForm">
            <div class="form-group">
                <label class="form-label" for="emergingLeaders">Emerging Leaders</label>
                <textarea
                    id="emergingLeaders"
                    class="form-input form-textarea"
                    rows="2"
                    placeholder="Who is taking leadership roles? How is leadership being shared?"
                ></textarea>
            </div>

            <div class="form-group">
                <label class="form-label" for="decisionStyle">Decision-Making Style</label>
                <select id="decisionStyle" class="form-select">
                    <option value="">Select style</option>
                    <option value="consensus">Consensus-driven</option>
                    <option value="leader_driven">Leader-driven</option>
                    <option value="voting">Voting/Democratic</option>
                    <option value="expert_deference">Expert deference</option>
                    <option value="mixed">Mixed approaches</option>
                    <option value="unclear">Unclear/Chaotic</option>
                </select>
            </div>

            <div class="form-group">
                <label class="form-label" for="frictionLevel">
                    Friction Level
                    <span class="form-label-value" id="frictionValue">5</span>
                </label>
                <input
                    type="range"
                    id="frictionLevel"
                    class="form-range"
                    min="1"
                    max="10"
                    value="5"
                >
                <div class="form-range-labels">
                    <span>Low</span>
                    <span>High</span>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label" for="frictionSources">Friction Sources</label>
                <textarea
                    id="frictionSources"
                    class="form-input form-textarea"
                    rows="2"
                    placeholder="What is causing disagreement or tension?"
                ></textarea>
            </div>

            <div class="form-group">
                <label class="form-label" for="consensusLevel">
                    Consensus Level
                    <span class="form-label-value" id="consensusValue">5</span>
                </label>
                <input
                    type="range"
                    id="consensusLevel"
                    class="form-range"
                    min="1"
                    max="10"
                    value="5"
                >
                <div class="form-range-labels">
                    <span>Low</span>
                    <span>High</span>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label" for="dynamicsSummary">Overall Dynamics Summary</label>
                <textarea
                    id="dynamicsSummary"
                    class="form-input form-textarea"
                    rows="3"
                    placeholder="Summarize the team's overall dynamics..."
                ></textarea>
            </div>
        </form>
    `;

    container.appendChild(wrapper);

    const form = wrapper.querySelector('#dynamicsForm');
    const autoSaveStatus = wrapper.querySelector('#autoSaveStatus');
    const frictionLevel = wrapper.querySelector('#frictionLevel');
    const frictionValue = wrapper.querySelector('#frictionValue');
    const consensusLevel = wrapper.querySelector('#consensusLevel');
    const consensusValue = wrapper.querySelector('#consensusValue');

    // Setup auto-save
    autoSaveDebounce = debounce(saveData, 2000);

    // Bind input handlers
    form.addEventListener('input', handleInput);

    // Range slider displays
    frictionLevel.addEventListener('input', () => {
        frictionValue.textContent = frictionLevel.value;
    });

    consensusLevel.addEventListener('input', () => {
        consensusValue.textContent = consensusLevel.value;
    });

    function getParticipantContext() {
        return buildNotetakerParticipantContext({
            participant_key: sessionStore.getSessionParticipantId?.(),
            participant_id: sessionStore.getSessionParticipantId?.(),
            client_id: sessionStore.getClientId(),
            participant_label: sessionStore.getSessionData()?.displayName || null
        }, {
            fallbackClientId: sessionStore.getClientId(),
            fallbackParticipantLabel: sessionStore.getSessionData()?.displayName || null
        });
    }

    /**
     * Handle input changes
     */
    function handleInput() {
        currentData = getFormData();
        autoSaveStatus.textContent = 'Saving...';
        autoSaveDebounce();
    }

    /**
     * Get form data
     * @returns {Object}
     */
    function getFormData() {
        return {
            emergingLeaders: form.querySelector('#emergingLeaders').value,
            decisionStyle: form.querySelector('#decisionStyle').value,
            frictionLevel: form.querySelector('#frictionLevel').value,
            frictionSources: form.querySelector('#frictionSources').value,
            consensusLevel: form.querySelector('#consensusLevel').value,
            dynamicsSummary: form.querySelector('#dynamicsSummary').value
        };
    }

    /**
     * Set form data
     * @param {Object} data
     */
    function setFormData(data) {
        if (data.emergingLeaders !== undefined) {
            form.querySelector('#emergingLeaders').value = data.emergingLeaders;
        }
        if (data.decisionStyle !== undefined) {
            form.querySelector('#decisionStyle').value = data.decisionStyle;
        }
        if (data.frictionLevel !== undefined) {
            form.querySelector('#frictionLevel').value = data.frictionLevel;
            frictionValue.textContent = data.frictionLevel;
        }
        if (data.frictionSources !== undefined) {
            form.querySelector('#frictionSources').value = data.frictionSources;
        }
        if (data.consensusLevel !== undefined) {
            form.querySelector('#consensusLevel').value = data.consensusLevel;
            consensusValue.textContent = data.consensusLevel;
        }
        if (data.dynamicsSummary !== undefined) {
            form.querySelector('#dynamicsSummary').value = data.dynamicsSummary;
        }

        currentData = data;
    }

    /**
     * Save data to database
     */
    async function saveData() {
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        try {
            const participantContext = getParticipantContext();
            await database.saveNotetakerData({
                session_id: sessionId,
                move: gameStateStore.getCurrentMove(),
                phase: gameStateStore.getCurrentPhase?.() ?? 1,
                team: teamId,
                client_id: participantContext.clientId,
                participant_key: participantContext.participantKey,
                participant_id: participantContext.participantId,
                participant_label: participantContext.participantLabel,
                dynamics_analysis: currentData
            });

            autoSaveStatus.textContent = 'Saved to your notes';
            logger.debug('Team dynamics saved');

            if (onSave) onSave(currentData);
        } catch (err) {
            logger.error('Failed to save team dynamics:', err);
            autoSaveStatus.textContent = 'Save failed';
            showToast({ message: 'Failed to save dynamics data', type: 'error' });
        }
    }

    /**
     * Load existing data
     */
    async function loadData() {
        const sessionId = sessionStore.getSessionId();
        if (!sessionId) return;

        try {
            const participantContext = getParticipantContext();
            const record = await database.getNotetakerData(sessionId, gameStateStore.getCurrentMove());
            setFormData(readParticipantScopedNotetakerSection(record?.dynamics_analysis, DEFAULT_DYNAMICS_DATA, {
                teamId,
                participantKey: participantContext.participantKey,
                fallbackTeamId: record?.team
            }));
        } catch (err) {
            logger.error('Failed to load team dynamics:', err);
        }
    }

    /**
     * Initialize component
     */
    async function init() {
        await loadData();
    }

    /**
     * Destroy component
     */
    function destroy() {
        // Save any pending changes
        if (currentData && Object.keys(currentData).length > 0) {
            saveData();
        }
        wrapper.remove();
    }

    // Initialize
    init();

    return {
        getData: () => currentData,
        setData: setFormData,
        save: saveData,
        load: loadData,
        destroy
    };
}

export default createTeamDynamics;
