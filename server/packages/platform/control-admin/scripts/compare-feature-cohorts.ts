/** Read-only rollout eligibility review. Run with tsx; DATABASE_URL stays out of output. */
import { Pool } from "pg";
import { featurePercentageCohort } from "@athyper/server-foundation";

const at = new Date(process.argv[2] ?? "");
if (!Number.isFinite(at.getTime()) || !process.env["DATABASE_URL"])
  throw new Error(
    "Usage: DATABASE_URL=... pnpm exec tsx scripts/compare-feature-cohorts.ts <ISO evaluation instant>",
  );
const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  max: 1,
});
const client = await pool.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  // Fail on insufficient RLS visibility rather than silently reporting incomplete evidence.
  await client.query("SET LOCAL row_security=off");
  await client.query("SET LOCAL statement_timeout='60s'");
  // Compatible with the pre-migration schema. This intentionally compares v1 versus v2,
  // not a proposed mutation. No principal identifiers are included in the report.
  const { rows: flags } = await client.query(
    `SELECT id,code,flag_kind,default_enabled,rollout_pct
    FROM control.feature_flag_catalog WHERE is_active AND rollout_pct > 0 AND rollout_pct < 100
    AND effective_from <= $1 AND (effective_until IS NULL OR effective_until > $1) ORDER BY code`,
    [at],
  );
  const { rows: tenants } = await client.query(
    "SELECT id FROM master.tenant WHERE status='active' ORDER BY id",
  );
  const reports = [];
  for (const tenant of tenants) {
    // Lets a scoped reader see only this tenant's override evidence under RLS.
    await client.query("SELECT set_config('app.current_tenant_id',$1,true)", [
      tenant.id,
    ]);
    const { rows: principals } = await client.query(
      "SELECT id FROM master.principal WHERE tenant_id=$1 AND status='active' ORDER BY id",
      [tenant.id],
    );
    const { rows: overrides } = await client.query(
      `SELECT feature_flag_id,is_enabled FROM control.feature_flag_override
      WHERE tenant_id=$1 AND is_active AND effective_from <= $2 AND (effective_until IS NULL OR effective_until > $2)`,
      [tenant.id, at],
    );
    for (const flag of flags) {
      const override = overrides.find(
        (o) => o.feature_flag_id === flag.id,
      )?.is_enabled;
      const result = {
        tenantId: tenant.id,
        featureCode: flag.code,
        rolloutPct: flag.rollout_pct,
        principals: principals.length,
        retainedEnabled: 0,
        retainedDisabled: 0,
        gained: 0,
        lost: 0,
      };
      for (const principal of principals) {
        const eligibility = (
          strategy: "tenant_sha256_v1" | "principal_fnv1a_v2",
        ) => {
          const catalog =
            flag.default_enabled &&
            featurePercentageCohort(
              strategy,
              tenant.id,
              principal.id,
              flag.code,
            ) < flag.rollout_pct;
          return flag.flag_kind === "kill_switch"
            ? catalog && override !== false
            : (override ?? catalog);
        };
        const before = eligibility("tenant_sha256_v1"),
          after = eligibility("principal_fnv1a_v2");
        result[
          before
            ? after
              ? "retainedEnabled"
              : "lost"
            : after
              ? "gained"
              : "retainedDisabled"
        ]++;
      }
      reports.push(result);
    }
  }
  console.log(
    JSON.stringify(
      {
        at: at.toISOString(),
        comparison: "tenant_sha256_v1 -> principal_fnv1a_v2",
        scope:
          "Rollout eligibility with effective definitions and overrides; excludes module, client-version and identity-binding gates",
        partialFeatures: flags.length,
        tenants: tenants.length,
        reports,
      },
      null,
      2,
    ),
  );
} finally {
  try {
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}
