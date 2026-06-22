const DEFAULT_APP_BASE_PATH = import.meta.env.BASE_URL || '/';
const APP_URL_ORIGIN = 'https://app.local';

export function normalizeBasePath(basePath = DEFAULT_APP_BASE_PATH) {
    const trimmedBasePath = String(basePath || '').trim();

    if (!trimmedBasePath || trimmedBasePath === '.' || trimmedBasePath === './') {
        return '/';
    }

    const withoutOrigin = trimmedBasePath.replace(/^[a-z]+:\/\/[^/]+/i, '');
    const withLeadingSlash = withoutOrigin.startsWith('/') ? withoutOrigin : `/${withoutOrigin}`;
    const withoutDuplicateSlashes = withLeadingSlash.replace(/\/{2,}/g, '/');

    return withoutDuplicateSlashes.endsWith('/')
        ? withoutDuplicateSlashes
        : `${withoutDuplicateSlashes}/`;
}

function normalizeRelativePath(relativePath = '') {
    return String(relativePath || '').replace(/^\/+/, '');
}

export function buildAppPath(relativePath = '', { basePath = DEFAULT_APP_BASE_PATH } = {}) {
    const normalizedBasePath = normalizeBasePath(basePath);
    const normalizedRelativePath = normalizeRelativePath(relativePath);
    const baseUrl = new URL(normalizedBasePath, APP_URL_ORIGIN);
    const routeUrl = new URL(normalizedRelativePath, baseUrl);

    return `${routeUrl.pathname}${routeUrl.search}${routeUrl.hash}`;
}

export function buildAppUrl(
    relativePath = '',
    {
        locationRef = typeof window !== 'undefined' ? window.location : null,
        basePath = DEFAULT_APP_BASE_PATH
    } = {}
) {
    const appPath = buildAppPath(relativePath, { basePath });

    if (!locationRef?.origin) {
        return appPath;
    }

    return new URL(appPath, locationRef.origin).toString();
}

export function navigateToApp(
    relativePath = '',
    {
        locationRef = typeof window !== 'undefined' ? window.location : null,
        basePath = DEFAULT_APP_BASE_PATH,
        replace = false
    } = {}
) {
    const targetUrl = buildAppUrl(relativePath, { locationRef, basePath });

    if (!locationRef) {
        return targetUrl;
    }

    if (replace && typeof locationRef.replace === 'function') {
        locationRef.replace(targetUrl);
        return targetUrl;
    }

    if (typeof locationRef.assign === 'function') {
        locationRef.assign(targetUrl);
        return targetUrl;
    }

    locationRef.href = targetUrl;
    return targetUrl;
}

export function getCurrentAppRelativePath(
    {
        locationRef = typeof window !== 'undefined' ? window.location : null,
        basePath = DEFAULT_APP_BASE_PATH
    } = {}
) {
    const pathname = locationRef?.pathname || '';
    const normalizedBasePath = normalizeBasePath(basePath);
    const normalizedBaseRoot = normalizedBasePath === '/' ? normalizedBasePath : normalizedBasePath.slice(0, -1);

    if (pathname === normalizedBaseRoot) {
        return '';
    }

    if (normalizedBasePath !== '/' && pathname.startsWith(normalizedBasePath)) {
        return pathname.slice(normalizedBasePath.length);
    }

    return pathname.replace(/^\/+/, '');
}

export function isLandingPage(options = {}) {
    const relativePath = getCurrentAppRelativePath(options);
    return relativePath === '' || relativePath === 'index.html';
}

export { DEFAULT_APP_BASE_PATH };
