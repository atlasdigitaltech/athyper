import {
  governanceHttpError,
  invalidRequest,
  timestamp,
  optionalBody,
} from "./route-validation.js";
import { parseBusinessDate } from "@athyper/platform-temporal";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type {
  ChannelConsentService,
  CycleCertificationService,
  CycleDeviationService,
  CycleRunService,
  CycleRunStatus,
  CycleTaskService,
  GovernanceChannel,
  GovernanceSubjectType,
} from "@athyper/server-contract-governance";
import {
  defineRouteContract,
  registerContractRoute,
} from "@athyper/server-runtime-http";
import type { Application, RequestHandler, Response } from "express";

export function registerCycleCompletionRoutes(application: Application, options: {authenticate:RequestHandler;readContext:(response:Response)=>VerifiedRequestContext;cycleRuns:CycleRunService;supplierOnly?:boolean}) {
  const service=options.cycleRuns;
  const path=options.supplierOnly?"/api/governance/supplier-onboarding/runs":"/api/governance/cycle-runs";
    registerContractRoute(application, contract("post", `${path}/:runId/completion`, "governance.cycleRun.complete", "Complete a ready cycle"), options.authenticate, async (request,response,next) => {
      try {
        const body=object(request.body);
        if (!Number.isSafeInteger(body["expectedVersion"]) || Number(body["expectedVersion"])<1 || typeof body["idempotencyKey"]!=="string" || !body["idempotencyKey"].trim()) {response.status(400).json({code:"GOVERNANCE_COMPLETION_COMMAND_INVALID"});return;}
        response.json(await service.transition(options.readContext(response),uuid(request.params["runId"]),"completed",{expectedVersion:Number(body["expectedVersion"]),idempotencyKey:body["idempotencyKey"]}));
      }catch(error){next(governanceHttpError(error));}
    });
    registerContractRoute(
      application,
      contract("get",`${path}/:runId/readiness`,"governance.cycleRun.readiness","Read current completion gates"),
      options.authenticate,
      async (request, response, next) => {
        try {
          response.json(
            await service.readiness(
              options.readContext(response),
              uuid(request.params["runId"]),
            ),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
}

export function registerGovernanceRoutes(
  application: Application,
  options: {
    readonly authenticate: RequestHandler;
    readonly readContext: (response: Response) => VerifiedRequestContext;
    readonly authorizer: Authorizer;
    readonly consent: ChannelConsentService;
    readonly cycleRuns?: CycleRunService;
    readonly cycleTasks?: CycleTaskService;
    readonly cycleDeviations?: CycleDeviationService;
    readonly cycleCertifications?: CycleCertificationService;
  },
): void {
  registerContractRoute(
    application,
    cycleContracts.consent,
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response);
        if (
          !(
            await options.authorizer.authorize({
              context,
              permissionCode: "governance.consent.write",
            })
          ).allowed
        ) {
          response.status(403).json({ code: "GOVERNANCE_PERMISSION_DENIED" });
          return;
        }
        const body = object(request.body),
          channel = choice(body["channel"], [
            "email",
            "sms",
            "whatsapp",
            "push",
          ] as const),
          subjectType = choice(body["subjectType"], [
            "principal",
            "person",
            "contact_person",
            "business_partner",
          ] as const);
        const decision = await options.consent.record({
          context,
          subjectType: subjectType as GovernanceSubjectType,
          subjectId: uuid(body["subjectId"]),
          channel: channel as GovernanceChannel,
          ...(text(body["destination"])
            ? { destination: text(body["destination"])! }
            : {}),
          consented: boolean(body["consented"]),
          ...(text(body["effectiveAt"])
            ? { effectiveAt: date(body["effectiveAt"]) }
            : {}),
          ...(text(body["expiresAt"])
            ? { expiresAt: date(body["expiresAt"]) }
            : {}),
          sourceCode: text(body["sourceCode"]) ?? "governance_api",
          evidence: object(
            body["evidence"] === undefined ? {} : body["evidence"],
          ),
        });
        response.status(200).json(decision);
      } catch (error) {
        next(governanceHttpError(error));
      }
    },
  );
  if (options.cycleRuns) {
    const service = options.cycleRuns;
    registerContractRoute(
      application,
      cycleContracts.runCreate,
      options.authenticate,
      async (request, response, next) => {
        try {
          const context = options.readContext(response),
            body = object(request.body);
          const result = await service.create({
            context,
            cycleTypeId: uuid(body["cycleTypeId"]),
            ...(body["templateVersion"] !== undefined
              ? { templateVersion: positiveInteger(body["templateVersion"]) }
              : {}),
            idempotencyKey:
              text(body["idempotencyKey"]) ??
              context.idempotencyKey ??
              required(body["idempotencyKey"]),
            code: required(body["code"]),
            name: required(body["name"]),
            ...(text(body["periodStart"])
              ? { periodStart: isoDate(body["periodStart"]) }
              : {}),
            ...(text(body["periodEnd"])
              ? { periodEnd: isoDate(body["periodEnd"]) }
              : {}),
            ...(text(body["scheduledStartAt"])
              ? { scheduledStartAt: date(body["scheduledStartAt"]) }
              : {}),
            ...(text(body["dueAt"]) ? { dueAt: date(body["dueAt"]) } : {}),
            ...(text(body["parentCycleRunId"])
              ? { parentCycleRunId: uuid(body["parentCycleRunId"]) }
              : {}),
            ...(text(body["ownerPrincipalId"])
              ? { ownerPrincipalId: uuid(body["ownerPrincipalId"]) }
              : {}),
            data: object(body["data"] === undefined ? {} : body["data"]),
          });
          response.status(result.kind === "created" ? 201 : 200).json(result);
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
    registerContractRoute(
      application,
      cycleContracts.runTransition,
      options.authenticate,
      async (request, response, next) => {
        try {
          const body = object(request.body),
            status = choice(body["status"], [
              "draft",
              "scheduled",
              "running",
              "blocked",
              "completed",
              "cancelled",
            ] as const);
          response.json(
            await service.transition(
              options.readContext(response),
              uuid(request.params["runId"]),
              status as CycleRunStatus,
            ),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
    registerCycleCompletionRoutes(application, {...options, cycleRuns:service});
  }
  if (options.cycleTasks) {
    const service = options.cycleTasks;
    registerContractRoute(
      application,
      cycleContracts.taskClaim,
      options.authenticate,
      async (request, response, next) => {
        try {
          const body = object(request.body ?? {});
          response.json(
            await service.claim(
              options.readContext(response),
              uuid(request.params["taskId"]),
              text(body["ownerPrincipalId"])
                ? uuid(body["ownerPrincipalId"])
                : undefined,
            ),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
    registerContractRoute(
      application,
      cycleContracts.taskStart,
      options.authenticate,
      async (request, response, next) => {
        try {
          response.json(
            await service.start(
              options.readContext(response),
              uuid(request.params["taskId"]),
            ),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
    for (const [contract, action] of [
      [cycleContracts.taskComplete, "complete"],
      [cycleContracts.taskBlock, "block"],
      [cycleContracts.taskWaive, "waive"],
    ] as const)
      registerContractRoute(
        application,
        contract,
        options.authenticate,
        async (request, response, next) => {
          try {
            response.json(
              await service[action](
                options.readContext(response),
                uuid(request.params["taskId"]),
                object(object(request.body)["evidence"]),
              ),
            );
          } catch (error) {
            next(governanceHttpError(error));
          }
        },
      );
    registerContractRoute(
      application,
      cycleContracts.taskReopen,
      options.authenticate,
      async (request, response, next) => {
        try {
          response.json(
            await service.reopen(
              options.readContext(response),
              uuid(request.params["taskId"]),
              required(object(request.body)["reason"]),
            ),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
  }
  if (options.cycleDeviations) {
    const service = options.cycleDeviations;
    registerContractRoute(
      application,
      cycleContracts.deviationCreate,
      options.authenticate,
      async (request, response, next) => {
        try {
          const body = object(request.body);
          response.status(201).json(
            await service.create(options.readContext(response), {
              runId: uuid(request.params["runId"]),
              ...(text(body["taskId"]) ? { taskId: uuid(body["taskId"]) } : {}),
              type: choice(body["type"], [
                "exception",
                "override",
                "waiver",
              ] as const),
              description: required(body["description"]),
              severity: choice(body["severity"], [
                "low",
                "medium",
                "high",
                "critical",
              ] as const),
            }),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
    registerContractRoute(
      application,
      cycleContracts.deviationResolve,
      options.authenticate,
      async (request, response, next) => {
        try {
          response.json(
            await service.resolve(
              options.readContext(response),
              uuid(request.params["deviationId"]),
              required(object(request.body)["resolution"]),
            ),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
    registerContractRoute(
      application,
      cycleContracts.deviationWaive,
      options.authenticate,
      async (request, response, next) => {
        try {
          response.json(
            await service.waive(
              options.readContext(response),
              uuid(request.params["deviationId"]),
              required(object(request.body)["reason"]),
            ),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
    registerContractRoute(
      application,
      cycleContracts.deviationCarry,
      options.authenticate,
      async (request, response, next) => {
        try {
          const context = options.readContext(response),
            body = object(request.body);
          response.json(
            await service.carryForward(
              context,
              uuid(request.params["deviationId"]),
              uuid(body["targetRunId"]),
              text(body["idempotencyKey"]) ??
                context.idempotencyKey ??
                required(body["idempotencyKey"]),
            ),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
  }
  if (options.cycleCertifications) {
    const service = options.cycleCertifications;
    registerContractRoute(
      application,
      cycleContracts.certificationCreate,
      options.authenticate,
      async (request, response, next) => {
        try {
          const body = object(request.body);
          response.status(201).json(
            await service.create(options.readContext(response), {
              runId: uuid(request.params["runId"]),
              certificationTypeCode: required(body["certificationTypeCode"]),
              statement: required(body["statement"]),
            }),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
    registerContractRoute(
      application,
      cycleContracts.certificationSubmit,
      options.authenticate,
      async (request, response, next) => {
        try {
          const body = object(request.body);
          response.json(
            await service.submit(
              options.readContext(response),
              uuid(request.params["certificationId"]),
              uuid(body["evidenceSnapshotId"]),
              object(body["evidenceSnapshot"]),
            ),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
    registerContractRoute(
      application,
      cycleContracts.certificationCertify,
      options.authenticate,
      async (request, response, next) => {
        try {
          response.json(
            await service.certify(
              options.readContext(response),
              uuid(request.params["certificationId"]),
              required(object(request.body)["signature"]),
            ),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
    registerContractRoute(
      application,
      cycleContracts.certificationReject,
      options.authenticate,
      async (request, response, next) => {
        try {
          response.json(
            await service.reject(
              options.readContext(response),
              uuid(request.params["certificationId"]),
              required(object(request.body)["reason"]),
            ),
          );
        } catch (error) {
          next(governanceHttpError(error));
        }
      },
    );
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalidRequest("JSON object required");
  return value as Record<string, unknown>;
}
function text(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim())
    throw invalidRequest("Nonempty string required");
  return value.trim();
}
function uuid(value: unknown): string {
  const result = text(value);
  if (
    !result ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw invalidRequest("UUID required");
  return result;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean")
    throw invalidRequest("consented must be boolean");
  return value;
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  const result = text(value);
  if (!result || !allowed.includes(result as T))
    throw invalidRequest(`Expected one of: ${allowed.join(", ")}`);
  return result as T;
}
function date(value: unknown): string {
  return timestamp(value);
}
function isoDate(value: unknown): string {
  const result = text(value);
  if (
    !result ||
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    Number.isNaN(parseBusinessDate(result))
  )
    throw invalidRequest("ISO date required");
  return result;
}
function required(value: unknown): string {
  const result = text(value);
  if (!result) throw invalidRequest("Required string missing");
  return result;
}
function positiveInteger(value: unknown): number {
  const result = value;
  if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 1)
    throw invalidRequest("Positive integer required");
  return result;
}
const schema = { type: "object", additionalProperties: true } as const;
const responses = {
  200: { description: "Governance result", body: schema },
  201: { description: "Created", body: schema },
  404: { description: "Not found" },
  503: { description: "Governance unavailable" },
  400: { description: "Invalid request" },
  401: { description: "Authentication required" },
  403: { description: "Forbidden" },
  409: { description: "Version or idempotency conflict" },
} as const;
const cycleContracts = {
  consent: defineRouteContract({
    method: "post",
    path: "/api/governance/channel-consents",
    operationId: "governance.channelConsent.record",
    summary: "Record channel consent",
    tags: ["Governance"],
    authenticated: true,
    permission: "governance.consent.write",
    request: { body: schema },
    responses,
  }),
  runCreate: contract(
    "post",
    "/api/governance/cycle-runs",
    "governance.cycleRun.create",
    "Create a cycle run",
  ),
  runTransition: contract(
    "post",
    "/api/governance/cycle-runs/:runId/transitions",
    "governance.cycleRun.transition",
    "Transition a cycle run",
  ),
  runReadiness: contract(
    "get",
    "/api/governance/cycle-runs/:runId/readiness",
    "governance.cycleRun.readiness",
    "Read cycle readiness",
  ),
  taskClaim: contract(
    "post",
    "/api/governance/cycle-tasks/:taskId/claim",
    "governance.cycleTask.claim",
    "Claim a cycle task",
  ),
  taskStart: contract(
    "post",
    "/api/governance/cycle-tasks/:taskId/start",
    "governance.cycleTask.start",
    "Start a cycle task",
  ),
  taskComplete: contract(
    "post",
    "/api/governance/cycle-tasks/:taskId/complete",
    "governance.cycleTask.complete",
    "Complete a cycle task",
  ),
  taskBlock: contract(
    "post",
    "/api/governance/cycle-tasks/:taskId/block",
    "governance.cycleTask.block",
    "Block a cycle task",
  ),
  taskWaive: contract(
    "post",
    "/api/governance/cycle-tasks/:taskId/waive",
    "governance.cycleTask.waive",
    "Waive a cycle task",
  ),
  taskReopen: contract(
    "post",
    "/api/governance/cycle-tasks/:taskId/reopen",
    "governance.cycleTask.reopen",
    "Reopen a cycle task",
  ),
  deviationCreate: contract(
    "post",
    "/api/governance/cycle-runs/:runId/deviations",
    "governance.cycleDeviation.create",
    "Create a cycle deviation",
  ),
  deviationResolve: contract(
    "post",
    "/api/governance/cycle-deviations/:deviationId/resolve",
    "governance.cycleDeviation.resolve",
    "Resolve a cycle deviation",
  ),
  deviationWaive: contract(
    "post",
    "/api/governance/cycle-deviations/:deviationId/waive",
    "governance.cycleDeviation.waive",
    "Waive a cycle deviation",
  ),
  deviationCarry: contract(
    "post",
    "/api/governance/cycle-deviations/:deviationId/carry-forward",
    "governance.cycleDeviation.carryForward",
    "Carry a cycle deviation forward",
  ),
  certificationCreate: contract(
    "post",
    "/api/governance/cycle-runs/:runId/certifications",
    "governance.cycleCertification.create",
    "Create a cycle certification",
  ),
  certificationSubmit: contract(
    "post",
    "/api/governance/cycle-certifications/:certificationId/submit",
    "governance.cycleCertification.submit",
    "Submit a cycle certification",
  ),
  certificationCertify: contract(
    "post",
    "/api/governance/cycle-certifications/:certificationId/certify",
    "governance.cycleCertification.certify",
    "Certify a cycle outcome",
  ),
  certificationReject: contract(
    "post",
    "/api/governance/cycle-certifications/:certificationId/reject",
    "governance.cycleCertification.reject",
    "Reject a cycle certification",
  ),
} as const;
function contract(
  method: "get" | "post",
  path: string,
  operationId: string,
  summary: string,
) {
  const permission =
    operationId.includes("Certification.certify") ||
    operationId.includes("Certification.reject")
      ? "governance.cycle.certify"
      : operationId.includes("Deviation.resolve") ||
          operationId.includes("Deviation.waive") ||
          operationId.includes("Deviation.carryForward") ||
          operationId.includes("Certification.")
        ? "governance.cycle.review"
        : "governance.cycle.execute";
  return defineRouteContract({
    method,
    path,
    operationId,
    summary,
    tags: ["Governance"],
    authenticated: true,
    permission,
    ...(method === "post"
      ? {
          request: {
            body:
              operationId.endsWith(".claim") || operationId.endsWith(".start")
                ? optionalBody
                : schema,
          },
        }
      : {}),
    responses,
  });
}
