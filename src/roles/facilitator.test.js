import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const FACILITATOR_HTML_PATH = new URL('../../teams/blue/facilitator.html', import.meta.url);
const GREEN_FACILITATOR_HTML_PATH = new URL('../../teams/green/facilitator.html', import.meta.url);
const INDUSTRY_FACILITATOR_HTML_PATH = new URL('../../teams/industry/facilitator.html', import.meta.url);
const RED_FACILITATOR_HTML_PATH = new URL('../../teams/red/facilitator.html', import.meta.url);
const CARDS_CSS_PATH = new URL('../../styles/components/cards.css', import.meta.url);
const GRID_CSS_PATH = new URL('../../styles/layouts/grid.css', import.meta.url);

const { mockMountFollowAlong } = vi.hoisted(() => ({
    mockMountFollowAlong: vi.fn(() => ({ destroy: vi.fn() }))
}));

function createFakeElement(id = null, tagName = 'div') {
    let textContent = '';
    let explicitInnerHtml = null;

    return {
        id,
        tagName: tagName.toUpperCase(),
        dataset: {},
        className: '',
        hidden: false,
        disabled: false,
        title: '',
        style: {},
        setAttribute: vi.fn(),
        removeAttribute: vi.fn(),
        toggleAttribute: vi.fn(),
        querySelector: vi.fn(() => null),
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

function flattenHighlights(steps) {
    return steps.flatMap((step) => (
        Array.isArray(step.highlight)
            ? step.highlight
            : (step.highlight ? [step.highlight] : [])
    ));
}

async function createStrategicOrientationAction(overrides = {}) {
    const { serializeStrategicOrientationDetails } = await import('../features/actions/strategicOrientationDetails.js');

    return {
        id: 'strategic-orientation-blue-1',
        session_id: 'session-strategic-orientation',
        team: 'blue',
        status: 'draft',
        goal: 'Strategic Orientation: Pressure',
        mechanism: 'Strategic Orientation',
        exposure_type: 'pre_move_1',
        priority: 'HIGH',
        move: 1,
        phase: 1,
        ally_contingencies: serializeStrategicOrientationDetails({
            artifactType: 'selection',
            team: 'blue',
            orientation: 'pressure',
            rationale: 'Set the pre-Move 1 posture.',
            scribeHandoff: 'Forwarded'
        }),
        ...overrides
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

describe('legacy facilitator route and corrected Scribe access', () => {
    afterEach(async () => {
        vi.clearAllMocks();
        delete global.document;
        delete globalThis.__ESG_DISABLE_AUTO_INIT__;
        const { sessionStore } = await import('../stores/session.js');
        sessionStore.clearAll();
    });

    it('allows legacy facilitator seats and rejects legacy scribe seats on the Scribe workspace', async () => {
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

    it('renders Scribe labels on the legacy facilitator surface', async () => {
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
        expect(roleLabel.textContent).toBe('Scribe');
        expect(headerTitle.textContent).toBe('Blue Team Scribe');
        expect(notice.style.display).toBe('none');
        expect(notice.innerHTML).toBe('');
    });

    it('runs the Intercom receiver only for enabled actual Scribe seats', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { gameStateStore } = await import('../stores/gameState.js');
        const controller = new FacilitatorController();
        controller.isReadOnly = false;
        controller.role = 'blue_facilitator';
        controller.teamContext = {
            teamId: 'blue',
            facilitatorRole: 'blue_facilitator',
            scribeRole: 'blue_scribe'
        };

        try {
            gameStateStore.state = {
                plugin_state: {
                    intercom: { enabled: true }
                }
            };

            expect(controller.shouldRunIntercomReceiver()).toBe(true);

            controller.role = 'blue_scribe';
            expect(controller.shouldRunIntercomReceiver()).toBe(false);

            controller.role = 'blue_facilitator';
            gameStateStore.state = {
                plugin_state: {
                    intercom: { enabled: false }
                }
            };
            expect(controller.shouldRunIntercomReceiver()).toBe(false);

            controller.isReadOnly = true;
            gameStateStore.state = {
                plugin_state: {
                    intercom: { enabled: true }
                }
            };
            expect(controller.shouldRunIntercomReceiver()).toBe(false);
        } finally {
            gameStateStore.reset();
        }
    });

    it('ships a standalone Tribe Street Journal sidebar section in the Scribe workspace', () => {
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

    it('ships Strategic Orientation controls on Blue, Green, Red, and Industry Scribe workspaces', () => {
        const blueHtml = readFileSync(FACILITATOR_HTML_PATH, 'utf8');
        const greenHtml = readFileSync(GREEN_FACILITATOR_HTML_PATH, 'utf8');
        const redHtml = readFileSync(RED_FACILITATOR_HTML_PATH, 'utf8');
        const industryHtml = readFileSync(INDUSTRY_FACILITATOR_HTML_PATH, 'utf8');

        expect(blueHtml).toContain('id="strategicOrientationBtn"');
        expect(blueHtml).toContain('class="btn btn-primary" id="strategicOrientationBtn"');
        expect(blueHtml).toContain('class="btn btn-secondary" id="newActionBtn"');
        expect(blueHtml).toContain('Strategic Orientation');
        expect(greenHtml).toContain('id="strategicOrientationBtn"');
        expect(greenHtml).toContain('class="btn btn-primary" id="strategicOrientationBtn"');
        expect(greenHtml).toContain('class="btn btn-secondary" id="newActionBtn"');
        expect(greenHtml).toContain('Forecast Blue');
        expect(redHtml).toContain('id="strategicOrientationBtn"');
        expect(redHtml).toContain('class="btn btn-primary" id="strategicOrientationBtn"');
        expect(redHtml).toContain('class="btn btn-secondary" id="newActionBtn"');
        expect(redHtml).toContain('Forecast Teams');
        expect(industryHtml).toContain('id="strategicOrientationBtn"');
        expect(industryHtml).toContain('class="btn btn-primary" id="strategicOrientationBtn"');
        expect(industryHtml).toContain('class="btn btn-secondary" id="newActionBtn"');
        expect(industryHtml).toContain('Forecast Teams');
    });

    it('builds Strategic Orientation payloads with a non-null action sector', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';

        const payload = controller.buildStrategicOrientationPayload({
            selected: 'pressure',
            rationale: 'Set the pre-Move 1 posture.'
        });

        expect(payload).toMatchObject({
            mechanism: 'Strategic Orientation',
            sector: '',
            exposure_type: 'pre_move_1',
            priority: 'HIGH'
        });
        expect(payload.ally_contingencies).toContain('Strategic Orientation Details');
    });

    it('builds Red and Industry Strategic Orientation payloads with Blue and Green forecast targets', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        controller.teamId = 'red';
        controller.teamLabel = 'Red Team';

        const payload = controller.buildStrategicOrientationPayload({
            forecasts: {
                blue: 'pressure',
                green_asian_pacific: 'reframe',
                green_europe: 'stabilization'
            },
            rationale: 'Red expects Blue to pressure, Green AP to reframe, and Green Europe to stabilize.'
        });

        expect(payload).toMatchObject({
            goal: 'Red Team Forecasts',
            mechanism: 'Strategic Orientation',
            sector: '',
            exposure_type: 'pre_move_1',
            priority: 'HIGH'
        });
        expect(payload.expected_outcomes).toContain('Blue -> Pressure');
        expect(payload.expected_outcomes).toContain('Green (Asian Pacific) -> Reframe');
        expect(payload.expected_outcomes).toContain('Green (Europe) -> Stabilization');
        expect(payload.ally_contingencies).toContain('Forecast Targets:');
        expect(payload.ally_contingencies).toContain('"key":"green_asian_pacific"');
        expect(payload.ally_contingencies).toContain('"key":"green_europe"');
    });

    it('records a multi-target Red forecast using its primary forecast in timeline metadata', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { sessionStore } = await import('../stores/session.js');
        const { actionsStore } = await import('../stores/actions.js');
        const { timelineStore } = await import('../stores/timeline.js');
        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-red-orientation');
        vi.spyOn(sessionStore, 'getClientId').mockReturnValue('client-red-orientation');
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([]);
        const actionsStoreSpy = vi.spyOn(actionsStore, 'updateFromServer');
        const timelineStoreSpy = vi.spyOn(timelineStore, 'updateFromServer');

        createAction.mockImplementation(async (payload) => ({
            id: 'strategic-orientation-red-1',
            ...payload
        }));
        createTimelineEvent
            .mockResolvedValueOnce({
                id: 'timeline-red-orientation-created',
                type: 'ACTION_CREATED'
            })
            .mockResolvedValueOnce({
                id: 'timeline-red-orientation-forwarded',
                type: 'STRATEGIC_ORIENTATION_FORWARDED_TO_SCRIBE'
            });

        const controller = new FacilitatorController();
        controller.teamId = 'red';
        controller.teamLabel = 'Red Team';
        controller.role = 'red_facilitator';
        controller.isReadOnly = false;
        const modal = { close: vi.fn() };

        await controller.submitStrategicOrientation(modal, {
            forecasts: {
                blue: 'pressure',
                green_asian_pacific: 'reframe',
                green_europe: 'stabilization'
            },
            rationale: 'Red records all required forecast targets.'
        });

        expect(createAction).toHaveBeenCalledWith(expect.objectContaining({
            goal: 'Red Team Forecasts',
            team: 'red',
            status: 'draft'
        }));
        expect(createTimelineEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
            type: 'STRATEGIC_ORIENTATION_FORWARDED_TO_SCRIBE',
            metadata: expect.objectContaining({
                artifact_type: 'forecast',
                orientation: 'pressure'
            })
        }));
        expect(actionsStoreSpy).toHaveBeenCalledWith('INSERT', expect.objectContaining({
            id: 'strategic-orientation-red-1'
        }));
        expect(timelineStoreSpy).toHaveBeenCalledTimes(2);
        expect(showToast).toHaveBeenCalledWith({
            message: 'Strategic Orientation forwarded to Facilitator',
            type: 'success'
        });
        expect(modal.close).toHaveBeenCalled();
    });

    it('renders the Strategic Orientation modal without the removed explanatory copy', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';

        const content = controller.createStrategicOrientationContent({});
        const html = content.innerHTML;
        const removedScribeCopy = ['The Scribe', 'must present the completed submission before White Cell receives it.'].join(' ');
        const removedOrientationInstruction = ['Each orientation', 'reflects a distinct posture toward strategic competition with the PRC.'].join(' ');
        const removedDescriptionClass = ['opt', 'desc'].join('-');

        expect(html).toContain('<fieldset class="form-group strategic-orientation-fieldset">');
        expect(html).toContain('<legend class="form-label" id="strategicOrientationLegend">Orientation <span class="required-indicator">*</span></legend>');
        expect(html).not.toContain(removedScribeCopy);
        expect(html).not.toContain(removedOrientationInstruction);
        expect(html).not.toContain(removedDescriptionClass);
        expect(html).toContain('Focus on affecting PRC GDP growth');
        expect(html).toContain('Achieve normalization with partners and existing relationships');
        expect(html).toContain('Develop new alliance and partnership structures');
        expect(html).not.toContain('Primary levers');
        expect(html).not.toContain('Accepted costs');
        expect(html).not.toContain('Posture');
        expect(html).not.toContain('Configure orientation');
        expect(html).not.toContain('Step 1 of');
        expect(html).not.toContain('Select the orientation that will frame the first move.');
        expect(html).not.toContain('No orientation selected');
        expect(html).toContain('class="form-input form-textarea"');
        expect(html).toContain('class="form-hint" id="rationaleHelp"');
        expect(html).toContain('label class="form-label" for="rationale"');
        expect(html).toContain('aria-describedby="rationaleHelp"');
        expect(html).toContain('role="radiogroup"');
        expect(html).toContain('role="radio"');
    });

    it('renders Red and Industry forecast modals with Blue and Green target groups plus one rationale box', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        controller.teamId = 'red';
        controller.teamLabel = 'Red Team';

        const content = controller.createStrategicOrientationContent({});
        const html = content.innerHTML;

        expect(html).toContain('Green (Asian Pacific) <span class="required-indicator">*</span>');
        expect(html).toContain('Green (Europe) <span class="required-indicator">*</span>');
        expect(html).toContain('Blue <span class="required-indicator">*</span>');
        expect(html).toContain('data-orientation-target="blue"');
        expect(html).toContain('data-orientation-target="green_asian_pacific"');
        expect(html).toContain('data-orientation-target="green_europe"');
        expect(html).toContain('label class="form-label" for="rationale"');
        expect(html).toContain('Briefly state why your team forecasts these orientations for Blue and the Green delegations.');
    });

    it('swaps Strategic Orientation and action button priority after the team records one', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { actionsStore } = await import('../stores/actions.js');
        const strategicOrientationBtn = createFakeElement('strategicOrientationBtn', 'button');
        const newActionBtn = createFakeElement('newActionBtn', 'button');
        strategicOrientationBtn.className = 'btn btn-primary';
        newActionBtn.className = 'btn btn-secondary';
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([
            await createStrategicOrientationAction()
        ]);

        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.isReadOnly = false;

        controller.updateStrategicOrientationControlAvailability({
            getElementById(id) {
                return {
                    strategicOrientationBtn,
                    newActionBtn
                }[id] || null;
            }
        });

        expect(strategicOrientationBtn.hidden).toBe(false);
        expect(strategicOrientationBtn.disabled).toBe(true);
        expect(strategicOrientationBtn.className).toContain('btn-secondary');
        expect(strategicOrientationBtn.title).toBe('Strategic Orientation has already been recorded for this team.');
        expect(strategicOrientationBtn.setAttribute).toHaveBeenCalledWith('aria-disabled', 'true');
        expect(newActionBtn.disabled).toBe(false);
        expect(newActionBtn.className).toContain('btn-primary');
        expect(newActionBtn.title).toBe('');
        expect(newActionBtn.removeAttribute).toHaveBeenCalledWith('aria-disabled');
    });

    it('prioritizes the Industry Strategic Orientation forecast before its forecast is recorded', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { actionsStore } = await import('../stores/actions.js');
        const strategicOrientationBtn = createFakeElement('strategicOrientationBtn', 'button');
        const newActionBtn = createFakeElement('newActionBtn', 'button');
        strategicOrientationBtn.className = 'btn btn-secondary';
        newActionBtn.className = 'btn btn-primary';
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([]);

        const controller = new FacilitatorController();
        controller.teamId = 'industry';
        controller.isReadOnly = false;

        controller.updateStrategicOrientationControlAvailability({
            getElementById(id) {
                return {
                    strategicOrientationBtn,
                    newActionBtn
                }[id] || null;
            }
        });

        expect(strategicOrientationBtn.hidden).toBe(false);
        expect(strategicOrientationBtn.disabled).toBe(false);
        expect(strategicOrientationBtn.className).toContain('btn-primary');
        expect(strategicOrientationBtn.title).toBe('');
        expect(strategicOrientationBtn.removeAttribute).toHaveBeenCalledWith('aria-disabled');
        expect(newActionBtn.disabled).toBe(false);
        expect(newActionBtn.className).toContain('btn-secondary');
        expect(newActionBtn.title).toBe('Record Strategic Orientation before creating actions.');
        expect(newActionBtn.removeAttribute).toHaveBeenCalledWith('aria-disabled');
    });

    it('rejects a stale Strategic Orientation modal open after the team records one', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { actionsStore } = await import('../stores/actions.js');
        const strategicOrientationBtn = createFakeElement('strategicOrientationBtn', 'button');
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([
            await createStrategicOrientationAction()
        ]);
        global.document = {
            ...createFakeDocument(),
            getElementById(id) {
                return id === 'strategicOrientationBtn' ? strategicOrientationBtn : null;
            }
        };

        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';
        controller.isReadOnly = false;

        controller.showStrategicOrientationModal();

        expect(showModal).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith({
            message: 'Strategic Orientation has already been recorded for this team.',
            type: 'info'
        });
        expect(strategicOrientationBtn.hidden).toBe(false);
        expect(strategicOrientationBtn.disabled).toBe(true);
        expect(strategicOrientationBtn.className).toContain('btn-secondary');
    });

    it('opens the recorded Strategic Orientation draft in edit mode when explicitly requested from projection', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { actionsStore } = await import('../stores/actions.js');
        const action = await createStrategicOrientationAction();
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([action]);
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';
        controller.isReadOnly = false;

        controller.showEditActionModal(action);

        expect(showModal).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Edit Strategic Orientation',
            size: 'xl'
        }));
        expect(showToast).not.toHaveBeenCalledWith(expect.objectContaining({
            message: 'Strategic Orientation has already been recorded for this team.'
        }));
    });

    it('updates the same recorded Strategic Orientation draft from projection edit mode', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { sessionStore } = await import('../stores/session.js');
        const { actionsStore } = await import('../stores/actions.js');
        const action = await createStrategicOrientationAction();
        const updatedAction = {
            ...action,
            goal: 'Strategic Orientation: Reframe'
        };
        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue(action.session_id);
        vi.spyOn(actionsStore, 'getAll').mockReturnValue([action]);
        const actionsStoreSpy = vi.spyOn(actionsStore, 'updateFromServer');
        updateDraftAction.mockResolvedValue(updatedAction);
        createTimelineEvent.mockResolvedValue({
            id: 'orientation-edit-forwarded',
            type: 'STRATEGIC_ORIENTATION_FORWARDED_TO_SCRIBE'
        });
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';
        controller.isReadOnly = false;
        const modal = { close: vi.fn() };

        await controller.submitStrategicOrientation(modal, {
            selected: 'reframe',
            rationale: 'Update the projected orientation before forwarding.'
        }, {
            actionId: action.id,
            isEdit: true
        });

        expect(updateDraftAction).toHaveBeenCalledWith(action.id, expect.objectContaining({
            goal: 'Strategic Orientation: Reframe'
        }));
        expect(createAction).not.toHaveBeenCalled();
        expect(actionsStoreSpy).toHaveBeenCalledWith('UPDATE', updatedAction);
        expect(modal.close).toHaveBeenCalled();
    });

    it('renders recorded Strategic Orientation artifacts without draft edit or delete controls', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';
        controller.isReadOnly = false;

        const markup = controller.renderActionCard(await createStrategicOrientationAction({
            id: 'strategic-orientation-blue-draft',
            status: 'draft'
        }));

        expect(markup).toContain('Draft Strategic Orientation artifacts are projected by the Facilitator before White Cell submission.');
        expect(markup).not.toContain('Edit Draft');
        expect(markup).not.toContain('Delete Draft');
        expect(markup).not.toContain('Forward to Facilitator');
    });

    it('mounts a Blue Scribe guide that covers every Scribe workspace surface', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        mockMountFollowAlong.mockClear();
        controller.mountFollowAlongOnboarding();

        expect(mockMountFollowAlong).toHaveBeenCalledTimes(1);
        expect(mockMountFollowAlong).toHaveBeenCalledWith(expect.objectContaining({
            storageKey: 'followalong:facilitator:blue',
            title: 'Blue Team Scribe guide'
        }));

        const guide = mockMountFollowAlong.mock.calls[0][0];
        expect(guide.steps.map((step) => step.title)).toEqual([
            'Blue Team Scribe',
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
        expect(flattenHighlights(guide.steps)).toEqual([
            '#header-game-state',
            '#header-timer',
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
        expect(guide.steps[1].body).toContain('Strategic Orientation before Move 1');
        expect(guide.steps[0].body).toContain('record Blue Team decisions');
        expect(guide.steps[4].body).toContain('explicit White Cell communications');
        expect(guide.steps[7].body).toContain('sentiment updates');
    });

    it('mounts a Green Scribe guide that covers proposals and every Scribe workspace surface', async () => {
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
            title: 'Green Team Scribe guide'
        }));

        const guide = mockMountFollowAlong.mock.calls[0][0];
        expect(guide.steps.map((step) => step.title)).toEqual([
            'Green Team Scribe',
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
        expect(flattenHighlights(guide.steps)).toEqual([
            '#header-game-state',
            '#header-timer',
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
        expect(guide.steps[1].body).toContain('Strategic Orientation before Move 1');
        expect(guide.steps[0].body).toContain('record Green Team decisions');
        expect(guide.steps[2].body).toContain("Create and revise your team's proposals");
        expect(guide.steps[5].body).toContain('proposals that White Cell has approved and forwarded for your team');
        expect(guide.steps[5].body).not.toContain('Green Team proposals');
    });

    it('mounts an Industry facilitator guide with the same proposal flow', async () => {
        global.document = {
            ...createFakeDocument(),
            body: { dataset: { team: 'industry' } }
        };

        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        mockMountFollowAlong.mockClear();
        controller.mountFollowAlongOnboarding();

        expect(mockMountFollowAlong).toHaveBeenCalledWith(expect.objectContaining({
            storageKey: 'followalong:facilitator:industry',
            title: 'Industry Team Scribe guide'
        }));

        const guide = mockMountFollowAlong.mock.calls[0][0];
        expect(guide.steps[0].title).toBe('Industry Team Scribe');
        expect(guide.steps[2].title).toBe('Build proposals');
        expect(guide.steps[0].body).toContain('record Industry Team decisions');
        expect(guide.steps[2].body).toContain("Create and revise your team's proposals");
    });

    it('mounts a Red Scribe guide that covers actions and every Scribe workspace surface', async () => {
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
            title: 'Red Team Scribe guide'
        }));

        const guide = mockMountFollowAlong.mock.calls[0][0];
        expect(guide.steps.map((step) => step.title)).toEqual([
            'Red Team Scribe',
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
        expect(flattenHighlights(guide.steps)).toEqual([
            '#header-game-state',
            '#header-timer',
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
        expect(guide.steps[1].body).toContain('Strategic Orientation before Move 1');
        expect(guide.steps[0].body).toContain('prepare actions');
        expect(guide.steps[2].body).toContain("Create and revise your team's actions");
        expect(guide.steps[2].body).toContain('White Cell reviews them');
    });

    it('groups quick-capture type radios with a semantic fieldset on every Scribe workspace surface', () => {
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

    it('styles facilitator response cards inside reusable horizontal tabs', () => {
        const cardsCss = readFileSync(CARDS_CSS_PATH, 'utf8');
        const gridCss = readFileSync(GRID_CSS_PATH, 'utf8');

        expect(gridCss).toContain('.tab-list {');
        expect(gridCss).toContain('.tab-button {');
        expect(gridCss).toContain('.tab-panel[hidden] {');
        expect(cardsCss).toContain('.response-type-group {');
        expect(cardsCss).toContain('.response-type-group__header {');
        expect(cardsCss).toContain('.response-type-group__count {');
        expect(cardsCss).toContain('.response-card {');
        expect(cardsCss).toContain('.response-card--new {');
    });

    it('renders facilitator RFIs as category tabs for single-category scanning', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const rfiList = createFakeElement('rfiList');

        global.document = {
            ...createFakeDocument(),
            getElementById(id) {
                return {
                    rfiList
                }[id] || null;
            }
        };

        const controller = new FacilitatorController();
        controller.rfis = [
            {
                id: 'rfi-political-1',
                team: 'blue',
                status: 'pending',
                priority: 'HIGH',
                query: 'Can Blue secure cabinet support?',
                categories: ['Political Feasibility'],
                created_at: '2026-04-09T10:08:00.000Z'
            },
            {
                id: 'rfi-alliance-political-1',
                team: 'blue',
                status: 'answered',
                priority: 'NORMAL',
                query: 'Will allies support a joint inspection?',
                categories: ['Alliance Response', 'Political Feasibility'],
                response: 'White Cell confirms limited ally support.',
                created_at: '2026-04-09T10:10:00.000Z'
            },
            {
                id: 'rfi-legacy-1',
                team: 'blue',
                status: 'pending',
                priority: 'LOW',
                query: 'Legacy RFI without category metadata.',
                categories: [],
                created_at: '2026-04-09T10:05:00.000Z'
            }
        ];

        controller.renderRfiList();

        expect(rfiList.innerHTML).toContain('class="tabbed-section rfi-tabs"');
        expect(rfiList.innerHTML).toContain('data-rfi-tabs');
        expect(rfiList.innerHTML).toContain('role="tablist" aria-label="RFI categories"');
        expect(rfiList.innerHTML).toContain('data-rfi-tab="economic-impact"');
        expect(rfiList.innerHTML).toContain('data-rfi-tab="political-feasibility"');
        expect(rfiList.innerHTML).toContain('data-rfi-tab="alliance-response"');
        expect(rfiList.innerHTML).toContain('data-rfi-tab="uncategorized"');
        expect(rfiList.innerHTML).toContain('Economic Impact<span class="tab-badge">0</span>');
        expect(rfiList.innerHTML).toContain('Political Feasibility<span class="tab-badge">2</span>');
        expect(rfiList.innerHTML).toContain('Alliance Response<span class="tab-badge">1</span>');
        expect(rfiList.innerHTML).toContain('Uncategorized<span class="tab-badge">1</span>');
        expect(rfiList.innerHTML).toContain('data-rfi-tab="political-feasibility"\n                    role="tab"\n                    aria-selected="true"');
        expect(rfiList.innerHTML).toContain('data-rfi-panel="economic-impact"\n                    role="tabpanel"\n                    hidden');
        expect(rfiList.innerHTML).toContain('data-rfi-panel="alliance-response"\n                    role="tabpanel"\n                    hidden');
        expect(rfiList.innerHTML).toContain('data-rfi-panel="uncategorized"\n                    role="tabpanel"\n                    hidden');
        expect(rfiList.innerHTML).toContain('aria-labelledby="rfi-category-political-feasibility-heading"');
        expect(rfiList.innerHTML).toContain('role="list"');
        expect(rfiList.innerHTML).toContain('role="listitem"');
        expect(rfiList.innerHTML).toContain('Will allies support a joint inspection?');
        expect(rfiList.innerHTML).toContain('White Cell confirms limited ally support.');
        expect(rfiList.innerHTML).toContain('Legacy RFI without category metadata.');
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

    it('labels the Industry facilitator action trigger as New Proposal', () => {
        const html = readFileSync(INDUSTRY_FACILITATOR_HTML_PATH, 'utf8');

        expect(html).toContain('body data-team="industry"');
        expect(html).toContain('id="newActionBtn"');
        expect(html).toContain('New Proposal');
        expect(html).toContain('No Proposals Yet');
        expect(html).toContain('Create your first proposal to start the White Cell review flow.');
        expect(html).not.toContain('No Actions Yet');
        expect(html).toContain('data-section="receivedProposals"');
        expect(html).toContain('id="receivedProposalsSection"');
        expect(html).toContain('id="receivedProposalsList"');
    });

    it('labels the Red facilitator action trigger as Take Action', () => {
        const html = readFileSync(RED_FACILITATOR_HTML_PATH, 'utf8');

        expect(html).toContain('id="newActionBtn"');
        expect(html).toContain('Actions');
        expect(html).toContain('Take Action');
        expect(html).toContain('No Actions Yet');
        expect(html).toContain('Create your first action to start the White Cell review flow.');
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

    it('renders proposal-specific empty-state copy for the Industry facilitator queue', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        controller.teamId = 'industry';
        controller.teamLabel = 'Industry Team';
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

    it('uses an Industry-scoped proposal form selector for the Industry proposal modal', async () => {
        global.document = createFakeDocument();
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        controller.teamId = 'industry';

        const content = controller.createGreenProposalContent();

        expect(content.innerHTML).toContain('id="industryProposalForm"');
        expect(content.innerHTML).not.toContain('id="greenProposalForm"');
    });

    it('renders action-specific empty-state copy for the Red facilitator queue', async () => {
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

        expect(actionsList.innerHTML).toContain('No Actions Yet');
        expect(actionsList.innerHTML).toContain('Create your first action to start the White Cell review flow.');
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

    it('sequences Strategic Orientation before move actions and shows newest actions first within a move', async () => {
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
                id: 'action-move-2',
                team: 'blue',
                status: 'draft',
                goal: 'Move 2 action',
                mechanism: 'Economic',
                move: 2,
                phase: 2,
                created_at: '2026-04-09T10:00:00.000Z'
            },
            {
                id: 'action-move-1-older',
                team: 'blue',
                status: 'draft',
                goal: 'Older Move 1 action',
                mechanism: 'Economic',
                move: 1,
                phase: 1,
                created_at: '2026-04-09T08:00:00.000Z'
            },
            await createStrategicOrientationAction({ status: 'submitted' }),
            {
                id: 'action-move-3',
                team: 'blue',
                status: 'adjudicated',
                goal: 'Move 3 action',
                mechanism: 'Economic',
                move: 3,
                phase: 2,
                adjudicated_at: '2026-04-09T10:20:00.000Z'
            },
            {
                id: 'action-move-1-newer',
                team: 'blue',
                status: 'draft',
                goal: 'Newest Move 1 action',
                mechanism: 'Economic',
                move: 1,
                phase: 1,
                created_at: '2026-04-09T09:00:00.000Z'
            }
        ];

        controller.renderActionsList();

        expect(actionsList.innerHTML).not.toContain('data-actions-tabs');
        expect(actionsList.innerHTML).toContain('aria-label="Submissions in exercise sequence"');
        expect(actionsList.innerHTML.indexOf('Strategic Orientation')).toBeLessThan(actionsList.innerHTML.indexOf('Move 1 Actions'));
        expect(actionsList.innerHTML.indexOf('Move 1 Actions')).toBeLessThan(actionsList.innerHTML.indexOf('Move 2 Actions'));
        expect(actionsList.innerHTML.indexOf('Move 2 Actions')).toBeLessThan(actionsList.innerHTML.indexOf('Move 3 Actions'));
        expect(actionsList.innerHTML.indexOf('Newest Move 1 action')).toBeLessThan(actionsList.innerHTML.indexOf('Older Move 1 action'));
        expect(actionsList.innerHTML).toContain('entity-card__toggle-state');
        expect(actionsList.innerHTML).toContain('Draft');
        expect(actionsList.innerHTML).toContain('Deliberation Underway');
    });

    it('labels proposal-team move groups as proposals', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        controller.teamId = 'green';
        controller.teamLabel = 'Green Team';

        const groups = controller.getActionSequenceGroups([
            { id: 'proposal-move-2', team: 'green', move: 2, mechanism: 'Proposal' },
            await createStrategicOrientationAction({ id: 'strategic-orientation-green', team: 'green' }),
            { id: 'proposal-move-1', team: 'green', move: 1, mechanism: 'Proposal' }
        ]);

        expect(groups.map((group) => group.title)).toEqual([
            'Strategic Orientation',
            'Move 1 Proposals',
            'Move 2 Proposals'
        ]);
    });

    it('renders Green and Industry proposal records as proposals instead of generic action cards', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        global.document = createFakeDocument();

        for (const teamId of ['green', 'industry']) {
            const controller = new FacilitatorController();
            controller.teamId = teamId;
            controller.teamLabel = teamId === 'green' ? 'Green Team' : 'Industry Team';
            controller.isReadOnly = false;

            const markup = controller.renderActionCard({
                id: `proposal-${teamId}-1`,
                team: teamId,
                status: 'draft',
                goal: 'Joint Port Proposal',
                mechanism: 'Proposal',
                sector: 'Biotechnology',
                expected_outcomes: 'Reduce room for arbitrage.',
                move: 2,
                phase: 1,
                ally_contingencies: serializeProposalDetails({
                    originators: ['EU', 'Japan'],
                    objective: 'Coordinate port investment standards.',
                    category: 'Partnership',
                    intendedPartners: 'Blue Team',
                    delivery: 'Joint Statement',
                    timingAndConditions: 'Before the next ministerial meeting.',
                    recipientTeam: 'blue'
                })
            });

            expect(markup).toContain('data-artifact-type="proposal"');
            expect(markup).toContain('role="article"');
            expect(markup).toContain('aria-label="Proposal: Joint Port Proposal"');
            expect(markup).toContain('PROPOSAL');
            expect(markup).toContain('Proposal Objective');
            expect(markup).toContain('Coordinate port investment standards.');
            expect(markup).toContain('Originators');
            expect(markup).toContain('EU, Japan');
            expect(markup).toContain('Category');
            expect(markup).toContain('Intended Partners');
            expect(markup).toContain('Focus Sector');
            expect(markup).toContain('Delivery');
            expect(markup).toContain('Timing &amp; Conditions');
            expect(markup).toContain('<strong>Expected Outcomes:</strong> Reduce room for arbitrage.');
            expect(markup).toContain('Edit Proposal');
            expect(markup).toContain('Delete Proposal');
            expect(markup).not.toContain('Ally Contingencies');
            expect(markup).not.toContain('Exposure');
            expect(markup).not.toContain('Edit Draft');
            expect(markup).not.toContain('Delete Draft');
            expect(markup).not.toContain('Forward to Facilitator');
            expect(markup).not.toContain('Action details');
        }
    });

    it('uses proposal language when deleting a Green or Industry draft proposal', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { confirmModal } = await import('../components/ui/Modal.js');
        confirmModal.mockResolvedValue(true);

        for (const teamId of ['green', 'industry']) {
            const proposal = {
                id: `proposal-${teamId}-delete`,
                team: teamId,
                status: 'draft',
                mechanism: 'Proposal'
            };
            const controller = new FacilitatorController();
            controller.teamId = teamId;
            controller.isReadOnly = false;

            await controller.confirmDeleteAction(proposal);

            expect(confirmModal).toHaveBeenLastCalledWith({
                title: 'Delete Draft Proposal',
                message: 'Delete this draft proposal? This cannot be undone.',
                confirmLabel: 'Delete',
                variant: 'danger'
            });
            expect(deleteDraftAction).toHaveBeenLastCalledWith(proposal.id);
            expect(showToast).toHaveBeenLastCalledWith({
                message: 'Draft proposal deleted',
                type: 'success'
            });
        }
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
                informed: ['Allies']
            })
        }];
        const markup = controller.renderActionCard(controller.actions[1]);

        expect(markup).toContain('Objective:</strong> Lower upstream dependency on PRC inputs.');
        expect(markup).toContain('Action details');
        expect(markup).toContain('Stabilize biotech leverage');
        expect(markup).toContain('toggle-action-card-btn');
        expect(markup).toContain('entity-card--collapsible is-collapsed');
        expect(markup).toContain('hidden');
        controller.expandedActionCardIds.add('action-blue-1');
        const expandedMarkup = controller.renderActionCard(controller.actions[1]);

        expect(expandedMarkup).toContain('Levers:</strong> Export Controls, Sanctions');
        expect(expandedMarkup).toContain('Sectors:</strong> Biotechnology, Agriculture');
        expect(expandedMarkup).toContain('Legislative Route:</strong> Existing legislation/policy, Proposing new legislation/policy');
        expect(expandedMarkup).toContain('Coordinated:</strong> Executive');
        expect(expandedMarkup).toContain('Informed/Engaged:</strong> Allies');
        expect(expandedMarkup).toContain('Timeline:</strong> 6 months');
        expect(expandedMarkup).toContain('Blue Team | Move 2 | Action 2');
    });

    it('renders checkbox groups for facilitator modal multi-select fields', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';
        const blueWizardMarkup = controller.createBlueActionWizardContent().innerHTML;
        const actionFormMarkup = controller.createActionFormContent().innerHTML;
        const bluePageOneMarkup = blueWizardMarkup.slice(
            blueWizardMarkup.indexOf('data-blue-action-page="0"'),
            blueWizardMarkup.indexOf('data-blue-action-page="1"')
        );
        const bluePageTwoMarkup = blueWizardMarkup.slice(
            blueWizardMarkup.indexOf('data-blue-action-page="1"'),
            blueWizardMarkup.indexOf('data-blue-action-page="2"')
        );
        const bluePageThreeMarkup = blueWizardMarkup.slice(
            blueWizardMarkup.indexOf('data-blue-action-page="2"')
        );
        const supplyChainDetailsOpeningTag = bluePageTwoMarkup.slice(
            bluePageTwoMarkup.indexOf('id="actionSupplyChainFocusDetails"'),
            bluePageTwoMarkup.indexOf('>', bluePageTwoMarkup.indexOf('id="actionSupplyChainFocusDetails"'))
        );

        expect(blueWizardMarkup).toContain('What you intend this action to achieve.');
        expect(blueWizardMarkup).toContain("What you anticipate will actually happen as a result, including effects you don't control.");
        expect(blueWizardMarkup).not.toContain('data-blue-action-checkbox="lever"');
        expect(blueWizardMarkup).not.toContain('Select one or more levers.');
        expect(blueWizardMarkup).toContain('data-blue-action-checkbox="instrument"');
        expect(blueWizardMarkup).toContain('value="Diplomacy"');
        expect(blueWizardMarkup).toContain('value="Information"');
        expect(blueWizardMarkup).toContain('value="Military"');
        expect(blueWizardMarkup).toContain('Select one or more instruments of power.');
        expect(blueWizardMarkup).not.toContain('id="actionInstrument"');
        expect(bluePageOneMarkup).toContain('class="action-builder-field-stack"');
        expect(bluePageOneMarkup).not.toContain('class="section-grid section-grid-2"');
        expect(bluePageOneMarkup.indexOf('id="actionTitle"')).toBeLessThan(
            bluePageOneMarkup.indexOf('id="actionInstrumentsLabel"')
        );
        expect(bluePageOneMarkup.indexOf('id="actionInstrumentsLabel"')).toBeLessThan(
            bluePageOneMarkup.indexOf('id="actionObjective"')
        );
        expect(blueWizardMarkup).toContain('data-blue-action-checkbox="sector"');
        expect(blueWizardMarkup).toContain('Select one or more sectors.');
        expect(bluePageTwoMarkup).toContain('Does this action have a supply chain focus? *');
        expect(bluePageTwoMarkup).toContain('type="radio"');
        expect(bluePageTwoMarkup).toContain('value="Yes"');
        expect(bluePageTwoMarkup).toContain('value="No"');
        expect(bluePageTwoMarkup).toContain('aria-required="true"');
        expect(bluePageTwoMarkup).toContain('id="actionSupplyChainFocusDetails"');
        expect(supplyChainDetailsOpeningTag).toContain('hidden');
        expect(bluePageTwoMarkup).toContain('id="actionSupplyChainAngleLabel"');
        expect(bluePageTwoMarkup).toContain('data-blue-action-checkbox="supply-chain-angle"');
        expect(bluePageTwoMarkup).toContain('value="Build resilience for Blue"');
        expect(bluePageTwoMarkup).toContain('value="Disrupt Red"');
        expect(bluePageTwoMarkup).toContain('id="actionSupplyChainAreaLabel"');
        expect(bluePageTwoMarkup).toContain('data-blue-action-checkbox="supply-chain-area"');
        expect(bluePageTwoMarkup).toContain('value="Extraction"');
        expect(bluePageTwoMarkup).toContain('value="Refinement"');
        expect(bluePageTwoMarkup).toContain('value="Distribution"');
        expect(bluePageTwoMarkup).toContain('value="Advanced Manufacturing"');
        expect(bluePageTwoMarkup).not.toContain('value="Diversification"');
        expect(bluePageTwoMarkup.indexOf('id="actionHasSupplyChainFocusLabel"')).toBeLessThan(
            bluePageTwoMarkup.indexOf('id="actionSectorsLabel"')
        );
        expect(blueWizardMarkup).toContain('data-blue-action-checkbox="country"');
        expect(blueWizardMarkup).toContain('value="U.S"');
        expect(blueWizardMarkup).toContain('value="BRICS+"');
        expect(blueWizardMarkup).toContain('value="Other"');
        expect(blueWizardMarkup).toContain('Select one or more countries.');
        expect(blueWizardMarkup).toContain('data-blue-action-checkbox="legislative"');
        expect(blueWizardMarkup).toContain('Select all legislative routes that apply.');
        expect(blueWizardMarkup).toContain('actionInstrumentOther');
        expect(blueWizardMarkup).toContain('actionFocusCountryOtherInput');
        expect(blueWizardMarkup).not.toContain('Date of Effect');
        expect(blueWizardMarkup).not.toContain('actionEnforcementTimeline');
        expect(blueWizardMarkup).not.toContain('id="blueActionSummary"');
        expect(blueWizardMarkup).not.toContain('data-blue-action-checkbox="coordinated"');
        expect(blueWizardMarkup).not.toContain('data-blue-action-checkbox="informed"');
        expect(blueWizardMarkup).toContain('Page 1 of 3');
        expect(blueWizardMarkup).not.toContain('Page 1 of 2');
        expect(bluePageTwoMarkup).toContain('id="actionSectorsLabel"');
        expect(bluePageTwoMarkup).toContain('id="actionHasSupplyChainFocusLabel"');
        expect(bluePageTwoMarkup).not.toContain('for="actionImplementation"');
        expect(bluePageTwoMarkup).not.toContain('id="actionFocusCountriesLabel"');
        expect(bluePageTwoMarkup).not.toContain('for="actionExpectedOutcomes"');
        expect(bluePageThreeMarkup).toContain('for="actionImplementation"');
        expect(bluePageThreeMarkup).toContain('id="actionFocusCountriesLabel"');
        expect(bluePageThreeMarkup).toContain('for="actionExpectedOutcomes"');
        expect(bluePageThreeMarkup).toContain('Select one or more countries.');
        expect(bluePageThreeMarkup).toContain("What you anticipate will actually happen as a result, including effects you don't control.");
        expect(bluePageThreeMarkup.indexOf('for="actionImplementation"')).toBeLessThan(
            bluePageThreeMarkup.indexOf('id="actionFocusCountriesLabel"')
        );
        expect(bluePageThreeMarkup.indexOf('id="actionFocusCountriesLabel"')).toBeLessThan(
            bluePageThreeMarkup.indexOf('for="actionExpectedOutcomes"')
        );
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

    it('renders the Red Team action wizard with DIME checkboxes, PRC focus, and no implementation controls', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        controller.teamId = 'red';
        controller.teamLabel = 'Red Team';

        const redWizardMarkup = controller.createBlueActionWizardContent().innerHTML;
        const redPageOneMarkup = redWizardMarkup.slice(
            redWizardMarkup.indexOf('data-blue-action-page="0"'),
            redWizardMarkup.indexOf('data-blue-action-page="1"')
        );
        const redPageTwoMarkup = redWizardMarkup.slice(
            redWizardMarkup.indexOf('data-blue-action-page="1"')
        );

        expect(redWizardMarkup).toContain('What you intend this action to achieve in 6 months.');
        expect(redWizardMarkup).not.toContain('What you intend this action to achieve.</p>');
        expect(redWizardMarkup).not.toContain('for="actionImplementation"');
        expect(redWizardMarkup).not.toContain('for="actionEnforcementTimeline"');
        expect(redWizardMarkup).not.toContain('id="actionImplementationOther"');
        expect(redWizardMarkup).not.toContain('id="actionEnforcementTimelineOther"');
        expect(redWizardMarkup).not.toContain('data-blue-action-checkbox="legislative"');
        expect(redWizardMarkup).toContain('data-blue-action-checkbox="instrument"');
        expect(redWizardMarkup).not.toContain('id="actionInstrument"');
        expect(redPageOneMarkup).toContain('class="action-builder-field-stack"');
        expect(redPageOneMarkup.indexOf('id="actionTitle"')).toBeLessThan(
            redPageOneMarkup.indexOf('id="actionInstrumentsLabel"')
        );
        expect(redWizardMarkup).toContain('value="Economic"');
        expect(redWizardMarkup).toContain('value="Diplomacy"');
        expect(redWizardMarkup).toContain('value="Information"');
        expect(redWizardMarkup).toContain('value="Military"');
        expect(redWizardMarkup).toContain('value="PRC"');
        expect(redWizardMarkup).toContain('value="U.S"');
        expect(redWizardMarkup).toContain('value="Russia"');
        expect(redWizardMarkup).toContain('value="Other"');
        expect(redWizardMarkup).toContain('data-blue-action-checkbox="supply-chain-focus"');
        expect(redWizardMarkup).toContain('value="Diversification"');
        expect(redWizardMarkup).not.toContain('Does this action have a supply chain focus?');
        expect(redWizardMarkup).toContain('Page 1 of 2');
        expect(redWizardMarkup).not.toContain('data-blue-action-page="2"');
        expect(redPageTwoMarkup).toContain('id="actionFocusCountriesLabel"');
        expect(redPageTwoMarkup).toContain('for="actionExpectedOutcomes"');
    });

    it('reopens a custom Blue instrument as Other with the saved value preserved', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        const blueWizardMarkup = controller.createBlueActionWizardContent({
            goal: 'Secure corridor access',
            mechanism: 'Technology Standards'
        }).innerHTML;

        expect(blueWizardMarkup).toContain('id="actionBlueInstrumentOther"');
        expect(blueWizardMarkup).toContain('value="Other"');
        expect(blueWizardMarkup).toContain('checked');
        expect(blueWizardMarkup).toContain('id="actionInstrumentOther"');
        expect(blueWizardMarkup).toContain('value="Technology Standards"');
    });

    it('reopens a custom Blue focus country as Other with the saved value preserved', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        const blueWizardMarkup = controller.createBlueActionWizardContent({
            goal: 'Secure corridor access',
            targets: ['Ghana']
        }).innerHTML;

        expect(blueWizardMarkup.indexOf('id="actionHasSupplyChainFocusLabel"')).toBeLessThan(
            blueWizardMarkup.indexOf('id="actionBlueSectorOtherGroup"')
        );
        expect(blueWizardMarkup).toContain('id="actionBlueSectorOtherInput"');
        expect(blueWizardMarkup).toContain('id="actionFocusCountryOtherInput"');
        expect(blueWizardMarkup).toContain('value="Ghana"');
    });

    it('reopens saved Blue supply-chain details when the answer is Yes', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { serializeBlueActionDetails } = await import('../features/actions/blueActionDetails.js');
        global.document = createFakeDocument();

        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        const blueWizardMarkup = controller.createBlueActionWizardContent({
            ally_contingencies: serializeBlueActionDetails({
                supplyChainFocusDecision: 'Yes',
                supplyChainActionAngles: ['Disrupt Red'],
                supplyChainAreas: ['Refinement', 'Distribution']
            })
        }).innerHTML;
        const detailsOpeningTag = blueWizardMarkup.slice(
            blueWizardMarkup.indexOf('id="actionSupplyChainFocusDetails"'),
            blueWizardMarkup.indexOf('>', blueWizardMarkup.indexOf('id="actionSupplyChainFocusDetails"'))
        );

        expect(blueWizardMarkup).toContain('id="actionHasSupplyChainFocusYes"');
        expect(blueWizardMarkup).toMatch(/value="Disrupt Red"\s+checked/);
        expect(blueWizardMarkup).toMatch(/value="Refinement"\s+checked/);
        expect(blueWizardMarkup).toMatch(/value="Distribution"\s+checked/);
        expect(detailsOpeningTag).not.toContain('hidden');
    });

    it('collects Blue wizard values while preserving stored levers from existing actions', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        const blueWizardFieldValues = {
            '#actionTitle': 'Secure corridor access',
            '#actionInstrument': 'Economic',
            '#actionInstrumentOther': '',
            '#actionObjective': 'Stabilize trade flows.',
            '#actionImplementation': 'Executive Order',
            '#actionExpectedOutcomes': 'Reduce dependency on vulnerable routes.',
            '#actionBlueSectorOtherInput': '',
            '#actionFocusCountryOtherInput': '',
            '#actionImplementationOther': '',
            '[name="actionHasSupplyChainFocus"]:checked': 'Yes'
        };

        const wizardData = controller.getBlueActionWizardData({
            dataset: {
                blueActionLevers: JSON.stringify(['Export Controls', 'Sanctions']),
                blueActionCoordinated: JSON.stringify(['Executive']),
                blueActionInformed: JSON.stringify(['Allies'])
            },
            querySelector(selector) {
                if (!(selector in blueWizardFieldValues)) {
                    return null;
                }

                return { value: blueWizardFieldValues[selector] };
            },
            querySelectorAll(selector) {
                if (selector === '[data-blue-action-checkbox="instrument"]:checked') {
                    return [{ value: 'Diplomacy' }, { value: 'Information' }, { value: 'Military' }];
                }

                if (selector === '[data-blue-action-checkbox="sector"]:checked') {
                    return [{ value: 'Biotechnology' }, { value: 'Agriculture' }];
                }

                if (selector === '[data-blue-action-checkbox="supply-chain-angle"]:checked') {
                    return [{ value: 'Build resilience for Blue' }, { value: 'Disrupt Red' }];
                }

                if (selector === '[data-blue-action-checkbox="supply-chain-area"]:checked') {
                    return [{ value: 'Extraction' }, { value: 'Advanced Manufacturing' }];
                }

                if (selector === '[data-blue-action-checkbox="country"]:checked') {
                    return [{ value: 'Kenya' }, { value: 'BRICS+' }];
                }

                return [];
            }
        });

        expect(wizardData.levers).toEqual(['Export Controls', 'Sanctions']);
        expect(wizardData.instrumentOfPower).toBe('Diplomacy');
        expect(wizardData.instruments).toEqual(['Diplomacy', 'Information', 'Military']);
        expect(wizardData.selectedInstrumentValues).toEqual(['Diplomacy', 'Information', 'Military']);
        expect(wizardData.sectors).toEqual(['Biotechnology', 'Agriculture']);
        expect(wizardData.supplyChainFocusDecision).toBe('Yes');
        expect(wizardData.supplyChainActionAngles).toEqual(['Build resilience for Blue', 'Disrupt Red']);
        expect(wizardData.supplyChainArea).toBe('Extraction');
        expect(wizardData.supplyChainAreas).toEqual(['Extraction', 'Advanced Manufacturing']);
        expect(wizardData.supplyChainFocus).toBe('Extraction');
        expect(wizardData.supplyChainFocuses).toEqual(['Extraction', 'Advanced Manufacturing']);
        expect(wizardData.focusCountries).toEqual(['Kenya', 'BRICS+']);
        expect(wizardData.selectedFocusCountryValues).toEqual(['Kenya', 'BRICS+']);
        expect(wizardData.coordinated).toEqual(['Executive']);
        expect(wizardData.informed).toEqual(['Allies']);

        const payload = controller.buildBlueActionPayload(wizardData);
        expect(payload.mechanism).toBe('Diplomacy');
        expect(payload.ally_contingencies).toContain(
            'Instruments: ["Diplomacy","Information","Military"]'
        );
        expect(payload.ally_contingencies).toContain('Supply Chain Focus Decision: Yes');
        expect(payload.ally_contingencies).toContain(
            'Supply Chain Action Angles: ["Build resilience for Blue","Disrupt Red"]'
        );
        expect(payload.ally_contingencies).toContain(
            'Supply Chain Areas: ["Extraction","Advanced Manufacturing"]'
        );

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

    it('omits Date of Effect while preserving a stored legacy value', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';

        const wizardData = controller.getBlueActionWizardData({
            querySelector(selector) {
                return {
                    '#actionTitle': { value: 'Secure corridor access' },
                    '#actionInstrument': { value: 'Economic' },
                    '#actionInstrumentOther': { value: '' },
                    '#actionObjective': { value: 'Stabilize trade flows.' },
                    '#actionImplementation': { value: 'Executive Order' },
                    '#actionExpectedOutcomes': { value: 'Reduce dependency on vulnerable routes.' },
                    '#actionBlueSectorOtherInput': { value: '' },
                    '#actionFocusCountryOtherInput': { value: '' },
                    '#actionImplementationOther': { value: '' },
                    '[name="actionHasSupplyChainFocus"]:checked': { value: 'No' }
                }[selector] || null;
            },
            dataset: {
                blueActionEnforcementTimeline: '18 months with quarterly checkpoints'
            },
            querySelectorAll(selector) {
                if (selector === '[data-blue-action-checkbox="sector"]:checked') {
                    return [{ value: 'Biotechnology' }];
                }

                if (selector === '[data-blue-action-checkbox="supply-chain-focus"]:checked') {
                    return [{ value: 'Diversification' }];
                }

                if (selector === '[data-blue-action-checkbox="country"]:checked') {
                    return [{ value: 'Kenya' }];
                }

                return [];
            }
        });

        expect(wizardData.enforcementTimeline).toBe('18 months with quarterly checkpoints');
        expect(controller.validateBlueActionWizardPage(wizardData, 1)).toBeNull();
        expect(controller.validateBlueActionWizardPage(wizardData, 2)).toBeNull();
        expect(controller.buildBlueActionPayload(wizardData).ally_contingencies).toContain(
            'Enforcement Timeline: 18 months with quarterly checkpoints'
        );
    });

    it('collects multiple Red instruments without requiring implementation or date of effect', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        controller.teamId = 'red';
        controller.teamLabel = 'Red Team';

        const wizardData = controller.getBlueActionWizardData({
            querySelector(selector) {
                return {
                    '#actionTitle': { value: 'Counter port access squeeze' },
                    '#actionInstrumentOther': { value: '' },
                    '#actionObjective': { value: 'Preserve freight leverage over the next 6 months.' },
                    '#actionExpectedOutcomes': { value: 'Maintain corridor access while White Cell reviews the move.' },
                    '#actionBlueSectorOtherInput': { value: '' },
                    '#actionFocusCountryOtherInput': { value: '' }
                }[selector] || null;
            },
            dataset: {},
            querySelectorAll(selector) {
                if (selector === '[data-blue-action-checkbox="instrument"]:checked') {
                    return [
                        { value: 'Economic' },
                        { value: 'Diplomacy' },
                        { value: 'Information' },
                        { value: 'Military' }
                    ];
                }

                if (selector === '[data-blue-action-checkbox="sector"]:checked') {
                    return [{ value: 'Biotechnology' }];
                }

                if (selector === '[data-blue-action-checkbox="supply-chain-focus"]:checked') {
                    return [{ value: 'Diversification' }];
                }

                if (selector === '[data-blue-action-checkbox="country"]:checked') {
                    return [{ value: 'Russia' }];
                }

                return [];
            }
        });

        expect(wizardData.implementation).toBe('');
        expect(wizardData.implementationSelectValue).toBe('');
        expect(wizardData.legislativeOptions).toEqual([]);
        expect(wizardData.enforcementTimeline).toBe('');
        expect(wizardData.instruments).toEqual(['Economic', 'Diplomacy', 'Information', 'Military']);
        expect(wizardData.instrumentOfPower).toBe('Economic');
        expect(controller.validateBlueActionWizardPage(wizardData, 1)).toBeNull();
    });

    it('captures and validates a custom instrument of power in the Blue wizard', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        const wizardData = controller.getBlueActionWizardData({
            querySelector(selector) {
                return {
                    '#actionTitle': { value: 'Secure corridor access' },
                    '#actionInstrument': { value: 'Other' },
                    '#actionInstrumentOther': { value: 'Technology Standards' },
                    '#actionObjective': { value: 'Stabilize trade flows.' },
                    '#actionImplementation': { value: 'Executive Order' },
                    '#actionExpectedOutcomes': { value: 'Reduce dependency on vulnerable routes.' },
                    '#actionBlueSectorOtherInput': { value: '' },
                    '#actionFocusCountryOtherInput': { value: '' },
                    '#actionImplementationOther': { value: '' },
                    '[name="actionHasSupplyChainFocus"]:checked': { value: 'No' },
                }[selector] || null;
            },
            dataset: {},
            querySelectorAll(selector) {
                if (selector === '[data-blue-action-checkbox="sector"]:checked') {
                    return [{ value: 'Biotechnology' }];
                }

                if (selector === '[data-blue-action-checkbox="supply-chain-focus"]:checked') {
                    return [{ value: 'Diversification' }];
                }

                if (selector === '[data-blue-action-checkbox="country"]:checked') {
                    return [{ value: 'Kenya' }];
                }

                return [];
            }
        });

        expect(wizardData.instrumentOfPower).toBe('Technology Standards');
        expect(wizardData.instrumentSelectValue).toBe('Other');
        expect(wizardData.instrumentOther).toBe('Technology Standards');
        expect(controller.validateBlueActionWizardPage(wizardData, 0)).toBeNull();
        expect(controller.validateBlueActionWizardPage({
            ...wizardData,
            instrumentOther: '',
            instrumentOfPower: ''
        }, 0)).toBe('Please enter the custom instrument of power.');
    });

    it('captures and validates a custom sector in the Blue wizard', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        const wizardData = controller.getBlueActionWizardData({
            querySelector(selector) {
                return {
                    '#actionTitle': { value: 'Secure corridor access' },
                    '#actionInstrument': { value: 'Economic' },
                    '#actionInstrumentOther': { value: '' },
                    '#actionObjective': { value: 'Stabilize trade flows.' },
                    '#actionImplementation': { value: 'Executive Order' },
                    '#actionExpectedOutcomes': { value: 'Reduce dependency on vulnerable routes.' },
                    '#actionBlueSectorOtherInput': { value: 'Critical Minerals' },
                    '#actionFocusCountryOtherInput': { value: '' },
                    '#actionImplementationOther': { value: '' },
                    '[name="actionHasSupplyChainFocus"]:checked': { value: 'No' },
                }[selector] || null;
            },
            dataset: {},
            querySelectorAll(selector) {
                if (selector === '[data-blue-action-checkbox="sector"]:checked') {
                    return [{ value: 'Other' }];
                }

                if (selector === '[data-blue-action-checkbox="supply-chain-focus"]:checked') {
                    return [{ value: 'Diversification' }];
                }

                if (selector === '[data-blue-action-checkbox="country"]:checked') {
                    return [{ value: 'Kenya' }];
                }

                return [];
            }
        });

        expect(wizardData.sectors).toEqual(['Critical Minerals']);
        expect(wizardData.selectedSectorValues).toEqual(['Other']);
        expect(wizardData.sectorOther).toBe('Critical Minerals');
        expect(controller.validateBlueActionWizardPage(wizardData, 1)).toBeNull();
        expect(controller.validateBlueActionWizardPage({
            ...wizardData,
            sectorOther: '',
            sectors: []
        }, 1)).toBe('Please enter the custom sector.');
    });

    it('captures and validates a custom focus country in the Blue wizard', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();

        const wizardData = controller.getBlueActionWizardData({
            querySelector(selector) {
                return {
                    '#actionTitle': { value: 'Secure corridor access' },
                    '#actionInstrument': { value: 'Economic' },
                    '#actionInstrumentOther': { value: '' },
                    '#actionObjective': { value: 'Stabilize trade flows.' },
                    '#actionImplementation': { value: 'Executive Order' },
                    '#actionExpectedOutcomes': { value: 'Reduce dependency on vulnerable routes.' },
                    '#actionBlueSectorOtherInput': { value: '' },
                    '#actionFocusCountryOtherInput': { value: 'Ghana' },
                    '#actionImplementationOther': { value: '' },
                    '[name="actionHasSupplyChainFocus"]:checked': { value: 'No' },
                }[selector] || null;
            },
            dataset: {},
            querySelectorAll(selector) {
                if (selector === '[data-blue-action-checkbox="sector"]:checked') {
                    return [{ value: 'Biotechnology' }];
                }

                if (selector === '[data-blue-action-checkbox="supply-chain-focus"]:checked') {
                    return [{ value: 'Diversification' }];
                }

                if (selector === '[data-blue-action-checkbox="country"]:checked') {
                    return [{ value: 'Other' }];
                }

                return [];
            }
        });

        expect(wizardData.focusCountries).toEqual(['Ghana']);
        expect(wizardData.selectedFocusCountryValues).toEqual(['Other']);
        expect(wizardData.focusCountryOther).toBe('Ghana');
        expect(controller.validateBlueActionWizardPage(wizardData, 2)).toBeNull();
        expect(controller.validateBlueActionWizardPage({
            ...wizardData,
            focusCountryOther: '',
            focusCountries: []
        }, 2)).toBe('Please enter the custom focus country.');
    });

    it('allows Blue drafts to be saved before the third page is completed', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        const pageZeroDraft = {
            actionTitle: 'Secure corridor access',
            objective: 'Stabilize trade flows.',
            instrumentOfPower: 'Economic',
            instrumentSelectValue: 'Economic',
            instrumentOther: '',
            levers: [],
            sectors: [],
            selectedSectorValues: [],
            sectorOther: '',
            selectedFocusCountryValues: [],
            focusCountryOther: '',
            supplyChainFocusDecision: '',
            supplyChainActionAngles: [],
            supplyChainArea: '',
            supplyChainAreas: [],
            supplyChainFocus: '',
            supplyChainFocuses: [],
            implementation: '',
            implementationSelectValue: '',
            implementationOther: '',
            legislativeOptions: [],
            focusCountries: [],
            enforcementTimeline: '',
            expectedOutcomes: '',
            coordinated: [],
            informed: []
        };

        expect(controller.getBlueActionDraftSaveValidationError({
            ...pageZeroDraft,
            actionTitle: '',
            objective: '',
            instrumentOfPower: '',
            instrumentSelectValue: '',
            instrumentOther: '',
        }, 0)).toBe('Add at least one action detail before saving a draft.');
        expect(controller.getBlueActionDraftSaveValidationError(pageZeroDraft, 0)).toBeNull();
        expect(controller.getBlueActionDraftSaveValidationError(pageZeroDraft, 1)).toBeNull();
        expect(controller.getBlueActionDraftSaveValidationError(pageZeroDraft, 2)).toBe(
            'Select Yes or No for the supply chain focus question.'
        );
        const pageTwoDraft = {
            ...pageZeroDraft,
            sectors: ['Biotechnology'],
            selectedSectorValues: ['Biotechnology'],
            supplyChainFocusDecision: 'No'
        };

        expect(controller.validateBlueActionWizardPage(pageTwoDraft, 1)).toBeNull();
        expect(controller.validateBlueActionWizardPage({
            ...pageTwoDraft,
            supplyChainFocusDecision: ''
        }, 1)).toBe('Select Yes or No for the supply chain focus question.');
        expect(controller.validateBlueActionWizardPage({
            ...pageTwoDraft,
            supplyChainFocusDecision: 'Yes'
        }, 1)).toBe('Select at least one action angle.');
        expect(controller.validateBlueActionWizardPage({
            ...pageTwoDraft,
            supplyChainFocusDecision: 'Yes',
            supplyChainActionAngles: ['Build resilience for Blue']
        }, 1)).toBe('Select at least one supply chain area.');
        expect(controller.validateBlueActionWizardPage({
            ...pageTwoDraft,
            supplyChainFocusDecision: 'Yes',
            supplyChainActionAngles: ['Build resilience for Blue'],
            supplyChainArea: 'Extraction',
            supplyChainAreas: ['Extraction'],
            supplyChainFocus: 'Extraction',
            supplyChainFocuses: ['Extraction']
        }, 1)).toBeNull();
        expect(controller.validateBlueActionWizardPage(pageTwoDraft, 2)).toBe('Select at least one focus country.');
        expect(controller.getBlueActionDraftSaveValidationError(pageTwoDraft, 2)).toBeNull();
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
                    '#actionInstrumentOther': { value: '' },
                    '#actionObjective': { value: 'Stabilize trade flows.' },
                    '#actionImplementation': { value: '' },
                    '#actionExpectedOutcomes': { value: '' },
                    '#actionBlueSectorOtherInput': { value: '' },
                    '#actionFocusCountryOtherInput': { value: '' },
                    '#actionImplementationOther': { value: '' },
                    '[name="actionHasSupplyChainFocus"]:checked': { value: 'No' },
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

    it('forwards Blue drafts to the Facilitator without submitting them to White Cell', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { serializeBlueActionDetails } = await import('../features/actions/blueActionDetails.js');
        const { actionsStore } = await import('../stores/actions.js');
        const { timelineStore } = await import('../stores/timeline.js');
        const forwardedAction = {
            id: 'action-blue-draft-1',
            session_id: 'session-blue-forward',
            team: 'blue',
            goal: 'Secure corridor access',
            move: 2,
            phase: 3,
            status: 'draft',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Secure corridor access.',
                instruments: ['Economic', 'Diplomacy', 'Information', 'Military'],
                levers: ['Export Controls'],
                sectors: ['Biotechnology'],
                supplyChainFocusDecision: 'Yes',
                supplyChainActionAngles: ['Disrupt Red'],
                supplyChainAreas: ['Refinement'],
                implementation: 'Legislative',
                legislativeOptions: ['Existing legislation/policy'],
                enforcementTimeline: '6 months',
                scribeHandoff: 'Forwarded'
            })
        };
        updateDraftAction.mockResolvedValue(forwardedAction);
        createTimelineEvent.mockResolvedValue({
            id: 'timeline-blue-forward-1',
            session_id: 'session-blue-forward',
            type: 'ACTION_FORWARDED_TO_SCRIBE',
            content: 'Action forwarded to Facilitator: Secure corridor access',
            team: 'blue',
            move: 2,
            phase: 3
        });
        const actionsStoreSpy = vi.spyOn(actionsStore, 'updateFromServer');
        const timelineStoreSpy = vi.spyOn(timelineStore, 'updateFromServer');

        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';
        controller.role = 'blue_facilitator';
        controller.isReadOnly = false;
        controller.actions = [{
            ...forwardedAction,
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Secure corridor access.',
                instruments: ['Economic', 'Diplomacy', 'Information', 'Military'],
                levers: ['Export Controls'],
                sectors: ['Biotechnology'],
                supplyChainFocusDecision: 'Yes',
                supplyChainActionAngles: ['Disrupt Red'],
                supplyChainAreas: ['Refinement'],
                implementation: 'Legislative',
                legislativeOptions: ['Existing legislation/policy'],
                enforcementTimeline: '6 months'
            })
        }];

        await controller.forwardActionToScribe('action-blue-draft-1');

        expect(updateDraftAction).toHaveBeenCalledWith('action-blue-draft-1', {
            ally_contingencies: expect.stringContaining('Scribe Handoff: Forwarded')
        });
        expect(updateDraftAction.mock.calls[0][1].ally_contingencies).toContain(
            'Instruments: ["Economic","Diplomacy","Information","Military"]'
        );
        expect(updateDraftAction.mock.calls[0][1].ally_contingencies).toContain(
            'Supply Chain Action Angles: ["Disrupt Red"]'
        );
        expect(updateDraftAction.mock.calls[0][1].ally_contingencies).toContain(
            'Supply Chain Areas: ["Refinement"]'
        );
        expect(submitActionRecord).not.toHaveBeenCalled();
        expect(createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'ACTION_FORWARDED_TO_SCRIBE',
            content: 'Action forwarded to Facilitator: Secure corridor access',
            metadata: expect.objectContaining({
                related_id: 'action-blue-draft-1',
                next_step: 'scribe_submit_to_white_cell',
                semantic_next_step: 'facilitator_submit_to_white_cell'
            })
        }));
        expect(actionsStoreSpy).toHaveBeenCalledWith('UPDATE', forwardedAction);
        expect(timelineStoreSpy).toHaveBeenCalledWith('INSERT', expect.objectContaining({
            id: 'timeline-blue-forward-1'
        }));
        expect(showToast).toHaveBeenCalledWith({ message: 'Action forwarded to Facilitator', type: 'success' });
    });

    it('collects legislative route selections when implementation is Legislative', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const controller = new FacilitatorController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';

        const wizardData = controller.getBlueActionWizardData({
            querySelector(selector) {
                return {
                    '#actionTitle': { value: 'Secure corridor access' },
                    '#actionInstrument': { value: 'Economic' },
                    '#actionInstrumentOther': { value: '' },
                    '#actionObjective': { value: 'Stabilize trade flows.' },
                    '#actionImplementation': { value: 'Legislative' },
                    '#actionExpectedOutcomes': { value: 'Reduce dependency on vulnerable routes.' },
                    '#actionBlueSectorOtherInput': { value: '' },
                    '#actionFocusCountryOtherInput': { value: '' },
                    '#actionImplementationOther': { value: '' },
                    '[name="actionHasSupplyChainFocus"]:checked': { value: 'No' },
                }[selector] || null;
            },
            querySelectorAll(selector) {
                if (selector === '[data-blue-action-checkbox="sector"]:checked') {
                    return [{ value: 'Biotechnology' }];
                }

                if (selector === '[data-blue-action-checkbox="supply-chain-focus"]:checked') {
                    return [{ value: 'Diversification' }, { value: 'Advanced Manufacturing' }];
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

    it('renders White Cell response categories as tabs for single-category scanning', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { communicationsStore } = await import('../stores/communications.js');
        const { requestsStore } = await import('../stores/requests.js');
        const {
            WHITE_CELL_UPDATE_KINDS,
            buildWhiteCellRecipientMetadata
        } = await import('../features/communications/targeting.js');

        const responsesList = createFakeElement('responsesList');
        const responsesBadge = createFakeElement('responsesBadge');

        global.document = {
            createElement(tagName) {
                return createFakeElement(null, tagName);
            },
            getElementById(id) {
                return {
                    responsesList,
                    responsesBadge
                }[id] || null;
            }
        };

        vi.spyOn(requestsStore, 'getByTeam').mockReturnValue([{
            id: 'rfi-answer-1',
            team: 'blue',
            status: 'answered',
            query: 'Can Blue inspect the port?',
            response: 'White Cell confirms port inspection is available.',
            responded_at: '2026-04-09T10:08:00.000Z'
        }]);
        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([
            {
                id: 'comm-direct-group-1',
                from_role: 'whitecell_support',
                to_role: 'blue_scribe',
                type: 'DIRECT',
                content: 'Prepare a short briefing note before adjudication.',
                created_at: '2026-04-09T10:10:00.000Z',
                metadata: buildWhiteCellRecipientMetadata('blue_scribe')
            },
            {
                id: 'comm-update-group-1',
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
                id: 'comm-forwarded-group-1',
                from_role: 'whitecell_lead',
                to_role: 'blue',
                type: 'PROPOSAL_FORWARDED',
                content: 'Forwarded Green Team proposal after White Cell review.',
                created_at: '2026-04-09T10:04:00.000Z',
                metadata: buildWhiteCellRecipientMetadata('blue', {
                    source_team: 'green',
                    outcome: 'SUCCESS',
                    proposal: {
                        title: 'Joint Port Proposal'
                    }
                })
            }
        ]);

        const controller = new FacilitatorController();
        controller.syncResponsesFromStores();

        expect(responsesList.innerHTML).toContain('class="tabbed-section response-tabs"');
        expect(responsesList.innerHTML).toContain('data-responses-tabs');
        expect(responsesList.innerHTML).toContain('role="tablist" aria-label="White Cell response categories"');
        expect(responsesList.innerHTML).toContain('data-responses-tab="communication"');
        expect(responsesList.innerHTML).toContain('data-responses-tab="rfi"');
        expect(responsesList.innerHTML).toContain('data-responses-tab="white-cell-update"');
        expect(responsesList.innerHTML).toContain('data-responses-tab="proposal"');
        expect(responsesList.innerHTML).toContain('Direct Communications<span class="tab-badge">1</span>');
        expect(responsesList.innerHTML).toContain('RFI Answers<span class="tab-badge">1</span>');
        expect(responsesList.innerHTML).toContain('White Cell Updates<span class="tab-badge">1</span>');
        expect(responsesList.innerHTML).toContain('Forwarded Proposals<span class="tab-badge">1</span>');
        expect(responsesList.innerHTML).toContain('data-responses-panel="communication"');
        expect(responsesList.innerHTML).toContain('data-responses-panel="rfi"');
        expect(responsesList.innerHTML).toContain('data-responses-panel="white-cell-update"');
        expect(responsesList.innerHTML).toContain('data-responses-panel="proposal"');
        expect(responsesList.innerHTML).toContain('data-responses-tab="communication"\n                    role="tab"\n                    aria-selected="true"');
        expect(responsesList.innerHTML).toContain('data-responses-panel="rfi"\n                    role="tabpanel"\n                    hidden');
        expect(responsesList.innerHTML).toContain('data-responses-panel="white-cell-update"\n                    role="tabpanel"\n                    hidden');
        expect(responsesList.innerHTML).toContain('data-responses-panel="proposal"\n                    role="tabpanel"\n                    hidden');
        expect(responsesList.innerHTML).toContain('aria-labelledby="responses-communication-heading"');
        expect(responsesList.innerHTML).toContain('Direct Communications');
        expect(responsesList.innerHTML).toContain('RFI Answers');
        expect(responsesList.innerHTML).toContain('White Cell Updates');
        expect(responsesList.innerHTML).toContain('Forwarded Proposals');
        expect(responsesList.innerHTML).toContain('role="list"');
        expect(responsesList.innerHTML).toContain('role="listitem"');
        expect(responsesList.innerHTML.indexOf('Direct Communications')).toBeLessThan(
            responsesList.innerHTML.indexOf('White Cell Communication')
        );
        expect(responsesList.innerHTML.indexOf('RFI Answers')).toBeLessThan(
            responsesList.innerHTML.indexOf('Can Blue inspect the port?')
        );
        expect(responsesList.innerHTML.indexOf('White Cell Updates')).toBeLessThan(
            responsesList.innerHTML.indexOf('White Cell Update: Tribe Street Journal')
        );
        expect(responsesList.innerHTML.indexOf('Forwarded Proposals')).toBeLessThan(
            responsesList.innerHTML.indexOf('Received Proposal: Joint Port Proposal')
        );
        expect(responsesBadge.textContent).toBe('4');
        expect(responsesBadge.hidden).toBe(false);
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
        expect(responsesList.innerHTML).toContain('White Cell communication to Blue Team Facilitator');
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

    it('announces each new Tribe Street Journal page update without announcing loaded history', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { communicationsStore } = await import('../stores/communications.js');
        const {
            WHITE_CELL_UPDATE_KINDS,
            buildWhiteCellRecipientMetadata
        } = await import('../features/communications/targeting.js');

        const responsesList = createFakeElement('responsesList');
        const responsesBadge = createFakeElement('responsesBadge');
        const getAll = vi.spyOn(communicationsStore, 'getAll');

        global.document = {
            createElement(tagName) {
                return createFakeElement(null, tagName);
            },
            getElementById(id) {
                return {
                    responsesList,
                    responsesBadge
                }[id] || null;
            }
        };

        getAll.mockReturnValue([]);
        const controller = new FacilitatorController();
        controller.syncResponsesFromStores();
        controller.flushWhiteCellArrivalAnnouncement();

        expect(showToast).not.toHaveBeenCalled();

        getAll.mockReturnValue([{
            id: 'comm-journal-page-update-1',
            from_role: 'whitecell_lead',
            to_role: 'blue',
            type: 'GUIDANCE',
            content: 'The port disruption headline has been updated.',
            created_at: '2026-07-15T12:00:00.000Z',
            metadata: buildWhiteCellRecipientMetadata('blue', {
                content_kind: WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL
            })
        }]);

        controller.syncResponsesFromStores({ announce: true });
        controller.flushWhiteCellArrivalAnnouncement();

        expect(showToast).toHaveBeenCalledTimes(1);
        expect(showToast).toHaveBeenCalledWith({
            message: 'Tribe Street Journal updated. Open Tribe Street Journal to view the latest page update.',
            type: 'info',
            duration: 10000
        });
    });

    it('notifies the proposing facilitator when a recipient requests negotiation', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { communicationsStore } = await import('../stores/communications.js');
        global.document = createFakeDocument();

        const proposal = {
            id: 'proposal-green-notification-1',
            team: 'green',
            status: 'adjudicated',
            goal: 'Joint Port Proposal',
            mechanism: 'Proposal',
            expected_outcomes: 'Reduce room for arbitrage.',
            move: 2,
            phase: 1
        };
        const forwardedProposal = {
            id: 'comm-forwarded-notification-1',
            type: 'PROPOSAL_FORWARDED',
            created_at: '2026-04-09T10:06:00.000Z',
            metadata: {
                source_proposal_id: proposal.id,
                source_team: 'green',
                recipient_team: 'blue',
                proposal: {
                    title: proposal.goal
                },
                proposal_recipient_state: {
                    status: 'unread'
                }
            }
        };
        const getAll = vi.spyOn(communicationsStore, 'getAll');
        getAll.mockReturnValue([forwardedProposal]);

        const controller = new FacilitatorController();
        controller.teamId = 'green';
        controller.teamLabel = 'Green Team';
        controller.actions = [proposal];
        controller.captureAuthoredProposalResponseArrivals();

        getAll.mockReturnValue([{
            ...forwardedProposal,
            metadata: {
                ...forwardedProposal.metadata,
                proposal_recipient_state: {
                    status: 'responded',
                    facilitator_decision: 'negotiate',
                    response_content: 'Add a six-month review clause.',
                    response_from_team: 'blue',
                    response_sent_at: '2026-04-09T10:20:00.000Z'
                }
            }
        }]);

        controller.captureAuthoredProposalResponseArrivals({ announce: true });
        controller.flushProposalResponseArrivalAnnouncement();

        expect(showToast).toHaveBeenCalledWith({
            message: 'Blue Team requested negotiation on "Joint Port Proposal". Open Proposals to review the terms.',
            type: 'info',
            duration: 10000
        });
        expect(controller.renderActionCard(proposal)).toContain('NEW RESPONSE');

        controller.captureAuthoredProposalResponseArrivals({ announce: true });
        controller.flushProposalResponseArrivalAnnouncement();
        expect(showToast).toHaveBeenCalledTimes(1);

        const renderActionsList = vi.spyOn(controller, 'renderActionsList').mockImplementation(() => {});
        controller.clearNewProposalResponseArrivals();
        expect(controller.newProposalResponseActionIds.size).toBe(0);
        expect(renderActionsList).toHaveBeenCalled();
        expect(controller.renderActionCard(proposal)).not.toContain('NEW RESPONSE');
    });

    it('does not replay proposal-response notifications from loaded history', async () => {
        const { FacilitatorController } = await loadFacilitatorModule();
        const { communicationsStore } = await import('../stores/communications.js');
        global.document = createFakeDocument();

        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([{
            id: 'comm-forwarded-history-response-1',
            type: 'PROPOSAL_FORWARDED',
            metadata: {
                source_proposal_id: 'proposal-green-history-1',
                source_team: 'green',
                recipient_team: 'blue',
                proposal_recipient_state: {
                    status: 'responded',
                    facilitator_decision: 'accept',
                    response_from_team: 'blue'
                }
            }
        }]);

        const controller = new FacilitatorController();
        controller.teamId = 'green';
        controller.captureAuthoredProposalResponseArrivals({ announce: true });
        controller.flushProposalResponseArrivalAnnouncement();

        expect(showToast).not.toHaveBeenCalled();
        expect(controller.newProposalResponseActionIds.size).toBe(0);
    });

    it('labels a locked negotiation response as a negotiation request', async () => {
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
                    facilitator_decision: 'negotiate',
                    response_content: 'Blue Team can support this with customs coordination.',
                    response_from_team: 'blue',
                    response_sent_at: '2026-04-09T10:20:00.000Z'
                }
            })
        }]);

        const controller = new FacilitatorController();
        controller.syncReceivedProposalsFromStore();

        expect(proposalsList.innerHTML).toContain('Negotiation requested');
        expect(proposalsList.innerHTML).toContain('Negotiation terms');
        expect(proposalsList.innerHTML).toContain('Blue Team can support this with customs coordination.');
        expect(proposalsList.innerHTML).toContain('This negotiation request is locked');
        expect(proposalsList.innerHTML).not.toContain('Response sent to White Cell');
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

    it('renders a Green proposal negotiation request with directly categorised copy', async () => {
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
                    facilitator_decision: 'negotiate',
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

        expect(markup).toContain('Blue Team requested negotiation.');
        expect(markup).toContain('Recipient Status:</strong> Negotiation requested');
        expect(markup).toContain('Negotiation terms');
        expect(markup).toContain('Blue Team can support this with customs coordination.');
        expect(markup).not.toContain('Response received from Blue Team');
        expect(markup).not.toContain('Blue Team Response');
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
        const captureProposalResponseArrivals = vi.spyOn(controller, 'captureAuthoredProposalResponseArrivals')
            .mockImplementation(() => {});
        const flushProposalResponseArrivalAnnouncement = vi.spyOn(controller, 'flushProposalResponseArrivalAnnouncement')
            .mockImplementation(() => {});
        vi.spyOn(controller, 'syncResponsesFromStores').mockImplementation(() => {});
        vi.spyOn(controller, 'syncReceivedProposalsFromStore').mockImplementation(() => {});
        vi.spyOn(controller, 'syncWhiteCellUpdateSectionsFromStore').mockImplementation(() => {});

        controller.subscribeToLiveData();
        communicationsStore.notify('updated', {
            id: 'comm-forwarded-declined-2',
            type: 'PROPOSAL_FORWARDED'
        });

        expect(renderActionsList).toHaveBeenCalled();
        expect(captureProposalResponseArrivals).toHaveBeenCalledWith({ announce: true });
        expect(flushProposalResponseArrivalAnnouncement).toHaveBeenCalled();

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

    it('bounds facilitator timeline rendering for large exercise datasets', async () => {
        const { FACILITATOR_TIMELINE_RENDER_LIMIT, FacilitatorController } = await loadFacilitatorModule();
        const timelineList = createFakeElement('timelineList');

        global.document = {
            createElement(tagName) {
                return createFakeElement(null, tagName);
            },
            getElementById(id) {
                return {
                    timelineList
                }[id] || null;
            }
        };

        const controller = new FacilitatorController();
        controller.timelineEvents = Array.from({ length: FACILITATOR_TIMELINE_RENDER_LIMIT + 2 }, (_, index) => ({
            id: `timeline-${index + 1}`,
            team: 'blue',
            type: 'NOTE',
            content: `Facilitator timeline event ${index + 1}`,
            move: 2,
            phase: 1,
            created_at: '2026-04-10T10:00:00.000Z'
        }));

        controller.renderTimeline();

        expect(timelineList.innerHTML).toContain(
            `Showing the first ${FACILITATOR_TIMELINE_RENDER_LIMIT} of ${FACILITATOR_TIMELINE_RENDER_LIMIT + 2} timeline events.`
        );
        expect(timelineList.innerHTML).toContain(`Facilitator timeline event ${FACILITATOR_TIMELINE_RENDER_LIMIT}`);
        expect(timelineList.innerHTML).not.toContain(`Facilitator timeline event ${FACILITATOR_TIMELINE_RENDER_LIMIT + 1}`);
    });
});
