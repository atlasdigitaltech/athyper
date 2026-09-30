import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { it } from "node:test";

import {
  validateSuspensionControlContract,
  type SuspensionControlContract,
} from "../../seed/cross-plane-suspension-control-model.js";

const contractPath = resolve(
  import.meta.dirname,
  "../../../seed/contracts/authorization/control/cross-plane-suspension-control.v1.json",
);

async function contract(): Promise<SuspensionControlContract> {
  return JSON.parse(
    await readFile(contractPath, "utf8"),
  ) as SuspensionControlContract;
}

it("publishes one honest contract for every suspension control class", async () => {
  const value = await contract();
  assert.doesNotThrow(() => validateSuspensionControlContract(value));
  assert.deepEqual(
    value.controls.map((control) => control.controlClass),
    [
      "local_business_deny",
      "principal_suspension",
      "tenant_organization_suspension",
      "identity_provider_session_invalidation",
      "emergency_platform_kill_switch",
    ],
  );
  assert.equal(
    value.controls.find(
      (control) => control.controlClass === "emergency_platform_kill_switch",
    )?.implementationStatus,
    "not_implemented",
  );
});

it("rejects invented global convergence without a durable measured orchestrator", async () => {
  const value = structuredClone(await contract());
  const principal = value.controls.find(
    (control) => control.controlClass === "principal_suspension",
  )!;
  Object.assign(principal, {
    targetPlanes: ["studio_neon_mesh"],
    propagation: {
      ...principal.propagation,
      convergence: {
        ...principal.propagation.convergence,
        guarantee: "transactional_local",
      },
    },
  });
  assert.throws(
    () => validateSuspensionControlContract(value),
    /transactional convergence across planes/,
  );
});

it("rejects application projection as principal-specific suspension", async () => {
  const value = structuredClone(await contract());
  const principal = value.controls.find(
    (control) => control.controlClass === "principal_suspension",
  )!;
  Object.assign(principal.propagation, {
    mechanisms: ["Suspend authz.application_projection"],
  });
  assert.throws(
    () => validateSuspensionControlContract(value),
    /organization admission, not principal suspension/,
  );
});

it("keeps all four authorization release blockers in the corrected priority order", async () => {
  const value = await contract();
  assert.deepEqual(
    value.deliveryPriorities
      .slice(0, 4)
      .map((item) => [item.id, item.criterion]),
    [
      ["W1A", "release_blocker"],
      ["W1B", "release_blocker"],
      ["W2", "release_blocker"],
      ["W5", "release_blocker"],
    ],
  );
  assert.doesNotMatch(
    value.reportCorrections.releaseBlockerStatement,
    /only release blocker/i,
  );
});
