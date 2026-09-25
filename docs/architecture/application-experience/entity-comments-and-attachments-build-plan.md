# Entity comments and attachments — metadata-controlled build plan

Decision accepted: 2026-09-21. Documentation revision: 3 — local build simplification. Status reviewed: 2026-09-23. Implementation status: in progress; NEON Business Partner local acceptance is recorded, but the full workstream is not yet closed.

Parent: [Shared Application Experience build plan](build-work-plan.md). Product behavior: [Comments and attachments design](entity-comments-and-attachments-design.md). Layout reference: [interactive prototype](../../prototypes/entity-comments-attachments.html).

### Closure review — 2026-09-23

The [CA-10 acceptance record](entity-comments-and-attachments-ca10-local-acceptance.md) confirms signed release 13 activation and a passing signed-in NEON Business Partner journey. It explicitly leaves these required checks open:

- Activate and exercise a second real entity through published metadata and its domain admission provider.
- Complete the remaining Mesh/Studio authorization acceptance; unavailable endpoints are not passing denial checks.
- Verify configured mention/inbox delivery with current-access checks.

Before closing, reconcile the CA-10 cleanup and documentation checklist, the parent workstream status, and the findings in the [2026-09-22 service review](../../reports/entity-collaboration-phase1-review-20260922.md) with subsequent fixes and focused verification. That review is historical evidence; this documentation review does not establish whether each finding still exists in current source. Passing UI regressions alone do not resolve those service findings or the remaining integrated checks.

This review updates status only; it does not rerun acceptance, close unchecked requirements, or add production release gates. Optional Office/encrypted-document preview, AI and new outbound providers remain outside the required closure scope.

## 1. Purpose, scope and precedence

Build one shared Comments/Files capability controlled by published MetaEntity definitions, with a contextual drawer and expanded content view sharing state, resources and commands. Start with local Neon Business Partner; demonstrate a second real entity and qualify the shared schema/authorization boundary across Neon, Mesh and Studio.

This is the execution plan for the accepted capability expansion. It follows the parent plan's basic Phase 7 integration, whose existing completion/acceptance record remains historical evidence. The work below is not complete because basic comment/upload sections already exist. If earlier documents suggest permissive capability JSON, unconditional upload restaging or duplicate entity-specific readers, the explicit contracts here govern this workstream.

The repository is local-only and has not reached staging. The execution rule is **comprehensive implementation, direct schema evolution, focused regression tests and one final local acceptance pass**. Update code, contracts, canonical DDL and seeds together. Remove superseded definitions and callers once replaced; do not build migration compatibility, dual-write paths, historical-data conversion, rollout cohorts or production-readiness evidence packages for this workstream.

Keep strict metadata validation, published-definition authority, tenant/parent/audience authorization, scanning, concurrency, retention and recovery behavior. These are product correctness requirements even in a local build. Immutable MetaEntity releases and business audit/revision records remain application features; they are not deployment ceremony.

Use a fresh disposable local database and isolated storage/queue test namespaces to verify the new schema and seeded journeys. The existing local database and object-storage contents are not implicitly disposable. Updating source DDL does not update an existing database. Repoint the validation runtime to the fresh database, or perform an explicitly authorized local reset later; do not add a migration framework merely to retain incidental test data. Preserve the current local environment while this documentation is updated.

### One completion rule per work package

Implementation complete; affected typechecks and focused regression tests pass; the relevant local check works; remaining limitations are recorded. A package whose real journey depends on later UI/provider work can close with its focused service/component check and carry that journey to CA-10 explicitly. Run the complete local journey once after integration, rerunning only affected parts when a fix warrants it. No separate approval or evidence dossier is required at each phase.

Record three short items: what changed, what was checked, and what remains. Keep CA-00–CA-10 as implementation checklists rather than eleven independent release gates.

### Accepted decisions

| ID  | Decision                                   | Implementation implication                                                                                                |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| D01 | Shared drawer and expanded content view    | Same components, cache, draft and upload state; one shell surface coordinator                                             |
| D02 | Typed MetaEntity capabilities              | Explicit enabled state, service binding, policy and supported presentation; unknown normative properties rejected         |
| D03 | Shared service ownership                   | Collaboration/attachments own commands and data rules; entity runtime supplies authorized bindings                        |
| D04 | Publication-time validation                | Validate schema, cross-artifact consistency, dependencies, permission catalog and handler compatibility before activation |
| D05 | Shared canonical document storage          | No per-business-entity comment/file tables or second upload protocol                                                      |
| D06 | Immutable versions and historical evidence | Series is logical identity; attachment is immutable bytes; comments pin versions                                          |
| D07 | Parent and audience admission everywhere   | Lists, counts, details, downloads, previews, comments, search, notifications and AI follow the same access boundary       |
| D08 | Service-owned invariants                   | Metadata cannot disable tenant isolation, scan admission, immutable storage, authorization or legal holds                 |
| D09 | One reporting model                        | `event.comment_flag` plus `governance.comment_moderation`; reconcile Studio's alternate flag table                        |
| D10 | Shared revision history                    | Qualify and converge Studio's comment revision model across planes without manufacturing historical content               |

## 2. Baseline evidence and known gaps

The current source has `platform.comments.v1` / `platform.attachments.v1` compiled renderers, basic explicit commands, stable-ID upload retry in the compiled uploader, a rich JSON/clipboard composer and shared service APIs. Source publication examples already declare comments/attachments in Core and attachment policy in Operation. Their presence is not proof that every declared option is validated or executed.

Specific baseline evidence:

- [Core example](../../../metadata/products/mdg/entities/business_partner/core.json): `capabilities.comments` and `capabilities.attachments`.
- [Operation example](../../../metadata/products/mdg/entities/business_partner/operation.json): `attachmentBinding`, including proposed policy defaults.
- [Core schema](../../../metadata/schemas/entity-artifacts-v2/core.schema.json) and [Operation schema](../../../metadata/schemas/entity-artifacts-v2/operation.schema.json): reviewed capability/binding slots have permissive empty schema declarations; typed nested validation is required.
- [Canonical document DDL](../../../server/db/ddl/common/document/03_foundation_tables.sql), [Studio document DDL](../../../server/db/ddl/planes/studio/document/03_tables.sql), and [MetaEntity authoring DDL](../../../server/db/ddl/planes/studio/metadata/03_tables.sql): existing storage and authoring boundaries.
- [Docker inventory](evidence/entity-attachments-20260921/container-inventory.json): prior snapshot of 55 containers, 54 running. It is historical evidence, not a new health assertion.
- Prior live DEV probe: Gotenberg `/health` returned 200 but preview adapter `/render` returned 404. Effective parser/render networks differed from current source Compose. Recheck during implementation; no restart was performed in the review.

Required correctness work includes explicit parent admission, Internal/Private visibility through all projections, comment attachment association eligibility, series-level lifecycle predicates, draft-only attachment privacy, authoritative revisions, outcome-aware retry, preview protocol integration and actual purge scheduling. Track these in the work packages below rather than marking them resolved by UI visibility.

