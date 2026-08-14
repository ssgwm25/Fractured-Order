# Cross-team Action Notification Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Green, Industry, or Red receive a notification about another team's action, both role surfaces (`scribe.js` and `facilitator.js`) show it in a dedicated, clearly-labeled place that states the source team and makes explicit that no response is needed — instead of today's generic "White Cell Communication" / plain chat bubble.

**Architecture:** Two existing delivery paths (`ACTION_NOTIFICATION` communications from the Blue/Red "Teams to inform" flow, and `GUIDANCE` communications from White Cell's "Share with Red Team" button) already share a `source_team` / `shared_action_id` metadata vocabulary. A new shared detector (`isActionNotificationCommunication`) identifies both. `scribe.js` gets a new sidebar tab/deck section with its own read-only slide type. `facilitator.js` gets a new tab in its existing tabbed response list. The Red-team path and the underlying SQL RPC are both enriched so all three recipient teams have the same `action_snapshot` (including the action's title) available to render from.

**Tech Stack:** Vanilla JS role controllers (`src/roles/*.js`), Vitest unit tests, hand-written SQL migrations applied to Supabase (`data/*.sql`), plain CSS (no framework).

## Global Constraints

- No `title` column exists on the `actions` table — only `goal`. Any SQL or JS that resolves an action's display title must use `goal`, never reference `action.title` as a database column.
- `action.artifact_payload.action` (the "details" object) may be absent for legacy actions that only populated `ally_contingencies`; always fall back to `parseBlueActionDetails(action.ally_contingencies)`.
- Badge components (`createBadge`) only accept variants: `'default'`, `'primary'`, `'success'`, `'warning'`, `'error'`, `'info'`. Use `'default'` for the informational badge — `'neutral'` is not a valid variant.
- Team color tokens already exist for all four teams in both light and dark mode: `--color-team-blue`, `--color-team-green`, `--color-team-red`, `--color-team-industry` (`styles/base/variables.css`). Do not add new color tokens.
- Every new/changed communication in this feature must carry `metadata.shared_action_id` — it is the field `isActionNotificationCommunication` keys off.
- `scribe.html` is duplicated per team (`teams/blue`, `teams/red`, `teams/green`, `teams/industry`) and the relevant markup block is byte-identical across all four today; any HTML edit must be applied to all four files identically.

---

### Task 1: SQL migration — include the action title in the notification snapshot

**Files:**
- Create: `data/2026-08-14_action_notification_title_snapshot.sql`
- Modify: `src/services/database.migration.contract.test.js`
- Modify: `docs/supabase-setup.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the `operator_complete_action_with_notifications` RPC now writes `action_snapshot.title` into every `ACTION_NOTIFICATION` communication's metadata. Later tasks (5, 9) read `metadata.action_snapshot.title` as the action's display title.

- [ ] **Step 1: Write the failing contract test**

Add this test in `src/services/database.migration.contract.test.js`, immediately after the existing `it('atomically completes actions and informs only authored Green or Industry recipients', ...)` test block (the one that reads `ACTION_NOTIFICATION_DELIVERY_PATH`):

```js
    it('includes the action title in the atomic notification snapshot', () => {
        const sql = normalizeLineEndings(readFileSync(ACTION_NOTIFICATION_TITLE_SNAPSHOT_PATH, 'utf8'));
        const functionBody = extractFunctionBody(sql, 'operator_complete_action_with_notifications');

        expect(functionBody).toContain("'action_snapshot', COALESCE(action_row.artifact_payload -> 'action', '{}'::jsonb)");
        expect(functionBody).toContain("COALESCE(NULLIF(BTRIM(action_row.goal), ''), 'Untitled action')");
        expect(sql).toContain(
            'GRANT EXECUTE ON FUNCTION public.operator_complete_action_with_notifications(\n    UUID, TEXT, BIGINT, TEXT, TEXT[], TEXT\n) TO authenticated;'
        );
        expect(sql).not.toMatch(/DROP\s+(?:TABLE|COLUMN|CONSTRAINT|POLICY)/i);
        expect(sql).not.toMatch(/UPDATE\s+public\.actions/i);
    });
