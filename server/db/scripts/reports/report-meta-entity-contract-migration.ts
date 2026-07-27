#!/usr/bin/env tsx
/**
 * Read-only M7 legacy migration planner.
 *
 * It exports every current legacy graph, builds a deterministic v2.1 candidate
 * where that can be done without guessing, computes canonical hashes and emits
 * an explicit publication plan. Ambiguous entities are quarantined; this tool
 * never updates publication pointers and never reads or writes counter values.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";

// Keep this operational script within server/db's TypeScript root. Using
// non-literal relative specifiers prevents tsc from importing workspace source
// files outside that root while tsx can execute the source directly.
const CONTRACT_V2_MODULE: string =
  "../../../../packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v2.ts";
const CONTRACT_V21_MODULE: string =
  "../../../../packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v21.ts";
const CONTRACT_UPGRADE_MODULE: string =
  "../../../../packages/shared/data-integration/api-contracts/src/schemas/meta-entity-contract-v21-upgrade.ts";
const { MetaEntityContractV2Schema } = await import(CONTRACT_V2_MODULE);
const {
  MetaEntityContractV21Schema,
  canonicalizeMetaEntityContractV21,
} = await import(CONTRACT_V21_MODULE);
const { upgradeMetaEntityContractV20ToV21 } =
  await import(CONTRACT_UPGRADE_MODULE);

interface LegacyGraph {
  fields: unknown[];
  relations: unknown[];
  surfaces: unknown[];
  field_surfaces: unknown[];
  operations: unknown[];
  action_rules: unknown[];
  lifecycles: unknown[];
  lifecycle_masks: unknown[];
  numbering_configurations: unknown[];
  flows: unknown[];
  flow_steps: unknown[];
  flow_sections: unknown[];
  flow_fields: unknown[];
}

interface LegacyEntityRow {
  entity_id: string;
  entity_code: string;
  tenant_id: string | null;
  version_id: string | null;
  version_no: number | null;
  version_status: string | null;
  contract_schema_version: string | null;
  contract_document: unknown;
  contract_hash: string | null;
  graph: LegacyGraph;
  runtime_counter_count: string;
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");
const outputArg = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
const outputPath = resolve(outputArg || "artifacts/meta-entity-contract-migration-report.json");
const failOnQuarantine = process.argv.includes("--fail-on-quarantine");

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const rows = await client.query<LegacyEntityRow>(`
    SELECT
      entity.id::text AS entity_id,
      entity.entity_code,
      entity.tenant_id::text AS tenant_id,
      version.id::text AS version_id,
      version.version_no,
      version.status AS version_status,
      version.contract_schema_version,
      version.contract_document,
      version.contract_hash,
      jsonb_build_object(
        'fields', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.sort_order, row.name)
          FROM control.entity_field row WHERE row.entity_version_id=version.id), '[]'::jsonb),
        'relations', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.name)
          FROM control.entity_relation row WHERE row.entity_version_id=version.id), '[]'::jsonb),
        'surfaces', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.v2_mode, row.surface_key)
          FROM control.entity_surface row WHERE row.entity_version_id=version.id), '[]'::jsonb),
        'field_surfaces', COALESCE((SELECT jsonb_agg(to_jsonb(row))
          FROM control.entity_field_surface row WHERE row.entity_version_id=version.id), '[]'::jsonb),
        'operations', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.sort_order, row.operation_code)
          FROM control.entity_operation row WHERE row.entity_version_id=version.id), '[]'::jsonb),
        'action_rules', COALESCE((SELECT jsonb_agg(to_jsonb(row))
          FROM control.entity_action_rule row WHERE row.entity_version_id=version.id), '[]'::jsonb),
        'lifecycles', COALESCE((SELECT jsonb_agg(to_jsonb(row))
          FROM control.entity_lifecycle row WHERE row.entity_version_id=version.id), '[]'::jsonb),
        'lifecycle_masks', COALESCE((SELECT jsonb_agg(to_jsonb(row))
          FROM control.entity_lifecycle_state_mask row WHERE row.entity_version_id=version.id), '[]'::jsonb),
        'numbering_configurations', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.created_at, row.id)
          FROM control.entity_numbering_config row WHERE row.entity_version_id=version.id), '[]'::jsonb),
        'flows', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.flow_code)
          FROM control.entity_flow row WHERE row.entity_version_id=version.id), '[]'::jsonb),
        'flow_steps', COALESCE((SELECT jsonb_agg(to_jsonb(step) ORDER BY flow.flow_code, step.sort_order)
          FROM control.entity_flow flow JOIN control.entity_flow_step step ON step.flow_id=flow.id
          WHERE flow.entity_version_id=version.id), '[]'::jsonb),
        'flow_sections', COALESCE((SELECT jsonb_agg(to_jsonb(section) ORDER BY flow.flow_code, step.sort_order, section.sort_order)
          FROM control.entity_flow flow
          JOIN control.entity_flow_step step ON step.flow_id=flow.id
          JOIN control.entity_flow_section section ON section.flow_step_id=step.id
          WHERE flow.entity_version_id=version.id), '[]'::jsonb),
        'flow_fields', COALESCE((SELECT jsonb_agg(to_jsonb(field_binding) ORDER BY flow.flow_code, step.sort_order, field_binding.sort_order)
          FROM control.entity_flow flow
          JOIN control.entity_flow_step step ON step.flow_id=flow.id
          JOIN control.entity_flow_field field_binding ON field_binding.flow_step_id=step.id
          WHERE flow.entity_version_id=version.id), '[]'::jsonb)
      ) AS graph,
      (SELECT count(*)::text
         FROM control.entity_numbering_counter counter
         JOIN control.entity_numbering_config numbering_config
           ON numbering_config.id=counter.config_id
        WHERE numbering_config.entity_id=entity.id
          AND counter.tenant_id IS NOT DISTINCT FROM entity.tenant_id) AS runtime_counter_count
    FROM control.entity entity
    LEFT JOIN control.entity_publish_state state
      ON state.entity_id=entity.id
     AND state.tenant_id IS NOT DISTINCT FROM entity.tenant_id
    LEFT JOIN LATERAL (
      SELECT candidate.*
        FROM control.entity_version candidate
       WHERE candidate.entity_id=entity.id
         AND candidate.tenant_id IS NOT DISTINCT FROM entity.tenant_id
       ORDER BY
         (candidate.id=state.published_version_id) DESC,
         (candidate.status='EFFECTIVE') DESC,
         candidate.version_no DESC
       LIMIT 1
    ) version ON true
    ORDER BY entity.tenant_id NULLS FIRST, entity.entity_code
  `);

  const entries = rows.rows.map(planMigration);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    counterPolicy: "Runtime numbering counters are counted only; values are never exported, cloned, reset or updated.",
    summary: {
      entities: entries.length,
      ready: entries.filter((entry) => entry.status === "READY").length,
      alreadyV21: entries.filter((entry) => entry.status === "ALREADY_V21").length,
      quarantined: entries.filter((entry) => entry.status === "QUARANTINED").length,
      tenantOverlays: entries.filter((entry) => entry.tenantId !== null).length,
    },
    platformEntities: entries.filter((entry) => entry.tenantId === null),
    tenantOverlays: entries.filter((entry) => entry.tenantId !== null),
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`WROTE ${outputPath}\n${JSON.stringify(report.summary)}\n`);
  if (failOnQuarantine && report.summary.quarantined > 0) process.exitCode = 1;
} finally {
  await client.end();
}

function planMigration(row: LegacyEntityRow) {
  const ambiguities: string[] = [];
  const graph = normalizeGraph(row.graph);
  if (!row.version_id) ambiguities.push("No current entity version exists.");
  if (!row.contract_document) ambiguities.push("No canonical or compatibility Contract document exists.");

  let candidate: unknown = null;
  let sourceSchema: "2.0" | "2.1" | "unknown" = "unknown";
  const v21 = MetaEntityContractV21Schema.safeParse(row.contract_document);
  if (v21.success) {
    sourceSchema = "2.1";
    candidate = canonicalizeMetaEntityContractV21(v21.data);
  } else {
    const v20 = MetaEntityContractV2Schema.safeParse(row.contract_document);
    if (v20.success) {
      sourceSchema = "2.0";
      try {
        candidate = upgradeMetaEntityContractV20ToV21(v20.data, { strictHydration: false });
      } catch (error) {
        ambiguities.push(`Deterministic upgrade failed: ${String(error)}`);
      }
      if (graph.numbering_configurations.length > (v20.data.numbering ? 1 : 0)) {
        ambiguities.push("Multiple relational numbering configurations require explicit ordered hydration.");
      }
      if (graph.lifecycle_masks.length > 0 || graph.lifecycles.length > 0) {
        ambiguities.push("Lifecycle definitions and masks require explicit immutable-version hydration.");
      }
      if (graph.action_rules.length > 0) {
        ambiguities.push("Action rules require explicit operation ownership hydration.");
      }
      if (graph.flow_steps.length > 0 || graph.flow_sections.length > 0 || graph.flow_fields.length > 0) {
        ambiguities.push("Flow children require explicit step/section/field hydration.");
      }
    } else if (row.contract_document) {
      ambiguities.push("Contract document is neither valid v2.0 nor v2.1.");
    }
  }

  const canonicalHash = candidate ? contractHash(candidate) : null;
  const status = ambiguities.length > 0
    ? "QUARANTINED"
    : sourceSchema === "2.1" ? "ALREADY_V21" : "READY";
  const relationalCounts = Object.fromEntries(
    Object.entries(graph).map(([key, values]) => [key, values.length]),
  );
  return {
    entityId: row.entity_id,
    entityCode: row.entity_code,
    tenantId: row.tenant_id,
    sourceVersionId: row.version_id,
    sourceVersionNo: row.version_no,
    sourceVersionStatus: row.version_status,
    sourceSchema,
    sourceHash: row.contract_hash,
    candidateHash: canonicalHash,
    status,
    ambiguities,
    legacyGraph: graph,
    candidateContract: candidate,
    semanticDifference: {
      hashChanged: Boolean(row.contract_hash && canonicalHash && row.contract_hash !== canonicalHash),
      relationalCounts,
      preservedRuntimeCounterCount: Number(row.runtime_counter_count),
    },
    publicationPlan: status === "READY"
      ? {
          action: "IMPORT_AS_DRAFT_VALIDATE_REVIEW_PUBLISH",
          pointerPolicy: "Contract application service atomically updates pointers after READY hashes match.",
          legacyShadowComparison: true,
        }
      : status === "ALREADY_V21"
        ? { action: "SHADOW_COMPILE_AND_COMPARE", legacyShadowComparison: true }
        : { action: "QUARANTINE_FOR_OWNER_REVIEW", legacyShadowComparison: true },
  };
}

function normalizeGraph(value: Partial<LegacyGraph> | null | undefined): LegacyGraph {
  const array = (key: keyof LegacyGraph): unknown[] =>
    Array.isArray(value?.[key]) ? value[key] : [];
  return {
    fields: array("fields"),
    relations: array("relations"),
    surfaces: array("surfaces"),
    field_surfaces: array("field_surfaces"),
    operations: array("operations"),
    action_rules: array("action_rules"),
    lifecycles: array("lifecycles"),
    lifecycle_masks: array("lifecycle_masks"),
    numbering_configurations: array("numbering_configurations"),
    flows: array("flows"),
    flow_steps: array("flow_steps"),
    flow_sections: array("flow_sections"),
    flow_fields: array("flow_fields"),
  };
}

function contractHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
