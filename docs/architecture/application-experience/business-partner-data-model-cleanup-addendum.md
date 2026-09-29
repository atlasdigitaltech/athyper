# Business Partner data model — finalized table set and cleanup addendum

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Status: locked target logical design for source-cleanup planning. Physical field contracts, dependency replacement and the named ownership/privacy acceptance below remain implementation prerequisites; this is not a claim of deployed schema or completed stakeholder sign-off.

Implementation checkpoint — 2026-09-24: canonical banking, decision-scope, alias/parent and contact-responsibility DDL cleanup has been applied by rebuilding the same main DEV databases without backup, as authorized. Three-tenant demo data is reseeded and signed metadata activated. Banking and decision readers/evaluators are aligned; broader governed decision commands and document adapters remain incomplete. Person-category enablement remains approval-gated. See the [implementation record](business-partner-coordinated-implementation.md) for receipts, exact live removals, tests and remaining signed-in acceptance. No new instance was provisioned.

Audit revision: explicit generic instrument ownership, single coverage authority and scope dimensions, block-action cardinality/indexing, cross-plane contact responsibility, person-partner rule reversal and identity-field disposition, atomic block-scope sealing, header-owned validity and the Mesh verification boundary. These are target design decisions, not applied DDL changes.

Scope: partner identity and facts, bank-account instruments, and the three Neon decision authorities. This addendum records source-cleanup decisions; it does not execute database changes or prescribe migrations. No new Business Partner workflow or evidence table family is proposed.

Implementation tracking: [coordinated DDL/metadata/API/access/workspace slices](business-partner-coordinated-implementation.md). Source changes, publication and live acceptance are recorded separately.

Physical identity refinement: [identity field/writer contract](business-partner-identity-field-writer-contract.md) specifies organization profile fields now consolidated in [master/33_partner_organization_identity.sql](../../../server/db/ddl/planes/neon/master/33_partner_organization_identity.sql), replacing the former header extension `18_business_partner_business_profile.sql`, and a single legal_form_value_id authority; legacy legal_form becomes a derived compatibility code rather than a second stored field. That contract controls the identity field map without introducing another table family.

This addendum supersedes conflicting **proposed table lists** in [the qualification business design](business-partner-qualification-business-design-and-plan.md) and earlier conversation proposals. It does not claim the target schema is implemented. Existing platform history and attachment services remain shared infrastructure.

## 1. Finalized partner-data tables

| Area | Final table | Disposition and field ownership |
| --- | --- | --- |
| Common identity | `master.business_partner` | KEEP/EXTEND: tenant, ID, code, display name, category, lifecycle and person reference when applicable. Move organization-only fields to organization identity. |
| Organization details | `master.business_partner_organization_identity` | ADD: exactly one row for an organization partner; legal name, legal form, incorporation date and registration country. Use partner ID as the subtype key and enforce tenant consistency. |
| Individual details | `master.person` | REUSE: required person reference for person partners; do not add a duplicate partner-person table. Respect existing person field ownership. |
| Names | `master.business_partner_alias` | KEEP: alternate and trading names. |
| Relationships | `master.business_partner_relationship` | KEEP: relationships between partners. |
| Ownership/governance facts | `master.business_partner_governance_relation` | KEEP: applicable ownership and governance relationships. |
| Named contacts | `master.contact_person` | KEEP: contacts owned by the partner. A named contact does not automatically become a partner. |
| Contact responsibilities | `master.contact_person_role` | EXTEND COMMON TABLE: optional `address_link_id`; null means owner-wide responsibility, populated means responsibility at an address belonging to that same owner. This applies across planes, not only Neon partners; see §1.2. |
| Optional person association | `master.contact_person_identity_link` | KEEP: link a named contact to an existing person where applicable. |
| Channels | `master.contact_link` | REUSE/EXTEND: partner channels, named-contact channels and address-specific channels. Admit partner-address-link ownership in owner validation and readers. |
| Email details | `master.contact_email` | REUSE: channel-specific details; channel value remains authoritative in contact_link. |
| Phone details | `master.contact_phone` | REUSE: channel-specific details. |
| Address association | `master.address_link` | REUSE: owner, purpose, primary and dates. Also admit provisional-bank ownership. |
| Postal address | `master.address` | REUSE: postal fields; do not create another bank-address table. |
| Identifiers | `master.business_partner_identifier` | KEEP: applicable identifier schemes and protected identifiers. |
| Tax | `master.business_partner_tax_registration` | KEEP: tax registration facts. |
| Industries | `master.business_partner_industry_classification` | KEEP: independent partner industry declarations. |
| Commodities | `master.business_partner_commodity_classification` | KEEP: independent commodity declarations; no supplier/customer prerequisite. |
| Certificates | `master.certification` | KEEP: certificate details, validity and existing attachment references. |
| Certificate catalog | `master.certification_type` | REUSE: reference types; not another partner identity. |

