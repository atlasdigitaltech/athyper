# Audit — Studio meta-entity authoring plane

Area: `server/packages/planes/studio/meta-entity-authoring/src/**` and
`server/packages/contracts/meta-entity-authoring/src/**`.

Read-only audit. No file outside this report was written. All line numbers were
re-read from the current working tree with `nl -ba` before being quoted.

Measured inventory (excluding `node_modules`, `dist`):

```
$ find server/packages/planes/studio/meta-entity-authoring -type d -name node_modules -prune -o -type f -print | wc -l
101
$ find ... /src -type f -name '*.test.ts' | wc -l
49
$ wc -l over src/**  | tail -1
11896 total
$ wc -l server/packages/contracts/meta-entity-authoring/src/*
      3 index.ts
    133 model.ts
    135 ports.ts
    271 total
```

The package is a Studio-only authoring/graph-editor backend. It produces the
compiled descriptor that is signed, stored as `snapshot.entity_release_artifact`
and activated, i.e. it is the producer of the descriptor that
`/app/entity/country/` consumes. Country's own definition
(`metadata/products/shared/entities/country/definition.json`, schema
`athyper.shared-reference-product/1`) is parsed by `authoring/product.ts` and
compiled by `authoring/graph-builder.ts` + `deterministic.ts`, so defects in this
package are defects in the Country descriptor's supply chain even when Country
itself is metadata-only.

---

## Findings

### F1 — HIGH — every route error except two shapes is returned as HTTP 500; client input errors and policy denials are indistinguishable from server faults

`server/packages/planes/studio/meta-entity-authoring/src/routes.ts:285-299`

```ts
function handler(fn: (q: any, s: any) => Promise<void>): RequestHandler {
  return (q, s, n) => {
    void fn(q, s).catch((error) => {
      if (error instanceof AuthoringPolicyError && error.code === "RESTORATION_PUBLICATION_ALREADY_EXISTS") {
        s.status(409).json({ error: error.code, detail: error.message });
        return;
      }
      if (error instanceof AuthoringConflictError) {
        s.status(409).json({ error: error.code, detail: error.message });
        return;
      }
      n(error);
    });
  };
}
```

Only `AuthoringConflictError` and the single `AuthoringPolicyError` code
`RESTORATION_PUBLICATION_ALREADY_EXISTS` are mapped. Everything else is forwarded
to `next(error)`.

The route argument validators in the same file all throw `TypeError`
(`routes.ts:300-348`): `str` (line 303), `uuid` (309), `rev` (315), `contract`
(324), `onePlane` (330), `planeList` (337), `breakGlass` (344). These are thrown
from inside the wrapped handler closures, e.g. `PUT /change-sets/:id/graph`
(`routes.ts:133-151`) and the `action()` helper (`routes.ts:229-253`), so they hit
`handler`'s catch and are forwarded.

I checked the production error mapping and it does **not** rescue them:
`server/packages/runtime/http/src/http-runtime.ts:219-244` maps JSON parse
errors, `entity.too.large`, unsupported encodings and `HttpError`; anything else
becomes

```ts
    options.onUnexpectedError?.(error, request);
    sendProblem(response, request, new HttpError(500, "INTERNAL_ERROR",
      options.exposeErrorDetails && error instanceof Error ? error.message : "An unexpected error occurred"));
```

`exposeErrorDetails` is not set by the host for the API runtime
(`server/apps/platform-host/src/composition/runtimes/http.ts:20-75`), and the
host registers authoring routes through `configure(application)`
(`.../runtimes/http.ts:71-74`), i.e. **before** the 404/error middleware at
`http-runtime.ts:216-244`. So every one of these becomes `500 INTERNAL_ERROR`.

Concrete consequences:
* `POST /api/meta-entity-authoring/change-sets/<id>/publish` without an
  `If-Match` header → 500 instead of 400 (`rev`, `routes.ts:312-317`).
* A malformed `entityId` on `POST /change-sets` → 500 (via the `::uuid` cast in
  `kysely-authoring-repository.ts:219`) instead of 400.
* Every `AuthoringPolicyError` in `authoring-service.ts` except one →
  500: `VALIDATION_REQUIRED` (156), `VALIDATION_FAILED` (178),
  `CONTRACT_TESTS_FAILED` (183), `APPROVAL_REQUIRED` (220),
  `LEARNING_REVIEW_UNAVAILABLE` (231), `PUBLICATION_REVIEWED_SOURCE_CHANGED`
  (244), `SIGNED_RELEASE_REQUIRED` (272, 288), `ROLLBACK_RELEASE_NOT_FOUND`
  (307), `REVIEWER_SEPARATION_REQUIRED` (342), `CHANGE_SET_NOT_FOUND` (356), plus
  the publication-preparer codes `BASELINE_*`
  (`baseline-publication.ts:24`), `LEARNING_*`
  (`learning-publication.ts:23,25`), `COLLECTION_*`
  (`collection-publication.ts:26,48`), `NOTIFICATION_*`
  (`notification-publication.ts:70,87`).
* Most importantly `assertTenant` throws
  `AuthoringPolicyError("FORBIDDEN", ...)` — see F2.

Sibling registrars in the *same package* get this right, which shows the
intended contract: `collection-authoring-routes.ts:30-48` maps
`TypeError → 422` and `AuthoringPolicyError → 403/409`;
`notification-authoring-routes.ts:44-64` maps `TypeError → 422`,
`AuthoringConflictError → 409`, `AuthoringPolicyError → 403/409`;
`learning-routes.ts:7-12` maps `TypeError → 400`, `FORBIDDEN → 403`, other codes
→ 409.

Why the existing tests do not catch it: they install their own error middleware
inside the test app, e.g.
`__tests__/graph-editor-routes.test.ts:34-36`

