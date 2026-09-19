#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { images } from "./atlas-f6-common.mjs";
const source = readFileSync(
  "server/packages/platform/ai/src/redis-insight-cache.ts",
  "utf8",
);
const script = source.match(
  /export const ATLAS_INSIGHT_CACHE_SCRIPT = `([\s\S]*?)`;/,
)?.[1];
if (!script) throw Error("Cache script not found");
const report = {
  schema: "bp-ai-cache-qualification/1",
  observedAt: new Date().toISOString(),
  images: images(),
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  productionCacheEnabled: false,
};
try {
  const result = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-api-1",
      "node",
      "--input-type=module",
      "-",
      JSON.stringify({
        script,
        key: "atlas:insight:qualification:" + randomUUID(),
      }),
    ],
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
      input: `
import {createRedisCacheAdapter} from '/app/server/node_modules/@athyper/server-adapter-cache-redis/dist/index.js';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {script,key}=JSON.parse(process.argv[2]);
const password=readFileSync('/run/secrets/redis-password','utf8').trim();
const adapter=createRedisCacheAdapter({url:'redis://:'+encodeURIComponent(password)+'@memorycache:6379'});
await adapter.connect();const first=adapter.client;
const second=first.duplicate({lazyConnect:true});
const checks=[];
const memory=async()=>Object.fromEntries((await first.info('memory')).split(/\\r?\\n/).filter(l=>/^(used_memory|used_memory_rss|used_memory_dataset|used_memory_overhead|maxmemory):/.test(l)).map(l=>{const [key,value]=l.split(':');return [key,Number(value)];}));
try{
 await second.connect();
 const memoryBefore=await memory();
 const call=(client,op,id,epoch,ttl=2000,value='{"count":1}',entries=2,bytes=500,entryBytes=250)=>client.eval(script,1,key,op,id,epoch,ttl,value,entries,bytes,entryBytes);
 assert.deepEqual(await call(first,'get','one','epoch1'),['epoch1','']);
 assert.equal(await call(first,'put','one','epoch1'),1);
 assert.deepEqual(await call(second,'get','one','other'),['epoch1','{"count":1}']);checks.push('independent clients share validated storage');
 const admitted=await Promise.all([call(first,'put','two','epoch1'),call(second,'put','three','epoch1')]);assert.equal(admitted.reduce((a,b)=>a+b,0),1);checks.push('atomic global entry bound under competing clients');
 assert.equal(await call(first,'put','oversized','epoch1',2000,'x'.repeat(300)),0);checks.push('oversized entry rejected');
 assert.ok(Number(await first.hget(key,'bytes'))<=500);checks.push('serialized key/value bytes remain within budget');
 await first.eval(script,1,key,'invalidate');
 assert.equal(await call(second,'put','late','epoch1'),0);
 assert.deepEqual(await call(first,'get','one','epoch2'),['epoch2','']);
 assert.equal(await call(second,'put','late','epoch1'),0);checks.push('invalidation fences late writes from previous epoch');
 assert.equal(await call(first,'put','short','epoch2',20),1);
 await new Promise(r=>setTimeout(r,60));assert.deepEqual(await call(second,'get','short','epoch3'),['epoch3','']);checks.push('TTL expiry removes entries and resets stale epoch');
 assert.equal(await call(first,'put','denied-byte-budget','epoch3',2000,'{"count":1}',2,1),0);checks.push('total byte admission rejects excess');
 console.log(JSON.stringify({passed:true,checks,memoryBefore,memoryAfter:await memory(),sessionContinuityQualified:false,capacityBasis:'Synthetic bounded cache probe only; not session-continuity or accepted pilot load evidence.'}));
}catch(e){console.log(JSON.stringify({passed:false,checks,errorCode:e.code??'probe_failed',assertion:e.code==='ERR_ASSERTION'?{actual:e.actual,expected:e.expected}:undefined}));}finally{await first.del(key).catch(()=>{});first.disconnect();second.disconnect();}
`,
    },
  );
  Object.assign(report, JSON.parse(result));
} catch {
  report.passed = false;
  report.blocker =
    "Redis cache qualification failed; inspect the scoped synthetic probe.";
}
report.finalImages = images();
report.stableDeployment =
  JSON.stringify(report.images) === JSON.stringify(report.finalImages);
report.passed = report.passed && report.stableDeployment;
writeFileSync(
  "docs/examples/bp-ai-release/redis-cache-qualification.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    passed: report.passed,
    checks: report.checks,
    blocker: report.blocker,
  }),
);
if (!report.passed) process.exitCode = 1;
