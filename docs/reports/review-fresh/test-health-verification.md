# Adversarial verification — "test:workspace is red: six server/db provisioning tests import deleted modules"

- **Area:** Test-suite health, coverage gaps and CI gates
- **Claimed severity:** high
- **Verdict:** **confirmed**
- **Verified severity:** **high**
- **Verifier scope:** read-only; no source file modified (`git status --porcelain server/db/` is clean).

## Cited code is present and line numbers are exact

| Claim citation | Actual content | Status |
| --- | --- | --- |
| `business-partner-labels.test.ts:4` | `import { withBusinessPartnerLabels } from "../../provisioning/business-partner-labels";` | exact |
| `business-partner-r2-fixtures.test.ts:3` | `import { buildR2DatabaseFixtures } from "../../provisioning/provision-business-partner-r2-fixtures.js";` | exact |
| `business-partner-r5-fixtures.test.ts:6` | `} from "../../provisioning/provision-business-partner-r5-fixtures.js";` | exact (end of import block) |
| `business-partner-r7-fixtures.test.ts:4` | `import { buildR7DatabaseFixtures } from "../../provisioning/provision-business-partner-r7-fixtures.js";` | exact |
| `development-business-partner-fixtures.test.ts:4` / `:48` | import of `provision-development-business-partner-fixtures.js` / dynamic import of `development-business-partner-profiles.js` | exact |
| `development-business-partner-runtime.test.ts:5-8` | import block from `provision-development-business-partner-runtime.js` | exact |

Both secondary "read the source by URL" citations are also exact:
`business-partner-r7-fixtures.test.ts:7` → `"../../provisioning/provision-business-partner-r7-fixtures.ts"`;
`development-business-partner-runtime.test.ts:117` → `"../../provisioning/provision-development-business-partner-runtime.ts"`.
Both targets are missing. These reads are moot in practice because the top-level static import throws first, but the claim's characterisation is factually correct.

## The six targets do not exist anywhere

`server/db/scripts/provisioning/` contains none of: `business-partner-labels.ts`,
`provision-business-partner-r2-fixtures.ts`, `provision-business-partner-r5-fixtures.ts`,
`provision-business-partner-r7-fixtures.ts`, `provision-development-business-partner-fixtures.ts`,
`provision-development-business-partner-runtime.ts`, nor the dynamically imported
`development-business-partner-profiles.ts`.

`git ls-tree -r --name-only HEAD -- server/db/scripts/provisioning/ | grep -i business-partner` → **empty**.
This is not a working-tree-only deletion; the modules are absent from HEAD.

