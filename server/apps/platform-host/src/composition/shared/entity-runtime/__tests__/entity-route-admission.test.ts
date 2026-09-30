import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { Kysely, PostgresDialect } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { readPublishedEntityRouteCandidates } from "../route-admission.js";
const context = { planeKey: "neon", tenantId: "00000000-0000-4000-8000-000000000001" } as VerifiedRequestContext;
it("emits only exact-plane descriptors matching an active release coordinate",async()=>{
  const query=vi.fn(async()=>({rows:[{entity_code:"example_dictionary",release_id:"release"}]}));
  const db=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:{connect:async()=>({query,release(){}}),end:async()=>{}} as never})});
  const descriptor={entityCode:"example_dictionary",releaseId:"release",planeKey:"neon",operations:{list:{permissionCode:"example.view"}}};
  const metadata={getEntityDescriptor:vi.fn().mockResolvedValue(descriptor)};
  try {
    const run=<T>(work:(db:Kysely<Record<string,never>>)=>Promise<T>)=>work(db);
    expect(await readPublishedEntityRouteCandidates(context,metadata,run)).toEqual([{entityCode:"example_dictionary",releaseId:"release",operations:{list:"example.view"}}]);
    const [sql,parameters]=query.mock.calls[0] as unknown as [string,unknown[]];
    expect(sql).toContain("a.status='active'");expect(sql).toContain("'runtime_contract'");expect(parameters).toContain(context.tenantId);
    for(const changed of [null,{...descriptor,planeKey:"mesh"},{...descriptor,releaseId:"old"},{...descriptor,entityCode:"other"}]) {
      metadata.getEntityDescriptor.mockResolvedValue(changed);
      expect(await readPublishedEntityRouteCandidates(context,metadata,run)).toEqual([]);
    }
  }finally{await db.destroy();}
});
it("enforces product-free import boundaries for route and format composition",()=>{
  for(const file of ["route-admission.ts","metadata-format-reader.ts"]) {
    const source=readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
    const allowed=new Set(["kysely","@athyper/server-contract-auth","@athyper/server-contract-metadata"]);
    for(const node of ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true).statements)
      if(ts.isImportDeclaration(node))expect(allowed.has((node.moduleSpecifier as ts.StringLiteral).text)).toBe(true);
    expect(source).not.toMatch(/country|currency|business_partner/);
  }
});
