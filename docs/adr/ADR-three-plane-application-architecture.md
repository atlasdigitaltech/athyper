# ADR: Three Plane Application Architecture

**Status:** Accepted and locked  
**Date:** 2026-05-21  
**Deciders:** Architecture  

**Supersedes:** One Application Shell (April 2026)  
**Supersedes:** `ADR-control-plane-url-and-data-boundaries.md`

---

## Context

Athyper has three product/control-plane surfaces. They share a product family and a primary database, but they do not share the same audience or trust level.

| Host | Product | Plane | Audience |
|------|---------|-------|----------|
| `neon.athyper.com` | Business Operating Platform | Tenant user control plane | Customer tenant users and tenant admins |
| `mesh.athyper.com` | Business Collaboration Network | Partner control plane | Partner, supplier, collaborator, and implementation users |
| `admin.athyper.com` | Business Technology Platform | Internal platform control plane | Athyper internal platform staff |

Product-owner support is a separate identity path through the `platform-control` realm. It can enter Neon, Mesh, and Admin only through audited support context and tenant-local support shadow principals.

---

## Decision

Athyper will use three applications in one monorepo, one primary database, one shared Redis service, one shared object storage service, three app-native Keycloak realms, one product-owner support realm, three deployed web services, and app-specific BFF/session boundaries.

Canonical decision:

```txt
One monorepo, three applications: apps/neon, apps/mesh, apps/admin.
One primary database.
One shared Redis service with explicit namespaces.
One shared tenant object-storage bucket with tenant_id-prefixed keys.
Three app-native Keycloak realms: neon, mesh, admin.
One product-owner support realm: platform-control.
Three app cookies with four Redis session namespaces: neon, platform, mesh, admin.
Three deployable web services.
Shared packages are consumed by all three apps.
Mutation surfaces are not shared across trust planes.
No native principal crosses planes.
A human may maintain separate identities per plane.
Product-owner support uses tenant-local support shadow principals, not broad superuser grants.
```

Locked transition matrix:

```txt
App:
  Current: apps/web
  Target:  apps/neon, apps/mesh, apps/admin

Realm keys:
  Current: athyper, platform-control
  Target:  neon, mesh, admin, platform-control

Redis namespaces:
  Current: athyper, platform
  Target:  neon, mesh, admin, platform

Cookies:
  Current: neon_sid, __csrf
  Target:  neon_sid, mesh_sid, admin_sid + app-specific CSRF
```

`platform-control` remains the Keycloak realm key for product-owner support. The Redis namespace for `platform-control` remains the literal string `platform`; it is not renamed to `admin` and it is not `platform-control`.

---

## URL Contract

Production:

```txt
neon.athyper.com   -> apps/neon   -> tenant user control plane
mesh.athyper.com   -> apps/mesh   -> partner control plane
admin.athyper.com  -> apps/admin  -> internal platform control plane
```

Local:

```txt
neon.athyper.local
mesh.athyper.local
admin.athyper.local
```

Tenant/customer context lives inside each plane rather than in the product host name.

Examples:

```txt
neon.athyper.com/app/ssk/dashboard
mesh.athyper.com/customers/ssk
admin.athyper.com/tenants/ssk
```

---

## Application Structure

```txt
apps/
  neon/    # current apps/web renamed; tenant user control plane
  mesh/    # partner/supplier/collaboration control plane
  admin/   # internal platform control plane

packages/
  shared/  # shared UI, runtime, utility, and API contract packages
  domain/  # domain packages consumed where each plane is authorized
```

The current `apps/web` becomes `apps/neon`. The current `(shell)/(admin)` route group, `/setup/**`, `/metadata-studio`, and `/api/admin/**` move into `apps/admin`.

Admin is not a tenant route group. It is a separate product surface and deployment unit.

---

## Locked IAM Foundation

The finalized design reuses the existing tenant-scoped IAM foundation in `master.*`. Do not introduce a parallel `iam.*` account system for this phase.

Keep and evolve:

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

Core interpretation:

