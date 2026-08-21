import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { controlAdminSchemas, type RuntimeApprovalDecision, type RuntimeControlCommand } from "@athyper/server-contract-control-admin";
import { defineRouteContract, registerContractRoute, type RuntimeSchema } from "@athyper/server-runtime-http";
import type { Application, Request, RequestHandler, Response } from "express";
import type { createRuntimeCommandService } from "./runtime-command-service.js";

type RuntimeCommandService = ReturnType<typeof createRuntimeCommandService>;

export function registerRuntimeCommandRoutes(application: Application, options: {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly service: RuntimeCommandService;
}): void {
  registerContractRoute(application, contract(
    "post", "/api/control-admin/runtime-commands/dry-run", "runtimeCommands.dryRun",
    "Preview and diff a runtime command", "control.runtime_command.manage", controlAdminSchemas.runtimeCommand,
  ), options.authenticate, route(async (request, response) => options.service.preview(
    options.readContext(response), command(body(request)),
  )));
  registerContractRoute(application, contract(
    "post", "/api/control-admin/runtime-commands", "runtimeCommands.submit",
    "Submit or apply a runtime command", "control.runtime_command.manage", controlAdminSchemas.runtimeCommand,
  ), options.authenticate, route(async (request, response) => {
    const result = await options.service.submit(options.readContext(response), command(body(request)));
    return result.outcome === "approval_required" ? { status: 202, body: result } : result;
  }));
  registerContractRoute(application, contract(
    "post", "/api/control-admin/runtime-approvals/:id/decisions", "runtimeApprovals.decide",
    "Approve or reject a high-risk runtime command", "control.runtime_command.approve", controlAdminSchemas.runtimeApprovalDecision,
  ), options.authenticate, route(async (request, response) => {
    const input = body(request);
    return options.service.decideApproval(
      options.readContext(response),
      required(request.params["id"]),
      approvalDecision(input["decision"]),
      required(input["reason"]),
    );
  }));
  registerContractRoute(application, contract(
    "get", "/api/control-admin/runtime-history", "runtimeHistory.list",
    "List immutable runtime change history", "control.runtime_history.read",
  ), options.authenticate, route(async (request, response) => options.service.history(
    options.readContext(response), optionalLimit(request.query["limit"]),
  )));
}

function contract(method: "get" | "post", path: string, operationId: string, summary: string, permission: string, schema?: RuntimeSchema) {
  return defineRouteContract({
    method, path, operationId: `controlAdmin.${operationId}`, summary,
    tags: ["Control Administration"], authenticated: true, permission,
    ...(schema ? { request: { body: schema } } : {}),
    responses: {
      200: { description: "Control administration response", body: controlAdminSchemas.response },
      202: { description: "Approval required", body: controlAdminSchemas.response },
      400: { description: "Invalid command" },
      403: { description: "Permission or approval denied" },
      404: { description: "Approval not found" },
      409: { description: "Command, version, or approval conflict" },
    },
  });
}

function route(work: (request: Request, response: Response) => Promise<unknown>) {
  return async (request: Request, response: Response, next: (error?: unknown) => void) => {
    try {
      const result = await work(request, response);
      if (result && typeof result === "object" && "status" in result && "body" in result) {
        const envelope = result as { readonly status: number; readonly body: unknown };
        response.status(envelope.status).json(envelope.body);
      } else response.json(result);
    } catch (error) { next(error); }
  };
}

function command(input: Record<string, unknown>): RuntimeControlCommand {
  const payload = input["payload"];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw invalid();
  const expectedVersion = input["expectedVersion"];
  if (expectedVersion !== undefined && (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 0)) throw invalid();
  return {
    commandId: required(input["commandId"]),
    idempotencyKey: required(input["idempotencyKey"]),
    kind: required(input["kind"]),
    reason: required(input["reason"]),
    payload: payload as RuntimeControlCommand["payload"],
    ...(expectedVersion !== undefined ? { expectedVersion: Number(expectedVersion) } : {}),
    ...(typeof input["approvalId"] === "string" && input["approvalId"].trim()
      ? { approvalId: input["approvalId"].trim() }
      : {}),
  };
}
function body(request: Request): Record<string, unknown> { if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) throw invalid(); return request.body as Record<string, unknown>; }
function required(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw invalid(); return value.trim(); }
function approvalDecision(value: unknown): RuntimeApprovalDecision { if (value !== "approved" && value !== "rejected") throw invalid(); return value; }
function optionalLimit(value: unknown): number { if (value === undefined) return 50; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) throw invalid(); return parsed; }
function invalid(): Error { return Object.assign(new TypeError("Invalid runtime control command"), { code: "CONTROL_ADMIN_INVALID_COMMAND", status: 400 }); }
