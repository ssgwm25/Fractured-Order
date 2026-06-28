import { createLogger } from '../../utils/logger.js';
import {
    getSessionRecorderRuntimeState,
    isSessionRecorderNoticeActive,
    setSessionRecorderRuntimeStateInPluginState
} from './registry.js';

const logger = createLogger('SessionRecorderPlugin');

export const SESSION_RECORDER_PLUGIN_ID = 'session-recorder';
export const SESSION_RECORDER_ARTIFACT_STORAGE_KEY = 'esg_session_recording_artifacts_v1';
export const SESSION_RECORDER_TIMESLICE_MS = 5000;
export const SESSION_RECORDER_MEMORY_WARNING_BYTES = 50 * 1024 * 1024;
export const SESSION_RECORDER_MAX_ARTIFACTS_PER_SESSION = 50;

export const SESSION_RECORDER_RUNTIME_STATES = Object.freeze({
    IDLE: 'idle',
    RECORDING: 'recording',
    PAUSED: 'paused'
});

export const SESSION_RECORDER_PREFERRED_MIME_TYPES = Object.freeze([
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
]);

export const SESSION_RECORDER_REQUESTED_AUDIO_BITRATES = Object.freeze([
    256000,
    192000,
    160000,
    128000
]);

const SESSION_RECORDER_STYLE_ID = 'session-recorder-plugin-style';
const SESSION_RECORDING_NOTICE_ID = 'sessionRecordingNotice';
const SESSION_RECORDING_NOTICE_STYLE_ID = 'session-recording-notice-style';

function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}

function escapeHtml(value = '') {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

function normalizeIso(value) {
    if (!value) {
        return null;
    }

    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function getStorage(storage = globalThis.localStorage) {
    return storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
        ? storage
        : null;
}

function parseStoredArtifacts(storage) {
    const storageRef = getStorage(storage);
    if (!storageRef) {
        return [];
    }

    try {
        const rawValue = storageRef.getItem(SESSION_RECORDER_ARTIFACT_STORAGE_KEY);
        const parsed = rawValue ? JSON.parse(rawValue) : [];
        return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object') : [];
    } catch (error) {
        logger.warn('Failed to parse session recording artifact storage:', error);
        return [];
    }
}

function persistArtifacts(artifacts, storage = globalThis.localStorage) {
    const storageRef = getStorage(storage);
    if (!storageRef) {
        throw new Error('Browser storage is unavailable for session recording artifact metadata.');
    }

    storageRef.setItem(SESSION_RECORDER_ARTIFACT_STORAGE_KEY, JSON.stringify(artifacts));
}

function getExtensionForMimeType(mimeType = '') {
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('mp4')) return 'mp4';
    return 'webm';
}

function formatDuration(seconds = 0) {
    const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatBytes(bytes = 0) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) {
        return '0 KB';
    }

    if (value < 1024 * 1024) {
        return `${Math.ceil(value / 1024)} KB`;
    }

    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveSessionId(sessionStoreRef, gameState = null) {
    return sessionStoreRef?.getSessionId?.()
        || gameState?.session_id
        || sessionStoreRef?.getSessionData?.()?.id
        || sessionStoreRef?.getSessionData?.()?.sessionId
        || null;
}

function resolveOperatorRole(sessionStoreRef, fallbackRole = null) {
    return fallbackRole
        || sessionStoreRef?.getRole?.()
        || sessionStoreRef?.getSessionData?.()?.role
        || 'whitecell';
}

function resolveOperatorLabel(sessionStoreRef, fallbackLabel = null) {
    const operatorAuth = sessionStoreRef?.getOperatorAuth?.();
    return fallbackLabel
        || operatorAuth?.operatorName
        || sessionStoreRef?.getUserName?.()
        || sessionStoreRef?.getSessionData?.()?.displayName
        || resolveOperatorRole(sessionStoreRef);
}

function buildObjectUrlLifecycle(objectUrl = null) {
    return objectUrl
        ? 'current_browser_document'
        : 'none';
}

function sanitizeFilenamePart(value = '') {
    const normalized = String(value || '')
        .trim()
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || 'session';
}

export function getSessionRecorderMicrophoneConstraints({
    mediaDevices = globalThis.navigator?.mediaDevices
} = {}) {
    const supportedConstraints = typeof mediaDevices?.getSupportedConstraints === 'function'
        ? mediaDevices.getSupportedConstraints()
        : {};
    const audio = {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true }
    };

    if (supportedConstraints.sampleRate !== false) {
        audio.sampleRate = { ideal: 48000 };
    }

    if (supportedConstraints.channelCount !== false) {
        audio.channelCount = { ideal: 1 };
    }

    return { audio };
}

