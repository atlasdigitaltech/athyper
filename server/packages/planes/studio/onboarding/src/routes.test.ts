import express from "express";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { OnboardingCaseLifecycleService } from "./case-lifecycle.js";
import { registerOnboardingRoutes } from "./routes.js";

const caseId = "10000000-0000-4000-8000-000000000007";
const context = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  principalId: "10000000-0000-4000-8000-000000000002",
} as VerifiedRequestContext;
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});
async function fixture(allowed = true, authenticated = true) {
  const drafts = new Map<string, { fingerprint: string; caseId: string }>();
  const createDraft = vi.fn(async (input: any) => {
    const prior = drafts.get(input.caseCode);
    if (prior && prior.fingerprint !== input.fingerprint)
      throw new Error("ONBOARDING_IDEMPOTENCY_CONFLICT");
    drafts.set(input.caseCode, input);
    return {
      caseId: input.caseId,
      status: "draft" as const,
      desiredVersion: 1,
      desiredHash: "",
      replayed: !!prior,
    };
  });
  const transition = vi.fn(async (input: any) => ({
    caseId: input.caseId,
    status: input.to,
    desiredVersion: 1,
    desiredHash: "",
    replayed: false,
  }));
  const lifecycle = new OnboardingCaseLifecycleService(
    {
      createDraft,
      transition,
      resolveWorkItem: vi.fn(),
      revokeExpiredGuestAccess: vi.fn(),
    },
    { run: async (_actor, work) => work({}) },
  );
  const saga = { reconcile: vi.fn().mockResolvedValue({ caseId }) },
    maintenance = { resolveWorkItem: vi.fn().mockResolvedValue(true) };
  const app = express();
  app.use(express.json());
  registerOnboardingRoutes(app, {
    authenticate: (_req, res, next) => {
      if (authenticated) next();
      else res.sendStatus(401);
    },
    readContext: () => context,
    authorize: vi.fn().mockResolvedValue(allowed),
    lifecycle,
    saga,
    maintenance,
  });
  app.use(((
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) =>
    res.status(500).json({ code: "INTERNAL" })) as express.ErrorRequestHandler);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const post = (path: string, body: unknown = {}) =>
    fetch(
      `http://127.0.0.1:${address.port}/api/studio/onboarding/cases${path}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "test-command",
        },
        body: JSON.stringify(body),
      },
    );
  return { post, createDraft, transition, saga, maintenance };
}
const draft = { caseCode: "supplier.acme", canonicalPartyId: caseId };
const command = { expectedStatus: "submitted" };
describe("onboarding HTTP routes", () => {
  it("replays drafts without a supplied ID and rejects changed payloads", async () => {
    const f = await fixture();
    const first = await f.post("", draft),
      second = await f.post("", draft);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((await second.json()).caseId).toBe((await first.json()).caseId);
    expect(
      (await f.post("", { ...draft, requestPayload: { changed: true } }))
        .status,
    ).toBe(409);
  });
  it.each([false, true])(
    "enforces authentication and authorization on all routes (authenticated=%s)",
    async (authenticated) => {
      const f = await fixture(false, authenticated);
      for (const [path, body] of [
        ["", draft],
        [`/${caseId}/actions/begin-qualification`, command],
        [`/${caseId}/reconcile`, {}],
        [`/${caseId}/work-items/${caseId}/resolve`, {}],
      ] as const)
        expect((await f.post(path, body)).status).toBe(
          authenticated ? 403 : 401,
        );
      expect(f.createDraft).not.toHaveBeenCalled();
      expect(f.transition).not.toHaveBeenCalled();
      expect(f.saga.reconcile).not.toHaveBeenCalled();
      expect(f.maintenance.resolveWorkItem).not.toHaveBeenCalled();
    },
  );
  it.each([
    { caseCode: {} },
    { canonicalPartyId: "wrong" },
    { caseId: "" },
    { sourceMode: "wrong" },
    { activationCriticality: "wrong" },
    { requestMetadata: [] },
    { requestPayload: null },
  ])("rejects invalid draft %j", async (patch) => {
    const f = await fixture();
    expect((await f.post("", { ...draft, ...patch })).status).toBe(400);
    expect(f.createDraft).not.toHaveBeenCalled();
  });
  it.each([
    { expectedStatus: "unknown" },
    { expectedStatus: "toString" },
    { expectedDesiredVersion: "1" },
    { expectedDesiredVersion: 0 },
    { expectedDesiredVersion: 1.5 },
    { approvedRevision: [] },
    { compilation: {} },
    { reason: {} },
  ])("rejects invalid action %j", async (patch) => {
    const f = await fixture();
    expect(
      (
        await f.post(`/${caseId}/actions/begin-qualification`, {
          ...command,
          ...patch,
        })
      ).status,
    ).toBe(400);
    expect(f.transition).not.toHaveBeenCalled();
  });
  it("rejects malformed path IDs on all case routes", async () => {
    const f = await fixture();
    for (const path of [
      "/bad/reconcile",
      "/bad/actions/submit",
      `/bad/work-items/${caseId}/resolve`,
      `/${caseId}/work-items/bad/resolve`,
    ])
      expect((await f.post(path, command)).status).toBe(400);
  });
  it("dispatches actions and returns known errors without swallowing unexpected failures", async () => {
    const f = await fixture(),
      path = `/${caseId}/actions/begin-qualification`;
    expect((await f.post(path, command)).status).toBe(200);
    expect((await f.post(`/${caseId}/actions/unknown`, command)).status).toBe(
      404,
    );
    for (const [message, status] of [
      ["ONBOARDING_CASE_NOT_FOUND", 404],
      ["ONBOARDING_DESIRED_VERSION_CONFLICT", 409],
      ["unexpected conflict in infrastructure", 500],
    ] as const) {
      f.transition.mockRejectedValueOnce(new Error(message));
      expect((await f.post(path, command)).status).toBe(status);
    }
  });
  it("propagates tenant context to reconciliation and maps missing cases", async () => {
    const f = await fixture();
    expect((await f.post(`/${caseId}/reconcile`)).status).toBe(202);
    expect(f.saga.reconcile).toHaveBeenCalledWith(caseId, context.tenantId);
    f.saga.reconcile.mockRejectedValueOnce(
      new Error(`Onboarding case not found: ${caseId}`),
    );
    expect((await f.post(`/${caseId}/reconcile`)).status).toBe(404);
  });
  it("maps work-item service permission denial and missing links", async () => {
    const f = await fixture(),
      path = `/${caseId}/work-items/${caseId}/resolve`;
    expect((await f.post(path)).status).toBe(200);
    f.maintenance.resolveWorkItem.mockResolvedValueOnce(false);
    expect((await f.post(path)).status).toBe(404);
    f.maintenance.resolveWorkItem.mockRejectedValueOnce(
      Object.assign(new Error("denied"), {
        code: "ONBOARDING_WORK_ITEM_FORBIDDEN",
      }),
    );
    expect((await f.post(path)).status).toBe(403);
  });
});
