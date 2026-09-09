import type { AuditRecorder } from "@athyper/server-contract-audit";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { JobPublisher } from "@athyper/server-contract-jobs";
import {
  defineRouteContract,
  registerContractRoute,
  type Application,
  type RequestHandler,
  type Response,
} from "@athyper/server-runtime-http";
import {
  COMPILE_PUBLICATION_ARTIFACT_JOB,
  PUBLICATION_AUTHORITY_QUEUE,
} from "./publication-jobs.js";
import {
  BankDirectoryError,
  type BankDirectoryService,
} from "./bank-directory-service.js";
const bodySchema = { type: "object", additionalProperties: true } as const;
export function registerBankDirectoryRoutes(
  application: Application,
  options: {
    authenticate: RequestHandler;
    readContext: (response: Response) => VerifiedRequestContext;
    authorizer: Authorizer;
    audit: AuditRecorder;
    jobs: JobPublisher;
    service: BankDirectoryService;
  },
) {
  for (const operation of [
    "list",
    "import",
    "review",
    "resume",
    "reconcile",
    "get",
    "references",
  ] as const) {
    const method =
      operation === "list" || operation === "reconcile" || operation === "get"
        ? "get"
        : "post";
    const permission = `studio.bank_directory.${operation === "import" ? "author" : operation === "review" || operation === "resume" ? "publish" : "read"}`;
    registerContractRoute(
      application,
      defineRouteContract({
        method,
        path: `/api/studio/bank-directory${operation === "list" ? "" : operation === "get" ? "/:revisionId" : operation === "review" || operation === "resume" ? `/:revisionId/${operation}` : `/${operation}`}`,
        operationId: `studio.bankDirectory.${operation}`,
        summary: `Bank directory ${operation}`,
        tags: ["STUDIO Bank Directory"],
        authenticated: true,
        permission,
        ...(method === "post" ? { request: { body: bodySchema } } : {}),
        responses: {
          200: { description: "Directory result", body: bodySchema },
          201: { description: "Validated revision", body: bodySchema },
          202: { description: "Publication queued", body: bodySchema },
          400: { description: "Invalid input" },
          403: { description: "Forbidden" },
          409: { description: "Conflict" },
        },
      }),
      options.authenticate,
      async (request, response, next) => {
        try {
          const context = options.readContext(response);
          if (context.planeKey !== "studio") {
            response.status(403).json({ error: "STUDIO_AUTHORITY_REQUIRED" });
            return;
          }
          const revisionId =
            operation === "review" ||
            operation === "resume" ||
            operation === "get"
              ? uuid(request.params["revisionId"])
              : undefined;
          const allowed = await options.authorizer.authorize({
            context,
            permissionCode: permission,
            ...(revisionId ? { resource: { revisionId } } : {}),
          });
          if (!allowed.allowed) {
            response
              .status(403)
              .json({ error: "FORBIDDEN", reason: allowed.reason });
            return;
          }
          const actor = {
            tenantId: context.tenantId,
            actorId: context.principalId,
          };
          if (operation === "get") {
            const revision = await options.service.get(
              actor.tenantId,
              revisionId!,
            );
            response
              .status(revision ? 200 : 404)
              .json(revision ?? { error: "BANK_DIRECTORY_REVISION_NOT_FOUND" });
            return;
          }
          if (operation === "list") {
            response.json(
              await options.service.list(actor.tenantId, actor.actorId),
            );
            return;
          }
          if (operation === "reconcile") {
            response.json(
              await options.service.reconcile(actor.tenantId, actor.actorId),
            );
            return;
          }
          const body = request.body as Record<string, unknown> | undefined;
          if (operation === "references") {
            const refs = body?.["references"];
            if (!Array.isArray(refs) || refs.length > 1000)
              throw new TypeError("Supply up to 1000 directory references");
            const references = refs.map((r) => {
              if (!r || typeof r !== "object")
                throw new TypeError("Invalid reference");
              return {
                releaseId: uuid(r.releaseId),
                institutionId: uuid(r.institutionId),
                ...(r.branchId ? { branchId: uuid(r.branchId) } : {}),
              };
            });
            response.json(
              await options.service.reconcileReferences(
                actor.tenantId,
                actor.actorId,
                references,
              ),
            );
            return;
          }

          let result: unknown, entityId: string;
          if (operation === "import") {
            const key = request.headers["idempotency-key"];
            if (typeof key !== "string" || !key.trim())
              throw new TypeError("Idempotency-Key is required");
            const revision = await options.service.import({
              ...actor,
              idempotencyKey: key,
              source: body,
            });
            result = revision;
            entityId = String(revision["id"]);
          } else {
            if (
              operation !== "resume" &&
              (!body ||
                (body["decision"] !== "approved" &&
                  body["decision"] !== "rejected") ||
                typeof body["reason"] !== "string" ||
                !body["reason"].trim() ||
                body["reason"].length > 2000)
            )
              throw new TypeError("Decision and review reason are required");
            const reviewed =
              operation === "resume"
                ? await options.service.resume(
                    actor.tenantId,
                    actor.actorId,
                    revisionId!,
                  )
                : await options.service.review({
                    ...actor,
                    revisionId: revisionId!,
                    decision: body!["decision"] as "approved" | "rejected",
                    reason: (body!["reason"] as string).trim(),
                  });
            const release = reviewed.release;
            const jobId = release
              ? await options.jobs.enqueue(
                  PUBLICATION_AUTHORITY_QUEUE,
                  COMPILE_PUBLICATION_ARTIFACT_JOB,
                  { releaseId: release.id },
                  {
                    enqueueKey: `publication:${release.id}:compile:${operation === "resume" ? resumeKey(request.headers["idempotency-key"]) : "1"}`,
                    maxAttempts: 5,
                    payloadSchema: {
                      name: COMPILE_PUBLICATION_ARTIFACT_JOB,
                      version: 1,
                    },
                    execution: {
                      planeKey: "studio",
                      scope: "tenant",
                      tenantId: context.tenantId,
                      principalId: context.principalId,
                      correlationId: context.correlationId ?? context.requestId,
                    },
                  },
                )
              : undefined;
            result = { ...reviewed, jobId };
            entityId = revisionId!;
          }
          await options.audit.record({
            eventCode: `studio.bank_directory.${operation}`,
            action: operation,
            outcome: "success",
            severity: "critical",
            actor: { kind: "user", principalId: context.principalId },
            tenantId: context.tenantId,
            entityType: "bank_directory_revision",
            entityId,
            requestId: context.requestId,
            correlationId: context.correlationId,
            metadata: {},
          });
          response.status(operation === "import" ? 201 : 202).json(result);
        } catch (error) {
          if (error instanceof BankDirectoryError)
            response
              .status(
                error.code.includes("AUTHORITY") ||
                  error.code.includes("FORBIDDEN")
                  ? 403
                  : error.code.includes("NOT_FOUND")
                    ? 404
                    : 409,
              )
              .json({ error: error.code });
          else if (error instanceof TypeError)
            response.status(400).json({
              error: "BANK_DIRECTORY_INPUT_INVALID",
              message: error.message,
            });
          else next(error);
        }
      },
    );
  }
}
function uuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new TypeError("Invalid revision ID");
  return value;
}

function resumeKey(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw new TypeError("Idempotency-Key is required");
  return `resume:${value}`;
}
