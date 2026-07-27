import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMeshInboxAdapter,
  createWorkflowInboxAdapter,
  type WorkInboxFetch,
} from "../../packages/shared/ui-platform/work-inbox-ui/src/index";

const baseQuery = {
  view: "assigned" as const,
  search: "",
  sort: "newest" as const,
  page: 0,
  pageSize: 25,
};

describe("work Inbox plane adapters", () => {
  it("maps authorized workflow work into actionable summaries", async () => {
    const fetcher: WorkInboxFetch = async () => ({
      items: [{
        id: "work-1",
        entityType: "purchase_invoice",
        entityId: "invoice-1",
        workflowType: "invoice_approval",
        stageName: "Finance review",
        status: "assigned",
        assignedAt: "2026-07-25T00:00:00.000Z",
      }],
      total: 1,
    } as never);
    const result = await createWorkflowInboxAdapter("neon", fetcher)
      .list(baseQuery, new AbortController().signal);
    assert.equal(result.total, 1);
    assert.deepEqual(result.items[0]?.availableActions.map((action) => action.code), [
      "approve",
      "reject",
      "delegate",
      "escalate",
    ]);
    assert.equal(result.items[0]?.source.href, "/app/purchase_invoice/invoice-1");
  });

  it("does not render actions for delegated views without current assignment", async () => {
    const fetcher: WorkInboxFetch = async () => ({
      items: [{ id: "work-2", entityType: "purchase_order", status: "assigned" }],
      total: 1,
    } as never);
    const result = await createWorkflowInboxAdapter("admin", fetcher).list(
      { ...baseQuery, view: "delegated" },
      new AbortController().signal,
    );
    assert.deepEqual(result.items[0]?.availableActions, []);
  });

  it("keeps Mesh documents read-only until an action capability endpoint exists", async () => {
    const fetcher: WorkInboxFetch = async () => ({
      items: [{ id: "document-1", entity: "purchase_invoice", code: "PI-1", status: "received" }],
      total: 1,
    } as never);
    const result = await createMeshInboxAdapter(fetcher)
      .list(baseQuery, new AbortController().signal);
    assert.equal(result.items[0]?.title, "Purchase Invoice PI-1");
    assert.deepEqual(result.items[0]?.availableActions, []);
  });
});
