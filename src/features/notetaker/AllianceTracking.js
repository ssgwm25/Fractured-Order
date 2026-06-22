/**
 * Alliance Tracking Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Form for tracking alliances and external pressures.
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

const logger = createLogger('AllianceTracking');
const DEFAULT_ALLIANCE_DATA = {
    allianceFormation: '',
    allianceStrength: '5',
    allianceTensions: '',
    externalPressures: '',
    thirdPartyActions: '',
    geopoliticalContext: ''
};

/**
 * Create an alliance tracking component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {Function} options.onSave - Save callback
 * @returns {Object} Component controller
 */
export function createAllianceTracking(options = {}) {
    const { container, onSave, teamId = document.body?.dataset?.team || sessionStore.getSessionData()?.team || null } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let currentData = { ...DEFAULT_ALLIANCE_DATA };
    let autoSaveDebounce = null;

    // Create component structure
    const wrapper = document.createElement('div');
    wrapper.className = 'alliance-tracking';

    wrapper.innerHTML = `
        <div class="alliance-tracking-header">
            <h3 class="alliance-tracking-title">Alliance & External Factors</h3>
            <span class="alliance-tracking-autosave" id="autoSaveStatus">Saved to your notes</span>
        </div>

        <form class="alliance-tracking-form" id="allianceForm">
            <div class="form-group">
                <label class="form-label" for="allianceFormation">Alliance Formation</label>
                <textarea
                    id="allianceFormation"
                    class="form-input form-textarea"
                    rows="2"
                    placeholder="What alliances are forming? Between whom?"
                ></textarea>
            </div>

            <div class="form-group">
                <label class="form-label" for="allianceStrength">
                    Alliance Cohesion
                    <span class="form-label-value" id="allianceStrengthValue">5</span>
                </label>
                <input
                    type="range"
                    id="allianceStrength"
                    class="form-range"
                    min="1"
                    max="10"
                    value="5"
                >
                <div class="form-range-labels">
                    <span>Weak</span>
                    <span>Strong</span>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label" for="allianceTensions">Alliance Tensions</label>
                <textarea
                    id="allianceTensions"
                    class="form-input form-textarea"
                    rows="2"
                    placeholder="Any tensions or fractures within alliances?"
                ></textarea>
            </div>

            <div class="form-group">
                <label class="form-label" for="externalPressures">External Pressures</label>
                <textarea
                    id="externalPressures"
                    class="form-input form-textarea"
                    rows="2"
                    placeholder="What external factors are affecting decisions?"
                ></textarea>
            </div>

            <div class="form-group">
                <label class="form-label" for="thirdPartyActions">Third Party Actions</label>
                <textarea
                    id="thirdPartyActions"
                    class="form-input form-textarea"
                    rows="2"
                    placeholder="Any notable actions by non-player entities?"
                ></textarea>
            </div>

            <div class="form-group">
                <label class="form-label" for="geopoliticalContext">Geopolitical Context Notes</label>
                <textarea
                    id="geopoliticalContext"
                    class="form-input form-textarea"
                    rows="3"
                    placeholder="Broader geopolitical factors at play..."
                ></textarea>
            </div>
        </form>
    `;

    container.appendChild(wrapper);

    const form = wrapper.querySelector('#allianceForm');
    const autoSaveStatus = wrapper.querySelector('#autoSaveStatus');
    const allianceStrength = wrapper.querySelector('#allianceStrength');
    const allianceStrengthValue = wrapper.querySelector('#allianceStrengthValue');

    // Setup auto-save
    autoSaveDebounce = debounce(saveData, 2000);

    // Bind input handlers
    form.addEventListener('input', handleInput);

    // Range slider display
    allianceStrength.addEventListener('input', () => {
        allianceStrengthValue.textContent = allianceStrength.value;
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
            allianceFormation: form.querySelector('#allianceFormation').value,
            allianceStrength: form.querySelector('#allianceStrength').value,
            allianceTensions: form.querySelector('#allianceTensions').value,
            externalPressures: form.querySelector('#externalPressures').value,
            thirdPartyActions: form.querySelector('#thirdPartyActions').value,
            geopoliticalContext: form.querySelector('#geopoliticalContext').value
        };
    }

    /**
     * Set form data
     * @param {Object} data
     */
    function setFormData(data) {
        if (data.allianceFormation !== undefined) {
            form.querySelector('#allianceFormation').value = data.allianceFormation;
        }
        if (data.allianceStrength !== undefined) {
            form.querySelector('#allianceStrength').value = data.allianceStrength;
            allianceStrengthValue.textContent = data.allianceStrength;
        }
        if (data.allianceTensions !== undefined) {
            form.querySelector('#allianceTensions').value = data.allianceTensions;
        }
        if (data.externalPressures !== undefined) {
            form.querySelector('#externalPressures').value = data.externalPressures;
        }
        if (data.thirdPartyActions !== undefined) {
            form.querySelector('#thirdPartyActions').value = data.thirdPartyActions;
        }
        if (data.geopoliticalContext !== undefined) {
            form.querySelector('#geopoliticalContext').value = data.geopoliticalContext;
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
                external_factors: currentData
            });

            autoSaveStatus.textContent = 'Saved to your notes';
            logger.debug('Alliance tracking saved');

            if (onSave) onSave(currentData);
        } catch (err) {
            logger.error('Failed to save alliance tracking:', err);
            autoSaveStatus.textContent = 'Save failed';
            showToast({ message: 'Failed to save alliance data', type: 'error' });
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
            setFormData(readParticipantScopedNotetakerSection(record?.external_factors, DEFAULT_ALLIANCE_DATA, {
                teamId,
                participantKey: participantContext.participantKey,
                fallbackTeamId: record?.team
            }));
        } catch (err) {
            logger.error('Failed to load alliance tracking:', err);
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

export default createAllianceTracking;
