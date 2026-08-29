/**
 * Plenary board DOM composition.
 */

import { escapeHtml } from '../pli/pliShared.js';
import {
    glaslLadderHtml,
    glaslStepChartSvg,
    macroCardsHtml,
    niDomainBarsSvg,
    orientationSparklineSvg
} from './plenaryCharts.js';

function connectStateHtml() {
    return `
        <div class="plenary-connect">
            <h2>Connect a session to this browser</h2>
            <p>Operator login lives in the White Cell tab. Use PLI Reports → Open Plenary Board so this projector tab receives the session. Only SME-finalized PLI outputs are projected.</p>
            <a class="btn btn-primary" href="./index.html">Open landing page</a>
        </div>
    `;
}

function emptyStateHtml() {
    return `
        <div class="plenary-empty">
            <h2>Waiting on finalized PLI outputs</h2>
            <p>The board updates when Macro, National Interest / Escalation, or Diplomacy seats are approved or overridden.</p>
        </div>
    `;
}

function teamActivityHtml(model) {
    const teams = model.teams || [];
    const bands = model.diplomacyBands || [];
    const rows = teams.map((team) => `
        <div class="plenary-team-row" data-team="${escapeHtml(team.id)}">
            <span><span class="plenary-team-swatch"></span>${escapeHtml(team.label)}</span>
            <div class="plenary-team-bar" aria-hidden="true"><span style="width:${Math.round((team.share || 0) * 100)}%"></span></div>
            <span class="plenary-team-count">${escapeHtml(String(team.count))}</span>
        </div>
    `).join('');
    const chips = bands.length
        ? bands.map((entry) => `
            <span class="plenary-band-chip">${escapeHtml(entry.band)} <strong>${escapeHtml(String(entry.count))}</strong></span>
        `).join('')
        : '<p class="plenary-panel-note">No Diplomacy Index bands in this scope.</p>';
    return `
        <article class="plenary-panel">
            <div class="plenary-panel-head">
                <h3 class="plenary-panel-title">Team activity</h3>
            </div>
            <div class="plenary-panel-body">
                <div class="plenary-team-list">${rows}</div>
                <h3 class="plenary-panel-title">Diplomacy Index</h3>
                <div class="plenary-bands">${chips}</div>
            </div>
        </article>
    `;
}

function boardHtml(model) {
    const ni = model.ni || {};
    const glasl = model.glasl || {};
    const macroNote = model.macroTrend?.action_count
        ? `Stacked across ${model.macroTrend.action_count} economic action${model.macroTrend.action_count === 1 ? '' : 's'}`
        : 'Baseline vs cumulative post-action';
    return `
        <section class="plenary-macro" aria-label="${escapeHtml(macroNote)}">
            ${macroCardsHtml(model.macroTrend)}
        </section>
        <section class="plenary-lower">
            <article class="plenary-panel">
                <div class="plenary-panel-head">
                    <h3 class="plenary-panel-title">${escapeHtml(ni.title || 'National Interest')}</h3>
                    <span class="plenary-panel-note">Cumulative domain deltas</span>
                </div>
                <div class="plenary-panel-body">
                    ${ni.hasData ? `
                        <div class="plenary-ni-layout">
                            ${niDomainBarsSvg(ni.domains)}
                            ${orientationSparklineSvg(ni.orientationByMove)}
                        </div>
                    ` : '<p class="plenary-panel-note">No finalized National Interest deltas in this scope.</p>'}
                </div>
            </article>
            <article class="plenary-panel">
                <div class="plenary-panel-head">
                    <h3 class="plenary-panel-title">Escalation (Glasl)</h3>
                    <span class="plenary-panel-note">Start ${escapeHtml(String(glasl.startStage || 4))} · range 4–7</span>
                </div>
                <div class="plenary-panel-body">
                    <div class="plenary-glasl-layout">
                        <div class="plenary-glasl-stage">
                            <div class="plenary-glasl-num">${escapeHtml(String(glasl.currentStage || 4))}</div>
                            <div class="plenary-glasl-caption">${escapeHtml(glasl.currentLabel || '')}</div>
                        </div>
                        ${glaslLadderHtml(glasl)}
                        <div class="plenary-glasl-chart">
                            ${glasl.hasData
                                ? glaslStepChartSvg(glasl.points)
                                : '<p class="plenary-panel-note">No finalized Glasl trajectory yet.</p>'}
                        </div>
                    </div>
                </div>
            </article>
            ${teamActivityHtml(model)}
        </section>
    `;
}

export function createPlenaryBoard(container) {
    if (!container) throw new Error('Container element is required');

    function render(view) {
        const mode = view?.mode || 'empty';
        if (mode === 'connect') {
            container.innerHTML = connectStateHtml();
            return;
        }
        if (mode === 'empty') {
            container.innerHTML = emptyStateHtml();
            return;
        }
        container.innerHTML = boardHtml(view.model || {});
    }

    function destroy() {
        container.innerHTML = '';
    }

    return { render, destroy };
}

export default createPlenaryBoard;
