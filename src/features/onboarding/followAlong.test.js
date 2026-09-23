import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountFollowAlong } from './followAlong.js';

class FakeClassList {
    constructor(owner, initial = '') {
        this.owner = owner;
        this.tokens = new Set(String(initial).split(/\s+/).filter(Boolean));
    }

    sync() {
        this.owner.className = [...this.tokens].join(' ');
    }

    add(...tokens) {
        tokens.filter(Boolean).forEach((token) => this.tokens.add(token));
        this.sync();
    }

    remove(...tokens) {
        tokens.filter(Boolean).forEach((token) => this.tokens.delete(token));
        this.sync();
    }

    contains(token) {
        return this.tokens.has(token);
    }

    toggle(token, force) {
        if (typeof force === 'boolean') {
            if (force) {
                this.tokens.add(token);
            } else {
                this.tokens.delete(token);
            }
            this.sync();
            return force;
        }

        if (this.tokens.has(token)) {
            this.tokens.delete(token);
            this.sync();
            return false;
        }

        this.tokens.add(token);
        this.sync();
        return true;
    }
}

class FakeElement {
    constructor(tagName = 'div', { id = '', className = '' } = {}) {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.className = className;
        this.classList = new FakeClassList(this, className);
        this.children = [];
        this.parentNode = null;
        this.dataset = {};
        this.attributes = new Map();
        this.listeners = new Map();
        this.style = {};
        this.textContent = '';
        this.disabled = false;
        this.hidden = false;
        this.removed = false;
        this.focus = vi.fn();
        this.pause = vi.fn();
        this.play = vi.fn(() => Promise.resolve());
        this.load = vi.fn();
        this.currentTime = 0;
    }

    set innerHTML(value) {
        const html = String(value || '');
        this.children = [];

        if (html.includes('follow-along-bar')) {
            [
                ['button', 'follow-along-bar'],
                ['span', 'follow-along-bar-title'],
                ['span', 'follow-along-progress'],
                ['span', 'follow-along-chevron'],
                ['div', 'follow-along-body'],
                ['h4', 'follow-along-step-title'],
                ['p', 'follow-along-step-text'],
                ['div', 'follow-along-dots'],
                ['div', 'follow-along-actions'],
                ['button', 'follow-along-skip'],
                ['span', 'follow-along-spacer'],
                ['button', 'follow-along-back'],
                ['button', 'follow-along-next']
            ].forEach(([tagName, className]) => {
                this.appendChild(new FakeElement(tagName, { className }));
            });
            return;
        }

        if (html.includes('follow-along-dot')) {
            const count = html.match(/follow-along-dot/g)?.length || 0;
            for (let index = 0; index < count; index += 1) {
                this.appendChild(new FakeElement('span', { className: 'follow-along-dot' }));
            }
        }
    }

    get innerHTML() {
        return '';
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) || null;
    }

    addEventListener(type, callback) {
        this.listeners.set(type, callback);
    }

    click() {
        this.listeners.get('click')?.({
            stopPropagation: vi.fn(),
            currentTarget: this
        });
    }

    appendChild(child) {
        if (child.parentNode) {
            child.parentNode.children = child.parentNode.children.filter((candidate) => candidate !== child);
        }
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    append(...children) {
        children.forEach((child) => this.appendChild(child));
    }

    replaceChildren(...children) {
        this.children = [];
        this.append(...children);
    }

    insertBefore(child, anchor) {
        if (child.parentNode) {
            child.parentNode.children = child.parentNode.children.filter((candidate) => candidate !== child);
        }
        child.parentNode = this;
        const anchorIndex = this.children.indexOf(anchor);
        if (anchorIndex === -1) {
            this.children.push(child);
        } else {
            this.children.splice(anchorIndex, 0, child);
        }
        return child;
    }

    remove() {
        this.removed = true;
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        this.parentNode = null;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
        const matches = [];
        const predicate = selector.startsWith('.')
            ? (element) => {
                const className = selector.slice(1);
                return element.classList.contains(className)
                    || String(element.className).split(/\s+/).includes(className);
            }
            : selector.startsWith('#')
                ? (element) => element.id === selector.slice(1)
                : () => false;

        function walk(element) {
            element.children.forEach((child) => {
                if (predicate(child)) {
                    matches.push(child);
                }
                walk(child);
            });
        }

        walk(this);
        return matches;
    }
}

