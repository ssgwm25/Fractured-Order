import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

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

        build: {
            outDir: 'dist',
            emptyOutDir: true,
            sourcemap: mode !== 'production',
            rollupOptions: {
                input: {
                    main: resolve(__dirname, 'index.html'),
                    master: resolve(__dirname, 'master.html'),
                    whitecell: resolve(__dirname, 'whitecell.html'),
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
                    greenNotetaker: resolve(__dirname, 'teams/green/notetaker.html')
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
