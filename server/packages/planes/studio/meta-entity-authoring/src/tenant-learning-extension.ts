import { sql, type Kysely } from "kysely";
import type { VerifiedRequestContext, Authorizer } from "@athyper/server-contract-auth";
import type { AtlasLearningHandoff, EntityAiDescriptorV1 } from "@athyper/server-contract-metadata";
import { AuthoringConflictError, AuthoringPolicyError, type MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { compileGraph, sha256 } from "./deterministic.js";
import { compileEntityAi } from "./entity-ai.js";
import { cloneGraphIds } from "./graph-identity.js";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import { compileSystemEntityTarget } from "./compilation/entity-target-compiler.js";

type Database = Kysely<Record<string, never>>;
export interface ProductLearningSource {
  readonly sourceTenantId: null;
  readonly entityId: string;
  readonly entityCode: string;
  readonly moduleCode: string;
  readonly authoringReleaseId: string;
  readonly publicationReleaseId: string;
  readonly releaseNo: number;
  readonly releaseHash: string;
  readonly plane: "studio" | "neon" | "mesh";
  readonly contractHash: string;
  readonly descriptorHash: string;
  readonly graph: MetaEntityGraph;
  /** Approved native compiler output; consumer lowering remains publication-owned. */
  readonly descriptor: Readonly<Record<string, unknown>>;
}
export interface TenantLearningAncestry {
  readonly schema: "athyper.tenant-learning-ancestry/1";
  readonly tenantId: string;
  readonly entityCode: string;
  readonly plane: "studio" | "neon" | "mesh";
  readonly productEntityId: string;
  readonly productAuthoringReleaseId: string;
  readonly productPublicationReleaseId: string;
  readonly productReleaseNo: number;
  readonly productContractHash: string;
  readonly productDescriptorHash: string;
  /** Origin split-artifact hashes are distinct from native snapshot hashes. */
  readonly originContractHash: string;
  readonly originDescriptorHash: string;
  readonly proposalHash: string;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash = /^[a-f0-9]{64}$/;
const ancestryKeys = ["schema", "tenantId", "entityCode", "plane", "productEntityId", "productAuthoringReleaseId", "productPublicationReleaseId", "productReleaseNo", "productContractHash", "productDescriptorHash", "originContractHash", "originDescriptorHash", "proposalHash"].sort().join();

export function parseTenantLearningAncestry(value: unknown): TenantLearningAncestry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("TENANT_LEARNING_ANCESTRY_INVALID");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join() !== ancestryKeys || row.schema !== "athyper.tenant-learning-ancestry/1"
    || ![row.tenantId, row.productEntityId, row.productAuthoringReleaseId, row.productPublicationReleaseId].every(v => typeof v === "string" && uuid.test(v))
    || ![row.productContractHash, row.productDescriptorHash, row.originContractHash, row.originDescriptorHash, row.proposalHash].every(v => typeof v === "string" && hash.test(v))
    || typeof row.entityCode !== "string" || !/^[a-z][a-z0-9_]{1,62}$/.test(row.entityCode)
    || !["studio", "neon", "mesh"].includes(String(row.plane))
    || !Number.isSafeInteger(row.productReleaseNo) || Number(row.productReleaseNo) < 1)
    throw new TypeError("TENANT_LEARNING_ANCESTRY_INVALID");
  return structuredClone(row) as unknown as TenantLearningAncestry;
}

/** This is a source reader, not a grant or an approval. Global source visibility
 * is intentional; the authenticated tenant remains the extension owner. */
export async function readProductLearningSource(database: Database, proposal: AtlasLearningHandoff): Promise<ProductLearningSource | null> {
  const rows = (await sql<{
    entity_id: string; entity_code: string; module_code: string; authoring_release_id: string;
    publication_release_id: string; release_no: number; release_hash: string; contract_hash: string;
    compiled_hash: string; graph: MetaEntityGraph; descriptor: Record<string, unknown>;
    snapshot_hash_matches: boolean;
  }>`SELECT * FROM metadata.fn_product_learning_source(${proposal.sourceReleaseId}::uuid,${proposal.entityCode},${proposal.originPlane})`.execute(database)).rows;
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  if (!row.snapshot_hash_matches || row.graph.entity.entityCode !== proposal.entityCode) return null;
  const target = compileSystemEntityTarget(row.graph, proposal.originPlane);
  if (sha256(target.artifact.descriptor) !== sha256(row.descriptor)) return null;
  // Runtime split artifacts and SQL snapshot ledgers use different hashes.
  // Pin the canonical descriptor content independently of either ledger hash.
  return { sourceTenantId: null, entityId: row.entity_id, entityCode: row.entity_code, moduleCode: row.module_code,
    authoringReleaseId: row.authoring_release_id, publicationReleaseId: row.publication_release_id,
    releaseNo: Number(row.release_no), releaseHash: row.release_hash, plane: proposal.originPlane,
    contractHash: row.contract_hash, descriptorHash: sha256(row.descriptor), graph: row.graph, descriptor: row.descriptor };
}

