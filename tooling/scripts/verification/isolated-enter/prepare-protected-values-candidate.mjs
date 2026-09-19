import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { docker, fingerprint } from "./finance-reveal-client.mjs";
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911",
  stage =
    os.homedir() +
    "/.athyper/qualification/bp/protected-values-candidate-20260912";
fs.mkdirSync(stage, { recursive: true });
const p = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-finance-reveal-execution-20260912.proposal.dev.json",
    ),
  ),
  prior = JSON.parse(fs.readFileSync(p.candidateManifest)),
  current = JSON.parse(docker(["inspect", "athyper-bp-enter-api"]))[0];
assert.equal(current.Image, p.runtimeImage);
const sha = (x) => createHash("sha256").update(x).digest("hex");
docker([
  "cp",
  "athyper-bp-enter-api:/app/server/dist/composition/register-adapters.js",
  stage + "/prior-register-adapters.js",
]);
let code = fs.readFileSync(stage + "/prior-register-adapters.js", "utf8");
const compiled = fs.readFileSync(
  "server/apps/platform-host/dist/composition/register-adapters.js",
  "utf8",
);
const start = compiled.indexOf("    // Protected business values need"),
  end = compiled.indexOf("    const publicationEnabled", start);
assert(start >= 0 && end > start);
const addition = compiled.slice(start, end);
const old =
  "        const secretStore = (dependencies.createSecretStore ?? createInfisicalSecretStore)({ endpoint: config.infisical.endpoint, token: config.infisical.token, workspaceId: config.infisical.workspaceId, environment: config.infisical.environment, secretPath: config.infisical.secretPath });\n        container.adapters.secretStore = secretStore;\n        lifecycle.onShutdown(() => secretStore.close?.());";
assert(code.includes(old));
code = code
  .replace(old, "        const secretStore = container.adapters.secretStore;")
  .replace(
    "    const publicationEnabled",
    addition + "    const publicationEnabled",
  );
fs.writeFileSync(stage + "/register-adapters.js", code);
fs.writeFileSync(
  stage + "/Dockerfile",
  "FROM athyper-bp-protected-values-base:20260912\nCOPY register-adapters.js /app/server/dist/composition/register-adapters.js\n",
);
docker(["tag", p.runtimeImage, "athyper-bp-protected-values-base:20260912"]);
docker([
  "build",
  "--network=none",
  "-t",
  "athyper-bp-protected-values-candidate:20260912",
  stage,
]);
const image = JSON.parse(
  docker([
    "image",
    "inspect",
    "athyper-bp-protected-values-candidate:20260912",
  ]),
)[0].Id;
const releaseSetHash = sha(
    JSON.stringify({ runtimeImage: image, artifacts: p.artifacts }),
  ),
  harness = root + "/protected-values-harness";
fs.cpSync(root + "/finance-reveal-v2-harness", harness, {
  recursive: true,
  errorOnExist: true,
  force: false,
});
const boundary = fs.readFileSync(harness + "/release-boundary.mjs", "utf8");
assert(boundary.includes(p.releaseSetHash));
fs.writeFileSync(
  harness + "/release-boundary.mjs",
  boundary.replaceAll(p.releaseSetHash, releaseSetHash),
);
const deployment = JSON.parse(
  fs.readFileSync(root + "/finance-reveal-v2-deployment.json"),
);
deployment.runtimeImage = image;
fs.writeFileSync(
  root + "/protected-values-deployment.json",
  JSON.stringify(deployment),
  { mode: 0o600, flag: "wx" },
);
// Reuse existing service authentication in a private candidate-only env file. Never print it.
const source = JSON.parse(
    docker(["inspect", "athyper-bp-dependency-studio-api"]),
  )[0],
  sourceEnv = Object.fromEntries(
    source.Config.Env.map((e) => {
      const i = e.indexOf("=");
      return [e.slice(0, i), e.slice(i + 1)];
    }),
  );
