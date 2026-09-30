import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  proposal as p,
  base,
  coordinates,
  send,
} from "./affordance-count-client.mjs";
const output =
  "governance/policy/reports/business-partner-summary-context-remaining-api-20260912.dev.json";
assert(!fs.existsSync(output));
const report = {
  createdAt: new Date().toISOString(),
  runtimeImage: p.runtimeImage,
  releaseSetHash: p.releaseSetHash,
  checks: [],
  complete: false,
};
const save = () =>
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
save();
function check(actor, surface, verify) {
  const r = send(actor, base + surface + coordinates);
  const c = {
    actor,
    surface,
    status: r.status,
    responseSha256: createHash("sha256")
      .update(JSON.stringify(r.body))
      .digest("hex"),
    passed: false,
  };
  report.checks.push(c);
  save();
  assert.equal(r.status, 200);
  verify(r.body);
  c.passed = true;
  save();
}
check("catl.owner", "banking", (b) => {
  const a = b.data.accounts.find(
    (a) => a.linkId === p.fixtures.protectedBankLinkId,
  );
  assert(a);
  assert.equal(a.revealable, false);
  assert.equal(a.lastFour, "5432");
});
check("catl.owner", "identifiers-tax", (b) =>
  assert.equal(
    b.data.items.find((t) => t.id === p.fixtures.taxRegistrationId).revealable,
    false,
  ),
);
check("catl.admin", "requests", (b) => {
  assert.equal(b.data.openWork.active, 2);
  for (const id of p.ordinaryDrafts.existingIds)
    assert(b.data.items.some((x) => x.id === id));
});
check("catl.owner", "requests", (b) => {
  assert.deepEqual(b.data.items, []);
  assert(!Object.hasOwn(b.data, "openWork"));
});
report.complete = true;
save();
console.log({ complete: true, checks: report.checks });
