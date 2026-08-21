# Base Framework Architecture Comparison: Frappe vs Athyper

**Compared sources**

- Frappe: `D:\Products\frappe-develop\frappe-develop` (`frappe.__version__ = 17.0.0-dev`)
- Athyper: `D:\Products\athyper` (Git `c92374fb` plus the current, substantially modified working tree)
- Assessment date: 2026-07-14

## Executive conclusion

Frappe and Athyper are both metadata-driven enterprise application frameworks, but their centers of gravity differ.

- **Frappe is a cohesive metadata-driven application kernel.** `DocType`, `Meta`, `Document`, permissions, workflow, files, generic APIs, and UI conventions form one mature execution model. Its chief advantage is completeness and consistency: once a DocType exists, generic create/read/update/delete, validation hooks, child records, permissions, workflow, attachments, caching, and form behavior are immediately available.
- **Athyper is a security- and governance-oriented modular platform.** Identity, browser sessions, IAM, metadata compilation, generic record access, workflow, attachments, object storage, audit, jobs, and three product planes are intentionally separated. It is stronger in tenant isolation, external IAM, scoped authorization, optimistic concurrency, idempotency, attachment quarantine, versioned metadata, and explicit transactional lifecycle orchestration.
- **Athyper does not yet have Frappe's single, uniformly applied document kernel.** The generic records service is metadata-aware, but it also contains many entity-specific paths and parallel runtime generations. This makes its architecture more sophisticated but less mechanically uniform. The main framework risk is not missing capability; it is duplicated execution paths and contract drift.

The practical recommendation is **not to reproduce Frappe's monolith**. Athyper should preserve its external IAM, PostgreSQL/RLS, object storage, eventing, and modular domain services, while borrowing Frappe's strongest idea: one small, authoritative record/document lifecycle kernel through which every generic and domain-specific mutation passes.

## Scope and evidence caveat

This is a code-level architecture comparison, not a feature checklist. It traces the following concerns:

1. login and authentication;
2. session management;
3. IAM and authorization;
4. cache and process memory;
5. document attachments;
6. metadata-driven entities;
7. record creation, editing, deletion, and lifecycle transitions.

The Athyper repository had a very large dirty working tree at assessment time, including modified and untracked framework files. Therefore this report describes the **filesystem snapshot inspected**, not only commit `c92374fb`. The extracted Frappe directory has no Git metadata, so its exact source commit cannot be identified; its declared version is `17.0.0-dev`.

## 1. Base architecture

### Frappe

```text
Browser / REST client
        |
Werkzeug WSGI request application
        |
site resolution -> DB connection -> HTTPRequest -> auth/session/CSRF
        |
RPC, REST v1/v2, website, Desk handlers
        |
DocType metadata -> controller class -> Document lifecycle
        |
MariaDB/PostgreSQL + Redis + filesystem/object-store hooks + RQ/realtime
```

The request application resolves a site from the host/header, initializes site-local configuration, connects its database, loads/resumes the session, validates CSRF, authenticates the request, then dispatches to API or web handlers ([`frappe/app.py`](../../../frappe-develop/frappe-develop/frappe/app.py), [`frappe/auth.py`](../../../frappe-develop/frappe-develop/frappe/auth.py)). A Frappe site is the primary tenancy and configuration boundary; cache keys are prefixed by the site's database name.

Frappe's architectural core is a tight three-part loop:

```text
DocType + DocField + DocPerm metadata
             -> Meta runtime
             -> Document object and controller hooks
             -> tab<DocType> parent table + child tables
```

The metadata is not just UI description. It controls storage shape, field behavior, permissions, naming, child composition, validation, submission semantics, search, and form rendering.

### Athyper

```text
Three Next.js planes: Neon / Mesh / Admin
        |
per-plane BFF: OIDC/PKCE, secure session cookie, relay headers
        |
shared Express API runtime
        |
request context + JWT checks + effective permission context
        |
metadata / records / workflow / documents / domain services
        |
PostgreSQL schemas + RLS | Redis | MinIO/S3 | BullMQ | Keycloak
```

Athyper is a TypeScript monorepo with three user-facing planes, a shared Express server, explicit adapters, independently packaged services, and a schema-first PostgreSQL model ([`README.md`](../../README.md), [`server/db/ddl/SCHEMA_MAP.md`](../../server/db/ddl/SCHEMA_MAP.md)).

