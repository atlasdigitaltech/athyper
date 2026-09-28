/** DEV benchmark gate, not a wall-clock unit test for arbitrary CI machines. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const [attachmentPath, detailPath] = process.argv.slice(2);
if (!attachmentPath || !detailPath) throw Error("Usage: check-performance-budgets.mts <paired attachment report> <detail report>");
const attachments = JSON.parse(readFileSync(attachmentPath, "utf8"));
const detail = JSON.parse(readFileSync(detailPath, "utf8"));
assert.equal(attachments.rolledBack, true);
assert.ok(attachments.runs >= 5 && attachments.series >= 1000);
// Rounded ~2x measured candidate maximum at 10,000 target series. Relative
// improvement alone would allow a large regression from the new baseline.
const volumeBudgets: Record<string, number> = { browse: 200, name: 105, category: 80,
  unfiled: 205, cursor: 185, history: 35, content: 50, contentCursor: 45 };
for (const check of ["allPages", "pinnedWinner", "recordIsolation", "tenantIsolation", "history"])
  assert.equal(attachments.correctness?.[check], true, `Missing correctness evidence: ${check}`);
for (const scenario of ["browse", "name", "category", "unfiled", "cursor", "history", "content", "contentCursor"]) {
  const baseline = attachments.summary.find((row: any) => row.variant === "baseline" && row.scenario === scenario);
  const candidate = attachments.summary.find((row: any) => row.variant === "candidate" && row.scenario === scenario);
  assert.ok(baseline && candidate, `Missing paired measurement: ${scenario}`);
  // Paired SQL runs use identical data/role on the same machine. A 2x + 5 ms
  // allowance protects small/unchanged paths from noisy micro-timing failures.
  const ratio = ["browse", "unfiled", "cursor"].includes(scenario) ? 0.5 : 2;
  assert.ok(candidate.medianMs <= baseline.medianMs * ratio + 5, `${scenario}: median budget exceeded`);
  assert.ok(candidate.p95Ms <= baseline.p95Ms * 2 + 5, `${scenario}: tail budget exceeded`);
  if (attachments.series === 10000)
    assert.ok(candidate.p95Ms <= volumeBudgets[scenario]!, `${scenario}: measured 10,000-series budget exceeded`);
}
for (const sample of attachments.plans.filter((row: any) => row.variant === "candidate" && row.scenario === "browse")) {
  const visit = (node: any): void => {
    if (node["Function Name"] === "collaboration_principal_candidates")
      assert.ok(node["Actual Loops"] <= 51, "Attribution escaped the bounded page");
    for (const child of node.Plans ?? []) visit(child);
  };
  visit(sample.plan[0].Plan);
}
assert.equal(detail.hookDelayMs.collaboration, 40);
assert.equal(detail.hookDelayMs.summary, 70);
assert.ok(detail.runs >= 12);
// Measured sequential median 110.80 ms; parallel median 70.75 ms.
assert.ok(detail.medianMs <= 95, "Detail hooks regressed toward sequential execution");
assert.ok(detail.p95Ms <= 130, "Detail hook tail budget exceeded");
assert.ok(detail.samples.every((sample: any) => sample.startSpreadMs < 20), "Hooks no longer start together");
console.log("Performance and correctness budgets passed");
