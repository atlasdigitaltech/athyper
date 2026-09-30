# Meta-entity authoring plane — exhaustive per-file review

Date: 2026-09-29
Reviewer: read-only agent review (no files in scope modified, no builds or servers run)
Revisions reviewed: **current working tree** contents. `git status --porcelain` for all four scoped trees is **clean** — none of the files below are part of the in-flight uncommitted refactor listed elsewhere in the repo; they are committed code.

Scope roots and file counts:

| Root | Files | Lines |
|---|---|---|
| `server/packages/planes/studio/meta-entity-authoring/src` | 95 (46 source, 49 tests) | 9,169 |
| `server/packages/contracts/meta-entity-authoring/src` | 3 | 271 |
| `server/packages/contracts/collaboration/src` | 3 | 142 |
| `server/packages/planes/studio/onboarding/src` | 12 (7 source, 5 tests) | 2,623 |
| **Total** | **113** | **12,205** |

Table path abbreviations: `MEA/` = `server/packages/planes/studio/meta-entity-authoring/src/`, `CMA/` = `server/packages/contracts/meta-entity-authoring/src/`, `CC/` = `server/packages/contracts/collaboration/src/`, `ONB/` = `server/packages/planes/studio/onboarding/src/`.

An automated relative-import resolution pass was run over all 113 files; three files reference modules that do not exist (Finding 4).

## Coverage

| file | lines | verdict |
|---|---|---|
| MEA/__tests__/amend-successor-capabilities.test.ts | 25 | clean |
| MEA/__tests__/amend-successor-collaboration.test.ts | 43 | clean |
| MEA/__tests__/amend-successor-localization.test.ts | 39 | clean |
| MEA/__tests__/authorization-successor.test.ts | 19 | clean |
| MEA/__tests__/baseline-publication.test.ts | 43 | findings 1 |
| MEA/__tests__/canonical-v2-successor.test.ts | 51 | clean |
| MEA/__tests__/capability-profile-files.test.ts | 41 | clean |
| MEA/__tests__/collection-authoring-routes.test.ts | 128 | clean |
| MEA/__tests__/collection-configuration.test.ts | 118 | clean |
| MEA/__tests__/collection-publication.test.ts | 81 | clean |
| MEA/__tests__/collection-relationship.test.ts | 168 | clean |
| MEA/__tests__/configuration-editor-qualification.test.ts | 22 | findings 1 |
| MEA/__tests__/deterministic.test.ts | 397 | clean |
| MEA/__tests__/development-publication-source.test.ts | 44 | clean |
| MEA/__tests__/development-publication.test.ts | 264 | clean |
| MEA/__tests__/document-collection-publication.test.ts | 58 | clean |
| MEA/__tests__/durable-graph-preview.test.ts | 119 | clean |
| MEA/__tests__/durable-preview-adapter.test.ts | 107 | clean |
| MEA/__tests__/entity-ai.test.ts | 51 | clean |
| MEA/__tests__/entity-authorization.test.ts | 129 | findings 1 |
| MEA/__tests__/entity-registration.test.ts | 130 | clean |
| MEA/__tests__/execution-binding-storage.test.ts | 51 | clean |
| MEA/__tests__/graph-builder.test.ts | 43 | clean |
| MEA/__tests__/graph-editor-routes.test.ts | 77 | clean |
| MEA/__tests__/graph-preview-hook.test.ts | 84 | clean |
| MEA/__tests__/graph-preview.test.ts | 257 | clean |
| MEA/__tests__/independent-review.test.ts | 54 | clean |
| MEA/__tests__/intake-presentation.test.ts | 31 | findings 1 |
| MEA/__tests__/learning-inbox.test.ts | 39 | findings 1 |
| MEA/__tests__/learning-route-scope.test.ts | 22 | clean |
| MEA/__tests__/list-experience.test.ts | 119 | clean |
| MEA/__tests__/notification-authoring-routes.test.ts | 170 | clean |
| MEA/__tests__/notification-inspection-routes.test.ts | 54 | clean |
| MEA/__tests__/notification-publication.test.ts | 69 | clean |
| MEA/__tests__/prepare-release.test.ts | 64 | clean |
| MEA/__tests__/prepare-successor.test.ts | 31 | clean |
| MEA/__tests__/product.test.ts | 154 | clean |
| MEA/__tests__/publication-adapter.test.ts | 13 | clean |
| MEA/__tests__/publication-workflow.test.ts | 148 | clean |
| MEA/__tests__/release-inspection-repository.test.ts | 81 | clean |
| MEA/__tests__/release-inspection-routes.test.ts | 113 | clean |
| MEA/__tests__/restoration-publication-conflict.test.ts | 14 | clean |
| MEA/__tests__/reviewer-read-routes.test.ts | 114 | clean |
| MEA/__tests__/runtime-restoration.test.ts | 130 | clean |
| MEA/__tests__/structural-editor-qualification.test.ts | 45 | findings 1 |
| MEA/__tests__/successor-source.test.ts | 62 | clean |
| MEA/__tests__/system-reference-authoring.test.ts | 45 | clean |
| MEA/__tests__/table-product.test.ts | 31 | clean |
| MEA/__tests__/target-compiler.test.ts | 59 | clean |
| MEA/authoring-service.ts | 362 | findings 1 |
| MEA/authoring/adopt-capability-profiles.ts | 32 | clean |
| MEA/authoring/capability-profile-files.ts | 36 | clean |
| MEA/authoring/graph-builder.ts | 84 | clean |
| MEA/authoring/product.ts | 91 | clean |
| MEA/authoring/table-product.ts | 164 | clean |
| MEA/authorization-successor-publication.ts | 35 | clean |
| MEA/authorization-successor.ts | 43 | findings 1 |
| MEA/baseline-publication.ts | 80 | clean |
| MEA/collection-authoring-routes.ts | 156 | findings 1 |
| MEA/collection-publication.ts | 56 | clean |
| MEA/collection-relationship.ts | 108 | clean |
| MEA/compilation/entity-target-compiler.ts | 65 | clean |
| MEA/compilation/target-compiler.ts | 40 | clean |
| MEA/deterministic.ts | 1325 | findings 3 |
| MEA/development-publication.ts | 262 | findings 1 |
| MEA/document-collection-publication.ts | 58 | findings 1 |
| MEA/durable-graph-preview-adapter.ts | 130 | clean |
| MEA/durable-graph-preview.ts | 207 | clean |
| MEA/entity-ai.ts | 22 | clean |
| MEA/entity-authorization.ts | 94 | findings 1 |
| MEA/entity-registration.ts | 35 | clean |
| MEA/graph-dependencies.ts | 195 | findings 1 |
| MEA/graph-identity.ts | 22 | clean |
| MEA/graph-preview.ts | 147 | findings 1 |
| MEA/graph-storage-order.ts | 40 | findings 1 |
| MEA/index.ts | 35 | clean |
| MEA/kysely-authoring-repository.ts | 1194 | findings 3 |
| MEA/learning-inbox.ts | 584 | findings 2 |
| MEA/learning-publication.ts | 35 | clean |
| MEA/learning-routes.ts | 21 | findings 1 |
| MEA/list-experience.ts | 246 | findings 1 |
| MEA/notification-authoring-routes.ts | 319 | findings 1 |
| MEA/notification-publication.ts | 95 | findings 1 |
| MEA/publication-adapter.ts | 76 | findings 1 |
| MEA/publication/amend-successor-capabilities.ts | 32 | clean |
| MEA/publication/amend-successor-collaboration.ts | 15 | clean |
| MEA/publication/amend-successor-localization.ts | 52 | clean |
| MEA/publication/prepare-release.ts | 90 | clean |
| MEA/publication/prepare-successor.ts | 83 | clean |
| MEA/publication/publication-workflow.ts | 186 | clean |
| MEA/publication/successor-source.ts | 26 | clean |
| MEA/routes.ts | 362 | findings 2 |
| MEA/runtime-restoration-publication.ts | 61 | clean |
| MEA/runtime-restoration.ts | 104 | findings 1 |
| MEA/system-reference-authoring.ts | 89 | findings 1 |
| CMA/index.ts | 3 | clean |
| CMA/model.ts | 133 | findings 1 |
| CMA/ports.ts | 135 | clean |
| CC/collaboration.ts | 117 | clean |
| CC/index.ts | 2 | clean |
| CC/ports.ts | 23 | clean |
| ONB/case-lifecycle.test.ts | 258 | clean |
| ONB/case-lifecycle.ts | 549 | findings 1 |
| ONB/index.ts | 5 | clean |
| ONB/kysely-onboarding-saga-repository.ts | 411 | findings 1 |
| ONB/maintenance.test.ts | 29 | clean |
| ONB/maintenance.ts | 52 | findings 1 |
| ONB/repository.test.ts | 142 | clean |
| ONB/routes.test.ts | 212 | clean |
| ONB/routes.ts | 324 | findings 1 |
| ONB/saga.test.ts | 244 | clean |
| ONB/saga.ts | 187 | findings 1 |
| ONB/validation.ts | 60 | clean |

