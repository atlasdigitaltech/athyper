import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("purchase invoice revert_to_baseline operation", () => {
  const source = readFileSync(new URL("../ap.route.ts", import.meta.url), "utf8");
  const start = source.indexOf("const revertInvoiceToBaselineHandler");
  const end = source.indexOf("router.post(\"/finance/ap/payments/:id/submit\"", start);
  const handler = source.slice(start, end);

  it("is a separately named domain action with a migration alias", () => {
    expect(source).toContain('router.post("/finance/ap/invoices/:id/revert-to-baseline", revertInvoiceToBaselineHandler)');
    expect(source).toContain('router.post("/finance/ap/invoices/:id/discard-session", revertInvoiceToBaselineHandler)');
    expect(handler).toContain('operation: "revert_to_baseline"');
    expect(handler).toContain('req.body?.operation !== "revert_to_baseline"');
    expect(handler).not.toContain('req.path.endsWith("/revert-to-baseline")');
  });

  it("requires workspace, dedicated permission, and explicit preflight", () => {
    expect(handler).toContain('req.header("X-Document-Edit-Workspace")');
    expect(handler).toContain('error: "WORKSPACE_REQUIRED"');
    expect(handler).toContain('"PI.REVERT_TO_BASELINE"');
    expect(handler).toContain('error: "STATUS_NOT_RESTORABLE"');
    expect(handler).toContain('error:   "NO_BASELINE_SNAPSHOT"');
  });

  it("uses audited snapshot restoration and never clears recovery drafts", () => {
    expect(handler).toContain("restoreFromSnapshot(db");
    expect(handler).toContain("reasonCodeId");
    expect(handler).not.toContain("deleteDocumentEditServerDraft");
    expect(handler).not.toContain("discard_draft");
  });
});
