import { createHash } from "node:crypto";
import type { CanonicalCatalogV2, CatalogPlane } from "./canonical-catalog-v2-model.js";
import type { ExactScopeCompatibilityContract, ScopeKind } from "./exact-scope-compatibility-model.js";

type TargetPlane = Exclude<CatalogPlane, "studio">;
type CoordinateSource = "tenant_context" | "request_field" | "record_field" | "collection_field" | "relation_resolver";

export interface MetadataReleaseProjectionSource {
  contractVersion: "athyper.metadata.entity-operation-release.v1";
  source: {
    tenantId: null;
    entityId: string;
    entityCode: string;
    releaseId: string;
    releaseHash: string;
    compiledHash: string;
  };
  targetPlane: TargetPlane;
  operations: readonly { id: string; operationKey: string; status: "active" | "deprecated" }[];
  operationPermissions: readonly {
    entityOperationId: string; targetPlane: TargetPlane; permissionCode: string;
    permissionKind: "entity_operation" | "capability"; status: "active" | "deprecated";
  }[];
  operationScopeBindings: readonly {
    entityOperationId: string; targetPlane: TargetPlane; decisionMode: "entity_resource" | "collection";
    scopeKind: ScopeKind; coordinateSource: CoordinateSource; coordinateKey: string | null;
    resolverKey: string | null; missingValueBehavior: "deny"; status: "active" | "deprecated";
  }[];
}

export interface EntityOperationProjection {
  contractVersion: "athyper.authorization.entity-operation-projection.v1";
  plane: TargetPlane;
  source: MetadataReleaseProjectionSource["source"];
  globalEntityOperationBindings: readonly {
    bindingId: string; tenantId: null; planeCode: TargetPlane; sourceEntityId: string;
    sourceEntityOperationId: string; sourceReleaseId: string; sourceReleaseHash: string;
    sourceCompiledHash: string; entityCode: string; operationKey: string;
    permissionId: string; permissionCode: string; permissionKind: "entity_operation" | "capability";
    decisionMode: "entity_resource" | "collection"; status: "draft";
  }[];
  exactScopeCoordinateChildren: readonly {
    id: string; entityOperationBindingId: string; scopeKind: ScopeKind;
    coordinateSource: CoordinateSource; coordinateKey: string | null; resolverKey: string | null;
  }[];
  operation_scope_bindings: readonly {
    bindingId: string; scopeBindingId: string; sourceEntityOperationId: string; entityCode: string; operationKey: string;
    permissionId: string; permissionCode: string; permissionKind: "entity_operation" | "capability";
    decisionMode: "entity_resource" | "collection"; scopeKind: ScopeKind;
    coordinateSource: CoordinateSource; coordinateKey: string | null; resolverKey: string | null;
  }[];
  sha256: string;
}

