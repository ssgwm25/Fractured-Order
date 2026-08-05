import { afterEach, describe, expect, it } from 'vitest';

import { createActionCard } from './ActionCard.js';
import { serializeProposalDetails } from './proposalDetails.js';

const priorDocument = globalThis.document;

function createFakeElement(tagName = 'div') {
    let textContent = '';
    let innerHTML = '';
    return {
        tagName,
        className: '',
        dataset: {},
        style: {},
        get textContent() { return textContent; },
        set textContent(value) {
            textContent = String(value ?? '');
            innerHTML = textContent;
        },
        get innerHTML() { return innerHTML; },
        set innerHTML(value) { innerHTML = String(value ?? ''); },
        get outerHTML() { return `<${tagName} class="${this.className}">${innerHTML}</${tagName}>`; },
        querySelector() { return null; },
        addEventListener() {}
    };
}

afterEach(() => {
    globalThis.document = priorDocument;
});

describe('proposal action cards', () => {
    it('uses lifecycle state and never renders historical outcome badges', () => {
        globalThis.document = { createElement: (tagName) => createFakeElement(tagName) };

        const card = createActionCard({
            id: 'proposal-1',
            mechanism: 'Proposal',
            status: 'submitted',
            workflow_state: 'submitted_to_white_cell',
            outcome: 'SUCCESS',
            goal: 'Joint industrial proposal',
            ally_contingencies: serializeProposalDetails({
                recipientTeams: ['blue', 'red'],
                focusSectors: ['Biotechnology', 'Telecommunications']
            })
        }, { showActions: false });

        expect(card.innerHTML).toContain('Deliberation Underway');
        expect(card.innerHTML).not.toMatch(/Success|Partial Success|Fail|Backfire|SUCCESS|PARTIAL_SUCCESS|BACKFIRE/);
    });
});
