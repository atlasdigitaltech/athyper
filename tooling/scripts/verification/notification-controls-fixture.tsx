import React from "react";
import { createRoot } from "react-dom/client";
import { NotificationControls } from "../../../packages/platform/shell/activity-center-data/src/notification-controls";
import { createHttpClient } from "../../../packages/platform/foundation/api-client/src/index";
const client = createHttpClient({
  fetch: globalThis.fetch,
  csrfToken: () => "fixture-csrf",
});
export const useApiClient = () => client;
export const usePermission = (code: string) =>
  !location.search.includes("subscriber") &&
  ["notifications.delivery.read", "notifications.delivery.replay"].includes(
    code,
  );
createRoot(document.getElementById("root")!).render(<NotificationControls />);
