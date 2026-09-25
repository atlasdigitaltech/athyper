# BP2-00 — Complete graph reconciliation

**Latest integration, 2026-09-23:** Signed release 16 is active (101 artifacts), retaining C01/C02's release-14 corrections. Fresh read-only reconciliation reports 249 manifest entries, zero source mismatches and Core binding gaps, with seven draft/active differences. The initial BF-04 supplier draft has now completed independent approval and governed materialization. The current request Core uses `document.entity_case`, and the actual publisher supplies the target catalog before signing. [Changes, checks and remaining acceptance](../bp2-integration-20260923.md). The detailed findings below retain the original reconciliation context; current activation and binding counts are in the regenerated ledgers and `active-reconciliation.json`.

Implementation record: 2026-09-21 local date. Scope: reconciliation, typed admission checks and corrective ownership. No new business entity, DDL reset, data mutation or metadata activation was performed. Existing foundation/Comments/Attachments work remains independently owned.

## Result

The inventory covers **592 unique reviewed table declarations**, including **288 Shared/Master/Control tables** and **all 43 user-listed tables**. Final declaration order contains **11 retired request tables**. All 43 have an explicit exposure, owning domain, planned consumer/exclusion and current source evidence. This is not a claim that every table needs a Core or that every declared operation is implemented.

The running local `athyper_neon` activation head was inspected read-only, rather than inferring activation from draft JSON. At the latest capture it contains source release **13** with **95 artifacts**, while authoring contains **113 artifacts**. The draft has **40 Core artifacts** and the active release has **24**. Field bindings resolve in the local catalog except for the six fields in the retired request Core; its draft and active copies are both flagged. Valid bindings alone do not establish complete relationships, command admission or UI behavior: each Core has specific remaining domain work in its ledger.

The exact activation coordinates, hash and capture timestamp are in [active-reconciliation.json](active-reconciliation.json). This is a database activation snapshot; it does not claim a new browser journey, signature verification or publication test of that persisted release.

## Reproducible evidence

| File | Purpose |
|---|---|
| [Table → surface map](table-surface-map.csv) | Every table, exposure type, owning domain, consuming package, exclusion reason, final DDL position, local catalog presence, draft/active artifacts and source consumer references |
| [Core completeness](core-completeness.csv) | Core presence versus field-binding validity and remaining domain completeness work |
| [Field naming ledger](field-naming-ledger.csv) | Exact artifact/entity field keys, label keys, source objects, columns and types for draft and active artifacts |
| [Presentation naming ledger](presentation-naming-ledger.csv) | Section Core references, renderer/provider keys, field/child bindings and actual server/browser parser ownership |
| [Handler ledger](handler-ledger.csv) | Declared references, actual generic section/domain registrations, shared capability branches and specialization rationale |
| [Operation availability](operation-availability.csv) | Declared operation, actual local permission and generic command registration; unsupported dispatch distinguished from a missing presentation |
| [Final DDL events](final-ddl-events.csv) | CREATE/DROP events in Neon manifest order; later DROP takes precedence |
| [Source mismatches](source-mismatches.csv) | Invalid source bindings and corrective owner |
| [Draft/active differences](artifact-drift.csv) | Artifact content comparison excluding generated hash and review/published status |
| [Corrective work](corrective-work.csv) | Concrete follow-up, owning package and local completion check |
| [Retired requests](retired-request-map.csv) | All 11 retired declarations mapped to current case/snapshot authority |

Regenerate the evidence from the repository root:

```sh
python3 tooling/scripts/verification/reconcile-business-partner-graph.py --database-container athyper-dev-db-1
```

The script uses read-only SQL transactions, emits metadata rather than business rows and never prints connection secrets. Its source SQL scanner is a declaration inventory, not a complete PostgreSQL parser. Local catalog observations are separate. Static TypeScript references are **candidate consumer/provider evidence**, not proof that the code is reachable or that a principal is authorized. Domain ownership for adjacent tables is an allocation based on schema and domain naming; confirm a concrete consumer before expanding those domains.

The generator asserts unique table coverage, exact agreement with the original reviewed CREATE inventory and the 43-table user list. If canonical DDL adds tables, reconcile the allocation inventory before regenerating. Draft/active drift is expected while foundation work progresses; it is never resolved by mutating an immutable release.

## Findings and disposition

### Request identity survives; obsolete storage does not

