/**
 * PII Field Inventory / DSAR Readiness API
 *
 * GET /api/admin/governance/pii-inventory → all PII-classified fields with privacy metadata
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getApiContext, resolveTenantUuid, unauthorizedResponse } from "@/lib/api-context";

export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not configured" } },
      { status: 503 },
    );
  }

  const { context } = await getApiContext();
  if (!context) return unauthorizedResponse();
  const tid = await resolveTenantUuid(db, context.tenantId);

  try {
    const fields = await sql<{
      entity_name: string;
      table_schema: string;
      table_name: string;
      field_path: string;
      pii_classification: string;
      mask_strategy: string | null;
      lawful_basis: string | null;
      consent_required: boolean;
      retention_override_days: number | null;
      anonymization_strategy: string | null;
      cross_border_restricted: boolean;
      data_subject_type: string | null;
      is_active: boolean;
    }>`
      SELECT entity_name, table_schema, table_name, field_path,
             pii_classification, mask_strategy, lawful_basis, consent_required,
             retention_override_days, anonymization_strategy,
             cross_border_restricted, data_subject_type, is_active
      FROM meta.pii_field_inventory
      WHERE tenant_id = ${tid}::uuid
      ORDER BY entity_name, field_path
    `.execute(db);

    // Summary statistics
    const byClassification = new Map<string, number>();
    const byEntity = new Map<string, number>();
    let consentRequiredCount = 0;
    let crossBorderRestrictedCount = 0;

    for (const f of fields.rows) {
      byClassification.set(f.pii_classification, (byClassification.get(f.pii_classification) ?? 0) + 1);
      byEntity.set(f.entity_name, (byEntity.get(f.entity_name) ?? 0) + 1);
      if (f.consent_required) consentRequiredCount++;
      if (f.cross_border_restricted) crossBorderRestrictedCount++;
    }

    return NextResponse.json({
      success: true,
      data: {
        fields: fields.rows.map((f) => ({
          entityName: f.entity_name,
          tableSchema: f.table_schema,
          tableName: f.table_name,
          fieldPath: f.field_path,
          piiClassification: f.pii_classification,
          maskStrategy: f.mask_strategy,
          lawfulBasis: f.lawful_basis,
          consentRequired: f.consent_required,
          retentionOverrideDays: f.retention_override_days,
          anonymizationStrategy: f.anonymization_strategy,
          crossBorderRestricted: f.cross_border_restricted,
          dataSubjectType: f.data_subject_type,
          isActive: f.is_active,
        })),
        summary: {
          totalPiiFields: fields.rows.length,
          byClassification: Object.fromEntries(byClassification),
          byEntity: Object.fromEntries(byEntity),
          consentRequiredCount,
          crossBorderRestrictedCount,
        },
      },
    });
  } catch (err) {
    console.error("[governance/pii-inventory] Error:", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } },
      { status: 500 },
    );
  }
}