## 3. Table inventory and ownership

These are source-defined tables. CA-00/CA-02 check their consumers and directly update canonical definitions, foreign keys, triggers, indexes, RLS, role grants and seeds. Verify the result by building a fresh local database; a historical live-schema reconciliation report is not required.

### Shared document and collaboration model

| Table                                  | Purpose and identity                                                                                  | Owner / treatment                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `document.attachment_series`           | Logical file, current version, lifecycle, expiry/retention                                            | Attachments service; explicit version promotion                             |
| `document.attachment`                  | Immutable version bytes referenced by bucket/key, hash, MIME, size; operational scan/extraction state | Attachments service; protect processing/storage columns from generic writes |
| `document.attachment_link`             | Entity/comment association to series, optional pinned version, folder and link kind                   | Attachments with parent-owner admission; no extra comment-attachment table  |
| `document.attachment_folder`           | Record-scoped folder hierarchy                                                                        | Attachments; enforce record ownership and cycle-safe moves                  |
| `document.attachment_derivative`       | Preview/thumbnail/page rendition with specification and processing evidence                           | Derivative service; immutable-source linkage and scan admission             |
| `document.attachment_legal_hold`       | Attachment-series hold preventing physical deletion                                                   | Privileged retention/legal-hold operations                                  |
| `document.attachment_legal_hold_event` | Hold change history                                                                                   | Append-only evidence through owning service                                 |
| `document.comment`                     | Current content, author, audience, status and parent thread                                           | Collaboration service; explicit authorized commands                         |
| `document.comment_draft`               | Principal-owned draft by entity/thread coordinate                                                     | Collaboration; no access through public feed                                |
| `document.comment_feed_cursor`         | Principal read marker for a record                                                                    | Collaboration; monotonic updates and authorized counts                      |
| `document.comment_mention`             | Mention recipients                                                                                    | Collaboration; recipient eligibility and audience intersection              |
| `document.comment_reaction`            | Per-principal reaction to comment                                                                     | Collaboration; target read access and controlled reaction vocabulary        |
| `event.comment_flag`                   | User report against a comment                                                                         | Collaboration submits; reporting is not a moderation decision               |
| `governance.comment_moderation`        | Review/decision for reported comment                                                                  | Governance; existing flag/review linkage is the canonical path              |

### Supporting shared services

| Tables                                                                                                | Role                                                            | Scope qualification                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `runtime_meta.usage_reservation`, `runtime_meta.tenant_usage_counter`                                 | Reserve/commit/release upload quota                             | Actual attachment ledger dependencies                                                                                  |
| `control.usage_metric_catalog`                                                                        | Bytes/items metric definitions                                  | Actual attachment ledger dependency                                                                                    |
| `control.subscription_plan_usage_limit`, `control.tenant_usage_limit_override`                        | Existing capacity policy structures                             | Integrate only through the quota-policy owner; current configured resolver is not proof these already determine limits |
| `control.lookup_domain`, `control.lookup_value`                                                       | Active comment types/intents/reactions and permitted vocabulary | Repository uses controlled lookup keys, not separate physical tables for every `document.*` lookup name                |
| `control.policy_definition`, `control.policy_rule` and policy activation/test records                 | Policy definition and evaluation infrastructure                 | Reuse through versioned publication bindings and registered evaluators                                                 |
| `event.outbox`                                                                                        | Durable events/processing intent                                | Transactional service writes; idempotent consumers                                                                     |
| `audit.audit_log`                                                                                     | General business/security evidence                              | Shared audit owner; does not replace a readable comment revision history                                               |
| `event.notification_message`, `event.notification_delivery`, `event.notification_inbox_state`         | Mention/reply notification pipeline and inbox                   | Optional integration; reauthorize content at dispatch/open                                                             |
| `event.notification_message_attachment`                                                               | Attachment associations for delivered messages                  | Only when notification policy permits file delivery; prefer authorized app links                                       |
| `control.notification_template`, `control.notification_routing_rule`, `control.notification_provider` | Delivery configuration                                          | Notification owner; no provider credentials in entity metadata                                                         |

Job execution, authentication, principals, permission catalogs, retention and AI/search persistence also use their existing owner schemas. They are dependencies, not new collaboration-owned tables. CA-00 records the exact tables touched by selected integrations; this inventory does not claim an exhaustive transitive database dependency list.

### Conditional and overlapping document tables

| Table                                                         | Current source location / role                  | Decision                                                                                                 |
| ------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `document.comment_revision`                                   | Studio-specific DDL; append-only revision model | Converge to shared canonical history after consumer/trigger/grant inventory                              |
| `document.comment_moderation_flag`                            | Studio-specific DDL; alternative report model   | Reconcile to `event.comment_flag` + `governance.comment_moderation`; no new parallel writer              |
| `document.multipart_upload`, `document.multipart_upload_part` | Plane-specific upload workflow definitions      | Deferred unless resumable multipart upload is explicitly enabled; single-PUT MVP does not depend on them |
| `document.content_item`, `document.content_item_link`         | Content-library item/link model                 | Optional integration; do not create content items for ordinary entity files                              |
| `document.render_output`                                      | Generated-document output                       | Preserve generated business-document ownership; bridge only through authorized evidence associations     |

### Metadata authoring and runtime storage

| Existing structure                                                                                                                             | Intended role                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `metadata.entity`, `metadata.entity_change_set`, `metadata.entity_release`                                                                     | Entity identity and controlled authoring/release                                  |
| `metadata.entity_policy_binding`                                                                                                               | Typed policy references mapped to entity/operation scope                          |
| `metadata.entity_operation`, `metadata.entity_operation_permission`                                                                            | Explicit service operations and permissions                                       |
| `metadata.entity_surface`, `metadata.entity_surface_section`, `metadata.entity_surface_component_binding`, `metadata.entity_surface_operation` | Drawer/content presentation and allowed action projection                         |
| `metadata.entity_contract_test_case`                                                                                                           | Entity-level positive and negative contract examples                              |
| `runtime_meta.applied_release`, `runtime_meta.applied_release_payload`, activation records and existing descriptor/contract projections        | Applied immutable release and admitted runtime projection through existing reader |

Do not add business-table `hasComments` / `hasAttachments` columns or arbitrary collaboration JSON to `metadata.entity_runtime_profile`; its current contract excludes policy and presentation. Trace capability persistence in the actual authoring-to-compiler path. Reuse existing policy/member records where appropriate. Add a narrowly scoped, change-set-bound capability member only if no suitable representation exists; briefly document its schema purpose. Do not assume a new table is mandatory.

## 4. Typed definition contract

### Ownership and single-source rules

Core declares capability availability and owner/service identity. Operation/policy artifacts own behavioral rules. Presentation owns labels, placement and supported controls. The compiler produces one resolved, authorized capability projection for the browser. Configuration must not be copied into unrelated artifacts with independent precedence.

