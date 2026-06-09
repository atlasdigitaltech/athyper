import { describe, expect, it, vi } from "vitest";
import { createWorkflowLifecycleRuntime } from "../runtime.js";
import { NotImplementedError } from "../runtime-errors.js";
import { EntityAdapterRegistry } from "../entity-adapter-registry.js";
import { makeMockDb } from "../../../test-utils/src/index.js";
import {
  COMPANY_CODE_ID,
  ENTITY_ID,
  ENTITY_ID2,
  PRINCIPAL_ID,
  TENANT_ID,
  WF_REQUEST_ID,
} from "../../../test-utils/src/fixtures.js";
import type { RuntimeEntityAdapter, WorkflowRuntimeFeatureFlags } from "../runtime.types.js";

const LIFECYCLE_INSTANCE_ID = "00000000-0000-0000-0000-00000000li01";
const LIFECYCLE_ID = "00000000-0000-0000-0000-00000000lc01";
const DRAFT_STATE_ID = "00000000-0000-0000-0000-00000000st01";
const PENDING_STATE_ID = "00000000-0000-0000-0000-00000000st02";
const TRANSITION_ID = "00000000-0000-0000-0000-00000000tr01";

function flags(enabled: boolean, entityName = "purchase_invoice"): WorkflowRuntimeFeatureFlags {
  return {
    bulkCheck: vi.fn().mockImplementation(async (codes: string[]) =>
      new Map(codes.map((code) => [
        code,
        code === "workflow_runtime.enabled" || code === `workflow_runtime.entity.${entityName}`
          ? enabled
          : false,
      ]))),
  };
}

function makeRuntime(overrides: {
  tables?: Record<string, unknown[] | unknown>;
  updateResults?: Record<string, unknown[] | unknown>;
  insertResults?: Record<string, unknown[] | unknown>;
  featureFlags?: WorkflowRuntimeFeatureFlags;
  authorize?: ReturnType<typeof vi.fn>;
  gateAssert?: ReturnType<typeof vi.fn>;
  adapterApply?: ReturnType<typeof vi.fn>;
  workflowCreate?: ReturnType<typeof vi.fn>;
} = {}) {
  const db = makeMockDb({
    tables: overrides.tables ?? successTables(),
    updateResults: overrides.updateResults,
    insertResults: overrides.insertResults,
  });
  const authorize = overrides.authorize ?? vi.fn().mockResolvedValue({
    permissionCode: "submit",
    handlerType: "API",
    handlerTarget: "submit",
    isRecordRequired: true,
    isEnabled: true,
  });
  const gateAssert = overrides.gateAssert ?? vi.fn().mockResolvedValue(undefined);
  const adapterApply = overrides.adapterApply ?? vi.fn().mockResolvedValue({
    record: { id: ENTITY_ID, tenant_id: TENANT_ID, status: "pending_approval" },
  });
  const workflowCreate = overrides.workflowCreate ?? vi.fn().mockResolvedValue({
    id: WF_REQUEST_ID,
    isExisting: false,
    status: "pending",
  });
  const adapter: RuntimeEntityAdapter = {
    sourceTable: "document.purchase_invoice",
    applyOperation: adapterApply,
  };
  const registry = new EntityAdapterRegistry({ purchase_invoice: adapter });

  const runtime = createWorkflowLifecycleRuntime({
    db: db as never,
    featureFlags: overrides.featureFlags ?? flags(true),
    operationAuthorizer: { authorize } as never,
    gateEvaluator: { assertAllowed: gateAssert } as never,
    entityAdapterRegistry: registry,
    createWorkflowEngineForDb: () => ({ createRequest: workflowCreate }) as never,
  });

  return { runtime, authorize, gateAssert, adapterApply, workflowCreate };
}

function makeRuntimeWithDefaultAdapters(args: {
  entityName: "purchase_invoice" | "payment_entry";
  entityId: string;
  sourceTable: "document.purchase_invoice" | "document.payment_entry";
  sourceRow: Record<string, unknown>;
  updatedRow: Record<string, unknown>;
}) {
  const db = makeMockDb({
    tables: successTables({
      sourceTable: `${args.sourceTable} as src`,
      sourceRow: args.sourceRow,
    }),
    insertResults: {
      "document.command_log": [{
        id: "cmd-inserted",
        status: "processing",
        result: null,
        error_code: null,
        error_message: null,
      }],
    },
    updateResults: {
      [args.sourceTable]: [args.updatedRow],
    },
  });
  const authorize = vi.fn().mockResolvedValue({
    permissionCode: "submit",
    handlerType: "API",
    handlerTarget: "submit",
    isRecordRequired: true,
    isEnabled: true,
  });
  const gateAssert = vi.fn().mockResolvedValue(undefined);
  const workflowCreate = vi.fn().mockResolvedValue({
    id: WF_REQUEST_ID,
    isExisting: false,
    status: "pending",
  });

  const runtime = createWorkflowLifecycleRuntime({
    db: db as never,
    featureFlags: flags(true, args.entityName),
    operationAuthorizer: { authorize } as never,
    gateEvaluator: { assertAllowed: gateAssert } as never,
    createWorkflowEngineForDb: () => ({ createRequest: workflowCreate }) as never,
  });

  return { runtime, authorize, gateAssert, workflowCreate };
}

