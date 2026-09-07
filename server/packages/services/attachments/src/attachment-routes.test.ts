import { describe, expect, it, vi } from "vitest";
import type { Application, RequestHandler } from "express";
import { registerAttachmentRoutes } from "./attachment-routes.js";
import { QuotaExceededError } from "./quota.js";
describe("attachment quota HTTP contract", () => {
  it("returns 429 problem details and Retry-After", async () => {
    const routes = new Map<string, RequestHandler>();
    const register = (path: string, ...handlers: RequestHandler[]) => {
      routes.set(path, handlers.at(-1)!);
    };
    const app = {
      post: register,
      get: register,
      delete: register,
    } as unknown as Application;
    const policy = {
      kind: "attachment.storage" as const,
      limitBytes: 100,
      limitItems: 10,
      reservationTtlSeconds: 1800,
      retryAfterSeconds: 77,
    };
    registerAttachmentRoutes(app, {
      authenticate: ((_req, _res, next) => next()) as RequestHandler,
      readContext: () => context(),
      authorizer: { authorize: async () => ({ allowed: true }) },
      maxUploadBytes: 1000,
      attachments: {
        stage: async () => {
          throw new QuotaExceededError(
            policy,
            {
              usedBytes: 80,
              reservedBytes: 20,
              usedItems: 2,
              reservedItems: 1,
            },
            10,
          );
        },
        finalize: async () => {
          throw new Error("unused");
        },
        status: async () => {
          throw new Error("unused");
        },
        createAuthorizedDownload: async () => {
          throw new Error("unused");
        },
        deactivate: async () => undefined,
        expire: async () => undefined,
        purge: async () => false,
        cleanupRetention: async () => ({ examined: 0, purged: 0, deferred: 0 }),
        rebuildDerivatives: async () => undefined,
      },
    });
    const output: {
      status?: number;
      type?: string;
      body?: unknown;
      headers: Record<string, string>;
    } = { headers: {} };
    const response = {
      status: (value: number) => {
        output.status = value;
        return response;
      },
      type: (value: string) => {
        output.type = value;
        return response;
      },
      json: (value: unknown) => {
        output.body = value;
        return response;
      },
      setHeader: (key: string, value: string) => {
        output.headers[key] = value;
        return response;
      },
    };
    await routes.get("/api/attachments/stage")!(
      {
        body: {
          attachmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          fileName: "a.png",
          contentType: "image/png",
          sizeBytes: 10,
        },
      } as never,
      response as never,
      vi.fn(),
    );
    expect(output).toMatchObject({
      status: 429,
      type: "application/problem+json",
      headers: { "Retry-After": "77" },
      body: {
        code: "ATTACHMENT_STORAGE_QUOTA_EXCEEDED",
        usedBytes: 80,
        reservedBytes: 20,
        requestedBytes: 10,
      },
    });
  });
});
function context() {
  return {
    planeKey: "neon" as const,
    realmKey: "neon",
    tenantId: "11111111-1111-4111-8111-111111111111",
    principalId: "22222222-2222-4222-8222-222222222222",
    authEpoch: 1,
    profileHash: "p",
    requestId: "r",
    permissions: {
      planeKey: "neon" as const,
      tenantId: "11111111-1111-4111-8111-111111111111",
      principalId: "22222222-2222-4222-8222-222222222222",
      principalFingerprint: "f",
      profileHash: "p",
      schemaHash: "s",
      resolvedAt: 1,
      allowed: [],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      entries: [],
      authorizationScopes: [],
    },
  };
}

