# Entity Designer v3 review

## View

V2 is a useful design foundation: one selection across tabs, explicit configuration families, identity-based field differences, descriptor-driven metadata forms, and separate source/target evidence. Keep those concepts.

The primary authoring flow should use entity, field, section, and operation names. Database table names, raw constraints, coverage gap identifiers, and storage details belong in an advanced inspector or developer mode. The dense selection panel should eventually collapse to a compact summary after selection.

## V3 changes

- Preserves V2 in its original file.
- Browser-local field drafts per configuration family; unsaved working copies survive family switching within the session.
- Save/reload controls and unsaved-change warning on page exit.
- Side-by-side base and working previews, including mobile width, required markers, widget choice, and field column spans.
- Publication requires saved valid field changes; simulated viewer and independent-review gates apply.
- Editing or changing the target resets the publication simulation and prior activation evidence.
- Activation can show active, pending, a different release, denied access, or failed deployment. It is never real deployment evidence.
- Metadata and workflow examples explicitly remain separate sandboxes, outside the field save/diff/publication journey.

## Remaining design work

1. Unify metadata rows and field presentation through stable identifiers before allowing them to publish together. V2 currently holds separate sample models.
2. Add section editing, ordering, reference-safe deletion and undo. Do not infer runtime support from database constraints.
3. Bind effective-user permission explanations to the real authorization engine; sample mapping matches are not proof of access.
4. Give each configuration family its own validated save, preview and release adapter.
5. Model revision conflicts, stale approvals, target retries and browser evidence with explicit revision/release identifiers.
6. Add accessible labels throughout the inherited generic forms and complete keyboard/mobile review before production implementation.

## Verification

Playwright exercised field save gating, independent review, target mismatch, per-family draft restoration and rendered preview without page-script errors. This is a standalone prototype, not an application integration or a full backend coverage audit.
