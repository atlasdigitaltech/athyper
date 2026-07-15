# Neon Web Keycloak Contract

## Responsibility boundary

Keycloak authenticates the tenant principal and supplies coarse client access.
Neon resolves tenant membership, Legal Entity context, Operating Organization
context, Company Code scope, permissions, and denies from Neon RBAC.

Keycloak must not contain Procurement Organization, Sales Organization, Company
Code membership, permission, or Operating Organization objects.

## `neon-web` client

The client remains a public Authorization Code client using PKCE S256. Direct
grants remain disabled, `fullScopeAllowed` remains false, and the
`athyper-api-runtime` audience plus `neon-web.AUTHORIZED` role remain enabled.

The client-level full group-membership mapper is removed. The organization
scope is not a default Neon client scope.

## Access-token contract

The business authorization contract is limited to:

```text
iss, sub, aud, azp, sid, acr, amr, auth_time
resource_access.neon-web.roles = [AUTHORIZED]
```

`tenant_id`, `tenant_code`, `allowed_tenants`, persona, plane, group, and
organization claims are not authorization inputs. During migration, discovery
claims may remain in ID token/UserInfo only. `tenant_id` may be retained as a
temporary shadow consistency check, but it never selects or grants scope.

## Legal Entity migration

Keycloak organization membership is an optional discovery projection only. Neon
resolves the authoritative Legal Entity through
`master.legal_entity_identity_binding`, then discovers Legal Entity and
Operating Organization work contexts from Neon RBAC.
