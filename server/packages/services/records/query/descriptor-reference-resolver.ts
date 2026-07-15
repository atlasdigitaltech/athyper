import { sql, type Kysely } from "kysely";
import type { VerifiedRequestContext } from "@athyper/svc-iam";
import type { ExecutionDescriptorProvider, ExecutionDescriptorV1 } from "@athyper/svc-metadata";
import type { ReferenceLabelBatch, ReferenceLabelResolver } from "./reference-hydrator.js";

/** Resolves every relation on a page with one UNION ALL SQL statement. */
export class DescriptorReferenceLabelResolver implements ReferenceLabelResolver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: Kysely<any>, private readonly provider: ExecutionDescriptorProvider) {}

  async resolve(batches: readonly ReferenceLabelBatch[], context: VerifiedRequestContext): Promise<ReadonlyMap<string, ReadonlyMap<string, string>>> {
    const memo = new Map();
    const targets = await Promise.all(batches.map(async (batch) => ({
      batch,
      descriptor: (await this.provider.get({ plane: context.planeKey, tenantId: context.tenantId, entityCode: batch.targetEntity }, memo)).descriptor,
    })));
    const statements = targets.flatMap(({ batch, descriptor }) => {
      const key = resolveColumn(descriptor, descriptor.storage.primaryKey);
      const label = preferredLabelColumn(descriptor) ?? key;
      if (batch.ids.length === 0) return [];
      const tenantPredicate = descriptor.storage.tenantColumn
        ? sql`and ${sql.ref(descriptor.storage.tenantColumn)} = ${context.tenantId}`
        : sql``;
      return [sql`
        select ${batch.relation}::text as relation_key,
               ${sql.ref(key)}::text as reference_id,
               coalesce(${sql.ref(label)}::text, ${sql.ref(key)}::text) as reference_label
         from ${sql.table(`${descriptor.storage.schema}.${descriptor.storage.table}`)}
         where ${sql.ref(key)} in (${sql.join(batch.ids)})
           ${tenantPredicate}
      `];
    });
    if (statements.length === 0) return new Map();
    const result = await sql<{ relation_key: string; reference_id: string; reference_label: string }>
      `${sql.join(statements, sql` union all `)}`.execute(this.db);
    const output = new Map<string, Map<string, string>>();
    for (const row of result.rows) {
      const labels = output.get(row.relation_key) ?? new Map<string, string>();
      labels.set(row.reference_id, row.reference_label);
      output.set(row.relation_key, labels);
    }
    return output;
  }
}

function resolveColumn(descriptor: ExecutionDescriptorV1, column: string): string {
  return descriptor.fields.get(column)?.column
    ?? [...descriptor.fields.values()].find((field) => field.column === column)?.column
    ?? column;
}

function preferredLabelColumn(descriptor: ExecutionDescriptorV1): string | undefined {
  for (const name of ["display_name", "name", "label", "code"]) {
    const field = descriptor.fields.get(name);
    if (field && descriptor.read.projection.includes(name)) return field.column;
  }
  return undefined;
}
