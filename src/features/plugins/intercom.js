import { createLogger } from '../../utils/logger.js';
import {
    ROLE_SURFACES,
    TEAM_OPTIONS,
    buildTeamRole
} from '../../core/teamContext.js';

const logger = createLogger('IntercomPlugin');
let supabaseClientPromise = null;

export const INTERCOM_PLUGIN_ID = 'intercom';
export const INTERCOM_ANNOUNCEMENT_EVENT = 'intercom_announcement';
export const INTERCOM_STORAGE_BUCKET = 'intercom-announcements';
export const INTERCOM_STORAGE_SIGNED_URL_TTL_SECONDS = 600;
export const INTERCOM_INLINE_AUDIO_THRESHOLD_BYTES = 48 * 1024;
export const INTERCOM_MAX_RECORDING_MS = 60 * 1000;
export const INTERCOM_NOTICE_DISMISS_MS = 12000;

const INTERCOM_STYLE_ID = 'intercom-plugin-style';
const INTERCOM_RECEIVER_HOST_ID = 'intercomScribeReceiver';
const INTERCOM_STORAGE_DELIVERY = 'storage';
const INTERCOM_INLINE_DELIVERY = 'inline';
const PREFERRED_MIME_TYPES = Object.freeze([
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
]);

export const INTERCOM_SCRIBE_TARGET_ROLES = Object.freeze(
    TEAM_OPTIONS.map((team) => buildTeamRole(team.id, ROLE_SURFACES.FACILITATOR))
);

async function getSupabaseClient() {
    if (!supabaseClientPromise) {
        supabaseClientPromise = import('../../services/supabase.js')
            .then((module) => module.supabase);
    }

    return supabaseClientPromise;
}

export function getIntercomChannelName(sessionId) {
    return `intercom:${sessionId}`;
}

export function getIntercomMicrophoneConstraints() {
    return {
        audio: {
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 1 }
        }
    };
}

export function getSupportedIntercomMimeType(mediaRecorderCtor = globalThis.MediaRecorder) {
    if (!mediaRecorderCtor || typeof mediaRecorderCtor.isTypeSupported !== 'function') {
        return '';
    }

    return PREFERRED_MIME_TYPES.find((mimeType) => mediaRecorderCtor.isTypeSupported(mimeType)) || '';
}

export function selectIntercomDeliveryMode(
    blob,
    thresholdBytes = INTERCOM_INLINE_AUDIO_THRESHOLD_BYTES
) {
    return Number(blob?.size || 0) <= thresholdBytes
        ? INTERCOM_INLINE_DELIVERY
        : INTERCOM_STORAGE_DELIVERY;
}

export function buildIntercomAnnouncementId(now = Date.now()) {
    const cryptoRef = globalThis.crypto;
    const randomId = typeof cryptoRef?.randomUUID === 'function'
        ? cryptoRef.randomUUID()
        : Math.random().toString(36).slice(2, 12);

    return `intercom-${now}-${randomId}`;
}

export function getIntercomStoragePath({
    sessionId,
    announcementId,
    mimeType = ''
} = {}) {
    const extension = mimeType.includes('ogg') ? 'ogg'
        : (mimeType.includes('mp4') ? 'mp4' : 'webm');

    return `${sessionId}/${announcementId}.${extension}`;
}

export function getIntercomStorageErrorMessage(error) {
    const rawMessage = String(error?.message || error || 'unknown Storage error');
    const normalizedMessage = rawMessage.toLowerCase();

    if (normalizedMessage.includes('bucket not found')) {
        return `Supabase Storage bucket "${INTERCOM_STORAGE_BUCKET}" is missing. Apply data/2026-06-28_intercom_storage_bucket.sql in the Supabase SQL editor, then retry the announcement.`;
    }

    if (
        normalizedMessage.includes('row-level security')
        || normalizedMessage.includes('permission')
        || normalizedMessage.includes('not authorized')
        || normalizedMessage.includes('403')
    ) {
        return `Supabase Storage rejected the Intercom upload. Confirm data/2026-06-28_intercom_storage_bucket.sql is applied and this operator has a valid White Cell or Game Master grant.`;
    }

    return `Supabase Storage upload failed: ${rawMessage}.`;
}