function baseCommand() {
  return {
    tenantId: TENANT_ID,
    entityName: "purchase_invoice",
    entityId: ENTITY_ID,
    operationCode: "submit",
    actorId: PRINCIPAL_ID,
    idempotencyKey: "submit-1",
    remarks: "ready",
  };
}

function successTables(overrides: {
  sourceTable?: string;
  sourceRow?: Record<string, unknown>;
} = {}): Record<string, unknown[] | unknown> {
  return {
    "document.command_log as cl": [],
    [overrides.sourceTable ?? "document.purchase_invoice as src"]: [overrides.sourceRow ?? {
      id: ENTITY_ID,
      tenant_id: TENANT_ID,
      status: "draft",
      company_code_id: COMPANY_CODE_ID,
      net_amount: 500,
    }],
    "master.lifecycle_instance as li": [{
      instance_id: LIFECYCLE_INSTANCE_ID,
      lifecycle_id: LIFECYCLE_ID,
      from_state_id: DRAFT_STATE_ID,
      from_state_code: "draft",
    }],
    "control.lifecycle_transition as lt": [{
      transition_id: TRANSITION_ID,
      to_state_id: PENDING_STATE_ID,
      to_state_code: "pending_approval",
      required_operations: null,
      workflow_definition_id: null,
      conditions: null,
      threshold_rules: null,
      resolves_via: null,
    }],
  };
}

function commandLogRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cmd-1",
    status: "processing",
    result: null,
    error_code: null,
    error_message: null,
    ...overrides,
  };
}

function purchaseInvoiceRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ENTITY_ID,
    tenant_id: TENANT_ID,
    status: "draft",
    company_code_id: COMPANY_CODE_ID,
    invoice_number: "PI-1001",
    supplier_invoice_number: "SUP-1001",
    total_amount: 500,
    ...overrides,
  };
}

function paymentEntryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ENTITY_ID2,
    tenant_id: TENANT_ID,
    status: "draft",
    company_code_id: COMPANY_CODE_ID,
    payment_number: "PAY-1001",
    supplier_name: "Acme Supplies",
    payment_amount: 500,
    currency_code: "USD",
    base_currency_code: "USD",
    ...overrides,
  };
}

