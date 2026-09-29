# Platform host architecture and naming review

The host composes the shared Entity Framework. New entities belong in published
metadata and existing list/detail runtime bindings, not in new host applications.
This reorganization changes source ownership and launch policy; it does not publish
metadata, activate a release, or establish deployment isolation.

## Implemented layout

- `src/main.ts`: compatibility launcher using `MODE` (default `api`).
- `src/entrypoints/{api,worker,scheduler}.ts`: explicit role launchers.
- `src/entrypoints/control-api.ts`: existing isolated publication control host.
- `src/kernel/launch.ts`: environment initialization, role dispatch, fatal reporting.
- `src/kernel/bootstrap.ts`: deployment validation and composition sequencing.
- `src/kernel/container.ts`: host dependency container and its factory.
- `src/kernel/{module-registry,registration-plan}.ts`: closed module loaders and plan selection.
- `src/config/environment.ts`: host configuration parsing and validation.
- `src/config/validation.ts`: process-role validation before runtime imports.
- `src/composition/runtimes/{http,workers,scheduler}.ts`: process startup and shutdown.
- `src/composition/shared/`: entity runtime, entity governance, identity,
  publication, collaboration, document admission, AI, and verification bindings.
- `src/composition/spaces/`: existing Studio and Neon bindings, plus Mesh exchange readiness.
- `src/diagnostics/health/`: worker and scheduler heartbeat support.
- `src/diagnostics/telemetry/`: metrics listener and error collector.
- `src/development/`: development publication, graph preview, and verification delivery.

`config/index.ts` and `composition/create-container.ts` remain compatibility
exports for existing operational scripts, including scripts generated remotely.
New code imports the canonical modules. Docker's import smoke check follows the
new runtime paths without executing the entrypoints.

## Country reference flow

1. `metadata/products/shared/entities/country/definition.json` defines Country;
   its adjacent capabilities describe the published operation bindings.
2. Shared publication composition installs compiled runtime publication and
   qualification. `shared/entity-runtime/metadata.ts` reads admitted releases
   through the pinned compiled reader or the configured legacy descriptor reader.
   Compiled-only planes do not fall back to legacy metadata.
3. `register-services.ts` supplies metadata, transactions, authorization, and
   collection scopes to `shared/entity-runtime/read-runtime.ts`. That module
   constructs the standard record list executor, query service, and list service.
4. `shared/entity-runtime/read-bindings.ts` and `http-registrars.ts` register the existing record/list, views,
   references, bookmarks, and snapshot routes with explicit authentication and
   authorization dependencies. Authorization registration and parent admission
   remain server-owned; moving files does not change scope enforcement.
5. `apps/neon/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx`
   delegates to `createEntityReadPage` from the shared detail package.
   Country continues through that generic entity route and shared list/detail UI.

This is a source trace. No new Country publication or live browser verification
was performed for this naming change.

## Review findings

- Fixed: `main.ts` used `mode in MODES`, accepting inherited property names such
  as `constructor`. Role selection now accepts exactly api, worker, or scheduler
  and rejects conflicting explicit-entrypoint roles before resource creation.
- Fixed: shared entity helpers were scattered between the composition root and
  `entities/`. They now live beside their owning shared capability. Partner
  contracts and Entity Case backend mapping remain explicitly Neon-specific;
  giving those implementations generic names would misrepresent their behavior.
- Fixed: process startup used three indistinguishable exported `start` methods.
  Runtime modules now export `startHttpRuntime`, `startWorkerRuntime`, and
  `startSchedulerRuntime`; entrypoints share one launch policy.
- Remaining: `register-services.ts` (about 5,000 lines) and the compatibility
  `register-platform.ts` (about 1,200) still mix ownership. Infrastructure now
  has independently loadable resource registrars and a 59-line combined adapter
  coordinator. Shared IAM authority and trusted-device routes have been extracted.
  Existing applications and their registrations are preserved.
- Remaining: isolated Studio, Neon, and Mesh profiles are parsed but explicitly
  rejected. Folder placement does not provide independent deployability.

The proposed `kernel/lifecycle.ts`, `module-contract.ts`, `dependency-graph.ts`,
and `diagnostics/readiness/` are
not empty placeholders: they have not been added. Lifecycle and health primitives
already belong to server foundation; API readiness remains in the HTTP runtime.
A future extraction should introduce these host modules only when they own real
behavior. `register-runtimes.ts` remains the common queue/scheduler registration
and startup helper, separate from process startup.

## Validation

The pre-change host typecheck passed. The baseline suite had 87 passing files,
4 failing files, and 4 skipped files (696 passed, 11 failed, 26 skipped tests).
The existing failures are in development publication (2), BP list insights (6),
metadata/records vertical integration (2), and publication workload boundaries (1).
These failures are not evidence of a verified live Entity flow.

Use `pnpm --filter @athyper/server-platform-host typecheck`, `test`, and
`inventory:composition` to verify the host. Role selection has regression coverage
for all roles, conflicts, invalid values, and inherited JavaScript property names.

After reorganization, typecheck and the host build pass. The suite has 88 passing
files, the same 4 failing files, and 4 skipped files (706 passed, the same 11
failed, 26 skipped tests). Failure names match the recorded baseline after the
development-test relocation. Static inventory reports zero missing relative
imports and zero syntax diagnostics.

