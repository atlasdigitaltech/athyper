import type { CommandExecutionStore } from "@athyper/server-contract-events";
import { decodeInboxCursor, encodeInboxCursor } from "./inbox-cursor.js";
import { parseInstant } from "@athyper/platform-temporal";
import { randomUUID } from "node:crypto";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { WorkflowRepository, WorkItem, WorkItemListResult, WorkItemActionResult } from "@athyper/server-contract-workflow";

interface Receipt { id: string; fingerprint: string; result?: WorkItemActionResult; }
export interface InMemoryWorkflowTransaction { readonly items: Map<string, WorkItem>; readonly receipts: Map<string, Receipt>; }

export function createInMemoryWorkflowPersistence(options: { readonly now?: () => Date; readonly createId?: () => string; readonly teamMembers?: readonly { tenantId: string; teamId: string; principalId: string; joinedAt: string; leftAt?: string }[] } = {}): {
  readonly repository: WorkflowRepository<InMemoryWorkflowTransaction>;
  readonly commandExecutions: CommandExecutionStore<InMemoryWorkflowTransaction, WorkItemActionResult>;
  readonly transactions: PlaneTransactionCoordinator<InMemoryWorkflowTransaction>;
} {
  let committed = new Map<string, WorkItem>();
  let receipts = new Map<string, Receipt>();
  let pending = Promise.resolve();
  const now = () => (options.now?.() ?? new Date()).toISOString();
  const teamMember = (item: WorkItem, principalId: string) => options.teamMembers?.some(member => member.tenantId === item.tenantId && member.teamId === item.assigneeTeamId && member.principalId === principalId && parseInstant(member.joinedAt) <= parseInstant(now()) && (!member.leftAt || parseInstant(member.leftAt) > parseInstant(now()))) ?? false;
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
      const after = query.cursor ? decodeInboxCursor(query.cursor) : undefined;
      const eligible=[...transaction.items.values()].filter((item) => item.tenantId === query.context.tenantId && statuses.has(item.status)
          && (item.assigneePrincipalId === query.context.principalId || item.claimantPrincipalId === query.context.principalId
            || (!item.claimantPrincipalId && (teamMember(item, query.context.principalId) || item.eligibilityEvidence?.candidates.some(candidate => candidate.principalId === query.context.principalId)))));
      const page = eligible
        .filter((item) => !after || `${item.createdAt}|${item.id}` < `${after.createdAt}|${after.id}`)
        .sort((left, right) => `${right.createdAt}|${right.id}`.localeCompare(`${left.createdAt}|${left.id}`))
        .slice(0, (query.limit ?? 50) + 1);
      const data = page.slice(0, query.limit ?? 50);
      const last = data.at(-1);
      return { data,totalCount:eligible.length, ...(last && page.length > data.length ? { nextCursor: encodeInboxCursor(last.createdAt, last.id) } : {}) };
    },
    async get(tenantId, workItemId, transaction) {
      const item = transaction.items.get(workItemId);
      return item?.tenantId === tenantId ? item : null;
    },
    async action(tenantId, workItemId, principalId, action, expectedRowVersion, outcome, transaction) {
      const item = transaction.items.get(workItemId);
      if (!item || item.tenantId !== tenantId || item.rowVersion !== expectedRowVersion) return null;
      const eligible = item.assigneePrincipalId === principalId || item.claimantPrincipalId === principalId
        || teamMember(item, principalId) || item.eligibilityEvidence?.candidates.some((candidate) => candidate.principalId === principalId);
      if (!eligible || (item.claimantPrincipalId && item.claimantPrincipalId !== principalId)) return null;
      let updated: WorkItem;
      if (action === "claim" && item.status === "open" && parseInstant(item.availableAt) <= parseInstant(now())) updated = { ...item, status: "claimed", claimantPrincipalId: principalId, claimedAt: now(), rowVersion: item.rowVersion + 1 };
      else if ((action === "complete" || action === "approve" || action === "reject") && ["claimed", "in_progress", "open"].includes(item.status) && parseInstant(item.availableAt) <= parseInstant(now())) updated = { ...item, status: "completed", completedAt: now(), outcome: { ...outcome, action }, rowVersion: item.rowVersion + 1 };
      else if (action === "cancel" && !["completed", "cancelled"].includes(item.status)) updated = { ...item, status: "cancelled", rowVersion: item.rowVersion + 1 };
      else return null;
      transaction.items.set(item.id, updated);
      return updated;
    },
  };
  return {
    repository,
    commandExecutions: {
      async begin(input, transaction) {
        const key = JSON.stringify([input.tenantId, input.commandCode, input.idempotencyKey]);
        const receipt = transaction.receipts.get(key);
        if (receipt) {
          if (receipt.fingerprint !== input.requestFingerprint) return { kind: "conflict" };
          return receipt.result ? { kind: "replay", result: structuredClone(receipt.result) } : { kind: "in_progress" };
        }
        const id = randomUUID();
        transaction.receipts.set(key, { id, fingerprint: input.requestFingerprint });
        return { kind: "started", executionId: id };
      },
      async complete(id, result, _actor, transaction) {
        const receipt = [...transaction.receipts.values()].find(receipt => receipt.id === id);
        if (!receipt) throw new Error("Missing workflow command receipt");
        receipt.result = structuredClone(result);
      },
    },
    transactions: {
      async run(_planeKey, _actor, work) {
        const previous = pending;
        let release!: () => void;
        pending = new Promise<void>(resolve => { release = resolve; });
        await previous;
        try {
          const transaction = { items: structuredClone(committed), receipts: structuredClone(receipts) };
          const result = await work(transaction);
          committed = transaction.items;
          receipts = transaction.receipts;
          return result;
        } finally { release(); }
      },
    },
  };
}

function isRevision(value: unknown): value is NonNullable<WorkItem["workflowRevision"]> { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const row = value as Record<string, unknown>; return typeof row["definitionCode"] === "string" && typeof row["version"] === "number" && typeof row["artifactHash"] === "string"; }
function isEvidence(value: unknown): value is NonNullable<WorkItem["eligibilityEvidence"]> { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const row = value as Record<string, unknown>; return typeof row["resolverVersion"] === "string" && typeof row["resolvedAt"] === "string" && Array.isArray(row["candidates"]) && Array.isArray(row["fallbackPath"]); }
