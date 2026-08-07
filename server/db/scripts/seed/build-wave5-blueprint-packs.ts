import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const db = resolve(root, "server/db");
const blueprintRoot = resolve(db, "seed/blueprints");
const outputRoot = resolve(db, "seed/packs/blueprints-v2");
const check = process.argv.includes("--check");
const sha = (value: string) => createHash("sha256").update(value.replace(/\r\n?/g, "\n")).digest("hex");
const repoPath = (path: string) => relative(root, path).replace(/\\/g, "/");

type Domain = { order: number; code: string; roots: string[]; dependencies: string[]; preconditions: string[]; plane?: "athyper" | "neon"; tenantScope?: "global" | "tenant" | "none"; requiredSetting?: string };
const domains: Domain[] = [
  { order: 10, code: "spend-taxonomy-business-intents", roots: ["universal/010_spend_taxonomy"], dependencies: [], preconditions: ["master.tenant", "shared.commodity_code", "master.business_intent", "control.commodity_code_classification_policy"] },
  { order: 20, code: "tax-fx", roots: ["universal/020_tax"], dependencies: ["spend-taxonomy-business-intents"], preconditions: ["master.tax_jurisdiction", "master.tax_type", "control.tax_group", "master.fx_rate"] },
  { order: 30, code: "payment-holiday", roots: ["universal/030_payments"], dependencies: ["tax-fx"], preconditions: ["master.holiday_calendar", "master.payment_term"] },
  { order: 40, code: "asset-policies", roots: ["universal/040_assets"], dependencies: ["tax-fx"], preconditions: ["master.asset_class", "control.asset_book_policy"] },
  { order: 50, code: "bank-formats", roots: [], dependencies: [], preconditions: ["control.bank_format_rule", "shared.country", "master.principal"], plane: "athyper", tenantScope: "global", requiredSetting: "app.current_principal_id" },
  { order: 60, code: "coa-frameworks", roots: ["universal/200_coa_frameworks"], dependencies: ["spend-taxonomy-business-intents", "tax-fx"], preconditions: ["master.chart_of_account", "master.gl_account"] },
  { order: 70, code: "organization-templates", roots: ["universal/060_org_structure", "200_industry_org_structure"], dependencies: ["coa-frameworks", "tax-fx"], preconditions: ["master.legal_entity", "master.company_code", "master.org_unit"] },
  { order: 80, code: "people-payroll", roots: ["universal/070_people"], dependencies: ["organization-templates", "payment-holiday", "coa-frameworks"], preconditions: ["master.employee", "master.pay_group"] },
  { order: 90, code: "party-risk-defaults", roots: [], dependencies: [], preconditions: [], tenantScope: "none", requiredSetting: "app.database_plane" },
  { order: 100, code: "industry-packs", roots: ["100_industry_packs"], dependencies: ["organization-templates", "people-payroll", "coa-frameworks"], preconditions: ["master.tenant", "master.company_code"] },
  { order: 110, code: "governance", roots: ["modules/governance"], dependencies: ["organization-templates", "coa-frameworks"], preconditions: ["control.cycle_type", "control.cycle_phase", "control.cycle_task_template"] },
  { order: 120, code: "ap-non-po", roots: ["modules/ap_non_po"], dependencies: ["spend-taxonomy-business-intents", "tax-fx", "payment-holiday", "coa-frameworks", "governance"], preconditions: ["master.accounting_profile", "control.accounting_profile_policy", "authz.permission"] },
  { order: 130, code: "final-validation", roots: ["universal/990_validation"], dependencies: ["ap-non-po"], preconditions: ["master.tenant", "authz.permission", "master.company_code", "master.legal_entity", "master.org_unit", "master.ledger_book"], requiredSetting: "app.seed_tenant_id" },
];

const legacyModels: Record<string, RegExp> = {
  "accounting-policy-aggregate": /\b(?:control\.acct_profile_[a-z_]*|control\.intent_to_accounting_profile_rule)\b/i,
  "cycle-configuration": /\bgovernance\.cycle_[a-z_]+\b/i,
  "authorization-authority": /\bmaster\.auth_(?:scope_target|role|role_permission|group|group_member|group_role|plane_membership)\b/i,
  "commodity-policy": /\b(?:control\.commodity_classification_config|control\.commodity_classification_to_intent_rule|control\.commodity_code_to_category_rule|master\.commodity_classification)\b/i,
  "effective-asset-policy": /\bcontrol\.asset_class_book_policy_template\b/i,
  "mutable-blueprint-registry": /\bcontrol\.blueprint_(?:registry|tenant_application)\b/i,
};
const permanentDdl = /(^|\n)\s*(?:CREATE\s+(?!TEMP(?:ORARY)?\s+)(?:TABLE|INDEX|POLICY|TRIGGER|FUNCTION|SCHEMA|DOMAIN)|ALTER\s+TABLE|DROP\s+(?:POLICY|TRIGGER|FUNCTION|SCHEMA|DOMAIN)|TRUNCATE)\b/i;

async function filesUnder(path: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(child));
    else if (entry.isFile() && entry.name.endsWith(".sql")) found.push(child);
  }
  return found;
}

