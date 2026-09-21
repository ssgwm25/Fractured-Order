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
import { getUserMessage } from '../../core/errors.js';

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
    const { team = 'blue', delegationId = null, request = null, onSubmit, onCancel } = options;
    const clientKey = globalThis.crypto.randomUUID();
    let isSubmitting = false;
    const isResubmission = request?.workflow_state === 'returned_to_team';
    const form = document.createElement('form');
    form.id = 'rfiForm';
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
                minlength="10"
                maxlength="2000"
                aria-describedby="rfiQuestionHint"
            >${escapeHtml(request?.query || request?.question || '')}</textarea>
            <p class="form-hint" id="rfiQuestionHint">Be specific about what information you need</p>
        </div>

        <div class="form-group">
            <label class="form-label" for="rfiContext">Context</label>
            <textarea
                id="rfiContext"
                class="form-input form-textarea"
                rows="3"
                placeholder="Provide any relevant context or background..."
                maxlength="500"
                aria-describedby="rfiContextHint"
            ></textarea>
            <p class="form-hint" id="rfiContextHint">Optional: help White Cell understand why the team needs this information.</p>
        </div>

        ${isResubmission ? `
            <div class="card card-bordered" role="status" aria-label="White Cell clarification request">
                <p class="form-label">White Cell clarification notes</p>
                <p>${escapeHtml(request.review_notes || 'No clarification notes were recorded.')}</p>
                <p class="form-hint">You are editing revision ${Number(request.revision_number) || 1}. Resubmission keeps this RFI identity.</p>
            </div>
        ` : ''}

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
                    idPrefix: 'rfiCategory',
                    selectedValues: request?.categories || []
                })}
            </div>
            <p class="form-hint" id="rfiCategoriesHint">Select all categories that apply.</p>
        </div>

        <div class="form-actions" style="display: flex; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-4);">
            ${onCancel ? '<button type="button" class="btn btn-secondary" id="cancelBtn">Cancel</button>' : ''}
            <button type="submit" class="btn btn-primary">${isResubmission ? 'Resubmit RFI' : 'Submit RFI'}</button>
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
        if (isSubmitting) return;

        const question = form.querySelector('#rfiQuestion').value.trim();
        const context = form.querySelector('#rfiContext').value.trim();
        const categories = getCheckedValues(form, '[data-rfi-checkbox="category"]');

        if (!question) {
            showToast({ message: 'Question is required', type: 'error' });
            return;
        }
        if (question.length < 10) {
            showToast({ message: 'Question must be at least 10 characters', type: 'error' });
            return;
        }
        const query = context ? `${question}\n\nContext: ${context}` : question;
        if (query.length > 2000) {
            showToast({ message: 'Question and context must be 2000 characters or fewer', type: 'error' });
            return;
        }
        if (!categories.length) {
            showToast({ message: 'Select at least one category', type: 'error' });
            return;
        }

        isSubmitting = true;
        setSubmitPending(form, true, 'Submitting...');
        try {
            const rfiData = {
                query,
                team,
                ...(delegationId ? { delegation_id: delegationId, client_key: clientKey } : {}),
                move: gameStateStore.getCurrentMove(),
                phase: gameStateStore.getCurrentPhase(),
                client_id: sessionStore.getClientId(),
                categories
            };

            const result = isResubmission
                ? await requestsStore.resubmit(request.id, rfiData, ...(request.delegation_id ? [request] : []))
                : await requestsStore.create(rfiData);
            showToast({
                message: isResubmission ? 'RFI resubmitted successfully' : 'RFI submitted successfully',
                type: 'success'
            });

            // Reset form
            form.reset();

            if (onSubmit) await onSubmit(result);
        } catch (err) {
            logger.error('Failed to submit RFI:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to submit RFI. Check the form and try again.'
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

/**
 * Create a compact inline RFI form
 * @param {Object} options - Form options
 * @returns {HTMLElement}
 */
export function createInlineRfiForm(options = {}) {
    const { team = 'blue', onSubmit } = options;
    const defaultCategory = ENUMS.RFI_CATEGORIES[ENUMS.RFI_CATEGORIES.length - 1] || 'Other';

    const wrapper = document.createElement('div');
    wrapper.className = 'rfi-form-inline';

    wrapper.innerHTML = `
        <div class="rfi-form-inline-input">
            <label class="sr-only" for="inlineRfiQuestion">Question for White Cell</label>
            <textarea
                class="form-input"
                placeholder="Ask White Cell a question..."
                rows="2"
                id="inlineRfiQuestion"
                minlength="10"
                maxlength="2000"
            ></textarea>
        </div>
        <button class="btn btn-primary btn-sm" id="inlineRfiSubmit">Submit RFI</button>
    `;

    const textarea = wrapper.querySelector('#inlineRfiQuestion');
    const submitBtn = wrapper.querySelector('#inlineRfiSubmit');
    let isSubmitting = false;

    submitBtn.addEventListener('click', async () => {
        if (isSubmitting) return;
        const question = textarea.value.trim();

        if (!question) {
            showToast({ message: 'Please enter a question', type: 'error' });
            return;
        }
        if (question.length < 10) {
            showToast({ message: 'Question must be at least 10 characters', type: 'error' });
            textarea.focus();
            return;
        }

        isSubmitting = true;
        setButtonPending(submitBtn, true, 'Submitting...');
        wrapper.setAttribute('aria-busy', 'true');
        try {
            const result = await requestsStore.create({
                query: question,
                team,
                move: gameStateStore.getCurrentMove(),
                phase: gameStateStore.getCurrentPhase(),
                client_id: sessionStore.getClientId(),
                categories: [defaultCategory]
            });

            showToast({ message: 'RFI submitted', type: 'success' });
            textarea.value = '';

            if (onSubmit) onSubmit(result);
        } catch (err) {
            logger.error('Failed to submit RFI:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to submit RFI. Check the question and try again.'
                }),
                type: 'error'
            });
        } finally {
            isSubmitting = false;
            setButtonPending(submitBtn, false);
            wrapper.setAttribute('aria-busy', 'false');
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

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

function setSubmitPending(form, isPending, pendingLabel = 'Submitting...') {
    const submitButton = form.querySelector('button[type="submit"]');
    form.setAttribute('aria-busy', String(isPending));
    setButtonPending(submitButton, isPending, pendingLabel);
}

function setButtonPending(button, isPending, pendingLabel = 'Submitting...') {
    if (!button) return;
    if (!button.dataset.defaultLabel) {
        button.dataset.defaultLabel = button.textContent;
    }

    button.disabled = isPending;
    button.textContent = isPending ? pendingLabel : button.dataset.defaultLabel;
}

export default createRfiForm;
