# Three Plane Architecture Production Implementation Plan

**Status:** Locked production implementation plan  
**Date:** 2026-05-21  
**Source ADR:** `docs/adr/ADR-three-plane-application-architecture.md`

---

## 1. Locked Architecture

```txt
One monorepo.
Three applications: apps/neon, apps/mesh, apps/admin.
One primary database.
Three app-native Keycloak realms: neon, mesh, admin.
One product-owner support realm: platform-control.
Three app session cookies: neon_sid, mesh_sid, admin_sid.
Four Redis session namespaces: neon, mesh, admin, platform.
Three deployed web services: athyper-neon-web, athyper-mesh-web, athyper-admin-web.
One shared runtime API initially, made plane-aware.
One shared Redis service.
One shared object-storage service and application bucket.
One shared support-service layer for logs, metrics, tracing, search, errors, and upload scanning.
```

Plane mapping:

```txt
neon.athyper.com   -> apps/neon   -> Business Operating Platform    -> tenant user control plane
mesh.athyper.com   -> apps/mesh   -> Business Collaboration Network -> partner/supplier control plane
admin.athyper.com  -> apps/admin  -> Business Technology Platform   -> internal platform control plane
```

Product-owner support:

```txt
platform-control realm -> Redis namespace platform -> support shadow principals in target tenant
```

---

## 2. Locked Core Data Model

Use the current `master.*` IAM foundation. Do not create a parallel `iam.*` account model for this phase.

Keep:

```txt
master.tenant
master.principal
master.principal_identity_binding
master.principal_persona
master.auth_group_member
master.access_grant
master.delegation_grant
```

Add:

```txt
master.tenant_relationship
master.principal_relationship
```

Interpretation:

```txt
master.tenant                  organization/security container
master.principal               account inside a tenant
master.principal_identity_binding
                               external IdP binding for that tenant-local account
master.principal_persona       base permission persona
master.auth_group_member       group membership
master.access_grant            explicit allow/deny override
master.delegation_grant        time-boxed act-on-behalf-of authority
master.tenant_relationship     organization-to-organization relationship
master.principal_relationship  account correlation, merge, transfer, support-shadow relationship
```

Important boundaries:

```txt
principal_type classifies the account.
tenant_relationship grants organization-to-organization visibility/relationship context.
access_grant and delegation_grant grant actual permission/authority.
principal_relationship does not grant access.
email is not a security key.
```

---

## 3. Current State Review

### 3.1 DDL And IAM

Current:

- `master.tenant` already has `realm_key` with unique `(realm_key, code)`.
- `master.principal` is tenant-scoped and already has `principal_type`.
- `master.principal_type` is lookup-validated through `control.trg_validate_lookup_columns`.
- `master.principal_identity_binding` is tenant-scoped, but not realm-aware enough for the final four-realm model.
- Runtime resolvers often default missing realm to `athyper`.
- Runtime IAM session cache keys are based on `sub` without realm in several places.
- Existing RLS is strongly tenant-oriented using `shared.current_tenant_id()` and `shared.current_tenant_id_soft()`.

Required:

- Migrate realm `athyper` to `neon`.
- Extend `master.principal_type` lookup values.
- Add `master.tenant.tenant_type` lookup.
- Add realm/issuer awareness to `master.principal_identity_binding`.
- Add `master.tenant_relationship`.
- Add `master.principal_relationship`.
- Make backend cache keys realm-aware.
- Keep tenant RLS as the primary data isolation layer.

### 3.2 Application

Current:

- One app exists: `apps/web`.
- Tenant runtime, partner workbench, admin/setup surfaces, and admin APIs are mixed inside one app.
- `apps/web/lib/auth/session.ts` hardcodes `neon_sid` and `__csrf`.
- `apps/web/lib/auth/realm-config.ts` supports native realm plus `platform-control`, but only in the existing Neon-oriented shape.
- Admin pages live under `apps/web/app/(shell)/(admin)`.
- `/setup/**`, `/metadata-studio`, and `/api/admin/**` are still in the tenant-facing app.

Required:

- Rename `apps/web` to `apps/neon`.
- Move admin/setup/admin API surfaces into `apps/admin`.
- Create `apps/mesh`.
- Split BFF route ownership per app.
- Remove trust-plane switching from the Neon app shell.

