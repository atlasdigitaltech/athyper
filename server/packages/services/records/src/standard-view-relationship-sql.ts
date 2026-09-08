import { sql, type RawBuilder } from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { StandardViewRelationshipConstraint } from "@athyper/server-contract-records";
import { workItemActionableSql } from "@athyper/server-platform-workflow";

/** Registered relationships only. All authored values remain SQL parameters. */
export function compileStandardViewRelationship(descriptor: EntityRuntimeDescriptor, tenantId: string, constraint: StandardViewRelationshipConstraint): RawBuilder<unknown> {
 const storage = descriptor.storage;
 if (!storage.tenantField) throw new Error("Relationship views require tenant-scoped records");
 const root = (column: string) => sql.ref(`${storage.object}.${column}`);
 if (constraint.kind === "workflow.actionable_documents.v1") {
  if (!constraint.workflowKeys.length || !constraint.workTypeCodes.length) return sql`FALSE`;
  const workflow = constraint.link === "workflow_request" ? sql`EXISTS (
   SELECT 1 FROM document.workflow_request view_request
   WHERE view_request.tenant_id = view_task.tenant_id
    AND view_request.id::text = COALESCE(view_task.payload->>'workflow_request_id', view_task.payload->>'workflowRequestId')
    AND view_request.entity_type = ${constraint.sourceEntityCode}
    AND view_request.entity_id = view_task.source_entity_id::text
    AND view_request.definition_code IN (${sql.join(constraint.workflowKeys)})
    AND view_request.workflow_type = 'approval' AND view_request.status = 'pending'
  )` : constraint.link === "work_item_revision" ? sql`view_task.payload->'workflow_revision'->>'definitionCode' IN (${sql.join(constraint.workflowKeys)})` : sql`FALSE`;
  return sql`EXISTS (
   SELECT 1 FROM document.work_item view_task
   WHERE view_task.tenant_id = ${tenantId}::uuid AND view_task.tenant_id = ${root(storage.tenantField)}
    AND view_task.source_entity_code = ${constraint.sourceEntityCode}
    AND view_task.source_entity_id = ${root(storage.idField)}
    AND view_task.work_type_code IN (${sql.join(constraint.workTypeCodes)})
    AND ${workItemActionableSql(constraint.principalId, "view_task")}
    AND ${workflow}
  )`;
 }
 if (constraint.kind === "document.case_requests.v1") {
  if (storage.schema !== "document" || storage.object !== "entity_case" || storage.idField !== "id" || storage.tenantField !== "tenant_id") throw new Error("Request relationship requires the registered entity-case collection");
  const conditions: RawBuilder<unknown>[] = [];
  // Creation/submission command evidence is explicit request participation, not master-record ownership.
  if (constraint.principalId) conditions.push(sql`EXISTS (
   SELECT 1 FROM document.entity_case_command_evidence view_submission
   WHERE view_submission.tenant_id = ${tenantId}::uuid AND view_submission.tenant_id = ${root(storage.tenantField)}
    AND view_submission.entity_case_id = ${root(storage.idField)}
    AND (view_submission.command_code = 'entity.case.submit' OR (view_submission.command_code = 'entity.case.draft.write' AND view_submission.before_version = 0))
    AND view_submission.outcome = 'accepted'
    AND view_submission.recorded_by = ${constraint.principalId}::uuid
  )`);
  if (constraint.operationCodes) conditions.push(constraint.operationCodes.length ? sql`${root('operation_code')} IN (${sql.join(constraint.operationCodes)})` : sql`FALSE`);
  if (constraint.role) {
   if (!["requestedRole","roleCode"].includes(constraint.role.field)) throw new Error("Unregistered request role field");
   conditions.push(constraint.role.values.length ? sql`EXISTS (
    SELECT 1 FROM snapshot.entity_snapshot view_snapshot
    WHERE view_snapshot.tenant_id = ${tenantId}::uuid AND view_snapshot.tenant_id = ${root(storage.tenantField)}
     AND view_snapshot.snapshot_id = ${root('current_snapshot_id')}
     AND view_snapshot.payload_json->>${constraint.role.field} IN (${sql.join(constraint.role.values)})
   )` : sql`FALSE`);
  }
  return conditions.length ? sql`(${sql.join(conditions,sql` AND `)})` : sql`FALSE`;
 }
 throw new Error("Unregistered standard-view relationship");
}