Its entity engine separates:

- physical DDL in domain schemas;
- entity and field registration in `control`;
- effective, versioned metadata compilation in `snapshot`;
- generic reads/mutations in the records service;
- business operations in domain services/registries;
- lifecycle/workflow definitions and runtime instances;
- presentation descriptors consumed by Next.js runtimes.

This is closer to a **control plane + execution plane** architecture than Frappe's Active Record kernel.

## 2. Comparative matrix

| Concern | Frappe | Athyper | Assessment |
|---|---|---|---|
| Deployment shape | Python modular monolith, WSGI workers, RQ, realtime | TypeScript monorepo, three Next.js BFFs, Express API, BullMQ workers | Athyper has clearer trust/service boundaries; Frappe is operationally simpler |
| Tenant boundary | Site/database selected from host | Shared PostgreSQL with tenant UUID, request context, GUCs, RLS; Mesh has separate schemas | Athyper is stronger for shared multi-tenancy; Frappe has simpler blast-radius isolation per site |
| Identity provider | Built-in users/password/2FA plus OAuth/LDAP/API keys/hooks | Keycloak OIDC authorization-code + PKCE; realm and plane separation | Athyper is stronger for enterprise federation and centralized revocation |
| Browser session | Opaque `sid`; Redis cache plus SQL `Sessions` fallback | Opaque per-plane SID; Redis session record containing tokens/context, rotation locks, KC reverse index | Athyper is more explicit and security-rich; Redis is more critical to availability |
| Authorization | DocType roles, permission levels, owner, user permissions, sharing, controller hooks | Principal/persona/group/role/grant/deny, plan gate, company scope, plane resolver, RLS, decision audit | Athyper is more expressive but substantially more complex |
| Metadata | Live DocType documents, customized by Custom Field/Property Setter | Versioned entity/field/control contracts compiled into snapshot descriptors | Athyper has stronger governance/versioning; Frappe has tighter runtime unity |
| CRUD kernel | One `Document` lifecycle for nearly all DocTypes | Generic records service plus write facades, operation registries, domain handlers, child registries | Frappe is more uniform; Athyper is more explicit but fragmented |
| Concurrency | Modified timestamp/latest-document checks and optional locks | `row_version`, `If-Match`, leases, idempotency records, row locks | Athyper is stronger |
| Lifecycle | Universal draft/submitted/cancelled `docstatus`, hooks; optional workflows | Arbitrary metadata lifecycles, operation codes, action rules, lifecycle instance, transactional hooks | Athyper is richer; Frappe's base invariant is simpler and more universal |
| Attachments | `File` DocType linked by doctype/name/field; local public/private files by default | S3/MinIO bytes, attachment/link metadata, quarantine/scan/status/version/audit | Athyper is stronger for governed content |
| Cache | Request-local + Redis + process-local client tracking invalidation | Multiple Redis domains: BFF sessions, effective sessions, descriptors, lists, jobs; PG notify invalidation | Athyper is more purpose-specific; Frappe is more unified |
| Extensibility | Controller inheritance, hooks, Server Scripts, custom fields, overrides | Service interfaces, registries, compiled descriptors, adapters, domain handlers | Athyper gives stronger boundaries; Frappe gives faster end-to-end extension |

## 3. Login and authentication

### Frappe flow

```text
POST /api/method/login
 -> LoginManager.login
 -> password check / disabled-user and restriction checks
 -> optional 2FA
 -> Session.start
 -> SQL Sessions row + Redis session hash
 -> sid cookie and boot cache
```

Key properties:

- Login is part of the same framework process and user model as the application.
- `HTTPRequest` loads cookies, resumes/creates a session, chooses language, and checks CSRF for unsafe methods.
- Non-cookie authentication can be supplied through OAuth bearer tokens, API key/secret, and auth hooks (`validate_auth`).
- User status, IP restrictions, login hours, password reset, and optional 2FA are integrated in `LoginManager`.

This is cohesive and easy for an application developer, but the framework itself owns password authentication and identity state.

### Athyper flow

```text
GET /api/auth/login
 -> create PKCE verifier/challenge + state in Redis
 -> redirect to plane/realm Keycloak client
 -> callback validates state and exchanges code
 -> validates issuer, client/plane, required actions, org/context
 -> creates Redis session and secure plane cookie
 -> BFF relays bearer token + verified context to Express API
```