### 3.3 Docker And Gateway

Current:

- One web service exists: `athyper-neon-web`, built from `apps/web/Dockerfile`.
- Gateway routes `/user`, `/admin`, `/ops` on one host to the same web service.
- Env files expose one primary web host/upstream: `APPS_ATHYPER_WEB_HOST`.

Required:

- Add `athyper-neon-web`, `athyper-mesh-web`, and `athyper-admin-web`.
- Use host-based gateway routing.
- Remove path-based workbench trust routing.
- Add per-app env variables and health checks.

---

## 4. Target DDL Changes

### 4.1 `master.tenant`

Add:

```txt
tenant_type text not null default 'customer'
```

Lookup domain:

```txt
master.tenant_type
```

Initial values:

```txt
customer
partner
partner_prospect
supplier_prospect
customer_partner
platform_internal
platform_control
demo
```

Status/lifecycle values should support:

```txt
invited
provisional
active
suspended
archived
merged
```

Migration:

```txt
realm_key = 'athyper' -> 'neon'
existing customer/demo tenants -> tenant_type = customer or demo
Athyper internal tenant -> tenant_type = platform_internal
platform-control tenant -> tenant_type = platform_control, if represented as a tenant row
```

Production guardrails:

- `tenant_type` is not authorization by itself.
- `realm_key` and app/host context must still match.
- Tenant-owned business data remains scoped by `tenant_id`.

### 4.2 `master.principal`

Extend existing `principal_type` lookup.

Initial locked values:

```txt
tenant_user
partner_user
platform_staff
product_owner
support_user
service_account
integration_user
```

Mapping:

```txt
tenant_user      -> native Neon user under a customer/customer_partner tenant
partner_user     -> native Mesh user under partner/prospect/supplier tenant
platform_staff   -> native Admin app user under platform_internal tenant
product_owner    -> platform-control product owner under platform_control tenant
support_user     -> tenant-local support shadow principal
service_account  -> service automation
integration_user -> external integration identity
```

Do not add `tenant_admin` as a principal type. Tenant admin is represented by:

```txt
master.principal_persona
master.auth_group_member
master.access_grant
```

### 4.3 `master.principal_identity_binding`

Add:

```txt
realm_key text not null
issuer text null
audience text null
client_id text null
```

Target uniqueness:

```txt
UNIQUE (tenant_id, realm_key, provider_code, subject_id)
UNIQUE (tenant_id, principal_id, realm_key, provider_code)
INDEX  (realm_key, provider_code, subject_id)
```

Migration:

```txt
existing athyper rows -> realm_key = neon
existing platform-control rows -> realm_key = platform-control
new mesh rows -> realm_key = mesh
new admin rows -> realm_key = admin
```

Reason:

- Keycloak `sub` is safe only inside realm/issuer context.
- Same email can exist in every realm.
- Same human can have multiple Mesh accounts.
- One Mesh subject can optionally bind to multiple partner tenant principals.

### 4.4 `master.tenant_relationship`

Purpose:

```txt
Organization-to-organization access, collaboration, service, or commercial relationship.
```

Recommended table shape:

```sql
CREATE TABLE master.tenant_relationship (
  id uuid not null default shared.uuidv7(),
  from_tenant_id uuid not null,
  to_tenant_id uuid not null,
  relationship_type text not null,
  relationship_direction text not null default 'directional',
  scopes jsonb not null default '[]'::jsonb,
  effective_from timestamptz,
  effective_until timestamptz,
  status text not null default 'pending',
  approved_by uuid,
  approved_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  updated_at timestamptz,
  updated_by uuid,
  status_changed_at timestamptz,
  status_changed_by uuid,
  constraint tenant_relationship_pkey primary key (id),
  constraint tenant_relationship_pair_uq unique (from_tenant_id, to_tenant_id, relationship_type),
  constraint tenant_relationship_no_self_chk check (from_tenant_id is distinct from to_tenant_id)
);
```

Recommended relationship types:

```txt
implementation_partner
support_partner
supplier_collaboration
customer_collaboration
reseller
auditor
platform_managed
integration_partner
```

Recommended status values:

```txt
pending
pending_invite
active
suspended
revoked
expired
```

Indexes:

