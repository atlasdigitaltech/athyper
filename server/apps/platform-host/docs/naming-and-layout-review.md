# Platform host — folder, file and method naming review

Scope: `server/apps/platform-host/**` (source, scripts, docs, config) plus the
governance and tooling inputs that reference those paths.

This is a review, not a change. No source file was modified. It supplements the
"Review findings" section of [`architecture.md`](./architecture.md) and the
conventions in [`module-ownership.md`](./module-ownership.md); where those two
documents assert something, this review re-verified it against the code and
records the result, including one place where the documentation is now wrong.

> Revalidation, 2026-09-29: the temporal-discipline ratchet and authorization
> inventory verifier now pass. The historical F1 failure details below are kept
> as migration context only; they are not a current blocker for a rename.

---

## 1. Verification status

| Check | Command | Result |
| --- | --- | --- |
| Host typecheck | `pnpm --filter @athyper/server-platform-host typecheck` | **pass** (exit 0) |
| Composition static inventory | `node scripts/verification/inventory-composition.mjs` | **pass** — 140 files, 0 missing relative imports, 0 syntax diagnostics |
| kebab-case filenames | `find src scripts -type f` filter | **pass** — zero violations |
| Temporal discipline gate | `pnpm exec tsx tooling/scripts/policy/verify-temporal-discipline.ts --quiet` | **FAIL** (exit 1) |
| Authorization inventory gate | `pnpm exec tsx tooling/scripts/policy/verify-authorization-inventory.ts` | **FAIL** (exit 1) |

So the base hygiene is good: naming case is uniform, types resolve, and every
relative import points at a real file. The two failing gates and the findings
below are about **semantics and reference integrity**, not about case style.

---

## 2. The proposed tree versus the implemented tree

The proposed layout and the repository agree on the top-level shape
(`entrypoints/`, `kernel/`, `config/`, `composition/{infrastructure,runtimes,shared,spaces}`,
`diagnostics/`, `development/`, `scripts/`, `docs/`). They diverge in both
directions.

**Proposed but deliberately absent** — the review agrees with the current
decision, and the justification in `architecture.md:74-80` holds up:

| Proposed | Actual | Assessment |
| --- | --- | --- |
| `kernel/lifecycle.ts` | not present | Correct. Lifecycle is owned by `@athyper/server-foundation/lifecycle` and is imported, not re-implemented. |
| `kernel/module-contract.ts` | not present | Correct today. `module-registry.ts:12` `HostModuleId` is the only contract and has no external consumer. |
| `kernel/dependency-graph.ts` | not present | Correct. `capability-registration.ts` eligibility + `registration-plan.ts` is the whole graph. |
| `diagnostics/readiness/` | not present | Acceptable. Readiness is `isReady: () => startupComplete` in `runtimes/http.ts:26` and `lifecycle.signalReady`. No separate owner exists to extract. |

Adding these as empty folders would create the appearance of structure without
behaviour. Do not create them.

**Implemented but absent from the proposal** — the proposal is incomplete:

| Actual | Why it must stay |
| --- | --- |
| `composition/shared/ai/` | Atlas inference admission, semantic index, knowledge and grounding bindings. Five real modules, 1,300+ lines. |
| `composition/shared/verification/` | One 1,099-line platform probe surface (`routes.ts`). |
| `composition/control-plane/` | Privileged publication control authority; it is deliberately not a product space (`module-ownership.md:100-101`). |
| `composition/coordination/entity-release-review/` | Cross-plane release review; cannot live under one space. |
| `scripts/db-verification/` | Retains provisioning and integration scripts (`module-ownership.md:39-44`). |
| `src/scripts/` | Retained in `src` because `tsconfig.json` sets `rootDir: src`. Moving it changes the build contract. |

**Missing from both** — the proposal has no home for `ProcessRole`/`PlaneKey`
vocabulary or for the governance references that point into this app. See F1
and F2.

---

## 3. Findings

### F1 — High: earlier moves left two policy gates red, and one turned ratcheted debt into a regression

This is the direct answer to "is renaming safe here". It is not, yet.

**Temporal discipline ratchet.** `governance/config/governance/temporal-discipline-ratchet.json:22-25`
still keys four files by their pre-move paths:

