import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../../helpers";

import type { NextRequest } from "next/server";

/**
 * GET /api/admin/mesh/meta-studio/[entity]/diff?base={versionId}&target={versionId}
 *
 * Computes a semantic diff between two entity versions.
 * Fetches both version schemas from the runtime API and compares fields, relations, indexes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const baseVersion = searchParams.get("base");
  const targetVersion = searchParams.get("target");

  if (!baseVersion || !targetVersion) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "MISSING_PARAMS",
          message: "Both 'base' and 'target' version IDs are required",
        },
      },
      { status: 400 },
    );
  }

  const { entity } = await params;

  try {
    // Fetch both versions from runtime API
    const [baseRes, targetRes] = await Promise.all([
      fetch(
        `${auth.runtimeApiUrl}/api/meta/entities/${encodeURIComponent(entity)}/versions?versionId=${baseVersion}`,
        {
          headers: {
            "X-Correlation-Id": auth.correlationId,
            "X-Tenant-Id": auth.tenantId,
          },
          signal: AbortSignal.timeout(10_000),
        },
      ),
      fetch(
        `${auth.runtimeApiUrl}/api/meta/entities/${encodeURIComponent(entity)}/versions?versionId=${targetVersion}`,
        {
          headers: {
            "X-Correlation-Id": auth.correlationId,
            "X-Tenant-Id": auth.tenantId,
          },
          signal: AbortSignal.timeout(10_000),
        },
      ),
    ]);

    if (!baseRes.ok || !targetRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VERSION_FETCH_ERROR",
            message: "Failed to fetch one or both versions",
          },
        },
        { status: 502 },
      );
    }

    const baseData = (await baseRes.json()) as { data?: VersionData };
    const targetData = (await targetRes.json()) as { data?: VersionData };

    if (!baseData.data || !targetData.data) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VERSION_NOT_FOUND",
            message: "One or both versions not found",
          },
        },
        { status: 404 },
      );
    }

    const diff = computeSchemaDiff(baseData.data, targetData.data);

    return NextResponse.json(
      { success: true, data: diff },
      { headers: { "X-Correlation-Id": auth.correlationId } },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: "DIFF_ERROR", message: String(error) } },
      { status: 500 },
    );
  }
}

// ─── Types ───────────────────────────────────────────────────

interface VersionData {
  id: string;
  fields?: FieldDef[];
  relations?: RelationDef[];
  indexes?: IndexDef[];
  [key: string]: unknown;
}

interface FieldDef {
  name: string;
  columnName?: string;
  dataType?: string;
  data_type?: string;
  isRequired?: boolean;
  is_required?: boolean;
  isUnique?: boolean;
  is_unique?: boolean;
  [key: string]: unknown;
}

interface RelationDef {
  name: string;
  targetEntity?: string;
  target_entity?: string;
  relationKind?: string;
  relation_kind?: string;
  [key: string]: unknown;
}

interface IndexDef {
  name: string;
  columns?: unknown;
  isUnique?: boolean;
  is_unique?: boolean;
  [key: string]: unknown;
}

interface SchemaDiff {
  fields: FieldDiffEntry[];
  relations: RelationDiffEntry[];
  indexes: IndexDiffEntry[];
  breaking: boolean;
  summary: string;
}

interface FieldDiffEntry {
  kind: "added" | "removed" | "modified" | "type_changed";
  fieldName: string;
  breaking: boolean;
  detail: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

interface RelationDiffEntry {
  kind: "added" | "removed" | "modified";
  name: string;
  detail: string;
}

interface IndexDiffEntry {
  kind: "added" | "removed" | "modified";
  name: string;
  detail: string;
}

// ─── Diff Computation ────────────────────────────────────────

function computeSchemaDiff(base: VersionData, target: VersionData): SchemaDiff {
  const fieldDiffs: FieldDiffEntry[] = [];
  const relationDiffs: RelationDiffEntry[] = [];
  const indexDiffs: IndexDiffEntry[] = [];
  let breaking = false;

  // Compare fields
  const baseFields = new Map((base.fields ?? []).map((f) => [f.name, f]));
  const targetFields = new Map((target.fields ?? []).map((f) => [f.name, f]));

  // Added fields
  for (const [name, field] of targetFields) {
    if (!baseFields.has(name)) {
      fieldDiffs.push({
        kind: "added",
        fieldName: name,
        breaking: false,
        detail: `Field '${name}' added (${field.dataType ?? field.data_type ?? "unknown"})`,
        after: field as Record<string, unknown>,
      });
    }
  }

  // Removed fields
  for (const [name, field] of baseFields) {
    if (!targetFields.has(name)) {
      breaking = true;
      fieldDiffs.push({
        kind: "removed",
        fieldName: name,
        breaking: true,
        detail: `Field '${name}' removed`,
        before: field as Record<string, unknown>,
      });
    }
  }

  // Modified fields
  for (const [name, targetField] of targetFields) {
    const baseField = baseFields.get(name);
    if (!baseField) continue;

    const baseType = baseField.dataType ?? baseField.data_type;
    const targetType = targetField.dataType ?? targetField.data_type;

    if (baseType !== targetType) {
      breaking = true;
      fieldDiffs.push({
        kind: "type_changed",
        fieldName: name,
        breaking: true,
        detail: `Field '${name}' type changed: ${baseType} → ${targetType}`,
        before: baseField as Record<string, unknown>,
        after: targetField as Record<string, unknown>,
      });
    } else {
      // Check other property changes
      const baseReq = baseField.isRequired ?? baseField.is_required;
      const targetReq = targetField.isRequired ?? targetField.is_required;
      if (baseReq !== targetReq) {
        fieldDiffs.push({
          kind: "modified",
          fieldName: name,
          breaking: !baseReq && !!targetReq, // Making required is breaking
          detail: `Field '${name}' required changed: ${baseReq} → ${targetReq}`,
          before: baseField as Record<string, unknown>,
          after: targetField as Record<string, unknown>,
        });
        if (!baseReq && !!targetReq) breaking = true;
      }
    }
  }

  // Compare relations
  const baseRels = new Map((base.relations ?? []).map((r) => [r.name, r]));
  const targetRels = new Map((target.relations ?? []).map((r) => [r.name, r]));

  for (const [name] of targetRels) {
    if (!baseRels.has(name)) {
      relationDiffs.push({
        kind: "added",
        name,
        detail: `Relation '${name}' added`,
      });
    }
  }
  for (const [name] of baseRels) {
    if (!targetRels.has(name)) {
      relationDiffs.push({
        kind: "removed",
        name,
        detail: `Relation '${name}' removed`,
      });
    }
  }

  // Compare indexes
  const baseIdx = new Map((base.indexes ?? []).map((i) => [i.name, i]));
  const targetIdx = new Map((target.indexes ?? []).map((i) => [i.name, i]));

  for (const [name] of targetIdx) {
    if (!baseIdx.has(name)) {
      indexDiffs.push({ kind: "added", name, detail: `Index '${name}' added` });
    }
  }
  for (const [name] of baseIdx) {
    if (!targetIdx.has(name)) {
      indexDiffs.push({
        kind: "removed",
        name,
        detail: `Index '${name}' removed`,
      });
    }
  }

  // Summary
  const parts: string[] = [];
  const added = fieldDiffs.filter((d) => d.kind === "added").length;
  const removed = fieldDiffs.filter((d) => d.kind === "removed").length;
  const modified = fieldDiffs.filter(
    (d) => d.kind === "modified" || d.kind === "type_changed",
  ).length;

  if (added) parts.push(`${added} field(s) added`);
  if (removed) parts.push(`${removed} field(s) removed`);
  if (modified) parts.push(`${modified} field(s) modified`);
  if (relationDiffs.length)
    parts.push(`${relationDiffs.length} relation change(s)`);
  if (indexDiffs.length) parts.push(`${indexDiffs.length} index change(s)`);

  const summary = parts.length > 0 ? parts.join(", ") : "No changes detected";

  return {
    fields: fieldDiffs,
    relations: relationDiffs,
    indexes: indexDiffs,
    breaking,
    summary,
  };
}