```ts
  app.use((error: any, _q: any, s: any, _n: any) =>
    s.status(error.code === "FORBIDDEN" ? 403 : 409).json({ code: error.code }),
  );
```

and `__tests__/learning-route-scope.test.ts:12`

```ts
 app.use((error:any,_q:any,s:any,_n:any)=>s.status(error.code==="FORBIDDEN"?403:error instanceof TypeError?400:409).json({code:error.code??"INVALID_ARGUMENT"}));
```

The assertions in those suites (`learning-route-scope.test.ts:17` expects 400 for
a break-glass body) therefore pass only because of test-local middleware that
does not exist in production.

Fix: in `handler`, map `TypeError → 400 INVALID_ARGUMENT`,
`AuthoringPolicyError` with `code === "FORBIDDEN" → 403`, and the remaining
`AuthoringPolicyError` codes to a deliberate status (409 for policy/state
conflicts, 422 for invalid content) instead of `n(error)`. Do the mapping
centrally so all routes in this package share it, and add one host-level
regression test that does **not** install its own error middleware.

Confidence: verified. Severity: high (wrong behaviour at every authoring route;
policy denials and cross-tenant denials are reported as server faults).

---

### F2 — HIGH — cross-tenant denial on `assertTenant` returns 500, not 403

`server/packages/planes/studio/meta-entity-authoring/src/routes.ts:350-362`

```ts
async function scoped(
  o: MetaEntityAuthoringRouteOptions,
  c: VerifiedRequestContext,
  id: string,
) {
  const platform = (
    await o.authorizer.authorize({
      context: c,
      permissionCode: "studio.platform.catalog.manage",
    })
  ).allowed;
  await o.service.assertTenant(id, c.tenantId, platform);
}
```

`server/packages/planes/studio/meta-entity-authoring/src/authoring-service.ts:36-50`

```ts
  async assertTenant(
    changeSetId: string,
    tenantId: string,
    allowPlatform = false,
  ) {
    const current = await this.required(changeSetId);
    if (
      current.tenantId !== tenantId &&
      !(await allowPlatform && current.tenantId === null)
    )
      throw new AuthoringPolicyError(
        "FORBIDDEN",
        "The tenant change set is unavailable",
      );
  }
```

`scoped` is the tenant boundary for `PUT /change-sets/:id/graph` (`routes.ts:139`),
`GET /change-sets/:id/history` (44), `GET .../history/:revision` (49),
`POST .../rollback` (215) and every `action()` route (`routes.ts:248`).
`FORBIDDEN` is not in the `handler` allow-list (F1), so a tenant-B caller
presenting a tenant-A change-set id receives `500 INTERNAL_ERROR`.

I verified the denial itself is correct and fail-closed: the grant-level checks
in `allowed` (`routes.ts:254-284`) run first and the resource always carries
`tenantId: c.tenantId` (`routes.ts:272`). What is wrong is the status code, not
the decision. Note that the *gated* permissions are additionally protected by
`createMetaEntityAuthoringAuthorizer`
(`server/apps/platform-host/src/composition/shared/entity-governance/meta-entity-authoring-authorizer.ts:5-15`),
which resolves the change set/release row and requires
`row.tenantId === context.tenantId`, so `review`/`publish`/`activate` are not
fail-open. The remaining gap is a signal-quality and contract issue: cross-tenant
probes are indistinguishable from server faults (they also increment the
`athyper_http_errors_total` 5xx counter used at `http-runtime.ts:154-160`).

Concrete consequence on the Country path: a Studio user in the wrong tenant who
opens `/app/entity/country/`'s authoring inspection or submits a graph save sees
an opaque "An unexpected error occurred" rather than an authorization error, and
the attempt is counted as a server error.

Fix: same central mapping as F1 — `AuthoringPolicyError` with
`code === "FORBIDDEN"` must always produce 403 from this package's handlers.

Confidence: verified. Severity: high.

---

### F3 — HIGH — three test suites in this package cannot collect: they import files that do not exist on disk

Mechanical sweep: I extracted every `from "./…"` / `from "../…"` specifier in all
49 `src/**/*.test.ts` files, mapped a trailing `.js` to `.ts`/`.tsx` (correct for
`moduleResolution: "bundler"`, `server/tsconfig.json:5`), and stat-ed each
target. 6 specifiers resolve to nothing.

(a) `server/packages/planes/studio/meta-entity-authoring/src/__tests__/intake-presentation.test.ts:3`

```ts
import { publishedBusinessPartnerIntakeOverlay } from "../intake-presentation.js";
```