```txt
(from_tenant_id, status)
(to_tenant_id, status)
(from_tenant_id, to_tenant_id, relationship_type)
partial active index on active relationships
```

Rules:

- Mesh partner/supplier access to a customer tenant requires an active relationship.
- Relationship scopes constrain what the relationship may do.
- Application permission still depends on principal, persona, group, access grants, and endpoint authorization.
- Relationship rows are durable authority and must not live only in Redis or Keycloak claims.

### 4.5 `master.principal_relationship`

Purpose:

```txt
Account correlation, duplicate handling, verified same-human grouping, merge history, transfer history, and support shadow mapping.
```

Recommended table shape:

```sql
CREATE TABLE master.principal_relationship (
  id uuid not null default shared.uuidv7(),
  from_tenant_id uuid not null,
  from_principal_id uuid not null,
  to_tenant_id uuid not null,
  to_principal_id uuid not null,
  relationship_type text not null,
  verification_status text not null default 'pending',
  verified_method text,
  is_primary boolean not null default false,
  effective_from timestamptz,
  effective_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  verified_at timestamptz,
  verified_by uuid,
  constraint principal_relationship_pkey primary key (id),
  constraint principal_relationship_no_self_chk check (
    from_tenant_id is distinct from to_tenant_id
    or from_principal_id is distinct from to_principal_id
  )
);
```

Recommended relationship types:

```txt
same_human
duplicate_candidate
merged_into
transferred_to
support_shadow_for
```

Recommended verification statuses:

```txt
pending
verified
rejected
revoked
merged
transferred
```

Recommended verification methods:

```txt
same_subject
email_otp
login_pair
admin_verified
system_jit
support_jit
```

Rules:

- This table grants no access.
- Same-email duplicates start as `duplicate_candidate`.
- Account switching across linked principals requires verified relationship or same realm/subject binding.
- Merge/transfer keeps historical audit stable; do not rewrite historical audit rows by default.
- Active ownership can be moved by controlled migration when a transfer is accepted.

---

## 5. Product Owner Support Model

Do not add `iam.support_grant`.

Use support shadow principals in target tenant plus existing IAM grants/delegations.

### 5.1 Support Login And Entry

Flow:

```txt
1. Product owner authenticates in platform-control realm.
2. App stores app SID cookie and app realm selector:
   neon_sid + neon_realm=platform
   mesh_sid + mesh_realm=platform
   admin_sid + admin_realm=platform
3. Product owner chooses target tenant/partner/admin context and enters reason/ticket.
4. Runtime creates or finds support shadow principal in target tenant.
5. Runtime binds platform-control subject to that support shadow principal.
6. Runtime creates/audits support entry event.
7. Permissions are evaluated through existing master.* IAM tables.
```

### 5.2 Support Shadow Principal

```txt
master.principal
  tenant_id = target tenant
  principal_type = support_user
  principal_source = support_jit
  status = active
```

```txt
master.principal_identity_binding
  tenant_id = target tenant
  principal_id = support shadow principal
  realm_key = platform-control
  provider_code = keycloak
  subject_id = platform-control KC sub
```

```txt
master.principal_relationship
  relationship_type = support_shadow_for
  from = platform-control product_owner principal, if represented
  to = tenant-local support_user principal
```

### 5.3 Support Authority

Default support principal has no meaningful authority.

Grant support access through:

```txt
master.principal_persona       support_no_access or support_read_base
master.auth_group_member       optional support group
master.access_grant            time-boxed explicit allow/deny
master.delegation_grant        time-boxed act-on-behalf-of authority
```

Support access must be:

```txt
reason-required
ticket/reference-capable
time-boxed
audited on entry
audited on every sensitive action
revocable
visible to admin audit views
```

### 5.4 Support Audit Context

Every support request must carry or derive:

```txt
actor_principal_id             tenant-local support shadow principal
source_realm_key               platform-control
source_subject_id              platform-control subject
source_platform_principal_id   product_owner principal when available
target_tenant_id
target_plane                   neon | mesh | admin
support_reason
support_ticket
session_id
request_id
```

Use existing log tables where possible:

```txt
log.audit_log
log.security_event_log
log.permission_decision_log
```

Add columns only if the current audit payload cannot reliably capture both the actor and source support identity.

