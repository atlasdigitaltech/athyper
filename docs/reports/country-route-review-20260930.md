# Comprehensive review — `/app/entity/country` on the shared Entity Framework

**Fresh, independent review.** Requested dimensions: (1) bug fixes, (2) improvements,
(3) coding standards, (4) standard file/method naming, (5) CSS design system,
(6) reusable components, (7) generalization and further reuse.

This run deliberately **does not reuse** the earlier
`country-route-comprehensive-review-20260929.md`. The area auditors were instructed not to
open it, and every finding below is derived from the source at the revision recorded here.
Where this report disagrees with the earlier one, that is stated explicitly.

---

## 0. Snapshot, method, and how to read this

| Item | Value |
| --- | --- |
| Date | 2026-09-30, 00:03–00:55 (+08) |
| Revision | `HEAD = 63fc9492b`, **dirty and actively mutating worktree** (231 → 232 changed paths during the review) |
| Method | Read-only with respect to source. **I modified no source file** — the only files written are this report and the 21 appendices under `docs/reports/review-fresh/`. |
| Coverage | 13 areas, traced from the Country URL through relay → records → experience/metadata, plus the supporting contracts, publication, authoring, collaboration, host composition, DDL, CSS and test infrastructure. |
| Output | 187 findings across 13 areas; 12,308 lines of appendix in 21 files, including the adversarial verdicts. |

### ⚠️ The tree is being edited concurrently — read line numbers as approximate

This is not a static snapshot. While this review ran, **another process was writing source
files in the same worktree**. I observed `server/packages/platform/control-admin/src/rounding-control.ts`
modified at 00:49:54, with a cluster of edits from 00:42 to 00:50 across
`server/packages/platform/finance`, `reference-data`, `iam` tests and
`tests/foundation/atlas-record-question.test.ts` — none of them related to the Country
entity route, and none of them mine (my subagents were instructed and verified as
read-only; all their writes are under `docs/reports/review-fresh/`).

Two consequences you should weigh:

1. **Line numbers drift.** Every citation was correct when read, but a file edited after
   that point may have moved. Verify by content, not by line.
2. **Some findings may already be fixed — and at least one was.** I traced all five
   relative-date layers and found them consistent, which **refutes** a claim carried by
   the earlier report (see §2.11). That is most likely the concurrent editor having fixed
   it mid-review. Treat the "already resolved" possibility as live for every finding.

I re-verified the four highest-severity findings against the tree at 00:54, after the
concurrent edits: `entity-backend-authorizer.ts:150` and `:442-446` are unchanged and
`entityBackends`/`entityCaseBackendAuthorization` still have zero suppliers;
`kysely-record-repository.ts:168` still does not call `escapeLike`;
`intake-presentation.ts` is still absent and
`packages/planes/studio/business-partner/` still contains only `node_modules`.

### Verification legend — read this before quoting a severity

| Mark | Meaning |
| --- | --- |
| **✔ mine** | I read the code myself and confirmed it in this session. |
| **✔ adv** | An independent adversarial verifier opened the cited lines, traced the consequence, actively tried to refute the claim, and confirmed it. Several verdicts include executable or live-database reproduction. |
| ○ reported | An area auditor reported it, consistent with the code I read, but **no adversarial verdict exists**. Treat the severity as a claim, not a fact. |

**Honest limitation.** Adversarial verification was run on every finding the auditors rated
`critical`/`high`. Seven areas produced verification files during the main pass
(`authoring`, `collaboration-attachments`, `entity-runtime-support`, `frontend-detail`,
`gateway-relay`, `publication`, `test-health`), and a closeout pass covered the four
remaining unverified highs from `frontend-list`, `metadata-experience` and
`css-design-system` (`closeout-verification.md`). Three areas still have no per-finding
verdict — `host-composition`, `server-records` and `standards-naming-reuse` — but I
personally confirmed their highest-severity items in this session (§2.5, §2.7, §4.1).

The adversarial pass was not a rubber stamp. It **downgraded** real findings, and it
**refuted** one claim carried by the earlier report. Those corrections are recorded in
§2.11 and §2.12 rather than being quietly dropped.

---

## 1. Executive summary

### The one-line version

The Country route itself is in good shape: one shared implementation, metadata-driven
configuration, server-side tenant scoping and a real permission gate. The serious defects
are **in the shared framework around it** — three unenforced fail-open controls, a
publication recovery loop that has been silently doing nothing in production, two
collaboration/attachment authorization holes, and a test/CI estate that is red for
reasons that are mostly one-line fixes.

**No `critical` finding survived this review.** The earlier report's single critical claim
(cross-tenant publication rollback) reproduces only in part and is recorded here as
**high**, with a corrected mechanism and a corrected fix (§2.8); the independent
publication auditor reached the same calibration. The most consequential issues are
nevertheless security-relevant: an unenforced field-authorization control (§2.1) and two
attachment authorization/availability defects (§2.9, §2.10).

### Top risks, ranked (severity reflects the post-verification value)

