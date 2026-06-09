import type { Transaction } from "kysely";

export interface WorkflowSourceEntityCompletion {
  tenantId: string;
  workflowRequestId: string;
  entityType: string;
  entityId: string;
  outcome: "approved" | "rejected";
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

const DOCUMENT_ENTITY_COMPLETION: Record<string, EntityCompletionConfig> = {
  purchase_invoice: {
    table: "document.purchase_invoice",
    hasWorkflowRequestId: true,
    hasApprovalStamp: true,
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
    const patch: Record<string, unknown> = {
      status: completion.outcome === "approved" ? "approved" : "rejected",
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
    await (trx.updateTable(config.table as never) as any)
      .set(patch as never)
      .where("id", "=", completion.entityId)
      .where("tenant_id", "=", completion.tenantId)
      .where("status", "=", "pending_approval")
      .execute();
  }
}

function normaliseDocumentEntityName(entityType: string): string {
  const trimmed = entityType.trim();
  const [, name] = /^document\.(.+)$/i.exec(trimmed) ?? [];
  return (name ?? trimmed).toLowerCase();
}
