import { getGreenSeatModel, GREEN_DELEGATIONS, SHARED_GREEN_MODEL } from '../../core/teamContext.js';

// UI choices only. operator_send_communication independently validates the
// active operator seat, model-valid recipient and persisted delivery audience.
export function greenDeckAssignmentOptions(session = {}) {
    const model = getGreenSeatModel({
        session_topology_version: session.sessionTopologyVersion ?? session.session_topology_version ?? 1,
        green_seat_model: session.greenSeatModel ?? session.green_seat_model ?? null
    });
    if (model === SHARED_GREEN_MODEL) return [
        { value: 'shared', label: 'Shared Green deck — both regional views', roles: ['green_shared_facilitator'] }
    ];
    if (model === 'regional_pairs_v1') return [
        { value: 'both', label: 'Both regional Facilitators — separate assignments',
            roles: ['green_asian_pacific_facilitator', 'green_europe_facilitator'] },
        ...Object.entries(GREEN_DELEGATIONS).map(([id, label]) => ({
            value: id, label: `${label} Facilitator deck only`, roles: [`green_${id}_facilitator`]
        }))
    ];
    return [{ value: 'unified', label: 'Unified Green Facilitator deck', roles: ['green_scribe'] }];
}

export function greenDeckAssignmentRoles(session, scope) {
    const options = greenDeckAssignmentOptions(session);
    const selected = options.find((option) => option.value === scope);
    if (!selected) throw new Error('Choose a deck scope for the confirmed Green session model.');
    return [...selected.roles];
}

export function deckAssignmentScopeLabel(context = {}) {
    if (context.sharedFacilitator) return 'Shared Green deck — unchanged by the working region';
    if (context.teamId === 'green' && GREEN_DELEGATIONS[context.delegationId]) {
        return `${GREEN_DELEGATIONS[context.delegationId]} Facilitator deck only`;
    }
    return context.teamId === 'green' ? 'Unified Green Facilitator deck' : 'Team Facilitator deck';
}
