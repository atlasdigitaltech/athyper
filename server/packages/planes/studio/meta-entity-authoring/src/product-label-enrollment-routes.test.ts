import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import { ProductCommandCleanupError } from "./product-command-authority.js";
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("./product-label-enrollment.js", () => ({
  createProductLabelEnrollment: () => execute,
}));
import { registerProductLabelEnrollmentRoutes } from "./product-label-enrollment-routes.js";
let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  );
  server = undefined;
  vi.resetAllMocks();
});
const proposal = {
  sourceHash: "a".repeat(64),
  revision: 2,
  idempotencyKey: "label-enrollment-1",
  defaultLocale: "en",
  requiredLocales: ["en"],
  declarations: [
    { sourcePath: "/displayName", labelKey: "title", defaultText: "Reference" },
  ],
};
const id = "00000000-0000-4000-8000-000000000001";
async function fixture() {
  const app = express();
  // Also prove byte bounds when the existing host has already parsed JSON.
  app.use(express.json());
  const context = {
    principalId: "verified-human",
    tenantId: "authority-tenant",
  } as VerifiedRequestContext;
  registerProductLabelEnrollmentRoutes(app, {
    labels: { maxBatchBytes: 2000 },
    authenticate: (req, res, next) => {
      if (req.headers.authorization !== "Bearer fixture") {
        res.sendStatus(401);
        return;
      }
      next();
    },
    readContext: () => context,
  } as Parameters<typeof registerProductLabelEnrollmentRoutes>[1]);
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/platform-control/meta-entity-authoring/change-sets/${id}/enroll-labels`;
  return {
    context,
    send: (body: unknown = { proposal }, query = "", authenticated = true) =>
      fetch(url + query, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authenticated ? { authorization: "Bearer fixture" } : {}),
        },
        body: JSON.stringify(body),
      }),
  };
}
it("requires authentication before invoking the canonical writer", async () => {
  const f = await fixture();
  expect((await f.send({ proposal }, "", false)).status).toBe(401);
  expect(execute).not.toHaveBeenCalled();
});
it("passes the verified context and source-bound command, without request actor scope", async () => {
  const f = await fixture();
  execute.mockResolvedValue({ revision: 3 });
  const r = await f.send();
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(execute).toHaveBeenCalledWith(f.context, {
    changeSetId: id,
    proposal,
  });
});
it.each([
  { proposal, actorId: "forged" },
  { proposal, tenantId: "forged" },
  { proposal: { ...proposal, sourceHash: "unknown" } },
  { proposal: { ...proposal, revision: -1 } },
  { proposal: { ...proposal, host: "approved" } },
  {
    proposal: {
      ...proposal,
      declarations: [{ ...proposal.declarations[0], memberId: id }],
    },
  },
])(
  "rejects forged scope and malformed proposals before admission: %j",
  async (body) => {
    const f = await fixture();
    expect((await f.send(body)).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  },
);
it("rejects query scope and oversized pre-parsed bodies", async () => {
  const f = await fixture();
  expect((await f.send({ proposal }, "?tenantId=forged")).status).toBe(400);
  expect(
    (
      await f.send({
        proposal: { ...proposal, defaultLocale: "a".repeat(2100) },
      })
    ).status,
  ).toBe(413);
  expect(execute).not.toHaveBeenCalled();
});
it.each([
  [
    new AuthoringConflictError("stale"),
    409,
    { code: "PRODUCT_LABEL_CONFLICT" },
  ],
  [
    new AuthoringPolicyError("REVOKED", "private details"),
    403,
    { code: "REVOKED" },
  ],
  [
    new ProductCommandCleanupError("committed", { private: "result" }),
    503,
    { code: "PRODUCT_COMMAND_REVOCATION_FAILED", outcome: "committed" },
  ],
  [
    new ProductCommandCleanupError(
      "unconfirmed",
      undefined,
      Error("private details"),
    ),
    503,
    { code: "PRODUCT_COMMAND_REVOCATION_FAILED", outcome: "unconfirmed" },
  ],
])("preserves safe retry semantics for %s", async (error, status, body) => {
  const f = await fixture();
  execute.mockRejectedValue(error);
  const r = await f.send();
  expect(r.status).toBe(status);
  expect(await r.json()).toEqual(body);
});

it("accepts exact source member correspondence and rejects malformed IDs", async () => {
  const f = await fixture();
  execute.mockResolvedValue({ revision: 3 });
  const declarations = [
    {
      sourcePath: "/fields/0/label",
      sourceMemberId: id,
      labelKey: "title",
      defaultText: "Reference",
    },
  ];
  expect(
    (await f.send({ proposal: { ...proposal, declarations } })).status,
  ).toBe(200);
  expect(execute).toHaveBeenLastCalledWith(f.context, {
    changeSetId: id,
    proposal: { ...proposal, declarations },
  });
  execute.mockClear();
  expect(
    (
      await f.send({
        proposal: {
          ...proposal,
          declarations: [{ ...declarations[0], sourceMemberId: "not-a-uuid" }],
        },
      })
    ).status,
  ).toBe(400);
  expect(execute).not.toHaveBeenCalled();
});
