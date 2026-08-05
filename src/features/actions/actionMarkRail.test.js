import { describe, expect, it } from 'vitest';

import { groupActionRecordsByMark } from './actionMarkRail.js';
import { serializeStrategicOrientationDetails } from './strategicOrientationDetails.js';

describe('action mark rail grouping', () => {
    it('always exposes Strategic Orientation and Moves 1-3 with counts and zero states', () => {
        const groups = groupActionRecordsByMark([{
            id: 'move-1-old',
            move: 1,
            updated_at: '2026-08-05T10:00:00.000Z'
        }, {
            id: 'move-1-new',
            move: 1,
            updated_at: '2026-08-05T11:00:00.000Z'
        }, {
            id: 'orientation-blue',
            move: 1,
            mechanism: 'Strategic Orientation',
            updated_at: '2026-08-05T09:00:00.000Z',
            ally_contingencies: serializeStrategicOrientationDetails({
                artifactType: 'selection',
                team: 'blue',
                orientation: 'pressure'
            })
        }]);

        expect(groups.map(({ key, label, count }) => ({ key, label, count }))).toEqual([
            { key: 'strategic-orientation', label: 'Strategic Orientation', count: 1 },
            { key: 'move-1', label: 'Move 1', count: 2 },
            { key: 'move-2', label: 'Move 2', count: 0 },
            { key: 'move-3', label: 'Move 3', count: 0 }
        ]);
        expect(groups[1].records.map((record) => record.id)).toEqual([
            'move-1-new',
            'move-1-old'
        ]);
        expect(groups[2].records).toEqual([]);
    });
});
