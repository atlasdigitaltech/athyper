# Test-suite health, coverage gaps and CI gates — fresh independent review

**Area:** Test-suite health, coverage gaps and CI gates
**Repository:** `/home/chandravel_natarajan/src/athyper` (branch `stack-v2-foundation`, HEAD `63fc9492b`)
**Method:** mechanical sweep + manual confirmation. Every citation below was produced by `grep -n` or `nl -ba`
against the file as it exists on disk. Working tree at review time: 144 entries in `git status --porcelain`
(77 modified, 29 deleted, 2 renamed, 36 untracked) — the checkout is **mid-refactor**, and several findings are
caused by that in-progress refactor rather than by committed code. That distinction is called out per finding.

## Measured numbers (not estimates)

| Metric | Value |
| --- | --- |
| Test/spec files discovered in scoped tree (excl. `node_modules`, `.next*`, `dist`, `coverage`) | **996** |
| Static imports in those files that are relative or `@athyper/*` workspace imports | **4578** |
| …resolved to an on-disk file | **2026** |
| …**unresolved** | **23 raw hits → 18 real unresolved imports across 14 files** (5 raw hits were false positives — see §5) |
| Test files under `tests/foundation-browser/` | **53**; **46 are referenced by no script and never run in CI** |
| Test files under `tests/foundation/` | **61**; **2 files currently fail (3 failing assertions)** |
| Unconditionally-skipped tests | 1 (`tests/e2e/visual/pi-fixture.spec.ts:48`) |
| `.only` left in place | **0** |
| Scripts in root `package.json` | 240 |

### Gate status measured right now

| Gate | Command used | Exit | Red? |
| --- | --- | --- | --- |
| `policy:design-system` | `node tooling/scripts/policy/verify-design-system.mjs` | 0 | no (ratchet loose) |
| `policy:i18n` | `node tooling/scripts/policy/verify-i18n-foundation.mjs` | **1** | **yes** |
| `policy:frontend-spine` | `node tooling/scripts/policy/verify-frontend-spine-governance.mjs` | **1** | **yes** |
| `policy:theme-token-integrity` | `node tooling/scripts/policy/verify-theme-token-integrity.mjs` | 0 | no (11 warnings) |
| `policy:theme-token-integrity:strict` | `… --strict` | **1** | **yes** |
| `policy:style-tokens:strict` | `npx tsx tooling/scripts/policy/audit-style-tokens.ts --strict` | 0 | no (ratchet) |
| `format:changed:check` | `node tooling/scripts/policy/format-changed.mjs --check` | **1** | **yes** (working-tree state) |
| `test:reachability` | `node tooling/scripts/testing/verify-test-reachability.mjs --check` | **1** | **yes** |

Which of those run in CI: `.github/workflows/ci.yml:82` runs `pnpm policy:static`, i.e.
`run-static-policies.mjs --profile ci`, whose list is `governance/config/governance/static-policy-profiles.json`.
That profile includes `policy:frontend-spine`, `policy:theme-token-integrity:strict`, `policy:design-system`,
`policy:style-tokens:strict`, `format:changed:check`. `.github/workflows/ci.yml:130` runs `pnpm run test:root`.
`policy:i18n` appears in **no** profile — see F5.

---

## 1. FINDINGS

### F1 — 18 test files import modules that do not exist on disk; two CI suites fail at collection

**Severity: HIGH** — `confidence: verified` (individually executed)

`pnpm test:repo` (`package.json:67`) = `pnpm test:workspace && pnpm test:root`. `test:workspace` = `turbo test`
(`package.json:48`), which runs each workspace package's own `test` script; `test:root` (`package.json:66`)
includes `test:foundation`. The following committed, clean test files (verified `git cat-file -e HEAD:<path>`
→ present, `git status --porcelain` → empty) import paths that do not exist anywhere on disk.

#### 1a. `test:foundation` is red — 2 files cannot collect

`tests/foundation/atlas-record-question.test.ts:3`
```ts
import { atlasRequestsRecordOverview } from "../../server/apps/platform-host/src/composition/shared/ai/atlas-record-question";
```
The directory `server/apps/platform-host/src/composition/shared/ai/` **does not exist**
(`ls server/apps/platform-host/src/composition/shared/` → `collaboration documents entity-governance
entity-runtime identity publication verification verification.ts`). The module *is* in `HEAD`
(`git cat-file -e HEAD:…shared/ai/atlas-record-question.ts` → present) and is listed as deleted in the working
tree, with a replacement at the untracked `server/apps/platform-host/src/composition/spaces/neon/ai/atlas-record-question.ts`.
Executed:
```
$ npx tsx --test tests/foundation/atlas-record-question.test.ts
Error: Cannot find module '../../server/apps/platform-host/src/composition/shared/ai/atlas-record-question'
EXIT=1
```

`tests/foundation/reference-choice-policy.test.ts:7`
```ts
import { withBusinessPartnerReferenceHistory } from "../../server/db/scripts/provisioning/business-partner-data-surfaces";
```
Target does not exist; deleted in commit `870f08f52` ("cleanup: remove bespoke business partner and workforce",
2026-09-29). Executed:
```
$ npx tsx --test tests/foundation/reference-choice-policy.test.ts
Error: Cannot find module '../../server/db/scripts/provisioning/business-partner-data-surfaces'
EXIT=1
```
`test:foundation` (`package.json:77`) globs `tests/foundation/*.test.ts tests/foundation/*.test.tsx`, so both are
collected. **Consequence on the shipped Country route:** none directly — but `test:root`, which is the only CI job
that runs the Country browser qualification (`test:country-browser`, `ci.yml:130` comment), aborts at
`test:foundation`, so the Country gate never executes in a failing pipeline. **Fix:** delete the two orphaned
test files, or repoint imports at the replacement modules (`…/spaces/neon/ai/atlas-record-question`, and whatever
replaced `business-partner-data-surfaces`) and re-run.

#### 1b. `test:workspace` (`server/db`) is red — 6 files cannot collect

