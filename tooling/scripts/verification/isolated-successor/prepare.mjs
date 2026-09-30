/** Prepare a fresh successor sandbox. The previous isolated instance is never modified. */
import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import { createHash } from "node:crypto";
const proposalPath =
    "governance/policy/reviews/business-partner-successor-isolated-transfer-grants.proposal.dev.json",
  bytes = fs.readFileSync(proposalPath),
  p = JSON.parse(bytes),
  sha = (b) => createHash("sha256").update(b).digest("hex");
const approvalPath =
  "governance/policy/reviews/business-partner-successor-isolated-transfer-grants.approval.dev.json";
const approval = JSON.parse(fs.readFileSync(approvalPath));
if (
  approval.proposalSha256 !== sha(bytes) ||
  approval.proposalRevision !== p.proposalRevision ||
  approval.isolatedGrantsApproved !== true ||
  approval.sharedDevGrantChangesAuthorized !== false ||
  approval.activationAuthorized !== false
)
  throw Error("Exact isolated proposal approval required");
const target = "bp-release-19-successor-20260911",
  old = "bp-release-19-isolated-20260910",
  root = os.homedir() + "/.athyper/instances/dev/deployments/" + target;
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
fs.mkdirSync(root + "/scripts", { mode: 0o700 });
const transform = (s) =>
  s.replaceAll(old, target).replaceAll("athyper-bp-r19-", "athyper-bp-r19s-");
const names = [
  "provision-business-partner-r19.mjs",
  "prepare-runtime.mjs",
  "initialize-stores.mjs",
];
for (const name of names) {
  const source = fs.readFileSync(
    "tooling/scripts/verification/isolated-execution/" + name,
    "utf8",
  );
  fs.writeFileSync(root + "/scripts/" + name, transform(source), {
    mode: 0o600,
    flag: "wx",
  });
}
const manifest = {
  schemaVersion: 1,
  root,
  proposalRevision: p.proposalRevision,
  runtimeImage: p.runtimeImage,
  artifactHash: p.artifactHash,
  transformedScripts: Object.fromEntries(
    names.map((name) => [
      name,
      sha(fs.readFileSync(root + "/scripts/" + name)),
    ]),
  ),
  priorInstanceModified: false,
};
fs.writeFileSync(
  root + "/successor-plan.json",
  JSON.stringify(manifest, null, 2) + "\n",
  { mode: 0o600, flag: "wx" },
);
cp.execFileSync(
  "node",
  [root + "/scripts/provision-business-partner-r19.mjs"],
  { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 3000000 },
);
for (const name of ["artifact.json", "public-key.pem", "public-key.der"])
  fs.copyFileSync(
    os.homedir() + "/.athyper/instances/dev/deployments/" + old + "/" + name,
    root + "/" + name,
  );
if (sha(fs.readFileSync(root + "/artifact.json")) !== p.artifactHash)
  throw Error("Artifact mismatch");
cp.execFileSync("node", [root + "/scripts/prepare-runtime.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  maxBuffer: 3000000,
});
console.log(
  JSON.stringify({
    root,
    prepared: true,
    priorInstanceModified: false,
    sharedGrantsChanged: false,
  }),
);
