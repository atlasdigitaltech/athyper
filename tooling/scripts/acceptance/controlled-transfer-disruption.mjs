#!/usr/bin/env node

import { mkdirSync,renameSync,writeFileSync } from "node:fs";
import { dirname,resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ALLOWED_SERVICES=new Set(["worker","memorycache"]);

export function runControlledTransferDisruption(options,dependencies={}){
  const project=required(options.project,"--project"),service=required(options.service,"--service"),confirmation=required(options.confirm,"--confirm");
  if(!/^[a-z][a-z0-9-]{1,63}$/u.test(project))throw new Error("Project name is invalid");
  if(!ALLOWED_SERVICES.has(service))throw new Error("Service must be worker or memorycache");
  if(confirmation!==`${project}:${service}`)throw new Error(`Refusing disruption: pass --confirm ${project}:${service}`);
  const before=parseProbe(options.beforeProbe,"--before-probe"),during=parseProbe(options.duringProbe,"--during-probe"),after=parseProbe(options.afterProbe,"--after-probe");
  const run=dependencies.run??execute,now=dependencies.now??(()=>new Date()),startedAt=now().toISOString(),phases=[];
  let paused=false,restored=false,error;
  try{
    assertService(run,project,service);
    phases.push(runProbe(run,"before",before));
    command(run,["compose","--project-name",project,"pause",service]);paused=true;
    phases.push(runProbe(run,"during",during));
  }catch(caught){error=caught instanceof Error?caught:new Error(String(caught));}
  finally{
    if(paused){try{command(run,["compose","--project-name",project,"unpause",service]);restored=true;}catch(restoreError){error??=restoreError instanceof Error?restoreError:new Error(String(restoreError));}}
  }
  if(restored&&!error){try{waitHealthy(run,project,service);phases.push(runProbe(run,"after",after));}catch(caught){error=caught instanceof Error?caught:new Error(String(caught));}}
  const evidence={apiVersion:"athyper.io/v1alpha1",kind:"ControlledTransferDisruption",project,service,startedAt,completedAt:now().toISOString(),status:!error&&restored?"passed":"failed",restored,phases,...(error?{error:error.message}:{})};
  if(options.evidence)atomicJson(resolve(options.evidence),evidence);
  if(error)throw Object.assign(error,{evidence});
  return evidence;
}

function assertService(run,project,service){const result=run("docker",["compose","--project-name",project,"ps","--status","running","--services",service]);if(!result.ok||!result.stdout.split(/\s+/u).includes(service))throw new Error(`Service ${service} is not running in ${project}`);}
function runProbe(run,phase,probe){const started=Date.now(),result=run(probe[0],probe.slice(1),{env:{...process.env,ATHYPER_DISRUPTION_PHASE:phase}});if(!result.ok)throw new Error(`${phase} probe failed: ${result.stderr||result.error||`exit ${result.status}`}`);return{phase,status:"passed",durationMs:Date.now()-started};}
function waitHealthy(run,project,service){for(let attempt=0;attempt<30;attempt+=1){const result=run("docker",["compose","--project-name",project,"ps","--status","running","--services",service]);if(result.ok&&result.stdout.split(/\s+/u).includes(service))return;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1_000);}throw new Error(`Service ${service} did not recover within 30 seconds`);}
function command(run,args){const result=run("docker",args);if(!result.ok)throw new Error(`docker ${args.join(" ")} failed: ${result.stderr||result.error||`exit ${result.status}`}`);}
function parseProbe(value,name){if(!value)throw new Error(`${name} must be a JSON command array`);let parsed;try{parsed=JSON.parse(value);}catch{throw new Error(`${name} must be valid JSON`);}if(!Array.isArray(parsed)||!parsed.length||parsed.some(item=>typeof item!=="string"||!item))throw new Error(`${name} must be a non-empty JSON string array`);return parsed;}
function required(value,name){const normalized=value?.trim();if(!normalized)throw new Error(`${name} is required`);return normalized;}
function execute(program,args,options={}){const result=spawnSync(program,args,{encoding:"utf8",timeout:300_000,env:options.env??process.env});return{ok:result.status===0,status:result.status??1,stdout:(result.stdout??"").trim(),stderr:(result.stderr??"").trim(),error:result.error?.message};}
function atomicJson(path,value){mkdirSync(dirname(path),{recursive:true,mode:0o700});const temporary=`${path}.tmp-${process.pid}`;writeFileSync(temporary,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});renameSync(temporary,path);}
function argumentsOf(values){const read=name=>{const index=values.indexOf(name);return index<0?undefined:values[index+1];};return{project:read("--project"),service:read("--service"),confirm:read("--confirm"),beforeProbe:read("--before-probe"),duringProbe:read("--during-probe"),afterProbe:read("--after-probe"),evidence:read("--evidence")};}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const evidence=runControlledTransferDisruption(argumentsOf(process.argv.slice(2)));process.stdout.write(`${JSON.stringify(evidence,null,2)}\n`);}catch(error){if(error?.evidence)process.stderr.write(`${JSON.stringify(error.evidence,null,2)}\n`);else process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=2;}}