`business_partner_request` remains the logical request entity. The registered submit/materialize commands and request service use `KyselyBusinessPartnerCaseRepository`, backed by `document.entity_case`, command evidence/validation/materialization and `snapshot.entity_snapshot`/identity. They do not need the retired tables recreated.

The original reconciliation found active and draft `business_partner_request/core` declaring `document.business_partner_request`. **Resolved in release 14:** the Core now declares a case-backed handler projection, the unused baseline display field is removed, and the amendment command's distinct baseline contract is retained. The mapping below records the original decision inputs; C01/C02's current disposition is in `corrective-work.csv`. Remaining BF-04 governed requester/approver/materializer acceptance is separate.

| Existing Core key | Current authority / required mapping |
|---|---|
| `id` | `entity_case.id`; request identity is the case identity |
| `request_no` | Case adapter maps `entity_case.case_code` to `requestNo` |
| `request_kind` | Adapter maps `operation_code`, including `register` → `new_partner`; preserve the typed enum/domain mapping |
| `target_business_partner_id` | Adapter maps `target_entity_id`; retain case entity-type and tenant admission |
| `base_record_version` | No direct mapping found in `mapCase`; define the real target-baseline/snapshot contract or remove this unused projection field after checking consumers. Do not substitute case `row_version` |
| `status` | `mapStatus` derives request state from case status and validation/decision history; not a raw column alias |

Extension rows now belong to typed `relationshipProposals` inside the case snapshot. The retired-table mapping names the specific proposal collection and evidence authority. Request numbers, case versions, target record versions and snapshot versions must remain distinct.

### Internal employees and supplier workforce stay separate

The existing logical `workforce` Core binds `master.employee`; its read permission is `neon.workforce.read`. It is an internal-workforce artifact, not a supplier-owned external-worker entity. Do not repoint it to `master.external_worker` or reuse its permission as blanket supplier workforce access.

The external path is supplier → `document.worker_engagement` → `master.external_worker` → `master.person`, with company/contract/rate/placement/compliance context. `external_worker` has no supplier foreign key. Its visibility comes from authorized engagements, not permanent ownership of a person by one supplier. `person_sensitive_profile` stays restricted.

BP2-11–BP2-13 define external rates, workers and engagements as separate contracts. Reuse existing `worker-engagement-lifecycle-service.ts`, IAM service and finance external-workforce services where applicable. Their current command permissions (including `neon.workforce.request.apply`) require domain admission; permission-name similarity is not proof of equivalent scope. New read permission/entity bindings must be reconciled to actual authz registration before publication.

`neon.bp.section.workforce.v1` is declared in examples but absent from the current generic section map. Do not activate a menu destination on the assumption that the existing employee Core provides the external engagement reader.

### Registered handlers have a bounded domain purpose

There are **15 literal BP section registrations** and **6 literal governed domain-command registrations** in `register-services.ts`. Shared Comments/Attachments dispatch is separately identified and remains CA-owned. Other declared handler names are not counted as executable generic registrations merely because the review registry contains them. Some may have domain-specific routes; the operation ledger does not label those services universally unsupported.

The section handlers use the existing `businessPartner360.section` service for one named section, with the overview using its dedicated method. Inspection of the service confirms section-specific repository paths: common sections, role/company sections, commercial controls, explainability, network and business activity. No whole-record aggregator was introduced or renamed as a generic provider.

| Specialized family | Why an unrestricted declarative read is insufficient |
|---|---|
| Identity / overview | Category-aware field protection, current record revision and authorized summary |
| Address / contact / identifier collections | Owner admission, effective/primary relationships, channel handling and protected identifiers |
| Role/company sections | Organization capability, company scope, assignment and per-row admission |
| Banking / credit / qualification | Masking, verification, accepted disclosure, scoped business decisions and eligibility |
| Requests / activity | Case/snapshot/status projection, history visibility and immutable evidence |
| Business activity / network | Scoped documents, accepted provenance and restricted integration payloads |
| Governed commands | Domain validation, target/context recheck, concurrency, idempotency and evidence |
| Comments / attachments | Shared parent/audience authorization and content lifecycle |

For ordinary dictionaries and simple admitted child collections, prefer validated declarative reads in the owning BP2 package. Unregistered example relation/timeline/channel handlers are a reconciliation backlog, not a requirement to implement one custom handler per name. Remove redundant declarations or register a bounded provider only where a domain rule justifies it.