Coverage: **113/113 files read in full** (large files read in stated chunks: `deterministic.ts` 1‑340 / 341‑680 / 681‑1020 / 1021‑1325; `kysely-authoring-repository.ts` 1‑400 / 401‑800 / 801‑1194; `learning-inbox.ts` full; `case-lifecycle.ts` full; `kysely-onboarding-saga-repository.ts` full).

## Findings

### [high] Authored navigation config overrides computed security fields of the published list action
Location: `server/packages/planes/studio/meta-entity-authoring/src/list-experience.ts:201-206`

What is wrong: the navigation entry for an action is built by spreading the *computed* action first and the *authored, unvalidated* navigation config second. `navigationConfig` is only a type cast of `config["navigation"]`; only its **keys** are validated (`list-experience.ts:166-168`), never its values.

Evidence:
```ts
const navigation = navigationBindings.map((binding) => {
    const config = navigationConfig[binding.placementKey];
    ...
    const action = actions.find((item) => item.key === binding.placementKey)!;
    ...
    return {
      ...action,
      ...config,
      placement:
        binding.interactionTarget === "navigation" ? "direct" : "overflow",
    };
  });
```
The computed `action` (lines 131-147) contains `requiresPreflight: true` when the operation has a `visibilityRule`, a confirmation surface, `requiresMfa`, lifecycle bindings or policy bindings, plus the derived `permissions`, `rules` and `scopes`. The published parser only re-checks that `permissions` is non-empty and `requiresPreflight` is a boolean (`packages/contracts/platform/entity-list/src/experience.ts:222-225, 294-295`), so an author-supplied `requiresPreflight: false` (and a substituted `permissions`/`rules`/`scopes` array) survives into the signed descriptor.

Impact scenario: an author with `metadata.entity.author` writes
`surfaces[list].layoutConfig.experience.navigation.<placementKey> = { kind: "review", workflowKey: "w", requiresPreflight: false }`
and the reviewed/published list experience declares `requiresPreflight: false` for an operation that requires MFA, a confirmation surface or a policy preflight — authored metadata that widens runtime behaviour past the compiler's own gate. Substituting `permissions` lets an action be surfaced on a plane the graph never bound it to.

Suggested fix: never spread the authored value over the computed object. Destructure an explicit allowlist and ignore/reject everything else, e.g.
`const { kind, workflowKey, attentionCountKey } = config; return { ...action, kind, ...(workflowKey?{workflowKey}:{}), ...(attentionCountKey?{attentionCountKey}:{}), placement: ... }`, and assert `parsePublishedListExperience` sees the compiler-computed `permissions`/`rules`/`scopes`/`requiresPreflight`.

### [high] Authoring route errors are never mapped: 500 instead of 400/403/404/409
Location: `server/packages/planes/studio/meta-entity-authoring/src/routes.ts:285-299` (with `server/packages/runtime/http/src/http-runtime.ts:219-244`)

What is wrong: `handler()` only converts `AuthoringConflictError` and one specific `AuthoringPolicyError` code. Every other `AuthoringPolicyError` and every `TypeError` raised by the route's own validators is forwarded to `next(error)`. The host's global error middleware recognises only JSON-parse/body-size/media-type errors and `HttpError`; everything else becomes a 500. `grep -rn "AuthoringPolicyError|AuthoringConflictError" server/apps server/packages/platform server/packages/foundation` outside this package returns **nothing**.

Evidence:
```ts
function handler(fn: (q: any, s: any) => Promise<void>): RequestHandler {
  return (q, s, n) => {
    void fn(q, s).catch((error) => {
      if (error instanceof AuthoringPolicyError && error.code === "RESTORATION_PUBLICATION_ALREADY_EXISTS") { ...409... }
      if (error instanceof AuthoringConflictError) { ...409... }
      n(error);
    });
  };
}
```
Reachable mis-typings: `str()/uuid()/rev()` `TypeError` (missing/invalid input) → 500 instead of 400 (`routes.ts:300-317`); `breakGlass()` `TypeError` → 500 instead of 400 (`routes.ts:340-348`, exercised as 400 only because tests install their own handler at `__tests__/learning-route-scope.test.ts:12`); `assertTenant` `AuthoringPolicyError("FORBIDDEN")` on a cross-tenant change set → 500 instead of 403 (`authoring-service.ts:46-49`); `required()` `CHANGE_SET_NOT_FOUND` → 500 instead of 404 (`authoring-service.ts:353-359`); `VALIDATION_FAILED`/`CONTRACT_TESTS_FAILED` on submit → 500 instead of 409/422 (`authoring-service.ts:177-186`).

Impact scenario: every client-side error path in the authoring UI becomes "Internal Server Error"; cross-tenant access attempts are indistinguishable from infrastructure faults in logs/alerts, and retry-on-500 logic can loop. Note the sibling route modules *do* map these (`collection-authoring-routes.ts:29-49`, `notification-authoring-routes.ts:43-66`), so the omission is clearly an oversight, not a policy.

Suggested fix: give `handler` the same mapping used by the collection/notification wrappers (TypeError → 400/422, `AuthoringPolicyError` code → 403 for `FORBIDDEN`, 404 for `*_NOT_FOUND`, 409 for the conflict codes, 503 for `*_UNAVAILABLE`), or install a host-level mapper for `AuthoringPolicyError`/`AuthoringConflictError`.

### [high] `redispatch` republishes a body-supplied release id with no tenant/revision re-check; `getSignedRelease` primary read has no tenant predicate
Location: `server/packages/planes/studio/meta-entity-authoring/src/routes.ts:178-191`, `server/packages/planes/studio/meta-entity-authoring/src/authoring-service.ts:264-278`, `server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.ts:538-561`

What is wrong: for `POST /change-sets/:id/publish` with `body.releaseId`, the handler only scopes `:id`
(`scoped(o, c, uuid(q.params.id))`) and then calls `redispatch` with the caller-supplied release id. `redispatch` loads the signed artifact by id and immediately republishes it to caller-supplied planes:

Evidence:
```ts
// routes.ts
(id, c, q) =>
  q.body?.releaseId
    ? o.service.redispatch({
        releaseId: uuid(q.body.releaseId),
        targetPlanes: planeList(q.body),
      })
    : o.service.publish({ ... }),
```
```ts
// authoring-service.ts
async redispatch(input: { releaseId: string; targetPlanes: readonly (...)[] }) {
    const artifact = await this.options.repository.getSignedRelease(input.releaseId);
    if (!artifact?.signature) throw new AuthoringPolicyError("SIGNED_RELEASE_REQUIRED", ...);
    await this.options.publication.publish({ ...input, artifact });
```
Unlike `publish()`, `redispatch()` takes no `expectedRevision`, does not consult the change set, and `getSignedRelease`'s primary query filters only by `r.id`:
```sql
SELECT r.contract_hash,... FROM metadata.entity_release r
JOIN snapshot.entity_release_artifact a ON a.source_release_id=r.id
WHERE r.id=${id}::uuid ORDER BY a.plane_key LIMIT 1
```
while the *fallback* branch in the same function **does** add `AND r.tenant_id=shared.current_tenant_id()` (line 548). The asymmetry is a real inconsistency; the only remaining compensations are the injected `Authorizer` honouring `resource.releaseId` and PostgreSQL RLS (`metadata.entity_release` and `snapshot.entity_release_artifact` are both `FORCE ROW LEVEL SECURITY`).

Impact scenario: a tenant author who may publish *their own* change set can pass another tenant's signed release id and cause that artifact to be dispatched to arbitrary planes of their choosing, bypassing the change-set/revision pin the normal publish path enforces. `POST /releases/:id/rollback` is safer (its `createRelease` re-reads the prior release with `prior.entity_id=cs.entity_id AND prior.tenant_id IS NOT DISTINCT FROM cs.tenant_id`, `kysely-authoring-repository.ts:495`), which shows the intended pattern.

Suggested fix: derive `releaseId` from the change set and tenant instead of the body (or validate `metadata.entity_release.change_set_id = :id AND tenant_id = caller` inside the repository before returning), add `r.tenant_id=shared.current_tenant_id()` to the primary `getSignedRelease` query, and require `expectedRevision`/`expectedContractHash` for redispatch.

### [high] Three in-scope test files import modules that no longer exist
Location: `server/packages/planes/studio/meta-entity-authoring/src/__tests__/intake-presentation.test.ts:3`, `.../configuration-editor-qualification.test.ts:2-3`, `.../structural-editor-qualification.test.ts:2-3`

What is wrong: an automated resolution pass over all 113 files found exactly these dangling relative specifiers. `src/intake-presentation.ts` is absent from the package (and is not exported from `index.ts`); `packages/planes/studio/business-partner/src` does not exist at all — the package directory contains only `node_modules` (the module was deleted, the tests were not).

Evidence:
```ts
// intake-presentation.test.ts:3
import { publishedBusinessPartnerIntakeOverlay } from "../intake-presentation.js";
```
```ts
// configuration-editor-qualification.test.ts:2-3
import { configurationEdit } from "../../../../../../../packages/planes/studio/business-partner/src/composition-configuration";
import { configurationFixture } from "../../../../../../../packages/planes/studio/business-partner/src/composition-configuration.fixture";
```
```ts
// structural-editor-qualification.test.ts:2-3
import { structuralEdit } from "../../../../../../../packages/planes/studio/business-partner/src/composition-structure";
import { graph } from "../../../../../../../packages/planes/studio/business-partner/src/composition-structure.fixture";
```

