Action items
[ ] Step 1 — Establish the lifecycle and database contract
Prompt:
Read AGENTS.md, README.md, the current action/request/communication schema, data/2026-07-29_return_action_to_blue.sql, data/2026-06-03_proposal_response_finalization_lock.sql, src/core/enums.js, src/services/database.js, and the migration contract tests before editing.
Add an additive migration establishing team-neutral artifact workflow metadata without rewriting historical rows. Support draft, forwarded_to_facilitator, submitted_to_white_cell, returned_to_team, resubmitted, and completed states. Keep existing database status values compatible and use workflow_state for the richer lifecycle.
Replace the Blue-only return operation with an artifact-aware White Cell review RPC that can:
complete an action or Strategic Orientation without recording an outcome;
return Blue or Red actions to their submitting team;
return Strategic Orientation artifacts;
return RFIs for clarification;
require reviewer notes for every return;
record revision number, reviewer role, timestamps, and prior state;
reject cross-team, unauthorized, stale-revision, and completed-artifact writes.
Preserve compatibility with historical returned_to_blue rows and, if needed, retain the old RPC as a wrapper. Update src/services/database.js, src/services/supabaseMock.js, consolidated schema files, migration contract tests, Supabase setup documentation, and rollback documentation. Do not run migrations or tests; provide the exact human-run verification commands and expected results.

Acceptance criteria:
Blue and Red returns use one authorization contract.
Completion does not require or mint an outcome.
Return notes and revision metadata are persisted atomically.
Legacy rows remain readable and labeled accurately.
The deterministic mock mirrors live Supabase behavior.

## Completed: 8/5/2026

[ ] Step 2 — Centralize artifact lifecycle, detail, and badge rendering
Prompt:
Read the shared action, proposal, request, badge, and role-card helpers before editing. Create or extend shared view models so every role renders the same lifecycle labels and artifact details.
Update src/features/actions/blueActionDetails.js and its tests so White Cell receives every recorded field, including all instruments of power, Red levers, supply-chain decision, action angles, supply-chain areas, sectors, countries, coordination, and informed/engaged selections.
Update the proposal serializer/parser to support:
recipientTeams[];
focusSectors[];
supply-chain decision, angles, and areas;
Industry focus;
country focus;
proposed activity;
revision metadata.
Continue parsing historical Category, Delivery, single-recipient, and single-sector records.
Centralize lifecycle badges. Proposal cards must never render SUCCESS, PARTIAL_SUCCESS, FAIL, or BACKFIRE. A submitted proposal awaiting White Cell action should show “Deliberation Underway”; recipient-specific approval states should be shown separately; returned artifacts should show “Returned by White Cell”; completed artifacts should show “Completed.” Historical outcome values must remain available to exports but not to current entity cards.
Add narrow unit tests proving exact fields and badges. Do not run tests.

Acceptance criteria:
All roles derive labels from the same workflow-state mapping.
Proposal cards cannot accidentally fall back to outcome badges.
New proposal data round-trips without losing multi-select fields.
Historical serialized artifacts still render safely.
Tests:
Provide the commands for testing the updates
Commit:
Provide the commit title and description

## Completed: 8/5/2026

[ ] Step 3 — Replace White Cell action and Strategic Orientation adjudication
Prompt:
Read whitecell.html, src/roles/whitecell.js, its unit tests, action-store behavior, timeline behavior, and the new workflow RPC from Step 1.
Rename “Record Deliberation” to “Review Action.” Remove the outcome selector and offer only:
“Accept as Complete”;
“Send Back for Improvement.”
Require notes for send-back and make notes optional for acceptance. Use submitting-team-aware language rather than “Blue” in generic controls, loaders, errors, timeline events, and success messages. Apply the same decision model to “Review Strategic Orientation.”
Add a White Cell Returned/Revision History view so returned actions and Strategic Orientation artifacts remain visible after leaving the pending queue. Show the submitting team, revision number, return notes, reviewer, and timestamp. Ensure White Cell sees all action fields from Step 2, especially action angles, supply-chain areas, instruments of power, and Red levers.
Update unit tests that currently expect “Record Deliberation,” an outcome selector, or Blue-only returns. Add tests for Red returns, Strategic Orientation returns, stale-revision rejection, completion without outcome, and retained history. Update relevant runbook instructions. Do not run tests.

