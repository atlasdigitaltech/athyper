# Stored-scope authorization inventory — before migration

## Migration checkpoint

The legacy adapter and its dedicated SQL tests are now removed. Host case scope
fallback selects createEntityScopeRegistry(profile, entityScopeBindings). It matches
plane/entity/operation/resolver/target exactly; missing bindings return invalid scope
and workflow_blocked preflight. Explicit owning-service scopes remain supported.
No generic persisted-ownership adapter has been invented: callers must supply one,
so previously implicit case scope behavior is unavailable until properly registered.
Four registry tests pass (selection, missing/mismatched bindings, failure propagation,
duplicates). These are NOT equivalent coverage of a future persistence implementation.

The BP assignment and workforce capability-parent branches were subsequently
replaced by explicit entityParentScopeBindings. Missing bindings deny. Scalar-row
ownership has a concrete generic SQL provider; BP assignment, workforce employment
and case snapshot ownership are not silently mapped to that provider.
Studio BP definition/case-contract route registrations and bootstrap services were
removed, while generic authoring/publication/release-review remains. The definition
authorizer was subsequently replaced by the generic revision authorizer with
explicit taskPolicyPermissions. See generic-ownership-bindings.md for limitations.
Preflight source and BP metadata definitions remain unchanged.

The inventory below describes pre-migration behavior for future implementation.

This inventory records current host behavior, not permission grants to introduce.
No branch below may be deleted in favor of a permissive default. Permission codes
in published profiles remain exact inputs; names do not imply permissions.

## Consumers

- register-services.ts: caseScopes constructs createBusinessPartnerStoredScopes
  for entityCaseBackendAuthorization when explicit scopes are absent.
- entity-case-backend-mapping.ts: owns Neon entity_case requests; selects exact
  profile operation/permission pairs, including proposed reassignment.
- Generic entityBackends already accepts explicit scope adapters. It must retain
  signed/reviewed profile checks and exact handler/resolver qualification.
- business-partner-stored-scopes.test.ts directly exercises the legacy adapter.
- register-services.ts authorizeCapabilityParent has an additional BP assignment
  branch used by comments, attachments and participant admission. This is separate
  from the caseScopes adapter and must not be accidentally removed with it.

## Legacy stored-scope branches

All branches reject non-Neon planes and unknown entity codes. Reads use a
repeatable-read, read-only transaction, 1500ms timeout, tenant/principal stamping,
and tenant predicates. Invalid/missing records or coordinates return state=invalid.

| Entity / target | Persisted source / coordinates | Scope and permission boundary |
| --- | --- | --- |
| business_partner / existing | master.business_partner tenant/id existence | tenant.record.v1 clears caller coordinates; other supported scopes still require catalog validation |
| business_partner / existing with organization | active/effective business_partner_operating_organization_assignment | requested organization must be assigned to this record; no assignment means invalid |
| entity_case / existing | document.entity_case plus current immutable snapshot, restricted to master.business_partner | persisted operatingOrganizationId required; optional companyCodeId; only organization.record.v1 or organization-company.record.v1 |
| company setup case / existing | document.entity_case restricted to master.business_partner_company_setup_request; owner_company_code_id must equal snapshot companyCodeId | company.record.v1 only; company comes from persisted owner, never parent BP or caller selection |
| company setup case / proposed | caller organization/company selections, validated against catalog | requires both creation coordinates although ownership resolver is company.record.v1 |
| all admitted entities / proposed or collection | resolver-selected caller coordinates, checked against active catalog | tenant: none; organization: operatingOrganizationId; company: companyCodeId; organization-company: both |
| all branches with organization | active master.operating_organization in tenant | inactive/missing organization is invalid |
| all branches with company | active/is_active master.company_code in tenant | inactive/missing company is invalid |
| all branches with both coordinates | active/effective operating_organization_company_assignment in tenant | invalid catalog linkage is denied |

The adapter does not grant a permission. The backend requires exact published
operation.permissionCode, ownership resolver and applicable source/target checks.
The current entity-case mapping infers a fallback operation key from a permission
suffix; replace this with explicit operation metadata, not a new suffix convention.
Case preflight remains a separate evidence-policy decision; no adapter may return
allowed/not_applicable merely because its evidence owner is unavailable.

## Adjacent capability-parent admission

After metadata/Records authorizes the parent read, the BP branch loads effective
organization assignments. It returns organization scope resources plus tenant scope
only when descriptor.directoryScope.mode is tenant; empty candidates deny.
The capability policy independently checks each published action permission.
Replacing this with plain true would lose organization-scoped admission.

The other explicit entity branch is workforce on Neon: master.employee joined to
nonarchived master.employment by tenant/employee loads company_code_id. No rows
denies; every company must pass neon.workforce.read with tenantId, employeeId and
companyCodeId. It returns company scope resources. Other entities use descriptor
read metadata and an authorized Records list constrained to the exact record ID.
Neither this workforce branch nor the BP assignment branch has been removed.

## Studio publication boundary

createBusinessPartnerDefinitionAuthorizer accepts the exact Studio definition
read/author permissions. Publish requires revisionId, tenant-scoped revision lookup
and createdBy different from the actor, with sodSatisfied evidence. Missing revision,
unknown permission or maker-as-publisher denies. Generic replacement must preserve
these checks with declared operation bindings, not merely rename permission strings.

## Migration gate

Select trusted resolver implementations via published resolver keys with explicit
entity/plane/operation binding and stored-ownership ports. Unknown or absent bindings
return invalid/unavailable; never reuse caller coordinates as persisted ownership.
Implement and test tenant isolation, record existence, stale/inactive assignments,
company independence and parent admission before switching the corresponding branch.

Preflight reader remains outside this migration until evaluation receipts,
contract-to-release pins and unassigned-task policy are resolved by governance.
No BP definitions, DDL, permission catalog or runtime data changed for this inventory.
