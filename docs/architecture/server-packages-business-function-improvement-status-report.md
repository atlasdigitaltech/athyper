# Server packages business-function review

**Review date:** 2026-08-11  
**Scope:** `server/packages/**`, excluding `server/packages/planes/**` in full.  
**Method:** static code and package-manifest review, route/contract inspection, test inventory, and a started workspace typecheck. This is not a production or disposable-environment qualification.

## Executive status

The non-plane package estate has a credible layered design and materially more implementation than a skeleton assessment would suggest. It contains 82 package manifests: 20 adapters, 27 contracts, 1 foundation package, 17 platform packages, 3 runtime packages, 13 business-service packages, and test utilities. Core business flows for identity, jobs, notifications, content, attachments, records, documents, publication, workflow, and policy have concrete services and, in many cases, HTTP adapters.

It is **not yet a release-ready business-function baseline**. The largest risks are not broad absence of code; they are incomplete proof that the code is composed with the required deployment dependencies, manually defined HTTP routes that escape the contract/OpenAPI mechanism, concentrated one-line implementations that make review unsafe, and a lack of end-to-end compatibility and operational testing.

The current working tree has 4,789 changed/untracked paths. Those changes were treated as user-owned; this report does not attribute them or claim a clean-candidate result. The aggregate server typecheck began and reported no diagnostics before the 60-second command deadline, but it did not finish. That is **inconclusive**, not a passing verification.

### Readiness meanings used here

| State | Meaning |
| --- | --- |
| Implemented | A concrete business implementation is present in the package. |
| Conditionally available | Implementation exists, but host composition requires a database, runtime, adapter, flag, or deployment configuration. |
| Library/contract only | Useful domain logic or types exist; public HTTP/runtime availability is not established. |
| Unverified | Package source alone cannot prove production behavior, parity, or deployment availability. |

## Business-function status

