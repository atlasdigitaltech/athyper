import type { Request, Response, Router } from "express";
import { z } from "zod";
import { EffectivePermissionContextMismatchError } from "@athyper/svc-iam";
import {
  AtlasThreadServiceError,
  type AtlasThreadService,
} from "../conversation/atlas-thread.service.js";
import type {
  AtlasMessageRecord,
  AtlasThreadRecord,
} from "../conversation/atlas-thread.types.js";
import type { AiLogger } from "../ai-runtime.types.js";
import {
  resolveAgentPlaneAdmission,
  resolveAgentRequestContext,
  type AiAgentRequestContextDeps,
  type AiAgentPlaneAdmissionDeps,
} from "./ai-agent.route.js";

const PERSISTENCE_FLAG = "atlas_conversation_persistence_enabled";
const POSITIVE_BIGINT_RE = /^[1-9][0-9]{0,18}$/;

const ThreadIdParamsSchema = z.object({
  threadId: z.string().uuid(),
}).strict();
const CreateThreadSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
}).strict();
const ListThreadsSchema = z.object({
  status: z.enum(["active", "archived", "all"]).optional().default("active"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  cursor: z.string().min(1).max(2_048).optional(),
}).strict();
const ListMessagesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  cursor: z.string().min(1).max(2_048).optional(),
}).strict();
const RenameThreadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  row_version: z.string().regex(POSITIVE_BIGINT_RE),
}).strict();
const ArchiveThreadSchema = z.object({
  status: z.literal("archived"),
  row_version: z.string().regex(POSITIVE_BIGINT_RE),
}).strict();
const MutateThreadSchema = z.union([
  RenameThreadSchema,
  ArchiveThreadSchema,
]);

export interface AiThreadRouteDeps
  extends AiAgentRequestContextDeps, AiAgentPlaneAdmissionDeps {
  threadService: AtlasThreadService;
  persistenceEnvEnabled: boolean;
  logger: AiLogger;
}

export function registerAiThreadRoutes(
  router: Router,
  deps: AiThreadRouteDeps,
): Router {
  router.post("/ai/agent/threads", (req, res) => {
    void createThread(req, res, deps);
  });
  router.get("/ai/agent/threads", (req, res) => {
    void listThreads(req, res, deps);
  });
  router.get("/ai/agent/threads/:threadId", (req, res) => {
    void getThread(req, res, deps);
  });
  router.get("/ai/agent/threads/:threadId/messages", (req, res) => {
    void listMessages(req, res, deps);
  });
  router.get("/ai/agent/threads/:threadId/export", (req, res) => {
    void exportTranscript(req, res, deps);
  });
  router.patch("/ai/agent/threads/:threadId", (req, res) => {
    void mutateThread(req, res, deps);
  });
  router.delete("/ai/agent/threads/:threadId", (req, res) => {
    void deleteThread(req, res, deps);
  });
  return router;
}

async function createThread(
  req: Request,
  res: Response,
  deps: AiThreadRouteDeps,
): Promise<void> {
  await handleThreadRoute(res, deps, "create", async () => {
    const parsed = CreateThreadSchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalidRequest(res, parsed.error.issues);
    const context = await resolvePersistenceContext(req, res, deps);
    if (!context) return;
    const thread = await deps.threadService.createThread(context, parsed.data);
    setPrivateHeaders(res);
    setThreadEtag(res, thread);
    res.status(201).json({ thread: toWireThread(thread) });
  });
}

async function listThreads(
  req: Request,
  res: Response,
  deps: AiThreadRouteDeps,
): Promise<void> {
  await handleThreadRoute(res, deps, "list", async () => {
    const parsed = ListThreadsSchema.safeParse(req.query);
    if (!parsed.success) return invalidRequest(res, parsed.error.issues);
    const cursor = parsed.data.cursor
      ? decodeThreadCursor(parsed.data.cursor)
      : null;
    const context = await resolvePersistenceContext(req, res, deps);
    if (!context) return;
    const [page, retention] = await Promise.all([
      deps.threadService.listThreads(context, {
        status: parsed.data.status,
        limit: parsed.data.limit,
        cursor,
      }),
      deps.threadService.getEffectiveRetentionPolicy(context),
    ]);
    setPrivateHeaders(res);
    res.status(200).json({
      items: page.items.map(toWireThread),
      next_cursor: page.nextCursor ? encodeThreadCursor(page.nextCursor) : null,
      retention_notice: retention.displayText,
      retention_policy: {
        policy_id: retention.policyId,
        retention_days: retention.retentionDays,
      },
    });
  });
}

