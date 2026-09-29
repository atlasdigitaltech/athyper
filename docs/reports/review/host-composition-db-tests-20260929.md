# READ-ONLY Review — platform-host composition, db scripts, repo tests

Review of the TypeScript monorepo at `/home/chandravel_natarajan/src/athyper`
with a **large uncommitted refactor in flight** and other agents editing files
concurrently.

---

## Snapshot (HEAD hash, time, coverage count)

| Fact | Value |
| --- | --- |
| Repo | `/home/chandravel_natarajan/src/athyper` |
| HEAD (full) | `63fc9492b361e97b9edf024be5fb7fb1d38fd4a5` |
| HEAD (short) | `63fc9492b` |
| HEAD re-verified at end of review | `63fc9492b` (unchanged) |
| Review started | `2026-09-29T23:16:41+08:00` |
| Review report written | `2026-09-29T23:25:00+08:00` (approx.) |
| `git status --porcelain` entries | **106** (29 deletions, 47 modifications, 30 untracked) |
| `git diff --stat` (unstaged) | 84 files, `+101014 / −45840` (dominated by regenerated `governance/config/governance/authorization-inventory.v1.json`, 133 321 lines) |
| Staged diff | empty (`git diff --cached --stat` produced nothing) |
| Scope files enumerated | **566** `.ts`/`.tsx` files |
| Scope lines enumerated | **82 068** |

Scope breakdown (enumerated by `find`, counts re-verified after the review):

| Tree | Files | Lines |
| --- | --- | --- |
| `server/apps/platform-host/src/**` | 238 | 33 384 |
| `server/db/scripts/**` (`.ts`/`.tsx` only) | 153 | 26 185 |
| `tests/**` (`.ts`/`.tsx` only) | 175 | 22 499 |
| **Total** | **566** | **82 068** |

**Read-only compliance:** no source file was created, modified, or deleted. No
build, test, migration, or server was run. The only file written is this report.

**Concurrency caveat:** another agent is editing the same tree. All line numbers
below were captured against the working tree at the timestamps above and were
re-read immediately before quoting; a later editor may shift them. The 29
deletion paths are stable because they are git-index state.

---

## Coverage

### Method and honest depth statement

Full line-by-line reading of all 82 068 lines in a single pass was not
achievable. What was actually done, in decreasing order of strength:

1. **Full enumeration** of all 566 scope files, with line counts (`find`/`wc`).
2. **Repository-wide mechanical sweeps over every file** (3 655 `.ts/.tsx/.mts/.mjs`
   files repo-wide, including all 566 in scope): relative-import target
   resolution; removed-symbol reference search; `JSON.parse`; `catch {}`;
   `process.exit`; `.then(` without catch; destructive SQL verbs;
   credential-looking literals; SQL string interpolation; `it.skip/only/todo`;
   assertion counting.
3. **Diff-based integrity proof for the whole refactor**: every deleted→successor
   pair was compared with `diff` against `git show HEAD:<path>` (byte-identical
   except import depth/name), and every deleted test was compared with its
   surviving counterpart. This is exhaustive for the refactor.
4. **Deep read of 60 high-value files** (~4 500 lines): all kernel, config
   validation/profile, the composition entry points, the authorization/scope/
   permission registration paths, the verification registrar, the workspace
   registrar, and the destructive/credential-handling DB scripts.
5. **Partial read of the largest composition files** — stated per file below.

### Verdict table — scope trees

Per-area numbers below are exact (programmatically summed); "Depth" states what
was actually read.

| Area (all files enumerated) | Files | Lines | Depth | Verdict |
| --- | --- | --- | --- | --- |
| `server/apps/platform-host/src/.` (root, `main.ts`) | 1 | 4 | sweep | clean |
| `server/apps/platform-host/src/__tests__/` | 1 | 864 | sweep | clean |
| `.../src/kernel/` (non-test) | 7 | 533 | **full read** | F4, F11 |
| `.../src/kernel/__tests__/` | 1 | 22 | full read | clean |
| `.../src/config/` (non-test) | 11 | 1 546 | **partial read**: `environment.ts` 278–540, 808–870, 1060–1129 of 1266; `deployment-profile.ts`, `validation.ts` full; rest sweep | F4 |
| `.../src/entrypoints/` | 4 | 103 | diff read of `control-api.ts`; sweep of the rest | F13 |
| `.../src/diagnostics/**` | 6 | 320 | sweep | clean |
| `.../src/scripts/**` | 5 | 1 673 | sweep | clean |
| `.../src/development/**` | 9 | 2 078 | full read of `publication-workload.ts`; sweep of the rest | F6 |
| `.../src/composition/*.ts` (root) | 5 | 6 359 | `register-services.ts` **partial** (~700 of 4 896 lines: 505–625, 890–1050, 1290–1365, 1655–1712, 2925–3015, 3490–3930, 4000–4080, 4526–4645); `register-platform.ts` 1–210 of 1 179; rest sweep | F1, F6, F7, F11, F18 |
| `.../composition/control-plane/**` | 3 | 108 | full read (identical move) | clean |
| `.../composition/control-plane/__tests__/` | 2 | 120 | full read (diff) | clean |
| `.../composition/coordination/entity-release-review/` | 2 | 224 | full read (identical move) | clean |
| `.../composition/infrastructure/**` | 14 | 1 382 | full read of `database-selection.ts`, `authorization-writer-databases.ts`, `database-qualification.ts`; sweep of rest | F6 |
| `.../composition/infrastructure/__tests__/` | 7 | 545 | full read (diffs) | clean |
| `.../composition/runtimes/**` | 4 | 361 | full read of `http.ts`; partial of `scheduler.ts` (20–45); sweep | F12 |
| `.../composition/shared/` (verification.ts) | 1 | 1 099 | 1–199 full; remainder sweep | F1 |
| `.../composition/shared/collaboration/**` | 5 | 456 | full read of `section-providers.ts`; sweep | clean |
| `.../composition/shared/collaboration/__tests__/` | 1 | 321 | diff read | clean |
| `.../composition/shared/documents/**` | 1 | 116 | sweep | clean |
| `.../composition/shared/documents/__tests__/` | 1 | 143 | sweep | clean |
| `.../composition/shared/entity-governance/**` | 10 | 865 | full read of `meta-entity-activation-inspection.ts` (diff); sweep | clean |
| `.../composition/shared/entity-governance/__tests__/` | 1 | 37 | sweep | clean |
| `.../composition/shared/entity-runtime/**` | 28 | 2 480 | **full read** of `metadata-validation.ts`, `scope-registry.ts`, `permission-transitions.ts`, `http-registrars.ts`, `read-bindings.ts`, `activity-presentation.ts`; sweep of the rest | F7 |
| `.../composition/shared/entity-runtime/__tests__/` | 18 | 1 786 | diff read of the touched tests; sweep | clean (behaviour change validated by the updated test) |
| `.../composition/shared/identity/**` | 8 | 749 | **full read** of `authority.ts`; sweep | clean |
| `.../composition/shared/identity/__tests__/` | 1 | 97 | sweep | clean |
| `.../composition/shared/publication/**` | 22 | 1 629 | full read of `runtime-qualification.ts`, `workload-routes.ts`/`workload-configuration.ts`/`compilation-recovery-execution.ts` (diff); sweep | clean |
| `.../composition/shared/publication/__tests__/` | 14 | 1 202 | diff read; sweep | clean |
| `.../composition/shared/verification/__tests__/` | 1 | 236 | **full read** | F2 |
| `.../composition/spaces/**` (mesh, neon, neon/ai, studio) | 19 | 2 893 | full read of `mesh/exchange-readiness.ts`, `supplier-information-escalation.ts`, `register-studio-onboarding.ts`; sweep | clean |
| `.../composition/spaces/**/__tests__/**` | 8 | 1 007 | full read of `mesh-exchange-readiness.postgres.test.ts`; sweep | clean |
| `.../composition/**/__tests__/**` (all platform-host test files) | 85 | 9 572 | full read of the refactor-touched tests; skip/assert sweep over all | F2, F19 |
| `server/db/scripts/**` | 153 | 26 185 | **full read** of `operations/authorization/reset-authorization-clean-slate.ts` (153) and `tools/introspection/extract-seed-data.ts` (204); partial read of `provisioning/safe-provision.ts` 1–140, `provisioning/provision-three-plane.ts` 100–160, `operations/repair/repair-tenant-ledger-hashes.ts` 150–190, `operations/iam/reconcile-runtime-subjects.ts` 60–95, `tests/integration/ci-integrity.ts` 95–174, `checks/seeds/authorization-release-live.ts` 55–82/178–190; destructive-SQL / credential / transaction / interpolation sweep over all 153 (incl. `provisioning/` 29 files 6 433 lines, `seed/` 20 files 4 052, `__tests__/` 39 files 4 137, `operations/` 21 files 2 102) | F5, F10, F14 |
| `tests/**` | 175 | 22 499 | **full read** of `foundation/atlas-record-question.test.ts`, `contracts/relay-common-plane-operations.test.ts`, `foundation/entity-form-values.test.ts`, `e2e/visual/pi-fixture.spec.ts`, `foundation/reference-choice-policy.test.ts` 1–30, `foundation-browser/applied-filters.spec.ts` 1–60, diff of `contracts/bff-relay-security.test.ts`; skip/assert/timing/JSON.parse sweep over all 175 (foundation 61/8 408, foundation-browser 55/8 213, contracts 45/4 933, e2e 13/901) | F3, F9, F15, F16, F17 |

