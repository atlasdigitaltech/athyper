# Frontend provider and query lifecycle

Phase 6 uses `@athyper/platform-query` for cache policy and `@athyper/platform-shell-app-foundation` for focused dependency injection. Neither package mutates a process-global QueryClient. `createServerQueryClient()` creates a new cache for every server render; `getBrowserQueryClient()` creates one cache for the current browser tab and returns a fresh cache when invoked on the server.

Principal-sensitive keys begin with `principalQueryKeys.root(scope)`: `principal`, plane, tenant ID, and auth epoch. Feature packages append their own stable segments. Server prefetch is exported from `@athyper/platform-query/server` and dehydration requires both `safeToDehydrate` and `principalScoped` metadata under the active root. No query persistence adapter or browser-storage access is present.

`PrincipalQueryLifecycle` compares plane, tenant, principal, and auth epoch. A transition cancels the previous root before removing it. The keyed application boundary also remounts toast, surface, and shell state on a principal transition. Authentication failures and `AUTH_CONTEXT_MISMATCH` invalidate the current query scope; ordinary authorization failures do not destroy an otherwise valid session.

Safe reads retry only classified network, timeout, dependency, and rate-limit failures, at most twice with bounded jitter. Mutations never retry by default. Optimistic changes require a non-empty ETag and return an idempotent rollback handle.

Each protected root layout performs the same sequence: resolve sanitized BFF session, redirect before rendering if it is not ready, call experience through the same-origin allowlisted relay, verify session/bootstrap coordinates, seed one safe bootstrap query, dehydrate it, apply the resolved appearance in `ThemeScript`, and then enter the focused client providers. Session, expiry, actions, experience revision, navigation, API client, permissions, flags, toast, surface stack, and shell selection remain separate contexts.

The client freshness bridge schedules a router refresh at the session-expiry skew boundary. Context-switch, auth-epoch, and experience-revision consumers dispatch `requestBootstrapRevalidation(reason)` only when those revisions change; routine navigation does not refetch bootstrap.
