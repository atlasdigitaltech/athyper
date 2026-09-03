# MESH–NEON governed entity lifecycle architecture

**Status:** Canonical target architecture and migration contract

**Date:** 2026-09-03

**Scope:** Business Partner, supplier, customer, internal employee, external workforce, Studio meta-entity authoring, Governance cycles, MESH document exchange, NEON materialization, immutable snapshots, and retirement of redundant request storage.

## 1. Executive decision

Athyper will use one shared lifecycle pattern for supplier, customer, and workforce data collection:

```text
governance.cycle_run
    = the journey and orchestration authority

governance.cycle_task
    = the required work, ordering, owner, SLA, and completion authority

document.entity_change_case
    = the proposed entity mutation and current case head

snapshot.entity_snapshot_identity + snapshot.entity_snapshot
    = immutable, contract-bound versions of submitted, decided, and materialized state

workflow
    = human approval execution and maker-checker policy

MESH document exchange
    = cross-tenant transport, selective disclosure, acknowledgement, and replay

NEON master/control/document authorities
    = approved operational state
```

There will be no new `business_partner_journey` table and no table per form section or questionnaire answer type. Existing governance cycles own journeys. A small generic entity-change case is the only new operational document header required for form-driven entity mutations.

MESH changes the source and disclosure path; it does not change the NEON authority model. The same entity contracts, validation, approval, materialization, audit, and snapshot pipeline apply to internal, MESH, portal, import, and API submissions.

## 2. Non-negotiable boundaries

1. `master.business_partner` represents an organization only.
2. Supplier and customer are roles of a Business Partner; common organization data is stored once.
3. `master.person` is People/Workforce authority and is never a Business Partner.
4. An external worker is a Person plus `master.external_worker`; the supplying organization is a separate supplier Business Partner connected by `document.worker_engagement`.
5. A MESH network account is an external identity, not a NEON Business Partner or Person identity.
6. A form is presentation over a published meta-entity contract. It never binds directly to a table column.
7. MESH envelopes are transport and evidence. They are not NEON master-data authority.
8. A JSON payload is accepted only when it is contract-pinned, size-bounded, canonically hashed, policy-validated, and written through a governed command.
9. Frequently queried or authority-bearing results remain normalized projections; historical form sections and complete aggregate versions live in snapshots.
10. Approval and materialization are separate steps. Approval alone never silently activates a supplier, customer, employment, or worker engagement.

## 3. Existing concepts reused

The target deliberately reuses the platform's current concepts:

| Existing concept | Target responsibility |
|---|---|
| `metadata.entity`, field, relation, surface, operation, flow, policy and lifecycle definitions | Semantic model and authoring |
| `metadata.entity_runtime_profile` | Virtual/facade or table-backed runtime selection |
| `runtime_meta.entity_contract` and `runtime_meta.entity_descriptor` | Immutable deployed contract and compiled runtime behavior |
| `control.cycle_type`, phases, task templates, dependencies and template revisions | Published journey templates |
| `governance.cycle_run`, tasks, dependencies, deviations and certifications | Runtime journey execution |
| `snapshot.entity_snapshot_identity` and `snapshot.entity_snapshot` | Immutable aggregate versions and hash chains |
| `mesh.document_envelope`, payload, event and acknowledgement | Cross-tenant exchange |
| `control.business_partner_mutation_evidence` and `mesh.network_command_evidence` | Plane-local command evidence conforming to one shared contract |
| `event.outbox` and `audit.audit_log` | Integration and audit effects |
| `control.business_partner_decision_scope` | Normalized decision scope |
| `control.mesh_business_partner_account_link` and `master.external_reference` | Governed MESH-to-NEON correlation |

## 4. Minimal additions

### 4.1 `document.entity_change_case`

This generic header replaces domain-specific request headers when their purpose is to collect, approve, and materialize an entity proposal.

Required coordinates:

```sql
tenant_id                  uuid
id                         uuid
cycle_run_id               uuid
cycle_task_id              uuid
entity_code                text
operation_code             text
case_kind                  text
source_channel             text
target_entity_id           uuid null
target_business_key        text null
external_subject_reference text null
scope_snapshot_id          uuid null
entity_release_id          uuid
entity_contract_hash       char(64)
form_template_release_id   uuid null
base_snapshot_id           uuid null
current_snapshot_id        uuid
submitted_snapshot_id      uuid null
decision_snapshot_id       uuid null
result_snapshot_id         uuid null
workflow_request_id        uuid null
status                     controlled domain
row_version                bigint
idempotency_key            text
created_at/by, submitted_at/by, decided_at/by
```

