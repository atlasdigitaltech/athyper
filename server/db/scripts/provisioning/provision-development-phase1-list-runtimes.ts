#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

type Plane = "neon" | "mesh" | "studio";
type QueryClient = Pick<Client, "query">;
const PUBLISHED_AT = "2026-08-27T00:00:00.000Z";
const UUID_NAMESPACE = Buffer.from("71c43924848d58c8b2c0b0c51d7688eb", "hex");

const definitions = {
  neon: {
    database: "athyper_neon",
    confirmation: "LOCAL-NEON-CURRENCY-RUNTIME",
    publicationKey: "metadata.entity.currency",
    entityCode: "currency",
    permissionCode: "neon.reference.currency.read",
    storage: { schema: "shared", object: "currency", idField: "id", statusField: "status" },
    fields: [
      field("id", "uuid", true, false, false, { label: "Currency ID", defaultVisible: false, defaultOrder: 90, defaultWidth: 300 }),
      field("code", "string", true, true, true, { label: "Code", semanticRole: "identity", defaultVisible: true, defaultOrder: 0, defaultWidth: 110 }),
      field("name", "string", true, true, true, { label: "Name", defaultVisible: true, defaultOrder: 1, defaultWidth: 260 }),
      field("symbol", "string", false, true, true, { label: "Symbol", defaultVisible: true, defaultOrder: 2, defaultWidth: 100 }),
      field("numeric3", "string", false, true, true, { label: "Numeric code", defaultVisible: true, defaultOrder: 3, defaultWidth: 140 }),
      field("minor_units", "integer", false, true, true, { label: "Minor units", defaultVisible: true, defaultOrder: 4, defaultWidth: 130 }),
      field("status", "enum", true, true, true, { label: "Status", semanticRole: "status", defaultVisible: true, defaultOrder: 5, defaultWidth: 130, groupable: true }),
    ],
    listPresentation: { schemaVersion: 1, title: "Currencies", description: "Shared reference currencies available to the current Neon context.", identityField: "code", defaultState: { filters: [], sort: [{ field: "code", direction: "asc" }], columns: ["code", "name", "symbol", "numeric3", "minor_units", "status"], density: "comfortable", mode: "table" }, supportedModes: ["table", "compact"], search: { minimumQueryLength: 1 }, filterPresentation: { quickFields: [{ field: "status", defaultOperator: "eq" }, { field: "code", defaultOperator: "starts_with" }], allowUserPinning: true }, limits: { defaultPageSize: 25, allowedPageSizes: [10, 25, 50, 100], maxSortLevels: 3, countMode: "exact" } },
    scopeBinding: { scopeKind: "tenant", coordinateSource: "tenant_context", coordinateKey: null, resolverKey: null },
  },
  mesh: {
    database: "athyper_mesh",
    confirmation: "LOCAL-MESH-NETWORK-RELATIONSHIP-RUNTIME",
    publicationKey: "metadata.entity.network_relationship",
    entityCode: "network_relationship",
    permissionCode: "mesh.catalog.network_relationship.read",
    importPermissionCode:"mesh.catalog.network_relationship.request",
    importAdapterKey:"mesh.network_relationship.request.v1",
    storage: { schema: "mesh", object: "network_relationship", idField: "id", statusField: "status" },
    fields: [
      field("id", "uuid", true, true, true, { label: "Relationship ID", semanticRole: "identity", defaultVisible: true, defaultOrder: 0, defaultWidth: 300 }),
      field("buyer_account_id", "uuid", true, true, true, { label: "Buyer account", semanticRole: "reference", defaultVisible: true, defaultOrder: 1, defaultWidth: 300 }),
      field("supplier_account_id", "uuid", true, true, true, { label: "Supplier account", semanticRole: "reference", defaultVisible: true, defaultOrder: 2, defaultWidth: 300 }),
      field("relationship_kind", "string", true, true, true, { label: "Relationship kind", defaultVisible: true, defaultOrder: 3, defaultWidth: 170, groupable: true }),
      field("status", "enum", true, true, true, { label: "Status", semanticRole: "status", defaultVisible: true, defaultOrder: 4, defaultWidth: 140, groupable: true }),
      field("effective_from", "date", false, true, true, { label: "Effective from", defaultVisible: true, defaultOrder: 5, defaultWidth: 160 }),
      field("effective_until", "date", false, true, true, { label: "Effective until", defaultVisible: false, defaultOrder: 6, defaultWidth: 160 }),
      field("created_at", "datetime", true, true, true, { label: "Created", defaultVisible: false, defaultOrder: 7, defaultWidth: 190 }),
      field("updated_at", "datetime", false, true, true, { label: "Updated", semanticRole: "updated_at", defaultVisible: true, defaultOrder: 8, defaultWidth: 190 }),
      field("buyer_tenant_id", "uuid", true, false, false, { label: "Buyer tenant", defaultVisible: false, defaultOrder: 20 }),
      field("supplier_tenant_id", "uuid", true, false, false, { label: "Supplier tenant", defaultVisible: false, defaultOrder: 21 }),
    ],
    listPresentation: { schemaVersion: 1, title: "Network Relationships", description: "Buyer and supplier relationships visible to the selected acting account.", identityField: "id", defaultState: { filters: [], sort: [{ field: "updated_at", direction: "desc", nulls: "last" }], columns: ["id", "buyer_account_id", "supplier_account_id", "relationship_kind", "status", "effective_from", "updated_at"], density: "comfortable", mode: "table" }, supportedModes: ["table", "compact"], search: { minimumQueryLength: 1 }, filterPresentation: { quickFields: [{ field: "status", defaultOperator: "eq" }, { field: "relationship_kind", defaultOperator: "contains" }, { field: "effective_from", defaultOperator: "relative" }, { field: "updated_at", defaultOperator: "relative" }], allowUserPinning: true }, limits: { defaultPageSize: 10, allowedPageSizes: [10, 25, 50, 100], maxSortLevels: 3, countMode: "exact" } },
    scopeBinding: { scopeKind: "network_account", coordinateSource: "relation_resolver", coordinateKey: null, resolverKey: "mesh.network_relationship.actor_account.v1" },
  },
  studio: {
    database: "athyper_studio",
    confirmation: "LOCAL-STUDIO-METADATA-ENTITY-RUNTIME",
    publicationKey: "metadata.entity.metadata_entity",
    entityCode: "metadata_entity",
    permissionCode: "studio.metadata.contract.view",
    importPermissionCode:"studio.metadata.contract.import",
    importAdapterKey:"studio.metadata_entity.draft.v1",
    storage: { schema: "metadata", object: "entity", idField: "id", statusField: "status" },
    fields: [
      field("id", "uuid", true, true, true, { label: "Entity ID", defaultVisible: false, defaultOrder: 90, defaultWidth: 300 }),
      field("entity_code", "string", true, true, true, { label: "Entity code", semanticRole: "identity", defaultVisible: true, defaultOrder: 0, defaultWidth: 240 }),
      field("entity_class", "enum", true, true, true, { label: "Class", defaultVisible: true, defaultOrder: 1, defaultWidth: 170, groupable: true }),
      field("ownership_model", "enum", true, true, true, { label: "Ownership", defaultVisible: true, defaultOrder: 2, defaultWidth: 160, groupable: true }),
      field("status", "enum", true, true, true, { label: "Status", semanticRole: "status", defaultVisible: true, defaultOrder: 3, defaultWidth: 130, groupable: true }),
      field("created_at", "datetime", true, true, true, { label: "Created", defaultVisible: true, defaultOrder: 4, defaultWidth: 190 }),
      field("updated_at", "datetime", false, true, true, { label: "Updated", semanticRole: "updated_at", defaultVisible: true, defaultOrder: 5, defaultWidth: 190 }),
      field("tenant_id", "uuid", false, false, false, { label: "Tenant", defaultVisible: false, defaultOrder: 20 }),
      field("module_id", "uuid", true, false, false, { label: "Module", defaultVisible: false, defaultOrder: 21 }),
    ],
    listPresentation: { schemaVersion: 1, title: "Entity Catalog", description: "Governed system and tenant Entity identities available to this Studio context.", identityField: "entity_code", defaultState: { filters: [], sort: [{ field: "entity_code", direction: "asc" }], columns: ["entity_code", "entity_class", "ownership_model", "status", "created_at", "updated_at"], density: "comfortable", mode: "table" }, supportedModes: ["table", "compact"], search: { minimumQueryLength: 1 }, filterPresentation: { quickFields: [{ field: "status", defaultOperator: "eq" }, { field: "entity_class", defaultOperator: "eq" }, { field: "ownership_model", defaultOperator: "eq" }, { field: "updated_at", defaultOperator: "relative" }], allowUserPinning: true }, limits: { defaultPageSize: 10, allowedPageSizes: [10, 25, 50, 100], maxSortLevels: 3, countMode: "exact" } },
    scopeBinding: { scopeKind: "tenant", coordinateSource: "tenant_context", coordinateKey: null, resolverKey: null },
  },
} as const;

