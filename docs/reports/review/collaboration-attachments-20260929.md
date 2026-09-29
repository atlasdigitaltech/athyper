# Review — Collaboration & Attachments (current working tree, 2026-09-29)

READ-ONLY review of the uncommitted refactor in flight. No source file was modified; no build,
server, or test command was run. All findings are against the tree as it exists on disk, and every
claim is anchored to `path:line` with code quoted verbatim.

Reference record detail page: `/app/entity/country` — attachments workspace, comments and
collaboration surfaces, served through the BFF relay.

---

## Coverage

Scope: every `.ts`/`.tsx` file under the listed trees, including tests and `vitest.config.ts`.
**59 in-scope files, 15,351 lines — all read in full.** Plus 10 adjacent helper files that the
in-scope code depends on (also read in full), and 3 out-of-scope context files read for
authorization/URL-safety reasoning.

### In scope — `server/packages/services/attachments/src/**` (17 files)

| file | lines | verdict |
| --- | --- | --- |
| attachment-routes.ts | 650 | findings 3 (F1, F2, F6) |
| attachment-routes.test.ts | 664 | findings 1 (test gap T1) |
| attachment-lifecycle.ts | 1064 | findings 1 (F5) |
| attachment-lifecycle.test.ts | 966 | clean (strong suite) |
| attachment-security.test.ts | 466 | findings 1 (test gap T2) |
| attachment-discovery-routes.ts | 173 | clean |
| attachment-discovery.test.ts | 176 | clean |
| kysely-attachment-repository.ts | 294 | finding 1 (F1, shared) |
| kysely-attachment-quota-ledger.ts | 127 | clean |
| quota.ts | 8 | clean |
| quota-recovery.ts | 104 | clean |
| quota-recovery.test.ts | 34 | clean |
| quota-concurrency.test.ts | 9 | clean (memory ledger, meaningful) |
| folder-scope.test.ts | 56 | clean |
| retrieval-admission.ts | 142 | clean |
| retrieval-admission.test.ts | 138 | findings 1 (test gap T3) |
| index.ts | 9 | clean |

### In scope — `packages/platform/communications/collaboration-ui/src/**` (11 files)

| file | lines | verdict |
| --- | --- | --- |
| attachment-client.ts | 223 | findings 1 (F10) |
| clipboard-converter.ts | 192 | clean |
| comment-audience-picker.tsx | 135 | clean |
| comment-mention-picker.tsx | 44 | clean |
| index.ts | 7 | clean |
| rich-comment-composer.tsx | 806 | clean |
| rich-text-content.ts | 1 | clean (pure re-export) |
| rich-text-types.ts | 58 | clean |
| upload-lifecycle.ts | 112 | clean |
| use-composer-popover.ts | 51 | findings 1 (F8) |
| validate-clipboard-document.ts | 125 | findings 1 (F7) |

### In scope — `packages/platform/entity/runtime/form-detail/src/attachments/**` (3 files)

| file | lines | verdict |
| --- | --- | --- |
| collection.tsx | 1758 | clean |
| uploader.tsx | 626 | findings 2 (F4, F9) |
| upload-context.tsx | 5 | clean |

### In scope — form-detail `comments-workspace.tsx`, `collaboration-*`, `detail-collaboration.tsx` (8 files)

| file | lines | verdict |
| --- | --- | --- |
| comments-workspace.tsx | 2100 | findings 1 (F10, shared) |
| collaboration-actions.tsx | 108 | clean |
| collaboration-operations.tsx | 153 | clean |
| collaboration-read-models.ts | 103 | clean |
| collaboration-route.ts | 4 | clean |
| collaboration-surface.tsx | 345 | clean |
| collaboration-visibility.ts | 10 | clean |
| detail-collaboration.tsx | 73 | clean |

### In scope — `server/packages/platform/collaboration/src/**` (13 `.ts` + 6 tests + config = 16 files)

| file | lines | verdict |
| --- | --- | --- |
| collaboration-routes.ts | 311 | clean |
| collaboration-service.ts | 680 | clean |
| kysely-collaboration-repository.ts | 304 | clean |
| in-memory-collaboration-repository.ts | 304 | clean |
| rich-text.ts | 245 | findings 1 (F3) |
| draft-maintenance.ts | 56 | clean |
| entity-coordinate.ts | 11 | clean |
| errors.ts | 3 | clean |
| index.ts | 9 | clean |
| `__tests__`/collaboration-service.test.ts | 763 | findings 1 (test gap T4) |
| `__tests__`/collaboration-repository.test.ts | 175 | clean |
| `__tests__`/collaboration-routes.test.ts | 136 | clean |
| `__tests__`/history-admission.test.ts | 62 | clean |
| `__tests__`/entity-coordinate.test.ts | 13 | clean |
| `__tests__`/attachment-file-rich-text.test.ts | 11 | findings 1 (test gap T5) |
| vitest.config.ts | 2 | clean |

### In scope — `server/packages/contracts/collaboration/src/**` (3 + config = 4 files)

| file | lines | verdict |
| --- | --- | --- |
| collaboration.ts | 117 | clean |
| ports.ts | 23 | clean |
| index.ts | 2 | clean |
| vitest.config.ts | 5 | clean |

### Read as required adjacent dependencies (outside the literal scope paths, 10 files)

