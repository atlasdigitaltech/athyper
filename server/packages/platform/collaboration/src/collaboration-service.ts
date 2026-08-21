import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { CollaborationFanout, CollaborationRepository, CollaborationService, CommentRecord, CreateCommentCommand, PrincipalDirectory } from "@athyper/server-contract-collaboration";
import type { OutboxWriter } from "@athyper/server-contract-events";
import type { ModerationService } from "@athyper/server-contract-governance";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { CollaborationError } from "./errors.js";
import { projectRichText } from "./rich-text.js";

const PERMISSION = { create: "collaboration.comment.create", edit: "collaboration.comment.edit", remove: "collaboration.comment.delete", react: "collaboration.comment.react", draft: "collaboration.draft.write", read: "collaboration.comment.read", flag: "collaboration.comment.flag" } as const;

export interface CollaborationServiceOptions<Transaction> {
  readonly authorizer: Authorizer;
  readonly principals: PrincipalDirectory;
  readonly repository: CollaborationRepository<Transaction>;
  readonly transactions: PlaneTransactionCoordinator<Transaction>;
  readonly outbox: OutboxWriter<Transaction>;
  readonly audit: AuditRecorder<Transaction>;
  readonly fanout?: CollaborationFanout;
  readonly moderation?: ModerationService<Transaction>;
}

export function createCollaborationService<Transaction>(options: CollaborationServiceOptions<Transaction>): CollaborationService {
  return {
    async create(command) {
      await requirePermission(options.authorizer, command.context, PERMISSION.create);
      const prepared = prepare(command);
      validateCoordinate(prepared); validateBody(prepared.text); validateAttachments(prepared.attachmentIds);
      const result = await transact(options, prepared.context, async (tx) => {
        const mentions = await resolveMentions(options.principals, prepared, tx);
        const comment = await options.repository.create(prepared, mentions, tx);
        await emit(options, prepared.context, comment, "created", tx, prepared.idempotencyKey, mentions);
        return comment;
      });
      fanout(options, prepared.context, "collaboration.comment.created", result);
      return result;
    },
    async edit(command) {
      await requirePermission(options.authorizer, command.context, PERMISSION.edit); const prepared = prepare(command); validateBody(prepared.text); validateAttachments(prepared.attachmentIds);
      const result = await transact(options, prepared.context, async (tx) => {
        const mentions = await resolveMentions(options.principals, prepared, tx);
        const comment = await options.repository.edit(prepared, mentions, tx);
        if (!comment) throw new CollaborationError(409, "COMMENT_EDIT_CONFLICT", "Comment was not found, is moderated, or has changed");
        await emit(options, prepared.context, comment, "edited", tx, undefined, mentions);
        return comment;
      });
      fanout(options, prepared.context, "collaboration.comment.edited", result);
      return result;
    },
    async remove(input) {
      await requirePermission(options.authorizer, input.context, PERMISSION.remove);
      return transact(options, input.context, async (tx) => {
        const removed = await options.repository.softDelete(input.context.tenantId, input.commentId, input.context.principalId, tx);
        if (removed) await simpleEvent(options, input.context, input.commentId, "collaboration.comment.deleted", tx);
        return removed;
      });
    },
    async putReaction(input) { validateCode(input.code); await requirePermission(options.authorizer, input.context, PERMISSION.react); return transact(options, input.context, async (tx) => { const inserted = await options.repository.putReaction(input.context.tenantId, input.commentId, input.context.principalId, input.code, tx); if (inserted) await simpleEvent(options, input.context, input.commentId, "collaboration.reaction.added", tx, { code: input.code }); return inserted; }); },
    async deleteReaction(input) { validateCode(input.code); await requirePermission(options.authorizer, input.context, PERMISSION.react); return transact(options, input.context, (tx) => options.repository.deleteReaction(input.context.tenantId, input.commentId, input.context.principalId, input.code, tx)); },
    async putDraft(input) { await requirePermission(options.authorizer, input.context, PERMISSION.draft); const prepared = prepare(input); validateCoordinate(prepared); validateBody(prepared.text); validateAttachments(prepared.attachmentIds); await transact(options, prepared.context, (tx) => options.repository.putDraft(prepared, tx)); },
    async deleteDraft(input) { await requirePermission(options.authorizer, input.context, PERMISSION.draft); validateCoordinate(input); return transact(options, input.context, (tx) => options.repository.deleteDraft(input.context.tenantId, input.context.principalId, input, input.parentCommentId, tx)); },
    async markRead(input) { await requirePermission(options.authorizer, input.context, PERMISSION.read); validateCoordinate(input); await transact(options, input.context, (tx) => options.repository.markRead(input.context.tenantId, input.context.principalId, input, input.readAt ?? new Date().toISOString(), tx)); },
    async flag(input) { await requirePermission(options.authorizer, input.context, PERMISSION.flag); validateCode(input.reasonCode); return transact(options, input.context, async (tx) => { const id = await options.repository.createFlag(input.context.tenantId, input.commentId, input.context.principalId, input.reasonCode, input.detail, tx); await options.moderation?.open({ context:input.context,commentFlagId:id,reviewerEvidence:{source:"collaboration.comment.flag",reasonCode:input.reasonCode,...(input.detail?{detail:input.detail}:{})} }, tx); await simpleEvent(options, input.context, input.commentId, "collaboration.comment.flagged", tx, { flagId: id, reasonCode: input.reasonCode }); return id; }); },
  };
}

