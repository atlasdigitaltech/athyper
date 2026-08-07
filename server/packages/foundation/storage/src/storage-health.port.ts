export interface StorageHealthContribution {
  healthy: boolean;
  message?: string;
}

export interface StorageHealth {
  healthCheck(): Promise<StorageHealthContribution>;
}