The shared collections are optional as applicable. Both partner categories use the same owner references. Organization identity and person identity are mutually exclusive for a partner. Organization name/person name is authoritative in its respective identity store; partner display name is an explicitly defined presentation label.

### 1.1. Explicit identity-field disposition

| Existing/proposed field | Target decision |
| --- | --- |
| `legal_form`, `registration_country_code`, `incorporation_date` | MOVE from business_partner into organization_identity, including applicable validation and reference constraints. Registration country here means organization registration, not a person's nationality or residence. |
| `legal_classification` | KEEP on business_partner as an axis separate from structural category. A person partner may be sole_proprietor; do not split this domain between header and subtype or require an organization identity to capture that value. Validate category/classification combinations explicitly. |
| Existing organization-only rule | DELIBERATELY REVERSE: widen master.business_partner_category_d from organization-only to organization/person and remove business_partner_organization_only_chk. The current sealed-domain rule and People/Workforce comment describe the old design, not the target. Update both comments and dependent category validation. |
| Organization legal name | Store in organization_identity. Keep business_partner.name as the presentation label, not a second authoritative legal-name field. |
| `aliases text[]` | REMOVE the denormalized alias cache and its synchronization dependencies; business_partner_alias is the authority. Derive any required list/search projection from it. |
| `parent_business_partner_id` | REMOVE after explicit parent relationship semantics are represented in business_partner_relationship. Preserve tenant checks, hierarchy meaning, cycle prevention and any required single-current-parent rule; arbitrary relationship rows are not an equivalent replacement. |
| `canonical_party_id`, `representation_purpose_code` | KEEP existing canonical-party/representation meaning and associated constraints. They are not the person reference and must not be repurposed or removed as subtype duplicates. |
| `person_id` | ADD nullable UUID with tenant-consistent person FK. Required exactly when partner_category = person; forbidden for organization partners. |
| Category and organization subtype | Organization partners require exactly one organization_identity; person partners require none. Use a tenant-consistent unique subtype key and deferred database constraint enforcement on both parent and subtype mutations. A row-local CHECK alone cannot enforce cross-table existence/exclusion. Create parent/subtype atomically. |
| Common lifecycle, display, ownership, website, description, metadata and audit fields | KEEP on business_partner unless a subsequent explicit field contract establishes another owner; no blanket deletion of unlisted fields. |

Person ownership boundary: People/Workforce remains authoritative for master.person and its sensitive details; Business Partner owns the counterparty identity and tenant-consistent reference, not a copy of person data. Person-partner creation does not confer workforce membership or permission to read sensitive person fields. The Business Partner domain owner and People/Workforce domain owner jointly approve the integration contract, with the privacy/security owner approving field access and retention behavior before person-partner enablement. These are required approval roles, not assumed completed approvals; assign named accountable owners in the implementation field map. The logical decision to support person partners is locked, while enablement remains gated on this acceptance.

### 1.2. Shared contact/address responsibility contract

Extend the existing common master.contact_person_role, not a Neon-only copy. Its optional address_link_id must reference an address association in the same tenant whose owner_type_id and owner_id match those of contact_person. A contact of another owner cannot acquire a responsibility merely because both owners share a postal address. Validate updates to contact/address ownership as well as responsibility writes. Keep existing owner-generic support in every consuming plane; partner-specific validation is an additional specialization, not a replacement. Define primary/overlap uniqueness per contact, responsibility and optional address scope, including null scope. Test common DDL installation and existing Neon, Mesh and other consuming-plane paths. No new assignment table is introduced.

## 2. Finalized payment-instrument tables

| Final table | Disposition | Captured data |
| --- | --- | --- |
| `master.payment_instrument` | ADD | Tenant, ID, instrument type, display label, status, record version and creation/update fields. Only bank_account enabled this phase. |
| `master.payment_instrument_link` | GENERALIZE existing `master.bank_account_link` | Owner-generic instrument association: retain owner_type_id/owner_id and optional company_code_id, relationship, purpose, primary selection and dates. Add tenant-consistent instrument reference and partner-owner validation; do not narrow the shared link to partners only. |
| `master.bank_account` | KEEP/EXTEND | Unique tenant-consistent instrument reference; account holder, protected identifier, last four characters, currency, bank/branch or provisional reference and bank-specific characteristics. |
| `master.bank_provisional_reference` | KEEP/EXTEND | Submitted bank name, country, optional BIC/branch name and resolved bank/branch references. |
| `master.address_link`, `master.address` | REUSE, optional | Submitted bank/branch address owned by the provisional reference, not by the partner. |
| `shared.bank_institution`, `shared.bank_branch`, `shared.bank_identifier` | REUSE | Shared bank-directory facts. |

