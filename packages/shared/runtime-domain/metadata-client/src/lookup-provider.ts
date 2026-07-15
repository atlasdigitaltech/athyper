/**
 * @athyper/metadata-client — Lookup Provider
 *
 * Two-tier lookup resolution:
 *   Tier 1: Hot set bootstrapped at login (~15-20 high-frequency domains)
 *   Tier 2: Lazy-load other domains on first access
 *
 * Field renderers call getValues(domainCode) — it resolves from
 * cache or fetches on demand. Never bulk-fetches all domains.
 *
 * IMPORTANT — tenant switch:
 *   Call clearLookupCache() immediately after a tenant switch or logout.
 *   The cache is module-level (process-scoped), so stale values from a
 *   previous tenant will persist across re-renders if not cleared.
 */
import { type LookupValue } from "@athyper/api-contracts/metadata";
import { type MetadataClient } from "@athyper/api-client";

/** Resolved domain values, keyed by the caller-supplied domain code. */
const domainCache = new Map<string, LookupValue[]>();

/**
 * In-flight fetch promises, keyed by domain code.
 * Used to deduplicate concurrent requests for the same domain (thundering herd prevention).
 */
const inFlightRequests = new Map<string, Promise<LookupValue[]>>();

/**
 * In-flight bootstrap promise.
 * Stored so concurrent callers all await the same fetch rather than
 * issuing duplicate hot-set requests.
 */
let bootstrapPromise: Promise<void> | null = null;

/**
 * Bootstrap the hot set — call once at login.
 * Concurrent callers share the same in-flight Promise; subsequent calls
 * after the hot set has loaded are no-ops.
 */
export async function bootstrapHotSet(client: MetadataClient): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      const bundles = await client.getHotSetLookups();
      for (const bundle of bundles) {
        domainCache.set(bundle.domain.code, bundle.values);
      }
    } catch (error) {
      // Allow the next login/render attempt to retry after a transient outage.
      bootstrapPromise = null;
      throw error;
    }
  })();

  return bootstrapPromise;
}

/**
 * Get lookup values for a domain code.
 * Returns from cache if available, deduplicates concurrent fetches for the
 * same domain, and falls back to an on-demand fetch on cache miss.
 */
export async function getValues(
  domainCode: string,
  client: MetadataClient,
): Promise<LookupValue[]> {
  const cached = domainCache.get(domainCode);
  if (cached) return cached;

  // Reuse an in-flight request for this domain if one is already running.
  const inFlight = inFlightRequests.get(domainCode);
  if (inFlight) return inFlight;

  const promise = client.getLookupDomainBundle(domainCode).then((bundle) => {
    // Store under the caller's code (the key they'll use on the next lookup),
    // not bundle.domain.code — those can differ by case or alias.
    domainCache.set(domainCode, bundle.values);
    inFlightRequests.delete(domainCode);
    return bundle.values;
  }).catch((err) => {
    // Remove the in-flight entry on failure so callers can retry.
    inFlightRequests.delete(domainCode);
    throw err;
  });

  inFlightRequests.set(domainCode, promise);
  return promise;
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
 * Clear the entire lookup cache and reset bootstrap state.
 * Must be called on tenant switch or logout to prevent cross-tenant data leakage.
 */
export function clearLookupCache(): void {
  domainCache.clear();
  inFlightRequests.clear();
  bootstrapPromise = null;
}
