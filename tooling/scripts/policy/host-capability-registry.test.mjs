import assert from "node:assert/strict";
import test from "node:test";
import { validateHostCapabilityRegistry } from "./host-capability-registry.mjs";

const row = {
  sourceKey: "neon:ledger.book_period_status:server/db/ddl/planes/neon/ledger/01.sql",
  classification: "runtime_mutable",
  reviewStatus: "reviewed",
  serviceOwner: "@athyper/server-service-finance",
  featureGate: "FINANCE_ENABLED",
  commands: { decision: "supported", codes: ["finance.period.transition"] },
  repository: ["server/packages/services/finance/src/repository.ts"],
  entryPoints: ["server/apps/platform-host/src/composition/finance-routes.ts"],
  auditEvent: ["finance.period.transitioned"],
  outboxEvent: ["finance.period.transitioned.v1"],
};

function composed() {
  return {
    schemaVersion: 1,
    capabilities: [{
      id: "finance",
      coverage: { serviceOwner: row.serviceOwner, featureGate: row.featureGate, classifications: ["runtime_mutable"] },
      service: row.serviceOwner,
      exposure: "composed",
      featureFlag: { name: row.featureGate, runtimeMutable: true, defaultEnabled: false },
      planes: ["neon"],
      repositoryProvider: { id: "finance-neon", module: row.repository[0] },
      entryPoint: { id: "finance.routes", kind: "route", module: row.entryPoints[0] },
      readiness: { checks: { neon: "finance.neon-foundation" } },
      mutationBehavior: {
        permissions: { "finance.period.transition": "finance.period.manage" },
        audit: { "finance.period.transition": "finance.period.transitioned" },
        outbox: { "finance.period.transition": "finance.period.transitioned.v1" },
        rollback: { "finance.period.transition": "finance.period.reopen" },
      },
      profiles: { "athyper-server": false },
    }],
  };
}

test("accepts a complete disabled-by-default mutation chain", () => {
  assert.deepEqual(validateHostCapabilityRegistry(composed(), { rows: [row] }, { profiles: { "athyper-server": {} } }), []);
});

test("rejects an enabled runtime-mutable capability with a missing chain link", () => {
  const registry = composed();
  registry.capabilities[0].featureFlag.defaultEnabled = true;
  delete registry.capabilities[0].readiness;
  assert.match(validateHostCapabilityRegistry(registry, { rows: [row] }, { profiles: { "athyper-server": {} } }).join("\n"), /lacks readiness checks/);
});

test("rejects a supported coverage row absent from the registry", () => {
  assert.match(validateHostCapabilityRegistry({ schemaVersion: 1, capabilities: [] }, { rows: [row] }).join("\n"), /absent from the host registry/);
});

test("rejects composed registry and coverage evidence drift", () => {
  const registry = composed();
  registry.capabilities[0].repositoryProvider.module = "wrong-provider.ts";
  assert.match(validateHostCapabilityRegistry(registry, { rows: [row] }).join("\n"), /does not name repository provider module/);
});
