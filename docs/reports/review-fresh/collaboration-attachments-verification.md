# Adversarial verification — Collaboration and attachment services and UI

## Finding 2 — Download of `content.item` / `atlas.prompt` attachments bypasses the owner ACL

**Verdict: CONFIRMED (severity high, as claimed).**

Verified against the current tree. I reproduced the defect with the real route module and the
real admission module (no source changes; inline `tsx` run, `--no-cache`).

### Citations checked

- `server/packages/services/attachments/src/attachment-routes.ts:235-275` — the download route.
  `:250-258` calls `admitAttachmentAction(..., "download", { attachmentId }, "download",
  { attachmentId, resourceId: attachmentId }, false)`; `:259-267` then calls
  `createAuthorizedDownload`. The quoted code and line numbers are accurate.
- `attachment-routes.ts:63-79` (stage) and `:339-354` (versions) — both call
  `options.contentAcl.authorize({ ..., required: "write" })` and return 403
  `CONTENT_ACCESS_DENIED`. Accurate.
- `grep -n contentAcl attachment-routes.ts` → 22, 65-66, 340-341 only. Accurate; download,
  status, unlink, rename, folder, category and archive never consult it.
- `attachment-routes.ts:425-480` — `allowedAttachment`: `:439-444` builds the plane code
  (`neon.collaboration.attachment.download` / `mesh|studio.catalog.attachment.download`) and
  `:445-456` the candidate list `[planeCode, 'attachment.'+op, 'document.attachment.'+op]`.
  The resource is only `{ attachmentId, resourceId: attachmentId }`.
- `server/apps/platform-host/src/composition/shared/documents/attachment-admission.ts:59-89`
  — the row is loaded tenant-scoped from `document.attachment`, the record coordinate is taken
  from storage, and then `:88-89` returns `undefined` for `content.item` / `atlas.prompt`
  before `options.resolve` (the capability policy) is ever called.
- Wiring: `server/apps/platform-host/src/composition/register-services.ts:1711-1717`
  (`createEntityAttachmentAdmission`) and `:3311-3326` (`registerAttachmentRoutes` receives
  both `authorizeCapability` and `contentAcl`), so the production path is exactly the one
  reproduced below.

### Reproduction (real `attachment-routes.ts` + real `createEntityAttachmentAdmission`)

Owner row `entity_type = "content.item"`, `has_record_link = true`, `uploaded_by = someone-else`;
`contentAcl.authorize` always returns `false`; the legacy authorizer grants only
`document.attachment.download`:

```
[1] content.item /download  -> status 200 | contentAcl calls: 0 | capability resolve calls: 0
    | legacy codes tried: ["neon.collaboration.attachment.download","attachment.download","document.attachment.download"]
[3] content.item /stage     -> status 403 | contentAcl calls: 1 | CONTENT_ACCESS_DENIED
```

A signed download URL for the content item's attachment is issued with no record-ACL check,
while the sibling stage route correctly returns 403 on the same denial. Two further variants:

```
[2]/[4] entity owner (country): capability resolve IS called; when it throws
        EntityCapabilityPolicyError the route returns 403 ENTITY_CAPABILITY_DENIED and
        never tries the legacy codes — i.e. entity records (Country) are record-scoped.
[5] atlas.prompt /download  -> status 200 | contentAcl calls: 0 | resolve calls: 0
    (the route hardcodes atlasPrompt=false at :257, so not even `neon.ai.agent.use` is checked)
[6] content.item comment-pinned /download -> status 200 | resolve calls: 0
    (the comment-audience check inside entity-capability-policy.ts:189-194 is unreachable
     because admission returns at attachment-admission.ts:88)
```

### Guards looked for and dismissed

- `createAuthorizedDownload` (`server/packages/services/attachments/src/attachment-lifecycle.ts:618-666`)
  checks only status/scan/expiry and mints the URL; no owner or ACL check.
- The repository loader it uses, `kysely-attachment-repository.ts:136-142` `loadForDownload`,
  filters on `tenant_id` + `attachment_id` only — no owner scope.
- No competing `/api/attachments/:attachmentId/download` registration exists in the host
  (only `attachment-routes.ts:236`); the relay entry `packages/platform/gateway/bff-relay/src/index.ts:499-506`
  adds only tenant/body limits, no record policy.
- The two legacy codes `attachment.download` / `document.attachment.download` do not appear in
  the shipped seed catalog, but the first candidate `neon.collaboration.attachment.download` is
  a real cataloged code (`server/db/seed/contracts/authorization/inventory/neon/promotion/catalog.v2.candidate.json:194`,
  referenced by `metadata/products/mdg/entities/business_partner/operation.json:408,457`). A
  tenant-scoped grant of it covers every `resourceId` (permission-authorizer `covers()` at
  `server/packages/platform/iam/src/permission-authorizer.ts:224`), and because the resource
  carries no `entityCode`/`operationKey`, `validateOperationBinding` (`:151-188`) imposes no
  record binding. So the gate really is "holds the code", not "may read this record".