Constraints must enforce:

- tenant-composite FKs;
- exactly one current snapshot;
- submitted/decision/result snapshots only in compatible lifecycle states;
- immutable contract and subject coordinates after submission;
- `row_version >= 1`;
- exact replay by idempotency key plus command fingerprint;
- command-owned status mutation;
- bounded codes and no ungoverned metadata payload.

### 4.2 `governance.cycle_subject`

Cycles currently have no normalized, typed subject association. Do not hide this in `cycle_run.data`.

```sql
tenant_id
cycle_run_id
subject_role              -- primary, related, supplier, customer, person, worker
entity_code
entity_id                 -- nullable before materialization
case_id
external_reference
subject_snapshot_id
created_at/by
```

This allows a registration journey to exist before its BP or Person has been materialized.

### 4.3 `metadata.entity_surface_component_binding`

Studio surfaces currently bind fields belonging to one entity. Add a composition binding so a request form can embed a stable slice of another contract without copying its field definitions.

Example:

```text
supplier_onboarding_request.create
  embeds proposed_partner
  from business_partner.supplier_request_identity
```

The binding identifies the relation, component entity, component surface, contract slice, cardinality, position, widget, and presentation rules. It cannot redefine semantic type, validation, storage, classification, or materialization authority.

### 4.4 `snapshot.entity_snapshot_lineage`

One generic lineage mechanism replaces request materialization rows and MESH match/acceptance history.

```sql
tenant_id
id
source_snapshot_id
target_snapshot_id
lineage_role
source_envelope_id null
case_id null
source_member_type null
source_member_id null
target_entity_code null
target_entity_id null
transformation_code null
transformation_hash null
created_at/by
```

Roles include `received`, `transformed`, `proposal`, `approved`, `materialized`, `duplicate_before`, `survivor_before`, `survivor_after`, and `derived_projection`.

### 4.5 Executable authority register

Add a plane-local `governance.authority_register` projected from a reviewed contract artifact. It records aggregate kind, authoritative object, command functions, writable roles, projections, evidence ledger, event types, idempotency contract, retention and prohibited colocations. CI compares it with grants, functions and triggers and fails on drift.

### 4.6 MESH relationship capability

Add `mesh.network_relationship_capability` so profile exchange, sourcing, procurement, invoicing, payments, and services procurement can be enabled and suspended independently. Registration traffic is allowed only through the narrowly scoped `profile_exchange` onboarding state until the relationship is accepted.

No separate `mesh.potential_relationship` is required: a requested relationship episode plus a restricted onboarding capability represents invitation or self-nomination.

## 5. Contract and form architecture

### 5.1 Contract families

Publish separate but composable contracts:

```text
business_partner.master
business_partner.exchange_profile
supplier_onboarding_request
business_partner_registration
business_partner_qualification_response
supplier_preference_support
customer_onboarding_request
customer_registration
customer_credit_application
person.workforce_profile
employee_onboarding_request
external_worker_candidate_disclosure
external_worker_onboarding
```

Internal master contracts, exchange contracts, and request contracts must not be treated as the same payload. Registered, tested transformations connect them.

### 5.2 Question binding

```text
Question/presentation ID
    -> stable semantic field or relation ID
    -> published entity contract
    -> case snapshot path
    -> approved materialization adapter
    -> physical authority
```

No form definition contains `schema.table.column`. Request context fields remain request-only. Proposed master fields are marked `authority=proposal`; they cannot update master state until approved materialization.

### 5.3 Published release behavior

- Entity, surface, flow, cycle template, mapping, and policy releases are immutable.
- Every case pins the exact release IDs and hashes.
- In-flight cases do not automatically upgrade.
- Compatibility is explicit: exact, lossless transform, lossy transform requiring approval, or incompatible.
- Removed questions do not erase prior answers or approved master values.
- Missing, explicit null, clear, replace, append, revoke, and preserve-when-absent have distinct merge semantics.
- Repeatable objects use stable `$itemId` values independent of display order.

### 5.4 Progressive profiling

Before generating an external or internal form, compare the requirement policy with existing approved data, received claims, freshness and prior responses. Generate only missing, changed, expired, or confirmation-required modules.

This avoids repeatedly collecting legal name, address, contacts, tax data, certificates, and worker evidence for every process or customer scope.

## 6. Snapshot model

### 6.1 Snapshot kinds

For a case, capture meaningful versions rather than every keystroke:

| Snapshot | Meaning |
|---|---|
| Base | State against which the proposal was prepared |
| Draft checkpoint | Server-side recovery point with short retention |
| Submitted | Immutable actor assertion |
| Received | Exact MESH disclosure as received |
| Transformed | Receiver-contract interpretation |
| Decision | Approved/rejected data, policy and reasons |
| Result | Complete aggregate after materialization |

### 6.2 Canonicalization and validation

The capture function must resolve the published contract by ID and hash; callers cannot provide an arbitrary trusted hash. It must enforce payload schema, byte limit, classification ceiling, canonical key and collection ordering, previous-chain identity and actor authority.

### 6.3 Atomic mutation contract

Every accepted governed command commits or rolls back as one unit:

```text
aggregate/case state
+ immutable snapshot
+ command evidence
+ audit record
+ outbox event
+ lineage
```

Protected values are tokenized or envelope-encrypted. General BP/profile snapshots must never contain raw bank account values, national identifiers, credentials, secrets, or unrestricted workforce PII.

## 7. MESH exchange architecture

### 7.1 Document types

Register governed document types rather than adding workflow-specific tables:

```text
business_partner.registration_intent
business_partner.data_request
business_partner.data_response
business_partner.profile_publication
business_partner.profile_withdrawal
business_partner.qualification_request
business_partner.qualification_response
business_partner.preference_evidence_request
business_partner.preference_evidence_response
customer.registration_request
customer.registration_response
workforce.candidate_disclosure
workforce.compliance_request
workforce.compliance_response
workforce.engagement_offer
workforce.engagement_acceptance
```

### 7.2 Envelope requirements

Every envelope carries sender, receiver, relationship episode/capability, correlation/causation, business key, entity release ID, contract hash, field-set code, payload hash, idempotency key, fingerprint, purpose, validity, classification ceiling and signature/key identity.

### 7.3 Receiver pipeline

```text
receive -> authenticate -> authorize capability -> anti-replay
        -> verify signature/hash/contract -> persist received snapshot
        -> transform or quarantine -> validate -> match/deduplicate
        -> attach proposal snapshot to case -> acknowledge
```

Acknowledgements distinguish `received`, `signature_verified`, `contract_accepted`, `validated`, `quarantined`, `case_created`, `approved`, `materialized`, `rejected`, and `superseded`.

### 7.4 Selective disclosure

The sender derives a recipient-specific snapshot from its full profile using a governed field set, relationship, purpose, consent and classification ceiling. The disclosure gets its own hash. Withdrawal prevents future use of disclosed values according to policy but does not erase the historical fact or decision evidence.

### 7.5 Three-way merge

For updates, compare:

```text
A = last accepted MESH snapshot
B = new MESH snapshot
C = current NEON aggregate snapshot
```

- B-only change: create proposal.
- C-only change: preserve local authority.
- Equal B/C change: accept without conflict.
- Different B/C changes: explicit resolution case.
- Locally governed field: never overwrite from MESH.
- Sensitive field: require enhanced verification.

## 8. Supplier end-to-end flows

### 8.1 Scenario 1 — buyer-requested supplier

```text
BP_ONBOARDING cycle_run
  1. SUPPLIER_REQUEST task
     Internal supplier_onboarding_request case and submitted snapshot
  2. REQUEST_APPROVAL task
     Workflow approval; no BP is created yet
  3. REGISTRATION task
     Registration case derived from the approved request
  4. EXTERNAL_PARTICIPATION task
     Existing/new MESH account; requested relationship episode;
     data_request envelope; expiring invitation access where required
  5. RECEIVE_PROFILE task
     Supplier disclosure -> received/transformed proposal snapshots
  6. REGISTRATION_APPROVAL task
     Duplicate decision, validation, maker-checker and decision snapshot
  7. MATERIALIZE_BP task
     Organization BP + supplier role + approved children + account link
  8. QUALIFICATION child cycle(s)
     One scope per applicable organization/category/industry policy
  9. PREFERENCE_NOMINATION child cycle (optional)
     Supporting evidence, internal scoring and customer-owned approval
```

Registration approval creates an onboarding supplier role, not an active supplier. Activation requires a successful readiness resolver referencing qualification, blocks, required company configuration, bank verification where applicable, and effective evidence.

### 8.2 Scenario 2 — supplier self-registration

An existing MESH account submits `business_partner.registration_intent` against the customer's published onboarding endpoint. A new account must first complete network identity verification.

