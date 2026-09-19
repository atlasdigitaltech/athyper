Review of the ten `/api/collab` mutation routes, completed 2026-09-06 against the local workspace. The review followed route parsing, permission checks, transactions, both repository implementations, rich-text projection, host wiring, and the applicable schema, triggers, indexes, and row policies.

The following findings were fixed:

| Severity | Affected behavior | Finding and correction |
| --- | --- | --- |
| High | Create and replies | The request idempotency key only reached the unique outbox key. Retrying a successful create could fail with a database uniqueness error rather than replay the result. Creation now uses the existing transactional command-execution receipts, fingerprints the command and actor, replays the original result, rejects conflicting reuse, and skips repeated audit/outbox/fanout effects. Host composition supplies the receipt store. |
| High | Replies | Parent `SELECT FOR UPDATE` applied the author-only update policy, potentially hiding another author's otherwise readable parent. Parent reads now use ordinary SELECT, with tenant, context, entity, and deletion predicates. Coordinates and thread depth are immutable in the database; foreign keys and triggers remain authoritative. Both UPDATE and SHARE row locks invoke update policies, so a shared lock would not fix this. See [PostgreSQL policy documentation](https://www.postgresql.org/docs/current/sql-createpolicy.html). |
| High | Create/edit with mentions | Arbitrary text resource IDs were sent to the UUID outbox entity column, causing valid mentioned comments to fail. Mention envelopes now identify the comment UUID and retain the resource coordinates in their payload. |
| High | Repeated edits with mentions | All edits mentioning a given principal reused one unique event key, making later edits fail. Each committed mention event now gets its own outbox identity. |
| Medium | All route input | Optional values of the wrong type silently became absent, including `expectedUpdatedAt`, which could bypass optimistic conflict checking. Supplied optional strings must now be nonempty strings. Malformed content objects and draft parent UUIDs are rejected before persistence. Internal TypeErrors are forwarded as server errors rather than being mislabeled as client mistakes. |
| Medium | PATCH | Equivalent timezone representations caused false conflicts; the memory adapter also rejected the creation timestamp for an initial edit. Timestamp normalization and the creation-time fallback now agree across adapters. |
| Medium | Mark-all-read | Invalid dates reached SQL, and future dates could advance the monotonic cursor far enough to hide future unread comments. Timestamps are validated, future times are capped at server time, and memory cursors no longer move backward. |
| Medium | Replies, drafts, flags | Missing/mismatched parents, excess nesting, and missing flag targets produced generic persistence errors. They now produce controlled 404/422 errors. Drafts validate parent context before upsert. |
| Medium | Create, drafts, reactions | Invalid or inactive lookup codes reached trigger exceptions. The SQL adapter now validates the applicable active lookup values; the service validates context/intent syntax. Flag reason syntax now accepts the dot/hyphen characters allowed by its database constraint. |
| Medium | Comment attachments | Duplicate attachments could hit the link uniqueness constraint; missing or inactive attachments were silently ignored. Link insertion deduplicates IDs/series and rejects unresolved active attachments with 422, rolling back the mutation. |
| Medium | Rich text | Null nodes/marks and non-array marks could throw incidental TypeErrors. They now produce explicit rich-text validation errors. Conversion to plain text clears all rich projections, including schema metadata, in both service preparation and memory persistence. |
| Medium | Repository test fidelity | Memory reactions and flags accepted absent/cross-tenant targets, repeated flags created extra records, private parent visibility was not enforced, and concurrent transactions could overwrite each other's state. These behaviors now follow the applicable SQL behavior; transactions and command receipts commit or roll back together. |
| Low | Fanout | A synchronous publish exception after commit could turn a successful write into an error response. Both synchronous and asynchronous publish failures are now isolated from the committed result. |

All ten HTTP routes have dispatch tests. Service coverage includes denied permissions for every mutation operation, edit/delete ownership, tenant isolation, reply depth, drafts through the HTTP boundary, timestamp validation, rich-text failures, and transactional idempotency replay/conflict/rollback. SQL tests compile and exercise the adapter against controlled results, including parent query policies, missing flag/draft targets, and inactive lookup codes.

Validation completed:

- Collaboration: **47 tests passed**; production and test TypeScript checks passed.
- Shared records service: **84 tests passed, 1 skipped**; production and test TypeScript checks passed. Its receipt adapter now supports a generic result type while preserving its previous default.
- Platform host: TypeScript check passed with the collaboration receipt store wired in.
- Changed-file whitespace checks passed.

No live PostgreSQL/RLS integration or deployed API smoke test was run. SQL adapter tests do not prove database concurrency or role-policy behavior; those remain deployment validation limits. The permission model remains the existing operation permission checks, tenant scoping, author ownership, and database visibility policies. This review does not certify entity-specific access rules that are not represented by the collaboration service contract.

No schema migration is required: idempotency uses the existing `event.command_execution` table. Previously successful requests have no new-format command receipt, so retrying their old keys after rollout cannot replay their historical result. New requests are protected once this version is running. Idempotency keys follow the existing platform contract (16–128 allowed characters); conflicting reuse returns 409.
