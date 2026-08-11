# Supabase Rollback

Database migrations in this repository are forward-only once live workflow records exist. Roll back the application first; preserve additive schema and review history unless a database owner has verified that the migration never accepted a production write.

The sole authoritative forward migration order is the 33-step dated ledger in
`docs/supabase-setup.md`. There is no reverse SQL order and the deprecated
`data/COMPLETE_SCHEMA.sql`, `data/updated_supabase_schema.sql`, and
`data/updated_supabase_migration.sql` snapshots are never rollback inputs. A
rollback means frontend-first containment followed by a forward fix; it does
not mean replaying historical schemas or dropping additive workflow objects.

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

For `data/2026-08-11_requests_responded_by_schema_repair.sql`, keep the nullable
`requests.responded_by` column in place. Older clients ignore it, while the
current Facilitator RFI guard requires the row field even for unanswered
inserts. Do not drop the column or remove the guard as rollback; contain with
the prior frontend and use a forward fix if responder attribution behavior is
incorrect.

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