```
server/apps/platform-host/src/composition/authorization-management-config.ts        : 2
server/apps/platform-host/src/composition/business-partner-authorization-deployment.ts : 2
server/apps/platform-host/src/composition/supplier-process-communications.ts        : 1
server/apps/platform-host/src/composition/task-edit-policy-authoring.ts             : 3
```

The first file now lives at `src/composition/shared/entity-governance/authorization-management-config.ts`.
Because the ratchet key no longer matches, the gate reports a **false regression**:

```
Temporal-discipline violations increased in 18 file(s):
- server/apps/platform-host/src/composition/shared/entity-governance/authorization-management-config.ts: 0 -> 2
```

The other three keys point at files that no longer exist at all, so their
ratcheted debt silently disappeared from the ratchet. A rename therefore both
*created* a new violation report and *lost* baseline debt — the two worst
possible outcomes for a policy ratchet.

**Authorization inventory.** `governance/config/governance/authorization-inventory.v1.json`
is a governance artifact that lists, per authorization symbol, the source files
that implement or use it. Of 1,181 referenced repository paths, **285 no longer
exist**; 11 of them are under `platform-host`. Example, for `master.company_code`
(`authorization-inventory.v1.json:480-492`):

```
server/apps/platform-host/scripts/db-verification/business-partner-360/verify-business-partner-360-reads.ts
server/apps/platform-host/src/composition/__tests__/business-partner-stored-scopes.test.ts
server/apps/platform-host/src/composition/business-partner-authorization-shadow.ts
server/apps/platform-host/src/composition/business-partner-stored-scopes.ts
```

The commitment `8c997a7e7 refactor(platform): consolidate entity runtime
composition` did update six path entries in this file, but not these. The
verifier only checks that the generated artifact exists and matches the
generator output, so stale entries inside it do not fail on their own — but the
artifact is *also* stale relative to the generator, and the gate reports:

```
- authorization-inventory.v1.json: generated inventory is stale; run `pnpm exec tsx tooling/scripts/policy/authorization-inventory.ts`
- unknownSources: 15 finding(s), 9 unique: authorizeActivation, authorizeAttachmentCapability,
  authorizeCapability, authorizeCapabilityParent, authorizeCompilationRecovery, authorizeHit,
  authorizeNotificationRecipient, authorizeRecord, requireEntityPermissionTransitions
```

**In-app documentation is stale in the same way.** These are the app's own
records, and they still describe the pre-move tree:

- `docs/composition-baseline.json` records 70 `src/...` paths; **64 of them no
  longer exist**, including `src/composition/capability-registry.ts`,
  `src/composition/dev-publication.ts`, `src/composition/database-qualification.ts`
  and `src/composition/entities/collaboration/attachments.ts`.
- `docs/runbooks/local-master-data-operations.md:103` instructs operators to run
  `vitest run src/composition/__tests__/local-verification-delivery.test.ts`; the
  file is now `src/development/__tests__/local-verification-delivery.test.ts`.
- `docs/runbooks/mesh-exchange-readiness-repair.md:51` gives the old
  `src/composition/__tests__/mesh-exchange-readiness.test.ts` path; the tests are
  now under `src/composition/spaces/mesh/__tests__/`.
- `docs/module-ownership.md:96` and `architecture.md:22` claim
  `spaces/mesh/exchange-readiness.ts` owns Mesh readiness behaviour. Nothing
  registers it — see F12.

**Why this blocks cosmetic renaming.** Every one of those nine "unknown
authorization sources" is a live symbol in this app, and the inventory is the
artifact that is supposed to attribute authorization to a source. Renaming
`requireEntityPermissionTransitions` (which F8 recommends, because `require` is
not in the documented verb set) changes an authorization-inventory identity.
Renames in this app are governance events.

**Recommendation, in order:**

1. Re-run the generator and repair the ratchet keys in the same commit as any
   move: `pnpm policy:temporal-discipline --update-ratchet` and
   `pnpm exec tsx tooling/scripts/policy/authorization-inventory.ts`.
2. Add a cheap guard so this cannot recur: a check that every path recorded in
   `authorization-inventory.v1.json`, `temporal-discipline-ratchet.json`, this
   app's `docs/composition-baseline.json`, and the `docs/runbooks/*.md` command
   blocks exists on disk. Every failure above would have been caught at the
   moment of the move.
3. Refresh `docs/composition-baseline.json`. Note that
   `scripts/verification/inventory-composition.mjs:60` only writes JSON to
   stdout — it has no path to that file — so the baseline is a hand-captured
   snapshot that will keep drifting. Either wire the script to the documented
   path or drop the file and reference the command instead.
