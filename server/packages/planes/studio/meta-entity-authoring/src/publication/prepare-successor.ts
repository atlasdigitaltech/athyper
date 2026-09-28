import { sql, type Kysely } from "kysely";
import type { DevEntitySuccessorPolicy } from "@athyper/server-contract-publication";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { KyselyMetaEntityAuthoringRepository } from "../kysely-authoring-repository.js";
import { cloneGraphIds } from "../graph-identity.js";
import { compileGraph, sha256 } from "../deterministic.js";

export interface PrepareEntitySuccessorInput {
  readonly requestId: string;
  readonly authorityTenantId: string;
  readonly entityId: string;
  readonly actorId: string;
  readonly publicationKey: string;
  readonly predecessor: DevEntitySuccessorPolicy["predecessor"];
}
export interface EntitySuccessorDraftAuthority {
  /** Must authenticate platform maintenance authority. No default allow and no
   * publication/review grant is inferred from successful draft preparation. */
  assertAuthorized(input: PrepareEntitySuccessorInput & { action: "metadata.entity.successor.prepare" }): Promise<void>;
}
const requireCondition = (v: unknown, code: string) => { if (!v) throw Error(code); };

/** Draft-only trusted maintenance path. Ordinary tenant authoring and global
 * RLS remain unchanged. No approval, signature, release or runtime projection is
 * created here. One canonical source is forked, never a graph per target. */
export async function prepareEntitySuccessorDraft(database: Kysely<Record<string, never>>, authority: EntitySuccessorDraftAuthority, request: PrepareEntitySuccessorInput) {
  const input = structuredClone(request), p = input.predecessor;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  requireCondition([input.requestId, input.authorityTenantId, input.entityId, input.actorId, p.authoringReleaseId, p.publicationReleaseId, p.revisionId].every(v => typeof v === "string" && uuid.test(v)), "SUCCESSOR_DRAFT_ID_INVALID");
  requireCondition([p.authoringReleaseHash, p.publicationReleaseHash, p.contractHash].every(v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v)) &&
    [p.authoringReleaseNo, p.publicationReleaseNo].every(v => Number.isSafeInteger(v) && v > 0), "SUCCESSOR_DRAFT_PIN_INVALID");
  await authority.assertAuthorized({ ...structuredClone(input), action: "metadata.entity.successor.prepare" });
  const work = async (tx: Kysely<Record<string, never>>) => {
    // Same lock namespace as release allocation, so preparation cannot accept a
    // predecessor that moved while the source was being read.
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`system-entity-release:${input.entityId}`},0))`.execute(tx);
    const sources = (await sql<{ graph: MetaEntityGraph; entity_code: string }>`SELECT s.contract_json graph,e.entity_code
      FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system'
      JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.entity_id=r.entity_id AND s.tenant_id IS NULL
      JOIN metadata.entity_change_set c ON c.id=r.change_set_id AND c.entity_id=r.entity_id AND c.tenant_id IS NULL
      JOIN publication.entity_release_link l ON l.entity_release_id=r.id
      JOIN publication.release pr ON pr.id=l.publication_release_id
      WHERE r.id=${p.authoringReleaseId}::uuid AND r.entity_id=${input.entityId}::uuid AND r.tenant_id IS NULL
        AND r.release_no=${p.authoringReleaseNo} AND r.release_hash=${p.authoringReleaseHash}
        AND r.contract_hash=${p.contractHash} AND r.revision_id=${p.revisionId}::uuid
        AND s.contract_hash=r.contract_hash AND s.contract_hash=snapshot.fn_compute_entity_contract_hash(s.contract_json)
        AND s.validation_status='valid' AND c.status='published'
        AND c.approved_by IS NOT NULL AND c.approved_by<>c.created_by AND c.approved_by<>c.submitted_by
        AND r.contract_signature IS NOT NULL AND r.signature_algorithm='Ed25519'
        AND pr.id=${p.publicationReleaseId}::uuid AND pr.tenant_id=${input.authorityTenantId}::uuid
        AND pr.release_key=${input.publicationKey} AND pr.release_no=${p.publicationReleaseNo}
        AND pr.release_hash=${p.publicationReleaseHash} AND pr.status IN ('approved','published')
        AND NOT EXISTS(SELECT 1 FROM metadata.entity_release newer WHERE newer.entity_id=r.entity_id AND newer.tenant_id IS NULL AND newer.release_no>r.release_no)
        AND NOT EXISTS(SELECT 1 FROM publication.release newer WHERE newer.release_key=pr.release_key AND newer.tenant_id=pr.tenant_id AND newer.release_no>pr.release_no)
        AND EXISTS(SELECT 1 FROM master.principal actor WHERE actor.id=${input.actorId}::uuid AND actor.tenant_id=pr.tenant_id AND actor.status='active')`.execute(tx)).rows;
    requireCondition(sources.length === 1, "SUCCESSOR_DRAFT_PREDECESSOR_CHANGED");
    const source = sources[0]!;
    // The stored snapshot hash is PostgreSQL JSONB-text SHA-256, verified above.
    // The compiler uses a different canonicalization; do not compare those
    // digests or rewrite the historical snapshot. New source pins are compiled
    // only after the fresh graph is persisted below.
    const repository = new KyselyMetaEntityAuthoringRepository(tx);
    const branch = `publication.successor.${input.requestId}`;
    const existing = (await sql<{ id: string; branch_code: string; status: string; created_by: string }>`SELECT id,branch_code,status,created_by FROM metadata.entity_change_set
      WHERE entity_id=${input.entityId}::uuid AND tenant_id IS NULL AND base_release_id=${p.authoringReleaseId}::uuid
        AND status IN ('draft','in_review','approved')`.execute(tx)).rows;
    if (existing.length) {
      requireCondition(existing.length === 1 && existing[0]!.branch_code === branch && existing[0]!.status === "draft" && existing[0]!.created_by === input.actorId, "SUCCESSOR_DRAFT_ALREADY_EXISTS");
      const cs = await repository.get(existing[0]!.id), graph = await repository.loadGraph(existing[0]!.id);
      const saved = await repository.readDraftSave(existing[0]!.id, cs!.revision);
      requireCondition(saved && sha256(saved) === sha256(graph), "SUCCESSOR_DRAFT_SAVE_MISMATCH");
      return { changeSet: cs!, artifact: compileGraph(graph), reused: true };
    }
    const draft = await repository.createDraft({ tenantId: null, entityId: input.entityId, entityCode: source.entity_code,
      branchCode: branch, title: `Successor of release ${p.authoringReleaseNo}`, actorId: input.actorId,
      baseRelease: { releaseId: p.authoringReleaseId, releaseHash: p.authoringReleaseHash } });
    const current = await repository.get(draft.id);
    requireCondition(current?.status === "draft", "SUCCESSOR_DRAFT_STATE_CHANGED");
    const changeSet = await repository.replaceGraph({ changeSetId: draft.id, expectedRevision: current!.revision, actorId: input.actorId, graph: cloneGraphIds(source.graph) });
    return { changeSet, artifact: compileGraph(await repository.loadGraph(draft.id)), reused: false };
  };
  return database.isTransaction ? work(database) : database.transaction().execute(work);
}
