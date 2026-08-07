import { encodePathSegment, type ApiFetch } from "../base";
import {
  type InboxItem,
  type ApprovalAction,
  type ApprovalContext,
  type WorkflowEvent,
  type ActivityEntry,
} from "../types";

export function createWorkflowClient(fetch: ApiFetch) {
  return {
    async getInbox(
      params?: Record<string, string>,
    ): Promise<{ data: InboxItem[]; pagination: unknown }> {
      const qs = params ? `?${new URLSearchParams(params)}` : "";
      return fetch(`/api/workflow/inbox${qs}`);
    },

    async getInboxCount(): Promise<{ count: number }> {
      return fetch(`/api/workflow/inbox/count`);
    },

    async submitAction(workItemId: string, body: ApprovalAction): Promise<void> {
      return fetch(
        `/api/workflow/items/${encodePathSegment(workItemId)}/action`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },

    async getApprovalContext(requestId: string): Promise<ApprovalContext> {
      return fetch(`/api/workflow/requests/${encodePathSegment(requestId)}/context`);
    },

    async getActivity(requestId: string): Promise<{ items: WorkflowEvent[] }> {
      return fetch(`/api/workflow/requests/${encodePathSegment(requestId)}/activity`);
    },

    async getRecentActivity(limit: number): Promise<{ data: ActivityEntry[] }> {
      return fetch(`/api/activity/recent?limit=${encodeURIComponent(limit)}`);
    },
  };
}

export type WorkflowClient = ReturnType<typeof createWorkflowClient>;
