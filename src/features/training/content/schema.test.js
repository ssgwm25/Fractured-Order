import { describe, expect, it } from 'vitest';

import { TRAINING_CURRICULUM } from './curriculum.js';
import { TRAINING_FIXTURE_CATALOG } from './fixtures.js';
import {
    validateTrainingCurriculum,
    validateTrainingFixtureCatalog
} from './schema.js';

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

describe('training content schema', () => {
    it('accepts the import-time validated curriculum and fixture catalog', () => {
        expect(validateTrainingCurriculum(clone(TRAINING_CURRICULUM))).toBeTruthy();
        expect(validateTrainingFixtureCatalog(clone(TRAINING_FIXTURE_CATALOG))).toBeTruthy();
    });

    it.each([
        ['narrationScript', 'narrationScript'],
        ['masteryPredicate', 'masteryPredicate'],
        ['targetSelector', 'targetSelector'],
        ['accessibleFallbackTarget', 'accessibleFallbackTarget']
    ])('rejects a step missing %s metadata', (field, expectedMessage) => {
        const curriculum = clone(TRAINING_CURRICULUM);
        const step = curriculum.profiles.scribe.blue.steps[0];
        delete step[field];

        expect(() => validateTrainingCurriculum(curriculum)).toThrow(expectedMessage);
    });

    it('rejects an incomplete or reordered seven-stage path', () => {
        const incomplete = clone(TRAINING_CURRICULUM);
        incomplete.profiles.scribe.blue.steps.pop();
        expect(() => validateTrainingCurriculum(incomplete)).toThrow(/seven stages/);

        const reordered = clone(TRAINING_CURRICULUM);
        [reordered.profiles.scribe.blue.steps[0], reordered.profiles.scribe.blue.steps[1]] = [
            reordered.profiles.scribe.blue.steps[1],
            reordered.profiles.scribe.blue.steps[0]
        ];
        expect(() => validateTrainingCurriculum(reordered)).toThrow(/ordered Orient through Reflect/);
    });

    it('rejects role or team branches outside the locked 12-profile scope', () => {
        const extraRole = clone(TRAINING_CURRICULUM);
        extraRole.profiles.operator = {};
        expect(() => validateTrainingCurriculum(extraRole)).toThrow(/exactly facilitator, notetaker, scribe/);

        const extraTeam = clone(TRAINING_CURRICULUM);
        extraTeam.profiles.scribe.white_cell = clone(extraTeam.profiles.scribe.blue);
        expect(() => validateTrainingCurriculum(extraTeam)).toThrow(/exactly blue, green, industry, red/);
    });

    it('rejects unbounded, executable, or non-namespaced fixture data', () => {
        const unbounded = clone(TRAINING_FIXTURE_CATALOG);
        unbounded.counterparts.injects = Array.from({ length: 25 }, (_, index) => ({
            id: `training-fixture:overflow:${index}`
        }));
        expect(() => validateTrainingFixtureCatalog(unbounded)).toThrow(/collection bound/);

        const nonNamespaced = clone(TRAINING_FIXTURE_CATALOG);
        nonNamespaced.artifacts.blue.id = 'live-artifact-id';
        expect(() => validateTrainingFixtureCatalog(nonNamespaced)).toThrow(/training fixture namespace/);

        const executable = clone(TRAINING_FIXTURE_CATALOG);
        executable.counterparts.injects[0].generator = () => 'not allowed';
        expect(() => validateTrainingFixtureCatalog(executable)).toThrow(/executable functions/);
    });
});
