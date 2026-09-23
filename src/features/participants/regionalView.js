import { GREEN_DELEGATIONS, parseTeamRole } from '../../core/teamContext.js';

export function regionalAttribution(row = {}) {
    const region = row.delegation_id || row.recipient_delegation_id || row.sender_delegation_id
        || parseTeamRole(row.role).delegationId;
    if (GREEN_DELEGATIONS[region]) return GREEN_DELEGATIONS[region];
    if (row.role === 'green_shared_facilitator') return 'Shared Green Facilitator — both regions';
    if (row.recipient_scope === 'both_green_delegations') return 'Both Green delegations';
    return '';
}

export function matchesRegionalView(row, region) {
    if (!region) return true;
    return row.delegation_id === region || row.recipient_delegation_id === region
        || row.sender_delegation_id === region || parseTeamRole(row.role).delegationId === region
        || row.role === 'green_shared_facilitator' || row.recipient_scope === 'both_green_delegations'
        || row.recipient_scope === 'session';
}

// Presentation only: every input row must already come from an authorized read.
// Keep the control outside the rerendered list so keyboard focus is retained.
export function regionalView(container, rows, refresh, { sessionId = '', regional = false } = {}) {
    if (!container?.parentElement) return rows;
    let control = container._regionalView;
    if (!control) {
        const label = document.createElement('label');
        label.className = 'form-label';
        label.textContent = 'Green delegation view ';
        const select = document.createElement('select');
        select.className = 'form-input';
        select.innerHTML = '<option value="">All streams</option><option value="asian_pacific">Asia-Pacific</option><option value="europe">Europe</option>';
        label.append(select);
        container.before(label);
        control = container._regionalView = { label, select, sessionId };
        select.addEventListener('change', () => control.refresh());
    }
    if (control.sessionId !== sessionId) { control.select.value = ''; control.sessionId = sessionId; }
    control.refresh = refresh;
    control.label.hidden = !regional && !rows.some((row) => regionalAttribution(row));
    if (control.label.hidden) control.select.value = '';
    return rows.filter((row) => matchesRegionalView(row, control.select.value));
}
