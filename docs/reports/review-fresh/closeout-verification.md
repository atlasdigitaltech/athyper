
---

## F1 — CSS/design system: theme-token gate walks `.next-bp-consolidated` (ADVERSARIAL VERIFICATION)

**Cited at:** `tooling/scripts/policy/verify-theme-token-integrity.mjs:20-27`
**Verdict: PARTIAL — code defect confirmed and reproduced exactly; severity HIGH is overstated (reassessed MEDIUM).**
**Consequence class: not user-visible, not security-relevant.** It is a developer/CI tooling-correctness
defect (phantom findings + misattributed stale artifacts), with no effect on the served
`/app/entity/country/` route or on any runtime/API behaviour.

### 1. Cited code exists as quoted
`verify-theme-token-integrity.mjs:20-27` is verbatim:
```js
const IGNORE_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "node_modules"]);
```
and `stylesheetsBelow()` (`:35-55`) skips only on exact membership:
`:41` `if (!IGNORE_DIRS.has(entry.name)) {`. No `.next-*` / prefix rule anywhere in the file.

### 2. Reproduced against the live working tree
`node tooling/scripts/policy/verify-theme-token-integrity.mjs` reports 11 unresolved references, **3 of
them from generated output**, and `--strict` exits **1**:
```
apps/studio/.next-bp-consolidated/static/chunks/0adjft-j9-1qj.css:1 --a-on-brand (1x)
apps/studio/.next-bp-consolidated/static/chunks/1xz07w6xqovn0.css:1 --a-record-sticky-top (1x)
apps/studio/.next-bp-consolidated/static/chunks/1xz07w6xqovn0.css:1 --a-surface-subtle (1x)
```
Splitting findings by path (via the exported `analyzeThemeTokenIntegrity`): 11 total, 8 from source
(`packages/**`), 3 from `apps/studio/.next-bp-consolidated/**`. Both directories exist and the four
`.css` files are all under the generated tree.

### 3. Staleness / misattribution is real
* `.gitignore:48` is `**/.next-*/`; `git check-ignore -v apps/studio/.next-bp-consolidated/static/chunks/0adjft-j9-1qj.css`
  → `.gitignore:48:**/.next-*/`. The repo declares this tree generated.
* The alternate `distDir` is legitimate, not litter from a stray build:
  `apps/studio/next.config.ts:4-5` reads `process.env["ATHYPER_NEXT_DIST_DIR"]`, and
  `tooling/scripts/verification/isolated-enter/build-consolidated-studio-ui.mjs:12-20` copies
  `apps/studio/.next-bp-consolidated/{standalone,static}` — so any machine that ran the consolidated
  Studio build acquires it.
* `--a-surface-subtle` has **zero** hits in the entire source tree and zero at `HEAD`; it survives only
  in the bundled CSS. The gate therefore reports a violation that does not exist in source, at a
  generated path with meaningless `:1` line numbers. Same for the stale `.a-company-groups` /
  `.a-record-360` rules already noted at `docs/reports/review-fresh/css-design-system.md:1028`.

### 4. Guard hunt — one layer away, the guard exists for the sibling gates, not this one
* `tooling/scripts/policy/verify-design-system.mjs:50-59` — `isGeneratedDirectory()` returns true for
  `name.startsWith(".next-")` (comment names `.next-bp-consolidated` explicitly).
* `tooling/scripts/policy/audit-style-tokens.ts:39-49` — `ignoredDir = (name) => IGNORE_DIRS.has(name) || name.startsWith(".next-")`.
* No cap/clamp/validator/error-boundary in the cited file suppresses it; there is no `.test.mjs` coverage:
  `verify-theme-token-integrity.test.mjs:36` fixes `targetRoots: ["packages/platform","packages/planes"]`,
  so `apps/*` — the only polluted roots — is never exercised.
* The secondary caller `tooling/scripts/verification/inventory-entity-ui.mjs:52` passes its own
  source-only roots, so it is **not** polluted; the defect is confined to the CLI path using
  `DEFAULT_TARGET_ROOTS` (`:13-19`, includes `apps/neon|mesh|studio`).

### 5. Why HIGH does not hold (severity reassessment)
* All three artifact findings are `severity: "warning"` (each `var()` has a fallback). Default mode
  filters to `error` only (`selectFailures`, `:228-232`) and prints "no --a-* references break without a
  fallback" → **exit 0**. The gate does not fail by default.
