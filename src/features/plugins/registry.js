import {
    mountWhiteCellIntercomPlugin,
    unmountWhiteCellIntercomPlugin
} from './intercom.js';
import {
    mountWhiteCellSessionRecorderPlugin,
    unmountWhiteCellSessionRecorderPlugin
} from './sessionRecorder.js';

/**
 * White Cell plugin registry.
 *
 * Plugin definitions stay explicit here so future operator capabilities can be
 * audited from a single list. A disabled plugin is never mounted by the White
 * Cell controller.
 */

export const WHITE_CELL_PLUGIN_IDS = Object.freeze({
    INTERCOM: 'intercom',
    SESSION_RECORDER: 'session-recorder'
});

export const SESSION_RECORDER_PLUGIN_RUNTIME_STATES = Object.freeze({
    IDLE: 'idle',
    RECORDING: 'recording',
    PAUSED: 'paused'
});

const SESSION_RECORDER_ACTIVE_STATES = new Set([
    SESSION_RECORDER_PLUGIN_RUNTIME_STATES.RECORDING,
    SESSION_RECORDER_PLUGIN_RUNTIME_STATES.PAUSED
]);

export const WHITE_CELL_PLUGIN_REGISTRY = Object.freeze([
    Object.freeze({
        id: WHITE_CELL_PLUGIN_IDS.INTERCOM,
        label: 'Intercom',
        description: 'Record and deliver live White Cell voice announcements to every team Scribe view.',
        capabilityTags: Object.freeze(['communications', 'operator-control']),
        mount: mountWhiteCellIntercomPlugin,
        unmount: unmountWhiteCellIntercomPlugin,
        isVisible: ({ enabled } = {}) => Boolean(enabled)
    }),
    Object.freeze({
        id: WHITE_CELL_PLUGIN_IDS.SESSION_RECORDER,
        label: 'Session Recorder',
        description: 'Record White Cell session audio for post-game review and research export references.',
        capabilityTags: Object.freeze(['recording', 'review']),
        mount: mountWhiteCellSessionRecorderPlugin,
        unmount: unmountWhiteCellSessionRecorderPlugin,
        isVisible: ({ enabled } = {}) => Boolean(enabled)
    })
]);

export function getRegisteredPlugins() {
    return WHITE_CELL_PLUGIN_REGISTRY;
}

export function getPluginDefinition(pluginId) {
    return WHITE_CELL_PLUGIN_REGISTRY.find((plugin) => plugin.id === pluginId) || null;
}

export function buildDefaultPluginState(registry = WHITE_CELL_PLUGIN_REGISTRY) {
    return Object.fromEntries(
        registry.map((plugin) => [
            plugin.id,
            { enabled: false }
        ])
    );
}

function normalizeTimestamp(value) {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }

    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime())
        ? null
        : timestamp.toISOString();
}

function normalizeShortString(value, maxLength = 120) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeSessionRecorderPluginState(rawPluginState = {}) {
    const enabled = Boolean(rawPluginState?.enabled);
    const normalizedState = { enabled };

    if (!enabled) {
        return normalizedState;
    }

    const recordingStatus = normalizeShortString(rawPluginState.recording_status, 32);
    if (!SESSION_RECORDER_ACTIVE_STATES.has(recordingStatus)) {
        return normalizedState;
    }

    normalizedState.recording_status = recordingStatus;
    const recordingId = normalizeShortString(rawPluginState.recording_id, 160);
    const startedAtUtc = normalizeTimestamp(rawPluginState.recording_started_at_utc);
    const updatedAtUtc = normalizeTimestamp(rawPluginState.recording_updated_at_utc);
    const operatorRole = normalizeShortString(rawPluginState.recording_operator_role, 80);
    const operatorLabel = normalizeShortString(rawPluginState.recording_operator_label, 120);

    if (recordingId) normalizedState.recording_id = recordingId;
    if (startedAtUtc) normalizedState.recording_started_at_utc = startedAtUtc;
    if (updatedAtUtc) normalizedState.recording_updated_at_utc = updatedAtUtc;
    if (operatorRole) normalizedState.recording_operator_role = operatorRole;
    if (operatorLabel) normalizedState.recording_operator_label = operatorLabel;

    return normalizedState;
}

