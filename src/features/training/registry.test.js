import { describe, expect, it } from 'vitest';

import {
    SESSION_EXPERIENCE_PLUGIN_REGISTRY,
    TRAINING_EXPERIENCE_PLUGIN_ID,
    isTrainingExperienceBootstrap,
    resolveSessionExperiencePlugin
} from './registry.js';
import { getPluginDefinition } from '../plugins/registry.js';

describe('training session-experience registry', () => {
    it('locks one training plugin outside mutable White Cell plugin state', () => {
        expect(SESSION_EXPERIENCE_PLUGIN_REGISTRY).toHaveLength(1);
        expect(SESSION_EXPERIENCE_PLUGIN_REGISTRY[0]).toEqual({
            id: TRAINING_EXPERIENCE_PLUGIN_ID,
            sessionClassification: 'training_template',
            requiresProtectedSession: true
        });
        expect(Object.isFrozen(SESSION_EXPERIENCE_PLUGIN_REGISTRY)).toBe(true);
        expect(getPluginDefinition(TRAINING_EXPERIENCE_PLUGIN_ID)).toBeNull();
    });

    it('activates only from complete protected server metadata', () => {
        const bootstrap = {
            experience_plugin_id: 'ssg-training',
            session_classification: 'training_template',
            is_protected: true
        };

        expect(resolveSessionExperiencePlugin(bootstrap)?.id).toBe('ssg-training');
        expect(isTrainingExperienceBootstrap(bootstrap)).toBe(true);
        expect(isTrainingExperienceBootstrap({ ...bootstrap, is_protected: false })).toBe(false);
        expect(isTrainingExperienceBootstrap({ ...bootstrap, session_classification: 'live_exercise' })).toBe(false);
        expect(isTrainingExperienceBootstrap({ training_mode: true })).toBe(false);
    });
});
