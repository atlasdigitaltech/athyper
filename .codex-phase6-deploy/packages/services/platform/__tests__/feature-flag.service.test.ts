import { describe, expect, it, vi } from "vitest";
import { FeatureFlagService } from "../feature-flag.service.js";

function fixture(row: unknown, dbError?: Error) {
  const executeTakeFirst = dbError
    ? vi.fn(async () => {
        throw dbError;
      })
    : vi.fn(async () => row);
  const where = vi.fn(() => ({ executeTakeFirst }));
  const select = vi.fn(() => ({ where }));
  const selectFrom = vi.fn(() => ({ select }));
  const redis = {
    get: vi.fn(async () => "1"),
    setex: vi.fn(async () => "OK"),
  };
  const logger = { error: vi.fn() };
  const service = new FeatureFlagService({
    redis,
    db: { selectFrom } as never,
    logger,
  });
  return { service, redis, logger, executeTakeFirst };
}

describe("FeatureFlagService strict resolution", () => {
  it("bypasses a stale positive cache for authorization-sensitive checks", async () => {
    const { service, redis } = fixture({
      code: "atlas.tools.catalog_help",
      is_enabled: false,
      tenant_overrides: null,
      rollout_pct: null,
    });

    await expect(
      service.isEnabledStrict("atlas.tools.catalog_help", "tenant-a"),
    ).resolves.toBe(false);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("accepts driver-decoded JSON tenant overrides", async () => {
    const { service } = fixture({
      code: "atlas.tools.catalog_help",
      is_enabled: false,
      tenant_overrides: { "tenant-a": true },
      rollout_pct: null,
    });

    await expect(
      service.isEnabledStrict("atlas.tools.catalog_help", "tenant-a"),
    ).resolves.toBe(true);
  });

  it("fails closed when the control-plane lookup fails", async () => {
    const { service, logger } = fixture(
      null,
      new Error("control database unavailable"),
    );

    await expect(
      service.isEnabledStrict("atlas.tools.catalog_help", "tenant-a"),
    ).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      "feature_flag_strict_error",
      expect.objectContaining({
        code: "atlas.tools.catalog_help",
        tenantId: "tenant-a",
      }),
    );
  });
});

describe("FeatureFlagService plane rollout resolution", () => {
  it("enables the initial internal Admin cohort without enabling the global default", async () => {
    const { service, redis } = fixture({
      code: "unified_shell_v2",
      is_enabled: false,
      tenant_overrides: null,
      rollout_pct: null,
      metadata: {
        allowed_planes: ["admin", "neon", "mesh"],
        internal_admin_enabled: true,
      },
    });
    redis.get.mockResolvedValueOnce(null);

    await expect(service.isEnabledForContext("unified_shell_v2", {
      plane: "admin",
      tenantId: "internal",
      internalAdmin: true,
    })).resolves.toBe(true);
  });

  it("rejects a plane that is outside the registered surface boundary", async () => {
    const { service, redis } = fixture({
      code: "document_workspace_v2",
      is_enabled: true,
      tenant_overrides: null,
      rollout_pct: null,
      metadata: { allowed_planes: ["neon", "mesh"] },
    });
    redis.get.mockResolvedValueOnce(null);

    await expect(service.isEnabledForContext("document_workspace_v2", {
      plane: "admin",
      tenantId: "tenant-a",
      internalAdmin: true,
    })).resolves.toBe(false);
  });

  it("applies selected Mesh buyer or supplier account overrides server-side", async () => {
    const { service, redis } = fixture({
      code: "content_hub_v2",
      is_enabled: false,
      tenant_overrides: null,
      rollout_pct: null,
      metadata: {
        allowed_planes: ["admin", "neon", "mesh"],
        account_overrides: { "buyer-42": true },
      },
    });
    redis.get.mockResolvedValueOnce(null);

    await expect(service.isEnabledForContext("content_hub_v2", {
      plane: "mesh",
      tenantId: "tenant-a",
      accountId: "buyer-42",
    })).resolves.toBe(true);
  });
});