async function renderDomain(domain: Domain) {
  let paths = domain.code === "bank-formats"
    ? [resolve(db, "ddl/planes/athyper/control/12_bank_format_rule_reference_seed.sql")]
    : (await Promise.all(domain.roots.map(async (part) => (await filesUnder(resolve(blueprintRoot, part))).sort()))).flat();
  if (domain.code === "organization-templates") {
    const organizationOrder = ["/300_org_units.sql", "/301_cost_centers.sql", "/302_profit_centers.sql", "/000_industry_org_templates.sql", "/303_company_code_tax_fx_links.sql"];
    paths = paths.sort((a, b) => organizationOrder.findIndex((suffix) => repoPath(a).endsWith(suffix)) - organizationOrder.findIndex((suffix) => repoPath(b).endsWith(suffix)));
  }
  const payloads = await Promise.all(paths.map(async (path, index) => {
    const sql = await readFile(path, "utf8");
    const executableSql = sql.replace(/--[^\r\n]*/g, "");
    const declaredRewrites = [...sql.matchAll(/--[ \t]*wave5-rewrite-blocker:[ \t]*([a-z0-9-]+)/gi)].map((match) => match[1]!);
    const rewrites = [...new Set([...declaredRewrites, ...Object.entries(legacyModels).filter(([, pattern]) => pattern.test(executableSql)).map(([name]) => name)])];
    return { order: index + 1, path: repoPath(path), sha256: sha(sql), bytes: Buffer.byteLength(sql), permanentDdl: permanentDdl.test(executableSql), requiredRewrites: rewrites };
  }));
  const packChecksum = sha(payloads.map((p) => `${p.path}:${p.sha256}`).join("\n"));
  const blocked = payloads.some((p) => p.permanentDdl || p.requiredRewrites.length);
  const finalValidationAssertions = domain.code === "final-validation"
    ? ["tenant-scope", "semantic"]
    : ["tenant-scope", "expected-count", "orphan", "uniqueness", "semantic", "idempotent-convergence"];
  return {
    contractVersion: "athyper.blueprint-pack.v1", packCode: domain.code, version: "2.0.0", executionOrder: domain.order,
    plane: domain.plane ?? "neon", tenantScope: domain.tenantScope ?? "tenant", compatibleDdl: { contract: "foundation-v2", layers: "02-11" },
    dependencies: domain.dependencies, checksumAlgorithm: "sha256", checksum: packChecksum,
    payloads, preconditions: { requiredSetting: domain.requiredSetting ?? "app.seed_tenant_id", requiredRelations: domain.preconditions, permanentDdlAllowed: false },
    applicationReceipt: { contract: "athyper.blueprint-application-receipt.v1", status: blocked ? "blocked-pending-rewrite" : "pending-validation", receiptPath: `server/db/seed/packs/blueprints-v2/receipts/${domain.order}-${domain.code}.receipt.v1.json` },
    postApplicationAssertions: finalValidationAssertions,
    registryIntegration: { mode: "immutable-pack-metadata", controlTableIntegration: "pending" },
  };
}

async function main() {
  const packs = await Promise.all(domains.map(renderDomain));
  const writes: Array<[string, string]> = [];
  for (const pack of packs) {
    const path = resolve(outputRoot, `${String(pack.executionOrder).padStart(3, "0")}-${pack.packCode}`, "pack.v1.json");
    writes.push([path, `${JSON.stringify(pack, null, 2)}\n`]);
    const receiptPath = resolve(outputRoot, "receipts", `${pack.executionOrder}-${pack.packCode}.receipt.v1.json`);
    if (!await readFile(receiptPath, "utf8").catch(() => null)) {
      const receipt = { contractVersion: "athyper.blueprint-application-receipt.v1", packCode: pack.packCode, packVersion: pack.version, packChecksum: pack.checksum, plane: pack.plane, tenantId: null, status: pack.applicationReceipt.status, appliedAt: null, payloadResults: [], assertionResults: [] };
      writes.push([receiptPath, `${JSON.stringify(receipt, null, 2)}\n`]);
    }
  }
  const ledger = { contractVersion: "athyper.blueprint-pack-ledger.v1", generatedAt: "deterministic-from-repository-content", packs: packs.map((p) => ({ packCode: p.packCode, executionOrder: p.executionOrder, dependencies: p.dependencies, checksum: p.checksum, payloadCount: p.payloads.length, status: p.applicationReceipt.status })) };
  writes.push([resolve(outputRoot, "pack-ledger.v1.json"), `${JSON.stringify(ledger, null, 2)}\n`]);
  for (const [path, content] of writes) {
    if (check) {
      if (await readFile(path, "utf8").catch(() => "") !== content) throw new Error(`stale Wave 5 artifact: ${repoPath(path)}`);
    } else { await mkdir(resolve(path, ".."), { recursive: true }); await writeFile(path, content); }
  }
  console.log(`Wave 5 blueprint contract ${check ? "checked" : "built"}: ${packs.length} packs, ${packs.reduce((n,p)=>n+p.payloads.length,0)} payloads, ${packs.filter((p)=>p.applicationReceipt.status.startsWith("blocked")).length} rewrite-blocked packs.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