All six are committed and clean; each imports a `server/db/scripts/provisioning/*` module that was deleted in
`870f08f52` and has no replacement:

| File | Line | Specifier |
| --- | --- | --- |
| `server/db/scripts/__tests__/provisioning/business-partner-labels.test.ts` | 4 | `../../provisioning/business-partner-labels` |
| `server/db/scripts/__tests__/provisioning/business-partner-r2-fixtures.test.ts` | 3 | `../../provisioning/provision-business-partner-r2-fixtures.js` |
| `server/db/scripts/__tests__/provisioning/business-partner-r5-fixtures.test.ts` | 6 | `../../provisioning/provision-business-partner-r5-fixtures.js` |
| `server/db/scripts/__tests__/provisioning/business-partner-r7-fixtures.test.ts` | 4 | `../../provisioning/provision-business-partner-r7-fixtures.js` |
| `server/db/scripts/__tests__/provisioning/development-business-partner-fixtures.test.ts` | 4, 48 | `../../provisioning/provision-development-business-partner-fixtures.js`, `…-profiles.js` |
| `server/db/scripts/__tests__/provisioning/development-business-partner-runtime.test.ts` | 5–8 | `../../provisioning/provision-development-business-partner-runtime.js` |

`ls server/db/scripts/provisioning/` contains **none** of `business-partner-labels.ts`,
`provision-business-partner-r2-fixtures.ts`, `…-r5-…`, `…-r7-…`, `provision-development-business-partner-fixtures.ts`,
`provision-development-business-partner-runtime.ts`. `@athyper/server-db`'s test script is
`tsx --test scripts/__tests__/**/*.test.ts` (its `package.json`), so all six run under `turbo test`. Executed:
```
$ cd server/db && npx tsx --test scripts/__tests__/provisioning/business-partner-labels.test.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/server/db/scripts/provisioning/business-partner-labels'
ℹ fail 1
EXIT=1
```
Two of these files also read a sibling source by URL, which dangles identically:
`business-partner-r7-fixtures.test.ts:7` (`"../../provisioning/provision-business-partner-r7-fixtures.ts"`) and
`development-business-partner-runtime.test.ts:117`.
**Fix:** delete the six orphaned test files (the feature they cover was removed).

#### 1c. `test:workspace` (`@athyper/server-platform-host`) is red — 1 file cannot collect

`server/apps/platform-host/src/composition/shared/verification/__tests__/routes.test.ts:5`
```ts
import { executeVerification } from "../routes.js";
```
`ls server/apps/platform-host/src/composition/shared/verification/` returns only `__tests__/`. The source is in
`HEAD` but is deleted in the working tree and replaced by the untracked
`server/apps/platform-host/src/composition/shared/verification.ts`. Executed:
```
$ cd server/apps/platform-host && npx vitest run src/composition/shared/verification/__tests__/routes.test.ts
FAIL  src/composition/shared/verification/__tests__/routes.test.ts (0 test)
Error: Cannot find module '../routes.js' imported from …/verification/__tests__/routes.test.ts
 ❯ src/composition/shared/verification/__tests__/routes.test.ts:5:1
 Test Files  1 failed (1)
EXIT=1
```
This one **is** refactor rot from the uncommitted working tree — if the refactor lands as-is, CI goes red.
**Fix:** update the import to the new `../verification.js` (or delete the test if the module's behaviour now lives
elsewhere and is covered).

#### 1d. `test:workspace` (`@athyper/server-plane-studio-meta-entity-authoring`) is red — 3 files cannot collect

| File | Lines | Specifier |
| --- | --- | --- |
| `server/packages/planes/studio/meta-entity-authoring/src/__tests__/intake-presentation.test.ts` | 3 | `../intake-presentation.js` |
| `server/packages/planes/studio/meta-entity-authoring/src/__tests__/configuration-editor-qualification.test.ts` | 2, 3 | `……/packages/planes/studio/business-partner/src/composition-configuration`, `…-configuration.fixture` |
| `server/packages/planes/studio/meta-entity-authoring/src/__tests__/structural-editor-qualification.test.ts` | 2, 3 | `……/packages/planes/studio/business-partner/src/composition-structure`, `…-structure.fixture` |

`server/packages/planes/studio/meta-entity-authoring/src/` has no `intake-presentation.ts`.
`packages/planes/studio/business-partner/` contains only `node_modules` — there is **no `src/` directory** and no
`package.json` (see F3). All four source paths appear in git history and were deleted in `870f08f52`. The package's
test script is `vitest run`, so all three are collected under `turbo test`.
**Fix:** delete the three orphaned test files; they qualify behaviour of modules that no longer exist.

#### 1e. Orphaned specs with dead imports (not CI-blocking because they never run)

- `tests/foundation-browser/bank-editor.spec.ts:5` →
  `import { withBusinessPartnerFullProfile } from "../../server/db/scripts/provisioning/business-partner-full-profile";`
  (target missing; deleted `870f08f52`). This 277-line spec is one of the 46 never-run specs from F6.
- `tooling/scripts/local-dev/bp-provider-sql.integration.test.mts:8,9` →
  `…/master-data/src/business-partner/relationships/explainability-reader` (missing, deleted `080a0b092`) and
  `…/platform-host/src/composition/business-partner-stored-scopes.js` (missing, deleted `870f08f52`). Both are
  **static top-level ESM imports**, so this file cannot collect. It is only invoked by
  `test:local-bp-boundaries` (`package.json`), which is **not** part of `test:root`/`test:repo` — so it is red
  only when run manually.

**What I checked for mitigation:** I looked for aliasing tsconfig `paths` (none — `tooling/config/tsconfig-base.json`
declares no `paths`), for a bundler resolution step in the test runners (none — `tsx --test`, `node --test` and
`vitest run` all use plain resolution), and for the targets existing under a different extension
(`.ts`/`.tsx`/`.js`/`index.*` were all probed). None of the 18 specifiers resolves. I also confirmed each test file
is reachable by its runner: `tests/foundation/*.test.ts` by `test:foundation`; `scripts/__tests__/**/*.test.ts` by
`@athyper/server-db`; `src/**/__tests__/*.test.ts` by vitest default include.

