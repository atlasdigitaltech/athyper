# Authorization invalidation and notification three-plane DDL plan

Date: 2026-08-01

## Decision

Install both capabilities in **all three application-plane databases**:

- `athyper_platform`
- `athyper_neon`
- `athyper_mesh`

Use one common desired-state contract, but keep every database's rows and
workers plane-local. Do not replicate operational rows between databases and do
not make Neon the runtime authority for Admin or Mesh.

The physical database and `app.database_plane` identify the plane. A row must
not accept a caller-supplied plane that disagrees with that setting.

| Capability | Common DDL | Plane-local rows | Cross-plane replication |
| --- | --- | --- | --- |
| Authorization epochs | Yes, in `runtime_meta` | Yes | No |
| Authorization invalidation outbox | Yes, in `event` | Yes | No; publish a command to the target plane when required |
| Notification templates and routing | Yes, in `control` | Yes | Only governed seed/catalog publication, never operational replication |
| Notification messages, delivery, digest and push | Yes, in `event` | Yes | No |
| Provider binding and health | Yes, in `control` | Yes | No secret replication; credentials remain in the secret provider |

## Why all planes need the authorization runtime

Each plane owns a local `authz` catalog and performs local authorization
evaluation. A local catalog mutation must invalidate that plane's local caches
even when Neon is unavailable. Centralizing epochs or the outbox in Neon would:

- make Admin and Mesh authorization depend on Neon availability;
- permit stale local decisions during a cross-database outage;
- confuse ownership when the same tenant exists in more than one plane; and
- preserve the legacy combined Admin/Neon boundary after the database split.

The three current `authz/03_tables.sql` files are byte-identical. The eventual
cleanup should move that canonical catalog to `common/authz`, but the epoch and
outbox work does not need to wait for that folder cleanup.

## Authorization target model

### `runtime_meta.authorization_epoch`

Use one table for all three scopes rather than three nearly identical tables:

```text
scope_kind  = global | tenant | plane
tenant_id   nullable; required for tenant and plane scopes
plane_code  nullable; required only for plane scope
epoch       bigint, monotonically increasing and never negative
```

The coordinate rules are strict:

- `global`: `tenant_id IS NULL`, `plane_code IS NULL`; exactly one row per DB.
- `tenant`: `tenant_id IS NOT NULL`, `plane_code IS NULL`; one row per tenant.
- `plane`: `tenant_id IS NOT NULL`, `plane_code = app.database_plane`; one row
  per tenant in the local plane.

Because PostgreSQL primary keys treat nullable coordinates poorly, use a normal
UUID primary key plus three partial unique indexes:

```sql
CREATE UNIQUE INDEX authorization_epoch_global_uq
  ON runtime_meta.authorization_epoch (scope_kind)
  WHERE scope_kind = 'global';

CREATE UNIQUE INDEX authorization_epoch_tenant_uq
  ON runtime_meta.authorization_epoch (tenant_id)
  WHERE scope_kind = 'tenant';

CREATE UNIQUE INDEX authorization_epoch_plane_uq
  ON runtime_meta.authorization_epoch (tenant_id, plane_code)
  WHERE scope_kind = 'plane';
```

Add a check constraint enforcing the three coordinate shapes and a trigger that
rejects changes to `scope_kind`, `tenant_id`, and `plane_code` after creation.
The increment function should use one atomic upsert keyed by the applicable
partial-index coordinate and return the new epoch.

This retains the evaluator's three-part cache key while making ownership,
backfill, RLS, grants, and manifest inclusion one table/contract to maintain.

### `event.authorization_invalidation_outbox`

Durable, leased, append-preserving work state for local cache invalidation. The
new desired-state name should omit the migration suffix `_v2`. Preserve the
current behavior:

- immutable authority source identity and affected-ID arrays;
- effective-boundary scheduling;
- atomic epoch allocation when an item becomes due;
- `FOR UPDATE SKIP LOCKED` leasing;
- idempotent completion;
- bounded retry and dead-letter status;
- no ordinary delete path; and
- tenant RLS plus a privileged worker policy.

Use `tenant_id` in all three planes. The new Mesh foundation already uses
`master.tenant`, so the old `account_id`/`mesh_log` fork is no longer needed.

### Plane vocabulary prerequisite

