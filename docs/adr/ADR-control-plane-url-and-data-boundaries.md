# ADR: Control Plane URL and Data Boundaries

**Status:** Superseded  
**Date:** 2026-05-21  
**Deciders:** Architecture  

**Superseded by:** `ADR-three-plane-application-architecture.md`  

---

## Context

Athyper needs distinct product/control-plane surfaces for customer users, partners, and internal admins while keeping the implementation practical during the current product stage.

The decision must settle three boundaries:

- URL and product identity
- Application shell and codebase shape
- Database and tenant access model

The product brands are:

| Host | Product | Control plane |
|------|---------|---------------|
| `neon.athyper.com` | Business Operating Platform | User control plane |
| `admin.athyper.com` | Business Technology Platform | Internal admin control plane |
| `mesh.athyper.com` | Business Collaboration Network | Partner control plane |

---

## Decision

Athyper will use **one application shell/codebase**, **one primary database**, and **strong route/host separation** for the three control planes.

### Production URLs

```txt
neon.athyper.com
admin.athyper.com
mesh.athyper.com
```

### Local URLs

```txt
neon.athyper.local
admin.athyper.local
mesh.athyper.local
```

### Control Plane Ownership

```txt
User    -> neon.athyper.com
Admin   -> admin.athyper.com
Partner -> mesh.athyper.com
```

Tenant/customer context lives inside each control plane rather than being the primary product subdomain.

Examples:

```txt
neon.athyper.com/app/ssk/dashboard
admin.athyper.com/tenants/ssk
mesh.athyper.com/tenants/ssk
```

---

## Data Boundary

Athyper will use **one primary database** for the user, partner, and admin control planes.

The core access model is:

- Clear tables for `tenants`, `users`, `memberships`, `partners`, `partner_tenants`, `roles`, and `permissions`.
- Every tenant-owned business table must carry `tenant_id`.
- Partner access must be granted only through explicit tenant assignment.
- Admin access must be guarded, audited, and minimized.
- Admin functionality is treated as a control plane, not as a larger customer user role.

---

## Security Requirements

The shared codebase/database decision does not weaken the security boundary. The boundary is enforced through host separation, route guards, authorization policies, tenant scoping, and audit logging.

Admin routes must support stricter controls over time, including:

- Stronger authentication requirements
- Dedicated authorization checks
- Full audit logs for sensitive operations
- Explicit tenant selection
- Reason-required impersonation or tenant access
- Optional future IP allowlists, SSO-only access, or runtime hardening

Partner routes must never infer access from organization membership alone. A partner principal can operate on a tenant only when an explicit `partner_tenants` relationship grants that access.

---

## Consequences

### Accepted

- The product/control-plane URL model is locked.
- The codebase remains unified for now.
- The primary transactional database remains shared for now.
- Authorization and auditing become first-class architecture requirements.
- Product identity is represented by host:
  - `neon` for user operations
  - `admin` for internal platform operations
  - `mesh` for partner collaboration

### Revisit Triggers

Revisit separate deployments if:

- Admin needs an independent release cadence.
- Admin requires a materially different runtime security posture.
- Partner or admin surfaces grow large enough to slow delivery inside one app.

Revisit separate databases if:

- Enterprise contracts require physical data isolation.
- Regional data residency requires it.
- Large tenants require dedicated infrastructure.
- Analytics/reporting workload harms transactional performance.
- Compliance requires isolated write-once audit storage.

---

## Locked Contract

Do not introduce a fourth production control-plane URL or move tenant identity into the primary subdomain without a new ADR.

The locked control-plane mapping is:

```txt
neon.athyper.com  -> User control plane
admin.athyper.com -> Internal admin control plane
mesh.athyper.com  -> Partner control plane
```
