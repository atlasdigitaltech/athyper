import type { ExecutionDescriptorV1 } from "@athyper/svc-metadata";
import type { VerifiedRequestContext } from "@athyper/svc-iam";

export interface ReferenceLabelBatch {
  readonly relation: string;
  readonly targetEntity: string;
  readonly ids: readonly string[];
}

export interface ReferenceLabelResolver {
  /** One call for the whole page. Implementations must resolve each batch set-wise. */
  resolve(batches: readonly ReferenceLabelBatch[], context: VerifiedRequestContext): Promise<ReadonlyMap<string, ReadonlyMap<string, string>>>;
}

export async function hydrateEntityReferences(
  descriptor: ExecutionDescriptorV1,
  rows: readonly Record<string, unknown>[],
  resolver: ReferenceLabelResolver | undefined,
  context?: VerifiedRequestContext,
): Promise<readonly Record<string, unknown>[]> {
  if (!resolver || !context || rows.length === 0) return rows;
  const bindings = [...descriptor.relations.values()].flatMap((relation) => {
    if (!relation.foreignKey || relation.ownership !== "foreign_key") return [];
    const field = [...descriptor.fields.values()].find((candidate) => candidate.column === relation.foreignKey);
    return field ? [{ relation, field: field.name }] : [];
  });
  const batches = bindings.flatMap(({ relation, field }) => {
    const ids = [...new Set(rows.map((row) => row[field]).filter((value): value is string => typeof value === "string" && value.length > 0))];
    return ids.length ? [{ relation: relation.name, targetEntity: relation.targetEntity, ids }] : [];
  });
  if (batches.length === 0) return rows;
  const labels = await resolver.resolve(batches, context);
  return rows.map((row) => {
    const hydrated = { ...row };
    for (const { relation, field } of bindings) {
      const id = row[field];
      if (typeof id === "string") hydrated[`${field}_label`] = labels.get(relation.name)?.get(id) ?? null;
    }
    return hydrated;
  });
}
