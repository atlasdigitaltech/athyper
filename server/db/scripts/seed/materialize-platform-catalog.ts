import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const db = resolve(root, "server/db");
const planes = ["athyper", "neon", "mesh"] as const;

async function main() {
  const requiredFiles = planes.flatMap((plane) => [
    `ddl/planes/${plane}/master/12_platform_catalog_reference_seed.sql`,
    `ddl/planes/${plane}/control/12_subscription_plan_reference_seed.sql`,
  ]);

  const missing = requiredFiles.filter((relPath) => !existsSync(resolve(db, relPath)));
  if (missing.length > 0) {
    throw new Error(`Missing Wave 4 DDL seeds: ${missing.join(", ")}`);
  }

  const optional = planes.map((plane) => `ddl/planes/${plane}/authz/12_compiled_permission_reference_seed.sql`);
  const missingOptional = optional.filter((relPath) => !existsSync(resolve(db, relPath)));
  if (missingOptional.length > 0) {
    console.log(
      `Optional Wave 4 permission catalog seeds not present (may be environment-specific): ${missingOptional.join(", ")}`,
    );
  }

  console.log("Wave 4 catalogs are now maintained directly in DDL layer files under server/db/ddl/planes/*.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