| Business function | Package areas reviewed | Status | Improvement needed |
| --- | --- | --- | --- |
| Shared contracts and foundation | `contracts/*`, `foundation` | Implemented | Contracts are broadly separated from implementation, and foundation has lifecycle/context/resilience primitives. Several contracts have no direct tests; add schema and consumer compatibility checks rather than treating TypeScript compilation as contract validation. |
| HTTP platform and observability | `runtime/http`, telemetry adapter | Implemented with limitations | The runtime has problem details, health endpoints, request context, metrics and OpenAPI generation. Its rate limiter is process-local/IP-only, and timeout enforcement depends partly on host configuration. Move enforcement to a distributed/gateway-aware design and add abort propagation. |
| Jobs and scheduling | `platform/jobs`, `services/jobs`, `runtime/jobs`, `runtime/scheduling` | Conditionally available | Governance/catalog/reconciliation code and administration routes are present. Verify Redis/BullMQ behavior across restart, duplicate schedulers, stale schedules, DST/timezone, retries, and worker ownership in a real deployment. |
| IAM and provisioning | `platform/iam`, auth contracts/keycloak adapter | Implemented; critical parity unverified | Sessions, permissions, gateway envelope, and HTTP routes exist. Provisioning is an optional route dependency, so it is conditional HTTP exposure, not an internal-only capability. Run legacy-vs-current tests for sessions, MFA, JWKS/discovery, delegation, group/role and principal-search contracts. |
| Audit and governance | `platform/audit`, audit contracts | Partially implemented / unverified | Query routes and an export worker implementation exist. Package code does not itself prove that export, integrity, PII inventory, legal holds, queues, and schedules are registered together. Make worker-vs-HTTP ownership explicit in the deployment inventory. |
| Metadata and Studio-adjacent platform capabilities | `platform/metadata`, metadata contracts | Implemented; composition/parity unverified | Descriptor and metadata capabilities are present, but activation/bootstrap and authoring availability must be demonstrated by host registration and database tests. Plane packages were intentionally excluded from this review. |
| Policy, workflow, records | `platform/policy`, `platform/workflow`, `services/records` | Implemented; public compatibility unverified | Policy and workflow route modules, and record query/mutation services are concrete. Validate field security, import/export, advanced record actions, authorization semantics, idempotency, and legacy response/error contracts. |
| Preferences and notifications | `platform/preferences`, `platform/notifications`, communications/cache adapters | Implemented with maintainability risk | Saved-view support now includes list/create/replace/delete, defaults, flags/actions, clone, and user aliases. Legacy semantic parity and client migration still need a route-by-route decision. Notification preferences have routes; the planner is a dense all-in-one database orchestration module that should be decomposed and characterized before change. |
| Content, attachments, extraction, derivatives | `services/content`, `attachments`, `document-processing`, `document-derivatives`, related adapters/contracts | Conditionally available | There is an attachment lifecycle, extraction/search path, and derivatives scheduling/handler implementation; this is not skeleton-only. Preview/thumbnail execution depends on jobs, storage, metadata, malware, and renderer composition. Confirm content links, content-scoped attachments, attachment-version upload, ACL-versus-legacy-grants authorization and response semantics with integration tests. |
| Documents and publication | `services/documents`, `services/publication`, rendering/signing adapters | Implemented; operationally unverified | Both have substantial orchestration and tests. Exercise artifact persistence, signing/key rotation, storage cleanup, rendering failure/retry, and multi-plane publication activation against real dependencies. |
| Collaboration | `platform/collaboration`, collaboration contracts | Conditionally available | Comments/mentions/reactions/routes and Kysely persistence are implemented. Availability depends on the collaboration schema and host composition. Existing databases need the collaboration `content_schema` migration; a canonical DDL update alone does not upgrade installed databases. |
| Integrations and webhooks | `services/integration`, integration HTTP adapter/contracts | Implemented; conditional and unverified | Route and delivery code exist. Verify secret resolution, webhook admission, signature validation, retry/dead-letter behavior, tenant isolation, and actual job registration. |
| AI/Atlas | `platform/ai`, provider adapters/contracts | Implemented; conditionally exposed | Provider adapters and Atlas routes are present. Durable stores/configuration and host composition must be demonstrated; test admission control, authorization, streaming disconnect/cancellation, quotas, and provider failure semantics. |
| Master/reference/taxonomy/classification/entitlements/features | `services/master-data`, `platform/{reference-data,taxonomy,classification,entitlements,features}` | Mixed: service/library; public role unverified | These packages contain useful business logic, but source alone does not establish which are public product APIs, durable authorities, or internal libraries. Do not label absent routes as intentionally internal-only without a product/architecture decision. |
| Finance and numbering | `services/finance`, `services/numbering`, contracts | Library/service implementation; exposure unverified | Finance has no test files in its package. Define public contract, persistence/authorization boundary, and integration coverage if it is a product capability. |
| Test support | `test-utils` | Seeded but unused | It now exports IDs, contexts, transaction, audit and outbox fakes, but no package outside itself imports it and it has no tests. Adopt it in integration/route suites and add database/Redis/storage fixture support. |

## Priority findings

### P0 — resolve before calling the package estate a trustworthy candidate

1. **Establish a clean verification baseline.** The current 4,789-path dirty tree and unfinished aggregate typecheck prevent reliable attribution. Build a clean candidate revision and complete `typecheck`, package tests, and build. Record exact commit, Node/pnpm versions, profiles, and service endpoints.

2. **Close the HTTP contract/OpenAPI gap.** Contract-aware routes use `registerContractRoute` (for example records and IAM), but several active modules directly call Express route methods, including content, collaboration, integration, notifications, saved views, and document search. Direct routes can be correct but are not automatically represented in the generated contract manifest/OpenAPI document. Either convert them or add a manifest registration mechanism with CI coverage and an explicit exclusion reason.

3. **Decompress high-risk orchestration and route modules.** Platform packages have 225 source lines longer than 300 characters; services have 254. `platform/notifications/src/notification-planner.ts` combines rule lookup, recipient expansion, preferences, address resolution, rendering, persistence, and deduplication in a compact module. Split into small units with characterization tests before changing behavior. Apply the same standard to compact HTTP adapters and repositories.

