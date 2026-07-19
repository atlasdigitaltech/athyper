import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { RequestHandler, Router } from "express";
import busboy from "busboy";
import { registerAttachmentRoutes } from "../attachments.route.js";
import { ContentAttachmentService } from "../../services/attachment.service.js";
import { resolveVerifiedRequestContext } from "@athyper/svc-shared";

const mockedAuthResolve = {
  context: {
    tenantId: "tenant-a-id",
    tenantCode: "tenant-a",
    companyCode: "COMPANY-A",
    realmKey: "realm-a",
    principalId: "principal-1",
    subject: "subject-1",
  },
};

vi.mock("@athyper/svc-shared", async () => ({
  verifyBearer: vi.fn(async () => ({ sub: "principal-1" })),
  isUuid: vi.fn(() => true),
  extractVerifiedRequestContextHints: vi.fn(() => ({})),
  resolveVerifiedRequestContext: vi.fn(async () => ({ ok: true, context: mockedAuthResolve.context })),
}));

vi.mock("../entity-resolver.js", () => ({
  resolveDocumentEntity: vi.fn(async () => ({ name: "purchase_invoice" })),
}));

vi.mock("../services/attachment-authorization.service.js", () => ({
  authorizeAttachmentAccess: vi.fn(async () => ({ allowed: true, tenantId: "tenant-a-id", principalId: "principal-1" })),
}));

vi.mock("busboy", () => ({
  default: vi.fn(),
}));

interface MockBusboyParser extends EventEmitter {}

function buildFakeRequest(contentLength = "100", finishOnPipe = true) {
  const req = {
    headers: {
      authorization: "Bearer test",
      "content-type": "multipart/form-data; boundary=boundary",
      "content-length": contentLength,
    },
    params: {
      docType: "invoice",
      id: "019a4f98-1234-4bc1-9c55-123456789abc",
    },
    on: vi.fn(() => undefined),
    removeAllListeners: vi.fn(),
    unpipe: vi.fn(),
    resume: vi.fn(),
    destroy: vi.fn(),
    pipe: vi.fn((dest: MockBusboyParser) => {
      if (finishOnPipe) {
        setImmediate(() => dest.emit("finish"));
      }
      return req;
    }),
  };
  return req as never;
}

function buildFakeResponse() {
  const payload: unknown[] = [];
  let statusCode = 0;
  return {
    status: vi.fn((code: number) => {
      statusCode = code;
      return {
        json: (body: unknown) => {
          payload.push(body);
          return undefined;
        },
      };
    }),
    getStatus: () => statusCode,
    getBody: () => payload.at(-1),
  };
}

function buildDeps(maxUploadMb = 100) {
  return {
    db: {},
    auth: { verifyToken: vi.fn() },
    objectStorage: {
      adapter: {
        put: vi.fn(),
        putStream: vi.fn(),
      },
      bucket: "attachments",
      maxUploadMb,
    },
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  };
}