The receiving customer performs relationship, rate-limit, duplicate, sanctions/block, signature, contract, sponsorship and category preflight. Policy chooses reject, internal sponsor, or create registration case. After intake, the exact Scenario 1 registration, qualification and preference commands run; there is no separate self-registration persistence model.

### 8.3 Scenario 3 — internal-only supplier/customer BP

The internal user starts the same case with `source_channel=internal`; MESH coordinates are null and MESH tasks are not applicable. The same contract, snapshot, workflow and materializer apply. A MESH account can be linked later through a governed link decision without recreating the BP.

## 9. Customer end-to-end flows

Customer onboarding uses the same `BP_ONBOARDING` cycle family and generic case runtime:

```text
customer request or registration intent
 -> organization registration proposal
 -> validation and duplicate resolution
 -> registration approval
 -> materialize BP + customer role
 -> company/account setup
 -> customer credit review where required
 -> customer designation where applicable
 -> readiness-gated activation
```

`control.customer_credit_review` remains the sole credit-limit authority. Registration forms may collect requested credit information, but cannot approve a limit. `control.customer_account_designation` remains customer classification/designation authority. Customer lifecycle commands must cover the complete supported lifecycle and cite readiness evidence.

A BP may hold both supplier and customer roles. The roles share organization identity but retain independent lifecycle, company configuration, decisions, risk and readiness.

Natural-person customers are not silently reintroduced through `master.business_partner`. They require an explicit future individual-customer model and policy decision.

## 10. Workforce and Person flows

### 10.1 Internal employee

```text
WORKFORCE_ONBOARDING cycle_run
 -> workforce/employee request case
 -> Person profile and protected-profile collection
 -> HR approval
 -> materialize master.person
 -> materialize employee, employment and work_assignment
 -> payroll/statutory tasks as applicable
 -> TrustIAM access provisioning
 -> completion certification
```

This is internal/portal only. `master.person_sensitive_profile` never publishes to MESH. Access provisioning is a governed task/command whose suspension and termination updates TrustIAM authorization epoch.

### 10.2 External worker supplied through MESH

```text
workforce requisition
 -> supplier invitation/relationship services_procurement capability
 -> candidate disclosure envelope
 -> recipient-specific candidate snapshot
 -> candidate evaluation and selection
 -> contingent work order or SOW
 -> worker engagement cycle
 -> Person + external_worker materialization
 -> compliance and tenure checks
 -> placement and access provisioning
 -> active engagement
```

The Person is not a BP and the supplier's network account is not the person's identity. MESH exchanges a recipient-specific worker disclosure using pseudonymous subject and claim identifiers. Raw protected PII is retrieved through purpose-limited, short-lived authorization and stored only in the NEON protected People boundary.

### 10.3 Workforce authorities retained

The following are operational/commercial authorities, not redundant form revisions, and remain normalized:

- `master.person`, `person_sensitive_profile`, `employee`, `employment`, `work_assignment`, and `external_worker`;
- `document.workforce_requisition`, supplier invitation/response association, candidate submission/evaluation;
- contingent work order/SOW and their approved commercial revisions;
- `document.worker_engagement`, operational placement, compliance items, time/expense/invoice authorities;
- `control.mesh_workforce_claim_inbox` and processing attempts until their generic receiver replacement is certified.

`document.workforce_request` and `document.engagement_onboarding_case` are migration candidates because their collection/orchestration responsibilities converge into entity-change cases and governance cycles.

For an independent contractor/sole trader, the commercial counterparty remains an organization/sole-trader supplier representation under the organization-only BP policy, while the human performing work remains a Person/external worker connected through the engagement.

## 11. Authority matrix

| Concern | Sole authority |
|---|---|
| Journey progress | `governance.cycle_run` |
| Required activity | `governance.cycle_task` |
| Proposed entity mutation | `document.entity_change_case` current head |
| Historical state | Snapshot identity/payload and lineage |
| Human approval execution | Workflow |
| Organization identity | `master.business_partner` |
| Supplier/customer role state | `master.supplier` / `master.customer` through commands |
| Qualification | `control.business_partner_qualification` |
| Preference | `control.supplier_preference_designation` |
| Customer credit | `control.customer_credit_review` |
| Customer designation | `control.customer_account_designation` |
| Person/employee/employment | People/Workforce master objects |
| External engagement | `document.worker_engagement` |
| Cross-tenant transport | MESH envelope/event/acknowledgement |
| MESH relationship/capability | MESH relationship episode and capability |
| MESH-to-NEON correlation | governed account link + external reference |
| Immutable mutation evidence | plane-local command evidence contract |

