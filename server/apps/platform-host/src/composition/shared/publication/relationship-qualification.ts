import { parseEntityKeyReference } from "@athyper/server-contract-metadata";
import { sql, type Transaction } from "kysely";
import {
  parseEntityRelationships,
  qualifyEntityRelationship,
  type EntityRelationshipContract,
} from "@athyper/contract-platform-entity-runtime";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { parseCompiledEntityArtifact } from "@athyper/server-contract-publication";
import { parseCompiledRuntimeContract } from "@athyper/server-platform-metadata";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";

/** Compare candidate contracts with activated dependencies in the target database.
 * Also check reverse dependencies so a child successor cannot silently break a
 * separately released parent. Repeated by the existing publication phase gates. */
export async function qualifyPublishedRelationships(
  graph: MetaEntityGraph,
  tx: Transaction<Record<string, never>>,
): Promise<void> {
  return qualifyRelationshipGraph(graph, tx, []);
}

/** Qualification only: prospective members do not become active dependencies.
 * Activation must use a verified, independently authorized group and commit all
 * heads in the same target transaction. The single-release gate stays strict. */
export async function qualifyCoordinatedProductRelationships(
  graphs: readonly MetaEntityGraph[],
  tx: Transaction<Record<string, never>>,
): Promise<void> {
  if (!graphs.length || new Set(graphs.map(g => g.entity.entityCode)).size !== graphs.length
    || graphs.some(g => g.entity.ownershipModel !== "system" || g.runtimeProfiles?.length !== 1)
    || new Set(graphs.map(g => g.runtimeProfiles![0]!.storagePlane)).size !== 1
    || !["studio", "neon", "mesh"].includes(graphs[0]!.runtimeProfiles![0]!.storagePlane ?? ""))
    throw Error("PUBLICATION_RELATIONSHIP_GROUP_INVALID");
  const peers = graphs.map(relationshipDescriptor);
  for (const graph of graphs) await qualifyRelationshipGraph(graph, tx, peers);
}

function relationshipDescriptor(graph: MetaEntityGraph) {
  const profile = graph.runtimeProfiles![0]!;
  const presentation = graph.surfaces?.find(s => s.layoutConfig?.recordPresentation)?.layoutConfig?.recordPresentation as
    { entityRelationships?: unknown } | undefined;
  return {
    entityCode: graph.entity.entityCode, planeKey: profile.storagePlane!,
    storage: { schema: profile.storageSchema!, object: profile.storageObject!, tenantField: profile.tenantFieldKey },
    fields: graph.fields.map(field => ({ key: field.fieldKey, storagePath: field.storagePath!, type: field.dataType,
      writableOn: field.writeMode === "read_only" ? [] : ["patch"],
      keyReference: field.typeConfig?.keyReference === undefined ? undefined : parseEntityKeyReference(field.typeConfig.keyReference, field.fieldKey) })),
    operations: Object.fromEntries(graph.operations.map(operation => [operation.operationKey, true])),
    recordPresentation: { entityRelationships: parseEntityRelationships(presentation?.entityRelationships ?? []) },
  };
}

