#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { assertLoopbackDatabaseTarget } from "../lib/database-target.js";

const CONFIRMATION = "LOAD-BS360-ACCEPTANCE-FIXTURES";
const PACK = "business-partner-360.acceptance.v1";
const NAMESPACE = "athyper:business-partner-360:acceptance:v1:";
const FAMILIES = Object.freeze(["organization", "supplier", "customer", "dual_role", "mesh_linked"] as const);
type Family = (typeof FAMILIES)[number];

export async function provisionBusinessPartner360AcceptanceFixtures(options: { readonly neonDatabaseUrl: string; readonly meshDatabaseUrl: string; readonly confirmation?: string; readonly dryRun?: boolean }) {
  for (const [value, database] of [[options.neonDatabaseUrl, "athyper_neon"], [options.meshDatabaseUrl, "athyper_mesh"]] as const) assertLocalDatabase(value, database);
  const definitions = FAMILIES.map((family) => Object.freeze({ family, businessPartnerId: id(`business-partner:${family}`), code: `BS360-${family.replaceAll("_", "-").toUpperCase()}` }));
  if (options.dryRun) return Object.freeze({ mode: "planned", pack: PACK, families: definitions });
  if (options.confirmation !== CONFIRMATION) throw new Error(`apply requires --confirm=${CONFIRMATION}`);
  const neon = new Client({ connectionString: options.neonDatabaseUrl, application_name: "bs360-acceptance-fixtures" });
  const mesh = new Client({ connectionString: options.meshDatabaseUrl, application_name: "bs360-acceptance-fixtures-coordinate-read" });
  await Promise.all([neon.connect(), mesh.connect()]);
  try {
    const relationship = await one<{ relationshipId: string; recipientTenantId: string; recipientAccountId: string; sourceTenantId: string; sourceAccountId: string }>(mesh, `
      SELECT relationship.id::text AS "relationshipId",relationship.buyer_tenant_id::text AS "recipientTenantId",
             relationship.buyer_account_id::text AS "recipientAccountId",relationship.supplier_tenant_id::text AS "sourceTenantId",
             relationship.supplier_account_id::text AS "sourceAccountId"
      FROM mesh.network_relationship relationship
      WHERE relationship.buyer_tenant_id='11111111-1111-4111-8111-111111111111'::uuid
      ORDER BY relationship.id LIMIT 1`);
    await neon.query("BEGIN");
    await neon.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0)),set_config('app.database_plane','neon',true)", [PACK]);
    const context = await one<{ tenantId: string; actorId: string; reviewerId: string; organizationId: string; customerOrganizationId: string; companyCodeId: string; legalEntityId: string }>(neon, `
      SELECT tenant.id::text AS "tenantId",actor.id::text AS "actorId",reviewer.id::text AS "reviewerId",
             organization.id::text AS "organizationId",customer_organization.id::text AS "customerOrganizationId",company.id::text AS "companyCodeId",company.legal_entity_id::text AS "legalEntityId"
      FROM master.tenant tenant
      JOIN master.principal actor ON actor.tenant_id=tenant.id AND actor.code='athyper.admin' AND actor.status='active'
      JOIN master.principal reviewer ON reviewer.tenant_id=tenant.id AND reviewer.code='athyper.owner' AND reviewer.status='active'
      JOIN master.operating_organization organization ON organization.tenant_id=tenant.id AND organization.code='athyper.procurement.apac' AND organization.status='active'
      JOIN master.operating_organization customer_organization ON customer_organization.tenant_id=tenant.id AND customer_organization.code='athyper.shared-services' AND customer_organization.status='active'
      JOIN master.operating_organization_company_assignment assignment ON assignment.tenant_id=organization.tenant_id AND assignment.operating_organization_id=organization.id AND assignment.status='active'
      JOIN master.company_code company ON company.tenant_id=assignment.tenant_id AND company.id=assignment.company_code_id AND company.code='aitm'
      WHERE tenant.code='athyper' AND tenant.status='active'`);
    if (relationship.recipientTenantId !== context.tenantId) throw new Error("MESH relationship recipient does not match the NEON fixture tenant");
    await neon.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)", [context.tenantId, context.actorId]);
    await neon.query("UPDATE master.operating_organization SET domain='both',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND domain='shared_services'", [context.tenantId, context.customerOrganizationId, context.actorId]);
    const metadata = (family: Family) => JSON.stringify({ _seed: { pack: PACK, version: "1.0.0" }, environment: "disposable_local", acceptanceFamily: family });
    for (const definition of definitions) {
      await neon.query(`INSERT INTO master.business_partner(id,tenant_id,code,name,partner_category,category_locked_by,registration_country_code,metadata,status,created_by)
        VALUES($1::uuid,$2::uuid,$3,$4,'organization',$6::uuid,'MY',$5::jsonb,'active',$6::uuid)
        ON CONFLICT(tenant_id,id) DO NOTHING`, [definition.businessPartnerId, context.tenantId, definition.code, `${definition.family.replaceAll("_", " ")} acceptance fixture`, metadata(definition.family), context.actorId]);
    }
    const byFamily = new Map(definitions.map((value) => [value.family, value]));
    for (const family of ["supplier", "dual_role", "mesh_linked"] as const) await role(neon, context, byFamily.get(family)!, "supplier", metadata(family));
    for (const family of ["customer", "dual_role"] as const) await role(neon, context, byFamily.get(family)!, "customer", metadata(family));
    await meshLink(neon, context, byFamily.get("mesh_linked")!, relationship);
    const rows = await neon.query<{ family: Family; businessPartnerId: string; supplier: boolean; customer: boolean; meshLinked: boolean }>(`
      SELECT partner.metadata->>'acceptanceFamily' AS family,partner.id::text AS "businessPartnerId",
             EXISTS(SELECT 1 FROM master.supplier value WHERE value.tenant_id=partner.tenant_id AND value.business_partner_id=partner.id) supplier,
             EXISTS(SELECT 1 FROM master.customer value WHERE value.tenant_id=partner.tenant_id AND value.business_partner_id=partner.id) customer,
             EXISTS(SELECT 1 FROM control.mesh_business_partner_account_link value WHERE value.tenant_id=partner.tenant_id AND value.business_partner_id=partner.id) AS "meshLinked"
      FROM master.business_partner partner WHERE partner.tenant_id=$1::uuid AND partner.metadata->'_seed'->>'pack'=$2 ORDER BY family`, [context.tenantId, PACK]);
    if (rows.rows.length !== FAMILIES.length || FAMILIES.some((family) => !rows.rows.some((row) => row.family === family))) throw new Error("acceptance fixture family coverage is incomplete");
    await neon.query("COMMIT");
    return Object.freeze({ mode: "applied", pack: PACK, tenantId: context.tenantId, families: Object.freeze(rows.rows) });
  } catch (error) { await neon.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { await Promise.all([neon.end(), mesh.end()]); }
}

