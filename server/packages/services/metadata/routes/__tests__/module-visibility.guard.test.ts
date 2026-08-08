import { describe, expect, it, vi } from "vitest";

import {
  hasModuleAccess,
  ModuleAccessDegradedError,
  ModuleAccessMisconfiguredError,
  type EffectiveModuleAccess,
  type ModuleAccessResolver,
} from "../module-visibility.guard.js";

// mode="use" skips the shared_infra SQL block so no real Kysely connection needed.
const noopDb = {} as any;

const emptyAccess: EffectiveModuleAccess = {
  moduleIds: [],
  moduleCodes: [],
  workspaceIds: [],
  source: "role_binding",
};

function makeResolver(result: EffectiveModuleAccess | Error): ModuleAccessResolver {
  if (result instanceof Error) {
    return vi.fn().mockRejectedValue(result);
  }
  return vi.fn().mockResolvedValue(result);
}

// ── Misconfiguration guard ────────────────────────────────────────────────────

describe("hasModuleAccess — misconfiguration", () => {
  it("throws ModuleAccessMisconfiguredError when resolver is undefined", async () => {
    await expect(
      hasModuleAccess(noopDb, "tenant-1", "principal-1", "module-1", undefined, undefined),
    ).rejects.toBeInstanceOf(ModuleAccessMisconfiguredError);
  });

  it("ModuleAccessMisconfiguredError has the correct name", async () => {
    const err = await hasModuleAccess(noopDb, "t", "p", "m", undefined, undefined).catch((e) => e);
    expect((err as ModuleAccessMisconfiguredError).name).toBe("ModuleAccessMisconfiguredError");
  });
});

// ── Null/empty input guard ────────────────────────────────────────────────────

describe("hasModuleAccess — null input → fail-closed (returns false)", () => {
  const resolver = makeResolver(emptyAccess);

  it("returns false when tenantId is null", async () => {
    await expect(
      hasModuleAccess(noopDb, null, "principal-1", "module-1", resolver, undefined),
    ).resolves.toBe(false);
  });

  it("returns false when principalId is null", async () => {
    await expect(
      hasModuleAccess(noopDb, "tenant-1", null, "module-1", resolver, undefined),
    ).resolves.toBe(false);
  });

  it("returns false when moduleId is null", async () => {
    await expect(
      hasModuleAccess(noopDb, "tenant-1", "principal-1", null, resolver, undefined),
    ).resolves.toBe(false);
  });
});

// ── Fail-closed on resolver errors ───────────────────────────────────────────

describe("hasModuleAccess — P1-A resolver failure → fail-closed", () => {
  it("throws ModuleAccessDegradedError when resolver throws (mode=use)", async () => {
    const resolver = makeResolver(new Error("IAM service down"));
    await expect(
      hasModuleAccess(noopDb, "tenant-1", "principal-1", "module-1", resolver, undefined, { mode: "use" }),
    ).rejects.toBeInstanceOf(ModuleAccessDegradedError);
  });

  it("ModuleAccessDegradedError carries retryAfterSeconds > 0", async () => {
    const resolver = makeResolver(new Error("timeout"));
    const err = await hasModuleAccess(
      noopDb, "tenant-1", "principal-1", "module-1", resolver, undefined, { mode: "use" },
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ModuleAccessDegradedError);
    expect((err as ModuleAccessDegradedError).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("ModuleAccessDegradedError has the correct name", async () => {
    const resolver = makeResolver(new Error("timeout"));
    const err = await hasModuleAccess(
      noopDb, "t", "p", "m", resolver, undefined, { mode: "use" },
    ).catch((e) => e);
    expect((err as ModuleAccessDegradedError).name).toBe("ModuleAccessDegradedError");
  });

  it("does NOT silently return true when resolver throws", async () => {
    const resolver = makeResolver(new Error("network error"));
    const result = await hasModuleAccess(
      noopDb, "tenant-1", "principal-1", "module-1", resolver, undefined, { mode: "use" },
    ).catch(() => "threw");
    expect(result).toBe("threw");
  });
});

// ── Module matching logic ─────────────────────────────────────────────────────

describe("hasModuleAccess — module matching (P1-B resolution)", () => {
  it("returns false when access has no matching moduleId or code", async () => {
    const resolver = makeResolver({
      moduleIds: ["other-uuid"],
      moduleCodes: ["other"],
      workspaceIds: [],
      source: "role_binding",
    });
    await expect(
      hasModuleAccess(noopDb, "t", "p", "module-uuid", resolver, undefined, { mode: "use" }),
    ).resolves.toBe(false);
  });

  it("returns true when moduleId matches by exact UUID", async () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const resolver = makeResolver({
      moduleIds: [uuid],
      moduleCodes: [],
      workspaceIds: [],
      source: "role_binding",
    });
    await expect(
      hasModuleAccess(noopDb, "t", "p", uuid, resolver, undefined, { mode: "use" }),
    ).resolves.toBe(true);
  });

  it("returns true when resolver returns lowercase code and request supplies uppercase", async () => {
    const resolver = makeResolver({
      moduleIds: [],
      moduleCodes: ["acc"],
      workspaceIds: [],
      source: "role_binding",
    });
    await expect(
      hasModuleAccess(noopDb, "t", "p", "ACC", resolver, undefined, { mode: "use" }),
    ).resolves.toBe(true);
  });

  it("returns true when resolver returns uppercase code and request supplies lowercase", async () => {
    const resolver = makeResolver({
      moduleIds: [],
      moduleCodes: ["PAY"],
      workspaceIds: [],
      source: "role_binding",
    });
    await expect(
      hasModuleAccess(noopDb, "t", "p", "pay", resolver, undefined, { mode: "use" }),
    ).resolves.toBe(true);
  });
});
