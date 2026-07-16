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