---

## 6. Organic Partner And Supplier Onboarding

The supplier/prospect onboarding scenario is a first-class requirement.

### 6.1 Scenario

A Neon customer issues a purchase order to a supplier that does not yet have an Athyper account.

### 6.2 Flow

1. Create provisional supplier tenant.

```txt
master.tenant
  realm_key = mesh
  tenant_type = supplier_prospect
  status = invited or provisional
```

2. Create pending relationship.

```txt
master.tenant_relationship
  from_tenant_id = supplier/prospect tenant
  to_tenant_id = customer tenant
  relationship_type = supplier_collaboration
  scopes = ['view_purchase_orders', 'acknowledge_po', 'submit_invoice']
  status = pending_invite
```

3. Create invite event/token in an invitation or workflow table.

Do not store the one-time invite secret in `master.tenant_relationship`. The relationship is durable authority; the invite token is workflow/security material.

4. Supplier accepts invite through Mesh.

```txt
master.principal
  tenant_id = supplier/prospect tenant
  principal_type = partner_user
  principal_source = invite_jit
```

```txt
master.principal_identity_binding
  realm_key = mesh
```

5. Activate relationship.

```txt
master.tenant_relationship.status = active
```

6. Supplier collaborates in Mesh with only the relationship scopes.

7. If supplier later buys Neon, reuse the same tenant row.

```txt
master.tenant.tenant_type = customer_partner
master.tenant_module_subscription enabled
master.tenant_feature_entitlement enabled
```

No duplicate tenant is needed.

### 6.3 Production Controls

- Invitation tokens expire.
- Invite acceptance requires email verification.
- Activation is audited.
- Relationship scopes are minimal by default.
- Provisional tenants cannot create tenant-owned Neon business records until subscribed/activated.
- Supplier submissions remain staged until accepted by the customer tenant workflow.

---

## 7. Runtime Auth And Session Plan

### 7.1 Realm-Aware Token Verification

Runtime auth adapter must verify:

```txt
issuer
realm
audience/client_id
azp/client
expiry
signature
required roles/claims
```

Allowed token use:

```txt
neon realm token  -> Neon native routes only
mesh realm token  -> Mesh native routes only
admin realm token -> Admin native routes only
platform-control  -> support entry/resolution routes only
```

Unknown realm fails closed.

### 7.2 Runtime Context

Runtime context should carry:

```ts
{
  plane: "neon" | "mesh" | "admin" | "platform",
  app: "neon" | "mesh" | "admin",
  realmKey: "neon" | "mesh" | "admin" | "platform-control",
  subjectId: string,
  tenantId?: string,
  principalId?: string,
  relationshipId?: string,
  supportShadowPrincipalId?: string,
  sourcePlatformSubjectId?: string,
  supportReason?: string,
  sessionId?: string
}
```

### 7.3 Redis Session Keys

BFF browser session keys:

```txt
sess:neon:{sid}
sess:mesh:{sid}
sess:admin:{sid}
sess:platform:{sid}

user_sessions:neon:{principalId}
user_sessions:mesh:{principalId}
user_sessions:admin:{principalId}
user_sessions:platform:{sourceSubjectId}
```

Runtime IAM cache keys:

```txt
session:{realmKey}:{sub}:{tenant}:{entity}:{workbench-or-plane-context}
principal_sessions:{realmKey}:{sub}
bootstrap:{realmKey}:{sub}:{tenantHash}
jwks:{realmKey}
```

Migration:

```txt
sess:athyper:*          -> sess:neon:*
user_sessions:athyper:* -> user_sessions:neon:*
refresh_lock:athyper:*  -> refresh_lock:neon:*
sid_rotation:athyper:*  -> sid_rotation:neon:*
```

Do not migrate:

```txt
sess:platform:*
user_sessions:platform:*
refresh_lock:platform:*
sid_rotation:platform:*
```

The `platform` namespace remains for `platform-control`.

---

## 8. Application Split Plan

### 8.1 `apps/neon`

Source:

```txt
current apps/web after admin extraction
```

Owns:

```txt
tenant dashboards
tenant business runtime
tenant document/finance workflows
tenant admin settings that are customer-owned
neon native login/session
platform-control support entry into tenant context
```

