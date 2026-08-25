import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLI_VIEW_MODES } from '../features/pli/pliShared.js';

const {
    mockCreatePliMacroReview,
    mockCreateDiplomacyInfoReview,
    mockCreateNiEscalationReview,
    mockCreatePliReportPanel,
    mockCreatePliSmeEfficacyPanel
} = vi.hoisted(() => ({
    mockCreatePliMacroReview: vi.fn(() => ({ refresh: vi.fn() })),
    mockCreateDiplomacyInfoReview: vi.fn(() => ({ refresh: vi.fn() })),
    mockCreateNiEscalationReview: vi.fn(() => ({ refresh: vi.fn() })),
    mockCreatePliReportPanel: vi.fn(() => ({ refresh: vi.fn() })),
    mockCreatePliSmeEfficacyPanel: vi.fn(() => ({ refresh: vi.fn() }))
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
vi.mock('../features/pli/PliReportPanel.js', () => ({
    createPliReportPanel: (...args) => mockCreatePliReportPanel(...args)
}));
vi.mock('../features/pli/PliSmeEfficacyPanel.js', () => ({
    createPliSmeEfficacyPanel: (...args) => mockCreatePliSmeEfficacyPanel(...args)
}));

function createPanelHosts() {
    const elements = {
        pliAdjudicationPanel: { id: 'pliAdjudicationPanel' },
        pliDiplomacyInfoPanel: { id: 'pliDiplomacyInfoPanel' },
        pliNiEscalationPanel: { id: 'pliNiEscalationPanel' },
        pliReportsPanel: { id: 'pliReportsPanel' },
        pliSmeEfficacyPanel: { id: 'pliSmeEfficacyPanel' }
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

    it('mounts PLI review panels and the report panel as Lead-readonly', async () => {
        globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
        global.document = createPanelHosts();

        const { WhiteCellController } = await import('./whitecell.js');
        const controller = new WhiteCellController();
        controller.refreshPliSmePanels = vi.fn();
        controller.mountPliSmePanels();

        expect(mockCreatePliMacroReview).toHaveBeenCalledTimes(1);
        expect(mockCreateDiplomacyInfoReview).toHaveBeenCalledTimes(1);
        expect(mockCreateNiEscalationReview).toHaveBeenCalledTimes(1);
        expect(mockCreatePliReportPanel).toHaveBeenCalledTimes(1);
        expect(mockCreatePliSmeEfficacyPanel).toHaveBeenCalledTimes(1);

        for (const mock of [
            mockCreatePliMacroReview,
            mockCreateDiplomacyInfoReview,
            mockCreateNiEscalationReview
        ]) {
            const options = mock.mock.calls[0][0];
            expect(options.viewMode).toBe(PLI_VIEW_MODES.LEAD_READONLY);
            expect(options.canReview()).toBe(false);
        }

        const reportOptions = mockCreatePliReportPanel.mock.calls[0][0];
        expect(reportOptions.container.id).toBe('pliReportsPanel');
        expect(typeof reportOptions.getSessionId).toBe('function');

        const efficacyOptions = mockCreatePliSmeEfficacyPanel.mock.calls[0][0];
        expect(efficacyOptions.container.id).toBe('pliSmeEfficacyPanel');
        expect(typeof efficacyOptions.getSessionId).toBe('function');
    });
});