export function buildIntercomAnnouncementPayload({
    announcementId,
    sessionId,
    senderRole = 'whitecell',
    senderTeam = 'white_cell',
    mimeType,
    durationSeconds = null,
    size,
    deliveryMode,
    inlineAudioBase64 = null,
    storageBucket = null,
    storagePath = null,
    signedUrl = null,
    signedUrlExpiresAt = null,
    createdAt = new Date().toISOString()
} = {}) {
    return {
        event_type: INTERCOM_ANNOUNCEMENT_EVENT,
        plugin_id: INTERCOM_PLUGIN_ID,
        announcement_id: announcementId,
        session_id: sessionId,
        sender_role: senderRole,
        sender_team: senderTeam,
        target: 'all_scribes',
        target_roles: [...INTERCOM_SCRIBE_TARGET_ROLES],
        created_at: createdAt,
        mime_type: mimeType,
        duration_seconds: durationSeconds,
        size,
        delivery_mode: deliveryMode,
        inline_audio_base64: inlineAudioBase64,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        signed_url: signedUrl,
        signed_url_expires_at: signedUrlExpiresAt
    };
}

export function normalizeIntercomAnnouncementPayload(payload = null) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const sessionId = typeof payload.session_id === 'string' ? payload.session_id.trim() : '';
    const announcementId = typeof payload.announcement_id === 'string' ? payload.announcement_id.trim() : '';
    const targetRoles = Array.isArray(payload.target_roles)
        ? payload.target_roles.filter((role) => typeof role === 'string' && role.trim())
        : [];
    const deliveryMode = payload.delivery_mode;
    const mimeType = typeof payload.mime_type === 'string' ? payload.mime_type.trim() : '';
    const size = Number(payload.size);

    if (
        payload.event_type !== INTERCOM_ANNOUNCEMENT_EVENT
        || payload.plugin_id !== INTERCOM_PLUGIN_ID
        || payload.target !== 'all_scribes'
        || !sessionId
        || !announcementId
        || !targetRoles.length
        || !mimeType
        || !Number.isFinite(size)
        || size <= 0
    ) {
        return null;
    }

    if (deliveryMode === INTERCOM_INLINE_DELIVERY) {
        const inlineAudioBase64 = typeof payload.inline_audio_base64 === 'string'
            ? payload.inline_audio_base64
            : '';
        if (!inlineAudioBase64) {
            return null;
        }
    } else if (deliveryMode === INTERCOM_STORAGE_DELIVERY) {
        const storageBucket = typeof payload.storage_bucket === 'string' ? payload.storage_bucket.trim() : '';
        const storagePath = typeof payload.storage_path === 'string' ? payload.storage_path.trim() : '';
        if (!storageBucket || !storagePath) {
            return null;
        }
    } else {
        return null;
    }

    return {
        ...payload,
        session_id: sessionId,
        announcement_id: announcementId,
        target_roles: targetRoles,
        mime_type: mimeType,
        size
    };
}

export function isIntercomAnnouncementForScribe(payload, {
    sessionId,
    role
} = {}) {
    const normalizedPayload = normalizeIntercomAnnouncementPayload(payload);

    return Boolean(
        normalizedPayload
        && normalizedPayload.session_id === sessionId
        && normalizedPayload.target_roles.includes(role)
    );
}