Acceptance criteria:
Action and SO review contains no outcome control.
Blue and Red receive correct team-specific send-back behavior.
Returned artifacts remain visible to White Cell.
Accepting marks the artifact complete without assigning success or failure.
Tests:
Provide the commands for testing the updates
Commit:
Provide the commit title and description

## Completed: 8/5/2026

[ ] Step 4 — Complete the action return, layout, and informed-team experience
Prompt:
Read src/roles/facilitator.js, src/roles/scribe.js, their tests, the four team HTML surfaces, styles/pages/scribe.css, and the shared action serializers. Remember that teams/*/facilitator.html is the user-facing Scribe workspace and teams/*/scribe.html is the actual Facilitator workspace; preserve these legacy identifiers.
Add a distinct action field allowing Blue and Red to select Green, Industry, or both as teams to inform. When at least one is selected, require a clarifying note. Do not overload the existing Facilitator Informed/Engaged Industry/Allies decision fields; persist this as separate action-notification metadata.
On Scribe and Facilitator cards, show:
forwarded to Facilitator;
submitted to White Cell;
deliberation underway;
returned by White Cell;
resubmitted;
completed.
Returned artifacts must show White Cell notes and revision number and become editable and resubmittable. Completed artifacts must remain read-only.
Replace the current vertical action navigation with an accessible horizontal mark rail for Strategic Orientation and existing Moves 1–3 on the Blue Facilitator and White Cell surfaces. Give every mark a count and zero state; show newest records first within a mark; allow keyboard navigation; and use horizontal scrolling on narrow screens without page-level overflow.
Add unit tests for action metadata, lifecycle cards, return editing, rail grouping, keyboard behavior, and responsive CSS contracts. Update the live-demo runbook. Do not run tests.

Acceptance criteria:
Green/Industry notification selections and notes survive edit and review.
Returned actions can be corrected and resubmitted exactly once per revision.
The latest mark is accessible without scrolling to the bottom of the page.
The rail remains keyboard and mobile accessible.
Tests:
Provide the commands for testing the updates
Commit:
Provide the commit title and description

## Completed: 8/5/2026

[ ] Step 5 — Rebuild Green and Industry proposal forms
Prompt:
Read the current proposal form, serializer, view model, tests, export mappings, and Green/Industry role surfaces before editing.
Remove Proposal Category and Delivery from all new Green and Industry proposal forms. Preserve them only when rendering historical records.
Add:
Blue and Red intended-partner checkboxes;
separate multi-select focus-sector checkboxes;
supply-chain Yes/No;
conditional action-angle checkboxes;
conditional supply-chain-area checkboxes.
Give Industry a distinct US-industry form containing industry of focus, country of focus, and proposed activity. Do not render the Green form under an Industry label.
Support selecting both Blue and Red, but store each as a proposed recipient awaiting separate White Cell approval. Validate at least one intended partner and one focus sector. Preserve custom “Other” values where the existing design system supports them.
Allow a proposal returned by White Cell to reopen in edit mode with reviewer notes and revision history visible. Resubmission must update the logical proposal revision rather than creating an unrelated proposal.
Update proposal parser, serializer, cards, presentation view, unit tests, E2E helpers, exports, and operator documentation. Do not run tests.

Acceptance criteria:
New proposals contain no Category or Delivery controls.
Partner and sector selections are independent checkbox groups.
Industry has the required industry, country, and activity fields.
Historical proposal fields remain readable.
Returned proposals retain identity and revision history.
Tests:
Provide the commands for testing the updates
Commit:
Provide the commit title and description

