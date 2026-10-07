# PLENUM Functional and Workflow Correctness Audit

**Audit date:** 2026-10-07  
**Application version:** `2.0.0`  
**Audited revision:** `90c78f3d8590acfaf44a85fc7e4890a3d40a314d` (`90c78f3`, 2026-10-06)  
**Environment:** local Windows workspace; production Vite build; Playwright 1.57.0 Chromium against the repository's deterministic mock-backed application  
**Live backend:** not exercised; no deployed URL, deployed commit, migration-state proof, or live operator credential was present in the audit environment  
**Mutation scope:** controlled local fixtures only; no live simulation or participant content was accessed  

## 1. Executive assessment

**Handover recommendation: NOT READY.**

The focused unit suite, role-entry matrix, topology workflow, operator controls, and realtime recovery tests pass. Those results establish substantial isolated coverage, but they do not close the handover gate:

1. The canonical complete-playthrough rehearsal fails before the main action, proposal, RFI, communication, Notetaker, reload, and export sequence. The rehearsal attempts to advance Move 1 before completing one Industry proposal in each required sector. The application correctly refuses the click, while the test incorrectly expects the confirmation dialog.
2. The same rehearsal still drives a legacy proposal form. The shipped Industry workflow now uses the structured Industry Turn Sheet, so moving the failed step later will not by itself restore complete-flow evidence.
3. The deterministic mock server accepts a direct move update without checking Industry proposal coverage. The UI contains a coverage check and the production SQL defines a database trigger, but the audited environment did not execute that trigger. Invalid-transition rejection at the actual server boundary is therefore unproven.
4. The White Cell move button appears enabled while the Industry gate is incomplete, then refuses the operation only after activation. This is misleading gate feedback and conflicts with the documented disabled-control requirements.
5. Client draft validation and the production Industry-proposal trigger disagree about whether recipients are required for a draft. A partially completed draft can pass client validation but be rejected by the live database.
6. Several authoritative design artifacts named by the standards are absent. Deadline behavior, broad unsaved-change handling, and some lifecycle vocabulary therefore cannot be resolved as a complete contract.

No P0 defect was runtime-confirmed. The open P1 failures and unverified server enforcement are sufficient to block handover. The 1,560 passing unit tests do not supersede the failed full rehearsal or the missing live-boundary proof.

### Evidence classification

- **Runtime-confirmed:** observed in an executed browser or test workflow.
- **Source-confirmed:** established by current code, migration, or specification, but not exercised against the live database in this audit.
- **Blocked:** the required environment, authoritative requirement, or deployed evidence was absent.
- **Not tested:** in scope, but not reached or independently exercised during this audit.

## 2. Functional contract

### 2.1 Supported actor workspaces

| Actor / profile | Supported entry and scope | Principal operations | Restrictions / notes |
|---|---|---|---|
| Participant / team member | Select an open session and an available team seat | Join the assigned workspace; read current move, phase, timer, and team-visible records | Seat, session, and team scoped. Generic participant is an entry concept, not a universal author role. |
| Team Scribe | Displayed as Scribe; compatibility route is `teams/<team>/facilitator.html` | Author Strategic Orientation/Plan where applicable; create drafts, Actions or Proposals; revise returned records; send team communications/RFIs where exposed | Four shipped seats, one for Blue, Red, Green, and Industry. Route filename and displayed role are intentionally inverted for compatibility. |
| Team Facilitator | Displayed as Facilitator; compatibility route is `teams/<team>/scribe.html` | Review Scribe handoff, edit/add permitted notes, forward/submit to White Cell | Four shipped seats. Does not own White Cell completion. |
| Team Notetaker | Two numbered seats per team | Capture and persist team notes; review note history | Eight shipped seats. Concurrent-capture and reconnect behavior are separately exercised. |
| White Cell Lead | White Cell control and review workspace | Review/return/complete artifacts; approve proposal delivery to each recipient; operate timer, move, phase, plugins, and exports | Lead-only control mutations. Move and orientation gates apply. |
| White Cell Support | Compatibility state only | Support/read functions where a legacy assignment exists | Not a shipped user-selectable entry path. Must not be counted as a supported new-user flow. |
| Game Master / administrator | Selected-session Game Master console | Session/operator administration, announcements, exports, participant removal, archive/delete | Separate from White Cell adjudication semantics. Archive/delete are supported; reopen/reset/clone are not implemented. |
| SME roles | Five shipped SME profiles | PLI-specific review/adjudication tasks | Entry is covered by role tests; a complete PLI adjudication lifecycle was not executed in this audit. |
| Observer / viewer | Compatibility state only | Read-only behavior where legacy state resolves to it | Not a shipped selectable role; excluded from critical role-entry pass criteria. |

