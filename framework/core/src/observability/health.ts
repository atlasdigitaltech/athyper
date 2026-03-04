/**
 * Health check system for production readiness
 * Provides comprehensive dependency health monitoring
 */

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheckResult {
  status: HealthStatus;
  message?: string;
  details?: Record<string, unknown>;
  duration?: number;
  timestamp: Date;
}

export interface DependencyHealth {
  name: string;
  type: "database" | "cache" | "storage" | "auth" | "queue" | "external" | "internal";
  required: boolean;
  result: HealthCheckResult;
}

export interface SystemHealth {
  status: HealthStatus;
  version?: string;
  uptime: number;
  timestamp: Date;
  dependencies: DependencyHealth[];
}

export type HealthChecker = () => Promise<HealthCheckResult>;

/**
 * Health check registry
 */
export class HealthCheckRegistry {
  private checkers = new Map<string, {
    checker: HealthChecker;
    type: DependencyHealth["type"];
    required: boolean;
  }>();

  /**
   * Register a health checker
   */
  register(
    name: string,
    checker: HealthChecker,
    options: {
      type: DependencyHealth["type"];
      required?: boolean;
    }
  ): void {
    this.checkers.set(name, {
      checker,
      type: options.type,
      required: options.required ?? true,
    });
  }

  /**
   * Unregister a health checker
   */
  unregister(name: string): void {
    this.checkers.delete(name);
  }

  /**
   * Check health of a specific dependency
   */
  async checkOne(name: string): Promise<DependencyHealth | undefined> {
    const entry = this.checkers.get(name);
    if (!entry) return undefined;

    const start = Date.now();
    try {
      const result = await entry.checker();
      return {
        name,
        type: entry.type,
        required: entry.required,
        result: {
          ...result,
          duration: Date.now() - start,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      return {
        name,
        type: entry.type,
        required: entry.required,
        result: {
          status: "unhealthy",
          message: error instanceof Error ? error.message : "Unknown error",
          duration: Date.now() - start,
          timestamp: new Date(),
        },
      };
    }
  }

  /**
   * Check health of all dependencies
   */
  async checkAll(): Promise<DependencyHealth[]> {
    const checks = Array.from(this.checkers.keys()).map((name) =>
      this.checkOne(name)
    );

    const results = await Promise.all(checks);
    return results.filter((r): r is DependencyHealth => r !== undefined);
  }

  /**
   * Get overall system health
   */
  async getSystemHealth(options?: {
    version?: string;
    uptime?: number;
  }): Promise<SystemHealth> {
    const dependencies = await this.checkAll();

    // Calculate overall status
    let status: HealthStatus = "healthy";

    for (const dep of dependencies) {
      if (dep.required && dep.result.status === "unhealthy") {
        status = "unhealthy";
        break;
      }
      if (dep.result.status === "degraded") {
        status = "degraded";
      }
    }

    return {
      status,
      version: options?.version,
      uptime: options?.uptime ?? process.uptime(),
      timestamp: new Date(),
      dependencies,
    };
  }

  /**
   * Check if system is ready (all required dependencies healthy)
   */
  async isReady(): Promise<boolean> {
    const dependencies = await this.checkAll();

    for (const dep of dependencies) {
      if (dep.required && dep.result.status !== "healthy") {
        return false;
      }
    }

    return true;
  }

  /**
   * Get list of registered checkers
   */
  list(): Array<{ name: string; type: string; required: boolean }> {
    return Array.from(this.checkers.entries()).map(([name, entry]) => ({
      name,
      type: entry.type,
      required: entry.required,
    }));
  }
}

/**
 * Create a simple health checker
 */
export function createHealthChecker(
  check: () => Promise<boolean> | boolean,
  options?: {
    healthyMessage?: string;
    unhealthyMessage?: string;
  }
): HealthChecker {
  return async () => {
    try {
      const isHealthy = await check();
      return {
        status: isHealthy ? "healthy" : "unhealthy",
        message: isHealthy
          ? options?.healthyMessage
          : options?.unhealthyMessage,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Health check failed",
        timestamp: new Date(),
      };
    }
  };
}

/**
 * Create a database health checker
 */
export function createDbHealthChecker(
  db: { health: () => Promise<{ healthy: boolean; message?: string }> }
): HealthChecker {
  return async () => {
    const result = await db.health();
    return {
      status: result.healthy ? "healthy" : "unhealthy",
      message: result.message,
      timestamp: new Date(),
    };
  };
}

/**
 * Create a cache health checker
 */
export function createCacheHealthChecker(
  cache: { get: (key: string) => Promise<string | null> }
): HealthChecker {
  return async () => {
    try {
      // Try to get a non-existent key (should return null)
      const _result = await cache.get("__health_check__");
      return {
        status: "healthy",
        message: "Cache is responding",
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Cache unreachable",
        timestamp: new Date(),
      };
    }
  };
}
