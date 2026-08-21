import type {VerifiedRequestContext} from "@athyper/server-contract-auth";

export interface SearchDocument {
  readonly id:string; readonly planeKey:string; readonly tenantId:string; readonly attachmentId:string;
  readonly resourceType?:"attachment"|"content_item"; readonly resourceId?:string;
  readonly entityType:string; readonly entityId:string; readonly title:string; readonly text:string;
  readonly contentType:string; readonly fileName:string; readonly piiTypes:readonly string[]; readonly updatedAt:string;
}
export interface SearchQuery { readonly planeKey:string; readonly tenantId:string; readonly text:string; readonly entityTypes?:readonly string[]; readonly resourceTypes?:readonly("attachment"|"content_item")[]; readonly limit:number; readonly offset:number; }
export interface SearchHit { readonly attachmentId:string; readonly resourceType?:"attachment"|"content_item";readonly resourceId?:string;readonly entityType:string; readonly entityId:string; readonly title:string; readonly snippet?:string; readonly contentType:string; readonly fileName:string; readonly updatedAt:string; }
export interface SearchResult { readonly hits:readonly SearchHit[]; readonly total:number; readonly processingMs:number; }
export interface SearchIndex {
  upsert(document:SearchDocument):Promise<void>;
  remove(documentId:string):Promise<void>;
  search(query:SearchQuery):Promise<SearchResult>;
}
export interface SearchDocumentsCommand { readonly context:VerifiedRequestContext; readonly text:string; readonly entityTypes?:readonly string[]; readonly page?:number; readonly pageSize?:number; }
export interface DocumentSearchService { search(command:SearchDocumentsCommand):Promise<SearchResult & {readonly page:number;readonly pageSize:number}>; }
