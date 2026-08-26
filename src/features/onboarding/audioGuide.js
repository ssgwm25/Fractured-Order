const START_HERE_AUDIO_BASE_URL = '/onboarding/start-here/audio/clips';

const ROLE_WALKTHROUGHS = Object.freeze({
    observer: 'Use this guide to build situational awareness without crossing into participant authority. Follow the record from live context to artifacts, incoming information, and the timeline. At every stop, distinguish what you can inspect from what an active seat is permitted to change.',
    facilitator: 'Your workflow moves from listening, to structured drafting, to an explicit handoff. Use each surface to preserve the team’s intent, evidence, assumptions, and rationale. A record is not handed off merely because another role can see it; confirm the documented workflow state before you move on.',
    scribe: 'Your workflow moves from framing the discussion, to reviewing the Scribe’s record, to projecting and submitting the agreed artifact. Keep presentation, editing, and submission as separate decisions. The team remains responsible for its judgment, while White Cell remains responsible for review.',
    notetaker: 'Your walkthrough follows the evidence behind the formal decision. Capture observable moments first, then record dynamics and alliances, compare them with the team artifact, and use the timeline to test whether the sequence is coherent. Preserve your own seat’s perspective without overwriting another observer.',
    whitecell: 'Work through the console as an operator loop: verify shared state, inspect the owning queue, make an explicit decision, communicate it to the intended audience, and confirm the audit trail. Lead and Support must follow the permissions actually exposed to their seats; visibility never grants authority.',
    gamemaster: 'Treat administration as an evidence chain. Establish the correct session, verify the participant topology, monitor operational continuity, and export only from the selected run. Live exercise control remains with White Cell, so use this surface to verify and preserve context rather than to infer decisions.',
    sme: 'Treat every queue item as a bounded specialist review. Confirm the source record and dependency state, inspect the complete worksheet or handoff, use the explicit specialist control, and verify the resulting queue state. Your decision becomes evidence for White Cell; it does not replace White Cell’s operational role.'
});