Initial capture and later updates use the same records. Supplier-oriented forms may default to bank account; this does not make a supplier role or company assignment a data prerequisite. Cash is a configurable method with no stored instrument row.

Move common name/status ownership to payment_instrument; avoid competing account and instrument lifecycle values. Remove verification-specific account columns, status defaults and active-verification constraints as part of the explicitly excluded verification functionality. Preserve protected identifier storage/masking. Submitted unknown-bank fields should have one owner in bank_provisional_reference, rather than duplicated account overrides; account-specific routing overrides must be assessed separately by meaning.

Retain current company_code, supplier and customer owner compatibility until their consumers are explicitly replaced; add business_partner ownership without breaking treasury. Retarget master.bank_account_house_config.bank_account_link_id to the generalized link (with an explicit field rename in the physical map), preserving company/owner consistency and requiring a bank_account subtype for house-bank setup. Preserve primary-selection and effective-period exclusion semantics. The optional company coordinate on this generic association is not the removed company-usage/acceptance feature and is not mandatory for partner bank capture.

Rewrite bank_account_bank_identity_chk when removing bank_name_override/bank_country_override: a directory-identified account uses valid institution/branch references; a pending account references a tenant-consistent provisional record that owns the submitted name/country. Do not leave the old constraint requiring removed override fields. Preserve institution/branch compatibility. Directory resolution must leave the account in one coherent identity state rather than create competing submitted-name stores.

## 3. Finalized Neon-only decision authorities

| Table | Disposition | Required content |
| --- | --- | --- |
| `control.business_partner_qualification` | KEEP/EXTEND | Partner, type, outcome, effectiveness, context, validity, structured conditions and approved shared-snapshot reference. Remove `partner_role` and `role_id`; represent commercial applicability in decision_scope. |
| `control.business_partner_block` | KEEP/EXTEND | Partner, actions, scope/target mode, typed context/target, dates, reason and lifecycle/lift details. Do not create a parallel restriction table just to rename this authority. |
| `control.business_partner_decision_scope` | REUSE/EXTEND | Exactly one decision owner; qualification or block, while preserving existing preference/designation/credit owners until separately refactored. Explicit dimension modes, groups, selections, company/category/declaration/geography references and country purpose. |

Selected commodity declarations belong to scope when they limit applicability. Historical decision versions reuse the platform snapshot mechanism; no qualification_revision or restriction_revision table is approved. These three tables are core decision data, not a claim that transaction limits, policy execution or exceptions are already implemented within them.

### 3.1. One applicability authority

For qualification and restriction, decision_scope is the sole applicability authority. Remove operating_organization_id and company_code_id from both headers; remove qualification.partner_role and role_id, and block.partner_role_scope. Represent commercial applicability in the scope groups with explicit partner-wide/all versus selected capacities; selecting supplier/customer capacity must not require a supplier/customer identity row. Header context/target identifies the standing/event decision or bound transaction, not a second coverage store.

Add block ownership and a tenant/partner-consistent commodity-declaration reference to decision_scope. Extend the exactly-one-owner constraint, owner validation and read/write indexes; retain existing preference/designation/credit ownership. Each qualification/block needs explicit coverage modes, including unrestricted coverage: missing rows never imply all. Values within a dimension are OR, dimensions within a group are AND, groups are OR, and exclusions subtract from the matching group. No separate group table is introduced. Both headers, scope rows and approved shared snapshots must use the same coverage contract; snapshots retain history rather than form a competing editable authority.

Explicitly extend scope_kind with commercial_capacity and add its selected value, commercial_capacity_code (supplier/customer), alongside the explicit unrestricted commercial mode. Add country_purpose for country coverage, distinguishing registration, delivery and service-performance country. A country selection without its purpose is invalid. These are proposed fields/dimensions, not existing columns. Update the scope-kind and coordinate-shape checks, group-mode consistency checks, value validation, scope identity/hash generation and lookup indexes together. Selected capacity is applicability, not a supplier/customer master-record FK. Index country coverage by purpose as well as country; do not treat the same country under different purposes as equivalent coverage.

