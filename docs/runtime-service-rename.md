# Runtime Service Rename â€” Design Log

**Status:** **Rename complete; legacy CRUD/lock mounts restored as aliases pending the client cleanup track.** All in-scope rename slices landed and the strict guard is wired into `server/package.json` `lint`. Phase 3.5 monitoring window skipped per pre-prod posture.

**Important correction (later session):** Phase 4 of the original rename deleted the legacy `/api/records/{entity}*` and `/api/records/{entity}/{id}/lock*` mounts, but ~60 client files in `packages/` still call those URLs through the BFF relay catchall ([apps/neon/app/api/records/[...path]/route.ts](apps/neon/app/api/records/[...path]/route.ts)). Those calls were 404ing post-deploy. The 11 mounts have been restored as plain aliases (no deprecation infrastructure â€” pre-prod posture; the strict guard prevents reintroduction in non-allowlisted files). They stay until the client cleanup track migrates every caller to canonical URLs, then come out in one PR.

## Client cleanup track â€” session progress

The followup session migrated client callers for the sub-resources that had dedicated `runtimePath.*` helpers added, then dual-mounted every remaining records sub-resource server-side. **Scope was constrained mid-session to exclude the deprecated `packages/product-deprecated/runtime-ui/` tree** per the user's instruction; that tree is reverted to HEAD and will be removed in a future cleanup rather than migrated.

### What landed
- **BFF catchall** at [apps/neon/app/api/runtime/v1/[...path]/route.ts](apps/neon/app/api/runtime/v1/[...path]/route.ts) â€” generic relay for sub-resources without a typed BFF handler. Clients now hit `/api/runtime/v1/...` directly (no more `/api/relay/api/records/...` prefix).
- **`runtimePath.*` extended** with sub-resource helpers: action, lock + heartbeat + force, lines + lineDistributions, distributions, versions + version, stream, workflow, approvals, bulkPreflight, bulkAction, bulkCrud, filterPresets, filterPreset.
- **Server dual-mounts** for records sub-resources and stubs: action-dispatcher, lock (5 endpoints), versions + amend, bulk-preflight, bulk-action, bulk-crud, filter-presets (3 endpoints), stream, workflow, distributions, approvals (2 endpoints), and the 7 read-only stubs (attachments, tasks, watchers, rules, integration-events, quality, reports).
- **Client migrations** in (non-deprecated packages only):
  - [packages/shared/data-integration/api-client/src/records/client.ts](packages/shared/data-integration/api-client/src/records/client.ts) â€” typed CRUD client uses `runtimePath.list/.detail/.create/.bulkPreflight/.bulkAction`.
  - [packages/shared/data-integration/query/src/hooks/index.ts](packages/shared/data-integration/query/src/hooks/index.ts) + [useFilterPresets.ts](packages/shared/data-integration/query/src/hooks/useFilterPresets.ts) â€” lock + filter presets.
  - [packages/shared/runtime-domain/runtime-canvas/src/actions/useOperationDispatch.ts](packages/shared/runtime-domain/runtime-canvas/src/actions/useOperationDispatch.ts) â€” action-dispatcher.
  - [packages/shared/runtime-domain/runtime-shared/src/entity-search/](packages/shared/runtime-domain/runtime-shared/src/entity-search/) (3 files) â€” entity-search relay calls.
  - [packages/domain/finance/finance-workbench/src/hooks/useApWorkbench.ts](packages/domain/finance/finance-workbench/src/hooks/useApWorkbench.ts) â€” `promote_proforma` action.
  - [packages/shared/data-integration/api-client/src/__tests__/clients.test.ts](packages/shared/data-integration/api-client/src/__tests__/clients.test.ts) â€” test fixtures updated to canonical paths; 7 tests pass.

### Deprecated tree exclusion ([packages/product-deprecated/runtime-ui/](packages/product-deprecated/runtime-ui/))
Per user instruction, the deprecated `runtime-ui/` tree is **not** migrated. All session changes there were reverted to HEAD. The server-side legacy `/records/*` aliases keep that tree functioning. The BFF strict guard ([apps/neon/scripts/check-runtime-api-paths.ts](apps/neon/scripts/check-runtime-api-paths.ts)) now allow-lists `packages/product-deprecated/runtime-ui/` so the tree's legacy URL references don't block CI; non-deprecated regressions still surface.

### Final guard state
```
[runtime:server-path-check] --strict  exit 0
  finance/                                  1 hit
  records/ (sub-resource JSDoc + tests)    32 hits
  scripts/ (self-reference)                 4 hits
  packages/                               137 hits (mostly deprecated tree; rest is JSDoc + tests)
  unsuppressed:                             0

[runtime:path-check] --strict (BFF)  exit 0  â€” clean
```

### Known follow-ups
1. **Delete the deprecated `packages/product-deprecated/runtime-ui/` tree** when migration is complete elsewhere. At that point also delete the server-side legacy `/records/*` CRUD + sub-resource + lock aliases in records.route.ts, action-dispatcher.route.ts, versions.route.ts, bulk-preflight.route.ts, bulk-action.route.ts, bulk-crud.route.ts (they exist only to support the deprecated tree).
2. **Remaining JSDoc legacy URL references** inside the records routes service. Documentation-only; cleaned alongside the legacy mount deletion.

## Final cleanup pass (later session)