function ensureIntercomStyles(documentRef = globalThis.document) {
    if (!documentRef || documentRef.getElementById(INTERCOM_STYLE_ID)) {
        return;
    }

    const style = documentRef.createElement('style');
    style.id = INTERCOM_STYLE_ID;
    style.textContent = `
        .intercom-panel {
            display: grid;
            gap: var(--space-4);
            padding: var(--space-4);
            margin-top: var(--space-4);
        }

        .intercom-panel-head,
        .intercom-controls,
        .intercom-meta,
        .intercom-preview,
        .intercom-indicator-head,
        .intercom-indicator-actions {
            display: flex;
            align-items: center;
            gap: var(--space-3);
            flex-wrap: wrap;
        }

        .intercom-panel-head {
            justify-content: space-between;
        }

        .intercom-title {
            margin: 0;
            font-size: var(--text-lg);
            font-weight: var(--font-semibold);
        }

        .intercom-copy {
            margin: var(--space-1) 0 0;
            color: var(--color-text-secondary);
            font-size: var(--text-sm);
        }

        .intercom-status {
            padding: var(--space-3);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            background: var(--color-surface-alt);
            color: var(--color-text-secondary);
            font-size: var(--text-sm);
        }

        .intercom-status[data-tone="error"] {
            border-color: var(--color-error);
            background: var(--color-error-light);
            color: var(--color-error-700);
        }

        .intercom-status[data-tone="active"] {
            border-color: var(--color-primary-500);
            background: var(--color-primary-100);
            color: var(--color-primary-700);
        }

        .intercom-preview {
            justify-content: space-between;
            align-items: flex-start;
        }

        .intercom-preview audio {
            width: min(100%, 360px);
        }

        .intercom-meta {
            color: var(--color-text-muted);
            font-size: var(--text-xs);
        }

        .intercom-scribe-indicator {
            position: fixed;
            right: var(--space-4);
            bottom: var(--space-4);
            z-index: var(--z-toast);
            width: min(420px, calc(100vw - var(--space-8)));
            padding: var(--space-4);
            border: 1px solid var(--color-border);
            border-left: 4px solid var(--color-primary-500);
            border-radius: var(--radius-lg);
            background: var(--color-surface);
            box-shadow: var(--shadow-lg);
        }

        .intercom-scribe-indicator[hidden] {
            display: none !important;
        }

        .intercom-indicator-title {
            margin: 0;
            font-size: var(--text-base);
            font-weight: var(--font-semibold);
        }

        .intercom-indicator-copy {
            margin: var(--space-2) 0 0;
            color: var(--color-text-secondary);
            font-size: var(--text-sm);
        }

        .intercom-indicator-meta {
            margin: var(--space-2) 0 0;
            color: var(--color-text-muted);
            font-size: var(--text-xs);
        }

        .intercom-indicator-pulse {
            width: 0.75rem;
            height: 0.75rem;
            border-radius: var(--radius-full);
            background: var(--color-primary-500);
            box-shadow: 0 0 0 0 rgba(17, 87, 64, 0.28);
            animation: intercomPulse 1.4s ease-out infinite;
        }

        .intercom-scribe-indicator[data-state="played"] .intercom-indicator-pulse,
        .intercom-scribe-indicator[data-state="error"] .intercom-indicator-pulse {
            animation: none;
            background: var(--color-text-muted);
            box-shadow: none;
        }

        .intercom-scribe-indicator[data-state="error"] {
            border-left-color: var(--color-error);
        }

        @keyframes intercomPulse {
            0% { box-shadow: 0 0 0 0 rgba(17, 87, 64, 0.28); }
            100% { box-shadow: 0 0 0 12px rgba(17, 87, 64, 0); }
        }

        @media (prefers-reduced-motion: reduce) {
            .intercom-indicator-pulse {
                animation: none;
            }
        }
    `;
    documentRef.head?.appendChild(style);
}

function formatDuration(seconds = null) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }

    const totalSeconds = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
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

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Unable to read recorded audio.'));
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            resolve(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl);
        };
        reader.readAsDataURL(blob);
    });
}

function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType });
}

function escapeHtml(value = '') {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

function getSenderRole(sessionStoreRef) {
    return sessionStoreRef?.getRole?.()
        || sessionStoreRef?.getSessionData?.()?.role
        || 'whitecell';
}

function getSenderTeam(sessionStoreRef) {
    return sessionStoreRef?.getSessionData?.()?.team || 'white_cell';
}

function resolveSessionId(sessionStoreRef, gameState = null) {
    return sessionStoreRef?.getSessionId?.()
        || gameState?.session_id
        || sessionStoreRef?.getSessionData?.()?.sessionId
        || null;
}

async function ensureBroadcastChannel(channel, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error('Realtime subscription timed out.'));
        }, timeoutMs);

        channel.subscribe((status) => {
            if (settled) return;

            if (status === 'SUBSCRIBED') {
                settled = true;
                clearTimeout(timeoutId);
                resolve(channel);
                return;
            }

            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                settled = true;
                clearTimeout(timeoutId);
                reject(new Error(`Realtime subscription failed: ${status}.`));
            }
        });
    });
}

async function sendBroadcast(channel, payload) {
    if (!channel || typeof channel.send !== 'function') {
        throw new Error('Realtime broadcast is unavailable.');
    }

    const result = await channel.send({
        type: 'broadcast',
        event: INTERCOM_ANNOUNCEMENT_EVENT,
        payload
    });

    if (result !== 'ok') {
        throw new Error(`Realtime broadcast failed: ${result || 'unknown status'}.`);
    }
}

