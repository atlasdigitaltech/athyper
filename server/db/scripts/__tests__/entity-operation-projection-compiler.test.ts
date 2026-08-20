import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { buildCanonicalCatalogV2 } from "../seed/canonical-catalog-v2-model.js";
import { compileEntityOperationProjection, type MetadataReleaseProjectionSource } from "../seed/entity-operation-projection-compiler.js";
import { buildExactScopeCompatibility } from "../seed/exact-scope-compatibility-model.js";

const operationId="11111111-1111-5111-8111-111111111111";
const code="neon.relationship.business_partner.create";
function release(permissionCode=code):MetadataReleaseProjectionSource{return{
  contractVersion:"athyper.metadata.entity-operation-release.v1",targetPlane:"neon",
  source:{tenantId:null,entityId:"22222222-2222-5222-8222-222222222222",entityCode:"business_partner",releaseId:"33333333-3333-5333-8333-333333333333",releaseHash:"a".repeat(64),compiledHash:"b".repeat(64)},
  operations:[{id:operationId,operationKey:"create",status:"active"}],
  operationPermissions:[{entityOperationId:operationId,targetPlane:"neon",permissionCode,permissionKind:"entity_operation",status:"active"}],
  operationScopeBindings:[
    {entityOperationId:operationId,targetPlane:"neon",decisionMode:"entity_resource",scopeKind:"tenant",coordinateSource:"tenant_context",coordinateKey:null,resolverKey:null,missingValueBehavior:"deny",status:"active"},
    {entityOperationId:operationId,targetPlane:"neon",decisionMode:"entity_resource",scopeKind:"legal_entity",coordinateSource:"request_field",coordinateKey:"legal_entity_id",resolverKey:null,missingValueBehavior:"deny",status:"active"},
    {entityOperationId:operationId,targetPlane:"neon",decisionMode:"entity_resource",scopeKind:"operating_organization",coordinateSource:"request_field",coordinateKey:"operating_organization_id",resolverKey:null,missingValueBehavior:"deny",status:"active"},
  ],
};}
function dependencies(){const built=buildCanonicalCatalogV2({plane:"neon",permissions:[{canonicalCode:code,permissionKind:"entity_operation",riskTier:"medium",requiresMfa:false}]});return{catalog:built.catalog,scopeCompatibility:buildExactScopeCompatibility({plane:"neon",permissionCodes:[code]})};}

test("generates one global binding and exact scope-coordinate children",()=>{const projection=compileEntityOperationProjection({release:release(),...dependencies()});assert.equal(projection.globalEntityOperationBindings.length,1);assert.equal(projection.globalEntityOperationBindings[0]?.tenantId,null);assert.equal(projection.globalEntityOperationBindings[0]?.permissionId,dependencies().catalog.permissions[0]?.permissionId);assert.equal(projection.exactScopeCoordinateChildren.length,3);assert.equal(projection.operation_scope_bindings.length,3);assert.equal(new Set(projection.operation_scope_bindings.map(item=>item.bindingId)).size,1);assert.equal(new Set(projection.operation_scope_bindings.map(item=>item.scopeBindingId)).size,3);});
test("requires exactly one permission per entity operation",()=>{const source=release();source.operationPermissions=[...source.operationPermissions,{...source.operationPermissions[0]!}];assert.throws(()=>compileEntityOperationProjection({release:source,...dependencies()}),/exactly one canonical permission/);});
test("rejects non-canonical and generic action permissions",()=>{const deps=dependencies();assert.throws(()=>compileEntityOperationProjection({release:release("relationship.business_partner.create"),...deps}),/non-canonical permission binding rejected/);assert.throws(()=>compileEntityOperationProjection({release:release("neon.action.business_partner.create"),...deps}),/non-canonical permission binding rejected/);});
test("rejects incomplete scope-coordinate children",()=>{const source=release();source.operationScopeBindings=source.operationScopeBindings.slice(0,1);assert.throws(()=>compileEntityOperationProjection({release:source,...dependencies()}),/does not exactly match permission compatibility/);});
test("rejects tenant-owned and cross-plane releases",()=>{const tenant=structuredClone(release()) as unknown as {source:{tenantId:string|null}};tenant.source.tenantId="44444444-4444-5444-8444-444444444444";assert.throws(()=>compileEntityOperationProjection({release:tenant as unknown as MetadataReleaseProjectionSource,...dependencies()}),/rejects tenant-owned/);const mesh=buildCanonicalCatalogV2({plane:"mesh",permissions:[{canonicalCode:"mesh.relationship.business_partner.create",permissionKind:"entity_operation",riskTier:"medium",requiresMfa:false}]});assert.throws(()=>compileEntityOperationProjection({release:release(),catalog:mesh.catalog,scopeCompatibility:buildExactScopeCompatibility({plane:"mesh",permissionCodes:["mesh.relationship.business_partner.create"]})}),/cross-plane/);});
test("database staging requires compiler IDs and canonical permission identity",async()=>{const sql=await readFile(resolve(import.meta.dirname,"../../ddl/common/authz/07_functions.sql"),"utf8");assert.match(sql,/OPERATION_BINDING_CANONICAL_PERMISSION_REQUIRED/);assert.match(sql,/p\.id=\(item->>'permissionId'\)::uuid/);assert.match(sql,/\(item->>'bindingId'\)::uuid/);assert.match(sql,/\(item->>'scopeBindingId'\)::uuid/);});
