# Adversarial verification — area: BFF relay gateway and app relay adapters

Finding under review: **"Shared record-attachment download/preview/search operations are
allowlisted only on neon, so they 404 on mesh and studio."**
(claimed severity: high)

## Verdict: CONFIRMED (severity high stands)

All cited lines exist verbatim and the consequence was reproduced by replaying the real
per-plane relay composition, not by reading alone.

## 1. Cited code is present and line numbers are correct

- `packages/platform/gateway/bff-relay/src/index.ts:499-506` — `ATTACHMENT_DOWNLOAD_OPERATION`
  (`id: "attachments.download"`, `POST /api/attachments/:attachmentId/download`). Exact match.
- `index.ts:2289` — the only membership site, inside `BUSINESS_PARTNER_RELAY_OPERATIONS`
  (group starts at `index.ts:2202`, closes at `:2330`).
- `index.ts:2290-2297` — inline `attachments.preview`
  (`POST /api/attachments/:attachmentId/preview`).
- `index.ts:2306-2313` — inline `attachments.search` (`POST /api/attachments/search`).
- `index.ts:526-573` — `ATLAS_ANSWER_RELAY_OPERATIONS` contains stage/finalize/status/browse/
  remove/rename/folder, `attachments.category`, `attachments.archive-outcome`, `attachments.archive`,
  plus the Atlas knowledge/answer operations. It does **not** contain download, preview, search or
  extract. Folded into `COMMON_PLANE_RELAY_OPERATIONS` at `index.ts:3532-3549` (spread at `:3539`).
- `apps/neon/lib/relay.ts:53` spreads `BUSINESS_PARTNER_RELAY_OPERATIONS`; `apps/mesh/lib/relay.ts:36-42`
  and `apps/studio/lib/relay.ts:42-54` spread only `COMMON_PLANE_RELAY_OPERATIONS` + their own groups.
- Grep confirms one definition site each: `attachments.download` only at `:500`/`:2289`,
  `attachments.preview` only at `:2291`, `attachments.search` only at `:2307`.

## 2. Empirical replay of the real composition

Loaded the three apps' actual `createAppRelay` factories with `tsx` and invoked the real
`createRelayHandler` on a request shaped exactly like the shared API client emits
(`relayPrefix` default `/api/relay`, and `relayUrl()` strips the leading `api/` — see
`packages/platform/foundation/api-client/src/index.ts:103,174-182`). A non-allowlisted path is
rejected at `index.ts:2727-2733` with `404 RELAY_OPERATION_NOT_ALLOWED` *before* session/dial-out,
so a 401 proves allowlisting and a 404 proves rejection.

```
neon    POST /api/attachments/:id/download   -> ALLOWLISTED (401 auth)
neon    POST /api/attachments/:id/preview    -> ALLOWLISTED (401 auth)
neon    POST /api/attachments/search         -> ALLOWLISTED (401 auth)
neon    POST /api/attachments/:id/extract    -> ALLOWLISTED (401 auth)
neon    POST /api/attachments/stage          -> ALLOWLISTED (401 auth)
mesh    POST /api/attachments/:id/download   -> *** NOT ALLOWLISTED -> 404 ***
mesh    POST /api/attachments/:id/preview    -> *** NOT ALLOWLISTED -> 404 ***
mesh    POST /api/attachments/search         -> *** NOT ALLOWLISTED -> 404 ***
mesh    POST /api/attachments/:id/extract    -> *** NOT ALLOWLISTED -> 404 ***
mesh    POST /api/attachments/stage          -> ALLOWLISTED (401 auth)
studio  POST /api/attachments/:id/download   -> *** NOT ALLOWLISTED -> 404 ***
studio  POST /api/attachments/:id/preview    -> *** NOT ALLOWLISTED -> 404 ***
studio  POST /api/attachments/search         -> *** NOT ALLOWLISTED -> 404 ***
studio  POST /api/attachments/:id/extract    -> *** NOT ALLOWLISTED -> 404 ***
studio  POST /api/attachments/stage          -> ALLOWLISTED (401 auth)
```

`findOperation` matches by method + exact segment count (`index.ts:2974-3000`), so no other
operation accidentally covers these paths on mesh/studio.

## 3. Reachability from the shipped Country record detail (the part most likely to refute it)

I chased the whole chain rather than assuming:

1. Country publishes to all three planes — `metadata/products/shared/entities/country/definition.json:4-8`
   (`["studio","neon","mesh"]`).
2. Country's attachments capability is enabled and declares the actions —
   `metadata/products/shared/entities/country/capabilities.json:114`
   (`"capabilityKey":"attachments"`, `enabled:true`), `:151-156` (`download`),
   `:200-205` (`preview`), `:214-219` (`search`), `:238-243` (`processing.preview/extraction/search: true`).
