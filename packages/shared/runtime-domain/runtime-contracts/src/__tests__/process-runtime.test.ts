import { describe, expect, it } from "vitest";

import {
  compileMetaEntityRuntimeDescriptor,
  createRuntimeOperationExecutor,
  resolveLifecycleRuntime,
  resolveRuntimeOperations,
  type CompiledMetaEntityInput,
  type MetaEntityRuntimeDescriptor,
  type ProcessRuntimeState,
} from "../index";

const ENTITY: CompiledMetaEntityInput = {
  entity_code: "purchase_invoice",
  entity_name: "Purchase Invoice",
  entity_class: "DOCUMENT",
  table_schema: "document",
  table_name: "purchase_invoice",
  document_runtime_plan: {
    source: "compiled_v6",
    schemaVersion: "document-edit-runtime/v6.0",
    planVersion: "entity-process-test-v1",
    planHash: "process-plan-v1",
    archetype: "header_only",
    nodes: [{ key: "header", kind: "core", versionSource: "document" }],
    invalidationActions: [{
      source: { type: "operation", key: "*" },
      targets: [{ node: "header", action: "patch" }],
    }],
  },
  fields: [
    { name: "id", label: "ID", data_type: "uuid" },
    { name: "status", label: "Status", data_type: "text" },
  ],
  display_config: {},
  feature_flags: {},
};

function descriptor(): MetaEntityRuntimeDescriptor {
  return compileMetaEntityRuntimeDescriptor(ENTITY, {
    lifecycle: {
      enabled: true,
      lifecycleCode: "purchase_invoice",
      states: ["draft", "submitted", "approved", "posted"],
      terminalStates: ["posted"],
      transitions: ["submit", "approve", "post"],
    },
    workflow: {
      enabled: true,
      workflowCode: "purchase_invoice_approval",
      templateCode: "standard",
      stages: ["review", "approval"],
    },
    operations: [
      {
        id: "op-submit",
        permission_code: "purchase_invoice.submit",
        surface: "DETAIL",
        handler_type: "API",
        action_group: "lifecycle",
        lifecycle_transitions: [
          { from_state: "draft", to_state: "submitted", transition_id: "tr-submit" },
        ],
      },
      {
        id: "op-approve",
        permission_code: "purchase_invoice.approve",
        surface: "DETAIL",
        handler_type: "API",
        action_group: "lifecycle",
        lifecycle_transitions: [
          { from_state: "submitted", to_state: "approved", transition_id: "tr-approve" },
        ],
      },
      {
        id: "op-cancel",
        permission_code: "purchase_invoice.cancel",
        surface: "DETAIL",
        handler_type: "API",
      },
      {
        id: "op-workflow-approve",
        permission_code: "purchase_invoice.workflow_approve",
        surface: "DETAIL",
        handler_type: "API",
        action_group: "workflow_task",
        source: "workflow_task",
      },
    ],
  });
}

describe("process runtime helpers", () => {
  it("falls back to record status when lifecycle_instance state is absent", () => {
    const runtime = resolveLifecycleRuntime({
      descriptor: descriptor(),
      record: { id: "pi-1", data: { status: "draft" } },
    });

    expect(runtime).toMatchObject({
      currentState: "draft",
      source: "record_status",
      terminal: false,
    });
  });

  it("treats lifecycle_instance state as authoritative and exposes drift", () => {
    const processState: ProcessRuntimeState = {
      entityCode: "purchase_invoice",
      recordId: "pi-1",
      lifecycle: {
        currentState: "submitted",
        source: "lifecycle_instance",
        allowedTransitions: ["approve"],
        terminal: false,
      },
    };

    const runtime = resolveLifecycleRuntime({
      descriptor: descriptor(),
      record: { id: "pi-1", data: { status: "draft" } },
      processState,
    });

    expect(runtime.currentState).toBe("submitted");
    expect(runtime.source).toBe("lifecycle_instance");
    expect(runtime.drift).toEqual({
      lifecycleInstanceState: "submitted",
      recordStatus: "draft",
    });
  });

  it("keeps record transition validity separate from principal permissions", () => {
    const operations = resolveRuntimeOperations({
      descriptor: descriptor(),
      record: { id: "pi-1", data: { status: "draft" } },
      processState: {
        entityCode: "purchase_invoice",
        recordId: "pi-1",
        lifecycle: {
          currentState: "draft",
          source: "record_status",
          allowedTransitions: ["submit"],
          terminal: false,
        },
      },
      mode: "detail",
      permissions: ["purchase_invoice.submit"],
      enforcePermissions: true,
      includeWorkflowTaskOperations: true,
    });

    const submit = operations.find((item) => item.operation.permissionCode === "purchase_invoice.submit");
    const approve = operations.find((item) => item.operation.permissionCode === "purchase_invoice.approve");
    const cancel = operations.find((item) => item.operation.permissionCode === "purchase_invoice.cancel");

    expect(submit?.enabled).toBe(true);
    expect(approve?.disabledReason?.code).toBe("wrong_state");
    expect(cancel?.disabledReason?.code).toBe("missing_permission");
  });

  it("filters workflow task actions against caller-visible userTaskActions", () => {
    const withoutAssignment = resolveRuntimeOperations({
      descriptor: descriptor(),
      record: { id: "pi-1", data: { status: "submitted" } },
      processState: {
        entityCode: "purchase_invoice",
        recordId: "pi-1",
        workflow: {
          requestId: "wr-1",
          currentStage: "approval",
          pendingTasks: 0,
          userTaskActions: [],
        },
      },
      mode: "detail",
      includeWorkflowTaskOperations: true,
    });

    const assigned = resolveRuntimeOperations({
      descriptor: descriptor(),
      record: { id: "pi-1", data: { status: "submitted" } },
      processState: {
        entityCode: "purchase_invoice",
        recordId: "pi-1",
        workflow: {
          requestId: "wr-1",
          currentStage: "approval",
          pendingTasks: 1,
          userTaskActions: ["workflow_approve"],
        },
      },
      mode: "detail",
      includeWorkflowTaskOperations: true,
    });

    expect(withoutAssignment.find((item) => item.operation.permissionCode === "purchase_invoice.workflow_approve")
      ?.disabledReason?.code).toBe("workflow_task_not_assigned");
    expect(assigned.find((item) => item.operation.permissionCode === "purchase_invoice.workflow_approve")
      ?.enabled).toBe(true);
  });

  it("validates through the shared resolver before invoking an operation handler", async () => {
    const runtimeDescriptor = descriptor();
    let called = false;
    const executor = createRuntimeOperationExecutor({
      loadDescriptor: async () => runtimeDescriptor,
      loadRecord: async () => ({ id: "pi-1", data: { status: "draft" } }),
      fetchProcessState: async () => ({
        entityCode: "purchase_invoice",
        recordId: "pi-1",
        lifecycle: {
          currentState: "draft",
          source: "record_status",
          allowedTransitions: ["submit"],
          terminal: false,
        },
      }),
      handlers: [{
        canHandle: () => true,
        execute: async () => {
          called = true;
          return {};
        },
      }],
    });

    const result = await executor.run(
      {
        entityCode: "purchase_invoice",
        recordId: "pi-1",
        operationCode: "purchase_invoice.approve",
      },
      { permissions: ["purchase_invoice.approve"] },
    );

    expect(called).toBe(false);
    expect(result.errors?.[0]).toMatchObject({
      code: "wrong_state",
    });
  });
});
