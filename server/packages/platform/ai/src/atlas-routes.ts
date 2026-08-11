import type {
  AtlasDataClass,
  AtlasPlaneAdmissionResolver,
  AtlasPublicModelId,
  AtlasSseEnvelope,
} from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { Application, NextFunction, Request, RequestHandler, Response } from "express";
import { AtlasAgentRuntime } from "./agent-runtime.js";
import { AtlasServiceError } from "./errors.js";
import { serializeAtlasSse } from "./stream.js";
import { AtlasThreadService } from "./thread-service.js";
import { AtlasToolService } from "./tool-service.js";

export interface AtlasRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly admission: AtlasPlaneAdmissionResolver;
  readonly threads: AtlasThreadService;
  readonly runtime: AtlasAgentRuntime;
  readonly tools?: AtlasToolService;
}

export function registerAtlasRoutes(app: Application, options: AtlasRouteOptions): void {
  const route = (
    work: (request: Request, context: VerifiedRequestContext) => Promise<{ status?: number; body?: unknown }>,
  ): RequestHandler => async (request, response, next) => {
    try {
      const result = await work(request, options.readContext(response));
      if (result.status === 204) {
        response.status(204).end();
        return;
      }
      response.status(result.status ?? 200).json(result.body);
    } catch (error) {
      handleAtlasError(error, response, next);
    }
  };

  app.get("/api/atlas/admission", options.authenticate, route(async (_request, context) => ({
    body: await options.admission.resolve(context),
  })));
  app.post("/api/atlas/threads", options.authenticate, route(async (request, context) => ({
    status: 201,
    body: await options.threads.create(context, optionalText(readBody(request).title)),
  })));
  app.get("/api/atlas/threads", options.authenticate, route(async (request, context) => ({
    body: await options.threads.list(context, {
      status: optionalText(request.query.status) as "active" | "archived" | "all" | undefined,
      limit: optionalInteger(request.query.limit),
      cursor: optionalText(request.query.cursor),
    }),
  })));
  app.get("/api/atlas/threads/:id", options.authenticate, route(async (request, context) => ({
    body: await options.threads.get(context, readUuid(request.params.id)),
  })));
  app.get("/api/atlas/threads/:id/messages", options.authenticate, route(async (request, context) => ({
    body: await options.threads.messages(
      context,
      readUuid(request.params.id),
      optionalInteger(request.query.limit),
      optionalInteger(request.query.beforeSequence),
    ),
  })));
  app.patch("/api/atlas/threads/:id", options.authenticate, route(async (request, context) => {
    const body = readBody(request);
    return {
      body: await options.threads.rename(
        context,
        readUuid(request.params.id),
        requiredText(body, "title"),
        readInteger(body.expectedRowVersion),
      ),
    };
  }));
  app.post("/api/atlas/threads/:id/archive", options.authenticate, route(async (request, context) => ({
    body: await options.threads.archive(
      context,
      readUuid(request.params.id),
      readInteger(readBody(request).expectedRowVersion),
    ),
  })));
  app.delete("/api/atlas/threads/:id", options.authenticate, route(async (request, context) => {
    await options.threads.delete(
      context,
      readUuid(request.params.id),
      readInteger(readBody(request).expectedRowVersion),
    );
    return { status: 204 };
  }));
  app.get("/api/atlas/threads/:id/export", options.authenticate, route(async (request, context) => ({
    body: await options.threads.export(context, readUuid(request.params.id)),
  })));
  app.put("/api/atlas/threads/:id/participants/:principalId", options.authenticate, route(async (request, context) => {
    const body = readBody(request);
    return {
      body: await options.threads.putParticipant(
        context,
        readUuid(request.params.id),
        readUuid(request.params.principalId),
        readEnum(body.role, ["member", "observer"] as const),
        readInteger(body.expectedRowVersion),
      ),
    };
  }));
  app.delete("/api/atlas/threads/:id/participants/:principalId", options.authenticate, route(async (request, context) => ({
    body: await options.threads.revokeParticipant(
      context,
      readUuid(request.params.id),
      readUuid(request.params.principalId),
      readInteger(readBody(request).expectedRowVersion),
    ),
  })));
  app.post("/api/atlas/threads/:id/runs", options.authenticate, async (request, response, next) => {
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    request.once("close", abort);
    try {
      const context = options.readContext(response);
      const body = readBody(request);
      await writeAtlasSse(response, options.runtime.run({
        context,
        threadId: readUuid(request.params.id),
        clientRequestId: requiredText(body, "clientRequestId"),
        publicModelId: requiredText(body, "publicModelId") as AtlasPublicModelId,
        dataClass: requiredText(body, "dataClass") as AtlasDataClass,
        userText: requiredText(body, "userText"),
        catalogPolicyRevision: requiredText(body, "catalogPolicyRevision"),
        signal: controller.signal,
      }));
    } catch (error) {
      if (!response.headersSent) handleAtlasError(error, response, next);
      else response.end();
    } finally {
      request.off("close", abort);
    }
  });

  if (options.tools) {
    app.post("/api/atlas/tools/preview", options.authenticate, route(async (request, context) => {
      const body = readBody(request);
      return {
        body: await options.tools!.preview({
          context,
          threadId: requiredText(body, "threadId"),
          runId: requiredText(body, "runId"),
          callId: requiredText(body, "callId"),
          toolCode: requiredText(body, "toolCode"),
          toolVersion: requiredText(body, "toolVersion"),
          arguments: readObject(body.arguments),
          summary: requiredText(body, "summary"),
          affectedEntityType: optionalText(body.affectedEntityType),
          affectedEntityId: optionalText(body.affectedEntityId),
          expectedRowVersion: optionalInteger(body.expectedRowVersion),
        }),
      };
    }));
    app.post("/api/atlas/tools/:proposalId/cancel", options.authenticate, route(async (request, context) => ({
      body: await options.tools!.cancel({ context, proposalId: readUuid(request.params.proposalId), reason: optionalText(readBody(request).reason) }),
    })));
    app.post("/api/atlas/tools/:proposalId/run", options.authenticate, route(async (request, context) => {
      const body = readBody(request);
      return {
        body: await options.tools!.run({
          context,
          proposalId: readUuid(request.params.proposalId),
          arguments: readObject(body.arguments),
          confirmationToken: optionalText(body.confirmationToken),
        }),
      };
    }));
  }
}

