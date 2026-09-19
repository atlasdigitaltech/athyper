# Business Partner Studio workbench — Stage 1 coverage

Date: 2026-09-16  
Status: Stage 1 source coverage complete; implementation and live qualification pending.

## Scope and evidence boundary

This review maps the proposed Business Partner workbench to the current workspace's UI, HTTP contracts, storage, compiler, and consumer code. It includes existing uncommitted work. It does not certify deployed versions, enabled preview settings, live user permissions, API responses, or target activation. No configuration, grants, publication, or business records were changed for this review.

The deliverable is an implementation map and an explicit supported-edit boundary. A route in source is evidence of implementation, not evidence that a deployed user can call it. Backend gaps below mean gaps in the inspected workbench integration unless specifically identified as absent from the inspected route surface.

## Executive findings

1. Reuse the existing native entity graph/change-set APIs and Business Partner bundle authoring service. Do not add another configuration store.
2. The current workspace already contains supplier form and workflow editors within Publication. Earlier descriptions of these capabilities as entirely missing are outdated for this workspace.
3. There are two different preview paths. Native graph preview compiles the graph and checks dependencies. Business Partner bundle preview has a narrower change policy. Their revision IDs, activation evidence, and supported changes must not be conflated.
4. Bundle preview supports cosmetic changes and constrained operational changes, but rejects required-flag changes, new form fields, permission changes, and validation/duplicate-rule changes. Existing editor controls exceed this preview allowance.
5. Existing publication reads require known release/deployment IDs. The inspected UI does not assemble definition → release → deployment → target-active evidence into a shared context.
6. The metadata needed for surface → operation → permission → scope inspection exists. Separate widget API dependencies need an explicit supplementary inventory.
7. Read-only browsing is not automatically authorized by today's graph API: graph list/read require `metadata.entity.author`. Resolve reader authorization before exposing an inspector to non-authors.

## 1. Authoritative objects and version boundaries

| Configuration family | Source / storage | Existing editing path | Target evidence / limitation |
| --- | --- | --- | --- |
| Native entity graph | `metadata.entity`, `entity_change_set`, fields, relations, surfaces, operations, permission/scope bindings; `metadata.entity_release` | `/entity/graphs`; graph list/read/fork/replace and lifecycle APIs | Runtime release/compiler projections, including `runtime_meta.applied_release` and `authz.entity_operation_binding`; no unified Studio target-active inspector found |
| Business Partner definition bundle | `snapshot.business_partner_definition_revision`; `publication.business_partner_definition_release_link`; `publication.release` | Publication bundle authoring; immutable revision creation, simulation, independent publication | Local definition consumer and preview overlay; native graph change-set revision is a different identifier |
| Task-edit policy and supplier process baseline | Separate versioned policy/process contracts | Existing task-edit policy authoring and baseline controls | Must retain policy/process pins; not automatically updated by saving a graph or bundle |
| Case contract | Separate immutable case-contract revision and release workflow | Existing case-contract simulation/author/read/publish controls | Publication response explicitly distinguishes queueing from consumer activation |
| Atlas experience | Separate experience draft/release contract | Existing Atlas experience editor | Keep its revision/status separate; not one atomic Business Partner bundle save |

Evidence: [graph contract](../../../server/packages/contracts/meta-entity-authoring/src/model.ts), [metadata DDL](../../../server/db/ddl/planes/studio/metadata/03_tables.sql), [bundle service](../../../server/packages/services/publication/src/business-partner-definition-service.ts), [case contract UI](../../../packages/planes/studio/business-partner/src/case-contract-authoring.tsx), [task policy UI](../../../packages/planes/studio/business-partner/src/task-edit-policy-authoring.tsx).

## 2. UI requirement coverage

