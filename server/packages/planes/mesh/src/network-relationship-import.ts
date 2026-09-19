import { sql, type Transaction } from "kysely";
import type { GovernedImportAdapter, RecordCollectionScopeResolution } from "@athyper/server-contract-records";

type Tx = Transaction<Record<string, never>>;
type Row = Readonly<Record<string, unknown>>;
type Scope = Extract<RecordCollectionScopeResolution, { readonly status: "ready" }>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createMeshRelationshipRequestImportAdapter(): GovernedImportAdapter<Tx> {
  const adapter:GovernedImportAdapter<Tx> = {
    key: "mesh.network_relationship.request.v1",
    supports: descriptor => descriptor.planeKey === "mesh" && descriptor.entityCode === "network_relationship" && descriptor.storage.schema === "mesh" && descriptor.storage.object === "network_relationship",
    operations: () => Object.freeze(["create", "update", "upsert", "delete", "replace"] as const),
    async validate({ context, row, rowNumber, scope }) {
      const errors:string[]=[];
      const actor=actorAccount(scope);
      for(const key of ["buyer_tenant_id","buyer_account_id","supplier_tenant_id","supplier_account_id"]) if(!UUID.test(String(row[key]??"")))errors.push(`IMPORT_FIELD_INVALID:${key}:${key} must be a UUID`);
      if(row["buyer_tenant_id"]===row["supplier_tenant_id"])errors.push("MESH_TENANTS_EQUAL:scope:Buyer and supplier tenants must differ");
      if(actor && row["buyer_account_id"]!==actor && row["supplier_account_id"]!==actor)errors.push("MESH_ACTOR_NOT_PARTICIPANT:scope:The acting account must be a relationship participant");
      if(row["buyer_tenant_id"]!==context.tenantId && row["supplier_tenant_id"]!==context.tenantId)errors.push("MESH_TENANT_NOT_PARTICIPANT:scope:The current tenant must be a relationship participant");
      if(row["buyer_account_id"]===row["supplier_account_id"])errors.push("MESH_PARTICIPANTS_EQUAL:scope:Buyer and supplier accounts must differ");
      return{rowNumber,valid:errors.length===0,errors};
    },
    async apply({ context,row,session,scope,transaction }) {
      const actor=requiredActorAccount(scope),buyerTenant=text(row,"buyer_tenant_id"),buyerAccount=text(row,"buyer_account_id"),supplierTenant=text(row,"supplier_tenant_id"),supplierAccount=text(row,"supplier_account_id"),kind=optionalText(row,"relationship_kind")??"commercial";
      if(actor!==buyerAccount&&actor!==supplierAccount)throw new Error("Acting account is not a relationship participant");
      const existing=(await sql<{id:string;status:string}>`SELECT id,status::text FROM mesh.network_relationship WHERE buyer_account_id=${buyerAccount}::uuid AND supplier_account_id=${supplierAccount}::uuid AND relationship_kind=${kind} FOR UPDATE`.execute(transaction)).rows[0];
      if(session.operation==="delete"){
        if(!existing)return conflict(session.conflictPolicy,"Relationship request was not found");
        if(existing.status==="terminated")return{outcome:"skipped"as const,recordId:existing.id};
        await sql`UPDATE mesh.network_relationship SET status='terminated',status_changed_at=clock_timestamp(),status_changed_by=${context.principalId}::uuid,updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid WHERE id=${existing.id}::uuid`.execute(transaction);
        return{outcome:"deleted"as const,recordId:existing.id};
      }
      if(existing&&session.operation==="create")return conflict(session.conflictPolicy,"Relationship request already exists");
      if(!existing&&session.operation==="update")return conflict(session.conflictPolicy,"Relationship request was not found");
      if(existing){if(existing.status!=="requested")return conflict(session.conflictPolicy,"Only requested relationships can be imported as updates");await sql`UPDATE mesh.network_relationship SET effective_from=COALESCE(${optionalText(row,"effective_from")}::date,effective_from),effective_until=COALESCE(${optionalText(row,"effective_until")}::date,effective_until),metadata=CASE WHEN ${has(row,"metadata")} THEN ${JSON.stringify(object(row,"metadata"))}::jsonb ELSE metadata END,updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid WHERE id=${existing.id}::uuid`.execute(transaction);return{outcome:"updated"as const,recordId:existing.id};}
      const created=(await sql<{id:string}>`INSERT INTO mesh.network_relationship(buyer_tenant_id,buyer_account_id,supplier_tenant_id,supplier_account_id,relationship_kind,effective_from,effective_until,metadata,status,created_by_tenant_id,created_by) VALUES(${buyerTenant}::uuid,${buyerAccount}::uuid,${supplierTenant}::uuid,${supplierAccount}::uuid,${kind},${optionalText(row,"effective_from")}::date,${optionalText(row,"effective_until")}::date,${JSON.stringify(object(row,"metadata"))}::jsonb,'requested',${context.tenantId}::uuid,${context.principalId}::uuid) RETURNING id`.execute(transaction)).rows[0]!;
      return{outcome:"requested"as const,recordId:created.id};
    },
  };
  return Object.freeze(adapter);
}
function actorAccount(scope:Scope){const value=scope.constraints.find(item=>item.kind==="mesh.network_relationship.actor_account.v1");return value?.kind==="mesh.network_relationship.actor_account.v1"?value.networkAccountId:undefined;}
function requiredActorAccount(scope:Scope){const value=actorAccount(scope);if(!value)throw new Error("Mesh acting-account scope is unavailable");return value;}
function conflict(policy:"reject"|"skip",message:string){if(policy==="skip")return{outcome:"skipped"as const};throw Object.assign(new Error(message),{code:"IMPORT_CONFLICT",retryable:false as const});}
function text(row:Row,key:string){const value=row[key];if(typeof value!=="string"||!value)throw new Error(`IMPORT_FIELD_REQUIRED:${key}`);return value;}
function optionalText(row:Row,key:string){const value=row[key];return typeof value==="string"&&value?value:null;}
function object(row:Row,key:string):Readonly<Record<string,unknown>>{const value=row[key];return value&&typeof value==="object"&&!Array.isArray(value)?value as Readonly<Record<string,unknown>>:{};}
function has(row:Row,key:string){return Object.prototype.hasOwnProperty.call(row,key);}