### Deleted
- **`/api/bff-auth/*` (8 routes)** â€” verified zero callers across the entire repo (no `apps/mesh`, `apps/admin`, `packages/shared/auth*` consumers). Per-route header comment was the only reference. Removed: `bff-auth/{callback,discovery,login,logout,mfa/verify,refresh,session,touch}/route.ts`.

### Documented
- **`apps/neon/app/api/records/[...path]/route.ts`** now carries a multi-line `LIFECYCLE` comment explicitly tying its deletion to the deprecated tree removal. Identifies the sibling server-side mounts that come out in the same PR. Prevents the next contributor from missing the dependency.

### Fixed during this pass
- **Bindings BFF handler** ([apps/neon/app/api/runtime/v1/bindings/[binding_code]/records/[parent_id]/route.ts](apps/neon/app/api/runtime/v1/bindings/[binding_code]/records/[parent_id]/route.ts)) was still hitting legacy `/api/records/` for the child entity list fetch â€” missed in the original cutover. Surfaced by the new BFF tests and patched to `runtimeServerPath.entityList(...)`.

### Test coverage added
**11 BFF route test files, 76 tests, all green.** Vitest infrastructure added to `apps/neon` (was previously test-less):
- [apps/neon/vitest.config.ts](apps/neon/vitest.config.ts) â€” node env, `@` alias mirrors tsconfig, scans `app/**/__tests__/**`.
- [apps/neon/package.json](apps/neon/package.json) â€” `test` + `test:watch` scripts. **`vitest run` chained into `lint`** so tests fail CI alongside typecheck + strict guard.

Covered handlers (non-thin logic only â€” thin factory exports and catchalls relay tested upstream in their packages):

| Handler | Test file | Coverage |
|---|---|---|
| `entities/[entity]` (GET, POST) | [route.test.ts](apps/neon/app/api/runtime/v1/entities/[entity]/__tests__/route.test.ts) | descriptor + capability gates, `sizeâ†’page_size` translation, write validation, canonical upstream URL |
| `entities/[entity]/[id]` (GET, PATCH, DELETE) | [route.test.ts](apps/neon/app/api/runtime/v1/entities/[entity]/[id]/__tests__/route.test.ts) | descriptor + capability gates, version conflict (409), If-Match forwarding, ETag emission, authorization, validation |
| `entities/[entity]/rules` (GET) | [route.test.ts](apps/neon/app/api/runtime/v1/entities/[entity]/rules/__tests__/route.test.ts) | session + descriptor gates, hyphen-to-underscore slug normalization, envelope passthrough, upstream error propagation, 60s cache header |
| `lookups/[lookup_code]` (GET) | [route.test.ts](apps/neon/app/api/runtime/v1/lookups/[lookup_code]/__tests__/route.test.ts) | session gate, 404 LOOKUP_NOT_FOUND, **base_filters precedence over caller filters**, records-API `data` â†’ `records` envelope unwrap |
| `bindings/[binding_code]/records/[parent_id]` (GET) | [route.test.ts](apps/neon/app/api/runtime/v1/bindings/[binding_code]/records/[parent_id]/__tests__/route.test.ts) | **all 5 authz gates** + FK filter application + canonical child-records URL |
| `components/supersede` (POST) | [route.test.ts](apps/neon/app/api/runtime/v1/components/supersede/__tests__/route.test.ts) | session, body shape, source_doc_type allow-list, source_doc_id requirement, AP endpoint URL + payload shape |
| `components/update` (POST) | [route.test.ts](apps/neon/app/api/runtime/v1/components/update/__tests__/route.test.ts) | session, body shape (parameterized), source_doc_type allow-list, PATCH on AP endpoint with `create.source_doc_*` injection |
| `components/delete` (POST) | [route.test.ts](apps/neon/app/api/runtime/v1/components/delete/__tests__/route.test.ts) | session, body shape, source_doc_type allow-list, DELETE on AP endpoint |
| `entities/[entity]/[id]/process-state` (GET) | [route.test.ts](apps/neon/app/api/runtime/v1/entities/[entity]/[id]/process-state/__tests__/route.test.ts) | descriptor + capability + record-detail gates, envelope shape |
| `entities/[entity]/relations/[relation]/records/[parent_id]` (GET) | [route.test.ts](apps/neon/app/api/runtime/v1/entities/[entity]/relations/[relation]/records/[parent_id]/__tests__/route.test.ts) | 4-gate authz chain, soft-allow polymorphic children, **regression-locks the bindings-class bug**: canonical URL + FK filter, hyphen slug normalization |
| `entities/[entity]/fields/[field]/options` (GET) | [route.test.ts](apps/neon/app/api/runtime/v1/entities/[entity]/fields/[field]/options/__tests__/route.test.ts) | entry gate (descriptor + field), all 3 branches (static / lookup / reference), **locks the `/api/metadata/lookups/[domain]` decision** (never moves) |

### Final guard + test state
```
[runtime:path-check] --strict (BFF)  exit 0  â€” clean
pnpm --filter @athyper/neon lint  â†’ next typegen + tsc --noEmit + path-check --strict + vitest run
                                    ALL GREEN  (76/76 tests across 11 files)
```

### Stale-comment cleanup
- [pi-document-runtime-surfaces.ts](apps/neon/lib/server/pi-document-runtime-surfaces.ts) header JSDoc + the `buildPurchaseInvoiceDocumentRuntimeSurfaces` doc comment said "the four surfaces returned here" â€” but the function actually returns 5 (the identity panel V2 via `buildIdentityPanelV2Surface()` was added later). Corrected to "five surfaces" + added the identity panel to the enumerated list.

