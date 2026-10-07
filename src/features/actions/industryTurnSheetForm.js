import {
    INDUSTRY_ACTION_CODES,
    INDUSTRY_ASK_OPTIONS,
    INDUSTRY_COUNTERPARTIES,
    INDUSTRY_DECISION_STATUSES,
    INDUSTRY_EFFECT_DIMENSIONS,
    INDUSTRY_EFFECT_DIRECTIONS,
    INDUSTRY_EFFECT_MAGNITUDES,
    INDUSTRY_EFFECT_PATTERNS,
    INDUSTRY_EFFECT_TIMINGS,
    INDUSTRY_ENVIRONMENT_ACTORS,
    INDUSTRY_ESCALATION_MARKERS,
    INDUSTRY_LOCATION_OPTIONS,
    INDUSTRY_OFFER_OPTIONS,
    INDUSTRY_PLANNED_ACTIONS,
    INDUSTRY_PRIMARY_MOVES,
    INDUSTRY_RISK_MOVEMENTS,
    INDUSTRY_RISK_TYPES,
    INDUSTRY_STANCE_OPTIONS,
    INDUSTRY_SUPPLY_CHAIN_STAGES,
    INDUSTRY_TURN_SHEET_SECTORS,
    INDUSTRY_VISIBILITY,
    buildIndustryTurnSheetDisplayModel,
    getIndustrySectorConfig,
    normalizeIndustryTurnSheet
} from './industryTurnSheet.js';