Key properties:

- Plane routes are thin factories over the shared BFF auth package, e.g. [`apps/neon/app/api/auth/login/route.ts`](../../apps/neon/app/api/auth/login/route.ts) and [`callback/route.ts`](../../apps/neon/app/api/auth/callback/route.ts).
- PKCE state, session keys, rotation locks, reverse Keycloak-session indexes, timeouts, and cookie names are centralized in [`session-plane`](../../packages/shared/platform-auth/session-plane/src/index.ts).
- API enforcement cross-checks token `iss`, `azp`, tenant claims, request plane, and canonical tenant. It separately checks the `${plane}-web` `AUTHORIZED` role and Keycloak required actions ([`server/src/auth/auth-pipeline.ts`](../../server/src/auth/auth-pipeline.ts)).
- Support/admin traffic can use the `platform-control` realm and a separate Redis namespace.

### Finding

Athyper's identity architecture is the better fit for a multi-plane enterprise platform. Its risk is **parallel auth enforcement surfaces**: BFF session checks, the server auth pipeline, platform-context middleware, route-local `verifyBearer`, and attachment-specific context resolution must remain behaviorally identical. The code comments acknowledge past duplication. This should be governed with shared contract tests and one mandatory request-context gateway.

## 4. Session architecture

### Frappe

The opaque `sid` is read from the request or cookie. New non-guest sessions are persisted both in the SQL `Sessions` table and Redis (`session` hash). Resume checks Redis first and falls back to SQL; expired or missing sessions become Guest ([`frappe/sessions.py`](../../../frappe-develop/frappe-develop/frappe/sessions.py)). Session writes are throttled, while SQL provides a recovery path and administrative visibility.

Strengths:

- graceful Redis-miss fallback to SQL;
- simple cookie/session mental model;
- CSRF is bound to session state;
- site prefix prevents cross-site cache collision.

Limitations:

- session identity is framework-user-centric rather than realm/tenant/context-centric;
- the default model is not designed around access-token rotation or IdP back-channel logout;
- authorization context is recomputed through framework caches rather than stamped as an explicit, versioned context.

### Athyper

Athyper has two related session layers:

1. the BFF browser session (`sess:{namespace}:{sid}`), containing IdP token/session information and selected plane context;
2. the API IAM effective-session cache (`session:{sub}:{tenant}:{entity}:{workbench}`), containing persona, modules, permissions, scopes, and delegation information.

The BFF layer provides absolute/idle timeouts, proactive refresh, a distributed refresh lock, SID rotation grace, per-user indexes, and a Keycloak-session reverse index for coordinated logout. The IAM service protects cached access with an `auth_epoch` check so security mutations can invalidate a still-live entry ([`session.service.ts`](../../server/packages/services/iam/session/session.service.ts)).

Strengths:

- strong fixation and rotation controls;
- coordinated Keycloak logout/revocation;
- explicit per-plane and per-realm separation;
- security mutation invalidation via reverse indexes and auth epochs.

Risks:

- browser sessions have no SQL fallback and depend on Redis availability;
- two session concepts can confuse ownership and invalidation responsibilities;
- both `node-redis` and `ioredis` clients are used in the platform, increasing connection, retry, ACL, and telemetry complexity.

## 5. IAM and authorization

### Frappe's permission model

Frappe evaluates permissions at the DocType and document levels:

```text
role permissions (DocPerm / Custom DocPerm)
 + field permission levels
 + owner rules
 + User Permission link constraints
 + explicit document shares
 + controller/hook permission conditions
 -> read/write/create/submit/cancel/delete/etc.
```

The `Document` object calls the same permission service before inserts, saves, submits, cancels, and deletes. List queries also inject permission conditions. `Administrator` bypasses checks ([`frappe/permissions.py`](../../../frappe-develop/frappe-develop/frappe/permissions.py)).

The model is deeply integrated and approachable, but application enforcement is the main barrier; it is not primarily a database-RLS architecture.

### Athyper's permission model

The effective decision combines:

```text
verified Keycloak subject
 -> application principal / persona
 -> group and role inheritance
 -> subscription-plan permission gate
 -> direct/group/role allow grants
 -> principal deny grants (deny wins)
 -> visibility and company-code scope
 -> entity policy + declared entity operation
 -> record/lifecycle-specific gates
 -> PostgreSQL RLS tenant boundary
```

