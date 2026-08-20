import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));

async function read(path: string): Promise<string> {
  return readFile(resolve(repoRoot, path), "utf8");
}

const checks: Array<{ name: string; ok: boolean }> = [];
const expect = (name: string, ok: boolean): void => {
  checks.push({ name, ok });
};

const tables = await read("server/db/ddl/common/audit/03_tables.sql");
const domains = await read("server/db/ddl/common/audit/02_domains.sql");
const constraints = await read("server/db/ddl/common/audit/05_constraints.sql");
const indexes = await read("server/db/ddl/common/audit/06_indexes.sql");
const functions = await read("server/db/ddl/common/audit/07_functions.sql");
const triggers = await read("server/db/ddl/common/audit/08_triggers.sql");
const rls = await read("server/db/ddl/common/audit/10_rls.sql");
const grants = await read("server/db/ddl/common/audit/11_grants.sql");
const views = await read("server/db/ddl/common/audit/09_views.sql");
const seed = await read("server/db/ddl/common/audit/12_reference_seed.sql");

const physicalAuditTables = [...tables.matchAll(
  /CREATE TABLE audit\.([a-z][a-z0-9_]*)\s*\(/g,
)]
  .map((match) => match[1])
  .filter((name) => !name.endsWith("_default"));

const expectedTables = [
  "audit_log",
  "authorization_decision_evidence",
  "security_event",
  "hash_anchor",
  "export_request",
  "export_manifest",
  "integrity_check_evidence",
  "legal_hold",
  "legal_hold_manifest",
  "retention_policy",
];

expect(
  "common audit has exactly the governed physical relations",
  JSON.stringify(physicalAuditTables.sort())
    === JSON.stringify(expectedTables.sort()),
);

for (const table of expectedTables) {
  expect(`${table} has forced RLS`, rls.includes(`ALTER TABLE audit.${table} FORCE ROW LEVEL SECURITY`));
  expect(`${table} appears in the sealed audit grants`, grants.includes(`audit.${table}`));
}

for (const table of ["audit_log","authorization_decision_evidence","security_event","hash_anchor","export_manifest","integrity_check_evidence","legal_hold_manifest"]) {
  expect(
    `${table} has an immutable evidence trigger`,
    triggers.includes(`ON audit.${table}`)
      && (
        triggers.includes("trg_guard_immutable_evidence")
        || triggers.includes("trg_guard_audit_log_immutable")
      ),
  );
}

expect("export request scope has a dedicated immutability guard", triggers.includes("trg_export_request_guard") && functions.includes("Audit export request scope is immutable"));
expect("legal holds can only be explicitly released", triggers.includes("trg_legal_hold_guard") && functions.includes("Only release of an active legal hold is allowed"));

expect(
  "ordinary application writes canonical audit only through append_event",
  grants.includes("GRANT EXECUTE ON FUNCTION audit.append_event(")
    && !/GRANT\s+SELECT,\s*INSERT\s+ON\s+audit\.audit_log/s.test(grants),
);
expect(
  "ordinary application cannot manufacture hash anchors",
  !/GRANT\s+SELECT,\s*INSERT[\s\S]{0,200}audit\.hash_anchor/s.test(grants),
);
expect(
  "typed authorization and security evidence retain direct append grants",
  /GRANT\s+SELECT,\s*INSERT\s+ON\s+audit\.authorization_decision_evidence,\s*audit\.security_event/s.test(grants),
);

for (const value of [
  "audit.plane_code_d",
  "audit.outcome_d",
  "audit.event_severity_d",
  "audit.authorization_decision_d",
  "audit.security_category_d",
  "audit.capture_mode_d",
  "audit.event_scope_d",
]) {
  expect(`${value} is a sealed domain`, domains.includes(`CREATE DOMAIN ${value}`));
}

for (const column of [
  "plane_code",
  "source_service",
  "trace_id",
  "span_id",
  "correlation_id",
  "request_id",
  "outcome",
  "occurred_at",
  "recorded_at",
]) {
  expect(
    `telemetry column ${column} is first-class audit evidence`,
    tables.includes(column),
  );
}

expect(
  "authorization evidence has report indexes",
  indexes.includes("authorization_decision_report_idx")
    && indexes.includes("authorization_decision_trace_idx"),
);
expect(
  "security evidence has report indexes",
  indexes.includes("security_event_report_idx")
    && indexes.includes("security_event_trace_idx"),
);
expect(
  "hash anchors are unique per closed evidence window",
  tables.includes("hash_anchor_window_uq UNIQUE NULLS NOT DISTINCT"),
);
expect(
  "hash anchors are created and verified by canonical functions",
  functions.includes("FUNCTION audit.create_hash_anchor(")
    && functions.includes("FUNCTION audit.verify_hash_anchor("),
);
expect(
  "audit partitions have bounded maintenance and health reporting",
  functions.includes("FUNCTION audit.ensure_monthly_partitions(")
    && views.includes("VIEW audit.partition_health")
    && seed.includes("audit.ensure_monthly_partitions"),
);
expect(
  "event patterns control audit operations actors scopes and payloads",
  tables.includes("CREATE TABLE master.audit_event_contract")
    && tables.includes("event_contract_code")
    && functions.includes("No active audit event contract matches")
    && seed.includes("entity_row_change_event"),
);
expect(
  "seeded IAM contracts cover runtime authentication and provisioning evidence",
  seed.includes("authentication\\.(succeeded|failed|denied)")
    && seed.includes("^iam\\.provisioning\\.[a-z][a-z0-9_]*$")
    && seed.includes("'grant','revoke','login','logout'")
    && seed.includes("-- seed-pack-version: 1.1.0"),
);
expect(
  "platform transaction writer uses the granted canonical append function",
  (await read("server/apps/platform-host/src/composition/register-platform.ts"))
    .includes("SELECT audit.append_event(")
    && !(await read("server/apps/platform-host/src/composition/register-platform.ts"))
      .includes("INSERT INTO audit.audit_log"),
);
expect(
  "document audit capture is metadata-only for baseline row changes",
  functions.includes("FUNCTION audit.trg_capture_row_change()")
    && functions.includes("'capture_mode','database_metadata'")
    && !functions.includes("p_old_values=>v_old")
    && !functions.includes("p_new_values=>v_new"),
);
expect(
  "audit payload safety rejects credential-shaped keys",
  functions.includes("FUNCTION audit.payload_is_safe(")
    && functions.includes("private[_-]?key")
    && functions.includes("authorization"),
);
expect(
  "plane spoofing is rejected by evidence preparation",
  functions.match(/does not match database plane/g)?.length === 4,
);
expect(
  "all evidence tables have tenant foreign keys",
  [
    "audit_log_tenant_fk",
    "authorization_decision_tenant_fk",
    "security_event_tenant_fk",
    "hash_anchor_tenant_fk",
  ].every((name) => constraints.includes(name)),
);

const auditPhases = [
  "02_domains.sql",
  "03_tables.sql",
  "05_constraints.sql",
  "06_indexes.sql",
  "07_functions.sql",
  "08_triggers.sql",
  "09_views.sql",
  "10_rls.sql",
  "11_grants.sql",
  "12_reference_seed.sql",
];

for (const manifest of [
  "server/db/ddl/common/_manifest.txt",
  "server/db/ddl/planes/studio/_manifest.txt",
  "server/db/ddl/planes/neon/_manifest.txt",
  "server/db/ddl/planes/mesh/_manifest.txt",
]) {
  const source = await read(manifest);
  expect(
    `${manifest} installs every common audit phase once`,
    auditPhases.every((phase) =>
      source.split(`common/audit/${phase}`).length === 2),
  );
}

for (const plane of ["studio", "neon", "mesh"]) {
  const planeTriggers = await read(
    `server/db/ddl/planes/${plane}/document/08_triggers.sql`,
  );
  expect(
    `${plane} document layer installs canonical row audit capture`,
    planeTriggers.includes("audit.install_schema_row_triggers('document')"),
  );
}

const telemetryRecords = await read(
  "server/packages/contracts/telemetry/src/records.ts",
);
const alloy = await read(
  "stack/config/telemetry/logging/alloy.alloy",
);
expect(
  "shared telemetry contract carries typed trace context",
  telemetryRecords.includes("TelemetryTraceContext = SpanContext")
    && telemetryRecords.includes("readonly trace?: TelemetryTraceContext"),
);
expect(
  "Alloy extracts audit reporting metadata",
  [
    "audit_event_id",
    "event_code",
    "event_class",
    "plane_code",
    "tenant_id",
    "outcome",
    "severity",
    "correlation_id",
  ].every((field) => alloy.includes(`${field} =`)),
);

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  throw new Error(`${failed.length} common audit contract check(s) failed.`);
}

console.log(`Common canonical audit contract verified (${checks.length} checks).`);
