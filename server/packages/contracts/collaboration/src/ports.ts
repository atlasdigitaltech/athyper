import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { CommentRecord, CreateCommentCommand, EditCommentCommand, ResourceCoordinate } from "./collaboration.js";

export interface PrincipalDirectory {
  resolveActivePrincipals(context: VerifiedRequestContext, principalIds: readonly string[], transaction?: unknown): Promise<readonly string[]>;
}

export interface CollaborationRepository<Transaction = unknown> {
  create(command: CreateCommentCommand, resolvedMentionIds: readonly string[], transaction: Transaction): Promise<CommentRecord>;
  edit(command: EditCommentCommand, resolvedMentionIds: readonly string[], transaction: Transaction): Promise<CommentRecord | null>;
  softDelete(tenantId: string, commentId: string, principalId: string, transaction: Transaction): Promise<boolean>;
  putReaction(tenantId: string, commentId: string, principalId: string, code: string, transaction: Transaction): Promise<boolean>;
  deleteReaction(tenantId: string, commentId: string, principalId: string, code: string, transaction: Transaction): Promise<boolean>;
  putDraft(command: CreateCommentCommand, transaction: Transaction): Promise<void>;
  deleteDraft(tenantId: string, principalId: string, coordinate: ResourceCoordinate, parentCommentId: string | undefined, transaction: Transaction): Promise<boolean>;
  markRead(tenantId: string, principalId: string, coordinate: ResourceCoordinate, readAt: string, transaction: Transaction): Promise<void>;
  createFlag(tenantId: string, commentId: string, principalId: string, reasonCode: string, detail: string | undefined, transaction: Transaction): Promise<string>;
}

export interface CollaborationFanout {
  publish(input: { readonly tenantId: string; readonly principalId: string; readonly eventType: string; readonly data: Readonly<Record<string, unknown>> }): Promise<void>;
}
