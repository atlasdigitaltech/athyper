# Country Entity App — Round-2 Code Review

**Scope:** Meta Entity Driven "Country" app compiled for **Neon, Mesh, Studio**.
**Basis:** `docs/reports/country-route-typescript-inventory-20260928.md`; the published Country artifact you supplied; the authoring source `metadata/products/shared/entities/country/{definition,capabilities}.json`; and the design-system/i18n infrastructure.

**How this round differs from round 1:** round 1 produced a findings list. Round 2 (a) **independently verified** every round-1 finding against the *current* working tree, (b) reviews the **authoring → compile → runtime seam** for the exact artifact you supplied, and (c) adds net-new findings from areas round 1 under-covered (cross-plane parity, accessibility, test wiring, descriptor consumption, catalog/design-token health).

> ⚠️ **Revision caveat — the tree is a moving target.** The round-1 report is dated `2026-09-28 05:09`. Since then **68 files under the reviewed scopes were rewritten (07:01–10:41)** and `git status` reports ~595 modified/untracked paths. Those rewrites implement many round-1 fixes and are **uncommitted**. Every verdict below is against the working tree at review time. **Pin a commit before acting.**

> ⚠️ **Your artifact is one release behind.** The JSON you pasted is Country **release 6** (`fd5d1272-8447-4a50-a59d-d2c0d6997a48`, `releaseNo 6`, plain-English labels). **Release 7** (`3a3d4961-0103-45c9-b2b0-eef85d950fc3`) is the governed **localization successor**, activated on Neon/Mesh/Studio — see `docs/reports/entity-localization-foundation-20260928.md`. Round-2 conclusions about localization are drawn from release 7 / the current tree, not release 6.

Severity: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low.

---

## Executive summary — round-2 top issues

