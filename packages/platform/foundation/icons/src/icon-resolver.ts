/**
 * @athyper/platform-icons — IconResolver interface and factory.
 *
 * Wraps any icon registry lookup behind a stable `resolve(key)` interface.
 * A tenant overlay map can be layered on top via `withOverrides()` so custom
 * icons can be injected without patching the platform registries.
 */

import type { IconComponent, IconResolverFn, TenantIconOverrides } from "./types.js";

/** Resolver object returned by `createRegistryResolver()`. */
export interface IconResolver {
  /**
   * Resolve a key to its icon component. Returns `undefined` for unknown
   * keys so callers can apply their own fallback (e.g. Lucide's CircleHelp).
   */
  resolve: IconResolverFn;

  /**
   * Returns a new resolver that checks the given override map first, then
   * falls through to this resolver. Compose multiple resolvers in order:
   *   tenant.withOverrides(overrides).resolve(key)
   */
  withOverrides: (overrides: TenantIconOverrides) => IconResolver;
}

/**
 * Wraps a plain lookup function (e.g. `getModuleIcon`) in an `IconResolver`.
 *
 * @example
 * const moduleResolver = createRegistryResolver(getModuleIcon);
 * const tenantResolver = moduleResolver.withOverrides({ FND: MyCustomIcon });
 * const icon = tenantResolver.resolve("FND"); // returns MyCustomIcon
 */
export function createRegistryResolver(lookup: IconResolverFn): IconResolver {
  return {
    resolve: lookup,
    withOverrides(overrides: TenantIconOverrides): IconResolver {
      return createRegistryResolver((key: string): IconComponent | undefined =>
        overrides[key] ?? lookup(key),
      );
    },
  };
}

/**
 * Merges multiple resolvers into one. They are tried in order; the first
 * non-undefined result wins.
 *
 * @example
 * const combined = mergeResolvers(entityResolver, moduleResolver);
 * combined.resolve("shopping-cart"); // entity icon
 * combined.resolve("BUY");           // module icon
 */
export function mergeResolvers(...resolvers: IconResolver[]): IconResolver {
  return createRegistryResolver((key: string): IconComponent | undefined => {
    for (const r of resolvers) {
      const result = r.resolve(key);
      if (result !== undefined) return result;
    }
    return undefined;
  });
}
