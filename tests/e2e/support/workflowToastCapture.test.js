import { describe, expect, it } from 'vitest';

import { classifyWorkflowToastEntries } from './workflowToastCapture.js';

describe('workflow toast capture', () => {
    const proposalHandoffMessages = ['Proposal forwarded to Facilitator', 'Proposal handed to the Facilitator.'];

    it.each(proposalHandoffMessages)('recognizes the explicit proposal handoff wording: %s', (text) => {
        const entry = { type: 'success', text };
        expect(classifyWorkflowToastEntries([entry], proposalHandoffMessages)).toEqual({ status: 'success', entry });
    });

    it('does not mistake draft save or unrelated success for a proposal handoff', () => {
        const entries = [{ type: 'success', text: 'Proposal changes saved.' }];
        expect(classifyWorkflowToastEntries(entries, proposalHandoffMessages)).toEqual({ status: 'pending', entry: null });
        const failure = { type: 'error', text: 'Failed to forward proposal.' };
        expect(classifyWorkflowToastEntries([...entries, failure], proposalHandoffMessages)).toEqual({ status: 'error', entry: failure });
    });

    it('ignores empty expected messages instead of matching every notification', () => {
        expect(classifyWorkflowToastEntries([{ type: 'success', text: 'Unrelated update' }], ['', ' ']))
            .toEqual({ status: 'pending', entry: null });
    });

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
