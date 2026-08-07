import type { HealthCheck } from "./health-check.js";

/**
 * Central registry of named health contributors, aggregated by /healthz.
 * Services register their health checks at route registration time.
 * Previously named ServiceRegistry — renamed to HealthRegistry to reflect
 * its single responsibility.
 */
export class HealthRegistry {
  private readonly healthChecks: Map<string, HealthCheck>;

  constructor(healthChecks: Map<string, HealthCheck>) {
    this.healthChecks = healthChecks;
  }

  /** Register a health contributor. Duplicate names overwrite — last write wins. */
  registerHealthCheck(name: string, check: HealthCheck): void {
    this.healthChecks.set(name, check);
  }

  /** Deregister a health contributor (e.g. when an optional service is disabled). */
  deregisterHealthCheck(name: string): void {
    this.healthChecks.delete(name);
  }

  /** Returns registered check names for diagnostics. */
  listHealthChecks(): string[] {
    return [...this.healthChecks.keys()];
  }
}

/** @deprecated Use HealthRegistry — ServiceRegistry was renamed. */
export { HealthRegistry as ServiceRegistry };