No application service may maintain a second status or decision authority in metadata JSON, a snapshot, an envelope, a 360 projection, or a form answer.

## 12. DDL issue remediation

### 12.1 NEON Business Partner

1. Add composite role/BP FKs to qualification, supplier preference, customer designation and credit review so triggers are not the only consistency layer.
2. Replace literal relationship-type cycle logic with a typed relationship catalog containing direction, inverse, roles, cardinality, hierarchy and cycle policy.
3. Require effective readiness evidence for supplier activation, matching the customer-side intent.
4. Make lifecycle commands distinguish not-found, wrong-tenant and stale-version failures.
5. Replace metadata protected-key blocklists with a shared non-authoritative metadata policy and bounded schema.
6. Harden website URLs and store verification state/time.
7. Validate the organization-only BP constraint and retire inert person/group compatibility branches after data preflight.
8. Complete customer and supplier lifecycle command coverage for deactivate/reactivate/archive semantics.
9. Add referential validation/reconciliation for polymorphic owner links.
10. Standardize valid time as `[effective_from,effective_until)`, non-overlap and explicit supersession.

### 12.2 MESH

1. Certify the landed command-ownership hardening for account, relationship, catalog and envelope lifecycle, including exact replay, concurrency, atomic evidence/audit/outbox and participant-side authority.
2. Add per-capability relationship state and gate routing on capability.
3. Replace clear bank account identifiers with vault tokens or envelope encryption; retain only last-four/fingerprint outside the protected store.
4. Bound and schema-pin all authority/evidence JSON, especially account capabilities and metadata.
5. Add commodity-capability effective-range exclusion.
6. Add governed profile address semantics and URL verification.
7. Govern profile field sets and classification ceilings as published metadata.
8. Add a canonical-party correlation claim/verify/dispute process; correlation must never grant authorization.
9. Catalog-validate relationship kinds and bank/disclosure purposes.
10. Certify RLS symmetry for every relationship-derived object.

### 12.3 Workforce

1. Bound and classify `person.metadata`, protected-profile JSON, engagement readiness/checklist JSON and candidate/compliance evidence.
2. Move protected Person fields behind purpose-specific service functions; do not grant generic entity-list access.
3. Make worker compliance and engagement lifecycle decisions command-owned, versioned, idempotent and maker-checker protected.
4. Standardize employment, assignment, placement, compliance and engagement valid-time rules and non-overlap.
5. Generalize workforce IAM projection and connect suspension/termination to deprovisioning and authorization epoch.
6. Gate external-workforce envelopes on an active/requested `services_procurement` capability appropriate to the document type.
7. Preserve commercial work order/SOW revisions; converge only duplicate form/checklist snapshots.

### 12.4 Cross-cutting

1. Extract a shared command contract/kernel before adding more independent evidence-ledger shapes.
2. Make the authority register executable and CI-enforced.
3. Bind snapshot capture to deployed contracts rather than trusting caller-provided hashes.
4. Add payload size/classification/retention limits and crypto-shredding strategy.
5. Standardize projection consumer checkpoints, retries, replay and reconciliation.
6. Record latency, lock contention, evidence growth, outbox lag, quarantine age and replay metrics.

### 12.5 Canonical DDL and code change map

| Area | Required change |
|---|---|
| Common `document` DDL | Add the generic `entity_change_case` header, domains, tenant FKs, indexes, command-authority triggers, RLS and grants. |
| Common `snapshot` DDL | Add lineage/reference records and contract-bound capture enforcement. |
| Common `governance` DDL | Add cycle subjects and the executable authority register; retain cycle execution as journey authority. |
| Studio `metadata` DDL | Add surface-component composition and compiler validation. |
| `runtime_meta` compiler/projection | Emit case storage, aggregate JSON schema, materialization mappings, field classification and compatibility adapters in the descriptor. |
| MESH DDL | Add relationship capability, governed exchange document types/field sets, bank protection corrections and receiver-side contract gates. |
| NEON DDL | Add the BP/customer/workforce hardening items above; migrate legacy request evidence to cases, snapshots and lineage. |
| Services | Replace direct legacy table repositories with case, cycle, snapshot and receiver ports. |
| Read side | Update BP 360, workforce views, explainability, health checks and reports before object retirement. |
| CI/evidence | Add authority drift, catalog parity, source-reference, live security, concurrency, replay, quarantine and rollback gates. |

The six principal net-new relations are `document.entity_change_case`, `governance.cycle_subject`, `metadata.entity_surface_component_binding`, `snapshot.entity_snapshot_lineage`, `governance.authority_register`, and `mesh.network_relationship_capability`. Everything else should extend or converge an existing authority unless a later evidence-backed review proves a separate operational projection is required.