4. Only then perform the renames in F4/F7/F8.

### F2 — High: there is a canonical plane entity, and 14 files re-declare it

There *is* a standardized generic entity for deployment topology:
`PlaneKey` in `server/packages/foundation/src/context/execution-context.ts:2`.
It is already imported by seven shared modules (`entity-runtime/metadata.ts:4`,
`entity-governance/persistence.ts:7`, `identity/plane-admission.ts:5`,
`publication/plane.ts:2`, and others). The host also has its own
`DeploymentPlane` in `config/deployment-profile.ts:2`.

Despite that, the literal union `"studio" | "neon" | "mesh"` appears in **14
non-test source files, 21 times**, under five different local alias names:

| Alias | Location |
| --- | --- |
| `DeploymentPlane` (canonical) | `config/deployment-profile.ts:2` |
| `PlaneKey` (canonical, re-declared locally) | `composition/shared/verification/routes.ts:20` |
| `CapabilityPlane` | `kernel/capability-readiness.ts:1` |
| `RuntimePlane` | `composition/infrastructure/database-qualification.ts:3` |
| `Plane` | `development/graph-preview.ts:20`, `shared/entity-governance/meta-entity-activation-inspection.ts:5`, `infrastructure/authorization-writer-databases.ts:7` |
| `allPlanes` (runtime value) | `kernel/capability-registration.ts:5` |

Everything in F2 breaks the "generic entity" standard in the same way, and it
is the cheapest class of finding to fix, because the fix is deletion:
import `PlaneKey` (or a single host-level alias derived from it) and remove
each local declaration. The same applies to `ProcessRole`, re-validated with a
raw inline union at `composition/register-services.ts:2233`:

```ts
config?.mode === "api" || config?.mode === "worker" || config?.mode === "scheduler"
```

### F3 — High: kernel carries a speculative deployment-profile surface and one dead module

`kernel/capability-readiness.ts` (84 lines) is **test-only**. Its
`evaluateHostCapabilities` (`:41`) has no production caller; only
`kernel/__tests__/capability-registry.test.ts:3-7` imports it, and five of its
six exported types (`CapabilityReadiness`, `CapabilityState`,
`HostCapabilityAssessment`, and the interfaces) have no reference outside the
defining file. It also invents `CapabilityPlane` (`:1`) that duplicates `PlaneKey`.

`HostCapability` (`kernel/capability-registration.ts:17`) and `HostModuleId`
(`kernel/module-registry.ts:12`) are exported but referenced only inside their
own files.

The entire isolated-deployment apparatus is unreachable:
`assertDeploymentProfileImplemented` (`config/deployment-profile.ts:32-34`)
throws for every profile except `combined`, so `HOST_DEPLOYMENT_PROFILE`,
`RegistrationPlan.servedPlanes`/`databasePlanes`, `selectDeploymentEnvironment`
and the eligibility catalog in `capability-registration.ts` are engineered for
a capability they cannot deliver. `architecture.md:71-72` acknowledges this.

**Assessment:** this is structure in search of a requirement. It adds a second
capability vocabulary that collides with the first — `HostCapability` is a
seven-id string union while `HostCapabilityDefinition` is a
feature-flag/service/repository struct, in the same folder, with no relation.
Recommend: either delete `capability-readiness.ts` and its test, or wire it
into the HTTP readiness endpoint so it stops being dead; keep the profile
machinery only if an isolated profile will actually ship.

### F4 — High: module identity is ambiguous in the shared entity framework

The shared framework is where a generic, discoverable naming standard matters
most, and this is where the naming is weakest. All of these are real
responsibility splits; the problem is that the names do not say so.

- **Three files named `register.ts`**, carrying no capability name:
  `composition/control-plane/register.ts`,
  `composition/coordination/entity-release-review/register.ts`,
  `composition/spaces/studio/trustiam/onb/register.ts`. Their exports are
  `registerControlPlane`, `resolveEntityReleaseReview` and `registerStudioOnboarding`.
  Name the file after the capability: `control-plane/control-plane.ts`,
  `entity-release-review/release-review.ts`, `studio/onboarding.ts`.
