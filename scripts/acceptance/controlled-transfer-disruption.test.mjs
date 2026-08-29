import assert from "node:assert/strict";
import test from "node:test";
import { runControlledTransferDisruption } from "./controlled-transfer-disruption.mjs";

function fixture({failDuring=false}={}){const calls=[];return{calls,run:(program,args,options={})=>{calls.push({program,args,phase:options.env?.ATHYPER_DISRUPTION_PHASE});if(program==="docker")return{ok:true,status:0,stdout:args.includes("--services")?"worker":""};if(failDuring&&options.env?.ATHYPER_DISRUPTION_PHASE==="during")return{ok:false,status:1,stderr:"expected rejection was not observed"};return{ok:true,status:0,stdout:""};}};}
const options={project:"athyper-dev",service:"worker",confirm:"athyper-dev:worker",beforeProbe:'["probe","before"]',duringProbe:'["probe","during"]',afterProbe:'["probe","after"]'};

test("runs probes around a controlled disruption and restores the service",()=>{const subject=fixture(),result=runControlledTransferDisruption(options,{run:subject.run,now:()=>new Date("2026-08-28T00:00:00Z")});assert.equal(result.status,"passed");assert.equal(result.restored,true);assert.ok(subject.calls.some(call=>call.args?.includes("pause")));assert.ok(subject.calls.some(call=>call.args?.includes("unpause")));assert.deepEqual(result.phases.map(item=>item.phase),["before","during","after"]);});
test("always restores the service when the disruption probe fails",()=>{const subject=fixture({failDuring:true});assert.throws(()=>runControlledTransferDisruption(options,{run:subject.run}),error=>{assert.equal(error.evidence.restored,true);assert.equal(error.evidence.status,"failed");return true;});assert.ok(subject.calls.some(call=>call.args?.includes("unpause")));});
test("requires exact confirmation and an allow-listed service",()=>{assert.throws(()=>runControlledTransferDisruption({...options,confirm:"yes"}),/Refusing disruption/u);assert.throws(()=>runControlledTransferDisruption({...options,service:"db",confirm:"athyper-dev:db"}),/worker or memorycache/u);});
