import {
  assertLocalPublicationRequest,
  type LocalPublicationRequest,
} from "@athyper/server-contract-publication";
import { resolveLocalPublicationAuthority } from "./local-publication-policy.js";
import { findNativeCompilationRecovery } from "./native-compilation-recovery-authority.js";
import { ACTIVITY_ACTIONS } from "@athyper/server-contract-publication";
import { resolveAtlasEntityToolManifest } from "@athyper/server-platform-ai";
import {
  canonicalBytes,
  sha256 as hashBytes,
} from "@athyper/server-adapter-publication-signing";
import { sql, type Kysely } from "kysely";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type {
  CompiledEntityRegistry,
  PublicationPlane,
} from "@athyper/server-contract-publication";
import { parseDevEntitySuccessorPolicy } from "@athyper/server-contract-publication";
import {
  assertPublicationCompilerIdentity,
  publicationCompilerIdentity,
} from "./compiler-build.js";
import { findCompilationRecovery } from "./compilation-recovery-authority.js";
import { assertSuccessorTargetHeads } from "./successor-targets.js";
import {
  compileNativePublication,
  nativePublicationTargets,
  compileGraph,
  compileSystemEntityTarget,
  sha256,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  lowerNativeRuntimePublication,
  compileCompiledEntityArtifacts,
  compiledEntityRuntimeProjection,
  type CompiledRuntimePublication,
  type CompiledRuntimeSource,
} from "@athyper/server-service-publication";
import {
  qualifyNativeReferencePublicationTarget,
  qualifyReferencePublicationTarget,
} from "./target-qualification.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";
import { parseHumanReviewedExecutionPolicy } from "./human-publication-policy.js";