| # | Sev | Risk | Where | Verified |
| --- | --- | --- | --- | --- |
| 1 | **high** | The **published entity authorization profile is never enforced at request time** — the only implementation of `enforcedEntityProfile` is unreachable, so field policies, masking, ownership, per-row and directory authorization all silently degrade to allow | `entity-backend-authorizer.ts:150`, `:442-446`; zero suppliers of `entityBackends` | ✔ mine |
| 2 | **high** | Country's **attachments cannot be downloaded, previewed, extracted or searched on mesh and studio** — the record-attachment operations are allowlisted only on neon | `bff-relay/src/index.ts` `COMMON_PLANE_RELAY_OPERATIONS` | ✔ adv |
| 3 | **high** | Download of `content.item` / `atlas.prompt` attachments **bypasses the owner ACL** — the owning item id is never passed to an authorizer | `attachments` service | ✔ adv |
| 4 | **high** | **Stalled-publication recovery is inert**: with no tenant coordinate, `publication.release` RLS hides every candidate and the job reports `{"recovered": 0}` as success. Reproduced live: 5,173 successful runs, all zero | `kysely-authority-repository.ts:146-156` | ✔ adv (live DB) |
| 5 | **high** | **Deterministic SQL rejections are classified `transient`**, so a deployment is never marked `failed`, the publication dead-letter list and replay route never see it, and the raw SQLSTATE becomes the failure code | `publication-orchestrator.ts:221-243` | ✔ adv (executed) |
| 6 | **high** | Platform **verification endpoints authenticate but never authorize** — the snapshot and the privileged synthetic run are reachable by any authenticated principal | `shared/verification.ts:64-140` | ✔ mine |
| 7 | **high** | **18 test files import modules that do not exist on disk**; `test:foundation` and `test:workspace` cannot collect | see §2.6 | ✔ adv |
| 8 | **high** | Cross-tenant **rollback** route: no resource or tenant scope at any layer, and for a shared-reference publication the affected head is **global** | `publication-routes.ts:121-133` | ✔ mine ✔ adv |
| 9 | **high** | `pnpm format:changed:check` is red and there is **no Prettier config**; **no ESLint config or dependency exists anywhere**, so `lint` is only `tsc --noEmit` — and `pnpm lint` is additionally blocked by the broken `policy:i18n` gate | §4.1 | ○ reported |
| 10 | **medium** | `?search=%` returns the entire permitted set — `searchCondition` does not escape LIKE metacharacters while `filterCondition` does | `kysely-record-repository.ts:167-169` | ✔ mine |
| 11 | **medium** | Four authoring test suites cannot collect; the package `test` script and CI are red | §2.6 | ✔ adv |
| 12 | **medium** | `createEntityMetadataHooks` has **zero importers**, so metadata-declared `requiredCoordinates` and reference domains are never enforced | `metadata-validation.ts:17` | ✔ mine |
| 13 | **medium** | Authoring route errors are never mapped — client input errors and policy denials surface as HTTP 500 | §2.3 | ✔ adv (downgraded from high) |
| 14 | **medium** | Attachments: version history exposes other users' pending/quarantined/failed uploads; presigned upload URL is unbounded so `maxFileBytes` and quota can be bypassed | `attachments` service | ○ reported |
| 15 | **medium** | Comment visibility **silently falls back to `public`** when capability admission returns nothing | `collaboration` service | ○ reported |
| 16 | **medium** | Page reload / deep link on page ≥ 2 leaves "Previous" permanently disabled, and shared links are one-way | `list-view/src/index.tsx` | ○ reported |
| 17 | **medium** | Cross-page selection: the bar counts `selectedIds` but every bulk action uses only the current page's rows, so actions silently no-op | `list-view/src/index.tsx` | ○ reported |
| 18 | **medium** | An **unknown record is a retry dead end** instead of a not-found; raw server problem text is rendered to the user | `form-detail` | ✔ adv (downgraded) |
| 19 | **medium** | `business_partner` is baked into shared contract code, so onboarding any other entity throws | `related-presentation.ts:543` | ✔ adv (downgraded from high) |
| 20 | **medium** | The **theme-token gate reads generated build output** (`.next-bp-consolidated`), reporting phantom findings for tokens that exist nowhere in source | `verify-theme-token-integrity.mjs:20-27` | ✔ adv (downgraded) |

### The gates, measured today

I ran these myself. Note that `policy:i18n`, `policy:frontend-spine` and
`policy:style-tokens:strict` are red in a way that no source change can fix without
touching the gate itself.

| Gate | Status | Cause |
| --- | --- | --- |
| `policy:design-system` | **green** | passes the ratchet at 144 known violations, none new |
| `policy:i18n` | **RED** | asserts DDL columns (`fallback_locale_code`, `enabled_locale_codes`) that do not exist; the schema uses `is_fallback boolean`. **`pnpm lint` = `policy:i18n && turbo lint`, so `pnpm lint` is blocked** |
| `policy:frontend-spine` | **RED** | 4 stale manifest entries for deleted packages, plus budgets: `shell/shell` 12 > 8, `app-foundation` 11 > 10 |
| `policy:theme-token-integrity` | **RED** | 11 findings — 8 genuine source findings plus **3 phantom findings from gitignored build output** under `apps/studio/.next-bp-consolidated/` (all 3 are warnings, so the default gate still exits 0; `:strict` fails on the 8 source findings) |
| `policy:style-tokens:strict` | **RED** | new raw typography in 2 files (`foundation/ui/src/styles.css` 45→56, `shell/shell/src/styles.css` 25→27) |
| `format:changed --check` | **RED** | no Prettier config exists |
| `test:plane-contracts` | **RED** | 13 in-tree failures (21 at pristine HEAD) |
| `test:reachability` | **RED** | 16 root-owned test files under `tooling/scripts/local-dev/` that the gate forbids there (it is the **first** command in `test:root`, so it blocks the Country browser gate behind it) |
| `turbo test` / `pnpm test` | **RED** | 18 unresolvable test imports (§2.6) |

---

## 2. Dimension 1 — Bug fixes

Detail: [frontend-list](review-fresh/frontend-list.md) (19), [frontend-detail](review-fresh/frontend-detail.md) (19),
[server-records](review-fresh/server-records.md) (8), [publication](review-fresh/publication.md) (7),
[metadata-experience](review-fresh/metadata-experience.md) (10),
[collaboration-attachments](review-fresh/collaboration-attachments.md) (11),
[host-composition](review-fresh/host-composition.md) (14), [authoring](review-fresh/authoring.md) (11).

### 2.1 The published authorization profile is never enforced ✔ mine — **high**

**This is the most important finding in the review.**

`server/packages/services/records/src/entity-backend-authorizer.ts:150`:

```ts
// Existing bounded shadow observers own advisory comparison. This execution
// boundary does not replay legacy calls or preflight while shadow is selected.
if (rollout.mode !== "enforce") return options.authority;
```

`enforcedEntityProfile` is defined **only** on the far side of that early return
(`:159-162`), and every profile-based check in the service is gated on it
(`:442-446`):

```ts
const expected = authorizer.enforcedEntityProfile?.(context.planeKey, descriptor.entityCode);
if (!expected) return false;
```

I grepped the whole repository for the two inputs that would construct the enforcing
authorizer. Both are declared at `register-services.ts:374` / `:394` and consumed at
`:550-566`, and **have no supplier anywhere** in `server/`, `apps/`, `packages/` or
`tools/`. The base authority is a plain permission authorizer
(`shared/identity/authority.ts:102`) with no `enforcedEntityProfile`.