Preserve restriction-coordinate immutability after moving coverage out of the header. Because blocks are created active and the current status domain has no draft state, use an internal scope_sealed boolean on the block, not a status-based insertion ban. The controlled database creation function inserts the active header with scope_sealed=false, writes and validates its full coverage, then seals it true in the same transaction. Application roles cannot directly insert block headers or change this flag; scope writes lock the owner row and are permitted only while unsealed through the controlled creation path. Once sealed, reject scope INSERT/UPDATE/DELETE and any attempt to unseal, including after lifting or expiry. A deferred constraint trigger on block creation/finalization requires a sealed, complete, valid coverage set at commit; an incomplete creation rolls back. Readers/evaluators must reject an unsealed block even inside the creating transaction. This flag is an internal assembly invariant, not a new business lifecycle or table. Later coverage changes require a replacement block; ordinary lift/status operations cannot reopen its scope.

Validity ownership: qualification and block headers are the sole authority for their decision validity periods. For scope rows owned by either, effective_from/effective_until must be NULL and readers inherit header validity; do not independently intersect or override dates on these rows. Preserve row-level dates for existing preference/designation/credit owners. Accordingly remove the unconditional scope effective_from NOT NULL/default, replace it with owner-conditional date checks, and keep existing date behavior explicit in other-owner writers. A qualification/block requiring different periods for different coverage needs separate decisions. Apply the business design's temporal boundary rules to the header period and lifecycle/lift state; no missing scope date implies perpetual validity.

### 3.2. Explicit block-action cardinality

Replace singular operation_code with operation_codes text[] NOT NULL: one or more distinct, non-null, recognized action codes. Use validated canonical arrays, not free-form labels or implicit wildcards; validate catalog membership through a database guard because an array cannot use a conventional per-element FK. A block's actions share one coverage, context, validity and lift lifecycle. Different dates, scopes or independent lift decisions require separate blocks. Update readers, predicates, snapshots and lookup indexes for membership rather than scalar equality. No action child table is proposed. This is a deliberate scalar-to-many contract change, not a rename.

Replace scalar normalization/lookup validation in control/07_functions.sql and its operation-validation trigger in control/08_triggers.sql with per-element normalization, validation and deterministic ordering. Update trg_guard_business_partner_block to compare canonical action sets and preserve immutability. Replace the scalar composite lookup index in control/06_indexes.sql (which also uses retired partner_role_scope) with tenant/partner lookup support plus a GIN action-membership index, or an equivalent access path demonstrated against the actual predicates and workload. Merely adding an array while retaining scalar queries/indexes does not complete this change.

## 4. Explicit removals in the planned cleanup

The following objects are in scope for the next coordinated source-cleanup implementation. Nothing is dropped by this document. Remove each object's DDL, constraints, functions, indexes, grants, metadata and executable consumers together.

| Existing object | Final disposition | Replacement or consequence |
| --- | --- | --- |
| `master.bank_account_usage` | REMOVE | No replacement usage table in this phase. |
| `master.bank_account_company_usage` | REMOVE | No company-level banking acceptance/usage collection in this phase. |
| `document.business_partner_bank_verification` | REMOVE | Remove verification workflow, UI/API and readiness dependency. No replacement verification table. |
| `master.bank_account_link` | REPLACE | Generalize into payment_instrument_link and retarget bank detail references through the instrument. Preserve required relationship meaning; do not simply rename every bank_account_id. |
| `control.business_partner_qualification_classification` | REMOVE AFTER SCOPE REPLACEMENT | Move selected-declaration applicability into decision_scope; update all writers/readers. No new qualification-specific evidence table. |
| `master.business_partner_commodity_capability` | RETIRED MODEL | Source cleanup should retain only role-free classification consumers. A prior local cleanup removed its creation; remaining references must be inventoried. |
| `master.business_partner_commodity_classification_origin` | RETIRED MODEL | No legacy origin/backfill table in the agreed clean build. Preserve source/provenance fields on classifications themselves. |

Do not delete generic attachments, shared snapshots, or risk/domain records solely because they were once referenced by one of these tables.

Field/dependency removal inventory, in addition to the table list:

- Bank verification: is_verified, verified_* fields and verification_method; pending_verification default/status consumers; bank_account_verification_evidence_chk and bank_account_active_verification_chk. Replace remaining lifecycle ownership as described in §2.
- Unknown-bank duplication: bank_name_override/bank_country_override and the old bank_account_bank_identity_chk definition, replaced by the provisional-reference contract in §2.
- Qualification: partner_role and role_id (not merely their NOT NULL constraints), inline operating_organization_id/company_code_id, their guards and role-dependent consumers. Remove business_partner_qualification_org_fk/company_fk; rewrite business_partner_qualification_partner_idx/readiness_idx and remove or replace org_idx/company_idx with scope lookup support. Preserve partner, actor and risk FKs. Inventory polymorphic role guards rather than assuming role_id has a direct supplier/customer FK.
- Block: inline organization/company and partner_role_scope dependencies; replace operation_code checks/index predicates and all scalar-action consumers with §3.2's contract.
- Partner identity: fields moved/removed in §1.1 and their dependent constraints, indexes, triggers, metadata and projections. Retain canonical-party behavior.
- Organization-only reversal: replace business_partner_category_d_check in master/02_domains.sql with the organization/person domain contract; remove business_partner_organization_only_chk in master/05_constraints.sql. Update sealed-domain/organization-only comments, metadata categories, validators and fixtures. Keep legal_classification on the common header, including sole_proprietor; add person_id and cross-table subtype enforcement under the ownership boundary in §1.1.
- Scope validity/immutability: replace unconditional effective_from nullability/default with owner-conditional checks; qualification/block scope dates are null and other owners retain dated scope. Add internal block scope_sealed protection, controlled atomic creation and deferred completeness enforcement as specified in §3.1; no new draft status or scope table.
- Parent-link dependency inventory under server/db/ddl/planes/neon/master/: hierarchy trigger in 08_triggers.sql, parent lookup index in 06_indexes.sql, projected parent field in 09_views.sql, column grants in 11_grants.sql and tenant-consistent parent FK in 05_constraints.sql. Replace hierarchy behavior with relationship-based enforcement before retiring the field; update the view contract and grants together.
- Alias dependency inventory in the same directory: remove the aliases-array guard in 08_triggers.sql with the redundant column. The aliases projection in 09_views.sql already derives from business_partner_alias; retain that derived behavior and verify its consumers rather than restoring an editable cache.
- Qualification/classification link retirement: remove the link table's constraints/indexes and the auto-link function/trigger only alongside explicit selected-declaration scope support; mappings must not silently create declarations or expand approval.

## 5. Confirmed redundant workflow DDL definitions

Historical repository finding: Neon document/03_tables.sql declared the following **11 tables**, and document/11_grants.sql dropped them after entity-case conversion. The 2026-09-24 source cleanup removes that create-then-drop scaffolding and its obsolete dependencies. These were not 11 active duplicate tables in the final database.

Remove the obsolete creation/dependency/cutover definitions from the clean-install source together. Retain the already-established shared platform destination; do not introduce replacement BP workflow tables.

| Retired definition | Existing destination/responsibility |
| --- | --- |
| `document.business_partner_request` | `document.entity_case` plus shared snapshot payload |
| `document.business_partner_request_address` | Case snapshot while editing; master.address/address_link for captured partner data |
| `document.business_partner_request_contact_person` | Case snapshot; master.contact_person |
| `document.business_partner_request_contact_channel` | Case snapshot; master.contact_link and applicable channel details |
| `document.business_partner_request_identifier` | Case snapshot; master.business_partner_identifier |
| `document.business_partner_request_tax_registration` | Case snapshot; master.business_partner_tax_registration |
| `document.business_partner_request_classification` | Case snapshot; industry/commodity classification authorities |
| `document.business_partner_request_certification` | Case snapshot; master.certification |
| `document.business_partner_request_evidence` | Existing shared snapshot/attachment associations where still required by installed consumers; no new BP-specific copy |
| `document.business_partner_request_validation` | `document.entity_case_validation` |
| `document.business_partner_request_materialization_item` | Existing entity-case materialization and snapshot-lineage infrastructure; verify child-level result consumers before deleting their old contracts |

The scan confirms the DDL retirement sequence. It does not establish that every old test, fixture or metadata artifact has already been removed. Legacy APIs and fixtures must be updated as part of source cleanup, without rewriting historical release records.

### 5.1. Commodity source scaffolding: distinguish obsolete cleanup from required behavior

| Neon master source file | Cleanup disposition |
| --- | --- |
| `32_remove_legacy_commodity_capability.sql` | Removed from source and manifest on 2026-09-24; capability/origin CREATE definitions were already absent. |
| `30_partner_classification_cutover.sql` | Removed from source and manifest with qualification_classification and its auto-link function/trigger. Explicit declaration scope references are now defined in control/18_partner_decision_contract.sql; application consumer cutover remains pending. |
| `31_partner_direct_commodity.sql` | Required behavior: nullable legacy category, direct commodity_code_id, exactly-one-subject constraint and active-UNSPSC/immutable-code guard. Preserve these in canonical classification DDL before retiring any incremental file or manifest entry. |
| `29_partner_commodity_classification.sql` | Retain classification and command definitions; remove only the qualification_classification definition/dependencies after its replacement is complete. |

## 6. Existing shared infrastructure — reuse, not new tables