Removes:

```txt
(shell)/(admin)
/setup/**
/metadata-studio
/api/admin/**
admin workbench toggle
partner workbench as trust plane
```

Cookie/realm:

```txt
neon_sid
__csrf
neon_realm=neon|platform
```

### 8.2 `apps/mesh`

Source:

```txt
new app
```

Owns:

```txt
partner/supplier onboarding
partner tenant profile
tenant relationship list
supplier PO collaboration
document review/submission
delegated workflow submissions
mesh native login/session
platform-control support entry into partner/collaboration context
```

Cookie/realm:

```txt
mesh_sid
__mesh_csrf
mesh_realm=mesh|platform
```

Rules:

- Mesh reads customer tenant data only through active `master.tenant_relationship`.
- Mesh writes are submissions/staged artifacts.
- Tenant-owned mutation occurs only through tenant acceptance/projection.

### 8.3 `apps/admin`

Source:

```txt
current admin/setup surfaces extracted from apps/web
```

Owns:

```txt
platform tenant management
metadata studio
platform setup
internal audit views
jobs/admin operations
realm/admin diagnostics
admin native login/session
platform-control support entry for product-owner workflows
```

Cookie/realm:

```txt
admin_sid
__admin_csrf
admin_realm=admin|platform
```

Rules:

- MFA required.
- Customer/partner SSO forbidden.
- Cross-tenant views require audit reason.
- Admin mutation routes are not shared with Neon or Mesh.

### 8.4 Shared Packages

Allowed to share:

```txt
UI primitives
read-only entity display components
document render/review components
plane-neutral API clients
plane-configurable auth utilities
domain types
validation schemas
```

Not allowed to share blindly:

```txt
BFF route handlers
session-to-tenant context binders
admin mutation handlers
mesh delegated mutation handlers
tenant write handlers
support entry/impersonation handlers
```

---

## 9. BFF Design

Each app owns its own BFF.

```txt
apps/neon/app/api/*   -> Neon BFF
apps/mesh/app/api/*   -> Mesh BFF
apps/admin/app/api/*  -> Admin BFF
```

BFF responsibilities:

```txt
read app cookie
resolve Redis namespace
validate realm selector
validate JWT audience/realm
bind tenant/partner/admin/support context
mint trusted runtime headers
enforce CSRF
apply route-level rate limits
write audit intent when required
```

Trusted runtime headers must be server-created only:

```txt
X-Plane
X-App
X-Realm
X-Org
X-Actor-Principal
X-Relationship-Id
X-Support-Reason
X-Request-Id
```

Runtime must not trust browser-supplied plane or support headers.

---

## 10. Keycloak Plan

### 10.1 Realms

Target imports:

```txt
realm-neon.json
realm-mesh.json
realm-admin.json
realm-platform-control.json
```

Current `realm-demosetup.json` becomes the source for `realm-neon.json`.

### 10.2 Clients

Native app clients:

```txt
neon-web
mesh-web
admin-web
```

Support clients, either separate clients or shared client with strict redirect/audience config:

```txt
neon-support
mesh-support
admin-support
```

Runtime/service clients:

```txt
athyper-api-runtime
athyper-svc-runtime-worker
neon-svc-bff
mesh-svc-bff
admin-svc-bff
```

### 10.3 Admin Realm

Rules:

- MFA mandatory.
- Hardware key preferred.
- Internal IdP allowed.
- Customer/partner SSO disallowed.
- JIT disabled unless explicitly provisioned through controlled internal workflow.

### 10.4 Platform-Control Realm

Rules:

- Kept as product-owner support realm.
- Existing `PRODUCT_ADMIN` maps to product-owner capability.
- Optional clearer `PLATFORM_OWNER` role may be added, with compatibility mapping from `PRODUCT_ADMIN`.
- MFA mandatory.
- Support access is authorized by database support shadow principal and grants/delegations, not by Keycloak role alone.

---

## 11. Gateway And Docker Plan

### 11.1 Compose Services

Add:

```txt
athyper-neon-web
athyper-mesh-web
athyper-admin-web
```

Keep:

```txt
athyper-api
worker/scheduler services
db
dbpool-apps
dbpool-session
iam
memorycache
objectstorage
support services
```

### 11.2 Env Variables

