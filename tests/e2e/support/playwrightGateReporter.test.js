import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import { buildPlaywrightSummaryMarkdown } from '../../../scripts/write-playwright-summary.mjs';
import {
    createBrowserDiagnosticsObserver,
    expectBrowserConsoleError,
    formatBrowserDiagnosticFailure
} from './browserDiagnostics.js';
import { buildGateSummary } from './playwrightGateReporter.js';

function buildTestRecord(overrides = {}) {
    return {
        actorCount: 1,
        sessionCount: 1,
        retries: 0,
        status: 'passed',
        browserErrorCount: 0,
        diagnosticNames: ['browser-diagnostics.json'],
        ...overrides
    };
}

describe('Playwright deterministic gate reporting', () => {
    it('fails skipped tests and protected-branch retry-to-success results', () => {
        const tests = new Map([
            ['passed-after-retry', buildTestRecord({ actorCount: 18, retries: 1 })],
            ['skipped', buildTestRecord({ actorCount: 0, status: 'skipped' })]
        ]);

        const summary = buildGateSummary({
            gateName: 'rehearsal',
            protectedBranch: true,
            ciArtifactName: 'playwright-rehearsal-sha',
            tests,
            runStatus: 'passed'
        });

        expect(summary).toMatchObject({
            status: 'failed',
            actorCount: 18,
            sessionCount: 2,
            retryCount: 1,
            skippedCount: 1,
            retriedToSuccessCount: 1
        });
        expect(summary.violations).toEqual([
            '1 test(s) were skipped',
            '1 test(s) retried to success on a protected branch'
        ]);
    });

    it('records console and page errors from every observed browser page', () => {
        const observer = createBrowserDiagnosticsObserver();
        const page = new EventEmitter();
        page.url = () => 'http://127.0.0.1:4174/master.html';
        observer.observePage(page);

        page.emit('console', {
            type: () => 'error',
            text: () => 'unexpected console failure',
            location: () => ({ url: page.url(), lineNumber: 3, columnNumber: 2 })
        });
        page.emit('pageerror', new Error('uncaught page failure'));

        expect(observer.diagnostics.consoleErrors).toHaveLength(1);
        expect(observer.diagnostics.pageErrors).toHaveLength(1);
        expect(observer.diagnostics.pageErrors[0]).toMatchObject({
            message: 'uncaught page failure',
            url: 'http://127.0.0.1:4174/master.html'
        });
        expect(formatBrowserDiagnosticFailure(observer.diagnostics)).toContain(
            'pageerror http://127.0.0.1:4174/master.html: uncaught page failure'
        );
        expect(formatBrowserDiagnosticFailure(observer.diagnostics)).toContain(
            'console http://127.0.0.1:4174/master.html: unexpected console failure'
        );
    });

    it('separates a bounded, explicitly expected console error from gate failures', () => {
        const observer = createBrowserDiagnosticsObserver();
        const page = new EventEmitter();
        page.url = () => 'http://127.0.0.1:4174/index.html';
        observer.observePage(page);
        expectBrowserConsoleError(page, /requested role is full/i);

        const emitConsoleError = (text) => page.emit('console', {
            type: () => 'error',
            text: () => text,
            location: () => ({ url: page.url(), lineNumber: 1, columnNumber: 1 })
        });
        emitConsoleError('The requested role is full. Please choose another seat.');
        emitConsoleError('The requested role is full. Please choose another seat.');

        expect(observer.diagnostics.expectedConsoleErrors).toHaveLength(1);
        expect(observer.diagnostics.consoleErrors).toHaveLength(1);
        expect(formatBrowserDiagnosticFailure(observer.diagnostics)).toContain(
            '1 console error(s), 0 page error(s)'
        );
    });

    it('renders the required counts and artifact names in the GitHub summary', () => {
        const markdown = buildPlaywrightSummaryMarkdown({
            gateName: 'smoke',
            actorCount: 1,
            sessionCount: 1,
            retryCount: 0,
            skippedCount: 0,
            browserErrorCount: 0,
            ciArtifactName: 'playwright-smoke-sha',
            diagnosticArtifactNames: ['browser-diagnostics.json', 'playwright-gate-summary.json'],
            status: 'passed',
            violations: []
        });

        expect(markdown).toContain('| Actor count | 1 |');
        expect(markdown).toContain('| Session count | 1 |');
        expect(markdown).toContain('| Test retries | 0 |');
        expect(markdown).toContain('`browser-diagnostics.json`');
        expect(markdown).toContain('`playwright-smoke-sha`');
    });
});
