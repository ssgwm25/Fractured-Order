/**
 * Theme-aware SVG renderers for the plenary board.
 */

import { escapeHtml } from '../pli/pliShared.js';
import {
    GLASL_LABELS,
    GLASL_OPERATING_MAX,
    GLASL_OPERATING_MIN,
    MACRO_INDICATORS,
    NI_DOMAIN_LABELS
} from './plenaryData.js';

const NI_SHORT_LABELS = Object.freeze({
    'NI-1': 'Homeland',
    'NI-2': 'Prosperity',
    'NI-3': 'Alliances',
    'NI-4': 'Indo-Pacific',
    'NI-5': 'Rules',
    'NI-6': 'Domestic'
});

function formatSigned(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n > 0 ? `+${n}` : String(n);
}

function actionSequenceLabel(index) {
    return `A${index + 1}`;
}

function pathOf(series, x, y) {
    return series
        .map((value, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(value).toFixed(1)}`)
        .join(' ');
}

function scaleLinear(min, max, start, end) {
    const span = max - min || 1;
    return (value) => start + ((value - min) / span) * (end - start);
}

/**
 * @param {string[]} periods
 * @param {Object} indicator
 * @param {{ width?: number, height?: number }} [options]
 */
export function indicatorLineChartSvg(periods, indicator, options = {}) {
    const width = options.width ?? 360;
    const height = options.height ?? 200;
    const pad = { top: 12, right: 10, bottom: 22, left: 36 };
    const n = Math.max(periods?.length || 0, 1);
    const base = (indicator?.baseline || []).map(Number);
    const postRaw = indicator?.post_action || indicator?.baseline || [];
    const post = postRaw.map(Number);
    while (base.length < n) base.push(base.length ? base[base.length - 1] : 0);
    while (post.length < n) post.push(post.length ? post[post.length - 1] : 0);
    const favDir = Number(indicator?.favorable_direction ?? 1);
    const allValues = base.slice(0, n).concat(post.slice(0, n));
    let min = Math.min(...allValues);
    let max = Math.max(...allValues);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        min = 0;
        max = 1;
    }
    if (max - min < 1) {
        const mid = (max + min) / 2;
        min = mid - 0.5;
        max = mid + 0.5;
    }
    const x = scaleLinear(0, Math.max(n - 1, 1), pad.left, width - pad.right);
    const y = scaleLinear(min, max, height - pad.bottom, pad.top);
    const fillSegments = [];
    for (let i = 0; i < n - 1; i += 1) {
        const signed = ((post[i] - base[i]) + (post[i + 1] - base[i + 1])) / 2 * favDir;
        if (Math.abs(signed) < 1e-9) continue;
        const fill = signed > 0 ? 'var(--color-success)' : 'var(--color-alert)';
        const opacity = signed > 0 ? 0.28 : 0.22;
        fillSegments.push(
            `<path d="M${x(i).toFixed(1)},${y(base[i]).toFixed(1)} L${x(i + 1).toFixed(1)},${y(base[i + 1]).toFixed(1)} L${x(i + 1).toFixed(1)},${y(post[i + 1]).toFixed(1)} L${x(i).toFixed(1)},${y(post[i]).toFixed(1)} Z" fill="${fill}" fill-opacity="${opacity}" stroke="none"/>`
        );
    }
    const periodList = Array.isArray(periods) && periods.length
        ? periods
        : Array.from({ length: n }, (_, i) => String(i));
    const labelEvery = Math.max(1, Math.floor(n / 6));
    const grid = periodList.map((period, i) => {
        const label = String(period);
        const show = label.endsWith('Q1') || (!label.includes('Q') && i % labelEvery === 0);
        const tick = show
            ? `<text x="${x(i)}" y="${height - 6}" font-size="8" text-anchor="middle" fill="var(--color-text-muted)">${escapeHtml(label.replace(/^20/, ''))}</text>`
            : '';
        return `<line x1="${x(i)}" y1="${pad.top}" x2="${x(i)}" y2="${height - pad.bottom}" stroke="var(--color-border)" stroke-width="1"/>${tick}`;
    }).join('');
    const yTicks = [min, (min + max) / 2, max].map((value) => (
        `<text x="${pad.left - 4}" y="${y(value) + 3}" font-size="8" text-anchor="end" fill="var(--color-text-muted)">${value.toFixed(1)}</text>`
    )).join('');
    const label = String(indicator?.label || 'Indicator');

    return `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)} baseline versus cumulative post-action" preserveAspectRatio="none">
            ${grid}
            ${yTicks}
            ${fillSegments.join('')}
            <path d="${pathOf(base.slice(0, n), x, y)}" fill="none" stroke="var(--color-navy)" stroke-width="2"/>
            <path d="${pathOf(post.slice(0, n), x, y)}" fill="none" stroke="var(--color-gold)" stroke-width="2" stroke-dasharray="5 3"/>
        </svg>
    `;
}

export function niDomainBarsSvg(domains = [], options = {}) {
    const width = options.width ?? 420;
    const rowH = options.rowHeight ?? 22;
    const pad = { top: 4, right: 48, bottom: 4, left: 118 };
    const height = pad.top + pad.bottom + Math.max(domains.length, 1) * rowH;
    const maxAbs = Math.max(2, ...domains.map((d) => Math.abs(Number(d.delta) || 0)));
    const x = scaleLinear(-maxAbs, maxAbs, pad.left, width - pad.right);
    const zero = x(0);
    const rows = domains.map((domain, i) => {
        const delta = Number(domain.delta) || 0;
        const y = pad.top + i * rowH + 4;
        const barX = delta >= 0 ? zero : x(delta);
        const barW = Math.abs(x(delta) - zero);
        const fill = delta > 0
            ? 'var(--color-success)'
            : (delta < 0 ? 'var(--color-alert)' : 'var(--color-border)');
        const stroke = domain.primary ? 'var(--color-gold)' : 'none';
        return `
            <text x="${pad.left - 8}" y="${y + 11}" font-size="10" text-anchor="end" fill="var(--color-text)">
                <title>${escapeHtml(`${domain.key}: ${domain.label || NI_DOMAIN_LABELS[domain.key] || ''}`)}</title>
                ${escapeHtml(domain.key)} ${escapeHtml(NI_SHORT_LABELS[domain.key] || domain.label || '')}${domain.primary ? ' ·' : ''}
            </text>
            <rect x="${barX.toFixed(1)}" y="${y}" width="${Math.max(barW, 1).toFixed(1)}" height="14" rx="3" fill="${fill}" fill-opacity="0.85" stroke="${stroke}" stroke-width="1.5"/>
            <text x="${width - pad.right + 6}" y="${y + 11}" font-size="10" font-weight="700" fill="var(--color-text)">${escapeHtml(formatSigned(delta))}</text>
        `;
    }).join('');

    return `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="National Interest domain deltas" preserveAspectRatio="xMidYMid meet">
            <line x1="${zero}" y1="${pad.top}" x2="${zero}" y2="${height - pad.bottom}" stroke="var(--color-border)" stroke-width="1"/>
            ${rows}
        </svg>
    `;
}

export function orientationSparklineSvg(points = [], options = {}) {
    const width = options.width ?? 420;
    const height = options.height ?? 72;
    const pad = { top: 10, right: 12, bottom: 18, left: 28 };
    if (!points.length) {
        return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Orientation net by finalized action"></svg>`;
    }
    const values = points.map((p) => Number(p.net) || 0);
    let min = Math.min(0, ...values);
    let max = Math.max(0, ...values);
    if (max - min < 1) {
        min -= 1;
        max += 1;
    }
    const x = scaleLinear(0, Math.max(points.length - 1, 1), pad.left, width - pad.right);
    const y = scaleLinear(min, max, height - pad.bottom, pad.top);
    const zeroY = y(0);
    const labels = points.map((_p, i) => (
        `<text x="${x(i)}" y="${height - 4}" font-size="8" text-anchor="middle" fill="var(--color-text-muted)">${actionSequenceLabel(i)}</text>`
    )).join('');
    return `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Orientation net by finalized action">
            <line x1="${pad.left}" y1="${zeroY}" x2="${width - pad.right}" y2="${zeroY}" stroke="var(--color-border)" stroke-width="1"/>
            <path d="${pathOf(values, x, y)}" fill="none" stroke="var(--color-navy)" stroke-width="2"/>
            ${values.map((value, i) => `<circle cx="${x(i)}" cy="${y(value)}" r="3" fill="var(--color-gold)"/>`).join('')}
            ${labels}
        </svg>
    `;
}

