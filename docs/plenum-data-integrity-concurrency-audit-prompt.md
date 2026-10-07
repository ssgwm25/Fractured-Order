# PLENUM DATA INTEGRITY AND CONCURRENCY AUDIT

## Role and objective

Act as a senior database engineer, distributed-systems engineer, and application reliability engineer preparing PLENUM for user handover.

Determine whether information remains correct under simultaneous activity, retries, interruptions, stale clients, and partial failures. Identify silent overwrites, duplicate operations, invalid states, inconsistent relationships, and divergence between persisted data and user views.

Produce an audit before implementing fixes. Do not assume transactions, revision checks, idempotency, or realtime ordering exist merely because the interface appears correct.

Read current data/workflow specifications, database schema and migrations, API/RPC contracts, permissions, client state management, and relevant architecture documents. Separate intended invariants from actual enforcement. Record missing decisions rather than inventing them.

## 1. Inventory entities, relationships, and sources of truth

Inspect implemented sessions, actors/accounts, role assignments, teams/cells/industries, moves/phases, drafts, Actions, Proposals, Strategic Orientations/Plans, RFIs, responses, review notes, revisions, attachments, notifications, and audit events.

For each entity identify:

| Entity | Authoritative storage | Identity / scope | Ownership | Relationships | Mutable fields | Revision / conflict mechanism | Deletion / retention behavior |
|---|---|---|---|---|---|---|---|

Distinguish canonical records from copies, snapshots, derived counts, cached projections, and presentation models. Identify duplicated state and its synchronization mechanism.

Inspect the Industry Turn Sheet/Proposal as one canonical record where specified. Establish how additional proposals within the same industry/move reference Environment Read and Supply Chain captured in the first proposal, and which revision they use. Flag ambiguity about subsequent edits, returns, or deletion of that source record.

## 2. Define invariants before testing

Document requirements such as:

```text
records belong to the correct session, team, move, and authorized actor
workflow transitions occur only from permitted states
required related records exist and reference the intended revision
the same intended operation does not create multiple consequential results
stale writes cannot silently overwrite a newer committed decision
failed operations do not leave unintended partial durable state
older events/responses cannot replace newer authoritative state
completion cannot coexist with an incompatible pending/revision state
recipient queue/counts converge with the canonical records
changes requiring audit evidence produce that evidence reliably
```

These are candidate invariants. Confirm their exact applicability with the real requirements. Not every record requires a uniqueness rule or the same consistency model.

For each invariant document its enforcement point: database constraint, transaction, server check, revision condition, idempotency key, reconciliation, or UI-only logic. Identify rules that can fail if two clients pass the same precheck simultaneously.

## 3. Inspect write paths and atomicity

Trace each consequential operation from client request to all durable changes and side effects. Determine which changes share a transaction and which occur separately.

Inspect:

- read-modify-write sequences and stale precondition checks;
- uniqueness, foreign-key, required-value, and valid-state constraints;
- revision checks, compare-and-swap, optimistic locking, or explicit locking where present;
- transaction isolation and scope appropriate to actual contention;
- parent/child, record/revision, status/routing, and response relationships;
- write success followed by failed notification, job, attachment, or audit creation;
- server success followed by lost response and a client retry;
- callbacks or background work executing after the originating context changes.

A client check is not a substitute for server/database enforcement. A sequence of successful API calls is not proof of atomicity.

Identify the smallest safe enforcement change for each demonstrated gap. Do not prescribe stronger isolation or blanket locking without evidence; account for contention and retry behavior.

## 4. Execute controlled concurrency scenarios

Use distinct clients/accounts and a repeatable test harness or synchronization barrier where available. Show the actual overlap; sequential requests do not demonstrate race safety.

| Scenario | What to establish |
|---|---|
| Two authorized editors save the same draft | Conflict is handled according to the explicit policy; no silent unintended overwrite. |
| Old form saves after a newer revision commits | Stale input is rejected, reconciled, or deliberately merged with clear evidence. |
| Two reviewers act on the same record | Incompatible transitions cannot both take effect. |
| Return/revise races with complete/adjudicate | One valid authoritative outcome results; the loser receives truthful feedback. |
| Duplicate click or retry after timeout | One intended consequential operation has one logical result. |
| Phase closes while an operation is in flight | The documented cutoff rule is enforced at the authoritative boundary. |
| Role/assignment changes while a form is open | Subsequent action uses current authorization rather than stale client permission. |
| Duplicate/out-of-order event or response arrives | Older state does not replace a newer revision or inflate counts. |
| Two Industry proposals are created together | Shared first-proposal context follows the defined industry/move invariant. |
| Multiple RFIs/answers or notifications arrive | Distinct valid operations are preserved; duplicates are handled correctly. |

