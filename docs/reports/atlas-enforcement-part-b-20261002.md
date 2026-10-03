# Atlas enforcement Part B audit

Reviewed on 2026-10-02. This report revises the supplied Part B claims against repository source and targeted tests. The capability registry, authorization conjunctions, parent-scope binding and learning review controls are supported within the boundaries below. The full-provider mutation-gate gap has been fixed in shared Atlas composition. Publication, installed database constraints and live runtime acceptance require separate evidence.

## B1 Capability registry

**Verified for registered tool selection.** `AtlasToolRegistry` resolves an exact `toolCode@version`, rejects duplicate registrations with `TypeError`, and rejects unknown identities with `TOOL_DENIED`. Registered manifests are recursively frozen canonical-JSON snapshots. Plane-specific manifest resolution rejects planes absent from `allowedPlanes`.

Metadata selects registered tool identities; it cannot supply an executable module, handler URL, SQL implementation or credential through this registry. This finding covers the registry and the inspected Entity tool integration. It does not establish a universal property of every downstream metadata consumer. [Registry and manifest identity](../../server/packages/platform/ai/src/tool-service.ts)

## B2 Authority and reauthorization

**Verified for the inspected tool-service paths.** Preview requires the manifest plane, required permissions and the server authority decision to allow the operation. The owner preview guard runs only after this conjunction passes. Execution reauthorizes and additionally requires the preview's authorization epoch, profile hash and policy revision to remain current. Epoch/profile changes are recorded as `authorization_epoch_changed`; policy changes are recorded as `policy_revision_changed`.

The four `authority.authorize` call sites are preview, execution, completed-proposal replay and history read-evidence revalidation. History revalidation authorizes a registered read, requires the evidence policy revision to match, performs a fresh read and compares its result hash; it catches failures and returns false. This fourth call site is not the confirmation verifier.

Completed-proposal replay checks current plane, permissions and authority allowance. It does not require the original authorization epoch or policy revision to match, and returns completion/command metadata without old read payloads. Confidence thresholds govern autonomy; the inspected authorization paths do not treat confidence as a permission grant. Deployment tool gates now narrow these authority decisions as well. [Tool service](../../server/packages/platform/ai/src/tool-service.ts), [confidence policy administration](../../server/packages/platform/ai/src/policy-administration.ts), [deployment gates](../../server/packages/platform/ai/src/tool-feature-gates.ts)

## B3 Invocation scope and knowledge admission

**Verified within the inspected read and scope boundaries.** The coordinator recomputes published tool availability at invocation when metadata and business context exist and the registered tool is a read. Under a parent scope, lookup tools reject any caller-owned `scopeCoordinate` property and receive the server-held coordinate. `ENTITY_LOOKUP` must retain the current page entity in that parent scope; authorized cross-entity lookup remains supported outside it. Following references is unavailable under a parent scope; elsewhere it derives source entity, record and descriptor identity from the current record page.

Entity-context tools require the current published record context and reject argument keys absent from their discovered input schema. Knowledge search re-admits candidates from its repository on both index lookups and cache hits, checks tenant identity, active status and required permission, then asks the owner admission adapter to authorize each candidate. Adapter exceptions fail closed. These checks support resistance to the inspected scope substitutions and revocation with an unchanged authorization epoch. [Runtime coordinator](../../server/packages/platform/ai/src/runtime-tool-coordinator.ts), [knowledge search](../../server/packages/platform/ai/src/knowledge.ts)

## B4 Learning review and evaluation binding

**Verified for mechanical principal separation and application evaluation checks.** The inbox table rejects equal stored submitter/reviewer IDs, requires a reviewer for non-pending states, and requires change-set, evaluated-hash and evaluation fields for drafted candidates. The transition trigger also preserves immutable proposal fields, checks revisions and permitted transitions, and requires the draft to belong to the same tenant and recorded reviewer. These database rules constrain stored identities and state; they do not alone authenticate the SQL caller as the reviewer or prove independent human authorship. Merely requiring evaluation fields does not validate their contents. [Inbox constraints](../../server/db/ddl/planes/studio/ai/03_tables.sql), [transition trigger](../../server/db/ddl/planes/studio/ai/07_functions.sql)

