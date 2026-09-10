import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {prepareNamedRoleReview,assessNamedRoleReview,hash} from './entity-authorization/named-role-review.mjs';
const [mode,inventoryPath,packetPath,output,...flags]=process.argv.slice(2);
if(!['prepare','assess'].includes(mode)||!inventoryPath||!packetPath||!output||flags.some(f=>f!=='--require-reviewed'))throw Error('Usage: prepare-business-partner-named-role-review.mjs <prepare|assess> <inventory.json> <packet.json> <assessment.json> [--require-reviewed]');
if(new Set([inventoryPath,packetPath,output].map(p=>resolve(p))).size!==3)throw Error('Evidence and output paths must differ');
const bytes=readFileSync(inventoryPath),inventory=JSON.parse(bytes),sourceSha256=hash(bytes);
if(mode==='prepare'){
 if(existsSync(packetPath))throw Error('Refusing to overwrite a review packet; assess or explicitly prepare a new revision');
 writeFileSync(packetPath,JSON.stringify(prepareNamedRoleReview(inventory,sourceSha256),null,2)+'\n');
}
const packet=JSON.parse(readFileSync(packetPath));
const report=assessNamedRoleReview(inventory,packet,sourceSha256);
writeFileSync(output,JSON.stringify({...report,generatedAt:new Date().toISOString(),inventoryPath,packetPath,sourceSha256},null,2)+'\n');
console.log(JSON.stringify({output,candidateCount:report.candidateCount,unresolvedRows:report.unresolvedRows,approvedAssignments:report.approvedAssignments.length,namedRoleReviewComplete:report.namedRoleReviewComplete,grantChanges:0}));
if(flags.includes('--require-reviewed')&&!report.namedRoleReviewComplete)process.exitCode=2;
