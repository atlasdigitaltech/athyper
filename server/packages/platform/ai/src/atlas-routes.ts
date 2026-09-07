import type {
  AtlasDataClass,
  AtlasPlaneAdmissionResolver,
  AtlasPublicModelId,
  AtlasRunRepository,
  AtlasSseEnvelope,
} from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { Application, NextFunction, Request, RequestHandler, Response } from "express";
import { defineRouteContract, registerContractRoute, type HttpMethod, type RouteContract } from "@athyper/server-runtime-http";
import { atlasRequests } from "./atlas-route-schemas.js";
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
  readonly runtime?: AtlasAgentRuntime;
  readonly tools?: AtlasToolService;
  readonly runs?: AtlasRunRepository;
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

  registerContractRoute(app, contract("get", "/api/atlas/admission", "atlas.getAdmission"), options.authenticate, route(async (_request, context) => ({
    body: await options.admission.resolve(context),
  })));
  registerContractRoute(app, contract("post", "/api/atlas/threads", "atlas.createThread", 201, true), options.authenticate, route(async (request, context) => ({
    status: 201,
    body: await options.threads.create(context, optionalText(readBody(request).title)),
  })));
  registerContractRoute(app, contract("get", "/api/atlas/threads", "atlas.listThreads"), options.authenticate, route(async (request, context) => ({
    body: await options.threads.list(context, {
      status: request.query.status === undefined ? undefined : readEnum(request.query.status, ["active", "archived", "all"] as const),
      limit: optionalInteger(request.query.limit),
      cursor: optionalText(request.query.cursor),
    }),
  })));
  registerContractRoute(app, contract("get", "/api/atlas/threads/:id", "atlas.getThread"), options.authenticate, route(async (request, context) => ({
    body: await options.threads.get(context, readUuid(request.params.id)),
  })));
  registerContractRoute(app, contract("get", "/api/atlas/threads/:id/messages", "atlas.listThreadMessages"), options.authenticate, route(async (request, context) => ({
    body: await options.threads.messages(
      context,
      readUuid(request.params.id),
      optionalInteger(request.query.limit),
      optionalInteger(request.query.beforeSequence),
    ),
  })));
  registerContractRoute(app, contract("patch", "/api/atlas/threads/:id", "atlas.renameThread", 200, true), options.authenticate, route(async (request, context) => {
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
  registerContractRoute(app, contract("post", "/api/atlas/threads/:id/archive", "atlas.archiveThread", 200, true), options.authenticate, route(async (request, context) => ({
    body: await options.threads.archive(
      context,
      readUuid(request.params.id),
      readInteger(readBody(request).expectedRowVersion),
    ),
  })));
  registerContractRoute(app, contract("delete", "/api/atlas/threads/:id", "atlas.deleteThread", 204, true, "none"), options.authenticate, route(async (request, context) => {
    await options.threads.delete(
      context,
      readUuid(request.params.id),
      readInteger(readBody(request).expectedRowVersion),
    );
    return { status: 204 };
  }));
  registerContractRoute(app, contract("get", "/api/atlas/threads/:id/export", "atlas.exportThread"), options.authenticate, route(async (request, context) => ({
    body: await options.threads.export(context, readUuid(request.params.id)),
  })));
  registerContractRoute(app, contract("put", "/api/atlas/threads/:id/participants/:principalId", "atlas.putThreadParticipant", 200, true), options.authenticate, route(async (request, context) => {
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
  registerContractRoute(app, contract("delete", "/api/atlas/threads/:id/participants/:principalId", "atlas.revokeThreadParticipant", 200, true), options.authenticate, route(async (request, context) => ({
    body: await options.threads.revokeParticipant(
      context,
      readUuid(request.params.id),
      readUuid(request.params.principalId),
      readInteger(readBody(request).expectedRowVersion),
    ),
  })));
  registerContractRoute(app, contract("post", "/api/atlas/threads/:id/runs", "atlas.runThread", 200, true, "sse"), options.authenticate, async (request, response, next) => {
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    request.once("aborted", abort);
    response.once("close", abort);
    try {
      const context = options.readContext(response);
      const body = readBody(request);
      if (!options.runtime) throw new AtlasServiceError("PROVIDER_UNAVAILABLE", "Atlas answer generation has no configured provider.");
      await writeAtlasSse(response, options.runtime.run({
        context,
        threadId: readUuid(request.params.id),
        clientRequestId: requiredText(body, "clientRequestId"),
        publicModelId: requiredText(body, "publicModelId") as AtlasPublicModelId,
        dataClass: requiredText(body, "dataClass") as AtlasDataClass,
        userText: requiredText(body, "userText"),
        catalogPolicyRevision: requiredText(body, "catalogPolicyRevision"),
        ...(optionalText(body.agentCode) ? { agentCode: optionalText(body.agentCode)! } : {}),
        ...(optionalText(body.attachmentContextId) ? { attachmentContextId: readUuid(body.attachmentContextId) } : {}),
        ...(body.attachmentIds !== undefined ? { attachmentIds: readUuidList(body.attachmentIds, 5) } : {}),
        signal: controller.signal,
      }), controller.signal);
    } catch (error) {
      if (!response.headersSent) handleAtlasError(error, response, next);
      else response.end();
    } finally {
      request.off("aborted", abort);
      response.off("close", abort);
    }
  });

  if (options.tools) {
    registerContractRoute(app, contract("get", "/api/atlas/tools/history", "atlas.listToolHistory"), options.authenticate, route(async (request, context) => ({
      body: await options.tools!.history({ context, limit: optionalInteger(request.query.limit) }),
    })));
    registerContractRoute(app, contract("post", "/api/atlas/tools/preview", "atlas.previewTool", 200, true), options.authenticate, route(async (request, context) => {
      const body = readBody(request);
      const threadId = readUuid(body.threadId);
      const runId = readUuid(body.runId);
      const thread = await options.threads.get(context, threadId);
      const run = await options.runs?.get({ context, runId });
      if (!run || run.tenantId !== context.tenantId || run.planeKey !== context.planeKey
        || run.principalId !== context.principalId || run.threadId !== threadId) {
        throw new AtlasServiceError("TOOL_DENIED", "Atlas tool preview requires a run owned by the caller in the requested thread.");
      }
      if (thread.status !== "active") throw new AtlasServiceError("THREAD_NOT_ACTIVE", "Atlas tool previews require an active thread.");
      return {
        body: await options.tools!.preview({
          context,
          threadId,
          runId,
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
    registerContractRoute(app, contract("post", "/api/atlas/tools/:proposalId/cancel", "atlas.cancelTool", 200, true), options.authenticate, route(async (request, context) => ({
      body: await options.tools!.cancel({ context, proposalId: readUuid(request.params.proposalId), reason: optionalText(readBody(request).reason) }),
    })));
    registerContractRoute(app, contract("post", "/api/atlas/tools/:proposalId/run", "atlas.runTool", 200, true), options.authenticate, route(async (request, context) => {
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

const objectSchema = { type: "object", additionalProperties: true } as const;
function contract(method:HttpMethod,path:string,operationId:string,successStatus=200,requestBody=false,responseKind:"json"|"none"|"sse"="json"):RouteContract {
  const success = responseKind === "none" ? { description: "Operation completed" } : responseKind === "sse" ? { description: "Atlas event stream", body: { type: "string" } as const, contentType: "text/event-stream" } : { description: "Atlas result", body: objectSchema };
  return defineRouteContract({ method, path, operationId, summary: operationId, tags: ["Atlas"], authenticated: true, permission: "neon.ai.agent.use", ...(atlasRequests[operationId] ? { request: atlasRequests[operationId] } : requestBody ? { request: { body: objectSchema } } : {}), responses: { [successStatus]: success, 400: { description: "Invalid request", body: objectSchema }, 403: { description: "Forbidden", body: objectSchema }, 404: { description: "Resource not found", body: objectSchema }, 409: { description: "State conflict", body: objectSchema }, 413: { description: "Result too large", body: objectSchema }, 429: { description: "Quota exceeded", body: objectSchema }, 503: { description: "Provider unavailable", body: objectSchema } } });
}

type AtlasStreamResponse = Pick<Response, "status" | "setHeader" | "write" | "end" | "once" | "off">;

export async function writeAtlasSse(
  response: AtlasStreamResponse,
  events: AsyncIterable<AtlasSseEnvelope>,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
  };
  // Resolve preflight failures before selecting the event-stream response type.
  for await (const event of events) {
    if (signal?.aborted) return;
    start();
    if (response.write(serializeAtlasSse(event)) === false && !await waitForDrain(response, signal)) return;
  }
  if (!signal?.aborted) { start(); response.end(); }
}

function waitForDrain(response: AtlasStreamResponse, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const finish = (ready: boolean) => {
      response.off("drain", drained);
      response.off("close", closed);
      signal?.removeEventListener("abort", closed);
      resolve(ready);
    };
    const drained = () => finish(true);
    const closed = () => finish(false);
    response.once("drain", drained);
    response.once("close", closed);
    signal?.addEventListener("abort", closed, { once: true });
  });
}

export function handleAtlasError(error: unknown, response: Response, next: NextFunction): void {
  if (!(error instanceof AtlasServiceError)) {
    next(error);
    return;
  }
  const status = error.code === "THREAD_NOT_FOUND" ? 404
    : error.code === "THREAD_NOT_ACTIVE" || error.code === "VERSION_CONFLICT" || error.code === "IDEMPOTENCY_CONFLICT" || error.code === "STALE_PROPOSAL" || error.code === "TOOL_IN_PROGRESS" || error.code === "TOOL_CANCELLED" || error.code === "ATTACHMENT_NOT_READY" ? 409
      : error.code === "QUOTA_EXCEEDED" ? 429
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
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new AtlasServiceError("INVALID_ARGUMENT", "Non-empty string required.");
  return value.trim();
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

function readUuidList(value: unknown, maximum: number): readonly string[] {
  if (!Array.isArray(value) || !value.length || value.length > maximum) throw new AtlasServiceError("INVALID_ARGUMENT", "attachmentIds is invalid.");
  return Object.freeze(value.map(readUuid));
}

function readInteger(value: unknown): number {
  if (typeof value !== "number" && !(typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value))) {
    throw new AtlasServiceError("INVALID_ARGUMENT", "Non-negative integer required.");
  }
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
