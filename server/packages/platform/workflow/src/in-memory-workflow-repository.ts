import { randomUUID } from "node:crypto";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { WorkflowRepository, WorkItem, WorkItemListResult } from "@athyper/server-contract-workflow";

export interface InMemoryWorkflowTransaction { readonly items: Map<string, WorkItem>; }

export function createInMemoryWorkflowPersistence(options: { readonly now?: () => Date; readonly createId?: () => string } = {}): {
  readonly repository: WorkflowRepository<InMemoryWorkflowTransaction>;
  readonly transactions: PlaneTransactionCoordinator<InMemoryWorkflowTransaction>;
} {
  let committed = new Map<string, WorkItem>();
  const now = () => (options.now?.() ?? new Date()).toISOString();
  const repository: WorkflowRepository<InMemoryWorkflowTransaction> = {
    async create({ command }, transaction) {
      const item: WorkItem = {
        id: options.createId?.() ?? randomUUID(), tenantId: command.context.tenantId,
        workTypeCode: command.workTypeCode, title: command.title.trim(),
        ...(command.description ? { description: command.description } : {}),
        sourceEntityCode: command.sourceEntityCode, sourceEntityId: command.sourceEntityId,
        ...(command.sourceActionCode ? { sourceActionCode: command.sourceActionCode } : {}),
        ...(command.assigneePrincipalId ? { assigneePrincipalId: command.assigneePrincipalId } : {}),
        ...(command.assigneeTeamId ? { assigneeTeamId: command.assigneeTeamId } : {}),
        availableAt: command.availableAt ?? now(), ...(command.dueAt ? { dueAt: command.dueAt } : {}),
        priority: command.priority ?? "normal", payload: { ...(command.payload ?? {}), ...(command.idempotencyKey ? { idempotency_key: command.idempotencyKey } : {}) },
        status: "open", rowVersion: 1,
        ...(isRevision(command.payload?.["workflow_revision"]) ? { workflowRevision: command.payload["workflow_revision"] } : {}),
        ...(isEvidence(command.payload?.["eligibility_evidence"]) ? { eligibilityEvidence: command.payload["eligibility_evidence"] } : {}),
        createdAt: now(), createdBy: command.context.principalId,
      };
      transaction.items.set(item.id, item);
      return item;
    },
    async listInbox(query, transaction): Promise<WorkItemListResult> {
      const statuses = new Set(query.statuses ?? ["open", "claimed", "in_progress", "blocked"]);
      const after = query.cursor ? decodeCursor(query.cursor) : undefined;
      const eligible=[...transaction.items.values()].filter((item) => item.tenantId === query.context.tenantId && statuses.has(item.status)
          && (item.assigneePrincipalId === query.context.principalId || item.claimantPrincipalId === query.context.principalId));
      const data = eligible
        .filter((item) => !after || `${item.createdAt}|${item.id}` < after)
        .sort((left, right) => `${right.createdAt}|${right.id}`.localeCompare(`${left.createdAt}|${left.id}`))
        .slice(0, query.limit ?? 50);
      const last = data.at(-1);
      return { data,totalCount:eligible.length, ...(last && data.length === (query.limit ?? 50) ? { nextCursor: encodeCursor(`${last.createdAt}|${last.id}`) } : {}) };
    },
    async get(tenantId, workItemId, transaction) {
      const item = transaction.items.get(workItemId);
      return item?.tenantId === tenantId ? item : null;
    },
    async action(tenantId, workItemId, principalId, action, expectedRowVersion, outcome, transaction) {
      const item = transaction.items.get(workItemId);
      if (!item || item.tenantId !== tenantId || item.rowVersion !== expectedRowVersion) return null;
      const eligible = item.assigneePrincipalId === principalId || item.claimantPrincipalId === principalId
        || item.eligibilityEvidence?.candidates.some((candidate) => candidate.principalId === principalId);
      if (!eligible) return null;
      let updated: WorkItem;
      if (action === "claim" && item.status === "open" && Date.parse(item.availableAt) <= Date.now()) updated = { ...item, status: "claimed", claimantPrincipalId: principalId, claimedAt: now(), rowVersion: item.rowVersion + 1 };
      else if ((action === "complete" || action === "approve" || action === "reject") && ["claimed", "in_progress", "open"].includes(item.status)) updated = { ...item, status: "completed", completedAt: now(), outcome: { ...outcome, action }, rowVersion: item.rowVersion + 1 };
      else if (action === "cancel" && !["completed", "cancelled"].includes(item.status)) updated = { ...item, status: "cancelled", rowVersion: item.rowVersion + 1 };
      else return null;
      transaction.items.set(item.id, updated);
      return updated;
    },
  };
  return {
    repository,
    transactions: {
      async run(_planeKey, _actor, work) {
        const transaction = { items: new Map([...committed].map(([id, item]) => [id, structuredClone(item)])) };
        const result = await work(transaction);
        committed = transaction.items;
        return result;
      },
    },
  };
}

function isRevision(value: unknown): value is NonNullable<WorkItem["workflowRevision"]> { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const row = value as Record<string, unknown>; return typeof row["definitionCode"] === "string" && typeof row["version"] === "number" && typeof row["artifactHash"] === "string"; }
function isEvidence(value: unknown): value is NonNullable<WorkItem["eligibilityEvidence"]> { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const row = value as Record<string, unknown>; return typeof row["resolverVersion"] === "string" && typeof row["resolvedAt"] === "string" && Array.isArray(row["candidates"]) && Array.isArray(row["fallbackPath"]); }

function encodeCursor(value: string): string { return Buffer.from(value, "utf8").toString("base64url"); }
function decodeCursor(value: string): string { try { return Buffer.from(value, "base64url").toString("utf8"); } catch { return ""; } }
