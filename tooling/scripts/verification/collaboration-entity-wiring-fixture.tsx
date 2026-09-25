import React from "react";
import { createRoot } from "react-dom/client";
import { EntityRuntimeWorkspace } from "../../../packages/platform/entity/runtime/form-detail/src/entity-runtime-workspace";

const client = {};
export const useApiClient = () => client;
export const useSessionIdentity = () => ({ scope: { tenantId: "tenant", principalId: "owner" } });
export const entityRuntimeClient = {
  bootstrap: async () => ({
    releaseId: "release", releaseHash: "hash",
    header: { values: {}, revision: "1" },
    plan: { sections: [{ key: "discussion" }], initialSectionKeys: ["discussion"], actions: [] },
  }),
  section: async (_client: unknown, input: unknown) => {
    (window as any).sectionRequests.push(input);
    return {
      releaseId: "release", releaseHash: "hash", revision: "1",
      presentation: { rendererKey: "platform.comments.v1" }, data: { items: [] },
    };
  },
};
// Probe the renderer boundary while exercising the real workspace and resource hook.
export function CompiledEntitySectionContent({ onLoadThreadPage }: { onLoadThreadPage?: (id: string, cursor: string) => Promise<unknown> }) {
  return <button disabled={!onLoadThreadPage} onClick={() => void onLoadThreadPage?.("thread-90", "page-8")}>Load custom discussion replies</button>;
}
(window as any).sectionRequests = [];
createRoot(document.getElementById("root")!).render(
  <EntityRuntimeWorkspace entityCode="fixture_order" recordId="order-42" surfaceKey="detail"
    resourceContext={{ orgUnitId: "org-7" } as any} renderHeader={() => null} />,
);