type Database = Kysely<Record<string, never>>;
type SourceRow = {
  publication_release_id: string;
  release_key: string;
  release_no: string | number;
  source_tenant_id: string | null;
  revision_id: string;
  entity_code: string;
  source_entity_id: string;
  source_release_hash: string;
  contract_json: MetaEntityGraph;
  compiled_json: Record<string, unknown>;
  plane_key: PublicationPlane;
  created_at: Date | string;
  target_planes: PublicationPlane[];
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
  nativeSource?: ReturnType<
    typeof import("../../control-plane/native-review-source.js").createNativeReviewSource
  >;
  authority: Database;
  configuration: PublicationWorkloadConfiguration;
  targets(): Parameters<typeof qualifyReferencePublicationTarget>[1];
}): CompiledRuntimePublication {
  const configuration = structuredClone(options.configuration);
  if (
    configuration.environment !== "local" ||
    configuration.instance !== "dev" ||
    configuration.domainSuffix !== "dev.athyper.test"
  )
    throw Error("PUBLICATION_WORKLOAD_DEV_ONLY");

  async function persisted(
    releaseId: string,
    plane: PublicationPlane,
  ): Promise<
    CompiledRuntimeSource & {
      localBasis?: boolean;
      recoveryEvidence?: unknown;
      humanTargets?: ReturnType<typeof nativePublicationTargets>;
    }
  > {
    return options.authority
      .transaction()
      .setIsolationLevel("repeatable read")
      .execute(async (tx) => {
        // Installed native resolution takes source/head locks; it performs no writes.
        if (!options.nativeSource)
          await sql`SET TRANSACTION READ ONLY`.execute(tx);
        await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${configuration.tenantId},true),
        set_config('app.current_principal_id',${configuration.publisher.principalId},true)`.execute(
          tx,
        );
        const principals = (
          await sql`SELECT id FROM master.principal WHERE tenant_id=${configuration.tenantId}::uuid
        AND id=${configuration.publisher.principalId}::uuid AND code=${configuration.publisher.code}
        AND principal_type='service_account' AND status='active' AND auth_epoch=${configuration.publisher.authEpoch}`.execute(
            tx,
          )
        ).rows;
        if (principals.length !== 1)
          throw Error("PUBLICATION_WORKLOAD_REVOKED");
        // SECURITY DEFINER function enforces authority tenant, approved snapshot,
        // maker/checker separation and immutable target descriptor hashes.
        const rows = (
          await sql<SourceRow>`SELECT * FROM publication.fn_compiled_entity_compilation_source_v4(${releaseId}::uuid)`.execute(
            tx,
          )
        ).rows;
        const row = rows.find((r) => r.plane_key === plane);
        if (
          !row ||
          rows.length !== row.target_planes.length ||
          new Set(rows.map((r) => r.plane_key)).size !== rows.length ||
          row.target_planes.some((p) => !rows.some((r) => r.plane_key === p)) ||
          row.source_tenant_id !== null ||
          rows.some(
            (r) =>
              r.publication_release_id !== releaseId ||
              r.revision_id !== row.revision_id ||
              r.entity_code !== row.entity_code ||
              r.source_entity_id !== row.source_entity_id ||
              r.source_release_hash !== row.source_release_hash ||
              r.release_key !== row.release_key ||
              sha256(r.contract_json) !== sha256(row.contract_json),
          )
        )
          throw Error("COMPILED_PUBLICATION_APPROVED_SOURCE_REQUIRED");
        const human =
          (
            await sql<{
              human: boolean;
            }>`SELECT metadata ? 'humanExecutionPolicy' AS human
        FROM publication.release WHERE id=${releaseId}::uuid`.execute(tx)
          ).rows[0]?.human === true;
        const local =
          (
            await sql<{
              local: boolean;
            }>`SELECT metadata->>'approvalBasis'='local_development_authority' AS local FROM publication.release WHERE id=${releaseId}::uuid`.execute(
              tx,
            )
          ).rows[0]?.local === true;
        let localRequest: LocalPublicationRequest | undefined;
        let localTargets:
          ReturnType<typeof nativePublicationTargets> | undefined;
        if (local) {
          if (!configuration.localAuthority || !options.nativeSource)
            throw Error("LOCAL_PUBLICATION_AUTHORITY_NOT_CONFIGURED");
          const execution = (
            await sql<{
              value: { request: LocalPublicationRequest };
            }>`SELECT publication.local_publication_execution_context(${releaseId}::uuid) value`.execute(
              tx,
            )
          ).rows[0]?.value;
          if (!execution?.request?.inputs.release)
            throw Error("LOCAL_PUBLICATION_RELEASE_PINS_REQUIRED");
          localRequest = execution.request;
          await sql`SELECT set_config('app.local_publication_request_hash',${localRequest.hash},true)`.execute(
            tx,
          );
          const currentAuthority = await resolveLocalPublicationAuthority({
            transaction: tx,
            context: {
              tenantId: configuration.tenantId,
              principalId: configuration.publisher.principalId,
              planeKey: "studio",
            },
            pin: configuration.localAuthority,
          });
          const resolved = await options.nativeSource(
            tx,
            localRequest.inputs.changeSetId,
          );
          const compiled = compileNativePublication(resolved);
          localTargets = nativePublicationTargets(resolved.graph, compiled);
          assertLocalPublicationRequest(
            localRequest,
            currentAuthority,
            {
              ...localRequest.admission,
              host: {
                environment: configuration.environment,
                instance: configuration.instance,
                domainSuffix: configuration.domainSuffix,
              },
            },
            {
              ...localRequest.inputs,
              sourceHash: compiled.contractHash,
              compilerHash: publicationCompilerIdentity().buildHash,
              release: {
                ...localRequest.inputs.release!,
                descriptorHash: compiled.descriptorHash,
              },
              resourceHashes: [
                ...new Set(
                  (resolved.targetCompilers ?? [resolved.compiler]).map((c) =>
                    sha256(c),
                  ),
                ),
              ].sort(),
              targets: localRequest.inputs.targets.map((t) => ({
                ...t,
                artifactHash:
                  localTargets!.find((x) => x.targetPlane === t.plane)?.artifact
                    .descriptorHash ?? "",
              })),
            },
          );
          if (
            compiled.contractHash !== sha256(row.contract_json) ||
            compiled.descriptorHash !==
              localRequest.inputs.release!.descriptorHash
          )
            throw Error("LOCAL_PUBLICATION_SIGNED_SOURCE_CHANGED");
        }
        const execution = human
          ? (
              await sql<{
                execution: {
                  policy: unknown;
                  coordinationHash: string;
                  sources: { changeSetId: string; graph: MetaEntityGraph }[];
                } | null;
              }>`SELECT publication.fn_human_execution_context(${releaseId}::uuid) execution`.execute(
                tx,
              )
            ).rows[0]?.execution
          : undefined;
        if (human && !execution)
          throw Error("HUMAN_PUBLICATION_EXECUTION_CONTEXT_REQUIRED");
        let humanTargets:
          ReturnType<typeof nativePublicationTargets> | undefined;
        let recoveryEvidence: unknown;
        let humanSourceDescriptorHash: string | undefined;
        if (execution) {
          const policy = parseHumanReviewedExecutionPolicy(execution.policy);
          if (
            policy.compiler.buildHash !==
            publicationCompilerIdentity().buildHash
          ) {
            const contextPin = (
              await sql<{
                id: string;
              }>`SELECT metadata->>'executionPolicyId' id FROM publication.release WHERE id=${releaseId}::uuid`.execute(
                tx,
              )
            ).rows[0]?.id;
            if (!contextPin)
              throw Error("NATIVE_COMPILATION_RECOVERY_ORIGINAL_REQUIRED");
            const recovery = await findNativeCompilationRecovery(
              tx,
              configuration,
              contextPin,
            );
            if (
              !recovery ||
              sha256(recovery.original) !== sha256(policy) ||
              !recovery.policy.releases.some((r) => r.releaseId === releaseId)
            )
              throw Error(
                "NATIVE_COMPILATION_RECOVERY_EXACT_AUTHORITY_REQUIRED",
              );
            recoveryEvidence = {
              ...recovery.pin,
              compilerHash: recovery.policy.compiler.buildHash,
              originalPolicy: recovery.policy.originalPolicy,
            };
          } else assertPublicationCompilerIdentity(policy.compiler);
          if (
            policy.authorityTenantId !== configuration.tenantId ||
            policy.publisherPrincipalId !==
              configuration.publisher.principalId ||
            sha256(policy.plan) !== execution.coordinationHash ||
            !Array.isArray(execution.sources) ||
            execution.sources.length !== policy.plan.members.length ||
            new Set(execution.sources.map((s) => s.changeSetId)).size !==
              execution.sources.length
          )
            throw Error("HUMAN_PUBLICATION_EXECUTION_CONTEXT_CHANGED");
          humanTargets = [];
          for (const member of policy.plan.members) {
            const graph = execution.sources.find(
              (s) => s.changeSetId === member.changeSetId,
            )?.graph;
            if (!graph || !options.nativeSource)
              throw Error("NATIVE_PUBLICATION_HOST_NOT_CONFIGURED");
            const resolved = await options.nativeSource(tx, member.changeSetId);
            const compiled = compileNativePublication(resolved);
            if (
              sha256(graph) !== compiled.contractHash ||
              compiled.contractHash !== member.contractHash ||
              compiled.descriptorHash !== member.descriptorHash
            )
              throw Error("HUMAN_PUBLICATION_GROUP_SOURCE_CHANGED");
            if (member.entityId === row.source_entity_id)
              humanSourceDescriptorHash = compiled.descriptorHash;
            const targetPin = member.targets.find((t) => t.plane === plane);
            if (!targetPin) continue;
            const target = nativePublicationTargets(
              resolved.graph,
              compiled,
            ).find((t) => t.targetPlane === plane);
            if (
              !target ||
              target.artifact.contractHash !== targetPin.contractHash ||
              target.artifact.descriptorHash !== targetPin.descriptorHash
            )
              throw Error("HUMAN_PUBLICATION_GROUP_TARGET_CHANGED");
            humanTargets.push(target);
          }
          if (
            !policy.plan.members.some(
              (m) =>
                m.entityId === row.source_entity_id &&
                m.contractHash === sha256(row.contract_json),
            )
          )
            throw Error("HUMAN_PUBLICATION_GROUP_MEMBER_REQUIRED");
        }
        const successor =
          Number(row.release_no) > 1 && !localRequest
            ? parseDevEntitySuccessorPolicy(row.successor_policy)
            : undefined;
        if (
          successor &&
          !humanTargets &&
          successor.compiler.buildHash !==
            publicationCompilerIdentity().buildHash
        ) {
          const recovery = await findCompilationRecovery(
            options.authority,
            configuration,
            releaseId,
          );
          if (sha256(recovery.graph) !== sha256(row.contract_json))
            throw Error("COMPILATION_RECOVERY_GRAPH_CHANGED");
          recoveryEvidence = recovery.evidence;
        } else if (successor && !humanTargets)
          assertPublicationCompilerIdentity(successor.compiler);
        const expectedPredecessor =
          localRequest?.inputs.targets.find((t) => t.plane === plane)
            ?.predecessor ?? successor?.targets.find((t) => t.plane === plane);
        if (
          successor &&
          (!expectedPredecessor ||
            successor.authorityTenantId !== configuration.tenantId ||
            successor.entityId !== row.source_entity_id ||
            successor.contractHash !== sha256(row.contract_json) ||
            successor.descriptorHash !==
              (humanTargets
                ? humanSourceDescriptorHash
                : compileGraph(row.contract_json).descriptorHash))
        )
          throw Error("COMPILED_PUBLICATION_SUCCESSOR_SOURCE_MISMATCH");
        return {
          releaseId,
          releaseNo: Number(row.release_no),
          publicationKey: row.release_key,
          plane,
          tenantId: null,
          entityCode: row.entity_code,
          revisionId: row.revision_id,
          sourceEntityId: row.source_entity_id,
          sourceReleaseHash: row.source_release_hash,
          sourceContractHash: sha256(row.contract_json),
          sourceDescriptorHash: sha256(row.compiled_json),
          generatedAt: new Date(row.created_at).toISOString(),
          native: row.compiled_json,
          contract: row.contract_json as unknown as Record<string, unknown>,
          ...(expectedPredecessor ? { expectedPredecessor } : {}),
          ...(recoveryEvidence ? { recoveryEvidence } : {}),
          ...(localTargets
            ? { humanTargets: localTargets, localBasis: true }
            : {}),
          ...(execution
            ? { coordinationHash: execution.coordinationHash, humanTargets }
            : {}),
        };
      });
  }
  async function catalog(plane: PublicationPlane) {
    const db = options.targets().databases[plane];
    if (!db) throw Error("PUBLICATION_TARGET_DATABASE_UNAVAILABLE");
    return (
      await sql<{
        id: string;
        kind: string;
        code: string;
        scopeKinds: string[];
      }>`SELECT p.id, p.permission_kind::text kind, p.canonical_code code,
      array_agg(DISTINCT s.scope_kind::text ORDER BY s.scope_kind::text) AS "scopeKinds"
      FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id AND s.status='active'
      WHERE p.status='published' GROUP BY p.id,p.permission_kind,p.canonical_code`.execute(
        db,
      )
    ).rows;
  }
  async function registry(
    plane: PublicationPlane,
  ): Promise<CompiledEntityRegistry> {
    const db = options.targets().databases[plane];
    if (!db) throw Error("PUBLICATION_TARGET_DATABASE_UNAVAILABLE");
    const sources = (
      await sql<{
        name: string;
      }>`SELECT table_schema||'.'||table_name name FROM information_schema.tables
      WHERE table_schema IN ('shared','master') AND table_type='BASE TABLE'`.execute(
        db,
      )
    ).rows;
    // Closed host implementation vocabulary, not caller-provided registry keys.
    // qualifyReferencePublicationTarget separately proves installed callables,
    // capability methods and infrastructure at compile/sign/dispatch.
    return {
      resolveAiToolManifest: resolveAtlasEntityToolManifest,
      sourceObjects: new Set(sources.map((s) => s.name)),
      permissions: new Set((await catalog(plane)).map((p) => p.code)),
      handlers: new Set([
        "platform.activity.v1",
        ...Object.values(ACTIVITY_ACTIONS).map((action) => action.handlerKey),
        "entity.record.list.v1",
        "entity.record.read.v1",
        "entity.record.create.v1",
        "entity.record.patch.v1",
        "entity.record.export.v1",
        "platform.notifications.preferences.v1",
        "platform.experience.ui_profile.v1",
        "platform.comments.v1",
        "platform.attachments.v1",
        ...[
          "read",
          "create",
          "update_own",
          "archive_own",
          "reply",
          "react",
          "draft",
          "flag",
          "mention",
          "history",
        ].map((a) => `platform.comments.${a}.v1`),
        ...[
          "read",
          "create",
          "finalize",
          "download",
          "archive",
          "status",
          "version",
          "rename",
          "category",
          "folder",
          "unlink",
          "preview",
          "extract",
          "search",
        ].map((a) => `platform.attachments.${a}.v1`),
      ]),
      renderers: new Set([
        // Shared list/detail text renderer; native source loading separately
        // verifies the approved component and deployed renderer evidence.
        "text",
        "platform.comments.v1",
        "platform.attachments.v1",
        "platform.activity.v1",
        "platform.address.fields.v1",
      ]),
      resolvers: new Set(["tenant.record.v1", "platform.records.admission.v1"]),
      evaluators: new Set(),
    };
  }
  async function lower(source: CompiledRuntimeSource) {
    const saved = await persisted(source.releaseId, source.plane);
    const {
      localBasis: _localBasis,
      recoveryEvidence: _recovery,
      humanTargets: _targets,
      ...originalSource
    } = saved;
    const {
      localBasis: _providedLocalBasis,
      recoveryEvidence: _providedRecovery,
      humanTargets: _providedTargets,
      ...providedSource
    } = source as typeof saved;
    if (sha256(originalSource) !== sha256(providedSource))
      throw Error("COMPILED_PUBLICATION_SOURCE_CHANGED");
    const graph = saved.contract as unknown as MetaEntityGraph;
    if (saved.humanTargets) {
      const target = saved.humanTargets.find(
        (t) =>
          t.graph.entity.entityCode === saved.entityCode &&
          t.targetPlane === saved.plane,
      );
      if (
        !target ||
        target.sourceContractHash !== saved.sourceContractHash ||
        target.artifact.descriptorHash !== saved.sourceDescriptorHash
      )
        throw Error("COMPILED_PUBLICATION_TARGET_SOURCE_MISMATCH");
      await qualifyNativeReferencePublicationTarget(
        target,
        options.targets(),
        saved.humanTargets.filter(
          (candidate) => candidate.targetPlane === saved.plane,
        ),
      );
      const profile = (
        target.artifact.descriptor.runtimeProfiles as {
          storageSchema: string;
          storageObject: string;
          idFieldKey: string;
          tenantFieldKey?: string;
          recordVersionFieldKey?: string;
        }[]
      )[0]!;
      const fields = target.artifact.descriptor.fields as {
        fieldKey: string;
        storagePath: string;
      }[];
      const column = (key: string) => {
        const matches = fields.filter((f) => f.fieldKey === key);
        if (matches.length !== 1)
          throw Error("NATIVE_PUBLICATION_STORAGE_FIELD_REQUIRED");
        return matches[0]!.storagePath;
      };
      return lowerNativeRuntimePublication(saved, {
        registration: {
          entityCode: saved.entityCode,
          plane: saved.plane,
          storage: {
            schema: profile.storageSchema,
            object: profile.storageObject,
            idField: column(profile.idFieldKey),
            ...(profile.tenantFieldKey
              ? { tenantField: column(profile.tenantFieldKey) }
              : {}),
            ...(profile.recordVersionFieldKey
              ? { versionField: column(profile.recordVersionFieldKey) }
              : {}),
          },
          columns: fields.map((f) => f.storagePath),
          detailRouteTemplate: `/app/entity/${saved.entityCode}/:recordId`,
        },
        permissions: await catalog(saved.plane),
      });
    }
    const target = compileSystemEntityTarget(graph, saved.plane);
    if (
      sha256(target.artifact.descriptor) !== saved.sourceDescriptorHash ||
      compileGraph(graph).contractHash !== saved.sourceContractHash
    )
      throw Error("COMPILED_PUBLICATION_TARGET_SOURCE_MISMATCH");
    await qualifyReferencePublicationTarget(target, options.targets());
    const profile = target.graph.runtimeProfiles![0]!;
    return lowerNativeRuntimePublication(saved, {
      registration: {
        entityCode: saved.entityCode,
        plane: saved.plane,
        storage: {
          schema: profile.storageSchema!,
          object: profile.storageObject!,
          idField: "id",
          ...(profile.tenantFieldKey
            ? { tenantField: profile.tenantFieldKey }
            : {}),
          ...(profile.recordVersionFieldKey
            ? { versionField: profile.recordVersionFieldKey }
            : {}),
          ...(target.graph.fields.some((field) => field.fieldKey === "status")
            ? { statusField: "status" }
            : {}),
        },
        columns: target.graph.fields
          .filter((f) => f.status !== "deprecated")
          .map((f) => f.storagePath!),
        detailRouteTemplate: `/app/entity/${saved.entityCode}/:recordId`,
      },
      permissions: await catalog(saved.plane),
    });
  }
  return {
    predecessor: async (releaseId, plane) =>
      (await persisted(releaseId, plane)).expectedPredecessor,
    lower,
    registry,
    async qualify(input) {
      const source = await persisted(input.releaseId, input.plane);
      if (
        source.publicationKey !== input.publicationKey ||
        source.revisionId !== input.sourceRevisionId ||
        source.sourceContractHash !== input.sourceContractHash ||
        source.sourceDescriptorHash !== input.sourceDescriptorHash ||
        sha256(source.expectedPredecessor ?? null) !==
          sha256(input.expectedPredecessor ?? null) ||
        source.coordinationHash !== input.coordinationHash
      )
        throw Error("COMPILED_PUBLICATION_SOURCE_PIN_MISMATCH");
      if (source.expectedPredecessor) {
        const signed = source.localBasis
          ? (
              await sql<{
                content_hash: string;
              }>`SELECT content_hash FROM publication.artifact
          WHERE publication_release_id=${source.releaseId}::uuid AND plane_code=${source.plane}
          AND artifact_kind='compiled_entity_runtime' AND status='signed'`.execute(
                options.authority,
              )
            ).rows
          : [];
        if (signed.length > 1)
          throw Error("LOCAL_PUBLICATION_SIGNED_ARTIFACT_AMBIGUOUS");
        await assertSuccessorTargetHeads(
          [source.expectedPredecessor],
          options.targets().databases,
          signed[0]
            ? {
                releaseId: source.releaseId,
                releaseNo: source.releaseNo,
                artifactHash: signed[0].content_hash,
              }
            : undefined,
        );
      }
      const lowered = await lower(source);
      const compilation = compileCompiledEntityArtifacts({
        ...lowered,
        registry: await registry(input.plane),
        canonicalizer: {
          ...canonical,
          sha256: (bytes) => `sha256:${canonical.sha256(bytes)}`,
        },
      });
      const expected = compiledEntityRuntimeProjection(
        compilation,
        source.generatedAt,
        source.entityCode,
      );
      if (sha256(expected) !== sha256(input.projection))
        throw Error("COMPILED_PUBLICATION_PROJECTION_SOURCE_MISMATCH");
      // Deterministic qualification digest, not a fabricated human approval or
      // persisted audit receipt. Persisted approval is reread above each time.
      return {
        receiptSha256: sha256({
          schema: "athyper.runtime-publication-qualification/1",
          releaseId: source.releaseId,
          revisionId: source.revisionId,
          plane: source.plane,
          contractHash: source.sourceContractHash,
          descriptorHash: source.sourceDescriptorHash,
          projectionHash: sha256(expected),
          ...(source.recoveryEvidence
            ? { compilationRecovery: source.recoveryEvidence }
            : {}),
        }),
      };
    },
  };
}
