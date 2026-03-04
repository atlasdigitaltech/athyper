/**
 * Collaboration Module - Shared Types
 *
 * Type definitions for comments, mentions, and activity timeline.
 */

export type CommentVisibility = 'public' | 'internal' | 'private';

export interface EntityComment {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  commenterId: string;
  commenterDisplayName?: string;
  commentText: string;
  parentCommentId?: string;
  threadDepth: number;
  visibility: CommentVisibility;
  deletedAt?: Date;
  deletedBy?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
  attachments?: Attachment[];
  reactions?: ReactionSummary[];
  isUnread?: boolean;
}

export interface CreateCommentRequest {
  tenantId: string;
  entityType: string;
  entityId: string;
  commenterId: string;
  commentText: string;
  createdBy: string;
  parentCommentId?: string;
  visibility?: CommentVisibility;
}

export interface UpdateCommentRequest {
  commentText: string;
  updatedBy: string;
}

export interface ApprovalComment {
  id: string;
  tenantId: string;
  approvalInstanceId: string;
  approvalTaskId?: string;
  commenterId: string;
  commenterDisplayName?: string;
  commentText: string;
  visibility: CommentVisibility;
  createdAt: Date;
  createdBy: string;
  attachments?: Attachment[];
  reactions?: ReactionSummary[];
  isUnread?: boolean;
}

export interface CreateApprovalCommentRequest {
  tenantId: string;
  approvalInstanceId: string;
  approvalTaskId?: string;
  commenterId: string;
  commentText: string;
  createdBy: string;
  visibility?: CommentVisibility;
}

export interface CommentMention {
  id: string;
  tenantId: string;
  commentType: "entity_comment" | "approval_comment";
  commentId: string;
  mentionedUserId: string;
  mentionText: string;
  position: number;
  createdAt: Date;
}

export interface MentionMatch {
  mentionText: string;
  userId?: string;
  username?: string;
  position: number;
}

export interface ActivityTimelineEntry {
  id: string;
  source: string;
  tenantId: string;
  eventType: string;
  severity: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  actorDisplayName?: string;
  summary: string;
  details?: Record<string, unknown>;
  occurredAt: Date;
}

export interface TimelineQuery {
  tenantId: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Attachment
 */
export interface Attachment {
  id: string;
  tenantId: string;
  ownerEntity?: string;
  ownerEntityId?: string;
  fileName: string;
  contentType?: string;
  sizeBytes?: number;
  storageBucket: string;
  storageKey: string;
  isVirusScanned: boolean;
  retentionUntil?: string;
  metadata?: Record<string, unknown>;
  commentType?: string;
  commentId?: string;
  createdAt: string;
  createdBy: string;
}

/**
 * Comment Reaction
 */
export type ReactionType = '👍' | '❤️' | '🎉' | '👀' | '👎' | '🚀' | '💡' | '🤔';

export interface CommentReaction {
  id: string;
  tenantId: string;
  commentType: "entity_comment" | "approval_comment";
  commentId: string;
  userId: string;
  reactionType: ReactionType;
  createdAt: Date;
}

export interface ReactionSummary {
  reactionType: ReactionType;
  count: number;
  userIds: string[];
  currentUserReacted: boolean;
}

export interface CreateReactionRequest {
  tenantId: string;
  commentType: "entity_comment" | "approval_comment";
  commentId: string;
  userId: string;
  reactionType: ReactionType;
}

/**
 * Comment Read Status
 */
export interface CommentReadStatus {
  id: string;
  tenantId: string;
  commentType: "entity_comment" | "approval_comment";
  commentId: string;
  userId: string;
  readAt: Date;
}

export interface MarkAsReadRequest {
  tenantId: string;
  commentType: "entity_comment" | "approval_comment";
  commentId: string;
  userId: string;
}

/**
 * Comment Draft
 */
export interface CommentDraft {
  id: string;
  tenantId: string;
  userId: string;
  entityType: string;
  entityId: string;
  parentCommentId?: string;
  draftText: string;
  visibility: CommentVisibility;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveDraftRequest {
  tenantId: string;
  userId: string;
  entityType: string;
  entityId: string;
  parentCommentId?: string;
  draftText: string;
  visibility?: CommentVisibility;
}

export interface LoadDraftRequest {
  tenantId: string;
  userId: string;
  entityType: string;
  entityId: string;
  parentCommentId?: string;
}

/**
 * Comment Moderation & Flagging
 */
export type FlagReason = 'spam' | 'offensive' | 'harassment' | 'misinformation' | 'other';
export type FlagStatus = 'pending' | 'reviewed' | 'dismissed' | 'actioned';

export interface CommentFlag {
  id: string;
  tenantId: string;
  commentType: "entity_comment" | "approval_comment";
  commentId: string;
  flaggerUserId: string;
  flagReason: FlagReason;
  flagDetails?: string;
  status: FlagStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  resolution?: string;
  createdAt: Date;
}

export interface CreateFlagRequest {
  tenantId: string;
  commentType: "entity_comment" | "approval_comment";
  commentId: string;
  flaggerUserId: string;
  flagReason: FlagReason;
  flagDetails?: string;
}

export interface ReviewFlagRequest {
  reviewedBy: string;
  resolution: string;
  action: 'dismiss' | 'hide_comment' | 'delete_comment';
}

export interface CommentModerationStatus {
  id: string;
  tenantId: string;
  commentType: "entity_comment" | "approval_comment";
  commentId: string;
  isHidden: boolean;
  hiddenReason?: string;
  hiddenAt?: Date;
  hiddenBy?: string;
  flagCount: number;
  lastFlaggedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