---

### F2 — `test:reachability` is red: 16 root-owned test files the gate forbids

**Severity: HIGH** — `confidence: verified`

`test:reachability` is the **first** command in `test:root` (`package.json:66`), which is the second half of
`pnpm test`. It currently exits 1:

```
$ node tooling/scripts/testing/verify-test-reachability.mjs --check
Error: Test reachability verification failed:
- tooling/scripts/local-dev/candidate-snapshot.test.mjs: root-owned tests must live under tests/contracts, tooling/scripts/policy, or tooling/scripts/performance
- tooling/scripts/local-dev/candidate.test.mjs: …
- tooling/scripts/local-dev/dev-publish.test.mjs: …
- tooling/scripts/local-dev/dev-workspace.test.mjs: …
- tooling/scripts/local-dev/lifecycle.test.mjs: …
- tooling/scripts/local-dev/metadata-set.test.mjs: …
- tooling/scripts/local-dev/network-read-grant.test.mjs: …
- tooling/scripts/local-dev/publication-recovery-preflight.test.mjs: …
- tooling/scripts/local-dev/qa-runtime.test.mjs: …
- tooling/scripts/local-dev/qa-session.test.mjs: …
- tooling/scripts/local-dev/reconcile-bp-operation-catalog.test.mjs: …
- tooling/scripts/local-dev/runner.test.mjs: …
- tooling/scripts/local-dev/runtime-qualification-checks.test.mjs: …
- tooling/scripts/local-dev/separate-checkout.test.mjs: …
- tooling/scripts/local-dev/watch-runtime.test.mjs: …
- tooling/scripts/metadata/check-layout.test.mjs: …
EXIT=1
```

Cause: `tooling/scripts/testing/verify-test-reachability.mjs:172-178`
```js
  if (packageDirectory === root) {
    const runner = rootRunnerFor(path);
    if (!runner) {
      errors.push(
        `${path}: root-owned tests must live under tests/contracts, tooling/scripts/policy, or tooling/scripts/performance`,
      );
      continue;
    }
```
`nearestPackageDirectory` walks up from the file looking for a `package.json`; there is none at
`tooling/scripts/local-dev/`, `tooling/scripts/`, or `tooling/` (verified all three missing), so these files are
attributed to the repository root. `ROOT_RUNNERS` (lines 23-74) lists no `tooling/scripts/local-dev` entry, and
`tooling/scripts/metadata/` is not listed either. The `test:local-runner` script (`package.json:17`,
`node --test tooling/scripts/local-dev/*.test.mjs`) exists and would run 15 of these 16 files, but the gate does not
know about it.

**Consequence on the shipped Country route:** `pnpm test` and CI's "Root tests and reachability" step
(`ci.yml:128-133`) fail before `test:plane-contracts`, `test:foundation` or `test:country-browser` execute. No
Country browser evidence is produced in CI.

**Fix:** either add a `ROOT_RUNNERS` entry mapping `tooling/scripts/local-dev` → `test:local-runner` and
`tooling/scripts/metadata` → its runner, and add `test:local-runner` to `test:root`; or move those files under a
workspace package with its own `test` script. Note the gate is *self-inconsistent*: it demands `test:root`
invoke every `ROOT_RUNNERS` entry (lines 216-219) while `test:local-runner` is deliberately outside `test:root`.

---

### F3 — `policy:frontend-spine` is red in the CI profile

**Severity: HIGH** — `confidence: verified`

```
$ node tooling/scripts/policy/verify-frontend-spine-governance.mjs
Frontend spine governance failed:
- packages/platform/shell/app-foundation: runtime dependencies 11 exceed budget 10
- packages/platform/shell/app-foundation: workspace runtime dependencies 11 exceed budget 10
- packages/platform/shell/shell: runtime dependencies 12 exceed budget 8
- packages/platform/shell/shell: workspace runtime dependencies 12 exceed budget 8
- Missing spine package manifest: packages/planes/neon/business-partner
- Missing spine package manifest: packages/planes/mesh/business-partner
- Missing spine package manifest: packages/planes/studio/business-partner
- Missing spine package manifest: packages/platform/iam/governance-review
EXIT=1
```

The assertion is `tooling/scripts/policy/frontend-spine-governance.mjs:93-96`:
```js
    const manifestPath = join(root, entry.path, "package.json");
    if (!existsSync(manifestPath)) {
      violations.push(`Missing spine package manifest: ${entry.path}`);
      continue;
    }
```
and the registry entry that demands those manifests is in `governance/config/governance/frontend-spine-packages.json`,
e.g.
```json
{"path":"packages/planes/studio/business-partner","name":"@athyper/product-studio-business-partner","owner":"Studio","classification":"Product-specific","dependencyBudget":{"runtime":8,"workspace":8}}
{"path":"packages/platform/iam/governance-review","name":"@athyper/platform-iam-governance-review","owner":"Platform IAM","classification":"Server-only governance review","dependencyBudget":{"runtime":0,"workspace":0}}
```
All four directories exist but contain **only `node_modules`** — no `package.json`, no `src`. I checked whether
`pnpm-workspace.yaml` still claims them (it does not; they are not matched by the new-structure globs), so this is
**a stale registry entry**, not a missing manifest to be created. The budget violations are real: `packages/platform/shell/shell/package.json` declares 12 runtime deps against a budget of 8, and `app-foundation` 11 against 10
(I counted the `dependencies` keys directly).

`policy:frontend-spine` is in the `workspace`, `release`, `ci` **and** `wave1` profiles
(`governance/config/governance/static-policy-profiles.json`), i.e. it is red on every profile CI can run.

**Consequence on the shipped Country route:** none functionally, but it means `pnpm policy:static` never completes,
so the other ~40 CI static policies stop being enforced as a set — including `policy:records-identity-boundary`
and `policy:runtime-api-paths`, both of which guard the records service that backs the Country list API.

