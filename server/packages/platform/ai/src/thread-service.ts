import { randomUUID } from "node:crypto";
import type { AtlasContentBlock, AtlasMessage, AtlasModelMessage, AtlasRetentionPolicyResolver, AtlasThread, AtlasThreadAuthorizer, AtlasThreadExport, AtlasThreadMaintenanceAuthority, AtlasThreadRepository } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { assertAtlasContext } from "./context.js";
import { AtlasServiceError } from "./errors.js";

export interface AtlasThreadServiceOptions {
  readonly repository: AtlasThreadRepository;
  readonly authorizer: AtlasThreadAuthorizer;
  readonly retention: AtlasRetentionPolicyResolver;
  readonly maintenance?: AtlasThreadMaintenanceAuthority;
  readonly maxPageSize?: number;
  readonly maxHistoryMessages: number;
  readonly maxHistoryBytes: number;
  readonly maxExportMessages: number;
  readonly now?: () => Date;
  readonly createId?: () => string;
}

export class AtlasThreadService {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly maxPageSize: number;
  constructor(private readonly options: AtlasThreadServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.maxPageSize = options.maxPageSize ?? 100;
    positive(options.maxHistoryMessages, "maxHistoryMessages"); positive(options.maxHistoryBytes, "maxHistoryBytes"); positive(options.maxExportMessages, "maxExportMessages");
  }

