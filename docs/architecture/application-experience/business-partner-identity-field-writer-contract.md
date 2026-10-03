# Business Partner identity — field and writer contract

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Status: organization/person identity DDL, category-safe readers and metadata are deployed to the same main DEV instance in the 2026-09-25 coordinated build. Both synthetic categories pass signed-in Identity browser checks and the signed-in API registration workflow through independent approval, materialization and idempotent retry. Person linking reuses People-owned records; only the explicit minimal person-name permission is granted to DEV demo administrators. Remaining collection capture work is not complete. See the [facts implementation checkpoint](business-partner-facts-ddl-metaentity-plan.md#implementation-checkpoint--2026-09-25). This contract does not approve unrelated live grants or reinterpret old approved payloads.

## 1. Physical field ownership

All references are tenant-consistent unless explicitly shared. No duplicate person table, subtype lifecycle, subtype version family or independent editable legal-name cache is introduced.

### Common header: master.business_partner

| Fields | Type / nullability and target write rule |
| --- | --- |
| id, tenant_id | UUID, required; server-owned identity and tenant, immutable |
| code | text, required; retain current format and tenant case-insensitive uniqueness; normal create uses existing numbering, authorized import may supply a validated code; immutable after creation |
| name | text, required, trimmed nonblank, maximum 320; **display label**, not authoritative organization legal name or person name. New organization creation defaults it from legal_name if omitted; subsequent legal-name changes do not silently overwrite an explicitly stored display label |
| partner_category | required organization/person; immutable after creation. Replace sealed organization-only domain/check and comments; category correction is not a generic edit |
| person_id | nullable UUID; required for person, forbidden for organization; composite tenant/person FK, ON DELETE RESTRICT. Initial contract permits linking an existing authorized person only; creating/updating person details remains with People services. Relinking is rejected by ordinary identity edits |
| ownership_class | required external/internal, existing default external; preserve current internal-partner restrictions, no inference from commercial role |
| legal_classification | nullable existing domain, retained here. Organization: government/nonprofit/NULL. Person: sole_proprietor/NULL. This explicitly supersedes the earlier dual-category sole_proprietor allowance. NULL means unspecified |
| canonical_party_id, representation_purpose_code | preserve current identity-linking authority, nullable UUID and required purpose text/default. Retain live canonical-party/purpose uniqueness. Not general form fields and not substitutes for person_id |
| website_url, description | nullable text; retain existing HTTPS/length rules and description maximum 4000 |
| metadata | required JSON object with existing size/key allowlist; no fallback storage for moved organization fields or person PII |
| status, is_active | preserve existing lifecycle states/default and generated is_active; no client-supplied activation or independent subtype status |
| category_locked_at/by, record_version | existing required server-managed fields; retain category lock and positive aggregate version |
| status_changed_at/by, created_at/by, updated_at/by | preserve current types, nullability, actor references and paired-field constraints; server-owned |
| aliases, parent_business_partner_id | remove physical header fields after dependent behavior is replaced. Aliases derive from business_partner_alias; parent relationships use business_partner_relationship, preserving hierarchy type, cycle/tenant constraints and existing cardinality meaning |

Person cardinality is fixed as one non-archived partner per `(tenant_id, person_id, representation_purpose_code)`, enforced by `business_partner_live_person_purpose_uq`. A duplicate default representation conflicts; a separately authorized distinct purpose can coexist. There is no global UNIQUE(person_id). Existing canonical-party/representation uniqueness is retained; names never determine identity. The initial registration form uses the default purpose and does not grant purpose-change authority.

### Organization subtype: master.business_partner_organization_identity

| Fields | Type / nullability and target write rule |
| --- | --- |
| business_partner_id | UUID primary key; exactly one organization identity per partner, no independent generated identity |
| tenant_id | required UUID; composite FK to business_partner(tenant_id,id), ON DELETE RESTRICT, plus unique (tenant_id,business_partner_id) for tenant-consistent references |
| legal_name | required text, trimmed nonblank, maximum 320; organization legal-name authority |
| registration_country_code | nullable character(2); preserve country reference and uppercase format, not person nationality/residence |
| incorporation_date | nullable date; retain existing date semantics, no inference from founded_year |
| legal_form_value_id | nullable UUID, controlled master.legal_form lookup; validate domain, active status and tenant/shared admissibility on selection |
| business_type_value_id | nullable UUID, controlled master.business_type lookup; preserve the same admissibility checks |
| founded_year | nullable smallint; retain 1–9999 and no-future-year validation |
| employee_count, employee_count_as_of, employee_count_scope | nullable integer/date/text; all absent or all present, count >= 0, date not future, scope organization/consolidated_group |
| created_at/by, updated_at/by | server-managed timestamps/actors; created pair required, updated pair jointly nullable. No independently editable record_version or status |

The six controlled/profile fields formerly added by `18_business_partner_business_profile.sql` now live with legal form, registration country and incorporation date in [33_partner_organization_identity.sql](../../../server/db/ddl/planes/neon/master/33_partner_organization_identity.sql). The obsolete header-extension file and its manifest entry are removed. `master.business_partner_identity_current` is a tenant-secured compatibility read projection, not duplicate storage; `master.update_business_partner_organization_identity` is the shared patch boundary. Existing inactive lookup selections remain readable and can be retained; new selections must be active and admissible.

Legal-form refinement: retain **one stored legal-form authority**, legal_form_value_id, on the subtype. Legacy legal_form text becomes a derived lookup code in compatibility projections, not a second stored field. A legacy code input must resolve to an active admissible lookup; unknown/ambiguous or code/ID mismatch fails. This refines the addendum's shorthand “move legal_form.” Preserve historical snapshots as captured; do not normalize them in place. Deactivating a lookup does not erase an existing classification; reads can display its historical code while new selections require active entries.

### Person identity

master.person retains its current schema and ownership. Its code/name/first_name/last_name are currently required; partner APIs must not fabricate these to satisfy a foreign key. Existing sensitive profiles, primary contact fields and workforce records are not implicitly copied into partner payloads. The partner display label is separately captured; permitted person-detail projection requires People authorization, not merely permission to view the partner. Person data changes do not automatically mutate partner display labels.

## 2. Aggregate invariants and mutation semantics

1. Create header and organization subtype in one transaction, or header and authorized existing person reference. Deferred checks on parent and subtype reject missing, extra or wrong-category subtype rows at commit. Tenant mismatch fails even if UUIDs exist elsewhere.
2. Commands lock the header and compare expected record_version before changing either header or subtype. A subtype mutation advances the same aggregate version; replay must not repeat writes. Consolidate header updates to avoid separate uncoordinated subtype/version bumps. Independent People changes use People versioning; do not pretend BP version pins mutable person details.
3. Missing property means unchanged for patch operations; explicit null clears only nullable fields. Reject null legal_name/name and unknown fields. Import replace must not silently erase omitted identity fields or imply role/setup deletion: require a complete, versioned replacement contract or reject that mode for identity.
4. Tenant, actors, version, lifecycle, category lock and canonical-party associations are not client-editable identity fields. Existing lifecycle and duplicate-resolution authorities remain responsible for their own mutations.
5. Generic writes remain disabled. Internal, external, import and Mesh entry points must call the same category/subtype validation and transaction boundary; they may retain distinct orchestration/approval policies. This does not introduce a new workflow or evidence table.
6. Header and subtype must be included coherently in the existing snapshot/result projection. Existing command retry, approval pinning and rollback semantics survive the storage split. Stale expected versions fail without partial writes.

## 3. Writer inventory and required cutover

Repository findings below identify concrete source paths, not a claim that every branch is reachable in DEV. Search for raw SQL, query-builder writes, dynamic SQL and registered generic adapters again as a storage-cutover gate.

| Current writer / source | Observed behavior | Required target contract |
| --- | --- | --- |
| master.command_materialize_internal_business_partner_case in [master functions](../../../server/db/ddl/planes/neon/master/07_functions.sql) | Creates organization header with legal-form/country/date fields, then lifecycle/snapshot result | Atomic header/subtype; preserve internal ownership and canonical identity behavior |
| master.command_materialize_business_partner_role_case in same file | Shared role-free registration and supplier/customer creation path; insert hardcodes organization and stores legal fields on header | Branch by validated category; create subtype/person reference. Core registration must create no role, organization assignment or company setup; explicit commercial branches retain their own controls |
| master.command_materialize_business_partner_change_case in same file | Child activation, lifecycle and version changes | Retain child/lifecycle semantics; use aggregate lock/version contract; do not treat it as a generic legal-name writer without implementing that branch |
| master.command_materialize_mesh_profile_change_case in same file | Resolves six approved source/local choices; currently maps legalName to header name and updates legal fields there | LegalName → subtype legal_name, not display label. Preserve pinned baseline/incoming choice checks and target version; website/description remain header fields |
| master.trg_refresh_business_partner_alias_cache in same file | Writes header aliases cache | Remove with physical array and guard; preserve alias-table reads/search behavior |
| control.command_business_partner_lifecycle in [control functions](../../../server/db/ddl/planes/neon/control/07_functions.sql) | Changes header status | Remains lifecycle-only; subtype must remain valid; no cascade workforce activation |
| document.fn_resolve_business_partner_duplicate in [document functions](../../../server/db/ddl/planes/neon/document/07_functions.sql) | Archives duplicate header | Preserve duplicate resolution/tenant checks; do not delete person or shared identity data |
| createNeonBusinessPartnerImportAdapter in business-partner-import.ts | Requires operating org, defaults role to supplier, directly creates/updates header, creates role and org assignment; delete archives assignment | **Not the role-free identity writer.** Separate identity import semantics from commercial setup. No implicit supplier or organization assignment in identity import; retain/rebind existing commercial consumer explicitly or gate it. Correct legacy category normalization and use shared subtype/version rules |
| Development fixtures and server/db/scripts provisioning/integration/360 fixtures | Direct inserts and updates, including organization profile fields | Update executable fixture writers to build complete aggregates. No production grant bypass copied from privileged fixture setup |
| tooling/scripts/verification and disposable SQL fixtures | Direct synthetic header inserts; some mock schemas intentionally minimal | Update real-schema fixtures; distinguish mock-only tests from actual DDL acceptance |
| server/db/seed-backup | Historical raw inserts/repairs | Historical archive, not executable baseline cleanup; do not rewrite as if applied migration history |

Runtime dispatch is in kysely-business-partner-case-repository.ts. Its amend_partner branch currently dispatches childActivation to the change materializer and other amendments to the Mesh profile-change materializer. Therefore a general local identity amendment is **not established by the presence of request_change metadata**: implement an explicit local amendment path or keep that action gated. Do not send local edits through Mesh-only resolution checks.

## 4. Read, metadata and permission contract

| Consumer | Required alignment |
| --- | --- |
| [business_partner/core.json](../../../metadata/entities/mdg/bp/business_partner/core.json) | Keep common fields bound to header; move organization field bindings to subtype metadata/projection. Preserve genericWriteEnabled=false. No references to dropped header columns |
| [Identity presentation](../../../metadata/entities/mdg/bp/business_partner/presentation.section.identity.json) and overview | Conditional organization/person fieldsets. Label header name “Display name” and subtype legal_name “Legal name”; person must not render organization fields |
| Common section reader | Current organization-only filter, flat legal fields and parent join must change together; aliases already derive from alias rows |
| 360 repository | Core/summary reads still select registration_country_code from header; use coherent subtype projection, not a dangling column |
| Provider projection | Explicitly allow only authorized common/subtype fields; never use a broad person join/SELECT * to feed the generic field renderer |
| Case repository and Mesh comparisons | Rebuild old/current values and result snapshots from aggregate projection. Versioned old payload adapters must distinguish old name-as-legal-name from new display label; never reinterpret signed/approved old payloads silently |
| [Operations](../../../metadata/entities/mdg/bp/business_partner/operation.json) | Keep existing read and request_change IDs tied to verified consumers. New field projection is not an authorization grant |

Current permission anchors: neon.relationship.business_partner.read for the parent; neon.relationship.business_partner_identity.read for identity; neon.relationship.business_partner_amend.create for the existing change entry; role-free registration uses neon.business_partner_registration.* via casePermission. These are observed source bindings, not proof of every live scope/assurance check. Read/author/decide/materialize remain separate responsibilities.

Target scope is tenant + persisted partner for identity facts, not mandatory supplier/customer/org/company membership. Preserve scoped grant semantics: do not widen organization-only assignments into tenant-wide authority. Where current resolvers cannot enforce the target contract, gate the operation until corrected. Person linking must separately verify authorized People selection and tenant consistency without disclosing whether a forbidden person exists. No exact new person permission code is invented here; reuse only a verified People consumer mapping and obtain the required ownership/privacy acceptance before enablement.

## 5. Payload compatibility

The new identity payload is discriminated by partnerCategory, with common displayName and either organizationIdentity (legalName plus optional organization fields) or personId. Organization payloads cannot contain personId; person payloads cannot contain organizationIdentity. Storage still uses header name for displayName. Unknown/wrong-subtype fields are rejected, not hidden in metadata.

Compatibility adapters may accept old organization name/legalForm/registrationCountryCode/incorporationDate payloads only under their pinned old contract: old name initializes both display and legal name on creation; old legalName amendments change only legal name under the new contract. Preserve the exact historical snapshot shape/hash for old decisions; new materialization must explicitly support that version or fail with a contract-version error. Imports and Mesh source values undergo the same validation and lookup normalization. A failed retry never creates a second subtype or person association.

## 6. Required acceptance before storage cutover

- Organization create: one header/subtype, role-free, coherent result/snapshot; legal form resolves to one admissible lookup.
- Person create: existing authorized same-tenant person only, no organization subtype, no workforce membership or sensitive profile disclosure; sole proprietor supported.
- Reject wrong/both/missing subtype, cross-tenant reference, immutable category/person relink, invalid lookup, future business-profile dates and incomplete employee-count tuple.
- Separate display label and legal name; partial update preserves absent fields and clears explicit nullable values; legacy and new contract behavior tested separately.
- Concurrent subtype/header edit rejects stale version; forced failure between writes rolls back all changes; identical idempotent replay creates no duplicates.
- Internal, core-registration, explicit commercial, local amendment, Mesh amendment and import paths tested independently. Local amendment remains gated until its actual non-Mesh writer exists.
- Alias/parent search, view, grant and hierarchy behavior preserved without old physical cache/pointer columns.
- Unauthorized parent/identity/person reads and direct API/bulk alternatives denied; company-scoped grants not implicitly broadened.
- Metadata compile has no removed-column bindings; clean DDL installs include subtype checks, triggers, indexes, grants and conditional presentation together.

Implementation readiness is conditional on these tests and verified consumer mappings, not satisfied by this document. Organization source cutover is recorded in the [coordinated implementation plan](business-partner-coordinated-implementation.md). Full clean-build completion, publication and end-to-end writer acceptance remain release gates. Person enablement, local identity amendment and role-free import are not enabled by this patch.
