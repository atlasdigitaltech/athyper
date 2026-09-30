# Adversarial verification — "Cross-tenant denial in assertTenant surfaces as 500 instead of 403"

Area: Studio meta-entity authoring plane.
Mode: read-only. No source file was modified.

## Verdict

**PARTIAL** — the defect is real and reproducible on the shipped host, but the claimed
severity (`high`) is overstated, and the stated example ("tenant-A change-set id")
triggers a *different* unmapped error than the one cited. The end consequence the
finding describes (500 `INTERNAL_ERROR` instead of 403 on a cross-tenant probe) is
correct.

Corrected severity: **medium** (fail-closed; no data exposure and no authorization
bypass; wrong status class + 5xx metric/alert noise + opaque UX).

## 1. The citation is exact

`server/packages/planes/studio/meta-entity-authoring/src/authoring-service.ts:36-50`
matches the quoted code verbatim, including the `FORBIDDEN` throw:

```ts
36  async assertTenant(
37    changeSetId: string,
38    tenantId: string,
39    allowPlatform = false,
40  ) {
41    const current = await this.required(changeSetId);
42    if (
43      current.tenantId !== tenantId &&
44      !(allowPlatform && current.tenantId === null)
45    )
46      throw new AuthoringPolicyError(
47        "FORBIDDEN",
48        "The tenant change set is unavailable",
49      );
50  }
```

`routes.ts:350-362` is also exact: `scoped()` resolves
`studio.platform.catalog.manage` and then calls `service.assertTenant(id, c.tenantId, platform)`.

## 2. The handler mapping gap is real

`routes.ts:285-299` translates only two shapes to HTTP status:

- `AuthoringPolicyError` with `code === "RESTORATION_PUBLICATION_ALREADY_EXISTS"` → 409
- `AuthoringConflictError` → 409

Everything else goes to `n(error)` (`routes.ts:296`).

`AuthoringPolicyError` is a plain `Error` subclass with no `statusCode`/`type`
(`server/packages/contracts/meta-entity-authoring/src/ports.ts:16-23`). The runtime error
middleware (`server/packages/runtime/http/src/http-runtime.ts:219-244`) only recognises
JSON-parse / body-size / media-type errors and `HttpError`; anything else becomes
`HttpError(500, "INTERNAL_ERROR", ...)` at `http-runtime.ts:241-242`. The 5xx counter is
real and armed: `http-runtime.ts:154` defines `athyper_http_errors_total` and line 160
increments it for `statusCode >= 500`; the host passes `metrics` when the process-metrics
adapter exists (`server/apps/platform-host/src/composition/runtimes/http.ts:68-70`).

There is no host-level mapper: a repo-wide grep for `AuthoringPolicyError` in
`server/apps`, `server/packages/runtime` and `server/packages/foundation` returns nothing.
So the 500 is genuine.

The sibling route modules prove the intended behaviour and the inconsistency: both
`collection-authoring-routes.ts:37-46` and `notification-authoring-routes.ts:58-64` map
`AuthoringPolicyError` with `code === "FORBIDDEN"` to 403. The main `handler()` does not.

## 3. Reachability on the shipped Country route — confirmed

`scoped()` is called on `GET /change-sets/:id/graph` (`routes.ts:99`), both history GETs
(`routes.ts:44,49`), `POST /releases/:id/rollback` (`routes.ts:215`) and every `action()`
route (`routes.ts:248`: fork/validate/test/submit/approve/publish).

For the non-gated permission codes (`metadata.entity.author`, `metadata.entity.validate`,
`metadata.entity.test`, `metadata.entity.submit`, `metadata.entity.rollback`) the
composed authorizer delegates to the fallback permission authorizer
(`server/apps/platform-host/src/composition/shared/entity-governance/meta-entity-authoring-authorizer.ts:5,17`);
the policy gate that reads the row's tenant only runs for the gated set
(`metadata.entity.review|publish|activate`). And the route always injects the caller's own
tenant into the resource (`routes.ts:272`: `resource: { ...resource, tenantId: c.tenantId }`),
so the permission authorizer's tenant-boundary check
(`permission-authorizer.ts:50-55`) compares the caller's tenant with itself and cannot
reject. A tenant-B Studio principal holding `metadata.entity.author` therefore passes
`allowed()` and reaches `scoped()` → `assertTenant()`.