**Fix:** remove the four retired paths from `frontend-spine-packages.json`, and either raise the two shell budgets
with justification or trim the dependency lists.

---

### F4 — `policy:theme-token-integrity:strict` is red in the CI profile, and its scan includes gitignored build output

**Severity: HIGH** for the red gate; the build-output scan is a separate **MEDIUM** (F4b)

```
$ node tooling/scripts/policy/verify-theme-token-integrity.mjs --strict
Theme token integrity (strict)
Global --a-* vocabulary: 148 tokens
Authority integrity issues: 0 | Unresolved references: 11 (0 error, 11 warning)
WARNING (no definition, every usage has a fallback — rejected in strict mode)
  packages/platform/foundation/ui/src/styles.css:388 --a-color-danger (1x)
  apps/studio/.next-bp-consolidated/static/chunks/0adjft-j9-1qj.css:1 --a-on-brand (1x)
  packages/platform/shell/shell/src/styles.css:535 --a-on-brand (2x)
  packages/platform/entity/runtime/form-detail/src/detail-workspace.css:8 --a-page-sticky-top (2x)
  packages/platform/entity/runtime/form-detail/src/record/record.css:223 --a-page-sticky-top (3x)
  packages/platform/foundation/ui/src/styles.css:131 --a-page-sticky-top (3x)
  apps/studio/.next-bp-consolidated/static/chunks/1xz07w6xqovn0.css:1 --a-record-sticky-top (1x)
  packages/platform/foundation/ui/src/styles.css:131 --a-record-sticky-top (2x)
  packages/platform/foundation/ui/src/styles.css:317 --a-surface-muted (1x)
  apps/studio/.next-bp-consolidated/static/chunks/1xz07w6xqovn0.css:1 --a-surface-subtle (1x)
  packages/platform/foundation/ui/src/styles.css:520 --a-toast-bottom-offset (1x)
Theme token integrity failed: 11 finding(s).
EXIT=1
```

`--strict` is defined at `tooling/scripts/policy/verify-theme-token-integrity.mjs:228-232`:
```js
export function selectFailures(findings, { strict } = {}) {
  return strict
    ? findings
    : findings.filter((finding) => finding.severity === "error");
}
```
So every `warning` becomes fatal. **7 of the 11 findings are in committed source files** (`ui/src/styles.css`
lines 131, 317, 388, 520; `shell/shell/src/styles.css:535`; `form-detail/src/detail-workspace.css:8`;
`form-detail/src/record/record.css:223`) — I confirmed each line exists and genuinely references an undefined
`--a-*` token with a fallback, e.g. `packages/platform/foundation/ui/src/styles.css:388`:
```css
.a-collection__actions .a-collection__remove{background:transparent;border-color:transparent;color:var(--a-color-danger,#b42318);
```
Therefore, **even on a clean CI checkout with no build output, 7 findings remain and the gate fails.**
`policy:theme-token-integrity:strict` is listed in the `ci` profile.

**F4b — the same gate walks gitignored build output.** `tooling/scripts/policy/verify-theme-token-integrity.mjs:20-27`
```js
const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);
```
`stylesheetsBelow` (lines 35-55) recurses from `apps/studio`, and `.next-bp-consolidated` is not `.next`, so the
generated chunks are scanned. `git check-ignore -v apps/studio/.next-bp-consolidated/static/chunks/0adjft-j9-1qj.css`
→ `.gitignore:48:**/.next-*/`. Compare `tooling/scripts/policy/verify-design-system.mjs:57-66`, which does it
correctly:
```js
function isGeneratedDirectory(name) {
  return (
    name === "node_modules" || name === "dist" || name === "coverage" ||
    name === ".turbo" || name === ".next" || name.startsWith(".next-")
  );
}
```
**Consequence:** the gate's output depends on whether a stale local build exists; the finding count differs
between a developer machine and CI, and 4 of the 11 current findings are pure build-artifact noise. **Fix:** reject
unknown `--a-*` references by giving authority to the theme vocabulary (define the 7 missing tokens, or add them to
the authority), and apply the same `.next-*` prefix rule used by the design-system gate.

---

### F5 — `policy:i18n` is red, and its assertion is stale (it reads the wrong DDL file); it is also not wired to CI

**Severity: HIGH** (stale assertion) — `confidence: verified`

```
$ node tooling/scripts/policy/verify-i18n-foundation.mjs
i18n foundation policy failed:
- canonical plane policy storage must retain locale fallback and enablement controls
EXIT=1
```

The assertion, `tooling/scripts/policy/verify-i18n-foundation.mjs:24-25`:
```js
const localePolicy = read("server/db/ddl/common/control/03_tables.sql");
if (!localePolicy.includes("fallback_locale_code") || !localePolicy.includes("enabled_locale_codes")) violations.push("canonical plane policy storage must retain locale fallback and enablement controls");
```
`grep -ci locale server/db/ddl/common/control/03_tables.sql` → 33, but **neither column name is present**; the file
contains `control.ui_locale_catalog` (line 1433) and `master.tenant_locale_activation` (line 1471). The columns
moved to `server/db/ddl/common/master/03_platform_tables.sql:55-85`:
```sql
CREATE TABLE master.tenant_profile (
    ...
    enabled_locale_codes text[] NOT NULL DEFAULT ARRAY['en']::text[],
    default_locale_code text NOT NULL DEFAULT 'en',
    fallback_locale_code text NOT NULL DEFAULT 'en',
```
The same gate already reads that file for a different assertion (line 28 reads
`server/db/ddl/common/master/03_platform_tables.sql`), so the fix is a one-line path/table correction, not a
product regression.

**F5b — the gate is not wired to CI.** CI runs `pnpm run lint:errors` (`ci.yml:103`), which is
`turbo run lint` (`package.json`), **not** `pnpm lint` (`package.json:37`, `pnpm policy:i18n && turbo lint`).
`policy:i18n` appears in none of the four `static-policy-profiles.json` profiles and in no workflow. So a
security-adjacent governance gate (RTL geometry, locale-policy enforcement, catalog coverage) is permanently red
*and* permanently invisible. **Fix:** correct the DDL path, then add `policy:i18n` to the `ci` profile (or make CI
call `pnpm lint`).

