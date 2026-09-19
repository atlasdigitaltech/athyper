import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  proposal,
  bp,
  base,
  coordinates,
  send,
  docker,
  fingerprint,
} from "./protected-reveal-client.mjs";
const sha = (x) => createHash("sha256").update(x).digest("hex");
const all = [];
for (const actor of ["catl.admin", "catl.owner"]) {
  const before = fingerprint(),
    start = new Date().toISOString(),
    checks = [];
  for (const path of [
    base + "summary",
    base + "summary" + coordinates,
    "/api/entity-runtime/business_partner/application-descriptor",
    "/api/entity-runtime/business_partner/detail-descriptor?recordId=" + bp,
    "/api/entity-runtime/business_partner/list-descriptor",
    "/api/entity-runtime/business_partner/form-descriptor?mode=create",
    "/api/entity-runtime/business_partner/form-descriptor?mode=edit",
  ]) {
    const r = send(actor, path, "GET");
    checks.push({
      path,
      status: r.status,
      releaseSet: r.releaseSet,
      responseSha256: sha(JSON.stringify(r.body)),
    });
    console.log({ actor, path, status: r.status });
  }
  const end = new Date().toISOString();
  const events = docker([
    "logs",
    "--since",
    start,
    "--until",
    end,
    "athyper-bp-enter-api",
  ])
    .split("\n")
    .flatMap((line) => {
      try {
        const e = JSON.parse(line);
        return e.kind === "isolated_target_decision" ? [e] : [];
      } catch {
        return [];
      }
    });
  assert.deepEqual(fingerprint(), before);
  const groups = new Map();
  for (const e of events) {
    if (!e.evaluationRef) continue;
    const list = groups.get(e.evaluationRef) ?? [];
    list.push(e);
    groups.set(e.evaluationRef, list);
  }
  const comparisons = [...groups].flatMap(([evaluationRef, trace]) => {
    const source = trace.find((e) =>
      ["source_authority", "source_scope"].includes(e.stage),
    );
    const finish = trace.findLast((e) => e.stage === "backend_complete");
    if (!source || !finish) return [];
    const target = trace.findLast(
      (e) =>
        e.operationKey === source.requestedOperationKey &&
        e.stage !== "backend_complete" &&
        !["source_authority", "source_scope", "source_constraints"].includes(
          e.stage,
        ),
    );
    return [
      {
        evaluationRef,
        operationKey: source.requestedOperationKey,
        sourcePermissionCode: source.sourcePermissionCode,
        sourceAuthority: source.state,
        sourceStage: source.stage,
        targetState: target?.state ?? "not_evaluated",
        targetStage: target?.stage ?? "not_evaluated",
        backendState: finish.state,
        trace,
      },
    ];
  });
  assert(comparisons.length > 0);
  const report = {
    createdAt: new Date().toISOString(),
    actor,
    runtimeImage: proposal.runtimeImage,
    releaseSetHash: proposal.releaseSetHash,
    releaseId: proposal.releaseId,
    artifactHash: proposal.artifactHash,
    proposalRevision: proposal.proposalRevision,
    kind: "authenticated_current_source_target_comparison",
    effectiveAuthority:
      "isolated_source_target_intersection_with_published_canonical_reads",
    start,
    end,
    checks,
    comparisons,
    grantChanges: [],
    authorityUnchanged: true,
    diagnosticComplete: checks.every((c) => c.status < 500),
  };
  const output =
    "governance/policy/reports/business-partner-protected-reveal-comparisons-" +
    actor.split(".")[1] +
    "-20260912.dev.json";
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
  all.push({
    actor,
    checks: checks.length,
    comparisons: comparisons.length,
    complete: report.diagnosticComplete,
    operations: [...new Set(comparisons.map((c) => c.operationKey))],
  });
}
console.log(all);
