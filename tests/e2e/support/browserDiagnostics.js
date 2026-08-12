function serializeConsoleMessage(message) {
    return {
        type: message.type(),
        text: message.text(),
        location: message.location()
    };
}

function serializePageError(error, page) {
    return {
        message: error.message,
        stack: error.stack || null,
        url: page.url()
    };
}

const expectedConsoleErrorsByPage = new WeakMap();

function consumeExpectedConsoleError(page, text) {
    const expectations = expectedConsoleErrorsByPage.get(page) || [];
    const expectationIndex = expectations.findIndex(({ matcher }) => {
        if (matcher instanceof RegExp) {
            matcher.lastIndex = 0;
            return matcher.test(text);
        }
        return text.includes(matcher);
    });

    if (expectationIndex === -1) {
        return false;
    }

    expectations.splice(expectationIndex, 1);
    return true;
}

export function expectBrowserConsoleError(page, matcher, count = 1) {
    if (!(typeof matcher === 'string' || matcher instanceof RegExp)) {
        throw new TypeError('Expected console error matcher must be a string or RegExp.');
    }
    if (!Number.isInteger(count) || count < 1) {
        throw new TypeError('Expected console error count must be a positive integer.');
    }

    const expectations = expectedConsoleErrorsByPage.get(page) || [];
    for (let index = 0; index < count; index += 1) {
        expectations.push({ matcher });
    }
    expectedConsoleErrorsByPage.set(page, expectations);
}

export function createBrowserDiagnosticsObserver() {
    const observedPages = new WeakSet();
    const observedContexts = new WeakSet();
    const diagnostics = {
        consoleErrors: [],
        expectedConsoleErrors: [],
        pageErrors: []
    };

    const observePage = (page) => {
        if (observedPages.has(page)) {
            return;
        }
        observedPages.add(page);
        page.on('console', (message) => {
            if (message.type() === 'error') {
                const serializedMessage = serializeConsoleMessage(message);
                if (consumeExpectedConsoleError(page, serializedMessage.text)) {
                    diagnostics.expectedConsoleErrors.push(serializedMessage);
                } else {
                    diagnostics.consoleErrors.push(serializedMessage);
                }
            }
        });
        page.on('pageerror', (error) => {
            diagnostics.pageErrors.push(serializePageError(error, page));
        });
    };

    const observeContext = (context) => {
        if (observedContexts.has(context)) {
            return context;
        }
        observedContexts.add(context);
        context.pages().forEach(observePage);
        context.on('page', observePage);
        return context;
    };

    return { diagnostics, observeContext, observePage };
}

export function formatBrowserDiagnosticFailure(diagnostics, limit = 5) {
    const consoleErrors = diagnostics.consoleErrors || [];
    const pageErrors = diagnostics.pageErrors || [];
    const samples = [
        ...pageErrors.map((error) => `pageerror ${error.url || '(unknown URL)'}: ${error.message}`),
        ...consoleErrors.map((error) => {
            const location = error.location?.url || '(unknown URL)';
            return `console ${location}: ${error.text}`;
        })
    ].slice(0, limit);
    const summary = `Unexpected browser diagnostics: ${consoleErrors.length} console error(s), ` +
        `${pageErrors.length} page error(s).`;

    return samples.length > 0
        ? `${summary}\n${samples.map((sample) => `- ${sample}`).join('\n')}`
        : summary;
}
