/** Prepare exact API/worker staging and rollback files. Never changes grants or release heads. */
import fs from "node:fs";
import cp from "node:child_process";
import os from "node:os";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const imageTag =
  process.argv[2] ?? "athyper/runtime:bp-deployment-adapter-20260911";
if (
  process.argv.length > 3 ||
  ![
    "athyper/runtime:bp-deployment-adapter-20260911",
    "athyper/runtime:bp-deployment-adapter-case-20260911",
    "athyper/runtime:bp-deployment-adapter-packaged-20260911",
  ].includes(imageTag)
)
  throw Error("Expected a built adapter image; no activation supported");
const run = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 30000000,
    stdio: ["pipe", "pipe", "pipe"],
  });
const image = JSON.parse(run(["image", "inspect", imageTag]))[0].Id;
const selected = ["api", "worker"],
  containers = JSON.parse(
    run(["inspect", ...selected.map((s) => "athyper-dev-" + s + "-1")]),
  );
const configs = containers.map((c) =>
  JSON.parse(
    run([
      "compose",
      ...c.Config.Labels["com.docker.compose.project.config_files"]
        .split(",")
        .flatMap((f) => ["-f", f]),
      "config",
      "--format",
      "json",
    ]),
  ),
);
const config = { ...configs[0], services: {} };
for (let i = 0; i < selected.length; i++) {
  const name = selected[i];
  config.services[name] = {
    ...configs[i].services[name],
    image: containers[i].Image,
  };
  delete config.services[name].build;
  delete config.services[name].depends_on;
  for (const kind of ["networks", "volumes", "secrets", "configs"])
    for (const [key, value] of Object.entries(configs[i][kind] ?? {})) {
      config[kind] ??= {};
      if (config[kind][key]) assert.deepEqual(config[kind][key], value);
      else config[kind][key] = value;
    }
}
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-authorization-adapter-" +
  Date.now();
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const escape = (v) =>
  typeof v === "string"
    ? v.replaceAll("$", "$$")
    : Array.isArray(v)
      ? v.map(escape)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, v]) => [k, escape(v)]))
        : v;
fs.writeFileSync(root + "/rollback.json", JSON.stringify(escape(config)), {
  mode: 0o600,
});
const bytes = fs.readFileSync(
    os.homedir() +
      "/.athyper/instances/dev/deployments/bp-release-19-isolated-20260910/artifact.json",
  ),
  a = JSON.parse(bytes),
  d = a.envelope.payload.entityDescriptor;
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
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex"),
  hash = (v) => digest(JSON.stringify(canonical(v)));
const proposal = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-target-read-grants.proposal.dev.json",
  ),
);
assert.equal(digest(bytes), proposal.artifactHash);
assert.equal(a.manifest.releaseId, proposal.releaseId);
const query = `SELECT json_build_object('artifactUri',a.artifact_uri,'artifactHash',a.content_hash,'targetPlane',a.plane_code,'publicationKey',r.release_key,'sourceReleaseId',r.id,'sourceReleaseNo',r.release_no,'signatureAlgorithm',a.signature_algorithm,'signingKeyId',a.signing_key_id,'signature',a.signature) FROM publication.artifact a JOIN publication.release r ON r.id=a.publication_release_id WHERE r.id='ba383d04-9a18-4e59-ab4e-3d9726e934c6' AND a.status='signed'`;
const artifactReference = JSON.parse(
  run([
    "exec",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_studio",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    query,
  ]),
);
assert.equal(artifactReference.artifactHash, proposal.artifactHash);
const deployment = {
  schemaVersion: 1,
  tenantId: proposal.tenantId,
  publicationKey: a.manifest.publicationKey,
  artifactPath: "/bp-authorization/artifact.json",
  artifactHash: proposal.artifactHash,
  runtimeImage: image,
  artifactReference,
  rollout: {
    schemaVersion: 1,
    mode: "shadow",
    release: {
      entityCode: "business_partner",
      planeKey: "neon",
      descriptorHash: d.compiledHash,
      profileHash: hash(d.descriptor.authorization),
      bindingsHash: hash(d.descriptor.authorizationRuntime),
      runtimeVersion: d.descriptor.authorizationRuntime.runtimeVersion,
    },
  },
};
fs.writeFileSync(root + "/artifact.json", bytes, { mode: 0o600 });
fs.writeFileSync(
  root + "/deployment.json",
  JSON.stringify(deployment, null, 2) + "\n",
  { mode: 0o600 },
);
for (const name of selected) {
  config.services[name].image = image;
  config.services[name].environment ??= {};
  config.services[name].environment.BP_AUTHORIZATION_DEPLOYMENT_CONFIG_PATH =
    "/bp-authorization/deployment.json";
  config.services[name].volumes = (config.services[name].volumes ?? []).filter(
    (v) =>
      ![
        "/bp-authorization/artifact.json",
        "/bp-authorization/deployment.json",
      ].includes(v.target),
  );
  config.services[name].volumes.push(
    {
      type: "bind",
      source: root + "/artifact.json",
      target: "/bp-authorization/artifact.json",
      read_only: true,
    },
    {
      type: "bind",
      source: root + "/deployment.json",
      target: "/bp-authorization/deployment.json",
      read_only: true,
    },
  );
}
fs.writeFileSync(root + "/rollout.json", JSON.stringify(escape(config)), {
  mode: 0o600,
});
const baseline = {
  capturedAt: new Date().toISOString(),
  containers: containers.map((c) => ({
    name: c.Name,
    id: c.Id,
    image: c.Image,
  })),
  image,
  releaseId: proposal.releaseId,
  artifactHash: proposal.artifactHash,
  mode: "shadow",
  activationAuthorized: false,
};
fs.writeFileSync(
  root + "/baseline.json",
  JSON.stringify(baseline, null, 2) + "\n",
  { mode: 0o600 },
);
fs.writeFileSync("/tmp/bp-authorization-adapter-root", root, { mode: 0o600 });
console.log(
  JSON.stringify({
    prepared: true,
    root,
    image,
    mode: "shadow",
    activationChanged: false,
    grantsChanged: false,
  }),
);
