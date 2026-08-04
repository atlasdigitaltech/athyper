import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Plane = "common" | "athyper" | "neon" | "mesh";
type Disposition = "merge" | "move" | "retire" | "rewrite";
type ConsumerEvidence = Record<Plane, string[]>;
type Override = { plane?: Plane; pack?: string; disposition?: Disposition; rationale?: string };
type LedgerEntry = {
  sourceFile: string; sourceSha256: string; domains: string[]; plane: Plane; classificationBasis: string;
  consumerEvidence: ConsumerEvidence; sealedDomainMatches: Record<string, string | undefined>;
  disposition: Disposition; targetPack: string; standalone: boolean; sourceBytes: number;
  migrationControl: {
    targetReceipt: string | null;
    validationStatus: "pending" | "passed";
    deletionEligible: boolean;
  };
};

const root = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const db = resolve(root, "server/db");
const lookupRoot = resolve(db, "seed/platform/000_lookups/LookupDomain");
const ddlRoot = resolve(db, "ddl");
const output = resolve(db, "seed-migration/wave3-lookup-ledger.v1.json");
const reviewPath = resolve(db, "seed-migration/wave3-lookup-review.v1.json");
const check = process.argv.includes("--check");

const hash = (value: string) => createHash("sha256").update(value.replace(/\r\n?/g, "\n")).digest("hex");
const repoPath = (path: string) => relative(root, path).replace(/\\/g, "/");

async function filesUnder(path: string): Promise<string[]> {
  const found: string[] = [];
  for (const item of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, item.name);
    if (item.isDirectory()) found.push(...await filesUnder(child));
    else if (item.isFile() && item.name.endsWith(".sql")) found.push(child);
  }
  return found;
}

function lookupDomains(sql: string, file: string, registeredDomains: Set<string>): string[] {
  if (/\/(?:000_lookup_domains|010_ai_lookup_domains)\.sql$/.test(file.replace(/\\/g, "/"))) return [];
  return [...new Set([...sql.matchAll(/'([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)'/g)]
    .map((match) => match[1]!).filter((value) => registeredDomains.has(value)))].sort();
}

