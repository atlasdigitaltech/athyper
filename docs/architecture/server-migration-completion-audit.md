# Final Server Package Migration Review

**Reviewed:** 2026-08-11  
**Compared:** `server-backup` (legacy server) and `server` (rebuilt server)  
**Scope:** complete server comparison, including platform, shared services, runtimes, operations, and business-facing server capabilities. The finance implementation is therefore included rather than excluded.  
**Decision:** **the rebuilt server now passes its P0 workspace qualification gates, but it is not yet functionally complete or qualified to replace the legacy server. Keep `server-backup` as a protected rollback and parity reference.**

## Executive summary

The rebuild is a meaningful architectural improvement. It introduces 27 contract packages, independently packaged adapters, shared resilience and transaction primitives, explicit API/worker/scheduler composition, contract-aware routes, three database adapters, and stronger package-level testing boundaries. Publication, attachment quota recovery, document extraction, schedule governance, and several internal domain services are notable new or redesigned capabilities.

Migration completeness is much weaker than architecture quality. The legacy server exposes a broad platform and business API. The rebuilt host currently exposes a deliberately smaller core and leaves major legacy surfaces absent, implemented without HTTP adapters, or conditionally registered. This affects IAM administration, audit and compliance, metadata, policy authoring, workflow authoring, collaboration, integration, AI, master data, advanced records, broader attachment administration, operational job tooling, and essentially the full legacy finance surface. Saved-view actions plus core content links and content-scoped attachments were restored in the first P1 implementation slice.

The P0 remediation pass restored the rebuild's workspace qualification gates:

- aggregate server typecheck, tests, and build pass across the 88 scoped projects;
- all eight rebuild-boundary findings were corrected and the policy now passes across 89 packages and 453 source files;
- all four deployment profiles validate against 172 active packages with ownership metadata;
- the 1,985-item legacy inventory was regenerated and its check passes;
- a normalized route manifest now resolves literal router mounts, route contracts, and finite string/tuple loops, with regression tests and a deterministic stale check.

This does not establish a clean candidate revision: the shared worktree still contains extensive pre-existing changes, and no disposable three-plane qualification was run. Functional parity gaps remain unchanged unless explicitly noted below.

This is not a recommendation to return to the legacy architecture. It is a recommendation to finish and qualify the rebuild before cutover.

## Assessment at a glance

| Dimension | Legacy server | Rebuilt server | Final assessment |
|---|---|---|---|
| Architecture boundaries | Coarser packages and centralized composition | Contracts, adapters, foundation, runtimes, and services are separated | Rebuild is stronger; the current boundary policy passes. |
| HTTP capability breadth | Very broad platform and business surface | Focused core API with many omitted or pending domains | Material regression in exposed functionality. |
| Internal service design | Mature but often tightly composed | Smaller services with explicit ports and adapters | Generally stronger design, uneven domain completeness. |
| Runtime composition | API, worker, and scheduler selected through legacy host | Explicit API, worker, and scheduler entry points using a shared container | Rebuild is clearer and easier to test. |
| Deployment behavior | Large but established configuration surface | Capability availability is heavily conditional on IAM, databases, adapters, runtimes, and flags | Rebuild needs an explicit capability manifest and profile qualification. |
| Observability | OTel, metrics, health, Sentry, BullBoard | OTel, metrics, health, lifecycle, process heartbeat, and Sentry-compatible fatal collection; no BullBoard found | Core telemetry is improved; operator-console parity remains open. |
| Test organization | 290 static test/spec files; relatively few package-local Vitest configs | 125 static test/spec files; 69 package-local Vitest configs and host vertical tests | Better isolation; aggregate tests now pass. |
| Release readiness | Rollback baseline | Workspace gates pass, but the worktree is not a clean candidate and functional gaps remain | Not eligible for replacement or staging cutover. |

## Evidence and method

The review used:

- directory and package-manifest scans;
- static Express route extraction, followed by inspection of loop-generated and contract-registered routes;
- host composition inspection across adapters, runtimes, platform, services, API, worker, and scheduler processes;
- comparison with the generated legacy inventory and disposition manifest;
- fresh typecheck, test, build, inventory, route-manifest, and policy commands;
- targeted verification of previously disputed Jobs, notification, content, saved-view, Studio, multi-realm, Sentry, and BullBoard claims.

