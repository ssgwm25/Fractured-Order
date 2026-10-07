# PLENUM AUDIT TRAIL AND AFTER-ACTION RECONSTRUCTION AUDIT

## Role and objective

Act as a senior audit-data architect, simulation analyst, QA engineer, and research-methods specialist preparing PLENUM for user handover.

Determine whether the platform preserves sufficient trustworthy evidence to reconstruct a simulation: what happened, who acted under which authority, what information was available, which record/revision was used, what the system did, and how subsequent decisions and outcomes followed.

Evaluate operational traceability and analytical utility separately. A list of timestamps is not necessarily an adequate after-action record. A complete event log does not automatically prove a participant saw or understood information, or why they made a decision.

Produce an audit before implementing fixes. Read current scenario/workflow specifications, event schemas, database relationships, revision/history logic, visibility rules, exports, and research/learning measurement requirements where available. Do not assume PLENUM uses event sourcing, deterministic replay, or immutable history.

## 1. Establish reconstruction questions

For a selected simulation episode, determine whether the evidence can answer:

```text
What was the session, scenario, move, phase, and relevant configuration?
Who acted, for which team, in which effective role, and under what assignment/delegation?
What action was attempted and what actually committed?
Which record and exact revision were forwarded, reviewed, returned, or completed?
What rationale, conditions, dependencies, and supporting evidence were recorded?
What information was authorized, available, delivered, opened, or acknowledged at the time?
What changed between revisions, and who requested or made the change?
Which rule, adjudication, or system operation produced an observed consequence?
What remained pending, failed, retried, overridden, or unresolved?
Can the reviewer distinguish observed facts from inferred explanations?
```

Document which questions are required by the intended after-action review and which need evidence not currently captured. Avoid collecting every possible telemetry event without a concrete analytical purpose.

## 2. Inventory records, events, and history

Map audit events, record histories, revisions, operational logs, notifications, scenario state, communications, attachments, and exports. Establish which source is authoritative for each fact.

Inventory consequential events, where supported:

```text
session/scenario creation and configuration changes
role/team/assignment/delegation changes
move/phase transitions, pauses, deadlines, and closure
record creation, durable saves, consequential edits, and deletion/archive
forward, submit, review, return, revise, resubmit, complete, and adjudicate
RFI/request delivery, answer, and linked responses
proposal responses and relevant communications
overrides and administrative corrections
failed/rejected operations, retries, and recovery where analytically relevant
rule/engine-generated changes and manual adjudication
export generation and selected snapshot/revision scope
```

Distinguish one logical operation from transport attempts, duplicated realtime notifications, and repeat rendering. Establish what is a domain event, an operational diagnostic, or an inferred analytical measure.

Do not require every keystroke to become an audit event. Identify which saved revisions and consequential transitions must be retained to support the reconstruction questions.

## 3. Evaluate event structure and provenance

Compare existing evidence against a candidate event contract:

| Field group | Information to evaluate |
|---|---|
| Identity | Stable event/operation ID, record ID/type, session ID, and relevant move/phase. |
| Actor and authority | Actor identity, effective role/team, assignment/delegation at the time, and human/system origin. |
| Event semantics | Canonical operation, attempted versus committed versus rejected outcome, and meaningful result. |
| Time and ordering | Occurrence/commit/recording times where known, timezone convention, authoritative sequence or revision. |
| Record state | Exact referenced revision, prior/resulting state, meaningful diff or retained snapshot. |
| Relationships | Correlation/causation links, parent request, return/resubmission chain, relevant dependencies. |
| Context | Scenario/configuration/rule version or snapshot needed to interpret the event. |
| Evidence | Recorded rationale, source references, review notes, adjudication basis, and attachment version/hash where needed. |
| Visibility | Intended audience and evidence of availability/delivery/opening/acknowledgement, if captured. |
| Corrections | Relationship to corrected/superseded events and explicit correction authority. |

These are analytical requirements to assess, not automatic permission to introduce fields everywhere. Explain the purpose, authoritative source, access boundary, and cost of any proposed addition.

Keep event-time role/team names and assignments interpretable when current profiles or membership change. Retain stable identifiers and relevant historical context rather than silently reconstructing past authority from present-day assignments.

Avoid ordering events solely by client timestamps. Describe clock skew, late delivery, tied timestamps, and the actual ordering guarantees. Differentiate event time from ingestion time; preserve ambiguity where the order cannot be established.

## 4. Verify revision and workflow reconstruction

Select complete examples covering draft → forward → review → submission → return → revision → resubmission → final disposition as actually specified. Include Actions, Proposals, Strategic Orientations/Plans, and RFIs where implemented.

Verify that a reviewer can retrieve the exact revision considered at each stage, not just the latest text. Test edits after forwarding or after completion according to the documented policy.

For Industry Turn Sheet/Proposal records, preserve the single-record identity and link additional proposals to the specific shared Environment Read/Supply Chain context used for that industry/move. Establish whether later edits change historical interpretation. Record unresolved snapshot-versus-live-reference semantics.

Check that deleted, archived, renamed, or superseded records/attachments do not silently break historical reconstruction. Document retention and authorized redaction behavior, including how the remaining record communicates a gap.

## 5. Reconstruct information available at decision time

Separate these evidence levels:

```text
authorized to access
available in the platform
delivered to a client
displayed/opened
explicitly acknowledged
understood or incorporated into a decision
```

Do not label delivery as reading, opening as understanding, or absence of an open event as proof that the participant never learned the information through another channel.

