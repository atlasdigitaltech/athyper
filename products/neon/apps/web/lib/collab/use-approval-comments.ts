"use client";

/**
 * useApprovalComments - SWR hook for approval-workflow comments.
 */

import { useCallback } from "react";
import useSWR from "swr";

import { collabFetcher, collabMutate } from "./fetcher";

export interface ApprovalComment {
  id: string;
  tenantId: string;
  approvalInstanceId: string;
  approvalTaskId: string | null;
  commenterId: string;
  commenterName?: string;
  commentText: string;
  createdAt: string;
  updatedAt: string | null;
}

interface ApprovalCommentsResponse {
  ok: boolean;
  data: ApprovalComment[];
}

export function useApprovalComments(instanceId: string | null) {
  const key = instanceId ? `/api/collab/approval-comments/${instanceId}` : null;

  const { data, error, isLoading, mutate } = useSWR<ApprovalCommentsResponse>(
    key,
    collabFetcher,
    { revalidateOnFocus: true },
  );

  const addComment = useCallback(
    async (commentText: string, taskId?: string) => {
      if (!instanceId) return;

      await collabMutate("/api/collab/approval-comments", "POST", {
        approvalInstanceId: instanceId,
        approvalTaskId: taskId,
        commentText,
      });
      await mutate();
    },
    [instanceId, mutate],
  );

  return {
    comments: data?.data ?? [],
    isLoading,
    error,
    addComment,
    mutate,
  };
}