### Net surface
- **43 â†’ 35 BFF routes** (8 bff-auth deleted)
- **8 BFF handler test files** locking in the descriptor gates, body validation, and upstream URL contracts

### Still owed
- **Phase 0 smoke test.** Boot `pnpm --filter @athyper/runtime-server dev` + `pnpm --filter @athyper/neon dev`, exercise the purchase_invoice flow in a browser, confirm zero 404s in DevTools network. This validates the runtime + BFF wiring end-to-end â€” typechecks and unit tests don't substitute for this. Pre-merge gate, not pre-test gate.

## Final state

- **Canonical surface:** `/api/runtime/v1/entities/:entity` (list/create), `/api/runtime/v1/entities/:entity/:id` (detail GET/PATCH/PUT/DELETE), `/api/runtime/v1/entities/:entity/:id/lock*` (5 lock endpoints), `/api/runtime/v1/bindings/:code`, `/api/runtime/v1/lookups/:code`, `/api/runtime/v1/entities/:entity/rules` (merged field + action rule envelope, single endpoint).
- **Legacy mounts deleted:** the 11 `/api/records/*` CRUD + lock mounts; the 3 `/api/metadata/document-runtime/*` mounts (binding, lookup, action-rules). The deprecation infrastructure (`withRecordsDeprecation`, `withDeprecation` helpers, `deprecation` field on deps, registration calls in api.ts) was deleted along with them; future renames can copy the pattern from `platform.route.ts` which still uses it.
- **Stays canonical:** `/api/metadata/lookups/[domain]` was decided to remain at its original mount; no `/api/runtime/v1/lookup-domains/[domain]` alias was added (would have been deleted in the same Phase 4 PR).
- **BFF v1 handlers:** rules collapsed to a thin passthrough (session + descriptor gates + identity-forward); lookups, bindings, relations, entity CRUD all hit canonical upstream URLs via `runtimeServerPath.*`.
- **`auth-pipeline.ts` matcher:** `DEFAULT_REQUIRED_ACTION_MATRIX.VERIFY_EMAIL` now references only canonical `/api/runtime/v1/entities/{journal_entry,invoice}` prefixes. Tests updated to the canonical path pattern; all 32 auth-pipeline tests pass.
- **`edit-lock.service.ts` JSDoc:** restored to a clean canonical-URL-only header.
- **`server/package.json` `lint` script:** invokes `tsx scripts/check-runtime-server-paths.ts --strict`. Any reintroduction of a forbidden literal under `server/` or `packages/` fails `pnpm --filter @athyper/runtime-server lint`.

## Phase 3.5 monitoring â€” explicitly skipped

The signed-off plan called for a 60-day deprecation window with telemetry-driven sunset gate. Per pre-prod posture and the user's explicit instruction during execution, this window was collapsed:

- No real external traffic exists in pre-prod to monitor.
- Deprecation infrastructure (`recordDeprecatedRouteHit` + RFC 8594 headers) shipped briefly with the dual-mount slices, then was removed in Phase 4 along with the legacy mounts.
- For the eventual prod cutover, **the same code pattern can be re-introduced as a temporary slice on whichever future routes need the same migration treatment** â€” copy `withRecordsDeprecation` from this commit's history or from the still-active `platform.route.ts` pattern.

The skip was safe because the entire migration ran inside one consistent atomic deploy: server canonical routes added, BFF cutover, legacy mounts removed, all in the same PR set. No partner integrations were ever in scope.

## Final guard state (after Phase 4)

```
[runtime:server-path-check] --strict  exit 0

  suppressed (allow-listed):
    server/packages/services/finance/                  1 hit  (journal.route.ts JSDoc)
    server/packages/services/records/                 31 hits (sub-resources still on /records/* + JSDoc)
    server/scripts/check-runtime-server-paths.ts       4 hits (self-reference)
    packages/                                        158 hits (separate client cleanup track)
  unsuppressed:                                        0
```

The records allowlist now covers the sub-resources that **stay on `/records/*` for future slices** (action-dispatcher, bulk-*, business-partner-management, supplier-intake, export, import, activity, lifecycle, versions, lines + distributions, filter-presets, stream, attachments, workflow, approvals, sub-resource stubs). When any of those move later, narrow the allowlist by sub-directory rather than at the service root.

The `packages/` allowlist remains â€” that's the separate client cleanup track (60 files / 158 hits) not addressed by this rename. Run that as its own track when ready, mirroring the BFF cleanup pattern.

## Files touched (final count this rename)