The shipped team topology is fixed to Blue, Red, Green, and Industry. No geography, team, or corridor expansion was assumed.

### 2.2 Record types and canonical operations

| Record / surface | Authors and recipients | Canonical lifecycle / operation vocabulary | Terminal or repeatable behavior |
|---|---|---|---|
| Strategic Orientation / Industry Strategic Plan | Team author → Facilitator → White Cell | Draft → forwarded/submitted → returned or completed; returned record is revised and resubmitted | `Completed` is terminal for artifact review. Industry uses one v2 package containing Agriculture, Telecommunications, Biotechnology, and one shared Blue forecast. |
| Action | Blue/Red team author → Facilitator → White Cell | Draft → forwarded/submitted → returned or completed | White Cell choices are **Accept as Complete** and **Send Back for Improvement**. There is no probabilistic or outcome decision. |
| Proposal | Team author → Facilitator → White Cell → approved recipient team(s) | Draft → forwarded/submitted → returned for revision or forwarded to recipient; each recipient then responds | Recipient responses **Accept**, **Not Interested**, and **Negotiate** are distinct from White Cell artifact completion. Multi-recipient delivery has independent per-recipient approval/thread state. |
| Industry Proposal / Turn Sheet | Industry Scribe → Industry Facilitator → White Cell → Blue and/or Red | The Turn Sheet is the Proposal; no duplicate proposal record is required | First proposal per session/move/industry owns shared Environment and Supply Chain sections. Further proposals reference that baseline and cannot begin until Proposal 1 is completed. One completed proposal for each of the three sectors is required before move advance. |
| RFI | Authorized sender → addressed recipient → response to requester | Sent/open/answered according to the communication workflow | Answer is a recipient operation; draft or failed send must not appear answered. Complete workflow was not reached in the failed full rehearsal. |
| Communication / announcement | Authorized sender → explicit team/seat audience | Sent and received; proposal-response threads are recipient-specific | Repeatable. Access must remain session/team scoped. |
| Notetaker entry | Team Notetaker → team history | Persisted note entries | Repeatable; concurrent capture and recovery passed in the topology test. |
| PLI artifact | Supported SME/White Cell roles | **Adjudication** is a PLI-specific operation | Not interchangeable with artifact `Completed` or recipient `Accept`; full lifecycle not exercised here. |
| Session and game state | Game Master/White Cell Lead as specified | Open/control/archive/delete; timer, phase, and move transitions | Archive/delete supported. Reopen, reset, and clone are absent, not failed supported operations. |

**Vocabulary finding:** `complete`, `accept`, and `adjudicate` are intentionally distinct. General artifact badges may collapse terminal artifact states to `Completed`, but this must not erase proposal-recipient response state or PLI adjudication semantics.

### 2.3 Industry-specific contract

- The Industry Turn Sheet is the proposal record. A second proposal record must not be required.
- Proposal 1 for a sector and move contains editable Environment Read and Supply Chain sections.
- Proposal 2+ for that sector and move references the persisted Proposal 1 baseline and omits duplicate editable shared sections.
- Proposal 2 is blocked until Proposal 1 is completed by White Cell.
- A returned Proposal 1 remains the same logical proposal, keeps its revision/history, and re-enters Facilitator review on resubmission. It is not yet a usable completed baseline.
- If Proposal 1 is deleted, the replacement takes the next unused ordinal and becomes the new active baseline; historical rows are not renumbered.
- Move advance requires at least one completed Industry proposal for each of Agriculture, Biotechnology, and Telecommunications in the current move.
- Current source persists baseline IDs and ordinals, but the Proposal 2+ UI's “View baseline details” disclosure renders only biggest surprise, weakest link, and change since last move. It does not display the full shared actor analysis and five supply-chain stages. Whether this abbreviated display is acceptable conflicts with the Turn Sheet specification's instruction to make the shared sections reviewable; this is recorded as FWC-06 rather than silently redefining the requirement.

## 3. Requirement gaps and ambiguities

The following named design artifacts were not present in the repository: `DESIGN_BRIEF.md`, `DESIGN_DECISIONS.md`, `GLOSSARY.md`, `COMPONENTS.md`, `AUDIO.md`, `VOICE.md`, and canonical `tokens.css`. Existing `docs/DESIGN_STANDARDS.md`, `docs/WRITING_STANDARDS.md`, workflow specifications, architecture notes, role matrix, and runbook were used where they agree.

