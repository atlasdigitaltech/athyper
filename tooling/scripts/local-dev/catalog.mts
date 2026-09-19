import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyAuthorizationSeedPack } from "../../../server/db/scripts/provisioning/apply-authorization-seed-pack.js";
const plan = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const password = encodeURIComponent(
  readFileSync(join(plan.root, "secrets/postgres-password"), "utf8").trim(),
);
for (const plane of ["studio", "neon", "mesh"] as const) {
  const result = await applyAuthorizationSeedPack({
    plane,
    catalogOnly: true,
    databaseUrl: `postgresql://postgres:${password}@127.0.0.1:${plan.ports.db}/athyper_${plane}`,
  });
  console.log(JSON.stringify(result));
}
