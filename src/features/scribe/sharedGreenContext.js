import { getConfirmedSeat, onSeatCleanup, seatStorageKey } from '../../core/seatContext.js';
import { GREEN_DELEGATIONS, SHARED_GREEN_FACILITATOR, SHARED_GREEN_MODEL } from '../../core/teamContext.js';

export const SHARED_GREEN_WORKFLOW_NOTICE = 'Submit each region’s Scribe-forwarded Strategic Orientation independently. White Cell returns go to the originating Scribe for correction and a new handoff. Proposal submission and replies, RFI creation and direct messages are not yet enabled.';

function resolveViewStorage() {
    try { return globalThis.sessionStorage; } catch { return null; }
}

export function readSharedGreenView(seat, storage = resolveViewStorage()) {
    if (seat?.role !== SHARED_GREEN_FACILITATOR || seat.greenSeatModel !== SHARED_GREEN_MODEL) return null;
    let value;
    try { value = storage?.getItem(seatStorageKey('working-delegation', seat)); } catch { /* Storage is optional. */ }
    return Object.hasOwn(GREEN_DELEGATIONS, value) ? value : 'asian_pacific';
}

export function selectSharedGreenView(seat, delegation, storage = resolveViewStorage()) {
    if (!getConfirmedSeat() || seatStorageKey('', seat) !== seatStorageKey('', getConfirmedSeat()) || seat?.role !== SHARED_GREEN_FACILITATOR
        || seat.greenSeatModel !== SHARED_GREEN_MODEL || !Object.hasOwn(GREEN_DELEGATIONS, delegation)) {
        throw new Error('Revalidate your shared Facilitator seat before changing regional view.');
    }
    try { storage?.setItem(seatStorageKey('working-delegation', seat), delegation); } catch { /* View still works in memory. */ }
    return delegation;
}

export function mountSharedGreenContext(seat, onChange) {
    if (seat?.role !== SHARED_GREEN_FACILITATOR) return null;
    const host = document.getElementById('main-content');
    if (!host) return null;
    const panel = document.createElement('section');
    panel.className = 'card card-bordered p-4';
    panel.setAttribute('aria-label', 'Shared Green Facilitator regional context');
    const label = document.createElement('label');
    label.htmlFor = 'sharedGreenWorkingRegion';
    label.textContent = 'Regional records';
    const select = document.createElement('select');
    select.id = label.htmlFor;
    select.className = 'form-select';
    select.setAttribute('aria-describedby', 'sharedGreenWorkflowNotice');
    for (const [value, text] of Object.entries(GREEN_DELEGATIONS)) {
        const option = document.createElement('option');
        option.value = value; option.textContent = text;
        select.append(option);
    }
    select.value = readSharedGreenView(seat);
    const notice = document.createElement('p');
    notice.id = 'sharedGreenWorkflowNotice';
    notice.textContent = SHARED_GREEN_WORKFLOW_NOTICE;
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const update = () => {
        const delegation = selectSharedGreenView(seat, select.value);
        status.textContent = `Viewing ${GREEN_DELEGATIONS[delegation]}. Your seat serves both regions; the support deck is shared.`;
        onChange(delegation);
    };
    select.addEventListener('change', update);
    panel.append(label, select, notice, status);
    host.prepend(panel);
    update();
    const stop = onSeatCleanup((removed) => {
        if (seatStorageKey('', removed) !== seatStorageKey('', seat)) return;
        select.disabled = true; panel.remove(); stop();
    });
    return panel;
}
