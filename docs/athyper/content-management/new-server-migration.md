# New server CMS migration

The three-plane CMS implementation is owned by `@athyper/server-service-content` and
`@athyper/server-contract-content`. New callers must use `/api/content/*`; the retired
legacy `server/framework/runtime/services/content` route is not a fallback.

Implemented boundaries:

- tenant-safe browser and current-version reads;
- immutable versions, restore-as-new-version, optimistic row versions and lifecycle transitions;
- additive record ACL with explicit deny precedence and centralized permission checks;
- concurrency-safe per-kind item reservations, usage reconciliation and reservation expiry ports;
- Meilisearch projection and ACL-filtered CMS/document search;
- platform-host composition.

Operational rollout requires applying the document/snapshot DDL for each plane, seeding
the `content.*` and `documents.read` permissions, running quota reconciliation, and then
backfilling content search documents before enabling the routes for a tenant.
