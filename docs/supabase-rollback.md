# Supabase Rollback

Database migrations in this repository are forward-only once live workflow records exist. Roll back the application first; preserve additive schema and review history unless a database owner has verified that the migration never accepted a production write.

The sole authoritative forward migration order is the dated ledger in
`docs/supabase-setup.md`. There is no reverse SQL order and the deprecated
`data/COMPLETE_SCHEMA.sql`, `data/updated_supabase_schema.sql`, and
`data/updated_supabase_migration.sql` snapshots are never rollback inputs. A
rollback means frontend-first containment followed by a forward fix; it does
not mean replaying historical schemas or dropping additive workflow objects.

## GC-11 research export containment

After `data/2026-10-01_gc11_research_export_context.sql`, keep the operator-only
`export_gc11_research_context` function during an application rollback. It is a
read-only compatibility projection and preserves the raw persisted model beside
the effective label. Do not backfill `green_seat_model`, infer delegation for
legacy rows, expose the RPC to anonymous users, or join PLI records into the
research archive. If schema 2.0 output is faulty, stop new research exports,
retain source rows and removed-seat receipts, and repair forward. See
[GC-11 research exports](architecture/gc11-research-exports.md).

## GC08 unified removal receipt containment

After `data/2026-09-30_gc08_unified_seat_removal_history.sql`, preserve
`gc08_unified_seat_removals` and its immutable triggers. A receipt failure must
abort removal; do not restore the old destructive `gc03_legacy_remove` to bypass
it. Contain affected removals and repair forward. Never backfill deleted names
from mutable participant records, delete retained receipts, or grant browser
access to the private helper/table. See the
[repair and verification runbook](architecture/gc08-unified-seat-removal-repair.md).

## Regional Green Storage Containment

After `data/2026-09-29_gc08_session_administration.sql`, retain the private
`gc08_session_creations` receipts, approved roster snapshots and all existing
freeze/seat/RLS guards. Contain new setup in the frontend and fix forward.
Do not delete retry receipts, convert an occupied session, replace an approved
snapshot, or retry an unconfirmed regional creation as unified. Existing legacy
creation signatures remain installed. Restore Game Master access and recover the
original request in the same tab; if that tab is lost, inspect Session Management
by the original code before creating anything else. See the
[GC-08 recovery runbook](architecture/gc08-session-administration.md).

After `data/2026-09-25_gc05_regional_orientations.sql`, retain the handoff revision
column, orientation RPCs, restrictive write policy, read guards and database
move/phase gate. Stop affected regional submissions and contain with a compatible
frontend; fix forward. Do not remove the gate, clear handoff/review evidence,
reapply GC-04A's blanket shared denial, or relabel historical Green records.
Existing four-seat revision-one handoffs remain readable/submittable without
backfilling a marker; corrected revisions require a new originating-Scribe
handoff. See [GC-05 recovery and verification](architecture/gc05-regional-orientations.md).

After `data/2026-09-24_gc04a_shared_facilitator.sql`, retain the seat-model column,
frozen model, shared-seat unique index and model-aware claim/restore/RLS helpers.
Stop new shared-session setup during containment and use a compatible frontend.
Do not unset a frozen model, convert existing participants into regional
Facilitators, or reapply older helpers over shared sessions. Preserve all
tombstones, artifact owners and historical evidence; fix forward. See
[GC-04A scope and pending evidence](architecture/gc04a-shared-facilitator.md).

After `data/2026-09-23_gc04_legacy_session_topology.sql`, retain response-only
NULL-to-v1 normalization in both GC-04 RPCs. Reverting to their September 22
responses blocks historical unified sessions at join and reload. Repair forward;
never backfill historical topology, bypass the browser guard, change regional
grants, or clear seat revocations to recover a legacy session.

After `data/2026-09-22_gc04_session_context.sql`, retain the authenticated
`restore_session_seat_context` function and topology-bearing lookup. Contain
with a compatible frontend and repair forward. Never use URL or cached role
fallback to recover a denied regional seat. See [GC-04 recovery and evidence](architecture/gc04-regional-context.md).

After `data/2026-09-19_green_regional_authorization.sql`, retain restrictive scope
policies, final mutation guards, private compatibility RPCs and every
`session_participants.revoked_at` marker. Never clear a revocation or delete its
seat to revive a stale client; scoped notes retain that seat as historical
authorship. Contain with the unified frontend and repair forward. Do not restore
an older permissive policy or pre-authorization proposal retry RPC. See
[GC-03 verification and dependencies](architecture/green-regional-authorization.md).
Keep the authorization guards in both PLI Edge Functions during containment;
reverting to the old Bearer-header-only handlers reopens external dispatch.

