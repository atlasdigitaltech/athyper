# Fresh review — Published metadata resolution and experience compilation

- **Area:** `Published metadata resolution and experience compilation`
- **Repository:** `/home/chandravel_natarajan/src/athyper` (Next.js + Turbo monorepo, pnpm, TS strict)
- **Method:** read-only trace of current source. Every finding below cites `relative/path.ext:LINE`
  verified in this session. Nothing under `docs/reports/review/` or the older
  `country-route-comprehensive-review-*` report was read.
- **Files in scope:** `server/packages/platform/metadata/src/**`,
  `server/packages/platform/experience/src/**`, `server/packages/contracts/metadata/src/**`,
  `server/apps/platform-host/src/composition/shared/entity-runtime/**`,
  `server/apps/platform-host/src/composition/shared/entity-governance/**`,
  `metadata/products/shared/entities/country/*.json`.
- **Cross-checked one layer away (not in scope but required to settle enforcement):**
  `server/apps/platform-host/src/composition/register-services.ts`,
  `server/apps/platform-host/src/kernel/bootstrap.ts`,
  `server/packages/services/records/src/{entity-authorization,entity-backend-authorizer,record-read-access,query-service,entity-list-service}.ts`,
  `server/packages/services/publication/src/{publication-artifact-loader,entity-authorization-compiler}.ts`,
  `server/packages/planes/studio/meta-entity-authoring/src/authoring/{graph-builder,product}.ts`.
- **Response to the specific question asked:** the published field/operation authorization
  profile is **validated at qualification time and never enforced at request time** in the
  current composition. The exact skip conditions are in F1/F2 below.

---

## F1 — The published entity authorization profile is never enforced at request time (backend authorizer is never composed)

**Severity:** high (unenforced control / fail-open path). **Confidence:** verified.

**Evidence**

`server/packages/services/records/src/entity-backend-authorizer.ts:150` — the only request-time
enforcement of the published profile is behind an explicit rollout switch:

```ts
  // Existing bounded shadow observers own advisory comparison. This execution
  // boundary does not replay legacy calls or preflight while shadow is selected.
  if (rollout.mode !== "enforce") return options.authority;
```

`server/packages/services/records/src/entity-backend-authorizer.ts:159-162` is the **only**
implementation of `enforcedEntityProfile` in the repository:

```ts
    enforcedEntityProfile: (planeKey, entityCode) =>
      planeKey === profile.planeKey && entityCode === profile.entityCode
        ? rollout.release.profileHash
        : options.authority.enforcedEntityProfile?.(planeKey, entityCode),
```

Consumers gate every profile-based check on that method
(`server/packages/services/records/src/entity-backend-authorizer.ts:442-446`):

```ts
  const expected = authorizer.enforcedEntityProfile?.(
    context.planeKey,
    descriptor.entityCode,
  );
  if (!expected) return false;
```

But no production composition ever constructs the backend authorizer.
`server/apps/platform-host/src/composition/register-services.ts:550-557`:

```ts
    const entityAuthority = (dependencies.entityBackends ?? []).reduce(
      (current, binding) => createEntityBackendAuthorizer({ ...binding, authority: current }),
      authority,
    );
    const backend = dependencies.entityCaseBackendAuthorization
      ? createEntityBackendAuthorizer({
```

Both inputs are optional and have **zero suppliers** anywhere in `server/`, `apps/`, `packages/`
or `tools/` (`entityBackends` only at `register-services.ts:374`/`:550`;
`entityCaseBackendAuthorization` only at `register-services.ts:394`/`:554-566`). The real
entrypoint supplies only the review adapter, `server/apps/platform-host/src/kernel/bootstrap.ts:41`:

```ts
    registerServices(container, review ? { entityAuthorizationReleaseReview: review } : {}, config, lifecycle, plan);
```

The base authority is a plain permission authorizer with no `enforcedEntityProfile`,
`server/apps/platform-host/src/composition/shared/identity/authority.ts:102`:

```ts
  const authorizer = createPermissionAuthorizer({
```

Consequences on the read path for Country — every one of these branches is `enforced === false`:

- `server/packages/services/records/src/query-service.ts:70-74` (`usesEntityBackendAuthorization`)
  and `:121-160` (directory/field-use authorization) are skipped.
- `server/packages/services/records/src/query-service.ts:255-310` (per-row existing-record
  authorization and `executeAuthorizedAggregate`) is skipped.
- `server/packages/services/records/src/record-read-access.ts:12` and `:57` both compute
  `profile` as `undefined`, so the published `directory`, `recordReadOperation`, `ownership`,
  `deferredOperations`, `surfaces` and `relationships` are never consulted.

What *is* still enforced for Country is only the coarse operation map — which is **not** the
published authorization profile. `server/packages/services/records/src/entity-list-service.ts:743-755`:

