import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { handlePostInvoice, handleReverseInvoice } from "../ap/purchase_invoice/invoice-posting.service.js";
import { handleSubmitForApproval } from "../p2p/purchase_invoice/invoice-submit.handler.js";

const submitSource = readFileSync(resolve(
  process.cwd(),
  "packages/services/business/p2p/purchase_invoice/invoice-submit.handler.ts",
), "utf8");
const postingSource = readFileSync(resolve(
  process.cwd(),
  "packages/services/business/ap/purchase_invoice/invoice-posting.service.ts",
), "utf8");
const transactionDispatcher = readFileSync(resolve(
  process.cwd(),
  "packages/services/business/p2p/transaction-flow-dispatcher.service.ts",
), "utf8");

describe("purchase invoice handler lifecycle ownership", () => {
  it("submit preparation returns a patch and contains no direct invoice status update", () => {
    expect(submitSource).toContain("export async function preparePurchaseInvoiceSubmit");
    expect(submitSource).toContain("statusPatch: { workflow_request_id: wreqId }");
    expect(submitSource).not.toMatch(/UPDATE document\.purchase_invoice\s+SET status/);
    expect(submitSource).not.toContain("syncBusinessLifecycle(");
  });

  it("rejects all legacy direct lifecycle entry points before touching the database", async () => {
    const fakeDb = {} as never;
    const submit = await handleSubmitForApproval(fakeDb, "tenant", "invoice", "actor", {});
    const post = await handlePostInvoice(fakeDb, "tenant", "invoice", "actor", {});
    const reverse = await handleReverseInvoice(fakeDb, "tenant", "invoice", "actor", {});
    expect(submit.body["error"]).toBe("LIFECYCLE_ORCHESTRATOR_REQUIRED");
    expect(post.body["error"]).toBe("LIFECYCLE_HOOK_EXECUTION_REQUIRED");
    expect(reverse.body["error"]).toBe("LIFECYCLE_HOOK_EXECUTION_REQUIRED");
  });

  it("keeps lifecycle status ownership out of post and reverse materialization", () => {
    expect(postingSource).not.toMatch(/UPDATE document\.purchase_invoice\s+SET status/);
    expect(postingSource).not.toContain("syncBusinessLifecycle(");
    expect(postingSource.match(/executionMode:\s*"lifecycle_hook"/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(transactionDispatcher.match(/executionMode:\s*"lifecycle_hook"/g)?.length ?? 0).toBe(2);
    expect(postingSource).toContain('currentStatus !== "posted"');
    expect(postingSource).toContain('currentStatus !== "reversed"');
    expect(postingSource).not.toContain('currentStatus !== "approved" &&');
    expect(postingSource).not.toContain('currentStatus !== "posted" && currentStatus !== "reversed"');
    expect(postingSource).not.toMatch(/SENTINEL_TRANSITION_ID|synth\w*ExecutionToken/);
    expect(postingSource).not.toMatch(/transitionId:\s+dispatchCtx\?\./);
  });
});
