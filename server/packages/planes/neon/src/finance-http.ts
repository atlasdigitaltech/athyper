import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { FinanceActor } from "@athyper/server-contract-finance";
import { HttpError, defineRouteContract, registerContractRoute, type Application, type RequestHandler, type Response } from "@athyper/server-runtime-http";
import type { FinanceEntryPoint, FinanceSlice, NeonFinanceRegistration } from "./register-finance.js";

type AsyncMethod=(...args:readonly unknown[])=>Promise<unknown>;
type Service=Readonly<Record<string,AsyncMethod>>;
const schema={type:"object",additionalProperties:true} as const;

export interface RegisterFinanceHttpOptions {readonly authenticate:RequestHandler;readonly readContext:(response:Response)=>VerifiedRequestContext;readonly finance:NeonFinanceRegistration;}

/** Binds every enabled finance route descriptor to its application service or durable worker boundary. */
export function registerFinanceHttpRoutes(application:Application,options:RegisterFinanceHttpOptions):void{
  for(const slice of Object.keys(options.finance.slices) as FinanceSlice[]){
    const registration=options.finance.slices[slice];if(!registration.enabled)continue;
    for(const point of registration.entryPoints.filter((entry):entry is FinanceEntryPoint&{kind:"route";method:"get"|"post";path:string;permission:string}=>entry.kind==="route"&&Boolean(entry.method&&entry.path&&entry.permission))){
      const contract=defineRouteContract({method:point.method,path:point.path,operationId:point.code,summary:summary(point.code),tags:["Finance",slice.toUpperCase()],authenticated:true,permission:point.permission,request:point.method==="get"?{query:schema}:{body:schema},responses:{200:{description:"Finance operation completed",body:schema},202:{description:"Finance operation durably queued",body:schema},400:{description:"Invalid finance request"},403:{description:"Forbidden"},404:{description:"Not found"},409:{description:"Conflict"},503:{description:"Finance dependency unavailable"}}});
      registerContractRoute(application,contract,options.authenticate,handler(async(request,response)=>{const context=options.readContext(response),actor=actorFrom(context),input=point.method==="get"?query(request.query):object(request.body);return dispatch(options.finance,slice,point.code,actor,input);}));
    }
  }
}

function handler(work:(request:{readonly body?:unknown;readonly query?:unknown},response:Response)=>Promise<{status?:number;body:unknown}>):RequestHandler{return async(request,response,next)=>{try{const result=await work(request,response);response.status(result.status??200).json(result.body);}catch(error){next(financeHttpError(error));}};}

async function dispatch(finance:NeonFinanceRegistration,slice:FinanceSlice,code:string,actor:FinanceActor,input:Record<string,unknown>):Promise<{status?:number;body:unknown}>{
  const services=finance.slices[slice].services;
  switch(code){
    case"finance.budget.command":case"finance.budget.reverse":return ok(await call(services,"budget","mutate",command(input,actor)));
    case"finance.budget.balance":return ok(await call(services,"balances","reconcile",actor,input));
    case"finance.budget.rebuild":return ok(await call(services,"balances","rebuild",actor,input));
    case"finance.planning.run":{const planning=service(services,"planningRuns"),run=record(input["run"]);if(run){const result=await planning["create"]!(actor,run),runId=required(run,"id"),jobId=await finance.enqueue("f2","finance.planning.execute",actor,runId,{actor,runId,outputs:Array.isArray(input["outputs"])?input["outputs"]:[]});return{status:202,body:{result,jobId}};}return ok(await planning["transition"]!(actor,required(input,"runId"),required(input,"expectedStatus"),required(input,"targetStatus"),optional(input,"errorMessage")));}
    case"finance.planning.output":return ok(await call(services,"planningOutputs","list",actor,input));
    case"finance.gl.post":return ok(await call(services,"gl","post",command(input,actor)));
    case"finance.gl.reconcile":return ok(await call(services,"reconciliation","reconcile",actor,input));
    case"finance.cross_book.execute":{const result=await call(services,"crossBook","schedule",command(input,actor));const id=resourceId(result);if(!id)return ok(result);const jobId=await finance.enqueue("f3","finance.cross_book.execute",actor,id,{actor,executionId:id});return{status:202,body:{result,jobId}};}
    case"finance.commitment.fulfill":case"finance.commitment.reverse":{const value=command(input,actor),jobId=await finance.enqueue("f3","finance.commitment.fulfill",actor,value.commandId,{actor,command:value});return{status:202,body:{commandId:value.commandId,jobId}};}
    case"finance.inventory.move":{const operation=required(input,"operation"),movement=service(services,"movements"),value=command(input,actor);if(!["receipt","issue","transfer"].includes(operation))throw new HttpError(400,"FINANCE_INVALID_OPERATION","Inventory operation must be receipt, issue, or transfer");return ok(await movement[operation]!(value));}
    case"finance.inventory.reverse":return ok(await call(services,"movements","reverse",command(input,actor)));
    case"finance.inventory.balance":return ok(await call(services,"queries","balance",actor,coordinate(input)));
    case"finance.inventory.rebuild":{const coordinate=record(input["coordinate"])??input,jobId=await finance.enqueue("f4","finance.inventory.value-fifo",actor,coordinateKey(coordinate),{actor,coordinate});return{status:202,body:{jobId}};}
    case"finance.tax.calculate":case"finance.tax.reverse":return ok(await call(services,"calculations","calculate",command(input,actor)));
    case"finance.tax.credit.move":return ok(await call(services,"credits","move",command(input,actor)));
    case"finance.tax.point-in-time":return ok(await call(services,"credits","balance",actor,coordinate(input),required(input,"asOf")));
    case"finance.tax.rebuild":return ok(await call(services,"credits","rebuild",actor,coordinate(input),required(input,"asOf")));
    case"finance.close.run":case"finance.close.reverse":case"finance.close.recover":{const kind=required(input,"kind"),value=command(record(input["command"])??input,actor),name=code==="finance.close.recover"?"finance.close.recover":closeJob(kind);const jobId=await finance.enqueue("f6",name,actor,value.commandId,{actor,kind,command:value});return{status:202,body:{commandId:value.commandId,jobId}};}
    case"finance.close.status":return ok(await call(services,"readiness","query",actor,input));
    default:throw unavailable(code,"Finance route is not bound");
  }
}

