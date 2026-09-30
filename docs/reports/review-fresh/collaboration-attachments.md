# Review: Collaboration and attachment services and UI

Area: comments, activity and file upload/download on an entity record, audited against the
Country route (`/app/entity/country/`) served by the shared Entity Framework on
neon / mesh / studio.

Scope read in this review:

- `server/packages/platform/collaboration/src/**`
- `server/packages/services/attachments/src/**`
- `server/packages/contracts/collaboration/src/**`
- `packages/platform/communications/collaboration-ui/src/**`
- `packages/platform/entity/runtime/form-detail/src/{attachments,attachment-*,comments-workspace,collaboration-*}`

Plus the wiring that decides whether those services are reachable and authorized for the
Country route: `server/apps/platform-host/src/composition/register-services.ts`,
`server/apps/platform-host/src/composition/shared/documents/attachment-admission.ts`,
`server/apps/platform-host/src/composition/shared/collaboration/*`,
`server/packages/platform/experience/src/entity-capability-policy.ts`,
`packages/platform/gateway/bff-relay/src/index.ts`, `apps/{neon,mesh,studio}/lib/relay.ts`.

All line numbers were verified against the working tree at review time.

---

## 1. HIGH — Country attachments cannot be downloaded, previewed, extracted or searched on mesh and studio

**File:** `packages/platform/gateway/bff-relay/src/index.ts:2289`, `packages/platform/gateway/bff-relay/src/index.ts:2291`,
`packages/platform/gateway/bff-relay/src/index.ts:2299`, `packages/platform/gateway/bff-relay/src/index.ts:2307`,
`packages/platform/gateway/bff-relay/src/index.ts:3532`, `apps/mesh/lib/relay.ts:37`, `apps/studio/lib/relay.ts:43`

The browser transport always goes through the app relay
(`packages/platform/foundation/api-client/src/index.ts:103` — `relayPrefix = config.relayPrefix ?? "/api/relay"`), so
`POST /api/attachments/:attachmentId/download` is issued as `/api/relay/attachments/:id/download`
and must match an allowlisted relay operation. The retrieval operations are declared **inside
`BUSINESS_PARTNER_RELAY_OPERATIONS`**, which only the neon app spreads:

```ts
// packages/platform/gateway/bff-relay/src/index.ts:2287-2312  (inside BUSINESS_PARTNER_RELAY_OPERATIONS)
    PERSON_RESTRICTED_EVIDENCE_REVEAL_OPERATION,
    ATTACHMENT_DOWNLOAD_OPERATION,
    {
      id: "attachments.preview",
      method: "POST",
      path: "/api/attachments/:attachmentId/preview",
      ...
    },
    {
      id: "attachments.extract",
      ...
    },
    {
      id: "attachments.search",
      method: "POST",
      path: "/api/attachments/search",
      ...
    },
```

`COMMON_PLANE_RELAY_OPERATIONS` — the group every plane composes — contains only the *mutation*
attachment operations (they were placed inside `ATLAS_ANSWER_RELAY_OPERATIONS`, `:543-546`, which
is spread at `:3540`), and has no `attachments.download` / `attachments.preview` /
`attachments.extract` / `attachments.search`:

```ts
// packages/platform/gateway/bff-relay/src/index.ts:3532-3545
export const COMMON_PLANE_RELAY_OPERATIONS: readonly RelayOperation[] =
  Object.freeze([
    ...COLLABORATION_RELAY_OPERATIONS,
    ...
    ...ATLAS_ANSWER_RELAY_OPERATIONS,
    ...
  ]);
```

```ts
// apps/mesh/lib/relay.ts:35-43
  return createRelayHandler({
    ...options,
    plane: "mesh",
    operations: [
      ...COMMON_PLANE_RELAY_OPERATIONS,
      MESH_NETWORK_ACCOUNTS_OPERATION,
      ...
    ],
```

```ts
// apps/studio/lib/relay.ts:40-44
  return createRelayHandler({
    ...options,
    plane: "studio",
    operations: [
      ...COMMON_PLANE_RELAY_OPERATIONS,
```

Unmatched operations are rejected *before* any upstream call:

```ts
// packages/platform/gateway/bff-relay/src/index.ts:2728-2734
      const match = findOperation(operations, method, normalizedPath);
      if (!match)
        return problem(
          404,
          "RELAY_OPERATION_NOT_ALLOWED",
          "The requested platform operation is not allowlisted",
        );
```

**Why it is wrong.** `country` is published on all three planes
(`metadata/products/shared/entities/country/definition.json`: `"planes": ["studio","neon","mesh"]`)
and the Country page uses the shared components
(`packages/platform/entity/runtime/form-detail/src/attachment-download.ts`,
`attachment-preview.tsx`, `attachment-thumbnail.tsx`, `file-search.tsx`), which call those four
paths. The operations that were judged "shared" for upload/list/rename/archive were not made
shared for retrieval, even though their ids are plane-neutral (`attachments.preview`, not
`neon.attachments.preview`) and they sit next to `attachments.stage`, which *is* in the common
group.