const SURFACE_WALKTHROUGHS = Object.freeze({
    'Activity': 'Use the activity feed as a triage surface. Open the native destination behind a notice before responding, because the badge tells you that something changed but does not provide the complete decision context.',
    'Alliance Tracking': 'Separate signals, intentions, and confirmed commitments. Record who is aligned, what the alignment concerns, when it changed, and what evidence supports that interpretation.',
    'Blue Actions': 'Read the complete Blue submission before deciding. Reconcile the active move, structured action fields, rationale, and any requested team notifications; reviewing and sharing are separate operator decisions.',
    'Build proposals': 'Build the proposal around a named recipient and a clear exchange. Preserve what is offered, what is requested, timing, conditions, and rationale so White Cell and each recipient can understand the same durable record.',
    'Check session state': 'Use the tracker to verify which session and exercise window you are observing. If the displayed state conflicts with the room, resolve the owning White Cell context before relying on later records or exports.',
    'Close the loop': 'Use this checkpoint as a pre-handoff audit. Re-read the active move, required fields, rationale, destination, and lifecycle label; correct the source record before using the explicit handoff control.',
    'Communications': 'Use communications for deliberate coordination with a known audience. Verify the recipient and purpose before sending, and keep rulings or requests that require durable workflow history in their owning artifact or RFI surface.',
    'Complete the administration loop': 'Reconcile session identity, roster, plugin state, unresolved issues, and required exports as one handoff package. Another operator should be able to continue without guessing which run or evidence set you meant.',
    'Complete the handoff': 'Pause before submission and compare the projected discussion with the forwarded source record. Confirm team agreement, active move, completeness, and lifecycle state; projection alone is never submission.',
    'Complete the observation loop': 'Use the formal artifact and your observation record as two complementary views. The artifact states what the team decided; your notes should explain the sequence, influence, friction, and turning points that produced it.',
    'Complete the operator loop': 'Before handoff or export, reconcile shared state, every pending queue, participant access, specialist outputs, communications, and timeline evidence. Record unresolved work explicitly rather than inferring completion from an empty-looking view.',
    'Complete the specialist loop': 'Confirm four things before leaving: the source item, the decision or acknowledgement, the reviewer identity, and the resulting queue state. If any exception remains, document it on the owning record.',
    'Complete the TSJ handoff': 'Treat Copy and Mark done as separate checkpoints. First preserve the prepared narrative exactly at the external boundary; then acknowledge completion so the source record retains a trustworthy handoff history.',
    'Complete the Verba handoff': 'Treat Copy and Mark done as separate checkpoints. First preserve the prepared sentiment narrative exactly at the external boundary; then acknowledge completion so the source record retains a trustworthy handoff history.',
    'Control arrival noise': 'Muting changes presentation noise, not workflow state. Use badges and NEW labels to locate unread work, then open the destination item so the durable arrival state clears for the correct reason.',
    'Dashboard': 'Use the dashboard to detect drift, not to resolve it. Compare counts and recent activity with the selected session, then open the owning participant, RFI, session, or export surface before taking action.',
    'Deck': 'Use the deck to pace and structure the room while keeping the active phase visible. It supports facilitation, but the team artifact remains the durable record and must be reviewed separately.',
    'Diplomacy & Information PLI': 'Read diplomacy and information as a paired specialist result. Confirm both routed tracks cleared the specialist boundary and use the finalized output as evidence rather than editing or recreating the decision in White Cell.',
    'Draft actions': 'Translate the room’s decision into a complete action that another reviewer can understand without oral context. Capture intent, instruments, targets, timing, expected effects, assumptions, and rationale before handoff.',
    'Exports': 'An export is evidence tied to one selected session. Reconcile the session identity and run state first, choose the format for the intended review, and retain the manifest that explains what the archive contains.',
    'Follow move, phase, and timer': 'Anchor every facilitation decision to the shared exercise window. Name the active state for the room, then keep the deck and handoff aligned with it; timing context should never be inferred later.',
    'Green and Industry Proposals': 'Review each proposal as a recipient-specific workflow. Confirm the intended audience, terms, and White Cell notes before forwarding, and preserve separate append-only threads so one recipient cannot see or alter another recipient’s negotiation.',
    'Inbox': 'Treat the inbox as incoming context for the Notetaker seat. Open the complete message, decide what it changes in your observation record, and avoid treating receipt of a message as evidence of a team decision.',
    'Macro PLI': 'Trace the finalized chain from source action through lever, instrument, implementation assessment, modifiers, citations, and outputs. White Cell consumes this evidence but does not impersonate the specialist who approved or overrode it.',
    'Manage session operations': 'Keep the selected session stable while moving between settings tabs. Sessions, participants, decks, plugins, and exports are related operational surfaces, but each has a different owner and consequence.',
    'NI & Escalation PLI': 'Read the six National Interest domains together with the escalation stage and trajectory. Confirm the Macro dependency cleared before treating downstream output as finalized evidence.',
    'Participants': 'Verify each seat by team, role, display name, and connection state. Resolve duplicates, missing assignments, or reconnect ambiguity before the exercise begins and recheck after any operational interruption.',
    'PLI Reports': 'Choose report scope deliberately and confirm all included specialist seats are finalized. Reports summarize existing evidence; generating a report must never create, approve, or alter an adjudication.',
    'Plugins': 'Review plugin scope, dependency state, and selected session before changing lifecycle state. A plugin must not silently affect another run or become a substitute for the platform’s deterministic workflow.',
    'Population Sentiments': 'Read the published sentiment as audience-specific scenario context. Identify who received it, what changed in the narrative, and whether the team will respond; do not treat sentiment as a hidden score or automatic outcome.',
    'Present to the room': 'Enter presentation mode deliberately and verify the correct artifact remains in context. Projection removes operator chrome for the room, but it does not submit, approve, or change the lifecycle of the displayed record.',
    'Proposals': 'Read the proposal and the complete recipient-specific thread before responding. The first decision opens an isolated negotiation record; later rounds must remain attached to that same thread.',
    'Quick Capture': 'Record one observable point per capture and label whether it is an observation, moment, or direct quote. Keep interpretation distinct from quoted language and leave formal decisions in the artifact workflow.',
    'Read queue state': 'Start with the badge, pending count, reviewed-history state, and refresh result. Determine whether work is pending, dependency-locked, empty, or already reviewed before opening a card or choosing a decision.',
    'Read the live exercise context': 'Use the tracker to place every record in the correct move and phase. Observer access is read-only, so treat the state as context for interpretation rather than permission to operate the exercise.',
    'Read the live tracker': 'Confirm Strategic Orientation, move, phase, countdown, and paused or running state before writing. If the tracker and the room disagree, resolve the shared White Cell state instead of attaching work to the wrong window.',
    'Received Proposals': 'Confirm that the proposal was forwarded to this team, then read its terms and recipient-specific history in full. Interpret the current recipient state from the thread rather than from proposal visibility alone.',
    'Red Actions': 'Review the complete Red action in its active move context. Verify narrative, structured fields, and lifecycle state before recording an explicit White Cell outcome.',
    'Responses': 'Separate White Cell rulings, update notices, forwarded items, and general communications. Bring material information back into the owning team workflow before changing a durable artifact.',
    'Review History': 'Use history as an immutable explanation of what White Cell decided, when, and why. Compare revisions and return notes without reopening a closed record through informal edits.',
    'Review NI and escalation': 'Work from the unlocked dependency state through orientation evidence, domain deltas, primary domains, net effect, stage, trajectory, and citations. Approve, override, or return the paired specialist judgment explicitly.',
    'Review the Macro chain': 'Trace the source action through every generated Macro field and supporting citation. Approve only if the complete chain is supportable; an override needs a bounded replacement and rationale, while Send back leaves the seat unresolved.',
    'Review the paired outputs': 'Assess diplomacy coding, information routing, paired preview, and rationale together. A non-routed track is still evidence, and one explicit specialist decision finalizes or returns the pair.',
    'RFIs': 'Use an RFI when the team needs a ruling, clarification, or missing scenario fact. State one decision-blocking question with enough context to answer, and revise the same record if White Cell returns it.',
    'Session Timeline': 'Use filters to reconstruct the run across state changes, artifacts, RFIs, communications, captures, and seat activity. Verify sequence here, then return to the owning record for its current authoritative state.',
    'Sessions': 'Create or select the intended run and verify its name and join code before distribution. Preserve archived and inactive sessions as evidence without allowing them to become the accidental live context.',
    'Simulation Settings': 'Treat move, phase, and timer controls as room-level state changes. Confirm operator intent before acting, make one change at a time, and verify the shared tracker immediately afterward.',
    'Strategic Orientation': 'Review the opening position as a complete pre-Move-One artifact. Confirm the team, orientation, forecasts, rationale, strategy description, expected target actions, and explicit handoff state before accepting or returning it.',
    'Team Action Review': 'Compare the Scribe-forwarded record with the room’s agreed decision. Check completeness, rationale, active move, and lifecycle state, then return to the source artifact for corrections rather than recreating it in the deck.',
    'Team Actions': 'Use the formal team artifact to anchor what was decided and your notes to explain how it happened. Compare the active move, lifecycle state, and rationale without editing from the Notetaker surface.',
    'Team artifacts': 'Read the orientation, action, or proposal together with its lifecycle label and active exercise context. Observer visibility is evidence of the record, not authority to alter or submit it.',
    'Team Dynamics': 'Record the pattern behind the decision: leadership, decision style, friction, consensus, and the move summary. Save when the pattern materially changes or the move closes, preserving your seat-scoped perspective.',
    'Timeline': 'Use chronology to test sequence, identify gaps, and avoid duplicate interpretation. The timeline explains how the session developed; the owning artifact remains authoritative for current workflow state.',
    'Tribe Street Journal': 'Read or prepare reporting with its source context intact. Distinguish observation, selected quote, scenario reporting, and White Cell publication so participants can judge what kind of evidence they are receiving.',
    'Understand the observer boundary': 'Begin by separating access from authority. You may inspect the team’s record and follow the exercise, but opening, scrolling, or understanding an item must never change its workflow state.',
    'Use the explicit decision controls': 'Choose a control only after the complete specialist evidence is visible. Approve accepts the presented output, Override records a replacement with rationale, Send back preserves unresolved work, and handoff seats use Copy followed by Mark done.',
    'Watch the live tracker': 'Use the shared tracker as the reference before and after every operator state change. Announce material changes to the room and confirm that all roles now see the intended move, phase, countdown, and running state.',
    'Your role in the exercise': 'Use this opening step to establish ownership before learning controls. Identify what this seat creates or reviews, what must be handed to another role, and which decisions remain outside your authority.',
    'Your specialist boundary': 'Confirm the queue and decision boundary assigned to this specialist seat. Visibility does not mean an item is ready, and no other operator may approve, override, return, copy, or acknowledge on your behalf.'
});

