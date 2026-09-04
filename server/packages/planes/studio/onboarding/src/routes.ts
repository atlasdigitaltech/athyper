import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  Application,
  NextFunction,
  RequestHandler,
  Response,
} from "express";
import { randomUUID } from "node:crypto";
import type {
  OnboardingCaseCommand,
  OnboardingCaseLifecycleService,
} from "./case-lifecycle.js";
import type { OnboardingMaintenanceService } from "./maintenance.js";

export interface OnboardingRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly authorize: (
    context: VerifiedRequestContext,
    caseId: string,
  ) => Promise<boolean>;
  readonly saga: { reconcile(caseId: string): Promise<unknown> };
  readonly lifecycle?: Pick<
    OnboardingCaseLifecycleService<unknown>,
    | "draft"
    | "submit"
    | "beginQualification"
    | "compile"
    | "approve"
    | "reject"
    | "provision"
    | "reconcile"
    | "activate"
    | "correct"
    | "suspend"
    | "offboard"
    | "finishOffboarding"
    | "fail"
    | "cancel"
  >;
  readonly maintenance?: Pick<
    OnboardingMaintenanceService<unknown>,
    "resolveWorkItem"
  >;
}

export function registerOnboardingRoutes(
  app: Application,
  options: OnboardingRouteOptions,
): void {
  app.post(
    "/api/studio/onboarding/cases/:caseId/reconcile",
    options.authenticate,
    async (request, response, next) => {
      try {
        const caseId = String(request.params.caseId ?? "").trim();
        if (!caseId) {
          response
            .status(400)
            .json({ code: "INVALID_CASE_ID", message: "caseId is required" });
          return;
        }
        if (!(await options.authorize(options.readContext(response), caseId))) {
          response.status(403).json({
            code: "FORBIDDEN",
            message: "Onboarding reconciliation is not permitted",
          });
          return;
        }
        response.status(202).json(await options.saga.reconcile(caseId));
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("Onboarding case not found:")
        ) {
          response.status(404).json({
            code: "ONBOARDING_CASE_NOT_FOUND",
            message: "Onboarding case not found",
          });
          return;
        }
        (next as NextFunction)(error);
      }
    },
  );
  const lifecycle = options.lifecycle;
  if (lifecycle)
    app.post(
      "/api/studio/onboarding/cases",
      options.authenticate,
      async (request, response, next) => {
        try {
          const context = options.readContext(response),
            body = object(request.body),
            caseCode = String(body["caseCode"] ?? ""),
            canonicalPartyId = String(body["canonicalPartyId"] ?? ""),
            idempotencyKey = String(
              request.header("idempotency-key") ?? body["idempotencyKey"] ?? "",
            );
          if (!caseCode || !canonicalPartyId || !idempotencyKey) {
            response.status(400).json({
              code: "ONBOARDING_DRAFT_INVALID",
              message:
                "caseCode, canonicalPartyId, and Idempotency-Key are required",
            });
            return;
          }
          const result = await lifecycle.draft({
            context,
            idempotencyKey,
            caseId:
              typeof body["caseId"] === "string"
                ? body["caseId"]
                : randomUUID(),
            caseCode,
            canonicalPartyId,
            ...(typeof body["sourceMode"] === "string"
              ? { sourceMode: body["sourceMode"] as never }
              : {}),
            ...(typeof body["activationCriticality"] === "string"
              ? {
                  activationCriticality: body["activationCriticality"] as never,
                }
              : {}),
            ...(isObject(body["requestMetadata"])
              ? { requestMetadata: body["requestMetadata"] }
              : {}),
            ...(isObject(body["requestPayload"])
              ? { requestPayload: body["requestPayload"] }
              : {}),
          });
          response.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          (next as NextFunction)(error);
        }
      },
    );
  if (lifecycle)
    app.post(
      "/api/studio/onboarding/cases/:caseId/actions/:action",
      options.authenticate,
      async (request, response, next) => {
        try {
          const caseId = String(request.params.caseId ?? "").trim(),
            action = String(request.params.action ?? "").trim();
          const context = options.readContext(response);
          if (!caseId || !(await options.authorize(context, caseId))) {
            response
              .status(caseId ? 403 : 400)
              .json({ code: caseId ? "FORBIDDEN" : "INVALID_CASE_ID" });
            return;
          }
          const body = object(request.body),
            expectedStatus = String(
              body["expectedStatus"] ?? "",
            ) as OnboardingCaseCommand["expectedStatus"],
            idempotencyKey = String(
              request.header("idempotency-key") ?? body["idempotencyKey"] ?? "",
            );
          if (!expectedStatus || !idempotencyKey) {
            response.status(400).json({
              code: "ONBOARDING_COMMAND_INVALID",
              message: "expectedStatus and Idempotency-Key are required",
            });
            return;
          }
          const command = {
            context,
            caseId,
            expectedStatus,
            idempotencyKey,
            ...(Number.isSafeInteger(body["expectedDesiredVersion"])
              ? {
                  expectedDesiredVersion: Number(
                    body["expectedDesiredVersion"],
                  ),
                }
              : {}),
            ...(typeof body["reason"] === "string"
              ? { reason: body["reason"] }
              : {}),
            ...(isObject(body["approvedRevision"])
              ? { approvedRevision: body["approvedRevision"] }
              : {}),
            ...(isObject(body["compilation"])
              ? { compilation: body["compilation"] as never }
              : {}),
          };
          const result = await executeAction(lifecycle, action, command);
          response.status(200).json(result);
        } catch (error) {
          if (
            error instanceof Error &&
            /conflict|stale|expected status/i.test(error.message)
          ) {
            response
              .status(409)
              .json({ code: "ONBOARDING_CONFLICT", message: error.message });
            return;
          }
          (next as NextFunction)(error);
        }
      },
    );
  if (options.maintenance)
    app.post(
      "/api/studio/onboarding/cases/:caseId/work-items/:workItemId/resolve",
      options.authenticate,
      async (request, response, next) => {
        try {
          const caseId = String(request.params.caseId ?? "").trim(),
            workItemId = String(request.params.workItemId ?? "").trim(),
            context = options.readContext(response);
          if (!caseId || !workItemId) {
            response.status(400).json({ code: "ONBOARDING_WORK_ITEM_INVALID" });
            return;
          }
          if (!(await options.authorize(context, caseId))) {
            response.status(403).json({ code: "FORBIDDEN" });
            return;
          }
          const resolved = await options.maintenance!.resolveWorkItem({
            context,
            caseId,
            workItemId,
          });
          response.status(resolved ? 200 : 404).json({ resolved });
        } catch (error) {
          (next as NextFunction)(error);
        }
      },
    );
}

async function executeAction(
  service: NonNullable<OnboardingRouteOptions["lifecycle"]>,
  action: string,
  command: OnboardingCaseCommand,
) {
  switch (action) {
    case "submit":
      return service.submit(command);
    case "begin-qualification":
      return service.beginQualification(command);
    case "compile":
      return service.compile(command);
    case "approve":
      return service.approve(command);
    case "reject":
      return service.reject(command);
    case "provision":
      return service.provision(command);
    case "reconcile":
      return service.reconcile(command);
    case "activate":
      return service.activate(command);
    case "correct":
      return service.correct(command);
    case "suspend":
      return service.suspend(command);
    case "offboard":
      return service.offboard(command);
    case "finish-offboarding":
      return service.finishOffboarding(command);
    case "fail":
      return service.fail(command);
    case "cancel":
      return service.cancel(command);
    default:
      throw Object.assign(new Error(`Unknown onboarding action: ${action}`), {
        code: "ONBOARDING_ACTION_UNKNOWN",
      });
  }
}
function object(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
