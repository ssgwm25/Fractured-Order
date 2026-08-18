export const TRAINING_CURRICULUM_VERSION = '2.0';
export const TRAINING_CONTENT_TEAMS = Object.freeze(['blue', 'red', 'green', 'industry']);
export const TRAINING_CONTENT_ROLES = Object.freeze(['scribe', 'facilitator', 'notetaker']);
export const TRAINING_ACTION_IDS_BY_ROLE = Object.freeze({
    scribe: Object.freeze([
        'complete-orientation',
        'review-worked-artifact',
        'create-draft',
        'forward-artifact',
        'revise-returned-artifact',
        'verify-handoff'
    ]),
    facilitator: Object.freeze([
        'review-forwarded-artifact',
        'project-artifact',
        'create-revise-rfi',
        'read-and-communicate',
        'submit-artifact',
        'verify-receipt'
    ]),
    notetaker: Object.freeze([
        'save-observation',
        'capture-moment-and-quote',
        'save-dynamics-and-alliances',
        'respond-to-inbox',
        'review-action-and-timeline',
        'verify-explanatory-record'
    ])
});
export const TRAINING_TARGET_TYPES = Object.freeze(['control', 'read_only_receipt']);
export const TRAINING_FIXTURE_ID_PREFIX = 'training-fixture:';
export const TRAINING_VISIBLE_FIXTURE_PREFIX = 'TRAINING FIXTURE';
export const TRAINING_FIXTURE_LIMITS = Object.freeze({
    maxCollectionItems: 24,
    maxStringLength: 4000,
    maxFixtureIds: 160
});
export const TRAINING_COPY_LIMITS = Object.freeze({
    actionTitle: 56,
    instruction: 180,
    successMessage: 160,
    recoveryHint: 180,
    narrationScript: 180,
    selector: 160,
    eventName: 96,
    openAction: 96
});