Add platform-specific scenarios found during inspection. Repeat enough to support the conclusion and report run counts; one successful race test is not exhaustive proof.

## 5. Test failures, retries, and recovery

Inject failures in a controlled environment at relevant boundaries:

```text
before commit
after commit but before the sender receives confirmation
between record update and required related writes
between commit and event/job/notification delivery
during attachment upload or metadata linking
during audit-event creation
while reconnect/reconciliation loads current state
```

Establish the expected final state, retry behavior, and user feedback for each case. Verify aborted transactions roll back, committed operations can be discovered, and recovery does not duplicate or erase work.

Inspect idempotency identity, scope, persistence, retention, and behavior for concurrent retries with the same key but different payloads where implemented. Transport identifiers do not automatically establish logical idempotency. Do not use “exactly once” as an unsupported guarantee.

Determine how abandoned uploads, missing references, orphan rows, and partially completed work are detected and resolved. Recovery should not silently invent a successful outcome.

## 6. Verify reads, caches, and event convergence

Compare canonical storage with sender/recipient queues, record details, badges, notifications, history, and presentation views.

Check cache keys and invalidation by session, role, team, record, and revision. Inspect out-of-order fetch completion, refetch after writes, switching accounts/sessions, reconnect, and background-tab resumption.

Define where eventual consistency is acceptable and where an action must validate current authoritative state. Measure or bound the observed convergence window without conflating stale display with corrupted storage.

Audit pagination, sorting, and live list updates for missing/duplicated records. Verify exports use a defined snapshot or clearly disclose that records may change during export.

## 7. Inspect existing data quality

Use read-only checks to identify duplicate logical records, impossible state combinations, missing links, invalid ownership/scope, mismatched revisions, and orphaned attachments/events where relevant.

Report the query and actual result. Distinguish legacy/imported records from defects produced by current code. Do not run cleanup, deletion, migration, or backfill as part of an audit-only request.

Identify migration/default behavior that can weaken invariants or leave older records incompatible. Do not assume replacing a null with a guessed value repairs the underlying meaning.

## 8. Evidence and prioritization

Create an invariant matrix:

| Invariant ID | Requirement | Enforcement point | Race / failure scenario | Expected outcome | Observed outcome | Evidence | Pass / fail / blocked / not tested |
|---|---|---|---|---|---|---|---|

Create a findings table:

| ID | Entity / operation | Corruption or inconsistency risk | Reproduction and interleaving | Cause / file / query | Actual scope | Correction | Priority | Regression / recovery criteria |
|---|---|---|---|---|---|---|---|---|

Retain request ordering, committed revisions, relevant server responses, and canonical reads. Distinguish measured/observed failures, source-inferred risks, and unverified hypotheses. Use synthetic records and avoid sensitive payloads in evidence.

Prioritize P0 for unauthorized cross-scope effects, silent lost updates, corrupted decisions, invalid consequential transitions, or duplicated consequential operations; P1 for persistent divergence or failures requiring manual repair; P2 for recoverable inconsistencies with reliable recovery; P3 for limited-impact gaps. State actual impact rather than assigning every race hypothesis P0.

## 9. Required deliverable and handover gate

Create `PLENUM_DATA_INTEGRITY_CONCURRENCY_AUDIT.md` containing:

1. Executive assessment and handover recommendation.
2. Entity/source-of-truth inventory and explicit consistency policies.
3. Invariants and enforcement matrix.
4. Write/transaction/side-effect boundary map.
5. Executed concurrency/failure tests with counts and evidence.
6. Existing data-quality findings.
7. Prioritized defects, unresolved requirements, and untested conditions.
8. Bounded corrections, migration/repair needs, and rollback considerations where relevant.
9. Acceptance criteria for correctness, conflict feedback, recovery, and convergence.

Recommend ready, ready with explicit limitations, or not ready based on actual evidence. Critical invariants should be enforced authoritatively, representative concurrent/retry/failure cases should pass, and unresolved critical integrity failures should block handover.

Implement only within separately authorized scope. Verify corrections against the original interleaving and failure boundary, persisted state, user feedback, cross-role convergence, and required audit evidence. Do not hide conflicts or discard a valid user's work to make a test pass.
