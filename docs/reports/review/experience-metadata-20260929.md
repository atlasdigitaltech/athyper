# Experience / Metadata / Collaboration review — 2026-09-29

Read-only review of the current working tree (large uncommitted refactor in flight; `git status --porcelain` shows
87 modified/deleted paths, one of them inside scope: `server/packages/platform/experience/src/entity-section-service.ts`).

Method: every `.ts`/`.tsx` file under the five in-scope trees was read in full by line-numbered reads (test files included).
Cross-package evidence (host composition, DDL, and the records service) was consulted only to judge exploitability of
findings inside scope. No builds, no servers, no source modifications.

Scope size: **114 files / 15,856 lines** (experience 39/6,945 · platform metadata 33/3,597 · contracts metadata 24/2,089 ·
platform collaboration 15/3,083 · contracts collaboration 3/142).

## Coverage

| file | lines | verdict |
| --- | --- | --- |
| server/packages/platform/experience/src/contracts.ts | 244 | clean |
| server/packages/platform/experience/src/effective-collaboration-controls.ts | 51 | clean |
| server/packages/platform/experience/src/effective-collaboration-controls.test.ts | 64 | clean |
| server/packages/platform/experience/src/entity-activity-policy.ts | 62 | clean |
| server/packages/platform/experience/src/entity-activity-policy.test.ts | 68 | clean |
| server/packages/platform/experience/src/entity-activity-routes.ts | 153 | clean |
| server/packages/platform/experience/src/entity-activity-routes.test.ts | 92 | clean |
| server/packages/platform/experience/src/entity-activity-service.ts | 323 | clean |
| server/packages/platform/experience/src/entity-activity-service.test.ts | 220 | clean |
| server/packages/platform/experience/src/entity-capability-policy.ts | 347 | findings 1 |
| server/packages/platform/experience/src/entity-capability-policy.test.ts | 280 | clean |
| server/packages/platform/experience/src/entity-collaboration-service.ts | 56 | clean |
| server/packages/platform/experience/src/entity-collaboration-service.test.ts | 91 | clean |
| server/packages/platform/experience/src/entity-intake-operation-routes.ts | 109 | clean |
| server/packages/platform/experience/src/entity-intake-operation-routes.test.ts | 58 | clean |
| server/packages/platform/experience/src/entity-operation-admission.test.ts | 67 | clean |
| server/packages/platform/experience/src/entity-operation-dispatcher.ts | 369 | findings 1 |
| server/packages/platform/experience/src/entity-operation-dispatcher.test.ts | 271 | clean |
| server/packages/platform/experience/src/entity-page-planner.ts | 190 | clean |
| server/packages/platform/experience/src/entity-page-planner.test.ts | 149 | clean |
| server/packages/platform/experience/src/entity-route-admission.ts | 39 | clean |
| server/packages/platform/experience/src/entity-route-admission.test.ts | 17 | clean |
| server/packages/platform/experience/src/entity-runtime-collection.ts | 15 | clean |
| server/packages/platform/experience/src/entity-runtime-contracts.ts | 15 | clean |
| server/packages/platform/experience/src/entity-runtime-pagination.test.ts | 19 | clean |
| server/packages/platform/experience/src/entity-runtime-routes.ts | 70 | clean |
| server/packages/platform/experience/src/entity-section-service.ts | 376 | findings 3 |
| server/packages/platform/experience/src/entity-section-service.test.ts | 183 | clean |
| server/packages/platform/experience/src/index.ts | 20 | clean |
| server/packages/platform/experience/src/neon-action-policy-registry.ts | 24 | clean |
| server/packages/platform/experience/src/ports.ts | 1 | clean |
| server/packages/platform/experience/src/published-summary-service.ts | 180 | clean |
| server/packages/platform/experience/src/published-summary-service.test.ts | 120 | clean |
| server/packages/platform/experience/src/record-participants.ts | 48 | findings 1 |
| server/packages/platform/experience/src/record-participants.test.ts | 60 | clean |
| server/packages/platform/experience/src/routes.ts | 98 | clean |
| server/packages/platform/experience/src/routes.test.ts | 57 | clean |
| server/packages/platform/experience/src/service.ts | 1893 | clean |
| server/packages/platform/experience/src/service.test.ts | 446 | clean |
| server/packages/platform/metadata/src/__tests__/activity-reader.test.ts | 61 | clean |
| server/packages/platform/metadata/src/__tests__/authorized-browser-projection.test.ts | 35 | clean |
| server/packages/platform/metadata/src/__tests__/capability-profile-reader.test.ts | 42 | clean |
| server/packages/platform/metadata/src/__tests__/collection-relationship.test.ts | 11 | clean |
| server/packages/platform/metadata/src/__tests__/compiled-entity-flow-reader.test.ts | 38 | clean |
| server/packages/platform/metadata/src/__tests__/compiled-entity-reader.test.ts | 120 | clean |
| server/packages/platform/metadata/src/__tests__/compiled-runtime-contract.test.ts | 277 | clean |
| server/packages/platform/metadata/src/__tests__/compiled-source-tenant.test.ts | 135 | clean |
| server/packages/platform/metadata/src/__tests__/dev-publication-resolution.test.ts | 40 | clean |
| server/packages/platform/metadata/src/__tests__/directory-scope.test.ts | 14 | clean |
| server/packages/platform/metadata/src/__tests__/entity-ai.test.ts | 29 | clean |
| server/packages/platform/metadata/src/__tests__/entity-authorization.test.ts | 119 | clean |
| server/packages/platform/metadata/src/__tests__/intake-projection.test.ts | 110 | clean |
| server/packages/platform/metadata/src/__tests__/invalidation.test.ts | 79 | clean |
| server/packages/platform/metadata/src/__tests__/metadata-service.test.ts | 81 | clean |
| server/packages/platform/metadata/src/__tests__/native-field-writes.test.ts | 28 | clean |
| server/packages/platform/metadata/src/__tests__/native-list-application.test.ts | 78 | clean |
| server/packages/platform/metadata/src/__tests__/query-access.test.ts | 12 | clean |
| server/packages/platform/metadata/src/artifact-resolution.ts | 120 | clean |
| server/packages/platform/metadata/src/authorized-browser-projection.ts | 106 | clean |
| server/packages/platform/metadata/src/compiled-entity-flow-reader.ts | 281 | clean |
| server/packages/platform/metadata/src/compiled-entity-reader.ts | 224 | clean |
| server/packages/platform/metadata/src/compiled-runtime-contract.ts | 146 | clean |
| server/packages/platform/metadata/src/descriptor-parser.ts | 291 | clean |
| server/packages/platform/metadata/src/distributed-descriptor-cache.ts | 203 | findings 1 |
| server/packages/platform/metadata/src/distributed-descriptor-cache.test.ts | 44 | clean |
| server/packages/platform/metadata/src/index.ts | 11 | clean |
| server/packages/platform/metadata/src/intake-projection.ts | 1 | clean |
| server/packages/platform/metadata/src/intake-surface-projection.ts | 1 | clean |
| server/packages/platform/metadata/src/invalidation.ts | 205 | findings 1 |
| server/packages/platform/metadata/src/metadata-service.ts | 151 | findings 2 |
| server/packages/platform/metadata/src/native-runtime-projection.ts | 328 | findings 2 |
| server/packages/platform/metadata/src/runtime-descriptor-repository.ts | 176 | clean |
| server/packages/contracts/metadata/src/__tests__/api.test.ts | 10 | clean |
| server/packages/contracts/metadata/src/__tests__/atlas-learning.test.ts | 20 | clean |
| server/packages/contracts/metadata/src/__tests__/entity-ai.test.ts | 71 | clean |
| server/packages/contracts/metadata/src/__tests__/entity-authorization.test.ts | 121 | clean |
| server/packages/contracts/metadata/src/__tests__/entity-canonical-read-admission.test.ts | 209 | clean |
| server/packages/contracts/metadata/src/__tests__/field-pattern.test.ts | 8 | clean |
| server/packages/contracts/metadata/src/atlas-learning.ts | 33 | clean |
| server/packages/contracts/metadata/src/collection-compilation.ts | 29 | clean |
| server/packages/contracts/metadata/src/collection-relationship.ts | 36 | clean |
| server/packages/contracts/metadata/src/common-reference-permission.ts | 61 | clean |
| server/packages/contracts/metadata/src/descriptors.ts | 348 | clean |
| server/packages/contracts/metadata/src/directory-scope.ts | 30 | clean |
| server/packages/contracts/metadata/src/entity-ai.ts | 179 | clean |
| server/packages/contracts/metadata/src/entity-authorization-registry.ts | 102 | clean |
| server/packages/contracts/metadata/src/entity-authorization-runtime.ts | 160 | clean |
| server/packages/contracts/metadata/src/entity-authorization.ts | 343 | clean |
| server/packages/contracts/metadata/src/entity-canonical-read-admission.ts | 108 | clean |
| server/packages/contracts/metadata/src/field-pattern.ts | 41 | clean |
| server/packages/contracts/metadata/src/identity-permissions.ts | 14 | clean |
| server/packages/contracts/metadata/src/index.ts | 32 | clean |
| server/packages/contracts/metadata/src/ports.ts | 40 | clean |
| server/packages/contracts/metadata/src/record-mutation-policy.ts | 20 | clean |
| server/packages/contracts/metadata/src/record-owner-access.ts | 41 | clean |
| server/packages/contracts/metadata/src/record-predicates.ts | 33 | clean |
| server/packages/platform/collaboration/src/__tests__/attachment-file-rich-text.test.ts | 11 | clean |
| server/packages/platform/collaboration/src/__tests__/collaboration-repository.test.ts | 175 | clean |
| server/packages/platform/collaboration/src/__tests__/collaboration-routes.test.ts | 136 | clean |
| server/packages/platform/collaboration/src/__tests__/collaboration-service.test.ts | 763 | clean |
| server/packages/platform/collaboration/src/__tests__/entity-coordinate.test.ts | 13 | clean |
| server/packages/platform/collaboration/src/__tests__/history-admission.test.ts | 62 | clean |
| server/packages/platform/collaboration/src/collaboration-routes.ts | 311 | findings 1 |
| server/packages/platform/collaboration/src/collaboration-service.ts | 680 | clean |
| server/packages/platform/collaboration/src/draft-maintenance.ts | 56 | findings 1 |
| server/packages/platform/collaboration/src/entity-coordinate.ts | 11 | clean |
| server/packages/platform/collaboration/src/errors.ts | 3 | clean |
| server/packages/platform/collaboration/src/in-memory-collaboration-repository.ts | 304 | clean |
| server/packages/platform/collaboration/src/index.ts | 9 | clean |
| server/packages/platform/collaboration/src/kysely-collaboration-repository.ts | 304 | clean |
| server/packages/platform/collaboration/src/rich-text.ts | 245 | findings 1 |
| server/packages/contracts/collaboration/src/collaboration.ts | 117 | clean |
| server/packages/contracts/collaboration/src/index.ts | 2 | clean |
| server/packages/contracts/collaboration/src/ports.ts | 23 | clean |

