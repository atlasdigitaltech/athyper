# Phase 0 — Studio Entity Designer baseline audit

Audit date: 2026-09-16. Reference: V4 prototype and Studio Entity Designer implementation plan.

## Outcome

Baseline audit completed with implementation gaps explicitly recorded. Authenticated UI references and an exact development-preview label fixture are now captured. Formal publication/activation is not proven by this audit; it remains a later delivery gate.

No application CSS, permission grants, business records or published definitions were changed by this audit.

## 1. Initial browser baseline attempt (superseded by authenticated follow-up)

Routes visited with saved DEV `catl.admin` states:

- Neon `/mdg/business-partner/new`
- Studio `/mdg/business-partner/model`

Both `/api/auth/session` responses reported `anonymous`. The four PNGs in this directory are blocked-access/sign-in captures, **not approved Business Partner visual references**. `browser-observations.json` records states, viewport sizes, observed request failures and sampled control metrics. No cookies or tokens are included.

1440×1000 and 390×1000 captures showed no horizontal overflow in the unauthenticated state. This does not establish responsive behavior of either authenticated application.

Required follow-up after both saved sessions are refreshed:

1. Verify principal, plane and tenant through the normal session endpoint.
2. Capture Neon initial request/classification, a supported detail section, required-field errors, action loading and a representative dialog without creating a business record.
3. Capture Studio source selector, selected stored release, draft editor and denied/MFA states where available.
4. Record computed typography, padding, radius, border and focus values on real controls. Approve side-by-side visual references at desktop and narrow widths.
5. Add medium viewport and 200% zoom checks during implementation.

## 2. Shared component mapping

Source: `packages/platform/foundation/ui/src/index.tsx`.

| Designer element | Existing component/API | Implementation decision |
|---|---|---|
| Save/validate/publish | `Button`, variants primary/contrast/secondary/danger/ghost, loading flag | Reuse; loading disables action and sets aria-busy |
| Text property | `Input` with error prop | Reuse; link help/error descriptions separately |
| Property label | `Label` | Reuse with explicit htmlFor |
| Boolean | `Checkbox` | Reuse; reflect server-supported edit state |
| Family/target/widget selector | `Select` | Reuse; do not duplicate native select styling |
| Internal views | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Use for local view state; retain route-based module navigation |
| Dependency confirmation | `Dialog`, `DialogContent`, `DialogClose` | Reuse focus/modal implementation |
| Narrow-screen tree panel | `DrawerContent` and existing overlay pattern | Verify composition with the existing Dialog context |
| Container/status | `Card`, `Badge` tone neutral/success/warning/danger | Reuse |
| Tree and split layout | No tree primitive exported from this UI entry point | Implement a scoped accessible composition navigator; search wider shared navigation before creating a generic platform API |
| Multiline help text | No Textarea export found in this entry point | Follow existing themed textarea convention; qualify whether a shared wrapper is needed |

Neon already imports Button/Card/Input/Label in `packages/planes/neon/business-partner/src/applicant-experience.tsx` and shared UI controls in `supplier-controls.tsx`.

## 3. CSS contract and risks

Authoritative theme files:

- `packages/platform/foundation/theme/src/tokens.ts`
- `packages/platform/foundation/theme/src/styles.css`

Neon reference: `packages/planes/neon/business-partner/src/styles.css`.
Studio current styles: `apps/studio/app/(shell)/mdg/business-partner/workbench.css`.

Observed Neon conventions include `--a-border`, `--a-muted-foreground`, `--a-danger`, `--a-font-size-sm`, `--a-font-size-md`, and shared `.a-button`/`.a-input` classes. Theme styles use spacing, radius and focus tokens. Resolve exact active token values from authenticated controls before adopting measurements.

Current Studio workbench uses `--border`/`--background`/`--foreground` with literal color fallbacks, custom border radii, custom font sizes, and descendant `select`/`input` styling. These can conflict with newly embedded shared controls. This is a source-level mismatch, not a measured claim that all rendered values differ.

Phase 1 rules:

- Keep Studio shell and Business Partner module navigation.
- New designer styles use a unique root/class prefix and established theme tokens.
- Keep CSS primarily about layout, selection highlighting and responsive panel behavior.
- Migrate custom form styling when controls migrate, rather than layering higher-specificity overrides over it.
- Do not import Neon's entire `.bp-*` stylesheet or prototype global tag styles.
- Preview must retain runtime renderer styling; no designer descendant input overrides.
- Respect available content width, focus visibility, popover clipping, logical spacing and existing dark/theme variants.

## 4. Supported edit contracts

Source: `packages/planes/studio/business-partner/src/workbench-edit-model.ts`.

