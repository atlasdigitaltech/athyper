# Related record presentation

Contacts and Addresses in Business Partner 360 use `recordPresentation.related`, an optional extension of the record presentation contract. Each child profile has its own `schemaVersion: 1`. Existing entity presentations remain valid; the new Contact/Address renderer requires a published profile and reports unavailable metadata instead of silently substituting business-specific React defaults.

The publication source is `server/db/scripts/provisioning/config/business-partner-record-presentation.v1.json`. The header carries only profiles for authorized sections. The full section endpoint still authorizes and filters all data independently. The right rail reads the same detailed projection, including individual channel verification, and follows cursor pages when the primary record is beyond page one. Requests are cancelled and old results discarded when tenant, principal, permission epoch, record, date, or scope changes.

## Definition and provider boundaries

`contact-person.v1` and `address-link.v1` are registered projection contracts. They bind the existing owner/tenant relationships to `contact_person` and `address`/`address_link`. Their field catalogues describe the actual section DTOs, including the nested channel and address-event collections; they do not authorize joins or expose arbitrary database columns. Authoring and runtime descriptor validation reject unregistered owner entities, mismatched sections, unknown fields, incompatible renderers, duplicate keys, and executable/unknown properties. Operation references must exist in the published entity operations.

These provider contracts are registered code, while titles, labels, order, field grouping, status mappings, compact placement, collapsed history, and action placement are published metadata. Adding a new data source requires a reviewed provider; changing presentation does not require editing the Business Partner React component.

## Rendering

The platform `RelatedRecord` component implements text, boolean, date, datetime, country, lookup and badge fields, plus postal blocks, channel rows and collapsed timelines. The same profile selects detailed and compact groups. Country names and dates use `Intl` with the shell’s selected format locale and time zone; date-only values are formatted in UTC to avoid date shifts. Multiline provider-formatted postal addresses retain their line breaks. Otherwise, structured address lines provide the readable postal block, with the formatted value as a fallback. A single formatted string is never split on commas. Copy uses exactly the visible postal lines after restricted fields have been removed.

The optional `summary` contract selects a registered `contact-summary` or `postal-summary` layout, ordered `group.field` references, and a localized copy label. Publication rejects layouts incompatible with the source and unresolved field references. `RelatedRecord` uses shared `ContactSummary` and `AddressSummary` components for compact profiles, while retaining detailed groups in the center panel. Summaries omit repeated field labels and use built-in badges, buttons, and accessible copy tooltips.

Metadata supplies status labels and tones. Verification is shown per channel or as postal validation, and source/confidence/date fields are displayed only when returned by the provider. No verification timestamps or evidence are inferred. The missing-field disclosure concerns absent values, excludes restricted fields, and does not invent requiredness. Required-information guidance comes from the existing published completeness definition and its server evaluation.

Action labels and operation references come from the profile. The server intersects them with authorized governed actions, supplies resolved routes separately, and removes change actions for historical views. Handlers retain execution-time authorization. There is no executable JSX, SQL, script expression, or configurable action URL in a profile.

Navigation, focus, responsive layout and retry states remain platform behavior. Scope prompts come from published section metadata; counts are hidden when the server reports that scope selection is required. Errors distinguish unavailable and restricted responses and expose the request/correlation reference when the transport supplies one.

## Deployment verification

Run the read-only gate with a migration/deployment connection that may `SET ROLE athyperapp`:

```sh
pnpm --filter @athyper/server-db db:verify:business-partner-360-reads
```

Provide `NEON_DATABASE_URL` through the deployment environment and optionally `BUSINESS_PARTNER_ID`. The gate requires a representative current partner with contacts and addresses. It verifies the runtime role cannot bypass RLS, probes supporting contact/address tables even when collections are empty, and executes 16 actual local section readers under the tenant context. Every transaction is read-only and timed out. It reports individual failures and exits nonzero; it never repairs grants. The operational readiness rehearsal invokes this gate.

This checks local database reads, not HTTP authorization or live external business-activity integrations. Additional role/company fixtures and authenticated journeys remain necessary for full release qualification.

For local metadata publication, run the existing plan, rehearsal and apply workflow with the JSON configuration. Deploy compatible API and Neon renderers with the new release. Preserve the previous runtime images and activation heads for rollback; never edit an existing publication artifact in place.

## Detail layouts

The optional profile `detail` selects `contact-detail` or `postal-detail`, supplies badge field references for the card header, and labels copy and additional-field controls. Each group's optional `detail` supplies main/aside/footer placement, heading visibility, omitted field keys, and bounded integer channel column weights. Existing profiles retain their original rendering when the profile detail layout is absent. Header bindings must resolve to scalar badge fields; omitted fields and column weights are checked at publication.

Shared renderers show channel column headers once and use container queries to stack labeled rows on narrow cards. Address cards put the postal block and copy action beside supporting fields. Business Partner collections suppress the repeated scope description; the published scope label remains available to other consumers. Optional empty fields remain collapsed and restricted fields are excluded from rendering, copy, and missing counts. Required-information notices still come from server completeness results; the presentation contract does not infer requiredness.

## Collection ordering

`collectionOrder` selects registered `primary-first` or `newest-first` ordering for Contact and Address collections. The service resolves the published profile and the repository applies ordering before pagination and when assembling the page. Primary-first uses primary descending, creation timestamp descending, then the unique contact/address-link ID descending. Opaque cursors retain the sort mode and primary anchor; legacy or differently sorted cursors are rejected when the published order changes. No arbitrary SQL or field expressions are accepted.

## External references

`external-reference.v1` binds the identity section's external-reference projection. The published title, field labels, and value mappings use the shared record renderer. Scoped lookup metadata contains a validated `scopeField` and nested code-to-label maps; external entity names are resolved within `sourceSystemCode`. Unknown codes remain visible, and a restricted scope field cannot resolve a scoped label. IDs are rendered verbatim. Lookup maps are data only and accept no URLs or executable expressions.

Approved MESH account links populate missing external codes from `partner.accountCode` in the active recipient-local profile snapshot. Resolution matches tenant, projection, source tenant/account, recipient account, and relationship, and accepts supported recipient-safe schemas only. Existing codes and UUID linking keys are preserved. The external-reference profile presents the network account code in its main group and retains External ID in collapsed Technical details. The idempotent `backfillMeshExternalReferenceCodes` helper plans by default and fills only blank codes on active approved links with matching snapshots.