const keys = [
  "INFISICAL_URL",
  "INFISICAL_TOKEN",
  "INFISICAL_WORKSPACE_ID",
  "INFISICAL_ENVIRONMENT",
  "INFISICAL_SECRET_PATH",
];
assert.equal(sourceEnv.INFISICAL_URL, "https://secrets.dev.athyper.test:8443");
assert(sourceEnv.INFISICAL_TOKEN && sourceEnv.INFISICAL_WORKSPACE_ID);
const ca = sourceEnv.NODE_EXTRA_CA_CERTS;
assert(ca);
const caMount = source.Mounts.find(
  (m) => ca === m.Destination || ca.startsWith(m.Destination + "/"),
);
assert(caMount);
const caSource = caMount.Source + ca.slice(caMount.Destination.length);
fs.copyFileSync(caSource, root + "/protected-values-ca.crt");
let env = fs.readFileSync(root + "/runtime.env", "utf8");
assert(!env.includes("INFISICAL_TOKEN="));
env +=
  "\n" +
  keys
    .filter((k) => sourceEnv[k] !== undefined)
    .map((k) => k + "=" + sourceEnv[k])
    .join("\n") +
  "\nNODE_EXTRA_CA_CERTS=/release/protected-values-ca.crt\n";
fs.writeFileSync(root + "/runtime-protected-values.env", env, {
  mode: 0o600,
  flag: "wx",
});
// TLS passes through unchanged. Only this disposable relay joins the source network.
const relay = "athyper-bp-protected-secret-relay";
docker([
  "run",
  "-d",
  "--name",
  relay,
  "--network",
  p.destination.network,
  "--network-alias",
  "secrets.dev.athyper.test",
  "--read-only",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges",
  "--entrypoint",
  "node",
  image,
  "-e",
  "const net=require('node:net');net.createServer(client=>{const upstream=net.connect(8443,'athyper-dev-publication-secretstore-tls-1',()=>{client.pipe(upstream);upstream.pipe(client)});upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());client.on('close',()=>upstream.destroy())}).listen(8443,'0.0.0.0')",
]);
docker(["network", "connect", "athyper-dev_app", relay]);
const before = fingerprint(),
  mounts = current.Mounts.flatMap((m) => [
    "--mount",
    "type=bind,src=" +
      (m.Destination === "/app/server/qualification"
        ? harness
        : m.Destination === "/release/deployment.json"
          ? root + "/protected-values-deployment.json"
          : m.Source) +
      ",dst=" +
      m.Destination +
      (m.RW ? "" : ",readonly"),
  ]);
mounts.push(
  "--mount",
  "type=bind,src=" +
    root +
    "/protected-values-ca.crt,dst=/release/protected-values-ca.crt,readonly",
);
const canary = "athyper-bp-protected-values-canary",
  id = docker([
    "run",
    "-d",
    "--name",
    canary,
    "--network",
    p.destination.network,
    "--env-file",
    root + "/runtime-protected-values.env",
    "-e",
    "MODE=api",
    ...mounts,
    "--entrypoint",
    "node",
    "--no-healthcheck",
    image,
    "/app/server/qualification/host.mjs",
  ]).trim();
assert.deepEqual(fingerprint(), before);
const migration =
  "server/db/scripts/tests/integration/fixtures/legacy-upgrades/20260912_business_partner_reveal_audit_contract.sql";
const report = {
  createdAt: new Date().toISOString(),
  parentProposalRevision: p.proposalRevision,
  previousRuntimeImage: p.runtimeImage,
  runtimeImage: image,
  releaseSetHash,
  artifacts: p.artifacts,
  canary: { name: canary, id },
  relay,
  files: [
    {
      path: "server/apps/platform-host/src/composition/register-adapters.ts",
      compiledSha256: sha(code),
      note: "Only secret-store registration moved outside publication. Unrelated object-storage changes excluded.",
    },
  ],
  harness: fs
    .readdirSync(harness)
    .filter((n) => fs.statSync(harness + "/" + n).isFile())
    .map((name) => ({
      name,
      sha256: sha(fs.readFileSync(harness + "/" + name)),
    })),
  auditMigration: {
    path: migration,
    sha256: sha(fs.readFileSync(migration)),
    applied: false,
  },
  secretReference:
    "protected-values/" +
    p.tenantId +
    "/qualification.bp.finance-reveal.01d4baa18931c720.bank",
  secretCreated: false,
  secretStore: {
    endpoint: sourceEnv.INFISICAL_URL,
    workspaceId: sourceEnv.INFISICAL_WORKSPACE_ID,
    environment: sourceEnv.INFISICAL_ENVIRONMENT || "dev",
    secretPath: sourceEnv.INFISICAL_SECRET_PATH || "/",
    caSha256: sha(fs.readFileSync(root + "/protected-values-ca.crt")),
  },
  grantChanges: [],
  publicationActivationEnabled: false,
  activeRuntimeChanged: false,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-protected-values-candidate-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log({
  runtimeImage: image,
  releaseSetHash,
  canary: id,
  secretCreated: false,
  grantsChanged: false,
});