| Requirement | Available now | Gap / Stage 2 action | Classification |
| --- | --- | --- | --- |
| Shared selected definition/version | Graph list/read and bundle read by ID | Add shared typed selection carrying configuration family, tenant, ID, revision/hash, and target; preserve across tabs | Frontend integration |
| Published vs active header | Release/deployment reads, provenance API, Neon active descriptor read | Resolve revision to release/deployments and expose authorized target-active evidence; never infer activation from publish success or highest release number | Read-model/API integration gap |
| Overview counts/status | Graph arrays and release metadata | Derive counts from selected stored graph; label missing status explicitly | Frontend integration |
| Data Model fields/relations | Native graph fields, keys, relations | Replace static cards with tables and detail panels | Frontend integration |
| Surface inspector | Graph surfaces, sections, field/component bindings, surface operations | Add field usage and section/action navigation | Frontend integration |
| Validation inspector | Graph operation rules/policy bindings; bundle `validationDeclarations` | Show provenance and distinguish declarations from proven execution; rule-specific runtime consumption still needs tracing before enabling edits | Read integration; execution qualification gap |
| Matching inspector | Bundle `duplicateRules`; compiler validates required policy presence | Show actual selected configuration; no dedicated matching simulator identified in inspected routes; declaration alone does not prove runtime use | Read integration; simulator/consumer gap |
| Workflow inspector | Bundle `workflowDefinitions`; existing workflow designer and consumer | Show actual stages and pins; connect separate task policies/case contracts without implying atomic updates | Integration |
| Permission trace | Graph `surfaceOperations`, `operations`, `operationPermissions`, `operationScopeBindings`; target authz projections | Build join and diagnostics for absent/ambiguous mappings; separate authored mapping from applied mapping | Frontend plus target read gap |
| Widget dependency trace | Attachment component explicitly calls stage/finalize/status APIs | Add evidence-backed dependency registry starting with attachments; no generic automatic discovery promised | New bounded metadata/read adapter |
| Draft creation/save | Graph fork/replace; bundle immutable author API | Choose edit path explicitly; preserve unrelated graph content and optimistic revision checks | Reuse |
| Validate/test | Native graph lifecycle endpoints; bundle simulation | Expose existing actions and distinguish validation, compilation, contract fixtures, and live tests | Frontend integration |
| Preview | Native graph preview; guarded bundle preview | Display preview type, saved/active revision, errors, and development-evidence label; verify environment prerequisites | Reuse with qualification |
| Human-readable differences | Both definitions can be read by known IDs | Add typed semantic diff with stable keys; no dedicated structured comparison endpoint identified in inspected workbench clients | New frontend/domain adapter |
| Publish and track | Existing publication/approval UI and APIs | Consolidate navigation and result tracking; preserve independent approval/MFA requirements | Integration |
| Guided editing | Supplier request form and workflow editors already exist | Disable unsupported controls for selected preview mode; add only validated edits to graph-backed workbench | Existing UI alignment |
| Neon test links | Existing Neon request routes | Link to new-request flow with visible expected version; do not assume old cases migrate | Frontend integration and E2E qualification |

The Model, Validation, Matching, and Workflows route pages remain descriptive in the inspected source. Publication embeds real editors; their presence does not establish that every offered edit can activate through local preview.

## 3. HTTP coverage and authorization

Paths below are backend paths. The graph browser client uses `/meta-entity-authoring/...`; the backend and relay contracts use `/api/meta-entity-authoring/...`. Preserve transport conventions rather than blindly copying backend paths into clients.

| API | Access requirement | Coverage / qualification needed |
| --- | --- | --- |
| `GET /api/meta-entity-authoring/change-sets` | `metadata.entity.author` | Existing list; add selected-entity filtering in the adapter or API if needed |
| `GET /api/meta-entity-authoring/change-sets/:id/graph` | `metadata.entity.author` plus scoped lookup | Full graph and optional preview status; suitable source for inspector |
| `POST .../change-sets/:id/fork` | `metadata.entity.author` | Existing draft creation from selected change set |
| `PUT .../change-sets/:id/graph` | `metadata.entity.author` | Existing whole-graph replacement with `expectedRevision` |
| `POST .../change-sets/:id/validate`, `/test` | `metadata.entity.validate`, `.test` | Existing distinct checks |
| `POST .../change-sets/:id/submit`, `/approve`, `/publish` | `metadata.entity.submit`, `.review`, `.publish` | Existing controlled lifecycle; use required revision and target inputs |
| `POST /api/meta-entity-authoring/releases/:id/activate`, `/rollback` | `metadata.entity.activate`, `.rollback` | Existing mutation paths; not part of Stage 2 read-only implementation |
| `GET /api/studio/local-business-partner-preview` | `studio.business_partner_definition.read` | Local-preview lookup; not a general production published-definition list |
| `POST /api/studio/business-partner-definitions` | `studio.business_partner_definition.author` | Immutable bundle revision; may also trigger guarded local preview |
| `GET /api/studio/business-partner-definitions/:revisionId` | `studio.business_partner_definition.read` | Requires a known revision ID; inspected client has no bundle revision listing operation |
| `POST /api/studio/business-partner-definitions/simulations` | `studio.business_partner_definition.read` | Compilation/compatibility simulation, not a live business transaction |
| `POST /api/studio/business-partner-definitions/:revisionId/publish` | `studio.business_partner_definition.publish` plus service checks | Returns release and job IDs; not proof of target activation |
| `GET /api/publication/releases/:releaseId` | `publication.release.view` | Existing release read |
| `GET /api/publication/deployments/:deploymentId` and `/provenance` | `publication.deployment.view` | Existing target deployment evidence by known ID |
| `GET /api/publication/operations/destinations/:plane/:targetInstance/health` | `publication.deployment.view` | Destination health; not proof that a specific release is active |
| `GET /api/neon/business-partner-definitions/active-descriptors` | `neon.relationship.business_partner.read` | Target-local forms/views; Studio cross-plane exposure and relay support must be verified |
| `GET /api/neon/business-partner-definitions/active-request-form` | `neon.relationship.entity_case.create` | Supplier request schema/descriptor; existing relay entry found; not a general graph or release-status API |
| Task policy baseline/author/read/publish APIs | Existing policy authorizer; verify exact actor permissions in integration | Keep separate policy revision context; baseline read is `/api/studio/supplier-task-rule-baselines` |

