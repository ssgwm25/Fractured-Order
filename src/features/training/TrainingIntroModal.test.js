import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    TRAINING_INTRO_DURATION_SECONDS,
    TRAINING_INTRO_TRANSCRIPT,
    getTrainingIntroViewedKey,
    hasViewedTrainingIntro,
    resolveTrainingIntroMediaState,
    showTrainingIntroModal
} from './TrainingIntroModal.js';

class FakeElement {
    constructor(tagName, documentRef) {
        this.tagName = String(tagName).toUpperCase();
        this.ownerDocument = documentRef;
        this.children = [];
        this.parentNode = null;
        this.listeners = new Map();
        this.attributes = new Map();
        this.dataset = {};
        this.className = '';
        this.textContent = '';
        this.hidden = false;
        this.tabIndex = 0;
        this.currentTime = 0;
        this.error = null;
        this.play = this.tagName === 'VIDEO'
            ? vi.fn(() => {
                this.dispatch('play');
                return Promise.resolve();
            })
            : undefined;
        this.pause = this.tagName === 'VIDEO' ? vi.fn() : undefined;
        this.load = this.tagName === 'VIDEO' ? vi.fn() : undefined;
    }

    append(...children) {
        children.forEach((child) => this.appendChild(child));
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    replaceChildren(...children) {
        this.children.forEach((child) => { child.parentNode = null; });
        this.children = [];
        this.append(...children);
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) || null;
    }

    hasAttribute(name) {
        return this.attributes.has(name);
    }

    addEventListener(type, callback) {
        const callbacks = this.listeners.get(type) || [];
        callbacks.push(callback);
        this.listeners.set(type, callbacks);
    }

    dispatch(type) {
        (this.listeners.get(type) || []).forEach((callback) => callback({
            type,
            target: this,
            currentTarget: this,
            preventDefault: vi.fn()
        }));
    }

    click() {
        this.dispatch('click');
    }

    focus() {
        this.ownerDocument.activeElement = this;
    }
}

function createWindowDouble() {
    const listeners = new Map();
    return {
        addEventListener: vi.fn((type, callback) => {
            const callbacks = listeners.get(type) || [];
            callbacks.push(callback);
            listeners.set(type, callbacks);
        }),
        removeEventListener: vi.fn((type, callback) => {
            listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== callback));
        }),
        dispatch(type) {
            (listeners.get(type) || []).forEach((callback) => callback({ type }));
        }
    };
}

function createDocumentDouble(windowRef) {
    const listeners = new Map();
    const documentRef = {
        activeElement: null,
        visibilityState: 'visible',
        defaultView: windowRef,
        createElement(tagName) {
            return new FakeElement(tagName, documentRef);
        },
        addEventListener: vi.fn((type, callback) => {
            const callbacks = listeners.get(type) || [];
            callbacks.push(callback);
            listeners.set(type, callbacks);
        }),
        removeEventListener: vi.fn((type, callback) => {
            listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== callback));
        }),
        dispatch(type) {
            (listeners.get(type) || []).forEach((callback) => callback({ type }));
        }
    };
    return documentRef;
}

function createStorage() {
    const values = new Map();
    return {
        getItem: vi.fn((key) => values.get(key) || null),
        setItem: vi.fn((key, value) => values.set(key, String(value)))
    };
}

function createModalDouble() {
    const calls = [];
    const showModalRef = vi.fn((options) => {
        calls.push(options);
        let closed = false;
        return {
            element: options.content,
            overlay: new FakeElement('div', options.content.ownerDocument),
            close: vi.fn(() => {
                if (closed) return;
                closed = true;
                options.onClose?.();
            })
        };
    });
    return { calls, showModalRef };
}

function walk(root) {
    return [root, ...root.children.flatMap((child) => walk(child))];
}

function findByText(root, text) {
    return walk(root).find((element) => element.textContent === text) || null;
}

function findByTag(root, tagName) {
    return walk(root).find((element) => element.tagName === tagName.toUpperCase()) || null;
}

function findAllByTag(root, tagName) {
    return walk(root).filter((element) => element.tagName === tagName.toUpperCase());
}

