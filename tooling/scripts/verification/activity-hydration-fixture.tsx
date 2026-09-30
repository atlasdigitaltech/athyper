import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { createHttpClient } from "@athyper/platform-api-client";
import {
  ActivityCenterDataProvider,
  useActivityCenterDataSource,
} from "@athyper/platform-shell-activity-center-data";
import { ActivityCenterPage } from "@athyper/platform-shell-activity-center-data/page";
const client = createHttpClient({ csrfToken: () => "fixture" });
function App() {
  const data = useActivityCenterDataSource({ client });
  return (
    <ActivityCenterDataProvider value={data}>
      <ActivityCenterPage kind="inbox" />
    </ActivityCenterDataProvider>
  );
}
export function render() {
  return renderToString(<App />);
}
export function hydrate() {
  const errors: string[] = [];
  hydrateRoot(document.getElementById("root")!, <App />, {
    onRecoverableError: (error) => errors.push(String(error)),
  });
  return errors;
}
