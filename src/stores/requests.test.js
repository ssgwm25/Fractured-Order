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
});