DDL currently uses `athyper`, `neon`, and `mesh`, while the authorization and
notification TypeScript contracts use `admin`, `neon`, and `mesh`. Lock one
vocabulary before adding the new files. The recommended canonical vocabulary is
the database vocabulary (`athyper`, `neon`, `mesh`), with `admin` accepted only
as an API compatibility alias at the edge.

Move the reusable plane domain from `audit.plane_code_d` to
`shared.plane_code_d`; `audit` can then consume the shared domain rather than
being the owner of a platform-wide identifier.

## Authorization DDL placement

Add phase-aligned common files and reference them once in every plane manifest:

```text
common/runtime_meta/03_authorization_epoch_tables.sql
common/event/03_authorization_invalidation_tables.sql
common/runtime_meta/05_authorization_epoch_constraints.sql
common/event/05_authorization_invalidation_constraints.sql
common/runtime_meta/06_authorization_epoch_indexes.sql
common/event/06_authorization_invalidation_indexes.sql
common/event/07_authorization_invalidation_functions.sql
common/authz/08_authorization_invalidation_triggers.sql
common/event/08_authorization_invalidation_triggers.sql
common/runtime_meta/10_authorization_epoch_rls.sql
common/event/10_authorization_invalidation_rls.sql
common/runtime_meta/11_authorization_epoch_grants.sql
common/event/11_authorization_invalidation_grants.sql
```

The change-capture triggers belong with `authz`; the outbox state machine belongs
with `event`. Epoch tables are mutable cache-coordination state and therefore
belong in `runtime_meta`, not `event` or `audit`.

Update `SqlAuthorizationDecisionAuditSink` and
`AuthorizationInvalidationWorker` to use these canonical names and the unified
tenant key. They must resolve the local plane from trusted configuration, never
from an untrusted request header.

## Live authorization cutover

The 2026-08-01 live Neon inspection found:

- global epoch: `4197`;
- five tenant-scope rows and four plane-scope rows in the epoch state; and
- 12,331 outbox rows, all `pending`, due, and already epoch-applied.

The pending rows comprise 7,818 Neon-plane, 49 Admin-plane, 4,197 global, and
267 tenant-wide invalidations. Do not bulk-copy that backlog into each new
database.

Cut over as follows:

1. Stop authorization catalog writes and start an observation window.
2. Run the existing invalidation worker until the old due backlog is empty. If
   it cannot be drained, record the backlog receipt and supersede it with one
   cutover-global invalidation per destination database.
3. Copy the final global-scope row to both the new Athyper and Neon databases.
4. Copy tenant- and plane-scope rows to each destination containing that tenant.
5. Route the legacy `plane_code = 'neon'` baseline to Neon and
   `plane_code = 'admin'` to Athyper. Convert `admin` to `athyper` at this
   boundary.
6. Initialize Mesh only from the live Mesh database's own counters and outbox;
   never copy Neon authorization runtime rows into Mesh.
7. Start each destination with an empty process/distributed cache, emit one
   destination-local global invalidation, and verify monotonic epoch reads.
8. Enable local change capture, then reopen catalog writes.

The outbox is delivery state, not historical evidence. Preserve a migration
receipt in `audit`, but do not preserve completed/superseded work rows merely as
history.

## Notification ownership

The notification capability should also be installed in all three planes. All
three products need local in-app notifications, and Admin/Mesh must not become
dependent on Neon to deliver security, collaboration, workflow, or operational
messages.

The **schema is common; the seed catalog is not entirely common**:

- Common seeds: collaboration mentions and truly generic workflow/SLA messages.
- Neon seeds: purchase requisition, purchase invoice, payment entry, receipt,
  service sheet, delivery note, and purchase-order-confirmation messages.
- Athyper seeds: platform/security/support events approved for Admin.
- Mesh seeds: network, onboarding, catalog-publication, and relationship events
  approved for Mesh.
- Tenant overrides remain only in the tenant's local plane database.

The live Neon database currently has 24 active platform templates and 12 active
platform routing rules. All are `tenant_id IS NULL`; most document lifecycle
rows are Neon-specific and must move to the Neon reference-seed overlay, not the
common seed.

## Notification table disposition

