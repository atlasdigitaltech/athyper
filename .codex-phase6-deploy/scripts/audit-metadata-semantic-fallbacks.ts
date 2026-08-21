#!/usr/bin/env tsx
/**
 * CI gate for semantic field metadata.
 *
 * Naming conventions are inspected only by this migration audit, never used
 * as authoritative runtime meaning. The gate fails while an active effective
 * descriptor would require a legacy semantic fallback.
 */
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const reportOnly = process.argv.includes("--report");

interface FieldRow {
  entity_code: string;
  tenant_id: string | null;
  name: string;
  data_type: string;
  ui_type: string | null;
  temporal_kind: string | null;
  display_mode: string | null;
  enum_domain_code: string | null;
  enum_config: unknown;
  reference_config: unknown;
  ui_hint: unknown;
  has_lifecycle_binding: boolean;
}

interface Finding {
  scope: string;
  entity: string;
  field: string;
  reason: string;
  requiredMetadata: string;
}

const ACTOR_FIELDS = new Set([
  "created_by", "updated_by", "deleted_by", "status_changed_by",
  "posted_by", "approved_by", "rejected_by", "submitted_by",
  "cancelled_by", "closed_by",
]);

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const rows = await loadRows(pool);
    const findings = rows.flatMap(auditField);
    if (reportOnly) printCsv(findings);

    if (findings.length > 0) {
      console.error(`SEMANTIC METADATA AUDIT FAILED: ${findings.length} fallback-dependent field(s)`);
      for (const finding of findings.slice(0, 40)) {
        console.error(`  - ${finding.scope}/${finding.entity}.${finding.field}: ${finding.reason}`);
      }
      if (findings.length > 40) console.error(`  ... and ${findings.length - 40} more`);
      if (!reportOnly) process.exitCode = 1;
      return;
    }
    console.log(`Semantic metadata audit OK — ${rows.length} active fields, zero naming fallbacks.`);
  } finally {
    await pool.end();
  }
}

async function loadRows(pool: pg.Pool): Promise<FieldRow[]> {
  const result = await pool.query<FieldRow>(`
    SELECT e.entity_code,
           COALESCE(ef.tenant_id, e.tenant_id) AS tenant_id,
           ef.name, ef.data_type, ef.ui_type,
           ef.temporal_kind, ef.display_mode,
           ef.enum_domain_code, ef.enum_config,
           ef.reference_config, ef.ui_hint,
           EXISTS (
             SELECT 1
               FROM control.entity_lifecycle el
               JOIN control.lifecycle lc ON lc.id = el.lifecycle_id AND lc.is_active = true
              WHERE el.entity_name = e.entity_code
                AND (el.tenant_id IS NULL OR el.tenant_id IS NOT DISTINCT FROM COALESCE(ef.tenant_id, e.tenant_id))
           ) AS has_lifecycle_binding
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.is_active = true
       AND ev.status = 'EFFECTIVE'
     ORDER BY e.entity_code, ef.name
  `);
  return result.rows;
}

function auditField(row: FieldRow): Finding[] {
  const findings: Finding[] = [];
  const name = row.name.toLowerCase();
  const dataType = row.data_type.toLowerCase();
  const displayRenderer = readNestedString(row.ui_hint, "display", "renderer");
  const hasReference = isNonEmptyRecord(row.reference_config);
  const base = { scope: row.tenant_id ?? "canonical", entity: row.entity_code, field: row.name };

  if (["date", "datetime", "timestamp", "timestamptz"].includes(dataType)
      && (!row.temporal_kind || !row.display_mode)) {
    findings.push({ ...base, reason: "temporal type relies on inferred display semantics", requiredMetadata: "temporal_kind + display_mode" });
  }
  if ((dataType === "enum" || dataType === "lifecycle_state") && displayRenderer !== "lookup_label") {
    findings.push({ ...base, reason: "declared enum lacks an explicit label renderer", requiredMetadata: "display.renderer=lookup_label" });
  }
  if (dataType === "lifecycle_state") {
    const optionKind = readNestedString(readNestedRecord(row.ui_hint, "editor"), "optionSource", "kind");
    const lifecycleMode = readNestedString(readNestedRecord(row.ui_hint, "editor"), "optionSource", "entityLifecycle");
    if (optionKind !== "lifecycle" || lifecycleMode !== "current") {
      findings.push({ ...base, reason: "lifecycle field lacks a live lifecycle option source", requiredMetadata: "editor.optionSource={kind:lifecycle,entityLifecycle:current}" });
    }
    if (!row.has_lifecycle_binding) {
      findings.push({ ...base, reason: "lifecycle field has no active entity lifecycle binding", requiredMetadata: "control.entity_lifecycle binding to an active lifecycle" });
    }
  }
  if (ACTOR_FIELDS.has(name)
      && (!hasReference || row.ui_type !== "reference" || displayRenderer !== "reference_label")) {
    findings.push({ ...base, reason: "actor field lacks an explicit principal reference", requiredMetadata: "principal reference_config + ui_type=reference + reference_label renderer" });
  }
  if (hasReference && displayRenderer !== "reference_label") {
    findings.push({ ...base, reason: "declared reference lacks an explicit label renderer", requiredMetadata: "display.renderer=reference_label" });
  }
  return dedupeFindings(findings);
}

function isNonEmptyRecord(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function readNestedString(value: unknown, parent: string, key: string): string | null {
  if (!isNonEmptyRecord(value)) return null;
  const nested = (value as Record<string, unknown>)[parent];
  if (!isNonEmptyRecord(nested)) return null;
  const result = (nested as Record<string, unknown>)[key];
  return typeof result === "string" && result.trim() ? result : null;
}

function readNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isNonEmptyRecord(value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return isNonEmptyRecord(nested) ? nested as Record<string, unknown> : null;
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.reason}:${finding.requiredMetadata}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function printCsv(findings: Finding[]): void {
  console.log("scope,entity,field,reason,required_metadata");
  for (const finding of findings) {
    console.log([finding.scope, finding.entity, finding.field, finding.reason, finding.requiredMetadata].map(csv).join(","));
  }
}

function csv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

main().catch((error) => {
  console.error("audit-metadata-semantic-fallbacks failed:", error);
  process.exit(1);
});
