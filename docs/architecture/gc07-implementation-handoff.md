# GC-07 implementation handoff

Recorded September 21, 2026, following the user's request to finish GC-07 and
move to GC-08. This is a documentation-only reconciliation of existing evidence.
No runtime, migration, test, validator or permission has changed. No tests,
builds, migrations, deployments or hosted runs were executed by the agent.

## Decision and boundary

GC-07's messaging implementation is ready to hand off to GC-08 development for
the tested rehearsal configuration. The normal hosted-backend verification now
passes; the earlier statement that this verification was still missing is
superseded by the report below. The human records the prompt's status.

This does not declare full manual acceptance, production readiness, or GC-08
complete. The [prompt book](../green-cell-regional-split-prompt-book.md#gc-07-scope-rfis-communications-and-notifications)
defines GC-07 acceptance around scoped messaging and preserved workflow
boundaries. GC-08 depends on those operational capabilities and the GC-04A
setup/freeze contract. The prompt book separately defines deployment-readiness
evidence and the GC-12 cross-stage rehearsal package. Missing evidence remains
an explicit limit on the affected claim; no gate is waived or relabeled passed.

## Evidence inspected

Paths below are repository-relative. Preserve whole directories outside Git under
the [artifact policy](../repository-artifact-policy.md); these references do not
mean the generated reports belong in source control.

| Receipt | Observed result and scope |
| --- | --- |
| `test-results/gc07-live/d98bef3e-cb77-483e-b1bf-8b60983418bb/results.json` | Normal runner PASS; 63 recorded checks; workflows, races and cleanup true; all 18 Auth sign-outs true. Shared, paired and legacy unified sessions. Local frontend with hosted Supabase Auth/RPC. |
| `output/release-evidence/gc07/ac79e705-ae75-4369-ac01-af67fc44cb85/results.json` | SQL PASS; 104 assertions; rollback verified; all nine fixture categories absent afterward. Captured source and database definitions/ACLs/policies. Original migration receipt explicitly `not supplied`. |
| `test-results/gc07-live/14034733-ef25-4dad-bb7a-753a6955f673/cleanup-retry-cc676f64-e649-43dc-a671-b9d9e2d97a40.json` | Manual fixtures archived, seats/grants closed, history retained; completed at `2026-09-21T00:44:08.920Z`. Do not rejoin or reactivate them. |
| Human-supplied Vitest output, 22:14:54 | 71 tests in four files passed: transport 14, evidence 20, SQL contract 4, GC-06 live checks 33. Repository artifact check passed with 1000 tracked paths. These are unit/source contracts, not SQL execution. |
| Earlier human browser and compatibility output | Six mock browser cases passed at each base path; 81 adapter/compatibility tests passed; manual observations retained separately. Their original source and environment limits remain. |

SHA-256 of the first three reports, respectively:

```text
0c4f9016ddab69dfcef389e477023577fa8c95397a9ce2ad52da9abea91d5886
b0cc3a92f7268e91ecf154b3b5f1f3195b89cded69be741b3421b7a8894e9332
fc29d0db4038a2a8fa65c1331bdd9735afd95af2d2fbce374bda55256cd8c547
```

The normal run identifies operator Sethu, project `gsromgrxgrwwfywaoyme`, URL
`http://127.0.0.1:4174/Fractured-Order/`, start `2026-09-21T13:41:46.069Z` and
finish `2026-09-21T14:54:34.122Z`. It records `connectionPolicy: default`,
`diagnosticOnly: false`, and byte parity for the served HTML/JS/CSS/JSON.
Its working-tree source digest is
`806cfd44183973487b26b3a8b00115c652b2e4e6ed5f75e6e2820a9b48e9d972`, at Git HEAD
`7684cdc70124f7061c4a1b78395a4fdce59a1ec6` with recorded uncommitted changes.
HEAD alone does not identify the tested implementation.

Read-only file hashing found no differences among that report's recorded source
files before this documentation update. This handoff changes documentation, so
the old whole-tree digest is not a claim about the new whole tree. Reports and
build receipts remain unchanged; no new runtime verification is inferred.

## GC-07 acceptance coverage

| Requirement | Evidence and interpretation |
| --- | --- |
| Server-enforced regional RFI ownership and correction/review | Normal run's shared/pairs RFI cycles and direct-table denial, plus SQL assertions. Each Scribe sees its own region; Facilitator authority comes from the authenticated seat. |
| Private direct messages and audience precedence | Normal run's regional direct-message isolation and recipient reads for Asia-Pacific, Europe, both Green delegations and Europe Scribe. Deck notice role isolation is transport evidence, not cross-browser upload delivery. |
| White Cell approval before Blue/Red notifications | Normal run records denial before approval and delivery afterward for both teams in all three models. This is not PLI adjudication evidence. |
| GC-05/06 and legacy compatibility | Normal run retains regional orientation checks, proposal returns/corrections/approvals and isolated Blue/Red rounds; unified RFIs retain legacy ownership. The reused runner's internal `unified: europe` labels do not relabel database records. |
| Contention and stale/revoked authority | Three races: separate regions, duplicate retry and competing reviews, with observed independent PostgreSQL connections and committed readback. Race SQL uses simulated claims of the hosted users; participant workflow HTTP uses real Auth tokens. Stale/revoked seat denials also pass. |
| Shared workspace, reload and reconnect | Human-reported browser observations cover scoped RFI return/resubmission, audience visibility, once-only reload delivery and AP offline/reconnect delivery. Mock browser cases add repeatable UI coverage. This is not a full manual or unread-state acceptance pass. |

The manual observations remain at
`test-results/gc07-live/5e9a38fa-d9bf-484b-87fe-ae3bf6c616af/manual-browser-follow-up.md`.
That directory's automated timeout report remains failed; its browser notes refer
to the separate manual fixtures, not the failed run's sessions. Later conversation
observations also confirmed unified Facilitator-to-White-Cell direct-message
visibility only in White Cell among the checked recipient views. Unified White
Cell guidance still uses legacy parent-Green visibility; it must not be described
as the regional individual-role privacy contract. No old manual form is completed
or rebound to the new source.

## Migration provenance disposition

Installed-state evidence exists. The SQL receipt identifies migration source
SHA-256 `434c6ad476755c77fd3a1307964812b06218ef50db6311c82b9527c0ef01eeca`.
The later normal run captures installed definitions, grants, policies, triggers
and retry indexes before and after its workflows; those two snapshots match.
Its GC-07 private helpers deny both anon and authenticated execution; the three
regional messaging RPCs grant authenticated execution and deny anon execution.
The passing behavioral checks establish the observed rehearsal state.

Historical application evidence is different: the original SQL Editor COMMIT
receipt, application timestamp and original application/source linkage remain
unavailable. Do not manufacture a receipt or rerun the non-idempotent migration.
If recovered, retain the original with source, target and time and reconcile it
against the installed-state evidence. Otherwise carry this documented provenance
gap into deployment review; the deployment-readiness requirement remains open.
Fixture rollback is verified; this is not a destructive migration rollback test.

## Remaining evidence and GC-08 handoff

- **Manual acceptance:** screen-reader announcements, reduced motion and the
  remaining model/workspace keyboard, layout, unread-state and removal coverage
  remain skipped or incomplete. Only the reported shared RFI keyboard, 200% zoom
  and emulated 390-by-844 checks are recorded. The strict 21-check validator stays
  unchanged. Full manual acceptance requires actual observations and receipts.
- **Deployment:** the normal run verifies local assets with a hosted backend,
  not a deployed frontend. Keep the missing historical migration receipt visible
  alongside this limitation in deployment review.
- **PLI:** the human reported the trigger's deployment and successful local-origin
  preflight; actual successful adjudication is not established by that preflight.
  GC-07 does not change scoring or claim the PLI gate passed.
- **Timeout history:** the connection-close diagnostic remains non-acceptance
  evidence. The later normal run passed with reused connections; the earlier
  intermittent timeout's cause remains unproven. No further comparison is required
  merely to record this successful run.
- **Next implementation:** GC-08's authorized Game Master unified/regional
  creation flow, atomic server setup, approved-roster selection and recovery.
  Preserve GC-07 tests and server boundaries. Inspect later function/policy
  replacements before adding its migration. Operational regional activation
  requires an actual approved roster; synthetic rehearsal approvals are not one.

No GC-08 screen or runtime change is included in this handoff. The prompt book's
status table is left for the human. Remaining release/manual evidence is carried
forward explicitly rather than used to restart completed GC-07 implementation.

## Human verification of this documentation update

No new tests are necessary for this status-only change. To verify receipt identity
without network calls, fixture creation, builds or migrations, run from the repo:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath `
    'test-results/gc07-live/d98bef3e-cb77-483e-b1bf-8b60983418bb/results.json', `
    'output/release-evidence/gc07/ac79e705-ae75-4369-ac01-af67fc44cb85/results.json', `
    'test-results/gc07-live/14034733-ef25-4dad-bb7a-753a6955f673/cleanup-retry-cc676f64-e649-43dc-a671-b9d9e2d97a40.json' |
    Format-List Path, Hash
```

Expected: the three hashes above (case-insensitive). A missing file or mismatch
requires investigation; do not substitute another run. This checks receipt
identity, not a new acceptance gate. The existing reproduction commands remain
in [the evidence runbook](gc07-evidence-follow-up.md); use them for a changed
candidate when new verification is required, not to regenerate historical proof.