**Concrete consequence on the Country route.** On `mesh.dev.athyper.test` and
`studio.dev.athyper.test`, opening a Country record and going to the Files tab lists the files
(the section read operation *is* common: `ENTITY_RUNTIME_ATTACHMENTS_READ_OPERATION`,
`:1202`, spread through `ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS`) but every retrieval fails with
`404 RELAY_OPERATION_NOT_ALLOWED`: thumbnails fall back to the file-type icon, the preview
button reports "Preview is unavailable", file search returns nothing, and the download button
shows the misleading "The document could not be downloaded. Your access or the document may
have changed." (`attachment-reference.tsx:20`). Uploading, listing, renaming, folders,
categories, archive and status polling still work, which makes the failure look like a
per-file permission problem rather than a plane-wide configuration gap.

**Fix.** Move `ATTACHMENT_DOWNLOAD_OPERATION` and the `attachments.preview` / `attachments.extract`
/ `attachments.search` literals out of `BUSINESS_PARTNER_RELAY_OPERATIONS` into
`ATLAS_ANSWER_RELAY_OPERATIONS` (next to the other `ATTACHMENT_*` operations) or into a new
`ATTACHMENT_RELAY_OPERATIONS` group spread by `COMMON_PLANE_RELAY_OPERATIONS`. Add a contract
test in `tests/contracts/relay-common-plane-operations.test.ts` asserting that every route served
by `registerAttachmentRoutes` / `registerAttachmentDiscoveryRoutes` for an entity capability has
a common-plane operation, so a retrieval endpoint cannot be plane-stranded again.

---

## 2. HIGH — Download of `content.item` / `atlas.prompt` attachments bypasses the owner ACL; the owning item id is never passed to an authorizer

**File:** `server/packages/services/attachments/src/attachment-routes.ts:235-275`,
`server/packages/services/attachments/src/attachment-routes.ts:63-79`,
`server/packages/services/attachments/src/attachment-routes.ts:339-354`,
`server/apps/platform-host/src/composition/shared/documents/attachment-admission.ts:88-89`

The download route never consults the content ACL, unlike the two sibling routes that create and
version content attachments:

```ts
// server/packages/services/attachments/src/attachment-routes.ts:63-79  (stage — checks the ACL)
        if (
          owner.entityType === "content.item" &&
          options.contentAcl &&
          !(await options.contentAcl.authorize({
            context,
            contentItemId: uuidValue(owner.entityId!, "entityId"),
            required: "write",
          }))
        ) { ... 403 CONTENT_ACCESS_DENIED ... }
```

```ts
// server/packages/services/attachments/src/attachment-routes.ts:339-354  (versions — checks the ACL)
        if (
          options.contentAcl &&
          !(await options.contentAcl.authorize({
            context,
            contentItemId,
            required: "write",
          }))
        ) { ... 403 CONTENT_ACCESS_DENIED ... }
```

```ts
// server/packages/services/attachments/src/attachment-routes.ts:250-267  (download — no contentAcl)
        await admitAttachmentAction(
          options, request,
          context,
          "download",
          { attachmentId },
          "download",
          { attachmentId, resourceId: attachmentId },
          false,
        );
        const result = await options.attachments.createAuthorizedDownload(
          { planeKey: context.planeKey, tenantId: context.tenantId,
            principalId: context.principalId, attachmentId },
          ttl,
        );
```

The owner-specific branch of admission deliberately returns nothing for these owners, and the
route then falls through to a plane-wide permission code with no resource scoping:

```ts
// server/apps/platform-host/src/composition/shared/documents/attachment-admission.ts:88-89
    if (entityCode === "content.item" || entityCode === "atlas.prompt")
      return undefined;
```

```ts
// server/packages/services/attachments/src/attachment-routes.ts:439-456
  const planeCode = context.planeKey === "neon"
      ? `neon.collaboration.attachment.${operation}`
      : ...
  const candidates = [ planeCode, `attachment.${operation}`, `document.attachment.${operation}`, ... ];
```

`grep -n contentAcl server/packages/services/attachments/src/attachment-routes.ts` returns only
line 22 (the option), 65-66 (stage) and 340-341 (versions): the download, status, unlink,
rename, folder, category and archive paths all skip it.

**Why it is wrong.** Content-item access is a per-record ACL
(`server/packages/services/content/src/content-service.ts:4` — `record(...)` calls
`aclRepository.authorize` for every read; `contentAcl.authorize` requires
`content.read` **and** an item-level grant). The download route reduces that to "the caller holds
one of the generic attachment download permission codes" and never passes `contentItemId` to any
authorizer, so the revocation of a content grant has no effect on already-known attachment ids.
The route's own test proves the ACL is not consulted on download: the fixture's
`contentAcl.authorize` always returns `false`, yet
`attachment-routes.test.ts:651-658` expects `200` when only `document.attachment.download` is
granted. It also bypasses the comment-audience check, because admission for `content.item`
returns before the `commentId`/`canReadComment` logic in `entity-capability-policy.ts:189-194`.

