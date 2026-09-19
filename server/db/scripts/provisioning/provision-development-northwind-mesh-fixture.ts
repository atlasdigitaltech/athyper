#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { Client } from "pg";

import { deterministicUuid } from "./three-plane-model.js";

const CONFIRMATION = "LOCAL-MESH-NORTHWIND-FIXTURE";
const SOURCE_REF = "development.mesh-northwind-profile.v1";
const ATHYPER_TENANT_ID = "11111111-1111-4111-8111-111111111111";
const CIRRUSATLANTIC_TENANT_ID = "44444444-4444-4444-8444-444444444444";
const ACCOUNT_CODE = "dev-northwind-supplies";
const BUYER_ACCOUNT_CODE = "bna-1000000022";
const BANK_ACCOUNT_CODE = "northwind.settlement.gb";
const BANK_SECRET_REFERENCE = "infisical:dev/mesh/northwind/settlement-account";
const PERMISSIONS = [
  "mesh.catalog.network_account.read",
  "mesh.catalog.network_relationship.read",
  "mesh.business_partner_profile.publish",
  "mesh.business_partner_profile.read",
] as const;

type QueryClient = Pick<Client, "query">;

export async function provisionDevelopmentNorthwindMeshFixture(options: {
  databaseUrl: string;
  confirmation?: string;
  dryRun?: boolean;
}): Promise<unknown> {
  const url = new URL(options.databaseUrl);
  if (!localDatabase(url) || url.pathname !== "/athyper_mesh")
    throw new Error("Northwind MESH fixture requires local athyper_mesh");
  if (options.dryRun)
    return {
      mode: "planned",
      accountCode: ACCOUNT_CODE,
      buyerAccountCode: BUYER_ACCOUNT_CODE,
      bankAccountCode: BANK_ACCOUNT_CODE,
      permissions: [...PERMISSIONS, "mesh.bank_disclosure.request", "mesh.bank_disclosure.decide", "mesh.bank_disclosure.read"],
    };
  if (options.confirmation !== CONFIRMATION)
    throw new Error(`apply requires --confirm=${CONFIRMATION}`);

  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0)),set_config('app.database_plane','mesh',true)",
      [SOURCE_REF],
    );
    const producer = await principal(client, ATHYPER_TENANT_ID, "athyper.admin");
    const verifier = await principal(client, ATHYPER_TENANT_ID, "athyper.owner");
    const recipient = await principal(client, CIRRUSATLANTIC_TENANT_ID, "catl.owner");
    const buyer = await one<{ id: string }>(
      client,
      "SELECT id::text FROM mesh.network_account WHERE tenant_id=$1::uuid AND account_code=$2 AND status='active'",
      [CIRRUSATLANTIC_TENANT_ID, BUYER_ACCOUNT_CODE],
    );
    const accountId = deterministicUuid("mesh", ATHYPER_TENANT_ID, SOURCE_REF, "account");
    const profileId = deterministicUuid("mesh", ATHYPER_TENANT_ID, SOURCE_REF, "profile");
    const bankAccountId = deterministicUuid("mesh", ATHYPER_TENANT_ID, SOURCE_REF, "bank-account");
    const bankAccountLinkId = deterministicUuid("mesh", ATHYPER_TENANT_ID, SOURCE_REF, "bank-account-link");
    const metadata = JSON.stringify({
      _seed: { pack: SOURCE_REF, environment: "disposable_local" },
      neonBusinessPartnerId: "f7688c3d-8c92-5651-a469-da3f4f786375",
      neonBusinessPartnerCode: "CATL-BP-001",
    });
    await actor(client, ATHYPER_TENANT_ID, producer.id, accountId);
    await client.query(
      `INSERT INTO mesh.network_account(id,tenant_id,account_code,display_name,legal_name,network_role,country_code,default_currency,capabilities,metadata,status,created_by)
       VALUES($1::uuid,$2::uuid,$3,'Northwind Supplies','Northwind Industrial Supplies Ltd','supplier','GB','GBP','{"supplierProfile":true}'::jsonb,$4::jsonb,'active',$5::uuid)
       ON CONFLICT(account_code) DO NOTHING`,
      [accountId, ATHYPER_TENANT_ID, ACCOUNT_CODE, metadata, producer.id],
    );
    const account = await one<{ id: string }>(
      client,
      "SELECT id::text FROM mesh.network_account WHERE tenant_id=$1::uuid AND account_code=$2 AND status='active'",
      [ATHYPER_TENANT_ID, ACCOUNT_CODE],
    );
    if (account.id !== accountId) throw new Error("Northwind MESH account conflicts with an unmanaged account");
    await client.query(
      `INSERT INTO mesh.network_account_profile(id,tenant_id,network_account_id,legal_form,incorporation_date,website_url,description,preferred_language_code,profile_completeness_pct,metadata,status,created_by)
       VALUES($1::uuid,$2::uuid,$3::uuid,'private_limited','2008-04-15','https://northwind.example.test','Industrial components and maintenance supplies','en',100,$4::jsonb,'active',$5::uuid)
       ON CONFLICT(tenant_id,network_account_id) DO NOTHING`,
      [profileId, ATHYPER_TENANT_ID, accountId, metadata, producer.id],
    );
    const bankMetadata = JSON.stringify({
      _seed: { pack: SOURCE_REF, environment: "disposable_local", synthetic: true },
      sourceReference: BANK_SECRET_REFERENCE,
      verificationReference: "local-fixture:northwind-bank:independent-owner-verification:v1",
      provider: "development-fixture",
      labels: ["northwind", "settlement", "qualification"],
    });
    await client.query(
      `INSERT INTO mesh.bank_account(
         id,tenant_id,network_account_id,code,name,account_holder_name,account_id_type,
         protected_value_token,identifier_fingerprint,protection_key_version,account_last4,
         currency_code,bic_override,bank_name_override,bank_country_override,is_verified,
         verified_at,verified_by,verification_method,metadata,status,status_changed_at,
         status_changed_by,created_by)
       VALUES(
         $1::uuid,$2::uuid,$3::uuid,$4,'Northwind GBP Settlement',
         'Northwind Industrial Supplies Ltd','local',$5,$6,1,'0001','GBP',
         'NWTBGB2L','Northwind Test Bank','GB',true,clock_timestamp(),$7::uuid,
         'api_validation',$8::jsonb,'active',clock_timestamp(),$7::uuid,$9::uuid)
       ON CONFLICT(tenant_id,network_account_id,code) WHERE code IS NOT NULL DO NOTHING`,
      [
        bankAccountId,
        ATHYPER_TENANT_ID,
        accountId,
        BANK_ACCOUNT_CODE,
        BANK_SECRET_REFERENCE,
        createHash("sha256").update(`${ATHYPER_TENANT_ID}:${SOURCE_REF}:northwind-settlement-0001`).digest("hex"),
        verifier.id,
        bankMetadata,
        producer.id,
      ],
    );
    const bankAccount = await one<{ id: string }>(
      client,
      "SELECT id::text FROM mesh.bank_account WHERE tenant_id=$1::uuid AND network_account_id=$2::uuid AND code=$3 AND status='active' AND is_verified",
      [ATHYPER_TENANT_ID, accountId, BANK_ACCOUNT_CODE],
    );
    if (bankAccount.id !== bankAccountId) throw new Error("Northwind MESH bank account conflicts with an unmanaged account");
    await client.query(
      `INSERT INTO mesh.bank_account_link(
         id,tenant_id,network_account_id,bank_account_id,purpose,is_primary,effective_from,
         metadata,created_by)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'settlement',true,'2026-01-01',$5::jsonb,$6::uuid)
       ON CONFLICT(tenant_id,network_account_id,bank_account_id,purpose) WHERE effective_until IS NULL DO NOTHING`,
      [bankAccountLinkId, ATHYPER_TENANT_ID, accountId, bankAccountId, fixtureMetadata(), producer.id],
    );
    const requested = await one<{ relationship_id: string }>(
      client,
      `SELECT relationship_id::text FROM mesh.command_request_network_relationship(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,'commercial','2026-01-01',NULL,
        'Northwind development supplier relationship',$5,$6::uuid)`,
      [
        CIRRUSATLANTIC_TENANT_ID,
        buyer.id,
        ATHYPER_TENANT_ID,
        accountId,
        "northwind-cirrus-relationship-request-v1",
        producer.id,
      ],
    );
    await actor(client, CIRRUSATLANTIC_TENANT_ID, recipient.id, buyer.id);
    await client.query(
      "SELECT * FROM mesh.command_accept_network_relationship($1::uuid,1,'CirrusAtlantic accepts the Northwind development relationship',$2,$3::uuid)",
      [requested.relationship_id, "northwind-cirrus-relationship-accept-v1", recipient.id],
    );
    await grantFixtureAccess(client, producer.id, verifier.id, accountId, requested.relationship_id);
    await client.query("COMMIT");
    return {
      mode: "applied",
      producerUsername: "athyper.admin",
      accountId,
      accountCode: ACCOUNT_CODE,
      buyerAccountId: buyer.id,
      buyerAccountCode: BUYER_ACCOUNT_CODE,
      relationshipId: requested.relationship_id,
      relationshipStatus: "active",
      verifiedBankAccountId: bankAccountId,
      bankAccountLinkId,
      bankAccountCode: BANK_ACCOUNT_CODE,
      bankVerificationActor: "athyper.owner",
      secureRetrievalReference: BANK_SECRET_REFERENCE,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function grantFixtureAccess(
  client: QueryClient,
  producerPrincipalId: string,
  verifierPrincipalId: string,
  accountId: string,
  relationshipId: string,
): Promise<void> {
  const actorId = (await principal(client, ATHYPER_TENANT_ID, "seed.three-plane-provisioner")).id;
  await actor(client, ATHYPER_TENANT_ID, actorId, accountId);
  const tenantScope = await one<{ id: string }>(
    client,
    "SELECT id::text FROM authz.scope_target WHERE tenant_id=$1::uuid AND scope_kind='tenant' AND status='active'",
    [ATHYPER_TENANT_ID],
  );
  const accountScopeId = await scope(client, deterministicUuid("mesh", ATHYPER_TENANT_ID, SOURCE_REF, "account-scope"), "network_account", ACCOUNT_CODE, accountId, tenantScope.id, "Northwind Supplies", actorId);
  const relationshipScopeId = await scope(client, deterministicUuid("mesh", ATHYPER_TENANT_ID, SOURCE_REF, "relationship-scope"), "network_relationship", `network_relationship:${relationshipId}`, relationshipId, accountScopeId, "Northwind / CirrusAtlantic", actorId);

  const producerGroupCandidateId = deterministicUuid("mesh", ATHYPER_TENANT_ID, SOURCE_REF, "producer-group");
  const reviewerGroupCandidateId = deterministicUuid("mesh", ATHYPER_TENANT_ID, SOURCE_REF, "reviewer-group");
  const accountRoleId = await ensureRole(client, "account-reader", [
    "mesh.catalog.network_account.read",
    "mesh.catalog.network_relationship.read",
  ], actorId);
  const publicationRoleId = await ensureRole(client, "profile-publisher", [
    "mesh.catalog.network_relationship.read",
    "mesh.business_partner_profile.publish",
    "mesh.business_partner_profile.read",
  ], actorId);
  const disclosureRequesterRoleId = await ensureRole(client, "bank-disclosure-requester", [
    "mesh.catalog.network_relationship.read",
    "mesh.bank_disclosure.request",
    "mesh.bank_disclosure.read",
  ], actorId);
  const disclosureReviewerRoleId = await ensureRole(client, "bank-disclosure-reviewer", [
    "mesh.catalog.network_relationship.read",
    "mesh.bank_disclosure.decide",
    "mesh.bank_disclosure.read",
  ], actorId);
  for (const [groupId, code, name] of [
    [producerGroupCandidateId, "development.mesh.northwind.publishers", "Northwind Development Publishers"],
    [reviewerGroupCandidateId, "development.mesh.northwind.reviewers", "Northwind Development Reviewers"],
  ] as const) await client.query(
    `INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,metadata,status,created_by)
     VALUES($1::uuid,$2::uuid,$3,$4,'system','seed',$5,$6::jsonb,'active',$7::uuid)
     ON CONFLICT(tenant_id,code) DO NOTHING`,
    [groupId, ATHYPER_TENANT_ID, code, name, SOURCE_REF, fixtureMetadata(), actorId],
  );
  const producerGroupId = (await one<{ id: string }>(client,
    "SELECT id::text FROM authz.principal_group WHERE tenant_id=$1::uuid AND code='development.mesh.northwind.publishers' AND status='active'",
    [ATHYPER_TENANT_ID],
  )).id;
  const reviewerGroupId = (await one<{ id: string }>(client,
    "SELECT id::text FROM authz.principal_group WHERE tenant_id=$1::uuid AND code='development.mesh.northwind.reviewers' AND status='active'",
    [ATHYPER_TENANT_ID],
  )).id;
  for (const [groupId, principalId] of [
    [producerGroupId, producerPrincipalId],
    [reviewerGroupId, verifierPrincipalId],
  ] as const) await client.query(
    `INSERT INTO authz.group_member(id,tenant_id,group_id,principal_id,source_type,source_ref,metadata,status,created_by)
     VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'seed',$5,$6::jsonb,'active',$7::uuid)
     ON CONFLICT(id) DO UPDATE SET status='active',effective_until=NULL,updated_by=EXCLUDED.created_by`,
    [deterministicUuid("mesh", ATHYPER_TENANT_ID, SOURCE_REF, "member", principalId), ATHYPER_TENANT_ID, groupId, principalId, SOURCE_REF, fixtureMetadata(), actorId],
  );
  for (const [grantKind, groupId, targetId, roleId] of [
    ["network_account", producerGroupId, accountScopeId, accountRoleId],
    ["network_relationship", producerGroupId, relationshipScopeId, publicationRoleId],
    ["producer-bank", producerGroupId, relationshipScopeId, disclosureRequesterRoleId],
    ["reviewer-account", reviewerGroupId, accountScopeId, accountRoleId],
    ["reviewer-bank", reviewerGroupId, relationshipScopeId, disclosureReviewerRoleId],
  ] as const)
    await client.query(
      `INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,metadata,status,created_by)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'exact','seed',$6,$7::jsonb,'active',$8::uuid)
       ON CONFLICT(id) DO UPDATE SET status='active',effective_until=NULL,updated_by=EXCLUDED.created_by`,
      [deterministicUuid("mesh", ATHYPER_TENANT_ID, SOURCE_REF, "grant", grantKind), ATHYPER_TENANT_ID, groupId, roleId, targetId, SOURCE_REF, fixtureMetadata(), actorId],
    );
}

async function ensureRole(client: QueryClient,suffix: string,permissionCodes: readonly string[],actorId: string): Promise<string> {
  const roleId=deterministicUuid("mesh",ATHYPER_TENANT_ID,SOURCE_REF,"role",suffix),code=`development.mesh.northwind.${suffix}`;
  await client.query(
    `INSERT INTO authz.role(id,tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
     VALUES($1::uuid,$2::uuid,$3,$4,'Northwind development profile publication access','system','seed',$5,$6::jsonb,'draft',$7::uuid)
     ON CONFLICT(tenant_id,code) DO NOTHING`,
    [roleId,ATHYPER_TENANT_ID,code,`Northwind Development ${suffix}`,SOURCE_REF,fixtureMetadata(),actorId],
  );
  await client.query("UPDATE authz.role SET status='suspended' WHERE tenant_id=$1::uuid AND id=$2::uuid AND status='active'",[ATHYPER_TENANT_ID,roleId]);
  const permissions=await client.query<{id:string;canonical_code:string}>("SELECT id::text,canonical_code FROM authz.permission WHERE canonical_code=ANY($1::text[]) AND status='published'",[permissionCodes]);
  if(permissions.rows.length!==permissionCodes.length)throw new Error(`Northwind MESH ${suffix} permission catalog is incomplete`);
  for(const permission of permissions.rows)await client.query(
    `INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING`,
    [deterministicUuid("mesh",ATHYPER_TENANT_ID,SOURCE_REF,"permission",suffix,permission.canonical_code),ATHYPER_TENANT_ID,roleId,permission.id,actorId],
  );
  await client.query("UPDATE authz.role SET status='active' WHERE tenant_id=$1::uuid AND id=$2::uuid",[ATHYPER_TENANT_ID,roleId]);
  return roleId;
}

async function scope(client: QueryClient,id: string,kind: string,key: string,targetId: string,parentId: string,name: string,actorId: string): Promise<string> {
  await client.query(
    `INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,metadata,status,created_by)
     VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid,$6::uuid,$7,$8::jsonb,'active',$9::uuid)
     ON CONFLICT(tenant_id,scope_kind,target_id) DO NOTHING`,
    [id, ATHYPER_TENANT_ID, kind, key, targetId, parentId, name, fixtureMetadata(), actorId],
  );
  return (await one<{ id: string }>(client,"SELECT id::text FROM authz.scope_target WHERE tenant_id=$1::uuid AND scope_kind=$2 AND target_id=$3::uuid AND status='active'",[ATHYPER_TENANT_ID,kind,targetId])).id;
}

async function actor(client: QueryClient,tenantId: string,principalId: string,accountId: string): Promise<void> {
  await client.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),set_config('app.current_network_account_id',$3,true)", [tenantId, principalId, accountId]);
}
async function principal(client: QueryClient,tenantId: string,code: string): Promise<{ id: string }> {
  return one(client,"SELECT id::text FROM master.principal WHERE tenant_id=$1::uuid AND code=$2 AND status='active'",[tenantId,code]);
}
async function one<T extends object>(client: QueryClient,statement: string,values: unknown[]=[]): Promise<T> {
  const result=await client.query<T>(statement,values);if(result.rows.length!==1)throw new Error(`expected one row, received ${result.rows.length}`);return result.rows[0]!;
}
function fixtureMetadata(): string { return JSON.stringify({ managedBy: SOURCE_REF, environment: "disposable_local" }); }
function localDatabase(url: URL): boolean {
  if (["localhost","127.0.0.1","::1"].includes(url.hostname)) return true;
  const octets=url.hostname.split(".").map(Number);
  return octets.length===4&&octets.every((value)=>Number.isInteger(value)&&value>=0&&value<=255)
    &&(octets[0]===10||(octets[0]===172&&octets[1]!>=16&&octets[1]!<=31)||(octets[0]===192&&octets[1]===168));
}
function option(args: readonly string[],name: string): string|undefined { const equal=args.find((item)=>item.startsWith(`${name}=`));if(equal)return equal.slice(name.length+1);const index=args.indexOf(name);return index<0?undefined:args[index+1]; }

async function main(): Promise<void> {
  const args=process.argv.slice(2),databaseUrl=option(args,"--database-url")??process.env.ATHYPER_MESH_DATABASE_ADMIN_URL;
  if(!databaseUrl)throw new Error("set ATHYPER_MESH_DATABASE_ADMIN_URL or --database-url");
  process.stdout.write(`${JSON.stringify(await provisionDevelopmentNorthwindMeshFixture({databaseUrl,confirmation:option(args,"--confirm"),dryRun:args.includes("--plan")||args.includes("--dry-run")}),null,2)}\n`);
}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href)await main();
