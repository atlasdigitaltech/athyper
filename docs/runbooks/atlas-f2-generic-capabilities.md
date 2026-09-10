# Atlas F2 — generic capability discovery and execution

F2 adds `entity_read_record` v1 to the existing published `layoutConfig.ai` contract. Business Partner in Neon and `network_relationship` in Mesh use the same registry, coordinator, Records gateway, renderer and replay path. BP contacts and addresses keep their owner adapters and existing tool IDs; their v1 references now participate in metadata discovery.

This is an implementation and automated qualification milestone. No live descriptors or deployments were changed. F1's canonical-table reconciliation is separate from its remaining semantic-profile authoring work; F2 uses the already supported AI descriptor extension and adds no tables.

## Execution contract

1. Resolve the current page through Metadata and authorized Records/List services. Retain both the list surface hash and published entity hash.
2. Intersect declared provider references with installed tools, context kind, plane, permissions, model tool admission and agent tool allowlist. Explicitly disabled AI exposes no contextual tools. A missing owner cannot be installed by metadata.
3. Expose only `recordId` to the model. Bind entity code, published hash and explicit work coordinates on the server. Refuse substituted targets, historical reads and model-supplied internal coordinates.
4. Recheck the current published capability and read permission, then query Records by the descriptor's identity field. Read only declared scalar summary fields; Records and the field projector enforce visibility. JSON/relationship expansion requires a separate owner capability. Null/non-scalar values are omitted, without inferring findings.
5. Validate record/source coordinates and authorization profile. Use existing proposal persistence and citations; replay repeats authorization and compares evidence. Metadata changes, revoked access and changed data prevent reuse.

Explicit requests such as “Show this record summary” use the existing direct renderer with zero model calls. Explicit section requests take precedence over broad entity aliases. Other questions retain the model flow. Summary data establishes saved identity only; eligibility, readiness and list-wide findings require their respective owner providers.

Legacy BP contexts without AI metadata retain existing tools. Once AI is explicitly published, read discovery follows the declared provider list. Mutations retain separate owner, permission and confirmation checks. Local reads are admitted across planes; local mutations remain Neon-only.

## Prototype publication

Use the normal Studio draft → validation → compile → publication workflow. Set `layoutConfig.ai` on exactly one active surface, preserving its other layout properties. Do not modify active runtime projections directly.

| Entity / plane | Draft AI configuration | Prerequisites |
| --- | --- | --- |
| `business_partner` / Neon | [BP example](../examples/atlas-f2/business-partner.ai.json) | Published fields/search bindings from the current descriptor; Records and BP section/insight owners; existing BP read permission |
| `network_relationship` / Mesh | [Relationship example](../examples/atlas-f2/network-relationship.ai.json) | Published relationship fields/search bindings; Records with the Mesh collection-scope resolver; `mesh.catalog.network_relationship.read`; selected account belonging to the actor |

These examples use fields present in the DEV descriptors inspected during foundation work. Revalidate them against the target's current draft and search profiles before publication. The examples do not grant permissions or register owners. Omit optional provider references when those features are intentionally unavailable.

Enable Atlas generation/read tools through the existing host configuration and grant the appropriate `<plane>.ai.agent.use` permission. Any selected agent profile must allow `entity_read_record` (and the desired BP owner tools). Full provider composition retains its externally supplied model admission and tool authority.

For Mesh, send `businessContext.workContext.networkAccountId` from the user's applied work context. Both context resolution and execution invoke the existing Mesh Records owner, which verifies account membership and restricts relationships to that buyer/supplier account. Missing account selection, a foreign account, an unrelated relationship and revoked membership fail closed. The selected account is included in replay evidence.

## Qualification and release gate

Automated coverage lives in:

- [Generic capability tests](../../server/packages/platform/ai/src/__tests__/entity-record-tool.test.ts): discovery, disabled/missing declarations, permissions, profile/admission filters, target/hash substitution, field projection, stale/revoked replay, BP section precedence, and both entities completing through AtlasAgentRuntime with citations and zero provider calls.
- [Records vertical tests](../../server/apps/platform-host/src/composition/__tests__/atlas-entity-records-vertical.test.ts): actual Records query/list services, in-memory persistence and native Mesh account resolver; tenant isolation, field denial, missing/foreign account and membership revocation.
- Existing BP owner, local generation, metadata compiler/parser and host composition suites remain regression gates.

Before a deployment is called qualified, publish the reviewed drafts to that target, confirm its current model/profile/policy inventory, and exercise the two entity record pages with an authorized test actor. Capture descriptor hashes, selected account, tool IDs, citation coordinates, denied-scope behavior and replay results. Automated tests do not certify browser wiring, deployed PostgreSQL policies or live-model behavior. F6 remains the broader release gate.

Rollback through a new published revision setting `ai.enabled` to false or removing the provider reference. Disabling the host read-tool feature stops execution independently of descriptor publication.

Validation recorded for this implementation: 317 Atlas AI tests, 43 metadata-contract tests, 22 Studio-authoring tests, 36 runtime-metadata tests and 9 targeted host tests passed (427 total). All five corresponding package typechecks passed. Root test reachability passed with no excluded legacy tests. Both example JSON files also passed the shared AI parser against current DEV descriptor fields/operations using read-only database queries. No publication or data mutation was performed by that check.
