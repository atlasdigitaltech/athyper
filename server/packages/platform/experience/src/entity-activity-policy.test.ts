import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PinnedCompiledEntityReader } from "@athyper/server-platform-metadata";
import { capabilityArtifactMembers, prepareActivityCapabilityMember } from "@athyper/server-contract-publication";
import { createEntityActivityPolicy, createActivityServiceAuthorizer } from "./entity-activity-policy.js";

function fixture() {
  const profile = JSON.parse(readFileSync(new URL("../../../../../metadata/profiles/activity/standard.v1.json", import.meta.url), "utf8"));
  const entityCode = "example_reference";
  const member = prepareActivityCapabilityMember(entityCode, {schema:"athyper.entity-activity-source/1", profile:{code:profile.profileCode,version:1}}, () => profile,
    {versionHistoryAvailable:false,automaticCaptureAvailable:false,writableOperations:[]});
  const mapped = capabilityArtifactMembers(entityCode,[member]);
  const coordinate = {tenantId:"tenant",principalId:"actor",planeKey:"neon" as const,entityCode};
  const release = {coordinate,release:{releaseHash:"release-hash"}};
  const reader = {resolve:vi.fn(async()=>release),core:vi.fn(async()=>({content:{capabilities:mapped.capabilities}})),
    operation:vi.fn(async()=>({content:mapped.operationBindings,artifactHash:"operation-hash"}))};
  const authorizeParent = vi.fn(async()=>true);
  const authorizer = {authorize:vi.fn<Authorizer["authorize"]>(async ()=>({allowed:true}))};
  const policy = createEntityActivityPolicy({reader:reader as unknown as PinnedCompiledEntityReader,authorizer,authorizeParent});
  const input = {context:coordinate as unknown as VerifiedRequestContext,entityCode,recordId:"record",action:"audit_query"};
  return {mapped,release,reader,authorizeParent,authorizer,policy,input};
}
it("projects authorized views and sends exact canonical record-scoped permissions", async()=>{
  const f=fixture();
  f.authorizer.authorize.mockImplementation(async request=>request.permissionCode === "common.audit.event.query" ? {allowed:true} : {allowed:false,reason:"denied"});
  const result=await f.policy.resolve(f.input);
  expect(result.projection.views).toEqual(["auditLog"]);
  expect(result.projection.actions.map(a=>a.key)).toEqual(["audit_query"]);
  expect(result.policyHash).toBe("operation-hash");
  expect(f.authorizer.authorize).toHaveBeenCalledWith(expect.objectContaining({permissionCode:"common.audit.event.query",resource:expect.objectContaining({tenantId:"tenant",entityType:"example_reference",entityId:"record"})}));
  await expect(f.policy.resolve({...f.input,action:"snapshots_read"})).rejects.toMatchObject({statusCode:403});
});
it.each(["tenantId","principalId","planeKey","entityCode"] as const)("rejects an admitted release with mismatched %s",async key=>{
  const f=fixture();
  const release={...f.release,coordinate:{...f.release.coordinate,[key]:"other"}};
  await expect(f.policy.resolve(f.input,release as never)).rejects.toMatchObject({statusCode:403});
  expect(f.authorizeParent).not.toHaveBeenCalled();
});
it("denies parent access before reading operation policy or authorizing capability actions",async()=>{
  const f=fixture();f.authorizeParent.mockResolvedValue(false);
  await expect(f.policy.resolve(f.input)).rejects.toMatchObject({statusCode:403});
  expect(f.reader.operation).not.toHaveBeenCalled();expect(f.authorizer.authorize).not.toHaveBeenCalled();
});
it("requires capture permission and a command idempotency key without requiring a record edit",async()=>{
  const f=fixture(), input={...f.input,action:"snapshots_capture"};
  await expect(f.policy.resolve(input)).rejects.toMatchObject({statusCode:403});
  await expect(f.policy.resolve({...input,idempotencyKey:"capture-replay-key"})).resolves.toMatchObject({action:{permissionCode:"common.records.snapshot.capture"}});
  f.authorizer.authorize.mockResolvedValue({allowed:false,reason:"denied"});
  await expect(f.policy.resolve({...input,idempotencyKey:"capture-replay-key"})).rejects.toMatchObject({statusCode:403});
});
it("denies unsupported actions and disabled capability",async()=>{
  const f=fixture();
  await expect(f.policy.resolve({...f.input,action:"versions_read"})).rejects.toMatchObject({statusCode:403});
  f.reader.core.mockResolvedValue({content:{capabilities:{activity:{enabled:false} as never}}});
  await expect(f.policy.resolve(f.input)).rejects.toMatchObject({statusCode:403});
});
it("bridges only exact reviewed service aliases and preserves ordinary authorization",async()=>{
  const authorize=vi.fn(async()=>({allowed:false}));
  const underlying={authorize,enforcedEntityProfile:vi.fn(),checkSourceConstraints:vi.fn(async()=>false)} as unknown as Authorizer;
  const bridge=createActivityServiceAuthorizer(underlying);
  for (const [code,expected] of [["audit.event.query","common.audit.event.query"],["records.snapshot.read","common.records.snapshot.read"],["records.snapshot.capture","common.records.snapshot.capture"],["records.snapshot.delete","records.snapshot.delete"],["common.audit.event.query","common.audit.event.query"]]) {
    const request={permissionCode:code!,context:{} as VerifiedRequestContext,resource:{tenantId:"tenant"}};
    await expect(bridge.authorize(request)).resolves.toEqual({allowed:false});
    expect(authorize).toHaveBeenLastCalledWith({...request,permissionCode:expected});
  }
  expect(bridge.enforcedEntityProfile).toBeDefined();expect(bridge.checkSourceConstraints).toBeDefined();
});