Replace single web host variables with:

```txt
APPS_NEON_WEB_HOST=neon.athyper.local
APPS_NEON_WEB_UPSTREAM_URL=http://host.docker.internal:3000

APPS_MESH_WEB_HOST=mesh.athyper.local
APPS_MESH_WEB_UPSTREAM_URL=http://host.docker.internal:3001

APPS_ADMIN_WEB_HOST=admin.athyper.local
APPS_ADMIN_WEB_UPSTREAM_URL=http://host.docker.internal:3002
```

Production:

```txt
APPS_NEON_WEB_HOST=neon.athyper.com
APPS_MESH_WEB_HOST=mesh.athyper.com
APPS_ADMIN_WEB_HOST=admin.athyper.com
```

### 11.3 Traefik

Remove:

```txt
Host(neon) && PathPrefix(/admin)
Host(neon) && PathPrefix(/ops)
Host(neon) && PathPrefix(/user)
```

Add:

```txt
Host(neon.athyper.local)  -> athyper-neon-web
Host(mesh.athyper.local)  -> athyper-mesh-web
Host(admin.athyper.local) -> athyper-admin-web
```

Admin hardening:

```txt
separate router
separate service
stricter rate limit
stricter security headers
optional IP allowlist in staging/production
no path stripping from Neon
independent deploy/restart
```

### 11.4 Health Checks

Each web service:

```txt
/livez        no dependencies, host guard bypass for container health
/api/health   BFF/session/runtime dependency health, protected as appropriate
```

---

## 12. Object Storage, Search, And Upload Safety

### 12.1 Object Storage

One application bucket remains.

Key prefixes:

```txt
tenant/{tenant_id}/neon/...
tenant/{tenant_id}/mesh/{from_tenant_id}/relationship/{relationship_id}/staging/...
tenant/{tenant_id}/admin/{context}/...
```

Rules:

- Mesh uploads are staged.
- Active tenant attachments require tenant workflow acceptance.
- Presigned URL issuance is BFF/runtime-authorized and audited.
- CORS includes Neon, Mesh, and Admin app origins.
- Browser never receives object-storage credentials.

### 12.2 Meilisearch

One shared `meilisearch-1`.

Required indexed fields:

```txt
_tenant_id
_plane
_relationship_id
_from_tenant_id
_visibility_scope
```

Rules:

- Neon search filters by tenant.
- Mesh search filters by target tenant and active relationship.
- Admin search goes through Admin BFF/runtime, not broad browser tokens.
- Platform-control support search includes support shadow principal and audit reason.
- Master key stays server-side.

### 12.3 ClamAV

One shared `clamav-1`.

Rules:

- All active uploads scan before becoming active.
- Mesh staged uploads scan before submission and again before promotion if policy requires.
- Staging/production fail closed when scanner unavailable.
- Local dev can opt out explicitly.

---

## 13. Observability And Operations

Shared support services:

```txt
telemetry-1
metrics-1
alertmanager-1
tracing-1
logging-1
logshipper-1
socket-proxy-logshipper-1
glitchtip-1
meilisearch-1
clamav-1
mailhog-1 local only
```

Required labels/resource attributes:

```txt
service.name = athyper-neon | athyper-mesh | athyper-admin | athyper-api | athyper-worker | athyper-scheduler
deployment.environment = local | staging | production
athyper.app = neon | mesh | admin | api | worker | scheduler
athyper.plane = neon | mesh | admin | platform | infra
```

Metrics cardinality rule:

- Do not use raw tenant IDs, principal IDs, relationship IDs, or subject IDs as high-volume Prometheus labels.
- Put high-cardinality forensic detail in audit logs/traces, not metrics labels.

GlitchTip:

```txt
athyper-neon-web
athyper-mesh-web
athyper-admin-web
athyper-api
athyper-worker
athyper-scheduler
```

Each gets its own project/DSN.

---

## 14. Production Security Requirements

### 14.1 Deny By Default

Every plane resolver must fail closed when:

```txt
realm missing
issuer mismatch
audience mismatch
host/app mismatch
tenant relationship missing
principal type mismatch
support reason missing
CSRF missing for mutation
relationship status not active
tenant status not active/provisional as allowed
```

### 14.2 Plane Rules