Resolved target: `server/packages/planes/studio/meta-entity-authoring/src/intake-presentation.ts`.
`ls` confirms it does not exist. Repo-wide search for
`publishedBusinessPartnerIntakeOverlay` finds only this test file and its three
call sites (lines 6, 23, 30). The feature source was deleted; the test was not.
This suite fails to load at collection time, and
`tsc -p tsconfig.test.json --noEmit` (declared in `package.json`'s `typecheck`)
reports TS2307 for this line.

(b) `server/packages/planes/studio/meta-entity-authoring/src/__tests__/configuration-editor-qualification.test.ts:2-3`

```ts
import { configurationEdit } from "../../../../../../../packages/planes/studio/business-partner/src/composition-configuration";
import { configurationFixture } from "../../../../../../../packages/planes/studio/business-partner/src/composition-configuration.fixture";
```

Resolved targets:
`packages/planes/studio/business-partner/src/composition-configuration{.ts,.tsx,/index.ts}`
and `…composition-configuration.fixture{.ts,…}`. Neither exists. The whole
`packages/planes/studio/business-partner` directory contains **only**
`node_modules`:

```
$ ls -la packages/planes/studio/business-partner/
drwxr-xr-x 3 chandravel_natarajan chandravel_natarajan 4096 Sep 27 21:13 node_modules
$ ls packages/planes/studio/business-partner/src
ls: cannot access 'packages/planes/studio/business-partner/src': No such file or directory
```

The package sources were deleted; the two qualification tests that import them
were not.

(c) `server/packages/planes/studio/meta-entity-authoring/src/__tests__/structural-editor-qualification.test.ts:2-3`

```ts
import { structuralEdit } from "../../../../../../../packages/planes/studio/business-partner/src/composition-structure";
import { graph } from "../../../../../../../packages/planes/studio/business-partner/src/composition-structure.fixture";
```

Same defect: `…/business-partner/src/composition-structure{.ts,/index.ts}` and
`…composition-structure.fixture{.ts,…}` do not exist. Repo-wide `find` for
`composition-configuration*` / `composition-structure*` (excluding
`node_modules`) returns nothing.

Consequence: `vitest run` in this package (`vitest.config.ts` includes
`src/**/*.test.ts`) cannot collect three of its 49 suites, and the package
`typecheck` script fails. Because these are "qualification" suites, the coverage
they claim (structural edits and configuration edits surviving
`validateGraph`/`compileGraph`/`runContractTests`) is currently **zero** — the
suite name is misleading in any test report that tolerates unhandled load errors.

Fix: either restore the deleted modules/fixtures or delete the three orphaned
test files; then run the package `typecheck` + `test` in CI. Adding a
grep-based guard that every relative specifier in `src/**` resolves would catch
the next recurrence.

Confidence: verified (files stat-ed; `.js`→`.ts` mapping applied).
Severity: high (per the audit rule for non-collectable suites).

---

### F4 — MEDIUM — a reviewer can never reject a meta-entity change set: the service method has no route and no caller

`server/packages/planes/studio/meta-entity-authoring/src/authoring-service.ts:201-208`

```ts
  reject(input: {
    changeSetId: string;
    expectedRevision: number;
    actorId: string;
    breakGlass?: BreakGlassEvidence;
  }) {
    return this.reviewTransition(input, "rejected");
  }
```

`routes.ts` registers `action(...)` for exactly `fork`, `validate`, `test`,
`submit`, `approve`, `publish` (`routes.ts:104-191`); there is no `reject` action
and no other path that reaches `reviewTransition(..., "rejected")`. A repo-wide
search for `.reject(` outside tests and outside the unrelated onboarding plane
finds only `learning-routes.ts:17` (Atlas learning inbox, a different service)
and `governance-routes.ts:442` (governance service).

I also checked the state machine: `ChangeSetStatus` includes `"rejected"`
(`server/packages/contracts/meta-entity-authoring/src/model.ts:2`) and
`kysely-authoring-repository.ts:454` writes `rejection_reason` only for
`"rejected"`, so the schema and repository support the transition — only the HTTP
surface is missing.

Consequence: an `in_review` change set can only move forward (`approve` → publish)
or stay stuck. A reviewer who finds a problem has no framework-native way to
reject it, which is exactly the kind of workflow workaround the repository rules
forbid (bespoke per-entity handling). The Country metadata's change sets are
subject to the same one-way gate.

Fix: register a `reject` action with the `metadata.entity.review` permission and
`from: "in_review" → "rejected"`. Also map
`REVIEWER_SEPARATION_REQUIRED` per F1 so the denial is a 403/409 and not a 500.

Confidence: verified (no caller; no route). Severity: medium (missing control,
not fail-open).

---

### F5 — MEDIUM — the break-glass review path is unreachable dead code; the only code that implements it is the branch every caller is forbidden to take

`server/packages/planes/studio/meta-entity-authoring/src/routes.ts:340-348`

```ts
function breakGlass(v: unknown) {
  const b =
    v && typeof v === "object" ? Reflect.get(v, "breakGlass") : undefined;
  if (b)
    throw new TypeError(
      "Break-glass review requires server-verified approval evidence",
    );
  return {};
}
```

This is the **only** production supplier of a `breakGlass` value: it is spread
into `approve` at `routes.ts:170` (`...breakGlass(q.body)`). Whenever a caller
actually supplies `breakGlass`, it throws `TypeError` (which per F1 becomes a
500). Whenever it does not, it returns `{}`, so the field is always absent.

Meanwhile `authoring-service.ts:336-346` implements the exception it would unlock:

```ts
    const current = await this.required(input.changeSetId);
    if (
      current.createdBy === input.actorId ||
      current.submittedBy === input.actorId
    ) {
      if (!input.breakGlass || input.breakGlass.authorizedBy === input.actorId)
        throw new AuthoringPolicyError(
          "REVIEWER_SEPARATION_REQUIRED",
          "Authors and submitters cannot review their own change set",
        );
    }
```

`breakGlass` is also consumed by `kysely-authoring-repository.ts:454`
(`rejection_reason = input.breakGlass?.reason ?? "Rejected by reviewer"`), so the
field is fully wired through the repository and then never reaches it. I checked
all other `approve` callers — `development-publication.ts:223`,
`publication/publication-workflow.ts:114,174`, `learning-inbox.ts:399` — none
supply `breakGlass`.

Consequence: the maker/checker separation is effectively unconditional (which is
fail-closed and good), but the break-glass capability the types, repository and
comments describe does not exist operationally, and the test that "covers" it
(`__tests__/learning-route-scope.test.ts:17` asserting 400) passes only because
of a test-local middleware. Anyone relying on the documented break-glass path
gets either a 500 (with the flag) or a 500 `REVIEWER_SEPARATION_REQUIRED`
(without it).

Fix: either delete `breakGlass` from `routes.ts`, `authoring-service.ts` and
`ports.ts` and document reviewer separation as unconditional, or implement it
properly (server-verified approval evidence resolved from a trusted store, never
from the request body) and map the failure to a 4xx. Do not leave the dead branch.

Confidence: verified. Severity: medium (dead code plus a misleading control that
cannot work).

---

### F6 — MEDIUM — the shared authoring repository hardcodes one entity code, so release inspection cannot serve Country or any other entity

`server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.ts:93-102`

```ts
  async listInspectionReleases(tenantId: string) {
    const result = await sql<import("@athyper/server-contract-meta-entity-authoring").MetaEntityInspectionRelease>`
      SELECT r.id::text, e.entity_code AS "entityCode", r.change_set_id::text AS "changeSetId",
        r.release_no::integer AS "releaseNo", r.contract_hash AS "contractHash",
        r.target_planes AS "targetPlanes", r.published_at::text AS "publishedAt"
      FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id
      WHERE r.tenant_id=${tenantId}::uuid AND e.entity_code='business_partner'
      ORDER BY r.release_no DESC LIMIT 100`.execute(this.database);
    return result.rows;
  }
```

and `…:103-115`

```ts
      WHERE r.tenant_id=${tenantId}::uuid AND r.id=${releaseId}::uuid
        AND e.entity_code='business_partner'`.execute(this.database);
```

These back `GET /api/meta-entity-authoring/inspection/releases` and
`GET …/inspection/releases/:id` (`routes.ts:72-83`). The entity code is baked
into the shared framework, not supplied by metadata or by the route's
`:entityCode`/`:id` parameter.

Consequence on the shipped Country route: Country's releases are invisible to
the inspection surface — the list returns `[]` and `readInspectionRelease`
returns `null`, which the route turns into `404 RELEASE_NOT_FOUND`
(`routes.ts:81`). The same is true for every entity except `business_partner`.
It also violates the standing repository rule to keep entity-specific
configuration in metadata and to generalize framework gaps.

I checked for a mitigating caller-side filter: the route passes only
`c.tenantId` and the id (`routes.ts:67,74,80`) and
`entity-authoring`'s `MetaEntityAuthoringService` forwards them unchanged
(`authoring-service.ts:64-71`); `createScopedMetaEntityAuthoringRepository` adds
only a tenant transaction (`scoped-meta-entity-authoring.ts:16-29`). There is no
second path.

Fix: drop `AND e.entity_code='business_partner'` and either expose the already
selected `e.entity_code` as a filter parameter or (better) return releases for
the tenant and let the caller/projection filter by entity. Then add an
inspection test for a second entity code (Country is the available one).

Confidence: verified. Severity: medium.

---

### F7 — MEDIUM — an authored runtime profile is never reconciled with the immutable platform class profile; `apiExposure`, `writeMode`, `readHandlerKey`, `writeHandlerKey` are author-controlled strings that reach the signed descriptor

`server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts:1007-1018`

```ts
  if ((graph.runtimeProfiles ?? []).length !== 1)
    issues.push({
      code: "RUNTIME_PROFILE_REQUIRED",
      path: "runtimeProfiles",
      message: "Exactly one default runtime profile is required",
    });
  requiredStrings(
    graph.runtimeProfiles ?? [],
    ["backingKind", "apiExposure", "readMode", "writeMode"],
    "runtimeProfiles",
    issues,
  );
```

`requiredStrings` (`deterministic.ts:1090-1107`) accepts any non-blank string.
The profile is then copied verbatim into the signed descriptor at
`deterministic.ts:610` (`runtimeProfiles: graph.runtimeProfiles ?? []`).

Meanwhile the class profile is explicitly declared immutable platform-owned data
and enforced byte-for-byte against the persisted row
(`kysely-authoring-repository.ts:609-624`):

```ts
    if (canonicalJson(input.graph.classProfiles) !== canonicalJson([persisted]))
      throw new AuthoringConflictError(
        "Entity class profiles are immutable platform-owned defaults",
      );
```

Nothing ties the two together. I searched:
* TypeScript: every `classProfiles` consumer is `model.ts:65`,
  `graph-storage-order.ts:12`, `graph-identity.ts:8`, `deterministic.ts:609`
  (pass-through), `:807/:843` (ordering), `:1144-1150` (only checks that a
  supplied profile's `entityClass` equals the header), and the repository
  immutability check. No comparison against `runtimeProfiles`.
* SQL: `default_write_mode` / `default_api_exposure` appear only as the
  `metadata.entity_class_profile` column definitions
  (`server/db/ddl/planes/studio/metadata/03_tables.sql:262,264`) and in the
  reference seed/verification script
  (`server/db/seed-backup/meta-entity/010_reference/010_entity_class_profiles.sql:71-73`);
  no function or constraint compares them to `entity_runtime_profile`.
* Downstream: `server/packages/platform/metadata/src/descriptor-parser.ts` and
  `native-runtime-projection.ts` never branch on a runtime-profile `writeMode`
  (the only `writeMode` checks are field-level, e.g.
  `native-runtime-projection.ts:21,27,264`).

The Postgres enum domains do bound the *values*
(`entity_runtime_profile_api_chk` etc.,
`server/db/ddl/planes/studio/metadata/03_tables.sql:335-354`), but `api` and
`generic` are legal members, so a graph author with `metadata.entity.author` on
their tenant can save `apiExposure: "api"`, `writeMode: "generic"`,
`writeHandlerKey: "<any registered handler>"` for an entity whose class profile
default is read-only, and the only remaining gate is a human reviewer's
attention at `metadata.entity.publish`.

Country is **not** exposed today: `buildSharedReferenceGraph`
(`authoring/graph-builder.ts:52`) hardcodes
`apiExposure: "api", readMode: "generic", writeMode: "none"` and the
`athyper.shared-reference-product/1` parser (`authoring/product.ts:47`) does not
accept a `runtimeProfiles` key, so Country's write mode cannot be authored. The
finding is that this guarantee is convention, not enforcement, and the full
graph editor (`PUT /change-sets/:id/graph`, `routes.ts:133-151`) accepts any
`runtimeProfiles` a tenant author supplies.

Fix: add a `validateGraph` issue when `runtimeProfiles[0].apiExposure` /
`readMode` / `writeMode` / `backingKind` / `concurrencyMode` / `createMode`
differ from the matching immutable `classProfiles[0].default*` value, and encode
the rule once as a shared constant so authoring and publication agree.

Confidence: verified (absence of the check across TS + SQL); the exploitability
severity is bounded by the required independent reviewer. Severity: medium.

---

### F8 — MEDIUM — entity-specific and plane-specific hardcodes in the shared document-collection publisher

`server/packages/planes/studio/meta-entity-authoring/src/document-collection-publication.ts:32-39`

```ts
  if (
    rows.length !== 1 ||
    !r ||
    r.entity_code !== "business_partner_request" ||
    r.release_kind !== "publish" ||
    input.targetPlanes.join(",") !== "neon"
  )
    throw Error("DOCUMENT_COLLECTION_REVIEW_REQUIRED");
```

This is a shared publication preparer (`index.ts:24` exports it; wired at
`server/apps/platform-host/src/composition/register-services.ts:4329`) that can
only ever prepare one entity on one plane. Any other entity with a
`collectionRelationship` descriptor reaches this check and fails with
`DOCUMENT_COLLECTION_REVIEW_REQUIRED`, which (F1) is served as a 500.

I confirmed there is no per-entity enrolment data behind the literal: the query
above selects `e.entity_code` from the release row
(`document-collection-publication.ts:22-27`) and then compares it to a constant.
The neighbouring `compileCollectionCompilation`
(`collection-relationship.ts:75-107`) already enforces the plane, the single
relationship declaration, the read-operation shape and the resolver — it does so
from the graph, not from an entity name.

Consequence: this becomes a second bespoke gate that blocks the next onboarded
entity (the rule in AGENTS.md is the opposite: reuse the shared framework).
Country itself has no `collectionRelationship`, so it is unaffected today.

Fix: replace the entity literal with the structural guarantees already enforced
by `compileCollectionCompilation`, and take the allowed planes from the
descriptor/relationship rather than the string `"neon"`.

Confidence: verified. Severity: medium (wrong behaviour for every entity except
one; repo-rule violation).

---

### F9 — LOW — route UUID validation is far looser here than in the sibling registrars, turning bad ids into 500s instead of 400s

`server/packages/planes/studio/meta-entity-authoring/src/routes.ts:306-311`

```ts
function uuid(v: unknown) {
  const x = String(v ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(x))
    throw new TypeError("Invalid UUID");
  return x;
}
```

`[0-9a-f-]{27}` accepts 27 characters of hex **or hyphens in any position**, so
values such as `00000000---------------------------` pass the guard. The sibling
registrars use the strict canonical form:
`collection-authoring-routes.ts:72-75` and `notification-authoring-routes.ts:75`
(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`), and
`learning-routes.ts:20` (version-4 canonical with version/variant nibbles).