| Existing tables | Disposition |
| --- | --- |
| `snapshot.entity_snapshot_identity`, `snapshot.entity_snapshot` | KEEP SHARED: entity history; no BP-specific revision family. |
| `snapshot.entity_case_snapshot_lineage` | KEEP SHARED: existing case-to-snapshot relationships. |
| `document.entity_case`, `document.entity_case_validation`, `document.entity_case_materialization`, `document.entity_case_command_evidence` | KEEP SHARED: already-installed common services. Not additional partner fact tables. |
| `document.work_item` | KEEP SHARED: existing assignments; outside this basic-data redesign. |
| `document.attachment_series`, `document.attachment`, `document.attachment_link` | KEEP SHARED: existing certificate/file support. |
| `master.business_partner_classification_command` | RETAIN PENDING REUSE: standalone command retries currently depend on it. Shared case-command storage is not automatically a replacement because it requires a case. |

## 7. Adjacent tables — future cleanup assessment, not blanket deletion

Lifecycle/ownership refinement (2026-09-25): the agreed target uses independent Supplier and Customer capability indicators on Business Partner (Enabled / Not enabled), not separate supplier/customer identities. Qualifications and Restrictions govern contextual use without mutating those indicators; Preferred Partner is a separate scoped designation. See the [consolidated lifecycle and MetaEntity view contract](business-partner-qualification-business-design-and-plan.md#61-consolidated-lifecycle-contract--current-storage-versus-target) and §15.3 there. This resolves the target direction below, but does not execute table retirement or approve unimplemented workflow automation.

These tables exist, but the basic-data chart alone does not supply complete replacements for their responsibilities.

| Existing table | Assessment / required destination |
| --- | --- |
| `master.supplier`, `master.customer` | Target retirement after partner-based document references and setup replace their identity dependencies. Account for codes, lifecycle and external references. |
| `master.company_code_supplier_profile`, `master.company_code_customer_profile` | Reuse/adapt settings to partner ownership; field ownership/names still need finalization. Do not discard payment terms, currencies or accounting defaults. |
| `master.business_partner_operating_organization_assignment` | Assess commercial setup responsibilities separately from qualification coverage; one is not automatically a substitute for the other. |
| `control.supplier_preference_designation` | Preference is distinct from qualification. Partner-reference adaptation is separate from deletion. |
| `control.customer_account_designation` | Customer commercial classification has independent meaning; preserve or explicitly retire that feature. |
| `control.customer_credit_review` | Credit is independent from partner qualification; outside current removals. |
| `control.business_partner_mutation_evidence` | Candidate for shared command-storage reuse; inspect idempotency/results and active writers before consolidation. |
| `control.customer_lifecycle_event` | Reconcile with eventual customer-role retirement and existing shared lifecycle storage. |
| `document.supplier_activation_evidence` | Reconcile with eventual operating-setup replacement; not the removed bank-verification feature itself. |
| `document.business_partner_duplicate_resolution` | Duplicate resolution has independent identity-linking meaning; examine consumers before consolidation. |
| `document.business_partner_invitation`, `document.business_partner_invitation_recovery` | Existing external registration/invitation recovery; preserve required Mesh/partner entry path until replacement is concrete. |
| `master.party_risk_assessment`, `master.party_risk_evidence` | Existing risk domain outside basic-data cleanup; no new risk tables proposed. |
| `master.bank_account_house_config`, `master.bank_account_house_payment_method` | KEEP treasury-owned setup. Retarget the house-config link to payment_instrument_link with bank-subtype and owner/company validation exactly as decided in §2; do not delete treasury configuration. |
| `control.supplier_communication_policy` | Tenant communication settings, not a duplicate identity table. Assess separately with invitation consumers. |

## 8. Mesh integration records — retain the agreed sharing path

Common Neon/Mesh data means compatible field contracts, not automatic duplication of physical schemas. Neon qualification/restriction/scope remain tenant-local. The following existing Neon integration objects are not additional editable partner masters:

| Existing tables | Responsibility / disposition |
| --- | --- |
| `control.mesh_business_partner_profile_inbox` | Delivery intake; retain pending integration review. |
| `control.mesh_business_partner_profile_processing_attempt` | Processing/retry state; not partner facts. |
| `control.mesh_business_partner_profile_projection` | Received profile projection; preserve separation from tenant-owned partner fields. |
| `control.mesh_business_partner_account_link` | Mesh account/local partner mapping; required meaning for duplicate-safe delivery. |
| `snapshot.mesh_business_partner_profile_received` | Received profile version; assess reuse with shared snapshots before any consolidation. |
| `control.mesh_bank_account_disclosure_inbox`, `control.mesh_bank_account_projection`, `snapshot.mesh_bank_account_disclosure_received` | Bank-data delivery/projection; do not equate these with excluded bank verification. Assess against the generalized instrument contract. |
| `document.mesh_business_partner_match` | Candidate matching and field comparison. |
| `document.mesh_business_partner_acceptance`, `document.mesh_business_partner_acceptance_event` | Selection/application tracking; possible consolidation candidates, but inspect recovery and version checks first. |
| `document.mesh_profile_change_resolution`, `document.mesh_profile_change_case` | Incoming/local difference resolution and existing case association. Do not silently overwrite local data by deleting this behavior. |

These are future consolidation candidates only where equivalent existing platform behavior is demonstrated. This addendum inventories their declared responsibilities, not a complete runtime redundancy proof.

Mesh verification boundary: Mesh verification does not become Neon verification, instrument activation or operational eligibility. Existing mesh.bank_account_link and Mesh verification/identity guards are not removed by this Neon cleanup. Preserve received historical payloads where retention requires them, but do not materialize source verification status into master.payment_instrument or master.bank_account, or use it to satisfy a Neon readiness gate. Any retained verification label in a disclosure projection must be explicitly source-qualified and read-only, not presented as a Neon decision. Update projection consumers and UI mappings accordingly. Removing Mesh verification itself requires a separate explicit scope decision; retaining it is not permission to restore the excluded Neon verification feature.

## 9. Future instruments and withdrawn proposals

| Table/proposal | Decision |
| --- | --- |
| `master.payment_card` | FUTURE ONLY; do not create now. |
| `master.payment_wallet` | FUTURE ONLY; do not create now. |
| `master.payment_crypto_address` | FUTURE ONLY; do not create now. |
| Separate cash instrument table | NOT NEEDED; cash is a configured payment method. |
| `master.business_partner_person_identity` | WITHDRAWN; reuse master.person. |
| `master.contact_person_address_assignment` | WITHDRAWN; extend master.contact_person_role. |
| Separate provisional-bank-address table | NOT NEEDED; reuse address/address_link. |
| `control.business_partner_qualification_revision` | WITHDRAWN; shared snapshots. |
| Parallel restriction/restriction_revision family | WITHDRAWN; extend existing block authority and use shared snapshots. |
| Separate decision-scope-group table | NOT APPROVED; extend current scope representation first. |
| Qualification-specific evidence/condition table family | NOT APPROVED as a default; no new family in this table lock. |
| New purchasing/sales/settlement setup table trio | WITHDRAWN pending existing-profile field disposition. |
| New tenant instrument-enablement table | NOT APPROVED by default; assess existing configuration first. |

## 10. Source and documentation replacement rules

1. Write the final field map for each changed table: keep, move, remove; include types, nullability, tenant FKs and cardinality. The logical table lock is not a completed physical specification.
2. Change canonical DDL and MetaEntity core/operation/presentation/release bindings together. Generalize link semantics; do not perform blind text replacement of bank IDs or supplier/customer IDs.
3. Remove retired constraints, triggers, functions, indexes, grants, RLS registrations, domain values used only by removed functionality, manifest entries and create-then-drop scaffolding. Preserve shared domains used elsewhere.
4. Update active services, contracts, TS/TSX UI, fixtures, tests and generated schema/types. Delete files only if wholly obsolete; shared files require scoped edits.
5. Update current design documents and diagrams to final names. Mark historical reports/baselines as superseded; their original findings remain historical facts.
6. Validate clean DDL installation, metadata compilation, tenant/owner consistency and absence of executable references to retired objects. These checks are implementation work, not claimed completed by this document.

Final-design acceptance checks for the field map: organization/person category admission; exactly one correct subtype and tenant-consistent person linkage; person sole-proprietor capture without organization identity; no implicit workforce membership or sensitive-field access; successful atomic active-block creation with complete sealed coverage; rejection of incomplete commit, unsealing and later scope insertion/update/deletion; qualification/block header-only validity; unchanged dated-scope behavior for other decision owners. Record named BP, People/Workforce and privacy/security approvers before enabling person partners. Source-cleanup preparation may proceed under this locked design; it does not bypass these implementation and enablement gates.

## 11. Repository sources checked

Links below resolve to repository files. The audit additions have these explicit reproducible paths:

| Repository path | Claims to inspect |
| --- | --- |
| [server/db/ddl/planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql) | Partner fields, generic bank owners, house-config link and account constraints |
| [server/db/ddl/planes/neon/master/02_domains.sql](../../../server/db/ddl/planes/neon/master/02_domains.sql) | Existing sealed organization-only category and sole_proprietor legal classification |
| [server/db/ddl/planes/neon/control/02_domains.sql](../../../server/db/ddl/planes/neon/control/02_domains.sql) | Current block statuses: active/lifted/cancelled/expired, no draft |
| [server/db/ddl/planes/neon/master/05_constraints.sql](../../../server/db/ddl/planes/neon/master/05_constraints.sql) | Partner parent/identity and related foreign-key constraints |
| [server/db/ddl/common/master/03_tables.sql](../../../server/db/ddl/common/master/03_tables.sql) | Common owner-generic contact_person and contact_person_role |
| [server/db/ddl/common/master/03_platform_tables.sql](../../../server/db/ddl/common/master/03_platform_tables.sql) | Address/channel ownership and provisional bank fields |
| [server/db/ddl/planes/neon/control/03_tables.sql](../../../server/db/ddl/planes/neon/control/03_tables.sql) | Partner-based qualification, block action array and explicit decision-scope dimensions |
| [server/db/ddl/planes/neon/control/05_constraints.sql](../../../server/db/ddl/planes/neon/control/05_constraints.sql) | Tenant-consistent partner and scope-owner FKs |
| [server/db/ddl/planes/neon/control/06_indexes.sql](../../../server/db/ddl/planes/neon/control/06_indexes.sql) | Scope indexes and block-action GIN index |
| [server/db/ddl/planes/neon/control/07_functions.sql](../../../server/db/ddl/planes/neon/control/07_functions.sql) | Array action normalization/validation and block-coordinate immutability |
| [server/db/ddl/planes/neon/control/08_triggers.sql](../../../server/db/ddl/planes/neon/control/08_triggers.sql) | Control validation/guard trigger bindings |
| [server/db/ddl/planes/neon/master/06_indexes.sql](../../../server/db/ddl/planes/neon/master/06_indexes.sql) | Parent-partner lookup index |
| [server/db/ddl/planes/neon/master/08_triggers.sql](../../../server/db/ddl/planes/neon/master/08_triggers.sql) | Parent hierarchy and aliases-array guards |
| [server/db/ddl/planes/neon/master/09_views.sql](../../../server/db/ddl/planes/neon/master/09_views.sql) | Parent projection and alias-table-derived aliases |
| [server/db/ddl/planes/neon/master/11_grants.sql](../../../server/db/ddl/planes/neon/master/11_grants.sql) | Partner column grants referencing retired/moved fields |
| [server/db/ddl/planes/mesh/mesh/07_functions.sql](../../../server/db/ddl/planes/mesh/mesh/07_functions.sql) | Mesh verified/linked bank identity guard retained outside Neon cleanup |
| [server/db/ddl/planes/neon/control/18_partner_decision_contract.sql](../../../server/db/ddl/planes/neon/control/18_partner_decision_contract.sql) | Explicit classification references, coverage completeness and atomic sealed block assembly |
| [server/db/ddl/planes/neon/master/31_partner_direct_commodity.sql](../../../server/db/ddl/planes/neon/master/31_partner_direct_commodity.sql) | Required direct-UNSPSC fields and guards |
| [server/db/ddl/planes/neon/master/14_payment_instrument_integrity.sql](../../../server/db/ddl/planes/neon/master/14_payment_instrument_integrity.sql) | Shared-PK bank subtype completeness and immutable instrument identity |

Additional inventory sources:

- [Neon master tables](../../../server/db/ddl/planes/neon/master/03_tables.sql)
- [Shared named-contact tables](../../../server/db/ddl/common/master/03_tables.sql)
- [Shared address/channel tables](../../../server/db/ddl/common/master/03_platform_tables.sql)
- Bank usage file `master/15_bank_account_company_usage.sql` and its manifest entry were removed in source; the coordinated main DEV rebuild also removed the retired live usage tables.
- [Commodity classification and command tables](../../../server/db/ddl/planes/neon/master/29_partner_commodity_classification.sql)
- [Neon control tables](../../../server/db/ddl/planes/neon/control/03_tables.sql)
- [Neon document declarations](../../../server/db/ddl/planes/neon/document/03_tables.sql)
- [Neon document grants after request-scaffolding removal](../../../server/db/ddl/planes/neon/document/11_grants.sql)
- [Common cases and work items](../../../server/db/ddl/common/document/03_tables.sql)
- [Shared snapshot storage](../../../server/db/ddl/common/snapshot/03_tables.sql)
- [Neon received snapshots](../../../server/db/ddl/planes/neon/snapshot/03_tables.sql)

Outcome: two genuinely new table structures (organization identity and payment instrument), one generalized replacement (payment instrument link), existing facts reused, three explicitly excluded banking tables, one classification link retired after scope replacement, and 11 already-retired workflow declarations removed from clean-install source. Other workflow/integration records remain individually classified pending demonstrated replacement, rather than labeled duplicates merely by name.
