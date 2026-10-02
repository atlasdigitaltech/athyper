import { ACTIVITY_ACTIONS } from "@athyper/server-contract-publication";
import { resolveAtlasEntityToolManifest } from "@athyper/server-platform-ai";
import { canonicalBytes, sha256 as hashBytes } from "@athyper/server-adapter-publication-signing";
import { sql, type Kysely } from "kysely";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type { CompiledEntityRegistry, PublicationPlane } from "@athyper/server-contract-publication";
import { parseDevEntitySuccessorPolicy } from "@athyper/server-contract-publication";
import { assertPublicationCompilerIdentity, publicationCompilerIdentity } from "./compiler-build.js";
import { findCompilationRecovery } from "./compilation-recovery-authority.js";
import { assertSuccessorTargetHeads } from "./successor-targets.js";
import { compileGraph, compileSystemEntityTarget, sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import { lowerNativeRuntimePublication, compileCompiledEntityArtifacts, compiledEntityRuntimeProjection,
  type CompiledRuntimePublication, type CompiledRuntimeSource } from "@athyper/server-service-publication";
import { qualifyReferencePublicationTarget } from "./target-qualification.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";

type Database = Kysely<Record<string, never>>;
type SourceRow = {
  publication_release_id: string; release_key: string; release_no: string | number;
  source_tenant_id: string | null; revision_id: string; entity_code: string;
  source_entity_id: string; source_release_hash: string;
  contract_json: MetaEntityGraph; compiled_json: Record<string, unknown>;
  plane_key: PublicationPlane; created_at: Date | string; target_planes: PublicationPlane[];
  successor_policy?: unknown;
};
// Runtime envelopes must use the signing canonicalizer, not authoring graph
// normalization (which sorts selected arrays such as fields and operations).
const canonical = { canonicalBytes, sha256: hashBytes };

/** DEV scoped worker adapter. Reads the existing approval-enforcing SQL source
 * function on every phase. Does not read mutable drafts, activate, grant IAM, or
 * derive authority from entity names. Currently admits the existing read-only
 * system-product profile; other graph shapes fail its structural validator. */
export function createCompiledRuntimePublication(options: {
  authority: Database;
  configuration: PublicationWorkloadConfiguration;
  targets(): Parameters<typeof qualifyReferencePublicationTarget>[1];
}): CompiledRuntimePublication {
  const configuration = structuredClone(options.configuration);
  if (configuration.environment !== "local" || configuration.instance !== "dev" || configuration.domainSuffix !== "dev.athyper.test")
    throw Error("PUBLICATION_WORKLOAD_DEV_ONLY");

  async function persisted(releaseId: string, plane: PublicationPlane): Promise<CompiledRuntimeSource & { recoveryEvidence?: unknown }> {
    return options.authority.transaction().setIsolationLevel("repeatable read").execute(async tx => {
      await sql`SET TRANSACTION READ ONLY`.execute(tx);
      await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${configuration.tenantId},true),
        set_config('app.current_principal_id',${configuration.publisher.principalId},true)`.execute(tx);
      const principals = (await sql`SELECT id FROM master.principal WHERE tenant_id=${configuration.tenantId}::uuid
        AND id=${configuration.publisher.principalId}::uuid AND code=${configuration.publisher.code}
        AND principal_type='service_account' AND status='active' AND auth_epoch=${configuration.publisher.authEpoch}`.execute(tx)).rows;
      if (principals.length !== 1) throw Error("PUBLICATION_WORKLOAD_REVOKED");
      // SECURITY DEFINER function enforces authority tenant, approved snapshot,
      // maker/checker separation and immutable target descriptor hashes.
      const rows = (await sql<SourceRow>`SELECT * FROM publication.fn_compiled_entity_compilation_source_v3(${releaseId}::uuid)`.execute(tx)).rows;
      const row = rows.find(r => r.plane_key === plane);
      if (!row || rows.length !== row.target_planes.length || new Set(rows.map(r => r.plane_key)).size !== rows.length
        || row.target_planes.some(p => !rows.some(r => r.plane_key === p)) || row.source_tenant_id !== null
        || rows.some(r => r.publication_release_id !== releaseId || r.revision_id !== row.revision_id || r.entity_code !== row.entity_code
          || r.source_entity_id !== row.source_entity_id || r.source_release_hash !== row.source_release_hash
          || r.release_key !== row.release_key || sha256(r.contract_json) !== sha256(row.contract_json)))
        throw Error("COMPILED_PUBLICATION_APPROVED_SOURCE_REQUIRED");
      const successor = Number(row.release_no) > 1 ? parseDevEntitySuccessorPolicy(row.successor_policy) : undefined;
      let recoveryEvidence: unknown;
      if (successor && successor.compiler.buildHash !== publicationCompilerIdentity().buildHash) {
        const recovery = await findCompilationRecovery(options.authority, configuration, releaseId);
        if (sha256(recovery.graph) !== sha256(row.contract_json)) throw Error("COMPILATION_RECOVERY_GRAPH_CHANGED");
        recoveryEvidence = recovery.evidence;
      } else if (successor) assertPublicationCompilerIdentity(successor.compiler);
      const expectedPredecessor = successor?.targets.find(t => t.plane === plane);
      if (successor && (!expectedPredecessor || successor.authorityTenantId !== configuration.tenantId
        || successor.entityId !== row.source_entity_id || successor.contractHash !== compileGraph(row.contract_json).contractHash
        || successor.descriptorHash !== compileGraph(row.contract_json).descriptorHash)) throw Error("COMPILED_PUBLICATION_SUCCESSOR_SOURCE_MISMATCH");
      return { releaseId, releaseNo: Number(row.release_no), publicationKey: row.release_key, plane, tenantId: null,
        entityCode: row.entity_code, revisionId: row.revision_id, sourceEntityId: row.source_entity_id, sourceReleaseHash: row.source_release_hash, sourceContractHash: sha256(row.contract_json),
        sourceDescriptorHash: sha256(row.compiled_json), generatedAt: new Date(row.created_at).toISOString(),
        native: row.compiled_json, contract: row.contract_json as unknown as Record<string, unknown>,
        ...(expectedPredecessor ? { expectedPredecessor } : {}), ...(recoveryEvidence ? { recoveryEvidence } : {}) };
    });
  }
  async function catalog(plane: PublicationPlane) {
    const db = options.targets().databases[plane];
    if (!db) throw Error("PUBLICATION_TARGET_DATABASE_UNAVAILABLE");
    return (await sql<{ id: string; kind: string; code: string; scopeKinds: string[] }>`SELECT p.id, p.permission_kind::text kind, p.canonical_code code,
      array_agg(DISTINCT s.scope_kind::text ORDER BY s.scope_kind::text) AS "scopeKinds"
      FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id AND s.status='active'
      WHERE p.status='published' GROUP BY p.id,p.permission_kind,p.canonical_code`.execute(db)).rows;
  }
  async function registry(plane: PublicationPlane): Promise<CompiledEntityRegistry> {
    const db = options.targets().databases[plane];
    if (!db) throw Error("PUBLICATION_TARGET_DATABASE_UNAVAILABLE");
    const sources = (await sql<{ name: string }>`SELECT table_schema||'.'||table_name name FROM information_schema.tables
      WHERE table_schema IN ('shared','master') AND table_type='BASE TABLE'`.execute(db)).rows;
    // Closed host implementation vocabulary, not caller-provided registry keys.
    // qualifyReferencePublicationTarget separately proves installed callables,
    // capability methods and infrastructure at compile/sign/dispatch.
    return { resolveAiToolManifest: resolveAtlasEntityToolManifest,
      sourceObjects: new Set(sources.map(s => s.name)), permissions: new Set((await catalog(plane)).map(p => p.code)),
      handlers: new Set(["platform.activity.v1", ...Object.values(ACTIVITY_ACTIONS).map(action => action.handlerKey), "entity.record.list.v1", "entity.record.read.v1", "entity.record.create.v1", "entity.record.patch.v1", "entity.record.export.v1", "platform.notifications.preferences.v1", "platform.experience.ui_profile.v1", "platform.comments.v1", "platform.attachments.v1",
        ...["read", "create", "update_own", "archive_own", "reply", "react", "draft", "flag", "mention", "history"].map(a => `platform.comments.${a}.v1`),
        ...["read", "create", "finalize", "download", "archive", "status", "version", "rename", "category", "folder", "unlink", "preview", "extract", "search"].map(a => `platform.attachments.${a}.v1`)]),
      renderers: new Set(["platform.comments.v1", "platform.attachments.v1", "platform.activity.v1", "platform.address.fields.v1"]),
      resolvers: new Set(["tenant.record.v1", "platform.records.admission.v1"]), evaluators: new Set() };
  }
  async function lower(source: CompiledRuntimeSource) {
    const saved = await persisted(source.releaseId, source.plane);
    const { recoveryEvidence: _recovery, ...originalSource } = saved;
    const { recoveryEvidence: _providedRecovery, ...providedSource } = source as typeof saved;
    if (sha256(originalSource) !== sha256(providedSource)) throw Error("COMPILED_PUBLICATION_SOURCE_CHANGED");
    const graph = saved.contract as unknown as MetaEntityGraph;
    const target = compileSystemEntityTarget(graph, saved.plane);
    if (sha256(target.artifact.descriptor) !== saved.sourceDescriptorHash || compileGraph(graph).contractHash !== saved.sourceContractHash)
      throw Error("COMPILED_PUBLICATION_TARGET_SOURCE_MISMATCH");
    await qualifyReferencePublicationTarget(target, options.targets());
    const profile = target.graph.runtimeProfiles![0]!;
    return lowerNativeRuntimePublication(saved, { registration: {
      entityCode: saved.entityCode, plane: saved.plane,
      storage: { schema: profile.storageSchema!, object: profile.storageObject!, idField: "id",
        ...(profile.tenantFieldKey ? {tenantField:profile.tenantFieldKey} : {}),
        ...(profile.recordVersionFieldKey ? {versionField:profile.recordVersionFieldKey} : {}),
        ...(target.graph.fields.some(field => field.fieldKey === "status") ? {statusField:"status"} : {}), },
      columns: target.graph.fields.filter(f => f.status !== "deprecated").map(f => f.storagePath!),
      detailRouteTemplate: `/app/entity/${saved.entityCode}/:recordId`,
    }, permissions: await catalog(saved.plane) });
  }
  return { lower, registry, async qualify(input) {
    const source = await persisted(input.releaseId, input.plane);
    if (source.publicationKey !== input.publicationKey || source.revisionId !== input.sourceRevisionId
      || source.sourceContractHash !== input.sourceContractHash || source.sourceDescriptorHash !== input.sourceDescriptorHash
      || JSON.stringify(source.expectedPredecessor ?? null) !== JSON.stringify(input.expectedPredecessor ?? null))
      throw Error("COMPILED_PUBLICATION_SOURCE_PIN_MISMATCH");
    if (source.expectedPredecessor) await assertSuccessorTargetHeads([source.expectedPredecessor], options.targets().databases);
    const lowered = await lower(source);
    const compilation = compileCompiledEntityArtifacts({ ...lowered, registry: await registry(input.plane),
      canonicalizer: { ...canonical, sha256: bytes => `sha256:${canonical.sha256(bytes)}` } });
    const expected = compiledEntityRuntimeProjection(compilation, source.generatedAt, source.entityCode);
    if (sha256(expected) !== sha256(input.projection)) throw Error("COMPILED_PUBLICATION_PROJECTION_SOURCE_MISMATCH");
    // Deterministic qualification digest, not a fabricated human approval or
    // persisted audit receipt. Persisted approval is reread above each time.
    return { receiptSha256: sha256({ schema: "athyper.runtime-publication-qualification/1", releaseId: source.releaseId,
      revisionId: source.revisionId, plane: source.plane, contractHash: source.sourceContractHash,
      descriptorHash: source.sourceDescriptorHash, projectionHash: sha256(expected),
      ...(source.recoveryEvidence ? { compilationRecovery: source.recoveryEvidence } : {}) }) };
  } };
}