A plain Node import of the emitted runtime is not supported by this local
workspace's source-package exports: the HTTP package resolves to `src/index.ts`
and its `.js` dependency is absent. The Docker production dependency graph was
not built or validated in this review; its smoke-check paths were updated.
With the workspace TypeScript loader (`node --import tsx`), all three emitted
runtime modules import successfully and expose their expected startup functions.
This check does not start servers or connect to backing services.


## Infrastructure and identity extraction

`register-adapters.ts` now delegates to infrastructure modules for telemetry,
identity tokens, Redis cache, messaging, storage, document processing, databases,
secrets, and publication trust. Each resource registrar owns its adapter
construction and lifecycle hooks, accepts only the factory overrides it needs,
and can be imported without the combined host registrars. The combined order
and public override contract are preserved. `adapter-contract.ts` imports types
only, so sharing the factory contract does not eagerly load implementations.

`shared/identity/authority.ts` installs audit, IAM, exact-plane identity resolution,
and permission authorization without registering administration, routes, or jobs.
The combined platform registrar consumes that same authority and retains its
existing application wiring. Trusted-device routes have their own shared module.

Database resource selection is tested across all three isolated profile names
and all three roles. Review coordination may add ordinary read connections, but
worker credentials, authorization-writer pools, and invalidation listeners are
selected by served planes. Configuration filtering removes excluded workload
credentials before parsing, including legacy worker aliases. It does not mutate
the source configuration or environment.

Telemetry now owns an idempotent cleanup hook immediately after construction.
The combined registrar also places that hook last, preserving the existing LIFO
flush-before-infrastructure order. Cleanup remains registered when a later
registrar throws, which previously skipped telemetry shutdown registration.

Validation for this extraction: 25 new tests cover resource selection, database
readiness failures, cleanup, coordination credential boundaries, and host import
boundaries. The full host suite has 731 passing tests, the same 11 baseline
failures, and 26 skipped tests. Typecheck and build pass. Emitted infrastructure
and identity modules import successfully with the workspace TypeScript loader.
No metadata was republished,
profile enabled, live Entity flow verified, or deployment changed.


## Entity service and route extraction

The combined service registrar now passes explicit dependencies to four shared
modules under `composition/shared/entity-runtime/`:

- `services.ts`: query/list and mutation services, parent collection scopes,
  pinned parent/header reads, activity/history, bookmarks, and optional snapshots.
- `resources.ts`: published summaries and resources plus operation dispatch,
  sharing the admitted reader and capability policy. Callable handlers are
  supplied through an explicit factory receiving the resource service.
- `http.ts`: the existing Entity list/detail, views, references, bookmarks,
  snapshots, activity, records, published resources, and intake route bindings.
  Authentication and verified-context readers are required inputs.
- `transfers.ts`: optional transfer service, HTTP routes, import/export handlers,
  and job definitions. Import adapters, storage, scanner, job runtime, and locked
  collection scopes are explicit inputs.

The root retains compatibility choices: Studio metadata overrides, space-owned
import adapters and collection scopes, notification mutation policy, lookup
presentation callbacks, and capability handler implementations. No domain key,
API route, publication definition, or authorization fallback was renamed.
Publication qualification receives the exact query and mutation instances used
by HTTP. The callbacks for pinned reads and history remain connected to those
same services. Route ordering and existing feature gates are preserved.

The new modules do not import the host container, compatibility registrars, or
space packages. Import-boundary tests enforce that separation. This is service
and route composition extraction, not a completed isolated deployment graph.
Capability provider selection and served-plane HTTP admission remain work for
isolated host composition; the startup guard remains in place.

Validation: typecheck and build pass; emitted module imports pass with the
workspace TypeScript loader. Four new service/HTTP tests exercise standard
search, sort, pagination, tenant isolation, pinned-read authorization, existing
list/detail and mutation endpoints, and authentication denial. Parent-scope tests
verify locked predicates reach the repository separately from client filters and
that missing parents are denied before the repository list call; the in-memory
repository does not execute parent-scope SQL. Four import-boundary cases cover
the extracted modules. The full suite has 739 passing tests, the same 11 baseline
failures, and 26 skipped tests. These tests use fixture metadata, in-memory
persistence, and an injected test authentication port. No live Country
publication, identity-provider integration, or browser flow was verified.

Verification consumers follow the emitted `dist/entrypoints/{api,worker,scheduler}.js`
paths. Vitest includes both `src/**/*.test.ts` and `scripts/**/*.test.ts`, so
provisioning tests remain discovered beside their script subjects.

Publication qualification runs the complete host, Records, Experience, jobs runtime and scheduling suites
instead of retired entity-specific test filters. Required discovery sentinels and
`--passWithNoTests=false --allowOnly=false` prevent empty or focused runs from
qualifying. Preview discovery without reading DEV credentials or creating release
evidence with:

```sh
pnpm exec tsx tooling/scripts/local-dev/qualify-runtime-publication.mts --check-test-discovery
```

This checks test reachability, not percentage coverage or live deployment. Existing
host test failures must be resolved before full qualification can succeed. Isolated
Studio, Neon and Mesh deployment profiles remain blocked.