4. **Make conditional availability operationally explicit.** “Registered” is insufficient. For every public capability, record `unconditional`, `conditional`, or `not registered`, its required database/adapter/job/feature configuration, and whether it is enabled in each deployment profile. This is particularly important for content, publication, collaboration, integration, AI/Atlas, documents, and derivatives.

5. **Remove encoding defects.** At least `runtime/scheduling/src/index.ts` contains mojibake in its banner comment. Sweep source and generated/report artifacts using UTF-8 and add an encoding check to CI.

### P1 — close business-critical behavior and parity

1. **IAM:** run contract tests against legacy and rebuilt behavior for MFA, session lifecycle, JWKS/discovery, permissions, delegation, groups/roles, principal search, and verification outcomes.
2. **Audit:** separately inventory HTTP query/export APIs, job definitions, worker handlers, schedules, storage, and retention/integrity controls. A present export worker is not proof of registered runtime execution.
3. **Content:** prove or explicitly decide the gap for links, content-specific attachments, attachment-version upload, and ACL-to-grants compatibility. Route name similarity is not authorization or response-contract equivalence.
4. **Saved views:** the expanded current implementation needs compatibility tests for update/delete/default/pin/star/share/archive/clone/user aliases, and an approved retirement/client-migration record for any remaining legacy operations.
5. **Records, policy, workflow and metadata:** use client-driven contract tests for methods, paths, schemas, authorization, side effects, optimistic concurrency, and failure semantics.

### P2 — make implemented packages operationally safe

1. **Derivatives:** run preview and thumbnail generation through real object storage, malware status, jobs runtime and renderer; add retries, poison-message, cleanup, idempotency and observability tests. The implementation is substantial, but those dependencies make it conditional.
2. **PII detection:** the document-processing detector is configurable and avoids persisting match values, but its baseline heuristics are not an exhaustive data-classification solution. Define supported jurisdictions/types, confidence/false-positive handling, redaction/escalation behavior, and use a governed detector where required.
3. **Rate limiting:** the current in-memory IP limiter resets per process, is not tenant/principal aware, trusts framework IP configuration, and has bounded opportunistic cleanup. Place durable, identity-aware enforcement at the gateway/shared cache layer; retain local protection as a fallback.
4. **Request deadlines:** Node server timeouts and per-job timeouts do not automatically cancel downstream database, storage, renderer, or provider work. Propagate `AbortSignal`, set dependency-specific limits, and test client disconnects, streaming and graceful shutdown.
5. **Schedulers and workers:** test Redis outages, recovery after process loss, single-active scheduling, schedule deletion, delayed job behavior, DST, and dead-letter/operator workflows.

## Evidence and scope notes

- Package inventory was obtained from all `package.json` files below the non-plane package roots. A nested test fixture manifest was excluded from the business package count.
- Test counts are package-local `*.test.ts` inventory, not proof of coverage or execution. Several contracts and business packages have no direct tests; `services/finance`, `services/integration`, and `test-utils` are notable examples.
- The aggregate `pnpm --dir server run typecheck` progressed through many packages with no diagnostics before a 60-second tool timeout. It is deliberately reported as incomplete.
- The review did not inspect or assess `server/packages/planes/**`, per scope. It only notes when a non-plane package requires plane/host composition to be available.
- External dependencies—Postgres, Redis/BullMQ, object storage, malware scanning, renderers, search, Keycloak, secret storage, AI providers and communication providers—were not exercised in this review.

## Recommended completion evidence

Before promoting a business function, require: a clean candidate build; manifest entry and OpenAPI/explicit exclusion; deployment-profile enablement; migrations applied to an existing-database upgrade path; unit and integration tests; real dependency smoke test; worker/scheduler registration proof where applicable; and legacy/client contract comparison or an approved retirement decision.
