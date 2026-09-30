import { describe,it,expect } from "vitest";
import { Kysely,DummyDriver,PostgresAdapter,PostgresQueryCompiler,PostgresIntrospector,type Transaction } from "kysely";
import { createKyselyAttachmentRepository } from "./kysely-attachment-repository.js";
import { AttachmentConflictError } from "./attachment-lifecycle.js";

describe("folder destination scope",()=>{
  it.each(["move","create"] as const)("rejects foreign record folders before %s mutates the workspace",async command=>{
    const queries:{sql:string;parameters:readonly unknown[]}[]=[];
    class Driver extends DummyDriver { override async acquireConnection(){return {executeQuery:async<R>(query:{sql:string;parameters:readonly unknown[]})=>{queries.push(query);return {rows:[] as R[]};},async *streamQuery<R>():AsyncGenerator<{rows:R[]}>{throw new Error("unused");}};} }
    const db=new Kysely<Record<string,never>>({dialect:{createDriver:()=>new Driver(),createAdapter:()=>new PostgresAdapter(),createQueryCompiler:()=>new PostgresQueryCompiler(),createIntrospector:db=>new PostgresIntrospector(db)}});
    const folderId="11111111-1111-4111-8111-111111111111",tenantId="22222222-2222-4222-8222-222222222222";
    const repo=createKyselyAttachmentRepository("fixture");
    await expect(repo.manageFolder!({planeKey:"neon",tenantId,principalId:tenantId,attachmentId:folderId},{command,folderId,entityType:"business_partner",entityId:"record-A",expectedRevision:1,...(command==="create"?{parentFolderId:folderId,name:"Nested"}:{attachmentId:folderId})},db as unknown as Transaction<Record<string,never>>)).rejects.toBeInstanceOf(AttachmentConflictError);
    expect(queries).toHaveLength(1);expect(queries[0]!.sql).toContain("entity_type=");expect(queries[0]!.sql).toContain("entity_id=");expect(queries[0]!.parameters).toEqual([tenantId,folderId,"business_partner","record-A"]);await db.destroy();
  });
});

describe("folder deletion with retained archive links",()=>{
  it.each([true,false])("clears archived placements and handles deletion success=%s",async success=>{
    const queries:{sql:string;parameters:readonly unknown[]}[]=[];
    class Driver extends DummyDriver { override async acquireConnection(){return {executeQuery:async<R>(query:{sql:string;parameters:readonly unknown[]})=>{
      queries.push(query);
      return {rows:(query.sql.includes("RETURNING revision_no")?[{revision_no:"2"}]:[]) as R[],numAffectedRows:query.sql.startsWith("DELETE")?(success?1n:0n):1n};
    },async *streamQuery<R>():AsyncGenerator<{rows:R[]}>{throw new Error("unused");}};} }
    const db=new Kysely<Record<string,never>>({dialect:{createDriver:()=>new Driver(),createAdapter:()=>new PostgresAdapter(),createQueryCompiler:()=>new PostgresQueryCompiler(),createIntrospector:db=>new PostgresIntrospector(db)}});
    const id="11111111-1111-4111-8111-111111111111";
    const result=createKyselyAttachmentRepository("fixture").manageFolder!({planeKey:"neon",tenantId:id,principalId:id,attachmentId:id},{command:"delete",folderId:id,entityType:"business_partner",entityId:"record",expectedRevision:1},db as unknown as Transaction<Record<string,never>>);
    if(success)expect(await result).toEqual({revision:2});
    else await expect(result).rejects.toBeInstanceOf(AttachmentConflictError);
    const release=queries.find(query=>query.sql.includes("SET folder_id=NULL"))!;
    expect(release.sql).toContain("attachment.status='deleted'");
    expect(release.sql).toContain("NOT attachment.is_active");
    expect(release.sql).toContain("coalesce(link.pinned_attachment_id,series.current_attachment_id)");
    expect(release.parameters).toContain("record");
    expect(queries.at(-1)!.sql).toContain("NOT EXISTS");
    await db.destroy();
  });
});

it("moves a file to Unfiled only within its tenant and record",async()=>{
  const queries:{sql:string;parameters:readonly unknown[]}[]=[];
  class Driver extends DummyDriver { override async acquireConnection(){return {executeQuery:async<R>(query:{sql:string;parameters:readonly unknown[]})=>{
    queries.push(query);return {rows:(query.sql.includes("RETURNING revision_no")?[{revision_no:"2"}]:[]) as R[],numAffectedRows:1n};
  },async *streamQuery<R>():AsyncGenerator<{rows:R[]}>{throw new Error("unused");}};} }
  const db=new Kysely<Record<string,never>>({dialect:{createDriver:()=>new Driver(),createAdapter:()=>new PostgresAdapter(),createQueryCompiler:()=>new PostgresQueryCompiler(),createIntrospector:db=>new PostgresIntrospector(db)}});
  const id="11111111-1111-4111-8111-111111111111";
  await expect(createKyselyAttachmentRepository("fixture").manageFolder!({planeKey:"neon",tenantId:id,principalId:id,attachmentId:id},{command:"move",folderId:null,attachmentId:id,entityType:"business_partner",entityId:"record-A",expectedRevision:1},db as unknown as Transaction<Record<string,never>>)).resolves.toEqual({revision:2});
  const update=queries.find(query=>query.sql.includes("UPDATE document.attachment_link"))!;
  expect(update.parameters[0]).toBeNull();
  expect(update.parameters).toContain("record-A");
  expect(update.sql).toContain("link.tenant_id=");
  expect(update.sql).toContain("link.entity_type=");
  expect(update.sql).toContain("link.entity_id=");
  expect(queries.some(query=>query.sql.startsWith("DELETE"))).toBe(false);
  await db.destroy();
});
