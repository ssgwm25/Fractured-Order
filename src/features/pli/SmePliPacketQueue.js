/**
 * TSJ / Verba queue of SME-approved PLI copy packets.
 * Action-complete narrative handoffs stay in SmeHandoffQueue.
 */

import { database } from '../../services/database.js';
import { showToast } from '../../components/ui/Toast.js';
import { createLogger } from '../../utils/logger.js';
import { escapeHtml, emptyState } from './pliShared.js';

const logger = createLogger('SmePliPacketQueue');

const SEAT_LABELS = Object.freeze({
    tsj: 'Tribe Street Journal',
    verba: 'Verba AI'
});

const PLI_SEAT_LABELS = Object.freeze({
    macro: 'Macro',
    diplomacy_information: 'Diplomacy & Information',
    national_interest_escalation: 'NI & Escalation'
});

export function createSmePliPacketQueue(options = {}) {
    const {
        container,
        getSessionId,
        getAcknowledgerName,
        seat = 'tsj'
    } = options;
    if (!container) throw new Error('Container element is required');
    if (!['tsj', 'verba'].includes(seat)) {
        throw new Error(`Unsupported packet seat: ${seat}`);
    }

    let packets = [];
    let showDone = false;

    const wrapper = document.createElement('div');
    wrapper.className = 'pli-sme-panel';
    wrapper.dataset.seat = seat;
    wrapper.innerHTML = `
        <div class="pli-sme-toolbar">
            <div class="pli-sme-toolbar-left">
                <span class="badge badge-warning" data-packet-pending-count>0</span>
                <span class="text-sm text-gray-600">pending approved PLI packets</span>
            </div>
            <div class="pli-sme-toolbar-right">
                <label class="checkbox-label">
                    <input type="checkbox" data-packet-show-done>
                    <span class="text-sm">Show done</span>
                </label>
                <button type="button" class="btn btn-secondary btn-sm" data-packet-refresh>Refresh</button>
            </div>
        </div>
        <p class="text-sm text-gray-600 pli-sme-desc">
            Packets appear after Econ, NI, or Dip-Info finalize a PLI seat. Copy into ${escapeHtml(SEAT_LABELS[seat])} in another window, then mark done.
        </p>
        <div class="pli-sme-list" data-packet-list aria-live="polite"></div>
    `;
    container.appendChild(wrapper);

    const list = wrapper.querySelector('[data-packet-list]');
    const pendingBadge = wrapper.querySelector('[data-packet-pending-count]');

    wrapper.querySelector('[data-packet-show-done]').addEventListener('change', (event) => {
        showDone = event.target.checked;
        render();
    });
    wrapper.querySelector('[data-packet-refresh]').addEventListener('click', () => refresh());

    async function refresh() {
        const sessionId = getSessionId?.();
        if (!sessionId) {
            list.innerHTML = '<p class="text-sm text-gray-500">No active session.</p>';
            return;
        }
        try {
            packets = await database.fetchSmePliPackets(sessionId, { handoffSeat: seat });
            render();
        } catch (err) {
            logger.error('Failed to load SME PLI packets:', err);
            list.innerHTML = '<p class="text-sm text-gray-500">Failed to load approved PLI packets. Apply data/2026-08-25_sme_pli_packets.sql if needed.</p>';
        }
    }

    function visibleRows() {
        return (packets || []).filter((row) => showDone || row.status !== 'done');
    }

    function render() {
        const pending = (packets || []).filter((row) => row.status === 'pending');
        pendingBadge.textContent = String(pending.length);
        const visible = visibleRows();
        if (!visible.length) {
            list.innerHTML = emptyState(
                showDone ? 'No PLI packets yet' : 'No pending approved PLI packets',
                'Packets appear after Econ, NI, or Dip-Info finalize this action’s PLI seats.'
            );
            return;
        }
        list.innerHTML = '';
        visible.forEach((row) => list.appendChild(renderCard(row)));
    }

    async function copyText(text, successMessage) {
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
            showToast({ message: successMessage, type: 'success' });
        } catch (err) {
            logger.error('Copy failed:', err);
            showToast({ message: 'Could not copy to clipboard', type: 'error' });
        }
    }

    function renderCard(packet) {
        const card = document.createElement('article');
        card.className = 'pli-sme-card';
        const isDone = packet.status === 'done';
        const title = packet.payload?.action?.title || `Action ${(packet.action_id || '').toString().slice(0, 8)}`;
        const jsonText = JSON.stringify(packet.payload || {}, null, 2);
        const markdown = packet.copy_text || jsonText;
        const preview = String(markdown).slice(0, 1200);

        card.innerHTML = `
            <header class="pli-sme-card-header">
                <div>
                    <h3 class="pli-sme-card-title">${escapeHtml(title)}</h3>
                    <p class="text-sm text-gray-500">
                        ${escapeHtml(PLI_SEAT_LABELS[packet.pli_seat] || packet.pli_seat || 'PLI')}
                        · ${escapeHtml(packet.payload?.smeStatus || 'finalized')}
                        · Move ${escapeHtml(String(packet.payload?.action?.move ?? '—'))}
                    </p>
                </div>
                <span class="badge ${isDone ? 'badge-success' : 'badge-warning'}">${isDone ? 'Done' : 'Pending'}</span>
            </header>
            <section class="pli-col">
                <h4 class="pli-col-title">Copy preview</h4>
                <pre class="pli-pre">${escapeHtml(preview)}${markdown.length > 1200 ? '\n…' : ''}</pre>
            </section>
            <footer class="pli-sme-actions" style="margin-top: var(--space-3); display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap;">
                <button type="button" class="btn btn-secondary btn-sm" data-packet-copy-md>Copy markdown</button>
                <button type="button" class="btn btn-secondary btn-sm" data-packet-copy-json>Copy JSON</button>
                ${!isDone ? '<button type="button" class="btn btn-primary btn-sm" data-packet-done>Mark done</button>' : ''}
                ${isDone && packet.acknowledged_by
                    ? `<span class="text-sm text-gray-500">Acknowledged by ${escapeHtml(packet.acknowledged_by)}</span>`
                    : ''}
            </footer>
        `;

        card.querySelector('[data-packet-copy-md]')?.addEventListener('click', () => {
            copyText(markdown, 'Copied markdown packet');
        });
        card.querySelector('[data-packet-copy-json]')?.addEventListener('click', () => {
            copyText(jsonText, 'Copied JSON packet');
        });
        card.querySelector('[data-packet-done]')?.addEventListener('click', async () => {
            try {
                await database.acknowledgeSmePliPacket(packet.id, {
                    acknowledgedBy: getAcknowledgerName?.() || SEAT_LABELS[seat]
                });
                showToast({ message: 'Marked done', type: 'success' });
                await refresh();
            } catch (err) {
                logger.error('Failed to acknowledge PLI packet:', err);
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

export default createSmePliPacketQueue;
