import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.js';

export const NON_PLI_TEST_EXCLUDES = Object.freeze([
    ...configDefaults.exclude,
    'src/features/pli/**',
    'src/roles/sme.test.js',
    'src/roles/whitecell.pli.test.js',
    'src/services/database.*pli*.test.js',
    'tests/unit/role-capability-matrix.test.js'
]);

export default defineConfig(async (environment) => mergeConfig(
    await viteConfig(environment),
    defineConfig({
        test: {
            exclude: [...NON_PLI_TEST_EXCLUDES]
        }
    })
));