## 13. Table disposition

### 13.0 Current-use finding

The retirement candidates are redundant in the target architecture but are **not unused in the current codebase**. Current repositories write MESH match/acceptance, request materialization, supplier activation evidence and invitation recovery; BP 360 and platform health checks read or require them. They must not be deleted before those consumers move.

The immediately removable source duplication identified in this area is the repeated, identical `supplier_activation_evidence` grant block in NEON `document/11_grants.sql`. Removing the duplicate statement changes no privilege outcome; it belongs in C0 with a focused source-contract test.

### 13.1 NEON Business Partner request area

| Current object | Disposition | Replacement/gate |
|---|---|---|
| `business_partner_invitation` | Retire after identity cutover | Case task + requested MESH relationship + protected expiring access capability |
| `business_partner_invitation_recovery` | Retire | Access recovery command/evidence |
| `business_partner_request` | Retire after dual-write | `entity_change_case` + snapshots; temporary read-only compatibility view |
| Seven typed request child tables | Retire after dual-write | Contract-bound snapshot collections; approved data still materializes to normalized master children |
| `business_partner_request_evidence` | Converge | Generic case evidence/content references and snapshots |
| `business_partner_request_validation` | Converge | Contract-pinned validation snapshot plus small searchable failure projection if justified |
| `business_partner_request_materialization_item` | Retire | `entity_snapshot_lineage` |
| Three `mesh_business_partner_match/acceptance*` tables | Retire | Receiver attempt, proposal/decision snapshots, lineage and MESH acknowledgement |
| `supplier_activation_evidence` | Retire | Shared command evidence + readiness decision/result snapshot |
| `business_partner_duplicate_resolution` | Converge | Generic case plus role-based before/after snapshot lineage |
| `business_partner_bank_verification` | Retain then move/rename under control | Protected operational verification state; payload evidence in protected snapshot |
| `supplier_registration_invitation` view | Retire | Remove after zero-use telemetry window |

### 13.2 Workforce request area

| Current object | Disposition | Replacement/gate |
|---|---|---|
| `workforce_request` | Retire after People case cutover | `entity_change_case` with workforce/person contracts |
| `workforce_request_validation` | Converge | Generic validation snapshot/projection |
| `engagement_onboarding_case` | Retire | `governance.cycle_run` + tasks + worker engagement subject |
| `worker_compliance_item` | Retain/harden | Searchable effective decision authority |
| Requisition, candidate, work order, SOW, engagement and placement tables | Retain | Operational/commercial authorities; separate future revision-snapshot review |

### 13.3 Snapshot and MESH projections

- Converge ordinary `mesh_business_partner_profile_received` data into generic entity snapshots with MESH source lineage.
- Keep a specialized bank-disclosure snapshot because its prohibited-value and recipient security contract is materially different.
- Keep inbox/quarantine projections until the generic receiver proves equivalent operational observability and replay.
- A snapshot never replaces a queue head, current decision projection, effective assignment, monetary document or access-control state needed for deterministic operational queries.

## 14. Repository cleanup rules

"Retire" does not mean deleting files or tables immediately.

1. Add the replacement canonical DDL and upgrade migration.
2. Backfill cases, snapshots and lineage with row-count/hash reconciliation.
3. Dual-write through one command path.
4. Move readers and health checks.
5. Revoke legacy writes.
6. Expose a read-only compatibility view if required.
7. Measure zero reads/writes for the approved compatibility window.
8. Export/archive evidence required by retention or legal hold.
9. Drop objects through a forward migration.
10. Remove the retired object from canonical DDL, grants, RLS, functions, triggers, application repositories, health checks and tests.

Applied historical migrations are not deleted from the repository or rewritten. They remain upgrade history unless the project executes an explicitly governed baseline squash. Clean provisioning simply stops creating retired objects; upgrade provisioning applies the forward drop migration.

User-owned uncommitted files and unrelated repository cleanup are outside this architecture migration and must not be deleted as part of it.

## 15. Migration waves and mandatory gates

This program starts only after the current S5 security/mutation certification is closed or its remaining exceptions are explicitly carried into the first gate. It must not be mixed with S8 performance/scorecard work.

### C0 — Freeze and executable inventory

- Freeze new domain-specific request/form tables.
- Generate object, grant, function, trigger, consumer, row-count and retention inventory.
- Publish dispositions and the authority register.
- Reconcile current NEON/MESH review findings against live catalog state.

