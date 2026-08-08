import type { MetaEntityPhase2Graph } from "@athyper/meta-entity-authoring-contracts";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { MetaEntityAuthoringService } from "@athyper/svc-meta-entity-authoring";
import { PostgresMetaEntityAuthoringRepository } from "@athyper/svc-meta-entity-authoring";

const adminUrl = process.env["META_ENTITY_VERIFY_ADMIN_URL"];
const appUrl = process.env["META_ENTITY_VERIFY_APP_URL"];
if (!adminUrl || !appUrl) throw new Error("META_ENTITY_VERIFY_ADMIN_URL and META_ENTITY_VERIFY_APP_URL are required");

const tenantId = randomUUID();
const principalId = randomUUID();
const workspaceId = randomUUID();
const moduleId = randomUUID();
const suffix = tenantId.slice(0, 8);

function graph(): MetaEntityPhase2Graph {
  const idFieldId = randomUUID();
  const tenantFieldId = randomUUID();
  return {
    runtimeProfile: {
      id: randomUUID(), profileKey: "default", backingKind: "table",
      storagePlane: "neon", storageSchema: "document", storageObject: "service_contract", apiExposure: "api",
      readMode: "generic", writeMode: "generic", readHandlerKey: null, writeHandlerKey: null,
      createMode: "direct", concurrencyMode: "none", recordVersionFieldKey: null, tenantFieldKey: "tenant_id",
      softDeleteFieldKey: null, draftTtlHours: null,
    },
    fields: [{ id: idFieldId, fieldKey: "id", dataType: "uuid", typeConfig: { kind: "uuid" }, cardinality: "one",
      valueOrigin: "stored", writeMode: "write_once", storagePath: "id", defaultSpec: null, computationSpec: null,
      validationSpec: null, status: "active", keyUsageCount: 1, searchUsageCount: 0, relationUsageCount: 0 },
      { id: tenantFieldId, fieldKey: "tenant_id", dataType: "uuid", typeConfig: { kind: "uuid" }, cardinality: "one",
        valueOrigin: "stored", writeMode: "write_once", storagePath: "tenant_id", defaultSpec: null,
        computationSpec: null, validationSpec: null, status: "active", keyUsageCount: 0,
        searchUsageCount: 0, relationUsageCount: 0 }],
    keys: [{ id: randomUUID(), keyKey: "primary", keyKind: "primary",
      uniquenessScope: "tenant", nullSemantics: "not_allowed", status: "active",
      fields: [{ id: randomUUID(), entityFieldId: idFieldId, position: 1 }] }],
    searchProfiles: [], relations: [],
  };
}

const admin = new Kysely<never>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: adminUrl }) }) });
const app = new Kysely<never>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: appUrl }) }) });

