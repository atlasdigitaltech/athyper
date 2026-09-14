#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { writeFileSync } from "node:fs";
const checkout = resolve(import.meta.dirname, "../../..");
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" });
const inspect = (project) => {
  const ids = docker(
    "ps",
    "-aq",
    "--filter",
    `label=com.docker.compose.project=${project}`,
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return ids.length ? JSON.parse(docker("inspect", ...ids)) : [];
};
const service = (c) => c.Config.Labels["com.docker.compose.service"];
function probe() {
  const apps = inspect("athyper-dev-source").filter((c) => c.State.Running);
  assert.equal(
    apps.length,
    6,
    "Run devfull before this full-mode lifecycle check",
  );
  assert.ok(apps.every((c) => c.State.Health?.Status === "healthy"));
  assert.equal(
    inspect("athyper-dev").filter(
      (c) =>
        [
          "api",
          "worker",
          "scheduler",
          "neon-web",
          "mesh-web",
          "studio-web",
        ].includes(service(c)) && c.State.Running,
    ).length,
    0,
    "Original image applications must remain stopped",
  );
  const api = apps.find((c) => service(c) === "api"),
    source = api.Config.Env.includes("ATHYPER_LOCAL_SOURCE=1");
  const input = `
 import {createRequire} from 'node:module';
 import {readFileSync,readdirSync} from 'node:fs';
 import {pathToFileURL} from 'node:url';
 for(const pid of readdirSync('/proc').filter(n=>/^\\d+$/.test(n))){try{const values=Object.fromEntries(readFileSync('/proc/'+pid+'/environ','utf8').split('\\0').filter(Boolean).map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));if(values.MODE==='api'&&values.DATABASE_URL){Object.assign(process.env,values);break;}}catch{}}
 const require=createRequire(process.cwd()+'/package.json');
 const pg=createRequire(require.resolve(${JSON.stringify(source ? "@athyper/server-service-publication" : "@athyper/server-adapter-db-neon")}))('pg');
 const {Kysely,PostgresDialect}=await import(pathToFileURL(require.resolve('kysely')).href);
 const {KyselyLocalProjectionRepository}=await import(pathToFileURL(require.resolve('@athyper/server-service-publication')).href);
 const database=new Kysely({dialect:new PostgresDialect({pool:new pg.Pool({connectionString:process.env.DATABASE_URL,max:1})})});
 try{const active=await new KyselyLocalProjectionRepository(database,true).findActiveBusinessPartnerDefinition('studio.business_partner.definition.business_partner.onboarding');if(!active)throw new Error('Preview missing');console.log(JSON.stringify({revisionId:active.revisionId,bundleHash:active.bundleHash}));}finally{await database.destroy();}
 `;
  const result = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "--workdir",
      source
        ? join(checkout, "server/apps/platform-host")
        : api.Config.WorkingDir,
      api.Id,
      "node",
      ...(source ? ["--import", "tsx"] : []),
      "--input-type=module",
    ],
    { encoding: "utf8", input },
  );
  return {
    mode: source ? "source" : "container",
    apps: apps.map((c) => ({ service: service(c), image: c.Image })),
    preview: JSON.parse(result),
  };
}
const before = probe();
if (process.argv[2] === "--probe") {
  console.log(JSON.stringify(before, null, 2));
} else if (process.argv.length === 2) {
  assert.equal(before.mode, "source");
  const supporting = () =>
    inspect("athyper-dev")
      .filter(
        (c) =>
          ![
            "api",
            "worker",
            "scheduler",
            "neon-web",
            "mesh-web",
            "studio-web",
          ].includes(service(c)),
      )
      .map((c) => ({
        id: c.Id,
        started: c.State.StartedAt,
        mounts: [...c.Mounts].sort((a, b) =>
          a.Destination.localeCompare(b.Destination),
        ),
      }));
  const infrastructure = supporting();
  let container, after;
  try {
    execFileSync(
      process.execPath,
      [
        join(checkout, "tooling/scripts/local-dev/dev-workspace.mjs"),
        "container",
      ],
      { stdio: "inherit" },
    );
    container = probe();
    assert.equal(container.mode, "container");
    assert.deepEqual(container.preview, before.preview);
  } finally {
    execFileSync(
      process.execPath,
      [join(checkout, "tooling/scripts/local-dev/dev-workspace.mjs"), "source"],
      { stdio: "inherit" },
    );
  }
  after = probe();
  assert.equal(after.mode, "source");
  assert.deepEqual(after.preview, before.preview);
  assert.deepEqual(supporting(), infrastructure);
  const receipt = {
    schema: "athyper.workspace-lifecycle/1",
    developmentEvidence: true,
    passed: true,
    before,
    container,
    after,
    infrastructureUnchanged: true,
    releaseQualified: false,
    at: new Date().toISOString(),
  };
  const output = join(
    homedir(),
    `.athyper/instances/dev/workspace/lifecycle-${Date.now()}.json`,
  );
  writeFileSync(output, JSON.stringify(receipt, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  console.log(`Workspace lifecycle passed: ${output}`);
} else throw new Error("Use workspace-lifecycle.mjs [--probe]");
