// Canonical health shape — matches the { healthy: boolean } contract used
// across all existing adapters (db, auth, object-storage, redis, AI providers).
export interface HealthContribution {
  healthy: boolean;
  message?: string;
  latencyMs?: number;
}

export type HealthCheck = () => Promise<HealthContribution>;
