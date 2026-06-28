import { describe, expect, it } from 'vitest';

import {
    WHITE_CELL_PLUGIN_IDS,
    buildDefaultPluginState,
    getPluginDefinition,
    getRegisteredPlugins,
    getSessionRecorderRuntimeState,
    isSessionRecorderNoticeActive,
    isPluginEnabled,
    isPluginVisible,
    normalizePluginState,
    setPluginEnabledInState,
    setSessionRecorderRuntimeStateInPluginState
} from './registry.js';

describe('White Cell plugin registry', () => {
    it('registers the initial White Cell plugins explicitly', () => {
        expect(getRegisteredPlugins().map((plugin) => plugin.id)).toEqual([
            WHITE_CELL_PLUGIN_IDS.INTERCOM,
            WHITE_CELL_PLUGIN_IDS.SESSION_RECORDER
        ]);
        expect(getPluginDefinition(WHITE_CELL_PLUGIN_IDS.INTERCOM)).toMatchObject({
            label: 'Intercom',
            capabilityTags: ['communications', 'operator-control']
        });
        expect(getPluginDefinition(WHITE_CELL_PLUGIN_IDS.SESSION_RECORDER)).toMatchObject({
            label: 'Session Recorder',
            capabilityTags: ['recording', 'review']
        });
    });

    it('defaults every registered plugin to disabled and ignores unregistered keys', () => {
        expect(buildDefaultPluginState()).toEqual({
            [WHITE_CELL_PLUGIN_IDS.INTERCOM]: { enabled: false },
            [WHITE_CELL_PLUGIN_IDS.SESSION_RECORDER]: { enabled: false }
        });

        expect(normalizePluginState({
            [WHITE_CELL_PLUGIN_IDS.INTERCOM]: { enabled: true },
            unexpected: { enabled: true }
        })).toEqual({
            [WHITE_CELL_PLUGIN_IDS.INTERCOM]: { enabled: true },
            [WHITE_CELL_PLUGIN_IDS.SESSION_RECORDER]: { enabled: false }
        });
    });

    it('requires enabled state before a plugin is visible or mountable', () => {
        const intercom = getPluginDefinition(WHITE_CELL_PLUGIN_IDS.INTERCOM);
        const disabledState = buildDefaultPluginState();
        const enabledState = setPluginEnabledInState(disabledState, WHITE_CELL_PLUGIN_IDS.INTERCOM, true);

        expect(isPluginEnabled(disabledState, WHITE_CELL_PLUGIN_IDS.INTERCOM)).toBe(false);
        expect(isPluginVisible(intercom, disabledState)).toBe(false);
        expect(isPluginEnabled(enabledState, WHITE_CELL_PLUGIN_IDS.INTERCOM)).toBe(true);
        expect(isPluginVisible(intercom, enabledState)).toBe(true);
    });

    it('preserves bounded Session Recorder runtime state only while enabled and active', () => {
        const enabledState = setPluginEnabledInState(
            buildDefaultPluginState(),
            WHITE_CELL_PLUGIN_IDS.SESSION_RECORDER,
            true
        );
        const recordingState = setSessionRecorderRuntimeStateInPluginState(enabledState, {
            recording_status: 'recording',
            recording_id: 'recording-1',
            recording_started_at_utc: '2026-06-03T10:04:00.000Z',
            recording_updated_at_utc: '2026-06-03T10:05:00.000Z',
            recording_operator_role: 'whitecell',
            recording_operator_label: 'White Cell Lead',
            ignored_unbounded_payload: 'not persisted'
        });

        expect(getSessionRecorderRuntimeState(recordingState)).toEqual({
            enabled: true,
            recording_status: 'recording',
            recording_id: 'recording-1',
            recording_started_at_utc: '2026-06-03T10:04:00.000Z',
            recording_updated_at_utc: '2026-06-03T10:05:00.000Z',
            recording_operator_role: 'whitecell',
            recording_operator_label: 'White Cell Lead'
        });
        expect(isSessionRecorderNoticeActive(recordingState)).toBe(true);

        const disabledState = setPluginEnabledInState(
            recordingState,
            WHITE_CELL_PLUGIN_IDS.SESSION_RECORDER,
            false
        );

        expect(getSessionRecorderRuntimeState(disabledState)).toEqual({ enabled: false });
        expect(isSessionRecorderNoticeActive(disabledState)).toBe(false);
    });
});
