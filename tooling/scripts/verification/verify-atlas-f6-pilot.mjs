import {readFileSync,existsSync} from 'node:fs';
import {resolve}from'node:path';
import {evaluateAtlasF6}from'./atlas-f6-pilot-model.mjs';
import {images,save,directory}from'./atlas-f6-common.mjs';
const names=['personas','model-studio','model-neon','model-mesh','grounded','database','rollback','accessibility','second-entity','disposable-database'];
const receipts=Object.fromEntries(names.flatMap(n=>{const p=resolve(directory,n+'.json');return existsSync(p)?[[n,JSON.parse(readFileSync(p,'utf8'))]]:[];}));
const currentImages=images();const result={observedAt:new Date().toISOString(),...evaluateAtlasF6({receipts,currentImages}),images:currentImages,evidence:Object.fromEntries(Object.keys(receipts).map(k=>[k,k+'.json']))};
save('pilot-status.json',result);console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