**Concrete consequence on the Country route.** Country's own attachments are not reachable this
way — `attachment-admission.ts:59-87` loads the row from `document.attachment` (tenant-scoped) and
`capabilityPolicy.resolve` re-runs the published record admission — but the Country Files tab
uses this same endpoint, so the shared download gate is not uniformly record-scoped: any
authenticated principal with a legacy attachment-download code can retrieve the bytes of any
content item's attachment in the tenant, including after their content ACL grant is revoked, and
the error surfaced to Country users ("your access may have changed") is exactly the message that
is *not* enforced on that path.

**Fix.** Make the owner coordinate available to every route that issues bytes. Either have
`createEntityAttachmentAdmission` return `{entityType, entityId}` (from the row it already loaded)
for `content.item`/`atlas.prompt` instead of `undefined`, and in the download route require
`options.contentAcl.authorize({context, contentItemId: row.entityId, required: "read"})` before
calling `createAuthorizedDownload`; or add an explicit tenant-scoped owner lookup in the download
route and gate on it. Add a regression test that a denied `contentAcl.authorize` yields `403` on
`/download` for a `content.item` attachment, mirroring the existing stage test at
`attachment-routes.test.ts:621-633`.

---

## 3. MEDIUM — Attachment version history exposes other users' pending / quarantined / failed uploads

**File:** `server/apps/platform-host/src/composition/shared/collaboration/attachments.ts:76-77`,
`server/apps/platform-host/src/composition/shared/collaboration/attachments.ts:119-129`,
`server/packages/services/attachments/src/attachment-discovery-routes.ts:142-144`

The section provider states that in-flight uploads are private, and it filters the item rows that
way:

```ts
// server/apps/platform-host/src/composition/shared/collaboration/attachments.ts:76-77
      // Pending transfer rows are private to the uploader, even when their
      // eventual series is already associated with this shared record.
```

But the per-series `versionHistory` enrichment has no uploader or status predicate, so *all*
versions of any series that has a live link to the record are returned to every record
participant:

```ts
// server/apps/platform-host/src/composition/shared/collaboration/attachments.ts:119-129
                      }>`SELECT id::text,version_no,file_name,status,created_at,(SELECT display_name FROM document.collaboration_principal_candidates('',attachment.uploaded_by)) uploaded_by_display_name FROM document.attachment attachment WHERE tenant_id=${context.tenantId}::uuid AND series_id=${seriesId}::uuid ORDER BY version_no DESC,id DESC`.execute(
```

The equivalent query in the discovery service applies the intended predicate:

```ts
// server/packages/services/attachments/src/attachment-discovery-routes.ts:142-144
          FROM document.attachment v WHERE v.tenant_id=${context.tenantId}::uuid AND v.series_id=page.series_id::uuid
            AND (v.status='active' OR v.uploaded_by=${context.principalId}::uuid)), '[]'::jsonb) ELSE NULL END version_history
```

**Why it is wrong.** It contradicts the privacy rule implemented two lines earlier in the same
function and in the browse path: incomplete, rejected or malware-quarantined uploads (file names,
upload timestamps, uploader display names, and the fact that a scan failed) become visible to
every collaborator on the record.

**Concrete consequence on the Country route.** On a shared Country record, when user A is
uploading a new version of a file (or their upload was quarantined), user B reloading the Files
tab receives A's file name and status in `versionHistory` even though B never sees the row in the
list. This is the disclosure of un-approved, possibly malicious or confidential material
*labels* to users who were never granted it.

**Fix.** Add `AND (v.status='active' OR v.uploaded_by=${context.principalId}::uuid)` to the
`histories` query at `attachments.ts:119-129` (and keep the active-version rows unconditional so
shared history still works). A test asserting that a second principal's response contains no
non-active version uploaded by the first principal would lock this down.

---

## 4. MEDIUM — Presigned upload URL is unbounded, so `maxFileBytes` and the attachment quota can be bypassed

**File:** `server/packages/adapters/object-storage-s3/src/s3-object-storage-adapter.ts:461-469`,
`server/packages/adapters/object-storage-s3/src/s3-object-storage-adapter.ts:548-568`,
`server/packages/services/attachments/src/attachment-lifecycle.ts:399-404`,
`server/packages/services/attachments/src/attachment-lifecycle.ts:570`

```ts
// server/packages/adapters/object-storage-s3/src/s3-object-storage-adapter.ts:461-469
  createUploadUrl(key: string, expirySeconds?: number): Promise<string> {
    return this.#sign(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: requireObjectKey(key),
      }),
      expirySeconds,
    );
  }
```

