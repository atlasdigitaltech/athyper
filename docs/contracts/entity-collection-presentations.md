# Metadata-driven collection sections

Repeatable intake groups can opt into a shared collection presentation through
`displayConfig.presentation` on their Meta Entity surface binding. The compiled
runtime contract carries the same `presentation` property. Existing groups without
this property retain their current renderer.

```json
{
  "renderer": "bank-accounts",
  "summary": [
    { "field": "bankName" },
    { "field": "currencyCode" },
    { "field": "accountIdentifier", "format": "masked" },
    { "field": "supportingDocuments", "format": "count" }
  ],
  "emptyText": "Add an account and supporting documents when available.",
  "editLabel": "Edit",
  "doneLabel": "Done",
  "issuesLabel": "Issues: {count}"
}
```

Renderer keys are `generic`, `addresses`, `contacts`, `bank-accounts`,
`certifications`, `documents`, and `channels`. All use the shared collection
contract and field renderer. Summary bindings reference the item surface's
`valueKey`, not a database column or an entity-specific client mapping. The parser
rejects unknown renderer keys, undeclared summary fields, duplicate bindings,
and collection counts bound to scalar fields. Password widgets are always masked
in summaries, even if the binding omits the masked format. Hidden fields are
excluded from summaries.

The item surface's sections define editor groups and field ordering. Labels,
requiredness, conditions, collection bounds, lookups, primary-field configuration,
and registered service handlers keep their existing metadata ownership. This
presentation does not add verification, expiry policies, country rules, or
certificate extraction.

Editors remain mounted inside native details elements. One item per collection
opens at a time; switching or closing preserves changes and in-flight uploads.
Done closes the editor, while the host's Save draft action persists the request.
Validation can open all enclosing details elements and focus a nested invalid
field. Newly added items open and receive focus automatically. Removing a primary
item retains the existing behavior of promoting the first remaining item.

`withBusinessPartnerCollectionPresentations` is an idempotent authoring upgrade,
called by request-capture provisioning. It adds the four section presentations,
nested document/channel presentations, grouped two-column editors, and an upload
permission-denial label. It does not modify an already-published runtime by itself:
publish a successor Meta Entity definition and deploy the matching frontend to
activate the presentation. Preserve older published revisions for existing drafts.

Validation covers malformed bindings, draft/submit behavior, authoring idempotence,
account masking, editing across collapsed records, nested error focus, collection
limits, removal, mobile overflow, and upload permission denial.

## Local DEV activation

The running source-mode DEV site uses Studio's signed, durable local-preview
activation path. On 2026-09-13, change set
`be767e01-f36d-434f-91f3-67bff689a367` advanced from revision 41 to revision 42.
The Neon frontend and source API were restarted, and the authenticated live form
passed desktop/mobile checks. This is a local development activation, not an
approved production release.

Reproducible commands (existing authenticated local Studio/Neon sessions required):

```sh
pnpm exec tsx tooling/scripts/verification/activate-collection-presentations.mts
pnpm exec tsx tooling/scripts/verification/activate-collection-presentations.mts --apply
pnpm exec tsx tooling/scripts/verification/probe-collection-presentations.mts
```

The first command validates without writing. The apply command saves with the
current revision, backs up the prior graph, and verifies the active signed hash.
The browser probe blocks business writes. Activation and browser receipts are in
`governance/policy/reports/collection-presentations-*.dev.json`; current screenshots
remain in `~/.athyper/instances/dev/artifacts/collection-presentations/imported/`. Prior graph revisions, including
revision 41, were privately archived during cleanup. See the
[artifact retention and recovery notes](../runbooks/local-artifacts.md).
