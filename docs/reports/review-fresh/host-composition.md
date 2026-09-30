# Independent review — Platform host composition, DDL and DB scripts

Reviewer area: `server/apps/platform-host/src/**` (composition / kernel / config / development /
entrypoints), `server/db/scripts/**`, `server/db/ddl/**`, `turbo.json`, `tests/**`.

This review was derived only from the current source in the working tree. No file under
`docs/reports/` (including `docs/reports/review/`) was read. All findings below were confirmed by
reading the actual source; the two test-collection findings were additionally confirmed by running
the failing runner.

Working tree state matters for this area: the tree contains a large set of uncommitted moves
(`git status` shows `D server/apps/platform-host/src/composition/shared/ai/**`,
`D .../composition/shared/verification/routes.ts`, `?? .../composition/shared/verification.ts`,
`?? .../composition/spaces/neon/ai/`). Findings that are caused by that in-flight move are marked
**[in-flight move]**. Findings whose target is already absent in `HEAD` are marked
**[pre-existing]**.

## Measured inventory

| Surface | Measurement |
| --- | --- |
| `server/apps/platform-host/src` TypeScript files | 238 (of which 100 are `*.test.ts`) |
| `server/apps/platform-host/src` total lines | 33,384 |
| `tests/**` files | 302 (179 `.ts`/`.tsx`/`.mts`/`.mjs`) |
| `server/db/scripts/**` files | 346 |
| `server/db/ddl/**` `*.sql` files / lines | 494 / 292,766 |
| `SECURITY DEFINER` occurrences in `server/db/ddl/**` | 242 |
| Import specifiers mechanically resolved in `server/apps/platform-host/src` + `tests` | 2,224 across 413 files → **5 unresolved** (all 5 confirmed genuinely missing) |
| Import specifiers mechanically resolved in `server/db/scripts` + `server/apps/platform-host/scripts` | 12 unresolved across 224 files (all confirmed genuinely missing) |
| Package scripts in `server/db/package.json` pointing at deleted files | **18** |
| Broken `exports` entries in `server/db/package.json` | 3 of 5 |
| Host composition source files with no importer (excluding entrypoints/CLI/dynamic loaders) | 5 modules, 182 lines |
| Capability catalog entries never selected | 3 of 7 |
| Closed module-registry loaders never loaded | 3 of 5 |
| Deleted source paths still listed in `server/db/seed/contracts/authorization/inventory/mesh/compiled/table-authorization-coverage.v1.json` | 40 unique of 215 references |

The host's own read-only inventory tools were also run and are healthy on their own scope:
`node scripts/verification/inventory-composition.mjs` reports `total missing 0` for non-test host
composition source, and `inventory-deleted-exports.mjs` reports `unresolvedBarrels: []`,
`consumers: []`. Both walkers skip `__tests__/` and `*.test.ts` — which is exactly where the
unresolved imports in this review are.

---

# Findings

## H1 — HIGH — Platform verification endpoints authenticate but never authorize

**Citation:** `server/apps/platform-host/src/composition/shared/verification.ts:65-79` (snapshot
contract), `:80-100` (run contract), `:110-118` (registration), `:194` (`executeVerification`).

```ts
const snapshotContract = defineRouteContract({
  method: "get",
  path: "/api/platform/verification",
  operationId: "platform.verification.snapshot",
  summary: "Run authenticated read-only platform verification",
  tags: ["Platform verification"],
  authenticated: true,
  responses: { ... },
});
```

```ts
  const iam = container.platform.iam;
  if (!iam) return;
  const authenticate = createIamAuthenticationMiddleware(iam);
  ...
  container.platform.httpRegistrars.push((application: Application) => {
    registerContractRoute(
      application,
      snapshotContract,
      authenticate,          // authentication middleware only
      async (_request, response, next) => {
```

and `POST /api/platform/verification/runs` (lines 80-100, 132-190) is registered the same way.

The module contains **no** occurrence of `permission` or `authoriz` (verified by grep of
`verification.ts`; the module's only imports are the IAM authentication middleware and the HTTP
route runtime). `createIamAuthenticationMiddleware`
(`server/packages/platform/iam/src/iam-routes.ts:70-104`) only verifies the bearer token, the
`x-plane` header and the identity; it performs no permission decision. By contrast every comparable
host route calls an authority: `register-platform.ts:411,596,663`,
`composition/shared/identity/contact-verification.ts:45`,
`composition/shared/publication/policy-enrollment.ts:42`,
`composition/control-plane/session.ts:16` (`assertPlatformAuthority`).

The HTTP runtime's own guard is not a mitigation: `auditRouteContracts` flags authenticated
contracts that lack `permission` metadata
(`server/packages/runtime/http/src/route-contract.ts:88`, code `MISSING_PERMISSION`), but the host
never enables it (`register-runtimes`/`http.ts` construction passes `openApi` without
`enforceContracts`; `assertRouteContracts` is only reached at `http-runtime.ts:204` when
`openApi.enforceContracts` is set, and `composition/runtimes/http.ts:29-39` does not set it).
`permission` is anyway only emitted as `x-athyper-permission` OpenAPI metadata
(`route-contract.ts:116`), never enforced.

**Why it is wrong / impact.** Any principal holding a valid exact-plane bearer token can:

