import { describe, expect, it } from 'vitest';

import { serializeBlueActionDetails } from '../actions/blueActionDetails.js';
import { serializeMoveResponseDetails } from '../actions/moveResponseDetails.js';
import { serializeProposalDetails } from '../actions/proposalDetails.js';
import { serializeStrategicOrientationDetails } from '../actions/strategicOrientationDetails.js';
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
                    instruments: ['Economic', 'Diplomacy', 'Information', 'Military'],
                    levers: ['Export Controls', 'Sanctions'],
                    sectors: ['Biotechnology', 'Agriculture'],
                    supplyChainFocusDecision: 'Yes',
                    supplyChainActionAngles: ['Build resilience for Blue'],
                    supplyChainAreas: ['Advanced Manufacturing'],
                    implementation: 'Executive Order',
                    legislativeOptions: ['Existing legislation/policy'],
                    enforcementTimeline: '6 months',
                    scribeHandoff: 'Forwarded',
                    coordinatedDecision: 'Yes',
                    coordinated: ['Executive'],
                    informedEngagedDecision: 'Yes',
                    informed: ['Allies']
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
                    intendedPartners: 'Blue Team, Red Team',
                    recipientTeams: ['blue', 'red'],
                    focusSectors: ['Agriculture', 'Biotechnology'],
                    supplyChainFocusDecision: 'Yes',
                    supplyChainActionAngles: ['Build resilience for Blue'],
                    supplyChainAreas: ['Distribution'],
                    timingAndConditions: 'Before next move',
                    revisionMetadata: { revisionNumber: 2 }
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
                id: 'timeline-proposal-returned-1',
                type: 'ARTIFACT_RETURNED_TO_TEAM',
                team: 'white_cell',
                move: 2,
                phase: 2,
                content: 'Green proposal revision 1 returned for changes.',
                created_at: '2026-06-03T10:08:30.000Z',
                metadata: {
                    related_id: 'proposal-green-1',
                    artifact_kind: 'proposal',
                    revision_number: 1,
                    next_revision_number: 2,
                    role: 'whitecell_lead',
                    return_notes: 'Clarify the timing conditions.'
                }
            },
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
    it('builds the full research archive dataset with the 1.9.0 workflow-evidence file set', async () => {
        const exportBundle = await buildResearchExportBundle(buildBundleFixture(), {
            generatedAtUtc: '2026-06-03T12:00:00.000Z',
            generatedByPseudonym: 'gm-1234abcd',
            exportVersion: 4,
            includeNotesAppendix: true
        });

        expect(RESEARCH_EXPORT_SCHEMA_VERSION).toBe('1.9.0');
        expect(RESEARCH_EXPORT_FORMAT_REVISION).toBe(10);
        expect(exportBundle.manifest).toMatchObject({
            schema_version: RESEARCH_EXPORT_SCHEMA_VERSION,
            export_format_revision: RESEARCH_EXPORT_FORMAT_REVISION,
            export_version: 4,
            generated_by_pseudonym: 'gm-1234abcd',
            capture_mode: 'research',
            event_log_source: 'reconstructed_from_session_records'
        });
        expect(exportBundle.manifest.contract_reconciliation.status).toBe('passed');
        expect(exportBundle.manifest.row_counts).toMatchObject({
            action_content: 1,
            proposal_content: 1,
            move_response_content: 1,
            rfi_content: 1,
            artifact_workflow_reviews: 0,
            session_recording_artifacts: 1
        });
        expect(exportBundle.manifest).toMatchObject({
            data_quality_summary_ref: 'data_quality_summary.json',
            decision_lineage_ref: 'decision_lineage.csv',
            scenario_context_ref: 'scenario_context.json',
            report_ref: 'report.html',
            latex_report_ref: 'report.tex',
            latex_engine: 'lualatex',
            latex_build_config_ref: 'latexmkrc',
            latex_build_readme_ref: 'LATEX_REPORT_README.md',
            pdf_report_target_ref: 'report.pdf',
            pdf_report_included: false,
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
            instruments: ['Economic', 'Diplomacy', 'Information', 'Military'],
            final_status: 'adjudicated',
            legacy_adjudication_outcome: 'permitted_with_constraint',
            legacy_adjudication_notes: 'Proceed with reporting safeguards.',
            full_content: {
                details: {
                    levers: ['Export Controls', 'Sanctions'],
                    sectors: ['Biotechnology', 'Agriculture']
                }
            }
        });
        expect(exportBundle.proposalContent[0]).toMatchObject({
            proposal_id: 'proposal-green-1',
            intended_recipient_teams: ['blue', 'red'],
            recipient_approval_states: {
                blue: 'pending_white_cell_approval',
                red: 'pending_white_cell_approval'
            },
            focus_sectors: ['Agriculture', 'Biotechnology'],
            supply_chain_focus_decision: 'Yes',
            supply_chain_action_angles: ['Build resilience for Blue'],
            supply_chain_areas: ['Distribution'],
            revision_number: 2,
            revision_history: [expect.objectContaining({
                revision_number: 1,
                next_revision_number: 2,
                reviewer_role: 'whitecell_lead',
                reviewer_notes: 'Clarify the timing conditions.',
                returned_utc: '2026-06-03T10:08:30.000Z'
            })],
            review_decision: 'forwarded',
            final_recipient_state: 'acknowledged'
        });
        expect(exportBundle.moveResponseContent[0]).toMatchObject({
            move_response_id: 'move-response-red-1',
            posture: 'Hold'
        });
        expect(exportBundle.rfiContent[0]).toMatchObject({
            rfi_id: 'rfi-1',
            requester_role: 'blue_facilitator',
            requester_team: 'blue'
        });
        expect(exportBundle.reportHtml).toContain('Post-Game Analysis Report');
        expect(exportBundle.reportLatex).toContain(String.raw`\documentclass[11pt,oneside]{article}`);
        expect(exportBundle.reportLatex).toContain(String.raw`\usepackage{fontspec}`);
        expect(exportBundle.reportLatex).toContain(String.raw`\setmainfont{TeX Gyre Pagella}`);
        expect(exportBundle.reportLatex).toContain(String.raw`\section{Evidence and provenance statement}`);
        expect(exportBundle.reportLatex).toContain(String.raw`\section{Actions and workflow reviews}`);
        expect(exportBundle.reportLatex).toContain(String.raw`\section{Proposals: content and review}`);
        expect(exportBundle.reportLatex).toContain('Reconstructed event rows are intentionally not printed as captured session evidence.');
        expect(exportBundle.reportLatex).not.toContain(String.raw`ACTION\_SUBMITTED`);
        expect(exportBundle.reportLatex).toContain('Research Session Alpha');
        expect(exportBundle.reportLatex).toContain('White Cell clarification changed the pacing.');
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
        expect(exportBundle.reportHtml).toContain('Question-and-answer exchanges between team facilitators and White Cell.');
        expect(exportBundle.reportHtml).toContain('ALPHA-R');
        expect(exportBundle.reportHtml).toContain('1h 30m');
        expect(exportBundle.reportHtml).toContain('Forwarded Green Team proposal.');
        expect(exportBundle.reportHtml).toContain('Focus Sectors');
        expect(exportBundle.reportHtml).toContain('Supply Chain Decision');
        expect(exportBundle.reportHtml).toContain('Revision History');
        expect(exportBundle.reportHtml).toContain('Historical / Legacy Adjudication');
        expect(exportBundle.reportHtml).not.toContain('Review Outcome');
        expect(exportBundle.reportHtml).toContain('Clarify the timing conditions.');
        expect(exportBundle.reportHtml).not.toContain('Delivery (historical)');
        expect(exportBundle.reportLatex).toContain('Action angles');
        expect(exportBundle.reportLatex).toContain('Revision history');
        expect(exportBundle.reportLatex).toContain('Historical / legacy adjudication outcome');
        expect(exportBundle.files.find((file) => file.path === 'action_content.csv').content)
            .toContain('legacy_adjudication_outcome');
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
            'report.tex',
            'latexmkrc',
            'LATEX_REPORT_README.md',
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
            'artifact_workflow_reviews.csv',
            'artifact_workflow_reviews.json',
            'interaction_edges.csv',
            'derived_session_metrics.csv',
            'legacy/session_metadata.json',
            'checksums.sha256'
        ]));
        const checksumsFile = exportBundle.files.find((file) => file.path === 'checksums.sha256');
        expect(checksumsFile.content).toContain('  report.html');
        expect(checksumsFile.content).toContain('  report.tex');
        expect(checksumsFile.content).toContain('  latexmkrc');
        expect(checksumsFile.content).toContain('  LATEX_REPORT_README.md');
    });

    it('reconciles authoritative reviews, proposal rounds, and RFI history across every renderer', async () => {
        const bundle = buildBundleFixture();
        const action = bundle.actions.find((row) => row.id === 'action-blue-1');
        Object.assign(action, {
            status: 'adjudicated',
            workflow_state: 'completed',
            prior_workflow_state: 'resubmitted',
            revision_number: 2,
            outcome: null,
            adjudication_notes: null,
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Coordinate export posture',
                instruments: ['Economic'],
                notificationTeams: ['Green', 'Industry'],
                notificationNote: 'Share the completed action with both informed teams.'
            })
        });
        const proposal = bundle.actions.find((row) => row.id === 'proposal-green-1');
        Object.assign(proposal, {
            status: 'adjudicated',
            workflow_state: 'completed',
            prior_workflow_state: 'submitted_to_white_cell',
            revision_number: 2,
            outcome: null,
            adjudication_notes: null,
            artifact_payload: {
                proposal_recipient_reviews: {
                    blue: {
                        status: 'approved_forwarded',
                        thread_id: 'thread-blue-1',
                        communication_id: 'comm-forwarded-1',
                        approved_at: '2026-06-03T10:11:30.000Z',
                        approved_by_role: 'whitecell_lead'
                    },
                    red: { status: 'pending_white_cell_approval' }
                }
            }
        });
        const request = bundle.requests[0];
        Object.assign(request, {
            workflow_state: 'completed',
            prior_workflow_state: 'resubmitted',
            revision_number: 2,
            review_notes: null,
            reviewed_by_role: 'whitecell_lead',
            completed_at: '2026-06-03T10:14:00.000Z'
        });
        bundle.artifactWorkflowReviews = [
            {
                id: 'review-action-complete-1',
                session_id: bundle.session.id,
                artifact_kind: 'action',
                artifact_id: action.id,
                artifact_type: 'blue_action',
                team: 'blue',
                decision: 'complete',
                revision_number: 2,
                next_revision_number: 2,
                prior_status: 'submitted',
                status_to: 'adjudicated',
                prior_workflow_state: 'resubmitted',
                workflow_state_to: 'completed',
                reviewer_role: 'whitecell_lead',
                reviewer_notes: null,
                reviewed_at: '2026-06-03T10:12:00.000Z',
                prior_state: { workflow_state: 'resubmitted', revision_number: 2 },
                new_state: { workflow_state: 'completed', revision_number: 2, outcome: null }
            },
            {
                id: 'review-proposal-complete-1',
                session_id: bundle.session.id,
                artifact_kind: 'action',
                artifact_id: proposal.id,
                artifact_type: 'proposal',
                team: 'green',
                decision: 'complete',
                revision_number: 2,
                next_revision_number: 2,
                prior_status: 'submitted',
                status_to: 'adjudicated',
                prior_workflow_state: 'submitted_to_white_cell',
                workflow_state_to: 'completed',
                reviewer_role: 'whitecell_lead',
                reviewed_at: '2026-06-03T10:13:00.000Z',
                prior_state: { workflow_state: 'submitted_to_white_cell' },
                new_state: { workflow_state: 'completed', outcome: null }
            },
            {
                id: 'review-rfi-return-1',
                session_id: bundle.session.id,
                artifact_kind: 'rfi',
                artifact_id: request.id,
                artifact_type: 'rfi',
                team: 'blue',
                decision: 'return_for_clarification',
                revision_number: 1,
                next_revision_number: 2,
                prior_status: 'pending',
                status_to: 'pending',
                prior_workflow_state: 'submitted_to_white_cell',
                workflow_state_to: 'returned_to_team',
                reviewer_role: 'whitecell_lead',
                reviewer_notes: 'Specify the requested reporting horizon.',
                reviewed_at: '2026-06-03T10:10:00.000Z',
                prior_state: { query: 'What is the latest White Cell guidance?' },
                new_state: { workflow_state: 'returned_to_team', revision_number: 2 }
            }
        ];
        bundle.communications = [
            {
                id: 'comm-forwarded-1',
                type: 'PROPOSAL_FORWARDED',
                from_role: 'white_cell',
                to_role: 'blue',
                content: 'Forwarded to Blue.',
                created_at: '2026-06-03T10:11:30.000Z',
                metadata: {
                    thread_id: 'thread-blue-1', recipient_team: 'blue', round_number: 0,
                    parent_message_id: null, source_proposal_id: proposal.id, source_revision: 2,
                    source_team: 'green', sender_team: 'white_cell', sender_role: 'whitecell_lead',
                    sent_at: '2026-06-03T10:11:30.000Z', message_type: 'proposal_forwarded'
                }
            },
            {
                id: 'comm-response-1',
                type: 'PROPOSAL_RESPONSE',
                from_role: 'blue_scribe',
                to_role: 'green',
                content: 'Blue requests a second negotiation round.',
                created_at: '2026-06-03T10:15:30.000Z',
                metadata: {
                    thread_id: 'thread-blue-1', recipient_team: 'blue', round_number: 1,
                    parent_message_id: 'comm-forwarded-1', source_proposal_id: proposal.id, source_revision: 2,
                    source_team: 'green', sender_team: 'blue', sender_role: 'blue_scribe',
                    sent_at: '2026-06-03T10:15:30.000Z', message_type: 'recipient_response',
                    facilitator_decision: 'negotiate', client_message_id: 'blue-round-1'
                }
            },
            {
                id: 'rfi-answer-1',
                linked_request_id: request.id,
                type: 'rfi_response',
                from_role: 'white_cell',
                to_role: 'blue',
                content: request.response,
                created_at: request.responded_at,
                metadata: { workflow_state: 'completed', revision_number: 2, answered_by_role: 'whitecell_lead' }
            }
        ];
        bundle.timeline.push({
            id: 'timeline-rfi-resubmitted-1',
            type: 'RFI_RESUBMITTED',
            created_at: '2026-06-03T10:12:30.000Z',
            metadata: { related_id: request.id, revision_number: 2 }
        });

        const exportBundle = await buildResearchExportBundle(bundle, {
            generatedAtUtc: '2026-06-03T12:00:00.000Z'
        });

        expect(exportBundle.manifest.contract_reconciliation).toMatchObject({
            status: 'passed',
            checks: {
                artifact_review_rows: { source_count: 3, projected_count: 3, matches: true },
                proposal_threads: {
                    source_thread_count: 1,
                    projected_thread_count: 1,
                    source_round_count: 2,
                    projected_round_count: 2,
                    approved_recipient_count: 1,
                    round_zero_count: 1,
                    matches: true
                },
                rfi_revisions: { return_review_count: 1, resubmission_count: 1, answer_count: 1, matches: true },
                ui_workflow_projection: { matches: true, current_completed_outcome_violations: 0 }
            }
        });
        expect(exportBundle.actionContent[0]).toMatchObject({
            workflow_state: 'completed',
            revision_number: 2,
            notification_audiences: ['green', 'industry'],
            notification_note: 'Share the completed action with both informed teams.',
            legacy_adjudication_outcome: null,
            review_history: [expect.objectContaining({ review_id: 'review-action-complete-1', decision: 'complete' })]
        });
        expect(exportBundle.proposalContent[0]).toMatchObject({
            workflow_state: 'completed',
            recipient_approvals: { blue: expect.objectContaining({ thread_id: 'thread-blue-1' }) },
            thread_count: 1,
            round_count: 2,
            thread_history: [
                expect.objectContaining({ thread_id: 'thread-blue-1', round_number: 0, parent_message_id: null }),
                expect.objectContaining({ thread_id: 'thread-blue-1', round_number: 1, parent_message_id: 'comm-forwarded-1' })
            ],
            review_decision: null
        });
        expect(exportBundle.rfiContent[0]).toMatchObject({
            workflow_state: 'completed',
            revision_number: 2,
            return_notes: 'Specify the requested reporting horizon.',
            returned_by_role: 'whitecell_lead',
            resubmitted_utc: '2026-06-03T10:12:30.000Z',
            answer_history: [expect.objectContaining({ communication_id: 'rfi-answer-1', revision_number: 2 })]
        });
        const actionCsv = exportBundle.files.find((file) => file.path === 'action_content.csv').content;
        const proposalCsv = exportBundle.files.find((file) => file.path === 'proposal_content.csv').content;
        const rfiCsv = exportBundle.files.find((file) => file.path === 'rfi_content.csv').content;
        const workflowReviewsJson = exportBundle.files.find((file) => file.path === 'artifact_workflow_reviews.json').content;
        expect(actionCsv).toContain('notification_audiences');
        expect(proposalCsv).toContain('thread_history');
        expect(rfiCsv).toContain('answer_history');
        expect(JSON.parse(workflowReviewsJson)).toHaveLength(3);
        expect(exportBundle.codebook.tables).toEqual(expect.arrayContaining([
            expect.objectContaining({ table_name: 'action_content', column_name: 'review_history', data_type: 'json' }),
            expect.objectContaining({ table_name: 'proposal_content', column_name: 'thread_history', data_type: 'json' }),
            expect.objectContaining({ table_name: 'rfi_content', column_name: 'answer_history', data_type: 'json' }),
            expect.objectContaining({ table_name: 'artifact_workflow_reviews', column_name: 'prior_state', data_type: 'json' }),
            expect.objectContaining({ table_name: 'artifact_workflow_reviews', column_name: 'new_state', data_type: 'json' }),
            expect.objectContaining({ table_name: 'event_log', column_name: 'before_state', data_type: 'json' }),
            expect.objectContaining({ table_name: 'event_log', column_name: 'after_state', data_type: 'json' }),
            expect.objectContaining({ table_name: 'action_content', column_name: 'workflow_state', data_type: 'string' }),
            expect.objectContaining({ table_name: 'artifact_workflow_reviews', column_name: 'prior_status', data_type: 'string' }),
            expect.objectContaining({ table_name: 'turning_points', column_name: 'evidence_summary', data_type: 'string' })
        ]));
        expect(exportBundle.reportHtml).toContain('Authoritative Review Records');
        expect(exportBundle.reportHtml).toContain('Immutable Proposal Thread History');
        expect(exportBundle.reportHtml).toContain('Specify the requested reporting horizon.');
        expect(exportBundle.reportHtml).not.toContain('Review Outcome');
        expect(exportBundle.reportLatex).toContain('Workflow review history');
        expect(exportBundle.reportLatex).toContain('Immutable thread history');
        expect(exportBundle.reportLatex).toContain('Answer history');
    });

    it('attributes current RFIs to the actual Facilitator while preserving legacy attribution', async () => {
        const bundle = buildBundleFixture();
        bundle.participants = [];
        bundle.requests = [
            {
                id: 'rfi-current',
                session_id: bundle.session.id,
                team: 'industry',
                query: 'Current Facilitator question',
                status: 'pending',
                workflow_state: 'submitted_to_white_cell',
                revision_number: 1,
                created_at: '2026-06-03T10:17:00.000Z'
            },
            {
                id: 'rfi-legacy',
                session_id: bundle.session.id,
                team: 'industry',
                query: 'Legacy Scribe question',
                status: 'answered',
                created_at: '2026-06-03T10:07:00.000Z'
            }
        ];

        const exportBundle = await buildResearchExportBundle(bundle, {
            generatedAtUtc: '2026-06-03T12:00:00.000Z',
            generatedByPseudonym: 'gm-1234abcd'
        });

        expect(exportBundle.rfiContent).toEqual(expect.arrayContaining([
            expect.objectContaining({
                rfi_id: 'rfi-current',
                requester_role: 'industry_scribe'
            }),
            expect.objectContaining({
                rfi_id: 'rfi-legacy',
                requester_role: 'industry_facilitator'
            })
        ]));
    });

    it('renders the full action and strategic-orientation decision scope', async () => {
        const bundle = buildBundleFixture();
        bundle.actions.push(
            {
                id: 'orientation-blue-1',
                session_id: 'session-research-1',
                client_id: 'client-blue-1',
                team: 'blue',
                move: 0,
                phase: 0,
                mechanism: 'Strategic Orientation',
                goal: 'Blue selects Reframe',
                expected_outcomes: 'Build long-term strategic autonomy.',
                ally_contingencies: serializeStrategicOrientationDetails({
                    team: 'blue',
                    ownOrientation: 'reframe',
                    forecastTargets: [{ key: 'red', orientation: 'pressure' }],
                    forecastActionDescription: 'Red will impose costs through visible pressure.',
                    primaryLevers: ['Friend-shoring agreements', 'Critical-input diversification'],
                    acceptedCosts: ['Transitional inefficiencies', 'Near-term economic friction'],
                    posture: 'Gradual - long-horizon reallocation',
                    scribeHandoff: 'Forwarded'
                }),
                status: 'submitted',
                created_at: '2026-06-03T09:35:00.000Z',
                submitted_at: '2026-06-03T09:45:00.000Z'
            },
            {
                id: 'orientation-industry-1',
                session_id: 'session-research-1',
                team: 'industry',
                move: 0,
                phase: 0,
                mechanism: 'Strategic Orientation',
                goal: 'Industry Strategic Orientation: Stabilization',
                ally_contingencies: serializeStrategicOrientationDetails({
                    team: 'industry',
                    ownOrientation: 'stabilization',
                    forecastTargets: [
                        { key: 'blue', orientation: 'pressure' }
                    ],
                    primaryLevers: ['Technology export controls'],
                    acceptedCosts: ['Market volatility'],
                    posture: 'Prepare for divergent partner choices.',
                    strategyDescription: 'Industry will preserve optionality while Blue applies pressure.',
                    forecastSummary: 'Blue pressures while Green pathways diverge.',
                    scribeHandoff: 'Forwarded'
                }),
                status: 'adjudicated',
                outcome: 'accepted',
                adjudication_notes: 'Forecast recorded for exercise analysis.',
                created_at: '2026-06-03T09:36:00.000Z',
                submitted_at: '2026-06-03T09:46:00.000Z',
                adjudicated_at: '2026-06-03T09:50:00.000Z'
            }
        );

        const exportBundle = await buildResearchExportBundle(bundle, {
            generatedAtUtc: '2026-06-03T12:00:00.000Z'
        });
        const orientationRows = exportBundle.actionContent.filter((action) => (
            action.full_content?.artifact_kind === 'strategic_orientation'
        ));

        expect(orientationRows).toHaveLength(2);
        expect(orientationRows[0]).toMatchObject({
            action_type: 'Strategic Orientation & Forecast',
            strategic_orientation_contract_version: 2,
            own_orientation: { id: 'reframe', label: 'Reframe' },
            forecast_action_description: 'Red will impose costs through visible pressure.',
            full_content: {
                details: {
                    artifactType: 'orientation_and_forecast',
                    contractVersion: 2,
                    ownOrientation: { id: 'reframe', label: 'Reframe' },
                    orientationLabel: 'Reframe',
                    primaryLevers: ['Friend-shoring agreements', 'Critical-input diversification'],
                    acceptedCosts: ['Transitional inefficiencies', 'Near-term economic friction'],
                    scribeHandoff: 'Forwarded'
                }
            }
        });
        expect(orientationRows[0].full_content.details).not.toHaveProperty('description');
        expect(orientationRows[0].full_content.details).not.toHaveProperty('characteristics');
        expect(orientationRows[1].full_content.details.forecastTargets).toEqual([
            expect.objectContaining({ label: 'Blue', orientationLabel: 'Pressure' })
        ]);
        expect(orientationRows[1]).toMatchObject({
            strategy_description: 'Industry will preserve optionality while Blue applies pressure.'
        });
        expect(exportBundle.draftRevisions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                artifact_id: 'orientation-blue-1',
                artifact_type: 'strategic_orientation'
            })
        ]));
        expect(exportBundle.reportHtml).toContain('Strategic Orientation: Team Workflows');
        expect(exportBundle.reportHtml).toContain('Forecast Targets');
        expect(exportBundle.reportHtml).toContain('Expected Target Actions');
        expect(exportBundle.reportHtml).toContain('Red will impose costs through visible pressure.');
        expect(exportBundle.reportHtml).toContain('Industry will preserve optionality while Blue applies pressure.');
        expect(exportBundle.reportHtml).toContain('Transitional inefficiencies');
        expect(exportBundle.reportHtml).toContain('Supply Chain Focus Decision');
        expect(exportBundle.reportHtml).toContain('Build resilience for Blue');
        expect(exportBundle.reportHtml).toContain('Information / Engagement Planned');
        expect(exportBundle.reportHtml).toContain('Existing legislation/policy');
        expect(exportBundle.reportHtml).toContain('not captured audit events');
        expect(exportBundle.reportHtml).not.toContain('The United States systematically reallocates economic exposure away from China');
        expect(exportBundle.reportLatex).toContain(String.raw`\section{Strategic Orientation: team workflows}`);
        expect(exportBundle.reportLatex).toContain('Red will impose costs through visible pressure.');
        expect(exportBundle.reportLatex).toContain('Industry will preserve optionality while Blue applies pressure.');
        expect(exportBundle.reportLatex).toContain('Build resilience for Blue');
        expect(exportBundle.reportLatex).not.toContain('The United States systematically reallocates economic exposure away from China');
        expect(exportBundle.eventLog).toEqual(expect.arrayContaining([
            expect.objectContaining({
                event_type: 'STRATEGIC_ORIENTATION_SUBMITTED',
                entity_type: 'strategic_orientation',
                entity_id: 'orientation-blue-1'
            })
        ]));
        expect(exportBundle.eventLog).not.toEqual(expect.arrayContaining([
            expect.objectContaining({
                event_type: 'ACTION_SUBMITTED',
                entity_id: 'move-response-red-1'
            })
        ]));
        expect(exportBundle.derivedSessionMetrics[0]).toMatchObject({
            actions_submitted: 1,
            actions_adjudicated: 1
        });
        expect(exportBundle.decisionLineage).toEqual(expect.arrayContaining([
            expect.objectContaining({
                root_entity_type: 'strategic_orientation',
                root_entity_id: 'orientation-blue-1'
            })
        ]));
        expect(exportBundle.scenarioContext.observed_objectives).toMatchObject({
            strategic_orientations: expect.arrayContaining([
                expect.objectContaining({ orientation_id: 'orientation-blue-1' })
            ]),
            actions: [expect.objectContaining({ action_id: 'action-blue-1' })]
        });
        const strategicLeaderBrief = exportBundle.personaReports.find((file) => (
            file.path === 'reports/strategic_leader_brief.html'
        ));
        expect(strategicLeaderBrief.content).toContain('Strategic Orientation Portfolio');
        expect(strategicLeaderBrief.content).toContain('Green (Asian Pacific): Stabilization');
        expect(strategicLeaderBrief.content).toContain('Near-term economic friction');
        expect(exportBundle.personaReports.map((file) => file.content).join('\n')).not.toContain(
            'The United States systematically reallocates economic exposure away from China'
        );
    });

    it('labels Industry proposal instruments of power in generated reports', async () => {
        const bundle = buildBundleFixture();
        const proposal = bundle.actions.find((action) => action.id === 'proposal-green-1');
        proposal.team = 'industry';
        proposal.ally_contingencies = serializeProposalDetails({
            originators: ['EU'],
            objective: 'Seek joint messaging',
            instruments: ['Economic', 'Information'],
            intendedPartners: 'Blue Team',
            delivery: 'Joint Statement',
            timingAndConditions: 'Before next move',
            recipientTeam: 'blue'
        });

        const exportBundle = await buildResearchExportBundle(bundle, {
            generatedAtUtc: '2026-06-03T12:00:00.000Z'
        });

        expect(exportBundle.reportHtml).toContain('Instrument of Power');
        expect(exportBundle.reportHtml).toContain('Economic, Information');
        expect(exportBundle.reportLatex).toContain('Instrument of Power');
    });

    it('labels a supplied research audit spine as captured evidence', async () => {
        const bundle = buildBundleFixture();
        bundle.researchAuditEventLog = [
            {
                event_uuid: 'audit-event-1',
                session_id: 'session-research-1',
                event_ts_utc: '2026-06-03T10:00:00.000Z',
                server_received_utc: '2026-06-03T10:00:00.000Z',
                actor_pseudonym: 'gm-operator',
                actor_role: 'game_master',
                actor_team: 'gamemaster',
                event_type: 'SESSION_STARTED',
                entity_type: 'session',
                entity_id: 'session-research-1',
                payload: {},
                before_state: null,
                after_state: { status: 'active' }
            }
        ];

        const exportBundle = await buildResearchExportBundle(bundle, {
            generatedAtUtc: '2026-06-03T12:00:00.000Z'
        });

        expect(exportBundle.manifest.event_log_source).toBe('captured_audit_log');
        expect(exportBundle.reportHtml).toContain('Captured audit-event chronology');
        expect(exportBundle.reportHtml).toContain('Audit Events Captured');
        expect(exportBundle.reportHtml).not.toContain('Event Provenance Unspecified');
        expect(exportBundle.reportLatex).toContain('captured research audit log');
        expect(exportBundle.reportLatex).toContain(String.raw`SESSION\_STARTED`);
        expect(exportBundle.reportLatex).toContain('audit-event-1');
    });

    it('escapes session-authored values in the generated LaTeX source', async () => {
        const bundle = buildBundleFixture();
        bundle.session = {
            ...bundle.session,
            name: 'Research & Trade_50% Session',
            metadata: {
                ...bundle.session.metadata,
                description: 'Evidence #1 costs $5 {provisional}.'
            }
        };

        const exportBundle = await buildResearchExportBundle(bundle, {
            generatedAtUtc: '2026-06-03T12:00:00.000Z'
        });

        expect(exportBundle.reportLatex).toContain(String.raw`Research \& Trade\_50\% Session`);
        expect(exportBundle.reportLatex).toContain(String.raw`Evidence \#1 costs \$5 \{provisional\}.`);
        expect(exportBundle.reportLatex).not.toContain('Research & Trade_50% Session');
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
