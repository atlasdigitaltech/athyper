import { createHash } from "node:crypto";
import {
  parseNotificationEvent,
  type NotificationEventV1,
} from "@athyper/contract-platform-entity-runtime";
import type { BusinessPartnerRequest } from "@athyper/server-contract-master-data";

interface Route {
  readonly recipientHints: readonly string[];
  readonly deliveryClass: NotificationEventV1["deliveryClass"];
  readonly templateKey: string;
  readonly deepLinkKey: string;
}

const ROUTES: Readonly<Record<string, Route>> = Object.freeze({
  "business_partner.case.submitted": route(["current_approver", "approval_queue"], "policy_controlled", "business_partner.case.submitted.v1", "business_partner.case.decision"),
  "business_partner.workflow.stage.activated": route(["current_approver", "approval_queue"], "policy_controlled", "business_partner.workflow.stage.activated.v1", "business_partner.case.decision"),
  "business_partner.case.returned": route(["requester", "applicant"], "mandatory_transactional", "business_partner.case.returned.v1", "business_partner.case.correction"),
  "business_partner.case.approved": route(["requester", "relationship_owner"], "preference_aware", "business_partner.case.approved.v1", "business_partner.case.outcome"),
  "business_partner.case.rejected": route(["requester", "applicant"], "mandatory_transactional", "business_partner.case.rejected.v1", "business_partner.case.outcome"),
  "business_partner.case.materialized": route(["requester", "relationship_owner"], "preference_aware", "business_partner.case.materialized.v1", "business_partner.record.360"),
  "business_partner.supplier.activated": route(["requester", "relationship_owner"], "mandatory_transactional", "business_partner.case.materialized.v1", "business_partner.record.360"),
});

export interface BusinessPartnerNotificationProjection {
  readonly event: NotificationEventV1;
  readonly recipientPrincipalIds: readonly string[];
}

/** Projects only the accepted matrix fields; request payload/evidence never enters template data. */
export function projectBusinessPartnerNotification(
  eventType: string,
  request: BusinessPartnerRequest,
  actorId: string,
  metadata: Readonly<Record<string, unknown>> = {},
): BusinessPartnerNotificationProjection | undefined {
  const selected = ROUTES[eventType];
  if (!selected) return undefined;
  const stageId = typeof metadata["stageId"] === "string" ? metadata["stageId"] : undefined;
  const deduplicationKey = eventType === "business_partner.workflow.stage.activated" && stageId
    ? `${eventType}:${request.id}:${stageId}:v${request.rowVersion}`
    : `${eventType}:${request.id}:v${request.rowVersion}`;
  const templateData: Record<string, string | number | boolean | null> = {
    caseNo: request.requestNo,
    status: request.status,
    rowVersion: request.rowVersion,
  };
  for (const key of ["resultKind", "partnerRole"] as const) {
    const value = metadata[key];
    if (typeof value === "string") templateData[key] = value;
  }
  const event = parseNotificationEvent({
    schema: "athyper.notification-event/1",
    eventId: deterministicUuid(deduplicationKey),
    eventType,
    occurredAt: request.updatedAt ?? request.appliedAt ?? request.approvedAt ?? request.submittedAt ?? request.createdAt,
    tenantId: request.tenantId,
    plane: "neon",
    subject: { type: "business_partner_case", id: request.id, displayLabel: request.requestNo },
    caseId: request.id,
    actorId,
    recipientHints: selected.recipientHints,
    templateData,
    deliveryClass: selected.deliveryClass,
    templateKey: selected.templateKey,
    deepLinkKey: selected.deepLinkKey,
    deduplicationKey,
  });
  return Object.freeze({ event, recipientPrincipalIds: recipientIds(eventType, request, metadata) });
}

function route(recipientHints: readonly string[], deliveryClass: Route["deliveryClass"], templateKey: string, deepLinkKey: string): Route {
  return Object.freeze({ recipientHints: Object.freeze(recipientHints), deliveryClass, templateKey, deepLinkKey });
}

function recipientIds(eventType: string, request: BusinessPartnerRequest, metadata: Readonly<Record<string, unknown>>): readonly string[] {
  const values = eventType === "business_partner.case.submitted" || eventType === "business_partner.workflow.stage.activated"
    ? array(metadata["currentApproverPrincipalIds"])
    : [request.createdBy, request.applicantPrincipalId];
  return Object.freeze([...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))]);
}

function array(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }

function deterministicUuid(value: string): string {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hash[12] = "4";
  hash[16] = (["8", "9", "a", "b"] as const)[Number.parseInt(hash[16]!, 16) % 4]!;
  const hex = hash.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
