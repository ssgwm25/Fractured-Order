export const TRAINING_CURRICULUM_VERSION = '1.0';
export const TRAINING_CONTENT_TEAMS = Object.freeze(['blue', 'red', 'green', 'industry']);
export const TRAINING_CONTENT_ROLES = Object.freeze(['scribe', 'facilitator', 'notetaker']);
export const TRAINING_STAGE_IDS = Object.freeze([
    'orient',
    'show',
    'guide',
    'practice',
    'respond',
    'retrieve',
    'reflect'
]);
export const TRAINING_INTERACTION_TYPES = Object.freeze([
    'module',
    'read',
    'observe',
    'guided_action',
    'practice_action',
    'simulated_response',
    'retrieval_check',
    'reflection'
]);
export const TRAINING_FIXTURE_ID_PREFIX = 'training-fixture:';
export const TRAINING_VISIBLE_FIXTURE_PREFIX = 'TRAINING FIXTURE';
export const TRAINING_FIXTURE_LIMITS = Object.freeze({
    maxCollectionItems: 24,
    maxStringLength: 4000,
    maxFixtureIds: 160
});

const CURRICULUM_ID_PATTERN = /^training\.v1\.(scribe|facilitator|notetaker)\.(blue|red|green|industry)(\.[a-z0-9-]+)?$/;
const IDENTIFIER_KEY_PATTERN = /^(id|.*_id|.*Id|threadId|slideKey|participantKey)$/;
const VISIBLE_ARTIFACT_KEY_PATTERN = /^(goal|title|artifact|visibleLabel|deckLabel|participant_label)$/;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertCondition(condition, message) {
    if (!condition) {
        throw new TypeError(`Invalid training content: ${message}`);
    }
}

function assertString(value, path) {
    assertCondition(typeof value === 'string' && value.trim().length > 0, `${path} must be a non-empty string.`);
    assertCondition(value.length <= TRAINING_FIXTURE_LIMITS.maxStringLength, `${path} exceeds the string bound.`);
}

function assertExactKeys(value, expectedKeys, path) {
    const actual = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    assertCondition(
        JSON.stringify(actual) === JSON.stringify(expected),
        `${path} must contain exactly ${expected.join(', ')}.`
    );
}

function validateSupportedTeams(supportedTeams, path) {
    assertCondition(Array.isArray(supportedTeams) && supportedTeams.length > 0, `${path} must list at least one team.`);
    assertCondition(new Set(supportedTeams).size === supportedTeams.length, `${path} contains duplicate teams.`);
    supportedTeams.forEach((team) => {
        assertCondition(TRAINING_CONTENT_TEAMS.includes(team), `${path} contains unsupported team ${team}.`);
    });
}

function validateInstructionalFields(entry, path, { requireStage = false } = {}) {
    assertCondition(isPlainObject(entry), `${path} must be an object.`);
    assertString(entry.id, `${path}.id`);
    assertCondition(CURRICULUM_ID_PATTERN.test(entry.id), `${path}.id is not stable or versioned.`);
    assertCondition(TRAINING_CONTENT_ROLES.includes(entry.semanticRole), `${path}.semanticRole is unsupported.`);
    validateSupportedTeams(entry.supportedTeams, `${path}.supportedTeams`);
    assertString(entry.learningObjective, `${path}.learningObjective`);
    assertString(entry.coachCopy, `${path}.coachCopy`);
    assertString(entry.narrationScript, `${path}.narrationScript`);
    assertString(entry.targetSelector, `${path}.targetSelector`);
    assertCondition(isPlainObject(entry.accessibleFallbackTarget), `${path}.accessibleFallbackTarget is required.`);
    assertString(entry.accessibleFallbackTarget.selector, `${path}.accessibleFallbackTarget.selector`);
    assertString(entry.accessibleFallbackTarget.label, `${path}.accessibleFallbackTarget.label`);
    assertCondition(TRAINING_INTERACTION_TYPES.includes(entry.interactionType), `${path}.interactionType is unsupported.`);
    assertCondition(isPlainObject(entry.masteryPredicate), `${path}.masteryPredicate is required.`);
    assertString(entry.masteryPredicate.kind, `${path}.masteryPredicate.kind`);
    assertCondition(Array.isArray(entry.fixtureRefs), `${path}.fixtureRefs must be an array.`);
    assertCondition(
        entry.fixtureRefs.length <= TRAINING_FIXTURE_LIMITS.maxCollectionItems,
        `${path}.fixtureRefs exceeds the collection bound.`
    );
    entry.fixtureRefs.forEach((fixtureId, index) => {
        assertCondition(
            typeof fixtureId === 'string' && fixtureId.startsWith(TRAINING_FIXTURE_ID_PREFIX),
            `${path}.fixtureRefs[${index}] must be a training fixture ID.`
        );
    });
    assertString(entry.hint, `${path}.hint`);
    assertString(entry.correctFeedback, `${path}.correctFeedback`);
    assertString(entry.retryFeedback, `${path}.retryFeedback`);
    assertCondition(
        entry.simulatedResponse === null
            || (typeof entry.simulatedResponse === 'string' && entry.simulatedResponse.startsWith(TRAINING_FIXTURE_ID_PREFIX)),
        `${path}.simulatedResponse must be null or a training fixture ID.`
    );

    if (requireStage) {
        assertCondition(TRAINING_STAGE_IDS.includes(entry.stage), `${path}.stage is unsupported.`);
    }
}

