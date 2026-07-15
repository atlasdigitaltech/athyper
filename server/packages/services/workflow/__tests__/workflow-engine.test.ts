/**
 * WorkflowEngine — unit tests.
 *
 * All DB calls are mocked via makeMockDb. No real database is required.
 * Tests cover the four critical paths:
 *   - shouldRequireWorkflow:  definition matching + JSONLogic condition evaluation
 *   - createRequest:          idempotency guard, missing template, happy path
 *   - processAction:          authorization, delegation, approve/reject, self-approval block
 *   - evaluateQuorum (via processAction): unanimous, count, percent strategies
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkflowEngine } from "../engine.js";
import { makeMockDb, makeMockLogger } from "../../../test-utils/src/index.js";
import {
  TENANT_ID,
  PRINCIPAL_ID,
  PRINCIPAL_ID2,
  PRINCIPAL_ID3,
  ENTITY_ID,
  WF_DEF_ID,
  WF_TEMPLATE_ID,
  WF_REQUEST_ID,
  WF_STAGE_ID,
  WF_ITEM_ID,
  WF_STAGE2_ID,
  COMPILED_TEMPLATE_1_STAGE,
  COMPILED_TEMPLATE_2_STAGE,
} from "../../../test-utils/src/fixtures.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDefinitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WF_DEF_ID,
    rules: JSON.stringify([
      { template_code: "ap_invoice_approval", workflow_type: "approval" },
    ]),
    ...overrides,
  };
}

function makeTemplateRow(compiled = COMPILED_TEMPLATE_1_STAGE) {
  return {
    id: WF_TEMPLATE_ID,
    code: "ap_invoice_approval",
    compiled_json: JSON.stringify(compiled),
    compiled_hash: "abc123",
    behaviors: "{}",
    sla_policy_id: null,
  };
}

function makeWorkItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WF_ITEM_ID,
    workflow_request_id: WF_REQUEST_ID,
    workflow_stage_id: WF_STAGE_ID,
    task_type: "approval",
    status: "pending",
    decision: null,
    assignee_id: PRINCIPAL_ID,
    assignee_group_id: null,
    assignee_team_id: null,
    ...overrides,
  };
}

function makeRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WF_REQUEST_ID,
    status: "pending",
    requested_by: PRINCIPAL_ID,
    template_snapshot: JSON.stringify(COMPILED_TEMPLATE_1_STAGE),
    entity_type: "document.purchase_invoice",
    entity_id: ENTITY_ID,
    entity_snapshot: "{}",
    ...overrides,
  };
}

function makeStageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WF_STAGE_ID,
    stage_no: 1,
    status: "active",
    quorum: null,
    sla_policy_id: null,
    ...overrides,
  };
}

// ── shouldRequireWorkflow ────────────────────────────────────────────────────

describe("WorkflowEngine.shouldRequireWorkflow", () => {
  it("returns {required:false} when no definitions exist", async () => {
    const db = makeMockDb({ tables: { "control.workflow_definition as wd": [] } });
    const engine = new WorkflowEngine({ db: db as never });

    const result = await engine.shouldRequireWorkflow("document.purchase_invoice", TENANT_ID, {});

    expect(result).toEqual({ required: false });
  });

  it("returns {required:true} when definition has no condition (matches everything)", async () => {
    const db = makeMockDb({
      tables: {
        "control.workflow_definition as wd": [makeDefinitionRow()],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    const result = await engine.shouldRequireWorkflow("document.purchase_invoice", TENANT_ID, {});

    expect(result.required).toBe(true);
    expect(result.definitionId).toBe(WF_DEF_ID);
    expect(result.templateCode).toBe("ap_invoice_approval");
  });

  it("returns {required:true} when JSONLogic condition matches the payload", async () => {
    const defRow = makeDefinitionRow({
      rules: JSON.stringify([
        {
          template_code: "high_value_approval",
          condition: { ">": [{ var: "amount" }, 1000] },
        },
      ]),
    });
    const db = makeMockDb({ tables: { "control.workflow_definition as wd": [defRow] } });
    const engine = new WorkflowEngine({ db: db as never });

    const result = await engine.shouldRequireWorkflow(
      "document.purchase_invoice",
      TENANT_ID,
      { amount: 5000 },
    );

    expect(result.required).toBe(true);
    expect(result.templateCode).toBe("high_value_approval");
  });

  it("returns {required:false} when condition does NOT match the payload", async () => {
    const defRow = makeDefinitionRow({
      rules: JSON.stringify([
        {
          template_code: "high_value_approval",
          condition: { ">": [{ var: "amount" }, 1000] },
        },
      ]),
    });
    const db = makeMockDb({ tables: { "control.workflow_definition as wd": [defRow] } });
    const engine = new WorkflowEngine({ db: db as never });

    const result = await engine.shouldRequireWorkflow(
      "document.purchase_invoice",
      TENANT_ID,
      { amount: 50 },
    );

    expect(result.required).toBe(false);
  });
});

// ── createRequest ────────────────────────────────────────────────────────────

describe("WorkflowEngine.createRequest", () => {
  const baseParams = {
    tenantId: TENANT_ID,
    entityType: "document.purchase_invoice",
    entityId: ENTITY_ID,
    payload: { amount: 500 },
    requestedBy: PRINCIPAL_ID,
  };

  it("returns existing request without re-creating (idempotency)", async () => {
    const db = makeMockDb({
      tables: {
        "document.workflow_request as wr": [{ id: WF_REQUEST_ID, status: "pending" }],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    const result = await engine.createRequest(baseParams);

    expect(result.isExisting).toBe(true);
    expect(result.id).toBe(WF_REQUEST_ID);
  });

  it("throws 422 when no workflow definition matches", async () => {
    const db = makeMockDb({
      tables: {
        "document.workflow_request as wr": [],
        "control.workflow_definition as wd": [],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.createRequest(baseParams)).rejects.toMatchObject({ code: 422 });
  });

  it("throws 422 when template is not found", async () => {
    const db = makeMockDb({
      tables: {
        "document.workflow_request as wr": [],
        "control.workflow_definition as wd": [makeDefinitionRow()],
        "control.workflow_template as wt": [],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.createRequest(baseParams)).rejects.toMatchObject({ code: 422 });
  });

  it("accepts a usable template snapshot when compiled_hash is not published", async () => {
    const uncompiledTemplate = { ...makeTemplateRow(), compiled_hash: null };
    const db = makeMockDb({
      tables: {
        "document.workflow_request as wr": [],
        "control.workflow_definition as wd": [makeDefinitionRow()],
        "control.workflow_template as wt": [uncompiledTemplate],
        "document.workflow_stage as ws": [makeStageRow()],
      },
      txTables: {
        "document.workflow_request as wr": [],
        "document.workflow_stage as ws": [makeStageRow()],
      },
      insertIds: {
        "document.workflow_request": WF_REQUEST_ID,
        "document.workflow_stage": WF_STAGE_ID,
        "event.work_item": WF_ITEM_ID,
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.createRequest(baseParams)).resolves.toMatchObject({ isExisting: false });
  });

  it("creates a new request and returns {isExisting:false}", async () => {
    const db = makeMockDb({
      tables: {
        "document.workflow_request as wr": [],
        "control.workflow_definition as wd": [makeDefinitionRow()],
        "control.workflow_template as wt": [makeTemplateRow()],
        // Inside transaction: stage 1 lookup
        "document.workflow_stage as ws": [makeStageRow()],
      },
      txTables: {
        "document.workflow_request as wr": [],
        "document.workflow_stage as ws": [makeStageRow()],
      },
      insertIds: {
        "document.workflow_request": WF_REQUEST_ID,
        "document.workflow_stage": WF_STAGE_ID,
        "event.work_item": WF_ITEM_ID,
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    const result = await engine.createRequest(baseParams);

    expect(result.isExisting).toBe(false);
    expect(result.status).toBe("pending");
  });
});

// ── processAction ────────────────────────────────────────────────────────────

describe("WorkflowEngine.processAction", () => {
  const baseActionParams = {
    workItemId: WF_ITEM_ID,
    actorId: PRINCIPAL_ID,
    tenantId: TENANT_ID,
    action: "approve",
  };

  function makeTxTables(
    itemOverrides: Record<string, unknown> = {},
    requestOverrides: Record<string, unknown> = {},
    stageOverrides: Record<string, unknown> = {},
    stageItemDecisions: Array<{ status: string; decision: string | null }> = [
      { status: "pending", decision: null },
    ],
  ) {
    return {
      "event.work_item as wi": [makeWorkItemRow(itemOverrides)],
      "document.workflow_request as wr": [makeRequestRow(requestOverrides)],
      "document.workflow_stage as ws": [makeStageRow(stageOverrides)],
      // For quorum: all work_items in the stage
      "event.work_item": stageItemDecisions,
    };
  }

  it("throws 404 when work item does not exist", async () => {
    const db = makeMockDb({
      tables: {},
      txTables: { "event.work_item as wi": [] },
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.processAction(baseActionParams)).rejects.toMatchObject({ code: 404 });
  });

  it("throws 409 when work item is already closed", async () => {
    const db = makeMockDb({
      txTables: makeTxTables({ status: "completed", decision: "approve" }),
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.processAction(baseActionParams)).rejects.toMatchObject({ code: 409 });
  });

  it("throws 403 when actor is not the assignee or authorized claimant", async () => {
    const db = makeMockDb({
      txTables: makeTxTables({ assignee_id: PRINCIPAL_ID2 }), // actor is PRINCIPAL_ID
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.processAction(baseActionParams)).rejects.toMatchObject({ code: 403 });
  });

  it("throws 403 when work item has a group but actor is not a member", async () => {
    const db = makeMockDb({
      txTables: makeTxTables({
        assignee_id: null,
        assignee_group_id: "group-1",
      }),
    });
    const engine = new WorkflowEngine({ db: db as never });

    // Should not throw — group claim is allowed
    await expect(engine.processAction(baseActionParams)).rejects.toMatchObject({ code: 403 });
  });

  it("allows action when work item has a group and actor is a member", async () => {
    const db = makeMockDb({
      txTables: {
        ...makeTxTables({
          assignee_id: null,
          assignee_group_id: "group-1",
        }),
        "master.auth_group_member as agm": [{ group_id: "group-1" }],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.processAction(baseActionParams)).resolves.toBeUndefined();
  });

  it("allows delegated actor to act for the direct assignee", async () => {
    const db = makeMockDb({
      txTables: {
        ...makeTxTables({ assignee_id: PRINCIPAL_ID2 }),
        "master.delegation_grant as dg": [{ id: "delegation-1" }],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.processAction(baseActionParams)).resolves.toBeUndefined();
  });

  it("records read without completing the work item or evaluating quorum", async () => {
    const db = makeMockDb({
      txTables: makeTxTables(),
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(
      engine.processAction({ ...baseActionParams, action: "read" }),
    ).resolves.toBeUndefined();
  });

  it("blocks serial stage decisions when an earlier work item is still open", async () => {
    const db = makeMockDb({
      txTables: {
        ...makeTxTables({ order_index: 2 }),
        "document.workflow_stage as serial_ws": [{ id: WF_STAGE_ID, mode: "serial" }],
        "event.work_item as serial_wi": [{ id: "earlier-work-item", order_index: 1 }],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.processAction(baseActionParams)).rejects.toMatchObject({ code: 409 });
  });

  it("delegates work item without terminating it", async () => {
    const db = makeMockDb({
      txTables: makeTxTables(),
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(
      engine.processAction({ ...baseActionParams, action: "delegate", delegateTo: PRINCIPAL_ID2 }),
    ).resolves.toBeUndefined();
  });

  it("throws 400 when delegating without a target", async () => {
    const db = makeMockDb({ txTables: makeTxTables() });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(
      engine.processAction({ ...baseActionParams, action: "delegate" }),
    ).rejects.toMatchObject({ code: 400 });
  });

  it("blocks self-approval when allow_self_approval=false", async () => {
    const templateWithBlock = {
      ...COMPILED_TEMPLATE_1_STAGE,
      behaviors: { allow_self_approval: false },
    };
    // Actor is the same as requested_by
    const db = makeMockDb({
      txTables: makeTxTables(
        {},
        { requested_by: PRINCIPAL_ID, template_snapshot: JSON.stringify(templateWithBlock) },
      ),
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.processAction(baseActionParams)).rejects.toMatchObject({ code: 422 });
  });

  // ── evaluateQuorum via processAction ───────────────────────────────────────

  it("unanimous quorum: closes stage when all items are decided (approve outcome)", async () => {
    const logger = makeMockLogger();
    const db = makeMockDb({
      txTables: {
        "event.work_item as wi": [makeWorkItemRow()],
        "document.workflow_request as wr": [makeRequestRow()],
        // Stage is active and has no quorum (defaults to unanimous)
        "document.workflow_stage as ws": [makeStageRow({ quorum: null })],
        // All work items for stage are done with positive decision
        "event.work_item": [{ status: "completed", decision: "approve" }],
        // No next stage → request is closed
        "document.workflow_stage": [],
      },
    });
    const engine = new WorkflowEngine({ db: db as never, logger });

    await expect(engine.processAction(baseActionParams)).resolves.toBeUndefined();
  });

  it("unanimous quorum: closes stage with rejected outcome when any item is rejected", async () => {
    const db = makeMockDb({
      txTables: {
        "event.work_item as wi": [makeWorkItemRow()],
        "document.workflow_request as wr": [makeRequestRow()],
        "document.workflow_stage as ws": [makeStageRow({ quorum: null })],
        "event.work_item": [{ status: "completed", decision: "reject" }],
        "document.workflow_stage": [],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(
      engine.processAction({ ...baseActionParams, action: "reject" }),
    ).resolves.toBeUndefined();
  });

  it("return closes the workflow but restores the PO source to draft", async () => {
    const completeWorkflow = vi.fn().mockResolvedValue(undefined);
    const db = makeMockDb({
      txTables: {
        "event.work_item as wi": [makeWorkItemRow({ decision: "return" })],
        "document.workflow_request as wr": [makeRequestRow({ entity_type: "purchase_order" })],
        "document.workflow_stage as ws": [makeStageRow({ quorum: null })],
        "document.workflow_stage": [],
      },
    });
    const engine = new WorkflowEngine({
      db: db as never,
      sourceEntityAdapter: { completeWorkflow },
    });

    await engine.processAction({ ...baseActionParams, action: "return" });

    expect(completeWorkflow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityType: "purchase_order",
      outcome: "returned",
    }));
  });

  it("count quorum: stage complete when required approvals reached", async () => {
    const db = makeMockDb({
      txTables: {
        "event.work_item as wi": [makeWorkItemRow()],
        "document.workflow_request as wr": [makeRequestRow()],
        // count quorum requires 1 approval
        "document.workflow_stage as ws": [
          makeStageRow({ quorum: JSON.stringify({ strategy: "count", required: 1 }) }),
        ],
        "event.work_item": [
          { status: "completed", decision: "approve" },
          { status: "pending",   decision: null },
        ],
        "document.workflow_stage": [],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.processAction(baseActionParams)).resolves.toBeUndefined();
  });

  it("percent quorum: advances when approval rate meets threshold", async () => {
    const db = makeMockDb({
      txTables: {
        "event.work_item as wi": [makeWorkItemRow()],
        "document.workflow_request as wr": [makeRequestRow()],
        // 60% required — 2 of 3 approve → 67% → should complete
        "document.workflow_stage as ws": [
          makeStageRow({ quorum: JSON.stringify({ strategy: "percent", required: 60 }) }),
        ],
        "event.work_item": [
          { status: "completed", decision: "approve" },
          { status: "completed", decision: "approve" },
          { status: "completed", decision: "reject" },
        ],
        "document.workflow_stage": [],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.processAction(baseActionParams)).resolves.toBeUndefined();
  });

  it("advances to next stage when stage 1 is complete (2-stage template)", async () => {
    const db = makeMockDb({
      txTables: {
        "event.work_item as wi": [makeWorkItemRow()],
        "document.workflow_request as wr": [
          makeRequestRow({
            template_snapshot: JSON.stringify(COMPILED_TEMPLATE_2_STAGE),
            entity_snapshot: "{}",
          }),
        ],
        "document.workflow_stage as ws": [makeStageRow({ quorum: null })],
        // All items approved (stage 1 done)
        "event.work_item": [{ status: "completed", decision: "approve" }],
        // Next stage exists (stage 2)
        "document.workflow_stage": [{ id: WF_STAGE2_ID, stage_no: 2, mode: "parallel", sla_policy_id: null }],
      },
      insertIds: { "event.work_item": WF_ITEM_ID },
    });
    const engine = new WorkflowEngine({ db: db as never });

    await expect(engine.processAction(baseActionParams)).resolves.toBeUndefined();
  });
});

// ── getInboxCount ────────────────────────────────────────────────────────────

describe("WorkflowEngine.getInboxCount", () => {
  it("returns 0 when no pending items exist", async () => {
    const db = makeMockDb({
      tables: {
        "event.work_item as wi": [{ count: 0 }],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    const count = await engine.getInboxCount({ principalId: PRINCIPAL_ID, tenantId: TENANT_ID });

    expect(count).toBe(0);
  });
});

// ── getRequestDetail ─────────────────────────────────────────────────────────

describe("WorkflowEngine.getRequestDetail", () => {
  it("returns null when request not found", async () => {
    const db = makeMockDb({
      tables: {
        "document.workflow_request as wr": [],
        "document.workflow_stage as ws":   [],
        "event.work_item as wi":           [],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    const result = await engine.getRequestDetail({ requestId: WF_REQUEST_ID, tenantId: TENANT_ID });

    expect(result).toBeNull();
  });

  it("returns request + stages + workItems when found", async () => {
    const db = makeMockDb({
      tables: {
        "document.workflow_request as wr": [
          makeRequestRow({ template_snapshot: JSON.stringify(COMPILED_TEMPLATE_1_STAGE) }),
        ],
        "document.workflow_stage as ws": [makeStageRow()],
        "event.work_item as wi":         [makeWorkItemRow()],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    const result = await engine.getRequestDetail({ requestId: WF_REQUEST_ID, tenantId: TENANT_ID });

    expect(result).not.toBeNull();
    expect(result!.stages).toHaveLength(1);
    expect(result!.workItems).toHaveLength(1);
    expect(result!.behaviors).toEqual({});
  });

  it("strips templateSnapshot and entitySnapshot from the returned request object", async () => {
    const db = makeMockDb({
      tables: {
        "document.workflow_request as wr": [
          makeRequestRow({ template_snapshot: JSON.stringify(COMPILED_TEMPLATE_1_STAGE) }),
        ],
        "document.workflow_stage as ws": [makeStageRow()],
        "event.work_item as wi":         [makeWorkItemRow()],
      },
    });
    const engine = new WorkflowEngine({ db: db as never });

    const result = await engine.getRequestDetail({ requestId: WF_REQUEST_ID, tenantId: TENANT_ID });
    const req = result!.request as Record<string, unknown>;

    expect(req["templateSnapshot"]).toBeUndefined();
    expect(req["entitySnapshot"]).toBeUndefined();
  });
});
