Original prompt: In the green and industry facilitator interfaces, proposals are shown in terms of action cards instead of specifically being labeled and shown as proposals.

- 2026-07-15: Reframed Green and Industry proposal records as explicitly labelled `PROPOSAL` cards with proposal-specific sequence, accessible naming, structured proposal fields, summaries, and draft controls while leaving Strategic Orientation and non-proposal team actions unchanged.
- 2026-07-15: Updated proposing-Facilitator response notifications to direct users to Proposals instead of Actions, and added focused shared-renderer coverage plus a live-demo runbook check for both proposal teams.
- TODO: Run `npm test -- src/roles/facilitator.test.js`, `npm run build`, and the updated Green/Industry proposal-card check in `docs/live-demo-runbook.md`.

Original prompt: The copy for the negotiation response to a proposal is not directly categorised to show that a negotiation has been requested. Ensure the interface copy is clear and provides users with limited cognitive load.

- 2026-07-15: Categorised persisted `negotiate` proposal responses as `Negotiation requested` across the responding facilitator, proposing-team, and White Cell surfaces, with the response body labelled `Negotiation terms`.
- 2026-07-15: Kept the existing deterministic recipient status and persisted decision contract unchanged; added focused shared-state and role-renderer coverage plus a live-demo runbook check.
- 2026-07-15: Added a deduplicated proposing-Facilitator notification for newly committed proposal responses, plus a persistent `NEW RESPONSE` badge on the originating proposal until Actions is opened. Loaded response history remains silent.
- 2026-07-15: Added focused coverage for realtime update wiring, negotiation notification copy, persistent arrival state, deduplication, and startup-history suppression; extended the live-demo runbook check.
- TODO: Run `npm test -- src/features/actions/proposalRecipientState.test.js src/roles/scribe.test.js src/roles/facilitator.test.js src/roles/whitecell.test.js`, `npm run build`, and the updated proposal-response check in `docs/live-demo-runbook.md`.

Original prompt: The loading screen must detail the name of the session being joined by the user as well to limit confusion.

- 2026-07-15: Closed the communication snapshot-to-realtime startup gap that could make the Facilitator activity feed show only the second of two consecutive White Cell messages.
- 2026-07-15: Added a merge-safe post-subscription reconciliation, focused store/sync/Facilitator regression coverage, and a two-message live-demo runbook check.
- TODO: Run `npm test -- src/stores/communications.test.js src/services/sync.test.js src/roles/scribe.test.js`, `npm run build`, and the consecutive Facilitator communication check in `docs/live-demo-runbook.md`.
- 2026-07-15: Located the participant and White Cell join paths in `src/roles/landing.js` and the branded join interstitial in `styles/pages/landing.css`.
- 2026-07-15: Added a visible, assistive-technology-announced session-name line populated from the secure session-code lookup before the seat claim proceeds.
- 2026-07-15: Added focused unit coverage and a live-demo runbook check. Verification remains for the human to run under the repository execution boundary.
- TODO: Run `npm test -- src/roles/landing.join.test.js`, `npm run build`, and the Session Setup check in `docs/live-demo-runbook.md`.
- 2026-07-15: Reworked the facilitator Actions/Proposals section into one exercise-order view: Strategic Orientation, then Move 1, Move 2, and later moves, with newest-first ordering inside each move.
- 2026-07-15: Kept lifecycle status visible on collapsed action cards and added a compact source-team badge to every White Cell submission card.
- 2026-07-15: Differentiated White Cell source-team badges with restrained token-backed Blue, Red, Green, and Industry tints while retaining full text labels and leaving card borders and shadows unchanged.
- 2026-07-15: Added focused facilitator and White Cell tests plus operator runbook checks. Commands were not run under the repository execution boundary.
- TODO: Run `npm test -- src/roles/facilitator.test.js src/roles/whitecell.test.js`, `npm run build`, and the updated Facilitator and White Cell checks in `docs/live-demo-runbook.md`.
- 2026-07-15: Removed static support-deck sections, counts, and slide titles from the facilitator sidebar while preserving the assigned deck and stage Previous/Next navigation.
- 2026-07-15: Kept only live team decisions in the sidebar, updated its accessible label across all four team shells, and added focused Scribe/facilitator tests plus a runbook check.
- TODO: Run `npm test -- src/roles/scribe.test.js`, `npm run build`, and the updated Facilitator deck/sidebar check in `docs/live-demo-runbook.md`.
- 2026-07-15: Changed forwarded facilitator action reviews to render fully expanded by default and pinned Strategic Orientation reviews as full, non-minimized slides.
- 2026-07-15: Added an accessible `Team Action Review` / `Deck` switch to every team facilitator shell; returning to Deck restores the last support-deck slide viewed without reintroducing deck details in the sidebar.
- 2026-07-15: Restored the shared form and responsive grid styles on every team Facilitator shell so projected-draft Edit modals render with the established action-editor styling and focus states.
- 2026-07-15: Added focused controller, markup, styling, and runbook coverage. Commands were not run under the repository execution boundary.
- TODO: Run `npm test -- src/roles/scribe.test.js`, `npm run build`, and the updated Facilitator action-review/deck-switch checks in `docs/live-demo-runbook.md`.
- 2026-07-15: Human verification confirmed the production build and `test:e2e:smoke` pass. The focused Scribe suite reported one stale onboarding-selector assertion; updated it to pin the new view switch and its deck-position restoration guidance.
- TODO: Re-run `npm test -- src/roles/scribe.test.js`; pass is 34 tests passing with no failed test files. The fallback-path warning/error logs remain expected test output.

