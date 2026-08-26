import posterUrl from '../../img/fractured_order_poster_.png?url';
import videoUrl from '../../../Plenum Briefing/PLenum Onboarding Video.mp4?url';

export const PLATFORM_OVERVIEW_DURATION_SECONDS = 148;

export const PLATFORM_OVERVIEW_TRANSCRIPT = Object.freeze([
    'Fractured Order is a live economic statecraft simulation. Multiple actors interpret a changing strategic environment, make decisions, communicate, and adapt across several phases of play.',
    'A complex simulation can quickly become difficult to coordinate. Decisions, communications, timing, facilitation, adjudication, and observation may be scattered across disconnected tools and informal processes. That makes it harder to know what is current, who owns the next action, and how an event changed the course of play.',
    'Plenum addresses this problem by providing a shared browser-based operating layer for the exercise. It connects participant workspaces with the control-cell tools needed to run, monitor, document, and review the simulation.',
    'Each role has a defined responsibility within the shared session state. The Scribe records orientations, forecasts, actions, proposals, responses, and Requests for Information. The Facilitator supports team discussion, reviews received proposals, and helps manage interaction. The Notetaker captures team dynamics, alliances, turning points, and the decision process behind the outcome. White Cell manages timing, phases, updates, review, and adjudication, while the Game Master administers sessions and exports the evidence.',
    'During Strategic Orientation and Moves One through Three, Plenum links decisions to timing, communication, review, adjudication, and consequences. Teams can record what they choose, why they choose it, how they coordinate, and how they adapt when new information arrives.',
    'The result is more than a live interface. It is a structured record of the exercise: what teams believed, what they decided, what information they received, how they interacted, and how outcomes developed over time.',
    'Plenum does not replace strategic judgment or facilitation. It gives Statecraft Simulations Group the operational structure to focus on them. It turns a complex exercise into a coordinated, observable, and reviewable simulation.'
]);

export function getPlatformOverviewCaptionsUrl(baseUrl = import.meta.env?.BASE_URL || '/') {
    const normalizedBase = String(baseUrl || '/').endsWith('/')
        ? String(baseUrl || '/')
        : `${baseUrl}/`;
    return `${normalizedBase}onboarding/plenum-onboarding.en.vtt`;
}

export const PLATFORM_OVERVIEW_MEDIA = Object.freeze({
    videoUrl,
    posterUrl,
    captionsUrl: getPlatformOverviewCaptionsUrl(),
    durationSeconds: PLATFORM_OVERVIEW_DURATION_SECONDS,
    durationLabel: '2:28',
    label: 'Plenum platform overview',
    transcript: PLATFORM_OVERVIEW_TRANSCRIPT
});
