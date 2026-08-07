import type { Transaction } from "kysely";
import { emitOutboxEvent } from "@athyper/svc-shared";

export interface WorkflowSourceEntityCompletion {
  tenantId: string;
  workflowRequestId: string;
  entityType: string;
  entityId: string;
  outcome: "approved" | "rejected" | "returned";
  actorId: string;
}

export interface WorkflowSourceEntityAdapter {
  completeWorkflow(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    completion: WorkflowSourceEntityCompletion,
  ): Promise<void>;
  postMutationHook?(
    command: unknown,
    result: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
  ): Promise<void>;
}

interface EntityCompletionConfig {
  table: string;
  hasWorkflowRequestId: boolean;
  hasApprovalStamp: boolean;
}

export interface WorkflowSourceEntityCompletionHooks {
  beforeComplete?(
    trx: Transaction<any>,
    completion: WorkflowSourceEntityCompletion,
    targetStatus: string,
  ): Promise<void>;
  afterComplete?(
    trx: Transaction<any>,
    completion: WorkflowSourceEntityCompletion,
    targetStatus: string,
  ): Promise<void>;
}

const DOCUMENT_ENTITY_COMPLETION: Record<string, EntityCompletionConfig> = {
  purchase_invoice: {
    table: "document.purchase_invoice",
    hasWorkflowRequestId: true,
    hasApprovalStamp: true,
  },
  purchase_order: {
    table: "document.commitment",
    hasWorkflowRequestId: true,
    // The ORDER_APPROVAL lifecycle hook owns approval stamping together with
    // schedule materialization and budget commit.
    hasApprovalStamp: false,
  },
  payment_entry: {
    table: "document.payment_entry",
    hasWorkflowRequestId: true,
    hasApprovalStamp: true,
  },
  journal_entry: {
    table: "document.journal_entry",
    hasWorkflowRequestId: false,
    hasApprovalStamp: false,
  },
};

export class ConventionWorkflowSourceEntityAdapter implements WorkflowSourceEntityAdapter {
  constructor(
    private readonly logger?: {
      warn?(event: string, fields?: Record<string, unknown>): void;
      info?(event: string, fields?: Record<string, unknown>): void;
    },
    private readonly hooks: WorkflowSourceEntityCompletionHooks = {},
  ) {}

  async completeWorkflow(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    completion: WorkflowSourceEntityCompletion,
  ): Promise<void> {
    const entityName = normaliseDocumentEntityName(completion.entityType);
    const config = DOCUMENT_ENTITY_COMPLETION[entityName];

    if (!config) {
      this.logger?.warn?.("workflow_source_entity_completion_skipped", {
        entityType: completion.entityType,
        entityId: completion.entityId,
        workflowRequestId: completion.workflowRequestId,
      });
      return;
    }

    const now = new Date();
    const targetStatus = completion.outcome === "approved"
      ? "approved"
      : completion.outcome === "returned" ? "draft" : "rejected";
    await this.hooks.beforeComplete?.(trx, completion, targetStatus);
    const patch: Record<string, unknown> = {
      status: targetStatus,
      status_changed_at: now,
      status_changed_by: completion.actorId,
      updated_at: now,
      updated_by: completion.actorId,
    };

    if (config.hasWorkflowRequestId) {
      patch["workflow_request_id"] = completion.workflowRequestId;
    }

    if (config.hasApprovalStamp && completion.outcome === "approved") {
      patch["approved_at"] = now;
      patch["approved_by"] = completion.actorId;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (trx.updateTable(config.table as never) as any)
      .set(patch as never)
      .where("id", "=", completion.entityId)
      .where("tenant_id", "=", completion.tenantId)
      .where("status", "=", "pending_approval")
      .executeTakeFirst();

    if (result) await this.hooks.afterComplete?.(trx, completion, targetStatus);

    if (result && entityName === "purchase_order") {
      await emitOutboxEvent(trx, {
        tenantId: completion.tenantId,
        topic: "purchase_order.lifecycle",
        eventType: `purchase_order.${completion.outcome}`,
        eventKey: `purchase_order.${completion.outcome}:${completion.entityId}:${completion.workflowRequestId}`,
        entityType: "purchase_order",
        entityId: completion.entityId,
        aggregateType: "commitment",
        aggregateId: completion.entityId,
        actorId: completion.actorId,
        payload: {
          public_entity_type: "purchase_order",
          aggregate_root_type: "commitment",
          commitment_type: "purchase_order",
          aggregate_root_id: completion.entityId,
          workflow_request_id: completion.workflowRequestId,
          outcome: completion.outcome,
        },
      });
    }
  }
}

function normaliseDocumentEntityName(entityType: string): string {
  const trimmed = entityType.trim();
  const [, name] = /^document\.(.+)$/i.exec(trimmed) ?? [];
  return (name ?? trimmed).toLowerCase();
}
