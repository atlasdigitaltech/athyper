import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { HostConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { executeVerification } from "../verification-routes.js";

const context = {
  planeKey: "studio",
  realmKey: "athyper",
  tenantId: "00000000-0000-4000-8000-000000000001",
  principalId: "00000000-0000-4000-8000-000000000002",
  authEpoch: 1,
  permissions: { allowed: [] },
  profileHash: "profile",
  requestId: "request-1",
} as unknown as VerifiedRequestContext;
const config = {
  env: "local",
  bullMq: {},
  verification: { enabled: true, grafanaUrl: "http://127.0.0.1:53902" },
} as HostConfig;

describe("platform verification runner", () => {
  it("returns a sanitized all-plane quick snapshot for Studio", async () => {
    const container = createContainer();
    for (const key of [
      "athyperDatabase",
      "neonDatabase",
      "meshDatabase",
    ] as const)
      container.adapters[key] = {
        health: vi.fn().mockResolvedValue({ healthy: true }),
      } as never;
    container.adapters.redisCache = {
      health: vi.fn().mockResolvedValue({ healthy: true, latencyMs: 2 }),
    } as never;
    container.runtimes.health.register("experience.studio", async () => ({
      status: "healthy",
    }));
    const result = await executeVerification(
      container,
      config,
      context,
      "quick",
    );
    expect(result.scope).toBe("all");
    expect(result.status).toBe("passed");
    expect(result.checks.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "database.studio",
        "database.neon",
        "database.mesh",
        "cache.redis",
        "readiness.experience.studio",
        "observability.correlation",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("executes and cleans the bounded document, search, cache, and mail probes", async () => {
    const container = createContainer();
    const cache = new Map<string, string>();
    const objects = new Map<string, Uint8Array>();
    const search = new Map<
      string,
      { attachmentId: string; planeKey: string; tenantId: string }
    >();
    container.adapters.athyperDatabase = {
      health: vi.fn().mockResolvedValue({ healthy: true }),
    } as never;
    container.adapters.neonDatabase = {
      health: vi.fn().mockResolvedValue({ healthy: true }),
    } as never;
    container.adapters.meshDatabase = {
      health: vi.fn().mockResolvedValue({ healthy: true }),
    } as never;
    container.adapters.redisCache = {
      health: vi.fn().mockResolvedValue({ healthy: true }),
      set: async (key: string, value: string) => {
        cache.set(key, value);
        return true;
      },
      get: async (key: string) => cache.get(key) ?? null,
      delete: async (key: string) => Number(cache.delete(key)),
      client: { get: async () => null },
    } as never;
    container.adapters.objectStorageDocuments = {
      health: async () => ({ healthy: true }),
      put: async (key: string, value: Uint8Array) => {
        objects.set(key, value);
      },
      get: async (key: string) => objects.get(key)!,
      delete: async (key: string) => {
        objects.delete(key);
      },
    } as never;
    container.adapters.malwareScanner = {
      health: async () => ({ status: "healthy" }),
      scan: async () => ({
        status: "clean",
        scanner: "test",
        scannedAt: new Date().toISOString(),
        durationMs: 1,
      }),
    } as never;
    container.adapters.contentExtractor = {
      health: async () => ({ status: "healthy" }),
      extract: async (input: { content: Uint8Array }) => ({
        text: new TextDecoder().decode(input.content),
        metadata: {},
        provider: "test",
        durationMs: 1,
      }),
    } as never;
    container.adapters.pdfRenderer = {
      health: async () => ({ status: "healthy" }),
      renderPdf: async () => ({
        bytes: new TextEncoder().encode("%PDF-test"),
        mediaType: "application/pdf",
        provider: "test",
        durationMs: 1,
      }),
    };
    container.adapters.searchIndex = {
      health: async () => ({ status: "healthy" }),
      upsert: async (document: {
        id: string;
        attachmentId: string;
        planeKey: string;
        tenantId: string;
      }) => {
        search.set(document.id, document);
      },
      search: async (query: { planeKey: string; tenantId: string }) => ({
        hits: [...search.values()]
          .filter(
            (item) =>
              item.planeKey === query.planeKey &&
              item.tenantId === query.tenantId,
          )
          .map((item) => ({
            ...item,
            entityType: "system_verification",
            entityId: item.attachmentId,
            title: "test",
            contentType: "text/plain",
            fileName: "test.txt",
            updatedAt: new Date().toISOString(),
          })),
        total: search.size,
        processingMs: 1,
      }),
      remove: async (id: string) => {
        search.delete(id);
      },
    } as never;
    container.adapters.notificationChannels.set("email", {
      channel: "email",
      health: async () => ({ status: "healthy" }),
      send: vi.fn().mockResolvedValue({ externalId: "mail-1" }),
    });
    const result = await executeVerification(
      container,
      config,
      context,
      "functional",
    );
    expect(result.status).toBe("passed");
    expect(result.checks.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "cache.round-trip",
        "document.storage-round-trip",
        "document.clean-scan",
        "document.extract",
        "document.render",
        "search.round-trip",
        "mail.delivery",
      ]),
    );
    expect(cache.size).toBe(0);
    expect(objects.size).toBe(0);
    expect(search.size).toBe(0);
  });
  it.each([
    "denied",
    "timeout",
    "server-error",
    "allowed",
    "both-win",
    "overwrite",
  ])("qualifies artifact races and delete authorization: %s", async (mode) => {
    const container = createContainer();
    let stored: Uint8Array;
    const pending: Array<{
      body: Uint8Array;
      resolve: (created: boolean) => void;
    }> = [];
    let attempts = 0;
    container.adapters.objectStorageArtifacts = {
      health: async () => ({ healthy: true }),
      putIfAbsent: async (_key: string, body: Uint8Array) => {
        if (++attempts > 2) return false;
        return new Promise<boolean>((resolve) => {
          pending.push({ body, resolve });
          if (pending.length === 2) {
            // Neither call completes before both have started; a sequential implementation hangs.
            stored = pending[mode === "overwrite" ? 1 : 0]!.body;
            pending[0]!.resolve(true);
            pending[1]!.resolve(mode === "both-win");
          }
        });
      },
      get: async () => stored,
      delete: async () => {
        if (mode === "allowed") return;
        if (mode === "timeout") throw new Error("timeout");
        throw Object.assign(new Error("denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: mode === "server-error" ? 500 : 403 },
        });
      },
    } as never;
    const result = await executeVerification(
      container,
      config,
      context,
      "functional",
    );
    expect(
      result.checks.find(
        (check) => check.id === "governance.storage-write-once",
      )?.status,
    ).toBe(mode === "denied" ? "passed" : "failed");
  });
});