The canonical single-permission service resolves the active permission, calls database functions, resolves visibility/company scope, and writes a decision log ([`permission.service.ts`](../../server/packages/services/iam/permission/permission.service.ts)). The records mutation guard additionally requires an active entity policy and a matching enabled entity operation before permitting a mutation ([`entity-mutation-guard.ts`](../../server/packages/services/records/routes/entity-mutation-guard.ts)). Plane-specific resolvers produce an `EffectivePermissionContext` once per request.

### Finding

Athyper's IAM design is more capable and defensible for regulated multi-tenant use. Its main architectural issue is **enforcement discoverability**: a developer must understand token checks, effective context, operation metadata, permission evaluation, scope enforcement, and RLS. Every route must use common guards; direct SQL paths are otherwise easy to get subtly wrong. A single route policy wrapper and automated enforcement lint/test should be treated as framework-critical.

## 6. Cache and in-memory state

### Frappe

Frappe exposes one Redis wrapper with site-prefixed keys and request-local caching. A newer long-lived client cache stores hot values in worker memory and uses Redis client-tracking invalidations, with a Redis-only fallback when tracking is unavailable ([`redis_wrapper.py`](../../../frappe-develop/frappe-develop/frappe/utils/redis_wrapper.py)). Metadata and selected documents are cached through this layer. Document post-save hooks clear their document cache.

Characteristics:

- L1 request/process memory plus L2 Redis;
- cache-aside generator API;
- site namespace built into the adapter;
- metadata, permissions, sessions, workflows, settings, boot data, and documents share familiar primitives.

### Athyper

Athyper uses Redis for several independently designed domains:

- BFF browser sessions, PKCE, refresh locks, SID rotation, logout indexes;
- IAM effective-session/bootstrap caches;
- metadata descriptors and compiled runtime material;
- permission fingerprints/auth epochs;
- entity list pages/counts;
- BullMQ and operational state.

Entity list cache keys include tenant, entity, scope, security, descriptor, filters, sort, search, page, and a version counter. Mutation invalidation increments the version rather than scanning pages ([`list-cache.ts`](../../server/packages/services/records/cache/list-cache.ts)). Descriptor invalidation uses PostgreSQL `NOTIFY`, Redis pattern deletion, a runtime generation counter, and a polling fallback recorded in an invalidation log ([`listener.ts`](../../server/src/services/cache-invalidation/listener.ts)).

### Finding

Athyper's cache keys correctly model security and descriptor variability, which is essential. Improvements should focus on operational simplicity:

1. standardize the Redis client and retry/telemetry policy;
2. prefer generation/version keys over `SCAN` + pattern deletion;
3. publish a cache ownership catalog defining source of truth, TTL, invalidation event, and degraded behavior;
4. explicitly classify Redis dependencies as fail-open, fail-closed, or availability-critical.

## 7. Document attachments

### Frappe

Attachments are `File` documents. A row can link to `attached_to_doctype`, `attached_to_name`, and optionally `attached_to_field`. The `File` controller applies standard Document hooks, validates attachment references and limits, manages public/private access, deduplicates content, and writes local files under site public/private paths by default ([`file.py`](../../../frappe-develop/frappe-develop/frappe/core/doctype/file/file.py)). Storage behavior can be extended through hooks/remote URLs.

Advantages:

- attachment behavior is automatically available to every DocType;
- it reuses the same permissions, hooks, comments, and delete lifecycle;
- attachment-to-field and general attachment concepts are unified.

Limitations relative to Athyper:

- the core abstraction is a file record rather than a governed content/version/link aggregate;
- local filesystem semantics are prominent;
- quarantine, scanning, immutable versions, legal/governance states, and object-store compensation are not first-class in the basic kernel.

### Athyper

Athyper stores bytes in S3/MinIO and metadata/linkage in PostgreSQL. `master.attachment` owns blob metadata and version/status; `master.entity_document_link` owns attachment-to-entity relationships. Upload streams hash bytes inline, write object storage first, then insert both metadata and link in a DB transaction; DB failure triggers compensating object deletion ([`attachment.service.ts`](../../server/packages/services/documents/services/attachment.service.ts)).

