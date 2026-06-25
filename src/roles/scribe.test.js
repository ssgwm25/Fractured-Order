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
import { serializeBlueActionDetails } from '../features/actions/blueActionDetails.js';
import { serializeStrategicOrientationDetails } from '../features/actions/strategicOrientationDetails.js';

const BLUE_SCRIBE_HTML_PATH = new URL('../../teams/blue/scribe.html', import.meta.url);
const GREEN_SCRIBE_HTML_PATH = new URL('../../teams/green/scribe.html', import.meta.url);
const INDUSTRY_SCRIBE_HTML_PATH = new URL('../../teams/industry/scribe.html', import.meta.url);
const RED_SCRIBE_HTML_PATH = new URL('../../teams/red/scribe.html', import.meta.url);
const SCRIBE_CSS_PATH = new URL('../../styles/pages/scribe.css', import.meta.url);
const VITE_CONFIG_PATH = new URL('../../vite.config.js', import.meta.url);

const {
    mockConfirmModal,
    mockCreateTimelineEvent,
    mockHideLoader,
    mockMountFollowAlong,
    mockShowLoader,
    mockSubmitAction,
    mockUpdateDraftAction
} = vi.hoisted(() => ({
    mockConfirmModal: vi.fn(),
    mockCreateTimelineEvent: vi.fn(),
    mockHideLoader: vi.fn(),
    mockMountFollowAlong: vi.fn(() => ({ destroy: vi.fn() })),
    mockShowLoader: vi.fn(() => ({})),
    mockSubmitAction: vi.fn(),
    mockUpdateDraftAction: vi.fn()
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

vi.mock('../components/ui/Toast.js', () => ({
    showToast: vi.fn()
}));

vi.mock('../components/ui/Loader.js', () => ({
    showLoader: mockShowLoader,
    hideLoader: mockHideLoader
}));

vi.mock('../components/ui/Modal.js', () => ({
    confirmModal: mockConfirmModal
}));

vi.mock('../services/database.js', () => ({
    database: {
        updateDraftAction: mockUpdateDraftAction,
        submitAction: mockSubmitAction,
        createTimelineEvent: mockCreateTimelineEvent
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
            innerHTML += child?.outerHTML || '';
            return child;
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

    return {
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
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    };
}

async function loadScribeModule() {
    globalThis.__ESG_DISABLE_AUTO_INIT__ = true;
    vi.resetModules();
    return import('./scribe.js');
}

describe('scribe surface', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        delete globalThis.__ESG_DISABLE_AUTO_INIT__;
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
    });

    it('routes only the dedicated scribe seat onto the scribe surface', async () => {
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

    it('mounts a persistent role guide for the active scribe team', async () => {
        const { ScribeController } = await loadScribeModule();
        const controller = new ScribeController();

        mockMountFollowAlong.mockClear();
        controller.mountFollowAlongOnboarding();

        expect(mockMountFollowAlong).toHaveBeenCalledTimes(1);
        expect(mockMountFollowAlong).toHaveBeenCalledWith(expect.objectContaining({
            storageKey: 'followalong:scribe:blue',
            title: 'Blue Team Scribe guide'
        }));

        const guide = mockMountFollowAlong.mock.calls[0][0];
        expect(guide.steps.map((step) => step.title)).toEqual([
            'Blue Team Scribe',
            'Follow move, phase, and timer',
            'Navigate the support deck',
            'Watch activity',
            'Present to the room',
            'Revisit this guide'
        ]);
        expect(guide.steps.map((step) => step.highlight).filter(Boolean)).toEqual([
            '.header-center',
            '#scribeSectionList',
            '#scribeAlertsBtn',
            '#presentBtn',
            '.sidebar-session'
        ]);
        expect(guide.steps[1].body).toContain('Strategic Orientation before Move 1');
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

        expect(global.fetch).toHaveBeenNthCalledWith(1, '/decks/blue/missing-deck.html', {
            credentials: 'same-origin'
        });
        expect(global.fetch).toHaveBeenNthCalledWith(2, `/${buildDefaultScribeDeckPath('blue')}`, {
            credentials: 'same-origin'
        });
        expect(controller.facilitatorDeckSlides).toEqual([{
            n: 1,
            title: 'Fallback Deck',
            src: 'data:image/png;base64,AAA='
        }]);
        expect(showToast).toHaveBeenCalledWith({
            message: 'Assigned scribe deck unavailable. Loaded the default team deck instead.',
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

        expect(global.fetch).toHaveBeenCalledWith(`/${buildDefaultScribeDeckPath('blue')}`, {
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
            message: 'The scribe support deck could not be loaded. Showing live action slides only.',
            type: 'warning'
        });
    });

    it('moves focus into the scribe alerts dialog, traps Tab, and restores focus on Escape', async () => {
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
        expect(controller.unreadNotifications).toBe(0);
        expect(controller.notifications[0].read).toBe(true);
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
        expect(alertsBadge.hidden).toBe(true);
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

    it('lets scribe slide groups collapse independently without forcing another group open', async () => {
        const { ScribeController } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const sectionList = fakeDocument.register(createFakeElement('scribeSectionList'));
        global.document = fakeDocument;

        const controller = new ScribeController();
        controller.sections = [{
            id: 'overview',
            label: 'Overview',
            slideCount: 1,
            slides: [{ n: 1, title: 'Overview slide', src: 'data:image/png;base64,one' }]
        }, {
            id: 'schedule',
            label: 'Schedule',
            slideCount: 1,
            slides: [{ n: 2, title: 'Schedule slide', src: 'data:image/png;base64,two' }]
        }];
        controller.deckSlides = [
            controller.sections[0].slides[0],
            controller.sections[1].slides[0]
        ];
        controller.currentSlideIndex = 0;
        controller.activeSectionIndex = 0;
        controller.expandedSectionIds = new Set(['overview', 'schedule']);
        controller.sectionExpansionInitialized = true;

        controller.renderSections();
        expect(sectionButtonMarkup(sectionList.innerHTML, 'Overview')).toContain('aria-expanded="true"');
        expect(sectionButtonMarkup(sectionList.innerHTML, 'Schedule')).toContain('aria-expanded="true"');

        controller.toggleSection(0);

        expect(sectionButtonMarkup(sectionList.innerHTML, 'Overview')).toContain('aria-expanded="false"');
        expect(sectionButtonMarkup(sectionList.innerHTML, 'Schedule')).toContain('aria-expanded="true"');
        expect(controller.activeSectionIndex).toBe(0);
        expect(controller.getCurrentSlideKey()).toBe('deck-1');
    });

    it('separates live actions from support deck sections in the scribe sidebar', async () => {
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
                title: 'Awaiting Blue Team facilitator decisions'
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

        expect(sectionList.innerHTML).toContain('scribe-section-region--actions');
        expect(sectionList.innerHTML).toContain('Live team decisions');
        expect(sectionList.innerHTML).toContain('data-section-kind="actions"');
        expect(sectionList.innerHTML).toContain('scribe-section-card--actions');
        expect(sectionList.innerHTML).toContain('scribe-slide-link is-action');
        expect(sectionList.innerHTML).toContain('scribe-section-region--deck');
        expect(sectionList.innerHTML).toContain('Support slides');
        expect(sectionList.innerHTML).toContain('data-section-kind="deck"');
        expect(sectionList.innerHTML.indexOf('scribe-section-region--actions')).toBeLessThan(
            sectionList.innerHTML.indexOf('scribe-section-region--deck')
        );
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
            goal: 'Facilitator-only draft',
            expected_outcomes: 'This draft has not been handed to the scribe.',
            mechanism: 'Economic',
            sector: 'Semiconductors',
            exposure_type: 'Supply Chain',
            targets: ['PRC'],
            priority: 'NORMAL',
            status: 'draft',
            created_at: '2026-06-15T09:55:00.000Z',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Hold this draft inside the facilitator surface.'
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
                scribeHandoff: 'Forwarded'
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
            sidebarKicker: 'Forwarded to Scribe | Blue Team | Move 1 | Action 1'
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
            goal: 'Strategic Orientation: Pressure',
            mechanism: 'Strategic Orientation',
            exposure_type: 'pre_move_1',
            priority: 'HIGH',
            status: 'draft',
            ally_contingencies: serializeStrategicOrientationDetails({
                artifactType: 'selection',
                team: 'blue',
                orientation: 'pressure',
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
            title: 'Strategic Orientation: Pressure',
            sidebarOrdinal: 'SO',
            sidebarKicker: 'Forwarded to Scribe | Pre-Move 1 | Selection'
        });
    });

    it('renders blue action slides as structured briefing panels that are easier for the team to follow', async () => {
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
            expected_outcomes: 'Slow diversion routes while preserving allied supply assurance.',
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

        expect(html).toContain('What Blue Team is doing');
        expect(html).toContain('Action at a glance');
        expect(html).toContain('Execution snapshot');
        expect(html).toContain('Status and White Cell');
        expect(html).toContain('Focus countries');
        expect(html).toContain('Delivery path');
        expect(html).toContain('Expected effect:');
        expect(html).toContain('White Cell note');
        expect(html).toContain('Keep public messaging aligned with allied licensing language.');
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

    it('renders forwarded draft actions as room-ready Scribe submission slides before White Cell submission', async () => {
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
            sidebarKicker: 'Forwarded to Scribe | Blue Team | Move 1 | Action 1',
            action
        });

        expect(html).toContain('Facilitator Action for Scribe');
        expect(html).toContain('What Blue Team is asking the Scribe to submit');
        expect(html).toContain('Project this action for the room, complete the scribe coordination fields, then submit it to White Cell.');
        expect(html).toContain('Draft status');
        expect(html).toContain('Draft saved');
        expect(html).toContain('Not yet submitted to White Cell');
        expect(html).toContain('Awaiting Scribe submission');
        expect(html).toContain('Scribe finalization');
        expect(html).toContain('Project Action');
        expect(html).toContain('Coordinated');
        expect(html).toContain('Informed/Engaged');
        expect(html).toContain('value="Industry"');
        expect(html).toContain('value="Allies"');
        expect(html).toContain('data-scribe-action-submit');
        expect(html).toContain('hidden disabled aria-hidden="true"');
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
            goal: 'Green Forecast: Blue Reframe',
            mechanism: 'Strategic Orientation',
            exposure_type: 'pre_move_1',
            priority: 'HIGH',
            status: 'draft',
            created_at: '2026-06-15T09:55:00.000Z',
            updated_at: '2026-06-15T10:05:00.000Z',
            ally_contingencies: serializeStrategicOrientationDetails({
                artifactType: 'forecast',
                team: 'green',
                orientation: 'reframe',
                primaryLevers: ['Friend-shoring agreements'],
                acceptedCosts: ['Transitional inefficiencies'],
                posture: 'Gradual \u2014 long-horizon reallocation',
                rationale: 'Green expects Blue to pivot into alliance structure-building.',
                scribeHandoff: 'Forwarded'
            })
        };

        const html = controller.renderActionSlide({
            slideKey: 'action-orientation-forecast-preview',
            slideType: 'strategic-orientation',
            sidebarOrdinal: 'SO',
            sidebarKicker: 'Forwarded to Scribe | Pre-Move 1 | Forecast',
            action
        });

        expect(html).toContain('Strategic Orientation Forecast');
        expect(html).toContain('scribe-orientation-slide');
        expect(html).toContain('Forecasted Blue posture');
        expect(html).toContain('Orientation at a glance');
        expect(html).toContain('Friend-shoring agreements');
        expect(html).toContain('Scribe-to-White Cell handoff');
        expect(html).toContain('Project orientation, then send to White Cell');
        expect(html).toContain('Project Forecast');
        expect(html).toContain('Submit to White Cell');
        expect(html).not.toContain('Coordinated tick boxes');
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

    it('submits completed action details from the scribe to White Cell', async () => {
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
            goal: 'Submit through the scribe',
            expected_outcomes: 'White Cell receives only the completed action.',
            mechanism: 'Economic',
            sector: 'Biotechnology',
            exposure_type: 'Refinement',
            targets: ['PRC'],
            priority: 'NORMAL',
            status: 'draft',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Keep the scribe in the action submission loop.',
                levers: ['Export Controls'],
                sectors: ['Biotechnology'],
                implementation: 'Legislative',
                legislativeOptions: ['Existing legislation/policy'],
                enforcementTimeline: '6 months',
                scribeHandoff: 'Forwarded'
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
            content: 'Action submitted to White Cell by Scribe: Submit through the scribe',
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
        expect(mockUpdateDraftAction.mock.calls[0][1].ally_contingencies).toContain('Coordinated: ["Legislative"]');
        expect(mockUpdateDraftAction.mock.calls[0][1].ally_contingencies).toContain('Informed/Engaged Decision: Yes');
        expect(mockUpdateDraftAction.mock.calls[0][1].ally_contingencies).toContain('Informed: ["Industry","Allies"]');
        expect(mockSubmitAction).toHaveBeenCalledWith('action-scribe-submit');
        expect(mockCreateTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'ACTION_SUBMITTED',
            content: 'Action submitted to White Cell by Scribe: Submit through the scribe',
            metadata: expect.objectContaining({
                submitted_by: 'scribe',
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

    it('submits Strategic Orientation drafts from Scribe to White Cell without Blue coordination rewrites', async () => {
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
            content: 'Strategic Orientation submitted to White Cell by Scribe: Red Forecast: Blue Pressure',
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
                submitted_by: 'scribe',
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

        expect(html).toContain('<title>Statecraft Sim | Blue Team Scribe</title>');
        expect(html).toContain('content="Statecraft Sim Blue Team scribe support deck."');
        expect(html).toContain('data-scribe-presentation="standard"');
        expect(html).toContain('../../styles/components/badges.css');
        expect(html).toContain('../../styles/components/modals.css');
        expect(html).toContain('<header class="page-header" id="pageHeader">');
        expect(html).toContain('class="header-session-info"');
        expect(html).toContain('id="sessionName"');
        expect(html).toContain('id="headerMove"');
        expect(html).toContain('id="headerPhase"');
        expect(html).toContain('id="timerDisplay"');
        expect(html).toContain('id="scribeSectionList"');
        expect(html).toContain('id="deckSlideImage"');
        expect(html).toContain('id="deckActionFrame"');
        expect(html).toContain('id="slideAnnouncement"');
        expect(html).not.toContain('scribe-sidebar-header');
        expect(html).not.toContain('scribe-stage-hero');
        expect(html).not.toContain('scribe-stage-toolbar');
        expect(html).not.toContain('scribe-stage-footer');
        expect(html).not.toContain('scribe-section-trigger-description');
    });

    it('ships every team scribe alert surface as a real keyboard dialog', () => {
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

    it('loads the shared modal styles on every team scribe shell for logout confirmation', () => {
        for (const path of [
            BLUE_SCRIBE_HTML_PATH,
            GREEN_SCRIBE_HTML_PATH,
            INDUSTRY_SCRIBE_HTML_PATH,
            RED_SCRIBE_HTML_PATH
        ]) {
            const html = readFileSync(path, 'utf8');

            expect(html).toContain('../../styles/components/modals.css');
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

        expect(css).toContain('.scribe-section-region--actions {\n    padding: 0;\n    border: 0;\n    border-radius: 0;\n    background: transparent;');
        expect(css).toContain('.scribe-section-region--actions + .scribe-section-region--deck {\n    margin-top: var(--space-5);');
        expect(css).toContain('.scribe-section-region--actions .scribe-section-region-title,\n.scribe-section-region--actions .scribe-section-region-summary');
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

    it('builds the team-scoped facilitator decks into the same decks/team paths that scribe seats fetch at runtime', () => {
        const config = readFileSync(VITE_CONFIG_PATH, 'utf8');

        expect(config).toContain("resolve(__dirname, 'decks/blue/fractured-order-facilitator-deck.html')");
        expect(config).toContain("resolve(__dirname, 'decks/red/fractured-order-facilitator-deck.html')");
        expect(config).toContain("resolve(__dirname, 'decks/green/fractured-order-facilitator-deck.html')");
        expect(config).toContain("resolve(__dirname, 'decks/industry/fractured-order-facilitator-deck.html')");
    });

    it('switches the scribe surface into presentation mode without leaving the sidebar open', async () => {
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
        expect(css).toContain('.scribe-action-slide-columns {');
        expect(css).toContain('.scribe-action-slide-note-card {');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-sidebar');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-stage-card');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-orientation-slide .scribe-action-slide-submit-panel');
        expect(css).toContain('body[data-scribe-presentation="active"] .scribe-stage-nav');
    });
});
