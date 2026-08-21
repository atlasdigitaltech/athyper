import type { JobExecutionContext, JobExecutionResult, JobHandler, JobPublisher } from "@athyper/server-contract-jobs";
import type { SearchDocument, SearchIndex } from "@athyper/server-contract-search";

export const SEARCH_BACKFILL_QUEUE = "documents.search-backfill";
export const SEARCH_BACKFILL_JOB = "documents.search-backfill.run";

export interface SearchBackfillRequest {
  readonly planeKey: "studio" | "neon" | "mesh";
  readonly tenantId: string;
  readonly principalId: string;
  readonly entityTypes?: readonly string[];
  readonly dryRun: boolean;
  readonly reconcile: boolean;
  readonly batchSize: number;
  readonly concurrency: number;
  readonly cursor?: string;
  readonly sourceRevision: string;
  readonly estimatedTotal?: number;
}
export interface SearchBackfillCandidate {
  readonly cursor: string; readonly document: SearchDocument; readonly sourceChecksum: string;
  readonly indexedChecksum?: string;
}
export interface SearchBackfillRepository {
  loadBatch(request: SearchBackfillRequest, cursor: string | undefined): Promise<readonly SearchBackfillCandidate[]>;
  checkpoint(input: { readonly request: SearchBackfillRequest; readonly cursor: string; readonly processed: number; readonly indexed: number; readonly skipped: number; readonly failed: number }): Promise<void>;
  markIndexed(input: { readonly request: SearchBackfillRequest; readonly documentId: string; readonly sourceChecksum: string }): Promise<void>;
  staleDocumentIds(request: SearchBackfillRequest): AsyncIterable<string>;
  markCompleted(input: { readonly request: SearchBackfillRequest; readonly processed: number; readonly indexed: number; readonly skipped: number; readonly failed: number; readonly removed: number }): Promise<void>;
}

export function createSearchBackfillHandler(options: { readonly repository: SearchBackfillRepository; readonly index: SearchIndex; readonly now?: () => number }): JobHandler<typeof SEARCH_BACKFILL_JOB, SearchBackfillRequest> {
  return { async handle(job, context): Promise<JobExecutionResult> {
    const request = validate(job.data); const started = (options.now ?? Date.now)();
    let cursor=request.cursor,processed=0,indexed=0,skipped=0,failed=0,removed=0;
    for (;;) {
      abort(context); const batch=await options.repository.loadBatch(request,cursor); if(!batch.length)break;
      for(let offset=0;offset<batch.length;offset+=request.concurrency){
        abort(context); const window=batch.slice(offset,offset+request.concurrency);
        await Promise.all(window.map(async(candidate)=>{
          processed++;
          if(candidate.indexedChecksum===candidate.sourceChecksum){skipped++;return;}
          if(request.dryRun){indexed++;return;}
          try{await options.index.upsert(candidate.document);await options.repository.markIndexed({request,documentId:candidate.document.id,sourceChecksum:candidate.sourceChecksum});indexed++;}catch{failed++;}
        }));
      }
      cursor=batch[batch.length-1]!.cursor;
      await options.repository.checkpoint({request,cursor:cursor!,processed,indexed,skipped,failed});
      await progress(context,{stage:"index",cursor,processed,indexed,skipped,failed,started,now:(options.now??Date.now)(),estimatedTotal:request.estimatedTotal});
      if(batch.length<request.batchSize)break;
    }
    if(request.reconcile){
      await context.reportProgress({stage:"reconcile",processed,indexed,skipped,failed});
      for await(const id of options.repository.staleDocumentIds(request)){abort(context);if(!request.dryRun)await options.index.remove(id);removed++;}
    }
    await options.repository.markCompleted({request,processed,indexed,skipped,failed,removed});
    if(failed)throw new Error(`Search backfill completed with ${failed} failed documents`);
    return {status:"completed",output:{processed,indexed,skipped,removed,dryRun:request.dryRun,sourceRevision:request.sourceRevision}};
  }};
}

export async function submitSearchBackfill(jobs:JobPublisher,request:SearchBackfillRequest):Promise<string>{
  const value=validate(request);return jobs.enqueue(SEARCH_BACKFILL_QUEUE,SEARCH_BACKFILL_JOB,value,{jobId:`search-backfill-${value.planeKey}-${value.tenantId}-${value.sourceRevision}`,maxAttempts:3,timeoutMs:24*60*60*1000,execution:{planeKey:value.planeKey,scope:"tenant",tenantId:value.tenantId,principalId:value.principalId},payloadSchema:{name:SEARCH_BACKFILL_JOB,version:1},removeOnComplete:1000,removeOnFail:5000});
}
function validate(value:SearchBackfillRequest):SearchBackfillRequest{if(!["studio","neon","mesh"].includes(value.planeKey)||!value.tenantId||!value.principalId||!value.sourceRevision.trim())throw new TypeError("Invalid search backfill scope");if(!Number.isInteger(value.batchSize)||value.batchSize<1||value.batchSize>1000)throw new TypeError("batchSize must be 1-1000");if(!Number.isInteger(value.concurrency)||value.concurrency<1||value.concurrency>20)throw new TypeError("concurrency must be 1-20");if(value.estimatedTotal!==undefined&&(!Number.isInteger(value.estimatedTotal)||value.estimatedTotal<0))throw new TypeError("estimatedTotal must be non-negative");return value;}
function abort(context:JobExecutionContext){if(context.signal.aborted)throw context.signal.reason??new Error("Search backfill cancelled");}
async function progress(context:JobExecutionContext,value:{stage:string;cursor?:string;processed:number;indexed:number;skipped:number;failed:number;started:number;now:number;estimatedTotal?:number}){const elapsed=Math.max(1,value.now-value.started);const rate=value.processed/(elapsed/1000);const remaining=value.estimatedTotal===undefined?undefined:Math.max(0,value.estimatedTotal-value.processed);await context.reportProgress({stage:value.stage,cursor:value.cursor,processed:value.processed,indexed:value.indexed,skipped:value.skipped,failed:value.failed,documentsPerSecond:Number(rate.toFixed(2)),...(remaining===undefined?{}:{etaSeconds:Math.ceil(remaining/Math.max(rate,0.001))})});}
