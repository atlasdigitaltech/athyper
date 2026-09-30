import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import { createHash } from "node:crypto";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
import { artifactHash, releaseId } from "./release-boundary.mjs";
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-release-19-successor-20260911",
  candidate = JSON.parse(fs.readFileSync(root + "/shadow-candidate.json"));
const docker = (args, input) =>
  cp.execFileSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 16000000,
    stdio: ["pipe", "pipe", "pipe"],
  });
const state = JSON.parse(docker(["inspect", "athyper-bp-r19s-shadow-api"]))[0];
if (
  !state.State.Running ||
  state.Image !== candidate.image ||
  state.Id !== candidate.id
)
  throw Error("Shadow image mismatch");
for (const account of ["catl.admin", "catl.owner"]) {
  const start = new Date().toISOString(),
    authority = assertAuthorityUnchanged("revoked"),
    checks = [];
  const base =
      "/api/neon/business-partners/f7688c3d-8c92-5651-a469-da3f4f786375/360/",
    q =
      "?operatingOrganizationId=a478f9c0-8226-5d22-9599-b8fb27a45180&companyCodeId=793b6cb3-3c61-57c0-9562-2cbc288bd4cf";
  for (const path of [
    "summary",
    ...[
      "summary",
      "identity",
      "contacts",
      "addresses",
      "identifiers-tax",
      "roles-scope",
      "banking",
      "qualifications-certificates",
      "requests",
      "activity",
      "comments",
      "attachments",
    ].map((s) => s + q),
  ]) {
    const r = JSON.parse(
      docker([
        "exec",
        "-i",
        "athyper-bp-r19s-auth-client",
        "node",
        "/app/server/qualification-client/shadow-session-client.mjs",
        account,
        base + path,
        "GET",
      ]),
    );
    checks.push({
      path: base + path,
      status: r.status,
      artifact: r.artifact,
      requestRef: createHash("sha256")
        .update(r.requestId ?? "")
        .digest("hex"),
    });
    if (r.artifact !== artifactHash || r.status >= 500)
      throw Error("Shadow execution unavailable");
  }
  const events = docker([
    "logs",
    "--since",
    start,
    "athyper-bp-r19s-shadow-api",
  ])
    .split("\n")
    .flatMap((line) => {
      try {
        const e = JSON.parse(line);
        return e.event === "bp_authorization_shadow" ? [e] : [];
      } catch {
        return [];
      }
    });
  if (assertAuthorityUnchanged("revoked").sha256 !== authority.sha256)
    throw Error("Authority changed");
  const comparisons = events.filter((e) => e.kind === "decision"),
    gaps = events.filter((e) => e.kind === "mapping_gap" || e.kind === "error");
  const report = {
    schemaVersion: 1,
    kind: "isolated_authenticated_read_shadow",
    capturedAt: new Date().toISOString(),
    releaseId,
    artifactHash,
    candidate,
    mode: "shadow",
    effectiveAuthority: "legacy",
    grantChanges: [],
    authority,
    account,
    authenticatedChecks: checks.length,
    checks,
    shadowDecisionCount: comparisons.length,
    comparisons,
    mappingGaps: gaps,
    diagnosticComplete: comparisons.length > 0 && gaps.length === 0,
    fullExactReleaseQualification: false,
  };
  const file =
    "governance/policy/reports/business-partner-read-shadow-" +
    account +
    "." +
    candidate.image.replace(/^sha256:/, "").slice(0, 12) +
    ".dev.json";
  if (fs.existsSync(file))
    throw Error(
      "Shadow evidence already exists; retain it and use a separately named capture",
    );
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      file,
      comparisons: comparisons.length,
      gaps: gaps.length,
      diagnosticComplete: report.diagnosticComplete,
    }),
  );
}