Static route identity is not treated as behavioral parity. Mount prefixes, parameter names, authorization, schemas, status codes, and side effects can differ even when route names look similar. The new normalized manifest resolves literal mounts, contract routes, and finite string/tuple loops and normalizes parameter names, while the broader legacy inventory intentionally remains a raw structural backlog. Neither artifact is a completion percentage.

## Package inventory

### Rebuilt server

| Layer | Inventory |
|---|---|
| Platform | 17 top-level packages: AI, audit, classification, collaboration, entitlements, features, IAM, jobs, metadata, notifications, policy, preferences, reference data, rendering, search, taxonomy, workflow |
| Services | 12: attachments, content, document derivatives, document processing, documents, finance, integration, jobs, master data, numbering, publication, records |
| Contracts | 27 typed domain and infrastructure contracts |
| Adapters | 17 top-level adapter directories, including three AI providers, Keycloak, Redis, three database adapters plus database core, Tika, ClamAV, S3, rendering, Meilisearch, secrets, publication signing, communications, and integration HTTP |
| Runtime | HTTP, jobs, scheduling |
| Planes | Neon and Mesh shells; Studio plus nested onboarding and meta-entity authoring packages |
| Package manifests | 87 under `server/packages` |
| Static source files | 634, excluding `node_modules`, `dist`, and coverage |
| Static test/spec files | 125 |

### Legacy server

| Layer | Inventory |
|---|---|
| Platform | 13 top-level packages, including AI, audit, collaboration, documents, events, IAM, jobs, notifications, policy, rules, search, workflow |
| Services | 13, including business, finance, master, metadata, onboarding, platform, publication, records, and shared services |
| Adapters | 8 top-level groups |
| Foundation | 9 top-level groups |
| Runtime | Health, HTTP, scheduler, workers |
| Planes | Athyper, Mesh, Neon |
| Package manifests | 42 under `server-backup/packages` |
| Static source files | 1,205, excluding `node_modules`, `dist`, and coverage |
| Static test/spec files | 290 |

The higher rebuilt package count demonstrates finer modularization, not greater functional completion. The lower source and test-file counts are not defects by themselves, but they reinforce the need for behavioral parity evidence rather than architectural inference.

## Architecture review

### What the rebuild improves

1. **Contracts and dependency inversion.** Twenty-seven typed contract packages make domain boundaries explicit and reduce direct coupling to infrastructure.
2. **Adapter isolation.** Keycloak, Redis, databases, storage, malware scanning, extraction, search, rendering, signing, telemetry, communications, secrets, and AI providers are independently packaged.
3. **Shared foundation.** Request/job context, lifecycle, observability, retry, circuit breaker, tenancy, unit of work, transaction runners, errors, and validation are centralized.
4. **Explicit process composition.** API, worker, and scheduler processes share a typed container and a consistent registration pipeline.
5. **Improved runtime contracts.** Contract-registered routes can contribute schemas and operation metadata to OpenAPI.
6. **Fail-closed adapter requirements in sensitive paths.** Publication, malware scanning, and several process modes reject incomplete configurations rather than silently using unsafe fallbacks.
7. **Package-local verification.** Most rebuilt packages have their own Vitest and TypeScript configuration, and the host contains vertical composition tests.

### P0 boundary corrections

The eight findings from the initial audit are corrected:

1. Integration job registration moved from the Jobs runtime into the Integration service, removing the runtime-to-service dependency reversal.
2. Collaboration contract ownership is registered canonically.
3. Content contract ownership is registered canonically.
4. Integration contract ownership is registered canonically.
5. Master-data contract ownership is registered canonically.
6. Meta-entity-authoring contract ownership is registered canonically.
7. The duplicate attachment `LegalHold` authority type was removed; attachment-specific persistence retains `LegalHoldRecord` while Audit owns the governance type.
8. `MetadataGenerationEvent` is owned by the Metadata contract and re-exported by Meta-entity-authoring.

The rebuild-boundary policy now passes. Remaining architectural concerns are not policy violations:

Additional concerns:

- `register-services.ts` remains a large composition unit. The dependency graph is clearer than the legacy bootstrap, but capability-specific composers would reduce conditional complexity.
- Neon and Mesh plane packages remain shells. Studio has route implementation, but its authoring registrar is not attached to the host.
- Several source files are aggressively minified into single lines, which weakens reviewability despite package separation.
- Encoding damage remains in source comments such as the platform-host entry point. This report itself uses clean UTF-8 text.
- Direct Express routes do not automatically enter the route-contract registry. Therefore `/openapi.json` can be wired and still be incomplete unless every public route is registered through the contract mechanism or separately documented.

