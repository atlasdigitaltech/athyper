# Comprehensive review — `/app/entity/country` on the shared Entity Framework

**Requested dimensions:** (1) bug fixes, (2) improvements, (3) coding standards,
(4) standard file/method naming, (5) CSS design system, (6) reusable components,
(7) further generalization and reusable components.

---

## 0. Snapshot, method, and reading this report

| Item | Value |
| --- | --- |
| Date | 2026-09-29, 23:05–23:30 (+08) |
| Revision | `HEAD = 63fc9492b`, **dirty worktree** (106 changed paths: 54 modified, 29 deleted, 22 untracked) |
| Concurrency | **Files were being edited by other work throughout this review.** `list-view/src/index.tsx` grew 5275 → 5703 lines; `bff-relay/src/index.ts` 2927 → 3524. All headline findings were re-verified against the current content. |
| Scope | The Country request path (frontend → relay → records/query → experience/metadata), plus the supporting contracts, publication, authoring, collaboration and host-composition packages. |
| Method | Read-only. No source file was modified. Every finding cites `path:line` and quotes code. Headline claims were independently re-verified by me, not accepted from a summary. |

Line numbers are **as of the snapshot above**. Where the concurrent editor has already fixed
something, that is stated explicitly so the item is not re-fixed.

### Verification legend

- **✔ verified** — I read the code myself and confirmed the defect.
- ○ reported — found by a scoped reviewer and consistent with the surrounding code I read,
  but not independently re-derived line by line.

### Coverage

| Area | Coverage | Detail report |
| --- | --- | --- |
| Frontend entity runtime (Country list + detail path) | full request chain, both revisions of the list runtime | [frontend-runtime-bugs-20260929.md](review/frontend-runtime-bugs-20260929.md) — 10 findings |
| Server read chain (routes → service → query → repository) | traced list + record + detail-descriptor end to end | summarized in §2.17–2.19 |
| Publication / compilation pipeline | 120 files, 63/63 src in full (18,808 lines) | [publication-compilation-20260929.md](review/publication-compilation-20260929.md) — 17 findings |
| Meta-entity authoring / onboarding | 113/113 files in full (12,205 lines) | [meta-entity-authoring-20260929.md](review/meta-entity-authoring-20260929.md) — 35 findings |
| Experience / metadata / collaboration platform | 114 files in full (15,856 lines) | [experience-metadata-20260929.md](review/experience-metadata-20260929.md) — 13 findings |
| Collaboration UI / attachments | 59 files, every line (15,351 lines) | [collaboration-attachments-20260929.md](review/collaboration-attachments-20260929.md) — 12 findings + 5 test gaps |
| Standards, naming, CSS, duplication | 388 files | summarized in §4–§7 below |
| Generalization / reuse | whole frontend + gateway | summarized in §8 below |
| Host composition / DB scripts / tests | 566 files / 82,068 lines enumerated, full refactor diff-proof | [host-composition-db-tests-20260929.md](review/host-composition-db-tests-20260929.md) — 19 findings |
| Entity-runtime exhaustive sweep | 11 group passes, per-file verdicts (2,873 lines) | [entity-runtime-sweep-20260929.md](review/entity-runtime-sweep-20260929.md) — 4 findings rated high |

---

## 1. Executive summary

### What is genuinely healthy

Do not churn these — they are already right:

1. **The Country URL really is one shared implementation.** `apps/{neon,mesh,studio}/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx`
   are **byte-identical 4-liners** (md5 `3cb777216d40c0daa284d6b75f6828fc`) delegating to
   `createEntityReadPage`. The AGENTS.md rule is being honoured at the entry point.
2. **Country configuration lives in metadata, not code** —
   `metadata/products/shared/entities/country/definition.json` (315 lines: fields, columns,
   searchFields, navigation tabs, sections, label keys) drives the runtime.
3. **Route resolution is correct and strict** — `resolveEntityReadRoute` maps `[]`/`["manage"]`
   to the list, one UUID segment to the detail record, rejects `>1` segments, and returns
   `undefined` → `notFound()`.
4. **Server-side authorization is real, not decorative** — `requireOperation(..., "read", recordId)`
   runs before the record fetch (`entity-list-service.ts:413-419`), the read authorizer resource carries
   `{tenantId, entityCode, operationKey, recordId}` (`query-service.ts:398-409`), ownership enforcement
   **fails closed** (a descriptor declaring `ownerAccess` with no wired adapter throws
   `503 ENTITY_OWNER_ADAPTER_UNAVAILABLE` rather than allowing access — `record-owner-access.ts:88-93`),
   and the repository itself filters by tenant in parameterized SQL
   (`kysely-record-repository.ts:61`: `baseConditions(descriptor, tenantId) AND id = ${recordId}`).
   There is **no record-level IDOR or SQL-injection surface** on the Country list/detail path — which is
   precisely why the unscoped publication **rollback** route (risk 1) stands out: the read paths do this
   correctly and the rollback path simply omits the equivalent guard.
5. **List fetch cancellation is done properly** — all four list effects use `AbortController`
   with cleanup abort, re-check `signal.aborted`, and reject responses whose
   `descriptorHash`/`scopeFingerprint` no longer match. No out-of-order overwrite found.
6. **Very clean hygiene for a 58k-line frontend** — 0 `TODO`/`FIXME`, 0 commented-out code,
   0 `@ts-ignore`/`eslint-disable`, 0 `I`-prefixed types, 317/320 files strict kebab-case,
   only 4 `export default` (3 are mandatory Next.js pages), and 4,296 `readonly` annotations.
7. **The design-system ratchet is net improving** — it was 199 and is now 144 known violations,
   and the 10 regressions introduced by the in-flight work were fixed during this review.

### Top 21 risks, ranked

| # | Sev | Risk | Where | Verified |
| --- | --- | --- | --- | --- |
| 1 | **critical** | Cross-tenant rollback: the rollback route never tenant-scopes the publication key — and keys are **derivable** (`metadata.<family>.<entity>.tenant.<tenantId>`), so they are not secret | §2.14 | ✔ |
| 2 | **high** | **No entity authorization profile is enforced in the shipped composition** — the field gate degenerates to allow, and the fallback `readPermissionCode` is never emitted by any compiler. Masked fields, field query-uses and per-row ACLs are all unenforced | §2.17 | ✔ |
| 3 | **high** | One malformed URL parameter silently wipes the **entire** list state (filters, search, sort, columns) and persists the stripped URL | §2.1 | ✔ |
| 4 | **high** | Legacy attachment download is tenant-wide, not record-scoped → another user's `content.item`/`atlas.prompt` file can be downloaded by id | §2.21 | ✔ |
| 5 | **high** | Authoring route errors never mapped → every `TypeError`/policy denial is a **500** | §2, area report | ○ |
| 6 | **high** | `redispatch` republishes a body-supplied release id with no tenant/revision re-check | §2, area report | ○ |
| 7 | **high** | Authored navigation config can override compiled `permissions`/`rules`/`scopes`/`requiresPreflight` in the signed published descriptor | §2.22 | ✔ |
| 8 | **high** | Dispatch activation gate **fails open** when the compilation join yields no rows | §2.15 | ○ |
| 9 | **high** | Compiled operation bindings staged **outside** the projection transaction and never repaired on retry → a release can activate with authorization bindings missing | §2.15 | ○ |
| 10 | **high** | Permanent validation failures classified `transient` → infinite retry, never `failed`, empty DLQ | §2.15 | ○ |
| 11 | **high** | 3 test files import modules that **do not exist** → package test suite cannot collect | §2.13 | ✔ |
| 12 | **high** | `STUDIO_BP_CASE_CONTRACT_RELAY_OPERATIONS` clones 4 unrelated operations unchanged (4 dead registry entries); no duplicate-id guard exists at all | §2.11–2.12 | ✔ |
| 13 | **medium** | `search` does not escape LIKE metacharacters → `?search=%` returns the entire permitted set; adapters diverge | §2.18 | ✔ |
| 14 | **medium** | Failed refresh keeps stale rows and a **stale cursor** live, so "Next" paginates the previous query's ordering | §2.3 | ✔ |
| 15 | **medium** | Lost in-page "Previous" after any reload/deep-link on page ≥ 2 (cursor stack is memory-only, `page` is in the URL) | §2.4 | ✔ |
| 16 | **high** | Verification endpoints authorize on authentication only (no permission check) — cross-tenant DB/cache/readiness reconnaissance plus privileged probes | §2.23 | ✔ |
| 17 | **high** | Missing `ATHYPER_ENV` **fails open to `local`** → enables #16, allows shared BullMQ/Redis, shadows claim-context enforcement, accepts legacy S3 keys | §2.23 | ✔ |
| 18 | **high** | `createEntityMetadataHooks` has **zero importers** → metadata-declared `requiredCoordinates`/reference domains never enforced (fail-open in the framework itself) | §2.23 | ✔ |
| 19 | **high** | Two test suites broken **by the refactor**: `turbo test` (platform-host) and `pnpm test:foundation` → `pnpm test`. Both are one-line specifier fixes to existing successors | §2.23 | ✔ |
| 20 | **high** | 8 of 17 relative-date filter options always answer `HTTP 400` (editor offers 17, route accepts 9, repository implements 18) — one-line fix | §2.18 | ✔ |
| 21 | **high** | `SearchableSelect` refetches the reference directory **forever** when a saved value cannot be resolved (new-array dependency + no attempt guard + unaborted requests) | §2.24 | ✔ |