```ts
async function operationAllowed(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
  operation: string,
  recordId?: string,
): Promise<boolean> {
  const published = descriptor.operations[operation],
    permissionCode = published?.permissionCode;
  if (!permissionCode) return false;
```

For Country that code is `common.platform.reference.view` (synthesised by
`server/packages/planes/studio/meta-entity-authoring/src/authoring/graph-builder.ts:44,57` and
projected into the descriptor at
`server/packages/platform/metadata/src/native-runtime-projection.ts:167-206,283`), so the Country
read is permission-gated — but by the operation map, not by the profile whose every reviewed
field/operation/scope declaration lives in `descriptor.authorization`.

**Why it is wrong.** The framework publishes, signs and *qualifies* a complete authorization
profile (`descriptor.authorization` + `descriptor.authorizationRuntime`) and even requires the
profile to be present (`server/packages/platform/metadata/src/compiled-runtime-contract.ts:34-39`),
but the runtime never installs the only component that reads it. The profile is therefore
documentation, not a control: field policies, masked representations, deferred operations,
discovery/reveal operations, ownership resolvers, parent-read requirements and per-row record
authorization can all be silently violated without any error at publication or at request time.

**Concrete consequence on the Country route.** Country's profile happens to be
"one permission, one plain field policy covering every field" (all shared-reference fields are
`dataClassification: "public"`, `writeMode: "read_only"`,
`graph-builder.ts:44,53`), so the practical degradation is masked: `/app/entity/country/` still
requires `common.platform.reference.view` (via `descriptor.operations.read/list`), and no field
is wrongly hidden or revealed *today*. The consequence is the class of entity this framework is
for: the moment an entity is onboarded with `representation: "masked"` field policies
(they exist as review artifacts, e.g.
`metadata/products/mdg/entities/business_partner_tax_registration/core.json:119-124`
`"readPolicy": "masked_only"`), the mask is not enforced and the read returns the raw value while
still passing the operation-permission gate.

