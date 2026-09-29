# Fresh review — Entity detail / form runtime

**Auditor area:** `packages/platform/entity/runtime/form-detail/src/**` (94 files, 19,888 lines)
**Shipped route traced:** `https://{studio,neon,mesh}.dev.athyper.test/app/entity/country/<uuid>` (detail) and `.../app/entity/country/` (list)
**Method:** read-only. Inventory with `find`/`wc -l`, then full reads of the Country render path, then targeted grep sweeps plus two executed Node test runs (read-only; no files written outside this report).
**Independence:** no pre-existing review under `docs/reports/` was opened.

## 1. The actual Country detail render path (measured, not assumed)

```
apps/{studio,mesh,neon}/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx:4
  -> createEntityReadPage (form-detail/src/routes/entity-read-route.tsx:15)
  -> renderEntityReadRoute (…:10) -> resolveEntityReadRoute
       (contracts/platform/entity-runtime/src/routes/entity-read-route.ts:8)
  -> EntityReadSurface (entity-read-surface.tsx:10)  [recordId ? detail : list]
  -> EntityDetailRuntime (entity-detail-runtime.tsx:27)
       entityDescriptorClient.detail() + .record() in parallel (…:44-47)
  -> MetadataDetailWorkspace (detail-workspace.tsx:33)
       -> EntityRecordHeader (record-header.tsx:9)          [showNavigation={false}]
       -> own tablist (detail-workspace.tsx:199-260) + RecordSectionMenu/RecordModeNavigation
          (record/record-navigation.tsx)
       -> EntityRecordFields (record-fields.tsx:4)          [4 sections, navigation.mode="scroll"]
       -> DetailCollaboration (detail-collaboration.tsx:25)
            -> EntityCollaborationSurface (collaboration-surface.tsx:36)
            -> CapabilityContent -> CompiledEntitySectionContent
                 (compiled-section-content.tsx:27)
                 comments  -> CommentsWorkspace (comments-workspace.tsx)
                 attachments -> AttachmentCollection + AttachmentUploader
                 activity  -> ActivityWorkspace
```

Country metadata facts that constrain the audit (read from `metadata/products/shared/entities/country/`):
`definition.json` declares only `list`/`read` runtime bindings and no `patch`, so
`buildSharedReferenceGraph` publishes `operations: ["list","read"]` and
`recordPresentation.actions: []` (`server/packages/planes/studio/meta-entity-authoring/src/authoring/graph-builder.ts:58,80`).
**The Country detail screen is therefore read-only**: no Edit/Patch action, no per-field reveal,
no `summaryView`, no `relationshipKey` sections, `editHref` is never supplied
(`EntityDetailRuntime` accepts `editHref?` but no caller passes it — `apps/neon/.../[moduleSlug]/[[...segments]]/page.tsx:33` and the read route both omit it).
`collaboration: ["comments","attachments"]` and `activity: true` *are* published
(`metadata/.../country/capabilities.json`, `activity.json`), so the Comments/Files/Activity
panel **is** live on the Country detail page. That panel is where most of the user-visible
defects below land.

## 2. Findings

### F1 — HIGH (broken gate): the detail-composition import-boundary contract test fails today

`tests/contracts/detail-navigation.test.ts:94-111` asserts the **exact** sorted import list of
`detail-workspace.tsx`:

```ts
  assert.deepEqual(
    imports.sort(),
    [
      "react",
      "@athyper/contract-platform-entity-runtime",
      "@athyper/platform-shell",
      "@athyper/platform-ui",
      "@athyper/platform-i18n/entity-labels",
      "@athyper/platform-i18n/entity-react",
      "./detail-collaboration",
      "./record-header",
      "./record/record-navigation",
      "./record/record-summary-panel",
      "./section-navigation",
      "./record/write-record-location",
      "./record/record-view-preferences",
    ].sort(),
  );
```

The reviewed file now imports two more modules (`detail-workspace.tsx:2-3`):

```tsx
import { EntityRecordFields } from "./record-fields";
import { EntityRelatedSection } from "./related-entity-section";
```

I ran the suite: `./node_modules/.bin/tsx --test tests/contracts/detail-navigation.test.ts` →
`✖ metadata detail composition has an explicit shared-only import boundary`, with `actual`
containing `'./record-fields'` and `'./related-entity-section'` and `expected` not containing
them. The suite is part of the standard gate (`package.json:76`,
`"test:plane-contracts": "tsx --test tests/contracts/*.test.ts"`).

