/** Exact DEV job retry through shared administration; preserves queued identity and signed artifact. */
import { readFileSync } from "node:fs";
import { sql } from "kysely";
import { bootstrap } from "../kernel/bootstrap.js";
const report=JSON.parse(readFileSync('docs/reports/coordinated-release-post-replacement-status-20261003.json','utf8'));
const host=await bootstrap('api');
try {
 if(host.config.env!=='local'||!host.container.services.jobs)throw Error('DEV job administration required');
 const a=host.container.adapters,databases={studio:a.athyperDatabase?.database,neon:a.neonDatabase?.database,mesh:a.meshDatabase?.database};
 const results=[];
 for(const plane of ['studio','neon','mesh'] as const){
  const database=databases[plane];if(!database)throw Error('Plane database required');
  const deploymentIds=report.deliveries.filter((d:any)=>d.plane_code===plane).map((d:any)=>d.deployment_id);
  const rows=await database.transaction().execute(async(tx:any)=>{
   await sql`SELECT set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true)`.execute(tx);
   return (await sql<{id:string;tenant_id:string;created_by:string;deployment_id:string}>`SELECT DISTINCT ON(input_payload->>'deploymentId') id,tenant_id,created_by,input_payload->>'deploymentId' deployment_id
    FROM ops.job_execution WHERE job_code='publication.apply-release' AND status='dead_letter'
    AND input_payload->>'deploymentId'=ANY(${deploymentIds}::text[]) ORDER BY input_payload->>'deploymentId',created_at DESC`.execute(tx)).rows;
  });
  for(const row of rows){const result=await host.container.services.jobs.retry({executionId:row.id,
   execution:{planeKey:plane,scope:'tenant',tenantId:row.tenant_id,principalId:row.created_by},
   reason:'Retry exact approved coordinated deployment after installing bounded worker coordinate-read prerequisites (20261003).'});
   results.push({plane,deploymentId:row.deployment_id,...result});}
 }
 console.log(JSON.stringify({schema:'athyper.coordinated-apply-retry/1',results}));
}finally{await host.lifecycle.shutdown('coordinated_retry_complete');}
