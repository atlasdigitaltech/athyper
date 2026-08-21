import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { Application, NextFunction, Request, RequestHandler, Response } from "express";
import { defineRouteContract, registerContractRoute, type HttpMethod, type RouteContract } from "@athyper/server-runtime-http";
import type { RecordTransferService } from "./transfer-service.js";

const objectSchema = { type: "object", additionalProperties: true } as const;

export function registerRecordTransferRoutes(application:Application,options:{authenticate:RequestHandler;readContext:(response:Response)=>VerifiedRequestContext;transfers:RecordTransferService}):void{
  const route=(handler:(request:Request,context:VerifiedRequestContext)=>Promise<{status?:number;body?:unknown}>)=>async(request:Request,response:Response,next:NextFunction)=>{try{const result=await handler(request,options.readContext(response));response.status(result.status??200).json(result.body);}catch(error){next(error);}};
  registerContractRoute(application,contract("post","/api/records/:entityCode/imports","records.beginImport","records.import",201),options.authenticate,route(async(request,context)=>({status:201,body:await options.transfers.beginImport(context,param(request,"entityCode"),optionalUuid(body(request)["sessionId"]))})));
  registerContractRoute(application,contract("put","/api/records/imports/:sessionId/chunks/:chunkIndex","records.appendImportChunk","records.import",200,true),options.authenticate,route(async(request,context)=>({body:await options.transfers.appendImportChunk(context,uuidParam(request,"sessionId"),integerParam(request,"chunkIndex"),rows(body(request)["rows"]))})));
  registerContractRoute(application,contract("post","/api/records/imports/:sessionId/complete","records.completeImportUpload","records.import",200,true),options.authenticate,route(async(request,context)=>({body:await options.transfers.completeImportUpload(context,uuidParam(request,"sessionId"),integer(body(request)["expectedChunkCount"],"expectedChunkCount"))})));
  registerContractRoute(application,contract("post","/api/records/imports/:sessionId/validate","records.validateImport","records.import"),options.authenticate,route(async(request,context)=>({body:await options.transfers.validate(context,uuidParam(request,"sessionId"))})));
  registerContractRoute(application,contract("post","/api/records/imports/:sessionId/preview","records.previewImport","records.import"),options.authenticate,route(async(request,context)=>({body:await options.transfers.preview(context,uuidParam(request,"sessionId"))})));
  registerContractRoute(application,contract("post","/api/records/imports/:sessionId/commit","records.commitImport","records.import",202),options.authenticate,route(async(request,context)=>({status:202,body:await options.transfers.commit(context,uuidParam(request,"sessionId"))})));
  registerContractRoute(application,contract("post","/api/records/imports/:sessionId/cancel","records.cancelImport","records.import"),options.authenticate,route(async(request,context)=>({body:await options.transfers.cancelImport(context,uuidParam(request,"sessionId"))})));
  registerContractRoute(application,contract("get","/api/records/imports/:sessionId/error-report","records.getImportErrorReport","records.import"),options.authenticate,route(async(request,context)=>({body:await options.transfers.downloadErrorReport(context,uuidParam(request,"sessionId"),optionalInteger(request.query["expirySeconds"]))})));
  registerContractRoute(application,contract("get","/api/records/imports/:sessionId","records.getImport","records.import"),options.authenticate,route(async(request,context)=>({body:await options.transfers.getImport(context,uuidParam(request,"sessionId"))})));
  registerContractRoute(application,contract("post","/api/records/:entityCode/exports","records.requestExport","records.export",202,true),options.authenticate,route(async(request,context)=>({status:202,body:await options.transfers.requestExport(context,param(request,"entityCode"),record(body(request)["filter"]),optionalUuid(body(request)["requestId"]))})));
  registerContractRoute(application,contract("post","/api/records/exports/:exportRequestId/cancel","records.cancelExport","records.export"),options.authenticate,route(async(request,context)=>({body:await options.transfers.cancelExport(context,uuidParam(request,"exportRequestId"))})));
  registerContractRoute(application,contract("get","/api/records/exports/:exportRequestId/download","records.downloadExport","records.export"),options.authenticate,route(async(request,context)=>({body:await options.transfers.downloadExport(context,uuidParam(request,"exportRequestId"),optionalInteger(request.query["expirySeconds"]))})));
}

function contract(method:HttpMethod,path:string,operationId:string,permission:string,successStatus=200,requestBody=false):RouteContract{return defineRouteContract({method,path,operationId,summary:operationId,tags:["Records Transfer"],authenticated:true,permission,...(requestBody?{request:{body:objectSchema}}:{}),responses:{[successStatus]:{description:"Record transfer result",body:objectSchema},400:{description:"Invalid transfer request"},403:{description:"Forbidden"},404:{description:"Transfer not found"},409:{description:"Transfer state conflict"}}});}

function body(request:Request):Record<string,unknown>{return request.body&&typeof request.body==="object"&&!Array.isArray(request.body)?request.body as Record<string,unknown>:{};}
function param(request:Request,key:string):string{const value=request.params[key];if(typeof value!=="string"||!value.trim())throw bad(`Missing ${key}`);return value;}
function uuidParam(request:Request,key:string):string{return uuid(param(request,key),key);}
function optionalUuid(value:unknown):string|undefined{return value===undefined?undefined:uuid(value,"id");}
function uuid(value:unknown,key:string):string{if(typeof value!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw bad(`${key} must be a UUID`);return value;}
function integerParam(request:Request,key:string):number{return integer(Number(param(request,key)),key);}
function integer(value:unknown,key:string):number{if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0)throw bad(`${key} must be a non-negative integer`);return value;}
function optionalInteger(value:unknown):number|undefined{if(value===undefined)return undefined;const parsed=Number(Array.isArray(value)?value[0]:value);return integer(parsed,"expirySeconds");}
function rows(value:unknown):readonly Readonly<Record<string,unknown>>[]{if(!Array.isArray(value)||!value.length||value.some(item=>!item||typeof item!=="object"||Array.isArray(item)))throw bad("rows must be a non-empty array of objects");return value as readonly Readonly<Record<string,unknown>>[];}
function record(value:unknown):Readonly<Record<string,unknown>>{if(value===undefined)return{};if(!value||typeof value!=="object"||Array.isArray(value))throw bad("filter must be an object");return value as Readonly<Record<string,unknown>>;}
function bad(message:string){return Object.assign(new TypeError(message),{status:400,code:"INVALID_RECORD_TRANSFER_REQUEST"});}