* `GET` a platform verification snapshot that reports database health per plane, Redis PING
  latency, readiness check names and status, object storage / ClamAV / Tika / Gotenberg /
  Meilisearch / mail health, plus a Grafana Explore URL
  (`verification.ts:223-291`, `:312-338`);
* `POST` `{"mode":"functional"}` to make the host *write* to shared infrastructure as that user:
  S3 `put`/`delete` in the documents and transfers buckets, concurrent `putIfAbsent` against the
  artifacts bucket, Meilisearch upsert/search/delete, Redis writes, a job enqueue on the
  `system-verification` queue, and a real mail send when `env === "local"`
  (`verification.ts:500-842`).

This is exactly the "authorize on authentication only" fail-open the area targets, and it is live in
the same process that serves the Country route: `verification.enabled` defaults to `env === "local"`
(`config/environment.ts:1081`), `server/db`/deploy never override `PLATFORM_VERIFICATION_ENABLED`
(verified by grepping `deploy/` and `tooling/`), and DEV/QA are local profiles
(`deploy/compose/instance/scripts/start-runtime.sh:52-53` maps `dev.athyper.test|qa.athyper.test`
to `ATHYPER_ENV=local`). The API host is routed without an extra auth layer:
`deploy/compose/instance/config/traefik/dev.yaml:16-20` routes `Host(api.dev.athyper.test)` to
`api-failover` with **no middlewares**.

**Concrete consequence on the shipped Country route.** The Country list/detail surface is served by
this host in DEV; a Country user's plane token is sufficient to run the functional verification
writes above (the run is only rate-limited to one per 15 s per principal,
`verification.ts:18,151-169`). The writes are tenant-scoped by `context.tenantId`
(`verification.ts:515,540,576,612`), so this is abuse-of-privilege and infrastructure churn rather
than a direct cross-tenant read; the snapshot endpoint additionally discloses internal topology to
any authenticated principal.

**Fix.** Before executing, require an explicit platform permission through the already-composed
authorizer, e.g.

```ts
const decision = await container.platform.authorizer.authorize({
  context, permissionCode: "platform.verification.run",
});
if (!decision.allowed) { response.status(403).json(problem(403, "VERIFICATION_ACCESS_DENIED", "...")); return; }
```

for the POST path, and a read permission (`platform.verification.read`) for the snapshot; declare
`permission:` on both contracts; and enable `openApi.enforceContracts` on the host HTTP application
so future authenticated contracts cannot silently omit permission metadata.

---

## H2 — HIGH — Host vitest suite imports a module deleted by the in-flight move **[in-flight move]**

**Citation:** `server/apps/platform-host/src/composition/shared/verification/__tests__/routes.test.ts:5`

```ts
import { executeVerification } from "../routes.js";
```

`server/apps/platform-host/src/composition/shared/verification/routes.ts` does not exist in the
current tree (`git status` shows ` D` for it); the implementation now lives at
`server/apps/platform-host/src/composition/shared/verification.ts` (the file diff against
`HEAD:.../verification/routes.ts` is only import-path and `PlaneKey` changes). The test sits in the
now-vestigial `verification/__tests__/` directory.

**Verified by execution:**

```
$ cd server/apps/platform-host && npx vitest run src/composition/shared/verification/__tests__/routes.test.ts
 FAIL  src/composition/shared/verification/__tests__/routes.test.ts
Error: Cannot find module '../routes.js' imported from .../verification/__tests__/routes.test.ts
 ❯ src/composition/shared/verification/__tests__/routes.test.ts:5:1
 Test Files  1 failed (1)
```

`vitest.config.ts` includes `src/**/*.test.ts`, and CI runs the workspace test task
(`.github/workflows/ci.yml:120` → `pnpm run test:workspace` → `turbo test` → `vitest run`), so this
turns the platform-host test task red. The coverage the test provided (verification runner
sanitisation) is real and worth keeping.

**Fix.** Move the file to `src/composition/shared/verification/routes.test.ts` (or keep the
directory but import `../../verification.js`), and delete the empty `verification/` directory — or
restore `routes.ts` as the module name so no import changes are needed. Note the directory is also
what `docs/module-ownership.md:17` still documents.

---

## H3 — HIGH — `tests/foundation` suite imports the moved Atlas module **[in-flight move]**

**Citation:** `tests/foundation/atlas-record-question.test.ts:3`

```ts
import { atlasRequestsRecordOverview } from "../../server/apps/platform-host/src/composition/shared/ai/atlas-record-question";
```

`server/apps/platform-host/src/composition/shared/ai/` no longer exists (union of `git status`
deletions and `?? .../composition/spaces/neon/ai/`); the target is now
`server/apps/platform-host/src/composition/spaces/neon/ai/atlas-record-question.ts`.

**Verified by execution:**

