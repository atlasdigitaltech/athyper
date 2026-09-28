import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { AuthoringPlane } from "@athyper/server-contract-meta-entity-authoring";
import { compileSharedReferenceProduct, type SharedReferenceProduct } from "./authoring/product.js";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import { cloneGraphIds } from "./graph-identity.js";
import { sha256 } from "./deterministic.js";

export interface SystemReferenceImportAuthority {
  /** Trusted caller must authenticate/authorize platform maintenance authority.
   * This is not supplied by tenant request JSON. There is no default allow. */
  assertAuthorized(input: {
    actorId: string; entityCode: string; productHash: string;
    targetPlanes: readonly AuthoringPlane[]; action: "system_reference.import";
  }): Promise<void>;
}

/** Privileged, draft-only platform importer. Ordinary tenant registration is
 * unchanged; PostgreSQL must independently allow global metadata writes.
 * No grant, approval, signing, publication or runtime activation happens here. */
export async function importSystemReferenceProduct(
  database: Kysely<Record<string, never>>,
  authority: SystemReferenceImportAuthority,
  input: { product: SharedReferenceProduct; actorId: string },
) {
  const product = structuredClone(input.product), actorId = input.actorId;
  if (!/^[0-9a-f-]{36}$/i.test(actorId)) throw Error("SYSTEM_REFERENCE_ACTOR_REQUIRED");
  // Compile revalidates the product, including readonly storage and capability
  // permissions. Studio is the canonical source, not three separate entities.
  if (!product.planes.includes("studio")) throw Error("SYSTEM_REFERENCE_STUDIO_SOURCE_REQUIRED");
  const source = compileSharedReferenceProduct(product, "studio");
  const productHash = sha256(product);
  await authority.assertAuthorized({ actorId, entityCode: product.definition.entityCode,
    productHash, targetPlanes: [...product.planes], action: "system_reference.import" });
  const work = async (tx: Kysely<Record<string, never>>) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`system-reference:${product.definition.entityCode}`},0))`.execute(tx);
    const actor = await sql`SELECT id FROM master.principal WHERE id=${actorId}::uuid AND status='active'`.execute(tx);
    if (actor.rows.length !== 1) throw Error("SYSTEM_REFERENCE_ACTOR_UNAVAILABLE");
    const entityRows = (await sql<{ id: string; entity_class: string; ownership_model: string; module_code: string; status: string }>`
      SELECT e.id,e.entity_class,e.ownership_model,m.code module_code,e.status FROM metadata.entity e
      JOIN control.module m ON m.id=e.module_id WHERE e.tenant_id IS NULL AND e.entity_code=${product.definition.entityCode}`.execute(tx)).rows;
    if (entityRows.length > 1) throw Error("SYSTEM_REFERENCE_IDENTITY_AMBIGUOUS");
    let entityId = entityRows[0]?.id;
    if (entityRows[0] && (entityRows[0].entity_class !== "reference" || entityRows[0].ownership_model !== "system"
      || entityRows[0].module_code !== product.moduleCode || !["draft", "active"].includes(entityRows[0].status)))
      throw Error("SYSTEM_REFERENCE_IDENTITY_CONFLICT");
    if (!entityId) {
      entityId = randomUUID();
      const inserted = await sql`INSERT INTO metadata.entity(id,tenant_id,module_id,entity_code,entity_class,ownership_model,status,created_by)
        SELECT ${entityId}::uuid,NULL,m.id,${product.definition.entityCode},'reference','system','draft',${actorId}::uuid
        FROM control.module m WHERE m.code=${product.moduleCode} AND m.status='active' RETURNING id`.execute(tx);
      if (inserted.rows.length !== 1) throw Error("SYSTEM_REFERENCE_MODULE_UNAVAILABLE");
    }
    const branchCode = `system-reference.${productHash}`;
    const existing = (await sql<{ id: string }>`SELECT id FROM metadata.entity_change_set
      WHERE entity_id=${entityId}::uuid AND tenant_id IS NULL AND branch_code=${branchCode}`.execute(tx)).rows;
    if (existing.length > 1) throw Error("SYSTEM_REFERENCE_IMPORT_AMBIGUOUS");
    const repository = new KyselyMetaEntityAuthoringRepository(tx);
    if (existing[0]) {
      const graph = await repository.loadGraph(existing[0].id);
      const original = await repository.readDraftSave(existing[0].id, 1);
      if (!original || sha256(original) !== sha256(graph)) throw Error("SYSTEM_REFERENCE_IMPORTED_GRAPH_CHANGED");
      return { entityId, changeSet: await repository.get(existing[0].id), productHash, reused: true };
    }
    const changeSet = await repository.createDraft({ tenantId: null, entityId,
      entityCode: product.definition.entityCode, branchCode, title: product.definition.title, actorId });
    const graph = cloneGraphIds(source.graph);
    const saved = await repository.replaceGraph({ changeSetId: changeSet.id, expectedRevision: changeSet.revision,
      actorId, graph: { ...graph, surfaces: graph.surfaces?.map(surface => surface.surfaceKind === "list"
        ? { ...surface, layoutConfig: { ...surface.layoutConfig, systemReferenceProduct: {
          schema: "athyper.system-reference-source/1", productHash, targetPlanes: [...product.planes], moduleCode: product.moduleCode,
        } } } : surface) } });
    return { entityId, changeSet: saved, productHash, reused: false };
  };
  return database.isTransaction ? work(database) : database.transaction().execute(work);
}