| file | lines | verdict |
| --- | --- | --- |
| rich-text-render.tsx | 160 | clean (XSS-relevant, see below) |
| entity-edit-collaboration.tsx | 123 | clean |
| attachment-download.ts | 23 | findings 1 (F12) |
| attachment-preview.tsx | 181 | findings 1 (F11) |
| attachment-thumbnail.tsx | 119 | clean |
| attachment-reference.tsx | 22 | clean |
| attachment-workspace.tsx | 4 | clean |
| use-attachment-browse.ts | 90 | clean |
| use-attachment-status-polling.ts | 101 | clean |
| upload-record-attachment.ts | 71 | clean |

Out-of-scope context consulted (not reviewed line-by-line, cited as evidence only):
`server/apps/platform-host/src/composition/shared/documents/attachment-admission.ts` (full),
`packages/contracts/platform/rich-text/src/index.ts` (full),
`server/apps/platform-host/src/composition/register-services.ts` (routes/wiring regions),
`packages/platform/entity/runtime/form-detail/src/section-primitives.tsx` (lines 180–237).

---

## Findings

### [high] F1 — Attachment download is authorized by a plane-wide permission with no record scope, and the read is tenant-wide

**Location**
- `server/packages/services/attachments/src/attachment-routes.ts:250` (download route)
- `server/packages/services/attachments/src/attachment-routes.ts:439` (`allowedAttachment` candidates)
- `server/packages/services/attachments/src/attachment-lifecycle.ts:622` (`createAuthorizedDownload`)
- `server/packages/services/attachments/src/kysely-attachment-repository.ts:136` (`loadForDownload`)

**What is wrong**

`POST /api/attachments/:attachmentId/download` admits the request through
`admitAttachmentAction(..., "download", ...)`. That helper prefers the entity capability, but when
`authorizeCapability` returns nothing it falls back to `allowedAttachment`, whose only resource
input is the attachment id itself:

```ts
        await admitAttachmentAction(
          options, request,
          context,
          "download",
          { attachmentId },
          "download",
          { attachmentId, resourceId: attachmentId },
          false,
        );
```

```ts
  const candidates = [
    planeCode,
    `attachment.${operation}`,
    `document.attachment.${operation}`,
    ...
```

`planeCode` is `neon.collaboration.attachment.download` / `mesh.catalog...` / `studio.catalog...`
(lines 439–444). None of those codes carry the owning record, and the plane/tenant catalog grants
them at `tenant`/`exact` scope. After admission, the lifecycle resolves the row with
`loadForDownload`, which is deliberately *not* uploader- or record-scoped:

```ts
        (tx) =>
          (options.repository.loadForDownload ?? options.repository.load)(
            identity,
            tx,
          ),
```

```ts
    async loadForDownload(identity, tx) {
      const result =
        await sql<Row>`SELECT attachment.*,... FROM document.attachment attachment JOIN document.attachment_series series ... WHERE attachment.tenant_id=${identity.tenantId}::uuid AND attachment.id=${identity.attachmentId}::uuid LIMIT 1`.execute(
```

Compare the uploader-scoped sibling used for every other legacy operation
(`kysely-attachment-repository.ts:131`):

```sql
... WHERE attachment.tenant_id=${identity.tenantId}::uuid AND attachment.id=${identity.attachmentId}::uuid AND attachment.uploaded_by=${identity.principalId}::uuid LIMIT 1
```

The entity-capability admission is genuinely record-scoped — `attachment-admission.ts:59-87` loads
the stored row and denies when the caller-supplied coordinate does not match
(`ENTITY_CAPABILITY_DENIED` → 403 at `attachment-routes.ts:604`). But it deliberately returns
`undefined` for two entity types (`attachment-admission.ts:88-89`):

```ts
    if (entityCode === "content.item" || entityCode === "atlas.prompt")
      return undefined;
```

`undefined` means "fall through to the legacy ACL". So for `content.item` attachments and
`atlas.prompt` attachments the only gate is a plane-wide capability plus a tenant-scoped row load.

**Impact scenario**

Principal A and Principal B are in the same tenant. A uploads `salary-review.pdf` as a
`content.item` (or Atlas prompt) attachment and obtains its UUID. B holds a role with the
tenant-level `document.attachment.download` / `<plane>.collaboration.attachment.download`
permission (declared `risk_tier: low` in
`server/db/ddl/common/authz/18_common_collaboration_permissions.sql:22`). B calls
`POST /api/attachments/<A's id>/download`, receives a 120-second signed URL and reads A's file —
cross-record, same tenant, with no relationship to the record. The same fallback applies to
`status` (line 195) and `finalize` (line 137), though those write paths additionally re-check the
parent coordinate when the entity is a capability-admitted entity.

**Suggested fix**

Either (a) make `loadForDownload` require the caller to present the owning coordinate and verify it
against `attachment_link`/`metadata->>entity_type|entity_id` before signing, or (b) stop returning
`undefined` from admission for `content.item`/`atlas.prompt` and route them through their dedicated
ACLs (`contentAcl.authorize`, prompt ownership) on the download path as is already done for
`stage` (`attachment-routes.ts:63-79`). Add a regression test that principal B cannot download
principal A's attachment for each entity family.

### [medium] F2 — Rename and category changes fall back to the legacy `create` capability

**Location** `server/packages/services/attachments/src/attachment-routes.ts:128`,
`server/packages/services/attachments/src/attachment-routes.ts:42`

**What is wrong** Both metadata mutations declare their legacy operation as `"create"`:

```ts
        await admitAttachmentAction(options, request, context, "rename", { ...value, attachmentId },
          "create", { attachmentId, resourceId: attachmentId }, false);
```

```ts
... await admitAttachmentAction(options, request,context,"category",{...value,...owner,attachmentId,idempotencyKey},"create",{attachmentId,resourceId:attachmentId},false);
```

