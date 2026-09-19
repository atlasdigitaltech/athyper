import fs from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const verify = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-dependency-artifact-verification-1789168786752.dev.json",
  ),
);
const releases = verify.results
  .map((r) => ({ releaseId: r.releaseId, artifactHash: r.artifactHash }))
  .sort((a, b) => a.releaseId.localeCompare(b.releaseId));
const hash = createHash("sha256")
  .update(JSON.stringify(releases))
  .digest("hex");
const target = root + "/dependency-harness";
fs.cpSync(root + "/harness", target, { recursive: true });
let host = fs.readFileSync(target + "/host.mjs", "utf8");
const anchor = "const assertCurrent=async()=>{";
if (!host.includes(anchor)) throw Error("HOST_ANCHOR_CHANGED");
host = host.replace(
  anchor,
  `const dependencyReleases=${JSON.stringify(releases)};\nconst assertCurrent=async()=>{\n const deps=(await sql\`SELECT a.source_release_id,h.artifact_hash FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id\`.execute(db)).rows;\n for(const d of dependencyReleases)if(!deps.some(r=>r.source_release_id===d.releaseId&&r.artifact_hash===d.artifactHash))throw Error('DEPENDENCY_RELEASE_SET_MISMATCH');`,
);
fs.writeFileSync(target + "/host.mjs", host);
let boundary = fs.readFileSync(target + "/release-boundary.mjs", "utf8");
boundary = boundary
  .replace(
    "const marker='_isolatedExecutionArtifact';",
    `const marker='_isolatedExecutionArtifact';const releaseSet='${hash}';`,
  )
  .replace(
    "if(marker in data)",
    "if(marker in data||'_isolatedReleaseSet' in data)",
  )
  .replace(
    "{...data,[marker]:artifactHash}",
    "{...data,[marker]:artifactHash,_isolatedReleaseSet:releaseSet}",
  )
  .replace(
    "if(job.data?.[marker]!==artifactHash)",
    "if(job.data?.[marker]!==artifactHash||job.data?._isolatedReleaseSet!==releaseSet)",
  )
  .replace(
    "const {[marker]:ignored,...data}=job.data",
    "const {[marker]:ignored,_isolatedReleaseSet:ignoredSet,...data}=job.data",
  )
  .replace(
    "res.setHeader('x-execution-artifact',artifactHash)",
    "res.setHeader('x-execution-release-set',releaseSet);res.setHeader('x-execution-artifact',artifactHash)",
  )
  .replace(
    "kind:'isolated_job_execution',releaseId,artifactHash",
    "kind:'isolated_job_execution',releaseId,artifactHash,releaseSet",
  )
  .replace(
    "kind:'isolated_request_execution',releaseId,artifactHash",
    "kind:'isolated_request_execution',releaseId,artifactHash,releaseSet",
  );
fs.writeFileSync(target + "/release-boundary.mjs", boundary);
const files = Object.fromEntries(
  fs
    .readdirSync(target)
    .sort()
    .filter((f) => fs.statSync(target + "/" + f).isFile())
    .map((f) => [
      f,
      createHash("sha256")
        .update(fs.readFileSync(target + "/" + f))
        .digest("hex"),
    ]),
);
fs.writeFileSync(
  "governance/policy/reports/business-partner-dependency-host-20260912.dev.json",
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      releaseSetHash: hash,
      releases,
      files,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({ releaseSetHash: hash });