## Runtime and deployment model

The rebuilt entry point dispatches to distinct API, worker, and scheduler processes. All three construct adapters, runtimes, platform services, and domain services through the same container. Worker mode additionally registers invalidation workers; scheduler mode starts repeatable scheduling and governance reconciliation. Lifecycle hooks provide startup readiness and graceful shutdown.

This is a stronger model than the legacy host, but runtime availability is highly conditional:

| Capability | Availability condition |
|---|---|
| All authenticated platform services | Keycloak/token verifier must be configured; otherwise platform registration returns before IAM routes are installed. |
| Most domain services | IAM, authorizer, audit, and at least one metadata database or an injected metadata dependency are required. |
| Records | Neon or Mesh record database, or injected repository, is required. |
| Content | At least one metadata database is required. Search within content additionally requires Meilisearch. |
| Search | Search adapter must be configured. |
| Attachments | Object storage, bucket, ClamAV, and metadata database are required. |
| Documents | Metadata/templates, renderer, malware scanner, object storage, and bucket are required. |
| Jobs administration | BullMQ plus job transaction databases are required. Governance routes are installed only when the governance service is composed. |
| Publication API | Jobs runtime and `publication.apiEnabled` are required. Other publication flags require Studio authority storage, signing, verification, and target databases. |
| Notification job handlers | BullMQ is required. Channel delivery also depends on configured communications adapters. |
| Cache invalidation workers | Worker mode, Redis, and per-plane databases are required. Direct notification listening additionally depends on listener URLs. |

This conditionality is not fully represented by a static `Registered: Yes` label. Release evidence must include an `Enabled in deployment profile` matrix generated from actual production/staging configuration. Missing optional capabilities should either fail startup for profiles that require them or appear explicitly in readiness output.

## HTTP and domain parity

### Status definitions

| Status | Meaning |
|---|---|
| Core migrated | A meaningful current route exists; behavioral compatibility still requires tests. |
| Partial parity | Some legacy capability is exposed, but routes or behavior remain missing or changed. |
| HTTP adapter pending | Internal implementation exists, but no public route adapter was found. |
| Unwired route | A route implementation exists and is exported, but the host does not register it. |
| Missing | Neither a current public route nor a sufficient replacement was found. |
| New | No legacy equivalent was identified. |

### Comprehensive domain assessment

