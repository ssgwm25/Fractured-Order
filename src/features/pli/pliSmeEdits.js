/**
 * SME edit collection, engine-vs-SME diffs, and TSJ/Verba copy packets.
 * Engine output stays on record.tracks; override_value is the edited seat payload.
 */

import {
    SEATS,
    SEAT_STATUS,
    escapeHtml,
    getSeatReview,
    seatIsFinalized,
    getActionTitle,
    getMacroBlock,
    buildSourceActionPresentation
} from './pliShared.js';

export const PLI_PACKET_VERSION = 'pli-sme-packet.v1';

export const INFO_BRIEF_SECTIONS = Object.freeze([
    'summary',
    'audiences',
    'narratives',
    'second_order_effects',
    'sme_questions',
    'suggested_sme_edits'
]);

export const INFO_BRIEF_LABELS = Object.freeze({
    summary: 'Summary',
    audiences: 'Audiences',
    narratives: 'Narratives',
    second_order_effects: 'Second-order effects',
    sme_questions: 'SME questions',
    suggested_sme_edits: 'Suggested SME edits'
});

export const NI_DOMAIN_LABELS = Object.freeze({
    'NI-1': 'Homeland & Strategic Access',
    'NI-2': 'Economic Prosperity & Tech Leadership',
    'NI-3': 'Alliance / Partner Credibility',
    'NI-4': 'Indo-Pacific Stability & Deterrence',
    'NI-5': 'Rules / Market Integrity / Reciprocity',
    'NI-6': 'Domestic Political Sustainability'
});

export const GLASL_LABELS = Object.freeze({
    1: 'Hardening',
    2: 'Debate & polemic',
    3: 'Actions, not words',
    4: 'Images & coalitions',
    5: 'Loss of face',
    6: 'Threat strategies',
    7: 'Limited destructive blows',
    8: 'Fragmentation of the enemy',
    9: 'Together into the abyss'
});

const DIP_EDIT_FIELDS = Object.freeze([
    ['band', 'Band'],
    ['code', 'Taxonomy / code'],
    ['category', 'Category'],
    ['policy_style', 'Policy style'],
    ['effect_summary', 'Effect summary']
]);

export function cloneJson(value) {
    if (value == null) return value ?? null;
    return JSON.parse(JSON.stringify(value));
}

export function getEngineTracks(row = {}) {
    return cloneJson(row?.record?.tracks || {}) || {};
}

function normalizeDiffValue(value) {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch (_err) {
            return String(value);
        }
    }
    return String(value);
}

function pushDiff(fields, path, engine, sme) {
    const engineText = normalizeDiffValue(engine);
    const smeText = normalizeDiffValue(sme);
    if (engineText === smeText) return;
    fields.push({ path, engine: engineText, sme: smeText });
}

export function emptyEditDiff() {
    return { fields: [] };
}

export function applyMacroOverrideToTrack(macro, overrideValue) {
    if (!overrideValue || typeof overrideValue !== 'object') return macro || null;
    const next = { ...(macro || {}), ...overrideValue, ...(overrideValue.macro || {}) };
    const lever = overrideValue.lever || overrideValue.classification?.lever;
    const instrument = overrideValue.instrument || overrideValue.classification?.instrument;
    const score = overrideValue.implementation_score ?? overrideValue.implementation?.score;
    if (lever || instrument) {
        next.classification = {
            ...(macro?.classification || {}),
            ...(overrideValue.classification || {}),
            ...(lever ? { lever } : {}),
            ...(instrument ? { instrument } : {})
        };
    }
    if (score != null && score !== '') {
        next.implementation = {
            ...(macro?.implementation || {}),
            ...(overrideValue.implementation || {}),
            score
        };
    }
    return next;
}

/**
 * Output-of-record tracks: engine original with finalized seat overrides applied.
 */