```ts
// server/packages/adapters/object-storage-s3/src/s3-object-storage-adapter.ts:548-568
  async #sign(command: GetObjectCommand | PutObjectCommand, expirySeconds?: number): Promise<string> {
    const expiresIn = expirySeconds ?? this.config.presignedTtlSeconds;
    ...
    return getSignedUrl(this.signingClient, command, { expiresIn });
  }
  #assertUploadSize(size: number): void {
    ...
    if (size > this.config.maxUploadBytes) throw new RangeError("S3 upload exceeds configured maximum size");
  }
```

`#assertUploadSize` is only reached from `put`, `putIfAbsent` and `putStream` (server-side
writes). The staged upload URL signed by `createUploadUrl` carries no `ContentLength` (or
content-type) constraint, and the lifecycle hands it to the browser unchanged:

```ts
// server/packages/services/attachments/src/attachment-lifecycle.ts:399-404
        uploadUrl: await options.storage.createUploadUrl(current.storageKey, ttl),
```

The declared `sizeBytes` is only checked against the *published metadata* limit at stage and
against the *measured* object at finalize (`attachment-lifecycle.ts:450`, `:486-493`), i.e. after
the object has already been written to the bucket. On a finalize size mismatch only the copied
destination key is scheduled for deletion:

```ts
// server/packages/services/attachments/src/attachment-lifecycle.ts:570
        await recordPendingCleanup(options,identity,[destinationKey]);
```

the oversized staging object (`current.storageKey`) is left for the delayed expiry/purge job
(`attachment-lifecycle.ts:726-762`).

**Why it is wrong.** The controls that bound upload cost (`maxFileBytes` from the entity binding
and `quota.reserve` for `sizeBytes`) are enforced against a *claim*, while the object store
accepts arbitrary bytes for the signed key. The quota ledger has no reservation covering the
actual bytes until commit, and commit never happens for a rejected upload.

**Concrete consequence on the Country route.** A Country user with `create` can PUT an object far
larger than country's `maxFileBytes` (5 MB) — such as a multi-gigabyte body — into their staging
key, consuming bucket space outside the tenant attachment quota for the lifetime of the staging
reservation, and repeating it with fresh attachment ids. This is an economic/DoS control bypass,
not a data-disclosure one.

**Fix.** Sign the size constraint into the URL (`PutObjectCommand` with `ContentLength`, or switch
to a POST-policy presign that carries `content-length-range`), and delete `current.storageKey`
alongside `destinationKey` in the finalize failure path (`attachment-lifecycle.ts:570`). If the
adapter cannot constrain the content length, enforce it where the object is read and treat the
staging reservation as untrusted in the quota ledger.

---

## 5. MEDIUM — Comment visibility silently falls back to `public` when capability admission returns nothing

**File:** `server/packages/platform/collaboration/src/collaboration-service.ts:75-85`,
`server/apps/platform-host/src/composition/register-services.ts:2262`

```ts
// server/packages/platform/collaboration/src/collaboration-service.ts:75-85
      const capability = await options.authorizeCapability?.(action, command, {...initial});
      if (!capability) await requirePermission(
        options.authorizer,
        command.context,
        PERMISSION.create,
      );
      const prepared = {...initial, visibility: command.visibility ?? capability?.defaultAudience ?? "public" as const};
```

```ts
// server/apps/platform-host/src/composition/register-services.ts:2262
        if(entityCode === "content.item") { if(action === "mention" || action === "history") throw new EntityCapabilityPolicyError(); return; }
```

**Why it is wrong.** The published binding carries an explicit `defaultAudience`
(`metadata/products/shared/entities/country/capabilities.json` — `"defaultAudience": "private"`),
and the same function validates the requested audience against `binding.allowedAudiences`. When
the admission hook returns `void` (the documented behaviour for `content.item` and any owner
without an entity capability), the audience is not validated against any binding and defaults to
the widest value instead of the narrowest or a denial. Fail-open defaults are the failure mode the
rest of this service avoids everywhere else (reply audiences can only narrow,
`entity-capability-policy.ts:174-177`).

**Concrete consequence on the Country route.** Country itself is safe because the admission hook
returns `defaultAudience: "private"` (`register-services.ts:2269`), but the shared collaboration
service is consumed by every comments capability. Any owner that reaches the legacy branch (today
`content.item`) posts a comment with no explicit visibility as `public`, which
`canReadComment` (`entity-capability-policy.ts:331`) treats as readable by every admitted record
participant, and the section provider stamps `comment.visibility` accordingly
(`comments.ts` filter `visibility IN ('public','internal')`). A country-shaped entity configured
with `defaultAudience: "private"` would inherit the same hole if its admission hook ever returned
`void`.

