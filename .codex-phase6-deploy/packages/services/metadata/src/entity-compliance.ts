/**
 * Entity Compliance Suite — RUNTIME_ROUTING_SPEC §10
 *
 * 10-point checklist that validates every runtime-enabled system entity's metadata posture
 * at dev/staging startup. Never blocks production boot — only logs warnings.
 *
 * Checks (in order):
 *   1.  entity_exists          — control.entity row exists for this code
 *   2.  entity_active          — entity.status = 'ACTIVE'
 *   3.  entity_class_set       — entity.entity_class is non-null
 *   4.  effective_version      — at least one entity_version with status = 'EFFECTIVE'
 *   5.  has_fields             — ≥1 active entity_field in the effective version
 *   6.  snapshot_compiled      — snapshot.entity_compiled row exists
 *   7.  table_reference_set    — table_schema + table_name are both non-null
 *   8.  module_assigned        — entity.module_id is non-null
 *   9.  display_config_set     — display_config is not empty ({})
 *  10.  natural_key_configured — identity_config.natural_key_fields has at least one entry
 *
 * Checks 5–6 are skipped (marked as not-applicable) when check 4 fails.
 */

import { CompiledQuery, type Kysely } from "kysely";
import type { CompileAllSummary } from "./entity-compiler.service.js";
import { validateMetadataGraph } from "./metadata-graph-validator.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComplianceItem {
  check: string;
  passed: boolean;
  detail?: string;
}

export interface ComplianceResult {
  entityCode: string;
  passed: boolean;
  failCount: number;
  items: ComplianceItem[];
}

interface Logger {
  warn(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
}

// ── Single-entity check ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkEntityCompliance(
  db: Kysely<any>,
  entityCode: string,
  options: { snapshotExpected?: boolean } = {},
): Promise<ComplianceResult> {
  const items: ComplianceItem[] = [];

  const pass = (check: string) => items.push({ check, passed: true });
  const fail = (check: string, detail: string) => items.push({ check, passed: false, detail });
  const na   = (check: string, detail: string) => items.push({ check, passed: false, detail: `[skipped] ${detail}` });

  // ── 1. entity_exists ──────────────────────────────────────────────────────
  const entity = await db
    .selectFrom("control.entity as e")
    .select([
      "e.id", "e.status", "e.entity_class",
      "e.table_schema", "e.table_name",
      "e.module_id", "e.display_config", "e.identity_config",
    ])
    .where((eb: any) => eb.or([
      eb("e.name", "=", entityCode),
      eb("e.entity_code", "=", entityCode),
      eb("e.slug", "=", entityCode.replace(/_/g, "-")),
    ]))
    .where("e.tenant_id", "is", null)
    .where("e.runtime_enabled", "=", true)
    .where("e.is_active", "=", true)
    .executeTakeFirst() as Record<string, unknown> | undefined;

  if (!entity) {
    fail("entity_exists", `No control.entity row found for code '${entityCode}'`);
    return { entityCode, passed: false, failCount: 1, items };
  }
  pass("entity_exists");

  // ── 2. entity_active ──────────────────────────────────────────────────────
  if (String(entity["status"]) === "ACTIVE") {
    pass("entity_active");
  } else {
    fail("entity_active", `entity.status = '${String(entity["status"])}' (expected ACTIVE)`);
  }

  // ── 3. entity_class_set ───────────────────────────────────────────────────
  if (entity["entity_class"]) {
    pass("entity_class_set");
  } else {
    fail("entity_class_set", "entity.entity_class is null — routing family cannot be determined");
  }

  // ── 4. effective_version ──────────────────────────────────────────────────
  const version = await db
    .selectFrom("control.entity_version as ev")
    .select(["ev.id"])
    .where("ev.entity_id", "=", entity["id"] as string)
    .where("ev.status", "=", "EFFECTIVE")
    .executeTakeFirst() as { id: string } | undefined;

  if (version) {
    pass("effective_version");
  } else {
    fail("effective_version", "No entity_version with status = EFFECTIVE found");
    na("has_fields",        "depends on effective_version");
    na("snapshot_compiled", "depends on effective_version");
    // Continue with remaining checks that don't need the version
  }

  // ── 5. has_fields (requires effective_version) ────────────────────────────
  if (version) {
    const fields = await db
      .selectFrom("control.entity_field as ef")
      .select(["ef.id"])
      .where("ef.entity_version_id", "=", version.id)
      .where("ef.is_active", "=", true)
      .where("ef.runtime_enabled", "=", true)
      .execute() as unknown[];

    if (fields.length > 0) {
      pass("has_fields");
    } else {
      fail("has_fields", "No active entity_field rows for the effective version");
    }

    // ── 6. snapshot_compiled (requires effective_version) ──────────────────
    if (options.snapshotExpected !== true) {
      na("snapshot_compiled", "graph validation or descriptor compilation did not succeed; snapshot persistence is not evaluated");
    } else {
      const snapshot = await db
        .selectFrom("snapshot.entity_compiled as ec")
        .select(["ec.id"])
        .where("ec.entity_version_id", "=", version.id)
        .where("ec.artifact_kind", "=", "execution")
        .executeTakeFirst() as { id: string } | undefined;

      if (snapshot) {
        pass("snapshot_compiled");
      } else {
        fail("snapshot_compiled", "No snapshot.entity_compiled row — descriptor compilation succeeded but persistence failed");
      }
    }
  }

  // ── 7. table_reference_set ────────────────────────────────────────────────
  if (entity["table_schema"] && entity["table_name"]) {
    pass("table_reference_set");
  } else {
    fail("table_reference_set",
      `table_schema='${String(entity["table_schema"] ?? "")}' table_name='${String(entity["table_name"] ?? "")}'`);
  }

  // ── 8. module_assigned ────────────────────────────────────────────────────
  if (entity["module_id"]) {
    pass("module_assigned");
  } else {
    fail("module_assigned", "entity.module_id is null — entity is not linked to a module");
  }

  // ── 9. display_config_set ─────────────────────────────────────────────────
  const dc = entity["display_config"] as Record<string, unknown> | null;
  if (dc && typeof dc === "object" && Object.keys(dc).length > 0) {
    pass("display_config_set");
  } else {
    fail("display_config_set", "display_config is empty — set detail_renderer and list_columns");
  }

  // ── 10. natural_key_configured ────────────────────────────────────────────
  const identityConfig = entity["identity_config"] && typeof entity["identity_config"] === "object"
    ? entity["identity_config"] as Record<string, unknown>
    : {};
  const nk = identityConfig["natural_key_fields"];
  if (Array.isArray(nk) && nk.length > 0) {
    pass("natural_key_configured");
  } else {
    fail("natural_key_configured", "identity_config.natural_key_fields is empty — business-key URL routing unavailable");
  }

  const failCount = items.filter((i) => !i.passed).length;
  return { entityCode, passed: failCount === 0, failCount, items };
}

