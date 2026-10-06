# PLENUM INFORMATION-FLOW, LATENCY, AND PERFORMANCE AUDIT

## Role and objective

Act as a senior performance engineer, distributed-systems engineer, frontend engineer, and simulation-workflow analyst reviewing the current PLENUM platform.

Evaluate how quickly information becomes correct, visible, and actionable for the people who need it. Identify what makes PLENUM slower than it could be, where delays originate, and which improvements would produce the greatest benefit.

This is an evidence-based audit and remediation specification. Produce the audit before implementing fixes. Do not begin with a platform-wide rewrite or assume that a new framework, database, or realtime system is necessary.

Investigate both technical latency and interface/workflow friction. Distinguish time spent transporting information from time spent waiting for a person to review or act. A fast API response does not prove that the receiving user sees a usable update quickly.

Read `DESIGN_STANDARDS.md`, `WRITING_STANDARDS.md`, relevant architecture/workflow documentation, and the interface clarity/layout/motion audit if present. Identify missing documentation. Inspect the actual implementation rather than treating the examples below as established facts about PLENUM.

---

## 1. Define what “fast information flow” means

Evaluate these separately:

| Dimension | Question |
|---|---|
| Local responsiveness | How soon does a click or keystroke produce useful feedback? |
| Durable completion | How soon is the intended change committed successfully? |
| Recipient visibility | How soon can the intended recipient see the committed information? |
| Action readiness | How soon can that recipient open it and perform the next permitted action? |
| Freshness and convergence | How long do different authorized views disagree or remain stale? |
| Navigation/discovery | How much time and effort are needed to find the relevant information? |
| Workflow waiting | How long does information wait in a review queue or for a human decision? |
| Recovery | How quickly does the interface reconcile after reconnect, retry, refresh, or failure? |

Do not conflate perceived speed, backend speed, and end-to-end correctness. Immediate optimistic feedback is not proof of a committed or delivered change.

---

## 2. Map the actual architecture and delivery paths

Inventory the mechanisms the platform actually uses:

```text
user interaction and client state
frontend bundles, routes, and component rendering
authentication and role/session initialization
API requests, RPCs, and server-side processing
database reads, writes, transactions, indexes, and permission checks
realtime subscriptions, polling, refresh, and reconciliation
background workers or jobs, if present
caches and invalidation
notification generation and delivery
recipient queues, detail views, badges, and presentation surfaces
```

For each important path, identify its source of truth, dependencies, request order, cache behavior, subscription ownership, and update triggers. Show which views are updated by an event and which require another read or refresh.

Verify actual workflow semantics and permissions. Investigate examples such as:

```text
author saves a draft
Scribe forwards an Action, Proposal, or Strategic Orientation to Facilitator
Facilitator submits the record to White Cell
White Cell returns a record for revision
originator revises and resubmits
White Cell completes/adjudicates a record, where supported
RFI sent → recipient sees it → answer returned
proposal response or communication delivered to relevant roles
move/phase/session change propagated to authorized views
queue, badge count, timer, and presentation view updated
```

Include Industry Turn Sheet / Proposal paths if implemented. Determine whether the Turn Sheet is the proposal record rather than assuming there are two separate objects. Do not invent absent features or alter agreed workflows.

---

## 3. Establish end-to-end timing and traceability

For each critical path, trace one semantic operation through the system. Use an operation/correlation identifier and the committed record revision where available. Do not confuse a transport retry, duplicate event, or repeated render with a new user operation.

Record applicable milestones:

| Milestone | Meaning |
|---|---|
| A | User initiates the action |
| B | Sender receives immediate local feedback |
| C | Request leaves the sender |
| D | Server receives the request |
| E | Relevant change commits durably |
| F | Delivery event/job is emitted or scheduled |
| G | Recipient client receives the event or discovers the change through a read |
| H | Recipient obtains the required current data |
| I | Recipient renders the correct record, state, and associated queue/count |
| J | Recipient can open/use the next permitted control |
| K | Recipient begins the next human action, if observable |

Derive local feedback, durable-save, commit-to-visibility, action-to-visibility, action-to-readiness, and visibility-to-human-action timings where the evidence supports them. Explain missing milestones and alternate paths such as polling.

Use monotonic timers for intervals within one client/process. Cross-client and client/server timestamps may have clock skew; use synchronized instrumentation or a controlled test harness, quantify uncertainty, or report separate measured spans. Do not subtract unrelated clocks and present the result as an exact latency. Do not assume an HTTP response timestamp is the transaction commit timestamp.

Measure time spent actively processing, waiting on another service, waiting for the next poll/debounce/batch, and waiting for a person separately. Avoid double-counting concurrent spans when explaining the critical path.

If instrumentation is missing, specify minimal temporary instrumentation or a bounded observability change. Capture timings, event types, revisions, and query/request counts without recording sensitive artifact bodies, credentials, or unauthorized role data.

---

## 4. Establish a representative baseline

Measure important paths using separate authorized sender and recipient sessions. One tab updating its own optimistic state is not an end-to-end delivery test.

Cover:

