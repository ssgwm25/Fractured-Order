# Industry Strategic Plan architecture

The Industry Strategic Plan replaces only the Industry team's pre-Move-1
Strategic Orientation form. Blue, Red, and Green retain their existing forms
and contracts. Industry submits one consolidated package containing mandatory
plans for Agriculture, Telecommunications, and Biotechnology.

## Persistence contract

Industry continues to write one `actions` row with:

- `mechanism = Strategic Orientation`
- `artifact_type = strategic_orientation_forecast`
- `team = industry`
- an empty outer `sector` value, because the artifact covers three sectors
- the one shared Blue forecast in `forecast_targets`
- the normalized package in
  `artifact_payload.strategic_orientation.industryStrategicPlan`
- the line-oriented compatibility envelope in `ally_contingencies`

The outer Strategic Orientation contract remains version 2. The consolidated
Industry sub-contract is version 2 and is serialized as two additive envelope
lines:

```text
Industry Strategic Plan Version: 2
Industry Strategic Plan: {"version":2,"sectorPlans":{"Agriculture":{...},"Telecommunications":{...},"Biotechnology":{...}}}
```

No table, column, artifact type, RPC, RLS policy, workflow state, or uniqueness
rule is added. The existing one-orientation-per-session/team constraint keeps
the package as Industry's single artifact and revision history. No SQL migration
is required because the existing serialized artifact field stores the nested
versioned package.

## Normalized plan

`sectorPlans` has exactly the three platform sector keys: `Agriculture`,
`Telecommunications`, and `Biotechnology`. Each sector contains a business
overview, exactly three risks, expected Red priorities, one to three complete
partners, a first ambassador target, exactly three strategic priorities, a
numeric strategic stance, and a red line.

The Blue orientation forecast is deliberately absent from every sector plan.
It continues to use the existing Pressure / Stabilization / Reframe catalogue
and `forecastTargets` representation, leaving one persisted source of truth.

The Industry modal exposes sector tabs with `Not started`, `Incomplete`, and
`Complete` status and six pages per sector:

1. Sector and Business Overview
2. Top Three Risk Factors
3. Opening Read of the Environment
4. Partner Map
5. Strategic Priorities
6. Strategic Stance and Red Line

A final review displays all three sectors. All three plans and the shared Blue
forecast must validate before the package can be recorded.

## Lifecycle and compatibility

The lifecycle remains:

```text
Industry author → Facilitator presentation/submission → White Cell review
                → complete, or return → edit → resubmit
```

White Cell accepts or returns the entire package. A returned version 2 package
rehydrates all three sector plans. Version 1 one-sector Industry plans and older
generic Industry orientations remain readable historical context, but their
answers are not copied into version 2 fields and they do not satisfy the Move 1
completion gate. Resubmission requires a complete version 2 package.

Malformed optional plan JSON does not invalidate the historical outer
artifact. The UI shows a repair warning while retaining the readable outer
Strategic Orientation fields.

## Audit and export boundaries

Existing Strategic Orientation event names and review operations are unchanged.
Timeline metadata records only the bounded plan version and canonical sector
keys; narratives remain in the action and immutable revision snapshots.
Research JSON/CSV projections preserve the complete nested plan, and the
HTML/LaTeX reports render a separate section for every sector.

The separate Industry Turn Sheet and PLI workflows are unchanged and outside
this modal and persistence contract.
