/**
 * ServiceRegistry — Phase 1.3
 *
 * Allows any service to register a named health contributor so that
 * /healthz aggregates service-level health alongside adapter-level health.
 *
 * Used in api.ts: the healthChecks Map is passed in; services add entries
 * at route registration time via registerHealthCheck().
 *
 * Pattern:
 *   // In route factory:
 *   deps.registry.registerHealthCheck("notifications", async () => {
 *     const depth = await getQueueDepth();
 *     return depth > 10_000
 *       ? { status: "degraded", message: `queue depth ${depth}` }
 *       : { status: "healthy" };
 *   });
 */

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthContribution {
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
}

export type HealthCheck = () => Promise<HealthContribution>;

export class ServiceRegistry {
  private readonly healthChecks: Map<string, HealthCheck>;

  constructor(healthChecks: Map<string, HealthCheck>) {
    this.healthChecks = healthChecks;
  }

  /**
   * Register a health contributor under the given name.
   * Duplicate names overwrite the previous registration — last write wins.
   */
  registerHealthCheck(name: string, check: HealthCheck): void {
    this.healthChecks.set(name, check);
  }

  /**
   * Deregister a health contributor (e.g. when an optional service is disabled).
   */
  deregisterHealthCheck(name: string): void {
    this.healthChecks.delete(name);
  }

  /**
   * Returns a snapshot of all registered check names (for diagnostics).
   */
  listHealthChecks(): string[] {
    return [...this.healthChecks.keys()];
  }
}
