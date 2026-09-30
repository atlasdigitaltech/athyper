# Entity Framework audit remediation: DEV manual test handover

Date: 2026-09-30. Source checkout: `e0ac49d4c` plus the uncommitted changes in this workspace.

## Environment and publication

Personal DEV runs this checkout in source mode. `pnpm dev:workspace status` reports healthy API, worker, scheduler, Neon, Mesh and Studio applications. The API readiness endpoint returns HTTP 200. The standard Country route responds on all three application hosts; unauthenticated HTTP responses do not prove record access.

The read-only Country inventory at 2026-09-29T20:45:36Z found 247 `shared.country` rows and active `metadata.reference.country` release 10 on Studio, Neon and Mesh. This change has not published a successor release or altered Country data or grants. The source mode reads current files; it is not a qualified immutable image.

| Stage | Implementation and automated checks | Publication | Authenticated runtime |
| --- | --- | --- | --- |
| 1. Authorization consistency | Complete in mutation service; revocation and field-scope cases pass unit tests | No metadata release needed | Manual permission-race check pending |
| 2. Validation and failure semantics | Complete; money, missing-descriptor, outage and empty-patch cases pass unit tests | No writable money entity published by this change | Writable-entity checks pending |
| 3. Shared presentation | Complete for the audited label, date, numeric, status-tone, badge and async paths | Existing Country release 10 active | Visual theme and browser timezone checks pending |
| 4. Framework maintainability | Plane scope compilers and lookup resolvers registered through shared ports; host and records suites pass | No metadata release needed | Embedded-scope browser checks pending |
| 5. Localization | Metadata labels and shared form, list toolbar, empty state and error copy covered in en/ms/ar fixtures | Existing Country localized metadata active | Full non-English and RTL browser checks pending |

## What to test

Use an approved DEV test principal with the existing reference-view grant. Sign in separately on:

- `https://studio.dev.athyper.test/app/entity/country/manage`
- `https://neon.dev.athyper.test/app/entity/country/manage`
- `https://mesh.dev.athyper.test/app/entity/country/manage`

For each plane, open Country's standard list and a record detail. Check search, real published filters, sorting, pagination, and a saved view if available. Confirm a record ID opens `/app/entity/country/<UUID>`, and read-only Country offers no create, edit, or delete action. Check that a principal without the reference-view grant sees a denied state and cannot read list or detail data. Do not infer authorization from an unauthenticated route's HTTP 200 shell response.

In English, Malay and Arabic, compare Country's entity and field labels between list and detail. Check that the list group label for an ungrouped list is localized, and that denied, missing-record, loading and retry text remains understandable. Check Arabic direction and keyboard navigation in the shared controls. Set the browser to a time zone west of UTC and verify a date-only value keeps the same calendar day in list and detail.

For a **published writable Entity**, check form title, description, submit text and field labels in all three languages. A money field is not currently known to be published; use a controlled framework fixture before manual money entry. If one is available, save a finite amount, reopen it, and compare the stored value with the form and list. Also check large PostgreSQL numeric strings and trailing zeroes in list/detail. Submit an empty patch through the standard record API and verify `EMPTY_PATCH` is returned without version, outbox or audit changes. An unauthorized field write must be rejected even if permission changes after the form was loaded.

Where an Entity publishes record-scoped embedded lists, open a parent record and confirm that the embedded list cannot escape its server-locked parent scope through search, filters, paging or a changed URL. Check dark and high-contrast themes on related-record badges. For an entity that publishes status tones, verify the list badges use the published mapping; an unconfigured status should remain neutral.

## Automated evidence and limits

- Records service: 386 tests passed, 4 skipped; metadata service: 89 passed, 2 skipped. The five plane-scope SQL tests moved to the host package, where the plane compilers are registered.
- Host package: 802 tests passed, 26 skipped, including six registered plane-scope SQL cases. Country localization vertical covers all three planes and English, Malay and Arabic fixtures.
- Typechecks passed for the changed records, metadata, host, Entity contracts, list, form/detail and i18n packages. Entity server lint passed with zero warnings; root lint passed at its existing 231-warning budget. The i18n policy passed.
- The broad foundation suite still has three reproducible failures in shell activity center and Atlas answer tests outside this Entity Framework change. Two fail with `React is not defined` in shell rendering; one expects `Revision 3` while the component renders `Revision: 3`.
- `pnpm format:changed:check` fails because previously minified files changed here are not Prettier formatted. A whole-file format sweep would obscure the functional review and belongs in its own change.
- Plane-specific SQL now lives in host-owned Neon, Mesh and Studio compiler registrations; unknown scope kinds fail closed in the shared repository. The shared list, including its primary toolbar, and form/detail surfaces have localized keys for the paths tested here. Secondary list drawers and transfer surfaces still retain English strings; Malay/Arabic testing should record each remaining string.
- No authenticated browser acceptance, permission-revocation race against a live database, or live money-field publication has been completed. Report those as manual findings rather than treating package tests or active Country publication as runtime acceptance.

The DEV controller's `build` path was attempted and declined before changing containers because original legacy DEV application containers are absent. The supported `source --preset devfull` mode resumed successfully and is the mode in use for this handover. Use `pnpm dev:workspace status` to confirm the six application health checks before testing.