Impact scenario: the package's test suite cannot collect; whoever fixes it will likely delete the tests, silently removing the only coverage for the intake-presentation overlay and for interactive structural/configuration editing feeding `validateGraph`/`compileGraph`. If the modules were moved, the tests have been dead since the move — every green run in between was not exercising them.

Suggested fix: restore/relocate the implementations (or their fixtures) and repoint the imports; if `intake-presentation` was deliberately removed, delete its test and confirm the intake overlay behaviour is covered elsewhere.

### [high] `contractHash` does not cover descriptor-affecting order choices, so one reviewed hash can publish different content
Location: `server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts:633-637, 667-673`, `server/packages/planes/studio/meta-entity-authoring/src/authoring-service.ts:243-244`, `server/packages/planes/studio/meta-entity-authoring/src/notification-publication.ts:49`

What is wrong: `contractHash = sha256(graph)` canonicalises *listed* branches by sorting them (`deterministic.ts:805-839` includes `surfaces` and `searchProfiles`), so reordering those arrays does not change `contractHash`. But the descriptor is built from the **raw** array order in at least two places:

Evidence:
```ts
// deterministic.ts — default surface / default search profile resolved by position
const surface =
    surfaces.find((candidate) => candidate.isDefault) ??
    [...surfaces].sort((left, right) => compareText(left.surfaceKey, right.surfaceKey))[0];
...
const defaultSearch =
    (graph.searchProfiles ?? []).find((profile) => profile.isDefault && profile.status !== "deprecated") ??
    (graph.searchProfiles ?? []).find((profile) => profile.status !== "deprecated");
```
```ts
// notification-publication.ts
entityCode: Object.values(notifications)[0]?.targetEntityCode,
```
`validateGraph` never enforces "exactly one `isDefault` list surface" or "exactly one `isDefault` search profile" (contrast the guards it *does* apply for `recordPresentation`, ownerAccess, directoryScope, collection relationship, AI, capabilities — `deterministic.ts:527, 552, 555, 562`). `compileListExperience` is invoked on the selected surface, so the whole `listPresentation` branch of the descriptor follows that choice. `publish()` pins only the contract hash:
```ts
if (input.expectedContractHash !== undefined && compiled.contractHash !== input.expectedContractHash)
  throw new AuthoringPolicyError("PUBLICATION_REVIEWED_SOURCE_CHANGED", ...);
```

Impact scenario: two graphs with identical canonical content (same `contractHash`, so the same reviewed pin) but a different `surfaces`/`searchProfiles` array order produce different `descriptorHash` and different published list experience. A reviewer approving `H` is not approving the descriptor that is signed and dispatched; a re-submission that only permutes array order passes the `expectedContractHash` check while changing runtime list/search defaults. (`notificationPublicationDescriptor` is partially protected: `parseNotificationPublicationDescriptor` rejects differing `targetEntityCode`s — `server/packages/contracts/publication/src/notification-policy.ts:468`.)

Suggested fix: make descriptor construction a pure function of the canonical value (sort `surfaces`/`searchProfiles` before selecting defaults, or select by an explicit unique key), and add validation that at most one list surface and one search profile is `isDefault`. Additionally pin `descriptorHash` (not only `contractHash`) in `expectedContractHash`-style checks so review always covers the published artifact.

### [medium] Locale-dependent `localeCompare` used for canonical ordering that feeds hashes and idempotency fingerprints
Location: `server/packages/planes/studio/onboarding/src/case-lifecycle.ts:508`, `server/packages/planes/studio/meta-entity-authoring/src/graph-dependencies.ts:184`, `server/packages/planes/studio/meta-entity-authoring/src/runtime-restoration.ts:67-69`, `server/packages/planes/studio/meta-entity-authoring/src/authorization-successor.ts:38`, and the consumer `server/packages/contracts/metadata/src/entity-authorization-runtime.ts:40,157`

What is wrong: the authoring package's own canonicaliser uses code-unit comparison (`deterministic.ts:1323-1325 compareText`), but four ordering sites use `localeCompare`, which depends on the runtime's ICU default locale/collation.

Evidence:
```ts
// case-lifecycle.ts
return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
```
```ts
// graph-dependencies.ts
].sort((left, right) => dependencyKey(left).localeCompare(dependencyKey(right)));
```
```ts
// runtime-restoration.ts (and identically authorization-successor.ts:38)
bindings: [...runtime.bindings].sort((a: Json, b: Json) => a.operation.localeCompare(b.operation)),
```
```ts
// server/packages/contracts/metadata/src/entity-authorization-runtime.ts
bindings.sort((a, b) => a.operation.localeCompare(b.operation)),
```
That last line is the canonical order of the `authorizationRuntime.bindings` array **inside the compiled descriptor**, therefore part of `descriptorHash`; `__tests__/entity-authorization.test.ts:125` hard-codes that locale-dependent order as expected output, locking the behaviour in. `case-lifecycle.ts` feeds `fingerprint` and `desiredHash`, which drive idempotent replay (`kysely-onboarding-saga-repository.ts:57-62`) and release/desired-version advancement.

Impact scenario: the same authored input can yield a different `descriptorHash` (breaking draft/published comparison, `DEVELOPMENT_PUBLICATION_UNCHANGED` short-circuits, `evaluated_hash` checks in `learning-inbox.ts:348`) or a different onboarding fingerprint (spurious `ONBOARDING_IDEMPOTENCY_CONFLICT`, or a false replay) depending on locale/ICU version — including between developer machines and CI.

Suggested fix: replace all four with `compareText`-style code-unit comparison (or a stable explicit sort key), and add a test that runs the canonicaliser under two different collations.

### [medium] `validateGraph` throws instead of reporting on malformed array rows (500 on a submitted graph)
Location: `server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts:789, 886, 929, 1098, 1157-1162, 1195`

What is wrong: after only checking `Array.isArray(branch)`, the validator calls `Reflect.get(row, property)` and `Object.entries(row)` on each element. `Reflect.get(null, …)` and `Object.entries(null)` throw `TypeError`.

Evidence:
```ts
function uniqueKeys<T extends object>(rows: readonly T[], property: string, path: string, issues: ValidationIssue[]): void {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = Reflect.get(row, property);   // row === null -> TypeError
```
```ts
rows.forEach((row, index) => {
      for (const [property, value] of Object.entries(row)) {   // row === null -> TypeError
```
The same pattern is in `references` (`:886`), `requiredStrings` (`:1098`), `validateListSurfaces`'s `fieldsById`/`fieldsByKey` (`:1157-1162`) and `fieldsById.get(binding.entityFieldId)` (`:1195`).

Impact scenario: `PUT /change-sets/:id/graph` with `{"contractSchema":"…2.1","entity":{…},"fields":[null],"operations":[]}` reaches `KyselyMetaEntityAuthoringRepository.replaceGraph` → `validateGraph` (`kysely-authoring-repository.ts:340`) and throws an unhandled `TypeError` → HTTP 500 (Finding 2), instead of a 400/409 carrying a `GRAPH_*` issue. `compileGraph` is likewise reachable from `publish` (`authoring-service.ts:242`) and `entity-authorization`/`runtime-restoration` compile paths.

Suggested fix: guard each element (`if (!row || typeof row !== "object") { issues.push({code:"GRAPH_ROW_INVALID", …}); return; }`) before `Reflect.get`/`Object.entries`, and add a `[null]`/`["x"]` case per branch to `deterministic.test.ts`.

### [medium] `runContractTests` accepts vacuous assertions, so the `submit` gate can be satisfied with no real coverage
Location: `server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts:489-509` (gate at `authoring-service.ts:182-186`)

What is wrong: `ContractTestCase.assertion` is a typed union but never validated at runtime, and the equality branch compares `canonicalJson(actual)` with `canonicalJson(test.expected)`. `canonicalJson(undefined)` is the string `"undefined"`… except when both sides are `undefined`, `JSON.stringify(undefined)` returns the value `undefined`, so the comparison is `undefined === undefined` → `true`.

Evidence:
```ts
const actual = readPath(graph, test.path);
const passed =
  test.assertion === "path_exists"
    ? actual !== undefined
    : canonicalJson(actual) === canonicalJson(test.expected);
```
With `{ key: "x", assertion: "path_equals", path: "does.not.exist" }` (no `expected`): `actual === undefined`, `test.expected === undefined`, `canonicalJson(undefined) === canonicalJson(undefined)` → `undefined === undefined` → `passed: true`.

Impact scenario: an author adds a no-op test case, `submit()` sees `tests.passed === true` (`authoring-service.ts:182-186`) and the change set enters review; the "contract tests" gate provides no assurance. The same weak comparison makes an unknown `assertion` string silently behave as equality.

Suggested fix: validate `assertion ∈ {"path_exists","path_equals"}` and require `expected` for `path_equals` (push a `CONTRACT_TEST_INVALID` issue / fail the test); make `canonicalJson` reject `undefined` (`return JSON.stringify(canonicalValue(value)) ?? "undefined"`).

