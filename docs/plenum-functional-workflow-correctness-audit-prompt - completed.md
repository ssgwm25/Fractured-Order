# PLENUM FUNCTIONAL AND WORKFLOW CORRECTNESS AUDIT

## Role and objective

Act as a senior QA engineer, product architect, and simulation-workflow analyst preparing PLENUM for user handover.

Establish whether each supported task performs the intended operation, produces the correct persisted state, reaches the correct role, and enables the correct next action. Identify broken, incomplete, ambiguous, or inconsistent workflows.

Produce an evidence-based audit before implementing fixes. Do not substitute an interface review, code inspection, or successful happy-path demonstration for functional verification.

Read `DESIGN_STANDARDS.md`, `WRITING_STANDARDS.md`, current workflow/specification documents, role definitions, and relevant architecture documentation where available. Identify missing or conflicting requirements. Treat agreed product behavior as the intended contract; inspect the code to establish actual behavior. Do not quietly redefine a requirement to match the implementation.

## 1. Establish the functional contract

Inventory supported roles, record types, screens, operations, statuses, move/phase restrictions, and scenario-specific rules. Separate intentional restrictions, absent functionality, regressions, and defects.

Inspect Participant/team member, Scribe, Facilitator, Notetaker, White Cell, Observer, and Game Master/administrator where implemented. Do not assume that all roles can author, review, or complete the same records.

Map applicable tasks:

```text
sign in, select session/role/team, and enter the correct workspace
create, save, reopen, edit, and discard a draft
record Strategic Orientation or Strategic Plan where supported
create Action or Proposal
forward to Facilitator
Facilitator review and submission to White Cell
White Cell return, adjudication, or completion as specified
originator revision and resubmission
send, receive, and answer an RFI
respond to a proposal or communication where supported
review queues, details, history, and presentation views
move/phase changes, locks, deadlines, and session closure
reopen records and export supported outputs
```

Use current canonical vocabulary. Establish whether “complete,” “accept,” and “adjudicate” are distinct operations. Do not impose an example lifecycle on incompatible record types.

For the Industry workflow, verify the agreed contract against current specifications: the Industry Turn Sheet is the Proposal record forwarded through Facilitator to White Cell; do not require a second duplicate proposal. Additional proposals from the same industry in the same move omit Environment Read and Supply Chain already captured in the first proposal. Check how those shared sections are referenced and what happens if the first proposal is revised or returned. Flag unresolved semantics rather than guessing.

## 2. Create an operation and transition matrix

For every supported transition, define:

| Record / operation | Acting role | Starting state | Preconditions / scope | Input requirements | Expected persisted result | Intended recipient | Next permitted action | Invalid attempts |
|---|---|---|---|---|---|---|---|---|

Include team/session ownership, assignment, move/phase, revision, permission, and deadline conditions where relevant.

Check enforcement both through the interface and the actual server/API boundary. A disabled or hidden button alone does not establish that an invalid operation is prevented.

Explicitly identify terminal states, repeatable operations, return destinations, editable fields, and whether resubmission re-enters Facilitator review. Resolve from authoritative requirements; record uncertainty when requirements are missing.

## 3. Execute representative complete workflows

Use controlled fixtures and separate authorized accounts/sessions for relevant roles. Exercise a complete simulation sequence, not only isolated modal submissions.

For each workflow verify:

1. The correct form opens with correct defaults and field visibility.
2. Required inputs, formats, and cross-field constraints are enforced.
3. Saving preserves all intended fields and relationships.
4. The sender sees truthful confirmation and the correct state.
5. The intended recipient sees the correct record and revision.
6. Details, queue placement, badges/counts, notifications, and presentation views agree.
7. The next permitted operation works; forbidden operations are rejected.
8. A reload, fresh login, or other client shows the same durable result.
9. The operation produces the expected history/audit evidence.

Inspect the stored result or an authoritative read, not only optimistic client state. Test draft reopening, returned records, and revision/resubmission through to final completion.

## 4. Test negative and boundary cases

Include:

```text
missing, malformed, long, and boundary-value input
empty optional sections and all supported field combinations
wrong role, team, session, assignment, or record state
record changed after the form was opened
move/phase/deadline changed while the form remained open
expired authentication or revoked access during an operation
duplicate click, repeated submission, or refresh during saving
failed request, timeout, lost response, retry, and reconnect
cancel/back/Escape/close with unsaved changes
empty queues, completed records, and unavailable referenced records
opening a deep link directly or after session/role switching
browser back/forward and multiple tabs
```

Determine the intended result for each case before declaring pass/fail. A failed write must not appear completed. A draft must not route to reviewers. A returned record must retain the relevant revision request and correct ownership.

Cross-reference the data-integrity audit for race cases; this audit verifies their user-visible workflow consequences.

## 5. Test simulation lifecycle boundaries

Check move/phase transitions against the actual configuration and rules. Verify records are attributed to the correct session and move, locks are enforced, queues retain appropriate history, and users cannot perform a stale operation through an old tab.

Test session closure, archive, reopen, reset, or cloning only where supported. Establish what is preserved, copied, or cleared. Verify a new simulation does not accidentally inherit previous participants, assignments, confidential content, or pending records.

Test timers/deadlines against the authoritative time source and defined cutoff rules, including a request arriving near a boundary. Do not invent a grace period or assume client time is authoritative.

## 6. Evidence, coverage, and defect reporting

Create a test matrix:

| Test ID | Requirement / workflow | Role and starting fixture | Steps | Expected result | Actual result | Durable/cross-role evidence | Pass / fail / blocked / not tested |
|---|---|---|---|---|---|---|---|

Create a defect table:

| ID | Workflow / role / state | Reproduction | Expected versus actual | Cause / file reference | Impact | Priority | Correction | Retest criteria |
|---|---|---|---|---|---|---|---|---|

Record application version, environment, test data, browser, and relevant scenario configuration. Distinguish runtime-confirmed defects from source-inferred risks. Code review is useful evidence but is not an executed workflow test.

Do not expose real participant content in the report. Use a controlled environment for mutation/failure tests, leaving live simulations undisturbed.

## 7. Priorities and handover decision

Use:

- **P0:** unauthorized transition, lost work, wrong recipient, false completion, or corruption of consequential state.
- **P1:** supported critical workflow cannot complete or requires undocumented manual repair.
- **P2:** functional inconsistency or recovery friction with a reliable documented workaround.
- **P3:** limited-impact issue that preserves intended behavior and task completion.

Recommend ready, ready with explicit limitations, or not ready. Give evidence for the decision. Identify critical flows not tested and unresolved requirements; do not count them as passes.

The handover gate should include all supported critical role workflows passing, invalid transitions rejected at the server boundary, durable state verified, and no unresolved critical defects. Explicitly record accepted lower-priority limitations and their owners.

## 8. Required deliverable and remediation

Create `PLENUM_FUNCTIONAL_WORKFLOW_AUDIT.md` in the repository containing:

1. Executive assessment and handover recommendation.
2. Functional contract and requirement ambiguities.
3. Role/record/transition matrix.
4. Complete workflow and lifecycle coverage.
5. Executed test matrix with evidence and untested conditions.
6. Prioritized defects and concrete code references.
7. Bounded remediation batches and regression scope.
8. Acceptance criteria, owners, and required retests.

Summarize the highest-impact defects and the first recommended correction batch. Implement only within separately authorized scope. Preserve agreed workflow semantics, permissions, persistence contracts, and auditability.

Verify fixes through the original failed path, relevant negative paths, and affected shared consumers. Do not close a defect merely because its button, label, or code has changed.
