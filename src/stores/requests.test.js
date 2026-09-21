import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockUpdateRequest } = vi.hoisted(() => ({
    mockUpdateRequest: vi.fn()
}));

vi.mock('../services/database.js', () => ({
    database: {
        updateRequest: mockUpdateRequest
    }
}));

async function loadRequestsStore() {
    vi.resetModules();
    return import('./requests.js');
}

describe('RequestsStore RFI resubmission', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('updates the returned RFI in place and preserves its identity', async () => {
        const { requestsStore } = await loadRequestsStore();
        requestsStore.sessionId = 'session-1';
        requestsStore.requests = [{
            id: 'rfi-1',
            session_id: 'session-1',
            team: 'industry',
            query: 'Which period?',
            categories: ['Other'],
            status: 'pending',
            workflow_state: 'returned_to_team',
            revision_number: 2
        }];
        mockUpdateRequest.mockResolvedValue({
            ...requestsStore.requests[0],
            query: 'Which reporting period applies?',
            workflow_state: 'resubmitted',
            revision_number: 2
        });
        const subscriber = vi.fn();
        requestsStore.subscribe(subscriber);

        const result = await requestsStore.resubmit('rfi-1', {
            query: 'Which reporting period applies?',
            categories: ['Economic Impact']
        });

        expect(mockUpdateRequest).toHaveBeenCalledWith('rfi-1', {
            query: 'Which reporting period applies?',
            categories: ['Economic Impact']
        });
        expect(result.id).toBe('rfi-1');
        expect(requestsStore.getAll()).toEqual([result]);
        expect(subscriber).toHaveBeenCalledWith('resubmitted', result);
    });

    it('rejects edits to an RFI that White Cell did not return', async () => {
        const { requestsStore } = await loadRequestsStore();
        requestsStore.requests = [{
            id: 'rfi-answered',
            status: 'answered',
            workflow_state: 'completed'
        }];

        await expect(requestsStore.resubmit('rfi-answered', {
            query: 'Attempted overwrite',
            categories: ['Other']
        })).rejects.toThrow('Only an RFI returned for clarification can be resubmitted');
        expect(mockUpdateRequest).not.toHaveBeenCalled();
    });

    it('GC07 submits the revision seen when the correction form opened, even after a newer return arrives', async () => {
        const { requestsStore } = await loadRequestsStore();
        const reviewed = { id: 'regional-rfi', session_id: 'regional', team: 'green', delegation_id: 'europe',
            status: 'pending', workflow_state: 'returned_to_team', revision_number: 2 };
        requestsStore.sessionId = 'regional';
        requestsStore.requests = [{ ...reviewed, revision_number: 3 }];
        mockUpdateRequest.mockRejectedValue(new Error('GC07_STALE_RFI_REVISION'));
        const updates = { query: 'Synthetic correction based on revision two', categories: ['Other'] };
        await expect(requestsStore.resubmit(reviewed.id, updates, reviewed)).rejects.toThrow('GC07_STALE_RFI_REVISION');
        expect(mockUpdateRequest).toHaveBeenCalledWith(reviewed.id, updates, reviewed);
        expect(requestsStore.getById(reviewed.id).revision_number).toBe(3);
    });
});