Retain the existing `attachmentBinding` location while typing its contents and references. Add a corresponding typed comment binding through a deliberate schema revision. Update schemas, authoring, compiler, consumers and local examples together; do not retain readers for superseded unpublished development formats. Do not introduce a parallel `collaboration.settings` object with the same rules. Shared policy references resolve to immutable version/hash dependencies, not mutable “latest” policy lookups. Where presentation repeats a policy-derived value for convenience, make it compiler-generated and reject authored contradictions.

### Required definition fields

CA-01 finalized nested capability schema version 1 in `server/packages/contracts/publication/src/entity-capabilities.ts`. [Implementation and local acceptance](entity-comments-and-attachments-ca01-ca02-implementation.md) specifies required/default/optional semantics, the Studio mapping and enabled operations. Later-package feature requirements below do not imply that their handlers or UI are already enabled.

| Concern          | Required definition                                                                  | Validation                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Capability       | Enabled, service key/version, owner entity binding, lazy activation                  | Missing means disabled; unresolved required service fails publication                                             |
| Owner            | Registered parent identity/admission binding                                         | No caller-nominated SQL/table/handler; verify entity and record membership                                        |
| Comments         | Rich-text schema, text bound, maximum depth, allowed/default audience                | Default must be allowed; depth ≤ service ceiling; schema must be supported                                        |
| Comment features | Replies, edits, reactions, mentions, drafts, reporting, revision-history access      | Each enabled feature requires real read/command handlers and permissions                                          |
| Comment files    | Allowed, count bound, attachment-policy reference, version pinning                   | Policy cannot broaden comment visibility; require clean eligible versions                                         |
| Files            | MIME allowlist, byte/batch bounds, categories/link kinds                             | Nonempty valid lists, active catalog values and platform/tenant capacity constraints                              |
| File management  | Folders, versioning, duplicate-file behavior, rename and unlink semantics            | No operation without supported storage/handler behavior                                                           |
| Audience         | Registered membership policy, allowed choices, default                               | Internal is meaningful only with defined membership; Private remains principal-scoped                             |
| Retention        | Approved retention-policy reference and expiry behavior                              | Expiry is not permission to purge held/referenced content                                                         |
| Processing       | Preview/extraction/search eligibility and allowed renditions                         | Static provider contract supported; transient provider outages affect readiness rather than rewriting definitions |
| UI               | Drawer/content support, section bindings, labels, fields, filters, display order     | Known renderer/field/action keys; no business-record IDs in shared definitions                                    |
| Operations       | Stable keys, permission refs, handler refs, concurrency and idempotency requirements | Catalog/registry compatibility and non-disclosing errors                                                          |

Initial byte/batch/thread limits use existing ceilings (25 MiB upload default, 10 comment attachments, thread depth 5) as reviewed starting constraints, not unconditional entitlements. Entity policy may tighten them; runtime intersects entity policy, tenant entitlement, service limits and current authorization. Retention combines obligations rather than choosing the smallest duration. Required business evidence validates the selected active, clean, categorized/pinned document, not merely a file count.

### Publication and runtime checks

- Closed typed objects at every normative level; reject misspellings and unknown required variants. Avoid unvalidated extension maps as an escape hatch.
- Validate references, hashes, release membership, plane compatibility, audience dependencies and operation coverage as one artifact graph.
- Reject mismatched Core enabled state, section binding, owner code and operation service key. Disabled capability emits no actionable UI resources.
- Validate registered handler contracts and permissions without performing uploads, scans, writes or quota reservations during compilation.
- Check actual provider protocols during CA-09 and the final local journey. A temporary processor outage is an operational state, not a reason to republish definitions or add another release gate.
- Commands resolve the admitted release/policy server-side. Direct capability APIs perform the same policy resolution as runtime-dispatched operations; neither route bypasses the owner service.
- Bind upload intent to its admitted policy/release and owner. Finalize checks current access and current mandatory safety constraints. If a policy tightened or was disabled, return a typed conflict/denial and preserve cleanup evidence; never silently switch to looser defaults.
- Read historical evidence under current permissions/retention while preserving the version originally referenced. Policy changes do not rewrite earlier file/comment content.
- Tenant/principal/plane come from verified context. Browser state cannot choose authority. Return safe effective capabilities; never return raw storage, policy internals, secrets or unchecked content.

### Definition test cases required before UI activation

Valid minimal capability, disabled capability, alternate entity reuse, restrictive tenant policy, missing service, misspelled property, unknown MIME/category/reaction, invalid default audience, deeper-than-supported threads, unsupported operation, cross-plane policy reference, missing release dependency, false scan bypass, mutable policy reference and inconsistent section action. Each rejection identifies the artifact and offending field without leaking restricted runtime data.

## 5. Shared resource registration and data invariants

Register user-addressable shared resources for controlled metadata discovery/contracts as needed: file series/version, record link/folder, comment/thread and moderation case. Use service-backed read/write facades; generic CRUD must not bypass lifecycle. Operational satellites such as derivatives, mentions, reactions, reservations and hold events do not each need a general-purpose Entity App. Their service-owned schemas/contracts remain controlled even when no generic screen exists.

Invariant checklist:

- Immutable file bytes/hash/version identity; rename changes a display label, not the original object.
- One atomic current-version promotion under expected series revision. Preserve previous current until replacement passes admission.
- Comment attachments pin a clean version and inherit comment access; a separately authorized record link is an explicit sharing action.
- Parent, folder, link, version and series coordinates must match within plane/tenant. Text polymorphic coordinates cannot be secured by a fictitious cross-table FK; resolve through registered owner admission.
- Series status/expiry, attachment status/expiry, scan status, pinned version and applicable holds are consistently evaluated in all resource paths.
- Remove association and delete underlying content are distinct commands. Reused objects and historical evidence survive unrelated unlink operations.
- No network/scan operation inside a long-running DB transaction. Quota, lifecycle and durable command/event effects commit at appropriate short transaction boundaries.
- Revision/outbox keys remain stable across retries; background jobs recheck lifecycle before committing and cannot resurrect deleted data.
- GET, render, prefetch, schema validation and hidden panel mount have no business mutations.

## 6. Direct schema evolution and Studio model cleanup

The source schema is the implementation target. Edit canonical DDL and dependent manifests, constraints, indexes, functions, triggers, grants, RLS, generated contracts and seeds in the same work package. Build a fresh database using the repository's supported setup path. Do not create upgrade/down migrations, copy old report rows, preserve obsolete schema versions or maintain old/new writers for this local-only feature.

### Comment revision history

1. Inspect Studio's existing revision definition, trigger/function writers, readers and grants. Choose one authoritative revision writer.
2. Define `document.comment_revision` in the shared canonical foundation and remove duplicate Studio-only ownership. Update all consumers and plane policies together.
3. Capture create/edit/moderate/restore atomically where those operations are enabled, with unique revision numbering and immutable prior content. History begins with comments created/seeded under the new model; no historical baseline backfill is needed.
4. Revision reads enforce current parent/comment audience and any additional history permission. Deleted/private history must not leak through convenience endpoints.
5. Keep focused tests for edit/revision/outbox atomicity, concurrent edit conflicts and retry deduplication. Seed a small realistic thread/history fixture in the fresh database.

