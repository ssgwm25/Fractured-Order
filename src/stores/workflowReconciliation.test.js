import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockDatabase } = vi.hoisted(() => ({
    mockDatabase: {
        fetchActions: vi.fn(),
        fetchRequests: vi.fn()
    }
}));

vi.mock('../services/database.js', () => ({ database: mockDatabase }));
vi.mock('../utils/logger.js', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));

describe('workflow store reconnect reconciliation', () => {
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
