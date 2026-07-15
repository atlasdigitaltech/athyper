# Operating Organization RBAC and Login Design

**Status:** LOCKED for implementation planning  
**Scope:** Neon tenant database, Neon Web session/context handling, Athyper IAM/RBAC, and Keycloak `neon-web` configuration  
**Domains:** Procurement and Sales  

## 1. Decision

Athyper will introduce a tenant-owned **Operating Organization** as the common
cross-company orchestration boundary for procurement and sales.

The canonical hierarchy is:

```text
Tenant
|- Legal Entity hierarchy
|  |- Legal Entity A
|  |  |- Company Code A1
|  |  `- Company Code A2
|  `- Legal Entity B
|     `- Company Code B1
|
`- Operating Organizations
   |- Procurement
   |  |- Group Strategic Sourcing
   |  `- Regional Procurement APAC
   `- Sales
      |- Group Enterprise Sales
      `- Regional Sales APAC
```

Operating Organizations own cross-company orchestration. Company Codes retain
legal, transactional, financial, and accounting ownership.

Keycloak authenticates a principal and grants coarse access to Neon. It does
not own Operating Organizations, company memberships, procurement roles, sales
roles, or business permissions.

## 2. Locked invariants

1. Every Operating Organization belongs to exactly one tenant.
2. An Operating Organization has one domain: `procurement` or `sales`.
3. Company membership is explicit, tenant-safe, effective-dated, and auditable.
4. A Company Code may belong to more than one Operating Organization.
5. Legal Entity coverage is derived from Company Code membership.
6. Operating Organization hierarchy does not imply permission inheritance in v1.
7. RBAC assignments reference the generic `operating_organization` scope.
8. Permission policy decides whether an Operating Organization permission may
   expand to member companies.
9. Missing permission-scope policy denies access.
10. Active work context constrains authorization; it never grants authorization.
11. Procurement context cannot grant sales or financial capabilities.
12. Sales context cannot grant procurement or financial capabilities.
13. Every financial mutation validates its authoritative Company Code.
14. Procurement awards and sales quotations may orchestrate multiple companies,
    but resulting commitments split by legal owner unless an explicit central
    buyer or principal seller model applies.
15. Operating Organizations are never represented as Keycloak organizations.

## 3. Schema workstream

### 3.1 New canonical DDL file

Create:

```text
server/db/ddl/master/01u_tables_operating_organization.sql
```

It owns:

```text
master.operating_organization
master.operating_organization_company
master.procurement_organization_profile
master.sales_organization_profile
```

### 3.2 `master.operating_organization`

Required columns:

| Column | Contract |
|---|---|
| `id` | UUIDv7 primary key |
| `tenant_id` | Mandatory tenant boundary |
| `domain` | `procurement` or `sales` |
| `code` | Stable tenant/domain-local code |
| `name`, `display_name`, `description` | User-facing identity |
| `parent_id` | Optional same-tenant hierarchy |
| `effective_from`, `effective_until` | Business validity |
| `scope_version` | Monotonic authorization-cache version |
| `metadata` | Object-only extension payload |
| `status` | `draft`, `active`, `suspended`, `archived` |
| audit columns | Standard Athyper audit contract |

Uniqueness:

```text
(tenant_id, id)
(tenant_id, domain, code)
```

The table must reject self-parenting, cross-tenant parents, invalid effective
date ranges, empty codes/names, and hierarchy cycles.

### 3.3 `master.operating_organization_company`

Required columns:

| Column | Contract |
|---|---|
| `id` | UUIDv7 primary key |
| `tenant_id` | Mandatory tenant boundary |
| `operating_organization_id` | Parent Operating Organization |
| `company_code_id` | Participating Company Code |
| `participation_role` | Domain-specific membership role |
| `effective_from`, `effective_until` | Membership validity |
| `status` | `active`, `suspended`, `revoked`, `expired` |
| `metadata` | Object-only extension payload |
| audit columns | Standard Athyper audit contract |

Uniqueness:

```text
(tenant_id, operating_organization_id, company_code_id)
```

All foreign keys use tenant-safe composite references and `ON DELETE RESTRICT`.

Domain membership roles:

```text
procurement:
  lead_buyer
  participant
  beneficiary
  central_buyer
  contracting_company

