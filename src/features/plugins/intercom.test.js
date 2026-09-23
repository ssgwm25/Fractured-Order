import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/supabase.js', () => ({
    supabase: {
        channel: vi.fn(),
        removeChannel: vi.fn(),
        storage: {
            from: vi.fn()
        }
    }
}));

import {
    INTERCOM_ANNOUNCEMENT_EVENT,
    INTERCOM_INLINE_AUDIO_THRESHOLD_BYTES,
    INTERCOM_PLUGIN_ID,
    INTERCOM_SCRIBE_TARGET_ROLES,
    ScribeIntercomReceiver,
    buildIntercomAnnouncementPayload,
    getIntercomChannelName,
    getIntercomStorageErrorMessage,
    getIntercomStoragePath,
    isIntercomAnnouncementForScribe,
    normalizeIntercomAnnouncementPayload,
    selectIntercomDeliveryMode
} from './intercom.js';

describe('Intercom plugin transport contract', () => {
    it('targets the actual Scribe role seats used by the repo routes', () => {
        expect(INTERCOM_SCRIBE_TARGET_ROLES).toEqual([
            'blue_facilitator',
            'red_facilitator',
            'green_facilitator',
            'industry_facilitator',
            'green_asian_pacific_scribe',
            'green_europe_scribe'
        ]);
    });

    it('builds a session-scoped all-scribes realtime payload', () => {
        const payload = buildIntercomAnnouncementPayload({
            announcementId: 'intercom-1',
            sessionId: 'session-1',
            senderRole: 'whitecell_lead',
            senderTeam: 'white_cell',
            mimeType: 'audio/webm',
            durationSeconds: 3.2,
            size: 2048,
            deliveryMode: 'inline',
            inlineAudioBase64: 'ZmFrZS1hdWRpbw==',
            createdAt: '2026-06-28T00:00:00.000Z'
        });

        expect(payload).toMatchObject({
            event_type: INTERCOM_ANNOUNCEMENT_EVENT,
            plugin_id: INTERCOM_PLUGIN_ID,
            announcement_id: 'intercom-1',
            session_id: 'session-1',
            sender_role: 'whitecell_lead',
            sender_team: 'white_cell',
            target: 'all_scribes',
            delivery_mode: 'inline',
            inline_audio_base64: 'ZmFrZS1hdWRpbw=='
        });
        expect(payload.target_roles).toEqual(INTERCOM_SCRIBE_TARGET_ROLES);
    });

    it('accepts only matching session and actual Scribe roles', () => {
        const payload = buildIntercomAnnouncementPayload({
            announcementId: 'intercom-2',
            sessionId: 'session-2',
            mimeType: 'audio/webm',
            durationSeconds: 1,
            size: 512,
            deliveryMode: 'inline',
            inlineAudioBase64: 'ZmFrZS1hdWRpbw=='
        });

        expect(isIntercomAnnouncementForScribe(payload, {
            sessionId: 'session-2',
            role: 'blue_facilitator'
        })).toBe(true);
        expect(isIntercomAnnouncementForScribe(payload, {
            sessionId: 'session-2',
            role: 'blue_scribe'
        })).toBe(false);
        expect(isIntercomAnnouncementForScribe(payload, {
            sessionId: 'other-session',
            role: 'blue_facilitator'
        })).toBe(false);
    });

    it('routes small clips inline and larger clips through storage', () => {
        expect(selectIntercomDeliveryMode({
            size: INTERCOM_INLINE_AUDIO_THRESHOLD_BYTES
        })).toBe('inline');

        expect(selectIntercomDeliveryMode({
            size: INTERCOM_INLINE_AUDIO_THRESHOLD_BYTES + 1
        })).toBe('storage');
    });

    it.each(['green_asian_pacific_scribe', 'green_europe_scribe'])(
        'delivers the same all-scribes announcement through the %s receiver', async (role) => {
            const payload = buildIntercomAnnouncementPayload({ announcementId: 'gc09', sessionId: 'session',
                mimeType: 'audio/webm', size: 100, deliveryMode: 'inline', inlineAudioBase64: 'YQ==' });
            const receiver = new ScribeIntercomReceiver({ sessionId: 'session', role });
            receiver.renderIndicator = vi.fn();
            receiver.resolveAudioUrl = vi.fn().mockResolvedValue('blob:announcement');
            receiver.loadAndPlayAudio = vi.fn().mockResolvedValue();
            await receiver.handleAnnouncement(payload);
            expect(receiver.loadAndPlayAudio).toHaveBeenCalledWith('blob:announcement', payload, 1);
            receiver.loadAndPlayAudio.mockClear();
            await receiver.handleAnnouncement({ ...payload, session_id: 'foreign' });
            expect(receiver.loadAndPlayAudio).not.toHaveBeenCalled();
        }
    );

    it.each(['green_shared_facilitator', 'green_asian_pacific_facilitator', 'green_europe_facilitator',
        'green_asian_pacific_notetaker', 'green_europe_notetaker', 'viewer'])(
        'does not treat %s as a Scribe even if a payload adds it', (role) => {
            const payload = buildIntercomAnnouncementPayload({ announcementId: 'gc09', sessionId: 'session',
                mimeType: 'audio/webm', size: 100, deliveryMode: 'inline', inlineAudioBase64: 'YQ==' });
            payload.target_roles.push(role);
            expect(isIntercomAnnouncementForScribe(payload, { sessionId: 'session', role })).toBe(false);
        }
    );

    it('rejects malformed announcement metadata before playback', () => {
        expect(normalizeIntercomAnnouncementPayload(null)).toBeNull();
        expect(normalizeIntercomAnnouncementPayload({
            event_type: INTERCOM_ANNOUNCEMENT_EVENT,
            plugin_id: INTERCOM_PLUGIN_ID,
            session_id: 'session-1',
            announcement_id: 'intercom-3',
            target: 'all_scribes',
            target_roles: ['blue_facilitator'],
            mime_type: 'audio/webm',
            size: 1024,
            delivery_mode: 'inline'
        })).toBeNull();
        expect(normalizeIntercomAnnouncementPayload({
            event_type: INTERCOM_ANNOUNCEMENT_EVENT,
            plugin_id: INTERCOM_PLUGIN_ID,
            session_id: 'session-1',
            announcement_id: 'intercom-4',
            target: 'all_scribes',
            target_roles: ['blue_facilitator'],
            mime_type: 'audio/webm',
            size: 1024,
            delivery_mode: 'storage',
            storage_bucket: 'intercom-announcements',
            storage_path: 'session-1/intercom-4.webm'
        })).toMatchObject({
            delivery_mode: 'storage',
            storage_bucket: 'intercom-announcements'
        });
    });

    it('uses stable session channel and storage path names', () => {
        expect(getIntercomChannelName('session-abc')).toBe('intercom:session-abc');
        expect(getIntercomStoragePath({
            sessionId: 'session-abc',
            announcementId: 'intercom-5',
            mimeType: 'audio/ogg;codecs=opus'
        })).toBe('session-abc/intercom-5.ogg');
    });

    it('makes a missing Storage bucket failure actionable for operators', () => {
        expect(getIntercomStorageErrorMessage({
            message: 'Bucket not found'
        })).toContain('data/2026-06-28_intercom_storage_bucket.sql');
        expect(getIntercomStorageErrorMessage({
            message: 'Bucket not found'
        })).toContain('intercom-announcements');
    });
});

