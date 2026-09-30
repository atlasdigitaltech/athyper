import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { WorkflowService, WorkItemActionResult } from "@athyper/server-contract-workflow";
import { registerWorkflowRoutes } from "../workflow-routes.js";
import { WorkflowError } from "../errors.js";

const id = "11111111-1111-4111-8111-111111111111";
const context = { tenantId: id, principalId: id, planeKey: "neon" } as VerifiedRequestContext;
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }))); });
async function fixture() {
  const mutation = () => vi.fn(async (): Promise<WorkItemActionResult> => ({ kind: "NotFound", workItemId: id }));
  const workflow = { create: mutation(), claim: mutation(), complete: mutation(), cancel: mutation(), act: mutation(), listInbox: vi.fn(async () => ({ data: [], totalCount: 0 })), getRequestContext: vi.fn(async () => null) } satisfies WorkflowService;
  const app = express(); app.use(express.json());
  registerWorkflowRoutes(app, { workflow, authenticate: (req, res, next) => { if (req.headers["x-unauthenticated"]) res.sendStatus(401); else { res.locals["verified"] = true; next(); } }, readContext: res => { expect(res.locals["verified"]).toBe(true); return context; } });
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
  return { workflow, request: (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${address.port}/api/workflow${path}`, { method, headers: { "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) };
}
const createBody = { workTypeCode: "approval", title: "Review", sourceEntityCode: "supplier", sourceEntityId: id };
describe("workflow HTTP routes", () => {
  it.each([["GET", "/inbox"], ["GET", `/requests/${id}/context`], ["POST", "/work-items"], ["POST", `/items/${id}/actions/approve`], ...["claim", "complete", "cancel"].map(action => ["POST", `/work-items/${id}/${action}`])])("authenticates %s %s", async (method, path) => {
    const { workflow, request } = await fixture();
    expect((await request(path!, method, method === "GET" ? undefined : {}, { "x-unauthenticated": "1" })).status).toBe(401);
    for (const method of Object.values(workflow)) expect(method).not.toHaveBeenCalled();
  });
  it.each(["limit=1&limit=2", "limit=1e1", "limit=0", "limit=101", "status=open&status=claimed", "status=", "status=unknown", "cursor=a&cursor=b", "cursor="])("rejects malformed query %s", async query => {
    const { workflow, request } = await fixture(); expect((await request(`/inbox?${query}`)).status).toBe(400); expect(workflow.listInbox).not.toHaveBeenCalled();
  });
  it("passes inbox filters and verified identity", async () => {
    const { workflow, request } = await fixture(); expect((await request("/inbox?limit=10&status=open,claimed")).status).toBe(200);
    expect(workflow.listInbox).toHaveBeenCalledWith({ context, limit: 10, statuses: ["open", "claimed"], cursor: undefined });
  });
  it.each(["claim", "complete", "cancel"])("validates the optional version for %s", async action => {
    const { workflow, request } = await fixture();
    for (const currentRowVersion of [0, -1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) expect((await request(`/work-items/${id}/${action}`, "POST", { currentRowVersion })).status).toBe(400);
    expect(workflow[action as "claim"]).not.toHaveBeenCalled();
    expect((await request(`/work-items/${id}/${action}`, "POST")).status).toBe(404);
  });
  it.each([{ payload: [] }, { payload: null }, { assigneePrincipalId: 42 }, { dueAt: false }, { description: {} }, ...["eligibility_evidence", "workflow_revision", "workflow_request_id", "policy_evaluation", "idempotency_key"].map(key => ({ payload: { [key]: {} } }))])("rejects invalid or server-managed creation fields: %j", async fields => {
    const { workflow, request } = await fixture(); expect((await request("/work-items", "POST", { ...createBody, ...fields })).status).toBe(400); expect(workflow.create).not.toHaveBeenCalled();
  });
  it("requires version and idempotency key for generic actions", async () => {
    const { workflow, request } = await fixture();
    expect((await request(`/items/${id}/actions/approve`, "POST", {})).status).toBe(400);
    expect((await request(`/items/${id}/actions/approve`, "POST", { currentRowVersion: 1 })).status).toBe(400);
    expect((await request(`/items/${id}/actions/approve`, "POST", { currentRowVersion: 1, outcome: [] }, { "idempotency-key": "key" })).status).toBe(400);
    expect(workflow.act).not.toHaveBeenCalled();
    expect((await request(`/items/${id}/actions/approve`, "POST", { currentRowVersion: 1 }, { "idempotency-key": "key" })).status).toBe(404);
    expect(workflow.act).toHaveBeenCalledWith(expect.objectContaining({ context, action: "approve", expectedRowVersion: 1, idempotencyKey: "key" }));
  });
  it.each([["23503", 422], ["23514", 400], ["23505", 409]] as const)("maps database constraint %s without leaking details", async (code, status) => {
    const { workflow, request } = await fixture(); workflow.create.mockRejectedValueOnce(Object.assign(new Error("private database details"), { code }));
    const response = await request("/work-items", "POST", createBody); expect(response.status).toBe(status); expect(await response.text()).not.toContain("private database details");
  });
  it("maps domain results and errors", async () => {
    const { workflow, request } = await fixture();
    for (const [result, status] of [[{ kind: "Forbidden", permissionCode: "read" }, 403], [{ kind: "PolicyDenied", policyIds: [] }, 403], [{ kind: "Conflict", reason: "stale" }, 409]] as const) {
      workflow.claim.mockResolvedValueOnce(result); expect((await request(`/work-items/${id}/claim`, "POST")).status).toBe(status);
    }
    workflow.listInbox.mockRejectedValueOnce(new WorkflowError(400, "INVALID_CURSOR", "Invalid cursor"));
    expect((await request("/inbox")).status).toBe(400);
    expect((await request(`/requests/${id}/context`)).status).toBe(404);
    expect(workflow.getRequestContext).toHaveBeenCalledWith(context, id);
    expect((await request("/requests/invalid/context")).status).toBe(400);
  });
});
