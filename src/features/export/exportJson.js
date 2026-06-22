/**
 * JSON Export Utility
 * Exports game data to JSON format
 */

import { actionsStore, requestsStore, timelineStore, gameStateStore, participantsStore } from '../../stores/index.js';

export function buildJsonExportPayload({
    session = null,
    gameState = null,
    actions = [],
    requests = [],
    timeline = [],
    participants = [],
    exportedAt = new Date().toISOString(),
    version = '2.0.0'
} = {}) {
    return {
        exportedAt,
        version,
        session,
        gameState,
        actions,
        requests,
        timeline,
        participants
    };
}

export function downloadJsonData(data, filename = 'esg-export.json') {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
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
 * Export all game data to JSON
 * @param {Object} options - Export options
 * @param {boolean} options.includeActions - Include actions data
 * @param {boolean} options.includeRequests - Include RFI data
 * @param {boolean} options.includeTimeline - Include timeline data
 * @param {boolean} options.includeParticipants - Include participant data
 * @param {boolean} options.includeGameState - Include game state
 * @param {boolean} options.prettyPrint - Format with indentation
 * @returns {string} JSON string
 */
export function exportToJson(options = {}) {
    const {
        includeActions = true,
        includeRequests = true,
        includeTimeline = true,
        includeParticipants = true,
        includeGameState = true,
        prettyPrint = true
    } = options;

    const exportData = {
        exportedAt: new Date().toISOString(),
        version: '2.0.0'
    };

    if (includeGameState) {
        exportData.gameState = gameStateStore.getState();
    }

    if (includeActions) {
        exportData.actions = actionsStore.getAll();
    }

    if (includeRequests) {
        exportData.requests = requestsStore.getAll();
    }

    if (includeTimeline) {
        exportData.timeline = timelineStore.getAll();
    }

    if (includeParticipants) {
        exportData.participants = participantsStore.getAll();
    }

    return prettyPrint
        ? JSON.stringify(exportData, null, 2)
        : JSON.stringify(exportData);
}

/**
 * Download JSON export as file
 * @param {string} filename - Output filename
 * @param {Object} options - Export options
 */
export function downloadJson(filename = 'esg-export.json', options = {}) {
    const json = exportToJson(options);
    downloadJsonData(JSON.parse(json), filename);
}

/**
 * Export specific data subset
 * @param {string} dataType - Type of data to export
 * @returns {string} JSON string
 */
export function exportSubset(dataType) {
    let data;

    switch (dataType) {
        case 'actions':
            data = actionsStore.getAll();
            break;
        case 'requests':
            data = requestsStore.getAll();
            break;
        case 'timeline':
            data = timelineStore.getAll();
            break;
        case 'participants':
            data = participantsStore.getAll();
            break;
        case 'gameState':
            data = gameStateStore.getState();
            break;
        default:
            throw new Error(`Unknown data type: ${dataType}`);
    }

    return JSON.stringify({
        type: dataType,
        exportedAt: new Date().toISOString(),
        data
    }, null, 2);
}
