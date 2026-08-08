import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const db = resolve(root, "server/db");
const failures: string[] = [];
const requireMatch = (value: string, pattern: RegExp, message: string) => { if (!pattern.test(value)) failures.push(message); };

async function main() {
  for (const plane of ["athyper", "neon", "mesh"]) {
    const manifest = await readFile(resolve(db, `ddl/planes/${plane}/_manifest.txt`), "utf8");
    const catalogPath = `planes/${plane}/master/12_platform_catalog_reference_seed.sql`;
    const planPath = `planes/${plane}/control/12_subscription_plan_reference_seed.sql`;
    requireMatch(manifest, new RegExp(`^${catalogPath}$`, "m"), `${plane} manifest omits platform catalog`);
    requireMatch(manifest, new RegExp(`^${planPath}$`, "m"), `${plane} manifest omits subscription plans`);
    const catalog = await readFile(resolve(db, `ddl/${catalogPath}`), "utf8");
    const plans = await readFile(resolve(db, `ddl/${planPath}`), "utf8");
    requireMatch(catalog, /master\.workspace/, `${plane} workspace target missing`);
    requireMatch(catalog, /master\.module/, `${plane} module target missing`);
    requireMatch(catalog, /code <> lower\(code\)/, `${plane} lowercase assertion missing`);
    requireMatch(catalog, /LEFT JOIN master\.workspace/, `${plane} module orphan assertion missing`);
    requireMatch(catalog, /IS DISTINCT FROM/, `${plane} catalog is not convergent`);
    requireMatch(plans, /control\.subscription_plan/, `${plane} subscription target missing`);
    if (/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+shared\.(?:workspace|module|subscription_plan)\b/i.test(catalog + plans)) failures.push(`${plane} pack retains legacy shared catalog target`);
  }
  for (const plane of ["athyper", "neon"]) {
    const manifest = await readFile(resolve(db, `ddl/planes/${plane}/_manifest.txt`), "utf8");
    const permissionPath = `planes/${plane}/authz/12_compiled_permission_reference_seed.sql`;
    requireMatch(manifest, new RegExp(`^${permissionPath}$`, "m"), `${plane} manifest omits compiled permissions`);
    const permission = await readFile(resolve(db, `ddl/${permissionPath}`), "utf8");
    requireMatch(permission, /INSERT INTO authz\.permission/, `${plane} permission target missing`);
    requireMatch(permission, /JOIN master\.module/, `${plane} permission-module binding missing`);
    requireMatch(permission, /status='published'/, `${plane} permission convergence missing`);
  }
  const neonManifest = await readFile(resolve(db, "ddl/planes/neon/_manifest.txt"), "utf8");
  for (const file of ["12_certification_reference_seed.sql", "12_risk_reference_seed.sql", "12_condition_reference_seed.sql"]) {
    requireMatch(neonManifest, new RegExp(`^planes/neon/master/${file}$`, "m"), `Neon manifest omits ${file}`);
  }
  const commonAuthority = await readFile(resolve(db, "ddl/common/master/12_system_authority_reference_seed.sql"), "utf8");
  requireMatch(commonAuthority, /System Tenant/, "common system authority tenant missing");
  requireMatch(commonAuthority, /System Administrator/, "common system authority principal missing");
  const provision = await readFile(resolve(db, "scripts/provision.ts"), "utf8");
  const retiredLegacyPaths: Record<string, string> = {
    "001_owner_type.sql": "seed/platform/003_master/001_owner_type.sql",
    "002_party_risk_registry.sql": "seed/platform/003_master/002_party_risk_registry.sql",
    "003_certification_type.sql": "seed/platform/003_master/003_certification_type.sql",
    "004_condition_type.sql": "seed/platform/003_master/004_condition_type.sql",
    "000_athyper_tenant.sql": "seed/platform/006_system_tenant/000_athyper_tenant.sql",
  };
  for (const source of ["011_workspace.sql", "012_module.sql", "014_subscription_plan.sql", "017_permission.sql", "001_owner_type.sql", "002_party_risk_registry.sql", "003_certification_type.sql", "004_condition_type.sql", "000_athyper_tenant.sql"]) {
    if (retiredLegacyPaths[source]) {
      const retiredSource = await readFile(resolve(db, retiredLegacyPaths[source]), "utf8").catch(() => null);
      if (retiredSource === null) continue;
    }
    requireMatch(provision, new RegExp(source.replace(".", "\\.")), `legacy runtime source remains active: ${source}`);
  }
  const auditFunctions = await readFile(resolve(db, "ddl/common/audit/07_functions.sql"), "utf8");
  for (const code of ["request_revision", "approver_correction", "manual_account_override", "tax_recalculation", "posting_adjustment", "restore_snapshot"]) {
    requireMatch(auditFunctions, new RegExp(`'${code}'`), `audit reason catalog omits stable code ${code}`);
  }
  if (failures.length) throw new Error(`Wave 4 verification failed:\n- ${failures.join("\n- ")}`);
  console.log("Wave 4 platform catalog verified: lowercase plane-local catalogs, compiled permissions, Neon registries, and legacy runtime cutover.");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