Consequence: a malformed id reaches Postgres as `${id}::uuid`
(e.g. `kysely-authoring-repository.ts:249`), the driver raises, and per F1 the
client sees 500 rather than 400. No injection risk — the value is a bound
parameter.

Fix: use one shared canonical-UUID validator across all four files.

Confidence: verified. Severity: low.

---

### F10 — LOW — host registries for list-experience attention counts and cross-collection navigation are never plumbed into the authoring compiler, so the authored feature always fails

`server/packages/planes/studio/meta-entity-authoring/src/list-experience.ts:12-18`

```ts
export function compileListExperience(
  graph: MetaEntityGraph,
  surface: MetaEntitySurface,
  registeredAttentionCounts: readonly string[] = [],
  registeredCollections: readonly string[] = [],
  registeredStandardViewSources: readonly string[] = STANDARD_VIEW_RELATIONSHIP_SOURCES,
): PublishedListExperienceV1 {
```

Both authoring-side call sites use the defaults:
`deterministic.ts:700` (`experience: compileListExperience(graph, surface)`) and
`deterministic.ts:1172` (same, inside `validateListSurfaces`). Consequently the
guards below reject unconditionally:

`list-experience.ts:196-200`

```ts
    if (
      config.attentionCountKey &&
      !registeredAttentionCounts.includes(config.attentionCountKey)
    )
      throw new TypeError("Attention count resolver is not registered");
```

