export const DEFAULT_LOCAL_APP_BASE_URL = 'http://127.0.0.1:4174/';
export const OPERATOR_AUTH_FAILURE_PATTERN = /invalid operator access code|failed to authorize operator access|authorization is required/i;

export function isHostedRehearsal(baseUrl) {
    return Boolean(String(baseUrl || '').trim());
}

export function getConfiguredAppBaseUrl(baseUrl = process.env.PLAYWRIGHT_BASE_URL || DEFAULT_LOCAL_APP_BASE_URL) {
    return new URL('./', baseUrl).toString();
}

export function buildAppUrl(relativePath = '', baseUrl = process.env.PLAYWRIGHT_BASE_URL || DEFAULT_LOCAL_APP_BASE_URL) {
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
