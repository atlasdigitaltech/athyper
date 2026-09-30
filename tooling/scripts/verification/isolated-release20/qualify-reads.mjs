import fs from "node:fs";
import cp from "node:child_process";
import { createHash } from "node:crypto";
const proof = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-v2-runtime-verification.dev.json",
  ),
);
const report = {
  schemaVersion: 1,
  kind: "release20_authenticated_reads",
  capturedAt: new Date().toISOString(),
  releaseId: proof.releaseId,
  artifactHash: proof.artifactHash,
  imageId: proof.imageId,
  checks: [],
  fullQualification: false,
  grantsChanged: false,
};
const record = "f7688c3d-8c92-5651-a469-da3f4f786375",
  base = "/api/neon/business-partners/" + record + "/360/";
const q =
  "?operatingOrganizationId=a478f9c0-8226-5d22-9599-b8fb27a45180&companyCodeId=793b6cb3-3c61-57c0-9562-2cbc288bd4cf";
for (const account of ["catl.admin", "catl.owner"])
  for (const path of [
    "/api/entity-runtime/business_partner/list-descriptor",
    "/api/entity-runtime/business_partner/list?limit=10",
    "/api/entity-runtime/business_partner/records/" + record,
    ...[
      "summary",
      "identity",
      "contacts",
      "addresses",
      "identifiers",
      "roles",
      "banking",
      "qualifications",
      "requests",
      "activity",
      "comments",
      "attachments",
    ].flatMap((s) => [base + s, base + s + q]),
  ]) {
    const r = JSON.parse(
      cp.execFileSync(
        "docker",
        [
          "exec",
          "athyper-bp-r20-auth-client",
          "node",
          "/app/server/qualification-client/session-client.mjs",
          account,
          path,
          "GET",
        ],
        {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
          maxBuffer: 3000000,
        },
      ),
    );
    report.checks.push({
      account,
      path,
      status: r.status,
      artifactMatched: r.artifact === proof.artifactHash,
      releaseMatched: r.releaseId === proof.releaseId,
      requestRef: createHash("sha256")
        .update(r.requestId ?? "")
        .digest("hex"),
      errorCode: r.body?.code ?? r.body?.error ?? null,
      bodyKeys: r.body && typeof r.body === "object" ? Object.keys(r.body) : [],
      ...(path === base + "summary"
        ? { identityMatched: r.body?.identity?.id === record }
        : {}),
    });
    fs.writeFileSync(
      "governance/policy/reports/business-partner-release-20-read-qualification.dev.json",
      JSON.stringify(report, null, 2) + "\n",
    );
  }
report.transportQualified = report.checks.every(
  (c) => c.artifactMatched && c.releaseMatched && c.status < 500,
);
report.summaryReadsQualified = report.checks
  .filter((c) => "identityMatched" in c)
  .every((c) => c.status === 200 && c.identityMatched);
report.completed = true;
fs.writeFileSync(
  "governance/policy/reports/business-partner-release-20-read-qualification.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log({
  checks: report.checks.length,
  summaryReadsQualified: report.summaryReadsQualified,
  transportQualified: report.transportQualified,
  statuses: report.checks.reduce(
    (a, c) => ((a[c.status] = (a[c.status] ?? 0) + 1), a),
    {},
  ),
});