Why it is wrong / impact: the guard whose stated purpose is "metadata detail composition has an
explicit shared-only import boundary" is red, so `pnpm test:plane-contracts` fails and the
boundary is no longer actually verified (a future entity-specific or plane-specific import into
`detail-workspace.tsx` would be as red as this legitimate one, i.e. the signal is lost).
Consequence on the shipped route: none at runtime for `/app/entity/country/<uuid>`; the
consequence is a permanently failing gate on the shared framework that owns that route.
Fix: add the two imports to the expected array (they are shared-only, no entity/plane names) —
or, better, relax the assertion to "no import matches `country|currency|business_partner|/apps/|plane`"
so legitimate shared refactors do not require editing the list. Verify with
`pnpm test:plane-contracts`.

### F2 — HIGH (suite cannot collect): `entity-related-presentation` dies on a missing fixture file

`tests/foundation/entity-related-presentation.test.tsx:18-26`:

```ts
const config = JSON.parse(
  readFileSync(
    new URL(
      "../../server/db/scripts/provisioning/config/business-partner-record-presentation.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
```

This is module top-level, so the whole file fails at collection. I ran
`tsx --tsconfig tooling/config/tsconfig-react.json --test tests/foundation/entity-related-presentation.test.tsx`:

```
Error: ENOENT: no such file or directory, open
'/home/chandravel_natarajan/src/athyper/server/db/scripts/provisioning/config/business-partner-record-presentation.v1.json'
  at tests/foundation/entity-related-presentation.test.tsx:19:3
✖ tests/foundation/entity-related-presentation.test.tsx
```

I verified the target does not exist anywhere:
`ls server/db/scripts/provisioning/config/` → `No such file or directory`; a repo-wide
`find` for `*record-presentation*` returns only
`server/db/scripts/provisioning/publish-development-record-presentation.ts` and docs.
`server/db/scripts/provisioning/publish-development-record-presentation.ts:15-17` requires the
path as a CLI argument and has no bundled default. The absent path is nevertheless still
documented as the publication source (`docs/contracts/entity-record-presentation.md:72`,
`docs/contracts/related-record-presentation.md:5`).

Why it is wrong: the suite that guards `RelatedRecord`/`RelatedSectionError`/`safeChannelHref`
(753 lines of shared detail rendering) cannot run at all. Consequence on the shipped Country
route: low direct runtime impact (Country publishes no `related` profiles or `summaryView`, so
`related-record.tsx` is currently unreachable from `/app/entity/country/<uuid>`), but the shared
framework's detail-rendering regression coverage is silently gone.
Fix: check the fixture back in under
`server/db/scripts/provisioning/config/`, or make the test skip (`test(..., { skip: !existsSync(...) })`)
with an explicit reason; then re-run `pnpm test:foundation`.

### F3 — MEDIUM: drag-to-upload gate compares a browser protocol token against localized UI copy

`packages/platform/entity/runtime/form-detail/src/attachments/collection.tsx:828-838`:

```tsx
      onDragEnter={(event) => {
        if (
          upload &&
          Array.from(event.dataTransfer.types).includes(
            intl.message("collaboration.files"),
          )
        ) {
          event.preventDefault();
          setUploadOpen(true);
        }
      }}
```

`dataTransfer.types` is a protocol value; the OS file drag sets the literal token `"Files"`.
The uploader itself compares against the literal, correctly
(`attachments/uploader.tsx:406-416`: `.includes("Files")`). `intl.message("collaboration.files")`
is `"Files" | "Fail" | "الملفات"` (`packages/platform/foundation/i18n/src/catalogs/collaboration.ts:356`).

Why it is wrong: in any non-English locale the comparison can never match, so dragging a file
over the Files panel no longer auto-opens the upload dock. Consequence on the shipped Country
route: on `/app/entity/country/<uuid>` → Files tab, Malay/Arabic users get no drag affordance
(the upload dock can still be opened with the "Add" button, so no data is lost — hence medium,
not high). Mitigation checked: no server-side or other client guard compensates; `upload` is
non-null for Country because `capabilities.json` declares `create`+`finalize`
(`compiled-section-content.tsx:169-181`), so the branch is intended to fire.
Fix: compare with the literal `"Files"` (and keep a constant), matching `uploader.tsx:409`.

### F4 — MEDIUM: an unknown record is a retry dead end instead of a not-found

`packages/platform/entity/runtime/form-detail/src/entity-detail-runtime.tsx:52-66`:

```tsx
  if (!loaded.data)
    return (
      <PageWorkspace
        header={{ level: "collection", title: humanizeIdentifier(entityCode) }}
      >
        <Card>
          <InlineStatus tone={loaded.error ? "danger" : "neutral"}>
            {loaded.error
              ? localizedEntityError(loaded.error, intl)
              : intl.message("detail.loadingRecord")}
          </InlineStatus>
          {loaded.error ? <Button variant="secondary" onClick={loaded.reload}>{intl.message("entity.retry")}</Button> : null}
        </Card>
      </PageWorkspace>
    );
```