* `policy:theme-token-integrity:strict` **is** wired into the `ci` profile
  (`governance/config/governance/static-policy-profiles.json:90`, profile starts `:49`) and runs from
  `pnpm policy:static` (`.github/workflows/ci.yml:82`), so strict mode is real. But strict already fails
  on the 8 source-only findings at `HEAD` (verified: the same `--a-color-danger`, `--a-toast-bottom-offset`,
  `--a-surface-muted`, `--a-page-sticky-top`, `--a-record-sticky-top` references exist at `HEAD`;
  strict exits 1 with 8 findings even excluding the build tree). The generated tree is therefore **not
  the deciding cause** of any current failure — it adds 3 of 11.
* The CI `quality` job runs `pnpm install` → `pnpm policy:static` (`ci.yml:60-82`) with **no app build
  beforehand**, and `.next-bp-consolidated` is gitignored, so a fresh CI checkout never contains it. The
  practical blast radius is developer machines (and any job that built the consolidated Studio UI first).
* Residual default-mode risk is plausible but **not demonstrated**: bundling can split a component-local
  token (`definitionsIn` is same-file only, `:171-172`) so a fallback-less local reference could surface
  as an `error` from the artifact. No such finding exists in the current tree; all three are warnings.

### 6. Corrected finding
Confirmed defect: the gate reads generated build output and emits phantom, stale, misattributed
findings, and it diverges from the two sibling gates that already implement the `.next-*` rule.
Recommended fix is the one the siblings use. Correct severity: **MEDIUM** (tooling correctness /
gate-noise, no user-visible or security consequence, currently non-decisive for pass/fail).

---

## F2 — Entity list runtime: cross-page selection count vs page-scoped action payload (ADVERSARIAL VERIFICATION)

**Cited at:** `packages/platform/entity/runtime/list-view/src/index.tsx:1248-1249`
**Verdict: PARTIAL — the mechanism is confirmed verbatim and reachable on the shipped Country route; the
first stated consequence (a clickable "Add selected to favourites" that silently does nothing) is refuted
by a guard one layer away, and "reports nothing" is false because the notice reports the true acted-on
count. Severity reassessed MEDIUM (not HIGH).**
**Consequence class: user-visible (mis-stated selection count + bulk action silently narrowed to the
current page). Not security-relevant on the cited Country route; an adjacent, conditional export variant
could be security-relevant but is not confirmed reachable for `country`.**

### 1. Cited code exists as quoted
`index.tsx:1248-1249` is verbatim:
```ts
const selectedRows =
  page?.rows.filter((row) => selectedIds.has(row.id)) ?? [];
```
`selectedIds` (state at `:715-718`) is genuinely cross-page: both the per-row toggle (`:4350-4354`,
`new Set(singleSelection ? [] : selectedIds)`) and the "Select current page" header checkbox
(`:4537-4547`, same union then `for (const row of page.rows) next.add(row.id)`) merge into the existing
set. The only reset is the descriptor/authority effect at `:729-745` (`setSelectedIds(new Set())` at
`:740`), keyed to `authorityKey = \`${entityCode}:${JSON.stringify(scopeCoordinate ?? {})}\``
(`:424`, duplicate at `:667`) — which contains **no** cursor, pageIndex, query, filters, sort or group.
No effect prunes `selectedIds` on page/query change (repo-wide, `setSelectedIds` appears only at
`:740`, `:1503`, `:1583`).

The count/payload split is exactly as claimed: the bar renders `selectedCount={selectedIds.size}` and
`onBookmarks={(operation) => void mutateBookmarks(operation, selectedRows)}` (`:1561-1571`), and
`mutateBookmarks` early-returns when the page-scoped array is empty (`:1254`).

### 2. What actually happens (traced, not assumed)
* **Select 1 row on page 2 after 3 stale page-1 ids (4 total) — CONFIRMED.** The bar shows
  `selectedIds.size` = 4 (`:1567`), the Favourites "add" item renders because
  `bookmarkedCount (0) < selectedRows.length (1)` (`:4707-4712`), and the click sends only the single
  page-2 row (`:1250-1280`). The success notice is `listNotice("list.notice.favouritesAdded", { count: ids.length })`
  (`:1293-1300`) whose catalog text is `{count, plural, one {# record} other {# records}} added to
  favourites.` (`packages/platform/foundation/i18n/src/catalogs/entity-runtime.ts:7`). So the user gets
  "1 record added to favourites." while the bar still claims 4 — the count is misleading, but the action
  is neither silent nor falsely reported.
