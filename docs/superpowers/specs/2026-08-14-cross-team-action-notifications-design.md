# Cross-team action notification formatting

**Date:** 2026-08-14
**Status:** Approved for planning

## Problem

When Blue (or Red) submits an action and requests that Green/Industry be informed, or
White Cell manually shares a Blue action with Red Team, the receiving team currently
sees a generic, unclear artifact on both of their role surfaces:

- **scribe.js** ("Facilitator" UI): the notification lands in the private Communications
  thread as a plain chat bubble labeled just "White Cell" — visually identical to an
  actual back-and-forth conversation the team could reply to.
- **facilitator.js** ("Scribe" UI): the notification lands in the generic "White Cell
  Responses" list as a card titled "White Cell Communication" with a badge showing the
  raw type string (`ACTION_NOTIFICATION` or `GUIDANCE`).

Neither surface makes it obvious (a) which team the action belongs to, or (b) that the
item is informational only and does not require a response.

## Current delivery paths

Two mechanisms deliver an action to another team today:

1. **Blue/Red → Green/Industry.** The action wizard's "Teams to inform" step
   (`completeActionWithNotifications` in `database.js`, backed by the
   `operator_complete_action_with_notifications` SQL function) creates a communication
   with `type: 'ACTION_NOTIFICATION'` and metadata `source_team`, `shared_action_id`,
   `recipient_team`, and `action_snapshot` (the action's structured details object).

2. **White Cell → Red Team.** The "Share with Red Team" button
   (`shareActionWithRedTeam` in `whitecell.js`) creates a communication with
   `type: 'GUIDANCE'`, plain-text content, and metadata `source_team` +
   `shared_action_id` — but no `action_snapshot` today.

Both paths already share the `source_team` / `shared_action_id` metadata vocabulary,
which this design builds on.

## Data flow changes

### 1. Enrich the Red-team share path

In `whitecell.js`'s `shareActionWithRedTeam`, add `action_snapshot` to the metadata
passed to `buildWhiteCellRecipientMetadata`, using the same structured details already
available on the `action` object passed into the function
(`action.artifact_payload?.action || null`). This is a client-side change to an existing
`database.createCommunication` call — no SQL/RPC changes required. After this change, all
three recipient teams (Green, Industry, Red) receive a communication with the same
metadata shape.

### 2. Shared detector

Add `isActionNotificationCommunication(communication)` (new export, likely in
`src/features/communications/targeting.js` alongside the other visibility helpers) that
returns true when:

```js
type === 'ACTION_NOTIFICATION'
  || (type === 'GUIDANCE' && Boolean(metadata.shared_action_id))
```

Both `scribe.js` and `facilitator.js` import and use this single helper, so the two
surfaces can never drift on which communications get the new treatment.

## scribe.js ("Facilitator" UI)

- Add a fifth sidebar view-switch tab, **Notifications**, alongside the existing Team
  Action Review / Deck / RFIs / Communications tabs, with its own unread-count badge
  (same pattern as the existing RFI/Communications counts).
- Add a new deck section (parallel to the existing Proposals section) populated from
  communications matched by `isActionNotificationCommunication`, filtered to those
  visible to this team via the existing `isWhiteCellCommunicationVisibleToScribe`.
- Add `renderActionNotificationSlide`, modeled on the structure of the existing
  `renderProposalSlide`, but with no decision/reply affordance:
  - Eyebrow states the source team explicitly, e.g. "Blue Team", not "White Cell".
  - An "Informational" pill next to the team badge.
  - An explicit one-line statement under the title: "No response needed — shared for
    awareness."
  - Objective / instrument / sector summary rendered from `action_snapshot` when
    present, using the existing `getBlueActionViewModel`-style field access.
  - The White Cell clarifying note / shared content, clearly labeled as a note, not as
    a message thread.
  - No accept/decline/reply controls anywhere on the card.
- Update `isFacilitatorDirectCommunication` to exclude communications matched by
  `isActionNotificationCommunication`, the same way it already excludes
  `PROPOSAL_FORWARDED` — so these no longer also appear disguised as a chat bubble in
  the Communications thread.

## facilitator.js ("Scribe" UI)

- Add a new entry to `RESPONSE_TYPE_GROUPS`:
  ```js
  { key: 'action-notification', kind: 'action_notification',
    title: 'Team Action Notifications',
    description: 'Informational updates about another team's action, shared for awareness.' }
  ```
- Add a branch in `buildWhiteCellResponseEntry` (checked before the generic fallback)
  that detects these via `isActionNotificationCommunication` and returns:
  ```js
  {
      kind: 'action_notification',
      title: `${sourceTeamLabel} Team Action`,   // e.g. "Blue Team Action"
      subtitle: 'Informational — no response needed',
      content: <note text, plus a compact objective/instrument summary line if snapshot present>,
      badgeText: 'INFORMATIONAL',
      badgeVariant: 'neutral'
  }
  ```
- Reuses the existing `renderResponseCard` shell (title/subtitle/badge/content) — no new
  markup structure, just clearer copy and a badge that reads "INFORMATIONAL" instead of
  the raw communication type string.
- The existing `directResponses` filter (which already excludes `PROPOSAL_FORWARDED`
  from the generic bucket) is extended to also exclude anything matched by
  `isActionNotificationCommunication`, so it isn't double-counted in "Other Messages".

## Visual language

- Source-team badge uses the existing team color tokens
  (`--color-team-blue/green/red/industry`, already defined for light and dark mode in
  `styles/base/variables.css`) — no new tokens needed.
- "Informational" pill uses a neutral badge variant, visually distinct from the
  warning/success variants used for decisions elsewhere (e.g. RFI answered, proposal
  response).

## Scope

- Applies uniformly to Green, Industry, and Red — all three recipient teams get the
  same dedicated treatment, since they already share the same underlying data shape
  after the Red-path enrichment.
- Does not change the sending/authoring side UI (the Blue/Red action wizard's "Teams to
  inform" step, or White Cell's "Share with Red Team" button) beyond the metadata
  enrichment described above.
- Does not add any acknowledgment/read-receipt mechanic — these are simple informational
  reads, consistent with how the rest of the notification system works today.

## Testing

- Unit tests for `isActionNotificationCommunication` covering both source types and the
  negative cases (plain `GUIDANCE` without `shared_action_id`, other communication
  types).
- `scribe.test.js`: new Notifications section appears with correct unread count, slide
  renders source team/informational framing correctly for both snapshot-present and
  snapshot-absent cases, excluded from the Communications thread.
- `facilitator.test.js`: new response tab appears, card shows correct title/badge, and
  the item is excluded from "Other Messages".
- `whitecell.test.js`: `shareActionWithRedTeam` attaches `action_snapshot` to the created
  communication's metadata.