`loaded.error` is not inspected for a 404, and no `notFound()` is ever called from this surface
(the only `notFound()` is `routes/entity-read-route.tsx:12`, which only covers malformed route
shapes). The server genuinely answers 404 for a well-formed but absent id —
`server/packages/services/records/src/entity-list-service.ts:580-585` throws
`RecordServiceError(404, "ENTITY_RECORD_NOT_FOUND", …)`.
`localizedEntityError` maps anything unrecognized to `error.unavailable`
(`packages/platform/foundation/i18n/src/entity-errors.ts:14` → "The request could not be
completed. Try again.").

Why it is wrong: `/app/entity/country/<valid-but-unknown-uuid>` renders "…Try again" and a Try
again button that re-issues the same failing read forever; the user gets no 404, no
"record does not exist" copy, and no way out except editing the URL. Consequence on the shipped
Country route: real, reachable (any stale bookmark/link).
Fix: in `EntityDetailRuntime`, branch on the transport status/code before rendering the retry
state — call `notFound()` (Next) or render a non-retryable not-found state when
`(error as ApiTransportError)?.status === 404 || problem?.code === "ENTITY_RECORD_NOT_FOUND"`.

### F5 — MEDIUM: hardcoded user-visible English inside the shared detail composition

Measured: 27 JSX literal-text nodes matching `>[A-Z][a-z]+…<` across 9 files, plus toast/error
copy built as template strings. Those on the Country path (`/app/entity/country/<uuid>` and its
Files/Comments/Activity panel) are user-visible:

`detail-workspace.tsx:202` and `:325` (screen-reader names on the Country page):

```tsx
                    aria-label="Record modes"
...
                label="Record sections"
```

`record/record-navigation.tsx:195,204` (the Overview section menu the Country page renders
because `activeTab.sectionKeys.length === 4`):

```tsx
      <summary aria-label={compact ? `${label} sections` : undefined} aria-current={active ? "page" : undefined}
...
      <div role="menu" aria-label={`${label} sections`} onKeyDown={event => {
```

`compiled-section-content.tsx:166` + `collection-continuation.tsx:31-37` (visible text on the
Country Files tab whenever more than one page exists):

```tsx
                <CollectionContinuation cursor={String(values?.nextCursor)} automatic={false} label="Load more files" loading={loadingMore} failed={!!loadMoreError} onLoadMore={onLoadMore} />
```
```tsx
    <p role="status" aria-live="polite">{failed
      ? "Could not load more records. Your loaded records are still available."
      : loading ? "Loading more records…" : automatic ? "More records load as you scroll." : "More records are available."}</p>
    <Button type="button" variant="secondary" disabled={loading} onClick={() => {
      attempted.current = cursor;
      onLoadMore();
    }}>{loading ? "Loading…" : failed ? "Try again" : label}</Button>
```

`attachments/collection.tsx` toasts/dialogs shown on the Country Files tab:

```tsx
484:      notifySuccess(`File “${fileLabel(item)}” removed from record`);
524:      notifySuccess(`File “${fileLabel(item)}” archived`);
563:      notifySuccess(`File renamed to “${nextName}”`);
659:      notifySuccess(`Folder “${name}” created for this record.`);
702:      notifySuccess(`Folder “${String(folder.name)}” deleted`);
764:      setError(`Unable to copy file link: ${message(cause)}`);
1100:                        label={`Actions for folder ${folder.name}`}
```

`comments-workspace.tsx:633` (Country Comments tab):

```tsx
              ? `Reply to ${replyToName ?? "participant"}`
```

Others in the same category, off the current Country path but shared:
`attachments/uploader.tsx:302,307,319,360,367,441,451,465,474,564,566`;
`attachment-reference.tsx:19-20`; `attachment-preview.tsx:59,74,118`;
`use-attachment-browse.ts:57`; `section-primitives.tsx:81-84,120-123,218,225`;
`related-record.tsx:32,47,65,137,139,740-741`; `protected-value.tsx:9-19,92,98,101,102,105-106`;
`record-header.tsx:112,122,145,157,184`; `entity-runtime-workspace.tsx:82-99`;
`registered-renderers/contact-address.tsx:7-10`.

Why it is wrong: every other string in these files goes through `intl.message`/catalogues, so the
Malay/Arabic locales shipped by `ENTITY_CATALOG_LOCALES` render mixed-language UI on the Country
page. Mitigation checked: `pnpm policy:i18n` runs
`tooling/scripts/policy/verify-i18n-foundation.mjs`, which only asserts locale wiring (layout
`lang`/`dir`, catalog presence, DDL) — it does not scan for hardcoded strings, and no other policy
covers these files.
Fix: move the cited strings into `entityEnglishMessages`
(`packages/platform/foundation/i18n/src/entity-messages.ts`) and the collaboration catalogue with
`ms`/`ar` entries, then consume them via `intl.message`. The two `aria-label`s in
`detail-workspace.tsx` and the `sections` suffix in `record-navigation.tsx` should be parameterized
(`${intl.message("navigation.sectionMenu", { label })}`).

### F6 — MEDIUM: raw server problem text is rendered as the user-facing error on the Country panel

`packages/platform/entity/runtime/form-detail/src/section-primitives.tsx:230-234`:

```ts
export function message(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "This action could not be completed.";
}
```

`ApiTransportError.message` is populated from the server body:
`packages/platform/foundation/api-client/src/index.ts:203` →
`transport(..., problem?.detail ?? problem?.title ?? \`Request failed with status ${response.status}\`, ...)`.
`message()` is then rendered verbatim, e.g. `attachments/collection.tsx:487,508,527,566`, and in
the upload queue (`attachments/uploader.tsx:174,578`).

Why it is wrong: unlike the rest of the detail runtime — which deliberately uses
`localizedEntityError` and even documents "Never render arbitrary server messages" for reveal
(`protected-value.tsx:18-19`) — the collaboration surfaces pipe server `detail` text straight into
`role="alert"`. Impact is copy consistency and internal-detail exposure (e.g. policy/handler codes
and revision-conflict details), not script execution (React escapes it).
Consequence on the shipped Country route: reachable on the Files tab for archive/unlink/rename/
folder/upload failures, and in the queue.
Fix: route these through `localizedEntityError(cause, intl)` (or a small
`collaborationErrorMessage(cause, intl)` allowlist), keeping `requestId` for support reference.

### F7 — LOW: the upload-permission gate in the uploader is unreachable

`packages/platform/entity/runtime/form-detail/src/attachments/uploader.tsx:41`:

```tsx
  const uploadsAllowed = capability?.maxFileBytes !== 0;
```

`maxFileBytes` can never be `0` in a parsed capability:
`packages/platform/entity/runtime/descriptor-client/src/runtime-client.ts:324`
(`...(root.maxFileBytes === undefined ? {} : { maxFileBytes: positive(root.maxFileBytes) })` where
`positive` rejects `< 1`). So `uploadsAllowed` is always `true`, and the dependent copy at
`:302,441,451,465,472,505` ("Uploads are not permitted for this record.") can never render.

Why it matters (little): it is a fail-open-looking branch that is in fact dead, which is
misleading for the next reader. Consequence on the shipped Country route: none — the real gate is
`capability.actions` (`compiled-section-content.tsx:170-181` requires both `create` and
`finalize`), which is server-derived, and the server re-authorizes every stage/finalize.
Fix: either express the policy as a capability action (e.g. absence of `create`) and delete
`uploadsAllowed`, or use a field the parser actually admits (`nonnegative` for a
`maxFileBytes: 0` sentinel) so the gate can be enforced.

### F8 — LOW: `If-Match: 0` when the record has no version (off the Country path)

`packages/platform/entity/runtime/form-detail/src/entity-form-runtime.tsx:129-136`:

```tsx
      const receipt = recordId
        ? await entityDescriptorClient.patch(
            client,
            entityCode,
            recordId,
            input,
            record?.version ?? 0,
            key,
          )
```

`records` distinguishes "version required" (`expectedVersion === undefined`) from a conflict
(`server/packages/services/records/src/mutation-service.ts:39,51-52`). Sending `0` when the read
produced no `version` (possible when the storage version column is `NULL`:
`entity-list-service.ts:598-606`) converts "version required" into a permanent
`VersionConflict` that the user cannot clear from the form.
Consequence on the shipped Country route: none today — Country publishes no `patch` operation, so
`EntityFormRuntime` is only reached for other entities through the NEON catalog route
(`apps/neon/.../[moduleSlug]/[[...segments]]/page.tsx:32`) and embedded related forms.
Fix: pass `record?.version` through and only send `If-Match` when it is defined (the client
operation already accepts headers conditionally), or surface a clear "reload the record" state.

### F9 — LOW: `EntityFormRuntime` has no client-side validation before submit (off the Country path)

`entity-form-runtime.tsx:111-156` submits directly; the only client-side guard is
`isUntouchedOptionalCreateField`/`normalizeFieldValue` (`form-values.ts:12-37`). There is a full
validation framework available (`data-validation.tsx`, `useDataValidation`) but `EntityFormRuntime`
does not use it, so an invalid required field is only reported by the server's message.
Consequence on the shipped Country route: none (read-only). Fix: wrap the form in
`DataValidationProvider` and call `validate("submit")` before `patch`/`create`, matching
`data-surface`/`intake`.

### F10 — LOW (category: dead code / unreachable surface)

Measured with `grep -rn "\bSymbol\b"` excluding `form-detail/src/**`: **no shipped app or package
outside the package** imports these; the only external consumers are Playwright/esbuild fixtures:

| module | lines | external consumers |
| --- | --- | --- |
| `data-surface.tsx` (`EntityDataSurface`) | 901 | `tests/foundation-browser/{bank-editor,unified-form-layout,bank-country-rules,collection-presentations,country-change-confirmation}.spec.ts` only |
| `intake.tsx` + `intake-surface.tsx` + `intake-state.ts` + `intake-classification.tsx` + `intake-workspace.tsx` | 784+182+113+90+19 | `tests/foundation-browser/page-header-supporting-row.spec.ts`, `tests/foundation/entity-intake-state.test.ts` |
| `collection-section.tsx` (`CollectionSection`, `AddressesSection`, `ContactsSection`, `BankAccountsSection`, `CertificationsSection`, `SupportingDocumentsSection`) | 628 | none anywhere |
| `record-360-panel.tsx` | 262 | `tests/foundation-browser/fixtures/bp-shared-record.tsx`, `shared-record-navigation.spec.ts`, `page-navigation-scroll-linked-tab.spec.ts` |
| `related-record.tsx` | 753 | `tests/foundation/entity-related-presentation.test.tsx` (see F2) + internal `record-summary-panel.tsx:13` |
| `form-layout.tsx`, `reference-lookup.tsx`, `entity-edit-collaboration.tsx` | 101+50+123 | verification fixtures only |

Also dead inside a live file: `record-fields.tsx:44` `: display(value)` and `:31-44`'s
`intl ? … : …` branch (`useEntityI18n` always returns a runtime, so the fallback is unreachable);
`section-primitives.tsx:169-171` re-tests `centered` in the non-`centered` branch
(`className={\`a-runtime-section-empty${centered ? " a-files-empty-state" : ""}\`}`) where it is
always `false`.

Why it matters: ~3,100 lines of shared detail framework are maintained and typechecked but not
exercised by the shipped Country path; per `AGENTS.md` this is onboarding surface, so removal is a
judgment call — the actionable part is that F2 means even the biggest consumer
(`related-record.tsx`) has no running coverage. Fix: decide per module whether it is future
onboarding capability or legacy (`record-360-panel.tsx:65` already calls itself "Legacy v1 panel
adapter"), and either delete or add one running test per kept module.

### F11 — LOW: arbitrary CSS values bypass spacing tokens

`packages/platform/entity/runtime/form-detail/src/styles.css` (0 hardcoded colours — tokens are
used for colour, which is good), but several spacing/size values bypass `--a-space-*`:

```css
93:.a-collaboration-panel__resize { position:absolute; inset-block:0; inset-inline-start:-3px; inline-size:6px; cursor:ew-resize; touch-action:none; z-index:2; }
104:.a-collaboration-panel__body { flex:1; min-block-size:0; min-inline-size:0; overflow:auto; overscroll-behavior:contain; padding:0 16px var(--a-space-3); }
486:.a-collaboration-panel[data-mode=content] .a-comment-thread { … padding:20px; }
557:.a-comment-feed > .a-record-detail-collection { display:grid; gap:16px; }
```

Mitigation checked: `tooling/scripts/policy/verify-design-system.mjs:40` only validates
`packages/platform/foundation/theme/src/styles.css`, so this file is not token-audited.
Consequence on the Country route: cosmetic/RTL risk (`padding:0 16px` is physical, not logical).
Fix: replace with `var(--a-space-*)` / logical properties (`padding-inline`), and cite the
resize-handle width as a token or a documented constant.

### F12 — LOW (category: entity config inside shared code / generalization)

`packages/platform/entity/runtime/form-detail/src/reference-select.tsx:248-250`:

```ts
function isSharedReferenceSource(source: string) {
  return source === "iso.country" || source === "iso.currency" || source.startsWith("shared.");
}
```

Two concrete entity/source keys are hardcoded in the shared detail package, which is exactly what
`AGENTS.md` says must live in metadata. Same file, `:44-50`, also hardcodes a `legacyPolicy`
(`limit: 5`, `retentionDays: 90`) as the fallback when metadata omits a policy.
Consequence on the shipped Country route: none directly (Country detail is read-only, so
`ReferenceSelect` is not on `/app/entity/country/<uuid>`), but the next entity that reuses an ISO
source not in this list silently loses directory paging (`reference-select.tsx:176-203`).
Fix: drive directory eligibility from the published metadata (a capability/flag on the source)
instead of the string allowlist; keep the legacy policy in a named constant with a comment, or
require metadata.

### F13 — LOW (category: type-safety / duplicated model code)

`rich-text-render.tsx:30-45,66-83` and `comments-workspace.tsx:970,1002,1436,1567,1588,1614,1646`
walk the rich-text/comment payload with `any` and unchecked `node.attrs` access;
`attachments/collection.tsx:1576` uses `versionHistory.map((version: any) => …)` and reads
`item.versionHistory` off an untyped row even though `collaboration-read-models.ts` exists
precisely to validate these rows (`asComment`/`asAttachment`).
Consequence on the shipped Country route: low — a malformed panel payload throws inside the
renderer rather than being rejected per item (the per-item `try/catch` at
`compiled-section-content.tsx:62-64` only covers the top-level `asComment`/`asAttachment` step,
and `versionHistory` is parsed by neither).
Fix: extend `collaboration-read-models.ts` with `asVersionHistory`/`asRichNode` and use them at the
`any` sites; the rich-text visitor already proves this is practical.

### F14 — LOW: `display()` prints raw JSON for structured detail values

`record-fields.tsx:56-61`:

```ts
function display(value: unknown): string {
  return value === null || value === undefined || value === ""
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
```

Consequence on the shipped Country route: none today — every Country field is a scalar
(`uuid|string|boolean|datetime`). It is a trap for the next entity that publishes an object field
on a detail section (`section-primitives.tsx:207` instead prints the literal "Available").
Fix: render structured values through a typed renderer (or `MetadataValue`) and reserve
`JSON.stringify` for a debug view.

## 3. Verified healthy — do not churn

1. **Route resolution is strict and shared.** `resolveEntityReadRoute`
   (`contracts/.../routes/entity-read-route.ts:8-18`) rejects a non-canonical entity code
   (`validation/entity-code.ts:5`, `/^[a-z][a-z0-9_]{1,62}$/`), more than one segment, an invalid
   record id (`validation/record-id.ts:4-5`), and only `manage` maps to the list. All three planes
   import the same adapter (`apps/{studio,mesh,neon}/.../page.tsx:1-4`), and
   `tests/foundation-browser/entity-read-route-adapter.spec.ts:53-84` exercises `[], ["manage"],
   [uuid]` plus `"Country"`, `"new"`, `[uuid,"edit"]`, `"../manage"`.
2. **Attachment/comment reads are record-scoped.** `entityRuntimeClient.collaboration`
   (`descriptor-client/src/runtime-client.ts:157-160`) targets
   `/entity-runtime/{entityCode}/records/{recordId}/collaboration/{kind}`, and the server
   re-resolves release + capability admission per request
   (`server/packages/platform/experience/src/entity-collaboration-service.ts:34-53`).
3. **The `?file=` deep link cannot pull another record's file.** `attachments/collection.tsx:406-447`
   resolves the id either from the record's own `items` or via `attachmentBrowse` with
   `entityType: entityCode, entityId: recordId`, and shows "This file is unavailable in this
   record." otherwise — verified against the scoped body at the same call site.
4. **Preview/download URLs are constrained.** `attachmentCapabilityUrl`
   (`communications/collaboration-ui/src/upload-lifecycle.ts:23-45`) accepts only `https:` (loopback
   `http:`), rejects credentials/fragments, and (for previews) requires an origin isolated from the
   app; the preview `iframe`/`img` are `referrerPolicy="no-referrer"`
   (`attachment-preview.tsx:96-121`), and `AttachmentThumbnail` refuses a non-`image/*` derivative
   (`attachment-thumbnail.tsx:63-64`).
5. **Rich text is rendered as React elements, never as HTML.** Repo-wide grep for
   `dangerouslySetInnerHTML|innerHTML|eval(|new Function|document.write` across
   `form-detail/src` returns **no matches**; `renderComment`/`applyCommentMarks`
   (`rich-text-render.tsx:60-156`) map a fixed node/mark set and gate links through `safeHref`,
   and heading level/`colspan`/`rowspan` are range-clamped (`:86-91,157-159`).
6. **Error states are recoverable with retry.** Detail load error (`entity-detail-runtime.tsx:58-63`),
   `SurfaceErrorBoundary` with `resetKey={key}` (`:69-73`), collaboration load error
   (`detail-collaboration.tsx:64`), related single-record error (`related-entity-section.tsx:130-138`),
   attachment browse error (`collection.tsx:1660-1667`), preview failure (`attachment-preview.tsx:69-76`).
7. **In-flight work is cancelled and stale results discarded.** AbortController + generation
   counters in `use-async-resource.ts:25-36`, `detail-collaboration.tsx:49-63`,
   `use-attachment-browse.ts:26-79`, `attachments/collection.tsx:325-375,406-460`,
   `attachments/uploader.tsx:76-82,107-158`, `attachment-preview.tsx:27-83`,
   `protected-value.tsx:51-53,68-79`, `use-section-resource.ts:149-156,184-186,376-381`.
8. **Session/tenant/epoch scoping is present wherever a cache exists.** `sessionScopeKey`
   (`session-scope-key.ts:10-23`) feeds the detail resource key and `preferenceKey`
   (`entity-detail-runtime.tsx:40,76`); the section cache prefix includes
   tenant:principal:authEpoch (`use-section-resource.ts:56-59`); reference history storage keys
   include plane/tenant/principal/context (`reference-select.tsx:36-43`,
   `reference-history-store.ts:41,49`).
9. **Protected-value handling is conservative** (not on the Country path, but shared and correct):
   values are component-local, expire at `min(server expiry, 60s)`, clear on unmount/hide/identity
   change, reject a non-finite/expired expiry, never render server message bodies, and persist only
   a short-lived *intent* in `sessionStorage` (`protected-value.tsx:8-20,53-79,83`).
10. **i18n key coverage is complete.** Extracting every literal `intl.message`/`intl.text`/local
    `message()` key from the package (multi-line aware, 344 keys) and diffing against
    `entity-messages.ts` + `catalogs/*.ts` yields **zero missing keys**, including the two the
    Country detail route depends on (`detail.loadingRecord`, `entity.retry`) and the dynamic
    `error.*` keys used by `localizedEntityError`.
11. **Country composition follows metadata, not the UI.** `MetadataDetailWorkspace` receives an
    already-authorized presentation (`detail-workspace.tsx:32,49-50`), renders sections/tabs only
    from `presentation`, and `fallbackPresentation` (`entity-detail-runtime.tsx:94-120`) offers Edit
    only when the descriptor itself publishes an `edit` action.
12. **Non-null assertions in the detail workspace are provably safe.** `presentation.entityRelationships!.find(...)!`
    (`detail-workspace.tsx:342`) is guarded by the parser
    (`record-presentation.ts:189-191` requires `entityRelationships` for any `relationshipKey`) and
    by `readableRecordPresentation` filtering (`:277,280,311`).
13. **`display`/`message`/`safeChannelHref`/`humanize` avoid the classic sink errors**:
    `safeChannelHref` (`related-record.tsx:95-115`) blocks CR/LF/control chars and only emits
    `mailto:`/`tel:`/`sms:` for matching shapes and `http(s):` for websites.
14. **No hardcoded colours in the detail stylesheets** (`styles.css`, `record/record.css`):
    grep for `#rgb|#rrggbb|rgba(|hsl(` returns 0 matches.

## 4. Checked but not a defect

- **`presentation.entityRelationships!` / `descriptor.presentation!`** — see healthy items 12 and
  11; the fallback is always applied before `MetadataDetailWorkspace` is constructed.
- **Country pagination for comments/files** — I expected a nested-envelope bug
  (`hasMore(resource.data)` at `compiled-section-content.tsx:83` reads only the top level). The
  providers return `data: { items, nextCursor }` at the top level
  (`server/apps/platform-host/src/composition/shared/collaboration/comments.ts:199-208`,
  `…/attachments.ts:172-181`), and `entity-collaboration-service.ts:51-53` passes `result.data`
  through unchanged, so `hasMore` and `values?.nextCursor` are correct. Screenshot-free
  verification: also confirmed the client parser keeps `data` verbatim
  (`runtime-client.ts:295-297`).
- **`?section=`/`?tab=`/`?collaborationSection=` tampering** — `readLocation`
  (`detail-workspace.tsx:55-70`) and `readSection`/`readCollaborationSection`
  (`record/record-url-state.ts:5-32`) only accept keys already present in the authorized
  presentation or matching `isEntityRuntimeKey`, and every fallback chain ends in a real section.
  `select` also refuses an unknown key (`detail-workspace.tsx:110`).
- **`writeRecordLocation`** enforces same-origin before any `pushState`/`replaceState`
  (`record/write-record-location.ts:9`) and no-ops on an unchanged URL.
- **`useEntitySectionScroll`** measures the navigation band, uses a single reading line, and
  detaches listeners/observers on cleanup (`section-navigation.tsx:91-188`) — no listener leak or
  scroll-thrash observed by inspection.
- **`EntityRecordHeader`'s hardcoded strings** ("More actions" `:122`, "Technical details" `:145`,
  "Record sections" `:154`, "Section" `:158`, "Historical read-only view" `:112`,
  "More sections" `:184`) — none of these render on the Country detail page because
  `MetadataDetailWorkspace` passes `showNavigation={false}` (`detail-workspace.tsx:187`) and the
  header has no actions (no `patch`, no `editHref`) and `readOnly` is never set for Country. They
  remain a valid cleanup under F5 for other entities.
- **`useDataValidation.collect()` uses `document`** (`data-validation.tsx:69-76,128-139`) — only
  called from event handlers/effects, and `DataValidationProvider` is not used by
  `EntityDetailRuntime`, so no SSR hazard on the Country route.
- **`MetadataDetailWorkspace`'s `useState(readLocation)` touches `window` during render**
  (`detail-workspace.tsx:55-71`). It cannot execute on the server today because
  `EntityDetailRuntime` only renders it after `useAsyncResource` resolves in an effect
  (`entity-detail-runtime.tsx:41-52`). Worth guarding with `typeof window === "undefined"` if the
  workspace is ever rendered from a synchronous server path, but it is not a live defect.
- **Attachment operations keyed only by attachment id** (`/api/attachments/{id}/{preview|download|status}`,
  `collaboration-operations.tsx:11-13,97-116`) carry no record coordinate. The comment at
  `attachment-download.ts:5` and `attachment-reference.tsx:7` states the service reauthorizes, and
  ids are only obtainable from record-scoped reads; I found no client path that accepts an
  arbitrary id except the validated `?file=` link (healthy item 3). Not reported as a defect because
  the enforcement boundary is server-side and outside this area's files.
- **`EntityRelatedSection`'s create-eligibility probe**
  (`related-entity-section.tsx:103-112,206-219`) swallows the authorization error and hides the
  button — a fail-closed pattern, and the server still enforces creation. Country publishes no
  relationships, so it is unreachable here.
- **`reference-history-store` `localStorage` direct use** (`:49,58`) instead of the shared
  `readBrowserStorage` helper — both are optional-storage safe, and the key is
  principal/tenant-scoped; style only.
- **`related-record.tsx:209` `label: "Country"`** is a synthetic `DetailFieldV1.label` for the
  locale-aware `Intl.DisplayNames` region renderer (`detailValue`, `:48-53`), which never reads
  `field.label`; the label is not user-visible.
- **`collection-section.tsx` duplicates `section-primitives.tsx` composition patterns** (both build
  `Card`/`dl` field lists). It is in the F10 dead-surface set, so deduplication should follow the
  keep/delete decision rather than happen first.
- **`attachment-download.ts:16` `anchor.download = ""`** is a no-op attribute; the download works
  because the server sets `Content-Disposition` (capability `download: "short_lived_authorized_url"`).
  Cosmetic only.
- **Two `useEffect` blocks in `EntityLookup` omit `search`/`compatible` from deps**
  (`entity-lookup.tsx:185-209,296-301`) — the closures are recreated every render and the functions
  internally abort/replace prior requests, so no stale-result or infinite-refetch loop was found.
  `EntityLookup` is not on the Country path.

## 5. Measurements

- Form-detail package: **94 files, 19,888 lines** (`styles.css` 1,138; `comments-workspace.tsx`
  2,100; `attachments/collection.tsx` 1,758; `data-surface.tsx` 901; `intake.tsx` 784;
  `related-record.tsx` 753; `entity-lookup.tsx` 748; `collection-section.tsx` 628;
  `attachments/uploader.tsx` 626; `use-section-resource.ts` 618).
- Hardcoded JSX text nodes in the package: **27 occurrences in 9 files** (pattern
  `>[A-Z][a-z]+…<`), plus the template-string toast/error copy enumerated in F5.
- i18n literal keys used: **344**, all present in the entity catalogues (**0 missing**).
- Tests referencing form-detail modules directly: **15 files**; **2 of them fail today** when run
  (F1 verified by executing `tests/contracts/detail-navigation.test.ts`; F2 verified by executing
  `tests/foundation/entity-related-presentation.test.tsx`), while the other 10 form-detail-related
  foundation suites I ran pass 43/44 assertions (the 44th is F2's file).
- Hardcoded colours in `form-detail` CSS: **0**. Non-token `px` values in `styles.css`: **76**
  (mostly 1-2px borders; the notable bypasses are listed in F11).