### Reports and moderation

1. Keep `event.comment_flag` as report intake and `governance.comment_moderation` as its decision record; current services already use this relationship.
2. Find and update remaining `document.comment_moderation_flag` readers, writers, registrations and tests to the canonical services. Remove obsolete source DDL, constraints, grants and seeds after those references are gone.
3. Seed a report and a moderation decision directly in the new model. Verify authorized reporting/review and rejection of unauthorized actions.
4. Skip old-row conversion, ID mapping, status translation, dual writes and staged table retirement. Removing a definition from source does not authorize dropping the table in the user's current database.

### Fresh local database check

Use an explicitly named disposable database/instance with isolated test object and job namespaces. Apply the normal fresh-install DDL/manifests and seeds; check representative comment/file queries using application roles through the normal pools. Build the plane schemas through the existing local setup path, avoiding three duplicate full browser suites. Keep the existing local database untouched unless a reset is explicitly authorized. If particular old local records later need preservation, handle that as a separate targeted export/import request.

## 7. Work breakdown and dependencies

All work packages below are planned. Apply the single completion rule in section 1 and the lightweight checks in section 8. Preserve comprehensive implementation tasks; do not scaffold unused modules or add completion paperwork.

| Work package                           | Depends on                        | Owner area                                        | Local completion check                                                   |
| -------------------------------------- | --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| CA-00 Baseline and mapping             | Accepted design                   | DB, metadata, service and runtime owners          | Short source/consumer change map and fixture selection                   |
| CA-01 Typed definitions and compiler   | CA-00                             | Contracts, Studio authoring, publication          | Strict positive/negative fixtures and one compiled capability projection |
| CA-02 Direct shared schema updates     | CA-00; CA-01 decisions            | DB, collaboration, governance                     | Fresh DDL/seed installation and focused RLS/revision checks              |
| CA-03 Policy and parent admission      | CA-01; required CA-02 schema      | Collaboration, attachments, Records/authorization | Multi-actor direct-API/read/association negative tests                   |
| CA-04 Command lifecycle and recovery   | CA-03                             | Attachments, jobs, quotas                         | Focused retry, scan, pin, cleanup and recovery regressions               |
| CA-05 Resource readers and projections | CA-01–CA-04 relevant contracts    | Experience and capability services                | Scoped collections/counts/history/status with bounded pagination         |
| CA-06 Shared drawer/content shell      | CA-05                             | Shell, form-detail, communications UI             | Shared-state navigation and responsive accessibility checks              |
| CA-07 Comments experience              | CA-02–CA-06                       | Collaboration UI/service                          | Rich threads, draft restore, reactions, reports and revisions journey    |
| CA-08 Files experience                 | CA-04–CA-06                       | Attachment UI/service                             | Upload, rename, details, version, folder and unlink journeys             |
| CA-09 Preview and discovery            | CA-03–CA-05; CA-08 viewer binding | Processing/adapters/search/deployment             | Actual provider protocol, safe preview and record-scoped search          |
| CA-10 Final local acceptance           | CA-07–CA-09                       | Cross-entity/runtime/service owners               | One BP journey, small second-entity check and short completion note      |

### Source ownership and expected edits

These are the existing integration boundaries to inspect/extend, not instructions to scaffold every possible file. Domain providers retain business-parent admission; generic components never branch on Business Partner identity.

| Repository area                                                                                                                                   | Expected responsibility                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `server/packages/contracts/publication/src/`                                                                                                      | Typed artifacts, schema versions and admissible normative properties                 |
| `server/packages/contracts/collaboration/src/`, `server/packages/contracts/attachments/src/`                                                      | Service command/read contracts, revisions, audience and processing projections       |
| `packages/contracts/platform/entity-runtime/src/`                                                                                                 | Safe browser capability and surface wire contracts                                   |
| `server/packages/planes/studio/meta-entity-authoring/src/`                                                                                        | Authoring validation and mapping to the controlled capability/policy definitions     |
| `server/packages/services/publication/src/`                                                                                                       | Compilation, dependency resolution and registered handler/permission checks          |
| `server/packages/platform/metadata/src/`, `server/packages/platform/experience/src/`                                                              | Admitted release reader, authorized projection, lazy resource planning and dispatch  |
| `server/packages/platform/collaboration/src/`                                                                                                     | Comment commands, drafts, association checks, revision capture and report intake     |
| `server/packages/services/attachments/src/`                                                                                                       | Parent-bound lifecycle, quota, versions, download/unlink and recovery                |
| `server/packages/platform/governance/src/`                                                                                                        | Canonical report review and moderation decisions                                     |
| `server/packages/services/document-processing/src/`, `server/packages/services/document-derivatives/src/`, `server/packages/platform/search/src/` | Bounded processing, scanned derivatives and authorized discovery                     |
| `server/packages/adapters/preview-renderer/src/`, `server/packages/adapters/rendering/src/`                                                       | Qualified provider protocol and output validation                                    |
| `server/apps/platform-host/src/composition/`                                                                                                      | Real owner-service/adapter/job registrations, replacing no-op or incompatible wiring |
| `packages/platform/communications/collaboration-ui/src/`                                                                                          | Shared components, composer, file workspace and consolidated upload adapter          |
| `packages/platform/entity/runtime/form-detail/src/`, `packages/platform/shell/shell/src/`                                                         | Published coordinate/navigation binding and surface state coordination               |
| `server/db/ddl/`, `server/db/scripts/`                                                                                                            | Direct canonical DDL/seed updates and fresh-install checks                           |
| `deploy/compose/instance/` and effective source-runtime overrides                                                                                 | Actual local provider/network readiness and compatible deployment configuration      |
| `tests/foundation/`, `tests/foundation-browser/`, service-local test suites                                                                       | Behavioral and real-boundary regression coverage                                     |

### BP workstream handoff — source and release boundary

The agreed release boundary is the [Business Partner collaboration release
candidate](business-partner-collaboration-release-candidate.md): retain the
active native intake prerequisite; include BP2-01 and CA-01–CA-08 once their
open recovery/reply work closes; defer CA-09 and BP2-02–BP2-17. It must use a
scoped compiled closure, rather than falsely publishing the broad 113-artifact
review envelope.

Comments, Attachments, Intake Form and BP Phase 2 work uses the reorganized MDG
authoring tree:

| Input | Authoritative path |
| --- | --- |
| Entity definitions | `metadata/products/mdg/entities/` |
| Review evidence | `metadata/products/mdg/review/` |
| Draft artifact schemas | `metadata/schemas/entity-artifacts-v2/` |
| Layout and validation tools | `tooling/scripts/metadata/` |

Edit those paths and coordinate overlapping BP artifact and release-envelope
changes. Do not recreate or edit `New_Entity` definitions: that directory retains
only a compatibility bridge for a hashed review envelope and has no editable entity
definitions. Runtime/UI packages, server providers and DDL retain the owners listed
above.

The source relocation is verified but remains uncommitted and unmerged. The native
intake prerequisite and additive Studio/Neon collaboration DDL have been applied in
DEV; the separate compiled collaboration package has not been signed or activated.
Source development can continue, but no workstream may infer that its compiled
metadata changes are live.