---

### F6 — 46 of the 53 `tests/foundation-browser` specs are never executed by any runner

**Severity: HIGH** — `confidence: verified`

`tooling/config/playwright.foundation.config.ts:5` sets `testDir: "../../tests/foundation-browser"` with no
`testMatch`, so `test:foundation-browser` (`package.json:78`) would run every spec. That script is referenced **by
nothing**: not by `test:root` (`package.json:66`), not by `test:repo` (`package.json:67`), not by CI, not by
`.githooks/*`. The only foundation-browser specs that any script names are seven:

- `test:country-browser` (`package.json:79`): `entity-read-route-adapter`, `detail-collaboration`,
  `entity-surface-hardening`, `country-filter-layout`, `entity-onboarding-followup` — the only five CI runs.
- `test:shared-shell-phase8` and `test:error-boundaries-phase7` name `shared-shell.spec.ts` and
  `error-boundaries.spec.ts`; neither script is in `test:root`.
- `tooling/scripts/verification/qualify-frontend-spine.mjs:15` names the same two.

The remaining **46 files (7,048 lines) are dead weight**. Largest:

```
  1416  file-discovery.spec.ts
   793  comment-actions.spec.ts
   651  entity-activity.spec.ts
   334  metadata-detail-navigation.spec.ts
   302  global-field-controls.spec.ts
   277  bank-editor.spec.ts
   260  reference-select.spec.ts
   233  notification-controls.spec.ts
   199  collection-presentations.spec.ts
   176  collaboration-panel.spec.ts
   … 36 more
```
Among them are specs that directly concern the shipped Country route and are silently not run:
`country-change-confirmation.spec.ts` (73 lines), `bank-country-rules.spec.ts` (96),
`entity-list-plane-parity.spec.ts` (107), `entity-list-sticky-heading.spec.ts` (34), `applied-filters.spec.ts` (24).

**Mitigation checked:** I searched `package.json`, `.github/`, `.githooks/`, `tooling/` and every app
`package.json` for `foundation-browser` — only the four hits listed above. There is no turbo task or CI matrix
that fans out over the directory.

**Fix:** either add `test:foundation-browser` to `test:root` (cost: full Chromium suite), or fold the
Country-relevant specs above into `test:country-browser`, which is already CI-gated.

---

### F7 — The reachability gate is blind to `.test.mts` and every `.spec.ts`, so 5 `.mts` tests and 60 specs escape it

**Severity: MEDIUM** — `confidence: verified`

`tooling/scripts/testing/verify-test-reachability.mjs:12`
```js
const TEST_FILE = /\.test\.(?:ts|tsx|mjs)$/;
```
Consequences that I confirmed on disk:

- `tooling/scripts/local-dev/metadata-pack.test.mts`, `metadata-import.test.mts`, `graph-storage-order.test.mts`,
  `bp-provider-sql.integration.test.mts` and
  `tooling/scripts/verification/entity-authorization/publication-plan.test.mts` are invisible to the gate.
- All 53 `tests/foundation-browser/*.spec.ts` and 7 `tests/e2e/**/*.spec.ts` are invisible to the gate.

`test:local-runner` (`package.json:17`) globs only `*.test.mjs`, so the four local-dev `.mts` tests run under **no**
script, and `test:operations` (`package.json:65`) globs only `tooling/scripts/verification/*.test.mjs` (one level,
`.mjs`), so `entity-authorization/publication-plan.test.mts` runs under **no** script either. `bp-provider-sql.integration.test.mts`
is named only by `test:local-bp-boundaries`, which is not in `test:root`.

**Consequence on the shipped Country route:** the gate whose stated purpose is "every test file must be reachable"
cannot see the browser specs that are the *only* automated end-to-end evidence for the Country read route and read
surface, nor can it see five integration tests. **Fix:** widen `TEST_FILE` to
`/\.(?:test|spec)\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/` and add `ROOT_RUNNERS` entries for
`tests/foundation-browser` (→ `test:foundation-browser`) and `tooling/scripts/local-dev` (→ `test:local-runner`),
then update the committed `governance/policy/reports/test-reachability-retirement.json`.

---

### F8 — Coverage gaps on the Country request path

**Severity: MEDIUM** — `confidence: verified`

I inverted the import graph: for every file on the Country chain I checked whether *any* test or spec imports it
(resolving `./x` → `x.ts`/`x.tsx`, `@athyper/*` exports and `dist` → `src`). Result:

| Country-path module | Direct test import? | Notes |
| --- | --- | --- |
| `packages/platform/entity/runtime/form-detail/src/entity-read-surface.tsx` | **none** | The only spec that touches the read route **stubs it out**. |
| `packages/platform/entity/runtime/form-detail/src/routes/entity-read-route.tsx` | **none** | Exercised only through the stubbed spec below. |
| `packages/platform/entity/runtime/form-detail/src/index.tsx` (detail runtime) | **none** | |
| `packages/platform/entity/runtime/list-view/src/index.tsx` | yes | `tests/foundation/entity-list-phase1a.test.tsx` (2553 lines). |
| `packages/platform/entity/runtime/list-view/src/list-pagination.tsx` | **none** | 56 lines, new untracked file; consumed at `index.tsx:18,1523`. |
| `packages/platform/entity/runtime/list-view/src/entity-location.ts` | **none** | 4 lines; consumed at `index.tsx:4`. |
| `packages/contracts/platform/entity-runtime/src/routes/entity-read-route.ts` | yes | `tests/contracts/entity-identity.test.ts:8`. |
| `apps/neon/lib/relay.ts` | yes | `tests/contracts/app-relay-composition.test.ts:3`, `bp-intake-protection-relay.test.ts`. |
| `apps/{neon,mesh,studio}/app/api/relay/[...path]/route.ts` | **none** | 9 lines each; thin re-export. |
| `apps/neon/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx` | **none** | `entity-read-route-adapter.spec.ts:15` uses `renderEntityReadRoute(params, …)` for the `neon` case instead of importing the real page export. |
| `server/packages/services/records/src/{entity-list-routes,entity-list-service,query-service}.ts` | yes | multiple `__tests__` files. |
| `server/packages/services/records/src/list-scope-coordinate.ts` | none directly | but reached via `entity-list-routes.ts`, which is tested. |