- first visit, cold cache, and warm repeat use;
- normal and realistically constrained network/device conditions;
- small and large sessions, populated queues, long records, and relevant attachment sizes;
- recipient viewing the affected screen versus another screen;
- active tab, background tab, reconnect, and session/authentication renewal;
- single-user operation and realistic concurrent activity across roles;
- one update versus a burst of legitimate updates;
- success, failed write, retry, duplicate/out-of-order delivery, and missed-event reconciliation.

Use existing fixtures or a controlled test environment for synthetic records, write tests, and load tests. Do not flood a live simulation or notify real participants to obtain performance measurements. State the tested environment, session size, workload, network profile, browser, device, cache state, and concurrency assumptions.

Report sample count, failures/timeouts, median, p95, and p99 only when the sample supports a meaningful estimate. Identify noisy or insufficient samples; do not invent percentile precision. Report slow tails and failure rates alongside average speed.

Create a baseline table:

| Flow | Environment / workload | Samples | Local feedback | Durable completion | Recipient visibility | Action readiness | Failures / stale states | Evidence |
|---|---|---:|---|---|---|---|---|---|

Use measured baselines to propose user-centered latency/freshness targets for critical flows. Label them as proposed targets, explain their rationale, and compare each with observed behavior. Do not assert unsupported universal thresholds or that every flow should have the same target.

---

## 5. Audit network, data access, and server bottlenecks

Look for concrete instances of:

```text
serial request waterfalls where requests could safely run concurrently
N+1 queries or per-card/per-row detail fetching
duplicate reads from component mounts, listeners, retries, or shared helpers
fetching full session/record collections for one changed item
large payloads, unused fields, full history, or attachments on the critical path
client-side filtering of unnecessarily broad server results
unbounded lists, missing pagination, or expensive exact counts
slow joins, sorts, permission checks, RPCs, and transaction boundaries
missing or inappropriate indexes for actual query/filter/order patterns
lock contention, worker/connection saturation, cold starts, and external dependencies
authentication or role data repeatedly fetched for each action
unnecessary sequential refetches after writes
retries, backoff, timeouts, or debounce windows adding hidden latency
```

Inspect request waterfalls, payload sizes, server timings, query plans, and query counts where available. Use safe profiling appropriate to the environment; statements that execute writes or expensive profiling belong in a controlled test environment.

Determine whether work is on the user-visible critical path or can occur later without changing meaning. Parallelize only independent operations. Preserve dependent ordering, transaction semantics, permissions, and validation.

Do not recommend an index, cache, or batch solely because it sounds faster. Reference the actual query/path, its frequency and cost, and the expected tradeoff, including write cost and cache invalidation where relevant.

---

## 6. Audit realtime delivery and view freshness

Inspect:

```text
subscription setup timing and scope
multiple subscriptions/listeners for the same semantic event
subscription cleanup, reconnect, and resubscription
poll frequency and overlap, if polling is used
event filters and role/session routing
event payload sufficiency versus follow-up reads
whole-screen refresh versus targeted state updates
event handling, invalidation, deduplication, and batching
missed, duplicate, delayed, and out-of-order events
background-tab throttling and resume behavior
connection-loss indication and freshness recovery
```

Verify that the persisted record, sender UI, recipient queue, detail view, badge count, and presentation view converge on the correct revision. Measure how long each stays stale. Identify views that update only after navigation or manual refresh.

Investigate whether background/polling intervals, broad invalidation, redundant refetches, or event-to-fetch waterfalls explain observed delays. Verify behavior during subscription initialization so that updates between initial loading and subscription readiness are reconciled.

Do not replace polling with subscriptions, or subscriptions with polling, without evidence. Recommend the smallest change that improves measured visibility and recovery. Preserve permission boundaries and avoid broad event broadcasts containing restricted information.

---

## 7. Audit frontend responsiveness and rendering

Measure event-handler time, main-thread blocking, render/commit work, and the time until updated content and controls become usable.

Investigate:

- oversized initial bundles and eager loading of unrelated role screens;
- expensive startup/authentication/role initialization chains;
- synchronous parsing, sorting, formatting, filtering, or calculations on large collections;
- full-list or whole-screen rerenders for a single record update;
- unstable state/references, duplicated derived state, excessive effects, and render loops;
- long DOM lists/tables and whether pagination or virtualization would help;
- repeated layout measurement, forced reflow, layout thrashing, and expensive paint;
- excessive transition durations, fixed waits, or animation completion blocking controls;
- spinners, skeletons, or overlays that remain after data is ready;
- list resorting and scroll jumps that make newly arrived information harder to find.

Use runtime profiles to distinguish network waiting from main-thread/render delay. Treat virtualization, memoization, code splitting, and background computation as conditional remedies tied to measured causes. Verify accessibility, scroll position, and focus after changes.

Cross-check the interface layout and motion audit. A visually smooth update may still be late; a quick update may still be unusable because the interface jumps, clips, or moves the target control.

---

## 8. Audit interaction and workflow delays

Measure task steps and time-to-find, not merely request duration. Identify:

