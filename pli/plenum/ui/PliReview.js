/**
 * PLI Adjudication Review Panel (White Cell)
 *
 * Renders the traceable adjudication records produced by the PLI pipeline
 * (pli/run_pli.py): lever/instrument classification with the cited tie-break
 * rule, the precedent worksheet with statutory citations, both score
 * derivations, and color-coded before/after trend charts for the five
 * macroeconomic indicators. Chart visual language matches the canonical
 * Python generator ``pli_charts.py`` (navy baseline, colored post-action,
 * darker favorable green, on-line markers, segment-aware fills).
 * The SME approves or overrides each record; overrides require a rationale
 * and become the adjudication of record.
 */

import { database } from '../../services/database.js';
import { showModal } from '../../components/ui/Modal.js';
import { showToast } from '../../components/ui/Toast.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PliReview');

// Chart palette aligned with FO report charts: navy baseline, gold post-action,
// darker green/red divergence fill by local favorability.
const NAVY = '#1f3b6e';
const GOLD = '#7a4b00';
const GREEN = '#0a4d28';
const GREEN_FILL = '#0f6b35';
const RED = '#b04a4a';
const GREY = '#5a5f6e';

const STATUS_LABELS = {
    pending: 'Pending SME review',
    approved: 'Approved',
    overridden: 'Overridden',
    needs_human: 'Needs human adjudication'
};

const STATUS_BADGE = {
    pending: 'badge-warning',
    approved: 'badge-success',
    overridden: 'badge-primary',
    needs_human: 'badge-danger'
};

