# Phase 1 — read-only composition workspace

Implemented in Studio Business Partner → Data Model for native draft/release sources. Bundle inspection retains its existing family-specific view.

## Delivered

- Graph-derived hierarchy: surfaces, nested sections, field placements and actions; keys/members and relationships/targets/mappings.
- Separate field and operation catalogues, including objects not placed on a surface.
- Stable ID selection with `inspect` + `object` URL parameters, preserved through module navigation and refresh.
- Friendly object labels, search retaining matching ancestors, breadcrumbs and read-only scalar properties.
- Complete stored object and graph under Advanced inspection; no graph reconstruction or writes.
- Missing/ambiguous references, duplicate identities, cross-surface parenting and cyclic ancestry produce visible findings. This read model does not replace full backend graph validation.
- Keyboard tree navigation (arrows, Home/End, Enter/Space), shared Input/Label/Button/Badge, and scoped `.studio-designer` layout CSS.

## Verification

- 19 targeted tests passed: model/reference integrity, keyboard/controlled selection, existing workbench, editor and publication regression tests.
- Product package and Studio application typechecks passed.
- Live DEV draft `be767e01-f36d-434f-91f3-67bff689a367`, revision 59, loaded 422 composition objects.
- Selected Requested role placement survived navigation to Validation and back, then browser refresh.
- Browser checks: 1440, 768 and 390 widths; no document horizontal overflow or captured page-script errors. Search input uses the Geist-based application font.
- `workspace-desktop.png`, `workspace-mobile.png` and `browser-check.json` contain the captured evidence. The mobile capture precedes the URL-selection fix; layout CSS did not change afterward.

## Scope

This delivery adds a read-only composition view. Existing draft editor/publication controls remain in the workbench; no new composition mutation actions were enabled. No configuration, grants, business records or release states were changed by the verification.

No new runtime preview is claimed in this phase. The selected stored source does not establish target activation. Future editing must resolve stable IDs against the current graph, retain unknown configuration, and enforce the qualified edit matrix.