**One reported finding was disproved and is recorded as a correction** rather than a bug — see §2.19
(country's shipped identity is the UUID `id`, not `code`); the *underlying* framework assumption is
still a real latent defect and is reported there.

### The gates that are red right now

Run these today. Two are broken **on a clean checkout**, three test suites are broken **by the in-flight
refactor**, and the rest are ratchet regressions. Details in §9.

- `pnpm policy:i18n` — **fails at HEAD**; the policy asserts DDL columns (`fallback_locale_code`,
  `enabled_locale_codes`) that do not exist. Because `lint = policy:i18n && turbo lint`,
  **`pnpm lint` is blocked**.
- `pnpm policy:frontend-spine` — **fails at HEAD** (stale manifest entries for packages deleted in
  `870f08f52`; their directories now contain only `node_modules`, plus dependency-budget breaches).
- `turbo test` (platform-host) and `pnpm test:foundation` → **`pnpm test`** — **fail**, each from one
  stale import specifier left by the refactor whose successor already exists (§2.23).
- `pnpm test:reachability` — **fails** (generated retirement report is stale).
- `pnpm policy:style-tokens:strict` — **fails** (new raw typography in 3 CSS files).
- `pnpm policy:theme-token-integrity` — **fails**, 13 findings; 2 are real rendering bugs on the Country
  page (§6.1).
- `pnpm format:changed --check` — **43 → 48 changed files** fail, because there is **no Prettier config**
  (§4.1).
- `pnpm policy:design-system` — **green** (was red mid-review; the concurrent editor fixed it).

---

## 2. Dimension 1 — Bug fixes

### 2.1 List state is destroyed by a single malformed URL parameter ✔ **high**

**Location:** `packages/contracts/platform/entity-list/src/url-state.ts:35-53`, validators at
`parsers.ts:776` (`mode`), `:806` (`density`), `:811-814` (`pageSize`), `:831-833` (`pageIndex`),
`:1170-1174` (`query > 512`).

`decodeListLocationState` wraps the whole URL-derived parse in
`catch (error) { if (!(error instanceof TypeError)) throw error; return locationFromBase(base, descriptor); }`.
Every URL-input validator throws `TypeError`, so **one** bad value discards filters, search, sort,
group, columns and spreadsheet — and the caller immediately persists the loss:

```ts
// list-view/src/index.tsx (location-hydration effect)
if (!embedding && !navigationOnly && !applicationOnly)
  writeLocation(nextState, next, "replace");
```

The comment above the `try` claims the opposite intent ("Descriptor and saved-base failures are
programming/configuration errors… Never swallow them"), but `parseEntityListDescriptor` and
`normalizedBase` are called *before* the `try`, so the `catch` can only ever see optional URL input.

**Failure:** a shared/bookmarked link such as `?filter.code={...}&sort=name:asc&density=wide` (or a
hand-edited `?pageSize=0`) renders the **unfiltered, unsorted, unsearched** list with no message,
and `history.replaceState` makes it unrecoverable via back/refresh.

**Fix:** validate per parameter — drop only the offending value using the descriptor as the
authority (`oneOf` with a default, `integer` guarded by `Number.isSafeInteger`) and never substitute
`base` for a parse of URL parameters. Keep `TypeError` propagation for descriptor/saved-view input only.

### 2.2 Search longer than 512 characters throws uncaught and desynchronizes URL from state ✔ **medium**

**Location:** `parsers.ts:1170-1174`, `url-state.ts:57`, list search input
(`foundation/ui/src/index.tsx:242`, a bare `type="search"` with **no `maxLength`**).

`encodeListLocationState` calls `parseListLocationState` with no `try`, while the instant-search
debounce sets state *before* writing the URL. Pasting ≥513 characters therefore raises
`TypeError: query exceeds 512 characters` from inside a `setTimeout` callback: uncaught, not surfaced,
and the query string is never updated — so a refresh or copied link silently loses the search while
the on-screen rows are still filtered.

**Fix:** cap the input (`maxLength`) or clamp in the debounce with a visible status; make
`encodeListLocationState` degrade (skip/truncate the query) instead of throwing.

### 2.3 Failed refresh leaves stale rows and a stale cursor live ✔ **medium**

**Location:** the list-results effect and `ListFooter`/`Next` in
`packages/platform/entity/runtime/list-view/src/index.tsx`.

The descriptor/authority effect resets `page`, `cursorHistory`, `selectedIds`, `error`, `loading`.
The **results** effect does not: on failure it only calls `setError(...)`, and `finally` sets
`loading = false`. Rendering then shows the error card **above the previous page's rows**, with a
footer whose `disabled` state and `onNext` read `page.pagination.nextCursor` — the cursors of the
*previous* query applied to the *new* filter/sort state.

**Failure:** change the sort, the request fails (500 / descriptor-hash mismatch / gateway error);
"Next" is still enabled and issues newSort + oldCursor → records skipped or repeated.

**Fix:** make the error state authoritative for the results region (hide/mark stale rows, disable the
footer), or store the query key alongside `page` and only use `nextCursor` when it matches the
current `serverQueryKey` — the runtime already computes that key (used for `visibleIds`).

### 2.4 In-page "Previous" is permanently disabled after reload or deep link on page ≥ 2 ✔ **medium**

**Location:** `cursorHistory` is component state only; `pageIndex` **is** persisted in the URL
(`url-state.ts:80`), and the range label uses it (`start = (state.pageIndex ?? cursorHistory.length) * pageSize + 1`),
while the button reads `disabled={!cursorHistory.length || loading}`.

After a remount `cursorHistory` is empty, so the list shows "Showing 26–50 of …" with **Previous
greyed out**, even though the URL says page 2. The same happens for any shared `?cursor=…&page=2`
link. Note `pagination.hasPrevious`/`previousCursor` exist in the contract but the server always
sends `hasPrevious: false` (`entity-list-service.ts`), so the fix must be client-side.

**Fix:** persist the cursor stack (`sessionStorage` keyed by descriptor hash + authority, reusing
`location.ts`), or derive Previous from `pageIndex > 0` and offer "Back to first page".

### 2.5 Cross-page selection makes bulk actions silently no-op or act on a subset ✔ **medium**

**Location:** `selectedIds` is reset only in the **descriptor/authority** effect; `selectedRows` —
the payload of every bulk action — is derived from the **current page** only
(`page?.rows.filter(row => selectedIds.has(row.id))`), and `mutateBookmarks` early-returns when that
list is empty, while the selection bar keeps rendering enabled items sized from `selectedIds.size`.

**Failure:** select 3 rows on page 1 → Next → "Add selected to favourites": the bar says "3 selected",
the click does nothing and reports nothing. Select one row on page 2 first and only that row is added
while the bar claims 4.

**Fix:** cache selected rows across pages, or clear selection on every query/page change, or disable
bulk actions when `selectedIds.size !== selectedRows.length` and say why. At minimum, do not return
silently.

### 2.6 Detail-record load failure is a dead end ✔ **medium**

**Location:** `packages/platform/entity/runtime/form-detail/src/index.tsx` — a failed
`Promise.all([detail, record])` sets `status` to the localized error and leaves `loaded` undefined,
but the `!loaded` branch is the *loading* branch: `PageWorkspace` + `<p role="status">{status}</p>`
with no retry. `SurfaceErrorBoundary` — the only reset affordance — wraps the **loaded** branch, so it
never sees this failure.

**Failure:** a transient 500 on `/app/entity/country/<uuid>` leaves a card containing only an error
sentence, announced politely (`role="status"`, not `role="alert"`), with no "Try again"; the user must
reload the whole shell.

**Fix:** add an explicit error state with a retry (an `attempt` counter in the dep array) and
`role="alert"`.

### 2.7 Related-record capability probe swallows errors, hiding "Add"/"Edit" ○ **low**

`related-entity-section.tsx` uses `entityDescriptorClient.form(...)` as a permission probe and a bare
`catch {}` / `.catch(() => setCanCreate(false))`. A transient failure silently removes the action.
**Fix:** distinguish 401/403 (cacheable "not permitted") from transport/5xx (retryable status).

### 2.8 Export file name cannot contain spaces and cannot be cleared ○ **low**

`safeFileName()` (which `trim()`s and substitutes `"records"`) is applied on **every keystroke** of a
controlled input, so `Q3 report` becomes `Q3report`, and clearing the field snaps to `records`.
**Fix:** sanitize on blur/submit; validate emptiness with a message.

### 2.9 Grouped-table keyboard navigation stalls at group headers ○ **low**

Row `keydown` moves focus with `sibling?.focus()`, but data rows get `tabIndex={href ? 0 : undefined}`
while the injected group-header `<tr>` has none, so `focus()` is a silent no-op. **Fix:** give group
rows `tabIndex={-1}`, or walk to the next focusable sibling.

### 2.10 Hard-coded DOM ids collide when more than one list is mounted ○ **low**

The embedded case correctly uses `useId()`, but the page case hard-codes `entity-list-search`
(plus literal ids for the column search and saved-view dialog fields). Not reachable on
`/app/entity/country` today (one list per route); **fix** by always deriving ids from `useId()`.

### 2.11 Relay registry: a derived group clones unrelated operations ✔ **high**

**Location:** `packages/platform/gateway/bff-relay/src/index.ts:3295-3312`.

```ts
export const STUDIO_BP_CASE_CONTRACT_RELAY_OPERATIONS = Object.freeze(
  STUDIO_BP_DEFINITION_RELAY_OPERATIONS.flatMap((operation) =>
    ["business-partner-case-contracts", "business-partner-company-case-contracts"].map((resource) =>
      Object.freeze({ ...operation,
        id: operation.id.replace("business-partner-definitions", resource),
        path: operation.path.replace("business-partner-definitions", resource) }))));
```

`STUDIO_BP_DEFINITION_RELAY_OPERATIONS` also contains four operations whose id/path do **not** contain
`business-partner-definitions` (`studio.task-rules.baselines`, `studio.task-edit-policy.{author,read,publish}`).
For those, `.replace()` is a no-op, so the group contains 16 entries where 12 were intended — 4 dead
duplicates of already-registered routes (measured; the group has internal duplicate ids).

**Fix:** filter to the operations the substitution actually re-scopes, e.g. skip when
`!operation.path.includes("business-partner-definitions")`, and assert the group's unique-id count.

### 2.12 Relay registry: duplicate operation ids/routes are neither rejected nor detected ✔ **high (latent)**

`compileOperation` performs no uniqueness check and `findOperation` returns the **first** match, so a
duplicate registration is silently unreachable. Measured against the current tree:

- `[neon] SHADOWED attachments.browse` — registered in `COMMON_PLANE_RELAY_OPERATIONS` and again in
  `BUSINESS_PARTNER_RELAY_OPERATIONS`. **Identical today**, so currently benign.
- `[studio] SHADOWED studio.task-rules.baselines`, `studio.task-edit-policy.{author,read,publish}`
  between the definition group and the case-contract group (see 2.11).

The new contract test `tests/contracts/relay-common-plane-operations.test.ts` asserts uniqueness
**within** `COMMON_PLANE_RELAY_OPERATIONS` only — not across each plane's combined list, which is
where the shadows actually occur.

**Risk:** the allowlist *is* the authorization trust boundary. Since first-wins, a future divergence
(e.g. raising `maxBodyBytes`, or tightening `requiresTenant`) in the later registration would be
silently ignored.

**Fix:** in `createRelayHandler`, fail fast on duplicate `id` or `method+path` at construction; extend
the contract test to build each plane's effective list and assert uniqueness.

### 2.13 Three test files import modules that do not exist ✔ **high**

**Location:** `server/packages/planes/studio/meta-entity-authoring/src/__tests__/intake-presentation.test.ts:3`
(imports `../intake-presentation.js` — **file absent**), and
`configuration-editor-qualification.test.ts:2-3` / `structural-editor-qualification.test.ts:2-3`
(import `packages/planes/studio/business-partner/src/…` — that directory now contains **only `node_modules`**).

Verified directly: neither target exists. The package's test suite cannot collect, and the likely
"fix" (deleting the tests) silently removes the only coverage for the intake-presentation overlay and
for interactive structural/configuration editing.

**Fix:** restore/relocate the implementations and repoint the imports, or delete the tests **and**
confirm the behaviour is covered elsewhere.

### 2.14 Cross-tenant rollback: the rollback route never tenant-scopes the publication key ✔ **critical**

**Location:** `server/packages/services/publication/src/publication-routes.ts:121-133`, sink
`kysely-local-projection-repository.ts:312` → `server/db/ddl/common/runtime_meta/07_functions.sql:439-455`.

The rollback route authorizes a **bare permission code with no resource** and forwards the path
parameter straight into a durable job:

```ts
const context = await requirePermission(options, response, "publication.release.rollback");
const plane = requiredPlane(request.body);
const targetAppliedReleaseId = uuid(requiredString(request.body, "targetAppliedReleaseId"));
const publicationKey = String(request.params["key"]), reason = requiredString(request.body, "reason");
const jobId = await options.jobs.enqueue(PUBLICATION_APPLY_QUEUE, ROLLBACK_PUBLICATION_RELEASE_JOB,
  { publicationKey, targetAppliedReleaseId, targetPlane: plane, reason, actorId: context.principalId }, …);
```

Nothing resolves `publicationKey` to an owning release/deployment, and the SQL sink has no tenant
predicate either — it selects on `publication_key` and `id` only:

```sql
SELECT * INTO v_head FROM runtime_meta.release_activation_head
 WHERE publication_key = p_publication_key FOR UPDATE;
SELECT * INTO v_target FROM runtime_meta.applied_release
 WHERE id = p_target_applied_release_id AND publication_key = p_publication_key FOR UPDATE;
```

**Contrast:** the sibling route does exactly the right thing — `retry` (`:105-118`) resolves the
deployment through `tenantDeployment` → `tenantRelease`, which returns `null` unless
`release.tenantId === context.tenantId` (`:160-168`), and the read paths do the same. The rollback
route has no equivalent guard and no equivalent test.

**Why this is practically exploitable, not just theoretical:** publication keys are **derivable**,
not secret — `entity-adoption-plan.ts:47` pins the format to
`` `metadata.${family}.${entityCode}.tenant.${tenantId}` ``. A principal who holds
`publication.release.rollback` in tenant A (the permission is tenant-seeded) and can learn or infer
tenant B's id can construct B's key and **silently downgrade B's active published entity runtime**.

**Fix:** resolve the key to its release/deployment and require `release.tenantId === context.tenantId`
before enqueueing (mirroring `tenantRelease`); thread the tenant into
`LocalProjectionRepository.rollback` and add `AND tenant_id = p_tenant_id` to `fn_rollback_release`;
add a route test asserting a foreign key yields 404/403 and enqueues nothing.

### 2.15 Publication pipeline: four further high-severity defects ○

Detail in [publication-compilation-20260929.md](review/publication-compilation-20260929.md):

- **Activation gate fails open** when the compilation join yields no rows
  (`kysely-publication-authority-work.ts:679-693`) — the independent activation approval is skipped.
- **Compiled operation bindings are staged outside the projection transaction** and never repaired on
  retry (`kysely-local-projection-repository.ts:110-120` vs `publication-orchestrator.ts:122`), so a
  release can activate with `authz.entity_operation_projection` rows missing.
- **Permanent validation failures are classified `transient`**
  (`shared/authorization/operation-projection.ts:5` + `publication-orchestrator.ts:304-311`) → retried
  forever, never `failed`, never dead-lettered.
- **`recoverStalled` is a poison pill**: one unexpected error aborts the whole sweep and only the oldest
  200 stalled deployments are ever considered (`kysely-publication-authority-work.ts:699-719`).

Medium items include promotion swallowing every destination error into an evidence-free `failed`
entry, replay enqueuing the apply job before the replay event/audit are durable, publish endpoints
returning a **withdrawn** release as `202` and enqueuing compilation, and `signScoped` never re-reading
release status (so withdrawn releases can still be signed).

### 2.16 User-visible English is hardcoded in shared framework code ✔ **medium (i18n)**

The app ships 8 UI locales and 467 `intl.message(...)` calls exist in the entity runtime — yet:

```ts
// server/packages/services/records/src/entity-list-service.ts:465  (detail descriptor)
actions.push({ code: "edit", label: "Edit", kind: "edit" });
// :940-943
label: "Scope", value: contextRequired ? "Work context required" : "All permitted tenant records",
```

`intl.text(value)` returns a **string** verbatim and only resolves `{labelKey, defaultText}`
(`packages/platform/foundation/i18n/src/index.ts:195-200`) — so `record-navigation.tsx:301`
(`intl.text(action.label)`) and `record-action.tsx:38,46` (`{action.label}`) render raw English in
every locale. The server is emitting text where the frontend expects a message key.

Also measured in the shared entity runtime / shell:

- **113** hardcoded English copy attributes (`aria-label=` / `title=` / `placeholder=`) across **28 files**
  — e.g. `record-header.tsx:154` `aria-label="Record sections"`, `record-360-panel.tsx:33`
  `aria-label="Record views"`, `section-primitives.tsx:81` `title="No details to display"`.
- `detailValue()` returns hardcoded `"Not provided"`, `"Yes"`, `"No"` (`related-record.tsx:32-47`).
- `record-action.tsx:46` appends `" · Select context"`, `" · Verify"`, `" · View prerequisites"`, `" · Retry"`.
- The repo's own i18n gate is **structural only** — it verifies locale registries, RTL geometry,
  catalogs and DDL, and never scans component source for untranslated copy.

**Fix:** emit `{labelKey, defaultText}` from descriptors; route the literals through
`intl.message(...)`; extend `verify-i18n-foundation.mjs` with a source scan for literal
`aria-label`/`title`/`placeholder` in the shared packages.

### 2.17 The published field-authorization profile is never enforced by the shipped composition ✔ **high**

**Location:** `server/apps/platform-host/src/kernel/bootstrap.ts:41`,
`server/apps/platform-host/src/composition/register-services.ts:549-570`,
`server/packages/services/records/src/record-read-access.ts:55-62`,
`server/packages/services/records/src/entity-backend-authorizer.ts:437-449`,
`server/packages/services/records/src/query-service.ts:121,294-310`.

Every profile-based control is gated on `usesEntityBackendAuthorization(...)`, which asks the injected
authorizer for an enforced profile:

```ts
// entity-backend-authorizer.ts:437-449
const expected = authorizer.enforcedEntityProfile?.(context.planeKey, descriptor.entityCode);
if (!expected) return false;
```

`enforcedEntityProfile` only exists when `registerServices` receives `entityBackends` or
`entityCaseBackendAuthorization`; the shipped composition passes neither:

```ts
// bootstrap.ts:41
registerServices(container, review ? { entityAuthorizationReleaseReview: review } : {}, config, lifecycle, plan);
```

I verified end-to-end that (a) **no in-repo caller** supplies either dependency
(`grep -rn "entityBackends\|entityCaseBackendAuthorization" server/` excluding `register-services.ts`
returns nothing), and therefore (b) the field gate in `readableRecordFields` degenerates to allow:

```ts
// record-read-access.ts:55-62
const profile = usesEntityBackendAuthorization(authorizer, context, descriptor) ? descriptor.authorization : undefined;
…
const permissionCode = profile?.operations.find(o => o.key === operationKey)?.permissionCode ?? field.readPermissionCode;
if (!permissionCode) return !profile;          // profile === undefined  ⇒  returns true
```

and (c) the fallback `field.readPermissionCode` is **never produced by any compiler** — the only
occurrences are the parser (`descriptor-parser.ts:276`), the two readers, and test fixtures; no file
under `metadata/` declares it (only `metadata/products/mdg/CONTRACT.md` mentions the concept).

**Impact:** a caller who passes the coarse list/read permission receives fields the published profile
marks masked, may filter/sort/group/search on fields whose `fieldPolicies.queryUses` exclude that use,
and bypasses the per-row authorization loop (`query-service.ts:294-310`) — i.e. canonical read
admission, field-policy reads and per-record ACLs are **dead code** in this repository's deployment.

**Caveat:** an out-of-repo deployment could inject `entityBackends`; nothing in this repo does, and
`compiled-runtime-contract.ts` guarantees `descriptor.authorization` is published, so the profile exists
but is unenforced.

**Fix:** wire the backends from the admitted release, **or** fail closed at descriptor resolution when a
descriptor carries `authorizationRuntime` and no enforcement backend is installed — the second option is
a few lines and removes the whole class of silent fail-open.

### 2.18 Server read chain: further verified defects ○

Detail in the server area report. Independently confirmed by me, all in
`server/packages/services/records/src/kysely-record-repository.ts`:

- **`search` does not escape LIKE metacharacters.** `searchCondition` interpolates the raw string:
  `` ${sql.ref(field.storagePath)}::text ILIKE ${`%${search}%`} `` — no `escapeLike`, no `ESCAPE`.
  Two lines away, `filterCondition` does it correctly for `contains`/`starts_with`
  (`${`%${escapeLike(String(filter.value ?? ""))}%`} ESCAPE '\\'`), so the asymmetry is unambiguous.
  `?search=%` (length 1, which passes `minimumQueryLength`) compiles to `ILIKE '%%%'` and returns the
  entire permitted set; the in-memory adapter uses literal `includes`, so results and exact counts
  disagree between adapters, and the forced full scan is a cheap DoS vector.
- **`group` aggregation is unbounded.** `groupBuckets` runs
  `SELECT ref AS value, count(*) AS count … GROUP BY ref ORDER BY ref ASC` with **no `LIMIT`**, while
  the paged `SELECT` is capped at 100 rows — `?group=<high-cardinality field>` aggregates and returns
  the whole table.
- **Relative date windows are off by one day.** `next_7_days` is
  `>= CURRENT_DATE AND < CURRENT_DATE + INTERVAL '8 days'`, and `last_7_days` is
  `>= CURRENT_DATE - INTERVAL '7 days' AND < CURRENT_DATE + INTERVAL '1 day'` — both cover 8 calendar
  days. Every `next_*`/`last_*` quick filter is affected.
- **The relative-date vocabulary is declared three times and the three disagree — 8 filter options are
  permanently broken.** The **filter editor offers 17** relative periods
  (`collection-controls/src/filter-editor.tsx:208-232`: `today`, `yesterday`, `last_7_days`,
  `last_30_days`, `last_90_days`, `next_7_days`, `next_30_days`, `next_90_days`, `this_week`,
  `this_month`, `this_quarter`, `last_365_days`, `next_365_days`, `last_year`, `this_year`,
  `next_year`), the **route accepts only 9** (`records-routes.ts:53` `RELATIVE_DATE_VALUES`), and the
  **repository implements all 18** (`kysely-record-repository.ts:170`).
  Any user who picks *Last 90 days, Next 90 days, This quarter, Last 365 days, Next 365 days,
  Last calendar year, This year* or *Next calendar year* in the Country list filter gets
  **`HTTP 400 INVALID_FILTER`** (`records-routes.ts:92`) — 8 of 17 options in a shared component used by
  every entity. **One-line fix:** widen `RELATIVE_DATE_VALUES` to the repository's vocabulary (and
  ideally export that vocabulary once so the three layers cannot drift again).

Reviewer-reported (consistent with the code I read):

- Release resolution is deduplicated **without `principalId`** (`compiled-entity-reader.ts:44-51,211-216`)
  while consumers compare it, so two principals overlapping one read can produce a 500
  `ENTITY_HEADER_RELEASE_SCOPE_MISMATCH` (and a latent cross-principal preview hazard).
- Cursor `values`/`id` are outside the cursor binding, so a crafted cursor yields a Postgres `22P02`
  surfaced as **500** instead of `400 INVALID_CURSOR`.
- Snapshot reads (`snapshots/snapshot-service.ts:9-22`) skip the collection-scope admission that
  `capture` applies via `queries.get` — latent, because in-repo descriptors require a scope coordinate.
- `record()` rebuilds `values` from all descriptor fields present in the row rather than the readable
  projection (`entity-list-service.ts:590-594` vs `query-service.ts:344-349`) — latent, needs a
  descriptor where `field.key !== storagePath`.

### 2.19 Correction — the "country uses non-UUID identity" claim does not hold for the shipped runtime ✔

A reviewer reported, as a concrete country breakage, that country's published artifact declares
`idField: "code"`, which would make the UUID-only URL grammar
(`entity-read-runtime` → `resolveEntityReadRoute`) reject every country record link, and would break
bookmarks/aggregates/activity.

I checked it directly and **it does not hold as stated**:

- `server/db/ddl/common/shared/03_tables.sql:11-13` — `shared.country` has
  `id uuid NOT NULL DEFAULT shared.uuidv7()`; `code character(2)` is a separate column.
- The shipped definition `metadata/products/shared/entities/country/definition.json` models `id` as the
  `uuid` field and uses `codeField: "code"` — i.e. identity is the UUID.
- The only artifact declaring `"idField": "code"` is
  `metadata/products/mdg/entities/country/core.json:15`, whose **`contractStatus` is `"draft_for_review"`**,
  not published. The other citation (`.tmp/athyper-certificate-audit.jcWKE6LJ/…`) is in a **gitignored
  temporary directory** (`.gitignore:200`), i.e. scratch audit output, not a source of truth.

**But two real issues remain, and they are worth fixing:**

1. **The underlying framework defect is real.** `storage.idField` is contractually an arbitrary column
   (`entity-list-service.ts:1319-1329` and `lifecycle-service.ts:27` explicitly model
   "identity column not published as a field"), yet `query-service.ts:189-197` rejects non-UUID
   `recordIds` with `400 INVALID_RECORD_IDS`, `kysely-record-repository.ts:29` casts ids with `::uuid`,
   `authorized-aggregate.ts:46-57` fails `503 ENTITY_AGGREGATE_IDENTITY_INVALID`, and the experience
   routes call `uuid(request.params.recordId)`. The moment a `draft_for_review` artifact like the mdg
   country core is published, detail links, bookmarks, aggregates and activity break. Validate against
   the descriptor's identity field instead of a global UUID regex.
2. **There are two country definitions in the repo** — `metadata/products/shared/entities/country/definition.json`
   (uuid `id`) and `metadata/products/mdg/entities/country/core.json` (draft, `idField: "code"`, plane
   `neon`). Which is authoritative should be settled explicitly; an unreviewed draft contradicting the
   shipped definition is a governance risk regardless of who is right.

### 2.20 Experience / metadata runtime ○

Detail in [experience-metadata-20260929.md](review/experience-metadata-20260929.md). 13 findings, none
critical. Most relevant to Country:

- **Capability gate keyed on `rendererKey` but dispatched on an unvalidated `dataBinding.serviceKey`**
  (`experience/src/entity-section-service.ts:183`) — a mismatched publication skips
  `capabilities.resolve` entirely, so `internal` comments become readable with only the section
  `viewPermission`.
- **The section payload returns raw `data` beside the filtered `presentation`**
  (`entity-section-service.ts:224`) — values hidden by `dynamicFacets` visibility (and
  protection-decorated fields) still travel in `data.values` in the HTTP body.
- **Native lowering drops published `validation_spec` rules** (`metadata/src/native-runtime-projection.ts:257`)
  — authored length/range/pattern/allowed-values constraints never reach `descriptor.validation`, so
  record create/patch accepts values the entity's own intake surface rejects (fail-open inconsistency).
- **Cached descriptors are served without re-checking the coordinate** (`metadata/src/metadata-service.ts:53`
  + `distributed-descriptor-cache.ts:160`) — the uncached path rejects a mismatched entity/plane but the
  cache path returns it, and the cache's validator rebuilds the expected values from the cached value,
  making the check a tautology.
- Unbounded `leasedKinds` map in the invalidation worker (`metadata/src/invalidation.ts:39`) — memory growth.
- Mention-candidate narrowing trusts the client-supplied `visibility`
  (`experience/src/record-participants.ts:26` + `collaboration/src/collaboration-routes.ts:48`).

### 2.21 Collaboration and attachments ○

Detail in [collaboration-attachments-20260929.md](review/collaboration-attachments-20260929.md).
Rich-text XSS was checked hard and is **clean** (see §10). The notable defects:

- **high ✔ — the legacy attachment download is not record-scoped.** I verified the whole path:
  `kysely-attachment-repository.ts:136-142` (`loadForDownload`) selects
  `WHERE attachment.tenant_id = ${identity.tenantId} AND attachment.id = ${identity.attachmentId}`
  — **tenant-scoped only, no record scope** — and the shared admission module
  (`server/apps/platform-host/src/composition/shared/documents/attachment-admission.ts:88-89`)
  explicitly `return undefined` (i.e. no scope decision) for
  `entityCode === "content.item" || entityCode === "atlas.prompt"`, which are exactly the
  record-less user-content entities. So any principal holding the **tenant-level**
  `attachment.download` can mint a signed download URL for another user's `content.item` /
  `atlas.prompt` file, given its id. The entity-scoped path is correctly protected
  (`attachment-admission.ts:59-87` compares stored coordinates, with a finalize policy-hash recheck);
  the legacy path is the hole.
- **medium — rename/category writes fall back to the legacy `create` permission**
  (`attachment-routes.ts:128,42`), so tenant-level `document.attachment.create` can rename or flip
  general↔evidence on any attachment in the tenant.
- **medium — `projectRichText` emits `<img src="/api/attachments/:id/content">` for a route that does
  not exist** (`platform/collaboration/src/rich-text.ts:183`) — dead image in every stored
  `content_html`, and an IDOR trap if that route is later added without record-scoped admission.
- **medium — upload queue rows stick in "Processing…" forever** with no cancel/remove/retry
  (`form-detail/src/attachments/uploader.tsx:189,546`).
- **medium — a post-finalize staging-delete failure returns 500 for a successful finalize and orphans
  the blob** (`attachments/src/attachment-lifecycle.ts:575`; no `pending_cleanup_keys` manifest is written
  on that path, unlike `:980-990`), so purge never reclaims the object.
- Test gaps T1–T5, notably **no cross-owner download test** and a retrieval-admission test that passes
  for the wrong reason (its regex rejects dots, not policy).

### 2.22 Authoring plane: authored config can override compiled security fields ✔ **high**

**Location:** `server/packages/planes/studio/meta-entity-authoring/src/list-experience.ts:201-206`.

```ts
return {
  ...action,     // compiled action: permissions, rules, scopes, requiresPreflight, label, …
  ...config,     // authored navigation config, spread AFTER the compiled values
  placement: binding.interactionTarget === "navigation" ? "direct" : "overflow",
};
```

The authored `config` is spread **after** the compiled action, and the validation applied to it
(`:161-197`) checks only three things: that every `navigationConfig` key matches a known navigation
placement, that `config.workflowKey` references a non-deprecated flow with a step on the target surface,
and that `config.attentionCountKey` is a registered resolver. There is **no key allowlist**, so any
additional authored property — including `permissions`, `rules`, `scopes`, `requiresPreflight` or
`label` — lands on the action and overrides the compiled value. I confirmed the consumer accepts it:
`packages/contracts/platform/entity-list/src/experience.ts:294-306` validates `requiresPreflight` as a
boolean and carries it through into the published list experience.

**Impact:** `requiresPreflight: false` (or substituted `permissions`) authored against a navigation
binding reaches the **signed published** list descriptor, bypassing confirmation/MFA/policy preflight on
that action. Only the entity-list parser's boolean/non-empty checks stand between authoring and runtime.

**Fix:** build the result as `{ ...config, ...action }` (compile-time values win), or validate the
authored config against an explicit key allowlist that excludes every security field.

**Further authoring findings** (detail in
[meta-entity-authoring-20260929.md](review/meta-entity-authoring-20260929.md), 35 findings):

- **Every authoring route error is a 500** (`routes.ts:285-299` + `runtime/http/src/http-runtime.ts:219-244`):
  `TypeError` → 500 instead of 400, `FORBIDDEN` → 500 instead of 403, `CHANGE_SET_NOT_FOUND` → 500
  instead of 404, so a cross-tenant denial is indistinguishable from an infrastructure fault. Every test
  installs its own error mapper, which is why the suite cannot catch it. One host-level mapper fixes it.
- **`redispatch` republishes a body-supplied `releaseId` with no tenant or revision re-check**
  (`routes.ts:178-191`, `authoring-service.ts:264-278`, `kysely-authoring-repository.ts:538-561`), and
  `getSignedRelease`'s primary read omits the tenant predicate its own fallback applies — compensated
  only by RLS and the authorizer honouring `resource.releaseId`.
- **`contractHash` does not cover descriptor-affecting order choices**
  (`deterministic.ts:633-637,667-673` + `authoring-service.ts:243-244`): `surfaces`/`searchProfiles` are
  hashed order-insensitively but consumed order-sensitively, so **one reviewed hash can publish
  different content**, and `isDefault` uniqueness is never validated.
- **`localeCompare` is used for canonical ordering that feeds hashes and idempotency fingerprints**
  (5 sites, e.g. `case-lifecycle.ts:508`, `graph-dependencies.ts:184`), so the same input can produce a
  different `descriptorHash` depending on locale/ICU — including dev vs CI divergence.
- **`validateGraph` throws instead of reporting** on malformed array rows (`deterministic.ts:789,886,929`),
  so `fields:[null]` becomes a 500 rather than a `GRAPH_*` validation issue.
- **`runContractTests` accepts vacuous assertions** (`deterministic.ts:489-509`), so the `submit` gate can
  be satisfied without real coverage (a `path_equals` assertion with no `expected` passes on a missing path).
- **Hardcoded entity codes in shared authoring code** (`kysely-authoring-repository.ts:99,115`,
  `document-collection-publication.ts:35`) — release inspection/activation silently returns nothing for
  every entity except `business_partner`, and the guard tests only scan five files.
- **Collection save overwrites the whole `layoutConfig`** (`collection-authoring-routes.ts:114-122`),
  silently dropping `localizedLabels`, `filterPresentation` and `entityValidationMessages`.
- **Database error codes are echoed to clients as `409`** (`learning-routes.ts:6-12`) — any error with a
  string `code` (including SQLSTATE `23505`) plus its raw message.

### 2.23 Host composition, DB scripts and tests ○ — with three items verified ✔

Detail in [host-composition-db-tests-20260929.md](review/host-composition-db-tests-20260929.md)
(566 files / 82,068 lines enumerated, 19 findings).

**Good news first — the refactor is clean.** All **17** relocated modules are **byte-identical moves**
(verified by byte-comparing each deleted→successor pair against `HEAD`), all **6** moved tests are
identical, and every production reference was updated. The two modules that were deleted without a
successor (`kernel/capability-readiness.ts`, `development/verification-delivery.ts`) were **dead code**
— their only importer was their own deleted test — so no live coverage was lost. That is a materially
better outcome than the stale inventory and the broken gates suggested.

**Verified by me ✔ — two test suites are broken right now:**

- `composition/shared/verification/__tests__/routes.test.ts:5` imports `../routes.js`. That module was
  deleted by the refactor; the successor is `composition/shared/verification.ts` (it exists). vitest
  collects this file, so the platform-host suite fails module resolution.
- `tests/foundation/atlas-record-question.test.ts:3` imports
  `.../composition/shared/ai/atlas-record-question`. `shared/ai/*` was deleted; the successor
  `composition/spaces/neon/ai/atlas-record-question.ts` exists. So **`pnpm test:foundation` fails, and
  therefore so does `pnpm test`** (`test:root` runs `test:foundation`).

Both are pure missed specifier updates to existing successors — a two-line fix.

**Verified by me ✔ — metadata validation hooks are dead code.** `createEntityMetadataHooks`
(`composition/shared/entity-runtime/metadata-validation.ts:17`) has **zero importers** anywhere in
`server/`, `tests/` or `tooling/`. So metadata-declared `requiredCoordinates` and reference-domain
requirements are **never enforced at runtime** — a fail-open in the shared Entity Framework itself,
which is exactly the class of gap the framework is supposed to close. Wiring it (or deleting it and
enforcing elsewhere) is a small, high-leverage fix.

**Verified by me ✔ — verification endpoints authorize on authentication only — and they compose with
the env fail-open.** The routes declare `authenticated: true` and are mounted with only
`createIamAuthenticationMiddleware(iam)` (`shared/verification.ts:110-135`); there is **no permission
check**. `GET /api/platform/verification` returns cross-plane DB/cache/readiness state, and
`POST /api/platform/verification/runs` runs privileged synthetic probes (bucket write/delete, malware
scan, PDF render, search upsert/delete, outbound email). Individually it is gated: `enabled` defaults to
`readBoolean("PLATFORM_VERIFICATION_ENABLED", env === "local")` (`config/environment.ts:1081`), i.e. off
outside local. **But** the companion finding is that a missing `ATHYPER_ENV` **fails open to `local`**
(`config/environment.ts:310-317`), which simultaneously turns verification on, allows shared
BullMQ/Redis, downgrades `AUTH_CLAIM_FIRST_CONTEXT` to `shadow`, and accepts legacy S3 keys. Together
they are a real deployment risk: a production-like host that simply forgets the env var silently runs
local semantics **and** exposes authentication-only privileged probe endpoints. Fix the env default
(fail closed when `ATHYPER_ENV` is absent) and add a permission gate to the verification routes.

**Further items** (reviewer-reported): an unbounded
`UPDATE master.principal SET auth_epoch = auth_epoch + 1` in the clean-slate reset with no `WHERE` and
no row-count precondition, plus the seed pack applied **after** `COMMIT` — together, a global session
invalidation with no post-commit recovery; seven operator JSON configs parsed without `try/catch`
(raw `SyntaxError`, unclassifiable boot failure); a stale generated test-reachability report
(`pnpm test:reachability` already red before this refactor); a hardcoded `athyperadmin:athyperadmin`
credential fallback in a dev seed extractor; and `tests/contracts/bff-relay-security.test.ts:34-55`
now deriving its expectation from the code under test (a plane could lose operations and still pass) —
partly offset by the new `tests/contracts/relay-common-plane-operations.test.ts`.

### 2.24 Entity-runtime exhaustive sweep ○ — two items verified ✔

Consolidated report: [entity-runtime-sweep-20260929.md](review/entity-runtime-sweep-20260929.md)
(11 group passes, 2,873 lines, per-file coverage verdicts). Four findings are rated high; **two of them
I verified in code**, and both are worth fixing immediately:

1. ✔ **`SearchableSelect` refetches the reference directory forever when a saved value cannot be
   resolved** — an unbounded request loop from an ordinary detail form. Verified:
   `effectiveOptions` is rebuilt with `[...byValue.values()]` keyed on `[directory.options, options]`
   (`foundation/ui/src/searchable-select.tsx:179-184`), so it is a **new array on every response**; the
   resolver effect depends on `effectiveOptions` and only returns early when the requested `value` is
   *present* (`:239-242`). If the server answers 200 without that value (retired/removed directory row,
   or an empty page), the guard never becomes true, so each response re-triggers the effect and issues
   another request — and each iteration creates an `AbortController` that is **never aborted**, so
   responses can land out of order. Impact: opening a form whose record holds a retired reference key
   hammers the directory endpoint until the tab closes. **Fix:** guard with an "already attempted this
   exact `value`" ref reset on `value` change, abort the previous request via a controller ref, and make
   the effect depend on a content-stable key rather than array identity.
2. ✔ **Filter editor offers 17 relative periods while the API accepts 9** → 8 options always answer
   `HTTP 400` (full evidence and the one-line fix in §2.18).

Reviewer-reported highs:

- **Permission-projected presentation keeps navigation/panel references that the re-parse then rejects**
  (group G8) — the projected presentation is re-parsed after permission filtering, so a navigation or
  panel entry that the projection removed is still referenced.

Notable mediums across the sweep (all with quoted evidence in the report):

- Comment boundary validation is **discarded** — rejected rows are still rendered.
- An unguarded `intl.date(...)` on comment timestamps **crashes the whole comment list**.
- The activity workspace keeps the previous record's snapshot selection and comparison.
- A capture idempotency key survives a record change and **permanently blocks the next capture**.
- Whole-record invalidation leaves the active non-initial section stuck on "Loading section…".
- Status polling permanently stops for a file after 5 failures; file admission and uploads continue
  after the uploader unmounts; folder retry keeps a stale `expectedRevision` and drops the idempotency
  key on conflict.
- `SearchableSelect`/`EntityLookup` remount on every answer change, losing in-progress search state.
- Intake `entityLookup` fields can never receive an adapter through the registered composer.
- Drag-to-upload gate compares `dataTransfer.types` against a **localized label**.
- Superseded conversation selection permanently disables the history list.
- Saved-view `state` is typed as a complete `SaveableListStateV1` but the wire payload can be `{}`.

The sweep also catalogues a large amount of dead/duplicated surface — unreferenced exports
(`EntityIntakeForm`, `EntityDraftSaveButton`, `AttachmentPreviewControl`, the whole `reference-lookup`
module, `parseEntityRuntimeBootstrap`, the `governed-workflow` parsers, `ENTITY_CODE_MIN_LENGTH/MAX_LENGTH`),
write-only state, unreachable branches, and several `aria-controls`/`tabpanel` ids pointing at panels
that are not rendered. These are individually low severity but together they are the cheapest possible
cleanup and they reduce the surface a future reviewer must trust.

---

## 3. Dimension 2 — Improvements

Ordered by value ÷ risk. Items marked **◐ in flight** were being implemented concurrently during
this review.

1. **Fail-fast the relay allowlist** (§2.12). Highest security payoff per line: three hand-maintained
   plane allowlists were drifting; `COMMON_PLANE_RELAY_OPERATIONS` unifies them **◐ in flight**, but the
   duplicate guard is still missing and the studio derivation bug remains.
2. **Make the URL boundary forgiving per parameter** (§2.1) and cap the search input (§2.2) — these two
   convert a class of "the list is broken" reports into correct behaviour.
3. **Make failures visible instead of silent.** A single theme runs through the findings: stale rows after
   a failed refresh (§2.3), capability probes that swallow transport errors (§2.7), `mutateBookmarks`
   returning silently (§2.5), and 10 bare `catch {}` blocks in the entity runtime. Adopt one
   error-surfacing primitive (§7.2) so the failure mode is uniform.
4. **One retryability model.** `list-view/src/retry-policy.ts` (`kind==="parse" || [401,403,409]`) and
   `shell/app-foundation/src/error-taxonomy.ts` (`retryAfter`/`canRetry`) encode two independent
   notions of "retryable". Collapse to `classifyAppError(...).canRetry`.
5. **Route all formatting through the existing i18n runtime.** `intl.number()` / `intl.date()` already
   exist (`foundation/i18n/src/index.ts:202-206`) and are timezone- and numbering-system-aware, yet the
   entity runtime makes 15 raw `Intl.NumberFormat` + 5 `toLocaleString` calls, and the shell has 20+
   raw `Intl.DateTimeFormat`/`toLocaleString` calls against 7 `intl.number()` uses — several with
   hardcoded `"en-US"`/`"en"`/`"en-GB"` locales. This is pure reuse, no new code.
6. **Replace the `country_code` magic role and the `/country/i` heuristic** — see §9.2. Three copies of
   the same heuristic, plus a substring test on field *labels* that misclassifies any field whose label
   contains "country" (`bank_country_code`, `registration_country_code`).
7. **Delete the per-entity i18n catalog from the shared package** —
   `packages/platform/foundation/i18n/src/catalogs/country.ts` (~30 `entity.country.*` keys × 3 locales)
   duplicates `label.defaultText` already in `definition.json`, and `entity-catalogs.ts:4,12` wires it in
   with a comment that normalizes the pattern for every future entity. Deleting it is the cheapest
   demonstration that entity configuration belongs in metadata.
8. **Add the missing list-runtime tests.** There are only 3 test files in the whole scoped frontend area
   (`workspace-context-control.test.tsx`, `workspace-scope.test.ts`, `temporal/index.test.ts`) — **zero**
   for a 5,275-line list runtime that is 83% of its package.
9. **Add a regression test per fixed bug.** Several of the bugs above are exactly the kind a single
   assertion would have caught (URL round-trip with a bad `density`, `Previous` after remount,
   duplicate relay id).
10. **Fix the two no-fallback token references** (§7.1) — silent rendering bugs on the Country page.

---

## 4. Dimension 3 — Coding standards

### 4.1 There is no Prettier config — and that is a live problem ✔

There is **no `.prettierrc*`, no `prettier.config.*` and no `"prettier"` key** anywhere except the
devDependency (`prettier --find-config-path` errors: *"Can not find configure file"*). Prettier
therefore runs on **defaults** (`printWidth: 80`) against a codebase hand-authored at ~120 columns.

Consequences, measured:

- `pnpm format:changed --check` fails on **43 changed files**.
- `npx prettier --check "packages/platform/entity/runtime/**/*.{ts,tsx}"` → **78 files** would be
  reformatted.
- The in-flight diff of `form-detail/src/index.tsx` is **448 insertions / 41 deletions** for what is
  essentially "move two helpers to `form-values.ts` and import the workspace" — i.e. **formatting
  churn dominates the real change** and buries it for reviewers.

The `format:changed` ratchet (`.prettierignore` even documents the compact-CSS style) is a reasonable
policy, but with no config the enforced style is *not the repo's style*, so every touched file is
rewritten and every diff is inflated.

**Fix:** commit a `.prettierrc` matching the actual codebase (`printWidth: 120`, `semi: true`,
`doubleQuote`), then run `pnpm format` once as a dedicated, review-free commit. Also: 33 scoped files
contain hand-authored lines >500 chars (worst: `list-view/src/data-operations.tsx`, 14 such lines;
`api-client/src/entity-list.ts`, 9) — those are unreadable and unreviewable regardless of config.

### 4.2 Type-safety escapes

- **15 `any`**, all in `form-detail` and all replaceable by already-exported contract types:
  `comments-workspace.tsx` (8), `rich-text-render.tsx` (5), `attachments/collection.tsx` (1),
  `registered-renderers/contact-address.tsx` (2).
- **4 casts that defeat the type system**: `comments-workspace.tsx:1002` `(history.items as any[])[0].revision`;
  `shell/shell/src/core.ts:108` `as unknown as Routes`; `contracts/.../runtime-resource.ts:135` `item.state as never`;
  `descriptor-client/src/activity-client.ts:125` `v.defaultView as never`.
- **70 non-null assertions**, mostly the `array[0]!` family. The worst is
  `entity-lookup.tsx:336` `adapter!.select!(rows[0]!)` (triple). 258 `as const` are legitimate.

### 4.3 Silent failures

10 bare `catch {}` / empty-catch blocks in the entity runtime and shell:
`collection-controls/src/filter-editor.tsx:522,679`; `form-detail/src/related-entity-section.tsx:108`;
`shell/shell/src/activity-query-controls.tsx:76,90`; `shell/shell/src/atlas-workspace.tsx:300`;
`shell/shell/src/client.tsx:199,204`; `shell/shell/src/home.tsx:568`;
`foundation/theme/src/index.tsx:29`. The storage ones are defensible; the query-controls and
related-entity ones hide real failures. Note the listing runtime's own `catch` blocks
(`list-view/src/index.tsx:699,4876,4903`) are **well-commented and correct** — this is not a blanket problem.

### 4.4 Other

- **6 `console.*`** in source; two are **ungated** `console.info` in `planes/neon/shell/src/index.tsx:1106,1121`
  (should use the repo's `onDiagnostic` pattern, used in 102 places).
- **Dead public API**: `foundation/ui/src/presentation.tsx` exports `ActionLink`, `ActionButton`,
  `ScreenReaderText` with **zero consumers**, while `className="a-visually-hidden"` is hand-written
  20× across 8 files instead of using `ScreenReaderText`.
- `list-view/src/drawer-registry.tsx:18` — `export const listDrawer = (key) => LIST_DRAWERS.find(...)!`
  returns `undefined` at runtime despite the non-null assertion in a public API.
- `foundation/ui/src/tooltip.tsx:80` uses `zIndex: 2147483647` **plus** inline
  `padding`/`borderRadius`/`background`/`color`/`fontSize` — the worst magic number found; should be
  `var(--a-z-toast)` and the design-system classes (compare `collaboration-actions.tsx:69`, which does
  `zIndex: "var(--a-z-popover)"` correctly).

---

## 5. Dimension 4 — Standard file names and method names

**File naming is essentially perfect and needs no work:** 317/320 scoped `.ts/.tsx` files are strict
kebab-case; 0 PascalCase, 0 camelCase, 0 source junctions. The 3 "exceptions" are test files whose
dotted suffix is what `tooling/scripts/policy/test-file.mjs:13-14` requires. Test naming is consistent
(`*.test.ts(x)` / `__tests__/`) — the problem is *how few* there are (§3.8).

**Real naming findings:**

| # | Finding | Where | Fix |
| --- | --- | --- | --- |
| 1 | `Catalog` vs `Catalogue` — the file is `field-catalogue.tsx` but every identifier inside is `FieldCatalogue*` and the contracts use `Catalog` (125 vs 4 hits) | `list-view/src/field-catalogue.tsx` | rename to `field-catalog.tsx` |
| 2 | `section` vs `tab` for the same concept (774 vs 218 hits) — `record-360-panel.tsx` navigates `panel.tabs`, while `detail-workspace.tsx:244-250` and `record-navigation.tsx:92` navigate `tab.sectionKeys[0]` | form-detail | pick one axis (`sectionKey`) end-to-end |
| 3 | Generic, unprefixed exports that will collide: `Fields`, `Collection`, `EmptySectionState` | `section-primitives.tsx` | `SectionFields`, `CollectionEmptyState`, … |
| 4 | Bare `Props` (repo convention is `XxxProps`, 79 uses vs 3) | `collection-section.tsx:26`, `record/record-summary-panel.tsx:15`, `foundation/ui/src/surface-error-boundary.tsx:3` | rename |
| 5 | The only `export default` in the design-system package | `foundation/ui/src/date-picker-calendar.tsx:20` | make it a named export |
| 6 | `record-*` (13 files) vs `entity-*` (23 files) for the same runtime object; the contracts consistently say `Entity*` | entity runtime | prefer `Entity*` for new files |
| 7 | Package name drops the infix its six siblings have | `@athyper/platform-collection-controls` vs `@athyper/platform-entity-{cascade,content-ui,descriptor-client,form-detail,list-view,workflow-ui}` | consider `@athyper/platform-entity-collection-controls` |

**Method naming is consistent:** all 47 hooks are `use`-prefixed; booleans are `is/has/can/should`-prefixed;
0 `I`-prefixed types; 0 `handleX` helpers (the repo universally uses inline arrows on `on*` props —
1,032 of them); 238 `SCREAMING_SNAKE` constants; 0 occurrences of `listing`.

**Duplicated method names (same name, different behaviour) — fix these:**

- `formatBytes` ×2 with **different output**: `list-view/src/data-operations.tsx:112` returns
  `"N MB"/"N KB"` with `Math.floor`; `shell/shell/src/home.tsx:1223` returns `"N B"/"N.N KB"/"N.N MB"`
  with `toFixed(1)`. Users see inconsistent units.
- `humanize` — **7 implementations**, 6 byte-equivalent:
  `shell/app-foundation/src/boundaries.tsx:79`, `shell/activity-center-data/src/index.ts:678`,
  `shell/shell/src/home.tsx:1787`, `shell/shell/src/quick-access.tsx:397`,
  `form-detail/src/index.tsx:419`, `form-detail/src/section-primitives.tsx:228` (exported — and the
  file **also** defines its own while `index.tsx` re-exports it), plus `core.ts:333` as
  `humanizePathSegment`. The server adds 6 more.
- Relative/absolute time ×3 with different rules: `quick-access.tsx:380` (`"Just now"`, `"5m ago"`),
  `atlas-workspace.tsx:880` (bare `HH:mm`), `home.tsx:1792` (`dateStyle:"medium"`).

**Fix:** one `humanizeKey()` and one `formatBytes()` in a shared `@athyper/platform-foundation-core`
(importable by the server too), and a `formatRelative`/`formatDateTime` pair on the existing
`IntlRuntime`.

---

## 6. Dimension 5 — CSS and the design system

### 6.1 Real rendering bugs from unresolved tokens ✔ **medium**

`pnpm policy:theme-token-integrity` fails with 13 findings. Two are on the Country page and are
**invalid CSS at computed-value time**, not style debt:

| Location | Problem | Fix |
| --- | --- | --- |
| `packages/platform/entity/runtime/form-detail/src/styles.css:933` | `border-radius: var(--a-radius-full)` — **no fallback and no such token** (the theme defines `--a-radius-{sm,md,lg,xl,round}`) → the activity-timeline bullet renders as a **square** | `var(--a-radius-round)` |
| `packages/platform/entity/runtime/form-detail/src/record/record.css:223` | `top: var(--a-page-sticky-top)` — **no fallback**; the token is defined only inside `.athyper-shell__body` → outside that scope `top` becomes `auto` and the sticky header **does not stick**. Sibling usages (`detail-workspace.css:8,64`) correctly pass a fallback | use the same chain as `foundation/ui/src/styles.css:131` (`var(--a-record-sticky-top, var(--a-page-sticky-top, calc(...)))`) |

Fallback-backed warnings (fail under `--strict`): `--a-on-brand`, `--a-record-sticky-top`,
`--a-surface-muted`, `--a-toast-bottom-offset`, `--a-color-danger` (a **legacy `--a-color-*` alias** —
only 2 remain repo-wide).

### 6.2 Hardcoded values that bypass the token system

- **Status badge palette hardcoded in the design system itself** —
  `foundation/ui/src/styles.css:177-179` uses `#166534`/`#f0fdf4`, `#854d0e`/`#fefce8`, `#991b1b`/`#fef2f2`
  while `--a-{success,warning,danger}-subtle[-foreground]` **already exist**. Fixing this teaches every
  consumer to stop hardcoding.
- `foundation/ui/src/styles.css:113` — `background: var(--a-primary,#264f89); color: white` and
  `border-radius: .5rem` in `.a-company-groups__avatar` (`--a-primary-foreground`, `--a-radius-md`).
- `shell/shell/src/styles.css:287` — 6 literal colours + 3 `rgb()` in `.athyper-atlas-workspace__empty`.
- `shell/shell/src/styles.css:535,623` use `var(--a-on-brand,#fff)` — `--a-on-brand` is **not a token**;
  `:732` `var(--a-warning,#b7791f)`.
- **`style-tokens --strict` is currently red**, and new raw typography appeared in 3 files:
  `form-detail/src/styles.css` (0 → 12: `line-height`, `font-size: 10px`, `font-weight`),
  `foundation/ui/src/styles.css` (45 → 56), `shell/shell/src/styles.css` (25 → 27).
- **1,776 raw px/rem literals** in non-authority scoped CSS against 1,387 `var(--a-space-*)` uses
  (~56/44). The policy does not enforce spacing, so this is soft debt — but it is the largest source of
  invisible drift. Worst: `shell/shell/src/styles.css` 747, `foundation/ui/src/styles.css` 288,
  `list-view/src/styles.css` 255, `form-detail/src/styles.css` 228.
- **55 numeric `z-index` declarations vs 41 `var(--a-z-*)` uses**, 15 distinct raw values (0,1,2,3,4,5,6,7,8,10,15,16,20,40,50);
  only 20/40/50 coincide with the token scale.
- **42 `!important`**, clustered: `shell/shell/src/styles.css` 15, `form-detail/src/styles.css` 9,
  `theme/src/styles.css` 6, `list-view/src/styles.css` 6. The same reset
  (`[hidden]{display:none!important}`) is pasted **5×**
  (`form-detail/src/styles.css:90,257,615,1061`, `foundation/ui/src/styles.css:468`) — it should be one
  design-system utility.

### 6.3 Structure

- The designated design-system layer is `@athyper/platform-theme` (**106 lines**) + `@athyper/platform-ui`,
  yet 17 scoped stylesheets hold **4,249 lines**. `form-detail` alone ships **4** ad-hoc CSS files
  (`styles.css` 1137, `record/record.css` 570, `detail-workspace.css` 147, `record/record-collaboration.css` 35).
- `shell/shell/src/styles.css` (896 lines) defines whole component families
  (`.athyper-landing__*`, `.athyper-module-nav`, `.athyper-governance-list`, `.athyper-home__*`) that
  belong in the design system or the plane packages.
- **36 `[data-plane=…]` selectors all live in that one shell stylesheet** (neon 17, studio 11, mesh 8),
  including neon experience rules duplicated verbatim for mesh/studio (`:395-403` vs `:418-427`). The
  plane stylesheets themselves are token-clean (13/2/32 lines) — move the forks there.
- **18 sites hand-roll the design system's own components**, e.g.
  `className="a-button a-button--secondary a-button--small"` **×10** (`list-view/src/index.tsx` ×6,
  `overview.tsx:144`, `record-action.tsx:46`, `record-header.tsx:121`, `record-navigation.tsx:287`,
  `intake.tsx:289`) instead of `<Button variant="secondary" size="small">`.
- **Zero arbitrary Tailwind colour utilities** and zero `clsx`/`tailwind-merge` imports — the token
  system is being used rather than bypassed. That is a real strength.

### 6.4 The gate itself needs two fixes

`tooling/scripts/policy/verify-design-system.mjs:29` omits `.ts` from its scanned extensions, so a
hardcoded colour in any `.ts` file is unpoliced; and `:42` exempts `atlas-modern.ts` but not
`atlas-mono.ts`, while `audit-style-tokens.ts:73-80` exempts all of `foundation/brand/src/`. That
inconsistency is currently hiding `atlas-mono.ts:10-11` (`#1a1a1a`, `#FFFFFF`). Separately, three of
the ten recently-fixed inline styles were **CSS-custom-property-only** (`--data-columns`,
`--intake-columns`, `--atlas-panel`) while the single allowlist entry is exactly that pattern — the
policy should recognise custom-property-only inline styles explicitly instead of a one-string allowlist.

---

## 7. Dimension 6 — Reusable components

Extraction candidates, each with its existing occurrence count. All are **additive** (no behaviour
change), and each has a working reference implementation to lift.

| # | Current occurrences | Proposed component | Proposed home |
| --- | --- | --- | --- |
| 1 | `<p role="alert">{error}</p>` **×11 verbatim** (`intake-classification.tsx:84`, `entity-lookup.tsx:500`, `attachments/uploader.tsx:617`, `attachments/collection.tsx:997,1163`, `comments-workspace.tsx:642,1098,1259,2080`, `intake.tsx:353`, `record-navigation.tsx:304`) + 29 more ad-hoc `role="alert"` blocks (40 total in form-detail) | `<InlineError message retry? />` | `foundation/ui/src/inline-error.tsx` |
| 2 | `<summary>Technical details</summary>` **×6** (`list-view/src/index.tsx`, `record-header.tsx:145`, `atlas-context-inspector.tsx:150,183`, `atlas-action-history.tsx:65`, `atlas-answer.tsx:309`) + duplicated `Request ID:` render | `<ErrorDetails error requestId />` | `foundation/ui/src/error-details.tsx` |
| 3 | Empty state implemented **3 different ways**, while `PanelEmptyState` **already exists** and is used in only some form-detail files | make `PanelEmptyState` the single component; delete the two list-view variants | `foundation/ui/src/panel/index.tsx:56` (**reuse, do not create**) |
| 4 | Pagination implemented **3×**: `ListFooter` (cursor), `LoadingFooter` (its skeleton twin), inline offset nav in `transfer-workspace.tsx:31` | `<PaginationFooter variant="cursor"\|"offset" />` + `<PaginationSkeleton />` | `foundation/ui/src/pagination-footer.tsx` |
| 5 | Table/header/toolbar skeletons: `LoadingTable` + 2 inline skeleton blocks; only 5 `<Skeleton>` uses vs 12 raw `a-skeleton` spans | `<TableSkeleton />`, `<PageHeaderSkeleton />`, `<ToolbarSkeleton />` | `foundation/ui/src/skeleton-blocks.tsx` |
| 6 | Status chip **3 designs**: inline `a-entity-list__status--{success\|warning\|neutral}` with literal `"active"`/`"draft"` vs the real `<Badge tone>` vs `a-transfer-workspace__status--` | `<StatusBadge value tone />`, tone from `field.values[].tone` | `foundation/ui/src/status-badge.tsx` |
| 7 | Clipboard **6 implementations, 3 different fallbacks** (full `execCommand` fallback, bare `navigator.clipboard?.writeText`, `CopyValue`) | `useClipboard()` + `<CopyButton />` | `foundation/ui/src/clipboard.tsx` |
| 8 | Confirmation **3 incompatible mechanisms**: inline `role="alert"` strip, portal `Dialog`, and **2× `window.confirm`** — while metadata already declares `removalConfirmation { mode, title, message, confirmLabel, cancelLabel }` | `<ConfirmDialog />` + `useConfirm()`, driven by that existing contract | `foundation/ui/src/confirm-dialog.tsx` |
| 9 | Sticky table header: the shared `StickyListTable` exists but **two raw tables bypass it**, and form-detail hand-rolls sticky positions in CSS 10× | promote `StickyListTable` → `<StickyTable>` and replace both raw tables | `foundation/ui/src/sticky-table.tsx` |
| 10 | Formatting: 15 raw `Intl.NumberFormat` + 5 `toLocaleString` in the runtime, 20+ raw `Intl.DateTimeFormat` in the shell, vs 7 `intl.number()` | `<FormattedNumber />` / `<FormattedDate />` (or just `intl.number/date`) | `foundation/i18n/src/react.tsx` |

**Explicit non-findings — do not build these:** drawer/sheet shells are already unified on `Drawer.*`
(78 uses; the one hand-rolled `role="dialog"` is a `ColumnFilter` popover, not a drawer); filter chips
already have `AppliedFilters` + `FilterChipGroup`; `PanelHeader` exists; and there is **no** `cn`/`clsx`
duplication (`cx` at `foundation/ui/src/index.tsx:20` is the only one — but see §8.4, `presentation.tsx:4`
still defines a private `classes()` twin).

---

## 8. Dimension 7 — Generalization and further reuse

### 8.1 Cross-plane duplication (quantified)

| # | Duplication | Measure | Where |
| --- | --- | --- | --- |
| 1 | `experience-runtime.tsx` | **mesh ↔ studio: 272/290 normalized lines = 94%**, every function at the *identical* line number. `orderSurface` and `safe()` are byte-identical 22- and 7-line blocks. neon is 48% shared — and diverges for genuine plane logic, **except** 88 lines of hardcoded `HOME_PROPS` that mesh/studio already compute generically | `apps/{neon,mesh,studio}/lib/experience-runtime.tsx` |
| 2 | "Access unavailable" panel | written **5× logically / 7× textually**, two of them literally identical within one file | neon `:160-166,193-199,240-246`; mesh/studio `:269-277` |
| 3 | `lib/relay.ts` | 15 operation tables imported and spread in all three planes (~90 duplicated lines) on the **authz trust boundary**, plus a byte-identical 16-line lazy-singleton/session block and a 3× duplicated `createAppRelay` signature | `apps/*/lib/relay.ts` |
| 4 | Plane catalog navigation | the **same 18-line** `PLATFORM_CATALOG_ROUTES.<plane>.flatMap(...)` builder ×3, differing only in id prefix and icon key; `planeDiagnostic(plane)` **byte-identical ×3** | `packages/planes/*/{navigation.ts,shell/src/index.tsx}` |
| 5 | App route adapters | **37 files / 279 non-blank lines** identical modulo the plane token. mesh vs studio `[moduleSlug]/page.tsx` is a 100% structural twin with 3 token substitutions | `apps/*/app/**` |

**Proposed shared homes:** `packages/platform/shell/plane-experience/`
(`createPlaneExperienceSurface`, `home-props.ts`, `state-panels.tsx`, `next-routes.tsx`) — branding
already comes from `getPlaneBrand` (`foundation/brand/src/index.ts:81`);
`packages/platform/gateway/bff-relay/src/plane-relay.ts` (`createPlaneRelayHandler`) so each
`apps/<plane>/lib/relay.ts` shrinks to ~12 lines; `packages/platform/shell/core/src/plane-routes.ts`.

**What legitimately stays per-plane:** the extension registry (`extensions`/`assets`/`dataSources`),
the permission surface (neon's module gate + work-context, studio's locale policy, mesh's
network-account selector), secondary navigation, and `hideHeader`/`framedHeader` surface keys.
Next.js forces the *file* to exist in each app — it does not force the *body*; body-only re-exports
give 279 → ~60 duplicated lines.

### 8.2 `country_code` is a magic string, and filter ordering is decided by English substrings ✔

`semanticRole` is typed as a free-form `string` (`entity-list/src/types.ts:127`), yet `"country_code"`
is load-bearing in seven places: an operator restriction (`entity-list-service.ts:1383-1387`), a
`valueKind` override (`:865`), a second operator restriction in the host composition
(`register-services.ts:2887`), a renderer branch (`list-view/src/index.tsx:4867`), and **three copies**
of the same quick-filter-priority heuristic (`list-view/src/index.tsx:2592`,
`entity-list/src/parsers.ts:966`, `entity-list-service.ts:1441`).

The server copy, verified verbatim, is worse than a magic role — it is an **English-substring
heuristic over field labels** that drives UI filter ordering for every entity:

```ts
// server/packages/services/records/src/entity-list-service.ts:1435-1446
function quickFilterPriority(field: ListFieldDescriptorV1): number {
  const value = `${field.key} ${field.label}`;
  return field.semanticRole === "status" || /\bstatus\b/i.test(value) ? 0
    : /category|group|class|kind/i.test(value) ? 1
    : field.semanticRole === "country_code" || /country/i.test(value) ? 2
    : field.semanticRole === "updated_at" || /updated|modified/i.test(value) ? 3
    : 10 + field.defaultOrder;
}
```

Two defects in one function: (a) any field whose *label* merely contains "country" is treated as an
ISO reference field — `bank_country_code` (which is then restricted to `eq/ne/in/is_null/is_not_null`
at `:1383`), or a free-text "Country of incorporation"; and (b) **behaviour varies with language** —
`Land`, `Pays`, `நாடு` do not match `/country/i`, so filter ordering and operator restrictions silently
change per locale. Metadata already supports all of this
(`queryPresentation.quickFilters`, `field.list.filterOperators`, `field.list.valueKind`).

Related, in the same shared compiler: `defaultVisible` falls back to
`index < 8 && !["confidential","pii","sensitive_pii"].includes(field.classification ?? "internal")`
(`entity-list-service.ts:875-882`) — a **hardcoded classification vocabulary** in list projection code,
so a new classification (e.g. `restricted`) silently becomes visible by default, and the first eight
fields are chosen positionally. `field.list.defaultVisible` already overrides it; publish a
classification policy and drive both from metadata.

### 8.3 `business_partner` is hardcoded into shared framework code — 16 hits

Examples: `apps/neon/lib/entity-application-layout.tsx:17`
(`if (entityCode === "business_partner" && isTenantWorkspaceRoute(...))`),
`packages/planes/neon/list-view/src/scope-adapters.tsx:91`,
`packages/platform/ai/agent-ui/src/automatic-brief.ts:5`
(`if (page.entityCode !== "business_partner") return;` — silently disables automatic briefs for **every
other entity**, including Country), `shell/shell/src/atlas-workspace.tsx:366`,
`atlas-answer.tsx:325,353`, and three hardcoded relationship keys in a **shared contract**
(`contracts/platform/entity-runtime/src/related-presentation.ts:77,88,109,543`, where the latter throws
for any entity that is not `business_partner`). Each has a metadata key that should drive it
(`entity.capabilities.atlas.automaticBriefs`, `entity.application.publicPath`, `scope.resolver`).

### 8.4 Duplicated helpers (beyond naming)

| Helper | Copies | Note |
| --- | --- | --- |
| UUID regex | **19** (2 variants) | `entity-read-route.ts:8-10` documents the difference as *intentional* (URL syntax vs storage policy) → needs **two named predicates** (`isRouteRecordId` / `isStorageUuid`), not one |
| `JSON.stringify` structural equality | **7** | key-order-sensitive → gives a real false negative in the list-view "Reset columns" enablement |
| Abortable-request `useEffect` boilerplate | **26** `signal:` sites / 33 `new AbortController()` | `list-view/src/index.tsx` 6, `activity-workspace.tsx` 5, `entity-lookup.tsx` 5 … → `useAsyncResource(key, loader)` reusing the already-good `createSharedRequestCoordinator` (`form-detail/src/shared-section-request.ts:7`) |
| Two class joiners in one package | 2 | `cx` (`foundation/ui/src/index.tsx:20`) vs private `classes` (`foundation/ui/src/presentation.tsx:4`) — byte-identical behaviour; delete `classes`. Plus 2 more `.filter(Boolean).join(" ")` sites |
| URL query serialization (`Array.isArray ? append : set`) | 4 | `api-client/src/index.ts:184-187` + 3 neon adapters |
| `country()`/`currency()`/`assetRef()`/`oneOf()` parse set | 3 | pasted 3× in the same package (`api-client/src/{network-account,work-context,bootstrap}.ts`) |
| Two URL-state codecs | 2 + partial | `entity-list/src/url-state.ts` (canonical) vs `form-detail/src/record/record-url-state.ts` (re-parses `window.location.search` 4× per render, no encoder counterpart); 32 `new URLSearchParams` sites across 18 files |

### 8.5 Decomposition of the monoliths

**`list-view/src/index.tsx` (5,703 lines in the worktree; 5,275 at HEAD)** — 71 hook calls
(25 `useState`, 20 `useEffect`), 51 top-level declarations, 83% of its package in one file. Largest
members: `EntityCollectionRuntime` 851 lines / 23 hooks, `ListChrome` 606 / 15, `FilterDialog` 474,
`SavedViewsDialog` 456, `EntityRows` 379 (29 props). `EntityCollectionRuntime` alone runs **six
interleaved state machines** (descriptor authority, location hydration, page fetch, selection,
bookmarks, filter choices) with the `authorityKey` invariant hand-enforced in six places.

*Extraction order (this matters):* first the **zero-risk leaves** — `format/`, `grouping.ts`,
`filter-priority.ts`, `states/` (~600 lines, pure functions and presentational leaves); then
consolidate the six machines into **one** `useCollectionState(authorityKey)` reducer with an explicit
`resetAuthority` action, because the reset is currently atomic in one effect body and a piecemeal
`useState` split will silently break descriptor/page/selection coherence; only then extract
`collection-runtime.tsx`. **Coordinate first — this file was rewritten +678/−250 during this review.**

**`bff-relay/src/index.ts` (2,927 at HEAD / 3,524 in worktree)** — not a god component but a god
*module holding a data file*: 194 top-level consts, **2,131 of the first 2,192 lines (97%) are
declaration bodies**, 192 exported `*_OPERATION(S)` tables, 270 allowlisted route entries; the only
large function is `createRelayHandler` (248 lines). The hazard is that the **authorization surface is
exported from the module that also contains the handler** — every entity/plane addition conflicts
(it grew 597 lines *during* this audit). Proposed split into `src/operations/<domain>.ts` behind an
**unchanged barrel**, then `src/relay/{handler,matcher,upstream,request-policy,problems}.ts` — very low
risk, and do `operations/` first to clear the conflict magnet.

**`entity-list-service.ts` (1,582 lines)** — one 628-line factory returning a 6-method service
(`detailDescriptor` alone is 156 lines) plus four descriptor compilers and ~15 normalizers;
`compileEntityListDescriptor` has the highest branch count. Each method independently re-does
`descriptorFor → authorize → readableRecordFields → project`, which is the natural seam. Extract the
pure-function modules (`field-projection`, `collection-scope`, `filter-presentation`) first; the
service split is riskier because the six methods share `options` and the `RecordServiceError(403, …)`
ordering is load-bearing.

**Outside the requested folders, same problem:** `comments-workspace.tsx` 2,100 lines,
`attachments/collection.tsx` 1,717, `data-surface.tsx` 862, `related-record.tsx` 753,
`entity-lookup.tsx` 748, `collection-section.tsx` 628 (form-detail package total 17,510), and
`planes/neon/shell/src/index.tsx` 1,189. These are being edited right now — hold off.

### 8.6 Highest-value generalization wins, ranked

| # | Win | Value | Risk |
| --- | --- | --- | --- |
| 1 | Fail-fast relay allowlist + finish `createPlaneRelayHandler` | removes 3 drifting allowlists on the authz boundary; **half in flight** | very low |
| 2 | Delete the `country_code` magic role and the `/country/i` heuristic (3 copies); make `semanticRole` a contract enum | fixes a real misclassification bug; unblocks every non-country entity | low (metadata keys already exist) |
| 3 | Delete `i18n/src/catalogs/country.ts` + its registration | −30 shared lines; removes the only per-entity source file in the shared i18n package | low (all keys exist as `defaultText`) |
| 4 | Extract `packages/platform/shell/plane-experience/` | ~500 duplicated lines gone; removes the BP-hardcoded neon home | medium (preserve neon's permission/work-context gates; do mesh+studio first) |
| 5 | Split the list-view leaves (`format/`, `grouping.ts`, `filter-priority.ts`, `states/`) | ~600 lines out of an 5,275-line module | very low |
| 6 | Consolidate the six list state machines into one reducer | the invariant is hand-enforced in 6 places today | medium-high |
| 7 | Move the 194 relay operation tables behind an unchanged barrel | unblocks parallel entity onboarding | very low |
| 8 | Split `entity-list-service.ts`, pure functions first | makes the authorization-adjacent compiler reviewable | low / medium |
| 9 | Extract the §7 UI primitives, starting with `InlineError` (11 verbatim copies) and `StatusBadge` | kills hardcoded `"active"`/`"draft"` too | low |
| 10 | Shared route-adapter factories (279 → ~60 duplicated lines) | one place to change entity routing | low-medium |

---

## 9. Quality gates — current status

Status captured at the end of the review. Counts move because the tree was being edited concurrently;
the *states* below were stable across three separate runs.

| Gate | Status | Cause |
| --- | --- | --- |
| `policy:design-system` | **green** | passes the ratchet at 144 known violations. The 10 regressions that were present earlier in this review (glyph icons, 2 inline styles, 1 literal `#fff`) were **fixed concurrently during the review** — nothing to do. |
| `policy:style-tokens:strict` | **RED** | error findings increased in 3 files: `form-detail/src/styles.css` (0→12), `foundation/ui/src/styles.css` (45→56), `shell/shell/src/styles.css` (25→27) |
| `policy:theme-token-integrity` | **RED** | 13 findings; 2 are real rendering bugs on the Country page (§6.1) |
| `policy:frontend-spine` | **RED at HEAD** | the manifest lists 4 packages whose sources were deleted in `870f08f52` (3× `business-partner`, `iam/governance-review`); those directories now contain **only `node_modules`**. Plus dependency-budget breaches: `shell/shell` 12 > 8, `app-foundation` 11 > 10 |
| `policy:i18n` | **RED at HEAD** | asserts `fallback_locale_code` / `enabled_locale_codes` in `server/db/ddl/common/control/03_tables.sql`; the actual schema uses `is_fallback boolean`. **`pnpm lint` = `policy:i18n && turbo lint`, so `pnpm lint` is blocked** |
| `format:changed --check` | **RED** | 43 → 48 changed files during the review; root cause is the **missing Prettier config** (§4.1) |
| `policy:shared-purity` | green | verified (68 active shared packages) |
| `policy:plane-boundaries` | green | verified |
| `turbo test` (platform-host suite) | **RED** | `composition/shared/verification/__tests__/routes.test.ts:5` still imports the deleted `../routes.js` (successor exists) ✔ |
| `pnpm test:foundation` → `pnpm test` | **RED** | `tests/foundation/atlas-record-question.test.ts:3` still imports the deleted `shared/ai/atlas-record-question` (successor exists) ✔; `tests/foundation/reference-choice-policy.test.ts:7` imports a module that never existed |
| `pnpm test:reachability` | **RED** | generated `test-reachability-retirement.json` is stale vs `verify-test-reachability.mjs:271-276` (already red before this refactor) |

The two red gates marked **at HEAD** are broken on a clean checkout and are independent of the
in-flight refactor — they are the cheapest, highest-confidence fixes in this report. The three red test
suites are broken **by** the refactor and are each a one-line specifier fix.

---

## 10. What is already good (do not churn)

- Byte-identical shared entity entry point across all three planes; Country config entirely in metadata.
- Strict, correct route resolution with `notFound()` for anything unexpected.
- Server-side `requireOperation(..., "read", recordId)` before fetch; ownership enforcement **fails closed**
  (`503 ENTITY_OWNER_ADAPTER_UNAVAILABLE` rather than allow).
- Proper `AbortController` + `signal.aborted` + descriptor-hash/scope-fingerprint validation on every list fetch.
- `serverQueryKey` covers exactly the fields `entityListQuery` sends (so `columns`→`fields` correctly refetches).
- Saved-view storage validated per entry, so the saved-view base can never throw into the URL codec.
- Filter value codec round-trips numbers/booleans/enums/`datetime-local`, and `filterValidationError`
  blocks invalid input before `apply`.
- Bookmark optimistic updates are epoch-correct with rollback scoped to their own ids.
- `entityDescriptorClient` identity is memoized, so descriptor memos and effects are stable.
- 0 `TODO`/`FIXME`, 0 commented-out code, 0 `@ts-ignore`/`eslint-disable`, 0 `I`-prefixed types,
  317/320 kebab-case filenames, 4,296 `readonly`, only 4 default exports.
- Zero arbitrary Tailwind colour utilities; no `clsx`/`tailwind-merge`; 2 legacy `--a-color-*` aliases left.
- The theme authority is self-consistent (0 unknown references, 0 dependency cycles, 136 tokens).

---

## 11. Where the detail lives

| Report | Contents |
| --- | --- |
| [frontend-runtime-bugs-20260929.md](review/frontend-runtime-bugs-20260929.md) | 10 findings with quoted evidence, plus ~12 disproved suspicions |
| [publication-compilation-20260929.md](review/publication-compilation-20260929.md) | 17 findings (1 critical, 4 high) over 120 files / 18,808 lines |
| [meta-entity-authoring-20260929.md](review/meta-entity-authoring-20260929.md) | 35 findings (4 high) over 113/113 files, with an automated import-resolution pass |
| [experience-metadata-20260929.md](review/experience-metadata-20260929.md) | 13 findings (none critical) over 114 files / 15,856 lines |
| [collaboration-attachments-20260929.md](review/collaboration-attachments-20260929.md) | 12 findings + 5 test gaps over 59 files / 15,351 lines, with a thorough XSS/IDOR refutation |
| [host-composition-db-tests-20260929.md](review/host-composition-db-tests-20260929.md) | 19 findings over 566 files / 82,068 lines, including a byte-level diff-proof of the refactor |
| [entity-runtime-sweep-20260929.md](review/entity-runtime-sweep-20260929.md) | exhaustive per-file sweep: 11 group passes with coverage verdicts, 4 highs and a large dead-surface catalogue |

## 12. Suggested order of work

Ordered by (impact ÷ effort). The first two steps are hours, not days, and each closes a real hole.

1. **One-line fixes that un-break CI (do first):** repoint the two stale test specifiers
   (`verification/__tests__/routes.test.ts:5`, `tests/foundation/atlas-record-question.test.ts:3`) —
   their successors already exist, so this restores `turbo test` and `pnpm test`. Then fix the stale
   `frontend-spine-packages.json` and the i18n policy/DDL mismatch, which **unblocks `pnpm lint`**.
2. **Close the fail-open holes (highest security value per line):**
   - tenant-scope the publication **rollback** route and add `tenant_id` to `fn_rollback_release`
     (§2.14 — the only critical finding, and the read paths already show the correct pattern);
   - make a **missing `ATHYPER_ENV` fail closed** instead of resolving to `local` (§2.23) — this alone
     disables the authentication-only verification endpoints by default and restores claim-context
     enforcement and queue/Redis isolation;
   - **wire or delete the field-authorization profile path** (§2.17) — either inject the backends or fail
     closed when a descriptor carries `authorizationRuntime` and no backend is installed;
   - add a **permission gate** to the verification routes and **record-scope** the legacy attachment
     download (§2.21, §2.23);
   - wire `createEntityMetadataHooks` or delete it and enforce the declared coordinates elsewhere (§2.23);
   - add the **duplicate-id/route guard** to `createRelayHandler` and fix the studio derived group
     (§2.11–2.12).
3. **Repair or delete the 3 dead test files** (§2.13) — decide whether `intake-presentation.ts` and the
   studio `business-partner` sources were intentionally removed.
4. **Fix the user-visible list and detail bugs:** §2.1 (URL state), §2.2 (search length), §2.3 (stale
   cursor), §2.4 (Previous), §2.5 (selection), §2.6 (detail retry) — each with a regression test, since
   every one of these is the kind a single assertion would have caught.
5. **Make the CSS gates honest:** fix the two no-fallback tokens (§6.1), commit a `.prettierrc`
   matching the real codebase style (§4.1), then clear the style-token ratchet.
6. **Then generalize:** §8.6 in order — relay allowlist and metadata-driven semantics first, mesh+studio
   plane-experience before neon, and the list-view leaf extraction **only after coordinating**, because
   `list-view/src/index.tsx` was rewritten +678/−250 while this review was running.