`list-experience.ts:229-237`

```ts
  for (const section of result.navigation ?? []) {
    const collection = section.content?.entityCode;
    if (
      collection &&
      collection !== graph.entity.entityCode &&
      !registeredCollections.includes(collection)
    )
      throw new TypeError(`Unregistered section collection: ${collection}`);
  }
```

Only the dev provisioning script passes real values
(`server/db/scripts/provisioning/publish-development-list-experience.ts:329`).

This is fail-closed (nothing unregistered is published), so it is not a security
defect. It is a framework gap: the two authoring hooks exist and cannot be used
from the authoring plane, so a list surface with a registered attention count or
a cross-collection navigation section cannot be published through
`validate`/`submit`/`publish` at all.

Fix: pass the host's registries through `MetaEntityAuthoringService` into
`validateGraph`/`compileGraph` (the same registries the publication service
qualifies against), so authoring and publication agree.

Confidence: verified. Severity: low (capability gap, fail-closed).

---

### F11 — LOW — hardcoded user-visible English in generated metadata and API responses

`server/packages/planes/studio/meta-entity-authoring/src/authoring/graph-builder.ts:58`

```ts
    operations: ["list", "read"].map(key => ({ id: id(`operation:${key}`), operationKey: key, operationKind: "read", label: key === "list" ? definition.title : "View record", fieldKeys, auditEventCode: `${definition.entityCode}.${key}` })),
```