* **Only page-1 rows selected, now on page 2 — REFUTED as stated.** With `selectedRows === []`,
  `bookmarkedCount = 0`, so `0 < 0` (`:4707`) and `0 > 0` (`:4713`) are both false: **neither**
  favourites item is rendered. There is no clickable "Add selected to favourites" to do nothing; the
  Favourites menu opens empty. The same page-scoped guard exists for export:
  `data-operations.tsx:51,58,78` counts `props.selectedRows.length`, omits `recordIds` entirely when it
  is empty, and disables the "Selected records" scope when `!count`.
* **The count text itself can become an outright false statement.** The disambiguating subtitle is
  `selectedCount === page?.rows.length ? \`${selectedCount} records on this page selected.\` : ""`
  (`:4680-4686`). If page 1 (3 rows) is fully selected and page 2 also has 3 rows with none selected,
  the cross-page count equals the current page length and the bar asserts "3 records on this page
  selected." while every checkbox on the visible page is unchecked — a concrete, reproducible
  misstatement caused by the same root cause.
* **Adjacent export variant (conditional, NOT confirmed for `country`).** `DataOperationsControl`
  receives the same page-scoped `selectedRows` (`:1433`), and the SelectionBar's Export button launches
  scope `"selected"` directly (`:1573-1581`), bypassing the picker-level `disabled` at
  `data-operations.tsx:31,78`. With 3 stale page-1 ids and 0 selected on the current page the dialog
  opens with scope `selected`, count 0, and `start()` sends no `recordIds`
  (`data-operations.tsx:51,57-58`). The worker's row query is built only from
  `filters(request.exactFilter)` (`transfer-jobs.ts:485-492, 774-808`), `_transfer.scope` is unused for
  restriction and appears only in the information sheet (`transfer-jobs.ts:876, 981`), and the
  repository treats "no recordIds" as unfiltered while an **empty array** would mean match-nothing
  (`kysely-record-repository.ts:28-29`). That path would fall back to the whole authorized result set —
  genuinely security-relevant — but it is not confirmed reachable for the cited route: the Country
  artifacts define no `operations`/export permission (`metadata/products/mdg/entities/country/core.json`,
  `metadata/products/shared/entities/country/definition.json`), so `dataOperations.export.*` resolves
  `hidden` (`entity-list-service.ts:1166-1171`) and no Export control renders (`:1573-1581`).

### 3. Guard hunt (whole repo)
* **The guard that matters is the conditional favourites menu** (`index.tsx:4707`, `:4713`) plus the
  `!rows.length` early return (`:1254`). It prevents the *silent empty click* but does nothing about the
  mismatched count, and it hides the action instead of explaining why.
* No cap/clamp/validator/error boundary/protection touches `selectedIds`; the server side receives only
  what the client sends. `record-bookmark-service.ts:204-240` normalizes and authorizes exactly the
  posted ids (`if (!normalized.length) return new Set()`, and a 403 `BOOKMARK_RECORD_FORBIDDEN` for ids
  no longer readable) — i.e. **no server-side re-expansion or rejection** of the narrowed payload, and
  no way for the client's stale ids to be acted on unexpectedly.
* Tests: `tests/foundation/entity-list-phase1a.test.tsx` renders the selection checkbox, bookmark and
  selection interactions but its page fixture is single-page (`hasNext: false`, `:206-227`); a repo-wide
  search found no test covering the selection bar across pages. Coverage gap, not a guard.

### 4. Reachability on the shipped Country route
`EntityReadSurface` renders `<EntityListRuntime client={client} entityCode={entityCode} />` for the list
(`packages/platform/entity/runtime/form-detail/src/entity-read-surface.tsx:18-22`), i.e. non-embedded,
so `selectionEnabled` is `true` (`index.tsx:1244-1247`), the row checkboxes and the SelectionBar render
(`:1561`), and the Favourites menu is not gated by any descriptor capability. Country is seeded with
hundreds of rows (`server/db/ddl/common/shared/reference-data/001_country.sql`) and the Next button is
enabled whenever `page.pagination.hasNext && nextCursor` (`list-pagination.tsx:51`), so page 2 is
ordinary navigation. The bookmarks API is generic per `entity_code`
(`server/packages/services/records/src/bookmarks/record-bookmark-routes.ts`,
`record-bookmark-service.ts:67-68`). The claimed input is reachable exactly as described.