```txt
master.tenant                  organization/security container
master.principal               account inside a tenant
master.principal_identity_binding
                               external IdP/Keycloak binding for that account
master.principal_persona       base permission persona
master.auth_group_member       group membership
master.access_grant            explicit allow/deny override
master.delegation_grant        time-boxed act-on-behalf-of authority
master.tenant_relationship     organization-to-organization access relationship
master.principal_relationship  account correlation, duplicate, merge, transfer, support-shadow relationship
```

`master.principal.principal_type` remains the account classifier and is extended through the existing lookup system.

Recommended principal types:

```txt
tenant_user       native Neon account
partner_user      native Mesh account under a partner/supplier/collaborator tenant
platform_staff    native Admin account
product_owner     platform-control product-owner account
support_user      tenant-local support shadow principal
service_account   service automation
integration_user  external integration actor
```

Tenant admins are not a principal type. They are tenant users with persona, group, role, or access grants.

`master.tenant` gets a tenant type lookup.

Recommended tenant types:

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

Recommended tenant lifecycle/status values:

```txt
invited
provisional
active
suspended
archived
merged
```

---

## Principal Identity Binding

`master.principal_identity_binding` must become realm-aware.

Current uniqueness is tenant-scoped by provider and subject. The target model must include realm/issuer so the same email or subject shape across realms cannot collapse accidentally.

Target columns:

```txt
realm_key
issuer
audience/client_id, optional
```

Target uniqueness:

```txt
UNIQUE (tenant_id, realm_key, provider_code, subject_id)
UNIQUE (tenant_id, principal_id, realm_key, provider_code)
INDEX  (realm_key, provider_code, subject_id)
```

This supports multiple Mesh accounts for the same human:

```txt
Tenant K principal -> realm mesh -> subject S1 -> same email
Tenant L principal -> realm mesh -> subject S2 -> same email
Tenant M principal -> realm mesh -> subject S3 -> same email
```

It also supports one Mesh Keycloak subject linked to more than one partner tenant account when deliberately allowed:

```txt
Tenant K principal -> realm mesh -> subject S1
Tenant L principal -> realm mesh -> subject S1
```

Email is never the authorization key. The security binding is tenant, realm, provider, and subject.

---

## Tenant Relationship

`master.tenant_relationship` is the missing organization-to-organization relationship model.

It replaces the narrower idea of `partner_tenant`.

Purpose:

```txt
partner tenant -> customer tenant
supplier tenant -> customer tenant
implementation tenant -> customer tenant
auditor tenant -> customer tenant
platform service tenant -> target tenant
```

Recommended shape:

```txt
id
from_tenant_id
to_tenant_id
relationship_type
relationship_direction
scopes
status
effective_from
effective_until
approved_by
metadata
created_at, created_by
updated_at, updated_by
status_changed_at, status_changed_by
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

Rules:

- Mesh access to customer data exists only through an active `master.tenant_relationship`.
- Relationship direction matters. Do not assume all relationships are bidirectional.
- Relationship scopes are coarse authority boundaries, not fine UI permissions.
- Native data mutation still requires plane-specific API authorization, role/persona/access grants, workflow acceptance, and audit.
- Mesh submits; tenant owns.

---

## Principal Relationship

`master.principal_relationship` is the account correlation model.

Purpose:

```txt
same human
duplicate candidate
merged into
transferred to
support shadow for
```

Recommended shape:

```txt
id
from_tenant_id
from_principal_id
to_tenant_id
to_principal_id
relationship_type
verification_status
verified_method
is_primary
effective_from
effective_until
metadata
created_at, created_by
```

Recommended relationship types:

```txt
same_human
duplicate_candidate
merged_into
transferred_to
support_shadow_for
```

Rules:

- `principal_relationship` does not grant access.
- It is explicit, verified account correlation.
- Merge and transfer preserve audit history; do not rewrite old audit rows by default.
- Historical records may keep the old principal; active work ownership can be moved by controlled migration when needed.

---

## Product Owner Support

Do not add a separate `support_grant` table in this phase.

Product-owner support reuses the existing IAM engine through tenant-local support shadow principals.

Flow:

```txt
1. Product owner logs in through platform-control.
2. Product owner chooses Neon, Mesh, or Admin support entry.
3. Runtime creates or finds a tenant-local support shadow principal.
4. The shadow principal is bound to the platform-control subject in master.principal_identity_binding.
5. The shadow principal receives no access by default.
6. Time-boxed authority is granted through master.access_grant and/or master.delegation_grant.
7. Support activity is audited with both the shadow principal and the source platform-control identity.
```

Support shadow principal:

```txt
master.principal
  tenant_id = target tenant
  principal_type = support_user
  principal_source = support_jit