| Area | Established behavior | Unresolved requirement / audit treatment |
|---|---|---|
| Deadlines | A timer and authoritative game-state controls exist. | No product deadline/cutoff model was found. Copy refers to a deadline, but no authoritative deadline field or server rule defines it. Deadline-edge cases are blocked, not passed. |
| Unsaved changes | Recorder-related protection exists; action/proposal/orientation modal cancel controls close their surfaces. | No general contract defines whether Cancel, Escape, backdrop click, browser navigation, or role switching must warn. These cases remain blocked pending a decision. |
| Session lifecycle | Archive and delete exist and are tested. | Reopen, reset, and clone are not supported. They must not be described as available or scored as failures. |
| Observer / White Cell Support | Compatibility states exist. | They are not shipped entry paths. A product decision would be required before adding them to user acceptance coverage. |
| Industry baseline display | Persistence links subsequent proposals to Proposal 1. | The specification implies full shared-section review; the implementation displays only three summary values. Product must confirm the minimum review surface. |
| Live deployment truth | Migration SQL and runbook describe the intended boundary. | No deployed commit, migration manifest, RLS proof, or hosted rehearsal result was available. Source presence is not treated as applied production state. |

## 4. Operation and transition matrix

| Record / operation | Acting role | Starting state | Preconditions / scope | Input requirements | Expected persisted result | Intended recipient | Next permitted action | Invalid attempts |
|---|---|---|---|---|---|---|---|---|
| Join session/seat | Participant | Open session, unclaimed permitted seat | Correct session, role, team, access code/session authorization | Valid selection and identity | Session participant/seat assignment | Selected role workspace | Perform role-scoped work | Wrong/occupied seat, unauthorized deep link, archived/deleted session rejected |
| Save orientation/plan draft | Team Scribe | New or editable draft | Same session/team; current supported move | Minimum draft identity fields | Draft remains team-owned and absent from review queues | Originating team | Reopen/edit/forward/discard | Cross-team/session mutation; draft must not route to reviewer |
| Forward orientation/plan | Team Scribe | Valid draft | Required fields complete; correct move/team | Full role-specific orientation or three-sector Industry plan | Forwarded handoff with durable payload/revision | Team Facilitator | Facilitator review/edit/submit | Missing fields, stale revision, wrong role/team rejected |
| Submit orientation/plan | Facilitator | Forwarded handoff | Authorized team Facilitator; valid current revision | Any permitted Facilitator note/edit | Submitted review item | White Cell | Complete or return | Direct Scribe-to-White-Cell bypass; stale/wrong-team submission rejected |
| Return orientation/plan | White Cell | Submitted | Lead/reviewer authorization | Return note required | Returned state, note, revision/history, ownership restored | Originating team | Edit and resubmit through Facilitator | Empty reason; wrong session; terminal/stale item rejected |
| Complete orientation/plan | White Cell | Submitted | Required orientation package; authorized reviewer | Completion note optional | Completed artifact and audit/history event | Originating team / control gate | Move/phase gate may clear when all required teams complete | No deterministic “outcome” selection; duplicate/stale completion rejected |
| Save Action draft | Blue/Red Scribe | New/editable draft | Correct team/session/move | Draft-minimum fields | Team-owned draft with move/session and structured payload | Originating team | Reopen/edit/forward/discard | Draft must not appear in Facilitator/White Cell queues |
| Forward and submit Action | Scribe then Facilitator | Draft then forwarded | Valid full form and current revision | Required action fields and permitted notification request | Submitted Action with history and recipient metadata | White Cell | Complete or return | Wrong role/team, missing fields, double/stale submit rejected |
| Complete Action | White Cell | Submitted | Review authorization; optional team-notification approvals | Optional completion note and bounded selected notification teams | Completed artifact; approved notifications emitted once | Originator and selected informed teams | View detail/history/presentation/export | Recipient “Accept” must not be substituted; unselected team must receive nothing |
| Return Action | White Cell | Submitted | Review authorization | Return note required | Returned same logical record with note/revision history | Originating team | Edit and resubmit via Facilitator | Empty reason; false completion; cross-team delivery rejected |
| Save Industry Turn Sheet draft | Industry Scribe | New/editable Industry proposal | Completed v2 strategic plan; sector/move context; Proposal 1 gate for later proposals | Client currently requires only industry + strategicPlanId for draft; database also requires Blue/Red recipient | Durable team-owned draft, not reviewer-visible | Industry team | Reopen/edit/forward | **Contract mismatch:** a recipient-empty draft passes client validation but production trigger rejects it |
| Forward Industry Turn Sheet | Industry Scribe | Valid draft | Completed plan; Proposal 1 rules; full validation | Full structured sheet and at least one Blue/Red recipient | Forwarded proposal payload; first/baseline IDs and ordinal set atomically | Industry Facilitator | Review/edit/note/submit | Proposal 2 before completed Proposal 1; move mismatch; invalid sector/recipient rejected |
| Submit Industry proposal | Industry Facilitator | Forwarded | Correct team/session/revision | Permitted Facilitator note/edit | Submitted proposal in White Cell queue | White Cell | Complete/return or approve recipient delivery as specified | Wrong role, stale version, duplicate submit rejected |
| Return Industry proposal | White Cell | Submitted | Review authorization | Return note required | Same logical proposal returned; revision/history retained; incomplete baseline remains unusable | Industry team | Revise, Facilitator review, resubmit | Proposal 2 remains blocked while Proposal 1 is returned |
| Complete/approve Industry proposal | White Cell | Submitted | Valid sheet; per-recipient decision controls | Completion/approval data | Completed proposal; recipient thread(s) independently projected | Blue and/or Red | Each recipient responds | No cross-recipient disclosure; one approval must not deliver to the other |
| Respond to proposal | Blue/Red recipient | Delivered proposal/thread | Addressed recipient, correct session, pending response | Accept, Not Interested, or Negotiate; negotiation terms when required | Recipient-specific response/thread event | Proposal originator / permitted reviewers | View or continue negotiated thread where supported | Non-recipient, duplicate terminal response, wrong thread rejected |
| Send RFI | Authorized role | New RFI | Correct session/team and valid addressee | Required question/recipient | Durable sent RFI, visible only to recipient scope | Addressed role/team | Answer | Failed send must not appear sent; wrong-team read/write rejected |
| Answer RFI | Addressed recipient | Open RFI | Correct recipient/session and unanswered state | Required answer | Answered state and history; requester can read response | Requester | View/history/export | Non-recipient, duplicate/stale answer rejected |
| Add Notetaker entry | Team Notetaker | Active team workspace | Seat and session authorization | Note content within supported limits | Durable team-scoped entry | Same-team note history | Add another/view history | Cross-team read/write; duplicate retry must not duplicate entry |
| Change phase | White Cell Lead | Active session/move | Orientation gate clear where applicable; phase in range | Confirmed target transition | Game state updated; timer paused/target allocation applied as specified | All session clients | Continue phase or reverse | Support/participant role; out-of-range/stale update rejected |
| Advance move | White Cell Lead | Active move 1 or 2 | Orientation gate clear; completed Industry proposal for all three sectors in current move | Confirmed next move | Game state moves forward, phase resets to 1, timer allocation updates | All session clients | Continue next move or regress where permitted | Missing sector coverage, final move, wrong role, stale request rejected at UI and database |
| Archive session | Game Master/admin | Active session | Authorized selected-session operator | Confirmation | Archived state retained with history; new participation blocked as defined | Operators/participants | Export/delete if permitted | Unauthorized/archive-again operations rejected |
| Delete session | Game Master/admin | Existing session | Authorized operator and explicit confirmation | Confirmation | Session removed from active use while required audit evidence remains | Operator | None for deleted session | Rejoin rejected; reopen/reset/clone are not supported |
| Export supported outputs | White Cell/Game Master | Authorized selected session | Correct operator scope; relevant data exists | Export selection | Generated output represents authoritative session data and history | Operator | Review/download | Cross-session export, missing authorization, or fabricated success rejected |

