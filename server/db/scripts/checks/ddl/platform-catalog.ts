import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const db = resolve(import.meta.dirname, "../../..");
const failures: string[] = [];
const requireMatch = (value: string, pattern: RegExp, message: string) => { if (!pattern.test(value)) failures.push(message); };
async function required(path: string) {
  return readFile(resolve(db, path), "utf8").catch((error: NodeJS.ErrnoException) => {
    failures.push(`required canonical file is missing: ${path} (${error.code ?? "read error"})`);
    return "";
  });
}

async function main() {
  for (const plane of ["studio", "neon", "mesh"] as const) {
    const manifest = await required(`ddl/planes/${plane}/_manifest.txt`);
    const masterPath = `planes/${plane}/master/12_platform_catalog_reference_seed.sql`;
    const controlPath = `planes/${plane}/control/12_platform_catalog_reference_seed.sql`;
    const planPath = `planes/${plane}/control/12_subscription_plan_reference_seed.sql`;
    for (const path of [masterPath, controlPath, planPath]) {
      requireMatch(manifest, new RegExp(`^${path.replaceAll(".", "\\.")}$`, "m"), `${plane} manifest omits ${path}`);
    }
    const master = await required(`ddl/${masterPath}`);
    const control = await required(`ddl/${controlPath}`);
    const plans = await required(`ddl/${planPath}`);
    requireMatch(master, /INSERT INTO master\.workspace/, `${plane} master workspace target missing`);
    requireMatch(master, /INSERT INTO master\.module/, `${plane} master module target missing`);
    requireMatch(master, /code\s*<>\s*lower\(code\)/, `${plane} lowercase assertion missing`);
    requireMatch(master, /LEFT JOIN master\.workspace/, `${plane} module orphan assertion missing`);
    requireMatch(master, /IS DISTINCT FROM/, `${plane} master catalog is not convergent`);
    requireMatch(control, /INSERT INTO control\.workspace/, `${plane} control workspace projection missing`);
    requireMatch(control, /INSERT INTO control\.module/, `${plane} control module projection missing`);
    requireMatch(control, /FROM master\.module/, `${plane} control catalog is not projected from master`);
    requireMatch(plans, /control\.subscription_plan/, `${plane} subscription target missing`);
    if (/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+shared\.(?:workspace|module|subscription_plan)\b/i.test(master + control + plans)) failures.push(`${plane} pack retains a legacy shared catalog mutation`);
  }

  for (const plane of ["studio", "neon"] as const) {
    const manifest = await required(`ddl/planes/${plane}/_manifest.txt`);
    const permissionPath = `planes/${plane}/authz/14_permission_reference_seed.sql`;
    requireMatch(manifest, new RegExp(`^${permissionPath.replaceAll(".", "\\.")}$`, "m"), `${plane} manifest omits permission references`);
    const permission = await required(`ddl/${permissionPath}`);
    requireMatch(permission, /INSERT INTO authz\.permission/, `${plane} permission target missing`);
    requireMatch(permission, /(?:FROM|JOIN) control\.module/, `${plane} permission-module binding missing`);
    requireMatch(permission, /status\s*=\s*'published'|status='published'/, `${plane} permission convergence missing`);
  }

  const neonManifest = await required("ddl/planes/neon/_manifest.txt");
  for (const file of ["12_certification_reference_seed.sql", "12_risk_reference_seed.sql", "12_condition_reference_seed.sql"]) {
    requireMatch(neonManifest, new RegExp(`^planes/neon/master/${file.replaceAll(".", "\\.")}$`, "m"), `Neon manifest omits ${file}`);
  }
  const authority = await required("ddl/common/master/12_system_authority_reference_seed.sql");
  requireMatch(authority, /System Tenant/, "common system authority tenant missing");
  requireMatch(authority, /System Administrator/, "common system authority principal missing");
  const auditFunctions = await required("ddl/common/audit/07_functions.sql");
  for (const code of ["request_revision", "approver_correction", "manual_account_override", "tax_recalculation", "posting_adjustment", "restore_snapshot"]) {
    requireMatch(auditFunctions, new RegExp(`'${code}'`), `audit reason catalog omits stable code ${code}`);
  }
  if (failures.length) throw new Error(`Platform catalog verification failed:\n- ${failures.join("\n- ")}`);
  console.log("Platform catalog verified for Studio, Neon and Mesh: canonical master catalogs, control projections, permissions and subscription plans.");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