**The stub is the important one.** `tests/foundation-browser/entity-read-route-adapter.spec.ts:32-42`:
```js
        builder.onResolve({ filter: /entity-read-surface$/ }, () => ({
          path: "surface",
          namespace: "fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          loader: "js",
          contents:
            args.path === "navigation"
              ? `export const notFound=()=>{throw Error('NOT_FOUND')};`
              : `export const EntityReadSurface=()=>null;`,
        }));
```
The spec's own header comment (lines 5-6) acknowledges this: *"Only framework 404 and the already-tested read
surface are stubs."* I could not find the "already-tested" unit test it refers to — there is no test file anywhere
under `packages/platform/entity/**` (`find packages/platform/entity -name '*.test.*'` → empty). So the claim is
currently unbacked.

**Named missing tests I would add, in priority order:**

1. `packages/platform/entity/runtime/form-detail/src/routes/entity-read-route.test.tsx` — table-test the
   list / manage / record coordinate mapping and the not-found path for `entityCode: "country"` with segments
   `[]`, `["manage"]`, `[recordId]`, plus an unknown entity. The browser spec already encodes the expected shape
   (`entity-read-route-adapter.spec.ts:54-59`), so the fixture exists.
2. `packages/platform/entity/runtime/list-view/src/list-pagination.test.tsx` — page-size change, previous/next
   with `cursorHistory`, and the `!page.rows.length → null` guard (`list-pagination.tsx:28`).
3. `packages/platform/entity/runtime/list-view/src/entity-location.test.ts` — the single branch in
   `entity-location.ts:3` (same entity → keep `search`; different entity, same pathname → drop inherited state).
   This is the URL-state codec's in-place entity-switch rule and it has no test at all.
4. `tests/foundation-browser/entity-read-route-adapter.spec.ts` — add the real `apps/neon/.../page.tsx` export to
   the bundle instead of falling back to `renderEntityReadRoute`, so Neon's shipped adapter is covered like
   Studio's and Mesh's.

**What is *not* a gap (checked and cleared):** the URL state codec itself is well covered by
`tests/contracts/entity-list-contract.test.ts` (parses/rejects `page`, `pageSize` bounds — line 26 rejects
`pageSize=Infinity`, line 226 asserts the 50-item clamp — `density`, `sort`, `cols`, `filter.*`, `view`, `cursor`,
NUL/`%00` guards) against `list-view/src/state.ts`. Server-side pagination limits are covered by
`server/packages/services/records/src/__tests__/records-query-contract.test.ts` and `list-limits.ts` consumers.
The relay allowlist is genuinely well covered — `tests/contracts/app-relay-composition.test.ts:22-49` asserts
spoofed `x-tenant-id`/`x-plane` headers are ignored, that non-GET methods on read paths return 404, that an
unknown operation returns 404, that an empty tenantId returns 409, that a wrong plane returns 403, that a missing
session returns 401, and that denied calls never reach the runtime (`assert.equal(forwarded.length, 4, "denied calls must not reach runtime")`).

---

### F9 — `tests/foundation` has 3 genuinely failing assertions (independent of F1)

**Severity: MEDIUM** — `confidence: verified`

`test:foundation` is in `test:root`, so these block CI on their own even after F1 is fixed.

**F9a — stale expectation in `tests/foundation/atlas-answer.test.tsx`.** Line 19:
```ts
  assert.match(html, /Revision 3/);
```
The component renders `Revision: 3`. Executed:
```
$ npx tsx --tsconfig tooling/config/tsconfig-react.json --test tests/foundation/atlas-answer.test.tsx
✖ validated answers show local accessible sources and reject invented references
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Revision 3/.
  actual: '…<p>Record ID: BP-1 · Revision: 3 · Tool: bp_read_summary</p>…'
ℹ pass 7 fail 1
EXIT=1
```
The renderer is correct and the test regex is stale. **Fix:** change the expectation to `/Revision: 3/`.

**F9b — `ReferenceError: React is not defined` in `tests/foundation/activity-center-interactions.test.tsx`.**
Both tests in the file fail:
```
$ npx tsx --tsconfig tooling/config/tsconfig-react.json --test tests/foundation/activity-center-interactions.test.tsx
✖ opens through a body portal, switches tabs, and restores trigger focus
  ReferenceError: React is not defined
      at ShellChrome (/home/…/packages/platform/shell/shell/src/client.tsx:377:3)
ℹ tests 2 fail 2
EXIT=1
```
Cause: `packages/platform/shell/shell/src/client.tsx` is **modified in the working tree**, and the modification
removes the React namespace import:
```
$ git diff HEAD -- packages/platform/shell/shell/src/client.tsx
-import * as React from "react";
```
`git show HEAD:…client.tsx | grep -n 'import React'` → `41:import * as React from "react";`. So this failure is
introduced by the uncommitted refactor, **not** by committed code — but it is the current state and will be red in
CI if the change lands. (Note `tsconfig-react.json` sets `"jsx": "react-jsx"`, yet the classic transform is clearly
in use for this module; the sibling `shell-chrome.tsx` survives only because it still imports React at line 1.)
**Fix:** restore `import * as React from "react";`, or confirm the JSX runtime configuration and drop the classic
import everywhere.

---

### F10 — `format:changed:check` is red on 25 files, but only because the working tree is dirty

**Severity: MEDIUM** — `confidence: verified`

