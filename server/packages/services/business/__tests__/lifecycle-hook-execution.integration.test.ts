import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Phase 1 red characterization suite. The always-running source contracts
// complement DB-backed lifecycle tests, which are skipped without DATABASE_URL.
const serverRoot = resolve(process.cwd());
const repoRoot = resolve(process.cwd(), "..");
const orchestratorPath = resolve(
  serverRoot,
  "packages/services/records/lifecycle/execute-lifecycle-transition.ts",
);

function readServerSource(path: string): string {
  return readFileSync(resolve(serverRoot, path), "utf8");
}

function readRepoSource(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("lifecycle hook execution characterization", () => {
  it("owns status mutation and BEFORE/AFTER hooks in one transaction", () => {
    expect(
      existsSync(orchestratorPath),
      "a single lifecycle transition orchestrator must own status mutation and hooks",
    ).toBe(true);

    if (!existsSync(orchestratorPath)) return;
    const source = readFileSync(orchestratorPath, "utf8");
    const transaction = source.indexOf(".transaction().execute");
    const before = source.indexOf('timing: "before"', transaction);
    const statusMutation = source.indexOf("updateTable", before);
    const after = source.indexOf('timing: "after"', statusMutation);

    expect(transaction).toBeGreaterThanOrEqual(0);
    expect(before).toBeGreaterThan(transaction);
    expect(statusMutation).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(statusMutation);
    expect(source.match(/timing:\s*"before"/g)?.length ?? 0).toBe(1);
    expect(source.match(/timing:\s*"after"/g)?.length ?? 0).toBe(1);
  });

  it("rolls back a required hook failure instead of swallowing it", () => {
    expect(existsSync(orchestratorPath)).toBe(true);
    if (!existsSync(orchestratorPath)) return;
    const source = readFileSync(orchestratorPath, "utf8");
    expect(source).not.toMatch(/runLifecycleHooks\([^;]+\.catch\s*\(/);
    expect(source).toContain("REQUIRED_HOOK_FAILED");
  });

  it("has one lifecycle notification publisher for purchase-invoice transitions", () => {
    const actionDispatcher = readServerSource(
      "packages/services/records/routes/action-dispatcher.route.ts",
    );
    const hookRunner = readServerSource(
      "packages/services/business/lifecycle/hook-runner.service.ts",
    );

    expect(hookRunner).toContain('case "notification.publish"');
    expect(actionDispatcher.includes("emitPurchaseInvoiceLifecycleNotification")).toBe(false);
    expect(actionDispatcher.includes("PURCHASE_INVOICE_LIFECYCLE_CHANGED")).toBe(false);
    expect(actionDispatcher.includes("notificationQueue")).toBe(false);
  });

  it("declares at most one active notification.publish hook per transition", () => {
    const seed = readRepoSource(
      "server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql",
    );
    expect(seed).toContain("'notification.publish'");
    expect(seed).toMatch(/NOT EXISTS[\s\S]*?lth\.action\s*=\s*'notification\.publish'/);
  });

  it("forwards modal operation payload through hooks to transaction flow handlers", () => {
    const orchestrator = readServerSource(
      "packages/services/records/lifecycle/execute-lifecycle-transition.ts",
    );
    const hookRunner = readServerSource(
      "packages/services/business/lifecycle/hook-runner.service.ts",
    );
    const transactionDispatcher = readServerSource(
      "packages/services/business/p2p/transaction-flow-dispatcher.service.ts",
    );

    expect(orchestrator).toContain("operationPayload: effectivePayload");
    expect(hookRunner).toContain("operationPayload:   ctx.operationPayload");
    expect(transactionDispatcher).toContain("{ ...(ctx.operationPayload ?? {}) }");
  });
});
