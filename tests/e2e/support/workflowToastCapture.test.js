import { describe, expect, it } from 'vitest';

import { classifyWorkflowToastEntries } from './workflowToastCapture.js';

describe('workflow toast capture', () => {
    it('recognizes a captured success after its DOM node has been removed', () => {
        expect(classifyWorkflowToastEntries([
            { type: 'success', text: 'Proposal forwarded to Facilitator. It will be projected.' }
        ], 'Proposal forwarded to Facilitator')).toEqual({
            status: 'success',
            entry: {
                type: 'success',
                text: 'Proposal forwarded to Facilitator. It will be projected.'
            }
        });
    });

    it('recognizes a captured proposal follow-up after its timed toast has been removed', () => {
        expect(classifyWorkflowToastEntries([
            { type: 'success', text: 'Follow-up sent to White Cell for forwarding.' }
        ], 'Follow-up sent to White Cell for forwarding.')).toEqual({
            status: 'success',
            entry: {
                type: 'success',
                text: 'Follow-up sent to White Cell for forwarding.'
            }
        });
    });

    it('surfaces a captured workflow error instead of waiting for success', () => {
        expect(classifyWorkflowToastEntries([
            { type: 'error', text: 'Failed to forward proposal. Check the form and try again.' }
        ], 'Proposal forwarded to Facilitator')).toEqual({
            status: 'error',
            entry: {
                type: 'error',
                text: 'Failed to forward proposal. Check the form and try again.'
            }
        });
    });

    it('remains pending when no relevant notification was captured', () => {
        expect(classifyWorkflowToastEntries([], 'Proposal forwarded to Facilitator')).toEqual({
            status: 'pending',
            entry: null
        });
    });
});