export function tenantLearningAncestry(source: ProductLearningSource, proposal: AtlasLearningHandoff): TenantLearningAncestry {
  if (source.sourceTenantId !== null || source.entityCode !== proposal.entityCode || source.plane !== proposal.originPlane
    || source.graph.entity.entityCode !== source.entityCode || source.graph.entity.ownershipModel !== "system"
    || source.publicationReleaseId !== proposal.sourceReleaseId || sha256(source.descriptor) !== source.descriptorHash)
    throw new AuthoringConflictError("The product source changed or does not match this tenant correction");
  return parseTenantLearningAncestry({ schema: "athyper.tenant-learning-ancestry/1", tenantId: proposal.tenantId,
    entityCode: source.entityCode, plane: source.plane, productEntityId: source.entityId,
    productAuthoringReleaseId: source.authoringReleaseId, productPublicationReleaseId: source.publicationReleaseId,
    productReleaseNo: source.releaseNo, productContractHash: source.contractHash,
    productDescriptorHash: source.descriptorHash, originContractHash: proposal.sourceContractHash,
    originDescriptorHash: proposal.sourceDescriptorHash, proposalHash: proposal.proposalHash });
}

/** Assemble only vocabulary. The product descriptor's storage, handlers,
 * authorization, UI and AI admission policy remain byte-for-byte equivalent. */
export function compileTenantLearningDescriptor(input: {
  ancestry: TenantLearningAncestry; source: ProductLearningSource; tenantId: string;
  baselineGraph: MetaEntityGraph; candidateGraph: MetaEntityGraph;
}) {
  const pin = parseTenantLearningAncestry(input.ancestry), source = input.source;
  if (pin.tenantId !== input.tenantId || pin.entityCode !== source.entityCode || pin.plane !== source.plane
    || pin.productEntityId !== source.entityId || pin.productAuthoringReleaseId !== source.authoringReleaseId
    || pin.productPublicationReleaseId !== source.publicationReleaseId || pin.productReleaseNo !== source.releaseNo
    || pin.productContractHash !== source.contractHash || pin.productDescriptorHash !== source.descriptorHash
    || sha256(source.descriptor) !== pin.productDescriptorHash)
    throw new AuthoringConflictError("The tenant extension's pinned product baseline changed");
  const stripVocabulary = (graph: MetaEntityGraph) => {
    const value = structuredClone(graph);
    for (const surface of value.surfaces ?? []) {
      const ai = surface.layoutConfig?.ai as Record<string, unknown> | undefined;
      if (ai) delete ai.vocabulary;
    }
    return value;
  };
  if (input.baselineGraph.entity.entityCode !== pin.entityCode || input.baselineGraph.entity.ownershipModel !== "system"
    || sha256(stripVocabulary(input.baselineGraph)) !== sha256(stripVocabulary(input.candidateGraph)))
    throw new AuthoringPolicyError("LEARNING_EXTENSION_DELTA_INVALID", "Tenant learning may change only approved vocabulary");
  compileGraph(input.candidateGraph);
  const baseAi = source.descriptor.ai as EntityAiDescriptorV1 | undefined;
  const candidateAi = compileEntityAi(input.candidateGraph);
  if (!baseAi?.enabled || !candidateAi?.vocabulary) throw new AuthoringPolicyError("LEARNING_TARGET_UNSUPPORTED", "A published enabled vocabulary target is required");
  const { vocabulary: _baseVocabulary, ...basePolicy } = baseAi;
  const { vocabulary: _candidateVocabulary, ...candidatePolicy } = candidateAi;
  if (sha256(basePolicy) !== sha256(candidatePolicy))
    throw new AuthoringPolicyError("LEARNING_EXTENSION_DELTA_INVALID", "The product AI admission policy must be preserved");
  const baseTerms = baseAi.vocabulary?.terms ?? [], terms = candidateAi.vocabulary.terms;
  if (terms.length !== baseTerms.length + 1 || sha256(terms.slice(0, baseTerms.length)) !== sha256(baseTerms)
    || terms[terms.length - 1]?.origin.proposalHash !== pin.proposalHash
    || terms[terms.length - 1]?.origin.plane !== pin.plane
    || terms[terms.length - 1]?.capabilityId !== "entity_read_record")
    throw new AuthoringPolicyError("LEARNING_EXTENSION_DELTA_INVALID", "Preserve baseline vocabulary and append the pinned reviewed correction");
  return { ...structuredClone(source.descriptor), ai: { ...structuredClone(baseAi), vocabulary: structuredClone(candidateAi.vocabulary) }, tenantLearningAncestry: pin };
}

/** Draft-only framework operation. The caller is authenticated separately and
 * authorization is checked before opening a transaction. No approval is inferred.
 * The caller's proposed product coordinates are reread from immutable storage. */
