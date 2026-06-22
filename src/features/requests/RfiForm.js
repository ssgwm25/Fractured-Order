/**
 * RFI Form Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Form for submitting Requests for Information to White Cell.
 */

import { requestsStore } from '../../stores/index.js';
import { gameStateStore } from '../../stores/index.js';
import { sessionStore } from '../../stores/session.js';
import { showToast } from '../../components/ui/Toast.js';
import { createLogger } from '../../utils/logger.js';
import { ENUMS } from '../../core/enums.js';
import { getCheckedValues, renderCheckboxOptions } from '../../utils/checkboxGroup.js';

const logger = createLogger('RfiForm');

/**
 * Create an RFI submission form
 * @param {Object} options - Form options
 * @param {string} options.team - Team identifier
 * @param {Function} options.onSubmit - Submit callback
 * @param {Function} options.onCancel - Cancel callback
 * @returns {HTMLElement}
 */
export function createRfiForm(options = {}) {
    const { team = 'blue', onSubmit, onCancel } = options;
    const priorityOptions = ENUMS.PRIORITY
        .map(value => `<option value="${value}">${value}</option>`)
        .join('');
    const form = document.createElement('form');
    form.className = 'rfi-form';

    form.innerHTML = `
        <div class="form-group">
            <label class="form-label" for="rfiQuestion">Question *</label>
            <textarea
                id="rfiQuestion"
                class="form-input form-textarea"
                rows="4"
                placeholder="Enter your question for White Cell..."
                required
                maxlength="1000"
            ></textarea>
            <p class="form-hint">Be specific about what information you need</p>
        </div>

        <div class="form-group">
            <label class="form-label" for="rfiContext">Context</label>
            <textarea
                id="rfiContext"
                class="form-input form-textarea"
                rows="3"
                placeholder="Provide any relevant context or background..."
                maxlength="500"
            ></textarea>
            <p class="form-hint">Optional: Help White Cell understand why you need this information</p>
        </div>

        <div class="form-group">
            <label class="form-label" for="rfiPriority">Priority *</label>
            <select id="rfiPriority" class="form-select" required>
                <option value="">Select priority</option>
                ${priorityOptions}
            </select>
        </div>

        <div class="form-group">
            <span class="form-label" id="rfiCategoriesLabel">Categories *</span>
            <div
                class="form-check-grid"
                role="group"
                aria-labelledby="rfiCategoriesLabel"
                aria-describedby="rfiCategoriesHint"
            >
                ${renderCheckboxOptions({
                    values: ENUMS.RFI_CATEGORIES,
                    dataAttribute: 'data-rfi-checkbox',
                    group: 'category',
                    idPrefix: 'rfiCategory'
                })}
            </div>
            <p class="form-hint" id="rfiCategoriesHint">Select all categories that apply.</p>
        </div>

        <div class="form-actions" style="display: flex; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-4);">
            ${onCancel ? '<button type="button" class="btn btn-secondary" id="cancelBtn">Cancel</button>' : ''}
            <button type="submit" class="btn btn-primary">Submit RFI</button>
        </div>
    `;

    // Handle cancel
    const cancelBtn = form.querySelector('#cancelBtn');
    if (cancelBtn && onCancel) {
        cancelBtn.addEventListener('click', () => onCancel());
    }

    // Handle submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const question = form.querySelector('#rfiQuestion').value.trim();
        const context = form.querySelector('#rfiContext').value.trim();
        const priority = form.querySelector('#rfiPriority').value;
        const categories = getCheckedValues(form, '[data-rfi-checkbox="category"]');

        if (!question) {
            showToast({ message: 'Question is required', type: 'error' });
            return;
        }
        if (!priority) {
            showToast({ message: 'Priority is required', type: 'error' });
            return;
        }
        if (!categories.length) {
            showToast({ message: 'Select at least one category', type: 'error' });
            return;
        }

        try {
            const query = context ? `${question}\n\nContext: ${context}` : question;
            const rfiData = {
                query,
                team,
                move: gameStateStore.getCurrentMove(),
                phase: gameStateStore.getCurrentPhase(),
                client_id: sessionStore.getClientId(),
                priority,
                categories
            };

            const result = await requestsStore.create(rfiData);
            showToast({ message: 'RFI submitted successfully', type: 'success' });

            // Reset form
            form.reset();

            if (onSubmit) onSubmit(result);
        } catch (err) {
            logger.error('Failed to submit RFI:', err);
            showToast({ message: 'Failed to submit RFI', type: 'error' });
        }
    });

    return form;
}

/**
 * Create a compact inline RFI form
 * @param {Object} options - Form options
 * @returns {HTMLElement}
 */
export function createInlineRfiForm(options = {}) {
    const { team = 'blue', onSubmit } = options;
    const defaultPriority = ENUMS.PRIORITY[0] || 'NORMAL';
    const defaultCategory = ENUMS.RFI_CATEGORIES[ENUMS.RFI_CATEGORIES.length - 1] || 'Other';

    const wrapper = document.createElement('div');
    wrapper.className = 'rfi-form-inline';

    wrapper.innerHTML = `
        <div class="rfi-form-inline-input">
            <textarea
                class="form-input"
                placeholder="Ask White Cell a question..."
                rows="2"
                id="inlineRfiQuestion"
            ></textarea>
        </div>
        <button class="btn btn-primary btn-sm" id="inlineRfiSubmit">Submit RFI</button>
    `;

    const textarea = wrapper.querySelector('#inlineRfiQuestion');
    const submitBtn = wrapper.querySelector('#inlineRfiSubmit');

    submitBtn.addEventListener('click', async () => {
        const question = textarea.value.trim();

        if (!question) {
            showToast({ message: 'Please enter a question', type: 'error' });
            return;
        }

        try {
            const result = await requestsStore.create({
                query: question,
                team,
                move: gameStateStore.getCurrentMove(),
                phase: gameStateStore.getCurrentPhase(),
                client_id: sessionStore.getClientId(),
                priority: defaultPriority,
                categories: [defaultCategory]
            });

            showToast({ message: 'RFI submitted', type: 'success' });
            textarea.value = '';

            if (onSubmit) onSubmit(result);
        } catch (err) {
            logger.error('Failed to submit RFI:', err);
            showToast({ message: 'Failed to submit RFI', type: 'error' });
        }
    });

    // Submit on Ctrl+Enter
    textarea.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            submitBtn.click();
        }
    });

    return wrapper;
}

export default createRfiForm;