- **`coordination/entity-release-review/register.ts` registers nothing.** It is
  13 lines exporting `resolveEntityReleaseReview` (`:6`), and
  `kernel/module-registry.ts:8` consumes it as a *loader*. The filename asserts
  the opposite of what the module does. `release-review.ts` (or `loader.ts`) is
  honest.
- **`spaces/neon/supplier-information-sla.ts` is not about the SLA it names.**
  Its only statement calls `document.sweep_process_information_due`, which the
  DDL defines at `server/db/ddl/planes/neon/document/07_task_interactions.sql:345`
  as a clarification-response escalation timer. Rename to the behaviour
  (`supplier-information-escalation.ts`) or move it to the owner of that sweep.
- **`spaces/studio/trustiam/onb/register.ts`.** `studio/trustiam` legitimately
  mirrors the DDL schema directory `server/db/ddl/planes/studio/trustiam/`, but
  `onb/` is an unexplained abbreviation holding exactly one file, and the file
  owns three unrelated things (a health probe, `registerOnboardingRoutes`, and a
  maintenance job). Use `spaces/studio/onboarding/register-studio-onboarding.ts`
  unless `onb` is a published path.
- **`spaces/neon/__tests__/finance-http-review.test.ts` (615 lines) is the
  contract test of `finance-routes.ts` (441 lines)** — larger than its subject
  and named "review" for a paper trail. Rename to `finance-routes.test.ts`.
- **`shared/verification/` is a folder containing one 1,099-line `routes.ts`**
  that also owns the domain types (`:33`, `:43`) and its own auth middleware.
  A single-file folder whose file is named by transport is not a unit of
  ownership. Either flatten it (`shared/verification.ts`) or split
  types/service/routes.
- **`entity-runtime/http.ts` (145) vs `routes.ts` (34).** Real split — `routes.ts`
  is binding shapes, `http.ts` constructs registrars — but both names mean
  "HTTP". `routes.ts` → `read-bindings.ts`; `http.ts` → `http-registrars.ts`.
- **`metadata.ts` / `metadata-hooks.ts` / `metadata-format-reader.ts`.** The
  prefix is accidental: `metadata-hooks.ts` is coordinate/reference validation
  with no reader relation. Rename to `metadata-validation.ts` (it sits with
  `permission-transitions.ts` and `scope-registry.ts`).
- **`entity-runtime/publication-qualification.ts` is publication-facing** while
  three sibling `*qualification*` modules live under `shared/publication/`.
  Move it, or rename it to say why it is the exception.
- **`collaboration/index.ts` is not a barrel.** Unlike every other folder, it
  owns a factory (`createCollaborationSectionProviders`, `:9`). Move the factory
  to `collaboration/section-providers.ts` and drop the lone `index.ts`, or add
  barrels everywhere — but not one of each.

### F5 — High: generic framework files carry concrete entity vocabulary

This is the finding most relevant to the standing instruction that only
dissimilar-entity onboarding and shared Entity Framework work is in scope, and
that entity-specific configuration belongs in metadata. Several "generic"
modules hardcode one entity's domain.

- **`entity-runtime/record-display-choices.ts:19-37`** — a generic display-choice
  resolver hardcodes a Business Partner catalog allowlist:
  `control.business_partner_block_operation`, `..._block_reason`,
  `..._qualification_type`, `master.business_partner`,
  `..._commodity_classification`, `..._identifier_scheme`,
  `..._tax_registration_type`, plus `master.company_code`,
  `master.payment_term`, `master.tax_jurisdiction`. It also dereferences a
  specific plane: `transactions.run("neon", ...)` at `:113`.
- **`entity-runtime/activity-presentation.ts:54-59, 84-87, 125, 141`** —
  branches on `item.eventCode.startsWith("supplier.")` and owns supplier-specific
  labels and URLs ("Supplier request update", "Review supplier request").
- **`shared/ai/*`** — the product name is in every filename and symbol
  (`atlas-record-question.ts:3`, `atlas-semantic-index.ts:10,25,34,61`,
  `atlas-attachment-knowledge.ts:46,56,347`, `atlas-document-grounding.ts:18,20`,
  `atlas-inference-admission.ts:7,10,52`), plus the index uid
  `atlas_attachment_knowledge_neon` (`:62`), routes `/api/atlas/knowledge/...`
  and tag `"Atlas"` (`:377-378,389`), permissions `neon.ai.agent.use` /
  `neon.collaboration.attachment.read` (`:100,112,275`), and a plane guard
  `context.planeKey !== "neon"` (`:78,129`). The intent guard at
  `atlas-record-question.ts:7` is a hardcoded regex on
  `/(summarize|summarise) this business partner/i`.