const titleCase = (value = '') => String(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function optionMarkup(options, selected, escapeHtml, placeholder = 'Select one') {
    return `<option value="">${escapeHtml(placeholder)}</option>${options.map((option) => {
        const value = typeof option === 'string' ? option : option.value;
        const label = typeof option === 'string' ? titleCase(option) : option.label;
        return `<option value="${escapeHtml(String(value))}" ${String(selected) === String(value) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('')}`;
}

function checks({ name, options, selected = [], escapeHtml, field, prefix = 'ts' }) {
    return `<div class="industry-turn-sheet-check-grid" data-ts-field="${escapeHtml(field)}">${options.map((option, index) => {
        const value = typeof option === 'string' ? option : option.value;
        const label = typeof option === 'string' ? titleCase(option) : option.label;
        const inputId = `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, '-')}-${index}`;
        return `<label class="form-check form-check-card" for="${escapeHtml(inputId)}">
            <input id="${escapeHtml(inputId)}" type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(String(value))}" ${selected.includes(value) ? 'checked' : ''}>
            <span class="form-check-label">${escapeHtml(label)}</span>
        </label>`;
    }).join('')}</div>`;
}

function radios({ name, options, selected, escapeHtml, field, prefix = 'ts' }) {
    return `<div class="industry-turn-sheet-radio-grid" data-ts-field="${escapeHtml(field)}">${options.map((option, index) => {
        const value = typeof option === 'object' ? option.value : option;
        const label = typeof option === 'object' ? option.label : titleCase(option);
        const inputId = `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, '-')}-${index}`;
        return `<label class="form-check form-check-card" for="${escapeHtml(inputId)}">
            <input id="${escapeHtml(inputId)}" type="radio" name="${escapeHtml(name)}" value="${escapeHtml(String(value))}" ${String(selected) === String(value) ? 'checked' : ''}>
            <span class="form-check-label">${escapeHtml(label)}</span>
        </label>`;
    }).join('')}</div>`;
}

function field({ path, label, value = '', escapeHtml, textarea = false, hint = '', required = true, type = 'text' }) {
    const id = `ts-${path.replace(/[^a-z0-9]+/gi, '-')}`;
    return `<div class="form-group" data-ts-field="${escapeHtml(path)}">
        <label class="form-label" for="${escapeHtml(id)}">${escapeHtml(label)}${required ? ' <span class="required-indicator">*</span>' : ''}</label>
        ${textarea
            ? `<textarea id="${escapeHtml(id)}" class="form-input form-textarea" name="${escapeHtml(path)}" rows="3" data-ts-control="${escapeHtml(path)}"${required ? ' required aria-required="true"' : ''}${hint ? ` aria-describedby="${escapeHtml(id)}-hint"` : ''}>${escapeHtml(value)}</textarea>`
            : `<input id="${escapeHtml(id)}" class="form-input" type="${escapeHtml(type)}" name="${escapeHtml(path)}" value="${escapeHtml(value)}" data-ts-control="${escapeHtml(path)}"${required ? ' required aria-required="true"' : ''}${hint ? ` aria-describedby="${escapeHtml(id)}-hint"` : ''}>`}
        ${hint ? `<p class="form-hint" id="${escapeHtml(id)}-hint">${escapeHtml(hint)}</p>` : ''}
    </div>`;
}

function selectField({ path, label, options, selected = '', escapeHtml, hint = '', required = true }) {
    const id = `ts-${path.replace(/[^a-z0-9]+/gi, '-')}`;
    return `<div class="form-group" data-ts-field="${escapeHtml(path)}">
        <label class="form-label" for="${escapeHtml(id)}">${escapeHtml(label)}${required ? ' <span class="required-indicator">*</span>' : ''}</label>
        <select id="${escapeHtml(id)}" class="form-input" name="${escapeHtml(path)}" data-ts-control="${escapeHtml(path)}"${required ? ' required aria-required="true"' : ''}${hint ? ` aria-describedby="${escapeHtml(id)}-hint"` : ''}>${optionMarkup(options, selected, escapeHtml)}</select>
        ${hint ? `<p class="form-hint" id="${escapeHtml(id)}-hint">${escapeHtml(hint)}</p>` : ''}
    </div>`;
}

function optionLabel(options, value) {
    return options.find((option) => (
        typeof option === 'string' ? option === value : option.value === value
    ))?.label || titleCase(value) || 'Not recorded';
}

export function renderIndustryBaselineReference(input = {}, {
    industryLabel = 'Industry',
    move = 1,
    escapeHtml = (value) => String(value ?? '')
} = {}) {
    const baseline = normalizeIndustryTurnSheet(input);
    const proposalNumber = baseline.proposalOrdinalForIndustryMove || 1;
    const baselineId = baseline.proposalId || baseline.environmentBaselineProposalId || '';
    const impactLabels = {
        '-2': 'Major harm',
        '-1': 'Harm',
        0: 'Neutral',
        1: 'Benefit',
        2: 'Major benefit'
    };
    const environmentRows = baseline.environment.actors.map((actor) => {
        const actorLabel = optionLabel(INDUSTRY_ENVIRONMENT_ACTORS, actor.actor);
        const codes = actor.actionCodes.map((code) => optionLabel(INDUSTRY_ACTION_CODES, code));
        const actionSummary = [
            codes.join(', ') || 'Not recorded',
            actor.otherActionDescription || ''
        ].filter(Boolean).join(' - ');
        const impact = actor.interestImpact == null
            ? 'Not recorded'
            : `${actor.interestImpact > 0 ? '+' : ''}${actor.interestImpact} - ${impactLabels[actor.interestImpact]}`;
        return `<section class="industry-turn-sheet-card">
            <h4>${escapeHtml(actorLabel)}</h4>
            <dl class="industry-turn-sheet-context-list">
                <div><dt>Action codes</dt><dd>${escapeHtml(actionSummary)}</dd></div>
                <div><dt>What they did / will do</dt><dd>${escapeHtml(actor.actionNarrative || 'Not recorded')}</dd></div>
                <div><dt>Impact on firm interests</dt><dd>${escapeHtml(impact)}</dd></div>
                <div><dt>Confidence</dt><dd>${escapeHtml(titleCase(actor.confidence) || 'Not recorded')}</dd></div>
                <div><dt>Matched forecast</dt><dd>${escapeHtml(titleCase(actor.matchedForecast) || 'Not recorded')}</dd></div>
            </dl>
        </section>`;
    }).join('');
    const supplyRows = baseline.supplyChain.stages.map((stage) => {
        const stageLabel = optionLabel(INDUSTRY_SUPPLY_CHAIN_STAGES, stage.stage);
        const locations = stage.whereWho.map((value) => optionLabel(INDUSTRY_LOCATION_OPTIONS, value));
        const locationSummary = [
            locations.join(', ') || 'Not recorded',
            stage.otherLocationDescription || ''
        ].filter(Boolean).join(' - ');
        return `<section class="industry-turn-sheet-card">
            <h4>${escapeHtml(stageLabel)}</h4>
            <dl class="industry-turn-sheet-context-list">
                <div><dt>Where / who</dt><dd>${escapeHtml(locationSummary)}</dd></div>
                <div><dt>Red dependency</dt><dd>${escapeHtml(titleCase(stage.redDependency) || 'Not recorded')}</dd></div>
                <div><dt>Planned actions</dt><dd>${escapeHtml(stage.plannedActions.map(titleCase).join(', ') || 'Not recorded')}</dd></div>
                <div><dt>Notes</dt><dd>${escapeHtml(stage.notes || 'Not recorded')}</dd></div>
            </dl>
        </section>`;
    }).join('');

    return `<div class="industry-turn-sheet-context-banner" data-ts-baseline-proposal-id="${escapeHtml(baselineId)}">
        <h3>Environment and Supply Chain baseline</h3>
        <p>Using the ${escapeHtml(industryLabel)} Move ${escapeHtml(String(move))} baseline from Proposal ${escapeHtml(String(proposalNumber))}.</p>
        <p class="form-hint"><strong>Read-only:</strong> this proposal references the completed baseline and cannot change it.</p>
        <details>
            <summary>View complete baseline details</summary>
            <section aria-labelledby="ts-baseline-environment-heading">
                <h4 id="ts-baseline-environment-heading">Environment Read</h4>
                <div class="industry-turn-sheet-review-grid">${environmentRows}</div>
                <dl class="industry-turn-sheet-context-list">
                    <div><dt>Biggest surprise this move</dt><dd>${escapeHtml(baseline.environment.biggestSurprise || 'Not recorded')}</dd></div>
                </dl>
            </section>
            <section aria-labelledby="ts-baseline-supply-heading">
                <h4 id="ts-baseline-supply-heading">Supply Chain Exposure</h4>
                <div class="industry-turn-sheet-review-grid">${supplyRows}</div>
                <dl class="industry-turn-sheet-context-list">
                    <div><dt>Weakest link right now</dt><dd>${escapeHtml(baseline.supplyChain.weakestLink || 'Not recorded')}</dd></div>
                    <div><dt>Change since last move</dt><dd>${escapeHtml(titleCase(baseline.supplyChain.changeSinceLastMove) || 'Not recorded')}</dd></div>
                </dl>
            </section>
        </details>
    </div>`;
}

function renderEnvironment(sheet, escapeHtml) {
    return `<section aria-labelledby="ts-environment-heading">
        <h3 id="ts-environment-heading">Environment Read</h3>
        <p class="form-hint">Record what each actor did, the effect on firm interests, and how closely it matched the prior forecast.</p>
        ${sheet.environment.actors.map((actor) => {
            const config = INDUSTRY_ENVIRONMENT_ACTORS.find(({ value }) => value === actor.actor);
            const prefix = `environment.actors.${actor.actor}`;
            return `<fieldset class="industry-turn-sheet-card">
                <legend>${escapeHtml(config?.label || actor.actor)}</legend>
                <div class="form-group"><span class="form-label">Action codes <span class="required-indicator">*</span></span>
                    ${checks({ name: `ts-env-${actor.actor}-codes`, options: INDUSTRY_ACTION_CODES, selected: actor.actionCodes, escapeHtml, field: `${prefix}.actionCodes`, prefix: `ts-env-${actor.actor}` })}
                </div>
                ${field({ path: `${prefix}.otherActionDescription`, label: 'Describe other action', value: actor.otherActionDescription, escapeHtml, required: false })}
                ${field({ path: `${prefix}.actionNarrative`, label: 'What they did / will do', value: actor.actionNarrative, escapeHtml, textarea: true })}
                <div class="industry-turn-sheet-grid industry-turn-sheet-grid--three">
                    ${selectField({ path: `${prefix}.interestImpact`, label: 'Impact on firm interests', options: [-2, -1, 0, 1, 2].map((value) => ({ value, label: ({ '-2': '−2 — Major harm', '-1': '−1 — Harm', 0: '0 — Neutral', 1: '+1 — Benefit', 2: '+2 — Major benefit' })[value] })), selected: actor.interestImpact ?? '', escapeHtml })}
                    ${selectField({ path: `${prefix}.confidence`, label: 'Confidence', options: ['low', 'medium', 'high'], selected: actor.confidence, escapeHtml })}
                    ${selectField({ path: `${prefix}.matchedForecast`, label: 'Matched my forecast', options: ['yes', 'partly', 'no'], selected: actor.matchedForecast, escapeHtml })}
                </div>
            </fieldset>`;
        }).join('')}
        ${field({ path: 'environment.biggestSurprise', label: 'Biggest surprise this move', value: sheet.environment.biggestSurprise, escapeHtml, textarea: true })}
    </section>`;
}

function renderSupplyChain(sheet, escapeHtml) {
    return `<section aria-labelledby="ts-supply-heading">
        <h3 id="ts-supply-heading">Supply Chain Exposure</h3>
        ${sheet.supplyChain.stages.map((stage) => {
            const config = INDUSTRY_SUPPLY_CHAIN_STAGES.find(({ value }) => value === stage.stage);
            const prefix = `supplyChain.stages.${stage.stage}`;
            return `<fieldset class="industry-turn-sheet-card">
                <legend>${escapeHtml(config?.label || stage.stage)}</legend>
                <div class="form-group"><span class="form-label">Where / who <span class="required-indicator">*</span></span>
                    ${checks({ name: `ts-stage-${stage.stage}-where`, options: INDUSTRY_LOCATION_OPTIONS, selected: stage.whereWho, escapeHtml, field: `${prefix}.whereWho`, prefix: `ts-stage-${stage.stage}-where` })}
                </div>
                ${field({ path: `${prefix}.otherLocationDescription`, label: 'Other location or actor', value: stage.otherLocationDescription, escapeHtml, required: false })}
                <div class="industry-turn-sheet-grid industry-turn-sheet-grid--two">
                    ${selectField({ path: `${prefix}.redDependency`, label: 'Red dependency', options: ['low', 'medium', 'high'], selected: stage.redDependency, escapeHtml })}
                    <div class="form-group"><span class="form-label">Planned actions <span class="required-indicator">*</span></span>
                        ${checks({ name: `ts-stage-${stage.stage}-actions`, options: INDUSTRY_PLANNED_ACTIONS, selected: stage.plannedActions, escapeHtml, field: `${prefix}.plannedActions`, prefix: `ts-stage-${stage.stage}-action` })}
                    </div>
                </div>
                ${field({ path: `${prefix}.notes`, label: 'Notes', value: stage.notes, escapeHtml, textarea: true })}
            </fieldset>`;
        }).join('')}
        <div class="industry-turn-sheet-grid industry-turn-sheet-grid--two">
            ${field({ path: 'supplyChain.weakestLink', label: 'Weakest link right now', value: sheet.supplyChain.weakestLink, escapeHtml, textarea: true })}
            ${selectField({ path: 'supplyChain.changeSinceLastMove', label: 'Change since last move', options: ['better', 'same', 'worse'], selected: sheet.supplyChain.changeSinceLastMove, escapeHtml })}
        </div>
    </section>`;
}

function renderStakeholder(sheet, key, label, escapeHtml) {
    const value = sheet.decision.stakeholderValue[key];
    const prefix = `decision.stakeholderValue.${key}`;
    return `<fieldset class="industry-turn-sheet-card"><legend>${escapeHtml(label)}</legend>
        ${key === 'other' ? field({ path: `${prefix}.name`, label: 'Stakeholder name', value: value.name, escapeHtml }) : ''}
        <div class="industry-turn-sheet-grid industry-turn-sheet-grid--two">
            ${field({ path: `${prefix}.gain`, label: 'What they gain', value: value.gain, escapeHtml, textarea: true })}
            ${field({ path: `${prefix}.giveUpOrRisk`, label: 'What they give up or risk', value: value.giveUpOrRisk, escapeHtml, textarea: true })}
        </div>
        ${selectField({ path: `${prefix}.net`, label: 'Net value', options: ['positive', 'neutral', 'negative'], selected: value.net, escapeHtml })}
    </fieldset>`;
}

function renderDecision(sheet, strategicPlan, contexts, escapeHtml) {
    const allPriorities = INDUSTRY_TURN_SHEET_SECTORS.flatMap(({ value, label, strategicPlanKey }) => (
        strategicPlan?.sectorPlans?.[strategicPlanKey]?.strategicPriorities || []
    ).map((priority) => ({ value: priority.id, label: `${label}: ${priority.priority}`, industry: value })));
    const allPriorDecisions = INDUSTRY_TURN_SHEET_SECTORS.flatMap(({ value, label }) => (
        contexts[value]?.eligiblePriorDecisions || []
    ).map((decision) => ({ ...decision, industry: value, industryLabel: label })));
    return `<section aria-labelledby="ts-decision-heading">
        <h3 id="ts-decision-heading">Decision</h3>
        <fieldset class="form-group"><legend class="form-label">Intended recipients <span class="required-indicator">*</span></legend>
            ${checks({ name: 'ts-recipients', options: [{ value: 'blue', label: 'Blue' }, { value: 'red', label: 'Red' }], selected: sheet.recipientTeams, escapeHtml, field: 'recipientTeams', prefix: 'ts-recipient' })}
            <p class="form-hint">Required to save a draft or forward. Select Blue, Red, or both; White Cell reviews each recipient independently.</p>
        </fieldset>
        <fieldset class="form-group"><legend class="form-label">Coordinated with another Industry sector? <span class="required-indicator">*</span></legend>
            ${radios({ name: 'ts-coordinated', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], selected: sheet.decision.coordinatedWithOtherSector, escapeHtml, field: 'decision.coordinatedWithOtherSector', prefix: 'ts-coordinated' })}
        </fieldset>
        <div class="form-group" data-ts-coordinated-sectors><span class="form-label">Coordinated sectors</span>
            ${checks({ name: 'ts-coordinated-sectors', options: INDUSTRY_TURN_SHEET_SECTORS, selected: sheet.decision.coordinatedSectors, escapeHtml, field: 'decision.coordinatedSectors', prefix: 'ts-coordinated-sector' })}
        </div>
        <div class="industry-turn-sheet-grid industry-turn-sheet-grid--two">
            ${selectField({ path: 'decision.status', label: 'Decision status', options: INDUSTRY_DECISION_STATUSES, selected: sheet.decision.status, escapeHtml })}
            <div class="form-group" data-ts-field="decision.priorDecisionId"><label class="form-label" for="ts-decision-prior">Prior completed decision</label>
                <select id="ts-decision-prior" class="form-input" name="decision.priorDecisionId" data-ts-control="decision.priorDecisionId"><option value="">Select one</option>${allPriorDecisions.map((decision) => `<option value="${escapeHtml(decision.id)}" data-ts-industry="${escapeHtml(decision.industry)}" ${sheet.decision.priorDecisionId === decision.id ? 'selected' : ''}>${escapeHtml(`${decision.industryLabel} — Move ${decision.move}, Proposal ${decision.ordinal}: ${decision.title}`)}</option>`).join('')}</select>
            </div>
            ${selectField({ path: 'decision.primaryMove', label: 'Primary move', options: INDUSTRY_PRIMARY_MOVES, selected: sheet.decision.primaryMove, escapeHtml })}
            ${field({ path: 'decision.otherPrimaryMove', label: 'Describe other primary move', value: sheet.decision.otherPrimaryMove, escapeHtml, required: false })}
            ${selectField({ path: 'decision.counterparty.type', label: 'Counterparty category', options: INDUSTRY_COUNTERPARTIES, selected: sheet.decision.counterparty.type, escapeHtml })}
            ${field({ path: 'decision.counterparty.names', label: 'Counterparty names', value: sheet.decision.counterparty.names.join('\n'), escapeHtml, textarea: true, hint: 'Enter one organization or actor per line.' })}
            ${selectField({ path: 'decision.capitalCommitment', label: 'Capital commitment', options: ['low', 'medium', 'high'], selected: sheet.decision.capitalCommitment, escapeHtml })}
            ${selectField({ path: 'decision.visibility', label: 'Visibility', options: INDUSTRY_VISIBILITY, selected: sheet.decision.visibility, escapeHtml })}
        </div>
        <div class="industry-turn-sheet-grid industry-turn-sheet-grid--two">
            <fieldset class="form-group"><legend class="form-label">Ask <span class="required-indicator">*</span></legend>${checks({ name: 'ts-ask', options: INDUSTRY_ASK_OPTIONS, selected: sheet.decision.ask, escapeHtml, field: 'decision.ask', prefix: 'ts-ask' })}</fieldset>
            <fieldset class="form-group"><legend class="form-label">Offer <span class="required-indicator">*</span></legend>${checks({ name: 'ts-offer', options: INDUSTRY_OFFER_OPTIONS, selected: sheet.decision.offer, escapeHtml, field: 'decision.offer', prefix: 'ts-offer' })}</fieldset>
        </div>
        <div class="industry-turn-sheet-grid industry-turn-sheet-grid--two">
            ${field({ path: 'decision.askOtherDescription', label: 'Describe other ask', value: sheet.decision.askOtherDescription, escapeHtml, required: false })}
            ${field({ path: 'decision.offerOtherDescription', label: 'Describe other offer', value: sheet.decision.offerOtherDescription, escapeHtml, required: false })}
        </div>
        <h4>Stakeholder value</h4>
        ${renderStakeholder(sheet, 'blue', 'Blue', escapeHtml)}
        ${renderStakeholder(sheet, 'counterparty', 'Counterparty', escapeHtml)}
        ${renderStakeholder(sheet, 'other', 'Other stakeholder', escapeHtml)}
        ${field({ path: 'decision.intendedEffect', label: 'Intended effect', value: sheet.decision.intendedEffect, escapeHtml, textarea: true })}
        ${field({ path: 'decision.rationale', label: 'Rationale', value: sheet.decision.rationale, escapeHtml, textarea: true, hint: 'Explain how this decision serves the industry’s objectives.' })}
        ${field({ path: 'decision.implementation', label: 'Implementation', value: sheet.decision.implementation, escapeHtml, textarea: true })}
        <fieldset class="form-group"><legend class="form-label">Strategic priority alignment <span class="required-indicator">*</span></legend>
            <div class="industry-turn-sheet-check-grid" data-ts-field="linkedStrategicPriorityIds">${allPriorities.map((priority, index) => `<label class="form-check form-check-card" for="ts-priority-${index}"><input id="ts-priority-${index}" type="checkbox" name="ts-priorities" value="${escapeHtml(priority.value)}" data-ts-industry="${escapeHtml(priority.industry)}" ${sheet.linkedStrategicPriorityIds.includes(priority.value) ? 'checked' : ''}><span class="form-check-label">${escapeHtml(priority.label)}</span></label>`).join('')}</div>
        </fieldset>
    </section>`;
}

function renderEffects(sheet, escapeHtml) {
    return `<section aria-labelledby="ts-effects-heading"><h3 id="ts-effects-heading">Expected Effects</h3>
        ${INDUSTRY_EFFECT_DIMENSIONS.map(({ value, label }) => {
            const effect = sheet.expectedEffects[value];
            const prefix = `expectedEffects.${value}`;
            return `<fieldset class="industry-turn-sheet-card"><legend>${escapeHtml(label)}</legend>
                <div class="industry-turn-sheet-grid industry-turn-sheet-grid--four">
                    ${selectField({ path: `${prefix}.direction`, label: 'Direction', options: INDUSTRY_EFFECT_DIRECTIONS, selected: effect.direction, escapeHtml })}
                    ${selectField({ path: `${prefix}.magnitude`, label: 'Magnitude', options: INDUSTRY_EFFECT_MAGNITUDES, selected: effect.magnitude, escapeHtml })}
                    ${selectField({ path: `${prefix}.timing`, label: 'Timing', options: INDUSTRY_EFFECT_TIMINGS, selected: effect.timing, escapeHtml })}
                    ${selectField({ path: `${prefix}.pattern`, label: 'Pattern', options: INDUSTRY_EFFECT_PATTERNS, selected: effect.pattern, escapeHtml })}
                </div>
            </fieldset>`;
        }).join('')}
        <fieldset class="form-group"><legend class="form-label">Escalation markers <span class="required-indicator">*</span></legend>
            ${checks({ name: 'ts-escalation', options: INDUSTRY_ESCALATION_MARKERS, selected: sheet.escalationMarkers, escapeHtml, field: 'escalationMarkers', prefix: 'ts-escalation' })}
        </fieldset>
        ${field({ path: 'escalationRationale', label: 'Escalation rationale', value: sheet.escalationRationale, escapeHtml, textarea: true })}
    </section>`;
}

function engagementSelect(direction, engagement, options, escapeHtml) {
    const directionOptions = options.filter((option) => option.direction === direction);
    return `<fieldset class="industry-turn-sheet-card"><legend>${direction === 'outbound' ? 'Outbound' : 'Inbound'} engagement</legend>
        ${radios({ name: `ts-${direction}-engaged`, options: [{ value: true, label: 'Link an engagement' }, { value: false, label: `No ${direction} engagement` }], selected: engagement.engaged, escapeHtml, field: `engagement.${direction}.engaged`, prefix: `ts-${direction}-engaged` })}
        ${selectField({ path: `engagement.${direction}.linkedRecordId`, label: 'PLENUM record', options: directionOptions.map((option) => ({ value: option.id, label: `${option.recordType === 'proposal_thread' ? 'Proposal thread' : 'Message'}: ${option.label}` })), selected: engagement.linkedRecordId || '', escapeHtml, required: false })}
        ${field({ path: `engagement.${direction}.outcome`, label: 'Industry interpretation / outcome', value: engagement.outcome || '', escapeHtml, textarea: true, required: false })}
    </fieldset>`;
}

function renderRisks(sheet, escapeHtml) {
    const rows = [0, 1, 2].map((index) => sheet.risks[index] || { id: '', priorRiskId: null, type: '', otherDescription: '', likelihood: '', impact: '', mitigation: '', movementStatus: 'new' });
    return `<section aria-labelledby="ts-risks-heading"><h3 id="ts-risks-heading">Move-Level Risks</h3>
        <p class="form-hint">Complete one to three rows. New risks keep the status New; carried risks preserve their prior risk ID.</p>
        ${rows.map((risk, index) => {
            const prefix = `risks.${index}`;
            return `<fieldset class="industry-turn-sheet-card" data-ts-risk-row="${index}"><legend>Risk ${index + 1}${index ? ' (optional)' : ''}</legend>
                <input type="hidden" name="${prefix}.id" value="${escapeHtml(risk.id || '')}">
                <input type="hidden" name="${prefix}.priorRiskId" value="${escapeHtml(risk.priorRiskId || '')}">
                <div class="industry-turn-sheet-grid industry-turn-sheet-grid--three">
                    ${selectField({ path: `${prefix}.type`, label: 'Type', options: INDUSTRY_RISK_TYPES, selected: risk.type, escapeHtml, required: index === 0 })}
                    ${selectField({ path: `${prefix}.likelihood`, label: 'Likelihood', options: ['low', 'medium', 'high'], selected: risk.likelihood, escapeHtml, required: index === 0 })}
                    ${selectField({ path: `${prefix}.impact`, label: 'Impact', options: ['low', 'medium', 'high'], selected: risk.impact, escapeHtml, required: index === 0 })}
                </div>
                ${field({ path: `${prefix}.otherDescription`, label: 'Describe other risk', value: risk.otherDescription, escapeHtml, required: false })}
                <div class="industry-turn-sheet-grid industry-turn-sheet-grid--two">
                    ${field({ path: `${prefix}.mitigation`, label: 'Mitigation', value: risk.mitigation, escapeHtml, textarea: true, required: index === 0 })}
                    ${selectField({ path: `${prefix}.movementStatus`, label: 'Movement status', options: risk.priorRiskId ? INDUSTRY_RISK_MOVEMENTS.filter((value) => value !== 'new') : ['new'], selected: risk.movementStatus, escapeHtml, required: index === 0 })}
                </div>
            </fieldset>`;
        }).join('')}
    </section>`;
}

function renderForecasts(sheet, escapeHtml) {
    return `<section aria-labelledby="ts-forecast-heading"><h3 id="ts-forecast-heading">Next-Move Forecast</h3>
        ${INDUSTRY_ENVIRONMENT_ACTORS.map(({ value, label }) => {
            const forecast = sheet.nextMoveForecasts[value];
            const prefix = `nextMoveForecasts.${value}`;
            return `<fieldset class="industry-turn-sheet-card"><legend>${escapeHtml(label)}</legend>
                ${checks({ name: `ts-forecast-${value}-codes`, options: INDUSTRY_ACTION_CODES, selected: forecast.actionCodes, escapeHtml, field: `${prefix}.actionCodes`, prefix: `ts-forecast-${value}` })}
                ${field({ path: `${prefix}.otherActionDescription`, label: 'Describe other action', value: forecast.otherActionDescription, escapeHtml, required: false })}
                ${field({ path: `${prefix}.explanation`, label: 'Forecast explanation', value: forecast.explanation, escapeHtml, textarea: true })}
            </fieldset>`;
        }).join('')}
    </section>`;
}

function renderPageThree(sheet, engagements, canEditFacilitatorNote, escapeHtml) {
    const spillovers = [0, 1, 2].map((index) => sheet.otherSectorSpillover.entries[index] || { affectedSector: '', direction: '', explanation: '' });
    return `<section aria-labelledby="ts-engagement-heading"><h3 id="ts-engagement-heading">Engagement</h3>
        <div class="industry-turn-sheet-grid industry-turn-sheet-grid--two">
            ${engagementSelect('outbound', sheet.engagement.outbound, engagements, escapeHtml)}
            ${engagementSelect('inbound', sheet.engagement.inbound, engagements, escapeHtml)}
        </div>
        <fieldset class="form-group"><legend class="form-label">Has the counterparty been consulted? <span class="required-indicator">*</span></legend>
            ${radios({ name: 'ts-partner-check', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], selected: sheet.engagement.partnerCheckComplete, escapeHtml, field: 'engagement.partnerCheckComplete', prefix: 'ts-partner-check' })}
        </fieldset>
    </section>
    ${renderRisks(sheet, escapeHtml)}
    <section aria-labelledby="ts-effects-security-heading"><h3 id="ts-effects-security-heading">Security and Spillover</h3>
        ${selectField({ path: 'ipSecurityEffect', label: 'IP / security effect', options: [{ value: 'reduces', label: 'Reduces risk' }, { value: 'no_change', label: 'No change' }, { value: 'raises', label: 'Raises risk' }], selected: sheet.ipSecurityEffect, escapeHtml })}
        <fieldset class="form-group"><legend class="form-label">External-sector spillover <span class="required-indicator">*</span></legend>
            ${radios({ name: 'ts-spillover', options: [{ value: true, label: 'Material spillover' }, { value: false, label: 'No material external-sector spillover' }], selected: sheet.otherSectorSpillover.hasMaterialSpillover, escapeHtml, field: 'otherSectorSpillover.hasMaterialSpillover', prefix: 'ts-spillover' })}
        </fieldset>
        <div data-ts-spillover-entries>${spillovers.map((entry, index) => `<fieldset class="industry-turn-sheet-card" data-ts-spillover-row="${index}"><legend>Spillover ${index + 1}${index ? ' (optional)' : ''}</legend>
            <div class="industry-turn-sheet-grid industry-turn-sheet-grid--three">
                ${field({ path: `otherSectorSpillover.entries.${index}.affectedSector`, label: 'Affected sector', value: entry.affectedSector, escapeHtml, required: index === 0 })}
                ${selectField({ path: `otherSectorSpillover.entries.${index}.direction`, label: 'Direction', options: ['positive', 'neutral', 'negative', 'mixed'], selected: entry.direction, escapeHtml, required: index === 0 })}
                ${field({ path: `otherSectorSpillover.entries.${index}.explanation`, label: 'Explanation', value: entry.explanation, escapeHtml, textarea: true, required: index === 0 })}
            </div></fieldset>`).join('')}</div>
    </section>
    <section aria-labelledby="ts-stance-heading"><h3 id="ts-stance-heading">Strategic Stance</h3>
        ${selectField({ path: 'stance', label: 'Current stance', options: INDUSTRY_STANCE_OPTIONS, selected: sheet.stance ?? '', escapeHtml })}
        <fieldset class="form-group"><legend class="form-label">Did Blue make serving business and national interests harder? <span class="required-indicator">*</span></legend>
            ${radios({ name: 'ts-blue-harder', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], selected: sheet.blueMadeBothHarder, escapeHtml, field: 'blueMadeBothHarder', prefix: 'ts-blue-harder' })}
        </fieldset>
        ${field({ path: 'blueTradeoffExplanation', label: 'Blue tradeoff explanation', value: sheet.blueTradeoffExplanation, escapeHtml, textarea: true })}
    </section>
    ${renderForecasts(sheet, escapeHtml)}
    ${field({ path: 'positionChangeTrigger', label: 'What would trigger you to change your position?', value: sheet.positionChangeTrigger, escapeHtml, textarea: true })}
    ${canEditFacilitatorNote ? field({ path: 'facilitatorNote', label: 'Facilitator note', value: sheet.facilitatorNote, escapeHtml, textarea: true, required: false, hint: 'This note is separate from Industry-authored content.' }) : ''}`;
}

function planContextMarkup(strategicPlan, escapeHtml) {
    return INDUSTRY_TURN_SHEET_SECTORS.map(({ value, label, strategicPlanKey }) => {
        const plan = strategicPlan?.sectorPlans?.[strategicPlanKey] || {};
        return `<aside class="industry-turn-sheet-plan-context" data-ts-plan-context="${escapeHtml(value)}" hidden>
            <h3>${escapeHtml(label)} Strategic Plan</h3>
            <dl class="industry-turn-sheet-context-list">
                <div><dt>Baseline stance</dt><dd>${escapeHtml(String(plan.strategicStance || 'Not specified'))}</dd></div>
                <div><dt>Red line</dt><dd>${escapeHtml(plan.redLine || 'Not specified')}</dd></div>
                <div><dt>Baseline risks</dt><dd>${escapeHtml((plan.risks || []).map((risk) => risk.type === 'other' ? risk.otherText : titleCase(risk.type)).join(', ') || 'Not specified')}</dd></div>
            </dl>
        </aside>`;
    }).join('');
}

export function createIndustryTurnSheetFormContent({
    action = {}, sheet: inputSheet, contexts = {}, strategicPlanAction = {}, strategicPlan = {}, engagements = [],
    canEditFacilitatorNote = false, escapeHtml = (value) => String(value ?? '')
} = {}) {
    const sheet = normalizeIndustryTurnSheet(inputSheet, {
        proposalId: action.id,
        sessionId: action.session_id,
        move: action.move,
        strategicPlanId: strategicPlanAction.id
    });
    const context = contexts[sheet.industry] || { eligiblePriorDecisions: [] };
    return `<form id="industryProposalForm" class="industry-turn-sheet" novalidate>
        <div class="industry-turn-sheet-header">
            <p class="industry-turn-sheet-kicker">Industry Proposal</p>
            <p class="industry-turn-sheet-progress" data-ts-progress aria-live="polite">Page 1 of 3</p>
        </div>
        <div class="industry-turn-sheet-errors" data-ts-error-summary role="alert" tabindex="-1" hidden></div>
        <div class="industry-turn-sheet-grid industry-turn-sheet-grid--three industry-turn-sheet-identity">
            ${selectField({ path: 'industry', label: 'Industry', options: INDUSTRY_TURN_SHEET_SECTORS, selected: sheet.industry, escapeHtml })}
            <div><span class="form-label">Move</span><p class="industry-turn-sheet-readonly">${escapeHtml(String(sheet.move))}</p></div>
            <div><span class="form-label">Proposal</span><p class="industry-turn-sheet-readonly" data-ts-ordinal>${escapeHtml(String(sheet.proposalOrdinalForIndustryMove || context.proposalOrdinalForIndustryMove || '—'))}</p></div>
        </div>
        ${planContextMarkup(strategicPlan, escapeHtml)}
        <nav class="industry-turn-sheet-tabs" aria-label="Proposal pages">
            ${['Environment & Supply Chain', 'Decision & Effects', 'Engagement & Outlook'].map((label, index) => `<button type="button" class="btn btn-ghost" data-ts-page-button="${index + 1}" aria-current="${index === 0 ? 'step' : 'false'}">${index + 1}. ${escapeHtml(label)}</button>`).join('')}
        </nav>
        <section data-ts-page="1" aria-labelledby="ts-page-1-heading"><h2 id="ts-page-1-heading" tabindex="-1">Environment &amp; Supply Chain</h2>
            <div class="industry-turn-sheet-baseline-reference" data-ts-baseline-reference hidden></div>
            <div data-ts-baseline-edit>${renderEnvironment(sheet, escapeHtml)}${renderSupplyChain(sheet, escapeHtml)}</div>
        </section>
        <section data-ts-page="2" aria-labelledby="ts-page-2-heading" hidden><h2 id="ts-page-2-heading" tabindex="-1">Decision &amp; Expected Effects</h2>
            <div data-ts-decision-content>${renderDecision(sheet, strategicPlan, contexts, escapeHtml)}</div>
            ${renderEffects(sheet, escapeHtml)}
        </section>
        <section data-ts-page="3" aria-labelledby="ts-page-3-heading" hidden><h2 id="ts-page-3-heading" tabindex="-1">Engagement, Risks &amp; Outlook</h2>
            ${renderPageThree(sheet, engagements, canEditFacilitatorNote, escapeHtml)}
        </section>
        <section data-ts-review aria-labelledby="ts-review-heading" hidden><h2 id="ts-review-heading" tabindex="-1">Review Proposal</h2><div data-ts-review-content></div></section>
        <div class="industry-turn-sheet-actions">
            <button type="button" class="btn btn-ghost" data-ts-nav="cancel">Cancel</button>
            <button type="button" class="btn btn-secondary" data-ts-nav="previous" hidden>Previous</button>
            <button type="button" class="btn btn-secondary" data-ts-nav="save">Save Draft</button>
            <button type="button" class="btn btn-primary" data-ts-nav="next">Next</button>
            <button type="button" class="btn btn-primary" data-ts-nav="review" hidden>Review Proposal</button>
            <button type="button" class="btn btn-secondary" data-ts-nav="edit" hidden>Back to editing</button>
            <button type="button" class="btn btn-primary" data-ts-nav="forward">Forward to Facilitator</button>
        </div>
    </form>`;
}

const formValue = (form, name) => form.querySelector(`[name="${name}"]`)?.value?.trim?.() || '';
const checkedValues = (form, name) => [...form.querySelectorAll(`[name="${name}"]:checked`)].map((input) => input.value);
const boolValue = (form, name) => {
    const value = form.querySelector(`[name="${name}"]:checked`)?.value;
    return value === 'true' ? true : value === 'false' ? false : null;
};
const lines = (value) => String(value || '').split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);

export function collectIndustryTurnSheetFormData(form, seed = {}, context = {}) {
    const industry = formValue(form, 'industry');
    const proposalContext = context.contexts?.[industry] || {};
    const read = (path) => formValue(form, path);
    const actors = INDUSTRY_ENVIRONMENT_ACTORS.map(({ value: actor }) => ({
        actor,
        actionCodes: checkedValues(form, `ts-env-${actor}-codes`),
        otherActionDescription: read(`environment.actors.${actor}.otherActionDescription`),
        actionNarrative: read(`environment.actors.${actor}.actionNarrative`),
        interestImpact: read(`environment.actors.${actor}.interestImpact`),
        confidence: read(`environment.actors.${actor}.confidence`),
        matchedForecast: read(`environment.actors.${actor}.matchedForecast`)
    }));
    const stages = INDUSTRY_SUPPLY_CHAIN_STAGES.map(({ value: stage }) => ({
        stage,
        whereWho: checkedValues(form, `ts-stage-${stage}-where`),
        otherLocationDescription: read(`supplyChain.stages.${stage}.otherLocationDescription`),
        redDependency: read(`supplyChain.stages.${stage}.redDependency`),
        plannedActions: checkedValues(form, `ts-stage-${stage}-actions`),
        notes: read(`supplyChain.stages.${stage}.notes`)
    }));
    const stakeholderValue = Object.fromEntries(['blue', 'counterparty', 'other'].map((key) => [key, {
        name: read(`decision.stakeholderValue.${key}.name`),
        gain: read(`decision.stakeholderValue.${key}.gain`),
        giveUpOrRisk: read(`decision.stakeholderValue.${key}.giveUpOrRisk`),
        net: read(`decision.stakeholderValue.${key}.net`)
    }]));
    const expectedEffects = Object.fromEntries(INDUSTRY_EFFECT_DIMENSIONS.map(({ value }) => [value, {
        direction: read(`expectedEffects.${value}.direction`),
        magnitude: read(`expectedEffects.${value}.magnitude`),
        timing: read(`expectedEffects.${value}.timing`),
        pattern: read(`expectedEffects.${value}.pattern`)
    }]));
    const engagement = Object.fromEntries(['outbound', 'inbound'].map((direction) => {
        const linkedRecordId = read(`engagement.${direction}.linkedRecordId`) || null;
        const option = context.engagements?.find((candidate) => candidate.id === linkedRecordId);
        return [direction, {
            engaged: boolValue(form, `ts-${direction}-engaged`),
            linkedRecordId,
            source: option?.source || null,
            destination: option?.destination || null,
            contact: option?.contact || null,
            outcome: read(`engagement.${direction}.outcome`) || null
        }];
    }));
    engagement.partnerCheckComplete = boolValue(form, 'ts-partner-check');
    const risks = [0, 1, 2].map((index) => ({
        id: read(`risks.${index}.id`), priorRiskId: read(`risks.${index}.priorRiskId`) || null,
        type: read(`risks.${index}.type`), otherDescription: read(`risks.${index}.otherDescription`),
        likelihood: read(`risks.${index}.likelihood`), impact: read(`risks.${index}.impact`),
        mitigation: read(`risks.${index}.mitigation`), movementStatus: read(`risks.${index}.movementStatus`)
    })).filter((risk, index) => index === 0 || Object.entries(risk).some(([key, value]) => !['id', 'movementStatus'].includes(key) && Boolean(value)));
    const hasMaterialSpillover = boolValue(form, 'ts-spillover');
    const spillovers = [0, 1, 2].map((index) => ({
        affectedSector: read(`otherSectorSpillover.entries.${index}.affectedSector`),
        direction: read(`otherSectorSpillover.entries.${index}.direction`),
        explanation: read(`otherSectorSpillover.entries.${index}.explanation`)
    })).filter((entry, index) => index === 0 || Object.values(entry).some(Boolean));
    const nextMoveForecasts = Object.fromEntries(INDUSTRY_ENVIRONMENT_ACTORS.map(({ value: actor }) => [actor, {
        actionCodes: checkedValues(form, `ts-forecast-${actor}-codes`),
        otherActionDescription: read(`nextMoveForecasts.${actor}.otherActionDescription`),
        explanation: read(`nextMoveForecasts.${actor}.explanation`)
    }]));
    const isFirst = proposalContext.isFirstProposalForIndustryMove ?? seed.isFirstProposalForIndustryMove ?? false;
    return normalizeIndustryTurnSheet({
        ...seed,
        industry,
        move: context.move || seed.move,
        proposalOrdinalForIndustryMove: seed.proposalOrdinalForIndustryMove || proposalContext.proposalOrdinalForIndustryMove,
        isFirstProposalForIndustryMove: isFirst,
        strategicPlanId: context.strategicPlanId || seed.strategicPlanId,
        previousMoveProposalId: proposalContext.previousMoveProposalId || seed.previousMoveProposalId,
        environmentBaselineProposalId: isFirst ? (seed.proposalId || null) : proposalContext.baselineProposalId,
        supplyChainBaselineProposalId: isFirst ? (seed.proposalId || null) : proposalContext.baselineProposalId,
        linkedStrategicPriorityIds: checkedValues(form, 'ts-priorities'),
        recipientTeams: checkedValues(form, 'ts-recipients'),
        environment: isFirst ? { actors, biggestSurprise: read('environment.biggestSurprise') } : seed.environment,
        supplyChain: isFirst ? { stages, weakestLink: read('supplyChain.weakestLink'), changeSinceLastMove: read('supplyChain.changeSinceLastMove') } : seed.supplyChain,
        decision: {
            coordinatedWithOtherSector: boolValue(form, 'ts-coordinated'),
            coordinatedSectors: checkedValues(form, 'ts-coordinated-sectors'),
            status: read('decision.status'), priorDecisionId: read('decision.priorDecisionId') || null,
            primaryMove: read('decision.primaryMove'), otherPrimaryMove: read('decision.otherPrimaryMove'),
            counterparty: { type: read('decision.counterparty.type'), names: lines(read('decision.counterparty.names')) },
            capitalCommitment: read('decision.capitalCommitment'), visibility: read('decision.visibility'),
            ask: checkedValues(form, 'ts-ask'), askOtherDescription: read('decision.askOtherDescription'),
            offer: checkedValues(form, 'ts-offer'), offerOtherDescription: read('decision.offerOtherDescription'),
            stakeholderValue,
            intendedEffect: read('decision.intendedEffect'), rationale: read('decision.rationale'), implementation: read('decision.implementation')
        },
        expectedEffects,
        escalationMarkers: checkedValues(form, 'ts-escalation'), escalationRationale: read('escalationRationale'),
        engagement,
        risks,
        ipSecurityEffect: read('ipSecurityEffect'),
        otherSectorSpillover: { hasMaterialSpillover, entries: hasMaterialSpillover ? spillovers : [] },
        stance: read('stance'), blueMadeBothHarder: boolValue(form, 'ts-blue-harder'),
        blueTradeoffExplanation: read('blueTradeoffExplanation'), nextMoveForecasts,
        positionChangeTrigger: read('positionChangeTrigger'),
        facilitatorNote: context.canEditFacilitatorNote ? read('facilitatorNote') : seed.facilitatorNote
    }, {
        proposalId: seed.proposalId,
        sessionId: seed.sessionId,
        move: context.move,
        strategicPlanId: context.strategicPlanId
    });
}

export function renderIndustryTurnSheetReview(sheet, priorities, escapeHtml = (value) => String(value ?? '')) {
    const model = buildIndustryTurnSheetDisplayModel(sheet, priorities);
    return `<header class="industry-turn-sheet-review-header"><p>${escapeHtml(model.eyebrow)}</p><h3>${escapeHtml(model.title)}</h3><p><strong>Visibility:</strong> ${escapeHtml(model.visibility)}</p></header>
        <div class="industry-turn-sheet-review-grid">${model.sections.map((section) => `<section class="industry-turn-sheet-card"><h4>${escapeHtml(section.title)}</h4><dl>${section.rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join('')}</dl></section>`).join('')}</div>`;
}
