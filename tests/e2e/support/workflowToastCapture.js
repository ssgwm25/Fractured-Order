export const WORKFLOW_TOAST_CAPTURE_KEY = '__esgPlaywrightWorkflowToasts';

export function classifyWorkflowToastEntries(entries, expectedMessage) {
    const normalizedEntries = Array.isArray(entries) ? entries : [];
    const expected = (Array.isArray(expectedMessage) ? expectedMessage : [expectedMessage])
        .map((message) => String(message || '').trim()).filter(Boolean);
    const success = normalizedEntries.find((entry) => (
        expected.some((message) => String(entry?.text || '').includes(message))
    ));

    if (success) {
        return { status: 'success', entry: success };
    }

    const failure = normalizedEntries.find((entry) => entry?.type === 'error');
    if (failure) {
        return { status: 'error', entry: failure };
    }

    return { status: 'pending', entry: null };
}