The status model includes `uploaded`, `quarantined`, `active`, `failed`, `orphaned`, `deleted`, and `archived`. Downloads are blocked until active, and workers perform extraction/scanning promotion. Authorization resolves the verified tenant/principal and checks entity/record attachment operations before list/upload/download/delete ([`attachments.route.ts`](../../server/packages/services/documents/routes/attachments.route.ts)).

### Finding

Athyper has the stronger production attachment architecture. Two alignment issues remain:

- the generic records route currently exposes an attachment sub-resource stub while the documents service owns the real API; the compiled descriptor should point directly to one canonical attachment contract;
- documentation and DDL naming have drifted across older `document.content_*` descriptions and the implemented `master.attachment` / `master.entity_document_link` model. One canonical content architecture document is needed.

## 8. Metadata-driven entity model

### Frappe: live metadata is the framework

`frappe.get_meta()` constructs a `Meta` document from `DocType`, combines custom fields, property setters, custom permissions, links, and actions, builds field caches, and caches the result ([`frappe/model/meta.py`](../../../frappe-develop/frappe-develop/frappe/model/meta.py)). Standard JSON definitions are synchronized with database metadata.

This metadata directly drives:

- database tables and child tables;
- generic form/list behavior;
- mandatory/link/type validation;
- role and field-level permissions;
- naming and titles;
- workflow and submission support;
- REST resources and controller resolution.

There is very little distance between declaring an entity and obtaining a functioning application surface.

### Athyper: versioned control metadata is compiled

`control.entity`, `entity_version`, `entity_field`, field groups, relations, operations, policies, lifecycle bindings, workflows, and display/search/identity configuration describe the entity. Only `EFFECTIVE` entity versions are served. The compiler creates stable hashes and append-only compiled snapshots, including a document runtime plan with nodes and invalidation actions ([`entity-compiler.service.ts`](../../server/packages/services/metadata/src/entity-compiler.service.ts)).

This design provides:

- review/approve/effective governance;
- deterministic version hashes and cache identity;
- separation between physical column names and logical/API fields;
- entity-class compliance profiles;
- arbitrary lifecycles and operations;
- tenant overlays and three-plane descriptor compilation.

### Finding

Athyper's metadata model is richer, but Frappe's is more **causally complete**: one metadata declaration reliably produces storage, runtime, API, permission, and UI behavior. In Athyper, declaring metadata is necessary but sometimes insufficient because domain registries, write facades, runtime adapters, child handlers, seed contracts, and UI overrides may also be required.

The architectural target should be a published matrix for each metadata property:

| Property owner | Compile output | Server enforcement point | Client consumer | Invalidation event |
|---|---|---|---|---|
| `control.entity_field.editability` | compiled field mask | mutation guard | form/edit runtime | entity-version generation |
| `control.entity_operation` | operation descriptor | operation/mutation guard | action bar | operation/permission invalidation |
| lifecycle metadata | transition map/runtime plan | lifecycle orchestrator | status/action UI | lifecycle metadata generation |
| attachment feature | attachment capability | documents authorization | attachment panel | descriptor invalidation |

## 9. Record creation, editing, and deletion

### Frappe's unified `Document` path

#### Create

```text
generic API -> get/new Document -> insert
 -> defaults, identity/timestamps, docstatus
 -> create permission and link checks
 -> before_insert
 -> naming and child parentage
 -> before_validate / validate / before_save
 -> parent insert + child inserts
 -> after_insert
 -> on_update / version / search / notifications / cache clear
```

#### Edit

```text
load Document -> update -> save
 -> write permission
 -> modified/latest check
 -> field/link/mandatory validation
 -> validate / before_save
 -> parent update + child-table synchronization
 -> on_update / version / search / notifications / cache clear
```

#### Delete

The generic delete service checks permissions and link constraints, runs controller hooks, records deleted-document information where configured, removes children and related state, and performs search/cache cleanup.

The key strength is that application controllers customize hooks without replacing the framework transaction skeleton ([`frappe/model/document.py`](../../../frappe-develop/frappe-develop/frappe/model/document.py), [`frappe/client.py`](../../../frappe-develop/frappe-develop/frappe/client.py)).

### Athyper's generic-and-domain hybrid

#### Create

The records route resolves the effective entity version/table and logical-to-physical field map, applies metadata write rules/defaults, resolves tenant/principal, requires the declared entity operation and permission, then either:

