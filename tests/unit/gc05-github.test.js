import { describe, expect, it, vi } from 'vitest';
import { lookupGitHubWorkflow, assertGitHubLookup } from '../../scripts/gc05-github.mjs';
import { assertDeploymentRun } from '../../scripts/gc05-evidence-contract.mjs';

const url = 'https://github.com/example/Fractured-Order/actions/runs/123';
const token = 'github_pat_synthetic_test_only';
const source = { revision: 'a'.repeat(40), status: '' };
const receipt = { html_url: url, head_sha: source.revision, status: 'completed',
    conclusion: 'success', path: '.github/workflows/deploy-pages.yml' };
const response = (status = 200, body = receipt) => ({ status,
    headers: { get: () => 'synthetic-request-id' }, json: async () => body });

describe('GC05 authenticated GitHub lookup (no network)', () => {
    it('sends the token only to the derived GitHub GET endpoint and never records request credentials', async () => {
        const send = vi.fn().mockResolvedValue(response());
        const result = await lookupGitHubWorkflow(url, token, send);
        expect(send).toHaveBeenCalledTimes(1);
        const [target, options] = send.mock.calls[0];
        expect(target).toBe('https://api.github.com/repos/example/Fractured-Order/actions/runs/123');
        expect(options.method).toBe('GET');
        expect(options.redirect).toBe('error');
        expect(options.headers.Authorization).toBe(`Bearer ${token}`);
        expect(options.headers['User-Agent']).toBe('fractured-order-gc05-evidence');
        expect(result.authenticated).toBe(true);
        expect(result.requestId).toBe('synthetic-request-id');
        expect(JSON.stringify(result)).not.toContain(token);
        expect(result).not.toHaveProperty('headers');
        expect(() => assertGitHubLookup(result)).not.toThrow();
        expect(() => assertDeploymentRun(result.receipt, source, url)).not.toThrow();
        expect(() => assertDeploymentRun(result.receipt, { ...source, revision: 'b'.repeat(40) }, url)).toThrow();
    });
    it('retains public access without an Authorization header', async () => {
        const send = vi.fn().mockResolvedValue(response());
        const result = await lookupGitHubWorkflow(url, '', send);
        expect(send.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
        expect(result.authenticated).toBe(false);
        expect(() => assertGitHubLookup(result)).not.toThrow();
    });
    it.each(['https://example.com/actions/runs/123', 'https://github.com@evil.example/example/repo/actions/runs/123',
        'http://github.com/example/repo/actions/runs/123'])('rejects untrusted addresses before sending credentials: %s', async address => {
        const send = vi.fn();
        await expect(lookupGitHubWorkflow(address, token, send)).rejects.toThrow();
        expect(send).not.toHaveBeenCalled();
    });
    it.each(['sbp_wrong_provider', 'ghp_token\r\nInjected: header', 'Bearer ghp_token'])('rejects wrong-provider or malformed tokens: %s', async invalid => {
        const send = vi.fn();
        await expect(lookupGitHubWorkflow(url, invalid, send)).rejects.toThrow('Use a GitHub personal access token');
        expect(send).not.toHaveBeenCalled();
    });
    it.each([301, 401, 403, 404, 500])('retains HTTP %s as failure without retrying or following a redirect', async status => {
        const send = vi.fn().mockResolvedValue(response(status, { message: `denied ${token}` }));
        const result = await lookupGitHubWorkflow(url, token, send);
        expect(result.status).toBe(status);
        expect(JSON.stringify(result)).not.toContain(token);
        expect(send).toHaveBeenCalledTimes(1);
        expect(() => assertGitHubLookup(result)).toThrow(`HTTP ${status}`);
    });
    it('redacts transport errors and retains a failed receipt', async () => {
        const send = vi.fn().mockRejectedValue(new Error(`request failed ${token}`));
        const result = await lookupGitHubWorkflow(url, token, send);
        expect(result.error).toContain('[REDACTED]');
        expect(JSON.stringify(result)).not.toContain(token);
        expect(() => assertGitHubLookup(result)).toThrow('transport error');
    });
    it('does not accept successful HTTP with malformed JSON', async () => {
        const send = vi.fn().mockResolvedValue({ ...response(), json: async () => { throw new Error('invalid JSON'); } });
        const result = await lookupGitHubWorkflow(url, token, send);
        expect(result.responseFormat).toBe('non-json');
        expect(() => assertGitHubLookup(result)).toThrow();
    });
});