```
$ npx tsx --test tests/foundation/atlas-record-question.test.ts
Error: Cannot find module '../../server/apps/platform-host/src/composition/shared/ai/atlas-record-question'
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

CI runs this file: `package.json` `test:foundation` is
`tsx --tsconfig tooling/config/tsconfig-react.json --test tests/foundation/*.test.ts ...`, and
`test:root` (used by `.github/workflows/ci.yml:130`) includes `test:foundation`. The repo's
dependency rule 8 explicitly requires moved files to update "test source paths"
(`server/apps/platform-host/docs/dependency-rules.md:16-18`), which did not happen here.

**Fix.** Update the import to
`../../server/apps/platform-host/src/composition/spaces/neon/ai/atlas-record-question`, and add a
static check (the host already has `scripts/verification/inventory-composition.mjs`) that resolves
host test imports too, so a source move cannot leave `tests/` behind again.

---

## H4 — HIGH — `tests/foundation` suite imports a provisioning module that does not exist **[pre-existing]**

**Citation:** `tests/foundation/reference-choice-policy.test.ts:7`

```ts
import { withBusinessPartnerReferenceHistory } from "../../server/db/scripts/provisioning/business-partner-data-surfaces";
```

`server/db/scripts/provisioning/business-partner-data-surfaces.ts` does not exist, and
`git cat-file -e HEAD:server/db/scripts/provisioning/business-partner-data-surfaces.ts` also fails:
the module was never present in `HEAD`, so this suite is committed broken, not broken by the
in-flight move. The rest of the file exercises `parseRecentChoicePolicy` /
`parseEntityIntakeSurfaces` from `packages/contracts/platform/entity-runtime` (which resolves), so
only the second import is stale.

**Verified by execution:**

```
$ npx tsx --test tests/foundation/reference-choice-policy.test.ts
Error: Cannot find module '../../server/db/scripts/provisioning/business-partner-data-surfaces'
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

**Consequence.** `pnpm run test:foundation` (and therefore `test:root` in CI) fails before running
any foundation test in this file; the reference-choice policy coverage is silently absent.

**Fix.** Either reinstate the small `withBusinessPartnerReferenceHistory` profile-upgrade helper
(business-partner configuration belongs in metadata per the standing repo rule, so a metadata
fixture/upgrade helper is the right home), or delete the two tests that depend on it
(`tests/foundation/reference-choice-policy.test.ts:77,92`) and keep the contract-parsing assertions.

---

## H5 — HIGH — `server/db` provisioning tests import six deleted modules, and the package test glob runs them

**Citation:** `server/db/package.json:16`

```json
    "test": "tsx --test scripts/__tests__/**/*.test.ts",
```

`sh -c 'echo scripts/__tests__/**/*.test.ts'` expands the `**` to one level
(`scripts/__tests__/<subdir>/<file>.test.ts`), so `scripts/__tests__/provisioning/*.test.ts` is
executed by `pnpm --filter @athyper/server-db test`, which `turbo test` (CI `test:workspace`) runs.

Six of those files import modules that do not exist (all targets also absent in `HEAD`, i.e.
pre-existing):

```
server/db/scripts/__tests__/provisioning/business-partner-labels.test.ts:4
  import { withBusinessPartnerLabels } from "../../provisioning/business-partner-labels";
server/db/scripts/__tests__/provisioning/business-partner-r2-fixtures.test.ts:3
  import { buildR2DatabaseFixtures } from "../../provisioning/provision-business-partner-r2-fixtures.js";
server/db/scripts/__tests__/provisioning/business-partner-r5-fixtures.test.ts:6
  } from "../../provisioning/provision-business-partner-r5-fixtures.js";
server/db/scripts/__tests__/provisioning/business-partner-r7-fixtures.test.ts:4
  import { buildR7DatabaseFixtures } from "../../provisioning/provision-business-partner-r7-fixtures.js";
server/db/scripts/__tests__/provisioning/development-business-partner-fixtures.test.ts:4,48
  import { buildDevelopmentBusinessPartnerFixtures } from "../../provisioning/provision-development-business-partner-fixtures.js";
  ... from "../../provisioning/development-business-partner-profiles.js";
server/db/scripts/__tests__/provisioning/development-business-partner-runtime.test.ts:8
  } from "../../provisioning/provision-development-business-partner-runtime.js";
```

**Verified by execution:**

```
$ npx tsx --test server/db/scripts/__tests__/provisioning/business-partner-labels.test.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../server/db/scripts/provisioning/business-partner-labels'
  imported from .../server/db/scripts/__tests__/provisioning/business-partner-labels.test.ts
```

**Consequence.** The `@athyper/server-db` test task cannot succeed; `pnpm test:workspace` fails for
that workspace. The provisioning scripts themselves were removed by
`870f08f52 cleanup: remove bespoke business partner and workforce`; the tests that covered them were
left behind. These tests are the only verification of the deterministic provisioning fixtures, so
losing them also loses real coverage.

**Fix.** Delete or restore the six provisioning modules and their tests together. Independently,
make the glob explicit (`scripts/__tests__/*/*.test.ts`) so the executed set is visible in the
package manifest rather than depending on shell expansion of `**`.

---

## M1 — MEDIUM — DDL hardening pass is required to be last but runs before 10–34 later manifest entries

**Citation:** `server/db/ddl/common/shared/99_security_definer_hardening.sql:1-2`

```sql
-- Final clean-slate hardening pass. This file must remain last in every plane
-- manifest so functions created by every schema have already been installed.
```

The pass itself is fail-closed while it runs (`:42-52`):

```sql
        IF NOT EXISTS (
            SELECT 1 FROM pg_proc configured
             WHERE configured.oid = routine.oid
               AND EXISTS (
                   SELECT 1 FROM unnest(COALESCE(configured.proconfig, ARRAY[]::text[])) setting
                    WHERE setting LIKE 'search_path=%'
               )
        ) THEN
            RAISE EXCEPTION 'SECURITY DEFINER %.% lacks an explicit search_path',
                routine.schema_name, routine.routine_name;
        END IF;