export function getSupportedSessionRecorderMimeType(
    mediaRecorderCtor = globalThis.MediaRecorder,
    candidates = SESSION_RECORDER_PREFERRED_MIME_TYPES
) {
    if (!mediaRecorderCtor || typeof mediaRecorderCtor.isTypeSupported !== 'function') {
        return '';
    }

    return candidates.find((mimeType) => mediaRecorderCtor.isTypeSupported(mimeType)) || '';
}

export function createSessionRecorderMediaRecorder(stream, {
    mediaRecorderCtor = globalThis.MediaRecorder,
    mimeType,
    bitrateCandidates = SESSION_RECORDER_REQUESTED_AUDIO_BITRATES
} = {}) {
    if (!mediaRecorderCtor) {
        throw new Error('MediaRecorder is not supported in this browser.');
    }

    const failures = [];
    for (const bitrate of bitrateCandidates) {
        try {
            const recorder = new mediaRecorderCtor(stream, {
                mimeType,
                audioBitsPerSecond: bitrate
            });
            return {
                recorder,
                audioBitsPerSecondRequested: bitrate,
                audioBitsPerSecondUsed: recorder.audioBitsPerSecond || bitrate
            };
        } catch (error) {
            failures.push(error);
        }
    }

    try {
        const recorder = new mediaRecorderCtor(stream, { mimeType });
        return {
            recorder,
            audioBitsPerSecondRequested: null,
            audioBitsPerSecondUsed: recorder.audioBitsPerSecond || null
        };
    } catch (error) {
        failures.push(error);
        throw failures.at(-1) || error;
    }
}

export function buildSessionRecordingId(now = Date.now()) {
    const cryptoRef = globalThis.crypto;
    const randomId = typeof cryptoRef?.randomUUID === 'function'
        ? cryptoRef.randomUUID()
        : Math.random().toString(36).slice(2, 12);

    return `session-recording-${now}-${randomId}`;
}

export function buildSessionRecordingFilename({
    sessionId,
    recordingId,
    startedAtUtc,
    mimeType
} = {}) {
    const sessionPart = sanitizeFilenamePart(String(sessionId || 'session').slice(0, 12));
    const timestampPart = sanitizeFilenamePart(
        normalizeIso(startedAtUtc)?.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') || new Date().toISOString()
    );
    const recordingPart = sanitizeFilenamePart(String(recordingId || 'recording').slice(-12));
    const extension = getExtensionForMimeType(mimeType);

    return `session-recording-${sessionPart}-${timestampPart}-${recordingPart}.${extension}`;
}

export function buildSessionRecordingArtifact({
    sessionId,
    recordingId,
    startedAtUtc,
    stoppedAtUtc,
    durationSeconds,
    mimeType,
    fileSizeBytes,
    generatedByRole,
    generatedByUser,
    pluginId = SESSION_RECORDER_PLUGIN_ID,
    filename,
    storageReference,
    objectUrl,
    captureConstraintsRequested,
    recorderMimeTypeSelected,
    audioBitsPerSecondRequested,
    audioBitsPerSecondUsed,
    createdAtUtc = new Date().toISOString()
} = {}) {
    return {
        session_id: sessionId || null,
        recording_id: recordingId || null,
        started_utc: normalizeIso(startedAtUtc),
        stopped_utc: normalizeIso(stoppedAtUtc),
        duration_seconds: Number.isFinite(Number(durationSeconds))
            ? Number(durationSeconds)
            : null,
        mime_type: mimeType || null,
        file_size_bytes: Number.isFinite(Number(fileSizeBytes))
            ? Number(fileSizeBytes)
            : null,
        generated_by_role: generatedByRole || null,
        generated_by_user: generatedByUser || null,
        plugin_id: pluginId,
        filename: filename || null,
        storage_reference: storageReference || null,
        object_url: objectUrl || null,
        object_url_lifecycle: buildObjectUrlLifecycle(objectUrl),
        capture_constraints_requested: safeObject(captureConstraintsRequested),
        recorder_mime_type_selected: recorderMimeTypeSelected || mimeType || null,
        audio_bits_per_second_requested: audioBitsPerSecondRequested ?? null,
        audio_bits_per_second_used: audioBitsPerSecondUsed ?? null,
        created_at_utc: normalizeIso(createdAtUtc)
    };
}

export function getStoredSessionRecordingArtifacts(sessionId = null, {
    storage = globalThis.localStorage
} = {}) {
    const artifacts = parseStoredArtifacts(storage);
    const filteredArtifacts = sessionId
        ? artifacts.filter((artifact) => artifact?.session_id === sessionId)
        : artifacts;

    return filteredArtifacts.sort((left, right) => (
        String(left?.started_utc || '').localeCompare(String(right?.started_utc || ''))
    ));
}

