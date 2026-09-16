import type { Application, RequestHandler, Response } from "express";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { Transaction } from "kysely";
import type { PatchBusinessPartnerRequestCommand } from "@athyper/server-contract-master-data";
import {
  HttpError,
  defineRouteContract,
  registerContractRoute,
} from "@athyper/server-runtime-http";
import type {
  createSupplierProcessTasks,
  SupplierTaskVote,
  SupplierTaskInformationCommand,
  SupplierTaskEscalationCommand,
} from "./supplier-process-tasks.js";
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
export function mountSupplierProcessTasks(
  application: Application,
  options: {
    authenticate: RequestHandler;
    readContext(response: Response): VerifiedRequestContext;
    transactions: PlaneTransactionCoordinator<
      Transaction<Record<string, never>>
    >;
    service: ReturnType<typeof createSupplierProcessTasks>;
  },
) {
  for (const action of ["view", "start", "decide", "cancel", "information", "escalate", "edit-preview"] as const) {
    registerContractRoute(
      application,
      defineRouteContract({
        method: action === "view" ? "get" : "post",
        path: `/api/governance/process-tasks/cases/:caseId/${action}`,
        operationId: `governance.process_tasks.${action}`,
        summary: `${action} pinned supplier task execution`,
        tags: ["Governance"],
        authenticated: true,
        responses: {
          200: {
            description: "Task execution result",
            body: { type: "object", additionalProperties: true },
          },
          400: { description: "Invalid command" },
          403: { description: "Forbidden" },
          409: { description: "Task gate or version conflict" },
        },
      }),
      options.authenticate,
      async (request, response, next) => {
        try {
          const caseId = request.params["caseId"],
            body = request.body ?? {};
          if (!uuid(caseId) || Object.keys(request.query).length) {
            response.status(400).json({ code: "PROCESS_TASK_INPUT_INVALID" });
            return;
          }
          if (action === "edit-preview") {
            if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1 ||
              !body.proposedPayload || typeof body.proposedPayload !== "object" || Array.isArray(body.proposedPayload) ||
              (body.extensions !== undefined && (!body.extensions || typeof body.extensions !== "object" || Array.isArray(body.extensions))) ||
              (body.operatingOrganizationId !== undefined && !uuid(body.operatingOrganizationId)) ||
              (body.companyCodeId !== undefined && body.companyCodeId !== null && !uuid(body.companyCodeId)) ||
              (body.requestedRole !== undefined && ![null, "supplier", "customer"].includes(body.requestedRole)) ||
              Object.keys(body).some(k => !["expectedVersion", "proposedPayload", "extensions", "operatingOrganizationId", "companyCodeId", "requestedRole"].includes(k))) {
              response.status(400).json({ code: "TASK_EDIT_PREVIEW_INPUT_INVALID" }); return;
            }
          } else if (action === "escalate") {
            if (!uuid(body.attemptId) || !uuid(body.workItemId) || !Number.isSafeInteger(body.expectedWorkItemVersion) || body.expectedWorkItemVersion < 1 ||
              typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 2000 ||
              typeof body.idempotencyKey !== "string" || body.idempotencyKey.length < 8 || body.idempotencyKey.length > 160 || body.idempotencyKey.trim() !== body.idempotencyKey ||
              request.get("Idempotency-Key") !== body.idempotencyKey ||
              Object.keys(body).some(k => !["attemptId", "workItemId", "expectedWorkItemVersion", "reason", "idempotencyKey"].includes(k))) {
              response.status(400).json({ code: "PROCESS_ESCALATION_INPUT_INVALID" }); return;
            }
          } else if (action === "information") {
            if (!uuid(body.attemptId) || !uuid(body.workItemId) || !Number.isSafeInteger(body.expectedWorkItemVersion) || body.expectedWorkItemVersion < 1 ||
              !["request", "respond", "resolve", "escalate"].includes(body.action) ||
              (body.action === "resolve" ? body.text !== undefined : typeof body.text !== "string" || !body.text.trim() || body.text.length > (body.action === "request" ? 2000 : 4000)) ||
              typeof body.idempotencyKey !== "string" || body.idempotencyKey.length < 8 || body.idempotencyKey.length > 160 || body.idempotencyKey.trim() !== body.idempotencyKey ||
              request.get("Idempotency-Key") !== body.idempotencyKey ||
              Object.keys(body).some(k => !["attemptId", "workItemId", "expectedWorkItemVersion", "action", "text", "idempotencyKey"].includes(k))) {
              response.status(400).json({ code: "PROCESS_INFORMATION_INPUT_INVALID" }); return;
            }
          } else if (action === "decide") {
            const keys = [
              "attemptId",
              "cycleTaskId",
              "workflowRequestId",
              "workflowStageId",
              "workItemId",
            ];
            if (
              keys.some((k) => !uuid(body[k])) ||
              !Number.isSafeInteger(body.expectedWorkItemVersion) ||
              body.expectedWorkItemVersion < 1 ||
              !["accept_review", "approve", "return", "reject"].includes(
                body.action,
              ) ||
              (["return", "reject"].includes(body.action) &&
                (typeof body.reason !== "string" || !body.reason.trim())) ||
              typeof body.idempotencyKey !== "string" ||
              body.idempotencyKey.length < 8 ||
              body.idempotencyKey.length > 160 ||
              body.idempotencyKey.trim() !== body.idempotencyKey ||
              request.get("Idempotency-Key") !== body.idempotencyKey ||
              (body.reason !== undefined &&
                (typeof body.reason !== "string" ||
                  body.reason.length > 2000)) ||
              Object.keys(body).some(
                (k) =>
                  ![
                    ...keys,
                    "expectedWorkItemVersion",
                    "action",
                    "reason",
                    "idempotencyKey",
                  ].includes(k),
              )
            ) {
              response.status(400).json({ code: "PROCESS_TASK_INPUT_INVALID" });
              return;
            }
          } else if (action === "cancel") {
            if (
              !uuid(body.attemptId) ||
              !Number.isSafeInteger(body.expectedVersion) ||
              body.expectedVersion < 1 ||
              typeof body.reason !== "string" ||
              !body.reason.trim() ||
              body.reason.length > 2000 ||
              typeof body.idempotencyKey !== "string" ||
              body.idempotencyKey.length < 8 ||
              body.idempotencyKey.length > 160 ||
              body.idempotencyKey.trim() !== body.idempotencyKey ||
              request.get("Idempotency-Key") !== body.idempotencyKey ||
              Object.keys(body).some(
                (k) =>
                  ![
                    "attemptId",
                    "expectedVersion",
                    "reason",
                    "idempotencyKey",
                  ].includes(k),
              )
            ) {
              response.status(400).json({ code: "PROCESS_TASK_INPUT_INVALID" });
              return;
            }
          } else if (Object.keys(body).length) {
            response.status(400).json({ code: "PROCESS_TASK_INPUT_INVALID" });
            return;
          }
          const context = options.readContext(response);
          const result = await options.transactions.run<unknown>(
            context.planeKey,
            { tenantId: context.tenantId, principalId: context.principalId },
            (tx) =>
              action === "edit-preview"
                ? options.service.editPreview(context, caseId, body as Omit<PatchBusinessPartnerRequestCommand, "context" | "requestId">, tx)
                : action === "escalate"
                ? options.service.escalate(context, caseId, body as SupplierTaskEscalationCommand, tx)
                : action === "information"
                ? options.service.information(context, caseId, body as SupplierTaskInformationCommand, tx)
                : action === "decide"
                ? options.service.decide(
                    context,
                    caseId,
                    body as SupplierTaskVote,
                    tx,
                  )
                : action === "cancel"
                  ? options.service.cancel(context, caseId, body, tx)
                  : options.service[action](context, caseId, tx),
          );
          response.setHeader("Cache-Control", "no-store");
          response.status(200).json(result);
        } catch (error) {
          const state = (error as { code?: string }).code;
          if (
            ["42501", "23514", "23505", "55000", "40001"].includes(state ?? "")
          ) {
            const code =
              error instanceof Error && /^PROCESS_[A-Z_]+$/.test(error.message)
                ? error.message
                : "PROCESS_COMMAND_CONFLICT";
            next(new HttpError(state === "42501" ? 403 : 409, code, code));
          } else next(error);
        }
      },
    );
  }
}