The GC-03 completion harness adds request-correlated authorization logging to
the guarded Edge entrypoints. Keep the authorization check if containing a
logging problem; removing the log invalidates correlated-log evidence until a
forward fix is deployed and checked. Retain partial completion reports. The
new run's `cleanup.sql` archives only its five exact synthetic sessions and
removes its temporary grants; it is fixture cleanup, not a migration rollback.
See [completion verification](architecture/gc03-completion-verification.md).

After `data/2026-09-20_gc03_terminal_revision_conflicts.sql`, retain terminal
PT409 responses for stale application revisions and proposal thread parents.
Restoring deliberate 40001 raises can reintroduce automatic RPC retry timeouts.
The repair changes no stored records or policies. If installation detects
unexpected function/site drift, its transaction aborts; retain the error and
inspect installed definitions before a forward correction. Do not replay old
function owners or expose the private append implementation. Preserve the
failed completion report and its archived fixtures; verify a fix with a fresh
run rather than reopening or erasing history.

For environments ending at `data/2026-09-18_green_regional_storage.sql`, retain the explicit GC-02
activation closure until the later regional authorization work is verified.
After `data/2026-09-21_gc03_recipient_forward_uniqueness.sql`, retain recipient
root uniqueness and the legacy-only proposal-wide index. Restoring the old
unconditional proposal-wide index blocks valid second-recipient approvals and
can fail once two roots exist. Keep all roots, reviews and thread history;
contain at the application and repair forward. The associated SQL regression
uses temporary index fixtures and rolls back without changing public records.
GC-04 adds regional join and context validation; later regional workflow prompts
remain separate dependencies. Stop regional
setup/writes when investigating a failure; do not bypass the closure with a
browser service-role key or shared JSON storage.

Keep `session_topology_version`, `topology_frozen_at`, the approved roster
version/snapshot, `session_topology_locks`, all delegation/audience fields,
both orientation indexes, scoped note rows and their retained-seat references.
Never clear a freeze or convert an occupied v2 session to v1. Preserve the
private unified append implementation and its regional wrapper; restoring the
old public RPC alone would reopen its pre-write retry read.

Use the operator-only `export_green_storage_evidence` RPC to preserve the raw
regional session, seat/name, artifact, review, communication/thread, timeline,
note and captured audit records. Keep this compatible reader and all historical
snapshots through a frontend rollback. Publication-format exports remain a
GC-11 dependency; they are not a substitute for retaining raw scoped evidence.
Repair forward. Do not drop columns/tables, merge delegations, restore shared
note ledgers, or rewrite historical unified records. See the exact commands and
remaining evidence in [Regional Green storage](architecture/green-regional-storage.md).

## Game Master Session Retirement Rollback

For `data/2026-08-17_game_master_session_retirement.sql`, roll back the frontend
first to remove the archived-session Delete control. Keep `sessions.deleted_at`,
the expanded status constraint, the protected `delete_live_demo_session` RPC,
every `deleted` session tombstone, and every `SESSION_DELETED` research event in
place after any accepted write. Older clients already exclude non-active rows.
Do not relabel a deleted session as archived or remove its audit event; repair
forward if the management surface needs correction.

## SSG Training Decommission Rollback

For `data/2026-08-26_decommission_ssg_training.sql`, roll back the application
first and repair forward. Do not restore the deleted training RPCs or re-reserve
`TRAINING2026`. Keep the fixed template UUID archived, protected, code-free,
and classified `retired_training_archive`. Keep `training_attempts` and
`training_progress_events` as administrator-only historical records with their
original owners, revisions, event keys, and version labels. Do not restore
authenticated grants or owner-select policies.

If another live session has since been assigned `TRAINING2026`, preserve that
session and all of its evidence. Never attach historical training attempts to
the new session, convert the archive to `live_exercise`, or delete historical
rows to make a rollback appear clean. Reintroducing a learner training product
requires a separately reviewed forward design, new identifiers, and new RPCs;
the decommission migration itself is never reversed or edited in place.

## Session-Role Display-Name Snapshot Rollback

