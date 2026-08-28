import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import { descriptorFor } from "../query-service.js";
import { mergeFieldViolations, validateFieldWriteAuthorization, validateRecordInput } from "../field-validation.js";
import type { ImportErrorReportStore, ImportRowValidator } from "./transfer-service.js";
import type { RecordExportArtifactStore } from "./transfer-jobs.js";

export function createMetadataImportRowValidator(metadata:MetadataReader,authorizer:Authorizer):ImportRowValidator{return{async validate(context:VerifiedRequestContext,entityCode,row,rowNumber,requestedOperation){const operation=requestedOperation??"create",descriptor=await descriptorFor(metadata,context,entityCode);if(descriptor.listPresentation?.dataOperations?.draftOnly)return{rowNumber,valid:true,errors:[]};const identity=descriptor.listPresentation?.identityField??descriptor.fields.find(field=>field.storagePath===descriptor.storage.idField)?.key,mutationRow=operation==="create"?row:Object.fromEntries(Object.entries(row).filter(([key])=>key!==identity)),missingIdentity=operation!=="create"&&(!identity||row[identity]===undefined||row[identity]===null||row[identity]==="")?{[identity??"identity"]:[{code:"IMPORT_IDENTITY_REQUIRED",message:"The entity identity field is required for update and upsert"}]}:{};const violations=mergeFieldViolations(validateRecordInput(descriptor,operation==="create"?"create":"patch",mutationRow),await validateFieldWriteAuthorization(authorizer,context,descriptor,mutationRow),missingIdentity);const errors=Object.entries(violations).flatMap(([field,items])=>items.map(item=>`${item.code}:${field}:${item.message}`));return{rowNumber,valid:errors.length===0,errors};}};}

export function createObjectStorageRecordTransferArtifactStore(storage:ObjectStorage,input:{maxBytes?:number;downloadTtlSeconds?:number}={}):RecordExportArtifactStore{
  const maxBytes=input.maxBytes??256*1024*1024,ttl=input.downloadTtlSeconds??300;
  const write=async(key:string,content:AsyncIterable<Uint8Array>,contentType:string)=>{if(storage.putStream){await storage.putStream(key,content,{contentType});return key;}const chunks:Uint8Array[]=[];let size=0;for await(const chunk of content){size+=chunk.byteLength;if(size>maxBytes)throw new Error(`Record transfer artifact exceeds ${maxBytes} bytes`);chunks.push(chunk);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}await storage.put(key,bytes,{contentType});return key;};
  return{
    write:({tenantId,sessionId,content,contentType})=>write(`record-transfers/${tenantId}/imports/${sessionId}/errors.ndjson`,content,contentType),
    writeExport:({tenantId,exportRequestId,content,contentType,extension})=>write(`record-transfers/${tenantId}/exports/${exportRequestId}/records.${extension}`,content,contentType),
    createDownloadUrl:(key,expirySeconds)=>storage.createDownloadUrl(key,Math.min(expirySeconds,ttl)),
  };
}