**Consequence.** The framework publishes, signs *and qualifies* a complete authorization
profile (`descriptor.authorization` + `descriptor.authorizationRuntime`) and even requires
it to be present — but the runtime never installs the component that reads it. Field
policies, masked representations, deferred/discovery/reveal operations, ownership
resolvers, parent-read requirements and per-row authorization can all be silently
violated with no error at publication or at request time.

**Why Country still looks fine.** Country's profile is a single permission plus one plain
field policy over every field (all `dataClassification: "public"`,
`writeMode: "read_only"`), and the read is still gated by the operation map
(`common.platform.reference.view`, via `entity-list-service.ts:743-755`). So nothing is
wrongly revealed *today*. The defect bites the moment an entity is onboarded with
`"readPolicy": "masked_only"` — which already exists as a review artifact in
`metadata/products/mdg/entities/business_partner_tax_registration/core.json:119-124`.

**Fix — and a trap to avoid.** The verifier established that restoring the profile
authorizer alone is **not sufficient**, and this changes the fix: `entity-backend-authorizer.ts:62`
(`return !profile`) explains why every field is *admitted*, but not why masking is absent.
`readableRecordFields` never reads `policy.representation` even when the profile *is*
defined, and the only code that turns `representation === "masked"` into `"••••"` —
`projectEntityFields` (`entity-authorization.ts:274-305`) — has **zero production
callers**. So the correct fix is two-part:

1. install the profile authorizer (or **fail publication/startup** when a descriptor
   publishes `authorizationRuntime` on a plane with no backend authorizer installed);
2. wire a masked/reveal projection path, or masked fields will merely become *admitted*
   rather than *masked*.

**Latency, not a live leak.** The verifier could not prove any served route currently
returns a masked column: the masked entities that exist in-repo
(`business_partner_identifier/core.json:70-84` `identifier_value` `readPolicy: masked_only`,
`business_partner_tax_registration/core.json:119` `registration_number`,
`business_partner_banking` protected `account_id`) are bound through registered section
handlers that project to `maskedValue`. The defect is **class-level and latent**: it
materialises the moment such an entity is onboarded to a generic entity route — which is
precisely what this framework exists to do.

### 2.2 Unenforced and dead controls in the metadata path ✔ mine — **medium**

`server/apps/platform-host/src/composition/shared/entity-runtime/metadata-validation.ts:17`
defines `createEntityMetadataHooks`, which would enforce metadata-declared
`requiredCoordinates` and reference-domain membership. A repository-wide grep returns
**only the definition** (the method names `validateContext`/`validateReferences` are also
defined by unrelated modules, but nothing calls these ones). So a declared
`requiredCoordinates` requirement is documentation, not a control.

The same pattern appears twice more: `entity-governance/authorization-registration.ts:12`
(`createEntityAuthorizationRegistrations`) has zero importers, while the parallel
`entity-runtime/read-registrations.ts:10` (`createEntityReadRegistrations`) *is* wired at
`register-services.ts:706`. Two competing builders, one of them dead.

### 2.3 Authoring route errors become HTTP 500 ✔ adv (downgraded high → medium)

Every route error in the authoring plane is forwarded without classification, so client
input errors, policy denials and genuine server faults are indistinguishable — and a
cross-tenant denial on `assertTenant` returns **500, not 403**.
Location: [authoring](review-fresh/authoring.md) F1/F2. The adversarial verifier confirmed
the mechanism and the reachability on the Country route but judged the *impact*
overstated: it is a diagnosability/API-contract defect, not a security bypass, because the
denial still happens. Correct severity **medium**.

### 2.4 Publication: the recovery loop does nothing, and failures are misclassified ✔ adv — **high**

Two independent, reproduced defects:

- **Recovery is inert.** `kysely-authority-repository.ts:146-156` joins
  `publication.release`, which is `FORCE ROW LEVEL SECURITY` with only a
  `tenant_id = shared.current_tenant_id_soft()` policy. The scheduled
  `RECOVER_STALLED_PUBLICATIONS_JOB` runs with `scope: "plane"` and no tenant, so the GUC
  is unset, `current_tenant_id_soft()` is NULL, and the join returns zero rows — while the
  handler reports success. The verifier reproduced this **against the live dev database**:
  5,173 `publication.recover-stalled` executions, all `succeeded`, all
  `{"recovered": 0}`; two deployments sat in the recoverable set for ~8.5 minutes and were
  only activated by an external re-drive.
- **Permanent failures are classified transient.** `publication-orchestrator.ts:221-243`
  falls through to `transient` for anything not in a hardcoded set, and `errorCode()`
  (`:304-311`) reads only `error.code` — which the `pg` driver sets to the raw SQLSTATE
  (`23514`, `55000`, `23505`), not the stable token in the `RAISE` message. The only
  failure transition is gated on `category === "permanent"` (`:196-203`), so the
  deployment is never marked `failed`; and since the dead-letter query requires
  `d.status='failed'`, the DLQ list and replay route are permanently empty. The verifier
  executed the real orchestrator to confirm no `failed` transition is ever issued.

### 2.5 Verification endpoints are authenticated but not authorized ✔ mine — **high**

`server/apps/platform-host/src/composition/shared/verification.ts` declares both contracts
with `authenticated: true` and **no permission or resource** (`:64-100`), then registers
both with nothing but the authentication middleware (`:113-140`):

```ts
const authenticate = createIamAuthenticationMiddleware(iam);
...
registerContractRoute(application, snapshotContract, authenticate, async (_request, response, next) => {
  const context = readVerifiedRequestContext(response);
  await executeVerification(container, config, context, "quick");
```

`GET /api/platform/verification` returns a platform snapshot; `POST
/api/platform/verification/runs` runs bounded synthetic verification (i.e. privileged
probes). Any authenticated principal can invoke both; the only brake is per-principal
rate limiting. Add an explicit permission code to both contracts and enforce it.

### 2.6 18 test files import modules that do not exist ✔ adv — **high**

Whole-tree import resolution found 18 unresolvable specifiers, which break collection for
the `test:foundation` and `server/db` `test:workspace` suites. I confirmed three of them
directly:

- `server/packages/planes/studio/meta-entity-authoring/src/__tests__/intake-presentation.test.ts:3`
  imports `../intake-presentation.js` — no such file exists in `src/`.
- `.../configuration-editor-qualification.test.ts:2-3` and
  `.../structural-editor-qualification.test.ts:2-3` import
  `packages/planes/studio/business-partner/src/...` — that directory now contains
  **only `node_modules`**.

The remaining 15 are catalogued in [test-health](review-fresh/test-health.md) §F1 with the
resolved target checked for each. Fixing this decides whether the tests or the
implementations should come back — deleting them silently removes the only coverage for
the intake-presentation overlay and interactive structural/configuration editing.

**Reconciling a number that looks contradictory.** The
[standards](review-fresh/standards-naming-reuse.md) sweep reports "exactly 5 unresolved
specifiers across 518 test files" while [test-health](review-fresh/test-health.md) reports
18 files. These are not in conflict: the standards sweep is scoped to `packages/**`,
`apps/**` and `server/packages/**`, and the largest cluster (6 files under
`server/db/scripts/__tests__/provisioning/`) sits in `server/db/**`, outside it. 5 + the
out-of-scope cluster ≈ 18. I flag it because two appendices quoting different numbers for
the same symptom is exactly how a review loses trust.

### 2.7 Search does not escape LIKE metacharacters ✔ mine — **medium**

`server/packages/services/records/src/kysely-record-repository.ts:168`:

```ts
function searchCondition(descriptor, search) {
  return sql`(${sql.join(fields.map((field) => sql`${sql.ref(field.storagePath)}::text ILIKE ${`%${search}%`}`), sql` OR `)})`;
}
```

Compare the immediately preceding line, which does it correctly:

```ts
case "contains": return sql`${ref}::text ILIKE ${`%${escapeLike(String(filter.value ?? ""))}%`} ESCAPE '\\'`;
```

The parameter is bound (no SQL injection), but `%` and `_` remain wildcards, so
`?search=%` returns the entire permitted set and there is no `ESCAPE` clause. `escapeLike`
already exists at `:169` — the fix is three characters.

### 2.8 Cross-tenant rollback: no resource or tenant scope at any layer ✔ mine ✔ adv — **high**

`publication-routes.ts:121-133` authorizes with a bare permission code and takes
`publicationKey` straight from the URL path:

```ts
const context = await requirePermission(options, response, "publication.release.rollback");
...
const publicationKey = String(request.params["key"]);
```

`fn_rollback_release` (`server/db/ddl/common/runtime_meta/07_functions.sql:439-455`)
matches on `publication_key` and `id` only. **I verified the surrounding layer myself and
this materially changes the fix:**

- `runtime_meta.release_activation_head` and `applied_release` have **no `tenant_id`
  column at all** — `release_activation_head`'s primary key *is* `publication_key` — while
  sibling tables in the same schema (`entity_contract`, `entity_descriptor`) do carry one.
- `FORCE ROW LEVEL SECURITY` **is** enabled on both tables
  (`runtime_meta/10_rls.sql:44-49`), but their only policies are `USING(true)` for the seed
  owner / `athyper_projection_applier` (`:51-59`). There is **no tenant-scoped policy**, and
  the executing role is deliberately unscoped.
- The runtime role `athyperapp` **cannot execute** `fn_rollback_release` at all
  (`11_grants.sql`); only `athyper_projection_applier` and `athyperadmin` can.

So the earlier report's proposed fix — "add `tenant_id` to `fn_rollback_release`" — is not
implementable as written: there is no column to compare. The correct fix is to bind the
key to the caller's tenant **before enqueueing** (validate ownership on the control-plane
`publication.release`, which *does* have `tenant_id`), carry `tenantId` in the job payload,
declare the job `scope: "tenant"`, and add the tenant predicate in SQL by joining
`applied_release`. Independently, the publication auditor reached **medium** rather than
critical, because the exploit requires both the `publication.release.rollback` permission
and knowledge of the victim tenant's derived key — I agree with that calibration.

### 2.9 Country attachments are broken on two of three planes ✔ adv — **high**

The record-attachment download/preview/extract/search operations are registered in the
neon allowlist but are **absent from `COMMON_PLANE_RELAY_OPERATIONS`**, so on mesh and
studio they are not allowlisted and 404. The verifier reproduced this by instantiating the
real app relay factories. The gateway-relay auditor found the same defect independently —
convergent evidence from two agents that did not share context. This is a one-place fix in
`packages/platform/gateway/bff-relay/src/index.ts`.

### 2.10 Attachment downloads bypass the owner ACL ✔ adv — **high**

For `content.item` and `atlas.prompt` attachments the owning item id is never passed to an
authorizer, so a download by attachment id succeeds without an owner check. The verifier
reproduced it against the real `attachment-routes.ts` and real
`createEntityAttachmentAdmission`, and checked for a record-scope guard one layer away.

### 2.11 Corrections to the earlier report — refuted and already-resolved items

Two claims in the 2026-09-29 report do **not** hold against the current tree. Both are
recorded here so the older report is not acted on blindly.

**REFUTED — "8 of 17 relative-date filter options always answer HTTP 400."** I traced all
five places:

| Layer | Location | Count |
| --- | --- | --- |
| Canonical contract | `contracts/platform/entity-list/src/types.ts:52-70` | 17 |
| Route validation | `records-routes.ts:54,93` (built **from** the contract set) | 17 |
| Kysely repository | `kysely-record-repository.ts:170` | 17 |
| In-memory repository | `in-memory-record-repository.ts:114-123` | 17 (11 map + 6 branches) |
| Filter editor | `collection-controls/src/filter-editor.tsx:199-234` | 17 |

They agree. The route accepts all 17 and both repositories implement all 17. The claim is
untrue at this revision.

**DOWNGRADED — "critical: cross-tenant rollback."** Still real (§2.8), but the honest
severity is **high/medium**: it needs a privileged permission plus a derivable key, and
the tables it touches have no tenant column, which changes the fix.

### 2.12 Real defect hiding behind the refuted claim: relative dates are defined in five places

The 17 relative-date values are **triplicated as literals** and duplicated twice more as
implementations:

1. `packages/contracts/platform/entity-list/src/types.ts:52-70` — canonical.
2. `packages/platform/entity/runtime/collection-controls/src/filter-editor.tsx:199-234` —
   `RELATIVE_DATE_GROUPS`, hardcoded value + **English label** pairs.
3. `packages/contracts/platform/collection/src/index.ts:238-256` — an inline literal array
   in a validator, in a **different order** (`tomorrow` is 7th here, 3rd in the canonical
   list), which is the signature of independent hand-maintenance.

Adding one relative-date value requires five coordinated edits across three packages.
Derive the editor options and both validators from `ENTITY_LIST_RELATIVE_DATE_VALUES`.

### 2.13 Other verified defects worth fixing

| Sev | Defect | Where |
| --- | --- | --- |
| medium | Page reload / deep link on page ≥ 2 leaves **Previous** permanently disabled; `cursorHistory` is memory-only while `pageIndex` is in the URL | [frontend-list](review-fresh/frontend-list.md) F4 |
| medium | Cross-page selection: `selectedIds` is a cross-page union and the bar advertises its full size, but every row-acting control consumes only the current page's `selectedRows`. **Corrected by the verifier:** the "silent no-op click" variant is *refuted* (the Favourites items are hidden entirely when the current page contributes no selection); what is real is user-visible **misreporting** — bar "4 selected", action "1 record added to favourites" — plus a subtitle that falsely claims "N records on this page selected" | [frontend-list](review-fresh/frontend-list.md) F1 ✔ adv |
| medium\* | **Conditional, not confirmed for Country:** exporting with scope `selected` from a cross-page selection can omit `recordIds` and fall back to the **whole authorized result set**. Security-relevant if reachable; Country defines no export permission, so it resolves hidden today. Worth a guard regardless | [frontend-list](review-fresh/frontend-list.md) F1 (adjacent variant) ✔ adv |
| medium | An unknown record renders a **retry dead end** rather than not-found; raw server problem text is shown to the user | [frontend-detail](review-fresh/frontend-detail.md) F4/F6 |
| medium | Comment visibility silently falls back to `public` when capability admission returns nothing | [collaboration-attachments](review-fresh/collaboration-attachments.md) F5 |
| medium | Attachment version history exposes other users' pending/quarantined/failed uploads | [collaboration-attachments](review-fresh/collaboration-attachments.md) F3 |
| medium | Presigned upload URL is unbounded → `maxFileBytes` and quota bypassable | [collaboration-attachments](review-fresh/collaboration-attachments.md) F4 |
| medium | Rollback of any release carrying operation bindings **always raises**, with an opaque SQLSTATE and no DLQ row | [publication](review-fresh/publication.md) F4 |
| medium | The authority-side recovery/acknowledge path is unregistered and **swallows an activation-approval denial as an empty success** | [publication](review-fresh/publication.md) F5 |
| medium | `countMode` metadata is unenforced (`cached`/`approximate` accepted but unimplemented); descriptor advertises a synthetic `record_id` the list route rejects | [server-records](review-fresh/server-records.md) F2/F3 |
| low | Grouped-table keyboard navigation stalls at group headers; hardcoded DOM ids collide with >1 list mounted | [frontend-list](review-fresh/frontend-list.md) F5 |
| low | **In-memory repository diverges from production**: `toStorage` accepts unknown keys (`fields.get(key) ?? key`) where Kysely throws `RECORD_INPUT_FIELD_UNKNOWN` | `in-memory-record-repository.ts:90` vs `kysely-record-repository.ts:190-197` |

### 2.14 Checked and *not* a defect — do not "fix" these

I verified these closures myself; recording them prevents wasted work:

- **No SQL identifier injection.** `kysely-record-repository.ts:166` (`fieldPath`) throws on
  unknown field keys, closing the identifier position for filter, sort, group and cursor
  clauses; `:190-197` (`toStorage`) throws `RECORD_INPUT_FIELD_UNKNOWN` for the write path;
  `:98` (`projection`) validates too. Values are bound, not interpolated.
- **Tenant scoping on the read path is real.** `baseConditions` (`:99`) adds
  `storage.tenantField = ${tenantId}::uuid`, and the record read (`:61`) combines it with
  `id = ${recordId}`.
- **`resolveEntityReadRoute` fails closed** — anything that is not zero/one segment, not a
  canonical entity code, or not a UUID record id resolves to `undefined` → `notFound()`.
- **All three plane entrypoints are byte-identical** (md5 `3cb777216d40c0daa284d6b75f6828fc`).

---

## 3. Dimension 2 — Improvements

Most previously identified low-effort correctness gaps have been remediated and have
regression coverage. Remaining improvement work is structural: remove or integrate unused
framework surfaces, consolidate duplicate authorization-registration paths, and decompose the
shared list runtime into query-state and leaf UI modules.

The authorization-registration path and unreferenced metadata/intake/context/bootstrap
surfaces have since been consolidated or removed. `RelatedRecord` remains exported for its
tested presentation contract, although it is not currently rendered by production runtime.
List query-input state is now isolated from the list chrome; further leaf-widget extraction
should be scheduled independently because the list runtime remains a high-conflict shared file.

---

## 4. Dimension 3 — Coding standards

Detail: [standards-naming-reuse](review-fresh/standards-naming-reuse.md) (20 findings).

### 4.1 The tooling gates are the biggest standards problem

- **There is no Prettier config** (a `.prettierignore` exists, but no `.prettierrc` or
  `prettier` key in `package.json`), and `format:changed:check` is red. The gate is wired
  into pre-push and CI, so it is a standing red light that trains people to bypass it.
- **There is no ESLint configuration or dependency anywhere in the repository** — I
  confirmed no config file and no `"eslint"` entry in any `package.json`. `lint` is
  effectively `tsc --noEmit`, so every lint-class rule — hook dependencies, floating
  promises, unused exports, accessibility — is unenforced. On top of that,
  `policy:i18n` fails, and `pnpm lint = policy:i18n && turbo lint`, so **`pnpm lint`
  cannot run at all**.

### 4.2 Type-safety and silent-failure hotspots

Real but lower-severity items, each with a citation in the appendix: explicit `any` on the
shared detail surface erasing parsed-contract typing (`Record<string, any>` in
`intake-data.ts:343`, `intake-flow-authoring.ts:2`), a non-null assertion plus a double cast
the type system was about to check, an inconsistent `.js` type-only re-export in the
contracts barrel (`index.ts:62`), and raw `cause.message` rendered to users in
`searchable-select.tsx:233`.