For `data/2026-08-26_session_role_name_snapshots.sql`, keep
`session_participants.display_name_snapshot`, its capture trigger, and every
backfilled value after deployment. A snapshot is session evidence: do not replace
it with the current mutable `participants.name`, clear it on disconnect, or
rewrite historical names after the same browser identity joins elsewhere.

If roster rendering must be contained, roll back the frontend first and repair
forward. The retained column is additive and older clients ignore it. Do not
drop the column or trigger after any new seat has been claimed, because that
would silently return archived role/name pairings to mutable identity data.

## Team-Neutral Artifact Review Rollback

For `data/2026-08-05_team_neutral_artifact_review.sql`:

1. Stop new deployments and prevent White Cell review activity for the affected session.
2. Export `actions`, `requests`, `artifact_workflow_reviews`, `action_logs`, and linked `pli_adjudications` for the affected session.
3. Deploy the prior frontend commit. The retained compatibility wrapper remains database history only; all new review operations stay on the team-neutral artifact RPC.
4. Leave the new nullable metadata columns, `artifact_workflow_reviews` rows, expanded workflow constraints, and `operator_review_artifact` function in place. Older clients ignore these additive fields. Do not translate `returned_to_team` back to `returned_to_blue`, mint outcomes for `completed` rows, decrement revisions, or delete review history.
5. Confirm the prior client can read actions and RFIs. Treat Red/SO/RFI artifacts already returned by the new RPC as operator-managed blockers until the forward fix is deployed; do not relabel them to bypass old UI assumptions.

Safe rollback pass conditions:

- the prior frontend is serving successfully
- legacy `status` values remain `draft`, `submitted`, `adjudicated`, or `abandoned` for actions and `pending`, `answered`, or `withdrawn` for RFIs
- historical `returned_to_blue` and new `returned_to_team` labels are unchanged
- `artifact_workflow_reviews` row counts and snapshots are unchanged
- no completed artifact has gained an outcome

Historical `returned_to_blue` rows are legacy evidence, not incomplete
migrations. Leave their stored label and any NULL revision/review metadata
unchanged. Do not manufacture `artifact_workflow_reviews` entries for them.
Likewise, preserve the review RPC, compatibility wrapper, normalization
functions and triggers, review-table RLS policy, grants, and comments after a
write; these additive objects are required to interpret accepted history even
when the older frontend does not call them.

## Facilitator RFI And Communications Rollback

For `data/2026-08-06_facilitator_rfi_communications.sql`, roll back the application first and stop new team RFI/direct-message writes. Export affected `requests`, `communications`, `actions`, `artifact_workflow_reviews`, and timeline rows before changing policy state. Keep all accepted RFI revisions, review notes, answers, and direct messages intact.

For `data/2026-08-06_proposal_recipient_threads.sql`, roll back the frontend first and stop proposal approval/message writes. Do not drop the thread indexes, immutability trigger, or append-only rows after any thread has been created. Export `actions`, `communications`, `artifact_workflow_reviews`, and proposal timeline rows, including metadata, then prefer a forward fix. Reapplying the June finalization lock or the earlier August communications policy would restore superseded proposal-wide mutable responses and is not a safe live rollback.

For `data/2026-08-15_proposal_forwarding_integrity.sql`, contain by rolling back the frontend and stopping proposal response submissions. Do not delete `PROPOSAL_RESPONSE_REVIEW` rows or their forwarded `PROPOSAL_RESPONSE` rounds. Keep `operator_forward_proposal_response`, the snapshot-preparation trigger, and the reconciled recipient payloads in place; repair forward if a response is stuck. Removing the trigger while newer clients are active can bypass White Cell review or re-expose partner-routing fields.

For `data/2026-08-11_requests_responded_by_schema_repair.sql`, keep the nullable
`requests.responded_by` column in place. Older clients ignore it, while the
current Facilitator RFI guard requires the row field even for unanswered
inserts. Do not drop the column or remove the guard as rollback; contain with
the prior frontend and use a forward fix if responder attribution behavior is
incorrect.

For `data/2026-08-13_rfi_answer_completion_trigger.sql`, keep the terminal-row
predicate in `update_request_response_time()`. Removing it restores a
transactional collision: `operator_answer_request()` completes the RFI, its
linked response communication invokes the legacy trigger, and the completed
artifact guard rolls the answer back. Contain with the prior frontend only if
necessary and prefer a forward function repair; do not weaken request
immutability or delete accepted review/communication history.

