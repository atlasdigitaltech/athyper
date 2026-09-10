/** Isolated authenticated retrieval qualification. No model call or external egress. */
import {createAtlasRecordDataGateway} from '@athyper/server-platform-ai';
import {createAtlasEntityRecordTool} from '/app/server/node_modules/@athyper/server-platform-ai/dist/entity-record-tool.js';
export function registerAiRetrieval(app,{authenticate,readContext,refresh,metadata,records,authorizer,descriptorHash}){
 const tool=createAtlasEntityRecordTool(metadata);
 const gateway=createAtlasRecordDataGateway({metadata,records,maxRows:1,maxResponseBytes:2048,allowProjectedContentRevision:true,fieldSecurity:{async project({rows,requestedFields}){
  // The real Records query enforces the selected entity/row/field contract;
  // this final projection can only remove keys from its result.
  return rows.map(row=>Object.fromEntries(requestedFields.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])));
 }}});
 app.post('/api/isolated/ai-record-retrieval',authenticate,async(req,res)=>{
  try{
   const context=await refresh(readContext(res));
   if(!(await authorizer.authorize({context,permissionCode:'neon.ai.agent.use',resource:{tenantId:context.tenantId}})).allowed)return res.status(403).json({code:'AI_ADMISSION_DENIED'});
   const args=req.body;
   tool.validateArguments(args);
   if(args.entityCode!=='business_partner'||args.descriptorHash!==descriptorHash)return res.status(409).json({code:'AI_RELEASE_MISMATCH'});
   const result=await tool.readHandler.execute({context:{context,records:gateway,signal:AbortSignal.timeout(10000)},arguments:args});
   res.json({toolCode:tool.manifest.toolCode,...result});
  }catch(error){res.status(403).json({code:'AI_RETRIEVAL_DENIED',reason:error.code??'RETRIEVAL_UNAVAILABLE'});}
 });
}
