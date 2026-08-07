import { describe, expect, it, vi } from "vitest";

import {
  AtlasMessageContentProtector,
  assertSensitiveAtlasRetentionReady,
  type AtlasProtectedContentStore,
} from "../protected-content-store.js";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const PRINCIPAL_ID = "00000000-0000-4000-8000-000000000002";
const scope = {
  tenantId: TENANT_ID,
  principalId: PRINCIPAL_ID,
  plane: "neon" as const,
};

function store(
  readiness: Awaited<ReturnType<AtlasProtectedContentStore["readiness"]>>,
): AtlasProtectedContentStore {
  return {
    put: vi.fn(),
    get: vi.fn(),
    rotate: vi.fn(),
    delete: vi.fn(),
    readiness: vi.fn(async () => readiness),
  };
}

describe("Atlas protected retained-content boundary", () => {
  it("fails closed without an approved tenant-aware store", async () => {
    await expect(assertSensitiveAtlasRetentionReady({
      mode: "database_at_rest_non_sensitive_only",
    })).rejects.toThrow("requires an approved tenant protected-content store");
  });

  it("requires isolation, backup recovery, and revoked-key evidence", async () => {
    await expect(assertSensitiveAtlasRetentionReady({
      mode: "tenant_protected_store",
      store: store({
        healthy: true,
        encryptionVerified: true,
        keyRotationVerified: true,
        tenantIsolationVerified: true,
        deletionAndPurgeVerified: true,
        backupRecoveryVerified: false,
        revokedKeyBehaviorVerified: true,
      }),
    })).rejects.toThrow("incomplete production evidence");
  });

  it("accepts only a fully attested protected-content store", async () => {
    await expect(assertSensitiveAtlasRetentionReady({
      mode: "tenant_protected_store",
      store: store({
        healthy: true,
        encryptionVerified: true,
        keyRotationVerified: true,
        tenantIsolationVerified: true,
        deletionAndPurgeVerified: true,
        backupRecoveryVerified: true,
        revokedKeyBehaviorVerified: true,
      }),
    })).resolves.toBeUndefined();
  });

  it("stores no inline copy and round-trips typed content through an opaque ref", async () => {
    const put = vi.fn(async () => ({
      ref: "tenant/object/message-1",
      keyVersion: "tenant-key-v7",
    }));
    const get = vi.fn(async () =>
      Buffer.from('[{"type":"text","text":"private"}]', "utf8")
    );
    const target = store({
      healthy: true,
      encryptionVerified: true,
      keyRotationVerified: true,
      tenantIsolationVerified: true,
      deletionAndPurgeVerified: true,
      backupRecoveryVerified: true,
      revokedKeyBehaviorVerified: true,
    });
    target.put = put;
    target.get = get;
    const protector = new AtlasMessageContentProtector(target);

    const protectedValue = await protector.protect(
      scope,
      "message-1",
      [{ type: "text", text: "private" }],
    );

    expect(protectedValue.contentBlocks).toEqual([]);
    expect(protectedValue.protectedContentRef).toMatch(
      /^atlas-protected\/v1\//,
    );
    expect(protectedValue.protectedContentRef).not.toContain(
      "tenant/object/message-1",
    );
    expect(put).toHaveBeenCalledWith(scope, expect.objectContaining({
      classification: "sensitive",
      idempotencyKey: "message-1",
      plaintext: expect.any(Uint8Array),
    }));

    await expect(
      protector.reveal(scope, protectedValue.protectedContentRef!),
    ).resolves.toEqual([{ type: "text", text: "private" }]);
    expect(get).toHaveBeenCalledWith(scope, {
      ref: "tenant/object/message-1",
      keyVersion: "tenant-key-v7",
    });
  });

  it("does not create a protected object for empty terminal output", async () => {
    const target = store({
      healthy: true,
      encryptionVerified: true,
      keyRotationVerified: true,
      tenantIsolationVerified: true,
      deletionAndPurgeVerified: true,
      backupRecoveryVerified: true,
      revokedKeyBehaviorVerified: true,
    });
    const protector = new AtlasMessageContentProtector(target);

    await expect(protector.protect(scope, "message-2", [])).resolves.toEqual({
      contentBlocks: [],
      protectedContentRef: null,
    });
    expect(target.put).not.toHaveBeenCalled();
  });

  it("fails closed for malformed refs and invalid recovered content", async () => {
    const target = store({
      healthy: true,
      encryptionVerified: true,
      keyRotationVerified: true,
      tenantIsolationVerified: true,
      deletionAndPurgeVerified: true,
      backupRecoveryVerified: true,
      revokedKeyBehaviorVerified: true,
    });
    const protector = new AtlasMessageContentProtector(target);

    await expect(
      protector.reveal(scope, "browser-controlled-ref"),
    ).rejects.toThrow("version is unsupported");

    const prepared = await new AtlasMessageContentProtector({
      ...target,
      put: vi.fn(async () => ({ ref: "object", keyVersion: "v1" })),
    }).protect(scope, "message-3", [{ type: "text", text: "valid" }]);
    target.get = vi.fn(async () => Buffer.from('{"type":"text"}', "utf8"));
    await expect(
      protector.reveal(scope, prepared.protectedContentRef!),
    ).rejects.toThrow("invalid block contract");
  });
});
