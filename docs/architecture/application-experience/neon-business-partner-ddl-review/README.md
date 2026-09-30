# Neon Business Partner, Supplier, Customer and Supplier Workforce — DDL and MetaEntity review

Review date: 2026-09-21. Scope: current local source tree and **Neon's ordered DDL manifest**, including common SQL that Neon executes. Mesh and Studio application implementation is deferred. This is a recommendation and source inventory, not an implementation or live-database certification.

## 1. Recommendation

Extend the existing Business Partner application through reference lookups, related collections and governed operations. Do not turn every physical table into an independent editable app entity.

Use five exposure types:

1. **Reference entity:** reusable, usually read-only lookup/list/detail, such as country, state/region, currency and bank institution.
2. **Owned related collection:** parent-scoped rows such as aliases, addresses, contact channels, decision scopes and company bank usage.
3. **Governed business entity:** qualification, credit review, supplier preference, rate card or engagement with named lifecycle commands rather than generic writes.
4. **Read-only history/projection:** address events, decision evidence, lifecycle events and accepted network provenance.
5. **Internal infrastructure:** inboxes, processing attempts, replay records, publication receipts and protected values. These do not need general Business Partner CRUD surfaces.

Keep supplier and customer as roles attached to a Business Partner. Keep organizational, treasury, finance and People authority with their existing owners. A metadata-driven screen still calls authorized domain services where business behavior requires them.

## 2. Review coverage and evidence limits

