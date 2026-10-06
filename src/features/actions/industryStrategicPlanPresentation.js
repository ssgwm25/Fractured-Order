const STANCE_LABELS = Object.freeze({
    1: 'Profit first',
    2: 'Profit leaning',
    3: 'Balanced',
    4: 'National interest leaning',
    5: 'National interest first'
});

function defaultEscapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function headingTag(level) {
    const normalized = Math.max(2, Math.min(6, Number(level) || 4));
    return `h${normalized}`;
}

function sectorSlug(value) {
    return String(value || 'sector').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function renderPriorityList(sector, priorities, escapeHtml, startIndex = 0) {
    const rows = (Array.isArray(priorities) ? priorities : []).map((priority, index) => `
        <li aria-label="${escapeHtml(`${sector} — Strategic Priority ${startIndex + index + 1}`)}">
            <strong>${escapeHtml(priority.priority || 'Not specified')}</strong>
            <span>${escapeHtml(priority.successLooksLike || 'Success measure not specified')}</span>
        </li>
    `).join('');
    return rows || '<li><strong>Not specified</strong><span>No success measure recorded</span></li>';
}

function renderRiskList(sector, risks, escapeHtml) {
    const rows = (Array.isArray(risks) ? risks : []).map((risk, index) => `
        <li aria-label="${escapeHtml(`${sector} — Risk ${index + 1}`)}">
            <strong>${escapeHtml(risk.risk || 'Not specified')}</strong>
            <span>${escapeHtml(`Likelihood ${risk.likelihood || 'not specified'}; impact ${risk.impact || 'not specified'}; tied to ${risk.cell || 'not specified'}`)}</span>
        </li>
    `).join('');
    return rows || '<li><strong>Not specified</strong><span>No risk detail recorded</span></li>';
}

function renderPartnerList(partners, escapeHtml) {
    const rows = (Array.isArray(partners) ? partners : []).map((partner) => `
        <li>
            <strong>${escapeHtml(partner.partner || 'Not specified')}</strong>
            <span>${escapeHtml(`Why: ${partner.whyTheyMatter || 'not specified'}; likely wants: ${partner.likelyWant || 'not specified'}`)}</span>
        </li>
    `).join('');
    return rows || '<li><strong>Not specified</strong><span>No partner detail recorded</span></li>';
}

export function renderIndustryStrategicPlanPositionView(viewModel = {}, {
    escapeHtml = defaultEscapeHtml,
    headingLevel = 4,
    openFirstSector = false,
    idPrefix = 'industry-position'
} = {}) {
    const display = viewModel.industryStrategicPlanDisplayModel;
    if (!viewModel.hasIndustryStrategicPlan || !display?.sectors?.length) return '';

    const sectionHeading = headingTag(headingLevel);
    const subsectionHeading = headingTag(Number(headingLevel) + 1);
    const safeIdPrefix = sectorSlug(idPrefix);
    const sectors = display.sectors.map((sectorPlan, index) => {
        const slug = sectorSlug(sectorPlan.sector);
        const headingId = `${safeIdPrefix}-${slug}`;
        const stance = STANCE_LABELS[sectorPlan.stance] || 'Not specified';
        const firstPriority = sectorPlan.priorities?.[0] || {};
        const firstEngagement = `${sectorPlan.firstAmbassadorTarget?.cell || 'Not specified'} — ${sectorPlan.firstAmbassadorTarget?.reason || 'No reason recorded'}`;

        return `
            <article class="industry-position-card" data-industry-position-sector="${escapeHtml(sectorPlan.sector)}" aria-labelledby="${escapeHtml(headingId)}">
                <header class="industry-position-card__header">
                    <div>
                        <p class="industry-position-card__eyebrow">Sector position</p>
                        <${sectionHeading} id="${escapeHtml(headingId)}">${escapeHtml(sectorPlan.sector)}</${sectionHeading}>
                    </div>
                    <span class="industry-position-card__stance"><span>Stance ${escapeHtml(String(sectorPlan.stance ?? '—'))}/5</span>${escapeHtml(stance)}</span>
                </header>

                <div class="industry-position-card__signal" aria-label="${escapeHtml(`${sectorPlan.sector} — Strategic Priority 1`)}">
                    <span>Leading priority</span>
                    <strong>${escapeHtml(firstPriority.priority || 'No priority recorded')}</strong>
                    <small>${escapeHtml(firstPriority.successLooksLike || 'Success measure not specified')}</small>
                </div>

                <section class="industry-position-card__section" aria-labelledby="${escapeHtml(headingId)}-priorities">
                    <${subsectionHeading} id="${escapeHtml(headingId)}-priorities">What this sector will protect</${subsectionHeading}>
                    <ol class="industry-position-list industry-position-list--priorities">
                        ${renderPriorityList(sectorPlan.sector, sectorPlan.priorities?.slice(1), escapeHtml, 1)}
                    </ol>
                </section>

                <dl class="industry-position-card__commitments">
                    <div>
                        <dt>Red line</dt>
                        <dd>${escapeHtml(sectorPlan.redLine || 'Not specified')}</dd>
                    </div>
                    <div>
                        <dt>First engagement</dt>
                        <dd>${escapeHtml(firstEngagement)}</dd>
                    </div>
                </dl>

                <details class="industry-position-card__support" ${openFirstSector && index === 0 ? 'open' : ''}>
                    <summary>Supporting assumptions and risks</summary>
                    <div class="industry-position-card__support-body">
                        <section aria-label="${escapeHtml(`${sectorPlan.sector} — Business Overview`)}">
                            <${subsectionHeading}>Business overview</${subsectionHeading}>
                            <p>${escapeHtml(sectorPlan.businessOverview || 'Not specified')}</p>
                        </section>
                        <section>
                            <${subsectionHeading}>Expected Red priorities</${subsectionHeading}>
                            <p>${escapeHtml(sectorPlan.redPriorities || 'Not specified')}</p>
                        </section>
                        <section>
                            <${subsectionHeading}>Risks to watch</${subsectionHeading}>
                            <ul class="industry-position-list">${renderRiskList(sectorPlan.sector, sectorPlan.risks, escapeHtml)}</ul>
                        </section>
                        <section>
                            <${subsectionHeading}>Partner map</${subsectionHeading}>
                            <ul class="industry-position-list">${renderPartnerList(sectorPlan.partners, escapeHtml)}</ul>
                        </section>
                    </div>
                </details>
            </article>
        `;
    }).join('');

    return `
        <section class="industry-position-view" aria-label="Industry sector position comparison">
            <header class="industry-position-view__intro">
                <div>
                    <p class="industry-position-view__eyebrow">Sector position comparison</p>
                    <p>Read across the three sectors to see what each is prioritizing, where it will not compromise, and whom it intends to engage first.</p>
                </div>
                <div class="industry-position-view__shared-read">
                    <span>Shared Blue forecast</span>
                    <strong>${escapeHtml(display.blueForecast || 'Not specified')}</strong>
                </div>
            </header>
            ${display.isLegacy ? '<p class="industry-position-view__notice" role="status">Historical one-sector plan. It does not satisfy the current three-sector requirement.</p>' : ''}
            <div class="industry-position-grid">${sectors}</div>
        </section>
    `;
}
