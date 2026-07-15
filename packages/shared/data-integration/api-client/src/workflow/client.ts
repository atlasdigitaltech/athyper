import { encodePathSegment, type ApiFetch } from "../base";
import { type InboxItem, type ApprovalAction, type ApprovalContext, type WorkflowEvent } from "@athyper/api-contracts/workflow";

export function createWorkflowClient(fetch: ApiFetch) {
  return {
    async getInbox(params?: Record<string, string>) {
      const query = params ? `?${new URLSearchParams(params)}` : "";
      return fetch<{ data: InboxItem[]; pagination: unknown }>(`/api/workflow/inbox${query}`);
    },
    async getInboxCount(): Promise<{ count: number }> {
      return fetch(`/api/workflow/inbox/count`);
    },
    async submitAction(workItemId: string, body: ApprovalAction): Promise<void> {
      return fetch(`/api/workflow/items/${encodePathSegment(workItemId)}/action`, { method: "POST", body: JSON.stringify(body) });
    },
    async getApprovalContext(requestId: string): Promise<ApprovalContext> {
      return fetch(`/api/workflow/requests/${encodePathSegment(requestId)}/context`);
    },
    async getActivity(requestId: string): Promise<{ items: WorkflowEvent[] }> {
      return fetch(`/api/workflow/requests/${encodePathSegment(requestId)}/activity`);
    },
  };
}

export type WorkflowClient = ReturnType<typeof createWorkflowClient>;