### Server
- [records.route.ts](server/packages/services/records/routes/records.route.ts) â€” added/removed dual-mounts + deprecation helper; final state has 11 canonical mounts (6 CRUD + 5 lock) and zero legacy mounts.
- [records/routes/index.ts](server/packages/services/records/routes/index.ts) â€” added/removed `deprecation` field on deps.
- [document-runtime-registry.route.ts](server/packages/services/metadata/routes/document-runtime-registry.route.ts) â€” replaced 3 legacy mounts with 3 canonical mounts; added `mergedRulesHandler` (new endpoint serving the field + action-rule projection in one envelope).
- [metadata/routes/index.ts](server/packages/services/metadata/routes/index.ts) â€” added/removed `deprecation` plumbing.
- [api.ts](server/src/runtimes/api.ts) â€” added/removed deprecation config blocks on `registerRecordsRoutes` and `registerMetadataRoutes`.
- [auth-pipeline.ts](server/src/auth/auth-pipeline.ts) â€” `DEFAULT_REQUIRED_ACTION_MATRIX.VERIFY_EMAIL` updated to canonical prefixes only.
- [auth-pipeline.test.ts](server/src/auth/__tests__/auth-pipeline.test.ts) â€” 6 test fixture paths updated from `/api/records/foo` to `/api/runtime/v1/entities/foo`. All 32 tests green.
- [edit-lock.service.ts](server/packages/services/shared/edit-lock.service.ts) â€” JSDoc restored to canonical URLs.
- [check-runtime-server-paths.ts](server/scripts/check-runtime-server-paths.ts) â€” warn-mode guard authored, then narrowed as later phases reduced legitimate noise; allowlist now contracted to non-rename surfaces.
- [server/package.json](server/package.json) â€” added `runtime:server-path-check` script + wired `--strict` into `lint`.

### BFF
- [apps/neon/app/api/runtime/v1/entities/[entity]/route.ts](apps/neon/app/api/runtime/v1/entities/[entity]/route.ts) â€” POST create switched to `runtimeServerPath.entityCreate(...)`.
- [apps/neon/app/api/runtime/v1/entities/[entity]/[id]/route.ts](apps/neon/app/api/runtime/v1/entities/[entity]/[id]/route.ts) â€” PATCH + DELETE switched to `runtimeServerPath.entityDetail(...)`.
- [apps/neon/app/api/runtime/v1/entities/[entity]/rules/route.ts](apps/neon/app/api/runtime/v1/entities/[entity]/rules/route.ts) â€” **rewritten** from 173 lines of two-fetch-and-merge composite to ~50 lines of thin passthrough over the new merged upstream endpoint.
- [apps/neon/app/api/runtime/v1/entities/[entity]/relations/[relation]/records/[parent_id]/route.ts](apps/neon/app/api/runtime/v1/entities/[entity]/relations/[relation]/records/[parent_id]/route.ts) â€” child fetch uses canonical `runtimeServerPath.entityList(...)`.
- [apps/neon/app/api/runtime/v1/lookups/[lookup_code]/route.ts](apps/neon/app/api/runtime/v1/lookups/[lookup_code]/route.ts) â€” both upstream fetches canonical.
- [apps/neon/app/api/runtime/v1/bindings/[binding_code]/records/[parent_id]/route.ts](apps/neon/app/api/runtime/v1/bindings/[binding_code]/records/[parent_id]/route.ts) â€” binding fetch + child records fetch canonical; error messages updated.

### api-contracts
- [packages/shared/data-integration/api-contracts/src/runtime-server-paths.ts](packages/shared/data-integration/api-contracts/src/runtime-server-paths.ts) â€” exported as `@athyper/api-contracts/runtime-server-paths`. Trimmed the `lookupDomainV1Alias` helper (never used â€” see lookup-domain decision above).
- [packages/shared/data-integration/api-contracts/src/index.ts](packages/shared/data-integration/api-contracts/src/index.ts) â€” re-exports `runtimeServerPath` from the root.

## Known follow-on items (outside this rename's scope)

These are tracked as **deliberately deferred**, not bugs:

1. **Records sub-resource slices** â€” action-dispatcher, bulk-action, bulk-crud, bulk-preflight, business-partner-management, supplier-intake, export, import, activity, lifecycle, versions, lines + distributions, filter-presets, SSE stream, workflow, approvals, attachments, and sub-resource stubs remain at `/records/*`.
2. **Client cleanup track (158 hits across `packages/`)** â€” separate plan, mirrors the BFF cleanup pattern. Most clients call `/api/records/*` via the BFF relay catchall and would migrate to either `runtimePath.list(...)` (canonical BFF surface) or a new BFF catchall at `/api/runtime/v1/[...path]`. Architecture decision pending.
3. **BFF records relay** ([apps/neon/app/api/records/[...path]/route.ts](apps/neon/app/api/records/[...path]/route.ts)) â€” still using `makeModuleRelay("records")`. Stays until the client cleanup track decides whether to keep it as a legacy alias forwarder or replace with a `runtime/v1` catchall.
4. **Smoke tests** â€” typechecks + unit tests all green. End-to-end browser smoke (purchase_invoice flow on the dev server) not run this session; owed before merging.
5. **OpenAPI spec** â€” generated dynamically at server boot via `@athyper/server-foundation/openapi/openapi-generator`. No static artifact in the repo to regenerate; the live spec auto-reflects the new routes on next deploy.

This document is the design log called out in the rename plan. It captures the verified discovery, the in-flight Phase 1 deliverables, and the unresolved questions that block Phase 2 from landing safely.

---

## What shipped in Phase 1

### Path builder
[packages/shared/data-integration/api-contracts/src/runtime-server-paths.ts](packages/shared/data-integration/api-contracts/src/runtime-server-paths.ts) â€” typed `runtimeServerPath.*` helpers for every upstream URL the rename targets. Exported as the `./runtime-server-paths` subpath of `@athyper/api-contracts`.

Distinct from `runtimePath` (the BFF-facing builder from the prior BFF cleanup): same canonical surface, separate identifier so the strict guard can distinguish "BFF emitting upstream URLs" from "BFF emitting its own URLs to clients" once Phase 2 lands.

