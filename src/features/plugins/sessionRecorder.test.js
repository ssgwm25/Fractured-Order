import { describe, expect, it } from 'vitest';

import {
    SESSION_RECORDER_ARTIFACT_STORAGE_KEY,
    buildSessionRecordingArtifact,
    createSessionRecorderMediaRecorder,
    getSessionRecorderMicrophoneConstraints,
    getSessionRecordingNoticeModel,
    getStoredSessionRecordingArtifacts,
    getSupportedSessionRecorderMimeType,
    removeSessionRecordingArtifact,
    saveSessionRecordingArtifact
} from './sessionRecorder.js';

class MemoryStorage {
    constructor() {
        this.values = new Map();
    }

    getItem(key) {
        return this.values.has(key) ? this.values.get(key) : null;
    }

    setItem(key, value) {
        this.values.set(key, String(value));
    }
}

describe('Session Recorder plugin helpers', () => {
    it('requests browser voice-capture constraints with mono high-rate audio when supported', () => {
        const constraints = getSessionRecorderMicrophoneConstraints({
            mediaDevices: {
                getSupportedConstraints: () => ({
                    sampleRate: true,
                    channelCount: true
                })
            }
        });

        expect(constraints).toEqual({
            audio: {
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: true },
                autoGainControl: { ideal: true },
                sampleRate: { ideal: 48000 },
                channelCount: { ideal: 1 }
            }
        });
    });

    it('selects the first supported MIME type from the recorder candidate list', () => {
        const mediaRecorderCtor = {
            isTypeSupported: (mimeType) => mimeType === 'audio/webm'
        };

        expect(getSupportedSessionRecorderMimeType(mediaRecorderCtor, [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4'
        ])).toBe('audio/webm');
    });

    it('tries high audio bitrates first and falls back when a recorder constructor rejects one', () => {
        class MockMediaRecorder {
            static attempts = [];

            constructor(_stream, options) {
                MockMediaRecorder.attempts.push(options);
                if (options.audioBitsPerSecond === 256000) {
                    throw new Error('unsupported bitrate');
                }
                this.audioBitsPerSecond = options.audioBitsPerSecond;
            }
        }

        const selection = createSessionRecorderMediaRecorder({}, {
            mediaRecorderCtor: MockMediaRecorder,
            mimeType: 'audio/webm',
            bitrateCandidates: [256000, 192000]
        });

        expect(selection.audioBitsPerSecondRequested).toBe(192000);
        expect(selection.audioBitsPerSecondUsed).toBe(192000);
        expect(MockMediaRecorder.attempts).toEqual([
            { mimeType: 'audio/webm', audioBitsPerSecond: 256000 },
            { mimeType: 'audio/webm', audioBitsPerSecond: 192000 }
        ]);
    });

    it('persists, returns, and removes session recording artifact metadata by session', () => {
        const storage = new MemoryStorage();
        const artifact = buildSessionRecordingArtifact({
            sessionId: 'session-1',
            recordingId: 'recording-1',
            startedAtUtc: '2026-06-03T10:04:00.000Z',
            stoppedAtUtc: '2026-06-03T10:19:00.000Z',
            durationSeconds: 900,
            mimeType: 'audio/webm;codecs=opus',
            fileSizeBytes: 2048,
            generatedByRole: 'whitecell',
            generatedByUser: 'White Cell Lead',
            filename: 'session-recording-session-1.webm',
            storageReference: 'browser-download:session-recording-session-1.webm',
            objectUrl: 'blob:http://localhost/recording-1',
            captureConstraintsRequested: {
                audio: {
                    echoCancellation: { ideal: true }
                }
            },
            recorderMimeTypeSelected: 'audio/webm;codecs=opus',
            audioBitsPerSecondRequested: 256000,
            audioBitsPerSecondUsed: 192000,
            createdAtUtc: '2026-06-03T10:19:05.000Z'
        });

        saveSessionRecordingArtifact(artifact, { storage });

        expect(JSON.parse(storage.getItem(SESSION_RECORDER_ARTIFACT_STORAGE_KEY))).toHaveLength(1);
        expect(getStoredSessionRecordingArtifacts('session-1', { storage })).toEqual([
            expect.objectContaining({
                recording_id: 'recording-1',
                filename: 'session-recording-session-1.webm',
                object_url_lifecycle: 'current_browser_document',
                audio_bits_per_second_used: 192000
            })
        ]);
        expect(getStoredSessionRecordingArtifacts('other-session', { storage })).toEqual([]);

        expect(removeSessionRecordingArtifact('recording-1', { storage })).toBe(true);
        expect(getStoredSessionRecordingArtifacts('session-1', { storage })).toEqual([]);
    });

    it('returns participant notice copy only when the shared recorder state is active', () => {
        expect(getSessionRecordingNoticeModel({
            'session-recorder': {
                enabled: true,
                recording_status: 'recording',
                recording_id: 'recording-1',
                recording_started_at_utc: '2026-06-03T10:04:00.000Z'
            }
        })).toEqual({
            state: 'recording',
            title: 'Session recording active',
            copy: 'Audio is being captured for post-game review'
        });

        expect(getSessionRecordingNoticeModel({
            'session-recorder': {
                enabled: false,
                recording_status: 'recording'
            }
        })).toBeNull();
    });
});
