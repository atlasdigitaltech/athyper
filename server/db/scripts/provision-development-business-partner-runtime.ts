#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const CONFIRMATION = "LOCAL-NEON-BUSINESS-PARTNER-RUNTIME";
const PUBLICATION_KEY = "metadata.entity.business_partner";
const PERMISSION_CODE = "neon.relationship.business_partner.read";
const IMPORT_PERMISSION_CODE = "neon.relationship.business_partner.create";
const REQUEST_CREATE_PERMISSION_CODE = "neon.relationship.business_partner_request.create";
const PRIMARY_TENANT_ADMINS = ["athyper.admin", "tksa.admin", "catl.admin"] as const;
const PUBLISHED_AT = "2026-08-26T00:00:00.000Z";
const SOURCE_VERSION = "development-v8";
const UUID_NAMESPACE = Buffer.from("7bbaa1b7700b5b54a7eecf62699013ca", "hex");

type QueryClient = Pick<Client, "query">;

export function buildDevelopmentBusinessPartnerProjection(permissionId: string) {
  const entityId = deterministicUuid("entity:business_partner");
  const releaseId = deterministicUuid(`${PUBLICATION_KEY}:${SOURCE_VERSION}:release`);
  const revisionId = deterministicUuid(`${PUBLICATION_KEY}:${SOURCE_VERSION}:revision`);
  const contractId = deterministicUuid(`${PUBLICATION_KEY}:${SOURCE_VERSION}:contract`);
  const descriptorId = deterministicUuid(`${PUBLICATION_KEY}:${SOURCE_VERSION}:descriptor:neon`);
  const deploymentId = deterministicUuid(`${PUBLICATION_KEY}:${SOURCE_VERSION}:deployment:neon`);
  const operationId = deterministicUuid("entity:business_partner:operation:read");
  const bindingId = deterministicUuid(`binding:neon:${releaseId}:${operationId}`);
  const scopeBindingId = deterministicUuid(`scope:${bindingId}:operating_organization`);
  const contract = {
    schema: "athyper.meta-entity-contract/2.1",
    entity: { entityCode: "business_partner", entityClass: "business", detailRouteTemplate: "/app/business_partner/:recordId" },
    runtime: { plane: "neon", backingKind: "table", readMode: "cursor", writeMode: "governed_adapter" },
    storage: { schema: "master", object: "business_partner" },
    operations: [{ code: "read", permissionCode: PERMISSION_CODE },{code:"export",permissionCode:PERMISSION_CODE},{code:"import",permissionCode:PERMISSION_CODE}],
  };
  const contractHash = sha256(contract);
  const descriptor = {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: "business_partner",
    detailRouteTemplate: "/app/business_partner/:recordId",
    planeKey: "neon",
    storage: { schema: "master", object: "business_partner", idField: "id", tenantField: "tenant_id", statusField: "status" },
    fields: [
      field("id", "uuid", true, true, true, { label: "Record ID", defaultVisible: false, defaultOrder: 90, defaultWidth: 300 }),
      field("code", "string", true, true, true, { label: "Business Partner Code", semanticRole: "identity", defaultVisible: true, defaultOrder: 0, defaultWidth: 190 }),
      field("display_name", "string", false, true, true, { label: "Display Name", semanticRole: "title", defaultVisible: true, defaultOrder: 1, defaultWidth: 280 }),
      field("status", "enum", true, true, true, { label: "Status", semanticRole: "status", defaultVisible: true, defaultOrder: 2, defaultWidth: 130, groupable: true }, { options: ["active", "draft", "inactive", "archived"] }),
      field("partner_category", "enum", true, true, true, { label: "Partner Category", defaultVisible: true, defaultOrder: 3, defaultWidth: 170, groupable: true }, { options: ["organization", "person"] }),
      field("registration_country_code", "string", false, true, true, { label: "Country", semanticRole: "country_code", defaultVisible: true, defaultOrder: 4, defaultWidth: 120, groupable: true }),
      field("updated_at", "datetime", false, true, true, { label: "Updated", semanticRole: "updated_at", defaultVisible: true, defaultOrder: 5, defaultWidth: 190 }),
      field("name", "string", true, true, true, { label: "Registered Name", defaultVisible: false, defaultOrder: 10, defaultWidth: 280 }),
      field("legal_name", "string", false, true, true, { label: "Legal Name", defaultVisible: false, defaultOrder: 11, defaultWidth: 300 }),
      field("is_active", "boolean", false, true, true, { label: "Active", defaultVisible: false, defaultOrder: 12, defaultWidth: 110 }),
    ],
    listPresentation: {
      schemaVersion: 1,
      title: "Business Partners",
      description: "Suppliers and business partners available in the selected operating organization.",
      identityField: "code",
      defaultState: {
        filters: [],
        sort: [{ field: "code", direction: "asc" }],
        columns: ["code", "display_name", "status", "partner_category", "registration_country_code", "updated_at"],
        density: "comfortable",
        mode: "table",
      },
      supportedModes: ["table", "compact"],
      search: { minimumQueryLength: 1 },
      filterPresentation: { quickFields: [{ field: "status", defaultOperator: "eq" }, { field: "partner_category", defaultOperator: "eq" }, { field: "registration_country_code", defaultOperator: "contains" }, { field: "updated_at", defaultOperator: "relative" }], allowUserPinning: true },
      limits: { defaultPageSize: 10, allowedPageSizes: [10, 25, 50, 100], maxSortLevels: 3, countMode: "exact" },
      dataOperations:{exportFormats:["xlsx","csv","json","ndjson"],importAdapterKey:"neon.business_partner.operating_organization.v1",importOperations:["create","update","upsert","delete","replace"],importOperationPermissions:{create:[IMPORT_PERMISSION_CODE],update:["neon.relationship.business_partner.update"],upsert:[IMPORT_PERMISSION_CODE,"neon.relationship.business_partner.update"],delete:["neon.relationship.business_partner.update"],replace:[IMPORT_PERMISSION_CODE,"neon.relationship.business_partner.update"]},importFormats:["xlsx","csv","json"],importMaxRows:50000,importMaxFileBytes:26214400,allowTemplateDownload:true},
    },
    operations: { read: { code: "read", permissionCode: PERMISSION_CODE },export:{code:"export",permissionCode:PERMISSION_CODE},import:{code:"import",permissionCode:PERMISSION_CODE} },
    source: { entity_id: entityId, release_hash: contractHash },
    operation_scope_bindings: [{
      bindingId,
      scopeBindingId,
      sourceEntityOperationId: operationId,
      entityCode: "business_partner",
      operationKey: "read",
      permissionId,
      permissionCode: PERMISSION_CODE,
      permissionKind: "entity_operation",
      decisionMode: "collection",
      scopeKind: "operating_organization",
      coordinateSource: "relation_resolver",
      coordinateKey: null,
      resolverKey: "neon.business_partner.operating_organization.v1",
    }],
  };
  const compiledHash = sha256(descriptor);
  const manifest = {
    schema: "athyper.development-runtime-publication/1.0",
    sourceVersion: SOURCE_VERSION,
    publicationKey: PUBLICATION_KEY,
    releaseId,
    releaseNo: 8,
    targetPlane: "neon",
    contractHash,
    compiledHash,
  };
  const artifactHash = sha256({ manifest, contract, descriptor });
  return {
    publicationKey: PUBLICATION_KEY,
    releaseId,
    releaseNo: 8,
    deploymentId,
    artifactHash,
    manifest,
    projection: {
      contract: {
        id: contractId,
        tenant_id: null,
        entity_id: entityId,
        entity_code: "business_partner",
        release_id: releaseId,
        revision_id: revisionId,
        release_no: 8,
        contract_schema_code: "athyper.meta-entity-contract",
        contract_schema_version: "2.1",
        contract_hash: contractHash,
        contract_json: contract,
        publication_key: PUBLICATION_KEY,
        signature_algorithm: "development-local-sha256",
        signing_key_id: "local-development-runtime-bootstrap",
        signature: sha256({ contractHash, releaseId, targetPlane: "neon" }),
        published_at: PUBLISHED_AT,
      },
      descriptor: {
        id: descriptorId,
        plane_code: "neon",
        descriptor_kind: "entity_runtime",
        descriptor_schema_version: "1.0.0",
        source_contract_hash: contractHash,
        compiled_hash: compiledHash,
        compiled_json: descriptor,
        compiler_version: "athyper.development-business-partner-runtime/1.0.0",
        compatibility_level: "backward_compatible",
        generated_at: PUBLISHED_AT,
      },
    },
    verification: {
      signature_verified: true,
      manifest_valid: true,
      runtime_compatible: true,
      target_plane: "neon",
      contract_hash: contractHash,
      descriptor_source_hash: contractHash,
      contract_schema_version: "2.1",
      descriptor_schema_version: "1.0.0",
      signature_algorithm: "development-local-sha256",
      signing_key_id: "local-development-runtime-bootstrap",
    },
  } as const;
}