- `contentAcl.authorize` is the only per-record gate for content items: it requires
  `content.read` and an item-level grant (`server/packages/services/content/src/content-service.ts:5,8`),
  and the content attachment list/link endpoints do call it
  (`server/packages/services/content/src/content-resource-service.ts:6-8`). The download route
  does not.

### Claim corrections (minor, does not change the verdict)

- The evidence says `content-service.ts:4 record() -> aclRepository.authorize`; `record()` is
  defined at `content-service.ts:5` (`:4` is `platform()`), and the interface the route calls,
  `contentAcl.authorize`, is at `:8`. Substance unchanged.
- "any authenticated principal … can retrieve the bytes" is conditional on holding one of the
  legacy plane codes and on knowing the attachment UUID (UUIDs are not enumerable through this
  endpoint; they are disclosed by list endpoints that do require the content read ACL). The
  report states the permission prerequisite, so this is a precision note, not a refutation.
- `content.item` has no in-repo client/UI surface (only `app/entity` entities use the shared
  Files tab), so exploitation is via a direct authenticated API call, not the rendered app.
  That narrows the population who would stumble on it but does not remove the ACL bypass.

### Severity

**high** confirmed: a per-record ACL that is the sole protection for content-item documents is
not enforced when their attachment bytes are issued, including after the grant is revoked, and
the comment-audience check for comment-pinned content-item attachments is skipped as well. The
blast radius depends on how widely `neon.collaboration.attachment.download` (or the two generic
codes) is granted, which is environment data not in this tree.

The original report's proposed fix is the right shape: return the loaded
`{ entityType, entityId }` for these owners (or keep the early return but consult `contentAcl`
in the download route with `contentItemId = row.entity_id`, `required: "read"`), and add a
regression test mirroring `attachment-routes.test.ts:621-633` for `/download`.

---

## Verdict: CONFIRMED — attachment retrieval operations missing from `COMMON_PLANE_RELAY_OPERATIONS` (mesh/studio 404)

Adversarial verification of the finding "Attachment download/preview/extract/search operations
are missing from COMMON_PLANE_RELAY_OPERATIONS, breaking Country attachments on mesh and studio"
(`packages/platform/gateway/bff-relay/src/index.ts:2289`). Severity after verification: **high**.

### Direct reproduction (real app relay factories, no source modified)

Ran the actual exported `createAppRelay` from each app (`apps/mesh/lib/relay.ts`,
`apps/studio/lib/relay.ts`, `apps/neon/lib/relay.ts`) with a verified mesh/studio/neon session and
a stub `fetch`, then called `/api/relay/<path>` through the returned handler:

- mesh + studio — `POST /attachments/:id/download`, `POST /attachments/:id/preview`,
  `POST /attachments/:id/extract`, `POST /attachments/search` → **404 `RELAY_OPERATION_NOT_ALLOWED`**
  (never reaches upstream).
- mesh + studio — `POST /attachments/stage`, `POST /attachments/:id/finalize`,
  `POST /attachments/:id/category`, `POST /attachments/:id/archive`, `POST /attachments/folders`
  → `428 RELAY_IDEMPOTENCY_REQUIRED` (matched = allowed); `GET /attachments/:id/status`,
  `POST /attachments/browse`, `GET /attachments/:id/archive` → 200; and
  `GET /entity-runtime/country/records/:id/collaboration/attachments` (the Files list) → 200.
- neon — the same four retrieval routes → **200** (its allowlist adds
  `...BUSINESS_PARTNER_RELAY_OPERATIONS`, `apps/neon/lib/relay.ts:53`).

This is exactly the claimed plane asymmetry: the Files list renders, upload/rename/folder/archive
work, and only the retrieval half 404s.

### Mechanism, line by line (all citations verified in current source)

- `ATTACHMENT_DOWNLOAD_OPERATION` is defined once (`:499-506`) and referenced only inside
  `BUSINESS_PARTNER_RELAY_OPERATIONS` (array starts `:2202`; member at `:2289`); the
  `attachments.preview` / `attachments.extract` / `attachments.search` literals exist only at
  `:2291-2296`, `:2298-2305`, `:2306-2313`. `COMMON_PLANE_RELAY_OPERATIONS` (`:3532-3549`) spreads
  `COLLABORATION_RELAY_OPERATIONS` (`:3438-3525`, collab comments only) and
  `ATLAS_ANSWER_RELAY_OPERATIONS` (`:526-573`), which contains the attachment lifecycle ops
  (`stage` `:541`, `finalize` `:542`, `status` `:543`, `browse` `:544`, `remove` `:545`,
  `rename` `:546`, `folder` `:547`, `category`, `archive`) but not retrieval.