| Domain | Rebuilt state | Final assessment |
|---|---|---|
| System health and metrics | `/livez`, `/readyz`, `/healthz`, `/health`, and conditionally protected `/metrics` | Core migrated and operationally improved. |
| OpenAPI/docs | `/openapi.json` and Swagger UI are wired | Partial: contract routes are represented, but direct Express routes can be absent from the generated document. Production docs are conditionally exposed. |
| IAM/authentication | Bearer plus `x-plane`, request-context verification, `/api/iam/me`, conditional provisioning request | Partial parity. Sessions, MFA, discovery/JWKS endpoints, permission listing, delegation, groups/roles, principal search, and gateway verification remain absent. |
| Audit | Recorder and `/api/audit/status` | Partial parity. Query, export, integrity, PII inventory, and legal-hold APIs remain absent. Governance/export runtime wiring is unverified. |
| Metadata | Descriptor reader, cache, invalidation worker, generation state | Partial parity. Descriptor HTTP API, field activation, runtime bootstrap, and broad Studio metadata surface remain absent. |
| Studio meta-entity authoring | Nine route operations covering change sets and release actions | **Conditionally registered:** platform-host registers the routes when the Studio database, publication API, jobs runtime, signer, and signing key are available. Paths still differ from legacy `/meta-entity` routes, and the broader legacy read surface remains incomplete. |
| Records | List/get/create/patch/delete/transition; bulk, transfer, snapshot, lock, and action services exist internally | Partial parity. Legacy drafts, lines, distributions, approvals, locks/heartbeat, snapshots, import/export, bulk endpoints, version/amend, resolver, and business-partner/supplier flows are not exposed. Internal services are `HTTP exposure undecided`, not assumed intentionally private. |
| Workflow | Inbox, request context, create item, claim/complete/cancel, generic item action | Partial parity. Definition, template, stage, rule, SLA-policy, administrative, and several request/action routes remain absent. Authoring service has no HTTP adapter. |
| Policy | Evaluation route plus internal cached repository and authoring service | Partial parity. Definitions, versioning, rules, test cases, batch tests, import/export, and field-security middleware remain absent. |
| Notifications | Inbox, read, SSE, push subscriptions, preferences; multiple delivery and maintenance handlers | Strong core migration. Preferences existed in the legacy server and are not new. The legacy notification surface is broader, so contract-level parity remains unverified. |
| Jobs administration | Dead letters, execution commands, queues, execution listing, schedule governance | Redesigned partial parity. Schedule operations existed in the legacy server. Current `PUT` update and deactivate semantics differ from legacy `PATCH` and delete behavior. BullBoard and several detailed administration routes remain absent. |
| Content | Browser/editor, versions, transitions, links, content-scoped attachments, ACL, quota, search, reindex | Core link and content-scoped attachment operations are migrated. Upload uses staged object storage rather than legacy base64 payloads, and attachment-version staging preserves series/current-version state. Current `/acl` must not be assumed equivalent to legacy `/grants` without authorization and schema tests. Broader generic attachment administration remains partial. |
| Attachments | Stage/finalize, version staging, quota ledger, and recovery | Core migrated with stronger quota, malware-scan, and version-series lifecycle. Broader legacy attachment administration remains partial. |
| Documents/rendering | Render and download with isolated renderer/storage/scanner ports | Partial parity. Legacy document and doc-service surfaces are much broader. |
| Document processing | Tika extraction and search backfill handler | New or redesigned internal capability; conditional worker registration. |
| Document derivatives | Internal service | HTTP exposure undecided. No absence is classified as intentional without an approved decision. |
| Search | Document search route | Core migrated; query behavior and index compatibility require testing. |
| Saved views | List/create/replace/delete, set/clear default, pin/star/share/archive, clone, user aliases, and legacy entity-scoped routes | Route-level legacy parity restored. Deployment verification and client contract tests remain required. |
| Collaboration | Comments, mentions, drafts, reactions, mark-read services | **HTTP adapter pending.** No route registrar was found; this is not merely an unwired route. |
| Integration | Core service, delivery jobs, inbound webhook, provisioning command; outbound HTTP adapter | **HTTP adapter pending** for endpoint/provider/outbox/delivery management. Worker wiring must be evaluated separately. |
| AI/Atlas | Agent runtime, threads, tools, invoice extraction, record gateway, context/bindings/admission, three provider adapters | **HTTP adapter pending.** No current AI route groups are registered. |
| Reference data | Import service | HTTP adapter pending; legacy reference-data routes remain uncovered. |
| Taxonomy | Hierarchy and crosswalk services | HTTP adapter pending; legacy taxonomy routes remain uncovered. |
| Classification | Assignment and owner validation | HTTP adapter pending. |
| Entitlements/features | Evaluation services | HTTP adapter pending. Legacy commerce, feature, and deprecation-management surfaces remain uncovered. |
| Master data | Normalization and internal services | HTTP adapter pending. Legacy master contacts, addresses, ownership, and related endpoints remain absent. |
| Onboarding | Nested Studio saga | HTTP exposure and host composition incomplete compared with legacy onboarding routes. |
| Publication | Release/deployment/publish/retry/rollback routes plus signed artifact workflow | Meaningful new/redesigned capability. Route and worker availability is flag- and adapter-dependent. |
| Finance and business-plane server APIs | Finance package is a stub | Major functional gap. The legacy finance, P2P, business, and related master/setup HTTP surfaces are not migrated to the rebuilt server. |

## Corrections to earlier audit claims

1. Jobs schedule routes are not new versus the backup. The administration model is redesigned and partly expanded.
2. Notification preferences exist in both servers and are not a new capability.
3. Content links and content-scoped attachments are now implemented using the current staged-upload lifecycle; broader attachment administration remains partial.
4. Current `/acl` and legacy `/grants` are not declared equivalent without behavioral evidence.
5. Saved-view route parity was partial at audit time; the missing legacy actions and aliases are now implemented and require deployment/client qualification.
6. Studio authoring was the only unwired route implementation and is now conditionally registered. Collaboration, integration management, and AI still need HTTP adapters.
7. `Registered` is split into unconditional, conditional, and not registered; deployment enablement is a separate concern.
8. Audit governance/export status is split into implementation, handler/schedule wiring, HTTP exposure, persistence, and profile enablement.
9. Provisioning has conditional HTTP exposure and is not exclusively internal.
10. Records bulk/transfer/snapshot/lock/action and document derivatives are not labeled intentionally internal without an approved architecture decision.
11. The rebuild is not described as deeper or equal across all domains.
12. This report contains no mojibake.