### [medium] Hard-coded entity codes inside shared authoring/publication code
Location: `server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.ts:99,115` and `server/packages/planes/studio/meta-entity-authoring/src/document-collection-publication.ts:35`

What is wrong: a generic repository method and a generic publication-preparation function filter on a literal entity code.

Evidence:
```ts
// listInspectionReleases
WHERE r.tenant_id=${tenantId}::uuid AND e.entity_code='business_partner'
```
```ts
// readInspectionRelease
WHERE r.tenant_id=${tenantId}::uuid AND r.id=${releaseId}::uuid
        AND e.entity_code='business_partner'
```
```ts
// document-collection-publication.ts
r.entity_code !== "business_partner_request" ||
```

Impact scenario: `GET /api/meta-entity-authoring/inspection/releases` and `…/releases/:id` silently return nothing/404 for every entity except `business_partner`, and `…/releases/:id/activation` is therefore non-functional for all other entities — including any newly onboarded entity, which is exactly the framework's stated purpose. `POST`-path document-collection publication is hard-wired to one entity. This contradicts `AGENTS.md` ("Keep entity-specific configuration in metadata") and is not caught by the source-scanning guard tests, which only scan `authoring/product.ts`, `publication/publication-workflow.ts`, `publication/prepare-successor.ts`, `publication/successor-source.ts` and `compilation/target-compiler.ts` (`__tests__/product.test.ts:135-153`, `__tests__/target-compiler.test.ts:48-58`, `__tests__/publication-workflow.test.ts:137-147`, `__tests__/prepare-successor.test.ts:20-30`, `__tests__/successor-source.test.ts:52-61`).

Suggested fix: remove the literal predicates and let tenant scoping/RLS select the releases; move the document-collection entity gate behind the same marker/contract dispatch used by `compileSystemEntityTarget` (i.e. key off the surface marker or `collectionCompilation` binding rather than the entity name). Extend the source-scanning guard to the repository and all `*-publication.ts` files.

### [medium] Positional contract-test paths are not remapped when a branch has any row without an authored id, although storage assigns random ids
Location: `server/packages/planes/studio/meta-entity-authoring/src/graph-storage-order.ts:10-24` with `server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.ts:791`

What is wrong: `normalizeGraphStorageOrder` exists to keep `tests[].path` (e.g. `fields.3.fieldKey`) attached to the same row after the database reloads rows in `ORDER BY id`. It bails out for an entire branch unless **every** row has a string `id`:

Evidence:
```ts
if (
      name === "classProfiles" ||
      name === "tests" ||
      !Array.isArray(rows) ||
      !rows.length ||
      !rows.every((row) => row && typeof row.id === "string")
    )
      continue;
```
But `insertRows` assigns a fresh random id to each row that lacks one:
```ts
id: typeof id === "string" ? id : randomUUID(),
```
`MetaEntityField.id` and most other branch `id`s are optional in the contract (`server/packages/contracts/meta-entity-authoring/src/model.ts:21-52`), so id-less rows are admissible and `normalizeGraphStorageOrder` will not normalise anything for that branch.

Impact scenario: an authored graph with any id-less row in `fields`/`surfaces`/etc. plus a positional test case is stored under random UUIDs and read back in UUID order; the test path still points at the *submitted* index, so the assertion silently evaluates a different row — a draft-vs-published divergence that can turn a real failure into a pass (or vice versa) between draft validation and publication.

Suggested fix: normalise only the rows that have ids and rewrite the positional index for those, or assign deterministic ids for id-less rows (e.g. derived from `changeSetId + branch + index`, mirroring `graph-builder.ts:36-39`), or reject positional test paths for branches whose rows are not all identity-stable. Also note the JS `a.id < b.id` sort does not match PostgreSQL `uuid` ordering for mixed-case ids.

### [medium] Collection configuration save overwrites the whole `layoutConfig` (silent field drop)
Location: `server/packages/planes/studio/meta-entity-authoring/src/collection-authoring-routes.ts:114-122`

What is wrong: the save builds a brand-new `layoutConfig` object containing only `collectionConfiguration`, discarding every other key on the existing surface.

Evidence:
```ts
const graph = {
            ...state.graph,
            surfaces: [
              {
                ...surface,
                layoutConfig: { collectionConfiguration: configuration },
              },
            ],
          };
```
The guard at lines 100-106 only requires ≤1 surface and that each surface already has `collectionConfiguration`; it does not require `layoutConfig` to be otherwise empty.

Impact scenario: any other `layoutConfig` entry on that surface (`localizedLabels`, `filterPresentation`, `entityValidationMessages`, `renderer`, …) is silently dropped by a successful save. This is a merge/patch semantic that "silently drops fields" — the response contains the persisted revision so the client can detect it only by diffing.

Suggested fix: spread the existing config (`layoutConfig: { ...surface.layoutConfig, collectionConfiguration: configuration }`), or explicitly reject surfaces carrying other `layoutConfig` keys.

### [medium] Database error codes are echoed to clients as 409 in the learning routes
Location: `server/packages/planes/studio/meta-entity-authoring/src/learning-routes.ts:6-12`

What is wrong: the catch-all treats *any* error carrying a string `code` as a conflict and returns it verbatim.

Evidence:
```ts
const code = error?.code;
if (code === "FORBIDDEN") response.status(403).json({ error: code });
else if (error instanceof TypeError) response.status(400).json({ error: "INVALID_ARGUMENT", message: error.message });
else if (typeof code === "string") response.status(409).json({ error: code, message: error.message });
else next(error);
```
PostgreSQL/node-postgres errors carry `code` = SQLSTATE (`23505`, `23503`, `40001`, …), and Kysely wraps them. Every database failure on these routes (unique violation, FK violation, serialization failure, missing RLS context) becomes `409 { error: "23505" }` with the raw driver message.

Impact scenario: internal schema/policy failures are surfaced as client errors with internal codes and messages (information disclosure), and callers will retry or present a "conflict" for infrastructure faults. Compare `onboarding/routes.ts:294-323`, which anchors its conflict mapping (`/^ONBOARDING_[A-Z_]*CONFLICT$/`) and lets everything else fall through to 500 — the correct pattern.

Suggested fix: name the domain error types explicitly (`AuthoringConflictError`, `AuthoringPolicyError`, `LearningConflictError`) and map SQLSTATE-bearing errors to 500; never echo a raw `error.code`.

### [medium] `createRelease` commits before dispatch, so a retry after a dispatch failure allocates another release
Location: `server/packages/planes/studio/meta-entity-authoring/src/authoring-service.ts:247-262` with `server/packages/planes/studio/meta-entity-authoring/src/publication-adapter.ts:36-48`

What is wrong: the release row is committed first, then the dispatch runs; if the dispatch throws, the whole `publish()` call rejects while the release remains.

Evidence:
```ts
const release = await this.options.repository.createRelease({ ... releaseKind: "publish" });
    await this.options.publication.publish({ releaseId: release.id, artifact, targetPlanes: input.targetPlanes });
    return { release, artifact };
```
```ts
await this.options.prepare?.(input);
    const jobId = await this.options.jobs.enqueue("publication.authority", "publication.compile-artifact", { releaseId: input.releaseId }, { enqueueKey: `publication:${input.releaseId}:compile:1`, maxAttempts: 5, ... });
    await this.options.jobs.retry?.("publication.authority", jobId);
```
The enqueue key is scoped to `releaseId`, so idempotency only holds *within* one release; it cannot prevent a second release row. `prepareRuntimeRestorationRelease` explicitly translates a duplicate to `RESTORATION_PUBLICATION_ALREADY_EXISTS` (`runtime-restoration-publication.ts:50-59`), which shows this failure mode is known.

Impact scenario: an SPA gets a 500 from publish, shows "publication failed", the operator retries, and a second signed release with `release_no + 1` is created for the same content — polluting the release ledger, generation counts, and `expectedSourceReleaseId` chains (`DEV_PUBLICATION_SOURCE_CHANGED` on the next legitimate publish). `jobs.retry?.()` returning `false` is also ignored.

Suggested fix: make the release row and the dispatch intent commit in one transaction (outbox/durable job row inserted in `createRelease`), then have `publish()` only trigger the worker; on enqueue failure return the already-created release with a `dispatch pending` status rather than an error, so retries are idempotent by `releaseId`.

### [medium] `valueOrigin === "runtime"` field-policy exclusion is driven by an unvalidated free-form property
Location: `server/packages/planes/studio/meta-entity-authoring/src/entity-authorization.ts:74-83` with `server/packages/contracts/meta-entity-authoring/src/model.ts:21`

What is wrong: `MetaEntityField.valueOrigin` is typed `string`, not `EntityFieldValueOrigin` (`server/packages/contracts/metadata/src/descriptors.ts:19` = `"stored" | "computed" | "aggregate"` — note `"runtime"` is not part of that union). `validateGraph` never enum-checks `valueOrigin`, `writeMode` or `status`. The authorization compile therefore excludes a field from mandatory field-policy coverage purely because the submitted JSON says `valueOrigin: "runtime"` and the field key appears in a compiled intake surface.