The exact `FORBIDDEN` branch is reachable for **`tenant_id IS NULL` platform change sets**:
the RLS read policy on `metadata.entity_change_set` exposes `tenant_id IS NULL` rows to every
tenant (`server/db/ddl/planes/studio/metadata/10_rls.sql:23-31`), and the shared-entity seed
inserts `tenant_id = NULL` change sets
(`server/db/seed-backup/meta-entity/100_entity_examples/000_seed_graph_helpers.sql:325-335`).
That is precisely the shared/platform metadata behind the Country route
(`metadata/products/shared/entities/country/definition.json`). A tenant-B author without
`studio.platform.catalog.manage` gets `assertTenant` → `FORBIDDEN` → 500.

The defect ships undetected because every route test installs its own error middleware:
`__tests__/graph-editor-routes.test.ts:34-35` maps `FORBIDDEN` → 403 and then asserts 403 at
lines 51-54 for `tenant-b`; `__tests__/learning-route-scope.test.ts:12` does the same. No
authoring test uses `createHttpApplication`, so the real 500 is never exercised. This
corroborates the finding's proposed test fix.

## 4. What is wrong with the claim

### 4a. Severity is inflated (high → medium)

The finding concedes, correctly, that the decision is fail-closed and that gated
review/publish/activate are independently protected. There is no data exposure, no
authorization bypass, and no state change — `assertTenant` runs before `replaceGraph`,
`transition`, `rollback`, etc. The input requires an authenticated Studio principal who
already holds a valid authoring permission in *their own* tenant, plus an id from another
tenant/platform — i.e. an authorized internal user making a mistaken or probing request,
not an unauthenticated attacker. The remaining harm is a wrong status class, an opaque
"An unexpected error occurred" message, and 5xx counter/alert/retry noise on a denial path.
That is a medium-severity correctness/observability defect, not high.

### 4b. The stated example fires a different unmapped error

"a tenant-B caller presenting a tenant-A change-set id gets 500" is the right *outcome* but
the wrong *branch*. All authoring repository reads are wrapped in the caller's tenant
transaction (`server/apps/platform-host/src/composition/shared/entity-governance/scoped-meta-entity-authoring.ts:43`,
`register-services.ts:4220-4225`), which stamps `app.current_tenant_id`
(`server/packages/adapters/database/core/src/transaction.ts:20-23`), and the runtime role is
guaranteed non-superuser / non-BYPASSRLS and a member of `athyperapp`
(`server/apps/platform-host/src/composition/infrastructure/database-qualification.ts:59-64`).
RLS therefore hides a tenant-A-owned row from a tenant-B transaction
(`metadata/10_rls.sql:26-31`), so `repository.get()` returns `null` and `assertTenant`'s
first statement `required()` throws `CHANGE_SET_NOT_FOUND`
(`authoring-service.ts:353-359`) — never reaching the `FORBIDDEN` comparison at lines 42-49.
The outcome is still 500 (same unmapped-handler defect), so this does not refute the
finding, but the cited mechanism is not what fires for a tenant-A-owned id. The `FORBIDDEN`
branch fires for `tenant_id IS NULL` platform/shared rows (Section 3).

### 4c. Scope understatement (not an error, but worth recording)

The same `handler()` gap is broader than the cross-tenant path: `TypeError` from the route
validators `str/uuid/rev/breakGlass` (`routes.ts:300-348`), `CHANGE_SET_NOT_FOUND`, and
`VALIDATION_FAILED`/`CONTRACT_TESTS_FAILED` (`authoring-service.ts:177-186`) all become 500
too. The proposed fix ("always translate `FORBIDDEN` to 403") is correct but narrow; the
sibling wrappers already implement the full mapping
(`collection-authoring-routes.ts:30-46`, `notification-authoring-routes.ts:44-64`) and
should be the model.

## 5. Corrected picture

- Defect: real. `routes.ts:285-299` forwards every `AuthoringPolicyError` except one code to
  the runtime, which returns `500 INTERNAL_ERROR` (`http-runtime.ts:241-242`). Cross-tenant
  denials on `scoped()` routes (`routes.ts:350-362`) are indistinguishable from server
  faults, and the 5xx counter (`http-runtime.ts:160`) is inflated.
- Branch correction: for tenant-owned rows the unmapped error is `CHANGE_SET_NOT_FOUND`
  (`authoring-service.ts:353-359`); the cited `FORBIDDEN` (`authoring-service.ts:46-49`)
  fires for `tenant_id IS NULL` platform rows, which is the Country/shared-metadata case.
