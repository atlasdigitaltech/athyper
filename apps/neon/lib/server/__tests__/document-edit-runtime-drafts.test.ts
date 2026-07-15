import { beforeEach, describe, expect, it, vi } from "vitest";

const redisState = vi.hoisted(() => ({
  available: true,
  values: new Map<string, { value: string; expiresAt: number }>(),
}));

vi.mock("@/lib/server/document-edit-runtime-redis", () => ({
  createDocumentEditRedisClient: vi.fn(async () => {
    if (!redisState.available) throw new Error("redis unavailable");
    return {
      get: async (key: string) => {
        const item = redisState.values.get(key);
        if (!item || item.expiresAt <= Date.now()) {
          redisState.values.delete(key);
          return null;
        }
        return item.value;
      },
      eval: async (_script: string, options: { keys: string[]; arguments: string[] }) => {
        const [key] = options.keys;
        const [expectedRevision, value, ttlSeconds, nextRevision] = options.arguments;
        const item = redisState.values.get(key);
        const current = item && item.expiresAt > Date.now() ? JSON.parse(item.value) as { revision?: number } : null;
        if ((current?.revision ?? 0) !== Number(expectedRevision)) return [0, current?.revision ?? 0];
        redisState.values.set(key, {
          value,
          expiresAt: Date.now() + Number(ttlSeconds) * 1000,
        });
        return [1, Number(nextRevision)];
      },
      del: async (key: string) => Number(redisState.values.delete(key)),
    };
  }),
}));

import {
  DocumentEditDraftConflictError,
  readDocumentEditServerDraft,
  upsertDocumentEditServerDraft,
} from "../document-edit-runtime-drafts";

function scope(tenant = "tenant-a") {
  return {
    session: {
      userId: "user-a",
      realmKey: "realm-a",
      planeKey: "plane-a",
      activeOrg: "org-a",
      organizations: { "org-a": { tenantId: tenant } },
    },
    entityCode: "purchase_order",
    recordId: "route-id",
    record: { id: "physical-id", permission_stamp: "permission-a" },
    workspaceId: "workspace-a",
    draftTtlMs: 1_000,
  } as never;
}

function write(
  input: Parameters<typeof upsertDocumentEditServerDraft>[0]["scope"],
  clientSeq: number,
  value = "x",
  expectedRevision = 0,
) {
  return upsertDocumentEditServerDraft({
    scope: input,
    kind: "core",
    values: { value },
    sourceField: "value",
    expectedRevision,
    tabId: "tab-a",
    clientSeq,
  });
}

describe("document edit Redis drafts", () => {
  beforeEach(() => {
    redisState.available = true;
    redisState.values.clear();
    delete process.env.DOCUMENT_EDIT_DRAFT_RECOVERY_REQUIRED;
    delete process.env.DOCUMENT_EDIT_DRAFT_MEMORY_FALLBACK;
    vi.useRealTimers();
  });

  it("atomically admits one of two concurrent revisions and returns a typed conflict", async () => {
    const draftScope = scope();
    const results = await Promise.allSettled([write(draftScope, 1, "left"), write(draftScope, 2, "right")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(DocumentEditDraftConflictError);
    expect(rejected.reason.currentRevision).toBe(1);
  });

  it("ignores an out-of-order change from the same tab", async () => {
    const draftScope = scope();
    const latest = await write(draftScope, 2, "latest");
    const stale = await write(draftScope, 1, "stale", 1);
    expect(stale.revision).toBe(latest.revision);
    expect(stale.core).toEqual({ value: "latest" });
  });

  it("does not restore a draft across tenant scope", async () => {
    await write(scope("tenant-a"), 1);
    await expect(readDocumentEditServerDraft(scope("tenant-b"))).resolves.toBeNull();
  });

  it("does not restore an expired Redis draft", async () => {
    vi.useFakeTimers();
    await write(scope(), 1);
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(readDocumentEditServerDraft(scope())).resolves.toBeNull();
  });

  it("uses the configured optional degraded policy rather than process memory", async () => {
    redisState.available = false;
    await expect(readDocumentEditServerDraft(scope())).resolves.toBeNull();
    await expect(write(scope(), 1)).rejects.toThrow("DOCUMENT_EDIT_DRAFT_STORE_UNAVAILABLE");
  });
});
