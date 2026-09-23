import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockDatabase } = vi.hoisted(() => ({
    mockDatabase: {
        fetchActions: vi.fn(),
        fetchRequests: vi.fn(),
        fetchTimeline: vi.fn()
    }
}));

vi.mock('../services/database.js', () => ({ database: mockDatabase }));
vi.mock('../utils/logger.js', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));

describe('workflow store reconnect reconciliation', () => {
    it('GC08 ignores timeline responses after teardown and same-session reinitialization', async () => {
        const { timelineStore } = await import('./timeline.js');
        timelineStore.sessionId = 'regional';
        mockDatabase.fetchTimeline.mockImplementation(async () => {
            timelineStore.reset();
            timelineStore.sessionId = 'regional';
            return [{ id: 'old-private-event', created_at: '2026-09-21T00:00:00Z' }];
        });
        await timelineStore.loadEvents();
        expect(timelineStore.getAll()).toEqual([]);
    });
    it('GC08 removes actions absent from the authorized snapshot and rejects late responses after same-session reset', async () => {
        const { actionsStore } = await import('./actions.js');
        actionsStore.sessionId = 'regional';
        actionsStore.actions = [{ id: 'previously-readable', delegation_id: 'europe' }];
        mockDatabase.fetchActions.mockResolvedValue([]);
        await actionsStore.reconcileActions();
        expect(actionsStore.getAll()).toEqual([]);
        mockDatabase.fetchActions.mockImplementation(async () => {
            actionsStore.reset();
            actionsStore.sessionId = 'regional';
            return [{ id: 'old-context' }];
        });
        await actionsStore.reconcileActions();
        expect(actionsStore.getAll()).toEqual([]);
        await actionsStore.loadActions();
        expect(actionsStore.getAll()).toEqual([]);
        await actionsStore.initialize('regional');
        expect(actionsStore.initialized).toBe(false);
    });
    it('GC07 removes cached RFIs absent from the authorized snapshot and ignores a response after reset', async () => {
        const { requestsStore } = await import('./requests.js');
        requestsStore.sessionId = 'regional';
        requestsStore.requests = [{ id: 'private', delegation_id: 'europe' }];
        mockDatabase.fetchRequests.mockResolvedValue([]);
        await requestsStore.reconcileRequests();
        expect(requestsStore.getAll()).toEqual([]);
        mockDatabase.fetchRequests.mockImplementation(async () => {
            requestsStore.reset();
            return [{ id: 'old-seat-record' }];
        });
        await requestsStore.reconcileRequests();
        expect(requestsStore.getAll()).toEqual([]);
    });
    afterEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('reports a missed artifact submission once and preserves a realtime replacement', async () => {
        const stale = { id: 'action-1', workflow_state: 'forwarded_to_facilitator', revision_number: 1 };
        const missed = { id: 'action-1', workflow_state: 'submitted_to_white_cell', revision_number: 1, updated_at: '2026-08-10T12:00:00.000Z' };
        const realtime = { id: 'action-2', workflow_state: 'submitted_to_white_cell', revision_number: 1, updated_at: '2026-08-10T12:00:01.000Z' };
        mockDatabase.fetchActions.mockImplementation(async () => {
            actionsStore.actions.push(realtime);
            return [missed];
        });

        const { actionsStore } = await import('./actions.js');
        actionsStore.sessionId = 'session-1';
        actionsStore.actions = [stale];
        const listener = vi.fn();
        actionsStore.subscribe(listener);

        await expect(actionsStore.reconcileActions()).resolves.toEqual([missed]);
        expect(actionsStore.getAll()).toEqual(expect.arrayContaining([missed, realtime]));
        expect(listener).toHaveBeenCalledWith('reconciled', [missed]);

        await actionsStore.reconcileActions();
        expect(listener).toHaveBeenLastCalledWith('reconciled', []);
    });

    it('reports missed RFI return/answer state by persisted request ID and revision', async () => {
        const before = { id: 'rfi-1', workflow_state: 'submitted_to_white_cell', revision_number: 1 };
        const answered = {
            id: 'rfi-1', status: 'answered', workflow_state: 'completed', revision_number: 1,
            responded_at: '2026-08-10T12:05:00.000Z'
        };
        mockDatabase.fetchRequests.mockResolvedValue([answered]);

        const { requestsStore } = await import('./requests.js');
        requestsStore.sessionId = 'session-1';
        requestsStore.requests = [before];
        const listener = vi.fn();
        requestsStore.subscribe(listener);

        await expect(requestsStore.reconcileRequests()).resolves.toEqual([answered]);
        expect(listener).toHaveBeenCalledWith('reconciled', [answered]);
    });
});
