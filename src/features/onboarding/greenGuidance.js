// Presentation only: callers supply context derived from the confirmed seat.
// This guide never authorizes a workflow or changes the session's roster/model.
export const GREEN_ROSTER_GUIDANCE = 'Documented roster: Asia-Pacific — South Korea (ROK), Japan, ASEAN; Europe — UK, France, EU. Exercise activation requires a separately approved operational roster; synthetic rehearsal fixtures are not exercise approval.';
export const GREEN_MEDIA_GAP = 'Current Green workflow guidance is text-only. The overview video and existing narration predate these regional workflows; no replacement narration has been approved. Use this guide and its text transcript for current instructions.';
export const GREEN_DECK_LIMIT = 'Repository decks work across browsers. Uploaded HTML remains in this browser profile; an assignment notice does not transfer the file. If unavailable, the default deck is shown with a warning. Ask White Cell for a repository deck or the correct local file.';

export function adaptGreenGuide(guide, context = {}, semanticRole) {
    if (context.teamId !== 'green') return guide;
    const regional = Boolean(context.delegationId || context.sharedFacilitator);
    const shared = Boolean(context.sharedFacilitator || context.scribeRole === 'green_shared_facilitator');
    const staffing = regional
        ? shared
            ? 'Two regional Scribes hand off separately to one shared Green Facilitator. There is one global move, phase and timer.'
            : 'This existing paired session has a Scribe and Facilitator for each region. Work only in your assigned region; each Facilitator keeps its own deck.'
        : 'This is a unified Green session. Keep its existing team ownership and handoff; do not relabel historical Green records as regional.';
    const ownership = semanticRole === 'facilitator'
        ? regional
            ? 'Review each region’s Scribe-forwarded orientation and proposal, then submit each separately to White Cell. You can edit forwarded and returned proposal drafts; White Cell submission waits for the originating Scribe to hand off the current revision; private drafts and notes remain inaccessible.'
            : 'Review the Green Scribe’s handoff and submit the team record to White Cell. Preserve the existing unified workflow and its revisions.'
        : semanticRole === 'notetaker'
            ? regional
                ? `You occupy the existing ${context.teamLabel} Notetaker seat. The two regional Notetakers retain separate seat-scoped notes and regional captures. Do not combine the other region’s private notes or infer participant decisions.`
                : 'Keep your existing Notetaker seat and its scoped notes. Observe decisions without creating or submitting the team artifact.'
            : regional
                ? `Author only ${context.teamLabel} orientations and proposals. Forecast Blue and use the existing orientation catalogue. Forward to ${shared ? 'the shared Green Facilitator' : 'your regional Facilitator'}; after a White Cell return, correct the same record and hand off the new revision.`
                : 'Author the unified Green record and use the existing explicit Facilitator handoff. White Cell owns review; never infer a submission from visibility.';

    const replace = {
        'Your role in the exercise': [ownership, staffing],
        'RFIs': semanticRole === 'scribe'
            ? ['Read the RFIs and White Cell answers authorized for your team or region. The Facilitator creates and corrects RFIs.', 'Ask your Facilitator to raise the question. Scribes cannot create, correct or answer RFIs.']
            : regional
                ? ['Create RFIs and direct messages to White Cell for the owning region. Correct a returned RFI using the same record and revision.', 'In a shared session, choose the region before opening the form. Switching views does not move its ownership. Reload stale records before retrying.']
                : ['Create RFIs for the unified Green team. Correct a returned RFI using the same record and revision.', 'Use RFIs for rulings or missing scenario information; keep direct coordination in Communications.'],
        'Communications': regional ? ['Send direct operational messages to White Cell for your region and read messages explicitly addressed to your seat.', 'The shared Facilitator chooses a region before composing. Switching views does not broaden a private recipient or move the message owner.'] : null,
        'Build proposals': [ownership, 'Keep the persisted delegation, artifact and revision. A return preserves earlier evidence and requires a fresh Scribe handoff.'],
        'Team Action Review': [ownership, 'Orientations keep the existing Blue prerequisite and catalogue. Projection does not equal submission. White Cell controls review and the shared clock.'],
        'Proposals': regional ? ['Use only approved recipient threads for the current proposal revision and owning delegation.', 'Read and reply within that recipient’s thread. Another recipient or region never inherits its negotiation; a returned or old revision cannot accept new rounds.'] : null,
        'Received Proposals': regional ? [semanticRole === 'scribe' ? 'Read the proposal exchanges released to your own region. The Facilitator manages authorized replies.' : 'Read the approved recipient-specific proposal and its released rounds.', 'Keep negotiation attached to its source delegation, recipient and revision. Visibility does not grant reply authority.'] : null,
        'Deck': [shared ? 'Use one assigned support deck for both regions. Changing the working view never changes this shared assignment.' : 'Use the assigned support deck for your existing team or regional Facilitator.', GREEN_DECK_LIMIT],
        'Quick Capture': regional && semanticRole === 'notetaker'
            ? ['Append observations, moments and quotes to your private move notes for your assigned region.', 'Captures remain seat-scoped and are not published to the shared timeline. Formal decisions remain the Scribe’s responsibility.'] : null,
        'Team Dynamics': regional && semanticRole === 'notetaker'
            ? ['Save leadership, friction and consensus notes privately for this seat and move.', 'Manual saves do not publish to the shared timeline. After a conflict or uncertain save, keep your text and reload saved notes before retrying.'] : null,
        'Alliance Tracking': regional && semanticRole === 'notetaker'
            ? ['Save alliance notes privately for this seat and move.', 'Reload after an uncertain save before retrying. A save must preserve the latest dynamics and captures for your seat.'] : null,
        'Timeline': regional && semanticRole === 'notetaker'
            ? ['Review authorized session events alongside your private captures for the current move.', 'Your private move notes and manual saves do not become shared timeline records.'] : null
    };
    const steps = guide.steps.map((step) => {
        const copy = replace[step.title];
        return copy ? { ...step, body: copy[0], narrative: copy[1], details: [] } : step;
    });
    return {
        ...guide,
        textOnly: true,
        mediaNotice: GREEN_MEDIA_GAP,
        summary: `${staffing} ${ownership}`,
        steps: [
            { title: 'Green staffing and ownership', body: staffing, narrative: ownership,
                details: [GREEN_ROSTER_GUIDANCE, 'Existing sessions retain their frozen roster and historical evidence.'] },
            ...(context.sharedFacilitator ? [{ title: 'Choose the working region',
                body: 'Use Asia-Pacific or Europe to review that region’s work. Your shared seat owns neither region.',
                narrative: 'Regional drafts and message forms stay separate. The deck assignment stays shared across view changes and reloads.',
                targetLabel: 'Working region', highlight: '.shared-green-context select',
                action: { label: 'Focus working region', selector: '.shared-green-context select', activate: false } }] : []),
            ...steps,
            { title: 'Announcements and recovery',
                body: 'Intercom is a live session-wide announcement to Scribes, including both regional Green Scribes when enabled. Use Click to play if browser autoplay is blocked.',
                narrative: 'It is not a private regional channel or a durable message inbox. Request an addressed White Cell text message for missed or inaccessible audio. Reconnect through the normal seat restore; permission denial requires operator help, not another region’s seat.',
                details: ['A revoked seat may be cleared by the next heartbeat rather than immediate push delivery.', GREEN_MEDIA_GAP] }
        ]
    };
}