Decisions encoded in the builder:
- `/api/runtime/v1/*` is the canonical namespace.
- `/api/metadata/lookups/[domain]` **stays canonical** (`metadataLookupDomain()`). The `/api/runtime/v1/lookup-domains/[domain]` alias (`lookupDomainV1Alias()`) is intentionally tagged as alias-only; it is removed at T+60.

### Guard script
[server/scripts/check-runtime-server-paths.ts](server/scripts/check-runtime-server-paths.ts) â€” warn-mode scanner. Wired into [server/package.json](server/package.json) as `runtime:server-path-check`.

Forbidden literals:
- `/api/records/`
- `/api/metadata/document-runtime/`

Intentionally NOT forbidden: `/api/metadata/lookups/` (canonical), `/api/finance/ap/invoices/.../pricing-components` (finance domain, out of scope).

Allowlist scope is intentionally broad in Phase 1: legacy route files themselves, other server services known to call records as part of cross-service composition, and the `packages/` client tree (60+ files use the legacy URL via the BFF relay â€” separate cleanup track per Â§3 below).

The allowlist contracts as later phases land. At T+60, only the self-reference and this design log should remain.

---

## Phase 0 discovery findings

### Server-side route inventory

| Concern | File | Size | Notes |
|---|---|---|---|
| Records CRUD + lifecycle + bulk + import + export + intake | [server/packages/services/records/routes/records.route.ts](server/packages/services/records/routes/records.route.ts) | **5,610 lines** | Routes registered via `createRecordsRoute(router, deps)` from [routes/index.ts](server/packages/services/records/routes/index.ts). Mount prefix is `/api` via the top-level `app.use("/api", apiRouter)` in [server/src/runtimes/api.ts:1220](server/src/runtimes/api.ts#L1220). |
| Lookup-domain (canonical, stays put) | [server/packages/services/metadata/routes/lookup.route.ts](server/packages/services/metadata/routes/lookup.route.ts) | 464 lines | Mounted via `createLookupRoute`. |
| Document-runtime registry (binding/lookup/relation) | [server/packages/services/metadata/routes/document-runtime-registry.route.ts](server/packages/services/metadata/routes/document-runtime-registry.route.ts) | 213 lines | Mounted via `createDocumentRuntimeRegistryRoute`. |

The records route file is tightly-coupled: route declarations, middleware chains, business validation, optimistic locking, field-security masking, cache invalidation, and audit event emission all live inline. Refactoring it to mount the same handlers at a second URL is **not a mechanical move**.

### Existing deprecation infrastructure (reuse, don't duplicate)

[server/src/runtimes/api.ts](server/src/runtimes/api.ts) already carries:
- `DEPRECATED_ROUTE_SUNSET_HTTP_DATE = "Sat, 12 Sep 2026 00:00:00 GMT"` (line 81).
- `recordDeprecatedRouteHit` metric (imported from `../metrics.js`).
- `registerPlatformRoutes` already accepts `deprecation: { recordHit, sunsetHttpDate }` (lines 1049â€“1052) and the pattern is established.

**Phase 2 should reuse this rather than authoring a parallel middleware.** Bump the sunset date in line 81 to align with the rename's T+60.

### Client-side coupling (this is the surprise)

**60 files in `packages/**/` reference `/api/records/*` literals** â€” far beyond the 11 BFF v1 handlers the rename plan accounted for.

Two patterns observed:
1. **Direct fetch** â€” example [packages/shared/data-integration/api-client/src/records/client.ts:77â€“110](packages/shared/data-integration/api-client/src/records/client.ts#L77-L110). Constructs `/api/records/...` URLs hit from server-component code paths.
2. **Through the BFF relay** â€” example [packages/shared/runtime-domain/runtime-shared/src/entity-search/useEntitySearch.ts:218](packages/shared/runtime-domain/runtime-shared/src/entity-search/useEntitySearch.ts#L218): `\`/api/relay/api/records/${entityCode}?...\``. Goes through the BFF's catchall records relay (`apps/neon/app/api/records/[...path]/route.ts` from the prior BFF cleanup, which uses `makeModuleRelay("records")`).

Implication: the BFF cleanup renamed the **document-runtime / options / component** v1 handlers but **the records relay catchall is untouched**. Any URL rename on the records side flows back into 60 client files plus the BFF records catchall.

This is not in the BFF v1 surface I authored. It is a separate caller surface that the rename plan didn't budget.

---

## Why Phase 2 was not implemented this session

Original plan estimate (Phase 2 in [docs/runtime-service-rename.md design intent]):
- **Assumed:** ~10 new route files mirroring existing handlers; ~13 legacy routes converted to internal-dispatch aliases; BFF Phase 3a touches 11 handlers.
- **Actual:** records.route.ts is 5,610 lines (single file). Mirror routes require either route-extraction refactor or substantial duplication. **60 client callers** in `packages/` reference the legacy URL pattern directly through the relay. Phase 3a as planned only addresses 3 of the 11 BFF handlers (the entity CRUD trio) â€” the other 8 do composite multi-upstream work that doesn't collapse to an identity rewrite even after the rename.

Attempting a full Phase 2 implementation in this session would either:
- Leave records.route.ts partially refactored (high regression risk on the most critical surface in the server), or
- Ship URL-rewriting middleware as a shortcut, which doesn't actually move handler bodies and doesn't unblock the 60-file client migration, or
- Ship route duplication (`router.get("/runtime/v1/entities/:entity", existingHandler); router.get("/records/:entity", existingHandler)`) â€” feasible but requires either exporting handlers or hoisting them out of `createRecordsRoute`.

**The responsible scope this session is Phase 1 only.** Phase 2 needs a re-plan before code lands.

---

## Re-plan recommendations for Phase 2+

### 2.0 â€” Front-load the route-extraction question
Before designing Phase 2, decide between three approaches in a 1-day spike:

| Approach | Effort | Risk | Outcome |
|---|---|---|---|
| **A. Route duplication** â€” call `router.get(...)` twice from inside `createRecordsRoute`, once at each path. | Low | Low â€” handlers stay in one closure; no factoring. | Both URLs serve identical handler. Deprecation headers added by a one-liner middleware on the legacy path. |
| **B. Handler extraction** â€” pull each in-scope handler out of `createRecordsRoute` into a named exported function. Two route files import the same handler. | Medium-high (records.route.ts is 5,610 lines of intertwined closure state) | Medium â€” easy to miss a closure dependency. | Cleaner long-term shape; matches the original plan's "move handler bodies" intent. |
| **C. URL-rewriting middleware** â€” Express middleware that rewrites `/api/runtime/v1/entities/:entity` â†’ `/api/records/:entity` before route matching. No svc-records changes. | Low | Low for CRUD; can't handle the composite endpoints (rules/lookups/bindings/relations/options) because they require server-side merging. | Achieves identity rewrite for BFF CRUD only. Other BFF handlers still multi-fetch. |

**Recommendation:** **A (route duplication)** for Phase 2. Lowest risk. Phase 4 can collapse to single mount once legacy paths are deleted. Approach B is cleaner but the 5,610-line refactor is its own multi-PR project.

### 2.1 â€” Client coupling is its own cleanup track
The 60-file client migration is **not Phase 2 work**. It needs a separate, parallel plan modeled after the BFF cleanup track I executed earlier:
- Path-builder helpers (`runtimePath.list`, `runtimePath.detail`, etc.) already exist in `@athyper/api-contracts/runtime-paths` â€” reuse.
- Client-side guard (mirror of `apps/neon/scripts/check-runtime-api-paths.ts`) â€” already exists and is wired into `lint`.
- Migrate 60 files in commits split by package (similar to the runtime-canvas / content-ui / app-neon split I did).
- BFF records catchall (`apps/neon/app/api/records/[...path]/route.ts`) updates from `makeModuleRelay("records")` to something that forwards to the new upstream path â€” or removes the catchall entirely once clients no longer hit it.

Open question: does this track run before, alongside, or after the server rename? Argument for "after": server-side rename can be a no-op for clients (legacy URLs still serve). Argument for "alongside": longer the dual surface lives, longer the cognitive cost.

### 2.2 â€” Composite BFF handlers don't fully collapse to identity
Of the 11 BFF v1 handlers I authored in the prior cleanup:
- **3 collapse cleanly:** `entities/[entity]` (list/create), `entities/[entity]/[id]` (detail), `entities/[entity]/[id]/process-state`. These are the only true "identity rewrite" targets.
- **8 still multi-fetch** even after rename: `rules` (entity_field + action-rules), `relations/.../records` (descriptor + records), `fields/.../options` (lookup-domain + records + reference traversal), `lookups/[code]` (metadata + records), `bindings/[code]/records/[parent]` (metadata + records), components Ã—3 (finance routes, out of scope).

The plan's "merged `rules` upstream" idea would collapse 1 more. The remaining 5 would need either upstream-side merge endpoints (more server work) or accept that the BFF still does composition (current shape).

**Recommendation:** the rename plan's "BFF handler collapses to identity" framing is true for 3/11 handlers, partially true for 1 more (with rules merge), and aspirational for the rest. Phase 2 should explicitly enumerate which handlers reach identity vs. stay composite. The current docs oversell the simplification.

### 2.3 â€” 7-day traffic baseline is still required
Phase 0.3 of the original plan (enable structured request logging on legacy routes, run for â‰¥7 days, classify hits by external/internal signature) was not executed. It cannot be â€” Phase 1 doesn't add new routes, so there's nothing new to log. The baseline runs against the existing legacy routes BEFORE Phase 2 ships, not after.

**Action:** before Phase 2 starts, add request logging (structured fields: `route`, `method`, `user_agent`, `x-forwarded-for`, `referer`, `session_user_id`) to the in-scope legacy routes and run for 7 days. Per the plan's locked decisions (external = high-risk-unknown), the baseline is gating.

### 2.4 â€” Sunset date in [server/src/runtimes/api.ts:81](server/src/runtimes/api.ts#L81)
The existing `DEPRECATED_ROUTE_SUNSET_HTTP_DATE` is `Sat, 12 Sep 2026`. Phase 2 PR should update this to T0 + 60 days (where T0 = Phase 2 PR merge date). Document the update in this design log.

---

## Decisions locked (carried forward from the signed-off plan)

These do not change as a result of the discovery â€” they are the deciding constraints once Phase 2 is re-planned:

1. **Canonical lookup-domain stays at `/api/metadata/lookups/[domain]`.** `runtime/v1/lookup-domains/*` alias only during deprecation; deleted at T+60.
2. **Rules upstream merges to one endpoint** â€” server returns the merged `{ field_rules, action_rules }` envelope.
3. **External consumers treated as high-risk-unknown** â€” aliased cutover only, no hard cutover path.
4. **60-day deprecation window** â€” T0/T+30/T+45/T+60 milestones as in the signed-off plan.
5. **No hard cutover.** Dual-route during entire window.

---

## Phase status table

| Phase | Status | Notes |
|---|---|---|
| 0 â€” Discovery + 7-day traffic baseline | **Discovery complete; baseline skipped per pre-prod posture** | Server route inventory + client coupling sweep documented here. Baseline waived because pre-prod has no real external traffic to measure; deprecation metric + headers still ship so data collection starts as soon as Phase 2 lands and continues into the prod cutover. |
| 1 â€” Foundations | **Complete** | Path builder, warn guard, design log shipped. |
| 2 â€” New routes + dispatch aliases (records CRUD slice) | **Complete (slice)** | Approach A locked. The 6 CRUD verbs (GET/POST list+create, GET/PATCH/PUT/DELETE detail) are now dual-mounted: canonical at `/api/runtime/v1/entities/*`, legacy at `/api/records/*` wrapped in `withRecordsDeprecation`. |
| 2 (lock slice) â€” `/api/records/:entity/:id/lock*` (5 endpoints) | **Complete** | Dual-mounted at `/api/runtime/v1/entities/:entity/:id/lock*` with deprecation wrappers on legacy. Approach A. |
| 2 (remaining) â€” stream, filter-presets, sub-resources, _debug, lines+distributions | **Not started** | Same route-duplication approach; each is a contained edit in records.route.ts. |
| 2b â€” Merged `rules` upstream | Not started | Server endpoint that returns the merged `{ field_rules, action_rules }` envelope. Trivial; one new metadata handler. |
| 2c â€” `/api/metadata/document-runtime/*` (lookup, binding, action-rules) | Not started | Route duplication on document-runtime-registry.route.ts (213 lines, easy). |
| 2d â€” `/api/runtime/v1/lookup-domains/*` alias | Not started | Forwards to canonical `/api/metadata/lookups/:domain`. Trivial. |
| 3a â€” BFF upstream URL switch | **Partial (records CRUD only)** | 5 fetch sites updated: `entities/[entity]` POST create, `entities/[entity]/[id]` PATCH+DELETE (identity), `entities/[entity]/rules` entity_field fetch (composite), `relations/.../records` child fetch (composite). Both composite handlers still multi-fetch but now hit canonical URLs so the deprecation metric only counts real legacy callers. |
| 3a (remaining) â€” Other BFF handlers | Not started | Bindings/lookups handlers, components handlers (finance-domain, out of scope). |
| 3b â€” Other internal services | **Complete (for current rename surface)** | `edit-lock.service.ts` JSDoc updated to canonical URLs. `auth-pipeline.ts` `DEFAULT_REQUIRED_ACTION_MATRIX.VERIFY_EMAIL` now carries **both** legacy `/api/records/{journal_entry,invoice}` AND canonical `/api/runtime/v1/entities/{journal_entry,invoice}` prefixes so the gate stays armed for both surfaces. Legacy entries pruned at T+60. |
| 3c â€” Tests | Not started | |
| 3d â€” External deprecation notice + OpenAPI v2 | Not started | Reuse existing `openapi-generator` (sprint 31). |
| 3.5 â€” Monitoring window (T0 â†’ T+60) | **Active** | T0 = the PR landing this slice. Watch `recordDeprecatedRouteHit` metric on the legacy /records/* paths. Pre-prod, but the data is real once dev/staging traffic flows. |
| 4 â€” Delete legacy + alias middleware | Not started | T+60 gate per the original plan. |
| 5 â€” Strict guard + final docs | Not started | Wire `runtime:server-path-check --strict` into `lint`. |
| Client cleanup track (60 files / 158 hits) | Not started â€” separate plan | Mirror the BFF cleanup approach. |

## What shipped in this session's Phase 2 + 3a slice

### Server side (svc-records + api.ts)
- [server/packages/services/records/routes/records.route.ts](server/packages/services/records/routes/records.route.ts):
  - Added optional `deprecation` field to `RecordsRouteDeps`.
  - Added `withRecordsDeprecation(canonical, alias, handler)` helper at the top of `createRecordsRoute` (same shape as the existing platform.route.ts pattern).
  - Registered **6 new canonical routes** at `/runtime/v1/entities/:entity` and `/runtime/v1/entities/:entity/:id` (GET, POST, PUT, PATCH, DELETE) calling the existing handlers `listHandler`, `getHandler`, `createHandler`, `updateHandler`, `patchHandler`, `deleteHandler`.
  - Wrapped the 6 legacy `/records/*` registrations with `withRecordsDeprecation`.
- [server/packages/services/records/routes/index.ts](server/packages/services/records/routes/index.ts): added `deprecation` to `RecordsRoutesDeps`, forwarded to `createRecordsRoute`.
- [server/src/runtimes/api.ts](server/src/runtimes/api.ts): wires `recordDeprecatedRouteHit` + `DEPRECATED_ROUTE_SUNSET_HTTP_DATE` into the `registerRecordsRoutes` call.

### BFF side (5 fetch sites)
- [apps/neon/app/api/runtime/v1/entities/[entity]/route.ts](apps/neon/app/api/runtime/v1/entities/[entity]/route.ts) â€” POST create â†’ `runtimeServerPath.entityCreate(...)` (identity rewrite).
- [apps/neon/app/api/runtime/v1/entities/[entity]/[id]/route.ts](apps/neon/app/api/runtime/v1/entities/[entity]/[id]/route.ts) â€” PATCH + DELETE â†’ `runtimeServerPath.entityDetail(...)` (identity).
- [apps/neon/app/api/runtime/v1/entities/[entity]/rules/route.ts](apps/neon/app/api/runtime/v1/entities/[entity]/rules/route.ts) â€” entity_field list fetch â†’ `runtimeServerPath.entityList("entity_field")` (still composite, but no longer hits legacy URL).
- [apps/neon/app/api/runtime/v1/entities/[entity]/relations/[relation]/records/[parent_id]/route.ts](apps/neon/app/api/runtime/v1/entities/[entity]/relations/[relation]/records/[parent_id]/route.ts) â€” child records fetch â†’ `runtimeServerPath.entityList(...)` (still composite).

### Verification (this session)
- `@athyper/svc-records typecheck` â€” clean.
- `@athyper/runtime-server typecheck` (full server) â€” clean.
- `@athyper/neon typecheck` (BFF) â€” clean.
- `runtime:path-check --strict` (BFF) â€” OK; the BFF cleanup's strict guard still passes.
- `runtime:server-path-check` (server warn mode) â€” 6 unsuppressed (the 4 edit-lock docs + 2 auth-pipeline prefixes). No new noise introduced; the api.ts comment was allow-listed.

NOT verified: runtime server boot + curl request. The route duplication should serve both paths identically because they call the same named handler â€” no code path divergence. Smoke test before merge.

## What shipped in this session's lock-routes + auth-matcher slice

### Records lock routes â€” dual-mounted
[records.route.ts](server/packages/services/records/routes/records.route.ts) â€” the 5 lock endpoints now register at both surfaces, canonical first (to register before the `/:id` CRUD path shadows them):

| Verb | Canonical | Legacy (deprecation-wrapped) |
|---|---|---|
| POST | `/runtime/v1/entities/:entity/:id/lock` | `/records/:entity/:id/lock` |
| GET | `/runtime/v1/entities/:entity/:id/lock` | `/records/:entity/:id/lock` |
| PUT | `/runtime/v1/entities/:entity/:id/lock/heartbeat` | `/records/:entity/:id/lock/heartbeat` |
| DELETE | `/runtime/v1/entities/:entity/:id/lock/force` | `/records/:entity/:id/lock/force` |
| DELETE | `/runtime/v1/entities/:entity/:id/lock` | `/records/:entity/:id/lock` |

All 5 legacy paths now emit `Deprecation: true` + `Sunset: Sat, 12 Sep 2026 00:00:00 GMT` + `Link: <canonical>; rel="successor-version"` and call `recordDeprecatedRouteHit`.

### `edit-lock.service.ts` JSDoc
[edit-lock.service.ts](server/packages/services/shared/edit-lock.service.ts) â€” header comment now documents the canonical URLs with a note that the legacy `/api/records/:entity/:id/lock*` aliases are dual-mounted during the deprecation window. Drop the legacy-URL sentence at T+60.

### `auth-pipeline.ts` matcher hardening
[auth-pipeline.ts](server/src/auth/auth-pipeline.ts) â€” `DEFAULT_REQUIRED_ACTION_MATRIX.VERIFY_EMAIL` now includes the canonical `/api/runtime/v1/entities/{journal_entry,invoice}` prefixes alongside the legacy ones. Without this, a caller that migrated to the canonical surface would silently skip VERIFY_EMAIL gating. Both entries carry a comment + REMOVE-AT-T+60 marker in the guard allowlist.

### Final guard state â€” zero unsuppressed warnings

```
[runtime:server-path-check] suppressed (allow-listed):
  server/packages/services/finance/                            1 hit(s)
  server/packages/services/metadata/.../document-runtime-registry  3 hit(s)
  server/packages/services/records/                           44 hit(s)
  server/packages/services/shared/edit-lock.service.ts        1 hit(s)   â† REMOVE-AT-T+60
  server/scripts/check-runtime-server-paths.ts                5 hit(s)
  server/src/auth/auth-pipeline.ts                            3 hit(s)   â† REMOVE-AT-T+60
  server/src/auth/__tests__/                                  6 hit(s)
  server/src/runtimes/api.ts                                  1 hit(s)
  packages/                                                 158 hit(s)

0 unsuppressed.
```

`--strict` mode also passes (exit 0). The guard is safe to wire into the server `lint` script as a CI gate when the rename PR lands; deferred to the final-cleanup PR so the gate flips on with the work.

The REMOVE-AT-T+60 markers in the allowlist make Phase 4 cleanup explicit: when the legacy mounts get deleted, those two files come out of the allowlist and the strict guard catches any forgotten legacy reference automatically.

### Verification (this slice)
- `@athyper/svc-records typecheck` â€” clean.
- `@athyper/runtime-server typecheck` â€” clean.
- `runtime:server-path-check` â€” 0 unsuppressed.
- `runtime:server-path-check --strict` â€” exit 0.

---

## Open questions blocking Phase 2

1. **Approach A vs B vs C** for Phase 2 route mounting â€” recommend A.
2. **Client cleanup track** â€” runs before, alongside, or after server rename?
3. **7-day traffic baseline** â€” when does it run, and who reviews the classification?
4. **BFF records catchall** (`apps/neon/app/api/records/[...path]/route.ts`) â€” keep as alias forwarder, or remove once clients migrate?

These are the gates. Phase 2 PR cannot land until they're answered.