sales:
  lead_seller
  participant
  beneficiary
  booking_company
  invoicing_company
  fulfillment_company
```

A validation trigger reads the parent domain and rejects a role from the wrong
domain.

### 3.4 Domain profiles

`master.procurement_organization_profile` provides:

```text
organization_type:
  central_procurement
  shared_services
  category_management
  regional_procurement
  project_procurement

buying_model_default:
  federated
  central_buyer

default_currency
default_lead_company_id
```

`master.sales_organization_profile` provides:

```text
organization_type:
  central_sales
  regional_sales
  enterprise_sales
  channel_sales
  project_sales

selling_model_default:
  federated
  principal_seller

default_currency
default_booking_company_id
default_invoicing_company_id
```

Each profile has a one-to-one composite FK to `operating_organization`. A
trigger verifies that the profile matches the parent domain.

### 3.5 Follow-on Sales Area DDL

Create after the Operating Organization foundation:

```text
server/db/ddl/master/01v_tables_sales_area.sql
```

It may add:

```text
master.distribution_channel
master.sales_division
master.sales_area
```

Sales Area is a data and routing dimension in v1. It does not become an RBAC
scope until a validated channel/division authorization requirement exists.

### 3.6 Existing DDL files to update

| File | Change |
|---|---|
| `master/01_tables_identity.sql` | Add `operating_organization` assignment scope to group roles and access grants |
| `master/03_constraints.sql` | Add tenant-safe FKs and profile constraints |
| `master/04_indexes.sql` | Add forward/reverse membership, hierarchy, status, and effective-date indexes |
| `master/05_functions.sql` | Add resolvers, scope validation, cycle checks, version bump logic, and allowed-company expansion |
| `master/06_triggers.sql` | Register audit, validation, hierarchy, and scope-version triggers |
| `master/08_rls.sql` | Add forced tenant RLS and admin policies for all new tables |

### 3.7 Required database functions

Add canonical functions:

```text
master.resolve_operating_organization_companies(
  tenant_id,
  operating_organization_id,
  as_of_date
)

master.principal_has_operating_context(
  tenant_id,
  principal_id,
  operating_organization_id
)

master.bump_operating_organization_scope_version(...)

master.validate_operating_organization_hierarchy(...)
```

All services use these functions instead of duplicating membership SQL.

## 4. RBAC workstream

### 4.1 Assignment scope

The canonical assignment scopes become:

```text
tenant
legal_entity
company_code
operating_organization
network_membership
```

`master.trg_validate_assignment_scope()` must verify that an
`operating_organization` reference exists, belongs to the same tenant, and is
not archived.

`include_descendants` remains meaningful only for `legal_entity`. Operating
Organization hierarchy does not expand a role in v1.

### 4.2 Permission scope policy

Add a shared policy relation adjacent to `shared.permission`:

```text
shared.permission_scope_policy
  permission_id
  assignment_scope_type
  organization_domain nullable
  propagation_mode
  requires_resource_scope
  status
