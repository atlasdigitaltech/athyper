import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { WorkflowService, WorkItemPriority, WorkItemStatus } from "@athyper/server-contract-workflow";
import type { Application, RequestHandler, Response } from "express";
import { WorkflowError } from "./errors.js";

export interface WorkflowRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly workflow: WorkflowService;
}

export function registerWorkflowRoutes(application: Application, options: WorkflowRouteOptions): void {
  application.get("/api/workflow/requests/:id/context", options.authenticate, async (request, response, next) => {
    try { const result = await options.workflow.getRequestContext(options.readContext(response), uuidParam(request.params["id"], "id")); if (!result) response.status(404).json({ error: "WORKFLOW_REQUEST_NOT_FOUND" }); else response.json(result); }
    catch (error) { sendError(error, response, next); }
  });
  application.get("/api/workflow/inbox", options.authenticate, async (request, response, next) => {
    try {
      const result = await options.workflow.listInbox({ context: options.readContext(response), limit: integer(request.query["limit"]), cursor: text(request.query["cursor"]), statuses: statuses(request.query["status"]) });
      response.json(result);
    } catch (error) { sendError(error, response, next); }
  });
  application.post("/api/workflow/work-items", options.authenticate, async (request, response, next) => {
    try {
      const value = body(request.body);
      const result = await options.workflow.create({
        context: options.readContext(response), workTypeCode: requiredText(value, "workTypeCode"), title: requiredText(value, "title"),
        sourceEntityCode: requiredText(value, "sourceEntityCode"), sourceEntityId: requiredText(value, "sourceEntityId"),
        description: optionalText(value, "description"), sourceActionCode: optionalText(value, "sourceActionCode"),
        assigneePrincipalId: optionalText(value, "assigneePrincipalId"), assigneeTeamId: optionalText(value, "assigneeTeamId"),
        availableAt: optionalText(value, "availableAt"), dueAt: optionalText(value, "dueAt"),
        priority: priority(value["priority"]), payload: object(value["payload"]), idempotencyKey: header(request.headers["idempotency-key"]),
      });
      sendResult(result, response, 201);
    } catch (error) { sendError(error, response, next); }
  });
  for (const action of ["claim", "complete", "cancel"] as const) {
    application.post(`/api/workflow/work-items/:workItemId/${action}`, options.authenticate, async (request, response, next) => {
      try {
        const value = body(request.body ?? {});
        const result = await options.workflow[action]({ context: options.readContext(response), workItemId: param(request.params["workItemId"]), expectedRowVersion: optionalPositiveInteger(value["currentRowVersion"]), outcome: object(value["outcome"]), idempotencyKey: header(request.headers["idempotency-key"]) });
        sendResult(result, response, 200);
      } catch (error) { sendError(error, response, next); }
    });
  }
  application.post("/api/workflow/items/:id/actions/:action", options.authenticate, async (request, response, next) => {
    try {
      const value = body(request.body);
      const action = actionCode(Array.isArray(request.params["action"]) ? request.params["action"][0] : request.params["action"]);
      const result = await options.workflow.act({ context: options.readContext(response), workItemId: uuidParam(request.params["id"], "id"), action, expectedRowVersion: requiredPositiveInteger(value["currentRowVersion"]), outcome: object(value["outcome"]), idempotencyKey: requiredHeader(request.headers["idempotency-key"]) });
      sendResult(result, response, 200);
    } catch (error) { sendError(error, response, next); }
  });
}

function sendResult(result: Awaited<ReturnType<WorkflowService["claim"]>>, response: Response, committedStatus: number): void {
  const status = result.kind === "Committed" ? committedStatus : result.kind === "Forbidden" || result.kind === "PolicyDenied" ? 403 : result.kind === "NotFound" ? 404 : 409;
  response.status(status).json(result);
}
function sendError(error: unknown, response: Response, next: (error: unknown) => void): void { if (error instanceof WorkflowError) response.status(error.statusCode).json({ error: error.code, message: error.message }); else next(error); }
function body(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkflowError(400, "INVALID_BODY", "JSON object required"); return value as Record<string, unknown>; }
function object(value: unknown): Readonly<Record<string, unknown>> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
function requiredText(value: Record<string, unknown>, key: string): string { const result = optionalText(value, key); if (!result) throw new WorkflowError(400, "MISSING_FIELD", `${key} is required`); return result; }
function optionalText(value: Record<string, unknown>, key: string): string | undefined { const result = value[key]; return typeof result === "string" && result.trim() ? result.trim() : undefined; }
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function integer(value: unknown): number | undefined { if (value === undefined) return undefined; const parsed = Number(value); if (!Number.isInteger(parsed)) throw new WorkflowError(400, "INVALID_LIMIT", "limit must be an integer"); return parsed; }
function param(value: string | string[] | undefined): string { const result = Array.isArray(value) ? value[0] : value; if (!result || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new WorkflowError(400, "INVALID_ID", "workItemId must be a UUID"); return result; }
function header(value: string | string[] | undefined): string | undefined { const result = Array.isArray(value) ? value[0] : value; return result?.trim() || undefined; }
function requiredHeader(value: string | string[] | undefined): string { const result = header(value); if (!result) throw new WorkflowError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required"); return result; }
function requiredPositiveInteger(value: unknown): number { const result = optionalPositiveInteger(value); if (!result) throw new WorkflowError(400, "ROW_VERSION_REQUIRED", "currentRowVersion must be a positive integer"); return result; }
function optionalPositiveInteger(value: unknown): number | undefined { return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined; }
function actionCode(value: string | undefined): string { if (!value || !/^[a-z][a-z0-9_.:-]{1,62}$/.test(value)) throw new WorkflowError(400, "INVALID_ACTION", "Invalid workflow action"); return value; }
function uuidParam(value: string | string[] | undefined, name: string): string { const result = Array.isArray(value) ? value[0] : value; if (!result || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new WorkflowError(400, "INVALID_ID", `${name} must be a UUID`); return result; }
function priority(value: unknown): WorkItemPriority | undefined { if (value === undefined) return undefined; if (value === "low" || value === "normal" || value === "high" || value === "urgent") return value; throw new WorkflowError(400, "INVALID_PRIORITY", "Unknown workflow priority"); }
function statuses(value: unknown): readonly WorkItemStatus[] | undefined { const raw = text(value); if (!raw) return undefined; const values = raw.split(",").map((item) => item.trim()); const result = values.filter((item): item is WorkItemStatus => ["open", "claimed", "in_progress", "blocked", "completed", "cancelled"].includes(item)); if (result.length !== values.length) throw new WorkflowError(400, "INVALID_STATUS", "Unknown workflow status"); return result; }
