import { describe, expect, it } from 'vitest';

import { mergeNotetakerRecord } from './database.js';

describe('mergeNotetakerRecord', () => {
    it('preserves existing participant entries when another notetaker saves the same move', () => {
        const existingRecord = {
            session_id: 'session-1',
            move: 2,
            phase: 1,
            team: 'blue',
            client_id: 'client-1',
            dynamics_analysis: {
                schema_version: 2,
                team_entries: {
                    blue: {
                        participant_entries: {
                            'seat-blue-1': {
                                participant_key: 'seat-blue-1',
                                participant_id: 'seat-blue-1',
                                client_id: 'client-1',
                                updated_at: '2026-04-06T10:55:00.000Z',
                                data: {
                                    emergingLeaders: 'Alex'
                                }
                            }
                        }
                    }
                }
            },
            external_factors: {
                schema_version: 2,
                team_entries: {
                    blue: {
                        participant_entries: {
                            'seat-blue-1': {
                                participant_key: 'seat-blue-1',
                                participant_id: 'seat-blue-1',
                                client_id: 'client-1',
                                updated_at: '2026-04-06T10:55:00.000Z',
                                data: {
                                    allianceNotes: 'Existing alliance note'
                                }
                            }
                        }
                    }
                }
            },
            observation_timeline: [
                {
                    id: 'obs-1',
                    team: 'blue',
                    participant_key: 'seat-blue-1',
                    type: 'NOTE',
                    content: 'Initial observation',
                    phase: 1,
                    timestamp: '2026-04-06T10:00:00.000Z'
                }
            ]
        };

        const mergedRecord = mergeNotetakerRecord(existingRecord, {
            session_id: 'session-1',
            move: 2,
            phase: 3,
            team: 'blue',
            client_id: 'client-2',
            participant_key: 'seat-blue-2',
            participant_id: 'seat-blue-2',
            dynamics_analysis: {
                emergingLeaders: 'Jordan',
                dynamicsSummary: 'New summary'
            }
        }, {
            clientId: 'client-fallback',
            timestamp: '2026-04-06T11:00:00.000Z'
        });

        expect(mergedRecord).toMatchObject({
            session_id: 'session-1',
            move: 2,
            phase: 3,
            team: 'blue',
            client_id: 'client-2',
            updated_at: '2026-04-06T11:00:00.000Z'
        });
        expect(mergedRecord.dynamics_analysis.team_entries.blue.participant_entries['seat-blue-1'].data).toEqual({
            emergingLeaders: 'Alex'
        });
        expect(mergedRecord.dynamics_analysis.team_entries.blue.participant_entries['seat-blue-2']).toMatchObject({
            participant_key: 'seat-blue-2',
            participant_id: 'seat-blue-2',
            client_id: 'client-2',
            data: {
                emergingLeaders: 'Jordan',
                dynamicsSummary: 'New summary'
            }
        });
        expect(mergedRecord.external_factors.team_entries.blue.participant_entries['seat-blue-1'].data).toEqual({
            allianceNotes: 'Existing alliance note'
        });
        expect(mergedRecord.observation_timeline).toEqual(existingRecord.observation_timeline);
    });

    it('appends observation_timeline entries with participant metadata instead of replacing prior observations', () => {
        const existingRecord = {
            session_id: 'session-1',
            move: 1,
            phase: 2,
            team: 'blue',
            client_id: 'client-1',
            dynamics_analysis: {
                schema_version: 2,
                team_entries: {}
            },
            external_factors: {
                schema_version: 2,
                team_entries: {}
            },
            observation_timeline: [
                {
                    id: 'obs-1',
                    team: 'blue',
                    participant_key: 'seat-blue-1',
                    type: 'NOTE',
                    content: 'Existing note',
                    phase: 2,
                    timestamp: '2026-04-06T10:00:00.000Z'
                }
            ]
        };

        const appendedRecord = mergeNotetakerRecord(existingRecord, {
            session_id: 'session-1',
            move: 1,
            team: 'blue',
            client_id: 'client-2',
            participant_key: 'seat-blue-2',
            participant_id: 'seat-blue-2',
            observation_timeline_append: [
                {
                    id: 'obs-2',
                    type: 'QUOTE',
                    content: 'New quote',
                    phase: 2,
                    timestamp: '2026-04-06T10:05:00.000Z'
                }
            ]
        }, {
            timestamp: '2026-04-06T10:05:00.000Z'
        });

        expect(appendedRecord.observation_timeline).toEqual([
            existingRecord.observation_timeline[0],
            {
                id: 'obs-2',
                team: 'blue',
                participant_key: 'seat-blue-2',
                participant_id: 'seat-blue-2',
                client_id: 'client-2',
                participant_label: null,
                type: 'QUOTE',
                content: 'New quote',
                phase: 2,
                timestamp: '2026-04-06T10:05:00.000Z'
            }
        ]);
        expect(appendedRecord.phase).toBe(2);
        expect(appendedRecord.team).toBe('blue');
    });
});
