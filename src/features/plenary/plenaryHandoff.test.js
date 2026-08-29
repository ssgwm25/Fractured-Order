import { describe, expect, it, vi } from 'vitest';
import {
    PLENARY_HANDOFF_KEY,
    adoptPlenarySession,
    applyStorageSnapshot,
    bindPlenaryBoardOpener,
    buildPlenaryHandoff,
    isPlenaryHandoffFresh,
    snapshotWebStorage,
    writePlenaryHandoff
} from './plenaryHandoff.js';

function memoryStorage(seed = {}) {
    const map = new Map(Object.entries(seed));
    return {
        get length() { return map.size; },
        key(index) { return [...map.keys()][index] ?? null; },
        getItem(key) { return map.has(key) ? map.get(key) : null; },
        setItem(key, value) { map.set(key, String(value)); },
        removeItem(key) { map.delete(key); },
        _map: map
    };
}

describe('plenaryHandoff', () => {
    it('snapshots and restores web storage entries', () => {
        const source = memoryStorage({ esg_session_id: 'session-1', esg_role: 'whitecell_lead' });
        const dest = memoryStorage();
        const entries = snapshotWebStorage(source);
        expect(entries).toEqual({ esg_session_id: 'session-1', esg_role: 'whitecell_lead' });
        expect(applyStorageSnapshot(dest, entries)).toBe(2);
        expect(dest.getItem('esg_session_id')).toBe('session-1');
    });

    it('rejects expired handoffs', () => {
        const payload = buildPlenaryHandoff({ esg_session_id: 'session-1' }, 1_000);
        expect(isPlenaryHandoffFresh(payload, 1_000 + 119_000)).toBe(true);
        expect(isPlenaryHandoffFresh(payload, 1_000 + 121_000)).toBe(false);
    });

    it('writes a localStorage handoff from sessionStorage', () => {
        const sessionStorageRef = memoryStorage({ esg_session_id: 'admin-session' });
        const localStorageRef = memoryStorage();
        writePlenaryHandoff({ sessionStorageRef, localStorageRef, now: 50 });
        const stored = JSON.parse(localStorageRef.getItem(PLENARY_HANDOFF_KEY));
        expect(stored.createdAt).toBe(50);
        expect(stored.entries.esg_session_id).toBe('admin-session');
    });

    it('adopts a fresh localStorage handoff and consumes it', () => {
        const sessionStorageRef = memoryStorage();
        const localStorageRef = memoryStorage({
            [PLENARY_HANDOFF_KEY]: JSON.stringify(buildPlenaryHandoff({
                esg_session_id: 'admin-session',
                esg_operator_auth: '{"surfaces":["whitecell"]}'
            }, 10_000))
        });
        const result = adoptPlenarySession({
            sessionStorageRef,
            localStorageRef,
            openerRef: null,
            now: 10_500
        });
        expect(result).toEqual({ adopted: true, source: 'handoff' });
        expect(sessionStorageRef.getItem('esg_session_id')).toBe('admin-session');
        expect(localStorageRef.getItem(PLENARY_HANDOFF_KEY)).toBeNull();
    });

    it('prefers same-origin opener sessionStorage over a stale handoff', () => {
        const sessionStorageRef = memoryStorage();
        const localStorageRef = memoryStorage({
            [PLENARY_HANDOFF_KEY]: JSON.stringify(buildPlenaryHandoff({ esg_session_id: 'stale' }, 1))
        });
        const openerRef = {
            closed: false,
            location: { origin: 'https://ssgwm25.github.io' },
            sessionStorage: memoryStorage({ esg_session_id: 'live-session' })
        };
        const result = adoptPlenarySession({
            sessionStorageRef,
            localStorageRef,
            openerRef,
            locationRef: { origin: 'https://ssgwm25.github.io' },
            now: 1
        });
        expect(result.source).toBe('opener');
        expect(sessionStorageRef.getItem('esg_session_id')).toBe('live-session');
        expect(localStorageRef.getItem(PLENARY_HANDOFF_KEY)).toBeNull();
    });

    it('arms the White Cell open button to write a handoff before opening', () => {
        const listeners = {};
        const button = {
            dataset: {},
            href: './plenary.html',
            getAttribute: (name) => (name === 'href' ? './plenary.html' : null),
            addEventListener: (type, fn) => { listeners[type] = fn; },
            removeEventListener: vi.fn()
        };
        const sessionStorageRef = memoryStorage({ esg_session_id: 'admin-session' });
        const localStorageRef = memoryStorage();
        const windowRef = { open: vi.fn() };
        bindPlenaryBoardOpener(button, { sessionStorageRef, localStorageRef, windowRef });
        listeners.pointerdown();
        expect(JSON.parse(localStorageRef.getItem(PLENARY_HANDOFF_KEY)).entries.esg_session_id)
            .toBe('admin-session');
        listeners.click({ preventDefault: vi.fn() });
        expect(windowRef.open).toHaveBeenCalledWith('./plenary.html', 'fo-plenary');
    });
});