### Verdict table — files read in depth

| File | Lines | Verdict |
| --- | --- | --- |
| `server/apps/platform-host/src/kernel/container.ts` | 290 | clean |
| `.../kernel/capability-registration.ts` | 48 | F11 |
| `.../kernel/registration-plan.ts` | 23 | clean |
| `.../kernel/bootstrap.ts` | 48 | clean |
| `.../kernel/launch.ts` | 50 | F13 |
| `.../kernel/module-registry.ts` | 29 | clean |
| `.../kernel/deployment-environment.ts` | 45 | clean |
| `.../config/deployment-profile.ts` | 37 | clean |
| `.../config/validation.ts` | 13 | clean |
| `.../composition/shared/identity/authority.ts` | 200 | clean (silent-skip note) |
| `.../composition/shared/verification.ts` (1–199) | 1 099 | F1 |
| `.../composition/shared/verification/__tests__/routes.test.ts` | 236 | F2 (dangling import) |
| `.../composition/shared/entity-runtime/scope-registry.ts` | 49 | clean (fails closed) |
| `.../composition/shared/entity-runtime/permission-transitions.ts` | 33 | clean |
| `.../composition/shared/entity-runtime/http-registrars.ts` | 145 | clean |
| `.../composition/shared/entity-runtime/read-bindings.ts` | 34 | clean |
| `.../composition/shared/entity-runtime/metadata-validation.ts` | 62 | F7 |
| `.../composition/shared/entity-runtime/activity-presentation.ts` | 101 | clean (behaviour change validated) |
| `.../composition/runtimes/http.ts` | 133 | clean |
| `.../composition/runtimes/scheduler.ts` (20–45) | 70 | F12 |
| `.../composition/infrastructure/database-selection.ts` | 58 | clean |
| `.../composition/spaces/mesh/exchange-readiness.ts` | 49 | clean |
| `.../composition/spaces/mesh/__tests__/mesh-exchange-readiness.postgres.test.ts` | 45 | clean (0 JS asserts, SQL asserts) |
| `.../development/publication-workload.ts` | 175 | clean |
| `.../composition/control-plane/control-plane.ts` | 37 | clean (identical move) |
| `.../composition/coordination/entity-release-review/release-review.ts` | 13 | clean (identical move) |
| `.../composition/shared/collaboration/section-providers.ts` | 21 | clean (identical move) |
| `.../composition/shared/publication/runtime-qualification.ts` | 16 | clean (identical move) |
| `.../composition/spaces/neon/supplier-information-escalation.ts` | 9 | clean (identical move) |
| `.../composition/spaces/studio/onboarding/register-studio-onboarding.ts` | 111 | clean (move + import depth) |
| `.../kernel/__tests__/capability-registration.test.ts` | 22 | clean |
| `server/db/scripts/operations/authorization/reset-authorization-clean-slate.ts` | 153 | F5 |
| `server/db/scripts/tools/introspection/extract-seed-data.ts` | 204 | F14 |
| `server/db/scripts/provisioning/safe-provision.ts` (1–140) | 1 000+ | clean (strong guards) |
| `server/db/scripts/provisioning/provision-three-plane.ts` (100–160) | 260+ | clean |
| `server/db/scripts/operations/repair/repair-tenant-ledger-hashes.ts` (150–190) | 202 | clean |
| `server/db/scripts/operations/iam/reconcile-runtime-subjects.ts` (60–95) | 147 | clean |
| `server/db/scripts/tests/integration/ci-integrity.ts` (95–174) | 704 | clean (low-risk interpolation) |
| `tests/foundation/atlas-record-question.test.ts` | 20 | F3 |
| `tests/foundation/reference-choice-policy.test.ts` (1–30) | 93 | F9 |
| `tests/contracts/bff-relay-security.test.ts` (diff) | ~380 | F15 |
| `tests/contracts/relay-common-plane-operations.test.ts` | 35 | clean |
| `tests/foundation/entity-form-values.test.ts` | 30 | clean |
| `tests/e2e/visual/pi-fixture.spec.ts` | 50 | F10 |
| `tooling/scripts/testing/verify-test-reachability.mjs` (out of scope, needed) | 281 | F8 |

---

## Refactor integrity (dangling references, lost coverage)

### Deleted path → successor map (each verified by `diff` against `git show HEAD:<path>`)

| Deleted (HEAD) | Successor in working tree | Diff result |
| --- | --- | --- |
| `composition/control-plane/register.ts` | `composition/control-plane/control-plane.ts` | **identical** |
| `composition/coordination/entity-release-review/register.ts` | `.../entity-release-review/release-review.ts` | **identical** |
| `composition/shared/ai/atlas-attachment-knowledge.ts` | `composition/spaces/neon/ai/atlas-attachment-knowledge.ts` | **identical** |
| `composition/shared/ai/atlas-document-grounding.ts` | `composition/spaces/neon/ai/atlas-document-grounding.ts` | **identical** |
| `composition/shared/ai/atlas-inference-admission.ts` | `composition/spaces/neon/ai/atlas-inference-admission.ts` | **identical** |
| `composition/shared/ai/atlas-record-question.ts` | `composition/spaces/neon/ai/atlas-record-question.ts` | **identical** |
| `composition/shared/ai/atlas-semantic-index.ts` | `composition/spaces/neon/ai/atlas-semantic-index.ts` | **identical** |
| `composition/shared/collaboration/index.ts` | `composition/shared/collaboration/section-providers.ts` | **identical** |
| `composition/shared/entity-runtime/http.ts` | `.../entity-runtime/http-registrars.ts` | **identical except** `./routes.js` → `./read-bindings.js` |
| `composition/shared/entity-runtime/metadata-hooks.ts` | `.../entity-runtime/metadata-validation.ts` | **identical** |
| `composition/shared/entity-runtime/publication-qualification.ts` | `composition/shared/publication/runtime-qualification.ts` | **identical** |
| `composition/shared/entity-runtime/routes.ts` | `.../entity-runtime/read-bindings.ts` | **identical** |
| `composition/shared/publication/workload.ts` | `development/publication-workload.ts` | **identical except** 4 import paths + `Reference*` → `Development*` rename |
| `composition/shared/verification/routes.ts` | `composition/shared/verification.ts` | **identical except** import depth 2→3 and `PlaneKey` moved to `@athyper/server-foundation/context` |
| `composition/spaces/neon/supplier-information-sla.ts` | `composition/spaces/neon/supplier-information-escalation.ts` | **identical** |
| `composition/spaces/studio/trustiam/onb/register.ts` | `composition/spaces/studio/onboarding/register-studio-onboarding.ts` | **identical except** import depth 5→4 |
| `config/deployment-environment.ts` | `kernel/deployment-environment.ts` | **identical** |
| `development/verification-delivery.ts` | **none** | no successor |
| `kernel/capability-readiness.ts` | **none** | no successor |

### Dangling references that this refactor introduced (in scope) — 2, both hard failures

1. `server/apps/platform-host/src/composition/shared/verification/__tests__/routes.test.ts:5`
   still imports the deleted registrar. Finding 2.
2. `tests/foundation/atlas-record-question.test.ts:3` still imports the deleted
   AI module. Finding 3.

No other in-scope file refers to a deleted path or removed symbol. The
repository-wide removed-symbol sweep (`atlasRequestsRecordOverview`,
`parseAtlasSemanticConfig`, `createAtlasSemanticIndex`, `RedisInferenceAdmission`,
`createAtlasAttachmentKnowledge`, `registerAtlasAttachmentKnowledge`,
`createAtlasDocumentGrounding`, `atlasDocumentSearchTerms`, `registerControlPlane`,
`resolveEntityReleaseReview`, `createCollaborationSectionProviders`,
`createEntityHttpRegistrars`, `createEntityResourceHttpRegistrar`,
`createEntityExperienceHttpRegistrar`, `createEntityMetadataHooks`,
`createPublicationRuntimeQualification`, `registerEntityReadHttp`,
`createReferencePublicationWorkload`, `registerVerification`, `executeVerification`,
`sweepSupplierInformation`, `registerStudioOnboarding`, `selectDeploymentEnvironment`,
`EntityReadHttpBindings`, `EntityHttpOptions`) shows every live reference now
resolves to a working-tree definition, except the two above.

### Dangling references outside my scope but caused by the same refactor (report for triage)

| Location | Reference | Status |
| --- | --- | --- |
| `tooling/scripts/verification/qualify-task-response-escalation-db.mts:1` | `.../spaces/neon/supplier-information-sla.js` | deleted; successor `supplier-information-escalation.ts` exists but the specifier was not updated |
| `tooling/scripts/verification/atlas-inference-workload.mjs:9` | `/app/server/dist/composition/shared/ai/atlas-semantic-index.js` | source deleted; breaks on next server build |
| `tooling/scripts/verification/atlas-live-inference-client.mjs:11-12` | `/app/server/dist/composition/shared/ai/{atlas-inference-admission,atlas-semantic-index}.js` | same |
| `tooling/scripts/verification/atlas-distributed-admission-checks.mjs:7` (+ embedded source string at :27) | `/app/server/dist/composition/shared/ai/atlas-inference-admission.js` | same |
| `tooling/scripts/verification/atlas-inference-eviction-reproduction.mjs:21` | resolves the same `dist` path at runtime | same |

