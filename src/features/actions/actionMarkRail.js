import { isStrategicOrientationAction } from './strategicOrientationDetails.js';

export const ACTION_MARKS = Object.freeze([
    Object.freeze({ key: 'strategic-orientation', label: 'Strategic Orientation', move: null }),
    Object.freeze({ key: 'move-1', label: 'Move 1', move: 1 }),
    Object.freeze({ key: 'move-2', label: 'Move 2', move: 2 }),
    Object.freeze({ key: 'move-3', label: 'Move 3', move: 3 })
]);

function getRecordTimestamp(record = {}) {
    const timestamp = record.submitted_at
        || record.updated_at
        || record.created_at
        || '';
    const parsed = new Date(timestamp).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

export function getActionMarkKey(record = {}) {
    if (isStrategicOrientationAction(record)) {
        return 'strategic-orientation';
    }

    const move = Number.parseInt(record?.move, 10);
    return [1, 2, 3].includes(move) ? `move-${move}` : null;
}

export function sortActionMarkRecordsNewestFirst(records = []) {
    return [...records].filter(Boolean).sort((left, right) => (
        getRecordTimestamp(right) - getRecordTimestamp(left)
        || String(right?.id || '').localeCompare(String(left?.id || ''))
    ));
}

export function groupActionRecordsByMark(records = []) {
    const recordsByMark = new Map(ACTION_MARKS.map((mark) => [mark.key, []]));

    sortActionMarkRecordsNewestFirst(records).forEach((record) => {
        const key = getActionMarkKey(record);
        if (key && recordsByMark.has(key)) {
            recordsByMark.get(key).push(record);
        }
    });

    return ACTION_MARKS.map((mark) => ({
        ...mark,
        records: recordsByMark.get(mark.key),
        count: recordsByMark.get(mark.key).length
    }));
}