- `findOperation` (`:2974-3000`) matches method + identical segment count, so no other common op
  (e.g. `GET /attachments/:id/archive`) can absorb `POST /attachments/:id/preview`. The 404 is
  returned at `:2728-2733` **before** session/CSRF/upstream, matching `apps/mesh/lib/relay.ts:37`
  and `apps/studio/lib/relay.ts:43`, which spread `...COMMON_PLANE_RELAY_OPERATIONS` plus only
  plane-specific arrays.
- Client path: `createHttpClient` prefixes `/api/relay` (`packages/platform/foundation/api-client/src/index.ts:103,110`);
  no app sets `relayPrefix`, no `next.config.ts` rewrite or middleware bypasses the relay.
- UI actually issues these calls for the shared Files tab:
  `attachmentPreview` (`collaboration-operations.tsx:11-13`) is used by `attachment-preview.tsx:56-68`
  and `attachment-thumbnail.tsx:258`; `attachmentDownload` (`:97-101`) by
  `attachment-download.ts:10-12`, used by `attachments/collection.tsx:462-466` (`download`) and
  `attachment-reference.tsx:14-19`; `POST /api/attachments/search` at `file-search.tsx:94`.

### Reachability of the Country Files tab (checked because country has no published attachments section)

Country's `definition.json` sections are only overview/phone/address/audit and there is no
`presentation.section.attachments.json` for country, so I checked the other path: the Files tab is
driven by the detail **descriptor**, not by the published page plan.
`server/packages/services/records/src/entity-list-service.ts:534-541` puts
`collaboration` on the detail descriptor from
`entity-collaboration-service.ts:17-33`, which reads the entity core's `capabilities` map and
advertises `attachments` whenever the capability is declared and the read permission admits it
(plane-independent; country declares `attachments` at
`metadata/products/shared/entities/country/capabilities.json`). The shared detail workspace renders
`DetailCollaboration kinds={descriptor.collaboration ?? []}`
(`detail-workspace.tsx:170-175`), loading through `entityRuntimeClient.collaboration`
(`detail-collaboration.tsx:57`) — the common `ENTITY_RUNTIME_ATTACHMENTS_READ_OPERATION`
(`:1200-1207`, composed at `:1275`). So the tab and its action buttons do render on mesh/studio,
and the collection gates download/preview/search on the capability projection actions
(`compiled-section-content.tsx:154-156`; country's binding declares all three).

### Guard/validation checks that do NOT prevent the consequence

- No wildcard/prefix relay matching (`:2974-3000`), and the reject is pre-auth, so no session
  nuance changes the 404.
- No alternate `/api/attachments/*` Next route, proxy, or config rewrite exists in `apps/*`.
- The entity-operation dispatcher can route `attachments.<action>` via the common
  `ENTITY_RUNTIME_OPERATION` (`entity-operation-dispatcher.ts:62-67`), but the shared UI does not
  use that endpoint for files, so it is not a working substitute in the rendered app.
- The omission is not a deliberate plane restriction: these are generic attachment-service routes
  whose capability binding for country uses common permissions, and neon (same shared framework)
  allows them.

### Claim corrections (minor; verdict and severity unchanged)

- `attachments.extract` has **no in-repo client caller** (only the relay definition at `:2298-2305`);
  the country capability declares `extract`, but the UI path is not exercised today. "every
  download/preview/extract/search returns 404" is true at the relay, but extract is currently
  latent rather than user-visible.
- The quoted symptom text "The document could not be downloaded…" is
  `attachment-reference.tsx:20` (the `field.attachmentDownload` reference renderer). The Files-tab
  download button instead surfaces the transport message via `message(cause)`
  (`attachments/collection.tsx:462-472`, `section-primitives.tsx:230-233`), i.e. the problem detail
  `RELAY_OPERATION_NOT_ALLOWED` / "The requested platform operation is not allowlisted"
  (`api-client/src/index.ts:199-204`), which is clearer than the claim suggests.
- The claim's `ATLAS_ANSWER … at :543-546` under-cites the attachment block: `stage` is `:541`,
  `finalize` `:542`, `folder` `:547`. The omission conclusion is unchanged.
- "the common group composes only mutations" is loose: `ATLAS_ANSWER` in common also carries read
  ops (`status`, `browse`, `archive`). The four retrieval ops are nevertheless absent.

### Severity

**high** confirmed: on two of the three plane apps every file download, thumbnail/preview and
content search for any entity with the attachments capability fails at the BFF with
`404 RELAY_OPERATION_NOT_ALLOWED`, while list/upload/rename/folder/archive succeed — which makes it
look like a per-file permission problem. Not critical: no data exposure/integrity issue, the list
still renders, and neon is unaffected. The proposed fix (move `ATTACHMENT_DOWNLOAD_OPERATION` and
the `preview`/`extract`/`search` literals into a shared attachment group spread by
`COMMON_PLANE_RELAY_OPERATIONS`, plus a contract test) is the right shape; the existing
`tests/contracts/app-relay-composition.test.ts` and `relay-common-plane-operations.test.ts` do not
cover these routes, which is why the gap shipped.
