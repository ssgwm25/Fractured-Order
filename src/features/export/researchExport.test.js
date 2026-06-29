import { describe, expect, it } from 'vitest';

import { serializeBlueActionDetails } from '../actions/blueActionDetails.js';
import { serializeMoveResponseDetails } from '../actions/moveResponseDetails.js';
import { serializeProposalDetails } from '../actions/proposalDetails.js';
import {
    RESEARCH_EXPORT_FORMAT_REVISION,
    RESEARCH_EXPORT_SCHEMA_VERSION,
    buildCrossSessionResearchExportBundle,
    buildResearchExportBundle,
    buildResearchReportHtml,
    createResearchExportArchiveBlob
} from './researchExport.js';

function buildBundleFixture() {
    return {
        session: {
            id: 'session-research-1',
            name: 'Research Session Alpha',
            status: 'active',
            metadata: {
                session_code: 'ALPHA-R',
                description: 'Testing the richer research export report output.'
            },
            created_at: '2026-06-03T10:00:00.000Z',
            updated_at: '2026-06-03T10:20:00.000Z'
        },
        gameState: {
            move: 3,
            phase: 2,
            timer_seconds: 5400,
            timer_running: false
        },
        participants: [
            {
                id: 'seat-blue-1',
                client_id: 'client-blue-1',
                role: 'blue_facilitator',
                display_name: 'Blue Lead',
                joined_at: '2026-06-03T10:00:00.000Z',
                heartbeat_at: '2026-06-03T10:20:00.000Z',
                is_active: true
            },
            {
                id: 'seat-green-1',
                client_id: 'client-green-1',
                role: 'green_facilitator',
                display_name: 'Green Lead',
                joined_at: '2026-06-03T10:01:00.000Z',
                heartbeat_at: '2026-06-03T10:18:00.000Z',
                is_active: true
            },
            {
                id: 'seat-red-1',
                client_id: 'client-red-1',
                role: 'red_facilitator',
                display_name: 'Red Lead',
                joined_at: '2026-06-03T10:02:00.000Z',
                disconnected_at: '2026-06-03T10:19:00.000Z',
                heartbeat_at: '2026-06-03T10:16:00.000Z',
                is_active: false
            }
        ],
        actions: [
            {
                id: 'action-blue-1',
                session_id: 'session-research-1',
                client_id: 'client-blue-1',
                team: 'blue',
                move: 2,
                phase: 2,
                mechanism: 'Economic',
                sector: 'Biotechnology',
                exposure_type: 'Advanced Manufacturing',
                targets: ['EU', 'Japan'],
                goal: 'Blue export coordination',
                expected_outcomes: 'Tighten partner alignment',
                ally_contingencies: serializeBlueActionDetails({
                    objective: 'Coordinate export posture',
                    levers: ['Export Controls', 'Sanctions'],
                    sectors: ['Biotechnology', 'Agriculture'],
                    implementation: 'Executive Order',
                    enforcementTimeline: '6 months',
                    coordinated: ['Executive'],
                    informed: ['Allied']
                }),
                status: 'adjudicated',
                outcome: 'permitted_with_constraint',
                adjudication_notes: 'Proceed with reporting safeguards.',
                created_at: '2026-06-03T10:05:00.000Z',
                submitted_at: '2026-06-03T10:08:00.000Z',
                adjudicated_at: '2026-06-03T10:12:00.000Z',
                adjudication: {
                    reporting_window: '48h'
                }
            },
            {
                id: 'proposal-green-1',
                session_id: 'session-research-1',
                client_id: 'client-green-1',
                team: 'green',
                move: 2,
                phase: 2,
                mechanism: 'Proposal',
                sector: 'Agriculture',
                goal: 'Green coalition proposal',
                expected_outcomes: 'Blue backing for a joint line',
                ally_contingencies: serializeProposalDetails({
                    originators: ['EU'],
                    objective: 'Seek joint messaging',
                    category: 'Alignment',
                    intendedPartners: 'Blue Team',
                    delivery: 'Joint Statement',
                    timingAndConditions: 'Before next move',
                    recipientTeam: 'blue'
                }),
                status: 'adjudicated',
                outcome: 'forwarded',
                adjudication_notes: 'Forward after clarity edits.',
                created_at: '2026-06-03T10:06:00.000Z',
                submitted_at: '2026-06-03T10:09:00.000Z',
                adjudicated_at: '2026-06-03T10:11:00.000Z'
            },
            {
                id: 'move-response-red-1',
                session_id: 'session-research-1',
                client_id: 'client-red-1',
                team: 'red',
                move: 2,
                phase: 2,
                mechanism: 'Move Response',
                goal: 'Red shipping response',
                expected_outcomes: 'Preserve routing options',
                ally_contingencies: serializeMoveResponseDetails({
                    strategicAssessment: 'Blue is testing route resilience.',
                    responseStrategy: 'Hold',
                    keyActions: 'Shift freight prioritization.',
                    targetsAndPressurePoints: 'Port sequencing',
                    deliveryChannel: 'Private logistics channel'
                }),
                status: 'submitted',
                created_at: '2026-06-03T10:10:00.000Z',
                submitted_at: '2026-06-03T10:13:00.000Z'
            }
        ],
        requests: [
            {
                id: 'rfi-1',
                session_id: 'session-research-1',
                client_id: 'client-blue-1',
                team: 'blue',
                move: 2,
                phase: 2,
                query: 'What is the latest White Cell guidance?',
                status: 'answered',
                response: 'Maintain the current line for one more move.',
                created_at: '2026-06-03T10:07:00.000Z',
                responded_at: '2026-06-03T10:14:00.000Z'
            }
        ],
        communications: [
            {
                id: 'comm-forwarded-1',
                session_id: 'session-research-1',
                move: 2,
                phase: 2,
                from_role: 'white_cell',
                to_role: 'blue',
                type: 'PROPOSAL_FORWARDED',
                content: 'Forwarded Green Team proposal.',
                created_at: '2026-06-03T10:11:30.000Z',
                metadata: {
                    source_proposal_id: 'proposal-green-1',
                    recipient_team: 'blue',
                    proposal_recipient_state: {
                        status: 'acknowledged',
                        actioned_at: '2026-06-03T10:15:00.000Z'
                    }
                }
            },
            {
                id: 'comm-response-1',
                session_id: 'session-research-1',
                move: 2,
                phase: 2,
                from_role: 'blue_facilitator',
                to_role: 'white_cell',
                type: 'PROPOSAL_RESPONSE',
                content: 'Blue acknowledges and requests timing details.',
                created_at: '2026-06-03T10:15:30.000Z',
                metadata: {
                    source_proposal_id: 'proposal-green-1'
                }
            }
        ],
        sessionRecordingArtifacts: [
            {
                session_id: 'session-research-1',
                recording_id: 'session-recording-alpha-1',
                started_utc: '2026-06-03T10:04:00.000Z',
                stopped_utc: '2026-06-03T10:19:00.000Z',
                duration_seconds: 900,
                mime_type: 'audio/webm;codecs=opus',
                file_size_bytes: 1048576,
                generated_by_role: 'whitecell',
                generated_by_user: 'White Cell Lead',
                plugin_id: 'session-recorder',
                filename: 'session-recording-session-research-1-alpha.webm',
                storage_reference: 'browser-download:session-recording-session-research-1-alpha.webm',
                object_url: 'blob:http://localhost/session-recording-alpha-1',
                object_url_lifecycle: 'current_browser_document',
                capture_constraints_requested: {
                    audio: {
                        echoCancellation: { ideal: true },
                        noiseSuppression: { ideal: true },
                        autoGainControl: { ideal: true },
                        channelCount: { ideal: 1 },
                        sampleRate: { ideal: 48000 }
                    }
                },
                recorder_mime_type_selected: 'audio/webm;codecs=opus',
                audio_bits_per_second_requested: 256000,
                audio_bits_per_second_used: 256000,
                created_at_utc: '2026-06-03T10:19:05.000Z'
            }
        ],
        timeline: [
            {
                id: 'timeline-1',
                type: 'ACTION_SUBMITTED',
                team: 'blue',
                move: 2,
                phase: 2,
                content: 'Blue action submitted to White Cell.',
                created_at: '2026-06-03T10:08:00.000Z'
            }
        ],
        notetakerData: [
            {
                id: 'note-record-1',
                session_id: 'session-research-1',
                move: 2,
                phase: 2,
                team: 'blue',
                updated_at: '2026-06-03T10:16:00.000Z',
                dynamics_analysis: {
                    schema_version: 2,
                    team_entries: {
                        blue: {
                            participant_entries: {
                                'seat-blue-1': {
                                    participant_key: 'seat-blue-1',
                                    participant_id: 'seat-blue-1',
                                    client_id: 'client-blue-1',
                                    updated_at: '2026-06-03T10:16:00.000Z',
                                    data: {
                                        dynamicsSummary: 'Blue team converged after initial disagreement.'
                                    }
                                }
                            }
                        }
                    }
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
                        participant_id: 'seat-blue-1',
                        client_id: 'client-blue-1',
                        type: 'NOTE',
                        content: 'White Cell clarification changed the pacing.',
                        phase: 2,
                        timestamp: '2026-06-03T10:16:30.000Z'
                    }
                ]
            }
        ],
        captureMode: 'research',
        softwareBuildHash: 'build-2026-06-03'
    };
}