Evidence:
```ts
fields: graph.fields
      .filter((item) => item.status !== "deprecated" && !(item.valueOrigin === "runtime" && intakeInputs.has(item.fieldKey)))
      .map((item) => item.fieldKey),
```
The comment above it claims "Only validated presentation-only inputs are outside record field-policy coverage", but nothing in this file validates that the excluded field is presentation-only; that guarantee is delegated to `compileEntityIntakeSurfaces`. I verified the delegated check does exist — `packages/contracts/platform/entity-runtime/src/intake-surface-authoring.ts:83,121` rejects a runtime field that declares a `storagePath` (and `MEA/__tests__/runtime-restoration.test.ts:115-130` exercises exactly that, including the coverage failure when the intake binding is removed). So the boundary holds for `storagePath`-based fields, but the exclusion still keys off an unvalidated enum-like string, so any *other* persistence path (`computationSpec`, a default spec, or a future storage hint) would not be caught here.

Impact scenario: a field can be removed from the required field-policy coverage set by asserting an out-of-contract `valueOrigin` value; if the intake compiler's `storagePath` guard is ever relaxed or bypassed, the field becomes readable/writable without a field policy and without any validator complaint.

Suggested fix: enum-validate `valueOrigin` (and `writeMode`, `status`, `dataClassification`) in `requiredGraphValues` against the metadata contract unions, and make the exclusion require an explicit, validated presentation-only marker (e.g. the compiled intake surface field descriptor) rather than the raw string.

### [medium] `proposalHash` handoff is key-order sensitive and duplicated between producer and consumer
Location: `server/packages/planes/studio/meta-entity-authoring/src/learning-inbox.ts:82-100` with `server/packages/platform/ai/src/learning-candidates.ts:39-40`

What is wrong: the receiver recomputes the hash over `JSON.stringify(payload)` where `payload` is a freshly constructed object literal, and requires it to equal the hash the producer computed over *its* separately constructed object. There is no canonicalisation (no key sort, no stable encoder), so the two must agree on key order and on which optional keys are present.

Evidence:
```ts
// learning-inbox.ts (receiver)
const payload = { ...input, tenantId: proposal.tenantId, originPlane: ..., submittedBy: ..., entityCode: ..., sourceDescriptorHash: ..., sourceContractHash: ..., sourceReleaseId: ... };
    if (createHash("sha256").update(JSON.stringify(payload)).digest("hex") !== proposal.proposalHash || !(await this.options.sourceCurrent(proposal)))
      throw new AuthoringPolicyError("LEARNING_SOURCE_UNAVAILABLE", ...);
```
```ts
// learning-candidates.ts (producer)
const payload = {...input, tenantId: context.tenantId, originPlane: context.planeKey, submittedBy: ..., entityCode: ..., sourceDescriptorHash: ..., sourceContractHash: ..., sourceReleaseId: descriptor.releaseId};
      const proposalHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
```
The receiver additionally re-parses `input` from an explicit six-key object literal before spreading it, so any future change to `parseAtlasLearningProposal`'s output key order (or to the set of keys it returns) silently breaks every handoff. `baselineJsonHash` (`baseline-publication.ts:7-10`) already implements a key-sorted encoder in this same package and is not used here.

Impact scenario: a refactor of the handoff parser/contract turns all correction handoffs into `LEARNING_SOURCE_UNAVAILABLE` (fail-closed, but a hard outage with a misleading "source unavailable" message) and the failure is only visible at runtime.

Suggested fix: use one shared canonical encoder for both sides (e.g. `baselineJsonHash`), or have the producer send the payload and the receiver re-hash the received `proposal` object as stored, and add a round-trip test that constructs the handoff through the real producer path.

### [medium] Superseded local previews are never recorded as superseded
Location: `server/packages/planes/studio/meta-entity-authoring/src/graph-preview.ts:121-143`

What is wrong: the "claim moved on" early return exits the `try` block before the status is persisted, and `ports.record` is called only after the `finally`.

Evidence:
```ts
await ports.resolve(input, graphDependencies(input.graph));
        if (!(await ports.current(claim)))
          return { ...base, state: "superseded" };      // <-- bypasses ports.record below
        prepared = await ports.prepare(input, artifact, claim);
```
```ts
      } finally {
        if (prepared && !activated) await prepared.discard();
      }
      await ports.record(claim, result);
```

Impact scenario: the durable store keeps `state: "compiling"` for that coordinate indefinitely (`DurableGraphPreviewStore.record` is only called for the `compiling`, final and thrown paths). `createDurableGraphPreview.status()` then reports a permanent "compiling" preview to the editor, and `authoring-service.readGraph` returns it on every load (`authoring-service.ts:85`), so the UI can be stuck showing an in-progress compile that no longer exists.

Suggested fix: compute the result and fall through to `ports.record` (e.g. `if (!(await ports.current(claim))) result = { ...base, state: "superseded" }; else { … }`), or call `record` before every early return.

### [medium] Onboarding `loadCase`/`listObservations` are not tenant-scoped, and the saga skips the tenant check when `tenantId` is omitted
Location: `server/packages/planes/studio/onboarding/src/kysely-onboarding-saga-repository.ts:64-81,123-148` and `server/packages/planes/studio/onboarding/src/saga.ts:163-166`

What is wrong: two repository reads filter only by case id, and the only in-process guard is conditional on an optional argument.

Evidence:
```ts
async loadCase(caseId: string): Promise<OnboardingCase | undefined> {
    const db = this.reader();
    const caseRow = (await sql<Row>`SELECT * FROM onboarding.onboarding_case WHERE id=${caseId}::uuid LIMIT 1`.execute(db)).rows[0];
```
```ts
const targetRows = (await sql<Row>`SELECT * FROM onboarding.onboarding_case_target WHERE onboarding_case_id=${caseId}::uuid ORDER BY id`.execute(db)).rows;
```
```ts
const item = await options.repository.loadCase(caseId);
      if (!item || (tenantId !== undefined && item.tenantId !== tenantId))
        throw new Error(`Onboarding case not found: ${caseId}`);
```
`recordReceipt`'s UPDATE also relies on `current_setting('app.current_principal_id')` (`:184`) without the method establishing that setting itself.

Impact scenario: any caller of the exported `KyselyOnboardingSagaRepository` (the class is re-exported from `onboarding/src/index.ts:4`) that forgets the tenant filter reads another tenant's case, its targets and its resource desired states. The single production caller does pass `context.tenantId` (`onboarding/routes.ts:91`), and the tables are `FORCE ROW LEVEL SECURITY`, so this is defence-in-depth rather than an open hole — but the type signature makes the safe call optional.

Suggested fix: take `tenantId` as a required parameter on `loadCase` and `listObservations`, add `AND tenant_id=${tenantId}::uuid`, and make `createOnboardingSaga.reconcile` require the tenant (`reconcile(caseId, tenantId)`), so omission is a compile error rather than a silent cross-tenant read.

### [medium] A test that claims to verify the "already-enabled baseline" guard exercises a different branch
Location: `server/packages/planes/studio/meta-entity-authoring/src/__tests__/baseline-publication.test.ts:20`

What is wrong: the recomputed content hash uses `sha256` (canonical JSON with sorted branches) instead of the package's own `baselineJsonHash` (order-preserving encoder) that `compileInitialBaselineDescriptor` actually compares against.

Evidence:
```ts
const enabled=structuredClone(baseline);enabled.source.descriptor.compiled_json.ai=ai;enabled.contentHash=sha256(enabled.source);
  expect(()=>compileInitialBaselineDescriptor(enabled,ai)).toThrow();
```
`compileInitialBaselineDescriptor` denies on `baselineJsonHash(baseline.source)!==baseline.contentHash` (`baseline-publication.ts:27`) *before* reaching the enablement check at line 30. Because the two hash functions differ by construction (compare the sibling assertion at `baseline-publication.test.ts:60`), this test throws `BASELINE_CONTENT_MISMATCH`, not `BASELINE_INITIAL_ENABLEMENT_ONLY`.

Impact scenario: the control that refuses to re-import an already-AI-enabled baseline — i.e. the guard that stops the baseline importer from silently replacing an enabled runtime descriptor — has no test at all, while the suite reports it as covered.

Suggested fix: `enabled.contentHash = baselineJsonHash(enabled.source)` (already imported) and assert the specific error code/message.

### [medium] The authorization determinism test's "reordered" object is not reordered
Location: `server/packages/planes/studio/meta-entity-authoring/src/__tests__/entity-authorization.test.ts:80-91`

What is wrong: `{ ...profile, ...Object.fromEntries(Object.entries(profile).reverse()) }` re-assigns existing keys, and object spread keeps the *first* insertion position for an existing key, so `reordered` has exactly `profile`'s key order.

Evidence:
```ts
const reordered = {
    ...profile,
    ...Object.fromEntries(Object.entries(profile).reverse()),
  };
  expect(
    compileGraph({ ...source, surfaces: [{ ...source.surfaces![0]!, layoutConfig: { authorization: reordered } }] }).descriptorHash,
  ).toBe(first.descriptorHash);
```
(`Object.keys(reordered)` equals `Object.keys(profile)`.) The test therefore asserts that a hash of the same input equals itself. Contrast `deterministic.test.ts:64-68,168-215`, which does construct genuinely reordered arrays.

