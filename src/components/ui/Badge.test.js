import { afterEach, describe, expect, it } from 'vitest';

import { createArtifactLifecycleBadge } from './Badge.js';

const priorDocument = globalThis.document;

function createFakeElement() {
    let textContent = '';
    let innerHTML = '';
    return {
        className: '',
        get textContent() {
            return textContent;
        },
        set textContent(value) {
            textContent = String(value ?? '');
            innerHTML = textContent;
        },
        get innerHTML() {
            return innerHTML;
        },
        set innerHTML(value) {
            innerHTML = String(value ?? '');
        },
        get outerHTML() {
            return `<span class="${this.className}">${innerHTML}</span>`;
        }
    };
}

afterEach(() => {
    globalThis.document = priorDocument;
});

describe('artifact lifecycle badges', () => {
    it.each([
        [{ workflow_state: 'submitted_to_white_cell', outcome: 'SUCCESS' }, 'Deliberation Underway', 'badge-warning'],
        [{ workflow_state: 'returned_to_team', outcome: 'PARTIAL_SUCCESS' }, 'Returned by White Cell', 'badge-warning'],
        [{ workflow_state: 'completed', outcome: 'BACKFIRE' }, 'Completed', 'badge-success']
    ])('renders the workflow label instead of an outcome badge', (artifact, label, variantClass) => {
        globalThis.document = { createElement: () => createFakeElement() };

        const badge = createArtifactLifecycleBadge(artifact);

        expect(badge.outerHTML).toContain(`<span class="badge-text">${label}</span>`);
        expect(badge.className).toContain(variantClass);
        expect(badge.outerHTML).not.toMatch(/SUCCESS|PARTIAL_SUCCESS|BACKFIRE/);
    });
});
