#!/usr/bin/env node
/**
 * Gate 3 - Legacy DDL schema reference checker.
 *
 * Scans production TypeScript code under server/packages and server/src. The
 * migration advice is intentionally plane-aware: Athyper Admin owns Entity
 * Studio authoring data, while Neon and Mesh only consume published runtime
 * contracts. A legacy relation therefore does not always have one universal
 * replacement.
 *
 * Advisory during Phase 0-2 (continue-on-error: true in CI).
 * Promote to blocking once the production references reported here are gone.
 *
 * Excludes: node_modules, build output, caches, __tests__, test/spec files, and
 * declaration files. Generated database clients remain in scope because stale
 * generated relation types can still be consumed by production runtime code.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const posix = (path) => path.replaceAll("\\", "/");

const FORBIDDEN = [
  {
    ref: "shared.module",
    mappings: {
      athyper: "control.module",
      neon: "control.module",
      mesh: "control.module",
    },
  },
  {
    ref: "shared.workspace",
    mappings: {
      athyper: "control.workspace",
      neon: "control.workspace",
      mesh: "control.workspace",
    },
  },
  {
    ref: "shared.plan_module_access",
    mappings: {
      athyper: "control.subscription_plan_module",
      neon: "control.subscription_plan_module",
      mesh: "control.subscription_plan_module",
    },
  },
  {
    ref: "master.tenant_module_subscription",
    mappings: {
      athyper: "master.tenant.subscription_plan_id + control.subscription_plan_module",
      neon: "master.tenant.subscription_plan_id + control.subscription_plan_module",
      mesh: "master.tenant.subscription_plan_id + control.subscription_plan_module",
    },
  },
  {
    ref: "control.entity_version",
    mappings: {
      athyper: "metadata.entity_change_set (draft), snapshot.entity_contract_revision (checkpoint), metadata.entity_release (published), or snapshot.compiled_artifact (compiled)",
      neon: "published compiled runtime contract (no local authoring table yet)",
      mesh: "runtime_meta.entity_contract",
    },
  },
  {
    ref: "control.entity_operation",
    mappings: {
      athyper: "metadata.entity_operation (authoring) or authz.permission (authorization)",
      neon: "published compiled runtime contract (execution) or authz.permission (authorization)",
      mesh: "runtime_meta.entity_contract.contract_json (execution) or authz.permission (authorization)",
    },
  },
];

const SCAN_ROOTS = [
  join(root, "server", "packages"),
  join(root, "server", "src"),
];

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  ".cache",
  ".git",
  "__tests__",
]);

const TEST_FILE = /(?:^|\.)(?:test|spec)\.tsx?$/i;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const forbidden of FORBIDDEN) {
  forbidden.pattern = new RegExp(
    `(?<![A-Za-z0-9_])${escapeRegExp(forbidden.ref)}(?![A-Za-z0-9_])`,
  );
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (
      path.endsWith(".ts") &&
      !path.endsWith(".d.ts") &&
      !TEST_FILE.test(entry.name)
    ) {
      yield path;
    }
  }
}

const violations = [];
let filesScanned = 0;

for (const scanRoot of SCAN_ROOTS) {
  for (const file of walk(scanRoot)) {
    filesScanned++;
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    const relPath = posix(relative(root, file));

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const trimmed = line.trimStart();

      // Skip pure comment lines. Inline comments remain visible because they can
      // accompany executable SQL and should be reviewed with that statement.
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")
      ) {
        continue;
      }

      for (const forbidden of FORBIDDEN) {
        if (forbidden.pattern.test(line)) {
          violations.push({
            file: relPath,
            line: lineIndex + 1,
            ref: forbidden.ref,
            text: line.trim(),
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  const byRef = new Map();
  for (const violation of violations) {
    if (!byRef.has(violation.ref)) byRef.set(violation.ref, []);
    byRef.get(violation.ref).push(violation);
  }

  const lines = ["Legacy DDL schema references found in production runtime code:", ""];
  for (const [ref, hits] of byRef) {
    const { mappings } = FORBIDDEN.find((entry) => entry.ref === ref);
    lines.push(`  ${ref}`);
    lines.push(`    Athyper Admin: ${mappings.athyper}`);
    lines.push(`    Neon:         ${mappings.neon}`);
    lines.push(`    Mesh:         ${mappings.mesh}`);
    for (const hit of hits) {
      lines.push(`    ${hit.file}:${hit.line}`);
      lines.push(`      ${hit.text}`);
    }
    lines.push("");
  }
  lines.push(
    `${violations.length} violation(s) across ${filesScanned} production files scanned.`,
    "Choose the replacement by data responsibility; do not mechanically rename cross-plane Entity Studio references.",
  );
  console.error(lines.join("\n"));
  process.exit(1);
}

console.log(
  `Legacy schema reference check passed - ${filesScanned} production files scanned, 0 forbidden references found.`,
);
