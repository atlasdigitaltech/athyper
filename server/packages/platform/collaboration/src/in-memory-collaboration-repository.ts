import type { CollaborationRepository, CommentRecord, CreateCommentCommand, EditCommentCommand, ResourceCoordinate } from "@athyper/server-contract-collaboration";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

interface State { comments: Map<string, CommentRecord>; mentions: Map<string, readonly string[]>; reactions: Set<string>; drafts: Map<string, CreateCommentCommand>; cursors: Map<string, string>; flags: Map<string, Readonly<Record<string, unknown>>>; }

export function createInMemoryCollaborationPersistence(options: { createId?: () => string; now?: () => Date } = {}): { repository: CollaborationRepository<State>; transactions: PlaneTransactionCoordinator<State>; inspect(): State } {
  const createId = options.createId ?? (() => crypto.randomUUID()); const now = options.now ?? (() => new Date());
  let state = empty();
  const repository: CollaborationRepository<State> = {
    async create(command, mentionIds, tx) {
      let depth = 0;
      if (command.parentCommentId) { const parent = tx.comments.get(command.parentCommentId); if (!parent || parent.tenantId !== command.context.tenantId || parent.entityType !== command.entityType || parent.entityId !== command.entityId || parent.status === "deleted") throw new Error("COMMENT_PARENT_NOT_FOUND"); depth = parent.threadDepth + 1; if (depth > 5) throw new Error("COMMENT_THREAD_DEPTH_EXCEEDED"); }
      const timestamp = now().toISOString(); const id = createId();
      const comment: CommentRecord = { id, tenantId: command.context.tenantId, contextType: command.contextType ?? "entity", entityType: command.entityType, entityId: command.entityId, authorId: command.context.principalId, text: command.text.trim(), format: command.format ?? "plain", ...(command.content ? { content: command.content } : {}), ...("contentSchema" in command && typeof command.contentSchema === "string" ? { contentSchema: command.contentSchema } : {}), ...(command.html ? { html: command.html } : {}), ...(command.parentCommentId ? { parentCommentId: command.parentCommentId } : {}), threadDepth: depth, visibility: command.visibility ?? "public", intent: command.intent ?? "general", status: "open", createdAt: timestamp };
      tx.comments.set(id, comment); tx.mentions.set(id, mentionIds); return comment;
    },
    async edit(command, mentionIds, tx) { const current = tx.comments.get(command.commentId); if (!current || current.tenantId !== command.context.tenantId || current.authorId !== command.context.principalId || current.status === "deleted" || (command.expectedUpdatedAt && current.updatedAt !== command.expectedUpdatedAt)) return null; const updated = { ...current, text: command.text.trim(), format: command.format ?? current.format, ...(command.content ? { content: command.content } : {}), ...(command.contentSchema ? { contentSchema: command.contentSchema } : {}), ...(command.html ? { html: command.html } : {}), updatedAt: now().toISOString() }; tx.comments.set(current.id, updated); tx.mentions.set(current.id, mentionIds); return updated; },
    async softDelete(tenantId, id, principalId, tx) { const item = tx.comments.get(id); if (!item || item.tenantId !== tenantId || item.authorId !== principalId || item.status === "deleted") return false; tx.comments.set(id, { ...item, status: "deleted", updatedAt: now().toISOString() }); return true; },
    async putReaction(tenantId, commentId, principalId, code, tx) { const key = `${tenantId}:${commentId}:${principalId}:${code}`; const before = tx.reactions.size; tx.reactions.add(key); return tx.reactions.size !== before; },
    async deleteReaction(tenantId, commentId, principalId, code, tx) { return tx.reactions.delete(`${tenantId}:${commentId}:${principalId}:${code}`); },
    async putDraft(command, tx) { tx.drafts.set(draftKey(command.context.tenantId, command.context.principalId, command, command.parentCommentId), command); },
    async deleteDraft(tenantId, principalId, coordinate, parentId, tx) { return tx.drafts.delete(draftKey(tenantId, principalId, coordinate, parentId)); },
    async markRead(tenantId, principalId, coordinate, readAt, tx) { tx.cursors.set(`${tenantId}:${principalId}:${coordinate.entityType}:${coordinate.entityId}`, readAt); },
    async createFlag(tenantId, commentId, principalId, reasonCode, detail, tx) { const id = createId(); tx.flags.set(id, { tenantId, commentId, principalId, reasonCode, ...(detail ? { detail } : {}) }); return id; },
  };
  const transactions: PlaneTransactionCoordinator<State> = { async run(_plane, _actor, work) { const tx = clone(state); const result = await work(tx); state = tx; return result; } };
  return { repository, transactions, inspect: () => state };
}
function empty(): State { return { comments: new Map(), mentions: new Map(), reactions: new Set(), drafts: new Map(), cursors: new Map(), flags: new Map() }; }
function clone(value: State): State { return { comments: new Map(value.comments), mentions: new Map(value.mentions), reactions: new Set(value.reactions), drafts: new Map(value.drafts), cursors: new Map(value.cursors), flags: new Map(value.flags) }; }
function draftKey(tenantId: string, principalId: string, value: ResourceCoordinate, parentId?: string): string { return `${tenantId}:${principalId}:${value.contextType ?? "entity"}:${value.entityType}:${value.entityId}:${parentId ?? "root"}`; }
