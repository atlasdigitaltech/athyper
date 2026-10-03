#!/usr/bin/env tsx
/** Read-only three-plane catalog evidence; no credentials or routine bodies are emitted. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import postgres from "postgres";
import { readDefinerContract } from "../../../src/security/security-definer-contract.js";
import { boundaryCatalogQueries, inspectPlaneBoundary, type CatalogQuery } from "../../../src/security/plane-boundary-catalog.js";

const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const container = argument("docker-container");
const output = argument("output");
const inventoryOnly = process.argv.includes("--inventory-only");
const ddlOwner = process.env["SECDEF_DDL_OWNER"]?.trim() || "postgres";
const contract = await readDefinerContract();
const results = [];
for (const plane of ["neon", "studio", "mesh"] as const) {
  const database = `athyper_${plane}`;
  if (container) {
    const statements = Object.values(boundaryCatalogQueries);
    const input = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n${statements.map(statement => `SELECT COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb) FROM (${statement}) result;`).join("\n")}\nCOMMIT;`;
    const raw = execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const rows = raw.trim().split("\n").map(line => JSON.parse(line) as object[]);
    if (rows.length !== statements.length) throw new Error("Incomplete catalog snapshot");
    const query: CatalogQuery = async <Row extends object>(statement: string) => {
      const result = rows[statements.indexOf(statement)];
      if (!result) throw new Error("Unknown catalog query");
      return result as Row[];
    };
    results.push({ plane, ...await inspectPlaneBoundary(query, contract, ddlOwner), snapshot: "repeatable-read read-only transaction" });
  } else {
    const name = { neon: "ATHYPER_NEON_DATABASE_ADMIN_URL", studio: "ATHYPER_PLATFORM_DATABASE_ADMIN_URL", mesh: "ATHYPER_MESH_DATABASE_ADMIN_URL" }[plane];
    const url = process.env[name];
    if (!url) throw new Error(`${name} is required for ${plane}`);
    const sql = postgres(url, { max: 1, onnotice: () => {} });
    try {
      results.push({ plane, ...await sql.begin("isolation level repeatable read read only", async transaction =>
        inspectPlaneBoundary(async <Row extends object>(statement: string) => transaction.unsafe<Row[]>(statement), contract, ddlOwner)), snapshot: "repeatable-read read-only transaction" });
    } finally { await sql.end(); }
  }
  if (results.at(-1)?.identity?.database !== database) throw new Error(`${plane}: unexpected database target`);
}
const report = {
  schemaVersion: "athyper.plane-boundary-catalog/1.0", observedAt: new Date().toISOString(),
  ownershipContractHash: createHash("sha256").update(JSON.stringify(contract)).digest("hex"),
  mode: inventoryOnly ? "inventory" : "qualification", results,
};
const content = `${JSON.stringify(report, null, 2)}\n`;
if (output) await writeFile(output, content); else process.stdout.write(content);
for (const result of results) console.error(`${result.plane}: ${JSON.stringify(result.counts)}; catalogQualified=${result.catalogQualified}; errors=${result.errors.length}`);
if (!inventoryOnly && results.some(result => !result.catalogQualified)) process.exitCode = 1;