The literal `"View record"` is compiled into `operations[].label` of every shared
reference entity, including Country, while the list operation gets the localized
`definition.title`. The graph model carries a `label` but the reference product
(`authoring/product.ts:47`) accepts no operation-label input, so this string
cannot be localized by metadata.

Also in the HTTP layer: `routes.ts:277-281` returns a hardcoded English problem
document (`title: "Access denied"`, `detail: "This action requires verified
MFA."`), and `assertTenant`'s and `AuthoringPolicyError`'s messages are English
prose.

Consequence: any plane or UI that renders an operation label for a shared
reference entity shows untranslated English. I did not trace whether the Country
detail page renders this specific operation label (Country's detail surface
declares `actions: []` in
`authoring/graph-builder.ts:80`), so the user-visible impact is probable rather
than verified.

Fix: for `"View record"`, derive the label from the reference definition (or omit
operations from the artifact if unused); for the problem documents, emit stable
`code` values and let the client localize.

Confidence: verified literal; consequence probable. Severity: low.

---

## Verified healthy — do not churn

1. **Authorization on every mutating route is present.** I enumerated all mutating
   routes in the package: `POST /change-sets` (`routes.ts:112-132`),
   `PUT /change-sets/:id/graph` (133-151), the `action()` routes fork/validate/
   test/submit/approve/publish (104-191), `POST /releases/:id/activate`
   (192-208) and `.../rollback` (209-227), the collection `PUT`/`POST`
   (`collection-authoring-routes.ts:60-155`), the notification `PUT`/`POST`
   (`notification-authoring-routes.ts:216-309`) and all six Atlas-learning POSTs
   (`learning-routes.ts:14-18`). Every one calls `allowed(...)` or
   `options.authorize(...)`, and the two auxiliary registrars additionally call
   `assertTenant`. No unauthenticated mutation path exists.

2. **The maker/checker policy is enforced independently of the HTTP layer.**
   `meta-entity-authoring-authorizer.ts:5-15` re-reads the change set/release row
   inside the caller's tenant transaction and requires
   `status === "approved"`, a non-null `submittedBy`, a non-null `approvedBy`
   distinct from both `createdBy` and `submittedBy`; and
   `authoring-service.ts:336-346` repeats the author/submitter separation for
   `review`. `routes.ts:17-18` documents that the read-only
   `inspectionAuthorizer` must never be used by a mutation route, and I verified
   the dispatch honours it: `routes.ts:269` selects `inspectionAuthorizer` only
   when the permission argument is an **array**, and every array call site is a
   `GET` (lines 43, 48, 57, 73, 77, 88, 96).

3. **The un-scoped `getSignedRelease` query is not a cross-tenant hole.**
   `kysely-authoring-repository.ts:538-542` selects
   `metadata.entity_release JOIN snapshot.entity_release_artifact` by id with no
   tenant predicate, which looked dangerous for the `redispatch`, `activate` and
   `rollback` paths (`authoring-service.ts:268,284,303`). Mitigations I confirmed:
   `metadata.entity_release` and `snapshot.entity_release_artifact` are both
   `ENABLE ROW LEVEL SECURITY` **and** `FORCE ROW LEVEL SECURITY`
   (`server/db/ddl/planes/studio/metadata/10_rls.sql:45-46`,
   `server/db/ddl/planes/studio/snapshot/10_rls.sql:102-103`) with tenant read
   policies; the repository always runs inside `withTenantTransaction`
   (`scoped-meta-entity-authoring.ts:51`); the authorizer's loader for the gated
   `publish`/`activate` permissions resolves the release through the caller's
   tenant (`register-services.ts:4490-4493` plus
   `meta-entity-authoring-authorizer.ts:8-11`); and the rollback path
   additionally re-derives the revision with
   `prior.entity_id = cs.entity_id AND prior.tenant_id IS NOT DISTINCT FROM cs.tenant_id`
   (`kysely-authoring-repository.ts:495`) and re-checks
   `sha256(contract_json) === artifact.contractHash` (507-514).

4. **Compiled security fields cannot be overwritten by authored branches.**
   In `compileGraph` (`deterministic.ts:566-612`) the compiled
   `authorization`, `authorizationRuntime`, `ai`, `directoryScope`,
   `collectionRelationship`, `collectionCompilation`, `recordPresentation`,
   `ownerAccess`, `recordPredicates` and `mutationPolicy` are written first, then
   the authored branches. I checked the one spread that runs *after* them:
   `capabilityArtifactMembers` returns only
   `{ capabilities, operationBindings, notificationPolicies? }`
   (`server/packages/contracts/publication/src/entity-capabilities.ts:39-78`), so
   it cannot shadow a security field, and `graph.entity`/`graph.fields` are
   DB-derived by `loadGraph` (`kysely-authoring-repository.ts:282-291`) while
   `replaceGraphInTransaction` never persists `graph.entity`.

