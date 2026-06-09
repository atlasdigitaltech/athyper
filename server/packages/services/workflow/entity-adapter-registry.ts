import type {
  RuntimeEntityAdapter,
  RuntimeSourceMutationContext,
  RuntimeSourceMutationResult,
  WorkflowRuntimeTransaction,
} from "./runtime.types.js";
import { WorkflowRuntimeError } from "./runtime-errors.js";
import {
  ConventionWorkflowSourceEntityAdapter,
  type WorkflowSourceEntityAdapter,
  type WorkflowSourceEntityCompletion,
} from "./source-entity-adapter.js";

export class EntityAdapterRegistry {
  private readonly adapters = new Map<string, RuntimeEntityAdapter>();

  constructor(adapters: Record<string, RuntimeEntityAdapter> = {}) {
    for (const [entityName, adapter] of Object.entries(adapters)) {
      this.register(entityName, adapter);
    }
  }

  register(entityName: string, adapter: RuntimeEntityAdapter): void {
    this.adapters.set(normalizeEntityName(entityName), adapter);
  }

  resolve(entityName: string): RuntimeEntityAdapter {
    const adapter = this.adapters.get(normalizeEntityName(entityName));
    if (!adapter) {
      throw new WorkflowRuntimeError(
        "UNSUPPORTED_ENTITY",
        `Workflow runtime has no entity adapter for '${entityName}'`,
      );
    }
    return adapter;
  }
}

export interface ConventionRuntimeEntityAdapterDeps {
  sourceEntityAdapter?: WorkflowSourceEntityAdapter;
}

interface SubmitForApprovalAdapterConfig {
  entityName: string;
  table: string;
  label: string;
  fromStatus?: string;
  toStatus?: string;
}

class SubmitForApprovalRuntimeEntityAdapter implements RuntimeEntityAdapter, WorkflowSourceEntityAdapter {
  private readonly sourceEntityAdapter: WorkflowSourceEntityAdapter;
  private readonly fromStatus: string;
  private readonly toStatus: string;

  constructor(
    private readonly config: SubmitForApprovalAdapterConfig,
    deps: ConventionRuntimeEntityAdapterDeps = {},
  ) {
    this.sourceEntityAdapter = deps.sourceEntityAdapter ?? new ConventionWorkflowSourceEntityAdapter();
    this.fromStatus = config.fromStatus ?? "draft";
    this.toStatus = config.toStatus ?? "pending_approval";
  }

  get sourceTable(): string {
    return this.config.table;
  }

  async completeWorkflow(
    trx: WorkflowRuntimeTransaction,
    completion: WorkflowSourceEntityCompletion,
  ): Promise<void> {
    await this.sourceEntityAdapter.completeWorkflow(trx, completion);
  }

  async applyOperation(
    trx: WorkflowRuntimeTransaction,
    context: RuntimeSourceMutationContext,
  ): Promise<RuntimeSourceMutationResult> {
    if (normalizeEntityName(context.entityName) !== this.config.entityName) {
      throw new WorkflowRuntimeError("UNSUPPORTED_ENTITY", `Unsupported entity '${context.entityName}'`);
    }
    if (context.operationCode !== "submit") {
      throw new WorkflowRuntimeError(
        "UNSUPPORTED_OPERATION",
        `Unsupported ${this.config.entityName} operation '${context.operationCode}' in workflow runtime`,
      );
    }
    if (context.fromStatus !== this.fromStatus || context.toStatus !== this.toStatus) {
      throw new WorkflowRuntimeError(
        "TRANSITION_DENIED",
        `${this.config.label} submit supports only ${this.fromStatus} to ${this.toStatus}, got ${context.fromStatus} to ${context.toStatus}`,
      );
    }

    const now = new Date();
    const patch: Record<string, unknown> = {
      status: this.toStatus,
      workflow_request_id: context.workflowRequestId ?? null,
      status_changed_at: now,
      status_changed_by: context.actorId,
      updated_at: now,
      updated_by: context.actorId,
    };
    if (context.remarks?.trim()) {
      patch["notes"] = context.remarks;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (trx.updateTable(this.config.table as never) as any)
      .set(patch as never)
      .where("id" as never, "=" as never, context.entityId as never)
      .where("tenant_id" as never, "=" as never, context.tenantId as never)
      .where("status" as never, "=" as never, this.fromStatus as never)
      .returningAll()
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!updated) {
      throw new WorkflowRuntimeError(
        "CONFLICT",
        `${this.config.label} was modified before the runtime could submit it`,
      );
    }

    return { record: updated };
  }
}

export class PurchaseInvoiceRuntimeEntityAdapter extends SubmitForApprovalRuntimeEntityAdapter {
  constructor(deps: ConventionRuntimeEntityAdapterDeps = {}) {
    super({
      entityName: "purchase_invoice",
      table: "document.purchase_invoice",
      label: "Purchase invoice",
    }, deps);
  }
}

export class PaymentEntryRuntimeEntityAdapter extends SubmitForApprovalRuntimeEntityAdapter {
  constructor(deps: ConventionRuntimeEntityAdapterDeps = {}) {
    super({
      entityName: "payment_entry",
      table: "document.payment_entry",
      label: "Payment entry",
    }, deps);
  }
}

export function createDefaultEntityAdapterRegistry(
  deps: ConventionRuntimeEntityAdapterDeps = {},
): EntityAdapterRegistry {
  // Phase 1 intentionally exposes only purchase_invoice. Payment and journal
  // entries need business-specific post-mutation hooks before runtime rollout.
  return new EntityAdapterRegistry({
    purchase_invoice: new PurchaseInvoiceRuntimeEntityAdapter(deps),
  });
}

export function normalizeEntityName(entityName: string): string {
  const trimmed = entityName.trim().replace(/-/g, "_");
  const [, name] = /^document\.(.+)$/i.exec(trimmed) ?? [];
  return (name ?? trimmed).toLowerCase();
}
