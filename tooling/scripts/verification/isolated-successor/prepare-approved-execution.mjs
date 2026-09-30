import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import { createHash } from "node:crypto";
const base = "governance/policy/reviews/",
  bytes = fs.readFileSync(
    base + "business-partner-successor-execution-image.amendment.dev.json",
  ),
  m = JSON.parse(bytes),
  a = JSON.parse(
    fs.readFileSync(
      base + "business-partner-successor-execution-image.acceptance.dev.json",
    ),
  );
const withdrawn =
  "governance/policy/reviews/business-partner-successor-execution-image.amendment.withdrawn.dev.json";
if (
  fs.existsSync(withdrawn) &&
  JSON.parse(fs.readFileSync(withdrawn)).revision === m.revision
)
  throw Error("Execution amendment withdrawn");
const hash = (b) => createHash("sha256").update(b).digest("hex");
if (
  a.amendmentSha256 !== hash(bytes) ||
  a.revision !== m.revision ||
  a.accepted !== true ||
  a.activationAuthorized !== false
)
  throw Error("Exact image amendment acceptance required");
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-release-19-successor-20260911",
  artifact = JSON.parse(fs.readFileSync(root + "/artifact.json")),
  d = artifact.envelope.payload.entityDescriptor;
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
const digest = (v) => hash(JSON.stringify(canonical(v)));
if (hash(fs.readFileSync(root + "/artifact.json")) !== m.artifactHash)
  throw Error("Pinned artifact changed");
const manifest = artifact.manifest;
const config = {
  schemaVersion: 1,
  tenantId: m.tenantId,
  publicationKey: manifest.publicationKey,
  artifactPath: "/release/artifact.json",
  artifactHash: m.artifactHash,
  runtimeImage: m.runtimeImage,
  artifactReference: {
    artifactUri: "isolated://artifact",
    artifactHash: m.artifactHash,
    targetPlane: "neon",
    publicationKey: manifest.publicationKey,
    sourceReleaseId: m.releaseId,
    sourceReleaseNo: 19,
    signatureAlgorithm: manifest.signatureAlgorithm,
    signingKeyId: manifest.signingKeyId,
    signature: artifact.signature,
  },
  rollout: {
    schemaVersion: 1,
    mode: "shadow",
    release: {
      entityCode: "business_partner",
      planeKey: "neon",
      descriptorHash: d.compiledHash,
      profileHash: digest(d.descriptor.authorization),
      bindingsHash: digest(d.descriptor.authorizationRuntime),
      runtimeVersion: d.descriptor.authorizationRuntime.runtimeVersion,
    },
  },
};
fs.writeFileSync(
  root + "/deployment.json",
  JSON.stringify(config, null, 2) + "\n",
  { mode: 0o600 },
);
fs.writeFileSync(
  root + "/execution-image.json",
  JSON.stringify({
    runtimeImage: m.runtimeImage,
    amendmentRevision: m.revision,
    artifactHash: m.artifactHash,
  }) + "\n",
  { mode: 0o600 },
);
for (const mode of ["api", "worker"]) {
  const name = "athyper-bp-r19s-" + mode;
  const inspect = JSON.parse(
    cp.execFileSync("docker", ["inspect", name], { encoding: "utf8" }),
  )[0];
  if (inspect.State.Running)
    throw Error("Stop successor processes before changing execution image");
  fs.writeFileSync(
    root + "/prior-" + mode + "-logs.txt",
    cp.execFileSync("docker", ["logs", name], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }),
    { mode: 0o600 },
  );
  cp.execFileSync("docker", ["rm", name], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}
console.log(
  JSON.stringify({
    prepared: true,
    runtimeImage: m.runtimeImage,
    grantsChanged: false,
  }),
);