| Collection | Existing edit allowlist | Qualification |
|---|---|---|
| surfaces | title, description | Existing focused editor accepts these; actual renderer use must be checked per surface |
| surfaceSections | title, description, columnCount | Layout value depends on renderer; integers 1–12 accepted by edit helper |
| surfaceFieldBindings | labelOverride, helpText, placeholder, columnSpan | Existing save path; compiler imposes widget-specific limits |
| All other properties | Not in focused edit allowlist | Disabled in initial properties editor |

The helper preserves unknown siblings/branches when patching the full graph. It identifies the edit target by array index, so the new tree must resolve stable IDs against the current graph at dispatch time; do not retain stale indexes across source reloads.

Generic helper constraints are not sufficient per-property schemas: it accepts string/number union values, text up to 2,000 characters, and integer layout values from 1–12. Match actual property types and renderer contracts in the new field descriptors; backend remains authoritative.

Persistence evidence: `workbench-editor.tsx` saves the complete graph with expectedRevision, rereads the draft, and compares persisted revision/content. Existing differences normalize ID-bearing arrays. Reuse these behaviors and extend tests rather than creating a separate draft model.

Structural operations, widget changes, required/visibility, field type/storage changes, and permissions are not automatically enabled by V4 prototype controls.

## 5. Preview/runtime finding — material gap

Sources:

- `packages/contracts/platform/entity-runtime/src/intake-surface-authoring.ts`
- `apps/studio/app/(shell)/entity/graphs/intake-surface-preview.tsx`
- `packages/platform/entity/runtime/form-detail/src/intake-surface.tsx`
- `packages/planes/neon/business-partner/src/request-entry.tsx`

The Studio preview calls `compileEntityIntakeSurfaces` and uses the shared intake renderer integration. The compiler includes only surfaces with `layoutConfig.renderer === "intake"`; it also requires form kind, valid section references and unique nonnegative positions.

For runtime input bindings, it carries labelOverride/helpText/placeholder/columnSpan into compiled data. Choice and lookup controls require a full-width span of 12 and specific widget/type/runtime-field constraints. Consequently, a universal 1–12 span editor is insufficient even though the generic focused-edit helper accepts it.

Neon request entry obtains its application descriptor, finds the `request_intake` flow and resolves its first surface. It validates the requested_role binding. A label visible in Studio is not automatically the label consumed by this Neon flow.

### Stored fixture inspection

Read-only query of DEV Studio for CirrusAtlantic (`44444444-4444-4444-8444-444444444444`) found latest native BP release:

- Release ID: `c2cc6900-26c1-47ca-8dfc-1d488000950c`
- Release number: 2
- Surface ID: `45ee1d7f-77b1-45c7-8f84-79543b8c3ceb`
- Surface key: `bp_reviewed_reset_runtime`
- `layoutConfig.renderer`: absent/null

This is suitable as an initial **read-only tree fixture**, but not yet a proven intake-preview/Neon-label fixture. The current intake compiler filters it out. Do not fabricate a rendered preview or relabel this source as an active Neon intake release.

Follow-up: inspect the authenticated Neon descriptor and active-release evidence, correlate its flow/surface to the owning stored definition and renderer, then choose a supported field label. If this requires another source adapter, record it explicitly before Phase 2.

## 6. Authorization and error baseline

Native graph inspection requires `metadata.entity.author`; deployment inspection uses its separate permission. Atlas experience administration is a different endpoint/permission and must not be treated as proof of entity-authoring access.

The current workbench 403 message conflates missing permission and MFA-required responses. Phase 1 should retain structured reasons: anonymous/session-expired, MFA required, missing permission, wrong scope, not found, revision/hash conflict and unavailable service. A retry cannot cure all of these.

Read-only navigation must not assert that a viewer can fetch graph data when its route requires author permission. Client control visibility is not server authorization.

## 7. Verification performed

Command:

`pnpm --filter @athyper/product-studio-business-partner exec vitest run src/workbench.test.tsx src/workbench-editor.test.tsx src/workbench-publication.test.tsx`

Result: **3 files, 15 tests passed**.

This is a baseline check of existing workbench behavior, not proof of deployed publication, screenshot parity, or all renderer adapters.

## 8. Phase 1 entry decision

Ready for scoped implementation:

- Shared component inventory and CSS containment contract identified.
- Existing immutable release fixture identified for read-only composition.
- Source selection/save/preview/publication building blocks identified.
- Unsupported edit categories and key renderer constraint exposed.

Initial open items (resolved by the authenticated follow-up below):

