import { expect, it } from "vitest";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { parseEntityFormPresentation } from "@athyper/contract-platform-entity-runtime";
import { createEntityListService } from "./entity-list-service.js";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";
import { createRecordListExecutor } from "./query-service.js";

const component = {rendererKey:"platform.address.fields.v1",bindings:{city:"city",postalCode:"postal_code"}};
const mode = {sections:[{key:"address",label:"Address",fields:["city","postal_code"],component}],submitLabel:"Save address"};
const descriptor: EntityRuntimeDescriptor = {
  schema:"athyper.entity-runtime-descriptor/1.0",entityCode:"example_address",planeKey:"neon",releaseId:"release",releaseNo:1,contractHash:"a".repeat(64),compiledHash:"b".repeat(64),
  storage:{schema:"master",object:"example_address",idField:"id",tenantField:"tenant_id"},
  fields:[{key:"city",storagePath:"city",type:"string",required:false,writableOn:["create","patch"]},{key:"postal_code",storagePath:"postal_code",type:"string",required:false,writableOn:["create","patch"],readPermissionCode:"address.postal.read",writePermissionCode:"address.postal.write"}],
  operations:{read:{code:"read",permissionCode:"address.read"},create:{code:"create",permissionCode:"address.create"}},
  formPresentation:parseEntityFormPresentation({schemaVersion:1,create:mode,edit:mode},["city","postal_code"]),
};
const context = {planeKey:"neon",tenantId:"tenant",principalId:"user",permissions:{entries:[],allowed:[]}} as unknown as VerifiedRequestContext;
function service(postal: boolean) {
  const authorizer: Authorizer = {authorize:async request=> !request.permissionCode.startsWith("address.postal.") || postal ? {allowed:true} : {allowed:false,reason:"test field denied"}};
  const metadata = {getEntityDescriptor:async()=>descriptor};
  const persistence = createInMemoryRecordPersistence();
  return createEntityListService({metadata,authorizer,listExecutor:createRecordListExecutor({metadata,authorizer,repository:persistence.repository,transactions:persistence.transactions})});
}
it("carries the registered section only when all declared fields are authorized", async()=>{
  const form=await service(true).formDescriptor(context,"example_address","create");
  expect(form.sections![0]!.component).toEqual(component);
});
it("prunes denied fields and component mappings from the actual form response", async()=>{
  const form=await service(false).formDescriptor(context,"example_address","create");
  expect(form.sections![0]!.fields).toEqual(["city"]);
  expect(form.sections![0]!.component).toBeUndefined();
  expect(JSON.stringify(form)).not.toContain("postal_code");
});
