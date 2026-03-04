/**
 * Circuit breaker and retry protection for adapters
 * Wraps adapter operations with resilience patterns
 */

import { CircuitBreaker, withRetry, DB_RETRY_POLICY, API_RETRY_POLICY } from "@athyper/core";

import type { DbAdapter } from "@athyper/adapter-db";

/**
 * Circuit breaker registry for adapters
 */
export class AdapterCircuitBreakers {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create circuit breaker for adapter
   */
  getOrCreate(name: string, config?: any): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breaker metrics
   */
  getAllMetrics() {
    const metrics: Record<string, any> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      metrics[name] = breaker.getMetrics();
    }
    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

/**
 * Wrap database adapter with circuit breaker and retry
 */
export function protectDbAdapter(adapter: DbAdapter, breakers: AdapterCircuitBreakers): DbAdapter {
  const breaker = breakers.getOrCreate("db", {
    failureThreshold: 5,
    failureWindow: 60000,
    resetTimeout: 30000,
    successThreshold: 2,
  });

  return {
    ...adapter,
    kysely: adapter.kysely, // Kysely handles its own retry/connection pooling

    async withTx<T>(db: any, fn: (tx: any) => Promise<T>): Promise<T> {
      return breaker.execute(() =>
        withRetry(() => adapter.withTx(db, fn), DB_RETRY_POLICY)
      );
    },

    async withTxIsolation<T>(
      db: any,
      isolationLevel: "read uncommitted" | "read committed" | "repeatable read" | "serializable",
      fn: (tx: any) => Promise<T>
    ): Promise<T> {
      return breaker.execute(() =>
        withRetry(() => adapter.withTxIsolation(db, isolationLevel, fn), DB_RETRY_POLICY)
      );
    },

    async health(): Promise<{ healthy: boolean; message?: string }> {
      try {
        return await breaker.execute(() => adapter.health());
      } catch (error) {
        return {
          healthy: false,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },

    getPoolStats() {
      return adapter.getPoolStats(); // Local state only — no circuit breaker needed
    },

    async close(): Promise<void> {
      await adapter.close();
    },
  };
}

/**
 * Wrap cache adapter with circuit breaker and retry
 */
export function protectCacheAdapter(adapter: any, breakers: AdapterCircuitBreakers): any {
  const breaker = breakers.getOrCreate("cache", {
    failureThreshold: 10,
    failureWindow: 60000,
    resetTimeout: 15000,
    successThreshold: 3,
  });

  const retryPolicy = {
    maxAttempts: 2,
    initialDelay: 100,
    maxDelay: 1000,
    strategy: "exponential" as const,
    multiplier: 2,
    jitter: true,
  };

  return {
    ...adapter,

    async get(key: string): Promise<string | null> {
      try {
        return await breaker.execute(() =>
          withRetry(() => adapter.get(key), retryPolicy)
        );
      } catch (error) {
        // Cache failures should not break the application
        console.error(JSON.stringify({ msg: "cache_get_failed", key, error: String(error) }));
        return null;
      }
    },

    async set(key: string, value: string, ttl?: number): Promise<void> {
      try {
        await breaker.execute(() =>
          withRetry(() => adapter.set(key, value, ttl), retryPolicy)
        );
      } catch (error) {
        console.error(JSON.stringify({ msg: "cache_set_failed", key, error: String(error) }));
      }
    },

    async del(key: string): Promise<void> {
      try {
        await breaker.execute(() =>
          withRetry(() => adapter.del(key), retryPolicy)
        );
      } catch (error) {
        console.error(JSON.stringify({ msg: "cache_del_failed", key, error: String(error) }));
      }
    },

    async disconnect(): Promise<void> {
      await adapter.disconnect();
    },
  };
}

/**
 * Wrap object storage adapter with circuit breaker and retry
 */
export function protectObjectStorageAdapter(adapter: any, breakers: AdapterCircuitBreakers): any {
  const breaker = breakers.getOrCreate("object_storage", {
    failureThreshold: 5,
    failureWindow: 60000,
    resetTimeout: 30000,
    successThreshold: 2,
  });

  return {
    ...adapter,

    async put(key: string, body: Buffer | string, opts?: any): Promise<void> {
      return breaker.execute(() =>
        withRetry(() => adapter.put(key, body, opts), API_RETRY_POLICY)
      );
    },

    async get(key: string): Promise<Buffer> {
      return breaker.execute(() =>
        withRetry(() => adapter.get(key), API_RETRY_POLICY)
      );
    },

    async delete(key: string): Promise<void> {
      return breaker.execute(() =>
        withRetry(() => adapter.delete(key), API_RETRY_POLICY)
      );
    },

    async exists(key: string): Promise<boolean> {
      return breaker.execute(() =>
        withRetry(() => adapter.exists(key), API_RETRY_POLICY)
      );
    },

    async list(prefix?: string): Promise<any[]> {
      return breaker.execute(() =>
        withRetry(() => adapter.list(prefix), API_RETRY_POLICY)
      );
    },

    async getPresignedUrl(key: string, expirySeconds?: number): Promise<string> {
      return breaker.execute(() =>
        withRetry(() => adapter.getPresignedUrl(key, expirySeconds), API_RETRY_POLICY)
      );
    },

    async putPresignedUrl(key: string, expirySeconds?: number): Promise<string> {
      return breaker.execute(() =>
        withRetry(() => adapter.putPresignedUrl(key, expirySeconds), API_RETRY_POLICY)
      );
    },

    async getMetadata(key: string): Promise<any> {
      return breaker.execute(() =>
        withRetry(() => adapter.getMetadata(key), API_RETRY_POLICY)
      );
    },

    async deleteMany(keys: string[]): Promise<void> {
      return breaker.execute(() =>
        withRetry(() => adapter.deleteMany(keys), API_RETRY_POLICY)
      );
    },

    async copyObject(sourceKey: string, destKey: string): Promise<void> {
      return breaker.execute(() =>
        withRetry(() => adapter.copyObject(sourceKey, destKey), API_RETRY_POLICY)
      );
    },

    async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
      try {
        return await breaker.execute(() => adapter.healthCheck());
      } catch (error) {
        return {
          healthy: false,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  };
}

/**
 * Wrap auth adapter with circuit breaker and retry
 */
export function protectAuthAdapter(adapter: any, breakers: AdapterCircuitBreakers): any {
  const breaker = breakers.getOrCreate("auth", {
    failureThreshold: 10,
    failureWindow: 60000,
    resetTimeout: 20000,
    successThreshold: 3,
  });

  return {
    ...adapter,

    async verifyToken(token: string): Promise<any> {
      return breaker.execute(() =>
        withRetry(() => adapter.verifyToken(token), {
          ...API_RETRY_POLICY,
          maxAttempts: 2, // Auth tokens shouldn't be retried too much
        })
      );
    },

    getIssuerUrl(): string {
      return adapter.getIssuerUrl();
    },
  };
}