### 5. Corrected finding
Real defect in the shared list runtime: `selectedIds` is maintained as a cross-page set and advertised
as such (`selectedIds.size` in the bar, plus the deliberately cross-page `Select all N matching records`
affordance at `:4688-4695`), while every row-acting control consumes the page-local `selectedRows`
(`:1248-1249` → `:1565,:1570`; `data-operations.tsx:51,58,77-78`). Correct severity: **MEDIUM** —
user-visible misreporting and a silently narrowed bulk action on every entity list surface (no data
loss, no privilege bypass; bookmark add/remove are additive and idempotent), with the more serious
export variant gated behind entities that enable `export.selected` and not reachable on the Country
descriptor. The stated HIGH is not supported, and one of the two claimed consequences cannot occur at
all because the favourites items are hidden when the current page contributes no selected rows.

---

## F2 (records) — Field-level read admission degrades to "all fields readable" when the profile is not enforced (ADVERSARIAL VERIFICATION)

**Cited at:** `server/packages/services/records/src/record-read-access.ts:57-62`
**Verdict: CONFIRMED — the cited code, the "profile is undefined" premise, and the resulting
allow-all field admission are all reproduced from current source. Severity HIGH stands as a
framework-wide control gap, with the caveat that the leak is latent (class-level), not user-visible
on the shipped `/app/entity/country/` route.**
**Consequence class: security-relevant** — the field-level read/masking policy of the signed,
published authorization profile is not consulted anywhere on the shipped read path, so a
`masked_only` protected plaintext field would be admitted like any other. Not user-visible on
Country today (Country publishes no restricted field).

### 1. The cited code exists verbatim and the line numbers are exact
`record-read-access.ts:57-62`:
```ts
  const profile=usesEntityBackendAuthorization(authorizer,context,descriptor)?descriptor.authorization:undefined;
  const decisions = await Promise.all(descriptor.fields.map(async (field) => {
    const policy = profile?.fieldPolicies.find(group => group.fields.includes(field.key));
    const operationKey = profile && policy?.readOperation === profile.recordReadOperation && profile.ownership === "tenant.record.v1" && profile.directory.population === "tenant" ? profile.directory.operation : policy?.readOperation ?? "read";
    const permissionCode = profile?.operations.find(operation => operation.key === operationKey)?.permissionCode ?? field.readPermissionCode;
    if (!permissionCode) return !profile;
```
`return !profile` is `true` whenever `profile` is `undefined`, i.e. the field is admitted.

### 2. Premise: `profile` is undefined for every entity in the shipped composition
* `usesEntityBackendAuthorization` (`entity-backend-authorizer.ts:437-453`) returns `false` unless
  `authorizer.enforcedEntityProfile?.(plane, entityCode)` is truthy (`:442-446`).
* The **only** definition of `enforcedEntityProfile` is `entity-backend-authorizer.ts:159-162`
  (repo-wide grep: forwarded only by `shadow-authorizer.ts:31-33` and
  `experience/src/entity-activity-policy.ts:59`). `createEntityBackendAuthorizer` returns
  `options.authority` unchanged when `rollout.mode !== "enforce"` (`:150`).
* The base authorizer `createPermissionAuthorizer` (`platform/iam/src/permission-authorizer.ts:32-40`)
  returns only `checkSourceConstraints` + `authorize` — no `enforcedEntityProfile`.
* No non-test composition supplies the wrapper: `register-services.ts:550-566` reduces over
  `dependencies.entityBackends ?? []` and uses `dependencies.entityCaseBackendAuthorization`; the only
  non-test caller is `kernel/bootstrap.ts:41` — `registerServices(container, review ? {...} : {}, …)`,
  i.e. `{}`. Repo-wide grep for `entityBackends`/`entityCaseBackendAuthorization` outside that
  declaration returns only docs and tests.
Therefore `usesEntityBackendAuthorization(...) === false` and `profile === undefined` on the shipped
`country` route (and every other entity).

