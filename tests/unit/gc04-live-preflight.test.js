import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { inspectDeployment, missingLandingControls, screenReaderAnswer } from '../../scripts/gc04-live-preflight.mjs';
import { LOCAL_APP_BASE_URL } from '../../scripts/gc04-live-contract.mjs';

const current = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
describe('GC04 deployment and manual-mode preflight', () => {
    it('accepts the current landing markup and identifies an older deployment', () => {
        expect(missingLandingControls(current)).toEqual([]);
        const old = current.replace('id="checkSessionBtn"', 'id="oldCheck"');
        expect(missingLandingControls(old)).toEqual(['button#checkSessionBtn']);
    });
    it('does not accept required controls mentioned only inside comments', () => {
        const old = current.replace('id="checkSessionBtn"', 'id="oldCheck"');
        expect(missingLandingControls(`${old}<!-- <button id="checkSessionBtn">Check session</button> -->`))
            .toContain('button#checkSessionBtn');
    });
    it('uses a single credential-free static GET and returns a failed receipt for stale markup', async () => {
        const send = vi.fn().mockResolvedValue({ status: 200, text: async () => '<form id="joinForm"></form>' });
        const result = await inspectDeployment('https://example.test/Fractured-Order/', send);
        expect(send).toHaveBeenCalledOnce();
        expect(send.mock.calls[0][1]).toMatchObject({ redirect: 'error', cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        expect(send.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
        expect(result).toMatchObject({ passed: false, status: 200 });
        expect(result.missing).toContain('button#checkSessionBtn');
        expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    });
    it('rejects non-success deployment responses', async () => {
        await expect(inspectDeployment('https://example.test/Fractured-Order/',
            async () => ({ status: 404 }))).rejects.toThrow('HTTP 404');
    });
    it('requires local opt-in before fetching and labels local evidence explicitly', async () => {
        const send = vi.fn().mockResolvedValue({ status: 200, text: async () => current });
        await expect(inspectDeployment(LOCAL_APP_BASE_URL, send)).rejects.toThrow();
        expect(send).not.toHaveBeenCalled();
        const result = await inspectDeployment(LOCAL_APP_BASE_URL, send, { local: true });
        expect(send).toHaveBeenCalledOnce();
        expect(send.mock.calls[0][0]).toBe(LOCAL_APP_BASE_URL);
        expect(result).toMatchObject({ url: LOCAL_APP_BASE_URL, target: 'local', passed: true, missing: [] });
    });
    it('rejects pasted shell commands and supports an explicit automation-only choice', () => {
        for (const input of ['', 'node --preserve-symlinks scripts/gc04-live-check.mjs', 'npm test']) {
            expect(screenReaderAnswer(input)).toEqual({ mode: 'invalid' });
        }
        expect(screenReaderAnswer('skip')).toEqual({ mode: 'automated' });
        expect(screenReaderAnswer('none')).toEqual({ mode: 'automated' });
        expect(screenReaderAnswer('NVDA installed version, Windows 11, SG')).toMatchObject({ mode: 'manual' });
    });
});
