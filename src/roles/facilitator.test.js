import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const FACILITATOR_HTML_PATH = new URL('../../teams/blue/facilitator.html', import.meta.url);
const GREEN_FACILITATOR_HTML_PATH = new URL('../../teams/green/facilitator.html', import.meta.url);
const RED_FACILITATOR_HTML_PATH = new URL('../../teams/red/facilitator.html', import.meta.url);

const { mockMountFollowAlong } = vi.hoisted(() => ({
    mockMountFollowAlong: vi.fn(() => ({ destroy: vi.fn() }))
}));

function createFakeElement(id = null, tagName = 'div') {
    let textContent = '';
    let explicitInnerHtml = null;

    return {
        id,
        tagName: tagName.toUpperCase(),
        className: '',
        hidden: false,
        style: {},
        toggleAttribute: vi.fn(),
        querySelectorAll: vi.fn(() => []),
        get textContent() {
            return textContent;
        },
        set textContent(value) {
            textContent = value == null ? '' : String(value);
            explicitInnerHtml = null;
        },
        get innerHTML() {
            return explicitInnerHtml ?? textContent;
        },
        set innerHTML(value) {
            explicitInnerHtml = value == null ? '' : String(value);
        },
        get outerHTML() {
            const attributes = [];
            if (this.id) {
                attributes.push(`id="${this.id}"`);
            }
            if (this.className) {
                attributes.push(`class="${this.className}"`);
            }

            return `<${tagName}${attributes.length ? ` ${attributes.join(' ')}` : ''}>${this.innerHTML}</${tagName}>`;
        }
    };
}

function createFakeDocument() {
    return {
        createElement(tagName) {
            return createFakeElement(null, tagName);
        }
    };
}

const showToast = vi.fn();
const showModal = vi.fn();
const createTimelineEvent = vi.fn();
const createAction = vi.fn();
const updateDraftAction = vi.fn();
const submitActionRecord = vi.fn();
const deleteDraftAction = vi.fn();
const createRequest = vi.fn();

vi.mock('../components/ui/Toast.js', () => ({
    showToast
}));

vi.mock('../components/ui/Modal.js', () => ({
    showModal,
    confirmModal: vi.fn()
}));

vi.mock('../components/ui/Loader.js', () => ({
    showLoader: vi.fn(() => ({})),
    hideLoader: vi.fn(),
    showInlineLoader: vi.fn(() => ({
        hide: vi.fn()
    }))
}));

vi.mock('../features/onboarding/followAlong.js', () => ({
    mountFollowAlong: mockMountFollowAlong
}));

vi.mock('../services/database.js', () => ({
    database: {
        createAction,
        updateDraftAction,
        submitAction: submitActionRecord,
        deleteDraftAction,
        createRequest,
        createTimelineEvent,
        fetchActions: vi.fn(),
        fetchRequests: vi.fn(),
        fetchCommunications: vi.fn(),
        fetchTimeline: vi.fn()
    }
}));

async function loadFacilitatorModule() {
    globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
    vi.resetModules();
    return import('./facilitator.js');
}

