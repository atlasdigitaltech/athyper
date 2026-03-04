"use client";

/**
 * useCommentActions - CRUD mutation helpers for comments.
 */

import { useCallback } from "react";

import { collabMutate } from "./fetcher";

interface CommentResponse {
  ok: boolean;
  data: { id: string };
}

export function useCommentActions() {
  const createComment = useCallback(
    async (
      entityType: string,
      entityId: string,
      commentText: string,
      parentCommentId?: string,
    ) => {
      return collabMutate<CommentResponse>("/api/collab/comments", "POST", {
        entityType,
        entityId,
        commentText,
        parentCommentId,
      });
    },
    [],
  );

  const updateComment = useCallback(async (id: string, commentText: string) => {
    return collabMutate<CommentResponse>(
      `/api/collab/comments/${id}`,
      "PATCH",
      { commentText },
    );
  }, []);

  const deleteComment = useCallback(async (id: string) => {
    return collabMutate(`/api/collab/comments/${id}`, "DELETE");
  }, []);

  const createReply = useCallback(
    async (parentId: string, commentText: string) => {
      return collabMutate<CommentResponse>(
        `/api/collab/comments/${parentId}/replies`,
        "POST",
        { commentText },
      );
    },
    [],
  );

  return { createComment, updateComment, deleteComment, createReply };
}