5. **The graph → descriptor path is validated twice and by two independent
   implementations.** `validateGraph` runs on save
   (`kysely-authoring-repository.ts:340-344`), on validate/submit/publish
   (`authoring-service.ts:142,175,239`) and inside `compileGraph`
   (`deterministic.ts:514-515`, which throws `META_ENTITY_GRAPH_INVALID`); and the
   publication service re-derives authorization from the authored contract and
   compares it hash-for-hash with the compiled descriptor
   (`server/packages/services/publication/src/entity-authorization-compiler.ts:135-149`
   and `publication-artifact-loader.ts:347-354`). `authoredAuthorization`
   (`entity-authorization-compiler.ts:361-377`) rejects anything but exactly one
   authored profile. This cross-check is the reason F7 is a "convention, not
   chaos" gap rather than an immediate bypass.

6. **The reference-product importer is strict and revalidates.** `object()`
   rejects unknown keys at every level (`authoring/product.ts:12-17,43,47`), the
   entity code must be canonical (`:48`), every plane is compiled
   (`:80`), and `compileSharedReferenceProduct` explicitly re-parses before
   compiling "because a prior parse is not a mutation-proof capability"
   (`:84-91`). `parseTableEntityProduct`
   (`authoring/table-product.ts:17-112`) additionally requires a read-only `id`
   field, a read-only UUID tenant field, optimistic concurrency with a read-only
   integer/bigint version field for any writable profile, a handler for every
   non-read operation, and forbids pre-existing product markers.

7. **Local preview state is environment-gated and tamper-evident.**
   `assertGraphPreviewEnvironment` (`graph-preview.ts:65-73`) requires
   `ATHYPER_LOCAL_WORKSPACE=1`, `ATHYPER_ENV=local`,
   `ATHYPER_DOMAIN_SUFFIX=dev.athyper.test`. The durable store creates its
   directory `0o700` and the database file `0o600`
   (`durable-graph-preview.ts:39-41`), keeps claims/artifacts/heads in SQLite with
   `BEGIN IMMEDIATE` transactions (`:50-60`), and re-verifies content hash,
   Ed25519 signature and coordinate on every read (`:184-206`). No user input
   reaches the file path.

8. **The dev publication workflows are conservative.** `DevelopmentPublicationWorkflow`
   (`development-publication.ts`) takes overlays from a code-owned registry and
   never from the request (`:51-54,108-112`), requires `devfull`/`dev`/`local`
   (`:89-95`) and two distinct principals (`:96-101`), records evidence before
   each mutation, and calls `authorize(...)` before each service transition
   (`:159,195,222,228`). `ReferenceFirstPublicationWorkflow` and
   `EntitySuccessorPublicationWorkflow`
   (`publication/publication-workflow.ts:53-59,72-83,140-148`) re-pin the source
   contract/descriptor hash at every step and require
   `createdBy !== publisherPrincipalId`.

9. **`authorization-successor.ts` and `runtime-restoration.ts` cannot smuggle a
   policy change.** The successor compiler restricts the allowed delta to
   `fields, operations, listPresentation, authorization, authorizationRuntime,
   operation_scope_bindings` and then requires the proposed authorization to be
   byte-equal to both the authored layout authorization and the native one, and
   the runtime bindings to be equal to the native ones after a documented
   normalization (`authorization-successor.ts:30-41`). `runtime-restoration.ts`
   does the same (`:58-80`) and additionally requires every runtime branch to be
   present (`:95-97`).

10. **`capability-profile-files.ts` is path-safe.** It `realpathSync`s the
    directory, rejects absolute and escaping entries, re-checks
    `relative(root, file)` (`:20-22`), and verifies a SHA-256 against
    `source-lock.json` before parsing (`:23-26`).

---

## Checked but not a defect

* **`handler`'s forwarding is not rescued anywhere in the host for this package.**
  I looked for a global four-argument Express error middleware in
  `server/apps/platform-host`: the only ones are in *test* files
  (`control-session.test.ts:14`, `publication-policy-enrollment-routes.test.ts:15`,
  `publication-workload-routes.test.ts:22`). Production has exactly one, the
  generic one at `http-runtime.ts:219-244`. This is why F1/F2 are defects rather
  than test artefacts.
* **The `allowed()` array-vs-string dispatch could have leaked the read-only
  inspection authorizer into a mutation route.** `routes.ts:269` uses
  `Array.isArray(p) ? o.inspectionAuthorizer ?? o.authorizer : o.authorizer`.
  I checked every array call site (43, 48, 57, 73, 77, 88, 96) — all are `GET`
  and all pass `metadata.entity.author`/`metadata.entity.review`/
  `publication.deployment.view`; every mutating route passes a single string or
  uses the sibling registrars' own `authorize` with a string. Not a defect.
* **`EntitySuccessorPublicationWorkflow.source()` uses only
  `compileSystemReferenceTarget`** (`publication/publication-workflow.ts:147`),
  unlike `ReferenceFirstPublicationWorkflow.assertSource`
  (`:79`), which dispatches on `p.schema` to `compileSystemEntityTarget`. The
  same single-compiler choice appears in the enrolment gate
  (`publication/successor-source.ts:25`). I traced reachability: the successor
  policy parser (`server/packages/contracts/publication/src/policy/entity-successor-policy.ts:56-73`)
  imposes no product-type restriction, but `assertEntitySuccessorSource` runs at
  enrolment (`register-services.ts` / `policy-enrollment.ts:86,128`) and would
  throw `SYSTEM_REFERENCE_SOURCE_MARKER_REQUIRED` for a table-entity graph, so a
  table-entity successor policy cannot be enrolled and `:147` cannot be reached
  for one. Latent inconsistency, not a live defect; note it as a generalization
  gap if table-entity successors become a requirement.
