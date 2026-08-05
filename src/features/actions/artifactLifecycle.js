/**
 * Shared artifact lifecycle labels for action, proposal, Strategic Orientation,
 * and request cards. Outcome values are historical/export data and are not a
 * lifecycle source for current entity cards.
 */

export const ARTIFACT_LIFECYCLE = Object.freeze({
    draft: Object.freeze({ label: 'Draft', variant: 'default' }),
    forwarded_to_facilitator: Object.freeze({ label: 'Forwarded to Facilitator', variant: 'primary' }),
    submitted_to_white_cell: Object.freeze({ label: 'Deliberation Underway', variant: 'warning' }),
    resubmitted: Object.freeze({ label: 'Deliberation Underway', variant: 'warning' }),
    returned_to_team: Object.freeze({ label: 'Returned by White Cell', variant: 'warning' }),
    returned_to_blue: Object.freeze({ label: 'Returned by White Cell', variant: 'warning' }),
    completed: Object.freeze({ label: 'Completed', variant: 'success' }),
    adjudicated: Object.freeze({ label: 'Completed', variant: 'success' }),
    forwarded_to_recipient: Object.freeze({ label: 'Completed', variant: 'success' }),
    changes_requested: Object.freeze({ label: 'Completed', variant: 'success' }),
    rejected: Object.freeze({ label: 'Completed', variant: 'success' }),
    abandoned: Object.freeze({ label: 'Abandoned', variant: 'error' }),
    pending: Object.freeze({ label: 'Deliberation Underway', variant: 'warning' }),
    answered: Object.freeze({ label: 'Completed', variant: 'success' }),
    withdrawn: Object.freeze({ label: 'Completed', variant: 'default' })
});

function normalizeState(value = '') {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function resolveArtifactWorkflowState(artifactOrState = {}) {
    if (typeof artifactOrState === 'string') {
        const state = normalizeState(artifactOrState);
        if (state === 'submitted' || state === 'pending') return 'submitted_to_white_cell';
        if (state === 'adjudicated' || state === 'answered' || state === 'withdrawn') return 'completed';
        return state;
    }

    const canonicalState = normalizeState(artifactOrState?.canonical_workflow_state);
    if (canonicalState) return canonicalState;

    const workflowState = normalizeState(artifactOrState?.workflow_state);
    if (workflowState) return workflowState;

    if (artifactOrState?.adjudication?.returned_to_blue === true) {
        return 'returned_to_blue';
    }

    const status = normalizeState(artifactOrState?.status);
    if (status === 'submitted' || status === 'pending') return 'submitted_to_white_cell';
    if (status === 'adjudicated' || status === 'answered' || status === 'withdrawn') return 'completed';

    return status || 'draft';
}

export function getArtifactLifecycleViewModel(artifactOrState = {}) {
    const state = resolveArtifactWorkflowState(artifactOrState);
    const config = ARTIFACT_LIFECYCLE[state] || {
        label: state
            ? state.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
            : 'Draft',
        variant: 'default'
    };

    return {
        state,
        label: config.label,
        variant: config.variant,
        isAwaitingWhiteCell: ['submitted_to_white_cell', 'resubmitted'].includes(state),
        isReturned: ['returned_to_team', 'returned_to_blue'].includes(state),
        isCompleted: [
            'completed',
            'adjudicated',
            'forwarded_to_recipient',
            'changes_requested',
            'rejected',
            'answered',
            'withdrawn'
        ].includes(state),
        showOutcomeOnEntityCard: false
    };
}
