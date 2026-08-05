# Supabase Rollback

Database migrations in this repository are forward-only once live workflow records exist. Roll back the application first; preserve additive schema and review history unless a database owner has verified that the migration never accepted a production write.

## Team-Neutral Artifact Review Rollback

For `data/2026-08-05_team_neutral_artifact_review.sql`:

1. Stop new deployments and prevent White Cell review activity for the affected session.
2. Export `actions`, `requests`, `artifact_workflow_reviews`, `action_logs`, and linked `pli_adjudications` for the affected session.
3. Deploy the prior frontend commit. The retained `operator_return_action_to_blue` wrapper keeps the historical Blue-only client callable.
4. Leave the new nullable metadata columns, `artifact_workflow_reviews` rows, expanded workflow constraints, and `operator_review_artifact` function in place. Older clients ignore these additive fields. Do not translate `returned_to_team` back to `returned_to_blue`, mint outcomes for `completed` rows, decrement revisions, or delete review history.
5. Confirm the prior client can read actions and RFIs. Treat Red/SO/RFI artifacts already returned by the new RPC as operator-managed blockers until the forward fix is deployed; do not relabel them to bypass old UI assumptions.

Safe rollback pass conditions:

- the prior frontend is serving successfully
- legacy `status` values remain `draft`, `submitted`, `adjudicated`, or `abandoned` for actions and `pending`, `answered`, or `withdrawn` for RFIs
- historical `returned_to_blue` and new `returned_to_team` labels are unchanged
- `artifact_workflow_reviews` row counts and snapshots are unchanged
- no completed artifact has gained an outcome

## Pre-Write Development Teardown Only

If and only if the migration was applied to an isolated development project and this query returns zero rows:

```sql
select count(*) as workflow_review_count
from public.artifact_workflow_reviews;
```

a database owner may restore the prior function definitions by reapplying `data/2026-07-29_return_action_to_blue.sql` and then remove the unused additive objects in a separately reviewed teardown migration. Do not perform that teardown in a live or shared environment: dropping columns or the review table destroys provenance and is not an operational rollback.

After any rollback, use the verification queries in `docs/supabase-setup.md`. Record the frontend commit, database migration state, export location, operator, UTC time, and affected session IDs in the incident record.