Terminal artifact states are not editable through the normal author workflow. Repeatable operations include communications, RFIs, Notetaker entries, and per-move records. Returned artifacts go to the originating team and must traverse Facilitator review again. The exact set of editable fields after return is record-specific and should remain pinned by the structured schema rather than inferred from generic lifecycle labels.

## 5. Executed workflow and lifecycle coverage

### 5.1 Commands and results

| Command / gate | Result | Evidence and limitation |
|---|---|---|
| `npm test -- --run` | **PASS** | 150 files and 1,560 tests passed in 22.96 s. Expected negative-path stderr appeared. Unit success does not prove cross-role durability. |
| `npm run test:roles` | **FAIL** | Focused contract tests passed (3 files, 34 tests), production build passed (183 modules), role matrix passed, then full playthrough failed after 3.0 min at `live-demo-playthrough.e2e.js:494`. Initial sandbox attempt failed on parent-directory access and was rerun outside that restriction. |
| Playwright `live-demo-operator-controls.e2e.js` | **PASS** | One test passed in 47.3 s: non-PLI administration, deck/plugin controls, exports, participant removal, archive/delete, rejoin rejection, audit retention. Mock-backed only. |
| Playwright `live-demo-topology.e2e.js` | **PASS** | Two tests passed in 1.3 min: unauthorized White Cell access, session/topology/seat contention, Scribe→Facilitator→White Cell path, Facilitator reconnect, concurrent Notetaker persistence. Mock-backed only. |
| Playwright `live-demo-realtime.e2e.js` | **PASS** | One test passed in 34.7 s: fanout, outage recovery, reconciliation, deduplication, and session isolation. Mock-backed only. |

The repository's production build emitted advisory warnings about a Supabase module being both dynamically and statically imported and about large chunks. They did not fail this functional audit and are not recast as workflow defects.