- **`shared/publication/` encodes one entity as the only supported shape.**
  `workload.ts:22,34,61` and `target-qualification.ts:10` name everything
  `Reference*` (`ReferencePublicationWorkloadConfiguration`,
  `qualifyReferencePublicationTarget`), which is Country's shape, not the
  framework's. `machine-policy.ts:10` hardcodes
  `"studio.metadata.contract.publish_automated"`; `workload-routes.ts:27,42`
  hardcodes `/api/studio/publication-policies/...`, tag `["Studio"]` and
  `planeKey: "studio"`.

This is the highest-value work available and it is inside the stated scope:
generalize the framework, move the per-entity allowlists and copy into published
metadata, and keep the host free of entity codes.

### F6 — Medium: production composition imports from `development/`

`composition/register-services.ts` statically imports three modules from
`../development/`:

- `:44` `localGraphPreview` from `development/graph-preview.js`
- `:54` `createDevRuntimePublication` from `development/runtime-publication.js`
- `:55` `loadDevPublicationConfiguration`, `registerDevPublicationRoutes` from `development/publication.js`

Two of the three are environment-gated
(`loadDevPublicationConfiguration(process.env, config.env)` at `:4178`, `:4534`),
but `localGraphPreview` is used **unconditionally** by the production
`registerStudioAuthoring` function (`:4167`, call at `:4413`). A folder named
`development/` therefore contains production code, and a reader who trusts the
folder name will not find it. Either move the graph-preview composition to its
own ownership (`composition/spaces/studio/graph-preview.ts`), or rename the
folder to stop claiming it is development-only.

### F7 — Medium: the control-plane entrypoint does not share the launch policy

`architecture.md:63-65` states that process startup used three indistinguishable
`start` methods and that entrypoints now share one launch policy. That is true
for three of four entrypoints. `entrypoints/control-api.ts` is a 93-line
standalone bootstrapper with its own `start()` (`:24`), it is absent from the
`starters` map (`kernel/launch.ts:9-13`), and it is not a `ProcessRole`. It
deliberately avoids `bootstrap` (`:15-16`), which is defensible, but then the
folder mixes three two-line `launchHost` wrappers with one full bootstrapper and
the shared policy is only nominally shared. Also, `privateFile` (`:17`) reads a
file; `readPrivateFile` would say so.

`src/main.ts` and `entrypoints/api.ts` differ only in that `main.ts` lets `MODE`
choose. Both are needed while deployment manifests invoke `dist/main.js` and
`MODE`, so neither can be removed from the repository alone.

### F8 — Medium: config/kernel layering, verb and test-placement inconsistencies

- **Layering inversion.** `config/deployment-environment.ts:1` imports
  `RegistrationPlan` from `../kernel/registration-plan.js`, while
  `kernel/registration-plan.ts:1` imports `DeploymentProfile` from
  `../config/deployment-profile.js`. The dependency points both ways between the
  two folders. `deployment-environment.ts` takes a kernel concept and is
  deployment-selection policy, not environment parsing — it belongs in `kernel/`
  beside `registration-plan.ts`.
- **Duplicated role validation and a duplicated error code.**
  `config/validation.ts:9-11` and `config/deployment-profile.ts:17` both read
  `MODE` and both throw `DEPLOYMENT_ROLE_MISMATCH`. `kernel/launch.ts` calls the
  first and `kernel/bootstrap.ts` calls the second.
- **`bootstrap` is not in the documented kernel vocabulary** (`create`, `load`,
  `launch`), and the name implies the top of the chain when it is the bottom:
  `launch.ts:10-12` → `composition/runtimes/*` → `bootstrap.ts`. Rename to
  `composeHost` or fold it into the runtime starters.
- **`read` where the convention says `load`:** `readDeploymentProfile`
  (`config/deployment-profile.ts:12`) and `readControlPlaneConfiguration`
  (`config/control-plane.ts:4`).
- **`config/environment.ts` (1,266 lines) mixes five concerns:** the `HostConfig`
  shape (`:5-253`), coercion helpers (`:256-308`), section parsing
  (`:310-901`), assembly with defaults and fail-closed validation (`:902-1221`),
  and — the clearly separable part — **rollout/feature policy**
  (`:1118-1220`, the `wave0` and `atlas` flag blocks). Extract the feature
  policy; the rest is one legitimate mapping function.