export function saveSessionRecordingArtifact(artifact, {
    storage = globalThis.localStorage
} = {}) {
    if (!artifact?.session_id || !artifact?.recording_id) {
        throw new Error('Session recording artifact metadata requires session_id and recording_id.');
    }

    const artifacts = parseStoredArtifacts(storage)
        .filter((entry) => entry?.recording_id !== artifact.recording_id);
    const sessionArtifacts = artifacts
        .filter((entry) => entry?.session_id === artifact.session_id)
        .concat(artifact)
        .sort((left, right) => String(right?.started_utc || '').localeCompare(String(left?.started_utc || '')));
    const otherArtifacts = artifacts.filter((entry) => entry?.session_id !== artifact.session_id);
    const nextArtifacts = [
        ...otherArtifacts,
        ...sessionArtifacts.slice(0, SESSION_RECORDER_MAX_ARTIFACTS_PER_SESSION)
    ].slice(-SESSION_RECORDER_MAX_ARTIFACTS_PER_SESSION * 4);

    persistArtifacts(nextArtifacts, storage);
    return artifact;
}

export function removeSessionRecordingArtifact(recordingId, {
    storage = globalThis.localStorage
} = {}) {
    if (!recordingId) {
        return false;
    }

    const artifacts = parseStoredArtifacts(storage);
    const nextArtifacts = artifacts.filter((artifact) => artifact?.recording_id !== recordingId);
    persistArtifacts(nextArtifacts, storage);
    return nextArtifacts.length !== artifacts.length;
}

function ensureSessionRecorderStyles(documentRef = globalThis.document) {
    if (!documentRef || documentRef.getElementById(SESSION_RECORDER_STYLE_ID)) {
        return;
    }

    const style = documentRef.createElement('style');
    style.id = SESSION_RECORDER_STYLE_ID;
    style.textContent = `
        .session-recorder-panel {
            display: grid;
            gap: var(--space-4);
            padding: var(--space-4);
            margin-top: var(--space-4);
        }

        .session-recorder-panel-head,
        .session-recorder-controls,
        .session-recorder-meta,
        .session-recorder-preview,
        .session-recorder-status {
            display: flex;
            align-items: center;
            gap: var(--space-3);
            flex-wrap: wrap;
        }

        .session-recorder-panel-head {
            justify-content: space-between;
        }

        .session-recorder-title {
            margin: 0;
            font-size: var(--text-lg);
            font-weight: var(--font-semibold);
        }

        .session-recorder-copy {
            margin: var(--space-1) 0 0;
            color: var(--color-text-secondary);
            font-size: var(--text-sm);
        }

        .session-recorder-status {
            justify-content: space-between;
            padding: var(--space-3);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            background: var(--color-surface-alt);
            color: var(--color-text-secondary);
            font-size: var(--text-sm);
        }

        .session-recorder-status[data-tone="error"] {
            border-color: var(--color-error);
            background: var(--color-error-light);
            color: var(--color-error-700);
        }

        .session-recorder-status[data-tone="active"] {
            border-color: var(--color-primary-500);
            background: var(--color-primary-100);
            color: var(--color-primary-700);
        }

        .session-recorder-status[data-tone="paused"] {
            border-color: var(--color-warning);
            background: var(--color-warning-light);
            color: var(--color-warning-700);
        }

        .session-recorder-indicator {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            font-weight: var(--font-semibold);
        }

        .session-recorder-indicator-dot {
            width: 0.7rem;
            height: 0.7rem;
            border-radius: var(--radius-full);
            background: var(--color-text-muted);
        }

        .session-recorder-status[data-tone="active"] .session-recorder-indicator-dot {
            background: var(--color-error);
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.24);
            animation: sessionRecorderPulse 1.5s ease-out infinite;
        }

        .session-recorder-status[data-tone="paused"] .session-recorder-indicator-dot {
            background: var(--color-warning);
        }

        .session-recorder-preview {
            justify-content: space-between;
            align-items: flex-start;
        }

        .session-recorder-preview audio {
            width: min(100%, 420px);
        }

        .session-recorder-meta {
            color: var(--color-text-muted);
            font-size: var(--text-xs);
        }

        @keyframes sessionRecorderPulse {
            0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.24); }
            100% { box-shadow: 0 0 0 12px rgba(220, 38, 38, 0); }
        }

        @media (prefers-reduced-motion: reduce) {
            .session-recorder-status[data-tone="active"] .session-recorder-indicator-dot {
                animation: none;
            }
        }
    `;
    documentRef.head?.appendChild(style);
}

