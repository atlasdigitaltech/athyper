import { encodePathSegment, type ApiFetch } from "../base";
import { type WorkspaceNode, type Notification, type SavedView } from "../types";

export function createPlatformClient(fetch: ApiFetch) {
  return {
    async getModuleTree(): Promise<WorkspaceNode[]> {
      return fetch(`/api/platform/modules`);
    },

    async getNotifications(
      params?: Record<string, string>,
    ): Promise<{ data: Notification[] }> {
      const qs = params ? `?${new URLSearchParams(params)}` : "";
      return fetch(`/api/platform/notifications${qs}`);
    },

    async getUnreadCount(): Promise<{ count: number }> {
      return fetch(`/api/platform/notifications/unread-count`);
    },

    async getSavedViews(entityCode: string): Promise<SavedView[]> {
      return fetch(`/api/platform/saved-views/${encodePathSegment(entityCode)}`);
    },

    async saveSavedView(
      view: Omit<SavedView, "id" | "created_by" | "created_at">,
    ): Promise<SavedView> {
      return fetch(`/api/platform/saved-views`, {
        method: "POST",
        body:   JSON.stringify(view),
      });
    },

    async updateSavedView(
      entityCode: string,
      viewId:     string,
      patch:      { config: SavedView["config"]; name?: string },
    ): Promise<SavedView> {
      return fetch(
        `/api/platform/saved-views/${encodePathSegment(entityCode)}/${encodePathSegment(viewId)}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
    },
  };
}

export type PlatformClient = ReturnType<typeof createPlatformClient>;
