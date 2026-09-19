import { createHash } from "node:crypto";
import type {
  NormalizedSesDeliveryEvent,
  NotificationProviderDeliveryStatus,
  SesDeliveryEventRepository,
  SesDeliveryEventType,
  SesDeliveryTransition,
  SesEventApplyResult,
} from "@athyper/server-contract-notifications";

const EVENT_TYPES: Readonly<Record<string, SesDeliveryEventType>> = {
  send: "send",
  delivery: "delivery",
  deliverydelay: "delivery_delay",
  bounce: "bounce",
  complaint: "complaint",
  reject: "reject",
  renderingfailure: "rendering_failure",
};
const DELIVERY_STATUSES = new Set<NotificationProviderDeliveryStatus>([
  "pending", "queued", "claimed", "sending", "sent", "delivered", "bounced", "failed", "cancelled",
]);

/** Stable validation marker so queue consumers never mistake repository bugs for poison input. */
export class InvalidSesDeliveryEventError extends TypeError {
  override readonly name = "InvalidSesDeliveryEventError";
}

/** Normalize an SES EventBridge detail without retaining addresses or raw provider payloads. */
export function normalizeSesDeliveryEvent(input: unknown): NormalizedSesDeliveryEvent {
  try {
    return normalizeSesDeliveryEventUnsafe(input);
  } catch (error) {
    if (error instanceof InvalidSesDeliveryEventError) throw error;
    if (error instanceof TypeError) {
      throw new InvalidSesDeliveryEventError(error.message, { cause: error });
    }
    throw error;
  }
}

function normalizeSesDeliveryEventUnsafe(input: unknown): NormalizedSesDeliveryEvent {
  const envelope = record(input, "SES event");
  const detail = optionalRecord(envelope["detail"]) ?? envelope;
  const mail = record(detail["mail"], "SES event mail");
  const rawType = requiredString(detail["eventType"] ?? detail["notificationType"], "SES event type");
  const type = EVENT_TYPES[rawType.replace(/[^a-z]/gi, "").toLowerCase()];
  if (!type) throw new TypeError(`Unsupported SES event type: ${safeToken(rawType)}`);
  const providerMessageId = requiredString(mail["messageId"], "SES message id");
  const tags = optionalRecord(mail["tags"]) ?? optionalRecord(detail["tags"]) ?? {};
  const deliveryId = uuid(tag(tags, "athyper-delivery"), "Athyper delivery tag");
  const tenantId = uuid(tag(tags, "athyper-tenant"), "Athyper tenant tag");
  const planeKey = tag(tags, "athyper-plane");
  if (planeKey !== "studio" && planeKey !== "neon" && planeKey !== "mesh") {
    throw new TypeError("Invalid Athyper plane tag");
  }
  const occurredAt = timestamp(eventTimestamp(detail, mail, type));
  const suppliedId = nonEmpty(envelope["id"] ?? detail["id"]);
  const providerEventId = suppliedId ?? createHash("sha256")
    .update(`${providerMessageId}\u0000${type}\u0000${occurredAt}\u0000${deliveryId}`)
    .digest("hex");
  return {
    provider: "amazon_ses",
    providerEventId,
    providerMessageId,
    type,
    occurredAt,
    correlation: { deliveryId, tenantId, planeKey },
    diagnostic: diagnostic(detail, type),
    redacted: true,
  };
}

/** Pure, monotonic mapping onto the delivery statuses supported by today's schema. */
export function sesDeliveryTransition(
  current: NotificationProviderDeliveryStatus,
  event: NormalizedSesDeliveryEvent,
): SesDeliveryTransition | undefined {
  if (!DELIVERY_STATUSES.has(current)) throw new TypeError("Unsupported notification delivery status");
  if (current === "cancelled") return undefined;
  const diagnosticText = [event.diagnostic.category, event.diagnostic.subcategory].filter(Boolean).join(":");
  switch (event.type) {
    case "send":
      return preTerminal(current) ? { status: "sent", terminal: false, setSentAt: true } : undefined;
    case "delivery_delay":
      return preTerminal(current) || current === "sent"
        ? { status: "sent", terminal: false, errorCategory: "transient", diagnostic: diagnosticText, setSentAt: true }
        : undefined;
    case "delivery":
      return preTerminal(current) || current === "sent"
        ? { status: "delivered", terminal: true, setSentAt: true, setDeliveredAt: true }
        : undefined;
    case "bounce":
      return current === "bounced" || current === "failed"
        ? undefined
        : { status: "bounced", terminal: true, errorCategory: "permanent", diagnostic: diagnosticText, setSentAt: true, setBouncedAt: true };
    case "complaint":
      return current === "failed"
        ? undefined
        : { status: "failed", terminal: true, errorCategory: "permanent", diagnostic: diagnosticText, setSentAt: true };
    case "reject":
    case "rendering_failure":
      return current === "delivered" || current === "bounced" || current === "failed"
        ? undefined
        : { status: "failed", terminal: true, errorCategory: "permanent", diagnostic: diagnosticText };
  }
}