Findings by file: entity-section-service.ts 3, entity-capability-policy.ts 1, entity-operation-dispatcher.ts 1,
record-participants.ts 1, native-runtime-projection.ts 2, invalidation.ts 1, metadata-service.ts 2,
distributed-descriptor-cache.ts 1, collaboration-routes.ts 1, draft-maintenance.ts 1, rich-text.ts 1 → **13 findings**.
No critical findings.

## Findings

### [medium] Section capability admission is keyed on `rendererKey`, while handler dispatch is keyed on an unvalidated `dataBinding.serviceKey`
Location: server/packages/platform/experience/src/entity-section-service.ts:183
What is wrong: the capability gate for the two record capabilities is derived only from the section's `rendererKey`;
the handler that actually reads rows is selected from `dataBinding.serviceKey`. If a published section declares
`dataBinding.serviceKey = "platform.comments.v1"` but any other `rendererKey`, `kind` is `undefined`, so
`capabilities.resolve(...)` is never called and the reader runs with `capability: undefined`. Only the surface's
`viewPermission` (page-plan filter at line 180-181) is then enforced.
Evidence:
```ts
183:      const kind=section.content.rendererKey==="platform.comments.v1"?"comments":section.content.rendererKey==="platform.attachments.v1"?"attachments":undefined;
185:        throw new EntityRuntimeResourceError(403, "ENTITY_RUNTIME_RESOURCE_INVALID");
186:      const capability=kind && options.capabilities ? await options.capabilities.resolve({...input,kind,action:"read"},model.release) : undefined;
187:      if(kind && !capability) throw new EntityRuntimeResourceError(403,"ENTITY_CAPABILITY_DENIED");
188:      const handler = sectionHandler(options.sections, section);
```
```ts
259:  if (value.kind === "registered_service" && typeof value.handlerKey === "string") return registry.get(value.handlerKey);
260:  if (typeof value.serviceKey === "string") return registry.getService?.(value.serviceKey);
```
The publication validator only cross-checks the two fields for sections whose rendererKey already equals
`platform.<kind>.v1` (`server/packages/contracts/publication/src/entity-capabilities.ts:565`), and the generic artifact
registry check validates `handlerKey`/`rendererKey`/`resolverKey`/`evaluatorKey` but **not** `dataBinding.serviceKey`
(`server/packages/contracts/publication/src/artifact.ts:330`).
Impact scenario: a capability section published with a mismatched pair still resolves to the comments reader
(`section-providers.ts:16`), which returns rows filtered only by SQL visibility
(`... AND (comment.visibility IN ('public','internal') OR comment.commenter_id=<principal>)`,
`server/apps/platform-host/src/composition/shared/collaboration/comments.ts:70`). A principal holding the section's
`viewPermission` but lacking the capability read action permission (e.g. `collaboration.comment.read`, which the
capability binding requires) then receives `internal` comments. The mismatch should be impossible through the compiler,
but nothing at read time or at publication time forces the two fields to agree.
Suggested fix: derive both authorization kind and handler from one field (map `dataBinding.serviceKey` →
`comments`/`attachments` and drop the `rendererKey` switch), or reject at publication any section whose
`dataBinding.serviceKey` is a capability service but whose `rendererKey` differs.

