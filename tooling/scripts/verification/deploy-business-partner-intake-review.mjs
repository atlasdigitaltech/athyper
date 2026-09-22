import { assertReviewPorts } from "./review-port-contract.mjs";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const apply = process.argv.includes("--apply");
if (process.argv.slice(2).some((a) => a !== "--apply"))
  throw Error("Invalid argument");
const instance = join(homedir(), ".athyper/instances/dev/deployments");
const old = join(instance, "bp-enter-correction-review-20260911/review.compose.json");
const root = join(instance, "bp-intake-review-v2-20260921"),
  review = join(root, "review");
mkdirSync(join(review, "output"), { recursive: true, mode: 0o700 });
const packetPath =
  "governance/policy/reviews/business-partner-intake-runtime-workflow-v2.dev.json";
const bytes = readFileSync(packetPath),
  packet = JSON.parse(bytes);
if (
  packet.releaseReview.coordinate.releaseId !==
    "7bdb29f6-6b01-4385-867d-06357504f6ca" ||
  packet.rows.length !== 51
)
  throw Error("Exact release review required");
copyFileSync(packetPath, join(review, "packet.json"));
copyFileSync(
  "governance/policy/reviews/business-partner-intake-runtime-reviewers-v2.dev.json",
  join(review, "nomination.json"),
);
for (const name of ["packet.json", "nomination.json"])
  chmodSync(join(review, name), 0o600);
const config = JSON.parse(readFileSync(old));
const service = config.services["bp-operation-review"];
assertReviewPorts(config);
Object.assign(service.environment, {
  LOCAL_BP_OPERATION_REVIEW_ENABLED: "true",
  LOCAL_BP_OPERATION_REVIEW_NOMINATION: "/review/nomination.json",
  LOCAL_BP_OPERATION_REVIEW_PACKET: "/review/packet.json",
  LOCAL_BP_OPERATION_REVIEW_OUTPUT: "/review/output",
});
service.environment.LOCAL_BP_OPERATION_REVIEW_PACKET_SHA256 = createHash(
  "sha256",
)
  .update(bytes)
  .digest("hex");
for (const mount of service.volumes)
  if (mount.target.startsWith("/review/"))
    mount.source = join(review, mount.target.slice("/review/".length));
const path = join(root, "review.compose.json");
writeFileSync(path, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
if (apply)
  execFileSync(
    "docker",
    [
      "compose",
      "-p",
      "athyper-dev",
      "-f",
      path,
      "up",
      "-d",
      "--no-deps",
      "--no-build",
      "bp-operation-review",
    ],
    { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 },
  );
const report = {
  schemaVersion: 1,
  kind: "bp_intake_review_deployment",
  capturedAt: new Date().toISOString(),
  packetRevision: packet.packetRevision,
  packetSha256: service.environment.LOCAL_BP_OPERATION_REVIEW_PACKET_SHA256,
  composePath: path,
  rollbackComposePath: old,
  outputDirectory: join(review, "output"),
  applied: apply,
  approvalsCreated: false,
  grantsChanged: false,
  activationAuthorized: false,
};
writeFileSync(
  "docs/reports/bp-integration-20260921/intake-review-deployment.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log({
  applied: apply,
  packetRevision: packet.packetRevision,
  approvalsCreated: false,
});
