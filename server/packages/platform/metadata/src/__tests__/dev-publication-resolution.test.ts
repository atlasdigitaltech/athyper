import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Kysely, PostgresDialect, type PostgresPoolClient } from 'kysely';
import { expect, it } from 'vitest';
import { createRuntimeMetaCompiledEntityReleaseSource } from '../runtime-descriptor-repository.js';
import { PinnedCompiledEntityReader } from '../compiled-entity-reader.js';
import { readCompiledRuntimeContract } from '../compiled-runtime-contract.js';

it.runIf(process.env.RUN_DEV_METADATA_LIVE_TESTS === '1')('resolves DEV Country for both tenants on all planes and retains Neon BP artifacts', async () => {
  const evidence: unknown[]=[];
  for (const plane of ['neon','mesh','studio'] as const) {
    const query=async (statement:string,parameters:readonly unknown[])=>{
      const sql=statement.replace(/\$(\d+)/g,(_,n)=>parameters[Number(n)-1]==null?'NULL':`'${String(parameters[Number(n)-1]).replaceAll("'","''")}'`);
      const result=execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',`athyper_${plane}`],{input:`BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM (${sql}) r; COMMIT;`,encoding:'utf8',maxBuffer:32*1024*1024});
      const rows=JSON.parse(result.trim());return {rows,command:'SELECT',rowCount:rows.length};
    };
    const database=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:{end:async()=>{},connect:async()=>({query:query as unknown as PostgresPoolClient['query'],release:()=>{}})}})});
    const reader=new PinnedCompiledEntityReader({source:createRuntimeMetaCompiledEntityReleaseSource({databases:{[plane]:database}})});
    try {
      for (const [tenant,tenantId] of [['athyper','11111111-1111-4111-8111-111111111111'],['cirrusatlantic','44444444-4444-4444-8444-444444444444']]) {
        const coordinate={tenantId:tenantId!,principalId:'00000000-0000-4000-8000-000000000001',planeKey:plane,entityCode:'country'};
        const resolved=await reader.resolve(coordinate);
        expect(resolved).not.toBeNull();
        const descriptor=await readCompiledRuntimeContract(reader,resolved!);
        expect(descriptor.releaseId).toBe('934dae8a-0ded-459c-a9ea-349beaccf155');
        expect(descriptor.operations.list).toBeTruthy();expect(descriptor.operations.read).toBeTruthy();
        evidence.push({plane,tenant,entity:'country',releaseId:descriptor.releaseId,list:descriptor.operations.list,read:descriptor.operations.read});
        if (plane==='neon') {
          const bp=await reader.resolve({...coordinate,entityCode:'business_partner'});
          expect(bp).not.toBeNull();
          const core=await reader.core(bp!);
          const publication=await reader.publicationCoordinate(bp!);
          expect(publication.releaseId).toBe(tenant==='athyper'?'b0515908-244d-40e9-b518-12116ddb7354':'28bf5bff-caba-5a16-b971-dfc376b2b501');
          evidence.push({plane,tenant,entity:'business_partner',...publication,coreHash:core.artifactHash});
        }
      }
    } finally { await database.destroy(); }
  }
  if(process.env.DEV_METADATA_RECEIPT) writeFileSync(process.env.DEV_METADATA_RECEIPT,JSON.stringify({capturedAt:new Date().toISOString(),scope:'Read-only actual repository/reader against DEV Postgres as database owner. Validates resolution and pinned artifacts, not authenticated API/browser access.',evidence},null,2)+'\n');
});
