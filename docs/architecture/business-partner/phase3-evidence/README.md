# Phase 3 — preview and differences

## Delivered

Data Model now includes a Preview and differences section alongside the composition workspace, for editable native drafts and read-only native sources.

- The comparison base is the inspection loaded when the editor opens. It stays fixed after a verified save. It is explicitly identified as a loaded revision, not assumed to be the published baseline.
- Review configuration switches between the local working copy and the last verified stored draft. Switching review modes does not save or discard edits.
- Surface selection follows the selected composition object's owning surface unless the user selects another preview surface.
- Both panels use the existing native intake compiler and production `EntityIntakeSurface` renderer. Sample answers and required-field checks are local to each panel; compiled configuration changes reset sample answers.
- Preview supports the renderer's choice-card and entity-lookup controls. Live lookup adapters and business actions are not supplied. Other controls/surfaces display an explicit unsupported message; compiler failures display their actual finding.
- Changes are paired by collection and stable object ID. Array reordering alone does not produce false object changes. Missing or duplicate identities fall back to a collection comparison. Position/property edits remain visible.
- Each changed object has property-level before/after values plus expandable complete values. Added and removed objects are distinguished; removed objects do not offer a misleading current-object link.
- Changes and structural reference findings navigate to the shared selection and focus the properties region. Inspect selected surface provides navigation for surface/compiler diagnosis. Structural findings are not a substitute for backend validation.
- Layout uses Studio/Neon theme tokens and existing controls. Added CSS is confined to the composition review/workspace; production renderer styles were not modified.

## Verification

- 27 tests passed across eight focused composition/workbench suites, including stable-ID pairing, duplicate-ID fallback, comparison-base retention after save, and finding/change navigation.
- Product package and Studio application typechecks passed.
- Browser check used the current DEV Studio application with intercepted inspection responses. The saved Studio session's live inspection APIs returned access denied, so this is not live-data verification.
- Fixture reconstructs a minimal intake graph using the captured Phase 0 surface/binding and Neon descriptor options, with synthetic field/section definitions. The read-only unsupported-release response is also synthetic.
- Browser assertions verify an unsaved label in the working production renderer, unchanged base and stored view, actual required-field feedback, properties focus, and explicit unsupported preview. No JavaScript page errors or authoring writes were observed.
- Desktop (1440px) and mobile (390px) screenshots are included; mobile document width did not overflow.
- Run from repository root: `node docs/architecture/business-partner/phase3-evidence/browser-check.cjs`. Requires local Studio and the saved Studio browser session for the application shell; inspection responses are browser fixtures.

## Remaining verification / scope

Live inspection verification needs a Studio session accepted by the source APIs. No permissions, stored drafts, releases or targets were changed. This phase does not prove persisted save/reload, publication, target activation, or a change appearing in Neon. Non-intake editors/renderers, backend validation finding-to-object mapping, and comparison against an independently selected published release remain outside this increment. The current base is always labeled with its actual loaded source and revision.