```

Propagation modes:

```text
none              permission applies to the organization resource only
member_companies  permission may expand to active member Company Codes
resource_only     permission requires an explicit event/resource grant
```

Examples:

| Permission | Scope | Domain | Propagation |
|---|---|---|---|
| `SOURCE.EVENT.CREATE` | operating organization | procurement | none |
| `SOURCE.DEMAND.AGGREGATE` | operating organization | procurement | member companies |
| `SOURCE.EVENT.EVALUATE` | operating organization | procurement | resource only |
| `SALES.OPPORTUNITY.CREATE` | operating organization | sales | none |
| `SALES.QUOTATION.CREATE` | operating organization | sales | member companies |
| `SALES.ORDER.CREATE` | company code | none | none |
| `AP.INVOICE.APPROVE` | company code/legal entity | none | none |

The implementation must not infer domain from a permission-code prefix alone.
The explicit policy row is authoritative.

### 4.3 Effective authorization algorithm

For each permission:

```text
capability allow
INTERSECT assignment scope
INTERSECT active work context
INTERSECT requested resource scope
MINUS applicable scoped denies
= effective authorization
```

The existing global persona-to-all-companies expansion must be removed or
conditioned on an explicit tenant-wide assignment.

The existing global deny short-circuit must be replaced with per-scope
subtraction. A deny for one Company Code must not deny every Company Code in an
Operating Organization.

### 4.4 Effective context DTO

Authorization scope is permission-specific, not session-global:

```ts
interface EffectiveAuthorizationScope {
  permissionCode: string;
  tenantWide: boolean;
  legalEntityIds: ReadonlySet<string>;
  companyCodeIds: ReadonlySet<string>;
  operatingOrganizationIds: ReadonlySet<string>;
  networkMembershipIds: ReadonlySet<string>;
  visibility: "all" | "team" | "own";
}
```

The permission profile hash includes Operating Organization assignment and
membership versions.

## 5. Neon login and session workstream

### 5.1 Authentication versus work context

The locked flow is:

```text
authenticate tenant principal
-> resolve principal identity binding
-> discover authorized work contexts from Neon DB
-> select Legal Entity or Operating Organization
-> persist server-side active context
-> revalidate context and permission on every protected request
```

Selecting a context does not require a new Keycloak login while the tenant is
unchanged.

### 5.2 Generalized work context

Replace organization-only semantics with:

```ts
type NeonWorkContext =
  | {
      type: "legal_entity";
      id: string;
      code: string;
      name: string;
      tenantId: string;
    }
  | {
      type: "operating_organization";
      domain: "procurement" | "sales";
      id: string;
      code: string;
      name: string;
      tenantId: string;
      scopeVersion: number;
    };
```

The server session stores context identifiers and display metadata. It does not
store an authoritative, long-lived list of allowed Company Codes.

### 5.3 Context API

Add or evolve:

```text
GET   /api/auth/contexts
PATCH /api/auth/session/context
```

Context discovery returns:

```text
Legal Entities
Procurement Organizations
Sales Organizations
```

The PATCH endpoint re-queries current RBAC before updating the session.

### 5.4 Runtime header contract

Target headers generated only by the BFF:

```text
X-Tenant-ID
X-Tenant-Code
X-Work-Context-Type
X-Work-Context-ID
X-Work-Context-Domain
X-Auth-Epoch
X-Scope-Version
```

`X-Org` remains temporary compatibility data. It must not remain the canonical
combined tenant/workspace identifier.

### 5.5 Request verification

Every protected request verifies:

1. issuer, subject, audience, and `neon-web.AUTHORIZED`;
2. subject-to-principal identity binding;
3. principal tenant equals session/header tenant;
4. context belongs to that tenant;
5. principal still has an active assignment for the context;
6. context domain is allowed for the requested permission;
7. requested Company Code is in the effective permission scope;
8. auth epoch and scope version are current.

## 6. Keycloak `neon-web` workstream

### 6.1 Keep

The current client retains:

```text
public client
authorization code flow
PKCE S256
direct grants disabled
fullScopeAllowed false
athyper-api-runtime audience
neon-web.AUTHORIZED coarse role
MFA / ACR / AMR claims
```

### 6.2 Remove or restrict

1. Remove the client-level full group-membership mapper unless a documented,
   non-RBAC consumer remains.
2. Stop interpreting `organization` or `organization_code` as tenant identity.
3. Disable Keycloak organization membership in access tokens.
4. Keep organization membership only in ID token/UserInfo during Legal Entity
   discovery migration, then make it optional.
5. Treat `tenant_id` as a temporary shadow cross-check, not the source of
   authorization.
6. Treat `allowed_tenants` as discovery metadata only during migration.

Target access-token business contract:

```text
iss
sub
aud
azp
sid
acr
amr
auth_time
resource_access.neon-web.roles = [AUTHORIZED]
```

### 6.3 Explicit non-goals

Do not add to Keycloak:

```text
Operating Organization objects
Procurement Organization objects
Sales Organization objects
Company Code memberships
Procurement or sales roles
Operating Organization IDs in tokens
Permission lists in tokens
```

Keycloak Legal Entity organizations remain external identity/discovery
projections through `master.legal_entity_identity_binding`; they are not the
source of Neon authorization.

## 7. Tenant seed workstream

### 7.1 New Athyper Neon seed

Create:

```text
server/db/seed/tenants/neon/010_demo/100_org_structure/202_operating_organizations.sql
```

Seed Procurement Organizations:

```text
GROUP-SOURCING
  domain: procurement
  type: central_procurement
  buying model: federated
  companies: ATHQ, AMRE, AQTU, ASAC, AUET

