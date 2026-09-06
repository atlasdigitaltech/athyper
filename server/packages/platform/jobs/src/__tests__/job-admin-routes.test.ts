import { JobValidationError } from "@athyper/server-contract-jobs";
import { createServer } from "node:http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { describe, expect, it, vi } from "vitest";
import { registerJobAdministrationRoutes } from "../job-admin-routes.js";

describe("job cancellation HTTP contract", () => {
  it.each([false, true])("returns the documented response for applied=%s", async (applied) => {
    const cancel = vi.fn(async () => ({ command: "cancel" as const, applied,
      ...(applied ? { jobId: "job-1" } : { reason: "Job is not cancellable or the owning worker did not acknowledge cancellation" }),
    }));
    const app = createHttpApplication({ configure(application) {
      registerJobAdministrationRoutes(application, {
        authenticate: (_request, _response, next) => next(),
        readContext: () => ({ planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1", requestId: "request-1" }) as VerifiedRequestContext,
        authorizer: { authorize: async () => ({ allowed: true }) },
        jobs: { cancel, retry: cancel, replay: cancel, listDeadLetters: async () => [] },
      });
    } });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing test server address");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/jobs/admin/executions/11111111-1111-4111-8111-111111111111/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Operator cancellation" }),
      });
      expect(response.status).toBe(applied ? 200 : 409);
      expect(await response.json()).toMatchObject({ command: "cancel", applied });
      expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ reason: "Operator cancellation" }));
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});

const executionId = "11111111-1111-4111-8111-111111111111";
const schedule = { code: "daily", name: "Daily", handlerType: "run", cronExpression: "0 * * * *", timezone: "UTC", targetQueue: "jobs", payloadTemplate: {}, reason: "Operator change" };

describe("Jobs request validation", () => {
  it.each([
    { method: "GET", path: "/dead-letters?limit=0" },
    { method: "GET", path: "/executions?limit=201" },
    { method: "GET", path: "/executions?limit=1.5" },
    { method: "GET", path: "/executions?limit=invalid" },
    { method: "GET", path: "/executions?cursor=invalid" },
    ...["cancel", "retry", "replay"].flatMap((command) => [
      { method: "POST", path: `/executions/invalid/${command}`, body: { reason: "test" } },
      { method: "POST", path: `/executions/${executionId}/${command}`, body: {} },
      { method: "POST", path: `/executions/${executionId}/${command}`, body: { reason: "  " } },
    ]),
    { method: "POST", path: "/schedules", body: { ...schedule, name: "" } },
    { method: "POST", path: "/schedules", body: { ...schedule, payloadTemplate: [] } },
    { method: "POST", path: "/schedules", body: { ...schedule, reason: 42 } },
    { method: "PUT", path: "/schedules/invalid", body: schedule },
    { method: "POST", path: `/schedules/${executionId}/deactivate`, body: {} },
    { method: "GET", path: "/schedules/invalid/audit" },
    { method: "POST", path: "/schedules/preview", body: { timezone: "UTC" } },
    { method: "POST", path: "/schedules/preview", body: { expression: "0 * * * *", timezone: "" } },
  ])("returns 400 for $method $path", async ({ method, path, ...input }) => {
    const calls = vi.fn();
    await withValidationServer(calls, async (url) => {
      const response = await fetch(`${url}/api/jobs/admin${path}`, {
        method, ...("body" in input ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.body) } : {}),
      });
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(await response.json()).toMatchObject({ status: 400, code: "JOBS_INVALID_REQUEST" });
      expect(calls).not.toHaveBeenCalled();
    });
  });

  it.each([
    { error: new JobValidationError("Invalid cron schedule"), status: 400, code: "JOBS_INVALID_REQUEST" },
    { error: new TypeError("Unexpected programming error"), status: 500, code: "INTERNAL_ERROR" },
    { error: new Error("Database unavailable"), status: 500, code: "INTERNAL_ERROR" },
  ])("maps $code correctly for service failures", async ({ error, status, code }) => {
    await withValidationServer(() => { throw error; }, async (url) => {
      for (const path of ["/schedules", `/schedules/${executionId}`, "/schedules/preview"]) {
        const response = await fetch(`${url}/api/jobs/admin${path}`, {
          method: path.endsWith(executionId) ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...schedule, expression: schedule.cronExpression }),
        });
        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({ status, code });
      }
    });
  });

  it("preserves valid pagination and schedule requests", async () => {
    const calls = vi.fn();
    await withValidationServer(calls, async (url) => {
      const list = await fetch(`${url}/api/jobs/admin/executions?limit=200&cursor=${executionId}`);
      expect(list.status).toBe(200);
      expect(calls).toHaveBeenCalledWith(expect.objectContaining({ limit: 200, cursor: executionId }));
      const create = await fetch(`${url}/api/jobs/admin/schedules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(schedule) });
      expect(create.status).toBe(201);
    });
  });
});

async function withValidationServer(call: (...args: unknown[]) => void, work: (url: string) => Promise<void>) {
  const command = async (input: unknown) => { call(input); return { command: "cancel" as const, applied: true }; };
  const list = async (input?: unknown) => { call(input); return []; };
  const mutate = async (input: unknown) => { call(input); return { ...schedule, id: executionId, enabled: true }; };
  const app = createHttpApplication({ configure(application) {
    registerJobAdministrationRoutes(application, {
      authenticate: (_request, _response, next) => next(),
      readContext: () => ({ planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1", requestId: "request-1" }) as VerifiedRequestContext,
      authorizer: { authorize: async () => ({ allowed: true }) },
      jobs: { cancel: command, retry: command, replay: command, listDeadLetters: list },
      governance: { listQueues: list, listExecutions: list, listSchedules: list, listScheduleAudit: list,
        createSchedule: mutate, updateSchedule: mutate, deactivateSchedule: async (input) => { call(input); },
        previewCron: (input) => { call(input); return { expression: input.expression, timezone: input.timezone, nextRuns: [] }; },
      },
    });
  } });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    await work(`http://127.0.0.1:${address.port}`);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}
