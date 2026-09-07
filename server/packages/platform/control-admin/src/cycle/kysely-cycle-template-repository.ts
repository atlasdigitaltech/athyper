import type {
  CycleTemplatePreview,
  CycleTemplateDraft,
  CycleTemplateRepository,
  PublishCycleTemplateResult,
  PublishedCycleTemplate,
} from "@athyper/server-contract-control-admin";
import { sql, type Kysely, type Transaction } from "kysely";

type Database = Record<string, never>;
type Row = Record<string, unknown>;
import { cycleError as coded } from "./cycle-config-validation.js";

export class KyselyCycleTemplateRepository implements CycleTemplateRepository {
  constructor(private readonly db: Kysely<Database>) {}
  private scoped<T>(
    tenantId: string,
    actorId: string | undefined,
    work: (tx: Transaction<Database>) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .setIsolationLevel("read committed")
      .execute(async (tx) => {
        await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id',${actorId ?? ""},true),set_config('app.current_actor_type','user',true)`.execute(
          tx,
        );
        return work(tx);
      });
  }
  async externalPhaseExists(
    tenantId: string,
    cycleTypeId: string,
    phaseId: string,
  ): Promise<boolean> {
    return this.scoped(tenantId, undefined, async (tx) =>
      Boolean(
        (
          await sql<Row>`SELECT 1 FROM (SELECT template_json FROM control.cycle_template_revision WHERE tenant_id=${tenantId}::uuid AND cycle_type_id=${cycleTypeId}::uuid ORDER BY revision_number DESC LIMIT 1) revision CROSS JOIN LATERAL jsonb_array_elements(revision.template_json->'template'->'phases') phase WHERE phase->>'id'=${phaseId} LIMIT 1`.execute(
            tx,
          )
        ).rows[0],
      ),
    );
  }
  async cycleTypeExists(
    tenantId: string,
    cycleTypeId: string,
  ): Promise<boolean> {
    return this.scoped(tenantId, undefined, async (tx) =>
      Boolean(
        (
          await sql<Row>`SELECT 1 FROM control.cycle_template_revision WHERE tenant_id=${tenantId}::uuid AND cycle_type_id=${cycleTypeId}::uuid LIMIT 1`.execute(
            tx,
          )
        ).rows[0],
      ),
    );
  }
  async publish(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly idempotencyKey: string;
    readonly expectedLatestVersion?: number;
    readonly preview: CycleTemplatePreview;
  }): Promise<PublishCycleTemplateResult> {
    return this.scoped(
      input.tenantId,
      input.principalId,
      async (transaction) => {
        const cycleTypeId = input.preview.template.cycleType.id;
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`cycle-publication:${input.tenantId}`},0))`.execute(
          transaction,
        );
        if (
          !(
            await sql<Row>`SELECT id FROM control.cycle_type WHERE tenant_id=${input.tenantId}::uuid AND id=${cycleTypeId}::uuid`.execute(
              transaction,
            )
          ).rows[0]
        )
          throw coded("CONTROL_ADMIN_CYCLE_TYPE_NOT_FOUND");
        const existing = (
          await sql<Row>`SELECT * FROM control.cycle_template_revision WHERE tenant_id=${input.tenantId}::uuid AND cycle_type_id=${cycleTypeId}::uuid AND idempotency_key=${input.idempotencyKey}`.execute(
            transaction,
          )
        ).rows[0];
        if (existing) {
          if (String(existing["template_hash"]) !== input.preview.templateHash)
            throw coded("CONTROL_ADMIN_IDEMPOTENCY_CONFLICT");
          return { kind: "replayed", value: publishedRow(existing) };
        }
        const latest = Number(
          (
            await sql<Row>`SELECT coalesce(max(revision_number),0) AS version FROM control.cycle_template_revision WHERE tenant_id=${input.tenantId}::uuid AND cycle_type_id=${cycleTypeId}::uuid`.execute(
              transaction,
            )
          ).rows[0]?.["version"] ?? 0,
        );
        if (
          input.expectedLatestVersion !== undefined &&
          input.expectedLatestVersion !== latest
        )
          return {
            kind: "version_conflict",
            expectedVersion: input.expectedLatestVersion,
            actualVersion: latest,
          };
        // All publishers for this tenant hold the same lock. READ COMMITTED
        // obtains a fresh snapshot after a competing publisher commits.
        const revisions =
          await sql<Row>`SELECT DISTINCT ON (cycle_type_id) template_json FROM control.cycle_template_revision WHERE tenant_id=${input.tenantId}::uuid ORDER BY cycle_type_id, revision_number DESC`.execute(
            transaction,
          );
        validatePublishedGraph(
          input.preview.template,
          revisions.rows.map(
            (row) =>
              (object(row["template_json"]) as unknown as CycleTemplatePreview)
                .template,
          ),
        );
        const result =
          await sql<Row>`INSERT INTO control.cycle_template_revision(tenant_id,cycle_type_id,revision_number,schema_code,template_json,template_hash,topological_task_ids,idempotency_key,published_by,created_by) VALUES(${input.tenantId}::uuid,${cycleTypeId}::uuid,${latest + 1},${input.preview.schema},${JSON.stringify(input.preview)}::jsonb,${input.preview.templateHash},ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(input.preview.topologicalTaskIds)}::jsonb)::uuid),${input.idempotencyKey},${input.principalId}::uuid,${input.principalId}::uuid) RETURNING *`.execute(
            transaction,
          );
        return { kind: "published", value: publishedRow(result.rows[0]!) };
      },
    );
  }
  async getPublished(
    tenantId: string,
    cycleTypeId: string,
    version?: number,
  ): Promise<PublishedCycleTemplate | undefined> {
    return this.scoped(tenantId, undefined, async (tx) => {
      const row =
        version === undefined
          ? (
              await sql<Row>`SELECT * FROM control.cycle_template_revision WHERE tenant_id=${tenantId}::uuid AND cycle_type_id=${cycleTypeId}::uuid ORDER BY revision_number DESC LIMIT 1`.execute(
                tx,
              )
            ).rows[0]
          : (
              await sql<Row>`SELECT * FROM control.cycle_template_revision WHERE tenant_id=${tenantId}::uuid AND cycle_type_id=${cycleTypeId}::uuid AND revision_number=${version}`.execute(
                tx,
              )
            ).rows[0];
      return row ? publishedRow(row) : undefined;
    });
  }
}
function publishedRow(row: Row): PublishedCycleTemplate {
  const preview = object(
    row["template_json"],
  ) as unknown as CycleTemplatePreview;
  return {
    ...preview,
    id: String(row["id"]),
    tenantId: String(row["tenant_id"]),
    version: Number(row["revision_number"]),
    publishedAt: new Date(String(row["published_at"])).toISOString(),
    publishedBy: String(row["published_by"]),
  };
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Replace the candidate's previous revision; retain incoming edges owned by
 * other templates so removing a referenced phase cannot leave dangling links. */
function validatePublishedGraph(
  candidate: CycleTemplateDraft,
  previous: readonly CycleTemplateDraft[],
): void {
  const templates = new Map(
    previous.map((template) => [template.cycleType.id, template]),
  );
  templates.set(candidate.cycleType.id, candidate);
  const nodes = new Map<string, Set<string>>();
  for (const template of templates.values())
    for (const phase of template.phases)
      nodes.set(`${template.cycleType.id}:${phase.id}`, new Set());
  const invalid = (reason: string): never => {
    throw coded("CONTROL_ADMIN_CYCLE_TEMPLATE_INVALID", { reason });
  };
  for (const template of templates.values()) {
    for (const rule of template.carryForwardRules)
      if (rule.targetCycleTypeId && !templates.has(rule.targetCycleTypeId))
        invalid("Unknown carry-forward cycle type");
    for (const edge of template.crossDependencies) {
      if (
        edge.predecessorTypeId !== template.cycleType.id &&
        edge.successorTypeId !== template.cycleType.id
      )
        invalid("Cross dependency must reference its owning cycle type");
      const from = `${edge.predecessorTypeId}:${edge.predecessorPhaseId}`;
      const to = `${edge.successorTypeId}:${edge.successorPhaseId}`;
      if (!nodes.has(from) || !nodes.has(to))
        invalid("Unknown published cycle phase");
      nodes.get(from)!.add(to);
    }
  }
  const indegree = new Map([...nodes.keys()].map((id) => [id, 0]));
  for (const targets of nodes.values())
    for (const target of targets)
      indegree.set(target, indegree.get(target)! + 1);
  const ready = [...indegree.keys()].filter((id) => indegree.get(id) === 0);
  for (let index = 0; index < ready.length; index++)
    for (const target of nodes.get(ready[index]!)!) {
      indegree.set(target, indegree.get(target)! - 1);
      if (indegree.get(target) === 0) ready.push(target);
    }
  if (ready.length !== nodes.size)
    invalid("Published cross-cycle dependency graph contains a cycle");
}