1. 🔴 **The entity path is structurally incomplete on Mesh and Studio.** `apps/mesh|studio/.../app/entity/[entityCode]/[[...segments]]/page.tsx` is a 4-line `createEntityReadPage(notFound)`; Neon's is a 52-line route with record-adapter resolution, catalog aliasing, list density and `NeonRouteEntitlement`. Mesh/Studio also lack the `[workspaceSlug]/[moduleSlug]/[[...segments]]` catch-all, the proxy entity rewrite, the catalog entity overlay, and the whole `entity-application-*`/`entity-route-context` lib set. **Public catalog entity URLs and the country detail/manage surfaces are unreachable in 2 of 3 planes.**
2. 🟠 **11 `var(--a-*)` references are broken** (never defined anywhere in the repo). The no-fallback `--a-focus-ring-width/color/offset` uses (`shell/styles.css:822`, `ui/styles.css:542,553`) invalidate whole `outline` shorthands → **real focus-ring loss**, not a style nit. Also `--a-font-size-heading` (`record-collaboration.css:3`) and `--a-surface-subtle` (`ui/styles.css:522`).
3. 🟠 **544 hardcoded user-facing strings in 45 files** (AST-verified); 29 files with literals never import i18n, and 16 of the 33 i18n-adopting files still hardcode. Worst: `list-view/index.tsx` (186), `data-operations.tsx` (68), `transfer-workspace.tsx` (40, no i18n import at all).
4. 🟠 **2,166 CSS declarations use raw values** (1,585 `rem`, 226 `px`, 131 raw `@media`, 79 radius, 71 opacity, 51 `z-index`, 20 motion, 20 hex + 1 `rgb()`). No breakpoint tokens and no viewport-unit tokens exist, so sizes cannot be tokenised mechanically.
5. 🟠 **The country-path browser test suite never runs by default.** `tests/foundation-browser/*.spec.ts` (46 specs, incl. metadata-detail-navigation, country-change-confirmation, detail-collaboration) execute only via the manual `test:foundation-browser`; they are absent from `test:repo`/`test:workspace`/`test:root`, and the test-reachability policy only matches `.test.ts`.
6. 🟠 **Accessibility — invalid ARIA / lost focus.** `detail-workspace.tsx:194-257` places a menu inside a `role="tablist"`; `record-navigation.tsx:119-160` is a `role="menu"` with no keyboard handling; `collaboration-surface.tsx:315-333` publishes `aria-controls` for panels it never renders, and `close()` can drop focus to `<body>` on deep-link open.
7. 🟠 **`record-summary-panel.tsx:92` ignores `labelKey`** and renders `card.label.defaultText`, so localized summary-card titles can never appear even though `detail-workspace.tsx:75` synthesises the key.
8. 🟠 **A boolean field mis-renders on the detail surface.** `has_postal_codes` (a Country field) shows literal `true`/`false` via `detail-workspace.tsx:398-404`, while the list shows `Yes`/`No` (`list-view/index.tsx:4854`).
9. 🟠 **`descriptor-client/src/intake-operation-client.ts` can never work**: the server route exists (`entity-runtime-contracts.ts:15`) but there is no BFF relay allowlist entry, so the browser gets `404 RELAY_OPERATION_NOT_ALLOWED`. Zero consumers today — latent trap.
10. 🟡 **`search.profileKey` is dead metadata** — published, parsed, and consumed by nothing; searchability is actually derived from `queryUses`.
11. 🟡 **`searchable` is gated on `queryUses.includes("filter")`, not `"search"`** (`native-runtime-projection.ts:239-240`) — a policy declaring `search` without `filter` publishes no searchable fields and then 400s.
12. 🟡 **`humanize(entityCode)` still supplies entity labels** on detail/form/loading (`entity-list-service.ts:381,535,916`; `form-detail/index.tsx:43`) instead of the published title; read-only state is invisible to users.
13. 🟡 **Three empty stub packages** (`content-ui`, `cascade`, `workflow-ui`) are 13-byte `export {}`, have zero consumers, yet governance JSON asserts they are active and cover BP workflow/frontend-spine.
14. 🟡 **Descriptor defaults are duplicated in code** (page size 25 — plus a conflicting `limit ?? 50`; maxSortLevels 3; minimumQueryLength 1; "Overview"/"Edit"/"Record ID"; density "comfortable").
15. 🟡 **Duplication:** 5 byte-identical `entityEnglishMessages[key]` fallback closures across 3 packages; 5 `JSON.stringify` dependency arrays (4 in `entity-lookup.tsx`); 126 `crypto.randomUUID()` with no shared idempotency-key helper; 12 production storage accesses bypassing `browser-storage.ts`.

---

## Part 0 — Round-1 verification: what is fixed, and what round 1 got wrong

Round 1's top findings were independently re-checked against the working tree.

### 0.1 Already fixed in the (uncommitted) working tree — do **not** re-implement
| # | Round-1 finding | Worktree evidence |
|---|---|---|
| 1 | `attachment-preview.tsx` discarded sanitized URL | `:48-51` now builds and uses `attachmentCapabilityUrl(...).href` |
| 2 | `compiled-section-content.tsx` blanked whole section on one bad row | `:62-65` per-item `try/catch` + `rejected` + partial-response warning |
| 3 | `record-navigation.tsx` double history write | `:260-266` delegates to `navigation.onSelectSection` only |
| 5 | `url-state.ts` URL-param exception DoS | `:18` length cap; `:26-29` filter guard; `:50-53` `TypeError` → base state |
| 8 | `kysely-record-repository.ts` field allow-list bypass | `:181-188` unknown key → 400 `RECORD_INPUT_FIELD_UNKNOWN` |
| 9 | `field-validation.ts` ReDoS | `:24-29` `compileFieldPattern` + `FIELD_PATTERN_INPUT_LIMIT` |
| 14 | `filter-editor.tsx` `sessionStorage` during render | zero `sessionStorage` hits; uses `@athyper/platform-ui` storage helpers |
| 16 | `record.css` 3 non-existent tokens | now `--a-border`, `--a-muted-foreground`, `--a-muted` |
| 19a | `list-view/styles.css` `content:"Controls"` | removed |

Also fixed/added since round 1: canonical `validation/entity-code.ts`, shared `routes/entity-read-route.ts` + `form-detail/routes/entity-read-page.tsx` adopted by all three planes, and the whole localization slice (release 7).

