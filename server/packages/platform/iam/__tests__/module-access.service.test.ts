import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { getEffectiveModuleAccess } from "../permission/module-access.service.js";

const serviceSource = readFileSync(
  resolve(import.meta.dirname, "../permission/module-access.service.ts"),
  "utf8",
);

// ── Early-return path (no DB needed) ─────────────────────────────────────────

describe("getEffectiveModuleAccess — planVersionId guard", () => {
  const noopDb = {} as any;

  it("returns empty access when planVersionId is omitted", async () => {
    const result = await getEffectiveModuleAccess(noopDb, "tenant-1", "principal-1", {});
    expect(result.moduleIds).toHaveLength(0);
    expect(result.moduleCodes).toHaveLength(0);
    expect(result.workspaceIds).toHaveLength(0);
  });

  it("returns empty access when planVersionId is explicitly undefined", async () => {
    const result = await getEffectiveModuleAccess(noopDb, "tenant-1", "principal-1", {
      planVersionId: undefined,
    });
    expect(result.moduleIds).toHaveLength(0);
  });
});

// ── SQL structure verification (P1-C) ────────────────────────────────────────
// These tests guard against regressions where planVersionId is threaded
// through the options but never actually reaches the subscription entitlement
// SQL (the bug this task fixed).

describe("getEffectiveModuleAccess — P1-C subscription plan SQL", () => {
  it("queries control.subscription_plan_module (not the old plan_version table)", () => {
    expect(serviceSource).toContain("control.subscription_plan_module");
  });

  it("filters by subscription_plan_id (not plan_version_id column)", () => {
    expect(serviceSource).toContain("subscription_plan_id");
    expect(serviceSource).not.toContain("plan_version_id");
  });

  it("defines a plan_modules CTE that gates the role-binding query", () => {
    expect(serviceSource).toContain("plan_modules AS (");
    expect(serviceSource).toContain("JOIN plan_modules pm ON pm.module_id = permission.module_id");
  });

  it("applies an active-status filter on plan modules", () => {
    const planModuleBlock = serviceSource.slice(
      serviceSource.indexOf("plan_modules AS ("),
      serviceSource.indexOf("group_role_modules AS ("),
    );
    expect(planModuleBlock).toContain("status = 'active'");
  });

  it("casts planVersionId to uuid when binding", () => {
    expect(serviceSource).toContain("::uuid");
  });
});

// ── Cache key includes planVersionId ─────────────────────────────────────────

describe("getEffectiveModuleAccess — cache key isolation", () => {
  it("incorporates planVersionId in the cache key so different plans get distinct cache entries", () => {
    const cacheKeyFn = serviceSource.slice(
      serviceSource.indexOf("function moduleAccessCacheKey"),
      serviceSource.indexOf("\n}", serviceSource.indexOf("function moduleAccessCacheKey")) + 2,
    );
    expect(cacheKeyFn).toContain("planVersionId");
  });

  it("returns cached result without hitting DB when cache has a matching entry", async () => {
    const cachedAccess = {
      cache_version: 1,
      moduleIds: ["cached-module-id"],
      moduleCodes: ["acc"],
      workspaceIds: ["ws-1"],
      source: "role_binding" as const,
    };
    const mockCache = {
      get: vi.fn().mockResolvedValue(JSON.stringify(cachedAccess)),
      set: vi.fn(),
    };
    const result = await getEffectiveModuleAccess(
      {} as any,
      "tenant-1",
      "principal-1",
      { cache: mockCache, authEpoch: 1, planVersionId: "plan-uuid-1" },
    );
    expect(result.moduleIds).toContain("cached-module-id");
    expect(mockCache.get).toHaveBeenCalledOnce();
  });
});
