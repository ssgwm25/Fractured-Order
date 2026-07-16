import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDatabase } = vi.hoisted(() => ({
    mockDatabase: {
        fetchCommunications: vi.fn()
    }
}));

vi.mock('../services/database.js', () => ({
    database: mockDatabase
}));

vi.mock('../utils/logger.js', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

async function loadCommunicationsStore() {
    vi.resetModules();
    return import('./communications.js');
}

describe('communicationsStore realtime reconciliation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetModules();
    });

    it('reports rows missed during subscription startup without dropping a realtime row', async () => {
        const snapshotRow = {
            id: 'communication-snapshot-gap',
            content: 'Recovered from the startup gap',
            created_at: '2026-07-15T12:00:00.000Z'
        };
        const realtimeRow = {
            id: 'communication-realtime',
            content: 'Already received through realtime',
            created_at: '2026-07-15T12:00:01.000Z'
        };
        const staleRealtimeSnapshot = {
            ...realtimeRow,
            content: 'Stale query copy'
        };
        mockDatabase.fetchCommunications.mockImplementation(async () => {
            // Model a realtime replacement landing while the reconciliation
            // query is in flight.
            communicationsStore.communications = [realtimeRow];
            return [snapshotRow, staleRealtimeSnapshot];
        });

        const { communicationsStore } = await loadCommunicationsStore();
        communicationsStore.sessionId = 'session-1';
        communicationsStore.communications = [staleRealtimeSnapshot];
        const listener = vi.fn();
        communicationsStore.subscribe(listener);

        await expect(communicationsStore.reconcileCommunications()).resolves.toEqual([snapshotRow]);

        expect(communicationsStore.getAll()).toEqual([realtimeRow, snapshotRow]);
        expect(listener).toHaveBeenCalledWith('reconciled', [snapshotRow]);
    });
});
