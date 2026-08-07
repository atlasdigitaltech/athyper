"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ApprovalAction } from "@athyper/platform-api-client";
import { queryKeys } from "../query-keys";
import { clients } from "../client-store";

export function useInbox(params?: Record<string, string>) {
  const queryKey = params
    ? [...queryKeys.workflowInbox.all, params]
    : queryKeys.workflowInbox.all;

  return useQuery({
    queryKey,
    queryFn:   () => clients.workflow().getInbox(params),
    staleTime: 30 * 1000,
  });
}

export function useInboxCount() {
  return useQuery({
    queryKey:       queryKeys.workflowInbox.count,
    queryFn:        () => clients.workflow().getInboxCount(),
    staleTime:      30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useApprovalContext(requestId: string, enabled = true) {
  return useQuery({
    queryKey:  queryKeys.approvalContext.byRequest(requestId),
    queryFn:   () => clients.workflow().getApprovalContext(requestId),
    staleTime: 30 * 1000,
    enabled:   enabled && Boolean(requestId),
  });
}

export function useSubmitWorkflowAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, action }: { workItemId: string; action: ApprovalAction }) =>
      clients.workflow().submitAction(workItemId, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workflowInbox.all });
      qc.invalidateQueries({ queryKey: queryKeys.workflowInbox.count });
    },
  });
}

export function useWorkflowActivity(requestId: string, enabled = true) {
  return useQuery({
    queryKey:  queryKeys.workflowActivity.byRequest(requestId),
    queryFn:   () => clients.workflow().getActivity(requestId),
    staleTime: 30 * 1000,
    enabled:   enabled && Boolean(requestId),
  });
}

export function useRecentActivity(limit = 20) {
  return useQuery({
    queryKey:        queryKeys.recentActivity.byLimit(limit),
    queryFn:         () => clients.workflow().getRecentActivity(limit),
    staleTime:       30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
