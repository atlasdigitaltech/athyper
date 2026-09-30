import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { docker, sql, quote, fingerprint } from "./finance-reveal-client.mjs";
const proposalPath =
    "governance/policy/reviews/business-partner-protected-reference-amendment-20260912.proposal.dev.json",
  p = JSON.parse(fs.readFileSync(proposalPath)),
  approval = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-protected-reference-amendment-20260912.user-approval.dev.json",
    ),
  ),
  parent = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-finance-reveal-execution-20260912.proposal.dev.json",
    ),
  );
const { proposalRevision, ...body } = p,
  sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(sha(JSON.stringify(body)), proposalRevision);
assert.equal(approval.decision, "approved");
assert.equal(approval.proposalRevision, proposalRevision);
assert.equal(p.parentProposalRevision, parent.proposalRevision);
assert(
  Date.now() >= Date.parse(p.effectiveFrom) &&
    Date.now() < Date.parse(p.effectiveUntil),
);
assert.equal(
  sha(fs.readFileSync(p.candidateManifest)),
  p.candidateManifestSha256,
);
for (const m of [p.auditMigration, p.bankFixtureMigration])
  assert.equal(sha(fs.readFileSync(m.path)), m.sha256);
const manifest = JSON.parse(fs.readFileSync(p.candidateManifest)),
  root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
for (const f of manifest.harness)
  assert.equal(
    sha(fs.readFileSync(root + "/protected-reference-harness/" + f.name)),
    f.sha256,
  );
const activeCount = Number(
  sql(
    `SELECT count(*) FROM authz.group_role WHERE source_ref=${quote(parent.proposalRevision)} AND status='active' AND effective_until=${quote(parent.effectiveUntil)}::timestamptz AND clock_timestamp()<effective_until;`,
  ),
);
assert.equal(activeCount, 13, "No access may be restored or extended");
for (const mode of ["api", "worker"])
  assert.equal(
    JSON.parse(docker(["inspect", "athyper-bp-enter-" + mode]))[0].Image,
    p.previousRuntimeImage,
  );
const before = fingerprint(),
  report = {
    createdAt: new Date().toISOString(),
    proposalRevision,
    parentProposalRevision: parent.proposalRevision,
    runtimeImage: p.runtimeImage,
    releaseSetHash: p.releaseSetHash,
    secretCreated: false,
    fixtureApplied: false,
    results: [],
    grantsChanged: false,
    complete: false,
  };
const output =
  "governance/policy/reports/business-partner-protected-reference-amendment-application-20260912.dev.json";
if (fs.existsSync(output)) {
  const prior = JSON.parse(fs.readFileSync(output));
  assert.equal(prior.proposalRevision, proposalRevision);
  assert.equal(prior.secretCreated, false);
  assert.equal(prior.fixtureApplied, false);
  assert.equal(prior.results.length, 0);
  report.priorAttempts = [
    {
      createdAt: prior.createdAt,
      failure:
        "Read-only runtime identity correctly denied secret creation with 403",
    },
  ];
}
const save = () =>
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
save();
const reference = JSON.stringify(p.secret.reference),
  secretName = JSON.stringify(p.secret.physicalSecretName),
  expectedHash = sha(Buffer.from("GB82WEST12345698765432"));
