import React, { useState } from "react";
import { ShellActivityCenter } from "../../../packages/platform/shell/shell/src/activity-center";
import { createRoot } from "react-dom/client";
import { createHttpClient } from "@athyper/platform-api-client";
import {
  ActivityCenterDataProvider,
  useActivityCenterDataSource,
} from "@athyper/platform-shell-activity-center-data";
import { ActivityCenterPage } from "@athyper/platform-shell-activity-center-data/page";
const client = createHttpClient({ csrfToken: () => "fixture" });
function App() {
  const value = useActivityCenterDataSource({ client, notificationLimit: 2 });
  const [tab, setTab] = useState<"notifications" | "inbox">("notifications");
  if (window.location.pathname === "/record")
    return (
      <ShellActivityCenter
        activeTab={tab}
        onTabChange={setTab}
        onClose={() => {}}
        dataSource={value}
      />
    );
  return (
    <ActivityCenterDataProvider value={value}>
      <ActivityCenterPage kind="notifications" />
    </ActivityCenterDataProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
