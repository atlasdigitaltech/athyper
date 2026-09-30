# Country route review, round 2: eight dimensions, with localization

| Field | Value |
| --- | --- |
| Date | 2026-09-30, 02:40–03:25 (+08) |
| Revision | `HEAD = 3f8f7b3b5` plus a **dirty, concurrently edited worktree** (167 changed paths; another session was editing records/authorization files during this review) |
| Scope | `/app/entity/country` on Neon, Mesh and Studio: the route, the shared read surface, the list and detail runtimes, the relay, the records API, and the shared i18n and CSS they depend on |
| Authority | [System design](../architecture/application-experience/system-design.md), [AGENTS.md](../../AGENTS.md) |
| Predecessors | [country-route-review-20260930.md](country-route-review-20260930.md) (written before the 01:32–01:39 fix commits), [country-route-comprehensive-review-20260929.md](country-route-comprehensive-review-20260929.md) |
| Method | Source changes: none. Only this file was written. I read every cited line myself. Executed checks are marked **▶ run**. |

**How this differs from the earlier reports.** The 00:03 report covered dimensions 1–7 broadly. Six fix commits landed after it. This round:

1. re-checks that report's top findings against the current tree (§11);
2. traces the actual Country path first-hand and adds the defects the earlier report missed (§3);
3. makes **localization a full dimension** (§10);
4. checks the path against the system design's stated invariants (§2).

Line numbers are current as of 03:20. The worktree is still changing, so match on content, not line number.

---

## 1. Executive summary

The route layer is correct and minimal. All three apps delegate to the same four-line adapter. Route grammar validation is shared by the browser and the server. The detail runtime formats values through the governed locale. All four packages on the path typecheck clean (**▶ run**, `tsc --noEmit`, 0 errors each).

The defects are in the shared runtime around the route:

- **Data export.** One export scope can silently widen to the whole collection. Another ignores the active view.
- **Formatting.** The list formats dates with the browser's locale and time zone. The detail uses the governed ones, so the **same Country timestamp reads differently in the list and the detail**, and date-only values move back one day west of UTC (**▶ run**).
- **Denied vs. failed.** Both the list and the detail present a 403 as a retryable failure. Design invariant 6 forbids this.
- **Localization.** Most of the shared list UI is hard-coded English. Country's translations live in shared framework code instead of metadata. There are two i18n runtimes with different locale sets, so some messages can never be translated.

### Ranked findings