const CURRICULUM_ID_PATTERN = /^training\.v2\.(scribe|facilitator|notetaker)\.(blue|red|green|industry)(\.[a-z0-9-]+)?$/;
const ACTION_OR_EVENT_PATTERN = /^(scribe|facilitator|notetaker)\.[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const ACTION_HEADING_VERBS = new Set([
    'capture', 'complete', 'create', 'forward', 'open', 'project', 'read',
    'respond', 'review', 'revise', 'save', 'submit', 'verify'
]);
const GENERIC_STAGE_LABELS = new Set([
    'orient', 'show', 'guide', 'practice', 'respond', 'retrieve', 'reflect',
    'see it', 'follow along', 'try it', 'check understanding',
    'reflect and finish', 'learning activity'
]);
const BROAD_TARGETS = new Set(['main', 'body', '#main-content']);
const BROAD_TARGET_PATTERN = /^#[a-z0-9_-]*(section|list|panel)$/i;
const IDENTIFIER_KEY_PATTERN = /^(id|.*_id|.*Id|threadId|slideKey|participantKey)$/;
const VISIBLE_ARTIFACT_KEY_PATTERN = /^(goal|title|artifact|visibleLabel|deckLabel|participant_label)$/;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertCondition(condition, message) {
    if (!condition) throw new TypeError(`Invalid training content: ${message}`);
}

function assertString(value, path, maxLength = TRAINING_FIXTURE_LIMITS.maxStringLength) {
    assertCondition(typeof value === 'string' && value.trim().length > 0, `${path} must be a non-empty string.`);
    assertCondition(value.length <= maxLength, `${path} exceeds the ${maxLength}-character bound.`);
}

function assertOptionalString(value, path, maxLength) {
    if (value === undefined || value === null) return;
    assertString(value, path, maxLength);
}

function assertSingleSentence(value, path) {
    assertCondition(!/[\r\n]/.test(value), `${path} must be one supporting sentence.`);
    assertCondition(!/[.!?]\s+\S/.test(value.trim()), `${path} must contain at most one sentence.`);
}

function assertExactKeys(value, expectedKeys, path) {
    const actual = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    assertCondition(JSON.stringify(actual) === JSON.stringify(expected), `${path} must contain exactly ${expected.join(', ')}.`);
}

function validateSupportedTeams(supportedTeams, path) {
    assertCondition(Array.isArray(supportedTeams) && supportedTeams.length > 0, `${path} must list at least one team.`);
    assertCondition(new Set(supportedTeams).size === supportedTeams.length, `${path} contains duplicate teams.`);
    supportedTeams.forEach((team) => {
        assertCondition(TRAINING_CONTENT_TEAMS.includes(team), `${path} contains unsupported team ${team}.`);
    });
}

function validateFixtureRefs(fixtureRefs, path) {
    assertCondition(Array.isArray(fixtureRefs), `${path} must be an array.`);
    assertCondition(fixtureRefs.length <= TRAINING_FIXTURE_LIMITS.maxCollectionItems, `${path} exceeds the collection bound.`);
    fixtureRefs.forEach((fixtureId, index) => {
        assertCondition(
            typeof fixtureId === 'string' && fixtureId.startsWith(TRAINING_FIXTURE_ID_PREFIX),
            `${path}[${index}] must be a training fixture ID.`
        );
    });
}

function isBroadTargetSelector(selector) {
    return BROAD_TARGETS.has(selector)
        || BROAD_TARGET_PATTERN.test(selector)
        || selector === '.header-game-state'
        || selector === '.sidebar-session';
}

function validateActionStep(step, path, role, team, expectedActionId) {
    assertCondition(isPlainObject(step), `${path} must be an object.`);
    assertString(step.id, `${path}.id`);
    assertCondition(CURRICULUM_ID_PATTERN.test(step.id), `${path}.id is not stable or versioned.`);
    assertCondition(step.semanticRole === role, `${path}.semanticRole does not match its module.`);
    assertCondition(step.supportedTeams?.length === 1 && step.supportedTeams[0] === team, `${path} must be team-specific.`);
    assertCondition(step.actionId === expectedActionId, `${path}.actionId is missing or out of order.`);

    assertString(step.actionTitle, `${path}.actionTitle`, TRAINING_COPY_LIMITS.actionTitle);
    const normalizedTitle = step.actionTitle.trim().toLowerCase();
    assertCondition(!GENERIC_STAGE_LABELS.has(normalizedTitle), `${path}.actionTitle uses a generic stage label.`);
    assertCondition(ACTION_HEADING_VERBS.has(normalizedTitle.split(/\s+/)[0]), `${path}.actionTitle must be a short imperative action heading.`);
    assertCondition(!/[.!?]$/.test(step.actionTitle.trim()), `${path}.actionTitle must not be a sentence.`);

    assertString(step.instruction, `${path}.instruction`, TRAINING_COPY_LIMITS.instruction);
    assertSingleSentence(step.instruction, `${path}.instruction`);
    assertString(step.successMessage, `${path}.successMessage`, TRAINING_COPY_LIMITS.successMessage);
    assertSingleSentence(step.successMessage, `${path}.successMessage`);
    assertOptionalString(step.recoveryHint, `${path}.recoveryHint`, TRAINING_COPY_LIMITS.recoveryHint);
    if (step.recoveryHint) assertSingleSentence(step.recoveryHint, `${path}.recoveryHint`);
    assertOptionalString(step.narrationScript, `${path}.narrationScript`, TRAINING_COPY_LIMITS.narrationScript);
    if (step.narrationScript) assertSingleSentence(step.narrationScript, `${path}.narrationScript`);

    assertString(step.targetSelector, `${path}.targetSelector`, TRAINING_COPY_LIMITS.selector);
    assertCondition(!step.targetSelector.includes(','), `${path}.targetSelector must name one target.`);
    assertCondition(TRAINING_TARGET_TYPES.includes(step.targetType), `${path}.targetType is unsupported.`);
    assertCondition(
        step.targetType !== 'read_only_receipt' || step.actionId.startsWith('verify-'),
        `${path}.targetType may be read_only_receipt only for receipt verification.`
    );
    assertCondition(
        step.targetType === 'read_only_receipt' || !isBroadTargetSelector(step.targetSelector),
        `${path}.targetSelector is too broad for an interactive action.`
    );

    assertString(step.expectedTrainingEvent, `${path}.expectedTrainingEvent`, TRAINING_COPY_LIMITS.eventName);
    assertCondition(ACTION_OR_EVENT_PATTERN.test(step.expectedTrainingEvent), `${path}.expectedTrainingEvent is invalid.`);
    assertCondition(step.expectedTrainingEvent.startsWith(`${role}.`), `${path}.expectedTrainingEvent belongs to another role.`);
    assertOptionalString(step.openAction, `${path}.openAction`, TRAINING_COPY_LIMITS.openAction);
    if (step.openAction) {
        assertCondition(ACTION_OR_EVENT_PATTERN.test(step.openAction), `${path}.openAction is invalid.`);
        assertCondition(step.openAction.startsWith(`${role}.`), `${path}.openAction belongs to another role.`);
    }
    validateFixtureRefs(step.fixtureRefs, `${path}.fixtureRefs`);
}

export function validateTrainingCurriculum(curriculum) {
    assertCondition(isPlainObject(curriculum), 'curriculum must be an object.');
    assertCondition(curriculum.version === TRAINING_CURRICULUM_VERSION, 'curriculum version is not supported.');
    assertCondition(isPlainObject(curriculum.actionOrderByRole), 'curriculum.actionOrderByRole must be an object.');
    assertExactKeys(curriculum.actionOrderByRole, TRAINING_CONTENT_ROLES, 'curriculum.actionOrderByRole');
    TRAINING_CONTENT_ROLES.forEach((role) => {
        assertCondition(
            JSON.stringify(curriculum.actionOrderByRole[role]) === JSON.stringify(TRAINING_ACTION_IDS_BY_ROLE[role]),
            `curriculum.actionOrderByRole.${role} is missing or out of order.`
        );
    });
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
            assertCondition(isPlainObject(module), `${path} must be an object.`);
            assertString(module.id, `${path}.id`);
            assertCondition(CURRICULUM_ID_PATTERN.test(module.id), `${path}.id is not stable or versioned.`);
            assertCondition(module.semanticRole === semanticRole, `${path}.semanticRole does not match its key.`);
            validateSupportedTeams(module.supportedTeams, `${path}.supportedTeams`);
            assertCondition(module.supportedTeams.length === 1 && module.supportedTeams[0] === team, `${path} must be team-specific.`);
            assertString(module.title, `${path}.title`, TRAINING_COPY_LIMITS.actionTitle);
            assertString(module.summary, `${path}.summary`, TRAINING_COPY_LIMITS.instruction);
            assertSingleSentence(module.summary, `${path}.summary`);
            assertOptionalString(module.narrationScript, `${path}.narrationScript`, TRAINING_COPY_LIMITS.narrationScript);
            if (module.narrationScript) assertSingleSentence(module.narrationScript, `${path}.narrationScript`);
            validateFixtureRefs(module.fixtureRefs, `${path}.fixtureRefs`);
            assertCondition(Array.isArray(module.steps), `${path}.steps must be an array.`);

            const expectedActionIds = TRAINING_ACTION_IDS_BY_ROLE[semanticRole];
            assertCondition(module.steps.length === expectedActionIds.length, `${path} must contain six native actions.`);
            const seenTitles = new Set();
            const seenEvents = new Set();
            module.steps.forEach((step, index) => {
                const stepPath = `${path}.steps[${index}]`;
                validateActionStep(step, stepPath, semanticRole, team, expectedActionIds[index]);
                assertCondition(!seenIds.has(step.id), `${stepPath}.id is duplicated.`);
                assertCondition(!seenTitles.has(step.actionTitle), `${stepPath}.actionTitle duplicates another action.`);
                assertCondition(!seenEvents.has(step.expectedTrainingEvent), `${stepPath}.expectedTrainingEvent is duplicated.`);
                seenIds.add(step.id);
                seenTitles.add(step.actionTitle);
                seenEvents.add(step.expectedTrainingEvent);
            });
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
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return;
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
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach((entry) => deepFreezeTrainingContent(entry));
    return Object.freeze(value);
}
