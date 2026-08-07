export interface CacheHealthContribution {
  healthy: boolean;
  latencyMs?: number;
  message?: string;
}

export interface CacheHealth {
  healthCheck(): Promise<CacheHealthContribution>;
}
