import { describe, expect, it } from 'vitest';

import {
    buildAppUrl,
    classifyOperatorAuthorizationProgress,
    getConfiguredAppBaseUrl,
    getHostedOperatorAccessCode,
    isHostedRehearsal,
    resolveOperatorAccessCode
} from './rehearsalRuntime.js';

describe('rehearsal runtime helpers', () => {
    it('detects hosted rehearsals from a configured base url', () => {
        expect(isHostedRehearsal('https://seth-arc.github.io/SSG-Platform-v03/')).toBe(true);
        expect(isHostedRehearsal('   ')).toBe(false);
        expect(isHostedRehearsal(undefined)).toBe(false);
    });

    it('normalizes the configured app base url to the repo root', () => {
        expect(getConfiguredAppBaseUrl('https://seth-arc.github.io/SSG-Platform-v03/index.html')).toBe(
            'https://seth-arc.github.io/SSG-Platform-v03/'
        );
    });

    it('builds repo-relative hosted urls without dropping the GitHub Pages slug', () => {
        const baseUrl = 'https://seth-arc.github.io/SSG-Platform-v03/';

        expect(buildAppUrl('', baseUrl)).toBe('https://seth-arc.github.io/SSG-Platform-v03/');
        expect(buildAppUrl('whitecell.html', baseUrl)).toBe('https://seth-arc.github.io/SSG-Platform-v03/whitecell.html');
    });

    it('reads and trims the hosted operator code only for hosted rehearsals', () => {
        expect(getHostedOperatorAccessCode({
            baseUrl: 'https://seth-arc.github.io/SSG-Platform-v03/',
            operatorAccessCode: '  live-code  '
        })).toBe('live-code');

        expect(getHostedOperatorAccessCode({
            baseUrl: '',
            operatorAccessCode: 'live-code'
        })).toBe('');
    });

    it('prefers the hosted operator code and falls back to the local mock code', () => {
        expect(resolveOperatorAccessCode('admin2025', {
            baseUrl: 'https://seth-arc.github.io/SSG-Platform-v03/',
            operatorAccessCode: 'live-code'
        })).toBe('live-code');

        expect(resolveOperatorAccessCode('admin2025', {
            baseUrl: '',
            operatorAccessCode: 'live-code'
        })).toBe('admin2025');
    });

    it('classifies successful operator authorization from the destination url', () => {
        expect(classifyOperatorAuthorizationProgress({
            currentUrl: 'https://seth-arc.github.io/SSG-Platform-v03/master.html',
            urlPattern: /master\.html(?:\?.*)?$/
        })).toEqual(expect.objectContaining({
            status: 'success'
        }));
    });

    it('classifies explicit operator auth failures from toast copy', () => {
        expect(classifyOperatorAuthorizationProgress({
            currentUrl: 'https://seth-arc.github.io/SSG-Platform-v03/',
            urlPattern: /master\.html(?:\?.*)?$/,
            toastText: 'Invalid operator access code.'
        })).toEqual(expect.objectContaining({
            status: 'failure',
            toastText: 'Invalid operator access code.'
        }));
    });

    it('keeps operator authorization pending when neither success nor failure is visible yet', () => {
        expect(classifyOperatorAuthorizationProgress({
            currentUrl: 'https://seth-arc.github.io/SSG-Platform-v03/index.html#operatorAccessSection',
            urlPattern: /master\.html(?:\?.*)?$/
        })).toEqual(expect.objectContaining({
            status: 'pending'
        }));
    });
});