```

Support identity binding:

```txt
master.principal_identity_binding
  tenant_id = target tenant
  principal_id = support shadow principal
  realm_key = platform-control
  provider_code = keycloak
  subject_id = platform-control Keycloak sub
```

Support correlation:

```txt
master.principal_relationship
  relationship_type = support_shadow_for
```

Authority:

```txt
master.principal_persona
master.auth_group_member
master.access_grant
master.delegation_grant
```

Audit context must include:

```txt
acting_principal_id
source_realm_key
source_subject_id
source_platform_principal_id, when resolved
support_reason
ticket/reference
target_tenant_id
target_plane
```

This avoids a second authorization engine and keeps support access production-safe.

---

## Organic Partner/Supplier Onboarding

The design supports organic growth from a one-time supplier invite to a full subscribed tenant.

Example: a Neon customer issues a purchase order to a supplier that has no Athyper account.

1. Create a provisional partner/supplier tenant.

```txt
master.tenant
  realm_key = mesh
  tenant_type = supplier_prospect or partner_prospect
  status = invited or provisional
```

2. Create a pending relationship.

```txt
master.tenant_relationship
  from_tenant_id = supplier/prospect tenant
  to_tenant_id = customer tenant
  relationship_type = supplier_collaboration
  scopes = ['view_purchase_orders', 'acknowledge_po', 'submit_invoice']
  status = pending_invite
```

3. Send invite email. The invite token belongs in an invitation/event/workflow table, not in the core IAM relationship table.

4. Supplier signs up through Mesh.

```txt
master.principal
  tenant_id = supplier/prospect tenant
  principal_type = partner_user
  principal_source = invite_jit

master.principal_identity_binding
  realm_key = mesh
```

5. Activate the relationship after verification/acceptance.

```txt
master.tenant_relationship.status = active
```

6. If the supplier later subscribes to Neon, keep the same `master.tenant` and activate subscriptions/modules.

```txt
master.tenant.tenant_type = customer_partner
master.tenant_module_subscription
master.tenant_feature_entitlement
```

No tenant duplication is required.

---

## Authentication Boundaries

| App | Native realm | Native namespace | Support realm | Support namespace | Cookie | CSRF |
|-----|--------------|------------------|---------------|-------------------|--------|------|
| `neon` | `neon` | `neon` | `platform-control` | `platform` | `neon_sid` | `__csrf` |
| `mesh` | `mesh` | `mesh` | `platform-control` | `platform` | `mesh_sid` | `__mesh_csrf` |
| `admin` | `admin` | `admin` | `platform-control` | `platform` | `admin_sid` | `__admin_csrf` |

Realm selector cookies:

```txt
neon_realm=neon|platform
mesh_realm=mesh|platform
admin_realm=admin|platform
```

Admin authentication requirements:

- MFA mandatory.
- Hardware key preferred.
- Internal corporate IdP is acceptable with step-up controls.
- Customer/partner SSO must not grant admin-plane access.

Platform-control support tokens are accepted only by support entry resolvers. They are not native Neon, Mesh, or Admin tokens.

---

## Redis And Runtime Cache

Locked Redis namespaces:

```txt
neon      native Neon sessions
mesh      native Mesh sessions
admin     native Admin sessions
platform  platform-control support sessions
```

Backend IAM/cache keys must include realm or plane. Keys based only on Keycloak `sub` are not acceptable.

```txt
Current: session:{sub}:{tenant}:{entity}:{workbench}
Target:  session:{realmKey}:{sub}:{tenant}:{entity}:{workbench}

Current: principal_sessions:{sub}
Target:  principal_sessions:{realmKey}:{sub}