async function getThread(
  req: Request,
  res: Response,
  deps: AiThreadRouteDeps,
): Promise<void> {
  await handleThreadRoute(res, deps, "get", async () => {
    const params = ThreadIdParamsSchema.safeParse(req.params);
    if (!params.success) return invalidRequest(res, params.error.issues);
    const context = await resolvePersistenceContext(req, res, deps);
    if (!context) return;
    const thread = await deps.threadService.getThread(
      context,
      params.data.threadId,
    );
    setPrivateHeaders(res);
    setThreadEtag(res, thread);
    res.status(200).json({ thread: toWireThread(thread) });
  });
}

async function listMessages(
  req: Request,
  res: Response,
  deps: AiThreadRouteDeps,
): Promise<void> {
  await handleThreadRoute(res, deps, "list_messages", async () => {
    const params = ThreadIdParamsSchema.safeParse(req.params);
    const query = ListMessagesSchema.safeParse(req.query);
    if (!params.success) return invalidRequest(res, params.error.issues);
    if (!query.success) return invalidRequest(res, query.error.issues);
    const cursor = query.data.cursor
      ? decodeMessageCursor(query.data.cursor)
      : null;
    const context = await resolvePersistenceContext(req, res, deps);
    if (!context) return;
    const page = await deps.threadService.listMessages(context, {
      threadId: params.data.threadId,
      limit: query.data.limit,
      cursor,
    });
    setPrivateHeaders(res);
    res.status(200).json({
      items: page.items.map(toWireMessage),
      next_cursor: page.nextCursor ? encodeMessageCursor(page.nextCursor) : null,
    });
  });
}

