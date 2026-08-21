import type { CycleTemplatePreview, CycleTemplateRepository, PublishCycleTemplateResult, PublishedCycleTemplate } from "@athyper/server-contract-control-admin";
import { sql, type Kysely } from "kysely";

type Database = Record<string, never>;
type Row = Record<string, unknown>;

export class KyselyCycleTemplateRepository implements CycleTemplateRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async externalPhaseExists(tenantId: string, cycleTypeId: string, phaseId: string): Promise<boolean> { return Boolean((await sql<Row>`SELECT 1 FROM control.cycle_template_revision revision CROSS JOIN LATERAL jsonb_array_elements(revision.template_json->'template'->'phases') phase WHERE revision.tenant_id=${tenantId}::uuid AND revision.cycle_type_id=${cycleTypeId}::uuid AND phase->>'id'=${phaseId} ORDER BY revision.revision_number DESC LIMIT 1`.execute(this.db)).rows[0]); }
  async cycleTypeExists(tenantId: string, cycleTypeId: string): Promise<boolean> { return Boolean((await sql<Row>`SELECT 1 FROM control.cycle_template_revision WHERE tenant_id=${tenantId}::uuid AND cycle_type_id=${cycleTypeId}::uuid LIMIT 1`.execute(this.db)).rows[0]); }
  async publish(input: { readonly tenantId: string; readonly principalId: string; readonly idempotencyKey: string; readonly expectedLatestVersion?: number; readonly preview: CycleTemplatePreview }): Promise<PublishCycleTemplateResult> {
    return this.db.transaction().execute(async (transaction) => {
      const cycleTypeId = input.preview.template.cycleType.id;
      if (!(await sql<Row>`SELECT id FROM control.cycle_type WHERE tenant_id=${input.tenantId}::uuid AND id=${cycleTypeId}::uuid FOR UPDATE`.execute(transaction)).rows[0]) throw coded("CONTROL_ADMIN_CYCLE_TYPE_NOT_FOUND");
      const existing = (await sql<Row>`SELECT * FROM control.cycle_template_revision WHERE tenant_id=${input.tenantId}::uuid AND cycle_type_id=${cycleTypeId}::uuid AND idempotency_key=${input.idempotencyKey}`.execute(transaction)).rows[0];
      if (existing) { if (String(existing["template_hash"]) !== input.preview.templateHash) throw coded("CONTROL_ADMIN_IDEMPOTENCY_CONFLICT"); return { kind: "replayed", value: publishedRow(existing) }; }
      const latest = Number((await sql<Row>`SELECT coalesce(max(revision_number),0) AS version FROM control.cycle_template_revision WHERE tenant_id=${input.tenantId}::uuid AND cycle_type_id=${cycleTypeId}::uuid`.execute(transaction)).rows[0]?.["version"] ?? 0);
      if (input.expectedLatestVersion !== undefined && input.expectedLatestVersion !== latest) return { kind: "version_conflict", expectedVersion: input.expectedLatestVersion, actualVersion: latest };
      const result = await sql<Row>`INSERT INTO control.cycle_template_revision(tenant_id,cycle_type_id,revision_number,schema_code,template_json,template_hash,topological_task_ids,idempotency_key,published_by,created_by) VALUES(${input.tenantId}::uuid,${cycleTypeId}::uuid,${latest + 1},${input.preview.schema},${JSON.stringify(input.preview)}::jsonb,${input.preview.templateHash},ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(input.preview.topologicalTaskIds)}::jsonb)::uuid),${input.idempotencyKey},${input.principalId}::uuid,${input.principalId}::uuid) RETURNING *`.execute(transaction);
      return { kind: "published", value: publishedRow(result.rows[0]!) };
    });
  }
  async getPublished(tenantId: string, cycleTypeId: string, version?: number): Promise<PublishedCycleTemplate | undefined> { const row = version === undefined ? (await sql<Row>`SELECT * FROM control.cycle_template_revision WHERE tenant_id=${tenantId}::uuid AND cycle_type_id=${cycleTypeId}::uuid ORDER BY revision_number DESC LIMIT 1`.execute(this.db)).rows[0] : (await sql<Row>`SELECT * FROM control.cycle_template_revision WHERE tenant_id=${tenantId}::uuid AND cycle_type_id=${cycleTypeId}::uuid AND revision_number=${version}`.execute(this.db)).rows[0]; return row ? publishedRow(row) : undefined; }
}
function publishedRow(row: Row): PublishedCycleTemplate { const preview = object(row["template_json"]) as unknown as CycleTemplatePreview; return { ...preview, id: String(row["id"]), tenantId: String(row["tenant_id"]), version: Number(row["revision_number"]), publishedAt: new Date(String(row["published_at"])).toISOString(), publishedBy: String(row["published_by"]) }; }
function object(value: unknown): Record<string, unknown> { if (typeof value === "string") { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } } return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function coded(code: string): Error { return Object.assign(new Error(code), { code }); }
