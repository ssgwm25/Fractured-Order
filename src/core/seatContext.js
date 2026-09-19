import { getRoleRoute, parseTeamRole, getGreenSeatModel, SHARED_GREEN_MODEL, SHARED_GREEN_FACILITATOR } from './teamContext.js';

// Memory only: persisted state is a rejoin hint, never confirmed authority.
let confirmedSeat = null;
const cleanupListeners = new Set();
export function onSeatCleanup(callback) { cleanupListeners.add(callback); return () => cleanupListeners.delete(callback); }
export function bindControllerSeatCleanup(controller) {
    const seat = confirmedSeat;
    if (!seat) return;
    const unsubscribe = onSeatCleanup((removed) => {
        if (seatStorageKey('', seat) !== seatStorageKey('', removed)) return;
        controller.seatInvalidated = true;
        controller.storeUnsubscribers?.forEach((stop) => stop?.());
        controller.dynamicsAutoSaveDebounce?.cancel?.();
        controller.allianceAutoSaveDebounce?.cancel?.();
        controller.onboarding?.destroy?.();
        Object.values(controller).forEach((value) => {
            if (Array.isArray(value)) value.length = 0;
            else if (value instanceof Map || value instanceof Set) value.clear();
        });
        unsubscribe();
    });
}
export function getConfirmedSeat() { return confirmedSeat; }
export function setConfirmedSeat(seat) { confirmedSeat = seat; }

export function validateSeatEnvelope(envelope, { sessionId, participantId } = {}) {
    const seat = envelope?.seat;
    const session = envelope?.session;
    const parsed = parseTeamRole(seat?.role);
    const topology = session?.session_topology_version;
    let greenSeatModel;
    try { greenSeatModel = getGreenSeatModel(session); } catch { /* Invalid envelope below. */ }
    const shared = parsed.sharedFacilitator === true;
    if (!seat?.id || seat.id !== participantId || seat.session_id !== sessionId
        || session?.id !== sessionId || session.status !== 'active'
        || !greenSeatModel || !parsed.surface
        || (seat.green_seat_model != null && seat.green_seat_model !== greenSeatModel)
        || seat.is_active !== true || seat.revoked_at || seat.left_at || seat.disconnected_at
        || (seat.delegation_id ?? null) !== (parsed.delegationId ?? null)
        || (parsed.delegationId && topology !== 2)
        || (shared && greenSeatModel !== SHARED_GREEN_MODEL)
        || (greenSeatModel === SHARED_GREEN_MODEL && parsed.delegationId && parsed.semanticRole === 'facilitator')
        || (topology === 2 && parsed.teamId === 'green' && !parsed.delegationId && !shared)) {
        throw new Error('Invalid session seat. Rejoin or contact the operator.');
    }
    return Object.freeze({
        sessionId, participantId: seat.id, role: seat.role, topology, greenSeatModel,
        teamId: parsed.teamId, delegationId: parsed.delegationId ?? null,
        surface: parsed.surface, displayName: seat.display_name_snapshot || seat.display_name || '',
        sessionName: session.name, sessionCode: session.session_code
    });
}

export function validateSeatRoute(seat, locationRef, { basePath } = {}) {
    const expected = getRoleRoute(seat.role, { basePath });
    const expectedUrl = new URL(expected, 'https://app.local');
    const params = new URLSearchParams(locationRef?.search || '');
    if (locationRef?.pathname !== expectedUrl.pathname
        || ['session', 'delegation', 'role', 'team', 'mode'].some((key) => params.getAll(key).length > 1)
        || (params.has('session') && params.get('session') !== seat.sessionId)
        || (params.has('delegation') && params.get('delegation') !== seat.delegationId)
        || (params.has('role') && params.get('role') !== seat.role)
        || (params.has('team') && params.get('team') !== seat.teamId)
        || ['mode', 'green_seat_model', 'seat_model', 'topology', 'session_topology_version'].some((key) => params.has(key))) {
        throw new Error('Permission error: this route does not match your confirmed session seat.');
    }
    return true;
}

export function seatStorageKey(key, seat = confirmedSeat) {
    if (!seat) return key;
    const model = seat.greenSeatModel === SHARED_GREEN_MODEL ? `:${SHARED_GREEN_MODEL}` : '';
    return `gc04:${[seat.sessionId, seat.topology, seat.teamId, seat.delegationId || (model ? 'shared' : 'unified'), seat.role, seat.participantId].map(encodeURIComponent).join(':')}${model}:${key}`;
}

// Working view is never authority. Require an explicit owner for drafts and
// other regional working state in the shared workspace; the deck stays global
// to this seat. No fallback to the previous region or a unified draft key.
export function regionalSeatStorageKey(key, delegationId, seat = confirmedSeat) {
    if (!seat || !['asian_pacific', 'europe'].includes(delegationId)
        || seat.teamId !== 'green' || seat.topology !== 2
        || (seat.delegationId !== delegationId
            && !(seat.role === SHARED_GREEN_FACILITATOR && seat.greenSeatModel === SHARED_GREEN_MODEL))) {
        throw new Error('Regional state does not match the confirmed seat.');
    }
    return seatStorageKey(`region:${delegationId}:${key}`, seat);
}

export function clearSeatLocalState(seat = confirmedSeat) {
    if (!seat) return;
    cleanupListeners.forEach((callback) => {
        try { callback(seat); } catch { /* A UI cleanup failure cannot retain authority. */ }
    });
    const prefix = seatStorageKey('', seat);
    for (const name of ['localStorage', 'sessionStorage']) {
        try {
            const storage = globalThis[name] || globalThis.window?.[name];
            const keys = Array.from({ length: storage?.length || 0 }, (_, index) => storage.key(index));
            keys.filter((key) => key?.startsWith(prefix)).forEach((key) => storage.removeItem(key));
        } catch { /* Storage unavailable: in-memory state is still invalidated. */ }
    }
}