- **Verb-rule violations.** `registerTelemetry`
  (`infrastructure/telemetry.ts:21`) is a `register*` that returns `close`
  (`:58`), consumed as `shutdownTelemetry` at `register-adapters.ts:28` — the one
  place the documented "register mutates, create returns" rule is broken.
  `register-runtimes.ts` is a `register-*` file that also owns
  `startRuntimes` (`:131`). `runtimes/invalidation-workers.ts:10` exports
  `registerInvalidationWorkers` inside a folder documented as `start*Runtime`
  only. Off-vocabulary verbs: `qualifyRuntimePlaneDatabase`
  (`infrastructure/database-qualification.ts:21`),
  `selectDatabaseConfiguration` (`infrastructure/database-selection.ts:5`),
  `selectDeploymentEnvironment`, `selectProcessRole`,
  `evaluateHostCapabilities`, `requireEntityPermissionTransitions`
  (`shared/entity-runtime/permission-transitions.ts:7` — should be `assert*`,
  but see F1), and `validatePlatformAuthority`
  (`shared/identity/platform-authority.ts:11`, which already has a sibling
  `assertPlatformAuthority` at `:24`).
- **Two root tests that do not belong there.**
  `src/__tests__/lifecycle.test.ts:2` imports `createLifecycle` from
  `@athyper/server-foundation/lifecycle`, not from any host module; there is no
  `lifecycle.ts` in this app. It duplicates the owner package's own
  `server/packages/foundation/src/lifecycle/__tests__/lifecycle.test.ts`
  (LIFO order and error swallowing). The name and location imply host lifecycle
  coverage that does not exist — delete it.
  `src/__tests__/config.test.ts:2` (864 lines, 41 cases) is the only test for
  `config/environment.ts`, while every other config module has an adjacent test.
  It should be `config/environment.test.ts`.
- **`initializeErrorCollector`** (`diagnostics/telemetry/error-collector.ts:5`)
  uses `initialize` where the documented vocabulary reserves `start` for
  starting resources. `startErrorCollector` is consistent with
  `startProcessHeartbeat` and `startProcessMetricsEndpoint` in the same tree.
- **Inconsistent test placement inside `development/`:**
  `development/publication.test.ts` and `development/runtime-publication.test.ts`
  sit beside their subjects while the folder's other two tests
  (`__tests__/graph-preview-ai-bindings.test.ts`,
  `__tests__/local-verification-delivery.test.ts`) use `__tests__/`. Pick one.

### F9 — Medium: duplicated logic that renames alone will not fix

- **Plane→adapter transaction dispatch is implemented four times** with the same
  three-branch shape: `infrastructure/transactions.ts:15-59`,
  `register-runtimes.ts:169-218`, `register-platform.ts:948-969`, plus an
  imported exact-plane coordinator. Fix the duplication in F2 and this collapses.
- **`createEntityParentAdmission` (`parent-admission.ts:22-29`) and
  `createPublishedParentAdmission` (`published-parent-admission.ts:15-28`)**
  build an identical frozen `{ scopeResources }` envelope with the same tenant
  checks; only the binding source differs. One helper, two call sites.
- **Publication workload configuration is validated twice** — the dev-only gate
  at `workload-configuration.ts:11-12` is re-implemented at
  `workload-routes.ts:22`, and the wiring type is re-declared at
  `workload-routes.ts:13` instead of importing `PublicationWorkloadConfiguration`.
- **The review/worker invariant is duplicated:** `registration-plan.ts:14`
  (`RELEASE_REVIEW_WORKER_REQUIRED`) and `module-registry.ts:24-26`
  (`HOST_COORDINATION_MODULE_EXCLUDED`).
- **`runtimes/workers.ts` and `runtimes/scheduler.ts`** repeat the same
  heartbeat + metrics + shutdown block verbatim; only the maintenance work and
  the invalidation registration differ.
- **`atlasDocumentSearchTerms` is importable from two modules**
  (declared `shared/ai/atlas-semantic-index.ts:10`, re-exported
  `shared/ai/atlas-document-grounding.ts:18`).

### F10 — Low: compatibility shims are justified but carry no source consumers