describe("Atlas attachment authorization", () => {
  it("checks the plane-qualified Atlas capability without an attachment resource scope", async () => {
    const routes = new Map<string, RequestHandler>();
    const register = (path: string, ...handlers: RequestHandler[]) => {
      routes.set(path, handlers.at(-1)!);
    };
    const app = {
      post: register,
      get: register,
      delete: register,
    } as unknown as Application;
    const requests: Array<{
      permissionCode: string;
      resource?: Readonly<Record<string, unknown>>;
    }> = [];
    registerAttachmentRoutes(app, {
      authenticate: ((_req, _res, next) => next()) as RequestHandler,
      readContext: () => context(),
      authorizer: {
        authorize: async (request) => {
          requests.push({
            permissionCode: request.permissionCode,
            ...(request.resource ? { resource: request.resource } : {}),
          });
          if (
            request.permissionCode === "neon.ai.agent.use" &&
            !request.resource
          )
            return { allowed: true };
          return { allowed: false, reason: "test_denied" };
        },
      },
      maxUploadBytes: 1_000,
      attachments: {
        stage: async (input) => ({
          attachmentId: input.attachmentId,
          storageKey: "staged/key",
          uploadUrl: "https://upload.test/file",
          expiresAt: "2026-08-30T00:00:00.000Z",
        }),
        finalize: async () => {
          throw new Error("unused");
        },
        status: async () => {
          throw new Error("unused");
        },
        createAuthorizedDownload: async () => {
          throw new Error("unused");
        },
        deactivate: async () => undefined,
        expire: async () => undefined,
        purge: async () => false,
        cleanupRetention: async () => ({ examined: 0, purged: 0, deferred: 0 }),
        rebuildDerivatives: async () => undefined,
      },
    });
    const output: { status?: number; body?: unknown } = {};
    const response = {
      setHeader: vi.fn(),
      status: (value: number) => {
        output.status = value;
        return response;
      },
      json: (value: unknown) => {
        output.body = value;
        return response;
      },
    };
    await routes.get("/api/attachments/stage")!(
      {
        body: {
          attachmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          fileName: "supplier.pdf",
          contentType: "application/pdf",
          sizeBytes: 100,
          entityType: "atlas.prompt",
          entityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
      } as never,
      response as never,
      vi.fn(),
    );
    expect(output.status).toBe(201);
    expect(requests[0]).toEqual({ permissionCode: "neon.ai.agent.use" });
  });
});

describe("attachment route security regressions", () => {
  const attachmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  function fixture(granted: string[], entityType?: string) {
    const routes = new Map<string, RequestHandler>();
    const register = (path: string, ...handlers: RequestHandler[]) => {
      routes.set(path, handlers.at(-1)!);
    };
    const record = {
      id: attachmentId,
      status: "active" as const,
      storageKey: "private/key",
      isCurrent: true,
      isActive: true,
      hasLegalHold: false,
      ...(entityType ? { entityType } : {}),
    };
    const attachments = {
      stage: vi.fn(async () => ({
        attachmentId,
        storageKey: "quarantine/key",
        uploadUrl: "https://upload.test",
        expiresAt: "2026-09-06T00:00:00Z",
      })),
      status: vi.fn(async () => record),
      finalize: vi.fn(async () => record),
      deactivate: vi.fn(async () => undefined),
      createAuthorizedDownload: vi.fn(async () => ({
        attachmentId,
        url: "https://download.test",
        expiresAt: "2026-09-06T00:00:00Z",
      })),
      expire: async () => undefined,
      purge: async () => false,
      cleanupRetention: async () => ({ examined: 0, purged: 0, deferred: 0 }),
      rebuildDerivatives: async () => undefined,
    };
    const authorize = vi.fn(
      async ({ permissionCode }: { permissionCode: string }) =>
        granted.includes(permissionCode)
          ? { allowed: true as const }
          : { allowed: false as const, reason: "missing_permission" },
    );
    const contentAuthorize = vi.fn(async () => false);
    registerAttachmentRoutes(
      {
        post: register,
        get: register,
        delete: register,
      } as unknown as Application,
      {
        authenticate: (_req, _res, next) => next(),
        readContext: context,
        authorizer: { authorize },
        attachments,
        maxUploadBytes: 100,
        contentAcl: {
          authorize: contentAuthorize,
        } as unknown as import("@athyper/server-contract-content").ContentAclService,
      },
    );
    const output: {
      status: number;
      body?: unknown;
      headers: Record<string, string>;
    } = { status: 200, headers: {} };
    const response = {
      status: (value: number) => {
        output.status = value;
        return response;
      },
      type: () => response,
      json: (value: unknown) => {
        output.body = value;
        return response;
      },
      end: vi.fn(),
      setHeader: (key: string, value: string) => {
        output.headers[key] = value;
      },
    };
    const next = vi.fn();
    return {
      attachments,
      authorize,
      contentAuthorize,
      output,
      next,
      invoke: async (path: string, body: unknown = {}) => {
        await routes.get(path)!(
          { params: { attachmentId }, body } as never,
          response as never,
          next,
        );
      },
    };
  }
  it.each([
    "/api/attachments/:attachmentId/finalize",
    "/api/attachments/:attachmentId/status",
    "/api/attachments/:attachmentId",
  ])(
    "does not allow Atlas permission to access ordinary attachments via %s",
    async (path) => {
      const f = fixture(["neon.ai.agent.use"]);
      await f.invoke(path, { contentType: "application/pdf" });
      expect(f.output.status).toBe(403);
      expect(f.attachments.finalize).not.toHaveBeenCalled();
      expect(f.attachments.deactivate).not.toHaveBeenCalled();
    },
  );
  it("keeps Atlas access for an owned prompt attachment", async () => {
    const f = fixture(["neon.ai.agent.use"], "atlas.prompt");
    await f.invoke("/api/attachments/:attachmentId/finalize", {
      contentType: "application/pdf",
    });
    expect(f.output.status).toBe(200);
    expect(f.attachments.finalize).toHaveBeenCalledOnce();
  });
  it.each([
    "neon.collaboration.attachment.create",
    "document.attachment.create",
  ])("accepts %s when finalizing", async (permission) => {
    const f = fixture([permission]);
    await f.invoke("/api/attachments/:attachmentId/finalize", {
      contentType: "application/pdf",
    });
    expect(f.output.status).toBe(200);
    expect(f.attachments.finalize).toHaveBeenCalledOnce();
  });
  it("enforces content item write access before staging a link", async () => {
    const f = fixture(["document.attachment.create"]);
    await f.invoke("/api/attachments/stage", {
      attachmentId,
      fileName: "a.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
      entityType: "content.item",
      entityId: attachmentId,
    });
    expect(f.output.status).toBe(403);
    expect(f.contentAuthorize).toHaveBeenCalledOnce();
    expect(f.attachments.stage).not.toHaveBeenCalled();
  });
  it("maps lifecycle state conflicts to HTTP 409", async () => {
    const { AttachmentConflictError } =
      await import("./attachment-lifecycle.js");
    const f = fixture(["document.attachment.finalize"]);
    f.attachments.finalize.mockRejectedValue(
      new AttachmentConflictError("Attachment upload has expired"),
    );
    await f.invoke("/api/attachments/:attachmentId/finalize", {
      contentType: "application/pdf",
    });
    expect(f.output).toMatchObject({
      status: 409,
      body: { code: "ATTACHMENT_CONFLICT" },
    });
    expect(f.next).not.toHaveBeenCalled();
  });
  it("rejects malformed download expiry and prevents caching signed URLs", async () => {
    const f = fixture(["document.attachment.download"]);
    await f.invoke("/api/attachments/:attachmentId/download", {
      expirySeconds: 1.5,
    });
    expect(f.output.status).toBe(400);
    expect(f.attachments.createAuthorizedDownload).not.toHaveBeenCalled();
    await f.invoke("/api/attachments/:attachmentId/download");
    expect(f.output).toMatchObject({
      status: 200,
      headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" },
    });
  });
});
