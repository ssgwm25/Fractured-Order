import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
    exportSessionActionsCsv,
    exportSessionParticipantsCsv,
    exportSessionRequestsCsv
} from './exportCsv.js';
import { buildJsonExportPayload } from './exportJson.js';
import * as exportFeature from './index.js';

describe('admin export helpers', () => {
    it('builds explicit JSON payloads from selected-session data', () => {
        const payload = buildJsonExportPayload({
            session: { id: 'session-1', name: 'Alpha' },
            gameState: { move: 2, phase: 3 },
            actions: [{ id: 'a1' }],
            requests: [{ id: 'r1' }],
            timeline: [{ id: 't1' }],
            participants: [{ id: 'p1' }],
            exportedAt: '2026-04-06T12:00:00.000Z'
        });

        expect(payload).toMatchObject({
            exportedAt: '2026-04-06T12:00:00.000Z',
            session: { id: 'session-1', name: 'Alpha' },
            gameState: { move: 2, phase: 3 },
            actions: [{ id: 'a1' }],
            requests: [{ id: 'r1' }],
            timeline: [{ id: 't1' }],
            participants: [{ id: 'p1' }]
        });
    });

    it('removes Priority from current-run JSON RFIs while retaining legacy rows verbatim', () => {
        const payload = buildJsonExportPayload({
            requests: [
                {
                    id: 'current-rfi',
                    workflow_state: 'submitted_to_white_cell',
                    revision_number: 1,
                    priority: 'HIGH'
                },
                {
                    id: 'legacy-rfi',
                    priority: 'URGENT'
                }
            ]
        });

        expect(payload.requests[0]).not.toHaveProperty('priority');
        expect(payload.requests[1]).toMatchObject({ priority: 'URGENT' });
    });

    it('serializes current-schema actions and participants to CSV', () => {
        const actionsCsv = exportSessionActionsCsv([
            {
                id: 'a1',
                team: 'blue',
                move: 1,
                phase: 2,
                mechanism: 'Tariff',
                targets: ['Partner A', 'Partner B'],
                goal: 'Protect industry',
                expected_outcomes: 'Reduce exposure',
                priority: 'HIGH',
                status: 'submitted'
            }
        ]);
        const participantsCsv = exportSessionParticipantsCsv([
            {
                id: 'p1',
                display_name: 'Alex',
                role: 'blue_facilitator',
                is_active: true
            }
        ]);

        expect(actionsCsv).toContain('mechanism');
        expect(actionsCsv).toContain('"Partner A; Partner B"');
        expect(participantsCsv).toContain('display_name');
        expect(participantsCsv).toContain('Alex');
    });

    it('exports revision-aware RFIs without the removed priority field', () => {
        const requestsCsv = exportSessionRequestsCsv([{
            id: 'rfi-1',
            team: 'industry',
            query: 'Which reporting period applies?',
            workflow_state: 'returned_to_team',
            revision_number: 2,
            review_notes: 'Specify the requested horizon.',
            status: 'pending'
        }]);

        expect(requestsCsv.split('\n')[0]).toBe(
            'id,team,move,phase,categories,query,workflow_state,revision_number,review_notes,status,response,responded_by,responded_at,created_at'
        );
        expect(requestsCsv).not.toContain('priority');
        expect(requestsCsv).toContain('returned_to_team');
    });

    it('exports JSON, CSV, and research archive helpers from the feature barrel', () => {
        expect(Object.keys(exportFeature)).toEqual(expect.arrayContaining([
            'arrayToCsv',
            'buildJsonExportPayload',
            'buildCrossSessionResearchExportBundle',
            'buildResearchExportBundle',
            'buildResearchReportHtml',
            'createExportPanel',
            'createResearchExportArchiveBlob',
            'downloadCsv',
            'downloadJson',
            'downloadJsonData',
            'downloadResearchExportArchive',
            'exportActionsCsv',
            'exportAllCsv',
            'exportParticipantsCsv',
            'RESEARCH_EXPORT_FORMAT_REVISION',
            'RESEARCH_EXPORT_SCHEMA_VERSION',
            'exportRequestsCsv',
            'exportSessionActionsCsv',
            'exportSessionParticipantsCsv',
            'exportSessionRequestsCsv',
            'exportSessionTimelineCsv',
            'exportSubset',
            'exportTimelineCsv',
            'exportToJson',
            'openResearchPrintWindow',
            'showExportModal'
        ]));
    });

    it('renders research archive and print controls without adding XLSX or bundled PDF actions', () => {
        const masterHtml = readFileSync(new URL('../../../master.html', import.meta.url), 'utf8');

        expect(masterHtml).toContain('exportResearchArchiveBtn');
        expect(masterHtml).toContain('printResearchReportBtn');
        expect(masterHtml).toContain('exportCrossSessionResearchArchiveBtn');
        expect(masterHtml).toContain('Download Research ZIP');
        expect(masterHtml).toContain('Print Report');
        expect(masterHtml).toContain('Cross-Session ZIP');
        expect(masterHtml).not.toContain('XLSX');
        expect(masterHtml).not.toContain('Download PDF');
    });
});