`server/apps/platform-host/dist/**` still contains the pre-refactor compiled
`register-services.js` importing all the deleted source paths; it is stale build
output (gitignored) and will disappear on rebuild.

### Deleted tests — coverage restored or lost

| Deleted test | Successor | Coverage verdict |
| --- | --- | --- |
| `composition/shared/ai/__tests__/atlas-attachment-knowledge.test.ts` | `composition/spaces/neon/ai/__tests__/atlas-attachment-knowledge.test.ts` | **identical — restored** |
| `shared/ai/__tests__/atlas-document-grounding.test.ts` | `spaces/neon/ai/__tests__/atlas-document-grounding.test.ts` | **identical — restored** |
| `shared/ai/__tests__/atlas-retrieval-disconnect.test.ts` | `spaces/neon/ai/__tests__/atlas-retrieval-disconnect.test.ts` | **identical — restored** |
| `shared/ai/__tests__/atlas-semantic-index.test.ts` | `spaces/neon/ai/__tests__/atlas-semantic-index.test.ts` | **identical — restored** |
| `shared/publication/__tests__/publication-workload.test.ts` (165) | `development/publication-workload.test.ts` (165) | **identical except import + type rename — restored** |
| `shared/entity-runtime/__tests__/publication-qualification.test.ts` (64) | `shared/publication/__tests__/runtime-qualification.test.ts` | **identical except import specifier — restored** |
| `spaces/neon/__tests__/finance-http-review.test.ts` (615) | `spaces/neon/__tests__/finance-routes.test.ts` (615) | **identical — restored** |
| `src/__tests__/lifecycle.test.ts` (22) | `server/packages/foundation/src/lifecycle/__tests__/lifecycle.test.ts:5-16` | **substance restored** (LIFO order + continue-after-error); only the `createLifecycle()` factory wrapper is no longer directly exercised. Finding 17 (low). |
| `kernel/__tests__/capability-registry.test.ts` (73) | none | **coverage of a deleted module** — `kernel/capability-readiness.ts` had exactly one importer at HEAD: this test. Removing both removes dead code, not live coverage. No replacement of the "fail-closed capability chain" concept is needed because `capability-registration.ts` (kept, tested at `kernel/__tests__/capability-registration.test.ts`) covers the runtime selection chain. **No lost live coverage.** |
| `development/__tests__/local-verification-delivery.test.ts` (27) | none | **coverage of a deleted module** — `queueLocalVerificationEmail` / `localVerificationEmailHandler` had **zero** importers at HEAD besides this test (`git grep` confirmed). The AES-GCM AAD-binding / expiry / tenant-mismatch assertions are gone, but so is the code. **No lost live coverage**; note the deletion removed the only implementation of local contact-verification email delivery. |

### Coverage that the refactor *weakens* without deleting a file

`tests/contracts/bff-relay-security.test.ts` replaced three literal regex
assertions with a parser that reads the expected operation names out of the
production file under test (F15). This is a real strictness reduction,
partly offset by the new `tests/contracts/relay-common-plane-operations.test.ts`.

### Governance artefact / manifest drift

`governance/policy/reports/test-reachability-retirement.json` is a **generated,
byte-compared** report (`tooling/scripts/testing/verify-test-reachability.mjs:271-276`)
and was not regenerated: two new root tests and 42 other files are missing from
it, and it still lists 10 tests that no longer exist. Finding 8.

---

## Findings

### [high] (F1) Verification endpoints authorize on authentication only

**Location** `server/apps/platform-host/src/composition/shared/verification.ts:71`
(also `:86`, `:102-110`, `:113-190`, `:125`, `:176`)

**What is wrong** Both verification routes declare `authenticated: true` and
nothing more. `registerVerification` checks only that the capability is enabled
and that an authenticator exists; the handlers never call
`container.platform.authorizer` and never assert a permission code. The
"functional" run performs privileged synthetic work.

**Evidence**

```ts
// verification.ts:65-79
const snapshotContract = defineRouteContract({
  method: "get",
  path: "/api/platform/verification",
  operationId: "platform.verification.snapshot",
  ...
  authenticated: true,            // <- no permission requirement
```

```ts
// verification.ts:102-110
export function registerVerification(container: Container, config: HostConfig): void {
  if (!config.verification.enabled) return;
  registerWorkerProbe(container);
  const iam = container.platform.iam;
  if (!iam) return;                  // <- only authentication
  const authenticate = createIamAuthenticationMiddleware(iam);
```

The committed test proves the endpoint runs with an empty permission set:

```ts
// verification/__tests__/routes.test.ts:13 / :40-47
permissions: { allowed: [] },
...
const result = await executeVerification(container, config, context, "quick");
expect(result.scope).toBe("all");
expect(result.status).toBe("passed");
```

**Impact scenario** With `PLATFORM_VERIFICATION_ENABLED=true` (the default is
`env === "local"`, but nothing prevents enabling it in staging/production —
`config/environment.ts:1081`), any authenticated principal in any tenant of any
plane can: `GET` a cross-plane, cross-tenant read of database/cache/readiness/
observability state and the Grafana Explore URL; and `POST` a run that writes
and deletes objects in the documents bucket, invokes the malware scanner and
content extractor, renders a PDF, upserts and removes Meilisearch documents, and
sends a real email through the notification channel. This is cross-tenant
infrastructure consumption, outbound mail from a platform address, and
infrastructure reconnaissance by a non-privileged user.

**Suggested fix** Require an explicit platform permission (for example
`studio.platform.verification.run`) through `container.platform.authorizer`
before either handler does work, keep `executeVerification(..., "all")` scope
restricted to that permission holder, and (defence in depth) refuse to register
the routes unless `config.env === "local"` or an explicit
`PLATFORM_VERIFICATION_ALLOW_NON_LOCAL=true` acknowledgement is present.

---

### [high] (F2) Refactor left a test importing the deleted verification registrar

**Location** `server/apps/platform-host/src/composition/shared/verification/__tests__/routes.test.ts:5`

**What is wrong** The test directory survived the move of
`verification/routes.ts` → `verification.ts`, but the import specifier was not
updated. The module no longer exists, so the test file cannot be loaded.

**Evidence**

```ts
// verification/__tests__/routes.test.ts:4-5
import { createContainer } from "../../../../kernel/container.js";
import { executeVerification } from "../routes.js";     // <- ../routes.js is deleted
```

`server/apps/platform-host/src/composition/shared/verification/` now contains
only `__tests__/`; the successor exports `executeVerification` at
`server/apps/platform-host/src/composition/shared/verification.ts:194`.

**Impact scenario** `server/vitest.config.ts:7-10` includes
`apps/**/__tests__/**/*.test.ts`, so this file is collected. `vitest run` for the
platform-host workspace fails at module resolution, which fails the workspace
`test` task and therefore `turbo test` / `pnpm test:repo`. The three verification
behaviours it covers (all-plane quick snapshot, functional probe cleanup,
write-once/delete-authorization race qualification across six race modes) are
unreachable until fixed.

**Suggested fix** Change the specifier to `"../../verification.js"` (the test
lives two directories below `shared/`), or relocate the file to
`composition/shared/__tests__/verification.test.ts` and import
`"../verification.js"`.

---

### [high] (F3) Refactor left a root test importing the deleted Atlas module

**Location** `tests/foundation/atlas-record-question.test.ts:3`

**What is wrong** `composition/shared/ai/atlas-record-question.ts` was moved to
`composition/spaces/neon/ai/atlas-record-question.ts` and the root-level test was
not updated. Unlike the four AI tests that moved with their module, this function
was covered only by this root test, so its coverage is not duplicated anywhere.

**Evidence**

```ts
// tests/foundation/atlas-record-question.test.ts:1-3
import assert from "node:assert/strict";
import test from "node:test";
import { atlasRequestsRecordOverview } from "../../server/apps/platform-host/src/composition/shared/ai/atlas-record-question";
```

The successor exists and is byte-identical
(`server/apps/platform-host/src/composition/spaces/neon/ai/atlas-record-question.ts`),
and the moved AI test directory
(`spaces/neon/ai/__tests__/`) contains only `atlas-attachment-knowledge`,
`atlas-document-grounding`, `atlas-retrieval-disconnect`, `atlas-semantic-index`
— no `atlas-record-question` test.

**Impact scenario** `package.json:77` runs
`tsx --test tests/foundation/*.test.ts tests/foundation/*.test.tsx`, so
`pnpm test:foundation` (and therefore `pnpm test:root` → `pnpm test:repo` →
`pnpm test`) aborts. The regression guard that "record overview" queries bypass
incidental document matches (and that explicit attachment requests stay eligible)
is lost as long as the specifier is broken.

**Suggested fix** Update to
`"../../server/apps/platform-host/src/composition/spaces/neon/ai/atlas-record-question"`
(extensionless, matching the other root tests) and re-run `pnpm test:foundation`.

---

### [high] (F4) Missing environment fails open to `local`, silently downgrading security defaults

