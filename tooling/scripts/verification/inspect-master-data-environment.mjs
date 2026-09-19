#!/usr/bin/env node
// Inventory only: deliberately never certifies functional or production acceptance.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
export function inventorySql(role='athyper_runtime') {
 if(!['athyper_runtime','athyper_worker'].includes(role))throw Error('Use an application runtime or worker role');
 const probe=readFileSync(resolve(repo,'docs/runbooks/master-data-phase1/database-compatibility.sql'),'utf8');
 return probe.replace('BEGIN READ ONLY;',`BEGIN READ ONLY; SET LOCAL ROLE ${role};`);
}
export function summarizeInventory(inventory){
 const objects=inventory.objects??[];
 return {role:inventory.role,readOnly:inventory.readOnly==='on',roleBypassesRls:!!(inventory.roleFlags?.superuser||inventory.roleFlags?.bypassRls),
 missingObjects:objects.filter(o=>!o.exists).map(o=>o.name),
 columnMismatches:(inventory.columnChecks??[]).filter(c=>!c.matches).map(c=>`${c.table}.${c.column}`),
 masterTableIsolation:objects.filter(o=>['master.address','master.address_link','master.contact_link'].includes(o.name)).map(o=>({name:o.name,rlsEnabled:o.rlsEnabled,rlsForced:o.rlsForced,ownedByRole:o.ownedByCurrentRole,select:o.select,insert:o.insert,update:o.update})),
 functionalAcceptance:'not_run',qualified:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),get=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
 const environment=get('--environment'),container=get('--container'),database=get('--database'),role=get('--role')??'athyper_runtime',output=get('--output');
 if(!['qa','staging','production'].includes(environment)||!/^athyper-[a-z0-9-]+-db-1$/.test(container??'')||!/^athyper_(neon|studio|mesh)$/.test(database??'')||!output)throw Error('Specify --environment qa|staging|production --container NAME --database athyper_PLANE --output FILE [--role athyper_runtime|athyper_worker]');
 const result=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-X','-qAt','-v','ON_ERROR_STOP=1'],{input:inventorySql(role),encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
 if(result.status!==0)throw Error('Read-only database inventory failed; verify target access and role availability');
 const inventory=JSON.parse(result.stdout),summary=summarizeInventory(inventory);
 const report={schema:'athyper.master-data.environment-inventory.v1',environment,container,database,observedAt:new Date().toISOString(),method:'local Docker administrator connection with SET LOCAL ROLE; not application authentication or pooler qualification',summary,inventory};
 writeFileSync(resolve(output),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({output:resolve(output),...summary}));
}