export async function provisionDevelopmentBusinessPartnerRuntime(options: { databaseUrl: string; confirmation?: string; dryRun?: boolean }) {
  const url = new URL(options.databaseUrl);
  if (!localDatabase(url) || url.pathname !== "/athyper_neon") throw new Error("development business-partner publication requires local athyper_neon");
  if (!options.dryRun && options.confirmation !== CONFIRMATION) throw new Error(`apply requires --confirm=${CONFIRMATION}`);
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    const permission = await one<{ id: string }>(client, "SELECT id::text AS id FROM authz.permission WHERE canonical_code=$1 AND permission_kind='entity_operation' AND status='published'", [PERMISSION_CODE]);
    const importPermission = await one<{ id: string }>(client, "SELECT id::text AS id FROM authz.permission WHERE canonical_code=$1 AND permission_kind='entity_operation' AND status='published'", [IMPORT_PERMISSION_CODE]);
    const updatePermission = await one<{ id: string }>(client, "SELECT id::text AS id FROM authz.permission WHERE canonical_code='neon.relationship.business_partner.update' AND permission_kind='entity_operation' AND status='published'");
    const requestReadPermission = await one<{ id: string }>(client, "SELECT id::text AS id FROM authz.permission WHERE canonical_code='neon.relationship.business_partner_request.read' AND permission_kind='entity_operation' AND status='published'");
    const requestCreatePermission = await one<{ id: string }>(client, "SELECT id::text AS id FROM authz.permission WHERE canonical_code=$1 AND permission_kind='entity_operation' AND status='published'", [REQUEST_CREATE_PERMISSION_CODE]);
    const artifact = buildDevelopmentBusinessPartnerProjection(permission.id);
    if (options.dryRun) return { mode: "planned", publicationKey: artifact.publicationKey, releaseId: artifact.releaseId, artifactHash: artifact.artifactHash, compiledHash: artifact.projection.descriptor.compiled_hash };
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [PUBLICATION_KEY]);
    await client.query("SELECT set_config('app.database_plane','neon',true),set_config('app.current_principal_id','00000000-0000-0000-0000-000000000000',true)");
    const staged = await one<{ id: string; status: string }>(client, `SELECT id::text,status FROM runtime_meta.fn_stage_release_projection($1,$2::uuid,$3,$4::uuid,$5,$6::jsonb,$7::jsonb)`, [artifact.publicationKey, artifact.releaseId, artifact.releaseNo, artifact.deploymentId, artifact.artifactHash, JSON.stringify(artifact.manifest), JSON.stringify(artifact.projection)]);
    if (staged.status !== "active") {
      const verified = await one<{ id: string; status: string; failure_code: string | null }>(client, "SELECT id::text,status,failure_code FROM runtime_meta.fn_verify_release($1::uuid,$2,$3::jsonb)", [staged.id, artifact.artifactHash, JSON.stringify(artifact.verification)]);
      if (verified.status !== "verified") throw new Error(`runtime verification failed: ${verified.failure_code ?? verified.status}`);
      await client.query("SELECT runtime_meta.fn_activate_release($1::uuid,$2::jsonb)", [staged.id, JSON.stringify({ source: "local-development-bootstrap", sourceVersion: SOURCE_VERSION })]);
    }
    await provisionDevelopmentReaders(client, [permission,importPermission,updatePermission,requestReadPermission], requestCreatePermission);
    await client.query("COMMIT");
    return { mode: "applied", publicationKey: artifact.publicationKey, releaseId: artifact.releaseId, appliedReleaseId: staged.id, artifactHash: artifact.artifactHash, compiledHash: artifact.projection.descriptor.compiled_hash };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function provisionDevelopmentReaders(client: QueryClient, permissions: readonly {readonly id:string}[], requestCreatePermission: {readonly id:string}): Promise<void> {
  const tenants = await client.query<{ tenant_id: string; actor_id: string }>(`SELECT role.tenant_id::text,principal.id::text actor_id FROM authz.role role JOIN master.principal principal ON principal.tenant_id=role.tenant_id AND principal.code='seed.three-plane-provisioner' AND principal.status='active' WHERE role.code='demo.neon.context-reader' AND role.source_ref='local-demo:three-tenant-authorization:v1' GROUP BY role.tenant_id,principal.id`);
  for (const tenant of tenants.rows) {
    await client.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)", [tenant.tenant_id, tenant.actor_id]);
    const roleCode = "demo.neon.business-partner-reader";
    const roleId = deterministicUuid(`demo-auth:neon:${tenant.tenant_id}:role:${roleCode}`);
    await client.query(`INSERT INTO authz.role(id,tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3,'Demo Neon business-partner reader','Local demo business-partner list visibility','system','seed','local-demo:business-partner-runtime:v1','{"environment":"disposable_local"}'::jsonb,'draft',$4::uuid) ON CONFLICT(tenant_id,code) DO NOTHING`, [roleId, tenant.tenant_id, roleCode, tenant.actor_id]);
    const actualRole = await one<{ id: string; status: string }>(client, "SELECT id::text,status FROM authz.role WHERE tenant_id=$1::uuid AND code=$2", [tenant.tenant_id, roleCode]);
    if (actualRole.status === "active") await client.query("UPDATE authz.role SET status='suspended',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid", [tenant.tenant_id, actualRole.id, tenant.actor_id]);
    for(const permission of permissions)await client.query("INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING", [deterministicUuid(`demo-auth:neon:${tenant.tenant_id}:role-permission:${permission.id}`), tenant.tenant_id, actualRole.id, permission.id, tenant.actor_id]);
    await client.query("UPDATE authz.role SET status='active',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND status<>'active'", [tenant.tenant_id, actualRole.id, tenant.actor_id]);
    const scopes = await client.query<{ group_id: string; scope_target_id: string }>(`SELECT DISTINCT assignment.group_id::text,assignment.scope_target_id::text FROM authz.group_role assignment JOIN authz.role context_role ON context_role.tenant_id=assignment.tenant_id AND context_role.id=assignment.role_id AND context_role.code='demo.neon.context-reader' JOIN authz.scope_target scope ON scope.tenant_id=assignment.tenant_id AND scope.id=assignment.scope_target_id AND scope.scope_kind='operating_organization' WHERE assignment.tenant_id=$1::uuid AND assignment.status='active'`, [tenant.tenant_id]);
    for (const scope of scopes.rows) {
      const grantId = deterministicUuid(`demo-auth:neon:${tenant.tenant_id}:business-partner-reader:${scope.group_id}:${scope.scope_target_id}`);
      await client.query(`INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'subtree','seed','local-demo:business-partner-runtime:v1','{"environment":"disposable_local"}'::jsonb,'active',$6::uuid) ON CONFLICT(id) DO UPDATE SET status='active',effective_until=NULL,updated_by=EXCLUDED.created_by`, [grantId, tenant.tenant_id, scope.group_id, actualRole.id, scope.scope_target_id, tenant.actor_id]);
    }
    const creatorRoleCode = "demo.neon.business-partner-request-creator";
    const creatorRoleId = deterministicUuid(`demo-auth:neon:${tenant.tenant_id}:role:${creatorRoleCode}`);
    await client.query(`INSERT INTO authz.role(id,tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3,'Demo Neon Business Partner request creator','Local primary tenant-admin authority to create governed Business Partner requests','system','seed','local-demo:business-partner-runtime:v1','{"environment":"disposable_local","persona":"primary_tenant_admin"}'::jsonb,'draft',$4::uuid) ON CONFLICT(tenant_id,code) DO NOTHING`, [creatorRoleId, tenant.tenant_id, creatorRoleCode, tenant.actor_id]);
    const creatorRole = await one<{ id: string; status: string }>(client, "SELECT id::text,status FROM authz.role WHERE tenant_id=$1::uuid AND code=$2", [tenant.tenant_id, creatorRoleCode]);
    if (creatorRole.status === "active") await client.query("UPDATE authz.role SET status='suspended',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid", [tenant.tenant_id, creatorRole.id, tenant.actor_id]);
    await client.query("DELETE FROM authz.role_permission WHERE tenant_id=$1::uuid AND role_id=$2::uuid AND permission_id<>$3::uuid", [tenant.tenant_id, creatorRole.id, requestCreatePermission.id]);
    await client.query("INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING", [deterministicUuid(`demo-auth:neon:${tenant.tenant_id}:role-permission:${REQUEST_CREATE_PERMISSION_CODE}`), tenant.tenant_id, creatorRole.id, requestCreatePermission.id, tenant.actor_id]);
    await client.query("UPDATE authz.role SET status='active',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND status<>'active'", [tenant.tenant_id, creatorRole.id, tenant.actor_id]);
    const creatorScopes = await client.query<{ group_id: string; scope_target_id: string }>(`SELECT DISTINCT assignment.group_id::text,assignment.scope_target_id::text FROM authz.group_role assignment JOIN authz.role context_role ON context_role.tenant_id=assignment.tenant_id AND context_role.id=assignment.role_id AND context_role.code='demo.neon.context-reader' JOIN authz.scope_target scope ON scope.tenant_id=assignment.tenant_id AND scope.id=assignment.scope_target_id AND scope.scope_kind='operating_organization' JOIN authz.group_member member ON member.tenant_id=assignment.tenant_id AND member.group_id=assignment.group_id AND member.status='active' JOIN master.principal principal ON principal.tenant_id=member.tenant_id AND principal.id=member.principal_id AND principal.code=ANY($2::text[]) WHERE assignment.tenant_id=$1::uuid AND assignment.status='active'`, [tenant.tenant_id, PRIMARY_TENANT_ADMINS]);
    for (const scope of creatorScopes.rows) {
      const grantId = deterministicUuid(`demo-auth:neon:${tenant.tenant_id}:business-partner-request-creator:${scope.group_id}:${scope.scope_target_id}`);
      await client.query(`INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'subtree','seed','local-demo:business-partner-runtime:v1','{"environment":"disposable_local","persona":"primary_tenant_admin"}'::jsonb,'active',$6::uuid) ON CONFLICT(id) DO UPDATE SET status='active',effective_until=NULL,updated_by=EXCLUDED.created_by`, [grantId, tenant.tenant_id, scope.group_id, creatorRole.id, scope.scope_target_id, tenant.actor_id]);
    }
  }
}

