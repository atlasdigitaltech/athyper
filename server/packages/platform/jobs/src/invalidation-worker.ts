export interface InvalidationMessage {
  readonly id:string;readonly kind:"metadata"|"authorization";readonly planeKey:string;readonly tenantId:string|null;
  readonly scopeKey:string;readonly payload:Readonly<Record<string,unknown>>;readonly createdAt:string;readonly attemptCount:number;
}
export interface DurableInvalidationRepository {
  claim(input:{readonly workerId:string;readonly limit:number;readonly leaseSeconds:number}):Promise<readonly InvalidationMessage[]>;
  complete(id:string,workerId:string,generation:number):Promise<boolean>;
  fail(input:{readonly id:string;readonly workerId:string;readonly errorCode:string;readonly retryAt:string;readonly deadLetter:boolean;readonly sanitizedPayload:Readonly<Record<string,unknown>>}):Promise<boolean>;
  backlog():Promise<{readonly pending:number;readonly oldestCreatedAt:string|null}>;
}
export interface GenerationStore { incrementOnce(input:{readonly eventId:string;readonly kind:"metadata"|"authorization";readonly planeKey:string;readonly tenantId:string|null;readonly scopeKey:string}):Promise<number>; }
export interface InvalidationWakeListener { start(onWake:()=>void,onReconnect:()=>void):Promise<void>; close():Promise<void>; }
export interface InvalidationMetrics {
  processed(kind:string,lagMs:number):void;failed(kind:string,errorCode:string,deadLetter:boolean):void;
  reconnect():void;backlog(count:number,oldestLagMs:number):void;
}
export interface InvalidationWorkerOptions {
  readonly workerId:string;readonly repository:DurableInvalidationRepository;readonly generations:GenerationStore;
  readonly listener?:InvalidationWakeListener;readonly metrics?:InvalidationMetrics;readonly pollIntervalMs?:number;
  readonly batchSize?:number;readonly leaseSeconds?:number;readonly maxAttempts?:number;readonly now?:()=>number;
}

export function createInvalidationWorker(options:InvalidationWorkerOptions){
  const pollIntervalMs=bounded(options.pollIntervalMs??5000,250,300000,"poll interval");
  const batchSize=bounded(options.batchSize??100,1,500,"batch size");
  const leaseSeconds=bounded(options.leaseSeconds??60,5,3600,"lease");
  const maxAttempts=bounded(options.maxAttempts??8,1,100,"max attempts");
  const now=options.now??Date.now;let timer:ReturnType<typeof setInterval>|undefined;let draining=false;let rerun=false;let closed=false;
  const drain=async():Promise<void>=>{
    if(closed)return;if(draining){rerun=true;return;}draining=true;
    try{do{rerun=false;let batch:readonly InvalidationMessage[];do{
      batch=await options.repository.claim({workerId:options.workerId,limit:batchSize,leaseSeconds});
      for(const message of batch)await processMessage(message);
    }while(batch.length===batchSize);}while(rerun);await recordBacklog();}
    finally{draining=false;}
  };
  const processMessage=async(message:InvalidationMessage):Promise<void>=>{
    try{
      validateMessage(message);
      const generation=await options.generations.incrementOnce({eventId:message.id,kind:message.kind,planeKey:message.planeKey,tenantId:message.tenantId,scopeKey:message.scopeKey});
      if(!await options.repository.complete(message.id,options.workerId,generation))throw new Error("INVALIDATION_LEASE_LOST");
      options.metrics?.processed(message.kind,Math.max(0,now()-Date.parse(message.createdAt)));
    }catch(error){
      const code=errorCode(error);const permanent=code.startsWith("INVALIDATION_PAYLOAD_");const deadLetter=permanent||message.attemptCount>=maxAttempts;
      await options.repository.fail({id:message.id,workerId:options.workerId,errorCode:code,retryAt:new Date(now()+retryDelay(message.attemptCount)).toISOString(),deadLetter,sanitizedPayload:sanitizePayload(message.payload)});
      options.metrics?.failed(message.kind,code,deadLetter);
    }
  };
  const recordBacklog=async()=>{const result=await options.repository.backlog();options.metrics?.backlog(result.pending,result.oldestCreatedAt?Math.max(0,now()-Date.parse(result.oldestCreatedAt)):0);};
  return {
    async start(){if(timer)return;closed=false;timer=setInterval(()=>void drain().catch(()=>undefined),pollIntervalMs);timer.unref();if(options.listener)await options.listener.start(()=>void drain().catch(()=>undefined),()=>options.metrics?.reconnect());await drain();},
    drain,
    async close(){closed=true;if(timer){clearInterval(timer);timer=undefined;}await options.listener?.close();},
  };
}

function validateMessage(value:InvalidationMessage):void{if(!/^[0-9a-f-]{36}$/i.test(value.id))throw new Error("INVALIDATION_PAYLOAD_ID");if(value.kind!=="metadata"&&value.kind!=="authorization")throw new Error("INVALIDATION_PAYLOAD_KIND");if(!["studio","neon","mesh"].includes(value.planeKey))throw new Error("INVALIDATION_PAYLOAD_PLANE");if(!/^[a-zA-Z0-9_.:-]{1,256}$/.test(value.scopeKey))throw new Error("INVALIDATION_PAYLOAD_SCOPE");if(!Number.isFinite(Date.parse(value.createdAt)))throw new Error("INVALIDATION_PAYLOAD_TIME");}
function sanitizePayload(payload:Readonly<Record<string,unknown>>):Readonly<Record<string,unknown>>{const blocked=/token|secret|password|authorization|cookie/i;const result:Record<string,unknown>={};for(const [key,value] of Object.entries(payload).slice(0,32)){if(blocked.test(key))continue;if(typeof value==="string")result[key]=value.slice(0,256);else if(typeof value==="number"||typeof value==="boolean"||value===null)result[key]=value;}const encoded=JSON.stringify(result);return encoded.length<=4096?Object.freeze(result):Object.freeze({truncated:true});}
function errorCode(error:unknown):string{const raw=error instanceof Error?error.message:String(error);const normalized=raw.toUpperCase().replace(/[^A-Z0-9_]+/g,"_").slice(0,96);return normalized||"INVALIDATION_PROCESSING_FAILED";}
function retryDelay(attempt:number):number{return Math.min(300000,1000*2**Math.min(Math.max(attempt-1,0),8));}
function bounded(value:number,min:number,max:number,name:string):number{if(!Number.isInteger(value)||value<min||value>max)throw new TypeError(`Invalid invalidation ${name}`);return value;}