describe('Facilitator and scribe access', () => {
    afterEach(async () => {
        vi.clearAllMocks();
        delete global.document;
        delete globalThis.__ESG_DISABLE_AUTO_INIT__;
        const { sessionStore } = await import('../stores/session.js');
        sessionStore.clearAll();
    });

    it('allows facilitator seats and rejects scribe seats on the facilitator surface', async () => {
        const { getFacilitatorAccessState } = await loadFacilitatorModule();
        const teamContext = {
            teamId: 'blue',
            facilitatorRole: 'blue_facilitator',
            scribeRole: 'blue_scribe'
        };

        expect(getFacilitatorAccessState({
            role: 'blue_facilitator',
            teamContext,
        })).toMatchObject({
            allowed: true,
            readOnly: false,
            reason: null,
            roleSurface: 'facilitator'
        });

        expect(getFacilitatorAccessState({
            role: 'blue_scribe',
            teamContext,
        })).toMatchObject({
            allowed: false,
            reason: 'role-mismatch'
        });
    });

    it('renders facilitator-mode labels on the facilitator surface', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        controller.role = 'blue_facilitator';

        const roleLabel = createFakeElement('sessionRoleLabel');
        const notice = createFakeElement('facilitatorModeNotice');
        const headerTitle = createFakeElement(null, 'h1');

        global.document = {
            body: { dataset: {} },
            getElementById(id) {
                return {
                    sessionRoleLabel: roleLabel,
                    facilitatorModeNotice: notice,
                    captureNavItem: createFakeElement('captureNavItem'),
                    captureSection: createFakeElement('captureSection')
                }[id] || null;
            },
            querySelector(selector) {
                if (selector === '.header-title') {
                    return headerTitle;
                }

                return createFakeElement();
            },
            querySelectorAll() {
                return [];
            }
        };

        controller.configureAccessMode();

        expect(global.document.body.dataset.facilitatorMode).toBe('facilitator');
        expect(roleLabel.textContent).toBe('Facilitator');
        expect(headerTitle.textContent).toBe('Blue Team Facilitator');
        expect(notice.style.display).toBe('none');
        expect(notice.innerHTML).toBe('');
    });

    it('ships a standalone Tribe Street Journal sidebar section in the facilitator view', () => {
        const html = readFileSync(FACILITATOR_HTML_PATH, 'utf8');

        expect(html).toContain('data-section="tribeStreetJournal"');
        expect(html).toContain('id="tribeStreetJournalSection"');
        expect(html).toContain('Tribe Street Journal');
        expect(html).toContain('id="tribeStreetJournalEmbed"');
        expect(html).toContain('id="tribeStreetJournalList"');
        expect(html).toContain('id="responsesBadge"');
        expect(html).toContain('id="tribeStreetJournalBadge"');
        expect(html).toContain('id="verbaAiBadge"');
    });

    it('mounts a Blue facilitator guide that covers every facilitator surface', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        mockMountFollowAlong.mockClear();
        controller.mountFollowAlongOnboarding();

        expect(mockMountFollowAlong).toHaveBeenCalledTimes(1);
        expect(mockMountFollowAlong).toHaveBeenCalledWith(expect.objectContaining({
            storageKey: 'followalong:facilitator:blue',
            title: 'Blue Team Facilitator guide'
        }));

        const guide = mockMountFollowAlong.mock.calls[0][0];
        expect(guide.steps.map((step) => step.title)).toEqual([
            'Blue Team Facilitator',
            'Read the live tracker',
            'Draft actions',
            'Ask White Cell with RFIs',
            'Read White Cell responses',
            'Review received proposals',
            'Read Tribe Street Journal',
            'Review sentiment updates',
            'Audit the timeline',
            'Capture observations',
            'Revisit this guide'
        ]);
        expect(guide.steps.map((step) => step.highlight).filter(Boolean)).toEqual([
            '#timerDisplay',
            '.sidebar-link[data-section="actions"]',
            '.sidebar-link[data-section="requests"]',
            '.sidebar-link[data-section="responses"]',
            '.sidebar-link[data-section="receivedProposals"]',
            '.sidebar-link[data-section="tribeStreetJournal"]',
            '.sidebar-link[data-section="verbaAi"]',
            '.sidebar-link[data-section="timeline"]',
            '.sidebar-link[data-section="capture"]',
            '.sidebar-session'
        ]);
        expect(guide.steps[0].body).toContain('capture observations');
        expect(guide.steps[4].body).toContain('explicit White Cell communications');
        expect(guide.steps[7].body).toContain('sentiment updates');
    });

    it('mounts a Green facilitator guide that covers proposals and every facilitator surface', async () => {
        global.document = {
            ...createFakeDocument(),
            body: { dataset: { team: 'green' } }
        };

        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        mockMountFollowAlong.mockClear();
        controller.mountFollowAlongOnboarding();

        expect(mockMountFollowAlong).toHaveBeenCalledTimes(1);
        expect(mockMountFollowAlong).toHaveBeenCalledWith(expect.objectContaining({
            storageKey: 'followalong:facilitator:green',
            title: 'Green Team Facilitator guide'
        }));

        const guide = mockMountFollowAlong.mock.calls[0][0];
        expect(guide.steps.map((step) => step.title)).toEqual([
            'Green Team Facilitator',
            'Read the live tracker',
            'Build proposals',
            'Ask White Cell with RFIs',
            'Read White Cell responses',
            'Review received proposals',
            'Read Tribe Street Journal',
            'Review sentiment updates',
            'Audit the timeline',
            'Capture observations',
            'Revisit this guide'
        ]);
        expect(guide.steps.map((step) => step.highlight).filter(Boolean)).toEqual([
            '#timerDisplay',
            '.sidebar-link[data-section="actions"]',
            '.sidebar-link[data-section="requests"]',
            '.sidebar-link[data-section="responses"]',
            '.sidebar-link[data-section="receivedProposals"]',
            '.sidebar-link[data-section="tribeStreetJournal"]',
            '.sidebar-link[data-section="verbaAi"]',
            '.sidebar-link[data-section="timeline"]',
            '.sidebar-link[data-section="capture"]',
            '.sidebar-session'
        ]);
        expect(guide.steps[0].body).toContain('prepare proposals');
        expect(guide.steps[2].body).toContain("Create and revise your team's proposals");
        expect(guide.steps[5].body).toContain('proposals that White Cell has approved and forwarded for your team');
        expect(guide.steps[5].body).not.toContain('Green Team proposals');
    });

    it('mounts a Red facilitator guide that covers move responses and every facilitator surface', async () => {
        global.document = {
            ...createFakeDocument(),
            body: { dataset: { team: 'red' } }
        };

        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        mockMountFollowAlong.mockClear();
        controller.mountFollowAlongOnboarding();

        expect(mockMountFollowAlong).toHaveBeenCalledTimes(1);
        expect(mockMountFollowAlong).toHaveBeenCalledWith(expect.objectContaining({
            storageKey: 'followalong:facilitator:red',
            title: 'Red Team Facilitator guide'
        }));

        const guide = mockMountFollowAlong.mock.calls[0][0];
        expect(guide.steps.map((step) => step.title)).toEqual([
            'Red Team Facilitator',
            'Read the live tracker',
            'Prepare move responses',
            'Ask White Cell with RFIs',
            'Read White Cell responses',
            'Review received proposals',
            'Read Tribe Street Journal',
            'Review sentiment updates',
            'Audit the timeline',
            'Capture observations',
            'Revisit this guide'
        ]);
        expect(guide.steps.map((step) => step.highlight).filter(Boolean)).toEqual([
            '#timerDisplay',
            '.sidebar-link[data-section="actions"]',
            '.sidebar-link[data-section="requests"]',
            '.sidebar-link[data-section="responses"]',
            '.sidebar-link[data-section="receivedProposals"]',
            '.sidebar-link[data-section="tribeStreetJournal"]',
            '.sidebar-link[data-section="verbaAi"]',
            '.sidebar-link[data-section="timeline"]',
            '.sidebar-link[data-section="capture"]',
            '.sidebar-session'
        ]);
        expect(guide.steps[0].body).toContain('prepare move responses');
        expect(guide.steps[2].body).toContain("Create and revise your team's move responses");
        expect(guide.steps[2].body).toContain('White Cell reviews them');
    });

    it('groups quick-capture type radios with a semantic fieldset on every facilitator surface', () => {
        [
            FACILITATOR_HTML_PATH,
            GREEN_FACILITATOR_HTML_PATH,
            RED_FACILITATOR_HTML_PATH
        ].forEach((htmlPath) => {
            const html = readFileSync(htmlPath, 'utf8');

            expect(html).toContain('<fieldset class="form-group">');
            expect(html).toContain('<legend class="form-label">Type</legend>');
            expect(html).toContain('name="captureType"');
            expect(html).not.toContain('<label class="form-label">Type</label>');
        });
    });

    it('labels the Green facilitator action trigger as New Proposal', () => {
        const html = readFileSync(GREEN_FACILITATOR_HTML_PATH, 'utf8');

        expect(html).toContain('id="newActionBtn"');
        expect(html).toContain('New Proposal');
        expect(html).toContain('No Proposals Yet');
        expect(html).toContain('Create your first proposal to start the White Cell review flow.');
        expect(html).not.toContain('No Actions Yet');
        expect(html).toContain('data-section="receivedProposals"');
        expect(html).toContain('id="receivedProposalsSection"');
        expect(html).toContain('id="receivedProposalsList"');
    });

    it('labels the Red facilitator action trigger as New Response', () => {
        const html = readFileSync(RED_FACILITATOR_HTML_PATH, 'utf8');

        expect(html).toContain('id="newActionBtn"');
        expect(html).toContain('Move Responses');
        expect(html).toContain('New Response');
        expect(html).toContain('No Responses Yet');
        expect(html).toContain('Create your first response to start the White Cell review flow.');
        expect(html).not.toContain('No Actions Yet');
        expect(html).not.toContain('strategic action');
    });

    it('renders proposal-specific empty-state copy for the Green facilitator queue', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        controller.teamId = 'green';
        controller.teamLabel = 'Green Team';
        controller.actions = [];
        controller.isReadOnly = false;

        const actionsList = createFakeElement('actionsList');
        global.document = {
            getElementById(id) {
                return {
                    actionsList
                }[id] || null;
            }
        };

        controller.renderActionsList();

        expect(actionsList.innerHTML).toContain('No Proposals Yet');
        expect(actionsList.innerHTML).toContain('Create your first proposal to start the White Cell review flow.');
        expect(actionsList.innerHTML).not.toContain('No Actions Yet');
        expect(actionsList.innerHTML).not.toContain('strategic action');
    });

    it('renders response-specific empty-state copy for the Red facilitator queue', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        controller.teamId = 'red';
        controller.teamLabel = 'Red Team';
        controller.actions = [];
        controller.isReadOnly = false;

        const actionsList = createFakeElement('actionsList');
        global.document = {
            getElementById(id) {
                return {
                    actionsList
                }[id] || null;
            }
        };

        controller.renderActionsList();

        expect(actionsList.innerHTML).toContain('No Responses Yet');
        expect(actionsList.innerHTML).toContain('Create your first response to start the White Cell review flow.');
        expect(actionsList.innerHTML).not.toContain('No Actions Yet');
        expect(actionsList.innerHTML).not.toContain('strategic action');
    });

    it('does not render White Cell share controls in facilitator action cards', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        const markup = controller.renderActionCard({
            id: 'action-1',
            team: 'blue',
            status: 'submitted',
            goal: 'Stabilize port access',
            mechanism: 'Diplomatic pressure',
            move: 2,
            phase: 3
        });

        expect(markup).not.toContain('Send to Red Team');
    });

    it('groups Blue strategic actions by lifecycle status in the action list', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const actionsList = createFakeElement('actionsList');
        global.document = {
            ...createFakeDocument(),
            getElementById(id) {
                return {
                    actionsList
                }[id] || null;
            }
        };

        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';
        controller.isReadOnly = false;
        controller.actions = [
            {
                id: 'action-draft-1',
                team: 'blue',
                status: 'draft',
                goal: 'Draft action',
                mechanism: 'Economic',
                move: 2,
                phase: 2
            },
            {
                id: 'action-submitted-1',
                team: 'blue',
                status: 'submitted',
                goal: 'Submitted action',
                mechanism: 'Economic',
                move: 2,
                phase: 2,
                submitted_at: '2026-04-09T10:10:00.000Z'
            },
            {
                id: 'action-reviewed-1',
                team: 'blue',
                status: 'adjudicated',
                goal: 'Reviewed action',
                mechanism: 'Economic',
                move: 2,
                phase: 2,
                adjudicated_at: '2026-04-09T10:20:00.000Z'
            }
        ];

        controller.renderActionsList();

        expect(actionsList.innerHTML).toContain('Draft Strategic Actions (1)');
        expect(actionsList.innerHTML).toContain('Submitted to White Cell (1)');
        expect(actionsList.innerHTML).toContain('White Cell Reviewed (1)');
        expect(actionsList.innerHTML.indexOf('Draft action')).toBeLessThan(actionsList.innerHTML.indexOf('Submitted action'));
        expect(actionsList.innerHTML.indexOf('Submitted action')).toBeLessThan(actionsList.innerHTML.indexOf('Reviewed action'));
    });

    it('renders Blue Team wizard fields on facilitator action cards', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { serializeBlueActionDetails } = await import('../features/actions/blueActionDetails.js');
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        controller.actions = [{
            id: 'action-blue-0',
            team: 'blue',
            move: 2,
            created_at: '2026-04-08T09:00:00.000Z'
        }, {
            id: 'action-blue-1',
            team: 'blue',
            move: 2,
            created_at: '2026-04-08T10:00:00.000Z',
            status: 'draft',
            goal: 'Stabilize biotech leverage',
            mechanism: 'Economic',
            sector: 'Biotechnology',
            exposure_type: 'Advanced Manufacturing',
            targets: ['PRC', 'Japan'],
            expected_outcomes: 'Reduce exposure before the next move.',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Lower upstream dependency on PRC inputs.',
                levers: ['Export Controls', 'Sanctions'],
                sectors: ['Biotechnology', 'Agriculture'],
                implementation: 'Legislative',
                legislativeOptions: ['Existing legislation/policy', 'Proposing new legislation/policy'],
                enforcementTimeline: '6 months',
                coordinated: ['Executive'],
                informed: ['Allied']
            })
        }];
        const markup = controller.renderActionCard(controller.actions[1]);

        expect(markup).toContain('Objective:</strong> Lower upstream dependency on PRC inputs.');
        expect(markup).toContain('Levers:</strong> Export Controls, Sanctions');
        expect(markup).toContain('Sectors:</strong> Biotechnology, Agriculture');
        expect(markup).toContain('Legislative Route:</strong> Existing legislation/policy, Proposing new legislation/policy');
        expect(markup).toContain('Coordinated:</strong> Executive');
        expect(markup).toContain('Informed:</strong> Allied');
        expect(markup).toContain('Timeline:</strong> 6 months');
        expect(markup).toContain('Blue Team | Move 2 | Action 2');
    });

    it('renders checkbox groups for facilitator modal multi-select fields', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        const blueWizardMarkup = controller.createBlueActionWizardContent().innerHTML;
        const actionFormMarkup = controller.createActionFormContent().innerHTML;

        expect(blueWizardMarkup).toContain('What you intend this action to achieve.');
        expect(blueWizardMarkup).toContain("What you anticipate will actually happen as a result, including effects you don't control.");
        expect(blueWizardMarkup).toContain('data-blue-action-checkbox="lever"');
        expect(blueWizardMarkup).toContain('Select one or more levers.');
        expect(blueWizardMarkup).toContain('data-blue-action-checkbox="sector"');
        expect(blueWizardMarkup).toContain('Select one or more sectors.');
        expect(blueWizardMarkup).toContain('data-blue-action-checkbox="country"');
        expect(blueWizardMarkup).toContain('value="BRICS+"');
        expect(blueWizardMarkup).toContain('Select one or more countries.');
        expect(blueWizardMarkup).toContain('data-blue-action-checkbox="legislative"');
        expect(blueWizardMarkup).toContain('Select all legislative routes that apply.');
        expect(blueWizardMarkup).toContain('actionEnforcementTimelineOther');
        expect(blueWizardMarkup).not.toContain('Hold Ctrl');

        expect(actionFormMarkup).toContain('data-action-checkbox="target"');
        expect(actionFormMarkup).toContain('Select one or more targets.');
        expect(actionFormMarkup).not.toContain('Hold Ctrl');

        controller.showCreateRfiModal();

        const rfiModalConfig = showModal.mock.calls.at(-1)?.[0];
        expect(rfiModalConfig?.content?.innerHTML).toContain('data-rfi-checkbox="category"');
        expect(rfiModalConfig?.content?.innerHTML).toContain('Select all categories that apply.');
        expect(rfiModalConfig?.content?.innerHTML).not.toContain('Hold Ctrl');
    });

    it('collects checked checkbox values from facilitator action forms', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        const blueWizardFieldValues = {
            '#actionTitle': 'Secure corridor access',
            '#actionInstrument': 'Economic',
            '#actionObjective': 'Stabilize trade flows.',
            '#actionSupplyChainFocus': 'Critical Minerals',
            '#actionImplementation': 'Executive Order',
            '#actionEnforcementTimeline': '6 months',
            '#actionExpectedOutcomes': 'Reduce dependency on vulnerable routes.',
            '#actionBlueSectorOther': '',
            '#actionImplementationOther': ''
        };

        const wizardData = controller.getBlueActionWizardData({
            querySelector(selector) {
                if (!(selector in blueWizardFieldValues)) {
                    return null;
                }

                return { value: blueWizardFieldValues[selector] };
            },
            querySelectorAll(selector) {
                if (selector === '[data-blue-action-checkbox="lever"]:checked') {
                    return [{ value: 'Export Controls' }, { value: 'Sanctions' }];
                }

                if (selector === '[data-blue-action-checkbox="sector"]:checked') {
                    return [{ value: 'Biotechnology' }, { value: 'Agriculture' }];
                }

                if (selector === '[data-blue-action-checkbox="country"]:checked') {
                    return [{ value: 'Kenya' }, { value: 'BRICS+' }];
                }

                if (selector === '[data-blue-action-checkbox="coordinated"]:checked') {
                    return [{ value: 'Executive' }];
                }

                if (selector === '[data-blue-action-checkbox="informed"]:checked') {
                    return [{ value: 'Allied' }];
                }

                return [];
            }
        });

        expect(wizardData.levers).toEqual(['Export Controls', 'Sanctions']);
        expect(wizardData.sectors).toEqual(['Biotechnology', 'Agriculture']);
        expect(wizardData.focusCountries).toEqual(['Kenya', 'BRICS+']);
        expect(wizardData.coordinated).toEqual(['Executive']);
        expect(wizardData.informed).toEqual(['Allied']);

        global.document = {
            getElementById(id) {
                return {
                    actionGoal: { value: 'Secure corridor access' },
                    actionMechanism: { value: 'economic' },
                    actionSector: { value: 'biotechnology' },
                    actionExposureType: { value: 'Supply Chain' },
                    actionPriority: { value: 'HIGH' },
                    actionExpectedOutcomes: { value: 'Reduce dependency on vulnerable routes.' },
                    actionAllyContingencies: { value: 'Coordinate with allied exporters.' }
                }[id] || null;
            },
            querySelectorAll(selector) {
                if (selector === '[data-action-checkbox="target"]:checked') {
                    return [{ value: 'PRC' }, { value: 'RUS' }];
                }

                return [];
            }
        };

        const formData = controller.getActionFormData();
        expect(formData.targets).toEqual(['PRC', 'RUS']);
    });

    it('captures and validates a custom enforcement timeline in the Blue wizard', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        const wizardData = controller.getBlueActionWizardData({
            querySelector(selector) {
                return {
                    '#actionTitle': { value: 'Secure corridor access' },
                    '#actionInstrument': { value: 'Economic' },
                    '#actionObjective': { value: 'Stabilize trade flows.' },
                    '#actionSupplyChainFocus': { value: 'Critical Minerals' },
                    '#actionImplementation': { value: 'Executive Order' },
                    '#actionEnforcementTimeline': { value: 'Other' },
                    '#actionEnforcementTimelineOther': { value: '18 months with quarterly checkpoints' },
                    '#actionExpectedOutcomes': { value: 'Reduce dependency on vulnerable routes.' },
                    '#actionBlueSectorOther': { value: '' },
                    '#actionImplementationOther': { value: '' }
                }[selector] || null;
            },
            querySelectorAll(selector) {
                if (selector === '[data-blue-action-checkbox="lever"]:checked') {
                    return [{ value: 'Export Controls' }];
                }

                if (selector === '[data-blue-action-checkbox="sector"]:checked') {
                    return [{ value: 'Biotechnology' }];
                }

                if (selector === '[data-blue-action-checkbox="country"]:checked') {
                    return [{ value: 'Kenya' }];
                }

                return [];
            }
        });

        expect(wizardData.enforcementTimeline).toBe('18 months with quarterly checkpoints');
        expect(wizardData.enforcementTimelineSelectValue).toBe('Other');
        expect(wizardData.enforcementTimelineOther).toBe('18 months with quarterly checkpoints');
        expect(controller.validateBlueActionWizardPage(wizardData, 1)).toBeNull();
        expect(controller.validateBlueActionWizardPage({
            ...wizardData,
            enforcementTimelineOther: '',
            enforcementTimeline: ''
        }, 1)).toBe('Please enter the custom enforcement timeline.');
    });

    it('allows Blue drafts to be saved before the final summary page', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        const pageZeroDraft = {
            actionTitle: 'Secure corridor access',
            objective: 'Stabilize trade flows.',
            instrumentOfPower: 'Economic',
            levers: ['Export Controls'],
            sectors: [],
            selectedSectorValues: [],
            sectorOther: '',
            supplyChainFocus: '',
            implementation: '',
            implementationSelectValue: '',
            implementationOther: '',
            legislativeOptions: [],
            focusCountries: [],
            enforcementTimeline: '',
            enforcementTimelineSelectValue: '',
            enforcementTimelineOther: '',
            expectedOutcomes: '',
            coordinated: [],
            informed: []
        };

        expect(controller.getBlueActionDraftSaveValidationError({
            ...pageZeroDraft,
            actionTitle: '',
            objective: '',
            instrumentOfPower: '',
            levers: []
        }, 0)).toBe('Add at least one action detail before saving a draft.');
        expect(controller.getBlueActionDraftSaveValidationError(pageZeroDraft, 0)).toBeNull();
        expect(controller.getBlueActionDraftSaveValidationError(pageZeroDraft, 1)).toBeNull();
        expect(controller.getBlueActionDraftSaveValidationError(pageZeroDraft, 2)).toBe('Select at least one sector.');
    });

    it('saves a Blue draft from the first wizard page without requiring later pages', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { sessionStore } = await import('../stores/session.js');
        const { actionsStore } = await import('../stores/actions.js');
        const { timelineStore } = await import('../stores/timeline.js');
        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-blue-draft');
        vi.spyOn(sessionStore, 'getClientId').mockReturnValue('client-blue-draft');

        createAction.mockResolvedValue({
            id: 'action-blue-draft-1',
            session_id: 'session-blue-draft',
            team: 'blue',
            goal: 'Secure corridor access',
            move: 2,
            phase: 3,
            status: 'draft'
        });
        createTimelineEvent.mockResolvedValue({
            id: 'timeline-blue-draft-1',
            session_id: 'session-blue-draft',
            type: 'ACTION_CREATED',
            content: 'Draft action created: Secure corridor access',
            team: 'blue',
            move: 2,
            phase: 3,
            created_at: '2026-06-15T10:00:00.000Z'
        });
        const actionsStoreSpy = vi.spyOn(actionsStore, 'updateFromServer');
        const timelineStoreSpy = vi.spyOn(timelineStore, 'updateFromServer');

        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';
        controller.role = 'blue_facilitator';
        controller.isReadOnly = false;
        vi.spyOn(controller, 'getCurrentGameState').mockReturnValue({
            move: 2,
            phase: 3
        });
        const modal = {
            close: vi.fn()
        };

        await controller.saveBlueActionDraft(modal, {
            querySelector(selector) {
                return {
                    '#actionTitle': { value: 'Secure corridor access' },
                    '#actionInstrument': { value: '' },
                    '#actionObjective': { value: 'Stabilize trade flows.' },
                    '#actionSupplyChainFocus': { value: '' },
                    '#actionImplementation': { value: '' },
                    '#actionEnforcementTimeline': { value: '' },
                    '#actionExpectedOutcomes': { value: '' },
                    '#actionBlueSectorOther': { value: '' },
                    '#actionImplementationOther': { value: '' },
                    '#actionEnforcementTimelineOther': { value: '' }
                }[selector] || null;
            },
            querySelectorAll() {
                return [];
            }
        }, 0);

        expect(createAction).toHaveBeenCalledWith(expect.objectContaining({
            session_id: 'session-blue-draft',
            team: 'blue',
            status: 'draft',
            move: 2,
            phase: 3,
            goal: 'Secure corridor access',
            mechanism: '',
            sector: '',
            expected_outcomes: ''
        }));
        expect(createAction.mock.calls[0][0].ally_contingencies).toContain('Objective: Stabilize trade flows.');
        expect(actionsStoreSpy).toHaveBeenCalledWith('INSERT', expect.objectContaining({
            id: 'action-blue-draft-1'
        }));
        expect(timelineStoreSpy).toHaveBeenCalledWith('INSERT', expect.objectContaining({
            id: 'timeline-blue-draft-1'
        }));
        expect(showToast).toHaveBeenCalledWith({ message: 'Draft action saved', type: 'success' });
        expect(modal.close).toHaveBeenCalled();
    });

    it('collects legislative route selections when implementation is Legislative', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        const wizardData = controller.getBlueActionWizardData({
            querySelector(selector) {
                return {
                    '#actionTitle': { value: 'Secure corridor access' },
                    '#actionInstrument': { value: 'Economic' },
                    '#actionObjective': { value: 'Stabilize trade flows.' },
                    '#actionSupplyChainFocus': { value: 'Critical Minerals' },
                    '#actionImplementation': { value: 'Legislative' },
                    '#actionEnforcementTimeline': { value: '6 months' },
                    '#actionExpectedOutcomes': { value: 'Reduce dependency on vulnerable routes.' },
                    '#actionBlueSectorOther': { value: '' },
                    '#actionImplementationOther': { value: '' },
                    '#actionEnforcementTimelineOther': { value: '' }
                }[selector] || null;
            },
            querySelectorAll(selector) {
                if (selector === '[data-blue-action-checkbox="lever"]:checked') {
                    return [{ value: 'Export Controls' }];
                }

                if (selector === '[data-blue-action-checkbox="sector"]:checked') {
                    return [{ value: 'Biotechnology' }];
                }

                if (selector === '[data-blue-action-checkbox="legislative"]:checked') {
                    return [{ value: 'Existing legislation/policy' }, { value: 'Proposing new legislation/policy' }];
                }

                if (selector === '[data-blue-action-checkbox="country"]:checked') {
                    return [{ value: 'BRICS+' }];
                }

                return [];
            }
        });

        expect(wizardData.implementation).toBe('Legislative');
        expect(wizardData.legislativeOptions).toEqual([
            'Existing legislation/policy',
            'Proposing new legislation/policy'
        ]);
    });

    it('builds Green proposals with a concrete persisted mechanism label', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        const payload = controller.buildGreenProposalPayload({
            title: 'Align biotech export posture',
            originators: ['EU', 'Japan'],
            objective: 'Coordinate export controls across allied channels.',
            category: 'Alignment',
            intendedPartners: 'Blue Team',
            focusSector: 'Biotechnology',
            delivery: 'Joint Statement',
            timingAndConditions: 'Next move after White Cell approval.',
            expectedOutcomes: 'Reduce room for adversarial arbitrage.'
        }, {
            recipientTeam: 'blue'
        });

        expect(payload.mechanism).toBe('Proposal');
        expect(payload.ally_contingencies).toContain('Proposal Details');
        expect(payload.ally_contingencies).toContain('Recipient Team: blue');
    });

    it('shows forwarded proposals in both the received proposals inbox and the responses feed', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { communicationsStore } = await import('../stores/communications.js');
        const { buildWhiteCellRecipientMetadata } = await import('../features/communications/targeting.js');

        const responsesList = createFakeElement('responsesList');
        const responsesBadge = createFakeElement('responsesBadge');
        const proposalsList = createFakeElement('receivedProposalsList');
        const proposalsBadge = createFakeElement('receivedProposalsBadge');

        global.document = {
            createElement(tagName) {
                return createFakeElement(null, tagName);
            },
            getElementById(id) {
                return {
                    responsesList,
                    responsesBadge,
                    receivedProposalsList: proposalsList,
                    receivedProposalsBadge: proposalsBadge
                }[id] || null;
            }
        };

        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([{
            id: 'comm-forwarded-1',
            from_role: 'whitecell_lead',
            to_role: 'whitecell_lead',
            type: 'PROPOSAL_FORWARDED',
            content: 'Forwarded Green Team proposal (sent by White Cell after review).',
            created_at: '2026-04-09T10:06:00.000Z',
            metadata: buildWhiteCellRecipientMetadata('blue', {
                source_team: 'green',
                outcome: 'SUCCESS',
                proposal: {
                    title: 'Joint Port Proposal',
                    originators: ['EU', 'Japan'],
                    category: 'Alignment',
                    intendedPartners: 'Blue Team',
                    focusSector: 'Biotechnology',
                    delivery: 'Joint Statement',
                    objective: 'Align port licensing posture.',
                    timingAndConditions: 'Immediately after White Cell review.',
                    expectedOutcomes: 'Reduce room for arbitrage.'
                }
            })
        }]);

        const controller = new FacilitatorController();
        controller.syncResponsesFromStores();
        controller.syncReceivedProposalsFromStore();

        expect(responsesList.innerHTML).toContain('Received Proposal: Joint Port Proposal');
        expect(responsesList.innerHTML).toContain('FORWARDED PROPOSAL');
        expect(responsesBadge.textContent).toBe('1');
        expect(responsesBadge.hidden).toBe(false);
        expect(proposalsList.innerHTML).toContain('Joint Port Proposal');
        expect(proposalsList.innerHTML).toContain('Forwarded from Green Team');
        expect(proposalsBadge.textContent).toBe('1');
        expect(proposalsBadge.hidden).toBe(false);
    });

    it('shows White Cell updates and direct communications explicitly in the responses feed and update badges', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { communicationsStore } = await import('../stores/communications.js');
        const {
            WHITE_CELL_UPDATE_KINDS,
            buildWhiteCellRecipientMetadata
        } = await import('../features/communications/targeting.js');

        const responsesList = createFakeElement('responsesList');
        const responsesBadge = createFakeElement('responsesBadge');
        const journalList = createFakeElement('tribeStreetJournalList');
        const journalBadge = createFakeElement('tribeStreetJournalBadge');
        const journalEmbed = createFakeElement('tribeStreetJournalEmbed');
        const verbaAiList = createFakeElement('verbaAiList');
        const verbaAiBadge = createFakeElement('verbaAiBadge');

        global.document = {
            createElement(tagName) {
                return createFakeElement(null, tagName);
            },
            getElementById(id) {
                return {
                    responsesList,
                    responsesBadge,
                    tribeStreetJournalList: journalList,
                    tribeStreetJournalBadge: journalBadge,
                    tribeStreetJournalEmbed: journalEmbed,
                    verbaAiList,
                    verbaAiBadge
                }[id] || null;
            }
        };

        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([
            {
                id: 'comm-update-1',
                from_role: 'whitecell_lead',
                to_role: 'blue',
                type: 'GUIDANCE',
                content: 'Headline trade narrative updated for the next move.',
                created_at: '2026-04-09T10:06:00.000Z',
                metadata: buildWhiteCellRecipientMetadata('blue', {
                    content_kind: WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL
                })
            },
            {
                id: 'comm-direct-1',
                from_role: 'whitecell_support',
                to_role: 'blue_scribe',
                type: 'DIRECT',
                content: 'Prepare a short briefing note before adjudication.',
                created_at: '2026-04-09T10:10:00.000Z',
                metadata: buildWhiteCellRecipientMetadata('blue_scribe')
            }
        ]);

        const controller = new FacilitatorController();
        controller.syncResponsesFromStores();
        controller.syncWhiteCellUpdateSectionsFromStore();

        expect(responsesList.innerHTML).toContain('White Cell Update: Tribe Street Journal');
        expect(responsesList.innerHTML).toContain('WHITE CELL UPDATE');
        expect(responsesList.innerHTML).toContain('White Cell Communication');
        expect(responsesList.innerHTML).toContain('White Cell communication to Blue Team');
        expect(responsesList.innerHTML).toContain('White Cell communication to Blue Team Scribe');
        expect(responsesBadge.textContent).toBe('2');
        expect(responsesBadge.hidden).toBe(false);
        expect(journalList.innerHTML).toContain('WHITE CELL UPDATE');
        expect(journalBadge.textContent).toBe('1');
        expect(journalBadge.hidden).toBe(false);
        expect(verbaAiBadge.textContent).toBe('0');
        expect(verbaAiBadge.hidden).toBe(true);
    });

    it('raises a visible arrival cue for new White Cell responses and forwarded proposals', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { communicationsStore } = await import('../stores/communications.js');
        const {
            WHITE_CELL_UPDATE_KINDS,
            buildWhiteCellRecipientMetadata
        } = await import('../features/communications/targeting.js');

        const responsesList = createFakeElement('responsesList');
        const responsesBadge = createFakeElement('responsesBadge');
        const proposalsList = createFakeElement('receivedProposalsList');
        const proposalsBadge = createFakeElement('receivedProposalsBadge');

        global.document = {
            createElement(tagName) {
                return createFakeElement(null, tagName);
            },
            getElementById(id) {
                return {
                    responsesList,
                    responsesBadge,
                    receivedProposalsList: proposalsList,
                    receivedProposalsBadge: proposalsBadge
                }[id] || null;
            }
        };

        const getAll = vi.spyOn(communicationsStore, 'getAll');
        getAll.mockReturnValue([]);

        const controller = new FacilitatorController();
        controller.syncResponsesFromStores();
        controller.syncReceivedProposalsFromStore();

        getAll.mockReturnValue([
            {
                id: 'comm-update-arrival-1',
                from_role: 'whitecell_lead',
                to_role: 'blue',
                type: 'GUIDANCE',
                content: 'Shift the team brief to the new trade corridor headline.',
                created_at: '2026-04-09T10:11:00.000Z',
                metadata: buildWhiteCellRecipientMetadata('blue', {
                    content_kind: WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL
                })
            },
            {
                id: 'comm-forwarded-arrival-1',
                from_role: 'whitecell_lead',
                to_role: 'blue',
                type: 'PROPOSAL_FORWARDED',
                content: 'Forwarded Green Team proposal (sent by White Cell after review).',
                created_at: '2026-04-09T10:12:00.000Z',
                metadata: buildWhiteCellRecipientMetadata('blue', {
                    source_team: 'green',
                    outcome: 'SUCCESS',
                    proposal: {
                        title: 'Joint Port Proposal'
                    }
                })
            }
        ]);

        controller.syncResponsesFromStores({ announce: true });
        controller.syncReceivedProposalsFromStore({ announce: true });
        controller.flushWhiteCellArrivalAnnouncement();

        expect(showToast).toHaveBeenCalledWith({
            message: 'New White Cell items arrived: 1 response and 1 forwarded proposal.',
            type: 'warning',
            duration: 10000
        });
        expect(responsesList.innerHTML).toContain('NEW');
        expect(responsesList.innerHTML).toContain('White Cell Update: Tribe Street Journal');
        expect(proposalsList.innerHTML).toContain('NEW');
        expect(proposalsList.innerHTML).toContain('Joint Port Proposal');
    });

    it('locks a received proposal after the team has already responded', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { communicationsStore } = await import('../stores/communications.js');
        const { buildWhiteCellRecipientMetadata } = await import('../features/communications/targeting.js');

        const proposalsList = createFakeElement('receivedProposalsList');

        global.document = {
            createElement(tagName) {
                return createFakeElement(null, tagName);
            },
            getElementById(id) {
                return {
                    receivedProposalsList: proposalsList,
                    receivedProposalsBadge: createFakeElement('receivedProposalsBadge')
                }[id] || null;
            }
        };

        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([{
            id: 'comm-forwarded-responded-1',
            from_role: 'whitecell_lead',
            to_role: 'blue',
            type: 'PROPOSAL_FORWARDED',
            content: 'Forwarded Green Team proposal.',
            created_at: '2026-04-09T10:06:00.000Z',
            metadata: buildWhiteCellRecipientMetadata('blue', {
                source_team: 'green',
                proposal: {
                    title: 'Joint Port Proposal'
                },
                proposal_recipient_state: {
                    status: 'responded',
                    response_content: 'Blue Team can support this with customs coordination.',
                    response_from_team: 'blue',
                    response_sent_at: '2026-04-09T10:20:00.000Z'
                }
            })
        }]);

        const controller = new FacilitatorController();
        controller.syncReceivedProposalsFromStore();

        expect(proposalsList.innerHTML).toContain('Response sent to White Cell');
        expect(proposalsList.innerHTML).toContain('Blue Team can support this with customs coordination.');
        expect(proposalsList.innerHTML).toContain('locked');
        expect(proposalsList.innerHTML).not.toContain('data-proposal-action="respond"');
        expect(proposalsList.innerHTML).not.toContain('data-proposal-action="decline"');
    });

    it('shows recipient decline updates on the Green facilitator proposal card', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { communicationsStore } = await import('../stores/communications.js');
        global.document = createFakeDocument();

        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([{
            id: 'comm-forwarded-declined-1',
            type: 'PROPOSAL_FORWARDED',
            created_at: '2026-04-09T10:06:00.000Z',
            metadata: {
                source_proposal_id: 'proposal-green-1',
                recipient_team: 'blue',
                proposal_recipient_state: {
                    status: 'declined',
                    actioned_at: '2026-04-09T10:20:00.000Z'
                }
            }
        }]);

        const controller = new FacilitatorController();
        controller.teamId = 'green';
        controller.teamLabel = 'Green Team';

        const markup = controller.renderActionCard({
            id: 'proposal-green-1',
            team: 'green',
            status: 'adjudicated',
            goal: 'Joint Port Proposal',
            mechanism: 'Proposal',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce room for arbitrage.',
            move: 2,
            phase: 1
        });

        expect(markup).toContain('Recipient Team:</strong> Blue Team');
        expect(markup).toContain('Recipient Status:</strong> Declined');
    });

    it('renders a forwarded Green proposal as awaiting a recipient response without White Cell review copy', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { communicationsStore } = await import('../stores/communications.js');
        global.document = createFakeDocument();

        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([{
            id: 'comm-forwarded-awaiting-1',
            type: 'PROPOSAL_FORWARDED',
            created_at: '2026-04-09T10:06:00.000Z',
            metadata: {
                source_proposal_id: 'proposal-green-2',
                recipient_team: 'blue',
                proposal_recipient_state: {
                    status: 'unread'
                }
            }
        }]);

        const controller = new FacilitatorController();
        controller.teamId = 'green';
        controller.teamLabel = 'Green Team';

        const markup = controller.renderActionCard({
            id: 'proposal-green-2',
            team: 'green',
            status: 'adjudicated',
            adjudicated_at: '2026-04-09T10:10:00.000Z',
            adjudication_notes: 'White Cell note that should stay hidden here.',
            goal: 'Joint Port Proposal',
            mechanism: 'Proposal',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce room for arbitrage.',
            move: 2,
            phase: 1
        });

        expect(markup).toContain('Awaiting response from Blue Team');
        expect(markup).not.toContain('White Cell reviewed this proposal');
        expect(markup).not.toContain('Adjudication Notes:</strong>');
    });

    it('renders a Green proposal response summary when the recipient team has responded', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { communicationsStore } = await import('../stores/communications.js');
        global.document = createFakeDocument();

        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([{
            id: 'comm-forwarded-responded-green-1',
            type: 'PROPOSAL_FORWARDED',
            created_at: '2026-04-09T10:06:00.000Z',
            metadata: {
                source_proposal_id: 'proposal-green-3',
                recipient_team: 'blue',
                proposal_recipient_state: {
                    status: 'responded',
                    actioned_at: '2026-04-09T10:20:00.000Z',
                    response_content: 'Blue Team can support this with customs coordination.',
                    response_from_team: 'blue',
                    response_sent_at: '2026-04-09T10:20:00.000Z'
                }
            }
        }]);

        const controller = new FacilitatorController();
        controller.teamId = 'green';
        controller.teamLabel = 'Green Team';

        const markup = controller.renderActionCard({
            id: 'proposal-green-3',
            team: 'green',
            status: 'adjudicated',
            adjudicated_at: '2026-04-09T10:10:00.000Z',
            adjudication_notes: 'White Cell note that should stay hidden here.',
            goal: 'Joint Port Proposal',
            mechanism: 'Proposal',
            sector: 'Biotechnology',
            expected_outcomes: 'Reduce room for arbitrage.',
            move: 2,
            phase: 1
        });

        expect(markup).toContain('Response received from Blue Team');
        expect(markup).toContain('Blue Team Response');
        expect(markup).toContain('Blue Team can support this with customs coordination.');
        expect(markup).not.toContain('White Cell reviewed this proposal');
        expect(markup).not.toContain('Adjudication Notes:</strong>');
    });

    it('renders Red move responses with structured review-state copy instead of generic action details', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { serializeMoveResponseDetails } = await import('../features/actions/moveResponseDetails.js');
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        controller.teamId = 'red';
        controller.teamLabel = 'Red Team';

        const markup = controller.renderActionCard({
            id: 'move-response-red-1',
            team: 'red',
            status: 'submitted',
            submitted_at: '2026-04-09T10:10:00.000Z',
            goal: 'Counter logistics corridor squeeze',
            mechanism: 'Move Response',
            expected_outcomes: 'Preserve throughput and deny escalation payoff.',
            ally_contingencies: serializeMoveResponseDetails({
                strategicAssessment: 'Blue is tightening maritime leverage.',
                responseStrategy: 'Exploit alternate port relationships.',
                keyActions: 'Shift freight and publicize redundancy measures.',
                targetsAndPressurePoints: 'Port authorities and customs timing.',
                deliveryChannel: 'Backchannel assurances to carriers.'
            }),
            move: 2,
            phase: 1
        });

        expect(markup).toContain('Deliberation Underway');
        expect(markup).toContain('Expected Effect &amp; System Impact:</strong> Preserve throughput and deny escalation payoff.');
        expect(markup).toContain('Strategic Assessment:</strong> Blue is tightening maritime leverage.');
        expect(markup).toContain('Response Strategy:</strong> Exploit alternate port relationships.');
        expect(markup).toContain('Key Actions:</strong> Shift freight and publicize redundancy measures.');
        expect(markup).toContain('Targets / Pressure Points:</strong> Port authorities and customs timing.');
        expect(markup).toContain('Delivery Channel:</strong> Backchannel assurances to carriers.');
        expect(markup).toContain('White Cell deliberation is underway.');
        expect(markup).not.toContain('Ally Contingencies:</strong>');
        expect(markup).not.toContain('Targets:</strong> Not specified');
        expect(markup).not.toContain('This action is now read-only for facilitator and scribe seats until adjudication.');
    });

    it('rerenders facilitator proposal cards when communications change', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { communicationsStore } = await import('../stores/communications.js');

        const controller = new FacilitatorController();
        const renderActionsList = vi.spyOn(controller, 'renderActionsList').mockImplementation(() => {});
        vi.spyOn(controller, 'syncResponsesFromStores').mockImplementation(() => {});
        vi.spyOn(controller, 'syncReceivedProposalsFromStore').mockImplementation(() => {});
        vi.spyOn(controller, 'syncWhiteCellUpdateSectionsFromStore').mockImplementation(() => {});

        controller.subscribeToLiveData();
        communicationsStore.notify('updated', {
            id: 'comm-forwarded-declined-2',
            type: 'PROPOSAL_FORWARDED'
        });

        expect(renderActionsList).toHaveBeenCalled();

        controller.destroy();
    });

    it('builds Red move responses with a concrete persisted mechanism label', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        const payload = controller.buildRedResponsePayload({
            title: 'Counter logistics corridor squeeze',
            strategicAssessment: 'Blue is tightening maritime leverage.',
            responseStrategy: 'Exploit alternate port relationships.',
            keyActions: 'Shift freight and publicize redundancy measures.',
            targetsAndPressurePoints: 'Port authorities and customs timing.',
            deliveryChannel: 'Backchannel assurances to carriers.',
            expectedEffect: 'Preserve throughput and deny escalation payoff.'
        });

        expect(payload.mechanism).toBe('Move Response');
        expect(payload.ally_contingencies).toContain('Move Response Details');
        expect(payload.ally_contingencies).toContain('Delivery Channel: Backchannel assurances to carriers.');
    });

    it('builds Tribe Street Journal entries from team capture events only', async () => {
        const { buildTribeStreetJournalEntries } = await loadFacilitatorModule();

        const entries = buildTribeStreetJournalEntries([
            {
                id: 'blue-note',
                team: 'blue',
                type: 'NOTE',
                content: 'Blue team observation',
                created_at: '2026-04-09T10:05:00.000Z'
            },
            {
                id: 'blue-quote',
                team: 'blue',
                type: 'QUOTE',
                content: 'Quoted minister',
                created_at: '2026-04-09T10:06:00.000Z'
            },
            {
                id: 'blue-save-event',
                team: 'blue',
                type: 'NOTE',
                content: 'Saved notetaker note',
                created_at: '2026-04-09T10:07:00.000Z',
                metadata: {
                    source: 'notetaker_save'
                }
            },
            {
                id: 'white-cell-note',
                team: 'white_cell',
                type: 'NOTE',
                content: 'White Cell note',
                created_at: '2026-04-09T10:08:00.000Z'
            },
            {
                id: 'blue-action',
                team: 'blue',
                type: 'ACTION_CREATED',
                content: 'Action created',
                created_at: '2026-04-09T10:09:00.000Z'
            }
        ], 'blue');

        expect(entries.map((entry) => entry.id)).toEqual([
            'blue-quote',
            'blue-note'
        ]);
    });

    it('renders the Tribe Street Journal embed panel above facilitator journal entries', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const embedContainer = createFakeElement('tribeStreetJournalEmbed');
        const container = createFakeElement('tribeStreetJournalList');

        global.document = {
            createElement(tagName) {
                return createFakeElement(null, tagName);
            },
            getElementById(id) {
                return {
                    tribeStreetJournalEmbed: embedContainer,
                    tribeStreetJournalList: container
                }[id] || null;
            }
        };

        const controller = new FacilitatorController();
        controller.journalUpdates = [];
        controller.journalEntries = [{
            id: 'journal-1',
            type: 'NOTE',
            content: 'Harbor operators expect customs delays by nightfall.',
            move: 2,
            phase: 1,
            created_at: '2026-04-09T10:05:00.000Z',
            metadata: {
                actor: 'Blue Scribe'
            }
        }];

        controller.renderTribeStreetJournalList();

        expect(embedContainer.innerHTML).toContain('https://tribestreetjournal.com/');
        expect(embedContainer.innerHTML).toContain('Open in new tab');
        expect(container.innerHTML).toContain('Harbor operators expect customs delays by nightfall.');
    });
});
