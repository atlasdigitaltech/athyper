# Saved draft revision history

## Behavior

The comparison selectors now distinguish **When editor opened**, **Latest saved**, **Working copy**, and retained **Saved revision history**. Either side can select an immutable historical graph. History reads never restore configuration, call save, or activate runtime previews. Selected snapshots remain fixed after later saves. Errors leave the prior comparison selected. Changing the source resets the comparison and its history cache.

## Storage and authority

` snapshot.entity_draft_save ` stores full, normalized persisted graphs keyed by change set and authoring lock version. This is separate from validation snapshot numbering. Saving a graph captures the previous graph (if absent) and the new persisted graph inside the graph replacement transaction, after concurrency checking. Failed saves roll back history inserts. A conflicting existing snapshot fails the transaction. Reads verify the canonical graph hash.

Tenant RLS, tenant/change-set FK, SELECT/INSERT-only application grants, and an update/delete rejection trigger protect snapshots. GET history routes require author or reviewer inspection authority, tenant scoping and noncached responses. Lifecycle-only lock increments are not represented as separate graph saves.

## Rollout

1. Apply once to Studio: `server/db/scripts/operations/upgrades/authoring/draft-save-history.sql`.
2. Deploy the backend and UI changes. The new save path requires the history table; do not deploy it before SQL.
3. On the next save, the pre-upgrade current graph and newly saved graph are captured. No older save is invented. The UI explains missing history.

Canonical definitions also live in Studio snapshot DDL. No existing database, stored draft or release was changed in this task. This is a code/schema delivery, not a live deployment.

## Validation

- Studio and platform-host type checks.
- Review UI/model/editor tests: historical comparisons, fixed baseline after saves, error preservation and unchanged working graph.
- Inspection route test includes history lists/graphs under reviewer authority and verifies denial for wrong tenant, missing permission, wrong plane and missing MFA.
- Disposable PostgreSQL check applied the operational SQL against a minimal prerequisite schema: tenant isolation, transactional rollback, and immutable update/delete guards passed. `schema-check.sql` records checks; this is not a full production-schema migration rehearsal or end-to-end repository save test.
