import { describe, expect, it, vi } from "vitest";
import { Kysely, DummyDriver, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type Transaction } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createAttachmentDiscoveryService } from "./attachment-discovery-routes.js";
const id="11111111-1111-4111-8111-111111111111";
const context={planeKey:"neon",tenantId:id,principalId:id} as VerifiedRequestContext;
function fixture(rows: Record<string, unknown>[], allowed=true, commentId?:string) {
  const queries: {sql:string;parameters:readonly unknown[]}[]=[];
  class Driver extends DummyDriver {
    override async acquireConnection() {return {
      executeQuery: async <R>(query: {sql:string;parameters:readonly unknown[]}) => {queries.push(query);return {rows:(query.sql.startsWith("SET") ? [] : rows) as R[]};},
      async *streamQuery<R>(): AsyncGenerator<{rows:R[]}> {throw new Error("unused");},
    };}
  }
  const db=new Kysely<Record<string,never>>({dialect:{createDriver:()=>new Driver(),createAdapter:()=>new PostgresAdapter(),createQueryCompiler:()=>new PostgresQueryCompiler(),createIntrospector:db=>new PostgresIntrospector(db)}});
  const authorizeCapability=vi.fn(async (_context:unknown,action:string,input:Record<string,unknown>)=>{
    if(!allowed || (action==="download" && input.attachmentId==="denied"))throw Object.assign(new Error("denied"),{code:"ENTITY_CAPABILITY_DENIED"});
    return {entityType:"business_partner",entityId:"record",...(commentId ? {commentId}:{}),admittedReleaseHash:"r",admittedPolicyHash:"p"};
  });
  const sign=vi.fn(async()=>"https://isolated.example/short-lived"),schedule=vi.fn();
  const service=createAttachmentDiscoveryService({authorizeCapability,transactions:{run:async(_plane,_actor,work)=>work(db as unknown as Transaction<Record<string,never>>)},storage:{createDownloadUrl:sign,createUploadUrl:async()=>"",put:vi.fn(),get:async()=>new Uint8Array(),delete:vi.fn(),exists:async()=>true,copy:vi.fn()},schedule});
  return {service,sign,schedule,queries,authorizeCapability};
}
describe("qualified attachment discovery",()=>{
  it("deduplicates before cursor pagination and resolves attribution after the bounded page",async()=>{
    const f=fixture([]);
    await f.service.browse(context,{entityType:"business_partner",entityId:"record",after:id});
    const query=f.queries[0]!.sql;
    const page=query.indexOf("page AS MATERIALIZED");
    expect(query.indexOf("SELECT DISTINCT ON")).toBeLessThan(page);
    expect(query.indexOf("WHERE (created_at,id::uuid)")).toBeGreaterThan(page);
    expect(query.indexOf("collaboration_principal_candidates")).toBeGreaterThan(query.indexOf("LIMIT 51"));
    expect(query).toContain("v.tenant_id=");
    expect(query).toContain("v.series_id=page.series_id::uuid");
    expect(query).toContain("ORDER BY created_at DESC,id::uuid DESC");
  });
  it("denies before querying or signing",async()=>{
    const f=fixture([],false);await expect(f.service.preview(context,{attachmentId:id})).rejects.toThrow("denied");expect(f.queries).toHaveLength(0);expect(f.sign).not.toHaveBeenCalled();
  });
  it.each(["pending","quarantined",null])("does not expose an unclean derivative (%s)",async scan_status=>{
    const f=fixture([{id,content_type:"application/pdf",derivative_content_type:"application/pdf",status:"ready",scan_status,storage_key:"private",size_bytes:10,sha256:"hash"}]);
    const result=await f.service.preview(context,{attachmentId:id,rendition:"preview_default"});expect(result.state).not.toBe("ready");expect(f.sign).not.toHaveBeenCalled();
  });
  it("signs only the clean bound rendition with safe inline delivery",async()=>{
    const f=fixture([{id,content_type:"application/pdf",derivative_content_type:"application/pdf",status:"ready",scan_status:"clean",storage_key:"private",size_bytes:10,sha256:"hash"}]);
    expect(await f.service.preview(context,{attachmentId:id,rendition:"preview_default"})).toMatchObject({state:"ready",contentType:"application/pdf"});
    expect(f.sign).toHaveBeenCalledWith("private",120,{contentType:"application/pdf",contentDisposition:'inline; filename="preview.pdf"'});
    expect(f.queries[0]!.parameters).toContain("record");expect(f.queries[0]!.sql).toContain("d.source_sha256=a.sha256");
  });
  it("binds comment previews to the admitted comment, parent and pinned version",async()=>{
    const commentId="22222222-2222-4222-8222-222222222222";
    const f=fixture([{id,content_type:"image/png",derivative_content_type:"image/webp",status:"ready",scan_status:"clean",storage_key:"private",size_bytes:10,sha256:"hash"}],true,commentId);
    expect(await f.service.preview(context,{attachmentId:id,rendition:"thumbnail_sm"})).toMatchObject({state:"ready"});
    expect(f.queries[0]!.parameters).toContain(commentId);
    expect(f.queries[0]!.sql).toContain("c.status<>'deleted'");
    expect(f.queries[0]!.sql).toContain("l.pinned_attachment_id=a.id");
    const absent=fixture([],true,commentId);
    await expect(absent.service.preview(context,{attachmentId:id})).rejects.toThrow("PREVIEW_NOT_AVAILABLE");
    expect(absent.sign).not.toHaveBeenCalled();
  });
  it("retries a pre-comment missing-source failure only after admission and link lookup",async()=>{
    const f=fixture([{id,sha256:"hash",content_type:"image/png",status:"failed",last_error_code:"source_not_found"}],true,"comment");
    expect(await f.service.preview(context,{attachmentId:id})).toMatchObject({state:"processing"});
    expect(f.schedule).toHaveBeenCalledWith(expect.objectContaining({rebuild:{mode:"failed",reason:"Comment attachment is now linked",requestId:"comment-linked-comment"}}));
    const blocked=fixture([{id,sha256:"hash",content_type:"image/png",status:"quarantined",last_error_code:"source_not_found"}],true,"comment");
    expect(await blocked.service.preview(context,{attachmentId:id})).toMatchObject({state:"unavailable"});expect(blocked.schedule).not.toHaveBeenCalled();
  });
  it("returns truthful unsupported fallback without scheduling Office",async()=>{
    const f=fixture([{id,content_type:"application/msword"}]);expect(await f.service.preview(context,{attachmentId:id})).toMatchObject({state:"unsupported"});expect(f.schedule).not.toHaveBeenCalled();
  });
  it("bounds record search and omits snippets denied at download admission",async()=>{
    const f=fixture(Array.from({length:26},(_,i)=>({id:i===0?"denied":`item-${i}`,file_name:"fixture",content_type:"text/plain",extracted_text:"match"})));
    const result=await f.service.search(context,{entityType:"business_partner",entityId:"record",q:"match"});
    expect(result.hits).toHaveLength(24);expect(result.nextCursor).toBe("item-24");expect(result.hits.some(hit=>hit.attachmentId==="denied")).toBe(false);
    expect(f.queries[1]!.parameters).toContain("record");expect(f.queries[1]!.sql).toContain("LIMIT 26");
  });
  it("rejects malformed cursors before storage access",async()=>{
    const f=fixture([]);await expect(f.service.search(context,{entityType:"business_partner",entityId:"record",q:"x",after:"bad"})).rejects.toThrow("INVALID_SEARCH_INPUT");expect(f.queries).toHaveLength(0);
  });
});

