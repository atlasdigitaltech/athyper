import { createAuditService } from "@athyper/server-platform-audit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessPartnerDefinitionError } from "../business-partner-definition-service.js";
import { registerBusinessPartnerDefinitionRoutes } from "../business-partner-definition-routes.js";

const captured = vi.hoisted(
  () =>
    [] as {
      contract: { path: string };
      handler: (...args: any[]) => Promise<void>;
    }[],
);
vi.mock("@athyper/server-runtime-http", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  registerContractRoute: (
    _app: unknown,
    contract: { path: string },
    _auth: unknown,
    handler: (...args: any[]) => Promise<void>,
  ) => captured.push({ contract, handler }),
}));
const revisionId = "12000000-0000-4000-8000-000000000003";
beforeEach(() => {
  captured.length = 0;
});
function setup(allowed = true) {
  const options = {
    authenticate: vi.fn(),
    readContext: () => ({
      tenantId: "tenant",
      principalId: "checker",
      requestId: "request",
    }),
    authorizer: { authorize: vi.fn(async () => ({ allowed })) },
    audit: {
      record: vi.fn(
        createAuditService({ sink: { append: vi.fn(async () => {}) } }).record,
      ),
    },
    jobs: { enqueue: vi.fn(async () => "job") },
    service: {
      localPreview: vi.fn(),
      publish: vi.fn(),
      author: vi.fn(),
      simulate: vi.fn(),
      get: vi.fn(),
    },
  };
  registerBusinessPartnerDefinitionRoutes({} as any, options as any);
  const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    },
    next = vi.fn();
  return {
    options,
    response,
    next,
    invoke: async (suffix: string, body: unknown = {}) => {
      const route = captured.find((item) =>
        item.contract.path.endsWith(suffix),
      )!;
      await route.handler(
        {
          params: { revisionId },
          headers: { "idempotency-key": "retry-key" },
          body,
        },
        response,
        next,
      );
    },
  };
}
describe("Studio definition approval boundary", () => {
  it("authorizes preview reads before resolving any metadata", async () => {
    const s = setup(false);
    await s.invoke("/local-business-partner-preview");
    expect(s.response.status).toHaveBeenCalledWith(403);
    expect(s.options.service.localPreview).not.toHaveBeenCalled();
  });
  it("scopes preview reads to the verified tenant and never enqueues approval", async () => {
    const s = setup();
    s.options.service.localPreview.mockResolvedValue({
      id: revisionId,
      preview: { state: "active" },
    });
    await s.invoke("/local-business-partner-preview");
    expect(s.options.service.localPreview).toHaveBeenCalledWith("tenant");
    expect(s.response.status).toHaveBeenCalledWith(200);
    expect(s.options.jobs.enqueue).not.toHaveBeenCalled();
  });

  it("records authoring through the native audit validator before returning the saved revision", async () => {
    const s = setup();
    s.options.service.author.mockResolvedValue({
      id: revisionId,
      bundleHash: "hash",
    });
    await s.invoke("/business-partner-definitions", {
      bundle: {},
      targetPlanes: ["neon"],
    });
    expect(s.options.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "studio.business_partner_definition.author",
        action: "author",
        entityId: revisionId,
      }),
    );
    expect(s.response.status).toHaveBeenCalledWith(201);
    expect(s.next).not.toHaveBeenCalled();
  });
  it("returns a duplicate immutable version as conflict without another approval job", async () => {
    const s = setup();
    s.options.service.author.mockRejectedValue(
      Object.assign(new Error("database detail"), {
        code: "23505",
        constraint: "business_partner_definition_revision_version_uq",
      }),
    );
    await s.invoke("/business-partner-definitions", {
      bundle: {},
      targetPlanes: ["neon", "mesh"],
    });
    expect(s.response.status).toHaveBeenCalledWith(409);
    expect(s.response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "BUSINESS_PARTNER_DEFINITION_VERSION_CONFLICT",
      }),
    );
    expect(s.options.jobs.enqueue).not.toHaveBeenCalled();
    expect(s.next).not.toHaveBeenCalled();
  });
  it("keeps unrelated database errors on the internal error path", async () => {
    const s = setup();
    const error = Object.assign(new Error("other constraint"), {
      code: "23505",
      constraint: "other",
    });
    s.options.service.author.mockRejectedValue(error);
    await s.invoke("/business-partner-definitions", {
      bundle: {},
      targetPlanes: ["neon"],
    });
    expect(s.next).toHaveBeenCalledWith(error);
    expect(s.response.status).not.toHaveBeenCalledWith(409);
  });
  it("denies publication before reading the revision or enqueuing work", async () => {
    const s = setup(false);
    await s.invoke("/publish");
    expect(s.response.status).toHaveBeenCalledWith(403);
    expect(s.options.service.publish).not.toHaveBeenCalled();
    expect(s.options.jobs.enqueue).not.toHaveBeenCalled();
  });
  it("returns maker/checker rejection as a bounded 403 without a publication job", async () => {
    const s = setup();
    s.options.service.publish.mockRejectedValue(
      new BusinessPartnerDefinitionError(
        "BUSINESS_PARTNER_DEFINITION_SELF_PUBLISH_FORBIDDEN",
      ),
    );
    await s.invoke("/publish");
    expect(s.response.status).toHaveBeenCalledWith(403);
    expect(s.options.jobs.enqueue).not.toHaveBeenCalled();
    expect(s.next).not.toHaveBeenCalled();
  });
  it("returns stale idempotency coordinates as conflict", async () => {
    const s = setup();
    s.options.service.publish.mockRejectedValue(
      new BusinessPartnerDefinitionError(
        "BUSINESS_PARTNER_DEFINITION_PUBLISH_IDEMPOTENCY_CONFLICT",
      ),
    );
    await s.invoke("/publish");
    expect(s.response.status).toHaveBeenCalledWith(409);
    expect(s.options.jobs.enqueue).not.toHaveBeenCalled();
  });
  it("queues approved release with the verified checker context and stable job ID", async () => {
    const s = setup();
    s.options.service.publish.mockResolvedValue({
      id: "release",
      status: "approved",
    });
    await s.invoke("/publish", { minimumRuntimeVersion: "1.0.0" });
    expect(s.options.service.publish).toHaveBeenCalledWith({
      tenantId: "tenant",
      revisionId,
      actorId: "checker",
      idempotencyKey: "retry-key",
      minimumRuntimeVersion: "1.0.0",
    });
    expect(s.options.jobs.enqueue).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { releaseId: "release" },
      expect.objectContaining({
        enqueueKey: "publication:release:compile:1",
        execution: expect.objectContaining({
          principalId: "checker",
          planeKey: "studio",
        }),
      }),
    );
    expect(s.response.status).toHaveBeenCalledWith(202);
  });
  it("reports missing comparison revisions without writing or publishing", async () => {
    const s = setup();
    s.options.service.simulate.mockRejectedValue(
      new BusinessPartnerDefinitionError(
        "BUSINESS_PARTNER_DEFINITION_NOT_FOUND",
      ),
    );
    await s.invoke("/simulations", {
      bundle: {},
      targetPlanes: ["neon"],
      againstRevisionId: revisionId,
    });
    expect(s.response.status).toHaveBeenCalledWith(404);
    expect(s.options.service.author).not.toHaveBeenCalled();
    expect(s.options.jobs.enqueue).not.toHaveBeenCalled();
  });
});
