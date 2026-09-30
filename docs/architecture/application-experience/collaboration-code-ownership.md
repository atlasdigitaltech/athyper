# Collaboration file naming and code ownership

Reviewed and streamlined on 2026-09-23.

## Rule

Reusable Comments and Attachments implementation belongs under platform packages. Product folders own the entity's route, metadata, domain context and integration calls. A shared module must not import a product package or embed an MDG route or Business Partner entity identifier.

The supplied inventory predates the workspace extraction: `compiled-section-content.tsx` dispatches renderers; `comments-workspace.tsx` and `attachment-workspace.tsx` now own the two feature workspaces.

## Changes applied

| Previous location | Current location | Reason |
|---|---|---|
| `packages/planes/neon/business-partner/src/edit-collaboration.tsx` | `packages/platform/entity/runtime/form-detail/src/entity-edit-collaboration.tsx` | Form-adjacent Collaboration behavior is reusable. The public component is now `EntityEditCollaboration`; entity, record, surface and context are inputs. |
| `packages/planes/neon/business-partner/src/collaboration-route.ts` | `packages/platform/entity/runtime/form-detail/src/collaboration-route.ts` | Explicit URL intent is shared behavior and contains no Business Partner logic. Exported through the platform package. |
| Product-local `collaboration-route.test.ts` | `tests/foundation/collaboration-route.test.ts` | Tests the shared navigation rule independently of a product. |
| `.bp-edit-collaboration__fields` in Business Partner CSS | `.a-entity-edit-collaboration__fields` in form-detail CSS | Styling follows the component's ownership. |

Business Partner now imports the generic component and provides `entityCode="business_partner"`, `surfaceKey="detail"` and its target record ID. The old product wrapper and helper have been removed rather than retained as duplicate implementations.

The generic edit adapter forwards `contextKey`, `resourceContext`, `locale` and `collaborationSectionKeys` to the runtime when supplied. Its section labels come from the admitted navigation projection. The current Collaboration ecosystem still assumes conventional `comments`/`attachments` keys in some paths; moving files does not remove that separate metadata-contract limitation.

## Canonical shared locations

```text
packages/platform/entity/runtime/form-detail/src/
  collaboration-surface.tsx          # side/full-view shell
  collaboration-visibility.ts       # presentation/lifecycle contexts
  collaboration-route.ts            # explicit URL visibility intent
  entity-edit-collaboration.tsx      # reusable edit-form integration
  collaboration-actions.tsx         # menus and action presentation
  collaboration-operations.tsx      # operation helpers
  collaboration-read-models.ts      # boundary validation
  comments-workspace.tsx            # feed, replies and comment actions
  attachment-workspace.tsx          # Files workspace and file actions
  attachment-preview.tsx
  attachment-thumbnail.tsx
  attachment-download.ts
  file-search.tsx
  file-action.tsx
  file-type.tsx
  rich-text-render.tsx
  section-primitives.tsx
  compiled-section-content.tsx      # generic renderer dispatch
  entity-runtime-workspace.tsx      # admitted entity section integration
  use-section-resource.ts           # resource cache and pagination
  styles.css                        # entity/Collaboration layout

packages/platform/communications/collaboration-ui/src/
  rich-comment-composer.tsx
  comment-audience-picker.tsx
  clipboard-converter.ts
  rich-text-types.ts
  attachment-client.ts
  upload-lifecycle.ts

packages/platform/foundation/ui/src/
  panel/
  search-field/
  filter-chip-group/
  composer-frame/
  modal-isolation.ts

packages/platform/foundation/theme/src/styles.css
packages/platform/entity/runtime/descriptor-client/src/runtime-client.ts
packages/platform/gateway/bff-relay/src/index.ts

server/packages/platform/collaboration/    # shared comment domain
server/packages/platform/experience/      # entity capability admission
server/packages/services/attachments/     # shared attachment lifecycle
server/packages/services/document-processing/
server/packages/services/content/
server/packages/contracts/collaboration/
server/packages/contracts/attachments/
server/packages/contracts/publication/
server/packages/adapters/object-storage-s3/
server/packages/adapters/malware-clamav/
server/packages/adapters/document-parser-tika/
```

These server paths are already generic. `platform/collaboration` and `services/attachments` represent existing package boundaries; making their parent folders visually identical is not necessary for reuse and would create package/import churn. Storage and scanning adapters keep provider names because those implementations are deliberately provider-specific.

## Paths that should retain domain names

| Path | Why it remains product-specific |
|---|---|
| `apps/neon/app/(shell)/mdg/business-partner/[recordId]/page.tsx` | This is the Business Partner URL entry point, not the Collaboration implementation. |
| `packages/planes/neon/business-partner/src/record-runtime.tsx` | Supplies Business Partner breadcrumbs, navigation, summary/domain actions and operating context. |
| `packages/planes/neon/business-partner/src/index.tsx` | Owns product forms and calls the generic edit Collaboration adapter. |
| `packages/planes/neon/business-partner/src/request-attachment-field.tsx` | Adapts a product request-form field and draft lifecycle. The actual upload lifecycle is already shared; moving the whole product field would also move its domain responsibilities. |
| `metadata/products/mdg/entities/business_partner/*` | Declares this entity's capabilities, permissions and presentations. Other entities need their own declarations pointing to shared services/renderers. |
| `apps/neon/lib/relay.ts` and app API entry | Host registration belongs to the host; shared relay operation definitions belong to the platform gateway. |

Production source checks over the Comments/Files workspaces, Collaboration helpers/composer, Comments service and attachment service found no MDG/Business Partner literals in those shared implementations. Product names in fixtures and integration tests are valid examples, not runtime dependencies.

## Naming standard for additions

- Use kebab-case file names and responsibility suffixes: `*-workspace`, `*-surface`, `*-route`, `*-client`, `*-service`, `*-repository` and `*-read-models`.
- Use `collaboration-*` for functionality spanning Comments and Files.
- Use `comment-*` or `comments-*` for comment-specific functionality.
- Use `attachment-*` for attachment identity, transport, lifecycle, versions and retrieval. Keep `file-*` for Files UI controls such as search and type icons. Both terms have an explicit role; a bulk rename is unnecessary.
- Use `Entity*` exports for adapters requiring entity/record context; keep provider names only for provider adapters.
- Keep shared CSS under `a-*` and product CSS under its product prefix. Consume semantic theme tokens and foundation components.
- Test generic behavior with neutral entity fixtures. Keep product integration acceptance beside product code.
- Import shared components through their package exports from product code; avoid reaching into platform `src` paths.

The dependency direction is product → entity runtime → collaboration/foundation primitives, with server contracts and services owning policy. Do not move entity-runtime workspaces into the composer package: that would couple low-level editor reuse to record runtime and risks circular dependencies.

## Verification

- Form-detail and Business Partner typechecks passed.
- Three browser regressions passed: generic section/thread wiring, generic edit context forwarding with unsaved field preservation, and an unsaved record bypassing Collaboration loading. The edit tests probe runtime/surface boundaries rather than a live backend.
- Shared URL-intent and theme token checks passed.

See the [architecture review](../../reports/collaboration-metaentity-architecture-review-20260923.md) for service wiring and remaining capability-mapping work.
