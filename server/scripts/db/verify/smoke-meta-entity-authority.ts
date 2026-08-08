#!/usr/bin/env tsx
import { randomUUID } from "node:crypto";

import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";

import { TargetCapabilityAuthorizer } from "@athyper/svc-iam";
import { MetaEntityAuthoringService } from "@athyper/svc-meta-entity-authoring";
import { PostgresMetaEntityAuthoringRepository } from "@athyper/svc-meta-entity-authoring";

const adminUrl = process.env["META_ENTITY_VERIFY_ADMIN_URL"];
const appUrl = process.env["META_ENTITY_VERIFY_APP_URL"];
const tenantId = process.env["META_ENTITY_VERIFY_TENANT_ID"];
const designerId = process.env["META_ENTITY_VERIFY_DESIGNER_ID"];
const reviewerId = process.env["META_ENTITY_VERIFY_REVIEWER_ID"];
const publisherId = process.env["META_ENTITY_VERIFY_PUBLISHER_ID"];
const guard = process.env["META_ENTITY_VERIFY_DISPOSABLE"];
if (!adminUrl || !appUrl || !tenantId || !designerId || !reviewerId || !publisherId) {
  throw new Error("Meta Entity authority smoke connection and actor variables are required.");
}
if (guard !== "I_UNDERSTAND_THIS_IS_DISPOSABLE") {
  throw new Error("META_ENTITY_VERIFY_DISPOSABLE guard is required.");
}

const admin = new Kysely<never>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: adminUrl }) }) });
const app = new Kysely<never>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: appUrl }) }) });

async function expectDecision(
  authorizer: TargetCapabilityAuthorizer,
  principalId: string,
  permissionCode: string,
  expected: { granted: boolean; reason?: string; requiresMfa?: boolean; requiresSod?: boolean },
): Promise<void> {
  const decision = await authorizer.authorize({
    tenantId: tenantId!, principalId, permissionCode,
    scope: { kind: "tenant", targetId: tenantId! },
  });
  for (const [key, value] of Object.entries(expected)) {
    if (decision[key as keyof typeof decision] !== value) {
      throw new Error(`Unexpected ${permissionCode} decision for ${principalId}: ${JSON.stringify(decision)}`);
    }
  }
}

try {
  const database = await sql<{ name: string }>`SELECT current_database() AS name`.execute(admin);
  if (database.rows[0]?.name !== "athyper_platform") throw new Error("Authority smoke requires athyper_platform.");

  const authorizer = new TargetCapabilityAuthorizer(app);
  await expectDecision(authorizer, designerId, "metadata.entity.author", { granted: true, reason: "granted" });
  await expectDecision(authorizer, designerId, "metadata.entity.publish", { granted: false, reason: "grant_required" });
  await expectDecision(authorizer, reviewerId, "metadata.entity.review", { granted: true, requiresSod: true });
  await expectDecision(authorizer, publisherId, "metadata.entity.publish", {
    granted: true, requiresMfa: true, requiresSod: true,
  });

  const context = { tenantId, principalId: designerId, requestId: "meta-authority-smoke" };
  const service = new MetaEntityAuthoringService(new PostgresMetaEntityAuthoringRepository(app));
  const examples = await service.listEntities(context);
  if (!examples.some((entity) => entity.entityCode === "business_partner" && entity.tenantId === null)) {
    throw new Error("Global business_partner example is not readable to the tenant app role.");
  }
  const module = await sql<{ id: string }>`SELECT id FROM control.module WHERE code='meta'`.execute(admin);
  const entity = await service.createEntity(context, {
    moduleId: module.rows[0]!.id,
    entityCode: `authority_smoke_${randomUUID().slice(0, 8)}`,
    entityClass: "business",
  });
  await service.createChangeSet(context, {
    entityId: entity.id,
    changeSetCode: "initial",
    title: "Authority smoke tenant draft",
  });

  const globalDraft = await sql<{ id: string; lock_version: number }>`
    SELECT cs.id,cs.lock_version FROM metadata.entity_change_set cs
    JOIN metadata.entity e ON e.id=cs.entity_id
    WHERE e.tenant_id IS NULL AND e.entity_code='business_partner' AND cs.status='draft'
    LIMIT 1
  `.execute(admin);
  const graph = await service.getGraph(context, globalDraft.rows[0]!.id);
  let globalWriteRejected = false;
  try {
    await service.saveGraph(context, {
      commandId: randomUUID(), changeSetId: globalDraft.rows[0]!.id,
      expectedLockVersion: Number(globalDraft.rows[0]!.lock_version), graph,
    });
  } catch (error) {
    globalWriteRejected = (error as { code?: string }).code === "GLOBAL_PACKAGE_READ_ONLY";
  }
  if (!globalWriteRejected) throw new Error("Tenant role could mutate a global package Entity draft.");

  await admin.transaction().execute(async (tx) => {
    await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),
      set_config('app.current_principal_id',${designerId},true),set_config('app.database_plane','athyper',true)`.execute(tx);
    await sql`
      INSERT INTO authz.deny_rule (
        tenant_id,permission_id,scope_target_id,subject_kind,principal_id,reason,created_by
      ) SELECT ${tenantId}::uuid,p.id,s.id,'principal',${designerId}::uuid,
               'Disposable explicit-deny precedence smoke',${designerId}::uuid
          FROM authz.permission p,authz.scope_target s
         WHERE p.canonical_code='metadata.entity.author'
           AND s.tenant_id=${tenantId}::uuid AND s.scope_kind='tenant' AND s.target_id=${tenantId}::uuid
    `.execute(tx);
  });
  await expectDecision(authorizer, designerId, "metadata.entity.author", {
    granted: false, reason: "explicit_deny",
  });

  process.stdout.write("META_ENTITY_AUTHORITY_SMOKE_OK exact=1 sod=1 mfa=1 deny=1 global_read_only=1 tenant_write=1\n");
} finally {
  await app.destroy();
  await admin.destroy();
}