Original prompt: Place the categories for proposals in the scribe interface like the white cell's simulation settings section. It needs to be easy for the user to know what from each move of the simulation is noted.

- 2026-07-16: Reworked the Green and Industry Scribe proposal record into a White Cell-style tab strip for Strategic Orientation and Moves 1-3, with per-category counts, explicit empty states, and concise guidance describing what was noted at each simulation mark.
- 2026-07-16: Kept proposal lifecycle status and complete recorded fields inside each move category, added accessible tab semantics and arrow-key navigation, and aligned tab animation with reduced-motion preferences.
- 2026-07-16: Human verification confirmed the production build passes. The focused Facilitator suite reached 71 passing tests and exposed one proposal-tab test-harness failure because badge rendering had no fake `document`; added the established fake document setup to that test without changing runtime behavior.
- 2026-07-16: Follow-up visual feedback showed the proposal categories still stacking. Pinned the proposal tab list to a single non-wrapping horizontal flex row, forced tab controls to content width, and retained horizontal overflow for narrow screens.
- TODO: Re-run `npm test -- src/roles/facilitator.test.js`; pass is 72 tests passing with no failed test files. Then complete the updated Green/Industry proposal-category check in `docs/live-demo-runbook.md`.
- 2026-07-23: Replaced Proposal Category in the Industry Scribe proposal modal with the Blue Team Instrument of Power checkbox set, including multi-select persistence, required custom `Other` handling, and Industry-specific review/projection labels while preserving Green proposal categories and legacy Industry records.
- 2026-07-23: Closed the three focused-suite failures found during human verification: proposal cards no longer expose the generic Forward to Facilitator control, the new White Cell Industry assertion uses the shared DOM fixture, and captured-event LaTeX chronology rows now print the persisted event UUID.
- 2026-07-23: Pinned the complete Industry Scribe-to-Facilitator proposal handoff: the facilitator presentation slide now explicitly renders every authored field, including all built-in/custom Instruments of Power and the full Expected Outcome(s) & Duration Assessment, with accessible presentation/review labeling and draft Edit/Forward controls.
- 2026-07-23: Kept proposing Facilitators in the proposal loop by resolving each Green or Industry proposal slide to its canonical forwarded communication, showing the live White Cell/recipient stage plus Accepted, Declined, or Negotiation requested outcomes and full negotiation terms.
- 2026-07-23: Corrected the White Cell label for Blue Strategic Orientation selections so both the queue card and review dialog explicitly identify `Blue Team Strategic Orientation Selection: <orientation>`, matching the source clarity of the other teams' forecasts.
- 2026-07-23: Changed Facilitator Team Action Review from a horizontally scrolling action rail to a full-width vertical sequence, with a focused CSS contract and updated operator/automation checks.
- 2026-07-23: Added deduplicated Facilitator activity/toast alerts for newly arriving recipient decisions while keeping startup history silent, plus focused rendering and notification coverage and an updated live-demo verification step.

Original prompt: Remove the duplicated Coordinated Yes/No decision from the Blue Facilitator presentation toolbar and retain only Legislative and Executive Yes/No.

- 2026-07-23: Simplified the presentation `Coordinated` group to Legislative and Executive Yes/No choices only, while deriving the persisted parent decision deterministically from those two answers.
- 2026-07-23: Updated completion gating, focused toolbar contract coverage, and the live-demo runbook without changing the established persisted action schema.
- 2026-07-23: Removed the Coordinated and Informed/Engaged presentation-toolbar groups from Green, Red, and Industry while retaining a responsive Edit/status/Forward handoff footer.
- 2026-07-23: Made non-Blue presentation handoffs immediately submittable and persist explicit No parent decisions with empty selection arrays; added focused three-team rendering, persistence-shape, accessibility-layout, and runbook coverage.

