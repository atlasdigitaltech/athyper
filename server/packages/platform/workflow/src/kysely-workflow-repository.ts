import type { WorkflowRepository, WorkItem, WorkItemStatus } from "@athyper/server-contract-workflow";
import { sql, type Kysely, type Transaction } from "kysely";

export type WorkflowDatabase = Kysely<Record<string, never>>;
export type WorkflowTransaction = Transaction<Record<string, never>>;

interface WorkItemRow {
  id: string; tenant_id: string; work_type_code: string; title: string; description: string | null;
  source_entity_code: string; source_entity_id: string; source_action_code: string | null;
  assignee_principal_id: string | null; assignee_team_id: string | null; claimant_principal_id: string | null;
  claimed_at: Date | string | null; available_at: Date | string; due_at: Date | string | null; completed_at: Date | string | null;
  priority: WorkItem["priority"]; payload: unknown; outcome: unknown; status: WorkItemStatus;
  created_at: Date | string; created_by: string;
  row_version: number | string;
}

export function createKyselyWorkflowRepository(): WorkflowRepository<WorkflowTransaction> {
  return {
    async create({ command }, transaction) {
      const result = await sql<WorkItemRow>`
        INSERT INTO document.work_item
          (tenant_id, work_type_code, title, description, source_entity_code, source_entity_id,
           source_action_code, assignee_principal_id, assignee_team_id, available_at, due_at,
           priority, payload, created_by)
        VALUES
          (${command.context.tenantId}::uuid, ${command.workTypeCode}, ${command.title.trim()}, ${command.description ?? null},
           ${command.sourceEntityCode}, ${command.sourceEntityId}::uuid, ${command.sourceActionCode ?? null},
           ${command.assigneePrincipalId ?? null}::uuid, ${command.assigneeTeamId ?? null}::uuid,
           ${command.availableAt ?? new Date().toISOString()}::timestamptz, ${command.dueAt ?? null}::timestamptz,
           ${command.priority ?? "normal"}, ${JSON.stringify({ ...(command.payload ?? {}), ...(command.idempotencyKey ? { idempotency_key: command.idempotencyKey } : {}) })}::jsonb,
           ${command.context.principalId}::uuid)
        RETURNING *
      `.execute(transaction);
      return mapRow(requiredRow(result.rows[0]));
    },
    async listInbox(query, transaction) {
      const statuses = query.statuses?.length ? query.statuses : ["open", "claimed", "in_progress", "blocked"] as const;
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      const result = await sql<WorkItemRow>`
        SELECT * FROM document.work_item
         WHERE tenant_id = ${query.context.tenantId}::uuid
           AND status IN (${sql.join(statuses)})
           AND (assignee_principal_id = ${query.context.principalId}::uuid OR claimant_principal_id = ${query.context.principalId}::uuid)
           ${cursor ? sql`AND (created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)` : sql``}
         ORDER BY created_at DESC, id DESC
         LIMIT ${query.limit ?? 50}
      `.execute(transaction);
      const data = result.rows.map(mapRow);
      const last = data.at(-1);
      const totalCount=Number((await sql<{count:string}>`SELECT count(*)::text count FROM document.work_item WHERE tenant_id=${query.context.tenantId}::uuid AND status IN (${sql.join(statuses)}) AND (assignee_principal_id=${query.context.principalId}::uuid OR claimant_principal_id=${query.context.principalId}::uuid)`.execute(transaction)).rows[0]?.count??0);
      return { data,totalCount, ...(last && data.length === (query.limit ?? 50) ? { nextCursor: encodeCursor(last.createdAt, last.id) } : {}) };
    },
    async get(tenantId, workItemId, transaction) {
      const result = await sql<WorkItemRow>`SELECT * FROM document.work_item WHERE tenant_id=${tenantId}::uuid AND id=${workItemId}::uuid`.execute(transaction);
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    },
    async getRequestContext(tenantId, requestId, transaction) {
      const requestResult = await sql<Record<string, unknown>>`SELECT * FROM document.workflow_request WHERE tenant_id=${tenantId}::uuid AND id=${requestId}::uuid`.execute(transaction);
      const request = requestResult.rows[0]; if (!request) return null;
      const stages = await sql<Record<string, unknown>>`SELECT * FROM document.workflow_stage WHERE tenant_id=${tenantId}::uuid AND workflow_request_id=${requestId}::uuid ORDER BY stage_no`.execute(transaction);
      const items = await sql<WorkItemRow>`SELECT * FROM document.work_item WHERE tenant_id=${tenantId}::uuid AND payload->>'workflow_request_id'=${requestId} ORDER BY created_at`.execute(transaction);
      const definitionCode = request["definition_code"], version = request["definition_version"], artifactHash = request["compiled_artifact_hash"];
      return { request, stages: stages.rows, items: items.rows.map(mapRow), ...(typeof definitionCode === "string" && typeof version === "number" && typeof artifactHash === "string" ? { activeRevision: { definitionCode, version, artifactHash } } : {}) };
    },
    async action(tenantId, workItemId, principalId, action, expectedRowVersion, outcome, transaction) {
      const status = action === "claim" ? "claimed" : action === "cancel" ? "cancelled" : "completed";
      const result = await sql<WorkItemRow>`
        UPDATE document.work_item
           SET status = ${status}, row_version = row_version + 1,
               claimant_principal_id = CASE WHEN ${action} = 'claim' THEN ${principalId}::uuid ELSE claimant_principal_id END,
               claimed_at = CASE WHEN ${action} = 'claim' THEN clock_timestamp() ELSE claimed_at END,
               completed_at = CASE WHEN ${action} IN ('complete','approve','reject') THEN clock_timestamp() ELSE completed_at END,
               outcome = CASE WHEN ${action} IN ('complete','approve','reject') THEN ${JSON.stringify({ ...outcome, action })}::jsonb ELSE outcome END,
               updated_by = ${principalId}::uuid
         WHERE tenant_id = ${tenantId}::uuid AND id = ${workItemId}::uuid
           AND row_version = ${expectedRowVersion}
           AND (assignee_principal_id = ${principalId}::uuid OR claimant_principal_id = ${principalId}::uuid
             OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(payload->'eligibility_evidence'->'candidates','[]'::jsonb)) candidate WHERE candidate->>'principalId' = ${principalId}))
           AND ((${action} = 'claim' AND status = 'open' AND available_at <= clock_timestamp())
             OR (${action} IN ('complete','approve','reject') AND status IN ('open','claimed','in_progress'))
             OR (${action} = 'cancel' AND status NOT IN ('completed','cancelled')))
        RETURNING *
      `.execute(transaction);
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    },
  };
}