async function exportTranscript(
  req: Request,
  res: Response,
  deps: AiThreadRouteDeps,
): Promise<void> {
  await handleThreadRoute(res, deps, "export", async () => {
    const params = ThreadIdParamsSchema.safeParse(req.params);
    if (!params.success) return invalidRequest(res, params.error.issues);
    const context = await resolvePersistenceContext(req, res, deps);
    if (!context) return;
    const transcript = await deps.threadService.exportTranscript(
      context,
      params.data.threadId,
    );
    setPrivateHeaders(res);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="atlas-thread-${params.data.threadId}.json"`,
    );
    deps.logger.info("atlas_thread_transcript_exported", {
      tenantId: context.tenantId,
      principalId: context.principalId,
      threadId: transcript.thread.threadId,
      messageCount: transcript.messages.length,
    });
    res.status(200).json(toWireTranscript(transcript));
  });
}

async function mutateThread(
  req: Request,
  res: Response,
  deps: AiThreadRouteDeps,
): Promise<void> {
  await handleThreadRoute(res, deps, "mutate", async () => {
    const params = ThreadIdParamsSchema.safeParse(req.params);
    const body = MutateThreadSchema.safeParse(req.body);
    if (!params.success) return invalidRequest(res, params.error.issues);
    if (!body.success) return invalidRequest(res, body.error.issues);
    const context = await resolvePersistenceContext(req, res, deps);
    if (!context) return;
    const thread = "title" in body.data
      ? await deps.threadService.renameThread(context, {
          threadId: params.data.threadId,
          expectedRowVersion: body.data.row_version,
          title: body.data.title,
        })
      : await deps.threadService.archiveThread(context, {
          threadId: params.data.threadId,
          expectedRowVersion: body.data.row_version,
        });
    setPrivateHeaders(res);
    setThreadEtag(res, thread);
    res.status(200).json({ thread: toWireThread(thread) });
  });
}

async function deleteThread(
  req: Request,
  res: Response,
  deps: AiThreadRouteDeps,
): Promise<void> {
  await handleThreadRoute(res, deps, "delete", async () => {
    const params = ThreadIdParamsSchema.safeParse(req.params);
    if (!params.success) return invalidRequest(res, params.error.issues);
    const expectedRowVersion = parseIfMatch(req.headers["if-match"]);
    if (!expectedRowVersion) {
      res.status(428).json({
        error: "precondition_required",
        message: 'DELETE requires If-Match: "<row_version>".',
      });
      return;
    }
    const context = await resolvePersistenceContext(req, res, deps);
    if (!context) return;
    await deps.threadService.deleteThread(context, {
      threadId: params.data.threadId,
      expectedRowVersion,
    });
    setPrivateHeaders(res);
    res.status(204).end();
  });
}

async function resolvePersistenceContext(
  req: Request,
  res: Response,
  deps: AiThreadRouteDeps,
) {
  if (!deps.envEnabled || !deps.persistenceEnvEnabled) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  const context = await resolveAgentRequestContext(req, res, deps);
  if (!context) return null;
  const admission = await resolveAgentPlaneAdmission(context, res, deps);
  if (!admission?.persistenceAllowed) {
    if (admission) res.status(404).json({ error: "not_found" });
    return null;
  }
  if (!await deps.featureFlags.isEnabled(PERSISTENCE_FLAG, context.tenantId)) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  return context;
}

async function handleThreadRoute(
  res: Response,
  deps: AiThreadRouteDeps,
  operation: string,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
    deps.metrics?.recordAgentThreadOperation?.({
      operation: metricOperation(operation),
      outcome: metricOutcome(res.statusCode),
    });
  } catch (error) {
    if (res.headersSent) return;
    if (error instanceof AtlasThreadServiceError) {
      deps.metrics?.recordAgentThreadOperation?.({
        operation: metricOperation(operation),
        outcome: metricOutcome(error.status),
      });
      res.status(error.status).json({
        error: toWireError(error.code),
        message: error.message,
      });
      return;
    }
    if (error instanceof EffectivePermissionContextMismatchError) {
      deps.metrics?.recordAgentThreadOperation?.({
        operation: metricOperation(operation),
        outcome: "denied",
      });
      res.status(error.status).json({
        error: error.code,
        message: error.message,
      });
      return;
    }
    deps.logger.error("atlas_thread_route_error", {
      operation,
      errorType: safeErrorType(error),
    });
    deps.metrics?.recordAgentThreadOperation?.({
      operation: metricOperation(operation),
      outcome: "error",
    });
    res.status(500).json({ error: "internal_error" });
  }
}

function metricOperation(
  operation: string,
): import("../ai-runtime.types.js").AgentThreadOperation {
  return operation === "create"
      || operation === "list"
      || operation === "get"
      || operation === "list_messages"
      || operation === "delete"
      || operation === "export"
    ? operation
    : "rename_archive";
}

function metricOutcome(
  status: number,
): "success" | "denied" | "conflict" | "error" {
  if (status >= 200 && status < 400) return "success";
  if (status === 401 || status === 403 || status === 404) return "denied";
  if (status === 409 || status === 423 || status === 428) return "conflict";
  return "error";
}

function toWireThread(thread: AtlasThreadRecord) {
  const updatedAt = thread.updatedAt ?? thread.createdAt;
  return {
    thread_id: thread.threadId,
    plane: thread.plane,
    title: thread.title ?? "Untitled conversation",
    status: thread.status,
    message_count: thread.lastMessageSequence,
    row_version: thread.rowVersion,
    retention: {
      policy_id: thread.retention.policyId,
      expires_at: toIsoOrNull(thread.retention.expiresAt),
      purge_after: toIsoOrNull(thread.retention.purgeAfter),
      legal_hold: thread.retention.legalHold,
      display_text: retentionDisplayText(thread),
    },
    created_at: thread.createdAt.toISOString(),
    updated_at: updatedAt.toISOString(),
  };
}

function toWireMessage(message: AtlasMessageRecord) {
  return {
    message_id: message.messageId,
    thread_id: message.threadId,
    sequence: message.sequence,
    role: message.role,
    content: message.contentBlocks
      .filter(
        (block) =>
          block.type === "text" && typeof block["text"] === "string",
      )
      .map((block) => block["text"] as string)
      .join("\n"),
    result_cards: message.resultCards,
    status: message.status === "completed" ? "complete" : message.status,
    run_id: message.runId,
    parent_message_id: message.parentMessageId,
    created_at: message.createdAt.toISOString(),
    terminal_at: toIsoOrNull(message.terminalAt),
  };
}

function toWireTranscript(transcript: Awaited<ReturnType<AtlasThreadService["exportTranscript"]>>) {
  return {
    format: transcript.format,
    exported_at: transcript.exportedAt.toISOString(),
    thread: toWireThread(transcript.thread),
    messages: transcript.messages.map((message) => ({
      message_id: message.messageId,
      sequence: message.sequence,
      role: message.role,
      status: message.status === "completed" ? "complete" : message.status,
      content_blocks: message.contentBlocks,
      created_at: message.createdAt.toISOString(),
      terminal_at: toIsoOrNull(message.terminalAt),
    })),
  };
}

function retentionDisplayText(thread: AtlasThreadRecord): string {
  if (thread.retention.legalHold) {
    return "This conversation is retained under legal hold.";
  }
  if (thread.retention.expiresAt) {
    return `This conversation is retained until ${
      thread.retention.expiresAt.toISOString()
    } under ${thread.retention.policyId}.`;
  }
  return `This conversation follows retention policy ${thread.retention.policyId}.`;
}

function encodeThreadCursor(cursor: {
  activityAt: Date;
  threadId: string;
}): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    activity_at: cursor.activityAt.toISOString(),
    thread_id: cursor.threadId,
  }), "utf8").toString("base64url");
}

function decodeThreadCursor(value: string): {
  activityAt: Date;
  threadId: string;
} {
  const decoded = decodeCursor(value);
  const parsed = z.object({
    v: z.literal(1),
    activity_at: z.string().datetime({ offset: true }),
    thread_id: z.string().uuid(),
  }).strict().safeParse(decoded);
  if (!parsed.success) throw invalidCursor();
  return {
    activityAt: new Date(parsed.data.activity_at),
    threadId: parsed.data.thread_id,
  };
}

function encodeMessageCursor(cursor: { beforeSequence: string }): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    before_sequence: cursor.beforeSequence,
  }), "utf8").toString("base64url");
}

function decodeMessageCursor(value: string): { beforeSequence: string } {
  const decoded = decodeCursor(value);
  const parsed = z.object({
    v: z.literal(1),
    before_sequence: z.string().regex(POSITIVE_BIGINT_RE),
  }).strict().safeParse(decoded);
  if (!parsed.success) throw invalidCursor();
  return { beforeSequence: parsed.data.before_sequence };
}

function decodeCursor(value: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidCursor();
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.byteLength(decoded, "utf8") > 1_024) throw invalidCursor();
    return JSON.parse(decoded);
  } catch (error) {
    if (error instanceof AtlasThreadServiceError) throw error;
    throw invalidCursor();
  }
}

function invalidCursor(): AtlasThreadServiceError {
  return new AtlasThreadServiceError(
    "INVALID_ARGUMENT",
    400,
    "The Atlas pagination cursor is invalid.",
  );
}

function parseIfMatch(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const matched = /^"([1-9][0-9]{0,18})"$/.exec(value.trim());
  return matched?.[1] ?? null;
}

function setPrivateHeaders(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization, X-Tenant-Id, X-Plane-Key");
}

function setThreadEtag(res: Response, thread: AtlasThreadRecord): void {
  res.setHeader("ETag", `"${thread.rowVersion}"`);
}

function invalidRequest(
  res: Response,
  issues: readonly unknown[],
): void {
  res.status(400).json({ error: "invalid_request", issues });
}

function toIsoOrNull(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function toWireError(code: string): string {
  return code.toLowerCase();
}

function safeErrorType(error: unknown): string {
  if (
    error instanceof Error
    && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(error.name)
  ) {
    return error.name;
  }
  return "UnknownError";
}