### [medium] Section responses return the raw `data` payload next to the visibility-filtered `presentation`
Location: server/packages/platform/experience/src/entity-section-service.ts:224
What is wrong: `browserSectionPresentation` computes the admitted field plan (including `dynamicFacets` visibility
filtering at lines 268-271 and 340-351), but the same response also spreads the reader's raw `...result`, so every
value the reader returned is sent to the browser regardless of the field plan. Protections only decorate the plan
(lines 294-305) and never remove values.
Evidence:
```ts
224:      return Object.freeze({
225:        releaseId: model.release.release.releaseId,
226:        releaseHash: model.release.release.releaseHash,
227:        sectionKey: input.sectionKey,
228:        presentation: browserSectionPresentation(cores.get(String(section.content.coreRef)) ?? model.core, section, result.data, cores),
229:        ...(capability ? {capability:capability.projection} : {}),
230:        ...result,
231:      });
```
```ts
270:  const hidden = new Set(array(core.content.fields).flatMap(value =>
271:    record(value) && typeof value.key === "string" && !fieldVisible(value, values) ? [value.key] : []));
```
The behaviour is locked in by the package's own test:
`server/packages/platform/experience/src/entity-section-service.test.ts:74`
`expect(result?.data).toEqual({values:{ownership_class:"external"}});` (asserted on a section whose fields were
filtered by `dynamicFacets` visibility in the sibling tests).
Impact scenario: a field published with a `visibility` facet (e.g. show `legal_name` only when
`record.partner_category == "organization"`) is omitted from `presentation.fields` but is still present in
`data.values` of the HTTP body; any client, log or cache that reads `data` sees the hidden value. The in-file comment
at lines 338-339 says the facet "is never a substitute for the registered reader's field authorization", so impact
depends on each reader, but the response shape makes the filtered plan advisory rather than authoritative.
Suggested fix: build `data` from the same admitted key set (project only keys present in `presentation.fields` /
`childCollections.rowFields`), or drop `data` for sections that carry visibility facets.

