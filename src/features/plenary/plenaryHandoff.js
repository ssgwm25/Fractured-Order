/**
 * Copy the operator session into a new plenary tab.
 *
 * Operator login lives in sessionStorage, which is per-tab. Opening plenary.html
 * with target=_blank (especially with rel=noopener) therefore shows "No session".
 * White Cell writes a short-lived localStorage handoff; the plenary page applies
 * it before main.js reads storage. Same-origin window.opener is a backup.
 */

export const PLENARY_HANDOFF_KEY = 'esg_plenary_handoff';
export const PLENARY_HANDOFF_MAX_AGE_MS = 120000;
export const PLENARY_WINDOW_NAME = 'fo-plenary';

export function snapshotWebStorage(storage) {
    const entries = {};
    if (!storage || typeof storage.key !== 'function' || typeof storage.getItem !== 'function') {
        return entries;
    }
    for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key) continue;
        entries[key] = storage.getItem(key);
    }
    return entries;
}

export function applyStorageSnapshot(storage, entries = {}) {
    if (!storage || typeof storage.setItem !== 'function') return 0;
    let written = 0;
    for (const [key, value] of Object.entries(entries || {})) {
        if (typeof key !== 'string' || typeof value !== 'string') continue;
        try {
            storage.setItem(key, value);
            written += 1;
        } catch (_error) {
            // Quota / private mode — keep going.
        }
    }
    return written;
}

export function buildPlenaryHandoff(entries, createdAt = Date.now()) {
    return {
        createdAt: Number(createdAt) || Date.now(),
        entries: entries && typeof entries === 'object' ? entries : {}
    };
}

export function isPlenaryHandoffFresh(payload, now = Date.now(), maxAgeMs = PLENARY_HANDOFF_MAX_AGE_MS) {
    const createdAt = Number(payload?.createdAt);
    if (!Number.isFinite(createdAt)) return false;
    return (now - createdAt) >= 0 && (now - createdAt) <= maxAgeMs;
}

export function writePlenaryHandoff({
    sessionStorageRef = typeof window !== 'undefined' ? window.sessionStorage : null,
    localStorageRef = typeof window !== 'undefined' ? window.localStorage : null,
    now = Date.now()
} = {}) {
    if (!localStorageRef || typeof localStorageRef.setItem !== 'function') return false;
    const payload = buildPlenaryHandoff(snapshotWebStorage(sessionStorageRef), now);
    localStorageRef.setItem(PLENARY_HANDOFF_KEY, JSON.stringify(payload));
    return true;
}

function readOpenerSessionEntries(openerRef, locationRef) {
    if (!openerRef || openerRef.closed) return null;
    try {
        if (locationRef?.origin && openerRef.location?.origin !== locationRef.origin) {
            return null;
        }
        return snapshotWebStorage(openerRef.sessionStorage);
    } catch (_error) {
        return null;
    }
}

function consumeLocalHandoff(localStorageRef, now) {
    if (!localStorageRef || typeof localStorageRef.getItem !== 'function') return null;
    const raw = localStorageRef.getItem(PLENARY_HANDOFF_KEY);
    if (!raw) return null;
    try {
        localStorageRef.removeItem(PLENARY_HANDOFF_KEY);
    } catch (_error) {
        // Still try to parse.
    }
    try {
        const payload = JSON.parse(raw);
        if (!isPlenaryHandoffFresh(payload, now)) return null;
        return payload.entries || null;
    } catch (_error) {
        return null;
    }
}

/**
 * Run before sessionStore / Supabase read storage.
 * @returns {{ adopted: boolean, source: 'opener'|'handoff'|null }}
 */
export function adoptPlenarySession({
    sessionStorageRef = typeof window !== 'undefined' ? window.sessionStorage : null,
    localStorageRef = typeof window !== 'undefined' ? window.localStorage : null,
    openerRef = typeof window !== 'undefined' ? window.opener : null,
    locationRef = typeof window !== 'undefined' ? window.location : null,
    now = Date.now()
} = {}) {
    const openerEntries = readOpenerSessionEntries(openerRef, locationRef);
    if (openerEntries && Object.keys(openerEntries).length) {
        applyStorageSnapshot(sessionStorageRef, openerEntries);
        consumeLocalHandoff(localStorageRef, now);
        return { adopted: true, source: 'opener' };
    }

    const handoffEntries = consumeLocalHandoff(localStorageRef, now);
    if (handoffEntries && Object.keys(handoffEntries).length) {
        applyStorageSnapshot(sessionStorageRef, handoffEntries);
        return { adopted: true, source: 'handoff' };
    }

    return { adopted: false, source: null };
}

export function bindPlenaryBoardOpener(button, {
    sessionStorageRef = typeof window !== 'undefined' ? window.sessionStorage : null,
    localStorageRef = typeof window !== 'undefined' ? window.localStorage : null,
    windowRef = typeof window !== 'undefined' ? window : null
} = {}) {
    if (!button || button.dataset.plenaryHandoffBound === 'true') return () => {};
    button.dataset.plenaryHandoffBound = 'true';

    const arm = () => writePlenaryHandoff({ sessionStorageRef, localStorageRef });
    const onClick = (event) => {
        arm();
        const href = button.getAttribute('href');
        if (!href || !windowRef?.open) return;
        event.preventDefault();
        windowRef.open(href, PLENARY_WINDOW_NAME);
    };

    button.addEventListener('pointerdown', arm);
    button.addEventListener('click', onClick);
    return () => {
        button.removeEventListener('pointerdown', arm);
        button.removeEventListener('click', onClick);
        delete button.dataset.plenaryHandoffBound;
    };
}
