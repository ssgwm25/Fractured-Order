import { getNarrationClip } from './audioManifest.js';

export const TRAINING_AUDIO_PREFERENCE_KEY = 'training:narration-preferences:v1';
export const TRAINING_AUDIO_PLAYBACK_RATES = Object.freeze([0.75, 1, 1.25, 1.5]);
export const TRAINING_AUDIO_FALLBACK_LABEL =
    'Approved narration is unavailable. Using this browser\'s default system voice as a degraded fallback.';

const DEFAULT_PREFERENCES = Object.freeze({
    muted: false,
    volume: 0.8,
    playbackRate: 1
});

let controlInstance = 0;

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function normalizePreferences(candidate = {}) {
    const volume = Number(candidate.volume);
    const playbackRate = Number(candidate.playbackRate);
    return {
        muted: candidate.muted === true,
        volume: Number.isFinite(volume) ? clamp(volume, 0, 1) : DEFAULT_PREFERENCES.volume,
        playbackRate: TRAINING_AUDIO_PLAYBACK_RATES.includes(playbackRate)
            ? playbackRate
            : DEFAULT_PREFERENCES.playbackRate
    };
}

function safeStorageRead(storage) {
    try {
        const value = storage?.getItem?.(TRAINING_AUDIO_PREFERENCE_KEY);
        return value ? normalizePreferences(JSON.parse(value)) : { ...DEFAULT_PREFERENCES };
    } catch (_error) {
        return { ...DEFAULT_PREFERENCES };
    }
}

function safeStorageWrite(storage, preferences) {
    try {
        storage?.setItem?.(TRAINING_AUDIO_PREFERENCE_KEY, JSON.stringify(preferences));
        return true;
    } catch (_error) {
        return false;
    }
}

function defaultAudioConstructor() {
    return typeof Audio !== 'undefined' ? Audio : null;
}

function defaultSpeechSynthesis() {
    return typeof window !== 'undefined' ? window.speechSynthesis : null;
}

function defaultUtteranceConstructor() {
    return typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null;
}