**Location** `server/apps/platform-host/src/config/environment.ts:310-317`
(consumed at `:392-396`, `:440-443`, `:513-516`, `:1081`)

**What is wrong** When neither `ATHYPER_ENV`/`ENVIRONMENT` is set to a known
value nor `NODE_ENV === "production"`, the host silently classifies itself as
`local`. Several security-relevant settings are keyed off `env === "local"` and
therefore flip to the permissive value.

**Evidence**

```ts
// environment.ts:310-317
const rawEnv = environment["ATHYPER_ENV"] ?? environment["ENVIRONMENT"];
const env = (["local", "staging", "production"] as const).includes(
  rawEnv as "local" | "staging" | "production",
)
  ? (rawEnv as "local" | "staging" | "production")
  : environment["NODE_ENV"] === "production"
    ? "production"
    : "local";                                   // <- silent fallback to local
```

```ts
// environment.ts:392-396  (claim context enforcement downgraded to shadow)
const claimContextMode = readChoice(
  "AUTH_CLAIM_FIRST_CONTEXT",
  env === "production" ? "enforce" : "shadow",
  ["off", "shadow", "enforce", "on"] as const,
);
// environment.ts:440-443  (shared BullMQ/Redis allowed)
const allowSharedBullMqRedis = readBoolean("ALLOW_SHARED_BULLMQ_REDIS", env === "local");
// environment.ts:1081  (privileged verification endpoints on)
enabled: readBoolean("PLATFORM_VERIFICATION_ENABLED", env === "local"),
// environment.ts:513/516  (legacy S3 keys accepted)
(env === "local" ? environment["S3_ACCESS_KEY"]?.trim() : undefined);
```

**Impact scenario** A container deployed with `NODE_ENV=Production`, or with
`NODE_ENV` unset (common for Node images that set the env var elsewhere), and
without `ATHYPER_ENV` is treated as `local`: `AUTH_CLAIM_FIRST_CONTEXT` becomes
`shadow` so inbound claim-context mismatches are logged rather than rejected;
BullMQ is allowed to share the cache Redis instance (job-store isolation lost);
the verification endpoints of F1 switch on; legacy `S3_ACCESS_KEY`/
`S3_SECRET_KEY` are accepted. Nothing in startup reports that a production-like
deployment downgraded to local semantics.

**Suggested fix** Fail fast: require an explicit, recognised `ATHYPER_ENV` in
production deployments (e.g. throw when `NODE_ENV === "production"` and
`rawEnv` is absent), or make the fallback `"production"` and require an explicit
`ATHYPER_ENV=local` for the local behaviours. Log the resolved `env` and the
source (`ATHYPER_ENV` vs `NODE_ENV`) at startup — `bootstrap.ts:13` currently logs
only the deployment profile.

---

### [medium] (F5) Clean-slate authorization reset mass-updates every principal with no `WHERE`

**Location** `server/db/scripts/operations/authorization/reset-authorization-clean-slate.ts:85-89`

**What is wrong** The principal invalidation is an unbounded `UPDATE` with no
predicate, while the tenant invalidation immediately below it *is* explicitly
scoped. The script holds `set_config('app.database_plane',$1,true)` but does not
constrain rows by tenant or plane, and it records no precondition on the affected
row count.

**Evidence**

```ts
// reset-authorization-clean-slate.ts:85-96
const principalInvalidation = await client.query(`
  UPDATE master.principal
     SET auth_epoch = auth_epoch + 1,
         updated_by = '00000000-0000-0000-0000-000000000000'::uuid
`);                                              // <- no WHERE
invalidatedPrincipalCount = principalInvalidation.rowCount ?? 0;
const tenantInvalidation = await client.query<{ tenant_id: string }>(`
  SELECT tenant.id::text AS tenant_id
    FROM master.tenant AS tenant
    CROSS JOIN LATERAL event.fn_authorization_bump_epoch('plane', tenant.id, $1) AS epoch
   ORDER BY tenant.id
`, [plane]);
```

The blast radius is limited because the guard pins the target database to
`athyper_<plane>` (`safe-provision.ts:268`,
`row.database_name !== approval.expectedDatabase`), and the command requires
`--reset` plus a disposable-environment marker
(`safe-provision.ts:45-100`, `:212-300`). The update is nevertheless unbounded
across tenants inside that database and is executed *before* the postcondition
that raises `${plane} clean-slate postcondition failed`.

**Impact scenario** Running the reset against a shared per-plane database that
hosts several tenants invalidates the sessions of every principal of every
tenant in that plane — including tenants the operator did not intend to touch —
with no pre-flight count and no rejection if the count is unexpectedly large.
Because `COMMIT` happens at `:98` and `applyAuthorizationSeedPack` runs only
afterwards at `:106`, a failure in the re-seed also leaves the plane with
truncated authorization tables and globally bumped epochs. The receipt does print
`invalidatedPrincipalCount`, but only after the fact.

**Suggested fix** Scope the update (e.g. `WHERE tenant_id = ANY($1::uuid[])`
derived from an explicit `--tenant` set, or `WHERE status <> 'retired'`), assert
the expected affected-row count before `COMMIT`, and move
`applyAuthorizationSeedPack` into the same transaction (or into an explicitly
compensated two-phase step) so a re-seed failure cannot leave a truncated plane.

---

### [medium] (F6) Operator-supplied JSON config files are parsed without error handling

**Location** `server/apps/platform-host/src/composition/register-services.ts:3586-3588`;
also `.../composition/shared/publication/workload-configuration.ts:38`,
`.../composition/infrastructure/authorization-writer-databases.ts:13`,
`.../composition/coordination/entity-release-review/deployment.ts:195`,
`.../development/publication.ts:152`,
`.../entrypoints/control-api.ts:43`,
`.../config/contact-verification.ts:18`

**What is wrong** Seven composition/entrypoint call sites call `JSON.parse` on
file contents with no `try`/`catch`, so a malformed or truncated file produces a
raw `SyntaxError` with no error code and no file path, thrown from inside
composition where the surrounding handlers cannot classify it. Two comparable
sites do it correctly (`config/publication-policy.ts:41`,
`shared/identity/authority.ts:191-198`), and the refactored
`development/publication-workload.ts` was moved into a module whose test even
asserts a closed import allow-list — so this is an inconsistent, not universal,
pattern.

**Evidence**

```ts
// register-services.ts:3583-3589
const semanticConfigPath = process.env["ATLAS_SEMANTIC_RETRIEVAL_CONFIG_PATH"];
const semantic = semanticConfigPath
  ? parseAtlasSemanticConfig(
      JSON.parse(readFileSync(semanticConfigPath, "utf8")),   // <- no try/catch
    )
  : undefined;
```

```ts
// shared/publication/workload-configuration.ts:38
return parsePublicationWorkloadConfiguration(JSON.parse(readFileSync(path, "utf8")), env, environment);
```

```ts
// infrastructure/authorization-writer-databases.ts:11-13
let input: any;
try { ... } // size check only
input = JSON.parse(readFileSync(path, "utf8"));   // <- no try/catch: feeds authz writer connection strings
```

**Impact scenario** A copy-paste error or partial write in
`ATLAS_SEMANTIC_RETRIEVAL_CONFIG_PATH` crashes API/worker/scheduler bootstrap
with `Unexpected token } in JSON at position N` and no indication of which file
or which setting; the same for the authorization-writer connection file, whose
failure surfaces inside authorization composition. Operators get an
unclassifiable boot failure; the error-collector records a bare `SyntaxError`.

**Suggested fix** Introduce one helper (for example
`readJsonFile(path, code)` in `config/`) that wraps `readFileSync` +
`JSON.parse` and throws `Error(code, { cause })` with the path in the message,
and route all seven call sites through it.

---

### [medium] (F7) Metadata validation hooks are dead code — declared requirements are never enforced

**Location** `server/apps/platform-host/src/composition/shared/entity-runtime/metadata-validation.ts:17`
(renamed from `metadata-hooks.ts` by this refactor)

**What is wrong** `createEntityMetadataHooks` — the only implementation of the
metadata context/reference requirement hooks — is never imported by any file.
It exports `validateContext` (which rejects `ENTITY_METADATA_CONTEXT_REQUIRED`
and `ENTITY_METADATA_CONTEXT_INVALID`) and `validateReferences` (which rejects
`ENTITY_METADATA_REFERENCE_INVALID` / `ENTITY_METADATA_REFERENCE_INACTIVE`), and
it accepts trust inputs (`contextRequirements`, `referenceRequirements`,
`referenceActive`) that no composition site supplies.

**Evidence**

```ts
// metadata-validation.ts:15-25
/** Generic validation hook contracts. Metadata declares requirements; a trusted
 * composition adapter resolves coordinates and reference-domain membership. */
export function createEntityMetadataHooks(input: {
  readonly contextRequirements?: readonly EntityMetadataContextRequirement[];
  readonly referenceRequirements?: readonly EntityMetadataReferenceRequirement[];
  readonly referenceActive?: (
    context: VerifiedRequestContext, domain: string, value: string,
  ) => Promise<boolean>;
}) {
```

Repository-wide symbol search (all `.ts`/`.tsx`/`.mts`/`.mjs`, excluding
`node_modules`/`dist`) returns exactly one hit — this definition. The same was
true at HEAD for the deleted `metadata-hooks.ts`, which this refactor moved
byte-for-byte (the file diff is empty), so the refactor preserved a pre-existing
gap in the metadata-hooks plane that the task asked to be checked.