async function qualifyRelationshipGraph(
  graph: MetaEntityGraph,
  tx: Transaction<Record<string, never>>,
  peers: readonly ReturnType<typeof relationshipDescriptor>[],
): Promise<void> {
  const profile = graph.runtimeProfiles![0]!;
  const raw = graph.surfaces?.find((s) => s.layoutConfig?.recordPresentation)
    ?.layoutConfig?.recordPresentation as
    { entityRelationships?: unknown } | undefined;
  const relations = parseEntityRelationships(raw?.entityRelationships ?? []);
  const published = (
    await sql<{
      artifact: unknown;
      release_id: string;
      release_no: number;
    }>`SELECT member.value AS artifact, applied.source_release_id::text release_id,applied.source_release_no::int release_no
    FROM runtime_meta.release_activation_head head
    JOIN runtime_meta.applied_release applied ON applied.id=head.applied_release_id AND applied.status='active'
    JOIN runtime_meta.applied_release_payload payload ON payload.applied_release_id=applied.id
    CROSS JOIN LATERAL jsonb_array_elements(payload.payload_json->'artifacts') member(value)
    WHERE payload.artifact_kind='compiled_entity_runtime' AND payload.tenant_id IS NULL
      AND member.value->>'artifactType'='runtime_contract'
      AND member.value->>'entityCode'=payload.coordinates->>'entityCode'`.execute(
      tx,
    )
  ).rows.map((row) =>
    parseCompiledRuntimeContract(
      parseCompiledEntityArtifact(
        (row.artifact as { content: unknown }).content,
      ),
      { releaseId: row.release_id, releaseNo: row.release_no },
    ),
  );
  const peerCodes = new Set(peers.map(peer => peer.entityCode));
  const active = [...published.filter(descriptor => !peerCodes.has(descriptor.entityCode)), ...peers];
  const candidate: EntityRelationshipContract = {
    entityCode: graph.entity.entityCode,
    plane: profile.storagePlane!,
    tenantField: profile.tenantFieldKey!,
    fields: Object.fromEntries(
      graph.fields.map((f) => [f.fieldKey, f.dataType]),
    ),
    operations: graph.operations.map((o) => o.operationKey),
    uniqueKeys: [],
  };
  async function stored(
    descriptor: EntityRuntimeDescriptor | ReturnType<typeof relationshipDescriptor>,
  ): Promise<EntityRelationshipContract> {
    const keys = await uniqueKeys(
      descriptor.storage.schema,
      descriptor.storage.object,
      tx,
    );
    const byColumn = new Map(
      descriptor.fields.map((f) => [f.storagePath, f.key]),
    );
    return {
      entityCode: descriptor.entityCode,
      plane: descriptor.planeKey,
      tenantField: descriptor.storage.tenantField!,
      fields: Object.fromEntries(descriptor.fields.map((f) => [f.key, f.type])),
      operations: Object.keys(descriptor.operations),
      uniqueKeys: keys.map((key) =>
        key.map((column) => byColumn.get(column) ?? "!unpublished"),
      ),
    };
  }
  const candidateKeys = await uniqueKeys(
    profile.storageSchema!,
    profile.storageObject!,
    tx,
  );
  const columns = new Map(graph.fields.map((f) => [f.storagePath, f.fieldKey]));
  const qualifiedCandidate = {
    ...candidate,
    uniqueKeys: candidateKeys.map((key) =>
      key.map((column) => columns.get(column) ?? "!unpublished"),
    ),
  };
  // Key references point from a stored FK to an independently authorized target.
  const candidateReference = relationshipDescriptor(graph);
  const referenceContracts = [...active.filter(item => item.entityCode !== candidateReference.entityCode), candidateReference];
  for (const owner of referenceContracts) for (const field of owner.fields) {
    const relation = field.keyReference;
    if (!relation || (owner.entityCode !== candidateReference.entityCode && relation.targetEntity !== candidateReference.entityCode)) continue;
    const target = referenceContracts.find(item => item.entityCode === relation.targetEntity);
    if (!target || target.planeKey !== owner.planeKey || !target.operations.read || !target.operations.list) throw Error("PUBLICATION_KEY_REFERENCE_TARGET_REQUIRED");
    const mappings = relation.fields.map(mapping => {
      const from = owner.fields.find(item => item.key === mapping.source), to = target.fields.find(item => item.key === mapping.target);
      if (!from || !to || from.type !== to.type || to.writableOn.length) throw Error("PUBLICATION_KEY_REFERENCE_FIELD_MISMATCH");
      return {source: from.storagePath, target: to.storagePath};
    });
    if (!target.fields.some(item => item.key === relation.labelField)) throw Error("PUBLICATION_KEY_REFERENCE_LABEL_REQUIRED");
    if (target.storage.tenantField && (!owner.storage.tenantField || !mappings.some(mapping => mapping.source === owner.storage.tenantField && mapping.target === target.storage.tenantField))) throw Error("PUBLICATION_KEY_REFERENCE_TENANT_MAPPING_REQUIRED");
    const unique = await uniqueKeys(target.storage.schema, target.storage.object, tx);
    if (!unique.some(key => key.length === mappings.length && key.every(column => mappings.some(mapping => mapping.target === column)))) throw Error("PUBLICATION_KEY_REFERENCE_UNIQUE_KEY_REQUIRED");
    await requireForeignKey(target.storage.schema, target.storage.object, owner.storage.schema, owner.storage.object, mappings.map(mapping => ({source: mapping.target, target: mapping.source})), tx);
  }
  for (const relationship of relations) {
    const targets = active.filter(
      (d) => d.entityCode === relationship.targetEntity,
    );
    if (targets.length !== 1)
      throw Error("PUBLICATION_RELATIONSHIP_ACTIVE_DEPENDENCY_REQUIRED");
    qualifyEntityRelationship(
      qualifiedCandidate,
      await stored(targets[0]!),
      relationship,
    );
    await requireForeignKey(
      profile.storageSchema!,
      profile.storageObject!,
      targets[0]!.storage.schema,
      targets[0]!.storage.object,
      [relationship.tenant, ...relationship.fields].map((m) => ({
        source: graph.fields.find((f) => f.fieldKey === m.source)!.storagePath!,
        target: targets[0]!.fields.find((f) => f.key === m.target)!.storagePath,
      })),
      tx,
    );
    for (const mapping of relationship.fields) {
      if (
        graph.fields.find((f) => f.fieldKey === mapping.source)?.writeMode !==
        "read_only"
      )
        throw Error("PUBLICATION_RELATIONSHIP_IMMUTABLE_PARENT_KEY_REQUIRED");
      if (
        targets[0]!.fields.find((f) => f.key === mapping.target)?.writableOn
          .length
      )
        throw Error("PUBLICATION_RELATIONSHIP_IMMUTABLE_CHILD_KEY_REQUIRED");
    }
  }
  for (const parent of active.filter(
    (d) => d.entityCode !== candidate.entityCode,
  ))
    for (const relationship of parent.recordPresentation?.entityRelationships ??
      []) {
      if (relationship.targetEntity !== candidate.entityCode) continue;
      qualifyEntityRelationship(
        await stored(parent),
        qualifiedCandidate,
        relationship,
      );
      await requireForeignKey(
        parent.storage.schema,
        parent.storage.object,
        profile.storageSchema!,
        profile.storageObject!,
        [relationship.tenant, ...relationship.fields].map((m) => ({
          source: parent.fields.find((f) => f.key === m.source)!.storagePath,
          target: graph.fields.find((f) => f.fieldKey === m.target)!
            .storagePath!,
        })),
        tx,
      );
      if (
        relationship.fields.some(
          (mapping) =>
            graph.fields.find((f) => f.fieldKey === mapping.target)
              ?.writeMode !== "read_only",
        )
      )
        throw Error("PUBLICATION_RELATIONSHIP_IMMUTABLE_CHILD_KEY_REQUIRED");
    }
}
async function uniqueKeys(
  schema: string,
  object: string,
  tx: Transaction<Record<string, never>>,
): Promise<string[][]> {
  return (
    await sql<{
      columns: string[];
    }>`SELECT array_agg(attribute.attname::text ORDER BY member.ordinality) AS columns
    FROM pg_index idx JOIN pg_class table_ ON table_.oid=idx.indrelid JOIN pg_namespace namespace ON namespace.oid=table_.relnamespace
    CROSS JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY member(attnum,ordinality)
    JOIN pg_attribute attribute ON attribute.attrelid=table_.oid AND attribute.attnum=member.attnum
    WHERE namespace.nspname=${schema} AND table_.relname=${object} AND idx.indisunique AND idx.indisvalid
      AND idx.indpred IS NULL AND idx.indexprs IS NULL AND member.ordinality<=idx.indnkeyatts
    GROUP BY idx.indexrelid`.execute(tx)
  ).rows.map((row) => row.columns);
}

