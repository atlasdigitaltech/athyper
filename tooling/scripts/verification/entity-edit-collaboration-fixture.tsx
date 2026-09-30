import React from "react";
import { createRoot } from "react-dom/client";
import { EntityEditCollaboration } from "../../../packages/platform/entity/runtime/form-detail/src/entity-edit-collaboration";

// Probe the generic adapter contract independently of section networking.
export function EntityRuntimeWorkspace(props: any) {
  (window as any).runtimeInput = { entityCode: props.entityCode, recordId: props.recordId, surfaceKey: props.surfaceKey, resourceContext: props.resourceContext };
  const navigation = { collaboration: { sections: [{ key: "comments", label: "Discussion" }], preloadSection() {}, renderSection() {} } };
  return <>{props.renderHeader({}, "1", [], navigation)}{props.renderBody({ navigation })}</>;
}
export function EntityCollaborationSurface(props: any) {
  return props.open ? <section aria-label="Collaboration probe">
    <button onClick={() => props.onFullViewChange(!props.fullView)}>Toggle full view</button>
    <button onClick={() => props.onOpenChange(false)}>Close collaboration</button>
  </section> : null;
}
createRoot(document.getElementById("root")!).render(
  <EntityEditCollaboration entityCode="fixture_order" recordId={location.search.includes("new=1") ? undefined : "order-42"} surfaceKey="detail" resourceContext={{ orgUnitId: "org-7" } as any}>
    <label>Order description<input defaultValue="Draft" /></label>
  </EntityEditCollaboration>,
);
