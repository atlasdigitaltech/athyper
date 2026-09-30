import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { ACTIVITY_ACTIONS, prepareActivityCapabilityMember } from "@athyper/server-contract-publication";
import { createCapabilityQualification, type CapabilityQualificationProviders } from "../capability-qualification.js";

function fixture(plane: "studio"|"neon"|"mesh") {
  const profile=JSON.parse(readFileSync(new URL("../../../../../../../../metadata/profiles/activity/standard.v1.json",import.meta.url),"utf8"));
  const entityCode="example_reference";
  const member=prepareActivityCapabilityMember(entityCode,{schema:"athyper.entity-activity-source/1",profile:{code:profile.profileCode,version:1}},()=>profile,
    {versionHistoryAvailable:false,automaticCaptureAvailable:false,writableOperations:[]});
  const target={targetPlane:plane,graph:{entity:{entityCode},capabilities:[member]}} as unknown as Parameters<ReturnType<typeof createCapabilityQualification>>[0];
  const query=vi.fn(async (_text:string)=>({rows:[{id:"present"}]}));
  const database=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:{connect:async()=>({query,release(){}}),end:async()=>{}} as never})});
  const providers: CapabilityQualificationProviders={parentRead:true,resourceHeader:true,section:()=>({read:vi.fn()}),
    activity:Object.fromEntries(Object.keys(ACTIVITY_ACTIONS).map(key=>[key,vi.fn()]))};
  const qualify=createCapabilityQualification({databases:{[plane]:database},providers:()=>providers});
  return {target,query,database,providers,qualify};
}
it.each(["studio","neon","mesh"] as const)("qualifies Activity catalog, RLS and capture function on %s without attachment infrastructure",async plane=>{
  const f=fixture(plane);
  try {
    await f.qualify(f.target);
    expect(f.query.mock.calls.filter(([text])=>text.includes("canonical_code=")).length).toBe(3);
    expect(f.query.mock.calls.filter(([text])=>text.includes("c.relrowsecurity")).length).toBe(4);
    expect(f.query.mock.calls.some(([text])=>text.includes("fn_capture_entity") && text.includes("has_function_privilege"))).toBe(true);
  } finally {await f.database.destroy();}
});
it.each(["section","audit_query","snapshots_read","snapshots_compare","snapshots_capture","catalog","rls","capture_function"])("fails closed without %s",async missing=>{
  const f=fixture("neon");
  if(missing==="section") f.providers.section=()=>undefined;
  else if(missing==="catalog" || missing==="rls" || missing==="capture_function") {
    const sqlMarker=missing==="catalog" ? "authz.permission" : missing==="rls" ? "pg_class" : "pg_proc";
    f.query.mockImplementation(async text=>({rows:text.includes(sqlMarker)?[]:[{id:"present"}]}));
  } else f.providers.activity![missing as keyof typeof ACTIVITY_ACTIONS]=undefined;
  try {await expect(f.qualify(f.target)).rejects.toThrow(/PUBLICATION_CAPABILITY_/);}
  finally {await f.database.destroy();}
});
it("recording requires an installed transactional writer and source ownership qualification",async()=>{
  const f=fixture("neon");
  const profile=JSON.parse(readFileSync(new URL("../../../../../../../../metadata/profiles/activity/recorded-root.v1.json",import.meta.url),"utf8"));
  const member=prepareActivityCapabilityMember("example_reference",{schema:"athyper.entity-activity-source/1",profile:{code:profile.profileCode,version:1},overrides:{views:["auditLog","versions"]}},()=>profile,{versionHistoryAvailable:true,automaticCaptureAvailable:true,writableOperations:["create","patch"]});
  const target={...f.target,graph:{...f.target.graph,capabilities:[member]}};
  try {
    await expect(f.qualify(target)).rejects.toThrow("WRITE_PROVIDER_REQUIRED");
    f.providers.recordHistory={prepare:vi.fn(),qualify:vi.fn(async()=>{throw Error("PUBLICATION_ACTIVITY_WRITE_OWNERSHIP_REQUIRED");})};
    await expect(f.qualify(target)).rejects.toThrow("WRITE_OWNERSHIP_REQUIRED");
    f.providers.recordHistory.qualify=vi.fn(async()=>{});
    await expect(f.qualify(target)).resolves.toBeUndefined();
    expect(f.query.mock.calls.some(([q])=>q.includes("record_version_immutable"))).toBe(true);
    expect(f.query.mock.calls.some(([q])=>q.includes("fn_capture_entity"))).toBe(true);
  } finally {await f.database.destroy();}
});