**Impact scenario** Published metadata that declares `requiredCoordinates` for an
operation, or a reference domain for a field, is never validated at runtime by
this hook: requests missing required coordinates are accepted, and references to
inactive/unavailable records in a declared domain are accepted. The failure is
fail-open, which is exactly the class the task calls out for metadata hooks.

**Suggested fix** Either wire the hooks into the records/mutations composition
path (`createEntityServices`/`registerEntityReadHttp` consumers) supplying
`referenceActive` from the shared reference directory, or delete the module and
the corresponding metadata contract so the capability stops being advertised to
metadata authors.

---

### [medium] (F8) Generated test-reachability report is stale — `pnpm test:reachability` throws

**Location** `governance/policy/reports/test-reachability-retirement.json`
(compared by `tooling/scripts/testing/verify-test-reachability.mjs:271-276`)

**What is wrong** The report is committed and compared byte-for-byte against a
freshly generated one. This refactor added two root test files but did not
regenerate it. The drift is wider than this refactor (the report also lists 10
`tests/contracts` / `tests/foundation` files that no longer exist), so the check
was already failing; the refactor adds two more missing entries.

**Evidence**

```js
// tooling/scripts/testing/verify-test-reachability.mjs:271-276
const committedReport = readFileSync(reportPath, "utf8");
if (committedReport !== serializedReport) {
  throw new Error(
    `Retirement report is stale: ${relativePath(reportPath)}. Run pnpm test:reachability:update.`,
  );
}
```

Missing entries introduced by the refactor:
`tests/contracts/relay-common-plane-operations.test.ts`,
`tests/foundation/entity-form-values.test.ts`. Pre-existing drift (42 missing,
10 report-only) includes `tests/contracts/app-relay-composition.test.ts`,
`tests/contracts/business-partner-r2-contracts.test.ts` (report-only),
`tests/foundation/entity-form-values.test.ts`, `tests/foundation/reference-choice-policy.test.ts`
and others.

**Impact scenario** `package.json:66` puts `test:reachability` first in
`test:root`, and `test:repo` → `test:root`, so `pnpm test` fails before any test
runs. The report also no longer documents the two new root tests, so the
`test:foundation` / `test:plane-contracts` runner mapping for them is unverified.

**Suggested fix** Run `pnpm test:reachability:update` and commit the regenerated
report as part of the refactor; consider making the script list the differing
paths in the error message so the drift is actionable.

---

### [medium] (F9) A root foundation test imports a module that does not exist (pre-existing)

**Location** `tests/foundation/reference-choice-policy.test.ts:7`

**What is wrong** The test imports `withBusinessPartnerReferenceHistory` from a
provisioning module that is not present anywhere in the repository — not in the
working tree and not in HEAD.

**Evidence**

```ts
// tests/foundation/reference-choice-policy.test.ts:3-7
import {
  parseRecentChoicePolicy,
  parseEntityIntakeSurfaces,
} from "../../packages/contracts/platform/entity-runtime/src/index";
import { withBusinessPartnerReferenceHistory } from "../../server/db/scripts/provisioning/business-partner-data-surfaces";
```

`server/db/scripts/provisioning/` contains 34 files (apply-authorization-seed-pack,
provision-three-plane, safe-provision, …) and **none** matching
`business-partner-*`; `git ls-tree -r HEAD | grep business-partner-data-surfaces`
returns nothing. The same pattern breaks
`server/db/scripts/__tests__/provisioning/business-partner-{labels,r2,r5,r7}-fixtures.test.ts`
and `development-business-partner-*.test.ts`, which import
`../../provisioning/business-partner-*` / `development-business-partner-*` — also
absent. `server/packages/services/master-data/src/` contains only `index.ts`, so
`server/db/scripts/tests/integration/*.mts` imports of
`.../master-data/src/kysely-business-partner-case-repository.js` are dangling too.

**Impact scenario** `pnpm test:foundation` and the db-script provisioning tests
cannot load; the reference-history policy parsing coverage and the provisioning
fixture checks are unreachable. This is **not** caused by the refactor under
review (these paths were never in HEAD), but it means the suite is red for
reasons unrelated to the in-flight change and should be triaged separately so it
does not mask the two failures this refactor introduced.

**Suggested fix** Restore the removed modules or retarget these tests to their
successors; if the functionality was deliberately retired, delete the affected
test files in the same change so `test:foundation` is meaningful again.

---

### [medium] (F10) Clean-slate reset applies the seed pack outside the transaction

**Location** `server/db/scripts/operations/authorization/reset-authorization-clean-slate.ts:98-107`

**What is wrong** The destructive transaction commits at `:98`; the re-seed
(`applyAuthorizationSeedPack`) then runs in a separate connection/step at `:106`,
followed by an independent verification client. If the seed application fails,
the plane is left truncated with bumped epochs and no authorization data, and the
script exits non-zero before the postcondition check at `:131-135`.

**Evidence**

```ts
// reset-authorization-clean-slate.ts:98
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}

const applied = await applyAuthorizationSeedPack({ plane, databaseUrl });
const verification = new pg.Client({ connectionString: databaseUrl, application_name: `authorization-clean-slate-verify-${plane}` });
```

**Impact scenario** A failure to apply the seed pack after the truncate leaves a
database with empty `authz.*` tables (no permissions, roles, or bindings) and
`auth_epoch` bumped for every principal. Every subsequent authorization decision
in that plane evaluates against an empty catalog until an operator re-runs the
seed step manually — an availability and authorization-data outage, not just a
failed script.

**Suggested fix** Apply the seed pack inside the same transaction (or use a
single `psql` session with `BEGIN … TRUNCATE … seed … COMMIT`), or at minimum
make the verification step a hard precondition and emit an explicit
`OPERATOR_RECOVERY_REQUIRED` receipt when the post-commit seed fails.

---

### [low] (F11) `entity.http` capability is declared but never enforced at the registration site

**Location** `server/apps/platform-host/src/kernel/capability-registration.ts:13`
vs `server/apps/platform-host/src/composition/register-services.ts:2971-2986`

**What is wrong** The capability registry declares an api-only HTTP capability,
but production composition never registers through it, so its `HOST_CAPABILITY_ROLE_EXCLUDED`
guarantee exists only in the unit test. Actual HTTP mounting is gated by an
ad-hoc condition on `config.mode`.

**Evidence**

```ts
// kernel/capability-registration.ts:13
"entity.http": { planes: allPlanes, roles: ["api"] },
```

```ts
// register-services.ts:2971-2973
container.platform.httpRegistrars.push(entityHttp.activity);
if (!config || config.mode === "api")
  container.platform.httpRegistrars.push(entityHttp.read);
```

```ts
// register-services.ts:2986
container.platform.httpRegistrars.push(entityHttp.records);   // unconditional
```

The only other references to `entity.http` are the declaration and
`server/apps/platform-host/src/kernel/__tests__/capability-registration.test.ts:14`.

**Impact scenario** Latent today: workers and schedulers never build an HTTP
application, so the unconditionally queued registrars are never mounted. But the
declared invariant is not the enforced one — if a future entry point mounts
`httpRegistrars` while `config` is undefined (a direct composition caller such as
`scripts/recover-dev-publication.ts`), read routes are registered regardless of
role, and the failure is silent rather than `HOST_CAPABILITY_ROLE_EXCLUDED`.

**Suggested fix** Wrap the HTTP registrar construction in
`capabilityRegistration.register("entity.http", …)` so an out-of-role or
out-of-plane request fails loudly at composition time, and drop the ad-hoc
`config.mode` check.

---

### [low] (F12) Scheduler swallows the maintenance error object

**Location** `server/apps/platform-host/src/composition/runtimes/scheduler.ts:31-37`

**What is wrong** The queue-maintenance sweep catches and discards the error,
logging a constant string. The only other signal is a `lastSuccess` gauge.

**Evidence**

```ts
sweep = maintenance
  .run()
  .then(() => { lastSuccess?.set(Date.now() / 1000); })
  .catch(() => console.error("[scheduler] queue_maintenance_failed"))
  .finally(() => { sweep = undefined; });
```

**Impact scenario** A persistent failure (bad Redis credentials, missing queue,
permission error) produces an endless identical log line with no cause; the
operator sees no error text and no error-collector entry, and the failure is only
visible as a stale `lastSuccess` metric. Time-to-diagnosis for a background job
that reconciles all queues is arbitrarily long.

**Suggested fix** Log the message (and optionally `captureOperationalError`):
`.catch((error) => console.error("[scheduler] queue_maintenance_failed", error instanceof Error ? error.message : error))`.

---

### [low] (F13) Control plane now loads dotenv through the shared launch policy and loses its specific startup diagnostic

**Location** `server/apps/platform-host/src/entrypoints/control-api.ts:94` →
`server/apps/platform-host/src/kernel/launch.ts:16-49`

**What is wrong** The isolated control process previously ran its own
`start().catch(...)` that printed an operator-specific failure message and never
read `.env`. It now calls `void launchControlApi()`, which shares `launch()` with
the customer-plane entry points: that loads `dotenv` whenever
`NODE_ENV !== "production"` and reports failures as generic `[fatal] boot_failed`.