### 0.2 Round-1 findings that were **wrong or overstated** — do not act on them
- **Round-1 #4 (workload-routes auth/rate-limit ordering) is a FALSE POSITIVE.** `route-contract.ts:60-62` inserts `scoped.authenticated` (the rate limiter, `http-runtime.ts:149`) **after** handler[0]'s credential check and **before** the domain handler, by design; `publication-workload-routes.test.ts:37-47` asserts 429-before-DB. `authenticated:true` means "credential-verified", not JWT. Residual only: no `permission` field (would trip `route-contract.ts:88` if `enforceContracts` were enabled — it is not).
- **Round-1 #21 quantified wrong:** non-null assertions are **27** (worktree) / 25 (HEAD), not 42; only 7 are literal `!.`. `as any` = 3 ✅.
- **Round-1 #6 citation wrong:** `page.tsx:6,33` contains an import and a `notFound()` call, not regexes. The divergence is real but lives at `validation/entity-code.ts:5` (`/^[a-z][a-z0-9_]{1,62}$/`), `shell/src/core.ts:234,262`, `route-admission.ts:23` vs `entity-record-href.ts:7` (`/^[A-Za-z][A-Za-z0-9_.-]{0,126}$/`).
- **Round-1 CSS table:** `form-detail/styles.css` "81 px / 127 rem" is not reproducible (89/137 worktree, 54/79 HEAD); the claim that `shell/styles.css` has 0 hex is wrong (it has 9).

### 0.3 Round-1 findings still live
#6 (entity-code divergence), #7 (`business_partner` hardcode), #10 (silent auth catch-alls), #11 (`content.item`/`atlas.prompt` bypass), #12 (empty capability set passes), #13 (0644 accepted), #15 (country_code/active/draft heuristics), #17 (`descriptor.presentation!`), #18 (non-primary-contact → address summary), #19 (hex fallback in `list-view/styles.css:496`), #20 (5,275-line `list-view/index.tsx`).

---

## 1. Bugs to fix (round-2 net-new)

### Cross-plane (highest impact)
- 🔴 `apps/mesh/.../app/entity/[entityCode]/[[...segments]]/page.tsx:4` & `apps/studio/...:4` — 4-line delegation; no entitlement/layout/catalog/record-adapter/density. Neon `page.tsx:15-52` has all of it. Port or extract a plane-parameterised adapter.
- 🔴 `apps/mesh/.../app/(shell)/[workspaceSlug]/[moduleSlug]/page.tsx:1` & studio — no catch-all, no `resolveCatalogRoute`; public catalog entity collection/detail URLs 404 (neon has it).
- 🟠 `apps/mesh/proxy.ts:4` & studio — no entity rewrite (neon `proxy.ts:8-33`).
- 🟠 `apps/mesh/lib/catalog-routes.ts:4` & studio — no entity-route injection.
- 🟠 `apps/mesh/lib/`, `apps/studio/lib/` — missing `entity-application-layout/route`, `entity-record-adapters`, `entity-route-context`, `list-density`, `route-params`.

### Descriptor ↔ runtime consumption (Country shape)
- 🟠 `form-detail/src/detail-workspace.tsx:341-377,398-404` — boolean (`has_postal_codes`) renders `"true"`; list renders `Yes`/`No` (`list-view/index.tsx:4849-4855`). Use one shared value formatter.
- 🟠 `contracts/platform/entity-runtime/src/record-presentation.ts:272-277` — `readableRecordPresentation` can emit `navigation.tabs: []`, which `parseEntityDetailNavigation` (`detail-navigation.ts:27-28`) then rejects → hard parse failure. Omit `tabs` when empty.
- 🟡 `record-presentation.ts:359` + `detail-workspace.tsx:146-166` — `readOnly` is never set for a `writeOperations: []` entity, so the read-only badge (`record-header.tsx:117-119`) never renders; users can't tell the entity is read-only.
- 🟡 `server/packages/services/records/src/query-service.ts:165` — `query.limit ?? 50` conflicts with descriptor `defaultPageSize: 25` and the hash basis at `entity-list-service.ts:679`.
- 🟡 `native-runtime-projection.ts:239-240` — `searchable` gates on `queryUses.includes("filter")` instead of `"search"`.
- 🟡 `descriptor-client/src/intake-operation-client.ts:11` — no relay allowlist entry → always 404; zero consumers. Add the relay op or delete client+contract.
- 🟡 `runtime-client.ts:158` — `input.kind` interpolated without a runtime guard (relay allows only two literals).
- 🔵 `entity-record-href.ts:17-19` emits `{recordId}` while the descriptor/runtime use `:recordId`; `home.tsx:1732` substitutes the brace form. Unify the dialect.
- 🔵 MDG country artifact declares `idField: "code"` while `resolveEntityReadRoute` requires a UUID record id → `/app/entity/country/US` would 404. Align storage identity with the URL contract.