export function buildDevelopmentPhase1ListProjection(plane: Plane, permissionId: string, permissionKind: "entity_operation" | "system_action" = "entity_operation") {
  const definition = definitions[plane], releaseNo = plane === "neon" ? 1 : 5, sourceVersion = plane === "neon" ? "development-v1" : "development-v5", supportsDataOperations = plane !== "neon";
  const entityId = deterministicUuid(`${definition.publicationKey}:entity`), releaseId = deterministicUuid(`${definition.publicationKey}:${sourceVersion}:release`), revisionId = deterministicUuid(`${definition.publicationKey}:${sourceVersion}:revision`), contractId = deterministicUuid(`${definition.publicationKey}:${sourceVersion}:contract`), descriptorId = deterministicUuid(`${definition.publicationKey}:${sourceVersion}:descriptor:${plane}`), deploymentId = deterministicUuid(`${definition.publicationKey}:${sourceVersion}:deployment:${plane}`), operationId = deterministicUuid(`${definition.publicationKey}:operation:read`), bindingId = deterministicUuid(`${definition.publicationKey}:${releaseId}:binding:read`), scopeBindingId = deterministicUuid(`${definition.publicationKey}:${releaseId}:scope:read`);
  const contract = { schema: "athyper.meta-entity-contract/2.1", entity: { entityCode: definition.entityCode, entityClass: plane === "studio" ? "metadata" : plane === "neon" ? "reference" : "business" }, runtime: { plane, backingKind: "table", readMode: "cursor", writeMode: "governed_adapter" }, storage: { schema: definition.storage.schema, object: definition.storage.object }, operations: [{ code: "read", permissionCode: definition.permissionCode }, ...(supportsDataOperations ? [{code:"export",permissionCode:definition.permissionCode},{code:"import",permissionCode:definition.permissionCode}] : [])] };
  const contractHash = sha256(contract);
  const descriptor = { schema: "athyper.entity-runtime-descriptor/1.0", entityCode: definition.entityCode, planeKey: plane, storage: definition.storage, fields: definition.fields, listPresentation: {...definition.listPresentation,...(supportsDataOperations ? {dataOperations:{exportFormats:["xlsx","csv","json","ndjson"],importAdapterKey:(definition as typeof definitions.mesh | typeof definitions.studio).importAdapterKey,importOperations:plane==="mesh"?["create","update","upsert","delete","replace"]:["create","update","upsert","replace"],importOperationPermissions:Object.fromEntries((plane==="mesh"?["create","update","upsert","delete","replace"]:["create","update","upsert","replace"]).map(mode=>[mode,[(definition as typeof definitions.mesh | typeof definitions.studio).importPermissionCode]])),importFormats:["xlsx","csv","json"],importMaxRows:plane==="mesh"?50000:1000,importMaxFileBytes:26214400,allowTemplateDownload:true,draftOnly:plane==="studio"}} : {})}, operations: { read: { code: "read", permissionCode: definition.permissionCode }, ...(supportsDataOperations ? {export:{code:"export",permissionCode:definition.permissionCode},import:{code:"import",permissionCode:definition.permissionCode}} : {}) }, source: { entity_id: entityId, release_hash: contractHash }, operation_scope_bindings: [{ bindingId, scopeBindingId, sourceEntityOperationId: operationId, entityCode: definition.entityCode, operationKey: "read", permissionId, permissionCode: definition.permissionCode, permissionKind, decisionMode: "collection", scopeKind: definition.scopeBinding.scopeKind, coordinateSource: definition.scopeBinding.coordinateSource, coordinateKey: definition.scopeBinding.coordinateKey, resolverKey: definition.scopeBinding.resolverKey }] };
  const compiledHash = sha256(descriptor), manifest = { schema: "athyper.development-runtime-publication/1.0", sourceVersion, publicationKey: definition.publicationKey, releaseId, releaseNo, targetPlane: plane, contractHash, compiledHash }, artifactHash = sha256({ manifest, contract, descriptor });
  return { definition, publicationKey: definition.publicationKey, releaseId, releaseNo, deploymentId, artifactHash, manifest, projection: { contract: { id: contractId, tenant_id: null, entity_id: entityId, entity_code: definition.entityCode, release_id: releaseId, revision_id: revisionId, release_no: releaseNo, contract_schema_code: "athyper.meta-entity-contract", contract_schema_version: "2.1", contract_hash: contractHash, contract_json: contract, publication_key: definition.publicationKey, signature_algorithm: "development-local-sha256", signing_key_id: "local-development-runtime-bootstrap", signature: sha256({ contractHash, releaseId, targetPlane: plane }), published_at: PUBLISHED_AT }, descriptor: { id: descriptorId, plane_code: plane, descriptor_kind: "entity_runtime", descriptor_schema_version: "1.0.0", source_contract_hash: contractHash, compiled_hash: compiledHash, compiled_json: descriptor, compiler_version: "athyper.development-phase1-list-runtime/1.0.0", compatibility_level: "backward_compatible", generated_at: PUBLISHED_AT } }, verification: { signature_verified: true, manifest_valid: true, runtime_compatible: true, target_plane: plane, contract_hash: contractHash, descriptor_source_hash: contractHash, contract_schema_version: "2.1", descriptor_schema_version: "1.0.0", signature_algorithm: "development-local-sha256", signing_key_id: "local-development-runtime-bootstrap" } } as const;
}

