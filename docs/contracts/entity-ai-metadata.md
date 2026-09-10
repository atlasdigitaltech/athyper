# Published Meta Entity AI metadata v1

BP-AI-01 adds an optional `ai` extension to `EntityRuntimeDescriptor`. Author it once on an active Meta Entity surface at `layoutConfig.ai`. Studio validates it during graph validation and compilation, includes it in the deterministic artifact, and runtime metadata parsing validates it again against the published fields, operations and plane.

This is a capability declaration, not a permission grant or a tool installation. Atlas F2 consumes this declaration through the generic runtime described in [the F2 runbook](../runbooks/atlas-f2-generic-capabilities.md). Existing explicit Atlas tools retain their admission behavior when AI metadata is absent.

## Example

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "aliases": ["Business partner", "Supplier"],
  "description": "Business Partner identity and lifecycle summary",
  "summaryFieldKeys": ["code", "display_name", "status", "partner_category"],
  "searchFieldKeys": ["code", "display_name"],
  "relationshipKeys": [],
  "contextKinds": ["record"],
  "insightProviders": [{ "id": "bp_read_summary", "version": 1 }],
  "actions": [{ "id": "open_record", "version": 1, "operationKey": "read" }],
  "presentationProfiles": [{ "id": "record_brief", "version": 1 }]
}
```

All array properties and `enabled` are required; `description` is optional. An explicit empty array means no capability in that category. The example requires all referenced fields to exist, both search fields to be searchable, and a published `read` operation. Studio determines searchability from active search-profile field bindings. Runtime checks the actual compiled `searchable` flag.

## Reference and compatibility rules

- Exactly one nondeprecated surface may declare AI metadata. Multiple declarations fail even if identical; deprecated surfaces do not enable AI.
- Missing `ai` preserves legacy descriptors and hashes. Explicit `enabled: false` is preserved but still requires valid references; disabling does not conceal invalid configuration.
- Field and alias order is preserved as semantic configuration. Canonical object-key ordering continues through the existing compiler; AI changes participate in descriptor/contract hashes.
- Unknown keys, unbounded text/arrays, duplicate references, unsupported schema/capability versions, arbitrary commands, SQL, templates and URL properties are rejected.
- `summaryFieldKeys` must reference active fields. `searchFieldKeys` must reference active searchable fields. Neither permits accessing the values without authorization.
- `relationshipKeys` initially supports reference-field keys or an explicitly published `collectionRelationship.sourceRef`. Arbitrary graph relations without a runtime relationship contract remain unsupported. Traversal still requires future owner adapters and independent authorization.
- `bp_read_summary`, `bp_read_brief`, `bp_explain_readiness`, and `bp_check_eligibility` v1 are registered provider declarations. The three owner insights are documented in [BP-AI-04](atlas-business-partner-insights.md). Each provider requires the `business_partner` entity, a published read operation, record context, and NEON at the runtime boundary. Studio compilation is target-neutral; target-plane eligibility is rechecked when the runtime descriptor is parsed.
- `entity_read_record` v1 requires a published read operation, record context and nonempty summary fields, and supports every runtime plane. `bp_read_contacts` and `bp_read_addresses` v1 require Neon Business Partner record context and an installed section owner. `bp_read_list_insights` v1 requires Neon Business Partner Manage context.
- `open_record` v1 is the only initial action declaration and must bind the published `read` operation. It declares navigation semantics; the registered runtime resolver and user permission remain necessary. No entity operation is automatically promoted into a mutation tool.
- Registered presentation vocabulary: `record_brief` v1 requires record context; `list_brief` and `comparison` v1 require Manage context. This registration identifies a presentation contract; it does not claim those renderers have been implemented in BP-AI-01.
- No future duplicate, document or submission provider is accepted merely because it appears in the plan. Add a versioned catalogue entry and conformance coverage when its owner implementation is qualified. Existing `bp_submit_case` remains a separate governed Atlas tool, because its target is a case rather than the Business Partner's `read` operation.

Aliases/descriptions are business data, not trusted model instructions. Future context builders must keep them separate from system policy and intersect declared capabilities with actual registered tools, current feature admission, model capability and verified user authorization.

## Implementation and checks

- [Shared schema/parser](../../server/packages/contracts/metadata/src/entity-ai.ts)
- [Studio compiler adapter](../../server/packages/planes/studio/meta-entity-authoring/src/entity-ai.ts)
- [Runtime parser](../../server/packages/platform/metadata/src/descriptor-parser.ts)

Validation errors surface as `ENTITY_AI_INVALID` in Studio's graph validation report; invalid graphs cannot compile for publication. Runtime invalid descriptors throw before becoming a usable metadata projection.

Verified package suites: metadata contracts (28 tests), Studio authoring (16), runtime metadata (31). All three package typechecks passed. The existing deterministic legacy hash assertions remain unchanged and pass. No live descriptors have been republished; DEV release 17 remains as inventoried in BP-AI-00. Its missing `storage.versionField` is not silently repaired by the AI extension.