export async function writeAtlasSse(
  response: Pick<Response, "status" | "setHeader" | "write" | "end">,
  events: AsyncIterable<AtlasSseEnvelope>,
): Promise<void> {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  for await (const event of events) response.write(serializeAtlasSse(event));
  response.end();
}

function handleAtlasError(error: unknown, response: Response, next: NextFunction): void {
  if (!(error instanceof AtlasServiceError)) {
    next(error);
    return;
  }
  const status = error.code === "THREAD_NOT_FOUND" ? 404
    : error.code === "VERSION_CONFLICT" || error.code === "IDEMPOTENCY_CONFLICT" || error.code === "STALE_PROPOSAL" || error.code === "TOOL_IN_PROGRESS" || error.code === "TOOL_CANCELLED" ? 409
      : error.code === "RESULT_TOO_LARGE" ? 413
        : error.code === "ADMISSION_DENIED" || error.code === "PERMISSION_DENIED" || error.code === "TOOL_DENIED" ? 403
          : error.code === "CREDENTIAL_UNAVAILABLE" || error.code === "PROVIDER_UNAVAILABLE" ? 503
            : 400;
  response.status(status).type("application/problem+json").json({
    type: `https://athyper.dev/problems/${error.code.toLowerCase()}`,
    title: error.code,
    status,
    detail: error.message,
    code: error.code,
  });
}

function readBody(request: Request): Record<string, unknown> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
    throw new AtlasServiceError("INVALID_ARGUMENT", "JSON object required.");
  }
  return request.body as Record<string, unknown>;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredText(value: Record<string, unknown>, key: string): string {
  const result = optionalText(value[key]);
  if (!result) throw new AtlasServiceError("INVALID_ARGUMENT", `${key} is required.`);
  return result;
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AtlasServiceError("INVALID_ARGUMENT", "JSON object required.");
  }
  return value as Record<string, unknown>;
}

function readInteger(value: unknown): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new AtlasServiceError("INVALID_ARGUMENT", "Non-negative integer required.");
  }
  return result;
}

function optionalInteger(value: unknown): number | undefined {
  return value === undefined ? undefined : readInteger(value);
}

function readUuid(value: unknown): string {
  const result = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new AtlasServiceError("INVALID_ARGUMENT", "UUID required.");
  }
  return result;
}

function readEnum<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new AtlasServiceError("INVALID_ARGUMENT", `Expected one of: ${values.join(", ")}.`);
  }
  return value as T;
}