const provisioner = JSON.parse(
  fs.readFileSync(
    os.homedir() +
      "/.athyper/instances/dev/secrets/publication-infisical-bootstrap.json",
  ),
);
assert.equal(provisioner.project.id, p.secret.workspaceId);
assert(provisioner.bootstrap?.identity?.credentials?.token);
const secretScript = `import fs from 'node:fs';const provisionerToken=JSON.parse(fs.readFileSync(0,'utf8')).token;import {createHash} from 'node:crypto';const reference=${reference};const url=new URL('/api/v3/secrets/raw/'+encodeURIComponent(${secretName}),process.env.INFISICAL_URL);const configuration={workspaceId:process.env.INFISICAL_WORKSPACE_ID,environment:process.env.INFISICAL_ENVIRONMENT||'dev',secretPath:process.env.INFISICAL_SECRET_PATH||'/'};for(const[k,v]of Object.entries(configuration))url.searchParams.set(k,v);const headers={Authorization:'Bearer '+process.env.INFISICAL_TOKEN,'Content-Type':'application/json'};const prior=await fetch(url,{headers});const priorBody=await prior.json();if(prior.status!==404||priorBody.error!=='NotFound'||!priorBody.message?.startsWith('Secret with name'))throw Error('SECRET_REFERENCE_NOT_NEW_OR_ROUTE_INVALID:'+prior.status);const created=await fetch(url,{method:'POST',headers:{...headers,Authorization:'Bearer '+provisionerToken},body:JSON.stringify({...configuration,type:'shared',secretValue:Buffer.from('GB82WEST12345698765432').toString('base64')})});if(!created.ok){throw Error('SECRET_CREATE_FAILED:'+created.status);}const verified=await fetch(url,{headers});if(!verified.ok)throw Error('SECRET_READBACK_FAILED');const payload=await verified.json();const secret=payload.secret??payload;const bytes=Buffer.from(secret.secretValue,secret.secretEncoding==='utf8'?'utf8':'base64');const hash=createHash('sha256').update(bytes).digest('hex');if(hash!==${JSON.stringify(expectedHash)})throw Error('SECRET_READBACK_MISMATCH');console.log(JSON.stringify({created:true,reference,version:secret.version??secret.secretVersion??'current',sha256:hash,tlsVerified:true,creationIdentity:'existing-local-Infisical-provisioner',runtimeIdentityReadOnly:true}));`;
let secret;
try {
  secret = JSON.parse(
    docker(
      [
        "exec",
        "-i",
        manifest.canary.name,
        "node",
        "--input-type=module",
        "-e",
        secretScript,
      ],
      JSON.stringify({
        token: provisioner.bootstrap.identity.credentials.token,
      }),
    ),
  );
} catch (e) {
  throw Error(
    e.stderr?.match(/Error: [A-Z_]+(?::[0-9]+)?/)?.[0] ??
      "SECRET_PROVISION_FAILED",
  );
}
assert(secret.created);
report.secretCreated = true;
report.secret = secret;
save();
let setup =
  "BEGIN;SET LOCAL app.database_plane='neon';" +
  fs.readFileSync(p.auditMigration.path, "utf8") +
  fs.readFileSync(p.bankFixtureMigration.path, "utf8");
setup += `DO $window$ BEGIN IF clock_timestamp()>=${quote(p.effectiveUntil)}::timestamptz THEN RAISE EXCEPTION 'Approved window closed';END IF;END $window$;SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`;
sql(setup);
report.fixtureApplied = true;
save();
assert.deepEqual(fingerprint(), before);
for (const mode of ["worker", "api"]) {
  const name = "athyper-bp-enter-" + mode,
    prior = name + "-before-protected-reference",
    current = JSON.parse(docker(["inspect", name]))[0];
  assert.equal(current.Image, p.previousRuntimeImage);
  const mounts = current.Mounts.flatMap((m) => [
    "--mount",
    "type=bind,src=" +
      (m.Destination === "/app/server/qualification"
        ? root + "/protected-reference-harness"
        : m.Destination === "/release/deployment.json"
          ? root + "/protected-reference-deployment.json"
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
  docker(["stop", name]);
  docker(["rename", name, prior]);
  docker(["network", "disconnect", "athyper-bp-enter-isolated", prior]);
  try {
    const id = docker([
      "run",
      "-d",
      "--name",
      name,
      "--network",
      "athyper-bp-enter-isolated",
      "--env-file",
      root + "/runtime-protected-values.env",
      "-e",
      "MODE=" + mode,
      ...mounts,
      "--entrypoint",
      "node",
      "--no-healthcheck",
      p.runtimeImage,
      "/app/server/qualification/host.mjs",
    ]).trim();
    report.results.push({ name, id, image: p.runtimeImage, prior });
    save();
  } catch (error) {
    try {
      docker(["rm", "-f", name]);
    } catch {}
    docker(["rename", prior, name]);
    docker(["network", "connect", "athyper-bp-enter-isolated", name]);
    docker(["start", name]);
    throw error;
  }
}
let healthy = false;
for (let i = 0; i < 40; i++) {
  try {
    healthy =
      docker([
        "exec",
        "athyper-bp-enter-api",
        "node",
        "-e",
        'fetch("http://127.0.0.1:4000/health").then(r=>{console.log(r.status);process.exit(r.status===200?0:1)})',
      ]).trim() === "200";
    if (healthy) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
assert(healthy);
assert.deepEqual(fingerprint(), before);
report.complete = true;
report.healthy = true;
report.authorityAndActivationUnchanged = true;
save();
console.log({
  complete: true,
  runtimeImage: p.runtimeImage,
  releaseSetHash: p.releaseSetHash,
  secretCreated: true,
  grantsChanged: false,
});