describe("content search filters",()=>{
  it("orders DISTINCT results by the selected UUID expression and keeps UUID cursor comparisons",async()=>{
    const f=fixture([]);
    await f.service.search(context,{entityType:"reference_record",entityId:"record",q:"marker",after:id});
    const query=f.queries.find(query=>query.sql.includes("SELECT DISTINCT"))!;
    expect(query.sql).toContain("SELECT DISTINCT a.id,a.file_name");
    expect(query.sql).not.toContain("a.id::text");
    expect(query.sql).toMatch(/AND a\.id>\$\d+::uuid/);
    expect(query.sql).toContain("ORDER BY a.id LIMIT 26");
    expect(query.sql).toContain("a.is_virus_scanned");
    expect(query.parameters).toContain(context.tenantId);
  });
  it("applies folder and category in SQL before pagination",async()=>{
    const f=fixture([]);
    await f.service.search(context,{entityType:"business_partner",entityId:"record",q:"invoice",folderId:id,category:"evidence",after:id});
    const query=f.queries.find(query=>query.sql.includes("SELECT DISTINCT"))!;
    expect(query.sql).toContain("l.folder_id=");
    expect(query.sql).toContain("l.metadata->>'category'");
    expect(query.parameters).toContain("evidence");
    expect(query.sql.indexOf("l.folder_id=")).toBeLessThan(query.sql.indexOf("LIMIT 26"));
    expect(query.parameters).toContain("record");
  });
  it("supports unfiled and rejects ambiguous filters",async()=>{
    const f=fixture([]);
    await f.service.search(context,{entityType:"business_partner",entityId:"record",q:"invoice",unfiled:true});
    expect(f.queries[1]!.sql).toContain("l.folder_id IS NULL");
    await expect(f.service.search(context,{entityType:"business_partner",entityId:"record",q:"invoice",folderId:id,unfiled:true})).rejects.toThrow();
    await expect(f.service.search(context,{entityType:"business_partner",entityId:"record",q:"invoice",category:"invalid"})).rejects.toThrow();
  });
});

