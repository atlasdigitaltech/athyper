import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export interface ResourceCoordinate {
  readonly contextType?: string;
  readonly entityType: string;
  readonly entityId: string;
}

export const RICH_TEXT_SCHEMA = "athyper.rich-text/1.0" as const;
export type CommentFormat = "plain" | "rich_json";
export type CommentVisibility = "public" | "internal" | "private";

export interface RichTextMark { readonly type: "bold" | "italic" | "underline" | "strike" | "code" | "link"; readonly attrs?: Readonly<Record<string, unknown>>; }
export interface RichTextNode { readonly type: string; readonly attrs?: Readonly<Record<string, unknown>>; readonly marks?: readonly RichTextMark[]; readonly text?: string; readonly content?: readonly RichTextNode[]; }
export interface RichTextDocument extends Readonly<Record<string, unknown>> { readonly type: "doc"; readonly schema: typeof RICH_TEXT_SCHEMA; readonly content: readonly RichTextNode[]; }

export interface CommentRecord extends ResourceCoordinate {
  readonly id: string;
  readonly tenantId: string;
  readonly authorId: string;
  readonly text: string;
  readonly format: CommentFormat;
  readonly content?: Readonly<Record<string, unknown>>;
  readonly contentSchema?: string;
  readonly html?: string;
  readonly parentCommentId?: string;
  readonly threadDepth: number;
  readonly visibility: CommentVisibility;
  readonly intent: string;
  readonly status: "open" | "resolved" | "archived" | "deleted";
  readonly createdAt: string;
  readonly revision: number;
  readonly updatedAt?: string;
}

/** Internal mutation outcome; the public collaboration service returns `comment`. */
export interface CommentEditResult {
  readonly comment: CommentRecord;
  /** Active versions made retention-eligible by the replaced comment pins. */
  readonly orphanedAttachmentIds: readonly string[];
}

export interface CreateCommentCommand extends ResourceCoordinate {
  /** Server-resolved published policy; HTTP input must not set this field. */
  readonly draftRetentionDays?: number;
  readonly context: VerifiedRequestContext;
  readonly text: string;
  readonly format?: CommentFormat;
  readonly content?: Readonly<Record<string, unknown>>;
  /** Server-derived for rich_json input. */
  readonly contentSchema?: string;
  /** Ignored for rich_json; the server derives the safe HTML projection. */
  readonly html?: string;
  readonly parentCommentId?: string;
  readonly visibility?: CommentVisibility;
  readonly intent?: string;
  readonly mentionedPrincipalIds?: readonly string[];
  readonly attachmentIds?: readonly string[];
  readonly idempotencyKey?: string;
}

export interface EditCommentCommand {
  readonly context: VerifiedRequestContext;
  readonly commentId: string;
  readonly text: string;
  readonly format?: CommentFormat;
  readonly content?: Readonly<Record<string, unknown>>;
  /** Server-derived for rich_json input. */
  readonly contentSchema?: string;
  /** Ignored for rich_json; the server derives the safe HTML projection. */
  readonly html?: string;
  readonly mentionedPrincipalIds?: readonly string[];
  readonly attachmentIds?: readonly string[];
  readonly expectedRevision: number;
}

export interface CollaborationService {
  participants?(input: {context:VerifiedRequestContext;entityType:string;entityId:string;query:string;visibility:CommentVisibility}): Promise<readonly {id:string;displayName:string}[]>;
  history?(input: CommentHistoryQuery): Promise<CommentHistoryPage>;
  create(command: CreateCommentCommand): Promise<CommentRecord>;
  edit(command: EditCommentCommand): Promise<CommentRecord>;
  remove(input: { readonly context: VerifiedRequestContext; readonly commentId: string }): Promise<boolean>;
  putReaction(input: { readonly context: VerifiedRequestContext; readonly commentId: string; readonly code: string }): Promise<boolean>;
  deleteReaction(input: { readonly context: VerifiedRequestContext; readonly commentId: string; readonly code: string }): Promise<boolean>;
  /** Returns the principal-scoped durable draft identity used for draft uploads. */
  putDraft(input: CreateCommentCommand): Promise<string>;
  deleteDraft(input: { readonly context: VerifiedRequestContext } & ResourceCoordinate & { readonly parentCommentId?: string }): Promise<boolean>;
  markRead(input: { readonly context: VerifiedRequestContext } & ResourceCoordinate & { readonly readAt?: string }): Promise<void>;
  flag(input: { readonly context: VerifiedRequestContext; readonly commentId: string; readonly reasonCode: string; readonly detail?: string }): Promise<string>;
}

/** Owner-only historical content. Notes and reviewer evidence never enter this projection. */
export interface CommentHistoryEntry {
  readonly revision: number;
  readonly text: string;
  readonly format: CommentFormat;
  readonly content?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}
export interface CommentHistoryQuery {
  readonly context: VerifiedRequestContext;
  readonly commentId: string;
  readonly beforeRevision?: number;
  readonly limit?: number;
}
export interface CommentHistoryPage {
  /** Deleted comments expose audit metadata only, never retained revision text. */
  readonly deletion?: { readonly deletedAt?: string; readonly deletedBy?: string };
  readonly items: readonly CommentHistoryEntry[];
  readonly nextRevision?: number;
}