### [medium] Native lowering silently discards published `validation_spec` rules
Location: server/packages/platform/metadata/src/native-runtime-projection.ts:257
What is wrong: the field projection builds `validation` exclusively from `typeConfig` keys and never reads the
authored, database-validated `validation_spec` rule collection, so authoring rules are not enforced by the record
write path.
Evidence:
```ts
257:      const constraints=Object.fromEntries(Object.entries({minLength:field.typeConfig?.min_length,maxLength:field.typeConfig?.max_length,pattern:field.typeConfig?.pattern,minimum:field.typeConfig?.minimum,maximum:field.typeConfig?.maximum}).filter(([,value])=>value!==undefined));
260:        ...(Object.keys(constraints).length ? {validation:{...choices.validation,...constraints}} : {}),
```
The native field row does carry the authored rules (`validationSpec` is in the native field projection list,
`server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.ts:897`), the DB enforces their
contract (`server/db/ddl/planes/studio/metadata/07_functions.sql:770-800`: kinds `length`, `range`, `pattern`,
`allowed_values`, `comparison`, `custom_handler`), and the intake path does consume them
(`packages/contracts/platform/entity-runtime/src/intake-surface-authoring.ts:105,148-150`). `validationSpec` appears
nowhere in native-runtime-projection.ts.
Impact scenario: a field authored with `{kind:"pattern",parameters:{pattern:"^[A-Z]{2}$"}}` or
`{kind:"range",parameters:{minimum:0}}` is published with no runtime constraint; `validateRecordInput`
(`server/packages/services/records/src/field-validation.ts:21-36`) only reads `field.validation`, so record
create/patch accepts values the entity's own authoring and intake surface reject — validation fails open and differs
between the intake and record paths for the same field.
Suggested fix: translate `validationSpec.rules` (honouring `severity`) into descriptor `validation`
(`options`/`minLength`/`maxLength`/`minimum`/`maximum`/`pattern`) and reject unsupported rule kinds at publication.