function field(key: string, type: string, required: boolean, filterable: boolean, sortable: boolean, list: Readonly<Record<string, unknown>>, validation?: Readonly<Record<string, unknown>>) {
  const writable=new Set(["code","name","display_name","legal_name","status","partner_category","registration_country_code"]);
  return { key, storagePath: key, type, required, writableOn: writable.has(key)?["create","patch"]:[], filterable, sortable, searchable: ["code", "name", "display_name", "legal_name"].includes(key), ...(validation ? { validation } : {}), list };
}
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`; return JSON.stringify(value); }
function sha256(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
function deterministicUuid(name: string): string { const bytes=createHash("sha1").update(UUID_NAMESPACE).update(name).digest().subarray(0,16);bytes[6]=(bytes[6]!&15)|80;bytes[8]=(bytes[8]!&63)|128;const hex=bytes.toString("hex");return`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; }
function localDatabase(url: URL): boolean {
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return true;
  const octets=url.hostname.split(".").map(Number);
  return octets.length===4 && octets.every(octet=>Number.isInteger(octet)&&octet>=0&&octet<=255)
    && (octets[0]===10 || (octets[0]===172 && octets[1]!>=16 && octets[1]!<=31) || (octets[0]===192 && octets[1]===168));
}
async function one<T extends object>(client: QueryClient, statement: string, values: unknown[] = []): Promise<T> { const result=await client.query<T>(statement,values);if(result.rows.length!==1)throw new Error(`expected one row, received ${result.rows.length}`);return result.rows[0]!; }
function option(args: string[], name: string): string | undefined { const equal=args.find(item=>item.startsWith(`${name}=`));if(equal)return equal.slice(name.length+1);const index=args.indexOf(name);return index<0?undefined:args[index+1]; }
async function main(): Promise<void> { const args=process.argv.slice(2);const databaseUrl=option(args,"--database-url")??process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];if(!databaseUrl)throw new Error("set ATHYPER_NEON_DATABASE_ADMIN_URL or --database-url");const result=await provisionDevelopmentBusinessPartnerRuntime({databaseUrl,confirmation:option(args,"--confirm"),dryRun:args.includes("--plan")||args.includes("--dry-run")});process.stdout.write(`${JSON.stringify(result,null,2)}\n`); }
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