export function resolveOutputTracks(row = {}) {
    const tracks = { ...(row?.record?.tracks || {}) };

    const macroSeat = getSeatReview(row, SEATS.MACRO);
    if (seatIsFinalized(macroSeat) && macroSeat.override_value && typeof macroSeat.override_value === 'object') {
        tracks.macro = applyMacroOverrideToTrack(tracks.macro, macroSeat.override_value);
    }

    const dipSeat = getSeatReview(row, SEATS.DIPLOMACY_INFORMATION);
    if (seatIsFinalized(dipSeat) && dipSeat.override_value && typeof dipSeat.override_value === 'object') {
        const ov = dipSeat.override_value;
        if (ov.diplomacy !== undefined) tracks.diplomacy = ov.diplomacy;
        if (ov.information !== undefined) tracks.information = ov.information;
    }

    const niSeat = getSeatReview(row, SEATS.NATIONAL_INTEREST_ESCALATION);
    if (seatIsFinalized(niSeat) && niSeat.override_value && typeof niSeat.override_value === 'object') {
        const ov = niSeat.override_value;
        if (ov.national_interest !== undefined) tracks.national_interest = ov.national_interest;
        if (ov.glasl !== undefined) tracks.glasl = ov.glasl;
    }

    return tracks;
}

export function getSeatEditDiff(seat) {
    const fields = Array.isArray(seat?.edit_diff?.fields) ? seat.edit_diff.fields : [];
    return { fields };
}