// ── Dev-startup runner ────────────────────────────────────────────────────────

/**
 * Run the 10-point compliance suite for all active, runtime-enabled system entities.
 * No-ops in production. Logs warnings for each failing entity but never
 * throws — a misconfigured entity is a warning, not a boot failure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runComplianceSuiteIfDev(
  db: Kysely<any>,
  logger: Logger,
  compileSummary?: CompileAllSummary,
): Promise<void> {
  if (process.env["NODE_ENV"] === "production") return;

  const graphValidation = compileSummary?.graphValidation ?? await validateMetadataGraph({
    query: <T extends object>(text: string, values?: readonly unknown[]) =>
      db.executeQuery<T>(CompiledQuery.raw(text, values ? [...values] : [])),
  });
  if (!graphValidation.passed) {
    logger.warn("entity_compliance_graph_preflight_failed", {
      diagnostics: graphValidation.diagnostics,
    });
    return;
  }

  const entityCodes = compileSummary?.eligibleEntityCodes ?? graphValidation.eligibleEntityCodes;
  const compiledEntityCodes = new Set(compileSummary?.compiledEntityCodes ?? []);

  let totalFailed = 0;

  for (const code of entityCodes) {
    const result = await checkEntityCompliance(db, code, {
      snapshotExpected: compileSummary ? compiledEntityCodes.has(code) : false,
    });
    if (!result.passed) {
      totalFailed++;
      logger.warn("entity_compliance_failed", {
        entityCode: code,
        failCount:  result.failCount,
        failures:   result.items
          .filter((i) => !i.passed)
          .map((i) => ({ check: i.check, detail: i.detail })),
      });
    }
  }

  if (totalFailed > 0) {
    logger.warn("entity_compliance_suite_complete", {
      totalChecked: entityCodes.length,
      totalFailed,
      passed:       entityCodes.length - totalFailed,
      hint: "Fix metadata issues above before deploying to production — see RUNTIME_ROUTING_SPEC §10",
    });
  } else {
    logger.info("entity_compliance_suite_complete", {
      totalChecked: entityCodes.length,
      totalFailed:  0,
      status:       "all_passed",
    });
  }
}
