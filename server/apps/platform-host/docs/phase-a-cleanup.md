# Platform Host Phase A implementation ledger

## Scope and baseline

Preserve the dirty working tree and existing public registrations while extracting
ownership. Do not change workspace/module catalogs, permissions, entitlements or
DDL. No tests, full builds, database changes or service restarts in this phase.

`composition-baseline.json` captures 70 composition source files and 302 static
registration candidates at the start of extraction (including the new review
coordination adapter). It is not proof of route coverage: dynamic registrations
and factory-generated handlers still require manual ownership mapping.

Recorded unresolved local imports in the legacy graph:

- `register-services.ts`: business-partner-case-authority,
  business-partner-qualification-runtime, business-partner-reveal-runtime,
  business-partner-case-runtime, business-partner-read-runtime,
  entities/business-partner-record-providers.
- `business-partner-backend-mapping.ts`: business-partner-permission-transitions.

The previous host compilation also failed on deleted package exports. Compilation
was not rerun for this baseline. No passing startup baseline is claimed.

## Implemented first boundary

- `config/deployment-profile.ts` parses MODE and HOST_DEPLOYMENT_PROFILE before
  loading host configuration/composition. Unknown profiles and role mismatches fail.
- The default `combined` profile preserves existing selection behavior. It does
  not repair legacy imports or guarantee startup.
- `studio`, `neon`, and `mesh` profile names are reserved and currently fail with
  DEPLOYMENT_PROFILE_NOT_YET_IMPLEMENTED, before configuration or adapter creation.
  They must not silently load the combined graph.
- All three process entrypoints now use `kernel/bootstrap.ts` instead of repeating
  adapters/runtimes/platform/services composition.
- Release-review wiring has an explicit cross-plane coordination adapter; it
  remains worker-only and requires both Studio and Neon databases.
- Compatibility bootstrap loads the composition graph before constructing adapters
  and attempts lifecycle cleanup if construction/registration fails.
- The launcher captures asynchronous entrypoint import failures as boot failures.
- Shared metadata publication readers now live in
  `composition/shared/entity-runtime/metadata.ts`; the existing rollout selection,
  exact-plane source, tenant transactions and caches are preserved.
- Shared list/query composition now lives in
  `composition/shared/entity-runtime/read-runtime.ts`. Existing authorization and
  collection-scope resolvers are passed through unchanged, including fail-closed
  behavior.
- `composition/shared/entity-runtime/routes.ts` independently registers list/record,
  entity views, reference choices/directory, bookmarks and snapshots from explicit
  service/security bindings. The compatibility caller preserves its BP descriptor
  override; the shared module contains no BP branch or import. Only API mode mounts
  this group (direct callers without config retain compatibility behavior).
- `loadConfig(environment)` now reads an explicit environment snapshot. Existing
  no-argument callers retain process.env defaults; helpers no longer read ambient
  environment independently. Excluded database settings are removed before parsing,
  without mutating process.env or suppressing shared/security configuration.
- `kernel/module-registry.ts` provides literal lazy loaders for shared entity modules,
  release-review coordination and compatibility services. It rejects legacy loading
  for isolated profiles and HTTP-module loading for non-API roles before importing.
- `kernel/registration-plan.ts` distinguishes served planes from database planes
  needed for release-review coordination. Database selection filters primary pools,
  job pools and invalidation listeners without mutating configuration/environment.
  Authorization-writer construction filters its pools to the plan's database planes.
  Combined mode still selects all planes, preserving compatibility.
- Studio onboarding registration is extracted unchanged in its security and data
  behavior to `composition/spaces/studio/trustiam/onb/register.ts`. Explicit API
  mode registers HTTP routes but not its job consumer; worker mode registers the
  consumer but not HTTP routes; scheduler mode does not construct its services.
  Its job-definition metadata remains available to API/worker administration.
  Direct callers without a role retain the previous compatibility behavior.

The kernel still deliberately delegates to the existing monolith. This is a
transitional boundary, not completed plane isolation. Role-specific process startup,
invalidation and shutdown behavior remain in the existing entrypoints.

Configuration selection now precedes parsing for database settings. It is not yet
complete capability-level configuration/import isolation: concrete adapter modules
still have static imports, and shared non-database adapters initialize from their
existing feature configuration. Generic HTTP registration is independent, but its
full production service/security bindings are still assembled by the compatibility
graph. Isolated profiles remain explicitly rejected until selected adapter loaders
and independent service/security composition replace that graph. No isolated plane
startup or live login restoration is claimed.

## Remaining Phase A work

The follow-up deleted-export audit and per-consumer dispositions are recorded in
`deleted-export-decisions.md` and `deleted-export-consumers.json`: 124 missing symbol
references across 12 files, including inline import types and tests. Seven stale
Neon barrel exports have been removed. Scheduler/disabled onboarding now returns
before registering its readiness dependency. These are source checks, not builds.

1. Classify inventory candidates as shared, Studio, Neon, Mesh, or coordination;
   identify API/worker/scheduler responsibilities and preserved registration keys.
2. Extract generic entity runtime registration from the BP block before deleting it.
3. Introduce explicit capability loaders and dependency planning, then implement
   isolated profiles and profile-scoped configuration/adapter construction.
4. Extract remaining plane registrations and relocate business implementations to
   their owning packages. Remove superseded BP registrations/exports/types together.
5. Consolidate folders only after ownership is stable; update deployment manifests
   when their requested isolated profiles are actually implemented.
6. Complete ownership coverage and reference checks before Phase B compilation.

## Initial ownership decisions

| Source group | Intended owner | State |
| --- | --- | --- |
| Common process registration chain | kernel bootstrap | Centralized; compatibility-only |
| Entity release review | cross-plane coordination | Wiring extracted; implementation retained |
| Studio onboarding | studio/trustiam/onb | Registrar extracted with role gates |
| Generic entity routes embedded in BP block | shared entity runtime | Pending extraction before BP deletion |
| Studio authoring | studio/entity/meta | Pending; shares graph-preview and AI state |
| Publication | shared publication plus explicit coordination | Pending; inspect remaining domain authorizer dependency |
| Atlas registration | shared AI capability | Pending; shares learning inbox with authoring |
| BP/supplier adapters | generic service owner or delete | Requires per-registration decision; not restored |
| Infrastructure factories | infrastructure by resource family | Pending profile-aware construction |

These are code ownership decisions, not changes to the published module catalog.

## Lightweight integrity tooling

From this package, `pnpm inventory:composition` prints a read-only JSON inventory:
source imports, missing local paths, registration call candidates, literal API/handler
identifiers and TypeScript parse diagnostics. It does not execute host code, compile
packages or run tests. Output can be compared against the baseline during extraction.

## Deployment compatibility

Existing MODE=api|worker|scheduler launch commands remain unchanged. Operators may
set HOST_DEPLOYMENT_PROFILE=combined explicitly; leaving it unset preserves that
selection. Do not deploy an isolated profile until the implementation ledger marks
its registrations, resource construction and configuration selection complete.