### 5.2 Executed test matrix

| Test ID | Requirement / workflow | Role and starting fixture | Steps | Expected result | Actual result | Durable/cross-role evidence | Status |
|---|---|---|---|---|---|---|---|
| FWT-001 | Role entry and workspace routing | All 23 shipped actor seats in controlled session fixtures | Enter every shipped role/team seat and inspect workspace identity | Correct workspace, role, and team; incompatible access denied | Role matrix completed | Independent role pages and diagnostics; no console/page errors reported | **Pass** |
| FWT-002 | Unauthorized White Cell access and seat contention | Unauthenticated/participant clients plus controlled session | Open privileged route; compete for seat; join assigned roles | Unauthorized access and duplicate seat rejected | Rejections observed; topology established | Cross-page session fixture and persisted mock state | **Pass** |
| FWT-003 | Scribe → Facilitator → White Cell artifact flow | Team Scribe, Facilitator, White Cell | Create/forward/review/submit across separate role pages | Correct next-role queue and state | Completed in topology scenario | Separate actor pages and authoritative mock reads | **Pass** |
| FWT-004 | Facilitator disconnect and concurrent Notetaker capture | Facilitator and multiple Notetakers | Disconnect/reconnect; capture notes concurrently; reload/read | Recovery without lost or cross-team data | Completed | Reconciled state and persisted history | **Pass** |
| FWT-005 | Realtime fanout and recovery | Multiple clients in isolated sessions | Mutate, simulate outage, reconnect, retry/dedupe | Correct fanout, reconciliation, no duplicates or cross-session leak | Completed | Multiple clients and durable mock store | **Pass** |
| FWT-006 | Operator controls and session closure | Game Master/operator fixture | Exercise plugins/deck/exports/removal/archive/delete/rejoin | Authorized changes persist; deleted session rejects rejoin; audit evidence retained | Completed | Fresh reads and generated export assertions in test | **Pass** |
| FWT-007 | Strategic Orientation gate and review | Four team authors, Facilitators, White Cell | Complete orientation package and review surfaces | Move/phase controls obey gate; details use canonical outcomes | Steps before playthrough failure completed | Separate role pages and UI assertions | **Pass** |
| FWT-008 | Complete simulation rehearsal | Full multi-role controlled fixture | Orientation, controls, actions, proposals, RFI, communications, notes, reload, exports | Entire sequence completes under current workflow contract | Stopped on Move 1 advance: application warned that all three Industry sectors were incomplete; expected modal never appeared | Terminal failure trace at test line 494 and failure screenshot inspected during that run; later Playwright invocations rotated the transient screenshot, so no retained artifact path is claimed | **Fail** |
| FWT-009 | Industry structured proposal end to end | Industry Scribe/Facilitator, White Cell, Blue/Red | Create three sector Turn Sheets, forward, submit, return/resubmit, complete, deliver/respond | Durable structured records and gate clearance | Not reached; existing helper targets legacy proposal selectors | Source comparison between helper and shipped form | **Fail** |
| FWT-010 | Missing Industry coverage rejected at UI | White Cell Lead at Move 1 without completed sector proposals | Activate `Advance to Move 2` | Control explains unavailability before activation; transition does not occur | Button appeared enabled; click produced warning and no transition | Runtime screenshot plus `whitecell.js:2802-2809` | **Fail** |
| FWT-011 | Missing Industry coverage rejected at server boundary | Direct game-state mutation in deterministic test backend | Request move increment without coverage | Backend rejects independently of UI | Mock assigns requested move and checks only orientation gate | `supabaseMock.js:2536-2550`; production SQL was not executed | **Fail** |
| FWT-012 | Production Industry SQL gate | Deployed database session | Attempt direct move update before/after completing three sectors | Trigger rejects incomplete coverage and permits complete coverage | No live/deployed database supplied | SQL source defines trigger, but application of migration and RLS behavior are unproven | **Blocked** |
| FWT-013 | Partial Industry draft durability | Industry Scribe with completed plan but no recipient selected | Select sector and save draft | Draft policy is consistent between client and server | Client accepts minimum draft; SQL rejects empty recipients | Source-confirmed mismatch; no live write executed | **Fail (source-confirmed)** |
| FWT-014 | Proposal 2 shared-section reference | Industry Proposal 1 completed | Open later proposal and inspect baseline details | Full referenced Environment/Supply Chain data is reviewable without duplicate editing | Only three summary values render | Persisted baseline links exist; rendering is source-confirmed | **Fail (source-confirmed)** |
| FWT-015 | Full PLI adjudication | SME and adjudicator roles | Submit, adjudicate, return/revise as supported | PLI state and permissions persist correctly | Role entry/unit contracts only; no complete browser lifecycle run | Insufficient cross-role/durable evidence | **Not tested** |
| FWT-016 | Deadline boundary and stale open form | Author/reviewer around authoritative cutoff | Open before cutoff; submit at/after cutoff | Server time and documented rule decide deterministically | No deadline model or rule found | Requirement absent | **Blocked** |
| FWT-017 | Session reopen/reset/clone | Game Master | Attempt only if supported | Defined copied/cleared state and isolation | Functions are not implemented | Architecture/runbook inspection | **Not applicable** |