export async function provisionDevelopmentPhase1ListRuntime(options: { plane: Plane; databaseUrl: string; confirmation?: string; dryRun?: boolean }) {
  const definition = definitions[options.plane], url = new URL(options.databaseUrl);
  if (!localDatabase(url) || url.pathname !== `/${definition.database}`) throw new Error(`development ${options.plane} list publication requires local ${definition.database}`);
  if (!options.dryRun && options.confirmation !== definition.confirmation) throw new Error(`apply requires --confirm=${definition.confirmation}`);
  if (options.plane === "studio") return { mode: "code_registered_adapter", plane: "studio", entityCode: definition.entityCode, permissionCode: definition.permissionCode, source: "@athyper/server-plane-studio/catalog-metadata-reader" } as const;
  const client = new Client({ connectionString: options.databaseUrl }); await client.connect();
  try {
    const permission = await one<{ id: string; permission_kind: "entity_operation" | "system_action" }>(client, "SELECT id::text AS id,permission_kind::text FROM authz.permission WHERE canonical_code=$1 AND permission_kind IN ('entity_operation','system_action') AND status='published'", [definition.permissionCode]);
    if (options.plane !== "neon") await one<{ id:string }>(client,"SELECT id::text AS id FROM authz.permission WHERE canonical_code=$1 AND permission_kind IN ('entity_operation','system_action') AND status='published'",[(definition as typeof definitions.mesh | typeof definitions.studio).importPermissionCode]);
    const artifact = buildDevelopmentPhase1ListProjection(options.plane, permission.id, permission.permission_kind);
    if (options.dryRun) return { mode: "planned", plane: options.plane, publicationKey: artifact.publicationKey, releaseId: artifact.releaseId, artifactHash: artifact.artifactHash, compiledHash: artifact.projection.descriptor.compiled_hash };
    await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [artifact.publicationKey]); await client.query("SELECT set_config('app.database_plane',$1,true),set_config('app.current_principal_id','00000000-0000-0000-0000-000000000000',true)", [options.plane]);
    const staged = await one<{ id: string; status: string }>(client, "SELECT id::text,status FROM runtime_meta.fn_stage_release_projection($1,$2::uuid,$3,$4::uuid,$5,$6::jsonb,$7::jsonb)", [artifact.publicationKey, artifact.releaseId, artifact.releaseNo, artifact.deploymentId, artifact.artifactHash, JSON.stringify(artifact.manifest), JSON.stringify(artifact.projection)]);
    if (staged.status !== "active") { const verified = await one<{ status: string; failure_code: string | null }>(client, "SELECT status,failure_code FROM runtime_meta.fn_verify_release($1::uuid,$2,$3::jsonb)", [staged.id, artifact.artifactHash, JSON.stringify(artifact.verification)]); if (verified.status !== "verified") throw new Error(`runtime verification failed: ${verified.failure_code ?? verified.status}`); await client.query("SELECT runtime_meta.fn_activate_release($1::uuid,$2::jsonb)", [staged.id, JSON.stringify({ source: "local-development-bootstrap", plane: options.plane })]); }
    await client.query("COMMIT"); return { mode: "applied", plane: options.plane, publicationKey: artifact.publicationKey, releaseId: artifact.releaseId, appliedReleaseId: staged.id, artifactHash: artifact.artifactHash, compiledHash: artifact.projection.descriptor.compiled_hash };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { await client.end(); }
}