| Legacy table | Target | Disposition |
| --- | --- | --- |
| `control.notification_template` | same name in common `control` | Retain and redesign against the canonical message model |
| `control.notification_routing_rule` | same name in common `control` | Retain in all planes; tenant/global rows are plane-local |
| `control.notification_provider` | same name in common `control` | Retain as a non-secret provider binding and local health record |
| `event.notification_delivery_claim` | `event.notification_delivery` | Merge; do not retain a second claim table |
| `event.digest_staging` | `event.notification_digest_item` | Rename and retain only if digest delivery remains supported |
| `event.push_subscription` | same name in common `event` | Retain in all planes; remove redundant `plane_key` |

### Provider security

Do not migrate `notification_provider.config` as a secret-bearing JSON object.
The new table should store `adapter_key`, non-secret delivery metadata,
`credential_ref`, enablement/priority, rate-limit policy, and local health
telemetry. API keys and tokens stay in the platform secret provider.

Provider rows are environment- and plane-specific deployment configuration.
They are not reference data to replicate across databases.

### Delivery claiming and idempotency

The common `event.notification_delivery` already has `claimed_at` and
`claimed_by`; use it as the leased work row. Add the fields needed by the current
worker contract, including a tenant-scoped `idempotency_key`, lease expiry,
bounded attempts, provider identity, and terminal outcome timestamps.

Claim with one atomic `UPDATE ... FOR UPDATE SKIP LOCKED ... RETURNING` or an
equivalent security-definer function. A unique tenant/idempotency coordinate
prevents concurrent duplicate dispatch. This makes
`event.notification_delivery_claim` redundant.

### Current common-DDL/runtime incompatibility

The existing common notification tables cannot support the current worker
unchanged. The worker expects fields such as `plane_key`, `event_id`,
`event_code`, `template_key`, `template_version`, `channels`, `rule_id`,
`recipient_count`, `idempotency_key`, `max_attempts`, and `message_id`; several
are missing or renamed in the common tables. It also uses `planning`,
`partially_sent`, and `bounced`, which do not all exist in the current common
status domains.

Resolve this before adding the missing tables. Prefer adapting the worker to a
clean common message/delivery model and deriving the plane from the database.
Do not copy the entire legacy notification schema into the new layer merely to
avoid the runtime change.

## Notification DDL placement

Use common phase-aligned files:

```text
common/control/02_notification_domains.sql
common/event/02_notification_runtime_domains.sql
common/control/03_notification_configuration_tables.sql
common/event/03_notification_runtime_tables.sql
common/control/05_notification_configuration_constraints.sql
common/event/05_notification_runtime_constraints.sql
common/control/06_notification_configuration_indexes.sql
common/event/06_notification_runtime_indexes.sql
common/event/07_notification_runtime_functions.sql
common/control/08_notification_configuration_triggers.sql
common/event/08_notification_runtime_triggers.sql
common/control/10_notification_configuration_rls.sql
common/event/10_notification_runtime_rls.sql
common/control/11_notification_configuration_grants.sql
common/event/11_notification_runtime_grants.sql
```

The current operational-governance notification definitions should be moved or
reconciled into this slice rather than loaded twice.

Seed placement:

```text
common/control/12_notification_reference_seed.sql
planes/athyper/control/12_notification_reference_seed.sql
planes/neon/control/12_notification_reference_seed.sql
planes/mesh/control/12_notification_reference_seed.sql
```

## Notification cutover

The live Neon database currently has no notification messages, deliveries,
claims, digest items, push subscriptions, or provider rows. Therefore:

1. Migrate the 24 templates and 12 routing rules through reviewed seed files,
   splitting common and Neon-only event types.
2. Do not create data migrations for the six empty operational tables.
3. Provision non-secret provider bindings per destination environment after the
   DDL build.
4. Deploy the updated worker against the new common schema before enabling
   notification producers.
5. Register new push subscriptions per application/plane; do not copy browser or
   device subscriptions across products.
6. Validate one in-app and one external-channel delivery per plane, including
   duplicate suppression, retry, lease recovery, and tenant RLS.

## Verification gates

The migration is complete only when:

- each plane's authorization evaluator reads only its local epoch rows;
- each plane's invalidation worker consumes only its local outbox;
- no `mesh_log` authorization fallback or Neon fallback remains;
- `admin` is absent from persisted plane-code constraints;
- the old Neon invalidation backlog is drained or formally superseded;
- notification workers compile and run against the new message/delivery schema;
- provider secrets are absent from database rows and DDL seeds;
- common and plane-specific notification seeds have no duplicate stable keys;
- all three manifests include each common DDL file exactly once; and
- fresh-database and RLS/worker concurrency tests pass for all three planes.