describe('GC09 Intercom announcement lifetime', () => {
    let receiver, audios, nextPlay;
    const deferred = () => {
        let resolve, reject;
        const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        return { promise, resolve, reject };
    };
    const payload = (id, storage = false) => buildIntercomAnnouncementPayload({
        announcementId: id, sessionId: 'session', mimeType: 'audio/webm', size: 100,
        deliveryMode: storage ? 'storage' : 'inline', inlineAudioBase64: storage ? null : 'YQ==',
        storageBucket: storage ? 'clips' : null, storagePath: storage ? `${id}.webm` : null,
        signedUrl: storage ? `https://example.invalid/${id}` : null
    });
    beforeEach(() => {
        audios = [];
        nextPlay = null;
        vi.useFakeTimers();
        vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:clip-${audios.length}`), revokeObjectURL: vi.fn() });
        vi.stubGlobal('Audio', class {
            constructor(src) {
                this.url = src;
                this.listeners = new Map();
                this.pause = vi.fn();
                this.play = vi.fn().mockReturnValue(nextPlay || Promise.resolve());
                nextPlay = null;
                audios.push(this);
            }
            addEventListener(type, callback) { this.listeners.set(type, callback); }
            removeEventListener(type, callback) { if (this.listeners.get(type) === callback) this.listeners.delete(type); }
            // Reproduce the browser hazard: clearing src emits an old media error.
            set src(value) { this.url = value; if (!value) this.listeners.get('error')?.(); }
        });
        receiver = new ScribeIntercomReceiver({ sessionId: 'session', role: 'green_europe_scribe' });
        receiver.renderIndicator = vi.fn();
        receiver.createSignedStorageUrl = vi.fn().mockResolvedValue('https://example.invalid/refreshed');
    });
    afterEach(() => { receiver.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('detaches old storage listeners before clearing src and ignores already queued callbacks', async () => {
        await receiver.handleAnnouncement(payload('old', true));
        const old = audios[0];
        const error = old.listeners.get('error');
        const ended = old.listeners.get('ended');
        await receiver.handleAnnouncement(payload('new'));
        const renders = receiver.renderIndicator.mock.calls.length;
        error();
        ended();
        expect(old.listeners.size).toBe(0);
        expect(receiver.createSignedStorageUrl).not.toHaveBeenCalled();
        expect(receiver.audio).toBe(audios[1]);
        expect(receiver.renderIndicator).toHaveBeenCalledTimes(renders);
        expect(receiver.dismissTimer).toBeNull();
    });

    it.each(['resolve', 'reject'])('ignores a late initial storage URL %s after an inline replacement', async (outcome) => {
        const gate = deferred();
        receiver.createSignedStorageUrl.mockReturnValueOnce(gate.promise);
        const old = receiver.handleAnnouncement({ ...payload('old', true), signed_url: null });
        await receiver.handleAnnouncement(payload('new'));
        if (outcome === 'resolve') gate.resolve('https://example.invalid/late');
        else gate.reject(new Error('old unavailable'));
        await old;
        expect(audios).toHaveLength(1);
        expect(receiver.audio.url).toContain('blob:');
        expect(receiver.renderIndicator).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'playing' }));
    });

    it.each(['replace', 'dismiss', 'destroy'])('does not replay an in-flight signed URL refresh after %s', async (action) => {
        await receiver.handleAnnouncement(payload('old', true));
        const gate = deferred();
        receiver.createSignedStorageUrl.mockReturnValueOnce(gate.promise);
        const refresh = receiver.handleAudioError(payload('old', true));
        if (action === 'replace') await receiver.handleAnnouncement(payload('new'));
        else if (action === 'dismiss') receiver.dismissIndicator();
        else receiver.destroy();
        const count = audios.length;
        const renders = receiver.renderIndicator.mock.calls.length;
        gate.resolve('https://example.invalid/old-refresh');
        await refresh;
        expect(audios).toHaveLength(count);
        expect(receiver.renderIndicator).toHaveBeenCalledTimes(renders);
        if (action !== 'replace') expect(receiver.audio).toBeNull();
    });

    it.each(['resolve', 'reject'])('ignores late playback promise %s from replaced audio', async (outcome) => {
        const gate = deferred();
        nextPlay = gate.promise;
        const old = receiver.handleAnnouncement(payload('old'));
        await Promise.resolve();
        expect(audios).toHaveLength(1);
        await receiver.handleAnnouncement(payload('new'));
        const renders = receiver.renderIndicator.mock.calls.length;
        if (outcome === 'resolve') gate.resolve();
        else gate.reject(new Error('autoplay blocked on old clip'));
        await old;
        expect(receiver.renderIndicator).toHaveBeenCalledTimes(renders);
        expect(receiver.audio).toBe(audios[1]);
    });

    it('clears the old dismissal timer when the next announcement arrives', async () => {
        await receiver.handleAnnouncement(payload('old'));
        audios[0].listeners.get('ended')();
        await receiver.handleAnnouncement(payload('new'));
        vi.runAllTimers();
        expect(receiver.audio).toBe(audios[1]);
        expect(receiver.audio.pause).not.toHaveBeenCalled();
    });

    it('refreshes the current storage clip once, then reports unavailable without looping', async () => {
        const current = payload('current', true);
        await receiver.handleAnnouncement(current);
        await receiver.handleAudioError(current);
        expect(receiver.createSignedStorageUrl).toHaveBeenCalledTimes(1);
        expect(receiver.audio.url).toBe('https://example.invalid/refreshed');
        await receiver.handleAudioError(current);
        expect(receiver.createSignedStorageUrl).toHaveBeenCalledTimes(1);
        expect(receiver.renderIndicator).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'error' }));
    });

    it('retains click-to-play for the current clip and revokes inline resources on dismissal', async () => {
        nextPlay = Promise.reject(new Error('autoplay denied'));
        await receiver.handleAnnouncement(payload('current'));
        expect(receiver.renderIndicator).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'blocked', showPlay: true }));
        receiver.audio.play.mockResolvedValue();
        await receiver.handlePlayClick();
        expect(receiver.renderIndicator).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'playing', copy: 'Playback started.' }));
        const url = receiver.currentObjectUrl;
        receiver.dismissIndicator();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
        expect(receiver.audio).toBeNull();
    });
});