## Jobs, workers, and scheduling

The rebuilt job architecture is cleaner: job definitions, execution lifecycle, metrics, Cronwatch notification, BullMQ runtime, governance repository, schedule reconciliation, and per-plane transaction coordination are explicit. Current composition registers notification dispatch and maintenance, webhook delivery, document extraction, attachment quota recovery, publication compile/sign/dispatch/apply/rollback/recovery, and cache invalidation work when their prerequisites are available.

Open issues:

- Audit export and governance workers are implemented at package level but not proven registered and scheduled in the host.
- The legacy worker catalog is broader; each legacy handler needs a migrated, replaced, deferred, or retired disposition.
- `ignoreUnknownHandlers: true` in schedule reconciliation can allow configured schedules to remain rejected without stopping startup; this needs an operational alert and profile gate.
- BullBoard is absent, and no equivalent visual operator console was identified.

## Security and tenancy

Strengths include fail-closed Bearer authentication, required `x-plane`, normalized plane context, requested tenant/realm/organization context passed through authentication, per-plane transaction coordination, tenant-scoped repositories, authorization checks on sensitive routes, idempotency requirements, malware scanning, signed publication artifacts, and internal-only metrics protection.

Remaining risks:

- The Keycloak adapter supports multiple realms, but host configuration wires one default issuer/audience and does not load additional realm definitions.
- The legacy IAM administrative and assurance surfaces are largely missing.
- Field-security middleware parity is absent.
- Behavioral tests must verify tenant isolation, authorization, idempotency, and error contracts for every migrated route; source presence is insufficient.

## Observability and operations

The rebuilt server retains health probes, Prometheus metrics, OpenTelemetry, job lifecycle metrics, Cronwatch hooks, readiness contributions, graceful shutdown, and worker/scheduler heartbeats. These are strong foundations.

Operational gaps include:

- no BullBoard replacement;
- incomplete OpenAPI coverage for routes not using `registerContractRoute`;
- no current clean-candidate or disposable three-plane qualification;
- large configuration migration surface that remains classified as deferred in the regenerated inventory.

Fatal boot errors now initialize and flush the Sentry-compatible collector when `GLITCHTIP_DSN` or `SENTRY_DSN` is configured. Runtime request/error capture beyond the fatal boot path still requires explicit qualification.

## Verification results for this review

| Check | Result | Interpretation |
|---|---|---|
| Package/source/test inventory | Completed | Static filesystem evidence only. |
| Targeted route and host-wiring inspection | Completed | Supports the domain classifications above. |
| `pnpm --dir server run typecheck` | **Pass** | All 88 scoped server projects typecheck. |
| `pnpm --dir server run test` | **Pass** | Aggregate package and host suites pass. |
| `pnpm --dir server run build` | **Pass** | All scoped server packages compile, including platform-host. |
| `pnpm inventory:server-rebuild:check` | **Pass** | Regenerated legacy inventory verifies at 1,985 items. |
| `pnpm policy:server-rebuild-boundaries` | **Pass** | 89 packages and 453 source files verified. |
| `pnpm policy:deployment-profiles` | **Pass** | Four profiles and 172 active packages verify with ownership metadata. |
| `pnpm routes:server-manifest:check` | **Pass** | Deterministic normalized manifest verifies at 914 route identities. |
| `pnpm test:server-route-manifest` | **Pass** | Mount, contract, loop, and normalization regression tests pass. |
| `pnpm test:policy` | **Fail outside server P0** | The new route tests pass, but the broader suite still references a removed shared meta-entity schema module and removed experience-page paths. These pre-existing repository cleanup failures require a separate ownership decision. |
| Live disposable environment | Not run | Requires an isolated configured environment and remains a release gate. |

The worktree contains extensive existing modifications and untracked files. The P0 work preserved unrelated changes and did not reset or clean the tree. Consequently, these passing workspace gates do not by themselves prove reproducibility from a clean committed revision.