`"create"` resolves to `attachment.create` / `document.attachment.create` /
`<plane>.collaboration.attachment.create`. The category handler writes the *link* row
(`kysely-attachment-repository.ts:41`):

```sql
UPDATE document.attachment_link link SET metadata=link.metadata||${...}::jsonb WHERE link.tenant_id=... AND link.entity_type=... AND link.entity_id=... AND link.attachment_series_id=(SELECT series_id FROM document.attachment WHERE ... id=${identity.attachmentId}::uuid)
```

**Impact scenario** A principal whose only attachment permission is the tenant-level
`document.attachment.create` (a common grant for anyone who may upload) can, via the legacy path,
rename any attachment series in the tenant and flip its link classification between `general` and
`evidence` on any record for which they know the coordinate — including records they cannot open.
Rename/category are integrity-relevant (evidence tagging, audit display) and are not ownership
checked on this path.

**Suggested fix** Use dedicated legacy operations (`rename`, `categorize`) with a distinct
permission and include `entityType`/`entityId` in the resource passed to the authorizer; or require
entity-capability admission for both.

### [medium] F3 — `projectRichText` emits an `<img>` URL for an endpoint that does not exist

**Location** `server/packages/platform/collaboration/src/rich-text.ts:183`

**Evidence**

```ts
    if (node.type === "attachmentFile") return `<span data-attachment-id="${id}" data-attachment-kind="file" data-attachment-alt="${alt}">Attachment: ${alt}</span>`;
    return `<img src="/api/attachments/${id}/content" data-attachment-id="${id}" alt="${alt}">`;
```

**What is wrong** Every rich comment containing an inline `attachmentImage` is persisted with a
`content_html` projection pointing at `GET /api/attachments/:attachmentId/content`. I enumerated
every attachment route registration — `attachment-routes.ts` (lines 29, 30, 31, 42, 44, 123, 137,
195, 236, 277, 323) and `attachment-discovery-routes.ts` (152, 156, 160, 164) — plus the BFF relay
allowlist (`packages/platform/gateway/bff-relay/src/index.ts:414-533`). **No `/content` endpoint
exists.** The projection is therefore wrong: it advertises an image source that can only 404 (or be
rejected by the relay allowlist).

**Impact scenario** Any consumer that renders the server-side `comment.html` (the current in-scope
client does not — `rich-text-render.tsx` renders `content` and never `html`) shows a broken image
for every inline image. It is also a latent hazard: whoever later adds `/api/attachments/:id/content`
to satisfy this URL must add record-scoped authorization, otherwise the dead link becomes a live
IDOR. The sibling test only pins the *file* branch (`attachment-file-rich-text.test.ts:9`,
`expect(result.html).not.toContain("<img")`).

**Suggested fix** Do not emit a source URL server-side. Emit only
`<span data-attachment-id="..." data-attachment-kind="image" ...>` and let the authorized
client resolve it through `POST /api/attachments/:id/preview` or the download route (both are
admission-checked). Alternatively implement `/content` with the same record-scoped admission as
`preview` and add a test for the `attachmentImage` branch.

### [medium] F4 — Upload queue rows can stay "Processing…" forever with no cancelling affordance

**Location** `packages/platform/entity/runtime/form-detail/src/attachments/uploader.tsx:189`
and `packages/platform/entity/runtime/form-detail/src/attachments/uploader.tsx:546`

**What is wrong** After a successful upload+finalize the client sets the row to `"processing"` and
waits for the section read model to report `active`:

```ts
    const ready = new Set(
      processing
        .filter((item) =>
          knownItems.some(
            (row) =>
              row.id === item.attachmentId && row.processingStatus === "active",
          ),
        )
```

If that never happens, the render path offers **no** terminating action for `"processing"`:
cancel only exists for `uploading`/`finalizing`, and retry/remove only for `failed`:

```ts
              {["uploading", "finalizing"].includes(item.state) ? (
                <button ... onClick={() => uploadControllers.current.get(item.attachmentId)?.abort()}>
```

```ts
              {item.state === "failed" && item.retryable ? ( ... Retry ... ) : null}
              {item.state === "failed" ? ( ... Remove from queue ... ) : null}
```

The shared poller does not help: `use-attachment-status-polling.ts:16-19` only polls rows whose
`processingStatus` is in `["pending","uploading","uploaded","processing"]`, and lines 45–52 stop for
any other value; it also operates on the *server rows*, never on the uploader's local queue.

**Impact scenario** A file that finalizes and is then quarantined, fails inspection, or simply
falls outside the currently loaded section page shows a permanent "Processing…" row. The user
cannot cancel, remove or retry it; only a full page reload clears it. This is the "status polling
that never terminates" class of defect: bounded retries (12 polls) exist for *preview*, but not for
the upload queue.

**Suggested fix** Bound the `processing` state (e.g. a timeout that converts it to `failed` with a
truthful message), drive the queue from `useAttachmentStatusPolling`'s status map, and render a
remove/retry control for every non-`ready` state.

### [medium] F5 — A failed post-finalize staging delete returns 500 for an already-successful finalize and leaks the quarantine blob

**Location** `server/packages/services/attachments/src/attachment-lifecycle.ts:575`

**What is wrong** After the finalize transaction has committed the active row, the staging object is
deleted *outside* the try/catch and *without* the durable-manifest fallback that the error path
uses:

```ts
      if (saved.storageKey !== destinationKey) {
        await recordPendingCleanup(options,identity,[destinationKey]);
        return saved;
      }
      await cleanPendingKeys(options, identity, [current.storageKey]);
```