async function role(client: Client, context: Context, fixture: Fixture, kind: "supplier" | "customer", metadata: string) {
  const roleId = id(`${kind}:${fixture.family}`), roleCode = `BS360-${kind.toUpperCase()}-${fixture.family.replaceAll("_", "-").toUpperCase()}`;
  if (kind === "supplier") await client.query("INSERT INTO master.supplier(id,tenant_id,business_partner_id,supplier_code,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb,'active',$6::uuid) ON CONFLICT(tenant_id,id) DO NOTHING", [roleId, context.tenantId, fixture.businessPartnerId, roleCode, metadata, context.actorId]);
  else await client.query("INSERT INTO master.customer(id,tenant_id,business_partner_id,customer_code,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb,'active',$6::uuid) ON CONFLICT(tenant_id,id) DO NOTHING", [roleId, context.tenantId, fixture.businessPartnerId, roleCode, metadata, context.actorId]);
  await client.query("INSERT INTO master.business_partner_operating_organization_assignment(id,tenant_id,business_partner_id,operating_organization_id,partner_role,effective_from,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'2026-01-01',$6::jsonb,'active',$7::uuid) ON CONFLICT(tenant_id,id) DO NOTHING", [id(`assignment:${fixture.family}:${kind}`), context.tenantId, fixture.businessPartnerId, kind === "customer" ? context.customerOrganizationId : context.organizationId, kind, metadata, context.actorId]);
}
async function meshLink(client: Client, context: Context, fixture: Fixture, relationship: Relationship) {
  const inboxId = id("mesh:inbox"), eventId = id("mesh:event"), publicationId = id("mesh:publication"), snapshotId = id("mesh:snapshot"), projectionId = id("mesh:projection"), payload = { partner: { accountCode: "dev-supplier-catl-002", displayName: "MESH Linked Acceptance", legalName: "MESH Linked Acceptance Limited", countryCode: "GB" } }, envelope = { fixture: PACK, payload }, payloadHash = hash(JSON.stringify(payload)), envelopeHash = hash(JSON.stringify(envelope));
  await client.query("INSERT INTO control.mesh_business_partner_profile_inbox(id,tenant_id,event_id,event_type,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,publication_id,publication_version,lifecycle_version,schema_code,schema_version,field_set_code,payload_hash,envelope_json,envelope_hash,occurred_at,received_by) VALUES($1::uuid,$2::uuid,$3::uuid,'business_partner.profile_publication.published',$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::uuid,1,1,'mesh.business_partner_profile',1,'recipient_safe_v1',$9,$10::jsonb,$11,'2026-08-30T00:00:00Z',$12::uuid) ON CONFLICT(tenant_id,event_id) DO NOTHING", [inboxId, context.tenantId, eventId, relationship.sourceTenantId, relationship.sourceAccountId, relationship.recipientAccountId, relationship.relationshipId, publicationId, payloadHash, JSON.stringify(envelope), envelopeHash, context.actorId]);
  await client.query("INSERT INTO snapshot.mesh_business_partner_profile_received(id,tenant_id,inbox_event_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,publication_id,publication_version,schema_code,schema_version,field_set_code,payload_json,payload_hash,received_at,received_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::uuid,1,'mesh.business_partner_profile',1,'recipient_safe_v1',$9::jsonb,$10,'2026-08-30T00:00:01Z',$11::uuid) ON CONFLICT(tenant_id,id) DO NOTHING", [snapshotId, context.tenantId, inboxId, relationship.sourceTenantId, relationship.sourceAccountId, relationship.recipientAccountId, relationship.relationshipId, publicationId, JSON.stringify(payload), payloadHash, context.actorId]);
  await client.query("INSERT INTO control.mesh_business_partner_profile_projection(id,tenant_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,current_publication_id,current_publication_version,current_lifecycle_version,current_snapshot_id,last_inbox_event_id,projection_status,updated_at,updated_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,1,1,$8::uuid,$9::uuid,'active','2026-08-30T00:00:02Z',$10::uuid) ON CONFLICT(tenant_id,id) DO NOTHING", [projectionId, context.tenantId, relationship.sourceTenantId, relationship.sourceAccountId, relationship.recipientAccountId, relationship.relationshipId, publicationId, snapshotId, inboxId, context.actorId]);
  await client.query("INSERT INTO control.mesh_business_partner_account_link(id,tenant_id,profile_projection_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,business_partner_id,proposed_role,idempotency_key,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::uuid,'supplier','bs360-acceptance-mesh-link','pending_approval',$9::uuid) ON CONFLICT(tenant_id,id) DO NOTHING", [id("mesh:account-link"), context.tenantId, projectionId, relationship.sourceTenantId, relationship.sourceAccountId, relationship.recipientAccountId, relationship.relationshipId, fixture.businessPartnerId, context.actorId]);
}

