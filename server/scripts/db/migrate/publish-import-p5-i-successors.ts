#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { CompiledQuery, Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { MetaEntityPhase2Graph } from "@athyper/meta-entity-authoring-contracts";

import { SqlOperationScopeArtifactImporter } from "@athyper/svc-iam";
import { compileEntityPlaneArtifact } from "@athyper/svc-meta-entity-authoring";
import { canonicalizeMetaEntityGraph, validateMetaEntityGraph } from "@athyper/svc-meta-entity-authoring";
import { MetaEntityAuthoringService } from "@athyper/svc-meta-entity-authoring";
import { PostgresMetaEntityAuthoringRepository } from "@athyper/svc-meta-entity-authoring";

const ACTOR = "00000000-0000-0000-0000-000000000000";
const GLOBAL_CONTEXT = ACTOR;
const CHANGE_SET_CODE = "p5_i_artifact_1_1_rc2";
const targets = [
  { plane: "neon" as const, entityCode: "business_partner" },
  { plane: "mesh" as const, entityCode: "document_envelope" },
];

function argument(name: string) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}
function uuid(key: string) {
  const chars = createHash("sha256").update(key).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16]!, 16) & 3) | 8).toString(16);
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
function nextPatch(label: string | null) {
  const match = label?.match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : "1.0.1";
}
function remapGraph(source: MetaEntityPhase2Graph, coordinate: string): MetaEntityPhase2Graph {
  const ids = new Set<string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (key === "id" && typeof item === "string") ids.add(item);
        collect(item);
      }
    }
  };
  collect(source);
  const replacements = new Map([...ids].map((id) => [id, uuid(`${coordinate}:${id}`)]));
  const replace = (value: unknown): unknown => Array.isArray(value)
    ? value.map(replace)
    : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]))
    : typeof value === "string" && replacements.has(value)
    ? replacements.get(value)
    : value;
  return replace(source) as MetaEntityPhase2Graph;
}

const adminUrl = argument("--admin-url");
const adminDatabase = argument("--admin-database");
const neonUrl = argument("--neon-url");
const neonDatabase = argument("--neon-database");
const meshUrl = argument("--mesh-url");
const meshDatabase = argument("--mesh-database");
if (!adminUrl || !adminDatabase || !neonUrl || !neonDatabase || !meshUrl || !meshDatabase) {
  throw new Error("Explicit Admin, Neon and Mesh URLs and database guards required");
}

const pool = new pg.Pool({ connectionString: adminUrl });
const db = new Kysely<never>({ dialect: new PostgresDialect({ pool }) });
const service = new MetaEntityAuthoringService(new PostgresMetaEntityAuthoringRepository(db));
const context = { tenantId: GLOBAL_CONTEXT, principalId: ACTOR,
  requestId: "p5-i-artifact-1-1-successor", authority: "central_package" as const };
const result: unknown[] = [];