export function renderEditDiffHtml(seat) {
    if (!seatIsFinalized(seat)) return '';
    const fields = getSeatEditDiff(seat).fields;
    if (!fields.length) {
        const copy = seat?.status === SEAT_STATUS.OVERRIDDEN
            ? 'Override recorded without field-level changes.'
            : 'Approved as proposed.';
        return `
            <div class="pli-edit-diff" data-pli-edit-diff>
                <div class="pli-label">Engine vs SME</div>
                <p class="text-sm">${escapeHtml(copy)}</p>
            </div>`;
    }
    const rows = fields.map((entry) => `
        <tr>
            <th scope="row">${escapeHtml(entry.path)}</th>
            <td>${escapeHtml(entry.engine || '—')}</td>
            <td>${escapeHtml(entry.sme || '—')}</td>
        </tr>`).join('');
    return `
        <div class="pli-edit-diff" data-pli-edit-diff>
            <div class="pli-label">Engine vs SME</div>
            <table class="pli-table pli-edit-diff-table">
                <thead><tr><th>Field</th><th>Engine</th><th>SME</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

export function summarizeSessionEfficacy(rows = []) {
    const seats = {
        [SEATS.MACRO]: { approved: 0, overridden: 0, needs_human: 0 },
        [SEATS.DIPLOMACY_INFORMATION]: { approved: 0, overridden: 0, needs_human: 0 },
        [SEATS.NATIONAL_INTEREST_ESCALATION]: { approved: 0, overridden: 0, needs_human: 0 }
    };
    const pathCounts = new Map();

    (rows || []).forEach((row) => {
        Object.keys(seats).forEach((seatId) => {
            const seat = getSeatReview(row, seatId);
            const status = seat?.status || SEAT_STATUS.PENDING;
            if (status === SEAT_STATUS.APPROVED) seats[seatId].approved += 1;
            if (status === SEAT_STATUS.OVERRIDDEN) seats[seatId].overridden += 1;
            if (status === SEAT_STATUS.NEEDS_HUMAN) seats[seatId].needs_human += 1;
            if (status === SEAT_STATUS.OVERRIDDEN) {
                getSeatEditDiff(seat).fields.forEach((entry) => {
                    const path = String(entry.path || '').trim();
                    if (!path) return;
                    pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
                });
            }
        });
    });

    const topPaths = [...pathCounts.entries()]
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
        .slice(0, 12);

    return { seats, topPaths };
}

function readInput(card, selector) {
    return card?.querySelector?.(selector)?.value ?? '';
}

function readOptionalInput(card, selector) {
    const el = card?.querySelector?.(selector);
    if (!el) return undefined;
    return String(el.value ?? '');
}

function pickEditedText(next, fallback) {
    if (next === undefined) return fallback || '';
    const trimmed = String(next).trim();
    return trimmed || fallback || '';
}

function engineMacroClassification(row) {
    const { worksheet, adjudication } = getMacroBlock(row?.record || {});
    return worksheet?.classification || adjudication?.classification || {};
}

function engineMacroImplementationScore(row) {
    const { adjudication, worksheet } = getMacroBlock(row?.record || {});
    const score = adjudication?.implementation?.score ?? worksheet?.implementation?.score;
    return score == null || score === '' ? '' : String(score);
}

export function buildMacroEditDiff(row, overrideValue = {}) {
    const fields = [];
    const classification = engineMacroClassification(row);
    const engineScore = engineMacroImplementationScore(row);
    const smeLever = overrideValue.lever || overrideValue.classification?.lever;
    const smeInstrument = overrideValue.instrument || overrideValue.classification?.instrument;
    const smeScore = overrideValue.implementation_score ?? overrideValue.implementation?.score;
    pushDiff(fields, 'macro.classification.lever', classification.lever, smeLever);
    pushDiff(fields, 'macro.classification.instrument', classification.instrument, smeInstrument);
    pushDiff(fields, 'macro.implementation.score', engineScore, smeScore);
    return { fields };
}

export function collectMacroOverrideFromCard(card, row) {
    const classification = engineMacroClassification(row);
    const { adjudication } = getMacroBlock(row?.record || {});
    const lever = String(readInput(card, '[data-pli-macro-lever]')).trim() || classification.lever || '';
    const instrument = String(readInput(card, '[data-pli-macro-instrument]')).trim() || classification.instrument || '';
    const scoreRaw = String(readInput(card, '[data-pli-macro-impl]')).trim();
    const implementationScore = parseInt(scoreRaw, 10);
    const rationale = String(readInput(card, '[data-pli-rationale]')).trim();
    const overrideValue = {
        lever,
        instrument,
        implementation_score: Number.isInteger(implementationScore) ? implementationScore : null,
        classification: {
            ...classification,
            lever,
            instrument
        },
        implementation: {
            ...(adjudication?.implementation || {}),
            score: Number.isInteger(implementationScore) ? implementationScore : adjudication?.implementation?.score
        }
    };
    return {
        override_value: overrideValue,
        override_rationale: rationale,
        edit_diff: buildMacroEditDiff(row, overrideValue)
    };
}

export function validateMacroOverride(overrideValue) {
    const score = Number(overrideValue?.implementation_score);
    if (!Number.isInteger(score) || score < 1 || score > 10) {
        return 'Implementation must be an integer from 1 to 10';
    }
    if (!String(overrideValue?.lever || '').trim() || !String(overrideValue?.instrument || '').trim()) {
        return 'Lever and instrument are required';
    }
    return null;
}

function readNiDomains(ni = {}) {
    return ni.domain_deltas || ni.domains || {};
}

function niDeltaOf(entry) {
    if (entry == null) return null;
    if (typeof entry === 'number') return Number.isFinite(entry) ? entry : null;
    if (typeof entry === 'object') {
        const n = Number(entry.delta);
        return Number.isFinite(n) ? n : null;
    }
    const n = Number(entry);
    return Number.isFinite(n) ? n : null;
}

export function buildNiEditDiff(row, overrideValue = {}) {
    const fields = [];
    const engineNi = getEngineTracks(row).national_interest || {};
    const engineGlasl = getEngineTracks(row).glasl || {};
    const smeNi = overrideValue.national_interest || {};
    const smeGlasl = overrideValue.glasl || {};
    const engineDomains = readNiDomains(engineNi);
    const smeDomains = readNiDomains(smeNi);
    Object.keys(NI_DOMAIN_LABELS).forEach((key) => {
        pushDiff(
            fields,
            `national_interest.domain_deltas.${key}.delta`,
            niDeltaOf(engineDomains[key]),
            niDeltaOf(smeDomains[key])
        );
    });
    const smeStage = overrideValue.stage_after ?? smeGlasl.stage_after;
    pushDiff(fields, 'glasl.stage_after', engineGlasl.stage_after, smeStage);
    return { fields };
}

export function collectNiOverrideFromCard(card, row) {
    const engineNi = cloneJson(getEngineTracks(row).national_interest || {}) || {};
    const engineGlasl = cloneJson(getEngineTracks(row).glasl || {}) || {};
    const domains = { ...(readNiDomains(engineNi) || {}) };
    Object.keys(NI_DOMAIN_LABELS).forEach((key) => {
        const raw = String(readInput(card, `[data-pli-ni-delta="${key}"]`)).trim();
        if (raw === '') return;
        const delta = Number(raw);
        if (!Number.isFinite(delta)) return;
        const prior = domains[key];
        if (prior && typeof prior === 'object') {
            domains[key] = { ...prior, delta };
        } else {
            domains[key] = { delta };
        }
    });
    const stageRaw = String(readInput(card, '[data-pli-glasl-stage]')).trim();
    const stageAfter = parseInt(stageRaw, 10);
    const stageBefore = Number(engineGlasl.stage_before);
    const nextGlasl = { ...engineGlasl };
    if (Number.isInteger(stageAfter) && stageAfter >= 1 && stageAfter <= 9) {
        nextGlasl.stage_after = stageAfter;
        if (Number.isFinite(stageBefore)) {
            nextGlasl.delta = stageAfter - stageBefore;
        }
    }
    const nationalInterest = {
        ...engineNi,
        domain_deltas: domains
    };
    const overrideValue = {
        national_interest: nationalInterest,
        glasl: nextGlasl,
        stage_after: nextGlasl.stage_after
    };
    return {
        override_value: overrideValue,
        override_rationale: String(readInput(card, '[data-pli-rationale]')).trim(),
        edit_diff: buildNiEditDiff(row, overrideValue)
    };
}

export function readDiplomacyFields(diplomacy = null) {
    const fields = diplomacy?.fields || diplomacy?.taxonomy || diplomacy || {};
    return {
        band: diplomacy?.band || fields.band || '',
        code: diplomacy?.code_string || diplomacy?.code || fields.code || '',
        category: diplomacy?.category || fields.paradigm || fields.diplomacy_paradigm || '',
        policy_style: diplomacy?.policy_style || fields.policy_style || '',
        effect_summary: fields.effect_summary || fields.proposed_outcome || ''
    };
}

export function readInformationSection(information = null, key) {
    const sections = information?.sections || {};
    const brief = information?.brief || information || {};
    if (sections[key]) return String(sections[key]);
    if (brief[key]) return String(brief[key]);
    const fallbacks = {
        summary: brief.message_thesis || brief.thesis || brief.summary || '',
        audiences: Array.isArray(brief.target_audience)
            ? brief.target_audience.join(', ')
            : (brief.target_audience || brief.theater || ''),
        narratives: brief.narratives || brief.intended_effect || '',
        second_order_effects: brief.second_order_effects || brief.risk_of_blowback || brief.blowback || '',
        sme_questions: brief.sme_questions || '',
        suggested_sme_edits: brief.suggested_sme_edits || ''
    };
    return String(fallbacks[key] || '');
}

export function buildDipEditDiff(row, overrideValue = {}) {
    const fields = [];
    const engineDip = readDiplomacyFields(getEngineTracks(row).diplomacy);
    const smeDip = readDiplomacyFields(overrideValue.diplomacy);
    DIP_EDIT_FIELDS.forEach(([key]) => {
        pushDiff(fields, `diplomacy.${key}`, engineDip[key], smeDip[key]);
    });
    INFO_BRIEF_SECTIONS.forEach((key) => {
        pushDiff(
            fields,
            `information.sections.${key}`,
            readInformationSection(getEngineTracks(row).information, key),
            readInformationSection(overrideValue.information, key)
        );
    });
    return { fields };
}

export function collectDipOverrideFromCard(card, row) {
    const engineDip = cloneJson(getEngineTracks(row).diplomacy || {}) || {};
    const engineInfo = cloneJson(getEngineTracks(row).information || {}) || {};
    const engineFields = readDiplomacyFields(engineDip);
    const dipFields = {
        ...(engineDip.fields || engineDip.taxonomy || {}),
        band: pickEditedText(readOptionalInput(card, '[data-pli-dip-band]'), engineFields.band),
        code: pickEditedText(readOptionalInput(card, '[data-pli-dip-code]'), engineFields.code),
        paradigm: pickEditedText(readOptionalInput(card, '[data-pli-dip-category]'), engineFields.category),
        policy_style: pickEditedText(readOptionalInput(card, '[data-pli-dip-style]'), engineFields.policy_style),
        effect_summary: pickEditedText(readOptionalInput(card, '[data-pli-dip-effect]'), engineFields.effect_summary)
    };
    const diplomacy = {
        ...engineDip,
        band: dipFields.band || engineDip.band,
        code: dipFields.code || engineDip.code || engineDip.code_string,
        code_string: dipFields.code || engineDip.code_string || engineDip.code,
        category: dipFields.paradigm || engineDip.category,
        policy_style: dipFields.policy_style || engineDip.policy_style,
        fields: dipFields
    };
    const sections = { ...(engineInfo.sections || {}) };
    const brief = { ...(engineInfo.brief || {}) };
    INFO_BRIEF_SECTIONS.forEach((key) => {
        const next = readOptionalInput(card, `[data-pli-info-section="${key}"]`);
        if (next === undefined) return;
        sections[key] = next;
        brief[key] = next;
    });
    const information = {
        ...engineInfo,
        sections,
        brief
    };
    const overrideValue = { diplomacy, information };
    return {
        override_value: overrideValue,
        override_rationale: String(readInput(card, '[data-pli-rationale]')).trim(),
        edit_diff: buildDipEditDiff(row, overrideValue)
    };
}

function compactMacro(macro) {
    if (!macro) return null;
    return {
        status: macro.status || null,
        lever: macro.classification?.lever || null,
        instrument: macro.classification?.instrument || null,
        implementationScore: macro.implementation?.score ?? null
    };
}

function compactDiplomacy(diplomacy) {
    if (!diplomacy) return null;
    const fields = readDiplomacyFields(diplomacy);
    return {
        status: diplomacy.status || null,
        ...fields
    };
}

function compactInformation(information) {
    if (!information) return null;
    const sections = {};
    INFO_BRIEF_SECTIONS.forEach((key) => {
        sections[key] = readInformationSection(information, key) || null;
    });
    return {
        status: information.status || null,
        ...sections
    };
}

function compactNi(ni) {
    if (!ni) return null;
    const domains = {};
    Object.keys(NI_DOMAIN_LABELS).forEach((key) => {
        const entry = (ni.domain_deltas || ni.domains || {})[key];
        domains[key] = {
            label: NI_DOMAIN_LABELS[key],
            delta: niDeltaOf(entry)
        };
    });
    return {
        status: ni.status || null,
        orientation: ni.orientation || null,
        orientationNet: ni.orientation_net ?? null,
        domains
    };
}

function compactGlasl(glasl) {
    if (!glasl) return null;
    return {
        status: glasl.status || null,
        stageBefore: glasl.stage_before ?? null,
        stageAfter: glasl.stage_after ?? null,
        delta: glasl.delta ?? null,
        rationale: glasl.rationale || null
    };
}

function compactSeatOutput(pliSeat, tracks) {
    if (pliSeat === SEATS.MACRO) {
        return { macro: compactMacro(tracks.macro) };
    }
    if (pliSeat === SEATS.DIPLOMACY_INFORMATION) {
        return {
            diplomacy: compactDiplomacy(tracks.diplomacy),
            information: compactInformation(tracks.information)
        };
    }
    return {
        nationalInterest: compactNi(tracks.national_interest),
        glasl: compactGlasl(tracks.glasl)
    };
}

function seatLabel(pliSeat) {
    if (pliSeat === SEATS.MACRO) return 'Macro';
    if (pliSeat === SEATS.DIPLOMACY_INFORMATION) return 'Diplomacy & Information';
    return 'NI & Escalation';
}

function markdownForSeat(pliSeat, tracks) {
    const lines = [];
    if (pliSeat === SEATS.MACRO) {
        const macro = compactMacro(tracks.macro) || {};
        lines.push(`- Lever: ${macro.lever || '—'}`);
        lines.push(`- Instrument: ${macro.instrument || '—'}`);
        lines.push(`- Implementation score: ${macro.implementationScore ?? '—'}`);
        return lines.join('\n');
    }
    if (pliSeat === SEATS.DIPLOMACY_INFORMATION) {
        const dip = compactDiplomacy(tracks.diplomacy) || {};
        const info = compactInformation(tracks.information) || {};
        lines.push('### Diplomacy');
        lines.push(`- Band: ${dip.band || '—'}`);
        lines.push(`- Code: ${dip.code || '—'}`);
        lines.push(`- Category: ${dip.category || '—'}`);
        lines.push(`- Policy style: ${dip.policy_style || '—'}`);
        lines.push(`- Effect summary: ${dip.effect_summary || '—'}`);
        lines.push('');
        lines.push('### Information brief');
        INFO_BRIEF_SECTIONS.forEach((key) => {
            lines.push(`#### ${INFO_BRIEF_LABELS[key]}`);
            lines.push(info[key] || '—');
            lines.push('');
        });
        return lines.join('\n').trim();
    }
    const ni = compactNi(tracks.national_interest) || {};
    const glasl = compactGlasl(tracks.glasl) || {};
    lines.push('### National Interest');
    Object.keys(NI_DOMAIN_LABELS).forEach((key) => {
        const delta = ni.domains?.[key]?.delta;
        lines.push(`- ${key} (${NI_DOMAIN_LABELS[key]}): ${delta == null ? '—' : delta}`);
    });
    lines.push('');
    lines.push('### Glasl');
    const afterLabel = GLASL_LABELS[glasl.stageAfter] || '';
    lines.push(`- Stage ${glasl.stageBefore ?? '—'} → ${glasl.stageAfter ?? '—'}${afterLabel ? ` (${afterLabel})` : ''}`);
    lines.push(`- Δ ${glasl.delta ?? '—'}`);
    if (glasl.rationale) lines.push(`- Rationale: ${glasl.rationale}`);
    return lines.join('\n');
}

