import {describe,expect,it,vi} from "vitest";
import {createSearchBackfillHandler} from "../search-backfill.js";

describe("governed search backfill",()=>{
  it("reuses durable text, skips unchanged documents, checkpoints, then explicitly reconciles",async()=>{
    const upsert=vi.fn(async()=>undefined),remove=vi.fn(async()=>undefined),checkpoint=vi.fn(async()=>undefined);
    const handler=createSearchBackfillHandler({index:{upsert,remove,search:async()=>({hits:[],total:0,processingMs:0})},repository:{loadBatch:vi.fn().mockResolvedValueOnce([{cursor:"a",sourceChecksum:"same",indexedChecksum:"same",document:document("a")},{cursor:"b",sourceChecksum:"new",indexedChecksum:"old",document:document("b")}]).mockResolvedValueOnce([]),checkpoint,markIndexed:async()=>undefined,async *staleDocumentIds(){yield "stale";},markCompleted:async()=>undefined}});
    await expect(handler.handle(job(),context())).resolves.toMatchObject({status:"completed",output:{processed:2,indexed:1,skipped:1,removed:1}});
    expect(upsert).toHaveBeenCalledTimes(1);expect(remove).toHaveBeenCalledWith("stale");expect(checkpoint).toHaveBeenCalledWith(expect.objectContaining({cursor:"b"}));
  });
  it("dry run performs no index writes",async()=>{const upsert=vi.fn(),remove=vi.fn();const request={...job().data,dryRun:true};const handler=createSearchBackfillHandler({index:{upsert,remove,search:async()=>({hits:[],total:0,processingMs:0})},repository:{loadBatch:vi.fn().mockResolvedValueOnce([{cursor:"a",sourceChecksum:"new",document:document("a")}]).mockResolvedValueOnce([]),checkpoint:async()=>undefined,markIndexed:async()=>undefined,async *staleDocumentIds(){yield "stale";},markCompleted:async()=>undefined}});await handler.handle({...job(),data:request},context());expect(upsert).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();});
});
const document=(id:string)=>({id,planeKey:"neon",tenantId:"t",attachmentId:id,entityType:"invoice",entityId:"e",title:"Invoice",text:"durable extracted text",contentType:"text/plain",fileName:"a.txt",piiTypes:[],updatedAt:"2026-08-10T00:00:00Z"});
const job=()=>({id:"job",name:"documents.search-backfill.run" as const,queue:"documents.search-backfill",data:{planeKey:"neon" as const,tenantId:"tenant",principalId:"principal",dryRun:false,reconcile:true,batchSize:100,concurrency:2,sourceRevision:"rev-1"},attempt:1,maxAttempts:3,enqueuedAt:"2026-08-10T00:00:00Z"});
const context=()=>({signal:new AbortController().signal,attempt:1,reportProgress:vi.fn(async()=>undefined)});
