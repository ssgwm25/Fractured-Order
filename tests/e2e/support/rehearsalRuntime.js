export const DEFAULT_LOCAL_APP_BASE_URL = 'http://127.0.0.1:4174/';
export const APP_NAVIGATION_OPTIONS = Object.freeze({
    waitUntil: 'domcontentloaded',
    timeout: 60000
});
export const OPERATOR_AUTH_TIMEOUT_MS = 60000;
export const OPERATOR_AUTH_FAILURE_PATTERN = /invalid operator access code|failed to authorize operator access|authorization is required/i;

export async function attemptOpenGameMasterCreateSession({
    isCreateFormReady,
    isSessionsSectionVisible,
    clickSessions,
    clickCreate
} = {}) {
    if (await isCreateFormReady()) {
        return true;
    }

    if (!(await isSessionsSectionVisible())) {
        try {
            await clickSessions();
        } catch {
            return false;
        }

        if (!(await isSessionsSectionVisible())) {
            return false;
        }
    }

    try {
        await clickCreate();
    } catch {
        return false;
    }

    return isCreateFormReady();
}

export function isHostedRehearsal(baseUrl) {
    return Boolean(String(baseUrl || '').trim());
}

function getLocalAppBaseUrl() {
    // A local project subpath is navigation context, not a hosted-run flag.
    // Assign pathname so even malformed input cannot change the loopback origin.
    const url = new URL(DEFAULT_LOCAL_APP_BASE_URL);
    const basePath = process.env.VITE_PUBLIC_BASE_PATH || '/';
    url.pathname = basePath.endsWith('/') ? basePath : `${basePath}/`;
    return url.toString();
}

export function getConfiguredAppBaseUrl(baseUrl = process.env.PLAYWRIGHT_BASE_URL || getLocalAppBaseUrl()) {
    return new URL('./', baseUrl).toString();
}

export function buildAppUrl(relativePath = '', baseUrl = process.env.PLAYWRIGHT_BASE_URL || getLocalAppBaseUrl()) {
    return new URL(relativePath || '.', getConfiguredAppBaseUrl(baseUrl)).toString();
}

export function getHostedOperatorAccessCode({
    baseUrl = process.env.PLAYWRIGHT_BASE_URL,
    operatorAccessCode = process.env.PLAYWRIGHT_OPERATOR_ACCESS_CODE
} = {}) {
    return isHostedRehearsal(baseUrl)
        ? String(operatorAccessCode || '').trim()
        : '';
}

export function resolveOperatorAccessCode(localOperatorAccessCode, options = {}) {
    return getHostedOperatorAccessCode(options) || localOperatorAccessCode;
}

export function classifyOperatorAuthorizationProgress({
    currentUrl = '',
    urlPattern,
    toastText = ''
} = {}) {
    if (urlPattern?.test?.(currentUrl)) {
        return {
            status: 'success',
            currentUrl
        };
    }

    const normalizedToastText = String(toastText || '').trim();
    if (normalizedToastText && OPERATOR_AUTH_FAILURE_PATTERN.test(normalizedToastText)) {
        return {
            status: 'failure',
            currentUrl,
            toastText: normalizedToastText
        };
    }

    return {
        status: 'pending',
        currentUrl,
        toastText: normalizedToastText
    };
}
