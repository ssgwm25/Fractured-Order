import { database } from './database.js';
import { sessionStore } from '../stores/session.js';
import { validateSeatEnvelope, validateSeatRoute } from '../core/seatContext.js';
import { getCurrentAppRelativePath, navigateToApp } from '../core/navigation.js';
import { getRoleDisplayName } from '../core/teamContext.js';
// Register regional IndexedDB cleanup on every participant workspace, including
// semantic Scribes whose legacy facilitator controller does not read decks.
import '../features/scribe/deckStorage.js';

let startupPromise = null;

export async function restoreConfirmedSeat({ checkRoute = true, locationRef = window.location } = {}) {
    const sessionId = sessionStore.getSessionId();
    const participantId = sessionStore.getSessionParticipantId();
    if (!sessionId || !participantId) throw new Error('Invalid session. Join a session to continue.');
    const envelope = await database.restoreSessionSeatContext(sessionId, participantId);
    const seat = validateSeatEnvelope(envelope, { sessionId, participantId });
    // Ignore late results after logout or another join.
    if (sessionStore.getSessionId() !== sessionId || sessionStore.getSessionParticipantId() !== participantId) {
        throw new Error('Session changed. Rejoin to continue.');
    }
    if (checkRoute) validateSeatRoute(seat, locationRef);
    sessionStore.confirmSeat(seat);
    return seat;
}

export function renderSeatGate(message, { retry = false, busy = false } = {}) {
    const shells = document.querySelectorAll('.app-layout, .scribe-shell');
    shells.forEach((shell) => { shell.hidden = true; shell.inert = true; });
    let panel = document.getElementById('seatContextStatus');
    if (!panel) {
        panel = document.createElement('section');
        panel.id = 'seatContextStatus';
        panel.className = 'card card-bordered p-4';
        panel.setAttribute('aria-live', 'polite');
        panel.setAttribute('tabindex', '-1');
        document.body.prepend(panel);
    }
    panel.replaceChildren();
    panel.hidden = false;
    panel.setAttribute('role', busy ? 'status' : 'alert');
    panel.setAttribute('aria-busy', String(busy));
    const copy = document.createElement('p');
    copy.textContent = message;
    panel.append(copy);
    if (retry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-primary';
        button.textContent = 'Retry session validation';
        button.addEventListener('click', () => window.location.reload());
        panel.append(button);
    }
    if (!busy) {
        const join = document.createElement('button');
        join.type = 'button';
        join.className = 'btn btn-secondary';
        join.textContent = 'Return to join';
        join.addEventListener('click', () => navigateToApp(''));
        panel.append(join);
        panel.focus();
    }
}

export function ensureSeatStartup() {
    const route = getCurrentAppRelativePath();
    if (!/^teams\//.test(route)) return Promise.resolve(true);
    // Preserve the historical observer entry contract, which has no role seat.
    if (sessionStore.getRole() === 'viewer' && !sessionStore.getSessionParticipantId()
        && !new URLSearchParams(window.location.search).has('delegation')) {
        return Promise.resolve(true);
    }
    if (!startupPromise) {
        renderSeatGate('Validating session and delegation…', { busy: true });
        startupPromise = restoreConfirmedSeat().then((seat) => {
            document.querySelectorAll('.app-layout, .scribe-shell').forEach((shell) => {
                shell.hidden = false; shell.inert = false;
            });
            const panel = document.getElementById('seatContextStatus');
            if (panel) panel.hidden = true;
            const label = document.getElementById('sessionRoleLabel');
            if (label) label.textContent = getRoleDisplayName(seat.role);
            document.title = `Fractured Order | ${getRoleDisplayName(seat.role)}`;
            return true;
        }).catch((error) => {
            sessionStore.invalidateSeat();
            const permissionDenied = error.code === '42501' || error.originalError?.code === '42501'
                || /SEAT_REVOKED|INVALID_SESSION_SEAT|SEAT_REJOIN_REQUIRED/.test(error.message);
            const message = permissionDenied
                ? 'Session permission denied. Your seat is unavailable, removed or replaced. Return to join or contact the operator.'
                : `Session unavailable: ${error.message} Retry validation, or return to join.`;
            renderSeatGate(message, { retry: true });
            return false;
        });
    }
    return startupPromise;
}