function ensureSessionRecordingNoticeStyles(documentRef = globalThis.document) {
    if (!documentRef || documentRef.getElementById(SESSION_RECORDING_NOTICE_STYLE_ID)) {
        return;
    }

    const style = documentRef.createElement('style');
    style.id = SESSION_RECORDING_NOTICE_STYLE_ID;
    style.textContent = `
        .session-recording-notice {
            position: fixed;
            left: 50%;
            bottom: var(--space-4);
            z-index: var(--z-popover);
            width: min(520px, calc(100vw - var(--space-8)));
            transform: translateX(-50%);
            display: flex;
            gap: var(--space-3);
            align-items: flex-start;
            padding: var(--space-3) var(--space-4);
            border: 1px solid var(--color-border);
            border-left: 4px solid var(--color-error);
            border-radius: var(--radius-md);
            background: var(--color-surface);
            box-shadow: var(--shadow-lg);
        }

        .session-recording-notice[hidden] {
            display: none !important;
        }

        .session-recording-notice[data-state="paused"] {
            border-left-color: var(--color-warning);
        }

        .session-recording-notice-dot {
            flex: 0 0 auto;
            width: 0.75rem;
            height: 0.75rem;
            margin-top: 0.25rem;
            border-radius: var(--radius-full);
            background: var(--color-error);
        }

        .session-recording-notice[data-state="paused"] .session-recording-notice-dot {
            background: var(--color-warning);
        }

        .session-recording-notice-title {
            margin: 0;
            font-size: var(--text-sm);
            font-weight: var(--font-semibold);
            color: var(--color-text-primary);
        }

        .session-recording-notice-copy {
            margin: var(--space-1) 0 0;
            font-size: var(--text-sm);
            color: var(--color-text-secondary);
        }
    `;
    documentRef.head?.appendChild(style);
}

export function getSessionRecordingNoticeModel(pluginState = {}) {
    if (!isSessionRecorderNoticeActive(pluginState)) {
        return null;
    }

    const recorderState = getSessionRecorderRuntimeState(pluginState);
    if (recorderState.recording_status === SESSION_RECORDER_RUNTIME_STATES.PAUSED) {
        return {
            state: SESSION_RECORDER_RUNTIME_STATES.PAUSED,
            title: 'Session recording paused',
            copy: 'Audio capture is paused; the recording session remains open.'
        };
    }

    return {
        state: SESSION_RECORDER_RUNTIME_STATES.RECORDING,
        title: 'Session recording active',
        copy: 'Audio is being captured for post-game review'
    };
}

export class SessionRecordingNotice {
    constructor({
        document = globalThis.document,
        gameStateStore = null
    } = {}) {
        this.document = document;
        this.gameStateStore = gameStateStore;
        this.host = null;
        this.unsubscribe = null;
        this.handleGameState = (_event, state) => this.render(state?.plugin_state);
    }

    mount() {
        if (!this.document?.body) {
            return;
        }

        ensureSessionRecordingNoticeStyles(this.document);
        this.host = this.document.getElementById(SESSION_RECORDING_NOTICE_ID);
        if (!this.host) {
            this.host = this.document.createElement('div');
            this.host.id = SESSION_RECORDING_NOTICE_ID;
            this.host.className = 'session-recording-notice';
            this.host.setAttribute('role', 'status');
            this.host.setAttribute('aria-live', 'polite');
            this.host.hidden = true;
            this.document.body.appendChild(this.host);
        }

        this.unsubscribe = this.gameStateStore?.subscribe?.(this.handleGameState) || null;
        this.render(this.gameStateStore?.getState?.()?.plugin_state);
    }

    render(pluginState = {}) {
        if (!this.host) {
            return;
        }

        const model = getSessionRecordingNoticeModel(pluginState);
        if (!model) {
            this.host.hidden = true;
            this.host.innerHTML = '';
            return;
        }

        this.host.hidden = false;
        this.host.dataset.state = model.state;
        this.host.innerHTML = `
            <span class="session-recording-notice-dot" aria-hidden="true"></span>
            <span>
                <p class="session-recording-notice-title">${escapeHtml(model.title)}</p>
                <p class="session-recording-notice-copy">${escapeHtml(model.copy)}</p>
            </span>
        `;
    }

    destroy() {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.host?.remove?.();
        this.host = null;
    }
}

