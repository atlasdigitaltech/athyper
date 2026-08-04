// Orchestrator: takes a resolver registry + per-request inputs, returns an
// EffectivePermissionContext. Lifted out of middleware so non-Express callers
// (background jobs, tests, SSE handlers) can produce a context with the same
// guarantees.

import type {
  EffectivePermissionContext,
  ResolverInput,
} from "./types.js";
import type { PermissionResolverRegistry } from "./resolvers/registry.js";

/**
 * Build the EffectivePermissionContext for the active request. Throws when
 * the resolver cannot find a canonical authority binding; callers translate that
 * into a 403 at the HTTP boundary.
 */
export async function buildEffectivePermissionContext(
  registry: PermissionResolverRegistry,
  input: ResolverInput,
): Promise<EffectivePermissionContext> {
  const resolver = registry.get(input.planeKey);
  return resolver.build(input);
}