Evidence: [graph routes](../../../server/packages/planes/studio/meta-entity-authoring/src/routes.ts), [graph client](../../../apps/studio/app/(shell)/entity/graphs/graph-model.ts), [definition client](../../../packages/planes/studio/business-partner/src/definition-client.ts), [definition routes](../../../server/packages/services/publication/src/business-partner-definition-routes.ts), [publication routes](../../../server/packages/services/publication/src/publication-routes.ts), [consumer routes](../../../server/packages/services/publication/src/business-partner-definition-consumer-routes.ts), [relay registry](../../../packages/platform/gateway/bff-relay/src/index.ts), [host registration](../../../server/apps/platform-host/src/composition/register-services.ts).

### Read-model contract to settle before Stage 2

Proposed, not an existing endpoint: an authorized read adapter should return the selected configuration family/ID/hash, source release linkage, target plane/tenant/instance, deployment identifiers/status, verified active identifiers, observation time, and explicit unavailable/error states. Prefer composing existing reads; add a narrow backend endpoint only where discovery or cross-plane authorization is missing. Do not reuse a Studio principal's authority implicitly in Neon. Do not query another plane's database from the browser.

## 4. Supported edit matrix

| Edit | Bundle local preview policy | Native graph path / delivery decision |
| --- | --- | --- |
| Labels, titles, descriptions, help text, placeholders, submit/add labels | Accepted for supported presentation keys: nonempty string, max 2,000 characters | Candidate first guided edit; compiler and exact consumer still validate |
| Column span | Integer 1–12 accepted | Candidate first guided edit |
| Reorder existing sections/fields/columns/panels/options | Accepted when identities and collection size are preserved | Candidate; preserve stable bindings |
| Text ↔ textarea | Accepted | Candidate; no arbitrary widget replacement |
| Required flag, max length | Rejected by bundle presentation allowlist | Native graph may represent these, but save/compile/preview and runtime validation tests are required before advertising support |
| Add/remove fields or sections; change key/path/storage target | Rejected by bundle presentation allowlist | Existing form editor exposes these controls; constrain mode. Structural edits deferred |
| Lookup option value additions/removals | Not allowed by same-membership presentation policy | Defer; reordering existing values differs from changing allowed values |
| Workflow stages | Constrained stage edits accepted: 1–20 stages, unique valid codes, supported mode/quorum/SLA/reminder/condition shapes, `noSelfApproval: true`; non-stage declarations unchanged | Existing designer can be reused after validating emitted payloads; not a generic workflow designer |
| Workflow permission/approver-resolution/SoD declarations | Rejected outside supported stage shape | Formal governed path; do not bypass through preview |
| Request supported sources | May narrow to a nonempty unique subset of existing sources; other request schema properties unchanged | Operational preview change; qualify separately from cosmetic changes |
| Validation declarations / duplicate rules | Rejected by bundle preview | Read-only initially; trace runtime consumption and formal publication path |
| Permission mappings / scope requirements | Rejected by bundle preview | Native graph/compiler-owned authorization path exists; inspector read-only first |
| Task-edit policy / case contract | Separate APIs, not bundle cosmetic preview | Reuse existing independent versioned workflows |

Evidence: [bundle preview policy](../../../server/packages/services/publication/src/local-definition-preview-policy.ts), [form designer](../../../packages/planes/studio/business-partner/src/supplier-request-form-designer.tsx), [workflow designer](../../../packages/planes/studio/business-partner/src/workflow-designer.tsx), [authoring integration](../../../packages/planes/studio/business-partner/src/authoring.tsx).

### Preview environment and lifecycle