describe("WorkflowLifecycleRuntime.executeOperation", () => {
  it("returns done command log replay before authorization", async () => {
    const stored = {
      ok: true,
      statusCode: 200,
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      operationCode: "submit",
      workflowRequestId: WF_REQUEST_ID,
    };
    const { runtime, authorize } = makeRuntime({
      tables: {
        "document.command_log as cl": [{
          id: "cmd-1",
          status: "done",
          result: JSON.stringify(stored),
          error_code: null,
          error_message: null,
        }],
      },
      insertResults: {
        "document.command_log": [null],
      },
    });

    const result = await runtime.executeOperation(baseCommand());

    expect(result.ok).toBe(true);
    expect(result.replayed).toBe(true);
    expect(result.workflowRequestId).toBe(WF_REQUEST_ID);
    expect(authorize).not.toHaveBeenCalled();
  });

  it("fails closed when runtime feature flags are disabled", async () => {
    const { runtime, authorize } = makeRuntime({ featureFlags: flags(false) });

    const result = await runtime.executeOperation(baseCommand());

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.error?.code).toBe("FEATURE_FLAG_DISABLED");
    expect(authorize).not.toHaveBeenCalled();
  });

  it("returns a typed error when lifecycle instance is missing", async () => {
    const { runtime } = makeRuntime({
      tables: {
        ...successTables(),
        "master.lifecycle_instance as li": [],
      },
    });

    const result = await runtime.executeOperation(baseCommand());

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
    expect(result.error?.code).toBe("LIFECYCLE_INSTANCE_MISSING");
  });

  it("submits purchase_invoice draft to pending_approval through workflow and adapter", async () => {
    const { runtime, authorize, gateAssert, adapterApply, workflowCreate } = makeRuntime();

    const result = await runtime.executeOperation(baseCommand());

    expect(result.ok).toBe(true);
    expect(result.workflowRequestId).toBe(WF_REQUEST_ID);
    expect(result.lifecycle?.fromState).toBe("draft");
    expect(result.lifecycle?.toState).toBe("pending_approval");
    expect(authorize).toHaveBeenCalledOnce();
    expect(gateAssert).toHaveBeenCalledOnce();
    expect(workflowCreate).toHaveBeenCalledOnce();
    expect(adapterApply).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityName: "purchase_invoice",
      operationCode: "submit",
      fromStatus: "draft",
      toStatus: "pending_approval",
      workflowRequestId: WF_REQUEST_ID,
    }));
  });

  it("allows only the command-log reservation winner to execute concurrent idempotent submits", async () => {
    const { runtime, authorize, gateAssert, adapterApply, workflowCreate } = makeRuntime({
      tables: {
        ...successTables(),
        "document.command_log as cl": [commandLogRow()],
      },
      insertResults: {
        "document.command_log": [
          commandLogRow({ id: "cmd-winner" }),
          null,
        ],
      },
    });

    const [first, second] = await Promise.all([
      runtime.executeOperation(baseCommand()),
      runtime.executeOperation(baseCommand()),
    ]);
    const results = [first, second];

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => result.error?.code === "COMMAND_IN_PROGRESS")).toHaveLength(1);
    expect(authorize).toHaveBeenCalledOnce();
    expect(gateAssert).toHaveBeenCalledOnce();
    expect(workflowCreate).toHaveBeenCalledOnce();
    expect(adapterApply).toHaveBeenCalledOnce();
  });

  it("submits purchase_invoice with real adapter setup", async () => {
    const sourceRow = purchaseInvoiceRow();
    const updatedRow = purchaseInvoiceRow({
      status: "pending_approval",
      workflow_request_id: WF_REQUEST_ID,
      status_changed_by: PRINCIPAL_ID,
      updated_by: PRINCIPAL_ID,
    });
    const { runtime, authorize, workflowCreate } = makeRuntimeWithDefaultAdapters({
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      sourceTable: "document.purchase_invoice",
      sourceRow,
      updatedRow,
    });

    const result = await runtime.executeOperation(baseCommand());

    expect(result.ok).toBe(true);
    expect(result.entityName).toBe("purchase_invoice");
    expect(result.record?.status).toBe("pending_approval");
    expect(result.record?.workflow_request_id).toBe(WF_REQUEST_ID);
    expect(result.lifecycle?.fromState).toBe("draft");
    expect(result.lifecycle?.toState).toBe("pending_approval");
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      operationCode: "submit",
    }));
    expect(workflowCreate).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "purchase_invoice",
      entityId: ENTITY_ID,
      companyCodeId: COMPANY_CODE_ID,
    }));
  });

  it("keeps payment_entry outside the Phase 1 default runtime surface", async () => {
    const sourceRow = paymentEntryRow();
    const updatedRow = paymentEntryRow({
      status: "pending_approval",
      workflow_request_id: WF_REQUEST_ID,
      status_changed_by: PRINCIPAL_ID,
      updated_by: PRINCIPAL_ID,
    });
    const { runtime, authorize, workflowCreate } = makeRuntimeWithDefaultAdapters({
      entityName: "payment_entry",
      entityId: ENTITY_ID2,
      sourceTable: "document.payment_entry",
      sourceRow,
      updatedRow,
    });

    const result = await runtime.executeOperation({
      tenantId: TENANT_ID,
      entityName: "payment_entry",
      entityId: ENTITY_ID2,
      operationCode: "submit_for_approval",
      actorId: PRINCIPAL_ID,
      idempotencyKey: "payment-submit-1",
      remarks: "payment ready",
    });

    expect(result.ok).toBe(false);
    expect(result.entityName).toBe("payment_entry");
    expect(result.operationCode).toBe("submit");
    expect(result.statusCode).toBe(422);
    expect(result.error?.code).toBe("UNSUPPORTED_ENTITY");
    expect(authorize).not.toHaveBeenCalled();
    expect(workflowCreate).not.toHaveBeenCalled();
  });
});

describe("WorkflowLifecycleRuntime Phase 1 stubs", () => {
  it("throws typed NotImplementedError for deferred methods", async () => {
    const { runtime } = makeRuntime();

    await expect(runtime.submitWorkflow({
      tenantId: TENANT_ID,
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      actorId: PRINCIPAL_ID,
    })).rejects.toBeInstanceOf(NotImplementedError);

    await expect(runtime.processWorkItemAction({
      tenantId: TENANT_ID,
      workItemId: "00000000-0000-0000-0000-000000000001",
      actorId: PRINCIPAL_ID,
      action: "approve",
    })).rejects.toBeInstanceOf(NotImplementedError);

    await expect(runtime.evaluateTimerTick({
      tenantId: TENANT_ID,
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
    })).rejects.toBeInstanceOf(NotImplementedError);
  });
});
