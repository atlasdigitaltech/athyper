import { MasterDataError } from "./errors.js";
import { sql, type Transaction } from "kysely";
import type {
  BusinessPartner360EvidenceManifestItem,
  BusinessPartner360MaterializationLink,
  BusinessPartner360RequestHistoryItem,
} from "@athyper/server-contract-master-data";
import type {
  BusinessPartner360ExplainabilityRead,
  BusinessPartner360Repository,
} from "./business-partner-360-service.js";
import {
  mapBusinessPartner360Activity,
  type BusinessPartner360RawActivity,
} from "./business-partner-360-activity-mapper.js";
type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;
type Input = Parameters<
  BusinessPartner360Repository<Tx>["readExplainabilitySection"]
>[0];
export async function readBusinessPartner360ExplainabilitySection(
  input: Input,
  tx: Tx,
): Promise<BusinessPartner360ExplainabilityRead> {
  return input.sectionCode === "requests"
    ? requests(input, tx)
    : activity(input, tx);
}
async function requests(input: Input, tx: Tx) {
  const ids = await authorizedCaseIds(input, tx),
    authorization =
      ids === undefined
        ? sql`TRUE`
        : ids.length
          ? sql`governed_case.id IN (${sql.join(ids.map((id) => sql`${id}::uuid`))})`
          : sql`FALSE`;
  const pageSize = Math.max(1, input.limit - 1),
    [rows, counts] = await Promise.all([
      sql<Row>`SELECT governed_case.id::text,governed_case.case_code request_no,governed_case.operation_code request_kind,COALESCE(snapshot.payload_json->>'sourceKind','governed_case') source_kind,snapshot.payload_json->>'requestedRole' requested_role,governed_case.status,NULLIF(workflow.cycle_run_id::text,'') workflow_request_id,governed_case.created_at,governed_case.created_by::text,workflow.submitted_at,workflow.submitted_by,workflow.approved_at,workflow.approved_by,materialized.completed_at applied_at,materialized.completed_by::text applied_by,materialized.result_code application_result_kind,NULL::text application_reason_code,COALESCE(evidence.items,'[]'::jsonb) evidence,COALESCE(materialized.items,'[]'::jsonb) materialization FROM document.entity_case governed_case JOIN snapshot.entity_snapshot snapshot ON snapshot.tenant_id=governed_case.tenant_id AND snapshot.snapshot_id=governed_case.current_snapshot_id LEFT JOIN LATERAL(SELECT max(subject.cycle_run_id::text) cycle_run_id,min(command.recorded_at)FILTER(WHERE command.command_code='entity.case.submit')submitted_at,min(command.recorded_by::text)FILTER(WHERE command.command_code='entity.case.submit')submitted_by,min(command.recorded_at)FILTER(WHERE command.command_code='entity.case.decision'AND command.after_status='approved')approved_at,min(command.recorded_by::text)FILTER(WHERE command.command_code='entity.case.decision'AND command.after_status='approved')approved_by FROM document.entity_case_command_evidence command LEFT JOIN governance.cycle_subject subject ON subject.tenant_id=command.tenant_id AND subject.entity_case_id=command.entity_case_id WHERE command.tenant_id=governed_case.tenant_id AND command.entity_case_id=governed_case.id)workflow ON true LEFT JOIN LATERAL(SELECT jsonb_agg(jsonb_build_object('id',item.id,'kind','command','classification','governed','verificationStatus',item.outcome,'snapshotId',item.result_snapshot_id,'createdAt',item.recorded_at)ORDER BY item.recorded_at,item.id)items FROM document.entity_case_command_evidence item WHERE item.tenant_id=governed_case.tenant_id AND item.entity_case_id=governed_case.id)evidence ON true LEFT JOIN LATERAL(SELECT max(item.completed_at)completed_at,max(item.completed_by::text)completed_by,max(item.result_code)result_code,jsonb_agg(jsonb_build_object('id',item.id,'childKind','authority','definitionFieldCode',item.materializer_code,'targetType',governed_case.entity_code,'targetId',governed_case.target_entity_id,'appliedAt',item.completed_at)ORDER BY item.attempt_no)FILTER(WHERE item.status='succeeded')items FROM document.entity_case_materialization item WHERE item.tenant_id=governed_case.tenant_id AND item.entity_case_id=governed_case.id)materialized ON true WHERE governed_case.tenant_id=${input.tenantId}::uuid AND governed_case.entity_code='master.business_partner'AND governed_case.target_entity_id=${input.businessPartnerId}::uuid AND ${authorization} AND governed_case.created_at<=${input.cursor.snapshotAt}::timestamptz ${after(input, "governed_case.created_at", "governed_case.id", "request")} ORDER BY governed_case.created_at DESC,governed_case.id DESC LIMIT ${pageSize + 1}`.execute(
        tx,
      ),
      sql<Row>`SELECT count(*)FILTER(WHERE governed_case.status IN('draft','submitted','in_review','approved','materializing','conflicted'))::int active,count(*)FILTER(WHERE governed_case.status='draft'AND latest_decision.result_code='ENTITY_CASE_RETURNED'AND latest_decision.recorded_at>=COALESCE(latest_draft.recorded_at,'-infinity'::timestamptz))::int returned,count(*)FILTER(WHERE governed_case.status IN('submitted','in_review'))::int pending_approval,count(*)FILTER(WHERE governed_case.status='approved')::int approved,count(*)FILTER(WHERE governed_case.status='conflicted')::int failed FROM document.entity_case governed_case LEFT JOIN LATERAL(SELECT command.result_code,command.recorded_at FROM document.entity_case_command_evidence command WHERE command.tenant_id=governed_case.tenant_id AND command.entity_case_id=governed_case.id AND command.command_code='entity.case.decision' ORDER BY command.recorded_at DESC,command.id DESC LIMIT 1)latest_decision ON true LEFT JOIN LATERAL(SELECT command.recorded_at FROM document.entity_case_command_evidence command WHERE command.tenant_id=governed_case.tenant_id AND command.entity_case_id=governed_case.id AND command.command_code='entity.case.draft.write' ORDER BY command.recorded_at DESC,command.id DESC LIMIT 1)latest_draft ON true WHERE governed_case.tenant_id=${input.tenantId}::uuid AND governed_case.entity_code='master.business_partner'AND governed_case.target_entity_id=${input.businessPartnerId}::uuid AND ${authorization}`.execute(
        tx,
      ),
    ]),
    page = rows.rows.slice(0, pageSize),
    last = page.at(-1),
    items = page.map(mapRequest);
  if (ids)
    for (const id of ids)
      if (!(await input.authorizeCase!(id)))
        throw new MasterDataError(
          403,
          "BP_CHILD_AUTHORIZATION_CHANGED",
          "Case authorization changed during aggregation",
        );
  return {
    items,
    summary: {
      active: Number(counts.rows[0]?.["active"] ?? 0),
      returned: Number(counts.rows[0]?.["returned"] ?? 0),
      pendingApproval: Number(counts.rows[0]?.["pending_approval"] ?? 0),
      approved: Number(counts.rows[0]?.["approved"] ?? 0),
      failed: Number(counts.rows[0]?.["failed"] ?? 0),
    },
    ...(rows.rows.length > pageSize && last
      ? {
          next: {
            at: iso(last["created_at"]),
            id: text(last, "id"),
            source: "request",
          },
        }
      : {}),
    provenance: [provenance("document.entity_case", input.cursor.snapshotAt)],
  };
}
async function activity(input: Input, tx: Tx) {
  const ids = await authorizedCaseIds(input, tx);
  // A parent/context match must not admit an independently owned case event.
  // Constrain before pagination so denied events cannot affect rows or cursors.
  const authorization =
    ids === undefined
      ? sql`TRUE`
      : sql`
    (audit.entity_type <> 'entity_case' OR ${
      ids.length
        ? sql`audit.entity_id IN (${sql.join(ids.map((id) => sql`${id}::uuid`))})`
        : sql`FALSE`
    })`;
  const pageSize = Math.max(1, input.limit - 1),
    rows = (
      await sql<Row>`SELECT audit.id::text,audit.event_code,audit.occurred_at,audit.actor_principal_id::text actor_id,'audit' source,audit.source_service,audit.request_id,audit.entity_type,audit.entity_id::text,audit.outcome::text,audit.changed_fields FROM audit.audit_log audit WHERE audit.tenant_id=${input.tenantId}::uuid AND ${authorization} AND audit.occurred_at<=${input.cursor.snapshotAt}::timestamptz AND(audit.event_code LIKE 'business_partner.%'OR audit.event_code LIKE 'entity.case.%')AND(audit.entity_type='business_partner'AND audit.entity_id=${input.businessPartnerId}::uuid OR audit.context->>'businessPartnerId'=${input.businessPartnerId} OR audit.entity_type='entity_case'AND EXISTS(SELECT 1 FROM document.entity_case governed_case WHERE governed_case.tenant_id=audit.tenant_id AND governed_case.id=audit.entity_id AND governed_case.entity_code='master.business_partner'AND governed_case.target_entity_id=${input.businessPartnerId}::uuid))${after(input, "audit.occurred_at", "audit.id", "audit")} ORDER BY audit.occurred_at DESC,audit.id DESC LIMIT ${pageSize + 1}`.execute(
        tx,
      )
    ).rows,
    page = rows.slice(0, pageSize),
    last = page.at(-1),
    items = page.map((row) =>
      mapBusinessPartner360Activity({
        id: text(row, "id"),
        eventCode: text(row, "event_code"),
        occurredAt: iso(row["occurred_at"]),
        ...(optional(row, "actor_id")
          ? { actorId: optional(row, "actor_id") }
          : {}),
        source: "audit",
        sourceService: text(row, "source_service"),
        ...(optional(row, "request_id")
          ? { requestId: optional(row, "request_id") }
          : {}),
        entityType: text(row, "entity_type"),
        ...(optional(row, "entity_id")
          ? { entityId: optional(row, "entity_id") }
          : {}),
        ...(optional(row, "outcome")
          ? { outcome: optional(row, "outcome") }
          : {}),
        changedFields: stringArray(row["changed_fields"]),
        evidenceHref: evidenceHref(row, input.businessPartnerId),
      } satisfies BusinessPartner360RawActivity),
    );
  if (ids)
    for (const id of ids)
      if (!(await input.authorizeCase!(id)))
        throw new MasterDataError(
          403,
          "BP_CHILD_AUTHORIZATION_CHANGED",
          "Case authorization changed during activity retrieval",
        );
  return {
    items,
    ...(rows.length > pageSize && last
      ? {
          next: {
            at: iso(last["occurred_at"]),
            id: text(last, "id"),
            source: "audit",
          },
        }
      : {}),
    provenance: [provenance("audit.audit_log", input.cursor.snapshotAt)],
  };
}
function mapRequest(row: Row): BusinessPartner360RequestHistoryItem {
  const id = text(row, "id"),
    evidence = jsonArray(row["evidence"]).map(
      (item) =>
        ({
          id: String(item["id"]),
          kind: String(item["kind"]),
          classification: String(item["classification"]),
          verificationStatus: String(item["verificationStatus"]),
          ...(item["attachmentId"]
            ? { attachmentId: String(item["attachmentId"]) }
            : {}),
          ...(item["snapshotId"]
            ? { snapshotId: String(item["snapshotId"]) }
            : {}),
          createdAt: iso(item["createdAt"]),
          href: `/mdg/business-partner/requests/${encodeURIComponent(id)}#evidence-${encodeURIComponent(String(item["id"]))}`,
        }) satisfies BusinessPartner360EvidenceManifestItem,
    ),
    materialization = jsonArray(row["materialization"]).map(
      (item) =>
        ({
          id: String(item["id"]),
          childKind: String(item["childKind"]),
          definitionFieldCode: String(item["definitionFieldCode"]),
          targetType: String(item["targetType"]),
          targetId: String(item["targetId"]),
          appliedAt: iso(item["appliedAt"]),
          href: `/mdg/business-partner/requests/${encodeURIComponent(id)}#materialization-${encodeURIComponent(String(item["id"]))}`,
        }) satisfies BusinessPartner360MaterializationLink,
    );
  return {
    id,
    requestNo: text(row, "request_no"),
    requestKind: text(row, "request_kind"),
    sourceKind: text(row, "source_kind"),
    ...(optional(row, "requested_role")
      ? { requestedRole: optional(row, "requested_role") }
      : {}),
    status: text(row, "status"),
    ...(optional(row, "workflow_request_id")
      ? { workflowRequestId: optional(row, "workflow_request_id") }
      : {}),
    createdAt: iso(row["created_at"]),
    createdBy: text(row, "created_by"),
    ...(row["submitted_at"]
      ? {
          submittedAt: iso(row["submitted_at"]),
          submittedBy: optional(row, "submitted_by"),
        }
      : {}),
    ...(row["approved_at"]
      ? {
          approvedAt: iso(row["approved_at"]),
          approvedBy: optional(row, "approved_by"),
        }
      : {}),
    ...(row["applied_at"]
      ? {
          appliedAt: iso(row["applied_at"]),
          appliedBy: optional(row, "applied_by"),
        }
      : {}),
    ...(optional(row, "application_result_kind")
      ? { applicationResultKind: optional(row, "application_result_kind") }
      : {}),
    ...(optional(row, "application_reason_code")
      ? { applicationReasonCode: optional(row, "application_reason_code") }
      : {}),
    evidence,
    materialization,
    href: `/mdg/business-partner/requests/${encodeURIComponent(id)}`,
  };
}
function after(input: Input, at: string, id: string, source: string) {
  if (!input.cursor.afterAt || !input.cursor.afterId) return sql``;
  if (input.cursor.afterSource && input.cursor.afterSource !== source)
    return sql`AND false`;
  return sql`AND(${sql.raw(at)},${sql.raw(id)})<(${input.cursor.afterAt}::timestamptz,${input.cursor.afterId}::uuid)`;
}
function evidenceHref(row: Row, bp: string) {
  const requestId = optional(row, "request_id");
  return requestId
    ? `/mdg/business-partner/requests?targetBusinessPartnerId=${encodeURIComponent(bp)}&requestId=${encodeURIComponent(requestId)}`
    : undefined;
}
function provenance(sourceObject: string, observedAt: string) {
  return {
    plane: "neon" as const,
    service: "master-data",
    sourceObject,
    observedAt,
    schemaVersion: "1",
  };
}
function text(row: Row, key: string) {
  const value = row[key];
  if (value === null || value === undefined)
    throw new Error(`BP_360_REPOSITORY_FIELD_MISSING:${key}`);
  return String(value);
}
function optional(row: Row, key: string) {
  const value = row[key];
  return value === null || value === undefined ? undefined : String(value);
}
function iso(value: unknown) {
  return (
    value instanceof Date ? value : new Date(String(value))
  ).toISOString();
}
function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function jsonArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

export async function authorizedCaseIds(
  input: Pick<Input, "authorizeCase" | "tenantId" | "businessPartnerId">,
  tx: Tx,
): Promise<string[] | undefined> {
  if (!input.authorizeCase) return undefined;
  const rows = (
    await sql<{
      id: string;
    }>`SELECT id::text FROM document.entity_case WHERE tenant_id=${input.tenantId}::uuid AND entity_code='master.business_partner' AND target_entity_id=${input.businessPartnerId}::uuid ORDER BY id LIMIT 2001`.execute(
      tx,
    )
  ).rows;
  if (rows.length > 2000)
    throw new MasterDataError(
      503,
      "BP_CHILD_AUTHORIZATION_CAPACITY",
      "Case authorization exceeds its bounded capacity",
    );
  const ids = [];
  for (const row of rows)
    if (await input.authorizeCase(row.id)) ids.push(row.id);
  return ids;
}