export async function prepareTenantLearningExtensionDraft(input: {
  database: Database; authorizer: Authorizer; context: VerifiedRequestContext; proposal: AtlasLearningHandoff;
  /** Registered origin attestation. Request JSON cannot supply this authority. */
  sourceCurrent(proposal: AtlasLearningHandoff): Promise<boolean>;
}) {
  const { database, authorizer, context, proposal } = input;
  if (context.planeKey !== "studio" || context.tenantId !== proposal.tenantId
    || !(await authorizer.authorize({ context, permissionCode: "metadata.entity.author" })).allowed)
    throw new AuthoringPolicyError("FORBIDDEN", "Tenant Studio authoring authority is required");
  const work = async (tx: Database) => {
    await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true)`.execute(tx);
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${proposal.entityCode}`},0))`.execute(tx);
    if (!await input.sourceCurrent(proposal)) throw new AuthoringPolicyError("LEARNING_SOURCE_UNAVAILABLE", "The origin correction is unavailable");
    const identity = (await sql<{ id: string }>`SELECT id FROM metadata.entity WHERE tenant_id IS NULL
      AND ownership_model='system' AND entity_code=${proposal.entityCode}`.execute(tx)).rows;
    if (identity.length !== 1) throw new AuthoringConflictError("The product identity is unavailable");
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`system-entity-release:${identity[0]!.id}`},0))`.execute(tx);
    const source = await readProductLearningSource(tx, proposal);
    if (!source) throw new AuthoringConflictError("The current product learning source is unavailable");
    const ancestry = tenantLearningAncestry(source, proposal);
    const repository = new KyselyMetaEntityAuthoringRepository(tx), entityId = source.entityId;
    const existing = (await sql<{ change_set_id: string; baseline_revision: number; baseline_graph_hash: string; ancestry: TenantLearningAncestry }>`
      SELECT change_set_id,baseline_revision,baseline_graph_hash,ancestry FROM metadata.entity_learning_ancestry
      WHERE tenant_id=${context.tenantId}::uuid AND ancestry->>'proposalHash'=${proposal.proposalHash}`.execute(tx)).rows;
    if (existing.length) {
      const entry = existing[0]!, changeSet = await repository.get(entry.change_set_id);
      const baselineGraph = await repository.readDraftSave(entry.change_set_id, Number(entry.baseline_revision));
      if (existing.length !== 1 || !changeSet || changeSet.status !== "draft" || changeSet.createdBy !== context.principalId
        || changeSet.revision !== Number(entry.baseline_revision) || !baselineGraph
        || sha256(baselineGraph) !== entry.baseline_graph_hash || sha256(ancestry) !== sha256(entry.ancestry)
        || sha256(await repository.loadGraph(entry.change_set_id)) !== entry.baseline_graph_hash)
        throw new AuthoringConflictError("The existing tenant extension draft changed");
      if (!await input.sourceCurrent(proposal)) throw new AuthoringPolicyError("LEARNING_SOURCE_UNAVAILABLE", "The origin correction changed during draft preparation");
      return { changeSet, ancestry, baselineGraph, source, reused: true };
    }
    const collision = (await sql`SELECT id FROM metadata.entity WHERE tenant_id=${context.tenantId}::uuid AND entity_code=${proposal.entityCode}`.execute(tx)).rows;
    if (collision.length) throw new AuthoringConflictError("A tenant definition already exists; extend its current published source instead");
    const draft = await repository.createDraft({ tenantId: context.tenantId, entityId, entityCode: source.entityCode,
      branchCode: `atlas-learning.${proposal.candidateId}`, title: `Tenant knowledge: ${source.entityCode}`, actorId: context.principalId,
      productBase: { releaseId: source.authoringReleaseId, releaseHash: source.releaseHash } });
    // Import markers belong to platform maintenance, not the tenant extension.
    const surfaces = source.graph.surfaces?.map(surface => {
      if (!surface.layoutConfig) return surface;
      const layoutConfig = { ...surface.layoutConfig };
      delete layoutConfig.systemReferenceProduct; delete layoutConfig.tableEntityProduct;
      return { ...surface, layoutConfig };
    });
    const baselineGraph = cloneGraphIds({ ...source.graph, surfaces });
    const saved = await repository.replaceGraphInTransaction({ changeSetId: draft.id,
      expectedRevision: draft.revision, graph: baselineGraph, actorId: context.principalId }, tx);
    const persisted = await repository.loadGraph(saved.id);
    if (!await input.sourceCurrent(proposal)) throw new AuthoringPolicyError("LEARNING_SOURCE_UNAVAILABLE", "The origin correction changed during draft preparation");
    await sql`INSERT INTO metadata.entity_learning_ancestry(tenant_id,entity_id,change_set_id,baseline_revision,baseline_graph_hash,
      product_release_id,product_release_no,product_contract_hash,product_descriptor_hash,ancestry,created_by)
      VALUES(${context.tenantId}::uuid,${entityId}::uuid,${saved.id}::uuid,${saved.revision},${sha256(persisted)},
        ${source.authoringReleaseId}::uuid,${source.releaseNo},${source.contractHash},${source.descriptorHash},${JSON.stringify(ancestry)}::jsonb,${context.principalId}::uuid)`.execute(tx);
    return { changeSet: saved, ancestry, baselineGraph: persisted, source, reused: false };
  };
  return database.isTransaction ? work(database) : database.transaction().execute(work);
}