```

Also add the path constant near the other `ACTION_NOTIFICATION_*_PATH` constants (right after `ACTION_NOTIFICATION_TYPE_CONTRACT_PATH`):

```js
const ACTION_NOTIFICATION_TITLE_SNAPSHOT_PATH = new URL(
    '../../data/2026-08-14_action_notification_title_snapshot.sql',
    import.meta.url
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/database.migration.contract.test.js -t "includes the action title"`
Expected: FAIL — `data/2026-08-14_action_notification_title_snapshot.sql` does not exist yet (ENOENT from `readFileSync`).

- [ ] **Step 3: Write the migration file**

Create `data/2026-08-14_action_notification_title_snapshot.sql` with this exact content:

```sql
-- Forward repair: merge the submitting action's title into the
-- ACTION_NOTIFICATION action_snapshot so Green and Industry recipients can
-- render the same team-labeled, informational notification card as the
-- Red Team share path. No table, trigger, or policy changes.

BEGIN;

CREATE OR REPLACE FUNCTION public.operator_complete_action_with_notifications(
    requested_action_id UUID,
    requested_team TEXT,
    requested_expected_revision BIGINT,
    requested_reviewer_notes TEXT,
    requested_notification_teams TEXT[],
    requested_notification_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $complete_with_notifications$
DECLARE
    normalized_team TEXT := LOWER(NULLIF(BTRIM(requested_team), ''));
    normalized_notes TEXT := NULLIF(BTRIM(COALESCE(requested_reviewer_notes, '')), '');
    normalized_content TEXT := NULLIF(BTRIM(COALESCE(requested_notification_content, '')), '');
    normalized_notification_teams TEXT[] := ARRAY[]::TEXT[];
    authored_notification_teams TEXT[] := ARRAY[]::TEXT[];
    authored_notification_note TEXT;
    action_row public.actions%ROWTYPE;
    communication_row public.communications%ROWTYPE;
    review_result JSONB;
    communications_result JSONB := '[]'::jsonb;
    notification_team TEXT;
BEGIN
    SELECT *
    INTO action_row
    FROM public.actions a
    WHERE a.id = requested_action_id
      AND COALESCE(a.is_deleted, false) = false
    FOR UPDATE;

    IF action_row.id IS NULL THEN
        RAISE EXCEPTION 'Action not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF normalized_team NOT IN ('blue', 'red')
       OR LOWER(BTRIM(action_row.team)) <> normalized_team
       OR action_row.artifact_type NOT IN ('action', 'move_response') THEN
        RAISE EXCEPTION 'Notification delivery is limited to the submitting Blue or Red action.'
            USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(ARRAY_AGG(candidate.team ORDER BY candidate.team), ARRAY[]::TEXT[])
    INTO normalized_notification_teams
    FROM (
        SELECT DISTINCT LOWER(BTRIM(value)) AS team
        FROM UNNEST(COALESCE(requested_notification_teams, ARRAY[]::TEXT[])) AS selected(value)
        WHERE NULLIF(BTRIM(value), '') IS NOT NULL
    ) AS candidate;

    IF EXISTS (
        SELECT 1
        FROM UNNEST(normalized_notification_teams) AS selected(team)
        WHERE selected.team NOT IN ('green', 'industry')
    ) THEN
        RAISE EXCEPTION 'Action notifications are limited to Green and Industry.'
            USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(ARRAY_AGG(candidate.team ORDER BY candidate.team), ARRAY[]::TEXT[])
    INTO authored_notification_teams
    FROM (
        SELECT DISTINCT LOWER(BTRIM(value)) AS team
        FROM JSONB_ARRAY_ELEMENTS_TEXT(
            CASE
                WHEN JSONB_TYPEOF(action_row.artifact_payload -> 'action' -> 'notificationTeams') = 'array'
                    THEN action_row.artifact_payload -> 'action' -> 'notificationTeams'
                WHEN public.action_legacy_detail(action_row.ally_contingencies, 'Notification Teams') ~ '^[[:space:]]*\['
                    THEN public.action_legacy_detail(action_row.ally_contingencies, 'Notification Teams')::jsonb
                WHEN NULLIF(BTRIM(public.action_legacy_detail(
                    action_row.ally_contingencies,
                    'Notification Teams'
                )), '') IS NOT NULL
                    THEN jsonb_build_array(public.action_legacy_detail(
                        action_row.ally_contingencies,
                        'Notification Teams'
                    ))
                ELSE '[]'::jsonb
            END
        ) AS authored(value)
        WHERE LOWER(BTRIM(value)) IN ('green', 'industry')
    ) AS candidate;

    IF EXISTS (
        SELECT 1
        FROM UNNEST(normalized_notification_teams) AS selected(team)
        WHERE NOT (selected.team = ANY(authored_notification_teams))
    ) THEN
        RAISE EXCEPTION 'White Cell may only inform teams requested in the submitted action.'
            USING ERRCODE = '42501';
    END IF;

    IF CARDINALITY(normalized_notification_teams) > 0 AND normalized_content IS NULL THEN
        RAISE EXCEPTION 'Notification content is required when informing a requested team.'
            USING ERRCODE = '22023';
    END IF;

    authored_notification_note := NULLIF(BTRIM(COALESCE(
        action_row.artifact_payload -> 'action' ->> 'notificationNote',
        public.action_legacy_detail(action_row.ally_contingencies, 'Notification Note'),
        ''
    )), '');

    review_result := public.operator_review_artifact(
        'action',
        action_row.id,
        'complete',
        normalized_team,
        requested_expected_revision,
        normalized_notes
    );

    FOREACH notification_team IN ARRAY normalized_notification_teams LOOP
        communication_row := public.operator_send_communication(
            action_row.session_id,
            notification_team,
            'ACTION_NOTIFICATION',
            normalized_content,
            INITCAP(normalized_team) || ' Team Action Notification',
            NULL,
            jsonb_strip_nulls(jsonb_build_object(
                'recipient', notification_team,
                'recipient_scope', 'team',
                'recipient_team', notification_team,
                'recipient_role', NULL,
                'shared_action_id', action_row.id,
                'source_team', normalized_team,
                'action_revision', requested_expected_revision,
                'notification_delivery', 'approved',
                'notification_request_note', authored_notification_note,
                'action_snapshot', COALESCE(action_row.artifact_payload -> 'action', '{}'::jsonb)
                    || jsonb_build_object(
                        'title',
                        COALESCE(NULLIF(BTRIM(action_row.goal), ''), 'Untitled action')
                    )
            ))
        );

        communications_result := communications_result || jsonb_build_array(to_jsonb(communication_row));
    END LOOP;

    RETURN review_result || jsonb_build_object(
        'communications', communications_result,
        'notification_teams', to_jsonb(normalized_notification_teams)
    );
END;
$complete_with_notifications$;

REVOKE ALL ON FUNCTION public.operator_complete_action_with_notifications(
    UUID, TEXT, BIGINT, TEXT, TEXT[], TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_complete_action_with_notifications(
    UUID, TEXT, BIGINT, TEXT, TEXT[], TEXT
) FROM anon;
GRANT EXECUTE ON FUNCTION public.operator_complete_action_with_notifications(
    UUID, TEXT, BIGINT, TEXT, TEXT[], TEXT
) TO authenticated;

COMMENT ON FUNCTION public.operator_complete_action_with_notifications(
    UUID, TEXT, BIGINT, TEXT, TEXT[], TEXT
) IS
    'Atomically completes one submitted Blue/Red action and sends White Cell-approved Green/Industry notifications requested by that action, including the action title in the snapshot.';

COMMIT;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/database.migration.contract.test.js -t "includes the action title"`
Expected: PASS

- [ ] **Step 5: Document the migration in the Supabase setup ledger**

In `docs/supabase-setup.md`, find this sentence (search for `then apply` followed by `` `data/2026-08-13_action_notification_type_contract.sql` ``, in the "If July 14, August 5..." repair paragraph):

```
`data/2026-08-13_action_notification_delivery.sql`, then apply
`data/2026-08-13_action_notification_type_contract.sql`. Verify RPCs,
```

Replace with:

```
`data/2026-08-13_action_notification_delivery.sql`, then apply
`data/2026-08-13_action_notification_type_contract.sql`, then apply
`data/2026-08-14_action_notification_title_snapshot.sql`. Verify RPCs,
```

Then find this paragraph (search for `Pass: exactly one row is returned and \`constraint_definition\` contains`):

```
Pass: exactly one row is returned and `constraint_definition` contains
`ACTION_NOTIFICATION` together with the previously supported communication
types. Absence is a deployment blocker.
Rehearse a Blue action requesting both recipients: the Review Action modal
```

Insert the following four paragraphs (prose, then a SQL verification query, then a pass condition) between the "Absence is a deployment blocker." sentence and the "Rehearse a Blue action..." sentence — do not merge them into the surrounding paragraph, keep the blank lines shown below between each piece:

Prose paragraph to insert first:

```
Apply `data/2026-08-14_action_notification_title_snapshot.sql` after the
delivery and type-contract migrations above. It replaces
`operator_complete_action_with_notifications` again, this time merging the
submitting action's title into the `action_snapshot` metadata so Green and
Industry recipients can render the same team-labeled, informational
notification card as the Red Team share path. No table, trigger, or policy
changes; only the function body changes.
```

Lead-in line to insert next: `Verify the snapshot now carries a title:`

SQL verification query to insert next (as its own fenced `sql` block):

```sql
select pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'operator_complete_action_with_notifications';
```

Pass condition to insert last, directly before the "Rehearse a Blue action..." sentence: `Pass: \`function_definition\` contains \`COALESCE(NULLIF(BTRIM(action_row.goal), ''), 'Untitled action')\`.`

- [ ] **Step 6: Commit**

```bash
git add data/2026-08-14_action_notification_title_snapshot.sql src/services/database.migration.contract.test.js docs/supabase-setup.md
git commit -m "feat: include action title in action-notification snapshot"
```

---

### Task 2: Shared detector — `isActionNotificationCommunication`

**Files:**
- Modify: `src/features/communications/targeting.js`
- Test: `src/features/communications/targeting.test.js` (create if it does not already exist — check first with `ls src/features/communications/*.test.js`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `isActionNotificationCommunication(communication)` — exported function, returns `boolean`. Used by Task 4 (scribe.js), Task 9 (facilitator.js).

- [ ] **Step 1: Check for an existing test file**

Run: `ls src/features/communications/*.test.js`

If `targeting.test.js` exists, add the new test into its `describe` block. If it does not exist, create it with the structure shown in Step 2.

- [ ] **Step 2: Write the failing test**

If creating a new file, `src/features/communications/targeting.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isActionNotificationCommunication } from './targeting.js';

describe('isActionNotificationCommunication', () => {
    it('returns true for ACTION_NOTIFICATION communications', () => {
        expect(isActionNotificationCommunication({
            type: 'ACTION_NOTIFICATION',
            metadata: { shared_action_id: 'action-1', source_team: 'blue' }
        })).toBe(true);
    });

    it('returns true for GUIDANCE communications carrying a shared_action_id', () => {
        expect(isActionNotificationCommunication({
            type: 'GUIDANCE',
            metadata: { shared_action_id: 'action-2', source_team: 'blue' }
        })).toBe(true);
    });

    it('returns false for plain GUIDANCE communications without a shared_action_id', () => {
        expect(isActionNotificationCommunication({
            type: 'GUIDANCE',
            metadata: { content_kind: 'TRIBE_STREET_JOURNAL' }
        })).toBe(false);
    });

    it('returns false for other communication types', () => {
        expect(isActionNotificationCommunication({
            type: 'PROPOSAL_FORWARDED',
            metadata: { shared_action_id: 'action-3' }
        })).toBe(false);
        expect(isActionNotificationCommunication({
            type: 'DIRECT',
            metadata: {}
        })).toBe(false);
    });

    it('handles missing metadata without throwing', () => {
        expect(isActionNotificationCommunication({})).toBe(false);
        expect(isActionNotificationCommunication(undefined)).toBe(false);
    });
});
```

If `targeting.test.js` already exists, add the same `describe('isActionNotificationCommunication', ...)` block (with the import merged into the existing import line) at the end of the file.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/features/communications/targeting.test.js -t "isActionNotificationCommunication"`
Expected: FAIL with "isActionNotificationCommunication is not a function" or an import error.

- [ ] **Step 4: Implement the detector**

In `src/features/communications/targeting.js`, add this export. Place it after `getWhiteCellCommunicationUpdateKind` and before `isWhiteCellSectionUpdate` (both of which already read `communication.metadata` in a similar way):

```js
export function isActionNotificationCommunication(communication = {}) {
    const type = String(communication?.type || '').trim().toUpperCase();
    const metadata = communication?.metadata && typeof communication.metadata === 'object'
        ? communication.metadata
        : {};

    if (type === 'ACTION_NOTIFICATION') {
        return true;
    }

    return type === 'GUIDANCE' && Boolean(metadata.shared_action_id);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/features/communications/targeting.test.js -t "isActionNotificationCommunication"`
Expected: PASS (all 5 assertions)

- [ ] **Step 6: Commit**

```bash
git add src/features/communications/targeting.js src/features/communications/targeting.test.js
git commit -m "feat: add isActionNotificationCommunication detector"
```

---

### Task 3: Enrich the Red-team share path (`whitecell.js`)

**Files:**
- Modify: `src/roles/whitecell.js:19-34` (imports), `:4019-4082` (`shareActionWithRedTeam`)
- Test: `src/roles/whitecell.test.js:3425-3499` (existing test, to be extended)

**Interfaces:**
- Consumes: `parseBlueActionDetails` (already exported from `src/features/actions/blueActionDetails.js`, confirmed at that file's line 284).
- Produces: `shareActionWithRedTeam` now creates a `GUIDANCE` communication whose `metadata.action_snapshot` is an object with the same shape as `action_row.artifact_payload -> 'action'` from Task 1's SQL (a details object plus `title`), and whose top-level `title` field reads `"<Team> Team Action Notification"`. Task 9 (facilitator.js) and a future scribe.js Notifications view both read `metadata.action_snapshot.title` as the action's display title.

- [ ] **Step 1: Write the failing test**

In `src/roles/whitecell.test.js`, extend the existing test `'sends Blue team actions to the Red team as White Cell communications'` (starts at line 3425). Add these assertions right after the existing `expect(createCommunication).toHaveBeenCalledWith(...)` block (after line 3481, before the `expect(createCommunication.mock.calls[0][0].content)...` lines):

```js
        expect(createCommunication.mock.calls[0][0].title).toBe('Blue Team Action Notification');
        expect(createCommunication.mock.calls[0][0].metadata.action_snapshot).toMatchObject({
            title: 'Stabilize port access',
            objective: 'Stabilize port access'
        });
```

Note: this test action has no `artifact_payload`, only legacy fields (`mechanism`, `sector`, `exposure_type`, `ally_contingencies`) — this is the legacy-format case the implementation must handle via `parseBlueActionDetails`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/roles/whitecell.test.js -t "sends Blue team actions to the Red team"`
Expected: FAIL — `createCommunication.mock.calls[0][0].title` is `undefined`, and `metadata.action_snapshot` is `undefined`.

- [ ] **Step 3: Add the `parseBlueActionDetails` import**

In `src/roles/whitecell.js`, the import block at line 28-34 currently reads:

```js
import {
    BLUE_ACTION_NOTIFICATION_TEAMS,
    formatActionSequenceLabel,
    formatBlueActionSelection,
    getActionSequenceNumber,
    getBlueActionViewModel
} from '../features/actions/blueActionDetails.js';
```

Change to:

```js
import {
    BLUE_ACTION_NOTIFICATION_TEAMS,
    formatActionSequenceLabel,
    formatBlueActionSelection,
    getActionSequenceNumber,
    getBlueActionViewModel,
    parseBlueActionDetails
} from '../features/actions/blueActionDetails.js';
```

- [ ] **Step 4: Enrich the metadata and add a title**

In `src/roles/whitecell.js`, `shareActionWithRedTeam` (starts at line 4019) currently builds the communication like this:

```js
        try {
            const gameState = this.getCurrentGameState();
            const recipientMetadata = buildWhiteCellRecipientMetadata(WHITE_CELL_RED_TEAM_RECIPIENT, {
                shared_action_id: action.id,
                source_team: action.team,
                actor_role: this.getTimelineActorRole()
            });
            const communication = await database.createCommunication({
                session_id: sessionId,
                from_role: 'white_cell',
                to_role: WHITE_CELL_RED_TEAM_RECIPIENT,
                type: 'GUIDANCE',
                content: buildSharedActionCommunicationContent(action),
                metadata: recipientMetadata
            });
            communicationsStore.updateFromServer('INSERT', communication);
```

Replace with:

```js
        try {
            const gameState = this.getCurrentGameState();
            const actionSnapshot = {
                ...(action.artifact_payload?.action || parseBlueActionDetails(action.ally_contingencies) || {}),
                title: action.goal || 'Untitled action'
            };
            const recipientMetadata = buildWhiteCellRecipientMetadata(WHITE_CELL_RED_TEAM_RECIPIENT, {
                shared_action_id: action.id,
                source_team: action.team,
                actor_role: this.getTimelineActorRole(),
                action_snapshot: actionSnapshot
            });
            const communication = await database.createCommunication({
                session_id: sessionId,
                from_role: 'white_cell',
                to_role: WHITE_CELL_RED_TEAM_RECIPIENT,
                type: 'GUIDANCE',
                title: `${this.formatTeamLabel(action.team)} Team Action Notification`,
                content: buildSharedActionCommunicationContent(action),
                metadata: recipientMetadata
            });
            communicationsStore.updateFromServer('INSERT', communication);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/roles/whitecell.test.js -t "sends Blue team actions to the Red team"`
Expected: PASS

- [ ] **Step 6: Run the full whitecell test file to check for regressions**

Run: `npm test -- src/roles/whitecell.test.js`
Expected: PASS (all tests, no new failures)

- [ ] **Step 7: Commit**

```bash
git add src/roles/whitecell.js src/roles/whitecell.test.js
git commit -m "feat: enrich Red Team action share with structured snapshot and title"
```

---

### Task 4: scribe.js — data layer (slides, section, thread exclusion)

**Files:**
- Modify: `src/roles/scribe.js`
- Test: `src/roles/scribe.test.js`

**Interfaces:**
- Consumes: `isActionNotificationCommunication` (Task 2, `src/features/communications/targeting.js`).
- Produces:
  - `NOTIFICATIONS_SECTION_ID` constant (`'action-notifications'`), exported alongside the other section-id constants.
  - `buildFacilitatorActionNotificationSlides(communications, { teamContext })` — exported function, returns `{ slideCount, slides }`. Each real slide has `{ slideKey, slideType: 'action-notification', communication, title, sidebarOrdinal, sidebarKicker }`. Consumed by Task 5 (rendering) and Task 6 (deck wiring).
  - `isFacilitatorDirectCommunication` now excludes anything `isActionNotificationCommunication` matches, in addition to the existing `PROPOSAL_FORWARDED`/`PROPOSAL_RESPONSE` exclusion.

- [ ] **Step 1: Write the failing tests**

In `src/roles/scribe.test.js`, find the test `'keeps received proposals in a persistent sidebar section immediately below Actions'` (starts around line 1379, loads `buildFacilitatorProposalSlides` via `loadScribeModule()`). Add two new tests immediately after that test's closing `});`:

```js
    it('builds action notification slides from ACTION_NOTIFICATION and enriched Red-share GUIDANCE communications', async () => {
        const { buildFacilitatorActionNotificationSlides } = await loadScribeModule();
        const teamContext = {
            teamId: 'industry',
            scribeRole: 'industry_scribe'
        };
        const greenIndustryNotification = {
            id: 'notif-1',
            type: 'ACTION_NOTIFICATION',
            from_role: 'white_cell',
            to_role: 'industry',
            created_at: '2026-08-14T09:00:00.000Z',
            content: 'Blue is adjusting export controls on rare-earth materials.',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'industry',
                source_team: 'blue',
                shared_action_id: 'action-1',
                action_snapshot: { title: 'Rare-earth export controls', objective: 'Limit outbound rare-earth shipments.' }
            }
        };
        const otherTeamNotification = {
            id: 'notif-2',
            type: 'ACTION_NOTIFICATION',
            from_role: 'white_cell',
            to_role: 'green',
            created_at: '2026-08-14T09:05:00.000Z',
            content: 'Not for Industry.',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'green',
                source_team: 'blue',
                shared_action_id: 'action-2',
                action_snapshot: { title: 'Other action' }
            }
        };

        const slides = buildFacilitatorActionNotificationSlides(
            [greenIndustryNotification, otherTeamNotification],
            { teamContext }
        );
        const emptySlides = buildFacilitatorActionNotificationSlides([], { teamContext });

        expect(slides.slideCount).toBe(1);
        expect(slides.slides[0]).toMatchObject({
            slideKey: 'action-notification-notif-1',
            slideType: 'action-notification',
            title: 'Rare-earth export controls'
        });
        expect(slides.slides[0].sidebarKicker).toContain('Blue Team');
        expect(emptySlides).toMatchObject({
            slideCount: 0,
            slides: [{ slideKey: 'action-notifications-placeholder', slideType: 'action-notification-placeholder' }]
        });
    });

    it('excludes action notifications from the direct Communications thread', async () => {
        const { isFacilitatorDirectCommunication } = await loadScribeModule();
        const teamContext = {
            teamId: 'industry',
            scribeRole: 'industry_scribe'
        };
        const notification = {
            id: 'notif-3',
            type: 'ACTION_NOTIFICATION',
            from_role: 'white_cell',
            to_role: 'industry',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'industry',
                shared_action_id: 'action-3',
                source_team: 'blue'
            }
        };

        expect(isFacilitatorDirectCommunication(notification, teamContext)).toBe(false);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/roles/scribe.test.js -t "action notification"`
Expected: FAIL — `buildFacilitatorActionNotificationSlides` is not exported yet, and the exclusion test fails because `isFacilitatorDirectCommunication` still returns `true` for the notification.

- [ ] **Step 3: Add the section id constant**

In `src/roles/scribe.js`, the constants block at lines 95-110 currently reads:

```js
const PROPOSALS_SECTION_ID = 'proposals';
const RFIS_SECTION_ID = 'rfis';
const COMMUNICATIONS_SECTION_ID = 'direct-communications';
const LIVE_SECTION_IDS = Object.freeze([
    ACTIONS_SECTION_ID,
    PROPOSALS_SECTION_ID,
    RFIS_SECTION_ID,
    COMMUNICATIONS_SECTION_ID
]);
const FACILITATOR_VIEW_IDS = Object.freeze(['actions', 'deck', 'rfis', 'communications']);
const FACILITATOR_VIEW_BUTTON_IDS = Object.freeze({
    actions: 'teamActionReviewViewBtn',
    deck: 'deckViewBtn',
    rfis: 'rfiViewBtn',
    communications: 'communicationsViewBtn'
});
```

Replace with:

```js
const PROPOSALS_SECTION_ID = 'proposals';
const RFIS_SECTION_ID = 'rfis';
const COMMUNICATIONS_SECTION_ID = 'direct-communications';
const NOTIFICATIONS_SECTION_ID = 'action-notifications';
const LIVE_SECTION_IDS = Object.freeze([
    ACTIONS_SECTION_ID,
    PROPOSALS_SECTION_ID,
    RFIS_SECTION_ID,
    COMMUNICATIONS_SECTION_ID,
    NOTIFICATIONS_SECTION_ID
]);
const FACILITATOR_VIEW_IDS = Object.freeze(['actions', 'deck', 'rfis', 'communications', 'notifications']);
const FACILITATOR_VIEW_BUTTON_IDS = Object.freeze({
    actions: 'teamActionReviewViewBtn',
    deck: 'deckViewBtn',
    rfis: 'rfiViewBtn',
    communications: 'communicationsViewBtn',
    notifications: 'notificationsViewBtn'
});
```

- [ ] **Step 4: Map the new section id to a view**

In `src/roles/scribe.js`, `getFacilitatorViewForSectionId` (around line 112) currently reads:

```js
function getFacilitatorViewForSectionId(sectionId = '') {
    if (sectionId === RFIS_SECTION_ID) return 'rfis';
    if (sectionId === COMMUNICATIONS_SECTION_ID) return 'communications';
    if (sectionId === ACTIONS_SECTION_ID || sectionId === PROPOSALS_SECTION_ID) return 'actions';
```

Add a new line right after the `RFIS_SECTION_ID` check:

```js
function getFacilitatorViewForSectionId(sectionId = '') {
    if (sectionId === RFIS_SECTION_ID) return 'rfis';
    if (sectionId === NOTIFICATIONS_SECTION_ID) return 'notifications';
    if (sectionId === COMMUNICATIONS_SECTION_ID) return 'communications';
    if (sectionId === ACTIONS_SECTION_ID || sectionId === PROPOSALS_SECTION_ID) return 'actions';
```

(Leave the rest of the function body — whatever follows — unchanged.)

- [ ] **Step 5: Add the slide-builder and section-builder functions**

In `src/roles/scribe.js`, find `buildCommunicationSection` (around line 688-697):

```js
function buildCommunicationSection(communications = [], { teamContext = resolveTeamContext() } = {}) {
    const communicationSlides = buildFacilitatorCommunicationSlides(communications, { teamContext });
    return {
        id: COMMUNICATIONS_SECTION_ID,
        label: 'Communications',
        description: 'Session-scoped direct text history between this Facilitator and White Cell.',
        slideCount: communicationSlides.slideCount,
        slides: communicationSlides.slides
    };
}
```

Immediately after it (before `function formatTeamLabel`), add:

```js
function getActionNotificationSnapshot(communication = {}) {
    const metadata = communication?.metadata && typeof communication.metadata === 'object'
        ? communication.metadata
        : {};
    const snapshot = metadata.action_snapshot && typeof metadata.action_snapshot === 'object'
        ? metadata.action_snapshot
        : {};

    return {
        metadata,
        snapshot,
        title: snapshot.title || communication.title || 'Untitled action',
        sourceTeam: metadata.source_team || 'unknown'
    };
}

export function buildFacilitatorActionNotificationSlides(communications = [], {
    teamContext = resolveTeamContext()
} = {}) {
    const notifications = [...(communications || [])]
        .filter((communication) => (
            isActionNotificationCommunication(communication)
            && isWhiteCellCommunicationVisibleToScribe(communication, teamContext)
        ))
        .sort((left, right) => (
            normalizeRecordTimestamp(right) - normalizeRecordTimestamp(left)
            || String(left?.id || '').localeCompare(String(right?.id || ''))
        ));

    if (!notifications.length) {
        return {
            slideCount: 0,
            slides: [{
                slideKey: 'action-notifications-placeholder',
                slideType: 'action-notification-placeholder',
                title: 'No action notifications yet',
                sidebarOrdinal: '0',
                sidebarKicker: 'Nothing shared yet',
                summary: 'Informational updates about another team’s action, shared for awareness, will appear here.'
            }]
        };
    }

    return {
        slideCount: notifications.length,
        slides: notifications.map((communication, index) => {
            const snapshot = getActionNotificationSnapshot(communication);
            return {
                slideKey: `action-notification-${communication.id}`,
                slideType: 'action-notification',
                communication,
                title: snapshot.title,
                sidebarOrdinal: String(index + 1),
                sidebarKicker: `${formatTeamLabel(snapshot.sourceTeam)} | Informational`
            };
        })
    };
}

function buildActionNotificationSection(communications = [], {
    teamContext = resolveTeamContext()
} = {}) {
    const notificationSlides = buildFacilitatorActionNotificationSlides(communications, { teamContext });

    return {
        id: NOTIFICATIONS_SECTION_ID,
        label: 'Notifications',
        description: 'Informational updates about another team’s action, shared for awareness. No response needed.',
        slideCount: notificationSlides.slideCount,
        slides: notificationSlides.slides
    };
}
```

Note: `formatTeamLabel` is defined a few lines below `buildCommunicationSection` today — since these are plain hoisted `function` declarations in the same module, call order in the file does not matter, only that both exist somewhere in the module.

- [ ] **Step 6: Exclude action notifications from the direct communications thread**

In `src/roles/scribe.js`, `isFacilitatorDirectCommunication` (around line 635-647) currently reads:

```js
export function isFacilitatorDirectCommunication(communication = {}, teamContext = {}) {
    const type = String(communication?.type || '').trim().toUpperCase();
    if (type === 'PROPOSAL_FORWARDED' || type === 'PROPOSAL_RESPONSE') {
        return false;
    }

    const isOutbound = communication?.from_role === teamContext.scribeRole
        && String(communication?.to_role || '').trim().toLowerCase() === 'white_cell';
    const isInbound = isWhiteCellRole(communication?.from_role)
        && isWhiteCellCommunicationVisibleToScribe(communication, teamContext);

    return isOutbound || isInbound;
}
```

Replace with:

```js
export function isFacilitatorDirectCommunication(communication = {}, teamContext = {}) {
    const type = String(communication?.type || '').trim().toUpperCase();
    if (type === 'PROPOSAL_FORWARDED' || type === 'PROPOSAL_RESPONSE') {
        return false;
    }

    if (isActionNotificationCommunication(communication)) {
        return false;
    }

    const isOutbound = communication?.from_role === teamContext.scribeRole
        && String(communication?.to_role || '').trim().toLowerCase() === 'white_cell';
    const isInbound = isWhiteCellRole(communication?.from_role)
        && isWhiteCellCommunicationVisibleToScribe(communication, teamContext);

    return isOutbound || isInbound;
}
```

- [ ] **Step 7: Import the detector**

In `src/roles/scribe.js`, line 22 currently reads:

```js
import { isWhiteCellCommunicationVisibleToScribe } from '../features/communications/targeting.js';
```

Replace with:

```js
import {
    isActionNotificationCommunication,
    isWhiteCellCommunicationVisibleToScribe
} from '../features/communications/targeting.js';
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- src/roles/scribe.test.js -t "action notification"`
Expected: PASS (both new tests)

- [ ] **Step 9: Commit**

```bash
git add src/roles/scribe.js src/roles/scribe.test.js
git commit -m "feat(scribe): add action-notification slide/section data layer"
```

---

### Task 5: scribe.js — render the notification slide

**Files:**
- Modify: `src/roles/scribe.js`
- Test: `src/roles/scribe.test.js`

**Interfaces:**
- Consumes: slide shape from Task 4 (`{ slideKey, slideType: 'action-notification' | 'action-notification-placeholder', communication, title, summary }`); `getBlueActionViewModel`, `renderActionSlideGlanceCard`, `createBadge`, `formatTeamLabel`, `escapeHtml`, `formatRelativeTime` (all already available in this module).
- Produces: `ScribeController.prototype.renderActionNotificationSlide(slide)` — instance method returning an HTML string. Wired into the slide-dispatch switch and announcement text in Task 6.

- [ ] **Step 1: Write the failing test**

In `src/roles/scribe.test.js`, add this test near the other `render*Slide` tests (search for `renderProposalSlide` or `renderCommunicationSlide` to find that neighborhood and match its style — instantiate `ScribeController`, call the render method directly, assert on the returned HTML string):

```js
    it('renders an action notification slide with the source team and an explicit no-response-needed statement', async () => {
        const { ScribeController } = await loadScribeModule();
        const controller = new ScribeController();
        controller.teamId = 'industry';
        controller.teamLabel = 'Industry Team';

        const html = controller.renderActionNotificationSlide({
            slideType: 'action-notification',
            title: 'Rare-earth export controls',
            communication: {
                id: 'notif-1',
                content: 'Heads up before your next move.',
                created_at: '2026-08-14T09:00:00.000Z',
                metadata: {
                    source_team: 'blue',
                    action_snapshot: {
                        title: 'Rare-earth export controls',
                        objective: 'Limit outbound rare-earth shipments.',
                        instruments: ['Economic']
                    }
                }
            }
        });

        expect(html).toContain('Blue Team');
        expect(html).toContain('Rare-earth export controls');
        expect(html).toContain('No response needed');
        expect(html).toContain('Limit outbound rare-earth shipments.');
        expect(html).toContain('Heads up before your next move.');
        expect(html).not.toContain('<button');
    });

    it('renders an action notification placeholder when there is nothing to show', async () => {
        const { ScribeController } = await loadScribeModule();
        const controller = new ScribeController();

        const html = controller.renderActionNotificationSlide({
            slideType: 'action-notification-placeholder',
            title: 'No action notifications yet',
            summary: 'Informational updates about another team’s action, shared for awareness, will appear here.'
        });

        expect(html).toContain('No action notifications yet');
        expect(html).toContain('shared for awareness');
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/roles/scribe.test.js -t "action notification slide"`
Expected: FAIL — `controller.renderActionNotificationSlide is not a function`.

- [ ] **Step 3: Implement the render method**

In `src/roles/scribe.js`, find `renderCommunicationSlide` (the method added when the communications-thread scrolling fix was made; search for `renderCommunicationSlide(slide = {})`). Add the new method immediately after `renderCommunicationSlide`'s closing `}` (before `showFacilitatorRfiModal`):

```js
    renderActionNotificationSlide(slide = {}) {
        if (slide.slideType === 'action-notification-placeholder') {
            return `
                <article class="scribe-action-slide scribe-action-slide-placeholder scribe-action-notification-slide">
                    <p class="scribe-action-slide-eyebrow">Notifications</p>
                    <h2 class="scribe-action-slide-title">${escapeHtml(slide.title)}</h2>
                    <p class="scribe-action-slide-summary">${escapeHtml(slide.summary || '')}</p>
                </article>
            `;
        }

        const communication = slide.communication || {};
        const metadata = communication?.metadata && typeof communication.metadata === 'object'
            ? communication.metadata
            : {};
        const snapshot = metadata.action_snapshot && typeof metadata.action_snapshot === 'object'
            ? metadata.action_snapshot
            : {};
        const sourceTeam = metadata.source_team || 'unknown';
        const sourceTeamLabel = formatTeamLabel(sourceTeam);
        const title = snapshot.title || communication.title || 'Untitled action';
        const actionViewModel = getBlueActionViewModel({ artifact_payload: { action: snapshot } });
        const informationalBadge = createBadge({
            text: 'Informational',
            variant: 'default',
            size: 'sm',
            rounded: true
        }).outerHTML;
        // buildBlueActionArtifactDetails (inside getBlueActionViewModel) already strips
        // empty/null/undefined fields, so artifactDetails only ever contains fields with
        // real values — no further filtering needed here.
        const glanceCards = actionViewModel.artifactDetails?.length
            ? actionViewModel.artifactDetails.map((field) => renderActionSlideGlanceCard(field)).join('')
            : '';

        return `
            <article class="scribe-action-slide scribe-action-notification-slide" data-source-team="${escapeHtml(sourceTeam)}">
                <header class="scribe-action-slide-header">
                    <div>
                        <p class="scribe-action-slide-eyebrow">${escapeHtml(sourceTeamLabel)} Action Notification</p>
                        <h2 class="scribe-action-slide-title">${escapeHtml(title)}</h2>
                        <p class="scribe-action-slide-summary">No response needed — shared for awareness by White Cell on behalf of ${escapeHtml(sourceTeamLabel)}.</p>
                    </div>
                    <div class="scribe-action-slide-badges">
                        ${informationalBadge}
                    </div>
                </header>

                <section class="scribe-action-slide-panel">
                    ${glanceCards ? `
                        <section class="scribe-action-slide-glance" aria-label="Action details">
                            <div class="scribe-action-slide-section-header">
                                <h3 class="scribe-action-slide-section-title">Action details</h3>
                            </div>
                            <div class="scribe-action-slide-glance-grid scribe-action-slide-glance-grid--components">
                                ${glanceCards}
                            </div>
                        </section>
                    ` : ''}
                    ${communication.content ? `
                        <section class="scribe-action-slide-lead" aria-label="Note from White Cell">
                            <p class="scribe-action-slide-section-label">Note from White Cell</p>
                            <p class="scribe-action-slide-body">${escapeHtml(communication.content)}</p>
                        </section>
                    ` : ''}
                </section>
            </article>
        `;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/roles/scribe.test.js -t "action notification slide"`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add src/roles/scribe.js src/roles/scribe.test.js
git commit -m "feat(scribe): render action notification slide"
```

---

### Task 6: scribe.js — wire the section into the deck, sync, and view switch

**Files:**
- Modify: `src/roles/scribe.js`
- Test: `src/roles/scribe.test.js`

**Interfaces:**
- Consumes: `buildActionNotificationSection` and `buildFacilitatorActionNotificationSlides` (Task 4), `renderActionNotificationSlide` (Task 5).
- Produces: `this.actionNotifications` (array, mirrors `this.receivedProposals`), `syncActionNotificationsFromStore()` (instance method), the Notifications tab appears in `updateFacilitatorViewSwitch` with a live count, `#notificationsViewCount` element updated. Consumed by Task 7 (HTML markup must provide the `notificationsViewBtn` / `notificationsViewCount` elements this code targets).

- [ ] **Step 1: Write the failing test**

In `src/roles/scribe.test.js`, add this test near `'keeps received proposals in a persistent sidebar section immediately below Actions'`:

```js
    it('adds action notifications as a live deck section and updates the Notifications tab count', async () => {
        const { ScribeController } = await loadScribeModule();
        const fakeDocument = createFakeDocument();
        const notificationsButton = fakeDocument.register(createFakeElement('notificationsViewBtn'));
        const notificationsCount = fakeDocument.register(createFakeElement('notificationsViewCount'));
        global.document = fakeDocument;

        const controller = new ScribeController();
        controller.teamId = 'industry';
        controller.teamContext = { teamId: 'industry', scribeRole: 'industry_scribe' };
        // rebuildDeck reads action notifications from this.actionNotifications, not
        // this.directCommunications — Task 4's exclusion means the same communication
        // would never appear in directCommunications once isFacilitatorDirectCommunication
        // is updated, so the two arrays must be populated independently here.
        controller.actionNotifications = [{
            id: 'notif-1',
            type: 'ACTION_NOTIFICATION',
            from_role: 'white_cell',
            to_role: 'industry',
            created_at: '2026-08-14T09:00:00.000Z',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'industry',
                source_team: 'blue',
                shared_action_id: 'action-1',
                action_snapshot: { title: 'Rare-earth export controls' }
            }
        }];

        controller.rebuildDeck();

        const notificationsSection = controller.sections.find((section) => section.id === 'action-notifications');
        expect(notificationsSection).toBeDefined();
        expect(notificationsSection.slideCount).toBe(1);

        controller.updateFacilitatorViewSwitch('notifications');

        expect(notificationsCount.textContent).toBe('1');
        expect(notificationsButton.classList.contains('is-active')).toBe(true);
    });
```

Note: this test relies on `this.actionNotifications` already holding the notification, mirroring how `rebuildDeck` already sources `receivedProposals`/`teamRfis`/`directCommunications` from controller state that other sync methods populate — Step 3 below adds this new state array.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/roles/scribe.test.js -t "Notifications tab count"`
Expected: FAIL — `notificationsSection` is `undefined` (`rebuildDeck` does not build an action-notifications section yet).

- [ ] **Step 3: Add `this.actionNotifications` state**

In `src/roles/scribe.js`, the constructor's state block (around line 962-967) currently reads:

```js
        this.teamActions = [];
        this.receivedProposals = [];
        this.teamRfis = [];
        this.rfiRevisionHistory = [];
        this.rfiRevisionHistoryError = null;
        this.directCommunications = [];
```

Add a new line after `this.receivedProposals = [];`:

```js
        this.teamActions = [];
        this.receivedProposals = [];
        this.actionNotifications = [];
        this.teamRfis = [];
        this.rfiRevisionHistory = [];
        this.rfiRevisionHistoryError = null;
        this.directCommunications = [];
```

- [ ] **Step 4: Add the sync method**

In `src/roles/scribe.js`, find `syncProposalsFromStore` (around line 1714-1748). Add a new method immediately after its closing `}` (before `syncRfisFromStore`):

```js
    syncActionNotificationsFromStore({
        event = '',
        data = null
    } = {}) {
        this.actionNotifications = communicationsStore.getAll()
            .filter((communication) => isActionNotificationCommunication(communication));

        if (!this.facilitatorDeckSlides.length && !this.sections.length) {
            return;
        }

        const shouldFocusNotification = (
            event === 'created'
            && data
            && isActionNotificationCommunication(data)
        );
        this.rebuildDeck({
            preferredSlideKey: shouldFocusNotification
                ? `action-notification-${data.id}`
                : this.getCurrentSlideKey(),
            preferLiveSection: shouldFocusNotification ? NOTIFICATIONS_SECTION_ID : ''
        });

        if (this.deckSlides.length) {
            this.renderSlide();
        }
    }
```

- [ ] **Step 5: Call the sync method on init and on live updates**

In `src/roles/scribe.js`, `init()` (around line 1053) currently reads:

```js
        this.syncProposalsFromStore();
        this.syncRfisFromStore();
        this.syncCommunicationsFromStore();
```

Replace with:

```js
        this.syncProposalsFromStore();
        this.syncActionNotificationsFromStore();
        this.syncRfisFromStore();
        this.syncCommunicationsFromStore();
```

In `subscribeToLiveData()` (around line 1439-1451), the `communicationsStore.subscribe` callback currently reads:

```js
        this.storeUnsubscribers.push(
            communicationsStore.subscribe((event, data) => {
                this.processCommunicationNotifications(event);
                this.syncDeckAssignmentFromStore({
                    reload: event === 'created'
                        || event === 'updated'
                        || event === 'initialized'
                        || event === 'loaded'
                        || event === 'reconciled'
                });
                this.syncProposalsFromStore({ event, data });
                this.syncCommunicationsFromStore({ event, data });
            })
        );
```

Replace with:

```js
        this.storeUnsubscribers.push(
            communicationsStore.subscribe((event, data) => {
                this.processCommunicationNotifications(event);
                this.syncDeckAssignmentFromStore({
                    reload: event === 'created'
                        || event === 'updated'
                        || event === 'initialized'
                        || event === 'loaded'
                        || event === 'reconciled'
                });
                this.syncProposalsFromStore({ event, data });
                this.syncActionNotificationsFromStore({ event, data });
                this.syncCommunicationsFromStore({ event, data });
            })
        );
```

- [ ] **Step 6: Wire the section into `rebuildDeck`**

In `src/roles/scribe.js`, `rebuildDeck` (around line 2492-2517) currently reads:

```js
        const communicationSection = buildCommunicationSection(this.directCommunications, {
            teamContext: this.teamContext
        });
        const staticSections = expandScribeDeckSections(this.facilitatorDeckSlides)
            .filter((section) => !LIVE_SECTION_IDS.includes(section.id));
        const staticSlides = flattenScribeDeckSlides(staticSections);

        const liveSections = [actionSection, proposalSection, rfiSection, communicationSection];
```

Replace with:

```js
        const communicationSection = buildCommunicationSection(this.directCommunications, {
            teamContext: this.teamContext
        });
        const notificationSection = buildActionNotificationSection(this.actionNotifications, {
            teamContext: this.teamContext
        });
        const staticSections = expandScribeDeckSections(this.facilitatorDeckSlides)
            .filter((section) => !LIVE_SECTION_IDS.includes(section.id));
        const staticSlides = flattenScribeDeckSlides(staticSections);

        const liveSections = [actionSection, proposalSection, rfiSection, communicationSection, notificationSection];
```

- [ ] **Step 7: Add the slide-dispatch and announcement branches**

In `src/roles/scribe.js`, `renderSlide()` has this block (around line 3030-3050):

```js
        if (actionFrame) {
            actionFrame.hidden = slide.slideType === 'image';
            if (slide.slideType !== 'image') {
                actionFrame.innerHTML = slide.slideType === 'proposal' || slide.slideType === 'proposal-placeholder'
                    ? this.renderProposalSlide(slide)
                    : slide.slideType === 'rfi' || slide.slideType === 'rfi-placeholder'
                        ? this.renderRfiSlide(slide)
                        : slide.slideType === 'communication' || slide.slideType === 'communication-placeholder'
                            ? this.renderCommunicationSlide(slide)
                            : this.renderActionSlide(slide);
            }
        }

        if (announcement) {
            announcement.textContent = slide.slideType === 'image'
                ? `${activeSection.label}. ${slide.title}. Slide ${this.currentSlideIndex + 1} of ${this.deckSlides.length}.`
                : slide.slideType === 'proposal' || slide.slideType === 'proposal-placeholder'
                    ? `${activeSection.label}. ${slide.title}. Proposal ${slideIndexWithinSection + 1} of ${Math.max(activeSection.slideCount || activeSection.slides.length, 1)}.`
                    : slide.slideType === 'rfi' || slide.slideType === 'rfi-placeholder'
                        ? `${activeSection.label}. ${slide.title}. RFI ${slideIndexWithinSection + 1} of ${Math.max(activeSection.slideCount || activeSection.slides.length, 1)}.`
                        : slide.slideType === 'communication' || slide.slideType === 'communication-placeholder'
                            ? `${activeSection.label}. Direct message thread. ${activeSection.slideCount || 0} ${activeSection.slideCount === 1 ? 'message' : 'messages'}.`
                    : `${activeSection.label}. ${slide.title}. ${getActionSlideAnnouncementLabel(slide.action)} ${slideIndexWithinSection + 1} of ${Math.max(activeSection.slideCount || activeSection.slides.length, 1)}.`;
        }
```

Replace with:

```js
        if (actionFrame) {
            actionFrame.hidden = slide.slideType === 'image';
            if (slide.slideType !== 'image') {
                actionFrame.innerHTML = slide.slideType === 'proposal' || slide.slideType === 'proposal-placeholder'
                    ? this.renderProposalSlide(slide)
                    : slide.slideType === 'rfi' || slide.slideType === 'rfi-placeholder'
                        ? this.renderRfiSlide(slide)
                        : slide.slideType === 'communication' || slide.slideType === 'communication-placeholder'
                            ? this.renderCommunicationSlide(slide)
                            : slide.slideType === 'action-notification' || slide.slideType === 'action-notification-placeholder'
                                ? this.renderActionNotificationSlide(slide)
                                : this.renderActionSlide(slide);
            }
        }

        if (announcement) {
            announcement.textContent = slide.slideType === 'image'
                ? `${activeSection.label}. ${slide.title}. Slide ${this.currentSlideIndex + 1} of ${this.deckSlides.length}.`
                : slide.slideType === 'proposal' || slide.slideType === 'proposal-placeholder'
                    ? `${activeSection.label}. ${slide.title}. Proposal ${slideIndexWithinSection + 1} of ${Math.max(activeSection.slideCount || activeSection.slides.length, 1)}.`
                    : slide.slideType === 'rfi' || slide.slideType === 'rfi-placeholder'
                        ? `${activeSection.label}. ${slide.title}. RFI ${slideIndexWithinSection + 1} of ${Math.max(activeSection.slideCount || activeSection.slides.length, 1)}.`
                        : slide.slideType === 'communication' || slide.slideType === 'communication-placeholder'
                            ? `${activeSection.label}. Direct message thread. ${activeSection.slideCount || 0} ${activeSection.slideCount === 1 ? 'message' : 'messages'}.`
                            : slide.slideType === 'action-notification' || slide.slideType === 'action-notification-placeholder'
                                ? `${activeSection.label}. Informational, no response needed. ${slide.title}. Notification ${slideIndexWithinSection + 1} of ${Math.max(activeSection.slideCount || activeSection.slides.length, 1)}.`
                    : `${activeSection.label}. ${slide.title}. ${getActionSlideAnnouncementLabel(slide.action)} ${slideIndexWithinSection + 1} of ${Math.max(activeSection.slideCount || activeSection.slides.length, 1)}.`;
        }
```

- [ ] **Step 8: Add the sidebar-link type class**

In `src/roles/scribe.js`, `getLiveSlideTypeClass` (around line 709-727) currently reads:

```js
    if (slide.slideType === 'communication' || slide.slideType === 'communication-placeholder') {
        return ' is-communication';
    }

    return slide.slideType !== 'image' ? ' is-action' : '';
```

Replace with:

```js
    if (slide.slideType === 'communication' || slide.slideType === 'communication-placeholder') {
        return ' is-communication';
    }

    if (slide.slideType === 'action-notification' || slide.slideType === 'action-notification-placeholder') {
        return ' is-action-notification';
    }

    return slide.slideType !== 'image' ? ' is-action' : '';
```

- [ ] **Step 9: Update the view switch and count badge**

In `src/roles/scribe.js`, `updateFacilitatorViewSwitch` (around line 5040-5073) currently reads:

```js
        const rfiCount = this.teamRfis.length;
        const messageCount = this.directCommunications.length;
        const rfiCountElement = document.getElementById('rfiViewCount');
        const messageCountElement = document.getElementById('communicationsViewCount');
        const rfiButton = document.getElementById(FACILITATOR_VIEW_BUTTON_IDS.rfis);
        const communicationsButton = document.getElementById(FACILITATOR_VIEW_BUTTON_IDS.communications);
        const workspacePanel = document.getElementById('facilitatorWorkspacePanel');

        if (rfiCountElement) rfiCountElement.textContent = String(rfiCount);
        if (messageCountElement) messageCountElement.textContent = String(messageCount);
        rfiButton?.setAttribute('aria-label', `RFIs, ${rfiCount} ${rfiCount === 1 ? 'record' : 'records'}`);
        communicationsButton?.setAttribute(
            'aria-label',
            `Communications, ${messageCount} ${messageCount === 1 ? 'message' : 'messages'}`
        );
        workspacePanel?.setAttribute('aria-labelledby', FACILITATOR_VIEW_BUTTON_IDS[normalizedView]);
    }
```

Replace with:

```js
        const rfiCount = this.teamRfis.length;
        const messageCount = this.directCommunications.length;
        const notificationCount = this.actionNotifications.length;
        const rfiCountElement = document.getElementById('rfiViewCount');
        const messageCountElement = document.getElementById('communicationsViewCount');
        const notificationCountElement = document.getElementById('notificationsViewCount');
        const rfiButton = document.getElementById(FACILITATOR_VIEW_BUTTON_IDS.rfis);
        const communicationsButton = document.getElementById(FACILITATOR_VIEW_BUTTON_IDS.communications);
        const notificationsButton = document.getElementById(FACILITATOR_VIEW_BUTTON_IDS.notifications);
        const workspacePanel = document.getElementById('facilitatorWorkspacePanel');

        if (rfiCountElement) rfiCountElement.textContent = String(rfiCount);
        if (messageCountElement) messageCountElement.textContent = String(messageCount);
        if (notificationCountElement) notificationCountElement.textContent = String(notificationCount);
        rfiButton?.setAttribute('aria-label', `RFIs, ${rfiCount} ${rfiCount === 1 ? 'record' : 'records'}`);
        communicationsButton?.setAttribute(
            'aria-label',
            `Communications, ${messageCount} ${messageCount === 1 ? 'message' : 'messages'}`
        );
        notificationsButton?.setAttribute(
            'aria-label',
            `Notifications, ${notificationCount} ${notificationCount === 1 ? 'item' : 'items'}`
        );
        workspacePanel?.setAttribute('aria-labelledby', FACILITATOR_VIEW_BUTTON_IDS[normalizedView]);
    }
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm test -- src/roles/scribe.test.js -t "Notifications tab count"`
Expected: PASS

- [ ] **Step 11: Run the full scribe test file to check for regressions**

Run: `npm test -- src/roles/scribe.test.js`
Expected: PASS (all tests, no new failures)

- [ ] **Step 12: Commit**

```bash
git add src/roles/scribe.js src/roles/scribe.test.js
git commit -m "feat(scribe): wire action notifications into deck, sync, and view switch"
```

---

### Task 7: scribe.html — add the Notifications tab button (all 4 team files)

**Files:**
- Modify: `teams/blue/scribe.html:94-98`, `teams/red/scribe.html:94-98`, `teams/green/scribe.html:94-98`, `teams/industry/scribe.html:94-98`

**Interfaces:**
- Consumes: `notificationsViewBtn` / `notificationsViewCount` element ids (Task 6 already targets these via `document.getElementById`).
- Produces: nothing consumed by later tasks — this is leaf markup.

- [ ] **Step 1: Confirm the four files are still identical at this block**

Run: `diff <(sed -n '94,98p' teams/blue/scribe.html) <(sed -n '94,98p' teams/red/scribe.html)` and repeat for `green` and `industry`.
Expected: no output (files identical) for all three comparisons. If any file differs, stop and re-read that file before proceeding — do not blindly apply the same edit.

- [ ] **Step 2: Apply the same edit to each of the 4 files**

In each of `teams/blue/scribe.html`, `teams/red/scribe.html`, `teams/green/scribe.html`, `teams/industry/scribe.html`, find:

```html
                        <button class="scribe-view-switch-button" id="communicationsViewBtn" type="button" role="tab" aria-selected="false" aria-controls="facilitatorWorkspacePanel" aria-label="Communications, 0 messages" tabindex="-1" data-facilitator-view="communications"><span>Communications</span><span class="scribe-view-switch-count" id="communicationsViewCount" aria-hidden="true">0</span></button>
                    </div>
```

Replace with:

```html
                        <button class="scribe-view-switch-button" id="communicationsViewBtn" type="button" role="tab" aria-selected="false" aria-controls="facilitatorWorkspacePanel" aria-label="Communications, 0 messages" tabindex="-1" data-facilitator-view="communications"><span>Communications</span><span class="scribe-view-switch-count" id="communicationsViewCount" aria-hidden="true">0</span></button>
                        <button class="scribe-view-switch-button" id="notificationsViewBtn" type="button" role="tab" aria-selected="false" aria-controls="facilitatorWorkspacePanel" aria-label="Notifications, 0 items" tabindex="-1" data-facilitator-view="notifications"><span>Notifications</span><span class="scribe-view-switch-count" id="notificationsViewCount" aria-hidden="true">0</span></button>
                    </div>
```

- [ ] **Step 3: Verify with a manual check**

Run: `grep -c "notificationsViewBtn" teams/blue/scribe.html teams/red/scribe.html teams/green/scribe.html teams/industry/scribe.html`
Expected: `1` for each of the 4 files.

- [ ] **Step 4: Run the scribe test suite to confirm nothing depends on exact button count**

Run: `npm test -- src/roles/scribe.test.js`
Expected: PASS (these are JS unit tests using fake DOM elements, not the real HTML files, so this run should be unaffected — this step is a safety check, not expected to catch anything from this specific change)

- [ ] **Step 5: Commit**

```bash
git add teams/blue/scribe.html teams/red/scribe.html teams/green/scribe.html teams/industry/scribe.html
git commit -m "feat(scribe): add Notifications tab button to all team scribe pages"
```

---

### Task 8: scribe.css — visual styling

**Files:**
- Modify: `styles/pages/scribe.css`

**Interfaces:**
- Consumes: CSS classes/attributes produced by Task 5 (`.scribe-action-notification-slide`, `data-source-team`) and Task 6 (`.is-action-notification` sidebar link class).
- Produces: nothing consumed by later tasks — this is leaf styling. No JS/test changes; visually verified.

- [ ] **Step 1: Add the sidebar link styling**

In `styles/pages/scribe.css`, find (around line 887-903):

```css
.scribe-slide-link.is-proposal {
    background: transparent;
    color: inherit;
    box-shadow: none;
}

.scribe-slide-link.is-proposal:hover,
.scribe-slide-link.is-proposal:focus-visible {
    background: var(--color-surface-alt);
    color: var(--color-text);
    box-shadow: none;
}

.scribe-slide-link.is-proposal.is-active {
    background: var(--color-navy-soft);
    color: var(--color-navy);
}
```

Add immediately after it:

```css
.scribe-slide-link.is-action-notification {
    background: transparent;
    color: inherit;
    box-shadow: none;
}

.scribe-slide-link.is-action-notification:hover,
.scribe-slide-link.is-action-notification:focus-visible {
    background: var(--color-surface-alt);
    color: var(--color-text);
    box-shadow: none;
}

.scribe-slide-link.is-action-notification.is-active {
    background: var(--color-navy-soft);
    color: var(--color-navy);
}
```

- [ ] **Step 2: Add the team-colored accent bar for the notification card**

In `styles/pages/scribe.css`, find `.scribe-proposal-slide::before` (around line 1157-1159):

```css
.scribe-proposal-slide::before {
    background: var(--color-success);
}
```

Add immediately after it:

```css
.scribe-action-notification-slide[data-source-team="blue"]::before {
    background: var(--color-team-blue);
}

.scribe-action-notification-slide[data-source-team="red"]::before {
    background: var(--color-team-red);
}

.scribe-action-notification-slide[data-source-team="green"]::before {
    background: var(--color-team-green);
}

.scribe-action-notification-slide[data-source-team="industry"]::before {
    background: var(--color-team-industry);
}
```

(`.scribe-action-slide::before` at line 1091-1097 already provides the positioned pseudo-element these rules override the background of — no new `::before` structural rule is needed, only the background-color override per team.)

- [ ] **Step 3: Manually verify in the running app**

Run: `npm run dev`, open a team's `scribe.html` (Facilitator UI) as Industry, and use browser devtools to temporarily inject a fake `ACTION_NOTIFICATION` communication into `communicationsStore` (or use the Notifications tab once seeded with real data if available) to confirm: the Notifications tab shows a count, the slide renders with a colored left accent bar matching the source team, the "Informational" badge and "No response needed" line are visible, and there is no button/control suggesting a reply.

- [ ] **Step 4: Commit**

```bash
git add styles/pages/scribe.css
git commit -m "style(scribe): add action notification card and sidebar styling"
```

---

### Task 9: facilitator.js — new response tab

**Files:**
- Modify: `src/roles/facilitator.js`
- Modify: `styles/components/cards.css`
- Test: `src/roles/facilitator.test.js`

**Interfaces:**
- Consumes: `isActionNotificationCommunication` (Task 2), `metadata.action_snapshot` shape from Tasks 1 and 3.
- Produces: a new "Team Action Notifications" tab in the existing tabbed White Cell Responses list. No other task depends on this one.

- [ ] **Step 1: Write the failing test**

In `src/roles/facilitator.test.js`, extend the existing test `'renders White Cell response categories as tabs for single-category scanning'` (starts around line 2811). Add a fourth communication to the `communicationsStore.getAll()` mock array (inside the existing `vi.spyOn(communicationsStore, 'getAll').mockReturnValue([...])` call, as a new array element alongside `comm-direct-group-1`, `comm-update-group-1`, `comm-forwarded-group-1`):

```js
            {
                id: 'comm-action-notification-group-1',
                from_role: 'white_cell',
                to_role: 'blue',
                type: 'ACTION_NOTIFICATION',
                title: 'Green Team Action Notification',
                content: 'Green is adjusting tariffs on agricultural imports.',
                created_at: '2026-04-09T10:12:00.000Z',
                metadata: buildWhiteCellRecipientMetadata('blue', {
                    source_team: 'green',
                    shared_action_id: 'action-1',
                    action_snapshot: { title: 'Agricultural tariff adjustment', objective: 'Protect domestic agriculture.' }
                })
            }
```

Then add these assertions after the existing `expect(responsesList.innerHTML).toContain('Forwarded Proposals<span class="tab-badge">1</span>');` line:

```js
        expect(responsesList.innerHTML).toContain('data-responses-tab="action-notification"');
        expect(responsesList.innerHTML).toContain('Team Action Notifications<span class="tab-badge">1</span>');
```

This test's mocked communications store now has 5 items instead of 4 (the pre-existing `comm-direct-group-1`, `comm-update-group-1`, `comm-forwarded-group-1`, the RFI answer, plus the new `comm-action-notification-group-1`). Update the existing total-count assertion near the end of the same test — currently:

```js
        expect(responsesBadge.textContent).toBe('4');
```

Change to:

```js
        expect(responsesBadge.textContent).toBe('5');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/roles/facilitator.test.js -t "renders White Cell response categories as tabs"`
Expected: FAIL — no `data-responses-tab="action-notification"` in the rendered HTML (the new communication currently falls into the generic `'communication'` group).

- [ ] **Step 3: Import the detector**

In `src/roles/facilitator.js`, the import block at lines 89-95 currently reads:

```js
import {
    WHITE_CELL_UPDATE_KINDS,
    getWhiteCellCommunicationUpdateKind,
    isWhiteCellCommunicationVisibleToLead,
    isWhiteCellSectionUpdate,
    isWhiteCellTimelineEventVisibleToLead
} from '../features/communications/targeting.js';
```

Replace with:

```js
import {
    WHITE_CELL_UPDATE_KINDS,
    getWhiteCellCommunicationUpdateKind,
    isActionNotificationCommunication,
    isWhiteCellCommunicationVisibleToLead,
    isWhiteCellSectionUpdate,
    isWhiteCellTimelineEventVisibleToLead
} from '../features/communications/targeting.js';
```

- [ ] **Step 4: Add the new response-type group**

In `src/roles/facilitator.js`, `RESPONSE_TYPE_GROUPS` (lines 138-169) currently reads:

```js
const RESPONSE_TYPE_GROUPS = [
    {
        key: 'communication',
        kind: 'communication',
        title: 'Direct Communications',
        description: 'White Cell messages sent directly to this team or role.'
    },
    {
        key: 'rfi',
        kind: 'rfi',
        title: 'RFI Answers',
        description: 'Answered requests for information from White Cell.'
    },
    {
        key: 'white-cell-update',
        kind: 'white_cell_update',
        title: 'White Cell Updates',
        description: 'Scenario, journal, and Verba AI updates pushed by White Cell.'
    },
    {
        key: 'proposal',
        kind: 'proposal',
        title: 'Forwarded Proposals',
        description: 'Reviewed proposals forwarded by White Cell for this team.'
    },
    {
        key: 'other',
        kind: 'other',
        title: 'Other Messages',
        description: 'Additional White Cell items that do not match a standard response type.'
    }
];
```

Replace with (new `action-notification` entry inserted before `proposal`, so it reads left-to-right in roughly the same "most actionable to least actionable" order the existing tabs follow):

```js
const RESPONSE_TYPE_GROUPS = [
    {
        key: 'communication',
        kind: 'communication',
        title: 'Direct Communications',
        description: 'White Cell messages sent directly to this team or role.'
    },
    {
        key: 'rfi',
        kind: 'rfi',
        title: 'RFI Answers',
        description: 'Answered requests for information from White Cell.'
    },
    {
        key: 'white-cell-update',
        kind: 'white_cell_update',
        title: 'White Cell Updates',
        description: 'Scenario, journal, and Verba AI updates pushed by White Cell.'
    },
    {
        key: 'action-notification',
        kind: 'action_notification',
        title: 'Team Action Notifications',
        description: 'Informational updates about another team’s action, shared for awareness. No response needed.'
    },
    {
        key: 'proposal',
        kind: 'proposal',
        title: 'Forwarded Proposals',
        description: 'Reviewed proposals forwarded by White Cell for this team.'
    },
    {
        key: 'other',
        kind: 'other',
        title: 'Other Messages',
        description: 'Additional White Cell items that do not match a standard response type.'
    }
];
```

- [ ] **Step 5: Add the detection branch in `buildWhiteCellResponseEntry`**

In `src/roles/facilitator.js`, `buildWhiteCellResponseEntry` (lines 1271-1311) currently reads:

```js
    buildWhiteCellResponseEntry(communication = {}) {
        const updateKind = getWhiteCellCommunicationUpdateKind(communication);
        const audienceLabel = this.getCommunicationAudienceLabel(communication);

        if (updateKind === WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL) {
```

Replace the opening of the method with:

```js
    buildWhiteCellResponseEntry(communication = {}) {
        const updateKind = getWhiteCellCommunicationUpdateKind(communication);
        const audienceLabel = this.getCommunicationAudienceLabel(communication);

        if (isActionNotificationCommunication(communication)) {
            return this.buildActionNotificationResponseEntry(communication);
        }

        if (updateKind === WHITE_CELL_UPDATE_KINDS.TRIBE_STREET_JOURNAL) {
```

(Leave everything else in the method body unchanged.)

Then, immediately after the closing `}` of `buildWhiteCellResponseEntry` (before `getResponseTypeGroups`), add the new method:

```js
    buildActionNotificationResponseEntry(communication = {}) {
        const metadata = communication?.metadata && typeof communication.metadata === 'object'
            ? communication.metadata
            : {};
        const snapshot = metadata.action_snapshot && typeof metadata.action_snapshot === 'object'
            ? metadata.action_snapshot
            : {};
        const sourceTeamLabel = this.formatTeamLabel(metadata.source_team || '');
        const actionTitle = snapshot.title || communication.title || 'Untitled action';
        const actionViewModel = getBlueActionViewModel({ artifact_payload: { action: snapshot } });
        const summaryParts = [];
        if (actionViewModel.objective) {
            summaryParts.push(`Objective: ${actionViewModel.objective}`);
        }
        if (actionViewModel.instrumentOfPower) {
            summaryParts.push(`Instrument: ${actionViewModel.instrumentOfPower}`);
        }
        const summaryLine = summaryParts.join(' | ');
        const noteText = communication.content || '';
        const content = [summaryLine, noteText].filter(Boolean).join('\n\n');

        return {
            id: communication.id,
            kind: 'action_notification',
            created_at: communication.created_at,
            title: `${sourceTeamLabel} Team Action: ${actionTitle}`,
            subtitle: 'Informational — no response needed',
            content,
            badgeText: 'INFORMATIONAL',
            badgeVariant: 'default'
        };
    }
```

- [ ] **Step 6: Preserve multi-line content readability**

In `styles/components/cards.css`, `.response-card__content` (around line 647-652) currently reads:

```css
.response-card__content {
    margin: 0;
    color: var(--color-text);
    font-size: var(--text-sm);
    line-height: var(--leading-relaxed);
}
```

Replace with:

```css
.response-card__content {
    margin: 0;
    color: var(--color-text);
    font-size: var(--text-sm);
    line-height: var(--leading-relaxed);
    white-space: pre-line;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- src/roles/facilitator.test.js -t "renders White Cell response categories as tabs"`
Expected: PASS

- [ ] **Step 8: Run the full facilitator test file to check for regressions**

Run: `npm test -- src/roles/facilitator.test.js`
Expected: PASS (all tests, no new failures)

- [ ] **Step 9: Commit**

```bash
git add src/roles/facilitator.js src/roles/facilitator.test.js styles/components/cards.css
git commit -m "feat(facilitator): add Team Action Notifications response tab"
```

---

## Final verification

After all 9 tasks are complete:

- [ ] Run the full unit test suite: `npm test`. Expected: all tests pass.
- [ ] Run `npm run build` to confirm no build-time errors from the HTML/CSS/JS changes.
- [ ] Manually rehearse the flow end to end against a real (or locally-run) Supabase project with the new migration applied: submit a Blue action requesting Industry be informed, complete it, confirm Industry's `scribe.html` Notifications tab and `facilitator.html` Team Action Notifications tab both show it with the Blue team label and no reply affordance; then use White Cell's "Share with Red Team" on a Blue action and confirm Red sees the equivalent card on both surfaces.
