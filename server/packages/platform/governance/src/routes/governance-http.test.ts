import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  createHttpApplication,
  routeContracts,
} from "@athyper/server-runtime-http";
import { registerGovernanceRoutes } from "./governance-routes.js";
import { registerGovernanceComplianceRoutes } from "./compliance-routes.js";

const id = "11111111-1111-4111-8111-111111111111";
const context = {
  tenantId: id,
  principalId: id,
  planeKey: "neon",
  idempotencyKey: "header-key",
} as VerifiedRequestContext;
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});
const consent = {
  subjectType: "principal",
  subjectId: id,
  channel: "email",
  consented: true,
};
const run = { cycleTypeId: id, code: "CLOSE", name: "Close" };
const routes: [string, string, unknown, number][] = [
  ["post", "channel-consents", consent, 200],
  ["post", "cycle-runs", run, 201],
  ["post", `cycle-runs/${id}/transitions`, { status: "running" }, 200],
  ["get", `cycle-runs/${id}/readiness`, undefined, 200],
  ["post", `cycle-runs/${id}/completion`, { expectedVersion: 1, idempotencyKey: "completion-test" }, 200],
  ...["claim", "start"].map(
    (action) =>
      ["post", `cycle-tasks/${id}/${action}`, undefined, 200] as [
        string,
        string,
        unknown,
        number,
      ],
  ),
  ...["complete", "block", "waive"].map(
    (action) =>
      [
        "post",
        `cycle-tasks/${id}/${action}`,
        { evidence: { proof: true } },
        200,
      ] as [string, string, unknown, number],
  ),
  ["post", `cycle-tasks/${id}/reopen`, { reason: "Correction" }, 200],
  [
    "post",
    `cycle-runs/${id}/deviations`,
    { type: "exception", severity: "high", description: "Late" },
    201,
  ],
  ["post", `cycle-deviations/${id}/resolve`, { resolution: "Fixed" }, 200],
  ["post", `cycle-deviations/${id}/waive`, { reason: "Approved" }, 200],
  ["post", `cycle-deviations/${id}/carry-forward`, { targetRunId: id }, 200],
  [
    "post",
    `cycle-runs/${id}/certifications`,
    { certificationTypeCode: "close", statement: "Ready" },
    201,
  ],
  [
    "post",
    `cycle-certifications/${id}/submit`,
    { evidenceSnapshotId: id, evidenceSnapshot: { proof: true } },
    200,
  ],
  ["post", `cycle-certifications/${id}/certify`, { signature: "signed" }, 200],
  ["post", `cycle-certifications/${id}/reject`, { reason: "Incomplete" }, 200],
  ["post", "legal-holds", { code: "CASE", name: "Case" }, 201],
  ["get", `legal-holds/${id}`, undefined, 200],
  ["post", `legal-holds/${id}/activate`, undefined, 200],
  ["post", `legal-holds/${id}/release`, undefined, 200],
  [
    "post",
    `legal-holds/${id}/resources`,
    { kind: "document", resourceId: id },
    201,
  ],
  ["delete", `legal-holds/${id}/resources/${id}`, undefined, 204],
  [
    "post",
    "report-packs",
    { reportTypeCode: "audit.evidence", code: "PACK", name: "Evidence" },
    202,
  ],
  ["get", `report-packs/${id}`, undefined, 200],
  ["get", `report-packs/${id}/download`, undefined, 200],
];
async function setup() {
  const call = vi.fn(async (..._args: unknown[]) => ({ kind: "created" }));
  const authorize = vi.fn<
    import("@athyper/server-contract-auth").Authorizer["authorize"]
  >(async () => ({ allowed: true }));
  const service = new Proxy({}, { get: () => call }) as never;
  const app = createHttpApplication({
    openApi: { title: "Governance", version: "1", enforceResponses: true },
    configure(app) {
      const auth = {
        authenticate: (
          req: import("express").Request,
          res: import("express").Response,
          next: import("express").NextFunction,
        ) => {
          if (req.headers.authorization !== "Bearer test") {
            res.sendStatus(401);
            return;
          }
          next();
        },
        readContext: () => context,
      };
      registerGovernanceRoutes(app, {
        ...auth,
        authorizer: { authorize },
        consent: service,
        cycleRuns: service,
        cycleTasks: service,
        cycleDeviations: service,
        cycleCertifications: service,
      });
      registerGovernanceComplianceRoutes(app, {
        ...auth,
        legalHolds: service,
        reportPacks: service,
      });
    },
  });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const request = (
    method: string,
    path: string,
    body?: unknown,
    authenticated = true,
  ) =>
    fetch(`http://127.0.0.1:${address.port}/api/governance/${path}`, {
      method,
      headers: {
        ...(authenticated ? { authorization: "Bearer test" } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { request, call, authorize, app };
}
describe("all governance HTTP endpoints", () => {
  it.each(routes)(
    "%s %s handles valid and unauthenticated requests",
    async (method, path, body, status) => {
      const env = await setup();
      expect(
        routeContracts(env.app).filter((route) =>
          route.path.startsWith("/api/governance/"),
        ),
      ).toHaveLength(routes.length);
      expect((await env.request(method, path, body)).status).toBe(status);
      expect(env.call).toHaveBeenCalledOnce();
      const first = env.call.mock.calls[0]![0];
      expect(
        first === context ||
          (first as { context?: unknown }).context === context,
      ).toBe(true);
      env.call.mockClear();
      expect((await env.request(method, path, body, false)).status).toBe(401);
      expect(env.call).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["channel-consents", { ...consent, consented: "true" }],
    ["channel-consents", { ...consent, destination: 42 }],
    ["channel-consents", { ...consent, expiresAt: null }],
    ["cycle-runs", { ...run, templateVersion: true }],
    ["cycle-runs", { ...run, templateVersion: "2" }],
    ["cycle-runs", { ...run, ownerPrincipalId: {} }],
    ["cycle-runs", { ...run, periodStart: "2026-02-30" }],
    ["cycle-runs", { ...run, dueAt: "2026-02-30T12:00:00Z" }],
    ["cycle-runs", { ...run, dueAt: "2026-09-01T12:00:00" }],
    ["cycle-tasks/invalid/start", undefined],
    [`cycle-runs/${id}/completion`, { expectedVersion: 0, idempotencyKey: "test" }],
    [`cycle-runs/${id}/completion`, { expectedVersion: 1, idempotencyKey: "" }],
    [`cycle-tasks/${id}/claim`, { ownerPrincipalId: 42 }],
    [`legal-holds/${id}/activate`, { effectiveAt: false }],
    [`legal-holds/${id}/release`, { releasedAt: "yesterday" }],
    [
      `legal-holds/${id}/resources`,
      { kind: "document", resourceId: id, contentHash: "bad" },
    ],
    [
      "report-packs",
      {
        reportTypeCode: "audit.evidence",
        code: "PACK",
        name: "Pack",
        supersedesReportPackId: [],
      },
    ],
  ])("rejects malformed request to %s", async (path, body) => {
    const env = await setup();
    expect((await env.request("post", path as string, body)).status).toBe(400);
    expect(env.call).not.toHaveBeenCalled();
  });
  it.each([
    ["GOVERNANCE_PERMISSION_DENIED", 403],
    ["GOVERNANCE_CYCLE_RUN_NOT_FOUND", 404],
    ["GOVERNANCE_INVALID_TRANSITION", 409],
    ["GOVERNANCE_INVALID_COMMAND", 400],
    ["GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE", 503],
  ])("maps %s", async (code, status) => {
    const env = await setup();
    env.call.mockRejectedValue(
      Object.assign(new Error("private details"), { code }),
    );
    expect((await env.request("post", "cycle-runs", run)).status).toBe(status);
    expect((await env.request("get", `legal-holds/${id}`)).status).toBe(status);
  });
  it("keeps unexpected TypeErrors as 500 and enforces consent permission before writing", async () => {
    const env = await setup();
    env.call.mockRejectedValue(new TypeError("private backend bug"));
    const response = await env.request("get", `report-packs/${id}`);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private backend bug");
    env.call.mockClear();
    env.authorize.mockResolvedValue({ allowed: false, reason: "denied" });
    expect(
      (await env.request("post", "channel-consents", consent)).status,
    ).toBe(403);
    expect(env.call).not.toHaveBeenCalled();
  });
  it("maps known database conflicts and tenant owner references without leaking SQL", async () => {
    const env = await setup();
    for (const constraint of [
      "cycle_run_code_uq",
      "legal_hold_code_uq",
      "report_pack_code_uq",
    ]) {
      env.call.mockRejectedValue(
        Object.assign(new Error("SQL private details"), {
          code: "23505",
          constraint,
        }),
      );
      const result = await env.request("post", "cycle-runs", run);
      expect(result.status).toBe(409);
      expect(await result.text()).not.toContain("SQL private");
    }
    env.call.mockRejectedValue(
      Object.assign(new Error("SQL private details"), {
        code: "23503",
        constraint: "cycle_run_owner_fk",
      }),
    );
    expect((await env.request("post", "cycle-runs", run)).status).toBe(400);
    env.call.mockRejectedValue(
      Object.assign(new Error("unexpected constraint"), {
        code: "23505",
        constraint: "unrelated_constraint",
      }),
    );
    expect((await env.request("post", "cycle-runs", run)).status).toBe(500);
  });
});
