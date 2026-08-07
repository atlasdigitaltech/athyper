#!/usr/bin/env tsx
/**
 * Cascade Rule Coverage Verification (P0 / P1 / P4 CI gate)
 *
 * Asserts that every field declared as "cascading" in the canonical spec
 * has a populated control.entity_field.defaults row.
 *
 * Coverage targets (v1.2):
 *   • purchase_invoice_line:
 *       cost_center_id, profit_center_id, project_id, site_id,
 *       budget_allocation_id, business_intent_id   (6 fields, seeded P0)
 *
 * Schema validation:
 *   • default_value_source.kind ∈ ('parent_field','tenant_config','supplier_config','static')
 *   • when kind=parent_field, parent_entity + parent_field non-empty
 *   • override_detection.compare_to non-empty (or null for non-detecting fields)
 *   • on_parent_change ∈ ('preserve','prompt','inherit','recompute')
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-cascade-rule-coverage.ts
 *
 *   # JSON output for CI:
 *   npx tsx server/scripts/verify-cascade-rule-coverage.ts --json
 *
 * Exit code:
 *   0 — all expected cascade fields have valid defaults
 *   1 — at least one missing or invalid (CI red)
 *
 * Spec: docs/specs/purchase_invoice_field_design.md §4
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const JSON_OUTPUT = process.argv.includes("--json");

interface ExpectedCascade {
  entity_code: string;
  field_name:  string;
  required:    boolean;
}

// Coverage matrix — updated after the AD-dimensions refactor.
// Accounting dimensions (cost_center, profit_center, project, budget_allocation,
// dimension_set) live on document.accounting_distribution; their cascade is
// declared on AD (PI header → AD), not on the P2P line.
const EXPECTED_CASCADES: ExpectedCascade[] = [
  // PIL — only site (logistical) + business_intent stay on the line
  { entity_code: "purchase_invoice_line",  field_name: "site_id",              required: true },
  { entity_code: "purchase_invoice_line",  field_name: "business_intent_id",   required: true },

  // AD — accounting dimensions cascaded from the PI header
  { entity_code: "accounting_distribution", field_name: "cost_center_id",       required: true },
  { entity_code: "accounting_distribution", field_name: "profit_center_id",     required: true },
  { entity_code: "accounting_distribution", field_name: "project_id",           required: true },
  { entity_code: "accounting_distribution", field_name: "budget_allocation_id", required: true },

  // PC — P1 (only run when PC entity is registered; absence is non-fatal here)
];

interface Violation {
  rule:        string;
  entity_code: string;
  field_name:  string;
  detail:      string;
  payload?:    Record<string, unknown>;
}

interface DefaultsRow {
  defaults: Record<string, unknown> | null;
}

const VALID_SOURCE_KINDS         = new Set(["parent_field","tenant_config","supplier_config","static"]);
const VALID_ON_PARENT_CHANGE     = new Set(["preserve","prompt","inherit","recompute"]);

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const violations: Violation[] = [];

  try {
    for (const expected of EXPECTED_CASCADES) {
      const result = await pool.query<DefaultsRow & { exists_count: string }>(`
        WITH ev AS (
          SELECT ev.id AS version_id
            FROM control.entity_version ev
            JOIN control.entity e ON e.id = ev.entity_id
           WHERE e.table_schema = 'document'
             AND e.table_name   = $1
             AND e.tenant_id IS NULL
             AND ev.version_no  = 1
           LIMIT 1
        )
        SELECT
          ef.defaults,
          (SELECT COUNT(*)::text FROM ev) AS exists_count
        FROM ev
        LEFT JOIN control.entity_field ef
          ON ef.entity_version_id = ev.version_id
         AND ef.name              = $2
        LIMIT 1
      `, [expected.entity_code, expected.field_name]);

      const row = result.rows[0];

      // Entity not registered
      if (!row || row.exists_count === "0") {
        if (expected.required) {
          violations.push({
            rule:        "ENTITY_NOT_REGISTERED",
            entity_code: expected.entity_code,
            field_name:  expected.field_name,
            detail:      `entity_version not found for ${expected.entity_code}`,
          });
        }
        continue;
      }

      // Field not registered or defaults null
      if (!row.defaults) {
        if (expected.required) {
          violations.push({
            rule:        "CASCADE_DEFAULTS_MISSING",
            entity_code: expected.entity_code,
            field_name:  expected.field_name,
            detail:      "control.entity_field.defaults is NULL for this cascading field",
          });
        }
        continue;
      }

      // Validate shape
      const defaults = row.defaults as Record<string, unknown>;
      const source   = defaults["default_value_source"] as Record<string, unknown> | undefined;
      const detect   = defaults["override_detection"]  as Record<string, unknown> | null | undefined;
      const onChange = defaults["on_parent_change"];

      if (!source) {
        violations.push({
          rule:        "DEFAULT_VALUE_SOURCE_MISSING",
          entity_code: expected.entity_code,
          field_name:  expected.field_name,
          detail:      "defaults.default_value_source is missing",
        });
        continue;
      }

      const kind = source["kind"];
      if (typeof kind !== "string" || !VALID_SOURCE_KINDS.has(kind)) {
        violations.push({
          rule:        "INVALID_SOURCE_KIND",
          entity_code: expected.entity_code,
          field_name:  expected.field_name,
          detail:      `default_value_source.kind="${kind}" is not in (${Array.from(VALID_SOURCE_KINDS).join(",")})`,
        });
      }

      if (kind === "parent_field") {
        if (!source["parent_entity"] || !source["parent_field"]) {
          violations.push({
            rule:        "PARENT_FIELD_INCOMPLETE",
            entity_code: expected.entity_code,
            field_name:  expected.field_name,
            detail:      "kind=parent_field requires both parent_entity and parent_field",
            payload:     { source },
          });
        }
        // override_detection should also be present for parent_field cascades
        if (!detect) {
          violations.push({
            rule:        "OVERRIDE_DETECTION_MISSING",
            entity_code: expected.entity_code,
            field_name:  expected.field_name,
            detail:      "kind=parent_field should declare override_detection for UI label rendering",
          });
        }
      }

      if (typeof onChange !== "string" || !VALID_ON_PARENT_CHANGE.has(onChange)) {
        violations.push({
          rule:        "INVALID_ON_PARENT_CHANGE",
          entity_code: expected.entity_code,
          field_name:  expected.field_name,
          detail:      `on_parent_change="${onChange}" is not in (${Array.from(VALID_ON_PARENT_CHANGE).join(",")})`,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Report
    // -------------------------------------------------------------------------
    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok:           violations.length === 0,
        violations,
        expected:     EXPECTED_CASCADES.length,
        violation_count: violations.length,
      }, null, 2));
    } else {
      console.log("=== Cascade Rule Coverage Verification ===");
      console.log(`Expected cascade fields: ${EXPECTED_CASCADES.length}`);
      console.log(`Violations:              ${violations.length}`);
      console.log();

      if (violations.length > 0) {
        console.log("--- Violations ---");
        for (const v of violations) {
          console.log(`  [${v.rule}] ${v.entity_code}.${v.field_name}`);
          console.log(`    ${v.detail}`);
          if (v.payload) console.log(`    ${JSON.stringify(v.payload)}`);
        }
        console.log();
        console.log("FAIL — fix the seed 043_entity_field_rules_pi_pil_cascade.sql.");
      } else {
        console.log("OK — all expected cascade fields have valid defaults.");
      }
    }

    // ── §11 on_source_change coverage + cycle + resolver checks ─────────────
    const sourceChangeViolations = await verifyOnSourceChange(pool);
    if (sourceChangeViolations.length > 0) {
      if (JSON_OUTPUT) {
        console.log(JSON.stringify({ on_source_change: sourceChangeViolations }, null, 2));
      } else {
        console.log("--- on_source_change Violations ---");
        for (const v of sourceChangeViolations) {
          console.log(`  [${v.rule}] ${v.entity_code}.${v.field_name}`);
          console.log(`    ${v.detail}`);
          if (v.payload) console.log(`    ${JSON.stringify(v.payload)}`);
        }
      }
    }

    const totalViolations = violations.length + sourceChangeViolations.length;
    process.exit(totalViolations > 0 ? 1 : 0);
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// =============================================================================
// on_source_change verification
//   1. Pairing: every dependent_filter has a matching on_source_change rule
//   2. Vocabulary: action / layers / mode in allowed sets
//   3. Resolver: rederive references exist in resolver-contracts.json and
//                cover the resolver's requiredSources
//   4. Cycle: no directed cycle among mutation-class rules per entity
// Spec: docs/specs/entity_field_defaults.md §8, §9
// =============================================================================

const VALID_OSC_ACTIONS = new Set(["clear","rederive","refilter","validate","warn","lock"]);
const VALID_OSC_LAYERS  = new Set(["client_on_change","bff_on_load_hydrate","server_on_save"]);
const VALID_OSC_MODES   = new Set(["always","if_empty_or_derived"]);
const MUTATING_ACTIONS  = new Set(["clear","rederive","refilter","lock"]);

interface ResolverContractFile {
  contracts: Array<{
    code:            string;
    requiredSources: string[];
    outputType:      string;
    targetEntity?:   string;
  }>;
}

async function verifyOnSourceChange(pool: import("pg").Pool): Promise<Violation[]> {
  const violations: Violation[] = [];

  // Load resolver contracts (CI artifact committed under seed/contracts/generated/).
  let resolverContracts: ResolverContractFile["contracts"] = [];
  try {
    const fs   = await import("node:fs");
    const path = await import("node:path");
    const url  = await import("node:url");
    const __filename = url.fileURLToPath(import.meta.url);
    const __dirname  = path.dirname(__filename);
    const contractsPath = path.join(__dirname, "..", "db", "seed", "contracts", "generated", "resolver-contracts.json");
    if (fs.existsSync(contractsPath)) {
      const data = JSON.parse(fs.readFileSync(contractsPath, "utf-8")) as ResolverContractFile;
      resolverContracts = data.contracts;
    } else {
      violations.push({
        rule: "RESOLVER_CONTRACTS_FILE_MISSING",
        entity_code: "_",
        field_name:  "_",
        detail:      `${contractsPath} not found. Run: tsx server/scripts/export-resolver-contracts.ts`,
      });
    }
  } catch (err) {
    violations.push({
      rule: "RESOLVER_CONTRACTS_FILE_READ_ERROR",
      entity_code: "_",
      field_name:  "_",
      detail:      err instanceof Error ? err.message : String(err),
    });
  }
  const contractByCode = new Map<string, ResolverContractFile["contracts"][number]>();
  for (const c of resolverContracts) contractByCode.set(c.code, c);

  // Fetch every entity_field row with lookup_config.dependent_filter or defaults.on_source_change.
  const result = await pool.query<{
    entity_code:        string;
    field_name:         string;
    target_entity_code: string | null;
    dependent_filter:   { source_field?: string; target_field?: string } | null;
    on_source_change:   Array<Record<string, unknown>> | null;
    defaults:           Record<string, unknown> | null;
  }>(`
    SELECT
      e.name                                         AS entity_code,
      ef.name                                        AS field_name,
      COALESCE(
        ef.reference_config->>'target_entity',
        ef.reference_config->>'ref_entity',
        ef.validation->>'ref_entity'
      )                                              AS target_entity_code,
      ef.lookup_config->'dependent_filter'           AS dependent_filter,
      ef.defaults->'on_source_change'                AS on_source_change,
      ef.defaults                                    AS defaults
    FROM control.entity_field ef
    JOIN control.entity_version ev ON ev.id = ef.entity_version_id
    JOIN control.entity e          ON e.id  = ev.entity_id
   WHERE e.tenant_id IS NULL
     AND ev.status   = 'EFFECTIVE'
     AND ef.is_active = true
     AND (
       ef.lookup_config ? 'dependent_filter'
       OR ef.defaults   ? 'on_source_change'
     )
  `);

  // Group by entity_code for cycle detection.
  const byEntity = new Map<string, Array<typeof result.rows[number]>>();
  for (const row of result.rows) {
    if (!byEntity.has(row.entity_code)) byEntity.set(row.entity_code, []);
    byEntity.get(row.entity_code)!.push(row);
  }

  for (const row of result.rows) {
    // ── 1. Pairing ──────────────────────────────────────────────────────────
    if (row.dependent_filter) {
      const dfSource = row.dependent_filter.source_field;
      if (dfSource) {
        const oscSources = collectOscSources(row.on_source_change);
        if (!oscSources.has(dfSource)) {
          violations.push({
            rule:        "ON_SOURCE_CHANGE_MISSING",
            entity_code: row.entity_code,
            field_name:  row.field_name,
            detail:      `dependent_filter.source_field='${dfSource}' has no matching on_source_change rule. Add a defaults.on_source_change rule.`,
          });
        }
      }
    }

    // ── 2. Vocabulary + 3. Resolver ─────────────────────────────────────────
    if (Array.isArray(row.on_source_change)) {
      row.on_source_change.forEach((rule, idx) => {
        const action = rule["action"];
        if (typeof action !== "string" || !VALID_OSC_ACTIONS.has(action)) {
          violations.push({
            rule:        "OSC_INVALID_ACTION",
            entity_code: row.entity_code,
            field_name:  row.field_name,
            detail:      `on_source_change[${idx}].action='${action}' is not in (${[...VALID_OSC_ACTIONS].join(",")})`,
          });
        }

        const layers = rule["layers"];
        if (!Array.isArray(layers) || layers.length === 0) {
          violations.push({
            rule:        "OSC_LAYERS_MISSING",
            entity_code: row.entity_code,
            field_name:  row.field_name,
            detail:      `on_source_change[${idx}].layers must be a non-empty array`,
          });
        } else {
          for (const layer of layers) {
            if (typeof layer !== "string" || !VALID_OSC_LAYERS.has(layer)) {
              violations.push({
                rule:        "OSC_INVALID_LAYER",
                entity_code: row.entity_code,
                field_name:  row.field_name,
                detail:      `on_source_change[${idx}].layers contains invalid value '${layer}'. Allowed: ${[...VALID_OSC_LAYERS].join(",")}`,
              });
            }
          }
        }

        const sources = rule["sources"];
        if (!Array.isArray(sources) || sources.length === 0 || sources.some((s) => typeof s !== "string")) {
          violations.push({
            rule:        "OSC_SOURCES_INVALID",
            entity_code: row.entity_code,
            field_name:  row.field_name,
            detail:      `on_source_change[${idx}].sources must be a non-empty string array`,
          });
        }

        if (action === "rederive") {
          const resolver = rule["resolver"];
          if (typeof resolver !== "string") {
            violations.push({
              rule:        "OSC_REDERIVE_RESOLVER_MISSING",
              entity_code: row.entity_code,
              field_name:  row.field_name,
              detail:      `on_source_change[${idx}].action='rederive' requires a resolver code`,
            });
          } else {
            const contract = contractByCode.get(resolver);
            if (!contract) {
              violations.push({
                rule:        "OSC_RESOLVER_NOT_REGISTERED",
                entity_code: row.entity_code,
                field_name:  row.field_name,
                detail:      `resolver '${resolver}' is not in resolver-contracts.json. Run: tsx server/scripts/export-resolver-contracts.ts`,
              });
            } else {
              const ruleSources = Array.isArray(sources) ? sources as string[] : [];
              const missing = contract.requiredSources.filter((req) => !ruleSources.includes(req));
              if (missing.length > 0) {
                violations.push({
                  rule:        "OSC_RESOLVER_SOURCES_INSUFFICIENT",
                  entity_code: row.entity_code,
                  field_name:  row.field_name,
                  detail:      `resolver '${resolver}' requires sources ${JSON.stringify(contract.requiredSources)}; rule sources missing: ${missing.join(",")}`,
                });
              }
              if (contract.outputType === "uuid" && contract.targetEntity && row.target_entity_code && contract.targetEntity !== row.target_entity_code) {
                violations.push({
                  rule:        "OSC_RESOLVER_TARGET_ENTITY_MISMATCH",
                  entity_code: row.entity_code,
                  field_name:  row.field_name,
                  detail:      `resolver '${resolver}' targets entity '${contract.targetEntity}' but field's reference targets '${row.target_entity_code}'`,
                });
              }
            }
          }

          const mode = rule["mode"];
          if (mode !== undefined && (typeof mode !== "string" || !VALID_OSC_MODES.has(mode))) {
            violations.push({
              rule:        "OSC_INVALID_MODE",
              entity_code: row.entity_code,
              field_name:  row.field_name,
              detail:      `on_source_change[${idx}].mode='${mode}' is not in (${[...VALID_OSC_MODES].join(",")})`,
            });
          }
        }

        // Layer sanity: warn rules with server_on_save layer are silently
        // ignored by the server validator. Warn the seed author.
        if (action === "warn" && Array.isArray(layers) && layers.includes("server_on_save")) {
          violations.push({
            rule:        "OSC_WARN_ON_SERVER_LAYER_IGNORED",
            entity_code: row.entity_code,
            field_name:  row.field_name,
            detail:      `on_source_change[${idx}] action='warn' includes layer='server_on_save' — server ignores warn. Remove that layer.`,
          });
        }
      });
    }
  }

  // ── 4. Cycle detection (per entity) ─────────────────────────────────────────
  for (const [entityCode, rows] of byEntity.entries()) {
    const adj = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!Array.isArray(row.on_source_change)) continue;
      for (const rule of row.on_source_change) {
        const action = rule["action"];
        if (typeof action !== "string" || !MUTATING_ACTIONS.has(action)) continue;
        const sources = rule["sources"];
        if (!Array.isArray(sources)) continue;
        const set = adj.get(row.field_name) ?? new Set<string>();
        for (const src of sources) {
          if (typeof src === "string") set.add(src);
        }
        adj.set(row.field_name, set);
      }
    }
    const cycles = detectCyclesSimple(adj);
    for (const cycle of cycles) {
      violations.push({
        rule:        "OSC_CYCLE_DETECTED",
        entity_code: entityCode,
        field_name:  cycle[0]!,
        detail:      `on_source_change rules form a cycle among mutation actions: ${cycle.join(" → ")}`,
      });
    }
  }

  return violations;
}

function collectOscSources(rules: Array<Record<string, unknown>> | null): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(rules)) return out;
  for (const rule of rules) {
    const action = rule["action"];
    if (typeof action !== "string" || !MUTATING_ACTIONS.has(action)) continue;
    const sources = rule["sources"];
    if (!Array.isArray(sources)) continue;
    for (const s of sources) if (typeof s === "string") out.add(s);
  }
  return out;
}

function detectCyclesSimple(adj: Map<string, Set<string>>): string[][] {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const cycles: string[][] = [];
  const seen  = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  function dfs(node: string): void {
    color.set(node, GRAY);
    stack.push(node);
    onStack.add(node);
    const next = adj.get(node);
    if (next) {
      for (const n of Array.from(next).sort()) {
        const c = color.get(n) ?? WHITE;
        if (!adj.has(n)) continue;
        if (c === WHITE) {
          dfs(n);
        } else if (c === GRAY && onStack.has(n)) {
          const cut = stack.indexOf(n);
          const cycle = [...stack.slice(cut), n];
          const ring = cycle.slice(0, -1);
          let minIdx = 0;
          for (let i = 1; i < ring.length; i += 1) if (ring[i]! < ring[minIdx]!) minIdx = i;
          const key = [...ring.slice(minIdx), ...ring.slice(0, minIdx)].join("→");
          if (!seen.has(key)) {
            seen.add(key);
            cycles.push(cycle);
          }
        }
      }
    }
    stack.pop();
    onStack.delete(node);
    color.set(node, BLACK);
  }

  for (const node of Array.from(adj.keys()).sort()) {
    if ((color.get(node) ?? WHITE) === WHITE) dfs(node);
  }
  return cycles;
}

main();