### 5.3 Negative and boundary coverage

| Case family | Evidence | Audit result |
|---|---|---|
| Required/malformed/cross-field input | Broad unit validation and focused structured Turn Sheet tests passed | **Partially covered.** Live database/client draft disagreement remains. |
| Long and exact boundary-value input | Unit coverage exists for several schemas | **Not established for every workflow.** No complete role-by-role browser matrix was executed. |
| Wrong role/team/session/seat | Role matrix, topology, operator, and realtime isolation passed | **Pass in deterministic environment.** Live RLS remains blocked. |
| Stale record after form open | Row-version paths and stale White Cell review tests exist | **Source/unit covered;** no complete browser old-tab matrix in this audit. |
| Move/phase changed while form open | Move/orientation gates exist | **Not tested** across every form; Industry direct-mock gate fails. |
| Expired authentication/revoked access during write | Some access/rejoin paths covered | **Not tested** as an in-flight operation against live auth. |
| Duplicate click/repeated submission/refresh during save | Saving guards and realtime dedupe paths exist | **Partially covered;** not demonstrated for all consequential record types. |
| Failed request/timeout/lost response/retry/reconnect | Realtime outage/reconciliation test passed | **Pass for tested realtime path;** not generalized to every submit/review operation. |
| Cancel/Back/Escape/close with unsaved changes | No general authoritative behavior found | **Blocked by requirement ambiguity.** |
| Empty queues/completed records/unavailable references | Unit and focused UI tests cover selected states | **Partially covered.** Full rehearsal did not reach all queues. |
| Deep link after session/role switch | Unauthorized privileged route covered | **Partially covered;** complete route/back-forward matrix not run. |
| Browser back/forward and multiple tabs | Multiple clients/tabs used for realtime/topology | **Partially covered;** stale-form consequences remain untested. |
| Archive/delete/rejoin | Operator browser test passed | **Pass in deterministic environment.** |
| New-session isolation | Realtime/session fixtures show isolation | **Pass for tested fixture;** clone/reset inheritance is not applicable. |
| Timer near deadline/cutoff | Timer controls tested; no deadline contract exists | **Blocked for deadline semantics.** |

## 6. Defects and blockers

