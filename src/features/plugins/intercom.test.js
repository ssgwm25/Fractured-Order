import { describe, expect, it, vi } from 'vitest';

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
            'industry_facilitator'
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
