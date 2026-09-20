import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
    buildDefaultScribeDeckPath,
    SCRIBE_DECK_SECTIONS,
    expandScribeDeckSections,
    flattenScribeDeckSlides,
    getScribeDeckAssignmentDetails,
    normalizeScribeDeckPath
} from '../features/scribe/deckConfig.js';
import { buildAppPath } from '../core/navigation.js';
import { serializeProposalDetails } from '../features/actions/proposalDetails.js';
import { serializeBlueActionDetails } from '../features/actions/blueActionDetails.js';
import { serializeStrategicOrientationDetails } from '../features/actions/strategicOrientationDetails.js';

const BLUE_SCRIBE_HTML_PATH = new URL('../../teams/blue/scribe.html', import.meta.url);
const GREEN_SCRIBE_HTML_PATH = new URL('../../teams/green/scribe.html', import.meta.url);
const INDUSTRY_SCRIBE_HTML_PATH = new URL('../../teams/industry/scribe.html', import.meta.url);
const RED_SCRIBE_HTML_PATH = new URL('../../teams/red/scribe.html', import.meta.url);
const SCRIBE_CSS_PATH = new URL('../../styles/pages/scribe.css', import.meta.url);
const VITE_CONFIG_PATH = new URL('../../vite.config.js', import.meta.url);
const MODULE_LOAD_TEST_TIMEOUT_MS = 15000;

const {
    mockConfirmModal,
    mockAppendProposalThreadMessage,
    mockCreateCommunication,
    mockCreateTimelineEvent,
    mockFetchArtifactWorkflowReviews,
    mockHideLoader,
    mockMountFollowAlong,
    mockShowModal,
    mockShowLoader,
    mockSubmitAction,
    mockSubmitRegionalOrientation,
    mockWriteRegionalProposal,
    mockUpdateDraftAction,
    mockUpdateProposalRecipientStatus
} = vi.hoisted(() => ({
    mockConfirmModal: vi.fn(),
    mockAppendProposalThreadMessage: vi.fn(),
    mockCreateCommunication: vi.fn(),
    mockCreateTimelineEvent: vi.fn(),
    mockFetchArtifactWorkflowReviews: vi.fn().mockResolvedValue([]),
    mockHideLoader: vi.fn(),
    mockMountFollowAlong: vi.fn(() => ({ destroy: vi.fn() })),
    mockShowModal: vi.fn(),
    mockShowLoader: vi.fn(() => ({})),
    mockSubmitAction: vi.fn(),
    mockSubmitRegionalOrientation: vi.fn(),
    mockWriteRegionalProposal: vi.fn(),
    mockUpdateDraftAction: vi.fn(),
    mockUpdateProposalRecipientStatus: vi.fn()
}));

function normalizeLineEndings(value) {
    return value.replace(/\r\n/g, '\n');
}

function sectionButtonMarkup(html = '', label = '') {
    const start = html.indexOf(`data-section-label="${label}"`);
    if (start === -1) {
        return '';
    }

    const end = html.indexOf('</button>', start);
    return html.slice(start, end === -1 ? undefined : end);
}

function flattenHighlights(steps) {
    return steps.flatMap((step) => (
        Array.isArray(step.highlight)
            ? step.highlight
            : (step.highlight ? [step.highlight] : [])
    ));
}

vi.mock('../components/ui/Toast.js', () => ({
    showToast: vi.fn(),
    showDurableNotification: vi.fn()
}));

vi.mock('../components/ui/Loader.js', () => ({
    showLoader: mockShowLoader,
    hideLoader: mockHideLoader
}));

vi.mock('../components/ui/Modal.js', () => ({
    confirmModal: mockConfirmModal,
    showModal: mockShowModal
}));

vi.mock('../services/database.js', () => ({
    database: {
        createCommunication: mockCreateCommunication,
        appendProposalThreadMessage: mockAppendProposalThreadMessage,
        updateDraftAction: mockUpdateDraftAction,
        updateProposalRecipientStatus: mockUpdateProposalRecipientStatus,
        submitAction: mockSubmitAction,
        submitRegionalOrientation: mockSubmitRegionalOrientation,
        writeRegionalProposal: mockWriteRegionalProposal,
        createTimelineEvent: mockCreateTimelineEvent,
        fetchArtifactWorkflowReviews: mockFetchArtifactWorkflowReviews
    }
}));

vi.mock('../features/onboarding/followAlong.js', () => ({
    mountFollowAlong: mockMountFollowAlong
}));

