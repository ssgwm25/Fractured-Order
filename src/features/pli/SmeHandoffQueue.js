/**
 * TSJ / Verba SME handoff queue — read-only action narrative + Copy + Mark done.
 * Real authoring stays outside Plenum.
 */

import { database } from '../../services/database.js';
import { showToast } from '../../components/ui/Toast.js';
import { createLogger } from '../../utils/logger.js';
import {
    escapeHtml,
    getActionTitle,
    buildSourceActionPresentation,
    emptyState
} from './pliShared.js';

const logger = createLogger('SmeHandoffQueue');

const SEAT_LABELS = Object.freeze({
    tsj: 'Tribe Street Journal',
    verba: 'Verba AI'
});

export function createSmeHandoffQueue(options = {}) {
    const {
        container,
        getSessionId,
        getAcknowledgerName,
        seat = 'tsj'
    } = options;
    if (!container) throw new Error('Container element is required');
    if (!['tsj', 'verba'].includes(seat)) {
        throw new Error(`Unsupported handoff seat: ${seat}`);
    }

    let handoffs = [];
    let actionsById = new Map();
    let showDone = false;

    const wrapper = document.createElement('div');
    wrapper.className = 'pli-sme-panel';
    wrapper.dataset.seat = seat;
    wrapper.innerHTML = `
        <div class="pli-sme-toolbar">
            <div class="pli-sme-toolbar-left">
                <span class="badge badge-warning" data-handoff-pending-count>0</span>
                <span class="text-sm text-gray-600">pending ${escapeHtml(SEAT_LABELS[seat])} handoffs</span>
            </div>
            <div class="pli-sme-toolbar-right">
                <label class="checkbox-label">
                    <input type="checkbox" data-handoff-show-done>
                    <span class="text-sm">Show done</span>
                </label>
                <button type="button" class="btn btn-secondary btn-sm" data-handoff-refresh>Refresh</button>
            </div>
        </div>
        <p class="text-sm text-gray-600 pli-sme-desc">
            Read-only action queue opened when White Cell marks a Blue action complete.
            Copy the narrative into the external tool, then mark done.
        </p>
        <div class="pli-sme-list" data-handoff-list aria-live="polite"></div>
    `;
    container.appendChild(wrapper);

    const list = wrapper.querySelector('[data-handoff-list]');
    const pendingBadge = wrapper.querySelector('[data-handoff-pending-count]');

    wrapper.querySelector('[data-handoff-show-done]').addEventListener('change', (event) => {
        showDone = event.target.checked;
        render();
    });
    wrapper.querySelector('[data-handoff-refresh]').addEventListener('click', () => refresh());

    async function refresh() {
        const sessionId = getSessionId?.();
        if (!sessionId) {
            list.innerHTML = '<p class="text-sm text-gray-500">No active session.</p>';
            return;
        }
        try {
            const [rows, actions] = await Promise.all([
                database.fetchSmeHandoffs(sessionId, { seat }),
                database.fetchActions(sessionId).catch(() => [])
            ]);
            handoffs = rows || [];
            actionsById = new Map((actions || []).map((action) => [action.id, action]));
            render();
        } catch (err) {
            logger.error('Failed to load SME handoffs:', err);
            list.innerHTML = '<p class="text-sm text-gray-500">Failed to load handoff queue. Apply data/2026-07-20_sme_handoffs.sql if needed.</p>';
        }
    }

    function visibleRows() {
        return handoffs.filter((row) => showDone || row.status !== 'done');
    }

    function render() {
        const pending = handoffs.filter((row) => row.status === 'pending');
        pendingBadge.textContent = String(pending.length);
        const visible = visibleRows();
        if (!visible.length) {
            list.innerHTML = emptyState(
                showDone ? 'No handoffs yet' : 'No pending handoffs',
                'Rows appear when White Cell Lead records deliberation / action-complete on a Blue action.'
            );
            return;
        }
        list.innerHTML = '';
        visible.forEach((row) => list.appendChild(renderCard(row)));
    }

    function buildCopyText(action, handoff) {
        const presentation = buildSourceActionPresentation(action);
        const title = getActionTitle(action, { action_id: handoff.action_id });
        const lines = [
            `${SEAT_LABELS[seat]} handoff`,
            `Title: ${title}`,
            `Action ID: ${handoff.action_id}`,
            `Team: ${action?.team || 'unknown'}`,
            `Move: ${action?.move ?? '—'} | Phase: ${action?.phase ?? '—'}`,
            '',
            'Narrative:',
            presentation.narrative || 'No narrative on record.'
        ];
        if (presentation.details?.length) {
            lines.push('', 'Details:');
            presentation.details.forEach((detail) => {
                lines.push(`- ${detail.label}: ${detail.value}`);
            });
        }
        return lines.join('\n');
    }

    function renderCard(handoff) {
        const card = document.createElement('article');
        card.className = 'pli-sme-card';
        const action = actionsById.get(handoff.action_id);
        const presentation = buildSourceActionPresentation(action);
        const title = getActionTitle(action, { action_id: handoff.action_id });
        const isDone = handoff.status === 'done';
        const statusBadge = isDone ? 'badge-success' : 'badge-warning';
        const statusLabel = isDone ? 'Done' : 'Pending';

        const detailHtml = presentation.details?.length
            ? `<dl class="pli-detail-meta">${presentation.details.map((entry) => `
                <div>
                    <dt>${escapeHtml(entry.label)}</dt>
                    <dd>${escapeHtml(entry.value)}</dd>
                </div>`).join('')}</dl>`
            : '';

        card.innerHTML = `
            <header class="pli-sme-card-header">
                <div>
                    <h3 class="pli-sme-card-title">${escapeHtml(title)}</h3>
                    <p class="text-sm text-gray-500">
                        ${escapeHtml(action?.team || 'blue')}
                        · Move ${escapeHtml(String(action?.move ?? '—'))}
                        · Phase ${escapeHtml(String(action?.phase ?? '—'))}
                    </p>
                </div>
                <span class="badge ${statusBadge}">${statusLabel}</span>
            </header>
            <section class="pli-col">
                <h4 class="pli-col-title">Action narrative</h4>
                <p class="text-sm">${escapeHtml(presentation.narrative)}</p>
                ${detailHtml}
            </section>
            <footer class="pli-sme-actions" style="margin-top: var(--space-3); display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap;">
                <button type="button" class="btn btn-secondary btn-sm" data-handoff-copy>Copy</button>
                ${!isDone ? '<button type="button" class="btn btn-primary btn-sm" data-handoff-done>Mark done</button>' : ''}
                ${isDone && handoff.acknowledged_by
                    ? `<span class="text-sm text-gray-500">Acknowledged by ${escapeHtml(handoff.acknowledged_by)}</span>`
                    : ''}
            </footer>
        `;

        card.querySelector('[data-handoff-copy]')?.addEventListener('click', async () => {
            const text = buildCopyText(action, handoff);
            try {
                if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const area = document.createElement('textarea');
                    area.value = text;
                    document.body.appendChild(area);
                    area.select();
                    document.execCommand('copy');
                    area.remove();
                }
                showToast({ message: 'Copied handoff narrative', type: 'success' });
            } catch (err) {
                logger.error('Copy failed:', err);
                showToast({ message: 'Could not copy to clipboard', type: 'error' });
            }
        });

        card.querySelector('[data-handoff-done]')?.addEventListener('click', async () => {
            try {
                await database.acknowledgeSmeHandoff(handoff.id, {
                    acknowledgedBy: getAcknowledgerName?.() || SEAT_LABELS[seat]
                });
                showToast({ message: 'Marked done', type: 'success' });
                await refresh();
            } catch (err) {
                logger.error('Failed to acknowledge handoff:', err);
                showToast({ message: 'Failed to mark done', type: 'error' });
            }
        });

        return card;
    }

    function destroy() {
        wrapper.remove();
    }

    return { refresh, destroy };
}

export default createSmeHandoffQueue;