export class WhiteCellIntercomPlugin {
    constructor({
        host,
        sessionStore,
        gameState,
        senderRole = null,
        senderTeam = null
    } = {}) {
        this.host = host;
        this.sessionStore = sessionStore;
        this.gameState = gameState;
        this.senderRole = senderRole;
        this.senderTeam = senderTeam;
        this.channel = null;
        this.mediaStream = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordedBlob = null;
        this.recordedMimeType = '';
        this.recordedDurationSeconds = null;
        this.previewUrl = null;
        this.recordStartedAt = null;
        this.elapsedTimer = null;
        this.autoStopTimer = null;
        this.isSending = false;
        this.statusMessage = null;
        this.statusTone = '';
        this.destroyed = false;
        this.supabase = null;
        this.handleRecordClick = () => this.startRecording();
        this.handleStopClick = () => this.stopRecording();
        this.handleSendClick = () => this.sendRecording();
        this.handleDiscardClick = () => this.discardRecording();
    }

    mount() {
        if (!this.host) {
            return;
        }

        ensureIntercomStyles(this.host.ownerDocument || document);
        this.render();
    }

    bindControls() {
        if (typeof this.host?.querySelector !== 'function') {
            return;
        }

        this.host?.querySelector('[data-intercom-record]')?.addEventListener('click', this.handleRecordClick);
        this.host?.querySelector('[data-intercom-stop]')?.addEventListener('click', this.handleStopClick);
        this.host?.querySelector('[data-intercom-send]')?.addEventListener('click', this.handleSendClick);
        this.host?.querySelector('[data-intercom-discard]')?.addEventListener('click', this.handleDiscardClick);
    }

    render() {
        if (this.destroyed) {
            return;
        }

        const canSend = Boolean(this.recordedBlob) && !this.isSending && !this.mediaRecorder;
        const canDiscard = Boolean(this.recordedBlob) && !this.isSending;
        const isRecording = Boolean(this.mediaRecorder);
        const defaultStatusText = isRecording
            ? `Recording announcement... ${formatDuration(this.getElapsedSeconds())}`
            : (this.recordedBlob
                ? `Clip ready: ${formatDuration(this.recordedDurationSeconds)} | ${formatBytes(this.recordedBlob.size)}`
                : 'Ready to record a short announcement.');
        const statusText = this.statusMessage || defaultStatusText;
        const statusTone = this.statusMessage ? this.statusTone : (isRecording ? 'active' : '');
        const previewMarkup = this.previewUrl
            ? `
                <div class="intercom-preview">
                    <div>
                        <p class="text-sm font-semibold" style="margin: 0 0 var(--space-1);">Preview</p>
                        <p class="text-xs text-gray-500" style="margin: 0;">Review before sending to all Scribe views.</p>
                    </div>
                    <audio controls src="${escapeHtml(this.previewUrl)}"></audio>
                </div>
            `
            : '';

        this.host.innerHTML = `
            <section class="intercom-panel card card-bordered" aria-labelledby="intercomPluginTitle">
                <div class="intercom-panel-head">
                    <div>
                        <h4 class="intercom-title" id="intercomPluginTitle">Intercom Announcement</h4>
                        <p class="intercom-copy">Record a short live voice announcement and send it to Blue, Green, Red, and Industry Scribe views.</p>
                    </div>
                    <div class="intercom-meta" aria-label="Intercom targets">
                        <span>Target: all Scribes</span>
                        <span>Storage fallback: ${escapeHtml(INTERCOM_STORAGE_BUCKET)}</span>
                    </div>
                </div>
                <p class="intercom-status" data-tone="${escapeHtml(statusTone)}" role="status" aria-live="polite">${escapeHtml(statusText)}</p>
                <div class="intercom-controls">
                    <button type="button" class="btn btn-primary btn-sm" data-intercom-record ${isRecording || this.isSending ? 'disabled' : ''}>Record announcement</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-intercom-stop ${isRecording ? '' : 'disabled'}>Stop</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-intercom-send ${canSend ? '' : 'disabled'}>Send to Scribes</button>
                    <button type="button" class="btn btn-ghost btn-sm" data-intercom-discard ${canDiscard ? '' : 'disabled'}>Discard/reset</button>
                </div>
                ${previewMarkup}
                <p class="intercom-copy">Microphone use is active only while recording. Sent announcements are delivered to Scribe views in this session.</p>
            </section>
        `;
        this.bindControls();
    }

    setStatus(message, tone = '') {
        if (this.destroyed) {
            return;
        }

        this.statusMessage = message || null;
        this.statusTone = tone || '';
        const status = this.host?.querySelector('.intercom-status');
        if (!status) return;
        status.textContent = message;
        status.dataset.tone = tone;
        status.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    }

    setControlsDisabled(disabled) {
        this.host?.querySelectorAll('button')?.forEach((button) => {
            button.disabled = Boolean(disabled);
        });
    }