- inserts the physical table generically;
- invokes a declared write facade for a view-backed entity; or
- enters an explicit domain path such as purchase invoice creation.

`DIRECT_CREATE` requires an idempotency key. Audit fields are server-owned, and document types receive system defaults. Search and activity side effects are emitted after creation.

#### Edit

Generic PATCH requires both an expected `row_version`/ETag and an idempotency key. The route:

- rejects system/computed/read-only/write-once/status-locked fields;
- applies metadata source-change behavior;
- checks edit leases when configured;
- authorizes the entity operation;
- updates with `WHERE row_version = expected` inside a transaction;
- returns 412 on version conflict;
- emits activity/search/cache invalidation afterward.

The document workspace aggregate path can update header and child collections in one transaction, with independent child-entity authorization and a durable document-runtime event stream ([`records.route.ts`](../../server/packages/services/records/routes/records.route.ts)).

#### Delete

The route checks entity policy/operation/permission and performs a tenant-scoped physical delete. It then emits search cleanup, invalidates list caches, and publishes a record-deleted event.

### Findings

1. **Athyper's concurrency and idempotency model is materially stronger.** Frappe's conventional save path is easier, but Athyper better protects long-lived enterprise edit sessions and retried commands.
2. **The records route has become a framework hotspot.** It is roughly ten thousand lines and mixes generic mapping, business defaults, per-entity validation, line/distribution CRUD, locks, SSE, drafts, idempotency, operations, and domain dispatch. That is the clearest divergence from Frappe's maintainable kernel/controller split.
3. **Some post-mutation effects are outside the data transaction.** For example, generic delete performs the row delete and subsequently emits the search outbox event. A failure can leave a committed delete with stale downstream search state. Transactional outbox insertion should occur in the same transaction as every authoritative mutation.
4. **Silent field dropping needs a strict mode.** Several generic write paths skip non-writable or unmapped input fields. External APIs should normally return a structured 422 for every rejected field, preventing clients from believing a partial save succeeded.
5. **PUT, PATCH, workspace submit, write facades, and entity operations must converge.** They should call one mutation application service, not independently reproduce authorization, mapping, audit, idempotency, concurrency, and event logic.

## 10. Record lifecycle and workflow

### Frappe

Frappe gives every submittable document a universal three-state invariant:

```text
Draft (docstatus 0) -> Submitted (1) -> Cancelled (2)
```

`submit()` and `cancel()` simply set the target `docstatus` and enter the same `save()` kernel, which dispatches `before_submit/on_submit` and `before_cancel/on_cancel`. An optional Workflow adds named states, role-based transitions, conditions, field updates, tasks, and maps workflow states back to the three docstatus values ([`frappe/model/workflow.py`](../../../frappe-develop/frappe-develop/frappe/model/workflow.py)).

This limited base lifecycle is a feature: all controllers understand the same immutability/submission contract.

### Athyper

Athyper supports arbitrary lifecycle definitions and per-entity bindings. A transition resolves by entity, tenant, current state, and operation code. The lifecycle orchestrator:

1. begins a database transaction;
2. resolves the physical entity and locks the record `FOR UPDATE`;
3. validates expected state and row version;
4. resolves the active metadata transition and required reason;
5. enforces action rules/permissions;
6. prepares domain patches/commands;
7. runs required before hooks;
8. updates status, actor/timestamps, and row version;
9. synchronizes the lifecycle instance;
10. runs required after hooks in the same transaction;
11. rolls everything back when a required hook fails.

This is implemented in [`execute-lifecycle-transition.ts`](../../server/packages/services/records/lifecycle/execute-lifecycle-transition.ts). Workflow work items/approvers form an additional approval orchestration layer rather than being the only lifecycle mechanism.

### Finding

Athyper's lifecycle engine is the strongest part of its record architecture. The desired end state is to make this orchestrator the pattern for **all** mutations: a small transaction owner, metadata-resolved policy, registered domain hooks, deterministic audit/outbox, and no route-level business transaction logic.

At the same time, Athyper would benefit from a universal base state contract by entity class, analogous to Frappe's `docstatus`:

- `DOCUMENT`: draft-like, committed/posted-like, terminal/reversed-like flags;
- `MASTER`: active/inactive/retired flags;
- `LEDGER` and `LOG`: append-only/immutable;
- `AGGREGATE`: non-mutable projection.

