#!/usr/bin/env tsx
/**
 * Static verifier for the Mesh-local Wave 0 capture foundation.
 *
 * It never connects to a database and never installs DDL. Live evidence is
 * produced by the two read-only report scripts after capture-only install.
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--help");
if (process.argv.includes("--help")) {
  process.stdout.write(
    "Usage: verify-mesh-authorization-change-capture.ts\n",
  );
  process.exit(0);
}
if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(", ")}`);
}

const dbRoot = fileURLToPath(new URL("../../", import.meta.url));
const ddlRoot = resolve(dbRoot, "ddl");
const scriptRoot = resolve(dbRoot, "scripts");

const files = {
  controlTables: resolve(
    ddlRoot,
    "mesh_control/01z_authorization_migration_controls.sql",
  ),
  controlIndexes: resolve(
    ddlRoot,
    "mesh_control/04z_authorization_migration_controls_indexes.sql",
  ),
  controlRls: resolve(
    ddlRoot,
    "mesh_control/08z_authorization_migration_controls_rls.sql",
  ),
  logTables: resolve(
    ddlRoot,
    "mesh_log/01z_authorization_change_capture.sql",
  ),
  logConstraints: resolve(
    ddlRoot,
    "mesh_log/03z_authorization_change_capture_constraints.sql",
  ),
  logIndexes: resolve(
    ddlRoot,
    "mesh_log/04z_authorization_change_capture_indexes.sql",
  ),
  logFunctions: resolve(
    ddlRoot,
    "mesh_log/05z_authorization_change_capture_functions.sql",
  ),
  logTriggers: resolve(
    ddlRoot,
    "mesh_log/06z_authorization_change_capture_triggers.sql",
  ),
  logViews: resolve(
    ddlRoot,
    "mesh_log/07z_authorization_change_capture_views.sql",
  ),
  logRls: resolve(
    ddlRoot,
    "mesh_log/08z_authorization_change_capture_rls.sql",
  ),
  provisioner: resolve(scriptRoot, "provision-mesh.ts"),
  legacyReport: resolve(
    scriptRoot,
    "reports/report-mesh-authorization-legacy-writes.ts",
  ),
  dataQualityReport: resolve(
    scriptRoot,
    "reports/report-mesh-authorization-data-quality.ts",
  ),
} as const;

const sourceByName = new Map<string, string>();
for (const [name, path] of Object.entries(files)) {
  sourceByName.set(name, await readFile(path, "utf8"));
}
const source = (name: keyof typeof files): string => (
  sourceByName.get(name) ?? ""
);

let failures = 0;
function expect(condition: boolean, message: string): void {
  if (condition) {
    process.stdout.write(`PASS ${message}\n`);
  } else {
    failures += 1;
    process.stderr.write(`FAIL ${message}\n`);
  }
}

const expectedSources = [
  "principal",
  "principal_identity_binding",
  "network_account",
  "account_grant",
  "network_relationship",
  "attachment_acl",
  "content_item_access_grant",
  "conversation_participant",
];

const captureSqlNames = [
  "controlTables",
  "controlIndexes",
  "controlRls",
  "logTables",
  "logConstraints",
  "logIndexes",
  "logFunctions",
  "logTriggers",
  "logViews",
  "logRls",
] as const;
const executableCaptureSql = captureSqlNames
  .map((name) => source(name))
  .join("\n")
  .replace(/--.*$/gm, "");

expect(
  !/\b(?:FROM|JOIN|INTO|UPDATE|REFERENCES|TABLE|FUNCTION|VIEW)\s+(?:master|control|event|document|audit)\s*\./i
    .test(executableCaptureSql),
  "capture DDL has no executable Neon schema dependency",
);
expect(
  !/\btenant_id\b/i.test(executableCaptureSql),
  "capture DDL does not coerce Mesh account scope into Neon tenant UUIDs",
);
expect(
  !/\bfeature_flag\b/i.test(executableCaptureSql),
  "generic Mesh feature flags are not presented as a typed rollout source",
);
expect(
  source("controlTables").includes("scope_kind")
    && source("controlTables").includes("scope_columns")
    && source("logTables").includes("scope_value"),
  "registry and evidence use generalized scope_kind/scope_value",
);

const registryRows = [
  ...source("controlTables").matchAll(
    /\(\s*'mesh',\s*'([a-z0-9_]+)',\s*'(?:identity|scope|authority|record_acl)'/g,
  ),
].map((match) => match[1]).filter((value): value is string => (
  value !== undefined
));
expect(
  registryRows.length === expectedSources.length
    && new Set(registryRows).size === expectedSources.length
    && expectedSources.every((table) => registryRows.includes(table)),
  "source registry contains exactly the eight reviewed Mesh inputs",
);

const expectedShape = new Map<string, string[]>([
  ["principal", ["id"]],
  ["principal_identity_binding", ["id"]],
  ["network_account", ["id", "account_code"]],
  ["account_grant", ["id", "account_id"]],
  [
    "network_relationship",
    ["id", "buyer_account_code", "supplier_account_code"],
  ],
  ["attachment_acl", ["id", "account_code"]],
  ["content_item_access_grant", ["id", "account_code"]],
  ["conversation_participant", ["id", "participant_account_code"]],
]);

async function collectSql(directory: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...await collectSql(path));
    } else if (entry.isFile() && entry.name.endsWith(".sql")) {
      output.push(await readFile(path, "utf8"));
    }
  }
  return output;
}

const meshDdl = (await collectSql(resolve(ddlRoot, "mesh"))).join("\n");
const shapeIssues: string[] = [];
for (const [table, columns] of expectedShape) {
  const marker = `CREATE TABLE IF NOT EXISTS mesh.${table} (`;
  const start = meshDdl.indexOf(marker);
  if (start < 0) {
    shapeIssues.push(`missing table declaration mesh.${table}`);
    continue;
  }
  const next = meshDdl.indexOf("CREATE TABLE IF NOT EXISTS ", start + 1);
  const block = meshDdl.slice(start, next < 0 ? undefined : next);
  for (const column of columns) {
    const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`^\\s*${escaped}\\s+`, "mi").test(block)) {
      shapeIssues.push(`mesh.${table} missing ${column}`);
    }
  }
}
expect(
  shapeIssues.length === 0,
  "all registered primary-key and scope columns exist in Mesh DDL",
);
for (const issue of shapeIssues) {
  process.stderr.write(`  ${issue}\n`);
}

expect(
  source("logTables").includes("authorization_capture_clock")
    && source("logTables").includes("source_database_id")
    && source("logTables").includes("current_watermark"),
  "capture declares a durable Mesh source UUID and watermark",
);
expect(
  source("logFunctions").includes(
    "UPDATE mesh_log.authorization_capture_clock",
  )
    && source("logFunctions").includes("txid_current()")
    && !source("logFunctions").includes("nextval("),
  "watermarks are transactional and rollback-safe, not sequence allocated",
);
expect(
  source("logFunctions").includes("fn_authorization_capture_redact")
    && source("logFunctions").includes("[REDACTED]")
    && source("logFunctions").indexOf(
      "fn_authorization_capture_redact",
    ) < source("logFunctions").indexOf(
      "INSERT INTO mesh_log.authorization_change_event",
    )
    && source("logTables").includes("privacy_redacted"),
  "registered privacy fields are redacted before event persistence",
);
expect(
  source("logTriggers").includes("AFTER INSERT OR UPDATE OR DELETE")
    && source("logTriggers").includes("AFTER TRUNCATE")
    && (
      source("logTriggers").match(
        /ENABLE ALWAYS TRIGGER '\s*[\r\n]*\s*'trg_mesh_authz_wave0_capture_/g,
      )?.length ?? 0
    ) === 2,
  "row and TRUNCATE capture triggers are ENABLE ALWAYS",
);
expect(
  source("logTriggers").includes("LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE")
    && source("logTriggers").indexOf(
      "LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE",
    ) < source("logTriggers").indexOf(
      "CREATE TRIGGER trg_mesh_authz_wave0_capture_row",
    ),
  "trigger installer locks every validated source before trigger creation",
);
expect(
  source("logTriggers").includes("undefined_table")
    && source("logTriggers").includes("undefined_column")
    && source("logTriggers").includes("RAISE EXCEPTION"),
  "source relation/key/scope drift fails the installer closed",
);
expect(
  source("logTriggers").includes("evidence_immutable")
    && source("logRls").includes("REVOKE ALL ON TABLE")
    && source("logFunctions").includes("REVOKE ALL ON FUNCTION"),
  "event/snapshot evidence is immutable and direct PUBLIC access is revoked",
);
expect(
  (source("controlRls").match(/FORCE ROW LEVEL SECURITY/g)?.length ?? 0) === 4
    && (source("logRls").match(/FORCE ROW LEVEL SECURITY/g)?.length ?? 0) === 5,
  "all nine Mesh control/evidence tables force RLS",
);
expect(
  source("logViews").includes("declared_writer_key")
    && source("logViews").includes("writer_match_state")
    && source("logViews").includes("registry.status <> 'approved'"),
  "telemetry requires an explicit approved writer declaration",
);
expect(
  !/INSERT\s+INTO\s+mesh_control\.authorization_writer_registry/i
    .test(executableCaptureSql),
  "Wave 0 seeds no writer approvals",
);
expect(
  source("logFunctions").includes("repeatable read")
    && source("logFunctions").includes(
      "Replay complete source transactions strictly after W0",
    ),
  "snapshot marker enforces the W0 replay protocol",
);

const orderedCapturePaths = [
  "ddl/mesh_control/01z_authorization_migration_controls.sql",
  "ddl/mesh_log/01z_authorization_change_capture.sql",
  "ddl/mesh_log/03z_authorization_change_capture_constraints.sql",
  "ddl/mesh_control/04z_authorization_migration_controls_indexes.sql",
  "ddl/mesh_log/04z_authorization_change_capture_indexes.sql",
  "ddl/mesh_log/05z_authorization_change_capture_functions.sql",
  "ddl/mesh_log/06z_authorization_change_capture_triggers.sql",
  "ddl/mesh_log/07z_authorization_change_capture_views.sql",
  "ddl/mesh_control/08z_authorization_migration_controls_rls.sql",
  "ddl/mesh_log/08z_authorization_change_capture_rls.sql",
];
let lastProvisionIndex = -1;
let provisionOrderValid = true;
const ddlListStart = source("provisioner").indexOf("const ddlRelPaths = [");
const ddlListEnd = source("provisioner").indexOf("];", ddlListStart);
const provisionDdlList = source("provisioner").slice(
  ddlListStart,
  ddlListEnd,
);
for (const path of orderedCapturePaths) {
  const index = provisionDdlList.indexOf(`"${path}"`, lastProvisionIndex + 1);
  if (index <= lastProvisionIndex) {
    provisionOrderValid = false;
    break;
  }
  lastProvisionIndex = index;
}
expect(
  provisionOrderValid,
  "Mesh provisioner declares explicit dependency-ordered capture phases",
);

const atomicFunctionStart = source("provisioner").indexOf(
  "async function runAuthorizationCaptureFiles",
);
const atomicFunctionEnd = source("provisioner").indexOf(
  "function printDiscoveredFiles",
  atomicFunctionStart,
);
const atomicFunction = source("provisioner").slice(
  atomicFunctionStart,
  atomicFunctionEnd,
);
expect(
  atomicFunction.includes('await client.query("BEGIN")')
    && atomicFunction.includes(
      "IN SHARE ROW EXCLUSIVE MODE",
    )
    && atomicFunction.indexOf("IN SHARE ROW EXCLUSIVE MODE")
      < atomicFunction.indexOf("await client.query(sql)")
    && atomicFunction.includes('await client.query("COMMIT")')
    && atomicFunction.includes(
      "mesh_authorization_capture_install_receipt",
    ),
  "--capture-only locks all sources and installs/emits a receipt atomically",
);
expect(
  atomicFunction.includes("source_database_id")
    && atomicFunction.includes("source_watermark")
    && atomicFunction.includes("capture_contract_version")
    && atomicFunction.includes("total_source_count")
    && atomicFunction.includes("source_set_sha256")
    && atomicFunction.includes("expected_source_set_sha256")
    && atomicFunction.includes("always_row_trigger_count")
    && atomicFunction.includes("always_truncate_trigger_count"),
  "capture-only receipt exposes cross-plane correlation fields",
);
expect(
  atomicFunction.includes("expectedDatabase")
    && atomicFunction.includes("approvalTicket")
    && atomicFunction.includes(
      "app.authorization_migration_approval_ticket",
    )
    && atomicFunction.includes("current_database() AS database_name")
    && source("provisioner").includes(
      "--capture-only requires --expected-database=<exact name>",
    ),
  "capture-only requires an exact database identity and approval ticket",
);

const connectionResolverStart = source("provisioner").indexOf(
  "function resolveConnectionString",
);
const connectionResolverEnd = source("provisioner").indexOf(
  "async function main",
  connectionResolverStart,
);
const resolver = source("provisioner").slice(
  connectionResolverStart,
  connectionResolverEnd,
);
expect(
  resolver.includes("if (captureOnly)")
    && resolver.includes("MESH_DATABASE_ADMIN_URL")
    && resolver.includes("MESH_DATABASE_URL")
    && resolver.indexOf("if (captureOnly)")
      < resolver.indexOf("process.env.DATABASE_ADMIN_URL"),
  "--capture-only requires an explicit Mesh URL before any admin fallback",
);
expect(
  [source("legacyReport"), source("dataQualityReport")].every(
    (report) => report.includes("process.env.MESH_DATABASE_URL")
      && !report.includes("process.env.DATABASE_URL"),
  ),
  "live Mesh reports accept only MESH_DATABASE_URL",
);
expect(
  source("legacyReport").includes(
    "wave0.mesh-authorization-legacy-write-report.v1",
  )
    && source("legacyReport").includes("unexpectedRegisteredSources")
    && source("legacyReport").includes("disabledExpectedSources")
    && source("dataQualityReport").includes(
      "wave0.mesh-authorization-data-quality-report.v1",
    )
    && source("dataQualityReport").includes(
      "activeUserIdentityInventory",
    )
    && source("dataQualityReport").includes("captureProvenance")
    && source("dataQualityReport").includes(
      "unclassifiedOrUnresolvedFindings",
    ),
  "reports expose stable schemas for gate correlation",
);

if (failures > 0) {
  process.stderr.write(
    `\n${failures} Mesh authorization capture check(s) failed.\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    "\nMesh authorization change-capture static verification passed.\n",
  );
}
