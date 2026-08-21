import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import { descriptorFor } from "../query-service.js";
import { mergeFieldViolations, validateFieldWriteAuthorization, validateRecordInput } from "../field-validation.js";
import type { ImportErrorReportStore, ImportRowValidator } from "./transfer-service.js";
import type { RecordExportArtifactStore } from "./transfer-jobs.js";

export function createMetadataImportRowValidator(metadata:MetadataReader,authorizer:Authorizer):ImportRowValidator{return{async validate(context:VerifiedRequestContext,entityCode,row,rowNumber){const descriptor=await descriptorFor(metadata,context,entityCode);const violations=mergeFieldViolations(validateRecordInput(descriptor,"create",row),await validateFieldWriteAuthorization(authorizer,context,descriptor,row));const errors=Object.entries(violations).flatMap(([field,items])=>items.map(item=>`${item.code}:${field}:${item.message}`));return{rowNumber,valid:errors.length===0,errors};}};}

export function createObjectStorageRecordTransferArtifactStore(storage:ObjectStorage,input:{maxBytes?:number;downloadTtlSeconds?:number}={}):RecordExportArtifactStore{
  const maxBytes=input.maxBytes??256*1024*1024,ttl=input.downloadTtlSeconds??300;
  const write=async(key:string,content:AsyncIterable<Uint8Array>)=>{if(storage.putStream){await storage.putStream(key,content,{contentType:"application/x-ndjson"});return key;}const chunks:Uint8Array[]=[];let size=0;for await(const chunk of content){size+=chunk.byteLength;if(size>maxBytes)throw new Error(`Record transfer artifact exceeds ${maxBytes} bytes`);chunks.push(chunk);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}await storage.put(key,bytes,{contentType:"application/x-ndjson"});return key;};
  return{
    write:({tenantId,sessionId,content})=>write(`record-transfers/${tenantId}/imports/${sessionId}/errors.ndjson`,content),
    writeExport:({tenantId,exportRequestId,content})=>write(`record-transfers/${tenantId}/exports/${exportRequestId}/records.ndjson`,content),
    createDownloadUrl:(key,expirySeconds)=>storage.createDownloadUrl(key,Math.min(expirySeconds,ttl)),
  };
}
