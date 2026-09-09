import { beforeEach, describe, it, expect, vi } from "vitest";
import { registerBankDirectoryRoutes } from "../bank-directory-routes.js";
const routes = vi.hoisted(
  () =>
    [] as {
      contract: { path: string; method: string };
      handler: (...args: any[]) => Promise<void>;
    }[],
);
vi.mock("@athyper/server-runtime-http", async (original) => ({
  ...(await original<object>()),
  registerContractRoute: (
    _app: unknown,
    contract: any,
    _authenticate: any,
    handler: any,
  ) => routes.push({ contract, handler }),
}));
beforeEach(() => {
  routes.length = 0;
});
function setup(allowed = true, plane = "studio") {
  const options = {
    authenticate: vi.fn(),
    readContext: () => ({
      planeKey: plane,
      tenantId: "tenant",
      principalId: "checker",
      requestId: "request",
    }),
    authorizer: { authorize: vi.fn(async () => ({ allowed })) },
    audit: { record: vi.fn(async () => {}) },
    jobs: { enqueue: vi.fn(async () => "job") },
    service: {
      import: vi.fn(async () => ({ id: "revision" })),
      list: vi.fn(),
      get: vi.fn(),
      review: vi.fn(async () => ({ release: { id: "release" } })),
      resume: vi.fn(async () => ({ release: { id: "release" } })),
      reconcile: vi.fn(),
    },
  };
  registerBankDirectoryRoutes({} as any, options as any);
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  return { options, response, next: vi.fn() };
}
const revisionId = "11000000-0000-4000-8000-000000000003";
describe("bank directory authority routes", () => {
  it.each([
    [false, "studio"],
    [true, "neon"],
  ])("denies unauthorized caller %s in %s", async (allowed, plane) => {
    const t = setup(allowed as boolean, plane as string);
    await routes
      .find((r) => r.contract.path.endsWith("/import"))!
      .handler(
        { headers: { "idempotency-key": "key" }, body: {} },
        t.response,
        t.next,
      );
    expect(t.response.status).toHaveBeenCalledWith(403);
    expect(t.options.service.import).not.toHaveBeenCalled();
  });
  it("queues only an approved immutable release and audits the revision", async () => {
    const t = setup();
    await routes
      .find((r) => r.contract.path.endsWith("/review"))!
      .handler(
        {
          params: { revisionId },
          headers: {},
          body: { decision: "approved", reason: "Checked sources" },
        },
        t.response,
        t.next,
      );
    expect(t.next).not.toHaveBeenCalled();
    expect(t.options.jobs.enqueue).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { releaseId: "release" },
      expect.objectContaining({ enqueueKey: "publication:release:compile:1" }),
    );
    expect(t.options.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: revisionId }),
    );
  });
  it("does not queue a rejected revision", async () => {
    const t = setup();
    t.options.service.review.mockResolvedValueOnce({ release: null } as any);
    await routes
      .find((r) => r.contract.path.endsWith("/review"))!
      .handler(
        {
          params: { revisionId },
          body: { decision: "rejected", reason: "Wrong source" },
        },
        t.response,
        t.next,
      );
    expect(t.options.jobs.enqueue).not.toHaveBeenCalled();
  });
  it("requires an import retry key", async () => {
    const t = setup();
    await routes
      .find((r) => r.contract.path.endsWith("/import"))!
      .handler({ headers: {}, body: {} }, t.response, t.next);
    expect(t.response.status).toHaveBeenCalledWith(400);
    expect(t.options.service.import).not.toHaveBeenCalled();
  });
  it("resumes the same release without recording a second approval", async () => {
    const t = setup();
    await routes
      .find((r) => r.contract.path.endsWith("/resume"))!
      .handler(
        {
          params: { revisionId },
          headers: { "idempotency-key": "resume-1" },
          body: {},
        },
        t.response,
        t.next,
      );
    expect(t.options.service.review).not.toHaveBeenCalled();
    expect(t.options.service.resume).toHaveBeenCalledWith(
      "tenant",
      "checker",
      revisionId,
    );
    expect(t.options.jobs.enqueue).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { releaseId: "release" },
      expect.objectContaining({
        enqueueKey: "publication:release:compile:resume:resume-1",
      }),
    );
  });
});
