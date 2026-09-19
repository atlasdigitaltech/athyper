#!/usr/bin/env node
// Provisions an independent QA signing project on the local Infisical service.
// Never outputs credentials. Each successful creation is checkpointed privately.
import { qaProject } from "../local-dev/qa-runtime.mjs";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  generateKeyPairSync,
  createHash,
  sign,
  verify,
  createPrivateKey,
  createPublicKey,
} from "node:crypto";

if (!process.argv.includes("--confirm=LOCAL-QA-PUBLICATION-SIGNING"))
  throw new Error("Local development confirmation required");
if (!/^athyper-qa-candidate-[0-9]{13}$/.test(qaProject()))
  throw new Error("Isolated local QA required");
process.umask(0o077);
const secretRoot = join(homedir(), ".athyper/instances/qa/secrets");
const statePath = join(secretRoot, "publication-infisical-bootstrap.json");
mkdirSync(secretRoot, { recursive: true, mode: 0o700 });
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : {};
function save() {
  const { bootstrap, ...checkpoint } = state;
  writeFileSync(statePath, JSON.stringify(checkpoint), { mode: 0o600 });
  chmodSync(statePath, 0o600);
}
async function api(
  path,
  body,
  token = state.bootstrap?.identity.credentials.token,
) {
  const response = await fetch(`http://127.0.0.1:53001${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `Infisical ${path} failed (${response.status}); reconcile native state before retrying`,
    );
  return result;
}
// Reuse only the local service administrator, never DEV keys or worker trust.
const serviceAdmin = JSON.parse(
  readFileSync(
    join(
      homedir(),
      ".athyper/instances/dev/secrets/publication-infisical-bootstrap.json",
    ),
    "utf8",
  ),
).bootstrap;
if (!serviceAdmin?.identity?.credentials?.token)
  throw new Error("Local Infisical administrator is unavailable");
state.bootstrap = serviceAdmin;
if (!state.project) {
  state.project = (
    await api("/api/v1/projects", {
      projectName: "QA publication signing",
      slug: "athyper-qa-publication",
      type: "secret-manager",
      shouldCreateDefaultEnvs: true,
    })
  ).project;
  save();
}
if (!state.qaEnvironment) {
  state.qaEnvironment = await api(
    `/api/v1/projects/${state.project.id}/environments`,
    { name: "QA", slug: "qa", position: 2 },
  );
  save();
}
const privateReference = "PUBLICATION_QA_ED25519_PRIVATE_20260912",
  publicReference = "PUBLICATION_QA_ED25519_PUBLIC_20260912";
if (!state.keyPair && (!state.privateStored || !state.publicStored)) {
  const pair = generateKeyPairSync("ed25519");
  state.keyPair = {
    private: pair.privateKey
      .export({ type: "pkcs8", format: "der" })
      .toString("base64"),
    public: pair.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64"),
  };
  save();
}
for (const [kind, reference] of [
  ["private", privateReference],
  ["public", publicReference],
]) {
  if (state[`${kind}Stored`]) continue;
  await api(`/api/v3/secrets/raw/${reference}`, {
    workspaceId: state.project.id,
    environment: "qa",
    secretPath: "/",
    type: "shared",
    secretValue: state.keyPair[kind],
  });
  state[`${kind}Stored`] = true;
  save();
}
delete state.keyPair;
save();
if (!state.workerIdentity) {
  state.workerIdentity = (
    await api("/api/v1/identities", {
      name: "athyper-qa-publication-worker",
      organizationId: state.bootstrap.organization.id,
      role: "no-access",
    })
  ).identity;
  save();
}
const identityId = state.workerIdentity.id;
if (!state.projectMembership) {
  state.projectMembership = await api(
    `/api/v1/projects/${state.project.id}/memberships/identities/${identityId}`,
    { roles: [{ role: "viewer", isTemporary: false }] },
  );
  save();
}
if (!state.tokenAuth) {
  state.tokenAuth = await api(
    `/api/v1/auth/token-auth/identities/${identityId}`,
    {
      accessTokenTTL: 2592000,
      accessTokenMaxTTL: 2592000,
      accessTokenNumUsesLimit: 0,
    },
  );
  save();
}
if (!state.workerToken) {
  const token = await api(
    `/api/v1/auth/token-auth/identities/${identityId}/tokens`,
    {
      name: "qa-publication-worker",
      organizationSlug: state.bootstrap.organization.slug,
    },
  );
  state.workerToken = token.accessToken;
  if (!state.workerToken) throw new Error("Token response missing accessToken");
  save();
}
const tokenFile = join(secretRoot, "publication-infisical-token");
writeFileSync(tokenFile, state.workerToken, { mode: 0o600 });
chmodSync(tokenFile, 0o600);
const refs = {
  PUBLICATION_APPLIER_PRINCIPAL_CODE: "seed.three-plane-provisioner",
  PUBLICATION_TARGET_PLANES: "neon",
  PUBLICATION_RUNTIME_VERSION: "1.0.0",
  PUBLICATION_SIGNING_KEY_ID: "athyper-qa-publication-ed25519-20260912",
  PUBLICATION_PRIVATE_KEY_REFERENCE: privateReference,
  PUBLICATION_PUBLIC_KEY_REFERENCE: publicReference,
  INFISICAL_URL: "https://secrets.qa.athyper.test:8443",
  INFISICAL_WORKSPACE_ID: state.project.id,
  INFISICAL_ENVIRONMENT: "qa",
  INFISICAL_SECRET_PATH: "/",
  PUBLICATION_INFISICAL_TOKEN_FILE: tokenFile,
};
writeFileSync(
  join(secretRoot, "publication-environment.json"),
  JSON.stringify(refs, null, 2) + "\n",
  { mode: 0o600 },
);
const keyQuery = `?workspaceId=${state.project.id}&environment=qa&secretPath=%2F`;
const privateSecret = (
  await api(
    `/api/v3/secrets/raw/${privateReference}${keyQuery}`,
    undefined,
    state.workerToken,
  )
).secret;
const publicSecret = (
  await api(
    `/api/v3/secrets/raw/${publicReference}${keyQuery}`,
    undefined,
    state.workerToken,
  )
).secret;
const privateKey = createPrivateKey({
  key: Buffer.from(privateSecret.secretValue, "base64"),
  type: "pkcs8",
  format: "der",
});
const publicKey = createPublicKey({
  key: Buffer.from(publicSecret.secretValue, "base64"),
  type: "spki",
  format: "der",
});
const probe = Buffer.from(
  "athyper QA publication signing health probe; not a release approval",
);
const signature = sign(null, probe, privateKey);
if (!verify(null, probe, publicKey, signature))
  throw new Error("Native key read/sign/verify failed");
console.log(
  JSON.stringify({
    schema: "athyper.publication-signing-provisioning/1",
    environment: "qa",
    sanitized: true,
    projectId: state.project.id,
    identityId,
    keyId: refs.PUBLICATION_SIGNING_KEY_ID,
    privateReference,
    publicReference,
    publicKeySha256: createHash("sha256")
      .update(publicKey.export({ type: "spki", format: "der" }))
      .digest("hex"),
    keyReadSignVerify: true,
    tokenTTLSeconds: 2592000,
    nativeRelease: false,
  }),
);
