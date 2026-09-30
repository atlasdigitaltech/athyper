#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

type Plane = "mesh" | "studio";
const UUID_NAMESPACE = "athyper:development-phase1-list-fixtures:v1:";
const definitions = {
  mesh: { database: "athyper_mesh", confirmation: "LOCAL-MESH-NETWORK-RELATIONSHIP-FIXTURES" },
  studio: { database: "athyper_studio", confirmation: "LOCAL-STUDIO-METADATA-ENTITY-FIXTURES" },
} as const;

export async function provisionDevelopmentPhase1ListFixtures(options: { plane: Plane; databaseUrl: string; confirmation?: string; dryRun?: boolean }) {
  const definition=definitions[options.plane],url=new URL(options.databaseUrl);
  if(!localDatabase(url)||url.pathname!==`/${definition.database}`)throw new Error(`development ${options.plane} list fixtures require local ${definition.database}`);
  if(!options.dryRun&&options.confirmation!==definition.confirmation)throw new Error(`apply requires --confirm=${definition.confirmation}`);
  const client=new Client({connectionString:options.databaseUrl});await client.connect();
  try { return options.plane==="mesh"?await provisionMesh(client,Boolean(options.dryRun)):await provisionStudio(client,Boolean(options.dryRun)); } finally { await client.end(); }
}

async function provisionMesh(client: Client, dryRun: boolean) {
  if(dryRun)return{mode:"planned",plane:"mesh",developmentSupplierAccounts:12,minimumRelationships:45,qualification:"three acting accounts have more than one ten-row cursor page"};
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('development.mesh-network-relationship-list.v1',0)),set_config('app.database_plane','mesh',true)");
    const catl=await one<{tenant_id:string;actor_id:string}>(client,"SELECT tenant.id::text tenant_id,principal.id::text actor_id FROM master.tenant tenant JOIN master.principal principal ON principal.tenant_id=tenant.id WHERE tenant.code='cirrusatlantic' AND principal.code='catl.admin' AND tenant.status='active' AND principal.status='active'");
    await client.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",[catl.tenant_id,catl.actor_id]);
    for(let index=1;index<=12;index+=1){
      const code=`dev-supplier-catl-${String(index).padStart(3,"0")}`,id=deterministicUuid(`network-account:${code}`),metadata=JSON.stringify({_seed:{pack:"development.mesh-network-relationship-list.v1",version:"1.0.0"}});
      await client.query("INSERT INTO mesh.network_account(id,tenant_id,account_code,display_name,legal_name,network_role,country_code,default_currency,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3,$4,$5,'supplier','GB','GBP',$6::jsonb,'active',$7::uuid) ON CONFLICT(account_code) DO NOTHING",[id,catl.tenant_id,code,`CATL Development Supplier ${index}`,`CATL Development Supplier ${index} Limited`,metadata,catl.actor_id]);
      const actual=await one<{id:string}>(client,"SELECT id::text FROM mesh.network_account WHERE account_code=$1 AND tenant_id=$2::uuid",[code,catl.tenant_id]);if(actual.id!==id)throw new Error(`network account fixture conflict: ${code}`);
    }
    const accounts=(await client.query<{id:string;tenant_id:string;account_code:string;network_role:string}>("SELECT id::text,tenant_id::text,account_code,network_role::text FROM mesh.network_account WHERE status='active' ORDER BY account_code")).rows;
    const byCode=new Map(accounts.map((account)=>[account.account_code,account])),suppliers=accounts.filter((account)=>account.network_role==="supplier");
    const buyerA=required(byCode,"bna-1000000001"),buyerB=required(byCode,"bna-1000000002"),buyerCatl=required(byCode,"bna-1000000022");
    const pairs=[...relationships(buyerA,suppliers.filter((supplier)=>supplier.tenant_id!==buyerA.tenant_id)),...relationships(buyerB,suppliers.filter((supplier)=>supplier.tenant_id!==buyerB.tenant_id)),...relationships(buyerCatl,suppliers.filter((supplier)=>supplier.tenant_id!==buyerCatl.tenant_id).slice(0,15))];
    const unique=[...new Map(pairs.map((pair)=>[`${pair.buyer.id}:${pair.supplier.id}`,pair])).values()];
    for(const [index,pair] of unique.entries()){
      const principal=await one<{id:string}>(client,"SELECT id::text FROM master.principal WHERE tenant_id=$1::uuid AND status='active' ORDER BY CASE WHEN code LIKE '%admin' THEN 0 ELSE 1 END,code LIMIT 1",[pair.buyer.tenant_id]);
      await client.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),set_config('app.current_network_account_id',$3,true)",[pair.buyer.tenant_id,principal.id,pair.buyer.id]);
      const key=`dev-list-${deterministicUuid(`relationship:${pair.buyer.id}:${pair.supplier.id}:commercial`)}`;
      const command=await one<{relationship_id:string}>(client,"SELECT relationship_id::text FROM mesh.command_request_network_relationship($1::uuid,$2::uuid,$3::uuid,$4::uuid,'commercial','2026-01-01',NULL,'Development list fixture',$5,$6::uuid)",[pair.buyer.tenant_id,pair.buyer.id,pair.supplier.tenant_id,pair.supplier.id,key,principal.id]);
      const actual=await one<{id:string}>(client,"SELECT id::text FROM mesh.network_relationship WHERE buyer_account_id=$1::uuid AND supplier_account_id=$2::uuid AND relationship_kind='commercial' AND status='requested'",[pair.buyer.id,pair.supplier.id]);if(actual.id!==command.relationship_id)throw new Error(`network relationship fixture conflict: ${pair.buyer.account_code}/${pair.supplier.account_code}`);
    }
    await client.query("COMMIT");return{mode:"applied",plane:"mesh",developmentSupplierAccounts:12,relationships:unique.length,visibility:visibility(unique)};
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}
}