describe('research export builder', () => {
    it('builds the full research archive dataset with the 1.4.0 file set', async () => {
        const exportBundle = await buildResearchExportBundle(buildBundleFixture(), {
            generatedAtUtc: '2026-06-03T12:00:00.000Z',
            generatedByPseudonym: 'gm-1234abcd',
            exportVersion: 4,
            includeNotesAppendix: true
        });

        expect(exportBundle.manifest).toMatchObject({
            schema_version: RESEARCH_EXPORT_SCHEMA_VERSION,
            export_format_revision: RESEARCH_EXPORT_FORMAT_REVISION,
            export_version: 4,
            generated_by_pseudonym: 'gm-1234abcd',
            capture_mode: 'research'
        });
        expect(exportBundle.manifest.row_counts).toMatchObject({
            action_content: 1,
            proposal_content: 1,
            move_response_content: 1,
            rfi_content: 1,
            session_recording_artifacts: 1
        });
        expect(exportBundle.manifest).toMatchObject({
            data_quality_summary_ref: 'data_quality_summary.json',
            decision_lineage_ref: 'decision_lineage.csv',
            scenario_context_ref: 'scenario_context.json',
            outcome_taxonomy_ref: 'outcome_taxonomy.csv',
            training_rubric_ref: 'training_rubric.csv',
            network_metrics_ref: 'network_metrics.csv',
            turning_points_ref: 'turning_points.csv',
            session_recording_artifacts_ref: 'session_recording_artifacts.csv',
            session_recording_artifacts_json_ref: 'session_recording_artifacts.json',
            persona_report_refs: {
                policy_brief: 'reports/policy_brief.html',
                strategic_leader_brief: 'reports/strategic_leader_brief.html',
                training_evaluator_report: 'reports/training_evaluator_report.html',
                analyst_report: 'reports/analyst_report.html'
            }
        });
        expect(exportBundle.manifest.row_counts).toMatchObject({
            decision_lineage: 4,
            outcome_taxonomy: expect.any(Number),
            training_rubric: 18,
            network_metrics: expect.any(Number),
            turning_points: expect.any(Number)
        });
        expect(exportBundle.actionContent[0]).toMatchObject({
            action_id: 'action-blue-1',
            action_type: 'Export Controls, Sanctions',
            final_status: 'adjudicated',
            full_content: {
                details: {
                    levers: ['Export Controls', 'Sanctions'],
                    sectors: ['Biotechnology', 'Agriculture']
                }
            }
        });
        expect(exportBundle.proposalContent[0]).toMatchObject({
            proposal_id: 'proposal-green-1',
            review_decision: 'forwarded',
            final_recipient_state: 'acknowledged'
        });
        expect(exportBundle.moveResponseContent[0]).toMatchObject({
            move_response_id: 'move-response-red-1',
            posture: 'Hold'
        });
        expect(exportBundle.reportHtml).toContain('Post-Game Analysis Report');
        expect(exportBundle.reportHtml).toContain('Table Of Contents');
        expect(exportBundle.reportHtml).not.toContain('The report is organized into');
        expect(exportBundle.reportHtml).not.toContain('Each begins on a new page so findings can be referenced and printed independently.');
        expect(exportBundle.reportHtml).toContain('font-family: "Inter"');
        expect(exportBundle.reportHtml).toContain('Source+Serif+4');
        expect(exportBundle.reportHtml).toContain('Report Pages');
        expect(exportBundle.reportHtml).toContain('content: counter(pages);');
        expect(exportBundle.reportHtml).toContain('content: counter(page);');
        expect(exportBundle.reportHtml).not.toContain('Page " counter(page) " of " counter(pages)');
        expect(exportBundle.reportHtml).not.toContain('Fractured Order on Plenum');
        // Running footer now lives in CSS paged-media margin boxes (never overlaps
        // content), not a position:fixed element inside the content area.
        expect(exportBundle.reportHtml).not.toContain('report-print-footer');
        expect(exportBundle.reportHtml).toContain('content: "Plenum.";');
        expect(exportBundle.reportHtml).toContain('content: "Research Session Alpha";');
        expect(exportBundle.reportHtml).toContain('font-family: "Source Serif 4", ui-serif, Georgia, serif;');
        expect(exportBundle.reportHtml).toContain('font-weight: 500;');
        expect(exportBundle.reportHtml).toContain('padding-bottom: 4mm;');
        expect(exportBundle.reportHtml).toContain('vertical-align: bottom;');
        // Wide-table sections are routed to landscape pages.
        expect(exportBundle.reportHtml).toContain('@page landscape');
        expect(exportBundle.reportHtml).toContain('size: A4 landscape;');
        expect(exportBundle.reportHtml).toContain('page: landscape;');
        expect(exportBundle.reportHtml).toContain('report-section report-landscape');
        expect(exportBundle.reportHtml).toContain('Session Snapshot');
        expect(exportBundle.reportHtml).toContain('Event Log Chronology');
        expect(exportBundle.reportHtml).toContain('Decision Lineage');
        expect(exportBundle.reportHtml).toContain('Draft And Submission History');
        expect(exportBundle.reportHtml).toContain('Scenario Context');
        expect(exportBundle.reportHtml).toContain('Session Recordings');
        expect(exportBundle.reportHtml).toContain('session-recording-session-research-1-alpha.webm');
        expect(exportBundle.reportHtml).toContain('Browser recording audio remains a local download');
        expect(exportBundle.reportHtml).toContain('Research Readiness');
        expect(exportBundle.reportHtml).toContain('Data Quality And Export Integrity');
        expect(exportBundle.reportHtml).toContain('Blue Team Scribe (blue_facilitator)');
        expect(exportBundle.reportHtml).toContain('Question-and-answer exchanges between team scribes and White Cell.');
        expect(exportBundle.reportHtml).toContain('ALPHA-R');
        expect(exportBundle.reportHtml).toContain('1h 30m');
        expect(exportBundle.reportHtml).toContain('Forwarded Green Team proposal.');
        expect(exportBundle.reportHtml).toContain('White Cell clarification changed the pacing.');
        expect(exportBundle.reportHtml).toContain('Notes Appendix');
        expect(exportBundle.dataQualitySummary).toMatchObject({
            quantitative_comparison_readiness: {
                status: 'limited'
            },
            privacy: {
                notes_appendix_included: true,
                identity_map_exported: false
            }
        });
        expect(exportBundle.dataQualitySummary.coverage.table_coverage).toEqual(expect.arrayContaining([
            expect.objectContaining({
                table_name: 'session_recording_artifacts',
                rows: 1,
                source: 'local_browser_metadata',
                status: 'present'
            })
        ]));
        expect(exportBundle.sessionRecordingArtifacts[0]).toMatchObject({
            recording_id: 'session-recording-alpha-1',
            filename: 'session-recording-session-research-1-alpha.webm',
            recorder_mime_type_selected: 'audio/webm;codecs=opus',
            audio_bits_per_second_used: 256000
        });
        expect(exportBundle.decisionLineage).toEqual(expect.arrayContaining([
            expect.objectContaining({
                root_entity_type: 'action',
                root_entity_id: 'action-blue-1',
                source_team: 'blue',
                current_state: 'adjudicated'
            }),
            expect.objectContaining({
                root_entity_type: 'proposal',
                root_entity_id: 'proposal-green-1',
                related_communication_ids: expect.arrayContaining(['comm-forwarded-1', 'comm-response-1'])
            })
        ]));
        expect(exportBundle.scenarioContext).toMatchObject({
            simulation_name: 'Fractured Order',
            session: {
                id: 'session-research-1',
                code: 'ALPHA-R'
            }
        });
        expect(exportBundle.outcomeTaxonomy).toEqual(expect.arrayContaining([
            expect.objectContaining({
                entity_id: 'action-blue-1',
                dimension: 'implementation_feasibility',
                signal: 'mentioned'
            })
        ]));
        expect(exportBundle.trainingRubric).toEqual(expect.arrayContaining([
            expect.objectContaining({
                participant_pseudonym: 'participant-001',
                dimension: 'participation_activity',
                status: 'evidence_present'
            })
        ]));
        expect(exportBundle.networkMetrics).toEqual(expect.arrayContaining([
            expect.objectContaining({
                metric_name: 'edge_count',
                source_team: 'whitecell',
                target_team: 'blue'
            })
        ]));
        expect(exportBundle.turningPoints).toEqual(expect.arrayContaining([
            expect.objectContaining({
                turning_point_type: 'first_forwarded_proposal',
                entity_id: 'proposal-green-1'
            }),
            expect.objectContaining({
                turning_point_type: 'highest_activity_move'
            })
        ]));
        expect(exportBundle.personaReports.map((file) => file.path)).toEqual([
            'reports/policy_brief.html',
            'reports/strategic_leader_brief.html',
            'reports/training_evaluator_report.html',
            'reports/analyst_report.html'
        ]);
        expect(exportBundle.personaReports[0].content).toContain('Policy Brief');
        expect(exportBundle.files.map((file) => file.path)).toEqual(expect.arrayContaining([
            'manifest.json',
            'codebook.json',
            'report.html',
            'reports/policy_brief.html',
            'reports/strategic_leader_brief.html',
            'reports/training_evaluator_report.html',
            'reports/analyst_report.html',
            'data_quality_summary.json',
            'decision_lineage.csv',
            'decision_lineage.json',
            'scenario_context.json',
            'outcome_taxonomy.csv',
            'outcome_taxonomy.json',
            'training_rubric.csv',
            'training_rubric.json',
            'network_metrics.csv',
            'network_metrics.json',
            'turning_points.csv',
            'turning_points.json',
            'session_recording_artifacts.csv',
            'session_recording_artifacts.json',
            'event_log.jsonl',
            'action_content.csv',
            'proposal_content.json',
            'move_response_content.csv',
            'rfi_content.json',
            'interaction_edges.csv',
            'derived_session_metrics.csv',
            'legacy/session_metadata.json',
            'checksums.sha256'
        ]));
    });

    it('renders the report notes appendix as withheld unless the export explicitly enables it', () => {
        const reportHtml = buildResearchReportHtml({
            session: { id: 'session-research-1', name: 'Research Session Alpha' },
            manifest: {
                capture_mode: 'research',
                generated_at_utc: '2026-06-03T12:00:00.000Z',
                schema_version: RESEARCH_EXPORT_SCHEMA_VERSION,
                software_build_hash: 'build-2026-06-03',
                generated_by_pseudonym: 'gm-1234abcd',
                event_log_chain: {
                    session_checksum: 'checksum'
                }
            },
            notes: [
                {
                    author_pseudonym: 'participant-001',
                    author_role: 'blue_notetaker',
                    author_team: 'blue',
                    created_utc: '2026-06-03T10:16:00.000Z',
                    content_text: 'Blue notes'
                }
            ],
            proposalContent: [],
            actionContent: [],
            adjudicationContent: [],
            moveResponseContent: [],
            rfiContent: [],
            interactionEdges: [],
            dataQualityEvents: [],
            stateTransitions: [],
            derivedParticipantMetrics: [],
            derivedSessionMetrics: [{}]
        }, {
            includeNotesAppendix: false
        });

        expect(reportHtml).toContain('Notes appendix withheld at report-generation time');
        expect(reportHtml).toContain('Table Of Contents');
        expect(reportHtml).not.toContain('The report is organized into');
        expect(reportHtml).not.toContain('Each begins on a new page so findings can be referenced and printed independently.');
        expect(reportHtml).toContain('Session Snapshot');
        expect(reportHtml).toContain('Note Summary');
        expect(reportHtml).toContain('window.print()');
        expect(reportHtml).toContain('report-logo--ssg');
        expect(reportHtml).toContain('content: "Plenum.";');
        expect(reportHtml).toContain('Report Pages');
        expect(reportHtml).not.toContain('aria-label="Plenum wordmark"');
        expect(reportHtml).not.toContain('report-wordmark');
        expect(reportHtml).not.toContain('report-wordmark-dot');
        expect(reportHtml).not.toContain('AidData');
        expect(reportHtml).not.toContain('report-logo--aiddata');
        expect(reportHtml).not.toContain('Blue notes');
    });

    it('creates a downloadable ZIP blob without adding a new archive dependency', async () => {
        const exportBundle = await buildResearchExportBundle(buildBundleFixture(), {
            generatedAtUtc: '2026-06-03T12:00:00.000Z',
            generatedByPseudonym: 'gm-1234abcd'
        });
        const archiveBlob = await createResearchExportArchiveBlob(exportBundle);

        expect(archiveBlob.type).toBe('application/zip');
        expect(archiveBlob.size).toBeGreaterThan(0);
    });

    it('builds a cross-session research index from session export bundles', async () => {
        const firstExport = await buildResearchExportBundle(buildBundleFixture(), {
            generatedAtUtc: '2026-06-03T12:00:00.000Z',
            generatedByPseudonym: 'gm-1234abcd'
        });
        const secondFixture = buildBundleFixture();
        secondFixture.session = {
            ...secondFixture.session,
            id: 'session-research-2',
            name: 'Research Session Bravo'
        };
        const crossSessionBundle = await buildCrossSessionResearchExportBundle([
            firstExport,
            secondFixture
        ], {
            generatedAtUtc: '2026-06-04T12:00:00.000Z',
            generatedByPseudonym: 'gm-1234abcd'
        });

        expect(crossSessionBundle.manifest).toMatchObject({
            sessions_count: 2,
            index_ref: 'cross_session_index.csv',
            data_quality_ref: 'cross_session_data_quality.json'
        });
        expect(crossSessionBundle.sessionIndex).toHaveLength(2);
        expect(crossSessionBundle.sessionIndex[0]).toMatchObject({
            session_id: 'session-research-1',
            session_name: 'Research Session Alpha',
            data_quality_readiness: 'limited'
        });
        expect(crossSessionBundle.files.map((file) => file.path)).toEqual(expect.arrayContaining([
            'cross_session_manifest.json',
            'cross_session_index.csv',
            'cross_session_index.json',
            'cross_session_data_quality.json',
            'checksums.sha256'
        ]));
        expect(crossSessionBundle.files.some((file) => (
            file.path.includes('/manifest.json')
            && file.path.startsWith('sessions/research_export_session-research-1')
        ))).toBe(true);
    });
});