**Exit:** no unexplained object or active consumer.

### C1 — Shared command and snapshot foundation

- Standard command fingerprint/replay/error/atomicity contract.
- Contract-bound snapshot capture.
- Generic lineage.
- Valid-time convention.
- Projection consumer contract and observability.

**Exit:** live negative, concurrency, replay and rollback probes pass on both planes.

### C2 — Studio composition and generic case

- Add surface component binding.
- Publish request/registration/qualification/customer/workforce contracts.
- Add entity-change case and cycle subject.
- Compile UI, server validation, materializer mapping and contract tests from one release.

**Exit:** internal round-trip works without typed request-child persistence.

### C3 — Supplier pilot

- Buyer-requested supplier flow first.
- MESH existing-account path, then new-account invitation path.
- Registration materialization, qualification and preference.
- Dual-write and compare against legacy request tables.

**Exit:** all three supplier scenarios pass, including duplicate, stale, replay, return-for-correction and rollback cases.

### C4 — Customer convergence

- Customer request/registration and optional MESH collection.
- Credit review, designation and readiness-gated lifecycle.
- Dual-role BP tests.

**Exit:** no credit/status authority exists in form or BP metadata.

### C5 — Workforce Person convergence

- Internal employee request/case.
- External candidate disclosure and engagement onboarding.
- Protected PII boundary, compliance/tenure and IAM deprovisioning.

**Exit:** no Person requires a BP; no protected Person profile is published through general MESH/profile contracts.

### C6 — Reader and compatibility cutover

- Update 360, explainability, health checks, reports and integrations.
- Backfill provenance and lineage.
- Revoke legacy writes and monitor compatibility views.

**Exit:** zero legacy writes and reconciled read behavior.

### C7 — Physical retirement

- Apply preflighted forward drop migrations.
- Remove dead repositories, routes, permissions, health checks and tests.
- Preserve migration history and retained evidence.

**Exit:** clean and fully upgraded catalogs/privileges match; no orphan FKs, grants, policies or code references.

### C8 — Completion certification

- Run clean/upgrade parity.
- Run role/RLS matrix, negative, concurrency, replay, ordering, quarantine, atomicity and data-loss tests.
- Execute the selected database release profile on disposable Studio, NEON and MESH databases, including its canonical seed packs, and reconcile every manifest item to a durable receipt.
- Apply the same release profile a second time and prove exact idempotent convergence or an explicit immutable-pack replay result.
- Generate durable completion report, evidence hashes and retained exceptions.

**Exit:** all flows are reproducible from source envelope/internal assertion through case, decision, materialization and result snapshot; clean and upgrade builds have complete, checksum-matched DDL, migration and seed receipts with no failed, applying, missing, duplicate or unexplained item.

## 16. Database and seed execution certification

“Run all scripts” must mean **every artifact selected by an immutable release profile**, not every SQL or TypeScript utility found in the repository. Operational repair tools, development fixtures, demos and historical packs must never be inferred into a production build by directory scan.

### 16.1 Script classifications

Every database-related script and seed pack must have one explicit disposition:

| Class | Execution rule |
| --- | --- |
| Release foundation | Mandatory, in ordered plane DDL manifests |
| Release upgrade | Mandatory for the applicable baseline, in ordered migration manifests |
| Release seed | Mandatory, in the selected immutable seed-pack manifest |
| Environment bootstrap | Selected explicitly by environment profile; never inferred |
| Development/demo fixture | Forbidden in production profiles |
| Operational/repair | Manual command with confirmation and evidence; not part of provisioning |
| Historical/retired | Retained for audit or upgrade history and excluded explicitly |

The coverage check fails when an eligible artifact is absent from a manifest, occurs more than once, has an unknown class, references a missing file, or has a content hash different from the manifest. Included SQL fragments and generated inputs are covered by the resolved-content hash, not only the top-level filename.

### 16.2 Required certification paths

Run both paths in disposable databases for all three planes:

1. **Clean build:** create empty Studio, NEON and MESH databases; execute every ordered foundation entry; apply the selected canonical seed packs; verify plane/tenant contexts, catalogs, constraints, grants, forced RLS and seed contract hashes.
2. **Supported upgrade:** restore the oldest supported release baseline; execute every applicable migration in manifest order; apply/converge the same seed profile; compare the normalized catalogs and privilege surfaces with the clean build.
3. **Idempotency:** repeat the foundation/seed orchestration where supported. Immutable seed replays must be exact; changed content under an existing pack identity must fail. Upgrade migrations already recorded with the same hash must be skipped; hash drift must fail.
4. **Behavior:** run the live negative, concurrency, atomicity and cross-tenant suites after both clean and upgrade paths. Static source-contract tests do not substitute for this step.

