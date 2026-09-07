import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  Application,
  NextFunction,
  RequestHandler,
  Response,
} from "express";
import { createHash } from "node:crypto";
import {
  validateCompilation,
  type OnboardingCaseCommand,
  type OnboardingCaseLifecycleService,
} from "./case-lifecycle.js";
import type { OnboardingMaintenanceService } from "./maintenance.js";
import {
  choice,
  criticalities,
  object,
  OnboardingValidationError,
  statuses,
  text,
  uuid,
  version,
} from "./validation.js";

export interface OnboardingRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly authorize: (
    context: VerifiedRequestContext,
    caseId: string,
  ) => Promise<boolean>;
  readonly saga: {
    reconcile(caseId: string, tenantId: string): Promise<unknown>;
  };
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
  const guarded =
    (handler: RequestHandler): RequestHandler =>
    async (request, response, next) => {
      try {
        await handler(request, response, next);
      } catch (error) {
        handleError(error, response, next);
      }
    };
  const authorize = async (
    context: VerifiedRequestContext,
    caseId: string,
    response: Response,
  ) => {
    if (await options.authorize(context, caseId)) return true;
    response.status(403).json({ code: "FORBIDDEN" });
    return false;
  };
  app.post(
    "/api/studio/onboarding/cases/:caseId/reconcile",
    options.authenticate,
    guarded(async (request, response) => {
      const caseId = uuid(request.params.caseId, "caseId"),
        context = options.readContext(response);
      if (!(await authorize(context, caseId, response))) return;
      response
        .status(202)
        .json(await options.saga.reconcile(caseId, context.tenantId));
    }),
  );
  const lifecycle = options.lifecycle;
  if (lifecycle) {
    app.post(
      "/api/studio/onboarding/cases",
      options.authenticate,
      guarded(async (request, response) => {
        const context = options.readContext(response),
          body = object(request.body);
        const caseCode = text(body["caseCode"], "caseCode").toLowerCase();
        const canonicalPartyId = uuid(
          body["canonicalPartyId"],
          "canonicalPartyId",
        );
        const idempotencyKey = text(
          request.header("idempotency-key") ?? body["idempotencyKey"],
          "Idempotency-Key",
        );
        const caseId =
          body["caseId"] === undefined
            ? draftId(context.tenantId, caseCode, idempotencyKey)
            : uuid(body["caseId"], "caseId");
        if (!(await authorize(context, caseId, response))) return;
        const result = await lifecycle.draft({
          context,
          caseId,
          caseCode,
          canonicalPartyId,
          idempotencyKey,
          ...(body["sourceMode"] !== undefined
            ? {
                sourceMode: choice(
                  body["sourceMode"],
                  [
                    "self_service",
                    "buyer_invited",
                    "ops_governed",
                    "system_triggered",
                  ] as const,
                  "sourceMode",
                ),
              }
            : {}),
          ...(body["activationCriticality"] !== undefined
            ? {
                activationCriticality: choice(
                  body["activationCriticality"],
                  criticalities,
                  "activationCriticality",
                ),
              }
            : {}),
          ...(body["requestMetadata"] !== undefined
            ? {
                requestMetadata: object(
                  body["requestMetadata"],
                  "requestMetadata",
                ),
              }
            : {}),
          ...(body["requestPayload"] !== undefined
            ? {
                requestPayload: object(
                  body["requestPayload"],
                  "requestPayload",
                ),
              }
            : {}),
        });
        response.status(result.replayed ? 200 : 201).json(result);
      }),
    );
    app.post(
      "/api/studio/onboarding/cases/:caseId/actions/:action",
      options.authenticate,
      guarded(async (request, response) => {
        const caseId = uuid(request.params.caseId, "caseId"),
          context = options.readContext(response);
        if (!(await authorize(context, caseId, response))) return;
        const body = object(request.body);
        const command: OnboardingCaseCommand = {
          context,
          caseId,
          expectedStatus: choice(
            body["expectedStatus"],
            statuses,
            "expectedStatus",
          ),
          idempotencyKey: text(
            request.header("idempotency-key") ?? body["idempotencyKey"],
            "Idempotency-Key",
          ),
          ...(body["expectedDesiredVersion"] !== undefined
            ? {
                expectedDesiredVersion: version(body["expectedDesiredVersion"]),
              }
            : {}),
          ...(body["reason"] !== undefined
            ? { reason: text(body["reason"], "reason") }
            : {}),
          ...(body["approvedRevision"] !== undefined
            ? {
                approvedRevision: object(
                  body["approvedRevision"],
                  "approvedRevision",
                ),
              }
            : {}),
          ...(body["compilation"] !== undefined
            ? { compilation: compilation(body["compilation"]) }
            : {}),
        };
        response
          .status(200)
          .json(
            await executeAction(
              lifecycle,
              text(request.params.action, "action"),
              command,
            ),
          );
      }),
    );
  }
  const maintenance = options.maintenance;
  if (maintenance)
    app.post(
      "/api/studio/onboarding/cases/:caseId/work-items/:workItemId/resolve",
      options.authenticate,
      guarded(async (request, response) => {
        const caseId = uuid(request.params.caseId, "caseId"),
          workItemId = uuid(request.params.workItemId, "workItemId"),
          context = options.readContext(response);
        if (!(await authorize(context, caseId, response))) return;
        const resolved = await maintenance.resolveWorkItem({
          context,
          caseId,
          workItemId,
        });
        response.status(resolved ? 200 : 404).json({ resolved });
      }),
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

function compilation(
  value: unknown,
): NonNullable<OnboardingCaseCommand["compilation"]> {
  validateCompilation(
    value as NonNullable<OnboardingCaseCommand["compilation"]>,
  );
  return value as NonNullable<OnboardingCaseCommand["compilation"]>;
}

// Stable UUID coordinates keep retries without a client-supplied caseId replayable.
function draftId(tenantId: string, caseCode: string, key: string): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(["onboarding-draft", tenantId, caseCode, key]))
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function handleError(
  error: unknown,
  response: Response,
  next: NextFunction,
): void {
  const code =
    error instanceof Error
      ? ((error as Error & { code?: string }).code ?? error.message)
      : "";
  if (error instanceof OnboardingValidationError) {
    response
      .status(400)
      .json({ code: "ONBOARDING_COMMAND_INVALID", message: error.message });
  } else if (code === "ONBOARDING_ACTION_UNKNOWN") {
    response.status(404).json({ code });
  } else if (code === "ONBOARDING_WORK_ITEM_FORBIDDEN") {
    response.status(403).json({ code });
  } else if (
    code === "ONBOARDING_CASE_NOT_FOUND" ||
    code.startsWith("Onboarding case not found:")
  ) {
    response.status(404).json({ code: "ONBOARDING_CASE_NOT_FOUND" });
  } else if (
    /^ONBOARDING_[A-Z_]*CONFLICT$/.test(code) ||
    code === "ONBOARDING_CANONICAL_REVISION_REQUIRED"
  ) {
    response.status(409).json({ code });
  } else {
    next(error);
  }
}