- Authenticated Neon/Studio visual references and control measurements.
- Exact label fixture correlated to an active Neon surface and owning stored definition.

Phase 1 may proceed with the read-only native composition and shared controls while these are resolved. Do not enable editing based only on prototype descriptors, or claim the full Studio-to-Neon journey is qualified.


## 9. Authenticated follow-up — completed

Both saved DEV catl.admin sessions were verified authenticated/elevated in the CirrusAtlantic tenant and with their expected plane-specific principal IDs.

### Captures and measured CSS

- `neon-authenticated-1440.png`, `neon-authenticated-768.png`, `neon-authenticated-390.png`: initial Business Partner role selection.
- `studio-authenticated-1440.png`, `studio-authenticated-768.png`, `studio-authenticated-390.png`: stored native release 2 in Data Model.
- `neon-supplier-selected.png`: role selected and dependent lookup revealed, without submitting or creating a request.
- `authenticated-browser-observations.json`: route responses, headings, computed control styles and overflow observations.
- `neon-shared-control-metrics.json`: measured shared-control sample after role selection.

No document-level horizontal overflow was detected at the three captured widths on these states. These are baseline references, not full accessibility/theme/zoom certification.

Measured Studio Refresh button: GeistSans stack, 16px font, 40px height, 8px 12px padding, 10px radius. Its custom stored-version select and revision input use Arial at 13.333px, approximately 37.78px height, 10.4px padding and 8px radius. This confirms the need to replace custom native control styling with shared themed controls rather than copy these dimensions into designer CSS.

Neon's step navigation uses the GeistSans stack, 14px text and 44px height. Its native radio inputs retain browser metrics; visual comparison should use the enclosing choice-card component rather than assume every input has text-input dimensions.

Observed failures: workflow inbox returned 403 in both shells; Studio's release activation inspection returned 403. The main entity release and graph reads succeeded. Do not misreport these separate feature denials as failure of all configuration loading. No new grants were made.

### Exact runtime-to-source correlation

`runtime-source-correlation.json` establishes:

- Neon application descriptor revision.release: **60**.
- Descriptor hash: `eead4030fa20e6f07cda078545e90b6c92d9a883cd1aeda4a88611f55d32cea9`.
- Matching local signed-preview artifact hash: identical.
- Studio change set: `be767e01-f36d-434f-91f3-67bff689a367`.
- Stored draft revision: **59**, branch `local-preview`.
- Preview artifact explicitly has `developmentEvidence: true`.
- `metadata-service.ts` maps preview revision to `release_no: preview.revision + 1`; this explains 60 exactly.

Sources: `server/packages/platform/metadata/src/metadata-service.ts` and `server/packages/foundation/src/local-graph-preview.ts`. The service uses the request's preview artifact pin; this local path precedes normal cached/published metadata resolution.

**Do not label this as published release 60 or proof of formal deployment.** The Studio native release 2 is a different source coordinate.

### Selected first-edit fixture

| Coordinate | Value |
|---|---|
| Source family | Native graph, local-preview draft |
| Change set | be767e01-f36d-434f-91f3-67bff689a367 |
| Audited saved revision | 59; reread current revision before any edit |
| Surface | intake_partner |
| Surface ID | d076991c-791e-5849-81fe-5f72e50336ea |
| Section ID | 3476f9e7-afe9-54ae-8ced-3ecfdc457389 |
| Field | requested_role |
| Placement ID | dd030024-3640-5185-874f-445546fc0027 |
| Supported first edit | labelOverride, currently “Requested role” |
| Widget | choice_cards |
| Layout restriction | columnSpan must remain 12 |
| Browser destination | Neon /mdg/business-partner/new, first step |

`studio-intake-fixture.json` records the corresponding stored graph selection. `neon-descriptor-fixture.json` records the browser-facing flow/surface data. The label is visible in the captured browser, present in the exact saved draft and passed through the compiler mapping.

Use a dedicated working draft or explicitly controlled existing draft in the implementation test; never assume this audit authorizes overwriting someone else's current work. This audit performed no edits.

### Entry decision and remaining delivery work

Phase 0 is complete as an audit: visual references, component mapping, supported edit contracts and a concrete development fixture are recorded. Phase 1 may begin.

Carry these explicit constraints forward:

1. UI must distinguish stored published releases, saved drafts, development-preview activation and formal deployment evidence.
2. Current activation-inspection permission denial must be resolved through the normal authorized process before formal target verification.
3. The full independent-review/publication path still needs its own release fixture and execution evidence; local preview success cannot substitute for it.
4. Error, dialog, loading, theme, zoom and deeper form visual states remain implementation-regression coverage. Only the enumerated read-only baseline states were captured here.
