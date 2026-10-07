# Role Capability Test Matrix

This matrix is the fail-closed inventory for user-enterable Fractured Order roles. It defines what “all roles tested” means at the intended-procedure level: every shipped role profile must have browser entry evidence, every declared capability must have named automated evidence, and removing either the role or its evidence must fail `tests/unit/role-capability-matrix.test.js`.

It does not equate one happy-path browser assertion with total correctness. Focused unit tests pin validation, permissions, rendering, and state transitions; the browser rehearsals pin multi-role integration. Hosted Supabase/RLS and migration evidence must be produced separately from the same revision before a production-readiness claim.

## Shipped role profiles

| Role family | Executable profiles | Intended procedure groups |
| --- | --- | --- |
| Team Scribe | `blue.scribe`, `red.scribe`, `green.scribe`, `industry.scribe` | Secure join; team-specific Strategic Orientation; Blue or Red action, Green proposal, or Industry proposal authoring; handoff; read-only RFI/update/timeline/journal surfaces |
| Team Facilitator | `blue.facilitator`, `red.facilitator`, `green.facilitator`, `industry.facilitator` | Secure join; Action Review, Deck, RFI, and Communications workspaces; projection/finalization; proposal threads; durable alerts |
| Team Notetaker | `blue.notetaker`, `red.notetaker`, `green.notetaker`, `industry.notetaker` | Secure join; seat-scoped notes; dynamics/alliance tracking; quick capture; inbox; action/timeline review |
| Game Master | `operator.game_master` | Operator authorization; session administration; participant monitoring/removal; exports and session-scoped plugin lifecycle |
| White Cell Lead | `operator.white_cell_lead` | Operator authorization; timers and move controls; artifact/RFI/proposal review; communications; deck/plugin/session/participant administration; exports; read-only PLI visibility and SME vs engine efficacy |
| Econ SME | `sme.econ` | SME authorization; Macro queue; matching-seat approve/override/send-back rules |
| NI/Escalation SME | `sme.ni_escalation` | SME authorization; Macro-unlocked NI/Escalation queue; approve/override/send-back rules and NI evidence rendering |
| Diplomacy & Information SME | `sme.diplomacy_information` | SME authorization; Macro-unlocked Diplomacy/Information queue; approve/override/send-back rules |
| TSJ SME | `sme.tsj` | SME authorization; action-narrative handoff queue; Approved PLI copy packets after Econ/NI/Dip-Info finalize; matching-seat acknowledgement |
| Verba AI SME | `sme.verba` | SME authorization; action-narrative handoff queue; Approved PLI copy packets after Econ/NI/Dip-Info finalize; matching-seat acknowledgement |

The browser role-matrix rehearsal uses 23 actors: one Game Master, one White Cell Lead, five SME operators, four Scribes, four Facilitators, and eight Notetaker seats.
The TSJ and Verba page headers retain their seat-specific names, while their
shared primary workspace is titled `Action handoffs`; both also expose the
separate `Approved PLI` queue. The browser matrix asserts both levels so a
shared workflow label cannot erase role identity.

Every SME console header also exposes `Logout`. The shared unsaved-change guard
resolves dirty edits before the confirmation flow preserves saved session data,
releases the SME seat, clears local session state, and returns the operator to
the join screen. See `docs/WORKFLOW_INTERACTION_CONTRACT.md`.

The Facilitator support-deck readiness check accepts either an assigned image
slide or an approved inline guidance slide. The unified Green deck intentionally
opens with its current text guide, so a hidden image element is not a deck-load
failure when the guidance frame is visible.

## Capability IDs and evidence boundary

The executable source is `tests/contracts/roleCapabilityMatrix.js`. These IDs are stable audit keys; changing a capability or test name requires changing the contract and this document together.

| Area | Capability IDs |
| --- | --- |
| Entry and authorization | `entry.public`, `entry.game_master`, `entry.white_cell_lead`, `entry.sme` |
| Team Scribe | `scribe.orientation`, `scribe.blue_action`, `scribe.red_action`, `scribe.green_proposal`, `scribe.industry_proposal`, `scribe.shared_surfaces` |
| Team Facilitator | `facilitator.workspaces`, `facilitator.finalization`, `facilitator.rfi_communications`, `facilitator.proposal_threads`, `facilitator.alerts` |
| Team Notetaker | `notetaker.notes`, `notetaker.capture_review` |
| Game Master | `game_master.session_admin`, `game_master.participants`, `game_master.exports_plugins` |
| White Cell Lead | `white_cell.controls`, `white_cell.review`, `white_cell.rfi_communications`, `white_cell.admin_exports`, `white_cell.pli_readonly` |
| SME procedures | `sme.macro`, `sme.ni_escalation`, `sme.diplomacy_information`, `sme.tsj`, `sme.verba` |

Each capability maps to one or more named tests. The audit opens every referenced test file and verifies that the named test/step anchor still exists. It also verifies that every role profile has browser-level evidence and that every capability is assigned to at least one shipped role.

## Compatibility states not counted as shipped user procedures

- `whitecell_support` remains a compatibility/policy state. There is no White Cell Support button in the shipped landing page.
- `viewer` remains a passive compatibility route. Observer is not one of the shipped public participant join choices.

These states remain subject to lower-level routing, normalization, policy, and read-only tests where applicable. They are deliberately excluded from the user-enterable role total so they cannot be presented as browser-tested procedures without an actual entry path.

## Verification commands

Focused contract audit:

```powershell
npm test -- tests/unit/role-capability-matrix.test.js src/roles/sme.test.js src/services/database.pli.test.js
```

Single componentized role gate (production build, all shipped role entries, then full procedural playthrough):

```powershell
npm run test:roles
```

Pass means the matrix audit, 23-actor role-entry rehearsal, and 18-actor cross-role procedural playthrough all pass with zero skipped tests, zero retries, zero browser/page errors, and zero gate violations.

For hosted evidence, set `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_OPERATOR_ACCESS_CODE`, `PLAYWRIGHT_DEPLOYED_COMMIT`, and `PLAYWRIGHT_MIGRATION_STATE`, then run the same browser specs. A local mock pass is browser/workflow evidence, not live Supabase/RLS or migration evidence.
