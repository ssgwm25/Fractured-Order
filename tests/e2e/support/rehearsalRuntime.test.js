import { describe, expect, it } from 'vitest';

import {
    APP_NAVIGATION_OPTIONS,
    attemptOpenGameMasterCreateSession,
    buildAppUrl,
    classifyOperatorAuthorizationProgress,
    getConfiguredAppBaseUrl,
    getHostedOperatorAccessCode,
    isHostedRehearsal,
    OPERATOR_AUTH_TIMEOUT_MS,
    resolveOperatorAccessCode
} from './rehearsalRuntime.js';

describe('rehearsal runtime helpers', () => {
    it('uses a remote-tolerant navigation boundary without waiting for every asset', () => {
        expect(APP_NAVIGATION_OPTIONS).toEqual({
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        expect(OPERATOR_AUTH_TIMEOUT_MS).toBe(60000);
    });

    it('detects hosted rehearsals from a configured base url', () => {
        expect(isHostedRehearsal('https://ssgwm25.github.io/Fractured-Order/')).toBe(true);
        expect(isHostedRehearsal('   ')).toBe(false);
        expect(isHostedRehearsal(undefined)).toBe(false);
    });

    it('normalizes the configured app base url to the repo root', () => {
        expect(getConfiguredAppBaseUrl('https://ssgwm25.github.io/Fractured-Order/index.html')).toBe(
            'https://ssgwm25.github.io/Fractured-Order/'
        );
    });

    it('builds repo-relative hosted urls without dropping the GitHub Pages slug', () => {
        const baseUrl = 'https://ssgwm25.github.io/Fractured-Order/';

        expect(buildAppUrl('', baseUrl)).toBe('https://ssgwm25.github.io/Fractured-Order/');
        expect(buildAppUrl('whitecell.html', baseUrl)).toBe('https://ssgwm25.github.io/Fractured-Order/whitecell.html');
    });

    it('reads and trims the hosted operator code only for hosted rehearsals', () => {
        expect(getHostedOperatorAccessCode({
            baseUrl: 'https://ssgwm25.github.io/Fractured-Order/',
            operatorAccessCode: '  live-code  '
        })).toBe('live-code');

        expect(getHostedOperatorAccessCode({
            baseUrl: '',
            operatorAccessCode: 'live-code'
        })).toBe('');
    });

    it('prefers the hosted operator code and falls back to the local mock code', () => {
        expect(resolveOperatorAccessCode('admin2025', {
            baseUrl: 'https://ssgwm25.github.io/Fractured-Order/',
            operatorAccessCode: 'live-code'
        })).toBe('live-code');

        expect(resolveOperatorAccessCode('admin2025', {
            baseUrl: '',
            operatorAccessCode: 'live-code'
        })).toBe('admin2025');
    });

    it('classifies successful operator authorization from the destination url', () => {
        expect(classifyOperatorAuthorizationProgress({
            currentUrl: 'https://ssgwm25.github.io/Fractured-Order/master.html#dashboard',
            urlPattern: /master\.html(?:[?#].*)?$/
        })).toEqual(expect.objectContaining({
            status: 'success'
        }));
    });

    it('classifies explicit operator auth failures from toast copy', () => {
        expect(classifyOperatorAuthorizationProgress({
            currentUrl: 'https://ssgwm25.github.io/Fractured-Order/',
            urlPattern: /master\.html(?:\?.*)?$/,
            toastText: 'Invalid operator access code.'
        })).toEqual(expect.objectContaining({
            status: 'failure',
            toastText: 'Invalid operator access code.'
        }));
    });

    it('keeps operator authorization pending when neither success nor failure is visible yet', () => {
        expect(classifyOperatorAuthorizationProgress({
            currentUrl: 'https://ssgwm25.github.io/Fractured-Order/index.html#operatorAccessSection',
            urlPattern: /master\.html(?:\?.*)?$/
        })).toEqual(expect.objectContaining({
            status: 'pending'
        }));
    });

    it('retries Game Master navigation before opening the create-session form', async () => {
        let sessionsVisible = false;
        let formVisible = false;
        let navigationAttempts = 0;
        let createAttempts = 0;
        const attempt = () => attemptOpenGameMasterCreateSession({
            isCreateFormReady: async () => formVisible,
            isSessionsSectionVisible: async () => sessionsVisible,
            clickSessions: async () => {
                navigationAttempts += 1;
                sessionsVisible = navigationAttempts >= 2;
            },
            clickCreate: async () => {
                createAttempts += 1;
                formVisible = true;
            }
        });

        await expect(attempt()).resolves.toBe(false);
        expect(navigationAttempts).toBe(1);
        expect(createAttempts).toBe(0);

        await expect(attempt()).resolves.toBe(true);
        expect(navigationAttempts).toBe(2);
        expect(createAttempts).toBe(1);
    });

    it('does not repeat Game Master interactions when the form is already visible', async () => {
        let interactions = 0;

        await expect(attemptOpenGameMasterCreateSession({
            isCreateFormReady: async () => true,
            isSessionsSectionVisible: async () => false,
            clickSessions: async () => { interactions += 1; },
            clickCreate: async () => { interactions += 1; }
        })).resolves.toBe(true);
        expect(interactions).toBe(0);
    });

    it('opens a fresh Game Master form when the previous modal is still closing', async () => {
        let closingFormAttached = true;
        let activeFormReady = false;
        let createAttempts = 0;

        await expect(attemptOpenGameMasterCreateSession({
            isCreateFormReady: async () => activeFormReady,
            isSessionsSectionVisible: async () => true,
            clickSessions: async () => {},
            clickCreate: async () => {
                createAttempts += 1;
                closingFormAttached = false;
                activeFormReady = true;
            }
        })).resolves.toBe(true);

        expect(closingFormAttached).toBe(false);
        expect(activeFormReady).toBe(true);
        expect(createAttempts).toBe(1);
    });
});