- Severity: **medium**, not high.
- Fix: give the shared `handler` (or a host-level mapper) the same
  `AuthoringPolicyError`/`AuthoringConflictError`/`TypeError` mapping the collection and
  notification wrappers already use, and assert it through `createHttpApplication` rather
  than a locally installed error middleware.

---

# Adversarial verification — "routes.ts returns HTTP 500 for every error except two shapes" (F1)

Area: Studio meta-entity authoring plane.
Mode: read-only. No source file was modified. This section is appended; the verdict
above concerns a different (narrower) finding and was not altered.

## Verdict

**PARTIAL** — the cited code, line numbers and mechanism are exact and I reproduced
the defect from current source: `handler()` forwards every `TypeError` and every
`AuthoringPolicyError` except one code to `next(error)`, and the production runtime
turns those into `500 INTERNAL_ERROR`. Nothing one layer away rescues it. What is
wrong is the **consequence framing** ("On the Country route …") and the **severity**
(`high`): the defect is a fail-closed status-class / error-contract defect with no
authorization bypass, no data exposure and no state change, so it is **medium**, not
high.

Corrected severity: **medium**.

## 1. The citation is exact

`server/packages/planes/studio/meta-entity-authoring/src/routes.ts:285-299` matches the
quoted `handler` verbatim, and the validator block is exactly where the claim says
(`routes.ts:300-348`: `str` 300, `uuid` 306, `rev` 312, `contract` 318, `onePlane` 327,
`planeList` 333, `breakGlass` 340). The two mapped shapes are the only ones:

```ts
288  if (error instanceof AuthoringPolicyError && error.code === "RESTORATION_PUBLICATION_ALREADY_EXISTS") {
...
296  n(error);
```

`AuthoringPolicyError` and `AuthoringConflictError` are plain `Error` subclasses with no
`status`/`statusCode`/`type` (`server/packages/contracts/meta-entity-authoring/src/ports.ts:13-23`),
and `grep -rn "HttpError"` across the whole package returns nothing, so no in-package
layer converts them to `HttpError`.

## 2. No outer guard rescues the forwarded error

- `server/packages/runtime/http/src/http-runtime.ts:219-244` handles JSON-parse,
  `entity.too.large`, unsupported encoding and `HttpError`; everything else becomes
  `HttpError(500, "INTERNAL_ERROR", …)` at `http-runtime.ts:241-242`.
- The host registers the authoring routes through `configure()`
  (`server/apps/platform-host/src/composition/runtimes/http.ts:71-74`, fed by
  `container.platform.httpRegistrars.push(...)` at
  `server/apps/platform-host/src/composition/register-services.ts:4507`), i.e. before the
  404/error middleware. `exposeErrorDetails` is not present in that runtime's
  `createHttpApplication` options (`grep` returns nothing for the file).
- A repo-wide search found the only four-argument Express error middleware in
  `server/apps/platform-host` in *test* files
  (`composition/control-plane/__tests__/control-session.test.ts:14`,
  `.../publication-policy-enrollment-routes.test.ts:15`,
  `.../publication-workload-routes.test.ts:22`). Production has exactly the one generic
  handler above.
- `openApi.enforceContracts`/`enforceResponses` are not set by this host, so no contract
  middleware rejects the request earlier.

Reachability of the routes is real: `registerStudioAuthoring` returns early unless
`config.publication.apiEnabled` (`register-services.ts:4205-4211`), and the local/parity
deployment defaults that flag to true
(`deploy/compose/instance/compose.parity.yaml:111`, `PUBLICATION_API_ENABLED:-true`;
`deploy/compose/instance/compose.publication-authoring.yaml:6-7`). The BFF relay lists
every one of these operations and passes the upstream status through unchanged
(`packages/platform/gateway/bff-relay/src/index.ts:266-303`, `:3253`).

## 3. The claimed consequences reproduce

All of these throw before any mutation, inside the async handlers wrapped by `handler`,
so the promise rejects and `n(error)` fires:

- `POST /change-sets/:id/publish` without `If-Match` → `rev(q)` at `routes.ts:186` (via
  `action`, `routes.ts:229-253`) throws `TypeError` → 500. Same for `submit` (161),
  `approve` (168), `rollback` (220), `replaceGraph` (143) and the `:id/graph` reads.
- `POST /change-sets` missing `entityId`/`entityCode`/`branchCode`/`title` → `str`/`uuid`
  (`routes.ts:122-125`) → 500.