try {
  await sql`INSERT INTO master.tenant (id,code,name,display_name,realm_key,status,created_by)
    VALUES (${tenantId}::uuid,${`meta_${suffix}`},'Meta Service','Meta Service',${`meta_${suffix}`},'active',${principalId}::uuid)
    ON CONFLICT (id) DO NOTHING`.execute(admin);
  await sql`INSERT INTO master.principal (id,tenant_id,code,name,principal_type,created_by)
    VALUES (${principalId}::uuid,${tenantId}::uuid,${`meta.${suffix}.admin`},'Meta Service Admin','user',${principalId}::uuid)
    ON CONFLICT (id) DO NOTHING`.execute(admin);
  await sql`INSERT INTO control.workspace (id,code,name,created_by)
    VALUES (${workspaceId}::uuid,${`meta_${suffix}_workspace`},'Meta Service Workspace',${principalId}::uuid)
    ON CONFLICT (id) DO NOTHING`.execute(admin);
  await sql`INSERT INTO control.module (id,code,name,created_by)
    VALUES (${moduleId}::uuid,${`meta_${suffix}_module`},'Meta Service Module',${principalId}::uuid)
    ON CONFLICT (id) DO NOTHING`.execute(admin);
  await sql`INSERT INTO control.workspace_module (workspace_id,module_id,is_primary,created_by)
    VALUES (${workspaceId}::uuid,${moduleId}::uuid,true,${principalId}::uuid)
    ON CONFLICT (workspace_id,module_id) DO NOTHING`.execute(admin);

  const service = new MetaEntityAuthoringService(new PostgresMetaEntityAuthoringRepository(app));
  const context = { tenantId, principalId, correlationId: randomUUID(), requestId: "meta-service-smoke" };
  const entity = await service.createEntity(context, { moduleId, entityCode: "service_contract", entityClass: "business" });
  const changeSet = await service.createChangeSet(context, {
    entityId: entity.id, changeSetCode: "service.initial", title: "Service initial contract",
  });
  const initialGraph = graph();
  const saved = await service.saveGraph(context, {
    commandId: randomUUID(), changeSetId: changeSet.id,
    expectedLockVersion: changeSet.lockVersion, graph: initialGraph,
  });
  const checkpoint = await service.checkpoint(context, {
    changeSetId: changeSet.id, expectedLockVersion: saved.lockVersion, compatibilityLevel: "backward_compatible",
  });
  const submitted = await service.transition(context, "submit", {
    changeSetId: changeSet.id, expectedLockVersion: saved.lockVersion,
  });
  const approved = await service.transition(context, "approve", {
    changeSetId: changeSet.id, expectedLockVersion: submitted.lockVersion,
  });
  const release = await service.publish(context, {
    changeSetId: changeSet.id, expectedLockVersion: approved.lockVersion, revisionId: checkpoint.id,
    versionLabel: "1.0.0", targetPlanes: ["neon"],
  });
  const rollbackChangeSet = await service.createChangeSet(context, {
    entityId: entity.id, changeSetCode: "service.rollback", title: "Rollback contract", baseReleaseId: release.id,
  });
  const rollbackSaved = await service.saveGraph(context, { commandId: randomUUID(), changeSetId: rollbackChangeSet.id,
    expectedLockVersion: rollbackChangeSet.lockVersion, graph: graph() });
  const rollbackCheckpoint = await service.checkpoint(context, { changeSetId: rollbackChangeSet.id,
    expectedLockVersion: rollbackSaved.lockVersion, compatibilityLevel: "backward_compatible" });
  const rollbackSubmitted = await service.transition(context, "submit", { changeSetId: rollbackChangeSet.id,
    expectedLockVersion: rollbackSaved.lockVersion });
  const rollbackApproved = await service.transition(context, "approve", { changeSetId: rollbackChangeSet.id,
    expectedLockVersion: rollbackSubmitted.lockVersion });
  const rollback = await service.publish(context, { changeSetId: rollbackChangeSet.id,
    expectedLockVersion: rollbackApproved.lockVersion, revisionId: rollbackCheckpoint.id, releaseKind: "rollback",
    rollbackOfReleaseId: release.id, versionLabel: "1.0.1", targetPlanes: ["neon"],
    reason: "Disposable rollback smoke", ticketReference: "META-SMOKE-ROLLBACK" });

  const retireChangeSet = await service.createChangeSet(context, {
    entityId: entity.id, changeSetCode: "service.retire", title: "Retire contract", baseReleaseId: rollback.id,
  });
  const retireSaved = await service.saveGraph(context, { commandId: randomUUID(), changeSetId: retireChangeSet.id,
    expectedLockVersion: retireChangeSet.lockVersion, graph: graph() });
  const retireCheckpoint = await service.checkpoint(context, { changeSetId: retireChangeSet.id,
    expectedLockVersion: retireSaved.lockVersion, compatibilityLevel: "backward_compatible" });
  const retireSubmitted = await service.transition(context, "submit", { changeSetId: retireChangeSet.id,
    expectedLockVersion: retireSaved.lockVersion });
  const retireApproved = await service.transition(context, "approve", { changeSetId: retireChangeSet.id,
    expectedLockVersion: retireSubmitted.lockVersion });
  const retired = await service.publish(context, { changeSetId: retireChangeSet.id,
    expectedLockVersion: retireApproved.lockVersion, revisionId: retireCheckpoint.id, releaseKind: "retire",
    versionLabel: "1.0.2", targetPlanes: ["neon"],
    reason: "Disposable retirement smoke", ticketReference: "META-SMOKE-RETIRE" });
  const evidence = await sql<{ audit_count: number; outbox_count: number }>`SELECT
    (SELECT count(*)::int FROM audit.audit_log WHERE tenant_id=${tenantId}::uuid AND entity_id=${entity.id}::uuid) AS audit_count,
    (SELECT count(*)::int FROM event.outbox WHERE tenant_id=${tenantId}::uuid AND aggregate_id=${entity.id}::uuid) AS outbox_count
  `.execute(admin);
  const counts = evidence.rows[0]!;
  if (Number(counts.audit_count) < 16 || Number(counts.outbox_count) < 16
      || release.releaseNo !== 1 || rollback.releaseNo !== 2 || retired.releaseNo !== 3) {
    throw new Error(`Unexpected evidence counts: ${JSON.stringify({ ...counts,
      releases: [release.releaseNo, rollback.releaseNo, retired.releaseNo] })}`);
  }
  process.stdout.write(`META_ENTITY_AUTHORING_SERVICE_SMOKE_OK audit=${counts.audit_count} outbox=${counts.outbox_count}\n`);
} finally {
  await app.destroy();
  await admin.destroy();
}