function createElement(documentRef, tagName, className = '', text = '') {
    const element = documentRef.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

export class TrainingAudioController {
    constructor({
        resolveClip = getNarrationClip,
        AudioConstructor = defaultAudioConstructor(),
        speechSynthesis = defaultSpeechSynthesis(),
        UtteranceConstructor = defaultUtteranceConstructor(),
        storage = typeof window !== 'undefined' ? window.localStorage : null,
        documentRef = typeof document !== 'undefined' ? document : null,
        windowRef = typeof window !== 'undefined' ? window : null,
        onStateChange = () => {}
    } = {}) {
        this.resolveClip = resolveClip;
        this.AudioConstructor = AudioConstructor;
        this.speechSynthesis = speechSynthesis;
        this.UtteranceConstructor = UtteranceConstructor;
        this.storage = storage;
        this.documentRef = documentRef;
        this.windowRef = windowRef;
        this.onStateChange = onStateChange;
        this.preferences = safeStorageRead(storage);
        this.state = Object.freeze({
            status: 'idle',
            clipId: null,
            mode: null,
            transcript: '',
            captionText: '',
            fallbackLabel: '',
            errorCode: null,
            preferences: Object.freeze({ ...this.preferences })
        });
        this.currentClip = null;
        this.currentAudio = null;
        this.nextAudio = null;
        this.currentUtterance = null;
        this.audioListeners = [];
        this.loadToken = 0;
        this.destroyed = false;
        this.controls = null;

        this.handleVisibilityChange = () => {
            if (this.documentRef?.visibilityState === 'hidden') this.stop('page-hidden');
        };
        this.handlePageHide = () => this.stop('page-hidden');
        this.handleExternalStop = (event) => this.stop(event?.type || 'external-stop');
        this.handleStepChange = (event) => {
            const detail = event?.detail || {};
            if (detail.clipId) {
                void this.setClip(detail.clipId, {
                    nextClipId: detail.nextClipId || null,
                    autoplay: detail.autoplay === true
                });
            } else {
                this.stop('step-change');
            }
        };

        this.documentRef?.addEventListener?.('visibilitychange', this.handleVisibilityChange);
        this.documentRef?.addEventListener?.('training:step-change', this.handleStepChange);
        this.documentRef?.addEventListener?.('training:modal-close', this.handleExternalStop);
        this.documentRef?.addEventListener?.('training:exit', this.handleExternalStop);
        this.windowRef?.addEventListener?.('pagehide', this.handlePageHide);
    }

    getState() {
        return this.state;
    }

    emit(patch) {
        if (this.destroyed) return this.state;
        this.state = Object.freeze({
            ...this.state,
            ...patch,
            preferences: Object.freeze({ ...this.preferences })
        });
        this.renderControls();
        this.onStateChange(this.state);
        return this.state;
    }

    applyPreferences(audio) {
        if (!audio) return;
        audio.muted = this.preferences.muted;
        audio.volume = this.preferences.volume;
        audio.playbackRate = this.preferences.playbackRate;
    }

    listenToAudio(audio, type, handler) {
        audio?.addEventListener?.(type, handler);
        this.audioListeners.push([audio, type, handler]);
    }

    releaseCurrentAudio() {
        this.audioListeners.forEach(([audio, type, handler]) => {
            audio?.removeEventListener?.(type, handler);
        });
        this.audioListeners = [];
        try {
            this.currentAudio?.pause?.();
        } catch (_error) {
            // Teardown must remain safe for partial browser media implementations.
        }
        if (this.currentAudio) {
            this.currentAudio.removeAttribute?.('src');
            this.currentAudio.load?.();
        }
        this.currentAudio = null;
    }

    releaseNextAudio() {
        try {
            this.nextAudio?.pause?.();
        } catch (_error) {
            // Prefetch teardown is best-effort.
        }
        if (this.nextAudio) {
            this.nextAudio.removeAttribute?.('src');
            this.nextAudio.load?.();
        }
        this.nextAudio = null;
    }

    cancelSpeech() {
        try {
            this.speechSynthesis?.cancel?.();
        } catch (_error) {
            // System speech is degraded-only and must never block training teardown.
        }
        this.currentUtterance = null;
    }

    syncCaption(currentTime = 0) {
        const cues = this.currentClip?.cues || [];
        const cue = cues.find((candidate) => (
            currentTime >= candidate.startSeconds && currentTime < candidate.endSeconds
        ));
        const captionText = cue?.text || (this.state.status === 'playing' ? this.currentClip?.text || '' : '');
        if (captionText !== this.state.captionText) this.emit({ captionText });
    }

    prefetch(nextClipId) {
        this.releaseNextAudio();
        if (!nextClipId || !this.AudioConstructor) return;
        const clip = this.resolveClip(nextClipId);
        if (!clip?.audioUrl) return;
        const audio = new this.AudioConstructor();
        audio.preload = 'metadata';
        audio.src = clip.audioUrl;
        this.nextAudio = audio;
    }

    async setClip(clipId, { nextClipId = null, autoplay = false } = {}) {
        if (this.destroyed) return false;
        const token = ++this.loadToken;
        this.releaseCurrentAudio();
        this.releaseNextAudio();
        this.cancelSpeech();
        this.currentClip = this.resolveClip(clipId, { approvedOnly: false });

        if (!this.currentClip) {
            this.emit({
                status: 'unavailable',
                clipId,
                mode: null,
                transcript: '',
                captionText: '',
                fallbackLabel: 'Narration is unavailable. Continue with the visible lesson text.',
                errorCode: 'missing-manifest-entry'
            });
            return false;
        }

        this.emit({
            status: 'loading',
            clipId,
            mode: 'file',
            transcript: this.currentClip.text,
            captionText: '',
            fallbackLabel: '',
            errorCode: null
        });

        const approvedClip = this.resolveClip(clipId);
        if (!approvedClip?.audioUrl || !this.AudioConstructor) {
            return this.enterFallback({ autoplay, errorCode: 'approved-file-unavailable' });
        }

        this.currentClip = approvedClip;
        const audio = new this.AudioConstructor();
        audio.preload = 'auto';
        audio.src = approvedClip.audioUrl;
        this.applyPreferences(audio);
        this.currentAudio = audio;

        const stillCurrent = () => token === this.loadToken && audio === this.currentAudio;
        this.listenToAudio(audio, 'loadedmetadata', () => {
            if (stillCurrent()) this.emit({ status: 'ready', mode: 'file' });
        });
        this.listenToAudio(audio, 'play', () => {
            if (stillCurrent()) {
                this.emit({ status: 'playing', mode: 'file', fallbackLabel: '', errorCode: null });
                this.syncCaption(audio.currentTime || 0);
            }
        });
        this.listenToAudio(audio, 'pause', () => {
            if (stillCurrent() && !audio.ended) this.emit({ status: 'paused', captionText: '' });
        });
        this.listenToAudio(audio, 'timeupdate', () => {
            if (stillCurrent()) this.syncCaption(audio.currentTime || 0);
        });
        this.listenToAudio(audio, 'ended', () => {
            if (stillCurrent()) this.emit({ status: 'ended', captionText: '' });
        });
        this.listenToAudio(audio, 'error', () => {
            if (stillCurrent()) void this.enterFallback({ autoplay: true, errorCode: 'file-load-failed' });
        });
        this.prefetch(nextClipId);

        if (autoplay && token === this.loadToken) return this.play();
        return true;
    }

    async enterFallback({ autoplay = false, errorCode = 'file-load-failed' } = {}) {
        this.releaseCurrentAudio();
        this.emit({
            status: 'degraded',
            mode: 'web-speech',
            captionText: '',
            fallbackLabel: TRAINING_AUDIO_FALLBACK_LABEL,
            errorCode
        });
        if (autoplay) return this.playFallback();
        return false;
    }

    playFallback() {
        if (!this.currentClip?.text || !this.speechSynthesis || !this.UtteranceConstructor) {
            this.emit({
                status: 'unavailable',
                mode: null,
                fallbackLabel: 'Audio is unavailable. Continue with the visible lesson text.',
                errorCode: 'web-speech-unavailable'
            });
            return false;
        }
        if (this.preferences.muted) {
            this.emit({ status: 'paused', mode: 'web-speech', captionText: '' });
            return false;
        }

        this.cancelSpeech();
        const utterance = new this.UtteranceConstructor(this.currentClip.text);
        utterance.rate = this.preferences.playbackRate;
        utterance.volume = this.preferences.volume;
        utterance.onstart = () => {
            if (utterance !== this.currentUtterance) return;
            this.emit({
                status: 'playing',
                mode: 'web-speech',
                captionText: this.currentClip.text,
                fallbackLabel: TRAINING_AUDIO_FALLBACK_LABEL
            });
        };
        utterance.onend = () => {
            if (utterance !== this.currentUtterance) return;
            this.currentUtterance = null;
            this.emit({ status: 'ended', captionText: '' });
        };
        utterance.onerror = () => {
            if (utterance !== this.currentUtterance) return;
            this.currentUtterance = null;
            this.emit({
                status: 'unavailable',
                captionText: '',
                fallbackLabel: 'Audio is unavailable. Continue with the visible lesson text.',
                errorCode: 'web-speech-failed'
            });
        };
        this.currentUtterance = utterance;
        this.emit({
            status: 'degraded',
            mode: 'web-speech',
            fallbackLabel: TRAINING_AUDIO_FALLBACK_LABEL
        });
        this.speechSynthesis.speak(utterance);
        return true;
    }

    async play() {
        if (this.destroyed || !this.currentClip) return false;
        if (this.state.mode === 'web-speech' || !this.currentAudio) return this.playFallback();
        const audio = this.currentAudio;
        const token = this.loadToken;
        if (this.state.status === 'ended') audio.currentTime = 0;
        try {
            await Promise.resolve(audio.play?.());
            if (audio !== this.currentAudio || token !== this.loadToken) return false;
            return true;
        } catch (_error) {
            if (audio !== this.currentAudio || token !== this.loadToken) return false;
            return this.enterFallback({ autoplay: true, errorCode: 'file-play-rejected' });
        }
    }

    pause() {
        if (this.destroyed) return;
        if (this.state.mode === 'web-speech') {
            this.cancelSpeech();
            this.emit({ status: 'paused', captionText: '' });
            return;
        }
        this.currentAudio?.pause?.();
        this.emit({ status: 'paused', captionText: '' });
    }

    async replay() {
        if (!this.currentClip) return false;
        if (this.state.mode === 'web-speech' || !this.currentAudio) return this.playFallback();
        this.currentAudio.currentTime = 0;
        return this.play();
    }

    stop(reason = 'stopped') {
        if (this.destroyed) return;
        ++this.loadToken;
        this.cancelSpeech();
        this.releaseNextAudio();
        try {
            this.currentAudio?.pause?.();
            if (this.currentAudio) this.currentAudio.currentTime = 0;
        } catch (_error) {
            // Stop must be safe during navigation and document teardown.
        }
        this.emit({ status: 'stopped', captionText: '', errorCode: reason });
    }

    updatePreferences(patch) {
        this.preferences = normalizePreferences({ ...this.preferences, ...patch });
        this.applyPreferences(this.currentAudio);
        safeStorageWrite(this.storage, this.preferences);
        this.emit({});
        return Object.freeze({ ...this.preferences });
    }

    setMuted(muted) {
        const preferences = this.updatePreferences({ muted: Boolean(muted) });
        if (preferences.muted && this.state.mode === 'web-speech' && this.state.status === 'playing') {
            this.cancelSpeech();
            this.emit({ status: 'paused', captionText: '' });
        }
        return preferences;
    }

    setVolume(volume) {
        return this.updatePreferences({ volume: Number(volume) });
    }

    setPlaybackRate(playbackRate) {
        return this.updatePreferences({ playbackRate: Number(playbackRate) });
    }

    mountControls(container, { documentRef = this.documentRef } = {}) {
        if (!container || !documentRef?.createElement) return null;
        this.unmountControls();
        controlInstance += 1;
        const id = `training-audio-${controlInstance}`;
        const root = createElement(documentRef, 'section', 'training-audio-controls');
        root.setAttribute('aria-label', 'Guided narration controls');

        const actions = createElement(documentRef, 'div', 'training-audio-actions');
        const playButton = createElement(documentRef, 'button', 'btn btn-secondary btn-sm', 'Play narration');
        playButton.type = 'button';
        const replayButton = createElement(documentRef, 'button', 'btn btn-secondary btn-sm', 'Replay');
        replayButton.type = 'button';
        replayButton.setAttribute('aria-label', 'Replay narration from the beginning');
        const muteButton = createElement(documentRef, 'button', 'btn btn-secondary btn-sm', 'Mute');
        muteButton.type = 'button';
        muteButton.setAttribute('aria-pressed', String(this.preferences.muted));
        actions.append(playButton, replayButton, muteButton);

        const settings = createElement(documentRef, 'div', 'training-audio-settings');
        const volumeLabel = createElement(documentRef, 'label', '', 'Narration volume');
        volumeLabel.htmlFor = `${id}-volume`;
        const volume = createElement(documentRef, 'input');
        volume.id = `${id}-volume`;
        volume.type = 'range';
        volume.min = '0';
        volume.max = '1';
        volume.step = '0.05';
        volume.value = String(this.preferences.volume);
        const rateLabel = createElement(documentRef, 'label', '', 'Playback speed');
        rateLabel.htmlFor = `${id}-rate`;
        const rate = createElement(documentRef, 'select');
        rate.id = `${id}-rate`;
        TRAINING_AUDIO_PLAYBACK_RATES.forEach((value) => {
            const option = createElement(documentRef, 'option', '', `${value}×`);
            option.value = String(value);
            option.selected = value === this.preferences.playbackRate;
            rate.appendChild(option);
        });
        settings.append(volumeLabel, volume, rateLabel, rate);

        const status = createElement(documentRef, 'p', 'training-audio-status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.setAttribute('aria-atomic', 'true');
        const caption = createElement(documentRef, 'p', 'training-audio-caption');
        caption.setAttribute('aria-live', 'off');
        caption.hidden = true;
        const transcriptHeading = createElement(documentRef, 'h3', 'training-audio-transcript-title', 'Narration transcript');
        transcriptHeading.id = `${id}-transcript-title`;
        const transcript = createElement(documentRef, 'p', 'training-audio-transcript');
        transcript.setAttribute('aria-labelledby', transcriptHeading.id);
        root.append(actions, settings, status, caption, transcriptHeading, transcript);
        container.appendChild(root);

        playButton.addEventListener('click', () => {
            if (this.state.status === 'playing') this.pause();
            else void this.play();
        });
        replayButton.addEventListener('click', () => void this.replay());
        muteButton.addEventListener('click', () => this.setMuted(!this.preferences.muted));
        volume.addEventListener('input', () => this.setVolume(volume.value));
        rate.addEventListener('change', () => this.setPlaybackRate(rate.value));

        this.controls = { root, playButton, replayButton, muteButton, volume, rate, status, caption, transcript };
        this.renderControls();
        return root;
    }

    renderControls() {
        if (!this.controls) return;
        const { playButton, muteButton, volume, rate, status, caption, transcript } = this.controls;
        playButton.textContent = this.state.status === 'playing' ? 'Pause narration' : 'Play narration';
        muteButton.textContent = this.preferences.muted ? 'Unmute' : 'Mute';
        muteButton.setAttribute('aria-pressed', String(this.preferences.muted));
        volume.value = String(this.preferences.volume);
        rate.value = String(this.preferences.playbackRate);
        status.textContent = this.state.fallbackLabel || (
            this.state.status === 'playing' ? 'Narration playing.' : ''
        );
        caption.textContent = this.state.captionText;
        caption.hidden = !this.state.captionText;
        transcript.textContent = this.state.transcript;
    }

    unmountControls() {
        this.controls?.root?.remove?.();
        this.controls = null;
    }

    destroy() {
        if (this.destroyed) return;
        this.stop('teardown');
        this.releaseCurrentAudio();
        this.releaseNextAudio();
        this.cancelSpeech();
        this.unmountControls();
        this.documentRef?.removeEventListener?.('visibilitychange', this.handleVisibilityChange);
        this.documentRef?.removeEventListener?.('training:step-change', this.handleStepChange);
        this.documentRef?.removeEventListener?.('training:modal-close', this.handleExternalStop);
        this.documentRef?.removeEventListener?.('training:exit', this.handleExternalStop);
        this.windowRef?.removeEventListener?.('pagehide', this.handlePageHide);
        this.destroyed = true;
        this.state = Object.freeze({ ...this.state, status: 'destroyed', captionText: '' });
    }
}

export default TrainingAudioController;
