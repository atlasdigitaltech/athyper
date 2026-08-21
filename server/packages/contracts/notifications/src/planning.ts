import type { PlaneKey } from "@athyper/server-foundation/context";
import type { NotificationAttachmentReference } from "./attachments.js";

export interface NotificationSourceEvent {
  readonly id:string;
  readonly planeKey:PlaneKey;
  readonly tenantId:string;
  readonly actorPrincipalId:string;
  readonly eventCode:string;
  readonly occurredAt?:string;
  readonly entityType?:string;
  readonly entityId?:string;
  readonly lifecycleState?:string;
  readonly locale?:string;
  readonly payload:Readonly<Record<string,unknown>>;
  readonly recipientPrincipalIds?:readonly string[];
  readonly correlationId?:string;
  readonly attachments?:readonly NotificationAttachmentReference[];
}
export interface NotificationPlanningResult { readonly matchedRules:number;readonly messages:number;readonly deliveries:number;readonly digests:number; }
export interface NotificationPlanner { plan(event:NotificationSourceEvent):Promise<NotificationPlanningResult>; }