```
$ node tooling/scripts/policy/format-changed.mjs --check
Formatting base: <HEAD sha>; …
server/apps/platform-host/src/composition/shared/publication/workload-routes.ts: Formatting differs; run pnpm format:changed
…
tests/contracts/bff-relay-security.test.ts: Formatting differs; run pnpm format:changed
tests/contracts/entity-list-contract.test.ts: Formatting differs; run pnpm format:changed
EXIT=1
```
`tooling/scripts/policy/format-changed.mjs:26` defaults the diff base to `HEAD`, and lines 34-42 select
`git diff --name-only --diff-filter=ACMR <HEAD>` plus untracked files. I confirmed the reported files are
working-tree modifications (`git status --porcelain -- tests/contracts/entity-list-contract.test.ts` → ` M`), so
**this redness is a property of the current dirty checkout, not of committed code**. It will only fail CI if the
25 files are part of the PR. `format:changed:check` is in the `ci` and `wave1` profiles. **Fix:** run
`pnpm format:changed` as part of finishing the refactor. No source defect here; recorded so the red gate is not
mistaken for committed rot.

---

### F11 — Dead/orphaned test configuration: 8 playwright projects match no files, 2 whole configs are unreferenced

**Severity: MEDIUM** — `confidence: verified`

- `tooling/config/playwright.config.ts` defines projects `bp-v1-009` (line 85), `bp-r2` (94), `bp-r3` (103),
  `bp-r5` (106), `bp-r6-amendment` (107), `bp-r6` (108), `bp-r7` (109) whose `testMatch` is
  `**/business-partner/bp-*.spec.ts`, but `tests/e2e/business-partner/` **does not exist**
  (`ls -d` → `No such file or directory`). Those 7 projects select zero tests. The stale
  `tests/e2e/.playwright-bp-*/` output directories in the tree confirm the specs once existed.
