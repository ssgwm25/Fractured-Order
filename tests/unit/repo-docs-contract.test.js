import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

function readText(relativePath) {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('repository operator docs contract', () => {
    it('documents the root Vite app instead of the obsolete nested setup path', () => {
        const readme = readText('../../README.md');

        expect(readme).toContain('# Fractured Order');
        expect(readme).toContain('root-level Vite');
        expect(readme).toContain('npm run dev');
        expect(readme).toContain('.env.example');
        expect(readme).not.toMatch(/platform\/(?:\.env\.example|index\.html|src|$)/i);
    });

    it('pins deployment and Supabase live-demo verification guidance', () => {
        const deployment = readText('../../docs/deployment.md');
        const supabase = readText('../../docs/supabase-setup.md');
        const runbook = readText('../../docs/live-demo-runbook.md');
        const combined = `${deployment}\n${supabase}\n${runbook}`;

        expect(combined).toContain('https://ssgwm25.github.io/Fractured-Order/');
        expect(combined).toContain('GitHub Pages');
        expect(combined).toContain('repository secrets');
        expect(combined).toContain('VITE_SUPABASE_URL');
        expect(combined).toContain('VITE_SUPABASE_ANON_KEY');
        expect(combined).toMatch(/anonymous auth/i);
        expect(combined).toContain('RPC');
        expect(combined).toContain('RLS');
        expect(combined).toContain('browser-public');
        expect(combined).toContain('service-role');
        expect(combined).toContain('./src/main.js');
        expect(combined).toContain('./src/roles/landing.js');
        expect(combined).toContain('/Fractured-Order/assets/');
        expect(combined).toMatch(/Allow all operations/i);
    });
});
