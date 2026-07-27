import { describe, expect, it, vi } from "vitest";
import { AtlasTenantSupportThreadFactory } from "../atlas-support-thread.factory.js";

const TARGET = "30000000-0000-4000-8000-000000000001";
const SHADOW = "40000000-0000-4000-8000-000000000001";

describe("AtlasTenantSupportThreadFactory", () => {
  it("creates a new Admin thread only from the canonical shadow context", async () => {
    const createThread = vi.fn(async () => ({ threadId: "70000000-0000-4000-8000-000000000001" }));
    const factory = new AtlasTenantSupportThreadFactory(
      { createThread } as never,
      async () => ({ tenantId: TARGET, principalId: SHADOW, planeKey: "admin" }) as never,
    );
    await expect(factory.createTenantThread({
      sessionId: "60000000-0000-4000-8000-000000000001",
      targetTenantId: TARGET,
      shadowPrincipalId: SHADOW,
      plane: "admin",
    })).resolves.toBe("70000000-0000-4000-8000-000000000001");
    expect(createThread).toHaveBeenCalledOnce();
  });

  it("fails closed when the resolved context crosses tenant, principal, or plane", async () => {
    for (const context of [
      { tenantId: "other", principalId: SHADOW, planeKey: "admin" },
      { tenantId: TARGET, principalId: "other", planeKey: "admin" },
      { tenantId: TARGET, principalId: SHADOW, planeKey: "neon" },
    ]) {
      const createThread = vi.fn();
      const factory = new AtlasTenantSupportThreadFactory(
        { createThread } as never,
        async () => context as never,
      );
      await expect(factory.createTenantThread({
        sessionId: "60000000-0000-4000-8000-000000000001",
        targetTenantId: TARGET,
        shadowPrincipalId: SHADOW,
        plane: "admin",
      })).rejects.toThrow("inconsistent");
      expect(createThread).not.toHaveBeenCalled();
    }
  });
});