- `POST .../activate` with an invalid `plane` → `onePlane` (`routes.ts:203`) → 500.
- Every policy denial: `VALIDATION_FAILED` (`authoring-service.ts:179`),
  `CONTRACT_TESTS_FAILED` (184), `APPROVAL_REQUIRED` (221),
  `PUBLICATION_REVIEWED_SOURCE_CHANGED` (244), `SIGNED_RELEASE_REQUIRED` (273, 289),
  `ROLLBACK_RELEASE_NOT_FOUND` (308), `REVIEWER_SEPARATION_REQUIRED` (343),
  `CHANGE_SET_NOT_FOUND` (357), plus `VALIDATION_REQUIRED`, `LEARNING_REVIEW_UNAVAILABLE`,
  `HISTORY_UNAVAILABLE` and the publication-preparer families `BASELINE_*`
  (`baseline-publication.ts:24-75`), `RESTORATION_*`
  (`runtime-restoration-publication.ts:24,46,54`), `LEARNING_*`
  (`learning-publication.ts:23,25`), `COLLECTION_*` (`collection-publication.ts:26,48`) and
  `NOTIFICATION_*` (`notification-publication.ts:70,87`). The `COLLECTION_*`/`NOTIFICATION_*`
  ones are reachable through the *core* publish path because
  `register-services.ts:4228-4229` invokes those preparers inside
  `KyselyMetaEntityAuthoringRepository.createRelease` → `prepareRelease`
  (`kysely-authoring-repository.ts:478`) and errors are not caught. So the claim's
  "`…all become 500`" holds; if anything the count is understated (the core service alone
  throws 11 distinct codes, before the preparer families).

The sibling wrappers confirm the intended contract and are exactly as cited:
`collection-authoring-routes.ts:29-48`, `notification-authoring-routes.ts:42-64`,
`learning-routes.ts:6-12`. The test-local middleware that hides it is exactly as cited:
`__tests__/graph-editor-routes.test.ts:34-36`,
`__tests__/learning-route-scope.test.ts:12` (both would produce 4xx that the production
host never produces).

## 4. What is wrong with the claim

### 4a. The consequence is framed against the wrong surface

"On the Country route this means the authoring surface that produces Country metadata
reports client mistakes … as server faults" conflates two distinct surfaces. The shipped
Country route (`/app/entity/country/` → `entity-read-route.tsx` → the records read API)
is **not** affected; it never calls `/api/meta-entity-authoring/**`. The defect is on the
Studio metadata-authoring API that *produces* the descriptor Country consumes. That is a
real supply-chain connection, but the Country page itself does not return these 500s.
The claim should say "the authoring API used to produce Country metadata", not "on the
Country route".

### 4b. Severity `high` is inflated — medium is the correct class

The mis-mapping is real and broad, but every affected path is fail-closed and
side-effect-free:

- The security decision is unchanged. `allowed()` still authorizes, `assertTenant` still
  denies, `validateGraph`/`runContractTests` still reject; only the *status class* is
  wrong. There is no bypass, no data exposure and no corruption.
- All the `TypeError`s are evaluated while building the argument object, before the
  service call (`rev(q)` at `routes.ts:186`, `uuid(str(...))` at 215-219, `contract(q.body)`
  at 144), so a malformed request causes no write.
- The harm is an opaque "An unexpected error occurred", wrong client handling, and
  `athyper_http_errors_total` 5xx noise from an otherwise-expected denial
  (`http-runtime.ts:154-160`). That is a correctness/observability defect of medium
  severity, consistent with the independent verdict already recorded above for the
  narrower cross-tenant instance of the same `handler()` gap.

The claim's own title is a status-code claim, and the proposed fix is a status-code fix;
nothing in the evidence supports high-severity impact.

## 5. Corrected picture

- Defect real and reproduced: `routes.ts:285-299` maps only
  `RESTORATION_PUBLICATION_ALREADY_EXISTS` and `AuthoringConflictError`; every `TypeError`
  (`routes.ts:300-348`) and every other `AuthoringPolicyError` code reaches
  `http-runtime.ts:241-242` → `500 INTERNAL_ERROR`. Reachable on the shipped host; masked
  only by test-local middleware.
- Correction 1 (scope/consequence): the Country **read** route is unaffected; the defect
  is on the `/api/meta-entity-authoring/**` surface that authors Country metadata.
- Correction 2 (severity): **medium**, not high — fail-closed, pre-mutation, no authz
  bypass or data impact; wrong status class plus 5xx alert/UX noise.