Neon:

```txt
native realm = neon
principal_type = tenant_user
tenant_id = active customer/customer_partner tenant
```

Mesh:

```txt
native realm = mesh
principal_type = partner_user
tenant_id = partner/partner_prospect/supplier_prospect/customer_partner tenant
customer access requires master.tenant_relationship
```

Admin:

```txt
native realm = admin
principal_type = platform_staff
tenant_id = platform_internal tenant
cross-tenant action requires audit reason
```

Platform-control:

```txt
realm = platform-control
namespace = platform
requires support shadow principal in target tenant
requires access through existing grants/delegations
```

### 14.3 Audit

Audit required for:

```txt
admin cross-tenant read
admin cross-tenant mutation
support entry
support exit
support mutation
relationship activation/revocation
principal merge/transfer
supplier invite acceptance
delegation creation/revocation
access grant creation/revocation
```

---

## 15. Implementation Phases

### Phase 0: Lock And Inventory

Deliverables:

- ADR locked.
- This implementation plan locked.
- Route inventory for `apps/web`.
- Admin route extraction list.
- BFF route ownership list.
- DDL migration inventory.
- Gateway route inventory.

Exit criteria:

- Team agrees `apps/web` becomes `apps/neon`.
- `platform-control` remains support realm, not Admin realm.
- `master.*` IAM foundation is locked.

### Phase 1: DDL Foundation

Deliverables:

- Add `master.tenant.tenant_type`.
- Extend `master.principal_type` lookup.
- Add realm columns to `master.principal_identity_binding`.
- Add `master.tenant_relationship`.
- Add `master.principal_relationship`.
- Add indexes, constraints, lookup domains, RLS, triggers.
- Add tenant-owned table audit script.

Exit criteria:

- Existing app still works.
- Existing principals backfill to `realm_key = neon`.
- Same email can exist across realms and tenants.
- Relationship tables are present but not yet broadly wired.

### Phase 2: Runtime Realm And Cache Hardening

Deliverables:

- Realm-aware token verification.
- Realm-aware JWKS cache.
- Realm-aware session/bootstrap/cache keys.
- Redis namespace migration from `athyper` to `neon`.
- Keep `platform` namespace unchanged.
- Runtime context includes plane/app/realm.

Exit criteria:

- Neon token cannot call Mesh/Admin routes.
- Mesh token cannot call Neon mutation resolver.
- Admin token requires Admin app route and admin principal.
- Platform-control token can call only support resolvers.

### Phase 3: Auth/BFF Config Split

Deliverables:

- Plane auth config helper.
- Remove hard-coded shared `SESSION_COOKIE_NAME`.
- App-specific session cookies and CSRF.
- App-specific realm selector cookies.
- App-specific callback/logout/refresh.

Exit criteria:

- Browser can hold Neon, Mesh, and Admin sessions independently.
- Native session and platform support session on the same app are selected by app realm selector.

### Phase 4: Admin Extraction

Deliverables:

- Create `apps/admin`.
- Move `(shell)/(admin)`.
- Move `/setup/**`.
- Move `/metadata-studio`.
- Move `/api/admin/**`.
- Add Admin middleware/proxy.
- Add Admin build/start scripts.

Exit criteria:

- `admin.athyper.local` serves Admin.
- `neon.athyper.local/admin` is gone.
- Admin BFF requires admin session or platform-control support context.

### Phase 5: Neon Rename And Cleanup

Deliverables:

- Rename `apps/web` to `apps/neon`.
- Update package name.
- Remove workbench trust-plane toggles.
- Keep tenant runtime stable.
- Update imports, paths, package filters, compose references.

Exit criteria:

- Neon builds and runs as tenant plane.
- No Admin route remains in Neon.
- Tenant workflows still pass smoke tests.

### Phase 6: Mesh MVP

Deliverables:

- Create `apps/mesh`.
- Mesh login/session.
- Partner/supplier tenant profile.
- Tenant relationship list.
- Supplier invite acceptance.
- PO collaboration/read/acknowledge/submit flow.
- Staged upload/submission flow.

Exit criteria:

- Mesh user sees only active relationship tenants.
- Unrelated tenant access denied.
- Mesh cannot directly mutate tenant-owned business tables.
- Supplier prospect can onboard from invite.

