import { graph } from "./composition-structure.fixture";
import type { Json } from "./workbench-model";
export const configurationFixture: Json = {
  ...graph,
  operations: [
    {
      id: "create",
      operationKey: "create",
      operationKind: "create",
      label: "Create",
      auditEventCode: "created",
      permissionCode: "bp.create",
      requiresMfa: true,
    },
  ],
  flows: [
    {
      id: "flow",
      flowKey: "intake",
      flowKind: "create",
      title: "Create partner",
      entryOperationId: "create",
      completionOperationId: "create",
    },
  ],
  flowSteps: [
    {
      id: "step",
      entityFlowId: "flow",
      entitySurfaceId: "surface-main",
      stepKey: "details",
      position: 0,
      completionCondition: { field: "requested_role", operator: "present" },
    },
  ],
};
