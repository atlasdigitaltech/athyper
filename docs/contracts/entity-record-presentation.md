# Shared entity record presentation

Record pages use the same `PageHeader` geometry as entity collections. `EntityPageLayout` suppresses collection headings, actions and tabs while an explicit `useRecordPage()` owner is mounted, then restores them when the record unmounts. Loading and error states belong to that owner too. The record's business code (or title) replaces its UUID in the breadcrumb while the authorized header is mounted.

## Authoring and publication

Author `layoutConfig.recordPresentation` on one active Meta Entity surface. `compileGraph` validates field and operation references and includes the resulting `recordPresentation` in the deterministic artifact. The runtime metadata parser validates the same contract. A change therefore follows the existing publication/release process; no browser settings or arbitrary executable templates are involved.

Example for a document (field and operation keys must exist on the entity):

```json
{
  "schemaVersion": 1,
  "iconKey": "file-text",
  "titleField": "document_number",
  "codeField": "reference",
  "subtitleFields": ["description"],
  "contextFields": ["company_name", "document_date"],
  "badges": [
    {
      "field": "status",
      "tones": {
        "draft": "neutral",
        "approved": "success",
        "rejected": "danger"
      }
    }
  ],
  "sections": [
    {
      "key": "overview",
      "label": "Overview",
      "fields": ["document_number", "description", "document_date"],
      "placement": "direct"
    },
    {
      "key": "amounts",
      "label": "Amounts",
      "fields": ["currency", "total"],
      "placement": "direct"
    }
  ],
  "actions": [
    {
      "key": "edit",
      "label": "Edit",
      "operationKey": "patch",
      "placement": "primary"
    }
  ]
}
```

For master records, use the name as `titleField`, the master code as `codeField`, and the appropriate lifecycle field for badges. Typography and layout stay in the shared design system, not in metadata.

## Runtime responsibilities

- The detail descriptor intersects presentation bindings with authorized fields and operations before returning them. When a record ID is supplied, record read admission runs before returning record actions, and patch authorization receives that record ID.
- Generic detail renders permitted scalar values through `resolveRecordHeader`. Missing or restricted values are omitted. It renders published field sections and supports the existing registered edit route. Transition actions are not rendered without an executable, authorized operation adapter.
- Business Partner adapts its canonical 360 summary to `EntityRecordHeaderV1` on the server. Published presentation controls its labels, order and placements. Its existing policy manifest controls section availability/counts; existing governed-action authorization controls links. Metadata alone never grants access.
- Business Partner keeps authorized organization/company names and its role-lens control in the shared context row. UUIDs remain in expandable technical details. Historical headers have no mutation actions.
- The renderer shows at most two direct actions and five direct sections; remaining items use overflow disclosures. Narrow screens use a labelled section selector. There can be at most one primary action.

## Compatibility and rollout

Existing generic descriptors receive an Overview section and their existing authorized Edit action. Business Partner uses a server-side compatibility presentation until its next published metadata release supplies `recordPresentation`. Older 360 responses remain readable in the new client, with no newly inferred mutation actions.

Deploying code alone does not publish presentation metadata. Publish the desired per-entity presentation through the normal Meta Entity release process and deploy matching server and browser code. Keep generated BP360 response schemas synchronized with the shared TypeScript response contract.

On 2026-09-08, development API and NEON web were deployed with `record-header-20260908` images. Explicit Business Partner presentation metadata was activated in system release 13 and CirrusAtlantic tenant release 5. Business Partner therefore uses published metadata in development; other entities without `recordPresentation` continue using the defaults described above.

The development-only publication configuration is `server/db/scripts/provisioning/config/business-partner-record-presentation.v1.json`. Its rollout script, `publish-development-record-presentation.ts` in the same provisioning directory, creates a plan by default, rehearses it with `--rehearse`, and activates it with `--apply`. It only accepts locally signed development Business Partner releases, validates descriptors, preserves previous releases, and reuses existing governed-action permissions without changing IAM grants. Other environments must use the normal publication process.

Deployment receipts and rollback references are stored outside the repository at `~/.athyper/instances/dev/receipts/record-header-20260908/deployment.json`. Both deployed services passed health checks. Component browser checks passed before deployment; authenticated live-page verification could not complete because saved sessions had expired and the available development login did not authenticate.

### Directory scope quick filters

The published `directoryScope.quickFilters` array controls scope filters shown in
the list Filter drawer's Quick filters tab. Each entry supplies `key`, `label`,
`emptyLabel`, `options` (value/label pairs), and `requires`. An absent array
publishes no scope quick filters; the client does not infer them from entity names.

The registered keys are `partnerRole` (supplier/customer) and
`eligibleOperation` (order/invoice/payment). Eligibility must declare all three
dependencies: `partnerRole`, `organization`, and `company`. It requires exactly
one authorized organization and company with a compatible assignment. Changing
role or scope clears staged eligibility. Apply commits scope and field filters;
Cancel discards the draft; Reset clears both. These scope selections are separate
from ordinary record-field predicates and do not change the shell's working company.

The server exposes the validated metadata as `scope.quickFilters` in the list
descriptor and checks requested values against the published options before the
existing authorization and transaction-eligibility resolver runs. Directory
visibility alone never grants transaction eligibility.