PROC-APAC
  domain: procurement
  type: regional_procurement
  buying model: federated
  companies: ATHQ, AMRE, ASGF, AITM, ATEM, AJED, APHS
```

Seed Sales Organizations:

```text
GROUP-ENTERPRISE-SALES
  domain: sales
  type: enterprise_sales
  selling model: federated
  companies: ATHQ, AMRE, AQTU, ASAC, AUET

SALES-APAC
  domain: sales
  type: regional_sales
  selling model: federated
  companies: ATHQ, AMRE, ASGF, AITM, ATEM, AJED, APHS
```

Use deterministic seed IDs or stable code-based upserts consistent with the
existing tenant seed conventions.

### 7.2 New RBAC groups

Add tenant groups:

```text
GROUP-SOURCING-BUYERS
GROUP-SOURCING-APPROVERS
APAC-PROCUREMENT-BUYERS
GROUP-ENTERPRISE-SALES-USERS
APAC-SALES-MANAGERS
OPERATING-ORG-AUDITORS
```

Add scoped assignments:

```text
STRATEGIC_BUYER       @ GROUP-SOURCING
SOURCING_APPROVER     @ GROUP-SOURCING
REGIONAL_BUYER        @ PROC-APAC
ENTERPRISE_SALES      @ GROUP-ENTERPRISE-SALES
REGIONAL_SALES_MANAGER @ SALES-APAC
OPERATING_ORG_AUDITOR @ selected Operating Organizations
```

Do not grant these roles at tenant scope.

### 7.3 Demo principal assignments

Reuse existing Keycloak users and Neon principal bindings for the first seed:

```text
athq.agent    -> GROUP-SOURCING-BUYERS
athq.manager  -> GROUP-SOURCING-APPROVERS
kumar         -> APAC-PROCUREMENT-BUYERS
raja          -> GROUP-ENTERPRISE-SALES-USERS
rama          -> APAC-SALES-MANAGERS
athq.reporter -> OPERATING-ORG-AUDITORS
```

The exact persona/role mapping must be seeded in Neon DB. Keycloak continues to
carry only `NEON_USER` and `neon-web.AUTHORIZED`, which these users already
possess.

### 7.4 Keycloak demo seed changes

No Operating Organization records or memberships are added to
`realm-athyper-demosetup.json`.

Keycloak seed changes are limited to:

1. ensuring all selected demo users retain `neon-web.AUTHORIZED`;
2. retaining `NEON_USER` while it remains part of coarse plane discovery;
3. removing/restricting the group-membership and organization access-token
   mappers in the importable realm configuration;
4. retaining only Legal Entity Keycloak organization memberships needed during
   transition;
5. updating realm documentation to state that Operating Organizations are
   Neon-owned contexts.

If dedicated personas are desired later, add users such as
`athq.strategic.buyer` and `athq.enterprise.sales` to both Keycloak and Neon
principal seeds, but this is not required for the first implementation.

## 8. Domain integration workstream

### 8.1 Procurement ownership

| Entity | Owner |
|---|---|
| Sourcing project/event | Procurement Operating Organization |
| RFP/RFQ | Procurement Operating Organization |
| Supplier response | Sourcing event / Mesh account grant |
| Award recommendation | Procurement Operating Organization plus participant allocations |
| Purchase requisition | Company Code |
| Purchase order | Company Code/legal entity |
| Purchase invoice/payment | Company Code/legal entity |

Federated awards split into company-owned outputs. Central buying requires an
explicit `central_buyer` company and intercompany handling.

### 8.2 Sales ownership

| Entity | Owner |
|---|---|
| Lead/campaign/opportunity | Sales Operating Organization |
| Group quotation/tender response | Sales Operating Organization |
| Quote allocation | Sales Operating Organization plus participant companies |
| Sales order | Booking/selling Company Code |
| Delivery | Fulfillment Company Code |
| Sales invoice/revenue posting | Invoicing Company Code |

Federated selling splits into legal-seller outputs. Principal-seller mode
requires an explicit selling company and intercompany fulfillment.

## 9. Delivery phases

### Phase 0 - Contract and safety tests

- Add failing tests for tenant isolation, context discovery, domain mismatch,
  scoped deny, and member-company propagation.
- Record current Keycloak token shape and current Legal Entity login behavior.
- Add compatibility fixtures for existing `activeOrg` sessions.

Exit: tests express the locked invariants before schema behavior changes.

### Phase 1 - Operating Organization DDL

- Add four master tables.
- Add tenant-safe FKs, indexes, triggers, RLS, hierarchy validation, and scope
  versioning.
- Add canonical company resolver.
- Add Athyper Operating Organization seed data.

Exit: organizations and memberships can be administered safely without changing
login or RBAC behavior.

### Phase 2 - RBAC scope and policy

- Add `operating_organization` assignment scope.
- Add permission-scope policy.
- Extend allowed-company resolution.
- Add procurement and sales permission policies.
- Correct persona all-company expansion and scoped-deny behavior.
- Include scope versions in permission fingerprints.

Exit: direct authorization tests prove domain-safe, permission-specific company
expansion.

### Phase 3 - Neon context discovery

- Generalize Legal Entity organizations into typed work contexts.
- Add Operating Organization discovery.
- Add context selection/revalidation API.
- Add Procurement and Sales sections to the context selector.
- Preserve backward compatibility for existing Legal Entity sessions.

Exit: users can switch between authorized Legal Entity, Procurement, and Sales
contexts without re-authenticating.

### Phase 4 - Runtime context enforcement

- Introduce explicit work-context headers.
- Extend verified request context with context type/domain/id/version.
- Add permission-domain checks.
- Apply context/permission intersections to list, detail, mutation, SSE, and
  preferences routes.
- Remove runtime reliance on combined `X-Org` semantics.

Exit: stale or cross-domain contexts fail closed without affecting valid tenant
sessions.

### Phase 5 - Keycloak hardening

- Remove Neon group-membership mapper.
- Disable organization membership in access tokens.
- Stop tenant inference from organization claims.
- Run tenant-claim comparison in shadow mode.
- Make DB identity binding authoritative.
- Update importable realm and IAM documentation.

Exit: a fresh Neon access token contains identity, assurance, audience, and
coarse plane eligibility only.

### Phase 6 - Procurement integration

- Add sourcing-event Operating Organization ownership.
- Add participant Company Codes and source-demand links.
- Enforce dual authorization for orchestration and source demand.
- Implement federated and central-buyer award output rules.

Exit: one RFP can aggregate authorized demand across multiple legal entities
without granting unrelated company access.

### Phase 7 - Sales integration

- Add opportunity/quotation Operating Organization ownership.
- Add participant Company Codes and quote allocations.
- Implement federated and principal-seller output rules.
- Add Sales Area DDL only where domain behavior needs it.

Exit: one sales opportunity or quotation can coordinate multiple legal sellers
while orders and invoices remain company-owned.

### Phase 8 - Cutover and cleanup

- Migrate remembered Legal Entity context to typed context keys.
- Remove obsolete organization-derived tenant parsing.
- Remove compatibility-only `X-Org` authorization behavior.
- Invalidate old sessions after a communicated grace period.
- Publish operations and support runbooks.

Exit: only the new verified tenant plus typed work-context contract remains.

## 10. Test matrix

### Database

- Cross-tenant parent and membership FKs fail.
- Hierarchy cycles fail.
- Procurement role on Sales Organization fails.
- Sales role on Procurement Organization fails.
- Effective dates and suspended membership remove company expansion.
- Membership mutation increments scope version.
- RLS prevents cross-tenant reads and writes.

### Authorization

- Procurement permission expands only through procurement policy.
- Sales permission expands only through sales policy.
- Financial permissions never expand through Operating Organizations.
- Company-scoped deny subtracts one company only.
- Tenant-wide deny removes all applicable companies.
- Missing scope policy denies access.
- Active context narrows but never broadens effective scope.

### Login/session

- One-context user is auto-selected.
- Multi-context user receives grouped choices.
- Context switch within a tenant does not invoke Keycloak.
- Cross-tenant context selection fails.
- Revoked context fails on the next protected request.
- Stale scope version triggers re-resolution.
- Existing Legal Entity session migrates or receives a controlled re-login.

### Keycloak

- `neon-web.AUTHORIZED` is enforced.
- PKCE remains required.
- Direct grants remain disabled.
- Access token contains no Operating Organization or Company Code data.
- Access token contains no full Keycloak group paths.
- Organization claim cannot influence tenant resolution.

### Domain

- Procurement buyer aggregates five authorized companies and not a sixth.
- Federated award creates company-owned commitments.
- Central buyer creates one commitment plus beneficiary allocations.
- Sales manager creates a multi-company quotation.
- Federated quotation creates separate legal-seller orders.
- Principal seller creates one order with intercompany fulfillment.

## 11. Operational controls

Audit every decision with:

```text
tenant_id
principal_id
acting_principal_id
plane
permission_code
work_context_type
work_context_domain
operating_organization_id
company_code_id
resource_type
resource_id
decision
decision_reason
grant source
auth epoch
scope version
request_id
timestamp
```

Membership removal must invalidate affected authorization caches immediately.
In-flight procurement or sales documents retain immutable participant snapshots
for audit, while future access follows current authorization.

## 12. Rollback boundaries

Each phase is independently reversible until domain documents begin using
Operating Organization ownership:

1. DDL tables can remain dormant behind feature flags.
2. RBAC policy can run in shadow comparison mode.
3. Typed contexts can coexist with `activeOrg` during migration.
4. Explicit headers can be dual-written before `X-Org` is retired.
5. Keycloak mapper removal occurs only after DB context discovery is stable.

Do not roll back by copying Operating Organization membership into Keycloak.

## 13. Definition of done

The Operating Organization foundation is complete when:

1. Procurement and Sales Organizations share one secure master-data and RBAC
   mechanism.
2. Legal Entity and Operating Organization contexts coexist in Neon login.
3. Keycloak remains a thin authentication and coarse plane-access provider.
4. Permission-specific propagation prevents procurement/sales context leakage.
5. Financial transactions remain Company Code-owned and server-validated.
6. Athyper demo seed demonstrates group procurement and group sales across
   multiple legal entities.
7. Tenant isolation, scoped deny, revocation, cache invalidation, and audit are
   covered by automated tests.