```ts
async function cleanPendingKeys<T>(options: AttachmentLifecycleOptions<T>, identity: AttachmentIdentity, keys: readonly string[]): Promise<void> {
  const unique=[...new Set(keys)];
  for (const key of unique) await options.storage.delete(key);
  if (unique.length && options.repository.removePendingObjectCleanup)
    await options.transactions.run(identity.planeKey,identity,tx=>options.repository.removePendingObjectCleanup!(identity,unique,tx));
}
```

Contrast the failure path, which does record the manifest:

```ts
  } catch {
    // Compatibility adapters cannot persist the manifest, but must never mask
    // the actual finalize failure. Production repositories implement this port.
    if (options.repository.addPendingObjectCleanup)
      await options.transactions.run(identity.planeKey,identity,tx=>options.repository.addPendingObjectCleanup!(identity,keys,tx));
  }
```

**Impact scenario** Object storage is briefly unavailable right after a successful scan. The
attachment is active and downloadable, but the request fails with 500 (`handle()` falls through to
`next(error)`), and the quarantine key is never written to `pending_cleanup_keys`. Because purge
enumerates only `purgeObjectKeys()` (`kysely-attachment-repository.ts:214-220`) and
`listPendingObjectCleanup()` (`:222-224`), that blob is orphaned permanently while its quota
reservation was already committed. The client tolerates the 500 (it re-probes status and sees
`active`, `upload-lifecycle.ts:100-110`), so the failure is invisible to the user.

**Suggested fix** Route post-commit cleanup through the same `recordPendingCleanup` helper
(which swallows and persists on failure), so a transient delete error neither fails the response
nor orphans the object.

### [low] F6 — Internal `TypeError`s on the attachment routes are reported as 400 client errors

**Location** `server/packages/services/attachments/src/attachment-routes.ts:631`

**Evidence**

```ts
  else if (error instanceof RouteError)
    problem(response, error.status, error.code, error.message);
  else if (error instanceof TypeError)
    problem(response, 400, "INVALID_ATTACHMENT", error.message);
```