Named lifecycle states can remain entity-specific, while canonical flags give generic code stable semantics for editability, deletion, posting, reversal, and retention.

## 11. Architectural strengths to preserve

### Preserve from Frappe

- one authoritative record lifecycle kernel;
- metadata that produces a complete usable surface;
- controller hooks that customize behavior without replacing the kernel;
- automatic child-record composition;
- generic API consistency;
- cache clearing, versioning, search, and notifications as standard lifecycle effects;
- a small universal document-state invariant.

### Preserve from Athyper

- Keycloak and OIDC/PKCE as external identity authority;
- separate trust planes and support realm;
- tenant UUID + PostgreSQL RLS;
- deny-wins grants, plan gates, company scopes, and decision audit;
- metadata review/version/effective governance;
- ETags, row versions, leases, and idempotency;
- transactional lifecycle hooks and explicit domain commands;
- S3/MinIO attachment versions, quarantine, scanning, audit, and compensation;
- transactional outbox/durable runtime event direction;
- explicit adapters and service boundaries.

## 12. Prioritized recommendations for Athyper

### P0: establish one mutation kernel

Create a transport-independent `EntityMutationService` with commands such as:

```text
create(entity, data, context, idempotency)
patch(entity, id, patch, expectedVersion, context, idempotency)
delete(entity, id, expectedVersion, context, idempotency)
transition(entity, id, operation, payload, expectedVersion, context, idempotency)
mutateAggregate(entity, id, changeSet, expectedVersion, context, idempotency)
```

It must own transaction start, tenant/principal GUCs, entity/version resolution, field mapping, policy/permission/scope, row locks/version checks, hooks, audit, outbox, cache-generation bump intent, and response projection. HTTP routes and workers become adapters.

### P0: enforce transactional outbox everywhere

Insert search, audit, notification, attachment, and runtime events in the same PostgreSQL transaction as the record mutation. Redis publication and external processing must be derived asynchronously from committed outbox rows. Never rely on a post-commit best-effort call to create the durable event.

### P0: consolidate authorization entry

Require one verified request context object containing realm, plane, tenant, principal, effective permission context, and trace/request identity. Route-local parsing of `X-Org`, `X-Realm`, and `sub` should be retired. Add contract tests proving all protected routers reject missing/mismatched context identically.

### P1: split the records hotspot by framework concern

Move code out of `records.route.ts` into bounded application services:

- descriptor/table resolver;
- query/list service;
- mutation kernel;
- aggregate child mutation service;
- lock service;
- draft service;
- runtime event service;
- operation dispatcher;
- response/reference enrichment.

Entity-specific defaults and validation belong in registered domain handlers, never `if (entityCode === ...)` branches in the generic service.

### P1: make metadata causally complete

For each entity, compilation should produce a machine-verifiable manifest describing which generic capabilities work and which registered handler supplies each exception. Fail compilation/deployment if metadata declares a write facade, operation, child collection, lifecycle hook, or renderer that is not registered.

### P1: unify attachment surfaces and documentation

Make the documents service the only attachment API, compile its capability/URLs into the entity descriptor, remove record-route stubs, and publish one DDL/ownership diagram for `master.attachment`, versions, links, folders, extraction, quarantine, retention, and deletion.

### P2: simplify caching

- standardize on one Redis client abstraction;
- use generation keys wherever possible;
- define degraded behavior per cache;
- expose hit/miss/stale/invalidation-lag metrics consistently;
- maintain one cache-key registry and ACL contract.

### P2: add universal entity-class lifecycle flags

Compile canonical semantic flags from named states. Generic UI/API logic should ask `isEditable`, `isCommitted`, `isTerminal`, `isReversible`, or `isDeletable`, not compare entity-specific status strings.

## 13. Bottom line

Frappe is the stronger **framework kernel**: its metadata, ORM, permissions, lifecycle, attachments, UI, and generic APIs behave as one system. Athyper is the stronger **enterprise platform architecture**: it has more robust identity, tenancy, governance, authorization, concurrency, content security, and workflow primitives.

The optimal direction for Athyper is therefore:

> Keep Athyper's distributed trust and governance architecture, but reduce its mutation behavior to a Frappe-like single kernel with explicit domain hooks.

That change would address the largest current risk—execution-path fragmentation—without sacrificing the capabilities that make Athyper better suited to multi-tenant, regulated enterprise workloads.
