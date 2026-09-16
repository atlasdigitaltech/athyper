# Studio Entity Designer — V4 implementation plan

Status: proposed implementation sequence; no application changes authorized or performed by this document.
Design reference: `docs/prototypes/studio-entity-designer-v4.html`.
Visual and interaction reference: existing Neon Business Partner experiences.

## 1. Objective and first release

Deliver the V4 composition designer inside the existing Studio shell, with the same controls, typography, spacing conventions, validation behavior, and responsive quality as Neon Business Partner.

First end-to-end acceptance scenario:

1. Open a stored Business Partner release in Studio.
2. Open or create an authorized working draft.
3. Select a field placement through Surface → Section → Field.
4. Change its label or help text using a supported edit.
5. Save with revision protection and reload the persisted graph.
6. Compare the stored draft with the selected base and preview it.
7. Validate, test, submit, and have an independent reviewer approve that exact revision.
8. Publish to the selected DEV tenant/plane.
9. Confirm target activation by release identity and hash.
10. Verify the exact changed label in the applicable Neon surface.

A published response alone does not satisfy the exit condition.

## 2. Existing code to extend

| Existing area | Implementation responsibility |
|---|---|
| `packages/planes/studio/business-partner/src/workbench.tsx` | Shared selection, loading, source inspection and orchestration |
| `workbench-model.ts` | Source-specific inspection and operation trace |
| `workbench-editor.tsx`, `workbench-edit-model.ts` | Supported edits, full-graph preservation, optimistic revision checks and saved-draft rereads |
| `workbench-publication.tsx` | Existing validate/test/submit/approve/publish actions and activation inspection |
| `apps/studio/app/(shell)/mdg/business-partner/` | Routes, module navigation, shell integration and scoped layout styles |
| `apps/studio/app/(shell)/entity/graphs/intake-surface-preview.tsx` | Existing shared compiler/intake-renderer integration; verify suitability for each selected surface |
| `packages/planes/neon/business-partner/src/styles.css` | Visual reference for Business Partner spacing, states and actions; do not import wholesale into Studio |
| `@athyper/platform-ui` | Existing shared controls used by Neon, including Button, Card, Input and Label |
| `server/packages/planes/studio/meta-entity-authoring/` | Tenant-scoped reads, persistence, compilation and native publication lifecycle |

Confirm current contracts and tests before modifying these files. Existing implementation is a foundation, not proof that every prototype edit is supported.

## 3. Locked UX and CSS contract

### Shell and page composition

- Retain Studio branding, existing header, sidebar, breadcrumbs, tenant context and page-width conventions.
- Reuse Neon's UI language within the designer. Do not embed a second shell from the HTML prototype.
- Place a compact source/draft/target summary above the workspace. Expand technical identifiers on demand.
- Preserve the existing Business Partner URLs and `inspect` selection. Integrate Compose into Data Model; use existing Publication and Operations pages for their responsibilities.
- Keep Validation, Matching and Workflows available; avoid a competing second set of module tabs. Put preview/differences next to the editing task.
- Surface read failures once, with retry and a precise reason. Do not repeat the same large error block across every panel.

### Controls and tokens

- Reuse available `@athyper/platform-ui` components and their actual APIs. Audit missing tree/split-panel primitives before proposing new shared components.
- Match Neon button variants, control heights, label weight, help text, required markers, errors, focus rings, loading states and dialog actions.
- Resolve semantic colors, borders, radii, typography and spacing through the installed design-system tokens. Confirm canonical token names; do not invent aliases.
- Do not copy prototype hex colors, inline styles, global tag rules, fixed sidebar geometry or native control styling into production.
- Do not copy all Neon `.bp-*` CSS into Studio. Reuse shared primitives; extract a narrowly reusable pattern only if both applications need it.

### CSS containment

- Place new styles beneath one designer root, for example `.studio-entity-designer`, using CSS Modules if consistent with the package conventions; otherwise use a unique class prefix.
- New CSS should primarily handle grid columns, panel dimensions, responsive collapse, preview selection and scroll boundaries.
- No global `button`, `input`, `table`, `h2`, `section`, `aside` or `body` overrides. No new `!important` overrides to repair specificity conflicts.
- Gradually replace conflicting workbench input/button styles as controls migrate. Check every existing workbench page before removing a shared selector.
- Keep focus outlines and popovers unclipped. Avoid stacked nested scrollbars and sticky bars that obscure headings or errors.
- Test selected runtime renderer inside the designer container: designer selectors must not restyle its form controls.

### Responsive and accessibility behavior

