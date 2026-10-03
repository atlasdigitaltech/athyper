/** Read-only admission check of actual signed DEV artifacts. No approval or activation is simulated. */
import {readFileSync,writeFileSync} from 'node:fs';
import {Kysely,PostgresDialect,sql} from 'kysely';
import {Pool} from 'pg';
import {bootstrap} from '../../src/kernel/bootstrap.js';
import {activateProductGroup,KyselyPublicationAuthorityRepository} from '@athyper/server-service-publication';
import {loadPublicationWorkloadConfiguration} from '../../src/composition/shared/publication/workload-configuration.js';
import {publicationCompilerIdentity} from '../../src/composition/shared/publication/compiler-build.js';
const base='docs/reports/coordinated-release-';
const candidate=JSON.parse(readFileSync(base+'deployment-recovery-policy-20261003.json','utf8'));
const targets: {deploymentId:string;targetPlane:'studio'|'neon'|'mesh'}[]=JSON.parse(readFileSync(base+'deployment-recovery-execution-20261003.json','utf8')).result.targets;
const config=loadPublicationWorkloadConfiguration(process.env,process.env.ATHYPER_ENV!);
if(!config||process.env.ATHYPER_LOCAL_SOURCE!=='1'||!process.env.STUDIO_WORKER_DATABASE_URL)throw Error('DEV worker configuration required');
const db=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:new Pool({connectionString:process.env.STUDIO_WORKER_DATABASE_URL,max:1})})});
const host=await bootstrap('worker');
const report:any={schema:'athyper.coordinated-product-scope-qualification/1',compiler:publicationCompilerIdentity(),approvedCompiler:candidate.compiler,scope:'Read-only signed artifact and group admission; execution authority and live activation remain separate gates.',planes:[],activatedTargets:0};
const admitted=Error('STOP_BEFORE_TARGET_TRANSACTION');
try{
 await db.transaction().execute(async tx=>{
  await sql`SET TRANSACTION READ ONLY`.execute(tx);
  await sql`SELECT set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(tx);
  const authority=new KyselyPublicationAuthorityRepository(tx);
  for(const plane of ['studio','neon','mesh'] as const){
   const o=host.container.services.publication?.orchestrators[plane] as any;if(!o)throw Error('Orchestrator unavailable');
   const members=[];
   for(const t of targets.filter(t=>t.targetPlane===plane)){
    const deployment=await authority.getDeployment(t.deploymentId);if(!deployment)throw Error('Deployment missing');
    const pin=candidate.deliveries.find((p:any)=>p.releaseId===deployment.sourceReleaseId&&p.plane===plane);
    if(!pin||pin.artifactHash!==deployment.artifactHash)throw Error('Artifact pin changed');
    members.push({deployment,entityCode:deployment.publicationKey.split('.').at(-1)!,expectedActiveHash:null});
   }
   const artifacts:any[]=[];
   try{await activateProductGroup({coordinationHash:candidate.originalPolicy.coordinationHash,plane,environment:'local',instance:'dev',members},{
    // This probe checks artifact admission only; it never authorizes real execution.
    authorize:async()=>{},loader:{load:async d=>{const a=await o.artifactLoader.load(d);artifacts.push({deploymentId:d.deploymentId,artifactHash:d.artifactHash,tenantIdOmitted:!Object.hasOwn(a.document.envelope.payload,'tenantId'),signatureVerified:a.verification.signatureVerified});return a;}},
    transaction:async()=>{throw admitted;},qualify:async()=>{throw Error('Unexpected qualification');},invalidate:async()=>{throw Error('Unexpected invalidation');},
   });throw Error('Expected admission stop');}catch(e){if(e!==admitted)throw e;}
   report.planes.push({plane,admitted:members.length,artifacts});
  }
 });report.passed=true;
}catch(e:any){report.passed=false;report.error={code:e.code,message:e.message};process.exitCode=1;}
finally{await db.destroy();await host.lifecycle.shutdown('scope_admission_probe');report.completedAt=new Date().toISOString();writeFileSync(base+'scope-fix-qualification-20261003.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
