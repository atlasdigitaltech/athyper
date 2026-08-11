export interface WebhookDelivery {
  readonly deliveryId: string;
  readonly tenantId: string;
  readonly topic: string;
  readonly targetUrl: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly signingSecret?: string;
  readonly timeoutMs?: number;
}

export type WebhookErrorCategory =
  | "transient"
  | "permanent"
  | "rate_limit"
  | "auth";

export interface WebhookDeliveryOutcome {
  readonly delivered: boolean;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly errorCategory?: WebhookErrorCategory;
  readonly retryAfterMs?: number;
  readonly durationMs?: number;
}

export interface WebhookDeliveryRepository {
  loadDue(coordinate:WebhookDeliveryCoordinate): Promise<WebhookDelivery | undefined>;
  complete(coordinate:WebhookDeliveryCoordinate, outcome: WebhookDeliveryOutcome): Promise<void>;
}
import type {PlaneKey} from "@athyper/server-foundation/context";
export interface WebhookDeliveryCoordinate {readonly planeKey:PlaneKey;readonly tenantId:string;readonly principalId:string;readonly deliveryId:string;}