### 3. The `?? field.readPermissionCode` fallback is dead for every in-repo descriptor
The cited projection range `native-runtime-projection.ts:258-278` is the complete field literal
(`key`, `storagePath`, `type`, `required`, `writableOn`, `classification`, query access, `list`) —
no `readPermissionCode`, and no `classification`-driven admission either. `descriptor-parser.ts:276`
only preserves a `readPermissionCode` that was explicitly authored. Repo-wide, the only producers of
a non-null `readPermissionCode` are hand-written test fixtures; the only runtime consumer is the
Atlas AI gateway projection (`register-services.ts:3730-3734`). The captured live descriptors agree:
`metadata/products/mdg/review/baselines/business-partner-runtime-neon-r9.json` contains **0**
occurrences of `readPermissionCode`, and the governance inventory
(`governance/policy/reports/entity-authorization-inventory.dev.json`) records `readPermissionCode:
null` for every field.

### 4. Consequence: every field is admitted, and `readableRecordFields` is the real allowlist
* List: `query-service.ts:105-128` builds `readableKeys` from it, feeds `validateQueryFields`, and
  `responseProjection` (`:556-582`) then `restrictResponseProjection` (`:332-362`), which only
  inspects `enforced` (`:339-341`, false here).
* Record detail: `query-service.ts:411-424` uses it as the exact repository projection and skips
  `assertProfiledScalarProjection` when `enforced` is false (`:434`).
* List descriptor / record / detail descriptor surfaces: `entity-list-service.ts:271`, `:352`,
  `:442`; the defensive `if (!readable.length) throw 403 ENTITY_DETAIL_FIELDS_FORBIDDEN`
  (`entity-list-service.ts:449`) can never fire because the list is never empty.
* Snapshots (`snapshots/snapshot-service.ts:20`) and the activity provider
  (`composition/shared/entity-runtime/activity-provider.ts:65`) use the same allowlist.

### 5. Guard hunt — no guard exists; the profile-aware counterparts are equally dead
* `projectEntityFields` (`entity-authorization.ts:274-305`) is the **only** place
  `representation === "masked"` turns a value into `"••••"`. Repo-wide grep finds **zero production
  callers** — only its own definition and `entity-authorization.test.ts:14,271`.
* The authorizer's field-use gate, including the masked deny at `entity-backend-authorizer.ts:384-424`,
  lives inside the same unreachable wrapper.
* No test covers `readableRecordFields` (repo-wide grep under `__tests__`: 0 hits), and no test drives
  a `masked` field policy through the records read path.
* The only surviving guard is coarse operation admission — `authorizeRecordListRead`
  (`record-read-access.ts:12-45`) and `authorize` (`query-service.ts:599-616`) still require
  `descriptor.operations["read"].permissionCode`. So reads are authorised; they are simply not
  field-restricted.

### 6. Reachability
* **Country (the shipped route):** the descriptor publishes exactly `code` and `name`, both
  `readPolicy: "authorized_projection"` with no `protection`
  (`metadata/products/mdg/entities/country/core.json`), so there is no wrong field today; the
  all-fields-admitted result is a no-op. I did not find a user-visible Country defect.
* **Masked entities exist in-repo and are the stated purpose of the framework:**
  `business_partner_identifier/core.json` (`identifier_value`, `readPolicy: "masked_only"`,
  `plaintextInNormalQueries: false`), `business_partner_tax_registration/core.json`
  (`registration_number`), `business_partner_banking/core.json` (protected `account_id`,
  `serialization: "never_in_normal_projection"`).
* **Caveat I could not close:** I found no *currently served* generic records route that returns one of
  those plaintext columns. No captured runtime descriptor for those child entities exists in
  `governance/policy/reports/**` (799 JSONs scanned, 0 matches), and their in-repo UI binding goes
  through a bespoke registered section handler that projects `identifier_value → maskedValue`
  (`metadata/products/mdg/entities/business_partner/presentation.section.identifiers-tax.json`,
  `dataBinding.handlerKey: "neon.bp.section.identifiers-tax.v1"`, `childCollections[0].fieldBindings`).
  The defect therefore materialises the moment such an entity is exposed as a generic entity route —
  exactly the onboarding path this framework exists for.
* **Attribution nuance:** even with the profile enforced, this loop would still *admit* a masked field
  (`representation` is never read at `:57-77`); masking would have to come from the unused
  `projectEntityFields` or the authorizer's field-use deny. So "masked_only is not enforced" is true,
  but restoring `usesEntityBackendAuthorization` alone would not add masking.