| ID | Workflow / role / state | Reproduction | Expected versus actual | Cause / file reference | Impact | Priority | Correction | Retest criteria |
|---|---|---|---|---|---|---|---|---|
| FWC-01 | Full multi-role rehearsal at White Cell Move 1 | Run `npm run test:roles`; after orientations, activate `Advance to Move 2` before Industry proposal completion | Expected test to follow current gate contract; actual test expects an Advance modal and times out because the application correctly warns and returns | Test advances at `tests/e2e/live-demo-playthrough.e2e.js:458-500`; proposal work starts at `:661`; gate is `src/roles/whitecell.js:2802-2809`; runbook contract is `docs/live-demo-runbook.md:148` | Current release gate is red and all later critical workflow evidence is skipped | **P1, runtime-confirmed** | Reorder the rehearsal: complete structured Industry proposals for all three sectors, assert rejection while each sector is missing, then advance and continue the original sequence | Original full test reaches its end; it proves each intermediate rejection, all later workflows, reload/fresh-role durability, history, and exports |
| FWC-02 | Industry Scribe proposal automation | Let repaired rehearsal reach `createProposal` for Industry | Expected current structured Turn Sheet selectors and fields; actual helper locates legacy `#proposalTitle`, `#proposalIndustryFocus`, and related controls | `tests/e2e/support/liveDemoHarness.js:1402-1466` versus structured form/persistence in `src/roles/facilitator.js:4090-4891` | Critical Industry lifecycle cannot be rehearsed; FWC-01 cannot be fixed by ordering alone | **P1, source-confirmed** | Add a dedicated structured Industry helper for plan prerequisite, pages, baseline/shared sections, recipients, save/forward, Facilitator submit, White Cell return/resubmit/complete | Execute Proposal 1 in all sectors; return/revise one; create Proposal 2 after completion; verify IDs, revisions, baseline reference, recipient threads, and move gate |
| FWC-03 | Direct move transition in deterministic server boundary | Call mock `operatorUpdateGameState` with an increased move and incomplete Industry coverage | Expected independent rejection; actual mock applies `requested_move` and only invokes the orientation gate | `src/services/supabaseMock.js:2536-2550`; production trigger exists at `data/2026-10-06_industry_proposals.sql:188-229` | Local E2E can pass a UI-only gate while the direct boundary contract remains untested; live migration state is unknown | **P1, source-confirmed** | Mirror the Industry coverage trigger in the deterministic backend and add direct negative/positive boundary tests; separately verify the real migration/RLS on a controlled deployed database | Direct mock and live API/database calls both reject missing coverage, identify missing sectors safely, accept exactly complete coverage, and preserve move on failure |
| FWC-04 | White Cell move controls with incomplete sector coverage | At Move 1 with orientation clear and zero to two completed Industry sectors, inspect then activate next-move control | Expected disabled/explained control plus boundary rejection; actual button says `Advance to Move 2`, appears enabled, and warns only after click | Availability considers only orientation/final move at `src/roles/whitecell.js:2591-2648`; click gate is `:2802-2809` | Misleading control, recovery friction, accessibility/standards violation; transition itself remains blocked | **P2, runtime-confirmed** | Incorporate current Industry coverage into button disabled state, accessible name/title/help text, and refresh logic; retain click and database defenses | For zero/one/two sectors, button is unavailable with named missing sectors; after third completion it enables without reload; direct calls remain rejected |
| FWC-05 | Industry Scribe saves partial draft without recipient | Complete plan, select Industry sector, leave recipients empty, choose Save Draft | Expected one consistent draft contract; actual client `full:false` validation permits it while SQL rejects every structured insert/update lacking Blue/Red recipient | `src/features/actions/industryTurnSheet.js:444-449`; `src/roles/facilitator.js:4754-4819`; `data/2026-10-06_industry_proposals.sql:77-85` | Live-only save failure and confusing draft recovery; workaround is selecting a recipient before saving | **P2, source-confirmed** | Product chooses one rule: require recipient in client draft validation with clear inline error, or permit recipient-empty drafts in SQL while preventing forward/submission | Controlled live draft save matches the decided rule; reload preserves all fields; draft stays out of reviewer queues; forward still requires valid recipient |
| FWC-06 | Industry Proposal 2+ baseline review | Complete Proposal 1, open Proposal 2, expand “View baseline details” | Expected referenced shared sections to be sufficiently reviewable; actual UI renders only three summaries and omits actor rows and five supply-chain stages | `src/roles/facilitator.js:4618-4631`; intended shared-section behavior in `docs/INDUSTRY_TURN_SHEET_SPEC.md` | Author may act without seeing the full carried-forward basis; requirement remains partly ambiguous | **P2, source-confirmed / product decision required** | Confirm minimum baseline-review contract, then render the full bounded shared snapshot or explicitly amend the specification | Proposal 2 omits duplicate editors, shows immutable baseline identity and all agreed review fields, and remains linked after return/revision/deletion scenarios |
| FWC-07 | Cross-workflow UX and deadline contract | Cancel a dirty form, navigate away, or submit near a purported deadline | Expected documented deterministic behavior; actual repository has no general unsaved-change contract and no authoritative deadline model | Missing canonical design artifacts; onboarding copy references deadlines without corresponding domain rule | Cannot certify several requested negative/lifecycle cases or write stable acceptance tests | **P1 handover blocker (requirements), not a confirmed runtime defect** | Product/design publishes decisions and canonical glossary/components contract; remove unsupported deadline claims or implement an authoritative server cutoff in separately authorized scope | Approved contract exists; targeted tests cover Cancel/Escape/back/role switch and cutoff race at server time without invented grace periods |
| FWC-08 | Live authorization, persistence, RLS, and migration verification | Repeat critical workflows against controlled hosted environment | Expected deployed revision and migrations prove the same rules as local source; actual audit had no live environment metadata or credentials | Environment limitation; migration source alone is not deployment evidence | Durable state, RLS isolation, SQL triggers, auth expiry, and live reconciliation cannot be handed over as verified | **P1 handover blocker** | Produce a current-head deployment manifest and execute the focused live role/rejection rehearsal with synthetic accounts/data | Evidence identifies deployed commit and migrations; cross-role fresh-login reads pass; wrong-role/direct API calls fail; data is cleaned up or retained per test policy |

No defect is closed by changing a label or selector alone. Each correction must be verified through the original failed operation, the direct boundary, a reload/fresh role, and the affected history/export consumers.

## 7. Bounded remediation batches

### Batch 1 — Restore the critical rehearsal and boundary parity - Completed

**Owner:** QA automation + frontend workflow owner + data/persistence owner  
**Defects:** FWC-01, FWC-02, FWC-03  
**Scope:** update the full-playthrough order and structured Industry helper; add deterministic boundary parity and direct negative/positive move-gate tests. Do not weaken the three-sector gate.