- `tooling/config/playwright.mesh-review.config.ts` and `tooling/config/playwright.neon-review.config.ts` exist,
  and `tests/e2e/mesh-review/authenticated.spec.ts` / `tests/e2e/neon-review/authenticated.spec.ts` exist, but
  **no** script, workflow or hook references either config (grep over `package.json`, `.github/`, `tooling/`
  returns only the configs' own `outputDir` lines).
- `tests/e2e/visual/pi-fixture.spec.ts:48` is an unconditional skip:
  ```ts
      test.skip(true, ACTIVATION_PENDING);
  ```
  `test:visual` (`package.json`) therefore runs one skipped test and asserts nothing.

These are not Country-route-impacting, but they inflate the apparent test surface. **Fix:** delete the 7 dead
projects and the two unreferenced configs (or re-add the missing specs), and either activate or delete the visual
fixture.

---

### F12 — Both "green" design gates are green only because their ratchets are stale

**Severity: LOW** — `confidence: verified`

`policy:design-system` exits 0 while telling you the ratchet is out of date:
```
Ratchet is loose: 0 file(s) improved, 1 file(s) now clean. Retighten with pnpm policy:design-system --update-ratchet.
Design-system policy passed the ratchet: 143 known violation(s), none new.
```
`policy:style-tokens:strict` exits 0 with the same signal, and with error-category findings still tolerated:
```
- font-size-arbitrary (ERROR): …
- raw-css-tracking-leading (ERROR): 15
Ratchet is loose: 2 file(s) improved, 5 file(s) now clean. Retighten with pnpm policy:style-tokens:strict --update-ratchet.
Strict style token audit passed the ratchet: 95 known error finding(s), none new.
```
The ratchet mechanism (`tooling/scripts/policy/violation-ratchet.mjs`, used at
`verify-design-system.mjs:5-12`) compares findings against
`governance/config/governance/design-system-ratchet.json`. A "loose" ratchet keeps a permissive baseline, so
`policy:style-tokens:strict` tolerates 95 *error-severity* findings. This is a governance-hygiene finding, not a
bug: the gates are correctly *designed* (they skip `.next-*`, see F4b), they are just not currently tightening.
**Fix:** run the `--update-ratchet` commands to lock in the improvements the gate itself reports.

---

## 2. VERIFIED HEALTHY (do not churn)

1. **Relay allowlist and tenant/plane authority are genuinely well tested.**
   `tests/contracts/app-relay-composition.test.ts:22-49` constructs a handler that ignores spoofed
   `x-tenant-id: attacker` / `x-plane: attacker` headers, asserts the forwarded URL is exactly
   `http://runtime.test/api/<path>?limit=25&cursor=…`, that the outbound `x-tenant-id` is the session tenant and
   `x-plane` is the plane, that `POST/PUT/PATCH/DELETE` on a read path return 404, that an unknown sub-operation
   returns 404, and that empty-tenant → 409, wrong-plane → 403, no-session → 401, with
   `assert.equal(forwarded.length, 4, "denied calls must not reach runtime")`. A second test covers the real
   per-plane composition ("permits IAM but denies unknown routes, wrong planes and disabled pilots", line 51).
2. **The list URL state codec has real contract coverage.** `tests/contracts/entity-list-contract.test.ts:26`
   enumerates rejection cases (`page=-1`, `page=NaN`, `pageSize=Infinity`, `group=%00`, `view=board` clamp) and
   line 226 asserts an over-limit `pageSize=100` clamps to 50; line 217 exercises `filter.*`, `sort`, `cols`,
   `density`, `vid`, `cursor` together. `tests/foundation/entity-list-phase1a.test.tsx:235,819` drives the same
   state through the React list runtime.
3. **`test:plane-contracts` and `test:policy` globs actually match their trees** — `tests/contracts/` has 45
   top-level `*.test.ts` and no nested test files; `tests/foundation/` has exactly 61 `*.test.ts`/`*.test.tsx` and
   no nested test files; both are therefore fully collected by their globs (`package.json:49,77`).
4. **No `.only` anywhere** in the scoped tree, and every `.skip` I found is a legitimate conditional guard
   (postgres/integration gating via `describe.skipIf(...)` in `server/packages/**`, production-matrix credential
   gating in `tests/e2e/production/*`). The single unconditional skip is the visual fixture in F11 and is
   documented as activation-pending in its own header comment.
5. **`policy:design-system` correctly excludes generated output.** `verify-design-system.mjs:57-66` rejects
   `.next`, `.next-*`, `dist`, `coverage`, `.turbo`, `node_modules` before recursing — the right model that F4b
   should copy.
6. **The reachability gate's core contract is sound.** It asserts that root-owned tests live in a known runner
   directory, that active workspace packages with tests declare a `test` script, that `test:root` invokes every
   runner, that `test:repo` invokes `test:workspace`+`test:root`, and that the committed retirement report matches
   the live computation (lines 204-277). The failure in F2 is a missing directory entry, not a design flaw.
7. **`tests/foundation-browser/entity-read-route-adapter.spec.ts` is a well-built framework test** — it esbuilds
   the *real* Studio and Mesh page exports and the real `renderEntityReadRoute`, and stubs only Next's
   `next/navigation` and the read surface. It is CI-wired via `test:country-browser` and covers `[entityCode]`
   with segments `[]`, `["manage"]`, `["<uuid>"]` and identical not-found semantics across all three planes.
8. **`server/packages/services/records` is the best-covered part of the Country chain** — 30+ co-located
   `__tests__/*.test.ts` files, including authorization (`entity-authorization.test.ts`,
   `entity-backend-authorizer.test.ts`, `entity-backend-isolated-execution.test.ts`,
   `canonical-read-backend.test.ts`), tenant/scope (`multi-scope-query.test.ts`,
   `parent-collection-scope.test.ts`, `entity-scope-adapter.test.ts`, `collection-scope-sql.test.ts`) and route
   contracts (`entity-list-read-routes.test.ts`, `records-query-contract.test.ts`, `localized-error-routes.test.ts`).

## 3. CHECKED BUT NOT A DEFECT

- **`tests/foundation-browser/entity-list-plane-parity.spec.ts:30-31`** appears unresolved to a strict resolver
  (`./packages/platform/entity/runtime/list-view/src/index`, `…/api-client/src/entity-list`). It is a string
  inside an esbuild `stdin.contents` bundle with `resolveDir: process.cwd()`, and esbuild resolves extensionless
  specifiers (`index.tsx`, `entity-list.ts`). Both targets exist. **Not a defect.**
- **`tests/foundation-browser/detail-collaboration.spec.ts:9`** — the `require('./tooling/…/localized-reference-fixture.ts')`
  is inside a `-e` argument string executed in a child process, not a static import; the file exists. **Not a defect.**
- **`tooling/scripts/policy/verify-server-rebuild-boundaries.test.mjs:69,162`** — `@athyper/server-contract-foo`
  is a fabricated fixture string inside a `write(...)` helper, deliberately non-existent. **Not a defect.**
- **`packages/platform/entity/runtime/list-view/src/entity-location.ts`** being untested is recorded as a gap
  (F8) but the function is only 4 lines and has exactly one consumer; it is not dead code.
- **`server/packages/services/records/src/list-scope-coordinate.ts`** has no direct test, but it is imported by
  `entity-list-routes.ts:5`, which is covered by `multi-scope-query.test.ts` and `parent-collection-scope.test.ts`
  (parent-scope rejection is `list-scope-coordinate.ts:6-7`, matching `INVALID_PARENT_CONTEXT`). **Not a gap.**
- **`config/environment.ts` and `kernel/container.js`** imports in `routes.test.ts:3-4` do resolve (only line 5 is
  broken); I verified the `../../../../` walk lands on `server/apps/platform-host/src/`.
- **The reachability report `governance/policy/reports/test-reachability-retirement.json`** exists and is
  committed (last touched by `8c997a7e7`); the gate throws before it reaches the staleness comparison, so the
  report content is not itself a finding.
- **`tests/foundation-browser/entity-read-route-adapter.spec.ts`'s five-spec `test:country-browser` list** — all
  five files exist at the cited paths. The script is correct; only its *scope* is narrow (F6).
- **`test:operations` glob completeness for the directories it claims** — `tooling/scripts/{verification,release,rehearsal,acceptance}/*.test.mjs`
  and `deploy/compose/tests/*.test.mjs` are matched; the only escapees are the nested/`.mts` case in F7.

## 4. NET EFFECT ON THE SHIPPED COUNTRY ROUTE

`pnpm test` cannot complete on this checkout. In order: `test:reachability` fails (F2) → `test:root` aborts →
`test:country-browser` (the Country read-route browser qualification) never runs. Independently,
`test:workspace` is red from 10 files that cannot collect (F1b, F1c, F1d), and `test:foundation` is red from 2
more (F1a) plus 3 real assertion failures (F9). CI's static-policy job is red from `policy:frontend-spine` (F3)
and `policy:theme-token-integrity:strict` (F4). The two gates that guard presentation quality
(`policy:design-system`, `policy:style-tokens:strict`) are green. `policy:i18n` is red but never executed (F5).
Forty-six browser specs — including three that target Country specifically — have never run in CI (F6).

## 5. IMPORT-SWEEP METHODOLOGY AND FALSE POSITIVES

The sweep scanned 996 test/spec files, stripped comments, single/double-quoted strings and template literals
(browser-injected bundler payloads are not static imports), and extracted every `import … from`, bare `import`,
dynamic `import()` and `require()`. Specifiers were resolved against the filesystem using the extension-swap rules
the toolchain uses (`./x.js` → `x.ts`/`x.tsx`/`x.d.ts`, extensionless → `.ts`/`.tsx`/…, directory → `index.*`), and
`@athyper/*` specifiers were resolved through each package's `package.json` `exports` map with a `dist/*.js` →
`src/*.ts` fallback. 23 raw hits remained; 5 were confirmed false positives (listed in §3) and 18 are F1.

One caveat worth stating: the sweep's first pass reported line numbers one less than the truth because the
leading-character group in the import regex consumed the preceding newline. **Every line number in this report was
re-derived with `grep -n`/`nl -ba` against the file** and does not rely on the sweep's numbering.