| # | Sev | Finding | Where | Dim |
| --- | --- | --- | --- | --- |
| 1 | **high** | Export with scope **Current page** on an empty or unloaded page exports the **entire authorized collection**. The client omits `recordIds`, and the server only checks non-empty ids for scope `selected`. | `list-view/src/data-operations.tsx:61-62,81-82`; `records/src/transfer/export-scope.ts:7` | 1 |
| 2 | **medium** | Export with scope **All records matching search and filters** drops the active standard view, so it exports a superset of what the user sees. `queryHash` also omits the view, so the receipt cannot show the difference. | `data-operations.tsx:62`; `entity-list-service.ts:678-690` | 1 |
| 3 | **medium** | The list formats dates and times with the **browser** locale and time zone. The detail uses the governed `formatLocale`/`timeZone`. Date-only values show the previous day in negative-offset zones. | `list-view/src/index.tsx:4999-5006` vs `form-detail/src/record-fields.tsx:31-43` | 1, 8 |
| 4 | **medium** | List error card: for a 403, the classifier's "Access denied" is replaced by "This list is unavailable / We couldn't load this page. Please try again." The card also renders raw `error.message` under "Technical details". | `list-view/src/index.tsx:5366-5390` | 1 |
| 5 | **medium** | Detail: a 403 shows the generic "request could not be completed" message with a **Retry** button. The not-found state has no way back to the collection. | `form-detail/src/entity-detail-runtime.tsx:53-67` | 1 |
| 6 | **medium** | **Country's UI translations are compiled into the shared i18n package.** Catalog composition is a closed list of imports, so each new entity requires a framework code change. | `i18n/src/catalogs/country.ts`, `i18n/src/entity-catalogs.ts:4-14` | 7, 8 |
| 7 | **medium** | There are **two i18n runtimes with different locale sets**: shell en/ar, entity en/ms/ar, registry 8 locales. The list overview asks the shell runtime for entity keys, so it is **always English**. | `shell/src/messages.ts:33`; `list-view/src/overview-messages.ts:4-9`; `i18n/src/entity-react.ts:19` | 8 |
| 8 | **medium** | The shared list runtime has about 120 hard-coded English literals in `index.tsx`, plus data operations, transfers, pagination, the filter editor and the group dialog. 53 shared strings exist only in English (validation, overview, reference picker, record-not-found). | §10.3 | 8 |
| 9 | **medium** | The server generates English UI text: form titles `New ${label}`, an English `pluralize()`, group label `"Not set"`, and a sort-limit error with no `params`. The client error localizer maps only 3 codes. | `entity-list-service.ts:393-398,614-619,1447-1482`; `i18n/src/entity-errors.ts` | 8 |
| 10 | low | `searchHint` builds a `RegExp` from the metadata entity label **without escaping** it (a label containing `C++` throws `SyntaxError`, **▶ run**). It also ranks fields by matching English words in labels. | `list-view/src/index.tsx:5061-5079` | 1, 7 |
| 11 | low | Limits are duplicated as literals. The sort limit is hard-coded `> 10`, while the service publishes a limit of 3 and exports `MAX_LIST_SORT_LEVELS`. The route's `search.maxLength: 512` repeats `ENTITY_LIST_MAX_SEARCH_LENGTH`. `3699` is a derived magic number. | `entity-list-service.ts:614`; `entity-list-routes.ts:215-216,243` | 3 |
| 12 | low | Dead or stale surface: a no-op `applicationDescriptor` override; `redirect-entity-record.ts` and `route-params.ts` have no importers (and the worktree is editing them); Neon relay still allowlists Business Partner and Workforce operations whose UI packages and server routes were deleted. | §8 | 2, 7 |
| 13 | low | RTL defects in the Arabic layout: `text-align:left` in the transfer table and `right:0` on the thumbnail badge. Raw `z-index: 4/8` values are used although `--a-z-sticky` and `--a-z-popover` tokens exist. | `list-view/src/styles.css:5,32,372`; `form-detail/src/styles.css:577` | 5, 8 |

The earlier report's top items, re-checked, are in §11. Four are fixed in source, three are unchanged, and the rest were not re-verified.

---

## 2. Conformance with the system design

The user asked for strict adherence to `system-design.md`. The Country path against the design's stated rules:

| Rule | Status | Evidence |
| --- | --- | --- |
| §3.4 / §9: thin route → reusable feature adapter | ✅ | All three `page.tsx` are `export default createEntityReadRoute(notFound)`, identical across planes |
| §3.5: authorization is server-side | ✅ | Route comments and code: the URL grants nothing; the list, descriptor and record reads are authenticated, `no-store` and authorized server-side (`entity-list-routes.ts:123-147`) |
| §3.6: unknown, loading, empty, **denied**, failed and stale are different states | ❌ | The list shows a 403 as "unavailable, try again" (#4). The detail shows a 403 as a generic failure with Retry (#5) |
| §7.2: missing record is NotFound; denied or failed is never empty | ⚠ | The detail NotFound is fixed in the **uncommitted** worktree, but it offers no route back to the collection. The list's `ErrorState` keeps the not-found title. |
| §7.4: initial skeletons match geometry and expose one loading status with `aria-busy` | ⚠ | The detail loading state is a plain `InlineStatus` text line with no `aria-busy` (`entity-detail-runtime.tsx:56-66`) |
| §5 / Appendix A: safe text in fallbacks | ❌ | Raw `error.message` is rendered to users (`list-view/src/index.tsx:5390`) |
| §3.9: no generic component branches on Business Partner identity | ⚠ | The Neon list adapter branch is gone. Business Partner vocabulary remains in shared contracts and the repository (§9.1). |
| §3.11: no arbitrary script or CSS in metadata | ✅ | Country metadata carries labels, fields, sections and bindings only |
| §14.4 level 1: entity supplies labels through metadata | ❌ | Label *keys* are in metadata, but the **translations** are in framework code (#6) |
| §14.0.1: source-verified baseline | ⚠ **doc drift** | It still describes `/mdg/business-partner` routes and a Neon adapter Business Partner branch. Both were removed on 09-29 (`7a15e966f`, `870f08f52`). The doc should be corrected (§13 requires editing it "when implementation teaches us something"). |

---

## 3. Dimension 1: Bug fixes

### 3.1 Export "Current page" can export everything (high)

`data-operations.tsx:61-62`:

```ts
const scopedRows = scope==="selected" ? props.selectedRows : scope==="page" ? props.page?.rows ?? [] : [];
const filter = { filters: scope === "filtered" ? props.state.filters : [], sort: …,
  ...(scopedRows.length ? { recordIds: scopedRows.map(row=>row.id) } : {}), … };
```

For `scope === "page"` with zero rows (an empty result, or `page` not yet loaded), the payload has no filters, no search and no `recordIds`. That is the payload for the whole collection.

- The client guard (`:53`) and the disabled-state rule (`:82`) both cover only `selected`.
- The server guard `assertSelectedExportScope` (`export-scope.ts:7`) returns early for any scope other than `selected`.

The receipt then records `_transfer.scope: "page"` for what is really an all-records export. The server still applies tenant and permission scoping, so nothing leaks beyond the user's authorization. The problem is that a governed operation does something other than what the user chose and what the receipt says.

**Fix:** the server rejects `page` without a non-empty `recordIds` (generalize `assertSelectedExportScope` to `selected | page`). The client disables `page` when the count is 0, the same way it does for `selected`.

### 3.2 Filtered export ignores the active standard view (medium)

The same payload never includes `state.standardViewKey`. On the server, views such as *My records* (ownership) or *Recently viewed* are applied only through `resolveStandardView` on the **list** path (`entity-list-service.ts:620-628`). So "All records matching search and filters" exports records the user cannot see in the current view.

`queryHash` (`:678-690`) hashes the raw query without `standardViewKey` or `recordIds`, so the export's provenance cannot detect this either. **Fix:** send `standardViewKey` in the export filter, resolve it server-side the same way as the list, and include it in `queryHash`.

### 3.3 List date and time formatting diverges from detail (medium, ▶ run)

`list-view/src/index.tsx:4999-5006` uses `new Intl.DateTimeFormat(undefined, …)`, which picks up the browser's locale and time zone. `record-fields.tsx:31-43` uses `intl.date(...)`, which applies the governed `formatLocale`, `timeZone` and `calendar`, and UTC for date-only values.

Reproduced with Node, with the governed zone set to UTC:

| Browser TZ | `date` "2026-09-30": list / detail | `datetime` "…T02:30Z": list / detail |
| --- | --- | --- |
| America/New_York | **Sep 29** / Sep 30 | Sep 29, 10:30 PM / Sep 30, 2:30 AM |
| Asia/Kuala_Lumpur | Sep 30 / Sep 30 | Sep 30, 10:30 AM / Sep 30, 2:30 AM |

Country's `created_at` and `updated_at` are `datetime`, so the Country list and detail disagree whenever the browser zone differs from the tenant or user zone. Any entity with a `date` field shows the wrong day west of UTC. **Fix:** see §7.1 (one shared value formatter).

### 3.4 Denied is shown as failed (medium)

- **List** (`index.tsx:5366-5385`): `classifyAppError` correctly returns `permission-denied` / "Access denied". The card keeps `model.title` only for `not-found` and `service-unavailable`, and otherwise prints "This list is unavailable" and "We couldn't load this page. Please try again." It also renders `<p>{error.message}</p>` under "Technical details" (`:5389-5390`), which exposes server or transport text.
- **Detail** (`entity-detail-runtime.tsx:53-67`): 404 is now handled in the uncommitted worktree. 403 still falls through to `localizedEntityError` → "The request could not be completed. Try again." with a Retry button that cannot succeed. The not-found state has no link back to `/app/entity/<code>`.

**Fix:** have the detail use the same `classifyAppError` + `ErrorSurface` path as the list (§7.2), and render the classifier's title and description for `permission-denied`.

### 3.5 Unescaped `RegExp` from metadata (low, ▶ run)

`searchHint` (`index.tsx:5076`) runs `new RegExp(`^${descriptor.entity.label}\\s+`, "i")`. The label comes from metadata and is localized, and it is not escaped. `C++` throws `SyntaxError: Nothing to repeat` during render. `Unit (UoM)` silently fails to match. **Fix:** escape the label, or better, drop label-prefix stripping (§9.3).

### 3.6 Smaller correctness items

- **Server sort limit ignores its own descriptor.** The service publishes `maxSortLevels` (default 3, `:961-962`) but `list()` only rejects `> 10` (`:614`). Its message says "ten" and carries no `params`, unlike `TOO_MANY_FILTERS`.
- **Enum cells ignore published option labels.** `formatFieldValue` humanizes the raw code (`index.tsx:5023`). `ListFieldDescriptorV1.filterOptions` already carries authorized `{value, label}` pairs (`entity-list/src/types.ts:173-176`).
- **The detail preference key can collide across users.** `athyper.detail-view.${plane}:${identity.scope?.tenantId}:${identity.scope?.principalId}:…` (`entity-detail-runtime.tsx:80`) becomes `undefined:undefined` when scope is not yet resolved.

---

## 4. Dimension 2: Improvements

1. **Cache `Intl` formatters.** `IntlRuntime.number` and `date` construct a new `Intl.NumberFormat` or `DateTimeFormat` on every call (`i18n/src/index.ts:202-203`). Memoize by `(locale, options)` inside the runtime. It is already cached per localization (`entity-react.ts:10`), so this is a local change.
2. **Detail loading state.** Use a skeleton with `aria-busy` that matches the section geometry (design §7.4) instead of a text line. The header title should be the localized entity label once known, not `humanizeIdentifier(entityCode)` (`:57`).
3. **Export provenance.** Include `standardViewKey` and `recordIds` in `queryHash` (§3.2).
4. **Remove the no-op override.** `EntityListRouteOptions.applicationDescriptor` ("compatibility projection", `entity-list-routes.ts:27,40-41`) is supplied by the host as a wrapper that just calls `lists.applicationDescriptor` (`http-registrars.ts:88-94`). Delete both.
5. **Prune the Neon relay allowlist.** `apps/neon/lib/relay.ts:53-65` registers Business Partner, Workforce and HR operations. `packages/planes/neon/{business-partner,workforce}` now contain only `node_modules`, and `/api/neon/workforce*` has no server route. Unused allowlist entries are attack surface with no consumer.
6. **Delete dead app code.** `apps/neon/lib/redirect-entity-record.ts` has no importers, and `route-params.ts` is only imported by it. The uncommitted worktree is currently editing `route-params.ts`, which is effort spent on dead code.

---

## 5. Dimension 3: Coding standards

- **Minified source.** `api-client/src/entity-list.ts:8-115` is about 40 single-line operation and parser declarations (for example, `:101` is one line holding a 900-character function). `list-view/src/transfer-workspace.tsx:31` puts a whole table in one line of JSX. `list-view/src/styles.css:372` puts about a dozen rule blocks on one line. `records/src/__tests__/localized-error-routes.test.ts` is minified too. `form-detail/src/record-fields.tsx:6-53` keeps the deep indentation from an extraction. The worktree now adds `.prettierrc.json` and `eslint.config.mjs` (untracked), which gives this a remedy. Per repository practice, land the format sweep **as its own change**.
- **Formatting mixed into logic changes.** The uncommitted `apps/neon/proxy.ts` diff is mostly re-wrapping around a one-line import change. Split it out.
- **Copy-pasted parser messages.** `parseBookmarks` reports `record transfer response.createdAt is required` (`entity-list.ts:90,94`).
- **Type escapes.** `values[index]!` in catalog composition (§10.6). `descriptor as unknown as import("…").EntityRuntimeDescriptor` inline in `register-services.ts` (activation guard, commit `d186532c0`).
- **Magic numbers.** See #11.
- **Unconditional dead branch.** `record-fields.tsx:31` has `intl ? … : display(value)`, but `useEntityI18n()` never returns undefined.

---

## 6. Dimension 4: File and method naming

- **Stale path names.** The request and some docs still name `routes/entity-read-page.tsx` and `entity-read-runtime.tsx`. The files are now `routes/entity-read-route.tsx` (exports `createEntityReadRoute`) and `entity-read-surface.tsx`.
- **Two files named `entity-read-route`.** One is a contract resolver (`contracts/…/routes/entity-read-route.ts`), the other a React route factory (`form-detail/src/routes/entity-read-route.tsx`). Consider `entity-read-route-grammar.ts` for the contract file.
- **Module name ≠ contents.** `api-client/src/entity-list.ts` also owns bookmarks, imports, exports, transfers and saved views. Split into `entity-list`, `record-bookmarks`, `record-transfers` and `entity-views`.
- **Catalog ownership.** `i18n/src/catalogs/collaboration.ts` owns `error.*` (list filter errors), `entity.value.yes/no`, `entity.retry` and `navigation.*`. Move them to `entity-runtime.ts`.
- **One concept, two names.** "Bookmark" (API: `recordBookmarksOperation`, `RecordBookmarkItemV1`) and "favourite" (UI: `overview-favourites.tsx`, `list.notice.favourites*`). Pick one term for code and keep the other as UI copy only.
- **Alias wrappers.** `isEntityId` → `isEntityRecordId` (`apps/neon/lib/route-params.ts`) is a second name for a canonical predicate.
- **AGENTS.md boolean-predicate rule.** Committed `d186532c0` added the export `isLegacySafeEntityAuthorization`. The uncommitted worktree removes it in favour of `tenantRecordProfileSupported`, which conforms. Resolved if that change lands.

---

## 7. Dimension 5: CSS and the design system

The entity CSS is token-disciplined: 0 hex colours, and 56 and 53 logical-property uses in the two main files against 1 physical rule each. Remaining items:

- **RTL.** `list-view/src/styles.css:372` uses `text-align:left` in the transfer table, so headers misalign in Arabic. Use `start`. `form-detail/src/styles.css:577` pins `.a-attachment-thumbnail__badge` with `right:0` and `border-radius: X 0 0 0`, so the badge sits on the wrong corner in RTL. Use `inset-inline-end` and `border-start-start-radius`.
- **Layering.** `.a-entity-list__chrome` (`z-index:4`), `__scope-popover` (`8`), `__selection-bar` (`6`) and the sticky table cells (`2/3`) use raw numbers. The foundation defines `--a-z-sticky`, `--a-z-popover` and `--a-z-overlay`, and other packages use them. Raw values will stack wrongly against shell popovers and toasts.
- **Raw spacing.** The transfer workspace uses `.85rem 1rem`, `.75rem` radius and `2rem` padding (`:372`), bypassing `--a-space-*` and `--a-radius-*`.
- The earlier report's token and gate findings (unresolved tokens, `.next-*` scan) were not re-run here.

---

## 8. Dimension 6: Reusable components

1. **One value formatter.** Replace list `formatFieldValue` and detail `EntityRecordFields` with a single `formatEntityValue(value, field, intl)` in the shared runtime. It should use governed `intl.date`/`number`, `entity.value.yes/no`, published option labels and `displayName` for region codes. This one change fixes #3, most of #8's cell-level text, and the enum-label issue.
2. **One error-state component.** The list uses `classifyAppError` → `ErrorSurface` or a card. The detail hand-rolls `Card` + `InlineStatus` + Retry. Use one shared `EntityResourceError` with not-found, denied, unavailable and failed variants, and a "Back to <collection>" action.
3. **Pagination.** `transfer-workspace.tsx:31` hand-rolls Previous/Next and "Page X of Y" instead of using `EntityListPagination`.
4. **Validators.** The API client keeps its own entity-code regex `^[a-z][a-z0-9_.-]{0,126}$` (`entity-list.ts:85`), which accepts one-character codes, dots and hyphens that `isCanonicalEntityCode` (`^[a-z][a-z0-9_]{1,62}$`) and the server reject. Its UUID check (`:106`) enforces version and variant bits that `isEntityRecordId` deliberately does not. Import the contract predicates.
5. **Scope-coordinate shape.** `RecordBookmarkMutationV1` (`entity-list.ts:13`) re-declares every scope field instead of extending `EntityListScopeCoordinateV1`.
6. **Duplicate `humanize`.** The untracked `server/packages/foundation/src/humanize.ts` would add a third `humanize` next to `contracts/…/text/humanize.ts`. Reuse the contract one.

---

## 9. Dimension 7: Generalization and further reuse

### 9.1 Business Partner vocabulary in shared contracts (still present)

- Route query schema: `partnerRole: supplier|customer` and `eligibleOperation: order|invoice|payment` (`entity-list-routes.ts:217-218`). These are mirrored in `entityListScopeQuery` and `RecordBookmarkMutationV1` (`api-client/src/entity-list.ts:13,74-75`).
- Shared repository: `neon.business_partner.*` constraint kinds and `master.business_partner_*` SQL (`kysely-record-repository.ts:109-159`).
- `related-presentation.ts:77-111`: `business_partner.*` relationships.
- `form-detail/src/index.tsx:43-50` exports `AddressesSection`, `BankAccountsSection`, `CertificationsSection` and `SupportingDocumentsSection` from the generic runtime package.

These should move behind registered scope and provider identifiers selected by metadata (design §14.6), with Business Partner-specific code in its domain or plane package.

### 9.2 Entity text should come from metadata

- **Translations** (#6, §10.1).
- **Form descriptor labels.** They are derived from `humanizeIdentifier(entityCode)` (`entity-list-service.ts:385`), not from the published `entityLabel`. An entity code like `uom` becomes "Uom".
- **`searchHint`** ranks by English words in labels and by a hard-coded `country_code` role (`index.tsx:5061-5071`). Rank by a declared metadata role or `searchFields` order. Country already publishes `searchFields`.

### 9.3 The canonical route has no plane scope hook

`EntityReadSurface` renders `EntityListRuntime` with no plane adapter. The Neon catalog path goes through `NeonEntityList`, which supplies application scope and `renderScopeControl`. This is fine for tenantless Country. **Unverified:** an entity that needs a Neon work context may behave differently at `/app/entity/<code>` than through its catalog alias. Check this before onboarding the first scoped entity on the canonical route.

### 9.4 Hand-written Neon catalog overlay

`apps/neon/lib/catalog-routes.ts:18-69` (English names, entity codes) is still hand-written, as in the earlier report.

---

## 10. Dimension 8: Localization of the shared framework

### 10.1 Architecture: entity translations are in framework code

Country metadata publishes `{labelKey: "entity.country.fields.code", defaultText: "ISO alpha-2"}`. The Malay and Arabic text for those keys lives in `packages/platform/foundation/i18n/src/catalogs/country.ts`. It is composed by a hard-coded import list (`entity-catalogs.ts:4-14`) whose own comment says "further entities add separately owned catalogs". That contradicts:

- AGENTS.md: "Keep entity-specific configuration in metadata."
- `entity-messages.ts:1`: "Entity-specific labels remain in published metadata."
- The metadata contract, which already supports inline per-locale text (`EntityLocalizedTextV1 {defaultLocale, values}`, resolved by `resolveEntityText`), used for list headers, actions and standard views.

So there are **two entity-text mechanisms** (labelKey resolved against code catalogs, and inline localized values in metadata), and field and section labels use the one that requires framework changes. **Recommendation:** publish entity translations as metadata. Either extend `{labelKey, defaultText}` with a `values` map, or carry a per-entity message bundle in the published descriptor. Resolve both through one `intl.text()`. Then move `country.ts` into `metadata/products/shared/entities/country/`.

### 10.2 Two runtimes, three locale sets

| Layer | Locales | Source |
| --- | --- | --- |
| Locale registry (`SUPPORTED_UI_LOCALES`) | en, ar, ms, zh-Hans, hi, ta, fr, de | `i18n/src/index.ts:4` |
| Shell catalog (`IntlProvider` in `PlatformShell`) | en, ar (matched by `startsWith("ar")`) | `shell/src/messages.ts:33` |
| Entity catalog (`useEntityI18n`, a separate runtime) | en, ms, ar | `i18n/src/entity-catalogs.ts:7` |

Consequences:

- A Malay user sees English shell chrome around Malay entity content.
- `useOverviewMessage` (`list-view/src/overview-messages.ts:4-9`) asks the **shell** runtime for `entity.overview.*` keys. They are never in the shell catalog, so the overview is always English, whatever translations are added to the entity catalogs.
- `useEntityI18n` creates its runtime without `onDiagnostic` (`entity-react.ts:19`), so missing entity translations are never reported.

**Recommendation:** one provider composes shell and entity catalogs into one runtime. One declared list of shippable locales comes from the registry. Wire diagnostics.

### 10.3 Untranslated shared strings

- **53 shared strings are English-only.** All of `entity-messages.ts` (`validation.*`, `entity.overview.*`, `entity.reference.*`, `entity.related.*`, `detail.recordNotFound`) has no ms or ar entry. The new uncommitted not-found state therefore shows English in ms and ar.
- **Hard-coded literals** (heuristic count, a lower bound):

  | File | Literals | `intl.message` calls |
  | --- | --- | --- |
  | `list-view/src/index.tsx` | ~121 | 6 |
  | `list-view/src/data-operations.tsx` | ~22 | 2 |
  | `list-view/src/overview.tsx` | ~11 | 0 |
  | `collection-controls/src/filter-editor.tsx` | ~10 | 0 |
  | `list-view/src/dialogs/group-dialog.tsx` | ~8 | 0 |
  | `list-view/src/transfer-workspace.tsx` | table headers, statuses, "Page X of Y" in one line | 0 |

  Examples on the Country list: "Loading list", "System default", "Reset list settings?", "Quick filters", "Ascending/Descending", "Visible columns", "Showing X–Y of Z" (`list-pagination.tsx:37-38`), "{count} records" with no plural rule (`index.tsx:5098`), "Yes"/"No" (`:4997`, even though `entity.value.yes/no` exist).
- **Contrast.** `comments-workspace.tsx` has 110 message calls to 5 literals, so the collaboration surface shows the intended standard. The list is the outlier.

### 10.4 Formatting bypasses the governed locale

Direct `Intl` or `toLocale*` calls with no or browser locale:

- `list-view/src/index.tsx:1091,1759,1763,4543,4559,5002,5015,5085`
- `list-pagination.tsx:32,38`, `data-operations.tsx:41,70,74,97,107`, `overview.tsx:239`
- `transfer-workspace.tsx:31,35,36` (`toLocaleString()`), `form-detail/src/intake.tsx:326`, `related-record.tsx:50,59`

`index.tsx:397,628,1668` take `localization.uiLocale` where number and date formatting should use `formatLocale`. These are only used for `resolveEntityText` today, which is correct, but `:1091` feeds that same `locale` into `Intl.NumberFormat`.

### 10.5 The server emits English UI text

- `formDescriptor`: `title: "New ${label}" / "Edit ${label}"` and `description: "Create a governed … record."` (`entity-list-service.ts:396-397`).
- `pluralize()` is an English heuristic used for published `pluralLabel` (`:393,548,1009,1476-1482`).
- `formatGroupLabel` returns `"Not set"`, and ISO strings for dates (`:1447-1452`).
- Error details are English sentences. The design is sound, because `RecordServiceError` carries `code` + `params` and `localized-error-routes.test.ts` pins that. But `localizedEntityError` maps only `INVALID_FILTER(_VALUE)` and `TOO_MANY_FILTERS`. Every other code (`INVALID_STANDARD_VIEW`, `STANDARD_VIEW_UNAVAILABLE`, `ENTITY_APPLICATION_UNAVAILABLE`, `TOO_MANY_SORT_FIELDS`, …) becomes a generic message or an English fallback.

**Recommendation:** the server returns codes, params and label keys, and the client renders them. Grow the error-code table alongside `RecordServiceError` codes, with a test that every thrown code has a catalog entry.

### 10.6 Catalog format is fragile

Catalogs are positional tuples `[en, ms, ar]`, read by `values[index]!` (`entity-catalogs.ts:12-14`):

- Adding a fourth entry to `ENTITY_CATALOG_LOCALES` without extending every tuple makes `mergeCatalogs` call `.trim()` on `undefined` **at module load**, which breaks every plane.
- Nothing type-checks that a tuple matches the locale list.
- A missing translation cannot be represented; the only choices are a duplicate of the English or a crash.

**Recommendation:** use `Record<Locale, string>` or per-locale files, typed from the registry, with absent entries falling back and being reported.

### 10.7 RTL

Two physical-direction rules (§7). Otherwise the entity CSS is logical-property based, and `BidiText` and `CodeText` exist for mixed-direction values.

---

## 11. Status of the earlier report's top findings (re-checked 03:05–03:20)

| Earlier # | Finding | Status now | Evidence |
| --- | --- | --- | --- |
| 1 | Profile authorization never enforced | **Fixed (fail-closed)** in `d186532c0`. **Being rewritten in the worktree** (§12). | `entity-backend-authorizer.ts:446-450` |
| 2 | Attachments relay only on Neon | Fixed per `4cb73c8a4` (not re-traced) | commit |
| 6 | Verification endpoints unauthorized | **Fixed**: routes declare `permission: VERIFICATION_READ/RUN_PERMISSION` with 403 | `shared/verification.ts:75,92` |
| 10 | LIKE metacharacters in search | **Fixed** | `kysely-record-repository.ts:177-178` (`escapeLike` + `ESCAPE`) |
| 12 | `createEntityMetadataHooks` unused | **Resolved by deletion** (`metadata-validation.ts` deleted in worktree) | grep: 0 hits |
| 5 | SQL rejections classified transient | Changed: `PERMANENT_SQLSTATES` now consulted (not re-executed) | `publication-orchestrator.ts` |
| 4 | Recovery query hidden by RLS | **Unchanged in source** (runtime not re-checked) | `kysely-authority-repository.ts:146-156` |
| 19 | `business_partner` in shared contract | **Still present** | `related-presentation.ts:77-111` |
| — | BP SQL in shared records repository | **Still present** | `kysely-record-repository.ts:109-159` |
| 3, 7, 8, 9, 11, 13–18, 20 | — | Not re-verified this round | — |

---

## 12. Worktree risk: land the authorization rewrite atomically

The uncommitted worktree replaces the committed fail-closed gate:

```diff
-    if (descriptor.authorization && !isLegacySafeEntityAuthorization(descriptor))
+    if (descriptor.authorization && authorizer.entityDescriptorSupported?.(descriptor)) return true;
+    if (descriptor.authorization)
       throw new Error("ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE");
```

`entityDescriptorSupported` is implemented only in the **untracked** `server/packages/services/records/src/published-tenant-authorizer.ts` (`tenantRecordProfileSupported`), which is wired through the modified `register-services.ts`. The direction is good: it moves the predicate behind the authorizer port, and its conditions match the removed predicate plus stricter entity and plane identity checks.

The risk is partial commits:

- Committing `entity-backend-authorizer.ts` alone makes **every Country read throw `ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE` (HTTP 500)**.
- Committing `register-services.ts` alone breaks the host build.

The three files, plus `entity-authorization-activation.ts` and the two new tests, must land together. Then re-verify `/app/entity/country` on all three planes at runtime.

---

## 13. Suggested order of work

1. **Export scope** (#1, #2). Server first: generalize `assertSelectedExportScope` to `page`, and send and resolve `standardViewKey`. This is small and removes a governed-operation defect.
2. **Land the authorization rewrite atomically** (§12) and re-verify the Country list and detail on Neon, Mesh and Studio.
3. **One value formatter and one error-state component** (§8.1–8.2). This fixes #3, #4, #5, Yes/No and enum labels in one shared change.
4. **One i18n runtime, then metadata-owned entity translations** (§10.1–10.2). Keyed catalogs replace tuples (§10.6).
5. **Externalize list-runtime strings** (§10.3), file by file. `list-view/src/index.tsx` is under concurrent edit, so coordinate.
6. **Server text to codes and label keys** (§10.5), with a code-coverage test for the error catalog.
7. **Clean-up.** Dead relay operations and app helpers, the no-op override, literal limits, RTL and `z-index` tokens, and correcting the §14.0.1 doc drift.
8. **Format sweep** as its own change, once `.prettierrc.json` and `eslint.config.mjs` are committed.
