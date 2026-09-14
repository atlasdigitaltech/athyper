import fs from "node:fs";
import cp from "node:child_process";
import { createHash } from "node:crypto";
const output =
  "governance/policy/reports/business-partner-final-publication-queue-cleanup-20260912.dev.json";
if (fs.existsSync(output)) throw Error("Preserve cleanup evidence");
const reasons = {
  "ecbf538d-a1b7-4ba3-bb28-147d7263ed76":
    "Compiled, signed, activated and acknowledged in isolated NEON",
  "ed6a7433-b41d-4ad8-8dda-44e1bdfba4a8":
    "Compiled and signed; failed projection retained and superseded by release 2",
  "1d5bb5bb-9599-4952-bf90-34495a35d5de":
    "Studio-only signed metadata source; no execution-plane publication requested",
  "7eb24e6d-b113-4d7b-a3ee-d26dc68a6213":
    "Studio-only signed metadata registration; no execution-plane publication requested",
};
const script = (remove) =>
  `import fs from'node:fs';import{createRequire}from'node:module';const dir=fs.readdirSync('/app/server/node_modules/.pnpm').find(n=>n.startsWith('bullmq@'));if(!dir)throw Error('BULLMQ_REQUIRED');const {Queue}=createRequire('/app/server/node_modules/.pnpm/'+dir+'/node_modules/bullmq/package.json')('bullmq');const u=new URL(process.env.REDIS_BULLMQ_URL);if(u.hostname!=='athyper-bp-enter-redis'||u.pathname!=='/1')throw Error('ISOLATED_QUEUE_REQUIRED');const queue=new Queue('publication.authority',{connection:{host:u.hostname,port:Number(u.port||6379),db:1,...(u.password?{password:decodeURIComponent(u.password)}:{})}});const reasons=${JSON.stringify(reasons)};const countsBefore=await queue.getJobCounts();const jobs=await queue.getJobs(['waiting'],0,-1);const out=[];for(const job of jobs){const id=job.data?.data?.releaseId;if(job.name!=='publication.compile-artifact'||!reasons[id])throw Error('UNREVIEWED_WAITING_JOB');out.push({id:job.id,name:job.name,data:job.data,opts:job.opts,timestamp:job.timestamp,reason:reasons[id]});if(${remove}){if(await job.getState()!=='waiting')throw Error('JOB_STATE_CHANGED');await job.remove();}}const countsAfter=await queue.getJobCounts();console.log(JSON.stringify({jobs:out,countsBefore,countsAfter,removed:${remove},failedAndCompletedJobsRetained:true}));await queue.close();`;
const run = (s) => {
  const r = cp.spawnSync(
    "docker",
    ["exec", "-i", "athyper-bp-enter-api", "node", "--input-type=module"],
    { input: s, encoding: "utf8", timeout: 30000 },
  );
  if (r.status)
    throw Error(
      r.stderr
        .split("\n")
        .filter((l) => !l.includes("redis:"))
        .slice(0, 8)
        .join("\n"),
    );
  return JSON.parse(r.stdout.trim());
};
const archived = run(script(false));
if (archived.jobs.length !== 4) throw Error("EXPECTED_FOUR_WAITING_JOBS");
const archivePath = output.replace("cleanup", "archive");
fs.writeFileSync(archivePath, JSON.stringify(archived, null, 2) + "\n", {
  flag: "wx",
});
const result = run(script(true));
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      archivePath,
      archiveSha256: createHash("sha256")
        .update(fs.readFileSync(archivePath))
        .digest("hex"),
      ...result,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({
  removed: result.jobs.length,
  countsAfter: result.countsAfter,
  historyRetained: true,
});
