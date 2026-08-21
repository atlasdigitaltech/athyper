#!/usr/bin/env tsx
/**
 * PC Affordance Parity Guard (v3.1 Phase 1).
 *
 * Static cross-check that the canonical PC affordance matrix in
 *   packages/shared/data-integration/api-contracts/src/schemas/pc-affordance-matrix.ts
 * stays in lockstep with:
 *
 *   1. The DDL trigger fn_pc_supersede_only_update in
 *      server/db/ddl/document/01u_tables_pricing_component.sql
 *      (free-edit set, blocked set, supersede-only fall-through)
 *
 *   2. The AP route status-set declarations (legacy, may be removed in
 *      Phase 1 cleanup but we keep checking until they're gone)
 *      server/packages/services/finance/routes/ap.route.ts
 *
 * Drift directions that must fail CI:
 *
 *   - Matrix grants `canEdit` for a status the trigger blocks
 *     â†’ DB will raise PC_SUPERSEDE_ONLY at runtime, surfaces as 500
 *   - Matrix grants `canEdit`/`canDelete`/`canSupersede` for a status the
 *     trigger raises `PC_LOCKED_BY_STATUS` on â†’ DB error to user
 *   - Trigger free-edit set includes a status the matrix denies â†’ UI
 *     hides affordances users could legitimately use
 *
 * Usage:
 *   npx tsx server/scripts/verify-pc-affordance-parity.ts
 *   npx tsx server/scripts/verify-pc-affordance-parity.ts --json
 *
 * Exit:
 *   0 â€” matrix in parity with trigger
 *   1 â€” drift found (CI fails)
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getPcCapabilities,
  PC_AFFORDANCE_MATRIX,
  type PcCapabilities,
} from "../../packages/shared/data-integration/api-contracts/src/schemas/pc-affordance-matrix.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..", "..");

const JSON_OUTPUT = process.argv.includes("--json");

const TRIGGER_PATH = resolve(
  ROOT, "server", "db", "ddl", "document", "01u_tables_pricing_component.sql",
);
const ROUTE_PATH = resolve(
  ROOT, "server", "packages", "services", "finance", "routes", "ap.route.ts",
);

interface Finding {
  severity: "error" | "known_drift";
  source:   string;
  status:   string;
  message:  string;
}

// â”€â”€â”€ SQL parser: extract free-edit + blocked sets from the trigger â”€â”€â”€â”€

function parseTriggerSets(sql: string): { freeEdit: Set<string>; blocked: Set<string> } {
  // Find every `IF parent_status IN (â€¦) THEN <body> END IF;` block, then
  // classify each by what its body does (RETURN NEW = free edit, RAISE
  // PC_LOCKED_BY_STATUS = blocked). A single shared regex would over-
  // capture across the first IF when the second IF holds the RAISE.
  const blockRe = /IF\s+parent_status\s+IN\s*\(([^)]+)\)\s+THEN([\s\S]*?)END\s+IF\s*;/gi;
  const freeEdit = new Set<string>();
  const blocked  = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(sql)) !== null) {
    const statuses = match[1]!
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .filter(Boolean);
    const body = match[2] ?? "";

    if (/RETURN\s+NEW/i.test(body)) {
      for (const s of statuses) freeEdit.add(s);
    } else if (/RAISE\s+EXCEPTION\s+'PC_LOCKED_BY_STATUS/i.test(body)) {
      for (const s of statuses) blocked.add(s);
    }
    // Other IF blocks (e.g. supersede-tuple drift check) are ignored â€”
    // they encode the supersede-only path that's implicit in fall-through.
  }

  return { freeEdit, blocked };
}

// â”€â”€â”€ TS parser: extract status sets from ap.route.ts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Tolerates the legacy sets being removed entirely â€” those checks no-op
// if the constant is gone.

function parseRouteSet(ts: string, name: string): Set<string> | null {
  const re = new RegExp(
    `const\\s+${name}\\s*=\\s*new\\s+Set\\(\\[([^\\]]+)\\]\\)`,
    "i",
  );
  const m = ts.match(re);
  if (!m) return null;
  return new Set(
    m[1]!
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean),
  );
}

// â”€â”€â”€ Cross-check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function checkTrigger(
  freeEdit:    Set<string>,
  blocked:     Set<string>,
): Finding[] {
  const findings: Finding[] = [];
  const matrixStatuses = Object.keys(PC_AFFORDANCE_MATRIX);

  // A status in the trigger's free-edit set should map to matrix.canEdit=true
  for (const status of freeEdit) {
    if (!(status in PC_AFFORDANCE_MATRIX)) {
      findings.push({
        severity: "error",
        source:   "trigger.free_edit",
        status,
        message:  `Trigger lists '${status}' as free-edit but matrix has no entry for it`,
      });
      continue;
    }
    const caps = getPcCapabilities(status, null);
    if (!caps.canEdit || !caps.canDelete) {
      findings.push({
        severity: "error",
        source:   "trigger.free_edit",
        status,
        message:  `Trigger allows free edits on '${status}' but matrix denies canEdit/canDelete`,
      });
    }
  }

  // A status in the trigger's blocked set should map to PC_CAPABILITIES_NONE
  for (const status of blocked) {
    if (!(status in PC_AFFORDANCE_MATRIX)) {
      findings.push({
        severity: "error",
        source:   "trigger.blocked",
        status,
        message:  `Trigger blocks '${status}' but matrix has no entry for it`,
      });
      continue;
    }
    const caps = getPcCapabilities(status, null);
    if (caps.canEdit || caps.canDelete || caps.canSupersede || caps.canAdd) {
      findings.push({
        severity: "error",
        source:   "trigger.blocked",
        status,
        message:  `Trigger raises PC_LOCKED_BY_STATUS on '${status}' but matrix grants `
                + `${describeCaps(caps)} â€” DB will reject these writes`,
      });
    }
  }

  // Statuses in the matrix that the trigger neither allows free-edit nor
  // blocks fall through to "supersede-tuple only". Those must NOT have
  // canEdit / canDelete granted (would 500 at runtime).
  for (const status of matrixStatuses) {
    const entry = PC_AFFORDANCE_MATRIX[status];
    if (entry === "inherit_from_previous_status") continue;
    if (freeEdit.has(status) || blocked.has(status)) continue;

    const caps = getPcCapabilities(status, null);
    if (caps.canEdit || caps.canDelete) {
      // No `known_drift` escape any more â€” the proforma gap that originally
      // motivated it was closed in v3.1 Phase 5b (DDL update to
      // fn_pc_supersede_only_update). Any future trigger revert that knocks
      // a granted status out of the free-edit set now fails CI directly.
      findings.push({
        severity: "error",
        source:   "trigger.supersede_only",
        status,
        message:  `Matrix grants '${status}' canEdit/canDelete but trigger falls through to `
                + `supersede-only mode â€” DB will raise PC_SUPERSEDE_ONLY at runtime.`,
      });
    }
  }

  return findings;
}

function checkRoute(
  routeMutable:   Set<string> | null,
  routeSupersede: Set<string> | null,
): Finding[] {
  const findings: Finding[] = [];
  if (!routeMutable && !routeSupersede) {
    // Both legacy constants removed â€” Phase 1 fully landed.
    return findings;
  }

  for (const status of Object.keys(PC_AFFORDANCE_MATRIX)) {
    const entry = PC_AFFORDANCE_MATRIX[status];
    if (entry === "inherit_from_previous_status") continue;
    const caps = getPcCapabilities(status, null);

    if (routeMutable) {
      const matrixGrantsAdd  = caps.canAdd;
      const matrixGrantsEdit = caps.canEdit && caps.canDelete;
      const inSet = routeMutable.has(status);
      if ((matrixGrantsAdd || matrixGrantsEdit) && !inSet) {
        findings.push({
          severity: "error",
          source:   "route.PC_MUTABLE_STATUSES",
          status,
          message:  `Matrix grants '${status}' canAdd/canEdit but route PC_MUTABLE_STATUSES excludes it`,
        });
      }
      if (!matrixGrantsAdd && !matrixGrantsEdit && inSet) {
        findings.push({
          severity: "error",
          source:   "route.PC_MUTABLE_STATUSES",
          status,
          message:  `Route PC_MUTABLE_STATUSES includes '${status}' but matrix denies canAdd + canEdit`,
        });
      }
    }

    if (routeSupersede) {
      const inSet = routeSupersede.has(status);
      if (caps.canSupersede && !inSet) {
        findings.push({
          severity: "error",
          source:   "route.PC_SUPERSEDE_STATUSES",
          status,
          message:  `Matrix grants '${status}' canSupersede but route PC_SUPERSEDE_STATUSES excludes it`,
        });
      }
      if (!caps.canSupersede && inSet) {
        findings.push({
          severity: "error",
          source:   "route.PC_SUPERSEDE_STATUSES",
          status,
          message:  `Route PC_SUPERSEDE_STATUSES includes '${status}' but matrix denies canSupersede`,
        });
      }
    }
  }
  return findings;
}

function describeCaps(caps: PcCapabilities): string {
  return Object.entries(caps)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ") || "none";
}

function main(): void {
  const triggerSql = readFileSync(TRIGGER_PATH, "utf-8");
  const routeTs    = readFileSync(ROUTE_PATH,   "utf-8");

  const { freeEdit, blocked } = parseTriggerSets(triggerSql);

  if (freeEdit.size === 0 && blocked.size === 0) {
    process.stderr.write(
      "verify-pc-affordance-parity: could not parse trigger sets from "
      + `${TRIGGER_PATH}. Has fn_pc_supersede_only_update been refactored?\n`,
    );
    process.exit(1);
  }

  const triggerFindings = checkTrigger(freeEdit, blocked);
  const routeFindings   = checkRoute(
    parseRouteSet(routeTs, "PC_MUTABLE_STATUSES"),
    parseRouteSet(routeTs, "PC_SUPERSEDE_STATUSES"),
  );

  const all = [...triggerFindings, ...routeFindings];
  const errors      = all.filter((f) => f.severity === "error");
  const knownDrifts = all.filter((f) => f.severity === "known_drift");

  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify({
      trigger: { freeEdit: [...freeEdit], blocked: [...blocked] },
      findings: all,
      errors:      errors.length,
      knownDrifts: knownDrifts.length,
    }, null, 2) + "\n");
  } else {
    process.stdout.write("verify-pc-affordance-parity\n");
    process.stdout.write(`  Trigger free-edit: { ${[...freeEdit].sort().join(", ")} }\n`);
    process.stdout.write(`  Trigger blocked:   { ${[...blocked].sort().join(", ")} }\n`);
    process.stdout.write(`  Matrix statuses:   ${Object.keys(PC_AFFORDANCE_MATRIX).length}\n`);
    if (errors.length === 0 && knownDrifts.length === 0) {
      process.stdout.write("  âœ“ matrix in parity with trigger + route\n");
    }
    if (errors.length > 0) {
      process.stderr.write(`\n  âœ— ${errors.length} parity error(s):\n`);
      for (const f of errors) {
        process.stderr.write(`    [${f.source}] ${f.status}\n`);
        process.stderr.write(`      ${f.message}\n`);
      }
    }
    if (knownDrifts.length > 0) {
      process.stdout.write(`\n  ! ${knownDrifts.length} known drift(s) â€” tracked, do not fail CI:\n`);
      for (const f of knownDrifts) {
        process.stdout.write(`    [${f.source}] ${f.status}\n`);
        process.stdout.write(`      ${f.message}\n`);
      }
    }
  }

  process.exit(errors.length === 0 ? 0 : 1);
}

main();