The source scan traversed all **229 SQL paths** in [Neon's manifest](../../../../server/db/ddl/planes/neon/_manifest.txt). It identified **580 unique CREATE TABLE declarations** across all included schemas. Eleven legacy request tables have later DROP TABLE statements in the same manifest. The count is therefore not an assertion that 580 tables exist after a successful clean build.

The requested schemas contain **278 table declarations**: 15 shared, 153 master and 110 control. All are classified in the accompanying matrix, including adjacent infrastructure and domains not recommended for BP exposure. Document and snapshot dependencies are included separately because supplier workforce and governed partner requests cannot be modeled accurately using only the three requested schemas.

| Deliverable | Contents |
|---|---|
| [Shared/master/control matrix](shared-master-control-matrix.csv) | Every one of the 278 tables, DDL location, recommended treatment, phase, authored core evidence and service source mentions |
| [User-list reconciliation](user-list-reconciliation.csv) | Each distinct requested table resolved to its actual schema and recommendation |
| [Related/supporting table inventory](bp-related-and-supporting-tables.csv) | Broad domain, dependency, integration and retired-table candidates; inclusion is not an instruction to build an app |
| [All Neon table declarations](all-neon-table-declarations.csv) | Full 580-table scan with exclusion rationale for adjacent domains |
| [Declared reference edges](declared-reference-edges.csv) | Source FK/reference declarations with file/line evidence; not a final PostgreSQL catalog dump |
| [Manifest files](reviewed-manifest-files.txt) | Exact SQL paths scanned |
| [Scan summary](scan-summary.json) | Counts and scope |

The comparison against `metadata/products/mdg/entities/*/core.json` found direct storage bindings for 19 tables in the three requested schemas. These files declare `draft_for_review`; their existence does not prove publication, active release selection, permission completeness or successful rendering. A missing core example is a candidate gap, not proof that no other metadata source exists. Source service mentions likewise do not establish that a handler is registered or a route is reachable.

The inspected existing core examples cover country; Business Partner; supplier/customer and their company profiles; operating-organization assignment; addresses/address links; contact person; identifiers/tax; commodity capability/industry classification; governance relations; qualification/certification; banking via `master.bank_account`; and workforce via `master.employee`. Extend these definitions where appropriate. The remaining **259 tables have no direct storage binding in that inspected core-example set**, but many are dependencies, histories or internals that should not become standalone MetaEntities.

Metadata presence is assessed separately from completeness: for example, the address core exists but omits subdivision fields, and the banking core's account binding does not by itself describe the usage/link/company graph. The country-only shared core evidence also does not prove currency lacks an existing runtime reader.

This review reads table declarations, relationship constraints, relevant functions/services and current example artifacts. It does not execute the manifest, inspect deployed rows, certify all RLS policies, or verify active release payloads. The reference-edge CSV is a source scan; inline references and later constraint changes must be checked in SQL before implementation.

## 3. Important corrections and confirmed source gaps

| Finding | Evidence | Recommendation |
|---|---|---|
| Country → State/Region → Address already exists in DDL | `common/shared/05_constraints.sql`, `common/master/05_constraints.sql:35`, `planes/neon/master/05_constraints.sql` | Complete metadata and dependent lookup wiring; do not add a duplicate relationship |
| Address metadata is incomplete relative to DDL | `address/core.json` binds country but has no state/region or timezone field; BP address section target fields omit these too | Add source-compatible field/reference definitions and section bindings, then publish and verify the active projection |
| Address submission is not entirely missing state handling | `business-partner-request-service.ts` validates country/code compatibility; `business-partner-request-capture.ts` queries active `shared.state_region` | Reuse server validation/capture; supply a consistent metadata-driven selector |
| Qualification, blocks, credit/designation and evidence are control tables | Neon control table declarations | Model decisions and audit/history with their proper lifecycle; do not classify them as ordinary master-data CRUD |
| Banking usage already has implementation | `kysely-business-partner-360-commercial-controls.ts` joins bank link, account, usage, company usage and network acceptance | Fill metadata/projection gaps around existing behavior; do not build a second banking reader |
| Supplier workforce differs from the current workforce example | `workforce/core.json` binds `master.employee`; external workforce uses `master.external_worker` and `document.worker_engagement` | Introduce distinct external-worker/engagement semantics; preserve internal employee workflows |
| Example workforce handler is not in the inspected generic BP handler map | Example names `neon.bp.section.workforce.v1`; `register-services.ts` BP entity section map does not list it | Define/register the intended provider and permissions before surfacing the section; a JSON handler name alone is insufficient |
| Legacy BP request example names retired physical tables | `business_partner_request/core.json` names `document.business_partner_request`; `planes/neon/document/11_grants.sql:599–609` drops that family | Reconcile the metadata contract to the current case projection, rather than resurrecting those tables |
| Current request repository uses shared cases | `kysely-business-partner-case-repository.ts` reads `document.entity_case` and snapshots | Keep the logical request entity while correcting its storage/provider representation |
| Workforce billing units are not general UOM codes | `control.external_workforce_rate.unit_of_measure` is constrained to hour/day/week/month/each/fixed | Preserve this vocabulary or explicitly design a mapping; do not attach a generic UOM FK without reconciling meanings |
| Alias language has incompatible assumptions for a direct language FK | Alias `language_code` permits regional tags; `shared.language.code` is a base language code | Decide whether the field means language or locale; validate/normalize before linking |
| Rate-card currency needs a focused integrity review | Rate-card DDL has `currency_code`; inspected FK declarations do not link it to `shared.currency` | Use the existing currency lookup, then verify authoritative command validation and consider a matching database FK |

An additional address example rule requires postal code only when country is US. Prefer a server-backed country address policy using the existing country postal/format hints instead of expanding a list of hardcoded country branches. Do not infer a universal postal requirement from `has_postal_codes` alone.

## 4. Shared reference tables — all 15

| Table(s) | BP use and relationship | Recommended exposure |
|---|---|---|
| `shared.country` | BP registration country, addresses, tax jurisdictions, banks, alias geography | Reuse country entity/reference; retain code-valued bindings |
| `shared.state_region` | Country-filtered address and jurisdiction subdivision; optional hierarchical parent | New/reconciled reference core + dependent lookup; UUID identity and natural `(country_code, code)` handled explicitly |
| `shared.language` | Alias/profile language where the consuming field truly stores a language | Shared reference lookup after field-semantic review |
| `shared.locale` | Locale references language and optional country; profile/template formatting context | Reference entity where needed; not automatic UI-language enablement |
| `shared.timezone` | Address/site/company/profile timezone; canonical timezone alias relation | Reusable lookup; do not assume one timezone per country |
| `shared.currency` | Banking, company commercial terms, credit and workforce prices | Reuse currency reader/reference support; confirm current MetaEntity release coverage before calling it a new entity |
| `shared.uom` | Actual quantity/UOM consumers | Shared reference; external-workforce rate units require a separate explicit decision |
| `shared.bank_institution` | Canonical bank identity and country | Read-only directory entity/lookup |
| `shared.bank_branch` | Child of institution; country/location and effective status | Institution-dependent collection/lookup |
| `shared.bank_identifier` | Institution/optional branch + scheme, namespace, jurisdiction, value and effective dates | Directory child identifiers; do not flatten every identifier into a BIC field |
| `shared.classification_scheme` | Domain/scheme authority for commodity and industry codes | Shared reference root |
| `shared.commodity_code`, `shared.industry_code` | Domain-qualified codes and parent hierarchy | Dependent hierarchical lookup respecting the actual composite keys |
| `shared.commodity_crosswalk`, `shared.industry_crosswalk` | Source-domain/code to target-domain/code mappings | Read-only related mappings; not automatic authority to reclassify a partner |

These global references have different scope from tenant-owned master records. Generic reference readers must honor each core's real scope, not add fictional tenant predicates to shared tables. Neon lookup/read surfaces are in scope; unrestricted maintenance of global reference datasets is not implied.

## 5. Master table families and app placement

| Family / exact tables | BP application placement | Treatment |
|---|---|---|
| `business_partner`, `supplier`, `customer` | Overview; Roles & scope | Existing core/role definitions; retain one partner with independently governed roles |
| `business_partner_alias` | Identity → Names and aliases | Owned collection with language/country/effective dates; current identity reader already includes aliases |
| `business_partner_relationship`, `business_partner_governance_relation` | Relationships / Governance | Distinct relationship collections; do not merge commercial relationships with governance members |
| `address`, `address_link`, `address_event` | Addresses; address history | Address target + owner/purpose link + read-only validation events |
| `contact_person`, `contact_person_role`, `contact_link`, `contact_email`, `contact_phone`, `contact_person_identity_link` | Contacts → person, roles and channels | Reuse contact authority/verification; identity link is not authority to expose all person data |
| `business_partner_identifier`, `business_partner_tax_registration`, `tax_jurisdiction`, `tax_type` | Identifiers & Tax | Owned identifiers/registrations with country/jurisdiction/type lookups |
| `business_partner_commodity_capability`, `commodity_category`, `commodity_code_assignment`, `business_partner_industry_classification` | Capabilities / Industry | Category-mediated commodity model and domain-qualified industry references |
| `certification`, `certification_type` | Qualifications & Certificates | Certificate collection, type lookup, effective dates and authorized attachment evidence |
| `business_partner_operating_organization_assignment`, `company_code_supplier_profile`, `company_code_customer_profile` | Roles & scope; supplier/customer company sections | Explicit authorized organization/company context; no wildcard assumption for NULL scope |
| `legal_entity_internal_partner_link`, `intercompany_trading_pair` | Internal partner details where applicable | Internal-organization relationships; do not display as generic supplier onboarding options |
| `bank_account`, `bank_account_link`, `bank_account_usage`, `bank_account_company_usage`, `bank_provisional_reference` | Banking | Existing masked projection, link purpose/role, scoped usage, verification and provisional resolution |
| `bank_account_house_config`, `bank_account_house_payment_method` | Organization/Treasury | Adjacent internal-company configuration; not supplier/customer bank account management |
| `payment_method`, `payment_term`, `payment_term_clause`, `payment_term_discount_tier` | Supplier/customer company terms | Reusable commercial lookups and subordinate term details |
| `accounting_profile`, `gl_account`, `company_code_gl_account` | Authorized company financial settings | Finance-owned lookups filtered by company and valid usage |
| `legal_entity`, `company_code`, `operating_organization`, `procurement_organization_profile`, `sales_organization_profile`, `operating_organization_company_assignment`, `operating_organization_capability` | Context and assignment selectors | Reuse organization management; do not clone these records into BP |
| `person`, `external_worker` | Supplier workforce identity/engagement drilldown | Separate external-worker entity; person identity retained |
| `person_sensitive_profile` | Restricted provider only | Exclude from generic data projection and supplier-visible lists |
| `employee`, `employment`, `work_assignment` | Internal workforce, separate boundary | Existing employee-based workforce model; do not substitute for external worker/placement |
| `site`, `job`, `position`, `org_unit`, `cost_center`, `profit_center` | Workforce assignment/engagement context | Existing authorized reference selectors; optional HR dimensions listed in CSV remain dependency-only |
| `risk_dimension`, `risk_driver_registry`, `risk_model`, `risk_model_dimension`, `risk_source`, `party_risk_assessment`, `party_risk_dimension_score`, `party_risk_evidence`, `party_risk_driver`, `party_risk_mitigation`, `party_risk_review_event` | Qualifications/Risk drilldown | Authorized summary first; model/configuration maintenance stays with the risk owner |

All names in this section use the `master` schema. The CSV also identifies platform dependencies such as principal/profile, saved views, recent reference choices and bookmarks. Payroll, assets, inventory, BOM and unrelated finance tables are retained in the full inventory with an adjacent-domain classification; they do not become BP sections merely because they exist in Neon.

## 6. Control table families and app placement

| Exact control tables | Suggested integration | Write boundary |
|---|---|---|
| `business_partner_qualification` | Qualification decisions per role/org/company | Registered review/decision operations |
| `supplier_preference_designation` | Supplier preference/designation history | Governed decision/revocation |
| `customer_account_designation` | Customer designation section | Governed decision/revocation |
| `customer_credit_review` | Credit → reviews and outcomes | Authorized credit workflow |
| `business_partner_block` | Block/status summary with scope and reason | Explicit block/lift command, preserving eligibility checks |
| `business_partner_decision_scope` | Include/exclude scope under its qualification/preference/designation/credit parent | Parent-authorized children; not a standalone arbitrary scope editor |
| `business_partner_mutation_evidence`, `customer_lifecycle_event` | Activity/audit drilldown | Service-written evidence; read-only UI |
| `external_workforce_rate_card`, `external_workforce_rate` | Supplier workforce commercial rates | Company-governed policy and effective rows; a rate card does not authorize spend |
| `bank_account_validation_rule` | Banking validation policy | Internal configuration, not partner-editable data |
| `supplier_activation_policy`, `supplier_communication_policy` | Activation requirements and communication routing | Existing policy/service authority |
| `owner_type`, `owner_type_purpose` | Link ownership/purpose resolution | Registered owner authority |
| `lookup_domain`, `lookup_value` | Published business vocabularies, including profile classifications where used | Existing lookup publication and validation |
| `lookup_revision`, `lookup_tenant_revision`, `lookup_publication_receipt`, `lookup_value_reference` | Lookup infrastructure | Internal version/reference integrity; no BP CRUD |
| `process_selection_publication`, `process_selection_catalog_revision`, `process_task_rule_proposal`, `process_task_rule_release`, cycle/task configuration tables | Requests and task behavior | Reuse process orchestration; expose available actions and outcomes |
| `ui_locale_catalog` | Existing locale governance | Do not start the deferred localization workstream as part of reference lookup wiring |

The complete control matrix also classifies entitlements, feature flags, numbering, notification and parameter tables as shared dependencies. Their configuration screens are not part of this BP extension recommendation.

## 7. Neon-local Mesh integration tables

The following are **in Neon's manifest**, despite their `mesh_` prefix. Reviewing their Neon ownership is necessary and does not start Mesh application work.

| Tables | Recommendation |
|---|---|
| `control.mesh_business_partner_account_link` | Read-only Network account association; link/unlink only through authorized domain operations |
| `control.mesh_business_partner_profile_projection` | Accepted/current external profile state and provenance; display safe projected fields |
| `control.mesh_bank_account_projection` | Approved disclosure state through existing masked Banking reader; preserve company acceptance and version checks |
| `control.mesh_business_partner_profile_inbox`, `control.mesh_business_partner_profile_processing_attempt` | Internal ingestion/retry/idempotency records; expose only an authorized processing status if needed |
| `control.mesh_bank_account_disclosure_inbox` | Protected ingestion boundary; never turn raw payload into a generic partner collection |
| `control.mesh_workforce_claim_inbox`, `control.mesh_workforce_claim_processing_attempt` | Internal workforce claim receipt/processing; surface safe reconciliation outcomes in the owning workflow |
| `snapshot.mesh_business_partner_profile_received`, `snapshot.mesh_bank_account_disclosure_received` | Immutable received evidence; safe provenance through domain readers |
| `document.mesh_business_partner_match`, `mesh_business_partner_acceptance`, `mesh_business_partner_acceptance_event`, `mesh_profile_change_resolution`, `mesh_profile_change_case` | Neon-side match/accept/change workflows; not direct edits to foreign master data |

## 8. Concrete relationships to implement in metadata

### Address and subdivision

```text
Business Partner
  → address_link (tenant + registered owner + purpose + effective dates)
    → address
      → country(code)
      → state_region(country_code, code)
      → timezone(code)
      → address_event (validation/history)
```

The owner is polymorphic: `owner_id` is not an ordinary direct FK to Business Partner. Enforce the registered owner type, parent admission and tenant checks in the existing link service.

Recommended behavior: choose country first; query states by that country; preserve the full subdivision code (for example `MY-10`); invalidate an incompatible state when country changes; validate again on the server. Allow the supported manual-region mode when reference coverage requires it, without asserting a false state-code relationship. Keep link fields such as primary/purpose/effective dates separate from address fields. Country changes must also re-evaluate postal and formatting hints.

### Bank ownership and usage

```text
Business Partner → bank_account_link → bank_account
                   │                   ├→ bank_institution → bank_branch / bank_identifier
                   │                   ├→ bank_provisional_reference (until resolved)
                   │                   └→ currency
                   └→ bank_account_usage → bank_account_company_usage → company_code
```

The usage table has a composite identity `(tenant_id, bank_account_link_id)`, not a normal `id` field. Model it as a parent-owned value/child resource unless the entity runtime explicitly supports that identity. Do not invent an ID binding. Institution/branch selection must enforce the existing composite branch/institution constraint. Keep protected account identifiers behind the audited reveal path and preserve company-level disclosure acceptance.

### Classification

```text
Business Partner → commodity_capability → tenant commodity_category
                                       → category code assignments → shared commodity_code
Business Partner → industry_classification → shared industry_code
shared classification_scheme → domain-qualified codes → crosswalk mappings
```

The commodity path uses `master.commodity_code_assignment`; it is not a direct capability-to-shared-code FK. Industry classification currently binds `(industry_domain_code, industry_code_id)` and restricts allowed domains. Mirror these real identities and constraints; do not silently broaden accepted schemes because a lookup can return them.

### Supplier workforce

```text
Business Partner → supplier
  → workforce_requisition_supplier → workforce_requisition
  → external_candidate_submission → evaluation
  → contingent_work_order OR statement_of_work
  → worker_engagement → external_worker → person
       ├→ worker_operational_placement / worker_compliance_item / engagement_onboarding_case
       ├→ external_workforce_rate → rate_card → company / currency
       └→ time / expense / service records → service_sheet / invoice allocation
```

The supplier relationship is carried by the engagement and related commercial documents; `external_worker` itself does not contain a supplier FK. One person/worker can have successive engagements. Do not infer supplier ownership from an employee record or attach one permanent supplier to the person.

The supplier-facing BP view should show scoped counts, current engagements, rates and deep links. Requisitions, work orders, SOWs, placements, time/expense/service approval and invoicing retain their own workflows. The appendix includes these omitted document tables individually.

## 9. Recommended order for this phase

| Priority | Work | Completion evidence |
|---|---|---|
| P0 | Reconcile DDL, current service projections and example metadata | Correct request/case source, distinguish internal/external workforce, inventory active release bindings and registered handlers |
| P1 | Geography/contact/reference foundation | Country → state → address works in intake/edit/detail; contacts and ownership links remain correct; currency/context lookups reused |
| P2 | Partner commercial completeness | Aliases/relationships, classifications/certificates, supplier/customer scope, Banking usage and governed decisions wired through existing services |
| P3 | Supplier workforce and safe network/risk projections | External-worker/engagement semantics, company-filtered rates and approved workflow links; no raw inbox/PII exposure |
| Deferred | Mesh and Studio apps, global reference authoring, unrelated ERP/HR modules | Remain outside this Neon BP recommendation |

P1 reference entity work does not start the separate localization plan. Existing Comments and Attachments capability work retains its own plan and ownership. This review does not amend either existing build plan or authorize their replacement.

## 10. Definition of a completed MetaEntity link

For each selected entity/section, record and verify:

1. Actual storage table/view or registered provider; stable identity and version; no references to removed tables.
2. Entity core fields and safe reference projections, including natural-code versus UUID bindings.
3. Relation owner, cardinality, tenant/company/org constraints, effective dates and allowed child operations.
4. Lookup dependencies, server-side filters and invalidation rules; inactive historical references still display safely.
5. Presentation, section/summary placement, empty/restricted/context-required states and existing Comments/Attachments capabilities where applicable.
6. Authorized registered operation handlers with domain validation, idempotency/concurrency and evidence preservation; no generic write bypass.
7. Compile/publication dependencies and verified active release payload; authoring examples alone do not qualify.
8. Focused checks for valid/invalid country-state pairs, owner isolation, company-context revocation, bank branch/institution mismatch, protected values, effective dates and supplier-worker isolation.
9. One integrated local journey showing list/detail/intake references and persisted results; record actual limits rather than assuming all database rows have become entities.

The intended outcome is a complete, reusable Business Partner graph with correctly owned services—not a page for every table.

## BP2-00 implementation follow-up

[BP2-00 reconciliation](bp2-00/README.md) adds a read-only local activation/catalog snapshot, complete table/field/provider ledgers, retired request mapping, explicit corrective ownership and targeted compiler/dispatch checks. It distinguishes source inventory from active wiring and does not mark the later domain packages complete.
