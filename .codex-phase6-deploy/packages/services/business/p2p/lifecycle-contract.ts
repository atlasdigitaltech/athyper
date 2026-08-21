export type P2pWorkflowDecision = "start" | "decision" | "cancel" | "none";
export type P2pSnapshotKind =
  | "authoring_lock"
  | "commitment"
  | "fulfillment"
  | "financial_post"
  | "match_decision"
  | "amendment_baseline"
  | "reversal";

export interface P2pLifecycleTransitionContract<State extends string = string> {
  readonly key: string;
  readonly entity: string;
  readonly from: State;
  readonly command: string;
  readonly lifecycleOperation: string;
  readonly to: State;
  readonly permission: string;
  readonly handler: string;
  readonly workflow: P2pWorkflowDecision;
  readonly validationPolicy: string;
  readonly businessEffect: string;
  readonly activityEvent: string;
  readonly snapshot: "required" | "not_required";
  readonly snapshotKind?: P2pSnapshotKind;
  readonly financialEvent?: string;
  readonly outboxEvent: string;
  readonly reversalPolicy: "none" | "cancel" | "compensating_entry";
}

export type P2pEdge<State extends string> = readonly [
  key: string,
  from: State,
  command: string,
  to: State,
  snapshotKind?: P2pSnapshotKind,
  workflow?: P2pWorkflowDecision,
  financialEvent?: string,
  permission?: string,
];

export function defineLifecycle<State extends string>(
  entity: string,
  edges: readonly P2pEdge<State>[],
): readonly P2pLifecycleTransitionContract<State>[] {
  return edges.map(([key, from, command, to, snapshotKind, workflow = "none", financialEvent, permission]) => ({
    key,
    entity,
    from,
    command,
    lifecycleOperation: command,
    to,
    permission: permission ?? command,
    handler: `${entity}.${command.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    workflow,
    validationPolicy: `${entity}.${command.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    businessEffect: financialEvent ? `${entity}.${financialEvent.toLowerCase()}` : `${entity}.${command.toLowerCase()}`,
    activityEvent: `${entity}.${command.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    snapshot: snapshotKind ? "required" : "not_required",
    snapshotKind,
    financialEvent,
    outboxEvent: `${entity}.${command.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    reversalPolicy: command === "reverse" ? "compensating_entry" : command === "cancel" || command === "void" ? "cancel" : "none",
  }));
}