function cleanPart(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function asSentence(value) {
    const text = cleanPart(value);
    if (!text) return '';
    return /[.!?]$/.test(text) ? text : `${text}.`;
}

function asInlineClause(value) {
    const text = cleanPart(value);
    if (!text || /^[A-Z]{2}/.test(text)) return text;
    return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function getRoleWalkthrough(storageKey, roleLabel) {
    const profile = String(storageKey || '').split(':')[1];
    if (ROLE_WALKTHROUGHS[profile]) return ROLE_WALKTHROUGHS[profile];
    const normalizedLabel = String(roleLabel || '').toLowerCase();
    if (normalizedLabel.includes('observer')) return ROLE_WALKTHROUGHS.observer;
    if (normalizedLabel.includes('notetaker')) return ROLE_WALKTHROUGHS.notetaker;
    if (normalizedLabel.includes('white cell')) return ROLE_WALKTHROUGHS.whitecell;
    if (normalizedLabel.includes('game master')) return ROLE_WALKTHROUGHS.gamemaster;
    if (normalizedLabel.includes('sme') || normalizedLabel.includes('journal')) return ROLE_WALKTHROUGHS.sme;
    return ROLE_WALKTHROUGHS.facilitator;
}

/**
 * Build the exact spoken copy for a Start Here slide from the visible content.
 * Keeping this in one pure function makes stale narration fail closed: a copy
 * change produces a new content-addressed URL until audio is regenerated.
 */
export function buildFollowAlongNarration({ storageKey = '', roleLabel = '', summary = '', step = null } = {}) {
    if (!step) {
        return [
            asSentence(`Welcome to the ${cleanPart(roleLabel)} orientation`),
            asSentence(summary),
            asSentence(getRoleWalkthrough(storageKey, roleLabel))
        ].filter(Boolean).join(' ');
    }

    const detailItems = Array.isArray(step.details) ? step.details.map(cleanPart).filter(Boolean) : [];
    const detailGuide = detailItems.length > 0
        ? `Before you continue, verify these points: ${detailItems.map(asSentence).join(' ')}`
        : '';
    const targetGuide = cleanPart(step.action?.label)
        ? `When you are ready, use ${cleanPart(step.action.label)} to move to the live surface. The guide will not make the workflow decision for you.`
        : cleanPart(step.targetLabel)
            ? `Use the highlighted ${cleanPart(step.targetLabel)} area as your visual reference while you complete this check.`
            : '';

    return [
        asSentence(`Let’s walk through ${cleanPart(step.title)}`),
        asSentence(SURFACE_WALKTHROUGHS[cleanPart(step.title)]),
        asSentence(`On this slide, ${asInlineClause(step.body)}`),
        asSentence(`In practice, ${asInlineClause(step.narrative)}`),
        detailGuide,
        targetGuide
    ].filter(Boolean).join(' ');
}

/** Stable 64-bit, content-addressed identifier with no Web Crypto dependency. */
export function hashFollowAlongNarration(value) {
    const text = String(value || '');
    let high = 0xdeadbeef;
    let low = 0x41c6ce57;

    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        high = Math.imul(high ^ code, 2654435761);
        low = Math.imul(low ^ code, 1597334677);
    }

    high = Math.imul(high ^ (high >>> 16), 2246822507)
        ^ Math.imul(low ^ (low >>> 13), 3266489909);
    low = Math.imul(low ^ (low >>> 16), 2246822507)
        ^ Math.imul(high ^ (high >>> 13), 3266489909);

    return `${(high >>> 0).toString(16).padStart(8, '0')}${(low >>> 0).toString(16).padStart(8, '0')}`;
}

export function getFollowAlongAudioUrl(narration, baseUrl = START_HERE_AUDIO_BASE_URL) {
    const normalized = cleanPart(narration);
    if (!normalized) return null;
    return `${String(baseUrl).replace(/\/$/, '')}/${hashFollowAlongNarration(normalized)}.mp3`;
}

export { START_HERE_AUDIO_BASE_URL };