function toDatasetKey(attributeName = '') {
    return attributeName
        .replace(/^data-/, '')
        .replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function createFakeElement(id = null, className = '', tagName = 'div') {
    const attributes = new Map();
    const children = [];
    const classes = new Set(
        String(className)
            .split(/\s+/)
            .filter(Boolean)
    );
    let textContent = '';
    let innerHTML = '';

    const element = {
        id,
        tagName: String(tagName || 'div').toUpperCase(),
        hidden: false,
        dataset: {},
        get textContent() {
            return textContent;
        },
        set textContent(value) {
            textContent = value == null ? '' : String(value);
            innerHTML = textContent;
        },
        get innerHTML() {
            return innerHTML;
        },
        set innerHTML(value) {
            innerHTML = value == null ? '' : String(value);
        },
        get outerHTML() {
            const classAttribute = element.className ? ` class="${element.className}"` : '';
            const idAttribute = element.id ? ` id="${element.id}"` : '';
            return `<${element.tagName.toLowerCase()}${idAttribute}${classAttribute}>${innerHTML}</${element.tagName.toLowerCase()}>`;
        },
        get className() {
            return [...classes].join(' ');
        },
        set className(value) {
            classes.clear();
            String(value)
                .split(/\s+/)
                .filter(Boolean)
                .forEach((classToken) => classes.add(classToken));
        },
        setAttribute(name, value) {
            const normalizedValue = value == null ? '' : String(value);
            attributes.set(name, normalizedValue);

            if (name === 'class') {
                element.className = normalizedValue;
            }

            if (name.startsWith('data-')) {
                element.dataset[toDatasetKey(name)] = normalizedValue;
            }
        },
        getAttribute(name) {
            if (name === 'class') {
                return element.className;
            }

            return attributes.get(name) ?? null;
        },
        removeAttribute(name) {
            attributes.delete(name);

            if (name.startsWith('data-')) {
                delete element.dataset[toDatasetKey(name)];
            }
        },
        classList: {
            add: (...tokens) => {
                tokens.filter(Boolean).forEach((token) => classes.add(token));
            },
            remove: (...tokens) => {
                tokens.filter(Boolean).forEach((token) => classes.delete(token));
            },
            contains: (token) => classes.has(token),
            toggle: (token, force) => {
                if (!token) {
                    return false;
                }

                if (typeof force === 'boolean') {
                    if (force) {
                        classes.add(token);
                    } else {
                        classes.delete(token);
                    }
                    return force;
                }

                if (classes.has(token)) {
                    classes.delete(token);
                    return false;
                }

                classes.add(token);
                return true;
            }
        },
        focus: vi.fn(() => {
            if (global.document) {
                global.document.activeElement = element;
            }
        }),
        contains(candidate) {
            if (candidate === element) {
                return true;
            }

            return children.some((child) => child?.contains?.(candidate) || child === candidate);
        },
        querySelectorAll() {
            return [...children];
        },
        appendChild(child) {
            children.push(child);
            if (child?.id && global.document?.register) {
                global.document.register(child);
            }
            innerHTML += child?.outerHTML || '';
            return child;
        },
        querySelector(selector = '') {
            const normalized = String(selector || '');
            if (normalized.startsWith('.')) {
                const className = normalized.slice(1);
                return children.find((child) => child?.classList?.contains?.(className)) || null;
            }
            if (normalized.startsWith('#')) {
                return global.document?.getElementById?.(normalized.slice(1)) || null;
            }
            return children.find((child) => child?.tagName === normalized.toUpperCase()) || null;
        }
    };

    if (className) {
        attributes.set('class', element.className);
    }

    return element;
}

function createFakeDocument() {
    const elements = new Map();
    const body = createFakeElement('body');

    const documentRef = {
        activeElement: body,
        body,
        createElement(tagName) {
            return createFakeElement(null, '', tagName);
        },
        register(element) {
            if (element?.id) {
                elements.set(element.id, element);
            }

            return element;
        },
        getElementById(id) {
            return elements.get(id) || null;
        },
        querySelector(selector = '') {
            const normalized = String(selector || '');
            if (normalized.startsWith('#')) {
                return elements.get(normalized.slice(1)) || null;
            }
            if (normalized.startsWith('.')) {
                const className = normalized.slice(1);
                if (body.classList?.contains?.(className)) {
                    return body;
                }
                return body.querySelector?.(normalized) || null;
            }
            return null;
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    };

    return documentRef;
}

async function loadScribeModule() {
    globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
    vi.resetModules();
    return import('./scribe.js');
}

describe('legacy scribe route and corrected Facilitator support surface', () => {
    it('GC06 renders owned proposal details, revision and controls and submits the captured row version', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        const controller = new ScribeController();
        controller.teamContext = { ...controller.teamContext, sharedFacilitator: true };
        const action = { id:'gc06',session_id:'shared',team:'green',delegation_id:'europe',status:'draft',
            artifact_type:'proposal',workflow_state:'forwarded_to_facilitator',revision_number:2,row_version:4,proposal_handoff_revision:2,
            ally_contingencies:serializeProposalDetails({ originators:['UK'],objective:'Synthetic objective',recipientTeams:['blue','red'],scribeHandoff:'Forwarded' }) };
        const html = controller.renderActionSlide({ action,slideType:'own-proposal' });
        expect(html).toContain('Green - Europe'); expect(html).toContain('Revision 2');
        expect(html).toContain('Synthetic objective'); expect(html).toContain('data-scribe-action-edit'); expect(html).toContain('data-scribe-action-submit');
        const returned = { ...action,workflow_state:'returned_to_team',proposal_handoff_revision:null };
        expect(controller.renderPresentationToolbar(returned)).toContain('corrected proposal handoff');
        expect(controller.renderPresentationToolbar(returned)).not.toContain('data-scribe-action-submit');
        mockWriteRegionalProposal.mockResolvedValue({ ...action,status:'submitted' });
        await controller.submitScribeProposal(action);
        expect(mockWriteRegionalProposal).toHaveBeenCalledWith({ sessionId:'shared',delegationId:'europe',action,operation:'submit' });
        expect(mockSubmitAction).not.toHaveBeenCalled(); expect(mockCreateTimelineEvent).not.toHaveBeenCalled();
    });

    it('GC05 exposes region-specific orientation controls and submits only the captured revision', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        const controller = new ScribeController();
        controller.teamContext = { ...controller.teamContext, sharedFacilitator: true };
        const action = { id: 'gc05-orientation', session_id: 'gc05', team: 'green', delegation_id: 'europe',
            status: 'draft', workflow_state: 'forwarded_to_facilitator', revision_number: 2, row_version: 4, orientation_handoff_revision: 2,
            mechanism: 'Strategic Orientation', ally_contingencies: serializeStrategicOrientationDetails({ team: 'green', ownOrientation: 'pressure',
                forecastTargets: [{ key: 'blue', orientation: 'reframe' }], strategyDescription: 'Synthetic strategy', scribeHandoff: 'Forwarded' }) };
        const html = controller.renderActionSlide({ action, slideType: 'strategic-orientation' });
        expect(html).toContain('Green - Europe');
        expect(html).toContain('data-scribe-action-submit');
        expect(html).toContain('Synthetic strategy');
        expect(controller.renderPresentationToolbar(action)).not.toContain('>Edit</button>');
        const returned = { ...action, workflow_state: 'returned_to_team', orientation_handoff_revision: null, review_notes: 'Correct this region' };
        expect(controller.renderScribeStrategicOrientationSubmissionControls(returned)).toContain('originating regional Scribe');
        expect(controller.renderPresentationToolbar(returned)).not.toContain('data-scribe-action-submit');
        mockSubmitRegionalOrientation.mockResolvedValue({ ...action, status: 'submitted', workflow_state: 'resubmitted' });
        await controller.submitScribeAction(action);
        expect(mockSubmitRegionalOrientation).toHaveBeenCalledWith(action);
        expect(mockSubmitAction).not.toHaveBeenCalled();
        expect(mockCreateTimelineEvent).not.toHaveBeenCalled();
        const deferred = controller.renderSharedRegionalRecord({ ...action, goal: 'Synthetic proposal' });
        expect(deferred).toContain('RFI creation and direct messages are not yet enabled');
        expect(deferred).not.toContain('<button');
    });
    it('GC04A shared foundation renders an owned read-only summary and cannot invoke workflow writes', async () => {
        const { ScribeController } = await loadScribeModule();
        const controller = new ScribeController();
        controller.teamContext = { ...controller.teamContext, sharedFacilitator: true };
        const action = { id: 'regional-fixture', delegation_id: 'europe', goal: '<Synthetic proposal>', status: 'draft',
            workflow_state: 'forwarded_to_facilitator' };
        const html = controller.renderSharedRegionalRecord(action);
        expect(html).toContain('Green - Europe');
        expect(html).toContain('&lt;Synthetic proposal&gt;');
        expect(html).toContain('not yet enabled');
        expect(html).not.toContain('<button');
        mockSubmitAction.mockClear(); mockUpdateDraftAction.mockClear(); mockAppendProposalThreadMessage.mockClear();
        await controller.submitScribeAction(action);
        await controller.submitScribeProposal(action);
        await controller.submitFacilitatorProposalDecision({ id: 'thread' }, 'accept');
        expect(mockSubmitAction).not.toHaveBeenCalled();
        expect(mockUpdateDraftAction).not.toHaveBeenCalled();
        expect(mockAppendProposalThreadMessage).not.toHaveBeenCalled();
    });
    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        delete globalThis.__ESG_DISABLE_AUTO_INIT__;
        delete global.requestAnimationFrame;
        global.document?.body?.removeAttribute?.('data-scribe-presentation');
        global.document?.body?.removeAttribute?.('data-role-surface');
        global.document?.body?.removeAttribute?.('data-scribe-deck-state');
        delete global.document;
    });

    it('extracts facilitator deck slide data from the standalone deck html payload', async () => {
        const { parseFacilitatorDeckHtml } = await loadScribeModule();
        const slides = parseFacilitatorDeckHtml(`
            <script>
                const SLIDES = [{"n":1,"title":"Intro","src":"data:image/png;base64,AAA="}];
                const SECTIONS = [];
            </script>
        `);

        expect(slides).toEqual([{
            n: 1,
            title: 'Intro',
            src: 'data:image/png;base64,AAA='
        }]);
    }, MODULE_LOAD_TEST_TIMEOUT_MS);

    it('routes only the legacy scribe seat onto the Facilitator support surface', async () => {
        const { getScribeAccessState } = await loadScribeModule();
        const teamContext = {
            teamId: 'blue',
            scribeRole: 'blue_scribe',
            facilitatorRole: 'blue_facilitator',
            facilitatorRoute: '/teams/blue/facilitator.html',
            observerRoute: '/teams/blue/facilitator.html?mode=observer'
        };

        expect(getScribeAccessState({
            role: 'blue_scribe',
            teamContext
        })).toMatchObject({
            allowed: true,
            reason: null,
            redirectRoute: null
        });

        expect(getScribeAccessState({
            role: 'blue_facilitator',
            teamContext
        })).toMatchObject({
            allowed: false,
            reason: 'facilitator-route',
            redirectRoute: '/teams/blue/facilitator.html'
        });
    });

    it('mounts a persistent role guide for the active Facilitator team', async () => {
        const { ScribeController } = await loadScribeModule();
        const controller = new ScribeController();

        mockMountFollowAlong.mockClear();
        controller.mountFollowAlongOnboarding();

        expect(mockMountFollowAlong).toHaveBeenCalledTimes(1);
        expect(mockMountFollowAlong).toHaveBeenCalledWith(expect.objectContaining({
            storageKey: 'followalong:scribe:blue',
            title: 'Blue Team Facilitator guide'
        }));

        const guide = mockMountFollowAlong.mock.calls[0][0];
        expect(guide.steps.map((step) => step.title)).toEqual([
            'Your role in the exercise',
            'Follow move, phase, and timer',
            'Team Action Review',
            'Deck',
            'Proposals',
            'RFIs',
            'Communications',
            'Activity',
            'Present to the room',
            'Complete the handoff'
        ]);
        expect(flattenHighlights(guide.steps)).toEqual([
            '#header-game-state',
            '#header-timer',
            '#teamActionReviewViewBtn',
            '#deckViewBtn',
            '.scribe-section-region--proposals',
            '#rfiViewBtn',
            '#communicationsViewBtn',
            '#scribeAlertsBtn',
            '#presentBtn',
            '.sidebar-session'
        ]);
        expect(guide.steps[1].body).toContain('Strategic Orientation before Move 1');
        expect(guide.steps[2].body).toContain('Scribe-forwarded');
        expect(guide.steps[3].body).toContain('assigned support deck');
        expect(guide.steps[4].narrative).toContain('Accept, Not Interested, or Negotiate');
        expect(guide.steps[5].body).toContain('same RFI');
        expect(guide.steps[6].body).toContain('inbound and outbound history');
        expect(guide.steps[8].body).toContain('facilitator toolbar');
        expect(guide.steps[8].details).toContain('Projection does not equal submission.');
    });

    it('builds team-scoped Facilitator RFI slides with returned and answered workflow state', async () => {
        const { buildFacilitatorRfiSlides } = await loadScribeModule();
        const result = buildFacilitatorRfiSlides([
            {
                id: 'industry-returned',
                team: 'industry',
                query: 'Which reporting period applies?',
                status: 'pending',
                workflow_state: 'returned_to_team',
                revision_number: 2,
                updated_at: '2026-08-06T12:00:00.000Z'
            },
            {
                id: 'industry-answered',
                team: 'industry',
                query: 'May the team use the published baseline?',
                status: 'answered',
                workflow_state: 'completed',
                updated_at: '2026-08-06T11:00:00.000Z'
            },
            {
                id: 'blue-hidden',
                team: 'blue',
                query: 'This must not cross teams.',
                status: 'pending'
            }
        ], { teamId: 'industry' });

        expect(result.slideCount).toBe(2);
        expect(result.slides.map((slide) => slide.slideKey)).toEqual([
            'rfi-industry-returned',
            'rfi-industry-answered'
        ]);
        expect(result.slides.map((slide) => slide.sidebarKicker)).toEqual([
            'Returned for clarification',
            'Answered'
        ]);
        expect(JSON.stringify(result)).not.toContain('priority');
        expect(JSON.stringify(result)).not.toContain('blue-hidden');
    });

    it('attaches immutable returned revisions to the same Facilitator RFI slide', async () => {
        const { buildFacilitatorRfiSlides } = await loadScribeModule();
        const result = buildFacilitatorRfiSlides([{
            id: 'blue-rfi-loop',
            team: 'blue',
            query: 'Revised question',
            status: 'pending',
            workflow_state: 'resubmitted',
            revision_number: 2
        }], {
            teamId: 'blue',
            revisionHistory: [{
                id: 'blue-rfi-return-review',
                artifact_kind: 'rfi',
                artifact_id: 'blue-rfi-loop',
                decision: 'return_for_clarification',
                revision_number: 1,
                reviewer_notes: 'Name the decision window.',
                prior_state: { query: 'Original question' }
            }, {
                id: 'other-rfi-return-review',
                artifact_kind: 'rfi',
                artifact_id: 'other-rfi',
                prior_state: { query: 'Must stay isolated' }
            }]
        });

        expect(result.slides[0].revisionHistory).toHaveLength(1);
        expect(result.slides[0].revisionHistory[0].prior_state.query).toBe('Original question');
        expect(JSON.stringify(result)).not.toContain('Must stay isolated');
    });

    it('loads immutable RFI history with an explicit Facilitator team scope', async () => {
        const { ScribeController } = await loadScribeModule();
        const { sessionStore } = await import('../stores/session.js');
        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-rfi-history');
        mockFetchArtifactWorkflowReviews.mockResolvedValueOnce([]);
        const controller = new ScribeController();
        controller.teamId = 'blue';

        await controller.loadRfiRevisionHistory();

        expect(mockFetchArtifactWorkflowReviews).toHaveBeenCalledWith('session-rfi-history', {
            artifactKinds: ['rfi'],
            decisions: ['return_for_clarification'],
            team: 'blue'
        });
    });

    it('keeps Facilitator direct communications scoped to its exact role and White Cell recipients', async () => {
        const { buildFacilitatorCommunicationSlides } = await loadScribeModule();
        const teamContext = {
            teamId: 'industry',
            scribeRole: 'industry_scribe'
        };
        const result = buildFacilitatorCommunicationSlides([
            {
                id: 'outbound-industry',
                type: 'direct',
                from_role: 'industry_scribe',
                to_role: 'white_cell',
                content: 'Industry Facilitator message'
            },
            {
                id: 'inbound-industry',
                type: 'DIRECT',
                from_role: 'white_cell',
                to_role: 'industry_scribe',
                content: 'White Cell reply'
            },
            {
                id: 'blue-hidden',
                type: 'direct',
                from_role: 'blue_scribe',
                to_role: 'white_cell',
                content: 'Blue Facilitator message'
            }
        ], { teamContext });

        expect(result.slideCount).toBe(2);
        expect(result.slides.map((slide) => slide.slideKey).sort()).toEqual([
            'communication-inbound-industry',
            'communication-outbound-industry'
        ]);
        expect(JSON.stringify(result)).not.toContain('Blue Facilitator message');
    });

    it('renders an RFI as a compact workspace with stable actions and revision context', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        const controller = new ScribeController();
        controller.teamLabel = 'Industry Team';

        const html = controller.renderRfiSlide({
            slideType: 'rfi',
            request: {
                id: 'industry-rfi-1',
                team: 'industry',
                query: 'Which reporting period applies?',
                categories: ['Reporting', 'Compliance'],
                workflow_state: 'returned_to_team',
                revision_number: 2,
                review_notes: 'Specify whether this concerns the current or next move.',
                created_at: '2026-08-06T10:00:00.000Z'
            },
            revisionHistory: [{
                artifact_kind: 'rfi',
                artifact_id: 'industry-rfi-1',
                revision_number: 1,
                reviewer_notes: 'Name the original reporting window.',
                reviewed_at: '2026-08-06T11:00:00.000Z',
                prior_state: {
                    query: 'What is the reporting window?'
                }
            }],
            revisionHistoryError: new Error('history unavailable')
        });

        expect(html).toContain('class="facilitator-workspace facilitator-rfi-workspace"');
        expect(html).toContain('Which reporting period applies?');
        expect(html).toContain('Reporting | Compliance');
        expect(html).toContain('Returned for clarification');
        expect(html).toContain('REV 2');
        expect(html).toContain('data-facilitator-new-rfi');
        expect(html).toContain('data-facilitator-edit-rfi');
        expect(html).toContain('Revision history');
        expect(html).toContain('What is the reporting window?');
        expect(html).toContain('Name the original reporting window.');
        expect(html).toContain('Revision history unavailable');
        expect(html).toContain('data-facilitator-rfi-history-retry');
        expect(html).not.toContain('class="scribe-action-slide facilitator-rfi-slide"');
    });

    it('renders direct communications as one chronological inbound and outbound thread', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        const controller = new ScribeController();
        controller.teamLabel = 'Industry Team';
        controller.teamContext = { teamId: 'industry', scribeRole: 'industry_scribe' };
        controller.directCommunications = [{
            id: 'outbound-later',
            from_role: 'industry_scribe',
            to_role: 'white_cell',
            content: 'Facilitator follow-up',
            created_at: '2026-08-06T11:00:00.000Z'
        }, {
            id: 'inbound-earlier',
            from_role: 'white_cell',
            to_role: 'industry_scribe',
            content: 'White Cell guidance',
            created_at: '2026-08-06T10:00:00.000Z'
        }];

        const html = controller.renderCommunicationSlide({
            slideType: 'communication',
            communication: controller.directCommunications[0]
        });

        expect(html).toContain('class="facilitator-workspace facilitator-communications-workspace"');
        expect(html).toContain('role="log"');
        expect(html.indexOf('White Cell guidance')).toBeLessThan(html.indexOf('Facilitator follow-up'));
        expect(html).toContain('facilitator-thread-message is-inbound');
        expect(html).toContain('facilitator-thread-message is-outbound is-selected');
        expect(html.match(/data-facilitator-new-communication/g)).toHaveLength(1);
        expect(html).not.toContain('Direct Communication</h2>');
    });

    it('renders an action notification slide with the source team and an explicit no-response-needed statement', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        const controller = new ScribeController();
        controller.teamId = 'industry';
        controller.teamLabel = 'Industry Team';

        const html = controller.renderActionNotificationSlide({
            slideType: 'action-notification',
            title: 'Rare-earth export controls',
            communication: {
                id: 'notif-1',
                content: 'Heads up before your next move.',
                created_at: '2026-08-14T09:00:00.000Z',
                metadata: {
                    source_team: 'blue',
                    action_snapshot: {
                        title: 'Rare-earth export controls',
                        objective: 'Limit outbound rare-earth shipments.',
                        instruments: ['Economic']
                    }
                }
            }
        });

        expect(html).toContain('Blue Team');
        expect(html).toContain('Rare-earth export controls');
        expect(html).toContain('No response needed');
        expect(html).toContain('Limit outbound rare-earth shipments.');
        expect(html).toContain('Heads up before your next move.');
        expect(html).not.toContain('<button');
    });

    it('renders an action notification placeholder when there is nothing to show', async () => {
        const { ScribeController } = await loadScribeModule();
        const controller = new ScribeController();

        const html = controller.renderActionNotificationSlide({
            slideType: 'action-notification-placeholder',
            title: 'No action notifications yet',
            summary: 'Informational updates about another team\'s action, shared for awareness, will appear here.'
        });

        expect(html).toContain('No action notifications yet');
        expect(html).toContain('shared for awareness');
    });

    it('resolves the latest visible White Cell deck assignment for the active scribe team', async () => {
        const { resolveAssignedScribeDeck } = await loadScribeModule();

        const teamContext = {
            teamId: 'blue',
            scribeRole: 'blue_scribe'
        };
        const assignment = resolveAssignedScribeDeck([
            {
                id: 'comm-scribe-new',
                from_role: 'white_cell',
                to_role: 'blue_scribe',
                created_at: '2026-06-15T11:05:00.000Z',
                metadata: {
                    content_kind: 'SCRIBE_DECK_ASSIGNMENT',
                    recipient: 'blue_scribe',
                    recipient_scope: 'role',
                    recipient_team: 'blue',
                    recipient_role: 'blue_scribe',
                    deck_path: 'custom-scribe-deck.html',
                    deck_label: 'Blue Crisis Deck'
                }
            },
            {
                id: 'comm-facilitator',
                from_role: 'white_cell',
                to_role: 'blue_facilitator',
                created_at: '2026-06-15T11:00:00.000Z',
                metadata: {
                    content_kind: 'SCRIBE_DECK_ASSIGNMENT',
                    recipient: 'blue_facilitator',
                    recipient_scope: 'role',
                    recipient_team: 'blue',
                    recipient_role: 'blue_facilitator',
                    deck_path: 'ignored-facilitator-deck.html',
                    deck_label: 'Ignore Me'
                }
            }
        ], teamContext);

        expect(assignment).toMatchObject({
            communicationId: 'comm-scribe-new',
            deckSource: 'repo_path',
            deckPath: 'decks/blue/custom-scribe-deck.html',
            deckLabel: 'Blue Crisis Deck'
        });
    });

    it('normalizes bare deck filenames into the recipient team deck folder', () => {
        expect(normalizeScribeDeckPath('custom-scribe-deck.html', {
            teamId: 'red'
        })).toBe('decks/red/custom-scribe-deck.html');
        expect(normalizeScribeDeckPath('industry-brief.html', {
            teamId: 'industry'
        })).toBe('decks/industry/industry-brief.html');

        expect(getScribeDeckAssignmentDetails({
            id: 'comm-red-scribe',
            created_at: '2026-06-15T12:00:00.000Z',
            metadata: {
                content_kind: 'SCRIBE_DECK_ASSIGNMENT',
                recipient_team: 'red',
                deck_path: 'support-brief.html',
                deck_label: ''
            }
        })).toMatchObject({
            communicationId: 'comm-red-scribe',
            recipientTeam: 'red',
            deckPath: 'decks/red/support-brief.html',
            deckLabel: 'support brief'
        });
    });

    it('reads uploaded deck assignments from White Cell metadata without requiring a repo path', () => {
        expect(getScribeDeckAssignmentDetails({
            id: 'comm-green-upload',
            created_at: '2026-06-15T12:15:00.000Z',
            metadata: {
                content_kind: 'SCRIBE_DECK_ASSIGNMENT',
                recipient_team: 'green',
                deck_source: 'browser_upload',
                deck_storage_key: 'scribe-deck:session-42:green',
                deck_file_name: 'green-briefing.html',
                deck_label: ''
            }
        })).toMatchObject({
            communicationId: 'comm-green-upload',
            recipientTeam: 'green',
            deckSource: 'browser_upload',
            deckStorageKey: 'scribe-deck:session-42:green',
            deckFileName: 'green-briefing.html',
            deckPath: null,
            deckLabel: 'green briefing'
        });
    });

    it('falls back to the team default deck when an assigned override cannot be fetched', async () => {
        const { ScribeController } = await loadScribeModule();
        const { showToast } = await import('../components/ui/Toast.js');
        global.document = createFakeDocument();
        global.document.body.dataset.team = 'blue';
        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 404
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(`
                    <script>
                        const SLIDES = [{"n":1,"title":"Fallback Deck","src":"data:image/png;base64,AAA="}];
                        const SECTIONS = [];
                    </script>
                `)
            });

        const controller = new ScribeController();

        await controller.loadDeck({
            deckPath: 'decks/blue/missing-deck.html',
            deckLabel: 'Missing Deck'
        });

        expect(global.fetch).toHaveBeenNthCalledWith(1, buildAppPath('decks/blue/missing-deck.html'), {
            credentials: 'same-origin'
        });
        expect(global.fetch).toHaveBeenNthCalledWith(2, buildAppPath(buildDefaultScribeDeckPath('blue')), {
            credentials: 'same-origin'
        });
        expect(controller.facilitatorDeckSlides).toEqual([{
            n: 1,
            title: 'Fallback Deck',
            src: 'data:image/png;base64,AAA='
        }]);
        expect(showToast).toHaveBeenCalledWith({
            message: 'Assigned facilitator deck unavailable. Loaded the default team deck instead.',
            type: 'warning'
        });
    });

    it('loads uploaded deck slides from browser cache when White Cell assigns a browser upload', async () => {
        const { ScribeController } = await loadScribeModule();
        const deckStorage = await import('../features/scribe/deckStorage.js');
        global.document = createFakeDocument();
        global.document.body.dataset.team = 'blue';
        const getUploadedScribeDeck = vi.spyOn(deckStorage, 'getUploadedScribeDeck').mockResolvedValue({
            storageKey: 'scribe-deck:session-42:blue',
            deckLabel: 'Uploaded Crisis Deck',
            slides: [{
                n: 1,
                title: 'Uploaded Briefing',
                src: 'data:image/png;base64,BBB='
            }]
        });

        const controller = new ScribeController();

        await controller.loadDeck({
            deckSource: 'browser_upload',
            deckStorageKey: 'scribe-deck:session-42:blue',
            deckLabel: 'Uploaded Crisis Deck'
        });

        expect(getUploadedScribeDeck).toHaveBeenCalledWith('scribe-deck:session-42:blue');
        expect(controller.facilitatorDeckSlides).toEqual([{
            n: 1,
            title: 'Uploaded Briefing',
            src: 'data:image/png;base64,BBB='
        }]);
    });

    it('falls back to the team default deck when an uploaded deck is not cached in this browser', async () => {
        const { ScribeController } = await loadScribeModule();
        const { showToast } = await import('../components/ui/Toast.js');
        const deckStorage = await import('../features/scribe/deckStorage.js');
        global.document = createFakeDocument();
        global.document.body.dataset.team = 'blue';
        vi.spyOn(deckStorage, 'getUploadedScribeDeck').mockResolvedValue(null);
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(`
                <script>
                    const SLIDES = [{"n":1,"title":"Fallback Deck","src":"data:image/png;base64,AAA="}];
                    const SECTIONS = [];
                </script>
            `)
        });

        const controller = new ScribeController();

        await controller.loadDeck({
            deckSource: 'browser_upload',
            deckStorageKey: 'scribe-deck:session-42:blue',
            deckLabel: 'Uploaded Crisis Deck'
        });

        expect(global.fetch).toHaveBeenCalledWith(buildAppPath(buildDefaultScribeDeckPath('blue')), {
            credentials: 'same-origin'
        });
        expect(showToast).toHaveBeenCalledWith({
            message: 'Assigned uploaded deck is not cached in this browser. Loaded the default team deck instead.',
            type: 'warning'
        });
    });

    it('keeps forwarded action slides usable when the support deck cannot load', async () => {
        const { ScribeController } = await loadScribeModule();
        const { showToast } = await import('../components/ui/Toast.js');
        global.document = createFakeDocument();
        global.document.body.dataset.team = 'blue';
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404
        });

        const controller = new ScribeController();
        controller.teamActions = [{
            id: 'action-forwarded-fallback',
            team: 'blue',
            move: 1,
            phase: 1,
            goal: 'Keep the forwarded action usable',
            expected_outcomes: 'Scribe can still submit without the support deck.',
            mechanism: 'Economic',
            status: 'draft',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Keep the forwarded action usable.',
                scribeHandoff: 'Forwarded'
            })
        }];
        controller.renderSections = vi.fn();
        controller.renderSlide = vi.fn();

        await controller.loadDeck();

        expect(global.document.body.dataset.scribeDeckState).toBe('ready');
        expect(controller.getCurrentSlideKey()).toBe('action-action-forwarded-fallback');
        expect(controller.renderSections).toHaveBeenCalled();
        expect(controller.renderSlide).toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith({
            message: 'The facilitator support deck could not be loaded. Showing live decision slides only.',
            type: 'warning'
        });
    });

    it('moves focus into the alerts dialog without clearing unread, traps Tab, and restores focus on Escape', async () => {
        const { ScribeController } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const alertsButton = fakeDocument.register(createFakeElement('scribeAlertsBtn', '', 'button'));
        const alertsPanel = fakeDocument.register(createFakeElement('scribeAlertsPanel'));
        const alertsBadge = fakeDocument.register(createFakeElement('scribeAlertsBadge'));
        const clearButton = createFakeElement('scribeAlertsClear', '', 'button');
        const closeButton = createFakeElement('scribeAlertsClose', '', 'button');
        alertsPanel.querySelectorAll = vi.fn(() => [clearButton, closeButton]);
        alertsPanel.contains = vi.fn((candidate) => [
            alertsPanel,
            clearButton,
            closeButton
        ].includes(candidate));
        fakeDocument.activeElement = alertsButton;
        global.document = fakeDocument;

        const controller = new ScribeController();
        controller.renderAlerts = vi.fn();
        controller.notifications = [{ id: 'note-1', title: 'New event', read: false }];
        controller.unreadNotifications = 1;

        controller.setAlertsOpen(true, { trigger: alertsButton });

        expect(alertsPanel.hidden).toBe(false);
        expect(alertsButton.getAttribute('aria-expanded')).toBe('true');
        expect(controller.unreadNotifications).toBe(1);
        expect(controller.notifications[0].read).toBe(false);
        expect(controller.renderAlerts).toHaveBeenCalled();
        expect(clearButton.focus).toHaveBeenCalledWith({ preventScroll: true });

        fakeDocument.activeElement = closeButton;
        const tabEvent = {
            key: 'Tab',
            shiftKey: false,
            preventDefault: vi.fn()
        };

        controller.handleAlertsKeydown(tabEvent);

        expect(tabEvent.preventDefault).toHaveBeenCalled();
        expect(clearButton.focus).toHaveBeenCalledTimes(2);

        const escapeEvent = {
            key: 'Escape',
            preventDefault: vi.fn()
        };

        controller.handleAlertsKeydown(escapeEvent);

        expect(escapeEvent.preventDefault).toHaveBeenCalled();
        expect(alertsPanel.hidden).toBe(true);
        expect(alertsButton.getAttribute('aria-expanded')).toBe('false');
        expect(alertsButton.focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(alertsBadge.hidden).toBe(false);
        expect(alertsBadge.textContent).toBe('1');
    });

    it('pops up each new Tribe Street Journal update for the Facilitator without replaying history', async () => {
        const { ScribeController } = await loadScribeModule();
        const { showToast } = await import('../components/ui/Toast.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const {
            WHITE_CELL_UPDATE_KINDS,
            buildWhiteCellRecipientMetadata
        } = await import('../features/communications/targeting.js');

        global.document = createFakeDocument();
        const getAll = vi.spyOn(communicationsStore, 'getAll');
        const controller = new ScribeController();
        controller.renderAlerts = vi.fn();
        controller.durableNotifications = {
            notify: vi.fn(() => ({}))
        };

        getAll.mockReturnValue([]);
        controller.processCommunicationNotifications('initialized');
        expect(showToast).not.toHaveBeenCalled();

        getAll.mockReturnValue([{
            id: 'comm-journal-facilitator-update-1',
            from_role: 'whitecell_lead',
            to_role: 'blue',
            type: 'GUIDANCE',
            content: 'The port disruption headline has been updated.',
            created_at: '2026-07-15T12:00:00.000Z',
            metadata: buildWhiteCellRecipientMetadata('blue', {
                content_kind: WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL
            })
        }]);

        controller.processCommunicationNotifications('created');

        expect(controller.notifications).toHaveLength(1);
        expect(controller.notifications[0].title).toBe('Tribe Street Journal update');
        expect(controller.durableNotifications.notify).toHaveBeenCalledWith(expect.objectContaining({
            id: 'direct-communication:comm-journal-facilitator-update-1',
            source: 'White Cell'
        }), expect.any(Object));
        expect(showToast).not.toHaveBeenCalled();
    });

    it('clears only the opened durable alert and transfers focus to its destination', async () => {
        const { ScribeController } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const focusTarget = createFakeElement('notificationDestination', '', 'article');
        const originalQuerySelector = fakeDocument.querySelector.bind(fakeDocument);
        fakeDocument.querySelector = vi.fn((selector) => (
            selector.includes('#deckActionFrame') ? focusTarget : originalQuerySelector(selector)
        ));
        global.document = fakeDocument;
        global.requestAnimationFrame = (callback) => callback();

        const controller = new ScribeController();
        controller.setSlideByKey = vi.fn();
        controller.renderAlerts = vi.fn();
        controller.notifications = [{
            id: 'direct-communication:comm-open',
            title: 'White Cell communication',
            read: false,
            durableNotification: {
                destination: { slideKey: 'communication-comm-open' }
            }
        }, {
            id: 'direct-communication:comm-still-unread',
            title: 'Another communication',
            read: false
        }];
        controller.unreadNotifications = 2;
        controller.durableNotifications = {
            open: vi.fn((_id, onOpen) => onOpen({ destination: { slideKey: 'communication-comm-open' } }))
        };

        controller.openNotificationEntry('direct-communication:comm-open');

        expect(controller.unreadNotifications).toBe(1);
        expect(controller.notifications[1].read).toBe(false);
        expect(controller.setSlideByKey).toHaveBeenCalledWith('communication-comm-open');
        expect(focusTarget.focus).toHaveBeenCalledWith({ preventScroll: false });
    });

    it('clears only the durable alert whose slide is explicitly opened', async () => {
        const { ScribeController } = await loadScribeModule();
        const controller = new ScribeController();
        controller.renderAlerts = vi.fn();
        controller.notifications = [{
            id: 'proposal-opened',
            read: false,
            durableNotification: { destination: { slideKey: 'proposal-1' } }
        }, {
            id: 'proposal-unread',
            read: false,
            durableNotification: { destination: { slideKey: 'proposal-2' } }
        }];
        controller.unreadNotifications = 2;
        controller.durableNotifications = { markDestinationRead: vi.fn(() => true) };

        controller.markSlideNotificationsRead('proposal-1');

        expect(controller.notifications[0].read).toBe(true);
        expect(controller.notifications[1].read).toBe(false);
        expect(controller.unreadNotifications).toBe(1);
        expect(controller.durableNotifications.markDestinationRead).toHaveBeenCalledWith({ slideKey: 'proposal-1' });
    });

    it('seeds a delayed initial communications snapshot without replaying unread activity', async () => {
        const { ScribeController } = await loadScribeModule();
        const { showToast } = await import('../components/ui/Toast.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { buildWhiteCellRecipientMetadata } = await import('../features/communications/targeting.js');

        global.document = createFakeDocument();
        const getAll = vi.spyOn(communicationsStore, 'getAll');
        const controller = new ScribeController();
        controller.renderAlerts = vi.fn();
        controller.durableNotifications = {
            seed: vi.fn(),
            notify: vi.fn(() => ({}))
        };
        const historicalCommunication = {
            id: 'comm-present-before-reload-1',
            from_role: 'white_cell',
            to_role: 'blue_scribe',
            type: 'GUIDANCE',
            content: 'This communication existed before the Facilitator reloaded.',
            created_at: '2026-07-15T12:00:00.000Z',
            metadata: buildWhiteCellRecipientMetadata('blue_scribe')
        };

        communicationsStore.initialized = false;
        getAll.mockReturnValue([]);
        controller.primeNotifications();

        getAll.mockReturnValue([historicalCommunication]);
        controller.processCommunicationNotifications('loaded');

        expect(controller.knownCommunicationIds).toContain(historicalCommunication.id);
        expect(controller.notifications).toHaveLength(0);
        expect(controller.unreadNotifications).toBe(0);
        expect(showToast).not.toHaveBeenCalled();
    });

    it('keeps two consecutive White Cell communications in the Facilitator activity feed', async () => {
        const { ScribeController } = await loadScribeModule();
        const { showToast } = await import('../components/ui/Toast.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { buildWhiteCellRecipientMetadata } = await import('../features/communications/targeting.js');

        global.document = createFakeDocument();
        const getAll = vi.spyOn(communicationsStore, 'getAll');
        const controller = new ScribeController();
        controller.renderAlerts = vi.fn();
        controller.durableNotifications = { notify: vi.fn(() => ({})) };

        getAll.mockReturnValue([]);
        controller.processCommunicationNotifications('loaded');

        const firstCommunication = {
            id: 'comm-facilitator-consecutive-1',
            from_role: 'white_cell',
            to_role: 'blue_scribe',
            type: 'GUIDANCE',
            content: 'First facilitator message.',
            created_at: '2026-07-15T12:00:00.000Z',
            metadata: buildWhiteCellRecipientMetadata('blue_scribe')
        };
        const secondCommunication = {
            id: 'comm-facilitator-consecutive-2',
            from_role: 'white_cell',
            to_role: 'blue_scribe',
            type: 'GUIDANCE',
            content: 'Second facilitator message.',
            created_at: '2026-07-15T12:00:01.000Z',
            metadata: buildWhiteCellRecipientMetadata('blue_scribe')
        };

        // The first row was committed in the initial snapshot-to-realtime gap
        // and recovered by reconciliation; the second arrived normally.
        getAll.mockReturnValue([firstCommunication]);
        controller.processCommunicationNotifications('reconciled');
        getAll.mockReturnValue([secondCommunication, firstCommunication]);
        controller.processCommunicationNotifications('created');

        expect(controller.notifications).toHaveLength(2);
        expect(controller.unreadNotifications).toBe(2);
        expect(controller.notifications.map((entry) => entry.detail)).toEqual([
            'Second facilitator message.',
            'First facilitator message.'
        ]);
        expect(controller.durableNotifications.notify).toHaveBeenCalledTimes(2);
        expect(showToast).not.toHaveBeenCalled();
    });

    it('announces a White Cell communication recovered by reconnect resync exactly once', async () => {
        const { ScribeController } = await loadScribeModule();
        const { showToast } = await import('../components/ui/Toast.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { buildWhiteCellRecipientMetadata } = await import('../features/communications/targeting.js');

        global.document = createFakeDocument();
        const getAll = vi.spyOn(communicationsStore, 'getAll');
        const controller = new ScribeController();
        controller.renderAlerts = vi.fn();
        controller.durableNotifications = { notify: vi.fn(() => ({})) };
        const recoveredCommunication = {
            id: 'comm-recovered-after-outage-1',
            from_role: 'white_cell',
            to_role: 'blue_scribe',
            type: 'GUIDANCE',
            content: 'Recovered while the facilitator was offline.',
            created_at: '2026-07-15T12:00:00.000Z',
            metadata: buildWhiteCellRecipientMetadata('blue_scribe')
        };

        getAll.mockReturnValue([]);
        controller.processCommunicationNotifications('initialized');
        getAll.mockReturnValue([recoveredCommunication]);
        controller.processCommunicationNotifications('loaded');
        controller.processCommunicationNotifications('loaded');

        expect(controller.notifications).toHaveLength(1);
        expect(controller.notifications[0].detail).toBe('Recovered while the facilitator was offline.');
        expect(controller.unreadNotifications).toBe(1);
        expect(controller.durableNotifications.notify).toHaveBeenCalledTimes(1);
        expect(showToast).not.toHaveBeenCalled();
    });

    it('keeps the requested sidebar sections while reserving Actions for live facilitator decisions', () => {
        const slides = Array.from({ length: 61 }, (_entry, index) => ({
            n: index + 1,
            title: `Slide ${index + 1}`,
            src: `data:image/png;base64,slide-${index + 1}`
        }));

        const sections = expandScribeDeckSections(slides);
        const flattenedSlides = flattenScribeDeckSlides(sections);
        const actionSection = sections.find((section) => section.id === 'actions');

        expect(SCRIBE_DECK_SECTIONS.map((section) => section.label)).toEqual([
            'Actions',
            'Overview',
            'Schedule',
            'Roles and Objectives',
            'BRICS+ Context',
            'Gameplay',
            'Support Materials',
            'Supply Chain Data',
            'Economic Tools',
            'Communications'
        ]);
        expect(actionSection?.slides).toHaveLength(0);
        expect(flattenedSlides).toHaveLength(55);
        expect(flattenedSlides.map((slide) => slide.n)).toEqual(
            Array.from({ length: 61 }, (_entry, index) => index + 1)
                .filter((slideNumber) => ![15, 16, 17, 18, 59, 60].includes(slideNumber))
        );
    });

    it('keeps four vertical action sections available for non-Blue scribe interfaces', async () => {
        const { ScribeController } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const sectionList = fakeDocument.register(createFakeElement('scribeSectionList'));
        global.document = fakeDocument;

        const controller = new ScribeController();
        controller.teamId = 'red';
        controller.sections = [{
            id: 'actions',
            label: 'Actions',
            slideCount: 1,
            slides: [{
                slideKey: 'action-live-1',
                slideType: 'action',
                title: 'Live decision',
                action: { id: 'live-1', move: 1, updated_at: '2026-08-05T12:00:00.000Z' }
            }]
        }, {
            id: 'overview',
            label: 'Overview',
            slideCount: 1,
            slides: [{ n: 1, title: 'Overview slide', src: 'data:image/png;base64,one' }]
        }];
        controller.deckSlides = [
            controller.sections[0].slides[0],
            controller.sections[1].slides[0]
        ];
        controller.currentSlideIndex = 0;
        controller.activeSectionIndex = 0;
        controller.expandedSectionIds = new Set(['actions', 'overview']);
        controller.sectionExpansionInitialized = true;

        controller.renderSections();
        expect(sectionList.innerHTML).toContain('data-scribe-action-mark-stack');
        expect(sectionList.innerHTML).toContain('<h2 class="scribe-section-region-title">Actions</h2>');
        expect(sectionList.innerHTML).toContain('data-scribe-action-mark="strategic-orientation"');
        expect(sectionList.innerHTML).toContain('data-scribe-action-mark="move-1"');
        expect(sectionList.innerHTML).toContain('data-scribe-action-mark="move-2"');
        expect(sectionList.innerHTML).toContain('data-scribe-action-mark="move-3"');
        expect(sectionList.innerHTML).toMatch(/data-scribe-action-mark="move-1"[\s\S]*?aria-current="true"/);
        expect(sectionList.innerHTML).not.toContain('role="tablist"');
        expect(sectionList.innerHTML).not.toContain('hidden');
        expect(sectionList.innerHTML).not.toContain('Overview');

        expect(controller.activeSectionIndex).toBe(0);
        expect(controller.getCurrentSlideKey()).toBe('action-live-1');
    });

    it('renders the horizontal mark rail on the actual Blue Facilitator action workspace', async () => {
        const { ScribeController } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const sectionList = fakeDocument.register(createFakeElement('scribeSectionList'));
        global.document = fakeDocument;

        const controller = new ScribeController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';
        controller.sections = [{
            id: 'actions',
            label: 'Actions',
            slideCount: 3,
            slides: [{
                slideKey: 'action-move-1-old',
                slideType: 'action',
                title: 'Older Move 1 action',
                action: { id: 'move-1-old', move: 1, updated_at: '2026-08-05T10:00:00.000Z' }
            }, {
                slideKey: 'action-move-1-new',
                slideType: 'action',
                title: 'Newest Move 1 action',
                action: { id: 'move-1-new', move: 1, updated_at: '2026-08-05T12:00:00.000Z' }
            }, {
                slideKey: 'action-move-3',
                slideType: 'action',
                title: 'Move 3 action',
                action: { id: 'move-3', move: 3, updated_at: '2026-08-05T11:00:00.000Z' }
            }]
        }];
        controller.deckSlides = [...controller.sections[0].slides];
        controller.currentSlideIndex = 0;
        controller.activeSectionIndex = 0;

        controller.renderSections();

        expect(sectionList.innerHTML).toContain('data-scribe-action-mark-navigation');
        expect(sectionList.innerHTML).toContain('role="tablist"');
        expect(sectionList.innerHTML).toContain('aria-orientation="horizontal"');
        expect(sectionList.innerHTML).toContain('data-scribe-action-mark-tab="strategic-orientation"');
        expect(sectionList.innerHTML).toContain('aria-label="Strategic Orientation, 0 records"');
        expect(sectionList.innerHTML).toContain('aria-label="Move 1, 2 records"');
        expect(sectionList.innerHTML).toContain('aria-label="Move 2, 0 records"');
        expect(sectionList.innerHTML).toContain('aria-label="Move 3, 1 record"');
        expect(sectionList.innerHTML).toMatch(/data-scribe-action-mark-tab="move-1"[\s\S]*?aria-selected="true"[\s\S]*?tabindex="0"/);
        expect(sectionList.innerHTML).toMatch(/data-scribe-action-mark-panel="strategic-orientation"[\s\S]*?No records for Strategic Orientation\./);
        expect(sectionList.innerHTML).toMatch(/data-scribe-action-mark-panel="move-2"[\s\S]*?No records for Move 2\./);
        expect(sectionList.innerHTML).toMatch(/data-scribe-action-mark-panel="move-1"[\s\S]*?role="tabpanel"[\s\S]*?tabindex="0"/);
        expect(sectionList.innerHTML.indexOf('Newest Move 1 action')).toBeLessThan(
            sectionList.innerHTML.indexOf('Older Move 1 action')
        );
        expect(sectionList.innerHTML).not.toContain('data-scribe-action-mark-stack');
    });

    it('moves Blue Facilitator mark-tab selection and focus with arrow, Home, and End keys', async () => {
        const { ScribeController } = await loadScribeModule();
        const controller = new ScribeController();
        const container = createFakeElement('scribeSectionList');
        const markKeys = ['strategic-orientation', 'move-1', 'move-2', 'move-3'];
        const tabs = markKeys.map((markKey) => {
            const tab = createFakeElement(null, 'action-mark-tab scribe-action-mark-tab', 'button');
            tab.dataset.scribeActionMarkTab = markKey;
            tab.closest = (selector) => selector === '[data-scribe-action-mark-tab]' ? tab : null;
            tab.scrollIntoView = vi.fn();
            container.appendChild(tab);
            return tab;
        });
        const panels = markKeys.map((markKey) => {
            const panel = createFakeElement();
            panel.dataset.scribeActionMarkPanel = markKey;
            container.appendChild(panel);
            return panel;
        });
        container.querySelectorAll = (selector) => (
            selector === '[data-scribe-action-mark-tab]' ? tabs : panels
        );

        for (const [key, currentIndex, expectedIndex] of [
            ['ArrowRight', 0, 1],
            ['ArrowLeft', 0, 3],
            ['Home', 2, 0],
            ['End', 1, 3]
        ]) {
            tabs.forEach((tab) => tab.focus.mockClear());
            controller.setScribeActionMark(markKeys[currentIndex], container);
            const event = {
                key,
                target: tabs[currentIndex],
                preventDefault: vi.fn(),
                stopPropagation: vi.fn()
            };

            controller.handleScribeActionMarkKeydown(event, container);

            expect(event.preventDefault).toHaveBeenCalledOnce();
            expect(event.stopPropagation).toHaveBeenCalledOnce();
            expect(controller.actionMarkActiveKey).toBe(markKeys[expectedIndex]);
            expect(tabs[expectedIndex].getAttribute('aria-selected')).toBe('true');
            expect(tabs[expectedIndex].getAttribute('tabindex')).toBe('0');
            expect(tabs[expectedIndex].focus).toHaveBeenCalledOnce();
            expect(tabs[expectedIndex].scrollIntoView).toHaveBeenCalledWith({
                block: 'nearest',
                inline: 'nearest'
            });
            expect(panels[expectedIndex].hidden).toBe(false);
            tabs.forEach((tab, tabIndex) => {
                expect(tab.getAttribute('aria-selected')).toBe(tabIndex === expectedIndex ? 'true' : 'false');
                expect(tab.getAttribute('tabindex')).toBe(tabIndex === expectedIndex ? '0' : '-1');
                expect(panels[tabIndex].hidden).toBe(tabIndex !== expectedIndex);
            });
        }
    });

    it('scopes the sidebar to the active deck workspace without duplicating live actions', async () => {
        const { ScribeController } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const sectionList = fakeDocument.register(createFakeElement('scribeSectionList'));
        global.document = fakeDocument;

        const controller = new ScribeController();
        controller.sections = [{
            id: 'actions',
            label: 'Actions',
            slideCount: 1,
            slides: [{
                slideKey: 'actions-placeholder',
                slideType: 'action-placeholder',
                sidebarOrdinal: '0',
                title: 'Awaiting Blue Team scribe decisions'
            }]
        }, {
            id: 'overview',
            label: 'Overview',
            slideCount: 1,
            slides: [{ n: 1, title: 'Overview slide', src: 'data:image/png;base64,one' }]
        }];
        controller.deckSlides = [
            controller.sections[1].slides[0],
            controller.sections[0].slides[0]
        ];
        controller.currentSlideIndex = 0;
        controller.activeSectionIndex = 1;
        controller.expandedSectionIds = new Set(['actions', 'overview']);
        controller.sectionExpansionInitialized = true;

        controller.renderSections();

        expect(sectionList.innerHTML).toContain('scribe-workspace-rail-summary');
        expect(sectionList.innerHTML).toContain('Support deck');
        expect(sectionList.innerHTML).not.toContain('scribe-section-region--actions');
        expect(sectionList.innerHTML).not.toContain('data-scribe-action-mark-stack');
        expect(sectionList.innerHTML).not.toContain('Overview slide');
        expect(controller.deckSlides).toContain(controller.sections[1].slides[0]);
    });

    it('keeps received proposals in a persistent sidebar section immediately below Actions', async () => {
        const { ScribeController, buildFacilitatorProposalSlides } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const sectionList = fakeDocument.register(createFakeElement('scribeSectionList'));
        global.document = fakeDocument;
        const teamContext = {
            teamId: 'blue',
            scribeRole: 'blue_scribe'
        };
        const receivedProposal = {
            id: 'proposal-communication-1',
            type: 'PROPOSAL_FORWARDED',
            from_role: 'white_cell',
            to_role: 'blue',
            created_at: '2026-07-15T12:00:00.000Z',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'blue',
                source_team: 'green',
                proposal: { title: 'Joint Port Resilience' },
                proposal_recipient_state: { status: 'unread' }
            }
        };
        const proposalSlides = buildFacilitatorProposalSlides([receivedProposal], { teamContext });
        const emptyProposalSlides = buildFacilitatorProposalSlides([], { teamContext });
        const controller = new ScribeController();
        controller.sections = [{
            id: 'actions',
            label: 'Actions',
            slideCount: 0,
            slides: [{ slideKey: 'actions-placeholder', slideType: 'action-placeholder', title: 'No actions' }]
        }, {
            id: 'proposals',
            label: 'Proposals',
            slideCount: proposalSlides.slideCount,
            slides: proposalSlides.slides
        }];
        controller.deckSlides = [...controller.sections[0].slides, ...proposalSlides.slides];
        controller.currentSlideIndex = 1;
        controller.expandedSectionIds = new Set(['actions', 'proposals']);
        controller.sectionExpansionInitialized = true;

        controller.renderSections();

        expect(proposalSlides.slideCount).toBe(1);
        expect(emptyProposalSlides).toMatchObject({
            slideCount: 0,
            slides: [{
                slideKey: 'proposals-placeholder',
                slideType: 'proposal-placeholder',
                title: 'No proposals received yet'
            }]
        });
        expect(proposalSlides.slides[0]).toMatchObject({
            slideKey: 'proposal-proposal-communication-1',
            slideType: 'proposal',
            title: 'Joint Port Resilience'
        });
        expect(sectionList.innerHTML.indexOf('scribe-section-region--actions'))
            .toBeLessThan(sectionList.innerHTML.indexOf('scribe-section-region--proposals'));
        expect(sectionList.innerHTML).toContain('Received from other teams');
        expect(sectionList.innerHTML).toContain('From Green Team | Unread');
        expect(sectionButtonMarkup(sectionList.innerHTML, 'Proposals')).toContain('aria-label="Proposals, 1 proposal"');
    });

    it('adds action notifications as a live deck section and updates the Notifications tab count', async () => {
        const { ScribeController } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const notificationsButton = fakeDocument.register(createFakeElement('notificationsViewBtn'));
        const notificationsCount = fakeDocument.register(createFakeElement('notificationsViewCount'));
        global.document = fakeDocument;

        const controller = new ScribeController();
        controller.teamId = 'industry';
        controller.teamContext = { teamId: 'industry', scribeRole: 'industry_scribe' };
        // rebuildDeck reads action notifications from this.actionNotifications, not
        // this.directCommunications — Task 4's exclusion means the same communication
        // would never appear in directCommunications once isFacilitatorDirectCommunication
        // is updated, so the two arrays must be populated independently here.
        controller.actionNotifications = [{
            id: 'notif-1',
            type: 'ACTION_NOTIFICATION',
            from_role: 'white_cell',
            to_role: 'industry',
            created_at: '2026-08-14T09:00:00.000Z',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'industry',
                source_team: 'blue',
                shared_action_id: 'action-1',
                action_snapshot: { title: 'Rare-earth export controls' }
            }
        }];

        controller.rebuildDeck();

        const notificationsSection = controller.sections.find((section) => section.id === 'action-notifications');
        expect(notificationsSection).toBeDefined();
        expect(notificationsSection.slideCount).toBe(1);

        controller.updateFacilitatorViewSwitch('notifications');

        expect(notificationsCount.textContent).toBe('1');
        expect(notificationsButton.classList.contains('is-active')).toBe(true);
    });

    it('renders the Notifications tab sidebar region without throwing when a notification slide is active', async () => {
        const { ScribeController, buildFacilitatorActionNotificationSlides } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const sectionList = fakeDocument.register(createFakeElement('scribeSectionList'));
        global.document = fakeDocument;
        const teamContext = {
            teamId: 'industry',
            scribeRole: 'industry_scribe'
        };
        const notification = {
            id: 'notif-1',
            type: 'ACTION_NOTIFICATION',
            from_role: 'white_cell',
            to_role: 'industry',
            created_at: '2026-08-14T09:00:00.000Z',
            content: 'Blue is adjusting export controls on rare-earth materials.',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'industry',
                source_team: 'blue',
                shared_action_id: 'action-1',
                action_snapshot: { title: 'Rare-earth export controls' }
            }
        };
        const notificationSlides = buildFacilitatorActionNotificationSlides([notification], { teamContext });
        const controller = new ScribeController();
        controller.teamId = 'industry';
        controller.teamContext = teamContext;
        controller.sections = [{
            id: 'actions',
            label: 'Actions',
            slideCount: 0,
            slides: [{ slideKey: 'actions-placeholder', slideType: 'action-placeholder', title: 'No actions' }]
        }, {
            id: 'action-notifications',
            label: 'Notifications',
            slideCount: notificationSlides.slideCount,
            slides: notificationSlides.slides
        }];
        controller.deckSlides = [...controller.sections[0].slides, ...notificationSlides.slides];
        controller.currentSlideIndex = 1;
        controller.expandedSectionIds = new Set(['actions', 'action-notifications']);
        controller.sectionExpansionInitialized = true;

        expect(notificationSlides.slideCount).toBe(1);
        expect(() => controller.renderSections()).not.toThrow();

        expect(controller.activeFacilitatorView).toBe('notifications');
        expect(sectionList.innerHTML).toContain('scribe-section-region--notifications');
        expect(sectionList.innerHTML).toContain('<h2 class="scribe-section-region-title">Notifications</h2>');
        expect(sectionList.innerHTML).toContain('Rare-earth export controls');
    });

    it('excludes action notifications addressed to another team when syncing from the communications store', async () => {
        const { ScribeController } = await loadScribeModule();
        const { communicationsStore } = await import('../stores/communications.js');

        global.document = createFakeDocument();
        const getAll = vi.spyOn(communicationsStore, 'getAll');
        const controller = new ScribeController();
        controller.teamId = 'industry';
        controller.teamContext = { teamId: 'industry', scribeRole: 'industry_scribe' };

        const ownTeamNotification = {
            id: 'notif-own',
            type: 'ACTION_NOTIFICATION',
            from_role: 'white_cell',
            to_role: 'industry',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'industry',
                source_team: 'blue',
                shared_action_id: 'action-1',
                action_snapshot: { title: 'Own team notification' }
            }
        };
        const otherTeamNotification = {
            id: 'notif-other',
            type: 'ACTION_NOTIFICATION',
            from_role: 'white_cell',
            to_role: 'green',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'green',
                source_team: 'blue',
                shared_action_id: 'action-2',
                action_snapshot: { title: 'Other team notification' }
            }
        };

        getAll.mockReturnValue([ownTeamNotification, otherTeamNotification]);

        controller.syncActionNotificationsFromStore();

        expect(controller.actionNotifications).toHaveLength(1);
        expect(controller.actionNotifications[0].id).toBe('notif-own');
    });

    it('builds action notification slides from ACTION_NOTIFICATION and enriched Red-share GUIDANCE communications', async () => {
        const { buildFacilitatorActionNotificationSlides } = await loadScribeModule();
        const teamContext = {
            teamId: 'industry',
            scribeRole: 'industry_scribe'
        };
        const greenIndustryNotification = {
            id: 'notif-1',
            type: 'ACTION_NOTIFICATION',
            from_role: 'white_cell',
            to_role: 'industry',
            created_at: '2026-08-14T09:00:00.000Z',
            content: 'Blue is adjusting export controls on rare-earth materials.',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'industry',
                source_team: 'blue',
                shared_action_id: 'action-1',
                action_snapshot: { title: 'Rare-earth export controls', objective: 'Limit outbound rare-earth shipments.' }
            }
        };
        const otherTeamNotification = {
            id: 'notif-2',
            type: 'ACTION_NOTIFICATION',
            from_role: 'white_cell',
            to_role: 'green',
            created_at: '2026-08-14T09:05:00.000Z',
            content: 'Not for Industry.',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'green',
                source_team: 'blue',
                shared_action_id: 'action-2',
                action_snapshot: { title: 'Other action' }
            }
        };

        const slides = buildFacilitatorActionNotificationSlides(
            [greenIndustryNotification, otherTeamNotification],
            { teamContext }
        );
        const emptySlides = buildFacilitatorActionNotificationSlides([], { teamContext });

        expect(slides.slideCount).toBe(1);
        expect(slides.slides[0]).toMatchObject({
            slideKey: 'action-notification-notif-1',
            slideType: 'action-notification',
            title: 'Rare-earth export controls'
        });
        expect(slides.slides[0].sidebarKicker).toContain('Blue Team');
        expect(emptySlides).toMatchObject({
            slideCount: 0,
            slides: [{ slideKey: 'action-notifications-placeholder', slideType: 'action-notification-placeholder' }]
        });
    });

    it('excludes action notifications from the direct Communications thread', async () => {
        const { isFacilitatorDirectCommunication } = await loadScribeModule();
        const teamContext = {
            teamId: 'industry',
            scribeRole: 'industry_scribe'
        };
        const notification = {
            id: 'notif-3',
            type: 'ACTION_NOTIFICATION',
            from_role: 'white_cell',
            to_role: 'industry',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'industry',
                shared_action_id: 'action-3',
                source_team: 'blue'
            }
        };

        expect(isFacilitatorDirectCommunication(notification, teamContext)).toBe(false);
    });

    it('scopes RFI navigation and the communication summary to their selected workspaces', async () => {
        const { ScribeController } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const sectionList = fakeDocument.register(createFakeElement('scribeSectionList'));
        global.document = fakeDocument;
        const actionSlide = { slideKey: 'action-one', slideType: 'action', title: 'Action one' };
        const rfiSlide = { slideKey: 'rfi-one', slideType: 'rfi', title: 'Reporting period' };
        const communicationSlide = {
            slideKey: 'communication-one',
            slideType: 'communication',
            title: 'White Cell guidance'
        };
        const controller = new ScribeController();
        controller.sections = [{ id: 'actions', label: 'Actions', slides: [actionSlide] }, {
            id: 'rfis',
            label: 'RFIs',
            slideCount: 1,
            slides: [rfiSlide]
        }, {
            id: 'direct-communications',
            label: 'Communications',
            slideCount: 1,
            slides: [communicationSlide]
        }];
        controller.deckSlides = [actionSlide, rfiSlide, communicationSlide];
        controller.directCommunications = [{ id: 'communication-one' }];
        controller.currentSlideIndex = 1;
        controller.expandedSectionIds = new Set(['rfis']);

        controller.renderSections();
        expect(sectionList.innerHTML).toContain('scribe-section-region--rfis');
        expect(sectionList.innerHTML).toContain('RFI history');
        expect(sectionList.innerHTML).toContain('Reporting period');
        expect(sectionList.innerHTML).not.toContain('scribe-section-region--actions');
        expect(sectionList.innerHTML).not.toContain('White Cell guidance');

        controller.currentSlideIndex = 2;
        controller.renderSections();
        expect(sectionList.innerHTML).toContain('scribe-workspace-rail-summary');
        expect(sectionList.innerHTML).toContain('A private, session-scoped thread');
        expect(sectionList.innerHTML).toContain('1 message');
        expect(sectionList.innerHTML).not.toContain('Reporting period');
    });

    it('renders every received proposal for projection with exactly the required response options', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        const controller = new ScribeController();
        controller.teamLabel = 'Blue Team';
        const communication = {
            id: 'proposal-projection-1',
            type: 'PROPOSAL_FORWARDED',
            from_role: 'white_cell',
            to_role: 'blue',
            metadata: {
                source_team: 'industry',
                proposal: {
                    title: 'Critical Minerals Compact',
                    objective: 'Coordinate a shared stockpile.',
                    originators: ['Industry Coalition'],
                    category: 'Supply chain',
                    intendedPartners: 'Blue Team',
                    focusSector: 'Critical minerals',
                    delivery: 'Joint statement',
                    timingAndConditions: 'Before Move 3',
                    expectedOutcomes: 'Lower exposure to disruption.'
                },
                proposal_recipient_state: { status: 'unread' }
            }
        };

        const html = controller.renderProposalSlide({
            slideKey: 'proposal-projection-1',
            slideType: 'proposal',
            communication,
            title: 'Critical Minerals Compact'
        });

        expect(html).toContain('Proposal from Industry Team');
        expect(html).toContain('Critical Minerals Compact');
        expect(html).toContain('Coordinate a shared stockpile.');
        expect(html).toContain('Instrument of Power');
        expect(html).not.toContain('>Category<');
        expect(html).not.toContain('Intended partners');
        expect(html).not.toContain('Blue Team and Red Team');
        expect(html.match(/data-facilitator-proposal-decision=/g)).toHaveLength(3);
        expect(html).toContain('data-facilitator-proposal-decision="accept"');
        expect(html).toContain('>Accept</button>');
        expect(html).toContain('data-facilitator-proposal-decision="not_interested"');
        expect(html).toContain('>Not Interested</button>');
        expect(html).toContain('data-facilitator-proposal-decision="negotiate"');
        expect(html).toContain('>Negotiate</button>');
        expect(html).not.toContain('>Acknowledge</button>');
        expect(html).not.toContain('>Decline</button>');
        expect(html).not.toContain('>Ignore</button>');

        const committedHtml = controller.renderProposalSlide({
            slideType: 'proposal',
            communication: {
                ...communication,
                metadata: {
                    ...communication.metadata,
                    proposal_recipient_state: {
                        status: 'responded',
                        facilitator_decision: 'accept',
                        response_content: 'Accepted'
                    }
                }
            }
        });
        expect(committedHtml).toContain('Recorded response: Accepted');
        expect(committedHtml.match(/data-facilitator-proposal-decision="[^"]+"[^>]+disabled/g)).toHaveLength(3);

        const negotiationHtml = controller.renderProposalSlide({
            slideType: 'proposal',
            communication: {
                ...communication,
                metadata: {
                    ...communication.metadata,
                    proposal_recipient_state: {
                        status: 'responded',
                        facilitator_decision: 'negotiate',
                        response_content: 'Add a six-month review clause.'
                    }
                }
            }
        });
        expect(negotiationHtml).toContain('Recorded response: Negotiation requested');
        expect(negotiationHtml).toContain('<strong>Negotiation terms:</strong> Add a six-month review clause.');
        expect(negotiationHtml).not.toContain('Recorded response: Responded');
    });

    it('maps Accept, Not Interested, and Negotiate onto the established recipient-state contract', async () => {
        const {
            FACILITATOR_PROPOSAL_DECISIONS,
            getFacilitatorProposalDecisionContract
        } = await loadScribeModule();

        expect(getFacilitatorProposalDecisionContract(
            FACILITATOR_PROPOSAL_DECISIONS.ACCEPT
        )).toEqual({
            label: 'Accepted',
            responseContent: 'Accepted',
            messageType: 'recipient_response'
        });
        expect(getFacilitatorProposalDecisionContract(
            FACILITATOR_PROPOSAL_DECISIONS.NOT_INTERESTED
        )).toEqual({
            label: 'Not Interested',
            responseContent: 'Not Interested',
            messageType: 'recipient_response'
        });
        expect(getFacilitatorProposalDecisionContract(
            FACILITATOR_PROPOSAL_DECISIONS.NEGOTIATE,
            '  Add a six-month review clause.  '
        )).toEqual({
            label: 'Negotiation requested',
            responseContent: 'Add a six-month review clause.',
            messageType: 'negotiation_message'
        });
        expect(getFacilitatorProposalDecisionContract(
            FACILITATOR_PROPOSAL_DECISIONS.REPLY,
            '  The proposing team accepts the checkpoint.  '
        )).toEqual({
            label: 'Follow-up',
            responseContent: 'The proposing team accepts the checkpoint.',
            messageType: 'negotiation_message'
        });
        expect(getFacilitatorProposalDecisionContract(
            FACILITATOR_PROPOSAL_DECISIONS.CLOSE
        )).toEqual({
            label: 'Thread closed',
            responseContent: 'Proposal thread closed.',
            messageType: 'thread_closed'
        });
        expect(getFacilitatorProposalDecisionContract('unsupported')).toBeNull();
    });

    it('confirms and submits the two direct facilitator proposal responses', async () => {
        const {
            FACILITATOR_PROPOSAL_DECISIONS,
            ScribeController
        } = await loadScribeModule();
        const { communicationsStore } = await import('../stores/communications.js');
        global.document = createFakeDocument();
        const communication = {
            id: 'proposal-direct-response-1',
            type: 'PROPOSAL_FORWARDED',
            created_at: '2026-08-06T12:00:00.000Z',
            metadata: {
                proposal: { title: 'Direct Response Proposal' },
                thread_id: 'thread-direct-1',
                recipient_team: 'blue',
                round_number: 0,
                parent_message_id: null,
                source_proposal_id: 'source-proposal-1',
                source_revision: 1,
                source_team: 'green',
                sender_team: 'white_cell',
                sender_role: 'whitecell_lead',
                sent_at: '2026-08-06T12:00:00.000Z',
                message_type: 'proposal_forwarded'
            }
        };
        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([communication]);
        const controller = new ScribeController();
        controller.receivedProposals = [communication];
        controller.submitFacilitatorProposalDecision = vi.fn().mockResolvedValue(true);
        mockConfirmModal.mockResolvedValue(true);

        await controller.handleFacilitatorProposalDecision(
            communication.id,
            FACILITATOR_PROPOSAL_DECISIONS.ACCEPT
        );
        await controller.handleFacilitatorProposalDecision(
            communication.id,
            FACILITATOR_PROPOSAL_DECISIONS.NOT_INTERESTED
        );

        expect(mockConfirmModal).toHaveBeenNthCalledWith(1, expect.objectContaining({
            title: 'Accept Proposal',
            confirmLabel: 'Accept'
        }));
        expect(mockConfirmModal).toHaveBeenNthCalledWith(2, expect.objectContaining({
            title: 'Not Interested Proposal',
            confirmLabel: 'Not Interested'
        }));
        expect(controller.submitFacilitatorProposalDecision).toHaveBeenNthCalledWith(
            1,
            communication,
            'accept'
        );
        expect(controller.submitFacilitatorProposalDecision).toHaveBeenNthCalledWith(
            2,
            communication,
            'not_interested'
        );
        mockConfirmModal.mockReset();
    });

    it('persists a facilitator negotiation through the shared proposal response contract', async () => {
        const {
            FACILITATOR_PROPOSAL_DECISIONS,
            ScribeController
        } = await loadScribeModule();
        const { sessionStore } = await import('../stores/session.js');
        const { communicationsStore } = await import('../stores/communications.js');
        const { timelineStore } = await import('../stores/timeline.js');
        global.document = createFakeDocument();
        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session-proposal-1');
        const communication = {
            id: 'proposal-negotiation-1',
            session_id: 'session-proposal-1',
            move: 2,
            type: 'PROPOSAL_FORWARDED',
            from_role: 'white_cell',
            to_role: 'blue',
            metadata: {
                source_proposal_id: 'source-proposal-1',
                source_revision: 1,
                source_team: 'green',
                recipient_team: 'blue',
                thread_id: 'thread-blue-1',
                round_number: 0,
                parent_message_id: null,
                sender_team: 'white_cell',
                sender_role: 'whitecell_lead',
                sent_at: '2026-08-06T12:00:00.000Z',
                message_type: 'proposal_forwarded',
                proposal: { title: 'Regional Logistics Compact' },
            }
        };
        const responseCommunication = { id: 'proposal-response-1', type: 'PROPOSAL_RESPONSE' };
        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([communication]);
        const communicationsUpdateSpy = vi.spyOn(communicationsStore, 'updateFromServer');
        const timelineUpdateSpy = vi.spyOn(timelineStore, 'updateFromServer');
        mockAppendProposalThreadMessage.mockResolvedValue(responseCommunication);
        const controller = new ScribeController();
        controller.role = 'blue_scribe';
        controller.teamId = 'blue';

        const saved = await controller.submitFacilitatorProposalDecision(
            communication,
            FACILITATOR_PROPOSAL_DECISIONS.NEGOTIATE,
            'Add a six-month review clause.'
        );

        expect(saved).toBe(true);
        expect(mockAppendProposalThreadMessage).toHaveBeenCalledWith('proposal-negotiation-1', expect.objectContaining({
            content: 'Add a six-month review clause.',
            messageType: 'negotiation_message',
            facilitatorDecision: 'negotiate',
            clientMessageId: expect.any(String)
        }));
        expect(communicationsUpdateSpy).toHaveBeenCalledWith('INSERT', responseCommunication);
        expect(mockUpdateProposalRecipientStatus).not.toHaveBeenCalled();
        expect(timelineUpdateSpy).not.toHaveBeenCalled();
    });

    it('switches among four accessible workspaces and restores the last deck slide', async () => {
        const { ScribeController } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const actionReviewButton = fakeDocument.register(createFakeElement('teamActionReviewViewBtn', '', 'button'));
        const deckButton = fakeDocument.register(createFakeElement('deckViewBtn', '', 'button'));
        const rfiButton = fakeDocument.register(createFakeElement('rfiViewBtn', '', 'button'));
        const communicationsButton = fakeDocument.register(createFakeElement('communicationsViewBtn', '', 'button'));
        const rfiCount = fakeDocument.register(createFakeElement('rfiViewCount'));
        const communicationsCount = fakeDocument.register(createFakeElement('communicationsViewCount'));
        const workspacePanel = fakeDocument.register(createFakeElement('facilitatorWorkspacePanel'));
        global.document = fakeDocument;

        const controller = new ScribeController();
        const actionSlide = {
            slideKey: 'action-live-1',
            slideType: 'action',
            title: 'Live decision'
        };
        const rfiSlide = { slideKey: 'rfi-live-1', slideType: 'rfi', title: 'Clarify the reporting period' };
        const communicationSlide = { slideKey: 'communication-live-1', slideType: 'communication', title: 'White Cell reply' };
        const firstDeckSlide = { n: 1, title: 'Overview', src: 'data:image/png;base64,one' };
        const lastViewedDeckSlide = { n: 2, title: 'Schedule', src: 'data:image/png;base64,two' };
        controller.sections = [{
            id: 'actions',
            label: 'Actions',
            slides: [actionSlide]
        }, {
            id: 'overview',
            label: 'Overview',
            slides: [firstDeckSlide, lastViewedDeckSlide]
        }, {
            id: 'rfis',
            label: 'RFIs',
            slides: [rfiSlide]
        }, {
            id: 'direct-communications',
            label: 'Communications',
            slides: [communicationSlide]
        }];
        controller.deckSlides = [firstDeckSlide, lastViewedDeckSlide, actionSlide, rfiSlide, communicationSlide];
        controller.currentSlideIndex = 1;
        controller.teamRfis = [{ id: 'rfi-live-1' }];
        controller.directCommunications = [{ id: 'communication-live-1' }];
        controller.setSlideByKey = vi.fn();
        controller.closeMobileSidebar = vi.fn();

        controller.updateFacilitatorViewSwitch('deck');
        expect(actionReviewButton.getAttribute('aria-selected')).toBe('false');
        expect(deckButton.getAttribute('aria-selected')).toBe('true');
        expect(rfiButton.getAttribute('aria-selected')).toBe('false');
        expect(communicationsButton.getAttribute('aria-selected')).toBe('false');
        expect(rfiCount.textContent).toBe('1');
        expect(communicationsCount.textContent).toBe('1');
        expect(workspacePanel.getAttribute('aria-labelledby')).toBe('deckViewBtn');
        expect(fakeDocument.body.dataset.facilitatorWorkspace).toBe('deck');

        controller.setFacilitatorView('actions');
        expect(controller.lastDeckSlideKey).toBe('deck-2');
        expect(controller.setSlideByKey).toHaveBeenCalledWith('action-live-1');

        controller.currentSlideIndex = 2;
        controller.setSlideByKey.mockClear();
        controller.setFacilitatorView('rfis');
        expect(controller.setSlideByKey).toHaveBeenCalledWith('rfi-live-1');

        controller.currentSlideIndex = 3;
        controller.setSlideByKey.mockClear();
        controller.setFacilitatorView('communications');
        expect(controller.setSlideByKey).toHaveBeenCalledWith('communication-live-1');

        controller.currentSlideIndex = 4;
        controller.setSlideByKey.mockClear();
        controller.setFacilitatorView('deck');
        expect(controller.setSlideByKey).toHaveBeenCalledWith('deck-2');
        expect(controller.closeMobileSidebar).toHaveBeenCalledTimes(4);
    });

    it('does not let an inbound direct communication steal the active Facilitator workspace', async () => {
        const { ScribeController } = await loadScribeModule();
        const { communicationsStore } = await import('../stores/communications.js');
        const communication = {
            id: 'communication-new-guidance',
            type: 'DIRECT',
            from_role: 'white_cell',
            to_role: 'blue_scribe',
            content: 'New White Cell guidance'
        };
        vi.spyOn(communicationsStore, 'getAll').mockReturnValue([communication]);
        const controller = new ScribeController();
        controller.teamContext = { teamId: 'blue', scribeRole: 'blue_scribe' };
        controller.sections = [{ id: 'actions', slides: [] }];
        controller.deckSlides = [{ slideKey: 'action-live-1', slideType: 'action' }];
        controller.activeFacilitatorView = 'actions';
        controller.getCurrentSlideKey = vi.fn().mockReturnValue('action-live-1');
        controller.rebuildDeck = vi.fn();
        controller.renderSlide = vi.fn();

        controller.syncCommunicationsFromStore({
            event: 'created',
            data: communication
        });

        expect(controller.rebuildDeck).toHaveBeenCalledWith({
            preferredSlideKey: 'action-live-1',
            preferLiveSection: ''
        });
        expect(controller.renderSlide).toHaveBeenCalledTimes(1);

        controller.activeFacilitatorView = 'communications';
        controller.rebuildDeck.mockClear();
        controller.renderSlide.mockClear();
        controller.syncCommunicationsFromStore({
            event: 'created',
            data: communication
        });

        expect(controller.rebuildDeck).toHaveBeenCalledWith({
            preferredSlideKey: 'communication-communication-new-guidance',
            preferLiveSection: 'direct-communications'
        });
        expect(controller.renderSlide).toHaveBeenCalledTimes(1);
    });

    it('does not let a delayed RFI update steal the active Facilitator workspace', async () => {
        const { ScribeController } = await loadScribeModule();
        const { requestsStore } = await import('../stores/requests.js');
        const rfi = {
            id: 'rfi-delayed-answer',
            team: 'industry',
            status: 'responded',
            question: 'When does implementation begin?'
        };
        vi.spyOn(requestsStore, 'getByTeam').mockReturnValue([rfi]);
        const controller = new ScribeController();
        controller.teamId = 'industry';
        controller.sections = [{ id: 'direct-communications', slides: [] }];
        controller.deckSlides = [{
            slideKey: 'communication-live-1',
            slideType: 'communication'
        }];
        controller.activeFacilitatorView = 'communications';
        controller.getCurrentSlideKey = vi.fn().mockReturnValue('communication-live-1');
        controller.rebuildDeck = vi.fn();
        controller.renderSlide = vi.fn();
        controller.loadRfiRevisionHistory = vi.fn().mockResolvedValue([]);

        controller.syncRfisFromStore({
            event: 'responded',
            data: rfi
        });

        expect(controller.rebuildDeck).toHaveBeenCalledWith({
            preferredSlideKey: 'communication-live-1',
            preferLiveSection: ''
        });
        expect(controller.renderSlide).toHaveBeenCalledTimes(1);
        expect(controller.loadRfiRevisionHistory).toHaveBeenCalledTimes(1);

        controller.activeFacilitatorView = 'rfis';
        controller.rebuildDeck.mockClear();
        controller.renderSlide.mockClear();
        controller.syncRfisFromStore({
            event: 'responded',
            data: rfi
        });

        expect(controller.rebuildDeck).toHaveBeenCalledWith({
            preferredSlideKey: 'rfi-rfi-delayed-answer',
            preferLiveSection: 'rfis'
        });
        expect(controller.renderSlide).toHaveBeenCalledTimes(1);
        expect(controller.loadRfiRevisionHistory).toHaveBeenCalledTimes(2);
    });

    it('builds live scribe action slides from forwarded drafts and submitted actions instead of deck images', async () => {
        const { buildScribeActionSlides } = await loadScribeModule();

        const placeholderSlides = buildScribeActionSlides([], {
            teamLabel: 'Blue Team'
        });

        expect(placeholderSlides.slideCount).toBe(0);
        expect(placeholderSlides.slides[0]).toMatchObject({
            slideKey: 'actions-placeholder',
            slideType: 'action-placeholder'
        });

        const liveSlides = buildScribeActionSlides([{
            id: 'action-unforwarded-draft',
            team: 'blue',
            move: 1,
            phase: 1,
            goal: 'Scribe-only draft',
            expected_outcomes: 'This draft has not been handed to the facilitator.',
            mechanism: 'Economic',
            sector: 'Semiconductors',
            exposure_type: 'Supply Chain',
            targets: ['PRC'],
            priority: 'NORMAL',
            status: 'draft',
            created_at: '2026-06-15T09:55:00.000Z',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Hold this draft inside the scribe workspace.'
            })
        }, {
            id: 'action-draft-1',
            team: 'blue',
            move: 1,
            phase: 1,
            goal: 'Coordinate allied export controls',
            description: 'Align export restrictions before the next escalation window.',
            expected_outcomes: 'Demonstrate coalition cohesion while constraining supply access.',
            mechanism: 'Economic',
            sector: 'Semiconductors',
            exposure_type: 'Supply Chain',
            targets: ['PRC', 'Japan'],
            priority: 'HIGH',
            status: 'draft',
            created_at: '2026-06-15T10:00:00.000Z',
            updated_at: '2026-06-15T10:05:00.000Z',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Coordinate allied export controls.',
                levers: ['Export Controls'],
                sectors: ['Semiconductors'],
                implementation: 'Executive Order',
                enforcementTimeline: '6 months',
                scribeHandoff: 'Forwarded',
                notificationTeams: ['Green', 'Industry'],
                notificationNote: 'Share the approved timeline with both teams.'
            })
        }, {
            id: 'action-1',
            team: 'blue',
            move: 1,
            phase: 1,
            goal: 'Lock coalition export threshold',
            description: 'Commit the coalition threshold before White Cell review.',
            expected_outcomes: 'Move the draft into a White Cell ready package.',
            mechanism: 'Economic',
            sector: 'Semiconductors',
            exposure_type: 'Supply Chain',
            targets: ['PRC'],
            priority: 'HIGH',
            status: 'submitted',
            created_at: '2026-06-15T10:00:00.000Z',
            submitted_at: '2026-06-15T10:10:00.000Z'
        }], {
            teamLabel: 'Blue Team'
        });

        expect(liveSlides.slideCount).toBe(2);
        expect(liveSlides.slides.some((slide) => slide.slideKey === 'action-action-unforwarded-draft')).toBe(false);
        expect(liveSlides.slides[0]).toMatchObject({
            slideKey: 'action-action-draft-1',
            slideType: 'action',
            title: 'Coordinate allied export controls',
            sidebarOrdinal: '1',
            sidebarKicker: 'Forwarded to Facilitator | Blue Team | Move 1 | Action 1'
        });
        expect(liveSlides.slides[1]).toMatchObject({
            slideKey: 'action-action-1',
            slideType: 'action',
            sidebarOrdinal: '2',
            sidebarKicker: 'Submitted to White Cell | Blue Team | Move 1 | Action 2'
        });
    });

    it('includes forwarded Strategic Orientation drafts as pre-Move 1 Scribe slides', async () => {
        const { buildScribeActionSlides } = await loadScribeModule();

        const liveSlides = buildScribeActionSlides([{
            id: 'orientation-blue-1',
            team: 'blue',
            move: 1,
            phase: 1,
            goal: 'Blue Team Strategic Orientation: Pressure',
            mechanism: 'Strategic Orientation',
            exposure_type: 'pre_move_1',
            priority: 'HIGH',
            status: 'draft',
            ally_contingencies: serializeStrategicOrientationDetails({
                team: 'blue',
                ownOrientation: 'pressure',
                forecastTargets: [{ key: 'red', orientation: 'stabilization' }],
                forecastActionDescription: 'Red will preserve market access.',
                primaryLevers: ['Expanded financial sanctions'],
                acceptedCosts: ['Sustained economic friction'],
                posture: 'Calibrated \u2014 escalate deliberately',
                scribeHandoff: 'Forwarded'
            })
        }], {
            teamLabel: 'Blue Team'
        });

        expect(liveSlides.slideCount).toBe(1);
        expect(liveSlides.slides[0]).toMatchObject({
            slideKey: 'action-orientation-blue-1',
            slideType: 'strategic-orientation',
            title: 'Blue Team Strategic Orientation: Pressure',
            sidebarOrdinal: 'SO',
            sidebarKicker: 'Forwarded to Facilitator | Pre-Move 1 | Orientation & Forecast'
        });
    });

    it('renders blue action slides as concise participant briefs without adjudication metadata', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        global.document.body.dataset.team = 'blue';
        const controller = new ScribeController();
        const action = {
            id: 'action-2',
            team: 'blue',
            move: 2,
            phase: 1,
            goal: 'Tighten critical-mineral export controls',
            description: 'Align allied licensing thresholds before the next market shock.',
            expected_outcomes: 'Making things not so easy.',
            mechanism: 'Economic',
            sector: 'Biotechnology',
            exposure_type: 'Refinement',
            targets: ['PRC', 'EU'],
            priority: 'HIGH',
            status: 'submitted',
            outcome: 'approved',
            adjudication_notes: 'Keep public messaging aligned with allied licensing language.',
            submitted_at: '2026-06-15T10:10:00.000Z',
            adjudicated_at: '2026-06-15T10:25:00.000Z',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Restrict sensitive mineral processing inputs with allied backing.',
                levers: ['Export Controls', 'Industrial Policy'],
                sectors: ['Biotechnology', 'Agriculture'],
                supplyChainFocusDecision: 'Yes',
                supplyChainActionAngles: ['Disrupt Red'],
                supplyChainAreas: ['Distribution'],
                implementation: 'Legislative',
                legislativeOptions: ['Existing legislation/policy'],
                enforcementTimeline: '6 months',
                coordinated: ['Legislative'],
                informed: ['Allies']
            })
        };

        const html = controller.renderActionSlide({
            slideKey: 'action-action-2',
            slideType: 'action',
            sidebarOrdinal: '1',
            sidebarKicker: 'Blue Team | Move 2 | Action 1',
            action
        });

        expect(html).toContain('Action details');
        expect(html).toContain('Objective:</strong> Restrict sensitive mineral processing inputs with allied backing.');
        expect(html).toContain('data-scribe-action-toggle');
        expect(html).not.toContain('scribe-action-slide is-collapsed');
        expect(html).toContain('aria-expanded="true"');
        expect(html).toContain('Blue Team Action');
        expect(html).toContain('Selected action components');
        expect(html).toContain('Instrument of Power');
        expect(html).toContain('Focus Countries');
        expect(html).toContain('Sectors');
        expect(html).toContain('Implementation');
        expect(html).toContain('Supply Chain Decision');
        expect(html).toContain('Action Angles');
        expect(html).toContain('Supply Chain Areas');
        expect(html).toContain('Legislative Route');
        expect(html).toContain('Existing legislation/policy');
        expect(html).toContain('scribe-action-slide-key-points');
        expect(html).toContain('scribe-action-slide-lead--outcome');
        expect(html).toContain('aria-label="Expected outcome"');
        expect(html).toContain('Making things not so easy.');
        expect(html).toContain('Disrupt Red');
        expect(html).toContain('Distribution');
        expect(html).not.toContain('Action angle: Disrupt Red | Area: Distribution');
        expect(html).not.toContain('Execution snapshot');
        expect(html).not.toContain('Status and White Cell');
        expect(html).not.toContain('White Cell note');
        expect(html).not.toContain('Keep public messaging aligned with allied licensing language.');
        expect(html).toContain('Enforcement Timeline');
        expect(html).toContain('6 months');
        expect(html).not.toContain('Blue Team | Move 2 | Action 1');
    });

    it('moves the projected scribe stage onto a newly forwarded team draft slide', async () => {
        const { ScribeController } = await loadScribeModule();
        const { actionsStore } = await import('../stores/actions.js');
        const controller = new ScribeController();
        const draftAction = {
            id: 'draft-live-1',
            team: controller.teamId,
            move: 1,
            phase: 1,
            goal: 'Project the forwarded draft immediately',
            description: 'Make the forwarded draft visible in the room before submission.',
            status: 'draft',
            created_at: '2026-06-15T10:00:00.000Z',
            updated_at: '2026-06-15T10:05:00.000Z',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Project the forwarded draft immediately.',
                scribeHandoff: 'Forwarded'
            })
        };
        const getByTeamSpy = vi.spyOn(actionsStore, 'getByTeam').mockReturnValue([draftAction]);
        controller.renderSlide = vi.fn();
        controller.facilitatorDeckSlides = [{
            n: 1,
            title: 'Overview',
            src: 'data:image/png;base64,AAA='
        }];
        controller.rebuildDeck();

        expect(controller.getCurrentSlideKey()).toBe('deck-1');

        controller.syncActionsFromStore({
            event: 'created',
            data: draftAction
        });

        expect(controller.getCurrentSlideKey()).toBe('action-draft-live-1');
        expect(controller.renderSlide).toHaveBeenCalled();

        getByTeamSpy.mockRestore();
    });

    it('keeps active Facilitator finalization controls mounted across unchanged live action refreshes', async () => {
        const { ScribeController } = await loadScribeModule();
        const { actionsStore } = await import('../stores/actions.js');
        const controller = new ScribeController();
        const draftAction = {
            id: 'draft-live-stable-1',
            team: controller.teamId,
            move: 1,
            phase: 1,
            goal: 'Keep in-progress finalization choices stable',
            status: 'draft',
            updated_at: '2026-07-16T10:00:00.000Z',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Keep in-progress finalization choices stable.',
                scribeHandoff: 'Forwarded'
            })
        };
        const getByTeamSpy = vi.spyOn(actionsStore, 'getByTeam').mockReturnValue([{
            ...draftAction
        }]);
        controller.teamActions = [draftAction];
        controller.facilitatorDeckSlides = [{
            n: 1,
            title: 'Overview',
            src: 'data:image/png;base64,AAA='
        }];
        controller.rebuildDeck = vi.fn();
        controller.renderSlide = vi.fn();

        controller.syncActionsFromStore({
            event: 'loaded',
            data: [{ ...draftAction }]
        });

        expect(controller.rebuildDeck).not.toHaveBeenCalled();
        expect(controller.renderSlide).not.toHaveBeenCalled();

        getByTeamSpy.mockRestore();
    });

    it('restores in-progress Facilitator finalization choices after a changed live action rerender', async () => {
        const { ScribeController } = await loadScribeModule();
        const controller = new ScribeController();
        const action = {
            id: 'draft-live-changing-1',
            team: controller.teamId,
            status: 'draft',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Keep finalization state while the action snapshot changes.',
                scribeHandoff: 'Forwarded'
            })
        };
        const coordinatedCheckbox = { value: 'Executive', checked: true, disabled: false };
        const informedCheckbox = { value: 'Allies', checked: true, disabled: false };
        const submitButton = {
            hidden: true,
            disabled: true,
            toggleAttribute: vi.fn()
        };
        const panel = {
            dataset: { actionId: action.id },
            matches: () => false,
            querySelector: (selector) => ({
                '[data-scribe-action-radio="coordinated"]:checked': { value: 'yes' },
                '[data-scribe-action-radio="informed-engaged"]:checked': { value: 'yes' },
                '[data-scribe-action-submit]': submitButton
            })[selector] || null,
            querySelectorAll: (selector) => ({
                '[data-scribe-action-checkbox="coordinated"]': [coordinatedCheckbox],
                '[data-scribe-action-checkbox="coordinated"]:checked': [coordinatedCheckbox],
                '[data-scribe-action-checkbox="informed-engaged"]': [informedCheckbox],
                '[data-scribe-action-checkbox="informed-engaged"]:checked': [informedCheckbox]
            })[selector] || []
        };

        controller.updateScribeActionSubmitState(panel);

        const html = controller.renderScribeActionSubmissionControls(action);

        expect(controller.draftActionSelectionsById.get(action.id)).toEqual({
            coordinatedDecision: 'yes',
            coordinatedValues: ['Executive'],
            informedEngagedDecision: 'yes',
            informedValues: ['Allies']
        });
        expect(submitButton).toMatchObject({ hidden: false, disabled: false });
        expect(html).toMatch(/value="yes"[^>]*data-scribe-action-radio="coordinated"[^>]*checked/);
        expect(html).toMatch(/value="Executive"[^>]*data-scribe-action-checkbox="coordinated"[^>]*checked[^>]*>/);
        expect(html).not.toMatch(/value="Executive"[^>]*data-scribe-action-checkbox="coordinated"[^>]*disabled[^>]*>/);
        expect(html).toMatch(/value="yes"[^>]*data-scribe-action-radio="informed-engaged"[^>]*checked/);
        expect(html).toMatch(/value="Allies"[^>]*data-scribe-action-checkbox="informed-engaged"[^>]*checked[^>]*>/);
    });

    it('renders forwarded draft actions as room-ready Facilitator submission slides before White Cell submission', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        global.document.body.dataset.team = 'blue';
        const controller = new ScribeController();
        const action = {
            id: 'action-draft-preview',
            team: 'blue',
            move: 1,
            phase: 1,
            goal: 'Pressure-test the export control package',
            description: 'Review the working package in the room before submission.',
            expected_outcomes: 'Align the room on the pre-submission package.',
            mechanism: 'Economic',
            sector: 'Semiconductors',
            exposure_type: 'Supply Chain',
            targets: ['PRC'],
            priority: 'HIGH',
            status: 'draft',
            created_at: '2026-06-15T09:55:00.000Z',
            updated_at: '2026-06-15T10:05:00.000Z',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Pressure-test the package before it goes to White Cell.',
                levers: ['Export Controls'],
                sectors: ['Semiconductors'],
                implementation: 'Executive',
                enforcementTimeline: 'Immediate',
                scribeHandoff: 'Forwarded',
                coordinated: ['Diplomatic'],
                informed: ['Industry']
            })
        };

        const html = controller.renderActionSlide({
            slideKey: 'action-action-draft-preview',
            slideType: 'action',
            sidebarOrdinal: '1',
            sidebarKicker: 'Forwarded to Facilitator | Blue Team | Move 1 | Action 1',
            action
        });

        expect(html).toContain('Action details');
        expect(html).toContain('Pressure-test the export control package');
        expect(html).toContain('Objective:</strong> Pressure-test the package before it goes to White Cell.');
        expect(html).toContain('data-scribe-action-toggle');
        expect(html).not.toContain('scribe-action-slide is-collapsed');
        expect(html).toContain('aria-expanded="true"');
        expect(html).toContain('Blue Team Action');
        expect(html).toContain('Selected action components');
        expect(html).toContain('aria-label="Expected outcome"');
        expect(html).toContain('Align the room on the pre-submission package.');
        expect(html).not.toContain('Scribe Action for Facilitator');
        expect(html).not.toContain('Forwarded to Facilitator | Blue Team | Move 1 | Action 1');
        expect(html).not.toContain('Draft status');
        expect(html).not.toContain('Draft saved');
        expect(html).not.toContain('Not yet submitted to White Cell');
        expect(html).not.toContain('Awaiting Facilitator submission');
        expect(html).toContain('Enforcement Timeline');
        expect(html).toContain('Immediate');
        expect(html).toContain('Facilitator finalization');
        expect(html).toContain('Project Action');
        expect(html).toContain('Coordinated');
        expect(html).toContain('Informed/Engaged');
        expect(html).toContain('value="Industry"');
        expect(html).toContain('value="Allies"');
        expect(html).toContain('data-scribe-action-submit');
        expect(html).toContain('hidden disabled aria-hidden="true"');
        expect(html).toContain('data-scribe-presentation-toolbar');
        expect(html).toContain('aria-label="Facilitator presentation controls"');
        expect(html).toContain('data-scribe-action-edit');
        expect(html).toContain('>Edit</button>');
        expect(html).toContain('<legend>Coordinated</legend>');
        expect(html).not.toContain('data-scribe-presentation-radio="coordinated"');
        expect(html).toContain('>Legislative</span>');
        expect(html).toContain('>Executive</span>');
        expect(html).toContain('<legend>Informed/Engaged</legend>');
        expect(html).toContain('>Industry</span>');
        expect(html).toContain('>Allies</span>');
        expect(html).toContain('>Forward to White Cell</button>');
        expect(html).toContain('Complete every Yes/No choice to forward.');
    });

    it('renders forwarded Strategic Orientation drafts with project-then-submit controls', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        global.document.body.dataset.team = 'green';
        const controller = new ScribeController();
        const action = {
            id: 'orientation-forecast-preview',
            team: 'green',
            move: 1,
            phase: 1,
            goal: 'Green Team Strategic Orientation: Stabilization',
            mechanism: 'Strategic Orientation',
            exposure_type: 'pre_move_1',
            priority: 'HIGH',
            status: 'draft',
            created_at: '2026-06-15T09:55:00.000Z',
            updated_at: '2026-06-15T10:05:00.000Z',
            ally_contingencies: serializeStrategicOrientationDetails({
                team: 'green',
                ownOrientation: 'stabilization',
                forecastTargets: [{ key: 'blue', orientation: 'reframe' }],
                strategyDescription: 'Green will stabilize exposure while Blue pivots into alliance structure-building.',
                scribeHandoff: 'Forwarded'
            })
        };

        const html = controller.renderActionSlide({
            slideKey: 'action-orientation-forecast-preview',
            slideType: 'strategic-orientation',
            sidebarOrdinal: 'SO',
            sidebarKicker: 'Forwarded to Facilitator | Pre-Move 1 | Orientation & Forecast',
            action
        });

        expect(html).toContain('Strategic Orientation');
        expect(html).toContain('scribe-orientation-slide');
        expect(html).toContain('Orientation and forecasts');
        expect(html).toContain('Develop new alliance and partnership structures');
        expect(html).toContain('Green will stabilize exposure while Blue pivots into alliance structure-building.');
        expect(html).toContain('Facilitator-to-White Cell handoff');
        expect(html).toContain('Project orientation, then send to White Cell');
        expect(html).toContain('Project Strategic Orientation');
        expect(html).toContain('Submit to White Cell');
        expect(html).not.toContain('scribe-action-slide is-collapsed');
        expect(html).not.toContain('data-scribe-action-toggle');
        expect(html).not.toContain('Coordinated tick boxes');
        expect(html).not.toContain('Forwarded to Facilitator | Pre-Move 1 | Forecast');
        expect(html).not.toContain('Draft saved');
        expect(html).not.toContain('White Cell status');
        expect(html).not.toContain('Friend-shoring agreements');
        expect(html).not.toContain('Transitional inefficiencies');
        expect(html).toContain('data-scribe-presentation-toolbar');
        expect(html).toContain('>Edit</button>');
        expect(html).not.toContain('scribe-presentation-toolbar-group');
        expect(html).not.toContain('Coordination and engagement apply to action submissions only.');
        expect(html).toContain('Review the Strategic Orientation with the room, then forward to White Cell.');
        expect(html).toContain('>Forward to White Cell</button>');
    });

    it('renders a submitted presentation toolbar with an explicit read-only White Cell status', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        const controller = new ScribeController();
        const action = {
            id: 'action-submitted-preview',
            status: 'submitted'
        };

        const html = controller.renderPresentationToolbar(action, {
            coordinatedDecision: 'yes',
            informedEngagedDecision: 'yes',
            coordinated: ['Executive'],
            informed: ['Allies']
        });

        expect(html).toContain('Submitted to White Cell.');
        expect(html).not.toContain('This action has already been forwarded.');
        expect(html).toMatch(/data-scribe-action-edit[\s\S]*?data-action-id="action-submitted-preview"[\s\S]*?disabled\s*>Edit<\/button>/);
        expect(html).toMatch(/data-scribe-action-submit[\s\S]*?data-action-id="action-submitted-preview"[\s\S]*?disabled[\s\S]*?>Forward to White Cell<\/button>/);
    });

    it('maps every presentation-toolbar Yes/No choice into the existing action handoff contract', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        const controller = new ScribeController();
        const decisions = {
            'coordinated-legislative': 'yes',
            'coordinated-executive': 'no',
            'informed-industry': 'no',
            'informed-allies': 'yes'
        };
        const toolbar = {
            matches: (selector) => selector === '[data-scribe-presentation-toolbar]',
            querySelector: (selector) => {
                const group = selector.match(/data-scribe-presentation-radio="([^"]+)"/)?.[1];
                return group && decisions[group] ? { value: decisions[group] } : null;
            }
        };

        const selections = controller.getScribeActionSelections(toolbar);

        expect(selections).toEqual(expect.objectContaining({
            coordinatedDecision: 'yes',
            coordinatedValues: ['Legislative'],
            informedEngagedDecision: 'yes',
            informedValues: ['Allies']
        }));
        expect(controller.isPresentationActionSelectionsComplete(selections)).toBe(true);
        expect(controller.isScribeActionSelectionsComplete(selections)).toBe(true);
    });

    it('removes coordination and informed-engaged groups from Green, Red, and Industry toolbars', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        const controller = new ScribeController();
        const css = normalizeLineEndings(readFileSync(SCRIBE_CSS_PATH, 'utf8'));

        ['green', 'red', 'industry'].forEach((teamId) => {
            controller.teamId = teamId;
            const html = controller.renderPresentationToolbar({
                id: `${teamId}-action-toolbar`,
                team: teamId,
                status: 'draft'
            }, {
                coordinatedDecision: 'yes',
                informedEngagedDecision: 'yes',
                coordinated: ['Legislative'],
                informed: ['Industry']
            });
            const selections = controller.getPresentationActionSelections({});

            expect(html).toContain('scribe-presentation-toolbar--handoff-only');
            expect(html).not.toContain('scribe-presentation-toolbar-group');
            expect(html).not.toContain('<legend>Coordinated</legend>');
            expect(html).not.toContain('<legend>Informed/Engaged</legend>');
            expect(html).not.toContain('data-scribe-presentation-radio');
            expect(html).toContain('>Edit</button>');
            expect(html).toContain('Ready to forward to White Cell.');
            expect(html).toContain('>Forward to White Cell</button>');
            expect(selections).toMatchObject({
                coordinatedDecision: 'no',
                coordinatedValues: [],
                informedEngagedDecision: 'no',
                informedValues: []
            });
            expect(controller.isPresentationActionSelectionsComplete(selections)).toBe(true);
            expect(controller.isScribeActionSelectionsComplete(selections)).toBe(true);
        });

        expect(css).toContain(
            'body[data-scribe-presentation="active"] .scribe-presentation-toolbar--handoff-only'
        );
        expect(css).toContain('grid-template-columns: auto minmax(0, 1fr);');
    });

    it('derives a No coordinated decision when both Legislative and Executive are No', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        const controller = new ScribeController();
        const decisions = {
            'coordinated-legislative': 'no',
            'coordinated-executive': 'no',
            'informed-industry': 'yes',
            'informed-allies': 'no'
        };
        const toolbar = {
            matches: (selector) => selector === '[data-scribe-presentation-toolbar]',
            querySelector: (selector) => {
                const group = selector.match(/data-scribe-presentation-radio="([^"]+)"/)?.[1];
                return group && decisions[group] ? { value: decisions[group] } : null;
            }
        };

        const selections = controller.getScribeActionSelections(toolbar);

        expect(selections).toEqual(expect.objectContaining({
            coordinatedDecision: 'no',
            coordinatedValues: [],
            informedEngagedDecision: 'yes',
            informedValues: ['Industry']
        }));
        expect(controller.isPresentationActionSelectionsComplete(selections)).toBe(true);
        expect(controller.isScribeActionSelectionsComplete(selections)).toBe(true);
    });

    it('opens the established action editor for a projected draft', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        const controller = new ScribeController();
        const action = {
            id: 'projected-action-edit',
            team: 'blue',
            status: 'draft',
            goal: 'Edit the projected action'
        };
        const showEditActionModal = vi.fn();
        controller.teamActions = [action];
        controller.actionEditorController = { showEditActionModal };
        controller.isPresentationModeActive = () => false;

        await controller.editProjectedAction(action.id);

        expect(showEditActionModal).toHaveBeenCalledWith(action);
        expect(controller.actionEditorController.actions).toBe(controller.teamActions);
        expect(controller.actionEditorController.isReadOnly).toBe(false);
    });

    it('opens a presentation side panel instead of a modal while presenting', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        const main = global.document.createElement('main');
        main.className = 'scribe-main';
        main.classList.add('scribe-main');
        global.document.body.appendChild(main);

        const controller = new ScribeController();
        const action = {
            id: 'projected-action-live-edit',
            team: 'blue',
            status: 'draft',
            goal: 'Edit live while presenting'
        };
        const mountEditActionInHost = vi.fn();
        controller.teamActions = [action];
        controller.actionEditorController = { mountEditActionInHost, showEditActionModal: vi.fn() };
        controller.isPresentationModeActive = () => true;

        await controller.editProjectedAction(action.id);

        expect(mountEditActionInHost).toHaveBeenCalledWith(action, expect.objectContaining({
            title: 'Edit Action'
        }));
        expect(controller.actionEditorController.showEditActionModal).not.toHaveBeenCalled();
        expect(global.document.body.dataset.scribePresentationEdit).toBe('active');
        expect(global.document.getElementById('scribePresentationEditPanel')).toBeTruthy();
    });

    it('includes forwarded own proposals as proposal-shaped Facilitator slides', async () => {
        const { buildScribeActionSlides } = await loadScribeModule();
        const { serializeProposalDetails, PROPOSAL_SCRIBE_HANDOFF } = await import(
            '../features/actions/proposalDetails.js'
        );

        const draftHidden = {
            id: 'proposal-draft-hidden',
            team: 'green',
            status: 'draft',
            mechanism: 'Proposal',
            goal: 'Hidden draft proposal',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU'],
                objective: 'Draft only',
                category: 'Partnership',
                intendedPartners: 'Partners',
                delivery: 'Joint Statement',
                timingAndConditions: 'Soon',
                recipientTeam: 'blue',
                scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.DRAFT
            })
        };
        const forwarded = {
            id: 'proposal-forwarded-visible',
            team: 'green',
            status: 'draft',
            mechanism: 'Proposal',
            goal: 'Visible forwarded proposal',
            sector: 'Biotechnology',
            expected_outcomes: 'Durable alignment',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU', 'UK'],
                objective: 'Coordinate export posture',
                category: 'Alignment',
                intendedPartners: 'ASEAN',
                delivery: 'Diplomatic Engagement',
                timingAndConditions: 'This move',
                recipientTeam: 'blue',
                scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.FORWARDED
            })
        };

        const slides = buildScribeActionSlides([draftHidden, forwarded], { teamLabel: 'Green Team' });
        expect(slides.slideCount).toBe(1);
        expect(slides.slides[0]).toEqual(expect.objectContaining({
            slideType: 'own-proposal',
            title: 'Visible forwarded proposal',
            sidebarOrdinal: 'P'
        }));
        expect(slides.slides[0].sidebarKicker).toContain('Proposal → Blue');
    });

    it('renders own proposal slides with presentation Edit and Forward controls', async () => {
        const { ScribeController } = await loadScribeModule();
        const { serializeProposalDetails, PROPOSAL_SCRIBE_HANDOFF } = await import(
            '../features/actions/proposalDetails.js'
        );
        global.document = createFakeDocument();
        const controller = new ScribeController();
        controller.teamId = 'green';
        controller.teamLabel = 'Green Team';

        const action = {
            id: 'own-proposal-slide',
            team: 'green',
            status: 'draft',
            mechanism: 'Proposal',
            goal: 'Green proposal for Blue',
            sector: 'Agriculture',
            expected_outcomes: 'Joint delivery',
            ally_contingencies: serializeProposalDetails({
                originators: ['France'],
                objective: 'Secure food-system resilience',
                category: 'Partnership',
                intendedPartners: 'Selected partners',
                delivery: 'Multilateral Forum',
                timingAndConditions: 'Current move',
                recipientTeam: 'blue',
                scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.FORWARDED
            })
        };

        const html = controller.renderActionSlide({
            slideKey: `action-${action.id}`,
            slideType: 'own-proposal',
            action,
            proposalViewModel: undefined
        });

        expect(html).toContain('Green Team Proposal');
        expect(html).toContain('Green proposal for Blue');
        expect(html).toContain('Secure food-system resilience');
        expect(html).toContain('data-scribe-action-edit');
        expect(html).toContain('Forward to White Cell');
        expect(html).toContain('Review the proposal with the room, then forward to White Cell.');
        expect(html).not.toContain('scribe-presentation-toolbar-group');
    });

    it('keeps the proposing Facilitator informed when a proposal is accepted, declined, or sent to negotiation', async () => {
        const { ScribeController } = await loadScribeModule();
        const { communicationsStore } = await import('../stores/communications.js');
        const { serializeProposalDetails, PROPOSAL_SCRIBE_HANDOFF } = await import(
            '../features/actions/proposalDetails.js'
        );
        global.document = createFakeDocument();
        const getAll = vi.spyOn(communicationsStore, 'getAll');
        const controller = new ScribeController();
        controller.teamId = 'green';
        controller.teamLabel = 'Green Team';
        const action = {
            id: 'proposal-process-visible',
            team: 'green',
            status: 'submitted',
            mechanism: 'Proposal',
            goal: 'Regional Food Security Compact',
            ally_contingencies: serializeProposalDetails({
                originators: ['Green Team'],
                objective: 'Coordinate regional food resilience.',
                category: 'Partnership',
                intendedPartners: 'Red Team',
                delivery: 'Joint statement',
                timingAndConditions: 'Before Move 3',
                recipientTeam: 'red',
                scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.FORWARDED
            })
        };
        const forwardedProposal = {
            id: 'proposal-forwarded-process-visible',
            type: 'PROPOSAL_FORWARDED',
            metadata: {
                source_proposal_id: action.id,
                source_team: 'green',
                recipient_team: 'red',
                proposal: { title: action.goal }
            }
        };
        const renderWithRecipientState = (proposalRecipientState) => {
            getAll.mockReturnValue([{
                ...forwardedProposal,
                metadata: {
                    ...forwardedProposal.metadata,
                    proposal_recipient_state: proposalRecipientState
                }
            }]);
            return controller.renderActionSlide({
                slideKey: `action-${action.id}`,
                slideType: 'own-proposal',
                action
            });
        };

        const acceptedHtml = renderWithRecipientState({
            status: 'responded',
            facilitator_decision: 'accept',
            response_content: 'Accepted',
            response_sent_at: '2026-07-23T12:00:00.000Z'
        });
        const declinedHtml = renderWithRecipientState({
            status: 'declined',
            facilitator_decision: 'not_interested',
            response_content: 'Not Interested',
            response_sent_at: '2026-07-23T12:05:00.000Z'
        });
        const negotiationHtml = renderWithRecipientState({
            status: 'responded',
            facilitator_decision: 'negotiate',
            response_content: 'Add a six-month review clause.',
            response_sent_at: '2026-07-23T12:10:00.000Z'
        });

        expect(acceptedHtml).toContain('Proposal process');
        expect(acceptedHtml).toContain('<strong>Current stage:</strong> Accepted');
        expect(acceptedHtml).toContain('Red Team accepted this proposal.');
        expect(declinedHtml).toContain('<strong>Current stage:</strong> Declined');
        expect(declinedHtml).toContain('Red Team recorded Not Interested and declined this proposal.');
        expect(negotiationHtml).toContain('<strong>Current stage:</strong> Negotiation requested');
        expect(negotiationHtml).toContain('Red Team wants to negotiate this proposal.');
        expect(negotiationHtml).toContain('<strong>Negotiation terms:</strong>');
        expect(negotiationHtml).toContain('Add a six-month review clause.');
        expect(negotiationHtml).toContain('role="status" aria-live="polite"');
    });

    it('alerts the proposing Facilitator once when a recipient decision arrives', async () => {
        const { ScribeController } = await loadScribeModule();
        const { communicationsStore } = await import('../stores/communications.js');
        const { showToast } = await import('../components/ui/Toast.js');
        global.document = createFakeDocument();
        const getAll = vi.spyOn(communicationsStore, 'getAll');
        const controller = new ScribeController();
        controller.durableNotifications = { notify: vi.fn(() => ({})) };
        controller.teamId = 'green';
        controller.teamActions = [{
            id: 'proposal-alert-source',
            team: 'green',
            goal: 'Regional Food Security Compact'
        }];
        controller.renderAlerts = vi.fn();
        const pending = {
            id: 'proposal-alert-forwarded',
            type: 'PROPOSAL_FORWARDED',
            created_at: '2026-07-23T12:00:00.000Z',
            metadata: {
                source_proposal_id: 'proposal-alert-source',
                source_team: 'green',
                recipient_team: 'blue',
                proposal: { title: 'Regional Food Security Compact' },
                proposal_recipient_state: { status: 'unread' }
            }
        };
        const negotiated = {
            ...pending,
            updated_at: '2026-07-23T12:05:00.000Z',
            metadata: {
                ...pending.metadata,
                proposal_recipient_state: {
                    status: 'responded',
                    facilitator_decision: 'negotiate',
                    response_content: 'Add a six-month review clause.',
                    response_sent_at: '2026-07-23T12:05:00.000Z'
                }
            }
        };

        getAll.mockReturnValue([pending]);
        controller.processCommunicationNotifications('initialized');
        expect(controller.notifications).toHaveLength(0);

        getAll.mockReturnValue([negotiated]);
        controller.processCommunicationNotifications('updated');
        controller.processCommunicationNotifications('updated');

        expect(controller.notifications).toHaveLength(1);
        expect(controller.notifications[0]).toMatchObject({
            title: 'Negotiation requested',
            detail: 'Blue Team requested negotiation on "Regional Food Security Compact". Open the proposal to review the terms.',
            slideKey: 'action-proposal-alert-source'
        });
        expect(controller.unreadNotifications).toBe(1);
        expect(controller.durableNotifications.notify).toHaveBeenCalledTimes(1);
        expect(showToast).not.toHaveBeenCalled();
    });

    it('presents every Industry Scribe proposal field to the Industry Facilitator for review', async () => {
        const { ScribeController, buildScribeActionSlides } = await loadScribeModule();
        const { serializeProposalDetails, PROPOSAL_SCRIBE_HANDOFF } = await import(
            '../features/actions/proposalDetails.js'
        );
        global.document = createFakeDocument();
        const controller = new ScribeController();
        controller.teamId = 'industry';
        controller.teamLabel = 'Industry Team';

        const action = {
            id: 'industry-proposal-full-detail',
            team: 'industry',
            status: 'draft',
            mechanism: 'Proposal',
            goal: 'Critical Infrastructure Investment Compact',
            sector: 'Critical minerals and logistics',
            expected_outcomes: 'Near term: align financing. Long term: reduce infrastructure exposure.',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU', 'Japan'],
                objective: 'Coordinate private capital and insurance capacity.',
                instruments: ['Economic', 'Information', 'Standards and insurance'],
                intendedPartners: 'Blue Team and ASEAN partners',
                delivery: 'Industry-led investment forum',
                timingAndConditions: 'Launch in Move 2 after White Cell approval.',
                recipientTeam: 'blue',
                scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.FORWARDED
            })
        };

        const slides = buildScribeActionSlides([action], { teamLabel: 'Industry Team' });
        const html = controller.renderActionSlide(slides.slides[0]);

        expect(slides).toMatchObject({
            slideCount: 1,
            slides: [expect.objectContaining({
                slideType: 'own-proposal',
                title: 'Critical Infrastructure Investment Compact'
            })]
        });
        expect(html).toContain('Industry Team proposal details for presentation and review');
        expect(html).toContain('Full proposal details');
        expect(html).toContain('Critical Infrastructure Investment Compact');
        expect(html).toContain('>Objective</p>');
        expect(html).toContain('Coordinate private capital and insurance capacity.');
        expect(html).toContain('Originators');
        expect(html).toContain('EU, Japan');
        expect(html).toContain('Instrument of Power');
        expect(html).toContain('Economic, Information, Standards and insurance');
        expect(html).toContain('Intended Partners');
        expect(html).toContain('Blue Team and ASEAN partners');
        expect(html).toContain('Focus Sectors');
        expect(html).toContain('Critical minerals and logistics');
        expect(html).toContain('>Delivery (historical)</p>');
        expect(html).toContain('Industry-led investment forum');
        expect(html).toContain('Timing &amp; Conditions');
        expect(html).toContain('Launch in Move 2 after White Cell approval.');
        expect(html).toContain('Expected Outcome(s) &amp; Duration Assessment');
        expect(html).toContain('Near term: align financing. Long term: reduce infrastructure exposure.');
        expect(html).toContain('Intended recipient: Blue Team');
        expect(html).toContain('data-scribe-action-edit');
        expect(html).toContain('Forward to White Cell');
        expect(html).not.toContain('Proposal Category');
    });

    it('presents a returned proposal as the same editable revision with reviewer notes', async () => {
        const { ScribeController } = await loadScribeModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        global.document = createFakeDocument();
        const controller = new ScribeController();
        controller.teamId = 'green';
        controller.teamLabel = 'Green Team';
        const action = {
            id: 'proposal-stable-1',
            team: 'green',
            status: 'draft',
            workflow_state: 'returned_to_team',
            revision_number: 2,
            review_notes: 'Clarify the accountable owner.',
            mechanism: 'Proposal',
            goal: 'Dual-partner capacity proposal',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU'],
                objective: 'Build shared capacity.',
                recipientTeams: ['blue', 'red'],
                focusSectors: ['Biotechnology'],
                supplyChainFocusDecision: 'No',
                scribeHandoff: 'Forwarded'
            })
        };

        const html = controller.renderOwnProposalSlide({ action }, undefined);

        expect(html).toContain('Intended recipient: Blue Team, Red Team');
        expect(html).toContain('Returned by White Cell');
        expect(html).toContain('Clarify the accountable owner.');
        expect(html).toContain('<strong>Revision:</strong> 2');
        expect(html).toContain('<strong>Proposal ID:</strong> proposal-stable-1');
        expect(html).toContain('Resubmit to White Cell');
    });

    it('resubmits a returned proposal by updating its existing logical identity', async () => {
        const { ScribeController } = await loadScribeModule();
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const { database } = await import('../services/database.js');
        const { actionsStore } = await import('../stores/actions.js');
        const { timelineStore } = await import('../stores/timeline.js');
        const { showToast } = await import('../components/ui/Toast.js');
        global.document = createFakeDocument();
        const submitAction = vi.spyOn(database, 'submitAction').mockResolvedValue({
            id: 'proposal-stable-1',
            session_id: 'session-proposal-revision',
            team: 'green',
            status: 'submitted',
            workflow_state: 'resubmitted',
            revision_number: 2,
            goal: 'Dual-partner capacity proposal'
        });
        vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({
            id: 'timeline-proposal-resubmitted',
            type: 'PROPOSAL_SUBMITTED'
        });
        const actionUpdate = vi.spyOn(actionsStore, 'updateFromServer').mockImplementation(() => {});
        const timelineUpdate = vi.spyOn(timelineStore, 'updateFromServer').mockImplementation(() => {});
        const controller = new ScribeController();
        controller.teamId = 'green';
        controller.teamLabel = 'Green Team';
        const action = {
            id: 'proposal-stable-1',
            session_id: 'session-proposal-revision',
            team: 'green',
            status: 'draft',
            workflow_state: 'returned_to_team',
            revision_number: 2,
            mechanism: 'Proposal',
            goal: 'Dual-partner capacity proposal',
            ally_contingencies: serializeProposalDetails({
                recipientTeams: ['blue', 'red'],
                focusSectors: ['Biotechnology'],
                supplyChainFocusDecision: 'No',
                scribeHandoff: 'Forwarded'
            })
        };

        await controller.submitScribeProposal(action);

        expect(submitAction).toHaveBeenCalledWith('proposal-stable-1');
        expect(actionUpdate).toHaveBeenCalledWith('UPDATE', expect.objectContaining({
            id: 'proposal-stable-1',
            revision_number: 2,
            workflow_state: 'resubmitted'
        }));
        expect(database.createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                related_id: 'proposal-stable-1',
                recipient_teams: ['blue', 'red'],
                revision_number: 2
            })
        }));
        expect(timelineUpdate).toHaveBeenCalledWith('INSERT', expect.objectContaining({
            id: 'timeline-proposal-resubmitted'
        }));
        expect(showToast).toHaveBeenCalledWith({
            message: 'Proposal revision resubmitted to White Cell for Blue Team, Red Team.',
            type: 'success'
        });
    });

    it('shows each selected Strategic Orientation component once without lifecycle repetition', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        global.document.body.dataset.team = 'blue';
        const controller = new ScribeController();
        const action = {
            id: 'orientation-selection-preview',
            team: 'blue',
            move: 1,
            phase: 1,
            goal: 'Blue Team Strategic Orientation: Pressure',
            mechanism: 'Strategic Orientation',
            exposure_type: 'pre_move_1',
            priority: 'HIGH',
            status: 'draft',
            updated_at: '2026-07-15T11:45:00.000Z',
            ally_contingencies: serializeStrategicOrientationDetails({
                team: 'blue',
                ownOrientation: 'pressure',
                forecastTargets: [{ key: 'red', orientation: 'stabilization' }],
                forecastActionDescription: 'Red will preserve market access while limiting escalation.',
                primaryLevers: ['Expanded financial sanctions'],
                acceptedCosts: ['Sustained economic friction'],
                posture: 'Calibrated — escalate deliberately',
                scribeHandoff: 'Forwarded'
            })
        };

        const html = controller.renderActionSlide({
            slideKey: 'action-orientation-selection-preview',
            slideType: 'strategic-orientation',
            sidebarOrdinal: 'SO',
            sidebarKicker: 'Forwarded to Facilitator | Pre-Move 1 | Orientation & Forecast',
            action
        });

        expect(html).toContain('Orientation and forecasts');
        expect(html).toContain('Own Orientation');
        expect(html).toContain('Red Forecast');
        expect(html).toContain('Expected Target Actions');
        expect(html).toContain('Primary levers');
        expect(html).toContain('Expanded financial sanctions');
        expect(html).toContain('Accepted costs');
        expect(html).toContain('Sustained economic friction');
        expect(html).toContain('Posture');
        expect(html).toContain('Calibrated — escalate deliberately');
        expect(html).toContain('Red will preserve market access while limiting escalation.');
        expect(html.match(/Expanded financial sanctions/g)).toHaveLength(1);
        expect(html.match(/Sustained economic friction/g)).toHaveLength(1);
        expect(html.match(/Red will preserve market access while limiting escalation\./g)).toHaveLength(1);
        expect(html).not.toContain('Orientation record');
        expect(html).not.toContain('Status and White Cell');
        expect(html).not.toContain('Forwarded to Facilitator | Pre-Move 1 | Selection');
        expect(html).not.toContain('Jul 15, 2026');
    });

    it('renders Red multi-target Strategic Orientation forecasts with Blue and Green forecast rows', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        global.document.body.dataset.team = 'red';
        const controller = new ScribeController();
        const action = {
            id: 'orientation-forecast-red-multi',
            team: 'red',
            move: 1,
            phase: 1,
            goal: 'Red Team Strategic Orientation: Reframe',
            mechanism: 'Strategic Orientation',
            exposure_type: 'pre_move_1',
            priority: 'HIGH',
            status: 'draft',
            created_at: '2026-06-15T09:55:00.000Z',
            updated_at: '2026-06-15T10:05:00.000Z',
            ally_contingencies: serializeStrategicOrientationDetails({
                team: 'red',
                ownOrientation: 'reframe',
                forecastTargets: [
                    { key: 'blue', orientation: 'pressure' },
                    { key: 'green_asian_pacific', orientation: 'reframe' },
                    { key: 'green_europe', orientation: 'stabilization' }
                ],
                orientationRationale: 'Red reframes its own posture while forecasting the other teams.',
                scribeHandoff: 'Forwarded'
            })
        };

        const html = controller.renderActionSlide({
            slideKey: 'action-orientation-forecast-red-multi',
            slideType: 'strategic-orientation',
            sidebarOrdinal: 'SO',
            sidebarKicker: 'Forwarded to Facilitator | Pre-Move 1 | Orientation & Forecast',
            action
        });

        expect(html).toContain('Orientation and forecasts');
        expect(html).toContain('Blue');
        expect(html).toContain('Pressure');
        expect(html).toContain('Green (Asian Pacific)');
        expect(html).toContain('Reframe');
        expect(html).toContain('Green (Europe)');
        expect(html).toContain('Stabilization');
        expect(html).toContain('Red reframes its own posture while forecasting the other teams.');
    });

    it('requires scribe yes/no decisions and selected tick boxes before showing submit', async () => {
        const { ScribeController } = await loadScribeModule();
        const controller = new ScribeController();

        expect(controller.isScribeActionSelectionsComplete({
            coordinatedDecision: '',
            informedEngagedDecision: '',
            coordinatedValues: [],
            informedValues: []
        })).toBe(false);

        expect(controller.isScribeActionSelectionsComplete({
            coordinatedDecision: 'yes',
            informedEngagedDecision: 'yes',
            coordinatedValues: ['Legislative'],
            informedValues: []
        })).toBe(false);

        expect(controller.isScribeActionSelectionsComplete({
            coordinatedDecision: 'no',
            informedEngagedDecision: 'yes',
            coordinatedValues: [],
            informedValues: ['Industry']
        })).toBe(true);
    });

    it('submits completed action details from the facilitator to White Cell', async () => {
        const { ScribeController } = await loadScribeModule();
        const { actionsStore } = await import('../stores/actions.js');
        const { timelineStore } = await import('../stores/timeline.js');
        const actionsStoreSpy = vi.spyOn(actionsStore, 'updateFromServer');
        const timelineStoreSpy = vi.spyOn(timelineStore, 'updateFromServer');
        const action = {
            id: 'action-scribe-submit',
            session_id: 'session-scribe-submit',
            team: 'blue',
            move: 1,
            phase: 2,
            goal: 'Submit through the facilitator',
            expected_outcomes: 'White Cell receives only the completed action.',
            mechanism: 'Economic',
            sector: 'Biotechnology',
            exposure_type: 'Refinement',
            targets: ['PRC'],
            priority: 'NORMAL',
            status: 'draft',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Keep the facilitator in the action submission loop.',
                instruments: ['Economic', 'Diplomacy', 'Information', 'Military'],
                levers: ['Export Controls'],
                sectors: ['Biotechnology'],
                supplyChainFocusDecision: 'Yes',
                supplyChainActionAngles: ['Build resilience for Blue', 'Disrupt Red'],
                supplyChainAreas: ['Refinement', 'Distribution'],
                implementation: 'Legislative',
                legislativeOptions: ['Existing legislation/policy'],
                enforcementTimeline: '6 months',
                scribeHandoff: 'Forwarded',
                notificationTeams: ['Green', 'Industry'],
                notificationNote: 'Share the approved timeline with both teams.'
            })
        };
        const updatedDraft = {
            ...action,
            ally_contingencies: 'completed-details'
        };
        const submittedAction = {
            ...updatedDraft,
            status: 'submitted',
            submitted_at: '2026-06-15T10:20:00.000Z'
        };
        mockUpdateDraftAction.mockResolvedValue(updatedDraft);
        mockSubmitAction.mockResolvedValue(submittedAction);
        mockCreateTimelineEvent.mockResolvedValue({
            id: 'timeline-scribe-submit',
            session_id: action.session_id,
            type: 'ACTION_SUBMITTED',
            content: 'Action submitted to White Cell by Facilitator: Submit through the facilitator',
            team: 'blue',
            move: 1,
            phase: 2
        });

        global.document = createFakeDocument();
        global.document.body.dataset.team = 'blue';
        const controller = new ScribeController();
        controller.role = 'blue_scribe';
        controller.teamId = 'blue';

        await controller.submitScribeAction(action, {
            coordinatedDecision: 'yes',
            coordinatedValues: ['Legislative'],
            informedEngagedDecision: 'yes',
            informedValues: ['Industry', 'Allies']
        });

        expect(mockUpdateDraftAction).toHaveBeenCalledWith('action-scribe-submit', {
            ally_contingencies: expect.stringContaining('Coordinated Decision: Yes')
        });
        expect(mockUpdateDraftAction.mock.calls[0][1].ally_contingencies).toContain('Scribe Handoff: Forwarded');
        expect(mockUpdateDraftAction.mock.calls[0][1].ally_contingencies).toContain(
            'Instruments: ["Economic","Diplomacy","Information","Military"]'
        );
        expect(mockUpdateDraftAction.mock.calls[0][1].ally_contingencies).toContain(
            'Supply Chain Action Angles: ["Build resilience for Blue","Disrupt Red"]'
        );
        expect(mockUpdateDraftAction.mock.calls[0][1].ally_contingencies).toContain(
            'Supply Chain Areas: ["Refinement","Distribution"]'
        );
        expect(mockUpdateDraftAction.mock.calls[0][1].ally_contingencies).toContain('Coordinated: ["Legislative"]');
        expect(mockUpdateDraftAction.mock.calls[0][1].ally_contingencies).toContain('Informed/Engaged Decision: Yes');
        expect(mockUpdateDraftAction.mock.calls[0][1].ally_contingencies).toContain('Informed: ["Industry","Allies"]');
        expect(mockUpdateDraftAction.mock.calls[0][1].ally_contingencies).toContain('Notification Teams: ["Green","Industry"]');
        expect(mockUpdateDraftAction.mock.calls[0][1].ally_contingencies).toContain('Notification Note: Share the approved timeline with both teams.');
        expect(mockSubmitAction).toHaveBeenCalledWith('action-scribe-submit');
        expect(mockCreateTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'ACTION_SUBMITTED',
            content: 'Action submitted to White Cell by Facilitator: Submit through the facilitator',
            metadata: expect.objectContaining({
                submitted_by: 'facilitator',
                legacy_submitted_by: 'scribe',
                coordinated: {
                    decision: 'Yes',
                    legislative: true,
                    executive: false
                },
                informed_engaged: {
                    decision: 'Yes',
                    industry: true,
                    allies: true
                }
            })
        }));
        expect(actionsStoreSpy).toHaveBeenCalledWith('UPDATE', updatedDraft);
        expect(actionsStoreSpy).toHaveBeenCalledWith('UPDATE', submittedAction);
        expect(timelineStoreSpy).toHaveBeenCalledWith('INSERT', expect.objectContaining({
            id: 'timeline-scribe-submit'
        }));
    });

    it('shows returned notes and revision, then resubmits that revision only once', async () => {
        const { ScribeController } = await loadScribeModule();
        global.document = createFakeDocument();
        global.document.body.dataset.team = 'blue';
        const returnedAction = {
            id: 'action-returned-2',
            session_id: 'session-returned-2',
            team: 'blue',
            move: 2,
            phase: 1,
            goal: 'Correct the returned licensing action',
            status: 'draft',
            workflow_state: 'returned_to_team',
            revision_number: 2,
            review_notes: 'Name the Green liaison and tighten the notice timing.',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Correct the licensing action.',
                scribeHandoff: 'Forwarded',
                notificationTeams: ['Green'],
                notificationNote: 'Notify Green after the correction is accepted.'
            })
        };
        const updatedDraft = { ...returnedAction };
        const resubmittedAction = {
            ...returnedAction,
            status: 'submitted',
            workflow_state: 'resubmitted'
        };
        mockUpdateDraftAction.mockResolvedValue(updatedDraft);
        mockSubmitAction.mockResolvedValue(resubmittedAction);
        mockCreateTimelineEvent.mockResolvedValue({ id: 'timeline-resubmitted-2' });
        const controller = new ScribeController();
        controller.teamId = 'blue';
        controller.teamLabel = 'Blue Team';

        const markup = controller.renderActionSlide({
            slideKey: 'action-action-returned-2',
            slideType: 'action',
            action: returnedAction
        });

        expect(markup).toContain('Returned by White Cell');
        expect(markup).toContain('Name the Green liaison and tighten the notice timing.');
        expect(markup).toContain('<strong>Revision:</strong> 2');
        expect(markup).toContain('Resubmit to White Cell');
        expect(markup).toContain('Notify Green after the correction is accepted.');

        const selections = {
            coordinatedDecision: 'no',
            coordinatedValues: [],
            informedEngagedDecision: 'no',
            informedValues: []
        };
        await controller.submitScribeAction(returnedAction, selections);
        await controller.submitScribeAction(resubmittedAction, selections);

        expect(mockUpdateDraftAction).toHaveBeenCalledTimes(1);
        expect(mockSubmitAction).toHaveBeenCalledTimes(1);
        expect(mockSubmitAction).toHaveBeenCalledWith('action-returned-2');
        expect(mockCreateTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                revision_number: 2,
                workflow_state: 'resubmitted'
            })
        }));
    });

    it('submits Strategic Orientation drafts from Facilitator to White Cell without Blue coordination rewrites', async () => {
        const { ScribeController } = await loadScribeModule();
        const { actionsStore } = await import('../stores/actions.js');
        const { timelineStore } = await import('../stores/timeline.js');
        const actionsStoreSpy = vi.spyOn(actionsStore, 'updateFromServer');
        const timelineStoreSpy = vi.spyOn(timelineStore, 'updateFromServer');
        const action = {
            id: 'orientation-scribe-submit',
            session_id: 'session-scribe-submit',
            team: 'red',
            move: 1,
            phase: 1,
            goal: 'Red Forecast: Blue Pressure',
            mechanism: 'Strategic Orientation',
            exposure_type: 'pre_move_1',
            priority: 'HIGH',
            status: 'draft',
            ally_contingencies: serializeStrategicOrientationDetails({
                artifactType: 'forecast',
                team: 'red',
                orientation: 'pressure',
                primaryLevers: ['Expanded financial sanctions'],
                acceptedCosts: ['Elevated escalation risk'],
                posture: 'Assertive \u2014 accept elevated escalation',
                scribeHandoff: 'Forwarded'
            })
        };
        const submittedAction = {
            ...action,
            status: 'submitted',
            submitted_at: '2026-06-15T10:20:00.000Z'
        };
        mockSubmitAction.mockResolvedValue(submittedAction);
        mockCreateTimelineEvent.mockResolvedValue({
            id: 'timeline-orientation-submit',
            session_id: action.session_id,
            type: 'STRATEGIC_ORIENTATION_SUBMITTED',
            content: 'Strategic Orientation submitted to White Cell by Facilitator: Red Forecast: Blue Pressure',
            team: 'red',
            move: 1,
            phase: 1
        });

        global.document = createFakeDocument();
        global.document.body.dataset.team = 'red';
        const controller = new ScribeController();
        controller.role = 'red_scribe';
        controller.teamId = 'red';

        await controller.submitScribeAction(action);

        expect(mockUpdateDraftAction).not.toHaveBeenCalled();
        expect(mockSubmitAction).toHaveBeenCalledWith('orientation-scribe-submit');
        expect(mockCreateTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'STRATEGIC_ORIENTATION_SUBMITTED',
            metadata: expect.objectContaining({
                submitted_by: 'facilitator',
                legacy_submitted_by: 'scribe',
                strategic_orientation: true,
                artifact_type: 'forecast',
                orientation: 'pressure'
            })
        }));
        expect(actionsStoreSpy).toHaveBeenCalledWith('UPDATE', submittedAction);
        expect(timelineStoreSpy).toHaveBeenCalledWith('INSERT', expect.objectContaining({
            id: 'timeline-orientation-submit'
        }));
    });

    it('ships a standalone blue scribe html shell with live session state ids and requested sidebar labels', () => {
        const html = readFileSync(BLUE_SCRIBE_HTML_PATH, 'utf8');

        expect(html).toContain('<title>Statecraft Sim | Blue Team Facilitator</title>');
        expect(html).toContain('content="Statecraft Sim Blue Team facilitator support deck."');
        expect(html).toContain('data-scribe-presentation="standard"');
        expect(html).toContain('data-action-mark-layout="horizontal-rail"');
        expect(html).toContain('../../styles/components/badges.css');
        expect(html).toContain('../../styles/components/cards.css');
        expect(html).toContain('../../styles/components/modals.css');
        expect(html).toContain('<header class="page-header" id="pageHeader">');
        expect(html).toContain('class="header-session-info"');
        expect(html).toContain('id="sessionName"');
        expect(html).toContain('id="headerMove"');
        expect(html).toContain('id="headerPhase"');
        expect(html).toContain('id="timerDisplay"');
        expect(html).toContain('id="scribeSectionList"');
        expect(html).toContain('<nav class="scribe-section-nav" aria-label="Facilitator workspace navigation">');
        expect(html).toContain('id="facilitatorWorkspacePanel" role="tabpanel" aria-labelledby="deckViewBtn" tabindex="0"');
        expect(html).toContain('id="deckSlideImage"');
        expect(html).toContain('id="deckActionFrame"');
        expect(html).toContain('id="slideAnnouncement"');
        expect(html).not.toContain('scribe-sidebar-header');
        expect(html).not.toContain('scribe-stage-hero');
        expect(html).not.toContain('scribe-stage-toolbar');
        expect(html).not.toContain('scribe-stage-footer');
        expect(html).not.toContain('scribe-section-trigger-description');
    });

    it('ships four accessible facilitator workspace tabs on every team shell', () => {
        for (const path of [
            BLUE_SCRIBE_HTML_PATH,
            GREEN_SCRIBE_HTML_PATH,
            INDUSTRY_SCRIBE_HTML_PATH,
            RED_SCRIBE_HTML_PATH
        ]) {
            const html = readFileSync(path, 'utf8');
            expect(html).toContain('../../styles/components/cards.css');

            expect(html).toContain('aria-label="Facilitator workspace navigation"');
            expect(html).toContain('class="scribe-view-switch" role="tablist" aria-label="Facilitator workspace"');
            expect(html).toContain('id="teamActionReviewViewBtn" type="button" role="tab" aria-selected="false"');
            expect(html).toContain('id="deckViewBtn" type="button" role="tab" aria-selected="true"');
            expect(html).toContain('id="rfiViewBtn" type="button" role="tab" aria-selected="false"');
            expect(html).toContain('id="communicationsViewBtn" type="button" role="tab" aria-selected="false"');
            expect(html).toContain('id="rfiViewCount" aria-hidden="true">0</span>');
            expect(html).toContain('id="communicationsViewCount" aria-hidden="true">0</span>');
            expect(html).not.toContain('aria-label="Facilitator deck sections"');
        }
    });

    it('ships every team facilitator alert surface as a real keyboard dialog', () => {
        for (const path of [
            BLUE_SCRIBE_HTML_PATH,
            GREEN_SCRIBE_HTML_PATH,
            INDUSTRY_SCRIBE_HTML_PATH,
            RED_SCRIBE_HTML_PATH
        ]) {
            const html = readFileSync(path, 'utf8');

            expect(html).toContain('id="scribeAlertsBtn" type="button" aria-haspopup="dialog" aria-controls="scribeAlertsPanel" aria-expanded="false"');
            expect(html).toContain('id="scribeAlertsPanel" role="dialog" aria-modal="true" aria-labelledby="scribeAlertsTitle" tabindex="-1" hidden');
            expect(html).toContain('id="scribeAlertsTitle"');
            expect(html).toContain('id="scribeAlertsClose"');
        }
    });

    it('loads the shared modal, form, and grid styles on every team facilitator shell', () => {
        for (const path of [
            BLUE_SCRIBE_HTML_PATH,
            GREEN_SCRIBE_HTML_PATH,
            INDUSTRY_SCRIBE_HTML_PATH,
            RED_SCRIBE_HTML_PATH
        ]) {
            const html = readFileSync(path, 'utf8');

            expect(html).toContain('../../styles/components/modals.css');
            expect(html).toContain('../../styles/components/forms.css');
            expect(html).toContain('../../styles/layouts/grid.css');
            expect(html).toContain('id="pageRefreshBtn"');
            expect(html).toContain('data-page-refresh');
            expect(html).toContain('id="logoutBtn"');
        }
    });

    it('styles the persistent scribe guide above the session footer and hides it in collapsed rail mode', () => {
        const css = normalizeLineEndings(readFileSync(SCRIBE_CSS_PATH, 'utf8'));

        expect(css).toContain('.scribe-sidebar .follow-along {');
        expect(css).toContain('.scribe-sidebar .follow-along[data-minimized="true"] .follow-along-body');
        expect(css).toContain('#sidebar.sidebar-collapsed .follow-along');
        expect(css).toContain('.scribe-sidebar .is-onboarding-target');
    });

    it('styles the scribe section nav as a minimalist facilitator-style sidebar', () => {
        const css = normalizeLineEndings(readFileSync(SCRIBE_CSS_PATH, 'utf8'));

        expect(css).toContain('.scribe-section-region--actions,\n.scribe-section-region--proposals,\n.scribe-section-region--rfis,\n.scribe-section-region--communications,\n.scribe-section-region--notifications {\n    padding: 0;\n    border: 0;\n    border-radius: 0;\n    background: transparent;');
        expect(css).toContain('.scribe-view-switch {');
        expect(css).toContain('.scribe-view-switch-button:focus-visible {');
        expect(css).toContain('.scribe-view-switch-button[aria-selected="true"] {');
        expect(css).toContain('.scribe-view-switch-count {');
        expect(css).toContain('#sidebar.sidebar-collapsed .scribe-view-switch');
        expect(css).not.toContain('.scribe-section-region--actions + .scribe-section-region--deck');
        expect(css).toContain('.scribe-section-region--actions .scribe-section-region-title,\n.scribe-section-region--actions .scribe-section-region-summary,\n.scribe-section-region--proposals .scribe-section-region-title,\n.scribe-section-region--proposals .scribe-section-region-summary,\n.scribe-section-region--rfis .scribe-section-region-title,\n.scribe-section-region--rfis .scribe-section-region-summary,\n.scribe-section-region--communications .scribe-section-region-title,\n.scribe-section-region--communications .scribe-section-region-summary,\n.scribe-section-region--notifications .scribe-section-region-title,\n.scribe-section-region--notifications .scribe-section-region-summary');
        expect(css).toContain('.scribe-section-region--proposals {\n    margin-top: var(--space-5);');
        expect(css).toContain('.facilitator-workspace {\n    width: 100%;');
        expect(css).toContain('.facilitator-thread-message.is-outbound {');
        expect(css).toContain('body[data-facilitator-workspace="rfis"] .scribe-stage-nav');
        expect(css).toContain('.scribe-slide-link.is-proposal {');
        expect(css).toContain('.scribe-proposal-decision-actions {');
        expect(css).toContain('.scribe-section-card {\n    border: 0;\n    border-radius: var(--radius-md);\n    background: transparent;');
        expect(css).toContain('.scribe-section-trigger {\n    width: 100%;\n    display: flex;\n    align-items: center;');
        expect(css).toContain('padding: var(--space-3);');
        expect(css).toContain('.scribe-section-card.is-current .scribe-section-trigger::before');
        expect(css).toContain('.scribe-slide-link {\n    width: 100%;\n    display: grid;');
        expect(css).toContain('.scribe-slide-link.is-action {\n    background: transparent;\n    color: inherit;\n    box-shadow: none;');
        expect(css).toContain('.scribe-slide-link.is-action.is-active {\n    background: var(--color-navy-soft);');
        expect(css).toContain('padding: var(--space-2);');
        expect(css).not.toContain('linear-gradient(180deg, var(--color-info-100)');
        expect(css).not.toContain('box-shadow: inset 3px 0 0 var(--color-team-blue);');
    });

    it('contains the Blue Facilitator rail overflow and exposes a visible tab focus state', () => {
        const pageCss = normalizeLineEndings(readFileSync(SCRIBE_CSS_PATH, 'utf8'));

        expect(pageCss).toMatch(/\.scribe-action-mark-navigation\s*\{[^}]*max-width:\s*100%;[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/);
        expect(pageCss).toMatch(/\.scribe-action-mark-rail\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;[^}]*overscroll-behavior-inline:\s*contain;/);
        expect(pageCss).toContain('.scribe-action-mark-tab:focus-visible {\n    outline: var(--border-width-3) solid var(--color-focus-ring);');
        expect(pageCss).toContain('#sidebar.sidebar-collapsed .scribe-action-mark-navigation,');
        expect(pageCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.scribe-section-region--actions,[\s\S]*?\.scribe-action-mark-navigation,[\s\S]*?max-width: 100%;[\s\S]*?\.scribe-action-mark-rail\s*\{[\s\S]*?overflow-x: auto;[\s\S]*?overflow-y: hidden;/);
    });

    it('retains vertical action-mark styling for non-Blue legacy Scribe surfaces', () => {
        const pageCss = normalizeLineEndings(readFileSync(SCRIBE_CSS_PATH, 'utf8'));

        expect(pageCss).toContain('.scribe-action-mark-stack {\n    display: grid;');
        expect(pageCss).toContain('.scribe-action-mark-section {\n    display: grid;');
        expect(pageCss).toContain('.scribe-action-mark-heading {\n    display: flex;');
        expect(pageCss).toContain('.scribe-action-mark-section .scribe-slide-list {\n    display: flex;\n    flex-direction: column;\n    gap: var(--space-1);');
        expect(pageCss).toContain('.scribe-action-mark-stack,\n    .scribe-action-mark-section {\n        max-width: 100%;\n        min-width: 0;');
        expect(pageCss).toContain('overflow-x: hidden;');
        expect(pageCss).toContain('#sidebar.sidebar-collapsed .scribe-action-mark-stack,');
    });

    it('retains every vertical action mark for non-Blue legacy Scribe surfaces', async () => {
        const { ScribeController } = await loadScribeModule();
        const controller = new ScribeController();
        const markup = controller.renderVerticalActionMarkSections({
            id: 'actions',
            slides: [{
                slideKey: 'action-move-1',
                slideType: 'action',
                title: 'Move 1 action',
                action: { id: 'move-1', move: 1, updated_at: '2026-08-05T10:00:00.000Z' }
            }, {
                slideKey: 'action-move-3',
                slideType: 'action',
                title: 'Move 3 action',
                action: { id: 'move-3', move: 3, updated_at: '2026-08-05T12:00:00.000Z' }
            }]
        });

        expect(markup).toContain('data-scribe-action-mark-stack');
        expect(markup).toContain('<h3 id="scribe-action-mark-heading-strategic-orientation"');
        expect(markup).toContain('<h3 id="scribe-action-mark-heading-move-3"');
        expect(markup).toMatch(/data-scribe-action-mark="strategic-orientation"[\s\S]*?No records for Strategic Orientation\./);
        expect(markup).toMatch(/data-scribe-action-mark="move-1"[\s\S]*?Move 1 action/);
        expect(markup).toMatch(/data-scribe-action-mark="move-2"[\s\S]*?No records for Move 2\./);
        expect(markup).toMatch(/data-scribe-action-mark="move-3"[\s\S]*?Move 3 action/);
        expect(markup.indexOf('Strategic Orientation')).toBeLessThan(markup.indexOf('Move 1'));
        expect(markup.indexOf('Move 1')).toBeLessThan(markup.indexOf('Move 2'));
        expect(markup.indexOf('Move 2')).toBeLessThan(markup.indexOf('Move 3'));
        expect(markup).not.toContain('role="tablist"');
        expect(markup).not.toContain('hidden');
        expect(markup).toContain('No records for Move 2.');
    });

    it('builds the team-scoped facilitator decks into the same decks/team paths that scribe seats fetch at runtime', () => {
        const config = readFileSync(VITE_CONFIG_PATH, 'utf8');

        expect(config).toContain("resolve(__dirname, 'decks/blue/fractured-order-facilitator-deck.html')");
        expect(config).toContain("resolve(__dirname, 'decks/red/fractured-order-facilitator-deck.html')");
        expect(config).toContain("resolve(__dirname, 'decks/green/fractured-order-facilitator-deck.html')");
        expect(config).toContain("resolve(__dirname, 'decks/industry/fractured-order-facilitator-deck.html')");
    });

    it('switches the Facilitator support surface into presentation mode without leaving the sidebar open', async () => {
        const { setScribePresentationMode } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const presentBtn = fakeDocument.register(createFakeElement('presentBtn'));
        const sidebar = fakeDocument.register(createFakeElement('sidebar', 'scribe-sidebar sidebar-open'));
        const sidebarOverlay = fakeDocument.register(
            createFakeElement('sidebarOverlay', 'sidebar-overlay sidebar-overlay-visible')
        );
        presentBtn.textContent = 'Present';
        global.document = fakeDocument;

        setScribePresentationMode({ isActive: true });

        expect(document.body.dataset.scribePresentation).toBe('active');
        expect(document.getElementById('presentBtn')?.textContent).toBe('Exit Present');
        expect(document.getElementById('presentBtn')?.getAttribute('aria-pressed')).toBe('true');
        expect(document.getElementById('sidebar')?.classList.contains('sidebar-open')).toBe(false);
        expect(document.getElementById('sidebarOverlay')?.classList.contains('sidebar-overlay-visible')).toBe(false);

        setScribePresentationMode({ isActive: false });

        expect(document.body.dataset.scribePresentation).toBe('standard');
        expect(document.getElementById('presentBtn')?.textContent).toBe('Present');
        expect(document.getElementById('presentBtn')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('returns focus to the invoking control after Present mode exits', async () => {
        const { ScribeController } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const presentBtn = fakeDocument.register(createFakeElement('presentBtn'));
        const returnTarget = fakeDocument.register(createFakeElement('presentationReturnTarget'));
        fakeDocument.fullscreenElement = null;
        fakeDocument.documentElement = { requestFullscreen: vi.fn().mockResolvedValue(undefined) };
        global.document = fakeDocument;
        const controller = new ScribeController();

        await controller.togglePresentationMode({ returnFocusTo: returnTarget });
        expect(fakeDocument.body.dataset.scribePresentation).toBe('active');
        expect(presentBtn.textContent).toBe('Exit Present');

        await controller.togglePresentationMode();
        expect(fakeDocument.body.dataset.scribePresentation).toBe('standard');
        expect(returnTarget.focus).toHaveBeenCalledTimes(1);
        expect(fakeDocument.activeElement).toBe(returnTarget);
    });

    it('reserves a presentation-only layout that hides the sidebar chrome and centers the slide viewer', () => {
        const css = normalizeLineEndings(readFileSync(SCRIBE_CSS_PATH, 'utf8'));

        expect(css).toContain('html,\nbody {');
        expect(css).toContain('height: 100%;');
        expect(css).toContain('max-width: 100%;');
        expect(css).toContain('overflow-x: hidden;');
        expect(css).toContain('overflow-y: hidden;');
        expect(css).toContain('overscroll-behavior: contain;');
        expect(css).toContain('height: 100vh;');
        expect(css).toContain('width: min(100%, 88rem);');
        expect(css).toContain('.scribe-stage-card {\n    width: min(100%, 88rem);\n    height: 100%;\n    margin-inline: auto;\n    background: transparent;');
        expect(css).toContain('.scribe-stage-frame {\n    position: relative;\n    display: grid;');
        expect(css).toContain('background: transparent;');
        expect(css).toContain('.scribe-stage-image-wrap {\n    position: relative;\n    width: min(100%, 74rem);');
        expect(css).toContain('box-shadow: none;');
        expect(css).toContain('.scribe-slide-link.is-action {');
        expect(css).toContain('.scribe-orientation-slide {');
        expect(css).toContain('.scribe-slide-link.is-orientation .scribe-slide-link-number');
        expect(css).toContain('.scribe-action-slide::before {');
        expect(css).toContain('.scribe-action-slide-glance-grid {');
        expect(css).toContain('.scribe-action-slide-glance-grid--components {\n    grid-template-columns: repeat(3, minmax(0, 1fr));');
        expect(css).toContain('.scribe-action-slide-key-points {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));');
        expect(css).toContain('.scribe-action-slide-lead--outcome {');
        expect(css).toContain('.scribe-action-slide-glance-grid--action-components {\n    grid-template-columns: repeat(2, minmax(0, 1fr));');
        expect(css).toContain('.scribe-action-slide-glance-card--supply-chain {\n    grid-column: 1 / -1;');
        expect(css).toContain('.scribe-action-slide-component-details {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));');
        expect(css).toContain('.scribe-action-slide-columns {');
        expect(css).toContain('.scribe-action-slide-note-card {');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-sidebar');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-stage-card');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-stage-action-shell {\n    place-items: stretch;');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-action-slide {\n    width: 100%;\n    height: 100%;');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-action-card-toggle {\n    display: none;');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-action-slide-details[hidden] {\n    display: grid !important;');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-action-slide-submit-panel {\n    display: none !important;');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-presentation-toolbar {\n    position: fixed;');
        expect(css).toContain('grid-template-columns: auto minmax(0, 1.35fr) minmax(0, 1fr) auto;');
        expect(css).toContain('.scribe-presentation-toolbar-binary input:focus-visible + span {');
        expect(css).not.toContain('body[data-scribe-presentation="active"] .scribe-orientation-slide .scribe-action-slide-submit-panel');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-stage-nav');
    });
});
