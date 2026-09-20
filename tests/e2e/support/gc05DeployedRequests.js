import { readOnlyRequestAllowed } from '../../../scripts/gc05-evidence-contract.mjs';

// Recognizing the landing bootstrap is an evidence classification, never a
// network permission. Every backend request still receives route.abort().
export function createDeployedRequestGuard(backendURL) {
    if (!/^https:\/\/[a-z]{20}\.supabase\.co\/?$/.test(backendURL || '')) {
        throw new Error('Deployed checks require the production VITE_SUPABASE_URL.');
    }
    const origin = new URL(backendURL).origin;
    const blocked = [], pending = new Set();
    const handle = route => {
        const work = (async () => {
            const request = route.request();
            const url = new URL(request.url());
            if (readOnlyRequestAllowed(url.href, request.method())) return route.continue();
            const receipt = {
                origin: url.origin, path: url.pathname, method: request.method(),
                expectedBootstrap: url.origin === origin && url.pathname === '/auth/v1/signup'
                    && !url.search && !url.hash && !url.username && !url.password
                    && request.method() === 'POST',
                aborted: false
            };
            try {
                await route.abort('blockedbyclient');
                receipt.aborted = true;
            } finally {
                blocked.push(receipt);
            }
        })();
        pending.add(work);
        work.catch(() => {}).finally(() => pending.delete(work));
        return work;
    };
    return {
        blocked, handle,
        async settled() { await Promise.all([...pending]); },
        assertContained() {
            if (!blocked.length || blocked.some(item => !item.expectedBootstrap || !item.aborted)) {
                throw new Error('Expected only successfully aborted anonymous identity bootstrap requests.');
            }
        }
    };
}