- Wide workspace: composition tree, properties, collapsible preview.
- Medium workspace: tree and properties; preview opens below or in a dedicated panel.
- Narrow workspace: navigation drawer or stacked tree, full-width properties, separate preview view.
- Determine breakpoints against the actual shell's remaining content width; prototype viewport values are illustrative.
- Test 390, 768, 1280 and 1440 CSS-pixel viewports, 200% zoom, long labels, large validation messages, and supported application themes.
- Accessible hierarchical navigation with roving focus and arrow-key expansion; name add/reorder actions by object. Use established tree semantics only if fully implemented.
- Keep focus on the selected object after reorder, return focus after dialogs, announce save/validation states, and link error summaries to controls.
- Match Neon's localization and logical-spacing conventions; include RTL checks if enabled in the application.

## 4. State and data architecture

### One authoritative draft

Retain the complete server graph as the editing source. Tree nodes, properties, preview, advanced tables and differences are derived views. Do not maintain independent metadata-table and presentation models as the prototypes originally did.

Proposed session state:

- Selection: source family, entity, tenant, source ID, base release, target plane/tenant.
- Persisted state: full loaded graph, server revision, hashes and lifecycle state.
- Working state: immutable graph plus structured edits/undo history.
- UI state: selected stable node ID, expansion, filter, panel visibility and focus.
- Validation: issues keyed to stable object ID and property.
- Publication: exact submitted/approved revision and target selection.
- Evidence: release, target, hashes, observation time, activation state and separate browser verification.

A local undo stack is permitted; browser localStorage is not the authoritative save mechanism. Draft recovery storage requires an explicit separate design for tenancy, privacy and stale revisions.

### Identity and relationships

- Use stored IDs as object identity; use positions only for ordering.
- Display friendly names with technical keys in Advanced details.
- Distinguish shared field definitions from field placements on a surface.
- Construct hierarchy from actual parent references; detect cycles, missing parents, cross-surface references and duplicate sibling identities/order.
- Provide a fields/operations catalogue so unplaced definitions remain discoverable.
- Preserve unknown properties and branches on save. Patch approved paths into the complete graph; never rebuild it solely from visible form controls.
- Advanced tables initially inspect the same graph read-only.

### Adapter per configuration family

Expose explicit read, editable-path, validate, save, preview and publication capabilities per family. Start with the native entity graph. Bundle/policy/case-contract workflows remain on their established paths until independently qualified. A common toolbar must not imply an atomic save across different stores.

## 5. Supported edit matrix

| Change | Initial disposition | Evidence required to enable |
|---|---|---|
| Field-placement label/help/placeholder | First slice | Existing allowlist, save/reread, preview and Neon consumption |
| Surface/section title and supported layout values | Next slice | Existing schema plus actual compiler/runtime behavior |
| Reorder field placements or sections | Gate separately | Stable identity, valid positions, compiler order and runtime order |
| Add/remove section or placement | Gate separately | References, lifecycle policy, complete validation and reversible draft behavior |
| Widget/required/visibility changes | Disabled unless qualified | Family-specific authorization and save/compile/runtime support |
| Add/change shared field type/storage key | Deferred migration work | Schema evolution, compatibility and governed migration policy |
| Permission bindings/scopes | Inspect first | Approved authoring contract and target authorization integration |
| Rules/matching/workflow edits | Existing editors/read-only first | Runtime consumption, versioning and family-specific publication contract |

Database CHECK constraints are only one part of edit validation. They do not establish that the runtime supports an edit.

## 6. Delivery sequence and gates

### Phase 0 — Baseline and contract audit

Tasks:
- Capture current Neon new-request and relevant record-form states, plus Studio workbench states.
- Record component/token mapping and identify selector collisions.
- Recheck stored graph shapes, route permissions, supported edits and preview surface types.
- Select an existing surface whose label is demonstrably consumed by Neon.
- Record known legacy release hash representations; preserve current integrity checks.

Deliverable: UI parity checklist, edit capability matrix and exact first-slice fixture.
Exit: target controls, API calls and runtime verification surface are explicit.

### Phase 1 — Production workspace and read-only composition

Tasks:
- Add the tree/properties/preview layout using the Studio shell and shared controls.
- Derive tree nodes from the selected stored graph; include field and operation catalogues.
- Add friendly labels, search with ancestor context, counts, breadcrumbs and stable selection.
- Show broken references as findings instead of silently dropping nodes.
- Preserve deep-link selection and stale-request cancellation across tabs.
- Apply the CSS contract and initial accessibility checks before introducing mutations.

Exit: each displayed object maps to the selected stored graph; other Studio pages and Neon visuals remain unaffected.

### Phase 2 — Focused edits, persistence and conflicts

Tasks:
- Move existing allowed presentation edits into the properties panel.
- Add dirty markers by node and page; undo/revert for unsaved edits.
- Validate locally for feedback; retain backend validation as authority.
- Save using expectedRevision, reread persisted data, compare complete graph and revision.
- Retain user edits on timeout or conflict. Offer comparison/reload; do not automatically overwrite or silently replay an ambiguous save.
- Invalidate preview/publication evidence when relevant content or target changes.
- Protect navigation and source switching with save/discard/cancel choices.

