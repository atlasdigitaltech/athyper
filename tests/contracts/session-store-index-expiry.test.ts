import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRedisSessionStore, type RedisLike, type StoredSession } from "../../packages/platform/iam/session-store/src/index";

describe("Redis authentication-session indexes", () => {
  it("keeps shared revocation indexes until their latest member expires and separates the store namespace version", async () => {
    let script = ""; let keys: readonly unknown[] = [];
    const redis = {
      status: "ready", ping: async () => "PONG", get: async () => null, set: async () => "OK",
      eval: async (source: string, _count: number, ...input: unknown[]) => { script = source; keys = input; return 1; },
    } as unknown as RedisLike;
    const store = createRedisSessionStore({ redis, namespace: "sessions", namespaceVersion: 4, keyVersion: 9 });
    const now = Date.now();
    const session: StoredSession = { schemaVersion: 1, plane: "neon", realmKey: "athyper", tenantId: "tenant-1", principalId: "principal-1", providerSessionId: "provider-1", encryptedTokenBundle: "sealed", accessTokenExpiresAt: now + 1_000, refreshGeneration: 0, authEpoch: 1, sessionVersion: 1, requiredActions: [], assurance: "baseline", createdAt: now, lastSeenAt: now, idleExpiresAt: now + 60_000, absoluteExpiresAt: now + 120_000, configurationRevision: "1", keyVersion: 9 };
    await store.create("opaque-hash", session);
    assert.match(String(keys[0]), /^sessions:v4:neon:athyper:session:/);
    assert.match(script, /PEXPIREAT',KEYS\[2\],ARGV\[2\],'NX'/);
    assert.match(script, /PEXPIREAT',KEYS\[2\],ARGV\[2\],'GT'/);
    assert.doesNotMatch(String(keys[0]), /:v9:/);
  });

  it("preserves empty required-action arrays while touching legacy Redis JSON", async () => {
    const now = Date.now();
    const legacy = { schemaVersion: 1, plane: "neon", realmKey: "athyper", tenantId: "tenant-1", principalId: "principal-1", providerSessionId: "provider-1", encryptedTokenBundle: "sealed", accessTokenExpiresAt: now + 60_000, refreshGeneration: 0, authEpoch: 1, sessionVersion: 1, requiredActions: {}, assurance: "baseline", createdAt: now - 120_000, lastSeenAt: now - 120_000, idleExpiresAt: now + 60_000, absoluteExpiresAt: now + 180_000, configurationRevision: "1", keyVersion: 9 };
    let written = "";
    const redis = {
      status: "ready", ping: async () => "PONG", get: async () => JSON.stringify(legacy), set: async () => "OK",
      eval: async (_source: string, _count: number, ...input: unknown[]) => { written = String(input[7]); return written; },
    } as unknown as RedisLike;
    const store = createRedisSessionStore({ redis, now: () => now, touchIntervalMs: 60_000 });
    const touched = await store.touch({ plane: "neon", realmKey: "athyper" }, "opaque-hash", 120_000);
    assert.deepEqual(touched?.requiredActions, []);
    assert.deepEqual((JSON.parse(written) as { requiredActions: unknown }).requiredActions, []);
  });
});
