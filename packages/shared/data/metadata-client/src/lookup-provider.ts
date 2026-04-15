/**
 * @athyper/metadata-client — Lookup Provider
 *
 * Two-tier lookup resolution:
 *   Tier 1: Hot set bootstrapped at login (~15-20 high-frequency domains)
 *   Tier 2: Lazy-load other domains on first access
 *
 * Field renderers call getValues(domainCode) — it resolves from
 * cache or fetches on demand. Never bulk-fetches all domains.
 */
import { type LookupValue, type LookupDomainBundle } from "@athyper/api-contracts/metadata";
import { type MetadataClient } from "@athyper/api-client";

/** In-memory cache of loaded domain bundles. */
const domainCache = new Map<string, LookupValue[]>();

/** Whether the hot set has been loaded. */
let hotSetLoaded = false;

/**
 * Bootstrap the hot set — call once at login.
 * Loads high-frequency domains (status, currency, country, UoM, etc.)
 */
export async function bootstrapHotSet(client: MetadataClient): Promise<void> {
  if (hotSetLoaded) return;

  const bundles = await client.getHotSetLookups();
  for (const bundle of bundles) {
    domainCache.set(bundle.domain.code, bundle.values);
  }
  hotSetLoaded = true;
}

/**
 * Get lookup values for a domain code.
 * Returns from cache if available, otherwise fetches on demand.
 */
export async function getValues(
  domainCode: string,
  client: MetadataClient,
): Promise<LookupValue[]> {
  const cached = domainCache.get(domainCode);
  if (cached) return cached;

  const bundle = await client.getLookupDomainBundle(domainCode);
  domainCache.set(bundle.domain.code, bundle.values);
  return bundle.values;
}

/**
 * Get active lookup values for a domain — filtered and sorted.
 */
export async function getActiveValues(
  domainCode: string,
  client: MetadataClient,
): Promise<LookupValue[]> {
  const values = await getValues(domainCode, client);
  return values
    .filter((v) => v.status === "active")
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Check if a domain is already cached (in hot set or previously loaded).
 */
export function isDomainCached(domainCode: string): boolean {
  return domainCache.has(domainCode);
}

/**
 * Clear the lookup cache. Used for testing or after tenant switch.
 */
export function clearLookupCache(): void {
  domainCache.clear();
  hotSetLoaded = false;
}
