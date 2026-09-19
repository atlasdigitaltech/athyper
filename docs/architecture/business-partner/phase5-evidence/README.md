# Phase 5 — Structural editing

Implemented and checked on 16 September 2026.

## Delivered scope

- Reorder sections within a surface and placements within a section using explicit positions and stable identities.
- Add a field placement by reusing an existing configured placement template and shared field definition.
- Add a section by moving a placement into it atomically. Both sections retain at least one placement, as required by the intake compiler.
- Move placements within the same surface. Remove a section by merging its placements into another section.
- Remove optional placements only after reviewing dependencies. Required placements, referenced identities/keys, and affected positional contract tests block removal.
- Preserve unrelated graph configuration and shared field/operation definitions. Structural changes use the existing undo, differences, expected-revision save, and stored reread protections.
- Compare top-level contract tests by their unique keys so storage reordering does not falsely report configuration loss.
- Use shared UI controls and scoped theme variables for the structural panel.

Every proposed structural result passes the production intake compiler before becoming the working graph. Qualification currently covers flat intake forms with choice-card and entity-lookup placements, unambiguous identities, and valid sibling positions. Unsupported surfaces remain read-only for structural changes. There is no automatic dependency rewrite or cascading deletion.

## Verification

| Check | Result |
| --- | --- |
| Frontend structure, editor, review, workspace, workbench, and publication regression tests | 40 passed across 10 files |
| Backend structural qualification test | Passed against actual authoring validation, contract tests, and compilation |
| Studio product TypeScript check | Passed |
| Studio application TypeScript check | Passed |
| Browser dependency refusal, add placement, split section, reorder, save/reload, merge and undo | Passed |
| Browser unrelated-data preservation | Passed |
| Mobile document overflow at 390px | None |
| Browser page errors | None |
| Live structural writes | Zero |

The browser check uses the development Studio shell with intercepted authoring responses and an in-memory fixture save. This proves the controls and client round-trip; it does **not** prove a persisted structural database save or publication to Neon. Backend qualification separately exercises the real compiler, without a database write.

The existing live label-change draft at revision 60 was left untouched. Its approval/publication journey and MFA requirement are separate from this delivery.

## Evidence and reproduction

- [Browser script](browser-check.cjs)
- [Browser results](browser-check.json)
- [Fixture graph](graph-fixture.json)
- [Desktop controls](structure-desktop.png)
- [Mobile controls](structure-mobile.png)

Run from the repository root with the local Studio service and saved development Studio session available:

```sh
node docs/architecture/business-partner/phase5-evidence/browser-check.cjs
pnpm --filter @athyper/product-studio-business-partner typecheck
pnpm --filter @athyper/studio typecheck
pnpm --filter @athyper/server-plane-studio-meta-entity-authoring exec vitest run src/__tests__/structural-editor-qualification.test.ts
```
