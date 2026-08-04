/**
 * Active-approver visibility predicate.
 *
 * Answers: "given a tenant + principal + record, is this principal currently
 * able to act on the record's active workflow step?"
 *
 * Three paths qualify:
 *   1. Direct principal assignee on a pending work_item for the record's
 *      active workflow_request.
 *   2. Member of an assigned group (assignee_group_id) on such a work_item.
 *   3. Holder of an active delegation (workflow / entity / task scope) from
 *      one of the work_item's direct assignees.
 *
 * Used by the entity-operations API to gate workflow_task operations
 * (approve / deny / request_info) so they render only for the actual
 * approver — not anyone holding the workflow.approve permission.
 *
 * Three sequential queries instead of one EXISTS-tree so the mock-db
 * harness can test each branch in isolation (matches the pattern in
 * WorkflowEngine#processAction).
 */

import type { Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

const ACTIVE_WORK_ITEM_STATUSES = ["pending", "assigned", "in_progress"] as const;
const ACTIVE_REQUEST_STATUSES   = ["pending", "in_progress"] as const;
export interface IsActiveApproverForParams {
  db: AnyDb;
  tenantId: string;
  principalId: string;
  /** Canonical entity code, e.g. "purchase_invoice". */
  entityCode: string;
  recordId: string;
}

interface ActiveWorkItemRow {
  id: string;
  assignee_id: string | null;
  assignee_group_id: string | null;
}

export async function isActiveApproverFor(params: IsActiveApproverForParams): Promise<boolean> {
  const { db, tenantId, principalId, entityCode, recordId } = params;

  // 1) Fetch the active work_items for this record's currently-active request.
  //    Empty result = no live workflow → not an approver.
  const items = (await db
    .selectFrom("event.work_item as wi")
    .innerJoin(
      "document.workflow_request as wr",
      "wr.id",
      "wi.workflow_request_id",
    )
    .select([
      "wi.id",
      "wi.assignee_id",
      "wi.assignee_group_id",
    ])
    .where("wi.tenant_id", "=", tenantId)
    .where("wi.status", "in", ACTIVE_WORK_ITEM_STATUSES)
    .where("wr.tenant_id", "=", tenantId)
    .where("wr.entity_type", "=", entityCode)
    .where("wr.entity_id", "=", recordId)
    .where("wr.status", "in", ACTIVE_REQUEST_STATUSES)
    .execute()) as ActiveWorkItemRow[];

  if (items.length === 0) return false;

  // 2) Direct principal match — cheapest check, runs in-memory.
  if (items.some((wi) => wi.assignee_id === principalId)) return true;

  // 3) Group membership match — only query if a work_item is group-assigned.
  const groupIds = items
    .map((wi) => wi.assignee_group_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (groupIds.length > 0) {
    const groupHit = await db
      .selectFrom("master.auth_current_group_member_v as agm")
      .select("agm.group_id")
      .where("agm.tenant_id", "=", tenantId)
      .where("agm.principal_id", "=", principalId)
      .where("agm.group_id", "in", groupIds)
      .limit(1)
      .executeTakeFirst();
    if (groupHit) return true;
  }

  // 4) Active delegation match — principal is delegate; work_item assignee is delegator.
  const assigneeIds = items
    .map((wi) => wi.assignee_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (assigneeIds.length > 0) {
    const delegationHit = await db
      .selectFrom("master.auth_delegation as dg")
      .select("dg.id")
      .where("dg.tenant_id", "=", tenantId)
      .where("dg.delegate_id", "=", principalId)
      .where("dg.delegator_id", "in", assigneeIds)
      .where("dg.status", "=", "active")
      .where("dg.effective_from", "<=", new Date())
      .where("dg.effective_until", ">", new Date())
      .limit(1)
      .executeTakeFirst();
    if (delegationHit) return true;
  }

  return false;
}
