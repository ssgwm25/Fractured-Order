# Supabase Rollback

Database migrations in this repository are forward-only once live workflow records exist. Roll back the application first; preserve additive schema and review history unless a database owner has verified that the migration never accepted a production write.

The sole authoritative forward migration order is the 45-step dated ledger in
`docs/supabase-setup.md`. There is no reverse SQL order and the deprecated
`data/COMPLETE_SCHEMA.sql`, `data/updated_supabase_schema.sql`, and
`data/updated_supabase_migration.sql` snapshots are never rollback inputs. A
rollback means frontend-first containment followed by a forward fix; it does
not mean replaying historical schemas or dropping additive workflow objects.

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