function captureUploadHandler(deps = buildDeps()) {
  const get = vi.fn();
  const post = vi.fn();
  const del = vi.fn();
  const patch = vi.fn();

  registerAttachmentRoutes(
    {
      get,
      post,
      delete: del,
      patch,
      put: vi.fn(),
    } as unknown as Router,
    deps as never,
  );

  const [_route, handler] = post.mock.calls.find(([path]) => path === "/documents/:docType/:id/attachments") as [
    string,
    RequestHandler,
  ];
  expect(handler).toBeTruthy();
  return handler;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upload multipart lifecycle", () => {
  it("registers the combined attachment workspace read model", () => {
    const get = vi.fn();
    registerAttachmentRoutes(
      {
        get,
        post: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        put: vi.fn(),
      } as unknown as Router,
      buildDeps() as never,
    );

    expect(get).toHaveBeenCalledWith(
      "/documents/:docType/:id/attachment-workspace",
      expect.any(Function),
    );
  });

  it("passes the host-resolved tenant to the verified authorization resolver", async () => {
    const parser = new EventEmitter() as MockBusboyParser;
    // @ts-expect-error mocking helper
    vi.mocked(busboy).mockReturnValueOnce(parser);
    const readAuthenticatedContext = vi.fn(() => ({ tenantId: "tenant-a-id" }));
    const handler = captureUploadHandler({
      ...buildDeps(),
      readAuthenticatedContext,
    });
    const req = buildFakeRequest();
    const res = buildFakeResponse();

    handler(req as never, res as never, vi.fn());
    await vi.waitFor(() => {
      expect(resolveVerifiedRequestContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ trustedTenantId: "tenant-a-id" }),
      );
    });
    expect(readAuthenticatedContext).toHaveBeenCalledWith(req);
  });

  it("returns NO_FILE when multipart body has no file part", async () => {
    const parser = new EventEmitter() as MockBusboyParser;
    // @ts-expect-error mocking helper
    vi.mocked(busboy).mockReturnValueOnce(parser);

    const handler = captureUploadHandler();
    const req = buildFakeRequest();
    const res = buildFakeResponse();
    const next = vi.fn();

    handler(req as never, res as never, next);
    await Promise.resolve();

    expect(res.getStatus()).toBe(400);
    expect(res.getBody()).toMatchObject({ error: "NO_FILE" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns MULTIPART_PARSE_TIMEOUT when parser stalls", async () => {
    vi.useFakeTimers();
    const parser = new EventEmitter() as MockBusboyParser;
    // @ts-expect-error mocking helper
    vi.mocked(busboy).mockReturnValueOnce(parser);

    const handler = captureUploadHandler();
    const req = buildFakeRequest("100", false);
    const res = buildFakeResponse();
    const next = vi.fn();

    handler(req as never, res as never, next);
    await vi.advanceTimersByTimeAsync(30_010);
    await Promise.resolve();
    vi.useRealTimers();

    expect(res.getStatus()).toBe(408);
    expect(res.getBody()).toMatchObject({ error: "MULTIPART_PARSE_TIMEOUT" });
  });

  it("rejects multipart upload with FILE_TOO_LARGE when aggregate bytes exceed configured limit", async () => {
    const parser = new EventEmitter() as MockBusboyParser;
    // @ts-expect-error mocking helper
    vi.mocked(busboy).mockReturnValueOnce(parser);

    const uploadStream = vi.spyOn(ContentAttachmentService.prototype, "uploadStream").mockResolvedValue({
      id: "new-upload",
      fileName: "memo.pdf",
      contentType: "application/pdf",
      sizeBytes: 2 * 1024 * 1024,
      sha256: "x".repeat(64),
      status: "quarantined",
      versionNo: 1,
      createdAt: new Date().toISOString(),
      storageKey: "tenant/document/object",
    });
    const handler = captureUploadHandler(buildDeps(1));
    const req = buildFakeRequest("1024");
    const res = buildFakeResponse();
    const next = vi.fn();

    const fileStream = new EventEmitter() as MockBusboyParser & { destroy: ReturnType<typeof vi.fn> };
    fileStream.destroy = vi.fn();

    handler(req as never, res as never, next);
    parser.emit("file", "file", fileStream, { filename: "memo.pdf", mimeType: "application/pdf" });
    fileStream.emit("data", Buffer.alloc(2 * 1024 * 1024));
    parser.emit("finish");
    await Promise.resolve();

    expect(res.getStatus()).toBe(413);
    expect(res.getBody()).toMatchObject({ error: "FILE_TOO_LARGE" });
    expect(uploadStream).toHaveBeenCalledTimes(1);
  });

  it("returns UPLOAD_FAILED when stream upload fails mid-flow", async () => {
    const parser = new EventEmitter() as MockBusboyParser;
    // @ts-expect-error mocking helper
    vi.mocked(busboy).mockReturnValueOnce(parser);

    const uploadStream = vi.spyOn(ContentAttachmentService.prototype, "uploadStream").mockRejectedValue(
      new Error("object store unavailable"),
    );
    const handler = captureUploadHandler();
    const req = buildFakeRequest("100");
    const res = buildFakeResponse();
    const next = vi.fn();

    const fileStream = new EventEmitter() as MockBusboyParser & { destroy: ReturnType<typeof vi.fn> };
    fileStream.destroy = vi.fn();

    handler(req as never, res as never, next);
    parser.emit("file", "file", fileStream, { filename: "memo.pdf", mimeType: "application/pdf" });
    parser.emit("finish");
    await Promise.resolve();

    expect(uploadStream).toHaveBeenCalledTimes(1);
    expect(res.getStatus()).toBe(500);
    expect(res.getBody()).toMatchObject({ error: "UPLOAD_FAILED" });
  });

  it("returns replayed attachment for idempotency-key and content-sha256 without writing object", async () => {
    const findReplay = vi.spyOn(ContentAttachmentService.prototype, "findReplayAttachment").mockResolvedValue({
      id: "existing-id",
      fileName: "memo.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      sha256: "a".repeat(64),
      status: "active",
      versionNo: 1,
      createdAt: new Date().toISOString(),
      storageKey: "tenant/document/object",
    });

    const handler = captureUploadHandler();
    const req = buildFakeRequest();
    req.headers["idempotency-key"] = "idempotent-1";
    req.headers["content-sha256"] = "b".repeat(64);
    const res = buildFakeResponse();
    const next = vi.fn();

    handler(req as never, res as never, next);
    await Promise.resolve();

    expect(findReplay).toHaveBeenCalledWith({
      tenantId: "tenant-a-id",
      statuses: ["active", "quarantined"],
      idempotencyKey: "idempotent-1",
      hash: "b".repeat(64),
    });
    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toMatchObject({ id: "existing-id" });
    expect(next).not.toHaveBeenCalled();
  });
});