`composition/create-container.ts` is a 6-line `export *` from
`kernel/container.js`; `config/index.ts` is a 6-line `export *` from
`environment.js`; `register-platform.ts:204` is
`export const registerPlatform = registerIdentityPlatform` marked `@deprecated`.
All three have **zero importers under `src/`**. Their consumers are operational
scripts outside this app:

```
tooling/scripts/verification/isolated-enter/deploy-company-provenance-projection.mjs
tooling/scripts/verification/isolated-enter/rehearse-company-signed-projection.mjs
tooling/scripts/verification/isolated-execution/host.mjs
tooling/scripts/verification/qualify-document-indexing-live.mjs
```

and those scripts load built paths (`./dist/config/index.js`,
`./dist/composition/create-container.ts`). So they cannot be deleted from source
today. They can, however, never be validated by the host test suite, and the
built-file consumers mean a stale local `dist/` silently changes their
behaviour. Track them explicitly and decommission when the scripts migrate to
`loadConfig`/`createContainer` canonical paths, as `module-ownership.md:109-110`
already intends.

### F11 — Low: script taxonomy and test discovery

- `vitest.config.ts:7` includes only `src/**/*.test.ts` and
  `scripts/**/*.test.ts`. Therefore `scripts/db-verification/tests/integration/atlas/*.mts`
  (7 files) and every `.mjs` script are **not collected by any runner**, despite
  sitting in a directory named `tests/`. If they are qualification procedures
  run by hand, name them as procedures (`qualify-*.mts`) rather than as tests;
  if they are tests, they need an include rule.
- The `scripts/` taxonomy mixes a purpose level with an artifact level:
  `scripts/db-verification/{provisioning, tests/integration}` puts "the action"
  next to "the kind of file" at the same depth. `scripts/{operations,
  verification}` are purpose-named and are consistent with each other.
- The proposal's `scripts/development/` does not exist and has no content in
  this app. Do not create it.
- `src/scripts/` is correctly retained: `tsconfig.json` sets `rootDir: src`, so
  moving these CLIs changes the build contract and the `package.json` commands.

### F12 — Medium: modules with no production consumer, several of which the docs still describe as live

- **`development/verification-delivery.ts`** (40 lines, both exports) is imported
  only by `development/__tests__/local-verification-delivery.test.ts:3`. No
  production importer exists, and `docs/composition-baseline.json` records the
  pre-move path with `"registrations": []`. It is dead code with a passing test.
- **`spaces/mesh/exchange-readiness.ts`** is imported only by its two tests; no
  `runtimes.health.register` call exists anywhere for it, so the Mesh readiness
  probe never runs. `module-ownership.md:96` and `architecture.md:22` state the
  opposite. Additionally `mesh-exchange-readiness.postgres.test.ts:8` is gated on
  `MESH_READINESS_TEST_DOCKER`, which no workflow sets, so it never runs in CI.
- **`spaces/neon/supplier-information-sla.ts`** has no host caller at all; its
  only consumer is `tooling/scripts/verification/qualify-task-response-escalation-db.mts`.
- **Scripts with no runner and no `package.json` entry:**
  `scripts/operations/enroll-publication-policy.mjs` (referenced only by a
  runbook), `scripts/verification/inventory-publication-exports.mjs` (referenced
  only by `docs/publication-export-audit.md:26`; `package.json:7-8` exposes only
  `inventory:composition` and `inventory:deleted-exports`),
  `scripts/db-verification/tests/integration/business-partner-case-contract-publication.ts`,
  and `scripts/db-verification/tests/integration/publication-authority-repository.mjs`
  (a divergent duplicate of the copy already run by
  `server/packages/services/publication/package.json:26`).
- `scripts/db-verification/provisioning/qualification-contract-overlay.ts` is the
  only provisioning overlay without a `.test.ts` sibling; it is covered only
  indirectly via `spaces/neon/__tests__/partner-section-contract.test.ts`.

Each of these is either a module that should be wired up or a file that should be
deleted. Naming cannot fix it, but the review should not rename them into
looking load-bearing either.

### F13 — Low: cache and ownership inversion for the `.mts` integration scripts

- `server/db/package.json:11,155,156` runs the Atlas `.mts` procedures
  (`learning-inbox.mts`, `intent-feedback.mts`, `retrieval.mts`) from *another*
  workspace package, so their ownership is inverted relative to where they live.