### 7. Corrected finding
Confirmed: when the backend profile is not enforced, `readableRecordFields` degenerates to
"no `readPermissionCode` ⇒ readable" and returns every descriptor field; the published field policies
(including `representation: "masked"`) are never consulted on any read path. This is a genuine,
security-relevant control gap in the shared framework (inert field-level read control; signed
authorization artifact reduced to documentation). Correct severity: **HIGH** as a framework/control
gap, with the explicit qualifications that (a) it is latent rather than an observed plaintext leak —
no served route was shown exposing a masked value, and (b) the shipped Country page is unaffected
because it has no restricted field and still requires `common.platform.reference.view`. Do not close
this as "Country is fine"; close it by installing the profile authorizer or by failing publication
when a descriptor publishes `authorization` with no installed enforcement.

---

## Entity list runtime — "Any of" (`in`) filters accept unlimited values (ADVERSARIAL VERIFICATION)

**Cited at:** `packages/platform/entity/runtime/collection-controls/src/filter-state.ts:34-41`
**Verdict: CONFIRMED — defect reproduced against current source; one stated consequence is wrong; severity HIGH is overstated (reassessed MEDIUM).**
**Consequence class: user-visible (uncaught TypeError + list falls into a server-error state on the Country route). Not security-relevant** — the server independently caps and rejects `in` values, so there is no injection, bypass or data exposure.

### 1. Cited code exists, with two citation corrections
`filter-state.ts:34-41` is verbatim:
```ts
  if (operator === "in" || operator === "between")
    return Object.freeze(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map(convert),
    );
```
Corrections to the citation text (not to the lines): the function is **`filterValueFromInput`**
(`filter-state.ts:7`), exported through `packages/platform/entity/runtime/list-view/src/state.ts:19`;
there is no `parseFilterValueInput` anywhere in the repo. The split is genuinely unbounded — no
`.slice()`, no count check, and `filterValidationError`
(`packages/platform/entity/runtime/collection-controls/src/filter-editor.tsx:118-176`) also splits on
commas unbounded and only constrains `between` (`parts.length !== 2`, `:141-146`); `in` has **no**
count limit. `:131` `if (!raw.trim()) return "Select or enter a value.";` is the only presence check.

### 2. Real consequence traced end-to-end (all current line numbers)
1. UI: for `operator === "in"` on a non-searchable, non-temporal field the value control is a plain
   text box — `filter-editor.tsx:611-628` (`placeholder: "Enter values separated by commas"`), with no
   `maxLength` (grep: zero `maxLength` in `filter-editor.tsx` or `list-view/src/index.tsx`).
2. Apply: `list-view/src/index.tsx:2471-2495` builds `normalized` via `filterValueFromInput`; its guard
   is `invalid` (`:2467-2473`) = `filterValidationError` only, so 101 values are **valid**.
   `Apply` is wired `applyDisabled={invalid || …}` (`:2855`, `:2832-2834`) — enabled.
3. Dispatch: `onApply` (`:2194`) → `onChange` = `resetAndUpdate` (`:1237-1243`, wired at `:1425`) →
   `update` (`:966-991`).
4. Cited hop: `index.tsx:987-988` is exactly `setState(next); if (!embedding) writeLocation(next, descriptor, history);`
5. `writeLocation` (`:5335-5341`) → `writeListLocation` (`list-view/src/location.ts:23-35`, **no try/catch**)
   → `encodeListLocationState` (`packages/contracts/platform/entity-list/src/url-state.ts:68`).
6. Cited parser hop: `url-state.ts:69` is exactly
   `const normalized = parseListLocationState(state, descriptor);` — **unguarded** (contrast the tolerant
   *decode* path at `url-state.ts:26-32`, which deliberately swallows `TypeError`s; encode has no such
   boundary).
7. → `parsers.ts:737` `json(item.value, …)` → `parsers.ts:1084-1086`:
   `if (Array.isArray(value)) { if (value.length > 100) throw new TypeError(\`${name} exceeds maximum array length\`); }`.
   The claim's "parsers.ts around :1084-1086" is exact; the actual cap is 100 and it is the generic JSON
   array bound, not a per-filter contract constant (`types.ts:47-48` defines only
   `ENTITY_LIST_MAX_VISIBLE_COLUMNS`/`ENTITY_LIST_MAX_FILTERS`).