Determine whether a role-specific historical view can be reconstructed from retained content, revision, and visibility/permission history. Current permissions alone do not establish past access.

Include external channels, verbal exchanges, and facilitator interventions as known limitations. Where structured observation or contemporaneous notes are part of the design, verify attribution and time/context links. Clearly distinguish observer interpretations from participant statements and system-recorded facts.

## 6. Assess completeness, integrity, and failure behavior

Test controlled cases:

```text
successful write with failed audit-event persistence
rejected/rolled-back write that incorrectly leaves a success event
retry after committed operation with lost client confirmation
duplicate and out-of-order event delivery
concurrent edits or reviewer actions
role/phase/configuration change during an operation
administrative override, correction, archive, and authorized deletion
export while records change
missing attachment or unavailable referenced revision
```

Inspect whether domain changes and required audit evidence commit atomically, or have a reliable recovery/reconciliation mechanism. Determine what happens when the audit mechanism fails; do not assume best-effort logging is sufficient for a consequential transition.

Check who can read, modify, or delete history and whether corrections preserve the original fact plus an attributed amendment. Evaluate integrity controls appropriate to the platform, such as restricted append paths, retained revisions, transaction linkage, or export checksums. A checksum alone does not prove who authored an event or that omitted events never existed.

Do not prescribe blockchain, universal event sourcing, or deterministic replay without a demonstrated requirement. Never fabricate missing historical events or infer an unknown author/timestamp to fill a gap.

## 7. Evaluate analytical and learning utility

Determine whether the stored structure supports:

- decision episodes linking context, options, chosen action, recorded rationale, and disposition;
- request/response, return/revision, and dependency chains;
- time-to-forward/review/respond and queue dwell, with technical and human delays distinguished;
- sequence and timing of information available relative to a decision;
- comparison of stated objectives, actions, constraints, and observed consequences;
- participant/team/role/move summaries without double-counting retries or events;
- missing-data indicators and qualified comparisons across sessions/scenarios.

Define the denominator, unit of analysis, temporal grain, and source events for every proposed measure. Do not infer cognitive quality, motivation, learning gain, or causal impact from click counts, speed, or successful completion alone.

If automated rules or AI-assisted outputs are implemented, assess whether relevant versions, inputs/references, output, randomness/seed where applicable, and human approval are retained sufficiently to interpret the result. Separate rule-produced changes from manual adjudication. Do not claim deterministic replay if required inputs or engine versions are missing.

## 8. Verify after-action views and exports

Produce a representative reconstruction and export using synthetic or authorized records. Compare it with canonical data and the known test sequence.

Verify:

```text
clear session/scenario/version and export generation metadata
defined snapshot/time/revision boundary
stable identifiers and usable relationship links
full relevant text/revisions rather than silently truncated summaries
clear timeline plus decision-level narrative/navigation
correct attribution, ordering, filters, counts, and timezone display
explicit missing/unknown/redacted information
appropriate role-specific access to private and administrative evidence
machine-readable output and data dictionary where supported/required
```

Test role-scoped and authorized comprehensive exports separately. Restricted information must not leak through history, links, metadata, attachments, or export endpoints.

Operational logs may support diagnostics without belonging in the default participant-facing review. Preserve useful evidence at an appropriate access level.

## 9. Evidence, priorities, and deliverable

Create an evidence coverage matrix:

| Reconstruction question | Required evidence | Current source / fields | Test episode | Result | Gap / limitation | Proposed correction |
|---|---|---|---|---|---|---|

Create a findings table:

| ID | Event / record / export | Missing or misleading evidence | Reproduction / example | Cause / file / schema | Operational or analytical impact | Correction | Priority | Retest criteria |
|---|---|---|---|---|---|---|---|---|

Use P0 for falsified/misattributed consequential history, unauthorized disclosure, or loss of evidence essential to establish a consequential decision; P1 for inability to reconstruct required episodes reliably; P2 for analytical gaps with explicit partial reconstruction possible; P3 for limited-impact presentation/dictionary improvements. Separate actual failures from inferred risks.

Create `PLENUM_AUDIT_TRAIL_AFTER_ACTION_AUDIT.md` containing:

1. Executive assessment and handover recommendation.
2. Reconstruction questions and authoritative evidence inventory.
3. Event/provenance/revision schema assessment.
4. Coverage matrix and executed failure/integrity tests.
5. One worked decision episode reconstructed from actual test evidence.
6. Role-specific knowledge/visibility assessment and inference limits.
7. Export validation and representative discrepancies.
8. Analytical measures that are supported, unsupported, or require additional evidence.
9. Prioritized corrections, migration implications, and acceptance criteria.
10. Untested conditions, historical gaps, and explicit limitations.

## 10. Handover gate and remediation

Recommend ready, ready with explicit limitations, or not ready. Essential decision episodes should be reconstructable with correct actor, time/order, revision, context, disposition, and authorized access. Missing historical facts and unsupported analytical claims must be visible in the assessment.

Implement only within separately authorized scope. Prefer bounded fixes to event emission, revision references, integrity enforcement, context capture, exports, and review views. Preserve backend contracts unless a specific evidence gap warrants a scoped change.

Retest against a known synthetic sequence, including return/revision, concurrency, retry, and audit-persistence failure. Compare source records, events, historical views, and exports. A timeline that looks plausible is not sufficient: each material statement must be traceable to retained evidence, with uncertainty stated where evidence is absent.
