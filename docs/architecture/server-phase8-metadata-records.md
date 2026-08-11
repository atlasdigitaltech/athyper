# Phase 8: Metadata and Records recovery

## Authority and runtime boundary

The current DDL is authoritative; the backup TypeScript is behavior reference only.

- Athyper owns metadata authoring in `metadata.*`: entities, fields, operations, lifecycle bindings, change sets, releases, and runtime profiles.
- Publication compiles the stable `athyper.entity-runtime-descriptor/1.0` document and projects it to each eligible plane.
- Neon and Mesh own their local verified projection in `runtime_meta.entity_contract` and `runtime_meta.entity_descriptor`.
- Runtime requests resolve the active local projection. They never make a synchronous call to Athyper.
- `runtime_meta.release_activation_head` selects the activated release. A tenant-specific contract overrides a system contract.

Generic Records is deliberately limited to Neon and Mesh. Athyper administrative authoring is a separate capability and must not pass through the descriptor-driven runtime record route.

## Responsibility map

| Concern | New owner | Previous ambiguous name |
| --- | --- | --- |
| Active descriptor resolution and cache | Platform Metadata | metadata/kernel lookup |
| Read validation, authorization, and orchestration | Records query service | query kernel |
| Create, patch, and delete orchestration | Records mutation service | mutation kernel |
| State transitions | Records lifecycle service | lifecycle kernel |
| Dynamic DDL-backed persistence | Records Kysely repository | generic kernel data gateway |
| Neon/Mesh RLS transaction selection | Host composition plus database adapters | request/kernel transaction context |

No `kernel` compatibility export is introduced.

## Runtime execution

1. IAM verifies the bearer token and stores an immutable verified request context.
2. Records asks Metadata for the active plane/tenant/entity descriptor.
3. Metadata uses its bounded cache, then reads the local `runtime_meta` projection inside a tenant transaction.
4. Records authorizes the descriptor operation's canonical permission code.
5. Query fields and mutation fields are checked against descriptor capabilities before SQL is built.
6. The host selects the Neon or Mesh tenant transaction; database RLS receives tenant and principal context.
7. The repository applies tenant, identity, optimistic-version, soft-delete, filter, sort, search, cursor, and count rules using descriptor-validated identifiers and parameterized values.
8. A mutation appends `event.outbox` and records Audit before the transaction commits. An outbox failure rolls back the record write.

## Characterized behavior

| Area | Phase 8 behavior |
| --- | --- |
| Routes | List, get, create, patch, delete, and lifecycle transition under `/api/records/:entityCode` |
| Query | Descriptor-limited filters/sorts/search, limit 1–100, opaque cursor, optional exact count |
| Mutation | Strict descriptor field validation; unknown/non-writable fields rejected |
| Concurrency | `If-Match` required when the descriptor declares a version field; conflicts are explicit |
| Lifecycle | Published transition, source state, permission, and optimistic version are enforced |
| Caching | Only compiled metadata descriptors are cached; negative entries are bounded by TTL; record result caching is intentionally absent |
| Transactions | Record write and outbox append share the plane tenant transaction; failures roll back |
| Tenancy | Tenant predicate is added by the repository and reinforced by Neon/Mesh RLS transaction context |

## Package boundaries

- `@athyper/server-contract-metadata` owns descriptor wire types and Metadata ports.
- `@athyper/server-contract-records` owns record commands, results, repository, lifecycle, and transaction ports.
- `@athyper/server-platform-metadata` owns descriptor parsing, caching, and local projection reads.
- `@athyper/server-service-records` owns query, mutation, lifecycle, repository, and HTTP route segments.
- `@athyper/server-platform-host` is the only package that selects concrete databases and registers routes.

Metadata and Records do not import the host or concrete database adapters. Contract packages contain no framework, network, process, or concrete database implementation.

## Verification and remaining production work

The package/API tests cover descriptor compatibility, parsing and cache behavior. Records tests cover read/write/lifecycle behavior, descriptor validation, optimistic concurrency, durable side effects, and rollback. The host test covers an authenticated vertical request through all restored route families. Database adapter tests characterize tenant transaction context for both runtime planes.

Before a production release, add live PostgreSQL integration runs against freshly provisioned Neon and Mesh schemas, and implement the Athyper descriptor compiler/publication workflow that produces the versioned descriptor document. Those are deployment integration tasks; runtime code does not fall back to legacy metadata.