- Correction 3 (count): "11 policy-denial codes" is an undercount once the
  `BASELINE_*`/`RESTORATION_*`/`LEARNING_*`/`COLLECTION_*`/`NOTIFICATION_*` preparer codes
  reachable through the core publish path are included.
- The proposed fix (central mapping in `handler`; `TypeError → 400`, `FORBIDDEN → 403`,
  remaining policy codes → deliberate 409/422; keep `AuthoringConflictError → 409`; add a
  host-level regression test that does not install its own error middleware) is correct
  and should be adopted.

---

# Adversarial verification — F3 "Three test suites cannot collect: six imports resolve to files that do not exist on disk"

Area: Studio meta-entity authoring plane.
Finding under review: `docs/reports/review-fresh/authoring.md` § F3 (HIGH).
Mode: read-only. No source file was modified. This section is appended; the two verdicts
above concern different findings and were not altered.

## Verdict

**PARTIAL** — the defect is real and reproducible, but the count is wrong (5, not 6
unresolvable specifiers), one of the two claimed consequences is false (there is no
TS2307 typecheck failure), the coverage-loss claim is overstated, and the proposed fix
runs against the repo's standing cleanup instruction.

Corrected severity: **medium** (CI test-gate breakage only; zero runtime, product,
authorization or data impact; the modules under test were intentionally deleted).

## 1. What reproduces (the claim is not fabricated)

The cited file/line pairs are exact in the working tree:

- `server/packages/planes/studio/meta-entity-authoring/src/__tests__/configuration-editor-qualification.test.ts:2-3`
  — both `packages/planes/studio/business-partner/src/composition-configuration{,.fixture}` imports.
- `server/packages/planes/studio/meta-entity-authoring/src/__tests__/structural-editor-qualification.test.ts:2-3`
  — both `composition-structure{,.fixture}` imports.
- `server/packages/planes/studio/meta-entity-authoring/src/__tests__/intake-presentation.test.ts:3`
  — `import { publishedBusinessPartnerIntakeOverlay } from "../intake-presentation.js";`

Targets genuinely do not exist: `packages/planes/studio/business-partner/` contains only
`node_modules` (no `src/`, no `package.json`) — deleted by commit `870f08f52`
"cleanup: remove bespoke business partner and workforce"; and
`server/packages/planes/studio/meta-entity-authoring/src/intake-presentation.ts` does not
exist (repo-wide search for `publishedBusinessPartnerIntakeOverlay` finds only the test,
lines 3, 6, 23, 30).

All three test files are tracked at HEAD (`git ls-files` lists them; `git status
--porcelain` is clean for them), so this is not a local leftover.

The three suites are genuinely uncollectable, and that does break the CI test gate. I did
not execute vitest (read-only mandate), but the failure path is verifiable from the
installed tool: the package config is `vitest.config.ts` →
`include: ["src/**/*.test.ts"]`, and vitest 4.1.4 sets `process.exitCode = 1` for
load/collection errors unless `dangerouslyIgnoreUnhandledErrors` is set —
`node_modules/.pnpm/vitest@4.1.4.../vitest/dist/chunks/cli-api.lDy4N9kC.js:13890`
(`_checkUnhandledErrors`: `if (errors.length && !this.config.dangerouslyIgnoreUnhandledErrors) process.exitCode = 1;`)
— and the package config does not set that flag. CI runs this package's `test` script:
`.github/workflows/ci.yml:119-120` runs `pnpm run test:workspace -- --coverage`
(= `turbo test`) on `pull_request` and on pushes to `main`/`develop`, and
`server/packages/planes/studio/*` is a pnpm workspace member (`pnpm-workspace.yaml`), so
turbo reaches this package.

## 2. Where the claim breaks

### 2a. "exactly 6 unresolvable specifiers" — wrong; it is 5

AST-accurate resolution with the repo's own `typescript` (`ImportDeclaration`,
`ExportDeclaration`, `import(...)` specifiers) over all **49** `src/**/*.test.ts` files
finds **225 import specifiers, 5 unresolvable**. A plain `from "…"` regex over the same 49
files finds 95 specifiers and the same 5:

| file:line | unresolvable specifier |
|---|---|
| `src/__tests__/configuration-editor-qualification.test.ts:2` | `…/business-partner/src/composition-configuration` |
| `src/__tests__/configuration-editor-qualification.test.ts:3` | `…/business-partner/src/composition-configuration.fixture` |
| `src/__tests__/structural-editor-qualification.test.ts:2` | `…/business-partner/src/composition-structure` |
| `src/__tests__/structural-editor-qualification.test.ts:3` | `…/business-partner/src/composition-structure.fixture` |
| `src/__tests__/intake-presentation.test.ts:3` | `../intake-presentation.js` |

