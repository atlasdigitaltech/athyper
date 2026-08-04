import type { MetaEntityChangeSetStatus } from "@athyper/meta-entity-authoring-contracts";
import type { MetaEntityReleaseAction, MetaEntityTransitionAction } from "./workflow-panels";

export type MetaEntityStudioWorkflowAction = MetaEntityTransitionAction | MetaEntityReleaseAction | "checkpoint";

export function allowedMetaEntityWorkflowActions(
  status: MetaEntityChangeSetStatus,
  tenantOwned: boolean,
  dirty: boolean,
): readonly MetaEntityStudioWorkflowAction[] {
  if (!tenantOwned || dirty) return [];
  if (status === "draft" || status === "rejected") return ["checkpoint", "submit", "abandon"];
  if (status === "in_review") return ["return-to-draft", "approve", "reject"];
  if (status === "approved") return ["publish", "rollback", "retire"];
  return [];
}
