import { type ApiFetch } from "../base";
import { type WorkspaceNode, type Notification, type SavedView } from "@athyper/api-contracts/platform";

export function createPlatformClient(fetch: ApiFetch) {
  return {
    async getModuleTree(): Promise<WorkspaceNode[]> {
      return fetch(`/api/platform/modules`);
    },
    async getNotifications(params?: Record<string, string>) {
      const query = params ? `?${new URLSearchParams(params)}` : "";
      return fetch<{ data: Notification[] }>(`/api/platform/notifications${query}`);
    },
    async getUnreadCount(): Promise<{ count: number }> {
      return fetch(`/api/platform/notifications/unread-count`);
    },
    async getSavedViews(entityCode: string): Promise<SavedView[]> {
      return fetch(`/api/platform/saved-views/${entityCode}`);
    },
    async saveSavedView(view: Omit<SavedView, "id" | "created_by" | "created_at">): Promise<SavedView> {
      return fetch(`/api/platform/saved-views`, { method: "POST", body: JSON.stringify(view) });
    },
  };
}

export type PlatformClient = ReturnType<typeof createPlatformClient>;
