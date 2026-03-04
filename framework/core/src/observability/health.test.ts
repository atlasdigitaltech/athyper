import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  HealthCheckRegistry,
  createHealthChecker,
  createDbHealthChecker,
  createCacheHealthChecker,
} from "./health.js";

describe("Health Check System", () => {
  let registry: HealthCheckRegistry;

  beforeEach(() => {
    registry = new HealthCheckRegistry();
  });

  describe("HealthCheckRegistry", () => {
    it("should register and check a health checker", async () => {
      const checker = vi.fn().mockResolvedValue({
        status: "healthy",
        timestamp: new Date(),
      });

      registry.register("test", checker, { type: "internal", required: true });

      const result = await registry.checkOne("test");

      expect(result).toBeDefined();
      expect(result?.name).toBe("test");
      expect(result?.type).toBe("internal");
      expect(result?.required).toBe(true);
      expect(result?.result.status).toBe("healthy");
      expect(checker).toHaveBeenCalled();
    });

    it("should handle checker errors", async () => {
      const checker = vi.fn().mockRejectedValue(new Error("Connection failed"));

      registry.register("failing", checker, { type: "database", required: true });

      const result = await registry.checkOne("failing");

      expect(result?.result.status).toBe("unhealthy");
      expect(result?.result.message).toBe("Connection failed");
    });

    it("should check all dependencies", async () => {
      registry.register(
        "db",
        async () => ({ status: "healthy", timestamp: new Date() }),
        { type: "database", required: true }
      );

      registry.register(
        "cache",
        async () => ({ status: "healthy", timestamp: new Date() }),
        { type: "cache", required: false }
      );

      const results = await registry.checkAll();

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.name)).toContain("db");
      expect(results.map((r) => r.name)).toContain("cache");
    });

    it("should calculate system health status", async () => {
      registry.register(
        "db",
        async () => ({ status: "healthy", timestamp: new Date() }),
        { type: "database", required: true }
      );

      registry.register(
        "cache",
        async () => ({ status: "degraded", timestamp: new Date() }),
        { type: "cache", required: false }
      );

      const health = await registry.getSystemHealth();

      expect(health.status).toBe("degraded"); // Non-required degraded = overall degraded
      expect(health.dependencies).toHaveLength(2);
    });

    it("should be unhealthy if required dependency fails", async () => {
      registry.register(
        "db",
        async () => ({ status: "unhealthy", timestamp: new Date() }),
        { type: "database", required: true }
      );

      const health = await registry.getSystemHealth();

      expect(health.status).toBe("unhealthy");
    });

    it("should be ready only if all required dependencies are healthy", async () => {
      registry.register(
        "db",
        async () => ({ status: "healthy", timestamp: new Date() }),
        { type: "database", required: true }
      );

      registry.register(
        "cache",
        async () => ({ status: "unhealthy", timestamp: new Date() }),
        { type: "cache", required: false }
      );

      const isReady = await registry.isReady();

      expect(isReady).toBe(true); // Non-required failures don't affect readiness
    });

    it("should not be ready if required dependency is unhealthy", async () => {
      registry.register(
        "db",
        async () => ({ status: "unhealthy", timestamp: new Date() }),
        { type: "database", required: true }
      );

      const isReady = await registry.isReady();

      expect(isReady).toBe(false);
    });

    it("should unregister a checker", async () => {
      registry.register(
        "test",
        async () => ({ status: "healthy", timestamp: new Date() }),
        { type: "internal" }
      );

      registry.unregister("test");

      const result = await registry.checkOne("test");
      expect(result).toBeUndefined();
    });

    it("should list registered checkers", () => {
      registry.register(
        "db",
        async () => ({ status: "healthy", timestamp: new Date() }),
        { type: "database", required: true }
      );

      registry.register(
        "cache",
        async () => ({ status: "healthy", timestamp: new Date() }),
        { type: "cache", required: false }
      );

      const list = registry.list();

      expect(list).toHaveLength(2);
      expect(list[0]).toMatchObject({ name: "db", type: "database", required: true });
      expect(list[1]).toMatchObject({ name: "cache", type: "cache", required: false });
    });
  });

  describe("Helper Functions", () => {
    it("should create a simple health checker", async () => {
      const checker = createHealthChecker(async () => true, {
        healthyMessage: "All good",
        unhealthyMessage: "Not good",
      });

      const result = await checker();

      expect(result.status).toBe("healthy");
      expect(result.message).toBe("All good");
    });

    it("should handle checker failures", async () => {
      const checker = createHealthChecker(() => {
        throw new Error("Failed");
      });

      const result = await checker();

      expect(result.status).toBe("unhealthy");
      expect(result.message).toBe("Failed");
    });

    it("should create a DB health checker", async () => {
      const db = {
        health: vi.fn().mockResolvedValue({ healthy: true, message: "Connected" }),
      };

      const checker = createDbHealthChecker(db);
      const result = await checker();

      expect(result.status).toBe("healthy");
      expect(result.message).toBe("Connected");
      expect(db.health).toHaveBeenCalled();
    });

    it("should create a cache health checker", async () => {
      const cache = {
        get: vi.fn().mockResolvedValue(null),
      };

      const checker = createCacheHealthChecker(cache);
      const result = await checker();

      expect(result.status).toBe("healthy");
      expect(cache.get).toHaveBeenCalledWith("__health_check__");
    });
  });
});