Before the scoped compiled DEVFULL release, complete the candidate's CA-04 and CA-07
work, run the [baseline-pinned 95-artifact runtime set and provider-delta report](business-partner-collaboration-release-candidate.md#scoped-compilation-and-readiness-commands), reconcile authoring-input and
compiled-output validation without adding placeholder `artifactHash` values, build a
clean committed source revision, and then sign/publish/verify matching Neon and
Studio receipts. BP2 source work may proceed in parallel from BP2-02, but it is not
part of this candidate.

See [the metadata source guide](../../../metadata/README.md),
[the relocation record](../../../metadata/REORGANIZATION.md), and
[the DEVFULL readiness record](devfull-bp-publication-readiness.md).

### CA-00 — Baseline and replacement inventory

- [x] Snapshot current changed files and baseline version; preserve unrelated work.
- [x] Trace every existing UI, capability API, runtime dispatcher, reader, registry key, permission and schema consumer.
- [x] Inspect source schema and relevant consumers, including Studio-only history/report tables; identify direct cleanup needed for a fresh installation.
- [x] Identify metadata authoring persistence and publication mapping for capabilities; decide whether an additive capability member is needed.
- [x] Identify parent record admission for Business Partner and a real second entity; do not enable writes on Currency merely to manufacture reuse.
- [x] Reproduce direct download/association restrictions, uncertain-finalize retry and current preview protocol failures using safe local fixtures.
- [x] Record the active published release and actual supported operations; proposed JSON keys remain proposed until wired.

Exit: complete — [CA-00 inventory](entity-comments-and-attachments-ca00-inventory.md) identifies the existing owners, required schema/code edits and local fixtures. No failing-gap dossier or live-data audit is required.

### CA-01 — Typed MetaEntity capability contracts

- [x] Type Core capability declarations, Operation attachment/comment bindings, policy references and safe presentation/wire projections.
- [x] Specify required/default/optional semantics, the current schema version, unknown-property rejection and dependency hashing. Update all local consumers together; no compatibility adapter for superseded development definitions.
- [x] Map Studio authoring records to one canonical policy source; add persistence only for a demonstrated gap. CA-01 proved the missing change-set member and added `metadata.entity_capability`; see the implementation note.
- [x] Extend compiler/parser and semantic validation; preserve existing artifact authority and release admission.
- [x] Compile authorized service actions and supported renderers without exposing raw handler/storage bindings to the browser.
- [x] Bind runtime operation/policy resolution for both direct service routes and generic dispatch.
- [x] Add the definition cases in section 4 and republish a locally validated fixture through the real compiler path.
- [x] Update reviewed JSON schemas, examples, hashes, dependency catalogs and permission/registry evidence together.

Exit: complete — [implementation and local acceptance](entity-comments-and-attachments-ca01-ca02-implementation.md). Malformed/inconsistent capability definitions cannot activate; a supported valid definition drives both layouts from the same contract.

### CA-02 — Schema, history and reporting

- [x] Complete section 6 source-model cleanup and select the atomic revision writer.
- [x] Add only proven missing fields: revisions/display label, association policy/category, draft upload linkage and admitted-policy evidence as needed.
- [x] Preserve immutable attachment fields; do not duplicate existing quota reservation or multipart structures.
- [x] Verify compound tenant FKs, unique pins/links, valid folder ownership/cycles and record-scoped list indexes.
- [x] Update canonical DDL, manifests, constraints, indexes, grants/RLS, DB contracts and seeds across planes directly; remove obsolete Studio definitions and their consumers.
- [x] Define a consistent revision token for new and edited comments and update all readers/writers together; never omit concurrency for the first edit.
- [x] Build a fresh disposable database with representative fixtures; run focused comment revision, report/decision and RLS checks. No backfill, historical data mapping or migration replay tests.

Exit: complete — all three disposable planes pass. Fresh schema/seed installation passes; comment edits capture history and reporting uses one canonical path through application roles.

### CA-03 — Policy and authorization admission

- [x] Create/reuse one capability owner-admission boundary resolving parent membership from verified context and published metadata.
- [x] Enforce operation permission plus parent/audience/version state for stage, finalize, association, status and download. Preview, history and unlink remain unavailable in the current published definition and fail closed before any handler can run.
- [x] Define Internal membership and Record participants/Only me projections; prohibit broader reply audience and unauthorized mentions.
- [x] Keep draft attachment visibility principal-scoped until atomic comment association; the association transaction is the only current share-to-record transition.
- [x] Apply the same rules to comment reads, reader counts/unread projections, reaction/flag targets, notification recipients and their persisted relations. No comment search, snippet or AI reader is published yet; absent capability operations fail closed.
- [x] Ensure expired/revoked policy cannot be bypassed by an old browser projection or direct API caller.
- [x] Cover cross-tenant/plane, denied parent, same-tenant unauthorized attachment, private thread and revoked collaborator in a compact parameterized service regression suite; check representative real RLS/pool denial in the fresh database.

Exit: complete — published capability admission governs generic dispatch and direct comments/attachments routes. Private comment IDs, revisions, mention rows and reaction rows are hidden by RLS; unadmitted operations and capability readers are unavailable rather than exposing an alternate path. The detailed implementation record is `entity-comments-and-attachments-ca03-implementation.md`.

### CA-04 — Upload, version and maintenance commands

- [x] Consolidate browser upload adapters while retaining the existing stage → PUT → finalize protocol and CSRF/BFF boundary.
- [x] Stable attachment ID across retries; after lost finalize response query outcome before attempting to stage/PUT again.
- [x] Preserve unique immutable candidate copy, bounded hash/scan verification, exact byte-size checks and fail-closed scanner behavior.
- [x] Capture admitted policy/release and verify current mandatory constraints at finalization.
- [x] Commit clean association, quota and durable processing intent consistently; do not silently lose jobs if queue publication fails.
- [x] Version promotion uses expected parent version/current attachment evidence; comments already pin the selected clean version and same-name uploads create a new immutable storage key.
- [x] Implement unlink separately from lifecycle delete/purge; evaluate references, expiry, retention and legal holds.
- [x] Wire actual reservation/orphan/purge/reconciliation schedules, bounded batches, retries and operator-visible failure states.
- [x] Handle cancel/disconnect, stage expiry, late processing, queue replay, concurrent finalization/version updates and policy changes during transfer. Finalization receives the HTTP disconnect signal and releases the storage stream; retries retain the original staged reservation without resolving a changed staging policy; the finalization command resolves current mandatory policy before commit. Delayed expiry changes state conditionally, so a concurrent finalization emits no false expiry event or quota release; replayed expiry work has one terminal transition. Candidate-copy scanning, deleted-during-scan, concurrent-finalizer and expected-series/current-version checks prevent late work from overwriting or resurrecting content.

Unlink is a published `attachments.unlink` action. It resolves current entity admission and the unlink permission, deletes only the matching `document.attachment_link`, and emits `attachments.unlinked` in the owning transaction. If that was the final active series association, the attachment becomes `orphaned`, emits `attachments.orphaned`, and schedules `attachment:<id>:purge`. Neither command deletes object storage directly.

The plane scheduler runs `attachments.reconcile-retention` every five minutes. It claims at most 100 overdue `expired`, `deleted`, or `orphaned` attachment records with `FOR UPDATE SKIP LOCKED`, excludes active legal holds, and enqueues the deterministic purge identity for each. Every purge reloads the tenant-scoped record and rechecks active links, attachment/series retention, and legal holds before deleting bytes and recording `attachments.purged`.

Exit: one upload/command identity produces one admitted outcome and recoverable work; stale retries cannot overwrite or resurrect content.

Verification (2026-09-21): `@athyper/server-service-attachments` typecheck and 55 focused tests pass, including real HTTP disconnect cancellation, scan timeout/failure, late deletion, concurrent finalization, policy-stable staging retry, finalization-versus-expiry race and replayed expiry work. `@athyper/server-platform-host` typecheck passes.

### CA-05 — Shared readers, revisions and transport

- [x] Reuse `/api/platform/entity-runtime/v2` section resources for entity record lists; capability APIs remain owners of file/comment operations.
- [x] Map required reads through the registered `platform.comments.v1` and `platform.attachments.v1` services. The earlier `/api/entities/...` examples remain logical sketches, not a second entity API family.
- [x] Project link, series, selected/pinned version, permitted author display name, processing status, item revision and authorized actions. Storage keys, policy bindings and signed URLs are never projected.
- [x] Use bounded cursor pagination with `(created_at,id)` ties and admission before each query. The published reader supports its fixed newest-first scope; no unadmitted sort, filter or text-search input reaches SQL.
- [x] Page roots by default and direct replies with a validated `threadRootId`; project caller-only typed draft restore, comment revisions, total count and passive unread count. Reads never advance the feed cursor.
- [x] Apply series predicates and pin-aware version resolution with `DISTINCT ON (series_id)` before global ordering, so multiple matching associations cannot produce duplicate files.
- [x] Scope the browser cache by tenant, principal, authorization epoch, release, record, context and section query. Paginated merges deduplicate child identities and cache the returned child revision; command callbacks invalidate the affected section.
- [x] Keep reads lazy and side-effect free. There is no background reader polling; later upload/derivative polling must be visible-only, abortable and back off through the existing upload client.
- [x] Keep signed URLs out of metadata and cache projections; the already-authorized download action issues a short-lived URL with safe headers.

Exit: drawer/content render the same authorized data, pagination and actions through one reader contract.

### CA-06 — Shared surface and state coordination

- [x] Add `EntityCollaborationSurface`, bound only to the published `comments`/`attachments` section keys from the shared entity runtime workspace. The record page keeps its main header, landmark and primary scroll owner.
- [x] Use a docked desktop surface with an independent secondary scroll region. At 48rem and below, switch to the framework Drawer’s full-screen modal with safe sizing.
- [x] Suspend Summary View while collaboration is open and restore it on close. Opening the surface emits a shell coordination event that closes the activity/inbox surface before a second side panel can stack.
- [x] Keep the selected collaboration section in the owning record state and leave the underlying runtime workspace mounted, so its section cache, active tab, draft/upload component state and record scroll position survive open/close. A record or authorization/context change aborts the old requests and starts a fresh workspace generation.
- [x] Support validated `panel=collaboration` and `collaborationSection` URL state with `popstate`, including Back/Forward. Existing `file` and `thread` query values are preserved by panel navigation and are reserved for the CA-07/CA-08 selected-resource renderers.
- [x] Prevent cross-record response contamination through the runtime workspace’s `AbortController` and generation guard; it resets section state before fetching a new record/context.
- [x] Restore the opener focus on close. The phone surface uses the framework’s modal focus trap, Escape and labelled close control; wide mode is non-modal, and both modes retain live status messages from the shared section content.

Exit: desktop/phone and keyboard journeys preserve business context; navigation does not create a comment or upload.

### CA-07 — Comments experience

- [x] Bind existing rich JSON composer to parent-aware draft upload policy and typed server-safe content contract. Draft save returns its owner-scoped ID and pasted attachment staging carries that ID.
- [x] Add formatting controls, safe links, admitted audiences, attachment chips and preserved drafts.
- [x] Add a bounded participant-scoped mention picker backed by fresh principal/plane permissions and owning-record admission. Revalidate selected IDs on submission; private mentions are self-only.
- [x] Reconcile attachment-only comment behavior with nonblank text constraints and accessible text projection.
- [x] Render author/time/audience, rich content, pinned file chips, reactions and safe tombstones. Root comments retain their own cursor page; expanding a root loads an independently authorized, cursor-paginated direct-reply group only on demand, and collapse preserves the loaded group without hidden polling.
- [x] Submit with stable idempotency, enforce ready attachments; failed command retains draft and selection.
- [x] Inline rich revision edits retain unsaved content after conflicts. Separately load authorized, cursor-paginated immutable history; explicitly adopt the reviewed revision before retrying. History currently follows author-only RLS.
- [x] Project caller-reported flag status and governance decision codes from the canonical report/decision tables. Exclude reviewer notes/evidence; moderator writes remain governance actions.
- [x] Persist published draft retention (30-day default; 1–365-day bounds), refresh expiry on save, and expire cancelled drafts. Five-minute plane reconciliation locks at most 100 expired drafts with `FOR UPDATE SKIP LOCKED`, detaches obsolete draft references, preserves shared attachments, and writes orphan outbox intent atomically. Only attachment maintenance may delete bytes after reference/retention/hold checks.

Verification (2026-09-21): 52 collaboration tests, 15 participant/admission tests and 35 publication-contract tests pass. Fresh Neon source provisioning and application-role revision/report/RLS fixtures pass. A separate PostgreSQL fixture exercises save-versus-expiry locking, renewal, cancellation, shared links, retained/legal-held attachments and replay. The metadata validator accepts 113 authoring artifacts. Source now enables mention/history handlers; no DEVFULL DDL or release activation was performed. See [CA-07 implementation evidence](entity-comments-and-attachments-ca07-implementation.md).

Exit: recording-inspired rich comment/reply/reaction/edit/report journey works with multiple actors and restrictive audiences.

### CA-08 — Files experience and management

- [x] Shared compact rows and an expanded selection/filter workspace expose policy-derived available actions.
- [x] Multiple-file browse/drop, focus-scoped paste and real transfer progress are implemented.
- [x] Bind scan/extraction state to each admitted file through an admitted status route. The rendered collection polls only its own visible pending rows with cancellation and bounded backoff; preview remains unavailable pending CA-09 provider qualification.
- [x] Pending upload queue is owner-only in the server reader; collaborators receive only active, scanned current/pinned versions.
- [x] Inline display-name rename uses an admitted series-revision command; download, deep-link copy and per-item errors/retries are present. Richer details remain with version/folder work.
- [x] Explicit version staging requires the current series version and a `new_version` duplicate-name decision. The upload surface offers that choice for matching names, and selected files have direct version-upload and authorized version-history controls.
- [x] Enable categories/folders through typed admitted handlers. Folder projections, create/move/delete controls and category/folder filters are record-scoped; database owner/cycle guards remain authoritative and nonempty folders are rejected.
- [x] Remove-from-record confirmation names the affected link. Privileged archive performs an admitted no-store preflight that shows active reference count and legal-hold outcome before confirmation; archive schedules maintenance-only physical purge.
- [x] Per-item batch failures retain their upload identity and expose independent retry. Empty/error/pending status is announced and stale selection is cleared after refresh.

Exit: browse/upload/retry/filter/rename/version/folder/unlink journeys work without broadening visibility or deleting unrelated evidence.

### CA-09 — Qualified preview, extraction and search

Local implementation and provider/database qualification completed on 2026-09-22.
See [the CA-09 evidence and acceptance boundary](entity-comments-and-attachments-ca09-qualification.md).
The internal Pillow/PDFium sidecar implements the derivative protocol. Restricted
Gotenberg HTML-to-PDF remains separate; Office/encrypted preview is unsupported.

- [x] Recheck actual images, effective networks and provider routes; Gotenberg is not a `/render` implementation.
- [x] Select and qualify a compatible internal derivative protocol implementation with real PNG/PDF conversions.
- [x] Implement image/PDF viewing and first-page thumbnails, with truthful unsupported/failure states.
- [x] Scan derivative output and bind source hash/specification; unscanned or stale output is not delivered.
- [x] Authorize expiring byte-range delivery, safe type/disposition, origin isolation, URL renewal and viewer close cleanup.
- [x] Decouple durable extraction from search availability; enforce OCR/page/input/output limits and bounded per-worker tenant admission.
- [x] Search exact record scope with authorized snippets and bounded pagination; remove index entries and guard late jobs after unlink/delete.
- [x] Verify real small-file preview, scanning, extraction, OCR, delivery and database search; inspect memory/restarts without load benchmarks.

Signed-in browser acceptance and governed activation of the updated source
capability definition remain in CA-10. Local build/service qualification does not
require a user session. Existing leases may remain usable for their 120-second
lifetime; new access is denied after unlink or loss of authorization.

### CA-10 — One final local acceptance pass

- [ ] Run the single integrated BP journey in section 8 using published capability definitions and real local dependencies.
- [ ] Activate an appropriate second entity through metadata only; identify any domain admission provider explicitly. No new generic-layout branch by entity name.
- [ ] Verify shared schema/contract setup for Neon, Mesh and Studio and representative cross-plane denial. Run the full browser journey in Neon; use a small second-entity reuse check rather than duplicate browser suites for every plane.
- [ ] Where already configured, verify mentions/inbox delivery with current access checks; keep outbound provider activation and AI extensions optional.
- [ ] Remove superseded UI/upload wrappers only after callers, exports, route aliases and registry bindings are accounted for.
- [ ] Reconcile schema/examples, API operation matrix, capability readiness and documentation; mark partial/deferred operations precisely.
- [ ] Record the affected typechecks/regression results, final local journey result and remaining limitations in a short completion note.
- [ ] Update parent Phase 7 acceptance and this workstream independently; do not retroactively label all old implementation complete as new capability complete.

Exit: the focused checks and one final local acceptance pass succeed; enabled required functionality works and optional integrations are explicitly deferred.

## 8. Focused regression tests and one final local acceptance pass

### Test selection rules

Reuse existing service/compiler tests and local fixtures. Add tests for changed rules, meaningful failure paths and previously uncovered authorization/lifecycle risks; do not add a new suite for every checkbox, table field or UI label. Group related cases in existing suites. Run affected package typechecks and the relevant test files after a work package. Rerun dependent checks only when shared contracts change or a failure warrants it.

No full-repository suite after every package, staged migration rehearsals, dual-version compatibility tests, production load certification, exhaustive format corpus or separate evidence bundle is required. Existing unrelated failures should be noted accurately; newly introduced failures must be fixed. A failed core authorization or scan check cannot be waived because this is local.

### Small checks by work package

| Package | Sufficient focused check                                                                                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-00   | Source/consumer map reviewed against current paths and a viable fixture identified; no new test suite                                                                                    |
| CA-01   | A valid definition compiles; parameterized invalid-property/policy/handler/audience cases reject; affected contract/compiler typechecks                                                  |
| CA-02   | Fresh DDL/manifests/seeds install; representative comment/file queries with application roles; revision atomicity and canonical report/decision check                                    |
| CA-03   | Allowed collaborator plus denied parent/tenant/plane/private-audience cases; association/download/count paths covered at their shared admission boundary; representative real RLS denial |
| CA-04   | Successful finalization, lost-response retry, blocked/unavailable scan, concurrent version promotion, pinned evidence and protected unlink/purge; use service fixtures for failures      |
| CA-05   | Owner-scoped pagination/status/counts, pin-aware selection and no hidden/read-triggered mutation; affected reader tests                                                                  |
| CA-06   | One focused component/browser check for shared state, Summary restoration and record switch; keyboard/phone spot-check                                                                   |
| CA-07   | Rich comment/reply/edit conflict, draft retention, restricted file association and report action using existing service/UI tests                                                         |
| CA-08   | Upload/retry/filter/rename/version/folder/unlink behavior in focused component/service tests; no repeated full browser journey                                                           |
| CA-09   | Real clean image/PDF preview and extracted-text search using the local provider; adapter/service tests for failure, unsupported media and late jobs                                      |
| CA-10   | Run the integrated journey below once; briefly confirm reuse on a second entity and report actual results                                                                                |

These rows are a compact coverage guide, not independent certification gates. A shared regression can satisfy multiple rows. Keep deterministic service tests for races and policy changes during upload; do not reproduce every failure manually in Docker. Use real PostgreSQL/RLS for DB semantics and actual local storage/scanner/provider requests for the successful integrated path so protocol mismatch cannot hide behind test doubles.

### Final local journey

Prepare one seeded Business Partner, an appropriate second entity, an authorized collaborator and a denied principal, plus small synthetic image/PDF files with searchable text. Use the fresh schema and test storage/queue namespaces.

1. Publish the current typed entity definitions, open the record and verify Comments/Files actions reflect the authorized metadata. Hidden panels make no collaboration query.
2. Open the drawer, switch to content view and back, toggle Summary View, then navigate away/back. Preserve filters/draft/selection and prevent old-record data appearing on another record. Spot-check keyboard focus and phone width in the same journey.
3. Upload the sample files, observe transfer/check/ready states, download and preview admitted content, search extracted text, then rename, categorize/move to a folder and upload a new version. Exercise one uncertain-response retry through the automated fixture if not already covered in CA-04; do not duplicate the failure manually.
4. Create a formatted comment with a pinned file, reply/react, reopen a saved draft and edit the comment. Check revision history and the report/moderation path with an authorized reviewer. A later file version must not change the old comment's evidence.
5. Use the denied principal to attempt the record/file access and verify restricted comments/files are absent from lists/counts and blocked by direct access. Use existing focused regressions for the remaining cross-tenant/plane and audience cases.
6. Unlink a file from the record without deleting a separately referenced version; confirm refresh creates no duplicate comment/reservation. Confirm the focused scan-denial, concurrency and hold tests passed; no need for a second manual fault campaign.
7. Open the second entity with the same published service binding and perform a small comment/file read-or-write check appropriate to its permissions. No new entity-specific generic UI code should be needed.
8. Record the result and any known optional limitation. If a required step fails, fix it and rerun the affected step plus related regressions; repeat the full pass only if the fix changes shared behavior broadly.

Actual enabled functionality must work: missing clean-file preview/search, broken revision capture or a failed required operation cannot be relabeled optional to close the plan. Office conversion, multipart upload, AI and new outbound notification providers remain explicitly deferred unless separately enabled in scope.

### Existing check commands

Choose only commands relevant to the changed packages, narrowing to individual test files using their runner configuration where useful. This is a menu for future implementation, not a mandatory command list after every edit:

```sh
pnpm --filter @athyper/server-contract-publication test
pnpm --filter @athyper/server-service-attachments test
pnpm --filter @athyper/server-service-attachments typecheck
pnpm --filter @athyper/server-platform-collaboration test
pnpm --filter @athyper/server-platform-collaboration typecheck
pnpm --filter @athyper/platform-communications-collaboration-ui typecheck
node server/db/scripts/checks/ddl/sync-document-foundation.mjs
```

The canonical-foundation command checks source ownership/duplication; it does not build a database or verify RLS. Use the existing fresh-install/seed scripts for CA-02 and current compiler/governance/derivative/browser test commands only where affected.

### Minimal completion note and local diagnostics

Record: **Changed** (short summary), **Checked** (actual commands/results and local journey outcome), **Remaining** (limitations or none). No migration row-count reports, screenshots for every step, per-actor evidence bundles or production readiness sign-off. Keep credentials, signed object URLs and private content out of notes.

Use existing logs/status responses to identify upload, scan, job and preview failures. Preserve bounded processing, retries and cleanup behavior in code. New dashboards, capacity studies, SLO/p95 sign-off and broad observability deployment are not local exit requirements. Investigate a visible hang, unbounded retry or memory failure when observed. The historical service review remains useful context in the [design's Docker review](entity-comments-and-attachments-design.md#8-docker-application-review-and-effective-use).

## 9. Local build sequence and definition of done

Local sequence: update source contracts/code/DDL/seeds together → run affected typechecks/tests → build a fresh disposable database → rebuild/restart affected local runtime services pointed at that database and isolated test storage/queues → publish the current local definitions → run one final local acceptance pass. Publish only after required schema and service handlers are available. Refresh the disposable database when DDL changes; do not run source edits against a stale schema and mistake the result for a clean build.

The current local database remains untouched unless its reset is explicitly authorized. There is no staged data conversion, dual-version deployment, canary cohort or rollback rehearsal. Fix local code/schema and rebuild/reseed the disposable setup when necessary. Application recovery rules still apply to content created under the new model: disabling a UI capability does not delete data, background work cannot resurrect deleted content, and retention/holds remain enforced. Signed URLs retain their bounded TTL semantics.

Definition of done:

- [ ] Accepted behavior is controlled by a validated published definition and enforced through shared services.
- [ ] Canonical DDL, seeds, shared history and canonical moderation model build successfully in a fresh local database; obsolete source definitions/consumers are removed.
- [ ] Drawer/content share state; comments/files work through real dependencies with authorized alternate actors.
- [ ] Affected typechecks and focused regressions pass, and one final local acceptance pass succeeds; optional limitations are accurately recorded.
- [ ] No alternate generic CRUD, direct route or search/notification path bypasses admission.
- [ ] Parent plan, design, examples, schemas and this completion record agree.

### Completion record

| Work package | Status   | Checks / remaining work                                                                                                         |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| CA-00        | Complete | [Baseline inventory](entity-comments-and-attachments-ca00-inventory.md); focused service/client checks pass; CA-03–CA-10 remain |
| CA-01        | Complete | Typed contracts, authoring persistence, runtime policy binding and verified local publication pass                                                                                       |
| CA-02        | Complete | Shared revision/schema cleanup and all three fresh-install/application-role checks pass                                                                      |
| CA-03        | Complete | Published parent/audience admission and direct-route checks are implemented; 25 focused capability/section tests and the fresh Neon application-role revision/private-audience fixture passed again on 2026-09-23. Broader signed-in acceptance remains CA-10. |
| CA-04        | Complete | Stable stage/finalize/version/purge lifecycle with deterministic maintenance jobs; focused recovery/race suite and host typecheck pass |
| CA-05        | Complete | Generic runtime reader now provides admitted root/reply pages, draft/count/unread projections, pin-aware attachment rows and revision-aware client caching; focused reader tests pass |
| CA-06        | Complete | Shared dock/modal surface, URL/history coordination, Summary restoration and shell-side-surface coordination are wired; focused typechecks pass |
| CA-07        | In progress | Participant mentions, grouped reply paging, rich revision conflict/history UI, reporter-only moderation feedback and reference-safe draft cleanup are implemented and locally tested. The self-only principal RLS discovery defect is fixed; live CATL admin → owner mention admission, rich comment creation, notification inbox delivery and cleanup now pass. Remaining integrated browser/acceptance checks are retained in CA-10. |
| CA-08        | Complete | Shared file workspace, owner-only pending/status polling, revision-safe rename, version staging/history, category/folder management, unlink/archive outcomes and batch recovery are wired |
| CA-09        | Complete | [Local qualification](entity-comments-and-attachments-ca09-qualification.md): real preview/OCR/ranges and record-scoped database checks pass; signed-in UI acceptance and governed activation carry to CA-10 |
| CA-10        | In progress | [Prior release-13 acceptance](entity-comments-and-attachments-ca10-local-acceptance.md) remains historical evidence; signed release 16 is active. [2026-09-23 checks](neon-business-partner-ddl-review/bp2-integration-20260923.md) pass BP multi-actor public/private isolation, private-history denial, cross-tenant denial, cross-actor mention inbox delivery and cleanup. Workforce comment-create/delete also passes. New bounded participant-directory SQL passes application-role isolation checks on all three DEV planes and disposable Neon. Refreshed signed-in Studio denies the NEON-only BP comments resource (404). Earlier signed-in Mesh denial (404) remains historical evidence; its current saved session is anonymous. Full browser/cross-plane CA-07/CA-10 closure is not claimed. |

### Documentation validation

CA-05 and CA-06 are implemented locally. Validate Markdown formatting, local links/anchors, referenced source paths and consistency of accepted/planned/deferred labels alongside the focused reader tests and affected package typechecks recorded above.

Revision 3 supersedes revision 2's migration/reconciliation procedures, V01–V14 evidence gates and production-style operational acceptance. The complete implementation scope and strict metadata/authorization requirements remain. No database reset, schema change, application implementation or Docker restart is performed by this documentation revision.