### Metadata gaps versus unsupported operations

The operation ledger contains **55 draft declarations** and **51 active declarations**. Of the active declarations, 23 reference one of the six registered domain command keys and 28 do not have generic domain-command registration. Registration and permission existence still do not prove that a particular record/context is eligible.

Use these distinct states:

- Existing service and registered runtime operation, but no presentation: metadata/UI wiring work.
- Existing domain-specific route, but no generic operation adapter: explicit adapter/integration work; do not infer generic availability.
- Example-only handler or unsupported business transition: unavailable until domain implementation and checks exist.
- Implemented command denied for this principal/context: authorization/context state, not missing implementation.

The page planner already suppresses operations whose `permissionStatus` is not verified, and the command dispatcher denies missing permissions and missing handlers. A Core field or visible entity never creates generic write authority. Keep unsupported operations out of advertised executable actions. If a future package adds a surface action, it must prove the actual handler/destination, not just add a registry string. C06 in the corrective ledger covers dispatch-backed action admission where that projection is expanded; existing generic dispatch does not itself prove every UI action is usable.

## Naming and contract rules

The table map, field ledger and handler ledger form one reconciliation index. Canonical SQL remains snake_case schema/object/column naming; logical entity keys may differ where the service owns a projection. The browser consumes admitted field keys and typed service data, not raw SQL identifiers or arbitrary envelope properties.

- Core `field.key` is the binding authority for presentation `fieldKey`; use `coreRef` and the same key, not a display label or lowercased section title.
- `dataBinding.handlerKey` selects a section service; extra relation/timeline handler declarations do not automatically register themselves.
- The generic section renderer/parser must consume the declared collection/record shape. Do not expose `schemaVersion`, `definitionHash` or other technical envelopes as fallback business fields. C07 records the activity projection correction.
- `country.code`/`currency.code`/language codes and UUID references are different identities. State selection uses country + state code; banking uses institution + branch where required. Actual source constraints remain authoritative.
- A review registry is authoring evidence; executable composition and locally published permissions are separate evidence. Thirty-two existing seeded operation permission references were missing from the review registry and have been added with DDL provenance. No permissions or grants were created.

## Typed checks implemented

`CompiledEntityRegistry` now accepts an authoritative `sourceObjects` set. When provided, release validation rejects unknown/retired `primaryObject`, `sourceObject` and `sourceObjects` references, including array-only dependencies. Use a final catalog, not a union of historical CREATE statements. Generic operation `permissionCode` references are now checked against the supplied permission registry, alongside existing handler checks.

Source-catalog validation is opt-in for callers supplying the catalog; this change does not claim that every existing publisher already supplies it. C02 tracks wiring it into the owning publication path with the corrected request projection, so foundation publication is not silently coupled to a half-migrated request Core. The audit independently exposes the currently invalid active binding. Existing immutable releases were not rewritten.

Regression tests prove:

1. The logical request identity can retain current case/snapshot sources.
2. Retired request storage and retired array-only source dependencies are rejected against the final catalog.
3. Missing required handler or permission registration prevents compilation.
4. Read permission/record visibility does not authorize a declared write; its handler is never called.
5. A declared but missing operation handler remains unavailable.

## Local verification and completion

- Publication contracts: **31 tests passed**, source and test typechecks passed.
- Publication service: **189 tests passed**, including BP2 source-admission checks; source typecheck passed.
- Operation admission/dispatcher: **5 tests passed**; experience source typecheck passed.
- Read-only inventory completed against local activation and schema catalogs; table and user-list coverage assertions passed.
- The publication package's broader **test typecheck is not clean**: existing `business-partner-case-contract-publication.ts` imports a source outside its `rootDir`/project file list and has an implicit-any parameter; `local-definition-preview.test.ts:117` has a possibly undefined value. These files were not changed by BP2-00. This limitation is recorded rather than reporting the whole package typecheck as passing.

BP2-00 reconciliation and its targeted admission checks are complete. Known source/example/runtime gaps have concrete owners and local checks in the corrective ledger. This does **not** mark BF-04/BF-05, request projection correction, external workforce entities or Phase 2 domain packages complete. BP2-01 can proceed using the verified reference contracts; attachment-dependent and request-projection work must consume their specific owning fixes.