export function glaslLadderHtml(glasl = {}) {
    const current = Number(glasl.currentStage) || 4;
    const start = Number(glasl.startStage) || 4;
    const steps = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((stage) => {
        const classes = ['plenary-ladder-step'];
        if (stage >= GLASL_OPERATING_MIN && stage <= GLASL_OPERATING_MAX) classes.push('is-operating');
        if (stage === current) classes.push('is-current');
        const startMark = stage === start && stage !== current ? ' · start' : '';
        return `<li class="${classes.join(' ')}">
            <span class="plenary-ladder-index">${stage}</span>
            <span>${escapeHtml(GLASL_LABELS[stage] || '')}${escapeHtml(startMark)}</span>
        </li>`;
    }).join('');
    return `<ol class="plenary-ladder" aria-label="Glasl escalation ladder">${steps}</ol>`;
}

export function glaslStepChartSvg(points = [], options = {}) {
    const width = options.width ?? 420;
    const height = options.height ?? 110;
    const pad = { top: 10, right: 10, bottom: 20, left: 10 };
    if (!points.length) {
        return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Glasl trajectory"></svg>`;
    }
    const n = points.length;
    const x = scaleLinear(0, Math.max(n - 1, 1), pad.left, width - pad.right);
    const y = scaleLinear(1, 9, height - pad.bottom, pad.top);
    const values = points.map((p) => p.stageAfter);
    const teamColor = (team) => {
        if (team === 'blue') return 'var(--color-team-blue)';
        if (team === 'red') return 'var(--color-team-red)';
        if (team === 'green') return 'var(--color-team-green)';
        return 'var(--color-team-industry)';
    };
    const actionLabels = points.map((_p, i) => (
        `<text x="${x(i)}" y="${height - 4}" font-size="8" text-anchor="middle" fill="var(--color-text-muted)">${actionSequenceLabel(i)}</text>`
    )).join('');
    return `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Glasl stage across finalized actions">
            <path d="${pathOf(values, x, y)}" fill="none" stroke="var(--color-gold)" stroke-width="2"/>
            ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.stageAfter)}" r="3.5" fill="${teamColor(p.team)}"/>`).join('')}
            ${actionLabels}
        </svg>
    `;
}

export function macroCardsHtml(trend) {
    const periods = trend?.quarters || trend?.years || [];
    const indicators = trend?.indicators || {};
    return MACRO_INDICATORS.map((meta) => {
        const indicator = indicators[meta.key];
        if (!indicator || !Array.isArray(indicator.baseline) || !indicator.baseline.length) {
            return `
                <article class="plenary-panel">
                    <div class="plenary-panel-head">
                        <h3 class="plenary-panel-title">${escapeHtml(meta.label)}</h3>
                    </div>
                    <div class="plenary-panel-body">
                        <p class="plenary-panel-note">No stacked series in this scope.</p>
                    </div>
                </article>
            `;
        }
        const verdict = indicator.verdict || 'n/a';
        const tone = verdict === 'favorable' ? 'is-favorable' : (verdict === 'unfavorable' ? 'is-unfavorable' : 'is-neutral');
        return `
            <article class="plenary-panel">
                <div class="plenary-panel-head">
                    <h3 class="plenary-panel-title">${escapeHtml(indicator.label || meta.label)}</h3>
                    <span class="plenary-verdict ${tone}">${escapeHtml(String(verdict))}</span>
                </div>
                <div class="plenary-panel-body">
                    ${indicatorLineChartSvg(periods, { ...indicator, label: indicator.label || meta.label })}
                </div>
            </article>
        `;
    }).join('');
}