```

It also revokes `EXECUTE ... FROM PUBLIC` and reassigns ownership (`:30-40`). But in all three
plane manifests the file is followed by more entries:

| Manifest | hardening at | total lines | entries after |
| --- | --- | --- | --- |
| `server/db/ddl/planes/studio/_manifest.txt` | 255 | 265 | 10 |
| `server/db/ddl/planes/neon/_manifest.txt` | 237 | 271 | 34 |
| `server/db/ddl/planes/mesh/_manifest.txt` | 223 | 233 | 10 |

Those later entries include `common/master/21_reference_choice_recent.sql`,
`common/document/14_collaboration_participant_directory.sql` and (Neon)
`planes/neon/control/18_partner_decision_contract.sql`, which create `SECURITY DEFINER` functions
after the pass has already run — so they are never inspected, never have `PUBLIC` execute revoked
by the pass, and never have ownership normalised. I checked the three files: each one self-hardens
(`SET search_path=...` inline and an explicit `REVOKE ALL ... FROM PUBLIC`, e.g.
`common/master/21_reference_choice_recent.sql:30,39` and
`common/document/14_collaboration_participant_directory.sql:6,23,30,46`), so there is **no live
privilege gap in these three files today** — the defect is that the documented invariant is not
enforced and the next appended function will silently escape it.

**Fix.** Move `common/shared/99_security_definer_hardening.sql` to the end of each manifest, or add
a manifest check (in `server/db/scripts/checks/ddl/`) that fails when any SQL file after the
hardening entry contains `SECURITY DEFINER` / `CREATE FUNCTION`.

## M2 — MEDIUM — 18 `server/db` package scripts and 3 of 5 package `exports` point at deleted files

**Citation:** `server/db/package.json:16` (test glob, above) and, for example:

```json
60:    "db:provision:neon:business-partner-runtime": "tsx scripts/provisioning/provision-development-business-partner-runtime.ts",
66:    "db:provision:neon:business-partner-360-fixtures": "tsx scripts/business-partner-360/provision-business-partner-360-acceptance-fixtures.ts",
196:    "./test-fixtures/business-partner-r2": "./scripts/provisioning/provision-business-partner-r2-fixtures.ts",
```

A mechanical audit of every `tsx <file>`/`node <file>` in the package manifest found 18 scripts whose
target is missing, plus 3 broken `exports` entries (`./test-fixtures/business-partner-r2`,
`./tooling/business-partner-360/evaluate-business-partner-360-p0-approvals`,
`./tooling/business-partner-360/evaluate-business-partner-360-p1-qualification`). 13 of the 18 point
into `scripts/business-partner-360/` or
`server/apps/platform-host/scripts/db-verification/business-partner-360/`, directories that do not
exist at all (`ls` confirmed). The full missing-script list is: `business-partner-runtime`,
`business-partner-fixtures`, `business-partner-r2-fixtures`, `business-partner-r5-fixtures`,
`business-partner-r7-fixtures`, `business-partner-360-fixtures`, `business-partner-360-security`,
`business-partner-s5`, `business-partner-360-materialization`, `business-partner-360-p0`,
`business-partner-360-p1`, `business-partner-360-performance`, `business-partner-360-rollout`,
`business-partner-360-observation`, `business-partner-live-catalog-parity`,
`business-partner-r6-delivery`, `business-partner-r5-downstream`, `business-partner-360-reads`.

**Consequence.** These are the operational entrypoints an operator or a runbook would invoke;
each fails immediately with `ERR_MODULE_NOT_FOUND` after the command has already been chosen, and
`@athyper/server-db/test-fixtures/business-partner-r2` cannot be imported by any consumer.

**Fix.** Delete the scripts/exports that were intentionally retired with
`870f08f52 cleanup: remove bespoke business partner and workforce`, or restore the files. Add a
policy check that resolves every `tsx`/`node` path in `server/**/package.json` scripts and `exports`.

## M3 — MEDIUM — Closed module registry and capability catalog contain registrations with no callers

**Citation:** `server/apps/platform-host/src/kernel/module-registry.ts:5-7` and `:22-23`

```ts
const loaders = {
  "entity.metadata": () => import("../composition/shared/entity-runtime/metadata.js"),
  "entity.read": () => import("../composition/shared/entity-runtime/read-runtime.js"),
  "entity.read-http": () => import("../composition/shared/entity-runtime/read-bindings.js"),
  "coordination.entity-release-review": () => import("../composition/coordination/entity-release-review/release-review.js"),
  "compatibility.services": () => import("../composition/register-services.js"),
} as const;
```

```ts
  if (key === "entity.read-http" && profile.role !== "api")
    throw new Error("HOST_HTTP_MODULE_ROLE_INVALID");
```

Only two keys are ever loaded: `bootstrap.ts:29` loads `"compatibility.services"` and
`bootstrap.ts:32` loads `"coordination.entity-release-review"` (`grep -rn loadHostModule
server/apps/platform-host/src` returns only the definition and those two call sites). The
`entity.metadata`, `entity.read` and `entity.read-http` loaders — and the `api`-role guard on
`entity.read-http` — are never exercised. The HTTP read surface is instead imported statically by
the combined registrar (`register-services.ts:12` → `http-registrars.ts`), so the registry's
role restriction does not actually gate anything today.

The same pattern exists in the capability catalog,
`server/apps/platform-host/src/kernel/capability-registration.ts:13-15`:

```ts
  "entity.http": { planes: allPlanes, roles: ["api"] },
  "publication.authority": { planes: ["studio"], roles: allRoles },
  "publication.targets": { planes: allPlanes, roles: allRoles },
