/** Read-only DEV qualification under the deployed database role. SQL authorization
 * sets are controlled test fixtures; this is not authenticated command evidence. */
const [environment, output] = process.argv.slice(2);
if (environment !== "dev" || !output)
  throw Error(
    "Usage: qualify-business-partner-database-adapters.mts dev <report.json>",
  );
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
const require = createRequire(
  new URL("../../../server/apps/platform-host/package.json", import.meta.url),
);
const { Kysely, PostgresDialect } = require("kysely");
const { Pool } = require("pg");
const { createBusinessPartnerStoredScopes } =
  await import("../../../server/apps/platform-host/src/composition/business-partner-stored-scopes.ts");
const { createKyselyContextRefresh } =
  await import("../../../server/packages/platform/iam/src/kysely-context-refresh.ts");
const inspection = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }),
)[0];
const host = (Object.values(inspection.NetworkSettings.Networks)[0] as any)
  .IPAddress;
const password = readFileSync(
  `${homedir()}/.athyper/instances/dev/secrets/runtime-db-password`,
  "utf8",
).trim();
const database = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host,
      user: "athyper_runtime",
      password,
      database: "athyper_neon",
      connectionTimeoutMillis: 4000,
      ssl: false,
    }),
  }),
});
const context = {
  planeKey: "neon",
  realmKey: "neon",
  tenantId: "44444444-4444-4444-8444-444444444444",
  principalId: "cca94907-7519-5871-8e3c-6b11aa545c93",
  authEpoch: 0,
  requestId: "adapter-qualification",
  permissions: { allowed: [] },
  profileHash: "stale",
};
const checks: any[] = [];
try {
  const refresh = createKyselyContextRefresh({
    run: (_identity: any, work: any) => database.transaction().execute(work),
  });
  const current = await refresh(context as never);
  checks.push({
    name: "reload_current_database_permissions",
    passed:
      current.permissions.allowed.includes(
        "neon.relationship.entity_case.create",
      ) && current.profileHash !== "stale",
  });
  try {
    await refresh({ ...context, authEpoch: 99 } as never);
    checks.push({ name: "reject_epoch_substitution", passed: false });
  } catch {
    checks.push({ name: "reject_epoch_substitution", passed: true });
  }
  const scopes = createBusinessPartnerStoredScopes(database, async () => {
    throw Error(
      "Command preflight is not claimed by a read-only ownership test",
    );
  });
  const base = {
    context: current,
    phase: "execute" as const,
    operationKey: "read",
    target: "existing" as const,
  };
  const bp = await scopes.resolve({
    ...base,
    entityCode: "business_partner",
    recordId: "f7688c3d-8c92-5651-a469-da3f4f786375",
    resolver: "tenant.record.v1",
    coordinates: {
      operatingOrganizationId: "24267903-6196-5846-8322-43a8e35c9630",
    },
  });
  checks.push({
    name: "global_bp_ownership_does_not_inherit_shell_organization",
    passed: bp.state === "resolved" && Object.keys(bp.coordinates).length === 0,
  });
  const child = await scopes.resolve({
    ...base,
    entityCode: "entity_case",
    recordId: "2a03927d-7076-4e02-8b1b-181830b49ec5",
    resolver: "organization.record.v1",
    coordinates: {
      operatingOrganizationId: "24267903-6196-5846-8322-43a8e35c9630",
    },
  });
  checks.push({
    name: "child_reads_its_stored_organization",
    passed:
      child.state === "resolved" &&
      child.coordinates.operatingOrganizationId ===
        "a478f9c0-8226-5d22-9599-b8fb27a45180",
  });
  const absent = await scopes.resolve({
    ...base,
    entityCode: "entity_case",
    recordId: "00000000-0000-4000-8000-000000000000",
    resolver: "organization.record.v1",
  });
  checks.push({
    name: "missing_child_closed",
    passed: absent.state === "invalid",
  });
  const cross = await scopes.resolve({
    ...base,
    context: { ...current, tenantId: "00000000-0000-4000-8000-000000000000" },
    entityCode: "business_partner",
    recordId: "f7688c3d-8c92-5651-a469-da3f4f786375",
    resolver: "tenant.record.v1",
  });
  checks.push({
    name: "cross_tenant_owner_closed",
    passed: cross.state === "invalid",
  });
  const { readBusinessPartner360ExplainabilitySection } =
    await import("../../../server/packages/services/master-data/src/kysely-business-partner-360-explainability.ts");
  const { sql } = require("kysely");
  const owned = await database.transaction().execute(async (tx: any) => {
    await sql`SET TRANSACTION READ ONLY`.execute(tx);
    await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true)`.execute(
      tx,
    );
    return (
      await sql`SELECT target_entity_id::text id,id::text case_id FROM document.entity_case WHERE tenant_id=${context.tenantId}::uuid AND target_entity_id IS NOT NULL ORDER BY id LIMIT 1`.execute(
        tx,
      )
    ).rows[0];
  });
  if (owned) {
    for (const allowed of [true, false]) {
      const result = await database.transaction().execute(async (tx: any) => {
        await sql`SET TRANSACTION READ ONLY`.execute(tx);
        await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true)`.execute(
          tx,
        );
        return readBusinessPartner360ExplainabilitySection(
          {
            tenantId: context.tenantId,
            businessPartnerId: owned.id,
            sectionCode: "requests",
            limit: 26,
            cursor: { snapshotAt: new Date().toISOString() },
            authorizeCase: async (id: string) =>
              allowed && id === owned.case_id,
          },
          tx,
        );
      });
      checks.push({
        name: allowed
          ? "sql_case_count_excludes_unauthorized_children"
          : "sql_empty_child_set_has_zero_count",
        passed: allowed
          ? result.items.length === 1 &&
            Number(result.summary?.active ?? 0) <= 1
          : result.items.length === 0 &&
            Object.values(result.summary ?? {}).every((value) => value === 0),
      });
    }
  }
  const { createKyselyRecordRepository } =
    await import("../../../server/packages/services/records/src/kysely-record-repository.ts");
  const { executeAuthorizedAggregate } =
    await import("../../../server/packages/services/records/src/authorized-aggregate.ts");
  const descriptor = {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: "business_partner",
    planeKey: "neon",
    releaseId: "qualification-only",
    releaseNo: 1,
    contractHash: "a".repeat(64),
    compiledHash: "b".repeat(64),
    storage: {
      schema: "master",
      object: "business_partner",
      idField: "id",
      tenantField: "tenant_id",
    },
    fields: [
      {
        key: "id",
        type: "uuid",
        storagePath: "id",
        writableOn: [],
        required: true,
      },
      {
        key: "status",
        type: "string",
        storagePath: "status",
        writableOn: [],
        required: true,
      },
    ],
    operations: {},
  };
  const repository = createKyselyRecordRepository({
    databases: { neon: database },
  });
  for (const allowed of [true, false]) {
    const result = await database.transaction().execute(async (tx: any) => {
      await sql`SET TRANSACTION READ ONLY`.execute(tx);
      await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true)`.execute(
        tx,
      );
      return executeAuthorizedAggregate({
        repository,
        transaction: tx,
        query: {
          descriptor: descriptor as never,
          tenantId: context.tenantId,
          limit: 10,
          countMode: "exact",
          group: "status",
          collectionScope: [],
          cursorScope: "database-sql-qualification",
          projection: ["id", "status"],
          filters: [],
          sort: [],
        },
        authorize: async (id) =>
          allowed && id === "f7688c3d-8c92-5651-a469-da3f4f786375",
      });
    });
    checks.push({
      name: allowed
        ? "generic_sql_aggregate_excludes_hidden_rows"
        : "generic_sql_aggregate_empty_set_is_closed",
      passed:
        result.pagination.total === (allowed ? 1 : 0) &&
        result.data.length === (allowed ? 1 : 0) &&
        result.groups?.reduce(
          (total: number, group: any) => total + group.count,
          0,
        ) === (allowed ? 1 : 0),
    });
  }
  const { createEntityCasePreflight } =
    await import("../../../server/apps/platform-host/src/composition/entity-case-preflight.ts");
  const preflight = await createEntityCasePreflight(database)({
    context: current,
    operationKey: "decide",
    phase: "execute",
    recordId: "2a03927d-7076-4e02-8b1b-181830b49ec5",
  });
  checks.push({
    name: "command_preflight_blocks_baseline_assurance",
    passed: preflight === "workflow_blocked",
  });
  if (checks.some((check) => !check.passed)) process.exitCode = 2;
} catch (error) {
  checks.push({
    name: "adapter_run",
    passed: false,
    error: error instanceof Error ? error.message : "failed",
  });
  process.exitCode = 2;
} finally {
  await database.destroy();
  writeFileSync(
    output,
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        evidence: "database_backed_read_only_adapters",
        authenticatedCommandEvidence: false,
        databaseRole: "athyper_runtime (deployed database role)",
        grantChanges: [],
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(checks));
}