export function validateTrainingCurriculum(curriculum) {
    assertCondition(isPlainObject(curriculum), 'curriculum must be an object.');
    assertCondition(curriculum.version === TRAINING_CURRICULUM_VERSION, 'curriculum version is not supported.');
    assertCondition(
        Array.isArray(curriculum.stageOrder)
            && JSON.stringify(curriculum.stageOrder) === JSON.stringify(TRAINING_STAGE_IDS),
        'curriculum.stageOrder must be ordered Orient through Reflect.'
    );
    assertCondition(isPlainObject(curriculum.profiles), 'curriculum.profiles must be an object.');
    assertExactKeys(curriculum.profiles, TRAINING_CONTENT_ROLES, 'curriculum.profiles');

    const modules = [];
    const seenIds = new Set();
    TRAINING_CONTENT_ROLES.forEach((semanticRole) => {
        const roleProfiles = curriculum.profiles[semanticRole];
        assertCondition(isPlainObject(roleProfiles), `profiles.${semanticRole} is missing.`);
        assertExactKeys(roleProfiles, TRAINING_CONTENT_TEAMS, `profiles.${semanticRole}`);

        TRAINING_CONTENT_TEAMS.forEach((team) => {
            const module = roleProfiles[team];
            const path = `profiles.${semanticRole}.${team}`;
            validateInstructionalFields(module, path);
            assertCondition(module.semanticRole === semanticRole, `${path}.semanticRole does not match its key.`);
            assertCondition(module.supportedTeams.length === 1 && module.supportedTeams[0] === team, `${path} must be team-specific.`);
            assertCondition(Array.isArray(module.steps), `${path}.steps must be an array.`);
            assertCondition(module.steps.length === TRAINING_STAGE_IDS.length, `${path} must contain seven stages.`);

            const stages = module.steps.map((step, index) => {
                const stepPath = `${path}.steps[${index}]`;
                validateInstructionalFields(step, stepPath, { requireStage: true });
                assertCondition(step.semanticRole === semanticRole, `${stepPath}.semanticRole does not match its module.`);
                assertCondition(step.supportedTeams.length === 1 && step.supportedTeams[0] === team, `${stepPath} must be team-specific.`);
                assertCondition(!seenIds.has(step.id), `${stepPath}.id is duplicated.`);
                seenIds.add(step.id);
                return step.stage;
            });
            assertCondition(
                JSON.stringify(stages) === JSON.stringify(TRAINING_STAGE_IDS),
                `${path} stages must be ordered Orient through Reflect.`
            );
            assertCondition(!seenIds.has(module.id), `${path}.id is duplicated.`);
            seenIds.add(module.id);
            modules.push(module);
        });
    });

    assertCondition(modules.length === 12, 'curriculum must enumerate exactly 12 profiles.');
    return curriculum;
}

function validateFixtureNode(value, path, state, key = '') {
    assertCondition(typeof value !== 'function', `${path} cannot contain executable functions.`);

    if (typeof value === 'string') {
        assertCondition(value.length <= TRAINING_FIXTURE_LIMITS.maxStringLength, `${path} exceeds the string bound.`);
        if (IDENTIFIER_KEY_PATTERN.test(key) && value) {
            assertCondition(value.startsWith(TRAINING_FIXTURE_ID_PREFIX), `${path} must use the training fixture namespace.`);
        }
        if (VISIBLE_ARTIFACT_KEY_PATTERN.test(key) && value) {
            assertCondition(value.startsWith(TRAINING_VISIBLE_FIXTURE_PREFIX), `${path} must visibly identify training data.`);
        }
        return;
    }

    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
        return;
    }

    if (Array.isArray(value)) {
        assertCondition(value.length <= TRAINING_FIXTURE_LIMITS.maxCollectionItems, `${path} exceeds the collection bound.`);
        value.forEach((entry, index) => validateFixtureNode(entry, `${path}[${index}]`, state));
        return;
    }

    assertCondition(isPlainObject(value), `${path} contains an unsupported value.`);
    Object.entries(value).forEach(([childKey, childValue]) => {
        if (childKey === 'id' && typeof childValue === 'string') {
            assertCondition(!state.ids.has(childValue), `${path}.id duplicates ${childValue}.`);
            state.ids.add(childValue);
        }
        validateFixtureNode(childValue, `${path}.${childKey}`, state, childKey);
    });
}

export function validateTrainingFixtureCatalog(catalog) {
    assertCondition(isPlainObject(catalog), 'fixture catalog must be an object.');
    assertCondition(catalog.version === TRAINING_CURRICULUM_VERSION, 'fixture catalog version is not supported.');
    assertCondition(isPlainObject(catalog.strategicOrientations), 'strategic orientation fixtures are missing.');
    assertCondition(isPlainObject(catalog.artifacts), 'artifact fixtures are missing.');
    assertCondition(isPlainObject(catalog.counterparts), 'counterpart fixtures are missing.');

    TRAINING_CONTENT_TEAMS.forEach((team) => {
        assertCondition(isPlainObject(catalog.strategicOrientations[team]), `strategic orientation fixture ${team} is missing.`);
        assertCondition(isPlainObject(catalog.artifacts[team]), `artifact fixture ${team} is missing.`);
    });

    const state = { ids: new Set() };
    validateFixtureNode(catalog, 'fixtures', state);
    assertCondition(state.ids.size <= TRAINING_FIXTURE_LIMITS.maxFixtureIds, 'fixture ID count exceeds the catalog bound.');
    return catalog;
}

export function deepFreezeTrainingContent(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
        return value;
    }

    Object.values(value).forEach((entry) => deepFreezeTrainingContent(entry));
    return Object.freeze(value);
}
