export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthContribution {
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
}

export type HealthCheck = () => Promise<HealthContribution>;

export class HealthRegistry {
  private readonly checks = new Map<string, HealthCheck>();

  register(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }

  deregister(name: string): void {
    this.checks.delete(name);
  }

  list(): string[] {
    return [...this.checks.keys()];
  }

  entries(): ReadonlyArray<readonly [string, HealthCheck]> {
    return [...this.checks.entries()];
  }
}