### 4.3 Genuinely clean areas — credit where due

Measured by the [standards](review-fresh/standards-naming-reuse.md) sweep against the
current tree, not inherited from an earlier report:

- **File naming is effectively universal.** Of **2,029** files, the only non-kebab-case
  basenames are three legitimate two-segment suffixes (`fixture.test-helper.ts`,
  `setup.test-helper.ts`, `record-history.postgres-case.ts`).
- **Zero `I`-prefixed types**; **zero** `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`;
  **zero** `TODO` / `FIXME` / `HACK`; **zero** `console.log` outside tests.
- **Handler naming is uniform:** 291 `on[A-Z]…` props and **0** `handle[A-Z]…` props; 375
  `export function create*` and **0** `make*` (the 9 `build*` functions build derived
  request/key/projection values, a genuinely different verb).
- **`"use client"` coverage is complete** — all 50 `packages/platform/entity` files that
  call `useState(`/`useEffect(` carry the directive.
- **Entity CSS is token-disciplined:** across the 6 entity CSS files, **0** hardcoded hex
  colours and **2,141** `var(--…)` references; only 2 inline `style={{}}` in the whole
  entity `.tsx` tree, both injecting a typed CSS custom property rather than a raw value.

This is a well-kept codebase. The problems are concentrated in tooling enforcement
(§4.1) and in a handful of unenforced framework controls, not in day-to-day code hygiene.

---

## 5. Dimension 4 — Standard file and method naming

Detail: [standards-naming-reuse](review-fresh/standards-naming-reuse.md) F16-F20.

- **File naming is effectively universal** — of 2,029 files, the only non-kebab-case
  basenames are three legitimate two-segment suffixes (`fixture.test-helper.ts`,
  `setup.test-helper.ts`, `record-history.postgres-case.ts`), and those three do **not**
  match their packages' vitest include globs, so they are not collected as empty suites.
  There is no systemic file-naming problem.
- **File name / exported symbol mismatch** in the shared read route, and a **stale
  documentation path** left behind by the `entity-read-page.tsx → entity-read-route.tsx`
  and `entity-read-runtime.tsx → entity-read-surface.tsx` renames that are in the current
  working tree.
- **No enforced rule for boolean naming** — the same concept appears as both `primary` and
  `isPrimary`.
- **Three competing test-placement conventions** across server packages (`__tests__/`
  adjacent, `__tests__/` with `.spec.ts`, and root `tests/`), with no rule. This is
  actively harmful: `test:reachability` forbids root-owned test files and is red partly
  because of it.
- **Alias exports hide canonical names** (F11) — several modules re-export the same
  primitive under a second name, which is how `tenantScope()`/`humanize()` ended up
  duplicated per plane while a shared version existed (F10).

---

## 6. Dimension 5 — CSS and the design system

Detail: [css-design-system](review-fresh/css-design-system.md) (23 findings).

### 6.1 Real rendering bugs from unresolved tokens ✔ mine

I confirmed the mechanism by running the gate: it reports tokens that are **referenced with
no definition and no fallback**, which render as nothing (or to the CSS initial value).
Two have concrete contrast consequences on the Country page:

- `var(--a-color-danger,#b42318)` — the hardcoded fallback is used in dark and
  high-contrast themes, where the agent measured it at **3.19:1** against black (below the
  4.5:1 AA threshold for text).
- `var(--a-on-brand,#fff)` — count badges become unreadable in `atlas-mono` dark and
  high-contrast themes (**1.07:1**).
- `--a-surface-muted` resolves to `--a-surface`, producing an invisible badge fill
  (F17); `--a-page-sticky-top` / `--a-record-sticky-top` are referenced in three files
  without a definition.

### 6.2 The gate itself is unsound — but less severely than it first appears ✔ adv

`policy:theme-token-integrity` **walks gitignored build output** under
`apps/studio/.next-bp-consolidated/static/chunks/*.css`. The mechanism is exact:
`IGNORE_DIRS` (`verify-theme-token-integrity.mjs:20-27`) contains `.next` but no `.next-*`
rule, and `stylesheetsBelow()` (`:39-55`) skips a directory only on **exact** name
membership. `.gitignore:48` is `**/.next-*/`, so the repository itself declares that tree
generated. The gate reports a phantom violation — `--a-surface-subtle` has **zero hits in
the entire source tree** — at a meaningless `:1` line.

**The severity is medium, not high**, and the verifier's reasoning matters: all three
artifact findings are *warning*-severity, and `selectFailures` (`:228-232`) keeps only
`error` by default, so **the default gate exits 0**. The `:strict` variant that CI runs
(`static-policy-profiles.json:90`, via `ci.yml:82`) already exits 1 on the **8 source-only**
findings at HEAD, so the generated tree contributes 3 of 11 and is *not* the deciding
cause of any current failure. A fresh CI checkout cannot contain the directory anyway —
the quality job never builds the app before running `policy:static`.

So this is developer-machine tooling noise, not a broken gate: real, worth fixing, and
**not** a reason any pipeline is red. The guard already exists in two sibling gates
(`verify-design-system.mjs:50-59` and `audit-style-tokens.ts:39-49` both implement
`name.startsWith(".next-")`), and `verify-theme-token-integrity.test.mjs:36` pins
`targetRoots` to `["packages/platform","packages/planes"]`, which is why the one test that
should have caught this cannot. **Fix:** reuse the sibling rule and widen the test's
`targetRoots` to include `apps/*`.

Separately, and with more real impact: `policy:foundation-phase1` fails three
design-system checks and cannot pass, and **both violation ratchets are stale** — one is
roughly half phantom.

### 6.3 Structure and bypasses

- The palette lives in **two unsynchronised authorities** (app CSS vs `tokens.ts`).
- Literal colours are hidden from the gate **inside SVG data URIs** (F7).
- Hardcoded spacing/radius/z-index/typography literals bypass the token scale (F11),
  which is exactly what `policy:style-tokens:strict` caught increasing in 2 files.
- Duplicated sticky rules in `record.css` leave dead declarations and a fallback-free
  override (F9).
