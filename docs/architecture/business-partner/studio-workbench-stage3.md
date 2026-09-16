# Business Partner workbench — focused editing

Date: 2026-09-16

## Delivered behavior

The shared workbench now supports native working-draft edits alongside its stored-source inspector. A published source can open/create the entity's working draft through the existing fork API. That API may return the actor's existing working draft; the UI explicitly identifies that behavior and displays its own revision rather than claiming it is an exact fork of the selected release snapshot.

Supported controls:

- Surface title and description.
- Section title, description, and column count.
- Field-placement label, help text, placeholder, and column span.

These controls patch only an allowlisted leaf and preserve the rest of the loaded graph. They do not offer required-flag changes, field types, new fields, IDs, relationship changes, permission changes, or bundle editing. Server validation and authorization remain authoritative.

## Save and preview

1. Select a native working draft, or open/create one from a published source.
2. Choose a configuration area and member.
3. Make supported changes and inspect the property-level differences.
4. Use the existing intake renderer to preview the working graph without saving or activating it.
5. Save with the loaded `expectedRevision` through the existing graph PUT API.
6. Reread the graph. Verify the returned revision and the complete content, including unrelated members. Keyed array storage order is ignored, while explicit position values remain significant.
7. Show preview status separately from persistence success: saved revision, active preview revision, state and error.

Successful readback updates the shared inspector and version header. Failed save, ambiguous response, conflicting revision, or mismatched readback retains the working copy and blocks resubmission until the stored draft is reloaded. Reload asks before discarding dirty changes. Version switching, refresh, link navigation, and browser unload have dirty/busy guards. Formal publication remains separate.

## Published-release listing fix

Stage 2 introduced repository inspection methods but omitted forwarding them from `createScopedMetaEntityAuthoringRepository` in platform-host. The live service therefore could report `RELEASE_INSPECTION_UNAVAILABLE` despite the underlying Kysely methods existing. Both reads are now forwarded through the authenticated tenant transaction. A composition-wrapper regression test exercises this previously missing integration boundary.

## Evidence

- Component tests exercise PUT/read round-trip, expected revision, preserved unrelated fields/operations/extensions and nested binding configuration, preview failure after persistence, revision conflict, changed readback, and unavailable verification.
- Model tests check the edit allowlist, input immutability, and semantic differences with reordered keyed storage.
- Existing workbench read-only tests continue to pass.
- Host wrapper and existing Studio relay contract tests pass.
- Studio app and Business Partner package typechecks pass.

These are automated source/fixture checks. This task did not change a real tenant's configuration or claim a successful live Neon preview. The source development server may pick up the changes automatically; the host must load the updated scoped wrapper for the published-release fix to take effect. Runtime preview requires the existing local-preview environment and dependency setup.

## Manual qualification

Use an authorized development account. Open a working draft, change one help-text value, inspect the difference and working preview, save, and verify the shared saved revision and stored text. Confirm the active preview revision separately before testing a new Neon request. A failed preview must retain the prior active revision and clearly identify its error. Restore the original text through another versioned save when the test is finished.
