# Fractured Order glossary

This is the canonical terminology source required by `DESIGN_STANDARDS.md` and
`WRITING_STANDARDS.md`. Labels, help text, tests, identifiers, and reusable
components use the preferred term. A synonym in **Avoid** is prohibited when it
refers to the defined concept; quoted historical evidence may retain its source
wording.

| Preferred term | Plain definition | Computed from / unit | Avoid | Symbol |
| --- | --- | --- | --- | --- |
| Session | One isolated exercise instance containing its actors, game state, and records. | Not computed | game, room | None |
| Seat | One server-authorized role assignment in a Session. | Not computed | slot, account | None |
| Scribe | The team role that authors durable Strategic Orientation and Action or Proposal records. | Not computed | secretary | None |
| Facilitator | The team role that reviews and explicitly hands team records to White Cell. | Not computed | approver | None |
| Notetaker | The team role that captures private observations, dynamics, and alliances. | Not computed | recorder when referring to this role | None |
| White Cell | The operator function that reviews artifacts and controls simulation state without deciding for team authors. | Not computed | admin when referring to adjudication | None |
| Game Master | The operator role that creates, administers, exports, archives, and deletes Sessions. | Not computed | superuser | None |
| Strategic Orientation | The required pre-Move 1 team position and forecast artifact. | Complete only from the server-recognized team matrix | strategy choice, SO in first-use copy | Compass mark |
| Move | A numbered simulation epoch. | Integer 1–3 from authoritative game state | round, turn | Numbered mark |
| Phase | A numbered stage within a Move. | Integer 1–5 from authoritative game state | step when referring to game phase | Numbered stage |
| Timer | An operator-controlled pacing display that does not enforce submission eligibility. | Seconds remaining | deadline, cutoff, due time | Clock |
| Draft | A saved, editable record that has not been explicitly handed forward. | Workflow state | submission | Draft badge |
| Handoff | An explicit workflow action that transfers a record to the next authorized role. | Server transition | publish when no publication occurs | Directional arrow |
| Action | A Blue or Red team operational record. | Not computed | proposal | Action mark |
| Proposal | A Green or Industry team operational record with intended Blue and/or Red recipients. | Not computed | action when referring to the artifact type | Proposal mark |
| Industry Turn Sheet | The structured Industry Proposal form for one sector and Move. | Not computed | Industry action | Proposal mark |
| Baseline | The immutable Environment and Supply Chain view established by a sector's completed Proposal 1. | Referenced by baseline proposal ID | copied fields, inherited draft | Reference link |
| Request for Information | A question sent by a Facilitator to White Cell and retained through return, resubmission, and answer history. | Not computed | support ticket | Question mark |
| Return for changes | A review transition that keeps the same record identity and opens its next revision. | Prior revision + 1 | reject when revision is requested | Return arrow |
| Complete | A terminal workflow state recorded by an authorized server transition. | Server state and completion timestamp | success, win | Check mark |
| Industry coverage | Whether Agriculture, Biotechnology, and Telecommunications each have at least one completed Proposal for the current Move. | Three required sector completion checks | sector score | Three-sector list |
| Unsaved changes | User edits in an open protected form that have not completed a persisted write. | User `input` or `change` after the form opens | autosaved, pending save | Warning mark |
| Rehearsal deployment | A controlled hosted frontend and dedicated backend used only with synthetic actors and data. | Deployed commit + verified migration ledger | production exercise | Environment label |

At first use, spell out Request for Information; `RFI` may be used afterward.
Actor display names in evidence must be synthetic labels, never participant
names.

