/** Explicit rollback-only local engineering check; never a deployed/authenticated receipt. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  Kysely,
  DummyDriver,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
} from "kysely";
import { createBusinessPartnerJournalActivityReader } from "./business-partner-journal-activity.js";
const root = process.cwd();
assert(
  fs.existsSync(
    root +
      "/tooling/scripts/verification/isolated-enter/finance-activity-preview-fixture.sql",
  ),
  "Run from repository root",
);
const seed = fs.readFileSync(
  root +
    "/tooling/scripts/verification/isolated-enter/finance-activity-preview-fixture.sql",
  "utf8",
);
const run = (query: string) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-bp-enter-db",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const fingerprint = () =>
  run(
    "SELECT jsonb_object_agg(name,digest) FROM (" +
      [
        "authz.group_member",
        "authz.group_role",
        "authz.role_permission",
        "authz.deny_rule",
        "authz.plane_membership",
        "runtime_meta.release_activation_head",
        "runtime_meta.applied_release",
        "master.gl_account",
        "document.journal_entry",
        "document.journal_line",
      ]
        .map(
          (t) =>
            `SELECT '${t}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM ${t} r`,
        )
        .join(" UNION ALL ") +
      ") s",
  );
const before = fingerprint();
const compiled: CompiledQuery[] = [];
const connection = {
  async executeQuery(query: CompiledQuery) {
    assert.match(query.sql, /^SELECT\s/);
    compiled.push(query);
    const bound = query.sql.replace(/\$(\d+)/g, (_, n) => {
      const value = query.parameters[Number(n) - 1];
      assert.equal(typeof value, "string");
      return "'" + String(value).replaceAll("'", "''") + "'";
    });
    const rows = JSON.parse(
      run(
        "BEGIN;" +
          seed +
          `SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (${bound}) t;ROLLBACK;`,
      ),
    );
    return { rows };
  },
  async *streamQuery() {
    throw Error("Streaming not supported");
  },
};
class PreviewDriver extends DummyDriver {
  override async acquireConnection() {
    return connection;
  }
}
const db = new Kysely<Record<string, never>>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new PreviewDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});
const reader = createBusinessPartnerJournalActivityReader({
  transactions: { run: async (_actor, work) => work(db) },
  authorize: async () => true,
  now: () => new Date("2026-09-12T05:40:00Z"),
});
const query = {
  actor: {
    tenantId: "44444444-4444-4444-8444-444444444444",
    principalId: "cca94907-7519-5871-8e3c-6b11aa545c93",
    planeKey: "neon" as const,
    correlationId: "preview-rollback",
  },
  businessPartnerId: "01a092d1-8242-7948-9ce9-6f19c38c4b27",
  operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
  companyCodeId: "793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
  asOf: "2026-09-12",
};
const results = [];
try {
  const today = await reader.read(query);
  assert.equal(today.state, "ready");
  assert.deepEqual(
    today.metrics.map((m) => m.value),
    [1, 0],
  );
  results.push({
    label: "duplicate_lines_unrelated_bp_and_future_filtered",
    result: today,
  });
  const tomorrow = await reader.read({ ...query, asOf: "2026-09-13" });
  assert.deepEqual(
    tomorrow.metrics.map((m) => m.value),
    [2, 0],
  );
  results.push({
    label: "later_business_date_adds_second_journal",
    result: tomorrow,
  });
  const yesterday = await reader.read({ ...query, asOf: "2026-09-11" });
  assert.equal(yesterday.state, "empty");
  results.push({ label: "earlier_business_date_empty", result: yesterday });
  const wrong = await reader.read({
    ...query,
    companyCodeId: "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(wrong.reasonCode, "FINANCE_ACTIVITY_CONTEXT_INCOMPATIBLE");
  results.push({ label: "incompatible_company_denied", result: wrong });
} finally {
  await db.destroy();
  assert.equal(
    fingerprint(),
    before,
    "Rollback must preserve all access, activations and journal fixtures",
  );
}
const hash = (path: string) =>
  createHash("sha256")
    .update(fs.readFileSync(root + "/" + path))
    .digest("hex");
const report = {
  createdAt: new Date().toISOString(),
  kind: "local-preview-rollback-sql",
  authenticated: false,
  published: false,
  authorization:
    "Injected allow for SQL engineering only; live Finance permission qualification remains pending.",
  sourceSha256: hash(
    "server/packages/services/finance/src/ledger/business-partner-journal-activity.ts",
  ),
  fixtureSha256: hash(
    "tooling/scripts/verification/isolated-enter/finance-activity-preview-fixture.sql",
  ),
  queries: compiled.length,
  results,
  accessAndDataUnchanged: true,
  complete: true,
};
const output =
  root +
  "/governance/policy/reports/business-partner-finance-activity-preview-v2-20260912.dev.json";
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
  flag: "wx",
});
console.log(JSON.stringify(report, null, 2));