type Fixture = Readonly<{ family: Family; businessPartnerId: string; code: string }>;
type Context = Readonly<{ tenantId: string; actorId: string; reviewerId: string; organizationId: string; customerOrganizationId: string; companyCodeId: string; legalEntityId: string }>;
type Relationship = Readonly<{ relationshipId: string; recipientTenantId: string; recipientAccountId: string; sourceTenantId: string; sourceAccountId: string }>;
function id(value: string) { const bytes = createHash("sha1").update(NAMESPACE).update(value).digest().subarray(0, 16); bytes[6] = (bytes[6]! & 15) | 80; bytes[8] = (bytes[8]! & 63) | 128; const valueHex = bytes.toString("hex"); return `${valueHex.slice(0, 8)}-${valueHex.slice(8, 12)}-${valueHex.slice(12, 16)}-${valueHex.slice(16, 20)}-${valueHex.slice(20)}`; }
function hash(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function assertLocalDatabase(value: string, database: string) { assertLoopbackDatabaseTarget(value, database); }
async function one<T extends object>(client: Pick<Client, "query">, statement: string, values: unknown[] = []) { const result = await client.query<T>(statement, values); if (result.rows.length !== 1) throw new Error(`expected one row, received ${result.rows.length}`); return result.rows[0]!; }
function option(args: readonly string[], name: string) { return args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1); }
async function main() { const args = process.argv.slice(2), neonDatabaseUrl = option(args, "--neon-database-url"), meshDatabaseUrl = option(args, "--mesh-database-url"); if (!neonDatabaseUrl || !meshDatabaseUrl) throw new Error("--neon-database-url and --mesh-database-url are required"); process.stdout.write(`${JSON.stringify(await provisionBusinessPartner360AcceptanceFixtures({ neonDatabaseUrl, meshDatabaseUrl, confirmation: option(args, "--confirm"), dryRun: args.includes("--plan") }), null, 2)}\n`); }
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
