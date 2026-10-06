# Industry Proposals

Industry uses the existing proposal workflow, recipient approval model, and
Facilitator presentation surface. The structured Industry proposal replaces the
older generic Industry proposal form; it is not a new artifact type.

## Workflow

1. White Cell completes the consolidated Industry Strategic Plan.
2. Industry selects Agriculture, Biotechnology, or Telecommunications and
   records the three-page proposal.
3. The author selects Blue, Red, or both under **Intended recipients**.
4. Industry forwards the draft to the Facilitator. The Facilitator may edit the
   proposal and its separate Facilitator note, then submits it to White Cell.
5. White Cell reviews each intended recipient independently. Existing isolated
   proposal threads carry approved proposals to Blue and/or Red.

All user-facing copy calls this artifact an **Industry proposal**. The nested
`industryTurnSheet` JSON key is retained as a compatibility key for persisted
data and existing proposal projections.

## Gates and identity

- Industry cannot create a proposal until White Cell has completed a valid
  version 2 Industry Strategic Plan.
- Each Strategic Plan risk and strategic priority has a stable, sector-scoped
  ID. Proposal links store those IDs so later text edits do not break linkage.
- Proposal numbers are scoped to session, move, and Industry sector. They are
  assigned under a transaction advisory lock and are never reused, including
  after a deletion.
- A second proposal for the same sector and move cannot be created until White
  Cell completes Proposal 1.
- Deleting Proposal 1 removes it as the active baseline. The replacement gets
  the next unused number and becomes the active baseline.
- A move cannot advance until White Cell has completed at least one proposal
  for Agriculture, Biotechnology, and Telecommunications in that move.

## Visibility

- `public`: every authenticated participant in the session.
- `private`: Industry and White Cell only.
- `confidential_blue`: Industry, Blue, and White Cell only.

The dated migration applies the same restriction to the proposal action,
review history, action log, related timeline entries, and proposal-thread
communications. White Cell retains complete access for review and research
exports. An approved recipient receives a recipient-safe structured snapshot;
the other recipient selection, visibility setting, linked-record identifiers,
contacts, baseline identifiers, and Facilitator note are not copied into that
thread snapshot.

## Persistence

Apply `data/2026-10-06_industry_proposals.sql` after
`data/2026-10-05_green_proposal_activity_projection.sql`. It does not rewrite
historical actions. It validates the completed Strategic Plan reference and
recipients, assigns immutable proposal/baseline fields, adds the move gate, and
installs restrictive visibility policies.

## Application record

- **2026-10-06:** The operator reported applying
  `data/2026-10-06_industry_proposals.sql` through the Supabase SQL Editor. The
  editor returned `Success. No rows returned`.
- The target Supabase project identifier and environment label were not
  supplied. This records operator-reported application only; it is not a
  production sign-off or post-migration workflow verification result.
