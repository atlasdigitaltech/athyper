# Country and Principal entity routes: code review (round 3)

Date: 2026-09-30, snapshot taken at 11:56 +08. Scope: the shared Entity
Framework path serving these routes on Neon, Mesh and Studio:

- `/app/entity/country` and `/app/entity/country/01a0d433-806b-7874-862d-49a9b955f6a1`
- `/app/entity/principal` and `/app/entity/principal/cca94907-7519-5871-8e3c-6b11aa545c93`

The review used the static dependency inventory in
`/tmp/entity-route-inventory` (1,141 files plus 35 server-host files). It builds
on [the earlier Country review](country-route-code-review-20260930.md) and
[its resolution note](country-route-audit-resolution-20260930.md). Earlier
findings are not repeated here; they are listed in
[Status of earlier findings](#status-of-earlier-findings) with their current
state.

## Method and limits

- **Static review only.** The review read the code at HEAD `adb15e4b5` plus the
  uncommitted working tree. Nothing was built, deployed, published or run in a
  browser. No database state was checked. Dev databases are not
  runner-managed, so live RLS may differ from the repository DDL.
- **The tree kept changing during the review.** Another session edited and
  committed files while this review ran. For example, `adb15e4b5` landed, and
  `list-pagination.tsx` and `ListChrome` props changed between two reads. Line
  numbers are from the 11:56 snapshot and may drift.
- **Uneven depth.** Line by line: the route adapters, the read surface, detail
  runtime and workspace, related sections, list navigation, pagination and
  retained-row changes, and the Neon, Mesh and Studio shells. On the server:
  the detail read, the query service, owner access, the published tenant
  authorizer, read evidence, list routes, choice resolvers, and the Principal
  metadata and RLS. The remaining inventory (AI, finance, notifications,
  publication, auth routes) was covered only by pattern scans. It is not
  certified clean.
- **Confidence labels.** **Confirmed** means the code path was traced end to
  end in source. **Plausible** means the defect depends on runtime state that
  was not exercised.
- **No entity-specific fixes.** Every recommended fix belongs in the shared
  framework or in metadata, as `AGENTS.md` requires.

## Route integration (verified)

All three apps route through
`app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx`, then
`createEntityReadRoute` →
[`resolveEntityReadRoute`](../../packages/contracts/platform/entity-runtime/src/routes/entity-read-route.ts) →
[`EntityReadSurface`](../../packages/platform/entity/runtime/form-detail/src/entity-read-surface.tsx).
The surface picks the list or detail runtime. Neon also wraps record routes in
`NeonWorkContextGate`. Detail now loads through one call,
`GET /api/entity-runtime/:entityCode/records/:recordId/detail` (uncommitted),
which reaches `compileDetail` →
`RecordQueryService.getWithProjection`. The endpoint is allowlisted in the BFF
relay.

Principal is a read-only, owner-access entity. The owner field is `id` and the
administer permission is `common.identity.principal.administer`. Its read goes
through the new owner profile in
[published-tenant-authorizer.ts](../../server/packages/services/records/src/published-tenant-authorizer.ts).
For non-administrators, `scopeRecordOwnerRead` adds an `id = principal`
predicate on top of the `principal_self_read` RLS policy. Administrators get the
`entity_owner_admin_read` policy through the transaction-local
`app.entity_owner_access` marker. That policy is identical on all three planes.
The compiler retargets the Studio-authored permission and scope bindings to
each plane (`targetTableEntityGraph`), so Principal is served on Neon and Mesh
too.

## Priority summary (new findings)

| # | Severity | Dimension | Finding |
| --- | --- | --- | --- |
| 1.1 | High | Bug (regression) | Embedded related lists silently swallow every non-record navigation, including data operations, page actions and non-`/app/entity` record routes |
| 1.2 | Medium | Bug | Studio has no `/operations/data-transfers` route, but the shared data-operations dialog links there |
| 1.3 | Medium | Bug | On Neon, a business-context failure blocks tenant-scoped record pages such as Country and Principal, and the error offers no retry |
| 1.4 | Medium | Bug | While rows are retained during a reload, column filters are built from the previous query's filters and can drop a pending change |
| 2.1 | Medium | Improvement | The consolidated detail read still authorizes `read` twice, with an extra existence round-trip |
| 2.2 | Medium | Improvement | Related sections still use two reads per record and probe create permission by compiling a form descriptor |
| 7.1 | Medium | Generalization | Work-context gating is hard-coded per app and page instead of being derived from the entity descriptor |
| 8.1 | Medium | Localization | Principal has no localization file: every label renders in English in ms/ar, and enum labels read "Jit" and "Api" |

---

## Dimension 1 — Bug fixes

| ID | Status | Location | Finding | Fix |
| --- | --- | --- | --- | --- |
| 1.1 | Confirmed (regression in the uncommitted tree) | [entity-navigation.tsx](../../packages/platform/entity/runtime/list-view/src/entity-navigation.tsx), [related-entity-section.tsx:261](../../packages/platform/entity/runtime/form-detail/src/related-entity-section.tsx#L261), [data-operations.tsx:34-35, 106](../../packages/platform/entity/runtime/list-view/src/data-operations.tsx#L34) | `EntityListRuntime` now installs `props.onNavigate` as the `EntityNavigationProvider` handler. Every `EntityLink` and `useEntityNavigate()` in the list, including data operations, page actions, the row menu and `EntityNavigation`, routes through that handler. `RelatedRecordList` passes a handler that acts only on `/app/entity/<target>/<36-char id>` and ignores everything else. `ListChrome` also renders in `contentOnly` mode. As a result, in an embedded list (for example the Principal **Notifications** section), "Import from file", "View imports and exports" and page actions do nothing. A record route built from a server `detailRouteTemplate` that is not under `/app/entity` is also dropped. Before this change these paths used `window.location.assign` and worked. | Separate "open this record" from "navigate". Give the list an `onOpenRecord(row)` callback for embedding. Keep `onNavigate` as general application navigation that inherits the parent's handler, so unhandled targets fall through to it. Add a browser test covering an embedded list's data-operations link. |
| 1.2 | Confirmed (static) | [data-operations.tsx:17, 123](../../packages/platform/entity/runtime/list-view/src/data-operations.tsx#L17) | `transferActivityHref = "/operations/data-transfers"` and `guidedImportHref` point to routes that exist only in `apps/neon` and `apps/mesh`. `apps/studio` has no `operations/` segment. On Studio, the Country or Principal list → Data operations → "View imports and exports" leads to a 404. With the new client-side navigation, the 404 renders inside the shell. | Resolve the transfer workspace from the published route catalog or the list descriptor (the server already builds `dataOperations`), and hide the links when a plane has no route. This supersedes earlier D7-5. |
| 1.3 | Confirmed (static) | [neon page.tsx:12](../../apps/neon/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx#L12), [neon shell index.tsx:562-574](../../packages/planes/neon/shell/src/index.tsx#L562-L574) | Every Neon record route waits for `NeonWorkContextGate`. Country and Principal are tenant-scoped and do not use the business context. Even so, when that context fails, the record page is replaced by `<p role="alert">Business context is unavailable. Try again.</p>`. That message offers no retry control, and the shell's own retry is the only way out. | Gate only descriptors that declare a required work context (see 7.1). When gating, reuse `ErrorSurface` with `reset` bound to the work-context `retry`. |
| 1.4 | Plausible | [list-view index.tsx:1472-1481](../../packages/platform/entity/runtime/list-view/src/index.tsx#L1472-L1481), [index.tsx:4733, 4801](../../packages/platform/entity/runtime/list-view/src/index.tsx#L4801) | With retained rows, `EntityRows` gets `filters={pageState?.filters ?? state.filters}`. `ColumnFilter` then applies `[...filters.filter(f => f.field !== key), ...next]`. If the user applies a column filter while an earlier change is still loading, the new state is built from the previous page's filters and the pending change is lost. `group` and `query` also have no `state` fallback, unlike `filters` and `sort`. | Show `pageState` values but build mutations from `state`. Pass both, or pass a `displayedFilters` prop for rendering only. |
| 1.5 | Plausible | [neon shell index.tsx:622-626, 785](../../packages/planes/neon/shell/src/index.tsx#L622) | The new `if (work.status !== "ready") return;` runs after `setCatalog(undefined)`, so while work context is in `error` the organization provider reports `"loading"` indefinitely rather than `"error"`. | Set an explicit blocked or error state when `work.status === "error"`. |
| 1.6 | Confirmed (static) | [query-service.ts:361-362](../../server/packages/services/records/src/query-service.ts#L361) vs [record-id.ts](../../packages/contracts/platform/entity-runtime/src/validation/record-id.ts) | `record-id.ts` says the browser and server "accept exactly the same values", but the query service uses a stricter UUID regex (version `[1-8]`, variant `[89ab]`). Directory-scoped entities read details through `recordIds`, so a route-valid ID returns 400 `INVALID_RECORD_IDS` there and 404 elsewhere. | Use `isEntityRecordId` in the query service. |
| 1.7 | Confirmed | [record-owner-access.ts:111](../../server/packages/services/records/src/record-owner-access.ts#L111) | `scopeRecordOwnerRead` throws a plain `Error("ENTITY_OWNER_SCOPE_INVALID")`, so the fault reaches clients as an untyped 500. | Throw `RecordServiceError(500, "ENTITY_OWNER_SCOPE_INVALID", …)`, as the rest of the module does. |

## Dimension 2 — Improvements

| ID | Location | Finding | Recommendation |
| --- | --- | --- | --- |
| 2.1 | [entity-list-service.ts:150-180](../../server/packages/services/records/src/entity-list-service.ts#L150-L180) | `compileDetail` calls `getWithProjection`, which already authorizes `read` for the record. It then calls `requireOperation(read, recordId)` again, and for an `existing` target the authorizer runs `exists()`: another transaction, owner-access check and repository read. The `stage("metadata")` timing also includes the record read, and the 503 guard appears twice. | Treat the admitted projection as the read authorization. Keep `requireOperation` only for the no-record descriptor path. Relabel the timing stages. |
| 2.2 | [related-entity-section.tsx:106, 115-118, 212](../../packages/platform/entity/runtime/form-detail/src/related-entity-section.tsx#L115) | `RelatedSingleRecord` still sends `detail` and `record` separately rather than using the new `detailRead`. Both related components infer "can create" by compiling a full form descriptor, and any failure, such as a network error or 500, counts as "not allowed". Opening one Principal record triggers the detail read plus two list reads, two record reads and two form probes. | Publish per-relationship capabilities (`create`, `edit`) in the detail descriptor, and use `requestDetail` or `detailRead` for the single-record case. |
| 2.3 | Principal list | For non-administrators the owner predicate returns exactly the caller's row. The page still shows full collection chrome: search, filters, grouping, exact count, export and saved views. | Expose the owner scope in the list descriptor (for example `recordScope: "self"`) so the framework can show a scoped notice, or open the single record for every owner-scoped entity. |
| 2.4 | [entity-list-routes.ts:148](../../server/packages/services/records/src/entity-list-routes.ts#L148), [bff-relay index.ts:134](../../packages/platform/gateway/bff-relay/src/index.ts#L134) | Earlier D2-9 still applies and now covers every read route and the detail read. Stage timings are set on each response and forwarded to browsers. | Gate this behind a diagnostics setting. |
| 2.5 | [26_entity_owner_access.sql](../../server/db/ddl/planes/studio/master/26_entity_owner_access.sql) | `fn_entity_owner_admin_access` parses the `app.entity_owner_access` JSON setting five times for each row it checks. | Read it once into a `jsonb` local (plpgsql) or in a single subselect. |

## Dimension 3 — Coding standards

| ID | Location | Finding |
| --- | --- | --- |
| 3.1 | [ports.ts](../../server/packages/contracts/records/src/ports.ts), `compileDetail` | `getWithProjection?` is optional on the public `RecordQueryService` port, which forces two paths in `compileDetail`. The only implementation provides it. Make it required, or keep it on an internal interface. |
| 3.2 | [entity-runtime index.ts:73-85](../../packages/contracts/platform/entity-runtime/src/index.ts#L73) | `EntityDetailReadV1` and `parseEntityDetailRead` are defined inline in the barrel. Move them to `detail-read.ts`, as the other contracts are. |
| 3.3 | [neon page.tsx](../../apps/neon/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx) | The page reads `view.props.recordId` from a rendered React element, which couples the app to the adapter's element shape. Add an optional `wrapRecord` to `createEntityReadRoute`, or resolve the route first with `resolveEntityReadRoute`, so all three apps stay one-line adapters. |
| 3.4 | [studio navigation.ts:1](../../packages/planes/studio/shell/src/navigation.ts#L1), [mesh navigation.ts:1](../../packages/planes/mesh/shell/src/navigation.ts#L1) | Both import `../../../../contracts/platform/navigation/src/generated-catalog` across package boundaries. Import it from the `@athyper/contract-platform-navigation` package. |
| 3.5 | [studio shell index.tsx:11](../../packages/planes/studio/shell/src/index.tsx#L11) | `deriveShellNavigation` runs on every render; Mesh memoizes it. |
| 3.6 | `compileDetail`, `normalizeRecord` | Six-space indentation in a two-space file, and `normalizeRecord` is indented at top level. Fix these in the isolated format PR, not with logic changes. |
| 3.7 | [entity-detail-runtime.tsx:13-25](../../packages/platform/entity/runtime/form-detail/src/entity-detail-runtime.tsx#L13) | `@athyper/platform-shell-app-foundation` is imported in three statements. [data-operations.tsx:2](../../packages/platform/entity/runtime/list-view/src/data-operations.tsx#L2) puts a local import above the package imports. |
| 3.8 | Server entity-runtime composition | There are 34 plain `throw Error(...)` sites across the in-scope `entity-runtime` composition modules (13 in `activity-recording.ts` and 3 in `presentation-choice-resolvers.ts`), plus the one in 1.7. Earlier D3-5 (message-string error matching) is still open. |

## Dimension 4 — File and method naming

| ID | Finding | Recommendation |
| --- | --- | --- |
| 4.1 | `list-view/src/entity-navigation.tsx` (link routing: `EntityLink`, `useEntityNavigate`) sits next to `navigation.tsx`, which exports `EntityNavigation` (section tabs). The names suggest the reverse. | Rename the new file `navigation-context.tsx` or `entity-link.tsx` while it is still uncommitted. |
| 4.2 | `readEvidence(provider, context, key, load)` reads like "read the evidence", but it memoizes a loader within a read boundary. | `shareReadEvidence` or `memoizeReadEvidence`. It is new and uncommitted, so it is cheap to rename. |
| 4.3 | `getWithProjection` names the mechanism, and its return type is `AuthorizedRecordDetailResult`. | `getAuthorized`, matching the result type. |
| 4.4 | `related-entity-section.tsx` exports `EntityRelatedSection`, and `detail-workspace.tsx` exports `MetadataDetailWorkspace` (earlier D4-3). | Align the file and export word order for new modules. Existing public contracts need no rename. |
| 4.5 | Positive: the new server tests (`entity-detail-read.test.ts`, `read-evidence.test.ts`, `published-owner-authorizer.test.ts`) are colocated, as `AGENTS.md` requires. The new predicates `tenantRecordProfileSupported` and `ownerRecordProfileSupported` follow the adjective rule. | — |

## Dimension 5 — CSS and the design system

| ID | Location | Finding |
| --- | --- | --- |
| 5.1 | Runtime CSS | Positive: a scripted check found that all 98 custom properties referenced by list and detail CSS are defined (theme tokens, or set at runtime such as `--entity-heading-offset`). There are no hex colors. |
| 5.2 | form-detail `styles.css` (9), list-view `styles.css` (6), `record.css` (2) | There are 17 `!important` declarations. Most repeat `[hidden]{display:none!important}` per component. The dialog widths (list-view lines 126 and 146) override `DialogContent` with `!important`. Add one global `[hidden]` rule to platform-ui, and add a `size` variant to `DialogContent`. |
| 5.3 | Earlier D5-1, D5-2 and D5-4 | These are still open: raw `px` values (97, 31 and 22 in the three main sheets), 24 literal `z-index` values, and five `999px` radii. |
| 5.4 | [neon shell index.tsx:572](../../packages/planes/neon/shell/src/index.tsx#L572) | The gate's error state is a bare `<p>`. Use the design-system `ErrorSurface` or `InlineStatus` (see 1.3). |

## Dimension 6 — Reusable components

| ID | Duplication | Consolidate into |
| --- | --- | --- |
| 6.1 | [detail-requests.ts](../../packages/platform/entity/runtime/form-detail/src/detail-requests.ts) and [thumbnail-requests.ts](../../packages/platform/entity/runtime/form-detail/src/thumbnail-requests.ts) each implement the same reference-counted, abortable in-flight sharing (about 40 lines each). | One `shareAbortableRequest(registry, key, start, signal)` helper |
| 6.2 | `changeLocale` and `planeDiagnostic` are copied into the Neon, Mesh and Studio shells. | `@athyper/platform-shell` |
| 6.3 | Browser storage has three layers: platform-ui `readBrowserStorage`, list-view `browser-storage.ts` (re-wraps it), and form-detail `browser-preferences.ts` (imports it from list-view). Mesh `account-storage.ts` and about ten other shell modules call `localStorage` directly. | Use the platform-ui helpers directly, and drop the dependency of form-detail on list-view for storage. |
| 6.4 | `RelatedSingleRecord` and `RelatedRecordList` hand-roll loading with `current` flags and do not abort requests. | `useAsyncResource` together with `requestDetail` |
| 6.5 | Earlier D6-1…D6-7 (tablists, clipboard, page actions, scope schema, location keys) | Still open. The new `EntityLink` should absorb the separate `onNavigate` click interception that remains in `EntityApplicationContent`. |

## Dimension 7 — Generalization and further reuse

| ID | Finding | Direction |
| --- | --- | --- |
| 7.1 | Work-context gating is decided in app code. The Neon page wraps record routes, and Neon `EntityApplicationRoute` wraps `fallback`. Mesh has an equivalent account context but no gate. Tenant-scoped entities are blocked on Neon (1.3), while an account-scoped Mesh entity would not be gated at all. | The descriptor already knows `directoryScope` and the collection scope. Publish a `requiredContext` and let the shared runtime gate through a plane-supplied gate slot. |
| 7.2 | `onNavigate` mixes two contracts: embedding hooks and application routing (the root cause of 1.1). | Keep separate `onOpenRecord` and application navigation. |
| 7.3 | Domain branches in shared code: the `platform.address.summary.v1` / `purpose` special case in [record-summary-panel.tsx:147-163](../../packages/platform/entity/runtime/form-detail/src/record/record-summary-panel.tsx#L147); hard-coded Neon lookup tables and bank sources in [presentation-choice-resolvers.ts](../../server/apps/platform-host/src/composition/shared/entity-runtime/presentation-choice-resolvers.ts); the `content.item` branch in collaboration authorization. | Move each into its renderer or source registration. |
| 7.4 | Principal metadata repeats identical enum `lookup.options` in `list_*` and `detail_*` surface bindings (a scripted diff found them identical). | Declare enum options once per field. Surfaces then reference the field, so list, detail and filters cannot drift. |
| 7.5 | `26_entity_owner_access.sql` is byte-identical in the Neon, Mesh and Studio DDL. | Move it into `common/` under the DDL consolidation work. |

## Dimension 8 — Localization of the shared framework

| ID | Location | Finding |
| --- | --- | --- |
| 8.1 | `metadata/products/shared/entities/principal/` | The folder has only `definition.json`. Country, the reference implementation, has `localization.json`. All Principal labels ("Principals", fields, the Overview/Profile/Notifications tabs, enum options) render in English under ms and ar. The mechanically humanized values "Jit" and "Api" should read "JIT" and "API". |
| 8.2 | [list-pagination.tsx:31-57](../../packages/platform/entity/runtime/list-view/src/list-pagination.tsx#L31) | The component is half localized. "First page" uses a catalog key (in progress), but these remain English literals: "Showing {range} of {n}", "· more available", "Previous", "Next", "Rows per page", "List pagination" and "Recently calculated result count". When a recovered page is empty, the summary also reads "Showing 0–0". |
| 8.3 | New English literals in this change set | `NeonWorkContextGate` ("Loading business context", "Business context is unavailable. Try again."). Three new `activityError` messages in `activity-center-data`. `No {label} yet.` at [index.tsx:3685](../../packages/platform/entity/runtime/list-view/src/index.tsx#L3685), which also lowercases the label (the earlier D1-6 defect, which is still open at line 4211). The Mesh shell `LABELS` and the Studio and Mesh `contextLabel`. |
| 8.4 | [entity-list-service.ts:213, 231, 258, 265](../../server/packages/services/records/src/entity-list-service.ts#L213) | Server-authored UI text is still present (earlier D7-4): "Edit", "Overview" and humanized transition codes. |
| 8.5 | [entity-value.ts:48-51](../../packages/platform/foundation/i18n/src/entity-value.ts#L48) | Enum values format from `filterOptions[].label`, the metadata default text, with no localized lookup. `formatExactDecimal` still builds 12 formatters per cell (earlier D2-6). |
| 8.6 | `overview.tsx:239`, list `index.tsx:4557, 4573, 5070`, `field-format.ts:35`, `intake.tsx:326`, `collaboration-actions.tsx:91` | Formatting without a locale (`toLocaleString()`, `new Intl.NumberFormat()`, `DisplayNames(undefined)`) bypasses the governed `formatLocale`. |
| 8.7 | Catalogs | New keys continue the Arabic `other`-only plural pattern (earlier D8-7). |

---

## Status of earlier findings

| Earlier ID | Status at snapshot |
| --- | --- |
| D1-1, D1-2, D1-3 | Fixed in `adb15e4b5` |
| D1-4 (pagination after reload) | In progress: "First page" recovery added (uncommitted); copy not localized (8.2) |
| D1-5 (scope prop ignored) | In progress: controlled when `onScopeCoordinateChange` is supplied, and reset on parent scope change (uncommitted) |
| D1-6 (lowercased title) | Open, and a second instance was found (8.3) |
| D1-7 | Ruled out by the parser |
| D2-1 (full-page navigation) | In progress with `EntityLink` and `useEntityNavigate`; it introduced regression 1.1 |
| D2-2 (retain rows) | In progress; see 1.4 |
| D2-3 (double detail read) | Partly done: one HTTP call now, but duplicate authorization remains (2.1) and related sections are unchanged (2.2) |
| D2-4, D2-5, D2-6, D2-7, D2-8, D2-9, D2-10 | Open (D2-9 now covers more routes) |
| D3-*, D4-*, D5-*, D6-*, D7-* | Open unless noted above |
| D8-3 | Partly done: pagination now uses `intl.number`; other sites remain (8.6) |

## Plane notes

- **Neon:** see 1.3, 1.5 and 7.1. Record routes depend on business context even
  for tenant-scoped entities.
- **Mesh:** the entity route has no account gate. That is correct for Country
  and Principal but inconsistent with Neon (7.1). The shell has duplicated
  helpers and English labels (6.2, 8.3).
- **Studio:** data-operations links lead to routes that do not exist (1.2).
  Navigation is recomputed on every render, and the catalog is imported across
  package boundaries (3.4, 3.5).

## Suggested order

1. **Before committing the in-flight work:** fix 1.1 (the navigation
   regression) and 1.4 (retained-row filter source), and rename 4.1, 4.2 and
   4.3 while they are still uncommitted. Add browser tests for an embedded
   list's data operations and for a filter change made mid-load.
2. **Plane correctness:** 1.2 (route-catalog-driven transfer links), then 1.3,
   1.5 and 7.1 (descriptor-driven context gating).
3. **Server read path:** 2.1 and 1.6, then 2.2, which needs relationship
   capabilities in the descriptor.
4. **Principal onboarding parity with Country:** 8.1 (localization.json) and 7.4
   (field-level enum options), plus the 2.3 owner-scope presentation decision.
5. **Localization sweep:** 8.2 to 8.6, together with the earlier D8 backlog.
6. **Consolidation:** 6.1 to 6.4, 3.4, 3.8 and 5.2. Leave formatting-only
   changes (3.6) to the isolated format PR.