- **Dead CSS retains pre-rename class names** — 50 verified classes with no producer
  (F10), matching the frontend-list auditor's independent finding of five dead class
  families.
- Unused token vocabulary: the Tailwind token bridge is **exported, budgeted, and never
  imported** (F12).
- Two sort/columns controls are rendered but **unconditionally hidden** (F13).
- One package names its root with another package's prefix (F8).

**What to change, concretely:** make the token authority single-sourced and generate
`tokens.ts` from it; add the `.next-*` exclusion to the theme gate **with a test**; give
every token a defined value or an explicit fallback, then let `:strict` pass legitimately
rather than ratcheting phantoms.

---

## 7. Dimension 6 — Reusable components

Detail: [entity-runtime-support](review-fresh/entity-runtime-support.md) (18 findings),
[frontend-detail](review-fresh/frontend-detail.md).

**Missing shared primitives (bespoke one-offs that should be framework components):**

- **Message-driven primitives.** `SearchableSelectMessages` has no keys for three strings
  `SearchableSelect` renders (`searchable-select.tsx:612-621`), so a "load more"/"loading"
  contract is missing from the component's own message interface.
- **A shared UI message contract.** Accessibility and status labels are literals baked into
  shared chrome — `aria-label="Close panel"`, `aria-label="Notifications"`,
  `Skeleton`/`LoadingDots` defaulting to `"Loading"` (`foundation/ui/src/index.tsx:183-243`)
  — with no way for a consumer to localize them.
- **A locale-aware date picker.** `DatePickerCalendar` ignores the governed locale entirely:
  `new Intl.DateTimeFormat("en", …)` (`date-picker-calendar.tsx:64`, repeated at `:281`,
  `:301`) and `DayPicker` receives neither `locale` nor `weekStartsOn`, so
  `EffectiveLocalization.weekStart` is dropped.
- **A shared company/organization picker message set** (`company-groups.tsx:58-242`).

**Duplicated components that should collapse into one:**

- The three plane experience runtimes are **drifted copies**: mesh and studio
  `experience-runtime.tsx` are both 293 lines and differ only by renamed symbols and plane
  strings (md5 `84ed590a…` vs `e26f0846…`), with neon a third variant
  (`apps/neon/lib/experience-runtime.tsx`). Extract into a plane-parameterised shared
  package and leave each app a ~40-line binding.
- An identical reference-directory message block is **copy-pasted across three packages**
  (standards F9).
- `tenantScope()` and `humanize()` are duplicated per plane while a shared primitive exists
  and is re-exported under a different name (standards F10).
- Three divergent record-id/UUID validators
  (`contracts/.../validation/record-id.ts:4`, `apps/neon/lib/route-params.ts:1-2`,
  `governed-workflow.ts:164-165`) — and they disagree: the alias parser accepts entity
  codes and record segments the canonical route rejects
  (`entity-record-href.ts:7` vs `routes/entity-read-route.ts:12-15`).

---

## 8. Dimension 7 — Generalization and further reuse

### 8.1 Entity-specific vocabulary baked into shared framework code

This is the single biggest generalization blocker, and it appears in four independent
places:

1. **`related-presentation.ts:543`** ✔ adv — `if (profiles.length && entityCode !== "business_partner") throw …`,
   plus `business_partner.external_reference` / `.contact_person` / `.address_link` at
   `:77/:88/:109`, a closed source enum at `:210-214` and section keys pinned at `:217-218`.
   Any other owner entity throws. *Severity corrected from high to medium by the verifier*,
   because the trigger is not reachable from Country's own metadata
   (`parseSharedReferenceProduct` rejects a `related` key first) and the browser never
   receives `related` anyway (`record-presentation.ts:291` nulls it). The hardcoding is
   real; the claimed blast radius was not.
2. **`kysely-record-repository.ts:113,130,145,155-157`** — the shared records repository
   hardcodes `business_partner.${idField}`, `business_partner` list-scope assignment and
   `network_relationship.buyer_tenant_id`/`supplier_tenant_id` predicates.
3. **The export-privacy control is hardcoded to one entity and fails open for all others**,
   while a generic `classification` mechanism sits unused (standards F5).
4. **The shared authoring repository hardcodes one entity code**, so release inspection
   cannot serve Country or any other entity (authoring F6); the shared document-collection
   publisher has further entity/plane hardcodes (authoring F8).

### 8.2 Hand-written catalogues that should be generated from metadata

`apps/neon/lib/catalog-routes.ts:8` is a hand-written `entityRoutes` map with hardcoded
English names and two `business_partner` literals, while the shared generator emits
`entities: []`. Regenerate code, `routeSlug`, label keys and `defaultEntityCode` from
published metadata and delete the app-level overlays.

### 8.3 `country_code` as a magic string

`searchHint` ranks search fields by **regex-matching localized label text** and by a
hardcoded `country_code` role — contradicting the rule the adjacent new module just
documented (standards F7). Rank by declared metadata role, not by English substrings.

### 8.4 Semantic/formatting divergence

The entity runtime contains ~15 direct `Intl.*` constructors that bypass the shared
`IntlRuntime`, so **the same Country record formats differently in the list and in the
detail** (standards F8), and `list-view` uses locale-less `Intl` in the very view that
formats the same number with the app locale (frontend-list F10).

### 8.5 Localization of the shared framework

The shared list surface is only partially localized: **49 hardcoded English strings in
`list-view/src/index.tsx`**, and `drawer-registry.tsx` is **100 % English**
(standards F6). The error taxonomy returns fully-formed English sentences rather than
message ids (`error-taxonomy.ts:51+`), intake validation returns literal English while its
own module mandates message keys (`intake-surface.ts:517`), and session-expiry warnings are
hardcoded in the shell (`app-foundation/src/index.tsx:257`).

**Ranked generalization wins (value ÷ risk):** (1) a registration-driven owner/relationship
registry to replace the `business_partner` literals; (2) the single relative-date source
(§2.12); (3) message-id-based error taxonomy + shared UI message contract; (4) generate the
plane catalogues from metadata; (5) extract the duplicated plane experience runtime —
**last**, because it spans three apps and `list-view/src/index.tsx` is under concurrent
edit.

---

## 9. What is genuinely healthy — do not churn