function declaredDomains(sql: string): string[] {
  return [...new Set([...sql.matchAll(/\bCREATE\s+DOMAIN\s+([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)/gi)]
    .map((match) => match[1]!.toLowerCase()))];
}

function evidenceFor(domains: string[], ddlFiles: Array<{ path: string; sql: string }>): ConsumerEvidence {
  const evidence: ConsumerEvidence = { common: [], athyper: [], neon: [], mesh: [] };
  for (const file of ddlFiles) {
    if (!domains.some((domain) => file.sql.includes(`'${domain}'`) || file.sql.includes(`\"${domain}\"`))) continue;
    const path = repoPath(file.path);
    const plane: Plane | null = path.includes("/ddl/common/") ? "common"
      : path.includes("/ddl/planes/athyper/") ? "athyper"
      : path.includes("/ddl/planes/neon/") ? "neon"
      : path.includes("/ddl/planes/mesh/") ? "mesh" : null;
    if (plane) evidence[plane].push(path);
  }
  for (const plane of Object.keys(evidence) as Plane[]) evidence[plane] = [...new Set(evidence[plane])].sort();
  return evidence;
}

const admin = /(?:^|\.)(?:ai_|entity_|field_|formula_|governance_|mfa_|mutability$|overlay_|ownership_model$|relation_kind$|resolution_event|security_|idp_|principal_|tenant_feature|tenant_module|tenant_subscription|template_|ui_)/;
const network = /(?:^|\.)(?:tenant_relationship|partner_network|network_|delivery_network|exchange_partner)/;
const commonMeaning = /(?:^|\.)(?:notification_|activity_|actor_type$|attachment_|close_activity|export_type$|password_change|security_event|task_type$|workflow_type$|evt_event_type$)/;

function classify(file: string, domains: string[], evidence: ConsumerEvidence): { plane: Plane; basis: string } {
  const active = (Object.keys(evidence) as Plane[]).filter((plane) => evidence[plane].length > 0);
  if (active.includes("common") || active.length > 1) return { plane: "common", basis: "common or multi-plane DDL consumers" };
  if (active.length === 1) return { plane: active[0]!, basis: "single-plane DDL consumer" };
  const joined = domains.join(" ");
  if (network.test(joined)) return { plane: "mesh", basis: "partner-network semantic fallback" };
  if (admin.test(joined)) return { plane: "athyper", basis: "platform administration/metadata semantic fallback" };
  if (commonMeaning.test(joined)) return { plane: "common", basis: "common operational semantic fallback" };
  const normalized = file.replace(/\\/g, "/");
  if (/\/(?:document|finance)\//.test(normalized)) return { plane: "neon", basis: "ERP document/finance semantic fallback" };
  if (/\/(?:event|log|shared)\//.test(normalized)) return { plane: "common", basis: "operational event/log/shared fallback" };
  return { plane: "neon", basis: "ERP master/control fallback; review required" };
}

function packFor(plane: Plane, domains: string[]): string {
  const value = domains.join(" ");
  if (plane === "common") return /notification/.test(value) ? "operations-notification" : /activity|event|task|workflow|attachment|export/.test(value) ? "operations-activity" : "operations-core";
  if (plane === "athyper") return /ai_/.test(value) ? "platform-ai" : /field_|entity_|formula_|relation|overlay|mutability/.test(value) ? "platform-metadata" : /ui_|template/.test(value) ? "platform-experience" : "platform-administration";
  if (plane === "mesh") return "partner-network";
  return /purchase|p2p|invoice|commitment|payment|supplier/.test(value) ? "erp-procure-to-pay"
    : /asset|depreciation|valuation/.test(value) ? "erp-assets"
    : /finance|account|ledger|fiscal|tax|posting|book|chart|cost_center|profit_center/.test(value) ? "erp-finance"
    : /employee|employment|pay_|team|project/.test(value) ? "erp-workforce-projects"
    : "erp-master-data";
}

async function main() {
  const review = JSON.parse(await readFile(reviewPath, "utf8")) as {
    contractVersion: string;
    waveReceipt?: { path: string; validationStatus: "pending" | "passed"; deletionEligible: boolean };
    entries: Record<string, Override>;
  };
  if (review.contractVersion !== "seed-migration.wave3-lookup-review.v1") throw new Error("invalid Wave 3 review contract");
  const sourceFiles = (await filesUnder(lookupRoot)).sort();
  const sourceSql = new Map(await Promise.all(sourceFiles.map(async (path) => [path, await readFile(path, "utf8")] as const)));
  const registrySql = [...sourceSql.values()].filter((sql) => /INSERT\s+INTO\s+control\.lookup_domain\b/i.test(sql));
  const registeredDomains = new Set(registrySql.flatMap((sql) =>
    [...sql.matchAll(/'([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)'/g)].map((match) => match[1]!),
  ));
  const ddlFiles = await Promise.all((await filesUnder(ddlRoot))
    .filter((path) => !path.replace(/\\/g, "/").includes("/control/lookup-packs/"))
    .map(async (path) => ({ path, sql: await readFile(path, "utf8") })));
  const sealed = new Map<string, string>();
  for (const file of ddlFiles) for (const domain of declaredDomains(file.sql)) sealed.set(domain.replace(/_d$/, ""), repoPath(file.path));

  const entries: LedgerEntry[] = [];
  for (const path of sourceFiles) {
    const sql = sourceSql.get(path)!;
    const sourceFile = repoPath(path);
    const domains = lookupDomains(sql, sourceFile, registeredDomains);
    const evidence = evidenceFor(domains, ddlFiles);
    const classification = classify(sourceFile, domains, evidence);
    const override = review.entries[sourceFile];
    const plane = override?.plane ?? classification.plane;
    const sealedMatches = domains.filter((domain) => sealed.has(domain));
    const registry = domains.length === 0;
    const large = Buffer.byteLength(sql) >= 32_768 || domains.length >= 8 || /\b(?:edition|version|standard)\b/i.test(sql.slice(0, 2000));
    const disposition: Disposition = override?.disposition ?? (registry ? "rewrite" : sealedMatches.length === domains.length ? "retire" : large ? "move" : "merge");
    const pack = override?.pack ?? (registry ? `${plane}/lookup-domain-registry` : large ? `${plane}/standalone/${basename(path, ".sql")}` : `${plane}/${packFor(plane, domains)}`);
    entries.push({
      sourceFile, sourceSha256: hash(sql), domains, plane, classificationBasis: override?.rationale ?? classification.basis,
      consumerEvidence: evidence, sealedDomainMatches: Object.fromEntries(sealedMatches.map((domain) => [domain, sealed.get(domain)])),
      disposition, targetPack: pack, standalone: large && disposition !== "retire", sourceBytes: Buffer.byteLength(sql),
      migrationControl: review.waveReceipt
        ? { targetReceipt: review.waveReceipt.path, validationStatus: review.waveReceipt.validationStatus, deletionEligible: review.waveReceipt.deletionEligible }
        : { targetReceipt: null, validationStatus: "pending", deletionEligible: false },
    });
  }
  const unknown = Object.keys(review.entries).filter((path) => !entries.some((entry) => entry.sourceFile === path));
  if (unknown.length) throw new Error(`unknown Wave 3 reviews: ${unknown.join(", ")}`);
  const ledger = {
    contractVersion: "seed-migration.wave3-lookup-ledger.v1", generatedAt: "deterministic-from-repository-content",
    scope: "server/db/seed/platform/000_lookups/LookupDomain/**/*.sql", sourceFiles: entries.length,
    summary: {
      byPlane: Object.fromEntries((["common", "athyper", "neon", "mesh"] as Plane[]).map((plane) => [plane, entries.filter((entry) => entry.plane === plane).length])),
      byDisposition: Object.fromEntries((["merge", "move", "retire", "rewrite"] as Disposition[]).map((value) => [value, entries.filter((entry) => entry.disposition === value).length])),
      targetPacks: [...new Set(entries.map((entry) => entry.targetPack))].sort().length,
      sealedDomainRetirements: entries.filter((entry) => entry.disposition === "retire").length,
    }, entries,
  };
  const rendered = `${JSON.stringify(ledger, null, 2)}\n`;
  if (check) {
    if (await readFile(output, "utf8") !== rendered) throw new Error("Wave 3 lookup ledger is stale; run db:seed:wave3:build");
    console.log(`Wave 3 lookup ledger is current: ${entries.length} files.`);
  } else {
    await writeFile(output, rendered);
    console.log(JSON.stringify(ledger.summary, null, 2));
  }
}

await main();
