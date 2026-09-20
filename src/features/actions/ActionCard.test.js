import { afterEach, describe, expect, it } from 'vitest';

import { createActionCard, createCompactActionCard } from './ActionCard.js';
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
    it.each([createActionCard, createCompactActionCard])('shows region and revision without relabeling unified records', (render) => {
        globalThis.document = { createElement: (tagName) => createFakeElement(tagName) };
        const action = { id:'regional',goal:'Synthetic proposal',status:'draft',delegation_id:'europe',revision_number:3 };
        expect(render(action, {showActions:false}).innerHTML).toContain('Green - Europe &middot; Revision 3');
        expect(render({...action,delegation_id:null}, {showActions:false}).innerHTML).not.toContain('Green - Europe');
    });
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

        expect(card.innerHTML).toContain('Submitted to White Cell');
        expect(card.innerHTML).not.toMatch(/Success|Partial Success|Fail|Backfire|SUCCESS|PARTIAL_SUCCESS|BACKFIRE/);
    });
});
