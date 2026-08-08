#!/usr/bin/env tsx
import { CompiledQuery, Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import { SqlOperationScopeArtifactImporter } from "@athyper/svc-iam";
import { MetaEntityAuthoringService } from "@athyper/svc-meta-entity-authoring";
import { compileEntityPlaneArtifact } from "@athyper/svc-meta-entity-authoring";
import { canonicalizeMetaEntityGraph, validateMetaEntityGraph } from "@athyper/svc-meta-entity-authoring";
import { PostgresMetaEntityAuthoringRepository } from "@athyper/svc-meta-entity-authoring";

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";
const SYSTEM_TENANT_CONTEXT = "00000000-0000-0000-0000-000000000000";
const P5_E5_QUALIFICATION_TENANT = "11111111-1111-4111-8111-111111111111";

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

const adminUrl = argument("--admin-url") ?? process.env["META_ENTITY_DATABASE_URL"];
const adminDatabase = argument("--admin-database");
const neonUrl = argument("--neon-url") ?? process.env["NEON_DATABASE_URL"];
const neonDatabase = argument("--neon-database");
const meshUrl = argument("--mesh-url") ?? process.env["MESH_DATABASE_URL"];
const meshDatabase = argument("--mesh-database");
if (!adminUrl || !adminDatabase || !neonUrl || !neonDatabase || !meshUrl || !meshDatabase) {
  throw new Error("Explicit Admin, Neon and Mesh URLs and expected database names are required.");
}

type Plane = "neon" | "mesh";
interface Target { entityCode: string; changeSetCode: string; versionLabel: string; plane: Plane }
const targets: readonly Target[] = [
  { entityCode: "business_partner", changeSetCode: "p5_e5_qualification_v3", versionLabel: "2.2.2", plane: "neon" },
];

const adminPool = new pg.Pool({ connectionString: adminUrl });
const adminDb = new Kysely<never>({ dialect: new PostgresDialect({ pool: adminPool }) });
const authoring = new MetaEntityAuthoringService(new PostgresMetaEntityAuthoringRepository(adminDb));
const context = { tenantId: SYSTEM_TENANT_CONTEXT, principalId: SYSTEM_ACTOR, correlationId: null, requestId: "p5-e2-central-publisher" };

async function expectedDatabase(client: pg.PoolClient, expected: string): Promise<void> {
  const identity = await client.query<{ database_name: string }>("SELECT current_database() AS database_name");
  if (identity.rows[0]?.database_name !== expected) throw new Error(`database_guard:${expected}`);
}

const published: Array<{
  plane: Plane; entityId: string; releaseId: string; releaseHash: string;
  artifactId: string; compiledHash: string; bindings: unknown[];
}> = [];

try {
  const guard = await adminPool.connect();
  await expectedDatabase(guard, adminDatabase);
  guard.release();

  for (const target of targets) {
    const lookup = await adminPool.query<{
      entity_id: string; change_set_id: string; lock_version: string; status: string;
    }>(`SELECT entity.id::text AS entity_id, change_set.id::text AS change_set_id,
              change_set.lock_version::text, change_set.status::text
         FROM metadata.entity entity
         JOIN metadata.entity_change_set change_set ON change_set.entity_id=entity.id
        WHERE entity.tenant_id IS NULL AND entity.entity_code=$1
          AND change_set.change_set_code=$2`, [target.entityCode, target.changeSetCode]);
    const source = lookup.rows[0];
    if (!source) throw new Error(`source_change_set_missing:${target.entityCode}`);

    const existing = await adminPool.query<{
      release_id: string; release_hash: string; revision_id: string; revision_hash: string;
      contract_hash: string; contract_json: Record<string, unknown>;
    }>(`SELECT release.id::text AS release_id,release.release_hash,
              revision.id::text AS revision_id,revision.revision_hash,release.contract_hash,revision.contract_json
         FROM metadata.entity_release release
         JOIN snapshot.entity_contract_revision revision ON revision.id=release.revision_id
        WHERE release.entity_id=$1::uuid AND release.version_label=$2
        LIMIT 1`, [source.entity_id, target.versionLabel]);

    let release = existing.rows[0];
    if (!release) {
      if (source.status !== "draft") throw new Error(`source_change_set_not_draft:${target.entityCode}:${source.status}`);
      const graph = await authoring.getGraph(context, source.change_set_id);
      const diagnostics = validateMetaEntityGraph(graph);
      if (diagnostics.some((item) => item.severity === "error")) {
        throw new Error(`source_graph_invalid:${target.entityCode}:${diagnostics.map((item) => item.code).join(",")}`);
      }
      const contract = canonicalizeMetaEntityGraph(graph) as Record<string, unknown>;
      const client = await adminPool.connect();
      try {
        await expectedDatabase(client, adminDatabase);
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.database_plane','athyper',true),set_config('app.current_principal_id',$1,true),set_config('app.current_tenant_id',$2,true)", [SYSTEM_ACTOR, SYSTEM_TENANT_CONTEXT]);
        const prior = await client.query<{ id: string; revision_no: number }>(
          "SELECT id::text,revision_no FROM snapshot.entity_contract_revision WHERE change_set_id=$1::uuid ORDER BY revision_no DESC LIMIT 1",
          [source.change_set_id],
        );
        const checkpointAudit = await client.query<{ id: string }>(`SELECT audit.append_event(
          p_event_code=>'metadata.entity.change_set.checkpointed',p_operation=>'create',
          p_entity_type=>'metadata.entity',p_entity_id=>$1::uuid,
          p_context=>jsonb_build_object('change_set_id',$2::uuid,'central_package',true),
          p_request_id=>'p5-e2-central-publisher')::text AS id`, [source.entity_id, source.change_set_id]);
        const revision = await client.query<{
          id: string; revision_hash: string; contract_hash: string; contract_json: Record<string, unknown>;
        }>(`INSERT INTO snapshot.entity_contract_revision (
          tenant_id,entity_id,change_set_id,revision_no,parent_revision_id,base_release_id,
          contract_schema_code,contract_schema_version,contract_json,contract_hash,revision_hash,
          payload_size_bytes,changed_paths,compatibility_level,validation_status,
          validation_diagnostics,audit_event_id,captured_by
        ) SELECT NULL,$1::uuid,$2::uuid,COALESCE($3::int,0)+1,$4::uuid,change_set.base_release_id,
          'athyper.meta_entity','5.2',$5::jsonb,repeat('0',64),repeat('0',64),1,
          ARRAY['$']::text[],'backward_compatible','valid','[]'::jsonb,$6::uuid,$7::uuid
          FROM metadata.entity_change_set change_set WHERE change_set.id=$2::uuid
        RETURNING id::text,revision_hash,contract_hash,contract_json`, [
          source.entity_id, source.change_set_id, prior.rows[0]?.revision_no ?? null,
          prior.rows[0]?.id ?? null, JSON.stringify(contract), checkpointAudit.rows[0]!.id, SYSTEM_ACTOR,
        ]);
        await client.query("UPDATE metadata.entity_change_set SET status='in_review',status_changed_by=$2::uuid WHERE id=$1::uuid", [source.change_set_id, SYSTEM_ACTOR]);
        await client.query("UPDATE metadata.entity_change_set SET status='approved',status_changed_by=$2::uuid WHERE id=$1::uuid", [source.change_set_id, SYSTEM_ACTOR]);
        const publicationAudit = await client.query<{ id: string }>(`SELECT audit.append_event(
          p_event_code=>'metadata.entity.release.published',p_operation=>'execute',
          p_entity_type=>'metadata.entity',p_entity_id=>$1::uuid,
          p_context=>jsonb_build_object('change_set_id',$2::uuid,'target_plane',$3::text,'central_package',true),
          p_request_id=>'p5-e2-central-publisher')::text AS id`, [source.entity_id, source.change_set_id, target.plane]);
        const head = await client.query<{ id: string; release_no: string }>(
          "SELECT id::text,release_no::text FROM metadata.entity_release WHERE entity_id=$1::uuid ORDER BY release_no DESC LIMIT 1 FOR UPDATE",
          [source.entity_id],
        );
        const inserted = await client.query<{ release_id: string; release_hash: string }>(`INSERT INTO metadata.entity_release (
          tenant_id,entity_id,change_set_id,revision_id,release_no,version_label,release_kind,
          supersedes_release_id,contract_schema_code,contract_schema_version,contract_hash,revision_hash,
          release_hash,compatibility_level,target_planes,minimum_runtime_version,audit_event_id,
          publication_reason,ticket_reference,published_by
        ) VALUES (NULL,$1::uuid,$2::uuid,$3::uuid,$4,$5,'publish',$6::uuid,
          'pending','0.0',repeat('0',64),repeat('0',64),repeat('0',64),'backward_compatible',
          ARRAY[$7]::text[],'1.0.0',$8::uuid,'P5-E2 normalized authorization artifact publication',
          'P5-E2',$9::uuid) RETURNING id::text AS release_id,release_hash`, [
          source.entity_id, source.change_set_id, revision.rows[0]!.id,
          Number(head.rows[0]?.release_no ?? 0) + 1, target.versionLabel, head.rows[0]?.id ?? null,
          target.plane, publicationAudit.rows[0]!.id, SYSTEM_ACTOR,
        ]);
        await client.query("COMMIT");
        release = {
          release_id: inserted.rows[0]!.release_id,
          release_hash: inserted.rows[0]!.release_hash,
          revision_id: revision.rows[0]!.id,
          revision_hash: revision.rows[0]!.revision_hash,
          contract_hash: revision.rows[0]!.contract_hash,
          contract_json: revision.rows[0]!.contract_json,
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    const artifactJson = compileEntityPlaneArtifact({
      plane: target.plane, entityId: source.entity_id, entityCode: target.entityCode,
      releaseId: release.release_id, releaseHash: release.release_hash,
      revisionId: release.revision_id, revisionHash: release.revision_hash,
      contractHash: release.contract_hash, contract: release.contract_json,
    });
    const artifact = await adminPool.query<{ id: string; compiled_hash: string }>(`WITH payload AS (
      SELECT $1::uuid AS release_id,$2::uuid AS revision_id,$3::uuid AS entity_id,$4::text AS plane_key,
             $5::text AS release_hash,$6::text AS contract_hash,$7::jsonb AS compiled_json
    ) INSERT INTO snapshot.entity_release_artifact (
      tenant_id,source_release_id,source_revision_id,entity_id,plane_key,release_hash,
      contract_hash,compiled_json,compiled_hash,compliance_report,created_by
    ) SELECT NULL,release_id,revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json,
      snapshot.fn_compute_entity_release_artifact_hash(release_id,revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json),
      '{"status":"passed","compiler":"p5-e2"}'::jsonb,$8::uuid FROM payload
    ON CONFLICT (tenant_id,source_release_id,plane_key) DO NOTHING
    RETURNING id::text,compiled_hash`, [release.release_id, release.revision_id, source.entity_id,
      target.plane, release.release_hash, release.contract_hash, JSON.stringify(artifactJson), SYSTEM_ACTOR]);
    const stored = artifact.rows[0] ?? (await adminPool.query<{ id: string; compiled_hash: string }>(
      "SELECT id::text,compiled_hash FROM snapshot.entity_release_artifact WHERE source_release_id=$1::uuid AND plane_key=$2",
      [release.release_id, target.plane],
    )).rows[0]!;

    const consumerUrl = target.plane === "neon" ? neonUrl : meshUrl;
    const consumerName = target.plane === "neon" ? neonDatabase : meshDatabase;
    const consumer = new Kysely<never>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: consumerUrl }) }) });
    try {
      const appliedRelease=(await consumer.executeQuery<{id:string}>(CompiledQuery.raw(
        "SELECT id::text FROM runtime_meta.applied_release WHERE source_release_id=$1::uuid AND status='staged' ORDER BY staged_at DESC LIMIT 1",
        [release.release_id],
      ))).rows[0];
      if(!appliedRelease)throw new Error(`runtime_meta release must be staged before importing operation projection:${release.release_id}`);
      const imported = await new SqlOperationScopeArtifactImporter(consumer).importArtifact({
        artifact:artifactJson,expectedDatabaseName:consumerName,tenantId:null,
        appliedReleaseId:appliedRelease.id,
        sourceCompiledHash:stored.compiled_hash,
        actorId:SYSTEM_ACTOR,effectiveFrom:new Date(),
      });
      if (target.changeSetCode.startsWith("p5_e5_qualification")) {
        await new SqlOperationScopeArtifactImporter(consumer).importArtifact({
          artifact:artifactJson,expectedDatabaseName:consumerName,tenantId:P5_E5_QUALIFICATION_TENANT,
          appliedReleaseId:appliedRelease.id,
          sourceCompiledHash:stored.compiled_hash,
          actorId:SYSTEM_ACTOR,effectiveFrom:new Date(),
        });
      }
      published.push({ plane: target.plane, entityId: source.entity_id,
        releaseId: release.release_id, releaseHash: release.release_hash,
        artifactId: stored.id, compiledHash: stored.compiled_hash,
        bindings: [...artifactJson.operation_scope_bindings] });
      process.stdout.write(`P5_E2_IMPORT_OK plane=${target.plane} entity=${target.entityCode} bindings=${imported.insertedBindingIds.length} noop=${imported.noOp}\n`);
    } finally {
      await consumer.destroy();
    }
  }
  process.stdout.write(JSON.stringify({ status: "ok", releases: published }, null, 2) + "\n");
} finally {
  await adminDb.destroy();
}