**What is wrong** Any `TypeError` — including one thrown by a genuine server-side bug inside the
lifecycle or a driver — is classified as a client validation error, with the raw message echoed in
`detail`. The collaboration twin deliberately does the opposite and is tested for it
(`collaboration-routes.test.ts:131-135`: "does not misreport internal TypeErrors as client
validation errors" → 500). Attachment errors are also matched by message string
(`attachment-routes.ts:633-639`: `error.message === "Attachment not found"` → 404,
`"Attachment was quarantined"` → 422), which is brittle and can reclassify unrelated failures.

**Impact** Real server faults are masked as 400s (no alerting, misleading client retry logic), and
internal error text is returned to the caller.

**Suggested fix** Distinguish explicitly intended validation errors (the private `RouteError`, and
the domain error classes) from unexpected `TypeError`s, and map the latter to `next(error)`.

### [low] F7 — `parseClipboardDocument` calls `JSON.parse` without a guard

**Location** `packages/platform/communications/collaboration-ui/src/validate-clipboard-document.ts:58`

**Evidence**

```ts
  if (raw.length > 1_000_000) invalid();
  const root = object(JSON.parse(raw));
```

**What is wrong** The function's contract is to throw `TypeError("Invalid rich-text clipboard
document")`; a malformed `application/x-athyper-rich-text+json` payload instead throws a raw
`SyntaxError`, and the precedence documented in `clipboard-converter.ts:20-23` means a corrupt
internal payload aborts the paste rather than degrading to the HTML/text branch.

**Verified mitigation** Both live paste entry points catch it: `rich-comment-composer.tsx:230-236`
(`try { conversion = convertClipboard(...) } catch (cause) { event.preventDefault(); setError(...) }`)
and `packages/platform/shell/shell/src/home.tsx` (paste handler, `catch { setError... }`). So this is
a latent robustness defect in an exported helper, not a reachable crash today.

**Suggested fix** Wrap `JSON.parse` in `try/catch` → `invalid()`, and fall back to the next
clipboard precedence level on failure.

### [low] F8 — `useComposerPopover` assumes a `<summary>` exists and calls `hidePopover()` unguarded

**Location** `packages/platform/communications/collaboration-ui/src/use-composer-popover.ts:11`,
`:34`, `:36`

**Evidence**

```ts
    const trigger = host.querySelector("summary")!;
```

```ts
    const focus = (event: FocusEvent) => { if (host.open && event.target instanceof Node && !host.contains(event.target)) { host.open = false; popup.hidePopover(); } };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && host.open) { event.preventDefault(); event.stopPropagation(); host.open = false; popup.hidePopover(); trigger.focus({preventScroll:true}); }
```

**What is wrong** `host.querySelector("summary")!` throws inside `useEffect` for any `<details>`
without a summary (React would surface this as an error-boundary failure, and the effect's cleanup
never registers). `hidePopover()` on a popover that is not open throws `InvalidStateError`; the
`toggle` handler carefully checks `popup.matches(":popover-open")` (lines 30–31) but the focus and
Escape handlers do not, so any desynchronisation between `host.open` and the popover state becomes
an uncaught DOM exception. Both `comment-audience-picker.tsx:44` and
`comment-mention-picker.tsx:26` do render a summary today, so the assertion holds for current
callers.

**Suggested fix** `const trigger = host.querySelector("summary"); if (!trigger || !popup) return;`
and guard every `hidePopover()` with `popup.matches(":popover-open")`.

### [low] F9 — Client-side upload policy fails open when the capability is absent

**Location** `packages/platform/entity/runtime/form-detail/src/attachments/uploader.tsx:41`

**Evidence**

```ts
  const uploadsAllowed = capability?.maxFileBytes !== 0;
```

**What is wrong** With `capability === undefined` this evaluates to `true`, so the drop zone and
file picker are offered, `validateUploadFile(file, capability ?? {})` (line 324) applies no size or
type policy, and the request is only rejected later server-side. Every other guard in the same file
treats a missing capability as "no uploads" (e.g. the duplicate-name check requires
`capability?.actions.some(a => a.key === "search")`, line 339). This is a fail-open default in a
security-adjacent UI gate.

**Impact** A read-only or unadmitted record can present a working-looking upload affordance whose
requests always fail at the server, and the file has already been handed to the browser
(no client-side size pre-check). No server rule is bypassed — the server enforces
`maxUploadBytes` at stage (`attachment-routes.ts:93-101`) before issuing an upload URL.

**Suggested fix** `const uploadsAllowed = Boolean(capability) && capability.maxFileBytes !== 0;`

### [low] F10 — `crypto.randomUUID()` is used without a secure-context fallback in interactive handlers

**Location** `packages/platform/communications/collaboration-ui/src/attachment-client.ts:161`,
`packages/platform/communications/collaboration-ui/src/rich-comment-composer.tsx:328`,
`packages/platform/entity/runtime/form-detail/src/comments-workspace.tsx:893`,
`packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:290`

**Evidence**

```ts
  const created = options.createAttachmentId?.() ?? crypto.randomUUID();
```

```ts
    editDraftScope.current = `entity_edit_${crypto.randomUUID().replaceAll("-", "")}`;
```

**What is wrong** `crypto.randomUUID` is only defined in secure contexts. On a non-loopback
`http://` origin it is `undefined`; line 893 throws synchronously inside a React `onClick` handler
(uncaught, no error UI), and line 161/328/290 fail the operation with a `TypeError` rather than a
clear message. The rest of the codebase already centralises CSRF/URL handling with fallbacks, so
this is an inconsistency rather than a design choice.

**Suggested fix** Route id generation through one helper that falls back to a
`crypto.getRandomValues`-based UUIDv4 (or reuse the server-issued id pattern already available in
`upload-record-attachment.ts:47`, which keys stage/finalize by the returned attachment id).

### [low] F11 — Preview `iframe` is not sandboxed and "isolated origin" does not imply a different site

**Location** `packages/platform/entity/runtime/form-detail/src/attachment-preview.tsx:93` and
`packages/platform/communications/collaboration-ui/src/upload-lifecycle.ts:23`

**Evidence**

```tsx
        fullDocument ? (
          <>
            <iframe
              title={intl.message("files.documentPreview")}
              src={value.url}
              referrerPolicy="no-referrer"
            />
```

```ts
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  if (
    (target.protocol !== "https:" && !(target.protocol === "http:" && loopback)) ||
    target.username || target.password || target.hash ||
    (options.isolatedFromOrigin && target.origin === options.isolatedFromOrigin)
  )
```

**What is wrong** The control that matters here *is* present and correct: preview URLs must be HTTPS
(or loopback), must not carry credentials or a fragment, and must not share the app's exact origin
— and download URLs are always forced to `application/octet-stream` with an `attachment`
disposition (`attachment-lifecycle.ts:660-663`), so origin-scoped script execution through a
mislabeled upload is well contained. Two residual hardening gaps: the iframe has no `sandbox`
attribute, and an origin check of `host:port` permits a subdomain of the app's registrable domain
(same-site), which shares cookies with `Domain=.example.com`. A browser PDF viewer exploit or a
spoofed-origin page in that frame would then be same-site rather than cross-site.

**Impact** Defence-in-depth only; I found no path in the in-scope code that serves attacker-authored
HTML with a scriptable content type.

**Suggested fix** Add `sandbox` (no `allow-scripts`, no `allow-same-origin`) to the preview iframe,
and require the isolated origin to differ in *site* (eTLD+1), not just origin.

### [low] F12 — Download anchor is clicked after an `await`, so the new tab may be blocked silently

**Location** `packages/platform/entity/runtime/form-detail/src/attachment-download.ts:10`

**Evidence**

```ts
  const result = await client.request(attachmentDownload(attachmentId), {
    body: { expirySeconds: 120 },
  });
  const url = attachmentCapabilityUrl(result.url);
  const anchor = document.createElement("a");
  anchor.href = url.href;
  anchor.download = "";
  anchor.target = "_blank";
  ...
  anchor.click();
  anchor.remove();
```

**What is wrong** `anchor.click()` with `target="_blank"` runs after the awaited network round trip,
so the user-gesture context is gone. Browsers may treat the resulting navigation as unsolicited and
block it; because the `try/catch` in `downloadAttachment` only spans the request (the click itself
does not throw), a blocked open produces no error and no feedback. This is browser heuristic
dependent and cannot be confirmed statically, hence low confidence.

**Suggested fix** Keep the anchor click in the same task (pre-fetch on pointer-down/keydown) or
detect the blocked case and surface a "download link ready — click to open" affordance.

### Test-assurance gaps (no production defect by themselves)

- **T1 — `attachment-routes.test.ts:651`**: `rejects malformed download expiry and prevents caching
  signed URLs` proves the *legacy* fallback returns 200 for a plane-wide
  `document.attachment.download` grant, and does so with `createAuthorizedDownload` mocked
  (lines 257-261). Nothing asserts a second principal is refused.
- **T2 — `attachment-security.test.ts:420`**: the only `createAuthorizedDownload` test supplies no
  `loadForDownload` (fixture lines 26-76), so the tenant-wide lookup that carries F1's risk is never
  exercised, and there is no cross-tenant/cross-owner case anywhere in the file.
- **T3 — `retrieval-admission.test.ts:119`**: `{ ...request.source, entityCode: "atlas.prompt" }` is
  expected to be rejected, but it is rejected by the shape regex
  `/^[a-z][a-z0-9_]*$/` (`retrieval-admission.ts:51`, no dots allowed), not by any prompt-specific
  policy. The assertion gives false assurance about Atlas source handling.
- **T4 — `collaboration-service.test.ts:398`**: the harness authorizer is
  `authorize: async () => ({ allowed: !options.deny })` and ignores `permissionCode`, so the 9-method
  "denies %s without mutation permission" table (lines 704-728) cannot catch a typo or wrong code in
  `PERMISSION` (`collaboration-service.ts:25-33`). No test asserts any specific permission string.
- **T5 — `attachment-file-rich-text.test.ts:9`**: only the `attachmentFile` branch is pinned
  (`not.toContain("<img")`). The `attachmentImage` branch that emits the dead `/content` URL (F3) has
  no test.

---

## Checked and clean

Everything below was verified against the current tree; these were my primary suspicions and they
came back correct.

**Rich-text XSS / script injection (highest-value check) — clean end to end.**
- `packages/platform/entity/runtime/form-detail/src/rich-text-render.tsx` is the only client path
  that renders comment bodies, and it builds React elements, never markup. Text goes through
  `return applyCommentMarks(node.text ?? "", node.marks);` (`:67-68`), mention labels render as
  text (`:70-71`), attachment placeholders as text (`:77`), heading tags are chosen from a numeric
  allowlist (`:86-90`) and table spans are clamped by `tableSpan` (`:157-160`).
- Links are gated twice: `applyCommentMarks` requires `safeHref(attrs.href)` before emitting
  `<a href=...>` (`rich-text-render.tsx:139-152`), and `safeRichTextHref`
  (`packages/contracts/platform/rich-text/src/index.ts:9-23`) only returns a URL whose protocol is
  one of `http:`, `https:`, `mailto:` — so `javascript:`, `data:`, `vbscript:` and control-character
  smuggling variants are rejected (`new URL` strips tabs/newlines before the protocol check).
- `grep -rn "dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|outerHTML|document.write|createContextualFragment"`
  over both in-scope UI trees returns only `rich-comment-composer.tsx` lines 190, 223, 344, 357,
  394, 442 — all of which write the composer's *own* `serializeForClipboard(...)["text/html"]`
  output, and that serializer escapes every interpolation
  (`clipboard-converter.ts:190-192`, `escape()` at `:192` escapes `& < > " '`).
- The server projection is equally strict: `rich-text.ts:10-25` allowlists node types, `:124-152`
  allowlists children per container, `:153-172` allowlists marks and rejects unsafe link hrefs via
  `safeRichTextHref`, and `escape()` (`:235-242`) escapes all five HTML metacharacters for every
  interpolation including `alt` and `data-mention-principal`. `collaboration-service.test.ts:284-298`
  proves `<script>` in text becomes `&lt;script&gt;` and never appears raw, and `:301-350` proves
  `javascript:` links are rejected.
- The server-side HTML is never fed to the DOM in scope: `grep -rn "\.html\b"` over both in-scope UI
  trees returns no hits — `rich-text-render.tsx:63` reads `item.content`, not `item.html`.
- `clipboard-converter.ts:103` drops `script/style/meta/link/iframe/object/embed/form/input/button/svg/img`
  (the `img` case is handled earlier at `:102` only when `data-attachment-id` is a valid UUID), so
  hostile pasted markup cannot enter the editable document.
- `validate-clipboard-document.ts:63-124` bounds nodes (2000), depth (20), text (50000),
  attr types/lengths (2048), mark allowlist, mention/attachment UUIDs and table rows/columns — the
  clipboard MIME is not trusted.

**IDOR / ownership on the entity path — clean.**
- `attachment-admission.ts:59-87`: the stored row is loaded by id, draft/comment/uploader ownership
  is enforced (`:61-68`), and a caller-supplied coordinate that disagrees with the stored one is
  rejected (`:70-74`) before any policy resolve; `finalize` additionally re-checks the admitted
  policy hash (`:106-107`). The route maps `ENTITY_CAPABILITY_DENIED` to 403 without leaking the
  policy message (`attachment-routes.test.ts:409-416`).
- Comment ownership is enforced in SQL, not just in the UI: edit
  (`kysely-collaboration-repository.ts:90` `AND commenter_id=${command.context.principalId}::uuid`),
  delete (`:110`), reactions (`:118`, `:125`), history (`:33`), and comment drafts are
  principal-scoped (`:154`, `:162`). `collaboration-service.test.ts:729-744` covers non-author
  edit/delete.
- Attaching an upload to a comment requires the attachment to be the caller's own and in the same
  coordinate/draft: `kysely-collaboration-repository.ts:223`
  (`AND a.uploaded_by=${command.context.principalId}::uuid AND (a.draft_id IS NULL OR EXISTS(... d.principal_id=${...} ...))`),
  with a 422 when no such row exists (`:226-236`). This closes the "attach someone else's file id to
  my comment" IDOR.
- Comment audience/visibility is server-resolved (`collaboration-service.ts:81`
  `visibility: command.visibility ?? capability?.defaultAudience ?? "public"`), and a denied
  capability throws before any fallback (proved by `collaboration-service.test.ts:441-458`).
- Comment reads are never served by an unscoped query in scope: history is owner-only
  (`kysely-collaboration-repository.ts:33-35`), and the discovery service re-runs admission per hit
  before returning a snippet (`attachment-discovery-routes.ts:97-99`).

**Attachment storage / path handling — clean.**
- Storage keys are entirely server-generated and contain no client input:
  `quarantine/${planeKey}/${tenantId}/${attachmentId}/${randomUUID()}` and
  `attachments/${planeKey}/${tenantId}/${attachmentId}/${randomUUID()}/original`
  (`attachment-lifecycle.ts:935-940`). No path traversal is reachable from `fileName`.
- Content-Disposition is quoted and sanitized:
  `attachment; filename="${(current.fileName ?? "attachment").replace(/[^a-zA-Z0-9 ._()-]/g, "_")}"`
  (`attachment-lifecycle.ts:662`) strips quotes, backslashes, CR/LF and non-ASCII, so header
  injection and quote-breakout are not possible. Preview dispositions are hardcoded
  (`attachment-discovery-routes.ts:56`).
- MIME/extension trust is contained: downloads are forced to
  `contentType: "application/octet-stream"` + `attachment` (`attachment-lifecycle.ts:660-663`), and
  previews are forced to the derivative's server-chosen type with `inline` + a fixed filename
  (`attachment-discovery-routes.ts:54-57`). Client-declared `contentType` only gates *which*
  preview rendition is offered (`:53`) and must match the finalized type
  (`attachment-lifecycle.ts:416-422`).
- Storage key collisions are prevented by the per-attempt `randomUUID()`, and a concurrent
  finalizer cannot be clobbered because each attempt scans its own immutable copy
  (`attachment-lifecycle.ts:428-430`, `:446`; proved by `attachment-security.test.ts:297-349`).
- Expiry is enforced on every path: staged uploads cannot be finalized after expiry
  (`attachment-lifecycle.ts:851-859`), upload URLs are `min(uploadUrlTtl, reservation remaining)`
  (`:380-395`), download URLs are clamped to the attachment's own expiry
  (`:645-656`; test `attachment-security.test.ts:420-434`).
- `attachmentCapabilityUrl` (`upload-lifecycle.ts:23-45`) validates every server-issued URL before
  use: HTTPS (or loopback HTTP), no credentials, no fragment, and for previews a different origin.
- Size limits are enforced server-side *before* an upload URL is minted
  (`attachment-routes.ts:93-101`), the streamed byte count is bounded by the staged size
  (`attachment-lifecycle.ts:911-914`), and scanner under-consumption is rejected
  (`:922-927`; tests `attachment-security.test.ts:278-289`, `:399-411`).

**Upload lifecycle, timers, and memory — clean.**
- Preview polling is bounded: `attachment-preview.tsx:52-53` (`++polls < 12`) and
  `attachment-thumbnail.tsx:59-61` (same); status polling caps failures at 5 and backs off to 10 s
  (`use-attachment-status-polling.ts:55-63`, `:70-71`).
- Every timer/observer/abort is released: `use-composer-popover.ts:43-48`,
  `attachment-preview.tsx:79-82`, `attachment-thumbnail.tsx:75-78`,
  `use-attachment-status-polling.ts:75-78`, `comments-workspace.tsx:769-775`,
  `use-attachment-browse.ts:74-78`, `uploader.tsx:76-82`.
- Cancellation is correct in both directions: the client aborts on unmount and drops the queue row
  (`uploader.tsx:142-157`), and the server aborts the download/scan stream on client disconnect via
  `response.once("close", ...)` with a `writableEnded` guard (`attachment-routes.ts:146-154`,
  proven over a real socket in `attachment-routes.test.ts:489-619`).
- Uncertain finalization is resolved before restaging: `upload-lifecycle.ts:82` short-circuits when
  status is already `active`, `:98-111` probes status after a 5xx before retrying finalize, and
  `retry` is only true for a repeated token (`attachment-client.ts:71`,
  `upload-record-attachment.ts:115-117`). No client-side success is left unconfirmed.
- Large files are never buffered: the browser sends the `File` blob directly
  (`upload-lifecycle.ts:47-67`, `body: file`) and the server streams with a
  `sha256` + size accounting transform (`attachment-lifecycle.ts:902-930`). The only in-memory
  buffers are the uploader's queue (which holds `File` handles, not bytes) and a bounded
  `extracted_text` slice.
- Orphaned rows vs orphaned blobs are handled deliberately: `finalizeClean` seeds
  `pending_cleanup_keys` with the staging key in the same transaction
  (`kysely-attachment-repository.ts:152`), purge unions pending keys
  (`:214-220`), and `cleanupRetention` drains the pending manifest
  (`attachment-lifecycle.ts:778-785`). The single gap on this path is F5 below.
- Retry/duplicate semantics: stage is keyed on the client-generated attachment id and is idempotent
  per reservation (`attachment-lifecycle.ts:309-353`; `attachment-security.test.ts:208-227`), folder
  and archive commands are receipt-backed (`:288-308`, `:278-283`;
  `attachment-lifecycle.test.ts:919-958`), and the client keeps one idempotency key per intent
  (`collection.tsx:284-295`, `comments-workspace.tsx:586-589`).

**Collaboration data integrity — clean.**
- Comment create/edit/delete/flag/reaction/mention writes and their outbox events share one
  transaction (`collaboration-service.ts:104-158`, `:181-221`), and a failing outbox rolls the
  comment back (`collaboration-service.test.ts:87-122`).
- Mention resolution fails closed: unknown principals are rejected 422
  (`collaboration-service.ts:510-521`) and mention notifications are emitted only for newly added
  ids (`kysely-collaboration-repository.ts:100`; `collaboration-service.test.ts:646-662`, `:746-754`).
- Notification attachments must reference a selected comment attachment
  (`collaboration-service.ts:677-679`; test `:756-763`).
- Thread depth, parent coordinate and legacy `master.business_partner` aliasing are validated in SQL
  (`kysely-collaboration-repository.ts:54-79`, `:143-153`, `entity-coordinate.ts:1-11`).
- Idempotency receipts are transactional and fingerprint-bound
  (`collaboration-service.ts:106-133`; `collaboration-service.test.ts:599-645`).

**Robustness, typing, dates — clean.**
- Date handling: `collaboration-service.ts:659-675` rejects impossible calendar dates by
  round-tripping the date prefix and normalises to UTC, so the lexicographic comparison at
  `:346-349` is sound; `kysely-collaboration-repository.ts:279-281` and
  `kysely-attachment-repository.ts:290-294` normalise every timestamp to ISO; `collaborationTime`
  renders `""` for an unparseable date (`collaboration-actions.tsx:87-97`).
- Read cursors never move backwards (`collaboration-service.ts:346-349`,
  `kysely-collaboration-repository.ts:167-173`, in-memory `:197-202`).
- Unbounded queries: retention candidates are clamped 1..1000 and `FOR UPDATE SKIP LOCKED`
  (`attachment-lifecycle.ts:776`, `kysely-attachment-repository.ts:232-239`); browse/search page at
  51/26 rows with SQL-side predicates and a 2 s `statement_timeout` on content search
  (`attachment-discovery-routes.ts:80-92`, `:122-147`).
- `pendingImage` nodes cannot reach persistence: the server validator has no such node
  (`rich-text.ts:10-25` → `Unsupported rich-text node`), the composer resolves them before append
  (`clipboard-converter.ts:57-67`), and the workspace strips them from drafts
  (`comments-workspace.tsx:536-548`).
- Swallowed catches in scope are deliberate and narrow: `retrieval-admission.ts:137` fails closed
  with `return false`; `collaboration-service.ts:592-611` `fanout` is best-effort with
  `.catch(() => undefined)` and never affects the committed transaction;
  `detail-collaboration.tsx:59-61` sets an error state; `use-attachment-browse.ts:56-57` sets a
  generic retry message under a generation guard. No swallowed catch hides a security decision.
- No `JSON.parse` on external input without a guard except F7 (the two repository `JSON.parse`
  calls at `kysely-attachment-repository.ts:218` and `:245` parse a `jsonb` column, which is
  valid by construction, and `use-attachment-status-polling.ts:26` /
  `collection.tsx:335` parse strings this code itself produced).
- `getData`/URL building is encoded everywhere it matters: `encodeURIComponent` on every id in
  `collaboration-operations.tsx` (lines 12, 52, 67, 72, 77, 84, 90, 95, 100, 105, 111, 123, 132,
  146, 151) and `attachment-client.ts` (lines 83, 118, 134, 142); `URLSearchParams` in
  `comments-workspace.tsx:2091`.

---

## Highest-risk 5

1. **[high] Cross-record attachment download via the legacy fallback** —
   `attachment-routes.ts:250` + `kysely-attachment-repository.ts:136`. A tenant-level
   `attachment.download` grant plus a known attachment id yields a signed URL for
   `content.item`/`atlas.prompt` files belonging to other users. Record-scoped admission exists but
   is bypassed for exactly those two entity types (`attachment-admission.ts:88-89`).
2. **[medium] Rename/evidence-category writes gated only by `attachment.create`** —
   `attachment-routes.ts:128`, `:42`. Integrity-relevant metadata changes on any tenant attachment,
   no record scope on the legacy path.
3. **[medium] Comment HTML projection references a non-existent endpoint** —
   `rich-text.ts:183` emits `<img src="/api/attachments/{id}/content">`; no such route exists in
   `attachment-routes.ts`, `attachment-discovery-routes.ts`, or the BFF relay allowlist. Broken
   content today, an IDOR trap if someone implements the route without record-scoped admission.
4. **[medium] Upload queue rows stuck in `processing` with no cancel/retry/remove** —
   `uploader.tsx:189`, `:546`. Terminal-but-not-`active` states (quarantine, inspection failure,
   row outside the loaded page) leave a permanent, un-actionable queue entry.
5. **[medium] Post-finalize staging-delete failure returns 500 for a successful upload and orphans
   the quarantine blob** — `attachment-lifecycle.ts:575`. No durable cleanup manifest is written on
   this path, unlike the error path at `:980-990`.

---

### Method & limitations

- Read-only: no file was modified, no build/test/server command was run. Commands used were limited
  to `find`, `wc`, `git status --porcelain`, `grep`, and `sed` for enumeration and context.
- The BFF relay (`packages/platform/gateway/bff-relay/src/index.ts`) and the platform host wiring
  (`server/apps/platform-host/src/composition/register-services.ts`) are outside the assigned scope
  and were not reviewed line-by-line; they were consulted only to confirm which endpoints exist and
  how `authorizeCapability` is supplied. Conclusions about the legacy fallback assume the host keeps
  passing `authorizeCapability` (it does today, `register-services.ts:3313`).
- "Findings N" in the coverage table counts findings whose primary location is that file; F1 is
  shared across `attachment-routes.ts`, `attachment-lifecycle.ts` and
  `kysely-attachment-repository.ts`.