### Frontend behaviour
- 🟡 `contracts/.../record-presentation.ts:213` — non-`primary-contact` providers map to the address renderer (round-1 #18, still live).
- 🟡 `form-detail/src/detail-workspace.tsx:48` — `descriptor.presentation!` on an optional field (round-1 #17, still live; line is 48, not 45).
- 🟡 `apps/neon/lib/entity-work-context.ts:8-20` — silently returns a legal-entity-only context while organizations are not ready, instead of flagging `context_required`.
- 🟡 `apps/neon/lib/operation-review.ts:8-34`, `named-role-review.ts:8-34` — module-lifetime memoisation of an env-derived handler; `currentIdentity` returns unvalidated `any` as governance authority.
- 🔵 `apps/neon/lib/entity-route-alias.ts:2`, `redirect-entity-record.ts:10` — zero callers; dead code (the latter is safe, not an open redirect).

### Accessibility (see §5)
- 🟠 `detail-workspace.tsx:194-257` menu inside `role="tablist"`; `record-navigation.tsx:119-160` `role="menu"` without keyboard; `collaboration-surface.tsx:315-333` dangling `aria-controls`; `:92-98,151-162` focus lost on deep-link close; `attachment-preview.tsx:114-120` silent post-ready failure.

---

## 2. Improvements

- **Pin and commit.** The uncommitted round-1 fixes plus the release-7 localization slice should be committed/qualified before further work; the review target otherwise keeps moving.
- **Wire `test:foundation-browser` into `test:root`** (or a CI job) and teach `tooling/scripts/testing/verify-test-reachability.mjs:15` about `.spec.ts` with a `tests/foundation-browser` runner entry. The entire country-path browser suite is currently invisible to CI.
- Add per-package `test` scripts for `packages/platform/entity/runtime/*` (none exist; `turbo test` runs nothing for them) or drop the turbo `test` task for them.
- Add `error.tsx` handling of `reset` (all planes declare `retry`, Next passes `reset`, so `ApplicationError` always hard-reloads).
- Memoise stable keys instead of `JSON.stringify` deps (5 AST-confirmed sites; 4 in `entity-lookup.tsx`).
- Introduce a shared `newCommandKey()`/`useIdempotencyKey()` (126 `crypto.randomUUID()` sites; ≥10 files re-implement the rotate-on-submit idiom).
- Route all storage through `foundation/ui/src/browser-storage.ts` (12 production accesses bypass it).
- Collapse the **5 duplicate `entityEnglishMessages[key]` fallback closures** into one `useEntityMessage()` in `@athyper/platform-i18n`.

---

## 3. Hardcoded values to standardize

Retained from round 1 plus round-2 additions:

- **`business_partner` special-casing** — `packages/planes/neon/entity-extensions/src/record-entities.ts:2,6`; `apps/neon/lib/entity-application-layout.tsx:17`; `apps/neon/lib/tenant-workspace-route.ts:3`. Confirmed live.
- **Country/status heuristics in generic list code** — `list-view/index.tsx:2592,4840,4867,4926-4927` (`country_code`, `/country/i`, `active`/`draft`), `columns.ts:42`, `overview.tsx:472-474`. Confirmed live.
- **Descriptor defaults duplicated in code** (round-2): page size 25 + conflicting `50` (`entity-list-service.ts:1338`, `query-service.ts:165`, `shared-reference-directory.ts:23`); `maxSortLevels` 3 (`entity-list-service.ts:101,950`, `query-service.ts:173`, `descriptor-parser.ts:219`); `minimumQueryLength` 1; `countMode` default; `humanize(entityCode)` (`entity-list-service.ts:381,535,916`); `"Overview"`/`"Edit"` (`entity-list-service.ts:499-513`, `form-detail/index.tsx:45`); `"Record ID"` (`:892`); surface keys `default_list`/`entity_application` (`:1009,196`); density `"comfortable"` (`list-view/index.tsx:558`, `apps/neon/lib/list-density.ts:2`).
- **Permission codes** duplicated at scale (`studio.platform.catalog.manage` ×23, `neon.relationship.business_partner.read` ×21) — no central registry.
- **Entity codes / routes / slugs** in `apps/neon/lib/catalog-routes.ts:18-69,126-140` and `experience-runtime.tsx:24-117`.
- **Entity label in compiler code**: `graph-builder.ts:58` hardcodes `"View record"` as the read operation label.
- **CSS hardcoding** — see §6.

---

## 4. Repeated code to standardize

- **5 byte-identical i18n fallback closures** (`filter-editor.tsx:318`, `data-validation.tsx:30`, `entity-lookup.tsx:99`, `reference-select.tsx:108`, `field-catalogue.tsx:184`, `overview-messages.ts:8`).
- **`localizeEntityLabels` does not cover `actions`, `badges`, `summaryView.cards` or `listPresentation.experience`** (`entity-labels.ts:20-36`) — the contract has no reference slot for them either (`record-presentation.ts:27-31,40-45,50-54`). Additive fix required; country authors none, so future entities are English-only.
- **Boolean/field value formatting split** between list (`Yes`/`No`) and detail (`String(value)`).
- **Three copies** of `orderSurface`/`safe`/`homeProps`/module-relevance scope derivation across the three planes (mesh and studio `experience-runtime.tsx` are identical except plane strings).
- **Descriptor defaults** duplicated across client and server (see §3).
- **126 `crypto.randomUUID()`** with two idioms mixed, no shared helper.
- **`JSON.stringify` dependency arrays** ×5.
- Retained: parser primitives ×~25 files, UUID validators ×3–5, canonical-JSON/server helpers ×5+ (round-1 §4).

---

## 5. Best practices & accessibility

- **ARIA (HIGH):** menu inside tablist (`detail-workspace.tsx:194-257`); `role="menu"`/`menuitemcheckbox` with no roving focus (`record-navigation.tsx:119-160`); `aria-controls` to non-rendered panels and focus restoration failure (`collaboration-surface.tsx:314-333,92-98,151-162`).
- **ARIA (MEDIUM):** `detail-collaboration.tsx:61` announces failure with `role="status"`; `record-header.tsx:176-188` no `aria-current` on the overflow summary; `record-summary-panel.tsx:114-119` Retry without adjacent context; `detail-workspace.tsx:229-230,305` tablist with no selected tab while collaboration is full.
- **Verified good (no action):** `collaboration-surface.tsx` resize separator has full keyboard/ARIA; `comments-workspace.tsx` has zero unlabelled form controls; `record-header.tsx` picker/tabs are mutually exclusive; `attachment-preview.tsx` `<img alt>`/`<iframe title>`.
- **Best practice:** 27 non-null assertions and 3 `as any` in the entity runtime (small); no `TODO`/`@ts-ignore`/`console.log`; test-only `any` dominates the repo counts.
- **Governance integrity:** three stub packages claim active status; `turbo test` is a no-op for seven runtime packages.

---

## 6. CSS / design-system compliance (requirement #6)

**2,166 declarations use raw values** across 8 files:

| file | hex | px(>1) | 1px | rem | vw/vh/dvh | z-idx | opacity | radius | motion | decls w/ raw |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `form-detail/src/styles.css` | 0 | 55 | 4 | 117 | 16 | 8 | 12 | 5 | 0 | 206 |
| `form-detail/src/record/record.css` | 1 | 7 | 2 | 63 | 5 | 3 | 1 | 8 | 0 | 79 |
| `form-detail/src/record/record-collaboration.css` | 0 | 2 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 7 |
| `form-detail/src/detail-workspace.css` | 0 | 3 | 0 | 4 | 2 | 0 | 0 | 0 | 0 | 8 |
| `collection-controls/src/styles.css` | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 2 |
| `list-view/src/styles.css` | 1 | 7 | 11 | 248 | 33 | 14 | 16 | 4 | 2 | 312 |
| `shell/src/styles.css` | 7 | 98 | 51 | 876 | 73 | 24 | 33 | 49 | 13 | 1140 |
| `foundation/ui/src/styles.css` | 11 | 54 | 49 | 271 | 27 | 2 | 9 | 13 | 5 | 412 |
| **Total** | **20** | **226** | **117** | **1585** | **157** | **51** | **71** | **79** | **20** | **2166** |

**Broken tokens (11)** — `--a-focus-ring-width`, `--a-focus-ring-color`, `--a-focus-ring-offset` (no-fallback `outline` → focus loss at `shell/styles.css:822`, `ui/styles.css:542,553`), `--a-font-size-heading` (`record-collaboration.css:3`), `--a-surface-subtle` (`ui/styles.css:522`, no fallback), `--a-on-brand`, `--a-surface-muted`, `--a-color-danger`, `--a-record-sticky-top`, `--a-toast-bottom-offset`, and `--a-page-sticky-top` (no fallback at `record.css:218,223,224`).
**Raw colours:** `record.css:67` `var(--a-color-surface, #fff)`; `list-view/styles.css:496` `var(--a-primary, #264f89)` — a **stale** brand (`--a-brand` is `#234b84`); `ui/styles.css:93,157-159,368`; `shell/styles.css:287,535,623,732`.
**No breakpoint tokens and no viewport-unit tokens exist** (131 raw `@media`; 157 `vw/vh/dvh` values) — the single largest systemic gap. 51 raw `z-index`; only 6 z tokens exist. 79 radii include off-scale values; `999px` vs `--a-radius-round:9999px`.
**No English prose in CSS** (only separator/chevron glyphs), but two glyph sets are used for the same affordance.

---

## 7. Localization (requirement #7)

**The release-7 architecture is sound and verified.** Authoring `labelKey`s survive compile → projection → parser → render; `entity-localization.test.ts` passes 14/14; all 29 Country label keys exist in en/ms/ar; `intl.text()` resolves catalog → English fallback → authored `defaultText` and **never evaluates ICU** (prototype-safe, `index.ts:196-199`); RTL is wired through the provider.

**Residual gaps (round-2):**
- **G1 🟡** `list-view/src/navigation.tsx:50` hardcodes an inline `{en, ms}` map for "Entity sections"/"More" — **no `ar`**, no catalog key (the key exists). Arabic users see English.
- **G2 🟡** No localization reference slot for `description`, `recordPresentation.actions[].label`, `badges[].label`, `summaryView.cards[].label`; `EntityPresentationLocalizationV1` = `{entity?, title?, fields}` only. Country authors none, so future entities with actions/badges/summaries are English-only.
- **G3 🟡** `entity-list-service.ts:503,510` synthesizes `"Overview"`/`"Edit"` with no `localizedLabel`.
- **G4 🟡** `entity-catalogs.ts:15` keys catalogs by `Intl.Locale(...).language`, but governance uses script codes; a future `zh-Hans` catalog would silently never load.
- **G5 🔵** `list-view/index.tsx:986` prefers the en-only `header.title` in the loading/error path.
- **G6 🟡 (pre-existing)** 544 hardcoded strings (§exec #3) — the largest real end-user gap.
- **G7 🔵** server-side application title resolution is locale-less (English on the wire; client re-localizes).
- **G8 🟡** only en/ms/ar catalogs exist while 8 locales are enabled — hi/ta/fr/de/zh-Hans fall back to English.

**Also:** `record-summary-panel.tsx:92` ignores `labelKey` (HIGH); `ENTITY_CATALOG_REVISION` (`entity-catalogs.ts:6`) is dead; catalogs are **parallel positional arrays** `[en, ms, ar]` composed by tuple index with `values[index]!` — order/length-fragile and untyped; `entity-catalogs.ts` imports `countryMessages` by name (future entities must edit the foundation package).

**Governance drift (not a bug):** authoring `capabilities.json:93` says `defaultAudience: "public"`, but active releases deliberately keep `private` (release-7 amendment is label-only). This is documented (`entity-localization-foundation-20260928.md:8-9,143`) but is a source-of-truth trap — a future full re-import or collaboration amendment would silently flip it.

---

## 8. Naming & organization (requirement #8)

- **5,275-line** `list-view/src/index.tsx` (confirmed); `form-detail/src/index.tsx` mixes runtime + helpers + barrel.
- **Dead code:** `apps/neon/lib/entity-route-alias.ts`, `redirect-entity-record.ts`; `workspace-module-relevance.ts:5` re-export.
- **Stub packages** presented as active (`content-ui`, `cascade`, `workflow-ui`); `content-ui`/`workflow-ui` declare a React peer + React tsconfig while exporting nothing.
- **Two route-template dialects** (`{recordId}` vs `:recordId`).
- **Divergent names for identical logic:** `safe` vs `internalPath`; `humanize` (form-detail) vs the record-presentation label fallback.
- **Plane drift:** mesh/studio `experience-runtime.tsx` identical except plane strings; three different context-loading strategies (studio in-process `/api/auth/contexts`, mesh no contexts, neon bootstrap).
- **`component → package` coupling:** generic `entity-catalogs.ts` imports the Country catalog by name.

---

## 9. Test coverage

| Country-path surface | Status |
|---|---|
| `list-view/index.tsx` | COVERED (`entity-list-phase1a`, `entity-list-plane-parity`, contract tests) |
| `detail-workspace.tsx` | COVERED (`metadata-detail-navigation.spec.ts` drives the **real Country definition.json**) |
| `record-navigation.tsx` | COVERED (tabs, keyboard, RTL, forced-colors, history) |
| `record-header.tsx`, `collaboration-surface.tsx`, `detail-collaboration.tsx` | COVERED |
| `compiled-section-content.tsx` | PARTIAL (the wiring spec replaces it with a fixture) |
| `attachment-preview.tsx` | **GAP** — no direct test (renders untrusted URLs) |
| `record-summary-panel.tsx`, `comments-workspace.tsx` | PARTIAL (indirect only) |

**Blocking gap:** the browser suite is not wired into any default aggregate (§2), and `packages/platform/entity/runtime/*` has zero in-package tests.

---

## 10. Priority action plan

1. **Pin a commit**; commit/qualify the in-flight round-1 fixes + localization slice.
2. **Cross-plane parity:** port the entity route/proxy/catalog/lib adapters to Mesh and Studio (country/entity surfaces are unreachable there today).
3. **Fix broken design tokens** (`--a-focus-ring-*` first — focus loss is an accessibility regression), then stand up a token/`px`/hex lint gate.
4. **Wire the browser test suite** into the default aggregate + reachability policy.
5. **Accessibility:** fix the tablist/menu ARIA, the dangling `aria-controls`, and focus restoration.
6. **Descriptor fidelity:** boolean rendering, `tabs: []`, read-only affordance, `searchable` gate, `profileKey` (wire or delete), duplicated defaults.
7. **i18n completion:** consolidate the 5 fallback closures; close G1–G4/G8; add reference slots for actions/badges/summary/description before other entities ship.
8. **Remove stub packages or mark them reserved**; correct governance claims.
9. **De-duplicate:** entity-code validators, parser primitives, idempotency-key helper, storage access, route-template dialect.

---

*Round 2 delivered 2026-09-28. No source files were modified; this report and the round-1 report are the only artifacts written.*