export class WhiteCellSessionRecorderPlugin {
    constructor({
        host,
        sessionStore,
        gameStateStore,
        gameState,
        senderRole = null,
        senderTeam = null
    } = {}) {
        this.host = host;
        this.sessionStore = sessionStore;
        this.gameStateStore = gameStateStore;
        this.gameState = gameState;
        this.senderRole = senderRole;
        this.senderTeam = senderTeam;
        this.mediaStream = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordedBytes = 0;
        this.recordedBlob = null;
        this.previewUrl = null;
        this.recordingArtifact = null;
        this.recordingId = null;
        this.recordedMimeType = '';
        this.captureConstraintsRequested = null;
        this.audioBitsPerSecondRequested = null;
        this.audioBitsPerSecondUsed = null;
        this.startedAtUtc = null;
        this.stoppedAtUtc = null;
        this.recordStartedAtMs = null;
        this.pausedAtMs = null;
        this.pausedDurationMs = 0;
        this.elapsedTimer = null;
        this.statusMessage = null;
        this.statusTone = '';
        this.destroyed = false;
        this.pendingStopReason = null;
        this.handleStartClick = () => this.startRecording();
        this.handlePauseClick = () => this.pauseRecording();
        this.handleResumeClick = () => this.resumeRecording();
        this.handleStopClick = () => this.stopRecording();
        this.handleDownloadClick = () => this.downloadRecording();
        this.handleDiscardClick = () => this.discardRecording();
        this.handleBeforeUnload = (event) => {
            if (!this.isRecordingActive()) {
                return;
            }
            event.preventDefault();
            event.returnValue = '';
        };
    }

    mount() {
        if (!this.host) {
            return;
        }

        ensureSessionRecorderStyles(this.host.ownerDocument || document);
        globalThis.window?.addEventListener?.('beforeunload', this.handleBeforeUnload);
        this.render();
    }

    isEnabled() {
        return Boolean(this.host?.isConnected !== false);
    }

    isRecordingActive() {
        return Boolean(this.mediaRecorder && this.mediaRecorder.state !== 'inactive');
    }

    getElapsedSeconds() {
        if (!this.recordStartedAtMs) {
            return 0;
        }

        const now = this.pausedAtMs || Date.now();
        const elapsedMs = Math.max(0, now - this.recordStartedAtMs - this.pausedDurationMs);
        return Number((elapsedMs / 1000).toFixed(3));
    }

    startElapsedTimer() {
        this.stopElapsedTimer();
        this.elapsedTimer = setInterval(() => {
            this.render();
        }, 1000);
    }

    stopElapsedTimer() {
        if (this.elapsedTimer) {
            clearInterval(this.elapsedTimer);
            this.elapsedTimer = null;
        }
    }

    bindControls() {
        if (typeof this.host?.querySelector !== 'function') {
            return;
        }

        this.host.querySelector('[data-session-recorder-start]')?.addEventListener('click', this.handleStartClick);
        this.host.querySelector('[data-session-recorder-pause]')?.addEventListener('click', this.handlePauseClick);
        this.host.querySelector('[data-session-recorder-resume]')?.addEventListener('click', this.handleResumeClick);
        this.host.querySelector('[data-session-recorder-stop]')?.addEventListener('click', this.handleStopClick);
        this.host.querySelector('[data-session-recorder-download]')?.addEventListener('click', this.handleDownloadClick);
        this.host.querySelector('[data-session-recorder-discard]')?.addEventListener('click', this.handleDiscardClick);
    }

    render() {
        if (this.destroyed || !this.host) {
            return;
        }

        const recorderState = this.mediaRecorder?.state || 'inactive';
        const isRecording = recorderState === 'recording';
        const isPaused = recorderState === 'paused';
        const isActive = isRecording || isPaused;
        const hasRecording = Boolean(this.recordedBlob && this.previewUrl);
        const durationText = formatDuration(this.getElapsedSeconds());
        const defaultStatus = isRecording
            ? `Recording in progress | ${durationText}`
            : (isPaused
                ? `Recording paused | ${durationText}`
                : (hasRecording
                    ? `Recording ready | ${formatDuration(this.recordingArtifact?.duration_seconds)} | ${formatBytes(this.recordedBlob.size)}`
                    : 'Ready to capture White Cell session audio.'));
        const statusTone = this.statusMessage
            ? this.statusTone
            : (isRecording ? 'active' : (isPaused ? 'paused' : ''));
        const statusText = this.statusMessage || defaultStatus;
        const filename = this.recordingArtifact?.filename || '';
        const previewMarkup = hasRecording
            ? `
                <div class="session-recorder-preview">
                    <div>
                        <p class="text-sm font-semibold" style="margin: 0 0 var(--space-1);">Recording file</p>
                        <p class="text-xs text-gray-500" style="margin: 0;">${escapeHtml(filename)} | Metadata will be referenced in the research bundle from this browser.</p>
                    </div>
                    <audio controls src="${escapeHtml(this.previewUrl)}"></audio>
                </div>
            `
            : '';

        this.host.innerHTML = `
            <section class="session-recorder-panel card card-bordered" aria-labelledby="sessionRecorderPluginTitle">
                <div class="session-recorder-panel-head">
                    <div>
                        <h4 class="session-recorder-title" id="sessionRecorderPluginTitle">Session Recorder</h4>
                        <p class="session-recorder-copy">Capture operator/session audio for post-game review and research-bundle reference.</p>
                    </div>
                    <div class="session-recorder-meta" aria-label="Session recorder metadata">
                        <span>Plugin: ${escapeHtml(SESSION_RECORDER_PLUGIN_ID)}</span>
                        <span>Mode: local browser file</span>
                    </div>
                </div>
                <div class="session-recorder-status" data-tone="${escapeHtml(statusTone)}" role="status" aria-live="polite">
                    <span class="session-recorder-indicator">
                        <span class="session-recorder-indicator-dot" aria-hidden="true"></span>
                        <span>${escapeHtml(statusText)}</span>
                    </span>
                    <span>${escapeHtml(isActive ? `Elapsed ${durationText}` : '')}</span>
                </div>
                <div class="session-recorder-controls">
                    <button type="button" class="btn btn-primary btn-sm" data-session-recorder-start ${isActive ? 'disabled' : ''}>Start recording</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-session-recorder-pause ${isRecording ? '' : 'disabled'}>Pause</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-session-recorder-resume ${isPaused ? '' : 'disabled'}>Resume</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-session-recorder-stop ${isActive ? '' : 'disabled'}>Stop</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-session-recorder-download ${hasRecording ? '' : 'disabled'}>Download file</button>
                    <button type="button" class="btn btn-ghost btn-sm" data-session-recorder-discard ${hasRecording && !isActive ? '' : 'disabled'}>Discard/reset</button>
                </div>
                ${previewMarkup}
                <p class="session-recorder-copy">Microphone use starts only when recording begins. Keep the downloaded audio file with the research archive ZIP.</p>
            </section>
        `;
        this.bindControls();
    }

