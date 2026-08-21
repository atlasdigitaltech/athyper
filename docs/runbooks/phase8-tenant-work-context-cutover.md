# Phase 8 tenant and work-context cutover

## Runtime contract

The BFF is the only component that creates runtime context headers:

```text
X-Tenant-ID
X-Tenant-Code
X-Work-Context-Type
X-Work-Context-ID
X-Work-Context-Domain
X-Auth-Epoch
X-Scope-Version
```

`X-Org` is not an authorization input at the BFF relay boundary. `activeOrg`
may remain in the public session response temporarily for UI compatibility, but
the server session and downstream authorization use `activeWorkContext`.

## Rollout

1. Deploy the BFF and Neon runtime changes with
   `AUTH_BFF_LEGACY_SESSION_INVALIDATE=false`.
2. Observe `context_activation`, `AUTH_CONTEXT_MISMATCH`, and session migration
   audit events for one configured grace period.
3. Confirm every active Neon session has a typed `activeWorkContext` after its
   next request or refresh.
4. Set `AUTH_BFF_LEGACY_SESSION_INVALIDATE=true` and restart the BFF. Any
   remaining session with `activeOrg` but no typed context is revoked and must
   authenticate again.
5. Remove the compatibility environment variable and old UI context payloads
   after the support window.

## Troubleshooting

- `AUTH_CONTEXT_STALE` means the Operating Organization scope version changed;
  re-query `/api/auth/contexts` and select the current context.
- `AUTH_CONTEXT_MISMATCH` means tenant, work-context type, domain, or scope
  version did not match the verified Neon DB state.
- A valid Keycloak login with no context is not an error; the user must select
  an authorized Legal Entity or Operating Organization before protected work.

## Audit requirements

Record tenant, principal, context type/id/domain, auth epoch, scope version,
permission, resource, decision, request id, and timestamp for every context or
permission decision. Membership removal invalidates affected caches immediately.