## Completed: 8/5/2026

[ ] Step 6 — Add per-recipient White Cell approval and multi-round proposal threads
Prompt:
Read the White Cell proposal review code, proposal recipient-state helpers, communications store, Realtime synchronization, data/2026-06-03_proposal_response_finalization_lock.sql, RLS policies, the mock backend, and existing proposal-response tests before editing.
Replace one proposal-wide approval with independent recipient approval. If Blue and Red were selected, White Cell must see separate controls for each. Approving Blue must not forward to Red or alter Red’s state. Each recipient should independently support pending approval, approved/forwarded, response received, negotiation underway, and closed.
Replace the one-shot final-response contract with append-only proposal threads. Every message must include a stable thread ID, recipient team, round number, parent message ID, source proposal ID, source revision, sender team/role, timestamp, and message type. Do not overwrite prior responses.
Allow the proposing Facilitator to answer a recipient response, producing another round. Notify White Cell on every new round. Keep Blue and Red threads isolated even when they originate from the same proposal.
Remove proposal outcome badges and stop translating new proposal review decisions into success/failure presentation states. Retain historical outcome data for export compatibility.
Update live RLS/RPC behavior, mock parity, Realtime reconciliation, deduplication, White Cell UI, Facilitator UI, unit tests, E2E helpers, and runbooks. Do not run tests.

Acceptance criteria:
White Cell separately approves each recipient.
One recipient can be approved while the other remains pending.
Multiple response rounds remain ordered and immutable.
Every new round notifies White Cell exactly once.
Cross-team and cross-session thread access fails closed.
Tests:
Provide the commands for testing the updates
Commit:
Provide the commit title and description

## Completed: 8/6/2026