**Fix.** Replace `?? "public"` with a denied default: if no capability was returned, require an
explicit `visibility` in the command and reject the comment when it is absent
(`throw new CollaborationError(422, "COMMENT_AUDIENCE_REQUIRED", ...)`), or fall back to the
narrowest allowed audience. Never synthesise `public`.

---

## 6. LOW (framework consistency / dead route) — `POST /api/attachments/:attachmentId/category` is unreachable for explicit capability bindings

**File:** `server/packages/services/attachments/src/attachment-routes.ts:42`,
`server/packages/contracts/publication/src/common-capability-permissions.ts:32`,
`server/packages/contracts/publication/src/common-capability-permissions.ts:48`,
`server/packages/contracts/publication/src/entity-capabilities.ts:64-70`

```ts
// server/packages/services/attachments/src/attachment-routes.ts:42
  application.post("/api/attachments/:attachmentId/category", options.authenticate, async (request,response,next)=>{try { const context=options.readContext(response), attachmentId=uuidValue(String(request.params["attachmentId"]??""),"attachmentId"), value=body(request.body), owner=coordinate(value), category=text(value,"category",32) as "general"|"evidence",idempotencyKey=requireIdempotencyKey(request); await admitAttachmentAction(options, request,context,"category",{...value,...owner,attachmentId,idempotencyKey},"create",{attachmentId,resourceId:attachmentId},false);
```

```ts
// server/packages/contracts/publication/src/common-capability-permissions.ts:48
  return Object.keys(commonActions[kind]).filter(key => key !== "category" || categories.length > 0).map(key => {
```

```ts
// server/packages/contracts/publication/src/entity-capabilities.ts:64-70
    if (declaration.enabled)
      operationBindings[
        capabilityBindingKey(member.capabilityKey)
      ] = parseCapabilityBinding(
        mode === "profile" ? capabilityProfileBinding(member, entityCode) : member.binding,
```

**Why it is wrong.** `attachment-routes.ts` passes `"category"` to the capability admission, which
looks the key up in `binding.actions` (`entity-capability-policy.ts:126-128` → `deny()` when
absent). In *explicit* authoring mode the binding's `actions` array is used verbatim — a
`category` action is generated only for *profile*-mode members with a non-empty `categories`
list. Country's explicit binding declares `"categories": []` and has no `category` action, so the
route can only ever answer `403 ENTITY_CAPABILITY_DENIED`; there is no validation that an
explicit binding's `actions` cover the features it declares (`categories`, `folders`,
`versioning`, `rename`, `unlink`, `download`, `processing.*`).

**Concrete consequence on the Country route.** `POST /api/relay/attachments/:id/category` always
fails for Country, so the shared route and
`packages/platform/entity/runtime/form-detail/src/collaboration-operations.tsx:126-133` are dead
for this entity. The UI happens to hide the control (`compiled-section-content.tsx:161` —
`canCategory={actions.has("category")}`), so today there is no user-visible break; the hazard is
that an explicit binding which declares `categories: ["general","evidence"]` (or `folders: true`)
but omits the matching action will silently lose the feature at runtime instead of failing
publication.

**Fix.** Either (a) in explicit mode, validate at compile time that `binding.actions` contains a
key for every declared attachment feature and fail the publication otherwise
(`entity-capabilities.ts:64`), or (b) stop registering `/category` (and any other route without a
corresponding action) and derive route registration from the binding. Do not leave a route that
can never be admitted.

---

## 7. LOW — Unsupported category filter is always rendered in the Files filter panel

**File:** `packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:1031-1063`

```tsx
// packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:1031-1035
          <div
            id="file-browse-filters"
            hidden={!filtersOpen}
            className="a-attachment-workspace__filters"
          >
```

```tsx
// packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:1052-1062
            <label>
              {intl.message("files.category")}
              <Select
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.currentTarget.value)
                }
              >
                <option value="">{intl.message("files.allCategories")}</option>
                <option value="general">{intl.message("files.general")}</option>
                <option value="evidence">{intl.message("files.evidence")}</option>
              </Select>
            </label>
```

The panel is only hidden behind `hidden={!filtersOpen}` (`:1033`); unlike the mutating controls,
the filter is not gated on `canCategory` or on the projected `categories` list.

**Why it is wrong.** `projectEntityCapability` publishes `categories` to the browser
(`entity-capabilities.ts:696`), but the filter ignores it and offers "Evidence" for an entity that
can never store an evidence category (country declares `"categories": []`). This is exactly the
"unsupported features exposed to make a page look complete" that the repository rules forbid.

**Concrete consequence on the Country route.** A Country user opening the Files filters sees
General/Evidence; choosing Evidence always yields an empty list, and the choice is indistinguishable
from "this record has no evidence files".

**Fix.** Render the category filter (and the folder filter at `:1035-1051`) only when the projected
capability allows it (`actions.has("category")` / `actions.has("folder")`), or pass a
`capability.categories` list through and map it to options.

---

## 8. LOW — Mention display labels are author-controlled, so a comment can display a different person than the one notified