For `data/2026-08-13_strategic_orientation_team_canonicalization.sql`, keep the
canonicalization trigger in place after any accepted Strategic Orientation
write. Removing it restores client-dependent type classification and allows a
stale client to collide with `actions_artifact_team_check` during both create
and draft edit. The trigger does not rewrite historical rows or broaden the
four-team constraint. Contain with the prior frontend only if necessary and
prefer a forward trigger repair; do not drop the team constraint.

For `data/2026-08-13_action_notification_delivery.sql`, retain
`operator_complete_action_with_notifications` and every accepted
`ACTION_NOTIFICATION` communication after a write. The communication metadata
links the recipient, source action, revision, authored request, and action
snapshot; removing it destroys the delivery record. Contain with the prior
frontend if necessary and use a forward function repair. Do not delete a team
communication, reopen its completed action, or synthesize a missing recipient
delivery outside the protected RPC.

For `data/2026-08-13_action_notification_type_contract.sql`, retain the expanded
`communications_type_check` after any `ACTION_NOTIFICATION` write. Reverting the
constraint strands a supported communication type and makes subsequent atomic
action acceptance fail. Contain with the prior frontend if necessary and use a
forward constraint repair; do not delete delivered communications.

Do not reapply the July 29 policies as a live rollback: doing so restores the superseded Scribe-side RFI authority and broader request access. Prefer a forward policy fix. If the frontend must temporarily revert, treat every `returned_to_team` RFI as an operator-managed blocker until the corrected Facilitator surface returns. A database owner may restore older policies only in an isolated pre-write development project after verifying that no RFI or direct communication was created under the August 6 contract.

## Pre-Write Development Teardown Only

If and only if the migration was applied to an isolated development project and this query returns zero rows:

```sql
select count(*) as workflow_review_count
from public.artifact_workflow_reviews;
```

a database owner may restore the prior function definitions by reapplying `data/2026-07-29_return_action_to_blue.sql` and then remove the unused additive objects in a separately reviewed teardown migration. Do not perform that teardown in a live or shared environment: dropping columns or the review table destroys provenance and is not an operational rollback.

After any rollback, use the verification queries in `docs/supabase-setup.md`. Record the frontend commit, database migration state, export location, operator, UTC time, and affected session IDs in the incident record.

Rehearse this containment sequence in the dedicated environment before release:
deploy the prior frontend first, confirm it can read the additive schema, and
verify that `artifact_workflow_reviews`, proposal thread rounds, recipient
approvals, notification metadata, and RFI return/resubmission/answer history
retain the same row identities and timestamps. Restore the candidate frontend
with a forward deployment after the rehearsal. Any deleted or rewritten
history, outcome minted for a current completion, inability of the prior client
to read accepted rows, or missing current-head rollback evidence blocks the
release.

## GC-07 messaging containment

After `data/2026-09-28_gc07_regional_messaging.sql`, retain all request identities,
revisions, review snapshots, communication audiences and retry keys. Contain
affected regional writes and repair forward. An older frontend may read history
but cannot use direct table writes for regional Green RFIs/messages, or the old
answer signature for regional Green RFIs. Do not restore GC-04A/05/06 helper
definitions, expose `gc07_legacy_answer_request`, drop audience columns or merge
regional records. Preserve the database migration receipt and failed attempt.
Use the [GC-07 runbook](architecture/gc07-regional-messaging.md) for error handling,
exact rehearsal commands and outstanding hosted evidence.

## GC-06 regional proposals

After `data/2026-09-26_gc06_regional_proposals.sql`, retain proposal handoff
revisions, recipient roots, review history and every negotiation round. Do not
restore the old proposal/recipient-only index after a corrected revision has
received an approval. Contain affected writes and repair forward; a prior
frontend can display history but cannot perform regional proposal writes through
the retired direct-table path. Never reapply GC-04A/GC-05 helper definitions over
GC-06 or remove regional RLS to recover a workflow. Record the exact error,
source revision, session, artifact/revision/recipient and migration state. See
[GC-06 verification](architecture/gc06-regional-proposals.md); earlier passing
reports remain historical evidence and cannot pass this permission stage.

The September 27 GC-06 thread-order repair changes only the private append
helper's ordering. Do not delete review requests or negotiation rounds to recover
from a stale-parent error. Preserve the repaired ordering, the GC-06 wrapper and
the existing PT409 guard. If installation reports definition/ACL drift, stop and
inspect the installed helper; do not replace it with an older complete function.