export function compileEntityOperationProjection(input: {
  release: MetadataReleaseProjectionSource;
  catalog: CanonicalCatalogV2;
  scopeCompatibility: ExactScopeCompatibilityContract;
}): EntityOperationProjection {
  const { release } = input;
  if (release.source.tenantId !== null) throw new Error("global entity-operation projection rejects tenant-owned releases");
  if (input.catalog.plane !== release.targetPlane || input.scopeCompatibility.plane !== release.targetPlane) throw new Error("cross-plane entity-operation projection rejected");
  uuid(release.source.entityId, "source entity"); uuid(release.source.releaseId, "source release"); hash(release.source.releaseHash, "release"); hash(release.source.compiledHash, "compiled");
  token(release.source.entityCode, "entity code");
  const catalog = new Map(input.catalog.permissions.map((item) => [item.canonicalCode, item] as const));
  const scopeContract = new Map(input.scopeCompatibility.permissions.map((item) => [item.permissionCode, item.scopes] as const));
  const operations = release.operations.filter((item) => item.status === "active").sort((a,b) => a.operationKey.localeCompare(b.operationKey));
  unique(operations.map((item) => item.id), "source entity operation ID");
  unique(operations.map((item) => item.operationKey), "source operation key");
  const globalEntityOperationBindings: EntityOperationProjection["globalEntityOperationBindings"][number][] = [];
  const exactScopeCoordinateChildren: EntityOperationProjection["exactScopeCoordinateChildren"][number][] = [];
  const flattened: EntityOperationProjection["operation_scope_bindings"][number][] = [];
  for (const operation of operations) {
    uuid(operation.id, "source entity operation"); token(operation.operationKey, "operation key");
    const permissionRows = release.operationPermissions.filter((item) => item.status === "active" && item.targetPlane === release.targetPlane && item.entityOperationId === operation.id);
    if (permissionRows.length !== 1) throw new Error(`entity operation must resolve to exactly one canonical permission: ${release.source.entityCode}.${operation.operationKey}`);
    const permissionRow = permissionRows[0]!;
    rejectNonCanonical(permissionRow.permissionCode, release.targetPlane);
    const permission = catalog.get(permissionRow.permissionCode);
    if (!permission || permission.permissionKind !== permissionRow.permissionKind) throw new Error(`canonical permission ID is unresolved or kind-mismatched: ${permissionRow.permissionCode}`);
    if (permission.entity !== release.source.entityCode || permission.operation !== operation.operationKey) throw new Error(`permission coordinate does not match entity operation: ${permissionRow.permissionCode}`);
    const compatibleScopes = scopeContract.get(permissionRow.permissionCode);
    if (!compatibleScopes) throw new Error(`permission has no exact scope compatibility: ${permissionRow.permissionCode}`);
    const scopes = release.operationScopeBindings.filter((item) => item.status === "active" && item.targetPlane === release.targetPlane && item.entityOperationId === operation.id);
    if (!scopes.length) throw new Error(`entity operation has no exact scope coordinates: ${release.source.entityCode}.${operation.operationKey}`);
    unique(scopes.map((item) => item.scopeKind), `scope kind for ${release.source.entityCode}.${operation.operationKey}`);
    if (new Set(scopes.map((item) => item.decisionMode)).size !== 1) throw new Error(`entity operation has ambiguous decision modes: ${release.source.entityCode}.${operation.operationKey}`);
    const authoredKinds = scopes.map((item) => item.scopeKind).sort();
    const compatibleKinds = [...new Set(compatibleScopes.map((item) => item.kind))].sort();
    if (authoredKinds.join("\0") !== compatibleKinds.join("\0")) throw new Error(`scope-coordinate coverage does not exactly match permission compatibility: ${permissionRow.permissionCode}`);
    const decisionMode = scopes[0]!.decisionMode;
    const bindingId = deterministicId(`binding:${release.targetPlane}:${release.source.releaseId}:${operation.id}`);
    globalEntityOperationBindings.push({
      bindingId, tenantId: null, planeCode: release.targetPlane, sourceEntityId: release.source.entityId,
      sourceEntityOperationId: operation.id, sourceReleaseId: release.source.releaseId,
      sourceReleaseHash: release.source.releaseHash, sourceCompiledHash: release.source.compiledHash,
      entityCode: release.source.entityCode, operationKey: operation.operationKey,
      permissionId: permission.permissionId, permissionCode: permission.canonicalCode,
      permissionKind: permissionRow.permissionKind, decisionMode, status: "draft",
    });
    for (const scope of scopes.sort((a,b) => scopeKey(a).localeCompare(scopeKey(b)))) {
      validateScope(scope, compatibleScopes.map((item) => item.kind), permissionRow.permissionCode);
      exactScopeCoordinateChildren.push({
        id: deterministicId(`scope:${bindingId}:${scope.scopeKind}`), entityOperationBindingId: bindingId,
        scopeKind: scope.scopeKind, coordinateSource: scope.coordinateSource,
        coordinateKey: scope.coordinateKey, resolverKey: scope.resolverKey,
      });
      flattened.push({
        bindingId, scopeBindingId: deterministicId(`scope:${bindingId}:${scope.scopeKind}`),
        sourceEntityOperationId: operation.id, entityCode: release.source.entityCode, operationKey: operation.operationKey,
        permissionId: permission.permissionId, permissionCode: permission.canonicalCode,
        permissionKind: permissionRow.permissionKind, decisionMode, scopeKind: scope.scopeKind,
        coordinateSource: scope.coordinateSource, coordinateKey: scope.coordinateKey, resolverKey: scope.resolverKey,
      });
    }
  }
  const body = { contractVersion: "athyper.authorization.entity-operation-projection.v1" as const,
    plane: release.targetPlane, source: release.source, globalEntityOperationBindings,
    exactScopeCoordinateChildren, operation_scope_bindings: flattened };
  return { ...body, sha256: sha256(canonical(body)) };
}

