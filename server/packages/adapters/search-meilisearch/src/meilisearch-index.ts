import type {SearchDocument,SearchIndex,SearchQuery,SearchResult} from "@athyper/server-contract-search";

export interface MeilisearchIndexConfig {
  readonly baseUrl:string;
  readonly apiKey:string;
  readonly indexUid?:string;
  /** Maximum duration of an HTTP request and of an asynchronous Meilisearch task. */
  readonly timeoutMs?:number;
  readonly taskPollIntervalMs?:number;
  readonly fetch?:typeof globalThis.fetch;
}
export interface MeilisearchHealth{readonly status:"healthy"|"unhealthy";readonly message?:string;}
export interface MeilisearchIndex extends SearchIndex{initialize():Promise<void>;health():Promise<MeilisearchHealth>;close():void;}

interface MeilisearchTask {
  readonly uid?:number;
  readonly taskUid?:number;
  readonly status?:"enqueued"|"processing"|"succeeded"|"failed"|"canceled";
  readonly error?:{readonly code?:string;readonly message?:string;readonly type?:string;readonly link?:string}|null;
}

export function createMeilisearchIndex(config:MeilisearchIndexConfig):MeilisearchIndex {
  if(!/^https?:\/\//.test(config.baseUrl))throw new Error("Meilisearch baseUrl must be HTTP(S)");
  if(!config.apiKey)throw new Error("Meilisearch apiKey is required");
  const base=config.baseUrl.replace(/\/+$/g,"");
  const indexUid=config.indexUid??"documents";
  const index=encodeURIComponent(indexUid);
  const timeout=config.timeoutMs??10_000;
  const pollInterval=config.taskPollIntervalMs??50;
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error("Meilisearch timeoutMs must be positive");
  if(!Number.isFinite(pollInterval)||pollInterval<0)throw new Error("Meilisearch taskPollIntervalMs must not be negative");
  const fetcher=config.fetch??globalThis.fetch;
  const active=new Set<AbortController>();
  let closed=false;

  async function request(path:string,init:RequestInit={}) {
    if(closed)throw new Error("Meilisearch index is closed");
    const controller=new AbortController();
    active.add(controller);
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{return await fetcher(`${base}${path}`,{...init,headers:{authorization:`Bearer ${config.apiKey}`,...(init.body?{"content-type":"application/json"}:{}),...init.headers},signal:controller.signal});}
    finally{clearTimeout(timer);active.delete(controller);}
  }
  async function ok(path:string,init:RequestInit={}) {
    const response=await request(path,init);
    if(!response.ok){const body=(await response.text().catch(()=>"")).slice(0,500);throw new Error(`Meilisearch ${response.status}: ${body}`);}
    return response;
  }
  async function acceptedTask(path:string,init:RequestInit,allowedFailureCode?:string) {
    const response=await ok(path,init);
    let task:MeilisearchTask;
    try{task=await response.json() as MeilisearchTask;}
    catch{throw new Error("Meilisearch accepted an operation without a valid task response");}
    const taskUid=task.taskUid??task.uid;
    if(!Number.isInteger(taskUid)||Number(taskUid)<0)throw new Error("Meilisearch task response did not include a valid taskUid");
    return waitForTask(Number(taskUid),allowedFailureCode);
  }
  async function waitForTask(taskUid:number,allowedFailureCode?:string) {
    const deadline=Date.now()+timeout;
    while(true){
      if(closed)throw new Error("Meilisearch index is closed");
      const response=await ok(`/tasks/${taskUid}`);
      const task=await response.json() as MeilisearchTask;
      if(task.status==="succeeded")return task;
      if(task.status==="failed"||task.status==="canceled"){
        if(task.status==="failed"&&allowedFailureCode&&task.error?.code===allowedFailureCode)return task;
        const detail=task.error?.message??task.error?.code??"no error detail";
        throw new Error(`Meilisearch task ${taskUid} ${task.status}: ${detail}`);
      }
      if(task.status!=="enqueued"&&task.status!=="processing")throw new Error(`Meilisearch task ${taskUid} returned invalid status: ${String(task.status)}`);
      const remaining=deadline-Date.now();
      if(remaining<=0)throw new Error(`Meilisearch task ${taskUid} timed out after ${timeout}ms`);
      await delay(Math.min(pollInterval,remaining));
    }
  }
  function delay(ms:number){return ms===0?Promise.resolve():new Promise<void>(resolve=>setTimeout(resolve,ms));}

  return {
    async initialize(){
      const existing=await request(`/indexes/${index}`);
      if(existing.status===404){
        await acceptedTask("/indexes",{method:"POST",body:JSON.stringify({uid:indexUid,primaryKey:"id"})},"index_already_exists");
      }else if(!existing.ok){
        const body=(await existing.text().catch(()=>"")).slice(0,500);
        throw new Error(`Meilisearch ${existing.status}: ${body}`);
      }
      await acceptedTask(`/indexes/${index}/settings`,{method:"PATCH",body:JSON.stringify({searchableAttributes:["title","text","file_name","entity_type"],filterableAttributes:["plane_key","tenant_id","entity_type","attachment_id","resource_type","resource_id"],sortableAttributes:["updated_at"]})});
    },
    async upsert(document:SearchDocument){await acceptedTask(`/indexes/${index}/documents`,{method:"POST",body:JSON.stringify([toStored(document)])});},
    async remove(documentId:string){await acceptedTask(`/indexes/${index}/documents/${encodeURIComponent(documentId)}`,{method:"DELETE"});},
    async search(query:SearchQuery):Promise<SearchResult>{const filters=[`plane_key = ${literal(query.planeKey)}`,`tenant_id = ${literal(query.tenantId)}`];if(query.entityTypes?.length)filters.push(`entity_type IN [${query.entityTypes.map(literal).join(", ")}]`);if(query.resourceTypes?.length)filters.push(`resource_type IN [${query.resourceTypes.map(literal).join(", ")}]`);const response=await ok(`/indexes/${index}/search`,{method:"POST",body:JSON.stringify({q:query.text,filter:filters,limit:query.limit,offset:query.offset,attributesToRetrieve:["attachment_id","resource_type","resource_id","entity_type","entity_id","title","content_type","file_name","updated_at"],attributesToCrop:["text"],cropLength:40,cropMarker:"…"})});const payload=await response.json() as {hits?:Array<Record<string,unknown>>;estimatedTotalHits?:number;processingTimeMs?:number};return {hits:(payload.hits??[]).map(toHit),total:payload.estimatedTotalHits??0,processingMs:payload.processingTimeMs??0};},
    async health(){try{const response=await request("/health");return response.ok?{status:"healthy"}:{status:"unhealthy",message:`Meilisearch health returned ${response.status}`};}catch(error){return {status:"unhealthy",message:error instanceof Error?error.message:String(error)};}},
    close(){closed=true;for(const controller of active)controller.abort();active.clear();}
  };
}

function toStored(document:SearchDocument){return {id:document.id,plane_key:document.planeKey,tenant_id:document.tenantId,attachment_id:document.attachmentId,resource_type:document.resourceType??"attachment",resource_id:document.resourceId??document.attachmentId,entity_type:document.entityType,entity_id:document.entityId,title:document.title,text:document.text,content_type:document.contentType,file_name:document.fileName,pii_types:[...document.piiTypes],updated_at:document.updatedAt};}
function toHit(hit:Record<string,unknown>){const formatted=object(hit["_formatted"]),resourceType=hit["resource_type"]==="content_item"?"content_item"as const:"attachment"as const;return {attachmentId:String(hit["attachment_id"]??""),resourceType,resourceId:String(hit["resource_id"]??hit["attachment_id"]??""),entityType:String(hit["entity_type"]??""),entityId:String(hit["entity_id"]??""),title:String(hit["title"]??""),contentType:String(hit["content_type"]??""),fileName:String(hit["file_name"]??""),updatedAt:String(hit["updated_at"]??""),...(typeof formatted["text"]==="string"?{snippet:formatted["text"]}:{})};}
function object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function literal(value:string){return JSON.stringify(value);}