export function createPliReview(options = {}) {
    const { container, getSessionId, getReviewerName } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let records = [];
    let actionsById = new Map();
    let showReviewed = false;

    const wrapper = document.createElement('div');
    wrapper.className = 'pli-review-wrapper';
    wrapper.innerHTML = `
        <div class="action-review-header" style="display:flex; align-items:center; justify-content:space-between; gap: var(--space-3); margin-bottom: var(--space-3);">
            <div style="display:flex; align-items:center; gap: var(--space-2);">
                <span class="badge badge-primary" id="pliPendingCount">0</span>
                <span class="text-sm text-gray-600">awaiting review</span>
            </div>
            <div style="display:flex; align-items:center; gap: var(--space-3);">
                <label class="checkbox-label" style="display:flex; align-items:center; gap: var(--space-1);">
                    <input type="checkbox" id="pliShowReviewed">
                    <span class="text-sm">Show reviewed</span>
                </label>
                <button type="button" class="btn btn-secondary btn-sm" id="pliRefreshButton">Refresh</button>
            </div>
        </div>
        <div id="pliReviewList" class="card-list" aria-live="polite"></div>
    `;
    container.appendChild(wrapper);

    const list = wrapper.querySelector('#pliReviewList');
    const pendingBadge = wrapper.querySelector('#pliPendingCount');

    wrapper.querySelector('#pliShowReviewed').addEventListener('change', (event) => {
        showReviewed = event.target.checked;
        render();
    });
    wrapper.querySelector('#pliRefreshButton').addEventListener('click', () => {
        refresh();
    });

    async function refresh() {
        const sessionId = getSessionId?.();
        if (!sessionId) {
            list.innerHTML = '<p class="text-sm text-gray-500">No active session.</p>';
            return;
        }

        try {
            const [adjudications, actions] = await Promise.all([
                database.fetchPliAdjudications(sessionId),
                database.fetchActions(sessionId).catch(() => [])
            ]);
            records = adjudications;
            actionsById = new Map((actions || []).map((action) => [action.id, action]));
            render();
        } catch (err) {
            logger.error('Failed to load PLI adjudications:', err);
            list.innerHTML = '<p class="text-sm text-gray-500">Failed to load PLI adjudications. The pli_adjudications migration may not be applied yet.</p>';
        }
    }

    function render() {
        const pending = records.filter((r) => r.status === 'pending' || r.status === 'needs_human');
        pendingBadge.textContent = pending.length;

        const visible = showReviewed ? records : pending;

        if (!visible.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <h3 class="empty-state-title">No PLI Adjudications${showReviewed ? '' : ' Awaiting Review'}</h3>
                    <p class="empty-state-message">The PLI pipeline writes records here after each run. Trigger it from the repository's Actions tab (PLI Adjudication workflow) or wait for the scheduled run.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = '';
        const sessionStack = computeSessionStack(visible);
        if (sessionStack) {
            list.appendChild(renderSessionStack(sessionStack));
        }
        visible.forEach((record) => list.appendChild(renderCard(record)));
    }

    function computeSessionStack(rows) {
        const usable = (rows || []).filter((row) => {
            const trend = row?.record?.adjudication?.trend;
            return trend && trend.indicators && !trend.no_effect;
        });
        if (usable.length < 2) {
            return null;
        }

        const periods = usable[0].record.adjudication.trend.quarters
            || usable[0].record.adjudication.trend.years
            || [];
        const indicators = {};
        Object.keys(usable[0].record.adjudication.trend.indicators).forEach((key) => {
            const first = usable[0].record.adjudication.trend.indicators[key];
            const n = periods.length;
            const deltas = new Array(n).fill(0);
            usable.forEach((row) => {
                const series = row.record.adjudication.trend.indicators[key]?.deltas || [];
                for (let i = 0; i < n; i += 1) {
                    deltas[i] += Number(series[i] || 0);
                }
            });
            const baseline = first.baseline || new Array(n).fill(0);
            const post = baseline.map((b, i) => Number(b) + deltas[i]);
            const favDir = Number(first.favorable_direction ?? 1);
            const net = deltas.reduce((sum, d) => sum + d, 0) * favDir;
            indicators[key] = {
                label: first.label || key,
                baseline,
                deltas: deltas.map((d) => Math.round(d * 100) / 100),
                post_action: post.map((v) => Math.round(v * 100) / 100),
                favorable_direction: favDir,
                verdict: net > 0 ? 'favorable' : (net < 0 ? 'unfavorable' : 'neutral')
            };
        });

        return {
            action_count: usable.length,
            stacking_policy: 'uncapped',
            quarters: periods,
            indicators
        };
    }

    function renderSessionStack(stack) {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = 'var(--space-4)';
        card.style.marginBottom = 'var(--space-4)';
        card.innerHTML = `
            <h4 style="margin:0 0 var(--space-1) 0;">Session cumulative path</h4>
            <p class="text-sm text-gray-600" style="margin:0 0 var(--space-3) 0;">
                Uncapped stack of ${stack.action_count} macro adjudications in this view
                (stacking_policy=${escapeHtml(stack.stacking_policy)}). Per-action cards below remain the SME review unit.
            </p>
        `;
        card.appendChild(renderTrendCharts({
            quarters: stack.quarters,
            indicators: stack.indicators
        }));
        return card;
    }

    function renderCard(row) {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = 'var(--space-4)';
        card.style.marginBottom = 'var(--space-4)';

        const action = actionsById.get(row.action_id);
        const title = action?.title || action?.goal || `Action ${row.action_id.slice(0, 8)}`;
        const record = row.record || {};
        const worksheet = record.worksheet || null;
        const adjudication = record.adjudication || null;
        const statusLabel = STATUS_LABELS[row.status] || row.status;
        const badgeClass = STATUS_BADGE[row.status] || 'badge-secondary';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex; align-items:flex-start; justify-content:space-between; gap: var(--space-3); margin-bottom: var(--space-3);';
        header.innerHTML = `
            <div>
                <h4 style="margin:0 0 var(--space-1) 0;">${escapeHtml(title)}</h4>
                <p class="text-sm text-gray-600" style="margin:0;">
                    ${action ? `Team: ${escapeHtml(action.team)} | Move: ${action.move} | ` : ''}
                    Codebook: ${escapeHtml(row.codebook_version || '')}
                </p>
            </div>
            <span class="badge ${badgeClass}">${escapeHtml(statusLabel)}</span>
        `;
        card.appendChild(header);

        if (row.status === 'needs_human' || !adjudication) {
            const reason = record.needs_human_reason || worksheet?.needs_human_reason || 'The agent could not classify this action cleanly.';
            const notice = document.createElement('div');
            notice.style.cssText = 'background: var(--color-gray-50); border-left: 3px solid ' + RED + '; padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-3);';
            notice.innerHTML = `<p class="text-sm" style="margin:0;"><strong>Manual adjudication required.</strong> ${escapeHtml(reason)}</p>`;
            card.appendChild(notice);
            if (worksheet) {
                card.appendChild(renderTrace(worksheet, null, record));
            }
        } else {
            card.appendChild(renderTrace(worksheet, adjudication, record));
            card.appendChild(renderTrendCharts(adjudication.trend));
        }

        if (row.status === 'overridden' && row.override_rationale) {
            const overrideNote = document.createElement('div');
            overrideNote.style.cssText = 'background: var(--color-gray-50); border-left: 3px solid ' + GOLD + '; padding: var(--space-3); border-radius: var(--radius-md); margin-top: var(--space-3);';
            overrideNote.innerHTML = `
                <p class="text-sm" style="margin:0 0 var(--space-1) 0;"><strong>SME override</strong>${row.sme_reviewer ? ` by ${escapeHtml(row.sme_reviewer)}` : ''}:</p>
                <p class="text-sm" style="margin:0 0 var(--space-1) 0;">${escapeHtml(row.override_rationale)}</p>
                ${row.override_value ? `<p class="text-sm" style="margin:0;">New values: Implementation ${escapeHtml(String(row.override_value.implementation_score ?? '-'))}</p>` : ''}
            `;
            card.appendChild(overrideNote);
        }

        if (row.status === 'pending' || row.status === 'needs_human') {
            const controls = document.createElement('div');
            controls.style.cssText = 'display:flex; gap: var(--space-2); margin-top: var(--space-3);';

            if (row.status === 'pending') {
                const approveButton = document.createElement('button');
                approveButton.className = 'btn btn-primary btn-sm';
                approveButton.textContent = 'Approve';
                approveButton.addEventListener('click', () => handleApprove(row));
                controls.appendChild(approveButton);
            }

            const overrideButton = document.createElement('button');
            overrideButton.className = 'btn btn-secondary btn-sm';
            overrideButton.textContent = row.status === 'needs_human' ? 'Adjudicate Manually' : 'Override';
            overrideButton.addEventListener('click', () => showOverrideModal(row));
            controls.appendChild(overrideButton);

            card.appendChild(controls);
        }

        return card;
    }

    function renderTrace(worksheet, adjudication, record) {
        const trace = document.createElement('div');
        trace.style.cssText = 'display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-3);';

        const classification = worksheet?.classification;
        const precedent = worksheet?.precedent;
        const implementation = adjudication?.implementation;

        if (classification) {
            trace.appendChild(traceBlock('Classification', [
                `Lever: <strong>${escapeHtml(classification.lever)}</strong>` +
                    (classification.instrument ? ` | Instrument: <strong>${escapeHtml(classification.instrument)}</strong>` : ''),
                `Direction: ${escapeHtml(classification.direction)}`,
                `Rule cited: <em>${escapeHtml(classification.rule_citation)}</em>`
            ]));
        }

        if (precedent) {
            const citations = (precedent.citations || []).map((c) => `<li>${escapeHtml(c)}</li>`).join('');
            trace.appendChild(traceBlock('Precedent worksheet', [
                `Tier ${precedent.tier}${implementation ? ` — ${escapeHtml(implementation.tier_label || '')}` : ''}`,
                escapeHtml(precedent.rationale || ''),
                citations ? `Citations:<ul style="margin: var(--space-1) 0 0 var(--space-4); padding:0;">${citations}</ul>` : 'No citations recorded.'
            ]));
        }

        if (implementation) {
            const modifiers = Object.entries(implementation.modifiers_applied || {})
                .map(([name, value]) => `${name.replace(/_/g, ' ')} (${value > 0 ? '+' : ''}${value})`)
                .join(', ') || 'none';
            trace.appendChild(traceBlock(`Implementation score: ${implementation.score}/10`, [
                `Tier midpoint ${implementation.midpoint} | Modifiers: ${escapeHtml(modifiers)} | Raw ${implementation.raw} → floor, band-edge cap`,
                adjudication?.trend?.implementation_band ? `Band ${escapeHtml(adjudication.trend.implementation_band)}: controls magnitude class + onset delay` : ''
            ]));
        }

        const declaredOrientation = record?.declared_orientation
            || worksheet?.fit?.orientation
            || '';
        if (declaredOrientation) {
            trace.appendChild(traceBlock('Declared orientation (intake)', [
                `<strong>${escapeHtml(declaredOrientation)}</strong> — scored on the National Interest track (Source 12), not on this Macro path.`
            ]));
        }

        const submissionMonth = adjudication?.submission_month
            || adjudication?.trend?.submission_month
            || worksheet?.submission_month;
        const timing = record?.submission_timing || {};
        if (submissionMonth || timing.clamped_to_horizon) {
            const lines = [
                submissionMonth ? `Month: <strong>${escapeHtml(submissionMonth)}</strong>` : '',
                adjudication?.trend?.submission_quarter
                    ? `Quarter: ${escapeHtml(adjudication.trend.submission_quarter)} (onset/ramp/decay in quarters)`
                    : 'Onset, ramp, and decay measured in quarters from this month.',
                timing.source ? `Grounding source: ${escapeHtml(String(timing.source))}` : '',
                timing.source === 'six_month_cadence'
                    ? `Cadence: +${escapeHtml(String(timing.spacing_months || 6))} months from `
                      + `${escapeHtml(String(timing.sequence_start_month || '2027-01'))}`
                      + (timing.ordinal_index != null
                          ? ` (action #${escapeHtml(String(Number(timing.ordinal_index) + 1))} of `
                            + `${escapeHtml(String(timing.ordinal_count || '?'))} in session order)`
                          : '')
                    : ''
            ];
            if (timing.clamped_to_horizon) {
                lines.push(
                    `Horizon clamp: raw ${escapeHtml(String(timing.submission_month_raw || ''))} `
                    + `→ ${escapeHtml(String(timing.submission_month || submissionMonth || ''))} `
                    + `(grid ends ${escapeHtml(String(timing.horizon_end_month || '2034-12'))}).`
                );
            }
            const flags = adjudication?.flags || adjudication?.trend?.flags || [];
            if (flags.includes('onset_beyond_horizon')) {
                lines.push('Flag: onset_beyond_horizon — one or more indicators start after the scored grid.');
            }
            if (flags.includes('clamped_to_horizon') || timing.clamped_to_horizon) {
                lines.push('Flag: clamped_to_horizon — diegetic month was clipped to the live PLI grid.');
            }
            trace.appendChild(traceBlock('Submission anchor', lines));
        }

        return trace;
    }

    function traceBlock(title, lines) {
        const block = document.createElement('div');
        block.style.cssText = 'background: var(--color-gray-50); border-radius: var(--radius-md); padding: var(--space-3);';
        block.innerHTML = `
            <p class="text-sm" style="margin:0 0 var(--space-1) 0; font-weight:600;">${title}</p>
            ${lines.filter(Boolean).map((line) => `<p class="text-sm" style="margin:0 0 var(--space-1) 0;">${line}</p>`).join('')}
        `;
        return block;
    }

    function renderTrendCharts(trend) {
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3);';

        if (!trend || !trend.indicators) {
            return grid;
        }

        if (trend.no_effect) {
            const note = document.createElement('p');
            note.className = 'text-sm text-gray-600';
            note.textContent = `No macroeconomic effect: ${trend.no_effect_reason || ''}. All indicators stay on the baseline.`;
            grid.appendChild(note);
            return grid;
        }

        const periods = trend.quarters || trend.years || [];
        const submissionMonth = trend.submission_month || null;
        Object.values(trend.indicators).forEach((indicator) => {
            grid.appendChild(renderIndicatorChart(periods, indicator, submissionMonth));
        });

        const legend = document.createElement('p');
        legend.className = 'text-sm text-gray-600';
        legend.style.cssText = 'grid-column: 1 / -1; margin: var(--space-2) 0 0 0; display:flex; flex-wrap:wrap; gap: 10px 18px; align-items:center;';
        legend.innerHTML = `
            <span style="color:${NAVY}; font-weight:600;">— baseline</span>
            <span style="color:${GOLD}; font-weight:600;">-- post-action</span>
            <span style="color:${GREEN}; font-weight:600;">green = favorable divergence</span>
            <span style="color:${RED}; font-weight:600;">red = unfavorable divergence</span>
            ${submissionMonth ? `<span style="color:${GREY}; font-weight:600;">● submitted ${escapeHtml(submissionMonth)}</span>` : ''}
        `;
        grid.appendChild(legend);

        return grid;
    }

    function renderIndicatorChart(periods, indicator, submissionMonth) {
        const width = 280;
        const height = 168;
        const pad = { top: 28, right: 10, bottom: 22, left: 34 };
        const n = Math.max(periods.length, 1);

        const base = indicator.baseline || [];
        const post = indicator.post_action || base;
        const favDir = Number(indicator.favorable_direction ?? 1);
        const allValues = base.concat(post);
        let min = Math.min(...allValues);
        let max = Math.max(...allValues);
        if (max - min < 1) {
            const mid = (max + min) / 2;
            min = mid - 0.5;
            max = mid + 0.5;
        }
        const spanX = width - pad.left - pad.right;
        const spanY = height - pad.top - pad.bottom;
        const x = (i) => pad.left + (spanX * i) / Math.max(n - 1, 1);
        const y = (value) => pad.top + spanY * (1 - (value - min) / (max - min));

        const pathOf = (series) => series.map((value, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(' ');

        const verdictColor = indicator.verdict === 'favorable' ? GREEN : (indicator.verdict === 'unfavorable' ? RED : GREY);

        // Segment fills: green where local divergence is favorable, red where unfavorable.
        const fillSegments = [];
        for (let i = 0; i < n - 1; i += 1) {
            const signed = ((post[i] - base[i]) + (post[i + 1] - base[i + 1])) / 2 * favDir;
            if (Math.abs(signed) < 1e-9) continue;
            const fillColor = signed > 0 ? GREEN_FILL : RED;
            const opacity = signed > 0 ? 0.45 : 0.28;
            const d = [
                `M${x(i).toFixed(1)},${y(base[i]).toFixed(1)}`,
                `L${x(i + 1).toFixed(1)},${y(base[i + 1]).toFixed(1)}`,
                `L${x(i + 1).toFixed(1)},${y(post[i + 1]).toFixed(1)}`,
                `L${x(i).toFixed(1)},${y(post[i]).toFixed(1)}`,
                'Z'
            ].join(' ');
            fillSegments.push(`<path d="${d}" fill="${fillColor}" fill-opacity="${opacity}" stroke="none"/>`);
        }

        // Tick labels: year starts (Q1) only on quarterly grids.
        const gridLines = periods.map((period, i) => {
            const label = String(period);
            const showLabel = label.endsWith('Q1') || (!label.includes('Q') && i % Math.max(1, Math.floor(n / 6)) === 0);
            return `
            <line x1="${x(i)}" y1="${pad.top}" x2="${x(i)}" y2="${height - pad.bottom}" stroke="#e4e6eb" stroke-width="1"/>
            ${showLabel ? `<text x="${x(i)}" y="${height - 6}" font-size="7" text-anchor="middle" fill="${GREY}">${label.slice(2, 4)}</text>` : ''}
        `;
        }).join('');

        let submissionMark = '';
        if (submissionMonth && /^\d{4}-\d{2}$/.test(submissionMonth)) {
            const year = Number(submissionMonth.slice(0, 4));
            const month = Number(submissionMonth.slice(5, 7));
            const q = Math.floor((month - 1) / 3) + 1;
            const qLabel = `${year}Q${q}`;
            let idx = periods.indexOf(qLabel);
            if (idx < 0) {
                idx = periods.findIndex((p) => String(p).startsWith(String(year)));
            }
            if (idx >= 0) {
                const py = post[idx] ?? base[idx];
                submissionMark = `
                    <line x1="${x(idx)}" y1="${pad.top}" x2="${x(idx)}" y2="${height - pad.bottom}" stroke="#c9b896" stroke-width="1" stroke-dasharray="2,2"/>
                    <circle cx="${x(idx).toFixed(1)}" cy="${y(py).toFixed(1)}" r="3.6" fill="${GOLD}" stroke="#ffffff" stroke-width="1"/>
                `;
            }
        }

        const yTicks = [min, (min + max) / 2, max].map((value) => `
            <text x="${pad.left - 4}" y="${y(value) + 3}" font-size="8" text-anchor="end" fill="${GREY}">${value.toFixed(1)}</text>
        `).join('');

        const holder = document.createElement('div');
        holder.style.cssText = 'background: #ffffff; border: 1px solid var(--color-gray-200, #e4e6eb); border-radius: var(--radius-md); padding: var(--space-2);';
        holder.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(indicator.label)} baseline vs post-action" style="width:100%; height:auto; display:block;">
                <text x="${pad.left}" y="14" font-size="9" font-weight="700" fill="${verdictColor}">${escapeHtml(indicator.label)}</text>
                <text x="${width - pad.right}" y="14" font-size="9" font-weight="700" text-anchor="end" fill="${verdictColor}">[${indicator.verdict}]</text>
                ${gridLines}
                ${yTicks}
                ${fillSegments.join('')}
                <path d="${pathOf(base)}" fill="none" stroke="${NAVY}" stroke-width="1.9"/>
                <path d="${pathOf(post)}" fill="none" stroke="${GOLD}" stroke-width="1.9" stroke-dasharray="5,3"/>
                ${submissionMark}
            </svg>
        `;
        return holder;
    }

    async function handleApprove(row) {
        try {
            await database.reviewPliAdjudication(row.id, {
                status: 'approved',
                sme_reviewer: getReviewerName?.() || 'White Cell'
            });
            showToast({ message: 'PLI adjudication approved', type: 'success' });
            await refresh();
        } catch (err) {
            logger.error('Failed to approve PLI adjudication:', err);
            showToast({ message: 'Failed to approve adjudication', type: 'error' });
        }
    }

    function showOverrideModal(row) {
        const adjudication = row.record?.adjudication;
        const content = document.createElement('div');
        content.innerHTML = `
            <p class="text-sm text-gray-600" style="margin-bottom: var(--space-3);">
                The override becomes the adjudication of record. The original agent record is preserved
                for override tracking: repeated overrides of the same codebook table entry trigger a
                table revision.
            </p>
            <form id="pliOverrideForm">
                <div class="form-group">
                    <label class="form-label" for="pliOverrideImpl">Implementation score (1-10) *</label>
                    <input type="number" id="pliOverrideImpl" class="form-input" min="1" max="10"
                        value="${adjudication?.implementation?.score ?? ''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label" for="pliOverrideRationale">Rationale (required)</label>
                    <textarea id="pliOverrideRationale" class="form-input form-textarea" rows="4"
                        placeholder="Which codebook table entry is wrong, and why?"></textarea>
                </div>
            </form>
        `;

        showModal({
            title: 'Override PLI Adjudication',
            content,
            size: 'md',
            buttons: [
                { text: 'Cancel', variant: 'secondary', onClick: (modal) => modal.close() },
                {
                    text: 'Record Override',
                    variant: 'primary',
                    onClick: async (modal) => {
                        const implementationScore = parseInt(document.getElementById('pliOverrideImpl').value, 10);
                        const rationale = document.getElementById('pliOverrideRationale').value.trim();

                        if (!Number.isInteger(implementationScore) || implementationScore < 1 || implementationScore > 10) {
                            showToast({ message: 'Implementation must be an integer from 1 to 10', type: 'error' });
                            return;
                        }
                        if (!rationale) {
                            showToast({ message: 'An override rationale is required', type: 'error' });
                            return;
                        }

                        try {
                            await database.reviewPliAdjudication(row.id, {
                                status: 'overridden',
                                sme_reviewer: getReviewerName?.() || 'White Cell',
                                override_value: {
                                    implementation_score: implementationScore
                                },
                                override_rationale: rationale
                            });
                            showToast({ message: 'Override recorded as adjudication of record', type: 'success' });
                            modal.close();
                            await refresh();
                        } catch (err) {
                            logger.error('Failed to record PLI override:', err);
                            showToast({ message: 'Failed to record override', type: 'error' });
                        }
                    }
                }
            ]
        });
    }

    function destroy() {
        wrapper.remove();
    }

    return { refresh, destroy };
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export default createPliReview;