[ ] Step 7 — Move communications and RFI authority to the actual Facilitator
Prompt:
Read the role-routing compatibility note in README.md, all four teams/*/facilitator.html and teams/*/scribe.html files, src/roles/facilitator.js, src/roles/scribe.js, request-store code, communications targeting, database/RLS policies, and related tests.
Add Communications and RFI sections to the actual user-facing Facilitator surface implemented by teams/*/scribe.html and src/roles/scribe.js. Do not rename legacy routes, role IDs, or storage keys.
Communications must let the Facilitator send a direct text message to White Cell and retain inbound and outbound history. Enforce session and team isolation.
Move RFI creation authority from the user-facing Scribe workspace to the actual Facilitator. Remove Priority from the UI, validation, payload, test helpers, and current-run exports. Historical priority values may remain in legacy exports.
Add RFI states for pending, returned for clarification, resubmitted, and answered. White Cell must be able to return an RFI with required notes. The Facilitator must see those notes, edit the same RFI, and resubmit it. White Cell must have separate Pending and Answered/History views so the question and final response remain visible after answering.
Update HTML, controllers, stores, RPC/RLS behavior, mock backend, tests, exports, README, and runbooks. Do not run tests.

Acceptance criteria:
Only the actual Facilitator can create or resubmit an RFI.
The RFI form has no Priority field.
Returned RFIs retain notes and revision identity.
Answered RFIs remain visible to White Cell.
Facilitator-to-White Cell communication is persisted and isolated.
Tests:
Provide the commands for testing the updates
Commit:
Provide the commit title and description

[ ] Step 8 — Make inbound workflow notifications persist until dismissed
Prompt:
Read src/components/ui/Toast.js, notification tests, Facilitator activity-bell logic, White Cell arrival cues, communications synchronization, and Realtime reconciliation before editing.
Keep normal save confirmations, validation errors, and operational feedback timed. Make only inbound workflow notifications persistent until explicitly dismissed:
an artifact returned by White Cell;
a new artifact submitted to White Cell;
a proposal response or follow-up round;
an RFI return or answer;
a direct White Cell/Facilitator communication.
Use persisted communication or event IDs for deduplication. Do not announce records loaded during initial synchronization as new. Ensure missed-event reconciliation produces exactly one notification after reconnection.
Every durable notification must identify the source, artifact, and required action and provide a keyboard-accessible dismissal control plus a way to navigate or focus the relevant record. Keep unread badges and NEW indicators until the destination item is opened.
Add unit tests for timed versus persistent behavior, manual dismissal, deduplication, startup suppression, reconnection, focus behavior, reduced motion, and accessible announcements. Update runbook notification checks. Do not run tests.

Acceptance criteria:
Inbound workflow notices never auto-dismiss.
Ordinary success/error feedback retains its current timing.
Startup does not replay historical notices.
Reconnect does not duplicate notices.
Dismissal and navigation work by keyboard and screen reader.
Tests:
Provide the commands for testing the updates
Commit:
Provide the commit title and description

[ ] Step 9 — Align exports, audit evidence, and documentation
Prompt:
Read all research export builders and tests, the current schema version, README, Supabase setup guide, live-demo runbook, playthrough automation guide, deployment guide, and rollback guide.
Extend exports to include:
workflow state and revision number;
return notes, reviewer, and timestamps;
informed Green/Industry audiences and note;
proposal recipient approvals;
proposal response thread and round metadata;
new Green/Industry proposal fields;
RFI revision and answer history.
Preserve historical outcome fields in JSON, CSV, HTML, and LaTeX evidence. Label them as historical/legacy adjudication data when applicable. Do not show those values as current proposal workflow badges or infer new outcomes for completed artifacts.
Increment the research export schema version if the exported contract changes. Update manifest validation and deterministic reconstruction logic.
Remove stale documentation that requires Proposal Category, Delivery, RFI Priority, one-shot proposal responses, outcome-based action/SO review, Blue-only return, or vertical action navigation. Document the per-recipient approval model and migration/rollback order.
Add export and documentation contract tests. Do not run tests.

Acceptance criteria:
Historical outcomes remain reproducible in exports.
Current UI workflow states are not represented as adjudication outcomes.
New revision and thread data reconcile across UI and exports.
Operator documentation matches the implemented runtime.
Tests:
Provide the commands for testing the updates
Commit:
Provide the commit title and description

[ ] Step 10 — Add integrated gates and prepare the staged rollout
Prompt:
Read the completed changes from Steps 1–9 and update the professional playthrough without weakening existing role, isolation, Realtime, or scale gates.
Add end-to-end coverage for:
Blue action return, edit, and resubmission;
Red action return, edit, and resubmission;
Strategic Orientation return and completion without outcome;
full White Cell action-field visibility;
Green and Industry proposal creation with the new fields;
a dual-recipient proposal where Blue is approved before Red;
independent Blue and Red response threads;
multiple proposal negotiation rounds;
proposal cards without outcome badges;
Facilitator-to-White Cell communication;
returned RFI editing and resubmission;
answered RFI retention;
persistent inbound notifications;
startup and reconnect deduplication;
export reconciliation.
Keep deployment additive: apply the database/RLS migration to a dedicated rehearsal environment before deploying the frontend. Roll back the frontend first if necessary and leave additive schema and historical records intact.
Do not execute commands. Return the exact commands the human must run and the pass criteria:
npm test -- --run
npm run build
npm run test:e2e:smoke
npm run test:e2e:playthrough
npm run test:e2e:realtime
npm run test:e2e:rehearsal
Treat missing evidence, stale deployment assets, cross-team leakage, duplicate notifications, disappearing RFI history, missing return notes, or outcome badges on current proposals as release blockers.

Acceptance criteria:
All unit, build, smoke, playthrough, Realtime, and rehearsal gates pass from the same commit and migration state.
No console or page errors occur.
Database and deterministic mock results agree.
Export counts and revision/thread histories reconcile with the UI.
Rollback instructions are reproducible and non-destructive.
Tests:
Provide the commands for testing the updates
Commit:
Provide the commit title and description