3. The detail descriptor's collaboration list is capability-derived, not section-derived:
   `server/packages/services/records/src/entity-list-service.ts:534-541` calls the collaboration hook;
   `server/packages/platform/experience/src/entity-collaboration-service.ts:17-33` returns
   `["comments","attachments"]` from `core.content.capabilities` gated by capability admission and a
   registered provider. That provider is registered in *shared* composition
   (`server/apps/platform-host/src/composition/shared/collaboration/section-providers.ts:13-17`),
   not on neon only.
4. Country's detail route uses this descriptor path:
   `packages/platform/entity/runtime/form-detail/src/entity-read-surface.tsx:18-19` →
   `entity-detail-runtime.tsx:44-46` (`entityDescriptorClient.detail`) → `:74` `MetadataDetailWorkspace`
   → `detail-workspace.tsx:170-176` `DetailCollaboration` with `kinds={descriptor.collaboration ?? []}`.
5. The attachments tab loads via a **common-plane** relay op:
   `packages/platform/entity/runtime/descriptor-client/src/runtime-client.ts:157-160` →
   `GET /api/entity-runtime/:entityCode/records/:recordId/collaboration/attachments`, defined at
   `index.ts:1200-1207` and spread into the common group via
   `ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS` (`index.ts:1274-1275`, `:3545`).
6. The read response sets `presentation.rendererKey = capability.binding.serviceKey` =
   `platform.attachments.v1` (`entity-collaboration-service.ts:53`), so
   `compiled-section-content.tsx:130-156` renders `AttachmentCollection` and computes
   `canPreview/canSearch/canDownload` from the projected capability actions
   (`compiled-section-content.tsx:78-79`; projection includes `key` per action —
   `server/packages/contracts/publication/src/entity-capabilities.ts:677-690`).
7. Those flags drive exactly the claimed calls: `attachments/collection.tsx:466` →
   `attachment-download.ts:6-14` → `collaboration-operations.tsx:97-101`
   (`POST /api/attachments/{id}/download`); `attachment-thumbnail.tsx:55` and
   `attachment-preview.tsx:35` → `collaboration-operations.tsx:11-13`
   (`POST /api/attachments/{id}/preview`); `file-search.tsx:94` (`POST /api/attachments/search`),
   wired at `collection.tsx:24-27,130`. All use the shared `useApiClient()` whose
   `relayPrefix` defaults to `/api/relay` (`packages/platform/foundation/api-client/src/index.ts:103`).
8. Only `/api/relay` exists client-side — `apps/{neon,mesh,studio}/app/api/` contain only `auth` and
   `relay`, no `attachments` proxy and no rewrites in `next.config.ts`.

So the input is reachable on mesh/studio for a user holding the same attachment permissions that
make it work on neon: the tab renders, the section loads (common op), and the download/preview/search
calls hit the neon-only allowlist and return 404 before the upstream is dialled. `downloadAttachment`
surfaces this as the generic error message (`collection.tsx:467-468`), not a silent no-op.

## 4. Mitigations looked for and not found

- No second group adds these method+path pairs (only the single sites above).
- No plane gate on the collaboration capability: descriptor kinds come from the shared compiled
  release and a shared provider registry.
- The related test does not catch the drift: `tests/contracts/bff-relay-security.test.ts:372-385`
  asserts only the common subset (stage/finalize/category/archive/unlink/archive-outcome) against
  `ATLAS_ANSWER_RELAY_OPERATIONS` and never checks cross-plane parity. `tests/contracts/relay-common-plane-operations.test.ts`
  likewise only asserts uniqueness and that entity-runtime/collaboration ops are present, not that
  every framework-consumed operation exists on every plane.

## 5. Corrections / additions to the claim (none change the verdict)

- The same defect also covers **`attachments.extract`** (`index.ts:2298-2305`,
  `POST /api/attachments/:attachmentId/extract`), which is likewise neon-only and is the
  `platform.attachments.extract.v1` action declared at `capabilities.json:206-212`. The claim's fix
  should include it.
- The claim's wording "`ATTACHMENT_DOWNLOAD_OPERATION` … has exactly one membership site" is right;
  note it is also *re*-exported nowhere else and not referenced by tests, so a parity test would be
  the correct guard.
- Severity: high is appropriate. It is a per-plane behavioural divergence of shared-framework
  capability, user-visible as broken download/preview/search for record attachments, not a
  defence-in-depth or cosmetic issue.

## 6. Proposed fix (unchanged, plus extract)

Move `ATTACHMENT_DOWNLOAD_OPERATION`, `attachments.preview`, `attachments.search` and
`attachments.extract` into a shared attachment group composed into `COMMON_PLANE_RELAY_OPERATIONS`
(upstream already enforces tenant/record authorization for stage/finalize/archive), and add a
contract test asserting every operation consumed by `packages/platform/entity/runtime/**` exists in
each plane's effective allowlist.