**Evidence**

```ts
// entrypoints/control-api.ts (diff, previously)
-start().catch(() => { console.error("CONTROL_PLANE_STARTUP_FAILED: verify configuration, mounted credentials, database grants and issuer readiness"); process.exitCode = 1; });
+void launchControlApi();
```

```ts
// kernel/launch.ts:26-39
export async function launchControlApi(): Promise<void> {
  await launch(async () => {
    await (await import("../entrypoints/control-api.js")).startControlApi();
  });
}
async function launch(start: () => Promise<void>): Promise<void> {
  try {
    if (process.env["NODE_ENV"] !== "production") {
      const { config } = await import("dotenv");
      config();
    }
```

`entrypoints/control-api.ts` is still import-boundary-tested
(`composition/control-plane/__tests__/control-plane.test.ts:71-82`) and the
`../kernel/launch.js` import was added to the allow-list.

**Impact scenario** The control plane is deliberately kept free of combined
configuration and customer-plane composition; loading `.env` from the process
working directory reintroduces ambient configuration into that process (any
`.env` a container image happens to carry can now influence control-plane
settings). On failure, the operator loses the message that tells them to check
mounted credentials, database grants, and issuer readiness — the generic
`[fatal] boot_failed` and error-collector entry are less specific.

**Suggested fix** Give `launchControlApi` an option to skip dotenv loading, or
have `launch()` skip it for the control path; keep a control-specific
`console.error("CONTROL_PLANE_STARTUP_FAILED: …")` line in the failure branch.

---

### [low] (F14) Hardcoded database credential fallback in a dev seed extractor

**Location** `server/db/scripts/tools/introspection/extract-seed-data.ts:36-46`
(and credential exposure via argv at `:84-99`)

**What is wrong** A committed, working credential is the fallback connection
string; when the env var is absent the tool prints it and proceeds. The full
connection string — password included — is also passed as the first element of
`pg_dump`'s argv, so it is visible in the process table.

**Evidence**

```ts
// extract-seed-data.ts:36-46
const CONN = process.env.DATABASE_ADMIN_URL
  ?? "postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_dev1";
...
if (!process.env.DATABASE_ADMIN_URL) {
  console.error(`\n  DATABASE_ADMIN_URL not set — using local default: ${CONN}\n`);
}
```

```ts
// extract-seed-data.ts:85-97
const r = spawnSync("pg_dump", [ CONN, "--data-only", "--inserts", ... ], ...);
```

The header documents it as "DEV-ONLY … rewrites server/db/seed/ in place", and
`write()` does honour `--dry-run` (`:127-131`), but there is no environment guard
beyond the console warning.

**Impact scenario** Any operator running the script without `DATABASE_ADMIN_URL`
silently targets the fixed local database and rewrites `server/db/seed/` in place
from it. The committed `athyperadmin:athyperadmin` credential is a real (if
local) credential that reappears in shell history, logs, and CI transcripts; the
`pg_dump` argv exposure leaks it to any local user able to list processes.

**Suggested fix** Require `DATABASE_ADMIN_URL` (no fallback), and pass the
password through `PGPASSWORD`/`.pgpass` or a `--dbname` without credentials
instead of argv.

---

### [low] (F15) Relay security test derives its expectation from the implementation under test

**Location** `tests/contracts/bff-relay-security.test.ts:34-55`

**What is wrong** The refactor removed three literal assertions
(`assert.match(source, /ATLAS_ANSWER_RELAY_OPERATIONS/)`, `…ENTITY_LIST_DESCRIPTOR_OPERATION`,
`…ENTITY_LIST_QUERY_OPERATION`, `…RECORD_TRANSFER_RELAY_OPERATIONS`) and replaced
them with `registeredOperations()` augmented by `commonPlaneOperationNames()`,
which parses `COMMON_PLANE_RELAY_OPERATIONS` out of
`packages/platform/gateway/bff-relay/src/index.ts`. The expected names therefore
come from the same artefact the test is validating.

**Evidence**

```ts
// bff-relay-security.test.ts (diff, added)
+  // Planes compose the shared group instead of listing each shared operation.
+  if (registered.has("COMMON_PLANE_RELAY_OPERATIONS")) for (const name of commonPlaneOperationNames()) registered.add(name);
   return registered;
 }
+function commonPlaneOperationNames(): ReadonlySet<string> {
+  const source = readFileSync(new URL("../../packages/platform/gateway/bff-relay/src/index.ts", import.meta.url), "utf8");
```

```ts
// bff-relay-security.test.ts (diff, removed)
-      assert.match(source, /ATLAS_ANSWER_RELAY_OPERATIONS/);
```

**Impact scenario** If a plane stops spreading the shared group, or the group
itself loses an operation, `registeredOperations(source)` still reports the names
because they are read from the group definition rather than from a fixed
expectation — the test can pass while the plane's relay silently loses
operations. The new `tests/contracts/relay-common-plane-operations.test.ts` does
assert the group's positive content (unique ids/routes, required shared
operations present, plane-specific operations excluded), which restores most of
the lost strictness, but the per-plane composition assertion is now weaker than
before.

**Suggested fix** Keep one literal list of expected operation names per plane in
the test (or in a checked-in fixture) and assert the plane's source registers all
of them, independent of how the shared group is currently defined.

---

### [low] (F16) Real-clock sleeps in unit tests

**Location** `tests/foundation/atlas-business-context.test.tsx:296` and `:352`
(`setTimeout(resolve, 350)`), `tests/foundation/attachment-browse-lifecycle.test.tsx:59`
(`setTimeout(resolve, 200)`), `tests/contracts/bff-relay-security.test.ts:347`
(`setTimeout(resolve, id === "a" ? 20 : 5)`), `tests/foundation/reference-history-store.test.ts:4`
and `tests/contracts/query-provider-lifecycle.test.ts:19` (`setTimeout(resolve, 0)`)

**What is wrong** Several tests advance asynchronous behaviour by sleeping on the
real clock, and at least the 350 ms sleeps are tuned to a debounce interval.
`tests/e2e/production/surface-matrix.spec.ts:109,116` also sleeps 150 ms.

**Evidence**

```ts
// tests/foundation/atlas-business-context.test.tsx:296
const debounce = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
```

**Impact scenario** Under a loaded CI runner a 350 ms sleep can elapse before the
debounce timer fires or after the assertion window, producing
passes/failures that depend on machine speed (classic flake). The `setTimeout(0)`
cases are benign ordering yields; the 150–350 ms cases are not.

**Suggested fix** Use `vi.useFakeTimers()` with `vi.advanceTimersByTimeAsync()` for
debounce/timer-driven assertions, and await a deterministic signal (promise,
emitted event, or `expect.poll`) for the rest.

---

### [low] (F17) Dormant visual-regression suite (`test.skip(true)`) is the only coverage for its surface

**Location** `tests/e2e/visual/pi-fixture.spec.ts:48`

**What is wrong** The single visual-regression test for the descriptor-driven
Purchase Invoice route is permanently skipped. The reason is documented in the
file and in `tests/e2e/README.md` (fixture not seeded, no reference snapshot, CI
job manual-dispatch), and `test:visual` therefore asserts nothing.

**Evidence**

```ts
const ACTIVATION_PENDING =
  "Dormant: complete the four activation prereqs in tests/e2e/README.md, "
  + "generate the reference snapshot, then delete this `test.skip` call.";

test.describe("Purchase Invoice — visual regression", () => {
  test("descriptor route — regression snapshot", async ({ page }) => {
    test.skip(true, ACTIVATION_PENDING);
    ...
    await expect(page).toHaveScreenshot("pi-fixture.png");
```

**Impact scenario** Any rendering regression on the descriptor route (layout,
data-surface injection, amount-summary chips) is undetected, and any status report
or matrix that counts `tests/e2e/visual` as coverage overstates reality. Being
`test.skip(true)` rather than env-gated, it will never activate by accident.

**Suggested fix** Seed `PI_FIXTURE_ID` and commit the reference snapshot, then
delete the skip; if that is not imminent, record the suite as quarantined with an
owner and an expiry so it is not counted as passing coverage.

---

### [low] (F18) Optional signing-key assertion and `JSON.parse` of the semantic config in `registerPublication`

**Location** `server/apps/platform-host/src/composition/register-services.ts:4544`
(with `:4571`)

**What is wrong** A non-null assertion asserts an invariant that configuration
never establishes. `publicationSigningKeyId` is derived without a presence
requirement (`config/environment.ts:853-854`), yet the dev runtime is constructed
with `signingKeyId: config.publication.signingKeyId!`. The activation guard then
compares `deployment.signingKeyId !== config.publication.signingKeyId`, a check
that is trivially satisfied when both are `undefined`.

**Evidence**

```ts
// register-services.ts:4542-4545
const devRuntime = devConfiguration?.runtimeApproval && authorizationCompilation
  ? createDevRuntimePublication({ environment: config.env, database: (container.adapters.athyperDatabase?.database ?? authorityDatabase) as Kysely<Record<string, never>>,
      signingKeyId: config.publication.signingKeyId!, audit, compilation: authorizationCompilation })
  : undefined;
```

