import { describe, expect, it } from 'vitest';

import { TRAINING_CURRICULUM } from './curriculum.js';
import { TRAINING_FIXTURE_CATALOG } from './fixtures.js';
import {
    TRAINING_COPY_LIMITS,
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
        ['actionTitle', 'actionTitle'],
        ['instruction', 'instruction'],
        ['targetSelector', 'targetSelector'],
        ['targetType', 'targetType'],
        ['expectedTrainingEvent', 'expectedTrainingEvent'],
        ['successMessage', 'successMessage']
    ])('rejects a step missing %s', (field, expectedMessage) => {
        const curriculum = clone(TRAINING_CURRICULUM);
        delete curriculum.profiles.scribe.blue.steps[0][field];
        expect(() => validateTrainingCurriculum(curriculum)).toThrow(expectedMessage);
    });

    it('rejects missing, reordered, or duplicated native actions', () => {
        const incomplete = clone(TRAINING_CURRICULUM);
        incomplete.profiles.scribe.blue.steps.pop();
        expect(() => validateTrainingCurriculum(incomplete)).toThrow(/six native actions/);

        const reordered = clone(TRAINING_CURRICULUM);
        [reordered.profiles.scribe.blue.steps[0], reordered.profiles.scribe.blue.steps[1]] = [
            reordered.profiles.scribe.blue.steps[1],
            reordered.profiles.scribe.blue.steps[0]
        ];
        expect(() => validateTrainingCurriculum(reordered)).toThrow(/actionId is missing or out of order/);

        const duplicateTitle = clone(TRAINING_CURRICULUM);
        duplicateTitle.profiles.scribe.blue.steps[1].actionTitle = duplicateTitle.profiles.scribe.blue.steps[0].actionTitle;
        expect(() => validateTrainingCurriculum(duplicateTitle)).toThrow(/actionTitle duplicates another action/);

        const duplicateEvent = clone(TRAINING_CURRICULUM);
        duplicateEvent.profiles.scribe.blue.steps[1].expectedTrainingEvent = duplicateEvent.profiles.scribe.blue.steps[0].expectedTrainingEvent;
        expect(() => validateTrainingCurriculum(duplicateEvent)).toThrow(/expectedTrainingEvent is duplicated/);
    });

    it('rejects generic labels, excessive copy, and multi-sentence instructions', () => {
        const generic = clone(TRAINING_CURRICULUM);
        generic.profiles.scribe.blue.steps[0].actionTitle = 'Orient';
        expect(() => validateTrainingCurriculum(generic)).toThrow(/generic stage label/);

        const excessive = clone(TRAINING_CURRICULUM);
        excessive.profiles.scribe.blue.steps[0].instruction = 'x'.repeat(TRAINING_COPY_LIMITS.instruction + 1);
        expect(() => validateTrainingCurriculum(excessive)).toThrow(/character bound/);

        const duplicatedInstruction = clone(TRAINING_CURRICULUM);
        duplicatedInstruction.profiles.scribe.blue.steps[0].instruction = 'Complete the form. Then press a coach button.';
        expect(() => validateTrainingCurriculum(duplicatedInstruction)).toThrow(/at most one sentence/);

        const secondNarratedInstruction = clone(TRAINING_CURRICULUM);
        secondNarratedInstruction.profiles.scribe.blue.steps[0].narrationScript = 'Complete the form. Open another workspace.';
        expect(() => validateTrainingCurriculum(secondNarratedInstruction)).toThrow(/at most one sentence/);
    });

    it('rejects missing or cross-role events and broad interactive targets', () => {
        const crossRole = clone(TRAINING_CURRICULUM);
        crossRole.profiles.scribe.blue.steps[0].expectedTrainingEvent = 'facilitator.orientation.forwarded';
        expect(() => validateTrainingCurriculum(crossRole)).toThrow(/belongs to another role/);

        const broad = clone(TRAINING_CURRICULUM);
        broad.profiles.scribe.blue.steps[0].targetSelector = 'main';
        expect(() => validateTrainingCurriculum(broad)).toThrow(/too broad/);

        const broadSection = clone(TRAINING_CURRICULUM);
        broadSection.profiles.scribe.blue.steps[0].targetSelector = '#actionsSection';
        expect(() => validateTrainingCurriculum(broadSection)).toThrow(/too broad/);

        const selectorList = clone(TRAINING_CURRICULUM);
        selectorList.profiles.scribe.blue.steps[0].targetSelector = '#one, #two';
        expect(() => validateTrainingCurriculum(selectorList)).toThrow(/one target/);
    });

    it('rejects the retired curriculum version instead of relabeling old mastery', () => {
        const retired = clone(TRAINING_CURRICULUM);
        retired.version = '1.0';
        expect(() => validateTrainingCurriculum(retired)).toThrow(/version is not supported/);
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