function mapRow(row: WorkItemRow): WorkItem {
  const payload = object(row.payload);
  return {
    id: row.id, tenantId: row.tenant_id, workTypeCode: row.work_type_code, title: row.title,
    ...(row.description ? { description: row.description } : {}), sourceEntityCode: row.source_entity_code,
    sourceEntityId: row.source_entity_id, ...(row.source_action_code ? { sourceActionCode: row.source_action_code } : {}),
    ...(row.assignee_principal_id ? { assigneePrincipalId: row.assignee_principal_id } : {}),
    ...(row.assignee_team_id ? { assigneeTeamId: row.assignee_team_id } : {}),
    ...(row.claimant_principal_id ? { claimantPrincipalId: row.claimant_principal_id } : {}),
    ...(row.claimed_at ? { claimedAt: iso(row.claimed_at) } : {}), availableAt: iso(row.available_at),
    ...(row.due_at ? { dueAt: iso(row.due_at) } : {}), ...(row.completed_at ? { completedAt: iso(row.completed_at) } : {}),
    priority: row.priority, payload, ...(row.outcome ? { outcome: object(row.outcome) } : {}),
    ...(workflowRevision(payload) ? { workflowRevision: workflowRevision(payload) } : {}),
    ...(eligibilityEvidence(payload) ? { eligibilityEvidence: eligibilityEvidence(payload) } : {}),
    status: row.status, rowVersion: Number(row.row_version), createdAt: iso(row.created_at), createdBy: row.created_by,
  };
}
function workflowRevision(payload: Readonly<Record<string, unknown>>): WorkItem["workflowRevision"] { const value = payload["workflow_revision"]; if (!value || typeof value !== "object" || Array.isArray(value)) return undefined; const row = value as Record<string, unknown>; return typeof row["definitionCode"] === "string" && typeof row["version"] === "number" && typeof row["artifactHash"] === "string" ? { definitionCode: row["definitionCode"], version: row["version"], artifactHash: row["artifactHash"] } : undefined; }
function eligibilityEvidence(payload: Readonly<Record<string, unknown>>): WorkItem["eligibilityEvidence"] { const value = payload["eligibility_evidence"]; if (!value || typeof value !== "object" || Array.isArray(value)) return undefined; const row = value as Record<string, unknown>; const candidates = Array.isArray(row["candidates"]) ? row["candidates"].filter((item): item is { principalId: string; source: string } => !!item && typeof item === "object" && typeof (item as Record<string, unknown>)["principalId"] === "string" && typeof (item as Record<string, unknown>)["source"] === "string") : []; const strategy = row["strategy"]; return typeof row["resolverVersion"] === "string" && typeof row["resolvedAt"] === "string" && typeof strategy === "string" && ["direct","role","group","hierarchy","fallback","escalation"].includes(strategy) ? { resolverVersion: row["resolverVersion"], resolvedAt: row["resolvedAt"], strategy: strategy as "direct", candidates, fallbackPath: Array.isArray(row["fallbackPath"]) ? row["fallbackPath"].filter((item): item is string => typeof item === "string") : [], ...(typeof row["selectedPrincipalId"] === "string" ? { selectedPrincipalId: row["selectedPrincipalId"] } : {}) } : undefined; }
function requiredRow(row: WorkItemRow | undefined): WorkItemRow { if (!row) throw new Error("Workflow insert did not return a work item"); return row; }
function object(value: unknown): Readonly<Record<string, unknown>> { const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Readonly<Record<string, unknown>> : {}; }
function iso(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function encodeCursor(createdAt: string, id: string): string { return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url"); }
function decodeCursor(value: string): { createdAt: string; id: string } | undefined { try { const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>; return typeof parsed["createdAt"] === "string" && typeof parsed["id"] === "string" ? { createdAt: parsed["createdAt"], id: parsed["id"] } : undefined; } catch { return undefined; } }
