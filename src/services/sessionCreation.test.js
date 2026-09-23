import { describe, expect, it, vi } from 'vitest';
import { SessionCreation, sessionConfigurationLabel, creationErrorMessage } from './sessionCreation.js';

function fixture() {
    const values = new Map();
    const storage = { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
    const database = { createConfiguredSession: vi.fn() };
    const newKey = vi.fn(() => 'same-key');
    return { storage, database, newKey, flow: new SessionCreation({ storage, database, newKey }) };
}
const input = { name: 'Synthetic creation', session_code: 'GC08', green_configuration: 'shared_facilitator_v1', roster_version: 'green-roster-v1' };

describe('GC08 creation intent recovery', () => {
    it('coalesces double submission before the server responds', async () => {
        const { flow, database, newKey } = fixture();
        let resolve;
        database.createConfiguredSession.mockReturnValue(new Promise((done) => { resolve = done; }));
        const first = flow.submit(input), second = flow.submit(input);
        expect(first).toBe(second);
        expect(database.createConfiguredSession).toHaveBeenCalledTimes(1);
        resolve({ id: 'server-id' });
        await first;
        expect(newKey).toHaveBeenCalledTimes(1);
        expect(flow.pending()).toBeNull();
    });
    it('recovers a lost response after reload with the original configuration and key', async () => {
        const { flow, database, storage, newKey } = fixture();
        database.createConfiguredSession.mockRejectedValueOnce(new TypeError('offline'));
        await expect(flow.submit(input)).rejects.toThrow('offline');
        const restored = new SessionCreation({ storage, database, newKey });
        database.createConfiguredSession.mockResolvedValue({ id: 'same-server-session' });
        await restored.submit({ ...input, green_configuration: 'unified_v1' });
        expect(database.createConfiguredSession).toHaveBeenLastCalledWith(input, 'same-key');
        expect(newKey).toHaveBeenCalledTimes(1);
    });
    it.each(['22023', '23514', '23505'])('permits correction only after a definitive %s rollback', async (code) => {
        const { flow, database } = fixture();
        database.createConfiguredSession.mockRejectedValue({ originalError: { code } });
        await expect(flow.submit(input)).rejects.toBeDefined();
        expect(flow.pending()).toBeNull();
    });
    it('retains uncertain and permission failures and emits no success result', async () => {
        const { flow, database } = fixture();
        database.createConfiguredSession.mockRejectedValue({ originalError: { code: '42501' } });
        await expect(flow.submit(input)).rejects.toBeDefined();
        expect(flow.pending().input).toEqual(input);
        expect(creationErrorMessage({})).toContain('Do not distribute');
    });
    it('never sends without durable recovery storage', async () => {
        const database = { createConfiguredSession: vi.fn() };
        const flow = new SessionCreation({ database, storage: null, newKey: () => 'key' });
        await expect(flow.submit(input)).rejects.toThrow('storage');
        expect(database.createConfiguredSession).not.toHaveBeenCalled();
    });
    it('blocks malformed saved intent and unavailable storage writes without sending or erasing recovery data', async () => {
        for (const storage of [
            { getItem: () => '{broken', removeItem: vi.fn() },
            { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: vi.fn() }
        ]) {
            const database = { createConfiguredSession: vi.fn() };
            const flow = new SessionCreation({ database, storage, newKey: () => 'key' });
            await expect(flow.submit(input)).rejects.toMatchObject({ code: 'GC08_RECOVERY_STORAGE' });
            expect(database.createConfiguredSession).not.toHaveBeenCalled();
            expect(storage.removeItem).not.toHaveBeenCalled();
        }
    });
    it('distinguishes all historical and shared session configurations without backfilling', () => {
        expect(sessionConfigurationLabel({ session_topology_version: null })).toBe('Unified Green');
        expect(sessionConfigurationLabel({ session_topology_version: 2 })).toContain('paired');
        expect(sessionConfigurationLabel({ session_topology_version: 2, green_seat_model: 'shared_facilitator_v1', green_roster_version: 'v1' })).toContain('one Shared');
    });
});
