import { describe, expect, it } from 'vitest';

import {
    buildAppPath,
    buildAppUrl,
    getCurrentAppRelativePath,
    isLandingPage,
    normalizeBasePath
} from './navigation.js';

describe('navigation', () => {
    it('normalizes GitHub Pages style base paths', () => {
        expect(normalizeBasePath('repo-slug')).toBe('/repo-slug/');
        expect(normalizeBasePath('/repo-slug')).toBe('/repo-slug/');
        expect(normalizeBasePath('/repo-slug/')).toBe('/repo-slug/');
        expect(normalizeBasePath('./')).toBe('/');
    });

    it('builds app paths and urls from a project-site base path', () => {
        expect(buildAppPath('', { basePath: '/repo-slug/' })).toBe('/repo-slug/');
        expect(buildAppPath('master.html', { basePath: '/repo-slug/' })).toBe('/repo-slug/master.html');
        expect(buildAppPath('/teams/blue/facilitator.html?mode=observer', { basePath: '/repo-slug/' })).toBe('/repo-slug/teams/blue/facilitator.html?mode=observer');
        expect(buildAppUrl('whitecell.html', {
            basePath: '/repo-slug/',
            locationRef: { origin: 'https://owner.github.io' }
        })).toBe('https://owner.github.io/repo-slug/whitecell.html');
    });

    it('detects the current app-relative page under a project-site path', () => {
        expect(getCurrentAppRelativePath({
            basePath: '/repo-slug/',
            locationRef: { pathname: '/repo-slug/teams/green/notetaker.html' }
        })).toBe('teams/green/notetaker.html');

        expect(isLandingPage({
            basePath: '/repo-slug/',
            locationRef: { pathname: '/repo-slug/' }
        })).toBe(true);

        expect(isLandingPage({
            basePath: '/repo-slug/',
            locationRef: { pathname: '/repo-slug/master.html' }
        })).toBe(false);
    });
});