The likely source of the extra "one" is `src/__tests__/product.test.ts:151`, where
`"./graph-builder.js"` sits inside `expect(imports.sort()).toEqual([...])`. It is a string
literal describing what `src/authoring/product.ts` imports, not a specifier of the test
file; resolved against its real base (`src/authoring/`) it hits the existing
`src/authoring/graph-builder.ts`. The suite count (3 of 49) is correct; the specifier
count is not.

### 2b. "`tsc -p tsconfig.test.json --noEmit` reports TS2307" — false

`tsconfig.test.json` overrides only `compilerOptions` and `include`; it does not override
`exclude`, so it inherits `"exclude": ["node_modules", "dist", "src/**/*.test.ts"]` from
`server/packages/planes/studio/meta-entity-authoring/tsconfig.json:5` (itself inheriting
`**/*.test.ts` from `server/tsconfig.json`). `exclude` filters the `include` glob and
nothing imports these files, so they never enter the program:

```
$ tsc --showConfig -p tsconfig.test.json      # run in the package directory
include: ['src/**/*.ts']
exclude: ['node_modules', 'dist', 'src/**/*.test.ts']
files count: 46
test files in program: 0
```

Therefore the declared `typecheck` script
(`tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit`) cannot and does not
emit TS2307 for any of these imports. The real situation is the opposite of the claim: the
orphaned suites are invisible to typecheck, which is a separate (smaller) gap, not the
claimed failure.

### 2c. "the coverage … through `validateGraph`/`compileGraph`/`runContractTests` is currently zero" — overstated

Only the two qualification suites that consumed the deleted business-partner editors are
dead. Those framework functions remain heavily exercised inside the same package —
`src/__tests__/deterministic.test.ts` (~44.8 kB), plus `target-compiler.test.ts`,
`entity-registration.test.ts`, `runtime-restoration.test.ts`,
`durable-graph-preview.test.ts`. What is zero is coverage of the deleted
`composition-configuration` / `composition-structure` editors, which no longer exist.

### 2d. No consequence for the shipped Country route

The finding is confined to one package's unit tests. The Country read chain
(`apps/*/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx` →
`packages/platform/entity/runtime/form-detail/src/routes/entity-read-route.tsx` →
`entity-read-surface.tsx` → list/detail runtimes → `apps/*/app/api/relay/[...path]/route.ts`
→ `server/packages/services/records/src/entity-list-routes.ts`) shares no code with these
suites. Impact is limited to the CI `turbo test` step for an authoring package.

### 2e. The proposed fix is partly wrong

"Restore the deleted business-partner sources/fixtures and intake-presentation.ts"
contradicts commit `870f08f52` and `AGENTS.md` ("Do not create bespoke entity-specific
apps/routes/APIs"; keep entity-specific configuration in metadata; do not recreate removed
bespoke code). The correct remediation is to delete the three orphaned test files (or
rewrite `intake-presentation.test.ts` against a metadata-generic overlay), and optionally
add the specifier-resolution guard. Note that the existing gate `pnpm test:reachability`
(`tooling/scripts/testing/verify-test-reachability.mjs`) checks test-file→runner
reachability, not relative-specifier resolution, so the proposed guard does not exist
today.

## 3. Corrected picture

- Defect: real, medium. Three tracked vitest suites cannot be collected because **five**
  relative specifiers point at deleted files (`configuration-editor-qualification.test.ts:2-3`,
  `structural-editor-qualification.test.ts:2-3`, `intake-presentation.test.ts:3`). vitest
  4.1.4 exits non-zero on these load errors, so the CI "Workspace tests with coverage" step
  (`.github/workflows/ci.yml:119-120`, `turbo test`) fails.
- Not a defect: the claimed typecheck failure. `tsconfig.test.json` inherits
  `exclude: src/**/*.test.ts`, so `tsc --showConfig` resolves a 46-file program with 0 test
  files and no TS2307 is possible.
- Severity: **medium**, not high — no runtime/product/security impact, and the code under
  test was deliberately removed.
- Fix: delete the three orphaned suites (do not restore the removed bespoke business-partner
  sources); optionally add a src-wide relative-specifier resolution guard to CI.