try {
  const identity = await pool.query<{ database_name: string }>("select current_database() database_name");
  if (identity.rows[0]?.database_name !== adminDatabase) throw new Error("P5-I Admin database guard rejected target");

  for (const target of targets) {
    const entity = (await pool.query<{
      entity_id: string; source_change_set_id: string; base_release_id: string;
      base_release_no: string; base_version_label: string | null;
    }>(`select e.id::text entity_id,r.change_set_id::text source_change_set_id,
          r.id::text base_release_id,r.release_no::text base_release_no,r.version_label base_version_label
        from metadata.entity e join lateral (
          select * from metadata.entity_release x where x.entity_id=e.id
          order by x.release_no desc limit 1
        ) r on true where e.tenant_id is null and e.entity_code=$1`, [target.entityCode])).rows[0];
    if (!entity) throw new Error(`P5-I source release missing: ${target.entityCode}`);

    let successor = (await pool.query<{
      change_set_id: string; revision_id: string; release_id: string;
      release_hash: string; revision_hash: string; contract_hash: string;
      contract_json: Record<string, unknown>; version_label: string;
    }>(`select c.id::text change_set_id,s.id::text revision_id,r.id::text release_id,
          r.release_hash,s.revision_hash,r.contract_hash,s.contract_json,r.version_label
        from metadata.entity_change_set c
        join metadata.entity_release r on r.change_set_id=c.id
        join snapshot.entity_contract_revision s on s.id=r.revision_id
        where c.entity_id=$1::uuid and c.change_set_code=$2 limit 1`,
      [entity.entity_id, CHANGE_SET_CODE])).rows[0];

    if (!successor) {
      const existingChangeSet = (await pool.query<{ id: string; lock_version: string }>(
        "select id::text,lock_version::text from metadata.entity_change_set where entity_id=$1::uuid and change_set_code=$2",
        [entity.entity_id, CHANGE_SET_CODE],
      )).rows[0];
      const graph = existingChangeSet
        ? await service.getGraph(context, existingChangeSet.id)
        : remapGraph(
          await service.getGraph(context, entity.source_change_set_id),
          `${target.entityCode}:${CHANGE_SET_CODE}`,
        );
      const diagnostics = validateMetaEntityGraph(graph);
      const errors = diagnostics.filter((item) => item.severity === "error");
      if (errors.length) throw new Error(`P5-I graph invalid ${target.entityCode}: ${errors.map((item) => item.code).join(",")}`);
      const changeSet = existingChangeSet ?? (await pool.query<{ id: string; lock_version: string }>(`insert into metadata.entity_change_set (
          tenant_id,entity_id,change_set_code,branch_code,base_release_id,title,change_summary,
          change_reason_code,ticket_reference,created_by
        ) values (null,$1::uuid,$2,'main',$3::uuid,$4,$5,'artifact_recompile','P5-I-RC2',$6::uuid)
        returning id::text,lock_version::text`, [entity.entity_id, CHANGE_SET_CODE,
        entity.base_release_id, `P5-I ${target.entityCode} artifact 1.1 successor`,
        "No business-contract change; republishes normalized coordinates using the approved cross-plane artifact format.", ACTOR])).rows[0]!;
      if (!existingChangeSet) {
        await service.saveGraph(context, {
          commandId: uuid(`p5-i:save:${target.entityCode}`), changeSetId: changeSet.id,
          expectedLockVersion: Number(changeSet.lock_version), graph,
        });
      }
      const contract = canonicalizeMetaEntityGraph(graph) as Record<string, unknown>;
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select set_config('app.database_plane','athyper',true),set_config('app.current_principal_id',$1,true),set_config('app.current_tenant_id',$2,true)", [ACTOR, GLOBAL_CONTEXT]);
        const audit = await client.query<{ id: string }>(`select audit.append_event(
          p_event_code=>'metadata.entity.release.published',p_operation=>'execute',
          p_entity_type=>'metadata.entity',p_entity_id=>$1::uuid,
          p_context=>jsonb_build_object('change_set_id',$2::uuid,'target_plane',$3::text,'artifact_schema','athyper.meta-entity-plane-artifact@1.1'),
          p_request_id=>'p5-i-artifact-1-1-successor')::text id`,
        [entity.entity_id, changeSet.id, target.plane]);
        const revision = await client.query<{
          id: string; revision_hash: string; contract_hash: string; contract_json: Record<string, unknown>;
        }>(`insert into snapshot.entity_contract_revision (
          tenant_id,entity_id,change_set_id,revision_no,parent_revision_id,base_release_id,
          contract_schema_code,contract_schema_version,contract_json,contract_hash,revision_hash,
          payload_size_bytes,changed_paths,compatibility_level,validation_status,
          validation_diagnostics,audit_event_id,captured_by
        ) select null,$1::uuid,$2::uuid,1,null,$3::uuid,'athyper.meta_entity','5.2',$4::jsonb,
          repeat('0',64),repeat('0',64),1,array['$']::text[],'backward_compatible','valid','[]'::jsonb,$5::uuid,$6::uuid
        returning id::text,revision_hash,contract_hash,contract_json`, [entity.entity_id,
        changeSet.id, entity.base_release_id, JSON.stringify(contract), audit.rows[0]!.id, ACTOR]);
        await client.query("update metadata.entity_change_set set status='in_review',status_changed_by=$2::uuid where id=$1::uuid", [changeSet.id, ACTOR]);
        await client.query("update metadata.entity_change_set set status='approved',status_changed_by=$2::uuid where id=$1::uuid", [changeSet.id, ACTOR]);
        const release = await client.query<{ id: string; release_hash: string; version_label: string }>(`insert into metadata.entity_release (
          tenant_id,entity_id,change_set_id,revision_id,release_no,version_label,release_kind,
          supersedes_release_id,contract_schema_code,contract_schema_version,contract_hash,revision_hash,
          release_hash,compatibility_level,target_planes,minimum_runtime_version,audit_event_id,
          publication_reason,ticket_reference,published_by
        ) values (null,$1::uuid,$2::uuid,$3::uuid,$4,$5,'publish',$6::uuid,'pending','0.0',
          repeat('0',64),repeat('0',64),repeat('0',64),'backward_compatible',array[$7]::text[],
          '1.0.0',$8::uuid,'P5-I approved artifact-format recompile','P5-I-RC2',$9::uuid)
        returning id::text,release_hash,version_label`, [entity.entity_id, changeSet.id,
        revision.rows[0]!.id, Number(entity.base_release_no) + 1, nextPatch(entity.base_version_label),
        entity.base_release_id, target.plane, audit.rows[0]!.id, ACTOR]);
        await client.query("commit");
        successor = { change_set_id: changeSet.id, revision_id: revision.rows[0]!.id,
          release_id: release.rows[0]!.id, release_hash: release.rows[0]!.release_hash,
          revision_hash: revision.rows[0]!.revision_hash, contract_hash: revision.rows[0]!.contract_hash,
          contract_json: revision.rows[0]!.contract_json, version_label: release.rows[0]!.version_label };
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally { client.release(); }
    }

    const artifact = compileEntityPlaneArtifact({ plane: target.plane,
      entityId: entity.entity_id, entityCode: target.entityCode,
      releaseId: successor.release_id, releaseHash: successor.release_hash,
      revisionId: successor.revision_id, revisionHash: successor.revision_hash,
      contractHash: successor.contract_hash, contract: successor.contract_json });
    const stored = (await pool.query<{ id: string; compiled_hash: string }>(`insert into snapshot.entity_release_artifact (
        tenant_id,source_release_id,source_revision_id,entity_id,plane_key,release_hash,
        contract_hash,compiled_json,compiled_hash,compliance_report,created_by
      ) values (null,$1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::jsonb,
        snapshot.fn_compute_entity_release_artifact_hash(
          $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::jsonb),
        '{"status":"passed","compiler":"p5-i","artifact_schema":"1.1"}'::jsonb,$8::uuid)
      on conflict (tenant_id,source_release_id,plane_key) do nothing returning id::text,compiled_hash`,
      [successor.release_id, successor.revision_id, entity.entity_id, target.plane,
        successor.release_hash, successor.contract_hash, JSON.stringify(artifact), ACTOR])).rows[0]
      ?? (await pool.query<{ id: string; compiled_hash: string }>(
        "select id::text,compiled_hash from snapshot.entity_release_artifact where source_release_id=$1::uuid and plane_key=$2",
        [successor.release_id, target.plane])).rows[0]!;
    const consumerUrl = target.plane === "neon" ? neonUrl : meshUrl;
    const expectedDatabase = target.plane === "neon" ? neonDatabase : meshDatabase;
    const consumer = new Kysely<never>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: consumerUrl }) }) });
    try {
      const appliedRelease=(await consumer.executeQuery<{id:string}>(CompiledQuery.raw(
        "select id::text from runtime_meta.applied_release where source_release_id=$1::uuid and status='staged' order by staged_at desc limit 1",
        [successor.release_id],
      ))).rows[0];
      if(!appliedRelease)throw new Error(`runtime_meta release must be staged before importing operation projection:${successor.release_id}`);
      const imported = await new SqlOperationScopeArtifactImporter(consumer).importArtifact({
        artifact, expectedDatabaseName: expectedDatabase, tenantId: null,
        appliedReleaseId:appliedRelease.id,
        sourceCompiledHash: stored.compiled_hash,
        actorId: ACTOR, effectiveFrom: new Date(),
      });
      await consumer.executeQuery(CompiledQuery.raw(`select ops.set_authorization_operation_rollout(
          plane_code,entity_code,source_entity_operation_id,source_release_hash,
          source_compiled_hash,'shadow',$1::uuid,'P5-I successor initial shadow','P5-I-RC2')
        from authz.entity_operation_binding
        where tenant_id is null and plane_code=$2 and entity_code=$3
          and source_release_hash=$4 and source_compiled_hash=$5 and status='published'
        order by operation_key`,
      [ACTOR, target.plane, target.entityCode, successor.release_hash, stored.compiled_hash]));
      result.push({ plane: target.plane, entityCode: target.entityCode,
        versionLabel: successor.version_label, releaseId: successor.release_id,
        releaseHash: successor.release_hash, artifactId: stored.id,
        artifactHash: stored.compiled_hash, artifactSchemaVersion: artifact.artifact_schema_version,
        bindings: artifact.operation_scope_bindings.length, importNoOp: imported.noOp });
    } finally { await consumer.destroy(); }
  }
  process.stdout.write(JSON.stringify({ status: "ok", successors: result }, null, 2) + "\n");
} finally { await db.destroy(); }
