import React from "react";
import { createRoot } from "react-dom/client";
import { createHttpClient } from "../../../packages/platform/foundation/api-client/src/index";
import { useActivityCenterDataSource } from "../../../packages/platform/shell/activity-center-data/src/index";
const client = createHttpClient({ csrfToken: () => "fixture" });
function App() {
  const data = useActivityCenterDataSource({ client, notificationLimit:1 });
  return (
    <main>
      {data.loading ? (
        <p>Loading</p>
      ) : (
        <>
          <button onClick={()=>void data.onLoadMoreNotifications?.()}>Load more</button><button onClick={data.onRetry}>Refresh</button>
          <p>Unread: {data.unreadNotificationCount}</p>
          {data.notifications?.map((n) => (
            <p key={n.id}>{n.title}</p>
          ))}
          <p role="status">{data.errors?.inbox?.message}</p>
          {data.errors?.notifications ? (
            <p role="alert">{data.errors.notifications.message}</p>
          ) : null}
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
