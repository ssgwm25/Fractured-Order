# Industry Strategic Plan architecture

The Industry Strategic Plan replaces only the Industry team's pre-Move-1
Strategic Orientation form. It remains one record in the existing Strategic
Orientation workflow; Blue, Red, and Green retain their current forms and
contracts.

## Persistence contract

Industry continues to write one `actions` row with:

- `mechanism = Strategic Orientation`
- `artifact_type = strategic_orientation_forecast`
- `team = industry`
- the Blue forecast in `forecast_targets`
- the complete normalized plan in
  `artifact_payload.strategic_orientation.industryStrategicPlan`
- the line-oriented compatibility envelope in `ally_contingencies`

The outer Strategic Orientation contract remains version 2. The optional
Industry sub-contract is version 1 and is serialized as two additive envelope
lines:

```text
Industry Strategic Plan Version: 1
Industry Strategic Plan: {"version":1,"sector":"Telecommunications",...}
```

No table, column, artifact type, RPC, RLS policy, workflow state, or uniqueness
rule is added. The existing one-orientation-per-session/team constraint and the
Move 1 completion gate continue to treat this record as Industry's single
Strategic Orientation artifact.

## Normalized plan

The nested plan stores `sector`, `businessOverview`, exactly three `risks`,
`redPriorities`, one to three complete `partners`, `firstAmbassadorTarget`,
exactly three `strategicPriorities`, numeric `strategicStance`, and `redLine`.
Sector values use the platform's existing full names: `Agriculture`,
`Telecommunications`, and `Biotechnology`.

The Blue orientation forecast is deliberately absent from the nested plan. It
continues to use the existing Pressure / Stabilization / Reframe catalogue and
`forecastTargets` representation, so there is only one persisted source of
truth.

## Lifecycle and compatibility

The lifecycle remains:

```text
Industry author → Facilitator presentation/submission → White Cell review
                → complete, or return → edit → resubmit
```

Version 1 Strategic Orientation envelopes, current version 2 Blue/Red/Green
envelopes, and older version 2 Industry envelopes remain readable. An older
Industry record displays its previous own orientation and strategy description
as historical context, but those values do not satisfy any new plan field. A
returned legacy record must therefore be completed as a full plan before it can
be resubmitted.

Malformed optional plan JSON does not invalidate the historical outer
artifact. The UI shows a repair warning while retaining the readable legacy
fields.

## Audit boundaries

Existing Strategic Orientation event names and review operations are unchanged.
Timeline metadata may include only the bounded plan version, sector, and stance;
the plan narratives, risks, partners, priorities, and red line remain in the
action and immutable revision snapshots. Research JSON/CSV projections and the
HTML/LaTeX reports include the complete nested plan.

The separate Industry Turn Sheet is outside this modal and persistence
contract.
