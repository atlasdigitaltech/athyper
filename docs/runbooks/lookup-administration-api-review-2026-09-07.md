# Lookup administration API review

The lookup service and four HTTP routes now enforce explicit request, response, ownership and version contracts. Persistence continues to use the host's injected `LookupRepository`; this change does not introduce a default database adapter or claim database-level concurrency coverage.

## Implemented behavior

| Route | Permission | Behavior |
| --- | --- | --- |
| `GET /lookups` | `control.catalog.read` | Returns a typed domain array with global and current-tenant values only. |
| `GET /lookups/{code}?version=` | `control.catalog.read` | Reads current or exact historical revision. Version must be a canonical positive decimal safe integer. A repository returning a different requested revision is treated as not found. |
| `POST /lookups/desired-state/apply` | `control.catalog.publish` | Validates global desired state and requires its target plane to match verified context; forwards the verified actor and invalidates the domain cache after success. |
| `POST /lookups/{code}/values/{valueCode}/retire` | `control.tenant_override.manage` | Retires only a value owned by the verified tenant, in an active extensible domain, with a matching positive domain revision and no known references. |

Retirement authorizes before repository reads. Tenant scope comes from verified HTTP context; caller-supplied tenant and actor fields are rejected. Global and foreign-tenant values cannot be retired through this service, including by a Studio caller. Global changes use desired-state publication. An already retired tenant value at its current revision is a no-op.

Current and historical reads pass tenant scope to the repository and defensively filter foreign values from responses. A repository must still enforce tenant scope itself; response filtering does not replace RLS. Successful retirement invalidates only the tenant/domain key. Desired-state publication invalidates the domain globally. Failed repository writes do not invalidate caches.

Desired-state validation rejects unknown fields, missing or malformed values, nonpositive/fractional/unsafe revisions, invalid domain/value codes and source-schema names, duplicate value IDs or codes, tenant-owned values, out-of-range smallint sort orders, and non-JSON metadata. Source revision and domain revision remain separate coordinates; the service does not invent an equality relationship between them. `sourceSchema` is semantic ownership metadata, not an instruction to select a database schema.

HTTP contracts include typed array/domain responses and 400/401/403/404/409/503 outcomes. Missing exact-plane repositories return 503 without cross-plane fallback. No capability flags were enabled.

## Persistence integration still required

`control.lookup_domain` and `control.lookup_value` are the existing current-state tables. They have no API revision history or desired-state receipt model. No concrete `LookupRepository` implementation exists in this repository. The host still requires an injected provider and its transactional guarantees.

Before treating these APIs as fully database-integrated, implement and verify:

1. Explicit domain revision and immutable snapshot mappings for `?version=`, including migration treatment of existing rows and tenant extension history. Define whether tenant retirement advances a tenant-specific aggregate revision or a global domain revision; the API currently treats `expectedVersion` as the returned domain revision.
2. Desired-state receipts bound to target plane, payload hash and source revision. Identical replay must return its recorded outcome; conflicting replay and stale source revisions must fail. Preserve tenant extensions when applying global state. Do not silently discard the existing tables' description, category or metadata fields that are absent from the API contract.
3. Tenant-aware reads and exact-plane writer registration. Publication must use an authorized catalog writer; tenant retirement must never acquire generic global catalog privileges. Carry the operator's verified tenant/actor context into audit transactions.
4. Atomic retirement checks for domain/value ownership, extensibility, lifecycle, expected revision and reference use, followed by the write, audit and outbox event in the same transaction. The service's reference precheck is not a lock and cannot establish race freedom.
5. A complete reference-use model covering actual consumers. Existing code-based lookup validation calls are distributed across control, master, document and plane-specific tables; an empty reference registry or a check of foreign keys alone would be insufficient. Reference creation and retirement need coordinated concurrency protection.
6. Real PostgreSQL tests for migration/history, replay conflicts, concurrent updates/reference creation, tenant isolation, audit/outbox rollback, and runtime lookup reads after retirement.

These requirements are documented on `LookupRepository`. No database adapter, schema migration or PostgreSQL lookup integration result is claimed by this service/HTTP change.

## Verification

- 71 dedicated lookup service and HTTP cases passed, including tenant filtering, historical revision selection, ownership, reference conflicts, idempotent retirement, publication validation, cache behavior, route permissions and unsafe query versions.
- Full control-admin suite: 560 passed. The opt-in database suite was skipped in this run; it does not contain lookup integration cases.
- Control-admin source/test and host TypeScript checks passed; control-admin contract tests passed.
