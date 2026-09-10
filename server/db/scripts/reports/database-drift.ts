import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { catalogQueries, catalogMap, compare, type CatalogRow, type Drift } from "../lib/database-catalog.js";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const args = new Map(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.split("=");
    return [key, rest.join("=") || "true"];
  }),
);

if (args.has("--help")) {
  console.log([
    "Usage: tsx scripts/reports/database-drift.ts \\",
    "  --target-url=<clean desired-state database> \\",
    "  --live-url=<current live database> [--plane=studio|neon|mesh] \\",
    "  [--schemas=document,audit,event,ledger,control,master] [--strict] [--json=<path>]",
    "",
    "Environment fallbacks: TARGET_DATABASE_URL and LIVE_DATABASE_URL.",
    "The command is read-only against both databases.",
  ].join("\n"));
  process.exit(0);
}

const targetUrl = args.get("--target-url") ?? process.env.TARGET_DATABASE_URL;
const liveUrl = args.get("--live-url") ?? process.env.LIVE_DATABASE_URL;
if (!targetUrl || !liveUrl) {
  throw new Error("--target-url and --live-url (or their environment fallbacks) are required");
}

const plane = args.get("--plane") ?? "unspecified";
const schemas = (args.get("--schemas") ?? "document,audit,event,ledger,control,master")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const strict = args.has("--strict");

const target = postgres(targetUrl, { max: 1, prepare: false });
const live = postgres(liveUrl, { max: 1, prepare: false });

async function capture(sql: postgres.Sql, query: string): Promise<Map<string, string>> {
  const rows = await sql.unsafe<CatalogRow[]>(query, [schemas]);
  return catalogMap(rows);
}

const skippedDirectories = new Set([
  ".git", "node_modules", "dist", "build", "coverage", ".next", "generated",
]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql"]);

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (sourceExtensions.has(extname(entry.name))) files.push(path);
    }
  }
  await visit(root);
  return files;
}

async function runtimeReferences(targetRelations: Set<string>) {
  const roots = ["server/packages", "packages", "apps"]
    .map((path) => resolve(repoRoot, path));
  const references = new Map<string, Set<string>>();
  const deprecated = new Set([
    "log.audit_log",
    "document.command_log",
    "document.doc_attachment",
    "document.invoice_tax_snapshot",
    "document.party_advance_balance",
    "document.render_job",
  ]);
  const sqlReference = /\b(?:from|join|insert\s+into|update|delete\s+from)\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;

  for (const root of roots) {
    for (const file of await sourceFiles(root)) {
      const source = (await readFile(file, "utf8")).replaceAll('"', "");
      for (const match of source.matchAll(sqlReference)) {
        const relation = match[1]!.toLowerCase();
        const locations = references.get(relation) ?? new Set<string>();
        locations.add(relative(repoRoot, file).replaceAll("\\", "/"));
        references.set(relation, locations);
      }
    }
  }

  return [...references.entries()]
    .map(([relation, locations]) => ({
      relation,
      locations: [...locations].sort(),
      exists_in_target: targetRelations.has(relation),
      deprecated: deprecated.has(relation),
    }))
    .filter((item) => {
      const schema = item.relation.split(".", 1)[0]!;
      return item.deprecated || (schemas.includes(schema) && !item.exists_in_target);
    })
    .sort((a, b) => a.relation.localeCompare(b.relation));
}

try {
  const drift: Record<string, Drift> = {};
  for (const [category, query] of Object.entries(catalogQueries)) {
    const [targetState, liveState] = await Promise.all([
      capture(target, query),
      capture(live, query),
    ]);
    drift[category] = compare(targetState, liveState);
  }

  const relationRows = await target<CatalogRow[]>`
    SELECT format('%I.%I', n.nspname, c.relname) AS object_key,
           c.relkind::text AS definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY(${schemas}::text[])
       AND c.relkind IN ('r','p','v','m')
  `;
  const runtime_sql_references = await runtimeReferences(
    new Set(relationRows.map((row) => row.object_key)),
  );

  const report = {
    generated_at: new Date().toISOString(),
    plane,
    schemas,
    direction: "target desired state compared with live current state",
    drift,
    runtime_sql_references,
  };

  for (const [category, result] of Object.entries(drift)) {
    console.log(
      `${category}: missing=${result.missing_in_live.length} `
      + `extra=${result.extra_in_live.length} changed=${result.changed.length}`,
    );
  }
  console.log(`runtime_sql_references: findings=${runtime_sql_references.length}`);

  const output = args.get("--json");
  if (output && output !== "true") {
    await writeFile(resolve(repoRoot, output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`report=${output}`);
  }

  // Source-reference findings are migration/hygiene hints, not differences
  // between the two database catalogs. Keep them in the report without making
  // an identical target/live comparison fail strict catalog parity.
  const driftCount = Object.values(drift).reduce(
    (sum, item) => sum + item.missing_in_live.length + item.extra_in_live.length + item.changed.length,
    0,
  );
  if (strict && driftCount > 0) process.exitCode = 1;
} finally {
  await Promise.all([target.end(), live.end()]);
}