describe("record attachment browsing",()=>{
  it("resolves a file outside the loaded page using record-bound preview admission",async()=>{
    const f=fixture([{id,series_id:id,link_id:id,pinned_attachment_id:id,link_kind:"record",folder_id:null,folder_name:null,category:null,version_no:2,file_name:"proof.pdf",added_by_display_name:"Record Contributor",added_at:"2026-01-01T00:00:00.000Z",display_name:null,content_type:"application/pdf",size_bytes:10,status:"active",created_at:"2026-01-01T00:00:00.000Z",series_revision:"2",version_history:[{id,version:2,fileName:"proof.pdf",status:"active"}]}]);
    const result=await f.service.browse(context,{entityType:"business_partner",entityId:"record",attachmentId:id});
    expect(f.authorizeCapability).toHaveBeenCalledExactlyOnceWith(context,"preview",{entityType:"business_partner",entityId:"record",attachmentId:id});
    expect(result.items[0]).toMatchObject({pinnedAttachmentId:id,addedByDisplayName:"Record Contributor",addedAt:"2026-01-01T00:00:00.000Z"});
    expect(result.items[0]).not.toHaveProperty("versionHistory");
    expect(f.queries[0]!.sql).toContain("AND a.id=");
    expect(f.queries[0]!.parameters).toContain("record");
  });
  it("rejects a linked-file lookup admitted for a different record before reading",async()=>{
    const f=fixture([]);
    await expect(f.service.browse(context,{entityType:"business_partner",entityId:"other-record",attachmentId:id})).rejects.toThrow("ENTITY_CAPABILITY_DENIED");
    expect(f.queries).toHaveLength(0);
  });
  it("keeps history and pin metadata in filtered results",async()=>{
    const f=fixture([{id,series_id:id,link_id:id,pinned_attachment_id:id,link_kind:"record",category:"evidence",version_no:2,file_name:"proof.pdf",size_bytes:10,status:"active",created_at:"2026-01-01T00:00:00.000Z",series_revision:"2",version_history:[{id,version:1,status:"active",fileName:"old.pdf"}]}]);
    const result=await f.service.browse(context,{entityType:"business_partner",entityId:"record",attachmentId:id,includeHistory:true});
    expect(f.authorizeCapability).toHaveBeenCalledWith(context,"version",expect.objectContaining({attachmentId:id,entityId:"record"}));
    expect(result.items[0]).toMatchObject({pinnedAttachmentId:id,versionHistory:[{fileName:"old.pdf"}]});
    expect(f.queries[0]!.sql).toContain("v.uploaded_by=");
  });
  it("returns the implicit general category for legacy links",async()=>{
    const f=fixture([{id,series_id:id,link_id:id,folder_id:null,folder_name:null,category:null,version_no:1,file_name:"invoice.pdf",display_name:null,content_type:"application/pdf",size_bytes:10,status:"active",created_at:"2026-01-01T00:00:00.000Z",series_revision:"1"}]);
    const result=await f.service.browse(context,{entityType:"business_partner",entityId:"record",category:"general"});
    expect(result.items).toEqual([expect.objectContaining({id,category:"general"})]);
  });
  it("applies exact-name, folder, and category filters before pagination",async()=>{
    const f=fixture([]);
    await f.service.browse(context,{entityType:"business_partner",entityId:"record",name:"invoice.pdf",exactName:true,folderId:id,category:"evidence",after:id});
    const query=f.queries[0]!;
    expect(query.sql).toContain("lower(a.file_name)=lower(");
    expect(query.sql).toContain("l.folder_id=");
    expect(query.sql).toContain("l.metadata->>'category'");
    expect(query.sql.indexOf("l.folder_id=")).toBeLessThan(query.sql.indexOf("LIMIT 51"));
    expect(query.parameters).toContain("invoice.pdf");
    expect(query.parameters).toContain("record");
  });
  it("rejects unsupported browse filters before querying",async()=>{
    const f=fixture([]);
    await expect(f.service.browse(context,{entityType:"business_partner",entityId:"record",exactName:true})).rejects.toThrow("INVALID_BROWSE_INPUT");
    expect(f.queries).toHaveLength(0);
  });
});
