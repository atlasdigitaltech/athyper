#!/usr/bin/env node

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../deploy/stackctl/package.json", import.meta.url));
const YAML = require("yaml");

const REQUIRED_IMAGES=Object.freeze(["iam","mesh-web","neon-web","runtime-server","studio-web"]);
const DIGEST=/@sha256:[a-f0-9]{64}$/u,SOURCE_REVISION=/^[a-f0-9]{40}$/u;

export function promoteImageSet(document){
  if(document?.apiVersion!=="athyper.io/v1alpha1"||document?.kind!=="ImageSet")throw new Error("Input must be an athyper.io/v1alpha1 ImageSet");
  if(document.metadata?.channel!=="candidate")throw new Error("Only a candidate ImageSet can be promoted");
  const revision=String(document.spec?.sourceRevision??"");
  if(!SOURCE_REVISION.test(revision)||/^0{40}$/u.test(revision))throw new Error("Candidate sourceRevision must be a non-zero Git SHA");
  if(!Array.isArray(document.spec?.images))throw new Error("Candidate images must be an array");
  const byId=new Map();
  for(const image of document.spec.images){if(!REQUIRED_IMAGES.includes(image?.id))throw new Error(`Unexpected image ID: ${String(image?.id)}`);if(byId.has(image.id))throw new Error(`Duplicate image ID: ${image.id}`);if(!DIGEST.test(String(image.reference??""))||/@sha256:0{64}$/u.test(image.reference))throw new Error(`Image is not immutable: ${image.id}`);byId.set(image.id,image.reference);}
  for(const id of REQUIRED_IMAGES)if(!byId.has(id))throw new Error(`Required image is absent: ${id}`);
  return Object.freeze({apiVersion:"athyper.io/v1alpha1",kind:"ImageSet",metadata:Object.freeze({id:`release-${revision.slice(0,12)}`,channel:"release"}),spec:Object.freeze({sourceRevision:revision,images:Object.freeze(REQUIRED_IMAGES.map(id=>Object.freeze({id,reference:byId.get(id)})))})});
}

function argumentsOf(values){const read=flag=>{const index=values.indexOf(flag);return index<0?undefined:values[index+1];};return{input:read("--input"),output:read("--output")};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const options=argumentsOf(process.argv.slice(2));if(!options.input)throw new Error("--input candidate-image-set.yaml is required");const input=resolve(options.input),release=promoteImageSet(YAML.parse(readFileSync(input,"utf8"))),rendered=YAML.stringify(release,{lineWidth:0});if(options.output){const output=resolve(options.output);if(dirname(output)!==resolve("deploy/image-sets/releases"))throw new Error("--output must be directly under deploy/image-sets/releases");const temporary=`${output}.tmp-${process.pid}`;writeFileSync(temporary,rendered,{encoding:"utf8",mode:0o644});renameSync(temporary,output);process.stdout.write(`Promoted exact candidate digests to ${output}\n`);}else process.stdout.write(rendered);}catch(error){process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=2;}}
