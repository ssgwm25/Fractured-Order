/**
 * Session-experience plugins are selected by protected server metadata.
 * They are intentionally separate from mutable White Cell plugin state.
 */

export const TRAINING_EXPERIENCE_PLUGIN_ID = 'ssg-training';

export const SESSION_EXPERIENCE_PLUGIN_REGISTRY = Object.freeze([
    Object.freeze({
        id: TRAINING_EXPERIENCE_PLUGIN_ID,
        sessionClassification: 'training_template',
        requiresProtectedSession: true
    })
]);

export function getSessionExperiencePlugin(pluginId) {
    return SESSION_EXPERIENCE_PLUGIN_REGISTRY.find((plugin) => plugin.id === pluginId) || null;
}

export function resolveSessionExperiencePlugin(bootstrap = {}) {
    const plugin = getSessionExperiencePlugin(bootstrap?.experience_plugin_id);

    if (!plugin) {
        return null;
    }

    if (
        bootstrap.session_classification !== plugin.sessionClassification
        || bootstrap.is_protected !== plugin.requiresProtectedSession
    ) {
        return null;
    }

    return plugin;
}

export function isTrainingExperienceBootstrap(bootstrap = {}) {
    return resolveSessionExperiencePlugin(bootstrap)?.id === TRAINING_EXPERIENCE_PLUGIN_ID;
}
