import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,renameSync,rmSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {hash} from './entity-authorization/named-role-review.mjs';
import {prepareApprovalRequest,completeApprovalRequest} from './entity-authorization/named-role-approval-workflow.mjs';
const [mode,inventoryPath,packetPath,outputDirectory,requestPath,responsePath]=process.argv.slice(2);
if(!['prepare','record'].includes(mode)||!inventoryPath||!packetPath||!outputDirectory||(mode==='record'&&(!requestPath||!responsePath)))throw Error('Usage: automate-business-partner-role-approval.mjs <prepare|record> <inventory.json> <packet.json> <new-output-directory> [request.json response.json]');
if(existsSync(outputDirectory))throw Error('Output directory already exists; preserve previous review evidence');
const source=readFileSync(inventoryPath),bytes=readFileSync(packetPath),inventory=JSON.parse(source),packet=JSON.parse(bytes);
if(packet.sourceSha256!==hash(source))throw Error('Inventory changed');
let files;
if(mode==='prepare'){
 const request=prepareApprovalRequest(packet,hash(bytes),'catl.owner');
 const response={schemaVersion:1,kind:'named_role_approval_response',decision:'pending',requestSha256:request.requestSha256,reviewerId:request.reviewerId,domains:[],approvedBatchIds:[],selfReviewAcknowledgedBatchIds:[],reference:'',approvedAt:null};
 files={'request.json':request,'response-template.json':response};
}else{
 const request=JSON.parse(readFileSync(requestPath)),response=JSON.parse(readFileSync(responsePath));
 const result=completeApprovalRequest({inventory,packet,sourceSha256:hash(source),packetSha256:hash(bytes),request,response});
 files={'approved-packet.json':result.packet,'assessment.json':result.assessment,'receipt.json':result.receipt,'request.json':request,'response.json':response};
}
// Validate the entire submission first, then publish all artifacts together.
const parent=dirname(resolve(outputDirectory));mkdirSync(parent,{recursive:true});
const staging=mkdtempSync(join(parent,'.bp-review-'));
try{for(const [name,value] of Object.entries(files))writeFileSync(join(staging,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});if(existsSync(outputDirectory))throw Error('Output appeared concurrently');renameSync(staging,outputDirectory);}catch(error){rmSync(staging,{recursive:true,force:true});throw error;}
console.log(JSON.stringify({mode,outputDirectory,...(mode==='prepare'?{requestedBatches:files['request.json'].batches.length,recordedApprovals:0}:{recordedBatches:files['receipt.json'].approvedBatchIds.length,remainingRows:files['assessment.json'].unresolvedRows}),grantChanges:0,activationAuthorized:false}));
