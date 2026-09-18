import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { appUrl, check } from './gc04-live-contract.mjs';

export const LANDING_CONTROLS = ['form#joinForm', 'input#sessionCode', 'input#displayName',
    'button#checkSessionBtn', 'fieldset#delegationSelection', 'p#seatSelectionSummary',
    'button[data-delegation="asian_pacific"]', 'button[data-delegation="europe"]',
    'button[data-role-surface="facilitator"]', 'button[data-role-surface="scribe"]'];

export function missingLandingControls(html) {
    const $ = load(html);
    return LANDING_CONTROLS.filter(selector => $(selector).length !== 1);
}
export async function inspectDeployment(baseURL, send = fetch, { local = false } = {}) {
    const url = appUrl(baseURL, { local });
    // Static GET only: no browser JS, Auth provisioning or database changes.
    const response = await send(url, { redirect: 'error', cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
    check(response.status === 200, `deployment preflight HTTP ${response.status} at ${url}`);
    const html = await response.text();
    const missing = missingLandingControls(html);
    return { url, target: local ? 'local' : 'hosted', status: response.status, checkedAt: new Date().toISOString(),
        sha256: createHash('sha256').update(html).digest('hex'), missing, passed: missing.length === 0 };
}
export function screenReaderAnswer(value) {
    const answer = String(value || '').trim();
    if (/^(skip|none)$/i.test(answer)) return { mode: 'automated' };
    if (!answer || /^(?:node|npm|npx|powershell|pwsh|cmd)(?:\s|$)/i.test(answer)
        || /gc04-live-check\.mjs/i.test(answer)) return { mode: 'invalid' };
    return { mode: 'manual', description: answer };
}