async function requireForeignKey(
  parentSchema: string,
  parentObject: string,
  childSchema: string,
  childObject: string,
  mappings: readonly { source: string; target: string }[],
  tx: Transaction<Record<string, never>>,
) {
  const constraints = (
    await sql<{
      mapping: { source: string; target: string }[];
    }>`SELECT jsonb_agg(jsonb_build_object('source',parent_column.attname,'target',child_column.attname)) AS mapping
  FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_namespace cn ON cn.oid=child.relnamespace
  JOIN pg_class parent ON parent.oid=fk.confrelid JOIN pg_namespace pn ON pn.oid=parent.relnamespace
  CROSS JOIN LATERAL unnest(fk.conkey,fk.confkey) pair(child_key,parent_key)
  JOIN pg_attribute child_column ON child_column.attrelid=child.oid AND child_column.attnum=pair.child_key
  JOIN pg_attribute parent_column ON parent_column.attrelid=parent.oid AND parent_column.attnum=pair.parent_key
  WHERE fk.contype='f' AND fk.convalidated AND cn.nspname=${childSchema} AND child.relname=${childObject}
   AND pn.nspname=${parentSchema} AND parent.relname=${parentObject} GROUP BY fk.oid`.execute(
      tx,
    )
  ).rows;
  if (
    !constraints.some(
      (c) =>
        c.mapping.length === mappings.length &&
        mappings.every((m) =>
          c.mapping.some(
            (found) => found.source === m.source && found.target === m.target,
          ),
        ),
    )
  )
    throw Error("PUBLICATION_RELATIONSHIP_FOREIGN_KEY_REQUIRED");
}