Impact scenario: false assurance that the authorization profile's key order does not affect `descriptorHash`; a real key-order sensitivity in `parseEntityAuthorizationProfile` (in `server/packages/contracts/metadata`) would go undetected.

Suggested fix: build the reordered object with `Object.fromEntries(Object.entries(profile).reverse())` alone (no leading spread), then assert both `Object.keys` differ and the hashes match.

### [medium] The learning-inbox plane test cannot exercise the plane check
Location: `server/packages/planes/studio/meta-entity-authoring/src/__tests__/learning-inbox.test.ts:38`

What is wrong: the authorizer stub always denies, and the loop includes `"studio"`, so the `context.planeKey !== "studio"` short-circuit in `AtlasLearningInbox.allowed` (`learning-inbox.ts:434-438`) is never the deciding factor.

Evidence:
```ts
const database={transaction:vi.fn()},authorizer={authorize:vi.fn(async()=>({allowed:false}))};
  ...
  for(const planeKey of ["neon","mesh","studio"])await expect(inbox.list({planeKey} as never)).rejects.toMatchObject({code:"FORBIDDEN"});
```
The test name claims "denies inbox access outside Studio or without reviewer authorization" but both claims collapse into the same "authorizer said no" path; removing the plane check entirely would not fail this test. Only `expect(database.transaction).not.toHaveBeenCalled()` is meaningful.

Impact scenario: the plane-exclusion control for the Atlas learning inbox — the boundary that keeps a Neon/Mesh caller out of Studio review data — is untested.

Suggested fix: split the assertion: with `authorize: async () => ({allowed:true})`, assert `neon`/`mesh` still reject with `FORBIDDEN` and the authorizer was **not** called; with `planeKey:"studio"` and `allowed:false`, assert the same rejection.

### [medium] `list-experience` navigation override is untested
Location: `server/packages/planes/studio/meta-entity-authoring/src/__tests__/list-experience.test.ts:103-112`

What is wrong: the only navigation test supplies `{kind, workflowKey, attentionCountKey}` and asserts `workflowKey`, `compiled.actions === []` and the workflow-membership errors. It never asserts that the computed `permissions`, `rules`, `scopes` and `requiresPreflight` survive, which is exactly what Finding 1 breaks.

Evidence:
```ts
const list = { ...surface, layoutConfig: {experience: { ...surface.layoutConfig.experience, routes:[...], navigation: {new_request:{kind:"review",workflowKey:"review_flow",attentionCountKey:"my_reviews"}}}}};
  ...
  expect(compiled.navigation?.[0]?.workflowKey).toBe("review_flow");
```
Impact scenario: the security-relevant override path has no regression test, so the fix for Finding 1 is unverifiable from the suite.

Suggested fix: add a case with `navigation: { new_request: { kind: "review", workflowKey: "review_flow", requiresPreflight: false, permissions: [] } }` and assert either a thrown `TypeError` (if overrides are rejected) or that the published action keeps the graph-derived `permissions`/`requiresPreflight`.

### [low] `getSignedRelease` primary query omits the tenant predicate its own fallback applies
Location: `server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.ts:538-561`

Evidence:
```ts
await sql<ArtifactRow>`SELECT r.contract_hash,... FROM metadata.entity_release r JOIN snapshot.entity_release_artifact a ON a.source_release_id=r.id WHERE r.id=${id}::uuid ORDER BY a.plane_key LIMIT 1`
```
```ts
`SELECT r.contract_signature,... WHERE r.id=${id}::uuid AND r.tenant_id=shared.current_tenant_id()`
```
Impact: the primary branch depends solely on RLS (`metadata.entity_release` and `snapshot.entity_release_artifact` are `FORCE ROW LEVEL SECURITY`) and on the authorizer honouring `resource.releaseId`. It is the read half of Finding 3; on its own it is a defence-in-depth inconsistency.

Suggested fix: add `AND r.tenant_id=shared.current_tenant_id()` to the primary query, and `AND a.tenant_id=r.tenant_id` to the join (the fallback already joins with `s.tenant_id=r.tenant_id`).

### [low] Dead owner-consistency loop: `relationFields` owners are never validated
Location: `server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts:1136-1142`

Evidence:
```ts
const targetRelation = new Map(
    (graph.relationTargets ?? []).flatMap((row) => row.id ? [[row.id, row.entityRelationId] as const] : []),
  );
  for (const [index, row] of (graph.relationFields ?? []).entries())
    if (!targetRelation.has(row.entityRelationTargetId)) continue;
```
The loop body only `continue`s; the map is otherwise unused, so a `relationField` whose `entityRelationTargetId` belongs to a *different* `entityRelation` is accepted (`references` only checks that the target id exists at `deterministic.ts:236-242`).

Suggested fix: finish the check — compare `targetRelation.get(row.entityRelationTargetId)` with the relation owning `row.sourceFieldId`, or delete the dead loop and add the check where the relation/field tuple is validated.

### [low] `sha256` is not injective across value types
Location: `server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts:41-45`

Evidence:
```ts
return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
```
`sha256('{"a":1}')` and `sha256({a:1})` produce the same digest. No current call site mixes types for the same comparison, but the API invites it (e.g. `system-reference-authoring.ts:69` compares `sha256(original)`/`sha256(graph)`; `learning-inbox.ts`/`learning-publication.ts` compare graph hashes with stored strings).

Suggested fix: always hash a type-tagged encoding (`typeof value + "\0" + canonicalJson(value)`) or drop the string fast path.

### [low] Canonical sorting of order-independent arrays treats `undefined` elements as equal
Location: `server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts:745-750, 1323-1325`

Evidence:
```ts
if (!ORDER_INDEPENDENT_ARRAYS.has(path)) return values;
    return [...values].sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b)));
```
`JSON.stringify(undefined)` returns `undefined` (not a string), so `compareText(undefined, x)` returns `0` for every pair involving an array hole/`undefined` element; those elements keep their input order. `canonicalAt` also does not filter `undefined` array elements the way it filters object properties (`:755`).

Impact: arrays containing `undefined` are not order-normalised, so `contractHash` can differ for semantically identical input. Low, because `meta-entity-contract` branches are validated to be arrays of objects, but the invariant is silently weaker than the code implies.

Suggested fix: map `undefined`/holes to a sentinel before `JSON.stringify` (or filter them out and record a validation issue).

### [low] `development-publication` audit evidence records a hash that is not the published hash
Location: `server/packages/planes/studio/meta-entity-authoring/src/development-publication.ts:136-143, 160-161, 185`

Evidence:
```ts
const before = compileGraph(source.graph),
      after = compileGraph(proposed);
    const plan = { request, sourceReleaseId: source.releaseId, previousHash: before.contractHash, proposedHash: after.contractHash };
```
```ts
const forked = normalizeGraphStorageOrder(cloneGraphIds(proposed));
          const expectedHash = compileGraph(forked).contractHash;
```
`cloneGraphIds` re-ids every row, so `expectedHash !== after.contractHash` for any graph with ids; `plan.proposedHash` (recorded in the "started"/"submitted"/"dispatched" evidence at lines 152, 206) is therefore not the hash that was signed and published. The receipt does also carry `savedHash`, so the data is recoverable, but the field name is misleading in the durable audit trail.

Suggested fix: rename `proposedHash` to `preForkHash` (or set it to `expectedHash` after the fork).

### [low] Duplicate/dangling-import guard tests do not cover the repository or generic publication helpers
Location: `server/packages/planes/studio/meta-entity-authoring/src/__tests__/product.test.ts:135-153`, `__tests__/target-compiler.test.ts:48-58`, `__tests__/publication-workflow.test.ts:137-147`, `__tests__/prepare-successor.test.ts:20-30`, `__tests__/successor-source.test.ts:52-61`

What is wrong: five tests assert "no entity-specific literals" by scanning a fixed list of five files. `kysely-authoring-repository.ts` (`'business_partner'` twice) and `document-collection-publication.ts` (`"business_partner_request"`), `system-reference-authoring.ts` and the `*-publication.ts` helpers are not scanned.

Impact: the repo's stated architectural rule is enforced only for the files that already comply, which is how Finding 8 slipped in.

Suggested fix: make the guard a directory-wide invariant (scan every non-test `.ts` under `src/` for `country|currency|business_partner` outside an explicit allowlist), which would immediately flag the three literals.

### [low] Client-supplied onboarding `caseId` becomes the primary key, turning a collision into a 500
Location: `server/packages/planes/studio/onboarding/src/routes.ts:111-115` with `server/packages/planes/studio/onboarding/src/kysely-onboarding-saga-repository.ts:38-41`

Evidence:
```ts
const caseId = body["caseId"] === undefined ? draftId(context.tenantId, caseCode, idempotencyKey) : uuid(body["caseId"], "caseId");
```
```sql
INSERT INTO onboarding.onboarding_case(id,...) VALUES(${input.caseId}::uuid,...) ON CONFLICT(tenant_id,case_code) DO NOTHING RETURNING *
```
`onboarding.onboarding_case` has `CONSTRAINT onboarding_case_pkey PRIMARY KEY (id)` globally (`server/db/ddl/planes/studio/onboarding/03_tables.sql:46`) with a separate `UNIQUE (tenant_id, code)`; the `ON CONFLICT` target only covers the latter. Supplying another tenant's case id therefore produces a raw unique-violation.