## Inventory interpretation

The regenerated broad inventory contains 1,985 identities. Its raw route category reports 872 deferred legacy routes and 60 current-only routes, with no raw matches because it deliberately compares source literals rather than normalized host paths. The new normalized route artifact provides the appropriate structural route view: 914 identities, comprising 22 matched, 846 legacy-only, and 46 current-only identities from 898 legacy and 68 current occurrences.

These figures must not be converted into a migration percentage because:

- the broad scanner includes legacy tests and raw router-relative paths;
- the normalized scanner covers literal mounts and finite string/tuple loops, but dynamic registrars and computed paths can still require review;
- business and platform routes are mixed;
- structural identity does not prove behavioral compatibility.

The generated inventory and parity matrix were untracked before regeneration, so Git has no baseline diff for those files. The review therefore compared the regenerated counts with the prior audit record and checked both generators deterministically. The raw route totals changed materially, reinforcing that only the normalized manifest should be used for route-identity triage.

The important governance fact is that the disposition manifest has no explicit overrides. Missing legacy items default to `deferred`; none are currently approved as retired or replaced through that manifest.

## Prioritized remediation plan

### P0 - restore a trustworthy candidate

1. **Workspace complete; clean revision pending.** Aggregate server typecheck, tests, and build pass after dependency hydration and targeted defects were corrected.
2. **Complete.** All eight architecture-boundary findings are resolved.
3. **Complete.** Deployment profiles and ownership metadata pass policy validation.
4. **Complete with baseline caveat.** The legacy inventory was regenerated and reviewed; the generated files had no tracked Git baseline.
5. **Complete.** The normalized route-manifest generator handles literal router mounts, contract routes, and finite string/tuple loops and is covered by tests.

### P1 - close platform-critical parity

1. IAM sessions, MFA, JWKS/discovery, permissions, delegation, groups/roles, principal search, and verification.
2. Audit query, export, integrity, PII inventory, legal holds, and confirmed worker/schedule wiring.
3. Metadata descriptor, activation, bootstrap, and registered Studio authoring routes. **In progress:** Studio authoring registration and projection-confirmed activation are complete; descriptor HTTP/bootstrap parity remains.
4. Policy definitions, rules, tests, import/export, and field security.
5. Advanced records and workflow authoring surfaces required by current clients.
6. Saved-view legacy operations and content links/content-scoped attachments, or approved retirement/client-migration decisions. **Implemented; deployment/client contract qualification remains.**

### P2 - expose implemented domains

1. Collaboration HTTP adapter.
2. Integration management/webhook HTTP adapter and verified job wiring.
3. AI/Atlas HTTP adapter with admission, authorization, and streaming tests.
4. Master data, reference data, taxonomy, classification, entitlements, and features APIs where they are public product contracts.
5. Studio onboarding and plane-specific composition; define the intended role of Neon and Mesh plane packages.

### P3 - restore operations and prove compatibility

1. Decide on Sentry or an explicit replacement and add exception-path verification.
2. Restore BullBoard or document and qualify a replacement operator workflow.
3. Ensure every public route appears in OpenAPI or is explicitly excluded with a reason.
4. Run contract tests against legacy and rebuilt servers for methods, paths, schemas, authorization, side effects, and failure semantics.
5. Execute API, worker, scheduler, database, Redis, storage, search, malware, rendering, and graceful-drain tests in a disposable three-plane environment.

### P4 - business capability decision

Choose and document one of the following for each legacy finance/business surface:

- migrate it into rebuilt server packages;
- replace it with a named external or plane-owned service and verified client migration;
- defer it with owner, risk, and due gate;
- retire it with explicit approval and evidence.

The finance stub is not a functional migration.

## Final verdict

The rebuilt server should continue. Its architecture is substantially better suited to long-term development, isolated testing, adapter replacement, multi-process operation, and governed publication. However, it is currently a platform foundation plus selected vertical slices, not a complete replacement for the legacy server.

The server P0 policies and build gates now pass, and the workspace has a trustworthy normalized route manifest. The immediate objective is to capture these changes in a clean reproducible candidate, then close platform-critical APIs and explicitly dispose of every legacy business and operational capability. `server-backup` should remain protected until behavioral parity, approved retirements, live three-plane qualification, staging canary, rollback rehearsal, and a stabilization window are complete.
