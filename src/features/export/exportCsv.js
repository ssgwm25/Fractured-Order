/**
 * CSV Export Utility
 * Exports game data to CSV format
 */

import { actionsStore, requestsStore, timelineStore, participantsStore } from '../../stores/index.js';

/**
 * Convert array of objects to CSV string
 * @param {Array<Object>} data - Data to convert
 * @param {Array<string>} columns - Column names to include
 * @returns {string} CSV string
 */
export function arrayToCsv(data, columns) {
    if (!data || data.length === 0) {
        return columns.join(',');
    }

    const header = columns.join(',');
    const rows = data.map(item => {
        return columns.map(col => {
            const value = item[col];
            if (value === null || value === undefined) {
                return '';
            }
            if (Array.isArray(value)) {
                const serialized = value.join('; ');
                return `"${serialized.replace(/"/g, '""')}"`;
            }
            if (typeof value === 'object') {
                return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
            }
            // Escape quotes and wrap in quotes if contains comma or newline
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        }).join(',');
    });

    return [header, ...rows].join('\n');
}

export function exportSessionActionsCsv(actions = []) {
    const columns = [
        'id',
        'team',
        'move',
        'phase',
        'mechanism',
        'sector',
        'exposure_type',
        'targets',
        'goal',
        'expected_outcomes',
        'ally_contingencies',
        'priority',
        'status',
        'outcome',
        'adjudication_notes',
        'created_at',
        'submitted_at',
        'adjudicated_at',
        'updated_at'
    ];

    return arrayToCsv(actions, columns);
}

export function exportSessionRequestsCsv(requests = []) {
    const columns = [
        'id',
        'team',
        'move',
        'phase',
        'priority',
        'categories',
        'query',
        'status',
        'response',
        'responded_by',
        'responded_at',
        'created_at'
    ];

    return arrayToCsv(requests, columns);
}

export function exportSessionTimelineCsv(timeline = []) {
    const columns = [
        'id',
        'type',
        'team',
        'move',
        'phase',
        'category',
        'content',
        'faction_tag',
        'debate_marker',
        'created_at'
    ];

    return arrayToCsv(timeline, columns);
}

export function exportSessionParticipantsCsv(participants = []) {
    const columns = [
        'id',
        'display_name',
        'role',
        'is_active',
        'joined_at',
        'heartbeat_at',
        'disconnected_at',
        'client_id'
    ];

    return arrayToCsv(participants, columns);
}

/**
 * Export actions to CSV
 * @returns {string} CSV string
 */
export function exportActionsCsv() {
    const actions = actionsStore.getAll();
    const columns = [
        'id',
        'team_id',
        'move_number',
        'phase',
        'action_type',
        'title',
        'description',
        'resources_allocated',
        'target_team',
        'status',
        'adjudication_outcome',
        'adjudication_notes',
        'created_at',
        'updated_at'
    ];
    return arrayToCsv(actions, columns);
}

/**
 * Export RFIs to CSV
 * @returns {string} CSV string
 */
export function exportRequestsCsv() {
    const requests = requestsStore.getAll();
    const columns = [
        'id',
        'team_id',
        'move_number',
        'question',
        'context',
        'priority',
        'status',
        'response',
        'responded_by',
        'created_at',
        'responded_at'
    ];
    return arrayToCsv(requests, columns);
}

/**
 * Export timeline to CSV
 * @returns {string} CSV string
 */
export function exportTimelineCsv() {
    const timeline = timelineStore.getAll();
    const columns = [
        'id',
        'type',
        'move',
        'phase',
        'content',
        'team',
        'category',
        'faction_tag',
        'debate_marker',
        'created_at'
    ];
    return arrayToCsv(timeline, columns);
}

/**
 * Export participants to CSV
 * @returns {string} CSV string
 */
export function exportParticipantsCsv() {
    const participants = participantsStore.getAll();
    const columns = [
        'id',
        'user_name',
        'role',
        'team_id',
        'is_active',
        'heartbeat_at',
        'joined_at'
    ];
    return arrayToCsv(participants, columns);
}

/**
 * Download CSV file
 * @param {string} csvContent - CSV string
 * @param {string} filename - Output filename
 */
export function downloadCsv(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Export all data as multiple CSV files (returns as object)
 * @returns {Object} Object with CSV strings keyed by type
 */
export function exportAllCsv() {
    return {
        actions: exportActionsCsv(),
        requests: exportRequestsCsv(),
        timeline: exportTimelineCsv(),
        participants: exportParticipantsCsv()
    };
}
