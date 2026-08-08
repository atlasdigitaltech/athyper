export type HealthStatus = "healthy" | "degraded" | "unhealthy";

/** Runtime health contribution from one registered capability. */
export interface HealthContribution {
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
}

export type HealthCheck = () => Promise<HealthContribution>;