function normalizeRegisteredPluginEntry(plugin, rawState = {}) {
    if (plugin.id === WHITE_CELL_PLUGIN_IDS.SESSION_RECORDER) {
        return normalizeSessionRecorderPluginState(rawState);
    }

    return {
        enabled: Boolean(rawState?.enabled)
    };
}

export function normalizePluginState(pluginState = {}, registry = WHITE_CELL_PLUGIN_REGISTRY) {
    const rawState = pluginState && typeof pluginState === 'object' && !Array.isArray(pluginState)
        ? pluginState
        : {};

    return Object.fromEntries(
        registry.map((plugin) => [
            plugin.id,
            normalizeRegisteredPluginEntry(plugin, rawState[plugin.id])
        ])
    );
}

export function isPluginEnabled(pluginState, pluginId) {
    return Boolean(normalizePluginState(pluginState)[pluginId]?.enabled);
}

export function setPluginEnabledInState(pluginState, pluginId, enabled) {
    if (!getPluginDefinition(pluginId)) {
        return normalizePluginState(pluginState);
    }

    const normalizedState = normalizePluginState(pluginState);
    const previousEntry = normalizedState[pluginId] || {};
    const nextEntry = enabled
        ? { ...previousEntry, enabled: true }
        : { enabled: false };

    return normalizePluginState({
        ...normalizedState,
        [pluginId]: nextEntry
    });
}

export function setSessionRecorderRuntimeStateInPluginState(pluginState, runtimeState = {}) {
    const normalizedState = normalizePluginState(pluginState);
    const previousEntry = normalizedState[WHITE_CELL_PLUGIN_IDS.SESSION_RECORDER] || { enabled: false };

    if (!previousEntry.enabled) {
        return normalizedState;
    }

    const requestedStatus = normalizeShortString(runtimeState.recording_status, 32)
        || SESSION_RECORDER_PLUGIN_RUNTIME_STATES.IDLE;
    const nextEntry = SESSION_RECORDER_ACTIVE_STATES.has(requestedStatus)
        ? {
            ...previousEntry,
            recording_status: requestedStatus,
            recording_id: runtimeState.recording_id,
            recording_started_at_utc: runtimeState.recording_started_at_utc,
            recording_updated_at_utc: runtimeState.recording_updated_at_utc,
            recording_operator_role: runtimeState.recording_operator_role,
            recording_operator_label: runtimeState.recording_operator_label
        }
        : { enabled: true };

    return normalizePluginState({
        ...normalizePluginState(pluginState),
        [WHITE_CELL_PLUGIN_IDS.SESSION_RECORDER]: nextEntry
    });
}

export function getSessionRecorderRuntimeState(pluginState = {}) {
    return normalizePluginState(pluginState)[WHITE_CELL_PLUGIN_IDS.SESSION_RECORDER] || { enabled: false };
}

export function isSessionRecorderNoticeActive(pluginState = {}) {
    const recorderState = getSessionRecorderRuntimeState(pluginState);
    return Boolean(
        recorderState.enabled
        && SESSION_RECORDER_ACTIVE_STATES.has(recorderState.recording_status)
    );
}

export function isPluginVisible(plugin, pluginState, context = {}) {
    const normalizedState = normalizePluginState(pluginState);
    const enabled = Boolean(normalizedState[plugin.id]?.enabled);

    if (!enabled) {
        return false;
    }

    if (typeof plugin.isVisible !== 'function') {
        return true;
    }

    return Boolean(plugin.isVisible({
        ...context,
        enabled,
        pluginState: normalizedState[plugin.id]
    }));
}
