/**
 * Comment Draft Service
 *
 * Manages auto-save draft operations.
 */

import type { Logger } from "../../../../kernel/logger.js";
import type { CommentDraftRepository } from "../persistence/comment-draft.repository.js";
import type { CommentDraft, SaveDraftRequest, LoadDraftRequest } from "../types.js";

/**
 * Comment Draft Service
 */
export class CommentDraftService {
  constructor(
    private readonly repo: CommentDraftRepository,
    private readonly logger: Logger
  ) {}

  /**
   * Save or update a draft
   */
  async saveDraft(req: SaveDraftRequest): Promise<CommentDraft> {
    // Validate draft text
    if (!req.draftText.trim()) {
      throw new Error("Draft text cannot be empty");
    }

    if (req.draftText.length > 5000) {
      throw new Error("Draft text exceeds maximum length");
    }

    const draft = await this.repo.save(req);

    this.logger.debug(
      {
        draftId: draft.id,
        userId: req.userId,
        entityType: req.entityType,
        entityId: req.entityId,
      },
      "[collab] Draft saved"
    );

    return draft;
  }

  /**
   * Load a draft
   */
  async loadDraft(req: LoadDraftRequest): Promise<CommentDraft | undefined> {
    return this.repo.load(req);
  }

  /**
   * Delete a draft
   */
  async deleteDraft(req: LoadDraftRequest): Promise<void> {
    await this.repo.delete(req);

    this.logger.debug(
      {
        userId: req.userId,
        entityType: req.entityType,
        entityId: req.entityId,
      },
      "[collab] Draft deleted"
    );
  }

  /**
   * List user's recent drafts
   */
  async listUserDrafts(tenantId: string, userId: string, limit?: number): Promise<CommentDraft[]> {
    return this.repo.listByUser(tenantId, userId, limit);
  }

  /**
   * Cleanup old drafts (called by scheduled job)
   */
  async cleanupOldDrafts(olderThanDays: number = 7): Promise<number> {
    const deletedCount = await this.repo.deleteOldDrafts(olderThanDays);

    this.logger.info(
      { deletedCount, olderThanDays },
      "[collab] Old drafts cleanup completed"
    );

    return deletedCount;
  }
}
