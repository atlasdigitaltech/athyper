# Country Entity App — Comprehensive Code Review

**Scope:** Meta Entity Driven "Country" app published/compiled into **Neon, Mesh, Studio**.
Review basis: `docs/reports/country-route-typescript-inventory-20260928.md` (655 .ts/.tsx files) plus the design-system (`@athyper/platform-theme`) and i18n (`@athyper/platform-i18n`) infrastructure. Six independent deep-dives covered: (1) app route adapters + shell + collaboration-ui; (2) contracts `entity-list` + `entity-runtime`; (3) runtime surfaces `list-view` + `collection-controls` + `descriptor-client` + `content-ui`/`cascade`/`workflow-ui`; (4) `form-detail`; (5) server services `publication`/`records`/`experience`/`metadata`/`collaboration`/`attachments` + contracts; (6) server composition `shared/entity-runtime` + `shared/publication`.

**Verdict:** the *architecture* is strong — a generic descriptor-driven runtime, correct authorization boundaries (registration ≠ authorization), fail-closed server code with no SQL injection, a complete token system, and a complete i18n runtime. The *execution* has systemic gaps that will compound now that this is the base for the whole application:

1. **Localization is bolted on, not adopted.** `@athyper/platform-i18n` exists and ~8 files use it, but **hundreds** of user-facing strings are hardcoded English across every UI package; the shell already has `useShellI18n()` + `messages.ts` and it is not used either. Only an English catalog exists for 8 declared locales.
2. **The design system is bypassed in the new code.** `record.css` references **3 non-existent tokens** plus raw hex; raw values total ~500 `rem` + ~140 `px` + raw hex/z-index across four CSS files; `list-view/styles.css:366` even bakes a user-facing label (`content:"Controls"`) into CSS.
3. **The generic route layer hardcodes `business_partner`** (and `country_code`/`/country/i`/`active`/`draft` heuristics leak into generic list code), and the three planes (Neon/Mesh/Studio) duplicate near-identical page/runtime code instead of sharing it.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low.

---

## Executive summary — top issues (all scopes)

1. 🟠 **`form-detail/src/attachment-preview.tsx:46-50`** — sanitized `attachmentCapabilityUrl()` result is discarded; the raw `result.url` is rendered into `<img>`/`<iframe>`, defeating the cross-origin isolation the code claims to enforce (`attachment-thumbnail.tsx` does it correctly).
2. 🟠 **`form-detail/src/compiled-section-content.tsx:52-59`** — one malformed comment/attachment row throws inside `items.map(...)` and blanks the **entire** section (intended behavior is per-item "omit malformed", as in `comments-workspace.tsx:1361-1368`).
3. 🟠 **`form-detail/src/record/record-navigation.tsx:265-275`** — `selectSection()` writes browser history twice (page `onSelectSection` already pushState, then `selectSection` replaceState) → duplicate/conflicting history entries.
4. 🟠 **`composition/shared/publication/workload-routes.ts:26-64`** — route declared `authenticated: true` but no `authenticate` middleware is wired; the tenant-principal rate-limiter is ordered *after* the handler, so the publication execution endpoint is neither IAM-authenticated nor rate-limited at the middleware layer.
5. 🟠 **`contracts/platform/entity-list/src/url-state.ts:39-46`** — `decodeListLocationState` feeds untrusted `?view/?density/?sort/?filter.*/?page/?pageSize/?width.*` into `parseState`, which *throws*; malformed URLs become a trivial exception-DoS despite the "normalize away" contract.
6. 🟠 **Parser primitives duplicated ~25 files** (`object/text/key/code/choice/oneOf/hash/timestamp/uuid/fail`) with *incompatible* regexes, bounds, and error types — a value valid in one contract fails in another (e.g. entity-code grammar diverges in ≥5 places).
7. 🟠 **`contracts/.../entity-record-href.ts:7` vs the app `page.tsx:6,33`** — entity-code validation diverges (`[A-Za-z0-9_.-]{0,126}` vs `[a-z0-9_]{1,62}`); codes the runtime accepts 404 at the route.
8. 🟠 **`records/src/kysely-record-repository.ts:177`** — `toStorage` maps unknown input keys to raw column names (`fields.get(key) ?? key`); safe vs injection but bypasses the descriptor field allow-list if ever called with unvalidated input.
9. 🟠 **`records/src/field-validation.ts:24`** — `new RegExp(pattern)` on descriptor-supplied patterns with no safety validation → ReDoS/500 vector driven by published metadata.
10. 🟠 **`collection-controls/src/filter-editor.tsx:52,94,520`** — `window.sessionStorage` read synchronously during render with no `typeof window` guard (SSR crash), unlike `browser-storage.ts`.
11. 🟠 **`crypto.randomUUID()` unguarded** (`data-operations.tsx:53,85`; `index.tsx:1127,3286`; `overview-favourites.tsx:276`) — throws on non-secure (http) origins.
12. 🟠 **Localization** — hundreds of hardcoded English strings across all UI packages (see §7).
13. 🟠 **CSS design-system violations** — broken token refs + raw hex/z-index/rem/px; `content:"Controls"` in CSS (see §6).
14. 🟡 **Hardcoded permission codes** duplicated widely (`studio.platform.catalog.manage` ×23, `neon.relationship.business_partner.read` ×21, `neon.relationship.entity_case.*` ×10) with no central registry.
15. 🟡 **`records/src/entity-authorization.ts:266` / `entity-backend-authorizer.ts:426`** — fail-closed but silent catch-alls convert genuine resolver/authorizer bugs into "unavailable/deny", masking outages.

