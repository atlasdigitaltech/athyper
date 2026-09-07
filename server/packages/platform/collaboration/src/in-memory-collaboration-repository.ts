import type { CommandExecutionStore } from "@athyper/server-contract-events";
import { CollaborationError } from "./errors.js";
import type {
  CollaborationRepository,
  CommentRecord,
  CreateCommentCommand,
  EditCommentCommand,
  ResourceCoordinate,
} from "@athyper/server-contract-collaboration";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

interface State {
  receipts: Map<string, { fingerprint: string; result?: CommentRecord }>;
  comments: Map<string, CommentRecord>;
  mentions: Map<string, readonly string[]>;
  reactions: Set<string>;
  drafts: Map<string, CreateCommentCommand>;
  cursors: Map<string, string>;
  flags: Map<string, Readonly<Record<string, unknown>>>;
}

export function createInMemoryCollaborationPersistence(
  options: { createId?: () => string; now?: () => Date } = {},
): {
  repository: CollaborationRepository<State>;
  commandExecutions: CommandExecutionStore<State, CommentRecord>;
  transactions: PlaneTransactionCoordinator<State>;
  inspect(): State;
} {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());
  let state = empty();
  const repository: CollaborationRepository<State> = {
    async create(command, mentionIds, tx) {
      let depth = 0;
      if (command.parentCommentId) {
        const parent = tx.comments.get(command.parentCommentId);
        if (
          !parent ||
          parent.tenantId !== command.context.tenantId ||
          parent.contextType !== (command.contextType ?? "entity") ||
          parent.entityType !== command.entityType ||
          parent.entityId !== command.entityId ||
          parent.status === "deleted" ||
          (parent.visibility === "private" &&
            parent.authorId !== command.context.principalId)
        )
          throw new CollaborationError(
            404,
            "COMMENT_PARENT_NOT_FOUND",
            "Parent comment was not found in this context",
          );
        depth = parent.threadDepth + 1;
        if (depth > 5)
          throw new CollaborationError(
            422,
            "COMMENT_THREAD_DEPTH_EXCEEDED",
            "Comment nesting depth cannot exceed five",
          );
      }
      const timestamp = now().toISOString();
      const id = createId();
      const comment: CommentRecord = {
        id,
        tenantId: command.context.tenantId,
        contextType: command.contextType ?? "entity",
        entityType: command.entityType,
        entityId: command.entityId,
        authorId: command.context.principalId,
        text: command.text.trim(),
        format: command.format ?? "plain",
        ...(command.content ? { content: command.content } : {}),
        ...("contentSchema" in command &&
        typeof command.contentSchema === "string"
          ? { contentSchema: command.contentSchema }
          : {}),
        ...(command.html ? { html: command.html } : {}),
        ...(command.parentCommentId
          ? { parentCommentId: command.parentCommentId }
          : {}),
        threadDepth: depth,
        visibility: command.visibility ?? "public",
        intent: command.intent ?? "general",
        status: "open",
        createdAt: timestamp,
      };
      tx.comments.set(id, comment);
      tx.mentions.set(id, mentionIds);
      return comment;
    },
    async edit(command, mentionIds, tx) {
      const current = tx.comments.get(command.commentId);
      if (
        !current ||
        current.tenantId !== command.context.tenantId ||
        current.authorId !== command.context.principalId ||
        current.status === "deleted" ||
        (command.expectedUpdatedAt &&
          (current.updatedAt ?? current.createdAt) !==
            command.expectedUpdatedAt)
      )
        return null;
      const {
        content: _content,
        contentSchema: _schema,
        html: _html,
        ...base
      } = current;
      const updated = {
        ...base,
        text: command.text.trim(),
        format: command.format ?? current.format,
        ...(command.content ? { content: command.content } : {}),
        ...(command.contentSchema
          ? { contentSchema: command.contentSchema }
          : {}),
        ...(command.html ? { html: command.html } : {}),
        updatedAt: now().toISOString(),
      };
      tx.comments.set(current.id, updated);
      tx.mentions.set(current.id, mentionIds);
      return updated;
    },
    async softDelete(tenantId, id, principalId, tx) {
      const item = tx.comments.get(id);
      if (
        !item ||
        item.tenantId !== tenantId ||
        item.authorId !== principalId ||
        item.status === "deleted"
      )
        return false;
      tx.comments.set(id, {
        ...item,
        status: "deleted",
        updatedAt: now().toISOString(),
      });
      return true;
    },
    async putReaction(tenantId, commentId, principalId, code, tx) {
      const comment = tx.comments.get(commentId);
      if (
        !comment ||
        comment.tenantId !== tenantId ||
        comment.status === "deleted" ||
        (comment.visibility === "private" && comment.authorId !== principalId)
      )
        return false;
      const key = `${tenantId}:${commentId}:${principalId}:${code}`;
      const before = tx.reactions.size;
      tx.reactions.add(key);
      return tx.reactions.size !== before;
    },
    async deleteReaction(tenantId, commentId, principalId, code, tx) {
      return tx.reactions.delete(
        `${tenantId}:${commentId}:${principalId}:${code}`,
      );
    },
    async putDraft(command, tx) {
      if (command.parentCommentId) {
        const parent = tx.comments.get(command.parentCommentId);
        if (
          !parent ||
          parent.tenantId !== command.context.tenantId ||
          parent.contextType !== (command.contextType ?? "entity") ||
          parent.entityType !== command.entityType ||
          parent.entityId !== command.entityId ||
          parent.status === "deleted" ||
          (parent.visibility === "private" &&
            parent.authorId !== command.context.principalId)
        )
          throw new CollaborationError(
            404,
            "COMMENT_PARENT_NOT_FOUND",
            "Parent comment was not found in this context",
          );
      }
      tx.drafts.set(
        draftKey(
          command.context.tenantId,
          command.context.principalId,
          command,
          command.parentCommentId,
        ),
        command,
      );
    },
    async deleteDraft(tenantId, principalId, coordinate, parentId, tx) {
      return tx.drafts.delete(
        draftKey(tenantId, principalId, coordinate, parentId),
      );
    },
    async markRead(tenantId, principalId, coordinate, readAt, tx) {
      const key = `${tenantId}:${principalId}:${coordinate.entityType}:${coordinate.entityId}`;
      const previous = tx.cursors.get(key);
      if (!previous || Date.parse(readAt) > Date.parse(previous))
        tx.cursors.set(key, readAt);
    },
    async createFlag(tenantId, commentId, principalId, reasonCode, detail, tx) {
      const comment = tx.comments.get(commentId);
      if (
        !comment ||
        comment.tenantId !== tenantId ||
        comment.status === "deleted" ||
        (comment.visibility === "private" && comment.authorId !== principalId)
      )
        throw new CollaborationError(
          404,
          "COMMENT_NOT_FOUND",
          "Comment was not found",
        );
      const existing = [...tx.flags].find(
        ([, flag]) =>
          flag.tenantId === tenantId &&
          flag.commentId === commentId &&
          flag.principalId === principalId,
      );
      const id = existing?.[0] ?? createId();
      tx.flags.set(id, {
        tenantId,
        commentId,
        principalId,
        reasonCode,
        ...(detail ? { detail } : {}),
      });
      return id;
    },
  };
  let pending: Promise<unknown> = Promise.resolve();
  const transactions: PlaneTransactionCoordinator<State> = {
    run(_plane, _actor, work) {
      const result = pending.then(async () => {
        const tx = clone(state);
        const value = await work(tx);
        state = tx;
        return value;
      });
      pending = result.catch(() => undefined);
      return result;
    },
  };
  const commandExecutions: CommandExecutionStore<State, CommentRecord> = {
    async begin(input, tx) {
      const key = JSON.stringify([
        input.tenantId,
        input.commandCode,
        input.idempotencyKey,
      ]);
      const receipt = tx.receipts.get(key);
      if (receipt) {
        if (receipt.fingerprint !== input.requestFingerprint)
          return { kind: "conflict" };
        return receipt.result
          ? { kind: "replay", result: receipt.result }
          : { kind: "in_progress" };
      }
      tx.receipts.set(key, { fingerprint: input.requestFingerprint });
      return { kind: "started", executionId: key };
    },
    async complete(executionId, result, _principal, tx) {
      const receipt = tx.receipts.get(executionId);
      if (!receipt || receipt.result)
        throw new Error(
          "Command execution was not processing during completion",
        );
      tx.receipts.set(executionId, { ...receipt, result });
    },
  };
  return { repository, transactions, commandExecutions, inspect: () => state };
}
function empty(): State {
  return {
    receipts: new Map(),
    comments: new Map(),
    mentions: new Map(),
    reactions: new Set(),
    drafts: new Map(),
    cursors: new Map(),
    flags: new Map(),
  };
}
function clone(value: State): State {
  return {
    receipts: new Map(value.receipts),
    comments: new Map(value.comments),
    mentions: new Map(value.mentions),
    reactions: new Set(value.reactions),
    drafts: new Map(value.drafts),
    cursors: new Map(value.cursors),
    flags: new Map(value.flags),
  };
}
function draftKey(
  tenantId: string,
  principalId: string,
  value: ResourceCoordinate,
  parentId?: string,
): string {
  return `${tenantId}:${principalId}:${value.contextType ?? "entity"}:${value.entityType}:${value.entityId}:${parentId ?? "root"}`;
}