### 3. Reproduced (executed, not just read)
Ran the real parser from the working tree (`node --import tsx`, temp script outside the repo) against a
parsed country-shaped descriptor (`code`/`name` string fields, `filterOperators` incl. `in`):
```
n=100: encodeListLocationState OK (no throw)
n=101: THREW TypeError: filters[0].value exceeds maximum array length
```
and reproduced the React semantics of `setState(next)` followed by a throw in the same click handler
(React 19.2.8 + jsdom):
```
state rendered after throw: applied-101-values
error escaped click: TypeError: filters[0].value exceeds maximum array length
```
So the error escapes as a genuine **uncaught** error — React error boundaries do not catch event-handler
throws (stack: `onClick` → `executeDispatch` → `dispatchDiscreteEvent`). No guard exists one layer away:
no try/catch in `filter-editor.tsx` `apply`, `FilterDialog.apply`, `resetAndUpdate`, `update`,
`writeLocation`, `writeListLocation`, or `encodeListLocationState`; no cap in `filterValidationError`;
no `maxLength`; no test covers >100 values (repo-wide grep for `exceeds maximum array length` matches only
`parsers.ts:1086`).

### 4. Reachability on the shipped Country route — confirmed
`/app/entity/country/` goes through the shared list runtime. Country is authored as a shared reference
(`metadata/products/shared/entities/country/definition.json`, `.tmp/…/country/core.json`
`businessContext.scopeKind: "shared_reference"`), and shared references are compiled by
`buildSharedReferenceGraph` (`server/packages/planes/studio/meta-entity-authoring/src/authoring/graph-builder.ts:39`,
used by `product.ts:2`), whose field policy is
`fieldPolicies: [{ key: "reference", fields: fieldKeys, representation: "plain", writeOperations: [], queryUses: ["search","filter","sort","group"] }]`
(`graph-builder.ts:76`). That yields `filterable: true` for every field
(`server/packages/platform/metadata/src/native-runtime-projection.ts:10-14`, `:267`), and the emitted
operators are the type defaults — `recordFieldFilterOperators` /
`entityFieldFilterOperators("string")` = `["contains","eq","ne","starts_with","in", …]`
(`server/packages/services/records/src/list-query-policy.ts:7-17`,
`server/packages/contracts/metadata/src/descriptors.ts:69-77`), surfaced at
`server/packages/services/records/src/entity-list-service.ts:892`. Country's `code`/`name` are `string`,
so "Any of" is offered and renders the free-text comma box. The same defect is reachable from the inline
per-column filter (`list-view/src/index.tsx:4603-4610` → `onFilters` at `:1468`; validator at `:4913`,
apply at `:5027-5044`).

### 5. The one stated consequence that is FALSE
The claim says the throw means "the filter is not applied". It is: `setState(next)` runs **before**
`writeLocation` (`index.tsx:987-988`) and the update commits even though the handler then throws
(reproduced above; React flushes the discrete update). What actually fails is the **URL write** — so the
chip and in-memory filter exist, the list refetches, and the request then carries all 101 values
(`packages/platform/foundation/api-client/src/entity-list.ts:62` serializes `state.filters` verbatim).
The API rejects it, as the claim says: `server/packages/services/records/src/records-routes.ts:90`
`if (operator === "in" && (… || parsed["value"].length > 100)) throw new RecordServiceError(400, "INVALID_FILTER", …)`.
Net user-visible result: uncaught console TypeError, no URL/history update (so the filter is lost on
reload and share/back links stay stale), then a 400-driven list error state. A second unguarded encode
site is reachable from that same state: "Copy link to this view" → `copyViewLink`
(`list-view/src/index.tsx:1819-1820`) → `portableListHref` (`location.ts:38-43`) → the same throw.

### 6. Corrected finding
Confirmed: `in`/`between` input is unbounded in `filterValueFromInput`, the shared validator does not cap
it, and applying >100 values throws `TypeError` inside the click handler at
`url-state.ts:69` → `parsers.ts:1085-1086` while the server would also reject it with 400 at
`records-routes.ts:90`. Correct severity **MEDIUM**, not HIGH: the trigger is a deliberate paste of >100
comma-separated values into an "is any of" box, the server is authoritative and rejects safely, there is
no data loss or security impact, and recovery is a normal error retry. The right fix is a value-count
guard shared by `filterValidationError` and `filterValueFromInput` (clamp/reject with a message, keep the
Apply button disabled), or make `writeListLocation` tolerate an un-encodable state instead of throwing.
