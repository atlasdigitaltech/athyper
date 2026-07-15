import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(import.meta.dirname, "../../../routes/compiled-entity.route.ts"), "utf8");
const listener = readFileSync(resolve(import.meta.dirname, "../../../../../../src/services/cache-invalidation/listener.ts"), "utf8");
const bootstrap = readFileSync(resolve(import.meta.dirname, "../../../routes/runtime-bootstrap.route.ts"), "utf8");

describe("production execution descriptor integration", () => {
  it("serves a dedicated immutable descriptor route with cache/hash headers", () => {
    expect(route).toContain('/metadata/entities/:entity/execution-descriptor');
    expect(route).toContain('res.setHeader("X-Descriptor-Cache", result.cacheState)');
    expect(route).toContain('res.setHeader("X-Descriptor-Hash", result.descriptor.identity.compiledHash)');
    expect(route).toContain("res.json(result.serialized)");
  });

  it("uses provider generation validation and retires the fingerprint SQL path", () => {
    const generationPath = route.indexOf("if (cache && tenantId && executionResolution)");
    expect(generationPath).toBeGreaterThan(0);
    expect(route).not.toContain("ALLOW_LEGACY_DESCRIPTOR_FINGERPRINT_CACHE");
    expect(route).not.toContain("fpQuery");
    expect(route).not.toContain("legacyDescriptorFingerprintCacheEnabled");
  });

  it("does not scan or delete Redis keys in the descriptor recovery listener", () => {
    expect(listener).not.toContain("redis.scan(");
    expect(listener).not.toContain("redis.del(");
    expect(listener).toContain("incrementDescriptorGenerations");
    expect(listener).toContain("scheduleReconnect");
  });

  it("uses exact generation increments in the direct approval bridge", () => {
    const start = route.indexOf("export async function invalidateDescriptorCache");
    const body = route.slice(start);
    expect(body).toContain("cache.incr!");
    expect(body).not.toContain("cache.del(");
  });

  it("assembles shallow relation projections server-side and uses MGET for warm validation", () => {
    expect(bootstrap).toContain('/metadata/entities/:entity/runtime-bootstrap');
    expect(bootstrap).toContain("await this.options.redis.mget(...keys)");
    expect(bootstrap).toContain("Promise.all([...relationTargets]");
    expect(bootstrap).not.toContain("fetch(");
  });
});