- Bundle preview requires `ATHYPER_LOCAL_PREVIEW_ROOT`, `ATHYPER_LOCAL_WORKSPACE=1`, `ATHYPER_ENV=local`, and `ATHYPER_DOMAIN_SUFFIX=dev.athyper.test`. A `.dev.athyper.test` URL alone does not prove preview is enabled.
- Native graph preview also enforces the local workspace/environment/domain boundary. It uses the graph compiler, contract checks and dependency preparation rather than the bundle cosmetic allowlist.
- Native graph preview reports `compiling`, `active`, `failed`, or `superseded`, with saved and active revisions. Failed preparation must preserve the prior active head.
- Bundle authoring can persist an immutable revision before preview activation fails. UI must distinguish “saved” from “active preview”.
- Local preview is development evidence, not formal release qualification. Cosmetic bundle preview deliberately preserves command/workflow definition coordinates; operational changes follow different handling in the consumer.
- Verify version pinning with both a new request and an existing request. Do not promise automatic migration of existing cases.

Evidence: [native graph preview](../../../server/packages/planes/studio/meta-entity-authoring/src/graph-preview.ts), [bundle preview](../../../server/packages/services/publication/src/local-definition-preview.ts), [consumer](../../../server/packages/services/publication/src/business-partner-definition-consumer.ts).

## 5. Permission trace design

Join `entity_surface` → `entity_surface_operation` → `entity_operation` → plane-specific `entity_operation_permission`, plus `entity_operation_scope_binding`. Display operation key, placement, handler, target plane, required permission, coordinate source, and selected source revision. A headless operation is valid; absence of a surface placement is not an authorization error.

For target comparison, inspect `authz.entity_operation_binding` and its scope children against the applied runtime release. A source definition and a target binding are separate evidence. Mark target evidence unavailable when it cannot be obtained.

Attachment upload is a separate dependency: the registered request widget calls stage, finalize, and status APIs. Their authorization is not inferred from Business Partner create/submit permissions. Start an explicit dependency inventory from [the widget](../../../packages/planes/neon/business-partner/src/request-attachment-field.tsx) and [attachment routes](../../../server/packages/services/attachments/src/attachment-routes.ts). Do not label this inspector as effective-user-access testing without calling the real target authorization engine.

## 6. Gap register and implementation order

| ID | Gap | Required action | Priority |
| --- | --- | --- | --- |
| G1 | No shared configuration-family/version context across tabs | Typed selection model; preserve IDs/hash across navigation; distinguish graph, bundle, policy, case contract, experience | Stage 2 foundation |
| G2 | No integrated revision-to-target-active discovery | Trace existing release/deployment discovery; add authorized read composition and explicit unavailable states | Stage 2 header |
| G3 | Graph reads require author authority | Decide whether initial developer inspector uses existing author access or needs a separate read contract; never silently broaden permissions | Before broader rollout |
| G4 | Descriptive tabs hide stored configuration | Build read-only graph/bundle adapters and source-linked views | Stage 2 core |
| G5 | Editor controls exceed local preview support | Mode-specific edit capability model; disable/reject unsupported changes before save | Before Stage 3 |
| G6 | No readable version comparison in inspected clients | Semantic diff keyed by stable entity/member identity; preserve unknown properties | Stage 3 |
| G7 | Rule/matching declaration does not prove runtime execution | Trace consumers per displayed setting; label code-owned or unverified behavior; qualify before enabling editing | Inspection labeling now; edits later |
| G8 | Workflow/policy/case versions are independent | Show references/pins and link existing editors; avoid a fictitious single atomic save | Stage 2/3 |
| G9 | Target authz projection and widget dependencies not visible | Read-only binding inspector plus attachment dependency inventory | Stage 2 |
| G10 | Local versus deployed behavior unverified | Check API access, relay paths, preview flags, active baseline, and target evidence using an authorized session in implementation qualification | Before claiming live readiness |

Recommended build order: G1 → graph-backed read views (G4) → active-status read composition (G2/G3) → operation inspector (G9) → mode-specific editing and differences (G5/G6). Matching and policy views can initially be read-only with explicit source/consumer limitations.

## 7. Acceptance checks for following stages

1. One selected stored revision drives every tab; switching tabs never selects an unrelated “latest” version.
2. Fields, surfaces, rules, and operations match the stored graph/bundle; empty, denied, and unavailable states are distinguishable.
3. Publish success is never rendered as target activation without target evidence.
4. A supported label edit survives save/read without loss of unrelated graph members.
5. Unsupported required/new-field changes are blocked in bundle-preview mode with the actual reason.
6. Failed or superseded preview reports the saved revision and prior active revision correctly.
7. Operation trace identifies permission, scope source, and source version; separate attachment permissions are visible.
8. New and existing Neon requests verify intended version-pinning behavior.
9. Read-only inspection performs no publication, grants, or business-data mutations.

## Stage 1 exit

UI requirements are mapped to source/API/storage evidence; supported preview edits and backend/integration gaps are explicit. Stage 2 may proceed using this bounded scope. Live deployment readiness and end-to-end edit activation remain acceptance work for later stages, not claims of this coverage review.