Exit: change survives save/reload, unrelated configuration remains intact, and competing edits cannot silently overwrite each other.

### Phase 3 — Preview and review

Tasks:
- Use the actual shared renderer/compiler for each supported surface; the existing intake preview is only one surface category.
- Provide explicit unsupported-preview status where a renderer is unavailable.
- Support working-versus-saved preview and base-versus-draft differences.
- Group changes by stable entity/surface/section/placement identity, including removals and moves.
- Link findings/differences to tree selection and highlight the corresponding rendered field where stable renderer hooks exist.
- Keep preview actions inert or explicitly simulated; they must not create business records.

Exit: the reviewer can see the exact saved change and its rendered result without relying on raw JSON.

### Phase 4 — Publication and Neon proof

Tasks:
- Integrate existing validation, tests, submission, independent approval and publication controls.
- Bind review to exact saved revision/hash and target selection; verify backend enforcement.
- Freeze submitted revisions or create a successor draft according to existing lifecycle rules.
- Prevent duplicate actions; reconcile uncertain publish responses by reading durable state before retrying.
- Track publication and activation independently per target, including queued, failed, unavailable, denied, mismatched release/hash and active states.
- Separate MFA-required, missing-permission, conflict and service errors; offer the existing sign-in/step-up flow where applicable.
- Verify the saved label in Neon and record exact release, tenant, surface and observation time. Preserve screenshots without session secrets.

Exit: one approved Studio change is confirmed active and browser-visible in Neon. No approval bypass or synthetic assurance is used.

### Phase 5 — Qualified composition changes

Tasks:
- Enable ordering and add/remove only after capability checks pass.
- Pre-fill parent references; reject cross-surface moves and cycles.
- Show dependency impact, block unsafe removals, and distinguish placement removal from shared-definition deletion.
- Implement explicit move operations with stable IDs and deterministic ordering.
- Preserve undo for unsaved edits; persisted reversals follow draft/release lifecycle.

Exit: structural edits remain valid across save/reload/compile/preview; no orphan objects or hidden data loss.

### Phase 6 — Permission explorer and broader configuration

Tasks:
- Show surface → operation → permission → scope, with source/target evidence distinguished.
- Integrate authorized effective-access checks if available; identify their API gap otherwise.
- Explain grant source, scope, validity, explicit denies and MFA conditions from actual decisions.
- Link users to existing authorized assignment tools; do not add incidental grant mutations to inspection.
- Add rules/workflows family by family after its editor, version, preview and runtime contract is proven.

Exit: explanations match server decisions, and each newly enabled editor has its own complete verification path.

## 7. Tests and evidence

| Layer | Required checks |
|---|---|
| Graph model | Tree ownership, unknown-property preservation, stable-ID differences, move ordering, cycle/reference validation |
| Persistence | Expected revision, stale-write conflict, ambiguous response reconciliation, reload equality |
| Components | Selection, search ancestors, dirty guards, undo, read-only controls, field-error focus, dependency dialog |
| Authorization | Tenant isolation, denied reads/writes, MFA requirements, author/reviewer separation |
| Publication | Exact approved revision, edits invalidating review, duplicate prevention, target mismatch and stale evidence |
| Runtime | Same supported renderer, expected field appearance, no preview-side mutations |
| CSS/visual | Neon/Studio control parity, designer containment, existing workbench regression, supported themes, responsive widths and zoom |
| End-to-end | Studio saved label → independent approval → published release → target active → exact Neon label |

Use existing test runners and fixtures. Run focused package checks during each phase; perform the broader regression set at integration gates. Do not claim complete visual parity from screenshots of the HTML prototype.

## 8. Rollout and rollback

- Introduce through the existing feature/exposure mechanism, first for DEV Studio technical admins.
- Keep the established inspection path usable while the new layout is qualified.
- Prefer source-compatible UI changes; do not alter published releases to fit the new UI.
- If shared components change, verify all affected consumers before release.
- UI rollback restores the previous workspace without discarding durable drafts.
- Release rollback follows the existing governed publication process and target verification; UI rollback does not undo a published definition.

## 9. Completion criteria and scope discipline

Design is locked at the V4 information architecture, not its standalone CSS or in-memory simulation.
The initial implementation is complete only after Phases 0–4 pass for the chosen field-label journey, including browser evidence and the Neon visual parity checklist.
Phases 5–6 expand capability without changing the basic layout.

Schedule should be estimated after Phase 0 against actual backend gaps and available verification environments. The largest uncertainties are non-intake preview coverage, structural edit contracts and reliable target activation evidence—not the tree markup.


## UI/UX refinement follow-up

See [Composition workspace, preview and differences refinement plan](studio-composition-ux-refinement-plan.md) for the updated Neon-aligned layout, reusable component boundaries, accurate comparison provenance, staged delivery and verification gates. This supplements the existing implementation phases without changing approved configurations or publication semantics.