function field(key: string, type: string, required: boolean, filterable: boolean, sortable: boolean, list: Readonly<Record<string, unknown>>) { const meshWritable=new Set(["buyer_tenant_id","buyer_account_id","supplier_tenant_id","supplier_account_id","relationship_kind","effective_from","effective_until"]);return { key, storagePath: key, type, required, writableOn: meshWritable.has(key)?["create","patch"]:[], filterable, sortable, searchable: ["entity_code", "relationship_kind", "code", "name"].includes(key), list }; }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`; return JSON.stringify(value); }
function sha256(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
function deterministicUuid(name: string): string { const bytes=createHash("sha1").update(UUID_NAMESPACE).update(name).digest().subarray(0,16);bytes[6]=(bytes[6]!&15)|80;bytes[8]=(bytes[8]!&63)|128;const hex=bytes.toString("hex");return`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; }
function localDatabase(url: URL): boolean { if (["localhost","127.0.0.1","::1"].includes(url.hostname)) return true;const octets=url.hostname.split(".").map(Number);return octets.length===4&&octets.every((octet)=>Number.isInteger(octet)&&octet>=0&&octet<=255)&&(octets[0]===10||(octets[0]===172&&octets[1]!>=16&&octets[1]!<=31)||(octets[0]===192&&octets[1]===168)); }
async function one<T extends object>(client: QueryClient, statement: string, values: unknown[]=[]): Promise<T> { const result=await client.query<T>(statement,values);if(result.rows.length!==1)throw new Error(`expected one row, received ${result.rows.length}`);return result.rows[0]!; }
function option(args: readonly string[], name: string): string|undefined { const equal=args.find((item)=>item.startsWith(`${name}=`));if(equal)return equal.slice(name.length+1);const index=args.indexOf(name);return index<0?undefined:args[index+1]; }
async function main(): Promise<void> { const args=process.argv.slice(2),plane=option(args,"--plane");if(plane!=="neon"&&plane!=="mesh"&&plane!=="studio")throw new Error("--plane must be neon, mesh or studio");const databaseUrl=option(args,"--database-url")??process.env[plane==="neon"?"ATHYPER_NEON_DATABASE_ADMIN_URL":plane==="mesh"?"ATHYPER_MESH_DATABASE_ADMIN_URL":"ATHYPER_STUDIO_DATABASE_ADMIN_URL"];if(!databaseUrl)throw new Error(`set the ${plane} database URL or --database-url`);const result=await provisionDevelopmentPhase1ListRuntime({plane,databaseUrl,confirmation:option(args,"--confirm"),dryRun:args.includes("--plan")||args.includes("--dry-run")});process.stdout.write(`${JSON.stringify(result,null,2)}\n`); }
if(import.meta.url===pathToFileURL(process.argv[1]??"").href)await main();
