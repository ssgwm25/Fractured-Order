import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    TRAINING_AUDIO_FALLBACK_LABEL,
    TRAINING_AUDIO_PREFERENCE_KEY,
    TrainingAudioController
} from './TrainingAudioController.js';

class FakeEventTarget {
    constructor() {
        this.listeners = new Map();
        this.visibilityState = 'visible';
    }

    addEventListener(type, handler) {
        const handlers = this.listeners.get(type) || new Set();
        handlers.add(handler);
        this.listeners.set(type, handlers);
    }

    removeEventListener(type, handler) {
        this.listeners.get(type)?.delete(handler);
    }

    dispatch(type, detail = null) {
        [...(this.listeners.get(type) || [])].forEach((handler) => handler({ type, detail }));
    }
}

class FakeAudio extends FakeEventTarget {
    static instances = [];
    static playImplementations = [];

    constructor() {
        super();
        this.preload = '';
        this.src = '';
        this.currentTime = 0;
        this.ended = false;
        this.muted = false;
        this.volume = 1;
        this.playbackRate = 1;
        this.pause = vi.fn();
        this.load = vi.fn();
        this.removeAttribute = vi.fn((name) => {
            if (name === 'src') this.src = '';
        });
        const implementation = FakeAudio.playImplementations.shift();
        this.play = vi.fn(implementation || (() => Promise.resolve()));
        FakeAudio.instances.push(this);
    }
}