```ts
// register-services.ts:4569-4572
activationGuard: async (deployment, loaded) => {
  if (loaded.document.manifest.evidence?.authorizationReviewMode !== "development_auto_approval") return;
  if (!devRuntime || deployment.targetEnvironment !== "local" || deployment.signingKeyId !== config.publication.signingKeyId)
    throw Error("DEV_RUNTIME_ACTIVATION_DENIED");
```

**Impact scenario** Reaching this path requires the dev-publication configuration,
which is strongly guarded (`development/publication.ts:140-146` demands
`config.env === "local"`, `ATHYPER_ENV=local`, `ATHYPER_DOMAIN_SUFFIX=dev.athyper.test`,
`ATHYPER_DEV_PRESET=devfull`, plus file mode/size checks), so the practical impact
is low. The defect is the asserted-not-validated invariant: with an unset signing
key id, both sides of the `:4571` comparison are `undefined` and the guard passes
for the wrong reason instead of rejecting a misconfigured environment.

**Suggested fix** Validate `config.publication.signingKeyId` (and the key
references) before constructing `createDevRuntimePublication`, drop the `!`, and
compare against a captured, non-optional value.

---

### [low] (F19) Lost coverage: `createLifecycle()` factory export is no longer directly exercised

**Location** deleted `server/apps/platform-host/src/__tests__/lifecycle.test.ts`
(22 lines) vs surviving
`server/packages/foundation/src/lifecycle/__tests__/lifecycle.test.ts:5-16`

**What is wrong** The deleted test used the exported factory
`createLifecycle()` (`server/packages/foundation/src/lifecycle/index.ts:51`) from
`@athyper/server-foundation/lifecycle`. The surviving test constructs
`new LifecycleManager()` directly and covers the same behaviour — LIFO shutdown
order and continuation after a throwing hook — but not the factory wrapper.

**Evidence**

```ts
// deleted src/__tests__/lifecycle.test.ts
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
...
await lifecycle.shutdown("SIGTERM");
expect(log).toEqual(["second", "first"]);
```

```ts
// surviving server/packages/foundation/src/lifecycle/__tests__/lifecycle.test.ts:5-16
it("runs shutdown handlers once in LIFO order and continues after errors", async () => {
  const lifecycle = new LifecycleManager();
  ...
  expect(order).toEqual([3, 1]);
});
```

**Impact scenario** Negligible: the substantive behaviour (ordering, error
tolerance, idempotent shutdown) is still asserted, and `createLifecycle()` is a
one-line wrapper. Only the exported factory's wiring is unverified.

**Suggested fix** Add a one-line assertion that `createLifecycle()` returns a
`LifecycleManager` (or delete the factory if nothing needs it).

---

## Checked and clean

Refactor integrity

- **All 17 relocated modules are byte-identical moves.** `diff` of
  `git show HEAD:<deleted>` against each successor returns only import-path-depth
  or type-name changes (table above). No behaviour was silently altered in the
  moved code.
- **All live references to the moved modules were updated** in
  `composition/register-services.ts` (`:12`, `:24`, `:25`, `:46-49`, `:63`, `:364`),
  `kernel/bootstrap.ts:4`, `kernel/module-registry.ts:7-8`,
  `entrypoints/control-api.ts:13`,
  `composition/infrastructure/__tests__/deployment-resources.test.ts:9`,
  `composition/shared/entity-runtime/__tests__/service-composition.test.ts:19`,
  `composition/shared/collaboration/__tests__/collaboration-section-providers.test.ts:3`,
  `composition/__tests__/optional-capability-readiness.test.ts:5`,
  `composition/shared/publication/{workload-routes,workload-configuration,compilation-recovery-execution}.ts`,
  `composition/shared/publication/__tests__/publication-workload-routes.test.ts:70`,
  `composition/control-plane/__tests__/control-plane.test.ts:74-85`, and
  `composition/infrastructure/__tests__/import-boundaries.test.ts:117`
  (`http` → `http-registrars`).
- **All six moved/deleted test pairs were verified** (see the table in *Refactor
  integrity*): four AI tests identical, workload test identical apart from
  renames, qualification test identical apart from the import, finance test
  identical (615 lines).
- **The deleted `kernel/capability-readiness.ts` was test-only dead code**:
  `git grep` at HEAD shows its only importer was the deleted
  `kernel/__tests__/capability-registry.test.ts`.
- **The deleted `development/verification-delivery.ts` was dead code**:
  `git grep` at HEAD shows `queueLocalVerificationEmail` /
  `localVerificationEmailHandler` had no importer other than the deleted test.
- **`registerPlatform` is still exported** as an alias
  (`composition/register-platform.ts:204 export const registerPlatform = registerIdentityPlatform;`),
  so `kernel/bootstrap.ts:28,37` and the nine tests that import it resolve.
- **Deleted `config/deployment-environment.ts` is a pure move** to
  `kernel/deployment-environment.ts` (diff empty).

Composition correctness

- **No singleton holding per-request state.** `createContainer()`
  (`kernel/container.ts:279-290`) returns fresh mutable state per call;
  `notificationChannels`, `pushTransports`, and `platform.httpRegistrars` are
  per-container. `registerServices` keeps its per-invocation state in locals
  (`installedRecordMutations`, `installedReadQueries`, `active`, `lastCompleted`)
  and in `WeakMap`s keyed by `Container`
  (`register-services.ts:4166-4172`).
- **No later-overwriting duplicate registration.** The two
  `container.services.finance =` assignments (`:924`, `:982`) are the two arms of a
  single `if/else`; the three `container.platform.ai =` assignments (`:3562`,
  `:3845`, `:4034`) are in branches that each `return` (`:3567`, `:3899`);
  `container.platform.entitlements` and `container.platform.controlAdmin` are
  assigned once.
- **`capabilityRegistration.register` fails closed**: unknown capability
  (`HOST_CAPABILITY_UNKNOWN`), role exclusion (`HOST_CAPABILITY_ROLE_EXCLUDED`),
  plane exclusion (`HOST_CAPABILITY_PLANE_EXCLUDED`) and duplicate
  (`HOST_CAPABILITY_DUPLICATE`) all throw
  (`kernel/capability-registration.ts:22-39`).
- **`registration-plan.ts` never expands `servedPlanes`** for coordination; it
  only adds studio/neon **database** planes and requires a worker role
  (`RELEASE_REVIEW_WORKER_REQUIRED`) — a clean separation.
- **`module-registry.ts` uses a closed literal loader map** and rejects
  `compatibility.services` for non-combined profiles and role-incompatible loads
  (`HOST_LEGACY_MODULE_EXCLUDED`, `HOST_HTTP_MODULE_ROLE_INVALID`,
  `HOST_COORDINATION_MODULE_EXCLUDED`).
- **`database-selection.ts` never mutates** `config` or `process.env` (spread
  copies only), and drops connection strings for unplanned planes.
- **Capability gating fails closed** for atlas
  (`register-services.ts:3546-3553`: `routesEnabled` requires both
  `atlas.enabled` and `atlas.persistenceEnabled`, both default `false`) and for
  publication targets (`:4561`: empty target list unless `applyEnabled`).
- **HTTP registrar application is fail-closed**: `runtimes/http.ts:71-74` runs
  every registrar inside `configure`; a throwing registrar aborts bootstrap.
  Workers and schedulers never build an HTTP application.
- **`config/environment.ts` parsers are strict**: `readBoolean` throws on
  anything other than `true`/`false` (`:291-297`), `readChoice` throws on unknown
  values (`:299-308`), `PUBLICATION_REQUIRE_SIGNATURE` is forced `true`
  (`:847-852`), publication enablement requires target planes (`:838-846`),
  authoring requires key references (`:859-867`), the three S3 buckets are
  all-or-nothing (`:487-499`), and production workers require dedicated job DB
  URLs (`:464-481`).
- **Dev-publication configuration is strongly guarded**
  (`development/publication.ts:140-151`): requires `env === "local"`,
  `ATHYPER_ENV=local`, the dev domain suffix and the `devfull` preset, plus a
  regular file under 16 KiB without group/other write bits.
- **`loadDevPublicationConfiguration` does not rely on the derived `env`** for its
  guard — it re-reads `env.ATHYPER_ENV`, so the F4 fallback cannot enable
  dev publication.

Authorization registration

- **`shared/entity-runtime/scope-registry.ts` fails closed**: unknown binding
  combinations resolve to `{ state: "invalid" }` and preflight to
  `"workflow_blocked"` (`:43-47`); duplicate or malformed bindings throw
  `ENTITY_SCOPE_BINDING_INVALID` (`:27-29`). There is no wildcard or
  tenant-ownership fallback.
- **`shared/entity-runtime/permission-transitions.ts` logic is not inverted**:
  it rejects non-array input, malformed tokens, unknown operations, deferred
  operations, a `targetPermissionCode` that disagrees with the operation,
  `source === target`, and duplicates (`:11-26`).
- **`shared/entity-runtime/http-registrars.ts` / `read-bindings.ts` carry no
  permissive default**: every binding receives an explicit `authenticate` and
  `readContext`, and optional route groups are only mounted when the binding
  exists (`read-bindings.ts:28-33`).
- **`shared/identity/authority.ts` ordering is safe**: `audit` is bound before the
  `tokenVerifier` guard, but `iam` and `authorizer` are only bound afterwards
  (`:54-131`), and `registerServices` returns early unless all three exist
  (`register-services.ts:533-534`) — no authorization decision can be made
  without an authorizer.
