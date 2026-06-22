import { describe, expect, it } from 'vitest';

import { buildMissingConfigMessage, validateConfig } from './config.js';

describe('runtime configuration validation', () => {
    it('rejects missing Supabase values', () => {
        const validation = validateConfig({
            SUPABASE_URL: '',
            SUPABASE_ANON_KEY: '',
            RUNTIME_MODE: 'backend-required'
        });

        expect(validation.valid).toBe(false);
        expect(validation.runtimeMode).toBe('backend-required');
        expect(validation.issues).toEqual([
            'VITE_SUPABASE_URL is not configured.',
            'VITE_SUPABASE_ANON_KEY is not configured.'
        ]);
    });

    it('rejects placeholder Supabase values', () => {
        const validation = validateConfig({
            SUPABASE_URL: 'https://your-project-ref.supabase.co',
            SUPABASE_ANON_KEY: '<your-supabase-anon-key>',
            RUNTIME_MODE: 'backend-required'
        });

        expect(validation.valid).toBe(false);
        expect(validation.runtimeMode).toBe('backend-required');
        expect(validation.issues).toEqual([
            'VITE_SUPABASE_URL must be a valid Supabase project URL.',
            'VITE_SUPABASE_ANON_KEY must be replaced with a real Supabase anon key.'
        ]);
    });

    it('builds a clear operator-facing missing config message', () => {
        const message = buildMissingConfigMessage({
            valid: false,
            issues: ['VITE_SUPABASE_URL is not configured.']
        });

        expect(message).toContain('Backend configuration is required.');
        expect(message).toContain('.env.example');
        expect(message).toContain('untracked .env.local');
    });
});
