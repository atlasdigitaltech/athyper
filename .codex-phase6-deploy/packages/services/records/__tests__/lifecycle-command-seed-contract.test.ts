import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isLifecycleCommandFlowCode,
  listLifecycleCommands,
  resolveLifecycleCommand,
} from "../routes/lifecycle-command.registry.js";

interface SeedLifecycleOperation {
  entityCode: string;
  operationCode: string;
  flowCode: string;
}

interface HookMatrixEntry {
  lifecycleCode: string;
  fromState: string;
  toState: string;
  configValues: readonly string[];
}

const seedFiles = [
  "db/seed/platform/003_control/072p_p2p_runtime_contract.sql",
  "db/seed/platform/003_control/044_control_entity_operation_contract.sql",
];

const p2pRuntimeSeed = "db/seed/platform/003_control/072p_p2p_runtime_contract.sql";

function hookMatrix(action: "snapshot.capture" | "transaction_flow.dispatch"): HookMatrixEntry[] {
  const source = readFileSync(resolve(process.cwd(), p2pRuntimeSeed), "utf8");
  const start = source.indexOf(`${action === "snapshot.capture" ? "3" : "4"}. ${action}`);
  const end = source.indexOf("INSERT INTO control.lifecycle_transition_hook", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  const entries: HookMatrixEntry[] = [];
  const tuplePattern = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'(?:,\s*'([^']+)')?\)/g;
  for (const match of source.slice(start, end).matchAll(tuplePattern)) {
    const [, lifecycleCode, fromState, toState, firstConfig, secondConfig] = match;
    if (lifecycleCode && fromState && toState && firstConfig) {
      entries.push({
        lifecycleCode,
        fromState,
        toState,
        configValues: secondConfig ? [firstConfig, secondConfig] : [firstConfig],
      });
    }
  }
  return entries;
}

function activeSeedLifecycleOperations(): SeedLifecycleOperation[] {
  const tuplePattern = /\(NULL,\s*'([^']+)',\s*'([^']+)',\s*'DETAIL',\s*'[^']+',\s*'MODAL',\s*'flow:([^']+)'/g;
  const operations: SeedLifecycleOperation[] = [];

  for (const seedFile of seedFiles) {
    const source = readFileSync(resolve(process.cwd(), seedFile), "utf8");
    for (const match of source.matchAll(tuplePattern)) {
      const [, entityCode, operationCode, flowCode] = match;
      if (entityCode && operationCode && flowCode && isLifecycleCommandFlowCode(flowCode)) {
        operations.push({ entityCode, operationCode, flowCode });
      }
    }
  }
  return operations;
}

describe("active lifecycle operation seed contract", () => {
  it("resolves every seeded lifecycle operation to exactly one entity-scoped command", () => {
    const seeded = activeSeedLifecycleOperations();
    expect(seeded).toHaveLength(6);

    for (const operation of seeded) {
      expect(() => resolveLifecycleCommand(
        operation.entityCode,
        operation.operationCode,
        operation.flowCode,
      )).not.toThrow();
      expect(listLifecycleCommands().filter((registration) =>
        registration.entityCode === operation.entityCode
        && registration.operationCode === operation.operationCode,
      )).toHaveLength(1);
    }
  });

  it("separates each UI flow target from its lifecycle execution command", () => {
    const source = seedFiles
      .map((seedFile) => readFileSync(resolve(process.cwd(), seedFile), "utf8"))
      .join("\n");

    for (const operation of activeSeedLifecycleOperations()) {
      const escapedEntity = operation.entityCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedOperation = operation.operationCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(source).toMatch(new RegExp(
        `\\('${escapedEntity}',\\s*'${escapedOperation}',\\s*'lifecycle:${escapedOperation}'\\)`,
      ));
    }
  });

  it("audits every tenant flow override before preserving active UI targets during backfill", () => {
    const seed = readFileSync(resolve(process.cwd(), seedFiles[1]!), "utf8");
    const audit = readFileSync(resolve(
      process.cwd(),
      "db/scripts/verify/audit-tenant-flow-entity-operations.sql",
    ), "utf8");

    for (const source of [seed, audit]) {
      expect(source).toMatch(/tenant_id IS NOT NULL/i);
      expect(source).toMatch(/handler_target LIKE 'flow:%'/i);
      expect(source).toContain("is_enabled");
    }
    const tenantBackfill = seed.slice(seed.indexOf("-- Tenant lifecycle-command backfill"));
    const setClause = tenantBackfill.slice(
      tenantBackfill.indexOf("SET"),
      tenantBackfill.indexOf("FROM (VALUES"),
    );
    expect(setClause).toContain("execution_target");
    expect(setClause).not.toContain("handler_target");
    expect(audit).toContain("lifecycle_command_orchestrator_v2");
    expect(audit).toContain("enabled operation has no lifecycle command registry key");
  });

  it("rolls out v2 by entity and keeps PI financial operations independently scoped", () => {
    const seed = readFileSync(resolve(
      process.cwd(),
      "db/seed/platform/003_control/040_control_entity_contract.sql",
    ), "utf8");
    const rollout = seed.slice(seed.indexOf("-- Entity-scoped rollout"));
    expect(rollout).toContain("lifecycle_command_orchestrator_v2");
    expect(rollout).toContain('rollout_stage":1');
    expect(rollout).toContain("WHEN 'receipt' THEN");
    expect(rollout).toContain('rollout_stage":2');
    expect(rollout).toContain("WHEN 'service_sheet' THEN");
    expect(rollout).toContain('rollout_stage":3');
    expect(rollout).toContain('operations":["submit","post","reverse"]');
    expect(rollout).toContain('rollout_stage_by_operation":{"submit":4,"post":5,"reverse":5}');
  });

  it("declares action rules for PI posting and reversal permissions", () => {
    const source = readFileSync(resolve(
      process.cwd(),
      "db/seed/platform/003_control/042d_ap_purchase_invoice_contract.sql",
    ), "utf8");
    expect(source).toMatch(/'purchase_invoice',\s*'approved',\s*'HEADER\.POST',\s*'requires_permission',\s*'PI\.POST'/);
    expect(source).toMatch(/'purchase_invoice',\s*'posted',\s*'HEADER\.REVERSE',\s*'requires_permission',\s*'PI\.REVERSE'/);
  });

  it("declares unique snapshot and transaction-flow matrix slots", () => {
    for (const action of ["snapshot.capture", "transaction_flow.dispatch"] as const) {
      const matrix = hookMatrix(action);
      expect(matrix.length).toBeGreaterThan(0);
      const slots = matrix.map((entry) =>
        `${entry.lifecycleCode}::${entry.fromState}::${entry.toState}`,
      );
      expect(new Set(slots).size).toBe(slots.length);
    }
  });

  it("registers every hook action used by the P2P lifecycle contract", () => {
    const runtimeSeed = readFileSync(resolve(process.cwd(), p2pRuntimeSeed), "utf8");
    const registrySeed = readFileSync(resolve(
      process.cwd(),
      "db/seed/platform/003_control/070_control_hook_action_registry_contract.sql",
    ), "utf8");
    const actions = [
      "activity_log.write",
      "snapshot.capture",
      "transaction_flow.dispatch",
      "notification.publish",
      "workflow.start",
    ];

    for (const action of actions) {
      expect(runtimeSeed).toContain(`'${action}'`);
      expect(registrySeed).toContain(`'${action}'`);
    }
  });

  it("resolves entity lifecycle bindings tenant-first with deterministic ties", () => {
    const source = readFileSync(resolve(
      process.cwd(),
      "packages/services/records/lifecycle/execute-lifecycle-transition.ts",
    ), "utf8");

    expect(source).toContain("CASE WHEN el.tenant_id = ${tenantId}::uuid THEN 0 ELSE 1 END");
    expect(source).toContain('.orderBy("el.priority" as never, "asc")');
    expect(source).toContain('.orderBy("el.id" as never, "asc")');
    expect(source).not.toContain('.orderBy("el.tenant_id" as never, "desc")');
  });

  it("uses one canonical effective-hook resolver in runtime and verification", () => {
    const ddl = readFileSync(resolve(process.cwd(), "db/ddl/control/05_functions.sql"), "utf8");
    const runner = readFileSync(resolve(
      process.cwd(),
      "packages/services/business/lifecycle/hook-runner.service.ts",
    ), "utf8");
    const verifier = readFileSync(resolve(
      process.cwd(),
      "db/scripts/verify/verify-seed-contracts.ts",
    ), "utf8");

    expect(ddl).toContain("control.resolve_effective_lifecycle_hooks");
    for (const overrideKind of ["suppress", "replace", "add_before", "add_after"]) {
      expect(ddl).toContain(`'${overrideKind}'`);
    }
    expect(ddl).toContain("h.safety_level = 'replaceable'");
    expect(ddl).toContain("h.safety_level <> 'required'");
    expect(ddl).toContain("ORDER BY eh.sort_order, eh.effective_hook_id");
    expect(runner).toContain("control.resolve_effective_lifecycle_hooks(");
    expect(verifier).toContain("control.resolve_effective_lifecycle_hooks(s.tenant_id, t.id)");
  });
});