**File:** `server/packages/platform/collaboration/src/rich-text.ts:178`,
`server/packages/platform/collaboration/src/rich-text.ts:223-226`,
`packages/platform/entity/runtime/form-detail/src/rich-text-render.tsx:70-71`

```ts
// server/packages/platform/collaboration/src/rich-text.ts:177-178
  if (node.type === "mention")
    return `<span data-mention-principal="${escape(attr(node, "principalId"))}">@${escape(optionalAttr(node, "label") ?? "mention")}</span>`;
```

```ts
// server/packages/platform/collaboration/src/rich-text.ts:223-226
function optionalAttr(node: RichTextNode, key: string): string | undefined {
  const value = node.attrs?.[key];
  return typeof value === "string" ? value.slice(0, 500) : undefined;
}
```

```tsx
// packages/platform/entity/runtime/form-detail/src/rich-text-render.tsx:70-71
    if (node.type === "mention")
      return <span>@{node.attrs?.label ?? "mention"}</span>;
```

**Why it is wrong.** The server validates `principalId` as a UUID and validates
`mentionedPrincipalIds` for notification eligibility, but the *rendered* name is taken verbatim
from the submitted document's `attrs.label`. The author picks the text; the directory is never
consulted.

**Concrete consequence on the Country route.** A user can submit a comment on a Country record
containing a mention node with `principalId` = a colleague who should be notified and
`label` = the name of an executive or approver. Every reader (and the notification fan-out, which
uses the excerpt) sees the spoofed name while the real recipient is someone else.

**Fix.** Resolve the display name server-side from the principal directory when projecting the
document (or strip `attrs.label` and render names from the stored `principalId` plus the
already-loaded `display_name`), so the label cannot diverge from the identity.

---

## 9. LOW (dead code) — Server-projected `content_html` is stored but never read, and it references a route that does not exist

**File:** `server/packages/platform/collaboration/src/rich-text.ts:183`,
`server/packages/platform/collaboration/src/kysely-collaboration-repository.ts:81`,
`server/apps/platform-host/src/composition/shared/collaboration/comments.ts:47`

```ts
// server/packages/platform/collaboration/src/rich-text.ts:183
    return `<img src="/api/attachments/${id}/content" data-attachment-id="${id}" alt="${alt}">`;
```

There is no `/api/attachments/:attachmentId/content` route in
`registerAttachmentRoutes` (`attachment-routes.ts:25-390`) or
`registerAttachmentDiscoveryRoutes` (`attachment-discovery-routes.ts:151-168`); the comment read
queries never select `content_html` (`comments.ts:78` selects `comment.content_json,
comment.content_format` only), and no client reads `Record.html`.

**Why it is wrong.** Dead output that would 404 if it were ever rendered; it also creates the
false impression that server-rendered HTML is a supported delivery path, which invites a future
change to inject it into the DOM (a real XSS risk given the `<img src>` interpolation).

**Concrete consequence on the Country route.** None today — comments render from `content_json`.
The cost is maintenance risk and a misleading artifact.

**Fix.** Delete `html` from `RichTextProjection`, the `content_html` writes and the `/content`
markup, or add the missing route and a consumer in the same change. Keeping a half-wired
HTML path alive is the riskier option.

---

## 10. LOW (dead code) — Comment read-cursor endpoints and unread counts have no caller

**File:** `server/packages/platform/collaboration/src/collaboration-routes.ts:157-169`,
`server/packages/platform/collaboration/src/kysely-collaboration-repository.ts:167-173`,
`packages/platform/gateway/bff-relay/src/index.ts:3438-3520`

```ts
// server/packages/platform/collaboration/src/collaboration-routes.ts:157-169
  app.post(
    "/api/collab/comments/mark-all-read",
    o.authenticate,
    route(async (r, c) => {
      const b = body(r);
      await o.collaboration.markRead({ context: c, ...coordinate(b), readAt: opt(b, "readAt") });
      return { status: 204 };
    }),
  );
```

The route is absent from `COLLABORATION_RELAY_OPERATIONS` (`bff-relay/src/index.ts:3438-3520`),
so the browser transport cannot reach it, and a repository-wide search finds no client that reads
`unreadCount` from the collaboration section (`comments.ts` computes it, no UI consumes it) or
calls `markRead`.

**Why it is wrong / consequence.** Dead surface: the `document.comment_feed_cursor` table, the
`markRead` path and the per-request unread aggregation run for no user. It is not a security
defect (the route is authorized when reachable), but it is maintenance weight in a shared
framework. **Fix.** Remove the route, the port method, the cursor writes and the `unreadCount`
aggregation, or finish the feature end-to-end (relay operation + UI badge).

---

## 11. LOW — Quota-recovery expiry skips the lifecycle event and purge scheduling

**File:** `server/packages/services/attachments/src/quota-recovery.ts:43-49`,
`server/packages/services/attachments/src/attachment-lifecycle.ts:741-762`

