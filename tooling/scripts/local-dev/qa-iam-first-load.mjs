/** Replicate missing credentials for the two existing local QA qualification users. */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { qaProject } from "./qa-runtime.mjs";
process.umask(0o077);
if (!process.argv.includes("--apply"))
  throw new Error(
    "Use --apply to replicate existing DEV credentials into empty QA accounts",
  );
const project = qaProject();
if (!project.startsWith("athyper-qa-candidate-"))
  throw new Error("Isolated local QA required");
const run = (args, options = {}) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
const source = "athyper-dev-db-1",
  target = `${project}-db-1`;
for (const [name, expected] of [
  [source, "athyper-dev"],
  [target, project],
]) {
  const c = JSON.parse(run(["inspect", name]))[0];
  if (
    !c.State.Running ||
    c.Config.Labels["com.docker.compose.project"] !== expected
  )
    throw new Error("Database ownership mismatch");
}
const query = (container, sql) =>
  JSON.parse(
    run([
      "exec",
      container,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "athyper_iam",
      "-Atc",
      sql,
    ]),
  );
const policySql =
  "SELECT row_to_json(x) FROM (SELECT otp_policy_type,otp_policy_alg,otp_policy_digits,otp_policy_period,otp_policy_window FROM realm WHERE name='athyper') x";
if (
  JSON.stringify(query(source, policySql)) !==
  JSON.stringify(query(target, policySql))
)
  throw new Error(
    "DEV and QA OTP policies differ; explicit reconciliation needed",
  );
const usersSql =
  "SELECT json_agg(x ORDER BY username) FROM (SELECT u.id,u.username,u.enabled,u.realm_id,(SELECT count(*) FROM credential c WHERE c.user_id=u.id) credential_count FROM user_entity u JOIN realm r ON r.id=u.realm_id WHERE r.name='athyper' AND u.username IN ('catl.admin','catl.owner')) x";
const before = query(target, usersSql),
  dev = query(source, usersSql);
if (
  before?.length !== 2 ||
  dev?.length !== 2 ||
  before.some((u) => !u.enabled || u.credential_count !== 0)
)
  throw new Error(
    "Both existing QA accounts must be enabled and have no credentials; refusing overwrite",
  );
const root = join(
  homedir(),
  ".athyper/qualification/qa-first-load",
  String(Date.now()),
);
mkdirSync(root, { recursive: true, mode: 0o700 });
writeFileSync(
  join(root, "before.json"),
  JSON.stringify({ project, users: before }, null, 2) + "\n",
  { mode: 0o600 },
);
// Secret credential representations stay in memory and travel over docker stdin.
const credentialSql =
  "SELECT json_agg(x ORDER BY username) FROM (SELECT u.username,(SELECT json_agg(json_build_object('type',c.type,'createdDate',c.created_date,'userLabel',c.user_label,'secretData',c.secret_data,'credentialData',c.credential_data) ORDER BY c.priority,c.id) FROM credential c WHERE c.user_id=u.id AND c.type IN ('password','otp')) credentials FROM user_entity u JOIN realm r ON r.id=u.realm_id WHERE r.name='athyper' AND u.username IN ('catl.admin','catl.owner')) x";
const payload = query(source, credentialSql).map((u) => ({
  ...u,
  id: before.find((q) => q.username === u.username).id,
}));
for (const u of payload)
  if (
    u.credentials?.filter((c) => c.type === "password").length !== 1 ||
    !u.credentials.some((c) => c.type === "otp")
  )
    throw new Error("DEV password and OTP enrollment required");
const script = `import{readFileSync}from'node:fs';
const payload=${JSON.stringify(payload)};
const base='http://iam:8080';
const response=await fetch(base+'/realms/master/protocol/openid-connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:'athyper-admin',password:readFileSync('/run/secrets/iam-admin-password','utf8').trim()})});
if(!response.ok)throw Error('QA administrator authentication rejected');const token=(await response.json()).access_token;
async function api(path,method='GET',body){const r=await fetch(base+'/admin/realms/athyper/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('QA IAM request failed: HTTP '+r.status);return r.status===204?null:r.json();}
for(const item of payload){const user=await api('users/'+item.id);const credentials=await api('users/'+item.id+'/credentials');if(user.username!==item.username||credentials.length)throw Error('QA identity changed or credentials already exist');await api('users/'+item.id,'PUT',{...user,credentials:item.credentials});}
console.log('Existing QA accounts initialized through the native IAM API.');`;
try {
  run(
    [
      "run",
      "--rm",
      "-i",
      "--network",
      `${project}_app`,
      "--mount",
      `type=bind,src=${join(homedir(), ".athyper/instances/qa/secrets/iam-admin-password")},dst=/run/secrets/iam-admin-password,readonly`,
      "node:24.19.0-bookworm-slim",
      "node",
      "--input-type=module",
    ],
    { input: script },
  );
} catch {
  throw new Error(
    "QA credential import failed; inspect account credential counts before retrying. Secret payload omitted.",
  );
}
const after = query(target, usersSql),
  actual = query(target, credentialSql);
for (const expected of payload) {
  const found = actual.find((u) => u.username === expected.username);
  const normalize = (cs) =>
    cs
      .map(({ type, secretData, credentialData }) => ({
        type,
        secretData,
        credentialData,
      }))
      .sort((a, b) => a.type.localeCompare(b.type));
  if (
    JSON.stringify(normalize(found.credentials)) !==
    JSON.stringify(normalize(expected.credentials))
  )
    throw new Error("Credential import verification failed");
  if (after.find((u) => u.username === expected.username).id !== expected.id)
    throw new Error("QA user identity changed");
}
const receipt = {
  schemaVersion: 1,
  project,
  source: "local DEV athyper realm",
  createdAt: new Date().toISOString(),
  users: after.map((u) => ({
    username: u.username,
    qaUserId: u.id,
    credentialTypes: actual
      .find((a) => a.username === u.username)
      .credentials.map((c) => c.type),
  })),
  existingIdsPreserved: true,
  passwordAndOtpImportVerified: true,
  humanLoginPerformed: false,
  releaseQualified: false,
  toolSha256: createHash("sha256")
    .update(readFileSync(import.meta.filename))
    .digest("hex"),
};
writeFileSync(
  join(root, "receipt.json"),
  JSON.stringify(receipt, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({ ...receipt, receipt: join(root, "receipt.json") }, null, 2),
);