- `turbo.json` `test.inputs` is `["src/**", "**/*.ts", "tests/**", "vitest.config.*"]`.
  `**/*.ts` does not match `.mts`, so edits to `scripts/**/*.mts` do not
  invalidate the test cache.

Both are the same root cause as F11: the `.mts` extension was chosen because
there is no runner for these files, not because of a design decision.

---

## 4. Recommended target shape

Only the deltas are shown; everything else stays as-is.

```
composition/
  infrastructure/          # unchanged; rename verbs per F8, single PlaneKey per F2
  runtimes/
    invalidation-workers.ts -> invalidation-worker-registration.ts   # F8 (folder says start*Runtime)
  shared/
    entity-runtime/
      routes.ts -> read-bindings.ts                                  # F4
      http.ts -> http-registrars.ts                                  # F4
      metadata-hooks.ts -> metadata-validation.ts                    # F4
      publication-qualification.ts -> publication/publication-qualification.ts  # F4
      record-display-choices.ts                                      # F5: replace allowlist with metadata
      activity-presentation.ts                                       # F5: remove supplier branches
    collaboration/index.ts -> collaboration/section-providers.ts     # F4
    verification/routes.ts -> verification.ts (or split)             # F4
    ai/                                                              # F4/F5: drop the product prefix
    publication/workload*.ts                                         # F5: de-entity the Reference* naming
  control-plane/register.ts -> control-plane/control-plane.ts        # F4
  coordination/entity-release-review/register.ts -> release-review.ts # F4 (it registers nothing)
  spaces/studio/trustiam/onb/register.ts -> spaces/studio/onboarding/register-studio-onboarding.ts # F4
  spaces/studio/graph-preview.ts                                     # F6 (moved out of development/)
  spaces/neon/supplier-information-sla.ts -> supplier-information-escalation.ts # F4 (name vs DDL behaviour)
  spaces/neon/__tests__/finance-http-review.test.ts -> finance-routes.test.ts   # F4
  spaces/mesh/exchange-readiness.ts                                  # F12: wire it or delete it

diagnostics/
  telemetry/error-collector.ts                                       # F8: initializeErrorCollector -> startErrorCollector
                                                                     # unchanged otherwise; no readiness/ folder

kernel/
  bootstrap.ts -> compose-host.ts                                    # F8
  capability-readiness.ts                                            # F3: wire it or delete it
  deployment-environment.ts                                          # F8: moved here from config/

config/
  environment.ts                                                     # F8: extract feature policy (1118-1220)
  environment.test.ts                                                # F8: moved from src/__tests__/config.test.ts
```

**Deliberately not created:** `kernel/lifecycle.ts`, `kernel/module-contract.ts`,
`kernel/dependency-graph.ts`, `diagnostics/readiness/`, `scripts/development/`.

---

## 5. Sequencing

Renaming in this app has already broken two governance gates once (F1). Do the
work in this order, and keep each step independently verifiable:

1. **Repair references** (F1). Re-run the governance generators, fix the
   ratchet keys, and add the missing-path guard. Verify both gates exit 0 and
   `pnpm --filter @athyper/server-platform-host typecheck` passes.
2. **Delete what is dead or misleading** (F3, F8 test items, F12):
   `capability-readiness.ts` if it stays unwired, `src/__tests__/lifecycle.test.ts`,
   `development/verification-delivery.ts`, and the unrunnable script copies; wire
   or delete `spaces/mesh/exchange-readiness.ts` and decide the fate of
   `spaces/neon/supplier-information-sla.ts`.
3. **Collapse duplicate vocabulary** (F2). This is mechanical, has no behaviour
   change, and removes the largest class of naming violations.
4. **Generalize the framework** (F5). Entity codes and supplier/Atlas copy move
   into published metadata. This is the highest-value work and it is inside the
   standing scope.
5. **Rename for truthfulness** (F4, F6, F7, F8 verbs). Do this last, in one
   commit per folder, regenerating the governance artifacts in the same commit.

## 6. Scope note

The standing repository instruction limits work to new Entity onboarding and
improvements to the shared Entity Framework. Steps 1, 2 and 5 are cross-cutting
host refactors, not entity-framework work; step 4 is squarely in scope, and step
3 is in scope where it touches `composition/shared/`. Steps 1 and 2 are repairs
of regressions introduced by an earlier move and should be treated as debt
repayment rather than new architecture. Confirm with the project owner before
starting step 5.
