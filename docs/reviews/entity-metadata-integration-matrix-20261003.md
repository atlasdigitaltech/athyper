# Per-entity source integration matrix and current plan

Date: 3 October 2026. Static source inventory; effective publication and runtime behavior are unverified. Exact operation, permission, policy, ownership, scope, profile, navigation and storage declarations are recorded with source JSON pointers in [the full matrix](entity-metadata-integration-matrix-20261003.json). Null evidence is not an authorization decision.

Current scope is Entity **View and Edit modes** through the shared Entity Framework. `business_partner_request` is removed from the current plan; intake and case requests are deferred to a later phase. Its existing source, table bindings and controls remain intact. The full JSON matrix retains the original 49-entity source inventory, including pre-move paths and deferred request bindings; the [successor relocation evidence](entity-metadata-shared-domain-relocation-20261003.json) maps moved paths and preserves byte hashes; the table below covers 48 entities in the current plan.

All rows retain platform-owned Studio product-release authorship and independent Platform Owner review as the required publication model. `ownershipModel` below is the separate entity graph property. Split `plane` is not proof of all intended publication targets. The declarations below remain observed source evidence; the [current three-plane coverage decision](entity-metadata-reorganization-plan-20261003.md#three-plane-applicability-and-publication--3-october-2026) requires Neon/Mesh/Studio for all 15 shared references and all four `platform/iam/` entities, and recommends those targets for Person, Address, Address Link, Person Address Use and all three Contact entities. None is verified published by this inventory.

| Entity / source home relative to `metadata/entities/` | Graph ownership | Declared native / split planes | Storage | Placement assessment |
| --- | --- | --- | --- | --- |
| country — `common/reference/country` | not explicitly declared | studio,neon,mesh / neon | `country` | declared placement; retain module identity; target changes follow coverage decision |
| currency — `common/reference/currency` | not explicitly declared | studio,neon,mesh / neon | `currency` | declared placement; retain module identity; target changes follow coverage decision |
| language — `common/reference/language` | not explicitly declared | studio,neon,mesh / neon | `language` | declared placement; retain module identity; target changes follow coverage decision |
| locale — `common/reference/locale` | not explicitly declared | studio,neon,mesh / neon | `locale` | declared placement; retain module identity; target changes follow coverage decision |
| state_region — `common/reference/state_region` | not explicitly declared | studio,neon,mesh / neon | `state_region` | declared placement; retain module identity; target changes follow coverage decision |
| timezone — `common/reference/timezone` | not explicitly declared | studio,neon,mesh / neon | `timezone` | declared placement; retain module identity; target changes follow coverage decision |
| business_partner — `mdg/bp/business_partner` | not explicitly declared |  / neon | `master.business_partner_identity_current` | declared placement; retain module identity; target changes follow coverage decision |
| business_partner_alias — `mdg/bp/business_partner_alias` | not explicitly declared |  / neon | `master.business_partner_alias` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_bank_account_link — `mdg/bp/business_partner_bank_account_link` | not explicitly declared |  / neon | `master.payment_instrument_link` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_bank_provisional_reference — `mdg/bp/business_partner_bank_provisional_reference` | not explicitly declared |  / neon | `master.bank_provisional_reference` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_banking — `mdg/bp/business_partner_banking` | not explicitly declared |  / neon | `master.bank_account` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_commodity_classification — `mdg/bp/business_partner_commodity_classification` | not explicitly declared |  / neon | `master.business_partner_commodity_classification` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_governance_relation — `mdg/bp/business_partner_governance_relation` | not explicitly declared |  / neon | `master.business_partner_governance_relation` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_identifier — `mdg/bp/business_partner_identifier` | not explicitly declared |  / neon | `master.business_partner_identifier` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_industry_classification — `mdg/bp/business_partner_industry_classification` | not explicitly declared |  / neon | `master.business_partner_industry_classification` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_operating_organization_assignment — `mdg/bp/business_partner_operating_organization_assignment` | not explicitly declared |  / neon | `master.business_partner_operating_organization_assignment` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_qualification — `mdg/bp/business_partner_qualification` | not explicitly declared |  / neon | `control.business_partner_qualification` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_relationship — `mdg/bp/business_partner_relationship` | not explicitly declared |  / neon | `master.business_partner_relationship` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_restriction — `mdg/bp/business_partner_restriction` | not explicitly declared |  / neon | `control.business_partner_block` | referenced supporting entity; standalone navigation intent unresolved |
| business_partner_tax_registration — `mdg/bp/business_partner_tax_registration` | not explicitly declared |  / neon | `master.business_partner_tax_registration` | referenced supporting entity; standalone navigation intent unresolved |
| contact_channel — `mdg/contact/contact_channel` | not explicitly declared |  / neon | `master.contact_link` | shared Contact domain; owner-scoped business views plus authorized stewardship directories |
| contact_person — `mdg/contact/contact_person` | not explicitly declared |  / neon | `master.contact_person` | shared Contact domain; owner-scoped business views plus authorized stewardship directories |
| contact_person_role — `mdg/contact/contact_person_role` | not explicitly declared |  / neon | `master.contact_person_role` | shared Contact domain; owner-scoped business views plus authorized stewardship directories |
| customer — `mdg/bp/customer` | not explicitly declared |  / neon | `master.customer` | referenced supporting entity; standalone navigation intent unresolved |
| customer_company_profile — `mdg/bp/customer_company_profile` | not explicitly declared |  / neon | `master.company_code_customer_profile` | referenced supporting entity; standalone navigation intent unresolved |
| supplier — `mdg/bp/supplier` | not explicitly declared |  / neon | `master.supplier` | referenced supporting entity; standalone navigation intent unresolved |
| supplier_company_profile — `mdg/bp/supplier_company_profile` | not explicitly declared |  / neon | `master.company_code_supplier_profile` | referenced supporting entity; standalone navigation intent unresolved |
| address — `mdg/location/address` | system | neon / neon | `master.address` | declared placement; retain module identity; target changes follow coverage decision |
| address_link — `mdg/location/address_link` | not explicitly declared |  / neon | `master.address_link` | referenced supporting entity; standalone navigation intent unresolved |
| person_address_use — `mdg/location/person_address_use` | system | neon /  | `master.person_address_use` | declared placement; retain module identity; target changes follow coverage decision |
| bank_branch — `common/reference/bank_branch` | not explicitly declared |  / neon | `shared.bank_branch` | referenced supporting entity; standalone navigation intent unresolved |
| bank_identifier — `common/reference/bank_identifier` | not explicitly declared |  / neon | `shared.bank_identifier` | referenced supporting entity; standalone navigation intent unresolved |
| bank_institution — `common/reference/bank_institution` | not explicitly declared |  / neon | `shared.bank_institution` | referenced supporting entity; standalone navigation intent unresolved |
| certification — `mdg/reference/certification` | not explicitly declared |  / neon | `master.certification` | referenced supporting entity; standalone navigation intent unresolved |
| classification_scheme — `common/reference/classification_scheme` | not explicitly declared |  / neon | `shared.classification_scheme` | referenced supporting entity; standalone navigation intent unresolved |
| commodity_code — `common/reference/commodity_code` | not explicitly declared |  / neon | `shared.commodity_code` | referenced supporting entity; standalone navigation intent unresolved |
| commodity_crosswalk — `common/reference/commodity_crosswalk` | not explicitly declared |  / neon | `shared.commodity_crosswalk` | referenced supporting entity; standalone navigation intent unresolved |
| industry_code — `common/reference/industry_code` | not explicitly declared |  / neon | `shared.industry_code` | referenced supporting entity; standalone navigation intent unresolved |
| industry_crosswalk — `common/reference/industry_crosswalk` | not explicitly declared |  / neon | `shared.industry_crosswalk` | referenced supporting entity; standalone navigation intent unresolved |
| uom — `common/reference/uom` | not explicitly declared |  / neon | `shared.uom` | referenced supporting entity; standalone navigation intent unresolved |
| principal — `platform/iam/principal` | system | studio,neon,mesh /  | `master.principal` | required Neon/Mesh/Studio coverage; self/admin surfaces with published tenant/record scope; activation unverified |
| principal_notification_preference — `platform/iam/principal_notification_preference` | system | studio,neon,mesh /  | `master.principal_notification_preference` | required Neon/Mesh/Studio coverage; self/admin surfaces with published tenant/record scope; activation unverified |
| principal_profile — `platform/iam/principal_profile` | system | studio,neon,mesh /  | `master.principal_profile` | required Neon/Mesh/Studio coverage; self/admin surfaces with published tenant/record scope; activation unverified |
| principal_ui_profile — `platform/iam/principal_ui_profile` | system | studio,neon,mesh /  | `master.principal_ui_profile` | required Neon/Mesh/Studio coverage; self/admin surfaces with published tenant/record scope; activation unverified |
| employee — `ppl/workforce/employee` | system | neon /  | `master.employee` | declared placement; retain module identity; target changes follow coverage decision |
| external_worker — `ppl/workforce/external_worker` | system | neon /  | `master.external_worker` | declared placement; retain module identity; target changes follow coverage decision |
| person — `ppl/workforce/person` | system | neon /  | `master.person` | declared placement; retain module identity; target changes follow coverage decision |
| workforce — `ppl/workforce/workforce` | not explicitly declared |  / neon | `master.employee` | referenced supporting entity; standalone navigation intent unresolved |

A missing placement is not repaired by copying Principal. Relationship-backed entities still need an explicit decision about standalone exposure. Contact exposure is explicitly proposed below; other unresolved rows require owning-domain intent before adding or removing navigation. No entity is designated exclusively embedded-only from absence alone.

## Shared Contact domain recommendation

Contact belongs to shared MDG business functionality under `mdg/contact/`, reusable by Business Partner and other eligible entities. Shared functionality does not make contacts global reference data like Country, or automatically share a contact record between owners. A contact person is an owner-scoped business contact, distinct from an HR person or login identity.

| Entity | Recommended source home relative to `metadata/entities/` | Proposed exposure and readable presentation |
| --- | --- | --- |
| `contact_channel` | `mdg/contact/contact_channel` | Owner-scoped embedded list for eligible entities, including named contacts; explicitly declared channel value/type labels |
| `contact_person` | `mdg/contact/contact_person` | Owner-scoped Contacts list with standard Entity detail navigation; explicitly declared contact name |
| `contact_person_role` | `mdg/contact/contact_person_role` | Embedded Responsibilities list under a contact person; explicitly declared responsibility label |

Business users reach contacts through explicitly bound owner-scoped views; authorized key users also use Data Stewardship directories through the standard Entity Framework. Independent directories require exact published access bindings and tenant/record scope. Keep existing tables and entity codes. Neon-only source declarations are a baseline; the current recommendation is availability in Neon, Mesh and Studio, subject to per-target provider, dependency, authorization and governed-publication gates. The Contact source relocation is implemented; owner-binding, operation and presentation corrections remain pending.

The [database model](../../server/db/ddl/common/master/03_tables.sql) declares polymorphic owners for contact persons and roles belonging to contact persons. Two metadata gaps must be resolved through governed, published bindings and registered capability contracts:

- [Contact Channel core](../../metadata/entities/mdg/contact/contact_channel/core.json): `/ownerBinding/kind` is `polymorphic`, but `/ownerBinding/targetEntityCode` fixes the target to `contact_person`. General reuse needs validated owner bindings for eligible owners.
- [Contact Person operations](../../metadata/entities/mdg/contact/contact_person/operation.json): `request_change` binds to `neon.bp.governed-request.create.v1` and `business_partner_request`. Declare supported View/Edit operation bindings for each eligible owner; do not treat this request operation as direct Edit support. Intake and case-request integration are later work. Preserve existing governed controls while resolving the Edit contract.

Reuse shared Entity lists, detail navigation and editing controls. Enforce tenant isolation, authorized parent admission and locked owner scope on the server for reads and writes. Resolve exact permissions and policy bindings from published metadata; reject unsupported or invalid bindings. Shared presentation validation must reject UUID labels and columns, including saved views and embedded lists, rather than inventing fallback identities.

This is a documentation and planning update based on source evidence. The Contact source relocation is complete; metadata/View/Edit corrections remain pending. Publication and runtime behavior remain unverified; no runtime support is claimed.

The nine former `mdg/reference/` lookup entities now live under `common/reference/`; `certification` remains at `mdg/reference/certification`. This shared source organization does not change storage schemas, module ownership, exact authorization, navigation or publication targets. Historical inventories retain their original paths.


## Three-plane review follow-up

Use the [26-entity coverage table and publication gate](entity-metadata-reorganization-plan-20261003.md#three-plane-applicability-and-publication--3-october-2026) as the current target proposal. It explicitly enumerates all 15 references, four common IAM entities and seven shared business entities without overwriting observed declarations above. Six references and all four IAM entities have native three-plane targets; nine references and all seven business entities need target reconciliation. Publication receipts and live behavior remain unverified for all.

The shared table-product compiler currently rewrites plane-prefixed permission codes and storage coordinates when targeting another plane. Explicit per-target governed permission bindings and verified storage/provider contracts must precede expansion; generated code names are not authorization evidence. Address/Contact operation and owner gaps remain blockers for their affected surfaces. Employee/External Worker/BP coverage is not implicitly expanded, and shared business records are not globally replicated by this plan.


## Common IAM coverage — required in all three planes

| Source home | Entity | Required publication targets | Observed native targets | Publication status |
| --- | --- | --- | --- | --- |
| `platform/iam/` | `principal` | Neon, Mesh, Studio | Neon, Mesh, Studio | Activation and runtime unverified |
| `platform/iam/` | `principal_profile` | Neon, Mesh, Studio | Neon, Mesh, Studio | Activation and runtime unverified |
| `platform/iam/` | `principal_ui_profile` | Neon, Mesh, Studio | Neon, Mesh, Studio | Activation and runtime unverified |
| `platform/iam/` | `principal_notification_preference` | Neon, Mesh, Studio | Neon, Mesh, Studio | Activation and runtime unverified |

These are common platform entities with one source home each. Three-plane availability is required, not an optional expansion. Preserve server-resolved My Account self scope and separately authorized administrative Principal/child surfaces in every plane. Enforce exact published operation permissions, tenant isolation and locked relationship scope. Availability does not authorize cross-tenant access, automatic data replication, or an Employee dependency for every Principal.

Include all 12 IAM entity/plane combinations in the publication evidence gate, alongside 45 required reference combinations (57 required total). The seven recommended Person/Address/Contact entities add 21 combinations if adopted. Native target declarations alone do not prove storage/provider readiness, reviewed activation or working user flows. No source metadata, permissions, MFA or active releases changed in this documentation update.


## Successor exposure matrix — next activity completed

The [successor surface proposal](entity-metadata-surface-proposal-20261003.json) records one row per proposed entity/surface, backed by current source pointers and SHA-256 hashes. It covers all 48 current-scope entities plus the preserved deferred request entity. All 202 source files match the frozen source inventory after resolving current homes. Historical evidence remains unchanged. This is a review artifact, never an alternate discovery registry or metadata input.

Each JSON surface row records audience, exposure mode, intended owner, scope, proposed navigation, observed identity/columns/navigation/relationships/providers/operations/authorization, target planes, release-evidence status and gaps. Exact successor permissions and final navigation order remain explicitly unresolved where the contracts or owner decisions are missing. No absence is converted into an authorization allow. Existing operations are evidence, not proof that each proposed surface supports Edit.

The table below indexes the individual surface rows. `Required ×3` means Neon/Mesh/Studio coverage; `Recommended ×3` remains the Person/Address/Contact recommendation; `Existing` preserves the current declared scope. Existing source identity and navigation are captured in JSON without choosing display fields or inventing section order.

| Entity | Proposed surfaces (individual JSON rows) | Plane decision |
| --- | --- | --- |
| `address` | `directory`, `parent_business_partner`, `parent_employee`, `parent_external_worker` | Recommended ×3 |
| `address_link` | `parent`, `stewardship_relationship` | Recommended ×3 |
| `bank_branch` | `directory`, `lookup` | Required ×3 |
| `bank_identifier` | `directory`, `lookup` | Required ×3 |
| `bank_institution` | `directory`, `lookup` | Required ×3 |
| `business_partner` | `directory` | Existing |
| `business_partner_alias` | `parent` | Existing |
| `business_partner_bank_account_link` | `parent` | Existing |
| `business_partner_bank_provisional_reference` | `parent` | Existing |
| `business_partner_banking` | `parent` | Existing |
| `business_partner_commodity_classification` | `parent` | Existing |
| `business_partner_governance_relation` | `parent` | Existing |
| `business_partner_identifier` | `parent` | Existing |
| `business_partner_industry_classification` | `parent` | Existing |
| `business_partner_operating_organization_assignment` | `parent` | Existing |
| `business_partner_qualification` | `parent` | Existing |
| `business_partner_relationship` | `parent` | Existing |
| `business_partner_request` | `deferred` | Deferred |
| `business_partner_restriction` | `parent` | Existing |
| `business_partner_tax_registration` | `parent` | Existing |
| `certification` | `unresolved` | Existing |
| `classification_scheme` | `directory`, `lookup` | Required ×3 |
| `commodity_code` | `directory`, `lookup` | Required ×3 |
| `commodity_crosswalk` | `directory`, `lookup` | Required ×3 |
| `contact_channel` | `directory`, `parent_business_partner`, `parent_employee`, `parent_external_worker`, `parent_contact_person` | Recommended ×3 |
| `contact_person` | `directory`, `parent_business_partner`, `parent_employee`, `parent_external_worker` | Recommended ×3 |
| `contact_person_role` | `directory`, `parent_contact_person` | Recommended ×3 |
| `country` | `directory`, `lookup` | Required ×3 |
| `currency` | `directory`, `lookup` | Required ×3 |
| `customer` | `parent` | Existing |
| `customer_company_profile` | `parent` | Existing |
| `employee` | `directory` | Existing |
| `external_worker` | `directory` | Existing |
| `industry_code` | `directory`, `lookup` | Required ×3 |
| `industry_crosswalk` | `directory`, `lookup` | Required ×3 |
| `language` | `directory`, `lookup` | Required ×3 |
| `locale` | `directory`, `lookup` | Required ×3 |
| `person` | `directory`, `parent_employee`, `parent_external_worker` | Recommended ×3 |
| `person_address_use` | `parent`, `stewardship_relationship` | Recommended ×3 |
| `principal` | `self`, `administration` | Required ×3 |
| `principal_notification_preference` | `self`, `administration` | Required ×3 |
| `principal_profile` | `self`, `administration` | Required ×3 |
| `principal_ui_profile` | `self`, `administration` | Required ×3 |
| `state_region` | `directory`, `lookup` | Required ×3 |
| `supplier` | `parent` | Existing |
| `supplier_company_profile` | `parent` | Existing |
| `timezone` | `directory`, `lookup` | Required ×3 |
| `uom` | `directory`, `lookup` | Required ×3 |
| `workforce` | `unresolved` | Existing |

### Review conclusions and next implementation boundary

- Reference directories and lookup surfaces are distinct. Nine split-only references still need supported multi-target authoring/release membership; the six native references need explicit permission reconciliation and actual delivery evidence.
- IAM has separate self and administrative surfaces for each of its four entities. Existing three-plane declarations do not prove either surface's effective access or publication.
- Person/Address/Contact have independent stewardship and parent-scoped proposals. Address Link and Person Address Use are relationship surfaces under authorized records, not newly proposed raw standalone directories. Contact Person Role retains Contact Person as its intended parent.
- Employee and External Worker remain peers. Their Person links and other proposed shared-record views require exact relationship validation. Person navigation currently references Employee/External Worker; Mesh/Studio publication must resolve these dependencies explicitly without silently expanding workforce targets or hiding invalid bindings.
- Every BP child and Customer/Supplier surface is accounted for. Parent read is a proposal for scoped viewing, not implemented permission inheritance. Company profiles also need explicit company scope. Field reveal and capability management stay distinct.
- Workforce projection and Certification remain explicit unresolved rows. The BP request source is preserved as deferred, including all current governed-operation dependencies.

The [exact before/after permission ledger and shared-contract design](entity-metadata-reconciliation-20261003.md#exact-permission-ledger-and-shared-contract-design--3-october-2026) is now recorded, starting with explicit reference permissions and table-product target bindings. This matrix captures existing authorization declarations but deliberately leaves unresolved successor bindings unselected. Address's competing reads and Contact's owner/request gaps must be resolved before dependent metadata edits. Existing permissions and MFA controls remain unchanged.

The publication tracker contains 57 required and 21 recommended entity/plane rows, each with explicit pending release, review, provider, activation and runtime evidence. No publication or runtime completion is claimed. Validation for this activity is limited to offline source hashes, JSON pointers, inventory counts and document links/whitespace; no tests, builds, database actions or runtime probes ran.


## Permission ledger handoff

The [exact permission ledger](entity-metadata-permission-ledger-20261003.json) records 248 source permission-property occurrences, all 83 proposed surface transitions, 90 reference list/read target rows and nine explicit collaboration migration pairs. It preserves four existing MFA properties. Source/profile/compiler observations remain distinct from active permissions. Unresolved targets are not permission omissions or access grants.

See the [shared-contract design](entity-metadata-reconciliation-20261003.md#exact-permission-ledger-and-shared-contract-design--3-october-2026) for reusable integration points, self/parent/directory boundaries, exact plane bindings, migration ordering and acceptance criteria. No source bindings or runtime behavior changed. Next is implementation of the shared contract changes, preserving current permission semantics before any governed migration.
