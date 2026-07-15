import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(
  process.cwd(),
  "packages/services/records/lifecycle/execute-lifecycle-transition.ts",
), "utf8");

describe("lifecycle transition orchestrator contract", () => {
  it("locks the record before resolving and validating the transition", () => {
    const lock = source.indexOf(".forUpdate()");
    const transition = source.indexOf("resolveTransition(", lock);
    const actionRule = source.indexOf("validateActionRule(", transition);
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(transition).toBeGreaterThan(lock);
    expect(actionRule).toBeGreaterThan(transition);
    expect(source).toContain("LIFECYCLE_STATE_CONFLICT");
  });

  it("runs preparation and both hook timings inside the transaction", () => {
    const transaction = source.indexOf(".transaction().execute");
    const preparation = source.indexOf("input.command.prepare", transaction);
    const before = source.indexOf('timing: "before"', preparation);
    const update = source.indexOf(".updateTable", before);
    const sync = source.indexOf("syncLifecycleInstanceForStatus", update);
    const after = source.indexOf('timing: "after"', sync);
    expect(preparation).toBeGreaterThan(transaction);
    expect(before).toBeGreaterThan(preparation);
    expect(update).toBeGreaterThan(before);
    expect(sync).toBeGreaterThan(update);
    expect(after).toBeGreaterThan(sync);
  });

  it("updates status, audit fields, row version, and forwards operation payload", () => {
    expect(source).toContain("status_changed_at: now");
    expect(source).toContain("status_changed_by: input.principalId");
    expect(source).toContain("row_version: sql`row_version + 1`");
    expect(source).toContain("operationPayload: effectivePayload");
  });
});