    getElapsedSeconds() {
        if (!this.recordStartedAt) {
            return 0;
        }

        return (Date.now() - this.recordStartedAt) / 1000;
    }

    startElapsedTimer() {
        this.stopElapsedTimer();
        this.elapsedTimer = setInterval(() => {
            this.setStatus(`Recording announcement... ${formatDuration(this.getElapsedSeconds())}`, 'active');
        }, 500);
        this.autoStopTimer = setTimeout(() => {
            if (this.mediaRecorder?.state === 'recording') {
                this.stopRecording();
            }
        }, INTERCOM_MAX_RECORDING_MS);
    }

    stopElapsedTimer() {
        if (this.elapsedTimer) {
            clearInterval(this.elapsedTimer);
            this.elapsedTimer = null;
        }

        if (this.autoStopTimer) {
            clearTimeout(this.autoStopTimer);
            this.autoStopTimer = null;
        }
    }

    async startRecording() {
        if (this.mediaRecorder || this.isSending) {
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

        const mimeType = getSupportedIntercomMimeType();
        if (!mimeType) {
            this.setStatus('No supported audio recording MIME type is available in this browser.', 'error');
            return;
        }

        this.discardRecording({ render: false });
        this.statusMessage = null;
        this.statusTone = '';
        this.recordedMimeType = mimeType;
        this.recordedChunks = [];

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia(getIntercomMicrophoneConstraints());
            this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
            this.mediaRecorder.addEventListener('dataavailable', (event) => {
                if (event.data?.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            });
            this.mediaRecorder.addEventListener('stop', () => this.handleRecorderStopped());
            this.mediaRecorder.addEventListener('error', (event) => {
                logger.error('Intercom recorder error:', event?.error || event);
                this.setStatus('Recording failed. Check microphone permissions and try again.', 'error');
                this.stopRecording();
            });
            this.recordStartedAt = Date.now();
            this.mediaRecorder.start();
            this.startElapsedTimer();
            this.render();
        } catch (error) {
            logger.error('Microphone capture failed:', error);
            this.cleanupMediaStream();
            this.mediaRecorder = null;
            this.setStatus('Microphone permission was denied or the input device is unavailable.', 'error');
        }
    }

    stopRecording() {
        if (!this.mediaRecorder) {
            return;
        }

        try {
            if (this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
        } catch (error) {
            logger.error('Failed to stop intercom recorder:', error);
            this.cleanupMediaStream();
            this.mediaRecorder = null;
            this.stopElapsedTimer();
            this.setStatus('Recording could not be stopped cleanly. Reset and try again.', 'error');
        }
    }

    handleRecorderStopped() {
        this.stopElapsedTimer();
        this.recordedDurationSeconds = this.getElapsedSeconds();
        this.cleanupMediaStream();
        this.mediaRecorder = null;

        if (this.destroyed) {
            this.recordedChunks = [];
            return;
        }

        if (!this.recordedChunks.length) {
            this.recordedBlob = null;
            this.recordStartedAt = null;
            this.setStatus('No audio was captured. Record again.', 'error');
            this.render();
            return;
        }

        this.recordedBlob = new Blob(this.recordedChunks, { type: this.recordedMimeType });
        this.previewUrl = URL.createObjectURL(this.recordedBlob);
        this.recordStartedAt = null;
        this.render();
    }

    cleanupMediaStream() {
        this.mediaStream?.getTracks?.().forEach((track) => track.stop?.());
        this.mediaStream = null;
    }

    discardRecording({ render = true } = {}) {
        if (this.mediaRecorder) {
            this.stopRecording();
        }

        if (this.previewUrl) {
            URL.revokeObjectURL(this.previewUrl);
        }

        this.previewUrl = null;
        this.recordedBlob = null;
        this.recordedChunks = [];
        this.recordedMimeType = '';
        this.recordedDurationSeconds = null;
        this.recordStartedAt = null;
        this.stopElapsedTimer();
        this.cleanupMediaStream();
        this.statusMessage = null;
        this.statusTone = '';

        if (render) {
            this.render();
        }
    }

    async buildDeliveryPayload({ announcementId, sessionId }) {
        const blob = this.recordedBlob;
        const deliveryMode = selectIntercomDeliveryMode(blob);

        if (deliveryMode === INTERCOM_INLINE_DELIVERY) {
            return buildIntercomAnnouncementPayload({
                announcementId,
                sessionId,
                senderRole: this.senderRole || getSenderRole(this.sessionStore),
                senderTeam: this.senderTeam || getSenderTeam(this.sessionStore),
                mimeType: this.recordedMimeType,
                durationSeconds: this.recordedDurationSeconds,
                size: blob.size,
                deliveryMode,
                inlineAudioBase64: await blobToBase64(blob)
            });
        }

        const storagePath = getIntercomStoragePath({
            sessionId,
            announcementId,
            mimeType: this.recordedMimeType
        });
        const supabaseClient = this.supabase || await getSupabaseClient();
        this.supabase = supabaseClient;
        const { error: uploadError } = await supabaseClient.storage
            .from(INTERCOM_STORAGE_BUCKET)
            .upload(storagePath, blob, {
                contentType: this.recordedMimeType,
                upsert: false
            });

        if (uploadError) {
            throw new Error(getIntercomStorageErrorMessage(uploadError));
        }

        const signedUrlResponse = await supabaseClient.storage
            .from(INTERCOM_STORAGE_BUCKET)
            .createSignedUrl(storagePath, INTERCOM_STORAGE_SIGNED_URL_TTL_SECONDS);
        if (signedUrlResponse?.error) {
            throw new Error(getIntercomStorageErrorMessage(signedUrlResponse.error));
        }

        const signedUrl = signedUrlResponse?.data?.signedUrl || null;
        if (!signedUrl) {
            throw new Error('Supabase Storage did not return a signed Intercom clip URL. Confirm the Storage bucket policy and retry.');
        }

        const signedUrlExpiresAt = signedUrl
            ? new Date(Date.now() + (INTERCOM_STORAGE_SIGNED_URL_TTL_SECONDS * 1000)).toISOString()
            : null;

        return buildIntercomAnnouncementPayload({
            announcementId,
            sessionId,
            senderRole: this.senderRole || getSenderRole(this.sessionStore),
            senderTeam: this.senderTeam || getSenderTeam(this.sessionStore),
            mimeType: this.recordedMimeType,
            durationSeconds: this.recordedDurationSeconds,
            size: blob.size,
            deliveryMode,
            storageBucket: INTERCOM_STORAGE_BUCKET,
            storagePath,
            signedUrl,
            signedUrlExpiresAt
        });
    }

    async sendRecording() {
        if (!this.recordedBlob || this.isSending) {
            return;
        }

        const sessionId = resolveSessionId(this.sessionStore, this.gameState);
        if (!sessionId) {
            this.setStatus('No active session is available for intercom delivery.', 'error');
            return;
        }

        this.isSending = true;
        this.render();
        this.setStatus('Sending announcement to Scribe views...', 'active');

        try {
            const announcementId = buildIntercomAnnouncementId();
            const payload = await this.buildDeliveryPayload({ announcementId, sessionId });
            const supabaseClient = this.supabase || await getSupabaseClient();
            this.supabase = supabaseClient;
            this.channel = supabaseClient.channel(getIntercomChannelName(sessionId), {
                config: {
                    broadcast: { self: false }
                }
            });

            await ensureBroadcastChannel(this.channel);
            await sendBroadcast(this.channel, payload);
            await supabaseClient.removeChannel(this.channel);
            this.channel = null;
            this.discardRecording({ render: false });
            this.setStatus('Announcement sent to all Scribe views.', '');
            this.isSending = false;
            this.render();
        } catch (error) {
            logger.error('Failed to send intercom announcement:', error);
            if (this.channel) {
                void this.supabase?.removeChannel?.(this.channel);
                this.channel = null;
            }
            this.isSending = false;
            this.render();
            this.setStatus(error?.message || 'Announcement delivery failed. Try again.', 'error');
        }
    }

    destroy() {
        this.destroyed = true;
        this.stopElapsedTimer();
        if (this.mediaRecorder?.state === 'recording') {
            try {
                this.mediaRecorder.stop();
            } catch (error) {
                logger.warn('Failed to stop intercom recorder during unmount:', error);
            }
        }
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.cleanupMediaStream();
        if (this.previewUrl) {
            URL.revokeObjectURL(this.previewUrl);
            this.previewUrl = null;
        }
        if (this.channel) {
            void this.supabase?.removeChannel?.(this.channel);
            this.channel = null;
        }
        if (this.host) {
            this.host.innerHTML = '';
        }
    }
}

export class ScribeIntercomReceiver {
    constructor({
        document = globalThis.document,
        sessionId,
        role,
        teamLabel = 'Team'
    } = {}) {
        this.document = document;
        this.sessionId = sessionId;
        this.role = role;
        this.teamLabel = teamLabel;
        this.channel = null;
        this.host = null;
        this.audio = null;
        this.currentObjectUrl = null;
        this.dismissTimer = null;
        this.retryCreateSignedUrl = false;
        this.supabase = null;
        this.handleBroadcast = (event) => this.handleAnnouncement(event?.payload);
        this.handlePlayClick = () => this.playCurrentAudio({ userInitiated: true });
        this.handleDismissClick = () => this.dismissIndicator();
    }

    async mount() {
        if (!this.document || !this.sessionId || !this.role) {
            return;
        }

        ensureIntercomStyles(this.document);
        this.ensureHost();
        const supabaseClient = await getSupabaseClient();
        this.supabase = supabaseClient;
        this.channel = supabaseClient.channel(getIntercomChannelName(this.sessionId), {
            config: {
                broadcast: { self: false }
            }
        });
        this.channel
            .on('broadcast', { event: INTERCOM_ANNOUNCEMENT_EVENT }, this.handleBroadcast);
        await ensureBroadcastChannel(this.channel);
    }

    ensureHost() {
        this.host = this.document.getElementById(INTERCOM_RECEIVER_HOST_ID);
        if (this.host) {
            return this.host;
        }

        this.host = this.document.createElement('div');
        this.host.id = INTERCOM_RECEIVER_HOST_ID;
        this.host.className = 'intercom-scribe-indicator';
        this.host.setAttribute('role', 'status');
        this.host.setAttribute('aria-live', 'polite');
        this.host.hidden = true;
        this.document.body?.appendChild(this.host);
        return this.host;
    }

    renderIndicator({
        state = 'incoming',
        title = 'Incoming announcement',
        copy = '',
        meta = '',
        showPlay = false,
        showDismiss = true
    } = {}) {
        if (!this.host) {
            return;
        }

        this.host.hidden = false;
        this.host.dataset.state = state;
        this.host.innerHTML = `
            <div class="intercom-indicator-head">
                <span class="intercom-indicator-pulse" aria-hidden="true"></span>
                <p class="intercom-indicator-title">${escapeHtml(title)}</p>
            </div>
            ${copy ? `<p class="intercom-indicator-copy">${escapeHtml(copy)}</p>` : ''}
            ${meta ? `<p class="intercom-indicator-meta">${escapeHtml(meta)}</p>` : ''}
            ${(showPlay || showDismiss) ? `
                <div class="intercom-indicator-actions">
                    ${showPlay ? '<button type="button" class="btn btn-primary btn-sm" data-intercom-play>Click to play</button>' : ''}
                    ${showDismiss ? '<button type="button" class="btn btn-ghost btn-sm" data-intercom-dismiss>Dismiss</button>' : ''}
                </div>
            ` : ''}
        `;

        this.host.querySelector('[data-intercom-play]')?.addEventListener('click', this.handlePlayClick);
        this.host.querySelector('[data-intercom-dismiss]')?.addEventListener('click', this.handleDismissClick);
    }

    scheduleDismiss() {
        if (this.dismissTimer) {
            clearTimeout(this.dismissTimer);
        }

        this.dismissTimer = setTimeout(() => {
            this.dismissIndicator();
        }, INTERCOM_NOTICE_DISMISS_MS);
    }

    dismissIndicator() {
        if (this.dismissTimer) {
            clearTimeout(this.dismissTimer);
            this.dismissTimer = null;
        }

        if (this.host) {
            this.host.hidden = true;
            this.host.innerHTML = '';
        }
    }

    async handleAnnouncement(payload) {
        if (!isIntercomAnnouncementForScribe(payload, {
            sessionId: this.sessionId,
            role: this.role
        })) {
            logger.warn('Ignored malformed or non-targeted intercom announcement.');
            return;
        }

        const announcement = normalizeIntercomAnnouncementPayload(payload);
        this.cleanupAudio();
        this.retryCreateSignedUrl = false;
        this.renderIndicator({
            state: 'incoming',
            title: 'Incoming announcement',
            copy: 'White Cell is sending a live voice announcement.',
            meta: `${formatDuration(announcement.duration_seconds)} | ${formatBytes(announcement.size)}`
        });

        try {
            const audioUrl = await this.resolveAudioUrl(announcement);
            await this.loadAndPlayAudio(audioUrl, announcement);
        } catch (error) {
            logger.error('Failed to prepare intercom announcement:', error);
            this.renderIndicator({
                state: 'error',
                title: 'Incoming announcement unavailable',
                copy: error?.message || 'The announcement clip could not be loaded.',
                showDismiss: true
            });
        }
    }

    async resolveAudioUrl(announcement) {
        if (announcement.delivery_mode === INTERCOM_INLINE_DELIVERY) {
            const blob = base64ToBlob(announcement.inline_audio_base64, announcement.mime_type);
            this.currentObjectUrl = URL.createObjectURL(blob);
            return this.currentObjectUrl;
        }

        if (announcement.signed_url) {
            return announcement.signed_url;
        }

        return this.createSignedStorageUrl(announcement);
    }

    async createSignedStorageUrl(announcement) {
        const supabaseClient = this.supabase || await getSupabaseClient();
        this.supabase = supabaseClient;
        const { data, error } = await supabaseClient.storage
            .from(announcement.storage_bucket)
            .createSignedUrl(announcement.storage_path, INTERCOM_STORAGE_SIGNED_URL_TTL_SECONDS);

        if (error || !data?.signedUrl) {
            throw new Error('Announcement clip URL is missing or expired.');
        }

        return data.signedUrl;
    }

    async loadAndPlayAudio(audioUrl, announcement) {
        this.audio = new Audio(audioUrl);
        this.audio.preload = 'auto';
        this.audio.addEventListener('ended', () => {
            this.renderIndicator({
                state: 'played',
                title: 'Announcement played',
                copy: 'The latest White Cell intercom announcement has finished.',
                showDismiss: true
            });
            this.scheduleDismiss();
        });
        this.audio.addEventListener('error', () => {
            void this.handleAudioError(announcement);
        });

        await this.playCurrentAudio();
    }

    async playCurrentAudio({ userInitiated = false } = {}) {
        if (!this.audio) {
            return;
        }

        try {
            // Browser autoplay policies may block automatic playback unless the Scribe client
            // has had a prior user interaction; the UI surfaces a click-to-play fallback.
            await this.audio.play();
            this.renderIndicator({
                state: 'playing',
                title: 'Incoming announcement',
                copy: userInitiated
                    ? 'Playback started.'
                    : 'Playing White Cell announcement.',
                showDismiss: true
            });
        } catch (error) {
            logger.warn('Intercom autoplay blocked or failed:', error);
            this.renderIndicator({
                state: 'blocked',
                title: 'Playback blocked - click to play.',
                copy: 'The browser blocked automatic audio playback for this Scribe client.',
                showPlay: true,
                showDismiss: true
            });
        }
    }

    async handleAudioError(announcement) {
        if (
            announcement.delivery_mode === INTERCOM_STORAGE_DELIVERY
            && announcement.storage_bucket
            && announcement.storage_path
            && !this.retryCreateSignedUrl
        ) {
            this.retryCreateSignedUrl = true;
            try {
                const signedUrl = await this.createSignedStorageUrl(announcement);
                this.cleanupAudio();
                await this.loadAndPlayAudio(signedUrl, announcement);
                return;
            } catch (error) {
                logger.error('Intercom signed URL refresh failed:', error);
            }
        }

        this.renderIndicator({
            state: 'error',
            title: 'Incoming announcement unavailable',
            copy: 'The announcement clip URL is missing, expired, or unavailable.',
            showDismiss: true
        });
    }

    cleanupAudio() {
        if (this.audio) {
            this.audio.pause?.();
            this.audio.src = '';
            this.audio = null;
        }

        if (this.currentObjectUrl) {
            URL.revokeObjectURL(this.currentObjectUrl);
            this.currentObjectUrl = null;
        }
    }

    destroy() {
        if (this.dismissTimer) {
            clearTimeout(this.dismissTimer);
            this.dismissTimer = null;
        }

        this.cleanupAudio();
        if (this.channel) {
            void this.supabase?.removeChannel?.(this.channel);
            this.channel = null;
        }
        this.host?.remove?.();
        this.host = null;
    }
}

export function mountWhiteCellIntercomPlugin(context = {}) {
    const plugin = new WhiteCellIntercomPlugin(context);
    plugin.mount();
    return plugin;
}

export function unmountWhiteCellIntercomPlugin(instance) {
    instance?.destroy?.();
}

export function mountScribeIntercomReceiver(context = {}) {
    const receiver = new ScribeIntercomReceiver(context);
    void receiver.mount().catch((error) => {
        logger.error('Failed to mount Scribe intercom receiver:', error);
        receiver.destroy();
    });
    return receiver;
}

export function unmountScribeIntercomReceiver(instance) {
    instance?.destroy?.();
}