  async create(context: VerifiedRequestContext, title?: string | null): Promise<AtlasThread> {
    assertAtlasContext(context); await this.authorize(context, "create");
    const policy = await this.options.retention.resolve(context);
    const now = this.now();
    return this.options.repository.create({ context, threadId: this.createId(), title: normalizeTitle(title), retention: { policyId: policy.policyId, expiresAt: new Date(now.getTime() + policy.retentionDays * 86_400_000).toISOString(), purgeAfter: null, legalHold: false } });
  }
  async list(context: VerifiedRequestContext, input: { readonly status?: AtlasThread["status"] | "all"; readonly limit?: number; readonly cursor?: string } = {}) {
    assertAtlasContext(context); await this.authorize(context, "read");
    return this.options.repository.list({ context, status: input.status ?? "active", limit: boundedLimit(input.limit, this.maxPageSize), ...(input.cursor ? { cursor: input.cursor } : {}) });
  }
  async get(context: VerifiedRequestContext, threadId: string): Promise<AtlasThread> {
    const thread = await this.requireThread(context, threadId); await this.authorize(context, "read", thread); return thread;
  }
  async messages(context: VerifiedRequestContext, threadId: string, limit?: number, beforeSequence?: number) {
    const thread = await this.requireThread(context, threadId); await this.authorize(context, "read", thread);
    return this.options.repository.listMessages({ context, threadId, limit: boundedLimit(limit, this.maxPageSize), ...(beforeSequence === undefined ? {} : { beforeSequence }) });
  }
  async rename(context: VerifiedRequestContext, threadId: string, title: string, expectedRowVersion: number): Promise<AtlasThread> {
    const thread = await this.requireThread(context, threadId); await this.authorize(context, "manage", thread);
    const updated = await this.options.repository.rename({ context, threadId, title: requiredTitle(title), expectedRowVersion });
    if (!updated) throw new AtlasServiceError("VERSION_CONFLICT", "The Atlas thread changed before it could be renamed."); return updated;
  }
  async archive(context: VerifiedRequestContext, threadId: string, expectedRowVersion: number): Promise<AtlasThread> {
    const thread = await this.requireThread(context, threadId); await this.authorize(context, "manage", thread);
    const updated = await this.options.repository.archive({ context, threadId, expectedRowVersion });
    if (!updated) throw new AtlasServiceError("VERSION_CONFLICT", "The Atlas thread changed before it could be archived."); return updated;
  }
  async delete(context: VerifiedRequestContext, threadId: string, expectedRowVersion: number): Promise<void> {
    const thread = await this.requireThread(context, threadId); await this.authorize(context, "delete", thread);
    if (thread.retention.legalHold) throw new AtlasServiceError("PERMISSION_DENIED", "The Atlas thread is subject to legal hold.");
    if (!await this.options.repository.softDelete({ context, threadId, expectedRowVersion, deletedAt: this.now().toISOString() })) throw new AtlasServiceError("VERSION_CONFLICT", "The Atlas thread changed before it could be deleted.");
  }
  async putParticipant(context: VerifiedRequestContext, threadId: string, principalId: string, role: "member" | "observer", expectedRowVersion: number): Promise<AtlasThread> {
    const thread = await this.requireThread(context, threadId); await this.authorize(context, "participants", thread);
    const updated = await this.options.repository.putParticipant({ context, threadId, principalId, role, expectedRowVersion });
    if (!updated) throw new AtlasServiceError("VERSION_CONFLICT", "The Atlas thread participant set changed."); return updated;
  }
  async revokeParticipant(context: VerifiedRequestContext, threadId: string, principalId: string, expectedRowVersion: number): Promise<AtlasThread> {
    const thread = await this.requireThread(context, threadId); await this.authorize(context, "participants", thread);
    if (principalId === thread.ownerPrincipalId) throw new AtlasServiceError("PERMISSION_DENIED", "The Atlas thread owner cannot be revoked.");
    const updated = await this.options.repository.revokeParticipant({ context, threadId, principalId, expectedRowVersion });
    if (!updated) throw new AtlasServiceError("VERSION_CONFLICT", "The Atlas thread participant set changed."); return updated;
  }
  async boundedHistory(context: VerifiedRequestContext, threadId: string): Promise<readonly AtlasModelMessage[]> {
    const thread = await this.requireThread(context, threadId); await this.authorize(context, "run", thread);
    if (thread.status !== "active") throw new AtlasServiceError("THREAD_NOT_ACTIVE", "Atlas runs require an active thread.");
    const page = await this.options.repository.listMessages({ context, threadId, limit: this.options.maxHistoryMessages });
    const chronological = [...page.items].sort((a, b) => a.sequence - b.sequence).filter((message) => message.status === "completed" && (message.role === "user" || message.role === "assistant" || message.role === "tool"));
    const selected: AtlasMessage[] = []; let bytes = 0;
    for (const message of chronological.reverse()) {
      const size = contentBytes(message.content); if (selected.length > 0 && bytes + size > this.options.maxHistoryBytes) break;
      if (size > this.options.maxHistoryBytes) continue; selected.push(message); bytes += size;
    }
    return Object.freeze(selected.reverse().map((message) => Object.freeze({ role: message.role, content: message.content })));
  }
  async export(context: VerifiedRequestContext, threadId: string): Promise<AtlasThreadExport> {
    const thread = await this.requireThread(context, threadId); await this.authorize(context, "export", thread);
    const page = await this.options.repository.listMessages({ context, threadId, limit: this.options.maxExportMessages });
    if (page.nextCursor) throw new AtlasServiceError("RESULT_TOO_LARGE", "The Atlas thread exceeds the configured export limit.");
    return { schema: "atlas-thread-export/1", exportedAt: this.now().toISOString(), thread: { threadId: thread.threadId, title: thread.title, status: thread.status, createdAt: thread.createdAt, updatedAt: thread.updatedAt }, messages: page.items.map(({ messageId, sequence, role, status, content, createdAt, terminalAt }) => ({ messageId, sequence, role, status, content, createdAt, terminalAt })) };
  }
  async purge(asOf = this.now().toISOString(), batchSize = 100) { if (!this.options.maintenance) throw new AtlasServiceError("PERMISSION_DENIED", "Atlas purge authority is not configured."); return this.options.maintenance.purgeEligible({ asOf, batchSize: boundedLimit(batchSize, 1_000) }); }
  private async requireThread(context: VerifiedRequestContext, threadId: string): Promise<AtlasThread> { assertAtlasContext(context); if (!threadId.trim()) throw new AtlasServiceError("INVALID_ARGUMENT", "Atlas thread id is required."); const thread = await this.options.repository.get({ context, threadId }); if (!thread) throw new AtlasServiceError("THREAD_NOT_FOUND", "Atlas thread not found."); if (thread.tenantId !== context.tenantId || thread.planeKey !== context.planeKey) throw new AtlasServiceError("THREAD_NOT_FOUND", "Atlas thread not found."); return thread; }
  private async authorize(context: VerifiedRequestContext, operation: Parameters<AtlasThreadAuthorizer["authorize"]>[0]["operation"], thread?: AtlasThread): Promise<void> { if (!await this.options.authorizer.authorize({ context, operation, ...(thread ? { thread } : {}) })) throw new AtlasServiceError("PERMISSION_DENIED", "Atlas thread operation is not permitted."); }
}

function boundedLimit(value: number | undefined, maximum: number): number { const limit = value ?? Math.min(50, maximum); if (!Number.isInteger(limit) || limit < 1 || limit > maximum) throw new AtlasServiceError("INVALID_ARGUMENT", `Limit must be between 1 and ${maximum}.`); return limit; }
function normalizeTitle(value: string | null | undefined): string | null { return value == null ? null : requiredTitle(value); }
function requiredTitle(value: string): string { const title = value.trim(); if (!title || title.length > 200) throw new AtlasServiceError("INVALID_ARGUMENT", "Atlas thread title must be between 1 and 200 characters."); return title; }
function contentBytes(content: readonly AtlasContentBlock[]): number { return Buffer.byteLength(JSON.stringify(content), "utf8"); }
function positive(value: number, name: string): void { if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer.`); }
