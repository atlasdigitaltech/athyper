import { encodePathSegment, type ApiFetch } from "../base";
import {
  type EntityComment,
  type ReactionSummary,
  type TimelineEntry,
  type BookmarkListGroup,
  type BookmarkSnapshot,
  type CommentCountEntry,
} from "../types";

export function createCollabClient(fetch: ApiFetch) {
  return {
    // ── Comments ─────────────────────────────────────────────────────────────

    async listComments(opts: {
      entityType: string;
      entityId:   string;
      limit?:     number;
      offset?:    number;
    }): Promise<{ ok: boolean; data: EntityComment[]; hasMore: boolean }> {
      const p = new URLSearchParams({
        entityType: opts.entityType,
        entityId:   opts.entityId,
        limit:      String(opts.limit ?? 50),
        offset:     String(opts.offset ?? 0),
      });
      return fetch(`/api/collab/comments?${p}`);
    },

    async createComment(body: {
      entityType:      string;
      entityId:        string;
      commentText:     string;
      parentCommentId?: string;
    }): Promise<{ ok: boolean; data: { id: string } }> {
      return fetch("/api/collab/comments", { method: "POST", body: JSON.stringify(body) });
    },

    async replyToComment(
      parentId: string,
      body: { commentText: string },
    ): Promise<{ ok: boolean; data: { id: string } }> {
      return fetch(
        `/api/collab/comments/${encodePathSegment(parentId)}/replies`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },

    async updateComment(
      id: string,
      body: { commentText: string },
    ): Promise<{ ok: boolean; data: { id: string } }> {
      return fetch(
        `/api/collab/comments/${encodePathSegment(id)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
    },

    async deleteComment(id: string): Promise<void> {
      return fetch(`/api/collab/comments/${encodePathSegment(id)}`, { method: "DELETE" });
    },

    // ── Reactions ─────────────────────────────────────────────────────────────

    async listReactions(
      commentId: string,
    ): Promise<{ ok: boolean; data: ReactionSummary[] }> {
      return fetch(`/api/collab/comments/${encodePathSegment(commentId)}/reactions`);
    },

    async toggleReaction(commentId: string, reactionType: string): Promise<void> {
      return fetch(
        `/api/collab/comments/${encodePathSegment(commentId)}/reactions`,
        { method: "POST", body: JSON.stringify({ reactionType }) },
      );
    },

    // ── Timeline ──────────────────────────────────────────────────────────────

    async listTimeline(opts: {
      entityType?:  string;
      entityId?:    string;
      actorUserId?: string;
      limit?:       number;
    }): Promise<{ ok: boolean; data: TimelineEntry[] }> {
      const p = new URLSearchParams({ limit: String(opts.limit ?? 50) });
      if (opts.entityType)  p.set("entityType",  opts.entityType);
      if (opts.entityId)    p.set("entityId",    opts.entityId);
      if (opts.actorUserId) p.set("actorUserId", opts.actorUserId);
      return fetch(`/api/collab/timeline?${p}`);
    },

    // ── Drafts ────────────────────────────────────────────────────────────────

    async getDraft(opts: {
      entityType:       string;
      entityId:         string;
      parentCommentId?: string;
    }): Promise<{ ok: boolean; draft: { draftText: string; updatedAt: string } | null }> {
      const p = new URLSearchParams({ entityType: opts.entityType, entityId: opts.entityId });
      if (opts.parentCommentId) p.set("parentCommentId", opts.parentCommentId);
      return fetch(`/api/collab/drafts?${p}`);
    },

    async saveDraft(body: {
      entityType:       string;
      entityId:         string;
      draftText:        string;
      parentCommentId?: string;
    }): Promise<void> {
      return fetch("/api/collab/drafts", { method: "POST", body: JSON.stringify(body) });
    },

    async deleteDraft(opts: {
      entityType:       string;
      entityId:         string;
      parentCommentId?: string;
    }): Promise<void> {
      const p = new URLSearchParams({ entityType: opts.entityType, entityId: opts.entityId });
      if (opts.parentCommentId) p.set("parentCommentId", opts.parentCommentId);
      return fetch(`/api/collab/drafts?${p}`, { method: "DELETE" });
    },

    // ── Unread ────────────────────────────────────────────────────────────────

    async getUnreadCount(opts: {
      entityType: string;
      entityId:   string;
    }): Promise<{ ok: boolean; count: number }> {
      const p = new URLSearchParams({ entityType: opts.entityType, entityId: opts.entityId });
      return fetch(`/api/collab/comments/unread-count?${p}`);
    },

    async markAllRead(opts: {
      entityType: string;
      entityId:   string;
    }): Promise<void> {
      const p = new URLSearchParams({ entityType: opts.entityType, entityId: opts.entityId });
      return fetch(`/api/collab/comments/mark-all-read?${p}`, { method: "POST" });
    },

    // ── Bookmarks ─────────────────────────────────────────────────────────────

    async getBatchBookmarks(
      entityCode: string,
      recordIds:  string[],
    ): Promise<{ bookmarked_ids: string[] }> {
      if (recordIds.length === 0) return { bookmarked_ids: [] };
      const p = new URLSearchParams({
        entity_code: entityCode,
        ids:         recordIds.join(","),
      });
      return fetch(`/api/collab/bookmarks/batch?${p}`);
    },

    async listBookmarks(): Promise<{ ok: boolean; groups: BookmarkListGroup[] }> {
      return fetch("/api/collab/bookmarks");
    },

    async toggleBookmark(body: {
      entity_code:      string;
      record_id:        string;
      label_snapshot?:  BookmarkSnapshot["displayName"];
    }): Promise<{ bookmarked: boolean }> {
      return fetch("/api/collab/bookmarks", { method: "POST", body: JSON.stringify(body) });
    },

    // ── Comment counts ────────────────────────────────────────────────────────

    async getBatchCommentCounts(
      entityCode: string,
      recordIds:  string[],
    ): Promise<{ counts: Record<string, CommentCountEntry> }> {
      if (recordIds.length === 0) return { counts: {} };
      const p = new URLSearchParams({
        entity_type: entityCode,
        ids:         recordIds.join(","),
      });
      return fetch(`/api/collab/comments/batch-count?${p}`);
    },
  };
}

export type CollabClient = ReturnType<typeof createCollabClient>;
