// Node-only GitHub workflow lookup. Credentials never enter env, files or browsers.
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { deploymentRun, requireEvidence } from './gc05-evidence-contract.mjs';
import { redact } from './gc04-live-contract.mjs';

export async function promptGitHubToken() {
    // Preserve unattended public lookups. Private lookups need the hidden prompt.
    if (!process.stdin.isTTY) return '';
    process.stdout.write('Paste GitHub PERSONAL ACCESS TOKEN (hidden; Enter for public access): ');
    const silent = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const input = createInterface({ input: process.stdin, output: silent, terminal: true });
    const abort = new AbortController();
    input.on('SIGINT', () => abort.abort());
    try { return (await input.question('', { signal: abort.signal })).trim(); }
    finally { input.close(); process.stdout.write('\n'); }
}

export async function lookupGitHubWorkflow(runURL, token = '', send = fetch) {
    // Derive the API address from the validated GitHub run URL, never caller-supplied headers/hosts.
    const workflow = deploymentRun(runURL);
    requireEvidence(typeof token === 'string' && (token === '' || /^(?:github_pat_|ghp_)[A-Za-z0-9_]+$/.test(token)),
        'Use a GitHub personal access token beginning github_pat_ or ghp_, or Enter for public access.');
    const record = { ...workflow, authenticated: Boolean(token), startedAt: new Date().toISOString() };
    try {
        const response = await send(workflow.api, {
            method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'fractured-order-gc05-evidence',
                ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        });
        record.status = response.status;
        record.requestId = response.headers.get('x-github-request-id');
        try { record.receipt = await response.json(); }
        catch { record.receipt = null; record.responseFormat = 'non-json'; }
    } catch (error) {
        // Retain a safe failed receipt; do not retry anonymously or follow redirects.
        record.error = String(error.message);
    }
    record.finishedAt = new Date().toISOString();
    return redact(record, token ? [token] : []);
}

export function assertGitHubLookup(record) {
    requireEvidence(record?.status === 200 && !record.error && record.receipt
        && typeof record.receipt === 'object' && !Array.isArray(record.receipt),
    `Deployment workflow lookup failed: ${record?.status ? `HTTP ${record.status}` : 'transport error'}. `
        + 'For a private run, use the hidden GitHub token prompt with repository access and Actions: read. '
        + 'Check the run URL and token permissions; deployment verification remains incomplete.');
}
