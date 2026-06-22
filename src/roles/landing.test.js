import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const LANDING_HTML_PATH = new URL('../../index.html', import.meta.url);

function extractRoleSurfaces(html) {
    return [...html.matchAll(/data-role-surface="([^"]+)"/g)].map((match) => match[1]);
}

describe('landing public role visibility', () => {
    it('shows only public participant join roles and moves operator roles into operator access', () => {
        const html = readFileSync(LANDING_HTML_PATH, 'utf8');

        expect(extractRoleSurfaces(html)).toEqual([
            'facilitator',
            'scribe',
            'notetaker'
        ]);
        expect(html).not.toContain('data-role-surface="whitecell"');
        expect(html).toContain('Operator Access');
        expect(html).toContain('operatorWhiteCellLeadBtn');
        expect(html).toContain('operatorWhiteCellSupportBtn');
        expect(html).toContain('operatorGameMasterBtn');
    });

    it('opens directly on the login page with no boot loading screen', () => {
        const html = readFileSync(LANDING_HTML_PATH, 'utf8');

        expect(html).toContain('class="landing"');
        expect(html).not.toContain('id="ssgBootLoader"');
        expect(html).not.toContain('id="bootPulse"');
        expect(html).not.toContain('class="boot-wordmark"');
    });

    it('keeps the landing poster alt text ASCII-safe', () => {
        const html = readFileSync(LANDING_HTML_PATH, 'utf8');
        const emDash = String.fromCharCode(0x2014);

        expect(html).toContain('Fractured Order - A Seminar Simulation');
        expect(html).not.toContain(`Fractured Order ${emDash} A Seminar Simulation`);
    });

    it('uses the Fractured Order / Plenum / SSG landing brand lockup', () => {
        const html = readFileSync(LANDING_HTML_PATH, 'utf8');

        expect(html).toContain('<title>Fractured Order');
        // The poster lockup names the game and its type.
        expect(html).toContain('class="atm-title-name">Fractured Order<');
        expect(html).toContain('class="atm-title-kind">An Economic Statecraft Seminar Game<');
        // The landing stays branded Fractured Order on Plenum for SSG.
        expect(html).toContain('alt="Fractured Order - A Seminar Simulation"');
        expect(html).toContain('on Plenum');
        expect(html).toContain('for SSG');
        expect(html).not.toContain('Statecraft Sim');
    });

    it('contains the operator password field inside a form', () => {
        const html = readFileSync(LANDING_HTML_PATH, 'utf8');

        expect(html).toContain('id="operatorAccessForm"');
        expect(html).toContain('id="operatorAccessUsername"');
        expect(html).toContain('autocomplete="username"');
        expect(html).toContain('id="operatorAccessCode"');
    });

    it('ships persistent accessible error regions for landing and operator validation', () => {
        const html = readFileSync(LANDING_HTML_PATH, 'utf8');

        expect(html).toContain('id="joinForm" class="lf" novalidate');
        expect(html).toContain('aria-describedby="sessionCodeError"');
        expect(html).toContain('id="sessionCodeError"');
        expect(html).toContain('aria-describedby="displayNameError"');
        expect(html).toContain('id="displayNameError"');
        expect(html).toContain('id="roleSelectionGroup"');
        expect(html).toContain('aria-describedby="roleSelectionHelp roleSelectionError"');
        expect(html).toContain('id="roleSelectionError"');
        expect(html).toContain('aria-describedby="operatorAccessCodeError"');
        expect(html).toContain('id="operatorAccessCodeError"');
    });
});
