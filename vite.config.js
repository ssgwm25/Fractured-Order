import { defineConfig, loadEnv } from 'vite';
import { createReadStream, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const START_HERE_REVIEW_PATH = 'onboarding/start-here/audio/';
const START_HERE_REVIEW_ROOT = resolve(__dirname, 'scripts/start-here-audio/work/review');
const START_HERE_REVIEW_ASSET = /^(?:clips\/[a-f0-9]{16}\.mp3|captions\/[a-f0-9]{16}\.en\.vtt)$/;

export function resolveStartHereReviewAsset(
    requestUrl = '',
    reviewRoot = START_HERE_REVIEW_ROOT,
    appBasePath = '/'
) {
    let pathname;
    try {
        pathname = decodeURIComponent(String(requestUrl).split('?')[0]);
    } catch (_error) {
        return null;
    }
    const reviewRoute = `${normalizeBasePath(appBasePath)}${START_HERE_REVIEW_PATH}`;
    if (!pathname.startsWith(reviewRoute)) return null;
    const relativePath = pathname.slice(reviewRoute.length);
    if (!START_HERE_REVIEW_ASSET.test(relativePath)) return null;
    const resolvedRoot = resolve(reviewRoot);
    const assetPath = resolve(resolvedRoot, relativePath);
    return assetPath.startsWith(`${resolvedRoot}${sep}`) ? assetPath : null;
}

function parseByteRange(value, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(value || '').trim());
    if (!match || (!match[1] && !match[2])) return null;
    let start;
    let end;
    if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
        start = Math.max(size - suffixLength, 0);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
        return null;
    }
    return { start, end: Math.min(end, size - 1) };
}

export function createStartHereAudioReviewPlugin({
    reviewRoot = START_HERE_REVIEW_ROOT,
    appBasePath = '/'
} = {}) {
    return {
        name: 'start-here-audio-review',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const assetPath = resolveStartHereReviewAsset(request.url, reviewRoot, appBasePath);
                if (!assetPath) return next();
                if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
                    response.statusCode = 405;
                    response.setHeader('Allow', 'GET, HEAD');
                    response.end();
                    return;
                }

                let stats;
                try {
                    stats = statSync(assetPath);
                } catch (_error) {
                    response.statusCode = 404;
                    response.end();
                    return;
                }
                if (!stats.isFile()) {
                    response.statusCode = 404;
                    response.end();
                    return;
                }

                response.setHeader('Accept-Ranges', 'bytes');
                response.setHeader('Cache-Control', 'no-store');
                response.setHeader('X-Content-Type-Options', 'nosniff');
                response.setHeader('Content-Type', assetPath.endsWith('.mp3') ? 'audio/mpeg' : 'text/vtt; charset=utf-8');
                const requestedRange = request.headers.range;
                const range = requestedRange ? parseByteRange(requestedRange, stats.size) : null;
                if (requestedRange && !range) {
                    response.statusCode = 416;
                    response.setHeader('Content-Range', `bytes */${stats.size}`);
                    response.end();
                    return;
                }

                const start = range?.start ?? 0;
                const end = range?.end ?? stats.size - 1;
                response.statusCode = range ? 206 : 200;
                response.setHeader('Content-Length', String(end - start + 1));
                if (range) response.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
                if (request.method === 'HEAD') {
                    response.end();
                    return;
                }
                const stream = createReadStream(assetPath, { start, end });
                stream.on('error', () => {
                    if (!response.headersSent) {
                        response.statusCode = 500;
                        response.end();
                        return;
                    }
                    response.destroy();
                });
                stream.pipe(response);
            });
        }
    };
}

function normalizeBasePath(basePath = '/') {
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

function resolveAppBasePath(env) {
    const explicitBasePath = env.VITE_PUBLIC_BASE_PATH || env.PUBLIC_BASE_PATH;

    if (explicitBasePath) {
        return normalizeBasePath(explicitBasePath);
    }

    const isGitHubActionsBuild = (env.GITHUB_ACTIONS || process.env.GITHUB_ACTIONS) === 'true';
    const repositorySlug = (env.GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY || '').split('/')[1];

    if (isGitHubActionsBuild && repositorySlug) {
        return normalizeBasePath(`/${repositorySlug}/`);
    }

    return '/';
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const appBasePath = resolveAppBasePath(env);

    return {
        appType: 'mpa',
        root: '.',
        base: appBasePath,
        publicDir: 'public',
        plugins: [createStartHereAudioReviewPlugin({ appBasePath })],

        build: {
            outDir: 'dist',
            emptyOutDir: true,
            sourcemap: mode !== 'production',
            rollupOptions: {
                input: {
                    main: resolve(__dirname, 'index.html'),
                    master: resolve(__dirname, 'master.html'),
                    whitecell: resolve(__dirname, 'whitecell.html'),
                    sme: resolve(__dirname, 'sme.html'),
                    plenary: resolve(__dirname, 'plenary.html'),
                    blueFacilitatorDeck: resolve(__dirname, 'decks/blue/fractured-order-facilitator-deck.html'),
                    blueFacilitator: resolve(__dirname, 'teams/blue/facilitator.html'),
                    blueScribe: resolve(__dirname, 'teams/blue/scribe.html'),
                    blueNotetaker: resolve(__dirname, 'teams/blue/notetaker.html'),
                    redFacilitatorDeck: resolve(__dirname, 'decks/red/fractured-order-facilitator-deck.html'),
                    redFacilitator: resolve(__dirname, 'teams/red/facilitator.html'),
                    redScribe: resolve(__dirname, 'teams/red/scribe.html'),
                    redNotetaker: resolve(__dirname, 'teams/red/notetaker.html'),
                    greenFacilitatorDeck: resolve(__dirname, 'decks/green/fractured-order-facilitator-deck.html'),
                    greenFacilitator: resolve(__dirname, 'teams/green/facilitator.html'),
                    greenScribe: resolve(__dirname, 'teams/green/scribe.html'),
                    greenNotetaker: resolve(__dirname, 'teams/green/notetaker.html'),
                    industryFacilitatorDeck: resolve(__dirname, 'decks/industry/fractured-order-facilitator-deck.html'),
                    industryFacilitator: resolve(__dirname, 'teams/industry/facilitator.html'),
                    industryScribe: resolve(__dirname, 'teams/industry/scribe.html'),
                    industryNotetaker: resolve(__dirname, 'teams/industry/notetaker.html')
                },
                output: {
                    manualChunks: {
                        supabase: ['@supabase/supabase-js']
                    }
                }
            }
        },

        server: {
            port: 3000,
            open: true,
            cors: true
        },

        preview: {
            port: 4173
        },

        resolve: {
            alias: {
                '@': resolve(__dirname, 'src'),
                '@core': resolve(__dirname, 'src/core'),
                '@services': resolve(__dirname, 'src/services'),
                '@stores': resolve(__dirname, 'src/stores'),
                '@features': resolve(__dirname, 'src/features'),
                '@components': resolve(__dirname, 'src/components'),
                '@utils': resolve(__dirname, 'src/utils'),
                '@styles': resolve(__dirname, 'styles')
            }
        },

        define: {
            __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
        }
    };
});
