import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fixtures, company } from "./protected-reveal-client.mjs";
const source =
    "governance/policy/reports/business-partner-protected-reveal-fields-and-counts-20260912.dev.json",
  raw = JSON.parse(fs.readFileSync(source)),
  checks = [];
const hash = (p) =>
  createHash("sha256").update(fs.readFileSync(p)).digest("hex");
for (const entry of raw.checks) {
  assert.equal(entry.status, 200);
  const r = JSON.parse(fs.readFileSync(entry.responsePath));
  assert.equal(
    createHash("sha256").update(JSON.stringify(r)).digest("hex"),
    entry.responseSha256,
  );
  const label = entry.label;
  if (label.endsWith("_scoped_bank_suffix")) {
    const a = r.data.accounts.find((a) => a.linkId === fixtures.ids.bankLink);
    assert.equal(a.lastFour, "5432");
    assert.equal(a.maskedAccount.replaceAll(" ", ""), "••••5432");
    assert(!JSON.stringify(r).includes("GB82WEST12345698765432"));
  } else if (label.endsWith("_scoped_tax_mask")) {
    assert.equal(
      r.data.items.find((t) => t.id === fixtures.ids.tax).maskedValue,
      "••••",
    );
    assert(!JSON.stringify(r).includes("SYNTHETICGB123456789"));
  } else if (label.endsWith("_nested_company_fields")) {
    assert.equal(r.data.profile.companyCodeId, company);
    assert(
      r.data.customer.id &&
        r.data.organizationAssignment.id &&
        r.data.profile.paymentTermId &&
        r.data.profile.defaultAccountingProfileId,
    );
  } else if (label === "bank_suffix_matches_authorized_reveal") {
    assert.equal(r.value, "GB82WEST12345698765432");
    assert.equal(r.value.slice(-4), "5432");
  } else if (label.startsWith("finance_asof_")) {
    const count = { "2026-09-11": 0, "2026-09-12": 1, "2026-09-13": 2 }[
        label.slice("finance_asof_".length)
      ],
      f = r.data.providers.find((p) => p.provider === "finance");
    assert.equal(f.state, count === 0 ? "empty" : "ready");
    assert.equal(
      f.metrics.find((m) => m.code === "draft_journals").value,
      count,
    );
    assert.equal(f.metrics.find((m) => m.code === "posted_journals").value, 0);
  } else throw Error("Unknown evidence");
  checks.push({ label, passed: true, responseSha256: entry.responseSha256 });
}
assert.equal(checks.length, 10);
const report = {
  createdAt: new Date().toISOString(),
  runtimeImage: raw.runtimeImage,
  releaseSetHash: raw.releaseSetHash,
  complete: true,
  checks,
  source: { path: source, sha256: hash(source) },
  scope:
    "Narrow assessment of retained authenticated responses: masking consistency, populated nested company fields and SQL date-filtered journal counts.",
  priorFailedAssertionsPreserved: true,
  correctedTestExpectation:
    "A zero-count Finance provider correctly reports empty while carrying zero metrics.",
  openDefect:
    "Admin read-provider revealable flags remain false despite separately admitted reveal commands. UI command-preflight integration is not qualified or accepted by this assessment.",
  positiveOrdinaryCaseOpenWorkCountsQualified: false,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-protected-reveal-mask-count-assessment-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log({
  complete: true,
  checks: checks.length,
  uiRevealAffordanceQualified: false,
});