function trainingContext(overrides = {}) {
    return {
        attemptId: 'attempt-intro-1',
        curriculumVersion: '1.0',
        semanticRole: 'scribe',
        team: 'blue',
        trainingMode: true,
        ...overrides
    };
}

function mount(overrides = {}) {
    const windowRef = createWindowDouble();
    const documentRef = createDocumentDouble(windowRef);
    const modal = createModalDouble();
    const storage = createStorage();
    const navigatorRef = { onLine: true };
    const onContinue = vi.fn();
    const onChangeProfile = vi.fn();
    const controller = showTrainingIntroModal({
        context: trainingContext(),
        documentRef,
        windowRef,
        navigatorRef,
        storage,
        showModalRef: modal.showModalRef,
        setTimeoutRef: vi.fn(() => 1),
        clearTimeoutRef: vi.fn(),
        onContinue,
        onChangeProfile,
        ...overrides
    });
    return {
        controller,
        documentRef,
        modal,
        navigatorRef,
        onChangeProfile,
        onContinue,
        storage,
        windowRef
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('training intro attempt state', () => {
    it('scopes viewed state to both attempt and curriculum version', () => {
        const first = trainingContext();
        const nextAttempt = trainingContext({ attemptId: 'attempt-intro-2' });
        const nextVersion = trainingContext({ curriculumVersion: '1.1' });

        expect(getTrainingIntroViewedKey(first)).not.toBe(getTrainingIntroViewedKey(nextAttempt));
        expect(getTrainingIntroViewedKey(first)).not.toBe(getTrainingIntroViewedKey(nextVersion));
    });
});

describe('showTrainingIntroModal', () => {
    it('requires a gesture to play with sound and exposes captions and the complete transcript', async () => {
        const { controller, modal } = mount();
        const root = controller.content;
        const video = findByTag(root, 'video');
        const track = findByTag(root, 'track');

        expect(video.autoplay).toBe(false);
        expect(video.play).not.toHaveBeenCalled();
        expect(track.kind).toBe('captions');
        expect(track.srclang).toBe('en');
        expect(track.default).toBe(true);
        expect(modal.calls[0].initialFocus.textContent).toBe('Play introduction with sound');

        track.dispatch('load');
        expect(track.parentNode.getAttribute('aria-describedby')).toContain('caption-status');

        findByText(root, 'Play introduction with sound').click();
        await Promise.resolve();
        expect(video.play).toHaveBeenCalledTimes(1);
        expect(video.muted).toBe(false);

        findByText(root, 'Show video transcript').click();
        const transcript = findByText(root, 'Video transcript').parentNode;
        expect(transcript.hidden).toBe(false);
        TRAINING_INTRO_TRANSCRIPT.forEach((paragraph) => {
            expect(findByText(transcript, paragraph)).toBeTruthy();
        });
        expect(TRAINING_INTRO_TRANSCRIPT.at(-1)).toContain(
            'a coordinated, observable, and reviewable simulation'
        );
        expect(controller.content.dataset.mediaState).toBe('playing');
        controller.close();
    });

    it('lets a learner skip video, confirm the semantic profile, and start the walkthrough', () => {
        const { controller, onContinue, storage } = mount();
        const root = controller.content;

        findByText(root, 'Continue to profile confirmation').click();

        expect(root.dataset.stage).toBe('profile');
        expect(findByText(root, 'Blue Team')).toBeTruthy();
        expect(findByText(root, 'Scribe')).toBeTruthy();
        expect(findByText(root, 'Change team or role')).toBeTruthy();
        findByText(root, 'Start guided walkthrough').click();

        expect(onContinue).toHaveBeenCalledWith(
            expect.objectContaining({ team: 'blue', semanticRole: 'scribe' }),
            { reason: 'confirmed' }
        );
        expect(hasViewedTrainingIntro(trainingContext(), storage)).toBe(true);
    });

    it('keeps replay available after first view while suppressing another automatic first-run modal', async () => {
        const first = mount();
        findByText(first.controller.content, 'Continue to profile confirmation').click();
        findByText(first.controller.content, 'Start guided walkthrough').click();

        const automatic = showTrainingIntroModal({
            context: trainingContext(),
            documentRef: first.documentRef,
            storage: first.storage,
            showModalRef: first.modal.showModalRef
        });
        expect(automatic).toBeNull();

        const replay = showTrainingIntroModal({
            context: trainingContext(),
            forceReplay: true,
            documentRef: first.documentRef,
            windowRef: first.windowRef,
            storage: first.storage,
            showModalRef: first.modal.showModalRef,
            setTimeoutRef: vi.fn(() => 1),
            clearTimeoutRef: vi.fn()
        });
        replay.video.currentTime = 42;
        findByText(replay.content, 'Replay video').click();
        await Promise.resolve();

        expect(replay.video.currentTime).toBe(0);
        expect(replay.video.play).toHaveBeenCalledTimes(1);
        replay.close();
    });

    it('provides decode, missing-media, offline, captions-unavailable, and retry recovery states', () => {
        const { controller, navigatorRef, windowRef } = mount();
        const root = controller.content;
        const video = findByTag(root, 'video');
        const track = findByTag(root, 'track');
        const retry = findByText(root, 'Retry video');

        video.error = { code: 3 };
        video.dispatch('error');
        expect(root.dataset.mediaState).toBe('decode');
        expect(retry.hidden).toBe(false);

        video.error = { code: 4 };
        video.dispatch('error');
        expect(root.dataset.mediaState).toBe('missing');

        track.dispatch('error');
        expect(findByText(
            root,
            'The separate caption track is unavailable. If the video plays, synchronized captions are also embedded in the picture. The complete text transcript is available below.'
        ).hidden).toBe(false);

        navigatorRef.onLine = false;
        windowRef.dispatch('offline');
        expect(root.dataset.mediaState).toBe('offline');
        expect(findByText(root, 'Continue to profile confirmation')).toBeTruthy();

        navigatorRef.onLine = true;
        retry.click();
        expect(video.load).toHaveBeenCalledTimes(1);
        expect(root.dataset.mediaState).toBe('loading');
        controller.close();
    });

    it('plays the complete 2:28 source and pauses only when it ends or closes', () => {
        const { controller } = mount();
        const video = controller.video;

        video.currentTime = 120;
        video.dispatch('timeupdate');

        expect(TRAINING_INTRO_DURATION_SECONDS).toBe(148);
        expect(controller.content.dataset.expectedDurationSeconds).toBe('148');
        expect(video.pause).not.toHaveBeenCalled();
        expect(controller.content.dataset.mediaState).toBe('loading');

        video.dispatch('ended');
        expect(controller.content.dataset.mediaState).toBe('ended');
        controller.close();
        expect(video.pause).toHaveBeenCalledTimes(1);
    });

    it('treats first-run Escape or close as an accessible skip instead of a blocker', () => {
        const { controller, onContinue, storage } = mount();

        controller.close();

        expect(onContinue).toHaveBeenCalledWith(
            expect.any(Object),
            { reason: 'dismissed' }
        );
        expect(hasViewedTrainingIntro(trainingContext(), storage)).toBe(true);
    });

    it('maps offline and decode failures without relying on color or sound', () => {
        expect(resolveTrainingIntroMediaState({ code: 3 }, { online: true })).toBe('decode');
        expect(resolveTrainingIntroMediaState({ code: 4 }, { online: true })).toBe('missing');
        expect(resolveTrainingIntroMediaState(null, { online: false })).toBe('offline');
    });

    it('allows returning to the landing flow to change team or semantic role', () => {
        const { controller, onChangeProfile } = mount();
        const root = controller.content;

        findByText(root, 'Continue to profile confirmation').click();
        findByText(root, 'Change team or role').click();

        expect(onChangeProfile).toHaveBeenCalledWith(
            expect.objectContaining({ team: 'blue', semanticRole: 'scribe' })
        );
    });

    it('renders only one English caption track', () => {
        const { controller } = mount();
        expect(findAllByTag(controller.content, 'track')).toHaveLength(1);
        controller.close();
    });
});