### Phase 7: Docker And Gateway Split

Deliverables:

- Three web compose services.
- Host-based Traefik routes.
- Per-app env examples.
- Per-app health checks.
- Admin route hardening.

Exit criteria:

- Neon, Mesh, Admin deploy independently.
- Gateway no longer uses `/admin` and `/ops` path routing on Neon.

### Phase 8: Keycloak Realm Split

Deliverables:

- `realm-neon.json`.
- `realm-mesh.json`.
- `realm-admin.json`.
- Updated `realm-platform-control.json`.
- Client redirect URIs for local/staging/prod.
- Import/reset scripts.

Exit criteria:

- Each app authenticates against native realm.
- Platform-control support login works on all three apps.
- Admin realm enforces MFA.

### Phase 9: Storage, Search, Observability Hardening

Deliverables:

- Object key prefix update.
- Mesh staged upload policy.
- Search filters/scoped tokens.
- ClamAV fail-closed production behavior.
- Per-app GlitchTip DSNs.
- Logs/metrics/traces app/plane labels.

Exit criteria:

- Presigned URL issuance is audited.
- Search cannot leak across tenant/relationship.
- Uploads cannot become active without scan/acceptance.

### Phase 10: Production Readiness And Cutover

Deliverables:

- Negative authorization test suite.
- Audit coverage test suite.
- Load/smoke scripts.
- Rollback plan.
- Runbook.
- Observability dashboards.

Exit criteria:

- All three apps pass build/test/smoke.
- All cross-plane negative tests pass.
- Migration can be rolled back or paused safely.

---

## 16. Validation Matrix

Required positive tests:

```txt
Neon user -> own tenant dashboard                              allowed
Neon tenant admin -> tenant setup                              allowed
Mesh partner -> assigned customer PO                           allowed
Mesh supplier prospect -> invited PO                           allowed
Admin staff -> tenant list with audit reason                   allowed
Product owner -> support shadow principal with grant           allowed
Supplier prospect -> later customer_partner subscription       allowed
```

Required negative tests:

```txt
Neon token -> Mesh BFF                                         denied
Neon token -> Admin BFF                                        denied
Mesh token -> Neon mutation                                    denied
Mesh token -> unassigned customer tenant                       denied
Admin token without platform_staff principal                   denied
Admin cross-tenant without audit reason                        denied
Platform-control token -> native Neon flow                     denied
Platform-control support without shadow principal/grant        denied
Principal relationship only -> access                          denied
Tenant relationship inactive/revoked -> access                 denied
Same email across realms -> account collapse                   denied
```

Required migration tests:

```txt
athyper realm rows backfill to neon
platform namespace remains platform
principal_identity_binding uniqueness handles multiple realms
same email can exist in neon, mesh, admin, platform-control
same Mesh subject can bind to multiple partner tenant principals only when intended
support shadow principal audit contains source platform-control identity
```

---

## 17. Recommended Pull Request Sequence

1. Lock ADR and this implementation plan.
2. Add tenant/principal lookup values and tenant type column.
3. Add `principal_identity_binding` realm columns and backfill.
4. Add `master.tenant_relationship`.
5. Add `master.principal_relationship`.
6. Add runtime realm-aware token verification and cache keys.
7. Add plane auth config helper and app-specific session constants.
8. Extract `apps/admin`.
9. Rename `apps/web` to `apps/neon`.
10. Add `apps/mesh` MVP shell and auth.
11. Add host-based gateway and three web compose services.
12. Split Keycloak realm imports.
13. Add support shadow principal flow.
14. Add supplier/prospect invite onboarding flow.
15. Harden object storage, search, scanning, and observability.
16. Run full security validation and cutover.

---

## 18. Non-Negotiable Design Rules

```txt
Do not create a parallel global iam account model in this phase.
Do not use email as an account key.
Do not let principal_relationship grant access.
Do not let tenant_relationship bypass endpoint authorization.
Do not treat platform-control as admin.
Do not store durable authority in Redis.
Do not let Mesh directly mutate tenant-owned business records.
Do not put Admin back inside Neon.
Do not issue broad browser search tokens.
Do not let active uploads bypass scanning in staging/production.
```

This is the production baseline for implementing the three-plane architecture.
