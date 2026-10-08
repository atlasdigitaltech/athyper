import { sql, type Kysely } from "kysely";
import type {
  AuthoringPlane,
  MetaEntityGraph,
  ExpandedNativeMetaEntityGraph,
  SignedMetaEntityArtifact,
} from "@athyper/server-contract-meta-entity-authoring";
import { nativePublicationTargets } from "./native-publication-targets.js";
import { compileGraph, sha256 } from "../deterministic.js";
import { compileSystemEntityTarget } from "../compilation/entity-target-compiler.js";

interface Source {
  contract_json: MetaEntityGraph;
  revision_id: string;
  entity_id: string;
  entity_code: string;
  change_set_id: string;
  release_no: number;
  release_hash: string;
  contract_hash: string;
  target_planes: AuthoringPlane[];
  contract_signature: string;
  signature_algorithm: string;
  signing_key_id: string;
  published_by: string;
  approved_by: string;
  authority_tenant_id: string;
}

/** Runs inside createRelease's transaction. Links one approved global snapshot
 * to immutable target compilation sources; does NOT activate a runtime or issue
 * permission grants. Authority tenant owns publication work, not reference data. */
export async function prepareSystemReferenceRelease(
  db: Kysely<Record<string, never>>,
  input: {
    releaseId: string;
    artifact: SignedMetaEntityArtifact;
    targetPlanes: readonly string[];
  },
): Promise<boolean> {
  const native = input.artifact.compiler?.version === "native-reference/1";
  const surfaces = input.artifact.descriptor.surfaces;
  if (
    !native &&
    (!Array.isArray(surfaces) ||
      !surfaces.some(
        (s) =>
          s?.layoutConfig?.systemReferenceProduct !== undefined ||
          s?.layoutConfig?.tableEntityProduct !== undefined,
      ))
  )
    return false;
  if (!db.isTransaction)
    throw Error("SYSTEM_REFERENCE_RELEASE_TRANSACTION_REQUIRED");
  const humanSourceAvailable = (
    await sql<{ available: boolean }>`SELECT
    to_regprocedure('publication.fn_human_publication_preparation_source(uuid)') IS NOT NULL available`.execute(
      db,
    )
  ).rows[0]?.available;
  const humanSource = humanSourceAvailable
    ? (
        await sql<{ source: Source | null }>`SELECT
    publication.fn_human_publication_preparation_source(${input.releaseId}::uuid) source`.execute(
          db,
        )
      ).rows[0]?.source
    : null;
  const rows = humanSource
    ? [humanSource]
    : (
        await sql<Source>`SELECT s.contract_json,r.revision_id,r.entity_id,e.entity_code,r.change_set_id,r.release_no,
      r.release_hash,r.contract_hash,r.target_planes,r.contract_signature,r.signature_algorithm,r.signing_key_id,r.published_by,
      c.approved_by,p.tenant_id authority_tenant_id
    FROM metadata.entity_release r
    JOIN metadata.entity e ON e.id=r.entity_id AND e.tenant_id IS NOT DISTINCT FROM r.tenant_id
    JOIN metadata.entity_change_set c ON c.id=r.change_set_id AND c.entity_id=r.entity_id AND c.tenant_id IS NOT DISTINCT FROM r.tenant_id
    JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.change_set_id=c.id AND s.entity_id=r.entity_id AND s.tenant_id IS NOT DISTINCT FROM r.tenant_id
    JOIN master.principal p ON p.id=r.published_by AND p.tenant_id=shared.current_tenant_id() AND p.status='active'
    JOIN master.principal reviewer ON reviewer.id=c.approved_by AND reviewer.tenant_id=p.tenant_id AND reviewer.status='active'
    WHERE r.id=${input.releaseId}::uuid AND r.tenant_id IS NULL AND r.release_kind='publish'
      AND r.published_by=master.current_principal_id_soft() AND e.entity_class IN ('reference','business','configuration') AND e.ownership_model='system'
      AND c.status IN ('approved','published') AND s.validation_status='valid'
      AND c.submitted_by IS NOT NULL AND c.approved_by<>c.created_by AND c.approved_by<>c.submitted_by`.execute(
          db,
        )
      ).rows;
  if (rows.length !== 1)
    throw Error("SYSTEM_REFERENCE_APPROVED_SOURCE_REQUIRED");
  const source = rows[0]!;
  if (
    native &&
    (source.contract_hash !== input.artifact.contractHash ||
      source.release_hash !== input.artifact.descriptorHash)
  )
    throw Error("SYSTEM_REFERENCE_SIGNED_SOURCE_MISMATCH");
  const nativeGraph =
    source.contract_json as unknown as ExpandedNativeMetaEntityGraph;
  const nativeTargets = native
    ? nativePublicationTargets(nativeGraph, input.artifact)
    : undefined;
  const compiled = native
    ? {
        ...input.artifact,
        contractHash: sha256(source.contract_json),
        descriptorHash: sha256(input.artifact.descriptor),
      }
    : compileGraph(source.contract_json);
  if (
    compiled.contractHash !== input.artifact.contractHash ||
    compiled.descriptorHash !== input.artifact.descriptorHash ||
    sha256(compiled.descriptor) !== sha256(input.artifact.descriptor) ||
    source.contract_signature !== input.artifact.signature ||
    !source.contract_signature ||
    source.signature_algorithm !== "Ed25519" ||
    input.artifact.signatureAlgorithm !== "Ed25519" ||
    source.signing_key_id !== input.artifact.signingKeyId ||
    !source.signing_key_id
  )
    throw Error("SYSTEM_REFERENCE_SIGNED_SOURCE_MISMATCH");
  const samePlanes = (a: readonly string[], b: readonly string[]) =>
    new Set(a).size === a.length &&
    [...a].sort().join() === [...b].sort().join();
  const targets =
    nativeTargets ??
    source.target_planes.map((plane) =>
      compileSystemEntityTarget(source.contract_json, plane),
    );
  const marker = native
    ? {
        targetPlanes: nativeTargets!.map((t) => t.targetPlane),
        productHash: compiled.contractHash,
      }
    : (source.contract_json
        .surfaces!.map(
          (s) =>
            s.layoutConfig?.systemReferenceProduct ??
            s.layoutConfig?.tableEntityProduct,
        )
        .find(Boolean) as { targetPlanes: string[]; productHash: string });
  if (
    !samePlanes(source.target_planes, marker.targetPlanes) ||
    !samePlanes(input.targetPlanes, source.target_planes)
  )
    throw Error("SYSTEM_REFERENCE_RELEASE_TARGET_MISMATCH");
  const table = native
    ? nativeGraph.entity.entityClass !== "reference"
    : source.contract_json.surfaces?.some(
        (surface) => surface.layoutConfig?.tableEntityProduct !== undefined,
      );
  const key = `metadata.${table ? "entity" : "reference"}.${source.entity_code}`;
  const successorPolicy =
    Number(source.release_no) > 1
      ? (
          await sql<{
            policy: unknown;
          }>`SELECT publication.fn_system_entity_successor_policy(${input.releaseId}::uuid) policy`.execute(
            db,
          )
        ).rows[0]?.policy
      : undefined;
  if (Number(source.release_no) > 1 && !successorPolicy)
    throw Error("ENTITY_SUCCESSOR_POLICY_REQUIRED");
  const executionMetadataAvailable = (
    await sql<{ available: boolean }>`SELECT
    to_regprocedure('publication.fn_system_entity_execution_metadata(uuid)') IS NOT NULL available`.execute(
      db,
    )
  ).rows[0]?.available;
  const humanExecution = executionMetadataAvailable
    ? ((
        await sql<{
          metadata: Record<string, unknown>;
        }>`SELECT publication.fn_system_entity_execution_metadata(
    ${input.releaseId}::uuid) metadata`.execute(db)
      ).rows[0]?.metadata ?? {})
    : {};
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`.execute(
    db,
  );
  const conflict = (
    await sql`SELECT p.id FROM publication.release p
    JOIN publication.entity_release_link l ON l.publication_release_id=p.id
    JOIN metadata.entity_release r ON r.id=l.entity_release_id
    WHERE p.release_key=${key} AND (r.entity_id<>${source.entity_id}::uuid OR r.tenant_id IS NOT NULL)`.execute(
      db,
    )
  ).rows;
  if (conflict.length)
    throw Error("SYSTEM_REFERENCE_PUBLICATION_IDENTITY_CONFLICT");
  // No ON CONFLICT overwrite: immutable sources and release coordinates must
  // either commit together or roll back. Redispatch uses the existing release.
  for (const target of targets) {
    const descriptor = JSON.stringify(target.artifact.descriptor);
    const compliance = JSON.stringify({
      schema: native
        ? "athyper.native-entity-compilation-source/1"
        : table
          ? "athyper.table-entity-compilation-source/1"
          : "athyper.system-reference-compilation-source/1",
      productHash: marker.productHash,
      sourceContractHash: compiled.contractHash,
      sourceDescriptorHash: compiled.descriptorHash,
      targetDescriptorHash: target.artifact.descriptorHash,
    });
    await sql`SELECT publication.fn_store_system_entity_artifact(${input.releaseId}::uuid,
      ${target.targetPlane},${descriptor}::jsonb,${compliance}::jsonb)`.execute(
      db,
    );
  }
  await sql`INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by,metadata)
    VALUES(${input.releaseId}::uuid,${source.authority_tenant_id}::uuid,${key},${source.release_no},'publish','preparing','backward_compatible',${source.release_hash},${source.release_hash},${source.published_by}::uuid,
      ${JSON.stringify({
        schema: native
          ? "athyper.native-entity-publication/1"
          : table
            ? "athyper.table-entity-publication/1"
            : "athyper.system-reference-publication/1",
        artifactKind: "compiled_entity_runtime",
        sourceTenantId: null,
        sourceContractHash: compiled.contractHash,
        sourceDescriptorHash: compiled.descriptorHash,
        productHash: marker.productHash,
        ...(successorPolicy ? { successorPolicy } : {}),
        ...humanExecution,
      })}::jsonb)`.execute(db);
  await sql`SELECT publication.fn_link_system_entity_release(${input.releaseId}::uuid)`.execute(
    db,
  );
  await sql`SELECT publication.fn_transition_release(${input.releaseId}::uuid,'approved',${source.approved_by}::uuid,NULL::uuid,
    ${JSON.stringify({ review: "meta-entity-change-set", changeSetId: source.change_set_id, sourceTenantId: null })}::jsonb)`.execute(
    db,
  );
  return true;
}