async function provisionStudio(client: Client, dryRun: boolean) {
  const codes=["business_partner","company_code","legal_entity","operating_organization","supplier","customer","product","item","purchase_order","purchase_requisition","goods_receipt","supplier_invoice","payment","journal_entry","cost_center","profit_center","project","employee","network_account","network_relationship","catalog","catalog_item","document_envelope","workflow_item","notification","saved_view","entity_definition","entity_change_set","entity_release","publication_job"] as const;
  if(dryRun)return{mode:"planned",plane:"studio",entities:codes.length,tenantOverlays:1,codes};
  await client.query("BEGIN");
  try{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('development.studio-metadata-entity-list.v1',0)),set_config('app.database_plane','studio',true),set_config('app.current_principal_id','00000000-0000-0000-0000-000000000000',true)");
    const module=await one<{id:string}>(client,"SELECT id::text FROM control.module WHERE code='meta' AND status='active'");
    for(const [index,code] of codes.entries()){
      const id=deterministicUuid(`metadata-entity:${code}`),entityClass=index<6?"configuration":index<25?"business":index<29?"technical":"process";
      await client.query("INSERT INTO metadata.entity(id,tenant_id,module_id,entity_code,entity_class,ownership_model,status,created_by) VALUES($1::uuid,NULL,$2::uuid,$3,$4,'system','active','00000000-0000-0000-0000-000000000000'::uuid) ON CONFLICT(tenant_id,entity_code) DO NOTHING",[id,module.id,code,entityClass]);
      const actual=await one<{id:string;entity_class:string;ownership_model:string;status:string}>(client,"SELECT id::text,entity_class::text,ownership_model::text,status::text FROM metadata.entity WHERE tenant_id IS NULL AND entity_code=$1",[code]);
      if(actual.id!==id||actual.entity_class!==entityClass||actual.ownership_model!=="system"||actual.status!=="active")throw new Error(`metadata Entity fixture conflict: ${code}`);
    }
    const tenant=await one<{tenant_id:string;actor_id:string}>(client,"SELECT tenant.id::text tenant_id,principal.id::text actor_id FROM master.tenant tenant JOIN master.principal principal ON principal.tenant_id=tenant.id WHERE tenant.code='cirrusatlantic' AND principal.code='catl.admin' AND tenant.status='active' AND principal.status='active'");
    await client.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",[tenant.tenant_id,tenant.actor_id]);
    const overlayId=deterministicUuid("metadata-entity:cirrusatlantic:business_partner");
    await client.query("INSERT INTO metadata.entity(id,tenant_id,module_id,entity_code,entity_class,ownership_model,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,'business_partner','configuration','overlay','active',$4::uuid) ON CONFLICT(tenant_id,entity_code) DO NOTHING",[overlayId,tenant.tenant_id,module.id,tenant.actor_id]);
    const overlay=await one<{id:string;ownership_model:string;status:string}>(client,"SELECT id::text,ownership_model::text,status::text FROM metadata.entity WHERE tenant_id=$1::uuid AND entity_code='business_partner'",[tenant.tenant_id]);
    if(overlay.id!==overlayId||overlay.ownership_model!=="overlay"||overlay.status!=="active")throw new Error("metadata Entity tenant overlay fixture conflict: cirrusatlantic/business_partner");
    await client.query("COMMIT");return{mode:"applied",plane:"studio",entities:codes.length,tenantOverlays:1,tenantOverlayEntityId:overlayId,codes};
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}
}

