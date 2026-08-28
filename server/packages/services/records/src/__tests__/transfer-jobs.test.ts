import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { KyselyRecordTransferStore } from "../transfer/kysely-transfer-store.js";
import { createRecordExportHandler, createRecordImportHandler, createRecordTransferJobDispatcher, EXECUTE_RECORD_EXPORT_JOB, EXECUTE_RECORD_IMPORT_JOB, RECORD_TRANSFER_QUEUE } from "../transfer/transfer-jobs.js";
import { GovernedImportAdapterRegistry } from "../transfer/import-adapter-registry.js";

const context={planeKey:"neon",realmKey:"athyper",tenantId:"tenant-1",principalId:"principal-1",authEpoch:1,profileHash:"p",requestId:"r",permissions:{planeKey:"neon",tenantId:"tenant-1",principalId:"principal-1",principalFingerprint:"f",profileHash:"p",schemaHash:"s",resolvedAt:1,allowed:[],denied:[],planLocked:[],planeExcluded:[],entries:[],authorizationScopes:[]}}satisfies VerifiedRequestContext;
const descriptor={schema:"athyper.entity-runtime-descriptor/1.0",entityCode:"party",planeKey:"neon",releaseId:"r",releaseNo:1,contractHash:"a".repeat(64),compiledHash:"b".repeat(64),storage:{schema:"master",object:"party",idField:"id"},fields:[],operations:{create:{code:"create",permissionCode:"records.create"},import:{code:"import",permissionCode:"records.import"}},listPresentation:{dataOperations:{importAdapterKey:"test.party.v1",importOperationPermissions:{create:["records.import"]}}}}satisfies EntityRuntimeDescriptor;

describe("record transfer workers",()=>{
  it("maps governed imports to the durable queue with execution coordinates",async()=>{const enqueue=vi.fn(async()=>"job-1");const dispatcher=createRecordTransferJobDispatcher({enqueue});await dispatcher.enqueue("import",{planeKey:"neon",tenantId:"tenant-1",actorPrincipalId:"principal-1"},{jobId:"records:import:1"});expect(enqueue).toHaveBeenCalledWith(RECORD_TRANSFER_QUEUE,EXECUTE_RECORD_IMPORT_JOB,expect.anything(),expect.objectContaining({jobId:"records:import:1",execution:{planeKey:"neon",scope:"tenant",tenantId:"tenant-1",principalId:"principal-1"}}));});
  it("commits every imported row and completion in one transaction",async()=>{
    const calls:string[]=[];
    const store={claimImport:async()=>({session:{id:"s",tenantId:"tenant-1",entityCode:"party",operation:"create",adapterKey:"test.party.v1",descriptorHash:"b".repeat(64),conflictPolicy:"reject",atomicity:"all_or_nothing",status:"running",stagedRowCount:2,validRowCount:2,invalidRowCount:0,checksum:"a".repeat(64),createdAt:"2026-08-12T00:00:00Z"},rows:[{code:"A"},{code:"B"}]}),completeImport:async()=>{calls.push("complete");},failImport:async()=>undefined,releaseImport:async()=>undefined}as unknown as KyselyRecordTransferStore;
    const adapters=new GovernedImportAdapterRegistry([{key:"test.party.v1",supports:()=>true,operations:()=>["create"],validate:async({rowNumber})=>({rowNumber,valid:true,errors:[]}),apply:async({row})=>{calls.push(String(row["code"]));return{outcome:"created"};}}]);
    const handler=createRecordImportHandler({
      store,
      metadata:{getEntityDescriptor:async()=>descriptor},
      authorizer:{authorize:async()=>({allowed:true})},
      adapters,
      transactions:{run:async(_plane,_actor,work)=>work({}as never)},
      audit:{record:async(input)=>({...input,id:"audit",occurredAt:"2026-08-12T00:00:00Z",severity:input.severity??"info"})},
      outbox:{append:async()=>{calls.push("outbox");}},
    });
    const result=await handler.handle({id:"j",name:EXECUTE_RECORD_IMPORT_JOB,queue:RECORD_TRANSFER_QUEUE,data:{planeKey:"neon",tenantId:"tenant-1",sessionId:"s",checksum:"a".repeat(64),actorPrincipalId:"principal-1",context},attempt:1,maxAttempts:3,enqueuedAt:"2026-08-12T00:00:00Z"},{signal:new AbortController().signal,attempt:1,reportProgress:async()=>undefined});
    expect(result).toMatchObject({status:"completed",output:{rowCount:2}});
    expect(calls).toEqual(["A","B","complete","outbox"]);
  });
  it("re-authorizes exports and neutralizes spreadsheet formulas in streamed CSV",async()=>{
    const exportDescriptor={...descriptor,fields:[{key:"code",storagePath:"code",type:"string"as const,required:true,writableOn:[],list:{label:"Code"}},{key:"name",storagePath:"name",type:"string"as const,required:false,writableOn:[],list:{label:"Name"}}],operations:{export:{code:"export",permissionCode:"records.export"}}};
    let artifact="",completed=0;
    const store={claimExport:async()=>({entityCode:"party",actorPrincipalId:"principal-1",exactFilter:{scopeCoordinate:{operatingOrganizationId:"org-1"},_transfer:{format:"csv",fields:["code","name"],headings:true}}}),completeExport:async(_tenant:string,_request:string,_key:string,rowCount:number)=>{completed=rowCount;},failExport:async()=>undefined,releaseExport:async()=>undefined}as unknown as KyselyRecordTransferStore;
    const handler=createRecordExportHandler({store,metadata:{getEntityDescriptor:async()=>exportDescriptor},authorizer:{authorize:async()=>({allowed:true})},queries:{list:async(query)=>{expect(query.scopeCoordinate).toEqual({operatingOrganizationId:"org-1"});return{data:[{code:"=2+2",name:"Acme"}],pagination:{pageSize:1,hasMore:false,countMode:"none"}};},get:async()=>({data:null})},transactions:{run:async(_plane,_actor,work)=>work({}as never)},artifacts:{write:async()=>"unused",createDownloadUrl:async()=>"unused",writeExport:async({content,contentType,extension})=>{expect(contentType).toBe("text/csv");expect(extension).toBe("csv");for await(const chunk of content)artifact+=new TextDecoder().decode(chunk);return"records.csv";}},audit:{record:async(input)=>({...input,id:"audit",occurredAt:"2026-08-12T00:00:00Z",severity:input.severity??"info"})},outbox:{append:async()=>undefined}});
    await handler.handle({id:"j",name:EXECUTE_RECORD_EXPORT_JOB,queue:RECORD_TRANSFER_QUEUE,data:{planeKey:"neon",tenantId:"tenant-1",entityCode:"party",exportRequestId:"e",actorPrincipalId:"principal-1",exactFilter:{},context},attempt:1,maxAttempts:3,enqueuedAt:"2026-08-12T00:00:00Z"},{signal:new AbortController().signal,attempt:1,reportProgress:async()=>undefined});
    expect(artifact).toBe('"code","name"\r\n"\'=2+2","Acme"\r\n');
    expect(completed).toBe(1);
  });
});