**Fix.** Compose the profile enforcement explicitly per plane (call
`createEntityBackendAuthorizer` with a signed `rollout` from deployment configuration and a
`target`/`owns` mapper derived from the entity's published operations), or, if enforcement is not
yet intended, fail publication/startup when a descriptor publishes
`authorizationRuntime` for an entity on a plane with no backend authorizer installed. Do not
leave the only `enforcedEntityProfile` implementation unreachable.

---

## F2 — Field-level read admission degrades to "all fields readable" when the profile is not enforced

**Severity:** high (field-level read control inert). **Confidence:** verified.

**Evidence**

`server/packages/services/records/src/record-read-access.ts:57-62`:

```ts
  const profile=usesEntityBackendAuthorization(authorizer,context,descriptor)?descriptor.authorization:undefined;
  const decisions = await Promise.all(descriptor.fields.map(async (field) => {
    const policy = profile?.fieldPolicies.find(group => group.fields.includes(field.key));
    const operationKey = profile && policy?.readOperation === profile.recordReadOperation && profile.ownership === "tenant.record.v1" && profile.directory.population === "tenant" ? profile.directory.operation : policy?.readOperation ?? "read";
    const permissionCode = profile?.operations.find(operation => operation.key === operationKey)?.permissionCode ?? field.readPermissionCode;
    if (!permissionCode) return !profile;
```

When `profile` is `undefined` (F1) and the field publishes no `readPermissionCode`, the function
returns `true` for that field — i.e. "no policy, therefore readable". The in-repo normalised
projection never publishes `readPermissionCode`; the whole field projection is
`server/packages/platform/metadata/src/native-runtime-projection.ts:258-278`:

```ts
      return {
        ...choices,
        ...(Object.keys(constraints).length ? {validation:{...choices.validation,...constraints}} : {}),
        key: field.fieldKey,
        storagePath: field.storagePath,
        type: field.dataType,
        required: field.writeMode !== "read_only" && field.cardinality === "one",
        writableOn: projectStoredFieldWrites(field, policy, rows("operations")),
        ...(field.dataClassification && field.dataClassification !== "public" ? { classification: field.dataClassification } : {}),
        ...projectFieldQueryAccess(policy.queryUses, searchableFields.has(field.id)),
```

There is no `readPermissionCode` (and no use of `classification`) here or in
`server/packages/platform/metadata/src/descriptor-parser.ts:276`, which only preserves a
`readPermissionCode` that was explicitly authored. A masked field policy is a *field-policy*
concept (`server/packages/contracts/metadata/src/entity-authorization.ts:234-251`), so nothing
else can enforce it.

**Why it is wrong.** The masked/plain decision and the per-policy `readOperation` are supposed to
come from `profile.fieldPolicies`. With the profile unenforced, the read projection authorises
every field, and `false` is only returned when a field *explicitly* carries
`readPermissionCode` — the opposite of a default-deny contract for a signed authorization
artifact. The service's own comment at
`server/packages/services/records/src/entity-authorization.ts:273` states the intent: "Root DTO
fields only; nested providers must supply their own validated profile."

**Concrete consequence on the Country route.** `descriptor.fields` for Country has 22 entries and
none carries `readPermissionCode`, so every field is "readable" and appears in
`list-descriptor`/`detail-descriptor`/`record`. All of Country's fields are public and its single
published policy is `plain`, so the current page is correct — but the field-policy mechanism the
review approved is not what is doing the work.

**Fix.** When an entity publishes `authorization`/`authorizationRuntime` but no enforcement
authorizer is installed, deny (or throw `ENTITY_AUTHORIZATION_UNAVAILABLE`) instead of treating
an absent profile as "all fields readable"; at minimum require `field.readPermissionCode` to be
projected from the field policy's `readOperation` so the fallback is not a blanket allow.

---

## F3 — Only the exact shared-reference profile shape can ever qualify; every other ownership/directory shape is unqualified

**Severity:** medium (blocks new Entity onboarding — the repository's stated purpose).
**Confidence:** verified.

**Evidence**

`server/apps/platform-host/src/composition/shared/entity-runtime/read-registrations.ts:12-13`:

```ts
  if (profile.ownership !== "tenant.record.v1" || profile.directory.population !== "tenant"
    || profile.directory.operation !== "list" || profile.recordReadOperation !== "read") return [];
```

The remaining registrations are built only from keys present in the profile
(`read-registrations.ts:27-32`), and the caller supplies no other registrations
(`server/apps/platform-host/src/composition/register-services.ts:700-707`):

```ts
              createPublicationRuntimeQualification({
                registrations: [
                  ...(dependencies.entityAuthorizationRuntimeRegistrations ?? []),
                  ...(installedReadQueries ? createEntityReadRegistrations(installedReadQueries, profile, installedRecordMutations) : []),
                ],
```

`entityAuthorizationRuntimeRegistrations` has **zero suppliers** outside this declaration
(`register-services.ts:382`). The registry then throws on any binding it cannot resolve
(`server/packages/contracts/metadata/src/entity-authorization-registry.ts:96-99`):

```ts
      if (unresolved.length)
        throw new TypeError(
          `Unqualified authorization runtime binding: ${unresolved.join(", ")}`,
        );
```

**Why it is wrong.** An entity whose published profile is ownership-scoped
(`organization.record.v1`, `workspace.record.v1`, …), or whose directory population is
`ownership`, or whose record-read operation is not literally called `read`, produces an empty
registration list and is rejected at publication with `RUNTIME_INCOMPATIBLE`
(`server/packages/services/publication/src/publication-artifact-loader.ts:146-152`). There is no
host-supplied fallback in the composition, so the "shared Entity Framework" can currently publish
exactly one profile shape — Country's.

**Concrete consequence on the Country route.** None for Country (it matches the shape), which is
precisely why the limitation is invisible: Country is the only entity that can pass.

**Fix.** Make the admission registrations a real per-plane host binding (the missing
`entityAuthorizationRuntimeRegistrations` injection point already exists), and/or extend
`createEntityReadRegistrations` to derive `scope`/`target`/`effect` from the parsed profile
instead of hard-coding `tenant.record.v1`; fail closed with a specific error naming the
unmapped profile shape rather than a generic `RUNTIME_INCOMPATIBLE`.

---

## F4 — `entity-section-service` `bootstrap`/`section` require `presentation.*` artifacts that the in-repo normalised lowering never emits

**Severity:** medium (broken generic route; raw 500). **Confidence:** verified for the code
paths, "probable" for the claim that a given release lacks the artifacts (the artefact set is
data, not code).

**Evidence**

`server/packages/platform/experience/src/entity-section-service.ts:244-249`:

```ts
async function resolveSurface(reader: PinnedCompiledEntityReader, context: VerifiedRequestContext, entityCode: string, surfaceKey: string) {
  return reader.surfaceModel(coordinate(context, entityCode), surfaceKey);
}
```

called unconditionally from `bootstrap` (`:93-95`) and `section` (`:177-182`), and
`surfaceModel` requires a `presentation_surface` artifact
(`server/packages/platform/metadata/src/compiled-entity-reader.ts:82-84,107-115`):

```ts
  async surface(release: CompiledEntityResolvedRelease, surfaceKey: string): Promise<CompiledEntityArtifactV2> {
    return this.artifact(release, `${release.coordinate.entityCode}/presentation.${safeKey(surfaceKey)}`, "presentation_surface");
  }
```

which throws a plain `Error` when absent
(`server/packages/platform/metadata/src/artifact-resolution.ts:87-89`):

```ts
  const entry = release.artifactIndex.get(artifactKey);
  if (!entry) throw new Error(`COMPILED_ENTITY_ARTIFACT_NOT_IN_RELEASE:${artifactKey}`);
```

The route handler does not map that error, so it becomes a 500
(`server/packages/platform/experience/src/entity-runtime-routes.ts:20-23`). The in-repo
normalised lowering emits no presentation artifacts at all,
`server/packages/services/publication/src/compilation/native-runtime.ts:38-46`:

```ts
      { ref: `${source.entityCode}/core.json`, content: { ...base("core"),
      ...
      { ref: `${source.entityCode}/operation.json`, content: { ...base("operation"), operations: descriptor.authorization.operations, ...mapped.operationBindings } },
    ],
    runtimeContracts: { [source.entityCode]: { ...descriptor, ...compileOperationProjection({
```

`summary()` explicitly supports the "runtime contract, no presentation surface" case while
`bootstrap`/`section` do not — `server/packages/platform/experience/src/entity-section-service.ts:136-138`:

```ts
      if (release.artifactIndex.has(`${input.entityCode}/runtime`) && !release.artifactIndex.has(`${input.entityCode}/presentation.${input.surfaceKey}`)) {
        if (input.surfaceKey !== "detail") return null;
        return options.publishedSummary ? options.publishedSummary(input, release) : null;
      }
```

**Why it is wrong.** The runtime-contract path deliberately carries presentation inside the
descriptor (`recordPresentation`, `listPresentation`, `directoryScope`, see
`native-runtime-projection.ts:284-311`), and `bootstrap`/`section` are the routes a
runtime-contract workspace uses. For any entity whose release is produced by the only in-repo
lowering (and has no separately compiled UI surface), these routes fail with an
artifact-not-in-release error rather than degrading to the descriptor's presentation or a clean
404.

**Concrete consequence on the Country route.** Country's page uses
`EntityReadSurface` → `EntityDetailRuntime` → `/list-descriptor`, `/detail-descriptor`,
`/record` (`packages/platform/entity/runtime/form-detail/src/entity-detail-runtime.tsx:38-41`),
so Country is unaffected. The affected surface is the shared `EntityRuntimeWorkspace`
(`packages/platform/entity/runtime/form-detail/src/entity-runtime-workspace.tsx:93` →
`entityRuntimeClient.section`), which is what a new normalised entity is expected to use.

**Fix.** Give `bootstrap`/`section` the same normalised-release branch `summary()` has: when the
release has a runtime contract and no `presentation.<surface>`, project the page plan from
`descriptor.recordPresentation`/`listPresentation` (the `planEntityPage` inputs already exist) or
return `null` (404) instead of letting `COMPILED_ENTITY_ARTIFACT_NOT_IN_RELEASE` escape as 500.

---

## F5 — Generic record-header repository hard-requires common-reference enrolment

**Severity:** low (latent; fails closed with 500). **Confidence:** verified.

**Evidence**

`server/apps/platform-host/src/composition/shared/entity-runtime/published-record-header.ts:20-21`:

```ts
    const descriptor = await readCompiledRuntimeContract(options.reader, release);
    assertCommonReferenceDescriptor(descriptor, context.planeKey);
```

`assertCommonReferenceDescriptor` throws unless
`descriptor.referenceCapability === "common.platform.reference.view"`
(`server/packages/contracts/metadata/src/common-reference-permission.ts:44-48`). The sibling
admission path treats the same assertion as a predicate, not a gate
(`server/apps/platform-host/src/composition/shared/entity-runtime/published-parent-admission.ts:24`):

```ts
    try { assertCommonReferenceDescriptor(descriptor, context.planeKey); } catch { return false; }
```

This header is the production default for every entity:
`server/apps/platform-host/src/composition/register-services.ts:1721-1731` (`?? createPublishedRecordHeader({...})`,
with `entityResourceProviders` having no supplier), and it is reachable from
`createEntityResourceServices`/`createPublishedSummaryService`
(`server/apps/platform-host/src/composition/shared/entity-runtime/resources.ts:20-27`).

**Why it is wrong.** A composition file named and documented as the generic
`EntityRuntimeHeaderRepository` (`server/packages/platform/experience/src/entity-section-service.ts:12-20`)
silently narrows to one entity family. For a non-reference entity the header read throws an
uncaught `TypeError` (`COMMON_REFERENCE_DESCRIPTOR_REQUIRED`) instead of a denial or a
descriptor-driven header, so the route returns 500.

**Concrete consequence on the Country route.** None today: Country *is* common-reference
enrolled (`referenceCapability` set at `native-runtime-projection.ts:232`), and Country's
`recordPresentation` declares no `summaryView`, so the header read is not reached
(`server/packages/platform/experience/src/published-summary-service.ts:93-94` returns before the
header read). The consequence is for the next entity family onboarded through this framework.

**Fix.** Replace the unconditional assertion with family-neutral field/authorization checks
(the header already filters by `descriptor.fields` at `published-record-header.ts:24-25`) and
keep `assertCommonReferenceDescriptor` only where a reference-specific invariant is actually
required.

---

## F6 — Country `required: true` declarations are inert (read-only reference fields can never be required)

**Severity:** low (dead declaration). **Confidence:** verified.

**Evidence**

`metadata/products/shared/entities/country/definition.json:38,47,56,137,154,171,180,197,206`
declare `"required": true` (id, code, name, has_postal_codes, postal_code_label,
region_label, postal_position, status, created_at). The graph builder turns that into
`cardinality` only and forces every shared-reference field read-only,
`server/packages/planes/studio/meta-entity-authoring/src/authoring/graph-builder.ts:53`:

```ts
    fields: definition.fields.map(field => ({ id: id(`field:${field.key}`), fieldKey: field.key, dataType: field.type, typeConfig: { kind: field.type }, cardinality: field.required ? "one" : "zero_or_one", valueOrigin: "stored", writeMode: "read_only", storagePath: field.key, dataClassification: "public", status: "active" })),
```

and the descriptor lowers `required` as read-only-and-cardinality
(`server/packages/platform/metadata/src/native-runtime-projection.ts:264`):

```ts
        required: field.writeMode !== "read_only" && field.cardinality === "one",
```

so `descriptor.fields[*].required` is `false` for all 22 Country fields regardless of the JSON.

**Why it is wrong.** Nine declarations in the entity's canonical metadata have no runtime effect,
which is exactly the kind of config drift that makes an entity definition misleading during
onboarding review.

**Concrete consequence on the Country route.** No visible change (the detail/list surfaces are
read-only; `surfaceField(field, true)` renders every field non-required,
`server/packages/services/records/src/entity-list-service.ts:785-800`).

**Fix.** Either drop `required` from the shared-reference product schema/parser
(`server/packages/planes/studio/meta-entity-authoring/src/authoring/product.ts:54-56` allows it
for read-only entities), or project it into the descriptor for read-only entities as a
display/validation hint so the declaration is observable.

---

## F7 — In-memory descriptor cache and generation-event machinery are dead in production

**Severity:** low (dead code). **Confidence:** verified.

**Evidence**

`server/packages/platform/metadata/src/metadata-service.ts:71` (`createInMemoryDescriptorCache`),
`:99` (`createMetadataGenerationHandler`) and `:120` (`createInMemoryGenerationCheckpoint`) have
no non-test importers; the only production cache is the Redis one
(`server/apps/platform-host/src/composition/shared/entity-runtime/metadata.ts:25-31`). The
in-memory key omits the invalidation generation entirely
(`server/packages/platform/metadata/src/metadata-service.ts:138-140`):

```ts
function key(coordinate: EntityDescriptorCoordinate): string {
  return `${coordinate.planeKey}\0${coordinate.tenantId}\0${coordinate.entityCode}`;
}
```

**Why it is wrong / risk.** It is ~66 lines of a second caching policy plus a
`MetadataGenerationEvent`/`MetadataGenerationCheckpoint` port pair
(`server/packages/contracts/metadata/src/ports.ts:28-40`) that no deployment wires. If it were
wired by mistake it would serve descriptors for up to the TTL with no generation check (the
generation only exists in the distributed cache), i.e. it is strictly weaker than the live
implementation.

**Concrete consequence on the Country route.** None (unused). Reported as dead code, not a bug.

**Fix.** Delete the in-memory cache + generation handler, or wire them only in tests by moving
them into a test helper so they cannot be selected in composition.

---

## F8 — Entity identity is normalised/validated differently at each layer

**Severity:** low (consistency/generalisation). **Confidence:** verified.

**Evidence**

Canonical identity (client route + HTTP read routes) is lowercase-only,
`packages/contracts/platform/entity-runtime/src/validation/entity-code.ts:6-8`:

```ts
export const ENTITY_CODE_MAX_LENGTH = 63;
const entityCodePattern = /^[a-z][a-z0-9_]{1,62}$/;
export function isCanonicalEntityCode(value: unknown): value is string {
```

The runtime *resource* routes accept a wider, case-insensitive identifier
(`packages/contracts/platform/entity-runtime/src/runtime-values.ts:2-5`):

```ts
export const ENTITY_RUNTIME_KEY_PATTERN = "^[A-Za-z][A-Za-z0-9_.-]{0,126}$";
const keyPattern = new RegExp(ENTITY_RUNTIME_KEY_PATTERN);
export function isEntityRuntimeKey(value: unknown): value is string {
```

and the metadata readers either case-fold or allow a wider alphabet
(`server/packages/platform/metadata/src/compiled-runtime-contract.ts:134-136`,
`server/packages/platform/metadata/src/metadata-service.ts:146-150`), while the migration
fallback deliberately does **not** normalise before deciding between the compiled and legacy
reader (`server/apps/platform-host/src/composition/shared/entity-runtime/metadata-format-reader.ts:8-11`):

```ts
  return { async getEntityDescriptor(context, entityCode) {
    const descriptor = await compiled.getEntityDescriptor(context, entityCode);
    return descriptor ?? native.getEntityDescriptor(context, entityCode);
  } };
```

**Why it is wrong.** The comment in `entity-code.ts` states "Do not trim or case-fold identity",
yet `createCompiledMetadataReader` does exactly that, and a non-canonical code can miss the
compiled release (its artifact keys are lowercase) and fall through to the legacy native
descriptor row — two different metadata sources selected by input casing. In the current
composition the HTTP read route validates `isCanonicalEntityCode`
(`server/packages/services/records/src/entity-list-routes.ts:149-157`), so Country is unaffected;
the hazard is the divergent contract, not an exploitable path today.

**Concrete consequence on the Country route.** None (`country` is canonical).

**Fix.** Use `isCanonicalEntityCode` (no trim/case-fold) in
`createCompiledMetadataReader`/`createMetadataService` and reject non-canonical codes in the
entity-runtime resource routes, or make the runtime-key pattern canonical.

---

## F9 — "Deliberately generic" flow/intake projection hard-codes domain roles and an address field pack

**Severity:** low (generalisation/dead-end coupling). **Confidence:** verified.

**Evidence**

`server/packages/platform/metadata/src/compiled-entity-flow-reader.ts:146-148`:

```ts
  const roles = [...new Set((Array.isArray(selector.content.flowRefs) ? selector.content.flowRefs : [])
    .map(value => typeof value === "string" ? value.split("/").at(-1)?.split(".")[1] : undefined)
    .filter((value): value is string => value === "supplier" || value === "customer"))];
```

`server/packages/platform/metadata/src/compiled-entity-flow-reader.ts:233-236`:

```ts
    surfaces: [{ schemaVersion: 1 as const, key: itemSurfaceKey, title: "Address", columns: 1 as const, sections: [{ key: "fields", fields: [
      input("purpose", "Purpose", "select", { required: true, lookup: { options: options("purposes") }, defaultValue: options("purposes")[0]?.value }),
      input("countryCode", "Country", "select", { required: true, lookup: { options: options("countries") }, normalize: "uppercase" }),
```

**Why it is wrong.** The docblock immediately above claims the projection embeds "no entity
code, request kind, or domain handler" (`:126-130`), yet the role vocabulary and the address
field surface are fixed to the supplier/customer business-partner intake. Any other domain
onboarded onto the same flow reader inherits those labels and fields.

**Concrete consequence on the Country route.** None (Country publishes no flows; the reader is
unused for its read path).

**Fix.** Move the role vocabulary and collection field packs into the flow artifact (or a
registered descriptor port) and keep this function purely structural, or rename it to make the
business-partner coupling explicit instead of claiming generality.

---

## F10 — Dead code & duplication: two registration builders, neither reachable at request time

**Severity:** low (dead code / duplication). **Confidence:** verified.

**Evidence**

`server/apps/platform-host/src/composition/shared/entity-runtime/read-registrations.ts:10-32`
builds registrations whose `handler.invoke` and `resolver.resolve` are never called: the only
consumer type-checks keys and compares operation properties
(`server/packages/contracts/metadata/src/entity-authorization-registry.ts:36-42,70-95`), and the
comment above the file says the reader "is not installed as a backend scope adapter"
(`read-registrations.ts:5-9`). `server/apps/platform-host/src/composition/shared/entity-governance/authorization-registration.ts:12`
(`createEntityAuthorizationRegistrations`) is the governance-side twin of the same idea and has
zero importers (confirming your established fact).

**Why it matters.** The framework now has two overlapping "published profile → callable
registration" builders: one unused, one used only for qualification-key comparison, while the
actual request-time adapter (`createEntityScopeRegistry`,
`server/apps/platform-host/src/composition/shared/entity-runtime/scope-registry.ts:18-48`) is a
third, separate selection path that is itself only reachable through the never-composed
`entityCaseBackendAuthorization` (F1).

**Concrete consequence on the Country route.** None.

**Fix.** Delete `createEntityAuthorizationRegistrations`, and either delete
`createEntityReadRegistrations` or make it the single source of the read admission used by the
backend authorizer, so qualification and enforcement cannot diverge.

---

## Verified healthy (must not be churned)

1. **Profile parsing is strict and complete.** `parseEntityAuthorizationProfile` rejects unknown
   properties, duplicate references, masked-with-queryUses, deferred-vs-executable collisions, and
   — when references are supplied — enforces **exact** field coverage and permission-code binding
   (`server/packages/contracts/metadata/src/entity-authorization.ts:74-107,248-251,262-264,298-305,319-341`).
   `descriptor-parser.ts:59-61` always supplies those references, so every runtime descriptor parse
   re-validates the profile against the descriptor's own operation map.
2. **Qualification actually runs and fails closed.** `parseCompiledRuntimeContract` rejects a
   release with `authorizationRuntime` but no `authorization`, or neither
   (`server/packages/platform/metadata/src/compiled-runtime-contract.ts:34-39`);
   `createEntityAuthorizationRuntimeRegistry.qualify` throws `Unqualified authorization runtime
   binding` on missing/duplicate/mismatched handler/resolver/preflight keys or operation-property
   drift (`server/packages/contracts/metadata/src/entity-authorization-registry.ts:36-42,70-99`),
   and it is invoked during publication loading
   (`server/packages/services/publication/src/publication-artifact-loader.ts:146-152`) and
   authorization compilation
   (`server/packages/services/publication/src/entity-authorization-compiler.ts:168`).
3. **A coarse permission gate still exists for reads (no total fail-open).**
   `descriptor.operations[operation].permissionCode` is required and authorised from the verified
   IAM snapshot (`server/packages/services/records/src/entity-list-service.ts:743-762`,
   `record-read-access.ts:12-33`, `query-service.ts:599-618`), and the operation map is bound to
   the profile's permission codes at parse time.
4. **Compiled query-use flags are policy-derived and enforced independently of `enforced`.**
   `projectFieldQueryAccess` derives `sortable/filterable/searchable` from the published field
   policy (`server/packages/platform/metadata/src/native-runtime-projection.ts:9-15,267`), and
   `validateQueryFields` rejects filter/sort/group/projection on any flag that is not set
   (`server/packages/services/records/src/query-service.ts:648-690`), regardless of profile
   enforcement.
5. **Release/artifact integrity is pinned and re-verified.** `resolveCompiledEntityRelease`
   checks plane admission, pin id/hash, duplicate keys and entity admission
   (`server/packages/platform/metadata/src/artifact-resolution.ts:55-81`);
   `assertResolvedArtifact` re-verifies artifact key/type/entity/hash/plane on every cache read
   (`artifact-resolution.ts:101-115`); cache corruption is discarded, never trusted
   (`compiled-entity-reader.ts:179-207`).
6. **Cache keys are tenant/plane scoped for the live caches.** The distributed descriptor key
   includes plane+tenant+entity plus global and tenant invalidation generations
   (`server/packages/platform/metadata/src/distributed-descriptor-cache.ts:131-150`), and that key
   format matches the Redis generation store used by the invalidation worker
   (`server/packages/adapters/cache-redis/src/invalidation-generation.ts:15-30`);
   compiled artifacts are keyed by release hash + artifact key + content hash
   (`distributed-descriptor-cache.ts:190-196`) and re-verified (item 5); the browser-projection
   cache key includes tenant, principal, access epoch, context, locale, surface, release id/hash
   (`server/packages/platform/metadata/src/authorized-browser-projection.ts:44-59`).
7. **Fallbacks are explicit and fail closed.** Prefix-graph preview is gated to
   `ATHYPER_ENV=local` + local workspace + domain suffix and verifies hash, signature, tenant,
   entity and pinned artifact (`server/packages/platform/metadata/src/local-graph-preview.ts:24-101`);
   the compiled→native metadata bridge falls back on a *miss* only, never on an error
   (`server/apps/platform-host/src/composition/shared/entity-runtime/metadata-format-reader.ts:8-11`),
   and compiled-only planes never fall back
   (`server/apps/platform-host/src/composition/shared/entity-runtime/metadata.ts:44-50`).
8. **Section disclosure is permission-filtered from signed metadata.**
   `planEntityPage` requires a `viewPermission` per section, filters by the granted set from the
   IAM snapshot, and drops navigation tabs/actions whose permissions are absent
   (`server/packages/platform/experience/src/entity-page-planner.ts:88-96,114,141-148`).
9. **Country's three JSON files conform to their parsers.** `definition.json` satisfies the
   `athyper.shared-reference-product/1` key/schema/type rules
   (`server/packages/planes/studio/meta-entity-authoring/src/authoring/product.ts:42-58`), its
   navigation covers every declared section exactly once with matching
   `label`/`localizedLabel.defaultText`
   (`packages/contracts/platform/entity-runtime/src/detail-navigation.ts:38-60`,
   `product.ts:26-33`); `activity.json` resolves to an existing signed profile
   (`metadata/profiles/activity/standard.v2.json`, referenced by
   `server/db/scripts/provisioning/prepare-reference-runtime.ts:30-36`); the comments/attachments
   bindings pass `parseCapabilityBinding` including the literal
   `country/operation#attachmentBinding` reference
   (`server/packages/contracts/publication/src/entity-capabilities.ts:483-490`), and
   `moduleCode: "ent"` is validated against an active `control.module`
   (`server/packages/planes/studio/meta-entity-authoring/src/system-reference-authoring.ts:52,58`).

## Checked but not a defect

- **`metadata-service` cache key omits `principalId`**
  (`server/packages/platform/metadata/src/metadata-service.ts:138-140`). Descriptors are
  tenant/plane/entity artefacts and the principal-pinned local preview path is resolved *before*
  the cache lookup (`:33-52`), so no principal-specific value can be served from the shared entry.
- **`compiledArtifactKey` omits tenant/plane/entity**
  (`server/packages/platform/metadata/src/distributed-descriptor-cache.ts:190-196`). A cross-tenant
  collision requires byte-identical content, and `assertResolvedArtifact` re-checks
  entity/plane/hash after every cache read (`artifact-resolution.ts:101-115`).
- **Experience bootstrap never reads a cached route allowlist when route admission is enabled**
  (`server/packages/platform/experience/src/service.ts:132-134`): `cached` is forced `undefined`
  whenever `readPublishedEntityRoutes` is configured, which production always does
  (`server/apps/platform-host/src/composition/shared/entity-runtime/experience.ts:46-52`), so the
  cache key's lack of a release revision (`:130`) cannot serve stale routes.
- **`createEntityScopeRegistry` is wildcard-free and fail-closed**
  (`server/apps/platform-host/src/composition/shared/entity-runtime/scope-registry.ts:16-48`):
  unknown plane/entity/resolver/operation/target yields `{state:"invalid"}` and preflight yields
  `"workflow_blocked"`. It is simply unreachable today (F1).
- **`assertCommonReferenceDescriptor` in `descriptor-parser` / `native-runtime-projection` is
  data-driven** (only applied when the graph/descriptor actually claims the reference capability,
  `descriptor-parser.ts:31-35`, `native-runtime-projection.ts:121-123`), so it does not
  over-constrain non-reference descriptors.
- **`entity-operation-dispatcher` checks the published operation permission from the live IAM
  snapshot** (`server/packages/platform/experience/src/entity-operation-dispatcher.ts:137-145`).
  Country publishes no operations, so the route is not reachable for it.
- **`createEntityReadRegistrations` resolver duplicates a query-service call**
  (`read-registrations.ts:14-26`) but is never invoked (F10), so it cannot recurse or double-read.
- **`Kysely LIKE` escaping and `fieldPath` validation** (your established facts) were treated as
  out of this area and not re-reported.

## Dead code / duplication / naming identified separately from defects

| Kind | Location | Note |
| --- | --- | --- |
| dead code | `server/apps/platform-host/src/composition/shared/entity-runtime/metadata-validation.ts:14` | `createEntityMetadataHooks` has zero importers (confirms your fact: `requiredCoordinates` unenforced). |
| dead code | `server/apps/platform-host/src/composition/shared/entity-governance/authorization-registration.ts:12` | `createEntityAuthorizationRegistrations` has zero importers; duplicates F10. |
| dead registration bodies | `server/apps/platform-host/src/composition/shared/entity-runtime/read-registrations.ts:14-32` | `handler.invoke`/`resolver.resolve` never called; only keys/properties are compared at qualification. |
| dead code | `server/packages/platform/metadata/src/metadata-service.ts:71,99,120` | In-memory descriptor cache + generation handler/checkpoint, test-only (F7). |
| dead client surface | `packages/platform/entity/runtime/descriptor-client/src/runtime-client.ts:129-163` | `entityRuntimeClient.bootstrap` has no caller; only `section`/`collaboration` are used. Should be either wired or removed with F4's fix. |
| dead declaration | `metadata/products/shared/entities/country/definition.json:38,47,56,137,154,171,180,197,206` | `required` is inert for read-only reference fields (F6). |
| dead declaration | `metadata/products/shared/entities/country/capabilities.json:109` | `attachments.bindingRef` is validation-only (must equal the literal), never used for lookup. |
| hard-coded vocabulary | `server/packages/platform/metadata/src/compiled-entity-flow-reader.ts:146-148,208-249` | supplier/customer roles and address/contact field packs in a "generic" projection (F9). |
| naming drift | `server/packages/contracts/platform/entity-runtime/src/runtime-values.ts:2` vs `.../validation/entity-code.ts:6` | Two entity-identity contracts (loose, case-insensitive vs canonical lowercase) (F8). |

## Coverage

Static read of all 33 files in `server/packages/platform/metadata/src/**` (including tests/index),
all 39 files in `server/packages/platform/experience/src/**`, `server/packages/contracts/metadata/src/entity-authorization*.ts`
plus `common-reference-permission.ts`/`ports.ts`, all 25 files in
`server/apps/platform-host/src/composition/shared/entity-runtime/**` and all 10 in
`.../entity-governance/**`, and the three Country JSON files. Enforcement was additionally traced
through `register-services.ts`, `bootstrap.ts`, `authority.ts`, `publication-artifact-loader.ts`,
`entity-authorization-compiler.ts`, `entity-backend-authorizer.ts`, `record-read-access.ts`,
`query-service.ts`, `entity-list-service.ts`, `entity-list-routes.ts`, `native-runtime.ts`,
`graph-builder.ts`/`product.ts` and the client read route (`entity-read-route.tsx`,
`entity-detail-runtime.tsx`, `runtime-client.ts`, `entity-list.ts`). No runtime execution was
performed; all findings are source-derived.
