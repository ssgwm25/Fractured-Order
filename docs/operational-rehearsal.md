# Complete Non-PLI Operational Rehearsal

This is the fail-closed gate for a complete operational rehearsal of every shipped platform feature except PLI. It combines focused contract tests with five componentized browser suites so a broad browser pass cannot hide a missing validation, permission, export, concurrency, or recovery rule.

The executable inventory is `tests/contracts/operationalFeatureManifest.js`. Removing a feature, evidence file, named procedure, browser component, package script, or documented scope entry fails `tests/unit/operational-feature-manifest.test.js`.

## Scope

| Capability | Operational feature ID |
| --- | --- |
| Session creation, authorization, routing, seat limits, persistence, logout, and recovery | `identity.session_topology` |
| Four-team Strategic Orientation authoring and review lifecycle | `team.strategic_orientation` |
| Blue and Red actions, Green proposals, and Industry proposals | `team.artifact_authoring` |
| Facilitator workspaces, projection, support decks, and White Cell deck assignment | `facilitator.presentation_decks` |
| White Cell artifact review, returns, revisions, stale-write protection, and completion | `white_cell.artifact_review` |
| Recipient-isolated proposal approvals and immutable negotiation rounds | `proposals.recipient_threads` |
| RFI create, return, revise, resubmit, answer, history, and stale-response protection | `rfi.lifecycle` |
| Direct/broadcast communications, alerts, unread state, realtime outage, reconciliation, dedupe, and isolation | `communications.notifications_realtime` |
| Two Notetaker seats per team, structured notes, captures, inbox, timeline, autosave, and concurrency | `notetaker.operational_record` |
| Orientation gate, allocations, timer, reset, and reversible move/phase controls | `white_cell.game_controls` |
| Plugin persistence, Intercom audio delivery, Session Recorder lifecycle/download, and participant notice | `plugins.intercom_recorder` |
| Participant filters, bulk removal, session administration, archival/deletion, join closure, tombstones, and retained audit evidence | `operator.participant_session_admin` |
| JSON, all CSVs, research ZIP, printable report, recording references, reconciliation, and cross-session ZIP | `exports.evidence_bundle` |
| Large-session bounded rendering, outage visibility, deterministic recovery, and isolation | `resilience.scale_degraded_sync` |
| Shared tokens, accessible interaction contracts, onboarding, mobile layout, empty/error/retry states, and DOM integrity | `quality.accessibility_mobile_ui` |

## Explicit exclusions

The following are deliberately outside this gate and must not be reported as exercised by it:

- `pli.adjudication`
- `pli.sme_reviews`
- `pli.external_handoffs`
- `pli.reports`

This excludes the PLI pipeline and triggers, PLI-derived queues and reports, all Econ/NI/Escalation/Diplomacy-Information review actions, and TSJ/Verba Approved PLI copy packets. Action-narrative TSJ/Verba queues that open on White Cell action-complete remain a shipped SME console, but they are not part of this operational gate. The separate role-capability matrix may still test whether those shipped consoles can be authorized and mounted.

## Component sequence

1. `live-demo-topology.e2e.js` rehearses secure entry, one-team seat capacity, unauthorized access, Scribe-to-Facilitator-to-White Cell handoff, disconnect/rejoin, logout, and concurrent Notetaker writes.
2. `live-demo-scale.e2e.js` loads a large deterministic exercise and verifies bounded, usable Game Master, White Cell, team, RFI, response, and timeline surfaces.
3. `live-demo-realtime.e2e.js` rehearses participant, timer, action, RFI, timeline, and communication fanout; outage warning; missed-event reconciliation; dedupe; and session isolation.
4. `live-demo-playthrough.e2e.js` runs the 18-actor cross-role operation. It adds every team workflow, returns and revisions, proposal threads, RFIs, direct communications, durable notifications, all eight Notetakers, reload, mobile/document checks, allocations, timer reset, move/phase progression, and deep export reconciliation.
5. `live-demo-operator-controls.e2e.js` runs a compact seven-actor/two-session operation for deck assignment, plugin persistence, Intercom, Session Recorder and participant notices, all operator exports, recording references, participant filtering and bulk removal, archival/deletion, post-archive join denial, tombstone retention, and closure/deletion audit evidence.

The audio procedure installs a deterministic browser `MediaRecorder` and microphone implementation. The local mock's session-scoped broadcast transport then drives the actual Intercom receiver, while the actual Intercom and Session Recorder UI, state, artifact, and download code runs. CI therefore does not require physical audio hardware, an interactive permission prompt, or hosted Supabase Realtime. Device fidelity, real microphone permission, and hosted Supabase broadcast delivery remain environment checks, not deterministic automation claims.

The allocation procedure deliberately reconciles background state after the operator edits all four fields. Unsaved values must remain intact through that reconciliation, then the persisted Move 1 allocation must render as the active reset target before timer reset proceeds.

## Commands

Run the complete local gate:

```powershell
npm run test:operational
```

Run only the production-build browser components:

```powershell
npm run test:e2e:operational
```

The focused command uses `vitest.operational.config.js`, so PowerShell, npm, and CI apply the same exclusion boundary without shell glob expansion. It excludes the PLI feature directory, PLI-specific White Cell/database files, the SME suite, and the 23-actor role-capability matrix. The browser command likewise excludes the SME role-matrix spec. This preserves the requested boundary rather than executing PLI incidentally.

## Pass contract

A pass requires all of the following from the same working revision:

- all non-PLI focused tests pass;
- all five browser components pass with zero skipped tests and zero retries locally;
- browser diagnostics report zero unexpected console errors and zero page errors;
- the Playwright gate summary reports zero violations and records the expected actor/session annotations;
- all downloads are emitted, the research manifest reconciliation is `passed`, and required HTML/LaTeX/JSON/CSV evidence exists;
- archival rejects a new join and records one `SESSION_CLOSED` audit event; Game Master deletion then hides the archived session, stores a `deleted` tombstone, and appends one `SESSION_DELETED` event without removing evidence;
- `tests/unit/operational-feature-manifest.test.js` confirms every in-scope feature still has focused and browser evidence and all PLI exclusions remain explicit.

A local pass is browser/workflow evidence only. For hosted evidence, set `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_OPERATOR_ACCESS_CODE`, `PLAYWRIGHT_DEPLOYED_COMMIT`, and `PLAYWRIGHT_MIGRATION_STATE`, then run `npm run test:e2e:operational`. The deployed page must publish that same commit, and the exported release evidence must report migration state `2026-10-07_hosted_release_evidence`, count `66`, the canonical ledger fingerprint, and the same database build hash. Hosted success proves the deployed browser and live backend path for the tested revision; infrastructure, database migration, storage, and device checks in the live-demo runbook remain separate release gates.

## Latest local evidence

On 2026-08-13, `npm run test:non-pli` passed 74 files / 659 tests with no failures or skips. The production-build `npm run test:e2e:operational` run then passed all five browser components as 6 tests / 49 actors / 8 sessions in 9.2 minutes. `test-results/playwright-gate-summary.json` reported `status: passed`, 0 skips, 0 retries, 0 retried-to-success tests, 0 unexpected browser/page errors, and no violations.

This evidence is local deterministic workflow evidence. No hosted/live-backend pass is claimed by this record.
