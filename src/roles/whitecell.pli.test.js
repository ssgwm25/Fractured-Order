import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLI_VIEW_MODES } from '../features/pli/pliShared.js';

const {
    mockCreatePliMacroReview,
    mockCreateDiplomacyInfoReview,
    mockCreateNiEscalationReview
} = vi.hoisted(() => ({
    mockCreatePliMacroReview: vi.fn(() => ({ refresh: vi.fn() })),
    mockCreateDiplomacyInfoReview: vi.fn(() => ({ refresh: vi.fn() })),
    mockCreateNiEscalationReview: vi.fn(() => ({ refresh: vi.fn() }))
}));

vi.mock('../features/pli/PliMacroReview.js', () => ({
    createPliMacroReview: (...args) => mockCreatePliMacroReview(...args)
}));
vi.mock('../features/pli/DiplomacyInfoReview.js', () => ({
    createDiplomacyInfoReview: (...args) => mockCreateDiplomacyInfoReview(...args)
}));
vi.mock('../features/pli/NiEscalationReview.js', () => ({
    createNiEscalationReview: (...args) => mockCreateNiEscalationReview(...args)
}));

function createPanelHosts() {
    const elements = {
        pliAdjudicationPanel: { id: 'pliAdjudicationPanel' },
        pliDiplomacyInfoPanel: { id: 'pliDiplomacyInfoPanel' },
        pliNiEscalationPanel: { id: 'pliNiEscalationPanel' }
    };
    return {
        getElementById: (id) => elements[id] || null,
        elements
    };
}

describe('White Cell PLI Lead readonly mount', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        delete global.document;
        delete globalThis.__ESG_DISABLE_AUTO_INIT__;
    });

    it('mounts all three PLI panels as Lead-readonly with canReview false', async () => {
        globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
        global.document = createPanelHosts();

        const { WhiteCellController } = await import('./whitecell.js');
        const controller = new WhiteCellController();
        controller.refreshPliSmePanels = vi.fn();
        controller.mountPliSmePanels();

        expect(mockCreatePliMacroReview).toHaveBeenCalledTimes(1);
        expect(mockCreateDiplomacyInfoReview).toHaveBeenCalledTimes(1);
        expect(mockCreateNiEscalationReview).toHaveBeenCalledTimes(1);

        for (const mock of [
            mockCreatePliMacroReview,
            mockCreateDiplomacyInfoReview,
            mockCreateNiEscalationReview
        ]) {
            const options = mock.mock.calls[0][0];
            expect(options.viewMode).toBe(PLI_VIEW_MODES.LEAD_READONLY);
            expect(options.canReview()).toBe(false);
        }
    });
});