export function buildPliSmePacket({
    row,
    action = null,
    pliSeat,
    handoffSeat
} = {}) {
    const seat = getSeatReview(row, pliSeat);
    const engineTracks = getEngineTracks(row);
    const outputTracks = resolveOutputTracks(row);
    const presentation = buildSourceActionPresentation(action, row?.record || {});
    const payload = {
        version: PLI_PACKET_VERSION,
        action: {
            id: row?.action_id || action?.id || null,
            title: getActionTitle(action, row),
            team: action?.team || row?.record?.action?.team || null,
            move: action?.move ?? row?.record?.action?.move ?? null,
            narrative: presentation.narrative
        },
        pliSeat,
        smeStatus: seat?.status || null,
        smeReviewer: seat?.sme_reviewer || null,
        engine: compactSeatOutput(pliSeat, engineTracks),
        sme: seat?.status === SEAT_STATUS.OVERRIDDEN
            ? compactSeatOutput(pliSeat, outputTracks)
            : null,
        outputOfRecord: compactSeatOutput(pliSeat, outputTracks),
        editDiff: getSeatEditDiff(seat)
    };

    const heading = `${handoffSeat === 'verba' ? 'Verba AI' : 'Tribe Street Journal'} PLI packet`;
    const markdown = [
        `# ${heading}`,
        '',
        `Seat: ${seatLabel(pliSeat)}`,
        `Status: ${seat?.status || '—'}`,
        `Reviewer: ${seat?.sme_reviewer || '—'}`,
        `Title: ${payload.action.title}`,
        `Action ID: ${payload.action.id || '—'}`,
        `Team: ${payload.action.team || 'unknown'}`,
        `Move: ${payload.action.move ?? '—'}`,
        '',
        '## Action narrative',
        payload.action.narrative || 'No narrative on record.',
        '',
        '## Approved PLI outputs',
        markdownForSeat(pliSeat, outputTracks)
    ].join('\n');

    let copyText = markdown;
    if (handoffSeat === 'verba') {
        copyText = JSON.stringify(payload, null, 2);
        if (pliSeat === SEATS.DIPLOMACY_INFORMATION) {
            copyText = `${copyText}\n\n---\n${markdownForSeat(pliSeat, outputTracks)}`;
        }
    }

    return { payload, copyText };
}