- **The Country URL really is one shared implementation.** All three
  `apps/*/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx` are byte-identical
  4-liners delegating to `createEntityReadPage` (md5 `3cb777216d40c0daa284d6b75f6828fc`).
  The AGENTS.md rule is honoured at the entry point.
- **Country configuration lives in metadata, not code** —
  `metadata/products/shared/entities/country/{definition,capabilities,activity}.json`
  (568 lines) drives the runtime.
- **Route resolution is strict and fails closed**, shared by the browser route and the
  server adapter.
- **Server-side authorization and tenant scoping are real on the read path** — verified
  by me at `kysely-record-repository.ts:61,99`.
- **The signed descriptor's security fields cannot be authored around.** The publication
  auditor verified that `lower()` recomputes the projection from the persisted approved
  graph and `qualifyRuntimePublication` re-derives it with hash equality at compile, sign
  *and* dispatch, and that `authorizationMode` is hard-coded `bound_operation` by the
  trusted compiler. Authored input **cannot** inject `permissions`, `scopes` or
  `requiresPreflight`. **Note the nuance** versus the earlier report, which claimed the
  opposite: the framework *does* let some author-controlled strings reach the descriptor —
  `apiExposure`, `writeMode`, `readHandlerKey`, `writeHandlerKey` are never reconciled
  against the immutable platform class profile ([authoring](review-fresh/authoring.md) F7,
  medium). So the correct statement is narrower than either report made it: the
  *authorization* fields are protected; a neighbouring set of runtime-binding strings is
  not.
- **On the live tenant-scoped apply path**, all publication statements for a database are
  in one transaction, so bindings, applied release, payload, verification and activation
  head commit or roll back together.
- **Cross-plane projection writes are blocked** in SQL, and runtime descriptor reads are
  tenant-predicated with no fallback from compiled planes to native rows.
- **Test doubles aside** (`in-memory` divergence, §2.13), the browser transport hardening is
  sound: absolute URLs rejected, sensitive headers refused, `Idempotency-Key` enforced for
  declared mutations, CSRF required for unsafe methods, requests constrained to `/api/relay`.
- `cascade`, `content-ui` and `workflow-ui` are **governed reserved placeholders**
  (`export {};`, recorded in `entity-placeholder-packages.json`) — intentional.

---

## 10. Where the detail lives

20 appendices, 12,300+ lines, each with severity tags, exact citations, quoted code and a
"checked but not a defect" section. The adversarial verdicts are appended to the
`*-verification.md` files, including the cross-area [closeout-verification.md](review-fresh/closeout-verification.md).

| Area | Report | Findings |
| --- | --- | ---: |
| Frontend list runtime + list contracts | [frontend-list.md](review-fresh/frontend-list.md) | 19 |
| Frontend detail / form runtime | [frontend-detail.md](review-fresh/frontend-detail.md) + [verification](review-fresh/frontend-detail-verification.md) | 19 |
| Entity-runtime contracts + foundation UI | [entity-runtime-support.md](review-fresh/entity-runtime-support.md) + [verification](review-fresh/entity-runtime-support-verification.md) | 18 |
| BFF relay gateway | [gateway-relay.md](review-fresh/gateway-relay.md) + [verification](review-fresh/gateway-relay-verification.md) | 10 |
| Server record read chain | [server-records.md](review-fresh/server-records.md) | 8 |
| Publication + compilation | [publication.md](review-fresh/publication.md) + [verification](review-fresh/publication-verification.md) | 7 |
| Metadata resolution + experience | [metadata-experience.md](review-fresh/metadata-experience.md) | 10 |
| Studio meta-entity authoring | [authoring.md](review-fresh/authoring.md) + [verification](review-fresh/authoring-verification.md) | 11 |
| Collaboration + attachments | [collaboration-attachments.md](review-fresh/collaboration-attachments.md) + [verification](review-fresh/collaboration-attachments-verification.md) | 11 |
| Host composition + DDL | [host-composition.md](review-fresh/host-composition.md) | 14 |
| CSS + design system | [css-design-system.md](review-fresh/css-design-system.md) | 23 |
| Standards, naming, reuse | [standards-naming-reuse.md](review-fresh/standards-naming-reuse.md) | 20 |
| Test health + CI gates | [test-health.md](review-fresh/test-health.md) + [verification](review-fresh/test-health-verification.md) | 17 |

---

## 11. Suggested order of work

Ordered by impact ÷ effort. Steps 1–2 are hours, not days.

1. **Un-break CI.** Repoint the 18 unresolvable test imports (§2.6 decision: restore or
   delete **and** confirm coverage elsewhere), fix the stale `frontend-spine-packages.json`,
   repair the `policy:i18n` DDL assertion (it reads a schema that does not exist, which
   currently blocks `pnpm lint`), reuse the sibling `.next-*` rule in the theme gate and
   widen that gate's test `targetRoots` to `apps/*`, and commit a Prettier config. Also
   decide whether to add ESLint at all — the repository currently has none. Note that the
   theme-gate scan is **not** why any pipeline is red today (§6.2), so it is a tidy-up, not
   a blocker.
2. **Close the fail-open holes** (highest security value per line): wire or fail-close the
   authorization-profile enforcement (§2.1); add a permission code to the verification
   endpoints (§2.5); move the record-attachment operations into
   `COMMON_PLANE_RELAY_OPERATIONS` (§2.9); record-scope the `content.item`/`atlas.prompt`
   download (§2.10); bind the rollback key to the caller's tenant before enqueueing (§2.8);
   wire or delete `createEntityMetadataHooks` (§2.2).
3. **Fix the publication loop** (§2.4) — give recovery a tenant coordinate and classify
   SQLSTATE-plus-token rather than bare SQLSTATE. This one has live production evidence
   behind it.
4. **Fix the user-visible list/detail bugs** — search escaping (§2.7), Previous after
   reload, cross-page selection, unknown-record dead end — each with a regression test,
   since a single assertion would have caught every one.
5. **Make the CSS gates honest** — define or fallback every unresolved token (§6.1), then
   clear the style-token ratchet.
6. **Then generalize** — §8.5 order. Do the list-view leaf extraction **only after
   coordinating**, because that file was rewritten under concurrency during both this
   review and the previous one.
