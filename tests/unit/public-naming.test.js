import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

function readText(relativePath) {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function extractTitle(html) {
    return html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? '';
}

function extractMetaDescription(html) {
    return html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] ?? '';
}

describe('public naming', () => {
    it('brands the landing entry points as Fractured Order on Plenum', () => {
        const landingHtml = readText('../../index.html');

        expect(extractTitle(landingHtml)).toBe('Fractured Order');
        expect(extractMetaDescription(landingHtml)).toBe(
            'Fractured Order, a seminar simulation served on the Plenum platform.'
        );
        // The poster lockup names the game and its type.
        expect(landingHtml).toContain('class="atm-title-name">Fractured Order<');
        expect(landingHtml).toContain('class="atm-title-kind">An Economic Statecraft Simulation<');
        expect(landingHtml).toContain('data-team="industry"');
        expect(landingHtml).toContain('Industry team delegation surface');
        // The landing itself stays branded as Fractured Order on Plenum.
        expect(landingHtml).toContain('alt="Fractured Order - A Seminar Simulation"');
        expect(landingHtml).toContain('on Plenum');
        // The public entry branding no longer surfaces the internal product name
        expect(landingHtml).not.toMatch(/\bStatecraft Sim\b/);
        expect(landingHtml).not.toContain('SSG Platform');
        expect(landingHtml).not.toContain('Statecraft Simulations Group');
        expect(landingHtml).not.toContain('ESG Economic Statecraft Simulation Platform');
    });

    it('keeps Statecraft Sim as the repo-internal product name', () => {
        const readme = readText('../../README.md');
        const packageJson = JSON.parse(readText('../../package.json'));

        expect(readme).toContain('# Fractured Order');
        expect(readme).toContain('Plenum is the delivery platform');
        expect(readme).toContain('Statecraft Sim remains the package/internal product description');
        expect(packageJson.description).toBe('Statecraft Sim seminar simulation platform');
    });

    it('uses Plenum in browser-visible client metadata', () => {
        const supabaseClientSource = readText('../../src/services/supabase.js');

        expect(supabaseClientSource).toContain("'x-client-info': `plenum/${CONFIG.VERSION}`");
        expect(supabaseClientSource).not.toContain('esg-platform/');
    });

    it('keeps operator and participant surfaces aligned on Statecraft Sim', () => {
        const expectations = [
            {
                path: '../../master.html',
                title: 'Statecraft Sim | Game Master Operator Console',
                description: 'Statecraft Sim Game Master operator console.'
            },
            {
                path: '../../whitecell.html',
                title: 'Statecraft Sim | White Cell Operator Interface',
                description: 'Statecraft Sim White Cell operator interface.'
            },
            {
                path: '../../teams/blue/facilitator.html',
                title: 'Statecraft Sim | Blue Team Facilitator',
                description: 'Statecraft Sim Blue Team facilitator interface.'
            },
            {
                path: '../../teams/red/facilitator.html',
                title: 'Statecraft Sim | Red Team Facilitator',
                description: 'Statecraft Sim Red Team facilitator interface.'
            },
            {
                path: '../../teams/green/facilitator.html',
                title: 'Statecraft Sim | Green Team Facilitator',
                description: 'Statecraft Sim Green Team facilitator interface.'
            },
            {
                path: '../../teams/industry/facilitator.html',
                title: 'Statecraft Sim | Industry Team Facilitator',
                description: 'Statecraft Sim Industry Team facilitator interface.'
            },
            {
                path: '../../teams/blue/notetaker.html',
                title: 'Statecraft Sim | Blue Team Notetaker',
                description: 'Statecraft Sim Blue Team notetaker interface.'
            },
            {
                path: '../../teams/red/notetaker.html',
                title: 'Statecraft Sim | Red Team Notetaker',
                description: 'Statecraft Sim Red Team notetaker interface.'
            },
            {
                path: '../../teams/green/notetaker.html',
                title: 'Statecraft Sim | Green Team Notetaker',
                description: 'Statecraft Sim Green Team notetaker interface.'
            },
            {
                path: '../../teams/industry/notetaker.html',
                title: 'Statecraft Sim | Industry Team Notetaker',
                description: 'Statecraft Sim Industry Team notetaker interface.'
            }
        ];

        // The visible header <h1> was removed from the interfaces; the internal
        // "Statecraft Sim" brand still lives in each document <title> and meta.
        for (const surface of expectations) {
            const html = readText(surface.path);

            expect(extractTitle(html)).toBe(surface.title);
            expect(extractMetaDescription(html)).toBe(surface.description);
            expect(html).not.toContain('ESG Simulation');
        }
    });
});
