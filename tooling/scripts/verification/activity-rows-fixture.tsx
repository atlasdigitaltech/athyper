import React from "react";
import { createRoot } from "react-dom/client";
import {
  ActivityInboxRow,
  ActivityNotificationRow,
} from "../../../packages/platform/shell/shell/src/activity-center";
import "../../../packages/platform/shell/shell/src/styles.css";
const read = async () => {
  throw new Error("mock failure");
};
createRoot(document.getElementById("root")!).render(
  <main>
    <ActivityInboxRow
      item={{
        id: "w",
        title: "Review supplier request",
        recordLabel: "Business Partner · Acme · BP-123",
        href: "/requests/123?attemptId=a&workItemId=w#review",
        actionLabel: "Review request",
        dueLabel: "Overdue 2 days",
        overdue: true,
        statusLabel: "Open",
      }}
    />
    <ActivityNotificationRow
      item={{
        id: "n",
        title: "Alex mentioned you",
        recordLabel: "Business Partner · Acme",
        detail: "Please check the registration.",
        timestamp: "2026-09-23T00:00:00Z",
        timestampLabel: "10 minutes ago",
        href: "/records/123?panel=collaboration#comment-c",
        actionLabel: "View comment",
        unread: true,
      }}
      onMarkRead={read}
    />
    <ActivityNotificationRow
      item={{
        id: "missing",
        title: "Record update unavailable",
        timestamp: "2026-09-23T00:00:00Z",
        timestampLabel: "Yesterday",
      }}
    />
  </main>,
);