```ts
// server/packages/services/attachments/src/quota-recovery.ts:43-49
        const ids = await input.quota.expire(
          { tenantId: value.tenantId, principalId: value.principalId, limit },
          tx,
        );
        for (const attachmentId of ids)
          await input.attachments.expire({ ...value, attachmentId }, tx);
```

Here `input.attachments` is typed as the **repository** (`quota-recovery.ts:36` —
`attachments: AttachmentRepository<T>`), so this calls
`AttachmentRepository.expire` (a status update only, `kysely-attachment-repository.ts:196-201`),
not `AttachmentLifecycle.expire`, which emits `attachments.expired` and schedules the purge job
(`attachment-lifecycle.ts:741-762`).

**Why it is wrong.** Reservations recovered by the sweeper produce no outbox/audit event and no
immediate purge schedule. Purge is eventually recovered by the retention reconciliation job
(`attachment-lifecycle.ts:786-796`), so the impact is an audit-trail gap rather than leaked bytes.

**Concrete consequence on the Country route.** Attachments on Country records whose staging
expired via the sweeper (rather than the per-upload delayed job) are missing their
`attachments.expired` lifecycle event.

**Fix.** Inject the `AttachmentLifecycle` (or call the lifecycle's `expire`) in the recovery
handler so both paths emit the same event and schedule the same purge.

---

## Verified healthy (do not churn)

1. **Entity attachment admission is record- and tenant-scoped.** `createEntityAttachmentAdmission`
   loads the subject from storage with `attachment.tenant_id = context.tenantId AND attachment.id = …`
   and then re-authorizes the *record* through `capabilityPolicy.resolve` →
   `createPublishedParentAdmission`, whose admission performs a real authorized record read
   (`readPublishedParent`, `services.ts:84-107`). An authenticated user cannot fetch another
   record's or another tenant's file by id for entity-owned attachments. The parameter that could
   have been unvalidated (`entityType`/`entityId`) is overwritten from the stored row
   (`attachment-admission.ts:69-77`).

2. **Cross-record attachment pinning is impossible.** `replaceRelations` requires the attachment to
   be in the same tenant, same entity/record coordinate and uploaded by the commenter before
   writing a comment link (`kysely-collaboration-repository.ts:221-237`), and it releases the draft
   marker in the same transaction.

3. **Comment audience enforcement is server-side and narrowing-only.** Private rows are
   author-only in SQL (`comments.ts` `visibility IN ('public','internal') OR commenter_id = …`),
   the recursive thread CTE inlines the same predicate (`comment-descendants.ts:15`),
   `canReadComment` re-checks subject vs. record, replies can only retain or narrow the parent
   audience, `internal` requires a current record participant, and comment history is restricted
   to the author (`entity-capability-policy.ts:156-194`, `:308-334`;
   `kysely-collaboration-repository.ts:33-34`).

4. **Rich text is validated and escaped server-side.** `projectRichText` whitelists node types and
   mark types, caps nodes/depth/table cells, requires node/1.0 schema, validates link hrefs with
   `safeRichTextHref`, and escapes text, attributes and mention labels
   (`rich-text.ts:36-64`, `:153-172`, `:235-242`). The client renders the stored JSON as React text
   nodes (no `dangerouslySetInnerHTML` of server content) and re-checks hrefs
   (`rich-text-render.tsx:66-156`); paste is converted through
   `validate-clipboard-document.ts` and prevented from entering the editable DOM.

5. **Download URLs are short-lived and forced-disposition.** `createAuthorizedDownload` clamps the
   TTL to 30-300 s, additionally clamps to `expires_at`, requires an active, scanned, hashed
   record, and requests `application/octet-stream` with a sanitised attachment filename
   (`attachment-lifecycle.ts:618-666`). The route sets `Cache-Control: private, no-store` and
   `Pragma: no-cache` (`attachment-routes.ts:268-269`). The stored content type never controls the
   response type, so a lying `Content-Type` cannot produce an in-origin renderable response.

6. **Preview is derived, whitelisted and re-authorized per request.** The rendition is validated
   against a fixed set, the source content type against
   `image/png|image/jpeg|image/webp|application/pdf`, the derivative status/scan/size are checked,
   and the SQL re-derives the visible link from the admitted record/comment rather than trusting
   the caller (`attachment-discovery-routes.ts:28-58`). The client validates the returned URL is
   HTTPS, credential-free, hash-free and cross-origin
   (`packages/platform/communications/collaboration-ui/src/upload-lifecycle.ts:23-45`).

7. **Upload lifecycle is fail-closed.** Size and type are enforced against the published binding
   at stage (`entity-capability-policy.ts:210-228`), the object is copied to an immutable
   destination before scanning, the measured size must equal the staged size, activation requires
   a clean scan, quota commits and the record capability/policy hash are re-admitted inside the
   commit transaction (`attachment-lifecycle.ts:441-549`), and the policy hash recorded at stage
   must still match at finalize (`attachment-admission.ts:106-107`).

8. **Object keys are server-generated.** `quarantine/{plane}/{tenant}/{attachmentId}/{uuid}` and
   `attachments/{plane}/{tenant}/{attachmentId}/{uuid}/original`
   (`attachment-lifecycle.ts:935-940`); the client-supplied file name never participates in the
   key, so path traversal via `fileName` is closed. Orphaned versions and failed finalizations are
   tracked through a durable `pending_cleanup_keys` manifest.

9. **Folder and category mutations are record-scoped.** `manageFolder` locks the workspace row with
   a compare-and-swap on `expectedRevision`, validates a move target folder belongs to the same
   tenant/entity/record, and refuses to delete a non-empty folder
   (`kysely-attachment-repository.ts:44-78`); the route derives the coordinate from the admitted
   attachment for `move` (`attachment-admission.ts:69-74`).

10. **Quota ledger is transactional and idempotent.** Reservations use two metric rows under
    `FOR UPDATE` on the tenant counters, commit/release are status-guarded, and expiry is
    `SKIP LOCKED` bounded (`kysely-attachment-quota-ledger.ts:19-77`); retried stage/finalize
    commands are deduplicated by `commandExecutions` receipts.

11. **Collaboration mutations go through capability admission.** `create`, `edit`, `remove`,
    reactions, drafts, `flag` and `read` call `authorizeCapability` first and fall back to
    `requirePermission` only when no capability exists
    (`collaboration-service.ts:75, 169, 226, 251, 279, 298, 315, 339, 361`); the route layer maps
    `ENTITY_CAPABILITY_DENIED` to a 403 problem document without leaking details
    (`collaboration-routes.ts:33-34`).

---

## Checked but not a defect

- `attachmentCapabilityUrl` rejects non-HTTPS (except loopback), embedded credentials, fragments
  and same-origin preview URLs; `putAttachmentBytes` sends `credentials: "omit"`,
  `redirect: "error"` and a 120 s timeout. No open-redirect or token-leak path found.
- `POST /api/attachments/:attachmentId/download` validates `expirySeconds` as a safe integer and
  clamps it; the route refuses to cache signed URLs (asserted by
  `attachment-routes.test.ts:651-664`).
- The `/status` endpoint uses the uploader-scoped `load` (`kysely-attachment-repository.ts:129-135`)
  whenever the entity admission does not return a coordinate, so it cannot disclose another
  principal's attachment metadata.
- Reactions, flags, history, mentions and edits are pessimistic (await + refetch, guard refs) in
  `comments-workspace.tsx:904-923`; no optimistic state is applied before server confirmation, so
  the classic optimistic-update divergence is not present.
- `copyLink` puts the attachment id in a query parameter of the record URL
  (`collection.tsx:754-758`); the id is not a capability and both the preview and download
  endpoints re-authorize, so a shared link grants nothing by itself.
- `attachments.ts:78-82` merges active and uploader-private pending rows and sorts by
  `(created_at, id)`, which is stable across the two queries; the cursor comparison uses the same
  tuple.
- The `attachment.search` SQL uses bound parameters throughout and applies
  `SET LOCAL statement_timeout = '2000ms'`; no SQL injection was found in the attachment or
  collaboration repositories (all predicates are parameterised Kysely `sql` templates).
- Quoted `contentType` values in `stage`/`versions` are validated against the published allowlist,
  and the lifecycle rejects a finalize content type that differs from the staged one
  (`attachment-lifecycle.ts:416-422`).
- The mention-picker and participants endpoint require the `mention` capability action plus a
  current-record-participant check (`register-services.ts:2254`, `:2264`), so recipient enumeration
  is bounded to admitted participants.
- Notification attachment references are validated to be a subset of the selected comment
  attachments and deduplicated (`collaboration-service.ts:677-680`).

---

## Coverage and method

Read directly: all files listed in the scope line above; the composition wiring that admits
attachment and comment actions for entity records; the capability policy and publication
projection; the S3 object-storage adapter's presign paths; the bff-relay operation catalog and the
three plane relay configurations; the attachment and discovery route tests for intent. Greps used
to establish absence of guards (`contentAcl`, `dangerouslySetInnerHTML`, `markRead`,
`unreadCount`, `/api/attachments/.*/content`) and presence of callers. Known-facts items supplied
by the delegating agent were not re-derived and are not repeated as findings.

Limitations: the live deployment was not exercised (read-only review); reachability conclusions
for the relay are from the operation allowlists and the browser transport's `/api/relay` prefix,
not from a running request. The `comments-workspace.tsx` file is large (2100 lines) and was
reviewed by targeted search plus the composer/submit/reaction/history paths rather than line by
line; no finding is claimed from the unreviewed remainder.