class FakeElement extends FakeEventTarget {
    constructor(tagName) {
        super();
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.attributes = new Map();
        this.textContent = '';
        this.hidden = false;
        this.value = '';
        this.removed = false;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    append(...children) {
        this.children.push(...children);
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    remove() {
        this.removed = true;
    }
}

class FakeDocument extends FakeEventTarget {
    createElement(tagName) {
        return new FakeElement(tagName);
    }
}

class FakeUtterance {
    constructor(text) {
        this.text = text;
        this.rate = 1;
        this.volume = 1;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
    }
}

function storageDouble() {
    const values = new Map();
    return {
        getItem: vi.fn((key) => values.get(key) ?? null),
        setItem: vi.fn((key, value) => values.set(key, value)),
        values
    };
}

function clip(id) {
    return {
        id,
        text: `Visible transcript for ${id}.`,
        audioUrl: `/training/audio/clips/${id}.mp3`,
        captionsUrl: `/training/audio/captions/${id}.vtt`,
        cues: [{ startSeconds: 0, endSeconds: 3, text: `Caption for ${id}.` }]
    };
}

function approvedResolver(entries) {
    return (id) => entries[id] || null;
}

function pendingResolver(entries) {
    return (id, { approvedOnly = true } = {}) => approvedOnly ? null : entries[id] || null;
}

function speechDouble() {
    return {
        cancel: vi.fn(),
        speak: vi.fn((utterance) => utterance.onstart?.())
    };
}

function makeController(overrides = {}) {
    const documentRef = overrides.documentRef || new FakeEventTarget();
    const windowRef = overrides.windowRef || new FakeEventTarget();
    const speechSynthesis = overrides.speechSynthesis || speechDouble();
    return {
        documentRef,
        windowRef,
        speechSynthesis,
        controller: new TrainingAudioController({
            resolveClip: approvedResolver({ first: clip('first'), second: clip('second') }),
            AudioConstructor: FakeAudio,
            UtteranceConstructor: FakeUtterance,
            speechSynthesis,
            storage: storageDouble(),
            documentRef,
            windowRef,
            ...overrides
        })
    };
}

describe('TrainingAudioController', () => {
    beforeEach(() => {
        FakeAudio.instances = [];
        FakeAudio.playImplementations = [];
    });

    it('moves through ready, playing, paused, replayed, and ended file states', async () => {
        const { controller } = makeController();

        await controller.setClip('first', { nextClipId: 'second' });
        const current = FakeAudio.instances[0];
        const next = FakeAudio.instances[1];
        expect(controller.getState()).toMatchObject({ status: 'loading', clipId: 'first', mode: 'file' });
        expect(current.preload).toBe('auto');
        expect(next.preload).toBe('metadata');

        current.dispatch('loadedmetadata');
        expect(controller.getState().status).toBe('ready');
        await controller.play();
        current.dispatch('play');
        current.currentTime = 1;
        current.dispatch('timeupdate');
        expect(controller.getState()).toMatchObject({
            status: 'playing',
            captionText: 'Caption for first.'
        });

        controller.pause();
        expect(controller.getState().status).toBe('paused');
        await controller.replay();
        expect(current.currentTime).toBe(0);
        current.ended = true;
        current.dispatch('ended');
        expect(controller.getState()).toMatchObject({ status: 'ended', captionText: '' });
    });

    it('persists mute, volume, and playback rate per browser', () => {
        const storage = storageDouble();
        const first = makeController({ storage }).controller;
        first.setMuted(true);
        first.setVolume(0.45);
        first.setPlaybackRate(1.25);

        expect(storage.setItem).toHaveBeenLastCalledWith(
            TRAINING_AUDIO_PREFERENCE_KEY,
            JSON.stringify({ muted: true, volume: 0.45, playbackRate: 1.25 })
        );

        const second = makeController({ storage }).controller;
        expect(second.getState().preferences).toEqual({
            muted: true,
            volume: 0.45,
            playbackRate: 1.25
        });
    });

    it('starts narration from role confirmation and continues it on later steps', async () => {
        const { controller, documentRef } = makeController();
        await controller.setClip('first');
        const firstAudio = FakeAudio.instances[0];

        documentRef.dispatch('training:intro-complete', { reason: 'confirmed' });
        expect(controller.isAutoplayEnabled()).toBe(true);
        expect(firstAudio.play).toHaveBeenCalledTimes(1);

        await controller.setClip('second', { autoplay: controller.isAutoplayEnabled() });
        expect(FakeAudio.instances[1].play).toHaveBeenCalledTimes(1);
    });

    it('does not start narration when role confirmation is dismissed or narration is muted', async () => {
        const { controller, documentRef } = makeController();
        await controller.setClip('first');
        const firstAudio = FakeAudio.instances[0];

        documentRef.dispatch('training:intro-complete', { reason: 'dismissed' });
        expect(controller.isAutoplayEnabled()).toBe(false);
        expect(firstAudio.play).not.toHaveBeenCalled();

        controller.setMuted(true);
        documentRef.dispatch('training:intro-complete', { reason: 'confirmed' });
        expect(controller.isAutoplayEnabled()).toBe(false);
        expect(firstAudio.play).not.toHaveBeenCalled();
    });

    it('mounts native, labelled controls and keeps the spoken text visible', async () => {
        const documentRef = new FakeDocument();
        const container = new FakeElement('div');
        const { controller } = makeController({ documentRef });
        const root = controller.mountControls(container);

        expect(root.tagName).toBe('SECTION');
        expect(root.attributes.get('aria-label')).toBe('Guided narration controls');
        expect(controller.controls.playButton.tagName).toBe('BUTTON');
        expect(controller.controls.replayButton.attributes.get('aria-label')).toBe(
            'Replay narration from the beginning'
        );
        expect(controller.controls.volume.tagName).toBe('INPUT');
        expect(controller.controls.rate.tagName).toBe('SELECT');

        await controller.setClip('first');
        expect(controller.controls.transcript.textContent).toBe('Visible transcript for first.');
    });

    it('mounts only essential visible controls in compact coach mode', async () => {
        const documentRef = new FakeDocument();
        const container = new FakeElement('div');
        const { controller } = makeController({ documentRef });
        const root = controller.mountControls(container, { compact: true });

        expect(root.className).toContain('training-audio-controls--compact');
        expect(controller.controls.compact).toBe(true);
        expect(controller.controls.root.children).not.toContain(controller.controls.volume);
        expect(controller.controls.root.children).not.toContain(controller.controls.rate);
        expect(controller.controls.root.children).not.toContain(controller.controls.replayButton);
        expect(controller.controls.root.children[0].children).toEqual([
            controller.controls.playButton,
            controller.controls.muteButton
        ]);
        expect(controller.controls.playButton.textContent).toBe('Play');

        await controller.setClip('first');
        expect(controller.controls.transcript.textContent).toBe('Visible transcript for first.');
        expect(controller.controls.transcript.className).toBe('sr-only');
    });

    it('invalidates a rejected play promise when a rapid step change replaces its clip', async () => {
        let rejectFirstPlay;
        FakeAudio.playImplementations.push(() => new Promise((_resolve, reject) => {
            rejectFirstPlay = reject;
        }));
        const { controller, speechSynthesis } = makeController();
        await controller.setClip('first');
        const stalePlay = controller.play();

        await controller.setClip('second');
        rejectFirstPlay(new Error('stale playback failure'));
        await stalePlay;

        expect(controller.getState()).toMatchObject({ clipId: 'second', status: 'loading', mode: 'file' });
        expect(speechSynthesis.speak).not.toHaveBeenCalled();
    });

    it('labels and starts degraded Web Speech after a current file play rejection', async () => {
        FakeAudio.playImplementations.push(() => Promise.reject(new Error('NotSupportedError')));
        const { controller, speechSynthesis } = makeController();
        await controller.setClip('first');

        expect(await controller.play()).toBe(true);
        expect(speechSynthesis.speak).toHaveBeenCalledTimes(1);
        expect(controller.getState()).toMatchObject({
            status: 'playing',
            mode: 'web-speech',
            fallbackLabel: TRAINING_AUDIO_FALLBACK_LABEL,
            errorCode: 'file-play-rejected',
            captionText: 'Visible transcript for first.'
        });
    });

    it('fails closed for a missing manifest entry and exposes fallback for an unapproved clip', async () => {
        const missing = makeController({ resolveClip: approvedResolver({}) }).controller;
        expect(await missing.setClip('missing')).toBe(false);
        expect(missing.getState()).toMatchObject({
            status: 'unavailable',
            errorCode: 'missing-manifest-entry'
        });

        const pending = makeController({
            resolveClip: pendingResolver({ pending: clip('pending') })
        }).controller;
        expect(await pending.setClip('pending')).toBe(false);
        expect(pending.getState()).toMatchObject({
            status: 'degraded',
            mode: 'web-speech',
            fallbackLabel: TRAINING_AUDIO_FALLBACK_LABEL,
            transcript: 'Visible transcript for pending.'
        });
    });

    it('stops on step, modal, exit, page-hidden, and teardown boundaries', async () => {
        const { controller, documentRef, windowRef, speechSynthesis } = makeController();
        await controller.setClip('first', { nextClipId: 'second' });
        const audio = FakeAudio.instances[0];
        const prefetched = FakeAudio.instances[1];

        documentRef.dispatch('training:modal-close');
        expect(controller.getState()).toMatchObject({ status: 'stopped', errorCode: 'training:modal-close' });
        documentRef.dispatch('training:exit');
        documentRef.dispatch('training:step-change');
        documentRef.visibilityState = 'hidden';
        documentRef.dispatch('visibilitychange');
        windowRef.dispatch('pagehide');
        expect(audio.pause).toHaveBeenCalled();
        expect(prefetched.pause).toHaveBeenCalled();
        expect(speechSynthesis.cancel).toHaveBeenCalled();

        controller.destroy();
        expect(controller.getState().status).toBe('destroyed');
        expect(documentRef.listeners.get('visibilitychange').size).toBe(0);
        expect(documentRef.listeners.get('training:intro-complete').size).toBe(0);
        expect(windowRef.listeners.get('pagehide').size).toBe(0);
    });
});