Original prompt: I want to test every team and role functionality in a single but component form...ensuring full functionality of the platform

- 2026-08-12: Ran the existing single componentized 18-actor professional playthrough with `npm run test:e2e:playthrough` against the production build and local rehearsal backend.
- 2026-08-12: Verification passed in 5.3 minutes: 1 test, 18 actors, 1 session, 0 skips, 0 retries, 0 browser/page errors, and 0 gate violations. The rehearsal covered all four teams, Scribe, Facilitator, both Notetaker seats per team, White Cell Lead, and Game Master across orientation, timer, action, proposal, negotiation, RFI, communication, notification, observation, reload, and export components.
- TODO: Treat this as browser/workflow evidence only. Run the hosted rehearsal with current-head deployment and migration identifiers before claiming live Supabase/RLS, migration, or network-path readiness.
- 2026-08-12: Added a fail-closed executable role/capability matrix covering 19 shipped role profiles and 30 intended-procedure capability groups, with synchronized human-readable documentation and a single `npm run test:roles` gate.
- 2026-08-12: Expanded the browser role matrix from 18 to 23 actors by adding the shipped Econ, NI/Escalation, Diplomacy & Information, TSJ, and Verba AI SME entry paths, role-scoped queue mounts, reload persistence, Game Master roster visibility, and backend seat-count reconciliation.
- 2026-08-12: Explicitly excluded compatibility-only `whitecell_support` and `viewer` states from the user-enterable role count because the shipped landing page exposes neither entry path.
- 2026-08-12: Focused audit passed: 3 files / 22 tests. The 18-actor procedural playthrough passed in the combined run. The first 23-actor matrix run exposed a test-only assumption that every role used `#sessionName`; after asserting the SME console's actual `#headerSessionMeta` contract and inspecting the captured Econ SME screen, the matrix passed in 1.6 minutes with 0 skips, retries, browser errors, or gate violations.
- TODO: Run `npm run test:roles` against the hosted current-head deployment with the verified migration identifier and operator access code before using this matrix as live Supabase/RLS release evidence.
- 2026-08-12: Added a separate fail-closed complete operational rehearsal for every shipped non-PLI feature. The executable manifest requires focused and browser evidence for 15 capability groups and explicitly excludes PLI adjudication, SME reviews, external handoffs, and reports.
- 2026-08-12: Expanded the 18-actor browser operation with timer allocations/reset and reversible phase/move progression. Added a compact operator-controls component for live deck assignment, sequentially persisted Intercom and Session Recorder lifecycles using deterministic CI audio capture and session-scoped mock broadcast, Game Master plugin visibility, every legacy/research/print/cross-session export, White Cell participant filters, Game Master bulk removal, archive, post-archive join denial, and `SESSION_CLOSED` evidence.
- 2026-08-13: The complete local non-PLI operational gate passed. `npm run test:non-pli` completed 74 files / 659 tests with no failures or skips. `npm run test:e2e:operational` rebuilt production assets and completed all five browser components as 6 tests / 49 actors / 8 sessions in 9.2 minutes with 0 skips, 0 retries, 0 retried-to-success tests, 0 unexpected browser/page errors, and 0 gate violations.
- TODO: Run `npm run test:e2e:operational` against the hosted current-head deployment with verified deployment and migration identifiers before claiming live Supabase/RLS, Storage, migration, or network-path readiness.
- 2026-08-13: A user-run local operational gate exposed a White Cell timer-allocation race: background game-state reconciliation could overwrite unsaved operator fields with 90-minute defaults before submission. The form now preserves dirty values until a successful save, with focused regression coverage and an E2E reconciliation check before the 8-minute Move 1 assertion.
- 2026-08-17: Implemented Prompt 07's verified-context Scribe coach for Blue, Red, Green, and Industry, with current team-specific forms, guided narration controls, common workspace landmarks, explicit empty/retry/returned/completed states, and the Draft → Facilitator handoff retrieval check.
- 2026-08-17: Added a fail-closed Scribe training command registry that keeps dummy artifact bodies in memory, records bounded progress metadata only, enforces orientation/draft/forward/revision order, and rejects cross-team, unknown, and direct-to-White-Cell commands.
- 2026-08-17: Documented the Red selector/capability drift and kept its legacy direct White Cell handler outside training; Green and Industry remain distinct conditional proposal forms.
- TODO: Human verification for Prompt 07: `npm test -- --run src/roles/facilitator.test.js src/features/training`, `npm run build`, `npm run test:e2e:smoke`, and `git diff --check`.