function relationships(buyer:{id:string;tenant_id:string;account_code:string;network_role:string},suppliers:readonly {id:string;tenant_id:string;account_code:string;network_role:string}[]){return suppliers.filter((supplier)=>supplier.id!==buyer.id).map((supplier)=>({buyer,supplier}));}
function visibility(pairs:readonly {buyer:{id:string;account_code:string};supplier:{id:string;account_code:string}}[]){const counts=new Map<string,number>();for(const pair of pairs){counts.set(pair.buyer.account_code,(counts.get(pair.buyer.account_code)??0)+1);counts.set(pair.supplier.account_code,(counts.get(pair.supplier.account_code)??0)+1);}return [...counts].map(([networkAccountCode,expectedVisibleCount])=>({networkAccountCode,expectedVisibleCount})).sort((left,right)=>left.networkAccountCode.localeCompare(right.networkAccountCode));}
function required<T>(map:ReadonlyMap<string,T>,key:string):T{const value=map.get(key);if(!value)throw new Error(`missing fixture coordinate: ${key}`);return value;}
function deterministicUuid(name:string):string{const bytes=createHash("sha1").update(UUID_NAMESPACE).update(name).digest().subarray(0,16);bytes[6]=(bytes[6]!&15)|80;bytes[8]=(bytes[8]!&63)|128;const hex=bytes.toString("hex");return`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
function localDatabase(url:URL):boolean{if(["localhost","127.0.0.1","::1"].includes(url.hostname))return true;const octets=url.hostname.split(".").map(Number);return octets.length===4&&octets.every((octet)=>Number.isInteger(octet)&&octet>=0&&octet<=255)&&(octets[0]===10||(octets[0]===172&&octets[1]!>=16&&octets[1]!<=31)||(octets[0]===192&&octets[1]===168));}
async function one<T extends object>(client:Pick<Client,"query">,statement:string,values:unknown[]=[]):Promise<T>{const result=await client.query<T>(statement,values);if(result.rows.length!==1)throw new Error(`expected one row, received ${result.rows.length}`);return result.rows[0]!;}
function option(args:readonly string[],name:string):string|undefined{const equal=args.find((item)=>item.startsWith(`${name}=`));if(equal)return equal.slice(name.length+1);const index=args.indexOf(name);return index<0?undefined:args[index+1];}
async function main():Promise<void>{const args=process.argv.slice(2),plane=option(args,"--plane");if(plane!=="mesh"&&plane!=="studio")throw new Error("--plane must be mesh or studio");const databaseUrl=option(args,"--database-url")??process.env[plane==="mesh"?"ATHYPER_MESH_DATABASE_ADMIN_URL":"ATHYPER_STUDIO_DATABASE_ADMIN_URL"];if(!databaseUrl)throw new Error(`set the ${plane} database URL or --database-url`);const result=await provisionDevelopmentPhase1ListFixtures({plane,databaseUrl,confirmation:option(args,"--confirm"),dryRun:args.includes("--plan")||args.includes("--dry-run")});process.stdout.write(`${JSON.stringify(result,null,2)}\n`);}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href)await main();