`git log --diff-filter=D -1` attributes all six deletions to `870f08f52` ("cleanup: remove bespoke business
partner and workforce", Tue Sep 29 15:24:07 2026) — the same commit the claim names.

## Reproduced the exact defect

Single cited file (`server/db`):

```
npx tsx --test scripts/__tests__/provisioning/business-partner-labels.test.ts
→ Error [ERR_MODULE_NOT_FOUND] ... url: 'file:///.../server/db/scripts/provisioning/business-partner-labels'
  ℹ tests 1  ℹ pass 0  ℹ fail 1
EXIT=1
```

All six files together: `ℹ tests 6  ℹ pass 0  ℹ fail 6`, six distinct `ERR_MODULE_NOT_FOUND` errors, `EXIT=1`.
The error URLs land under `server/db/scripts/provisioning/`, matching the relative specifiers.

## The consequence reaches the CI gate

No guard, transaction, validation or exclusion one layer away prevents this:

1. `server/db/package.json` (`test`) is `tsx --test scripts/__tests__/**/*.test.ts`. Without `globstar`, `**`
   behaves as `*`, so the glob expands to `scripts/__tests__/<dir>/*.test.ts`. Verified expansion lists all six
   files among 38 collected tests.
2. `turbo.json` declares no filter/ignore on the `test` task, and `server/db` is an active pnpm workspace
   (`pnpm-workspace.yaml` → `server/db`), so `turbo test` runs it.
3. `.github/workflows/ci.yml:120` runs `pnpm run test:workspace -- --coverage`; `test:workspace` is
   `turbo test`.
4. `test:repo` is `pnpm test:workspace && pnpm test:root`, so the failure short-circuits at the first clause.

The `test:reachability` gate does **not** catch this: `tooling/scripts/testing/verify-test-reachability.mjs:186-192`
only errors when an active workspace package has test files but **no** `test` script. `server/db` has one, so the
six orphaned files pass silently. That gate also runs inside `test:root`, downstream of the failure.

## Corrections / scope notes (do not overturn the finding)

1. **The proposed fix is necessary but not sufficient for repo hygiene.** Deleting the six test files clears the
   `test:workspace` failure, but the same cleanup left dangling references in `server/db/package.json`:
   - `:196` export `"./test-fixtures/business-partner-r2"` → missing `provision-business-partner-r2-fixtures.ts`
   - `:60`, `:62`, `:64`, `:65`, `:148` (`db:provision:neon:business-partner-runtime` / `-fixtures` / `-r2-fixtures`
     / `-r7-fixtures` / `-r5-fixtures`) → missing modules
   These are ad-hoc script/export entries, not invoked by the `test` script, so they do not affect the claimed
   consequence or severity. The dangling export has no consumers (searched `apps/`, `packages/`, `server/`,
   `tests/`, `tooling/`), so impact is low.
2. **No product/runtime impact.** This is purely a test-infrastructure defect: it does not affect the shared Entity
   Framework, the Country entity route, server-enforced scope, or authorization. The claim asserts no product
   impact, so this is a scoping clarification, not a downgrade. The claimed consequence (a required CI gate
   unconditionally failing) is directly reachable and deterministic, which is what makes "high" appropriate —
   the usual "unreachable defect" discount does not apply because reachability here is the CI gate itself.

## Evidence index

- `server/db/scripts/__tests__/provisioning/business-partner-labels.test.ts:4`
- `server/db/scripts/__tests__/provisioning/business-partner-r2-fixtures.test.ts:3`
- `server/db/scripts/__tests__/provisioning/business-partner-r5-fixtures.test.ts:6`
- `server/db/scripts/__tests__/provisioning/business-partner-r7-fixtures.test.ts:4,7`
- `server/db/scripts/__tests__/provisioning/development-business-partner-fixtures.test.ts:4,48`
- `server/db/scripts/__tests__/provisioning/development-business-partner-runtime.test.ts:5-8,117`
- `server/db/package.json:38` (`test`), `:60,62,64,65,148,196`
- `turbo.json` (`test` task)
- `.github/workflows/ci.yml:120`
- `package.json` (`test:workspace`, `test:repo`)
- `tooling/scripts/testing/verify-test-reachability.mjs:186-192`

---

# Adversarial verification — "test:workspace is red: platform-host verification routes test was not updated by the in-progress refactor"

- **Area:** Test-suite health, coverage gaps and CI gates
- **Source finding:** `docs/reports/review-fresh/test-health.md` §1c (lines 121–141)
- **Claimed severity:** high
- **Verdict:** **confirmed**
- **Verified severity:** **high** (with one correction to the proposed fix)
- **Verifier scope:** read-only; no source file modified. This verdict covers §1c only — §1a/§1b (the six `server/db` provisioning tests) are addressed by the section above.

## Cited code is present and the line number is exact

| Claim | Verified | Evidence |
| --- | --- | --- |
| `routes.test.ts:5` = `import { executeVerification } from "../routes.js";` | ✅ exact | `server/apps/platform-host/src/composition/shared/verification/__tests__/routes.test.ts:5` |
| `verification/` contains only `__tests__/` | ✅ | `find verification -type f` → only `verification/__tests__/routes.test.ts` |
| Source present in HEAD, deleted in the worktree | ✅ | `git cat-file -e HEAD:.../verification/routes.ts` → present; `git status --porcelain` → ` D .../verification/routes.ts` |
| Replaced by untracked `shared/verification.ts` | ✅ | `git status --porcelain` → `?? server/apps/platform-host/src/composition/shared/verification.ts` |
| Siblings at lines 3–4 resolve; only line 5 broken | ✅ | A scripted scan of **all 92 relative imports** across platform-host `*.test.ts` found exactly **1** unresolved — this one. |

## Reproduced the exact defect

```
$ cd server/apps/platform-host && npx vitest run src/composition/shared/verification/__tests__/routes.test.ts
 FAIL  src/composition/shared/verification/__tests__/routes.test.ts (0 test)
Error: Cannot find module '../routes.js' imported from .../verification/__tests__/routes.test.ts
 ❯ src/composition/shared/verification/__tests__/routes.test.ts:5:1
 Test Files  1 failed (1)   Tests  no tests
EXIT=1
```

## The consequence reaches the CI gate

1. `server/apps/platform-host/package.json` → `"test": "vitest run"`.
2. `server/apps/platform-host/vitest.config.ts:7` → `include: ["src/**/*.test.ts", "scripts/**/*.test.ts"]`; no `exclude`, so the stale file **is** collected. The file is tracked (`git ls-files --error-unmatch` succeeds).
3. Root `package.json` → `"test:workspace": "turbo test"`; `pnpm-workspace.yaml` includes `server/apps/*`.
4. `turbo run test --filter=@athyper/server-platform-host --dry=json` lists the package's `test` task.
5. `.github/workflows/ci.yml:119-123`, job **Quality Gate** (unconditional, `runs-on: ubuntu-latest`): `run: pnpm run test:workspace -- --coverage`. A non-zero vitest exit fails the step.
6. Turbo cannot cache past it: the `test` task `inputs` include `src/**` (`turbo.json:24-27`) and `routes.ts` was deleted, so the hash misses.

## Refutation attempts that failed

1. **A guard/exclusion prevents collection** — no such `exclude` exists in the local vitest config.
2. **Behaviour moved elsewhere, test is redundant** — repo-wide grep for `executeVerification` returns only the stale test and the new module; `registerVerification`/`VerificationRun` appear in no other `*.test.ts`. The new module has no self-tests. Deleting the file would drop real coverage (functional document/search/cache/mail probes and artifact race/authorization `it.each` cases).
3. **Pervasive breakage makes this not a discrete finding** — the scan shows it is the **only** unresolved relative import of 92 in this package: isolated, not noise.
4. **The moved module changed behaviour, so a path fix would not help** — `diff HEAD:.../verification/routes.ts verification.ts` shows only the two relative-import depths and the `PlaneKey` source (`type PlaneKey = "studio" | "neon" | "mesh"` → import from `@athyper/server-foundation/context`). Runtime behaviour is otherwise identical.
5. **Unreachable / no runtime impact ⇒ downgrade** — the shipped Country route and shared Entity Framework are unaffected (this is an ops verification endpoint). But the finding's area is explicitly CI health, and the failure is deterministic and gates every run, so `high` stands. The "unreachable defect" discount does not apply.

## Correction — the proposed fix is wrong

`test-health.md:139` proposes `../verification.js`. From `verification/__tests__/routes.test.ts`, that resolves to
`.../shared/verification/verification.js`, which **does not exist** (the new module is `.../shared/verification.ts`).
Applying the stated fix verbatim would still fail. Correct options:

- Keep the test where it is → `import { executeVerification } from "../../verification.js";`
- Or move the test to `shared/__tests__/verification.test.ts`, in which case `"../verification.js"` becomes correct (the move was not stated).

## Evidence index

- `server/apps/platform-host/src/composition/shared/verification/__tests__/routes.test.ts:5` (plus `:3-4` for the resolving siblings)
- `server/apps/platform-host/src/composition/shared/verification.ts:194` (`executeVerification` in the new module)
- `server/apps/platform-host/vitest.config.ts:7`
- `server/apps/platform-host/package.json` (`test`)
- `turbo.json:24-27`
- `package.json` (`test:workspace`, `test:repo`)
- `.github/workflows/ci.yml:119-123`
- `pnpm-workspace.yaml`

---

# Adversarial verification — "test:workspace is red: three meta-entity-authoring tests import modules deleted in 870f08f52"

- **Area:** Test-suite health, coverage gaps and CI gates
- **Claimed severity:** high
- **Verdict:** **confirmed**
- **Verified severity:** **high**
- **Verifier scope:** read-only; no source file modified. The only write was to `/tmp/verif-cache` (vitest
  `cacheDir` redirected there so the reproduction could not touch `node_modules/.vite`); `packages/.../node_modules/.vite`
  kept its pre-existing Sep 27 mtime.

## 1. Cited code is present and the line numbers are exact

| Claim citation | Actual content | Status |
| --- | --- | --- |
| `intake-presentation.test.ts:3` | `import { publishedBusinessPartnerIntakeOverlay } from "../intake-presentation.js";` | exact |
| `configuration-editor-qualification.test.ts:2` | `import { configurationEdit } from "../../../../../../../packages/planes/studio/business-partner/src/composition-configuration";` | exact |
| `configuration-editor-qualification.test.ts:3` | `import { configurationFixture } from ".../composition-configuration.fixture";` | exact |
| `structural-editor-qualification.test.ts:2` | `import { structuralEdit } from ".../composition-structure";` | exact |
| `structural-editor-qualification.test.ts:3` | `import { graph } from ".../composition-structure.fixture";` | exact |

All three files are tracked (`git ls-files` lists all three), so this is not a working-tree artefact.

## 2. The target modules are genuinely absent

- `server/packages/planes/studio/meta-entity-authoring/src/intake-presentation.ts` does not exist;
  `find ... -name 'intake-presentation*'` returns only the test file.
- The `../../../../../../../` traversal resolves to the **repo-root** `packages/`, not `server/packages/`:
  `realpath -m` → `/home/.../athyper/packages/planes/studio/business-partner/src/composition-configuration`.
  `packages/planes/studio/business-partner/` contains **only** `node_modules` — no `src/`, no `package.json`. The
  claim states this correctly.
- `git show --name-status 870f08f52` ("cleanup: remove bespoke business partner and workforce") deletes
  `server/.../meta-entity-authoring/src/intake-presentation.ts` plus
  `packages/planes/studio/business-partner/src/composition-configuration{,.fixture,.test}.ts` and
  `composition-structure{,.fixture,.test}.ts`. The history attribution is correct (the claim says "four paths";
  it is five files — a harmless miscount).
- `publishedBusinessPartnerIntakeOverlay` survives **only** inside the orphaned test; a repo-wide grep finds no
  definition anywhere (`configurationEdit` / `structuralEdit` likewise have no definition). The remaining hit on
  `server/apps/platform-host/dist/composition/dev-publication.js:222` is a stale compiled artefact, not source.

## 3. Reproduced the exact defect (all three suites fail to collect)

`vitest list` / `vitest run` using the package's own include (`vitest.config.ts` → `src/**/*.test.ts`) and an
isolated `cacheDir`, **without passing file paths**, collected and failed exactly these three files:

```
FAIL src/__tests__/configuration-editor-qualification.test.ts [ ... ]
Error: Cannot find module '../../../../../../../packages/planes/studio/business-partner/src/composition-configuration'
FAIL src/__tests__/intake-presentation.test.ts [ ... ]
Error: Cannot find module '../intake-presentation.js'
FAIL src/__tests__/structural-editor-qualification.test.ts [ ... ]
Error: Cannot find module '../../../../../../../packages/planes/studio/business-partner/src/composition-structure'
Test Files  3 failed (3)   Tests  no tests
```

This confirms the claim's "all three files are collected" precisely: resolution fails at collect time, and no
name/`include` filter excludes them.

## 4. No guard prevents the consequence from reaching the required CI gate

1. `server/packages/planes/studio/meta-entity-authoring/package.json:24` → `"test": "vitest run"`; the package is
   an active workspace member via `pnpm-workspace.yaml` (`server/packages/planes/studio/*`).
2. `server/packages/planes/studio/meta-entity-authoring/vitest.config.ts:2` → `include: ["src/**/*.test.ts"]`; all
   three files live under `src/__tests__/` and match. There is no `exclude`.
3. `turbo.json` (`test` task) applies no filter/ignore, so `turbo test` runs it.
4. `.github/workflows/ci.yml:120` runs `pnpm run test:workspace -- --coverage` (the "Workspace tests with coverage"
   step of the **quality** gate, triggered on `pull_request` and on push to `main`/`develop`), and
   `package.json` defines `test:workspace` as `turbo test`. `test:repo` is
   `pnpm test:workspace && pnpm test:root`, so it short-circuits here — the claim's CI consequence is real.
5. `test:reachability` cannot catch this: it only flags a package with test files but **no** `test` script
   (`tooling/scripts/testing/verify-test-reachability.mjs`), and it runs downstream in `test:root`.

## 5. Corrections / scope notes (none overturn the finding)

1. **The proposed fix is directionally right but should cite successor coverage.** Both studio
   `business-partner` authoring capabilities (`configurationEdit`, `structuralEdit`) were bespoke and were
   deleted with no successor, so nothing is lost by deleting those two tests. The `intake-presentation` overlay,
   however, was *superseded*, not merely dropped: the live path is the `intake-prerequisite` overlay in
   `server/apps/platform-host/src/development/publication.ts:338-382` (plus `reusePublishedIntakePrerequisite` at
   `:113`), and the "no intake surfaces published" / descriptor-drift behaviour is now exercised by
   `server/apps/platform-host/src/development/publication.test.ts:237,294,298`.
   A safer fix than bare deletion is therefore: delete
   `configuration-editor-qualification.test.ts` and `structural-editor-qualification.test.ts` outright, and delete
   `intake-presentation.test.ts` only after confirming (as this verification did) that its intent is now covered
   by the `DEV_PUBLICATION_INTAKE_SURFACES_NOT_PUBLISHED` tests — or repoint it to
   `admitDevIntakePrerequisite`. The orphaned file's assertion string `INTAKE_SURFACES_NOT_PUBLISHED`
   (`intake-presentation.test.ts:10`) no longer matches the live error code
   `DEV_PUBLICATION_INTAKE_SURFACES_NOT_PUBLISHED`, which is further evidence the reader/test pair is dead.
2. **Severity "high" is appropriate.** The defect blocks a required PR gate deterministically for every branch;
   the usual "unreachable" discount does not apply because the CI gate *is* the reachability path. It has no
   product/runtime impact on the Country route or the shared Entity Framework, matching the claim's framing.
3. **Related, separate CI breakage (out of scope, not part of this claim):** `.github/workflows/ci.yml:126` runs
   `pnpm qualify:business-partner-r9`, a script defined in **no** `package.json` in the repo (grep over all
   `package.json`). Even after the three suites are removed, the same quality job still appears to fail at that
   step. Worth a separate finding; it does not change this verdict.

## Evidence index

- `server/packages/planes/studio/meta-entity-authoring/src/__tests__/intake-presentation.test.ts:3,10`
- `server/packages/planes/studio/meta-entity-authoring/src/__tests__/configuration-editor-qualification.test.ts:2,3`
- `server/packages/planes/studio/meta-entity-authoring/src/__tests__/structural-editor-qualification.test.ts:2,3`
- `server/packages/planes/studio/meta-entity-authoring/package.json:24` (`test`)
- `server/packages/planes/studio/meta-entity-authoring/vitest.config.ts:2` (`include`)
- `pnpm-workspace.yaml` (`server/packages/planes/studio/*`), `turbo.json` (`test` task)
- `.github/workflows/ci.yml:120` (`test:workspace`), `:126` (undefined `qualify:business-partner-r9`)
- `package.json` (`test:workspace`, `test:repo`)
- `git show --name-status 870f08f52`
- `server/apps/platform-host/src/development/publication.ts:113,338-382`
- `server/apps/platform-host/src/development/publication.test.ts:237,294,298`

---

# Adversarial verification — "test:reachability is red: 16 root-owned test files violate the reachability gate"

- **Claimed severity:** high
- **Verdict:** **confirmed** (severity high upheld)
- **Verifier scope:** read-only; no source file modified. Reproduced against the current working tree.

## Cited code is present and the line number is exact

`tooling/scripts/testing/verify-test-reachability.mjs:172-178` matches the quote verbatim:

```
172	  if (packageDirectory === root) {
173	    const runner = rootRunnerFor(path);
174	    if (!runner) {
175	      errors.push(
176	        `${path}: root-owned tests must live under tests/contracts, tooling/scripts/policy, or tooling/scripts/performance`,
177	      );
178	      continue;
```

`ROOT_RUNNERS` is indeed at lines 23-74 and contains **no** entry for `tooling/scripts/local-dev` or
`tooling/scripts/metadata` (it lists `tests/contracts`, `tests/foundation`, `tooling/scripts/policy`,
`tooling/scripts/performance`, `tooling/tools/scripts`, `tooling/scripts/verification`, `tooling/scripts/release`,
`tooling/scripts/rehearsal`, `tooling/scripts/acceptance`, `deploy/compose/tests`). The citation is correct.

## Reproduced the exact defect

`pnpm test:reachability` (and the raw `node ... --check`) exits **1** with exactly **16** occurrences of
`root-owned tests must live under ...`:

- 15 × `tooling/scripts/local-dev/*.test.mjs` (`candidate-snapshot`, `candidate`, `dev-publish`, `dev-workspace`,
  `lifecycle`, `metadata-set`, `network-read-grant`, `publication-recovery-preflight`, `qa-runtime`, `qa-session`,
  `reconcile-bp-operation-catalog`, `runner`, `runtime-qualification-checks`, `separate-checkout`, `watch-runtime`)
- 1 × `tooling/scripts/metadata/check-layout.test.mjs`

Ownership is genuinely the root manifest: `tooling/`, `tooling/scripts/`, `tooling/scripts/local-dev/` and
`tooling/scripts/metadata/` all have **no** `package.json` (the only manifests under `tooling/` are
`tooling/config/package.json` and `tooling/tsconfig/package.json`), so `nearestPackageDirectory`
(`:136-145`) walks up to `root` and `packageDirectory === root` is true. Both test directories are tracked in git
(`git ls-files` returns 16), so this is committed state, not a transient untracked tree.

## The consequence reaches the required CI gate

- `package.json:62` — `test:reachability` = the failing `--check` invocation.
- `package.json:66` — `test:root` = `pnpm test:reachability && pnpm test:plane-contracts && ... && pnpm test:country-browser && ...`,
  i.e. reachability is **first**; `&&` short-circuits so `test:plane-contracts`, `test:foundation`,
  `test:country-browser` and the rest never execute in that invocation.
- `package.json:47,67` — `test` -> `test:repo` -> `test:workspace && test:root`, so `test:root` is the second half.
- `.github/workflows/ci.yml:128-130` — step "Root tests and reachability" runs `pnpm run test:root`. It sits in the
  `quality` job (starts `:48`) and carries **no** `continue-on-error` (the only such flags in that file are
  `:205`, `:215`, `:280`, none of which apply to this step). The step is blocking.

## Refutation attempts that failed

1. **"Maybe another runner executes these 16 files."** `test:local-runner` (`package.json:17`) would cover exactly
   the 15 `local-dev` files, but a repo-wide grep finds it referenced **only** inside a help/console string in
   `tooling/scripts/local-dev/cli.mjs:57` — it is absent from `test:root`, `test:workspace`, `test:repo` and every
   `.github/workflows/*.yml`. `tooling/scripts/metadata/check-layout.test.mjs` is covered by **no** runner at all:
   `metadata:check-layout` (`package.json:13`) executes `check-layout.mjs`, not the test, and
   `.github/workflows/bp-artifact-schema-gate.yml:19` likewise runs `check-layout.mjs`. The invocation is not
   covered.
2. **"Maybe the retirement report already whitelists them."** `governance/policy/reports/test-reachability-retirement.json`
   lists neither directory: no `local-dev`/`metadata` entry among its `rootTests` paths. They are undocumented
   orphans.
3. **"Maybe CI is red for unrelated reasons anyway, or the step is advisory."** The step is blocking and the check
   reaches its own error path deterministically; the failure is upstream of any workspace enumeration concern.
4. **"Maybe the Country qualification runs elsewhere in CI, so the impact is overstated."** False — it strengthens
   the claim: `grep` over all `.github/` finds **no** invocation of `test:country-browser` or any
   `foundation-browser` config in any workflow. The only path to the Country browser qualification in CI is
   `test:root` (`ci.yml:130`), which this failure short-circuits.
5. **"Unreachable defect."** Not applicable: the CI gate is itself the reachability path and runs on every PR.

## Corrections / nuances (none overturn the verdict)

1. **The gate's own error message understates the allowed set.** `:176` names only `tests/contracts`,
   `tooling/scripts/policy`, `tooling/scripts/performance`, but `ROOT_RUNNERS` (`:23-74`) also admits
   `tests/foundation`, `tooling/tools/scripts`, `tooling/scripts/verification|release|rehearsal|acceptance`, and
   `deploy/compose/tests`. The finding quotes the message accurately; the message itself is misleading and should
   be derived from `ROOT_RUNNERS`.
2. **The proposed fix as written is incomplete for `metadata`.** "`tooling/scripts/metadata` -> its runner" presumes
   a runner that does not exist — no script anywhere globs `tooling/scripts/metadata/*.test.mjs`. A new script is
   required (or the file must move into a workspace package). Additionally, adding a `ROOT_RUNNERS` entry alone is
   not sufficient: `:204-210` require the named script to exist **and** contain the `commandFragment`, and `:216-218`
   require `test:root` to invoke that runner. So the full fix is: add/extend the runner scripts, add both
   `ROOT_RUNNERS` entries, add both runners to `test:root`, then re-run `test:reachability:update` to regenerate
   the retirement report.
3. **Severity "high" is appropriate.** A required, blocking PR gate fails deterministically at its first command,
   suppressing three downstream root suites including the Country browser qualification. This is test/CI-health
   impact only; it does not itself break the shipped `/app/entity/country/` route at runtime, which the claim
   correctly frames as "the qualification never executes" rather than a product defect.

## Evidence index

- `tooling/scripts/testing/verify-test-reachability.mjs:23-74,136-145,172-178,204-221,254-258`
- `package.json:13,17,47,62,63,66,67`
- `.github/workflows/ci.yml:48,128-130` (blocking step; no `continue-on-error`)
- `tooling/scripts/local-dev/cli.mjs:57` (only reference to `test:local-runner`)
- `tooling/scripts/metadata/check-layout.test.mjs:15`; `.github/workflows/bp-artifact-schema-gate.yml:19`
- `governance/policy/reports/test-reachability-retirement.json` (no `local-dev`/`metadata` entries)
- `git ls-files tooling/scripts/local-dev/*.test.mjs tooling/scripts/metadata/check-layout.test.mjs` -> 16 tracked files
- Reproduced: `pnpm test:reachability` -> exit 1, 16 `root-owned tests` errors
- Whole-`.github/` grep: no `test:country-browser` / `foundation-browser` invocation exists

---

# Adversarial verification — "test:foundation is red: two committed tests import modules that do not exist"

- **Area:** Test-suite health, coverage gaps and CI gates
- **Claimed severity:** high
- **Verdict:** **partial**
- **Verified severity:** **medium**
- **Verifier scope:** read-only; no source file modified.

## 1. Cited code is present and the line numbers are exact

| Claim citation | Actual content | Status |
| --- | --- | --- |
| `tests/foundation/atlas-record-question.test.ts:3` | `import { atlasRequestsRecordOverview } from "../../server/apps/platform-host/src/composition/shared/ai/atlas-record-question";` | exact |
| `tests/foundation/reference-choice-policy.test.ts:7` | `import { withBusinessPartnerReferenceHistory } from "../../server/db/scripts/provisioning/business-partner-data-surfaces";` | exact |
| `package.json:77` | `"test:foundation": "tsx --tsconfig tooling/config/tsconfig-react.json --test tests/foundation/*.test.ts tests/foundation/*.test.tsx"` | exact |

Both test files are committed and individually clean: `git cat-file -e HEAD:<path>` succeeds and
`git status --porcelain <path>` is empty for both. The `shared/` listing in the claim is also literally correct
for the working tree (`ls server/apps/platform-host/src/composition/shared/` → collaboration, documents,
entity-governance, entity-runtime, identity, publication, verification, verification.ts).

## 2. Reproduced the exact defect (EXIT=1 for both files)

```
npx tsx --tsconfig tooling/config/tsconfig-react.json --test tests/foundation/atlas-record-question.test.ts
→ Error: Cannot find module '.../shared/ai/atlas-record-question'   ℹ tests 1  ℹ pass 0  ℹ fail 1  EXIT=1
npx tsx --tsconfig tooling/config/tsconfig-react.json --test tests/foundation/reference-choice-policy.test.ts
→ Error: Cannot find module '.../provisioning/business-partner-data-surfaces'  ℹ tests 1  ℹ pass 0  ℹ fail 1  EXIT=1
```

Both files are matched by the `tests/foundation/*.test.ts` glob on `package.json:77`, and `node --test` exits
non-zero when any collected file fails to load. So "test:foundation cannot collect these files" is reproduced
in the current working tree.

## 3. Correction 1 — the atlas module EXISTS at HEAD; it is a working-tree-only deletion

`shared/ai/atlas-record-question.ts` is committed:

```
git ls-tree HEAD server/apps/platform-host/src/composition/shared/ai/
→ 100644 blob 4afc1ddef4e538d557184ee7dff96357bf24bedb  .../shared/ai/atlas-record-question.ts   (plus 4 siblings + __tests__)
git cat-file -e HEAD:server/apps/platform-host/src/composition/shared/ai/atlas-record-question.ts   → exit 0
git status --porcelain -- server/apps/platform-host/src/composition/shared/ai/
→ 9x " D" including atlas-record-question.ts (unstaged deletions, not committed)
git status --porcelain -- server/apps/platform-host/src/composition/spaces/neon/ai/   → "??" (untracked, absent at HEAD)
diff <(git show HEAD:...shared/ai/atlas-record-question.ts) server/.../spaces/neon/ai/atlas-record-question.ts → identical
```

The working copy is byte-identical to the HEAD module, and a dynamic import of it satisfies **all 7 assertions**
in the test (verified). Therefore, at a clean checkout of HEAD, `atlas-record-question.test.ts` resolves and
passes; the failure is produced solely by the working tree's in-progress move (`shared/ai` → `spaces/neon/ai`)
that deleted the old module and added an untracked identical copy without updating the test's import path.

Only `reference-choice-policy.test.ts` is a genuine committed orphan: `business-partner-data-surfaces.ts` is
absent from HEAD (`git cat-file -e` fails) and was deleted by `870f08f52` ("cleanup: remove bespoke business
partner and workforce"); `withBusinessPartnerReferenceHistory` exists nowhere in the repo. The claim's
"two committed tests import modules that do not exist" is thus true for one of the two files only.

## 4. Correction 2 — `test:root` does not fail "at this step"; it fails earlier

`package.json:66` is
`"test:root": "pnpm test:reachability && pnpm test:plane-contracts && pnpm test:policy && pnpm test:performance-guards && pnpm test:foundation && pnpm test:country-browser && pnpm test:tools && pnpm test:operations"`,
and `.github/workflows/ci.yml:130` runs `pnpm run test:root`. But the **first** command, `test:reachability`,
already fails:

```
pnpm run test:reachability  →  EXIT=1
- tooling/scripts/local-dev/candidate.test.mjs: root-owned tests must live under tests/contracts, ...  (16 errors)
- tooling/scripts/metadata/check-layout.test.mjs: root-owned tests must live ...
```

Those files are committed and clean (`git ls-files` confirms tracking; `git status --porcelain` is empty), the
root `package.json` is clean, and the retirement report is clean, so this failure is independent of the two
cited test files and localised before them. `test:root` therefore short-circuits at `test:reachability` and never
reaches `test:foundation`. The outcome the claim asserts (the Country browser qualification never runs) is true,
but the stated cause/step is wrong: removing/repointing the two files would not restore `test:country-browser`.

Secondary, same gate: the committed `governance/policy/reports/test-reachability-retirement.json` (clean vs HEAD)
lists only 31 of the 61 existing `tests/foundation` test files and does not mention
`reference-choice-policy.test.ts`, so the "Retirement report is stale" check
(`verify-test-reachability.mjs:272`) is also latent once the 16 errors above are fixed.

## 5. Corrections to the proposed fix

1. **Do not delete `atlas-record-question.test.ts`.** Its target exists at HEAD and its module is byte-identical
   in the working tree; the test is valid coverage. Correct fix: repoint the import to the moved module
   (`.../spaces/neon/ai/atlas-record-question`), or finish the refactor by updating the test alongside the move.
2. **`reference-choice-policy.test.ts` genuinely needs the second half removed/replaced** (no replacement export
   exists), but its first half (`parseRecentChoicePolicy`, `parseEntityIntakeSurfaces` from
   `packages/contracts/platform/entity-runtime/src/index`) still resolves; deleting the whole file also discards
   that live coverage.
3. **Neither fix makes `test:root` green** while `test:reachability` fails first.

## 6. Why partial and not confirmed

The underlying defect is real and deterministic: `test:foundation` cannot collect at least one committed test
file, so that gate step is red. But the finding (a) overstates scope — one of the two cited modules exists at
HEAD and the breakage is an uncommitted working-tree move, leaving exactly one true committed orphan;
(b) overstates the consequence chain — `test:root` fails one step earlier at `test:reachability`, so these files
are not the operative cause of the blocked Country browser qualification; and (c) proposes deleting valid
coverage for the atlas test. Medium rather than high: a genuine, reproducible test-collection/CI-gate defect, but
not the blocker it is described as, with part of its cited scope being a working-tree artifact.

## Evidence index

- `tests/foundation/atlas-record-question.test.ts:3,10,19`
- `tests/foundation/reference-choice-policy.test.ts:7,77,92`
- `package.json:66` (`test:root`), `package.json:77` (`test:foundation`)
- `.github/workflows/ci.yml:128-130`
- `git ls-tree HEAD server/apps/platform-host/src/composition/shared/ai/` → atlas-record-question.ts present
- `git status --porcelain -- server/apps/platform-host/src/composition/shared/ai/` → 9 unstaged ` D`
- `git status --porcelain -- server/apps/platform-host/src/composition/spaces/neon/ai/` → `??`
- `server/apps/platform-host/src/composition/spaces/neon/ai/atlas-record-question.ts:3`
- `git log --oneline --diff-filter=D -1 -- server/db/scripts/provisioning/business-partner-data-surfaces.ts` → `870f08f52`
- `tooling/scripts/testing/verify-test-reachability.mjs:254-257`, `:265-275`
- `tooling/scripts/local-dev/candidate.test.mjs` (tracked, clean)
- `governance/policy/reports/test-reachability-retirement.json` (31/61 foundation entries)

# Adversarial verification — "policy:i18n is red because its assertion reads the wrong DDL file, and the gate is not wired to CI"

Verdict: **CONFIRMED** (severity high upheld: permanently red gate + zero CI enforcement).
Both halves of the finding reproduced from current source. No guard one layer away neutralises it.

## 1. Cited code is present and the line numbers are exact

`tooling/scripts/policy/verify-i18n-foundation.mjs:24-25` (read directly, 38 lines total):

```js
24: const localePolicy = read("server/db/ddl/common/control/03_tables.sql");
25: if (!localePolicy.includes("fallback_locale_code") || !localePolicy.includes("enabled_locale_codes")) violations.push("canonical plane policy storage must retain locale fallback and enablement controls");
```

The quoted code and the cited line number are exact.

## 2. Reproduced the exact defect (EXIT=1)

```
$ node tooling/scripts/policy/verify-i18n-foundation.mjs; echo "EXIT=$?"
i18n foundation policy failed:
- canonical plane policy storage must retain locale fallback and enablement controls
EXIT=1
```

Exactly one violation, verbatim the message quoted in the finding — the gate has a single failure mode, so
the stale DDL path alone accounts for the entire red state.

## 3. The columns genuinely live in a different file

`server/db/ddl/common/control/03_tables.sql` does **not** contain either column name. It contains
`control.ui_locale_catalog` (line 1433) and `master.tenant_locale_activation` (line 1471), whose locale
control is `default_enabled` / `fallback_enabled` / `english_fallback` (lines 1487-1491) — not the
tenant-profile policy columns the gate asserts.

The asserted columns are in `server/db/ddl/common/master/03_platform_tables.sql:67-69` inside
`master.tenant_profile` (declared line 55):

```
67: enabled_locale_codes text[] NOT NULL DEFAULT ARRAY['en']::text[],
68: default_locale_code text NOT NULL DEFAULT 'en',
69: fallback_locale_code text NOT NULL DEFAULT 'en',
```

Enforced further by `tenant_profile_locale_policy_chk` at lines 79-85. That same file is already read by
the gate at line 28 for the unrelated boundary assertion, so the fix is a one-token change.

Empirical check that the proposed fix turns the gate green (in-memory union, no files written):

```
union has fallback_locale_code: true
union has enabled_locale_codes: true
master-only has fallback_locale_code: true
```

Note the finding's supporting line numbers **1433/1471/67-69 are all correct** as quoted.

## 4. The gate is invisible to CI — confirmed on both paths

Static-policy profiles: `governance/config/governance/static-policy-profiles.json` contains four profiles
(`workspace`, `release`, `ci`, `wave1`). `policy:i18n` appears in **none** of them. `policy:static`
(`package.json:224`) resolves to `run-static-policies.mjs --profile ci`, and
`.github/workflows/ci.yml:82` is the only CI invocation of static policies.

Lint path: `.github/workflows/ci.yml:103` runs `pnpm run lint:errors`, while `package.json:37` is
`"lint": "pnpm policy:i18n && turbo lint"` and `package.json:40` is `"lint:errors": "turbo run lint"`.
A repo-wide search for a bare `pnpm lint` / `pnpm run lint` invocation outside `lint:errors` finds only
`README.md:86` (docs) and pre-existing review reports — no workflow, no `.githooks` hook (pre-commit only
guards protected branches and brand assets; pre-push only runs `brand:verify` plus five drift checks, none
of them `policy:i18n`).

Consequence is therefore worse than "CI blind": `pnpm lint` hard-fails for every developer because of the
`&&`, while CI is structurally incapable of seeing the gate in either invocation.

## 5. Refutation attempts that failed

- **Is another gate covering the same assertions?** No static policy script re-asserts the shell catalog
  fallback, `[dir=rtl] .athyper-shell__rail` / `translateX(105%)` geometry, the `localePolicy.enabledLocales`
  constraint, or the `shared.locale` DDL boundary; `grep` for those literals under `tooling/` matches only
  this gate (plus a browser-entry fixture).
- **Does a meta-test force every `policy:*` script into a profile?** No. `run-static-policies.mjs` only
  validates the *listed* names exist; `policy:i18n`, `policy:metadata-semantic-fallbacks`,
  `policy:no-legacy-schema-refs` and ~30 others are legitimately absent from all profiles.
- **Is it declared retired/superseded?** No. `docs/architecture/application-experience/localization-guidance-and-build-plan.md:33`
  explicitly lists it as "Existing verification ... Extend these checks; remove assumptions tied to old
  file locations" — the repo's own plan assumes the gate works.
- **Is this a transient working-tree artifact?** No. `git blame` shows lines 24-29 unchanged since the
  gate's introduction (`88c7c651d8`, 2026-09-04), while the columns entered
  `master/03_platform_tables.sql` earlier (`8bd57bbdc2`, 2026-08-26). The gate was born broken and has
  never been green.

## 6. Corrections / nuances (none overturn the verdict)

1. **The impact statement is slightly overstated, not the severity.** "A genuine future regression in
   locale policy would go undetected" is not precise: the gate's DDL assertion is a pure string-presence
   check that never validates column semantics, so even green it adds almost no regression protection
   beyond what already exists (Kysely codegen drift check at `ci.yml:95-101` fails if these columns leave
   the schema; the `localePolicy.enabledLocales` behaviour is exercised by
   `server/packages/adapters/experience-postgres/src/localization.postgres.test.ts`, though that test is
   gated on `ATHYPER_LOCALIZATION_TEST_DATABASE_URL` and builds its own inline DDL rather than reading the
   repo DDL). The defect is real and high because a hard-red, CI-invisible gate blocks the documented
   developer entrypoint and provides false assurance — not because a silent schema-regression channel is open.
2. **The proposed fix should prefer the union already computed at line 28.** Asserting against
   `normalizedDdl` (line 28) instead of re-reading the master file is strictly more robust: the gate
   already builds that union for the boundary check, and line 28 includes `localePolicy` plus the master
   file, so it satisfies both asserted column names. Pointing line 24 at
   `server/db/ddl/common/master/03_platform_tables.sql` also works (verified above) but reintroduces the
   same file-path brittleness that caused this bug.
3. A stronger replacement assertion would bind the columns to their constraint
   (`tenant_profile_locale_policy_chk`, `master/03_platform_tables.sql:79-85`) so the gate detects
   governance weakening (e.g. dropping `'en' = ANY(enabled_locale_codes)`), which the current
   presence-only check cannot.

## Evidence index

- `tooling/scripts/policy/verify-i18n-foundation.mjs:24-25` — stale read path and failing assertion
- `tooling/scripts/policy/verify-i18n-foundation.mjs:26-29` — catalog/boundary assertions; line 28 already reads the master DDL
- `server/db/ddl/common/control/03_tables.sql:1433,1471,1487-1491` — what that file actually holds
- `server/db/ddl/common/master/03_platform_tables.sql:55,67-69,79-85` — real locale-policy storage and constraint
- `package.json:37,40,42,224` — `lint` vs `lint:errors`, `policy:i18n`, `policy:static --profile ci`
- `governance/config/governance/static-policy-profiles.json` — `ci` profile omits `policy:i18n`
- `.github/workflows/ci.yml:82,103` — only static-policy run and the `lint:errors` lint step
- `.githooks/pre-commit`, `.githooks/pre-push` — no `policy:i18n` enforcement
- `docs/architecture/application-experience/localization-guidance-and-build-plan.md:33` — gate treated as live
