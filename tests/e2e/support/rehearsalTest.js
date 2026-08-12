import { writeFileSync } from 'node:fs';

import { expect, test as base } from '@playwright/test';

import {
    createBrowserDiagnosticsObserver,
    formatBrowserDiagnosticFailure
} from './browserDiagnostics.js';

const ACTOR_ANNOTATION = 'rehearsal-actors';
const SESSION_ANNOTATION = 'rehearsal-sessions';

export function recordRehearsalMetrics(testInfo, { actorCount, sessionCount }) {
    for (const [type, value] of [
        [ACTOR_ANNOTATION, actorCount],
        [SESSION_ANNOTATION, sessionCount]
    ]) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`${type} must be a non-negative integer.`);
        }
        testInfo.annotations.push({ type, description: String(value) });
    }
}

function wrapBrowser(browser, observer) {
    return new Proxy(browser, {
        get(target, property) {
            if (property === 'newContext') {
                return async (...args) => observer.observeContext(await target.newContext(...args));
            }
            if (property === 'newPage') {
                return async (...args) => {
                    const page = await target.newPage(...args);
                    observer.observePage(page);
                    return page;
                };
            }

            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
}

export const test = base.extend({
    rehearsalBrowser: async ({ browser }, use, testInfo) => {
        const observer = createBrowserDiagnosticsObserver();
        await use(wrapBrowser(browser, observer));

        const diagnostics = observer.diagnostics;
        const diagnosticsPath = testInfo.outputPath('browser-diagnostics.json');
        writeFileSync(diagnosticsPath, `${JSON.stringify(diagnostics, null, 2)}\n`, 'utf8');
        await testInfo.attach('browser-diagnostics.json', {
            path: diagnosticsPath,
            contentType: 'application/json'
        });

        const errorCount = diagnostics.consoleErrors.length + diagnostics.pageErrors.length;
        if (errorCount > 0) {
            throw new Error(formatBrowserDiagnosticFailure(diagnostics));
        }
    }
});

export { ACTOR_ANNOTATION, expect, SESSION_ANNOTATION };