### [low] Every single-valued writable field is projected as `required`
Location: server/packages/platform/metadata/src/native-runtime-projection.ts:264
What is wrong: requiredness is inferred from writability instead of any authored optionality signal (the
`metadata.entity_field` row has no nullable column, and `validation_spec` has no `required` rule kind), so an optional
writable column becomes mandatory.
Evidence:
```ts
264:        required: field.writeMode !== "read_only" && field.cardinality === "one",
```
Impact scenario: `required` is enforced on create (`server/packages/services/records/src/field-validation.ts:14`:
`if (field.required && input[field.key] === undefined) ... "FIELD_REQUIRED"`), and `null` is rejected for required
fields (line 18). A descriptive/optional writable column therefore has to be supplied on every create (or the create
is rejected), and the generated forms/import templates mark it mandatory
(`entity-list-service.ts:811`, `transfer-service.ts:666`).
Suggested fix: take optionality from an explicit registration/metadata input (or the storage column's nullability)
rather than from `writeMode`, and default to `false` when unknown.

### [medium] Cached descriptors are served without re-checking the requested coordinate
Location: server/packages/platform/metadata/src/metadata-service.ts:53 · server/packages/platform/metadata/src/distributed-descriptor-cache.ts:160
What is wrong: the fresh read path rejects a repository result whose entity/plane disagrees with the coordinate, but
the cache-hit path returns before that check; and the distributed cache's own validation rebuilds the coordinate
*from the cached value*, making the parser's comparison a tautology.
Evidence:
```ts
53:      const cached = await options.cache?.get(coordinate);
54:      if (cached !== undefined) return cached;
...
56:      if (
57:        descriptor &&
58:        (descriptor.entityCode !== coordinate.entityCode ||
59:          descriptor.planeKey !== coordinate.planeKey)
60:      ) {
61:        throw new Error("Plane-local metadata repository returned a mismatched descriptor");
62:      }
```
```ts
160:function validateDescriptor(value: unknown): EntityRuntimeDescriptor {
...
163:  return parseEntityRuntimeDescriptor({
164:    entity_code: String(candidate.entityCode ?? ""),
...
168:    plane_code: String(candidate.planeKey ?? ""),
```
Impact scenario: a wrong/cross-entity descriptor written under a valid cache key (repo bug, manual Redis write, or a
future key-format change) is returned for any caller of that key, including its storage bindings
(`schema`/`object`/`idField`/`tenantField`) and field list — i.e. the read path would query another entity's table for
this tenant. The fresh path treats exactly this condition as a hard error, so the cache path is weaker than the
non-cached path.
Suggested fix: compare `cached.entityCode`/`cached.planeKey` (and, in the distributed cache, the parsed
`releaseId`) with the requested coordinate before returning, and fail the read rather than silently substituting.

### [medium] Unbounded `leasedKinds` map in the invalidation repository
Location: server/packages/platform/metadata/src/invalidation.ts:39
What is wrong: `claim()` records the kind of every leased row in a module-level map that is only ever read
(`requireKind`), never pruned, so a long-lived worker accumulates one entry per invalidation forever.
Evidence:
```ts
39:  const leasedKinds = new Map<string, InvalidationKind>();
...
57:      for (const item of result) leasedKinds.set(item.id, item.kind);
...
61:      const kind = requireKind(leasedKinds, id);
...
77:      const kind = requireKind(leasedKinds, input.id);
...
184:function requireKind(
185:  kinds: Map<string, InvalidationKind>,
186:  id: string,
187:): InvalidationKind {
188:  const kind = kinds.get(id);
189:  if (!kind) throw new Error("INVALIDATION_LEASE_UNKNOWN");
190:  return kind;
191:}
```
Impact scenario: the metadata invalidation worker is a continuous poller; with `limit` up to 500 per claim and a
durable outbox that never empties (backlog, dead letters, or a second worker taking the lease), the map grows without
bound until the process is restarted — a slow memory leak in a hot loop. Entries for claims whose lease is lost are
never removed either.
Suggested fix: `leasedKinds.delete(id)` in both `complete` and `fail` (including the early-return paths), or persist
`kind` on the outbox row and stop caching leases in process memory.

### [medium] Mention-candidate narrowing trusts a client-supplied visibility
Location: server/packages/platform/experience/src/record-participants.ts:26 · server/packages/platform/collaboration/src/collaboration-routes.ts:48
What is wrong: the "private audience ⇒ author only" narrowing is driven by `input.input?.visibility`, which on the
HTTP surface is the caller's own query parameter; the server never derives the effective audience of the comment
being composed for the candidate-search path (it does derive it for `validate`, see
`entity-capability-policy.ts:183`).
Evidence:
```ts
26:        if (
27:          input.input?.visibility === "private" &&
28:          candidate.id !== input.context.principalId
29:        )
30:          continue;
```
```ts
48:  if(o.collaboration.participants) app.get("/api/collab/participants",o.authenticate,route(async(r,c)=>({body:{items:await o.collaboration.participants!({context:c,...coordinate(r.query),query:typeof r.query.q==="string"?r.query.q:"",visibility:one(r.query.visibility,["public","internal","private"] as const) ?? "private"})}})));
```
Impact scenario: while composing a comment on a private thread the UI sends `visibility=private` and is narrowed to
self; a client that sends `visibility=public` (or omits it and relies on the published default) receives every
candidate that passes `admit()` — i.e. the display name/username of every principal who can read the record (host
admission rebuilds a baseline subject per candidate,
`server/apps/platform-host/src/composition/register-services.ts:1654-1665`). Comment bodies are not exposed, but the
participant roster of a record is, which is exactly what the private narrowing exists to prevent.
Suggested fix: pass the server-resolved audience (parent comment visibility for replies, effective binding default
otherwise) into the participant search instead of the caller-supplied value, or require the caller to name a comment
whose stored visibility the server resolves itself.

### [low] Summary-card failures are flattened to `unavailable` with no detection signal
Location: server/packages/platform/experience/src/entity-section-service.ts:160
What is wrong: every error raised by `handler.read` (and by enum-label hydration, which throws the 503
`ENTITY_ENUM_LABEL_UNAVAILABLE`) is converted to a benign card state without logging or distinguishing
infrastructure/publication faults from provider absence; the only special case is any error carrying `status === 409`.
Evidence:
```ts
160:        } catch (error) {
161:          if (isContextRequired(error)) return Object.freeze({ key: card.key, state: "context_required" as const });
162:          return Object.freeze({ key: card.key, state: "unavailable" as const });
163:        }
```
```ts
240:function isContextRequired(error: unknown): boolean {
241:  return !!error && typeof error === "object" && (error as { status?: unknown }).status === 409;
242:}
```
Impact scenario: a broken enum-label publication or a summary provider outage makes the card silently disappear from
the page with no error metric and no operator signal; a provider that legitimately throws a 409 for an unrelated
conflict is mislabelled "select a business context". The section path re-throws (lines 193-199), so the two surfaces
report the same class of failure differently.
Suggested fix: re-throw (or at least record) non-provider errors such as `EntityRuntimeResourceError(503)` and only
downgrade explicit "provider missing/denied" outcomes; keep a narrow error code check instead of a bare `status` test.

### [low] Operation input validation covers only part of the published JSON schema
Location: server/packages/platform/experience/src/entity-operation-dispatcher.ts:247
What is wrong: `validateInput` checks presence, `additionalProperties: false`, and only the `string`/`integer`/
`boolean`/`object` types plus a literal `enum` array; other declared constraints are ignored, so handlers receive
shapes the published schema forbids.
Evidence:
```ts
256:    if (
257:      (type === "string" && typeof value !== "string") ||
258:      (type === "integer" &&
259:        (!Number.isInteger(value) || typeof value !== "number")) ||
260:      (type === "boolean" && typeof value !== "boolean") ||
261:      (type === "object" && !record(value))
262:    )
```
Impact scenario: an operation published with `type: "array"` or `"number"`, or with `minimum`/`maxLength`/`pattern`/
`oneOf`/`const`, accepts any value of any type; the domain handler then performs its own casts (the dispatcher passes
`input.input` through unchanged) or writes an invalid value, turning a publication constraint into a runtime gap.
Suggested fix: validate against the published schema with the shared runtime validator, or extend this function to
cover arrays/numbers/nulls and the numeric/string/enum constraint keywords.

### [low] Rich-text documents are persisted verbatim
Location: server/packages/platform/collaboration/src/rich-text.ts:50
What is wrong: validation walks the tree but the *original* object is stored and echoed back, so attributes the
validator never inspects are persisted in `content_json` and returned to clients; only the server-rendered `html` is
built from the validated fields and escaped.
Evidence:
```ts
40:  const root = value as unknown as RichTextNode;
...
49:  validateNode(root, state, 0, true);
50:  const document = value as RichTextDocument;
```
`validateNode` checks node `type`, a few required attrs (`principalId`, `attachmentId`), dimensions, marks and
`link.attrs.href` (lines 91-152); it does not reject unknown `attrs` keys on any node nor unknown `mark.attrs`.
Impact scenario: a client can park arbitrary JSON (including keys such as `onclick`, `src`, or very long strings
inside `attrs`) inside a stored comment; today the shared HTML renderer ignores them, but any consumer that
re-renders `content_json` client-side inherits an untrusted shape, and the stored payload diverges from the published
`athyper.rich-text/1.0` schema it claims.
Suggested fix: rebuild the document from a validated allowlist of node types and attributes instead of casting the
input, and reject unknown attributes.

### [low] Capability admission re-authorizes every binding action on every call
Location: server/packages/platform/experience/src/entity-capability-policy.ts:258
What is wrong: after admitting the requested action, `resolve` loops over `binding.actions × scopeResources` and calls
the authorizer for each candidate, even though callers only need the requested action plus the projected action list;
the loop re-runs the request-scoped action's authorize call a second time.
Evidence:
```ts
258:      const allowed = new Set<string>();
259:      for (const candidate of binding.actions) {
262:        for (const scopeResource of scopeResources) {
263:          if ((await options.authorizer.authorize({
264:            context: input.context,
265:            permissionCode: candidate.permissionCode,
266:            resource: { ...baseResource, ...scopeResource },
267:          })).allowed) {
```
Impact scenario: this runs on every comments/attachments section read and every capability operation
(`entity-collaboration-service.read` line 40), on top of the earlier per-action loop at lines 140-150; with ~10 actions
and 2 parent scopes that is ~20 authorizer round-trips per request before any row is read.
Suggested fix: authorize the requested action only, and compute the projected action list once per request
(or on capability-configuration change) instead of per call.

### [low] Expired-draft maintenance issues extra round trips per attachment and skips audit columns
Location: server/packages/platform/collaboration/src/draft-maintenance.ts:40
What is wrong: after the bulk `UPDATE ... RETURNING`, each returned attachment is re-selected and then updated again
in a separate statement, and that second update omits `updated_at`/`updated_by` although it mutates `is_active`.
Evidence:
```ts
34:        await sql`SELECT id FROM document.attachment WHERE tenant_id=${draft.tenant_id}::uuid AND id=${row.id}::uuid AND status='orphaned'`.execute(
...
40:        await sql`UPDATE document.attachment SET is_active=false WHERE tenant_id=${draft.tenant_id}::uuid AND id=${row.id}::uuid`.execute(
```
Impact scenario: 2 extra statements per orphaned attachment (up to ~300 statements per maintenance batch) and an
`is_active` change with a stale `updated_at`, unlike the sibling statement at line 29 that stamps both columns — an
audit-trail gap for retention/forensics.
Suggested fix: fold the `status='orphaned'` test into the first `UPDATE ... RETURNING` (CASE expression) and set
`updated_at=clock_timestamp(), updated_by=...` on the second update; or drop the second statement by returning the
new `is_active` value.

### [low] Generation invalidation advances the checkpoint before invalidating the cache
Location: server/packages/platform/metadata/src/metadata-service.ts:110
What is wrong: the durable generation event is consumed (`advance`) before the cache invalidation is attempted; if
`invalidate` throws, the redelivered event returns `false` and the cache is never invalidated.
Evidence:
```ts
110:    const advanced = await options.checkpoint.advance(
111:      coordinate,
112:      event.generation,
113:      event.eventId,
114:    );
115:    if (advanced) await options.cache.invalidate(coordinate);
116:    return advanced;
```
Impact scenario: a transient cache failure (Redis blip) leaves stale descriptors in place for every consumer until the
TTL (default 60s, `metadata-service.ts:22`) expires, and the retried event is a no-op, so the failure is not
self-healing and not reported.
Suggested fix: invalidate (best-effort, with retry/dead-letter) before advancing, or record the invalidation failure
and retry the invalidation independently of the checkpoint.

## Checked and clean

Verified as correct while looking for the classes of defect in the brief:

- **Exact-plane and identity admission** (`service.ts:1062-1075, 1859-1893`): plane/tenant/principal/profile snapshot
  binding is asserted before repository access, and every locale/surface/bootstrap path re-checks identity, realm,
  tenant status, principal status/epoch, binding and membership. Cross-plane reads/writes require Studio catalog
  authority (`service.ts:276-312`). `service.test.ts:386-399` exercises the mismatch path with a repository stub that
  throws, proving no repository access precedes the check.
- **Cache identity and races** (`service.ts:130-133, 1046-1058`; test `service.test.ts:417-439`): the experience
  bootstrap key carries plane, tenant, principal, auth epoch, profile hash, client version, entitlement revision,
  feature revision and runtime configuration revision, with tag-based invalidation plus an `expectedGeneration` guard
  that prevents a pre-invalidation request from repopulating the cache after a locale write. The compiled-IR reader
  deliberately omits principal from `releaseKey` (immutable, tenant/plane/preview scoped,
  `compiled-entity-reader.ts:211-216`) and never caches an unpinned activation head (lines 170-190, test
  `compiled-entity-reader.test.ts:47-57`). `authorizedBrowserProjectionCacheKey` includes tenant, principal, access
  epoch, context, locale, entity, surface, releaseId and releaseHash
  (`authorized-browser-projection.ts:44-59`). The artifact cache is content-addressed and every hit is re-verified
  against the pinned release entry (`artifact-resolution.ts:101-115`, `compiled-entity-reader.ts:192-208`).
- **Ordering determinism**: all experience adapter queries (`server/packages/adapters/experience-postgres/src/index.ts`)
  carry `ORDER BY` (`f.code`; `c.code,c.id`; `le.code,le.id`; `hierarchy.path,organization.code,...`), and
  `resolveWorkspaces`/`resolveFeatures` sort their inputs before folding into maps
  (`service.ts:1718-1753, 1755-1803`), so Map/object iteration order is stable and the derived `revision`/ETag does not
  flap between identical requests. `entity-page-planner` preserves published section order.
- **Audience rules** (`entity-capability-policy.ts:308-346`): reply audiences can only narrow
  (`width[requested] <= width[parent]`), private is author-only, internal requires a current record participant,
  target/parent comments must belong to the same entity+record, mentions are denied when no `validateMentions` is
  configured, `history` is restricted to the author, and the effective (stored) visibility is what is handed to
  `validateMentions` for replies to a private parent (test `entity-capability-policy.test.ts:258-263`).
- **Collaboration data access**: the comment reader filters `visibility IN ('public','internal') OR author = principal`
  and enforces tenant/entity/record coordinates in SQL; history requires `commenter_id = principal`; reactions,
  flags, drafts, attachments, retention/orphan handling and draft-scope isolation are tenant-scoped and
  author-scoped; `rich-text` rejects unsafe links (`javascript:`), unknown node types, oversized/deep documents and
  escapes text/attributes in the derived HTML (tests `collaboration-service.test.ts:229-350`).
- **`ON CONFLICT` targets are satisfiable with NULL keys**: `comment_draft_target_uq` and `comment_flag_open_uq` are
  declared `UNIQUE NULLS NOT DISTINCT` (`server/db/ddl/common/document/03_foundation_tables.sql:288`,
  `server/db/ddl/common/event/03_tables.sql:15`), so the `parent_comment_id`/`resolved_at` upserts in
  `kysely-collaboration-repository.ts:154,177` behave as intended (checked a suspicion, not a defect).
- **`JSON.parse` sites**: `runtime-descriptor-repository.ts:153-160` normalises pg json/jsonb representations inside
  try/catch; activity cursors and distributed-cache payloads parse inside try/catch that fails to a safe state.
- **Unawaited promises**: the only deliberate fire-and-forget is `fanout` (`collaboration-service.ts:592-612`), which
  chains `.catch(() => undefined)`; audit/outbox writes are awaited inside the transaction so failures roll back
  (`collaboration-service.test.ts:87-122, 632-645`).
- **Cross-entity operation resolution** keeps the admitted release pin: the related operator/operation artifacts are
  read by declared manifest key from the same release (`entity-operation-dispatcher.ts:107-136`,
  `artifact-resolution.ts:83-99`), never by re-resolving a head.
- **Metadata contracts**: strict parsers reject unknown properties, non-plain prototypes (prototype-pollution
  defence), duplicate references, incomplete field/operation coverage, executable/SQL-bearing properties, masked
  fields participating in queries, recursive discovery and deferrals that still have executable bindings
  (`entity-authorization.ts:73-343`, `entity-authorization-runtime.ts:49-160`,
  `entity-canonical-read-admission.ts:19-108`, `entity-ai.ts:104-179`, `field-pattern.ts:6-41`). The field-pattern
  compiler admits only anchored literal/class concatenations with at most one variable repetition (no groups,
  alternation, lookaround or backreferences), which removes the classic ReDoS shapes.
- **`catch {}` inventory**: `service.ts:204-208` (features fail closed), `service.ts:1180-1226` (platform profile
  defaults, test-locked at `service.test.ts:148-156`), `published-summary-service.ts:120-127` (provider discovery
  fails closed and cards without `authorize` are omitted), `distributed-descriptor-cache.ts:46-75,101-118` (cache is
  advisory, source stays authoritative), `entity-capability-policy`/`entity-activity-policy` (only
  `EntityCapabilityPolicyError` is swallowed; infrastructure errors propagate). All are fail-closed or explicitly
  documented; only the summary path (finding 8) hides genuine faults.

Minor observations verified as *not* defects: the in-memory descriptor cache and `createMemoryExperienceCache` are
bounded (FIFO cap / TTL); `entity-operation-admission.test.ts` is misnamed (it tests `createEntityOperationDispatcher`)
but its assertions are sound; the distributed-cache test title "fails open when cached content is corrupt" describes a
degrade-to-repository miss, which is the correct behaviour.

## Highest-risk 5

1. **Section capability gate keyed on `rendererKey` vs dispatch on `dataBinding.serviceKey`** —
   `entity-section-service.ts:183`. A mismatched publication bypasses `capabilities.resolve` entirely and exposes
   `internal` comments to anyone with the section's `viewPermission`.
2. **Raw `data` returned beside the filtered `presentation`** — `entity-section-service.ts:224`. Metadata visibility
   and protection projections do not constrain the payload; hidden/protected values ride along in `data.values`.
3. **Native lowering drops published `validation_spec`** — `native-runtime-projection.ts:257`. Authored
   length/range/pattern/allowed-value rules are not enforced on record writes (intake enforces them), a fail-open
   validation gap.
4. **Mention-candidate narrowing uses the caller's `visibility`** — `record-participants.ts:26` +
   `collaboration-routes.ts:48`. A private-thread composer can enumerate every admitted record participant by
   claiming a public audience.
5. **Cached descriptors served without a coordinate re-check** — `metadata-service.ts:53` +
   `distributed-descriptor-cache.ts:160`. A wrong cache entry is returned (with its storage bindings) where the
   uncached path would have rejected it.