    setStatus(message, tone = '') {
        this.statusMessage = message;
        this.statusTone = tone;
        this.render();
    }

    async updateSharedRecordingState(status) {
        const sessionId = resolveSessionId(this.sessionStore, this.gameState);
        if (!sessionId || !this.gameStateStore?.getPluginState) {
            return;
        }

        const runtimeState = status === SESSION_RECORDER_RUNTIME_STATES.IDLE
            ? { recording_status: SESSION_RECORDER_RUNTIME_STATES.IDLE }
            : {
                recording_status: status,
                recording_id: this.recordingId,
                recording_started_at_utc: this.startedAtUtc,
                recording_updated_at_utc: new Date().toISOString(),
                recording_operator_role: resolveOperatorRole(this.sessionStore, this.senderRole),
                recording_operator_label: resolveOperatorLabel(this.sessionStore)
            };

        if (typeof this.gameStateStore.setSessionRecorderRuntimeState === 'function') {
            await this.gameStateStore.setSessionRecorderRuntimeState(runtimeState);
            return;
        }

        if (typeof this.gameStateStore.persistState === 'function') {
            const pluginState = setSessionRecorderRuntimeStateInPluginState(
                this.gameStateStore.getPluginState(),
                runtimeState
            );
            await this.gameStateStore.persistState({
                plugin_state: pluginState
            }, 'session_recorder_runtime_updated');
        }
    }

    handleSharedStateFailure(error) {
        logger.warn('Session recorder shared state update failed:', error);
        this.setStatus('Recording continues locally, but the participant notice could not be updated. Refresh session state before demo use.', 'error');
    }

    async startRecording() {
        if (this.isRecordingActive()) {
            return;
        }

        if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
            this.setStatus('Microphone capture is not available in this browser.', 'error');
            return;
        }

        if (!globalThis.MediaRecorder) {
            this.setStatus('MediaRecorder is not supported in this browser.', 'error');
            return;
        }

        const mimeType = getSupportedSessionRecorderMimeType();
        if (!mimeType) {
            this.setStatus('No supported audio recording MIME type is available in this browser.', 'error');
            return;
        }

