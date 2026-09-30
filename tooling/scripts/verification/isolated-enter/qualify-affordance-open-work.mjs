import { run, proposalPrefix } from "./affordance-count-run.mjs";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { docker, sql, quote, fingerprint } from "./protected-reveal-client.mjs";
const p = JSON.parse(fs.readFileSync(proposalPrefix + ".proposal.dev.json")),
  f = p.fixtures,
  base = "/api/neon/business-partners/" + f.businessPartnerId + "/360/",
  coords =
    "?operatingOrganizationId=" +
    f.operatingOrganizationId +
    "&companyCodeId=" +
    f.companyCodeId,
  output = `governance/policy/reports/business-partner-affordance-open-work-live-qualified-${run}.dev.json`;
assert(!fs.existsSync(output));
const report = {
  createdAt: new Date().toISOString(),
  runtimeImage: p.runtimeImage,
  uiImage: p.uiImage,
  releaseSetHash: p.releaseSetHash,
  proposalRevision: p.proposalRevision,
  draftIds: [...(p.ordinaryDrafts.existingIds ?? [])],
  checks: [],
  complete: false,
};
const save = () =>
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
save();
const privateDir =
  os.homedir() +
  `/.athyper/qualification/bp/affordance-count-live-qualified-${run}`;
fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
const send = (actor, label, path, method, body, verify) => {
  assert(Date.now() < Date.parse(p.effectiveUntil));
  const before = fingerprint();
  const r = JSON.parse(
    docker(
      [
        "exec",
        "-i",
        "athyper-bp-enter-ui-session-client",
        "node",
        "/app/server/qualification-client/session-client.mjs",
        actor,
        path,
        method,
      ],
      JSON.stringify(body ?? {}),
    ),
  );
  assert.deepEqual(fingerprint(), before);
  assert.equal(r.releaseSet, p.releaseSetHash);
  const bytes = JSON.stringify(r.body);
  fs.writeFileSync(privateDir + "/" + label + ".json", bytes, { mode: 0o600 });
  const c = {
    actor,
    label,
    status: r.status,
    responseSha256: createHash("sha256").update(bytes).digest("hex"),
    passed: false,
  };
  report.checks.push(c);
  save();
  verify(r);
  c.passed = true;
  save();
  return r;
};
for (const actor of ["catl.admin", "catl.owner"]) {
  send(
    actor,
    actor + "_summary_case_boundary",
    base + "summary" + coords,
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 200);
      if (actor === "catl.admin") {
        assert.equal(r.body.openWork.activeRequestCount, 2);
      } else {
        assert(!Object.hasOwn(r.body.openWork, "activeRequestCount"));
        assert(!Object.hasOwn(r.body.openWork, "returnedRequestCount"));
        assert.deepEqual(r.body.recentActivity, []);
        assert(
          !Object.hasOwn(
            r.body.sections.find((s) => s.code === "requests") ?? {},
            "count",
          ),
        );
      }
    },
  );
  send(
    actor,
    actor + "_bank_affordance",
    base + "banking" + coords,
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 200);
      const a = r.body.data.accounts.find(
        (a) => a.linkId === f.protectedBankLinkId,
      );
      assert(a);
      assert.equal(a.revealable, actor === "catl.admin");
      assert.equal(a.lastFour, "5432");
      assert(!JSON.stringify(r.body).includes("GB82WEST12345698765432"));
    },
  );
  send(
    actor,
    actor + "_tax_affordance",
    base + "identifiers-tax" + coords,
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 200);
      assert.equal(
        r.body.data.items.find((t) => t.id === f.taxRegistrationId).revealable,
        actor === "catl.admin",
      );
    },
  );
}
for (let i = 0; i < p.ordinaryDrafts.count; i++) {
  const created = send(
    "catl.admin",
    "ordinary_draft_" + i,
    "/api/neon/business-partner-cases",
    "POST",
    {
      kind: "deactivate",
      source: { kind: "manual" },
      targetBusinessPartnerId: f.businessPartnerId,
      operatingOrganizationId: f.operatingOrganizationId,
      proposedPayload: {
        displayName: "Synthetic open-work qualification; draft only",
      },
      idempotencyKey: "affordance-open-work-" + randomUUID(),
    },
    (r) => {
      assert([200, 201].includes(r.status));
      assert.equal(r.body.request.status, "draft");
    },
  );
  report.draftIds.push(created.body.request.id);
  save();
}
send(
  "catl.admin",
  "positive_open_work",
  base + "requests" + coords,
  "GET",
  {},
  (r) => {
    assert.equal(r.status, 200);
    for (const id of report.draftIds)
      assert(r.body.data.items.some((x) => x.id === id));
    assert.equal(r.body.data.openWork.active, 2);
  },
);
send(
  "catl.owner",
  "parent_without_case_authority",
  base + "requests" + coords,
  "GET",
  {},
  (r) => {
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.items, []);
    assert(!Object.hasOwn(r.body.data, "openWork"));
  },
);
assert.equal(
  sql(
    `SELECT status FROM master.business_partner WHERE id=${quote(f.businessPartnerId)};`,
  ).trim(),
  "active",
);
report.existingPartnerUnchanged = true;
report.complete = true;
save();
console.log({
  complete: true,
  drafts: report.draftIds,
  checks: report.checks.length,
});
