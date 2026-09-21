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
    it('GC07 removes disappeared private messages and ignores a snapshot arriving after reset', async () => {
        const { communicationsStore } = await loadCommunicationsStore();
        communicationsStore.sessionId = 'regional';
        communicationsStore.communications = [{ id: 'private', delegation_id: 'europe' }];
        mockDatabase.fetchCommunications.mockResolvedValue([]);
        await communicationsStore.reconcileCommunications();
        expect(communicationsStore.getAll()).toEqual([]);
        mockDatabase.fetchCommunications.mockImplementation(async () => {
            communicationsStore.reset();
            return [{ id: 'old-seat-message' }];
        });
        await communicationsStore.reconcileCommunications();
        expect(communicationsStore.getAll()).toEqual([]);
    });
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

    it('deduplicates the same proposal thread round across realtime and reconciliation', async () => {
        const threadMetadata = {
            thread_id: 'thread-blue-1',
            recipient_team: 'blue',
            round_number: 1,
            parent_message_id: 'round-0',
            source_proposal_id: 'proposal-1',
            source_revision: 1,
            source_team: 'green',
            sender_team: 'blue',
            sender_role: 'blue_scribe',
            sent_at: '2026-08-06T12:00:00.000Z',
            message_type: 'recipient_response'
        };
        const realtimeRow = { id: 'round-realtime', type: 'PROPOSAL_RESPONSE', content: 'Accepted', created_at: threadMetadata.sent_at, metadata: threadMetadata };
        const duplicateServerRow = { ...realtimeRow, id: 'round-duplicate' };
        mockDatabase.fetchCommunications.mockResolvedValue([duplicateServerRow]);

        const { communicationsStore } = await loadCommunicationsStore();
        communicationsStore.sessionId = 'session-1';
        communicationsStore.updateFromServer('INSERT', realtimeRow);

        await expect(communicationsStore.reconcileCommunications()).resolves.toEqual([]);
        expect(communicationsStore.getAll()).toHaveLength(1);
        expect(communicationsStore.getAll()[0].metadata).toEqual(threadMetadata);
    });
});
