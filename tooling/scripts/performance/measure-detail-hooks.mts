import {writeFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {setTimeout as delay} from "node:timers/promises";
import {createEntityListService} from "../../../server/packages/services/records/src/entity-list-service.js";
import {createRequire} from "node:module";
const {compiledReference}=createRequire(import.meta.url)("../verification/localized-reference-fixture.ts");

const descriptor=compiledReference();
const context={planeKey:"neon",tenantId:"tenant",principalId:"actor"} as any;
const samples:any[]=[];
for(let run=0;run<12;run++){
  const calls:{hook:string;start:number;end?:number}[]=[];
  const hook=async(name:string,ms:number)=>{const entry={hook:name,start:performance.now(),end:undefined as number|undefined};calls.push(entry);await delay(ms);entry.end=performance.now();};
  const service=createEntityListService({metadata:{getEntityDescriptor:async()=>descriptor},authorizer:{authorize:async()=>({allowed:true})},queries:{get:async()=>({data:{id:"record"}})} as never,listExecutor:{} as never,
    collaboration:async()=>{await hook("collaboration",40);return ["comments","attachments"];},
    summary:async()=>{await hook("summary",70);return undefined;},
  });
  const start=performance.now();await service.detailDescriptor(context,"country","record");
  samples.push({totalMs:performance.now()-start,startSpreadMs:Math.max(...calls.map(c=>c.start))-Math.min(...calls.map(c=>c.start)),calls:calls.map(c=>({...c,start:c.start-start,end:c.end!-start}))});
}
const times=samples.map(s=>s.totalMs).sort((a,b)=>a-b);
const result={schemaVersion:1,measuredAt:new Date().toISOString(),kind:"controlled dependency latency; actual detail service",hookDelayMs:{collaboration:40,summary:70},runs:samples.length,medianMs:times[6],p95Ms:times[11],samples};
const output=process.argv[2];if(output)writeFileSync(output,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result,null,2));
