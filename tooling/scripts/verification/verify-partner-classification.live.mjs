import assert from "node:assert/strict";
import { actor } from "./partner-classification-session.mjs";
import { id } from "../../fixtures/business-partner-core/seed.mjs";
if (!process.argv.includes("--run"))
  throw Error(
    "Use --run for the explicitly scoped CATL demo acceptance journey",
  );
const admin = await actor("catl.admin"),
  owner = await actor("catl.owner");
const bp = id("cirrusatlantic", "partner"),
  path = "neon/business-partners/" + bp + "/commodity-classifications";
const evidence = [];
const expect = async (client, p, body, status = 200) => {
  const r = await client.call(p, body);
  assert.equal(
    r.status,
    status,
    JSON.stringify({ path: p, status: r.status, body: r.body }),
  );
  return r.body;
};
try {
  const command = {
    commodityCategoryId: id("cirrusatlantic", "commodity-category"),
    effectiveFrom: "2026-09-23",
    sourceSystem: "dev_acceptance",
    sourceReference: "partner-classification-r20",
    notes:
      "Synthetic role-free command acceptance; archived after independent verification.",
    idempotencyKey: "classification-r20-declare-20260923",
  };
  const declared = await expect(admin, path + "/declare", command);
  const classificationId = declared.classification.id;
  evidence.push({
    check: "declare",
    classificationId,
    replayed: declared.replayed,
  });
  const replay = await expect(admin, path + "/declare", command);
  assert.equal(replay.classification.id, classificationId);
  assert.equal(replay.replayed, true);
  evidence.push({ check: "declare replay", passed: true });
  await expect(
    admin,
    path + "/declare",
    { ...command, sourceReference: "different" },
    409,
  );
  await expect(
    owner,
    path + "/declare",
    { ...command, idempotencyKey: "classification-r20-owner-denied" },
    403,
  );
  await expect(
    admin,
    "neon/business-partners/" +
      id("athyper", "partner") +
      "/commodity-classifications",
    undefined,
    404,
  );
  evidence.push({
    check:
      "idempotency conflict, ungranted declaration and cross-tenant denial",
    passed: true,
  });
  const verify = {
    classificationId,
    expectedVersion: 1,
    evidenceReference: "DEV synthetic classification acceptance r20",
    idempotencyKey: "classification-r20-verify-20260923",
  };
  await expect(admin, path + "/verify", verify, 403);
  const verified = await expect(owner, path + "/verify", verify);
  assert.equal(verified.classification.assignment_kind, "verified");
  evidence.push({ check: "independent MFA verification", passed: true });
  const verifyReplay = await expect(owner, path + "/verify", verify);
  assert.equal(verifyReplay.replayed, true);
  const archive = {
    classificationId,
    expectedVersion: 2,
    reason:
      "Synthetic acceptance complete; preserve the reusable demo declaration unchanged.",
    idempotencyKey: "classification-r20-archive-20260923",
  };
  const archived = await expect(admin, path + "/archive", archive);
  assert.equal(archived.classification.status, "archived");
  assert.equal(
    (await expect(admin, path + "/archive", archive)).replayed,
    true,
  );
  const read = await expect(admin, path);
  assert.ok(!read.items.some((x) => x.id === classificationId));
  assert.ok(
    read.items.some(
      (x) => x.id === id("cirrusatlantic", "commodity-classification"),
    ),
  );
  evidence.push({
    check: "MFA archive, safe retries and demo retained",
    passed: true,
  });
  console.log(
    JSON.stringify({ passed: true, businessPartnerId: bp, evidence }, null, 2),
  );
} finally {
  await admin.dispose();
  await owner.dispose();
}
