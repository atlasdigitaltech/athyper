import { NextResponse } from "next/server";

import { proxyGet, proxyMutate, requireAdminSession } from "../../helpers";

import type {
  CompiledSnapshot,
  EntitySummary,
  FieldDefinition,
  IndexDefinition,
  RelationDefinition,
} from "@/lib/schema-manager/types";
import type { NextRequest } from "next/server";

interface RouteContext {
  params: Promise<{ entity: string }>;
}

interface PlanDiagnostic {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
}

/**
 * POST /api/admin/mesh/meta-studio/:entity/plan
 * Runs compile + diagnostics + optional DDL plan preview.
 * Returns a change plan with impact analysis.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;
  const entityPath = `/api/meta/entities/${encodeURIComponent(entity)}`;

  // 1. Get current entity metadata
  const metaRes = await proxyGet(auth, entityPath);
  const metaBody = (await metaRes.json()) as {
    success: boolean;
    data?: EntitySummary;
  };
  if (!metaBody.success || !metaBody.data) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Entity not found" },
      },
      { status: 404 },
    );
  }

  // 2. Trigger compilation
  await proxyMutate(auth, `${entityPath}/compile`, "POST");

  // 3. Fetch compiled result + current schema data
  const [compiledRes, fieldsRes, relationsRes, indexesRes] = await Promise.all([
    proxyGet(auth, `${entityPath}/compiled`),
    proxyGet(auth, `${entityPath}/fields`),
    proxyGet(auth, `${entityPath}/relations`),
    proxyGet(auth, `${entityPath}/indexes`),
  ]);

  const compiledBody = (await compiledRes.json()) as {
    data?: CompiledSnapshot;
  };
  const fieldsBody = (await fieldsRes.json()) as { data?: FieldDefinition[] };
  const relationsBody = (await relationsRes.json()) as {
    data?: RelationDefinition[];
  };
  const indexesBody = (await indexesRes.json()) as { data?: IndexDefinition[] };

  const fields = fieldsBody.data ?? [];
  const relations = relationsBody.data ?? [];
  const indexes = indexesBody.data ?? [];

  // 4. Generate diagnostics
  const diagnostics: PlanDiagnostic[] = [];

  // Check for required fields without defaults
  for (const f of fields) {
    if (
      f.isRequired &&
      f.defaultValue == null &&
      !["id", "tenant_id", "created_at"].includes(f.name)
    ) {
      diagnostics.push({
        level: "warning",
        code: "REQUIRED_NO_DEFAULT",
        message: `Field '${f.name}' is required but has no default value. Existing rows may need backfill.`,
      });
    }
  }

  // Check for unique fields that may conflict
  for (const f of fields) {
    if (f.isUnique && !["id"].includes(f.name)) {
      diagnostics.push({
        level: "info",
        code: "UNIQUE_CONSTRAINT",
        message: `Field '${f.name}' has a unique constraint. Ensure no duplicate data exists.`,
      });
    }
  }

  // Check for relations with cascade delete
  for (const r of relations) {
    if (r.onDelete === "cascade") {
      diagnostics.push({
        level: "warning",
        code: "CASCADE_DELETE",
        message: `Relation '${r.name}' uses CASCADE delete. Deleting a parent will delete child records.`,
      });
    }
  }

  // Check for missing indexes on foreign keys
  for (const r of relations) {
    if (r.fkField) {
      const hasIndex = indexes.some((idx) => {
        const cols = Array.isArray(idx.columns)
          ? (idx.columns as string[])
          : [];
        return cols.includes(r.fkField!);
      });
      if (!hasIndex) {
        diagnostics.push({
          level: "warning",
          code: "FK_NO_INDEX",
          message: `Foreign key '${r.fkField}' on relation '${r.name}' has no index. Queries may be slow.`,
        });
      }
    }
  }

  // Determine if there are breaking changes
  const hasBreaking = diagnostics.some((d) => d.level === "error");

  return NextResponse.json({
    success: true,
    data: {
      entityName: entity,
      versionId: metaBody.data.currentVersion?.id,
      versionNo: metaBody.data.currentVersion?.versionNo,
      compiledHash: compiledBody.data?.compiledHash ?? null,
      diagnostics,
      breaking: hasBreaking,
      summary: {
        fieldCount: fields.length,
        relationCount: relations.length,
        indexCount: indexes.length,
        warningCount: diagnostics.filter((d) => d.level === "warning").length,
        errorCount: diagnostics.filter((d) => d.level === "error").length,
      },
    },
  });
}
