#!/usr/bin/env node
/** Inspect the effective serving-process environment, not Docker Config.Env.
 * Child credentials remain inside the container and are never returned. */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const container = "athyper-dev-source-api-1";
const details = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
if (!details.State.Running || details.Config.Labels["com.docker.compose.project"] !== "athyper-dev-source")
  throw Error("Running DEV source API required");
const script = String.raw`
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
let env;
for (const pid of readdirSync('/proc').filter(x => /^\d+$/.test(x))) {
  try {
    const cmd = readFileSync('/proc/' + pid + '/cmdline', 'utf8');
    if (!cmd.includes('src/main.ts')) continue;
    const values = Object.fromEntries(readFileSync('/proc/' + pid + '/environ', 'utf8').split('\0').filter(Boolean).map(s => {
      const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];
    }));
    if (values.ENTITY_SERVING_DEPLOYMENT_ID) {env=values;break;}
  } catch {}
}
if (!env || env.ATHYPER_LOCAL_SOURCE !== '1') throw Error('Effective DEV source environment required');
const child=spawnSync(process.execPath,['--import','tsx','server/apps/platform-host/src/scripts/inspect-entity-support.ts'],{
  env,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,
});
let found=false;
for (const line of child.stdout.split('\n')) {
  try { const value=JSON.parse(line);if(value.schema==='athyper.entity-serving-qualification-inspection/1') {console.log(JSON.stringify(value));found=true;} } catch {}
}
if(child.status!==0 || !found) throw Error('Serving support inspection failed; no credential-bearing diagnostics emitted');
`;
const output = execFileSync("docker", ["exec", "-i", "-w", process.cwd(), container,
  "node", "--input-type=module"], { input: script, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
const report = JSON.parse(output);
const path = resolve("docs/reports/coordinated-release-serving-qualification-20261003.json");
writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ report: path, deploymentId: report.deploymentId,
  descriptorCount: report.descriptors.length, failures: report.failures,
  ready: report.descriptors.filter(row => row.readiness.ready).length }));