        this.discardRecording({ render: false, removeArtifact: false });
        this.statusMessage = null;
        this.statusTone = '';
        this.recordedMimeType = mimeType;
        this.captureConstraintsRequested = getSessionRecorderMicrophoneConstraints();
        this.recordingId = buildSessionRecordingId();
        this.startedAtUtc = new Date().toISOString();
        this.recordStartedAtMs = Date.now();
        this.pausedDurationMs = 0;
        this.pausedAtMs = null;
        this.recordedBytes = 0;
        this.recordedChunks = [];

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia(this.captureConstraintsRequested);
            // True studio-grade quality and full ambient-sound rejection are limited by
            // browser, microphone, device DSP, and codec support; these constraints ask
            // for the best achievable in-browser voice capture.
            const recorderSelection = createSessionRecorderMediaRecorder(this.mediaStream, { mimeType });
            this.mediaRecorder = recorderSelection.recorder;
            this.audioBitsPerSecondRequested = recorderSelection.audioBitsPerSecondRequested;
            this.audioBitsPerSecondUsed = recorderSelection.audioBitsPerSecondUsed;
            this.mediaRecorder.addEventListener('dataavailable', (event) => {
                if (event.data?.size > 0) {
                    this.recordedChunks.push(event.data);
                    this.recordedBytes += event.data.size;
                    if (this.recordedBytes >= SESSION_RECORDER_MEMORY_WARNING_BYTES && !this.statusMessage) {
                        this.setStatus('Long recording warning: this browser is holding a large local audio file in memory.', 'error');
                    }
                }
            });
            this.mediaRecorder.addEventListener('stop', () => this.handleRecorderStopped());
            this.mediaRecorder.addEventListener('error', (event) => {
                logger.error('Session recorder error:', event?.error || event);
                this.setStatus('Recording failed. Check microphone permissions and try again.', 'error');
                this.stopRecording({ reason: 'recorder_error' });
            });
            this.mediaRecorder.start(SESSION_RECORDER_TIMESLICE_MS);
            this.startElapsedTimer();
            void this.updateSharedRecordingState(SESSION_RECORDER_RUNTIME_STATES.RECORDING)
                .catch((error) => this.handleSharedStateFailure(error));
            this.render();
        } catch (error) {
            logger.error('Session recorder microphone capture failed:', error);
            this.cleanupMediaStream();
            this.mediaRecorder = null;
            this.stopElapsedTimer();
            this.setStatus('Microphone permission was denied or the input device is unavailable.', 'error');
        }
    }

    pauseRecording() {
        if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
            this.setStatus('Recording cannot be paused from the current recorder state.', 'error');
            return;
        }

        if (typeof this.mediaRecorder.pause !== 'function') {
            this.setStatus('This browser does not support pausing MediaRecorder sessions.', 'error');
            return;
        }

        try {
            this.mediaRecorder.pause();
            this.pausedAtMs = Date.now();
            void this.updateSharedRecordingState(SESSION_RECORDER_RUNTIME_STATES.PAUSED)
                .catch((error) => this.handleSharedStateFailure(error));
            this.render();
        } catch (error) {
            logger.error('Failed to pause session recording:', error);
            this.setStatus('Recording could not be paused from the current state.', 'error');
        }
    }

    resumeRecording() {
        if (!this.mediaRecorder || this.mediaRecorder.state !== 'paused') {
            this.setStatus('Recording cannot be resumed from the current recorder state.', 'error');
            return;
        }

        if (typeof this.mediaRecorder.resume !== 'function') {
            this.setStatus('This browser does not support resuming MediaRecorder sessions.', 'error');
            return;
        }

        try {
            this.mediaRecorder.resume();
            if (this.pausedAtMs) {
                this.pausedDurationMs += Date.now() - this.pausedAtMs;
            }
            this.pausedAtMs = null;
            void this.updateSharedRecordingState(SESSION_RECORDER_RUNTIME_STATES.RECORDING)
                .catch((error) => this.handleSharedStateFailure(error));
            this.render();
        } catch (error) {
            logger.error('Failed to resume session recording:', error);
            this.setStatus('Recording could not be resumed from the current state.', 'error');
        }
    }

    stopRecording({ reason = 'operator_stop' } = {}) {
        if (!this.mediaRecorder) {
            return;
        }

        this.pendingStopReason = reason;
        try {
            if (this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
        } catch (error) {
            logger.error('Failed to stop session recorder:', error);
            this.cleanupMediaStream();
            this.mediaRecorder = null;
            this.stopElapsedTimer();
            void this.updateSharedRecordingState(SESSION_RECORDER_RUNTIME_STATES.IDLE)
                .catch((sharedStateError) => logger.warn('Failed to clear session recorder notice:', sharedStateError));
            this.setStatus('Recording could not be stopped cleanly. Reset and try again.', 'error');
        }
    }

    handleRecorderStopped() {
        const durationSeconds = this.getElapsedSeconds();
        this.stopElapsedTimer();
        this.stoppedAtUtc = new Date().toISOString();
        this.cleanupMediaStream();
        this.mediaRecorder = null;
        this.pausedAtMs = null;

        void this.updateSharedRecordingState(SESSION_RECORDER_RUNTIME_STATES.IDLE)
            .catch((error) => logger.warn('Failed to clear session recorder notice:', error));

        if (!this.recordedChunks.length) {
            this.recordedBlob = null;
            this.setStatus('No audio was captured. Record again.', 'error');
            this.render();
            return;
        }

        this.recordedBlob = new Blob(this.recordedChunks, { type: this.recordedMimeType });
        if (!this.recordedBlob.size) {
            this.recordedBlob = null;
            this.setStatus('Recording stopped with no audio data. Record again.', 'error');
            this.render();
            return;
        }

        this.previewUrl = URL.createObjectURL(this.recordedBlob);
        const sessionId = resolveSessionId(this.sessionStore, this.gameState);
        const filename = buildSessionRecordingFilename({
            sessionId,
            recordingId: this.recordingId,
            startedAtUtc: this.startedAtUtc,
            mimeType: this.recordedMimeType
        });
        const artifact = buildSessionRecordingArtifact({
            sessionId,
            recordingId: this.recordingId,
            startedAtUtc: this.startedAtUtc,
            stoppedAtUtc: this.stoppedAtUtc,
            durationSeconds,
            mimeType: this.recordedMimeType,
            fileSizeBytes: this.recordedBlob.size,
            generatedByRole: resolveOperatorRole(this.sessionStore, this.senderRole),
            generatedByUser: resolveOperatorLabel(this.sessionStore),
            filename,
            storageReference: `browser-download:${filename}`,
            objectUrl: this.previewUrl,
            captureConstraintsRequested: this.captureConstraintsRequested,
            recorderMimeTypeSelected: this.recordedMimeType,
            audioBitsPerSecondRequested: this.audioBitsPerSecondRequested,
            audioBitsPerSecondUsed: this.audioBitsPerSecondUsed
        });

        try {
            this.recordingArtifact = saveSessionRecordingArtifact(artifact);
            this.statusMessage = null;
            this.statusTone = '';
        } catch (error) {
            logger.error('Failed to persist session recording artifact metadata:', error);
            this.recordingArtifact = artifact;
            this.setStatus('Recording stopped, but artifact metadata could not be added to the research bundle.', 'error');
        }

        this.render();
    }

    cleanupMediaStream() {
        this.mediaStream?.getTracks?.().forEach((track) => track.stop?.());
        this.mediaStream = null;
    }

    downloadRecording() {
        if (!this.recordedBlob || !this.previewUrl) {
            return;
        }

        const link = document.createElement('a');
        link.href = this.previewUrl;
        link.download = this.recordingArtifact?.filename || 'session-recording.webm';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    discardRecording({
        render = true,
        removeArtifact = true
    } = {}) {
        if (this.isRecordingActive()) {
            this.stopRecording({ reason: 'discard_requested' });
            return;
        }

        if (removeArtifact && this.recordingArtifact?.recording_id) {
            try {
                removeSessionRecordingArtifact(this.recordingArtifact.recording_id);
            } catch (error) {
                logger.warn('Failed to remove session recording artifact metadata:', error);
            }
        }

        if (this.previewUrl) {
            URL.revokeObjectURL(this.previewUrl);
        }

        this.previewUrl = null;
        this.recordedBlob = null;
        this.recordedChunks = [];
        this.recordedBytes = 0;
        this.recordedMimeType = '';
        this.recordingArtifact = null;
        this.recordingId = null;
        this.startedAtUtc = null;
        this.stoppedAtUtc = null;
        this.recordStartedAtMs = null;
        this.pausedAtMs = null;
        this.pausedDurationMs = 0;
        this.captureConstraintsRequested = null;
        this.audioBitsPerSecondRequested = null;
        this.audioBitsPerSecondUsed = null;
        this.statusMessage = null;
        this.statusTone = '';
        this.pendingStopReason = null;

        if (render) {
            this.render();
        }
    }

    destroy() {
        this.destroyed = true;
        globalThis.window?.removeEventListener?.('beforeunload', this.handleBeforeUnload);
        this.stopElapsedTimer();
        if (this.isRecordingActive()) {
            try {
                this.pendingStopReason = 'plugin_disabled';
                this.mediaRecorder.stop();
            } catch (error) {
                logger.warn('Failed to stop session recorder during unmount:', error);
            }
        }
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.cleanupMediaStream();
        void this.updateSharedRecordingState(SESSION_RECORDER_RUNTIME_STATES.IDLE)
            .catch((error) => logger.warn('Failed to clear session recorder state during unmount:', error));
        if (this.previewUrl) {
            URL.revokeObjectURL(this.previewUrl);
            this.previewUrl = null;
        }
        if (this.host) {
            this.host.innerHTML = '';
        }
    }
}

export function mountWhiteCellSessionRecorderPlugin(context = {}) {
    const plugin = new WhiteCellSessionRecorderPlugin(context);
    plugin.mount();
    return plugin;
}

export function unmountWhiteCellSessionRecorderPlugin(instance) {
    instance?.destroy?.();
}

export function mountSessionRecordingNotice(context = {}) {
    const notice = new SessionRecordingNotice(context);
    notice.mount();
    return notice;
}

export function unmountSessionRecordingNotice(instance) {
    instance?.destroy?.();
}