Acceptance:

- The original complete playthrough runs from sign-in through exports.
- It proves move rejection with zero, one, and two completed sectors and success only after all three.
- It exercises Industry draft, forward, Facilitator submit, White Cell return, same-record revision/resubmission, completion, recipient delivery/response, Proposal 2 baseline reference, reload, and history.
- A direct mock boundary call cannot bypass the Industry gate.

### Batch 2 — Align Industry authoring behavior - Completed

**Owner:** Product workflow owner + Industry UI owner + database owner  
**Defects:** FWC-04, FWC-05, FWC-06  
**Scope:** decide the draft-recipient and baseline-detail contracts; align client, SQL, help/error text, and tests; expose pre-click gate status without removing server enforcement.

Acceptance:

- Client and database agree on draft minimums.
- Failed writes never appear saved or forwarded.
- Move control names every missing sector and enables reactively after completion.
- Subsequent proposals reference, but cannot edit, the agreed complete baseline view.

### Batch 3 — Close requirements and live deployment evidence

**Owner:** Product/design authority + release owner + security/data owner  
**Defects/blockers:** FWC-07, FWC-08  
**Scope:** publish authoritative unsaved-change and deadline decisions; establish the canonical glossary/component artifacts or formally change the standards' required set; verify current migrations/RLS and critical workflows on a controlled hosted revision.

Acceptance:

- Unsupported deadline language is removed, or a server-authoritative model and boundary tests exist.
- Dirty-form behavior is consistent for Cancel, Escape, close, browser navigation, and role/session switching.
- Hosted evidence names the deployed commit, applied migration set, test scenario, and synthetic actors without exposing participant data or credentials.

### Batch 4 — Regression breadth after the gate is green

**Owner:** QA owner + PLI workflow owner  
**Scope:** complete PLI adjudication coverage and the remaining stale-auth, stale-tab, retry, deep-link, browser-navigation, and field-boundary matrix.

Acceptance:

- Every shipped critical role has at least one complete cross-role, durable lifecycle.
- Every consequential transition has wrong-role, wrong-session, stale-version, duplicate, and failed-request coverage at the server boundary.
- PLI adjudication remains distinct from artifact completion and recipient acceptance.

## 8. Handover gate and required retests

PLENUM may be reconsidered for handover only when all of the following are true:

1. `npm test -- --run` passes without reducing assertions or excluding current failures.
2. `npm run test:roles` passes the original complete-playthrough path, including structured Industry proposals before move advance.
3. `live-demo-topology.e2e.js`, `live-demo-operator-controls.e2e.js`, and `live-demo-realtime.e2e.js` remain green.
4. Direct API/database attempts prove that role, team, session, revision, orientation, and Industry coverage restrictions are enforced independently of hidden/disabled controls.
5. A controlled hosted run identifies the deployed commit and applied migration state, then verifies durable data after reload/fresh login and correct cross-role delivery.
6. Returned records retain reviewer notes and immutable history, remain the same logical record, and re-enter Facilitator review on resubmission.
7. Proposal recipient approval and responses remain independent per recipient; `Completed`, `Accept`, and `Adjudicate` are never conflated.
8. Draft failures do not display success or enter review queues; duplicate/retry paths do not create duplicate consequential records.
9. The authoritative deadline and unsaved-change decisions are documented and tested, or unsupported language/functionality is explicitly removed from the handover claim.
10. No P0/P1 defects or blockers remain. Any accepted P2/P3 limitation has a named accountable role, user-visible workaround, regression test, and release-note/runbook entry.

### Exact retest commands for the human operator

Run from the repository root after the separately authorized corrections:

```powershell
npm test -- --run
npm run test:roles
node .\node_modules\@playwright\test\cli.js test tests/e2e/live-demo-topology.e2e.js
node .\node_modules\@playwright\test\cli.js test tests/e2e/live-demo-operator-controls.e2e.js
node .\node_modules\@playwright\test\cli.js test tests/e2e/live-demo-realtime.e2e.js
```

Pass means every command exits zero, the complete playthrough reaches its final assertion, browser diagnostics contain no unexpected console/page errors, and the Industry move gate is proven at both UI and server boundaries. A hosted gate must additionally use the repository's documented live-test environment variables and record the deployed commit/migration evidence; a local mock pass must not be relabeled as live verification.

## 9. Final disposition

The product has strong isolated test coverage and several correctly enforced UI workflows, but the current release evidence does not establish a complete supported simulation. The first correction batch should restore the structured Industry lifecycle in the canonical full rehearsal and make the deterministic backend enforce the same move gate as production SQL. Until that path and a controlled live-boundary run pass, the correct handover decision is **not ready**.
