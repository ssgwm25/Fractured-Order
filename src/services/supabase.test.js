import { afterEach, describe, expect, it } from 'vitest';

import { ConfigurationError } from '../core/errors.js';
import {
    classifySupabaseAuthFailure,
    createUnavailableSupabaseClient,
    getSupabaseAuthStorageBackend
} from './supabase.js';

class MemoryStorage {
    constructor() {
        this.store = new Map();
    }

    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }

    setItem(key, value) {
        this.store.set(key, String(value));
    }

    removeItem(key) {
        this.store.delete(key);
    }
}

describe('supabase unavailable adapter', () => {
    afterEach(() => {
        delete global.window;
        delete global.localStorage;
        delete global.sessionStorage;
    });

    it('throws a configuration error instead of exposing a null client', () => {
        const unavailableClient = createUnavailableSupabaseClient();

        expect(() => unavailableClient.from('sessions')).toThrow(ConfigurationError);
    });

    it('prefers sessionStorage for browser auth persistence when available', () => {
        global.localStorage = new MemoryStorage();
        global.sessionStorage = new MemoryStorage();
        global.window = {
            localStorage: global.localStorage,
            sessionStorage: global.sessionStorage
        };

        expect(getSupabaseAuthStorageBackend()).toBe('sessionStorage');
    });

    it('classifies unreachable Supabase auth hosts as backend unavailability', () => {
        const failure = classifySupabaseAuthFailure(
            new TypeError('Failed to fetch: net::ERR_NAME_NOT_RESOLVED'),
            { online: true }
        );

        expect(failure).toMatchObject({
            title: 'Supabase Backend Unavailable',
            eyebrow: 'Backend Unavailable'
        });
        expect(failure.message).toContain('could not be reached');
        expect(failure.note).toContain('VITE_SUPABASE_URL');
    });

    it('classifies offline browser state before auth bootstrap retries', () => {
        const failure = classifySupabaseAuthFailure(new TypeError('Failed to fetch'), {
            online: false
        });

        expect(failure).toMatchObject({
            title: 'Browser Offline',
            eyebrow: 'Connection Required'
        });
        expect(failure.message).toContain('offline');
    });

    it('classifies anonymous auth policy failures by Supabase error code', () => {
        const failure = classifySupabaseAuthFailure({
            code: 'anonymous_provider_disabled',
            message: 'Unsupported provider: anonymous'
        });

        expect(failure).toMatchObject({
            title: 'Supabase Auth Configuration Required',
            eyebrow: 'Configuration Required'
        });
        expect(failure.message).toContain('anonymous sign-ins or new-user signups are disabled');
        expect(failure.note).toContain('new-user signups');
    });

    it('classifies signup-disabled auth failures from Supabase policy messages', () => {
        const failure = classifySupabaseAuthFailure({
            code: 'signup_disabled',
            message: 'Signups not allowed for this instance'
        });

        expect(failure).toMatchObject({
            title: 'Supabase Auth Configuration Required',
            eyebrow: 'Configuration Required'
        });
        expect(failure.message).toContain('new-user signups are disabled');
    });
});