Current: bootstrap:{sub}:{tenantHash}
Target:  bootstrap:{realmKey}:{sub}:{tenantHash}
```

Redis is not durable authority for relationships, support access, delegated access, audit events, object ownership, or invitations.

---

## Object Storage

One shared MinIO/S3 application bucket remains locked for this phase.

Canonical key direction:

```txt
tenant/{tenant_id}/neon/{entity_type}/{entity_id}/{attachment_id}/v{n}/{filename}
tenant/{tenant_id}/mesh/{from_tenant_id}/relationship/{relationship_id}/staging/{attachment_id}/v{n}/{filename}
tenant/{tenant_id}/admin/{admin_context}/{attachment_id}/v{n}/{filename}
```

Rules:

- Tenant-owned active objects are authoritative only after tenant-owned workflow acceptance.
- Mesh uploads are staged/submitted until accepted.
- Browser clients receive route-authorized presigned URLs only.
- MinIO credentials are server-side only.
- CORS allows all product app origins that perform browser upload/download.

---

## Shared Support Services

Shared services remain shared and are separated by labels, DSNs, scoped tokens, indexes, and access rules.

```txt
telemetry-1                  Grafana
metrics-1                    Prometheus
alertmanager-1               alert routing
tracing-1                    Tempo
logging-1                    Loki
logshipper-1                 Grafana Alloy
socket-proxy-logshipper-1    read-only Docker discovery for logshipper
glitchtip-1                  Sentry-compatible error tracking
meilisearch-1                shared search
clamav-1                     shared upload scanner
mailhog-1                    local development only
```

Do not create per-app copies of these services in this phase.

---

## BFF Strategy

Each app owns its own BFF and session-to-context binding.

```txt
apps/neon/app/api/*   -> tenant session to tenant context
apps/mesh/app/api/*   -> partner session to relationship/delegated tenant context
apps/admin/app/api/*  -> internal admin session to audited platform context
```

Do not create one shared BFF serving all three trust levels.

---

## Deployment Decisions

Each app gets a separate container/service:

```txt
athyper-neon-web
athyper-mesh-web
athyper-admin-web
```

Gateway routing is host-based, not workbench-path-based:

```txt
Host(neon.athyper.com)  -> athyper-neon-web
Host(mesh.athyper.com)  -> athyper-mesh-web
Host(admin.athyper.com) -> athyper-admin-web
```

Admin must be independently deployable and isolatable.

---

## Consequences

Accepted:

- Three host names are locked.
- Three apps in one monorepo are locked.
- One primary database is locked.
- The database foundation remains `master.*`.
- Add only `master.tenant_relationship` and `master.principal_relationship` for this phase.
- Do not add a parallel global `iam.*` account model in this phase.
- Product-owner support uses tenant-local support shadow principals.
- Partner/supplier collaboration uses `master.tenant_relationship`.
- Duplicate, merge, transfer, and support-shadow account correlation uses `master.principal_relationship`.
- Organic supplier onboarding starts with provisional partner/supplier tenants and can later grow into a subscribed Neon tenant.
- Redis, object storage, search, and observability remain shared infrastructure with explicit boundaries.

Do not:

- Add internal admin routes back into `apps/neon`.
- Treat `platform-control` as the native Admin realm.
- Treat email as a security key.
- Treat `principal_relationship` as an access grant.
- Let Mesh directly mutate tenant-owned business records.
- Use Redis as durable authorization.

---

## Locked Contract

The locked architecture is:

```txt
neon.athyper.com   -> apps/neon   -> realm neon   -> namespace neon   -> cookie neon_sid
mesh.athyper.com   -> apps/mesh   -> realm mesh   -> namespace mesh   -> cookie mesh_sid
admin.athyper.com  -> apps/admin  -> realm admin  -> namespace admin  -> cookie admin_sid

platform-control   -> support realm -> namespace platform -> support shadow principals
```

The locked database foundation is:

```txt
KEEP:
master.tenant
master.principal
master.principal_identity_binding
master.principal_persona
master.auth_group_member
master.access_grant
master.delegation_grant

ADD:
master.tenant_relationship
master.principal_relationship
```

This is the production baseline for the three-plane architecture.
