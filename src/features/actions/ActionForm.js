/**
 * Action Form Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Reusable form for creating and editing actions.
 */

import { actionsStore } from '../../stores/index.js';
import { gameStateStore } from '../../stores/index.js';
import { showToast } from '../../components/ui/Toast.js';
import { ENUMS } from '../../core/enums.js';
import { createLogger } from '../../utils/logger.js';
import { getCheckedValues, renderCheckboxOptions } from '../../utils/checkboxGroup.js';
import { validateAction } from '../../utils/validation.js';
import { getUserMessage } from '../../core/errors.js';

const logger = createLogger('ActionForm');

/**
 * Create an action form
 * @param {Object} options - Form options
 * @param {Object} options.action - Existing action for editing (optional)
 * @param {string} options.team - Team identifier
 * @param {Function} options.onSubmit - Submit callback
 * @param {Function} options.onCancel - Cancel callback
 * @returns {HTMLElement}
 */
export function createActionForm(options = {}) {
    const { action = {}, team = 'blue', onSubmit, onCancel } = options;
    const isEdit = !!action.id;
    let isSubmitting = false;

    const form = document.createElement('form');
    form.className = 'action-form';
    form.innerHTML = `
        <div class="form-group">
            <label class="form-label" for="actionGoal">Goal *</label>
            <textarea
                id="actionGoal"
                class="form-input form-textarea"
                rows="3"
                placeholder="Define the primary goal of the action..."
                required
            >${escapeHtml(action.goal || action.title || '')}</textarea>
        </div>

        <div class="section-grid section-grid-2">
            <div class="form-group">
                <label class="form-label" for="actionMechanism">Mechanism *</label>
                <select id="actionMechanism" class="form-select" required>
                    <option value="">Select mechanism</option>
                    ${createOptions(ENUMS.MECHANISMS, action.mechanism)}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="actionSector">Sector *</label>
                <select id="actionSector" class="form-select" required>
                    <option value="">Select sector</option>
                    ${createOptions(ENUMS.SECTORS, action.sector)}
                </select>
            </div>
        </div>

        <div class="section-grid section-grid-2">
            <div class="form-group">
                <label class="form-label" for="actionExposureType">Exposure Type</label>
                <select id="actionExposureType" class="form-select">
                    <option value="">Select exposure type</option>
                    ${createOptions(ENUMS.EXPOSURE_TYPES, action.exposure_type)}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="actionPriority">Priority</label>
                <select id="actionPriority" class="form-select">
                    ${createOptions(ENUMS.PRIORITY, action.priority || 'NORMAL')}
                </select>
            </div>
        </div>

        <div class="form-group">
            <span class="form-label" id="actionTargetsLabel">Targets *</span>
            <div
                class="form-check-grid"
                role="group"
                aria-labelledby="actionTargetsLabel"
                aria-describedby="actionTargetsHint"
            >
                ${renderCheckboxOptions({
                    values: Object.values(ENUMS.TARGETS),
                    selectedValues: action.targets || (action.target ? [action.target] : []),
                    dataAttribute: 'data-action-checkbox',
                    group: 'target',
                    idPrefix: 'actionTarget'
                })}
            </div>
            <p class="form-hint" id="actionTargetsHint">Select one or more targets.</p>
        </div>

        <div class="form-group">
            <label class="form-label" for="actionExpectedOutcomes">Expected Outcomes *</label>
            <textarea
                id="actionExpectedOutcomes"
                class="form-input form-textarea"
                rows="4"
                placeholder="Describe expected outcomes..."
                required
            >${escapeHtml(action.expected_outcomes || action.description || '')}</textarea>
        </div>

        <div class="form-group">
            <label class="form-label" for="actionAllyContingencies">Ally Contingencies *</label>
            <textarea
                id="actionAllyContingencies"
                class="form-input form-textarea"
                rows="3"
                placeholder="Describe ally contingencies..."
                required
            >${escapeHtml(action.ally_contingencies || '')}</textarea>
        </div>

        <div class="form-actions" style="display: flex; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-4);">
            <button type="button" class="btn btn-secondary" id="cancelBtn">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Action'}</button>
        </div>
    `;

    // Handle cancel
    form.querySelector('#cancelBtn').addEventListener('click', () => {
        if (onCancel) onCancel();
    });

    // Handle submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        const formData = getFormData(form);
        if (!validateForm(formData)) return;

        isSubmitting = true;
        setSubmitPending(form, true, isEdit ? 'Saving...' : 'Creating...');
        try {
            let result;
            if (isEdit) {
                result = await actionsStore.update(action.id, formData);
                showToast({ message: 'Action updated successfully', type: 'success' });
            } else {
                result = await actionsStore.create({
                    ...formData,
                    team,
                    move: gameStateStore.getCurrentMove(),
                    phase: gameStateStore.getCurrentPhase()
                });
                showToast({ message: 'Action created successfully', type: 'success' });
            }

            if (onSubmit) onSubmit(result);
        } catch (err) {
            logger.error('Failed to save action:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to save action. Check the form and try again.'
                }),
                type: 'error'
            });
        } finally {
            isSubmitting = false;
            setSubmitPending(form, false);
        }
    });

    return form;
}

function setSubmitPending(form, isPending, pendingLabel = 'Saving...') {
    const submitButton = form.querySelector('button[type="submit"]');
    form.setAttribute('aria-busy', String(isPending));

    if (!submitButton) return;
    if (!submitButton.dataset.defaultLabel) {
        submitButton.dataset.defaultLabel = submitButton.textContent;
    }

    submitButton.disabled = isPending;
    submitButton.textContent = isPending ? pendingLabel : submitButton.dataset.defaultLabel;
}

/**
 * Get form data
 * @param {HTMLFormElement} form
 * @returns {Object}
 */
function getFormData(form) {
    const targets = getCheckedValues(form, '[data-action-checkbox="target"]');

    return {
        goal: form.querySelector('#actionGoal').value.trim(),
        mechanism: form.querySelector('#actionMechanism').value,
        sector: form.querySelector('#actionSector').value || null,
        exposure_type: form.querySelector('#actionExposureType').value || null,
        priority: form.querySelector('#actionPriority').value || 'NORMAL',
        targets,
        expected_outcomes: form.querySelector('#actionExpectedOutcomes').value.trim(),
        ally_contingencies: form.querySelector('#actionAllyContingencies').value.trim()
    };
}

/**
 * Validate form data
 * @param {Object} data
 * @returns {boolean}
 */
function validateForm(data) {
    const result = validateAction(data);
    if (!result.valid) {
        showToast({ message: result.errors[0] || 'Action validation failed', type: 'error' });
        return false;
    }
    return true;
}

/**
 * Create select options HTML
 * @param {Object} enumObj - Enum object
 * @param {string} selected - Selected value
 * @returns {string}
 */
function createOptions(enumObj, selected) {
    return Object.entries(enumObj)
        .map(([key, value]) =>
            `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`
        )
        .join('');
}

/**
 * Escape HTML
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export default createActionForm;