Impact: a tenant can probe for the existence of other tenants' case ids (500 vs 201) and create noisy 500s; error semantics are wrong (should be 409/404). Severity is low because RLS/`WITH CHECK` still prevents any cross-tenant write.

Suggested fix: ignore/reject a client-supplied `caseId` unless it matches an existing case visible under the caller's tenant and RLS (or reserve another conflict target), and map the unique violation to a 409.

### [low] Unguarded property access on capability declarations yields misleading 4xx/500 instead of a validation error
Location: `server/packages/planes/studio/meta-entity-authoring/src/notification-authoring-routes.ts:98-104`, `server/packages/planes/studio/meta-entity-authoring/src/notification-publication.ts:16-19`, `server/packages/planes/studio/meta-entity-authoring/src/graph-dependencies.ts:37-42`

Evidence:
```ts
// notification-authoring-routes.ts
if (!member?.declaration.enabled || !member.binding) {
      s.status(404).json({ code: "ENTITY_CAPABILITY_UNAVAILABLE" });
```
```ts
// notification-publication.ts
if (graph.capabilities?.some(member => member.capabilityKey === "activity" && member.declaration.enabled)) return null;
```
```ts
// graph-dependencies.ts
for (const capability of graph.capabilities ?? []) {
    if (!capability.declaration.enabled) continue;
    const binding = capabilityArtifactMembers(graph.entity.entityCode, [capability]).operationBindings[...]!;
```
A capability member without `declaration` (admissible while a draft is being edited, and only rejected later by `validateGraph` → `capabilityArtifactMembers`) makes `notification-authoring-routes` return 404 "capability unavailable", `notification-publication` throw, and `graph-dependencies` throw during preview. `binding!` (`graph-dependencies.ts:40`) is a non-null assertion that will also dereference `undefined` if `capabilityBindingKey` is missing from `operationBindings`.

Suggested fix: validate the capability shape once (`parseCapabilityDeclaration`/`capabilityArtifactMembers`) before these accesses, and return a typed validation error rather than 404/500/per-route inconsistencies.

### [low] `learning-inbox.list` and `assertPublishable` await `sourceCurrent` serially inside a transaction
Location: `server/packages/planes/studio/meta-entity-authoring/src/learning-inbox.ts:144-150, 332-363`

Evidence:
```ts
const visible: InboxRow[] = [];
        for (const row of rows)
          if (row.release_id || (await this.options.sourceCurrent(row.proposal)))
            visible.push(row);
```
Up to 100 sequential cross-plane calls inside one open transaction (`list`, LIMIT 100 at line 140); `assertPublishable` does the same per vocabulary term inside the publication transaction.

Impact: transaction and connection-holder time grows linearly with the number of inbox rows / vocabulary terms, and any slow/failed plane read blocks the review UI and publication. Not a correctness defect, but an availability risk on the publication path.

Suggested fix: batch `sourceCurrent` (single call with a list, or resolve concurrently with a bounded pool) and perform the filter outside the write transaction.

### [low] Two different advisory-lock namespaces used in a fixed order can deadlock across publication paths
Location: `server/packages/planes/studio/meta-entity-authoring/src/baseline-publication.ts:55,72`, `server/packages/planes/studio/meta-entity-authoring/src/publication/prepare-release.ts:67`, `server/packages/planes/studio/meta-entity-authoring/src/publication/prepare-successor.ts:36`