The learning service separately rejects proposal submitter/reviewer equality, records the authenticated review principal, constructs evaluation receipts bound to the evaluated descriptor hash, and checks current source, evaluator identity, receipt and passed evaluation before advancing the correction through ordinary metadata authoring/publication. Newly reviewed changes must match the compiled descriptor hash; previously published terms have a distinct validation path. Activation uses entity change sets and releases rather than a separate learning publication stack. [Learning inbox service](../../server/packages/planes/studio/meta-entity-authoring/src/learning-inbox.ts), [evaluation receipts](../../server/packages/planes/studio/meta-entity-authoring/src/learning-evaluation-receipt.ts)

Independent fixture authorship remains a separate acceptance requirement. This source review and its unit tests do not close T04–T05 or attest fixture authorship, human approval or deployed evaluation. The current runbook assigns fixture authorship and candidate proposal to `catl.admin`, and fixture review/publication and candidate evaluation to `catl.owner`. [Controlled learning procedure](../runbooks/atlas-f4-learning-inbox.md)

## B5 Deployment feature gates

**Implemented and verified by composition tests.** Environment parsing consumes `ATLAS_AGENT_ENABLED`, `ATLAS_AGENT_GENERATION_ENABLED`, `ATLAS_AGENT_TOOLS_ENABLED` and `ATLAS_AGENT_MUTATIONS_ENABLED`. Host composition combines agent/persistence enablement for routes and additionally generation/tools enablement for tool availability.

The reviewed full-provider branch previously accepted injected admission and tool authority without applying the mutation deployment flag. Shared gate wrappers now bound admission and authority in local and full-provider composition. Disabled tools deny both access classes; disabled mutations deny mutation preview, execution and completed-receipt replay while permitting otherwise-authorized reads. Enabled gates retain owner denials and explicit mutation confirmation. Gate state and upstream policy revision contribute to a deterministic policy revision, so changing a gate invalidates an outstanding preview. [Environment configuration](../../server/apps/platform-host/src/config/environment.ts), [host composition](../../server/apps/platform-host/src/composition/register-services.ts), [shared gates](../../server/packages/platform/ai/src/tool-feature-gates.ts), [local composition](../../server/packages/platform/ai/src/local-generation-composition.ts)

This establishes consumption and tested enforcement for the inspected Atlas tool composition paths. It makes no claim that unrelated control gates or every other feature gate have been audited.

## Validation and remaining evidence

The shared gate tests cover the tools/mutations flag combinations, preview and execute phases, preservation of owner denials and policy evidence, stable policy identities, gate changes, confirmation and denied replay. The host regression tests exercise the actual full-provider branch, its admission route handler and composed tool service with permissive injected ports. Existing local-generation, registry, parent-scope, tool lifecycle, governance and retrieval tests also pass. [Shared gate tests](../../server/packages/platform/ai/src/tool-feature-gates.test.ts), [full-provider regression tests](../../server/apps/platform-host/src/composition/atlas-feature-gates.test.ts)

Validation passed 64 tests across 13 suites: 48 Atlas AI tests, 11 host composition tests and five existing host Entity integration tests. These include Country record-context tools and the shared Records, lookup and context composition. Both the Atlas AI and platform-host package typechecks passed.

Commands run:

```sh
pnpm --filter @athyper/server-platform-ai exec vitest run src/tool-feature-gates.test.ts src/__tests__/local-generation.test.ts src/tool-registry-identity.test.ts src/entity-parent-scope.test.ts src/__tests__/tool-ledger-lifecycle.test.ts src/__tests__/governance.test.ts src/__tests__/retrieval-f5.test.ts
pnpm --filter @athyper/server-platform-ai exec vitest run src/entity-context-tools.test.ts
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/atlas-feature-gates.test.ts src/composition/__tests__/ai-vertical.test.ts
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/__tests__/atlas-entity-records-vertical.test.ts src/composition/shared/atlas-entity-lookup.test.ts src/composition/shared/atlas-entity-context.test.ts
pnpm --filter @athyper/server-platform-ai typecheck
pnpm --filter @athyper/server-platform-host typecheck
```

No entity metadata was changed or published for this fix. Installed database enforcement, independently authored acceptance fixtures, publication receipts and live serving behavior remain outside these source and unit-test results.
