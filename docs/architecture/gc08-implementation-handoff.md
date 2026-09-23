# GC08 implementation handoff to GC09

Recorded September 21, 2026. This is an offline audit of retained evidence and
current source, followed by this documentation change. No tests, builds, SQL,
migrations, deployments, roster registration or hosted workflows ran during
this audit. No runtime code, test, validator or permission changed.

## Decision

**GC09 can begin implementation for the tested rehearsal configuration.** The
audit found no missing GC04A–GC08 workflow capability that must be implemented
before starting GC09. This is an implementation handoff, not a declaration that
GC08's overall gate, manual acceptance or deployment readiness has passed. The
human-owned prompt status table remains unchanged.

There is a concrete remaining capability gap **inside GC09**: Intercom's current
target-role list excludes the two regional Scribes. GC09 must correct and test
that delivery before describing regional announcements as working. Deck guidance,
explicit assignment scope and media/text reconciliation also remain GC09 work.
Guidance cannot substitute for any of those implementations.

The [GC09 specification](../green-cell-regional-split-prompt-book.md#gc-09-update-decks-onboarding-and-session-support)
requires context/deck storage, GC05–GC08 workflows, GC07 deck-message audiences
and the approved roster. The mapping below separates those prerequisites from
GC09's own acceptance work and the remaining operational evidence.

## Evidence inspected

All paths below are repository-relative. Retain the complete generated
directories outside Git under the [artifact policy](../repository-artifact-policy.md).
The labels in this table are used in the prerequisite mapping.

| Label | Retained receipt | Result and limit |
| --- | --- | --- |
| H: hosted GC08 workflow | `test-results/gc08-live/81b8e539-11ed-44d1-b0d3-9d19445cd9c1/verification-summary.json`, with `build-receipt.json`, `end-binding.json` and underlying RPC/readback files | 41 checks, `VERIFIED_WITH_LIMITATIONS`, overall gate explicitly not passed. Real hosted Auth/RPC with a locally served frontend and one user-authorized synthetic roster. UI creation/lost-response recovery, three Green joins, five prerequisite orientations, both Scribe handoffs/shared submissions, White Cell returns, regional read/write denials, two RFIs and archive/retry preservation. |
| C: independent contention | H directory plus `contention/4b4df56a-bb99-4638-97da-1285e235b46c/results.json` | Four passing cases: identical creation, conflicting intent, setup-first and join-first. Distinct competing backend PIDs, observed blocking and independent committed readbacks. SQL used simulated JWT claims for hosted identities; this is database contention evidence, not another browser Auth test. |
| R: full regression | `test-results/gc08-regression/8724247f-e64f-43c5-aa11-6df7b7a318c4/summary.json` | 845 unit tests in 53 files passed. Browser result remains **34 passed, 2 failed**: the same GC04A removal timing check at both bases. This receipt remains failed and is not rewritten. |
| S: hosted SQL compatibility | R directory plus `sql-summary.json`, six `sql-gc*.json` responses and exact submitted/original SQL | 484 assertions: GC04 36, GC04A 49, GC05 102, GC06 169, GC07 104, GC08 24. Each fixture subtransaction rolled back; public-table row counts/hashes matched before/after. Captured definitions/ACLs and approval registry remained unchanged across execution. Simulated claims, not browser Auth. |
| V: revocation correction | `test-results/gc08-revocation/406a46cc-0b5f-4459-ad6b-88e74a5305d5/summary.json` | 96 affected unit tests in eight files and all 36 browser cases passed, with no skips/retries. GC04A 10, GC08 2 and GC05–GC07 6 at each URL base. Source/build inventories retained. Local mock coverage; no new hosted revocation claim. |
| G: supporting GC07 workflow | `test-results/gc07-live/d98bef3e-cb77-483e-b1bf-8b60983418bb/results.json` and [GC07 handoff](gc07-implementation-handoff.md) | Normal hosted run passed 63 recorded checks across shared, paired and unified models, including isolated recipient rounds and deck-notice role isolation. Earlier source/environment; not a fresh GC08-era hosted matrix or cross-browser uploaded-deck delivery proof. |

H, C and S identify rehearsal project `gsromgrxgrwwfywaoyme`. H used
`http://127.0.0.1:4174/Fractured-Order/`. R and V browser checks used local mocked
transport at both `/` and `/Fractured-Order/`. No receipt verifies a deployed
frontend. Synthetic sessions were archived with history retained; they must not
be reactivated to manufacture new evidence.

H's original limitations include missing contention and full compatibility
evidence. C and S supply that later evidence within their stated scopes; H's
receipt remains unchanged. R's two failed browser cases are addressed by V's
test correction and rerun. The longer-window diagnostic in V is separately
labeled and is not a pass of the original 15-second test.

## Source identity and unchanged implementation

The four GC08 inventories share HEAD
`1acf872b682618c7000b66ec5a88288f18248797`, with uncommitted work. HEAD alone does
not identify the tested implementation.

| Inventory | Recorded whole-tree SHA-256 |
| --- | --- |
| H, hosted build | `ea586129bc1b22fb815dd56c241d4996efa840e153f9cf700bdeb6fb620dc165` |
| C and R/S | `b1058eefeac186416c8ad7084f46456dfac1a6b8db46680ea5a01dc288780766` |
| V and workspace immediately before this handoff | `c8c1d69625d9973d1d75e0dc769e2d1f42162fde5e9a600c0baa9a07aa6c3b3f` |

Fresh read-only hashing compared each inventory with the current workspace.
**All 498 implementation/product-input files matched all four inventories**:
142 non-test `src/` files, 67 database/edge files, 262 deck/public files,
24 other HTML entry files and three package/Vite build inputs. No implementation
file was added or removed between these inventories and this audit. This count
is a source classification, not a claim that every file was exercised by tests.

The unchanged set includes:

- `src/services/database.js`, `sessionCreation.js`, `regionalDiagnostics.js`,
  `realtime.js`, `sync.js`, `seatBootstrap.js` and `supabaseMock.js`;
- `src/core/seatContext.js`, `teamContext.js`, `config.js`, `src/main.js`,
  the session/participant/action/request/communication/game-state stores,
  `src/roles/gamemaster.js`, `whitecell.js`, `scribe.js` and `facilitator.js`;
- `src/features/scribe/deckConfig.js`, `deckStorage.js`,
  `sharedGreenContext.js`, `src/features/plugins/intercom.js`, the onboarding
  sources and both named Green deck files;
- the GC04A, GC05, GC06, GC07 and GC08 migration sources, including later
  replacement migrations, and the package/Vite build inputs.

Relative to H, only two recorded files changed:
`src/stores/participants.gc04-context.test.js` and
`tests/e2e/gc04-regional-context.e2e.js`. Six files were added: the two GC08
contention scripts, their unit test and documentation, plus
`src/services/supabaseMock.revocation.test.js` and
`docs/architecture/gc08-revocation-regression.md`. Relative to C/R/S, the same
two tests changed and only the latter revocation test/document were added.
V matched the entire workspace inventory before this new handoff file.

The older G run is not included in the 498-file equality claim. Its GC07 migration,
deck configuration/storage, Intercom, team context and Scribe controller still
match current source. Its `src/roles/whitecell.js` and
`src/services/database.js` do not; GC08 changed them. Use the later H/S/R/V
evidence for those changes, not a blanket claim that G tested today's whole tree.

The audit also verified all **94 R artifacts**, all **57 V artifacts**, all
**29 C submitted-SQL hashes**, and all six S capture-query hashes. C retains
distinct competing PIDs and a third committed-readback PID in each case.
The complete per-file comparison is retained at
`test-results/gc08-handoff/648bdd77-252a-4abe-956a-b7f33cc339f7/audit.json`.

Adding this handoff changes the whole-tree digest again. Historical inventories
and verifiers must retain their original digests. File equality preserves the
applicability of the stated implementation observations; it is not a new hosted
run, server-state query, acceptance pass or current-build deployment receipt.

## GC09 prerequisite mapping

| Prerequisite | Evidence and disposition for implementation |
| --- | --- |
| GC04A confirmed model/seat context and deck storage | S's GC04/GC04A assertions; V's role joins, model-bound routes, shared view/reload and removal cases; affected seat/deck cleanup unit tests. Context/storage foundation is available. Keep one shared deck namespace and explicit regional working keys; paired and unified behavior remain supported. |
| GC05 orientations | H records all five submitted prerequisites, including both regional Scribe handoffs/shared submissions. S has 102 orientation assertions; R/V include orientation regression cases. Guidance must preserve the existing Blue prerequisite and qualifying-orientation semantics. |
| GC06 proposals and approved recipient threads | H demonstrates both regional proposals through shared submission and immutable White Cell returns; S has 169 assertions, including wrong-recipient and old-revision denial. G records separate Blue/Red rounds in all models. Workflow is implemented; H itself did not exercise recipient-thread exchanges. Retain that hosted coverage limitation. |
| GC07 RFIs and messaging | H records two regional RFIs and White Cell filtering; S has 104 assertions; G covers regional corrections, private messages and persisted audiences; V reruns local messaging flows. Explain Facilitator-owned RFIs and each Scribe's authorized regional reads, not invented Scribe authoring rights. |
| GC07 deck-message audience rules | G explicitly records shared and paired deck-notice role isolation through the operator RPC and actual recipient reads. The GC07 migration is unchanged; S/R/V supply subsequent compatibility evidence. This supports addressed notice transport, not delivery of browser-local uploaded bytes or Intercom broadcast acceptance. |
| GC08 creation and administration | H creates through the normal UI, recovers the lost response with the same request/session identity, joins all three target seats and preserves history on archive. S has 24 administration assertions. C proves four transaction orderings with committed readback. Creation capability is available; missing operational roster approval still blocks regional activation. |
| Recovery and revocation cleanup | C proves retry/setup serialization; H proves archive replay does not reactivate. V proves local rendered/scoped-storage/IndexedDB cleanup through the scheduled heartbeat fallback. The revoked identity can lose permission to receive its own realtime row; do not promise instantaneous push removal or infer hosted latency from Playwright's clock. |
| Approved roster for final content | The prompt book's D-02 decision and `green-regional-contract.json` record `green-roster-v1`: Asia-Pacific = South Korea/ROK, Japan, ASEAN; Europe = UK, France, EU. This resolves content membership. It does not register an exercise-approved operational roster in Supabase; H/C use a separately labeled synthetic fixture. |
| Existing models and Notetakers | S and R cover historical NULL/v1 and paired compatibility; V covers regional joins and shared cleanup. Preserve legacy role inversion, the two existing region-assigned Notetaker seats and scoped notes. These receipts do not authorize additional represented entities, seats or historical relabeling. |

## Actual GC09 work and limits on claims

1. **Intercom regional delivery is not complete today.**
   `src/features/plugins/intercom.js` builds `INTERCOM_SCRIBE_TARGET_ROLES` from
   legacy team Facilitator-surface roles (semantic Scribes), inserts that list
   into outgoing payloads, and requires an exact role match in
   `isIntercomAnnouncementForScribe`. It omits `green_asian_pacific_scribe` and
   `green_europe_scribe`. Regional receiver mounting alone cannot make those
   payloads eligible. Correct and test this under GC09's explicit Intercom task,
   retaining session-wide announcement semantics and compatible old-model roles.
   This blocks GC09 announcement acceptance, not the start of GC09 implementation.
2. **Audit the active deck before editing content.**
   `buildDefaultScribeDeckPath('green')` resolves to
   `decks/green/fractured-order-facilitator-deck.html`; the Scribe controller uses
   that builder. The separately named
   `fractured-order-green-facilitator-deck.html` is not that default and still
   contains Australia/Germany in its regional composition. Reconcile final
   materials against D-02 while preserving historical provenance; do not combine
   the old list with the approved roster or relabel historical session records.
3. **Finish deck assignment/section and onboarding guidance within GC09.**
   The shared context notice already describes GC05–GC07 capabilities. Preserve
   its restrictions while reconciling all guide/deck surfaces. Repository deck
   paths and addressed notices exist; uploaded deck data remains browser-local
   IndexedDB. A notice does not transfer the upload to another browser. Do not
   describe cross-browser uploaded-deck distribution as implemented. Any new
   transport beyond the numbered scope needs an explicit dependency/scope decision.
4. **Audit text, transcripts and narrated media.**
   Implement the supported text fallback or explicitly report stale media. This
   handoff does not assert that regional narration exists, has been regenerated,
   or has owner approval. GC09 must test the actual runtime deck and fallback.

No predecessor implementation defect requiring a separate repair was identified
by this audit. The Intercom omission and guidance/assignment reconciliation above
are concrete GC09 deliverables, not reasons to silently expand permissions or
restart completed GC08 implementation.

## Evidence and activation requirements carried forward

- **Exercise activation:** the documented roster choice is distinct from an
  operational registry entry with exercise approval provenance. Preserve the
  synthetic fixture's label and immutability. Do not promote it, invent approval,
  create participant decisions or activate an operational regional session.
- **Hosted coverage:** retain the missing fresh GC08-era startup/reconnect/
  operator-removal matrix across unified, paired and shared models, including
  recipient-isolated exchanges, missed-event recovery, concurrent regional
  submissions and stale White Cell review behavior. Earlier G coverage and
  current SQL/mock checks are relevant but do not become a new hosted matrix.
  Intercom and uploaded-deck delivery also require their own correctly scoped
  evidence as GC09 is implemented.
- **Manual accessibility:** keyboard coverage in automation is not screen-reader,
  reduced-motion, 200% zoom, mobile or full manual acceptance. Retain the
  outstanding observations and original evidence limits.
- **Deployment and migration provenance:** local builds with hosted Supabase do
  not verify a deployed frontend. Installed definitions/ACLs and rollback
  receipts do not manufacture missing historical migration-application/COMMIT
  provenance or establish destructive rollback recovery. Do not reapply a
  non-idempotent migration to produce a receipt.
- **Overall gate:** GC08 remains not declared passed. GC09 implementation may
  proceed with these limits; GC09 acceptance and operational release need their
  own fresh evidence after its changes. No prompt-book status is edited here.

## Human verification of this handoff

No new tests are needed for this documentation-only change. To check the retained
receipt identities without executing tests, SQL or a hosted workflow, run from
the repository root:

```powershell
$gc08Live = 'test-results/gc08-live/81b8e539-11ed-44d1-b0d3-9d19445cd9c1'
$gc08Regression = 'test-results/gc08-regression/8724247f-e64f-43c5-aa11-6df7b7a318c4'
$gc08Revocation = 'test-results/gc08-revocation/406a46cc-0b5f-4459-ad6b-88e74a5305d5'
Get-FileHash -Algorithm SHA256 -LiteralPath `
    "$gc08Live/verification-summary.json", `
    "$gc08Live/contention/4b4df56a-bb99-4638-97da-1285e235b46c/results.json", `
    "$gc08Regression/summary.json", "$gc08Regression/sql-summary.json", `
    "$gc08Revocation/summary.json" | Format-List Path, Hash
```

Expected SHA-256 values, in that order:

```text
a2d56b5635c68211371b1ce18288fae9dfad485245ecd6e46b9b31a937d5ccf4
d7bd0401f6e56132cacb43e8b63d0c5fa2a196c701e0a84dac3d7efe7104385b
38e39557c4ae1aad03aa6a8e78041f23ddb9c3075a1184b52bef0d9b5e48226c
6bbce6f23ed82f05f95e356a2e271fa603b1dbe5d13f7c5cfe95b562a503d105
e0b6db53a4de2ecc87c35e30d62805e74e558c39d7263f43764e68f1c13a7ba7
```

A missing receipt or mismatch requires investigation. The original complete-tree
verifiers can now reject the changed documentation digest; that is expected and
must not be worked around by editing their receipts. The retained offline audit
script lists individual changed/added paths and verifies the 498 implementation
files and artifact manifests without altering earlier evidence:

```powershell
node --preserve-symlinks --preserve-symlinks-main test-results/gc08-handoff/648bdd77-252a-4abe-956a-b7f33cc339f7/audit.mjs --recheck
```

Expected: zero implementation drift for H/C/R/V, 498 matching implementation
files per inventory, 94 and 57 manifest entries intact, and matching contention/
SQL hashes. The new handoff appears only as added documentation. This is an
offline audit result, not a rerun or gate pass.