---

## 1. Bugs to fix

### Frontend runtime
- 🔴 **`packages/platform/entity/runtime/form-detail/src/attachment-preview.tsx:46-50`** — sanitized `attachmentCapabilityUrl()` output is computed then discarded; the raw server `result.url` is rendered into `<img>`/`<iframe>`. Fix: render the sanitized URL (mirror `attachment-thumbnail.tsx`).
- 🔴 **`form-detail/src/compiled-section-content.tsx:52-59`** — `items.map(asComment|asAttachment)` throws on the first malformed row and clears the whole section. Fix: `.flatMap` with per-item try/catch.
- 🔴 **`form-detail/src/record/record-navigation.tsx:265-275`** — double history write (page `onSelectSection` pushState + `selectSection` replaceState). Fix: single writer.
- 🔴 **`form-detail/src/record/record.css:65,84,208`** — `var(--a-color-border, #ccd6e3)`, `var(--a-color-text-muted, #5d6b82)`, `var(--a-surface-subtle)` reference **non-existent** tokens (correct aliases are `--a-border-color`, `--a-text-muted`, `--a-color-surface-subtle`) → raw-hex fallback / unset background; breaks dark & high-contrast modes. Fix: canonical tokens + CI gate.
- 🟠 **`contracts/platform/entity-list/src/url-state.ts:39-46`** — URL-param exception DoS (see exec summary #5).
- 🟠 **`collection-controls/src/filter-editor.tsx:52,94,520`** — SSR-unsafe `window.sessionStorage` during render.
- 🟠 **`data-operations.tsx:53,85` / `index.tsx:1127,3286` / `overview-favourites.tsx:276`** — unguarded `crypto.randomUUID()`; use the `randomId()` fallback already in `location.ts:55`.
- 🟠 **`form-detail/src/detail-workspace.tsx:45`** — `descriptor.presentation!` non-null assertion on an optional field; crashes if a future caller omits it. Guard explicitly.
- 🟠 **`contracts/entity-runtime/src/record-presentation.ts:206`** — `summaryViewFromPanel` maps every non-`primary-contact` provider to `"platform.address.summary.v1"`; future providers silently become address summaries.
- 🟡 **`form-detail/src/index.tsx:47`** — `safeError()` returns raw `error.message` (leaks server text, unlocalized).
- 🟡 **`form-detail/src/entity-lookup.tsx:143-149,317`** — `requireAction()` creates an `AbortController` that is never aborted (listener leak).
- 🟡 **`form-detail/src/attachment-preview.tsx:92-96`** — `<iframe>` has no `sandbox`.
- 🟡 **`form-detail/src/record/record-url-state.ts:53`** — `asOf` validated only by a date regex; `"2024-99-99"` passes.
- 🟡 **`form-detail/src/record/intake-state.ts:32`** — `flow.steps[0]!.key` throws on empty flow.
- 🟡 **`list-view/src/index.tsx:614`** — ref mutation during render; `:1493-1513` debounce keyed on a non-memoized `onChange` (timer resets on parent re-render).
- 🟡 **`list-view/src/index.tsx:1660-1663,5138`** — state derived from string-matching user-facing copy (`"System default has been applied"`, `title.startsWith("Loading")`).
- 🔵 **`list-view/src/location.ts:31-34`** — `push` never removes the prior session token (unbounded `sessionStorage` growth).
- 🔵 **`list-view/src/directory-filters.tsx:25-29`** — `organizations` type omits `code` but code relies on `"code" in org`.

### Server
- 🟠 **`server/.../records/src/kysely-record-repository.ts:177`** — field allow-list bypass (see exec summary #8). Throw on unknown keys.
- 🟠 **`server/.../records/src/field-validation.ts:24`** — ReDoS via metadata-supplied `new RegExp(pattern)`; validate/compile at descriptor-parse time and bound length.
- 🟠 **`server/.../shared/publication/workload-routes.ts:26-64`** — misleading `authenticated:true` + rate-limiter ordered after handler (see exec summary #4).
- 🟠 **`server/.../records/src/entity-authorization.ts:266` / `entity-backend-authorizer.ts:426`** — silent fail-closed catch-alls mask logic errors; log the swallowed error and distinguish denial from failure.
- 🟡 **`server/.../shared/publication/capability-qualification.ts:26-28`** — empty/absent capability set returns success; publish an entity whose capability surface was accidentally omitted.
- 🟡 **`server/.../entity-attachment-admission.ts:88-89`** — hardcoded `content.item` / `atlas.prompt` bypass with caller-dependent `undefined` semantics.
- 🟡 **`server/.../shared/publication/kysely-publication-authority-work.ts:292-298`** — `?:`/`||` precedence minefield in the compilation-source count assertion.
- 🟡 **`server/.../shared/publication/workload-configuration.ts:37`** — `!(stat.mode & 0o022)` accepts world/group-readable credential config (0644 passes); require `0600`.
- 🟡 **`server/.../records/src/query-service.ts:288-303`** — per-row re-authorization (N+1) and whole-list 403 on any row.
- 🔵 **`server/.../shared/entity-runtime/persisted-scopes.ts:76-77`** — raw `::uuid` cast on request input throws a 500 on malformed UUIDs (should return `{state:"invalid"}`).
- 🔵 **`server/.../shared/entity-runtime/published-record-header.ts:28,30`** — `String(...)` ID coercion + silently dropped missing fields.
- 🔵 **`server/.../records/src/kysely-record-repository.ts:155`** — `%${search}%` without `escapeLike` (user `%`/`_` act as wildcards).

---

## 2. Improvements

- **Split the 5,200-line god-file** `packages/platform/entity/runtime/list-view/src/index.tsx` (runtime + shell + 6 drawer dialogs + table/card renderers + popover + selection bar + footer). Highest-leverage maintainability fix.
- **Split oversized server files:** `kysely-publication-authority-work.ts` (951 lines: discovery + compilation + signing + dispatch), `transfer-service.ts` (2244), `platform/experience/service.ts` (1893), `entity-case-contract-service.ts`.
- **Memoize hot allocations:** `list-view/index.tsx:1284,1292` (`new Set/Map` per render), `:1159-1187` (loader closure per render).
- **Use AbortController** in `import-workspace.tsx:26-38` and `data-operations.tsx:85` (fetch), and add `signal` to descriptor-client create/patch (inconsistent with intake/runtime clients).
- **Index hot lookups:** `apps/neon/lib/entity-route-context.ts:8-13` nested loop → `Map`; `composition/shared/entity-runtime/route-admission.ts:22-26` per-entity descriptor reads → batch/cache.
- **Move slow external probes outside locks/transactions** in `compilation-recovery-execution.ts:20-38` (ClamAV/S3 held under an advisory lock + transaction).
- **Replace string-matching error→status maps** (`entity-case-contract-routes.ts:346-365`, `policy-enrollment-routes.ts:28-36`, `workload-routes.ts:68-72`) with typed error codes.
- **Consolidate the three planes' `experience-runtime.tsx` / `page.tsx` / `catalog-routes.ts`** into a plane-parameterized shared package (see §10).

---

## 3. Hardcoded values to standardize

### Entity / permission / route / workspace codes (generic code must not hardcode these)
| File | Hardcoded value |
|---|---|
| `apps/neon/lib/entity-application-layout.tsx:17` | `entityCode === "business_partner"` |
| `apps/neon/lib/tenant-workspace-route.ts:3` | `"/mdg/business-partner/register"` |
| `packages/planes/neon/entity-extensions/src/record-entities.ts:2,6` | `["business_partner"]`, `"/mdg/business-partner"` |
| `apps/neon/lib/catalog-routes.ts:18-69,126-140` | entity codes, slugs, names, `mdg`/`bp`, paths/aliases |
| `apps/neon/lib/experience-runtime.tsx:24-117,219-227` | `business_partner(_request)`, permissions `neon.relationship.entity_case.create/.read`, `neon.relationship.business_partner.read`, `/mdg/…`, `scm`/`com`/`bp`/`mdg` |
| `list-view/src/index.tsx:2582,4857,4916`; `columns.ts:42`; `overview.tsx:472-474` | **`country_code`, `/country/i`, `active`/`draft`, `updated_at`/`updatedAt`** heuristics in generic list code |
| `contracts/entity-runtime/src/related-presentation.ts:73-138,543` | `RELATED_RECORD_MODELS` entity codes + `entityCode !== "business_partner"` gate |
| `contracts/entity-list/src/scope-filters.ts:17`; `standard-views.ts:71`; `intake-data.ts:1-25` | `supplier`/`customer`, relationship sources, 24 reference-source codes |
| `form-detail/src/record-header.tsx:58` | `resolveIcon(header.iconKey ?? "file-text")` |
| `collection-controls/src/index.tsx:102` | list-view drawer keys `"views"`/`"display"`/`"filters"` leaked into generic package |
| server: `entity-attachment-admission.ts:88` | `content.item`, `atlas.prompt` |

- **Permission codes duplicated at scale** (no registry): `studio.platform.catalog.manage` ×23, `neon.relationship.business_partner.read` ×21, `neon.relationship.entity_case.read` ×10, `common.platform.reference.view` ×7, plus `studio.metadata.contract.*` / `studio.metadata.publication_policy.*` in composition. Create a central permission registry.
- **Schema/table/column/service-key literals** inline in SQL and code (server): `document.attachment` ×31, `runtime_meta`, `publication.release`, handler/resolver keys `entity.record.list.v1`, `platform.comments.v1`, etc. Use a typed Kysely schema / constants.
- **Magic numbers** (move to named config): `limit:100`/`pageSize:20` (transfer-workspace), 200 favourites, 50 lookup page size, 100 org cap, 20-column warning, 350ms debounce, 60s cache, 12/10 skeletons; `1500ms` vs `3000ms` `statement_timeout` (inconsistent); 5MB attachment size; 12-tab / 200-char / 126-char limits; `2000→10000ms` + 5 retries polling; 120s capability URL.
- **Route/convention drift:** `descriptor-client/src/index.ts:7-8` mixes `/records/{entity}` vs `/entity-runtime/{entity}/records/...`; `/operations/data-transfers`(+`/new`) repeated 5×; `{recordId}` vs `:recordId` placeholder dialects.

---

## 4. Repeated code to standardize

1. **Parser primitives ×~25 files** (`object/text/key/code/choice/oneOf/hash/timestamp/uuid/fail`) with divergent regexes/bounds/error types → extract ONE shared tested module with `__proto__` rejection + deep-freeze. This single change collapses §1 divergence bugs, this duplication, and §5 inconsistency at once.
2. **Route guards + UUID regex** duplicated in all three `page.tsx`; `isEntityId` (`route-params.ts`) vs the inline UUID regex vs strict RFC-version regexes in `attachment-client.ts`/`clipboard-converter.ts`/`validate-clipboard-document.ts` — three UUID dialects.
3. **`page.tsx`** mesh vs studio byte-identical; neon a superset. **`experience-runtime.tsx`** ~95% duplicated across the three planes (`Resolved*Surface`, `orderSurface`, `AccessUnavailable`, `SurfaceUnavailable`, `safe`/`internalPath`, `homeProps`, `AtlasWelcome`).
4. **`catalog-routes.ts`** mesh/studio identical one-liners; neon overlay.
5. **Query-string serialization** (`entity-route-alias.ts` vs `redirect-entity-record.ts`).
6. **Path sanitizer `safe`/`internalPath`** identical in all three planes.
7. **"Localize-or-fallback" helper ×5** (`filter-editor.tsx`, `reference-select.tsx`, `entity-lookup.tsx`, `field-catalogue.tsx`, `overview-messages.ts`) → one `useEntityMessage()` hook.
8. **`humanize` ×2** (`form-detail/index.tsx:46` vs `record-presentation.ts:313`), divergent behavior.
9. **Entity-key regex ×4** + **hash format ×3** (`[0-9a-f]{64}` vs `sha256:…` vs `(?:sha256:)?…`) + **timestamp validator ×2** (UTC-only vs offset) + **UUID validator ×2**.
10. **Server:** canonical-JSON `stable()` ×5, `compareVersions` ×2, coordinate→scopeKind map ×2, capability-action vocabulary ×2 (drifting: `category` in one only), `sha256(canonicalJson)` ×5, UUID regex ×5 (one loose), dev-only environment gate ×6, DB-context stamping ×8, principal-liveness SQL ×4.
11. **Storage-key builders ×5** (`athyper.entity-list.views.…`, `.preferences.…`, `.recent.…`, `.location.…`, `athyper.record-transfer.views.…`).

---

## 5. Best-practice compliance

- **`any` / non-null assertions:** ~25 `any` sites server-side, 3 `as any` + 42 `!.` in the runtime packages; `Record<string, any>` in several contracts. Replace with `unknown` + narrow guards.
- **Good:** no `TODO`/`FIXME`/`@ts-ignore`/`console.log` in the reviewed runtime packages; all six runtime packages typecheck clean; AbortControllers used correctly in most effects; server SQL is parameterized (`sql.ref`/`sql.table`) with no injection; fail-closed authorization; defense-in-depth (zip-bomb/macro/XSS/file-size, sha256 proof-of-content, generation-keyed cache invalidation, advisory locks).
- **Fragile patterns to fix:** string-matching for error→status and for UI state; ref writes during render; `void historyVersion` lint-suppression; `JSON.stringify` as array/object dep; `Object.keys().sort().join()` as object schema check (`enrollment-contract.ts`, `workload-configuration.ts`).
- **Consistency:** freeze-on-return is inconsistent (many contracts freeze; `detail-navigation.ts`, `record-360-panel.ts`, `recent-choice.ts`, `lookup-options.ts`, several server registries do not).
- **Error boundaries:** none per runtime surface/drawer — a single render throw crashes the whole list; add per-surface boundaries and a route-level `error.tsx` under `(shell)/app/entity/[entityCode]`.

---

## 6. CSS / design-system compliance (requirement #6 — failing)

Token system (`FOUNDATION_TOKENS.spacing/radii/elevation/zIndex/motion`, `COLOR_TOKENS`, `DENSITY_TOKENS`; vars `--a-*`) is complete. The runtime CSS does not follow it:

| File | raw hex | raw px | raw rem | broken token refs |
|---|---:|---:|---:|---:|
| `list-view/src/styles.css` | 1 (`#264f89` @ :499) | 35 | 289 | 0 |
| `form-detail/src/record/record.css` | 3 (`#ccd6e3`,`#fff`,`#5d6b82`) | 20 | 69 | **3** |
| `form-detail/src/detail-workspace.css` | 0 | 8 | 10 | 0 |
| `form-detail/src/styles.css` | 0 | 81 | 127 | 0 |
| `shell/src/styles.css` | 0 | many | many (`--shell-rail:17.5rem`, `34rem`, `70dvh`) | 0 |
| `collection-controls/src/styles.css` | 0 | 0 | `8rem/7rem/9rem`, `40dvh` | 0 |

Concrete offenders (non-exhaustive):
- 🔴 **Broken token refs** — `record.css:65` `--a-color-border`, `:84` `--a-color-text-muted`, `:208` `--a-surface-subtle` (see §1).
- 🟠 **`list-view/styles.css:366`** — `content:"Controls"` embeds user-facing English inside CSS (cannot localize). Render the label in JSX.
- 🟠 **`list-view/styles.css:499`** — `accent-color:var(--a-primary,#264f89)` raw hex fallback.
- 🟠 **Raw `z-index`** — `record.css:219,381,398` (`16/8/6`), `styles.css` (`5/3/2`), `list-view/styles.css:5,32,61,81,468,423` — should be `--a-z-*`.
- 🟡 **Raw rem/px** — `record.css:23,29,34,42,46,54,60,66,68,105-107,115-116,122,124,125,127,132,139,140,154,158,172,198,202,313,318-319,327-331,347,386,435,452,478,544,558`; `styles.css:6,7,93,99,104(16px!),114,165,208,318,373,453`; `list-view/styles.css` `.a-entity-pulse`/`.a-transfer-workspace` blocks; `detail-workspace.css:51,123-124`.
- 🟡 **Raw focus** — `outline:2px solid` (should be `var(--a-focus-width)`); `outline-offset:2px` vs token `--a-focus-offset:2px`.
- 🟡 **Raw breakpoints** — inconsistent `40/48/48.001/64rem` + `480/600/700/720/760/761/1100px`; near-duplicate `48rem`(768px) vs `760px`/`720px`.
- 🟡 **Inline SVG geometry** — `width="16" height="16" strokeWidth="2"` in `comment-audience-picker.tsx:87`, `rich-comment-composer.tsx:279,282`; use `@athyper/platform-icons` + tokens.

**Required action:** (a) fix the three broken token refs; (b) migrate raw spacing/radii/z-index/motion/focus/breakpoints to tokens; (c) add a CI stylelint gate (`declaration-property-value-disallowed-list` for `px`/hex/raw `z-index`) so new CSS can't reintroduce hardcoding.

---

## 7. Localization (requirement #7 — failing)

Infrastructure is correct: `@athyper/platform-i18n` (`useOptionalI18n()`, `<Message>`, `createIntlRuntime`, ICU). Field/section labels legitimately come from published metadata (`detail-workspace.tsx:146-148`). But:

- **Hundreds of hardcoded English strings.** Representative sites (non-exhaustive): `list-view/index.tsx` (~80 strings in toolbars/drawers/empty states/pagination/selection bar), `data-operations.tsx`/`import-workspace.tsx`/`transfer-workspace.tsx` (whole screens), `overview.tsx`/`overview-favourites.tsx`, `columns.ts`, `scope-control.tsx`, `directory-filters.tsx`, `required-context-status.tsx`, `field-catalogue.tsx`, `drawer-registry.tsx`; `form-detail`'s `record-header.tsx` ("Historical read-only view"/"More actions"/"Technical details"/"Record sections"/"Section"/"More sections"), `collaboration-surface.tsx` ("Files"/"Comments"/"Collaboration"), `comments-workspace.tsx` (dozens), `attachment-workspace.tsx`, `file-search.tsx`, `protected-value.tsx`, `entity-runtime-workspace.tsx`, `contact-address.tsx`, `section-primitives.tsx`, `entity-lookup.tsx`; `collaboration-ui`'s `rich-comment-composer.tsx`, `comment-audience-picker.tsx`, `clipboard-converter.ts`, `attachment-client.ts`, `upload-lifecycle.ts`, `validate-clipboard-document.ts`; `shell`'s `record-footer.tsx`, `record-information.tsx`; all three `experience-runtime.tsx`.
- **Shell i18n exists but is unused** (`useShellI18n()` + `messages.ts` with English/Arabic catalogs) — the shell components hardcode English instead.
- **Inconsistency within a file:** `field-catalogue.tsx` imports the i18n helper yet hardcodes "No matching fields.".
- **Only one language catalog:** `entityEnglishMessages` is English-only while `SUPPORTED_UI_LOCALES` declares 8 locales; the `message()` fallback therefore always renders English for ar/ms/zh/hi/ta/fr/de.
- **Contracts leak English:** `validation-messages.ts` `DataValidationError`, `intake-surface.ts` `validateIntakeSurface`, `intake-data-values.ts` `dataSurfaceValues` throw literal English strings instead of i18n keys/codes.
- **Authoring note:** the published Country descriptor ships English-only labels (`listPresentation.header.title.values = {en}`; `recordPresentation.sections[].label` "Country"/"Phone"/"Postal and address"/"Audit"). For full localization these must be authored as localized resources.

**Required action:** (a) migrate all chrome/messages to `entityEnglishMessages`/shell catalog keys via `useOptionalI18n().message(id)`; (b) add translated catalogs per locale; (c) lint-fail any new string literal in `*.tsx`; (d) make contracts emit structured codes, not prose.

---

## 8. Naming & organization (requirement #8)

- **God-files:** `list-view/src/index.tsx` (~5,263 lines), `form-detail/src/index.tsx` (runtime + helpers + barrel), `server/.../kysely-publication-authority-work.ts` (951), `transfer-service.ts` (2244), `experience/service.ts` (1893).
- **Divergent names for identical logic:** `safe` (mesh/studio) vs `internalPath` (neon); `humanize` vs `label` fallback; `titleCase`/`title`/enum-title-casing.
- **Empty stub packages** `content-ui`/`cascade`/`workflow-ui` (`export {}`) with react peer deps and `main`→empty module — misleading "runtime surface" names; implement or remove.
- **Leaked domains:** `collection-controls/index.tsx:102` (list-view drawer keys in generic package), `collection-controls/styles.css:7` (foreign `.athyper-activity-query--compact`).
- **Missing barrels:** `shared/entity-runtime/` and `shared/publication/` have no `index.ts`; `register-services.ts` imports each file individually.
- **Misleading names:** `workspace-side-panel.tsx` (actually a claim/release context contract); `metadata.ts` `registerEntityMetadata` (3 jobs: reader wiring, migration bridge, plane dispatch); `entity-case-contract-service.ts` returns `bundleHash`/`contractHash`/`bundle`/`contract` aliases.
- **Dead expression:** `server/.../xlsx-workbook-codec.ts:48` `Math.min(10_001, 2_000)` is always `2000`.

---

## 9. Server-side security & correctness (composition + services)

- **No Critical unauthenticated bypass and no SQL injection found** — Kysely params/`sql.ref`/`sql.table` used correctly; authorization is fail-closed. Findings are hardening/correctness.
- 🟠 `workload-routes.ts:26-64` (mis-ordered rate-limit + misleading `authenticated:true`) — see exec summary #4.
- 🟠 `kysely-record-repository.ts:177` and `field-validation.ts:24` — see exec summary #8/#9.
- 🟡 `entity-authorization.ts:266` / `entity-backend-authorizer.ts:426` / `retrieval-admission.ts:137` — fail-closed but silent catch-alls mask outages; log and distinguish denial from error.
- 🟡 `capability-qualification.ts:26-28` — empty capability set passes (contradicts "mandatory for every target").
- 🟡 `entity-attachment-admission.ts:88-89` — hardcoded legacy entity bypass with ambiguous `undefined` return.
- 🟡 `workload-configuration.ts:37` — credential config accepts 0644; require 0600.
- 🟡 `compilation-recovery-execution.ts:20-38` — slow external probes held under transaction + advisory lock.
- 🟡 `compiled-runtime.ts:46-48` — publisher-principal check omits `provisioning_source='internal'` (inconsistent with siblings).
- 🟡 `kysely-record-repository.ts:155` — `%${search}%` unescaped LIKE wildcards.
- 🔵 `persisted-scopes.ts:76-77` — malformed UUID → 500; `published-record-header.ts:28,30` — ID coercion + silent field drops.
- 🔵 `policy-enrollment-routes.ts:28-36` / `workload-routes.ts:68-72` — regex-over-`Error.message` status mapping (fragile).
- 🔵 `bulk-service.ts:25`, `entity-definition-service.ts:444`, `collaboration-service.ts:532` — raw `error.message`/internal text echoed to clients.

---

## 10. Cross-plane divergence (Neon vs Mesh vs Studio)

1. **page.tsx** — mesh = studio (byte-identical); neon adds record-context resolution, catalog overlay, `?density` (searchParams), and per-route entitlement wrapping. Net: `?density` and the record-detail path work only on neon; mesh/studio always render `EntityReadRuntime` bare.
2. **experience-runtime.tsx** — 372 vs 293 vs 293 lines, ~95% duplicated, differing only by plane name + hardcoded home content.
3. **catalog-routes.ts** — neon builds an overlay; mesh/studio are passthrough.
4. **Entity-code validation** — app-route regex (`[a-z0-9_]`) vs contract (`[A-Za-z0-9_.-]`).
5. **UUID validation** — loose (page/route-params) vs strict (attachment/clipboard).
6. **`catalog.summary`** — mesh/studio `entityCount ?? moduleCount ?? 0` vs neon `entityCount ?? 0`.
7. **Module relevance** — shared 5-arg hook (mesh/studio) vs neon local 3-arg wrapper.
8. **Home/navigation content** — mesh/studio derive from catalog + entitlements; neon hardcodes `HOME_PROPS` with permission gates.
9. **Fallback UI** — mesh/studio styled `.athyper-experience-state` with "Return to … home" link; neon bare `<section role="alert">`, no link.

**Consolidation:** a single `@athyper/platform-entity-route-shell` package parameterized by `{ plane, catalogRoutes, surfaceOverrides, homeContent, extensions, assets }`; keep only neon's catalog overlay + record adapters plane-local; move `isEntityId`/entity-code/UUID validators into `@athyper/contract-platform-entity-runtime`.

---

## 11. Priority action plan (base-for-development hardening)

1. **Security/correctness now:** `attachment-preview.tsx` sanitized-URL discard; `workload-routes.ts` auth/rate-limit ordering; `kysely-record-repository.ts:177` allow-list; `field-validation.ts` ReDoS; `url-state.ts` URL DoS; `record-navigation.tsx` double history.
2. **Design system:** fix broken tokens; add CI CSS-token lint gate; migrate raw values.
3. **Localization:** add i18n lint gate; migrate hardcoded strings; add translated catalogs.
4. **Extract shared primitives:** one parser-primitive module (collapses §1/§4/§5), one `useEntityMessage()`, one UUID/entity-code/hash/timestamp validator, one canonical-JSON/`hashCanonical`/`stampContext` server helper.
5. **Consolidate the three planes** into a plane-parameterized route/experience shell.
6. **Remove entity special-casing** (`business_partner`, `country_code`/`/country/i`/`active`/`draft`) from generic runtime code; drive from the published descriptor.
7. **Split monoliths** (`list-view/index.tsx`, `form-detail/index.tsx`, `kysely-publication-authority-work.ts`, `transfer-service.ts`).
8. **Centralize permission codes** and table/schema/service-key constants.

---

*Review delivered 2026-09-28. No source files were modified; only this report was written.*