async function emit<Transaction>(options: CollaborationServiceOptions<Transaction>, context: VerifiedRequestContext, comment: CommentRecord, action: "created" | "edited", tx: Transaction, idempotencyKey?: string, mentions: readonly string[] = []): Promise<void> {
  await simpleEvent(options, context, comment.id, `collaboration.comment.${action}`, tx, { entityType: comment.entityType, entityId: comment.entityId }, idempotencyKey);
  for (const principalId of mentions.filter((id) => id !== context.principalId)) await options.outbox.append({ tenantId: context.tenantId, topic: "collaboration", eventType: "collaboration.comment.mentioned", eventKey: `${comment.id}:${principalId}:${action}`, entityType: comment.entityType, entityId: comment.entityId, aggregateType: "document.comment", aggregateId: comment.id, actorId: context.principalId, payload: { commentId: comment.id, recipientPrincipalId: principalId, action } }, tx);
}
async function simpleEvent<Transaction>(options: CollaborationServiceOptions<Transaction>, context: VerifiedRequestContext, commentId: string, eventType: string, tx: Transaction, payload: Readonly<Record<string, unknown>> = {}, eventKey?: string): Promise<void> { await options.outbox.append({ tenantId: context.tenantId, topic: "collaboration", eventType, ...(eventKey ? { eventKey } : {}), aggregateType: "document.comment", aggregateId: commentId, actorId: context.principalId, payload: { commentId, ...payload } }, tx); await options.audit.record({ eventCode: eventType, action: eventType.split(".").at(-1) ?? "change", outcome: "success", actor: { kind: "user", principalId: context.principalId }, tenantId: context.tenantId, entityType: "document.comment", entityId: commentId, requestId: context.requestId, ...(context.correlationId ? { correlationId: context.correlationId } : {}) }, tx); }
async function resolveMentions(principals: PrincipalDirectory, command: { context: VerifiedRequestContext; mentionedPrincipalIds?: readonly string[] }, tx: unknown): Promise<readonly string[]> { const ids = [...new Set(command.mentionedPrincipalIds ?? [])]; if (ids.some((id) => !uuid(id))) throw new CollaborationError(400, "INVALID_MENTION", "Mention principals must be UUIDs"); const resolved = await principals.resolveActivePrincipals(command.context, ids, tx); if (resolved.length !== ids.length) throw new CollaborationError(422, "MENTION_PRINCIPAL_NOT_FOUND", "Every mention must resolve in the plane-local principal directory"); return resolved; }
async function requirePermission(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string): Promise<void> { if (!(await authorizer.authorize({ context, permissionCode })).allowed) throw new CollaborationError(403, "FORBIDDEN", `Missing permission: ${permissionCode}`); }
function transact<T, R>(options: CollaborationServiceOptions<T>, context: VerifiedRequestContext, work: (tx: T) => Promise<R>): Promise<R> { return options.transactions.run(context.planeKey, { tenantId: context.tenantId, principalId: context.principalId }, work); }
function validateCoordinate(value: { entityType: string; entityId: string }): void { if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/.test(value.entityType) || !value.entityId.trim() || value.entityId.length > 512) throw new CollaborationError(400, "INVALID_RESOURCE_COORDINATE", "Invalid collaboration resource coordinate"); }
function validateBody(text: string): void { if (!text.trim() || text.length > 50_000) throw new CollaborationError(400, "INVALID_COMMENT_TEXT", "Comment text must contain 1-50000 characters"); }
function validateAttachments(ids?: readonly string[]): void { if ((ids?.length ?? 0) > 10 || ids?.some((id) => !uuid(id))) throw new CollaborationError(400, "INVALID_ATTACHMENTS", "At most 10 attachment UUIDs are allowed"); }
function validateCode(value: string): void { if (!/^[a-z][a-z0-9_]{1,62}$/.test(value)) throw new CollaborationError(400, "INVALID_CODE", "Invalid collaboration code"); }
function uuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function fanout<T>(options: CollaborationServiceOptions<T>, context: VerifiedRequestContext, eventType: string, comment: CommentRecord): void { void options.fanout?.publish({ tenantId: context.tenantId, principalId: context.principalId, eventType, data: { commentId: comment.id, entityType: comment.entityType, entityId: comment.entityId } }).catch(() => undefined); }

function prepare<T extends CreateCommentCommand | import("@athyper/server-contract-collaboration").EditCommentCommand>(command: T): T {
  if ((command.format ?? "plain") === "plain") {
    if (command.content !== undefined) throw new CollaborationError(400, "INVALID_COMMENT_CONTENT", "Plain comments cannot include rich-text JSON");
    return { ...command, text: command.text.trim(), format: "plain", content: undefined, html: undefined } as T;
  }
  if (command.format !== "rich_json" || !command.content) throw new CollaborationError(400, "INVALID_RICH_TEXT", "rich_json content is required");
  const projected = projectRichText(command.content);
  return { ...command, text: projected.text, format: "rich_json", content: projected.document, html: projected.html, contentSchema: projected.contentSchema, mentionedPrincipalIds: projected.mentionIds, attachmentIds: [...new Set([...(command.attachmentIds ?? []), ...projected.attachmentIds])] } as T;
}
