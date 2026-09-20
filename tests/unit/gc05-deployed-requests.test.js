import { describe, expect, it, vi } from 'vitest';
import { createDeployedRequestGuard } from '../e2e/support/gc05DeployedRequests.js';

const backend = 'https://abcdefghijklmnopqrst.supabase.co';
const routeFor = (url, method = 'POST') => ({
    request: () => ({ url: () => url, method: () => method }),
    abort: vi.fn().mockResolvedValue(undefined), continue: vi.fn().mockResolvedValue(undefined)
});

describe('GC05 deployed request containment (no browser or network)', () => {
    it('aborts the configured identity bootstrap and retains a receipt without granting network access', async () => {
        const guard = createDeployedRequestGuard(backend);
        const route = routeFor(`${backend}/auth/v1/signup`);
        await guard.handle(route);
        expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
        expect(route.continue).not.toHaveBeenCalled();
        expect(guard.blocked).toEqual([{ origin: backend, path: '/auth/v1/signup', method: 'POST',
            expectedBootstrap: true, aborted: true }]);
        expect(() => guard.assertContained()).not.toThrow();
    });
    it.each([
        [`${backend}/rest/v1/rpc/submit_regional_orientation`, 'POST'],
        [`${backend}/rest/v1/actions`, 'GET'],
        [`${backend}/auth/v1/token`, 'POST'],
        [`${backend}/auth/v1/signup?unexpected=true`, 'POST'],
        [`${backend}/auth/v1/signup`, 'DELETE'],
        ['https://zyxwvutsrqponmlkjihg.supabase.co/auth/v1/signup', 'POST'],
        ['https://example.com/write', 'POST']
    ])('still fails on unexpected blocked traffic: %s %s', async (url, method) => {
        const guard = createDeployedRequestGuard(backend);
        await guard.handle(routeFor(`${backend}/auth/v1/signup`));
        const route = routeFor(url, method);
        await guard.handle(route);
        expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
        expect(route.continue).not.toHaveBeenCalled();
        expect(() => guard.assertContained()).toThrow('successfully aborted');
    });
    it('does not count a failed abort as containment', async () => {
        const guard = createDeployedRequestGuard(backend);
        const route = routeFor(`${backend}/auth/v1/signup`);
        route.abort.mockRejectedValue(new Error('abort failed'));
        await expect(guard.handle(route)).rejects.toThrow('abort failed');
        expect(guard.blocked[0].aborted).toBe(false);
        expect(() => guard.assertContained()).toThrow();
    });
    it('waits for the abort to settle before recording success', async () => {
        const guard = createDeployedRequestGuard(backend);
        const route = routeFor(`${backend}/auth/v1/signup`);
        let complete;
        route.abort.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        const pending = guard.handle(route);
        expect(guard.blocked).toEqual([]);
        complete();
        await guard.settled();
        await pending;
        expect(() => guard.assertContained()).not.toThrow();
    });
    it('allows static reads but cannot use them alone as bootstrap evidence', async () => {
        const guard = createDeployedRequestGuard(backend);
        const route = routeFor('https://example.com/assets/main.js', 'GET');
        await guard.handle(route);
        expect(route.continue).toHaveBeenCalledOnce();
        expect(route.abort).not.toHaveBeenCalled();
        expect(() => guard.assertContained()).toThrow();
    });
    it.each([undefined, 'https://example.com', `${backend}/auth/v1`, `${backend}?token=secret`])(
        'rejects missing or noncanonical backend configuration: %s', value => {
            expect(() => createDeployedRequestGuard(value)).toThrow('VITE_SUPABASE_URL');
        });
});