function command(input:Record<string,unknown>,actor:FinanceActor):Record<string,unknown>&{commandId:string;actor:FinanceActor}{const source=record(input["command"])??input;return{...source,commandId:required(source,"commandId"),actor,payload:record(source["payload"])??{}};}
function coordinate(input:Record<string,unknown>):Record<string,unknown>{return record(input["coordinate"])??input;}
function query(value:unknown):Record<string,unknown>{const result=object(value);for(const key of["fiscalYear","periodNumber","limit"]){if(typeof result[key]==="string"&&/^\d+$/.test(result[key]))result[key]=Number(result[key]);}return result;}
function actorFrom(context:VerifiedRequestContext):FinanceActor{if(context.planeKey!=="neon")throw new HttpError(400,"FINANCE_NEON_REQUIRED","Finance is available only on Neon");return{tenantId:context.tenantId,principalId:context.principalId,planeKey:"neon",correlationId:context.correlationId??context.requestId,permissionCodes:context.permissions.allowed};}
function service(services:Readonly<Record<string,unknown>>,name:string):Service{const value=services[name];if(!value||typeof value!=="object")throw unavailable(name,"Required finance service is unavailable");return value as Service;}
function call(services:Readonly<Record<string,unknown>>,name:string,method:string,...args:readonly unknown[]):Promise<unknown>{const target=service(services,name),fn=target[method];if(typeof fn!=="function")throw unavailable(`${name}.${method}`,"Required finance operation is unavailable");return fn.apply(target,[...args]);}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw new HttpError(400,"FINANCE_INVALID_REQUEST","JSON object required");return{...(value as Record<string,unknown>)};}
function record(value:unknown):Record<string,unknown>|undefined{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:undefined;}
function required(value:Record<string,unknown>,key:string):string{const result=value[key];if(typeof result!=="string"||!result.trim())throw new HttpError(400,"FINANCE_INVALID_REQUEST",`${key} is required`);return result.trim();}
function optional(value:Record<string,unknown>,key:string):string|undefined{const result=value[key];return typeof result==="string"&&result.trim()?result.trim():undefined;}
function ok(body:unknown){return{body};}function resourceId(value:unknown):string|undefined{return record(value)&&typeof record(value)!["resourceId"]==="string"?String(record(value)!["resourceId"]):undefined;}
function coordinateKey(value:Record<string,unknown>):string{return Object.keys(value).sort().map(key=>`${key}:${String(value[key])}`).join("|");}
function closeJob(kind:string):string{if(kind==="fx")return"finance.close.fx";if(kind==="intercompany")return"finance.close.intercompany";if(kind==="asset")return"finance.close.asset-revaluation";throw new HttpError(400,"FINANCE_INVALID_OPERATION","Close kind must be fx, intercompany, or asset");}
function unavailable(code:string,message:string):HttpError{return new HttpError(503,"FINANCE_ENTRY_POINT_UNAVAILABLE",`${message}: ${code}`);}function summary(code:string):string{return code.split(".").slice(1).join(" ").replaceAll("_"," ");}
function financeHttpError(error:unknown):unknown{const value=error as{code?:string;message?:string;details?:Readonly<Record<string,unknown>>};if(!value?.code?.startsWith("FINANCE_"))return error;if(error instanceof HttpError)return error;const status=value.code==="FINANCE_PERMISSION_DENIED"?403:value.code==="FINANCE_NOT_FOUND"?404:value.code.includes("CONFLICT")||value.code==="FINANCE_PERIOD_CLOSED"?409:400;return new HttpError(status,value.code,value.message??value.code,value.details);}