export function createSesDeliveryEventProcessor(repository: SesDeliveryEventRepository) {
  return {
    async apply(input: unknown): Promise<SesEventApplyResult> {
      const event = normalizeSesDeliveryEvent(input);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const delivery = await repository.findByProviderMessageId(event.providerMessageId, event.correlation);
        if (!delivery) return { outcome: "not_found" };
        if (delivery.externalId !== event.providerMessageId
          || delivery.deliveryId !== event.correlation.deliveryId
          || delivery.tenantId !== event.correlation.tenantId
          || delivery.planeKey !== event.correlation.planeKey
          || (delivery.providerCode !== undefined && delivery.providerCode !== "amazon_ses")) {
          return { outcome: "correlation_mismatch" };
        }
        const transition = sesDeliveryTransition(delivery.status, event);
        if (!transition) return { outcome: "ignored", previousStatus: delivery.status };
        const outcome = await repository.recordAndApply({ event, expectedStatus: delivery.status, transition });
        if (outcome === "duplicate") return { outcome: "duplicate", previousStatus: delivery.status, transition, delivery };
        if (outcome === "applied") return { outcome: "applied", previousStatus: delivery.status, transition, delivery };
      }
      return { outcome: "ignored" };
    },
  };
}

function preTerminal(status: NotificationProviderDeliveryStatus) {
  return status === "pending" || status === "queued" || status === "claimed" || status === "sending";
}
function eventTimestamp(detail: Record<string, unknown>, mail: Record<string, unknown>, type: SesDeliveryEventType) {
  const node = optionalRecord(detail[typeNode(type)]);
  return node?.["timestamp"] ?? mail["timestamp"] ?? detail["timestamp"];
}
function typeNode(type: SesDeliveryEventType) {
  if (type === "delivery_delay") return "deliveryDelay";
  if (type === "rendering_failure") return "failure";
  return type;
}
function diagnostic(detail: Record<string, unknown>, type: SesDeliveryEventType): NormalizedSesDeliveryEvent["diagnostic"] {
  const node = optionalRecord(detail[typeNode(type)]) ?? {};
  if (type === "bounce") return compact("bounce", node["bounceType"], node["bounceSubType"]);
  if (type === "complaint") return compact("complaint", node["complaintFeedbackType"]);
  if (type === "delivery_delay") return compact("delivery_delay", node["delayType"]);
  // Reject and rendering messages may contain addresses/template data. Keep only a fixed classification.
  return compact(type);
}
function compact(category: string, subcategory?: unknown, detail?: unknown) {
  const sub = [subcategory, detail].map(safeOptionalToken).filter(Boolean).join(".");
  return { category, ...(sub ? { subcategory: sub } : {}) };
}
function tag(tags: Record<string, unknown>, name: string) {
  const value = tags[name];
  return requiredString(Array.isArray(value) ? value[0] : value, `${name} tag`);
}
function timestamp(value: unknown) {
  const raw = requiredString(value, "SES event timestamp");
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new TypeError("Invalid SES event timestamp");
  return parsed.toISOString();
}
function uuid(value: string, name: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new TypeError(`Invalid ${name}`);
  return value.toLowerCase();
}
function record(value: unknown, name: string): Record<string, unknown> {
  const result = optionalRecord(value);
  if (!result) throw new TypeError(`Invalid ${name}`);
  return result;
}
function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function nonEmpty(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function requiredString(value: unknown, name: string) { const result = nonEmpty(value); if (!result) throw new TypeError(`Missing ${name}`); return result; }
function safeOptionalToken(value: unknown) { const result = nonEmpty(value); return result ? safeToken(result) : ""; }
function safeToken(value: string) { return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 80); }
