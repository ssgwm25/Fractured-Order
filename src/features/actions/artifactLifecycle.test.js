import { describe, expect, it } from 'vitest';

import {
    getArtifactLifecycleViewModel,
    resolveArtifactWorkflowState
} from './artifactLifecycle.js';

describe('artifact lifecycle view model', () => {
    it.each([
        ['submitted_to_white_cell', 'Deliberation Underway'],
        ['resubmitted', 'Deliberation Underway'],
        ['returned_to_team', 'Returned by White Cell'],
        ['returned_to_blue', 'Returned by White Cell'],
        ['completed', 'Completed']
    ])('maps %s to the shared lifecycle label', (workflowState, label) => {
        expect(getArtifactLifecycleViewModel({ workflow_state: workflowState })).toMatchObject({
            state: workflowState,
            label,
            showOutcomeOnEntityCard: false
        });
    });

    it('normalizes historical statuses without consulting historical outcomes', () => {
        expect(resolveArtifactWorkflowState({ status: 'adjudicated', outcome: 'BACKFIRE' })).toBe('completed');
        expect(getArtifactLifecycleViewModel({ status: 'adjudicated', outcome: 'BACKFIRE' }).label).toBe('Completed');
        expect(getArtifactLifecycleViewModel({ status: 'submitted', outcome: 'SUCCESS' }).label).toBe('Deliberation Underway');
        expect(getArtifactLifecycleViewModel({
            status: 'draft',
            adjudication: { returned_to_blue: true }
        }).label).toBe('Returned by White Cell');
    });
});