```text
unnecessary navigation, intermediate dialogs, or repeated confirmations
re-entering information already available in the same workflow
recipient records buried in queues without clear sorting/filtering
notifications without a direct route to the relevant record
state changes visible in one surface but absent in another
unclear ownership or missing indication of the next required action
queue bottlenecks and reviews waiting without an obvious attention cue
manual refresh required to discover an update
blocked controls that do not explain the outstanding dependency
```

For a workflow handoff, separate transmission delay, discovery delay, queue dwell, and active review time. Do not claim that a human delay is a backend performance failure.

Propose role-appropriate improvements such as better queue freshness, direct record links, actionable notifications, preserved navigation context, or clearer pending ownership where evidence supports them. Do not bypass Facilitator/White Cell review, merge distinct workflow transitions, or automatically act on behalf of a reviewer to reduce latency.

---

## 9. Preserve correctness while improving speed

Evaluate whether a proposed optimization creates:

- optimistic success before durable acceptance, without reconciliation or failure recovery;
- stale caches, lost updates, or an older response overwriting a newer revision;
- duplicate submissions during slow responses or retries;
- out-of-order state changes and incorrect counts;
- incomplete error feedback or dropped actionable events;
- permission leaks or cross-session/cross-tenant contamination;
- delayed or missing audit records;
- eventual consistency that is unacceptable at a decision boundary.

Recommend explicit reconciliation, version handling, deduplication/idempotency, and invalidation only where the real architecture requires them. Establish what must be current before the next consequential action.

Keep backend contracts, workflow semantics, auditability, and role authorization stable unless a measured bottleneck justifies a specifically scoped change. Do not weaken security checks, remove validation, hide errors, or suppress necessary durable state to improve a benchmark.

---

## 10. Findings, confidence, and prioritization

For every finding, report:

| ID | Flow / role / surface | Observed delay or friction | Cause and file / query / component | Evidence and confidence | User impact | Recommended correction | Expected benefit and basis | Risk / dependencies | Priority |
|---|---|---|---|---|---|---|---|---|---|

Classify evidence as measured, directly observed, source-inferred, or unverified hypothesis. State an unknown cause as unknown and propose the measurement that would resolve it. Do not turn plausible code smells into confirmed bottlenecks.

Quantify expected benefit only when evidence supports it. Otherwise describe the likely effect qualitatively and specify how it will be tested. Avoid summing overlapping savings from the same critical path.

Use:

```text
P0 — Correctness failure: lost/misrouted updates, false success, stale consequential state, or invalid repeated actions.
P1 — Operational bottleneck: measured delay, freeze, timeout, or manual recovery materially impairs a critical simulation task.
P2 — Recurring inefficiency: unnecessary waits, requests, payloads, renders, or task steps with a demonstrated moderate cost.
P3 — Minor opportunity: limited-impact optimization with evidence of a small benefit.
```

Prioritize by user impact, affected frequency/roles, tail latency, correctness, evidence strength, improvement potential, and implementation risk. A frequently executed modest delay can matter more than a rare slow page.

---

## 11. Required first-pass deliverable

Create `PLENUM_INFORMATION_FLOW_PERFORMANCE_AUDIT.md` in the repository containing:

1. Executive assessment: where information is slowest and which delays are technical, discovery-related, or human/workflow-related.
2. Actual architecture and source-of-truth inventory.
3. Critical information-flow map, with stages, dependencies, and relevant roles.
4. Timing/instrumentation model and clock/measurement limitations.
5. Baseline measurements, workload assumptions, failure rates, and freshness/convergence results.
6. The ten highest-priority findings, or all verified findings if fewer than ten exist.
7. Full findings table with concrete code/query/component references.
8. Network, server/database, realtime, frontend, and interaction/workflow findings.
9. Proposed latency/freshness targets and their rationale.
10. Bounded remediation batches ordered by impact and risk.
11. Files/components/queries likely to change and areas that must remain stable.
12. Acceptance criteria and before/after test plan for each batch.
13. Untested conditions, evidence gaps, hypotheses, and the next measurement needed.

Provide a concise first response summarizing the most consequential bottlenecks, their evidence, and the recommended first implementation batch. Do not claim to have executed measurements or tests that were not actually performed.

---

## 12. Remediation and verification requirements

After the audit, implement only within the separately authorized scope. Group related corrections into bounded, independently verifiable batches; instrumentation may precede optimization when the cause remains unclear.

For each batch:

1. State the measured bottleneck and intended result.
2. Define acceptance criteria before editing.
3. Apply the smallest correction that addresses the cause.
4. Repeat the original test under comparable workload, environment, and cache conditions.
5. Compare the same timing spans, percentiles supported by the sample, request/query counts, payloads, and failures.
6. Verify cross-role delivery, revision convergence, permissions, failure/retry behavior, and audit records relevant to the change.
7. Retest affected shared components and realistic concurrent/burst conditions where appropriate.
8. Report actual benefit, regressions, uncertainty, and remaining bottlenecks.

Avoid declaring success based only on fewer lines of code, fewer requests, a faster sender response, or a single favorable run. Fewer requests can still create a larger critical-path payload; a fast sender can still leave the recipient stale.

The desired outcome is a platform in which information reaches the correct authorized person, in the correct state, with the least justified delay, and becomes easy to find and act on.