Evidence:
```ts
await sql`SELECT pg_advisory_xact_lock(hashtextextended(${marker.id},0))`.execute(database);
  ...
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${target.publicationKey},0))`.execute(database);
```
`prepare-release.ts` locks `metadata.entity.<code>` and `prepare-successor.ts` locks `system-entity-release:<entityId>`; `baseline-publication.ts` takes `marker.id` then `publicationKey`, a different pairing and order.

Impact: two overlapping publication transactions that take these locks in opposite orders can deadlock (PostgreSQL will abort one); low likelihood because the paths are generally serialized per entity by higher-level gates.

Suggested fix: use one lock-key scheme (`system-entity-release:<entityId>`) and acquire keys in a deterministic sorted order.

### [low] `routes.ts` UUID validation accepts 27 hyphens and is inconsistent with sibling route modules
Location: `server/packages/planes/studio/meta-entity-authoring/src/routes.ts:306-311` vs `learning-routes.ts:20`, `publication/publication-workflow.ts:49`, `publication/prepare-successor.ts:28`, `collection-authoring-routes.ts:72-75`

Evidence:
```ts
function uuid(v: unknown) {
  const x = String(v ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(x)) throw new TypeError("Invalid UUID");
  return x;
}
```
Impact: values such as `00000000---------------------------` pass route validation and reach the database, which rejects the cast (500/409 rather than a 400 "Invalid UUID"), and validation strength differs per endpoint in the same plane.

Suggested fix: use a single strict UUID helper (the `learning-routes.ts` regex is the best of the four) shared by all route modules.

### [low] Minor robustness gaps in the onboarding repository
Location: `server/packages/planes/studio/onboarding/src/kysely-onboarding-saga-repository.ts:399-410`

Evidence:
```ts
function object(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  return (typeof value === "string" ? JSON.parse(value) : value) as Record<string, unknown>;
}
function iso(value: unknown) {
  return new Date(String(value)).toISOString();
}
```
`JSON.parse` has no try/catch (a malformed `change_context`/`metadata` text value throws `SyntaxError` → 500), and `new Date("null").toISOString()` throws `RangeError` for a null timestamp rather than returning `undefined`. `loadCase` also casts `retention` with `as "deletable"` (`:115-118`), hiding any shape mismatch in `metadata.retention`.

Suggested fix: wrap the parse and return a typed `ONBOARDING_ROW_INVALID` error; make `iso` tolerate null/Invalid Date; validate `retention` against the union instead of casting.

### [low] `entity-authorization.ts` uses an unchecked double cast into the intake compiler
Location: `server/packages/planes/studio/meta-entity-authoring/src/entity-authorization.ts:76`

Evidence:
```ts
const intakeInputs = new Set(compileEntityIntakeSurfaces(graph as unknown as Record<string, unknown>).flatMap(s => s.sections.flatMap(section => section.fields.map(f => f.key))));
```
The `as unknown as` cast bypasses the `MetaEntityGraph` → `Record<string, unknown>` type boundary, so a future shape change to `compileEntityIntakeSurfaces` (or to the graph contract) will fail at runtime, inside the authorization compile, rather than at the call site. `deterministic.ts:434` uses the same cast.

Suggested fix: give `compileEntityIntakeSurfaces` a typed input (or an explicit adapter function), and derive the intake input set once per compile so it cannot drift between the validator and the authorization compiler.

### [low] Low-value assertion in `prepare-release.test.ts`
Location: `server/packages/planes/studio/meta-entity-authoring/src/__tests__/prepare-release.test.ts:42`

Evidence:
```ts
expect(f.query.mock.calls.some(([text]) => text.includes("runtime_meta"))).toBe(false);
```
Nothing in the codebase could emit `runtime_meta`, so the assertion cannot fail. It appears intended to prove "no runtime writes", which is already covered by the surrounding `expect(text).not.toContain("INSERT INTO")` and the rollback assertions.

Suggested fix: delete it or replace it with a positive assertion (e.g. the exact set of SQL statements is limited to the four expected calls).

## Checked and clean

Suspicions that were explicitly investigated and found **not** to be defects:

- **List/navigation `href` injection.** `list-experience.ts:37-50` casts `config.routes` without validating `href`, but the published parser does validate it: `packages/contracts/platform/entity-list/src/experience.ts:180-185` requires `/^\/[a-zA-Z0-9/_-]*$/` and rejects `//`. No `javascript:`/protocol-relative destination is reachable. Route order is also normalised (`experience.ts:210`), and `actions`/`navigation` are sorted by `(position, key)` (`:316-319`, `:360`), so action ordering is deterministic.
- **`...action, ...config` also overriding `label`/`operationKey`/`targetSurfaceKey`.** The parser re-validates `label` (`parseEntityLocalizedText`), `operationKey`/`targetSurfaceKey` (`key()`), `placement` (`primary|secondary`) and requires `targetSurfaceKey` to be a registered route (`experience.ts:296-315`); only `permissions`/`rules`/`scopes`/`requiresPreflight` are weakly constrained, which is Finding 1.
- **`notificationPublicationDescriptor` entity selection order** (`notification-publication.ts:49`): `parseNotificationPublicationDescriptor` rejects differing `targetEntityCode`s across capabilities (`server/packages/contracts/publication/src/notification-policy.ts:468`), so the `Object.values(...)[0]` choice is only ambiguous when all values agree.
- **Onboarding guest-access cross-tenant revocation.** `revokeExpiredGuestAccess`'s `UPDATE … FROM candidates WHERE guest.id=candidates.id` omits `tenant_id`, but `onboarding_case_guest_access` has `PRIMARY KEY (id)` (globally unique, `03_tables.sql:33`) and `FORCE ROW LEVEL SECURITY` with `tenant_id` policies (`10_rls.sql:24-25`), so no cross-tenant write is possible. Other onboarding writes (`createDraft`, `transition`, `resolveWorkItem`) all carry explicit `tenant_id` predicates and the RLS `WITH CHECK` uses the strict `shared.current_tenant_id()`.
- **Deep-clone vs reference-sharing in graph transforms.** `amend-successor-capabilities.ts:24-27`, `amend-successor-localization.ts:25`, `table-product.ts:33`, `target-compiler.ts:24`, `entity-target-compiler.ts:119`, `development-publication.ts:130`, `system-reference-authoring.ts:27`, `publication-workflow.ts:69,86,98`, `capability-profile-files.ts:34`, `learning-inbox.ts:560-579` and `adopt-capability-profiles.ts:25` all clone before mutating; `graph-identity.ts:11-20` builds a fresh tree. `target-compiler.test.ts:18,29`, `amend-successor-capabilities.test.ts:20`, `amend-successor-localization.test.ts:23`, `development-publication.test.ts:191` and `intake-presentation.test.ts:24` assert non-mutation.
- **SQL injection.** Every repository query is Kysely-parameterised; dynamic table/column names come from the module-private `BRANCH_COLUMNS` whitelist (`kysely-authoring-repository.ts:852-1185`) and `sql.table(...)`/`sql.raw(...)` are only used with those literals. `insertRows` also whitelists authored properties against `BRANCH_COLUMNS` and overwrites `tenant_id`/`entity_id`/`change_set_id`/`created_by` from the change-set coordinates, so those cannot be authored.
- **`AuthoringConflictError`/`AuthoringPolicyError` subclassing.** `ports.ts:13-23` — with `target: ES2022` (`server/tsconfig.json:3`) `instanceof` works.
- **`system-reference-authoring` transactional integrity.** `assertAuthorized` is called before any DB work, the advisory lock is taken inside the transaction, the imported graph is re-verified against the stored draft save by hash (`system-reference-authoring.ts:69`), and re-import is idempotent by `branch_code = namespace + productHash`; `__tests__/system-reference-authoring.test.ts:16-37` proves authority is checked before `transaction()` and before compile.
- **`replaceGraph` TOCTOU.** Validation runs both outside and inside the transaction (`kysely-authoring-repository.ts:340,353`) and the revision advance is checked twice (`:627-641`), with `captureDraftSave` verifying the round-tripped hash (`:763-771`). `readGraph` likewise rejects a revision that moves during load (`authoring-service.ts:77-87`, tested at `graph-editor-routes.test.ts:66-77`).
- **Reviewer separation.** `reviewTransition` rejects author/submitter (`authoring-service.ts:336-346`), `breakGlass` is fail-closed from HTTP (it *always* throws when supplied, `routes.ts:340-348`), and `route`-level `scoped()`/`allowed()` enforce `planeKey === "studio"` plus a full `authorizer` call (`routes.ts:254-284`). `__tests__/independent-review.test.ts` and `__tests__/learning-route-scope.test.ts` cover both.
- **Approval/qualification gates in publication.** `publication-workflow.ts` verifies policy pins, plan identity, workload identity, qualification of every target, durable review attribution and the reviewed hash before signing; `__tests__/publication-workflow.test.ts` covers each refusal, and `prepare-release.ts:34-55` re-derives the source, signature, plane set and both hashes.
- **`durable-graph-preview.ts`.** Signature is verified *before* `JSON.parse` of the stored body (`:188-198`), the seal is self-verified (`:129-137`), commit checks claim currency inside `BEGIN IMMEDIATE`, and `read()` re-checks the coordinate. `JSON.parse` without try/catch is only reachable for signed bodies or JSON this module itself wrote.
- **`DurableGraphPreviewStore.record`/`status`.** `record` filters on `id`, and `status`'s unguarded `JSON.parse` only ever sees `JSON.stringify` output (a `status` argument of `undefined` stores SQL NULL and is handled by `row?.status ? … : undefined`).
- **`authoring/product.ts` / `table-product.ts` input validation.** Both reject unknown keys (`product.ts:15`, `table-product.ts:22-23`), enforce the canonical entity-code grammar, require the immutable `id` field, enforce read-only/tenant/version fields and re-validate caller-owned objects on every `compile*` call (`product.ts:84-90`, `table-product.ts:155-163`, `__tests__/product.test.ts:128-134`).
- **`entity-registration.ts`.** Exact four-key shape, module/class/ownership enums, and the database constraint (`03_tables.sql:25-27`) restricts `overlay`/`tenant` to rows with a tenant id, so tenant `overlay` registration is not a privilege escalation (no code path treats `overlay` as global).
- **Test isolation.** Module-level fixtures are shared in `entity-authorization.test.ts` (`profile`), `development-publication.test.ts` (`graph`), `list-experience.test.ts` (`surface`, `graph`), `graph-builder.test.ts`/`product.test.ts` (re-read per call), `canonical-v2-successor.test.ts`/`runtime-restoration.test.ts` (re-parsed per `read()`/`fixture()`); in every case the mutation sites either clone first or mutate a freshly parsed object, and several tests assert non-mutation. No cross-test contamination was found.
- **Dangling-import pass.** Only the three files in Finding 4 fail resolution; every other relative specifier in the 113 files resolves (extensionless imports such as `../deterministic` are valid under `moduleResolution: "bundler"`, `server/tsconfig.json:5`).
- **`contracts/collaboration` and `contracts/meta-entity-authoring` ports** are pure type contracts with no executable logic; no defects found. `MetaEntityAuthoringRepository.replaceGraph`/`createRelease`/`getSignedRelease` signatures match all implementations (including the test doubles in `graph-preview-hook.test.ts`, `development-publication.test.ts`, `publication-workflow.test.ts`).
- **`onboarding/validation.ts`** — `uuid()` lowercases and is strict, `choice()` rejects non-strings, `version()` bounds to int32. No defects.
- **Onboarding cycle detection** (`case-lifecycle.ts:487-501`) is correct: `visiting`/`visited` colouring over already-validated dependency ids, exercised by `case-lifecycle.test.ts:70-88`.
- **`baselineJsonHash`** (`baseline-publication.ts:7-10`) recursively sorts object keys while preserving array order, and is deterministic; its deliberate divergence from `sha256`/`canonicalJson` is documented and asserted at `baseline-publication.test.ts:60`.

## Highest-risk 5

1. **Authored navigation config overrides computed `permissions`/`rules`/`scopes`/`requiresPreflight` in the published list experience** — `MEA/list-experience.ts:201-206`. A single authored `requiresPreflight: false` (or a substituted `permissions` array) reaches the signed descriptor; only `packages/contracts/platform/entity-list/src/experience.ts:222-225,294-295` stands between authoring and runtime enforcement, and it does not compare against the graph.
2. **Every authoring-plane error becomes HTTP 500, and cross-tenant denials are indistinguishable from faults** — `MEA/routes.ts:285-299` with `server/packages/runtime/http/src/http-runtime.ts:219-244`. `TypeError` from `str/uuid/rev/breakGlass` → 500 instead of 400; `AuthoringPolicyError("FORBIDDEN")` from `assertTenant` → 500 instead of 403; `CHANGE_SET_NOT_FOUND` → 500 instead of 404. Every test file installs its own mapper, so the suite cannot catch it.
3. **`redispatch` republishes a body-supplied release id with no tenant or revision re-check, and `getSignedRelease`'s primary read has no tenant predicate** — `MEA/routes.ts:178-191`, `MEA/authoring-service.ts:264-278`, `MEA/kysely-authoring-repository.ts:538-561`. Cross-tenant artifact dispatch is prevented only by the injected authorizer honouring `resource.releaseId` and by RLS; the parallel `rollback` path re-reads the prior release with an explicit entity+tenant predicate, showing the intended guard.
4. **One reviewed `contractHash` can publish different content** — `MEA/deterministic.ts:633-637,667-673` with `MEA/authoring-service.ts:243-244`. `surfaces`/`searchProfiles` are order-insensitively hashed but order-sensitively used to pick the default list surface and default search profile; `isDefault` uniqueness is never validated, so a permutation passes the reviewed-source pin while changing `descriptorHash` and the published list/search defaults.
5. **`validateGraph` throws on malformed rows, and locale-dependent ordering makes hashes/fingerprints environment-specific** — `MEA/deterministic.ts:789,929` (plus siblings) and `MEA/case-lifecycle.ts:508`, `MEA/graph-dependencies.ts:184`, `MEA/runtime-restoration.ts:67-69`, `MEA/authorization-successor.ts:38`, `server/packages/contracts/metadata/src/entity-authorization-runtime.ts:157`. A `[null]` row yields a 500 instead of a validation report (compounding risk 2), and `localeCompare` in canonical positions means the same input can produce different `descriptorHash`/onboarding fingerprints across environments — with `MEA/__tests__/entity-authorization.test.ts:125` locking the locale-dependent order in as expected.