* **`runContractTests` reads arbitrary graph paths.** `readPath`
  (`deterministic.ts:769-780`) walks `test.path.split(".")` from the graph root,
  so an author can assert on any branch, including `runtimeProfiles.0.writeMode`.
  I checked whether that could assert on the *compiled* descriptor: it cannot —
  `runContractTests` is given the graph (`authoring-service.ts:160,176`), not the
  artifact, and the artifact's own hashes are compared separately
  (`authoring-service.ts:243`, `kysely-authoring-repository.ts:507-514`). Not a
  defect.
* **`boundedRows` limits and key/number validation are adequate.**
  `deterministic.ts:917-1001` bounds every array branch at 10 000 rows, all
  strings at 4 000 characters, `id`/`*Id` at 128 characters, `*Key`/`*Code` to
  `^[a-z][a-z0-9_.-]{0,126}$`, and `position`/`priority`/`*Revision` to
  `[0, 1_000_000]`. Combined with the per-table Postgres CHECK constraints, an
  oversized or malformed graph is rejected before publication.
* **`graph-identity.cloneGraphIds`** (`graph-identity.ts:5-21`) rewrites any
  string equal to a known row id anywhere in the graph, including inside
  `layoutConfig`. I considered whether authored display text could collide with a
  UUID and be silently rewritten — practically impossible, and the function is
  only used for forks where identity regeneration is the intent. Not worth a
  finding.
* **`document-collection-publication`'s early return.** `:18` returns `false`
  when the descriptor has no `collectionRelationship`, so the host's sequential
  preparer chain (`register-services.ts:4329-4330`) is not broken for entities
  without it. Only the hardcoded gate at `:35-37` (F8) is a defect.
* **`prepareCollectionConfigurationRelease`, `prepareNotificationConfigurationRelease`,
  `prepareSystemReferenceRelease`, `prepareDocumentCollectionRelease` and
  `prepareAtlasLearningRelease` all re-compile the persisted contract and compare
  `contractHash`, `descriptorHash`, `sha256(descriptor)`, signature algorithm,
  signing key id and signature** before writing anything
  (`collection-publication.ts:39-51`, `notification-publication.ts:78-90`,
  `publication/prepare-release.ts:49-55`,
  `document-collection-publication.ts:40-53`, `learning-publication.ts:25`).
  Authored content cannot be substituted between review and release.
* **`defaultNotificationConfiguration` / `parseEntityNotificationConfiguration`
  round-trips in `notification-authoring-routes.ts`** preserve
  `targetEntityCode` when rewriting the policy (`:253-259`) and re-derive the
  binding through `parseCapabilityBinding` (`:131`), so the capability binding
  cannot be forged through the notification editor.
* **`__tests__/restoration-publication-conflict.test.ts:2` and
  `__tests__/configuration-editor-qualification.test.ts:8` import without a
  `.js` extension.** Under this repo's `moduleResolution: "bundler"`
  (`server/tsconfig.json:5`) and vitest resolution these are legal; only the
  three files listed in F3 actually fail to resolve. I checked this explicitly so
  as not to over-report the sweep.
* **`metadata.entity_release` / `snapshot.entity_release_artifact` RLS.** Verified
  `FORCE ROW LEVEL SECURITY` on both
  (`metadata/10_rls.sql:45-46`, `snapshot/10_rls.sql:102-103`), which is what
  keeps F-adjacent un-scoped reads (`getSignedRelease`) inside the tenant.

---

## Coverage and method

Files read in full: `routes.ts`, `authoring-service.ts`,
`kysely-authoring-repository.ts`, `deterministic.ts`, `collection-authoring-routes.ts`,
`notification-authoring-routes.ts`, `learning-routes.ts`, `list-experience.ts`,
`graph-preview.ts`, `durable-graph-preview.ts`, `durable-graph-preview-adapter.ts`,
`graph-dependencies.ts`, `entity-authorization.ts`, `entity-ai.ts`,
`collection-relationship.ts`, `collection-publication.ts`,
`document-collection-publication.ts`, `notification-publication.ts`,
`publication-adapter.ts`, `development-publication.ts`, `baseline-publication.ts`,
`authorization-successor.ts`, `runtime-restoration.ts`, `learning-publication.ts`,
`entity-registration.ts`, `graph-identity.ts`, `graph-storage-order.ts`,
`system-reference-authoring.ts`, `index.ts`, the whole
`contracts/meta-entity-authoring/src` package, and the `publication/` subdirectory
(`publication-workflow.ts`, `prepare-release.ts`, `prepare-successor.ts`,
`successor-source.ts`) plus `authoring/{product,graph-builder,table-product,capability-profile-files}.ts`.

Files not read in full (skimmed by grep only): `learning-inbox.ts` (584 lines —
read the authorization region 70-140, 176-235, 360-463 and grepped every
`this.allowed` call site), `publication/{amend-successor-capabilities,amend-successor-collaboration,amend-successor-localization}.ts`,
`authoring/adopt-capability-profiles.ts`,
`authorization-successor-publication.ts`, `runtime-restoration-publication.ts`.

Read-only checks run: `find`/`wc -l` inventory; a scripted resolution of every
relative and package import in all 49 `*.test.ts` files (mapping `.js`→`.ts`);
`grep` for `AuthoringPolicyError`/`AuthoringConflictError`/`TypeError` throw
sites; `grep` for hardcoded entity codes and plane literals in non-test sources;
`grep` for `breakGlass`, `.reject(`, `getSignedRelease`, `classProfiles`,
`defaultWriteMode`, `exposeErrorDetails` and Express error middleware across
`server/`; and reading the RLS DDL for `metadata.entity_release` and
`snapshot.entity_release_artifact`.

No test run was performed (the task is read-only and `vitest`/`tsc` write cache
and `dist` artefacts). The F3 conclusions are from `stat`-level existence checks
on the resolved specifier targets, which are conclusive for module resolution.