### 16.3 Durable evidence

Certification reconciles source manifests to database receipts:

- `public.schema_provisions`: one successful checksum-matched receipt for every selected foundation entry, including plane, manifest hash and ordinal.
- `public.athyper_schema_migration_v1`: every applicable migration is `applied` with the declared SHA-256; no row remains `applying` or `failed`.
- `public.seed_pack_ledger_v2` and `public.seed_pack_execution_v2`: every selected immutable seed pack is registered and has the expected successful execution/replay outcome.
- `public.three_plane_provision_receipt_v1`: binds the Studio, NEON, MESH, seed-profile and context-verification results to one build identity.
- A versioned CI artifact records manifest hashes, database versions, normalized catalog hashes, privilege/RLS results, start/end times and sanitized failure output.

The foundation runner must populate `schema_provisions`; defining the table without writing receipts is not sufficient. Receipt reconciliation must compare the exact ordered manifest, not merely count rows.

### 16.4 Current readiness gaps

The repository cannot yet claim complete execution certification:

1. The foundation plan is PowerShell-only and is not runnable in the current Linux environment (`powershell: not found`). Provide a cross-platform TypeScript entry point, or standardize an available `pwsh` runtime in local and CI images.
2. The foundation runner defines `public.schema_provisions` but does not persist a receipt for each executed manifest item.
3. `db:seed:meta-entity:check` references a missing active `seed/meta-entity/pack.v1.json`. Rebuild an active versioned pack from its current authority or remove the command from the release profile; never provision from `seed-backup`.
4. `db:seed:blueprints:check` references the missing active `seed/blueprints/universal/010_spend_taxonomy` directory. The manifest/profile and active seed tree must be reconciled.
5. `db:verify:platform-catalog` still targets a nonexistent `ddl/planes/athyper/_manifest.txt`; update it to the current Studio/NEON/MESH plane model or retire it.
6. `db:verify:archetypes` reports missing legacy schema directories but exits zero after checking zero files. Missing configured inputs and zero-file coverage must be hard failures.

Until these gaps are corrected, reports must distinguish **static checks passed**, **plan resolved**, and **live database execution certified**. Only the last state closes C8.

## 17. Required acceptance scenarios

At minimum, automate:

1. Buyer-requested supplier with existing MESH account.
2. Buyer-requested supplier with newly created MESH account.
3. Supplier self-registration accepted, sponsor-required and rejected branches.
4. Internal-only supplier, internal-only customer and dual-role BP.
5. Customer credit review and activation without duplicated credit authority.
6. Qualification at category + industry + operating-organization scope.
7. Preference attempted without qualification, with expired qualification and with valid qualification.
8. Contract version mismatch with lossless transform and incompatible quarantine.
9. Concurrent submission/approval/materialization and exact replay.
10. Duplicate MESH account/BP match and explicit merge/no-match decisions.
11. Internal employee onboarding with protected profile and IAM provisioning.
12. Supplier-provided external worker with candidate disclosure, compliance, engagement and deprovisioning.
13. Legal hold covering source envelope, all snapshots, decision, audit and report pack.
14. Complete rollback at every failure point in the atomic command pipeline.

## 18. Deferred innovations after correctness gates

- Reusable verifiable evidence packs with issuer signature and push revocation.
- Field-level freshness contracts and automatic delta questionnaires.
- Explainable deterministic/AI-assisted duplicate proposals; AI never executes mutation.
- Continuous qualification triggered by certificate, risk, bank or policy changes.
- Network-level fraud signals using privacy-preserving account fingerprints.
- Form and policy simulation against historical snapshots before publishing a release.

These are projections and proposals over the governed foundation. They do not introduce new status or decision authorities.

## 19. Final target outcome

The completed architecture has one reusable lifecycle engine instead of separate supplier-request, customer-request, questionnaire, invitation and workforce-checklist persistence models:

```text
Studio publishes contracts, surfaces and cycle templates
    -> Governance instantiates a journey and tasks
    -> Entity case collects a contract-bound proposal
    -> MESH optionally transports selective disclosures
    -> Workflow decides
    -> NEON materializes normalized authority
    -> Snapshot, evidence, audit, lineage and outbox prove the result
```

This preserves the strengths of relational operational authority while eliminating duplicated revision storage and direct template-to-DDL coupling.