function createStorage() {
    const values = new Map();

    return {
        getItem: vi.fn((key) => values.get(key) || null),
        setItem: vi.fn((key, value) => {
            values.set(key, String(value));
        })
    };
}

function createSidebar() {
    const sidebar = new FakeElement('aside', { id: 'sidebar' });
    const session = new FakeElement('div', { className: 'sidebar-session' });
    sidebar.appendChild(session);
    return { sidebar, session };
}

function getGuide(sidebar) {
    return sidebar.querySelector('.follow-along') || global.document.body?.querySelector('.follow-along');
}

describe('mountFollowAlong', () => {
    let storage;

    beforeEach(() => {
        storage = createStorage();
        global.window = { localStorage: storage };
        global.document = {
            body: new FakeElement('body'),
            createElement: (tagName) => new FakeElement(tagName),
            getElementById: vi.fn(() => null),
            querySelector: vi.fn(() => null),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        };
    });

    afterEach(() => {
        delete global.window;
        delete global.document;
    });

    it('keeps current Green text usable without resolving or playing historical narration', () => {
        const { sidebar } = createSidebar();
        const resolveAudioUrl = vi.fn(() => '/historical.mp3');
        const instance = mountFollowAlong({ sidebar, storageKey: 'green-guide', overviewMedia: false,
            textOnly: true, mediaNotice: 'No replacement narration has been approved.',
            roleLabel: 'Shared Green Facilitator', summary: 'Review each region separately.', resolveAudioUrl,
            steps: [{ title: 'RFIs', body: 'Choose the region before creating an RFI.',
                narrative: 'Scribes read answers; the Facilitator corrects returned RFIs.' }] });
        const root = getGuide(sidebar);
        instance.goToStep(0);
        expect(resolveAudioUrl).not.toHaveBeenCalled();
        expect(root.dataset.audioState).toBe('unavailable');
        expect(root.querySelectorAll('.follow-along-audio-button').every((button) => button.disabled)).toBe(true);
        const transcript = root.querySelector('.follow-along-audio-transcript');
        expect(transcript.children[0].textContent).toContain('no approved audio');
        expect(transcript.children[1].textContent).toContain('Facilitator corrects returned RFIs');
        expect(transcript.children[1].textContent).not.toContain('Use an RFI when the team needs');
        expect(root.querySelector('.follow-along-media-status').textContent).toContain('No replacement');
    });

    it('keeps a previously completed guide mounted above the session footer', () => {
        storage.setItem('tour', JSON.stringify({ done: true, step: 1 }));
        const { sidebar, session } = createSidebar();

        const instance = mountFollowAlong({
            storageKey: 'tour',
            sidebar,
            steps: [
                { title: 'First', body: 'One' },
                { title: 'Second', body: 'Two' }
            ],
            overviewMedia: false
        });

        const root = sidebar.querySelector('.follow-along');
        expect(instance).toBeTruthy();
        expect(root).toBeTruthy();
        expect(sidebar.children[0]).toBe(root);
        expect(sidebar.children[1]).toBe(session);
        expect(root.dataset.minimized).toBe('true');
        expect(root.querySelector('.follow-along-bar-title').textContent).toBe('Start Here');
        expect(root.querySelector('.follow-along-progress').textContent).toBe('');
        expect(root.querySelector('.follow-along-progress').hidden).toBe(true);

        root.querySelector('.follow-along-bar').click();

        expect(root.dataset.minimized).toBe('false');
        expect(root.querySelector('.follow-along-bar-title').textContent).toBe('Role walkthrough');
        expect(root.querySelector('.follow-along-progress').textContent).toBe('1 / 3');
        expect(root.querySelector('.follow-along-progress').hidden).toBe(false);
        expect(JSON.parse(storage.getItem('tour'))).toEqual({
            step: 0,
            minimized: false,
            completed: true
        });
        expect(root.dataset.presentation).toBe('popup');
        expect(global.document.body.querySelector('.follow-along')).toBe(root);
    });

    it('opens as a modeless popup and minimizes back to the sidebar', () => {
        const { sidebar, session } = createSidebar();
        const instance = mountFollowAlong({
            storageKey: 'tour',
            sidebar,
            roleLabel: 'White Cell Lead',
            steps: [{ title: 'Review queue', body: 'Inspect the queue.' }],
            overviewMedia: false
        });

        const root = global.document.body.querySelector('.follow-along');
        const host = global.document.body.querySelector('.follow-along-popup-host');
        expect(root).toBeTruthy();
        expect(root.parentNode).toBe(host);
        expect(root.dataset.presentation).toBe('popup');
        expect(root.getAttribute('role')).toBe('dialog');
        expect(root.getAttribute('aria-modal')).toBe('false');
        expect(root.querySelector('.follow-along-skip').textContent).toBe('Minimize to sidebar');
        expect(root.querySelector('.follow-along-bar').focus).toHaveBeenCalledWith({ preventScroll: true });

        root.querySelector('.follow-along-skip').click();

        expect(root.dataset.presentation).toBe('sidebar');
        expect(root.getAttribute('role')).toBe('region');
        expect(sidebar.children[0]).toBe(root);
        expect(sidebar.children[1]).toBe(session);
        expect(host.hidden).toBe(true);
        expect(root.querySelector('.follow-along-bar').getAttribute('aria-label')).toContain('Open White Cell Lead');

        root.querySelector('.follow-along-bar').click();
        expect(root.parentNode).toBe(host);
        expect(host.hidden).toBe(false);

        const keydownHandler = global.document.addEventListener.mock.calls.find(([eventName]) => eventName === 'keydown')?.[1];
        const preventDefault = vi.fn();
        keydownHandler({ key: 'Escape', preventDefault });
        expect(preventDefault).toHaveBeenCalled();
        expect(root.parentNode).toBe(sidebar);
        expect(root.querySelector('.follow-along-bar').focus).toHaveBeenCalledWith({ preventScroll: true });

        instance.destroy();
        expect(sidebar.dataset.followAlongMounted).toBeUndefined();
        expect(host.removed).toBe(true);
    });

    it('collapses instead of removing the guide when the final step is done', () => {
        const { sidebar, session } = createSidebar();

        mountFollowAlong({
            storageKey: 'tour',
            sidebar,
            steps: [{ title: 'Only step', body: 'Reference stays available.' }],
            overviewMedia: false
        });

        const root = getGuide(sidebar);
        root.querySelector('.follow-along-next').click();
        root.querySelector('.follow-along-next').click();

        expect(root.removed).toBe(false);
        expect(sidebar.children[0]).toBe(root);
        expect(sidebar.children[1]).toBe(session);
        expect(root.dataset.minimized).toBe('true');
        expect(root.querySelector('.follow-along-bar-title').textContent).toBe('Start Here');
        expect(root.querySelector('.follow-along-progress').textContent).toBe('');
        expect(root.querySelector('.follow-along-progress').hidden).toBe(true);
        expect(JSON.parse(storage.getItem('tour'))).toEqual({
            step: 0,
            minimized: true,
            completed: true
        });
    });

    it('highlights each selector in a multi-target step and clears them on advance', () => {
        const { sidebar } = createSidebar();
        const gameState = new FakeElement('div', { id: 'header-game-state' });
        const timer = new FakeElement('div', { id: 'header-timer' });

        global.document = {
            body: new FakeElement('body'),
            createElement: (tagName) => new FakeElement(tagName),
            getElementById: vi.fn(() => null),
            querySelector: vi.fn((selector) => ({
                '#header-game-state': gameState,
                '#header-timer': timer
            }[selector] || null)),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        };

        const instance = mountFollowAlong({
            storageKey: 'tour',
            sidebar,
            steps: [
                {
                    title: 'Tracker',
                    body: 'Watch the header state.',
                    highlight: ['#header-game-state', '#header-timer']
                },
                {
                    title: 'Next',
                    body: 'Move on.'
                }
            ],
            overviewMedia: false
        });

        const root = getGuide(sidebar);
        instance.goToStep(0);
        expect(gameState.classList.contains('is-onboarding-target')).toBe(true);
        expect(timer.classList.contains('is-onboarding-target')).toBe(true);

        root.querySelector('.follow-along-next').click();

        expect(gameState.classList.contains('is-onboarding-target')).toBe(false);
        expect(timer.classList.contains('is-onboarding-target')).toBe(false);
    });

    it('renders detailed role narrative and opens the requested native surface', () => {
        const { sidebar } = createSidebar();
        const actionTarget = new FakeElement('button', { id: 'actions' });
        global.document.querySelector = vi.fn((selector) => selector === '#actions' ? actionTarget : null);

        const instance = mountFollowAlong({
            storageKey: 'tour',
            sidebar,
            roleLabel: 'Blue Team Scribe',
            summary: 'Own the written team record.',
            overviewMedia: false,
            steps: [{
                title: 'Draft actions',
                body: 'Record the agreed action.',
                narrative: 'Turn the room decision into a durable artifact.',
                details: ['Confirm the move.', 'Preserve rationale.'],
                targetLabel: 'Actions',
                highlight: '#actions',
                action: { label: 'Open Actions', selector: '#actions' }
            }]
        });

        const root = getGuide(sidebar);
        instance.goToStep(0);
        expect(root.getAttribute('aria-label')).toContain('Blue Team Scribe');
        expect(root.querySelector('.follow-along-role-summary').textContent).toBe('Own the written team record.');
        expect(root.querySelector('.follow-along-step-meta').textContent).toBe('2 of 2 / Actions');
        expect(root.querySelector('.follow-along-step-narrative').textContent).toContain('durable artifact');
        expect(root.querySelectorAll('.follow-along-step-details').length).toBe(1);

        root.querySelector('.follow-along-open-surface').click();
        expect(actionTarget.focus).toHaveBeenCalledWith({ preventScroll: true });
    });

    it('gives orientation and role focus their own slides before the role walkthrough', () => {
        const { sidebar } = createSidebar();
        mountFollowAlong({
            storageKey: 'tour',
            sidebar,
            steps: [{ title: 'Role', body: 'Start here.' }],
            overviewMedia: {
                videoUrl: '/overview.mp4',
                posterUrl: '/poster.png',
                captionsUrl: '/overview.en.vtt',
                durationLabel: '2:28',
                label: 'Platform overview',
                transcript: ['Accessible transcript.']
            }
        });

        const root = getGuide(sidebar);
        const video = root.querySelector('.follow-along-video');
        const transcript = root.querySelector('.follow-along-transcript');
        const bodyPad = root.querySelector('.follow-along-body-pad');
        const overview = root.querySelector('.follow-along-overview');
        const stepPanel = root.querySelector('.follow-along-step-panel');
        const overviewToggle = root.querySelector('.follow-along-overview-toggle');
        const roleBrief = root.querySelector('.follow-along-role-brief');
        expect(video.preload).toBe('metadata');
        expect(video.autoplay).not.toBe(true);
        expect(transcript.children[0].textContent).toBe('Accessible transcript.');
        expect(overviewToggle.textContent).toBe('Watch');
        expect(overview.querySelector('.follow-along-section-label').textContent).toContain('2:28');
        expect(bodyPad.children.indexOf(overview)).toBeLessThan(bodyPad.children.indexOf(stepPanel));
        expect(root.dataset.slide).toBe('orientation');
        expect(overview.hidden).toBe(false);
        expect(roleBrief.hidden).toBe(true);
        expect(stepPanel.hidden).toBe(true);
        expect(root.querySelector('.follow-along-audio-guide').hidden).toBe(true);
        expect(root.querySelector('.follow-along-audio-transcript').hidden).toBe(true);

        overviewToggle.click();
        expect(root.querySelector('.follow-along-media').hidden).toBe(false);
        expect(overviewToggle.textContent).toBe('Hide');
        expect(overviewToggle.getAttribute('aria-expanded')).toBe('true');

        root.querySelector('.follow-along-next').click();
        expect(root.dataset.slide).toBe('role-focus');
        expect(overview.hidden).toBe(true);
        expect(roleBrief.hidden).toBe(false);
        expect(stepPanel.hidden).toBe(true);
        expect(video.pause).toHaveBeenCalled();
        expect(root.querySelector('.follow-along-audio-guide').hidden).toBe(false);
        expect(root.querySelector('.follow-along-audio-transcript').hidden).toBe(false);
        expect(root.querySelector('.follow-along-audio-transcript').children[0].textContent).toBe('Audio transcript');

        root.querySelector('.follow-along-next').click();
        expect(root.dataset.slide).toBe('role-surface');
        expect(overview.hidden).toBe(true);
        expect(roleBrief.hidden).toBe(true);
        expect(stepPanel.hidden).toBe(false);
        expect(root.querySelector('.follow-along-step-meta').textContent).toBe('3 of 3');
    });

    it('offers icon-only Kokoro playback controls from slide two and stops audio on navigation', async () => {
        const { sidebar } = createSidebar();
        mountFollowAlong({
            storageKey: 'tour',
            sidebar,
            roleLabel: 'Game Master',
            summary: 'Maintain the operational record.',
            steps: [{
                title: 'Sessions',
                body: 'Select the active session.',
                narrative: 'Verify the session before distributing access.'
            }],
            overviewMedia: {
                videoUrl: '/overview.mp4',
                transcript: ['Transcript.']
            },
            resolveAudioUrl: () => '/onboarding/start-here/audio/clips/0123456789abcdef.mp3'
        });

        const root = getGuide(sidebar);
        const audio = root.querySelector('.follow-along-body-pad').children.find((child) => child.tagName === 'AUDIO');
        const play = root.querySelectorAll('.follow-along-audio-button')[0];
        const pause = root.querySelectorAll('.follow-along-audio-button')[1];
        const stop = root.querySelectorAll('.follow-along-audio-button')[2];
        expect(play.getAttribute('aria-label')).toBe('Play audio guide');
        expect(pause.getAttribute('aria-label')).toBe('Pause audio guide');
        expect(stop.getAttribute('aria-label')).toBe('Stop audio guide');
        expect(play.textContent).toBe('');

        root.querySelector('.follow-along-next').click();
        expect(audio.src).toMatch(/^\/onboarding\/start-here\/audio\/clips\/[a-f0-9]{16}\.mp3$/);
        play.click();
        await Promise.resolve();
        expect(audio.play).toHaveBeenCalledTimes(1);

        pause.click();
        expect(audio.pause).toHaveBeenCalled();
        expect(root.dataset.audioState).toBe('paused');

        audio.currentTime = 4;
        stop.click();
        expect(audio.currentTime).toBe(0);
        expect(root.dataset.audioState).toBe('stopped');

        root.querySelector('.follow-along-next').click();
        expect(audio.pause).toHaveBeenCalled();
    });
});
