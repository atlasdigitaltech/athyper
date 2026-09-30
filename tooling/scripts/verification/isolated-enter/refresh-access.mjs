import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Prepare only. A new window always needs a separate explicit approval.
const [inventoryPath, from, until, output, atlasOutput] = process.argv.slice(2);
assert.equal(
  process.argv.length,
  7,
  "Expected inventory, UTC start/end, two new proposal paths",
);
for (const path of [output, atlasOutput])
  assert.ok(!fs.existsSync(path), "Preserve existing proposals");
assert.ok(
  Date.parse(until) > Date.now() && Date.parse(until) > Date.parse(from),
);
assert.ok(Date.parse(until) - Date.parse(from) <= 4 * 60 * 60 * 1000);
const inventory = JSON.parse(fs.readFileSync(inventoryPath));
assert.ok(
  Date.now() - Date.parse(inventory.capturedAt) < 30 * 60 * 1000,
  "Recapture current authority",
);
const prior = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-enter-test-access.proposal.dev.json",
  ),
);
const capture = inventory.captures.find(
  (c) => c.container === prior.destination.container && c.plane === "neon",
);
assert.ok(capture);
const { proposalRevision: supersedesProposalRevision, ...body } = prior;
function refreshBatch(batch, suffix) {
  const principal = capture.principals.find(
    (p) => p.id === batch.principalId && p.status === "active",
  );
  assert.equal(principal?.code, batch.account);
  const scope = capture.scopeTargets.find(
    (s) => s.id === batch.scope.id && s.status === "active",
  );
  assert.deepEqual(scope, batch.scope, "Scope changed; review explicitly");
  const permissions = batch.permissions.map((old) => {
    const current = capture.catalog.find(
      (p) => p.id === old.id && p.code === old.code && p.status === "published",
    );
    assert.deepEqual(current, old, "Permission changed; review explicitly");
    assert.ok(
      current.scopes.some(
        (s) =>
          s.scopeKind === scope.scope_kind &&
          s.propagation === batch.propagation &&
          s.status === "active",
      ),
    );
    return current;
  });
  return {
    ...batch,
    scope,
    permissions,
    roleId: randomUUID(),
    groupId: randomUUID(),
    assignmentId: randomUUID(),
    code: batch.code + "." + suffix,
  };
}
const suffix = randomUUID().slice(0, 8);
const proposal = {
  ...body,
  supersedesProposalRevision,
  evidence: {
    path: inventoryPath,
    sha256: createHash("sha256")
      .update(fs.readFileSync(inventoryPath))
      .digest("hex"),
  },
  effectiveFrom: from,
  effectiveUntil: until,
  batches: body.batches.map((b) => refreshBatch(b, suffix)),
  approved: false,
};
const admission = capture.catalog.find(
  (p) => p.code === "neon.ai.agent.use" && p.status === "published",
);
assert.ok(admission?.requires_mfa, "Atlas admission must preserve catalog MFA");
const reader = body.batches.find(
  (b) => b.account === "catl.admin" && b.purpose === "reads",
);
const atlas = {
  ...proposal,
  kind: "isolated_bp_atlas_admission_access",
  supersedesProposalRevision: null,
  batches: [
    refreshBatch(
      {
        ...reader,
        purpose: "atlas",
        code: "bp.enter.test.admin.atlas",
        permissions: [admission],
      },
      suffix,
    ),
  ],
  conditions: {
    ...proposal.conditions,
    resourceBoundary:
      "Atlas admission is tenant-exact in the isolated clone. Admission alone grants no record or field access. All tool, Records and field authorization checks remain mandatory.",
    testDiscipline:
      "Use the BP qualification retrieval journey only. No external model calls or full conversation qualification are included.",
  },
  excluded: [
    ...proposal.excluded,
    "BP reads and mutations: proposed separately",
    "Atlas access for catl.owner; retained as admission-negative persona",
  ],
};
for (const [path, value] of [
  [output, proposal],
  [atlasOutput, atlas],
]) {
  value.proposalRevision = createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  console.log({
    path,
    proposalRevision: value.proposalRevision,
    permissionAssignments: value.batches.reduce(
      (n, b) => n + b.permissions.length,
      0,
    ),
    approved: false,
    applied: false,
  });
}
