# Session configuration cache - Phase 2

## Scope

Neon now uses a bounded, server-side session configuration cache above authenticated `no-store` runtime fetches. Cache entries are isolated by tenant, plane, realm, principal, active organization, legal entity, company code, permission stamp, configuration version, namespace, and namespace-specific key parts.

The shared service is `getSessionConfiguration({ namespace, sessionIdentity, loader, policy })`. A consumer may add `keyParts` when a namespace contains multiple independently invalidated resources, such as saved views by entity.

## Behavior

- LRU entry bound: 500 entries per Neon process.
- Fresh, stale, and expired evaluation uses explicit millisecond policies.
- A stale entry is returned immediately while one background refresh runs.
- Concurrent misses for the same complete key await one loader promise.
- Generation-scoped invalidation prevents an older in-flight response from repopulating the cache.
- Rejected loaders are never cached.
- `null` and `undefined` are not cached unless a consumer explicitly supplies a short negative-cache policy.
- Diagnostics contain cache state, hashed key, namespace, generation, coalescing, negative-result status, duration, and outcome. Diagnostic sinks cannot break successful loads.

## Consumer policies

| Consumer | Fresh TTL | Stale window | Additional key |
| --- | ---: | ---: | --- |
| Search and lazy-list parameters | 60 seconds | 5 minutes | Parameter namespace |
| Feature snapshots | 30 seconds | 2 minutes | Parameter namespace |
| Theme snapshots | 5 minutes | 30 minutes | Parameter namespace |
| Permission aliases | 5 minutes | 30 minutes | None |
| Saved-view definitions/default selection | 30 seconds | 2 minutes | Entity code |

Browser callers of `/api/iam/parameters/effective` use the same scoped server cache. The response remains `Cache-Control: no-store` and exposes `X-Athyper-Cache` and `Server-Timing` diagnostics.

Default-view selection and explicit saved-view state resolution derive from the same cached definition list, so the presenter does not issue a second upstream request.

## Invalidation

The cache subscribes to the existing `descriptor-runtime:invalidate:v1` generation stream. Tenant, plane, realm, principal, and permission-stamp scopes are projected onto session configuration entries. Context and permission changes therefore invalidate compatible entries, while the complete key prevents reuse across a changed session context even before an event arrives.

Successful saved-view mutations through the Neon relay invalidate the current principal/entity entry immediately. TTL remains the recovery safety net if an external invalidation event is missed.

## Operational checks

Inspect server logs for `[session-configuration-cache]` events. For parameter API calls, inspect `X-Athyper-Cache` and `Server-Timing` response headers. A normal verification sequence is cold request (`miss`), immediate repeat (`hit`), wait past the fresh TTL (`stale`), then confirm the background refresh restores `hit` behavior.
