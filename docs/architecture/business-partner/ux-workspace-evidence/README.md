# Baseline mapping and workspace refinement

Implements the first two stages of the [UI/UX refinement plan](../studio-composition-ux-refinement-plan.md).

## Baseline and component mapping

| Experience | Existing source / reusable component | Decision |
| --- | --- | --- |
| Neon Business Partner search | `packages/platform/entity/runtime/list-view/src/index.tsx` search icon, input and shortcut treatment | Both bars now render the same controlled platform `ObjectSearch`; retain graph-specific filtering in Studio |
| Buttons, inputs, selects, badges | `packages/platform/foundation/ui/src/index.tsx` | Reuse existing primitives; no separate visual system |
| Colors, spacing, focus and typography | `packages/platform/foundation/theme/src/styles.css` | Use existing theme tokens |
| Composition hierarchy | `composition-model.ts` | Retain stable identities and reference checks; expose permission bindings and empty principal categories |
| Editor state | `composition-editor.tsx` | Keep undo, expected-revision save, reread comparison and mutation qualification |
| Supported configuration | `composition-configuration.ts`, `composition-structure.ts` | Preserve existing compiler qualification; no new runtime control types |
| Responsive layout | Studio `workbench.css` | Scope refinements to `.studio-designer`; shared search styles use `.a-object-search` |
| Preview and differences | Existing `CompositionReview` | Add navigation from action bar; redesign belongs to the next delivery stages |

The sample's column span 6 remains unsupported for full-width-only intake controls. Sample fork/version labels are not treated as backend evidence. The workspace shows the actual source lifecycle and places identifiers and activation limitations under Version details.

## Delivered

- Compact source header; remove the duplicated outer source line on native composition tabs.
- Full-width controlled search with icon, clear action and `/` shortcut outside editable controls/dialogs.
- Search labels, keys, IDs, kinds and category names; retain ancestor context and highlight matching labels.
- Type and All / Changed / With issues / Editable filters with clear actions and direct-match counts.
- Preserve selected object while filtering; explicit Reveal selection when filtered out.
- Collapsible counted categories, Expand all / Collapse all, and restored collapse state after search.
- Empty principal categories remain visible. Permission binding objects are inspectable.
- Changed-object indicators derive from working-versus-saved stable-ID differences.
- Properties / Rules / References controls; linked references and technical details disclosure.
- Keep editing panels mounted while switching detail views, preserving buffered controls across those switches.
- Mobile Objects / Properties switching; desktop two-column layout.
- Existing Undo / Reload / Save actions plus navigation to Preview & changes.

## Verification

- 26 focused tests passed across seven composition/editor/workbench suites, including new search and expansion-state checks.
- Product, platform UI and Studio app TypeScript checks passed.
- Isolated real-component Playwright checks cover search ancestors, selection preservation, collapse restoration, property panels and mobile layout. No page errors or mobile overflow.
- [Desktop](desktop.png), [mobile](mobile.png), [results](browser-check.json), [reproducible fixture harness](fixture-browser.cjs).
- The authenticated application-browser attempt in `browser-check.cjs` stopped at sign-in because the saved Studio session had expired. It did not perform a live save. The successful evidence is from `fixture-browser.cjs`, which bundles the actual workspace and shared styles using synthetic configuration.

No live configuration writes, approvals or publications were performed. This evidence does not establish authenticated-shell parity or Neon publication proof. Follow-up preview/differences redesign, adjustable pane widths, comprehensive theme/zoom qualification and end-to-end publication remain separate work.

Run `node docs/architecture/business-partner/ux-workspace-evidence/fixture-browser.cjs` from the repository root to reproduce isolated browser evidence.

## Shared Data Bar / Workbar follow-up

- Both bars use `ManagementToolbar`, `ObjectSearch`, and shared `AppliedFilters` from platform UI. The existing list-view export remains compatible through a re-export.
- Applied-filter wrapping, removal, Show all / Show less and Clear all now have one implementation and shared CSS.
- Composition uses Filters with an active count, a Type/Show disclosure, and Controls containing Expand all / Collapse all. Controls uses the shared secondary menu-trigger variant in both experiences.
- Entity List keeps saved views, Enter-to-submit search, sorting and columns. Composition keeps immediate tree filtering and selection/ancestor behavior; it does not imply saved-view support.
- Verification: Studio and Entity List type checks passed; 12 focused composition/editor/workbench tests passed. Existing applied-filter browser tests passed at 1100px and 430px. The isolated workspace browser harness also checks filter disclosure, chip removal, Clear all and Controls, with no mobile overflow or page errors.
- These checks use local components and fixtures. The changes have not been deployed or verified in an authenticated live Studio/Neon session.