```

Production code selects only `entity.persistence`, `entity.experience`, `entity.governance` and
`entity.authorization` (`register-services.ts:585,593,614,988,1303,2830`; the only other references
to `entity.http`/`publication.authority` are in `kernel/__tests__/capability-registration.test.ts`
and a same-named queue constant in `packages/services/publication/src/publication-jobs.ts`).
`publication.targets` has no reference anywhere outside its own declaration.

**Consequence.** These are isolation primitives that look enforced but are not: a reviewer (or a
future isolated profile) can believe plane/role eligibility for HTTP, publication authority and
publication targets is derived from the catalog, when in practice those capabilities are always
registered. Dead entries also make the catalog and registry misleading about what is implemented.

**Fix.** Either wire the unused keys (load `entity.read-http` from the API runtime and select the
publication capabilities through `capabilityRegistration`) or delete the unused entries and gate
the HTTP read registration through `capabilityRegistration.register("entity.http", …)` so the role
restriction is real.

## M4 — MEDIUM — Browser specs and a shared fixture import a deleted package/module

**Citations:** `tests/foundation-browser/bank-editor.spec.ts:5`,
`tests/foundation-browser/fixtures/bp-shared-record.tsx:6`

```ts
import { withBusinessPartnerFullProfile } from "../../server/db/scripts/provisioning/business-partner-full-profile";
```

```ts
import { AuthorizedAttachment } from "../../../packages/planes/neon/business-partner/src/360/components/commercial-controls";
```

Both targets are absent, and both are absent in `HEAD` as well
(`git cat-file -e HEAD:server/db/scripts/provisioning/business-partner-full-profile.ts` →
`ABSENT_IN_HEAD`; `packages/planes/neon/business-partner/` contains only a stale `node_modules`
directory, no `src`, no `package.json`). `bp-shared-record.tsx` has **no importer anywhere in the
repository**: the spec it was created for does not exist
(`docs/architecture/application-experience/business-partner-legacy-shell-reachability.md:11`
claims `tests/foundation-browser/business-partner-shared-record.spec.ts` replaces the legacy shell
fixture, but that spec is not present).

**Consequence.** `pnpm run test:foundation-browser` (playwright `testDir: tests/foundation-browser`)
cannot collect `bank-editor.spec.ts`; the shared-record fixture is dead code whose import would fail
if any spec ever used it. Neither is part of the current CI gate (`test:root` →
`test:country-browser` names five specs only: `entity-read-route-adapter`, `detail-collaboration`,
`entity-surface-hardening`, `country-filter-layout`, `entity-onboarding-followup`), which is why
this has stayed broken.

**Fix.** Delete `tests/foundation-browser/fixtures/bp-shared-record.tsx` and
`tests/foundation-browser/bank-editor.spec.ts` (or restore the deleted modules) and correct the
reachability document; if the shared-record scenario is still wanted, add the missing spec that
imports the fixture.

The same cleanup left `tooling/config/playwright.config.ts:84-109` registering seven projects
(`bp-v1-009`, `bp-r2`, `bp-r3`, `bp-r5`, `bp-r6-amendment`, `bp-r6`, `bp-r7`) with
`testMatch: "**/business-partner/*.spec.ts"`, a directory that no longer exists
(`find tests -name bp-v1-009.spec.ts` → nothing). Selecting those projects yields an empty run.

## L1 — LOW — Dead host composition modules with zero importers

**Citations and exact sizes** (repo-wide grep for each basename returns no consumers):

```
server/apps/platform-host/src/composition/shared/entity-governance/authorization-registration.ts  (55 lines)
server/apps/platform-host/src/composition/shared/entity-runtime/metadata-validation.ts             (62 lines)
server/apps/platform-host/src/composition/shared/entity-runtime/permission-transitions.ts          (33 lines)
server/apps/platform-host/src/composition/shared/publication/plane.ts                              (23 lines; only its own test imports it)
server/apps/platform-host/src/composition/spaces/neon/supplier-information-escalation.ts           (9 lines)
```

For example `metadata-validation.ts:17`:

```ts
export function createEntityMetadataHooks(input: {
```

Only `shared/publication/plane.ts` is reached, and only by
`shared/publication/__tests__/publication-plane.test.ts:3` — a test whose assertion is that Studio
maps to Studio, Neon to Neon, Mesh to Mesh
(`publicationPlaneToHostPlane`, `plane.ts:8-18`), i.e. a test of a function with no production
caller.

**Consequence.** Dead code in the composition root makes the "what composes the Country host"
question harder to answer; `supplier-information-escalation.ts:6` (`sweepSupplierInformation`) is
also entity/business-specific database work (it calls
`document.sweep_process_information_due`) that, per the standing repo instruction, belongs behind
metadata-driven Entity onboarding rather than as bespoke host code.

**Fix.** Delete the modules and their test, or reference them from the composition path that needs
them. If `createEntityMetadataHooks` / `requireEntityPermissionTransitions` /
`createEntityAuthorizationRegistrations` are intended to be the generic authorization seams, wire
them into the entity runtime instead of leaving parallel unused ones.

## L2 — LOW — `docs/module-ownership.md` documents paths that no longer exist

**Citations:** `server/apps/platform-host/docs/module-ownership.md:16`, `:17`, `:93`

```
| `composition/shared/ai/` | Atlas inference admission and document knowledge bindings | Preserve capability names |
| `composition/shared/verification/` | Shared verification operational routes | Authentication and plane scope remain explicit |
...
`kernel/capability-readiness.ts` evaluates compatibility capability requirements;
```

`composition/shared/ai/` is now `composition/spaces/neon/ai/` **[in-flight move]**,
`composition/shared/verification/` is now the file `composition/shared/verification.ts` (the
directory only holds the stale test from H2), and `kernel/capability-readiness.ts` does not exist
anywhere (`grep -rn capability-readiness` returns only this document).

**Consequence.** The document is the convention this task asks about ("a consistent, documented
convention"); three of its rows no longer describe the tree, so a contributor following it recreates
the same stale-import problem.

**Fix.** Update the three entries when the in-flight move lands, and add a check that every
back-ticked path in this document exists.

## L3 — LOW — Legacy environment keys are accepted as authoritative for environment selection

**Citations:** `server/apps/platform-host/src/config/environment.ts:310-323`

```ts
  const rawEnv = environment["ATHYPER_ENV"] ?? environment["ENVIRONMENT"];
  const env = (["local", "staging", "production"] as const).includes(
    rawEnv as "local" | "staging" | "production",
  )
    ? (rawEnv as "local" | "staging" | "production")
    : environment["NODE_ENV"] === "production"
      ? "production"
      : "local";
  const notificationCapture = readBoolean("NOTIFICATION_CAPTURE", false);
  if (notificationCapture && (env !== "local" || rawEnv !== "local")) {
```

and `environment.ts:266-268`:

```ts
    return (
      environment[`STUDIO_${suffix}`]?.trim() ??
      environment[`ATHYPER_PLATFORM_${suffix}`]?.trim()
    );
```

`ENVIRONMENT` is a generic key (it is also used for Sentry's environment name,
`diagnostics/telemetry/error-collector.ts:12`). Because both the environment profile and the
`NOTIFICATION_CAPTURE` local-only guard are driven by `rawEnv`, a process with `NODE_ENV=production`
and `ENVIRONMENT=local` but no `ATHYPER_ENV` is classified as local, which additionally enables
`verification.enabled` (H1), the `S3_ACCESS_KEY`/`S3_SECRET_KEY` fallback (`:511-516`), the
`ALLOW_SHARED_BULLMQ_REDIS` default (`:440-443`), and the relaxed STG/PROD storage and SES
requirements (`:543-562`, `:722-730`). The same shape exists for the studio database URLs, where a
leftover `ATHYPER_PLATFORM_DATABASE_URL` silently substitutes for `STUDIO_DATABASE_URL`.

**Mitigations checked.** The container runtime forces an explicit value:
`deploy/compose/instance/scripts/start-runtime.sh:51-54` fails when `ATHYPER_ENV` is unset outside
`dev.athyper.test`/`qa.athyper.test`; local DEV sets both keys to `local`
(`tooling/scripts/local-dev/applications.mjs:121-122`); `deploy/stackctl/src/provider-config.mjs:61`
rejects a non-`staging` `ATHYPER_ENV`. So this is only reachable through launchers that bypass
`start-runtime.sh` (for example `node dist/main.js` or a custom env source), which is why it is LOW
rather than HIGH.

**Fix.** Prefer `ATHYPER_ENV` only, or require `ATHYPER_ENV` whenever `NODE_ENV=production`, and
drop the `ENVIRONMENT`/`ATHYPER_PLATFORM_*` fallbacks (or log a deprecation warning and make the
fallback non-production only).

## L4 — LOW — `turbo.json` does not declare environment inputs, so test/build cache keys ignore the environment

**Citation:** `turbo.json:4-27`

```json
  "globalDependencies": ["**/.env.*local"],
  "tasks": {
    ...
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "**/*.{ts,mts,cts}", "tests/**", "vitest.config.*"]
    },
```

There is no `globalEnv`/`env`/`envMode` declaration anywhere in the file. Turbo's strict env mode
therefore hashes only declared variables (plus framework defaults), so a cached `test` or `build`
result is keyed on files alone. `server/db`'s tests and the platform-host `*.postgres.test.ts`
suites are environment-dependent (database URLs, `ATHYPER_ENV`, `ALLOW_SHARED_BULLMQ_REDIS`), and
`turbo test` is cacheable (`"cache"` is not disabled for `test`).

**Consequence.** With a remote/local cache shared across checkouts, a green `test` result produced
under one environment can be replayed for another environment's invocation without re-running.

**Fix.** Declare the relevant variables (`globalEnv: ["ATHYPER_ENV", "NODE_ENV", "DATABASE_URL", …]`)
or set `"test": { "cache": false }` for the database-backed workspaces.

## L5 — LOW — Generated mesh authorization coverage artifact still lists 40 deleted source paths

**Citation:** `server/db/seed/contracts/authorization/inventory/mesh/compiled/table-authorization-coverage.v1.json:596-607`

```json
        "../apps/platform-host/src/composition/business-partner-stored-scopes.ts",
        ...
        "../packages/services/master-data/src/hr-stage2-service.ts",
        "../packages/services/master-data/src/kysely-business-partner-case-repository.ts"
      ],
```

Resolving all 215 `../…` references in that file against `server/db` (the base that makes the
surviving paths resolve) leaves **40 unique paths that do not exist**, including
`apps/platform-host/src/composition/{business-partner-authorization-deployment,business-partner-stored-scopes,dev-publication,dev-runtime-publication,entity-release-review-deployment}.ts`,
the six `supplier-process-*.ts` modules, `apps/platform-host/src/monitoring/business-partner-metrics.ts`,
and many `packages/services/master-data/src/*` and `packages/planes/{neon,mesh}/src/*business-partner*`
files. The Neon and Mesh inventory artefacts are regenerated by
`server/db/package.json:125-127` (`db:seed:authorization:mesh-inventory:check`), and the compiled
file feeds `server/db/scripts/checks/seeds/authorization-release-gates.ts` and the mesh/neon
authorization inventory tests.

**Confidence: probable.** I confirmed the 40 missing paths and the consumers, but I did not run
`db:seed:authorization:mesh-inventory:check`, so I cannot state that the gate currently fails; the
verified part is that the committed coverage evidence references source files that do not exist.

**Fix.** Re-run `db:seed:authorization:{mesh,neon}-inventory:build` as part of the cleanup commit
that deleted those sources, and make the release gate fail on references to non-existent files so
stale coverage cannot sit green.

---

# Verified healthy (do not churn)

* **Closed, literal module registry.** `kernel/module-registry.ts:3,12,19,27-28` uses literal
  loaders, `Object.hasOwn` validation, and a statically typed key union; metadata cannot supply a
  module path. Role/profile guards on the loaded keys are explicit (even though three keys are
  unused — M3).
* **Profile validation happens before composition.** `kernel/bootstrap.ts:9-21` reads and asserts
  the deployment profile, logs it, filters the environment, then loads configuration, then
  constructs resources only inside a lifecycle that is shut down on failure (`:43-47`).
  `config/deployment-profile.ts:34-37` makes unimplemented isolated profiles fail closed.
* **Job-store isolation is fail-closed for worker/scheduler.**
  `composition/register-runtimes.ts:50-57` throws when `REDIS_BULLMQ_URL` is absent, and
  `config/environment.ts:440-445,960` only shares the cache Redis when
  `ALLOW_SHARED_BULLMQ_REDIS` is explicitly true (default `env === "local"`).
  `bootstrap.ts:18-21` additionally asserts a dedicated job store for the scheduler.
  `register-runtimes.ts:169-218` admits plane-scoped job transactions and refuses unserved planes.
* **Unserved-plane credentials and connections are stripped.**
  `kernel/deployment-environment.ts:26-45` deletes plane-owned settings and
  `composition/infrastructure/database-selection.ts:9-57` nulls unserved connection strings and
  worker/invalidation URLs; IAM composition restricts authentication to the served planes
  (`composition/shared/identity/authority.ts:98-99` → `plane-admission.ts:10-12`), and the
  `/api/iam/contexts` handler re-checks the plane (`register-platform.ts:762`).
* **Dev-only tooling has strict allow-list guards.**
  `development/publication.ts:134-151` requires `ATHYPER_ENV=local`, `ATHYPER_DEV_PRESET=devfull`,
  `dev.athyper.test`, a small file with no group/world write, and schema/instance checks;
  `packages/services/publication/src/shared/preview/environment.ts:2-12` throws
  `LOCAL_PREVIEW_ENVIRONMENT_REJECTED` unless all three local markers match.
* **Control plane is isolated and dev-only.** `config/control-plane.ts:10-15` requires
  `ATHYPER_ENV=local`, `ATHYPER_INSTANCE=dev`, `dev.athyper.test` and the exact issuer;
  `entrypoints/control-api.ts:16-17` deliberately avoids `main.ts`/bootstrap; `:31-33` refuses a
  superuser/`BYPASSRLS` database role; `:18-23` reads secrets only from `0600` files ≤ 64 KiB and
  `:80-81` documents the all-interface binding as private-network-only.
* **The application `/metrics` route is guarded.** `packages/runtime/http/src/http-runtime.ts:194-202`
  rejects forwarded requests and non-loopback sources unless the exporter is on the internal
  listener.
* **DDL privilege-hygiene controls exist and work while they run.**
  `server/db/ddl/common/shared/99_security_definer_hardening.sql:30-52` revokes `EXECUTE ... FROM
  PUBLIC`, normalises ownership and raises when a `SECURITY DEFINER` function lacks an explicit
  `search_path`: 235 of the 242 `SECURITY DEFINER` occurrences in `server/db/ddl` have `search_path`
  within the following three lines, and the only three files that mention `SECURITY DEFINER`
  without `search_path` do so in comments; `common/shared/11_grants.sql:1-3` revokes schema/table/function access
  from `PUBLIC` before granting least privilege to `athyperapp` (including `shared.country`, which
  is what the Country read path needs).
* **Country reference data is correctly scoped.** `common/shared/10_rls.sql:11,24,40` enables and
  forces RLS on `shared.country` with an `open_read` SELECT policy for a global ISO-3166 register,
  and write access is limited to the DDL executor (`:78`). Country is global data, so
  `USING (true)` on read is the intended policy, not a tenant-isolation gap.
* **`db-review` harness is coherent.** `server/db/scripts/tests/integration/db-review/run.mjs`
  refuses any container that is not `athyper-db-fix-*`/`athyper-db-review-*` (`:10`), runs against a
  `--network none` tmpfs container (`:37,44-45`), and every relative path it resolves
  (`scripts/provisioning/foundation-runner.ts`,
  `scripts/operations/upgrades/legacy-baseline-20260914/…`) exists. Its SQL siblings, including
  `account-isolation.sql`, all exist.
* **The host's own composition inventory is clean.** Running
  `scripts/verification/inventory-composition.mjs` reports 0 missing imports for 138 non-test
  composition files; `inventory-deleted-exports.mjs` reports no unresolved barrels and no
  consumers importing deleted exports.

# Checked but not a defect

* **`claimContextMode` defaults to `shadow` outside production**
  (`config/environment.ts:392-396`). This is not an escalation path: the accepted identity is
  derived from verified claims (`server/packages/platform/iam/src/iam-service.ts:156-157`), and a
  mismatched `x-tenant-id`/`x-realm` header only produces an audit mismatch
  (`:164-171,87-94`). Shadow mode ignores the caller-supplied header rather than honouring it;
  production defaults to `enforce`.
* **Process metrics listener defaults to `0.0.0.0`**
  (`diagnostics/telemetry/process-metrics-endpoint.ts:15-18`) and worker/scheduler start it
  unconditionally (`composition/runtimes/workers.ts:14-17`, `runtimes/scheduler.ts:50-53`) because
  `registerTelemetry` always creates the registry
  (`composition/infrastructure/telemetry.ts:49-56`). This is deliberate: deploy sets
  `PROCESS_METRICS_PORT=9464` for api/worker/scheduler, attaches them to an internal
  `platform-observability` network and publishes no port
  (`deploy/compose/instance/compose.parity.yaml:88-89,99-101,138-143,185-190`), with the stated
  intent "Private metrics listener".
* **`config.bullMq.url!` in `runtimes/scheduler.ts:24`** cannot be `undefined` at that point:
  `startRuntimes` → `registerRuntimes` throws for scheduler mode without a URL
  (`register-runtimes.ts:50-57`) and is awaited before line 24.
* **`readStudioEnvironment` fallback ordering** prefers `STUDIO_*` over the legacy
  `ATHYPER_PLATFORM_*` key (`environment.ts:266-268`), so a stale legacy key cannot override a
  configured canonical key; the residual risk is the missing-canonical case already reported in L3.
* **`governance/config/governance/authorization-inventory.v1.json` references to
  `db-review/account-isolation.sql`** resolve: the file exists on disk (my first, glob-truncated
  listing was misleading).
* **`packages/planes/neon/business-partner/node_modules`** is stale residue from the deleted
  package (the directory has no `package.json`, so pnpm's `packages/planes/*/*` glob ignores it).
  Build-hygiene only; deleting it is safe but not required.
* **`turbo.json` `test` depends on `^build`, not on the package's own `codegen`** — acceptable for
  the packages in this area (`server/apps/platform-host` has no codegen task), so not reported as a
  defect.

# Mechanical sweep appendix

Import resolution was performed with the TypeScript compiler API
(`ts.resolveModuleName`, `moduleResolution: Bundler`) against the current tree.

`server/apps/platform-host/src/**` + `tests/**` — 413 files, 2,224 specifiers, 5 relative
unresolved, each verified missing on disk:

| File:line | Specifier | Correct target |
| --- | --- | --- |
| `server/apps/platform-host/src/composition/shared/verification/__tests__/routes.test.ts:5` | `../routes.js` | `../../verification.js` |
| `tests/foundation/atlas-record-question.test.ts:3` | `.../composition/shared/ai/atlas-record-question` | `.../composition/spaces/neon/ai/atlas-record-question` |
| `tests/foundation/reference-choice-policy.test.ts:7` | `server/db/scripts/provisioning/business-partner-data-surfaces` | none (deleted) |
| `tests/foundation-browser/bank-editor.spec.ts:5` | `server/db/scripts/provisioning/business-partner-full-profile` | none (deleted) |
| `tests/foundation-browser/fixtures/bp-shared-record.tsx:6` | `packages/planes/neon/business-partner/src/360/components/commercial-controls` | none (deleted) |

The 29 unresolved `@athyper/*` specifiers reported in the same run are a resolver artefact (the
workspace root has no `node_modules/@athyper` links; pnpm links per package). I checked each package
name in that list against `packages/**/package.json` and every one exists, so none is reported.

`server/db/scripts/**` + `server/apps/platform-host/scripts/**` — 224 files, 12 relative/workspace
unresolved, each verified missing:

* the six `__tests__/provisioning` files in H5;
* `server/db/scripts/provisioning/provision-hr-stage2-synthetic-policy.mts:13` and
  `server/db/scripts/tests/integration/hr-stage2-service.mts:6` →
  `server/packages/services/master-data/src/hr-stage2-service.js` (missing);
* `server/db/scripts/tests/integration/neon-onboarding-submission.mts:7,8` and
  `neon-request-review.mts:7` → `kysely-business-partner-case-repository.js` /
  `business-partner-onboarding-cycle.js` (missing).

The four `.mts` probes are orphaned (no `package.json` script or tooling file references them) and
are therefore not run by CI, which is why they are folded into M2/L5 context rather than given
their own finding.