export function renderInfoBriefReadOnly(information) {
    if (!information) {
        return '<p class="text-sm text-gray-500">No information brief yet.</p>';
    }
    const suggested = readInformationSection(information, 'suggested_sme_edits');
    const blocks = INFO_BRIEF_SECTIONS.filter((key) => key !== 'suggested_sme_edits').map((key) => `
        <div class="pli-block">
            <div class="pli-label">${escapeHtml(INFO_BRIEF_LABELS[key])}</div>
            <p class="text-sm">${escapeHtml(readInformationSection(information, key) || '—')}</p>
        </div>`).join('');
    const suggestedHtml = suggested
        ? `<div class="pli-notice pli-notice-gold"><strong>Suggested SME edits</strong><p class="text-sm" style="margin-top: var(--space-2);">${escapeHtml(suggested)}</p></div>`
        : '';
    return `${suggestedHtml}${blocks}`;
}

export function renderInfoBriefEditor(information) {
    const suggested = readInformationSection(information, 'suggested_sme_edits');
    const callout = suggested
        ? `<div class="pli-notice pli-notice-gold"><strong>Suggested SME edits</strong><p class="text-sm" style="margin-top: var(--space-2);">${escapeHtml(suggested)}</p></div>`
        : '';
    const fields = INFO_BRIEF_SECTIONS.map((key) => `
        <div class="form-group pli-edit-field">
            <label class="form-label">${escapeHtml(INFO_BRIEF_LABELS[key])}</label>
            <textarea class="form-input form-textarea" data-pli-info-section="${escapeHtml(key)}" rows="${key === 'suggested_sme_edits' ? 3 : 4}">${escapeHtml(readInformationSection(information, key))}</textarea>
        </div>`).join('');
    return `${callout}${fields}`;
}