function rejectNonCanonical(code: string, plane: TargetPlane): void {
  const parts=code.split(".");
  if(parts.length!==4||parts[0]!==plane||parts[1]==="action"||parts[2]==="action")throw new Error(`non-canonical permission binding rejected: ${code}`);
}
function validateScope(scope: MetadataReleaseProjectionSource["operationScopeBindings"][number], supported: readonly string[], code: string): void {
  if(scope.missingValueBehavior!=="deny")throw new Error(`scope must deny missing coordinates: ${code}`);
  if(!supported.includes(scope.scopeKind))throw new Error(`scope is incompatible with canonical permission: ${code}/${scope.scopeKind}`);
  const field=["request_field","record_field","collection_field"].includes(scope.coordinateSource);
  if(field!==Boolean(scope.coordinateKey)||((scope.coordinateSource==="relation_resolver")!==Boolean(scope.resolverKey)))throw new Error(`scope coordinate shape is invalid: ${code}/${scope.scopeKind}`);
  if((scope.scopeKind==="tenant")!==(scope.coordinateSource==="tenant_context"))throw new Error(`tenant scope coordinate is invalid: ${code}`);
  if(scope.decisionMode==="collection"&&["request_field","record_field"].includes(scope.coordinateSource))throw new Error(`collection decision coordinate is invalid: ${code}`);
  if(scope.decisionMode==="entity_resource"&&scope.coordinateSource==="collection_field")throw new Error(`entity decision coordinate is invalid: ${code}`);
}
function deterministicId(name:string):string{const ns=Buffer.from("7bbaa1b7700b5b54a7eecf62699013ca","hex");const bytes=createHash("sha1").update(ns).update(name).digest().subarray(0,16);bytes[6]=(bytes[6]!&15)|80;bytes[8]=(bytes[8]!&63)|128;const h=bytes.toString("hex");return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
function uuid(value:string,label:string):void{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new Error(`invalid ${label} UUID`);}
function hash(value:string,label:string):void{if(!/^[a-f0-9]{64}$/.test(value))throw new Error(`invalid ${label} hash`);}
function token(value:string,label:string):void{if(!/^[a-z][a-z0-9_]*$/.test(value))throw new Error(`invalid ${label}: ${value}`);}
function unique(values:readonly string[],label:string):void{const seen=new Set<string>();for(const value of values){if(seen.has(value))throw new Error(`duplicate ${label}: ${value}`);seen.add(value);}}
function scopeKey(value:MetadataReleaseProjectionSource["operationScopeBindings"][number]):string{return`${value.scopeKind}\0${value.coordinateSource}\0${value.coordinateKey??""}\0${value.resolverKey??""}`;}
function canonical(value:unknown):string{if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([name,item])=>`${JSON.stringify(name)}:${canonical(item)}`).join(",")}}`;return JSON.stringify(value);}
function sha256(value:string):string{return createHash("sha256").update(value).digest("hex");}