- **`registerIdentityAuthority` reads the source requirement in a read-only,
  repeatable-read transaction** with a 1.5 s statement timeout and explicitly set
  actor config (`authority.ts:115-128`).
- **`register-services.ts` capability policy denies by default**:
  `authorizeAttachmentCapability` returns `false` on any error
  (`:1664`, `:3106`) and the activity policy returns `false` when the descriptor
  or history binding does not qualify (`:1705`).
- **`shared/entity-runtime/activity-presentation.ts` no longer rewrites titles**
  (entity-specific `supplier.*` and `workflow.*` copy rewriting was removed); the
  corresponding test assertion was updated to match
  (`__tests__/activity-presentation.test.ts:85-89`). `readableWorkText` has no
  remaining references, so nothing was left dangling by the removal. Only
  `INDEPENDENT_APPROVAL:` appears in a test fixture, so no live data exposes an
  internal prefix.

DB scripts

- **The destructive authorization reset is properly guarded.**
  `reset-authorization-clean-slate.ts:14-17` requires a whitelisted `--plane` and
  `--reset`; `resolveDestructiveResetCliApproval` (`safe-provision.ts:45-100`)
  pins `expectedDatabase` to `athyper_<plane>`, requires the acknowledgement
  `RESET_<PLANE>`, the marker `I_UNDERSTAND_DATA_WILL_BE_DESTROYED`, the profile
  `development_clean_reset` and the label `LOCAL-AUTH-V2-RESET`;
  `assertDestructiveResetAllowed` additionally verifies `current_database()`
  (`safe-provision.ts:212-300`). `BEGIN`/`COMMIT`/`ROLLBACK` are correct
  (`:45`, `:98`, `:100`) and a `pg_advisory_xact_lock` is taken (`:47`).
- **Other operations scripts use identity guards plus transactions**:
  `manage-authorization-operation-activation.ts:9-15` (plane whitelist + action
  whitelist + `current_database()` guard + `begin`),
  `repair-projection-owner-read-grants.ts:23-49` (refuses outside
  `<target.name>/<plane>`), `reconcile-runtime-subjects.ts:41-99`,
  `repair-tenant-ledger-hashes.ts:163-188` (table lock + trigger drop/recreate
  inside one transaction),
  `project-meta-entity-admin-identities.ts:77-216`,
  `provision-meta-entity-authority.ts:75-246`,
  `rotate-local-postgres-admin-secret.ts:10-54`.
- **The mass-looking DML I inspected is correctly scoped**:
  `repair-tenant-ledger-hashes.ts:170-174`
  (`WHERE plane = $2 AND pack_key = $3 AND pack_version = $4`, inside a loop over
  the drifted set), `reconcile-runtime-subjects.ts:72` (`WHERE id=$1::uuid`),
  `provision-three-plane.ts:143-150` (parameterized insert into an
  immutability-triggered receipt table).
- **Idempotency**: `CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION` /
  `ON CONFLICT … DO UPDATE|DO NOTHING` / `DROP TRIGGER IF EXISTS` patterns are
  used throughout the provisioning and authorization applicator paths
  (`provision-three-plane.ts:118-150`, `provisioning/authorization-pack-applicator.ts`,
  `provisioning/provision-development-notification-acceptance.ts`).
- **SQL interpolation sites are not injectable**:
  `tests/integration/ci-integrity.ts:135` and `:581` interpolate a locally
  generated `randomUUID()` (and redact it as `[test-password]` at `:54-55`,
  `:692-693`); `checks/seeds/authorization-release-live.ts:69,77` interpolates
  `probe_${checks.length}`; `:186` iterates the module constant
  `AUTHORITY_SNAPSHOT_RELATIONS`. No path, argv, env, or user value reaches these
  strings.
- **`pg_dump` is invoked via `spawnSync` with an argv array** and no shell
  (`tools/introspection/extract-seed-data.ts:85-99`), so the interpolated
  `--table=${schema}.${table}` values (already regex-restricted to `\w+` at
  `:67`) cannot inject a command.
- **`sync-shared-to-mesh.ts` is a retired stub** that throws on line 2 rather
  than performing a partial sync.

Tests

- **No `it.skip` / `it.only` / `it.todo` anywhere in
  `server/apps/platform-host/src/**` (0 matches) or `tests/**` except 14
  deliberate, reason-bearing `test.skip(...)` guards** in
  `tests/e2e/production/*`, `tests/e2e/session/session-lifecycle.spec.ts` and
  `tests/e2e/visual/pi-fixture.spec.ts` — all conditional on documented
  credentials/seeding, each with an explicit reason string.
- **Only one in-scope test file has zero JS assertions**,
  `mesh-exchange-readiness.postgres.test.ts`; its assertions are SQL
  `RAISE EXCEPTION` blocks embedded in the `psql` script (`:14-16`, `:18-41`) and
  it is an explicit, commented opt-in
  (`describe.skipIf(!MESH_READINESS_TEST_DOCKER)`, `:7-9`). Not a defect.
- **`tests/foundation-browser/**` is not mock-heavy**: 0 `vi.mock` calls across
  56 files; each spec bundles the real component with esbuild
  (`resolveDir: process.cwd()`) and asserts against real DOM
  (`applied-filters.spec.ts:1-18` and peers). The `./packages/...` specifiers my
  import scanner flagged there are repo-root-relative inside the esbuild bundle,
  not dangling module paths.
- **`tests/contracts/relay-common-plane-operations.test.ts` is a genuinely
  positive test**: it asserts unique ids and routes, that the shared group carries
  `ENTITY_LIST_QUERY_OPERATION` and every `ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS`
  entry and at least one `collaboration.` operation, and that plane-specific
  operations are excluded (`:16-35`).
- **`tests/foundation/entity-form-values.test.ts` asserts real boundaries**,
  including the negative cases that empty required numbers must not coerce to
  zero and that non-numeric input is passed through for server rejection
  (`:29-43`).
- **No test-only code reachable in production**: the only `NODE_ENV` reads in
  `server/apps/platform-host/src` are the environment classifier and the dotenv
  guard (F13); there is no `NODE_ENV === "test"` branch in production code.

Robustness

- **No empty `catch {}` blocks in `server/apps/platform-host/src` (non-test)** —
  the sweep returned zero matches. The `catch { return false; }` sites
  (`register-services.ts:1664`, `:1705`, `:3106`;
  `mesh/exchange-readiness.ts:46-48`) all fail closed and are documented.
- **`kernel/bootstrap.ts:43-46` handles cleanup failure without masking the
  original error**: the shutdown failure is logged and the original is rethrown.
- **`kernel/launch.ts:40-48` types the catch as `unknown`, logs message and stack,
  and expands `AggregateError`** before forcing `process.exit(1)`.
- **`entrypoints/control-api.ts` verifies the database role is neither superuser
  nor BYPASSRLS before doing any work** (`SELECT NOT rolsuper AND NOT rolbypassrls AS safe`
  → `CONTROL_PLANE_DATABASE_ROLE_UNSAFE`) and reads secrets through
  `readPrivateFile`, which rejects non-files, group/other-readable modes, and
  files over 64 KiB (`:14-20`).

---

## Highest-risk 5

1. **Verification endpoints are authentication-only**
   (`composition/shared/verification.ts:71`, `:86`) — any authenticated
   principal in any tenant can read cross-plane infrastructure state and run
   privileged probes (storage write/delete, malware scan, extraction, PDF render,
   search upsert/delete, outbound email). The in-repo test passes with
   `permissions: { allowed: [] }`, which proves the gap. Default-off in
   production, but nothing prevents enabling it.

2. **Two refactor-broken test imports fail the suites**
   (`composition/shared/verification/__tests__/routes.test.ts:5` →
   deleted `../routes.js`; `tests/foundation/atlas-record-question.test.ts:3` →
   deleted `shared/ai/atlas-record-question`). Both resolve only to moved
   successors, so these are pure missed-updates; the first fails
   `turbo test` for platform-host, the second fails `pnpm test:foundation` and
   therefore `pnpm test`.

3. **Missing/unrecognised environment silently downgrades to `local`**
   (`config/environment.ts:310-317`, consumed at `:394`, `:442`, `:1081`) —
   `AUTH_CLAIM_FIRST_CONTEXT` becomes `shadow`, shared BullMQ/Redis is permitted,
   verification routes switch on, and legacy S3 credentials are accepted, with no
   startup failure or warning that a production deployment lost production
   semantics.

4. **Metadata validation hooks are dead**
   (`composition/shared/entity-runtime/metadata-validation.ts:17`, zero
   importers repo-wide, including at HEAD for the file it was moved from) —
   published metadata that declares required coordinates or reference domains has
   no runtime enforcement, a fail-open gap in the metadata plane the refactor was
   meant to preserve.

5. **Destructive authorization reset is unbounded at the principal level**
   (`operations/authorization/reset-authorization-clean-slate.ts:85-89`) — a
   `WHERE`-less `UPDATE master.principal SET auth_epoch = auth_epoch + 1` bumps
   every principal in the plane (all tenants) before the seed re-application runs
   outside the already-committed transaction, so a seed failure leaves a truncated
   authorization catalog with all sessions invalidated.
